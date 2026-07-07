/**
 * GAOCG App - Utilitários genéricos de planilha, validação e resposta HTTP.
 */

var SHEETS = {
  USUARIOS: 'Usuarios',
  UNIDADES: 'Unidades',
  LISTAS: 'ListasPersonalizadas',
  SOF: 'SOF',
  NOTAS_EMPENHO: 'NotasEmpenho',
  RECIBOS: 'Recibos',
  LOG_AUDITORIA: 'LogAuditoria',
  EDICOES_EM_ANDAMENTO: 'EdicoesEmAndamento',
  CONTADORES: 'Contadores'
};

var HEADERS = {
  Usuarios: ['id', 'nome', 'login', 'senha_hash', 'perfil', 'frente', 'ativo', 'data_criacao', 'data_inativacao'],
  Unidades: ['id', 'nome', 'tipo', 'oss', 'cnpj', 'contrato_gestao', 'classificacao_orcamentaria', 'acao', 'subacao', 'gd', 'ativo', 'criado_por', 'data_criacao'],
  ListasPersonalizadas: ['id', 'tipo_lista', 'frente', 'valor', 'pausa_contagem_parado', 'ativo', 'criado_por', 'data_criacao'],
  SOF: ['id', 'unidade_id', 'oss_snapshot', 'cnpj_snapshot', 'contrato_snapshot', 'classificacao_orcamentaria_snapshot',
    'acao_snapshot', 'subacao_snapshot', 'gd_snapshot', 'divergente_da_unidade', 'tipo', 'sei', 'sof_numero', 'periodo',
    'andamento', 'dea', 'objeto', 'ta', 'observacao', 'planilha_poas', 'parcela_mensal', 'fonte', 'ceo', 'contrato',
    'total_solicitado', 'frente', 'completo', 'criado_por', 'data_criacao', 'data_ultima_alteracao_andamento',
    'visualizado_apos_alerta', 'possui_ne'],
  NotasEmpenho: ['id', 'sof_id', 'tipo', 'numero_ne', 'valor', 'periodo', 'criado_por', 'data_criacao'],
  Recibos: ['id', 'unidade_id', 'oss_snapshot', 'cnpj_snapshot', 'divergente_da_unidade', 'tipo_unidade', 'objeto',
    'instrumento', 'parcela_contratual', 'fonte', 'nota_empenho', 'competencia', 'valor_liquidado', 'valor_pago',
    'ordem_bancaria', 'numero_processo', 'observacao', 'status', 'rateio_grupo_id', 'percentual_rateio',
    'alerta_divergencia_valores', 'frente', 'completo', 'origem', 'criado_por', 'data_criacao',
    'data_ultima_alteracao_status', 'visualizado_apos_alerta'],
  LogAuditoria: ['id', 'usuario_id', 'perfil_usuario', 'frente_usuario', 'data_hora', 'tipo_processo', 'processo_id',
    'frente_processo', 'campo_alterado', 'valor_anterior', 'valor_novo', 'fora_da_frente', 'origem'],
  EdicoesEmAndamento: ['tipo_processo', 'processo_id', 'usuario_id', 'iniciado_em', 'ultimo_heartbeat'],
  Contadores: ['prefixo', 'proximo']
};

var FRENTES = ['SOF-UPA', 'SOF-UPAE', 'SOF-Hospital', 'Recibo-UPA', 'Recibo-UPAE', 'Recibo-Hospital'];

/**
 * Colunas que devem permanecer com tipo numérico nativo do Sheets (usadas em
 * soma/cálculo). Todas as demais colunas de cada aba são forçadas para
 * formato de texto simples ("@") em aplicarFormatoTexto_ - ver o comentário
 * daquela função para o motivo.
 */
var COLUNAS_NUMERICAS = {
  SOF: ['parcela_mensal', 'total_solicitado'],
  NotasEmpenho: ['valor'],
  Recibos: ['parcela_contratual', 'valor_liquidado', 'valor_pago', 'percentual_rateio'],
  Contadores: ['proximo']
};

// ===================== PLANILHA =====================

function getSS_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(nome) {
  var sheet = getSS_().getSheetByName(nome);
  if (!sheet) throw new Error('Aba "' + nome + '" não encontrada na planilha. Rode configurarPlanilha() primeiro.');
  return sheet;
}

function getHeaders_(sheet) {
  var last = sheet.getLastColumn();
  if (last === 0) return [];
  return sheet.getRange(1, 1, 1, last).getValues()[0];
}

/**
 * O Google Sheets detecta automaticamente o tipo de qualquer valor escrito
 * numa célula (mesmo via Apps Script) e o converte para Data/Número sempre
 * que o texto "parece" um desses tipos no locale da planilha - por exemplo,
 * um G.D. digitado como "3.3.50" pode virar a data 03/03/1950. Isso corrompe
 * o dado de forma irreversível (o valor original de texto se perde). A
 * correção definitiva é impedir a conversão na origem: toda coluna que não
 * está em COLUNAS_NUMERICAS tem o formato forçado para texto simples ("@")
 * antes de qualquer gravação, então o Sheets nunca reinterpreta o conteúdo.
 * Chamada em configurarPlanilha() (Seed.gs) para todas as abas.
 */
function aplicarFormatoTexto_(nomeAba) {
  var sheet = getSheet_(nomeAba);
  var headers = HEADERS[nomeAba];
  if (!headers) return;
  var numericas = COLUNAS_NUMERICAS[nomeAba] || [];
  var maxLinhas = Math.max(sheet.getMaxRows() - 1, 1);

  headers.forEach(function (coluna, indice) {
    if (numericas.indexOf(coluna) !== -1) return;
    sheet.getRange(2, indice + 1, maxLinhas, 1).setNumberFormat('@');
  });
}

/** Converte uma aba inteira em array de objetos, com _row (índice 1-based na planilha). */
function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = { _row: i + 1 };
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = normalizeCellValue_(data[i][c]);
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * O Sheets converte automaticamente células que "parecem" data para o tipo Date.
 * Isso já causou vazamento de valores Date cru para o frontend em outra parte do
 * projeto. Aqui, qualquer Date lido de uma célula é convertido para ISO (texto),
 * nunca repassado como objeto Date.
 */
function normalizeCellValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value;
}

function findById_(sheet, id) {
  var rows = sheetToObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

function appendObjectRow_(sheet, obj) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (h) {
    return obj.hasOwnProperty(h) ? serializeCell_(obj[h]) : '';
  });
  sheet.appendRow(row);
}

function updateObjectRow_(sheet, rowIndex, obj) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (h) {
    return obj.hasOwnProperty(h) ? serializeCell_(obj[h]) : '';
  });
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

function deleteRow_(sheet, rowIndex) {
  sheet.deleteRow(rowIndex);
}

/** Nunca gravamos objetos Date nativos - datas são sempre strings ISO. */
function serializeCell_(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  return value;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

// ===================== RESPOSTA HTTP / CORS =====================

/**
 * Apps Script Web Apps não suportam doOptions com resposta CORS confiável
 * (a URL /exec redireciona e o preflight quebra no navegador). A solução
 * usada aqui é evitar completamente o preflight: o frontend só faz GET
 * (sem headers customizados) ou POST com Content-Type "text/plain"
 * (um dos poucos content-types considerados "simples" pelo CORS), então
 * o navegador nunca dispara OPTIONS. ContentService, por padrão, já
 * responde sem exigir credenciais, então não há necessidade de cabeçalhos
 * Access-Control-* adicionais nesse cenário.
 */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  var out = { ok: true };
  if (data !== undefined) out.data = data;
  return out;
}

function fail_(mensagem) {
  return { ok: false, error: mensagem };
}

// ===================== SANITIZAÇÃO / VALIDAÇÃO =====================

function sanitizeString_(value, maxLen) {
  if (value === undefined || value === null) return '';
  var s = String(value).trim();
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen);
  return s;
}

function isNonEmpty_(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/** Valida CNPJ (formato + dígitos verificadores). Aceita com ou sem máscara. */
function validarCnpj_(cnpjRaw) {
  var cnpj = String(cnpjRaw || '').replace(/[^\d]/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  function calcDigito(base) {
    var pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var soma = 0;
    for (var i = 0; i < base.length; i++) soma += parseInt(base.charAt(i), 10) * pesos[i];
    var resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  var base = cnpj.substring(0, 12);
  var d1 = calcDigito(base);
  var d2 = calcDigito(base + d1);
  return cnpj === base + String(d1) + String(d2);
}

/** Padrão NNNNNNNNNN.NNNNNN/AAAA-NN */
function validarSei_(sei) {
  return /^\d{10}\.\d{6}\/\d{4}-\d{2}$/.test(String(sei || ''));
}

/** Padrão NNN/AAAA */
function validarSofNumero_(numero) {
  return /^\d{3}\/\d{4}$/.test(String(numero || ''));
}

function toBool_(value) {
  if (typeof value === 'boolean') return value;
  var s = String(value || '').trim().toUpperCase();
  return s === 'VERDADEIRO' || s === 'TRUE';
}

function toNumber_(value) {
  if (value === '' || value === null || value === undefined) return 0;
  var n = Number(String(value).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
