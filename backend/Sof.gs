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
 * Lê a aba SOF inteira, com cache de 30s - mesmo padrão de
 * todasRecibosComCache_ (Recibos.gs) / todasNotasEmpenhoComCache_
 * (NotasEmpenho.gs) / todasUnidadesComCache_ (Unidades.gs).
 *
 * Lacuna encontrada na varredura de 2026-08-07: TODAS as outras abas grandes
 * já tinham cache de leitura - a SOF, que é a MAIS LARGA do projeto (60+
 * colunas), era a única sem. Ela era relida crua em listarSof, obterDashboard,
 * obterGraficoDashboard, listarNotasEmpenhoPorUnidade,
 * listarObjetosSofPorUnidade, montarGruposNotasEmpenho_, mapaDeaPorNumeroNe_ e
 * montarLinhasSof_. Caso concreto: ao escolher a unidade no "Novo processo de
 * Recibo", o frontend dispara 3 chamadas em paralelo (js/recibos.js) e DUAS
 * delas liam a aba SOF inteira, cada uma por conta própria.
 *
 * Como as linhas voltam de JSON.parse (objetos novos a cada chamada), quem
 * consome pode mutar à vontade - listarSof anexa fontes/total_solicitado,
 * dashboardSofPendenteNe_ anexa dias_aguardando - sem contaminar o cache, que
 * guarda só a string.
 *
 * IMPORTANTE: só serve para LEITURA. O cache não guarda `_row`, então todo
 * ponto que precisa saber em qual linha gravar (criarSof, atualizarSof,
 * marcarSofVisualizado, excluirSof, obterSof, criarNotaEmpenho,
 * criarReforcosEmLote, excluirNotaEmpenho) continua usando
 * findById_/sheetToObjects_ direto na aba - mesma regra já documentada em
 * todasRecibosComCache_.
 */
function todosSofComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'sof_todos';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.SOF));
  rows.forEach(function (s) { delete s._row; });
  cachePut_(cache, chave, rows, 30);
  return rows;
}

/**
 * Precisa ser chamada em TODA escrita na aba SOF, senão a tela serve dado
 * velho por até 30s. Os 6 pontos que escrevem são: criarSof, atualizarSof,
 * marcarSofVisualizado e excluirSof (aqui em Sof.gs) + criarNotaEmpenho e
 * excluirNotaEmpenho (NotasEmpenho.gs, que mexem em possui_ne/andamento do
 * SOF). Se um novo ponto de escrita em SOF for criado, ele precisa chamar isto.
 */
function invalidarCacheSof_() {
  CacheService.getScriptCache().remove('sof_todos');
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
  cachePut_(cache, chave, rows, 30);
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
  cachePut_(cache, chave, rows, 30);
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
    // objeto por fonte (sessão 2026-07-29): obrigatório - é o que amarra
    // NE/Recibo ao objeto certo dentro do SOF (ver montarGruposNotasEmpenho_,
    // NotasEmpenho.gs, e docs/ESPECIFICACAO_NOVO_DASHBOARD.md).
    if (!isNonEmpty_(f.objeto)) return 'Informe o objeto de cada linha de fonte.';
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
  var cronoSheet = getSheet_(SHEETS.SOF_FONTES_CRONOGRAMA);

  var existentes = sheetToObjects_(sheet).filter(function (f) { return String(f.sof_id) === String(sofId); });
  var idsAntigos = existentes.map(function (f) { return f.id; });
  var cronoAntigo = sheetToObjects_(cronoSheet).filter(function (c) { return idsAntigos.indexOf(c.sof_fonte_id) !== -1; });

  // Apaga cronograma e fontes antigos em lote (blocos contíguos num único
  // deleteRows), em vez de uma chamada deleteRow por linha - ver
  // deleteRowsEmLote_ (Utils.gs) e RELATORIO_LENTIDAO_SOF.md.
  deleteRowsEmLote_(cronoSheet, cronoAntigo.map(function (c) { return c._row; }));
  deleteRowsEmLote_(sheet, existentes.map(function (f) { return f._row; }));

  var fontes = fontesArray || [];
  if (!fontes.length) {
    invalidarCacheFontes_();
    invalidarCacheFontesCronograma_();
    return;
  }

  // Prepara os cronogramas válidos de cada fonte e reserva TODOS os IDs de uma
  // vez (um lock por aba, não um por linha - antes eram dezenas de ciclos de
  // LockService/Contadores por salvamento, o maior componente da lentidão).
  var cronogramasPorFonte = fontes.map(function (item) {
    return (item.cronograma || []).filter(function (c) {
      return Number(c.mes) >= 1 && Number(c.mes) <= 12 && isNonEmpty_(c.valor);
    });
  });
  var totalCrono = cronogramasPorFonte.reduce(function (s, cr) { return s + cr.length; }, 0);
  var idsFonte = proximosIds_('SofFontes', fontes.length);
  var idsCrono = totalCrono ? proximosIds_('SofFontesCronograma', totalCrono) : [];
  var agora = nowIso_();

  var linhasFonte = [];
  var linhasCrono = [];
  var kCrono = 0;
  fontes.forEach(function (item, i) {
    var cronograma = cronogramasPorFonte[i];
    var totalSolicitado = cronograma.reduce(function (s, c) { return s + toNumber_(c.valor); }, 0);
    var fonteId = idsFonte[i];
    linhasFonte.push({
      id: fonteId,
      sof_id: sofId,
      fonte: sanitizeString_(item.fonte, 50),
      objeto: sanitizeString_(item.objeto, 300),
      codigo_poas: sanitizeString_(item.codigo_poas, 50),
      parcela_mensal: toNumber_(item.parcela_mensal),
      total_solicitado: totalSolicitado,
      criado_por: session.id,
      data_criacao: agora
    });
    cronograma.forEach(function (c) {
      linhasCrono.push({
        id: idsCrono[kCrono++],
        sof_fonte_id: fonteId,
        mes: Number(c.mes),
        valor: toNumber_(c.valor),
        criado_por: session.id,
        data_criacao: agora
      });
    });
  });

  // Uma escrita em lote por aba, em vez de um append por linha.
  appendObjectRows_(sheet, linhasFonte);
  appendObjectRows_(cronoSheet, linhasCrono);
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
  invalidarCacheSof_();
  substituirFontesDoSof_(id, dados.fontes, session);
  registrarLog_(session, 'SOF', id, novo.criado_por, 'CRIACAO', '', 'Processo criado');
  bumpVersao_(['sof', 'dashboard']);

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
  // unidade_id (sessão 2026-08-12, pedido do usuário): antes NUNCA era aceito
  // aqui - o <select> "Unidade" ficava desabilitado no frontend na edição
  // (ver js/sof.js), então nenhuma chamada real chegava a mandar um valor
  // diferente. Mesma validação de criarSof (a unidade precisa existir).
  if (dados.hasOwnProperty('unidade_id') && isNonEmpty_(dados.unidade_id) && !buscarUnidadePorId_(dados.unidade_id)) {
    return fail_('Unidade não encontrada.');
  }

  var antigo = Object.assign({}, existente);
  var atualizado = Object.assign({}, existente);

  CAMPOS_LIVRES_SOF_.forEach(function (campo) {
    if (!dados.hasOwnProperty(campo)) return;
    if (campo === 'completo') atualizado[campo] = toBool_(dados[campo]);
    else atualizado[campo] = sanitizeString_(dados[campo], 2000);
  });

  // unidade_id não faz parte de CAMPOS_LIVRES_SOF_ (tem validação própria
  // acima, diferente dos campos "livres" de texto simples).
  if (dados.hasOwnProperty('unidade_id') && isNonEmpty_(dados.unidade_id)) {
    atualizado.unidade_id = dados.unidade_id;
  }

  if (atualizado.andamento !== existente.andamento) {
    atualizado.data_ultima_alteracao_andamento = nowIso_();
    atualizado.visualizado_apos_alerta = false;
  }

  atualizado.divergente_da_unidade = recalcularDivergenciaSof_(atualizado);

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheSof_();

  if (dados.hasOwnProperty('fontes')) substituirFontesDoSof_(id, dados.fontes, session);

  // data_ultima_alteracao_andamento/visualizado_apos_alerta são derivados (mudam sozinhos
  // junto de andamento, não são uma edição real do usuário) - fora do log evita 2 linhas
  // de auditoria extras (e 2 escritas a mais no Sheets) a cada troca de andamento.
  registrarDiferencas_(session, 'SOF', id, existente.criado_por, antigo, atualizado,
    ['_row', 'data_ultima_alteracao_andamento', 'visualizado_apos_alerta']);
  bumpVersao_(['sof', 'dashboard']);

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
  invalidarCacheSof_();
  bumpVersao_(['sof', 'dashboard']);
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
  invalidarCacheSof_();

  registrarLog_(session, 'SOF', id, existente.criado_por, 'EXCLUSAO', '', 'Processo excluído (lógico)');
  bumpVersao_(['sof', 'dashboard']);
  return ok_({ id: id });
}

function obterSof(session, id) {
  var sof = findById_(getSheet_(SHEETS.SOF), id);
  if (!sof) return fail_('SOF não encontrada.');
  delete sof._row;
  var fontes = listarFontesPorSof_(id);
  sof.fontes = fontes;
  sof.total_solicitado = totalSolicitadoDeFontes_(fontes);

  // total_atendido por linha de fonte (sessão 2026-07-29): soma do valor de
  // todas as Notas de Empenho (mãe + reforços) casadas por fonte+objeto com
  // esta linha - usado pelo frontend pra destacar em verde/vermelho os meses
  // do cronograma da SOF já cobertos pelo empenhado acumulado (ver
  // docs/ESPECIFICACAO_NOVO_DASHBOARD.md). Mesmo helper usado por listarSof,
  // pra nunca divergir entre os dois pontos de entrada.
  var mapaAtendido = agruparValorAtendidoPorSofFonteObjeto_();
  fontes.forEach(function (f) {
    f.total_atendido = mapaAtendido[id + '|' + f.fonte + '|' + (f.objeto || '')] || 0;
  });

  Object.assign(sof, calcularDestaqueParadoSof_(sof));
  return ok_(sof);
}

/**
 * SOF mais recente de um `tipo`, para servir de MODELO no formulário de criação
 * (js/sof.js, evento change do campo "Tipo de SOF").
 *
 * ACHADO DE PERFORMANCE (2026-08-12): esse autopreenchimento chamava
 * `listarSof({ tipo: [tipo], page: 1, pageSize: 1 })` - pedia UMA linha, mas
 * `listarSof` calcula o universo inteiro antes de paginar:
 *   - anexa fontes + total_solicitado a TODAS as SOFs (agruparFontesPorSof_,
 *     que lê SofFontes + SofFontesCronograma);
 *   - monta `agruparValorAtendidoPorSofFonteObjeto_` lendo NotasEmpenho inteira;
 *   - lê ListasPersonalizadas para o destaque de "parado";
 *   - filtra, ordena e só então corta em 1 registro.
 * Ou seja: 4-5 leituras de aba e trabalho O(n) sobre todas as SOFs para
 * devolver 1 linha - o usuário media 20 a 45 segundos.
 *
 * É a MESMA classe de problema já corrigida em `listarNotasEmpenhoPorUnidade`
 * (NotasEmpenho.gs), que reaproveitava `montarGruposNotasEmpenho_` para usar 4
 * campos.
 *
 * Aqui: uma varredura da aba SOF (cacheada) pegando o mais recente do tipo, e
 * as fontes SÓ dessa linha. `total_atendido` de propósito não é calculado - o
 * frontend descarta esse campo mesmo (é o empenhado da SOF de origem, não da
 * nova).
 */
function obterTemplateSof(session, tipo) {
  tipo = sanitizeString_(tipo, 100);
  if (!isNonEmpty_(tipo)) return ok_(null);

  var maisRecente = null;
  todosSofComCache_().forEach(function (s) {
    if (toBool_(s.excluido) || s.tipo !== tipo) return;
    if (!maisRecente || String(s.data_criacao) > String(maisRecente.data_criacao)) maisRecente = s;
  });
  if (!maisRecente) return ok_(null);

  var template = Object.assign({}, maisRecente);
  template.fontes = listarFontesPorSof_(template.id);
  return ok_(template);
}

/**
 * Ano de exercício de uma SOF, para o filtro de Ano (sessão 2026-08-12).
 *
 * A SOF não tem campo de competência (decisão do usuário: nesta tela só faz
 * sentido o filtro de Ano). O ano vem do próprio Nº SOF, que é "NNN/AAAA" -
 * é o número oficial do exercício. Quando o Nº SOF ainda não foi preenchido
 * (campo opcional), cai para o ano da data de criação, para a linha não sumir
 * de todos os filtros de ano.
 */
function anoDoSof_(sof) {
  var doNumero = String(sof.sof_numero || '').match(/\/(\d{4})\s*$/);
  if (doNumero) return doNumero[1];
  return String(sof.data_criacao || '').slice(0, 4);
}

/**
 * Filtros da tela de SOF, aplicados sobre linhas que JÁ tenham `fontes`
 * anexadas (o filtro de Fonte depende disso). Extraída de dentro de listarSof
 * (sessão 2026-08-12) para ser a única definição desses filtros, compartilhada
 * com o cálculo de facetas - se divergissem, a lista de opções ofereceria um
 * filtro que não existe, ou esconderia um que existe.
 */
function filtrarLinhasSof_(rows, params) {
  params = params || {};

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

  var anoValores = paraArrayFiltro_(params.ano);
  if (anoValores.length) rows = rows.filter(function (r) { return anoValores.indexOf(anoDoSof_(r)) !== -1; });

  var tipoValores = paraArrayFiltro_(params.tipo);
  if (tipoValores.length) rows = rows.filter(function (r) { return tipoValores.indexOf(r.tipo) !== -1; });

  var tipoUnidadeValores = paraArrayFiltro_(params.tipo_unidade);
  if (tipoUnidadeValores.length) {
    var unidadesDosTipos = todasUnidadesComCache_()
      .filter(function (u) { return tipoUnidadeValores.indexOf(u.tipo) !== -1; })
      .map(function (u) { return String(u.id); });
    rows = rows.filter(function (r) { return unidadesDosTipos.indexOf(String(r.unidade_id)) !== -1; });
  }

  if (params.andamento) rows = rows.filter(function (r) { return r.andamento === params.andamento; });

  // Usado só programaticamente pelo indicador "SOFs sem NE emitida" do
  // Dashboard (js/dashboard.js) - não vira um widget na barra de filtros da tela.
  if (params.semNe) rows = rows.filter(function (r) { return !toBool_(r.possui_ne); });

  var fonteValores = paraArrayFiltro_(params.fonte);
  if (fonteValores.length) {
    rows = rows.filter(function (r) {
      return (r.fontes || []).some(function (f) { return fonteValores.indexOf(f.fonte) !== -1; });
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

  return rows;
}

/** Dimensões facetáveis da tela de SOF - espelha filtrarLinhasSof_. */
function dimensoesFacetaSof_() {
  var tipoPorUnidade = null;
  return {
    unidade_id: function (r) { return r.unidade_id; },
    oss: function (r) { return r.oss_snapshot; },
    objeto: function (r) { return r.objeto; },
    dea: function (r) { return r.dea; },
    ano: function (r) { return anoDoSof_(r); },
    tipo: function (r) { return r.tipo; },
    tipo_unidade: function (r) {
      if (!tipoPorUnidade) {
        tipoPorUnidade = {};
        todasUnidadesComCache_().forEach(function (u) { tipoPorUnidade[u.id] = u.tipo; });
      }
      return tipoPorUnidade[r.unidade_id] || '';
    },
    fonte: function (r) { return (r.fontes || []).map(function (f) { return f.fonte; }); }
  };
}

/** Busca livre multi-campo (texto e numérico) + filtros combináveis (AND) + paginação. */
function listarSof(session, params) {
  params = params || {};
  var rows = todosSofComCache_().filter(function (r) { return !toBool_(r.excluido); });

  var fontesPorSof = agruparFontesPorSof_();
  // total_atendido por linha de fonte (sessão 2026-07-29, correção de bug):
  // abrirSofExistente (js/sof.js) reaproveita a linha já carregada aqui por
  // listarSof (nunca chama obterSof, por performance) - então esse campo
  // precisa vir calculado também aqui, senão o destaque verde/vermelho do
  // cronograma da SOF nunca aparece na prática. Mesmo helper de obterSof.
  var mapaAtendido = agruparValorAtendidoPorSofFonteObjeto_();
  rows.forEach(function (r) {
    var fontes = fontesPorSof[r.id] || [];
    fontes.forEach(function (f) { f.total_atendido = mapaAtendido[r.id + '|' + f.fonte + '|' + (f.objeto || '')] || 0; });
    r.fontes = fontes;
    r.total_solicitado = totalSolicitadoDeFontes_(fontes);
  });

  var facetas = calcularFacetas_(rows, params, dimensoesFacetaSof_(), filtrarLinhasSof_);
  rows = filtrarLinhasSof_(rows, params);

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

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize, facetas: facetas });
}
