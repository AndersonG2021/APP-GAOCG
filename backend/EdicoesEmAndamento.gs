/**
 * GAOCG App - Aviso de Edição Simultânea (Funcionalidade 10).
 * Sem expiração automática por tempo: a decisão de "Sair" ou "Continuar mesmo
 * assim" é sempre manual e imediata de quem encontra o aviso.
 */

function encontrarEdicaoAtiva_(tipoProcesso, processoId) {
  var sheet = getSheet_(SHEETS.EDICOES_EM_ANDAMENTO);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === tipoProcesso && String(data[i][1]) === String(processoId)) {
      var obj = { _row: i + 1 };
      headers.forEach(function (h, idx) { obj[h] = normalizeCellValue_(data[i][idx]); });
      return obj;
    }
  }
  return null;
}

/**
 * Chamada ao abrir a tela de edição. Se já existe um editor ativo (outro
 * usuário), retorna aviso informativo (não bloqueia). O próprio front decide,
 * com base na resposta, se abre direto ou exibe o modal de "Sair"/"Continuar".
 */
function abrirEdicao(session, tipoProcesso, processoId) {
  if (!tipoProcesso || !processoId) return fail_('Parâmetros inválidos.');
  var sheet = getSheet_(SHEETS.EDICOES_EM_ANDAMENTO);
  var existente = encontrarEdicaoAtiva_(tipoProcesso, processoId);

  if (existente && String(existente.usuario_id) !== String(session.id)) {
    var usuarioEditor = findById_(getSheet_(SHEETS.USUARIOS), existente.usuario_id);
    return ok_({
      emEdicaoPorOutro: true,
      usuario_nome: usuarioEditor ? usuarioEditor.nome : 'outro usuário',
      iniciado_em: existente.iniciado_em
    });
  }

  var agora = nowIso_();
  if (existente) {
    var atualizado = { tipo_processo: tipoProcesso, processo_id: processoId, usuario_id: session.id, iniciado_em: existente.iniciado_em, ultimo_heartbeat: agora };
    var rowIndex = existente._row;
    delete atualizado._row;
    updateObjectRow_(sheet, rowIndex, atualizado);
  } else {
    appendObjectRow_(sheet, { tipo_processo: tipoProcesso, processo_id: processoId, usuario_id: session.id, iniciado_em: agora, ultimo_heartbeat: agora });
  }
  return ok_({ emEdicaoPorOutro: false });
}

/** Usuário B optou por "Continuar mesmo assim": assume a marcação de edição sem bloquear ninguém. */
function assumirEdicao(session, tipoProcesso, processoId) {
  return abrirEdicaoForcado_(session, tipoProcesso, processoId);
}

function abrirEdicaoForcado_(session, tipoProcesso, processoId) {
  var sheet = getSheet_(SHEETS.EDICOES_EM_ANDAMENTO);
  var existente = encontrarEdicaoAtiva_(tipoProcesso, processoId);
  var agora = nowIso_();
  if (existente) {
    var atualizado = { tipo_processo: tipoProcesso, processo_id: processoId, usuario_id: session.id, iniciado_em: agora, ultimo_heartbeat: agora };
    var rowIndex = existente._row;
    delete atualizado._row;
    updateObjectRow_(sheet, rowIndex, atualizado);
  } else {
    appendObjectRow_(sheet, { tipo_processo: tipoProcesso, processo_id: processoId, usuario_id: session.id, iniciado_em: agora, ultimo_heartbeat: agora });
  }
  return ok_({ emEdicaoPorOutro: false });
}

/** Chamada ao salvar ou sair explicitamente da tela de edição. */
function liberarEdicao(session, tipoProcesso, processoId) {
  var existente = encontrarEdicaoAtiva_(tipoProcesso, processoId);
  if (existente) {
    deleteRow_(getSheet_(SHEETS.EDICOES_EM_ANDAMENTO), existente._row);
  }
  return ok_({});
}
