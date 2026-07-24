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
  var unidade = buscarUnidadePorId_(sof.unidade_id);
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

/**
 * Campos "livres" do SOF (texto/booleano simples, sem regra de negócio
 * própria) - reaproveitado por criarSof e atualizarSof pra não duplicar essa
 * lista enorme duas vezes (antes só atualizarSof tinha; criarSof nunca
 * gravava nenhum campo sei_*, ver PROGRESS.md sessão de fusão do formulário
 * "Criar SOF - SEI" na criação). Inclui os campos snapshot (oss_snapshot
 * etc.) porque atualizarSof sempre tratou eles como texto comum (edição
 * direta, sem re-derivar de novo da unidade) - criarSof filtra esses campos
 * fora deste array antes de usar o loop genérico, porque lá eles têm uma
 * lógica própria (aplicarSnapshotUnidadeSof_ + override, ver abaixo).
 */
var CAMPOS_LIVRES_SOF_ = ['tipo', 'sei', 'sof_numero', 'periodo_inicio', 'periodo_fim', 'andamento', 'dea', 'objeto', 'ta',
  'observacao', 'planilha_poas', 'ceo', 'contrato', 'completo',
  'oss_snapshot', 'cnpj_snapshot', 'contrato_snapshot', 'classificacao_orcamentaria_snapshot',
  'acao_snapshot', 'subacao_snapshot', 'gd_snapshot',
  // Campos do documento "Criar SOF - SEI" - todos opcionais, sem validação de
  // formato (documento administrativo, não usado em cálculo/filtro em nenhum
  // outro lugar do app). Disponíveis já na criação do SOF a partir desta sessão.
  'sei_numero_documento', 'sei_data', 'sei_tipo_solicitacao', 'sei_previsto_pca', 'sei_numero_pca', 'sei_numero_dfd',
  'sei_tipo_pleito', 'sei_justificativa_pleito', 'sei_area_setor_solicitante', 'sei_tema_poas', 'sei_objeto_despesa',
  'sei_destinacao', 'sei_credor', 'sei_credor_cnpj', 'sei_acao', 'sei_subacao', 'sei_grupo_despesa',
  'sei_medida_compensatoria_poas', 'sei_manutencao_linhas',
  'sei_convenio_numero', 'sei_convenio_efisco', 'sei_convenio_conta', 'sei_convenio_banco',
  'sei_contrapartida_convenio', 'sei_contrapartida_conta', 'sei_contrapartida_banco',
  'sei_solicitante_nome', 'sei_solicitante_cargo', 'sei_solicitante_setor',
  'sei_ordenador_nome', 'sei_ordenador_cargo', 'sei_ordenador_setor',
  'sei_assinatura_ne_nome', 'sei_assinatura_ne_cargo',
  'sei_assinatura_nl_nome', 'sei_assinatura_nl_cargo'];

/**
 * Espelha ETAPAS_ANDAMENTO de js/sof.js (13 etapas fixas do processo, em
 * ordem). Duplicado aqui porque o backend não tinha noção de ordem até agora
 * - qualquer mudança nas etapas precisa ser replicada nos dois arquivos.
 */
var ETAPAS_ANDAMENTO_ = [
  'SES-NP_DGPO', 'SES-DGPO', 'SES', 'NAP_POAS', 'SES-GPOAS', 'SES-GORC', 'SES-GPF',
  'SES-CEO_GAOCG', 'SES-DGMCG', 'SES-GEMP', 'NE EMITIDA', 'SES-CJCG', 'C.G./T.A. FORMALIZADO'
];

function diasSemAlteracao_(dataIso) {
  if (!dataIso) return 0;
  var data = new Date(dataIso);
  if (isNaN(data.getTime())) return 0;
  var diffMs = new Date().getTime() - data.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * listasCarregadas é opcional: quando listarSof processa várias linhas de uma
 * vez, ele carrega ListasPersonalizadas uma única vez e repassa aqui, em vez
 * de cada linha bater no cache de novo (ver RELATORIO_LENTIDAO_SOF.md).
 */
function calcularDestaqueParadoSof_(sof, listasCarregadas) {
  var dias = diasSemAlteracao_(sof.data_ultima_alteracao_andamento || sof.data_criacao);
  var pausado = opcaoTemPausaContagem_('ANDAMENTO_SOF', sof.andamento, listasCarregadas);
  return { dias_parado: dias, destacar_parado: dias > 5 && !pausado && !toBool_(sof.visualizado_apos_alerta) };
}

/**
 * Lê a aba SofFontes inteira, com cache de 30s (mesmo padrão de
 * todasOpcoesComCache_ em ListasPersonalizadas.gs). listarSof lia essa aba
 * do zero em toda chamada, mesmo sem nenhuma fonte ter mudado - somado às
 * outras leituras da mesma chamada (SOF, NotasEmpenho), isso tornava a tela
 * de SOF a mais lenta do app pra trocar de aba.
 */
function todasFontesComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'sof_fontes';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.SOF_FONTES));
  rows.forEach(function (f) { delete f._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheFontes_() {
  CacheService.getScriptCache().remove('sof_fontes');
}

/**
 * Cronograma mensal (Jan-Dez) por Fonte, com cache de 30s - mesmo padrão de
 * todoCronogramaComCache_ (NotasEmpenho.gs). Sessão de fusão do formulário
 * "Criar SOF - SEI" na criação do SOF (ver PROGRESS.md): cada Fonte passa a
 * ter 12 valores mensais em vez de um único "Total Solicitado" digitado à mão.
 */
function todasFontesCronogramaComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'sof_fontes_cronograma';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.SOF_FONTES_CRONOGRAMA));
  rows.forEach(function (c) { delete c._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheFontesCronograma_() {
  CacheService.getScriptCache().remove('sof_fontes_cronograma');
}

/** Cronograma agrupado por sof_fonte_id, ordenado por mês. */
function agruparCronogramaPorFonte_() {
  var mapa = {};
  todasFontesCronogramaComCache_().forEach(function (c) {
    (mapa[c.sof_fonte_id] = mapa[c.sof_fonte_id] || []).push({ mes: toNumber_(c.mes), valor: toNumber_(c.valor) });
  });
  Object.keys(mapa).forEach(function (id) { mapa[id].sort(function (a, b) { return a.mes - b.mes; }); });
  return mapa;
}

/**
 * Todas as linhas de SofFontes com o cronograma de cada uma já anexado
 * (fonte.cronograma) - ponto único de junção entre as duas abas, usado tanto
 * por agruparFontesPorSof_ (listarSof) quanto por listarFontesPorSof_
 * (obterSof), pra nunca haver dois lugares que podem divergir sobre isso.
 * Importante: listarSof precisa mesmo trazer o cronograma, porque
 * abrirSofExistente (js/sof.js) reaproveita o item já carregado por listarSof
 * pra reabrir a edição, sem chamar obterSof de novo (otimização de
 * performance de uma sessão anterior) - sem isso, reabrir um SOF pra editar
 * mostraria os 12 meses em branco mesmo com dado salvo.
 */
function fontesComCronograma_() {
  var cronoPorFonte = agruparCronogramaPorFonte_();
  return todasFontesComCache_().map(function (f) {
    return Object.assign({}, f, { cronograma: cronoPorFonte[f.id] || [] });
  });
}

/** Todas as linhas de SofFontes (com cronograma), agrupadas por sof_id. Usado por listarSof/obterSof pra anexar fontes + total calculado. */
function agruparFontesPorSof_() {
  var mapa = {};
  fontesComCronograma_().forEach(function (f) {
    (mapa[f.sof_id] = mapa[f.sof_id] || []).push(f);
  });
  return mapa;
}

function listarFontesPorSof_(sofId) {
  return fontesComCronograma_().filter(function (f) { return String(f.sof_id) === String(sofId); });
}

function totalSolicitadoDeFontes_(fontes) {
  return (fontes || []).reduce(function (soma, f) { return soma + toNumber_(f.total_solicitado); }, 0);
}

/**
 * fonte e parcela_mensal continuam obrigatórios por linha; total_solicitado
 * saiu da validação (deixou de ser digitado, agora é calculado a partir do
 * cronograma) - no lugar, exige que a soma dos meses preenchidos seja > 0,
 * pra não deixar passar uma linha de fonte vazia/zerada (que viraria um
 * "R$0,00 solicitado" silencioso no card e no CSV).
 */
function validarFontes_(fontes) {
  if (!fontes || !fontes.length) return 'Informe ao menos uma fonte.';
  for (var i = 0; i < fontes.length; i++) {
    var f = fontes[i] || {};
    if (!isNonEmpty_(f.fonte) || !isNonEmpty_(f.parcela_mensal)) {
      return 'Preencha fonte e parcela mensal em todas as linhas de fonte.';
    }
    var soma = (f.cronograma || []).reduce(function (s, c) { return s + toNumber_(c.valor); }, 0);
    if (soma <= 0) return 'Preencha ao menos um mês com valor maior que zero em cada linha de fonte.';
  }
  return null;
}

/**
 * Substitui por completo as linhas de SofFontes de um SOF (apaga as antigas e
 * recria a partir do array enviado), e junto o cronograma mensal de cada uma
 * (SofFontesCronograma) - mesmo princípio de apagar-e-recriar, um nível
 * abaixo. total_solicitado é calculado aqui como soma do cronograma, nunca
 * confiado como veio do frontend. Meses em branco (sem valor) não geram linha
 * no cronograma - só os meses realmente preenchidos.
 */
function substituirFontesDoSof_(sofId, fontesArray, session) {
  var sheet = getSheet_(SHEETS.SOF_FONTES);
  var existentes = sheetToObjects_(sheet).filter(function (f) { return String(f.sof_id) === String(sofId); });
  var idsAntigos = existentes.map(function (f) { return f.id; });
  existentes
    .sort(function (a, b) { return b._row - a._row; })
    .forEach(function (f) { deleteRow_(sheet, f._row); });

  var cronoSheet = getSheet_(SHEETS.SOF_FONTES_CRONOGRAMA);
  var cronoAntigo = sheetToObjects_(cronoSheet).filter(function (c) { return idsAntigos.indexOf(c.sof_fonte_id) !== -1; });
  cronoAntigo
    .sort(function (a, b) { return b._row - a._row; })
    .forEach(function (c) { deleteRow_(cronoSheet, c._row); });

  (fontesArray || []).forEach(function (item) {
    var cronograma = (item.cronograma || []).filter(function (c) {
      return Number(c.mes) >= 1 && Number(c.mes) <= 12 && isNonEmpty_(c.valor);
    });
    var totalSolicitado = cronograma.reduce(function (s, c) { return s + toNumber_(c.valor); }, 0);
    var fonteId = proximoId_('SofFontes');

    appendObjectRow_(sheet, {
      id: fonteId,
      sof_id: sofId,
      fonte: sanitizeString_(item.fonte, 50),
      codigo_poas: sanitizeString_(item.codigo_poas, 50),
      parcela_mensal: toNumber_(item.parcela_mensal),
      total_solicitado: totalSolicitado,
      criado_por: session.id,
      data_criacao: nowIso_()
    });

    cronograma.forEach(function (c) {
      appendObjectRow_(cronoSheet, {
        id: proximoId_('SofFontesCronograma'),
        sof_fonte_id: fonteId,
        mes: Number(c.mes),
        valor: toNumber_(c.valor),
        criado_por: session.id,
        data_criacao: nowIso_()
      });
    });
  });
  invalidarCacheFontes_();
  invalidarCacheFontesCronograma_();
}

function criarSof(session, dados) {
  dados = dados || {};
  if (!dados.unidade_id) return fail_('Selecione a unidade.');

  var unidade = buscarUnidadePorId_(dados.unidade_id);
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
    criado_por: session.id,
    data_criacao: nowIso_(),
    data_ultima_alteracao_andamento: nowIso_(),
    visualizado_apos_alerta: true,
    possui_ne: false,
    excluido: false
  };

  // Todos os campos "livres" (inclusive os sei_* do documento SEI, já
  // disponíveis na criação a partir desta sessão) exceto os snapshot, que têm
  // lógica própria logo abaixo (default a partir da unidade + override manual).
  var camposSnapshotValores_ = Object.keys(SOF_SNAPSHOT_MAP).map(function (k) { return SOF_SNAPSHOT_MAP[k]; });
  CAMPOS_LIVRES_SOF_.forEach(function (campo) {
    if (camposSnapshotValores_.indexOf(campo) !== -1) return;
    if (campo === 'completo') novo[campo] = toBool_(dados[campo]);
    else novo[campo] = sanitizeString_(dados[campo], 2000);
  });

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

  CAMPOS_LIVRES_SOF_.forEach(function (campo) {
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

  // data_ultima_alteracao_andamento/visualizado_apos_alerta são derivados (mudam sozinhos
  // junto de andamento, não são uma edição real do usuário) - fora do log evita 2 linhas
  // de auditoria extras (e 2 escritas a mais no Sheets) a cada troca de andamento.
  registrarDiferencas_(session, 'SOF', id, existente.criado_por, antigo, atualizado,
    ['_row', 'data_ultima_alteracao_andamento', 'visualizado_apos_alerta']);

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

  var unidadeIds = paraArrayFiltro_(params.unidade_id);
  if (unidadeIds.length) rows = rows.filter(function (r) { return unidadeIds.indexOf(String(r.unidade_id)) !== -1; });

  var ossValores = paraArrayFiltro_(params.oss).map(function (v) { return v.toLowerCase(); });
  if (ossValores.length) {
    rows = rows.filter(function (r) {
      var ossLinha = String(r.oss_snapshot || '').toLowerCase();
      return ossValores.some(function (v) { return ossLinha.indexOf(v) !== -1; });
    });
  }

  var objetoValores = paraArrayFiltro_(params.objeto).map(function (v) { return v.toLowerCase(); });
  if (objetoValores.length) {
    rows = rows.filter(function (r) {
      var objetoLinha = String(r.objeto || '').toLowerCase();
      return objetoValores.some(function (v) { return objetoLinha.indexOf(v) !== -1; });
    });
  }

  var deaValores = paraArrayFiltro_(params.dea);
  if (deaValores.length) rows = rows.filter(function (r) { return deaValores.indexOf(r.dea) !== -1; });

  var tipoUnidadeValores = paraArrayFiltro_(params.tipo_unidade);
  if (tipoUnidadeValores.length) {
    var unidadesDosTipos = todasUnidadesComCache_()
      .filter(function (u) { return tipoUnidadeValores.indexOf(u.tipo) !== -1; })
      .map(function (u) { return String(u.id); });
    rows = rows.filter(function (r) { return unidadesDosTipos.indexOf(String(r.unidade_id)) !== -1; });
  }
  if (params.andamento) rows = rows.filter(function (r) { return r.andamento === params.andamento; });

  var fonteValores = paraArrayFiltro_(params.fonte);
  if (fonteValores.length) {
    rows = rows.filter(function (r) {
      return r.fontes.some(function (f) { return fonteValores.indexOf(f.fonte) !== -1; });
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

  rows.sort(function (a, b) { return b.data_criacao < a.data_criacao ? -1 : 1; });

  var pageSize = Number(params.pageSize) || 20;
  var page = Number(params.page) || 1;
  var total = rows.length;
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);

  // destacar_parado só é exibido, nunca filtrado/ordenado - calcular só na
  // página visível (não em "rows" inteiro) e reaproveitar uma única leitura
  // de ListasPersonalizadas evita o N+1 de opcaoTemPausaContagem_ (ver
  // RELATORIO_LENTIDAO_SOF.md).
  var listasCarregadas = todasOpcoesComCache_();
  pageRows.forEach(function (r) { Object.assign(r, calcularDestaqueParadoSof_(r, listasCarregadas)); });

  var idsComNe = pageRows.filter(function (r) { return toBool_(r.possui_ne); }).map(function (r) { return r.id; });
  if (idsComNe.length) {
    var numerosPorSof = {};
    todasNotasEmpenhoComCache_().forEach(function (n) {
      if (idsComNe.indexOf(n.sof_id) === -1 || !n.numero_ne) return;
      (numerosPorSof[n.sof_id] = numerosPorSof[n.sof_id] || []).push(n.numero_ne);
    });
    pageRows.forEach(function (r) { r.notas_empenho_numeros = numerosPorSof[r.id] || []; });
  }

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize });
}
