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
3. A extensão traz a aba do SEI para a frente, abre "Incluir Documento",
   escolhe o tipo, preenche os campos e injeta o conteúdo.
4. **Você revisa e clica em "Confirmar Dados"** — a extensão nunca confirma
   sozinha (`autoEnviar` fica sempre `false` no app).

O processo de destino é encontrado pelo número SEI da própria SOF (campo
`sei`), comparado com o título/URL das abas abertas no `sei.pe.gov.br`.

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
- **Conteúdo do documento** — no SEI, o editor de texto normalmente só abre
  DEPOIS de "Confirmar Dados". Quando isso acontece, a extensão preenche o
  cadastro e avisa que o corpo precisa ser colado no editor que abrir; ela não
  falha por causa disso.

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
