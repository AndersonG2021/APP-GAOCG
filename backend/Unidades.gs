/**
 * GAOCG App - Cadastro Mestre de Unidades (Funcionalidade 2), incluindo o
 * Valor do Contrato de Gestão e os Termos Aditivos (T.A.s) vinculados.
 */

/** Todas as linhas de UnidadesTA de uma unidade. */
function listarTasPorUnidade_(unidadeId) {
  return sheetToObjects_(getSheet_(SHEETS.UNIDADES_TA))
    .filter(function (t) { return String(t.unidade_id) === String(unidadeId); })
    .map(function (t) { delete t._row; return t; });
}

/** Todas as linhas de UnidadesTA, agrupadas por unidade_id. Usado por listarUnidades pra evitar N+1. */
function agruparTasPorUnidade_() {
  var linhas = sheetToObjects_(getSheet_(SHEETS.UNIDADES_TA));
  var mapa = {};
  linhas.forEach(function (t) {
    delete t._row;
    (mapa[t.unidade_id] = mapa[t.unidade_id] || []).push(t);
  });
  return mapa;
}

/** "Parcela mensal" = Valor do C.G. (único, não repetido por T.A.) + soma de todos os Valores de T.A. */
function parcelaMensalTotal_(valorContratoGestao, tas) {
  var somaTas = (tas || []).reduce(function (soma, t) { return soma + toNumber_(t.valor_ta); }, 0);
  return toNumber_(valorContratoGestao) + somaTas;
}

/**
 * Substitui por completo os T.A.s de uma unidade (apaga os antigos e recria a
 * partir do array enviado) - mesmo princípio de substituirFontesDoSof_ em
 * Sof.gs. Ao contrário das Fontes do SOF, a lista pode ficar vazia (unidade
 * sem Termo Aditivo ainda).
 */
function substituirTasDaUnidade_(unidadeId, tasArray, session) {
  var sheet = getSheet_(SHEETS.UNIDADES_TA);
  var existentes = sheetToObjects_(sheet).filter(function (t) { return String(t.unidade_id) === String(unidadeId); });
  existentes
    .sort(function (a, b) { return b._row - a._row; })
    .forEach(function (t) { deleteRow_(sheet, t._row); });

  (tasArray || []).forEach(function (item) {
    appendObjectRow_(sheet, {
      id: proximoId_('UnidadesTA'),
      unidade_id: unidadeId,
      objeto_ta: sanitizeString_(item.objeto_ta, 200),
      numero_ta: sanitizeString_(item.numero_ta, 20),
      valor_ta: toNumber_(item.valor_ta),
      criado_por: session.id,
      data_criacao: nowIso_()
    });
  });
}

function listarUnidades(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.UNIDADES)).map(function (u) {
    delete u._row;
    return u;
  });
  if (toBool_(params.somenteAtivas)) {
    rows = rows.filter(function (u) { return toBool_(u.ativo); });
  }

  var tasPorUnidade = agruparTasPorUnidade_();
  rows.forEach(function (u) {
    var tas = tasPorUnidade[u.id] || [];
    u.tas = tas;
    u.parcela_mensal_total = parcelaMensalTotal_(u.valor_contrato_gestao, tas);
  });

  return ok_(rows);
}

function criarUnidade(session, dados) {
  dados = dados || {};
  var nome = sanitizeString_(dados.nome, 200);
  var cnpj = sanitizeString_(dados.cnpj, 20);
  var contratoGestao = sanitizeString_(dados.contrato_gestao, 100);

  if (!nome) return fail_('Informe o nome da unidade.');
  if (!validarCnpj_(cnpj)) return fail_('CNPJ inválido.');
  if (!contratoGestao) return fail_('Informe o contrato de gestão.');

  var sheet = getSheet_(SHEETS.UNIDADES);
  var existentes = sheetToObjects_(sheet);
  var cnpjLimpo = cnpj.replace(/[^\d]/g, '');
  var duplicado = existentes.some(function (u) {
    return String(u.cnpj).replace(/[^\d]/g, '') === cnpjLimpo && String(u.contrato_gestao) === contratoGestao;
  });
  if (duplicado) return fail_('Já existe uma unidade cadastrada com este CNPJ e contrato de gestão.');

  var id = proximoId_('Unidades');
  var novo = {
    id: id,
    nome: nome,
    tipo: sanitizeString_(dados.tipo, 50),
    oss: sanitizeString_(dados.oss, 50),
    cnpj: cnpj,
    contrato_gestao: contratoGestao,
    valor_contrato_gestao: toNumber_(dados.valor_contrato_gestao),
    classificacao_orcamentaria: sanitizeString_(dados.classificacao_orcamentaria, 200),
    acao: sanitizeString_(dados.acao, 50),
    subacao: sanitizeString_(dados.subacao, 50),
    gd: sanitizeString_(dados.gd, 50),
    ativo: true,
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(sheet, novo);
  substituirTasDaUnidade_(id, dados.tas, session);

  var tas = listarTasPorUnidade_(id);
  novo.tas = tas;
  novo.parcela_mensal_total = parcelaMensalTotal_(novo.valor_contrato_gestao, tas);
  return ok_(novo);
}

function atualizarUnidade(session, id, dados) {
  dados = dados || {};
  var sheet = getSheet_(SHEETS.UNIDADES);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Unidade não encontrada.');

  var campos = ['nome', 'tipo', 'oss', 'cnpj', 'contrato_gestao', 'classificacao_orcamentaria', 'acao', 'subacao', 'gd'];
  var atualizado = Object.assign({}, existente);
  campos.forEach(function (campo) {
    if (dados.hasOwnProperty(campo)) atualizado[campo] = sanitizeString_(dados[campo], 200);
  });
  if (dados.hasOwnProperty('valor_contrato_gestao')) atualizado.valor_contrato_gestao = toNumber_(dados.valor_contrato_gestao);

  if (atualizado.cnpj && !validarCnpj_(atualizado.cnpj)) return fail_('CNPJ inválido.');

  if (dados.hasOwnProperty('cnpj') || dados.hasOwnProperty('contrato_gestao')) {
    var cnpjLimpo = String(atualizado.cnpj).replace(/[^\d]/g, '');
    var outras = sheetToObjects_(sheet).filter(function (u) { return String(u.id) !== String(id); });
    var duplicado = outras.some(function (u) {
      return String(u.cnpj).replace(/[^\d]/g, '') === cnpjLimpo && String(u.contrato_gestao) === atualizado.contrato_gestao;
    });
    if (duplicado) return fail_('Já existe outra unidade cadastrada com este CNPJ e contrato de gestão.');
  }

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  if (dados.hasOwnProperty('tas')) substituirTasDaUnidade_(id, dados.tas, session);

  var tas = listarTasPorUnidade_(id);
  atualizado.tas = tas;
  atualizado.parcela_mensal_total = parcelaMensalTotal_(atualizado.valor_contrato_gestao, tas);
  return ok_(atualizado);
}

/** Inativar não afeta processos (SOF/Recibo) já criados - eles guardam snapshot, não referência viva. */
function inativarUnidade(session, id) {
  var sheet = getSheet_(SHEETS.UNIDADES);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Unidade não encontrada.');

  var atualizado = Object.assign({}, existente, { ativo: false });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  return ok_({ id: id, ativo: false });
}

function reativarUnidade(session, id) {
  var sheet = getSheet_(SHEETS.UNIDADES);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Unidade não encontrada.');

  var atualizado = Object.assign({}, existente, { ativo: true });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  return ok_({ id: id, ativo: true });
}
