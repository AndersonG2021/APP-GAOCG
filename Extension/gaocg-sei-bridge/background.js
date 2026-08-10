/**
 * GAOCG SEI Bridge — background.js
 *
 * Recebe mensagens externas do app GAOCG (via chrome.runtime.sendMessage com o
 * ID desta extensão) e repassa para a aba do SEI que estiver com o processo
 * certo aberto, acionando o content script (content-sei.js).
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

/**
 * Host único do SEI (SES-PE). Antes eram padrões abertos (`*://*.br/*...`), que
 * davam à extensão acesso a praticamente qualquer site .br - permissão muito
 * além do necessário. Precisa bater com `host_permissions` e `content_scripts`
 * do manifest.json.
 */
const SEI_TAB_URL_PATTERN = "https://sei.pe.gov.br/*";

/** Página do processo aberto ("árvore" do processo), onde o content script sabe operar. */
const SEI_PAGINA_PROCESSO = "procedimento_trabalhar";

/**
 * Escolhe a aba do SEI mais provável, em ordem de preferência:
 *   1. aba com o processo aberto E o número informado no título/URL;
 *   2. qualquer aba com um processo aberto (mais recente primeiro);
 *   3. qualquer aba do SEI (mais recente primeiro) - o content script devolve
 *      um erro claro se não for uma página de processo.
 */
async function findMelhorAbaSei(numeroProcesso) {
  const tabs = await chrome.tabs.query({ url: SEI_TAB_URL_PATTERN });
  if (!tabs.length) return null;

  const porRecente = lista => lista.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const comProcesso = tabs.filter(t => (t.url || "").includes(SEI_PAGINA_PROCESSO));

  if (numeroProcesso) {
    const alvo = String(numeroProcesso).trim();
    const casaNumero = t => (t.title || "").includes(alvo) || decodeURIComponent(t.url || "").includes(alvo);
    const exato = porRecente(comProcesso).find(casaNumero) || porRecente(tabs).find(casaNumero);
    if (exato) return exato;
  }

  return porRecente(comProcesso)[0] || porRecente(tabs)[0];
}

/**
 * Manda a mensagem para o content script da aba. Se a aba do SEI já estava
 * aberta ANTES da extensão ser instalada/recarregada, o content script não foi
 * injetado nela e o sendMessage falha com "Could not establish connection" -
 * caso muito comum na prática. Nesse cenário, injeta o script sob demanda
 * (permissão `scripting`) e tenta de novo, em vez de mandar o usuário recarregar
 * a aba do SEI na mão.
 */
async function enviarParaAba(abaId, payload) {
  try {
    return await chrome.tabs.sendMessage(abaId, payload);
  } catch (erro) {
    if (!String(erro).includes("Could not establish connection")) throw erro;
    await chrome.scripting.executeScript({
      target: { tabId: abaId },
      files: ["content-sei.js"]
    });
    return await chrome.tabs.sendMessage(abaId, payload);
  }
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
          erro: "Nenhuma aba do SEI encontrada. Abra o processo no SEI (sei.pe.gov.br) antes de enviar."
        });
        return;
      }

      // Traz a aba do SEI para a frente ANTES de preencher: o usuário vê o
      // formulário sendo montado e já fica na tela onde precisa revisar. Se o
      // preenchimento falhar no meio, ele está olhando exatamente onde parou.
      await chrome.tabs.update(aba.id, { active: true });
      try { await chrome.windows.update(aba.windowId, { focused: true }); } catch (e) { /* janela pode ter sumido */ }

      const resposta = await enviarParaAba(aba.id, {
        type: "PREENCHER_DOCUMENTO",
        documento: message.documento
      });
      sendResponse(resposta);
    } catch (erro) {
      sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
    }
  })();
  return true; // mantém o canal aberto para a resposta assíncrona
});
