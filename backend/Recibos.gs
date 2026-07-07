/**
 * GAOCG App - Gestão de Processos de Recibo (Funcionalidade 4, Anexo II),
 * incluindo rateio e a migração do histórico (executada uma única vez, no
 * lançamento do sistema).
 */

var RECIBO_FRENTES = ['Recibo-UPA', 'Recibo-UPAE', 'Recibo-Hospital'];

function frenteDoRecibo_(session, dados) {
  if (session.perfil === 'gerente') {
    var frente = dados && dados.frente ? dados.frente : RECIBO_FRENTES[0];
    return RECIBO_FRENTES.indexOf(frente) !== -1 ? frente : RECIBO_FRENTES[0];
  }
  return session.frente;
}

function diasSemAlteracaoRecibo_(dataIso) {
  return diasSemAlteracao_(dataIso);
}

function calcularDestaqueParadoRecibo_(recibo) {
  var dias = diasSemAlteracao_(recibo.data_ultima_alteracao_status || recibo.data_criacao);
  var pausado = opcaoTemPausaContagem_('STATUS_RECIBO', recibo.frente, recibo.status);
  return { dias_parado: dias, destacar_parado: dias > 5 && !pausado && !toBool_(recibo.visualizado_apos_alerta) };
}

/**
 * Recalcula alerta_divergencia_valores para todas as linhas de um grupo de
 * rateio (ou para uma única linha avulsa, se rateioGrupoId for vazio).
 * Regras: (a) valor_liquidado != valor_pago da própria linha; ou (b) soma dos
 * valor_pago do grupo != parcela_contratual. Ambos são apenas informativos.
 */
function recalcularAlertaRecibo_(rateioGrupoId, unidadeId) {
  var sheet = getSheet_(SHEETS.RECIBOS);
  var todos = sheetToObjects_(sheet);
  var linhas = rateioGrupoId
    ? todos.filter(function (r) { return String(r.rateio_grupo_id) === String(rateioGrupoId); })
    : [];

  if (!linhas.length) return;

  var somaPago = linhas.reduce(function (s, r) { return s + toNumber_(r.valor_pago); }, 0);
  var parcelaContratual = toNumber_(linhas[0].parcela_contratual);
  var divergenciaSoma = Math.abs(somaPago - parcelaContratual) > 0.01;

  linhas.forEach(function (linha) {
    var divergenciaLinha = Math.abs(toNumber_(linha.valor_liquidado) - toNumber_(linha.valor_pago)) > 0.01;
    var alerta = divergenciaLinha || divergenciaSoma;
    if (toBool_(linha.alerta_divergencia_valores) !== alerta) {
      var atualizado = Object.assign({}, linha, { alerta_divergencia_valores: alerta });
      var rowIndex = linha._row;
      delete atualizado._row;
      updateObjectRow_(sheet, rowIndex, atualizado);
    }
  });
}

function montarLinhaRecibo_(session, dados, unidade) {
  return {
    unidade_id: dados.unidade_id,
    oss_snapshot: isNonEmpty_(dados.oss_snapshot) ? sanitizeString_(dados.oss_snapshot, 200) : (unidade ? unidade.oss : ''),
    cnpj_snapshot: isNonEmpty_(dados.cnpj_snapshot) ? sanitizeString_(dados.cnpj_snapshot, 30) : (unidade ? unidade.cnpj : ''),
    tipo_unidade: sanitizeString_(dados.tipo_unidade, 50),
    objeto: sanitizeString_(dados.objeto, 500),
    instrumento: sanitizeString_(dados.instrumento, 100),
    parcela_contratual: toNumber_(dados.parcela_contratual),
    fonte: sanitizeString_(dados.fonte, 50),
    nota_empenho: sanitizeString_(dados.nota_empenho, 50),
    competencia: sanitizeString_(dados.competencia, 20),
    valor_liquidado: toNumber_(dados.valor_liquidado),
    valor_pago: toNumber_(dados.valor_pago),
    ordem_bancaria: sanitizeString_(dados.ordem_bancaria, 50),
    numero_processo: sanitizeString_(dados.numero_processo, 50),
    observacao: sanitizeString_(dados.observacao, 2000),
    status: sanitizeString_(dados.status, 200),
    rateio_grupo_id: sanitizeString_(dados.rateio_grupo_id, 50),
    percentual_rateio: dados.percentual_rateio === undefined || dados.percentual_rateio === '' ? '' : toNumber_(dados.percentual_rateio),
    frente: frenteDoRecibo_(session, dados),
    completo: toBool_(dados.completo)
  };
}

/** Cria um único recibo (sem rateio, ou uma linha adicional de um rateio_grupo_id já existente). */
function criarRecibo(session, dados) {
  dados = dados || {};
  if (!dados.unidade_id) return fail_('Selecione a unidade.');
  var unidade = findById_(getSheet_(SHEETS.UNIDADES), dados.unidade_id);
  if (!unidade) return fail_('Unidade não encontrada.');

  var linha = montarLinhaRecibo_(session, dados, unidade);
  var id = proximoId_('Recibos');
  var novo = Object.assign({ id: id }, linha, {
    divergente_da_unidade: false,
    alerta_divergencia_valores: false,
    origem: 'manual',
    criado_por: session.id,
    data_criacao: nowIso_(),
    data_ultima_alteracao_status: nowIso_(),
    visualizado_apos_alerta: true
  });
  novo.divergente_da_unidade = String(novo.oss_snapshot) !== String(unidade.oss) || String(novo.cnpj_snapshot) !== String(unidade.cnpj);

  appendObjectRow_(getSheet_(SHEETS.RECIBOS), novo);
  registrarLog_(session, 'Recibo', id, novo.frente, 'CRIACAO', '', 'Processo criado');
  if (novo.rateio_grupo_id) recalcularAlertaRecibo_(novo.rateio_grupo_id);
  return ok_(novo);
}

/**
 * Cria um grupo de rateio completo de uma vez (duas ou mais parcelas
 * vinculadas ao mesmo rateio_grupo_id). Não exige que a soma dos percentuais
 * feche 100% - é informativo.
 */
function criarGrupoRateioRecibo(session, dadosBase, parcelas) {
  if (!parcelas || parcelas.length < 2) return fail_('Informe ao menos duas parcelas para o rateio.');
  var unidade = findById_(getSheet_(SHEETS.UNIDADES), dadosBase.unidade_id);
  if (!unidade) return fail_('Unidade não encontrada.');

  var rateioGrupoId = proximoId_('Recibos') + '-RT';
  var criados = [];
  var sheet = getSheet_(SHEETS.RECIBOS);

  parcelas.forEach(function (parcela) {
    var combinado = Object.assign({}, dadosBase, parcela, { rateio_grupo_id: rateioGrupoId });
    var linha = montarLinhaRecibo_(session, combinado, unidade);
    var id = proximoId_('Recibos');
    var novo = Object.assign({ id: id }, linha, {
      divergente_da_unidade: String(linha.oss_snapshot) !== String(unidade.oss) || String(linha.cnpj_snapshot) !== String(unidade.cnpj),
      alerta_divergencia_valores: false,
      origem: 'manual',
      criado_por: session.id,
      data_criacao: nowIso_(),
      data_ultima_alteracao_status: nowIso_(),
      visualizado_apos_alerta: true
    });
    appendObjectRow_(sheet, novo);
    registrarLog_(session, 'Recibo', id, novo.frente, 'CRIACAO', '', 'Parcela de rateio criada (grupo ' + rateioGrupoId + ')');
    criados.push(novo);
  });

  recalcularAlertaRecibo_(rateioGrupoId);
  return ok_(criados);
}

function atualizarRecibo(session, id, dados) {
  dados = dados || {};
  var sheet = getSheet_(SHEETS.RECIBOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Recibo não encontrado.');

  var foraDaFrente = session.perfil !== 'gerente' && session.frente !== existente.frente;
  if (foraDaFrente && dados.confirmado !== true) {
    return ok_({ precisaConfirmacao: true, frente_processo: existente.frente });
  }

  var antigo = Object.assign({}, existente);
  var atualizado = Object.assign({}, existente);

  var camposTexto = ['tipo_unidade', 'objeto', 'instrumento', 'fonte', 'nota_empenho', 'competencia',
    'ordem_bancaria', 'numero_processo', 'observacao', 'status', 'oss_snapshot', 'cnpj_snapshot'];
  camposTexto.forEach(function (campo) {
    if (dados.hasOwnProperty(campo)) atualizado[campo] = sanitizeString_(dados[campo], 2000);
  });
  ['parcela_contratual', 'valor_liquidado', 'valor_pago', 'percentual_rateio'].forEach(function (campo) {
    if (dados.hasOwnProperty(campo)) atualizado[campo] = toNumber_(dados[campo]);
  });
  if (dados.hasOwnProperty('completo')) atualizado.completo = toBool_(dados.completo);

  if (atualizado.status !== existente.status) {
    atualizado.data_ultima_alteracao_status = nowIso_();
    atualizado.visualizado_apos_alerta = false;
  }

  if (dados.hasOwnProperty('oss_snapshot') || dados.hasOwnProperty('cnpj_snapshot')) {
    var unidade = findById_(getSheet_(SHEETS.UNIDADES), atualizado.unidade_id);
    atualizado.divergente_da_unidade = !!unidade &&
      (String(atualizado.oss_snapshot || '') !== String(unidade.oss || '') || String(atualizado.cnpj_snapshot || '') !== String(unidade.cnpj || ''));
  }

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  registrarDiferencas_(session, 'Recibo', id, existente.frente, antigo, atualizado, ['_row']);

  if (atualizado.rateio_grupo_id) recalcularAlertaRecibo_(atualizado.rateio_grupo_id);
  else recalcularAlertaRecibo_(null);

  // Para linha avulsa (sem rateio), o alerta de liquidado x pago é recalculado direto aqui,
  // já que recalcularAlertaRecibo_ só age sobre grupos com rateio_grupo_id preenchido.
  if (!atualizado.rateio_grupo_id) {
    var alerta = Math.abs(toNumber_(atualizado.valor_liquidado) - toNumber_(atualizado.valor_pago)) > 0.01;
    if (toBool_(atualizado.alerta_divergencia_valores) !== alerta) {
      atualizado.alerta_divergencia_valores = alerta;
      updateObjectRow_(sheet, rowIndex, atualizado);
    }
  }

  return ok_(atualizado);
}

function marcarReciboVisualizado(session, id) {
  var sheet = getSheet_(SHEETS.RECIBOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Recibo não encontrado.');
  var atualizado = Object.assign({}, existente, { visualizado_apos_alerta: true });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  return ok_({ id: id });
}

function listarRecibos(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  rows.forEach(function (r) { delete r._row; });

  if (params.unidade_id) rows = rows.filter(function (r) { return String(r.unidade_id) === String(params.unidade_id); });
  if (params.oss) rows = rows.filter(function (r) { return String(r.oss_snapshot).toLowerCase() === String(params.oss).toLowerCase(); });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.competencia) rows = rows.filter(function (r) { return r.competencia === params.competencia; });
  if (params.fonte) rows = rows.filter(function (r) { return r.fonte === params.fonte; });
  if (params.frente) rows = rows.filter(function (r) { return r.frente === params.frente; });

  var busca = sanitizeString_(params.busca, 200).toLowerCase();
  if (busca) {
    rows = rows.filter(function (r) {
      return Object.keys(r).some(function (campo) {
        var valor = r[campo];
        if (valor === null || valor === undefined) return false;
        return String(valor).toLowerCase().indexOf(busca) !== -1;
      });
    });
  }

  rows.forEach(function (r) { Object.assign(r, calcularDestaqueParadoRecibo_(r)); });
  rows.sort(function (a, b) { return b.data_criacao < a.data_criacao ? -1 : 1; });

  var pageSize = Number(params.pageSize) || 20;
  var page = Number(params.page) || 1;
  var total = rows.length;
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize });
}

/**
 * Migração do histórico de Recibo (execução única, no lançamento do sistema).
 * NÃO gera entradas em LogAuditoria (decisão de negócio). Cada linha recebe
 * origem = 'importacao_inicial'. `linhas` deve trazer os mesmos campos de
 * Recibos (exceto id/origem/criado_por/data_criacao), com unidade_id já
 * resolvido contra o cadastro de Unidades (pré-condição: Unidades populada
 * antes desta rotina).
 */
function migrarRecibosHistorico(session, linhas) {
  requireGerente_(session);
  if (!linhas || !linhas.length) return fail_('Nenhuma linha para migrar.');

  var sheet = getSheet_(SHEETS.RECIBOS);
  var grupos = {};
  var criados = [];

  linhas.forEach(function (linha) {
    var id = proximoId_('Recibos');
    var novo = Object.assign({}, linha, {
      id: id,
      origem: 'importacao_inicial',
      criado_por: 'rotina_importacao_inicial',
      data_criacao: linha.data_criacao || nowIso_(),
      data_ultima_alteracao_status: linha.data_ultima_alteracao_status || nowIso_(),
      visualizado_apos_alerta: true,
      alerta_divergencia_valores: false,
      divergente_da_unidade: false
    });
    appendObjectRow_(sheet, novo);
    criados.push(novo);
    if (novo.rateio_grupo_id) grupos[novo.rateio_grupo_id] = true;
  });

  Object.keys(grupos).forEach(function (grupoId) { recalcularAlertaRecibo_(grupoId); });
  return ok_({ importados: criados.length });
}
