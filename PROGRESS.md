# GAOCG App — Progresso das mudanças (plano em fases)

> Este arquivo existe para permitir retomar o trabalho em qualquer computador: basta clonar
> este repositório e pedir para o Claude Code ler este arquivo. O backend (`.gs`) não está
> neste repositório — vive só no editor do Google Apps Script vinculado à planilha.

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
**Ainda não testado pelo usuário (próximo passo ao retomar):**
- Anexo de Nota de Empenho realmente salvando no Google Drive e o link "Ver arquivo" abrindo certo.
- Validação de campos obrigatórios bloqueando corretamente ao faltar algum.
- DEA como dropdown e as duas datas de período salvando/carregando certo.

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
- Backend não versionado — vive só no Apps Script; **sempre que uma fase mexer no backend, colar manualmente e reimplantar (Implantar → Gerenciar implantações → editar → Nova versão)**.
- Padrão de trabalho: planejar cada fase (plan mode) → implementar frontend → passar trecho de backend pronto pro usuário colar → usuário testa → ajustar.
