/**
 * GAOCG App - Controle de Notas de Empenho (Funcionalidade 5, Anexo III).
 * Sempre vinculada a um único SOF (1:N a partir do SOF).
 */

function listarNotasEmpenhoPorSof(session, sofId) {
  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  rows.forEach(function (n) { delete n._row; });
  rows.sort(function (a, b) { return a.data_criacao < b.data_criacao ? -1 : 1; });
  return ok_(rows);
}

/**
 * Para tipo=original, numero_ne é obrigatório. Para tipo=reforco, o número é
 * irrelevante para o controle - o que importa é o valor.
 * Ao gravar a primeira NE original de um SOF, marca SOF.possui_ne = true.
 */
function criarNotaEmpenho(session, dados) {
  dados = dados || {};
  var sofSheet = getSheet_(SHEETS.SOF);
  var sof = findById_(sofSheet, dados.sof_id);
  if (!sof) return fail_('SOF não encontrada.');

  var tipo = dados.tipo === 'reforco' ? 'reforco' : 'original';
  if (tipo === 'original' && !isNonEmpty_(dados.numero_ne)) {
    return fail_('Informe o número da Nota de Empenho original.');
  }
  var valor = toNumber_(dados.valor);
  if (valor <= 0) return fail_('Informe um valor válido para a Nota de Empenho.');

  var neSheet = getSheet_(SHEETS.NOTAS_EMPENHO);
  var id = proximoId_('NotasEmpenho');
  var nova = {
    id: id,
    sof_id: dados.sof_id,
    tipo: tipo,
    numero_ne: tipo === 'original' ? sanitizeString_(dados.numero_ne, 50) : sanitizeString_(dados.numero_ne, 50),
    valor: valor,
    periodo: sanitizeString_(dados.periodo, 100),
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(neSheet, nova);
  registrarLog_(session, 'NotaEmpenho', id, sof.frente, 'CRIACAO', '', tipo + ' - valor ' + valor);

  if (tipo === 'original' && !toBool_(sof.possui_ne)) {
    var atualizado = Object.assign({}, sof, { possui_ne: true });
    var rowIndex = sof._row;
    delete atualizado._row;
    updateObjectRow_(sofSheet, rowIndex, atualizado);
    registrarLog_(session, 'SOF', sof.id, sof.frente, 'possui_ne', 'false', 'true');
  }

  return ok_(nova);
}

/**
 * Listagem própria de Notas de Empenho (Funcionalidade 5, item 4 - Should),
 * com o SOF de origem já resolvido (SEI, Nº SOF, frente, unidade), filtrável
 * por unidade e período.
 */
function listarNotasEmpenho(session, params) {
  params = params || {};
  var sofs = sheetToObjects_(getSheet_(SHEETS.SOF));
  var sofsPorId = {};
  sofs.forEach(function (s) { sofsPorId[s.id] = s; });

  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).map(function (n) {
    delete n._row;
    var sof = sofsPorId[n.sof_id];
    return Object.assign({}, n, {
      sof_sei: sof ? sof.sei : '',
      sof_numero: sof ? sof.sof_numero : '',
      sof_frente: sof ? sof.frente : '',
      sof_unidade_id: sof ? sof.unidade_id : ''
    });
  });

  if (params.unidade_id) rows = rows.filter(function (n) { return String(n.sof_unidade_id) === String(params.unidade_id); });
  if (params.periodo) rows = rows.filter(function (n) { return n.periodo === params.periodo; });
  if (session.perfil !== 'gerente') rows = rows.filter(function (n) { return n.sof_frente === session.frente; });

  rows.sort(function (a, b) { return b.data_criacao < a.data_criacao ? -1 : 1; });
  return ok_(rows);
}

function totalEmpenhadoSof_(sofId) {
  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  return rows.reduce(function (soma, n) { return soma + toNumber_(n.valor); }, 0);
}
