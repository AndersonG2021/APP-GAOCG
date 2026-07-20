/**
 * GAOCG App - Rotina de bootstrap da planilha (Fase 0).
 *
 * Rode configurarPlanilha() manualmente pelo editor do Apps Script (menu
 * "Executar" > selecionar a função > Executar) uma única vez, logo após
 * vincular este script a uma planilha Google Sheets nova/vazia. Ela cria
 * todas as abas do modelo_dados_gaocg.md com seus cabeçalhos, a aba de
 * controle Contadores, um usuário gerente inicial e algumas opções de
 * ListasPersonalizadas sugeridas (com pausa_contagem_parado já configurado
 * nas candidatas naturais de espera externa).
 *
 * É seguro rodar mais de uma vez: abas e o usuário admin só são recriados se
 * ainda não existirem.
 */
function configurarPlanilha() {
  var ss = getSS_();

  Object.keys(HEADERS).forEach(function (nomeAba) {
    var sheet = ss.getSheetByName(nomeAba);
    if (!sheet) {
      sheet = ss.insertSheet(nomeAba);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS[nomeAba].length).setValues([HEADERS[nomeAba]]);
      sheet.setFrozenRows(1);
    }
    // Idempotente e seguro rodar de novo em planilhas já existentes: corrige a
    // causa raiz de campos como G.D. virando datas (ver Utils.gs).
    aplicarFormatoTexto_(nomeAba);
  });

  var abaPadrao = ss.getSheetByName('Sheet1') || ss.getSheetByName('Página1');
  if (abaPadrao && ss.getSheets().length > Object.keys(HEADERS).length) {
    ss.deleteSheet(abaPadrao);
  }

  seedUsuarioGerentePadrao_();
  seedListasPersonalizadasPadrao_();

  Logger.log('Planilha configurada com sucesso.');
}

function seedUsuarioGerentePadrao_() {
  var sheet = getSheet_(SHEETS.USUARIOS);
  var usuarios = sheetToObjects_(sheet);
  var jaExiste = usuarios.some(function (u) { return String(u.login).toLowerCase() === 'admin'; });
  if (jaExiste) return;

  appendObjectRow_(sheet, {
    id: proximoId_('Usuarios'),
    nome: 'Administrador GAOCG',
    login: 'admin',
    senha_hash: criarSenhaHash_('TrocarSenha123'),
    perfil: 'gerente',
    frente: '',
    ativo: true,
    data_criacao: nowIso_(),
    data_inativacao: ''
  });
  Logger.log('Usuário gerente inicial criado: login "admin", senha "TrocarSenha123" (troque no primeiro acesso).');
}

/**
 * Sugestões da Seção 8.3 do prompt de construção: opções candidatas naturais
 * a pausa_contagem_parado = true, por representarem espera externa conhecida
 * (ex.: aguardar autorização da CPF, aguardar disponibilidade orçamentária).
 * Ajuste livremente pela tela de administração de Listas Personalizadas.
 */
function seedListasPersonalizadasPadrao_() {
  var sheet = getSheet_(SHEETS.LISTAS);
  if (sheetToObjects_(sheet).length > 0) return;

  var sugestoes = [];
  SOF_FRENTES_SEED_.forEach(function (frente) {
    sugestoes.push({ tipo_lista: 'ANDAMENTO_SOF', frente: frente, valor: 'AGUARDANDO AUTORIZACAO CPF', pausa: true });
    sugestoes.push({ tipo_lista: 'ANDAMENTO_SOF', frente: frente, valor: 'AGUARDANDO DISPONIBILIDADE ORCAMENTARIA', pausa: true });
    sugestoes.push({ tipo_lista: 'ANDAMENTO_SOF', frente: frente, valor: 'AGUARDANDO ENVIO DE DOCUMENTACAO', pausa: false });
    sugestoes.push({ tipo_lista: 'ANDAMENTO_SOF', frente: frente, valor: 'NE EMITIDA', pausa: false });
  });
  RECIBO_FRENTES_SEED_.forEach(function (frente) {
    sugestoes.push({ tipo_lista: 'STATUS_RECIBO', frente: frente, valor: 'AGUARDANDO DISPONIBILIDADE ORCAMENTARIA', pausa: true });
    sugestoes.push({ tipo_lista: 'STATUS_RECIBO', frente: frente, valor: 'EM ANALISE', pausa: false });
    sugestoes.push({ tipo_lista: 'STATUS_RECIBO', frente: frente, valor: 'PAGO', pausa: false });
  });

  sugestoes.forEach(function (s) {
    appendObjectRow_(sheet, {
      id: proximoId_('ListasPersonalizadas'),
      tipo_lista: s.tipo_lista,
      frente: s.frente,
      valor: s.valor,
      pausa_contagem_parado: s.pausa,
      ativo: true,
      criado_por: 'rotina_seed_inicial',
      data_criacao: nowIso_()
    });
  });
}

var SOF_FRENTES_SEED_ = ['SOF-UPA', 'SOF-UPAE', 'SOF-Hospital'];
var RECIBO_FRENTES_SEED_ = ['Recibo-UPA', 'Recibo-UPAE', 'Recibo-Hospital'];
