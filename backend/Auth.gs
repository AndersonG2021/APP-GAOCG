/**
 * GAOCG App - Autenticação (Funcionalidade 1) e verificação de token.
 *
 * Não há expiração de sessão por inatividade (requisito de negócio), então o
 * token é um JWT-like simples e sem "exp": {uid, iat} assinado com HMAC-SHA256
 * usando um segredo guardado em Script Properties (nunca no código-fonte nem
 * no frontend). Cada requisição autenticada é revalidada contra a aba
 * Usuarios (perfil/ativo atuais), então inativar um usuário efetiva
 * imediatamente, mesmo com um token antigo ainda "válido" criptograficamente.
 */

function getTokenSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('TOKEN_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', secret);
  }
  return secret;
}

function hashPassword_(senha, salt) {
  var texto = salt + ':' + senha;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function gerarSaltSenha_() {
  return Utilities.getUuid();
}

/** senha_hash é armazenado como "salt$hash". */
function criarSenhaHash_(senhaPlana) {
  var salt = gerarSaltSenha_();
  return salt + '$' + hashPassword_(senhaPlana, salt);
}

function validarSenha_(senhaPlana, senhaHashArmazenada) {
  var partes = String(senhaHashArmazenada || '').split('$');
  if (partes.length !== 2) return false;
  return hashPassword_(senhaPlana, partes[0]) === partes[1];
}

function assinar_(payloadStr) {
  var bytes = Utilities.computeHmacSha256Signature(payloadStr, getTokenSecret_());
  return Utilities.base64EncodeWebSafe(bytes);
}

function gerarToken_(usuarioId) {
  var payload = { uid: usuarioId, iat: nowIso_() };
  var payloadStr = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var assinatura = assinar_(payloadStr);
  return payloadStr + '.' + assinatura;
}

/** Retorna o usuário (linha de Usuarios) se o token for válido e o usuário estiver ativo, senão null. */
function requireAuth_(token) {
  if (!token || token.indexOf('.') === -1) return null;
  var partes = token.split('.');
  var payloadStr = partes[0];
  var assinatura = partes[1];
  if (assinar_(payloadStr) !== assinatura) return null;

  var payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadStr)).getDataAsString());
  } catch (e) {
    return null;
  }
  if (!payload || !payload.uid) return null;

  var usuario = buscarUsuarioComCache_(payload.uid);
  if (!usuario || !toBool_(usuario.ativo)) return null;

  return usuario;
}

/**
 * Toda requisição autenticada revalida o usuário (perfil/ativo) - sem isso,
 * uma revogação de acesso não teria efeito imediato. Isso significava reler a
 * aba Usuarios inteira em toda chamada, mesmo as puramente informativas
 * (ver RELATORIO_LENTIDAO_SOF.md). Cache de 30s via CacheService: barato o
 * bastante pra não pesar, curto o bastante pra uma inativação valer quase na
 * hora (as escritas em Usuarios.gs já invalidam a entrada na hora, então o
 * atraso real só acontece se a leitura cacheada já tiver acontecido um
 * instante antes da escrita).
 */
function buscarUsuarioComCache_(usuarioId) {
  var cache = CacheService.getScriptCache();
  var chave = 'usuario_' + usuarioId;
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var usuario = findById_(getSheet_(SHEETS.USUARIOS), usuarioId);
  if (!usuario) return null;
  delete usuario._row;
  delete usuario.senha_hash;
  cache.put(chave, JSON.stringify(usuario), 30);
  return usuario;
}

function invalidarCacheUsuario_(usuarioId) {
  CacheService.getScriptCache().remove('usuario_' + usuarioId);
}

function login_(loginInformado, senhaInformada) {
  if (!isNonEmpty_(loginInformado) || !isNonEmpty_(senhaInformada)) {
    return fail_('Usuário ou senha incorretos.');
  }

  var sheet = getSheet_(SHEETS.USUARIOS);
  var usuarios = sheetToObjects_(sheet);
  var usuario = null;
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].login).toLowerCase() === String(loginInformado).trim().toLowerCase()) {
      usuario = usuarios[i];
      break;
    }
  }

  // Mensagem genérica em qualquer caso de falha, para evitar enumeração de usuários.
  if (!usuario || !validarSenha_(senhaInformada, usuario.senha_hash)) {
    return fail_('Usuário ou senha incorretos.');
  }
  if (!toBool_(usuario.ativo)) {
    return fail_('Usuário ou senha incorretos.');
  }

  var token = gerarToken_(usuario.id);
  return ok_({
    token: token,
    user: {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      perfil: usuario.perfil
    }
  });
}

/** Cada usuário pode editar como o próprio nome aparece na aplicação (não o login). */
function alterarMeuNome(session, novoNome) {
  var nome = sanitizeString_(novoNome, 200);
  if (!isNonEmpty_(nome)) return fail_('Informe o nome.');

  var sheet = getSheet_(SHEETS.USUARIOS);
  var usuario = findById_(sheet, session.id);
  if (!usuario) return fail_('Usuário não encontrado.');

  var atualizado = Object.assign({}, usuario, { nome: nome });
  var rowIndex = usuario._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUsuario_(session.id);
  return ok_({ nome: nome });
}

function alterarMinhaSenha(session, senhaAtual, novaSenha) {
  if (!isNonEmpty_(senhaAtual) || !isNonEmpty_(novaSenha)) return fail_('Informe a senha atual e a nova senha.');
  if (String(novaSenha).length < 6) return fail_('A nova senha deve ter pelo menos 6 caracteres.');

  var sheet = getSheet_(SHEETS.USUARIOS);
  var usuario = findById_(sheet, session.id);
  if (!usuario) return fail_('Usuário não encontrado.');
  if (!validarSenha_(senhaAtual, usuario.senha_hash)) return fail_('Senha atual incorreta.');

  var atualizado = Object.assign({}, usuario, { senha_hash: criarSenhaHash_(novaSenha) });
  var rowIndex = usuario._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUsuario_(session.id);
  return ok_({ sucesso: true });
}
