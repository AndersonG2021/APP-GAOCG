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

- **CONFIRMADO (sessão 2026-07-10):** usuário rodou `corrigirFormatoTexto()`, corrigiu manualmente as células corrompidas, reimplantou, e validou visualmente: G.D. não aparece mais como data, período (início/fim) persiste ao reabrir um SOF, e o selo de NE só mostra "Emitida" pra quem realmente tem Nota de Empenho anexada. Este bloco de bugs está resolvido.

**Redesenho do painel de SOF (pedido do usuário, feito junto):** tabela virou cards (`renderCards()` em `js/sof.js`, classes `.cartao-sof`/`.grade-cards-sof` em `css/style.css`). Cada card mostra: unidade, objeto, Nº SOF, total solicitado, andamento com barra de progresso (%), número(s) de NE emitida(s) ou selo "pendente", selo "Parado", e dois botões à esquerda (editar = lápis, excluir = lixeira vermelha). Botão "+ Novo processo" virou "+ Nova SOF". Novos filtros: OSS, Objeto, Tipo de unidade (dinâmico a partir das unidades carregadas), DEA — além dos que já existiam (Unidade/Fonte/Frente).

- **Exclusão de SOF é lógica** (soft delete): marca `excluido = true` na aba SOF, mantém linha e log de auditoria. Podem excluir: gerente ou analista da frente responsável pelo processo (mais restrito que a edição cruzada, que permite qualquer analista mediante confirmação).
- Backend: nova função `excluirSof` (`Sof.gs`), novo `case 'excluirSof'` em `Code.gs`, `listarSof` ganhou filtros `objeto`/`dea`/`tipo_unidade` e passou a agregar `notas_empenho_numeros` por SOF (pra mostrar o(s) número(s) de NE no card).
- **Coluna nova que o usuário já deveria ter criado na planilha:** aba **SOF**: `excluido` (booleano).
- Frontend (`js/sof.js`/`css/style.css`) commitado neste repositório. Backend (`/backend/Utils.gs`, `/backend/Sof.gs`, `/backend/Code.gs`) colado pelo usuário e implantado, **mas ver bloco de bugs acima — ainda tem passos de correção manual pendentes antes de considerar essa parte 100% validada**.
- **Ainda não testado:** botão de excluir (lixeira) ponta a ponta; filtros novos (OSS/Objeto/Tipo de unidade/DEA) retornando os resultados certos; cards no site publicado de verdade (só foi validado localmente com dados mockados, sem o backend real).

### Fase 3.2 — SOF com múltiplas fontes/parcelas + remover "frente" (CÓDIGO CONCLUÍDO, sessão 2026-07-09, aguardando o usuário colar/implantar e ajustar a planilha)

Decisões tomadas com o usuário (sessão de plan mode antes de implementar):
1. Remover `frente` de **SOF e Recibos juntos**, numa fase só.
2. Multi-fonte do SOF: dentro do mesmo formulário, linhas repetíveis de Fonte/Parcela Mensal/Total Solicitado (botão "+ Adicionar fonte"), aviso (não bloqueante) se a fonte repetir numa linha nova. Card mostra o total de cada fonte + o total geral (soma) em destaque.
3. Permissão sem frente: qualquer analista pode editar/excluir qualquer SOF ou Recibo (sem confirmação cruzada) — só analista x gerente.
4. Auditoria/dashboard: indicador "fora da frente" vira "fora do dono" (dono = `criado_por` de quem criou o processo).

**Feito nesta sessão:**
- `backend/Utils.gs`: `HEADERS`/`COLUNAS_NUMERICAS`/`COLUNAS_BOOLEANAS` atualizados (frente removida de Usuarios/ListasPersonalizadas/SOF/Recibos/LogAuditoria; nova aba `SofFontes`; `LogAuditoria` ganha `dono_processo`/`fora_do_dono` no lugar de `frente_usuario`/`frente_processo`/`fora_da_frente`). Constante `FRENTES` removida.
- `backend/Sof.gs`: reescrito. `SOF_FRENTES`/`frenteDoSof_` removidos; `atualizarSof`/`excluirSof` não têm mais trava de frente (qualquer perfil edita/exclui). Novo modelo: `dados.fontes = [{fonte, parcela_mensal, total_solicitado}, ...]` em `criarSof`/`atualizarSof` (substituição completa da lista a cada save via `substituirFontesDoSof_`); `obterSof`/`listarSof` anexam `sof.fontes` e `sof.total_solicitado` (calculado = soma). Filtro `fonte` em `listarSof` agora verifica qualquer fonte do SOF.
- `js/sof.js`: formulário com seção de linhas de fonte dinâmica (`renderFontesFormulario`/`lerLinhasFontesDoDom_`), aviso de fonte duplicada, soma ao vivo, cards com total geral + breakdown por fonte (`.cartao-sof-fontes`), CSV com coluna `fontes` flatten (`FONTE:valor;FONTE:valor`). Filtro/campo/coluna de Frente removidos. Bloco de confirmação cruzada (`precisaConfirmacao`/`frente_processo`) removido.
- `css/style.css`: estilos novos `.linhas-fonte`/`.linha-fonte`/`.linha-fonte-remover` (form) e `.cartao-sof-fontes`/`.cartao-sof-fonte-linha` (card).
- `js/recibos.js`, `js/usuarios.js`, `js/listas.js`: frente removida (filtros, campos de formulário, colunas de tabela, CSV, confirmação cruzada em Recibos). Em `js/listas.js`, as opções de Andamento(SOF)/Status(Recibo) passam a ser globais (não mais por frente).
- `js/log-auditoria.js`: filtro/coluna "fora da frente" vira "fora do dono" (`fora_do_dono`).
- `js/dashboard.js`: indicador `edicoes_fora_da_frente` vira `edicoes_fora_do_dono`; colunas "Frente" das tabelas de SOF pendente/processos parados viram "Criado por".
- `js/auth.js`: função `frenteDoUsuario()` removida (não tinha mais uso). `js/app.js`: topo mostra só "Analista"/"Gerente" (sem frente); modal de perfil troca o campo "Frente" por "Perfil".
- `js/notas-empenho.js`: coluna "Frente" da listagem trocada por "Criado por" (`n.sof_criado_por` no lugar de `n.sof_frente`) — **isso exige que o backend `NotasEmpenho.gs` (`listarNotasEmpenho`) pare de juntar `sof_frente` e passe a juntar `sof_criado_por`**; ver bloco de pendências abaixo.

**Backend concluído e commitado** (o usuário colou o conteúdo atual de todos em `/backend`, o que permitiu editar sem risco de perder funcionalidade já implantada; falta só o usuário colar/reimplantar no editor do Apps Script - ver "Próximo passo" abaixo):
- `Auth.gs`: `login_` para de devolver `frente` no objeto `user`.
- `Usuarios.gs`: `criarUsuario`/`atualizarUsuario` não leem/gravam mais `frente`, nem validam contra `FRENTES`.
- `ListasPersonalizadas.gs`: `criarOpcao`/`atualizarOpcao`/`listarOpcoes` viram globais (sem `frente`); `opcaoTemPausaContagem_(tipoLista, valor)` perdeu o parâmetro de frente (assinatura já usada assim em `Sof.gs`/`Recibos.gs`).
- `LogAuditoria.gs`: `registrarLog_`/`registrarDiferencas_` recebem `donoProcesso` no lugar do parâmetro de frente; grava `dono_processo`/`fora_do_dono` (calculado como `session.id !== donoProcesso`); `listarLogAuditoria` filtra por `fora_do_dono`; `contarEdicoesForaFrente_` virou `contarEdicoesForaDono_`.
- `Recibos.gs`: `RECIBO_FRENTES`/`frenteDoRecibo_` removidos; `atualizarRecibo` sem trava de edição cruzada (livre pra qualquer perfil); logs usam `criado_por` como dono.
- `Dashboard.gs`: removida a segmentação por frente nas 3 funções de indicador (`dashboardRecibos_`/`dashboardSofPendenteNe_`/`dashboardParados_`) — **decisão tomada nesta sessão sem confirmação explícita do usuário:** como não sobrou nenhuma dimensão pra segmentar por perfil, o dashboard passou a mostrar os mesmos números pra analista e gerente (antes o analista só via a própria frente). `edicoes_fora_da_frente` → `edicoes_fora_do_dono`.
- `NotasEmpenho.gs`: `criarNotaEmpenho`/`listarNotasEmpenho` usam `sof.criado_por`/`sof_criado_por` no lugar de `sof.frente`/`sof_frente`; a listagem também deixou de filtrar por frente do analista (vira transversal, mesmo princípio já usado em `listarSof`).

**Pendência nova, pequena, fora do escopo original do plano:** `backend/Contadores.gs` (não coletado nesta sessão) precisa ganhar uma entrada nova no mapa `PREFIXOS_ID` pra gerar id da aba `SofFontes`, por exemplo `SofFontes: 'SFT'`. Sem isso, `proximoId_('SofFontes')` (usado em `Sof.gs`) lança erro "Prefixo de ID não definido".

**CONFIRMADO (sessão 2026-07-10):** usuário concluiu os 5 passos (colar/implantar os `.gs`, `SofFontes` em `PREFIXOS_ID`, aba `SofFontes` criada com migração dos dados, coluna `frente` removida de Usuarios/ListasPersonalizadas/SOF/Recibos, colunas de LogAuditoria renomeadas) e validou: criar SOF com 2+ fontes funciona sem erro de prefixo de ID. Ainda não confirmado explicitamente: aviso de fonte duplicada, edição/exclusão cruzada sem trava, indicador novo no dashboard/log de auditoria, e se a visibilidade do dashboard (analista vendo os mesmos números do gerente) ficou aceitável — perguntar ao usuário se algo aí precisa de ajuste.

### Performance — lentidão ao abrir card de SOF (sessão 2026-07-09)

Usuário relatou 8-15s ao clicar num card de SOF. Diagnóstico completo e mitigações aplicadas em `RELATORIO_LENTIDAO_SOF.md` (na raiz do repo) — resumo: cadeia de 4 chamadas de rede sequenciais ao abrir um card, `protegerFormatoLinha_` fazendo uma chamada de `setNumberFormat` por coluna em toda escrita (inclusive `marcarSofVisualizado`), releituras completas de planilha sem cache, e N+1 em `opcaoTemPausaContagem_`.

**Aplicado nesta sessão (sem exigir mudança nenhuma na planilha):**
- `Utils.gs`: `protegerFormatoLinha_` em lote (uma chamada por linha escrita, não uma por coluna).
- `js/sof.js`/`js/recibos.js`: `marcarSofVisualizado`/`marcarReciboVisualizado` viraram fire-and-forget; em `sof.js`, `listarNotasEmpenhoPorSof` passou a rodar em paralelo com `obterSof` em vez de depois. Feedback visual (`.carregando`) no card/linha clicada.
- `Auth.gs`/`Usuarios.gs`: cache de 30s (`CacheService`) pro usuário autenticado, invalidado nas escritas (`atualizarUsuario`/`inativarUsuario`/`redefinirSenha`/`alterarMinhaSenha`).
- `ListasPersonalizadas.gs`: cache de 30s pra aba inteira, invalidado em `criarOpcao`/`atualizarOpcao`.
- `Sof.gs`/`Recibos.gs`/`Dashboard.gs`: `opcaoTemPausaContagem_` aceita lista pré-carregada; `listarSof`/`listarRecibos`/`dashboardParados_` carregam `ListasPersonalizadas` uma única vez por chamada em vez de uma vez por linha; o cálculo de "parado" em `listarSof`/`listarRecibos` passou a rodar só na página visível, não em todas as linhas filtradas.

**Pendência nova, pequena:** `backend/Contadores.gs` ainda precisa da entrada `SofFontes: 'SFT'` em `PREFIXOS_ID` (ver bloco da Fase 3.2 acima) — não é da performance, mas é bloqueante pra `criarSof` funcionar.

**Não feito (não tinha o arquivo atual pra editar com segurança):** cache de leitura pra aba Unidades, otimização de `abrirEdicao`/`EdicoesEmAndamento.gs`. Ver seção 5 do relatório.

**Próximo passo ao retomar:** colar/implantar de novo `Utils.gs`, `Auth.gs`, `Usuarios.gs`, `ListasPersonalizadas.gs`, `Sof.gs`, `Recibos.gs`, `Dashboard.gs`; medir se a lentidão melhorou de fato ao abrir um card de SOF.

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
- `/backend` tem cópia de referência de `Auth.gs`, `Code.gs`, `Dashboard.gs`, `ListasPersonalizadas.gs`, `LogAuditoria.gs`, `NotasEmpenho.gs`, `Recibos.gs`, `Sof.gs`, `Usuarios.gs`, `Utils.gs`. **Faltam** `Contadores.gs` e `EdicoesEmAndamento.gs` (nunca coletados nesta sessão - ver pendências da Fase 3.2/Performance). Sempre que precisar editar um `.gs` que não está em `/backend`, pedir ao usuário o conteúdo atual antes (cópias antigas do histórico do git podem estar desatualizadas).
