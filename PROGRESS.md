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

## Fase 4 — Notas de Empenho (CONCLUÍDA, testada e confirmada pelo usuário)

Decisões tomadas antes de implementar (a Fase 3.2 tinha mudado o SOF pra múltiplas fontes, o que tornou o pedido original ambíguo):
1. Cada Nota de Empenho fica vinculada a **uma fonte específica** do SOF — o alerta vermelho compara o valor atual com a parcela mensal *dessa* fonte (soma de `SofFontes` filtrada por fonte).
2. O Recibo mantém um campo numérico `valor_liquidado` (já existia antes desta fase) **junto** com o futuro anexo de Nota de Liquidação (Fase 5) — é esse número que alimenta a subtração, já que o OCR segue adiado.

**Backend (`backend/NotasEmpenho.gs`, colado e implantado):**
- `criarNotaEmpenho`: `numero_ne` agora obrigatório também pra `reforco` (usado pra agrupar sob o mesmo card); reforço exige que já exista uma NE `original` com esse número no mesmo SOF; novo campo obrigatório `fonte`.
- Nova `valorLiquidadoPorNe_(numeroNe)`: soma `valor_liquidado` de `Recibos` cujo `nota_empenho` bate com o número da NE (mesma convenção de texto livre já usada no autopreenchimento do Recibo — sem FK nova).
- `listarNotasEmpenho` reescrita: agora agrupa por `numero_ne` (um card = original + todos os reforços), calcula `valor_bruto`, `valor_liquidado`, `valor_atual`, `parcela_mensal_referencia` (da fonte, via `agruparFontesPorSof_` de `Sof.gs`) e `alerta` (valor atual abaixo da parcela mensal); alertas vêm primeiro na ordenação. `listarNotasEmpenhoPorSof` (usada dentro do card de SOF) não mudou.
- **Coluna nova na planilha, aba NotasEmpenho:** `fonte` (já criada pelo usuário).

**Frontend:**
- `js/sof.js` (mini-formulário "Adicionar Nota de Empenho" dentro do SOF): novo campo obrigatório Fonte (`<select>` a partir de `sof.fontes`); campo Número vira `<select>` com os números de NE originais existentes quando `tipo = reforco` (evita reforço órfão por erro de digitação).
- `js/app.js`: `lerArquivoBase64` virou `UI.lerArquivoBase64` (estava duplicada, centralizada pra ser reaproveitada por `sof.js` e `notas-empenho.js`).
- `js/notas-empenho.js`: reescrita completa — grade de cards (`.cartao-ne`, reaproveitando o padrão visual de `.cartao-sof`), valor atual em destaque (verde/vermelho), detalhamento bruto−liquidado, links pros arquivos anexados, botão "+ Reforço" que abre um modal pequeno (valor + arquivo) sem precisar abrir o SOF. Filtros: Unidade e Fonte.
- `css/style.css`: `.cartao-ne`, `.cartao-ne.alerta`, `.cartao-ne-valor(.vermelho)`, `.cartao-ne-detalhe`, `.cartao-ne-rodape`.

**Testado e confirmado pelo usuário:** NE original com fonte → reforço (seleção do número) → card com valor bruto certo → Recibo com `nota_empenho`/`valor_liquidado` reduzindo o valor atual do card → alerta vermelho + destaque no topo quando abaixo da parcela mensal → botão "+ Reforço" direto pelo card.

## Fase 5 — Recibos (CONCLUÍDA, implantada e testada pelo usuário — sessão 2026-07-13)

Do pedido original do usuário:
- Filtros para todos os campos + cards de indicadores (pendentes, total pago no ano, total a pagar).
- Autopreenchimento por unidade+objeto (parcela contratual, fonte, NE) baseado no último lançamento — **já existe** em `js/recibos.js` (`historicoRecibosUnidade`, no listener de `recObjeto`/`change`), parece cobrir o pedido — só validar se falta algum campo.
- Novo fluxo de status (com ramificação por fonte SUS/TESOURO): ENVIADO DE VOLTA A UNIDADE PARA CORREÇÃO → AGUARDANDO ASSINATURA DO ATESTO → AGUARDANDO LIBERAÇÃO LIQUIDAÇÃO (CLSUS ou CLTESOURO conforme fonte) → AGUARDANDO ASSINATURA DA LIQUIDAÇÃO → ENVIADO AO SETOR DE PAGAMENTO (CPAG_TESOURO ou CPAG_SUS) → PAGO.
- Renomear "Este pagamento é feito por rateio (2+ parcelas)" → "Este pagamento é feito por mais de uma parcela?" com o checkbox ao lado do texto (hoje o checkbox já vem antes do texto no HTML, mas o rótulo precisa mudar).
- Trocar campos de "valor liquidado"/"valor pago" por anexos de Nota de Liquidação e Ordem Bancária (mesma mecânica de upload da Fase 3), que alimentam a subtração de valor da NE (Fase 4).
- Botão "X" pra remover parcela extra quando o rateio estiver marcado (hoje `adicionarLinhaRateio` em `js/recibos.js` não tem botão de remover linha).
- (Bug de "Selecione a unidade" no Recibo já resolvido na Fase 1.)

**Análise já feita (código atual lido, `js/recibos.js` e `backend/Recibos.gs` completos) — retomar planejamento a partir daqui:**
- O fluxo de status novo tem a mesma tensão arquitetural que o Andamento do SOF teve na Fase 3: hoje o Status do Recibo vem de `ListasPersonalizadas` (`STATUS_RECIBO`, customizável, `js/listas.js`/`TelaListas.obterOpcoes`). Virar um fluxo fixo com ramificação por fonte (SUS/TESOURO) provavelmente aposenta esse uso de Listas Personalizadas (mesma decisão tomada pro Andamento na Fase 3.1) — **perguntar ao usuário se confirma isso antes de implementar** (pergunta estava a caminho quando a sessão foi interrompida).
- **Tensão real a resolver com o usuário:** o pedido original quer *trocar* (remover) os campos numéricos `valor_liquidado`/`valor_pago` por anexos de arquivo. Mas: (a) a Fase 4 já depende de `valor_liquidado` numérico pra abater da Nota de Empenho (`valorLiquidadoPorNe_` em `backend/NotasEmpenho.gs`, decisão tomada explicitamente nessa fase de manter o número até o OCR existir); (b) os cards de indicador desta própria Fase 5 ("total pago no ano", "total a pagar") também precisam de um número pra somar. **Recomendação a validar com o usuário:** manter os dois campos numéricos só que agora lado a lado com o upload dos respectivos documentos (Nota de Liquidação anexa ao lado do número de Valor Liquidado; Ordem Bancária anexa ao lado do número de Valor Pago), em vez de removê-los — mesmo princípio já usado na Fase 4.
- Falta decidir com o usuário: (1) status fixo substitui Listas Personalizadas — sim/não; (2) o que fazer com as duas etapas do fluxo que dependem da fonte quando `fonte` for "Outra"/vazia (bloquear até definir SUS/TESOURO, ou usar rótulo genérico); (3) confirmar manter valor_liquidado/valor_pago numéricos junto dos anexos; (4) critério de "total pago no ano"/"a pagar" nos cards — por ano da competência (mais simples, já existe como campo) ou por uma data real de pagamento (exigiria campo novo).
- Campos/estrutura atual de Recibo (`backend/Recibos.gs`, `montarLinhaRecibo_`): `unidade_id, oss_snapshot, cnpj_snapshot, tipo_unidade, objeto, instrumento, parcela_contratual, fonte, nota_empenho, competencia, valor_liquidado, valor_pago, ordem_bancaria (texto livre, só o número), numero_processo, observacao, status, rateio_grupo_id, percentual_rateio, completo`. Sem coluna de frente (já removida na Fase 3.2). Pastas do Drive já reservadas (ver seção de referências): Notas de Liquidação e Ordens Bancárias.
- Rateio: `criarGrupoRateioRecibo`/`recalcularAlertaRecibo_` já existem e funcionam por `rateio_grupo_id`; o botão de remover linha é só frontend (`adicionarLinhaRateio` em `js/recibos.js`), sem mudança de backend necessária pra isso.

**Decisões tomadas com o usuário (sessão 2026-07-12):**
1. **Status NÃO vira fluxo fixo no código** — continua vindo de Listas Personalizadas (`STATUS_RECIBO`), só que as opções disponíveis passam a refletir o novo fluxo ramificado por fonte (ENVIADO DE VOLTA A UNIDADE PARA CORREÇÃO → AGUARDANDO ASSINATURA DO ATESTO → AGUARDANDO LIBERAÇÃO LIQUIDAÇÃO CLSUS/CLTESOURO → AGUARDANDO ASSINATURA DA LIQUIDAÇÃO → ENVIADO AO SETOR DE PAGAMENTO CPAG_TESOURO/CPAG_SUS → PAGO), cadastradas como valores de lista, não hardcoded.
2. **Fonte "Outra"/vazia:** usa o ramo TESOURO como padrão nas etapas que dependem da fonte (CLTESOURO/CPAG_TESOURO), em vez de bloquear ou usar rótulo genérico.
3. **Mantém `valor_liquidado`/`valor_pago` numéricos** lado a lado com os novos anexos (Nota de Liquidação / Ordem Bancária) — mesmo princípio da Fase 4, não remove os campos numéricos do pedido original.
4. **"Total pago no ano"/"total a pagar" nos cards de indicador: por competência** (campo `competencia` já existente), não por data real de pagamento.

**Decisões adicionais tomadas durante o refinamento do plano (sessão 2026-07-12):**
5. **Renomear "rateio" → "parcela dividida" em tudo** (rótulos visíveis E nomes internos: coluna da planilha, funções do backend, IDs do frontend) — "Rateio" já é o nome de outro objeto no domínio do sistema, então manter o termo aqui causaria ambiguidade permanente.
6. **Anexo por parcela, não por grupo:** quando um pagamento é dividido em parcelas, cada parcela tem sua própria Nota de Liquidação e sua própria Ordem Bancária (mesmo processo, documentos diferentes por parcela).
7. **Anexos opcionais**, sem trava no backend (Recibo é criado antes desses documentos existirem; anexo entra depois, na edição).
8. **Cards de indicador reativos aos filtros** da tela de Recibos (mesmos parâmetros de `listarRecibos`).
9. **Card "total a pagar" adiado** — depende de uma feature futura (tabela de valores mensais recebidos por unidade, pra calcular o total dos 12 meses de NEs recorrentes que não geram Termo Aditivo) fora do escopo desta fase. Só entraram nesta fase os cards "pendentes" e "total pago no ano".

**Implementado nesta sessão (frontend `js/recibos.js` reescrito; backend `backend/Recibos.gs` reescrito, `backend/Utils.gs`/`backend/Code.gs`/`backend/Dashboard.gs` ajustados):**
- Rename completo de "rateio" → "parcela dividida": coluna da planilha `rateio_grupo_id`→`parcela_dividida_grupo_id` e `percentual_rateio`→`percentual_parcela_dividida`; função `criarGrupoRateioRecibo`→`criarGrupoParcelaDivididaRecibo` (e o `case` correspondente em `Code.gs`); IDs/classes do frontend (`recTemParcelaDividida`, `blocoParcelaUnica`/`blocoComParcelaDividida`, `linhasParcelaDividida`, `.linha-parcela-dividida`); coluna da tabela "Rateio"→"Parcela dividida"; checkbox com o novo texto "Este pagamento é feito por mais de uma parcela?".
- Filtros novos na tela de Recibos: Status, Objeto, Instrumento, Nota de Empenho, Nº Processo (o filtro de Status já tinha suporte no backend, só faltava a UI). Backend: `listarRecibos` ganhou filtros por `objeto`/`instrumento`/`nota_empenho`/`numero_processo` (substring, mesmo padrão do SOF), extraídos pra um helper compartilhado `filtrarLinhasRecibos_`.
- Fluxo de Status ramificado por fonte: `opcoesStatus(statusAtual, fonte)` em `js/recibos.js` esconde as opções que mencionam SUS/TESOURO conforme a fonte escolhida (regex com word-boundary, pra não colidir com um status futuro tipo "SUSPENSO"); fonte "Outra"/vazia mostra o ramo TESOURO (D2). Reavaliado sempre que o campo Fonte muda (criação e edição) ou quando o autopreenchimento por Objeto define a fonte. O filtro da barra de busca (`opcoesStatusFiltro`) não aplica esse recorte — lista qualquer status já salvo.
- Anexos de Nota de Liquidação / Ordem Bancária: 4 colunas novas (`nota_liquidacao_drive_id`, `nota_liquidacao_url`, `ordem_bancaria_arquivo_drive_id`, `ordem_bancaria_arquivo_url`), upload em base64 igual ao padrão das Notas de Empenho (`anexarArquivoRecibo_` em `backend/Recibos.gs`, pastas do Drive já reservadas desde a Fase 3), campos de arquivo opcionais no formulário de criar (parcela única e cada linha de parcela dividida) e no de editar (com link "Ver arquivo atual"). O campo de texto livre `ordem_bancaria` (número da OB) continua existindo, sem conflito de nome com o anexo.
- Cards de indicador "Pendentes" (status ≠ PAGO) e "Total pago no ano" (soma de `valor_pago` das linhas cuja `competencia` cai no ano atual), reativos aos filtros ativos — nova função `indicadoresRecibos` em `backend/Recibos.gs` (`case` novo em `Code.gs`), chamada em paralelo com `listarRecibos`.
- Botão de remover parcela extra (`.linha-parcela-dividida-remover`, mesmo padrão visual do `.linha-fonte-remover` do SOF) — só aparece quando há mais de 2 parcelas, já que `criarGrupoParcelaDivididaRecibo` exige no mínimo 2.

**CONFIRMADO (sessão 2026-07-13):** usuário concluiu os 4 passos manuais (renomear colunas `rateio_grupo_id`/`percentual_rateio`, criar as 4 colunas de anexo, confirmar acesso de escrita do Drive, cadastrar os 8 valores novos de Status) e colou/reimplantou `Recibos.gs`, `Utils.gs`, `Code.gs`, `Dashboard.gs`. Testado e funcionando: criação de Recibo com parcela dividida (2+ parcelas, cada uma com seu próprio anexo); edição de Recibo adicionando anexo sem apagar um já existente; dropdown de Status oferecendo só o ramo certo por fonte; `valorLiquidadoPorNe_` (Fase 4) continuando a somar certo depois do rename; cards "Pendentes"/"Total pago no ano"; botão de remover parcela extra.

**Fora do escopo desta fase (adiado, ver decisão 9):** card "total a pagar" — depende de uma tabela futura de valores mensais recebidos por unidade (NEs recorrentes que não geram Termo Aditivo, reforçadas todo início de ano) ainda não implementada.

## Melhorias fora da sequência de fases (sessão 2026-07-12)

### Recibos — reordenação da tabela
Pedido do usuário: tabela de Recibos não deveria mostrar mais o campo Origem;
no lugar, Nº Processo e Valor Liquidado, na ordem Unidade, Nº Processo,
Competência, Valor Liquidado, Valor Pago, Ordem Bancária, Status.
`renderTabela` em `js/recibos.js` ajustada (só frontend, sem mudança de
backend — os campos já existiam). O selo de "Parcela dividida" que antes tinha
coluna própria saiu da tabela (não fazia parte da lista pedida); o dado
continua existindo no backend, só não é mais mostrado ali.

### Unidades — Valor do C.G. + Termos Aditivos = "Parcela mensal" (CONCLUÍDA, implantada e testada pelo usuário — sessão 2026-07-13)

Redesenho pedido pelo usuário: cada unidade passa a ter um **Valor do C.G.**
(campo numérico único, ao lado do `contrato_gestao` de texto que já existia) e
uma lista de **Termos Aditivos (T.A.)** — cada um com Objeto do T.A., Nº do
T.A. (texto livre, ex. "1º") e Valor do T.A. A listagem deixa de mostrar o
campo Ativo e passa a mostrar **"Parcela mensal"** = Valor do C.G. + soma de
todos os T.A.s cadastrados. Essa é a base de dados que faltava pro indicador
"total a pagar" que ficou adiado na Fase 5 de Recibos (ver decisão 9 acima) —
**não foi ligado a nenhum indicador ainda**, só a base de dados/UI de cadastro.

Decisões tomadas com o usuário antes de implementar:
1. Valor do C.G. é único por unidade (não repetido por T.A.) — mora no
   cadastro principal.
2. O botão "+ Adicionar parcela mensal" adiciona só T.A.s (Objeto/Nº/Valor),
   numa lista repetível — mesmo padrão de "Fontes" do SOF (`js/sof.js`).
3. Exclusão de unidade reaproveita o `ativo`/`inativarUnidade` que já
   existia — sem campo novo de exclusão lógica. Só muda a confirmação
   (mensagem grande em destaque) e a UI (ícone de lixeira no cartão em vez do
   botão dentro do modal).

**`backend/Unidades.gs` nunca tinha sido coletado neste repositório** — o
usuário colou o conteúdo atual nesta sessão, que virou a base da reescrita e
já está salvo em `/backend/Unidades.gs`.

**Backend (`backend/Unidades.gs` reescrito, `backend/Utils.gs` ajustado):**
- Novo `SHEETS.UNIDADES_TA`/`HEADERS.UnidadesTA`/`COLUNAS_NUMERICAS.UnidadesTA`
  (`Utils.gs`); `HEADERS.Unidades`/`COLUNAS_NUMERICAS.Unidades` ganham
  `valor_contrato_gestao`.
- Mesmo padrão de SOF↔SofFontes (`agruparFontesPorSof_`/`substituirFontesDoSof_`
  em `backend/Sof.gs`): novos helpers `listarTasPorUnidade_`,
  `agruparTasPorUnidade_` (leitura em lote pra `listarUnidades`, evita N+1),
  `parcelaMensalTotal_`, `substituirTasDaUnidade_`. T.A.s viajam dentro de
  `dados.tas` em `criarUnidade`/`atualizarUnidade` — sem endpoint novo, sem
  `case` novo em `Code.gs`. Diferença do SOF: T.A.s são **opcionais** (lista
  pode ficar vazia), Fontes do SOF são obrigatórias.
- `inativarUnidade`/`reativarUnidade` **sem mudança nenhuma** — só passaram a
  ser chamadas de um lugar novo no frontend (ícone de lixeira/restaurar).

**Frontend (`js/unidades.js` reescrito, `css/style.css` com bloco novo
`.cartao-unidade`/`.grade-cards-unidade`/`.aviso-exclusao`):**
- Listagem virou cartões (mesmo padrão visual de `.cartao-sof`): ícones de
  editar (lápis) e excluir/restaurar (lixeira quando ativa, ícone de restaurar
  quando inativa) à esquerda; corpo clicável mostra Nome/Tipo/OSS/CNPJ e o
  selo "Parcela mensal: R$ X".
- Clicar no corpo do cartão expande um bloco (sem chamada de rede, dado já
  carregado) com "Valor do C.G." + a lista de T.A.s, somente leitura.
- Editar (lápis) abre o modal de sempre, agora com o campo "Valor do C.G." e
  uma seção "Termos Aditivos" com lista repetível (reaproveita as classes CSS
  `.linhas-fonte`/`.linha-fonte`/`.linha-fonte-remover` já existentes do SOF,
  sem CSS novo pra isso) e botão "**+ Adicionar parcela mensal**" (nome exato
  pedido pelo usuário, mesmo a ação sendo adicionar um T.A.).
- Excluir (lixeira) abre um modal com o aviso grande e em destaque pedido
  ("TEM CERTEZA QUE QUER EXCLUIR ESSA UNIDADE E TODOS OS SEUS DADOS?..."),
  classe CSS nova `.aviso-exclusao` (texto grande, vermelho, negrito) — não é
  o `confirm()` nativo do navegador. Confirmar chama `inativarUnidade`
  (existente); a unidade some da listagem padrão ("Somente ativas") mas
  continua no banco.

**CONFIRMADO (sessão 2026-07-13):** usuário criou a coluna `valor_contrato_gestao`
e a aba **UnidadesTA** na planilha, adicionou `UnidadesTA: 'UTA'` ao mapa
`PREFIXOS_ID` em `Contadores.gs`, colou `backend/Unidades.gs`/`backend/Utils.gs`
atualizados e reimplantou. Testado e funcionando: criar unidade com Valor do
C.G. + 2 T.A.s e conferir a "Parcela mensal" no cartão; expandir/recolher o
cartão; editar pra adicionar/remover T.A.; excluir com o aviso grande;
`criarSof`/`criarRecibo` continuam funcionando depois da mudança de schema.

**Nota de deploy (sessão 2026-07-12):** o usuário reportou "nada mudou no
visual" depois do push — verificado via `curl` direto no GitHub Pages que
`js/unidades.js`, `js/recibos.js` e `css/style.css` publicados **já eram os
novos** (conteúdo confirmado, headers `Cache-Control: max-age=600`). Era cache
do navegador, não problema de deploy — resolvido com hard refresh
(Ctrl+Shift+R) / aba anônima. Se isso se repetir em sessões futuras, checar o
deploy direto (`curl` nos arquivos publicados) antes de investigar código.

## Referências úteis
- Repositório: `https://github.com/AndersonG2021/APP-GAOCG.git`, branch `main`, publicado via GitHub Pages.
- Backend roda só no Apps Script; **sempre que um `.gs` mudar, colar manualmente, reimplantar (Implantar → Gerenciar implantações → editar → Nova versão) E atualizar a cópia correspondente em `/backend` neste repositório**, no mesmo commit.
- Padrão de trabalho: planejar cada fase (plan mode) → implementar frontend → passar trecho de backend pronto pro usuário colar → usuário testa → ajustar.
- `/backend` tem cópia de referência de `Auth.gs`, `Code.gs`, `Dashboard.gs`, `ListasPersonalizadas.gs`, `LogAuditoria.gs`, `NotasEmpenho.gs`, `Recibos.gs`, `Sof.gs`, `Unidades.gs`, `Usuarios.gs`, `Utils.gs`. **Faltam** `Contadores.gs` e `EdicoesEmAndamento.gs` (nunca coletados neste repositório). `Contadores.gs` já tem `SofFontes: 'SFT'` e `UnidadesTA: 'UTA'` no mapa `PREFIXOS_ID` (confirmado, sessão 2026-07-13) — só o conteúdo completo do arquivo continua fora deste repo. Sempre que precisar editar um `.gs` que não está em `/backend`, pedir ao usuário o conteúdo atual antes (cópias antigas do histórico do git podem estar desatualizadas).
