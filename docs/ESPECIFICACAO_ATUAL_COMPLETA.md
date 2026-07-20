# GAOCG App — Especificação Completa do Estado Atual (para reconstrução do zero)

> **Como usar este documento:** este arquivo descreve o app **exatamente como ele funciona hoje** (20/07/2026), extraído diretamente do código-fonte real (frontend `js/*.js`, `index.html`, `css/style.css`, backend `backend/*.gs`) e cruzado com o histórico documentado em `PROGRESS.md`. Ele substitui, em fidelidade, os documentos antigos `docs/documento_requisitos_gaocg.md`, `docs/modelo_dados_gaocg.md` e `docs/PROMPT_BUILD_GAOCG_APP.md` — aqueles descrevem uma versão anterior do produto (com segmentação por "frente", que foi removida) e não devem ser usados como fonte de verdade para uma reconstrução. Use este arquivo como a especificação canônica única.
>
> Objetivo: entregar este documento para outra IA (ex.: Codex) reconstruir o GAOCG App do zero, com o mesmo comportamento, para fins de teste da plataforma.

---

## 1. Visão geral do produto

Aplicação web interna de uso exclusivo da equipe da **Gerência Administrativa Orçamentária dos Contratos de Gestão (GAOCG)**, da Secretaria de Saúde de Pernambuco. Substitui planilhas soltas no acompanhamento do ciclo de pagamento dos Contratos de Gestão de unidades de saúde geridas por OSS (UPAs, UPAEs, Hospitais etc.).

Fluxo de negócio principal:

**Unidades** (cadastro mestre + Valor do C.G./Termos Aditivos) → **SOF** (Solicitação de Ordem Financeira — pedido orçamentário, múltiplas fontes, andamento em 13 etapas fixas) → **Notas de Empenho** (vinculadas a uma fonte do SOF, com alerta de saldo) → **Recibos** (pagamento, parcela dividida, leitura por OCR de Nota de Liquidação/Ordem Bancária).

Complementado por: **Listas Personalizadas** (OSS/Objeto/Andamento/Status geridos pela equipe), **Dashboard**, **Log de Auditoria** e aviso de **edição simultânea**.

Regra de permissão central: **qualquer analista opera qualquer processo** — não existe mais segmentação por "frente" (isso existia numa versão anterior e foi removido). Só a **gestão de usuários** (e edição/exclusão de opções em Listas Personalizadas) é exclusiva do perfil **gerente**.

Volume: centenas de SOF/ano, ~1.000 recibos/ano — não é big data, mas precisa de paginação e boa performance de busca/filtro.

---

## 2. Stack técnica (obrigatória — não decidir por conta própria)

- **Frontend:** HTML + CSS + JavaScript **vanilla**, sem framework, sem build step, publicado via **GitHub Pages**.
- **Backend:** **Google Apps Script**, publicado como Web App (`doGet`/`doPost`), atuando como API JSON. Todo acesso a dados passa por essa API — o frontend nunca acessa o Sheets diretamente.
- **Banco de dados:** **Google Sheets**, uma aba por "tabela", exatamente conforme o modelo de dados da Seção 3.
- **Repositório:** estrutura atual:

```
/
  index.html
  css/style.css
  js/
    api.js, app.js, auth.js, dashboard.js, edicao-simultanea.js,
    listas.js, log-auditoria.js, notas-empenho.js, recibos.js,
    sof.js, unidades.js, usuarios.js
  backend/                 # cópias de referência dos .gs colados no Apps Script
    Auth.gs, Code.gs, Contadores.gs, Dashboard.gs, EdicoesEmAndamento.gs,
    ListasPersonalizadas.gs, LogAuditoria.gs, NotasEmpenho.gs,
    Recibos.gs, Sof.gs, Unidades.gs, Usuarios.gs, Utils.gs
  docs/
  README.md
  PROGRESS.md
```

**Por que essa stack:** zero custo de hospedagem, zero pipeline de build, e a equipe que vai dar manutenção no futuro não é necessariamente composta por desenvolvedores especializados em um framework específico.

### CORS — restrição técnica crítica do Apps Script

Apps Script Web Apps não respondem de forma confiável a um preflight `OPTIONS` (a URL `/exec` redireciona e o navegador rejeita a resposta de preflight). A solução usada é **evitar completamente o preflight**, não resolvê-lo:
- Toda leitura é **GET** (nunca dispara preflight).
- Toda escrita é **POST** com `Content-Type: text/plain;charset=utf-8` — um dos poucos content-types considerados "simples" pelo CORS, então o navegador nunca dispara `OPTIONS`.
- **Nunca usar `application/json` como Content-Type** — isso reintroduz o problema de preflight que este design evita.
- `ContentService` do Apps Script responde sem exigir credenciais, então não há necessidade de cabeçalhos `Access-Control-*` adicionais.

### Latência — restrição de plataforma a respeitar no design de UX

Cada chamada à Web App do Apps Script tem um piso de latência de **~4-5 segundos**, independente do tamanho do payload. Isso é uma característica da plataforma, não um bug a "consertar" com otimização de payload. O que reduz a latência percebida é **minimizar o número de chamadas sequenciais por ação do usuário**, não o tamanho de cada chamada. Todo o design de UI descrito na Seção 6 (abertura otimista de modais, chamadas "silenciosas", cache de 30s em leituras de apoio) existe para mitigar esse piso de latência.

---

## 3. Modelo de dados completo (abas do Google Sheets)

Convenções gerais:
- Nomes de coluna em `snake_case`, idênticos entre planilha, backend e payloads JSON trocados com o frontend — nunca traduzir/reformatar nomes de campo entre camadas.
- Campos copiados de outra tabela no momento da criação (para não depender de referência viva) usam sufixo `_snapshot`.
- Chaves estrangeiras usam sufixo `_id`.
- Datas sempre em ISO (`AAAA-MM-DDTHH:mm:ss`), nunca em formato regional do Sheets, nunca como objeto `Date` nativo trafegando para o frontend.
- Booleans usam o tipo checkbox nativo do Sheets (aparecem como `VERDADEIRO`/`FALSO` na planilha em locale pt-BR).
- IDs sequenciais por prefixo, gerados de forma atômica no backend (nunca no frontend) — ver Seção 3.10 (`Contadores`).
- Toda aba tem, na leitura, um campo interno `_row` (índice 1-based da linha na planilha) usado apenas para localizar a linha em updates — nunca é enviado ao frontend.
- **Proteção contra auto-conversão de tipo do Sheets (crítico, ver Seção 6.1):** toda coluna que não seja explicitamente numérica ou booleana deve ter o formato da célula forçado para texto puro (`'@'`) em toda escrita, para impedir que o Sheets converta silenciosamente valores como `"3.3.50"` ou datas digitadas em data nativa.

### 3.1 `Usuarios`
`id, nome, login, senha_hash, perfil, ativo, data_criacao, data_inativacao`
- `perfil` ∈ `'gerente' | 'analista'`.
- `senha_hash`: formato `"<salt>$<sha256hex>"` — salt aleatório por usuário (UUID), hash = SHA-256(`salt + ':' + senhaPlana`). Sem bcrypt/argon2 (limitação do Apps Script — documentar como trade-off conhecido).
- Booleano: `ativo`.
- `senha_hash` nunca é enviado ao frontend em nenhuma resposta.

### 3.2 `Unidades`
`id, nome, tipo, oss, cnpj, contrato_gestao, valor_contrato_gestao, classificacao_orcamentaria, acao, subacao, gd, ativo, criado_por, data_criacao`
- `tipo`: lista fixa no frontend (não vem de Listas Personalizadas): `UPA, UPAE, Hospital, Carreta, Outro`.
- Numérico: `valor_contrato_gestao`.
- Booleano: `ativo`.
- Unicidade (validada na aplicação, não pelo Sheets): combinação `cnpj` (só dígitos) + `contrato_gestao`.
- `cnpj` validado por formato + dígitos verificadores (algoritmo padrão de CNPJ).
- Campo derivado, nunca persistido, calculado a cada leitura: `parcela_mensal_total = valor_contrato_gestao + soma(UnidadesTA.valor_ta)` da unidade.

### 3.3 `UnidadesTA` (filha de Unidades, 1:N)
`id, unidade_id, objeto_ta, numero_ta, valor_ta, criado_por, data_criacao`
- Numérico: `valor_ta`.
- Lista opcional (pode ser vazia). Substituída por completo (apaga tudo e recria) a cada salvamento da unidade.

### 3.4 `ListasPersonalizadas`
`id, tipo_lista, valor, pausa_contagem_parado, ativo, criado_por, data_criacao`
- `tipo_lista` ∈ `['ANDAMENTO_SOF', 'STATUS_RECIBO', 'OSS', 'OBJETO']`.
- Booleanos: `pausa_contagem_parado`, `ativo`.
- Lista global (não por usuário/perfil): qualquer usuário autenticado **cria** opções; só **gerente** edita/exclui.
- `pausa_contagem_parado`: só relevante para `ANDAMENTO_SOF`/`STATUS_RECIBO` — representa uma espera externa legítima (ex.: "aguardando autorização da CPF") e suprime o destaque de "processo parado" (Seção 5) quando o processo está nessa opção.
- `OBJETO` é uma **lista fechada**: os campos Objeto de SOF e Recibo são `<select>` populados só por esta lista (sem digitação livre/auto-adição) — um Objeto precisa existir aqui antes de poder ser usado num processo.
- **Nota:** `ANDAMENTO_SOF` como tipo de lista continua existindo tecnicamente (infraestrutura de CRUD viva), mas o andamento do SOF na prática usa um **stepper fixo hardcoded no frontend** (13 etapas, Seção 4.2), não esta lista — é infraestrutura vestigial de uma versão anterior, mantenha por compatibilidade mas não é o que dirige o stepper.

### 3.5 `SOF` (Solicitação de Ordem Financeira — Anexo I)
`id, unidade_id, oss_snapshot, cnpj_snapshot, contrato_snapshot, classificacao_orcamentaria_snapshot, acao_snapshot, subacao_snapshot, gd_snapshot, divergente_da_unidade, tipo, sei, sof_numero, periodo_inicio, periodo_fim, andamento, dea, objeto, ta, observacao, planilha_poas, ceo, contrato, completo, criado_por, data_criacao, data_ultima_alteracao_andamento, visualizado_apos_alerta, possui_ne, excluido, excluido_por, excluido_em`
- Booleanos: `divergente_da_unidade, completo, visualizado_apos_alerta, possui_ne, excluido`.
- Campos snapshot (`oss_snapshot, cnpj_snapshot, contrato_snapshot, classificacao_orcamentaria_snapshot, acao_snapshot, subacao_snapshot, gd_snapshot`): copiados da Unidade no momento da criação, editáveis depois independentemente do registro vivo da Unidade. `divergente_da_unidade` = true quando qualquer campo snapshot difere do valor atual na Unidade viva (recalculado a cada criação/edição do SOF).
- `dea`: texto livre no banco, mas a UI restringe a `SIM` / `NÃO` / vazio (dropdown).
- `andamento`: um dos 13 valores fixos do stepper (Seção 4.2).
- `excluido`/`excluido_por`/`excluido_em`: exclusão lógica.
- Derivados (não persistidos): `fontes` (array de `SofFontes`), `total_solicitado` (soma), `dias_parado`, `destacar_parado`, `notas_empenho_numeros` (nas listagens).

### 3.6 `SofFontes` (filha de SOF, 1:N, exige ≥1 linha)
`id, sof_id, fonte, parcela_mensal, total_solicitado, criado_por, data_criacao`
- `fonte` ∈ `['TESOURO', 'SUS', 'Outra']`.
- Numéricos: `parcela_mensal, total_solicitado`.
- Lista obrigatória (≥1 linha), substituída por completo a cada salvamento do SOF.

### 3.7 `NotasEmpenho`
`id, sof_id, tipo, numero_ne, fonte, valor, periodo, arquivo_drive_id, arquivo_url, criado_por, data_criacao`
- `tipo` ∈ `'original' | 'reforco'`.
- Numérico: `valor`.
- `numero_ne`: obrigatório em ambos os tipos, agrupa notas em "cards" na UI. Um `reforco` exige que já exista uma linha `original` com o mesmo `numero_ne` no mesmo `sof_id`.
- Anexo obrigatório, enviado ao Google Drive (pasta dedicada, ver Seção 6.5).
- Criar a primeira NE `original` de um SOF vira `SOF.possui_ne = true` automaticamente (e gera log de auditoria desse campo).

### 3.8 `NotasEmpenhoCronograma` (filha de NotasEmpenho, 1:N, opcional)
`id, nota_empenho_id, mes, valor, criado_por, data_criacao`
- Cronograma de desembolso mensal extraído por OCR do documento da Nota de Empenho — **puramente informativo**, não altera o cálculo do alerta "abaixo da parcela mensal" (que sempre compara com `SofFontes.parcela_mensal`).

### 3.9 `Recibos` (Anexo II)
`id, unidade_id, oss_snapshot, cnpj_snapshot, divergente_da_unidade, tipo_unidade, objeto, instrumento, parcela_contratual, fonte, nota_empenho, competencia, valor_liquidado, valor_pago, nota_liquidacao_drive_id, nota_liquidacao_url, ordem_bancaria, ordem_bancaria_arquivo_drive_id, ordem_bancaria_arquivo_url, numero_processo, observacao, status, parcela_dividida_grupo_id, percentual_parcela_dividida, alerta_divergencia_valores, completo, origem, criado_por, data_criacao, data_ultima_alteracao_status, visualizado_apos_alerta, excluido, excluido_por, excluido_em`
- Booleanos: `divergente_da_unidade, alerta_divergencia_valores, completo, visualizado_apos_alerta, excluido`.
- Numéricos: `parcela_contratual, valor_liquidado, valor_pago, percentual_parcela_dividida`.
- `nota_empenho`: **texto livre, não é FK** — casado por igualdade de string contra `NotasEmpenho.numero_ne` (para subtrair valor liquidado e para join de DEA via o SOF).
- `fonte` ∈ `['TESOURO', 'SUS', 'Outra']` ou vazio — determina qual ramo de opções de `STATUS_RECIBO` aparece no formulário.
- `origem` ∈ `'manual' | 'importacao_inicial'`.
- `parcela_dividida_grupo_id`: id compartilhado no formato `<id-do-primeiro-recibo-do-grupo>-PD`, ligando linhas de pagamento dividido; vazio em recibos de parcela única.
- `percentual_parcela_dividida`: só informativo, não precisa somar 100%.
- Anexos: Nota de Liquidação e Ordem Bancária, cada um numa pasta dedicada do Drive (Seção 6.5).
- `excluido`/`excluido_por`/`excluido_em`: exclusão lógica.

### 3.10 `LogAuditoria`
`id, usuario_id, perfil_usuario, data_hora, tipo_processo, processo_id, dono_processo, campo_alterado, valor_anterior, valor_novo, fora_do_dono, origem`
- Booleano: `fora_do_dono` (true quando quem edita ≠ `dono_processo`, isto é, quem criou o processo).
- `origem` sempre `'edicao_manual'`.
- `tipo_processo`: `'SOF'`, `'Recibo'`, `'NotaEmpenho'` na prática atual (a UI de filtro também lista `Unidade`/`Usuario` como opções, mas nenhuma rotina de Unidades/Usuários grava linhas de log hoje — ao reconstruir, decida se implementa a auditoria completa para essas duas entidades também, o que seria uma melhoria natural em relação ao estado atual).
- Uma linha por campo alterado (diff campo a campo entre estado antigo e novo a cada salvamento).
- Nunca editável/excluível por nenhum perfil.
- A migração histórica de Recibos é a **única exceção** — não gera linhas de log.

### 3.11 `EdicoesEmAndamento`
`tipo_processo, processo_id, usuario_id, iniciado_em, ultimo_heartbeat`
- Sem coluna `id` sintética — chave natural é `(tipo_processo, processo_id)`.
- Uma linha viva por processo sendo editado no momento; apagada ao liberar a edição; **sem expiração automática por tempo** (ver Seção 6 sobre `ultimo_heartbeat`).

### 3.12 `Contadores` (geração atômica de IDs)
`prefixo, proximo`
- `proximo`: numérico, contador atual daquele prefixo.
- Função `proximoId_(nomeAba)` usa um mapa `PREFIXOS_ID` (nome da aba → prefixo de 2-4 letras) para montar o próximo id no formato `PREFIXO-NNNNNN` (6 dígitos, zero-padded), incrementando o contador de forma atômica (usar `LockService` do Apps Script para evitar corrida em gravações concorrentes).

Mapa `PREFIXOS_ID` (reconstruído a partir de evidências no código e no PROGRESS.md):
```
Usuarios: 'USR'
Unidades: 'UNI'
UnidadesTA: 'UTA'
ListasPersonalizadas: 'LST'
SOF: 'SOF'
SofFontes: 'SFT'
NotasEmpenho: 'NE'
NotasEmpenhoCronograma: 'NEC'
Recibos: 'REC'
LogAuditoria: 'LOG'
```
(`EdicoesEmAndamento` não usa id gerado — chave natural composta.)

Exemplo de id: `UNI-000001`, `SOF-000001`, `REC-000001`.

---

## 4. Autenticação e permissões

- **Login**: `POST action=login` com `{login, senha}`. Comparação de login **case-insensitive**. Mensagem de erro **genérica e idêntica** para login inexistente, senha errada ou usuário inativo ("Usuário ou senha incorretos.") — propositalmente para não permitir enumeração de usuários. Sucesso retorna `{token, user: {id, nome, login, perfil}}`.
- **Hash de senha**: SHA-256 com salt aleatório por usuário, formato `salt$hex`. Documentar no README como trade-off conhecido do ambiente Apps Script (sem bcrypt/argon2 nativos).
- **Token**: formato customizado tipo JWT — `base64url(JSON{uid, iat}) + '.' + HMAC-SHA256(payload, TOKEN_SECRET)`. `TOKEN_SECRET` gerado automaticamente no primeiro uso e guardado em Script Properties (nunca no código-fonte). **Sem expiração** — por decisão de produto, não há timeout de inatividade. Toda requisição revalida `ativo`/`perfil` do usuário contra a aba `Usuarios` (com cache de 30s, invalidado imediatamente em qualquer escrita naquele usuário) — desativar um usuário surte efeito em até ~30s mesmo com um token "válido" antigo.
- **Sessão no frontend**: `sessionStorage`, chave `gaocg_sessao` = `{token, user}`. Limpa no logout explícito ou fechamento da aba; não expira por inatividade.
- **Perfis**: `gerente` e `analista`. **Sem segmentação por "frente"** — qualquer analista edita/exclui qualquer SOF ou Recibo, sem restrição de propriedade/segmento. Áreas exclusivas de gerente:
  - Gestão de usuários (criar, editar, inativar, redefinir senha).
  - Editar/excluir opções em Listas Personalizadas (criar é livre para qualquer usuário).
  - Visibilidade completa + filtros no Log de Auditoria (analista só vê as próprias ações, sem filtros).
  - Migração histórica de Recibos (rotina única, executada uma vez).
  - Indicador "edições fora do dono" no Dashboard.
- **"Minha conta"** (modal ao clicar no nome/perfil no topo): mostra Nome (editável por qualquer usuário — troca o nome exibido, não o login), Login (somente leitura), Perfil (somente leitura). Formulário separado de troca de senha exige a senha atual, nova senha ≥6 caracteres, confirmação client-side.
- Toda ação exceto `ping` e `login` exige token válido, inclusive leituras puras.
- Se qualquer resposta de erro contiver a palavra "sessão" (case-insensitive), o frontend força logout automático e volta para a tela de login.

---

## 5. API do backend — todas as rotas

Todo request: `{action, token, ...params}`. **GET** para leituras (querystring), **POST** com `Content-Type: text/plain` para escritas (corpo JSON serializado como texto — ver restrição de CORS na Seção 2). Envelope de resposta uniforme: `{ok:true, data}` ou `{ok:false, error}`.

| action | responsabilidade | perfil exigido |
|---|---|---|
| `ping` | healthcheck | público |
| `login` | autenticação | público |
| `listarUsuarios` / `criarUsuario` / `atualizarUsuario` / `inativarUsuario` / `redefinirSenha` | CRUD de usuários | gerente |
| `alterarMinhaSenha` / `alterarMeuNome` | autoatendimento de conta | qualquer autenticado |
| `listarUnidades` / `criarUnidade` / `atualizarUnidade` / `inativarUnidade` / `reativarUnidade` | CRUD de unidades | qualquer autenticado |
| `listarOpcoes` / `criarOpcao` | leitura e criação de Listas Personalizadas | qualquer autenticado |
| `atualizarOpcao` / `excluirOpcao` | edição/exclusão de Listas Personalizadas | gerente |
| `listarSof` / `obterSof` / `criarSof` / `atualizarSof` / `marcarSofVisualizado` / `excluirSof` | CRUD e ciclo de vida de SOF | qualquer autenticado |
| `listarNotasEmpenhoPorSof` / `listarNotasEmpenho` / `criarNotaEmpenho` / `lerAnexoNotaEmpenho` | Notas de Empenho + OCR | qualquer autenticado |
| `listarRecibos` / `indicadoresRecibos` / `criarRecibo` / `criarGrupoParcelaDivididaRecibo` / `atualizarRecibo` / `marcarReciboVisualizado` / `excluirRecibo` / `lerAnexoRecibo` | Recibos + OCR | qualquer autenticado |
| `migrarRecibosHistorico` | importação única do histórico | gerente |
| `listarLogAuditoria` | consulta de auditoria | qualquer autenticado (com escopo restrito para analista) |
| `abrirEdicao` / `assumirEdicao` / `liberarEdicao` | trava informativa de edição simultânea | qualquer autenticado |
| `obterDashboard` | indicadores agregados | qualquer autenticado |

### 5.1 Comportamento detalhado por função

**Auth**
- `login_`: trim + lowercase no login antes de comparar; mensagem de erro constante independente do motivo da falha.
- `alterarMeuNome`: sanitiza até 200 caracteres, não pode ser vazio; invalida cache do usuário.
- `alterarMinhaSenha`: exige validar a senha atual; nova senha ≥6 caracteres; invalida cache.

**Usuarios** (todas gerente-only)
- `criarUsuario`: nome/login/senha obrigatórios, senha ≥6 caracteres, login único (case-insensitive), `perfil` cai em `analista` a menos que seja exatamente `'gerente'`.
- `atualizarUsuario`: atualização parcial (só os campos presentes no payload); revalida perfil; invalida cache daquele usuário.
- `inativarUsuario`: soft-delete (`ativo=false, data_inativacao=now`); único "delete" de usuário (reativação é a mesma `atualizarUsuario` com `ativo:true`).
- `redefinirSenha`: gerente define nova senha para qualquer usuário, ≥6 caracteres.

**Unidades**
- `criarUnidade`: `nome` e `contrato_gestao` obrigatórios; CNPJ validado (formato + dígito verificador); unicidade CNPJ+contrato_gestao; grava a unidade e substitui a lista de T.A.s (`substituirTasDaUnidade_`, pode ser vazia).
- `atualizarUnidade`: atualização parcial; revalida CNPJ se alterado; reverifica unicidade só se CNPJ ou contrato_gestao estiverem no payload; T.A.s só são substituídos se `dados.tas` estiver presente.
- `inativarUnidade`/`reativarUnidade`: toggle puro de `ativo`. **Inativar uma Unidade NÃO afeta retroativamente SOFs/Recibos existentes** — eles guardam snapshots independentes, não referências vivas.
- Cache de leitura de 30s (Unidades e UnidadesTA), invalidado a cada escrita.

**ListasPersonalizadas**
- `listarOpcoes`: `tipo_lista` deve ser um dos 4 válidos; retorna só `ativo=true`; visível igualmente para qualquer perfil.
- `criarOpcao`: aberto a qualquer usuário autenticado; exige `valor` não vazio.
- `atualizarOpcao`: gerente-only; altera `valor`, `pausa_contagem_parado`, `ativo` (parcial).
- `excluirOpcao`: gerente-only; **exclusão física** da linha (não lógica) — decisão de produto: como SOF/Recibo guardam o texto da opção diretamente na própria linha (não uma FK), remover uma opção não deixa nada órfão em processos já existentes, só deixa de aparecer para novos cadastros.

**SOF**
- `criarSof`: `unidade_id` obrigatório e deve resolver; `sei` validado contra `^\d{10}\.\d{6}\/\d{4}-\d{2}$` se presente; `sof_numero` validado contra `^\d{3}\/\d{4}$` se presente; `fontes` obrigatório (≥1 linha, cada uma com fonte+parcela_mensal+total_solicitado preenchidos); campos snapshot preenchidos automaticamente a partir da Unidade a menos que explicitamente enviados; `divergente_da_unidade` recalculado comparando snapshot vs. Unidade viva; grava o SOF, substitui `SofFontes`, grava uma linha de log (`CRIACAO`).
- `atualizarSof`: mesma validação de SEI/número se presentes; `fontes` só revalidado se a chave estiver no payload; whitelist de campos editáveis; **se `andamento` mudar, reseta `data_ultima_alteracao_andamento=now` e `visualizado_apos_alerta=false`** (reinicia o contador de "parado" e rearma o alerta); `divergente_da_unidade` recalculado a cada save; log de auditoria por diff campo a campo.
- `marcarSofVisualizado`: `visualizado_apos_alerta=true` — chamado de forma "fire-and-forget" sempre que um card é aberto; só remove o destaque visual de "parado", não altera `andamento`.
- `excluirSof`: exclusão lógica (`excluido=true, excluido_por, excluido_em`); rejeita se já excluído; qualquer perfil; gera log (`EXCLUSAO`). **Sem restauração pelo app** — só um administrador direto na planilha reverte.
- `obterSof`: busca de um registro; anexa fontes/total/dias_parado/destacar_parado.
- `listarSof`: filtros combináveis por E lógico — `unidade_id`, `oss` (substring), `objeto` (substring), `dea` (exato), `tipo_unidade` (join via Unidades), `andamento` (exato), `fonte` (qualquer linha de SofFontes bate), e busca livre (`busca`) por substring em todos os campos. Sempre exclui `excluido=true`. Ordenado por `data_criacao` decrescente. Paginado (padrão 20/página). `destacar_parado`/`dias_parado` calculados só na página visível (otimização de performance). Números de NE anexados só quando `possui_ne=true`.
- Regra de "processo parado": `dias_parado = floor((agora - data_ultima_alteracao_andamento||data_criacao) / 1 dia)`; `destacar_parado = dias_parado > 5 E a opção atual de andamento não tem pausa_contagem_parado E NOT visualizado_apos_alerta`.

**Notas de Empenho**
- `criarNotaEmpenho`: SOF deve existir; `tipo` normalizado para `'reforco'` ou `'original'`; `numero_ne` obrigatório (sanitizado, ≤50 chars); `fonte` obrigatório; se `tipo==='reforco'`, precisa já existir uma NE `original` com o mesmo `numero_ne` no mesmo `sof_id`, senão rejeita; `valor` deve ser >0; anexo obrigatório (`arquivoBase64`+`arquivoNome`), enviado à pasta do Drive dedicada; grava linha; log de auditoria (`CRIACAO`); **se for a primeira NE `original` do SOF, vira `SOF.possui_ne=true` e gera um segundo log** (campo `possui_ne`, `false`→`true`).
- `listarNotasEmpenhoPorSof`: filtro simples por `sof_id`, ordenado por `data_criacao` ascendente.
- `listarNotasEmpenho`: agrupa todas as linhas por `numero_ne` em "cards" (original + reforços somados em `valor_bruto`); junta dados do SOF (sei/sof_numero/objeto/unidade_id/oss_snapshot/dea) e da Unidade (tipo); calcula `valor_liquidado` = soma de `Recibos.valor_liquidado` onde `Recibos.nota_empenho === numero_ne`; `valor_atual = valor_bruto - valor_liquidado`; `parcela_mensal_referencia` = soma de `SofFontes.parcela_mensal` filtrada à fonte do grupo dentro daquele SOF; **`alerta = parcela_mensal_referencia > 0 E valor_atual < parcela_mensal_referencia`**; filtros: unidade_id, fonte, oss, objeto, tipo_unidade, dea, busca livre; ordenado com cards em alerta primeiro, depois por numero_ne.
- `lerAnexoNotaEmpenho` (OCR, usado no cadastro standalone de Nova Nota de Empenho): recebe o anexo em base64, roda OCR (mesma pipeline de `extrairTextoOcr_`), extrai:
  - Número da NE: regex baseada no formato do documento (`\b(\d{4}NE\d{6})\b`, ex. `2026NE000418`) — deliberadamente baseada no formato, não em um rótulo como "EMPENHO:", porque esse rótulo também aparece dentro de "DATA DO EMPENHO:" no mesmo documento, causando falso positivo.
  - Cronograma de desembolso mensal: 12 regexes, um por mês (ex. `JANEIRO\s*:?\s*([\d.,]+)`, com `MAR[ÇC]O` para tolerar OCR sem cedilha).
  - Preço total: regex com lookbehind negativo para distinguir do cabeçalho "PREÇO TOTAL" da tabela de itens e casar só com o "TOTAL" do rodapé do documento.
  - Retorna `{ numero_ne, cronograma: [{mes, rotulo, valor}], preco_total, cronograma_diverge_do_total }` — a divergência é só um aviso não bloqueante no frontend.
- `criarNotaEmpenho` aceita `dados.cronograma` opcional (só quando `tipo === 'original'`) e grava cada mês em `NotasEmpenhoCronograma`.

**Recibos**
- `lerAnexoRecibo` (OCR): exige `notaEmpenhoEsperada` não vazio e um arquivo em base64; roda OCR; extrai o número da NE (mesma regex de formato `\b(\d{4}NE\d{6})\b`) e **rejeita se o número extraído for diferente do esperado** (comparação case-insensitive); extrai o valor via regex específica por tipo de documento (`VALOR LIQUIDADO` para Nota de Liquidação, `VALOR LÍQUIDO` para Ordem Bancária); valor parseado por uma função dedicada de parsing monetário BR (remove separador de milhar `.`, converte `,` decimal — diferente de um parser numérico genérico). Chamada no instante em que o arquivo é escolhido, não só no submit.
- `criarRecibo`: unidade obrigatória e deve resolver; monta a linha com snapshots de OSS/CNPJ (default = valores vivos da Unidade se não enviados explicitamente); `divergente_da_unidade` = oss_snapshot≠unidade.oss OU cnpj_snapshot≠unidade.cnpj; anexos opcionais de Nota de Liquidação/Ordem Bancária; `origem='manual'`; grava; log (`CRIACAO`).
- `criarGrupoParcelaDivididaRecibo`: exige ≥2 parcelas; gera um `parcela_dividida_grupo_id` compartilhado (`<id-do-primeiro-recibo>-PD`); para cada parcela, mescla dados base + overrides específicos, cada uma com seus próprios anexos opcionais (documentos diferem por parcela mesmo sendo um único pagamento contratual); grava cada linha, log por parcela; recalcula o alerta de divergência do grupo ao final.
- `atualizarRecibo`: whitelist de campos texto/numéricos; flags explícitas de "remover anexo" (`removerNotaLiquidacaoArquivo`/`removerOrdemBancariaArquivo`) processadas **antes** de qualquer novo upload (permite remover-e-reanexar numa única requisição); **se `status` mudar, reseta `data_ultima_alteracao_status=now`, `visualizado_apos_alerta=false`** (mesmo padrão do andamento do SOF); recalcula `divergente_da_unidade` se oss/cnpj snapshot estiverem no payload; log por diff; recalcula o alerta de divergência de valores.
- `marcarReciboVisualizado`: mesmo padrão fire-and-forget de "visto".
- `excluirRecibo`: exclusão lógica (`excluido=true, excluido_por, excluido_em`), com modal de confirmação em caixa alta no frontend, mesmo padrão de `excluirSof`.
- Cálculo de alerta de divergência (`alerta_divergencia_valores`): por linha, `|valor_liquidado - valor_pago| > 0.01`; em grupo de parcela dividida, também true se a soma de `valor_pago` do grupo ≠ `parcela_contratual` compartilhada (tolerância 0.01). Só regrava linhas cujo flag realmente mudou.
- Filtros de listagem: unidade_id, oss (exato), status (exato), competencia (exato), fonte (exato), tipo_unidade (exato), dea (via join Recibo→NotaEmpenho→SOF.dea por igualdade de `nota_empenho`), substring em objeto/instrumento/nota_empenho/numero_processo, e busca livre global. Sempre exclui `excluido=true`.
- Indicadores: `pendentes` = contagem onde `status !== 'PAGO'`; `total_pago_ano` = soma de `valor_pago` onde `competencia` termina no ano corrente (2 dígitos) — calculados sobre o conjunto filtrado completo (antes da paginação).
- `migrarRecibosHistorico`: gerente-only, insere em massa com `origem='importacao_inicial'`, `criado_por='rotina_importacao_inicial'`, `visualizado_apos_alerta=true` por padrão; **não gera nenhuma linha de LogAuditoria** (decisão de produto explícita); recalcula alertas de grupos de parcela dividida presentes no lote.

**LogAuditoria**
- `registrarLog_`: uma linha por chamada; `fora_do_dono = dono_processo definido E session.id !== dono_processo`.
- `registrarDiferencas_`: compara cada chave de `novo` contra `antigo` (comparação por string), ignorando `_row` e qualquer lista de exclusão do chamador; uma chamada de `registrarLog_` por campo diferente.
- `listarLogAuditoria`: gerente vê tudo com filtros opcionais (usuario_id, tipo_processo, processo_id, fora_do_dono, intervalo de data_hora); analista é **restrito à própria `usuario_id`**, sem outros filtros aplicáveis. Paginado (padrão 50/página), ordenado por `data_hora` decrescente.

**EdicoesEmAndamento**
- `abrirEdicao`: busca uma linha ativa pela chave `(tipo_processo, processo_id)`. Se um usuário DIFERENTE já a detém, retorna `{emEdicaoPorOutro:true, usuario_nome, iniciado_em}` **sem sobrescrever a linha** (não "rouba" a trava). Se não há conflito (vazio, ou mesmo usuário), grava/atualiza a linha com o usuário atual, atualizando `ultimo_heartbeat` (e `iniciado_em` se a linha for nova). **Nada é de fato bloqueado na camada de dados** — isso é puramente um aviso informativo.
- `assumirEdicao`: assume a trava incondicionalmente, independente de quem a detinha (usado após o clique em "Continuar mesmo assim").
- `liberarEdicao`: apaga a linha de trava se existir. Chamado ao fechar o modal por qualquer caminho (Cancelar, X, clique fora, ou fechamento programático após salvar com sucesso); fire-and-forget.
- **Sem expiração por tempo** — `ultimo_heartbeat` é gravado mas nunca comparado contra um timeout em nenhum lugar. Uma aba fechada abruptamente deixa a trava presa até alguém abrir o registro de novo e clicar "Continuar mesmo assim".

**Dashboard**
- `dashboardRecibos_`: filtra Recibos por `competencia` (padrão = mês atual, formato `mmm.aa` em português abreviado); agrupa por `status`, soma `valor_pago`/`valor_liquidado` por status e totais gerais. Soma sempre linha a linha (nunca a partir de `parcela_contratual`, que se repete idêntico em todas as linhas de um grupo de parcela dividida e causaria contagem duplicada).
- `dashboardSofPendenteNe_`: contagem + lista de SOFs com `possui_ne=false`.
- `dashboardParados_`: união de SOFs + Recibos "parados" (mesma regra >5 dias/sem pausa/não visualizado), com `tipo_processo` marcado.
- `obterDashboard`: lê as abas SOF e Recibos uma única vez cada e compartilha entre os três subindicadores (otimização de performance); adiciona `edicoes_fora_do_dono` só para `session.perfil==='gerente'`.

---

## 6. Regras de negócio por módulo (visão funcional/UX)

### 6.1 Unidades
- Obrigatórios: `nome`, CNPJ válido, `contrato_gestao`.
- Unicidade: par (cnpj sem máscara, contrato_gestao).
- "Parcela mensal" = `valor_contrato_gestao + soma(UnidadesTA.valor_ta)` — calculado, nunca gravado, mostrado por card.
- T.A.s são opcionais, adicionados/removidos livremente no formulário (linhas dinâmicas), enviados como lista completa de substituição a cada save.
- Grid de cards. Checkbox "Somente ativas" (marcado por padrão). Clicar no corpo do card expande detalhes inline (sem chamada de rede — usa dados já carregados).
- Exclusão lógica via ícone de lixeira, com modal de confirmação em texto vermelho caixa alta: "TEM CERTEZA QUE QUER EXCLUIR ESSA UNIDADE E TODOS OS SEUS DADOS? SE FIZER ISSO NENHUM USUÁRIO TERÁ ACESSO A ESSAS INFORMAÇÕES!". Unidades inativas continuam aparecendo (com o filtro desmarcado) com um ícone de "Restaurar".
- Inativar uma unidade **não tem efeito retroativo** em SOF/Recibo existentes (eles guardam snapshots independentes).

### 6.2 SOF
- Campos obrigatórios no formulário: OSS, CNPJ, Contrato de Gestão, Ação, Subação, G.D., SEI, Nº SOF, Período início, Período fim, DEA, Objeto, mais ≥1 linha completa de fonte. T.A., CEO e Observação são opcionais.
- Formato de SEI: `NNNNNNNNNN.NNNNNN/AAAA-NN`. Formato de Nº SOF: `NNN/AAAA`.
- Modelo multi-fonte: linhas repetíveis de Fonte (TESOURO/SUS/Outra) / Parcela Mensal / Total Solicitado; selecionar a mesma fonte duas vezes dispara um aviso de confirmação não bloqueante (não impede salvar).
- Autopreenchimento: escolher uma Unidade preenche os 7 campos snapshot a partir do registro vivo; o usuário ainda pode editá-los manualmente depois. Um banner de divergência ("⚠ Um ou mais campos abaixo divergem do cadastro atual da unidade.") aparece quando `divergente_da_unidade` é true.
- **Stepper de andamento**: 13 nós fixos, nesta ordem exata:
  1. `SES-NP_DGPO`
  2. `SES-DGPO`
  3. `SES`
  4. `NAP_POAS`
  5. `SES-GPOAS`
  6. `SES-GORC`
  7. `SES-GPF`
  8. `SES-CEO_GAOCG`
  9. `SES-DGMCG`
  10. `SES-GEMP`
  11. `NE EMITIDA`
  12. `SES-CJCG`
  13. `C.G./T.A. FORMALIZADO`

  Navegação livre entre qualquer nó, para frente ou para trás — única trava: o nó `NE EMITIDA` só fica clicável depois que o SOF tiver `possui_ne=true`. Clicar num nó válido salva imediatamente (auto-save no clique, não espera o botão Salvar do formulário). Barra de progresso = `(índice+1)/13 * 100%`, arredondado.
- Adicionar a primeira Nota de Empenho `original` avança automaticamente o andamento para `NE EMITIDA` se ainda não estiver lá.
- Limite de tamanho de arquivo: 8MB para anexo de NE (aceita `.pdf`, `image/*`).
- Exclusão lógica via lixeira em cada card, com confirmação nativa: "Excluir este processo de SOF? A exclusão pode ser revertida apenas por um administrador diretamente na planilha." — **sem restauração pelo app**.
- Exportação CSV: pega o conjunto filtrado completo (ignora paginação), colunas `id, unidade_id, sei, sof_numero, periodo_inicio, periodo_fim, andamento, objeto, total_solicitado, possui_ne` + coluna `fontes` achatada (`FONTE:valor;FONTE:valor`), com BOM UTF-8, delimitado por ponto-e-vírgula.
- Filtros combináveis (E lógico): busca livre, unidade, OSS, objeto, tipo de unidade, DEA, fonte. Paginação 20/página.
- Card com borda/fundo amarelo quando `destacar_parado`.

### 6.3 Notas de Empenho
- Dois pontos de entrada: (1) mini-formulário embutido dentro do modal de edição de um SOF aberto; (2) modal standalone "+ Nova Nota de Empenho" na tela de Notas de Empenho, com cascata Unidade→SOF→Fonte e leitura por OCR.
- `original`: número digitado (entrada embutida no SOF) ou extraído por OCR (entrada standalone) junto com cronograma de desembolso mensal e preço total. Campos lidos por OCR ficam travados (somente leitura) após a leitura, com link "Remover anexo" para refazer.
- `reforco`: exige selecionar um número de NE `original` já existente para aquele SOF (dropdown, evita reforços órfãos por erro de digitação); apenas valor + anexo, sem OCR.
- Cards agrupados por `numero_ne`, com borda/fundo vermelho quando em alerta (`valor_atual < parcela_mensal_referencia`). Botão "+ Reforço" por card. Link "Ver cronograma de desembolso" (expansível, só aparece se houver cronograma salvo), com aviso não bloqueante se a soma do cronograma divergir do preço total impresso no documento.
- Limite de 8MB em todos os uploads relacionados a NE.
- Filtros: busca livre, unidade, OSS, objeto, tipo de unidade, DEA, fonte — DEA/OSS/tipo_unidade são obtidos via join transitivo através do SOF (não existem como coluna própria em NotasEmpenho).

### 6.4 Recibos
- Autopreenchimento por histórico: escolher Unidade + Objeto busca o Recibo histórico mais recente daquela combinação e copia `instrumento, parcela_contratual, fonte, nota_empenho` (e refiltra o dropdown de Status pela nova fonte).
- Opções de Status são filtradas por Fonte via correspondência de palavra inteira (`\bSUS\b` / `\bTESOURO\b` no texto da opção) — opções só-SUS ficam ocultas quando fonte≠SUS, opções só-TESOURO ficam ocultas quando fonte===SUS; fonte "Outra"/vazio mostra o ramo TESOURO por padrão. Esse filtro só vale nos formulários de criar/editar — o dropdown de Status na barra de filtros mostra todos sem filtrar.
- Fluxo de status pretendido (os valores em si vêm de Listas Personalizadas, tipo `STATUS_RECIBO`, não são hardcoded, mas a progressão intencional documentada é): `ENVIADO DE VOLTA À UNIDADE PARA CORREÇÃO → AGUARDANDO ASSINATURA DO ATESTO → AGUARDANDO LIBERAÇÃO LIQUIDAÇÃO (CLSUS/CLTESOURO) → AGUARDANDO ASSINATURA DA LIQUIDAÇÃO → ENVIADO AO SETOR DE PAGAMENTO (CPAG_TESOURO/CPAG_SUS) → PAGO`.
- Parcela dividida: checkbox "Este pagamento é feito por mais de uma parcela?"; mínimo 2 linhas (validado em ambos os lados); cada linha tem seus próprios anexos opcionais de Nota de Liquidação/Ordem Bancária (documentos diferem por parcela); botão de remover linha só aparece acima de 2 linhas.
- Validação de anexo por OCR no momento da escolha do arquivo: ao anexar uma Nota de Liquidação/Ordem Bancária, chama a validação de OCR imediatamente; em caso de sucesso, trava o campo de valor correspondente (somente leitura) com o valor extraído e um link "🔒 Valor lido do documento. Remover anexo"; em caso de falha (NE errada, documento ilegível), limpa o input de arquivo e mostra o erro, campo de valor permanece editável. Ao editar um recibo com anexo já salvo, o campo já abre travado com link de remoção (que sinaliza a remoção para o próximo save).
- Alerta de divergência de valores calculado no backend (ver Seção 5.1 Recibos).
- **Limitação conhecida a preservar (ou melhorar deliberadamente na reconstrução):** alterar `nota_empenho` de um Recibo depois de já ter um anexo validado por OCR não revalida automaticamente — é preciso remover e reanexar manualmente.
- Cards de indicador ("Pendentes", "Total pago no ano") reativos aos filtros ativos, calculados no backend sobre o conjunto filtrado (antes da paginação).
- Exportação CSV: colunas `id, unidade_id, competencia, status, valor_liquidado, valor_pago, numero_processo, ordem_bancaria, nota_liquidacao_url, ordem_bancaria_arquivo_url, parcela_dividida_grupo_id, percentual_parcela_dividida, origem`.
- Exclusão lógica via ícone de lixeira em cada linha, com modal de confirmação em caixa alta (mesmo padrão de SOF/Unidades).
- Tela é uma **tabela** (não cards, diferente de SOF/Unidades/NE), com linhas destacadas em amarelo quando `destacar_parado` e badge vermelho "!" quando `alerta_divergencia_valores`. Extensa barra de filtros: busca, unidade, OSS, objeto, tipo de unidade, DEA, competência, fonte, status, instrumento, nota de empenho, nº processo.

### 6.5 Anexos / Google Drive
Todo anexo é enviado em base64 pelo frontend e salvo pelo backend em pastas dedicadas do Google Drive (uma pasta por tipo de documento):
- Notas de Empenho → pasta dedicada.
- Notas de Liquidação (Recibo) → pasta dedicada.
- Ordens Bancárias (Recibo) → pasta dedicada.

Ao reconstruir, crie 3 pastas no Drive e guarde seus IDs em Script Properties (nunca hardcoded no código) — não exponha o ID da planilha nem qualquer credencial de acesso no código do frontend.

### 6.6 Listas Personalizadas
- 4 abas na tela: Andamento (SOF), Status (Recibo), OSS, Objeto — só as duas primeiras mostram o checkbox/coluna de "pausa contagem parado".
- Criar: aberto a qualquer usuário autenticado.
- Editar/excluir: gerente-only. Exclusão é **física** (não lógica) — sem risco de órfãos porque SOF/Recibo guardam o texto da opção diretamente, não uma FK.
- Objeto é lista fechada (Seção 3.4).

### 6.7 Dashboard
- Competência padrão = mês atual, formato `mmm.aa` em português.
- Tiles: quantidade de recibos na competência, valor total pago na competência, quantidade de SOF sem NE (`possui_ne=false`), quantidade de processos "parados" (SOF+Recibo combinados). Tile extra (só gerente): `edicoes_fora_do_dono`.
- 3 tabelas de detalhe: Recibos por status (qtd/valor liquidado/valor pago), SOF pendente de NE (SEI/Nº SOF/criado_por), processos parados (tipo/identificação/criado_por/dias parado).
- Sem segmentação de dados por perfil — analista e gerente veem os mesmos números, exceto o tile extra.

### 6.8 Log de Auditoria
- Log append-only a nível de campo: uma linha por campo alterado, por save.
- `fora_do_dono` = quem editou ≠ quem criou o processo.
- Gerente: visibilidade total + filtros (tipo_processo, processo_id, fora_do_dono, intervalo de data). Analista: só as próprias ações, sem controles de filtro.
- Paginado, 50/página.

### 6.9 Edição Simultânea — fluxo completo (UX)
1. Usuário A abre o SOF/Recibo X → `abrirEdicao` grava a trava `(tipo, X)` → A "detém" o registro.
2. Usuário B abre o mesmo registro enquanto A ainda o detém: **o formulário de B abre instantaneamente** com os dados já carregados na lista (UI otimista, sem espera de rede), enquanto `abrirEdicao` roda em segundo plano de forma silenciosa (sem spinner global).
3. Quando essa chamada em segundo plano retorna `emEdicaoPorOutro:true`, injeta um banner amarelo de aviso no topo do modal já aberto de B: "Este processo está sendo editado por **{nome}** desde {data}. Você pode sair e voltar mais tarde, ou continuar mesmo assim (a última gravação prevalece)." com dois botões.
4. **"Sair"**: fecha o modal **sem chamar `liberarEdicao`** — crucial, porque isso evitaria apagar a trava do OUTRO usuário (B nunca chegou a adquiri-la de fato).
5. **"Continuar mesmo assim"**: chama `assumirEdicao` (silencioso), que força a trava para B; remove o banner; B continua editando normalmente.
6. Ao fechar o modal de um registro que o usuário atual **realmente detém** (Cancelar, X, clique fora, ou fechamento após salvar com sucesso), dispara `liberarEdicao` (silencioso) → apaga a linha de trava.
7. Sem expiração por tempo — uma aba fechada abruptamente deixa a trava presa até outra pessoa abrir o registro e clicar "Continuar mesmo assim".
8. Nada é de fato bloqueado na camada de dados — ambos os saves funcionam, "a última gravação prevalece"; é puramente um aviso informativo (decisão de produto fechada, não reabrir).

---

## 7. Telas e fluxos de frontend (visão por módulo)

- **Login**: tela simples de login/senha, sem "esqueci minha senha" (redefinição é feita pelo gerente).
- **Layout geral**: menu lateral fixo no desktop, retrátil (menu hambúrguer, drawer off-canvas) abaixo de 860px de largura, com fundo escurecido que fecha ao clicar fora ou ao navegar. Spinner de carregamento global usa **contador**, não booleano, para não esconder prematuramente durante chamadas sobrepostas. Toast de erro/sucesso no canto, com "piscar" se a mesma mensagem repetir.
- **Unidades**: grid de cards (ver 6.1).
- **Listas Personalizadas**: abas + tabela (ver 6.6).
- **Usuários**: tabela simples, clique na linha para editar; acesso restrito para não-gerente (mostra "Acesso restrito"). Redefinir senha via prompt nativo do navegador.
- **SOF**: barra de filtros + botões "Filtrar"/"Exportar CSV"/"+ Nova SOF"; grid de cards paginado (20/página); stepper de 13 etapas (ver 6.2); seção embutida de Notas de Empenho dentro do modal de edição.
- **Notas de Empenho**: grid de cards agrupados por número de NE, com alerta visual; modal standalone de criação com cascata e OCR.
- **Recibos**: maior tela do app — tiles de indicador, barra de filtros extensa, tabela (não cards) com linhas clicáveis, formulário de criação com autopreenchimento por histórico e bloco de parcela dividida dinâmico.
- **Dashboard**: seletor de competência + botão Atualizar; tiles + 3 tabelas de detalhe.
- **Log de Auditoria**: filtros (só gerente) + tabela paginada (50/página).
- **Responsivo**: abaixo de 640px os grids de 2/3 colunas colapsam para 1 coluna; linhas de parcela dividida empilham verticalmente; tabelas rolam horizontalmente dentro do painel com células `nowrap` (em vez de quebrar/espremer texto); em telas ultrawide o conteúdo tem largura máxima de 1600px centralizada.

---

## 8. Comportamentos e decisões de design a preservar (aprendidos em produção)

Estes pontos vieram de bugs reais já corrigidos ou de decisões deliberadas de performance/produto — **não são obviedades de código, preserve-os conscientemente na reconstrução**:

1. **Proteção de formato de célula contra auto-conversão do Sheets**: toda coluna que não é numérica nem booleana deve ter o formato forçado para texto puro (`'@'`) em toda escrita (não só uma vez no setup) — senão o Sheets converte silenciosamente valores como um G.D. `"3.3.50"` em data (`03/03/1950`), ou um período digitado vira um objeto Date que um `<input type="date">` rejeita ao recarregar. Use sempre o cabeçalho **real** da planilha lido dinamicamente, nunca uma constante hardcoded (uma constante desatualizada foi exatamente a causa raiz original desse bug).
2. **Cuidado ao aplicar a proteção acima em colunas booleanas**: forçar texto (`'@'`) numa coluna booleana transforma o valor na string literal `"true"`/`"false"`, e qualquer checagem direta tipo `if (registro.campo)` no frontend vira sempre verdadeira (string não vazia é truthy em JS) independente do valor real. Colunas booleanas precisam ter o formato explicitamente restaurado para `'General'`, não apenas puladas.
3. **Padrão de snapshot em vez de referência viva**: SOF e Recibo copiam campos da Unidade no momento da criação em vez de fazer join ao vivo — deliberado, para que inativar/editar uma Unidade nunca altere retroativamente registros históricos. O campo `divergente_da_unidade` existe só para **sinalizar** (não corrigir automaticamente) quando o snapshot ficou desatualizado.
4. **Geração de ID atômica e centralizada**: nunca gerar IDs no frontend; usar `LockService` no backend para evitar corrida em criações concorrentes.
5. **CORS resolvido por evitação, não por configuração**: ver Seção 2 — nunca usar `Content-Type: application/json` nas chamadas ao Apps Script.
6. **Chamadas "silenciosas"**: distinguir chamadas de API que devem mostrar o spinner global das que não devem (housekeeping em segundo plano como marcar-como-visto ou liberar trava de edição) — o spinner global fica visualmente acima de modais, então uma chamada "não-silenciosa" desnecessária trava a percepção de performance mesmo sem travar nada de fato.
7. **UI otimista para abrir SOF/Recibo em edição**: renderizar o modal instantaneamente com dados já carregados na lista em memória, e buscar/validar dados secundários (conflito de edição, notas de empenho relacionadas) em paralelo e silenciosamente, injetando avisos/conteúdo no modal já aberto quando a resposta chegar. Evita que o usuário espere múltiplas chamadas sequenciais de ~4-5s cada só para abrir um registro.
8. **Piso de latência do Apps Script (~4-5s por chamada)**: trate como restrição de plataforma; minimize o número de chamadas por ação do usuário, não o tamanho de cada payload.
9. **Cache de 30s em leituras de apoio** (Unidades, Listas Personalizadas, fontes de SOF, T.A.s, etc.), sempre invalidado explicitamente na escrita correspondente — evita padrões N+1 em telas que fazem múltiplos joins.
10. **Parsing de valores monetários em formato BR** (`"1.053.812,42"`) precisa de uma função dedicada que remove separador de milhar `.` antes de trocar `,` por `.` — um parser numérico genérico (que só troca vírgula por ponto) interpreta esse valor errado.
11. **Regex de OCR baseada no formato do dado, não em rótulo textual**: por exemplo, o número da Nota de Empenho é extraído pelo formato `\d{4}NE\d{6}`, não por um rótulo como "EMPENHO:", porque esse rótulo aparece em mais de um lugar no mesmo documento (ex. também dentro de "DATA DO EMPENHO:") e causaria falso positivo.
12. **Nada é bloqueado de verdade na edição simultânea** — é sempre um aviso informativo com "última gravação prevalece", nunca um lock rígido (decisão de produto fechada).
13. **Migração de dados históricos nunca gera entradas de auditoria** — é a única exceção documentada à regra de "100% das edições são logadas".

---

## 9. Fora de escopo (não construir, nem propor proativamente)

- Gerador automático de documentos (Atesto, Liquidação) em PDF/Docs.
- Calendário de prazos com notificação por e-mail.
- Checklist digital de documentos (Anexo VII).
- Relatórios avançados exportáveis além do CSV simples.
- Fluxo de aprovação formal de edição entre usuários (mantenha o modelo de aviso simples de edição simultânea).
- Login via Google OAuth (login simples contra a aba `Usuarios`).
- Telas dedicadas para RPA, Diária, Termo Aditivo/TAC e Emenda Parlamentar — esses pagamentos entram como categorias/campos dentro das telas existentes de SOF e Recibo, sem tela própria.
- Segmentação de permissão por "frente" — foi removida deliberadamente, não reintroduzir.

---

## 10. Definition of Done para a reconstrução

O projeto está pronto para teste quando:

- Todas as funcionalidades descritas nas Seções 5-8 estão implementadas e testáveis manualmente.
- A aplicação está publicada e acessível via GitHub Pages, consumindo a Web App do Apps Script sem erros de CORS.
- O log de auditoria cobre 100% das edições feitas dentro do sistema (exceto a migração histórica, se implementada).
- Existe um README cobrindo: como configurar a planilha do zero (todas as abas da Seção 3, incluindo a aba `Contadores` com o mapa de prefixos), como fazer o deploy do Apps Script, como popular o primeiro usuário gerente, e quaisquer suposições assumidas onde este documento deixou espaço de interpretação (ex.: mapa exato de `PREFIXOS_ID`, nomes exatos das pastas do Drive).
- Todos os comportamentos da Seção 8 foram preservados conscientemente (ou melhorados de forma deliberada e documentada, não perdidos por acidente).
