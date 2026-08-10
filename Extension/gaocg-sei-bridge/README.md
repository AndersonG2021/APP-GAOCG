# GAOCG SEI Bridge — extensão-ponte

Extensão de navegador (Manifest V3) que recebe dados do app GAOCG e preenche
o formulário nativo de inclusão de documento de um processo aberto no SEI.

## Arquitetura

```
GAOCG (GitHub Pages)  --chrome.runtime.sendMessage-->  background.js (extensão)
                                                              |
                                                    acha a aba do SEI certa
                                                              |
                                                              v
                                              content-sei.js (roda na aba do SEI)
                                                              |
                                                preenche o form nativo de "Incluir Documento"
```

Não existe servidor intermediário: a extensão fala diretamente com a aba do
navegador que já está autenticada no SEI. Só funciona no mesmo navegador, com
o SEI aberto e logado.

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions`.
2. Ative "Modo do desenvolvedor" (canto superior direito).
3. "Carregar sem compactação" → selecione a pasta `Extension/gaocg-sei-bridge`
   (a que contém o `manifest.json`).
4. Copie o **ID da extensão** que aparece no card.
5. Compare com o ID configurado em `js/sei-bridge.js` (`ID_PADRAO_`). Se for
   diferente, **não precisa mexer no código** — no app, abra o console do
   navegador (F12) e rode:
   ```javascript
   localStorage.setItem('gaocg_sei_extension_id', 'cole-o-id-aqui');
   ```
   Recarregue a página e pronto.

> **Por que o ID pode mudar:** numa extensão sem compactação, o Chrome deriva o
> ID do CAMINHO da pasta no disco. Mover ou renomear a pasta muda o ID. Foi
> exatamente o que aconteceu quando a pasta duplicada
> (`gaocg-sei-bridge/gaocg-sei-bridge/`) foi achatada.

## Como usar

1. No SEI, abra o processo que vai receber o documento (deixe a aba aberta).
2. No GAOCG, abra a SOF e clique em **"Salvar e enviar ao SEI"**.
3. A extensão traz a aba do SEI para a frente, abre "Incluir Documento" e tenta
   escolher o tipo e preencher o cadastro.
4. **Você revisa e clica em "Confirmar Dados"** — a extensão nunca confirma
   sozinha (`autoEnviar` é sempre `false` no app).
5. O SEI abre o editor do documento. **É nesse momento que o conteúdo da SOF
   entra:**
   - se o editor abrir **vazio**, o conteúdo entra sozinho e um aviso verde
     aparece no canto;
   - se o tipo escolhido tiver **modelo próprio** no SEI (o tipo "SOF" tem), o
     editor abre com o template em branco. Aí aparece uma barra azul no canto
     perguntando se pode substituir — clique em **"Substituir"**.
6. Revise e salve o documento.

O processo de destino é encontrado pelo número SEI da própria SOF (campo
`sei`), comparado com o título/URL das abas abertas no `sei.pe.gov.br`.

### Por que em duas etapas

No SEI, o editor de texto **não existe** na tela de cadastro: ele só abre depois
de "Confirmar Dados", geralmente numa janela nova. A v0.2.0 tentava injetar o
conteúdo durante o cadastro e, como o editor ainda não existia, o documento
nascia vazio — foi o que aconteceu no primeiro teste real.

Agora o conteúdo é guardado em `chrome.storage.local` como *pendente* logo no
começo, e **qualquer** página do SEI que carregar procura um editor vazio para
injetá-lo. Consequências práticas:

- Funciona mesmo que você escolha o tipo e preencha o cadastro **na mão** — as
  duas etapas são independentes.
- O pendente expira em **15 minutos**.
- Em editor **vazio**, entra sozinho. Em editor **com conteúdo**, a extensão
  **pergunta** antes (barra azul com "Substituir"). Não dá para distinguir pelo
  DOM o modelo em branco de um documento já preenchido — as duas coisas são só
  HTML no corpo do editor — então quem decide é você. Sem essa pergunta, a
  escolha seria entre "não funciona com tipos que têm modelo" e "pode apagar um
  documento oficial sem avisar".
- Se você desistir no meio, o pendente some sozinho ao expirar.

### Tipo do documento

`MAPA_TIPO_DOCUMENTO` (em `content-sei.js`) tem uma lista **em ordem de
preferência** por tipo do GAOCG:

```javascript
sof: ["SOF", "Solicitação Orçamentária e Financeira", "Anexo"]
```

A extensão tenta cada nome e usa o primeiro que existir na sua unidade. Se
nenhum existir, ela **não falha** — deixa a tela de escolha aberta para você
decidir, e o conteúdo entra normalmente na etapa 2. Ajuste a lista se sua
unidade usar outro nome.

## Configuração por ambiente

| Onde | O quê | Quando mexer |
|---|---|---|
| `manifest.json` → `host_permissions` / `content_scripts` | `https://sei.pe.gov.br/*` | Se o SEI da sua unidade estiver em outro domínio |
| `manifest.json` → `externally_connectable` | `https://andersong2021.github.io/*` | Se o GAOCG mudar de domínio. **Só origem — o Chrome ignora caminho aqui**, então não dá para restringir a `/APP-GAOCG/` |
| `content-sei.js` → `MAPA_TIPO_DOCUMENTO` | `sof: "SOF"` | O texto tem que ser **idêntico** ao tipo de documento cadastrado no SEI da sua unidade |
| `js/sei-bridge.js` → `ID_PADRAO_` | ID da extensão | Ver instalação acima (ou use o `localStorage`) |

## Ainda não validado num SEI real

O fluxo depende de seletores do formulário nativo do SEI, que variam entre
versões e customizações por órgão. Os pontos a conferir com o DevTools aberto,
na primeira vez:

- **Botão "Incluir Documento"** — procurado por `a[title="Incluir Documento"]`,
  `img[title="Incluir Documento"]` e `a[href*="documento_escolher_tipo"]`, em
  todos os frames de mesma origem.
- **Escolha do tipo** — suporta os dois formatos que o SEI usa: um
  `<select id="selSerie">` ou uma lista de links com o nome do tipo.
- **Campos do cadastro** — `#txtNumero`, `#txtDescricao`, `#txaObservacoes`,
  `input[name="rdoNivelAcesso"]`, dentro de `#frmDocumentoCadastro`.
- **Conteúdo do documento** — injetado na etapa 2, quando o editor abrir (ver
  "Por que em duas etapas" acima). Confirmado no teste real de 2026-08-10: o
  editor não existe na tela de cadastro.

## Licenciamento

Código escrito do zero, sem copiar trechos do SEI Pro (AGPL-3.0) — usa apenas
os IDs de campo do formulário nativo do SEI, que não são propriedade do SEI
Pro. Se algum dia reaproveitar código deles, a AGPL exigiria abrir o código
desta extensão também.

## Próximos passos sugeridos

- Enviar Notas de Empenho e Recibos (o `MAPA_TIPO_DOCUMENTO` já prevê os dois;
  falta o botão no app e o HTML do documento).
- Upload de arquivo (documento externo) em vez de HTML, para SOFs que já saem
  como PDF.
- Guardar no `chrome.storage.local` o último processo SEI usado por SOF.
