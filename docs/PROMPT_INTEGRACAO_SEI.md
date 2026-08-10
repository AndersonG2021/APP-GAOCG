# Prompt: integrar um app web ao SEI por extensão de navegador

Cole o texto abaixo como prompt inicial num assistente de código. Ele foi escrito
a partir de uma integração que **funciona em produção** (GAOCG App → SEI da
SES-PE), e cada regra da seção "Armadilhas" corresponde a uma falha real que
custou um ciclo de teste. Seguir a lista evita repetir ~14 iterações.

Antes de colar, preencha os `«placeholders»`.

---

## PROMPT

Você vai construir uma **extensão de navegador (Manifest V3)** que leva dados de
um app web para dentro do **SEI (Sistema Eletrônico de Informações)**,
preenchendo o formulário nativo de "Incluir Documento" de um processo aberto.

### Contexto do meu caso

- **App de origem:** «nome do app», hospedado em `«https://exemplo.com/app/»`
  (vanilla JS / React / etc.)
- **SEI de destino:** `«https://sei.orgao.gov.br»`
- **Tipo de documento no SEI:** rótulo exato como aparece na lista "Escolha o
  Tipo do Documento" — ex.: `«SES - SOF - Solicitação Orçamentária e Financeira»`
- **Nível de acesso padrão:** `«Restrito»` + Hipótese Legal `«Controle Interno»`
- **O que enviar:** «descreva o documento; ex.: um HTML já gerado pelo app»
- **Número do processo de destino:** vem de «campo do app», no formato
  `NNNNNNNNNN.NNNNNN/AAAA-NN`

### Como funciona (arquitetura obrigatória)

Não existe API do SEI nem servidor no meio. A extensão automatiza o DOM sobre a
sessão que o usuário já tem autenticada. Três peças:

```
App (página web)  --chrome.runtime.sendMessage(ID)-->  background.js (service worker)
                                                              |
                                              acha a aba do SEI com o processo
                                                              |
                                                              v
                                                content-sei.js (roda na aba do SEI)
```

O envio tem **duas etapas independentes**:

1. **Cadastro (best-effort):** abre "Incluir Documento", escolhe o tipo,
   preenche os campos, salva. Se qualquer parte falhar, **não aborte** — o
   usuário completa à mão.
2. **Conteúdo (a que importa):** grave o HTML em `chrome.storage.local` como
   *pendente* **antes** de qualquer automação. Toda página do SEI que carregar
   procura o editor e injeta o conteúdo ali.

O motivo da separação está na armadilha D1.

---

## Armadilhas — cada uma custou um ciclo de teste

### A. Plataforma / extensão

**A1.** `externally_connectable.matches` funciona por **origem**. O Chrome
ignora/rejeita caminho: use `https://exemplo.com/*`, nunca
`https://exemplo.com/app/`. Consequência inevitável: qualquer página daquela
origem pode falar com a extensão.

**A2.** O ID de uma extensão **sem compactação** deriva do CAMINHO da pasta no
disco. Mover ou renomear a pasta muda o ID. Deixe o ID sobrescrevível em runtime
(ex.: `localStorage`) para não precisar de novo deploy do app a cada mudança.

**A3.** Content script roda em **isolated world**: compartilha o DOM, mas **não
enxerga variáveis da página** (`window.jQuery`, `window.CKEDITOR` são sempre
`undefined` ali). Para chegar nelas use
`chrome.scripting.executeScript({ world: "MAIN", func, args })` — mais limpo que
`web_accessible_resources` e não expõe recurso da extensão a terceiros.

**A4.** Se a aba do SEI já estava aberta **antes** da instalação/recarga da
extensão, o content script não foi injetado nela e `chrome.tabs.sendMessage`
falha com *"Could not establish connection"*. Trate isso injetando o script sob
demanda (`chrome.scripting.executeScript`) e repetindo a mensagem.

**A5.** Coloque **todo o código que executa na carga no FIM do arquivo**, depois
de todas as declarações. `function` é içada; `let`/`const` ficam na Temporal Dead
Zone. Uma chamada no meio do arquivo referenciando um `let` declarado abaixo
mata o content script inteiro **antes de registrar qualquer listener** — e o
sintoma é "nada acontece", sem pista alguma.

**A6.** Só o **frame do topo** deve registrar o listener de mensagens. Com todos
os frames respondendo, o primeiro `sendResponse` vence e os demais viram erro.

**A7.** Navegação mata o content script. Se um handler retornou `true` (resposta
assíncrona) e a página navegar antes de responder, o console enche de *"message
channel closed before a response was received"*. Garanta **uma única** resposta,
com timeout, e ignore mensagens quando a página estiver saindo
(`pagehide`/`beforeunload`).

### B. Encontrar elementos no SEI

**B1.** Procure elementos no documento do topo **E em todos os iframes de mesma
origem**, recursivamente. A barra de ações do processo fica dentro de
`ifrVisualizacao` — procurar só em `document` nunca acha o botão "Incluir
Documento".

**B2.** **Escope** a busca ao frame certo antes de procurar campos genéricos. O
"primeiro input de texto visível" da página é o da **busca da barra superior do
SEI**, não o campo da tela em que você está. Ancore por um texto exclusivo da
tela (ex.: "Escolha o Tipo do Documento") e busque dentro daquele documento.

**B3.** Localize campos pelo **rótulo visível**, não por `id`. Os ids do SEI
variam por versão e customização de órgão (`#txtDescricao` e afins são chute).
Rótulos como "Descrição:", "Nome na Árvore:", "Hipótese Legal:" estão na tela e
são estáveis. Implemente: acha o elemento cujo texto bate com o rótulo, e pega o
`label[for]` ou o primeiro campo depois dele na ordem do documento.

**B4.** Nunca chute o texto de um rótulo/campo. **Peça um print da tela real** e
use o que está lá. Um chute de rótulo já custou um bug em produção neste
projeto.

### C. Preencher o cadastro

**C1.** A escolha do tipo do documento **não é um `<select>`**: é um campo de
filtro + autocomplete (jQuery UI), e o item traz a sigla da unidade na frente
("SES - SOF - ..."). Compare por **"contém"**, nunca por igualdade exata.

**C2.** `.click()` num item de autocomplete jQuery UI **não seleciona** — o
widget age no `mousedown`/`menuselect`. Use o caminho nativo: **ArrowDown +
Enter** no campo de filtro.

**C3.** O construtor de `KeyboardEvent` **não deixa** definir `keyCode`/`which`
(são getters derivados), e é exatamente por eles que o jQuery normaliza a tecla.
Sem forjá-los com `Object.defineProperty`, o handler da página recebe keyCode 0 e
**ignora o evento**. Sem isso, nenhuma tecla sintética funciona.

**C4.** Não dispare eventos em duplicidade num radio (`checked = true` +
`.click()` + `change` manual). O handler do SEI roda repetido e estoura
`Cannot read properties of null`. Um disparo só; e se o campo **já** estiver
marcado, não toque nele.

**C5.** Campos condicionais só existem **depois** de marcar a opção que os
revela (ex.: "Hipótese Legal" só aparece após marcar "Restrito"). Espere o campo
aparecer em vez de preencher em sequência.

**C6.** O botão pode se chamar "Salvar" **ou** "Confirmar Dados" conforme a
versão. Aceite os dois.

**C7.** Se houver "Texto Inicial: Nenhum", marque — em tese o editor abriria
vazio. **Mas confira:** tipos com modelo cadastrado abrem com o template mesmo
assim (foi o caso aqui).

### D. Colocar o conteúdo no editor

**D1.** O editor de texto **não existe** na tela de cadastro. Ele só abre depois
de "Salvar"/"Confirmar Dados", em geral **numa janela nova**. Por isso o conteúdo
precisa ficar *pendente* em `chrome.storage.local` e ser injetado por qualquer
página do SEI que carregue e encontre um editor.

**D2.** Um documento do SEI tem **seções separadas** — cabeçalho, principal,
rodapé, assinatura — e **cada uma é uma instância própria do CKEditor**. Escolha
UMA: descarte as `readOnly` (é como o SEI trava cabeçalho/rodapé) e prefira a de
maior altura / nome ligado ao corpo. Aplicar em todas escreve o documento por
cima do cabeçalho e do rodapé.

**D3.** Use `CKEDITOR.instances[nome].setData(html)` (via MAIN world, ver A3), não
`innerHTML`. O CKEditor grava a partir de `getData()`, do modelo interno — o que
você escreve no DOM pode ser simplesmente ignorado ao salvar. Mantenha
`innerHTML` como fallback.

**D4.** Só use instância com `status === "ready"`. Uma instância ainda em
`loaded`/`unloaded` **descarta** o `setData` quando termina de carregar.

**D5.** ⚠️ **A corrida mais traiçoeira:** o corpo do editor existe no DOM **antes**
de o modelo do documento terminar de carregar. Injetar nesse intervalo faz o
modelo ser carregado **por cima** — resultado idêntico a "não fez nada".
Espere o `innerHTML` do editor **parar de mudar** (ex.: 1,5s estável) antes de
injetar.

**D6.** Depois de injetar, **confira** se o conteúdo entrou (ex.: tamanho do
`innerHTML` ≥ 50% do enviado) e **repita até 3 vezes**. Sem conferência, a
extensão anuncia "inserido" com o modelo na tela — mentindo sobre o resultado.
Falhando as 3, avise que **não** colou e ofereça o caminho manual.

**D7.** O editor descarta `<style>`. Converta o CSS em atributos `style` inline e
acrescente `border="1"` nas tabelas — senão o documento chega sem borda alguma.

**D8.** Se o tipo tiver modelo, ele pode conter um **número gerado pelo SEI na
hora da criação** (ex.: "173/2026"), que o app não tem como saber antes. Leia o
número do modelo **antes** de substituir o conteúdo e aplique-o no seu HTML.

**D9.** Esperas de acomodação (aguardar sobrescrita tardia, deixar o CKEditor
processar antes de salvar) **não** podem virar "espere até dar certo" — o
problema chega *depois* do primeiro acerto. Já esperas de "aguardar algo
aparecer" devem ser adaptativas, com polling curto.

### E. Integridade do processo (não negociável)

**E1.** **Nunca** caia em "qualquer aba do SEI aberta" quando o processo alvo não
for encontrado. Isso cria o documento **no processo errado**, sem aviso, num
sistema de processos oficial.

**E2.** Identifique o processo lendo o **texto da página**, não a URL: a URL de
`procedimento_trabalhar` traz `id_procedimento` (id interno do banco), que não
tem relação com o número que o usuário digitou. Compare só os dígitos.

**E3.** **"Listado" não é "aberto".** Telas de listagem (ex.: "Controle de
Processos") exibem vários números. Exija também que a aba esteja na página do
processo (`procedimento_trabalhar`) — só ali existe o botão "Incluir Documento".

**E4.** Processo não aberto: **não abra aba nova de cara**. A barra "Pesquisar..."
existe em qualquer tela do SEI — reaproveite uma aba já aberta. Aba nova é
fallback.

**E5.** Guarde o envio inteiro e **retome sozinho** quando o processo certo
abrir, em vez de exigir um segundo clique no app. Mantenha: expiração (ex.: 15
min), consumo único, e trava contra duas abas retomando o mesmo envio.

**E6.** Decida conscientemente sobre automatizar o "Salvar". Aqui foi
automatizado a pedido do usuário — o documento é **criado**, nunca **assinado**,
e permanece removível. **Não automatize assinatura.**

---

## Diagnóstico que você deve embutir desde o início

Sem isso, cada erro custa um ciclo inteiro de "testa e me conta":

- `console.log` **dentro do MAIN world** (sai no console da página do SEI) com a
  lista de instâncias do CKEditor: nome, `readOnly`, `status`, altura, e qual foi
  escolhida.
- Aviso visual **na própria página do SEI** (banner fixo) a cada etapa — o app
  pode nem estar visível quando o editor abre.
- Na mensagem final, diga **qual caminho** foi usado (API vs DOM), **qual seção**
  recebeu, e **se salvou**. Mensagem que não distingue sucesso de fracasso é pior
  que erro.

## Critérios de aceite (roteiro de teste)

1. Processo **aberto** na aba → fluxo completo até o editor com conteúdo.
2. Processo **fechado** → pesquisa na aba existente, e ao abrir o processo o
   documento é criado **sozinho**.
3. Processo **errado** aberto → recusa com mensagem clara, sem criar nada.
4. Aba do SEI aberta **antes** de instalar a extensão → funciona (A4).
5. Console da página do SEI **limpo** ao final.
6. Conteúdo **persiste depois de salvar** (não só aparece na tela).
7. Tabelas com borda no documento salvo (D7).

## Regras de trabalho comigo

- **Não invente seletor nem rótulo.** Se precisar de um, peça print da tela real.
- Depois de cada mudança, diga **exatamente** o que testar e **o que observar**
  para distinguir as causas possíveis.
- Se algo não foi verificado, diga que não foi. Não relate sucesso presumido.

## Licenciamento

Existe uma extensão madura para SEI, o **SEI Pro** (github.com/SEI-Pro/sei-pro),
licenciada em **AGPL-3.0**. Estudar arquitetura e técnica é livre — técnica não é
protegida por direito autoral. **Copiar trechos de código obrigaria a sua
extensão a virar AGPL**, com publicação de código. Para software interno de
órgão público isso é decisão jurídica, não técnica. Escreva do zero.

Observação útil: o SEI Pro **não** tem `externally_connectable` — ele não
conversa com sites externos. A ponte app→extensão é trabalho novo de qualquer
forma.
