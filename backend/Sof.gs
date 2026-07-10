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
  var pausado = opcaoTemPausaContagem_('ANDAMENTO_SOF', sof.andamento);
  return { dias_parado: dias, destacar_parado: dias > 5 && !pausado && !toBool_(sof.visualizado_apos_alerta) };
}

/** Todas as linhas de SofFontes, agrupadas por sof_id. Usado por listarSof/obterSof pra anexar fontes + total calculado. */
function agruparFontesPorSof_() {
  var linhas = sheetToObjects_(getSheet_(SHEETS.SOF_FONTES));
  var mapa = {};
  linhas.forEach(function (f) {
    delete f._row;
    (mapa[f.sof_id] = mapa[f.sof_id] || []).push(f);
  });
  return mapa;
}

function listarFontesPorSof_(sofId) {
  return sheetToObjects_(getSheet_(SHEETS.SOF_FONTES))
    .filter(function (f) { return String(f.sof_id) === String(sofId); })
    .map(function (f) { delete f._row; return f; });
}

function totalSolicitadoDeFontes_(fontes) {
  return (fontes || []).reduce(function (soma, f) { return soma + toNumber_(f.total_solicitado); }, 0);
}

function validarFontes_(fontes) {
  if (!fontes || !fontes.length) return 'Informe ao menos uma fonte.';
  for (var i = 0; i < fontes.length; i++) {
    var f = fontes[i] || {};
    if (!isNonEmpty_(f.fonte) || !isNonEmpty_(f.parcela_mensal) || !isNonEmpty_(f.total_solicitado)) {
      return 'Preencha fonte, parcela mensal e total solicitado em todas as linhas de fonte.';
    }
  }
  return null;
}

/**
 * Substitui por completo as linhas de SofFontes de um SOF (apaga as antigas e
 * recria a partir do array enviado). Mais simples e robusto que tentar
 * diferenciar linha a linha - não há necessidade de preservar o id de uma
 * linha de fonte entre edições.
 */
function substituirFontesDoSof_(sofId, fontesArray, session) {
  var sheet = getSheet_(SHEETS.SOF_FONTES);
  var existentes = sheetToObjects_(sheet).filter(function (f) { return String(f.sof_id) === String(sofId); });
  existentes
    .sort(function (a, b) { return b._row - a._row; })
    .forEach(function (f) { deleteRow_(sheet, f._row); });

  (fontesArray || []).forEach(function (item) {
    appendObjectRow_(sheet, {
      id: proximoId_('SofFontes'),
      sof_id: sofId,
      fonte: sanitizeString_(item.fonte, 50),
      parcela_mensal: toNumber_(item.parcela_mensal),
      total_solicitado: toNumber_(item.total_solicitado),
      criado_por: session.id,
      data_criacao: nowIso_()
    });
  });
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
  var erroFontes = validarFontes_(dados.fontes);
  if (erroFontes) return fail_(erroFontes);

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
    ceo: sanitizeString_(dados.ceo, 200),
    contrato: sanitizeString_(dados.contrato, 100),
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
  substituirFontesDoSof_(id, dados.fontes, session);
  registrarLog_(session, 'SOF', id, novo.criado_por, 'CRIACAO', '', 'Processo criado');

  var fontes = listarFontesPorSof_(id);
  novo.fontes = fontes;
  novo.total_solicitado = totalSolicitadoDeFontes_(fontes);
  return ok_(novo);
}

/**
 * Atualiza um SOF. Qualquer analista pode editar qualquer processo (sem
 * segmentação por frente/dono) - só gerente x analista distingue perfis.
 */
function atualizarSof(session, id, dados) {
  dados = dados || {};
  var sheet = getSheet_(SHEETS.SOF);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('SOF não encontrada.');

  if (isNonEmpty_(dados.sei) && !validarSei_(dados.sei)) return fail_('SEI fora do padrão NNNNNNNNNN.NNNNNN/AAAA-NN.');
  if (isNonEmpty_(dados.sof_numero) && !validarSofNumero_(dados.sof_numero)) return fail_('Nº SOF fora do padrão NNN/AAAA.');
  if (dados.hasOwnProperty('fontes')) {
    var erroFontes = validarFontes_(dados.fontes);
    if (erroFontes) return fail_(erroFontes);
  }

  var antigo = Object.assign({}, existente);
  var atualizado = Object.assign({}, existente);

  var camposEditaveis = ['tipo', 'sei', 'sof_numero', 'periodo_inicio', 'periodo_fim', 'andamento', 'dea', 'objeto', 'ta', 'observacao',
    'planilha_poas', 'ceo', 'contrato', 'completo',
    'oss_snapshot', 'cnpj_snapshot', 'contrato_snapshot', 'classificacao_orcamentaria_snapshot',
    'acao_snapshot', 'subacao_snapshot', 'gd_snapshot'];

  camposEditaveis.forEach(function (campo) {
    if (!dados.hasOwnProperty(campo)) return;
    if (campo === 'completo') atualizado[campo] = toBool_(dados[campo]);
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

  if (dados.hasOwnProperty('fontes')) substituirFontesDoSof_(id, dados.fontes, session);

  registrarDiferencas_(session, 'SOF', id, existente.criado_por, antigo, atualizado, ['_row']);

  var fontes = listarFontesPorSof_(id);
  atualizado.fontes = fontes;
  atualizado.total_solicitado = totalSolicitadoDeFontes_(fontes);
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
 * apenas marca excluido = true e some da listagem padrão (listarSof).
 * Qualquer perfil autenticado (analista ou gerente) pode excluir.
 */
function excluirSof(session, id) {
  var sheet = getSheet_(SHEETS.SOF);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('SOF não encontrada.');
  if (toBool_(existente.excluido)) return fail_('Este processo já foi excluído.');

  var atualizado = Object.assign({}, existente, {
    excluido: true,
    excluido_por: session.id,
    excluido_em: nowIso_()
  });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  registrarLog_(session, 'SOF', id, existente.criado_por, 'EXCLUSAO', '', 'Processo excluído (lógico)');
  return ok_({ id: id });
}

function obterSof(session, id) {
  var sof = findById_(getSheet_(SHEETS.SOF), id);
  if (!sof) return fail_('SOF não encontrada.');
  delete sof._row;
  var fontes = listarFontesPorSof_(id);
  sof.fontes = fontes;
  sof.total_solicitado = totalSolicitadoDeFontes_(fontes);
  Object.assign(sof, calcularDestaqueParadoSof_(sof));
  return ok_(sof);
}

/** Busca livre multi-campo (texto e numérico) + filtros combináveis (AND) + paginação. */
function listarSof(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.SOF));
  rows.forEach(function (r) { delete r._row; });

  rows = rows.filter(function (r) { return !toBool_(r.excluido); });

  var fontesPorSof = agruparFontesPorSof_();
  rows.forEach(function (r) {
    var fontes = fontesPorSof[r.id] || [];
    r.fontes = fontes;
    r.total_solicitado = totalSolicitadoDeFontes_(fontes);
  });

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
  if (params.fonte) {
    rows = rows.filter(function (r) {
      return r.fontes.some(function (f) { return f.fonte === params.fonte; });
    });
  }

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
