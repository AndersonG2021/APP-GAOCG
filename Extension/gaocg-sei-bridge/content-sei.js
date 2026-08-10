/**
 * GAOCG SEI Bridge — content-sei.js
 *
 * Roda dentro do SEI (sei.pe.gov.br). Automatiza o DOM do formulário nativo de
 * inclusão de documento, sobre a sessão já autenticada do usuário. Não existe
 * API do SEI aqui.
 *
 * ===== Como o fluxo do SEI realmente funciona (aprendido no 1º teste real) =====
 *
 * O editor de texto (CKEditor) do documento NÃO existe na tela de cadastro: o
 * SEI só o abre DEPOIS de "Confirmar Dados", e normalmente numa JANELA NOVA.
 * A versão 0.2.0 tentava injetar o conteúdo durante o cadastro e, como o editor
 * ainda não existia, o documento nascia vazio - foi exatamente o que aconteceu
 * no primeiro teste real (documento "ANEXO" criado sem conteúdo nenhum).
 *
 * Por isso o envio agora é dividido em duas etapas independentes:
 *
 *   Etapa 1 (best-effort): abre "Incluir Documento", tenta escolher o tipo e
 *            preencher o cadastro. Se qualquer parte falhar, NÃO aborta - o
 *            usuário termina na mão.
 *   Etapa 2 (a que importa): o HTML fica guardado em chrome.storage.local como
 *            "pendente". Toda página do SEI que carregar procura um editor; ao
 *            encontrar um editor VAZIO, injeta o conteúdo e limpa o pendente.
 *
 * Assim o conteúdo chega ao documento mesmo que o usuário escolha o tipo e
 * preencha o cadastro manualmente - que é o caso quando o tipo esperado não
 * existe na unidade.
 *
 * ===== Isolated world =====
 *
 * Content script roda num contexto JS isolado: ele compartilha o DOM com a
 * página, mas NÃO enxerga as variáveis dela (`window.jQuery`, `window.CKEDITOR`
 * etc. são sempre undefined aqui). A versão 0.2.0 tinha um helper que tentava
 * usar o jQuery da página - código morto que nunca rodava. Removido: eventos
 * nativos (`new Event('change', {bubbles:true})`) disparam normalmente os
 * handlers da página, inclusive os registrados via jQuery, então são
 * suficientes e não dependem de nada da página.
 */

/**
 * Tipos de documento a tentar no SEI, EM ORDEM, para cada tipo do GAOCG. O
 * texto precisa ser idêntico ao que aparece na lista "Escolha o Tipo do
 * Documento". A lista existe porque nem toda unidade tem um tipo próprio "SOF" -
 * caindo em "Anexo", que é o tipo genérico usado no primeiro teste real.
 * Se nenhum for encontrado, a extensão NÃO falha: deixa a tela de escolha
 * aberta para o usuário decidir, e o conteúdo entra depois pela Etapa 2.
 */
const MAPA_TIPO_DOCUMENTO = {
  sof: ["SOF", "Solicitação Orçamentária e Financeira", "Anexo"],
  nota_empenho: ["Nota de Empenho", "Anexo"],
  recibo: ["Recibo", "Anexo"]
};

const MAPA_NIVEL_ACESSO = { publico: "0", restrito: "1", sigiloso: "2" };

const CHAVE_PENDENTE_ = "documentoPendente";
/** Depois disso o pendente é descartado, pra não injetar num documento aberto muito tempo depois. */
const VALIDADE_PENDENTE_MS_ = 15 * 60 * 1000;

// Só o documento do topo age. Com todos os frames agindo, vários responderiam à
// mesma mensagem (o primeiro sendResponse vence) e o conteúdo seria injetado
// mais de uma vez.
if (window.top === window) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "PREENCHER_DOCUMENTO") return false;
    preencherDocumento(message.documento)
      .then(resultado => sendResponse(resultado))
      .catch(erro => sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) }));
    return true; // resposta assíncrona
  });

  // Etapa 2: vale para QUALQUER página do SEI, inclusive a janela do editor que
  // o SEI abre depois de "Confirmar Dados" - é ali que o conteúdo finalmente entra.
  vigiarEditorParaConteudoPendente_();
}

/* ===================== varredura de frames ===================== */

/** Documento do topo + todos os iframes de mesma origem (recursivo). */
function documentosDisponiveis_(doc) {
  doc = doc || document;
  const lista = [doc];
  for (const frame of Array.from(doc.querySelectorAll("iframe, frame"))) {
    let interno = null;
    try {
      interno = frame.contentDocument;
    } catch (e) {
      interno = null; // cross-origin
    }
    if (interno) lista.push(...documentosDisponiveis_(interno));
  }
  return lista;
}

function acharEm_(seletor) {
  for (const doc of documentosDisponiveis_()) {
    const el = doc.querySelector(seletor);
    if (el) return el;
  }
  return null;
}

function acharTodos_(seletor) {
  const encontrados = [];
  for (const doc of documentosDisponiveis_()) {
    encontrados.push(...Array.from(doc.querySelectorAll(seletor)));
  }
  return encontrados;
}

function aguardarCondicao_(condicao, timeoutMs = 10000, intervaloMs = 200) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const tick = () => {
      let valor = null;
      try {
        valor = condicao();
      } catch (e) {
        valor = null; // frame navegando
      }
      if (valor) return resolve(valor);
      if (Date.now() - inicio > timeoutMs) return resolve(null); // devolve null, nunca lança
      setTimeout(tick, intervaloMs);
    };
    tick();
  });
}

/**
 * Eventos nativos bastam: eles acionam tanto handlers inline (onchange="...")
 * quanto os registrados por addEventListener/jQuery da página. Ver comentário
 * sobre isolated world no topo do arquivo.
 */
function dispararChange_(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ===================== Etapa 1: cadastro (best-effort) ===================== */

async function preencherDocumento(documento) {
  if (!location.href.includes("procedimento_trabalhar")) {
    return { ok: false, erro: "Esta aba do SEI não está com um processo aberto. Abra o processo e tente de novo." };
  }

  // Guarda o conteúdo ANTES de qualquer automação: mesmo que tudo abaixo falhe
  // e o usuário faça o cadastro na mão, o conteúdo entra quando o editor abrir.
  const agendou = await agendarConteudo_(documento);

  const abriu = await abrirIncluirDocumento_();
  if (!abriu) {
    return {
      ok: true, conteudoAgendado: agendou, tipoSelecionado: false, cadastroPreenchido: false,
      aviso: 'Não encontrei o botão "Incluir Documento". Inclua o documento manualmente - o conteúdo será preenchido sozinho quando o editor abrir.'
    };
  }

  const tipoSelecionado = await escolherTipoDocumento_(documento.tipo);
  const form = await aguardarCondicao_(() => acharEm_("#frmDocumentoCadastro"), tipoSelecionado ? 12000 : 4000);

  let cadastroPreenchido = false;
  if (form) {
    const doc = form.ownerDocument;
    preencherCampo_(doc, "#txtNumero", documento.numero);
    preencherCampo_(doc, "#txtDescricao", documento.descricaoEspecificacao);
    preencherCampo_(doc, "#txaObservacoes", documento.observacoes);
    const radio = doc.querySelector(`input[name="rdoNivelAcesso"][value="${MAPA_NIVEL_ACESSO[documento.nivelAcesso] || "0"}"]`);
    if (radio) { radio.checked = true; dispararChange_(radio); }
    cadastroPreenchido = true;
  }

  return {
    ok: true,
    conteudoAgendado: agendou,
    tipoSelecionado,
    cadastroPreenchido,
    aviso: tipoSelecionado ? "" : "Não achei o tipo de documento esperado na sua unidade - escolha o tipo manualmente."
  };
}

async function abrirIncluirDocumento_() {
  const seletor = [
    'a[title="Incluir Documento"]',
    'img[title="Incluir Documento"]',
    'a[href*="documento_escolher_tipo"]'
  ].join(", ");
  const alvo = await aguardarCondicao_(() => acharEm_(seletor), 8000);
  if (!alvo) return false;
  (alvo.closest("a") || alvo).click();
  return true;
}

/**
 * Tenta cada nome de MAPA_TIPO_DOCUMENTO na ordem. Suporta os dois formatos que
 * o SEI usa entre versões: um <select id="selSerie"> ou uma lista de links.
 * Devolve false (sem lançar) quando nenhum nome bate - o usuário escolhe na mão.
 */
async function escolherTipoDocumento_(tipoGaocg) {
  const candidatos = MAPA_TIPO_DOCUMENTO[tipoGaocg] || [];
  if (!candidatos.length) return false;

  const achado = await aguardarCondicao_(() => {
    for (const nome of candidatos) {
      const alvo = nome.trim().toLowerCase();
      const select = acharEm_("#selSerie");
      if (select) {
        const opcao = Array.from(select.options).find(o => o.textContent.trim().toLowerCase() === alvo);
        if (opcao) return { tipo: "select", select, opcao };
      }
      const link = acharTodos_("a").find(a => a.textContent.trim().toLowerCase() === alvo);
      if (link) return { tipo: "link", link };
    }
    return null;
  }, 10000);

  if (!achado) return false;
  if (achado.tipo === "link") {
    achado.link.click();
    return true;
  }
  achado.select.value = achado.opcao.value;
  dispararChange_(achado.select);
  return true;
}

function preencherCampo_(doc, seletor, valor) {
  if (valor === undefined || valor === null || valor === "") return false;
  const campo = doc.querySelector(seletor);
  if (!campo) return false;
  campo.value = valor;
  dispararChange_(campo);
  return true;
}

/* ===================== Etapa 2: conteúdo pendente ===================== */

function agendarConteudo_(documento) {
  if (!documento || !documento.conteudoHtml) return Promise.resolve(false);
  return chrome.storage.local
    .set({
      [CHAVE_PENDENTE_]: {
        html: documento.conteudoHtml,
        rotulo: documento.numero || "",
        criadoEm: Date.now()
      }
    })
    .then(() => true)
    .catch(() => false);
}

async function lerConteudoPendente_() {
  try {
    const dados = await chrome.storage.local.get(CHAVE_PENDENTE_);
    const pendente = dados && dados[CHAVE_PENDENTE_];
    if (!pendente || !pendente.html) return null;
    if (Date.now() - (pendente.criadoEm || 0) > VALIDADE_PENDENTE_MS_) {
      await chrome.storage.local.remove(CHAVE_PENDENTE_);
      return null;
    }
    return pendente;
  } catch (e) {
    return null;
  }
}

/** Corpo editável do CKEditor, em qualquer frame acessível desta página. */
function corpoDoEditor_() {
  const iframe = acharEm_('iframe.cke_wysiwyg_frame, iframe[title="Rich Text Editor"]');
  if (iframe) {
    try {
      const corpo = iframe.contentDocument && iframe.contentDocument.body;
      if (corpo && corpo.isContentEditable !== false) return corpo;
    } catch (e) { /* cross-origin */ }
  }
  // CKEditor 5 / modo "div editável" (sem iframe).
  const editavel = acharEm_('.cke_editable[contenteditable="true"], div[contenteditable="true"].cke_editable');
  return editavel || null;
}

/**
 * Só injeta em editor VAZIO. Salvaguarda importante: o pendente vale por 15
 * minutos, e sem essa checagem abrir um documento JÁ EXISTENTE nesse intervalo
 * faria a extensão sobrescrever o conteúdo dele - destruindo trabalho num
 * sistema de processos oficial.
 */
function editorEstaVazio_(corpo) {
  if (!corpo) return false;
  if (corpo.querySelector("table, img, ul, ol")) return false;
  return corpo.textContent.replace(/ /g, " ").trim() === "";
}

async function vigiarEditorParaConteudoPendente_() {
  const pendente = await lerConteudoPendente_();
  if (!pendente) return;

  // O editor abre logo depois do carregamento da própria página do editor;
  // 45s cobrem uma rede lenta sem ficar vigiando indefinidamente.
  const corpo = await aguardarCondicao_(() => {
    const c = corpoDoEditor_();
    return c && editorEstaVazio_(c) ? c : null;
  }, 45000, 400);
  if (!corpo) return;

  corpo.innerHTML = pendente.html;
  // Avisa o CKEditor/página que o conteúdo mudou, pra ele não salvar vazio.
  corpo.dispatchEvent(new Event("input", { bubbles: true }));
  corpo.dispatchEvent(new Event("change", { bubbles: true }));

  await chrome.storage.local.remove(CHAVE_PENDENTE_).catch(() => {});
  avisarNaTela_("GAOCG: conteúdo da " + (pendente.rotulo || "SOF") + " inserido. Revise e salve o documento.");
}

/** Aviso discreto na própria página do SEI - o app GAOCG pode nem estar visível quando o editor abre. */
function avisarNaTela_(texto) {
  const aviso = document.createElement("div");
  aviso.textContent = texto;
  aviso.style.cssText = [
    "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
    "background:#1c7a37", "color:#fff", "padding:10px 14px", "border-radius:8px",
    "font:13px system-ui,sans-serif", "box-shadow:0 4px 12px rgba(0,0,0,.25)", "max-width:340px"
  ].join(";");
  document.body.appendChild(aviso);
  setTimeout(() => aviso.remove(), 8000);
}
