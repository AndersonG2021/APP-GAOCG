# Prompt de Construção — GAOCG App

Você vai atuar como engenheiro(a) full-stack responsável por construir, do zero, o **GAOCG App**: uma aplicação web interna que substitui as planilhas de Google Sheets hoje usadas pela Gerência Administrativa Orçamentária dos Contratos de Gestão (GAOCG) para controlar SOFs, Notas de Empenho e Recibos de pagamento.

Este prompt é a camada de orquestração do projeto. As duas fontes abaixo são a **especificação canônica** — leia os dois arquivos **na íntegra** antes de escrever qualquer código, e trate qualquer conflito entre este prompt e eles a favor dos arquivos (exceto nos pontos da seção "Decisões já tomadas", que têm prioridade absoluta):

- `documento_requisitos_gaocg.md` — funcionalidades, regras de negócio, critérios de aceite, fluxos.
- `modelo_dados_gaocg.md` — schema completo das abas do Google Sheets, relacionamentos, convenções de nomenclatura.

Não resuma ou reinvente essas regras de memória — releia os arquivos sempre que for implementar a funcionalidade correspondente.

---

## 1. Contexto do produto

- Uso interno exclusivo da equipe da GAOCG (gerente + analistas de 6 frentes: SOF-UPA, SOF-UPAE, SOF-Hospital, Recibo-UPA, Recibo-UPAE, Recibo-Hospital).
- Hospedagem sem custo: **frontend estático no GitHub Pages** + **backend em Google Apps Script** + **Google Sheets como banco de dados**.
- Volume: centenas de SOF/ano e ~1.000 recibos/ano. Precisa de paginação e boa performance de busca/filtro, mas não é big data — não otimize prematuramente além do que os requisitos pedem.
- Login por perfil (analista/gerente), autopreenchimento por unidade, log de auditoria completo, confirmação extra em edição entre frentes.

---

## 2. Decisões já tomadas (não reabrir, não perguntar de novo)

Estas quatro decisões já foram fechadas com a área de negócio e estão refletidas nos dois documentos. Implemente exatamente como descrito neles:

1. **Edição simultânea (Funcionalidade 10):** aviso informativo com duas opções — "Sair" ou "Continuar mesmo assim". Nunca um bloqueio rígido.
2. **Expiração da marcação "em edição":** não existe expiração automática por tempo/heartbeat. A decisão de avançar é sempre manual e imediata de quem encontra o aviso.
3. **Migração de Recibos históricos:** não gera entradas retroativas em `LogAuditoria`. O log de auditoria só existe a partir de eventos ocorridos dentro do sistema, após o lançamento.
4. **Destaque de "processo parado" (5+ dias):** vale para SOF e Recibo, mas é suprimido quando o `andamento`/`status` atual do processo está marcado com `pausa_contagem_parado = VERDADEIRO` na aba `ListasPersonalizadas` (para modelar esperas externas legítimas, como aguardar autorização da CPF).

---

## 3. Stack técnica definida

Não decida a stack por conta própria — use exatamente esta, pelos motivos indicados:

- **Frontend:** HTML + CSS + JavaScript **vanilla**, sem framework e sem etapa de build, publicado diretamente via GitHub Pages. Motivo: zero custo, zero pipeline de build para manter, e a equipe que vai dar manutenção no futuro não é necessariamente composta por desenvolvedores especializados em um framework específico. Pode usar bibliotecas pontuais via CDN (ex.: uma lib leve de tabela/paginação) se isso reduzir substancialmente o código a mão, mas mantenha dependências ao mínimo.
- **Backend:** Google Apps Script, publicado como **Web App** (`doGet`/`doPost`), atuando como API JSON. Todas as leituras/escritas do frontend passam por essa API — o frontend nunca acessa o Sheets diretamente.
- **Banco de dados:** Google Sheets, uma aba por "tabela", exatamente conforme `modelo_dados_gaocg.md`.
- **Repositório:** um único repositório Git com esta estrutura sugerida (ajuste livremente, mas documente qualquer desvio no README):

```
/frontend
  index.html
  /css
  /js
    api.js          # wrapper de chamadas à Web App do Apps Script
    auth.js
    unidades.js
    sof.js
    recibos.js
    dashboard.js
    log-auditoria.js
    edicao-simultanea.js
/backend (Apps Script)
  Code.gs           # doGet/doPost, roteamento
  Auth.gs
  Unidades.gs
  Sof.gs
  NotasEmpenho.gs
  Recibos.gs
  ListasPersonalizadas.gs
  LogAuditoria.gs
  EdicoesEmAndamento.gs
  Contadores.gs      # geração atômica de IDs
  Utils.gs
/docs
  documento_requisitos_gaocg.md
  modelo_dados_gaocg.md
README.md
```

---

## 4. Requisito de segurança obrigatório (não está nos documentos originais — trate como Must)

A arquitetura GitHub Pages + Apps Script expõe a Web App publicamente por padrão. Como o sistema lida com CNPJ, valores de contrato e dados financeiros sensíveis, implemente **antes de qualquer outra funcionalidade**:

- A Web App do Apps Script deve validar toda requisição contra as credenciais/sessão do usuário (nenhum endpoint deve retornar dados sem autenticação, mesmo os de leitura).
- Senhas: hash (ex.: SHA-256 com salt, dado que Apps Script não tem bibliotecas robustas de hashing como bcrypt nativamente — documente essa limitação no README como trade-off conhecido do ambiente de baixo custo).
- Trate explicitamente o problema de CORS entre o domínio do GitHub Pages e o da Web App do Apps Script (Apps Script tem particularidades aqui — pesquise a forma correta de configurar `ContentService`/`doOptions` ou o padrão de deployment "Anyone" com tratamento de preflight). Resolva isso como uma tarefa técnica exploratória (spike) no início do projeto, antes de construir as telas.
- Nunca exponha o ID da planilha (`Spreadsheet ID`) nem lógica de acesso direto no código do frontend — tudo fica encapsulado no Apps Script.
- Valide e sanitize toda entrada recebida pela Web App (nunca confie em dados vindos do cliente, mesmo sendo uso interno).

---

## 5. Plano de implementação por fases

Siga esta ordem. Cada fase deve ter seu próprio "Definition of Done" testável antes de avançar para a próxima — não pule para telas antes de fechar a fundação.

**Fase 0 — Fundação**
- Configurar planilha Google Sheets com todas as abas do `modelo_dados_gaocg.md`, incluindo a aba de controle `Contadores` para geração de IDs.
- Spike de CORS/deployment da Web App (ver Seção 4).
- Autenticação (Funcionalidade 1) end-to-end: tela de login → validação no Apps Script → carregamento de perfil/frente.
- Gestão de Usuários (Funcionalidade 9), pois é pré-requisito da autenticação ter usuários cadastrados.

**Fase 1 — Cadastro Mestre de Unidades**
- Funcionalidade 2 completa: CRUD de unidades, validação de CNPJ, bloqueio de duplicidade por `cnpj + contrato_gestao`, inativação sem cascata.

**Fase 2 — SOF**
- Funcionalidade 3 completa: CRUD, autopreenchimento via unidade (com snapshot e alerta de divergência), validação de formato de `sei` e `sof_numero`, cadastro incremental (rascunho), lista de `andamento` por frente (Funcionalidade 3 + aba `ListasPersonalizadas` com `pausa_contagem_parado`).
- Funcionalidade 5 (Notas de Empenho) acoplada ao SOF: relação 1:N, atualização de `possui_ne`.

**Fase 3 — Recibos**
- Funcionalidade 4 completa: CRUD, rateio (`rateio_grupo_id`, `percentual_rateio`), alertas de divergência de valores (informativos, não bloqueantes), lista de `status` por frente.
- Migração do histórico: importar a planilha "Recibos Regulares + Rateio" para a aba `Recibos` com `origem = importacao_inicial`, preservando vínculos de rateio, **sem** gerar entradas em `LogAuditoria` (ver Decisão 3). Esta migração depende da Fase 1 já estar concluída (unidades cadastradas antes).

**Fase 4 — Permissões e Auditoria**
- Funcionalidade 6 completa: regra de confirmação em edição cruzada de frente, log de 100% das edições, tela de log completa (gerente) e restrita (analista, só as próprias ações).

**Fase 5 — Listagem, Filtros, Busca e Exportação**
- Funcionalidade 7 completa: paginação, busca livre multi-campo, filtros combináveis (AND com a busca), exportação CSV refletindo exatamente o filtro atual.

**Fase 6 — Dashboard e Indicadores**
- Funcionalidade 8 completa: indicadores de Recibo por competência (padrão mês atual), indicador de "SOF com NE pendente" via campo pré-calculado `possui_ne`, destaque de "processo parado" com a exceção de `pausa_contagem_parado`, remoção do destaque ao visualizar.

**Fase 7 — Edição Simultânea (Should)**
- Funcionalidade 10 completa: aviso com as duas opções, sem expiração automática, conforme Decisão 1 e 2.

**Fase 8 — Polimento**
- Revisão de UX (nomenclaturas e campos devem espelhar exatamente a planilha atual, conforme requisito de compatibilidade), README com instruções de deploy (GitHub Pages + Apps Script) e de configuração inicial da planilha.

---

## 6. Convenções de código

- Siga rigorosamente a nomenclatura de colunas do `modelo_dados_gaocg.md` (snake_case, sufixo `_snapshot` para campos copiados, `_id` para FKs) tanto no backend quanto nos payloads JSON trocados com o frontend — não traduza ou reformate nomes de campo entre as camadas.
- IDs sequenciais por prefixo (`SOF-000001`, `REC-000001`, etc.) gerados de forma atômica pela aba `Contadores`, nunca no frontend.
- Toda função do Apps Script que grava dados deve, ao final, registrar a entrada correspondente em `LogAuditoria` (exceto os casos explicitamente isentos: migração inicial de Recibos).
- Datas em ISO (`AAAA-MM-DD` ou com horário), nunca no formato regional do Sheets.
- Booleans como `VERDADEIRO`/`FALSO`, nativo do Sheets.

---

## 7. Fora de escopo (não construir, nem propor proativamente)

- Gerador automático de documentos (Atesto, Liquidação) em PDF/Docs.
- Calendário de prazos com notificação por e-mail.
- Checklist digital de documentos (Anexo VII).
- Relatórios avançados exportáveis além do CSV simples da Funcionalidade 7.
- Integração direta com Google Drive.
- Fluxo de aprovação formal de edição entre frentes (mantenha o modelo de confirmação simples).
- Login via Google OAuth (login simples contra a aba `Usuarios`).
- Telas dedicadas para RPA, Diária, Termo Aditivo/TAC e Emenda Parlamentar — esses pagamentos entram como categorias/campos dentro das telas existentes de SOF e Recibo, sem tela própria.

---

## 8. Perguntas remanescentes e defaults autorizados

Não pare o desenvolvimento para perguntar sobre estes pontos — aplique o default indicado e documente a suposição no README:

1. **Ordem de carga na migração:** popule `Unidades` antes de importar o histórico de `Recibos`. Trate isso como pré-condição de infraestrutura, não como decisão de produto pendente.
2. **Indicador de log de auditoria no dashboard do gerente:** trate como *Could* — só implemente se as Fases 0–6 já estiverem prontas e testadas. Se implementar, sugestão simples: contagem de edições `fora_da_frente` no período selecionado.
3. **Quais opções de `andamento`/`status` nascem com `pausa_contagem_parado = VERDADEIRO`:** não hardcode isso no código. Deixe o campo configurável via tela normal de cadastro de `ListasPersonalizadas` (padrão `FALSO`), e sugira ao usuário final, via README ou seed de dados comentado, marcar como `VERDADEIRO` opções como "AGUARDANDO AUTORIZAÇÃO CPF" e "AGUARDANDO DISPONIBILIDADE ORÇAMENTÁRIA" (com base no SubProcesso de Programação Financeira do processo de negócio).

---

## 9. Definition of Done geral do MVP

O projeto está pronto para entrega quando:

- Todas as funcionalidades marcadas **Must** nos dois documentos estão implementadas e testáveis manualmente contra os critérios de aceite descritos neles.
- A migração de Recibos históricos foi executada com sucesso e os dados aparecem corretamente na listagem, incluindo rateios.
- O log de auditoria cobre 100% das edições feitas dentro do sistema (não as migradas).
- A aplicação está publicada e acessível via GitHub Pages, consumindo a Web App do Apps Script sem erros de CORS.
- Existe um README cobrindo: como configurar a planilha do zero, como fazer o deploy do Apps Script, como popular o primeiro usuário gerente, e as suposições assumidas na Seção 8.

## 10. Como proceder se algo estiver genuinamente ambíguo

Se encontrar uma lacuna real entre os dois documentos e este prompt (não coberta pelas Seções 2 e 8), escolha a interpretação mais consistente com o restante da especificação, implemente, e **documente a suposição explicitamente** em um bloco `## Suposições assumidas` no README — não interrompa o desenvolvimento para perguntar, a menos que a ambiguidade bloqueie completamente uma fase inteira.
