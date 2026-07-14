/**
 * GAOCG App - Opções globais de "andamento" (SOF) e "status" (Recibo)
 * (Funcionalidades 3, 4 e 8).
 */

var TIPOS_LISTA = ['ANDAMENTO_SOF', 'STATUS_RECIBO', 'OSS', 'OBJETO'];

/**
 * Lê a aba ListasPersonalizadas inteira, com cache de 30s. Sem isso,
 * opcaoTemPausaContagem_ relia essa aba do zero a cada chamada - e é chamada
 * uma vez por linha em listarSof/listarRecibos (N+1). Ver
 * RELATORIO_LENTIDAO_SOF.md. Prefira passar o resultado desta função adiante
 * (parâmetro listasPreCarregadas) quando for chamar em loop, em vez de deixar
 * cada chamada bater no cache de novo.
 */
function todasOpcoesComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'listas_personalizadas';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.LISTAS));
  rows.forEach(function (l) { delete l._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheListas_() {
  CacheService.getScriptCache().remove('listas_personalizadas');
}

/** Todos os perfis veem o mesmo conjunto global de opções ativas daquele tipo_lista. */
function listarOpcoes(session, params) {
  params = params || {};
  var tipoLista = params.tipo_lista;
  if (TIPOS_LISTA.indexOf(tipoLista) === -1) return fail_('tipo_lista inválido.');

  var rows = todasOpcoesComCache_().filter(function (l) {
    return l.tipo_lista === tipoLista && toBool_(l.ativo);
  });

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
  invalidarCacheListas_();
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
  invalidarCacheListas_();
  return ok_(atualizado);
}

/** Carga única (rodar manualmente no editor): popula a lista OSS a partir dos valores já cadastrados em Unidades. */
function semearListaOSS() {
  var existentes = todasOpcoesComCache_().filter(function (l) { return l.tipo_lista === 'OSS'; }).map(function (l) { return l.valor; });
  var valores = Array.from(new Set(sheetToObjects_(getSheet_(SHEETS.UNIDADES)).map(function (u) { return sanitizeString_(u.oss, 200); }).filter(isNonEmpty_)));
  var sheet = getSheet_(SHEETS.LISTAS);
  valores.filter(function (v) { return existentes.indexOf(v) === -1; }).forEach(function (v) {
    appendObjectRow_(sheet, { id: proximoId_('ListasPersonalizadas'), tipo_lista: 'OSS', valor: v, pausa_contagem_parado: false, ativo: true, criado_por: 'rotina_semeadura', data_criacao: nowIso_() });
  });
  invalidarCacheListas_();
}

/** Carga única (rodar manualmente no editor): popula a lista OBJETO a partir dos valores já usados em SOF e Recibos. */
function semearListaObjetos() {
  var existentes = todasOpcoesComCache_().filter(function (l) { return l.tipo_lista === 'OBJETO'; }).map(function (l) { return l.valor; });
  var doSof = sheetToObjects_(getSheet_(SHEETS.SOF)).map(function (s) { return sanitizeString_(s.objeto, 500); });
  var doRecibo = sheetToObjects_(getSheet_(SHEETS.RECIBOS)).map(function (r) { return sanitizeString_(r.objeto, 500); });
  var valores = Array.from(new Set(doSof.concat(doRecibo).filter(isNonEmpty_)));
  var sheet = getSheet_(SHEETS.LISTAS);
  valores.filter(function (v) { return existentes.indexOf(v) === -1; }).forEach(function (v) {
    appendObjectRow_(sheet, { id: proximoId_('ListasPersonalizadas'), tipo_lista: 'OBJETO', valor: v, pausa_contagem_parado: false, ativo: true, criado_por: 'rotina_semeadura', data_criacao: nowIso_() });
  });
  invalidarCacheListas_();
}

/**
 * Usado internamente para saber se o andamento/status atual de um processo é
 * espera externa conhecida. Aceita um array já carregado (listasPreCarregadas)
 * para evitar reler/rebuscar o cache uma vez por linha em loops de listagem
 * (listarSof/listarRecibos) - se omitido, busca (com cache) sozinho.
 */
function opcaoTemPausaContagem_(tipoLista, valor, listasPreCarregadas) {
  if (!valor) return false;
  var rows = listasPreCarregadas || todasOpcoesComCache_();
  for (var i = 0; i < rows.length; i++) {
    var l = rows[i];
    if (l.tipo_lista === tipoLista && l.valor === valor) {
      return toBool_(l.pausa_contagem_parado);
    }
  }
  return false;
}
