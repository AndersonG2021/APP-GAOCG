# Documento de Requisitos — GAOCG App

## Resumo do produto

O GAOCG App substitui as planilhas de Google Sheets hoje usadas para o acompanhamento dos processos de pagamento da GAOCG (SOF, Notas de Empenho, Recibos) por uma aplicação web única, com login por perfil, autopreenchimento de dados por unidade e log de auditoria completo de edições, com confirmação extra para edições entre frentes diferentes. É de uso interno exclusivo da equipe, hospedado sem custo (GitHub Pages + Google Sheets como banco via Apps Script), suportando centenas de SOF e ~1.000 recibos por ano com listagem paginada e busca.

**Legenda de prioridade (MoSCoW):** **Must** (obrigatório no MVP) · **Should** (importante, mas o MVP sobrevive sem) · **Could** (desejável, entra se houver tempo) · **Won't now** (fora do MVP, decidido no Documento de Visão)

---

## 1. Autenticação e Sessão

**Prioridade:** Must

### Descrição e fluxo principal
1. Usuário acessa a URL da aplicação (GitHub Pages).
2. Informa login e senha.
3. Sistema valida as credenciais contra a aba `Usuarios` (via API em Apps Script).
4. Se válidas, sistema carrega o perfil do usuário (analista ou gerente) e, se analista, sua frente (SOF-UPA, SOF-UPAE, SOF-Hospital, Recibo-UPA, Recibo-UPAE ou Recibo-Hospital).
5. Usuário é redirecionado ao dashboard (Funcionalidade 8).
6. Usuário pode encerrar a sessão manualmente (logout).

### Regras de negócio e casos de borda
- Credenciais inválidas exibem mensagem genérica ("usuário ou senha incorretos"), sem indicar qual dos dois está errado (evita enumeração de usuários).
- Usuário inativado (Funcionalidade 9) não consegue autenticar, mesmo com senha correta.
- **Não há** bloqueio temporário por excesso de tentativas incorretas de login.
- **Não há** expiração de sessão por inatividade; a sessão permanece válida até o usuário fazer logout manual ou fechar o navegador.
- Não há recuperação automática de senha por e-mail (fora de escopo); redefinição depende do gerente (Funcionalidade 9).

### Critério de aceite
- Dado um usuário ativo com credenciais corretas, quando ele faz login, então é autenticado e vê o dashboard correspondente ao seu perfil e frente.
- Dado um usuário com credenciais incorretas, quando tenta logar, então recebe mensagem de erro genérica e permanece na tela de login — mesmo após múltiplas tentativas seguidas, sem bloqueio.
- Dado um usuário inativado, quando tenta logar com senha correta, então o acesso é negado.
- Dado um usuário logado e inativo por longo período (sem interação), quando volta a usar o sistema, então a sessão continua válida, sem necessidade de logar novamente.

### Requisitos não-funcionais relevantes
- Senhas nunca armazenadas ou transmitidas em texto puro sem qualquer proteção (hash mínimo, mesmo em ambiente de baixo custo).
- Tempo de resposta do login compatível com a latência do Apps Script (evitar múltiplas chamadas em série).

### Dependências
- Depende da aba `Usuarios` e do cadastro de perfil/frente (Funcionalidade 9).

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade.

---

## 2. Cadastro Mestre de Unidades

**Prioridade:** Must

### Descrição e fluxo principal
1. Analista ou gerente acessa a tela de Unidades.
2. Clica em "Nova unidade" e informa: nome da unidade, tipo (UPA/UPAE/Hospital/Carreta/etc.), OSS, CNPJ, contrato de gestão, classificação orçamentária, ação, subação e G.D. (Grupo de Despesa).
3. Sistema valida os campos e verifica duplicidade (mesma unidade/CNPJ já cadastrado).
4. Unidade é salva e passa a estar disponível para seleção nos formulários de SOF e Recibo (autopreenchimento).
5. Analista ou gerente pode editar uma unidade existente ou inativá-la.

### Regras de negócio e casos de borda
- CNPJ deve seguir formato válido (14 dígitos, com validação de dígito verificador).
- Não é permitido cadastrar duas unidades com o mesmo CNPJ e mesmo contrato de gestão.
- Inativar uma unidade não apaga nem desvincula processos (SOF/Recibo) já criados com ela — apenas impede que seja selecionada em **novos** cadastros.
- Autopreenchimento: ao selecionar a unidade em um novo processo, os campos OSS, CNPJ, contrato e classificação orçamentária são preenchidos automaticamente **como uma cópia** gravada no próprio processo (snapshot), não como referência viva ao cadastro da unidade. Para processos de **SOF**, os campos ação, subação e G.D. também são autopreenchidos da mesma forma (esses campos não existem no cadastro de Recibo).
- Correção posterior de um dado da unidade (ex.: CNPJ errado) **não propaga** para processos já criados — eles mantêm o valor histórico gravado no momento do cadastro. Apenas novos processos criados após a correção usam o valor atualizado.
- O usuário pode editar manualmente os campos autopreenchidos dentro do formulário do processo; ao fazer isso, o sistema exibe um alerta visual informando que o valor diverge do cadastro atual da unidade (sem bloquear o salvamento).

### Critério de aceite
- Dado um usuário autenticado (analista ou gerente), quando cadastra uma unidade com CNPJ já existente, então o sistema bloqueia o cadastro e exibe mensagem de duplicidade.
- Dado uma unidade cadastrada, quando o usuário cria um novo processo de SOF ou Recibo e a seleciona, então OSS, CNPJ, contrato e classificação orçamentária são preenchidos automaticamente sem necessidade de digitação; para processos de SOF, ação, subação e G.D. também são preenchidos automaticamente (esses três campos não existem no cadastro de Recibo).
- Dado um processo já criado, quando o cadastro da unidade é corrigido posteriormente, então o processo antigo mantém os valores originais (não é atualizado retroativamente).
- Dado um campo autopreenchido, quando o usuário o edita manualmente com um valor diferente do cadastro da unidade, então o sistema salva a alteração e exibe um alerta indicando a divergência.
- Dado uma unidade inativada, quando o usuário tenta selecioná-la em um novo processo, então ela não aparece na lista de seleção.

### Requisitos não-funcionais relevantes
- Busca de unidade no autopreenchimento deve responder de forma perceptivelmente instantânea (sem lag visível ao digitar), mesmo com centenas de unidades cadastradas.

### Dependências
- É pré-requisito das Funcionalidades 3 (SOF) e 4 (Recibo), que dependem do cadastro de unidades para o autopreenchimento.

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade.

---

## 3. Gestão de Processos de SOF (Anexo I)

**Prioridade:** Must

### Descrição e fluxo principal
1. Analista ou gerente acessa a tela de SOF.
2. Clica em "Novo processo" e seleciona a unidade (autopreenchimento via Funcionalidade 2).
3. Preenche os campos específicos do processo: SEI, SOF, período, andamento, DEA, objeto, T.A, parcela mensal, fonte, CEO, contrato, nota de empenho vinculada (Funcionalidade 5), valor total solicitado. Os campos ação, subação e G.D. já vêm preenchidos automaticamente a partir da unidade selecionada (Funcionalidade 2), podendo ser ajustados manualmente com alerta, como os demais campos de autopreenchimento.
4. Salva o processo, que passa a aparecer na listagem paginada e filtrável.
5. Analista ou gerente pode editar um processo existente; se o processo pertence a outra frente, aplica-se a regra de confirmação da Funcionalidade 6.
6. Analista ou gerente pode buscar (busca livre por qualquer campo) ou filtrar (unidade, OSS, status/andamento, competência, fonte) a listagem.

### Regras de negócio e casos de borda
- Campos e nomenclaturas devem espelhar exatamente os usados na planilha atual (requisito de compatibilidade do Documento de Visão), para não exigir retreinamento dos analistas.
- **SEI** segue o padrão `NNNNNNNNNN.NNNNNN/AAAA-NN` (ex.: `2300002704.000011/2026-11`) — 10 dígitos, ponto, 6 dígitos, barra, ano com 4 dígitos, hífen, 2 dígitos. Sistema valida esse formato ao salvar.
- **SOF** segue o padrão `NNN/AAAA` (ex.: `051/2026`) — número com 3 dígitos, barra, ano com 4 dígitos. Sistema valida esse formato ao salvar.
- **Andamento** é uma lista de opções **por frente**: qualquer analista pode cadastrar uma nova opção de andamento, mas essa opção nova fica disponível **apenas na sua própria frente** (ex.: uma opção criada por um analista de SOF-UPA não aparece para SOF-UPAE nem SOF-Hospital). O gerente, por ter acesso a todas as frentes, pode ver e usar as opções de todas elas.
- Um processo de SOF pode ter zero, uma ou várias Notas de Empenho vinculadas (relação 1:N com a Funcionalidade 5) — incluindo empenhos de reforço.
- Edição de processo de outra frente exige confirmação explícita e gera registro no log de auditoria (Funcionalidade 6); edição dentro da própria frente **também** é registrada no log (sem exigir confirmação).
- **Cadastro incremental (rascunho):** não é necessário preencher todos os campos de uma vez ao criar o processo. O SOF pode ser criado com um conjunto mínimo de dados (ex.: unidade e SEI) e evoluir ao longo do tempo por meio de edições sucessivas, conforme o processo avança nas etapas reais (Ajuste de CEO, Nota de Empenho, Atesto, Liquidação, Efetivação).
- **Edição simultânea:** se um segundo usuário abrir para edição um processo que já está sendo editado por outra pessoa, o sistema exibe um aviso informando quem está editando aquele processo naquele momento (ver detalhamento na Funcionalidade 10).

### Critério de aceite
- Dado um usuário autenticado, quando cadastra um novo SOF selecionando uma unidade, então os campos de autopreenchimento (OSS, CNPJ, contrato, classificação orçamentária, ação, subação e G.D.) aparecem preenchidos corretamente.
- Dado um SEI informado fora do padrão `NNNNNNNNNN.NNNNNN/AAAA-NN`, quando o usuário tenta salvar, então o sistema exibe erro de formato.
- Dado um SOF informado fora do padrão `NNN/AAAA`, quando o usuário tenta salvar, então o sistema exibe erro de formato.
- Dado um analista de SOF-UPAE, quando cadastra uma nova opção de andamento, então essa opção passa a estar disponível apenas para processos da frente SOF-UPAE (e visível ao gerente), não para SOF-UPA ou SOF-Hospital.
- Dado um processo de SOF criado apenas com unidade e SEI, quando o usuário salva, então o processo é aceito e aparece na listagem com os demais campos em branco, podendo ser completado depois via edição.
- Dado uma listagem de SOF com centenas de registros, quando o usuário aplica filtro por unidade e competência, então apenas os registros correspondentes são exibidos, com paginação mantida.
- Dado um SOF de outra frente, quando um analista tenta editá-lo, então o sistema exige confirmação antes de salvar e, ao confirmar, registra a alteração no log de auditoria.
- Dado um SOF da própria frente, quando um analista o edita, então a alteração é salva sem confirmação extra, mas ainda assim registrada no log de auditoria.
- Dado o campo de busca livre, quando o usuário digita um valor monetário, um SEI ou um nome de unidade, então o sistema retorna os processos correspondentes independentemente do campo em que o valor está.

### Requisitos não-funcionais relevantes
- Listagem paginada obrigatória (não carregar todos os registros de uma vez), para suportar centenas de SOF/ano sem degradação de performance.
- Filtros combináveis devem responder em tempo aceitável; é aceitável usar cache ou índice intermediário, desde que isso não introduza lentidão perceptível para o usuário.

### Dependências
- Depende da Funcionalidade 2 (Unidades) para autopreenchimento.
- Depende da Funcionalidade 5 (Notas de Empenho) para o vínculo de NE.
- Depende da Funcionalidade 6 (Permissões/Auditoria) para a regra de edição cruzada e registro em log.
- Depende da Funcionalidade 7 (Listagem/Filtros/Busca transversal).
- Depende da Funcionalidade 10 (Aviso de Edição Simultânea).

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade.

---

## 4. Gestão de Processos de Recibo (Anexo II)

**Prioridade:** Must

### Descrição e fluxo principal
1. Analista ou gerente acessa a tela de Recibos.
2. Clica em "Novo processo" e seleciona a unidade (autopreenchimento).
3. Preenche os campos específicos: tipo de unidade, objeto, instrumento, parcela contratual, fonte, nota de empenho, competência, valor liquidado, valor pago, ordem bancária, número do processo, observação, status.
4. Caso o pagamento seja feito por rateio (ex.: 30%/70%), cadastra duas ou mais linhas vinculadas ao mesmo processo/nota de empenho, cada uma com seu percentual e valor.
5. Salva o processo, que aparece na listagem paginada e filtrável.
6. Analista ou gerente pode editar, buscar (por qualquer campo) ou filtrar (unidade, OSS, status, competência, fonte) os recibos.

### Regras de negócio e casos de borda
- Rateio: não há exigência de que a soma dos percentuais das parcelas feche 100% como regra de bloqueio ou alerta — o percentual é informativo.
- O sistema deve alertar (visualmente, sem bloquear o salvamento) quando: (a) o valor liquidado de uma parcela não coincide com o valor pago dessa mesma parcela; ou (b) a soma dos valores das parcelas de rateio não coincide com o valor da parcela contratual do processo.
- Valor pago pode ser diferente do valor liquidado por outros motivos legítimos (ex.: pagamento parcial); o alerta é informativo, não um bloqueio.
- **Status** é uma lista de opções **por frente**: qualquer analista pode cadastrar uma nova opção de status, mas ela fica disponível apenas na sua própria frente (ex.: Recibo-UPA), seguindo o mesmo modelo do campo "andamento" do SOF (Funcionalidade 3). O gerente vê e usa as opções de todas as frentes.
- Edição de recibo de outra frente segue a mesma regra de confirmação + log da Funcionalidade 6; edição dentro da própria frente também é registrada no log.
- **Cadastro incremental (rascunho):** assim como no SOF, um recibo pode ser criado com dados mínimos e completado depois via edições sucessivas, acompanhando a evolução real do processo.
- **Edição simultânea:** segue a mesma regra de aviso de edição em andamento por outro usuário, descrita na Funcionalidade 10.
- **Migração de dados históricos:** ao contrário do módulo de SOF (que nasce zerado), o módulo de Recibo deve nascer **com todo o histórico já existente na planilha atual importado** para o sistema, incluindo os registros de rateio.

### Critério de aceite
- Dado um recibo com rateio de duas parcelas (30% e 70%), quando ambas são salvas, então aparecem como registros vinculados ao mesmo processo/nota de empenho na listagem.
- Dado um recibo cujo valor liquidado de uma parcela não coincide com seu valor pago, quando o usuário salva, então o sistema exibe um alerta visual, mas permite o salvamento.
- Dado um recibo com rateio cuja soma dos valores das parcelas não coincide com o valor da parcela contratual, quando o usuário salva, então o sistema exibe um alerta visual, mas permite o salvamento.
- Dado a listagem de recibos, quando o usuário busca pelo número do processo, ordem bancária ou valor pago, então o recibo correspondente é retornado mesmo sem uso de filtros.
- Dado um recibo de outra frente, quando um analista o edita, então o sistema exige confirmação e registra no log de auditoria.
- Dado o lançamento inicial do sistema, quando o módulo de Recibo é publicado, então todos os registros já existentes na planilha atual (incluindo rateios) aparecem na listagem, sem necessidade de recadastro manual.
- Dado o mesmo lançamento inicial, quando o módulo de SOF é publicado, então a listagem de SOF começa vazia, sem importação de dados antigos.

### Requisitos não-funcionais relevantes
- Suporte a ~1.000 registros de recibo por ano com listagem paginada e performance perceptivelmente estável.
- A importação inicial do histórico de Recibo deve preservar os vínculos de rateio (parcelas relacionadas ao mesmo processo/nota de empenho) tal como estão na planilha atual.

### Dependências
- Depende da Funcionalidade 2 (Unidades).
- Depende da Funcionalidade 6 (Permissões/Auditoria).
- Depende da Funcionalidade 7 (Listagem/Filtros/Busca transversal).
- Depende da Funcionalidade 10 (Aviso de Edição Simultânea).

### Perguntas em aberto
- Para a migração do histórico de Recibo: os registros importados devem ser vinculados a unidades já existentes no cadastro mestre (Funcionalidade 2), o que exige que o cadastro de unidades seja populado **antes** da importação — a ordem de carga (unidades → depois recibos históricos) está de acordo?
- **Resolvido:** registros históricos de Recibo importados **não** geram entradas retroativas no log de auditoria. Eles entram apenas com `origem = importacao_inicial` na própria aba `Recibos`, sem qualquer histórico de auditoria anterior à data de lançamento do sistema. O log de auditoria (`LogAuditoria`) começa a existir a partir do primeiro evento realizado dentro do sistema.

---

## 5. Controle de Notas de Empenho (Anexo III)

**Prioridade:** Must

### Descrição e fluxo principal
1. Analista ou gerente, dentro de um processo de SOF, adiciona uma Nota de Empenho: tipo (original ou reforço), número (quando aplicável), valor, período.
2. Nota de Empenho fica vinculada ao processo de SOF de origem — e apenas a ele.
3. Usuário pode visualizar, na tela do SOF, todas as Notas de Empenho já vinculadas a ele (originais e reforços), incluindo o valor de cada uma.
4. Usuário pode, opcionalmente, acessar uma listagem própria de Notas de Empenho, filtrável por unidade ou período (Should).

### Regras de negócio e casos de borda
- Um processo de SOF pode gerar **uma ou várias** Notas de Empenho ao longo do tempo (empenho original + reforços) — relação 1:N, sempre do SOF para as NEs.
- Uma Nota de Empenho pertence a exatamente um processo de SOF; não é compartilhada entre processos.
- Para **empenhos de reforço**, o número da NE é irrelevante para o controle — o que importa é o **valor** do reforço. O número pode ser registrado como informação complementar, mas não é campo obrigatório nem usado para regras de unicidade nesses casos.
- Para a NE **original**, o número segue sendo um dado relevante de identificação do processo.
- **Indicador de NE pendente (usado no dashboard, Funcionalidade 8):** todo SOF nasce sem nenhuma NE vinculada, o que o classifica como "NE pendente de emissão". No momento em que a **primeira** Nota de Empenho (original) é cadastrada para aquele SOF, o sistema marca o processo como tendo NE emitida, removendo-o da lista de pendentes. Reforços posteriores não afetam essa marcação (ela já foi resolvida pela NE original).

### Critério de aceite
- Dado um processo de SOF, quando o usuário adiciona uma Nota de Empenho original com número e valor, então ela passa a aparecer na lista de NEs daquele processo e o SOF deixa de ser listado como "NE pendente de emissão".
- Dado um processo de SOF já com uma NE original, quando o usuário adiciona um reforço informando apenas o valor (sem número), então o reforço é salvo e somado ao histórico de empenhos daquele SOF, sem alterar a marcação de "NE emitida".
- Dado a tela de um processo de SOF, quando o usuário a acessa, então vê o valor total empenhado (original + reforços) somado corretamente.

### Requisitos não-funcionais relevantes
- Nenhum requisito não-funcional específico além dos já cobertos pela Funcionalidade 3 (paginação/performance), já que o volume de NEs é proporcional ao de SOF.

### Dependências
- Depende diretamente da Funcionalidade 3 (Gestão de SOF), da qual é subordinada.
- Alimenta o indicador de "NE pendente de emissão" da Funcionalidade 8 (Dashboard).

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade.

---

## 6. Permissão de Edição entre Frentes e Log de Auditoria

**Prioridade:** Must

### Descrição e fluxo principal
1. Analista tenta editar um processo (SOF ou Recibo) que pertence à sua própria frente → edição é salva diretamente, sem etapa extra, **e registrada no log de auditoria**.
2. Analista tenta editar um processo de **outra** frente → sistema exibe modal de confirmação, identificando a frente "dona" do processo.
3. Se o analista confirmar, a alteração é salva e um registro é criado no log de auditoria (quem editou, quando, o que mudou, de/para qual frente).
4. Gerente edita qualquer processo de qualquer frente sem a etapa de confirmação (regra de confirmação não se aplica ao perfil gerente) — mas **a edição também é registrada no log de auditoria**, como qualquer outra.
5. Gerente acessa a tela de log de auditoria completo e filtra por usuário, processo, período ou tipo de alteração.
6. Analista acessa uma versão restrita da tela de log, contendo **apenas as próprias ações** (edições feitas por ele mesmo, dentro ou fora da sua frente), como forma de conferência do próprio trabalho.

### Regras de negócio e casos de borda
- A regra de **confirmação** é baseada na frente do processo, não no perfil do usuário — ou seja, um analista de SOF-UPA editando um SOF-Hospital sempre passa pela confirmação, independentemente de ambos serem "analistas".
- O perfil gerente está isento apenas da **etapa de confirmação**, nunca do **registro em log**.
- **Toda e qualquer edição** (dentro da própria frente, fora da frente, ou feita pelo gerente) é registrada no log de auditoria — o log cobre 100% das alterações, não apenas as cruzadas.
- Cancelar a confirmação não salva a alteração e não gera registro no log.
- **Visibilidade do log:** o gerente vê o log completo de todos os usuários; cada analista vê apenas as próprias entradas (não vê o log de outros analistas).

### Critério de aceite
- Dado um analista de SOF-UPA editando um processo de SOF-UPA, quando salva, então a alteração é aplicada imediatamente, sem confirmação extra, e é registrada no log de auditoria.
- Dado um analista de SOF-UPA editando um processo de Recibo-Hospital, quando tenta salvar, então o sistema exibe confirmação antes de persistir a mudança e, ao confirmar, registra no log.
- Dado um gerente editando qualquer processo, quando salva, então a alteração é aplicada sem confirmação, mas ainda assim registrada no log de auditoria.
- Dado qualquer edição salva no sistema, quando o gerente consulta o log de auditoria, então encontra o registro com usuário, data/hora, campo alterado, valor antigo, valor novo e, quando aplicável, frente de origem/destino.
- Dado um analista consultando sua própria tela de log, quando acessa, então vê apenas as edições feitas por ele mesmo, sem visibilidade das ações de outros analistas.

### Requisitos não-funcionais relevantes
- Log de auditoria não deve ser editável ou removível por nenhum perfil (garantia de integridade do rastro).
- Volume do log crescerá proporcionalmente a todas as edições do sistema (não só as cruzadas) — considerar isso no dimensionamento de performance da listagem do log (Funcionalidade 7).

### Dependências
- Depende das Funcionalidades 3 e 4 (SOF e Recibo), sobre as quais a regra de edição é aplicada.
- Depende da Funcionalidade 1 (Autenticação) para identificar frente e perfil do usuário no momento da edição.

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade.

---

## 7. Listagem, Filtros e Busca (transversal a SOF e Recibo)

**Prioridade:** Must

### Descrição e fluxo principal
1. Usuário acessa a listagem de SOF ou de Recibo.
2. Sistema carrega os registros em páginas (não a base completa de uma vez).
3. Usuário aplica um ou mais filtros combinados (unidade, OSS, status, competência, fonte).
4. Alternativamente, usuário usa o campo de busca livre, informando qualquer valor (nome de unidade, número de processo, SEI, valor pago, etc.) para localizar o registro, com ou sem filtros aplicados.
5. Resultado é exibido paginado; ao navegar entre páginas, os filtros/busca aplicados permanecem ativos.
6. Usuário pode exportar o resultado atual da listagem filtrada em CSV, para uso fora do sistema (ex.: levar a uma reunião ou repassar a outra pessoa).

### Regras de negócio e casos de borda
- Busca livre deve considerar múltiplos campos simultaneamente (não apenas um campo fixo), incluindo campos numéricos (valores) e textuais (unidade, observação).
- Combinação de filtro + busca livre deve ser tratada como interseção (AND), não substituição de um pelo outro.
- Ausência de resultados deve exibir mensagem clara ("nenhum processo encontrado"), não uma tela vazia sem explicação.
- **Exportação CSV** reflete exatamente os filtros e a busca aplicados no momento (não a base completa), com as mesmas colunas exibidas na listagem. Não é considerada parte do módulo de "relatórios avançados" fora de escopo — é uma exportação simples do que já está na tela.

### Critério de aceite
- Dado uma listagem com centenas de SOF, quando o usuário aplica filtro de unidade e competência, então apenas os registros correspondentes aparecem, mantendo a paginação.
- Dado o campo de busca livre, quando o usuário digita um valor monetário exato (ex.: "6307434,95"), então o processo com esse valor pago/liquidado é retornado.
- Dado filtros e busca já aplicados, quando o usuário navega para a página 2 da listagem, então os mesmos filtros/busca continuam ativos.
- Dado uma listagem filtrada, quando o usuário clica em "exportar CSV", então recebe um arquivo com exatamente os registros filtrados exibidos, não a base completa.

### Requisitos não-funcionais relevantes
- Performance perceptível estável mesmo com o volume anual total acumulado ao longo de múltiplos anos de uso (não apenas o volume de um único ano).
- É aceitável resolver busca/filtro por meio de cache ou índice intermediário (em vez de consulta direta ao Sheets a cada requisição), **desde que isso não gere lentidão perceptível para o usuário**. Essa é uma decisão de implementação, não uma restrição de produto.

### Dependências
- É pré-requisito funcional das Funcionalidades 3 e 4 (SOF e Recibo), que a utilizam diretamente.

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade.

---

## 8. Dashboard e Indicadores

**Prioridade:** Must (indicadores básicos) / Should (indicadores consolidados avançados)

### Descrição e fluxo principal
1. Usuário autenticado é direcionado ao dashboard após o login.
2. Para **Recibo**, dashboard exibe indicadores referentes ao período selecionado (com padrão no **mês atual**, via campo `competencia`): total de recibos, valores agrupados por status (pago, pendente, etc.).
3. Para **SOF**, o dashboard **não** é organizado por mês — o indicador relevante é a contagem/listagem de **SOF com Nota de Empenho pendente de emissão** (processos que ainda não têm nenhuma Nota de Empenho original vinculada), já que o tempo entre a criação do SOF e a emissão da NE pode se estender por vários meses sem que isso represente um problema.
4. Gerente pode visualizar indicadores consolidados de todas as frentes em um único painel.
5. Analista visualiza, por padrão, os indicadores da sua própria frente, podendo expandir para outras (Could).
6. Processos (SOF ou Recibo) sem qualquer alteração de andamento/status há mais de 5 dias recebem um destaque visual (ex.: mudança de cor) na listagem e/ou no dashboard, chamando a atenção do analista responsável — **exceto quando o valor atual de `andamento`/`status` do processo estiver marcado como "espera externa conhecida"** (ver regra abaixo), caso em que o destaque não é exibido, independentemente do tempo transcorrido.
7. Ao o analista abrir/visualizar o processo destacado, o destaque é removido e o processo volta à aparência normal.

### Regras de negócio e casos de borda
- **Recibo:** "período selecionado" tem como padrão o **mês atual** (com base em `competencia`) ao abrir o dashboard, com opção de o usuário alterar para outro período.
- **SOF:** não há filtro de período como indicador principal. O indicador central é "SOF com NE pendente de emissão" — um SOF entra nessa lista a partir da sua criação e sai dela no momento em que recebe sua primeira Nota de Empenho (original) vinculada (Funcionalidade 5). O tempo que um SOF permanece nessa lista não gera, por si só, nenhum alerta adicional (isso é esperado e pode levar meses).
- Indicadores de valor de Recibo devem somar corretamente mesmo quando há rateio (Funcionalidade 4), evitando contagem duplicada ou faltante das parcelas — a soma deve ser feita sobre `valor_pago`/`valor_liquidado` linha a linha, nunca sobre `parcela_contratual` (que se repete em todas as linhas de um mesmo grupo de rateio).
- **Regra de destaque de pendência (5 dias):** o sistema calcula os dias desde a última alteração de andamento/status de cada processo. Ao ultrapassar 5 dias sem alteração, o processo é marcado visualmente como "parado". O destaque é removido quando o analista abre/visualiza o processo (não necessariamente quando ele o edita — a simples visualização já é suficiente para "reconhecer" a pendência). Esta regra é independente do indicador de "NE pendente" do SOF.
- O contador de dias reinicia sempre que há uma alteração de andamento/status (não qualquer edição de campo).
- **Exceção — espera externa conhecida (resolve a aparente contradição entre "5 dias" e etapas de SOF que legitimamente aguardam trâmites externos por meses):** cada opção cadastrada em `ListasPersonalizadas` (andamento do SOF ou status do Recibo) possui um campo `pausa_contagem_parado`. Quando o `andamento`/`status` **atual** de um processo corresponde a uma opção com `pausa_contagem_parado = VERDADEIRO`, o destaque de "parado" não é calculado nem exibido para aquele processo, independentemente de quantos dias tenham passado desde a última alteração. Isso permite modelar corretamente etapas como "aguardando autorização da CPF" ou "aguardando disponibilidade orçamentária" (que podem legitimamente durar semanas ou meses) sem suprimir o alerta em etapas de inércia interna (ex.: "aguardando envio de documentação"), que continuam sujeitas ao destaque normal de 5 dias.
- Quem cadastra uma nova opção de andamento/status decide, no momento do cadastro, se ela representa espera externa conhecida (`pausa_contagem_parado = VERDADEIRO`) ou não (padrão `FALSO`). O gerente, por ter visão de todas as frentes, pode revisar e corrigir essa marcação posteriormente em qualquer opção.

### Critério de aceite
- Dado um usuário autenticado, quando acessa o dashboard, então vê o total de Recibos referentes ao **mês atual** (via `competencia`), sem necessidade de configuração manual.
- Dado um usuário autenticado, quando acessa o dashboard, então vê a contagem/listagem de SOF com NE pendente de emissão, independentemente de quando cada um foi criado.
- Dado um SOF que recebe sua primeira Nota de Empenho, quando a NE é salva, então esse SOF deixa de aparecer na lista de "NE pendente de emissão".
- Dado um recibo com rateio em duas parcelas, quando os indicadores de valor são calculados, então o valor total considera as duas parcelas somadas corretamente, sem duplicidade.
- Dado um processo (SOF ou Recibo) sem alteração de andamento/status há mais de 5 dias, quando o usuário acessa a listagem ou o dashboard, então o processo aparece com destaque visual diferenciado.
- Dado um processo destacado por inatividade, quando o analista responsável o abre para visualização, então o destaque desaparece, voltando à aparência normal.
- Dado um SOF cujo `andamento` atual está marcado como espera externa conhecida (`pausa_contagem_parado = VERDADEIRO`), quando passam mais de 5 dias sem alteração, então o processo **não** recebe o destaque visual de "parado".
- Dado o mesmo SOF, quando seu `andamento` muda para uma opção sem essa marcação, então a contagem de dias volta a valer normalmente a partir dessa alteração.

### Requisitos não-funcionais relevantes
- Cálculo dos indicadores não deve exigir carregar todos os registros brutos no frontend a cada acesso ao dashboard — considerar agregação no backend (Apps Script) sempre que possível.
- O indicador de "SOF com NE pendente" deve ser resolvido de forma eficiente — idealmente por um campo já calculado no próprio registro de SOF (ver Funcionalidade 5 / Modelo de Dados), evitando um cruzamento (join) com a aba de Notas de Empenho a cada acesso ao dashboard.
- Cálculo de "dias sem movimentação" deve ser feito de forma eficiente (idealmente já resolvido na consulta/listagem, não em loop no frontend), para não comprometer a performance da Funcionalidade 7.

### Dependências
- Depende das Funcionalidades 3 e 4 (dados de SOF e Recibo) como fonte dos indicadores.
- Depende da Funcionalidade 5 (Notas de Empenho) para determinar quais SOF têm NE pendente de emissão.
- Depende do registro de data da última alteração de andamento/status em cada processo (campo técnico já incluído no modelo de dados).
- Depende do campo `pausa_contagem_parado` em `ListasPersonalizadas` para a exceção de espera externa conhecida.

### Perguntas em aberto
- Os indicadores consolidados do gerente devem incluir algum indicador específico do log de auditoria (ex.: nº de edições cruzadas no período)?

---

## 9. Gestão de Usuários (exclusiva do gerente)

**Prioridade:** Must

### Descrição e fluxo principal
1. Gerente acessa a tela de Usuários (não visível/acessível para analistas).
2. Cadastra um novo analista: login, senha inicial, frente (SOF-UPA, SOF-UPAE, SOF-Hospital, Recibo-UPA, Recibo-UPAE ou Recibo-Hospital).
3. Pode editar a frente ou dados de um analista existente.
4. Pode inativar o acesso de um analista (sem apagar seu histórico no log de auditoria).
5. Pode redefinir a senha de um analista que a esqueceu (Could, já que não há recuperação automática por e-mail).

### Regras de negócio e casos de borda
- Esta é a **única** funcionalidade do sistema restrita exclusivamente ao gerente; todas as demais (unidades, SOF, Recibo, filtros, busca) são igualmente acessíveis a analistas e gerente.
- **Mais de um analista pode ser vinculado à mesma frente simultaneamente** (ex.: dois analistas de SOF-UPA ao mesmo tempo) — não há restrição de 1 analista por frente.
- "Excluir" um analista significa **inativação (soft delete)**, preservando todo o seu histórico de ações e atribuições no log de auditoria — não há exclusão definitiva de usuários no sistema.
- Inativar um analista não remove seu nome do histórico de processos criados/editados por ele nem do log de auditoria.

### Critério de aceite
- Dado um gerente autenticado, quando cadastra um novo analista com login, senha e frente, então o analista consegue autenticar e enxerga sua frente corretamente ao logar.
- Dado uma frente já com um analista vinculado, quando o gerente cadastra um segundo analista para a mesma frente, então ambos passam a atuar normalmente nela.
- Dado um analista logado, quando tenta acessar a URL/tela de Gestão de Usuários, então o acesso é negado.
- Dado um gerente que "exclui" um analista, quando a ação é confirmada, então o analista é inativado (não consegue mais logar), mas seu histórico de ações permanece intacto e visível no log de auditoria.

### Requisitos não-funcionais relevantes
- Nenhum requisito adicional além dos já cobertos pela Funcionalidade 1 (segurança de senha/hash).

### Dependências
- É pré-requisito da Funcionalidade 1 (Autenticação), já que não há login sem usuário previamente cadastrado.

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade.

---

## 10. Aviso de Edição Simultânea

**Prioridade:** Should

### Descrição e fluxo principal
1. Usuário A abre um processo (SOF ou Recibo) para edição; o sistema registra uma linha em `EdicoesEmAndamento`.
2. Usuário B tenta abrir o mesmo processo para edição enquanto o registro de A ainda existe.
3. Sistema exibe ao Usuário B um aviso informando que aquele processo está sendo editado por A (identificando o nome e desde quando), com **duas opções explícitas**: **"Sair"** (cancela a tentativa, volta à listagem/visualização) ou **"Continuar mesmo assim"** (abre a tela de edição normalmente, por conta e risco de B).
4. A decisão é sempre imediata, tomada por quem encontra o aviso, no momento em que o encontra — **não há espera, contagem ou expiração por tempo envolvida nessa decisão**.
5. Quando o Usuário A salva ou sai explicitamente da tela de edição, o registro em `EdicoesEmAndamento` é removido, liberando o processo para os demais.
6. Se o Usuário B optar por "Continuar mesmo assim", o sistema não impede a ação nem cria um mecanismo de fila — a edição de B prossegue normalmente; se ambos salvarem, prevalece a última gravação (comportamento padrão, equivalente ao que já ocorre hoje em edição de planilhas).

### Regras de negócio e casos de borda
- O aviso é sempre informativo, nunca um bloqueio rígido: a segunda pessoa sempre pode optar por "Continuar mesmo assim".
- O aviso deve identificar quem está editando o processo (nome do analista) e, se disponível, desde quando (`iniciado_em`), de forma meramente informativa.
- **Não há expiração automática por tempo** da marcação "em edição". Se o Usuário A fechar a aba/navegador sem salvar e sem liberar explicitamente, o registro em `EdicoesEmAndamento` permanece — mas isso não trava ninguém, porque qualquer usuário que encontrar esse registro decide, na hora, se quer sair ou continuar mesmo assim. Essa decisão manual substitui a necessidade de heartbeat/polling para expiração automática.
- O campo `ultimo_heartbeat` (Modelo de Dados) é mantido apenas como informação de apoio ("editando desde..."), não é usado para lógica de expiração.

### Critério de aceite
- Dado um processo já aberto para edição pelo Usuário A, quando o Usuário B tenta abri-lo também para edição, então recebe um aviso com o nome do usuário responsável e as duas opções: "Sair" e "Continuar mesmo assim".
- Dado o aviso exibido ao Usuário B, quando ele escolhe "Sair", então retorna à tela anterior sem abrir o processo para edição.
- Dado o aviso exibido ao Usuário B, quando ele escolhe "Continuar mesmo assim", então a tela de edição abre normalmente, sem qualquer outro bloqueio.
- Dado um registro de edição deixado ativo por um usuário que fechou a aba sem salvar (há qualquer tempo, minutos ou dias), quando outro usuário tenta editar o mesmo processo, então o aviso aparece normalmente e a decisão de seguir ou não é imediata, sem exigir espera.

### Requisitos não-funcionais relevantes
- A verificação de "quem está editando" deve ser leve, sem exigir polling agressivo que sobrecarregue as chamadas ao Apps Script.

### Dependências
- Aplica-se transversalmente às Funcionalidades 3 (SOF) e 4 (Recibo).

### Perguntas em aberto
- Nenhuma pendente para esta funcionalidade (decisões de bloqueio/expiração resolvidas: aviso com opção de sair ou continuar; sem expiração automática por tempo).

---

## Funcionalidades fora do MVP (Won't now)

Confirmadas no Documento de Visão como fora do escopo atual — não detalhadas neste documento de requisitos:

| Funcionalidade | Motivo |
|---|---|
| Gerador automático de documentos (Atesto, Liquidação) em PDF/Docs | Fora de escopo do MVP |
| Calendário de prazos com notificação por e-mail | Fora de escopo do MVP |
| Checklist digital de documentos por processo (Anexo VII) | Fora de escopo do MVP |
| Relatórios avançados exportáveis (Excel/PDF) — exportação simples em CSV entrou no MVP (Funcionalidade 7) | Fora de escopo do MVP |
| Integração direta com Google Drive | Fora de escopo do MVP |
| Fluxo de aprovação formal de edição entre frentes (em vez do modelo de confirmação simples) | Alternativa mais rígida, avaliada para depois |
| Login via Google OAuth | MVP usa login simples contra a aba `Usuarios` |
| Módulos dedicados de RPA, Diária, Termo Aditivo/TAC e Emenda Parlamentar | Entram apenas como categorias dentro da estrutura existente, sem telas próprias |

---

## Consolidado de perguntas em aberto (4ª rodada)

Todas as perguntas das rodadas anteriores foram respondidas e incorporadas às seções correspondentes. **Resolvidas nesta rodada:**

- ~~O aviso de edição simultânea deve apenas informar, ou bloquear de fato a segunda edição?~~ **Resolvido:** aviso informativo com duas opções explícitas — "Sair" ou "Continuar mesmo assim" (Funcionalidade 10).
- ~~Qual o tempo de expiração automática da marcação "em edição"?~~ **Resolvido:** não há expiração automática por tempo; a decisão de seguir ou não é sempre imediata, tomada por quem encontra o aviso (Funcionalidade 10).
- ~~Registros históricos de Recibo importados devem gerar entradas retroativas no log de auditoria?~~ **Resolvido:** não geram (Funcionalidade 4).
- ~~O destaque visual de processos parados há 5+ dias deve valer igualmente para SOF e Recibo, considerando que SOF pode legitimamente aguardar trâmites externos mais longos?~~ **Resolvido:** vale para os dois, mas com exceção controlada por opção de `andamento`/`status` marcada como espera externa conhecida (`pausa_contagem_parado`), que suprime o destaque enquanto o processo estiver nessa etapa (Funcionalidade 8).

**Restam, desta rodada:**

1. Para a migração do histórico de Recibo: confirmar que o cadastro de unidades (Funcionalidade 2) deve ser populado **antes** da importação dos recibos históricos, já que estes dependem do vínculo com unidades cadastradas.
2. Os indicadores consolidados do dashboard do gerente devem incluir algum indicador específico do log de auditoria (ex.: nº de edições cruzadas no período)?
3. Quais opções de `andamento` (SOF) e `status` (Recibo) já existentes na migração/cadastro inicial devem nascer com `pausa_contagem_parado = VERDADEIRO`? Sugestão: mapear isso junto com a equipe operacional antes do lançamento (ex.: "AGUARDANDO AUTORIZAÇÃO CPF", "AGUARDANDO DISPONIBILIDADE ORÇAMENTÁRIA" como candidatas naturais, com base no SubProcesso de Programação Financeira).
