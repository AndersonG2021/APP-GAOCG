/**
 * GAOCG App - Utilitários genéricos de planilha, validação e resposta HTTP.
 */

var SHEETS = {
  USUARIOS: 'Usuarios',
  UNIDADES: 'Unidades',
  LISTAS: 'ListasPersonalizadas',
  SOF: 'SOF',
  SOF_FONTES: 'SofFontes',
  UNIDADES_TA: 'UnidadesTA',
  NOTAS_EMPENHO: 'NotasEmpenho',
  RECIBOS: 'Recibos',
  LOG_AUDITORIA: 'LogAuditoria',
  EDICOES_EM_ANDAMENTO: 'EdicoesEmAndamento',
  CONTADORES: 'Contadores'
};

var HEADERS = {
  Usuarios: ['id', 'nome', 'login', 'senha_hash', 'perfil', 'ativo', 'data_criacao', 'data_inativacao'],
  Unidades: ['id', 'nome', 'tipo', 'oss', 'cnpj', 'contrato_gestao', 'valor_contrato_gestao', 'classificacao_orcamentaria', 'acao', 'subacao', 'gd', 'ativo', 'criado_por', 'data_criacao'],
  ListasPersonalizadas: ['id', 'tipo_lista', 'valor', 'pausa_contagem_parado', 'ativo', 'criado_por', 'data_criacao'],
  SOF: ['id', 'unidade_id', 'oss_snapshot', 'cnpj_snapshot', 'contrato_snapshot', 'classificacao_orcamentaria_snapshot',
    'acao_snapshot', 'subacao_snapshot', 'gd_snapshot', 'divergente_da_unidade', 'tipo', 'sei', 'sof_numero',
    'periodo_inicio', 'periodo_fim', 'andamento', 'dea', 'objeto', 'ta', 'observacao', 'planilha_poas',
    'ceo', 'contrato', 'completo', 'criado_por',
    'data_criacao', 'data_ultima_alteracao_andamento', 'visualizado_apos_alerta', 'possui_ne',
    'excluido', 'excluido_por', 'excluido_em'],
  SofFontes: ['id', 'sof_id', 'fonte', 'parcela_mensal', 'total_solicitado', 'criado_por', 'data_criacao'],
  UnidadesTA: ['id', 'unidade_id', 'objeto_ta', 'numero_ta', 'valor_ta', 'criado_por', 'data_criacao'],
  NotasEmpenho: ['id', 'sof_id', 'tipo', 'numero_ne', 'valor', 'periodo', 'criado_por', 'data_criacao'],
  Recibos: ['id', 'unidade_id', 'oss_snapshot', 'cnpj_snapshot', 'divergente_da_unidade', 'tipo_unidade', 'objeto',
    'instrumento', 'parcela_contratual', 'fonte', 'nota_empenho', 'competencia', 'valor_liquidado', 'valor_pago',
    'nota_liquidacao_drive_id', 'nota_liquidacao_url', 'ordem_bancaria', 'ordem_bancaria_arquivo_drive_id',
    'ordem_bancaria_arquivo_url', 'numero_processo', 'observacao', 'status', 'parcela_dividida_grupo_id',
    'percentual_parcela_dividida', 'alerta_divergencia_valores', 'completo', 'origem', 'criado_por', 'data_criacao',
    'data_ultima_alteracao_status', 'visualizado_apos_alerta'],
  LogAuditoria: ['id', 'usuario_id', 'perfil_usuario', 'data_hora', 'tipo_processo', 'processo_id',
    'dono_processo', 'campo_alterado', 'valor_anterior', 'valor_novo', 'fora_do_dono', 'origem'],
  EdicoesEmAndamento: ['tipo_processo', 'processo_id', 'usuario_id', 'iniciado_em', 'ultimo_heartbeat'],
  Contadores: ['prefixo', 'proximo']
};

/**
 * Colunas que devem permanecer com tipo numérico nativo do Sheets (usadas em
 * soma/cálculo). Ficam de fora da proteção de texto - ver COLUNAS_BOOLEANAS
 * abaixo e aplicarFormatoTexto_/protegerFormatoLinha_.
 */
var COLUNAS_NUMERICAS = {
  Unidades: ['valor_contrato_gestao'],
  SofFontes: ['parcela_mensal', 'total_solicitado'],
  UnidadesTA: ['valor_ta'],
  NotasEmpenho: ['valor'],
  Recibos: ['parcela_contratual', 'valor_liquidado', 'valor_pago', 'percentual_parcela_dividida'],
  Contadores: ['proximo']
};

/**
 * Colunas que guardam booleano nativo do Sheets (checkbox). Também ficam de
 * fora da proteção de texto ('@') - forçar texto nelas faz o valor virar a
 * string "TRUE"/"FALSE" na próxima escrita, e qualquer checagem direta tipo
 * `if (sof.possui_ne)` no frontend passa a ser sempre verdadeira (string não
 * vazia é truthy em JS), mesmo quando o valor real é falso. Esse foi
 * exatamente o bug corrigido na sessão de 2026-07-09 (ver PROGRESS.md).
 */
var COLUNAS_BOOLEANAS = {
  Usuarios: ['ativo'],
  Unidades: ['ativo'],
  ListasPersonalizadas: ['pausa_contagem_parado', 'ativo'],
  SOF: ['divergente_da_unidade', 'completo', 'visualizado_apos_alerta', 'possui_ne', 'excluido'],
  Recibos: ['divergente_da_unidade', 'alerta_divergencia_valores', 'completo', 'visualizado_apos_alerta'],
  LogAuditoria: ['fora_do_dono']
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
 * está em COLUNAS_NUMERICAS nem em COLUNAS_BOOLEANAS tem o formato forçado
 * para texto simples ("@"); as colunas protegidas (numéricas/booleanas) têm
 * o formato explicitamente restaurado para "General".
 *
 * IMPORTANTE: usa sempre o cabeçalho REAL da planilha (getHeaders_), nunca
 * uma lista hardcoded - se alguém adicionar uma coluna direto no Sheets sem
 * atualizar HEADERS (já aconteceu com periodo_inicio/periodo_fim na Fase 3),
 * usar uma constante desalinha os índices e aplica o formato na coluna errada.
 */
function aplicarFormatoTexto_(nomeAba) {
  var sheet = getSheet_(nomeAba);
  var headers = getHeaders_(sheet);
  if (!headers.length) return;
  var protegidas = (COLUNAS_NUMERICAS[nomeAba] || []).concat(COLUNAS_BOOLEANAS[nomeAba] || []);
  var maxLinhas = Math.max(sheet.getMaxRows() - 1, 1);

  headers.forEach(function (coluna, indice) {
    if (protegidas.indexOf(coluna) !== -1) {
      sheet.getRange(2, indice + 1, maxLinhas, 1).setNumberFormat('General');
      return;
    }
    sheet.getRange(2, indice + 1, maxLinhas, 1).setNumberFormat('@');
  });
}

/**
 * Função de manutenção: roda manualmente pelo editor do Apps Script (seletor
 * de funções → Executar) para reaplicar o formato correto em TODAS as linhas
 * já existentes de TODAS as abas. Precisa ser rodada de novo sempre que
 * aplicarFormatoTexto_/COLUNAS_BOOLEANAS mudar. Não recupera valores que já
 * foram corrompidos (em data ou em texto "true"/"false") antes da correção -
 * esses precisam ser apagados e redigitados manualmente na planilha.
 */
function corrigirFormatoTexto() {
  Object.keys(HEADERS).forEach(function (nomeAba) {
    aplicarFormatoTexto_(nomeAba);
  });
}

/**
 * Protege uma linha específica contra a auto-conversão de texto->data do
 * Sheets, aplicando '@' coluna a coluna (pulando numéricas/booleanas, que
 * têm o formato explicitamente restaurado para 'General'). Chamada em toda
 * escrita (appendObjectRow_/updateObjectRow_) para que a proteção valha
 * também para linhas criadas/editadas depois do setup inicial da planilha -
 * aplicarFormatoTexto_ sozinha só cobre o que já existia quando foi rodada.
 *
 * Aplica os formatos da linha inteira numa única chamada (setNumberFormats em
 * lote), em vez de uma chamada de getRange/setNumberFormat por coluna - com
 * ~30 colunas na aba SOF, isso era ~30 chamadas separadas ao serviço de
 * planilhas em toda escrita (inclusive marcarSofVisualizado, disparado a cada
 * abertura de card). Ver RELATORIO_LENTIDAO_SOF.md.
 */
function protegerFormatoLinha_(sheet, headers, linha) {
  var nomeAba = sheet.getName();
  var protegidas = (COLUNAS_NUMERICAS[nomeAba] || []).concat(COLUNAS_BOOLEANAS[nomeAba] || []);
  var formatos = headers.map(function (coluna) {
    return protegidas.indexOf(coluna) !== -1 ? 'General' : '@';
  });
  sheet.getRange(linha, 1, 1, headers.length).setNumberFormats([formatos]);
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
  var novaLinha = sheet.getLastRow() + 1;
  protegerFormatoLinha_(sheet, headers, novaLinha);
  sheet.getRange(novaLinha, 1, 1, row.length).setValues([row]);
}

function updateObjectRow_(sheet, rowIndex, obj) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (h) {
    return obj.hasOwnProperty(h) ? serializeCell_(obj[h]) : '';
  });
  protegerFormatoLinha_(sheet, headers, rowIndex);
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

// ===================== OCR (leitura de anexos) =====================

/**
 * Converte um anexo (PDF ou imagem) em texto via OCR do Google Drive: sobe
 * como um Google Doc convertido com OCR, lê o texto do Doc gerado e descarta
 * o Doc (lixeira). Requer o Advanced Drive Service ("Drive API") ativado no
 * projeto do Apps Script (Serviços (+) → Drive API).
 *
 * Sintaxe da Drive API v3 (o `Drive.Files.create` com `resource.name` e
 * `ocrLanguage` no lugar de `Drive.Files.insert`/`resource.title`/`ocr:true`
 * da v2 - a versão que o Serviços (+) do editor adiciona hoje em dia é a v3).
 */
function extrairTextoOcr_(base64, nome, mimeType) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'application/pdf', nome);
  var arquivoTemp = Drive.Files.create({ name: nome, mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'pt' });
  try {
    return DocumentApp.openById(arquivoTemp.id).getBody().getText();
  } finally {
    DriveApp.getFileById(arquivoTemp.id).setTrashed(true);
  }
}

/**
 * Converte valor monetário no formato BR ("1.053.812,42") pra número.
 * toNumber_ não serve aqui: ele só troca vírgula por ponto, sem remover o
 * separador de milhar.
 */
function normalizarValorMonetarioBr_(texto) {
  var n = Number(String(texto || '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}
