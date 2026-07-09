/**
 * GAOCG App - Gestão de Processos de SOF (Funcionalidade 3, Anexo I).
 */

var SOF_SNAPSHOT_FIELDS = ['oss', 'cnpj', 'contrato_gestao', 'classificacao_orcamentaria', 'acao', 'subacao', 'gd'];
var SOF_SNAPSHOT_MAP = {
  oss: 'oss_snapshot',
  cnpj: 'cnpj_snapshot',
  contrato_gestao: 'contrato_snapshot',
  classificacao_orcamentaria: 'classificacao_orcamentaria_snapshot',
  acao: 'acao_snapshot',
  subacao: 'subacao_snapshot',
  gd: 'gd_snapshot'
};
var SOF_FRENTES = ['SOF-UPA', 'SOF-UPAE', 'SOF-Hospital'];

function frenteDoSof_(session, dados) {
  if (session.perfil === 'gerente') {
    var frente = dados && dados.frente ? dados.frente : SOF_FRENTES[0];
    return SOF_FRENTES.indexOf(frente) !== -1 ? frente : SOF_FRENTES[0];
  }
  return session.frente;
}

/** Recalcula divergente_da_unidade comparando os campos snapshot atuais do SOF com o cadastro vigente da unidade. */
function recalcularDivergenciaSof_(sof) {
  if (!sof.unidade_id) return false;
  var unidade = findById_(getSheet_(SHEETS.UNIDADES), sof.unidade_id);
  if (!unidade) return false;
  return SOF_SNAPSHOT_FIELDS.some(function (campoUnidade) {
    var campoSnapshot = SOF_SNAPSHOT_MAP[campoUnidade];
    return String(sof[campoSnapshot] || '') !== String(unidade[campoUnidade] || '');
  });
}

function aplicarSnapshotUnidadeSof_(sof, unidade) {
  SOF_SNAPSHOT_FIELDS.forEach(function (campoUnidade) {
    var campoSnapshot = SOF_SNAPSHOT_MAP[campoUnidade];
    sof[campoSnapshot] = unidade[campoUnidade] || '';
  });
}

function diasSemAlteracao_(dataIso) {
  if (!dataIso) return 0;
  var data = new Date(dataIso);
  if (isNaN(data.getTime())) return 0;
  var diffMs = new Date().getTime() - data.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function calcularDestaqueParadoSof_(sof) {
  var dias = diasSemAlteracao_(sof.data_ultima_alteracao_andamento || sof.data_criacao);
  var pausado = opcaoTemPausaContagem_('ANDAMENTO_SOF', sof.frente, sof.andamento);
  return { dias_parado: dias, destacar_parado: dias > 5 && !pausado && !toBool_(sof.visualizado_apos_alerta) };
}

function criarSof(session, dados) {
  dados = dados || {};
  if (!dados.unidade_id) return fail_('Selecione a unidade.');

  var unidade = findById_(getSheet_(SHEETS.UNIDADES), dados.unidade_id);
  if (!unidade) return fail_('Unidade não encontrada.');

  if (isNonEmpty_(dados.sei) && !validarSei_(dados.sei)) {
    return fail_('SEI fora do padrão NNNNNNNNNN.NNNNNN/AAAA-NN.');
  }
  if (isNonEmpty_(dados.sof_numero) && !validarSofNumero_(dados.sof_numero)) {
    return fail_('Nº SOF fora do padrão NNN/AAAA.');
  }

  var id = proximoId_('SOF');
  var novo = {
    id: id,
    unidade_id: dados.unidade_id,
    divergente_da_unidade: false,
    tipo: sanitizeString_(dados.tipo, 50),
    sei: sanitizeString_(dados.sei, 30),
    sof_numero: sanitizeString_(dados.sof_numero, 20),
    periodo_inicio: sanitizeString_(dados.periodo_inicio, 10),
    periodo_fim: sanitizeString_(dados.periodo_fim, 10),
    andamento: sanitizeString_(dados.andamento, 200),
    dea: sanitizeString_(dados.dea, 200),
    objeto: sanitizeString_(dados.objeto, 2000),
    ta: sanitizeString_(dados.ta, 50),
    observacao: sanitizeString_(dados.observacao, 2000),
    planilha_poas: sanitizeString_(dados.planilha_poas, 200),
    parcela_mensal: toNumber_(dados.parcela_mensal),
    fonte: sanitizeString_(dados.fonte, 50),
    ceo: sanitizeString_(dados.ceo, 200),
    contrato: sanitizeString_(dados.contrato, 100),
    total_solicitado: toNumber_(dados.total_solicitado),
    frente: frenteDoSof_(session, dados),
    completo: toBool_(dados.completo),
    criado_por: session.id,
    data_criacao: nowIso_(),
    data_ultima_alteracao_andamento: nowIso_(),
    visualizado_apos_alerta: true,
    possui_ne: false,
    excluido: false
  };

  // Autopreenchimento por snapshot; se o usuário já digitou um valor manual, ele prevalece
  // e o sistema calcula divergência em relação ao cadastro atual da unidade.
  aplicarSnapshotUnidadeSof_(novo, unidade);
  SOF_SNAPSHOT_FIELDS.forEach(function (campoUnidade) {
    var campoSnapshot = SOF_SNAPSHOT_MAP[campoUnidade];
    if (isNonEmpty_(dados[campoSnapshot])) novo[campoSnapshot] = sanitizeString_(dados[campoSnapshot], 200);
  });
  novo.divergente_da_unidade = recalcularDivergenciaSof_(novo);

  appendObjectRow_(getSheet_(SHEETS.SOF), novo);
  registrarLog_(session, 'SOF', id, novo.frente, 'CRIACAO', '', 'Processo criado');
  return ok_(novo);
}

/**
 * Atualiza um SOF. Se o processo pertence a outra frente e quem edita não é
 * gerente, exige dados.confirmado === true (o front já mostrou o modal de
 * confirmação da Funcionalidade 6); sem isso, retorna precisaConfirmacao.
 */
function atualizarSof(session, id, dados) {
  dados = dados || {};
  var sheet = getSheet_(SHEETS.SOF);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('SOF não encontrada.');

  var foraDaFrente = session.perfil !== 'gerente' && session.frente !== existente.frente;
  if (foraDaFrente && dados.confirmado !== true) {
    return ok_({ precisaConfirmacao: true, frente_processo: existente.frente });
  }

  if (isNonEmpty_(dados.sei) && !validarSei_(dados.sei)) return fail_('SEI fora do padrão NNNNNNNNNN.NNNNNN/AAAA-NN.');
  if (isNonEmpty_(dados.sof_numero) && !validarSofNumero_(dados.sof_numero)) return fail_('Nº SOF fora do padrão NNN/AAAA.');

  var antigo = Object.assign({}, existente);
  var atualizado = Object.assign({}, existente);

  var camposEditaveis = ['tipo', 'sei', 'sof_numero', 'periodo_inicio', 'periodo_fim', 'andamento', 'dea', 'objeto', 'ta', 'observacao',
    'planilha_poas', 'parcela_mensal', 'fonte', 'ceo', 'contrato', 'total_solicitado', 'completo',
    'oss_snapshot', 'cnpj_snapshot', 'contrato_snapshot', 'classificacao_orcamentaria_snapshot',
    'acao_snapshot', 'subacao_snapshot', 'gd_snapshot'];

  camposEditaveis.forEach(function (campo) {
    if (!dados.hasOwnProperty(campo)) return;
    if (campo === 'parcela_mensal' || campo === 'total_solicitado') atualizado[campo] = toNumber_(dados[campo]);
    else if (campo === 'completo') atualizado[campo] = toBool_(dados[campo]);
    else atualizado[campo] = sanitizeString_(dados[campo], 2000);
  });

  if (atualizado.andamento !== existente.andamento) {
    atualizado.data_ultima_alteracao_andamento = nowIso_();
    atualizado.visualizado_apos_alerta = false;
  }

  atualizado.divergente_da_unidade = recalcularDivergenciaSof_(atualizado);

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  registrarDiferencas_(session, 'SOF', id, existente.frente, antigo, atualizado, ['_row']);
  return ok_(atualizado);
}

/** A visualização (não necessariamente a edição) já é suficiente para reconhecer o destaque de "parado". */
function marcarSofVisualizado(session, id) {
  var sheet = getSheet_(SHEETS.SOF);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('SOF não encontrada.');
  var atualizado = Object.assign({}, existente, { visualizado_apos_alerta: true });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  return ok_({ id: id });
}

/**
 * Exclusão lógica (soft delete): mantém a linha e o histórico de auditoria,
 * apenas marca excluido = true e some da listagem padrão (listarSof). Mais
 * restrita que a edição cruzada: só gerente ou o analista da frente
 * responsável pelo processo pode excluir (não vale confirmação como na edição).
 */
function excluirSof(session, id) {
  var sheet = getSheet_(SHEETS.SOF);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('SOF não encontrada.');
  if (toBool_(existente.excluido)) return fail_('Este processo já foi excluído.');

  var podeExcluir = session.perfil === 'gerente' || session.frente === existente.frente;
  if (!podeExcluir) return fail_('Você não tem permissão para excluir este processo.');

  var atualizado = Object.assign({}, existente, {
    excluido: true,
    excluido_por: session.id,
    excluido_em: nowIso_()
  });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  registrarLog_(session, 'SOF', id, existente.frente, 'EXCLUSAO', '', 'Processo excluído (lógico)');
  return ok_({ id: id });
}

function obterSof(session, id) {
  var sof = findById_(getSheet_(SHEETS.SOF), id);
  if (!sof) return fail_('SOF não encontrada.');
  delete sof._row;
  Object.assign(sof, calcularDestaqueParadoSof_(sof));
  return ok_(sof);
}

/** Busca livre multi-campo (texto e numérico) + filtros combináveis (AND) + paginação. */
function listarSof(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.SOF));
  rows.forEach(function (r) { delete r._row; });

  rows = rows.filter(function (r) { return !toBool_(r.excluido); });

  if (session.perfil !== 'gerente' && params.apenasMinhaFrente !== false) {
    // Analista vê todas as frentes na listagem (Func 7 é transversal); apenas a permissão de edição é restrita.
  }

  if (params.unidade_id) rows = rows.filter(function (r) { return String(r.unidade_id) === String(params.unidade_id); });
  if (params.oss) {
    var ossBusca = String(params.oss).toLowerCase();
    rows = rows.filter(function (r) { return String(r.oss_snapshot || '').toLowerCase().indexOf(ossBusca) !== -1; });
  }
  if (params.objeto) {
    var objetoBusca = String(params.objeto).toLowerCase();
    rows = rows.filter(function (r) { return String(r.objeto || '').toLowerCase().indexOf(objetoBusca) !== -1; });
  }
  if (params.dea) rows = rows.filter(function (r) { return r.dea === params.dea; });
  if (params.tipo_unidade) {
    var unidadesDoTipo = sheetToObjects_(getSheet_(SHEETS.UNIDADES))
      .filter(function (u) { return u.tipo === params.tipo_unidade; })
      .map(function (u) { return String(u.id); });
    rows = rows.filter(function (r) { return unidadesDoTipo.indexOf(String(r.unidade_id)) !== -1; });
  }
  if (params.andamento) rows = rows.filter(function (r) { return r.andamento === params.andamento; });
  if (params.fonte) rows = rows.filter(function (r) { return r.fonte === params.fonte; });
  if (params.frente) rows = rows.filter(function (r) { return r.frente === params.frente; });

  var busca = sanitizeString_(params.busca, 200).toLowerCase();
  if (busca) {
    rows = rows.filter(function (r) {
      return Object.keys(r).some(function (campo) {
        var valor = r[campo];
        if (valor === null || valor === undefined) return false;
        return String(valor).toLowerCase().indexOf(busca) !== -1;
      });
    });
  }

  rows.forEach(function (r) { Object.assign(r, calcularDestaqueParadoSof_(r)); });
  rows.sort(function (a, b) { return b.data_criacao < a.data_criacao ? -1 : 1; });

  var pageSize = Number(params.pageSize) || 20;
  var page = Number(params.page) || 1;
  var total = rows.length;
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);

  var idsComNe = pageRows.filter(function (r) { return toBool_(r.possui_ne); }).map(function (r) { return r.id; });
  if (idsComNe.length) {
    var numerosPorSof = {};
    sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).forEach(function (n) {
      if (idsComNe.indexOf(n.sof_id) === -1 || !n.numero_ne) return;
      (numerosPorSof[n.sof_id] = numerosPorSof[n.sof_id] || []).push(n.numero_ne);
    });
    pageRows.forEach(function (r) { r.notas_empenho_numeros = numerosPorSof[r.id] || []; });
  }

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize });
}
