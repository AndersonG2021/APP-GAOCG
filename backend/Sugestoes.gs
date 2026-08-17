/**
 * GAOCG App - Sugestões (sessão 2026-08-14, pedido do usuário).
 *
 * Qualquer usuário autenticado pode enviar uma sugestão sobre o app - só o
 * Administrador do Aplicativo vê as de todo mundo; os demais veem só as
 * próprias (ver listarSugestoes).
 *
 * Fluxo de status:
 *   Aguardando análise -> Em análise -> Lida
 *   ^ recém-criada, ou     ^ Administrador    ^ Administrador
 *     reaberta por edição    abriu               respondeu
 *     do autor depois de
 *     já ter sido Lida
 *
 * O autor pode editar o próprio texto a qualquer momento; se a sugestão já
 * estava "Lida", editar reabre pra "Aguardando análise" - pedido do usuário,
 * pra o feedback do Administrador nunca ficar respondendo um texto que já
 * mudou por baixo sem aviso nenhum.
 */

var STATUS_SUGESTAO_AGUARDANDO_ = 'Aguardando análise';
var STATUS_SUGESTAO_EM_ANALISE_ = 'Em análise';
var STATUS_SUGESTAO_LIDA_ = 'Lida';

/**
 * A aba é criada sob demanda, na primeira sugestão enviada - mesmo padrão de
 * getSheetOrdensBancariasRecibo_ (Recibos.gs) / getSheetModelosRelatorio_
 * (Relatorios.gs). Não precisa criar "Sugestoes" à mão na planilha.
 */
function getSheetSugestoes_() {
  var ss = getSS_();
  var sheet = ss.getSheetByName(SHEETS.SUGESTOES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.SUGESTOES);
    sheet.getRange(1, 1, 1, HEADERS.Sugestoes.length).setValues([HEADERS.Sugestoes]);
    sheet.setFrozenRows(1);
  }
  return memoizarAba_(SHEETS.SUGESTOES, sheet);
}

/**
 * Lê a aba Sugestoes inteira, com cache de 30s (mesmo padrão de
 * todasUnidadesComCache_ etc., Unidades.gs). Se a aba ainda não existir
 * (ninguém enviou nenhuma sugestão ainda), devolve lista vazia sem criar a
 * aba - só criarSugestao cria de fato, via getSheetSugestoes_.
 */
function todasSugestoesComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'sugestoes';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var sheet = getSS_().getSheetByName(SHEETS.SUGESTOES);
  var rows = sheet ? sheetToObjects_(sheet) : [];
  rows.forEach(function (s) { delete s._row; });
  cachePut_(cache, chave, rows, 30);
  return rows;
}

function invalidarCacheSugestoes_() {
  CacheService.getScriptCache().remove('sugestoes');
}

/** Administrador vê todas; qualquer outro perfil vê só as próprias. Mais recente primeiro. */
function listarSugestoes(session) {
  var todas = todasSugestoesComCache_();
  var rows = session.perfil === 'administrador'
    ? todas.slice()
    : todas.filter(function (s) { return String(s.usuario_id) === String(session.id); });
  rows.sort(function (a, b) { return String(b.data_criacao).localeCompare(String(a.data_criacao)); });
  return ok_(rows);
}

function criarSugestao(session, dados) {
  dados = dados || {};
  var texto = sanitizeString_(dados.texto, 4000);
  if (!texto) return fail_('Escreva sua sugestão antes de enviar.');

  var sheet = getSheetSugestoes_();
  var id = proximoId_('Sugestoes');
  var agora = nowIso_();
  var novo = {
    id: id,
    usuario_id: session.id,
    texto: texto,
    status: STATUS_SUGESTAO_AGUARDANDO_,
    feedback_administrador: '',
    respondido_por: '',
    data_criacao: agora,
    data_atualizacao: agora,
    data_resposta: ''
  };
  appendObjectRow_(sheet, novo);
  invalidarCacheSugestoes_();
  bumpVersao_('sugestoes');

  enviarEmailNovaSugestao_(session, texto);

  return ok_(novo);
}

/**
 * Aviso por e-mail (pedido do usuário) pro endereço fixo abaixo, toda vez
 * que uma sugestão nova é enviada. MailApp.sendEmail manda como a conta
 * Google dona do deploy do Apps Script (ver "Executar como: Eu" no
 * cabeçalho de Code.gs) - não precisa configurar SMTP nem credencial
 * nenhuma. Best-effort: a sugestão já está salva quando isto roda, então uma
 * falha de envio (cota de e-mail excedida etc.) nunca deve derrubar o
 * cadastro da sugestão pro usuário que a enviou.
 */
function enviarEmailNovaSugestao_(session, texto) {
  try {
    MailApp.sendEmail({
      to: 'andersongbc.ses.pe@gmail.com',
      subject: 'GAOCG App - Nova sugestão recebida',
      body: 'Uma nova sugestão foi adicionada no APP GAOCG.\n\n' +
        'Enviada por: ' + (session.nome || session.login || session.id) + '\n\n' +
        'Sugestão:\n' + texto
    });
  } catch (e) {
    // Best-effort - ver comentário acima.
  }
}

/**
 * O autor edita o próprio texto. Reabre pra "Aguardando análise" se já
 * estava "Lida" (pedido do usuário) - "Em análise" não reabre porque o
 * Administrador já está ciente e ainda não respondeu nada que possa ficar
 * desatualizado.
 */
function atualizarSugestao(session, id, dados) {
  dados = dados || {};
  var sheet = getSheetSugestoes_();
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Sugestão não encontrada.');
  if (String(existente.usuario_id) !== String(session.id)) return fail_('Você só pode editar as suas próprias sugestões.');

  var texto = sanitizeString_(dados.texto, 4000);
  if (!texto) return fail_('Escreva sua sugestão antes de salvar.');

  var atualizado = Object.assign({}, existente, {
    texto: texto,
    status: existente.status === STATUS_SUGESTAO_LIDA_ ? STATUS_SUGESTAO_AGUARDANDO_ : existente.status,
    data_atualizacao: nowIso_()
  });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheSugestoes_();
  bumpVersao_('sugestoes');
  return ok_(atualizado);
}

/**
 * O Administrador abriu a sugestão - mesmo princípio de
 * marcarSofVisualizado/marcarReciboVisualizado (Sof.gs/Recibos.gs).
 * Idempotente: só avança de "Aguardando análise" pra "Em análise"; abrir de
 * novo uma já "Em análise" ou "Lida" não faz nada (nunca "recua" o status).
 */
function marcarSugestaoEmAnalise(session, id) {
  requireAdministrador_(session);
  var sheet = getSheetSugestoes_();
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Sugestão não encontrada.');
  if (existente.status !== STATUS_SUGESTAO_AGUARDANDO_) return ok_({ id: id, status: existente.status });

  var atualizado = Object.assign({}, existente, { status: STATUS_SUGESTAO_EM_ANALISE_, data_atualizacao: nowIso_() });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheSugestoes_();
  bumpVersao_('sugestoes');
  return ok_({ id: id, status: STATUS_SUGESTAO_EM_ANALISE_ });
}

/** O Administrador responde - vira "Lida". */
function responderSugestao(session, id, feedback) {
  requireAdministrador_(session);
  var sheet = getSheetSugestoes_();
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Sugestão não encontrada.');

  var texto = sanitizeString_(feedback, 4000);
  if (!texto) return fail_('Escreva um feedback antes de enviar.');

  var atualizado = Object.assign({}, existente, {
    feedback_administrador: texto,
    status: STATUS_SUGESTAO_LIDA_,
    respondido_por: session.id,
    data_resposta: nowIso_(),
    data_atualizacao: nowIso_()
  });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheSugestoes_();
  bumpVersao_('sugestoes');
  return ok_(atualizado);
}
