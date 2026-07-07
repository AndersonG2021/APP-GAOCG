# Modelo de Dados — Abas do Google Sheets (GAOCG App)

## Visão geral e convenções

O banco de dados é o próprio Google Sheets, com uma aba por "tabela". O frontend nunca acessa a planilha diretamente — toda leitura/escrita passa pela API intermediária em Google Apps Script.

Convenções adotadas em todas as abas:

- **Coluna `id`**: identificador único e sequencial dentro da aba (ex.: `SOF-000001`, `REC-000001`), gerado pelo Apps Script no momento da criação — o Sheets não tem autoincremento nativo, então essa geração é responsabilidade do backend.
- **Colunas de auditoria mínima em toda aba de dado operacional**: `criado_por`, `data_criacao`. Alterações posteriores são refletidas na aba `LogAuditoria` (Aba 7), não sobrescrevem o registro original de criação.
- **Campos "snapshot"**: quando um dado é copiado de outra aba no momento do cadastro (ex.: CNPJ da unidade copiado para o SOF), o nome do campo recebe o sufixo `_snapshot` para deixar explícito que é uma cópia congelada, não uma referência viva.
- **Booleans** são representados como `VERDADEIRO`/`FALSO` (nativo do Sheets).
- **Datas/horas** em formato ISO (`AAAA-MM-DD` ou `AAAA-MM-DDTHH:MM:SS`) para evitar ambiguidade de formatação regional do Sheets.

---

## 1. Usuarios

Cadastro de analistas e gerente(s), usado na autenticação (Funcionalidade 1) e na gestão de usuários (Funcionalidade 9).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único (ex.: `USR-000001`) |
| `nome` | texto | Nome completo do usuário |
| `login` | texto | Login usado para autenticação (único) |
| `senha_hash` | texto | Senha com hash aplicado (nunca texto puro) |
| `perfil` | enum | `analista` ou `gerente` |
| `frente` | enum/nulo | `SOF-UPA`, `SOF-UPAE`, `SOF-Hospital`, `Recibo-UPA`, `Recibo-UPAE`, `Recibo-Hospital`, ou vazio se `perfil = gerente` |
| `ativo` | boolean | `FALSO` = inativado ("excluído"), preserva histórico |
| `data_criacao` | data | Data de criação do usuário |
| `data_inativacao` | data/nulo | Preenchido quando o usuário é inativado |

**Regras:** múltiplos usuários podem compartilhar a mesma `frente` (não há unicidade nessa coluna). Login autenticado só é aceito se `ativo = VERDADEIRO`.

---

## 2. Unidades

Cadastro mestre usado para autopreenchimento (Funcionalidade 2).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único (ex.: `UNI-000001`) |
| `nome` | texto | Nome da unidade (ex.: "UPA Cabo") |
| `tipo` | enum | `UPA`, `UPAE`, `Hospital`, `Carreta`, outro |
| `oss` | texto | Sigla da OSS gestora |
| `cnpj` | texto | CNPJ da OSS, com validação de formato |
| `contrato_gestao` | texto | Número do contrato de gestão (ex.: `CG 005/2022`) |
| `classificacao_orcamentaria` | texto | Classificação orçamentária vigente |
| `acao` | texto | Código de ação orçamentária vigente da unidade |
| `subacao` | texto | Código de subação orçamentária vigente da unidade |
| `gd` | texto | G.D. — Grupo de Despesa vigente da unidade |
| `ativo` | boolean | `FALSO` = inativada, não aparece mais para seleção em novos processos |
| `criado_por` | texto | `id` do usuário que cadastrou |
| `data_criacao` | data | Data de criação |

**Regras:** duplicidade bloqueada por combinação `cnpj` + `contrato_gestao`. Inativar não afeta processos (SOF/Recibo) já criados, pois estes guardam **snapshot** dos dados da unidade, não uma referência viva. Os campos `oss`, `cnpj`, `contrato_gestao`, `classificacao_orcamentaria`, `acao`, `subacao` e `gd` são os campos usados no autopreenchimento (Funcionalidade 2) ao criar um novo processo de SOF ou Recibo.

---

## 3. ListasPersonalizadas

Opções de "andamento" (SOF) e "status" (Recibo), com escopo por frente (Funcionalidades 3 e 4).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único (ex.: `LST-000001`) |
| `tipo_lista` | enum | `ANDAMENTO_SOF` ou `STATUS_RECIBO` |
| `frente` | enum | Frente à qual a opção pertence (ex.: `SOF-UPA`) — define a quem a opção fica visível |
| `valor` | texto | Texto da opção (ex.: "NE EMITIDA", "PAGO") |
| `pausa_contagem_parado` | boolean | `VERDADEIRO` quando esta opção representa uma **espera externa conhecida** (ex.: "AGUARDANDO AUTORIZAÇÃO CPF"), que pode legitimamente durar semanas/meses. Enquanto um processo estiver com `andamento`/`status` igual a uma opção marcada assim, o destaque de "parado" (Funcionalidade 8) não é exibido para ele, independentemente do tempo transcorrido. Padrão `FALSO` |
| `ativo` | boolean | Permite desativar uma opção sem apagar o histórico de processos que já a usam |
| `criado_por` | texto | `id` do usuário que cadastrou a opção |
| `data_criacao` | data | Data de criação |

**Regras:** ao exibir as opções disponíveis para um analista, o sistema filtra por `tipo_lista` + `frente = frente do usuário`. O gerente vê a união de todas as frentes. Uma opção nova criada por um analista de `SOF-UPA` nunca aparece para `SOF-UPAE` ou `SOF-Hospital`. Quem cadastra a opção define `pausa_contagem_parado` no momento da criação (padrão `FALSO`); o gerente pode corrigir essa marcação depois em qualquer opção, de qualquer frente.

---

## 4. SOF

Processos de SOF (Anexo I) — Funcionalidade 3.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único (ex.: `SOF-000001`) |
| `unidade_id` | texto (FK) | Referência à aba `Unidades` |
| `oss_snapshot` | texto | Cópia da OSS da unidade no momento do cadastro (editável manualmente, com alerta) |
| `cnpj_snapshot` | texto | Cópia do CNPJ da unidade (idem) |
| `contrato_snapshot` | texto | Cópia do contrato de gestão da unidade (idem) |
| `classificacao_orcamentaria_snapshot` | texto | Cópia da classificação orçamentária (idem) |
| `acao_snapshot` | texto | Cópia do código de ação orçamentária da unidade (idem) |
| `subacao_snapshot` | texto | Cópia do código de subação da unidade (idem) |
| `gd_snapshot` | texto | Cópia do G.D. (Grupo de Despesa) da unidade (idem) |
| `divergente_da_unidade` | boolean | `VERDADEIRO` se algum campo snapshot (incluindo `acao_snapshot`, `subacao_snapshot` e `gd_snapshot`) foi editado manualmente e diverge do cadastro atual da unidade — usado para exibir o alerta visual |
| `tipo` | texto | Tipo (ex.: UPA, Hospital) — espelha a planilha atual |
| `sei` | texto | Padrão `NNNNNNNNNN.NNNNNN/AAAA-NN` |
| `sof_numero` | texto | Padrão `NNN/AAAA` |
| `periodo` | texto | Período de referência (ex.: "FEV A DEZ") |
| `andamento` | texto (FK lógica) | Valor selecionado de `ListasPersonalizadas` (`tipo_lista = ANDAMENTO_SOF`, escopado pela `frente` do processo) |
| `dea` | texto | Campo DEA da planilha atual |
| `objeto` | texto | Descrição do objeto do processo |
| `ta` | texto | Termo aditivo/ordinal (ex.: "13ª") |
| `observacao` | texto | Observações livres |
| `planilha_poas` | texto | Referência à planilha POAS, se aplicável |
| `parcela_mensal` | número | Valor da parcela mensal |
| `fonte` | enum | `TESOURO`, `SUS`, outra |
| `ceo` | texto | Referência ao CEO vinculado |
| `contrato` | texto | Nº do contrato de gestão (pode divergir do `contrato_snapshot` em rearranjos) |
| `total_solicitado` | número | Total solicitado (SOF) |
| `frente` | enum | Frente responsável (`SOF-UPA`, `SOF-UPAE` ou `SOF-Hospital`) — define regra de edição cruzada e escopo da lista de andamento |
| `completo` | boolean | `FALSO` enquanto o processo está em cadastro incremental (rascunho); `VERDADEIRO` quando o analista considera os dados completos (uso apenas informativo/visual, não bloqueia edição) |
| `criado_por` | texto | `id` do usuário que criou |
| `data_criacao` | data | Data de criação |
| `data_ultima_alteracao_andamento` | data/hora | Atualizada **somente** quando o campo `andamento` muda — usada para calcular os dias "parado" (destaque de pendência, Funcionalidade 8) |
| `visualizado_apos_alerta` | boolean | Controla se o destaque de "processo parado" já foi visto/reconhecido pelo analista responsável |
| `possui_ne` | boolean | `FALSO` desde a criação do SOF (nasce sem NE); passa a `VERDADEIRO` quando a primeira Nota de Empenho **original** é vinculada (aba `NotasEmpenho`, Funcionalidade 5). Campo pré-calculado para evitar `join` a cada acesso ao dashboard — alimenta o indicador "SOF com NE pendente de emissão" (Funcionalidade 8) |

**Relação com outras abas:** um `SOF` pode ter 0 a N registros vinculados na aba `NotasEmpenho` (Aba 5). O campo `possui_ne` é a versão "cache" dessa relação, mantida sincronizada pelo Apps Script a cada novo registro em `NotasEmpenho`.

---

## 5. NotasEmpenho

Notas de Empenho (Anexo III), sempre vinculadas a um único SOF — Funcionalidade 5.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único (ex.: `NE-000001`) |
| `sof_id` | texto (FK) | Referência ao processo de SOF de origem |
| `tipo` | enum | `original` ou `reforco` |
| `numero_ne` | texto/nulo | Obrigatório para `tipo = original`; opcional/irrelevante para `tipo = reforco` (o que importa nesse caso é o valor) |
| `valor` | número | Valor da nota (original ou do reforço) |
| `periodo` | texto | Período de referência da NE |
| `criado_por` | texto | `id` do usuário que cadastrou |
| `data_criacao` | data | Data de criação |

**Regras:** o valor total empenhado de um SOF é a soma de todos os registros de `NotasEmpenho` vinculados a ele (original + reforços). Não há exigência de `numero_ne` único no sistema, já que reforços podem não ter número relevante. Ao gravar o **primeiro** registro com `tipo = original` para um dado `sof_id`, o Apps Script também atualiza `SOF.possui_ne` para `VERDADEIRO`.

---

## 6. Recibos

Processos de Recibo (Anexo II), incluindo rateio — Funcionalidade 4.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único (ex.: `REC-000001`) |
| `unidade_id` | texto (FK) | Referência à aba `Unidades` |
| `oss_snapshot` | texto | Cópia da OSS no momento do cadastro (editável com alerta) |
| `cnpj_snapshot` | texto | Cópia do CNPJ (idem) |
| `divergente_da_unidade` | boolean | Mesmo conceito da aba `SOF` |
| `tipo_unidade` | texto | Ex.: UPA, UPAE, Hospital, Carreta |
| `objeto` | texto | Ex.: "CONTRATO DE GESTÃO (TES)", "PISO ENFERMAGEM" |
| `instrumento` | texto | Ex.: "022/2022", "4º TA" |
| `parcela_contratual` | número | Valor de referência da parcela contratual (usado no alerta de divergência) |
| `fonte` | enum | `TESOURO`, `SUS`, outra |
| `nota_empenho` | texto | Número da nota de empenho referente ao pagamento |
| `competencia` | texto | Mês/ano de competência (ex.: "mar.26") |
| `valor_liquidado` | número | Valor liquidado desta parcela |
| `valor_pago` | número | Valor efetivamente pago desta parcela |
| `ordem_bancaria` | texto | Nº da ordem bancária |
| `numero_processo` | texto | Nº do processo administrativo (SEI) |
| `observacao` | texto | Observações livres |
| `status` | texto (FK lógica) | Valor selecionado de `ListasPersonalizadas` (`tipo_lista = STATUS_RECIBO`, escopado pela `frente` do processo) |
| `rateio_grupo_id` | texto/nulo | Identificador comum a todas as parcelas de um mesmo rateio (ex.: duas linhas de 30%/70% compartilham o mesmo `rateio_grupo_id`); nulo quando não há rateio |
| `percentual_rateio` | número/nulo | Percentual informativo da parcela dentro do rateio (ex.: 30, 70) — não bloqueia salvamento se a soma não fechar 100% |
| `alerta_divergencia_valores` | boolean | `VERDADEIRO` quando `valor_liquidado` ≠ `valor_pago`, ou quando a soma dos `valor_pago` do `rateio_grupo_id` não coincide com `parcela_contratual` |
| `frente` | enum | Frente responsável (`Recibo-UPA`, `Recibo-UPAE` ou `Recibo-Hospital`) |
| `completo` | boolean | Mesmo conceito de rascunho da aba `SOF` |
| `origem` | enum | `manual` (cadastrado no sistema) ou `importacao_inicial` (migrado da planilha histórica no lançamento) |
| `criado_por` | texto | `id` do usuário que cadastrou (ou identificador da rotina de importação, para `origem = importacao_inicial`) |
| `data_criacao` | data | Data de criação (ou data da importação) |
| `data_ultima_alteracao_status` | data/hora | Atualizada somente quando `status` muda — base do destaque de pendência (Funcionalidade 8) |
| `visualizado_apos_alerta` | boolean | Mesmo conceito da aba `SOF` |

**Regras:** todo o histórico de Recibo hoje existente na planilha "Recibos Regulares + Rateio" é migrado para esta aba no lançamento, com `origem = importacao_inicial`. O módulo de SOF, ao contrário, nasce sem nenhum registro migrado.

---

## 7. LogAuditoria

Registro de **todas** as edições do sistema (não apenas as cruzadas entre frentes) — Funcionalidade 6.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único (ex.: `LOG-000001`) |
| `usuario_id` | texto (FK) | Quem fez a alteração |
| `perfil_usuario` | enum | `analista` ou `gerente` no momento da ação (snapshot) |
| `frente_usuario` | texto/nulo | Frente do usuário no momento da ação |
| `data_hora` | data/hora | Timestamp da alteração |
| `tipo_processo` | enum | `SOF`, `Recibo`, `Unidade`, `Usuario`, `NotaEmpenho` |
| `processo_id` | texto (FK) | `id` do registro alterado, na aba correspondente |
| `frente_processo` | texto/nulo | Frente "dona" do processo alterado (nulo para `Unidade`/`Usuario`) |
| `campo_alterado` | texto | Nome do campo que mudou |
| `valor_anterior` | texto | Valor antes da alteração |
| `valor_novo` | texto | Valor depois da alteração |
| `fora_da_frente` | boolean | `VERDADEIRO` quando `frente_usuario` ≠ `frente_processo` (edição cruzada, que passou por confirmação) |
| `origem` | enum | `edicao_manual` — único valor usado. **Decidido:** a migração inicial do histórico de Recibo **não** gera entradas nesta aba; o histórico de auditoria só começa a existir a partir do primeiro evento realizado dentro do sistema, após o lançamento |

**Regras:** esta aba nunca é editada ou apagada por nenhum perfil. Gerente consulta todo o log; cada analista, ao acessar sua própria tela de log, vê apenas as linhas onde `usuario_id` é o seu próprio `id`. A migração inicial de `Recibos` **não** produz nenhuma linha em `LogAuditoria` — o rastro de auditoria é zero antes do lançamento do sistema, mesmo para os registros históricos importados (que carregam apenas `Recibos.origem = importacao_inicial`, sem equivalente em log).

---

## 8. EdicoesEmAndamento

Controle de "quem está editando o quê agora", para o aviso de edição simultânea — Funcionalidade 10.

| Coluna | Tipo | Descrição |
|---|---|---|
| `tipo_processo` | enum | `SOF` ou `Recibo` |
| `processo_id` | texto (FK) | Processo sendo editado |
| `usuario_id` | texto (FK) | Quem está editando |
| `iniciado_em` | data/hora | Quando a edição começou — usado apenas para exibir "editando desde..." no aviso, sem função de expiração |
| `ultimo_heartbeat` | data/hora | Última confirmação de que a tela ainda está aberta (atualizada periodicamente pelo frontend). Campo **informativo apenas** — não é usado para expirar/remover automaticamente o registro |

**Regras:** ao abrir uma tela de edição, o frontend registra (ou atualiza) uma linha nesta aba. Se outro usuário tentar abrir o mesmo `processo_id` e existir uma linha ativa, o sistema exibe um aviso com o nome do usuário responsável e desde quando está editando, oferecendo duas opções: "Sair" (não abre a edição) ou "Continuar mesmo assim" (abre normalmente, ignorando o registro existente). **Não há expiração automática por tempo** — o registro só é removido quando o próprio editor original salva ou sai explicitamente da tela; se ele fechar o navegador sem liberar, o registro permanece, mas isso não bloqueia terceiros, já que qualquer um pode optar por "Continuar mesmo assim". Esta é a aba com maior volume de escrita/leitura de curta duração do sistema — vale considerar mantê-la pequena (poucas linhas ativas por vez) para não pesar no Apps Script.

---

## Relacionamentos (resumo)

- `Unidades` (1) → (N) `SOF` — cada SOF referencia uma unidade, mas grava um snapshot dos dados no momento da criação.
- `Unidades` (1) → (N) `Recibos` — mesma lógica de snapshot.
- `SOF` (1) → (N) `NotasEmpenho` — um SOF pode gerar vários empenhos (original + reforços); uma NE pertence a exatamente um SOF.
- `Recibos` (N) → (1) `rateio_grupo_id` — várias linhas de `Recibos` podem compartilhar o mesmo grupo de rateio.
- `ListasPersonalizadas` (N, filtradas por frente) → `SOF.andamento` e `Recibos.status` — relação lógica (por valor de texto + frente), não uma FK rígida. O campo `ListasPersonalizadas.pausa_contagem_parado` da opção selecionada determina se o destaque de "parado" (Funcionalidade 8) é suprimido para aquele processo.
- `Usuarios` (1) → (N) `LogAuditoria` — cada linha de log pertence a um usuário.
- `SOF`/`Recibos` (1) → (0 ou 1 ativa) `EdicoesEmAndamento` — controle transitório de lock de edição.

---

## Notas sobre geração de ID

Como o Sheets não gera IDs automaticamente, o Apps Script deve manter um contador por aba (pode ser uma aba de controle interna, `Contadores`, com uma linha por prefixo: `SOF`, `REC`, `NE`, `UNI`, `USR`, `LST`, `LOG`) e incrementar de forma atômica a cada novo registro, para evitar colisão em cadastros simultâneos.

## Notas sobre a migração inicial de Recibos

1. Antes de importar os recibos históricos, o cadastro de `Unidades` precisa estar populado, para que cada linha migrada seja corretamente vinculada a um `unidade_id`.
2. Cada linha da planilha "Recibos Regulares + Rateio" atual se torna uma linha na aba `Recibos`, com `origem = importacao_inicial`.
3. Linhas de rateio já vinculadas na planilha atual (mesma unidade/nota de empenho, percentuais complementares) devem receber o mesmo `rateio_grupo_id` na importação.
4. **Decidido:** essa carga inicial **não** gera entradas na aba `LogAuditoria`. O histórico de auditoria é contado apenas a partir do lançamento do sistema, cobrindo somente eventos ocorridos dentro dele.
