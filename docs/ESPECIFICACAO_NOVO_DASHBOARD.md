# Especificação — Novo Dashboard GAOCG (cards + gráficos + gerador de relatório)

> Documento de desenho aprovado **antes** da implementação (a pedido do usuário:
> "fechar o desenho todo antes de codar"). Serve de referência para a
> reescrita de `js/dashboard.js`, `backend/Dashboard.gs` e arquivos novos.
> Data do desenho: 2026-07-28.

---

## 1. Visão geral das mudanças

O dashboard atual (6 cards em 2 linhas + 3 painéis inferiores) passa a ter:

- **1 linha com 3 cards** no topo (os 3 cards da 2ª linha atual são **removidos**).
- **1 painel de gráficos** configurável (substitui "Recibos por status",
  "Situação das NE's" e "Processos parados").
- **1 botão "Gerar relatório"** que abre um assistente em etapas.

O seletor de **Competência** e o botão **Atualizar** do topo continuam.

---

## 2. Cards do topo (3 cards)

### 2.1. Card 1 — Recibos (criados × pagos no período)

- **Valor principal:** nº de recibos criados na competência selecionada.
- **Comparação:** exibe também quantos já estão **pagos** na mesma competência
  (ex.: `1 criado · 0 pagos`, ou uma barrinha criados/pagos).
- Mantém a variação `% vs mês anterior` que já existe.
- **Clique →** navega para **Recibos** com:
  - filtro de **Competência** = competência selecionada;
  - filtro de **Status** = **todos os status existentes exceto `PAGO`**
    (é assim que o filtro múltiplo atual expressa "status ≠ pago").
- **Backend:** `dashboardRecibos_` já soma por status; adicionar
  `total_recibos_pagos` (contagem de recibos com `status === 'PAGO'` na
  competência) ao retorno.

### 2.2. Card 2 — Atendido × Solicitado (SOFs)

- **Métrica "Atendido" = total empenhado (soma do valor de todas as Notas de
  Empenho)**, comparado ao **total solicitado** (soma de `SOF.total_solicitado`)
  de **todas as SOFs não excluídas**.
- **Valor principal:** percentual `Atendido / Solicitado` + barra de progresso.
- **Linha menor embaixo:** `Solicitado: R$ X` (valor absoluto, fonte menor),
  e opcionalmente `Empenhado: R$ Y`.
- Considera **todas as competências até o momento** (não filtra pela
  competência do topo — é um acumulado geral). ✔ confirmado.
- **Não é clicável** — card puramente informativo (sem navegação). ✔ confirmado.
- **Backend:** novo bloco em `obterDashboard`:
  `total_solicitado = Σ total_solicitado` (SOFs não excluídas) e
  `total_empenhado = Σ valor` (NotasEmpenho de SOFs não excluídas).

### 2.3. Card 3 — NEs com saldo baixo (< 20% de 1 parcela)

- **Valor principal:** nº de Notas de Empenho cujo `valor_atual` (saldo) é
  **menor que 20% da `parcela_mensal_referencia`** da NE.
  - Critério: `parcela_mensal_referencia > 0 && valor_atual < 0.20 * parcela_mensal_referencia`.
  - Reaproveita `montarGruposNotasEmpenho_` (já calcula `valor_atual` e
    `parcela_mensal_referencia`).
- **Clique →** navega para **Notas de Empenho** com um filtro novo
  `saldoBaixo: true` (ou `saldoAbaixoPct: 20`) que aplica o mesmo critério.
- **Backend:**
  - `dashboardNotasEmpenho_`: adicionar `total_saldo_abaixo_20` e a lista.
  - `listarNotasEmpenho`: aceitar o parâmetro novo e filtrar por ele.
- **Frontend NE:** `render(opts)` passa a aceitar `opts.saldoBaixo` e marcar o
  filtro correspondente (novo checkbox "Somente saldo < 20% da parcela").

---

## 3. Painel de gráficos (substitui os 3 painéis inferiores)

Painel único com barra de controles + área do gráfico.

### 3.1. Controles

| Controle | Opções |
|---|---|
| **Métrica** | Total pago · Total liquidado · Total empenhado (NE) · Nº de recibos/processos |
| **Agrupar por** | OSS · Unidade · Fonte · Status · Mês (competência) |
| **Tipo de gráfico** | Barras verticais · Barras horizontais · Pizza/Rosca · Linha (evolução por mês) |
| **Período** | Seletor próprio do painel: competência **de** / **até** (independente do topo) |

### 3.2. Regras de compatibilidade

- **Linha (evolução por mês)** só fica disponível quando **Agrupar por = Mês**.
- **Total empenhado (NE) × Mês** ✔ habilitado: distribui o empenhado pelos
  meses do **cronograma de desembolso** da NE quando houver; senão usa o mês de
  `data_criacao` da NE.
- "Nº de recibos/processos" = contagem; as demais = soma de valor.

### 3.3. Backend

Novo endpoint `obterGraficoDashboard(session, params)`:
- `params`: `{ metrica, agruparPor, competenciaInicio, competenciaFim }`.
- Lê Recibos (e NotasEmpenho quando `metrica = empenhado`), aplica o período,
  agrega pela dimensão e devolve `{ labels: [...], valores: [...], total }`.
- Registrar em `Code.gs` (`case 'obterGraficoDashboard'`).

### 3.4. Renderização

- Biblioteca **Chart.js empacotada localmente** em `js/vendor/chart.min.js`
  (sem CDN em runtime), incluída no `index.html`.
- Paleta e estilo seguindo o guia de dataviz (cores acessíveis, consistentes
  em tema claro/escuro).

---

## 4. Gerador de relatório

Botão **"Gerar relatório"** no topo do dashboard → assistente em modal, em etapas.

### 4.1. Etapas do assistente

1. **Fonte de dados** (escolhe **uma** por relatório):
   Recibos · Notas de Empenho · SOF · Unidades.
2. **Período e filtros:** competência de/até (quando aplicável), OSS, Unidade,
   Fonte, Status. Os filtros disponíveis dependem da fonte escolhida.
3. **Colunas:** lista de campos da fonte com checkbox — o usuário marca quais
   entram e (idealmente) reordena.
4. **Agrupar & totais:** opção de agrupar por OSS/Unidade/Fonte com **subtotal
   por grupo** e **total geral**.
5. **Gráfico:** opção de **embutir** um gráfico (reusa a configuração do painel
   de gráficos) no relatório.
6. **Gerar:** escolhe o formato de saída.

### 4.2. Formatos de saída e capacidades

| Formato | Tabela | Agrupamento/subtotais | Gráfico embutido | Como é gerado |
|---|:--:|:--:|:--:|---|
| **Visualizar na tela** | ✅ | ✅ | ✅ | Render HTML no próprio app |
| **PDF (impressão)** | ✅ | ✅ | ✅ | Página formatada + `window.print()` → "Salvar como PDF" |
| **Excel / CSV** | ✅ | ⚠️ tabela plana | ❌ | Download `.csv` (UTF-8 BOM, abre no Excel) |
| **Google Sheets** | ✅ | ✅ | ❌ (v1) | Backend GAS cria planilha nova e devolve o link |

> CSV não representa bem subtotais/gráficos → nesse formato sai a **tabela
> plana** filtrada. Agrupamento/subtotais e gráfico saem em Tela/PDF/Sheets.

### 4.3. Cabeçalho do relatório

Cabeçalho **mínimo** (o usuário não pediu cabeçalho institucional completo):
- Título do relatório, período considerado, data/hora de emissão.
- *Sem* logo e *sem* "gerado por" nesta versão.

### 4.4. Modelos de relatório (presets) — **salvar/reutilizar**

- O usuário pode **salvar** uma configuração (fonte + filtros + colunas +
  agrupamento + formato) com um nome e **gerar de novo com 1 clique**.
- **Armazenamento:** nova aba `RelatoriosModelos` no Google Sheets.
  - Colunas sugeridas: `id`, `nome`, `config_json`, `criado_por`, `data_criacao`.
  - **Escopo: compartilhado — todos os usuários veem e usam todos os modelos.**
    ✔ confirmado. (Exibir "criado por" ao lado do nome ajuda a se localizar.)
- **Backend novo:** `listarModelosRelatorio`, `salvarModeloRelatorio`,
  `excluirModeloRelatorio` + registro no `Code.gs`.

---

## 5. Resumo de arquivos afetados / novos

**Backend (`backend/`):**
- `Dashboard.gs` — reescrever `obterDashboard` (novos campos dos 3 cards;
  remover blocos dos cards descartados); novo `obterGraficoDashboard`.
- `NotasEmpenho.gs` — `listarNotasEmpenho` aceitar filtro `saldoBaixo`.
- `Relatorios.gs` **(novo)** — `gerarRelatorio` (dados/CSV/Sheets),
  modelos (listar/salvar/excluir).
- `Code.gs` — novos `case` no dispatch.

**Frontend (`js/`):**
- `dashboard.js` — reescrever cards, painel de gráficos e botão de relatório.
- `notas-empenho.js` — filtro/checkbox "saldo < 20% da parcela" + `opts.saldoBaixo`.
- `recibos.js` — já aceita `filtroInicial` (competência/status); confirmar
  pré-seleção de "todos os status exceto PAGO".
- `relatorios.js` **(novo)** — assistente de relatório.
- `vendor/chart.min.js` **(novo)** — Chart.js local.
- `index.html` — incluir os novos `<script>`.

**CSS (`css/style.css`):** estilos do painel de gráficos, do assistente de
relatório e da versão de impressão (`@media print`).

---

## 6. Pontos em aberto

Todos resolvidos (2026-07-28):

1. **Card 2 — período:** acumulado geral (todas as competências). ✔
2. **Card 2 — clique:** não clicável (informativo). ✔
3. **Modelos de relatório — escopo:** compartilhado (todos veem todos). ✔
4. **Empenhado × Mês** no gráfico: habilitado, via cronograma de desembolso. ✔

**Desenho fechado — pronto para implementação.**
