/**
 * GAOCG App - Cadastro Mestre de Unidades (Funcionalidade 2).
 */

function listarUnidades(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.UNIDADES)).map(function (u) {
    delete u._row;
    return u;
  });
  if (toBool_(params.somenteAtivas)) {
    rows = rows.filter(function (u) { return toBool_(u.ativo); });
  }
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
    classificacao_orcamentaria: sanitizeString_(dados.classificacao_orcamentaria, 200),
    acao: sanitizeString_(dados.acao, 50),
    subacao: sanitizeString_(dados.subacao, 50),
    gd: sanitizeString_(dados.gd, 50),
    ativo: true,
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(sheet, novo);
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
