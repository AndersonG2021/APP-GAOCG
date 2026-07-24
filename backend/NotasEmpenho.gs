/**
 * GAOCG App - Controle de Notas de Empenho (Funcionalidade 5, Anexo III).
 * Sempre vinculada a um único SOF (1:N a partir do SOF).
 */

/**
 * Lê a aba NotasEmpenho inteira, com cache de 30s (mesmo padrão de
 * todasOpcoesComCache_ em ListasPersonalizadas.gs / todasFontesComCache_ em
 * Sof.gs). Reaproveitada por listarSof (números de NE nos cards), listarNotasEmpenho,
 * listarNotasEmpenhoPorSof e totalEmpenhadoSof_ - antes cada uma relia essa
 * aba do zero.
 */
function todasNotasEmpenhoComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'notas_empenho';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO));
  rows.forEach(function (n) { delete n._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheNotasEmpenho_() {
  CacheService.getScriptCache().remove('notas_empenho');
}

/** Mesmo padrão de cache de 30s - ver todasNotasEmpenhoComCache_ acima. */
function todoCronogramaComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'notas_empenho_cronograma';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO_CRONOGRAMA));
  rows.forEach(function (c) { delete c._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheCronograma_() {
  CacheService.getScriptCache().remove('notas_empenho_cronograma');
}

/** Agrupa o cronograma por nota_empenho_id (só a NE "original" de um grupo tem cronograma), ordenado por mês. */
function agruparCronogramaPorNotaEmpenho_() {
  var mapa = {};
  todoCronogramaComCache_().forEach(function (c) {
    var chave = c.nota_empenho_id;
    if (!mapa[chave]) mapa[chave] = [];
    mapa[chave].push({ mes: toNumber_(c.mes), valor: toNumber_(c.valor) });
  });
  Object.keys(mapa).forEach(function (id) { mapa[id].sort(function (a, b) { return a.mes - b.mes; }); });
  return mapa;
}

var NOMES_MESES_CRONOGRAMA = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Extrai o Cronograma de Desembolso (12 valores mensais). Bug corrigido com
 * um documento real do usuário: o texto extraído desse layout (tabela de
 * meses) lista os 12 RÓTULOS primeiro ("JANEIRO: FEVEREIRO: MARÇO: ABRIL:" em
 * blocos de linha) e só depois os 12 VALORES, um por linha, na mesma ordem -
 * nunca "MÊS: valor" adjacentes. A versão anterior (regex por mês, tipo
 * `/JANEIRO\s*:?\s*([\d.,]+)/i`) sempre falhava por causa disso. Em vez de
 * casar rótulo+valor, isola a seção do cronograma (entre o título e o próximo
 * cabeçalho conhecido) e pega os 12 valores monetários que aparecem nela, na
 * ordem (Janeiro a Dezembro é a ordem sempre impressa no documento).
 */
function extrairCronogramaDesembolso_(texto) {
  var inicioMatch = texto.match(/CRONOGRAMA\s+DE\s+DESEMBOLSO/i);
  if (!inicioMatch) return [];
  var trecho = texto.slice(inicioMatch.index + inicioMatch[0].length);
  var fimMatch = trecho.match(/FICHA\s+FINANCEIRA|ITENS\s+DO\s+EMPENHO|MODALIDADE\s+DE\s+EMPENHO/i);
  if (fimMatch) trecho = trecho.slice(0, fimMatch.index);

  var valores = trecho.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
  if (!valores || valores.length < 12) return [];

  var cronograma = [];
  for (var i = 0; i < 12; i++) {
    cronograma.push({ mes: i + 1, rotulo: NOMES_MESES_CRONOGRAMA[i], valor: normalizarValorMonetarioBr_(valores[i]) });
  }
  return cronograma;
}

/**
 * "Preço Total" fica perto de "LOCALIDADE DE ENTREGA" no rodapé do documento,
 * numa linha só (rótulo "TOTAL" + valor), diferente do cabeçalho da tabela de
 * itens ("PREÇO UNITÁRIO"/"PREÇO TOTAL", sem valor logo depois) - o
 * lookbehind evita casar com esse cabeçalho.
 */
var REGEX_PRECO_TOTAL_NE_DOCUMENTO = /(?<!PRE[ÇC]O\s)\bTOTAL\s*:?\s*([\d.,]+)/i;

/**
 * O código orçamentário da FONTE é um número de 10 dígitos sem separadores
 * (ex.: "0605000000") - único campo do documento nesse formato exato (UG,
 * Programa de Trabalho, CNPJ, CEP etc. sempre têm pontos/barras/traços ou
 * outra quantidade de dígitos), então basta achar o primeiro token de 10
 * dígitos "soltos" no documento.
 */
var REGEX_CODIGO_FONTE_NE_DOCUMENTO = /\b(\d{10})\b/;

/**
 * Classifica o código orçamentário da FONTE na categoria usada pelo app
 * (TESOURO/SUS/Outra) - convenção confirmada com o usuário: prefixo 500 =
 * TESOURO, 600 ou 605 = SUS, 754 = Operação de Crédito (sem categoria própria
 * no app, cai em "Outra"). Prefixo não reconhecido devolve null - o campo
 * Fonte fica sem sugestão automática, em vez de arriscar uma classificação
 * errada num dado financeiro.
 */
function classificarFonteDoCodigoOrcamentario_(codigo) {
  var digitos = String(codigo || '').replace(/\D/g, '').replace(/^0+/, '');
  if (/^500/.test(digitos)) return 'TESOURO';
  if (/^(600|605)/.test(digitos)) return 'SUS';
  if (/^754/.test(digitos)) return 'Outra';
  return null;
}

/**
 * Lê (via OCR) o documento de uma Nota de Empenho ainda não cadastrada e
 * extrai Número, Fonte (classificada do código orçamentário), Preço Total e
 * Cronograma de Desembolso - usado tanto pelo botão "Nova Nota de Empenho"
 * (js/notas-empenho.js) quanto pelo mini-formulário de NE embutido na edição
 * de SOF (js/sof.js, que não usa o cronograma). Cronograma é best-effort (não
 * bloqueia o resto se não achar os 12 meses) - Número/Preço Total são os
 * únicos campos que fazem a leitura falhar se não encontrados.
 * REGEX_NUMERO_NE_DOCUMENTO é a mesma de Recibos.gs (mesmo formato de número
 * em qualquer documento do e-fisco/PE).
 */
function lerAnexoNotaEmpenho(session, params) {
  params = params || {};
  if (!params.arquivoBase64) return fail_('Nenhum arquivo enviado.');

  var texto;
  try {
    texto = extrairTextoOcr_(params.arquivoBase64, params.arquivoNome, params.arquivoTipo);
  } catch (e) {
    return fail_('Não foi possível ler o documento: ' + e.message);
  }

  var matchNumero = texto.match(REGEX_NUMERO_NE_DOCUMENTO);
  if (!matchNumero) return fail_('Não foi possível identificar o número da Nota de Empenho no documento anexado.');
  var numeroNe = matchNumero[1].toUpperCase();

  var matchTotal = texto.match(REGEX_PRECO_TOTAL_NE_DOCUMENTO);
  var precoTotal = matchTotal ? normalizarValorMonetarioBr_(matchTotal[1]) : null;
  if (precoTotal === null) return fail_('Não foi possível identificar o Preço Total no documento anexado.');

  var cronograma = extrairCronogramaDesembolso_(texto);
  var somaCronograma = cronograma.reduce(function (s, m) { return s + m.valor; }, 0);

  var matchFonteCodigo = texto.match(REGEX_CODIGO_FONTE_NE_DOCUMENTO);
  var fonteCodigo = matchFonteCodigo ? matchFonteCodigo[1] : null;

  return ok_({
    numero_ne: numeroNe,
    preco_total: precoTotal,
    cronograma: cronograma,
    // Informativo - o valor oficial impresso é o preco_total; se a soma do
    // cronograma não bater (ou não tiver sido lido), o frontend só avisa, não bloqueia.
    cronograma_diverge_do_total: cronograma.length === 12 && Math.abs(precoTotal - somaCronograma) > 0.01,
    fonte: fonteCodigo ? classificarFonteDoCodigoOrcamentario_(fonteCodigo) : null,
    fonte_codigo: fonteCodigo
  });
}

function listarNotasEmpenhoPorSof(session, sofId) {
  var rows = todasNotasEmpenhoComCache_().filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  rows.sort(function (a, b) { return a.data_criacao < b.data_criacao ? -1 : 1; });
  return ok_(rows);
}

/**
 * numero_ne é obrigatório pra original e reforço (usado pra agrupar as duas
 * sob o mesmo "card" na tela de Notas de Empenho). Reforço exige que já
 * exista uma NE original com esse número no mesmo SOF.
 * Ao gravar a primeira NE original de um SOF, marca SOF.possui_ne = true.
 *
 * mes_referencia (2026-07-20): novo campo, só para reforços - qual mês do
 * cronograma de desembolso aquele reforço se refere (puramente informativo,
 * mostrado como etiqueta na tabela de cronograma; não entra no cálculo do
 * valor_atual/alerta da NE, que continua vindo só da soma bruta menos o
 * liquidado nos Recibos).
 */
function criarNotaEmpenho(session, dados) {
  dados = dados || {};
  var sofSheet = getSheet_(SHEETS.SOF);
  var sof = findById_(sofSheet, dados.sof_id);
  if (!sof) return fail_('SOF não encontrada.');

  var tipo = dados.tipo === 'reforco' ? 'reforco' : 'original';
  var numeroNe = sanitizeString_(dados.numero_ne, 50);
  if (!isNonEmpty_(numeroNe)) return fail_('Informe o número da Nota de Empenho.');
  if (!isNonEmpty_(dados.fonte)) return fail_('Selecione a fonte da Nota de Empenho.');

  if (tipo === 'reforco') {
    var existeOriginal = todasNotasEmpenhoComCache_().some(function (n) {
      return String(n.sof_id) === String(dados.sof_id) && n.tipo === 'original' && n.numero_ne === numeroNe;
    });
    if (!existeOriginal) return fail_('Nota de Empenho original com esse número não encontrada para este SOF.');
  }

  var mesReferencia = '';
  if (tipo === 'reforco' && isNonEmpty_(dados.mes_referencia)) {
    var mesNum = Number(dados.mes_referencia);
    if (!(mesNum >= 1 && mesNum <= 12)) return fail_('Mês de referência do reforço inválido.');
    mesReferencia = mesNum;
  }

  var valor = toNumber_(dados.valor);
  if (valor <= 0) return fail_('Informe um valor válido para a Nota de Empenho.');
  if (!dados.arquivoBase64 || !dados.arquivoNome) {
    return fail_('Anexe o arquivo da Nota de Empenho.');
  }

  var pasta = DriveApp.getFolderById('1f10o-GB3hFQsWXqes2kPZymhuDCeMY2c');
  var blob = Utilities.newBlob(Utilities.base64Decode(dados.arquivoBase64), dados.arquivoTipo || 'application/pdf', dados.arquivoNome);
  var arquivo = pasta.createFile(blob);

  var neSheet = getSheet_(SHEETS.NOTAS_EMPENHO);
  var id = proximoId_('NotasEmpenho');
  var nova = {
    id: id,
    sof_id: dados.sof_id,
    tipo: tipo,
    numero_ne: numeroNe,
    fonte: sanitizeString_(dados.fonte, 50),
    valor: valor,
    periodo: sanitizeString_(dados.periodo, 100),
    mes_referencia: mesReferencia,
    arquivo_drive_id: arquivo.getId(),
    arquivo_url: arquivo.getUrl(),
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(neSheet, nova);
  invalidarCacheNotasEmpenho_();
  registrarLog_(session, 'NotaEmpenho', id, sof.criado_por, 'CRIACAO', '', tipo + ' - valor ' + valor);

  // Cronograma de desembolso é só informativo (não altera o cálculo de
  // alerta da fonte) e só existe pra NE original criada via OCR (botão "Nova
  // Nota de Empenho") - reforço não tem cronograma próprio (tem mes_referencia).
  if (tipo === 'original' && dados.cronograma && dados.cronograma.length) {
    var cronoSheet = getSheet_(SHEETS.NOTAS_EMPENHO_CRONOGRAMA);
    dados.cronograma.forEach(function (item) {
      var mes = Number(item.mes);
      if (mes < 1 || mes > 12) return;
      appendObjectRow_(cronoSheet, {
        id: proximoId_('NotasEmpenhoCronograma'),
        nota_empenho_id: id,
        mes: mes,
        valor: toNumber_(item.valor),
        criado_por: session.id,
        data_criacao: nowIso_()
      });
    });
    invalidarCacheCronograma_();
  }

  // Ao anexar a primeira NE original, marca possui_ne = true e, se o
  // andamento ainda estiver antes de "NE EMITIDA" na ordem fixa das 13
  // etapas (ETAPAS_ANDAMENTO_ em Sof.gs), avança automaticamente para lá -
  // uma única leitura/escrita da linha do SOF para os dois campos.
  if (tipo === 'original') {
    var patchSof = {};
    var logsSof = [];

    if (!toBool_(sof.possui_ne)) {
      patchSof.possui_ne = true;
      logsSof.push(['possui_ne', 'false', 'true']);
    }

    var indiceAtual = ETAPAS_ANDAMENTO_.indexOf(sof.andamento);
    var indiceNeEmitida = ETAPAS_ANDAMENTO_.indexOf('NE EMITIDA');
    if (indiceAtual < indiceNeEmitida) {
      patchSof.andamento = 'NE EMITIDA';
      patchSof.data_ultima_alteracao_andamento = nowIso_();
      patchSof.visualizado_apos_alerta = false;
      logsSof.push(['andamento', sof.andamento, 'NE EMITIDA']);
    }

    if (Object.keys(patchSof).length) {
      var atualizado = Object.assign({}, sof, patchSof);
      var rowIndex = sof._row;
      delete atualizado._row;
      updateObjectRow_(sofSheet, rowIndex, atualizado);
      logsSof.forEach(function (l) {
        registrarLog_(session, 'SOF', sof.id, sof.criado_por, l[0], l[1], l[2]);
      });
    }
  }

  return ok_(nova);
}


/**
 * Soma valor_liquidado de Recibos agrupado por nota_empenho (mesma convenção
 * de texto livre já usada no autopreenchimento do Recibo), numa única
 * leitura da aba Recibos. Antes, listarNotasEmpenho chamava o equivalente de
 * "valorLiquidadoPorNe_(numeroNe)" uma vez por número de NE - um N+1 clássico
 * (mesmo padrão já corrigido pra opcaoTemPausaContagem_ em ListasPersonalizadas.gs,
 * ver RELATORIO_LENTIDAO_SOF.md item 2.5): com 10 NEs cadastradas, isso lia a
 * aba Recibos inteira 10 vezes numa chamada só.
 */
function valorLiquidadoAgrupadoPorNe_() {
  var mapa = {};
  sheetToObjects_(getSheet_(SHEETS.RECIBOS)).forEach(function (r) {
    if (!r.nota_empenho) return;
    mapa[r.nota_empenho] = (mapa[r.nota_empenho] || 0) + toNumber_(r.valor_liquidado);
  });
  return mapa;
}

/**
 * Recibos ativos (não excluídos) agrupados por "numero_ne|competencia", pra
 * resolver a Situação de cada mês do cronograma numa única leitura da aba
 * Recibos (em vez de reler a aba uma vez por mês de cronograma - N+1). Novo
 * nesta sessão (2026-07-20), separado de valorLiquidadoAgrupadoPorNe_ acima
 * pra não mudar o comportamento já existente dela.
 */
function recibosPorNeECompetencia_() {
  var mapa = {};
  sheetToObjects_(getSheet_(SHEETS.RECIBOS)).forEach(function (r) {
    if (!r.nota_empenho || toBool_(r.excluido)) return;
    var chave = r.nota_empenho + '|' + r.competencia;
    (mapa[chave] = mapa[chave] || []).push(r);
  });
  return mapa;
}

var MESES_ABREV_CRONOGRAMA_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Situação de um mês do cronograma de desembolso (novo nesta sessão,
 * 2026-07-20), de acordo com o(s) Recibo(s) vinculados àquela Nota de
 * Empenho na competência correspondente (competencia = "mmm.aa", mesmo
 * formato usado em toda a tela de Recibos):
 * - Nenhum Recibo lançado pra essa competência ainda -> "Previsto".
 * - Existe Recibo e o status é exatamente "PAGO" -> "Pago".
 * - Existe Recibo e o status contém "LIQUID" (ex. alguma etapa de liquidação
 *   configurada em Listas Personalizadas) -> "Liquidado".
 * - Existe Recibo em qualquer outro status do fluxo -> "Em processamento".
 * O ano do mês é resolvido a partir dos 4 primeiros dígitos do numero_ne
 * (formato AAAANNxxxxxx, ex. "2026NE000418").
 */
function situacaoCronogramaMes_(numeroNe, mes, ano, mapaRecibos) {
  var competencia = MESES_ABREV_CRONOGRAMA_[mes - 1] + '.' + String(ano).slice(-2);
  var recibos = mapaRecibos[numeroNe + '|' + competencia] || [];
  if (!recibos.length) return 'Previsto';
  var algumPago = recibos.some(function (r) { return String(r.status || '').toUpperCase() === 'PAGO'; });
  if (algumPago) return 'Pago';
  var algumLiquidado = recibos.some(function (r) { return /LIQUID/i.test(String(r.status || '')); });
  if (algumLiquidado) return 'Liquidado';
  return 'Em processamento';
}

/**
 * Listagem própria de Notas de Empenho (Funcionalidade 5, item 4 - Should):
 * um card por número de NE (agrupando original + reforços), com o valor
 * atual já calculado (bruto - liquidado nos Recibos) e o alerta de "abaixo
 * da parcela mensal da fonte". Transversal - todos os perfis veem tudo.
 */
function listarNotasEmpenho(session, params) {
  params = params || {};
  var sofs = sheetToObjects_(getSheet_(SHEETS.SOF));
  var sofsPorId = {};
  sofs.forEach(function (s) { sofsPorId[s.id] = s; });

  var unidadesPorId = {};
  todasUnidadesComCache_().forEach(function (u) { unidadesPorId[u.id] = u; });

  var fontesPorSof = agruparFontesPorSof_();
  var valorLiquidadoPorNe = valorLiquidadoAgrupadoPorNe_();
  var cronogramaPorNeId = agruparCronogramaPorNotaEmpenho_();
  var mapaRecibosPorNeCompetencia = recibosPorNeECompetencia_();
  var linhas = todasNotasEmpenhoComCache_();

  var grupos = {};
  linhas.forEach(function (n) {
    var chave = n.numero_ne;
    if (!chave) return;
    if (!grupos[chave]) grupos[chave] = { numero_ne: chave, sof_id: n.sof_id, fonte: n.fonte, valor: 0, arquivos: [], original_id: null, reforcos: [] };
    grupos[chave].valor += toNumber_(n.valor);
    if (n.arquivo_url) grupos[chave].arquivos.push({ tipo: n.tipo, url: n.arquivo_url, data: n.data_criacao });
    if (n.tipo === 'original') grupos[chave].original_id = n.id;
    else grupos[chave].reforcos.push({ id: n.id, mes_referencia: n.mes_referencia ? Number(n.mes_referencia) : null });
  });

  var resultado = Object.keys(grupos).map(function (numeroNe) {
    var grupo = grupos[numeroNe];
    var sof = sofsPorId[grupo.sof_id];
    var unidade = sof ? unidadesPorId[sof.unidade_id] : null;
    var fontesDoSof = fontesPorSof[grupo.sof_id] || [];
    var fontesDaMesmaFonte = fontesDoSof.filter(function (f) { return f.fonte === grupo.fonte; });
    var parcelaMensalRef = fontesDaMesmaFonte
      .reduce(function (soma, f) { return soma + toNumber_(f.parcela_mensal); }, 0);
    // SOF de pagamento único (só 1 mês preenchido no cronograma da fonte, ou
    // nenhum) não é um desembolso recorrente - o alerta "abaixo do previsto"
    // só faz sentido pra fontes com mais de 1 mês no cronograma.
    var mesesPreenchidosFonte = fontesDaMesmaFonte.reduce(function (soma, f) {
      return soma + (f.cronograma || []).filter(function (c) { return toNumber_(c.valor) > 0; }).length;
    }, 0);
    var valorLiquidado = valorLiquidadoPorNe[numeroNe] || 0;
    var valorAtual = grupo.valor - valorLiquidado;

    var ano = Number(String(numeroNe).substring(0, 4)) || new Date().getFullYear();
    var cronogramaBase = cronogramaPorNeId[grupo.original_id] || [];
    var cronograma = cronogramaBase.map(function (c) {
      var reforcosDoMes = grupo.reforcos.filter(function (r) { return r.mes_referencia === c.mes; });
      return {
        mes: c.mes,
        valor: c.valor,
        situacao: situacaoCronogramaMes_(numeroNe, c.mes, ano, mapaRecibosPorNeCompetencia),
        reforco: reforcosDoMes.length > 0
      };
    });

    return {
      numero_ne: numeroNe,
      sof_id: grupo.sof_id,
      fonte: grupo.fonte,
      sof_sei: sof ? sof.sei : '',
      sof_numero: sof ? sof.sof_numero : '',
      sof_objeto: sof ? sof.objeto : '',
      sof_unidade_id: sof ? sof.unidade_id : '',
      sof_oss: sof ? sof.oss_snapshot : '',
      sof_dea: sof ? sof.dea : '',
      sof_tipo_unidade: unidade ? unidade.tipo : '',
      unidade_nome: unidade ? unidade.nome : '',
      valor_bruto: grupo.valor,
      valor_liquidado: valorLiquidado,
      valor_atual: valorAtual,
      parcela_mensal_referencia: parcelaMensalRef,
      alerta: parcelaMensalRef > 0 && valorAtual < parcelaMensalRef && mesesPreenchidosFonte > 1,
      arquivos: grupo.arquivos,
      ano: ano,
      cronograma: cronograma
    };
  });

  var unidadeIds = paraArrayFiltro_(params.unidade_id);
  if (unidadeIds.length) resultado = resultado.filter(function (g) { return unidadeIds.indexOf(String(g.sof_unidade_id)) !== -1; });

  var fonteValores = paraArrayFiltro_(params.fonte);
  if (fonteValores.length) resultado = resultado.filter(function (g) { return fonteValores.indexOf(g.fonte) !== -1; });

  var ossValores = paraArrayFiltro_(params.oss);
  if (ossValores.length) resultado = resultado.filter(function (g) { return ossValores.indexOf(g.sof_oss) !== -1; });

  var objetoValores = paraArrayFiltro_(params.objeto);
  if (objetoValores.length) resultado = resultado.filter(function (g) { return objetoValores.indexOf(g.sof_objeto) !== -1; });

  var tipoUnidadeValores = paraArrayFiltro_(params.tipo_unidade);
  if (tipoUnidadeValores.length) resultado = resultado.filter(function (g) { return tipoUnidadeValores.indexOf(g.sof_tipo_unidade) !== -1; });

  var deaValores = paraArrayFiltro_(params.dea);
  if (deaValores.length) resultado = resultado.filter(function (g) { return deaValores.indexOf(g.sof_dea) !== -1; });

  var busca = sanitizeString_(params.busca, 200).toLowerCase();
  if (busca) {
    resultado = resultado.filter(function (g) {
      return Object.keys(g).some(function (campo) {
        var valor = g[campo];
        if (valor === null || valor === undefined || typeof valor === 'object') return false;
        return String(valor).toLowerCase().indexOf(busca) !== -1;
      });
    });
  }

  resultado.sort(function (a, b) {
    if (a.alerta !== b.alerta) return a.alerta ? -1 : 1;
    return a.numero_ne < b.numero_ne ? -1 : 1;
  });

  var pageSize = Number(params.pageSize) || 20;
  var page = Number(params.page) || 1;
  var total = resultado.length;
  var start = (page - 1) * pageSize;
  var pageRows = resultado.slice(start, start + pageSize);

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize });
}

function totalEmpenhadoSof_(sofId) {
  var rows = todasNotasEmpenhoComCache_().filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  return rows.reduce(function (soma, n) { return soma + toNumber_(n.valor); }, 0);
}
