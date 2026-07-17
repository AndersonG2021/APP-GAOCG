/**
 * GAOCG App - Dashboard e Indicadores (Funcionalidade 8).
 */

/**
 * Recibo: indicadores do período selecionado (padrão mês atual, via
 * competencia). Soma valor_pago/valor_liquidado linha a linha (nunca sobre
 * parcela_contratual, que se repete em cada linha de uma mesma parcela dividida).
 * recibosCarregados é opcional - ver obterDashboard (evita reler a aba Recibos
 * mais de uma vez por chamada).
 */
function dashboardRecibos_(session, competencia, recibosCarregados) {
  var rows = recibosCarregados || sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  if (competencia) rows = rows.filter(function (r) { return r.competencia === competencia; });

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

/**
 * SOF: contagem/listagem de processos com NE pendente de emissão (possui_ne = false).
 * sofsCarregados é opcional - ver obterDashboard.
 */
function dashboardSofPendenteNe_(session, sofsCarregados) {
  var rows = (sofsCarregados || sheetToObjects_(getSheet_(SHEETS.SOF)))
    .filter(function (s) { return !toBool_(s.possui_ne); });
  return { total_pendentes: rows.length, itens: rows };
}

/**
 * Processos (SOF e Recibo) atualmente destacados como "parados" (>5 dias, sem
 * pausa_contagem_parado). sofsCarregados/recibosCarregados são opcionais - ver
 * obterDashboard (evita reler SOF/Recibos, que já tinham sido lidos pelos
 * outros dois indicadores desta mesma chamada).
 */
function dashboardParados_(session, sofsCarregados, recibosCarregados) {
  // Uma única leitura (com cache) de ListasPersonalizadas para todas as linhas
  // de SOF+Recibo, em vez de uma por linha (ver RELATORIO_LENTIDAO_SOF.md).
  var listasCarregadas = todasOpcoesComCache_();

  var sofs = (sofsCarregados || sheetToObjects_(getSheet_(SHEETS.SOF))).map(function (s) {
    return Object.assign({ tipo_processo: 'SOF' }, s, calcularDestaqueParadoSof_(s, listasCarregadas));
  }).filter(function (s) { return s.destacar_parado; });

  var recibos = (recibosCarregados || sheetToObjects_(getSheet_(SHEETS.RECIBOS))).map(function (r) {
    return Object.assign({ tipo_processo: 'Recibo' }, r, calcularDestaqueParadoRecibo_(r, listasCarregadas));
  }).filter(function (r) { return r.destacar_parado; });

  return sofs.concat(recibos);
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

  // SOF e Recibos são lidos uma única vez aqui e repassados aos 3 indicadores
  // abaixo - antes, cada um relia a própria aba do zero (SOF 2x, Recibos 2x
  // numa chamada só).
  var sofs = sheetToObjects_(getSheet_(SHEETS.SOF));
  sofs.forEach(function (s) { delete s._row; });
  var recibos = sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  recibos.forEach(function (r) { delete r._row; });

  var resposta = {
    recibos: dashboardRecibos_(session, competencia, recibos),
    sof_ne_pendente: dashboardSofPendenteNe_(session, sofs),
    processos_parados: dashboardParados_(session, sofs, recibos)
  };

  // Indicador Could, só faz sentido para o gerente: nº de edições fora_do_dono no período.
  if (session.perfil === 'gerente') {
    resposta.edicoes_fora_do_dono = contarEdicoesForaDono_(params.data_inicio, params.data_fim);
  }

  return ok_(resposta);
}
