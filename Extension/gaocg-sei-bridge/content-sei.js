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
  sof: { filtro: "SOF", rotulos: ["SES - SOF - Solicitação Orçamentária e Financeira", "SOF - Solicitação Orçamentária e Financeira", "SOF"] },
  nota_empenho: { filtro: "Nota de Empenho", rotulos: ["Nota de Empenho"] },
  recibo: { filtro: "Recibo", rotulos: ["Recibo"] }
};

const MAPA_NIVEL_ACESSO = { publico: "0", restrito: "1", sigiloso: "2" };

const CHAVE_PENDENTE_ = "documentoPendente";
/** Depois disso o pendente é descartado, pra não injetar num documento aberto muito tempo depois. */
const VALIDADE_PENDENTE_MS_ = 15 * 60 * 1000;

/**
 * ATENÇÃO À ORDEM: esta declaração precisa vir ANTES do bloco `if (window.top
 * === window)` abaixo, que chama iniciarVigilancia_() na hora.
 *
 * Bug real da v0.5.0 ("Cannot access 'vigilanciaAtiva_' before initialization"):
 * a flag estava declarada mais abaixo no arquivo, junto de iniciarVigilancia_.
 * `function` é içada e pode ser chamada antes da sua posição no arquivo, mas
 * `let`/`const` ficam na Temporal Dead Zone até a linha da declaração executar -
 * então a chamada estourava e o content script inteiro morria antes de
 * registrar qualquer listener. Nada funcionava, nem a etapa 1.
 */
let vigilanciaAtiva_ = false;

/**
 * BUG CORRIGIDO (3º teste real, 2026-08-10): a vigilância era disparada UMA vez,
 * no carregamento da página. Na prática a sequência é:
 *
 *   1. página do processo carrega -> vigia roda, não há pendente ainda, encerra;
 *   2. usuário clica em "Enviar ao SEI" -> pendente é gravado;
 *   3. o SEI abre o cadastro e depois o editor DENTRO DE IFRAMES, sem recarregar
 *      o documento do topo -> o content script não roda de novo;
 *   4. ninguém mais procura o editor. Nenhuma barra aparecia.
 *
 * Agora a vigilância é (re)ligada em três momentos - carregamento, gravação do
 * pendente (storage.onChanged) e logo depois de agendar - e é idempotente, pra
 * os três gatilhos não criarem três laços concorrentes.
 *
 * A flag `vigilanciaAtiva_` é declarada lá em cima, junto das constantes - ver
 * o comentário sobre Temporal Dead Zone lá.
 */
function iniciarVigilancia_() {
  if (vigilanciaAtiva_) return;
  vigilanciaAtiva_ = true;
  vigiarEditorParaConteudoPendente_()
    .catch(() => {})
    .then(() => { vigilanciaAtiva_ = false; });
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

/**
 * Documento (topo ou iframe) que contém um texto - usado para ESCOPAR a busca
 * de campos a uma tela específica.
 *
 * Bug real (5º teste, 2026-08-10): `escolherTipoDocumento_` pegava "o primeiro
 * input de texto visível" varrendo TODOS os documentos. O primeiro é o da busca
 * da barra superior do SEI, que fica no documento do topo - ou seja, a extensão
 * digitava "SOF" na caixa de pesquisa do SEI em vez do filtro de tipo de
 * documento (que fica dentro do iframe de conteúdo), e a lista nunca filtrava.
 */
function documentoComTexto_(trecho) {
  const alvo = trecho.toLowerCase();
  for (const doc of documentosDisponiveis_()) {
    let texto = "";
    try {
      texto = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    } catch (e) {
      texto = "";
    }
    if (texto.toLowerCase().indexOf(alvo) !== -1) return doc;
  }
  return null;
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
  // Liga a vigilância JÁ - o editor pode abrir dentro de um iframe, sem novo
  // carregamento desta página (ver comentário em iniciarVigilancia_).
  if (agendou) iniciarVigilancia_();

  const abriu = await abrirIncluirDocumento_();
  if (!abriu) {
    return {
      ok: true, conteudoAgendado: agendou, tipoSelecionado: false, cadastroPreenchido: false,
      aviso: 'Não encontrei o botão "Incluir Documento". Inclua o documento manualmente - o conteúdo será preenchido sozinho quando o editor abrir.'
    };
  }

  const tipoSelecionado = await escolherTipoDocumento_(documento.tipo, documento.tipoConfig);

  // O formulário de cadastro nem sempre tem id #frmDocumentoCadastro; o sinal
  // mais confiável de que ele chegou é o rótulo "Nome na Árvore".
  const chegouCadastro = await aguardarCondicao_(
    () => acharEm_("#frmDocumentoCadastro") || campoPorRotulo_("Nome na Árvore"),
    tipoSelecionado ? 12000 : 4000, 300
  );

  let cadastroPreenchido = false;
  if (chegouCadastro) {
    // "Texto Inicial: Nenhum" - com isso o editor abre VAZIO e o conteúdo da
    // SOF entra sozinho, sem a barra de confirmação (que só existe para não
    // sobrescrever conteúdo preexistente, como o modelo do próprio SEI).
    marcarOpcaoPorRotulo_(documento.textoInicial || "Nenhum");

    const nomeArvore = campoPorRotulo_("Nome na Árvore");
    if (nomeArvore && documento.numero) { nomeArvore.value = documento.numero; dispararChange_(nomeArvore); }

    const descricao = campoPorRotulo_("Descrição");
    if (descricao && documento.descricaoEspecificacao) { descricao.value = documento.descricaoEspecificacao; dispararChange_(descricao); }

    const observacoes = campoPorRotulo_("Observações desta unidade");
    if (observacoes && documento.observacoes) { observacoes.value = documento.observacoes; dispararChange_(observacoes); }

    // Nível de acesso: tenta pelo rótulo visível (Público/Restrito/Sigiloso) e,
    // se não achar, pelo name nativo do SEI.
    const rotuloNivel = { publico: "Público", restrito: "Restrito", sigiloso: "Sigiloso" }[documento.nivelAcesso] || "Público";
    if (!marcarOpcaoPorRotulo_(rotuloNivel)) {
      const doc = (chegouCadastro.ownerDocument || document);
      const radio = doc.querySelector(`input[name="rdoNivelAcesso"][value="${MAPA_NIVEL_ACESSO[documento.nivelAcesso] || "0"}"]`);
      if (radio) { radio.checked = true; radio.click(); dispararChange_(radio); }
    }
    // A Hipótese Legal só aparece depois de marcar Restrito/Sigiloso.
    if (documento.hipoteseLegal) {
      await aguardarCondicao_(() => selecionarOpcaoPorTexto_(documento.hipoteseLegal), 4000, 250);
    }

    cadastroPreenchido = true;
  }

  if (documento.autoEnviar && cadastroPreenchido) {
    // O botão da tela real se chama "Salvar" (não "Confirmar Dados", como em
    // outras versões do SEI) - os dois são aceitos.
    const botao = acharTodos_('#sbmSalvar, input[value="Salvar"], button[value="Salvar"], input[value="Confirmar Dados"], button[value="Confirmar Dados"]')
      .find(b => b.offsetParent !== null);
    if (botao) {
      botao.click();
      return { ok: true, conteudoAgendado: agendou, tipoSelecionado, cadastroPreenchido, salvou: true };
    }
  }

  return {
    ok: true,
    conteudoAgendado: agendou,
    tipoSelecionado,
    cadastroPreenchido,
    salvou: false,
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
 * Escolhe o tipo do documento na tela "Gerar Documento".
 *
 * Corrigido depois de ver a tela real (2026-08-10): NÃO é um `<select>`. É um
 * campo de filtro + uma lista de sugestões, e o rótulo do item é o nome
 * completo - "SES - SOF - Solicitação Orçamentária e Financeira". A versão
 * anterior comparava por igualdade exata com "SOF", o que nunca casaria.
 *
 * Fluxo: digita o filtro (ex.: "SOF"), espera a lista reagir e clica no item
 * cujo texto CONTENHA um dos rótulos configurados. O `<select id="selSerie">`
 * das versões antigas continua suportado como alternativa.
 */
async function escolherTipoDocumento_(tipoGaocg, override) {
  const cfg = Object.assign({}, MAPA_TIPO_DOCUMENTO[tipoGaocg] || {}, override || {});
  const rotulos = (cfg.rotulos || []).filter(Boolean);
  if (!rotulos.length) return false;

  // 0. ESCOPO: a tela de escolha do tipo fica num iframe de conteúdo. Sem
  //    escopar, o "primeiro input de texto visível" é o da busca da barra
  //    superior do SEI, no documento do topo - era ali que o filtro estava
  //    sendo digitado (ver documentoComTexto_).
  const escopo = await aguardarCondicao_(
    () => documentoComTexto_("Escolha o Tipo do Documento"), 8000, 300
  ) || document;

  // 1. Preenche o filtro, se a tela tiver um. É o que faz a lista aparecer.
  if (cfg.filtro) {
    const filtro = await aguardarCondicao_(
      () => Array.from(escopo.querySelectorAll('input[type=text], input:not([type])'))
        .find(i => i.offsetParent !== null),
      6000, 300
    );
    if (filtro) {
      filtro.focus();
      filtro.value = cfg.filtro;
      filtro.dispatchEvent(new Event("input", { bubbles: true }));
      // O autocomplete do SEI reage a keyup; sem isso a lista não filtra.
      for (const evento of ["keydown", "keypress", "keyup"]) {
        filtro.dispatchEvent(new KeyboardEvent(evento, { key: cfg.filtro.slice(-1), bubbles: true }));
      }
      dispararChange_(filtro);
    }
  }

  // 2. Espera o item da lista e clica. Comparação por "contém", porque o texto
  //    exibido traz a sigla da unidade na frente ("SES - ...").
  const achado = await aguardarCondicao_(() => {
    const select = escopo.querySelector("#selSerie");
    if (select) {
      const opcao = Array.from(select.options).find(o =>
        rotulos.some(r => (o.textContent || "").toLowerCase().indexOf(r.toLowerCase()) !== -1));
      if (opcao) return { tipo: "select", select: select, opcao: opcao };
    }
    const item = Array.from(escopo.querySelectorAll('li, a, tr, td, div, span')).find(el => {
      if (el.children.length > 3 || el.offsetParent === null) return false;
      const texto = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return texto && rotulos.some(r => texto.indexOf(r.toLowerCase()) !== -1);
    });
    if (item) return { tipo: "item", item: item };
    return null;
  }, 10000, 300);

  if (!achado) return false;
  if (achado.tipo === "item") {
    achado.item.click();
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

/* ============ localização de campos POR RÓTULO VISÍVEL ============
 *
 * Os ids do formulário "Gerar Documento" do SEI variam por versão/customização
 * e não foram confirmados no ambiente da SES-PE. Os RÓTULOS, por outro lado,
 * estão na tela e são estáveis: "Descrição:", "Nome na Árvore:", "Hipótese
 * Legal:", "Nível de Acesso", "Texto Inicial". Procurar pelo rótulo é bem mais
 * resistente a diferença de versão do que chutar `#txtDescricao` e afins.
 */

function textoNormalizado_(el) {
  return (el.textContent || "").replace(/\s+/g, " ").replace(/:\s*$/, "").trim().toLowerCase();
}

/** Todos os elementos de todos os documentos acessíveis, em ordem de documento. */
function todosElementos_() {
  const lista = [];
  for (const doc of documentosDisponiveis_()) {
    lista.push(...Array.from(doc.querySelectorAll("*")));
  }
  return lista;
}

const SELETOR_CAMPO_ = "input:not([type=hidden]):not([type=button]):not([type=submit]), select, textarea";

/**
 * Campo associado a um rótulo visível. Primeiro tenta `<label for=...>`
 * (relação explícita); senão, pega o primeiro campo que aparece DEPOIS do
 * rótulo na ordem do documento - que é como o formulário do SEI é montado.
 */
function campoPorRotulo_(rotulo, tipoDesejado) {
  const alvo = rotulo.toLowerCase();
  const elementos = todosElementos_();

  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.children.length > 2) continue;          // só folhas/rótulos curtos
    if (textoNormalizado_(el) !== alvo) continue;

    if (el.tagName === "LABEL" && el.htmlFor) {
      const porFor = el.ownerDocument.getElementById(el.htmlFor);
      if (porFor) return porFor;
    }
    for (let j = i + 1; j < Math.min(i + 40, elementos.length); j++) {
      const cand = elementos[j];
      if (!cand.matches || !cand.matches(SELETOR_CAMPO_)) continue;
      if (tipoDesejado && cand.tagName.toLowerCase() !== tipoDesejado) continue;
      return cand;
    }
  }
  return null;
}

/** Radio/checkbox cujo texto ao lado (ou label associado) é `rotulo`. */
function marcarOpcaoPorRotulo_(rotulo) {
  const alvo = rotulo.trim().toLowerCase();
  for (const entrada of acharTodos_('input[type=radio], input[type=checkbox]')) {
    let texto = "";
    const doc = entrada.ownerDocument;
    if (entrada.id) {
      const lbl = doc.querySelector('label[for="' + entrada.id + '"]');
      if (lbl) texto = textoNormalizado_(lbl);
    }
    if (!texto && entrada.parentElement) texto = textoNormalizado_(entrada.parentElement);
    if (!texto && entrada.nextElementSibling) texto = textoNormalizado_(entrada.nextElementSibling);
    if (texto === alvo) {
      entrada.checked = true;
      entrada.click();               // o SEI reage ao clique, não só ao change
      dispararChange_(entrada);
      return true;
    }
  }
  return false;
}

/** <select> que contenha uma opção cujo texto contenha `trecho` - e a seleciona. */
function selecionarOpcaoPorTexto_(trecho) {
  const alvo = trecho.trim().toLowerCase();
  for (const select of acharTodos_("select")) {
    const opcao = Array.from(select.options).find(o => (o.textContent || "").toLowerCase().indexOf(alvo) !== -1);
    if (opcao) {
      select.value = opcao.value;
      dispararChange_(select);
      return true;
    }
  }
  return false;
}

/* ===================== identificação do processo aberto ===================== */

/** Formato do número de processo do SEI (mesmo padrão validado no GAOCG). */
const REGEX_PROCESSO_SEI_ = /\d{5,10}\.\d{6}\/\d{4}-\d{2}/g;
const CHAVE_PROCESSO_ABRIR_ = "processoParaAbrir";
/** Envio inteiro (documento + número do processo) aguardando o processo abrir. */
const CHAVE_ENVIO_PENDENTE_ = "envioPendente";
/** Evita que duas abas retomem o mesmo envio ao mesmo tempo. */
let retomandoEnvio_ = false;

/** Só dígitos - a comparação ignora pontuação/formatação divergente. */
function digitos_(texto) {
  return String(texto || "").replace(/\D/g, "");
}

/**
 * Números de processo visíveis nesta aba (documento do topo + iframes de mesma
 * origem). Ler o TEXTO da página é mais confiável que olhar a URL: a URL do
 * `procedimento_trabalhar` traz `id_procedimento`, um id interno do banco, não
 * o número do processo - não dá para casar com o que o analista digitou na SOF.
 */
function processosVisiveis_() {
  const achados = new Set();
  for (const doc of documentosDisponiveis_()) {
    let texto = "";
    try {
      texto = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    } catch (e) {
      texto = "";
    }
    const casados = texto.match(REGEX_PROCESSO_SEI_);
    if (casados) casados.forEach(n => achados.add(n));
  }
  return Array.from(achados);
}

function conferirProcesso_(numeroEsperado) {
  const alvo = digitos_(numeroEsperado);
  const visiveis = processosVisiveis_();
  return {
    tem: !!alvo && visiveis.some(n => digitos_(n) === alvo),
    numeros: visiveis,
    ehPaginaDeProcesso: location.href.includes("procedimento_trabalhar")
  };
}

/* ===================== abrir o processo pela pesquisa do SEI ===================== */

/**
 * Campo de pesquisa do SEI. São vários candidatos porque o id varia entre
 * versões/temas e NÃO foi confirmado no ambiente da SES-PE - por isso o fluxo
 * degrada: se nenhum casar, mostra o número na tela para o usuário colar à mão,
 * em vez de falhar em silêncio.
 */
const SELETORES_PESQUISA_SEI_ = [
  "#txtPesquisaRapida",
  'input[name="txtPesquisaRapida"]',
  "#txtInfraPesquisar",
  'input[type="search"]'
];

async function tentarPesquisarProcesso_() {
  let alvo = null;
  try {
    const dados = await chrome.storage.local.get(CHAVE_PROCESSO_ABRIR_);
    alvo = dados && dados[CHAVE_PROCESSO_ABRIR_];
  } catch (e) {
    return;
  }
  if (!alvo || !alvo.numero) return;
  // Consome logo: a pesquisa só deve ser tentada uma vez, senão qualquer
  // navegação seguinte no SEI voltaria a pesquisar sozinha.
  await chrome.storage.local.remove(CHAVE_PROCESSO_ABRIR_).catch(() => {});

  const campo = await aguardarCondicao_(() => {
    for (const seletor of SELETORES_PESQUISA_SEI_) {
      const el = acharEm_(seletor);
      if (el) return el;
    }
    return null;
  }, 10000, 400);

  if (!campo) {
    avisarNaTela_("GAOCG: não encontrei a pesquisa do SEI. Abra o processo " + alvo.numero + " manualmente e clique em enviar de novo.");
    return;
  }

  campo.focus();
  campo.value = alvo.numero;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  campo.dispatchEvent(new Event("change", { bubbles: true }));
  const form = campo.form;
  if (form) form.submit();
  else campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
  avisarNaTela_("GAOCG: pesquisando o processo " + alvo.numero + " no SEI. Abra-o e clique em enviar de novo.");
}

/* ===================== retomada automática do envio ===================== */

/**
 * Fecha o ciclo do "processo não estava aberto".
 *
 * Antes (v0.7/0.8) a extensão abria a pesquisa do SEI e devolvia erro pedindo
 * ao analista para **clicar em enviar de novo** no GAOCG depois de abrir o
 * processo. Na prática isso é um passo a mais sem necessidade: a intenção já
 * tinha sido declarada no primeiro clique.
 *
 * Agora o envio inteiro (documento + número do processo) fica guardado e é
 * retomado sozinho assim que uma aba do SEI carregar com AQUELE processo
 * aberto. Se o analista abrir outro processo, nada acontece - a conferência de
 * número continua valendo, e o pendente só expira pelo tempo (15 min).
 */
async function retomarEnvioPendente_() {
  if (retomandoEnvio_) return;
  if (!location.href.includes("procedimento_trabalhar")) return;

  let pendente = null;
  try {
    const dados = await chrome.storage.local.get(CHAVE_ENVIO_PENDENTE_);
    pendente = dados && dados[CHAVE_ENVIO_PENDENTE_];
  } catch (e) {
    return;
  }
  if (!pendente || !pendente.documento || !pendente.numeroProcesso) return;
  if (Date.now() - (pendente.criadoEm || 0) > VALIDADE_PENDENTE_MS_) {
    await chrome.storage.local.remove(CHAVE_ENVIO_PENDENTE_).catch(() => {});
    return;
  }

  // A árvore do processo pode demorar a montar; só depois disso o número
  // aparece no texto da página.
  const bate = await aguardarCondicao_(() => conferirProcesso_(pendente.numeroProcesso).tem, 15000, 500);
  if (!bate) return; // outro processo nesta aba - deixa o pendente para a próxima

  retomandoEnvio_ = true;
  await chrome.storage.local.remove(CHAVE_ENVIO_PENDENTE_).catch(() => {});
  avisarNaTela_("GAOCG: processo " + pendente.numeroProcesso + " encontrado. Criando o documento da SOF...");
  try {
    await preencherDocumento(pendente.documento);
  } catch (e) {
    avisarNaTela_("GAOCG: falha ao criar o documento - " + (e && e.message ? e.message : e));
  } finally {
    retomandoEnvio_ = false;
  }
}

/* ===================== Etapa 2: conteúdo pendente ===================== */

function agendarConteudo_(documento) {
  if (!documento || !documento.conteudoHtml) return Promise.resolve(false);
  return chrome.storage.local
    .set({
      [CHAVE_PENDENTE_]: {
        html: documento.conteudoHtml,
        rotulo: documento.numero || "",
        // Número da SOF como está no app - é o texto que será trocado pelo
        // número que o SEI gerar no modelo (ver numeroSofNoModelo_).
        marcadorNumero: documento.marcadorNumeroSof || "",
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

/**
 * Corpo editável do documento, em qualquer frame acessível desta página.
 *
 * Um documento do SEI tem seções pré-definidas (cabeçalho, principal, rodapé,
 * assinatura), cada uma com seu próprio editor - e só a "principal" aceita
 * edição. A versão anterior pegava o PRIMEIRO `iframe.cke_wysiwyg_frame` que
 * encontrasse, que é o cabeçalho: era ali que o conteúdo ia parar (4º teste
 * real, 2026-08-10).
 *
 * Agora coleta todos os candidatos, descarta os travados (`isContentEditable`
 * false, que é como o SEI protege cabeçalho/rodapé) e, entre os que sobram,
 * fica com o de maior altura - o corpo do documento é sempre o maior.
 */
function corpoDoEditor_() {
  const candidatos = [];

  for (const iframe of acharTodos_('iframe.cke_wysiwyg_frame, iframe[title="Rich Text Editor"]')) {
    try {
      const corpo = iframe.contentDocument && iframe.contentDocument.body;
      if (corpo) {
        candidatos.push({
          corpo: corpo,
          editavel: corpo.isContentEditable !== false,
          altura: iframe.offsetHeight || 0
        });
      }
    } catch (e) { /* cross-origin */ }
  }

  // CKEditor 5 / modo "div editável" (sem iframe).
  for (const el of acharTodos_('.cke_editable[contenteditable="true"], div[contenteditable="true"].cke_editable')) {
    candidatos.push({ corpo: el, editavel: true, altura: el.offsetHeight || 0 });
  }

  if (!candidatos.length) return null;
  const editaveis = candidatos.filter(c => c.editavel);
  const pool = editaveis.length ? editaveis : candidatos;
  pool.sort((a, b) => b.altura - a.altura);
  return pool[0].corpo;
}

/** Editor sem nada dentro - dá pra preencher sozinho, sem risco de apagar nada. */
function editorEstaVazio_(corpo) {
  if (!corpo) return false;
  if (corpo.querySelector("table, img, ul, ol")) return false;
  return corpo.textContent.replace(/ /g, " ").trim() === "";
}

/**
 * Etapa 2.
 *
 * Achado no 2º teste real (2026-08-10): o tipo de documento "SOF" tem MODELO
 * próprio no SEI - ao escolher o tipo, o editor já abre preenchido com o
 * template em branco da SOF. A v0.3.0 só injetava em editor VAZIO (salvaguarda
 * contra sobrescrever documento existente), então encontrava o template,
 * concluía "já tem conteúdo" e não fazia nada: o usuário terminava com o modelo
 * vazio do SEI, sem os dados do GAOCG.
 *
 * Não existe jeito confiável de distinguir, pelo DOM, "modelo em branco de um
 * documento novo" de "documento já preenchido que eu apagaria" - as duas coisas
 * são apenas HTML no corpo do editor. Então:
 *
 *   - editor VAZIO    -> injeta direto (não há o que perder);
 *   - editor COM ALGO -> PERGUNTA, com um botão na própria tela do SEI.
 *
 * Perguntar é o único caminho que não obriga a escolher entre "não funciona com
 * tipos que têm modelo" e "pode apagar um documento oficial sem avisar".
 */
async function vigiarEditorParaConteudoPendente_() {
  const pendente = await lerConteudoPendente_();
  if (!pendente) return;

  // Vigia até o pendente expirar, não por 45s fixos: entre clicar em "Enviar ao
  // SEI" e o editor abrir existe o cadastro inteiro sendo preenchido à mão, o
  // que passa fácil de um minuto. O intervalo de 600ms mantém o custo baixo.
  const restante = VALIDADE_PENDENTE_MS_ - (Date.now() - (pendente.criadoEm || 0));
  if (restante <= 0) return;
  const corpo = await aguardarCondicao_(() => corpoDoEditor_(), restante, 600);
  if (!corpo) return;

  if (editorEstaVazio_(corpo)) {
    await aplicarConteudo_(corpo, pendente);
    return;
  }
  mostrarConfirmacao_(corpo, pendente);
}

/**
 * Aplica o conteúdo pelo caminho mais confiável disponível.
 *
 * Preferência: API do CKEditor (`setData`), executada no MAIN world via
 * background (ver INJETAR_CKEDITOR em background.js). Motivo: o CKEditor mantém
 * um modelo interno e o que ele grava vem de `getData()`, não necessariamente do
 * DOM - escrever `innerHTML` no corpo editável pode ser ignorado na hora de
 * salvar. Content script roda em contexto isolado e NÃO enxerga
 * `window.CKEDITOR`, por isso a chamada precisa passar pelo main world.
 *
 * Essa é a mesma barreira que o SEI Pro resolve declarando o CKEditor em
 * `web_accessible_resources` e injetando um <script> na página (técnica da era
 * MV2). O `chrome.scripting.executeScript({ world: 'MAIN' })` do MV3 chega ao
 * mesmo lugar sem expor nenhum recurso da extensão a páginas de terceiros.
 *
 * Fallback para `innerHTML` quando não houver CKEditor (editor em modo div, ou
 * versão que não exponha a instância).
 */
/**
 * Número da SOF que o próprio SEI gerou no modelo do documento (ex.: "173/2026").
 *
 * O SEI numera cada nova SOF sequencialmente e já entrega o modelo com esse
 * número - mesmo com "Texto Inicial: Nenhum" marcado, confirmado no 5º teste
 * real. Esse número é gerado NA HORA da criação, então o app não tem como
 * saber de antemão: só dá para lê-lo aqui, do modelo, antes de substituir o
 * conteúdo.
 *
 * Primeiro procura um número colado à sigla "SOF" (mais confiável); se não
 * achar, cai para o primeiro NNN/AAAA nos 1000 primeiros caracteres - o
 * cabeçalho do documento -, para não capturar uma data ou valor perdido no meio
 * do texto.
 */
function numeroSofNoModelo_(corpo) {
  if (!corpo) return null;
  const texto = ((corpo.innerText || corpo.textContent) || "").replace(/\s+/g, " ");
  const comSigla = texto.match(/SOF[^\d]{0,20}(\d{1,4}\s*\/\s*\d{4})/i);
  if (comSigla) return comSigla[1].replace(/\s/g, "");
  const noCabecalho = texto.slice(0, 1000).match(/\b(\d{1,4}\s*\/\s*\d{4})\b/);
  return noCabecalho ? noCabecalho[1].replace(/\s/g, "") : null;
}

async function aplicarConteudo_(corpo, pendente) {
  // Lê o número ANTES de substituir - depois o modelo do SEI já era.
  const numeroSei = numeroSofNoModelo_(corpo);
  if (numeroSei && pendente.marcadorNumero && pendente.marcadorNumero !== numeroSei) {
    // Troca o número que veio do app pelo que o SEI acabou de gerar, para o
    // documento sair com a numeração oficial do SEI.
    pendente.html = pendente.html.split(pendente.marcadorNumero).join(numeroSei);
  }

  const resultado = await pedirInjecaoNoMainWorld_(pendente.html);
  let detalhe;
  if (resultado.ok) {
    detalhe = " (seção " + (resultado.escolhida || "?") + ")";
  } else {
    detalhe = " (modo DOM)";
    corpo.innerHTML = pendente.html;
    corpo.dispatchEvent(new Event("input", { bubbles: true }));
    corpo.dispatchEvent(new Event("change", { bubbles: true }));
  }

  await chrome.storage.local.remove(CHAVE_PENDENTE_).catch(() => {});
  avisarNaTela_(
    "GAOCG: conteúdo da " + (pendente.rotulo || "SOF") + " inserido" + detalhe +
    (numeroSei ? ". Nº da SOF no SEI: " + numeroSei : "") +
    ". Revise e salve o documento."
  );
}

/** Devolve { ok, escolhida } - `escolhida` é o nome da seção do SEI que recebeu o conteúdo. */
function pedirInjecaoNoMainWorld_(html) {
  try {
    return chrome.runtime
      .sendMessage({ type: "INJETAR_CKEDITOR", html: html })
      .then(r => (r && r.ok) ? { ok: true, escolhida: r.escolhida } : { ok: false })
      .catch(() => ({ ok: false }));
  } catch (e) {
    return Promise.resolve({ ok: false });
  }
}

/**
 * Barra de confirmação na própria página do SEI. Não some sozinha - o usuário
 * pode continuar mexendo no documento e decidir depois.
 *
 * "Agora não" apenas esconde a barra: o pendente continua válido (até o limite
 * de 15 min) e a barra reaparece no próximo documento aberto. É assimétrico de
 * propósito - deixar de inserir é reversível (basta abrir o documento de novo),
 * inserir por engano por cima de um documento oficial não é.
 */
function mostrarConfirmacao_(corpo, pendente) {
  const barra = document.createElement("div");
  barra.style.cssText = [
    "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
    "background:#1e3a8a", "color:#fff", "padding:12px 14px", "border-radius:8px",
    "font:13px system-ui,sans-serif", "box-shadow:0 4px 14px rgba(0,0,0,.3)", "max-width:380px"
  ].join(";");

  const texto = document.createElement("div");
  texto.textContent = "GAOCG: este editor já tem conteúdo (provavelmente o modelo do SEI). Substituir pelo documento da "
    + (pendente.rotulo || "SOF") + "?";
  texto.style.cssText = "margin-bottom:10px;line-height:1.4";

  const linha = document.createElement("div");
  linha.style.cssText = "display:flex;gap:8px;justify-content:flex-end";

  const btnDepois = document.createElement("button");
  btnDepois.textContent = "Agora não";
  btnDepois.style.cssText = "background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:6px;padding:6px 12px;cursor:pointer;font:13px system-ui,sans-serif";
  btnDepois.addEventListener("click", () => barra.remove());

  const btnSubstituir = document.createElement("button");
  btnSubstituir.textContent = "Substituir";
  btnSubstituir.style.cssText = "background:#1c7a37;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font:13px system-ui,sans-serif";
  btnSubstituir.addEventListener("click", async () => {
    barra.remove();
    await aplicarConteudo_(corpo, pendente);
  });

  linha.appendChild(btnDepois);
  linha.appendChild(btnSubstituir);
  barra.appendChild(texto);
  barra.appendChild(linha);
  document.body.appendChild(barra);
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

/* ===================== inicialização (sempre por último) =====================
 *
 * TODO o código que executa na carga do script fica AQUI, depois de todas as
 * declarações. Convenção adotada depois do bug real da v0.5.0
 * ("Cannot access 'vigilanciaAtiva_' before initialization"): `function` é içada
 * e pode ser chamada de qualquer lugar, mas `let`/`const` ficam na Temporal Dead
 * Zone até a linha da declaração executar. Com a inicialização no meio do
 * arquivo, bastava alguém declarar uma constante abaixo dela para o content
 * script inteiro morrer antes de registrar qualquer listener - e o sintoma era
 * "nada acontece", sem pista nenhuma na tela do SEI.
 *
 * Mantendo este bloco no fim, nenhuma ordem de declaração acima pode quebrá-lo.
 */

// Só o documento do topo age. Com todos os frames agindo, vários responderiam à
// mesma mensagem (o primeiro sendResponse vence) e o conteúdo seria injetado
// mais de uma vez.
if (window.top === window) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;

    // Pergunta barata e síncrona: esta aba mostra o processo X?
    if (message.type === "CONFERIR_PROCESSO") {
      sendResponse(conferirProcesso_(message.numero));
      return false;
    }

    if (message.type !== "PREENCHER_DOCUMENTO") return false;
    preencherDocumento(message.documento)
      .then(resultado => sendResponse(resultado))
      .catch(erro => sendResponse({ ok: false, erro: String(erro && erro.message ? erro.message : erro) }));
    return true; // resposta assíncrona
  });

  // Se a extensão pediu para abrir um processo pela pesquisa, é nesta carga de
  // página que isso acontece.
  tentarPesquisarProcesso_();

  // E se havia um envio esperando o processo abrir, ele é retomado sozinho aqui
  // - sem exigir um segundo clique no GAOCG.
  retomarEnvioPendente_();

  // Etapa 2: vale para QUALQUER página do SEI, inclusive a janela do editor que
  // o SEI abre depois de "Confirmar Dados" - é ali que o conteúdo finalmente entra.
  iniciarVigilancia_();

  // Rede de segurança para o caso em que o editor abre SEM recarregar o
  // documento do topo (o SEI navega dentro de iframes). Nesse cenário o content
  // script não roda de novo, então a vigilância precisa ser (re)ligada pelo
  // próprio evento de gravação do pendente - inclusive quando o pendente foi
  // criado por OUTRA aba.
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === "local" && mudancas[CHAVE_PENDENTE_] && mudancas[CHAVE_PENDENTE_].newValue) {
      iniciarVigilancia_();
    }
  });
}
