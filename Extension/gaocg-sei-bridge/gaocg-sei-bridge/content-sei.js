/**
 * GAOCG SEI Bridge — content-sei.js
 *
 * Roda dentro da página "procedimento_trabalhar" do SEI (o processo aberto).
 * Recebe do background.js os dados do documento vindos do GAOCG e preenche
 * o formulário NATIVO de inclusão de documento do próprio SEI — o mesmo
 * formulário que você preencheria manualmente. Não existe API do SEI aqui:
 * é automação de DOM sobre a sessão já autenticada do usuário.
 *
 * ATENÇÃO — selectors a confirmar no seu ambiente:
 * Os IDs abaixo (#frmDocumentoCadastro, #txtNumero, #selSerie, etc.) são os
 * mesmos usados pelo SEI 4.x/5.x nativo (confirmados no código do SEI Pro).
 * Ainda assim, vale abrir o DevTools no seu SEI e conferir antes de usar em
 * produção — pequenas variações de versão/customização por órgão acontecem.
 */

// Mapeie aqui o "tipo" que o GAOCG envia para o texto exato do tipo de
// documento cadastrado no SEI da sua unidade (aparece no dropdown "Série").
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PREENCHER_DOCUMENTO") return false;
  preencherDocumento(message.documento)
    .then(resultado => sendResponse(resultado))
    .catch(erro => sendResponse({ ok: false, erro: String(erro) }));
  return true; // resposta assíncrona
});

async function preencherDocumento(documento) {
  await abrirIncluirDocumento();
  const frame = await aguardarFrameVisualizacao();

  await selecionarTipoDocumento(frame, documento.tipo);
  const form = await aguardarSeletor(frame, "#frmDocumentoCadastro", 8000);

  if (frame.find("#txtNumero").length && documento.numero) {
    frame.find("#txtNumero").val(documento.numero);
  }
  if (frame.find("#txaObservacoes").length && documento.observacoes) {
    frame.find("#txaObservacoes").val(documento.observacoes);
  }
  if (frame.find("#txtDescricao").length && documento.descricaoEspecificacao) {
    frame.find("#txtDescricao").val(documento.descricaoEspecificacao);
  }

  const nivel = MAPA_NIVEL_ACESSO[documento.nivelAcesso] ?? "0";
  const radioNivel = frame.find(`input[name="rdoNivelAcesso"][value="${nivel}"]`);
  if (radioNivel.length) radioNivel.trigger("click");

  if (documento.conteudoHtml) {
    inserirConteudoEditor(frame, documento.conteudoHtml);
  }

  if (documento.autoEnviar) {
    const botaoConfirmar = frame.find('#sbmSalvar, button[value="Confirmar Dados"], input[value="Confirmar Dados"]');
    if (botaoConfirmar.length) botaoConfirmar.trigger("click");
    return { ok: true, enviado: true };
  }

  // Comportamento padrão: deixa preenchido para o usuário revisar e
  // confirmar manualmente — mais seguro para um sistema de processos oficial.
  return { ok: true, enviado: false, revisarManualmente: true };
}

/** Clica no ícone "Incluir Documento" da árvore do processo. */
async function abrirIncluirDocumento() {
  const botao = document.querySelector('a[title="Incluir Documento"], img[title="Incluir Documento"]');
  if (botao) {
    botao.click();
    return;
  }
  // Fallback: alguns temas colocam a ação num menu de contexto/toolbar da árvore.
  throw new Error('Não encontrei o botão "Incluir Documento" na árvore. Verifique se o processo está com a árvore visível.');
}

/** Localiza o jQuery do iframe de visualização (considera o aninhamento do SEI 5). */
async function aguardarFrameVisualizacao() {
  await aguardarCondicao(() => window.jQuery && document.querySelector("#ifrVisualizacao"));
  const $ = window.jQuery;
  const nested = $("#ifrVisualizacao").contents().find("#ifrVisualizacao");
  return nested.length ? nested.contents() : $("#ifrVisualizacao").contents();
}

/** Seleciona o tipo/série do documento no dropdown (geralmente componente "chosen"). */
async function selecionarTipoDocumento(frame, tipo) {
  const textoAlvo = MAPA_TIPO_DOCUMENTO[tipo];
  if (!textoAlvo) throw new Error(`Tipo de documento "${tipo}" não mapeado em MAPA_TIPO_DOCUMENTO.`);

  await aguardarSeletorEmFrame(frame, "#selSerie", 8000);
  const select = frame.find("#selSerie");
  const opcao = select.find("option").filter(function () {
    return window.jQuery(this).text().trim().toLowerCase() === textoAlvo.toLowerCase();
  });
  if (!opcao.length) {
    throw new Error(`Não encontrei a opção "${textoAlvo}" no dropdown de tipo de documento.`);
  }
  select.val(opcao.val()).trigger("change").trigger("chosen:updated");
}

/** Injeta HTML no corpo do editor de texto (CKEditor) do documento. */
function inserirConteudoEditor(frame, html) {
  const ifrEditor = frame.find('iframe[title="Rich Text Editor"], iframe.cke_wysiwyg_frame');
  if (!ifrEditor.length) return;
  const body = ifrEditor.contents().find("body");
  if (body.length) body.html(html);
}

function aguardarSeletorEmFrame(frame, seletor, timeoutMs) {
  return aguardarCondicao(() => frame.find(seletor).length > 0, timeoutMs).then(() => frame);
}

function aguardarSeletor(frame, seletor, timeoutMs) {
  return aguardarSeletorEmFrame(frame, seletor, timeoutMs);
}

function aguardarCondicao(condicao, timeoutMs = 8000, intervaloMs = 150) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const tick = () => {
      if (condicao()) return resolve(true);
      if (Date.now() - inicio > timeoutMs) return reject(new Error("Tempo esgotado aguardando elemento no SEI."));
      setTimeout(tick, intervaloMs);
    };
    tick();
  });
}
