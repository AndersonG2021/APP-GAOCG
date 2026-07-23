/**
 * GAOCG App - Log de Auditoria (Funcionalidade 6). Cobre 100% das edições
 * feitas dentro do sistema. Nunca editável/removível por nenhum perfil.
 * A migração inicial de Recibos é a única exceção documentada e NÃO passa
 * por esta função (ver Recibos.gs / migrarRecibosHistorico).
 */

/**
 * Monta o objeto de uma linha de log sem gravar (id já reservado por quem
 * chama - proximoId_/proximosIds_) - usado tanto por registrarLog_ (uma
 * linha) quanto por registrarDiferencas_ (várias linhas de uma vez, ver
 * abaixo). fora_do_dono é calculado aqui a partir de quem edita x quem criou
 * o processo (donoProcesso = criado_por do processo).
 */
function montarLinhaLog_(id, session, tipoProcesso, processoId, donoProcesso, campo, valorAnterior, valorNovo) {
  var foraDoDono = !!donoProcesso && String(session.id) !== String(donoProcesso);
  return {
    id: id,
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
  };
}

/** Registra uma alteração de campo isolada (fora do fluxo de registrarDiferencas_). */
function registrarLog_(session, tipoProcesso, processoId, donoProcesso, campo, valorAnterior, valorNovo) {
  var id = proximoId_('LogAuditoria');
  appendObjectRow_(getSheet_(SHEETS.LOG_AUDITORIA), montarLinhaLog_(id, session, tipoProcesso, processoId, donoProcesso, campo, valorAnterior, valorNovo));
}

/**
 * Compara objeto antigo x novo e grava uma linha de log por campo que mudou,
 * reservando todos os IDs num único lock (proximosIds_) e escrevendo todas as
 * linhas numa única chamada (appendObjectRows_), em vez de um ciclo completo
 * de lock+append por campo. Antes disso, uma troca de andamento no SOF (só 1
 * campo do ponto de vista do usuário) podia gerar até 3 linhas de log
 * (andamento + data_ultima_alteracao_andamento + visualizado_apos_alerta,
 * os 2 últimos derivados/internos - ver camposIgnorados nos chamadores),
 * cada uma com seu próprio lock+leitura+escrita na aba Contadores só pra
 * gerar o ID, antes mesmo de escrever a linha em si. Ver PROGRESS.md
 * (lentidão ao trocar andamento).
 */
function registrarDiferencas_(session, tipoProcesso, processoId, donoProcesso, antigo, novo, camposIgnorados) {
  camposIgnorados = camposIgnorados || [];
  var mudancas = [];
  Object.keys(novo).forEach(function (campo) {
    if (camposIgnorados.indexOf(campo) !== -1) return;
    if (campo === '_row') return;
    var valorAntigo = antigo.hasOwnProperty(campo) ? antigo[campo] : '';
    var valorNovo = novo[campo];
    if (String(valorAntigo) !== String(valorNovo)) {
      mudancas.push({ campo: campo, valorAntigo: valorAntigo, valorNovo: valorNovo });
    }
  });
  if (!mudancas.length) return;

  var ids = proximosIds_('LogAuditoria', mudancas.length);
  var linhas = mudancas.map(function (m, i) {
    return montarLinhaLog_(ids[i], session, tipoProcesso, processoId, donoProcesso, m.campo, m.valorAntigo, m.valorNovo);
  });
  appendObjectRows_(getSheet_(SHEETS.LOG_AUDITORIA), linhas);
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
