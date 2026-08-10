/**
 * GAOCG SEI Bridge — background.js
 *
 * Recebe mensagens externas do app GAOCG (via chrome.runtime.sendMessage
 * com o ID desta extensão) e repassa para a aba do SEI que estiver com o
 * processo certo aberto, acionando o content script (content-sei.js).
 *
 * Formato esperado da mensagem vinda do GAOCG:
 * {
 *   type: "ENVIAR_DOCUMENTO",
 *   numeroProcesso: "00000.000000/2026-00",   // opcional, ajuda a achar a aba certa
 *   documento: {
 *     tipo: "sof",                             // "sof" | "nota_empenho" | "recibo"
 *     numero: "SOF 123/2026",                  // vira o "Número/Nome na árvore"
 *     descricaoEspecificacao: "SOF referente a ...",
 *     observacoes: "",
 *     nivelAcesso: "publico",                  // "publico" | "restrito" | "sigiloso"
 *     conteudoHtml: "<p>...</p>",              // corpo do documento (HTML simples)
 *     autoEnviar: false                        // true = já clica em "Confirmar Dados"
 *   }
 * }
 */

const SEI_TAB_URL_PATTERNS = [
  "*://*.br/*controlador.php?acao=procedimento_trabalhar*",
  "*://*.br/*/controlador.php?acao=procedimento_trabalhar*",
  "*://*.org/*controlador.php?acao=procedimento_trabalhar*"
];

async function findMelhorAbaSei(numeroProcesso) {
  const tabs = await chrome.tabs.query({ url: SEI_TAB_URL_PATTERNS });
  if (tabs.length === 0) return null;
  if (numeroProcesso) {
    const match = tabs.find(t => (t.title || "").includes(numeroProcesso));
    if (match) return match;
  }
  // fallback: aba do SEI acessada/focada mais recentemente
  return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || message.type !== "ENVIAR_DOCUMENTO") {
        sendResponse({ ok: false, erro: "Tipo de mensagem não suportado." });
        return;
      }

      const aba = await findMelhorAbaSei(message.numeroProcesso);
      if (!aba) {
        sendResponse({
          ok: false,
          erro: "Nenhuma aba do SEI com um processo aberto foi encontrada. Abra o processo no SEI antes de enviar."
        });
        return;
      }

      const resposta = await chrome.tabs.sendMessage(aba.id, {
        type: "PREENCHER_DOCUMENTO",
        documento: message.documento
      });

      await chrome.tabs.update(aba.id, { active: true });
      sendResponse(resposta);
    } catch (erro) {
      sendResponse({ ok: false, erro: String(erro) });
    }
  })();
  return true; // mantém o canal aberto para a resposta assíncrona
});
