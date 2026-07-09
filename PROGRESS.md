# GAOCG App — Progresso das mudanças (plano em fases)

> Este arquivo existe para permitir retomar o trabalho em qualquer computador: basta clonar
> este repositório e pedir para o Claude Code ler este arquivo. O backend real vive só no
> editor do Google Apps Script vinculado à planilha (git não implanta nada sozinho) — mas a
> pasta `/backend` deste repositório guarda **cópias de referência** do estado atual esperado
> de cada arquivo `.gs`, pra nunca depender só do histórico de chat pra saber o que já foi
> colado. **Sempre que um arquivo `.gs` mudar, atualize a cópia correspondente em `/backend`
> no mesmo commit.** Se `/backend/X.gs` e o que está colado no editor do Apps Script
> divergirem, o editor do Apps Script é que manda (é o que roda de verdade) — mas isso deveria
> ser raro se a cópia for sempre atualizada junto.

## Ordem combinada das fases
Bugs → UX global → SOF → Notas de Empenho → Recibos.

## Fase 1 — Bugs (CONCLUÍDA)
- Cache em memória no `js/api.js` (`Api.chamar(action, payload, { cache: true })` + `Api.invalidarCache(action)`) para `listarUnidades` e `listarOpcoes`, eliminando buscas repetidas ao trocar de aba.
- Proteção contra clique duplo em "+ Novo processo" (SOF/Recibos) e nas linhas da tabela.
- **Causa raiz real do bug "Selecione a unidade":** não era código — era a coluna `id` vazia na aba **Unidades** da planilha (cadastradas direto no Sheets, sem passar pelo app). Corrigido preenchendo os IDs manualmente (`UNI-000001`, etc.).
- **Lição importante:** o ZIP baixado originalmente estava desatualizado em relação ao GitHub real. O repositório remoto é `https://github.com/AndersonG2021/APP-GAOCG.git`, branch `main`. Sempre trabalhar a partir de um clone real desse repositório, nunca de um ZIP solto.
- Lentidão residual de 1-3s ao trocar de aba é latência inerente do Google Apps Script por requisição (não é mais bug).

## Fase 2 — UX Global (CONCLUÍDA)
- Animação de clique em todos os botões (`.botao:active` em `css/style.css`).
- `UI.mostrarErro(elementoOuId, mensagem)` em `js/app.js`: mostra erro e "pisca" (classe `.piscar-erro` + `@keyframes piscarErro`) se a mesma mensagem repetir. Todos os pontos de erro do app foram migrados para usar esse helper.
- Área do usuário (clicar no nome/perfil no canto superior direito) abre modal com Login, Frente, e formulário de troca de senha (exige senha atual).
- Backend: função `alterarMinhaSenha` adicionada em `Auth.gs` + `case 'alterarMinhaSenha'` em `Code.gs`. Já colada e implantada pelo usuário — funcionando.

## Fase 3 — SOF completo (CÓDIGO CONCLUÍDO, TESTES PARCIAIS)
Mudanças em `js/sof.js` + `css/style.css`:
- Campo "Tipo" removido.
- DEA virou dropdown (SIM/NÃO).
- Período virou duas datas (`periodo_inicio`/`periodo_fim`, `<input type="date">`), substituindo o campo texto único.
- Checkbox "Cadastro completo" removido; todos os campos são obrigatórios exceto T.A., CEO e Observação (validação client-side em `validarCamposObrigatorios()`).
- Andamento virou um **Stepper visual fixo de 13 etapas** (`ETAPAS_ANDAMENTO` em `js/sof.js`), substituindo o dropdown customizável por frente. **Navegação é livre** (qualquer nó, frente ou trás) — única trava: o nó "NE EMITIDA" só fica clicável depois que o SOF tiver uma Nota de Empenho anexada (`sof.possui_ne`).
- Anexo de arquivo obrigatório ao adicionar qualquer Nota de Empenho (seção dentro do SOF em edição), convertido para base64 no navegador e enviado ao backend, que salva no Google Drive.

Backend (colado pelo usuário no editor do Apps Script, **já implantado**):
- `Sof.gs`: `criarSof`/`atualizarSof` usam `periodo_inicio`/`periodo_fim` no lugar de `periodo`.
- `NotasEmpenho.gs`: `criarNotaEmpenho` agora exige `arquivoBase64`/`arquivoNome`, salva o arquivo em uma pasta do Drive (`DriveApp.getFolderById(...)`) e grava `arquivo_drive_id`/`arquivo_url` na planilha.

**Colunas novas que o usuário já deveria ter criado na planilha** (necessárias para os dados acima não serem descartados silenciosamente):
- Aba **SOF**: `periodo_inicio`, `periodo_fim`.
- Aba **NotasEmpenho**: `arquivo_drive_id`, `arquivo_url`.

**IDs das pastas do Google Drive usadas/reservadas para anexos:**
- Notas de Empenho: `1f10o-GB3hFQsWXqes2kPZymhuDCeMY2c` (em uso desde a Fase 3)
- Notas de Liquidação: `1szdIJMxBvIL5BU-ZbTWJh6AAN_tjxTyl` (reservada para a Fase 5 — Recibos)
- Ordens Bancárias: `1BtvWiTqnwxOS52SZZCpvC1HjGbWSDaoN` (reservada para a Fase 5 — Recibos)

**Testado e confirmado pelo usuário:** navegação livre do stepper (frente/trás) funcionando, trava do "NE EMITIDA" funcionando.
**Ainda não testado pelo usuário:**
- Anexo de Nota de Empenho realmente salvando no Google Drive e o link "Ver arquivo" abrindo certo.
- Validação de campos obrigatórios bloqueando corretamente ao faltar algum.

### Fase 3.1 — Bugs de dados (G.D./período) + redesenho do painel de SOF (sessão 2026-07-09)

**Bugs relatados pelo usuário:** G.D. aparecendo como data (`1950-03-03T00:00:00`) e Período início/fim nunca persistindo (campo sempre voltava vazio ao reabrir).

**Causa raiz encontrada:** `aplicarFormatoTexto_` (`Utils.gs`) decidia quais colunas proteger contra a auto-conversão texto→data do Sheets usando uma constante `HEADERS.SOF` desatualizada (ainda tinha o campo antigo `periodo` em vez de `periodo_inicio`/`periodo_fim`, que foram criados direto na planilha na Fase 3 sem atualizar o código). Isso deixou essas duas colunas sem proteção → o Sheets convertia a data digitada num objeto `Date` real → a leitura devolvia ISO com hora (`...T00:00:00`), que um `<input type="date">` rejeita silenciosamente. O mesmo mecanismo corrompeu o G.D.: o valor `"3.3.50"` da unidade (texto legítimo, é o G.D. padrão usado em várias unidades) foi interpretado como data dd.mm.aa (`03/03/1950`) no momento em que foi copiado pro `gd_snapshot` do SOF, porque essa coluna também ficou sem proteção.

**Fix aplicado (`Utils.gs`):** `aplicarFormatoTexto_`/nova `protegerFormatoLinha_` passaram a ler o cabeçalho real da planilha (`getHeaders_`) em vez de uma lista hardcoded, e a proteção passou a ser aplicada a cada escrita (`appendObjectRow_`/`updateObjectRow_`), não só uma vez no setup. Nova função de manutenção `corrigirFormatoTexto()` para reaplicar em massa.

**Regressão descoberta durante o teste do fix acima:** a primeira versão do fix forçava texto (`'@'`) em **todas** as colunas não-numéricas, inclusive as booleanas (`possui_ne`, `completo`, `excluido` etc.). Isso fazia esses campos virarem string `"true"`/`"false"` — e qualquer checagem direta tipo `sof.possui_ne ? ... : ...` no frontend passa a ser sempre verdadeira (string não vazia é truthy em JS), então **toda SOF passou a aparecer com NE "Emitida"**, mesmo sem nota anexada. Corrigido adicionando `COLUNAS_BOOLEANAS` (mesmo princípio de `COLUNAS_NUMERICAS`) e fazendo as duas funções **restaurarem** o formato `General` nessas colunas (não bastava só pular — o `'@'` de uma rodada anterior de `corrigirFormatoTexto()` ficava "preso" na coluna até ser explicitamente revertido).

- Estado atual (ver `/backend/Utils.gs` — já reflete a versão final/correta): usuário colou e implantou; **ainda precisa** rodar `corrigirFormatoTexto()` de novo (a versão com o reset pra `General`) e depois corrigir manualmente as células de `possui_ne`/G.D./período que já foram corrompidas antes do fix (apagar e redigitar — a proteção de formato não recupera um valor que já virou data/texto errado).
- **Próximo passo ao retomar:** confirmar com o usuário que esse ciclo (deploy → `corrigirFormatoTexto()` → correção manual das células → reload do app) foi concluído, e validar visualmente: G.D. não aparece mais como data, período persiste ao reabrir um SOF, e o selo de NE reflete a realidade (só aparece "Emitida" pra quem realmente tem Nota de Empenho anexada).

**Redesenho do painel de SOF (pedido do usuário, feito junto):** tabela virou cards (`renderCards()` em `js/sof.js`, classes `.cartao-sof`/`.grade-cards-sof` em `css/style.css`). Cada card mostra: unidade, objeto, Nº SOF, total solicitado, andamento com barra de progresso (%), número(s) de NE emitida(s) ou selo "pendente", selo "Parado", e dois botões à esquerda (editar = lápis, excluir = lixeira vermelha). Botão "+ Novo processo" virou "+ Nova SOF". Novos filtros: OSS, Objeto, Tipo de unidade (dinâmico a partir das unidades carregadas), DEA — além dos que já existiam (Unidade/Fonte/Frente).

- **Exclusão de SOF é lógica** (soft delete): marca `excluido = true` na aba SOF, mantém linha e log de auditoria. Podem excluir: gerente ou analista da frente responsável pelo processo (mais restrito que a edição cruzada, que permite qualquer analista mediante confirmação).
- Backend: nova função `excluirSof` (`Sof.gs`), novo `case 'excluirSof'` em `Code.gs`, `listarSof` ganhou filtros `objeto`/`dea`/`tipo_unidade` e passou a agregar `notas_empenho_numeros` por SOF (pra mostrar o(s) número(s) de NE no card).
- **Coluna nova que o usuário já deveria ter criado na planilha:** aba **SOF**: `excluido` (booleano).
- Frontend (`js/sof.js`/`css/style.css`) commitado neste repositório. Backend (`/backend/Utils.gs`, `/backend/Sof.gs`, `/backend/Code.gs`) colado pelo usuário e implantado, **mas ver bloco de bugs acima — ainda tem passos de correção manual pendentes antes de considerar essa parte 100% validada**.
- **Ainda não testado:** botão de excluir (lixeira) ponta a ponta; filtros novos (OSS/Objeto/Tipo de unidade/DEA) retornando os resultados certos; cards no site publicado de verdade (só foi validado localmente com dados mockados, sem o backend real).

### Fase 3.2 — SOF com múltiplas fontes/parcelas + remover "frente" do SOF (NÃO INICIADA, aguardando planejamento)

Pedido novo do usuário (ainda não discutido em detalhe, não entrar direto implementando — fazer uma sessão de planejamento primeiro):

- **Multi-fonte/multi-parcela por SOF:** hoje um SOF tem um único `fonte` + `parcela_mensal`. O usuário quer poder ter, por exemplo, a SOF `001/2024` com total de R$500, sendo R$200 na fonte TESOURO (parcela mensal R$20) e R$300 na fonte SUS (parcela mensal R$30) — ou seja, uma SOF pode se referir a mais de um pagamento/fonte simultaneamente. Isso muda o modelo de dados do SOF (hoje `fonte`/`parcela_mensal` são campos únicos na própria linha).
- **Remover o conceito de "frente" do SOF:** o usuário quer que a aplicação passe a distinguir só entre analista e gerente, sem a segmentação por frente (`SOF-UPA`/`SOF-UPAE`/`SOF-Hospital`) que existe hoje. Importante saber que `frente` hoje é usado em vários pontos que vão precisar de decisão explícita de como ficam:
  - `atualizarSof`: exige confirmação extra quando um analista edita um SOF de frente diferente da sua (`foraDaFrente`).
  - `excluirSof` (recém-criada): permissão de exclusão é gerente OU analista da mesma frente.
  - `LogAuditoria`: grava `frente_processo`/`frente_usuario`, e há indicador de dashboard de "edições fora da frente".
  - `ListasPersonalizadas`: já não afeta mais o Andamento do SOF (virou o stepper fixo de 13 etapas na Fase 3, independente de frente) — então o impacto aqui é menor do que parecia à primeira vista.
  - Cadastro de usuário analista (`Usuarios.gs`) hoje exige vincular uma frente.
  - Não ficou claro se essa remoção da frente vale só pra SOF ou pra Recibos também (Recibos ainda usa frente pra Andamento/Status via ListasPersonalizadas) — **perguntar ao usuário**.
- **Próximo passo ao retomar:** abrir uma sessão de planejamento (plan mode) dedicada a isso antes de tocar em código, esclarecendo o escopo acima.

## Fase 4 — Notas de Empenho (NÃO INICIADA)
Do pedido original do usuário:
- Notas de Empenho anexadas via SOF já devem cair automaticamente na aba própria de Notas de Empenho (a listagem já existe via `listarNotasEmpenho`/`js/notas-empenho.js` — falta revisar/redesenhar a tela).
- Cards por NE: número, objeto, **valor atual** em destaque (verde), botão de reforço. Quando o "valor atual" fica menor que a parcela mensal usada para liquidação, o card fica vermelho e é destacado no topo da tela.
- Lógica de "valor atual" = valor original + reforços − valores liquidados (a subtração acontece quando uma Nota de Liquidação é anexada a um Recibo — depende da Fase 5 também, ou de um evento de liquidação a definir).

## Fase 5 — Recibos (NÃO INICIADA)
Do pedido original do usuário:
- Filtros para todos os campos + cards de indicadores (pendentes, total pago no ano, total a pagar).
- Autopreenchimento por unidade+objeto (parcela contratual, fonte, NE) baseado no último lançamento — **já existe parcialmente** em `js/recibos.js` (`historicoRecibosUnidade`), só falta revisar se cobre tudo que foi pedido.
- Novo fluxo de status (com ramificação por fonte SUS/TESOURO): ENVIADO DE VOLTA → AGUARDANDO ASSINATURA DO ATESTO → AGUARDANDO LIBERAÇÃO LIQUIDAÇÃO (CLSUS ou CLTESOURO) → AGUARDANDO ASSINATURA DA LIQUIDAÇÃO → ENVIADO AO SETOR DE PAGAMENTO (CPAG_TESOURO ou CPAG_SUS) → PAGO.
- Renomear "Este pagamento é feito por rateio" → "Este pagamento é feito por mais de uma parcela?" (checkbox ao lado do texto).
- Trocar campos de "valor liquidado"/"valor pago" por anexos de Nota de Liquidação e Ordem Bancária (mesma mecânica de upload da Fase 3), que alimentam a subtração de valor da NE (Fase 4).
- Botão "X" pra remover parcela extra quando o rateio estiver marcado.
- (Bug de "Selecione a unidade" no Recibo já resolvido na Fase 1.)

## Referências úteis
- Repositório: `https://github.com/AndersonG2021/APP-GAOCG.git`, branch `main`, publicado via GitHub Pages.
- Backend roda só no Apps Script; **sempre que um `.gs` mudar, colar manualmente, reimplantar (Implantar → Gerenciar implantações → editar → Nova versão) E atualizar a cópia correspondente em `/backend` neste repositório**, no mesmo commit.
- Padrão de trabalho: planejar cada fase (plan mode) → implementar frontend → passar trecho de backend pronto pro usuário colar → usuário testa → ajustar.
- `/backend/Utils.gs`, `/backend/Sof.gs`, `/backend/Code.gs`: cópias de referência do estado atual esperado (ver Fase 3.1 acima pro histórico de por que `Utils.gs` mudou).
