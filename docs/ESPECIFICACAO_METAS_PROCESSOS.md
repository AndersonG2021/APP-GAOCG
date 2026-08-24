# Especificação — Metas Mensais de Processos (painel novo no Dashboard)

> Documento de desenho aprovado **antes** da implementação (mesmo padrão usado
> em [`ESPECIFICACAO_NOVO_DASHBOARD.md`](ESPECIFICACAO_NOVO_DASHBOARD.md)).
> Serve de referência para o `backend/MetasProcessos.gs` (novo), os ajustes em
> `backend/Dashboard.gs`/`backend/Code.gs` e as telas novas de frontend.
> Data do desenho: 2026-08-24.

---

## 1. Problema e objetivo

O usuário mantém, fora do sistema, uma lista de **quantos processos espera
receber por mês**, separada por **Unidade** e **Objeto** (ex.: "Hospital X /
CONTRATO DE GESTÃO (TES) → 1 processo/mês"). Hoje o Dashboard mostra quantos
processos (Recibos) **já existem** numa competência, mas não tem como
comparar isso com **quantos deveriam existir** — não dá pra ver, de forma
rápida, o que já chegou e o que ainda falta chegar no mês corrente.

**Objetivo:** um painel no Dashboard que mostre, para a competência
selecionada, **esperado × chegado × falta**, filtrável por Unidade, Objeto e
Estado (chegado/falta), alimentado por uma meta que é **um padrão mensal
recorrente** — o usuário cadastra uma vez e o valor vale todo mês, até ser
editado.

Isso é conceitualmente parecido com a lacuna já registrada no
[`README.md`](../README.md) ("total a pagar" adiado por falta de uma tabela
de valores mensais recorrentes por unidade) — mas aqui o eixo é **quantidade
de processos**, não R$, o que torna o modelo bem mais simples.

---

## 2. Modelo de dados — nova aba `MetasProcessos`

Uma **linha por combinação Unidade + Objeto** (não uma linha por mês — é o
"padrão" que se repete). Editar a meta = atualizar a quantidade na mesma
linha.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | texto | sequencial, prefixo novo em `PREFIXOS_ID` (`Utils.gs`/`Contadores.gs`) — ex. `MP-000001` |
| `unidade_id` | texto | FK para `Unidades` |
| `objeto` | texto | mesma lista global de Objeto já usada em SOF/Recibo (`ListasPersonalizadas`) |
| `quantidade_esperada` | número | inteiro ≥ 1 |
| `ativo` | booleano | `false` = meta pausada (some do painel sem apagar histórico/auditoria) |
| `criado_por` / `data_criacao` | texto/data | padrão de auditoria do app |
| `alterado_por` / `data_alteracao` | texto/data | idem |

**Restrição:** não pode existir mais de uma meta **ativa** para a mesma
combinação `unidade_id` + `objeto` (evita ambiguidade na hora de somar). Se o
usuário tentar criar uma duplicata, o backend recusa com mensagem clara
("Já existe uma meta ativa para esta unidade e objeto — edite a existente").

**Decisão confirmada (2026-08-24):** granularidade é **Unidade + Objeto**,
sem `fonte` na meta — bate com a lista que o usuário já mantém hoje. O painel
(seção 4) não filtra por Fonte — só por Unidade, Objeto e Estado.

**Limitação assumida, documentada aqui como as demais do README:** a meta
**não tem histórico por mês** — editar a quantidade hoje muda também a
leitura de competências passadas (não existe "isso valia 2 em jan.26 e passou
a valer 3 em fev.26"). Se isso vier a incomodar, uma evolução futura seria
snapshot mensal; fica fora do escopo desta fase.

---

## 3. Cálculo: esperado × chegado × falta

Para a competência selecionada (mesmo seletor que já existe no topo do
Dashboard) e cada meta **ativa**:

- **Esperado** = `quantidade_esperada` da meta.
- **Chegado** = contagem de `Recibos` **não excluídos** com
  `competencia` = competência selecionada **e** `unidade_id`/`objeto` iguais
  aos da meta. Conta o processo **cadastrado no sistema**, independente do
  `status` de pagamento — "chegou" é sobre o documento ter entrado, não sobre
  já estar pago.
- **Falta** = `max(esperado − chegado, 0)`.
- **Excedente** (informativo, não é erro): `max(chegado − esperado, 0)` —
  sinaliza quando chegou mais do que o previsto naquele mês.
- **Estado** (usado só pelo filtro da seção 4.2, não é gravado): **Chegado**
  quando `chegado ≥ esperado` (inclui excedente); **Falta** quando
  `chegado < esperado`.

**Totais do painel** = soma de esperado/chegado/falta de todas as metas
ativas que passam pelos filtros ativos (seção 4.2).

**Processos sem meta cadastrada:** um Recibo cuja combinação
unidade+objeto não tem meta ativa correspondente não entra em nenhuma conta
deste painel (não é "excedente" de ninguém). Fica como ponto de atenção — ver
seção 6 (avisos).

---

## 4. Painel no Dashboard

### 4.1. Card resumo (linha de cards do topo, junto dos existentes)

- **Valor principal:** `chegado` / `esperado` da competência selecionada
  (ex.: "42 de 58"), com barra de progresso (mesmo componente visual já usado
  no card "Atendido × Solicitado" — `.cartao-indicador-barra`).
- **Linha auxiliar:** "16 processo(s) ainda esperado(s)" (ou "Tudo chegou ✓"
  quando falta = 0; ou destaque diferente quando há excedente).
- **Estado padrão: recolhido.** O painel de filtros + tabela (4.2/4.3) **não
  aparece** até o usuário clicar no card — diferente dos outros cards do
  Dashboard, este não navega para outra tela, ele **expande/recolhe** no
  próprio lugar (toggle: clicar de novo recolhe). Mantém o Dashboard limpo
  quando ninguém precisa do detalhe.
- Indicador visual de expansível (ex. um `▾`/`▸` no canto do card, no lugar
  da seta `ICONE_SETA` usada nos cards clicáveis que navegam) para diferenciar
  visualmente "expande aqui" de "navega pra outra tela".

### 4.2. Barra de filtros do painel (só existe com o card expandido)

Reaproveita os componentes já existentes (`UI.tornarPesquisavel`, mesmo
padrão dos selects multi-valor usados em Recibos/SOF):

| Filtro | Tipo | Efeito |
|---|---|---|
| **Unidade** | multi-select pesquisável | restringe as metas exibidas |
| **Objeto** | multi-select pesquisável | restringe as metas exibidas |
| **Estado** | select simples: Todos / Chegado / Falta | restringe as metas exibidas pelo critério da seção 3 |

A **Competência** usa o mesmo seletor que já existe no topo do Dashboard
(não duplica outro seletor de mês dentro do painel). Não há filtro por Fonte
— a meta não tem essa dimensão (seção 2).

### 4.3. Tabela detalhada

Ordenada por **Falta** decrescente (quem está mais atrasado aparece primeiro
— mesmo raciocínio já usado no card de SOF pendente de NE, que ordena por
dias aguardando). Cortada nos top N (8, mesmo padrão dos outros painéis
compactos do Dashboard) com link **"Ver todas as metas"** para a tela de
manutenção (seção 5).

| Unidade | Objeto | Esperado | Chegado | Falta |
|---|---|:--:|:--:|:--:|
| Hospital X | CONTRATO DE GESTÃO (TES) | 1 | 1 | 0 ✓ |
| UPA Y | CONTRATO DE GESTÃO (SUS) | 1 | 0 | 1 |

Cada linha é clicável → navega para **Recibos** já filtrado por aquela
Unidade + Objeto + Competência (mesmo padrão de navegação clicável que o
resto do Dashboard já usa via `App.navegarPara`).

---

## 5. Tela de manutenção das metas (`js/metas-processos.js`, nova)

Tela nova no menu, no mesmo estilo de Unidades/Listas Personalizadas:

- **Lista** (tabela com busca/filtro por Unidade/Objeto/ativo).
- **Formulário** de criar/editar (Unidade, Objeto, Quantidade esperada,
  Ativo) — mesma validação de unicidade da seção 2.
- **Inativar/reativar** em vez de excluir por padrão (soft delete, `ativo`),
  consistente com o resto do app.

### 5.1. Importação em lote (decisão confirmada: manual **e** lote)

Botão **"Importar lista"** abre uma área de texto onde o usuário cola a
lista (uma combinação por linha, formato `Unidade;Objeto;Quantidade` —
separador `;` ou tab, compatível com colar direto do Excel/Sheets). O
backend:

1. Resolve cada `Unidade` pelo nome contra o cadastro de `Unidades`
   (mesmo texto exibido nas telas — não pede o `id`).
2. Faz **upsert** por combinação Unidade+Objeto: se já existe meta ativa,
   atualiza a quantidade; se não existe, cria.
3. Devolve um resumo por linha (criada / atualizada / erro — ex. unidade não
   encontrada, objeto vazio, quantidade inválida) **antes de confirmar a
   gravação**, para o usuário revisar e corrigir a lista colada se precisar.

Isso cobre tanto a carga inicial (colar a lista toda de uma vez) quanto usos
futuros (resincronizar a lista inteira quando o cenário mudar bastante), sem
abrir mão do cadastro manual linha a linha no dia a dia.

---

## 6. Avisos (nice-to-have, mesma sessão ou próxima)

- **"Chegaram sem meta cadastrada":** lista, abaixo da tabela principal,
  combinações Unidade+Objeto que tiveram Recibo na competência mas não têm
  meta ativa — ajuda o usuário a notar que esqueceu de cadastrar. Não entra
  nos totais da seção 3.
- **Excedente:** linhas com `chegado > esperado` ganham um selo diferente
  (ex. `.selo.azul` "excedente") em vez de aparecerem como "falta 0" sem
  destaque — mantém visível que passou do previsto.

---

## 7. Backend

**Novo arquivo `backend/MetasProcessos.gs`:**
- `listarMetasProcessos(session, params)` — lista com filtro por
  unidade/objeto/ativo, padrão das outras listas do app.
- `criarMetaProcesso(session, dados)` — valida unicidade unidade+objeto ativo.
- `atualizarMetaProcesso(session, id, dados)`.
- `inativarMetaProcesso(session, id)` / `reativarMetaProcesso(session, id)`.
- `importarMetasProcessosLote(session, linhas)` — upsert em lote (seção 5.1).

**`backend/Dashboard.gs`:**
- Nova função `dashboardMetasProcessos_(session, competencia, filtros)` →
  `{ total_esperado, total_chegado, total_falta, itens: [...], sem_meta: [...] }`.
- `obterDashboard` passa a aceitar `unidadeIds`/`objetos`/`estado` nos
  `params` (`estado`: `'chegado' | 'falta'`, opcional — aplica o critério da
  seção 3) e repassar para essa função; chama `todasRecibosComCache_()` (já
  lido nessa função — reaproveita, sem reler a aba). Sem parâmetro de fonte.

**`backend/Utils.gs` / `Contadores.gs`:** nova entrada no mapa `PREFIXOS_ID`
para a aba `MetasProcessos` (`proximoId_`).

**`backend/Code.gs`:** novos `case` no dispatch para os 5 endpoints acima.

**Planilha:** nova aba `MetasProcessos` com o cabeçalho da seção 2 — **criada
sob demanda** na primeira escrita (`getSheetMetasProcessos_`), mesmo padrão já
usado por `RecibosOrdensBancarias`/`RelatoriosModelos`/`Sugestoes`. Não
precisa criar à mão antes de colar o `.gs`: a leitura (`obterDashboard`)
devolve lista vazia com segurança se a aba ainda não existir, e a primeira
meta cadastrada pela tela cria a aba automaticamente.

---

## 8. Frontend

- `js/metas-processos.js` **(novo)** — tela de manutenção (seção 5).
- `js/dashboard.js` — novo painel (seção 4): card resumo + barra de filtros +
  tabela + aviso "sem meta".
- `index.html` — novo `<script>` e entrada no menu para a tela nova.
- `css/style.css` — reaproveita quase tudo que já existe (`.cartao-indicador`,
  `.cartao-indicador-barra`, `.tabela`, `.selo`, `.barra-filtros`,
  `.filtro-multiplo`, `.aviso-edicao-simultanea` para o aviso "sem meta");
  única regra nova é a rotação do chevron do card (`.cartao-indicador-seta.aberta`).

---

## 9. Pontos em aberto

Resolvidos na conversa de desenho (2026-08-24):

1. **Granularidade da meta:** Unidade + Objeto (sem Fonte). ✔
2. **Carga inicial:** cadastro manual **e** importação em lote, ambos
   disponíveis permanentemente na tela (não só na carga inicial). ✔
3. **Interação do card:** recolhido por padrão; clique expande/recolhe a
   tabela detalhada no próprio Dashboard (não navega de tela). ✔
4. **Filtros do painel:** Unidade, Objeto e Estado (Chegado/Falta). **Sem**
   filtro por Fonte — removido do desenho original. ✔

Decididos pragmaticamente na implementação (2026-08-24), sem round de revisão
à parte — ambos reversíveis a qualquer momento:

5. **Nome do menu/tela:** "Metas de Processos" (o nome de trabalho usado no
   desenho inteiro) — sem sinal de que a equipe usa outro termo internamente.
6. **Aviso "chegou sem meta cadastrada":** entrou já na v1 (seção 6) — custo
   baixo dado que `dashboardMetasProcessos_` já varre os Recibos do mês de
   qualquer forma para calcular "chegado".

**Status: implementado** (sessão 2026-08-24) — ver seção 10.

---

## 10. Desvios da implementação em relação ao desenho original

Dois ajustes de simplicidade, decididos ao codar (nenhum muda o comportamento
visível ao usuário final descrito nas seções 3–6, só como ele é alcançado):

- **Filtros do painel do Dashboard são só client-side.** A seção 7 original
  previa `obterDashboard` aceitar `unidadeIds`/`objetos`/`estado`. Na prática,
  `dashboardMetasProcessos_` devolve TODOS os itens (metas ativas) já com
  esperado/chegado/falta calculados para a competência, sem filtro nenhum
  server-side — o Dashboard filtra esse array em memória a cada mudança de
  Unidade/Objeto/Estado (`js/dashboard.js`, `renderTabelaMetas_`), sem
  round-trip ao backend. Mais simples (menos parâmetros, um único endpoint) e
  mais rápido (filtro instantâneo) - a lista é pequena (uma linha por
  combinação Unidade+Objeto), então não há custo de performance em mandar
  tudo de uma vez.
- **Sem colunas `alterado_por`/`data_alteracao` em `MetasProcessos`.** A
  seção 2 original previa essas duas colunas de auditoria por linha, mas
  nenhuma outra aba do app (Unidades, ListasPersonalizadas) guarda esse par -
  o histórico de edições já vive só no Log de Auditoria (`LogAuditoria.gs`,
  `registrarDiferencas_`), que hoje cobre só os "processos" (SOF/Recibo), não
  cadastros auxiliares como Unidades/Metas. `MetasProcessos` seguiu o mesmo
  padrão de `Unidades`/`ListasPersonalizadas`: só `criado_por`/`data_criacao`.
  Se um histórico de mudança de meta vier a ser pedido no futuro, é uma
  decisão maior (estender `LogAuditoria` pra cadastros auxiliares) que vale
  seu próprio desenho, não uma coluna solta.
- **Aba `MetasProcessos` criada sob demanda, não como passo manual.** A
  seção 7 original pedia criar a aba na mão antes de colar o `.gs` (mesmo
  procedimento de todas as outras abas do app). Na implementação, seguiu o
  padrão já usado por `RecibosOrdensBancarias`/`RelatoriosModelos`/
  `Sugestoes` (`getSheetMetasProcessos_`, que cria a aba com cabeçalho na
  primeira escrita) - evita que `obterDashboard` quebre por inteiro (não só
  o painel novo) enquanto alguém não lembrasse de criar a aba à mão.

**Arquivos entregues:** `backend/MetasProcessos.gs` (novo), `backend/Utils.gs`,
`backend/Contadores.gs`, `backend/Versoes.gs`, `backend/Dashboard.gs`,
`backend/Code.gs` (6 endpoints novos), `js/metas-processos.js` (novo),
`js/dashboard.js`, `js/recibos.js` (suporte a `filtroInicial.unidade_id`/
`objeto`, usado pelo clique numa linha do painel), `index.html`,
`css/style.css` (chevron do card).

**Passo manual pendente antes de funcionar em produção:** colar
`backend/MetasProcessos.gs` (novo) + a versão atualizada de
`backend/Utils.gs`/`Contadores.gs`/`Versoes.gs`/`Dashboard.gs`/`Code.gs` no
editor do Apps Script, com nova versão da implantação (mesmo procedimento do
[`README.md`](../README.md)). A aba `MetasProcessos` em si **não** precisa
ser criada à mão - nasce sozinha, com o cabeçalho certo, na primeira meta
cadastrada pela tela (ver seção 10).
