# Relatório técnico — lentidão ao abrir um card de SOF (8 a 15s)

Data: 2026-07-09
Sintoma relatado: ao clicar em um card na tela de SOF, o app leva de 8 a 15 segundos para abrir o formulário de edição.

> **Status (2026-07-09, mesma sessão): Prioridades 1 a 5 implementadas.** Ver seção 5 no final
> deste documento para o detalhe do que foi feito, o que ficou pendente (Prioridade 6, cosmética,
> e Prioridade 7, de longo prazo) e o que falta o usuário implantar na planilha/Apps Script.

## 1. O que acontece, passo a passo, ao clicar num card

Clicar no corpo de um card (`js/sof.js`, `renderCards()`) dispara `abrirSofExistente(id)`, que hoje faz **quatro chamadas de rede sequenciais** para o backend (Apps Script), uma esperando a anterior terminar, antes do usuário ver o formulário completo:

```
abrirSofExistente(id)
  1. EdicaoSimultanea.entrarEmEdicao('SOF', id)   → ação "abrirEdicao"
  2. Api.chamar('obterSof', { id })                → ação "obterSof"
  3. Api.chamar('marcarSofVisualizado', { id })    → ação "marcarSofVisualizado"
  4. abrirFormulario(sof)
       └─ renderNotasEmpenho(sof) → Api.chamar('listarNotasEmpenhoPorSof', ...)
```

(`js/sof.js:202-214`, `js/edicao-simultanea.js:9-33`, `js/sof.js:368-374`)

Cada uma dessas quatro chamadas é uma requisição HTTP completa e independente para a Web App do Apps Script (`js/api.js:33-65`). Isso já é o primeiro problema estrutural: **nenhuma delas é paralelizada**, mesmo quando poderiam ser (passo 2 e 3, por exemplo, não dependem uma da outra).

Cada requisição, por sua vez, não é "leve": o Apps Script Web App **não mantém estado entre requisições**. Toda vez que o frontend chama `Api.chamar`, o Google inicia uma execução nova do script, que precisa, do zero:

- Reabrir a planilha inteira (`getSS_()` → `SpreadsheetApp.openById(id)`);
- Revalidar o token lendo a aba **Usuarios** inteira (`requireAuth_` → `findById_(getSheet_(SHEETS.USUARIOS), ...)`, em `Auth.gs`);
- Só então executar a lógica da ação pedida.

Ou seja: 4 cliques de rede = 4 reaberturas completas da planilha + 4 leituras completas da aba Usuarios, só para abrir um card.

## 2. Os gargalos, do mais grave para o mais leve

### 2.1. `protegerFormatoLinha_` — o suspeito nº 1 (alto impacto, praticamente todas as escritas)

Em `backend/Utils.gs`, toda escrita (`appendObjectRow_`/`updateObjectRow_`) chama `protegerFormatoLinha_`, que faz isto:

```js
function protegerFormatoLinha_(sheet, headers, linha) {
  var protegidas = (COLUNAS_NUMERICAS[nomeAba] || []).concat(COLUNAS_BOOLEANAS[nomeAba] || []);
  headers.forEach(function (coluna, indice) {
    if (protegidas.indexOf(coluna) !== -1) {
      sheet.getRange(linha, indice + 1, 1, 1).setNumberFormat('General');
      return;
    }
    sheet.getRange(linha, indice + 1, 1, 1).setNumberFormat('@');
  });
}
```

A aba **SOF** tem ~30 colunas. Isso significa que **toda vez que uma linha de SOF é escrita — inclusive um simples `marcarSofVisualizado`, que só marca "já vi este card"** — o script faz **~30 chamadas separadas** de `getRange(...).setNumberFormat(...)`, uma célula por vez, em vez de uma única chamada em lote.

Cada chamada ao serviço de planilhas do Apps Script (`SpreadsheetApp`) tem uma latência própria, não desprezível, e quando são feitas em loop, célula a célula, esse custo se acumula de forma quase linear no número de colunas. Isso foi introduzido de propósito na Fase 3.1 para corrigir o bug do G.D./período virando data — mas o preço pago foi trocar "conversão errada de tipo" por "toda escrita ficou muito mais lenta".

**Isso é chamado a cada abertura de card** (`marcarSofVisualizado` sempre escreve, mesmo que `visualizado_apos_alerta` já fosse `true`) — é bem provável que seja o maior componente isolado dos 8-15 segundos.

### 2.2. Cadeia sequencial de chamadas no frontend (alto impacto, baixo esforço para corrigir)

Como descrito na seção 1, as 4 chamadas de rede do clique num card são feitas uma após a outra (`await` em sequência), quando pelo menos duas delas (`obterSof` e `marcarSofVisualizado`) não dependem do resultado uma da outra e poderiam rodar em paralelo. Isso soma diretamente os tempos de rede/cold-start de cada chamada, em vez de sobrepor.

### 2.3. `marcarSofVisualizado` no caminho crítico (médio impacto, baixo esforço)

Marcar "visualizado" é puramente informativo (serve só para o destaque visual de "parado" sumir) e não deveria bloquear a abertura do formulário. Hoje o código faz `await Api.chamar('marcarSofVisualizado', ...)` **antes** de abrir o formulário — ou seja, o usuário espera uma escrita completa na planilha (com todo o custo do item 2.1) só para ver a tela.

### 2.4. Releituras completas de planilha sem cache, em cada chamada (médio-alto impacto)

`sheetToObjects_` (`Utils.gs`) sempre faz `sheet.getDataRange().getValues()` — lê a aba inteira, todas as linhas e colunas, mesmo quando só uma linha é necessária. Isso acontece em praticamente toda função de leitura do backend, sem nenhum cache entre requisições (não há uso de `CacheService`, que existe justamente pra isso no Apps Script).

No caminho de abrir um card de SOF, isso se repete várias vezes:
- `obterSof` → lê **SOF** inteira (`findById_`), **SofFontes** inteira (`listarFontesPorSof_`) e **ListasPersonalizadas** inteira (`calcularDestaqueParadoSof_` → `opcaoTemPausaContagem_`);
- `marcarSofVisualizado` → lê **SOF** inteira de novo;
- `listarNotasEmpenhoPorSof` → lê **NotasEmpenho** inteira;
- e cada uma dessas ainda lê **Usuarios** inteira, para autenticar o token.

Quanto mais linhas essas abas tiverem (o que só cresce com o tempo), mais lenta cada uma dessas leituras fica — é um problema que **piora sozinho conforme a planilha cresce**, mesmo sem nenhuma mudança de código.

### 2.5. N+1 em `opcaoTemPausaContagem_` (médio impacto, já existia antes da Fase 3.2)

```js
function opcaoTemPausaContagem_(tipoLista, valor) {
  var rows = sheetToObjects_(getSheet_(SHEETS.LISTAS)); // lê a aba inteira
  ...
}
```

Essa função relê a aba **ListasPersonalizadas** inteira **toda vez que é chamada** — e ela é chamada uma vez por linha em `listarSof` (até 20 vezes, uma por card da página) e de novo em `obterSof`. Ao carregar a lista de cards já se paga esse custo 20 vezes; ao abrir um card, mais uma vez.

### 2.6. Latência inerente da plataforma Apps Script Web App (impacto variável, fora do nosso controle direto)

Isso já estava documentado no `PROGRESS.md` (Fase 1: "lentidão residual de 1-3s ao trocar de aba é latência inerente do Apps Script"). Web Apps do Apps Script têm cold start por execução e, mais importante, **cada script roda de forma efetivamente single-thread**: se dois usuários (ou duas abas do mesmo app) fizerem chamadas ao mesmo tempo, uma fica esperando a outra terminar no lado do Google. Isso é uma limitação de plataforma, não do nosso código — mas ajuda a explicar por que a lentidão pode variar bastante (8 a 15s) dependendo do momento.

## 3. Como mitigar — por ordem de custo-benefício

### Prioridade 1 — trocar `protegerFormatoLinha_` por uma chamada em lote (alto ganho, esforço baixo/médio)
Em vez de ~30 chamadas de `getRange(1 célula).setNumberFormat(...)`, montar um array de formatos (um por coluna) e aplicar de uma vez com `range.setNumberFormats([[...]])` numa única chamada para a linha inteira. Isso reduz o número de chamadas ao serviço de planilha de "uma por coluna" para "uma por linha escrita" — só essa mudança deve derrubar uma fatia grande da lentidão em **toda** escrita do sistema (não só SOF).

### Prioridade 2 — parar de bloquear a abertura do card por causa do `marcarSofVisualizado` (alto ganho, esforço baixo)
Disparar essa chamada em "fire and forget" (sem `await` bloqueando o fluxo) já que é puramente informativa, e/ou paralelizar com `obterSof` via `Promise.all`, já que uma não depende da outra.

### Prioridade 3 — paralelizar o que puder ser paralelizado no frontend (alto ganho, esforço baixo)
`obterSof` e `marcarSofVisualizado` podem rodar em paralelo. Isso sozinho já reduz a cadeia de "4 chamadas sequenciais" para efetivamente "3 tempos de espera" em vez de 4.

### Prioridade 4 — cache de leitura no backend com `CacheService` (ganho médio-alto, esforço médio)
Abas que mudam pouco entre requisições (Usuarios para autenticação, ListasPersonalizadas, Unidades) são boas candidatas a um cache de curta duração (ex.: 30-60s) via `CacheService.getScriptCache()`. Isso evitaria reler a aba inteira em cada uma das 4 chamadas só para revalidar o mesmo token ou buscar a mesma lista de opções.

### Prioridade 5 — eliminar o N+1 de `opcaoTemPausaContagem_` (ganho médio, esforço médio)
Carregar `ListasPersonalizadas` **uma vez** no início de `listarSof`/`obterSof` e passar o resultado já carregado para `calcularDestaqueParadoSof_`, em vez de cada chamada reler a aba do zero.

### Prioridade 6 — mostrar feedback visual imediato no clique do card (mitigação de percepção, não de causa raiz)
Mesmo depois das otimizações acima, alguma latência de rede vai continuar existindo. Um spinner/estado de "carregando" imediato no próprio card ao clicar (hoje só existe o `UI.mostrarCarregando()` genérico do `Api.chamar`) ajuda a diminuir a sensação de trava, embora não resolva o problema de fato.

### Prioridade 7 (longo prazo, só se o resto não for suficiente) — repensar o uso do Google Sheets como banco de dados
Google Sheets não foi projetado para ser um banco transacional de alta frequência; a tendência natural é a lentidão piorar conforme as abas crescem (Prioridade 4 do item 2.4). Se, mesmo depois de aplicar as mitigações acima, a lentidão continuar incômoda (especialmente com mais usuários/dados), a alternativa estrutural seria migrar o armazenamento para algo como Firestore, um banco relacional pequeno (ex. SQLite/Postgres gerenciado) ou uma API própria — um esforço bem maior, que só faz sentido considerar se as otimizações menores não bastarem.

## 4. Resumo executivo

Os 8-15 segundos não vêm de um único vilão, mas da soma de:
1. **4 chamadas de rede sequenciais** ao abrir um card, quando pelo menos 2 poderiam ser paralelas ou nem bloquear a tela;
2. **`protegerFormatoLinha_`** fazendo dezenas de chamadas individuais de formatação a cada escrita (inclusive no simples "marcar como visualizado");
3. **Leituras completas de planilha sem cache**, repetidas várias vezes por clique e multiplicadas pelo N+1 de `opcaoTemPausaContagem_`;
4. A **latência inerente** da própria plataforma Apps Script Web App, que não tem estado entre requisições.

As Prioridades 1 a 3 são as de maior impacto imediato com menor esforço de implementação, e não exigem nenhuma mudança de modelo de dados ou de planilha — são só reorganização de como o código já existente é chamado.

## 5. Status da implementação (2026-07-09)

**Feito nesta sessão, sem exigir nenhuma mudança de planilha (só colar/implantar os `.gs` de novo):**

- **Prioridade 1** — `protegerFormatoLinha_` (`backend/Utils.gs`) agora monta os formatos da linha inteira num array e aplica com uma única chamada `setNumberFormats([...])`, em vez de uma chamada de `getRange`/`setNumberFormat` por coluna.
- **Prioridade 2 e 3** — `js/sof.js` (`abrirSofExistente`) e `js/recibos.js` (`abrirReciboExistente`): `marcarSofVisualizado`/`marcarReciboVisualizado` viraram "fire and forget" (não bloqueiam mais a abertura do formulário), e em `sof.js` a busca de Notas de Empenho (`listarNotasEmpenhoPorSof`) passou a disparar em paralelo com `obterSof` (antes só começava depois do modal já estar montado). As 3 chamadas relevantes agora rodam ao mesmo tempo em vez de em fila.
- **Prioridade 4** — cache de 30s via `CacheService`:
  - `backend/Auth.gs`: `requireAuth_` usa `buscarUsuarioComCache_` em vez de reler a aba Usuarios inteira em toda requisição autenticada. `Usuarios.gs` (`atualizarUsuario`/`inativarUsuario`/`redefinirSenha`) e `Auth.gs` (`alterarMinhaSenha`) invalidam essa entrada assim que escrevem, então uma inativação/troca de senha vale imediatamente.
  - `backend/ListasPersonalizadas.gs`: nova `todasOpcoesComCache_()` cacheia a aba inteira por 30s; `criarOpcao`/`atualizarOpcao` invalidam o cache na escrita.
- **Prioridade 5** — eliminado o N+1 de `opcaoTemPausaContagem_` (agora aceita um array pré-carregado): `listarSof`/`listarRecibos` carregam `ListasPersonalizadas` **uma vez** e passam adiante para todas as linhas da página (em vez de reler a cada linha), e o cálculo de "parado" passou a rodar só na página visível, não em todas as linhas filtradas antes da paginação. O mesmo ajuste foi replicado em `dashboardParados_` (`Dashboard.gs`), que também percorria todas as linhas de SOF+Recibo sem paginação.
- **Prioridade 6 (parcial)** — feedback visual imediato: o card de SOF clicado (e a linha de Recibo) ganham uma classe `.carregando` (opacidade reduzida + bloqueio de novo clique) assim que o clique é processado, em vez de só o spinner genérico global.

**Não fiz (fora do escopo desta rodada):**
- Cache de leitura para a aba **Unidades** (mencionado no item 2.4) — não tenho o conteúdo atual de `Unidades.gs` neste repositório; precisa ser pedido ao usuário antes de editar, mesmo padrão já usado para os outros arquivos `.gs`.
- Otimizar `abrirEdicao`/`EdicoesEmAndamento.gs` (item 2.6) — mesmo motivo, arquivo não coletado nesta sessão; o impacto ali é menor (a aba tem só 5 colunas).
- **Prioridade 7** (repensar a plataforma) — deliberadamente não abordada; só faz sentido reconsiderar se as mitigações acima não forem suficientes na prática.

**Para sentir o ganho, o usuário só precisa colar/implantar de novo:** `Utils.gs`, `Auth.gs`, `Usuarios.gs`, `ListasPersonalizadas.gs`, `Sof.gs`, `Recibos.gs`, `Dashboard.gs` (todos em `/backend`). Nenhuma coluna nova, aba nova, ou dado existente precisa ser tocado na planilha para essa rodada de otimizações.
