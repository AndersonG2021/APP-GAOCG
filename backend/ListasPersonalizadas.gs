/**
 * GAOCG App - Opções globais de "andamento" (SOF) e "status" (Recibo)
 * (Funcionalidades 3, 4 e 8).
 */

var TIPOS_LISTA = ['ANDAMENTO_SOF', 'STATUS_RECIBO'];

/** Todos os perfis veem o mesmo conjunto global de opções ativas daquele tipo_lista. */
function listarOpcoes(session, params) {
  params = params || {};
  var tipoLista = params.tipo_lista;
  if (TIPOS_LISTA.indexOf(tipoLista) === -1) return fail_('tipo_lista inválido.');

  var rows = sheetToObjects_(getSheet_(SHEETS.LISTAS)).filter(function (l) {
    return l.tipo_lista === tipoLista && toBool_(l.ativo);
  });

  rows.forEach(function (l) { delete l._row; });
  return ok_(rows);
}

/** Qualquer analista ou gerente pode cadastrar uma nova opção, visível globalmente. */
function criarOpcao(session, dados) {
  dados = dados || {};
  var tipoLista = dados.tipo_lista;
  if (TIPOS_LISTA.indexOf(tipoLista) === -1) return fail_('tipo_lista inválido.');

  var valor = sanitizeString_(dados.valor, 200);
  if (!valor) return fail_('Informe o texto da opção.');

  var sheet = getSheet_(SHEETS.LISTAS);
  var id = proximoId_('ListasPersonalizadas');
  var novo = {
    id: id,
    tipo_lista: tipoLista,
    valor: valor,
    pausa_contagem_parado: toBool_(dados.pausa_contagem_parado),
    ativo: true,
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(sheet, novo);
  return ok_(novo);
}

/** Apenas o gerente pode corrigir pausa_contagem_parado ou inativar uma opção. */
function atualizarOpcao(session, id, dados) {
  requireGerente_(session);
  dados = dados || {};
  var sheet = getSheet_(SHEETS.LISTAS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Opção não encontrada.');

  var atualizado = Object.assign({}, existente);
  if (dados.hasOwnProperty('pausa_contagem_parado')) atualizado.pausa_contagem_parado = toBool_(dados.pausa_contagem_parado);
  if (dados.hasOwnProperty('ativo')) atualizado.ativo = toBool_(dados.ativo);
  if (dados.hasOwnProperty('valor')) atualizado.valor = sanitizeString_(dados.valor, 200);

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  return ok_(atualizado);
}

/** Usado internamente para saber se o andamento/status atual de um processo é espera externa conhecida. */
function opcaoTemPausaContagem_(tipoLista, valor) {
  if (!valor) return false;
  var rows = sheetToObjects_(getSheet_(SHEETS.LISTAS));
  for (var i = 0; i < rows.length; i++) {
    var l = rows[i];
    if (l.tipo_lista === tipoLista && l.valor === valor) {
      return toBool_(l.pausa_contagem_parado);
    }
  }
  return false;
}
