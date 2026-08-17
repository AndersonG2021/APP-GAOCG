/**
 * GAOCG App - Gestão de Usuários (Funcionalidade 9), exclusiva dos perfis
 * gerente e administrador (ver requireGerente_ logo abaixo).
 */

/**
 * Perfis válidos, em ordem crescente de acesso. 'administrador' foi
 * acrescentado na sessão 2026-08-14 (pedido do usuário: "Administrador do
 * Aplicativo" com acesso a tudo) - ver requireGerente_/requireAdministrador_
 * e perfilValidado_ abaixo.
 */
var PERFIS_VALIDOS_ = ['analista', 'gerente', 'administrador'];

/**
 * gerente OU administrador (Administrador herda tudo que Gerente tem, e
 * mais - ver requireAdministrador_ para as ações exclusivas dele). Mantido
 * com esse nome porque é chamado de vários outros arquivos (Recibos.gs,
 * ListasPersonalizadas.gs) - trocar o nome exigiria mexer em todos.
 */
function requireGerente_(session) {
  if (!session || (session.perfil !== 'gerente' && session.perfil !== 'administrador')) {
    throw new Error('Acesso restrito ao perfil gerente.');
  }
}

/** Exclusivo do Administrador do Aplicativo - nem Gerente passa aqui. */
function requireAdministrador_(session) {
  if (!session || session.perfil !== 'administrador') {
    throw new Error('Acesso restrito ao Administrador do Aplicativo.');
  }
}

/**
 * A conta do Administrador do Aplicativo fica invisível na tela de Usuários
 * pra quem não for administrador também (sessão 2026-08-14, pedido do
 * usuário) - Gerente continua vendo/gerenciando Analista/Gerente
 * normalmente, só não enxerga que existe um Administrador.
 */
function listarUsuarios(session) {
  requireGerente_(session);
  var rows = sheetToObjects_(getSheet_(SHEETS.USUARIOS)).map(function (u) {
    delete u._row;
    delete u.senha_hash;
    return u;
  });
  if (session.perfil !== 'administrador') {
    rows = rows.filter(function (u) { return u.perfil !== 'administrador'; });
  }
  return ok_(rows);
}

/**
 * Valida o perfil pedido: precisa ser um dos PERFIS_VALIDOS_ (qualquer outra
 * coisa cai em 'analista' - mesmo comportamento de antes pra valor
 * desconhecido/ausente). Só um Administrador pode PROMOVER alguém a
 * Administrador OU mexer no perfil de quem já É Administrador (rebaixar
 * inclusive) - perfilAtual (opcional, undefined em criarUsuario) cobre esse
 * 2º caso, senão um Gerente comum, chamando atualizarUsuario direto (sem
 * passar pela tela, que já esconde essa opção), conseguiria rebaixar uma
 * conta de Administrador pra analista/gerente sem ninguém barrar. Devolve
 * { perfil, erro }: erro preenchido quando a troca não é permitida - aí NADA
 * é gravado (silenciosamente cair pra 'analista' seria o mesmo bug que já
 * aconteceu antes com o perfil binário: "sucesso" na tela sem o que foi
 * pedido de fato acontecer).
 */
function perfilValidado_(session, perfilPedido, perfilAtual) {
  var perfil = PERFIS_VALIDOS_.indexOf(perfilPedido) !== -1 ? perfilPedido : 'analista';
  var envolveAdministrador = perfil === 'administrador' || perfilAtual === 'administrador';
  if (envolveAdministrador && session.perfil !== 'administrador') {
    return { erro: 'Só um Administrador do Aplicativo pode definir ou alterar esse perfil.' };
  }
  return { perfil: perfil };
}

function criarUsuario(session, dados) {
  requireGerente_(session);
  dados = dados || {};

  var nome = sanitizeString_(dados.nome, 200);
  var login = sanitizeString_(dados.login, 100);
  var senha = String(dados.senha || '');
  var perfilResultado = perfilValidado_(session, dados.perfil);
  if (perfilResultado.erro) return fail_(perfilResultado.erro);
  var perfil = perfilResultado.perfil;

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
  bumpVersao_('usuarios');

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
  if (dados.hasOwnProperty('perfil')) {
    var perfilResultado = perfilValidado_(session, dados.perfil, existente.perfil);
    if (perfilResultado.erro) return fail_(perfilResultado.erro);
    atualizado.perfil = perfilResultado.perfil;
  }

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUsuario_(id);
  bumpVersao_('usuarios');

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
  bumpVersao_('usuarios');
  return ok_({ id: id, ativo: false });
}

/**
 * Reativa um usuário inativado - mesmo padrão de reativarUnidade
 * (Unidades.gs). Existe como ação própria (em vez do frontend chamar
 * atualizarUsuario com { ativo: true }) porque atualizarUsuario só lida com
 * os campos que ele conhece via dados.hasOwnProperty (nome/perfil) - um
 * campo "ativo" ali seria ignorado silenciosamente, e o botão "Reativar"
 * pareceria funcionar (toast de sucesso) sem realmente mudar nada na
 * planilha. Também limpa data_inativacao, que fica só como o registro da
 * ÚLTIMA inativação.
 */
function reativarUsuario(session, id) {
  requireGerente_(session);
  var sheet = getSheet_(SHEETS.USUARIOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Usuário não encontrado.');

  var atualizado = Object.assign({}, existente, { ativo: true, data_inativacao: '' });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUsuario_(id);
  bumpVersao_('usuarios');
  return ok_({ id: id, ativo: true });
}

/**
 * Promove um usuário já cadastrado a Administrador do Aplicativo, direto na
 * planilha - só existe pra destravar o PRIMEIRO Administrador (sessão
 * 2026-08-14). Como só um Administrador pode conceder esse perfil
 * (perfilValidado_ acima) e ninguém tem esse perfil ainda logo depois do
 * deploy, ninguém consegue virar o primeiro pela tela - alguém precisa
 * rodar isto uma vez, manualmente. Depois do primeiro, promover qualquer
 * outro usuário já pode ser feito normalmente pela tela de Usuários.
 *
 * RODE UMA VEZ, manualmente, pelo editor do Apps Script: troque
 * 'SEU_LOGIN_AQUI' abaixo pelo login de quem deve virar o primeiro
 * Administrador, escolha "bootstrapPrimeiroAdministrador_" no seletor de
 * função e clique Executar. Depois, Exibir > Registros pra confirmar.
 */
function bootstrapPrimeiroAdministrador_() {
  var LOGIN_DO_ADMINISTRADOR_ = 'SEU_LOGIN_AQUI'; // <<< troque aqui antes de rodar

  var sheet = getSheet_(SHEETS.USUARIOS);
  var linhas = sheetToObjects_(sheet);
  var usuario = linhas.filter(function (u) {
    return String(u.login).toLowerCase() === LOGIN_DO_ADMINISTRADOR_.toLowerCase();
  })[0];
  if (!usuario) {
    Logger.log('Nenhum usuário com login "' + LOGIN_DO_ADMINISTRADOR_ + '" encontrado - confira o login (ou troque a constante LOGIN_DO_ADMINISTRADOR_ no topo da função) e rode de novo.');
    return;
  }
  if (usuario.perfil === 'administrador') {
    Logger.log('"' + usuario.nome + '" (login ' + usuario.login + ') já é Administrador do Aplicativo - nada a fazer.');
    return;
  }

  var atualizado = Object.assign({}, usuario, { perfil: 'administrador' });
  delete atualizado._row;
  updateObjectRow_(sheet, usuario._row, atualizado);
  invalidarCacheUsuario_(usuario.id);
  bumpVersao_('usuarios');
  Logger.log('Pronto: "' + usuario.nome + '" (login ' + usuario.login + ') agora é Administrador do Aplicativo.');
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
  bumpVersao_('usuarios');
  return ok_({ id: id });
}
