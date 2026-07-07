/**
 * GAOCG App - Dashboard e Indicadores (Funcionalidade 8).
 */

/**
 * Recibo: indicadores do período selecionado (padrão mês atual, via
 * competencia). Soma valor_pago/valor_liquidado linha a linha (nunca sobre
 * parcela_contratual, que se repete em cada linha de um mesmo rateio).
 */
function dashboardRecibos_(session, competencia) {
  var rows = sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  if (competencia) rows = rows.filter(function (r) { return r.competencia === competencia; });
  if (session.perfil !== 'gerente') rows = rows.filter(function (r) { return r.frente === session.frente; });

  var porStatus = {};
  var totalLiquidado = 0;
  var totalPago = 0;

  rows.forEach(function (r) {
    var status = r.status || '(sem status)';
    if (!porStatus[status]) porStatus[status] = { quantidade: 0, valor_pago: 0, valor_liquidado: 0 };
    porStatus[status].quantidade++;
    porStatus[status].valor_pago += toNumber_(r.valor_pago);
    porStatus[status].valor_liquidado += toNumber_(r.valor_liquidado);
    totalLiquidado += toNumber_(r.valor_liquidado);
    totalPago += toNumber_(r.valor_pago);
  });

  return {
    competencia: competencia,
    total_recibos: rows.length,
    total_valor_liquidado: totalLiquidado,
    total_valor_pago: totalPago,
    por_status: porStatus
  };
}

/** SOF: contagem/listagem de processos com NE pendente de emissão (possui_ne = false). */
function dashboardSofPendenteNe_(session) {
  var rows = sheetToObjects_(getSheet_(SHEETS.SOF)).filter(function (s) { return !toBool_(s.possui_ne); });
  if (session.perfil !== 'gerente') rows = rows.filter(function (r) { return r.frente === session.frente; });
  rows.forEach(function (r) { delete r._row; });
  return { total_pendentes: rows.length, itens: rows };
}

/** Processos (SOF e Recibo) atualmente destacados como "parados" (>5 dias, sem pausa_contagem_parado). */
function dashboardParados_(session) {
  var sofs = sheetToObjects_(getSheet_(SHEETS.SOF)).map(function (s) {
    delete s._row;
    return Object.assign({ tipo_processo: 'SOF' }, s, calcularDestaqueParadoSof_(s));
  }).filter(function (s) { return s.destacar_parado; });

  var recibos = sheetToObjects_(getSheet_(SHEETS.RECIBOS)).map(function (r) {
    delete r._row;
    return Object.assign({ tipo_processo: 'Recibo' }, r, calcularDestaqueParadoRecibo_(r));
  }).filter(function (r) { return r.destacar_parado; });

  var todos = sofs.concat(recibos);
  if (session.perfil !== 'gerente') todos = todos.filter(function (p) { return p.frente === session.frente; });
  return todos;
}

/** Mantido em português independente do locale da planilha, para casar com a lista gerada em app.js (js/app.js). */
var MESES_ABREV_PT_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function competenciaAtual_() {
  var hoje = new Date();
  return MESES_ABREV_PT_[hoje.getMonth()] + '.' + Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'yy');
}

function obterDashboard(session, params) {
  params = params || {};
  var competencia = params.competencia || competenciaAtual_();

  var resposta = {
    recibos: dashboardRecibos_(session, competencia),
    sof_ne_pendente: dashboardSofPendenteNe_(session),
    processos_parados: dashboardParados_(session)
  };

  // Indicador Could, só faz sentido para o gerente: nº de edições fora_da_frente no período.
  if (session.perfil === 'gerente') {
    resposta.edicoes_fora_da_frente = contarEdicoesForaFrente_(params.data_inicio, params.data_fim);
  }

  return ok_(resposta);
}
