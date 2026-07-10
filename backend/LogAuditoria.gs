/**
 * GAOCG App - Log de Auditoria (Funcionalidade 6). Cobre 100% das edições
 * feitas dentro do sistema. Nunca editável/removível por nenhum perfil.
 * A migração inicial de Recibos é a única exceção documentada e NÃO passa
 * por esta função (ver Recibos.gs / migrarRecibosHistorico).
 */

/**
 * Registra uma alteração de campo. Chamada uma vez por campo alterado.
 * fora_do_dono é calculado aqui a partir de quem edita x quem criou o processo
 * (donoProcesso = criado_por do processo).
 */
function registrarLog_(session, tipoProcesso, processoId, donoProcesso, campo, valorAnterior, valorNovo) {
  var sheet = getSheet_(SHEETS.LOG_AUDITORIA);
  var foraDoDono = !!donoProcesso && String(session.id) !== String(donoProcesso);
  appendObjectRow_(sheet, {
    id: proximoId_('LogAuditoria'),
    usuario_id: session.id,
    perfil_usuario: session.perfil,
    data_hora: nowIso_(),
    tipo_processo: tipoProcesso,
    processo_id: processoId,
    dono_processo: donoProcesso || '',
    campo_alterado: campo,
    valor_anterior: valorAnterior === undefined || valorAnterior === null ? '' : String(valorAnterior),
    valor_novo: valorNovo === undefined || valorNovo === null ? '' : String(valorNovo),
    fora_do_dono: foraDoDono,
    origem: 'edicao_manual'
  });
}

/** Compara objeto antigo x novo e grava uma linha de log por campo que mudou. */
function registrarDiferencas_(session, tipoProcesso, processoId, donoProcesso, antigo, novo, camposIgnorados) {
  camposIgnorados = camposIgnorados || [];
  Object.keys(novo).forEach(function (campo) {
    if (camposIgnorados.indexOf(campo) !== -1) return;
    if (campo === '_row') return;
    var valorAntigo = antigo.hasOwnProperty(campo) ? antigo[campo] : '';
    var valorNovo = novo[campo];
    if (String(valorAntigo) !== String(valorNovo)) {
      registrarLog_(session, tipoProcesso, processoId, donoProcesso, campo, valorAntigo, valorNovo);
    }
  });
}

/**
 * Gerente vê o log completo (com filtros). Analista vê apenas as próprias ações.
 */
function listarLogAuditoria(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.LOG_AUDITORIA));
  rows.forEach(function (r) { delete r._row; });

  if (session.perfil !== 'gerente') {
    rows = rows.filter(function (r) { return String(r.usuario_id) === String(session.id); });
  } else {
    if (params.usuario_id) rows = rows.filter(function (r) { return String(r.usuario_id) === String(params.usuario_id); });
    if (params.tipo_processo) rows = rows.filter(function (r) { return r.tipo_processo === params.tipo_processo; });
    if (params.processo_id) rows = rows.filter(function (r) { return String(r.processo_id) === String(params.processo_id); });
    if (params.fora_do_dono === true || params.fora_do_dono === 'true') {
      rows = rows.filter(function (r) { return toBool_(r.fora_do_dono); });
    }
    if (params.data_inicio) rows = rows.filter(function (r) { return r.data_hora >= params.data_inicio; });
    if (params.data_fim) rows = rows.filter(function (r) { return r.data_hora <= params.data_fim; });
  }

  rows.sort(function (a, b) { return b.data_hora < a.data_hora ? -1 : 1; });

  var pageSize = Number(params.pageSize) || 50;
  var page = Number(params.page) || 1;
  var total = rows.length;
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize });
}

/** Indicador do dashboard do gerente: contagem de edições fora_do_dono no período. */
function contarEdicoesForaDono_(dataInicio, dataFim) {
  var rows = sheetToObjects_(getSheet_(SHEETS.LOG_AUDITORIA));
  return rows.filter(function (r) {
    if (!toBool_(r.fora_do_dono)) return false;
    if (dataInicio && r.data_hora < dataInicio) return false;
    if (dataFim && r.data_hora > dataFim) return false;
    return true;
  }).length;
}
