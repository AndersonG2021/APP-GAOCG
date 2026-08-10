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
navegador que já está autenticada no SEI.

## Como instalar localmente (modo desenvolvedor)

1. Abra `chrome://extensions`.
2. Ative "Modo do desenvolvedor" (canto superior direito).
3. Clique "Carregar sem compactação" e selecione esta pasta.
4. Copie o **ID da extensão** gerado (aparece no card da extensão) — você vai
   precisar dele no GAOCG.
5. Em `manifest.json`, troque `"https://SEU-USUARIO.github.io/*"` pelo domínio
   real onde o GAOCG está hospedado, e recarregue a extensão.

## Como chamar a partir do GAOCG

No frontend do GAOCG (vanilla JS), com o ID da extensão copiado acima:

```javascript
const EXTENSION_ID = " jcnnmppmgkakilloogidgocfmiibggfk";

function enviarSofParaSei(sof) {
  if (!window.chrome?.runtime?.sendMessage) {
    alert("Instale a extensão GAOCG SEI Bridge para usar este recurso.");
    return;
  }

  chrome.runtime.sendMessage(
    EXTENSION_ID,
    {
      type: "ENVIAR_DOCUMENTO",
      numeroProcesso: sof.numeroProcessoSei, // opcional, ajuda a achar a aba certa
      documento: {
        tipo: "sof",
        numero: `SOF ${sof.numero}/${sof.ano}`,
        descricaoEspecificacao: sof.descricao,
        observacoes: sof.observacoes ?? "",
        nivelAcesso: "publico",
        conteudoHtml: montarHtmlDaSof(sof), // função sua que gera o HTML do documento
        autoEnviar: false // deixe false até validar bem o fluxo
      }
    },
    (resposta) => {
      if (!resposta?.ok) {
        alert("Não consegui enviar ao SEI: " + (resposta?.erro ?? "erro desconhecido"));
        return;
      }
      if (resposta.revisarManualmente) {
        alert("Dados preenchidos no SEI — confira a aba do SEI e confirme o envio.");
      }
    }
  );
}
```

## Antes de usar em produção

- **Confirme os seletores do SEI no seu ambiente** (`#selSerie`, `#frmDocumentoCadastro`,
  o botão "Incluir Documento" na árvore). São os IDs nativos do SEI 4.x/5.x,
  mas o SEI Pro trata variações entre versões — vale testar no seu SEI real
  antes de confiar no fluxo.
- Ajuste `MAPA_TIPO_DOCUMENTO` em `content-sei.js` com os nomes exatos dos
  tipos de documento (SOF, Nota de Empenho, Recibo) cadastrados no SEI da
  sua unidade — o texto precisa bater com a opção do dropdown.
- Mantenha `autoEnviar: false` até ter certeza de que o preenchimento está
  100% correto — é mais seguro revisar manualmente antes de confirmar um
  documento num processo oficial.
- **Licenciamento**: este código foi escrito do zero, sem copiar trechos do
  SEI Pro (que é AGPL-3.0) — apenas usa os mesmos IDs de campo do formulário
  nativo do SEI, que não são propriedade do SEI Pro. Se decidir reaproveitar
  trechos de código deles, lembre que a AGPL exigiria abrir o código da sua
  extensão também.

## Próximos passos sugeridos

- Adicionar upload de arquivo (documento externo) em vez de HTML puro, via
  `<input type="file">` acionado pela extensão, para SOFs que já saem como PDF.
- Guardar no `chrome.storage.local` o último processo SEI usado por SOF, para
  autocompletar `numeroProcesso` da próxima vez.
