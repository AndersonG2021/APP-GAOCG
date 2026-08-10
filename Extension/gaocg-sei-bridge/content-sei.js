/**
 * GAOCG SEI Bridge — content-sei.js
 *
 * Roda dentro do SEI (sei.pe.gov.br). Recebe do background.js os dados do
 * documento vindos do GAOCG e preenche o formulário NATIVO de inclusão de
 * documento do próprio SEI — o mesmo que você preencheria à mão. Não existe API
 * do SEI aqui: é automação de DOM sobre a sessão já autenticada do usuário.
 *
 * Duas correções importantes em relação à primeira versão (0.1.0):
 *
 * 1. A busca de elementos agora varre o documento do topo E todos os iframes de
 *    mesma origem. A versão anterior procurava o botão "Incluir Documento" só
 *    em `document` (topo), mas no SEI a barra de ações do processo fica dentro
 *    do iframe `ifrVisualizacao` - ou seja, nunca encontrava e sempre caía no
 *    erro "não encontrei o botão".
 * 2. Não depende mais de `window.jQuery` do topo. Usa DOM puro e só aproveita o
 *    jQuery DA PRÓPRIA JANELA do elemento quando ele existe, que é o necessário
 *    para o componente "chosen" do dropdown de tipo de documento reagir.
 */

// Mapeie aqui o "tipo" que o GAOCG envia para o texto EXATO do tipo de
// documento cadastrado no SEI da sua unidade (o que aparece na lista "Escolha o
// Tipo do Documento"). Se o texto não bater, a extensão devolve erro em vez de
// escolher o tipo errado.
const MAPA_TIPO_DOCUMENTO = {
  sof: "SOF",
  nota_empenho: "Nota de Empenho",
  recibo: "Recibo"
};

const MAPA_NIVEL_ACESSO = {
  publico: "0",
  restrito: "1",
  sigiloso: "2"
};

// Só o documento do topo responde. Com `all_frames`, cada frame registraria seu
// próprio listener e vários responderiam à mesma mensagem - o primeiro
// sendResponse vence e os outros viram erro silencioso. O topo é quem enxerga
// todos os iframes de mesma origem, então é o único que precisa responder.
if (window.top === window) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "PREENCHER_DOCUMENTO") return false;
    preencherDocumento(message.documento)
      .then(resultado => sendResponse(resultado))
      .catch(erro => sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) }));
    return true; // resposta assíncrona
  });
}

/* ===================== varredura de frames ===================== */

/** Documento do topo + todos os iframes de mesma origem (recursivo). */
function documentosDisponiveis_(doc) {
  doc = doc || document;
  const lista = [doc];
  for (const frame of Array.from(doc.querySelectorAll("iframe, frame"))) {
    let interno = null;
    try {
      interno = frame.contentDocument; // cross-origin lança ou devolve null
    } catch (e) {
      interno = null;
    }
    if (interno) lista.push(...documentosDisponiveis_(interno));
  }
  return lista;
}

/** Primeiro elemento que casar com o seletor em qualquer documento acessível. */
function acharEm_(seletor) {
  for (const doc of documentosDisponiveis_()) {
    const el = doc.querySelector(seletor);
    if (el) return el;
  }
  return null;
}

/** Todos os elementos que casam com o seletor, em todos os documentos acessíveis. */
function acharTodos_(seletor) {
  const encontrados = [];
  for (const doc of documentosDisponiveis_()) {
    encontrados.push(...Array.from(doc.querySelectorAll(seletor)));
  }
  return encontrados;
}

function aguardarCondicao_(condicao, timeoutMs = 10000, intervaloMs = 150) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const tick = () => {
      let valor = null;
      try {
        valor = condicao();
      } catch (e) {
        valor = null; // frame ainda navegando - tenta de novo
      }
      if (valor) return resolve(valor);
      if (Date.now() - inicio > timeoutMs) return reject(new Error("Tempo esgotado aguardando um elemento do SEI."));
      setTimeout(tick, intervaloMs);
    };
    tick();
  });
}

const aguardarElemento_ = (seletor, timeoutMs) => aguardarCondicao_(() => acharEm_(seletor), timeoutMs);

/** jQuery da janela do PRÓPRIO elemento (o "chosen" do SEI é jQuery). */
function jqueryDoElemento_(el) {
  try {
    const win = el.ownerDocument.defaultView;
    return win && win.jQuery ? win.jQuery : null;
  } catch (e) {
    return null;
  }
}

/** Dispara change de um jeito que funcione com e sem jQuery/chosen. */
function dispararChange_(el) {
  const $ = jqueryDoElemento_(el);
  if ($) {
    $(el).trigger("change").trigger("chosen:updated");
    return;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ===================== fluxo principal ===================== */

async function preencherDocumento(documento) {
  if (!location.href.includes("procedimento_trabalhar")) {
    throw new Error("Esta aba do SEI não está com um processo aberto. Abra o processo e tente de novo.");
  }
  const textoTipo = MAPA_TIPO_DOCUMENTO[documento.tipo];
  if (!textoTipo) {
    throw new Error(`Tipo de documento "${documento.tipo}" não mapeado em MAPA_TIPO_DOCUMENTO (content-sei.js).`);
  }

  await abrirIncluirDocumento();
  await escolherTipoDocumento(textoTipo);

  const form = await aguardarElemento_("#frmDocumentoCadastro", 12000);
  const doc = form.ownerDocument;

  preencherCampo_(doc, "#txtNumero", documento.numero);
  preencherCampo_(doc, "#txtDescricao", documento.descricaoEspecificacao);
  preencherCampo_(doc, "#txaObservacoes", documento.observacoes);

  const nivel = MAPA_NIVEL_ACESSO[documento.nivelAcesso] || "0";
  const radio = doc.querySelector(`input[name="rdoNivelAcesso"][value="${nivel}"]`);
  if (radio) {
    radio.checked = true;
    dispararChange_(radio);
  }

  if (documento.autoEnviar) {
    const botao = doc.querySelector('#sbmSalvar, button[value="Confirmar Dados"], input[value="Confirmar Dados"]');
    if (!botao) throw new Error('Formulário preenchido, mas não encontrei o botão "Confirmar Dados" para enviar automaticamente.');
    botao.click();
    // O conteúdo do corpo do documento só é editável no editor que abre DEPOIS
    // de confirmar os dados - ver comentário em inserirConteudoEditor_.
    return { ok: true, enviado: true, conteudoPendente: !!documento.conteudoHtml };
  }

  const inseriu = documento.conteudoHtml ? inserirConteudoEditor_(documento.conteudoHtml) : false;

  // Padrão: deixa preenchido para o usuário revisar e confirmar manualmente -
  // mais seguro num sistema de processos oficial.
  return { ok: true, enviado: false, revisarManualmente: true, conteudoInserido: inseriu };
}

/** Clica no ícone "Incluir Documento" da barra de ações do processo. */
async function abrirIncluirDocumento() {
  const seletor = [
    'a[title="Incluir Documento"]',
    'img[title="Incluir Documento"]',
    'a[href*="documento_escolher_tipo"]'
  ].join(", ");

  const alvo = await aguardarCondicao_(() => acharEm_(seletor), 8000).catch(() => null);
  if (!alvo) {
    throw new Error('Não encontrei o botão "Incluir Documento" no processo. Confirme que o processo está aberto e que você tem permissão para incluir documentos nele.');
  }
  // Em alguns temas o title fica na <img> dentro do <a> - clicar no <a> é o
  // que de fato navega.
  (alvo.closest("a") || alvo).click();
}

/**
 * Escolhe o tipo/série do documento. O SEI varia entre versões: algumas telas
 * usam um <select id="selSerie"> (com o componente "chosen"), outras listam os
 * tipos como links numa tabela filtrável. Os dois caminhos são suportados.
 */
async function escolherTipoDocumento(textoTipo) {
  const alvo = textoTipo.trim().toLowerCase();

  const encontrado = await aguardarCondicao_(() => {
    const select = acharEm_("#selSerie");
    if (select) {
      const opcao = Array.from(select.options).find(o => o.textContent.trim().toLowerCase() === alvo);
      if (opcao) return { tipo: "select", select, opcao };
    }
    const link = acharTodos_("a").find(a => a.textContent.trim().toLowerCase() === alvo);
    if (link) return { tipo: "link", link };
    return null;
  }, 10000).catch(() => null);

  if (!encontrado) {
    throw new Error(`Não encontrei o tipo de documento "${textoTipo}" no SEI. Confira se esse tipo existe na sua unidade e se o texto em MAPA_TIPO_DOCUMENTO (content-sei.js) está idêntico ao do SEI.`);
  }

  if (encontrado.tipo === "link") {
    encontrado.link.click();
    return;
  }
  encontrado.select.value = encontrado.opcao.value;
  dispararChange_(encontrado.select);
}

function preencherCampo_(doc, seletor, valor) {
  if (valor === undefined || valor === null || valor === "") return false;
  const campo = doc.querySelector(seletor);
  if (!campo) return false;
  campo.value = valor;
  dispararChange_(campo);
  return true;
}

/**
 * Injeta o HTML no corpo do editor (CKEditor) do documento.
 *
 * Importante: no fluxo real do SEI, o editor de conteúdo só abre DEPOIS de
 * "Confirmar Dados" - na tela de cadastro ele normalmente ainda não existe.
 * Por isso esta função é best-effort e devolve false em vez de dar erro: o
 * cadastro em si (tipo, número, descrição, nível de acesso) já foi preenchido,
 * e o app avisa o usuário que o corpo precisa ser colado no editor que abrir.
 */
function inserirConteudoEditor_(html) {
  const iframeEditor = acharEm_('iframe.cke_wysiwyg_frame, iframe[title="Rich Text Editor"]');
  if (!iframeEditor) return false;
  let corpo = null;
  try {
    corpo = iframeEditor.contentDocument && iframeEditor.contentDocument.body;
  } catch (e) {
    return false;
  }
  if (!corpo) return false;
  corpo.innerHTML = html;
  return true;
}
