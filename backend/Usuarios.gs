/**
 * GAOCG App - Gestão de Usuários (Funcionalidade 9), exclusiva do perfil gerente.
 */

function requireGerente_(session) {
  if (!session || session.perfil !== 'gerente') {
    throw new Error('Acesso restrito ao perfil gerente.');
  }
}

function listarUsuarios(session) {
  requireGerente_(session);
  var rows = sheetToObjects_(getSheet_(SHEETS.USUARIOS)).map(function (u) {
    delete u._row;
    delete u.senha_hash;
    return u;
  });
  return ok_(rows);
}

function criarUsuario(session, dados) {
  requireGerente_(session);
  dados = dados || {};

  var nome = sanitizeString_(dados.nome, 200);
  var login = sanitizeString_(dados.login, 100);
  var senha = String(dados.senha || '');
  var perfil = dados.perfil === 'gerente' ? 'gerente' : 'analista';

  if (!nome || !login || !senha) return fail_('Preencha nome, login e senha.');
  if (senha.length < 6) return fail_('A senha deve ter pelo menos 6 caracteres.');

  var sheet = getSheet_(SHEETS.USUARIOS);
  var existentes = sheetToObjects_(sheet);
  var duplicado = existentes.some(function (u) { return String(u.login).toLowerCase() === login.toLowerCase(); });
  if (duplicado) return fail_('Já existe um usuário com este login.');

  var id = proximoId_('Usuarios');
  var novo = {
    id: id,
    nome: nome,
    login: login,
    senha_hash: criarSenhaHash_(senha),
    perfil: perfil,
    ativo: true,
    data_criacao: nowIso_(),
    data_inativacao: ''
  };
  appendObjectRow_(sheet, novo);

  var resposta = Object.assign({}, novo);
  delete resposta.senha_hash;
  return ok_(resposta);
}

function atualizarUsuario(session, id, dados) {
  requireGerente_(session);
  dados = dados || {};
  var sheet = getSheet_(SHEETS.USUARIOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Usuário não encontrado.');

  var atualizado = Object.assign({}, existente);
  if (dados.hasOwnProperty('nome')) atualizado.nome = sanitizeString_(dados.nome, 200);
  if (dados.hasOwnProperty('perfil')) atualizado.perfil = dados.perfil === 'gerente' ? 'gerente' : 'analista';

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUsuario_(id);

  var resposta = Object.assign({}, atualizado);
  delete resposta.senha_hash;
  return ok_(resposta);
}

/** "Excluir" usuário = inativação (soft delete). Preserva histórico em LogAuditoria. */
function inativarUsuario(session, id) {
  requireGerente_(session);
  var sheet = getSheet_(SHEETS.USUARIOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Usuário não encontrado.');

  var atualizado = Object.assign({}, existente, { ativo: false, data_inativacao: nowIso_() });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUsuario_(id);
  return ok_({ id: id, ativo: false });
}

function redefinirSenha(session, id, novaSenha) {
  requireGerente_(session);
  if (!novaSenha || String(novaSenha).length < 6) {
    return fail_('A nova senha deve ter pelo menos 6 caracteres.');
  }
  var sheet = getSheet_(SHEETS.USUARIOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Usuário não encontrado.');

  var atualizado = Object.assign({}, existente, { senha_hash: criarSenhaHash_(String(novaSenha)) });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUsuario_(id);
  return ok_({ id: id });
}
