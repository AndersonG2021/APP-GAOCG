# GAOCG App — Progresso das mudanças (plano em fases)

## Objetivo do app

Aplicação interna da Gerência Administrativa Orçamentária dos Contratos de Gestão (GAOCG),
Secretaria de Saúde de Pernambuco. Substitui planilhas soltas no acompanhamento do ciclo de
pagamento dos Contratos de Gestão das unidades de saúde geridas por OSS (UPAs, UPAEs,
Hospitais etc.): **Unidades** (cadastro mestre + Valor do C.G./Termos Aditivos) → **SOF**
(pedido orçamentário, múltiplas fontes, andamento em 13 etapas) → **Notas de Empenho**
(vinculadas a uma fonte do SOF, com alerta de saldo) → **Recibos** (pagamento, parcela
dividida, leitura por OCR de Nota de Liquidação/Ordem Bancária). Complementado por Listas
Personalizadas (OSS/Objeto/Andamento/Status geridos pela equipe), Dashboard, Log de
Auditoria e aviso de edição simultânea. Qualquer analista opera qualquer processo
(sem segmentação por "frente" - removida na Fase 3.2); só a gestão de usuários é exclusiva
do gerente. Ver [`README.md`](README.md) pra visão geral de arquitetura/deploy.

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

## Leitura automática (OCR) de Nota de Liquidação / Ordem Bancária no Recibo (LEITURA BÁSICA CONFIRMADA, sessão 2026-07-13 - faltam testar os cenários de borda)

Pedido do usuário: ao anexar uma Nota de Liquidação ou Ordem Bancária no
Recibo (documentos oficiais do e-fisco/PE, formato fixo), ler o documento via
OCR e preencher automaticamente `valor_liquidado`/`valor_pago`, validando que
a Nota de Empenho citada no documento é a mesma do Recibo.

Decisões tomadas com o usuário antes de implementar:
1. A leitura acontece **ao anexar o arquivo** (não só ao salvar o Recibo).
2. Se a NE do documento não bater com a NE do Recibo, o sistema **bloqueia**
   (nem preenche, nem deixa o anexo "pegar").
3. Depois de lido, o campo de valor **trava (somente leitura)** - só o
   documento manda no valor - com um link **"Remover anexo"** que libera o
   campo de novo (e desanexa, sem apagar o arquivo do Drive).

**Backend:**
- `backend/Utils.gs`: `extrairTextoOcr_` (sobe o anexo como Google Doc
  convertido com OCR via Advanced Drive Service, lê o texto, descarta o Doc) e
  `normalizarValorMonetarioBr_` (converte "1.053.812,42" pra número - `toNumber_`
  existente não serve, não remove separador de milhar).
  **Bug corrigido (sessão 2026-07-13):** primeira versão usava a sintaxe da
  Drive API v2 (`Drive.Files.insert`, `resource.title`, `ocr:true`), mas o
  "Serviços (+)" do editor do Apps Script hoje adiciona a **v3** por padrão,
  cujo método é `Drive.Files.create` (`resource.name` no lugar de `title`,
  `ocrLanguage` sem o `ocr:true` separado) - erro em produção:
  `Drive.Files.insert is not a function`. Corrigido para a sintaxe v3.
- `backend/Recibos.gs`: nova `lerAnexoRecibo(session, params)` - extrai a NE do
  documento pelo próprio formato (`\d{4}NE\d{6}`, ex: "2026NE000418" - mais
  robusto que amarrar ao rótulo "EMPENHO:", que também aparece dentro de
  "DATA DO EMPENHO:" nos mesmos documentos), compara com a NE do Recibo, e
  extrai o valor pelo rótulo certo ("VALOR LIQUIDADO:" ou "VALOR LÍQUIDO:").
  `atualizarRecibo` ganhou suporte a `removerNotaLiquidacaoArquivo`/
  `removerOrdemBancariaArquivo` (zera só a referência, não apaga do Drive).
- `backend/Code.gs`: novo `case 'lerAnexoRecibo'`.

**Frontend (`js/recibos.js`):** novo helper `ligarAnexoComOcr_` (liga um
`<input type="file">` de anexo à leitura automática, trava/destrava o campo
de valor correspondente, mostra o link de remover) aplicado nos 3 contextos:
Recibo novo (parcela única), cada linha de parcela dividida, e edição de
Recibo existente (nesse último, se já havia um anexo salvo, o campo já nasce
travado ao abrir o formulário). `lerAnexoDoInput_` passou a reaproveitar o
`{base64,nome,tipo}` já validado no momento do anexo, sem reler o arquivo no
submit.

**Limitação conhecida:** trocar a Nota de Empenho *depois* de já ter
anexado/validado um documento não reavalia automaticamente - precisa remover
e reanexar. Fora de escopo desta primeira versão.

**Passos manuais concluídos pelo usuário (sessão 2026-07-13):**
1. Ativou o Advanced Drive Service (`Serviços (+)` → Drive API).
2. Colou `backend/Utils.gs`, `backend/Recibos.gs`, `backend/Code.gs` e
   reimplantou (nova versão).
3. **Autorização OAuth (bloqueio real encontrado):** a autorização do projeto
   (concedida em 7 de julho, antes desta funcionalidade existir) cobria só
   Planilhas e Drive - faltava o escopo de Google Docs
   (`https://www.googleapis.com/auth/documents`), exigido por
   `DocumentApp.openById` em `extrairTextoOcr_`. Rodar uma função no editor não
   disparava a tela de autorização sozinho (a autorização parcial já existente
   parece ter impedido o fluxo incremental de pedir só o escopo que faltava).
   **Fix:** o usuário removeu todo o acesso do projeto em
   [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
   e autorizou de novo do zero (rodando uma função no editor), dessa vez
   incluindo Google Docs no consentimento.

**CONFIRMADO (sessão 2026-07-13):** anexou um documento de exemplo e o valor
foi lido/preenchido corretamente - leitura básica de OCR funcionando de
ponta a ponta (upload → conversão → extração de NE/valor → preenchimento do
campo).

**Ainda não testado:** bloqueio ao anexar documento de NE diferente da do
Recibo; travar/destravar (link "Remover anexo") tanto num Recibo novo quanto
numa edição com anexo pré-existente; o mesmo fluxo dentro de uma linha de
parcela dividida; leitura do segundo tipo de documento (só um dos dois -
Nota de Liquidação ou Ordem Bancária - foi testado até agora).

## Layout responsivo (CONCLUÍDO, testado e confirmado pelo usuário — sessão 2026-07-14)

Pedido do usuário: o site precisava funcionar bem em qualquer tamanho de tela, de celular a monitor ultrawide. Mudança só de frontend (`index.html`, `js/app.js`, `css/style.css`), sem tocar em backend.

- **Menu lateral retrátil no mobile** (abaixo de 860px): `#barraLateral` vira uma gaveta off-canvas (`transform: translateX(-100%)` / `.aberta`), aberta por um botão hambúrguer novo (`#btnMenuMobile`) em `#barraTopo`, com um fundo escurecido (`#fundoMenuMobile`) que fecha ao clicar fora; fecha também ao navegar pra qualquer tela. Lógica em `js/app.js` (`fecharMenuMobile()` + listeners em `init()`).
- **Grids de formulário empilham** (abaixo de 640px): `.grade-2`/`.grade-3`/`.linha-fonte` viram 1 coluna; `.linha-parcela-dividida` empilha; padding de `#conteudo`/`.painel`/`.modal-corpo` reduz.
- **Cards nunca estouram a largura:** `.grade-cards-sof`/`.grade-cards-unidade`/`.grade-indicadores` usam `minmax(min(Npx, 100%), 1fr)` (CSS moderno, sem precisar de media query dedicada).
- **Tabelas com rolagem própria:** `.painel { overflow-x: auto }` + `table.tabela th/td { white-space: nowrap }` — sem isso as células só espremiam/quebravam o texto de forma feia em vez de rolar (bug encontrado no primeiro teste do usuário, corrigido na mesma sessão).
- **Ultrawide:** `#conteudo { max-width: 1600px; margin: 0 auto }` — centraliza o conteúdo em telas muito largas em vez de esticar tabelas/formulários de ponta a ponta.
- Ajustes pontuais: `#containerToasts` com `width: min(320px, calc(100vw - 32px))`; `.cartao-login` com padding reduzido abaixo de 400px; `.modal-rodape` com `flex-wrap: wrap` (corrigido também no primeiro teste — o botão "Inativar" do modal de Usuário estava sendo cortado da tela em vez de quebrar linha).

**Nota sobre o teste do usuário:** o dropdown nativo de `<select>` (ex.: Status do Recibo) apareceu "vazando" da tela no modo responsivo do DevTools do Chrome desktop — isso é uma limitação da simulação (o Chrome desktop não reproduz o seletor nativo de verdade), não um bug do CSS. Num celular real, esse campo abre o picker nativo do sistema operacional. Vale confirmar em um aparelho de verdade se possível, mas não é motivo de preocupação.

## Listas de OSS/Objeto + filtros consistentes (CONCLUÍDO, testado e confirmado pelo usuário — sessão 2026-07-14)

Pedido do usuário: os filtros de OSS e Objeto (texto livre) deviam virar dropdowns alimentados por listas cadastradas, com uma nova categoria "Objeto" em Listas Personalizadas; o mesmo padrão nos campos Objeto de criação (mantendo o autopreenchimento já existente); e o conjunto completo de filtros do SOF (Busca livre, Unidade, OSS, Objeto, Tipo de unidade, DEA, Fonte) replicado em Notas de Empenho e Recibos.

Decisões tomadas com o usuário antes de implementar:
1. **OSS** virou lista gerenciada em Listas Personalizadas — categoria própria (`OSS`), separada do campo OSS já existente em Unidades.
2. **Objeto** virou lista fechada (categoria `OBJETO`): só aceita valores já cadastrados — criar um SOF/Recibo com um Objeto novo exige cadastrá-lo em Listas Personalizadas primeiro (sem auto-cadastro on-the-fly).
3. Nos formulários de criação/edição de SOF e Recibo, Objeto virou `<select>` (SOF era `<textarea>`; Recibo era `<input>` com `datalist`), mantendo o autopreenchimento por unidade+objeto que já existia no Recibo.
4. **DEA em Notas de Empenho e Recibos não ganhou coluna própria** — o usuário esclareceu que é um atributo que se propaga do SOF (`sof.dea`) para a NE (via `sof_id`) e desta para o Recibo (via `nota_empenho` = `numero_ne`); o filtro resolve isso via join, sem duplicar dado.

**Backend:**
- `ListasPersonalizadas.gs`: `TIPOS_LISTA` ganhou `'OSS'`/`'OBJETO'` (toda a infraestrutura de `listarOpcoes`/`criarOpcao`/`atualizarOpcao` já era genérica). Duas funções de carga única (mesmo padrão de `corrigirFormatoTexto()`): `semearListaOSS()` (a partir dos valores já cadastrados em Unidades) e `semearListaObjetos()` (a partir dos valores já usados em SOF e Recibos) — necessárias porque as listas nasceram vazias.
- `NotasEmpenho.gs` (`listarNotasEmpenho`): passou a juntar Unidades também (além de SOF), anexando `sof_oss`/`sof_dea`/`sof_tipo_unidade` a cada card agrupado; novos filtros `oss`/`objeto`/`tipo_unidade`/`dea`/`busca`.
- `Recibos.gs` (`filtrarLinhasRecibos_`): novo filtro `tipo_unidade` (campo já existia em Recibo); novo filtro `dea` via `mapaDeaPorNumeroNe_()` (join `nota_empenho` → NE → SOF, só executado quando o filtro é realmente usado).

**Frontend:**
- `js/listas.js`: 4 abas (Andamento, Status, OSS, Objeto); o conceito de "pausa contagem parado" (checkbox + coluna) só aparece pras duas primeiras.
- `js/sof.js`: filtros OSS/Objeto viraram `<select>`; campo Objeto na criação/edição virou `<select>` obrigatório (era textarea livre).
- `js/recibos.js`: filtros novos (OSS, Tipo de unidade, DEA); Objeto (filtro e criação/edição) virou `<select>` a partir da lista global — a lógica de autopreenchimento por `historicoRecibosUnidade` (parcela contratual/fonte/NE do último lançamento) continua igual.
- `js/notas-empenho.js`: ganhou os 7 filtros completos (Busca livre, Unidade, OSS, Objeto, Tipo de unidade, DEA, Fonte — antes só tinha Unidade/Fonte).

**Nota operacional importante:** essa mudança é mais bloqueante que as anteriores — até o backend estar implantado e as duas funções de semeadura rodadas, o campo Objeto (obrigatório) aparece vazio nos formulários de SOF/Recibo, impedindo criar processos novos. Por isso o push do frontend foi segurado até o usuário confirmar os 4 passos manuais (colar os 3 `.gs`, reimplantar, rodar `semearListaOSS()`/`semearListaObjetos()`, conferir as listas na planilha).

**Testado e confirmado pelo usuário:** listas OSS/Objeto semeadas corretamente; filtros novos funcionando nas 3 telas (SOF, Notas de Empenho, Recibos); seleção de Objeto na criação/edição com autopreenchimento preservado.

## Nome exibido editável pelo próprio usuário (CONCLUÍDO, sessão 2026-07-14)
Cada usuário agora pode editar como o próprio nome aparece na aplicação (não o login), pelo modal "Minha conta" (clicar no nome/perfil no canto superior direito). Backend: nova `alterarMeuNome(session, novoNome)` em `Auth.gs` (mesmo padrão de `alterarMinhaSenha`) + `case 'alterarMeuNome'` em `Code.gs`. Frontend: campo + botão "Salvar nome" em `abrirModalPerfil` (`js/app.js`); `Auth.atualizarNomeLocal(novoNome)` (`js/auth.js`) atualiza a sessão em memória/`sessionStorage` na hora, sem exigir novo login. Testado e confirmado.

## Fechar modal de edição (X/clique fora) libera a trava de edição simultânea (CONCLUÍDO, sessão 2026-07-14)
Bug encontrado: nos formulários de edição de SOF e Recibo, só o botão "Cancelar" liberava a trava de edição simultânea (`EdicaoSimultanea.sairDaEdicao`, Funcionalidade 10) — fechar pelo X ou clicando fora do modal deixava a trava presa (sem expiração automática por tempo), fazendo outros usuários continuarem vendo "está sendo editado por você" indefinidamente. Só frontend, sem mudança de backend.

Fix: novo mecanismo `UI.aoFecharModal(callback)` em `js/app.js` — registra uma função a ser chamada sempre que `UI.fecharModal()` rodar, por qualquer caminho (Cancelar, X, clique fora, ou fechamento programático após salvar); zerado a cada `abrirModal()` e após disparar uma vez. `js/sof.js`/`js/recibos.js` passaram a registrar `sairDaEdicao` uma única vez ao abrir a edição, em vez de duplicar a chamada manualmente no Cancelar e no sucesso do Salvar. Testado e confirmado pelo usuário.

## Performance — lentidão ao trocar de aba (sessão 2026-07-17)

Usuário relatou 2-3s de atraso ao trocar de aba, mais perceptível em **SOF**
e depois **Recibos**. Revisão completa do roteamento (`js/app.js`) e das 8
telas + todo o backend de leitura. O "1-3s inerente ao Apps Script Web App"
(já documentado desde a Fase 1) continua existindo e não é eliminável, mas a
revisão achou gordura real e específica em cima desse piso, explicando por
que SOF/Recibos pioram mais que as outras telas:

- **SOF era a pior porque `listarSof` fazia 3 leituras completas de abas
  diferentes numa chamada só:** SOF + **SofFontes** (`agruparFontesPorSof_`)
  + **NotasEmpenho** (números de NE nos cards). As outras telas simples
  fazem só 1 leitura.
- **Recibos era a 2ª pior porque a tela disparava 2 requisições HTTP
  separadas** (`listarRecibos` + `indicadoresRecibos`), **cada uma lendo a
  aba Recibos inteira de novo** - a mesma aba lida duas vezes, em duas
  execuções completas do Apps Script.
- **Achado extra (não citado pelo usuário, mas real):** `listarNotasEmpenho`
  tinha um **N+1** - pra cada número de NE distinto, chamava
  `valorLiquidadoPorNe_()`, que lia a aba **Recibos inteira** de novo. Com N
  NEs cadastradas, isso lia Recibos N vezes numa chamada só - piora sozinho
  conforme mais NEs são cadastradas (mesma classe de bug já corrigida pra
  `opcaoTemPausaContagem_` na Fase de Performance anterior, ver
  `RELATORIO_LENTIDAO_SOF.md` item 2.5).
- **Achado extra no Dashboard:** `obterDashboard` lia a aba **SOF duas vezes**
  (`dashboardSofPendenteNe_` + `dashboardParados_`) e a aba **Recibos duas
  vezes** (`dashboardRecibos_` + `dashboardParados_`) numa única chamada.

**Correções aplicadas (mesmo padrão de cache de 30s via `CacheService` já
usado em `Usuarios`/`ListasPersonalizadas`, invalidado na escrita - nenhuma
coluna nova, nenhuma mudança visual, nenhuma mudança de contrato dos dados
já entregues ao frontend):**
- `backend/Sof.gs`: nova `todasFontesComCache_()` (30s), invalidada em
  `substituirFontesDoSof_`. `agruparFontesPorSof_`/`listarFontesPorSof_` usam
  o cache em vez de reler a aba.
- `backend/NotasEmpenho.gs`: nova `todasNotasEmpenhoComCache_()` (30s),
  invalidada em `criarNotaEmpenho`. Usada por `listarSof` (números de NE),
  `listarNotasEmpenhoPorSof`, `listarNotasEmpenho` e `totalEmpenhadoSof_`.
  N+1 corrigido: nova `valorLiquidadoAgrupadoPorNe_()` agrupa Recibos por
  `nota_empenho` numa única leitura, substituindo as N chamadas de
  `valorLiquidadoPorNe_(numeroNe)` (função removida, só era usada ali).
- `backend/Recibos.gs`: `listarRecibos` agora calcula e devolve os
  indicadores (`indicadores: { pendentes, total_pago_ano }`) na mesma
  resposta, reaproveitando a mesma leitura/filtro (`calcularIndicadoresRecibos_`,
  extraída como helper compartilhado). `indicadoresRecibos` continua
  existindo como ação separada (não foi removida do `Code.gs`), só deixou de
  ser chamada em conjunto pela tela de Recibos.
- `js/recibos.js`: `carregar()` faz 1 chamada (`listarRecibos`) em vez de 2
  (`Promise.all` com `indicadoresRecibos`), lendo `resposta.indicadores` em
  vez de uma segunda resposta.
- `backend/Dashboard.gs`: `obterDashboard` lê SOF e Recibos **uma vez cada**
  e repassa pros 3 indicadores (`dashboardRecibos_`/`dashboardSofPendenteNe_`/
  `dashboardParados_`, todos com um novo parâmetro opcional de linhas
  pré-carregadas, mesmo princípio do `listasCarregadas` já usado em
  `listarSof`/`listarRecibos`).
- `backend/Unidades.gs`: novas `todasUnidadesComCache_()`/`todasTasComCache_()`
  (30s cada), invalidadas em `criarUnidade`/`atualizarUnidade`/
  `inativarUnidade`/`reativarUnidade` (Unidades) e em `substituirTasDaUnidade_`
  (UnidadesTA). Item que já estava pendente desde o relatório de performance
  anterior ("cache de leitura pra aba Unidades" - RELATORIO_LENTIDAO_SOF.md,
  seção 5).

**Escopo do que NÃO foi mexido, de propósito:** os `findById_` avulsos que
buscam uma única Unidade/SOF/Recibo por id (usados em `criarSof`, `criarRecibo`,
etc.) continuam lendo a aba direto, sem cache - mudar isso exigiria alterar
o helper genérico `findById_` (usado por praticamente todo o backend), risco
maior pra um ganho que não afeta diretamente a troca de aba (o problema
relatado). `Contadores.gs`/`EdicoesEmAndamento.gs` seguem fora deste
repositório, não mexidos.

**Risco a observar conforme a planilha cresce:** `CacheService` tem limite de
~100KB por chave. Com o volume atual de dados (app no ar há poucos dias)
isso não deve ser problema, mas se `SofFontes`/`NotasEmpenho`/`Unidades`
crescerem muito, o cache dessas abas pode passar do limite e silenciosamente
parar de funcionar (a chamada simplesmente volta a ler a aba direto - sem
erro, só sem o ganho). Se a lentidão voltar mais pra frente, checar isso
primeiro.

**Passos manuais do usuário antes de testar:** colar `backend/Sof.gs`,
`backend/NotasEmpenho.gs`, `backend/Recibos.gs`, `backend/Dashboard.gs`,
`backend/Unidades.gs` atualizados no editor do Apps Script e reimplantar.
Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** medir se a troca de aba (SOF principalmente, depois
Recibos) ficou perceptivelmente mais rápida; conferir que os dados exibidos
continuam corretos (Fontes do SOF, números de NE, indicadores de Recibos,
Dashboard) depois das mudanças de leitura; conferir que a invalidação de
cache funciona (ex.: criar uma Nota de Empenho e ver se o card de SOF já
reflete na hora, sem esperar os 30s).

**Complemento (mesma sessão, depois do merge com o trabalho de OSS/Objeto):**
o merge trouxe duas leituras novas que também liam abas sem usar o cache já
criado - corrigidas: `listarNotasEmpenho` (`unidadesPorId`, em
`NotasEmpenho.gs`) e `mapaDeaPorNumeroNe_` (em `Recibos.gs`, usado pelo
filtro DEA de Recibos) agora usam `todasUnidadesComCache_()`/
`todasNotasEmpenhoComCache_()` em vez de reler a aba direto.

### Complemento 2 — números reais do usuário revelam 3 problemas a mais (sessão 2026-07-17)

Usuário testou e relatou números concretos: troca de aba 2-3s (igual, sem
mudança perceptível), **abrir edição de SOF 6-7s**, **trocar andamento 4-5s**,
**fechar edição 4-5s**. Isso levou a coletar `backend/EdicoesEmAndamento.gs`
(nunca estava neste repositório - agora está, ver seção de Referências) pra
investigar, e a achar 3 problemas novos, dois deles fora do que já tinha sido
mapeado:

1. **`findById_(getSheet_(SHEETS.UNIDADES), id)` nos caminhos de escrita** -
   a rodada anterior deixou esses `findById_` avulsos de propósito fora do
   cache (risco vs. ganho), mas isso explicava sozinho boa parte dos 4-5s de
   "trocar andamento": toda chamada de `atualizarSof` faz
   `recalcularDivergenciaSof_`, que lia a aba **Unidades inteira** de novo, além
   da leitura/escrita da própria SOF. **Corrigido:** nova
   `buscarUnidadePorId_(id)` (`backend/Unidades.gs`) usa o cache de 30s já
   existente; troca aplicada nos 5 pontos que faziam esse lookup somente-leitura
   (`Sof.gs`: `recalcularDivergenciaSof_`, `criarSof`; `Recibos.gs`: `criarRecibo`,
   `criarGrupoParcelaDivididaRecibo`, `atualizarRecibo`).
2. **`obterSof` era uma requisição redundante** - `listarSof` já calcula fontes,
   total e destaque de "parado" pra montar cada card (os mesmos dados que
   `obterSof` busca de novo). `js/sof.js` (`abrirSofExistente`) passou a
   reaproveitar `itens.find(s => s.id === id)`, mesmo padrão que
   `abrirReciboExistente` já usava (`itens.find`, sem `obterRecibo`). Isso
   elimina uma requisição inteira do caminho de abrir a edição de SOF -
   provavelmente a explicação principal pros 6-7s (2 chamadas sequenciais em
   vez de 1, cada uma com um piso de latência considerável do Apps Script Web
   App).
3. **Achado mais importante: o spinner global bloqueava a tela em chamadas que
   o código já tratava como "fire and forget".** `Api.chamar` (`js/api.js`)
   sempre mostrava/escondia o spinner (`UI.mostrarCarregando`/`esconderCarregando`),
   **mesmo quando o chamador não esperava (`await`) a resposta** - então
   `marcarSofVisualizado`/`marcarReciboVisualizado` (já "fire and forget" desde
   a rodada anterior) e a limpeza de `liberarEdicao` ao fechar um modal (que já
   tinha sumido da tela) travavam a interface do mesmo jeito, pelo tempo que a
   requisição levasse - isso era a causa direta dos "fechar edição: 4-5s"
   relatados (o modal já tinha fechado, mas o spinner global ficava por cima
   até `liberarEdicao` terminar).
   **Corrigido:** `UI.mostrarCarregando`/`esconderCarregando` (`js/app.js`)
   viraram um contador em vez de um toggle simples (pra chamadas concorrentes
   não se atropelarem escondendo o spinner uma da outra); `Api.chamar` ganhou
   `opcoes.silencioso` pra pular o spinner por completo - aplicado em
   `sairDaEdicao` (`js/edicao-simultanea.js`, usado tanto por SOF quanto
   Recibo) e nos dois `marcarXVisualizado`.

**Isso também revela algo mais amplo:** o piso de latência de uma chamada ao
Apps Script Web App hoje parece estar mais perto de **4-5s** do que os 1-3s
estimados no relatório original (`RELATORIO_LENTIDAO_SOF.md`) - mesmo
`liberarEdicao`, que só lê/escreve uma aba pequena de 5 colunas, levava esse
tempo. Com esse piso mais alto, a alavanca que mais importa é **reduzir a
quantidade de requisições por ação** (itens 2 e 3 acima), já que otimizar o
conteúdo de uma chamada individual (item 1, cache) ajuda menos proporcionalmente
do que cortar uma chamada inteira.

**Passos manuais do usuário antes de testar:** colar `backend/Sof.gs`,
`backend/Recibos.gs`, `backend/Unidades.gs` atualizados (mudou de novo depois
do complemento 1) e reimplantar. Frontend (`js/sof.js`, `js/recibos.js`,
`js/api.js`, `js/app.js`, `js/edicao-simultanea.js`) só precisa do push
(GitHub Pages).

**Ainda não testado:** medir os 4 tempos de novo (troca de aba, abrir edição
de SOF, trocar andamento, fechar edição) depois de colar/reimplantar e do
GitHub Pages atualizar; confirmar que `buscarUnidadePorId_` não quebrou
nenhuma validação de divergência/snapshot; confirmar que abrir um SOF pela
lista continua mostrando os dados certos sem o `obterSof`.

### Complemento 3 — abrir edição vira otimista, sem esperar a checagem de conflito (sessão 2026-07-17)

Depois do complemento 2, sobrou só uma chamada bloqueante no caminho de abrir
uma edição: `abrirEdicao` (checagem de conflito de edição simultânea). Ela é
leve (lê/escreve uma aba de 5 colunas), então o tempo que ainda levava era o
piso de latência do Apps Script Web App em si - não dava mais pra cortar via
cache. A solução foi arquitetural, não de otimização de conteúdo:

**Antes:** espera `abrirEdicao` responder → só depois mostra o formulário (ou
o aviso de conflito).
**Agora:** mostra o formulário **na hora** (dado já local, via `itens.find` -
zero espera de rede) e roda `abrirEdicao` **em paralelo**, em segundo plano.
Se vier conflito, um aviso aparece alguns instantes depois, **dentro do
formulário já aberto** (não substitui o modal) - o usuário decide "Sair" ou
"Continuar mesmo assim", igual já funcionava antes, só que sem bloquear a
abertura no caso comum (ninguém mais editando).

- `js/edicao-simultanea.js`: reescrito. `entrarEmEdicao` (bloqueante, com seu
  próprio modal interno) virou duas funções: `iniciarEdicao` (dispara
  `abrirEdicao` e devolve a promise crua, sem esperar) e `tratarConflito`
  (chamada depois que o formulário já abriu; se a promise voltar com
  conflito, injeta um aviso - `.aviso-edicao-simultanea`, novo em
  `css/style.css` - no topo do `#modalCorpo` já visível, com os botões
  Sair/Continuar).
- **Cuidado de correção que essa mudança exigiu:** no clique de "Sair", o
  código zera o callback de `UI.aoFecharModal` antes de fechar (`UI.aoFecharModal(() => {})`).
  Motivo: esse callback já tinha sido registrado ao abrir o formulário
  (assumindo que a edição seria nossa), mas em caso de conflito a trava
  nunca chegou a ser assumida por nós (`abrirEdicao` não sobrescreve a linha
  quando detecta que é de outro usuário) - sem esse cuidado, fechar chamaria
  `liberarEdicao` e apagaria a trava de edição **de outra pessoa**, que
  continua editando de verdade.
- `js/sof.js` (`abrirSofExistente`) e `js/recibos.js` (`abrirReciboExistente`):
  passam a chamar `EdicaoSimultanea.iniciarEdicao(...)` sem `await` antes de
  abrir o formulário, e `EdicaoSimultanea.tratarConflito(...)` (também sem
  `await`) depois - o formulário abre imediatamente com o dado de `itens`.

**Passos manuais do usuário antes de testar:** nenhum novo no backend (só
frontend: `js/edicao-simultanea.js`, `js/sof.js`, `js/recibos.js`,
`css/style.css` - GitHub Pages).

**Ainda não testado:** abrir uma edição e sentir se ficou instantâneo;
simular o conflito de verdade (dois logins/abas editando o mesmo SOF ou
Recibo) e conferir que o aviso aparece corretamente dentro do formulário já
aberto, que "Continuar mesmo assim" assume a trava e some com o aviso, e que
"Sair" fecha sem apagar a trava do outro usuário.

**Bug corrigido no mesmo complemento (usuário testou e só sentiu 1-2s de
ganho, não o esperado):** `iniciarEdicao` (a chamada de `abrirEdicao`) e
`listarNotasEmpenhoPorSof` (SOF) foram disparadas **sem** `opcoes.silencioso`.
Como `#sobreposicaoCarregando` (spinner global, `z-index: 70`) fica **acima**
de `#sobreposicaoModal` (`z-index: 40`), o formulário renderizava por baixo
instantaneamente, mas o spinner continuava cobrindo a tela até essas duas
chamadas responderem - na prática anulando quase todo o ganho da abertura
otimista. Corrigido: as duas passaram a usar `{ silencioso: true }`.

## Sessão 2026-07-18 — Excluir Recibo, editar/excluir em Listas Personalizadas, Nova Nota de Empenho (em andamento)

Pedido do usuário com 3 itens. Decisões tomadas antes de implementar:
1. Nova Nota de Empenho (item 3) continua vinculada a um SOF (selecionado no formulário) — não vira uma NE avulsa sem SOF.
2. O cronograma de desembolso (valores mensais extraídos por OCR) é só informativo por enquanto — não substitui a `parcela_mensal` da fonte do SOF no cálculo do alerta "abaixo da parcela mensal" (Fase 4).
3. Campos lidos por OCR (Número, cronograma, Preço Total) travam (somente leitura) depois da leitura, com link "Remover anexo" pra refazer — mesmo padrão já usado nos anexos de Recibo.

### Item 1 — Excluir Recibo (CÓDIGO CONCLUÍDO, aguardando o usuário colar/implantar e ajustar a planilha)
Mesmo padrão de exclusão lógica já usado em SOF (`excluirSof`)/Unidades: ícone de lixeira no canto esquerdo de cada linha da tabela de Recibos; ao clicar, abre modal com aviso vermelho em caixa alta ("TEM CERTEZA QUE QUER EXCLUIR ESSE PROCESSO?", reaproveitando a classe `.aviso-exclusao` já existente) antes de confirmar.
- `backend/Utils.gs`: `HEADERS.Recibos` ganha `excluido`/`excluido_por`/`excluido_em`; `COLUNAS_BOOLEANAS.Recibos` ganha `excluido`.
- `backend/Recibos.gs`: nova `excluirRecibo(session, id)` (qualquer perfil, mesmo princípio de `excluirSof` — sem trava de dono); `criarRecibo`/`criarGrupoParcelaDivididaRecibo` inicializam `excluido: false`; `filtrarLinhasRecibos_` (usada por `listarRecibos` e `indicadoresRecibos`) passa a esconder linhas excluídas por padrão, sem opção de "mostrar excluídos" (mesmo comportamento do SOF — sem restaurar).
- `backend/Code.gs`: novo `case 'excluirRecibo'`.
- `js/recibos.js`: nova coluna de ícone (lixeira) na tabela; `confirmarExclusaoRecibo`.

**Passo manual pendente do usuário:** na aba **Recibos** da planilha, criar as colunas `excluido`, `excluido_por`, `excluido_em`; colar `backend/Utils.gs`, `backend/Recibos.gs`, `backend/Code.gs` no editor do Apps Script e reimplantar.
**Ainda não testado.**

### Item 3 — Listas Personalizadas: editar/excluir por item (CÓDIGO CONCLUÍDO, aguardando o usuário colar/implantar)
Substituiu os botões "Alternar pausa"/"Alternar ativa" e as colunas "Ativa"/"Ações" por ícones de lápis (editar) e lixeira (excluir) por linha, mesmo padrão visual de `js/unidades.js`. Editar abre o mesmo modal de criação, pré-preenchido, reaproveitando `atualizarOpcao`. Excluir é **exclusão física** (`deleteRow_`, não lógica) — decisão: como SOF/Recibo guardam o texto da opção direto na própria linha (não uma FK), remover uma opção da lista não deixa nada órfão em processos já existentes, só deixa de aparecer para novos cadastros.
- `backend/ListasPersonalizadas.gs`: nova `excluirOpcao(session, id)` (gerente, `deleteRow_` + invalida cache).
- `backend/Code.gs`: novo `case 'excluirOpcao'`.
- `js/listas.js`: `abrirFormulario` aceita `opcaoExistente` opcional (edição); `renderTabela` sem colunas Ativa/Ações, com ícones lápis/lixeira (gerente); `confirmarExclusaoOpcao`.
- `css/style.css`: `.tabela-acoes` (novo, só layout dos dois ícones lado a lado).

**Passo manual pendente do usuário:** colar `backend/ListasPersonalizadas.gs`, `backend/Code.gs` no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.
**Ainda não testado.**

### Item 2 — Nova Nota de Empenho com OCR (CÓDIGO CONCLUÍDO, regex NÃO calibrado contra o OCR real — aguardando o usuário colar/implantar e testar)

Botão "Nova Nota de Empenho" na tela de Notas de Empenho: usuário escolhe Unidade → SOF → Fonte, anexa o documento da NE já existente, e o OCR preenche Número/cronograma de desembolso (valores por mês)/Preço Total, travando os campos com link "Remover anexo" pra refazer (mesmo padrão de `ligarAnexoComOcr_` já usado em Recibos).

O usuário forneceu um documento de exemplo real (Nota de Empenho do e-fisco/PE) usado para desenhar os regex de extração. **Atenção:** diferente do OCR de Recibo (já validado em produção), estes regex foram calibrados a partir do texto extraído do PDF por uma ferramenta externa (não pelo pipeline real do backend - Advanced Drive Service/`extrairTextoOcr_`), que pode preservar a ordem de leitura do documento de um jeito diferente do OCR real. **Se o número/cronograma/preço total vier errado no primeiro teste, é o próximo passo a corrigir antes de qualquer outra coisa** (mesmo processo que já aconteceu com o OCR de Recibo, que precisou de um ajuste de sintaxe da Drive API v2→v3 depois do primeiro teste real).

**Dados:**
- Nova aba **NotasEmpenhoCronograma** (`id, nota_empenho_id, mes, valor, criado_por, data_criacao`) — mesmo padrão child-table de SofFontes/UnidadesTA. Cronograma é só informativo (decisão do usuário) — não altera o cálculo do alerta "abaixo da parcela mensal" (que continua comparando com `parcela_mensal` da fonte do SOF, Fase 4).
- `backend/Contadores.gs` (cópia local): novo `NotasEmpenhoCronograma: 'NEC'` em `PREFIXOS_ID`.

**Backend (`backend/NotasEmpenho.gs`):**
- `MESES_CRONOGRAMA` (12 regex, um por mês, ex. `JANEIRO\s*:?\s*([\d.,]+)`, com `MAR[ÇC]O` pra tolerar OCR sem cedilha) + `REGEX_PRECO_TOTAL_NE_DOCUMENTO` (usa lookbehind `(?<!PRE[ÇC]O\s)\bTOTAL...` pra distinguir do cabeçalho "PREÇO TOTAL" da tabela de itens e casar só com o rodapé "TOTAL" perto de "LOCALIDADE DE ENTREGA").
- Nova `lerAnexoNotaEmpenho(session, params)`: reaproveita `extrairTextoOcr_`/`normalizarValorMonetarioBr_` (Utils.gs) e `REGEX_NUMERO_NE_DOCUMENTO` (já existente em Recibos.gs, mesmo formato de número em qualquer documento do e-fisco/PE); devolve `{ numero_ne, cronograma: [{mes,rotulo,valor}], preco_total, cronograma_diverge_do_total }` — a divergência é só um aviso não bloqueante no frontend (o preço total oficial impresso manda, o cronograma é informativo).
- `criarNotaEmpenho`: aceita `dados.cronograma` opcional (só quando `tipo === 'original'`) e grava cada mês em `NotasEmpenhoCronograma`.
- `listarNotasEmpenho`: cada grupo (card) passa a expor `cronograma` (do `nota_empenho_id` da NE "original" do grupo, via novo `agruparCronogramaPorNotaEmpenho_`/cache de 30s `todoCronogramaComCache_`).
- `backend/Code.gs`: novo `case 'lerAnexoNotaEmpenho'`.

**Frontend (`js/notas-empenho.js`):** botão "+ Nova Nota de Empenho"; modal com Unidade→SOF→Fonte em cascata (`listarSof` filtrado por unidade) e anexo com OCR; card ganha link "Ver cronograma de desembolso" (expansível, só aparece se houver cronograma salvo).
**CSS:** `.cartao-ne-cronograma`/`.cronograma-ne-grade` (novo).

**Passos manuais pendentes do usuário antes de testar:**
1. Criar a aba **NotasEmpenhoCronograma** na planilha com cabeçalho `id, nota_empenho_id, mes, valor, criado_por, data_criacao`.
2. No editor do Apps Script, adicionar `NotasEmpenhoCronograma: 'NEC'` ao mapa `PREFIXOS_ID` em `Contadores.gs`.
3. Colar `backend/NotasEmpenho.gs`, `backend/Code.gs`, `backend/Utils.gs` e reimplantar.

**Ainda não testado** (nenhum teste real feito ainda): leitura OCR do documento de exemplo ponta a ponta; se número/cronograma/preço total vêm certos; aviso de divergência cronograma×total; card mostrando o cronograma corretamente.

## Sessão 2026-07-20 (parte 2) — Reconciliação do `/backend` local com o editor real do Apps Script

O usuário colou aqui o conteúdo real e atual de **todos** os arquivos do
editor do Apps Script (incluindo `Contadores.gs`, `Seed.gs` e
`appsscript.json`, que nunca tinham sido versionados neste repositório).
Comparação com o que estava no `/backend` local:

- **Idênticos, sem nenhuma mudança necessária:** `Auth.gs`, `Dashboard.gs`,
  `EdicoesEmAndamento.gs`, `Unidades.gs`, `Usuarios.gs`, `LogAuditoria.gs`,
  `Sof.gs`, `Code.gs`, `ListasPersonalizadas.gs`, `Recibos.gs` — a
  reconstrução da sessão anterior (parte 1) bateu exatamente com o que já
  estava implantado.
- **Adicionados ao repositório** (existiam só no editor, nunca tinham cópia
  local): `backend/Contadores.gs`, `backend/Seed.gs`, `backend/appsscript.json`.
  `Contadores.gs` confirma que `PREFIXOS_ID` **já tem** `NotasEmpenhoCronograma: 'NEC'`
  — a pendência registrada na sessão de 2026-07-18 (item "adicionar NEC ao
  mapa") **já estava resolvida**, não precisa de ação.
- **Divergências reais, corrigidas em `backend/Utils.gs`:**
  `HEADERS.NotasEmpenho` no repositório estava incompleto (`['id', 'sof_id',
  'tipo', 'numero_ne', 'valor', 'periodo', 'criado_por', 'data_criacao']`,
  faltando `fonte`/`arquivo_drive_id`/`arquivo_url`, que `criarNotaEmpenho`
  já grava há tempo na aba real). Isso nunca quebrou nada em produção porque
  `appendObjectRow_`/`updateObjectRow_` usam o cabeçalho **real** da planilha,
  não essa constante — só importa se alguém rodar `configurarPlanilha()` numa
  planilha nova do zero. Corrigido, e adicionado `mes_referencia` (novo campo
  desta sessão, ver abaixo).
- **Divergência real, corrigida em `backend/NotasEmpenho.gs`:** a versão
  reconstruída na sessão anterior tinha ficado **mais permissiva** do que a
  real em dois pontos de `lerAnexoNotaEmpenho` — a versão real **exige** que
  os 12 meses do cronograma sejam identificados no documento (falha se
  faltar qualquer um) e **exige** o Preço Total (falha se não achar), sem a
  tolerância que eu tinha adicionado. Também corrigido:
  `REGEX_PRECO_TOTAL_NE_DOCUMENTO` voltou para o padrão exato real (sem o
  `R?\$?\s*` que eu tinha acrescentado sem necessidade), e a pasta do Drive
  da NE voltou a ser referenciada como literal inline (não uma variável nova
  que eu tinha introduzido). Nenhuma dessas correções muda comportamento já
  implantado — só faz o arquivo local bater com o que roda de verdade antes
  de eu empilhar as mudanças novas (mes_referencia + situação do cronograma,
  descritas na seção anterior) por cima.

**Conclusão prática:** dos 5 arquivos que a sessão anterior listou pra colar,
só **`backend/Utils.gs`** e **`backend/NotasEmpenho.gs`** de fato mudaram
(agora corretos, reconciliados com o real). `Code.gs`, `ListasPersonalizadas.gs`
e `Recibos.gs` já estavam certos — não precisam ser recolados. Os passos
manuais continuam os mesmos da seção anterior (coluna `mes_referencia` em
NotasEmpenho; confirmar `excluido`/`excluido_por`/`excluido_em` em Recibos),
**exceto** o item do prefixo `NEC` em `Contadores.gs`, que já está lá.

## Sessão 2026-07-20 — Dropdown pesquisável, redesenho de SOF/NE, situação do cronograma (CÓDIGO CONCLUÍDO, aguardando o usuário colar/implantar e testar)

Pedido do usuário com vários itens. Antes de implementar, foi confirmado com o usuário: o campo "Número do Processo" pedido como obrigatório no SOF é o campo **SEI** já existente (só mudou o rótulo exibido).

**Achado nesta sessão, corrigido como pré-requisito:** o mirror local `/backend` estava desatualizado em relação ao que o usuário confirmou já estar rodando de verdade no editor do Apps Script - `excluirOpcao` (Listas Personalizadas), `excluirRecibo` e `lerAnexoNotaEmpenho`/cronograma de desembolso (Notas de Empenho), todos com UI no frontend já prontos desde a sessão de 2026-07-18, mas sem `case` correspondente em `Code.gs` nem função nos `.gs` deste repositório. Reconstruído aqui a partir da especificação detalhada já registrada na sessão de 2026-07-18 (regexes de OCR, `NotasEmpenhoCronograma`, etc.) - **se o que está rodando de verdade no Apps Script divergir do que foi colado aqui, avisar pra ajustar.**

### 1. Dropdown pesquisável em todo o app
`js/app.js` (`UI.tornarPesquisavel`): novo componente que transforma qualquer `<select>` num combo com busca (progressive enhancement - o `<select>` original continua a fonte de verdade de `.value`/`change`, só fica escondido). Aplicado em todo `<select>` alimentado por lista dinâmica (Unidade, OSS, Objeto, Tipo de unidade, Status, Competência, SOF, Nota de Empenho, Mês) nas telas de SOF, Notas de Empenho, Recibos e Dashboard - não aplicado aos selects de 2-4 opções fixas (Fonte, DEA, perfil, tipo de NE).
**CSS:** `.select-pesquisavel*` (novo).

### 2. SOF - formulário e card (`js/sof.js`, `css/style.css`)
- Campo **OSS** virou `<select>` (lista `ListasPersonalizadas` tipo OSS), pesquisável; se o snapshot atual não estiver na lista, entra como opção extra pra não perder dado.
- Rótulo do campo SEI virou **"Número do Processo"** (mesmo campo/validação, só o texto exibido).
- Nº SOF, DEA e Período (início/fim) já eram obrigatórios antes desta sessão - confirmado, sem mudança de comportamento aí.
- **Stepper de Andamento saiu do modal de edição e foi pro próprio card da listagem** - as 13 etapas ficam à mostra e são clicáveis direto na lista, sem precisar abrir "Editar SOF" (mesma regra de antes: nó "NE EMITIDA" só libera com `possui_ne`).
- **Botão "Adicionar Nota de Empenho" foi removido** - o mini-formulário de NE dentro da edição de SOF continua existindo, mas só é salvo/criado junto com o clique em "Salvar" do formulário principal (se todos os campos da NE ficarem vazios, nenhuma NE é criada nesse Salvar).
- Tabela de NE dentro do SOF: coluna "Valor" renomeada para **"Valor Empenhado"**.
- **Card de SOF redesenhado**, maior e mais espaçado: id do processo + pill de dias parado + lixeira no topo; Nº SOF como título grande; unidade como subtítulo; caixa de informações (Número do Processo/Objeto/Fonte/Total Solicitado); andamento com stepper embutido; rodapé com selo de NE + botão "Abrir processo".

### 3. Notas de Empenho (`js/notas-empenho.js`, `css/style.css`, `backend/NotasEmpenho.gs`)
- Modal "Nova Nota de Empenho": ao escolher tipo **Reforço**, os campos Unidade/SOF somem e aparece só um combo pesquisável **"Nota de Empenho a Reforçar"** (busca em todas as NEs do sistema, não só de uma unidade - `sof_id`/`fonte` são resolvidos a partir da NE escolhida).
- Reforço (tanto no botão "+ Reforço" do card quanto no modal "Nova Nota de Empenho") ganhou o campo obrigatório **"Mês de referência do reforço"** (novo campo `mes_referencia` em `NotasEmpenho`, só gravado pra linhas `tipo=reforco`).
- Card de NE redesenhado: cabeçalho com ícone+fonte/SOF, número grande, unidade, grid 2x2 (Valor bruto/Liquidado/Saldo atual/Parcela de referência), rodapé com "Ver cronograma"/arquivos + botão "+ Reforço".
- Cronograma expandido: caixa com cabeçalho "CRONOGRAMA DE DESEMBOLSO" + badge de meses, tabela Mês/Valor previsto/**Situação** (pill colorida), rodapé com total.
- **Situação por mês** (`Previsto`/`Em processamento`/`Liquidado`/`Pago`), calculada no backend (`listarNotasEmpenho`/`situacaoCronogramaMes_`): compara o mês do cronograma (+ ano tirado dos 4 primeiros dígitos do `numero_ne`) contra `Recibos.competencia` de recibos com aquele `nota_empenho` - sem Recibo = Previsto; `status=PAGO` = Pago; status contendo "LIQUID" = Liquidado; qualquer outro status = Em processamento. **Suposição assumida** (avisar se o fluxo real de status não usar a palavra "LIQUID" em nenhuma opção): pode precisar ajustar esse critério depois de testar com os status reais cadastrados em Listas Personalizadas.
- Reforços com `mes_referencia` aparecem como uma etiqueta "+ reforço" no mês correspondente do cronograma (só informativo, não muda a Situação).

### Passos manuais pendentes do usuário antes de testar
1. Na planilha, aba **NotasEmpenho**: adicionar a coluna `mes_referencia` (se ainda não existir) - além de já ter `fonte`, `arquivo_drive_id`, `arquivo_url` (Fase anterior).
2. Confirmar que a aba **NotasEmpenhoCronograma** existe (`id, nota_empenho_id, mes, valor, criado_por, data_criacao`) e que `NotasEmpenhoCronograma: 'NEC'` já está no mapa `PREFIXOS_ID` de `Contadores.gs` - segundo a sessão de 2026-07-18 isso já foi feito, só confirmar.
3. Na planilha, aba **Recibos**: confirmar que as colunas `excluido`, `excluido_por`, `excluido_em` existem (pendência também da sessão de 2026-07-18).
4. Colar `backend/Utils.gs`, `backend/Code.gs`, `backend/ListasPersonalizadas.gs`, `backend/Recibos.gs`, `backend/NotasEmpenho.gs` no editor do Apps Script e reimplantar - **revisar o diff contra o que já está lá antes de colar**, já que parte deste commit reconstrói funcionalidade que o usuário confirmou já estar rodando (ver "Achado nesta sessão" acima).

**Ainda não testado** (nenhum teste real feito ainda nesta sessão): dropdown pesquisável em uso real; autopreenchimento de OSS via Unidade com o campo agora sendo select; stepper clicável direto no card; Salvar de SOF criando a NE junto; combo de busca de "Nota de Empenho a Reforçar" cruzando unidades; cálculo de Situação do cronograma contra Recibos reais.

## OCR de Nota de Empenho - bug real de cronograma + Fonte automática + ligado no mini-formulário do SOF (sessão 2026-07-21)

Usuário reportou que o OCR de NE "não funciona" no mini-formulário de NE embutido na edição de SOF, e enviou um documento real (`2026NE000078...pdf`) que expôs um bug de verdade, além de pedir que Número/Fonte/Valor Empenhado sejam preenchidos automaticamente ali (esse mini-formulário nunca tinha tido OCR - só o botão separado "Nova Nota de Empenho", ver sessão 2026-07-18, tinha).

**Bug real encontrado com o documento de exemplo:** o texto extraído desse layout lista os **12 rótulos dos meses primeiro** ("JANEIRO: FEVEREIRO: MARÇO: ABRIL:" em blocos de linha, cabeçalho da tabela) **e só depois os 12 valores**, um por linha, na mesma ordem - nunca "MÊS: valor" adjacentes como o regex por mês (`/JANEIRO\s*:?\s*([\d.,]+)/i`) exigia. Isso fazia `lerAnexoNotaEmpenho` falhar sempre no primeiro mês, antes mesmo de chegar em Número/Preço Total - exatamente a causa do "não está funcionando" relatado (mesma classe de problema já prevista no aviso da sessão de 2026-07-18: "NÃO calibrado ainda contra o OCR real").

**Corrigido (`backend/NotasEmpenho.gs`):**
- Nova `extrairCronogramaDesembolso_`: em vez de casar rótulo+valor por mês, isola a seção entre "CRONOGRAMA DE DESEMBOLSO" e o próximo cabeçalho conhecido, e pega os 12 valores monetários que aparecem nela, na ordem (Janeiro a Dezembro é a ordem sempre impressa) - robusto ao formato real de extração observado.
- Cronograma virou **best-effort**: se não achar os 12 valores, `lerAnexoNotaEmpenho` não falha mais por causa disso (antes, qualquer mês não encontrado derrubava a leitura inteira, mesmo Número/Preço Total já tendo sido lidos) - só Número e Preço Total continuam obrigatórios.
- **Fonte automática (pedido novo do usuário):** o documento não traz a categoria TESOURO/SUS/Outra usada pelo app, só um código orçamentário de 10 dígitos (`FONTE: 0605000000` no exemplo). Nova `REGEX_CODIGO_FONTE_NE_DOCUMENTO` (único campo do documento com exatamente 10 dígitos sem separador) + `classificarFonteDoCodigoOrcamentario_`, com a convenção **confirmada com o usuário**: prefixo `500` = TESOURO, `600` ou `605` = SUS, `754` = Operação de Crédito (sem categoria própria no app - cai em "Outra"). Prefixo não reconhecido devolve `null` (campo fica sem sugestão, não arrisca uma classificação errada). `lerAnexoNotaEmpenho` passou a devolver `fonte`/`fonte_codigo`.

**Ligado no mini-formulário de NE do SOF (`js/sof.js`):** nova `ligarOcrMiniFormularioNe_` - ao anexar o arquivo em `neArquivo`, chama `lerAnexoNotaEmpenho` e preenche/trava Número (só quando Tipo = original - em Reforço o Número já vem de um `<select>` de números existentes), Fonte (só trava se o código foi classificado E a categoria existir nas opções daquele SOF) e Valor Empenhado, com link "Remover anexo" pra refazer - mesmo padrão visual (`.anexo-ocr-status`/`.anexo-ocr-remover`) já usado em Recibos/Notas de Empenho, sem CSS novo.

**Passos manuais do usuário antes de testar:** colar `backend/NotasEmpenho.gs` atualizado e reimplantar. Nenhuma coluna/aba nova.

**Ainda não testado:** reler o documento de exemplo (ou outro real) no mini-formulário do SOF e conferir se Número/Fonte/Valor vêm certos; conferir que o cronograma (usado pelo botão "Nova Nota de Empenho" separado) passa a extrair os 12 meses corretamente com esse mesmo documento; testar um código de Fonte de cada categoria (500/600 ou 605/754) pra confirmar a classificação.

**Nota de reconciliação:** em paralelo a esta correção, o repositório também recebeu (de outra sessão/cópia real do Apps Script) o trabalho de performance e filtros multi-seleção descrito nas duas seções abaixo ("Sessão 2026-07-22" e "Lentidão ao trocar andamento no SOF"). Durante essa reconciliação, `backend/Recibos.gs` chegou a ficar temporariamente com o conteúdo errado (uma cópia de `backend/NotasEmpenho.gs` por cima do próprio) - percebido e corrigido antes de qualquer commit ou de ir pro Apps Script real, então nada em produção foi afetado.

## Sessão 2026-07-22 — Ajustes de UX nos filtros (CONCLUÍDO, só frontend/backend leve, sem passo manual)

Três pedidos pequenos do usuário, todos já colados/reimplantados quando aplicável e testados:

- **Visual dos filtros de múltipla escolha** (`css/style.css`): `.campo input` estava vazando `width:100%`/padding pros checkboxes das listas suspensas (empilhava o checkbox em cima do texto em vez de lado a lado) — corrigido excluindo `[type=checkbox]`/`[type=radio]` dessa regra (efeito colateral bom: também corrige a aparência de *todo* checkbox dentro de um `.campo` no app inteiro, não só os das listas). `.campo-filtro-multiplo` virou grid de 2 linhas (rótulo em cima, dropdown+botão "x" embaixo) em vez do flex desalinhado anterior. Botão "x" reduzido de 34px para 26px.
- **Recarregamento desnecessário** (`js/sof.js`, `js/recibos.js`, `js/notas-empenho.js`): "Filtrar"/Enter, "Limpar filtros" e o "x" individual de cada filtro disparavam `carregar()` (spinner + chamada à API) mesmo sem nenhuma mudança real nos filtros. Cada tela agora guarda o último filtro carregado (`ultimoFiltroJson`) e só recarrega se o snapshot atual diverge dele. `notas-empenho.js` ganhou uma `filtrosAtuais()` própria (antes os parâmetros eram montados direto dentro de `carregar()`) pra poder reaproveitar a comparação.
- **Filtros na tela de Unidades** (`js/unidades.js`, `backend/Unidades.gs`): não existiam (só o checkbox "Somente ativas"). Adicionados Busca livre (substring em todos os campos, mesmo padrão das outras telas), **Unidade** (múltipla escolha por nome — pedido à parte, adicionado depois; usa uma segunda leitura sem filtro, `todasUnidades`, só pra popular esse dropdown, separada da lista já filtrada exibida nos cartões), Tipo (múltipla escolha, mesma lista fixa `OPCOES_TIPO` já usada no formulário) e OSS (múltipla escolha, mesma lista de Listas Personalizadas usada em SOF/Recibos/NE), com os mesmos botões "Filtrar"/"Limpar filtros" e a mesma otimização de "só recarrega se mudou" acima. `listarUnidades` (`backend/Unidades.gs`) ganhou os parâmetros `busca`/`unidade_id`/`tipo`/`oss`, reaproveitando `paraArrayFiltro_` (`Utils.gs`) já usado em `listarSof`. Chamadas existentes de `listarUnidades` sem esses parâmetros (SOF/Recibos/NE carregando a lista de unidades pros próprios formulários) continuam funcionando sem filtro, como antes.

**Passo manual pendente:** colar `backend/Unidades.gs` atualizado no editor do Apps Script e reimplantar (só esse arquivo mudou no backend; os outros dois itens são só frontend).

### Lentidão ao trocar andamento no SOF (2-7s) — investigado e corrigido (aguardando o usuário colar/implantar e medir)

Usuário relatou 2-7s ao clicar num nó do stepper direto no card (fluxo introduzido na sessão de 2026-07-20, quando o stepper saiu do modal e foi pro card da lista). O frontend (`avancarEtapaCartao`, `js/sof.js`) já fazia só 1 chamada (`atualizarSof`) sem recarregar a lista - o problema estava inteiro no backend, em `registrarDiferencas_` (log de auditoria):

- Uma troca de andamento muda `andamento` **e também** dois campos derivados automaticamente (`data_ultima_alteracao_andamento`, `visualizado_apos_alerta`) - `registrarDiferencas_` gravava **uma linha de log por campo mudado**, ou seja, até 3 linhas pra uma ação que o usuário só vê como "mudei o andamento".
- Cada linha de log chamava `proximoId_('LogAuditoria')`, que faz `LockService.getScriptLock()` + leitura + escrita na aba **Contadores** - um lock completo só pra gerar 1 ID. 3 campos mudando = 3 ciclos de lock, cada um podendo esperar por outros usuários/chamadas concorrentes.
- Cada linha de log também era `appendObjectRow_` isolado (sua própria leitura de cabeçalho + `setNumberFormats` + `setValues`).

Ou seja, uma troca de andamento podia disparar até **3 locks + 3 escritas de log**, além da própria leitura/escrita do SOF - explica bem a variação de 2 a 7s (pior quando havia outro usuário disputando o lock).

**Corrigido:**
1. `data_ultima_alteracao_andamento`/`visualizado_apos_alerta` (SOF) e o par equivalente `data_ultima_alteracao_status`/`visualizado_apos_alerta` (Recibo) saem do escopo do log de auditoria (`camposIgnorados` em `atualizarSof`/`atualizarRecibo`) - são campos derivados/internos, não uma edição real do usuário, e não deveriam gerar linha de auditoria mesmo (efeito colateral bom: log fica mais limpo, sem essas 2 linhas técnicas por edição).
2. Nova `proximosIds_(nomeAba, quantidade)` (`backend/Contadores.gs`) reserva vários IDs de uma vez com **um único** lock/leitura/escrita na aba Contadores, em vez de um ciclo por ID. `proximoId_` (já usada em todo o resto do backend) vira só `proximosIds_(nomeAba, 1)[0]` - comportamento idêntico pra quem já chama com 1.
3. Nova `appendObjectRows_(sheet, objs)` (`backend/Utils.gs`) grava várias linhas numa única chamada (`setNumberFormats`/`setValues` em lote), reaproveitando o cálculo de formato já usado por `protegerFormatoLinha_` (extraído pra `formatoColunas_`).
4. `registrarDiferencas_` (`backend/LogAuditoria.gs`) agora monta todas as linhas de diferença primeiro, reserva todos os IDs de uma vez (`proximosIds_`) e grava tudo com uma única `appendObjectRows_` - pro caso comum de trocar só o andamento (depois do item 1), isso já vira **1 lock + 1 escrita** de log, igual a uma edição de campo único.

Efeito esperado: pra uma troca de andamento pura, a chamada `atualizarSof` cai de "leitura do SOF + escrita do SOF + até 3 ciclos de lock/escrita de log" pra "leitura do SOF + escrita do SOF + 1 ciclo de lock/escrita de log". Continua existindo 1 leitura não-cacheada da aba SOF inteira (`findById_`) no início de `atualizarSof` - decisão deliberada de não mexer nisso ainda (ver sessão de performance de 2026-07-17: cache pra SOF/Recibo tem risco maior de introduzir bug de dado desatualizado, ao contrário do que já foi feito pra Unidades via `buscarUnidadePorId_`); se a lentidão persistir depois desta correção, esse é o próximo suspeito.

**Passos manuais pendentes do usuário:** colar `backend/Contadores.gs`, `backend/Utils.gs`, `backend/LogAuditoria.gs`, `backend/Sof.gs`, `backend/Recibos.gs` no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** medir o tempo de trocar andamento de novo depois de colar/reimplantar; conferir que o Log de Auditoria continua registrando corretamente mudanças reais de `andamento`/`status` (só sem as 2 linhas derivadas a mais); conferir que criar/editar SOF ou Recibo com múltiplos campos alterados de uma vez (ex.: editar o formulário inteiro) continua gerando uma linha de log por campo realmente mudado, só que numa escrita em lote.

**Bug encontrado e corrigido no mesmo dia (ainda não testado):** o "x" individual de um campo (múltipla escolha) disparava recarregamento mesmo quando esse campo específico já estava vazio - por causa da otimização "recarregar só se mudou" (acima), qualquer seleção *pendente* (marcada mas ainda sem clicar em "Filtrar") em **outro** campo fazia o "x" de um campo vazio aplicar essa seleção pendente sem querer. Corrigido em `ligarLimpezaFiltros` (`js/app.js`, usado pelas 4 telas com filtro): o "x" individual só recarrega se o campo que ele mesmo limpa tinha alguma seleção antes do clique - `js/app.js` é o único arquivo que muda, o fix vale pra SOF/Recibos/Notas de Empenho/Unidades ao mesmo tempo.

## Auto-avançar andamento do SOF para "NE EMITIDA" ao anexar Nota de Empenho (sessão 2026-07-23, aguardando o usuário colar/implantar e testar)

Pedido do usuário: ao anexar a Nota de Empenho no SOF, se o andamento estiver em qualquer etapa antes de "NE EMITIDA" (das 13 do stepper), avançar sozinho pra lá — hoje o nó só desbloqueava (`sof.possui_ne`), mas ninguém clicava por conta própria. (`docs/ESPECIFICACAO_ATUAL_COMPLETA.md` já descrevia esse comportamento como existente — não estava; este é o que faltava pra doc bater com o código.)

- **`backend/Sof.gs`:** nova constante `ETAPAS_ANDAMENTO_`, espelhando `ETAPAS_ANDAMENTO` de `js/sof.js` (mesma ordem das 13 etapas) — o backend não tinha nenhuma noção de ordem até agora; duplicada porque não há import entre arquivos `.gs`/`.js`.
- **`backend/NotasEmpenho.gs`:** o bloco final de `criarNotaEmpenho` que só marcava `possui_ne = true` na primeira NE original agora também compara `sof.andamento` contra `ETAPAS_ANDAMENTO_.indexOf('NE EMITIDA')`; se estiver antes (incluindo andamento desconhecido/legado, que cai em `indexOf === -1`), avança pra "NE EMITIDA" na mesma escrita da linha (1 só `updateObjectRow_`), replicando o mesmo efeito colateral que uma troca manual já tem em `atualizarSof` (`data_ultima_alteracao_andamento`/`visualizado_apos_alerta`) e logando a mudança normalmente. Só avança pra frente — nunca recua um andamento já igual ou posterior a "NE EMITIDA". Gate em `tipo === 'original'` (reforço nunca aciona, já que só é aceito se a NE original já existir).
- **`js/sof.js`:** o patch otimista local que `salvarSof` já fazia (`resposta.possui_ne = true` depois de criar a NE pelo mini-formulário) ganhou o mesmo cálculo client-side pra refletir o andamento na hora, sem esperar recarregar.

**Passos manuais pendentes do usuário:** colar `backend/Sof.gs` e `backend/NotasEmpenho.gs` atualizados no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** anexar a primeira NE original num SOF com andamento antes de "NE EMITIDA" (pelo mini-formulário do SOF e pela tela "Nova Nota de Empenho") e conferir que o card mostra "NE EMITIDA" na hora; conferir no Log de Auditoria que ficou registrada a mudança de `andamento`; anexar um reforço ou uma NE original num SOF cujo andamento já esteja em "NE EMITIDA" ou depois e confirmar que nada muda.

## Paginação em Unidades e Notas de Empenho (sessão 2026-07-23, aguardando o usuário colar/implantar e testar)

Pedido do usuário: aplicar a técnica de paginação no app inteiro pra deixar mais fluido. SOF, Recibos e Log de Auditoria já paginavam (backend fatiando os resultados + botões Anterior/Próxima no frontend) desde fases anteriores — só **Unidades** e **Notas de Empenho** ainda carregavam a lista inteira de uma vez (sem paginar), gerando telas com todos os cards renderizados de uma vez só. Esta sessão estende o mesmo padrão já existente (`listarSof`/`js/sof.js`) pra essas duas telas.

- **`backend/Unidades.gs` (`listarUnidades`):** passou a ordenar por `nome` e paginar (`page`/`pageSize`, padrão 20 por página) igual a `listarSof`, retornando `{ items, total, page, pageSize }` em vez do array direto. O cálculo de T.A./parcela mensal (que antes rodava pra toda a lista filtrada) agora roda só nos itens da página exibida.
- **`backend/NotasEmpenho.gs` (`listarNotasEmpenho`):** mesma mudança de formato (`{ items, total, page, pageSize }`), paginando depois de já ter agrupado/ordenado os cards (o agrupamento por `numero_ne` continua precisando processar todas as linhas antes de paginar — a paginação aqui economiza no tamanho da resposta e na renderização, não na leitura da planilha).
- **`js/unidades.js`/`js/notas-empenho.js`:** ganharam paginação de verdade na tela (mesmo padrão visual/de código de `js/sof.js`: `paginaAtual`/`totalRegistros`/`TAMANHO_PAGINA = 20`, `renderPaginacao()`, reseta pra página 1 ao aplicar/limpar filtro).
- **Como `listarUnidades`/`listarNotasEmpenho` também são usadas em outros lugares só pra popular dropdowns (não pra exibir uma lista paginada)** — unidades ativas em SOF/Recibos/Notas de Empenho, todas as unidades no filtro de Unidades, todos os números de NE no combo de reforço — essas chamadas passaram a enviar `pageSize: 100000` explicitamente (mesmo truque que `listarSof`/`listarRecibos` já usavam pra isso) e a ler `.items` da resposta, em vez do array direto.

**Passos manuais pendentes do usuário:** colar `backend/Unidades.gs` e `backend/NotasEmpenho.gs` atualizados no editor do Apps Script e reimplantar. Nenhuma coluna/aba nova na planilha.

**Ainda não testado:** abrir Unidades e Notas de Empenho com mais de 20 registros e conferir que só 20 aparecem por vez, com "Anterior"/"Próxima" funcionando; conferir que os dropdowns que dependem da lista completa (unidade em SOF/Recibos/NE, "Nota de Empenho a Reforçar") continuam trazendo todos os registros, não só os 20 da primeira página; conferir que aplicar um filtro em Unidades/Notas de Empenho volta pra página 1.

## Botão "Criar SOF - SEI" — gera documento de Solicitação Orçamentária e Financeira (sessão 2026-07-23, aguardando o usuário criar as colunas/colar/implantar e testar)

Usuário enviou um documento real do SEI/GOVPE ("Solicitação Orçamentária e Financeira", modelo padrão da SES-PE) e pediu um botão dentro da edição de um SOF que abre um formulário com os campos desse documento (os que já existem no SOF e os que não existem) e gera, ao final, um arquivo HTML no mesmo formato — sem o timbre (imagem do brasão) e sem o rodapé de endereço da Secretaria. Decisões confirmadas com o usuário: os dados ficam salvos no SOF (editáveis depois); o botão só aparece editando um SOF existente; o número do documento é digitado manualmente; o documento gerado abre em nova aba **e** é baixado como `.html`.

- **`backend/Sof.gs` (`atualizarSof`):** `camposEditaveis` ganhou 28 campos novos, todos opcionais e sem validação de formato (documento administrativo, não usado em cálculo/filtro em nenhum outro lugar do app) — identificação (`sei_numero_documento`, `sei_data`), tipo de solicitação/pleito (`sei_tipo_solicitacao`, `sei_previsto_pca`, `sei_numero_pca`, `sei_numero_dfd`, `sei_tipo_pleito`, `sei_justificativa_pleito`), contexto (`sei_area_setor_solicitante`, `sei_tema_poas`, `sei_objeto_despesa`), destinação/credor (`sei_destinacao`, `sei_credor`, `sei_credor_cnpj`, `sei_acao`, `sei_subacao`, `sei_grupo_despesa`), `sei_medida_compensatoria_poas`, `sei_manutencao_linhas` (única exceção ao padrão de colunas planas do resto do app — linhas repetíveis Código/Elemento/Valor guardadas como JSON num só campo, já que é puramente apresentacional neste documento, sem leitura em nenhum outro lugar), convênio/portaria (7 campos), solicitante/ordenador (5 campos) e assinaturas de Nota de Empenho/Nota de Liquidação (4 campos). `criarSof` não precisou mudar — esses campos só são gravados depois, pelo formulário SEI. `HEADERS.SOF` (`backend/Utils.gs`) atualizado com a mesma lista (documentacional).
- **Campos reaproveitados do SOF já existente** (não viraram campo novo): Ação/Subação (`acao_snapshot`/`subacao_snapshot`), CPF/CNPJ (`cnpj_snapshot`), Destinação (prefill de `unidade.tipo`), Credor (prefill de `unidade.nome`), Número do Contrato e CEO E-fisco (seção "Para os casos de LICITAÇÕES" reaproveita `sof.contrato`/`sof.ceo`, mostrados como somente leitura no formulário SEI, com nota pra editar no formulário principal).
- **Simplificação deliberada:** a tabela "Valor total com cronograma de desembolso (mensal)" do documento é montada com as Fontes já cadastradas no SOF (fonte + total solicitado) — as 12 colunas de mês saem em branco no documento gerado pra preenchimento manual depois, já que o SOF não rastreia em qual mês cada valor cai (diferente do cronograma de Nota de Empenho, que é mês a mês). Não virou campo novo de formulário.
- **`js/sof.js`:** botão "Criar SOF - SEI" no rodapé do modal de edição (só aparece editando, mesmo gate já usado pra seção de Notas de Empenho) → `abrirFormularioSeiSof_` abre um segundo modal (`opcoes.grande`, novo `.modal.grande { max-width:900px }` em `css/style.css` + suporte em `UI.abrirModal`/`js/app.js`) com todos os campos, pré-preenchido com valores já salvos ou defaults derivados (Destinação/Credor/CNPJ/Ação/Subação/Data). Seção de "Manutenção de Geres..." usa o mesmo padrão de linhas dinâmicas já usado em "Fontes de recurso" (`linhaManutencaoSeiHtml_`/`renderManutencaoSeiFormulario_`, análogo a `linhaFonteHtml`/`renderFontesFormulario`). Ao salvar: chama `atualizarSof` (reaproveita o endpoint genérico, ganha log de auditoria de graça), monta o HTML (`montarDocumentoSeiHtml_`) e chama as duas saídas: `baixarArquivo` (generalizada com um 3º parâmetro `mimeType`, antes só usada por `exportarCsv` fixo em CSV) e a nova `abrirDocumentoEmNovaAba_` (Blob + `URL.createObjectURL` + `window.open`, padrão inédito no app — revoga a URL depois de 60s, não na hora, pra não quebrar a aba antes de carregar).

**Passos manuais pendentes do usuário:**
1. Na aba **SOF** da planilha, criar as 28 colunas novas (nomes exatos: `sei_numero_documento`, `sei_data`, `sei_tipo_solicitacao`, `sei_previsto_pca`, `sei_numero_pca`, `sei_numero_dfd`, `sei_tipo_pleito`, `sei_justificativa_pleito`, `sei_area_setor_solicitante`, `sei_tema_poas`, `sei_objeto_despesa`, `sei_destinacao`, `sei_credor`, `sei_credor_cnpj`, `sei_acao`, `sei_subacao`, `sei_grupo_despesa`, `sei_medida_compensatoria_poas`, `sei_manutencao_linhas`, `sei_convenio_numero`, `sei_convenio_efisco`, `sei_convenio_conta`, `sei_convenio_banco`, `sei_contrapartida_convenio`, `sei_contrapartida_conta`, `sei_contrapartida_banco`, `sei_solicitante_nome`, `sei_solicitante_cargo`, `sei_ordenador_nome`, `sei_ordenador_cargo`, `sei_ordenador_setor`, `sei_assinatura_ne_nome`, `sei_assinatura_ne_cargo`, `sei_assinatura_nl_nome`, `sei_assinatura_nl_cargo`).
2. Colar `backend/Sof.gs` e `backend/Utils.gs` atualizados no editor do Apps Script e reimplantar.

**Ainda não testado:** o fluxo inteiro (abrir "Criar SOF - SEI", conferir prefill, salvar, conferir a aba nova + o download do `.html`, reabrir e conferir persistência, conferir log de auditoria).

## "Criar SOF - SEI" virou o próprio formulário de criação (sessão 2026-07-23, CÓDIGO CONCLUÍDO, aguardando o usuário criar colunas/aba/colar/implantar e testar)

O usuário testou a sessão anterior ("Criar SOF - SEI" como modal separado, só na edição) e pediu para inverter: o formulário do documento SEI passa a ser o próprio "+ Nova SOF", disponível já na criação, não um passo extra depois. Junto vieram 4 ajustes, alinhados em plan mode antes de implementar (duas perguntas de esclarecimento feitas ao usuário, respostas abaixo já incorporadas):

1. Cada Fonte ganha **12 campos mensais (Jan-Dez)**, preenchidos manualmente (pode ser só 1 mês, pagamento único, ou vários, recorrente) — a soma vira o Total Solicitado (deixou de ser digitado). Mantido um campo **Parcela Mensal separado**, que não entra no documento e continua sendo só a base do alerta da Nota de Empenho.
2. **Ajuste pedido durante a revisão do plano:** o alerta "abaixo do previsto" da NE só dispara quando a Fonte tiver **mais de 1 mês preenchido** no cronograma — SOF de pagamento único (só 1 mês) nunca aciona o alerta, mesmo com valor abaixo da Parcela Mensal.
3. "Número do Contrato" e "CEO E-fisco" (seção Licitações) viraram campos editáveis de verdade (antes eram somente-leitura). Achado durante o plano: o backend (`criarSof`/`atualizarSof`) já aceitava `sof.contrato` há tempo — o campo aparecer sempre vazio era só falta de `<input>` no formulário, não um problema de backend.
4. "Setor" do Solicitante virou campo próprio e editável (`sei_solicitante_setor`, novo) — antes era um espelho somente-leitura de "Área/setor solicitante" (campo diferente, seção Contexto). Pré-preenchido a partir desse valor ao abrir o formulário, mas editável e gravado à parte depois disso.
5. A seção "Destinação e classificação" passou a incluir o campo **OSS** (reaproveitando o `oss_snapshot` que já existia solto no topo do formulário — sem duplicar dado, só mudou de lugar no layout).
6. Autopreenchimento ao escolher a Unidade continua funcionando (OSS/CNPJ/Contrato de Gestão/Ação/Subação/G.D., mais Destinação/Credor/CPF-CNPJ/Ação/Subação do documento).

**Dados novos:**
- Aba **SofFontes**: nova coluna `codigo_poas` (opcional, texto — coluna "CÓDIGO POAS" do documento real, sem entrar em nenhum cálculo).
- Nova aba **SofFontesCronograma** (`id, sof_fonte_id, mes, valor, criado_por, data_criacao`) — mesmo padrão child-table de `NotasEmpenhoCronograma`. `total_solicitado` (em SofFontes) passa a ser calculado no backend como soma dessas linhas, nunca mais confiado como veio do frontend.
- Aba **SOF**: nova coluna `sei_solicitante_setor`.
- `backend/Contadores.gs`: novo `SofFontesCronograma: 'SFC'` em `PREFIXOS_ID`.

**Backend (`backend/Sof.gs`):**
- Novo bloco de cache de 30s pro cronograma (`todasFontesCronogramaComCache_`/`invalidarCacheFontesCronograma_`/`agruparCronogramaPorFonte_`), mesmo padrão de `todoCronogramaComCache_` em `NotasEmpenho.gs`. Novo `fontesComCronograma_()` — ponto único que junta `SofFontes` com o cronograma, usado tanto por `agruparFontesPorSof_` (listagem) quanto por `listarFontesPorSof_` (obter um SOF), pra nunca haver dois lugares que podem divergir sobre isso — importante porque `listarSof` precisa trazer o cronograma: `abrirSofExistente` (frontend) reaproveita o item já carregado por `listarSof` pra reabrir a edição sem chamar `obterSof` de novo (otimização de performance de uma sessão anterior).
- `validarFontes_`: `fonte`/`parcela_mensal` continuam obrigatórios; `total_solicitado` saiu da validação (calculado); nova regra — soma do cronograma da linha precisa ser `> 0`.
- `substituirFontesDoSof_`: além de recriar as linhas de `SofFontes`, agora também recria o cronograma de cada uma (apagar-e-recriar, mesmo princípio de sempre) e calcula `total_solicitado` como soma dos meses. Meses em branco não geram linha.
- Nova constante `CAMPOS_LIVRES_SOF_` (~40 campos: os de sempre + `contrato`/`ceo` + todos os `sei_*`, agora com `sei_solicitante_setor`), reaproveitada por `criarSof` **e** `atualizarSof` — antes só `atualizarSof` tinha essa lista; `criarSof` nunca gravava nenhum campo `sei_*`. `criarSof` filtra os campos snapshot (`oss_snapshot` etc.) desse array antes de usar o loop genérico, porque esses continuam com a lógica própria de autopreenchimento-a-partir-da-unidade-com-override-manual (sem mudança nessa parte).

**Backend (`backend/NotasEmpenho.gs`):** `listarNotasEmpenho` — o cálculo de `alerta` ganhou a condição extra `mesesPreenchidosFonte > 1` (conta quantos meses do cronograma daquela fonte têm valor `> 0`), implementando o ajuste 2 acima. `parcela_mensal` continua sendo o valor de referência, sem mudança.

**Frontend (`js/sof.js`):**
- `abrirFormularioSeiSof_` (modal separado) deixou de existir — suas seções (`<h4 class="sei-secao-titulo">`) entraram dentro de `abrirFormulario`, sempre visíveis (criação e edição), modal sempre `{ grande: true }`. `coletarDadosFormularioSei_`/`salvarEGerarDocumentoSei_` foram absorvidas por `coletarDadosFormulario()`/`salvarSof(sofExistente, opcoes)`.
- Nova organização: Unidade → Dados do cadastro (CNPJ/Contrato de Gestão/Ação/Subação/G.D./T.A.) → Identificação do processo (Número do Processo/Nº SOF/DEA/Período + campos SEI de identificação) → Pleito → Contexto → Destinação e classificação (com OSS) → Fontes de recurso (grade de 12 meses) → Medida compensatória POAS → Manutenção de Geres... → Despesas SUS/Portaria ou Convênio → Licitações (Número do Contrato/CEO, agora editáveis) → Solicitante (com Setor editável) → Ordenador → Assinatura NE → Assinatura NL → Observação.
- Rodapé com duas ações de salvar, as duas disponíveis em criação e edição: "Salvar" (sem gerar documento) e "Salvar e gerar documento SEI" (salva e baixa/abre o HTML na sequência — exige "Número do documento (SEI)" preenchido).
- Linha de Fonte (`linhaFonteHtml`/`renderFontesFormulario`/`lerLinhasFontesDoDom_`) reescrita: Fonte + Código POAS + Parcela Mensal numa linha, 12 campos mensais (Jan-Dez, grid de 6 colunas) embaixo, Total Solicitado virou somente leitura (soma ao vivo). Ganhou classe própria `linha-fonte-cronograma` (em vez de reaproveitar `.linha-fonte`, que continua servindo só as linhas de Manutenção — CSS novo em `css/style.css`).
- `montarDocumentoSeiHtml_`: a tabela de fontes do documento agora imprime os valores reais dos 12 meses e o Código POAS (antes sempre em branco); "SETOR" do Solicitante no documento passou a ler `sei_solicitante_setor` (antes lia `sei_area_setor_solicitante` por engano/limitação).

**Passos manuais pendentes do usuário:**
1. Aba **SOF**: nova coluna `sei_solicitante_setor`.
2. Aba **SofFontes**: nova coluna `codigo_poas`.
3. Nova aba **SofFontesCronograma**: cabeçalho `id, sof_fonte_id, mes, valor, criado_por, data_criacao`.
4. Aba **Contadores**: nova linha com prefixo `SFC`, próximo = 1.
5. Colar `backend/Sof.gs`, `backend/Utils.gs`, `backend/Contadores.gs`, `backend/NotasEmpenho.gs` no editor do Apps Script e reimplantar.

**Ainda não testado** (nenhum teste real feito ainda): criar uma SOF do zero com o formulário completo, incluindo 2-3 meses de cronograma numa Fonte, e conferir persistência ao reabrir; "Salvar e gerar documento SEI" gerando o HTML com os meses/Código POAS reais e os campos de Licitações/Setor preenchidos; alerta da NE aparecendo só quando a fonte tem 2+ meses preenchidos (e não aparecendo com só 1 mês); abrir um SOF criado antes desta sessão (sem os campos novos) sem erro.

## Referências úteis
- Repositório: `https://github.com/AndersonG2021/APP-GAOCG.git`, branch `main`, publicado via GitHub Pages.
- Backend roda só no Apps Script; **sempre que um `.gs` mudar, colar manualmente, reimplantar (Implantar → Gerenciar implantações → editar → Nova versão) E atualizar a cópia correspondente em `/backend` neste repositório**, no mesmo commit.
- Padrão de trabalho: planejar cada fase (plan mode) → implementar frontend → passar trecho de backend pronto pro usuário colar → usuário testa → ajustar.
- `/backend` tem cópia de referência de `Auth.gs`, `Code.gs`, `Contadores.gs`, `Dashboard.gs`, `EdicoesEmAndamento.gs`, `ListasPersonalizadas.gs`, `LogAuditoria.gs`, `NotasEmpenho.gs`, `Recibos.gs`, `Sof.gs`, `Unidades.gs`, `Usuarios.gs`, `Utils.gs` — todos os `.gs` do backend agora estão cobertos (o usuário colou `Contadores.gs`, coletado pela primeira vez em 2026-07-18). Sempre que precisar editar um `.gs`, conferir se a cópia local está atualizada antes (cópias antigas do histórico do git podem estar desatualizadas).
