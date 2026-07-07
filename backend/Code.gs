/**
 * SGOF - GAOCG | Backend (Google Apps Script)
 * Fase 1: Autenticação, Auditoria e CRUD de SOF.
 *
 * Deploy: Implantar como "Aplicativo da Web"
 *   - Executar como: Usuário que está implantando o app
 *   - Quem tem acesso: Qualquer pessoa
 *
 * O Frontend (GitHub Pages) chama este Web App via fetch() usando POST
 * com Content-Type "text/plain" para evitar preflight CORS. O corpo é
 * um JSON string com { action, token, ...payload }.
 */

// ===================== CONFIGURAÇÃO GERAL =====================

// Se o script for "standalone" (não vinculado à planilha), informe o ID aqui.
// Se estiver vinculado (bound script), deixe em branco.
const SPREADSHEET_ID = '';

const SHEET_NAMES = {
  USUARIOS: 'Usuarios',
  BASE_REFERENCIA: 'Base_Referencia',
  SOF: 'SOF',
  NOTA_EMPENHO: 'Nota_Empenho',
  PREVISAO_NE: 'Previsao_NE',
  RECIBOS: 'Recibos',
  LOG_AUDITORIA: 'Log_Auditoria'
};

const SESSION_DURATION_SEC = 6 * 60 * 60; // 6 horas de sessão

const PUBLIC_ACTIONS = ['login', 'ping'];

// Etapas do andamento do processo, em ordem crescente de progresso.
// O % de PROGRESSO_PCT da SOF é calculado pela posição de ANDAMENTO nesta lista.
const ANDAMENTO_STAGES = [
  'SES-NP_DGPO',
  'SES - DGPO',
  'SES - NAP_POAS',
  'SES-GPOAS',
  'SES-GORC',
  'SES-GPF',
  'SES-CEO_GAOCG',
  'SES-DGMCG',
  'SES-GEMP',
  'NE EMITIDA'
];

// ===================== ROTEAMENTO (doGet / doPost) =====================

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  var params;
  try {
    params = method === 'GET' ? (e.parameter || {}) : parseBody_(e);
  } catch (parseErr) {
    return jsonOut_({ ok: false, error: parseErr.message });
  }

  var action = params.action;
  if (!action) {
    return jsonOut_({ ok: false, error: 'Parâmetro "action" ausente na requisição.' });
  }

  var session = null;
  if (PUBLIC_ACTIONS.indexOf(action) === -1) {
    session = validateSession_(params.token);
    if (!session) {
      return jsonOut_({ ok: false, error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
  }

  try {
    switch (action) {
      case 'ping':
        return jsonOut_({ ok: true, message: 'pong' });

      case 'login':
        return jsonOut_(loginUser(params.login, params.senha));

      case 'getSOFs':
        return jsonOut_(getSOFs(session, params));

      case 'createSOF':
        return jsonOut_(createSOF(session, params.data));

      case 'updateSOF':
        return jsonOut_(updateSOF(session, params.id, params.data));

      case 'getBaseReferencia':
        return jsonOut_(getBaseReferencia(session));

      case 'createUser':
        return jsonOut_(createUser(session, params.data));

      case 'changePassword':
        return jsonOut_(changePassword(session, params.senhaAtual, params.novaSenha));

      default:
        return jsonOut_({ ok: false, error: 'Ação desconhecida: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Erro interno no servidor: ' + err.message });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('Corpo da requisição inválido (JSON malformado).');
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================== AUTENTICAÇÃO / SESSÃO =====================

/**
 * Valida login/senha contra a aba Usuarios e cria uma sessão em cache.
 */
function loginUser(login, senha) {
  if (!login || !senha) {
    return { ok: false, error: 'Informe usuário e senha.' };
  }

  var sheet = getSheet_(SHEET_NAMES.USUARIOS);
  var usuarios = sheetToObjects_(sheet);
  var usuario = usuarios.find(function (u) {
    return String(u.Login).toLowerCase() === String(login).toLowerCase();
  });

  if (!usuario) {
    return { ok: false, error: 'Usuário ou senha inválidos.' };
  }

  var hashInformado = hashPassword_(senha);
  if (String(usuario.Senha_Hash) !== hashInformado) {
    return { ok: false, error: 'Usuário ou senha inválidos.' };
  }

  var token = Utilities.getUuid();
  var sessionData = {
    userId: usuario.ID,
    nome: usuario.Nome,
    perfil: usuario.Perfil
  };

  CacheService.getScriptCache().put(token, JSON.stringify(sessionData), SESSION_DURATION_SEC);

  return {
    ok: true,
    token: token,
    user: sessionData
  };
}

/**
 * Recupera a sessão do CacheService a partir do token. Retorna null se inválida/expirada.
 */
function validateSession_(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(token);
  if (!cached) return null;

  var session = JSON.parse(cached);
  session.token = token;
  return session;
}

function hashPassword_(senha) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha, Utilities.Charset.UTF_8);
  return bytes.map(function (byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * Cria um novo usuário. Restrito a perfil Gerente. A senha nunca é
 * persistida em texto puro: o hash é calculado aqui, no servidor.
 */
function createUser(session, data) {
  if (session.perfil !== 'Gerente') {
    return { ok: false, error: 'Apenas usuários com perfil Gerente podem criar novos usuários.' };
  }
  if (!data || !data.Nome || !data.Login || !data.Senha || !data.Perfil) {
    return { ok: false, error: 'Preencha Nome, Login, Senha e Perfil.' };
  }
  if (['Gerente', 'Analista'].indexOf(data.Perfil) === -1) {
    return { ok: false, error: 'Perfil inválido. Utilize "Gerente" ou "Analista".' };
  }
  if (data.Senha.length < 6) {
    return { ok: false, error: 'A senha deve ter pelo menos 6 caracteres.' };
  }

  var sheet = getSheet_(SHEET_NAMES.USUARIOS);
  var usuarios = sheetToObjects_(sheet);
  var jaExiste = usuarios.some(function (u) {
    return String(u.Login).toLowerCase() === String(data.Login).toLowerCase();
  });
  if (jaExiste) {
    return { ok: false, error: 'Já existe um usuário com este login.' };
  }

  var id = generateId_('USR');
  appendObject_(sheet, {
    ID: id,
    Nome: data.Nome,
    Login: data.Login,
    Senha_Hash: hashPassword_(data.Senha),
    Perfil: data.Perfil
  });

  logAudit_(SHEET_NAMES.USUARIOS, id, session.userId, 'CRIAÇÃO', '', 'Usuário "' + data.Login + '" criado (perfil ' + data.Perfil + ')');

  return { ok: true, data: { ID: id, Nome: data.Nome, Login: data.Login, Perfil: data.Perfil } };
}

/**
 * Permite ao usuário logado trocar a própria senha. Exige a senha atual
 * para confirmação e grava apenas o novo hash na planilha.
 */
function changePassword(session, senhaAtual, novaSenha) {
  if (!senhaAtual || !novaSenha) {
    return { ok: false, error: 'Informe a senha atual e a nova senha.' };
  }
  if (novaSenha.length < 6) {
    return { ok: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' };
  }

  var sheet = getSheet_(SHEET_NAMES.USUARIOS);
  var usuario = findObjectById_(sheet, session.userId);
  if (!usuario) {
    return { ok: false, error: 'Usuário não encontrado.' };
  }
  if (String(usuario.Senha_Hash) !== hashPassword_(senhaAtual)) {
    return { ok: false, error: 'Senha atual incorreta.' };
  }

  var rowIndex = usuario._row;
  var atualizado = Object.assign({}, usuario, { Senha_Hash: hashPassword_(novaSenha) });
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  logAudit_(SHEET_NAMES.USUARIOS, session.userId, session.userId, 'Senha_Hash', '***', '***');

  return { ok: true, message: 'Senha alterada com sucesso.' };
}

// ===================== AUDITORIA =====================

/**
 * Grava uma linha em Log_Auditoria. Falhas de auditoria não interrompem a operação principal.
 */
function logAudit_(tabela, registroId, usuarioId, campo, valorAntigo, valorNovo) {
  try {
    var sheet = getSheet_(SHEET_NAMES.LOG_AUDITORIA);
    appendObject_(sheet, {
      ID: generateId_('LOG'),
      Tabela_Afetada: tabela,
      Registro_ID: registroId,
      Usuario_ID: usuarioId,
      Campo_Alterado: campo,
      Valor_Antigo: valorAntigo,
      Valor_Novo: valorNovo,
      Data_Hora: new Date()
    });
  } catch (err) {
    console.error('Falha ao gravar log de auditoria: ' + err.message);
  }
}

// ===================== SOF: REGRAS DE NEGÓCIO =====================

/**
 * Calcula o progresso (%) da SOF com base na posição do campo ANDAMENTO
 * dentro de ANDAMENTO_STAGES (etapa inicial = menor progresso, "NE EMITIDA" = 100%).
 */
function calcularProgressoSOF_(sof) {
  var indice = ANDAMENTO_STAGES.indexOf(sof.ANDAMENTO);
  if (indice === -1) return 0;
  return Math.round(((indice + 1) / ANDAMENTO_STAGES.length) * 100);
}

function getSOFs(session, params) {
  var sheet = getSheet_(SHEET_NAMES.SOF);
  var rows = sheetToObjects_(sheet).map(function (sof) {
    sof.PROGRESSO_PCT = calcularProgressoSOF_(sof);
    delete sof._row;
    return sof;
  });
  return { ok: true, data: rows };
}

function createSOF(session, data) {
  if (!data) {
    return { ok: false, error: 'Dados da SOF não informados.' };
  }
  if (!data.UNIDADE || !data.OBJETO) {
    return { ok: false, error: 'Campos obrigatórios ausentes (Unidade, Objeto).' };
  }

  // Nº SEI e Nº Processo são o mesmo dado - mantidos em duas colunas por
  // compatibilidade com o modelo original, sempre sincronizados aqui.
  if (data.hasOwnProperty('NUM_PROCESSO')) {
    data.NUM_SEI = data.NUM_PROCESSO;
  }

  var sheet = getSheet_(SHEET_NAMES.SOF);
  var id = generateId_('SOF');

  var novaSof = Object.assign({}, data, {
    ID: id,
    STATUS: data.STATUS || 'Em Elaboração',
    DDO: !!data.DDO,
    DPF: !!data.DPF,
    DEA: !!data.DEA
  });
  novaSof.PROGRESSO_PCT = calcularProgressoSOF_(novaSof);

  appendObject_(sheet, novaSof);
  logAudit_(SHEET_NAMES.SOF, id, session.userId, 'CRIAÇÃO', '', JSON.stringify(novaSof));

  return { ok: true, data: novaSof };
}

function updateSOF(session, id, data) {
  if (!id || !data) {
    return { ok: false, error: 'ID ou dados ausentes para atualização.' };
  }

  // Nº SEI e Nº Processo são o mesmo dado - mantidos sincronizados.
  if (data.hasOwnProperty('NUM_PROCESSO')) {
    data.NUM_SEI = data.NUM_PROCESSO;
  }

  var sheet = getSheet_(SHEET_NAMES.SOF);
  var existente = findObjectById_(sheet, id);
  if (!existente) {
    return { ok: false, error: 'SOF não encontrada.' };
  }

  // Gerente e Analista podem editar todos os campos da SOF, incluindo Andamento.
  var rowIndex = existente._row;
  var atualizado = Object.assign({}, existente, data);
  delete atualizado._row;
  atualizado.PROGRESSO_PCT = calcularProgressoSOF_(atualizado);

  Object.keys(data).forEach(function (campo) {
    if (String(existente[campo]) !== String(data[campo])) {
      logAudit_(SHEET_NAMES.SOF, id, session.userId, campo, existente[campo], data[campo]);
    }
  });

  updateObjectRow_(sheet, rowIndex, atualizado);
  return { ok: true, data: atualizado };
}

function getBaseReferencia(session) {
  var sheet = getSheet_(SHEET_NAMES.BASE_REFERENCIA);
  var rows = sheetToObjects_(sheet).map(function (r) {
    delete r._row;
    return r;
  });
  return { ok: true, data: rows };
}

// ===================== UTILITÁRIOS DE PLANILHA =====================

function getSS_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(nome) {
  var sheet = getSS_().getSheetByName(nome);
  if (!sheet) throw new Error('Aba "' + nome + '" não encontrada na planilha.');
  return sheet;
}

/**
 * Converte uma aba em array de objetos usando a linha 1 como cabeçalho.
 * Cada objeto recebe também um campo interno _row com o índice da linha na planilha.
 */
function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = { _row: i + 1 };
    headers.forEach(function (h, idx) {
      obj[h] = data[i][idx];
    });
    rows.push(obj);
  }
  return rows;
}

function findObjectById_(sheet, id) {
  var rows = sheetToObjects_(sheet);
  var found = rows.find(function (r) { return String(r.ID) === String(id); });
  return found || null;
}

function appendObject_(sheet, obj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sheet.appendRow(row);
}

function updateObjectRow_(sheet, rowIndex, obj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

function generateId_(prefixo) {
  return prefixo + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}
