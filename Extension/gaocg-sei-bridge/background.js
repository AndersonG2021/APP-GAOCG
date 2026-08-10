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

// A checagem de "é a página do processo" passou a ser feita no content script
// (conferirProcesso_ -> ehPaginaDeProcesso), que enxerga a URL real de cada aba.

/**
 * Localiza a aba que está com EXATAMENTE o processo informado aberto.
 *
 * Mudança de segurança (2026-08-10, pedido do usuário): antes havia um fallback
 * para "qualquer aba do SEI aberta" quando o número não batia. Isso significa
 * que, com o processo errado em foco, o documento seria criado NO PROCESSO
 * ERRADO - dentro de um sistema de processos oficial, sem nenhum aviso. Agora,
 * não achou o número exato, não faz nada: devolve erro e pede para abrir o
 * processo certo.
 *
 * A conferência é feita perguntando ao content script de cada aba quais números
 * de processo ela EXIBE, e não olhando a URL: a URL do `procedimento_trabalhar`
 * traz `id_procedimento`, um id interno do banco, que não tem relação com o
 * número que o analista digitou na SOF.
 */
async function acharAbaDoProcesso_(numeroProcesso) {
  const tabs = await chrome.tabs.query({ url: SEI_TAB_URL_PATTERN });
  if (!tabs.length) return { aba: null, motivo: "sem_abas" };

  const porRecente = lista => lista.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const candidatas = [];

  for (const aba of porRecente(tabs)) {
    let resposta = null;
    try {
      resposta = await enviarParaAba(aba.id, { type: "CONFERIR_PROCESSO", numero: numeroProcesso });
    } catch (e) {
      continue; // aba do SEI sem content script utilizável - ignora
    }
    if (resposta && resposta.tem) candidatas.push({ aba: aba, ehPaginaDeProcesso: !!resposta.ehPaginaDeProcesso });
  }

  if (!candidatas.length) return { aba: null, motivo: "processo_nao_aberto" };
  // Prefere a aba que está de fato com a árvore do processo aberta - só nela o
  // botão "Incluir Documento" existe.
  const comArvore = candidatas.find(c => c.ehPaginaDeProcesso);
  return { aba: (comArvore || candidatas[0]).aba, motivo: "ok" };
}

/**
 * Processo não está aberto: guarda o envio INTEIRO (documento + número) e abre
 * uma aba nova no SEI já pesquisando o processo.
 *
 * O envio guardado é o que permite a extensão **retomar sozinha** assim que o
 * analista abrir o processo certo (ver retomarEnvioPendente_ em
 * content-sei.js) - antes era preciso voltar ao GAOCG e clicar em enviar de
 * novo, um passo a mais sem necessidade, já que a intenção foi declarada no
 * primeiro clique.
 *
 * Aba NOVA de propósito: não mexe no que o analista já tem aberto.
 */
async function agendarEnvioEAbrirPesquisa_(numeroProcesso, documento) {
  try {
    await chrome.storage.local.set({
      envioPendente: { numeroProcesso: numeroProcesso, documento: documento, criadoEm: Date.now() },
      processoParaAbrir: { numero: numeroProcesso, criadoEm: Date.now() }
    });
    await chrome.tabs.create({ url: "https://sei.pe.gov.br/", active: true });
    return true;
  } catch (e) {
    return false;
  }
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

/**
 * Roda DENTRO da página (main world), não no content script. Recebe só o `html`
 * por `args` - não pode fechar sobre nenhuma variável daqui, porque a função é
 * serializada para ser executada no outro contexto.
 *
 * ===== Por que escolher UMA instância, e não todas =====
 *
 * Um documento do SEI é dividido em seções pré-definidas - cabeçalho,
 * principal, rodapé e assinatura (documentação oficial do SEI) - e cada uma é
 * uma instância separada do CKEditor. Só a "principal" aceita edição; as outras
 * ficam travadas (read-only).
 *
 * Bug real (4º teste, 2026-08-10): a v0.5.x chamava setData em TODAS as
 * instâncias, ou seja, escrevia o documento inteiro por cima do cabeçalho e do
 * rodapé também. O usuário viu as três áreas e só a do meio editável.
 *
 * Critério de escolha, nesta ordem:
 *   1. descarta as read-only (é o discriminador confiável - o próprio SEI trava
 *      cabeçalho/rodapé);
 *   2. entre as restantes, prefere uma cujo nome remeta ao corpo do documento;
 *   3. empatando, a de maior altura visível (o corpo é sempre a maior).
 *
 * Também loga as instâncias encontradas no console DA PÁGINA DO SEI - é onde o
 * usuário consegue ver os nomes reais e me reportar, caso a heurística erre.
 */
function aplicarViaCkeditor_(html) {
  try {
    const CK = window.CKEDITOR;
    if (!CK || !CK.instances) return { ok: false, motivo: "CKEDITOR não encontrado nesta página" };

    const info = Object.keys(CK.instances).map(nome => {
      const instancia = CK.instances[nome];
      let altura = 0;
      try {
        if (instancia.ui && instancia.ui.contentsElement && instancia.ui.contentsElement.$) {
          altura = instancia.ui.contentsElement.$.offsetHeight || 0;
        }
      } catch (e) { /* instância ainda montando */ }
      return { nome: nome, readOnly: !!instancia.readOnly, altura: altura };
    });
    console.log("[GAOCG SEI Bridge] instâncias CKEditor nesta página:", info);
    if (!info.length) return { ok: false, motivo: "nenhuma instância de CKEditor" };

    const editaveis = info.filter(i => !i.readOnly);
    const candidatas = editaveis.length ? editaveis : info;
    const escolhida =
      candidatas.find(i => /principal|conteudo|conteúdo|corpo|texto/i.test(i.nome)) ||
      candidatas.slice().sort((a, b) => b.altura - a.altura)[0];

    const instancia = CK.instances[escolhida.nome];
    if (!instancia || typeof instancia.setData !== "function") {
      return { ok: false, motivo: "instância sem setData" };
    }
    instancia.setData(html);
    console.log("[GAOCG SEI Bridge] conteúdo aplicado na instância:", escolhida.nome);
    return { ok: true, escolhida: escolhida.nome, candidatas: info };
  } catch (e) {
    return { ok: false, motivo: String(e && e.message ? e.message : e) };
  }
}

/**
 * Mensagem INTERNA (do content script). O content script roda em contexto
 * isolado e não enxerga `window.CKEDITOR`; só a API `chrome.scripting` com
 * `world: "MAIN"` alcança o objeto real da página. `allFrames: true` porque o
 * editor do SEI costuma estar num iframe - a função devolve false nos frames
 * que não têm CKEditor, e basta um dar certo.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "INJETAR_CKEDITOR") return false;
  (async () => {
    try {
      if (!sender.tab || sender.tab.id === undefined) {
        sendResponse({ ok: false, erro: "Remetente sem aba." });
        return;
      }
      const resultados = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, allFrames: true },
        world: "MAIN",
        func: aplicarViaCkeditor_,
        args: [message.html]
      });
      // Só o frame que hospeda o editor tem CKEDITOR; os demais devolvem
      // ok:false. Basta um ter dado certo.
      const sucesso = resultados.map(r => r && r.result).filter(r => r && r.ok)[0];
      sendResponse(sucesso
        ? { ok: true, escolhida: sucesso.escolhida }
        : { ok: false, erro: "Nenhum frame aplicou o conteúdo pela API do CKEditor." });
    } catch (erro) {
      sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
    }
  })();
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || message.type !== "ENVIAR_DOCUMENTO") {
        sendResponse({ ok: false, erro: "Tipo de mensagem não suportado." });
        return;
      }

      const numero = message.numeroProcesso;
      if (!numero) {
        sendResponse({ ok: false, erro: "Número do processo SEI não informado pelo GAOCG." });
        return;
      }

      const busca = await acharAbaDoProcesso_(numero);
      if (!busca.aba) {
        // Nenhuma aba com ESTE processo: guarda o envio, abre a pesquisa numa
        // aba nova e a extensão retoma sozinha quando o processo abrir. Nunca
        // cai para "qualquer aba do SEI" - ver acharAbaDoProcesso_.
        const agendou = await agendarEnvioEAbrirPesquisa_(numero, message.documento);
        sendResponse({
          ok: false,
          processoNaoAberto: true,
          envioAgendado: agendou,
          erro: agendou
            ? "O processo " + numero + " não estava aberto. Abri a pesquisa dele no SEI - é só abrir o processo que o documento é criado automaticamente."
            : "O processo " + numero + " não está aberto em nenhuma aba do SEI. Abra o processo e tente de novo."
        });
        return;
      }
      const aba = busca.aba;

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
