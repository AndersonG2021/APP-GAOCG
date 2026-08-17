/**
 * GAOCG App - Cadastro Mestre de Unidades (Funcionalidade 2), incluindo o
 * Valor do Contrato de Gestão e os Termos Aditivos (T.A.s) vinculados.
 */

/**
 * Lê a aba UnidadesTA inteira, com cache de 30s (mesmo padrão de
 * todasOpcoesComCache_ em ListasPersonalizadas.gs / todasFontesComCache_ em
 * Sof.gs).
 */
function todasTasComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'unidades_ta';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.UNIDADES_TA));
  rows.forEach(function (t) { delete t._row; });
  cachePut_(cache, chave, rows, 30);
  return rows;
}

function invalidarCacheTas_() {
  CacheService.getScriptCache().remove('unidades_ta');
}

/** Todas as linhas de UnidadesTA de uma unidade. */
function listarTasPorUnidade_(unidadeId) {
  return todasTasComCache_().filter(function (t) { return String(t.unidade_id) === String(unidadeId); });
}

/** Todas as linhas de UnidadesTA, agrupadas por unidade_id. Usado por listarUnidades pra evitar N+1. */
function agruparTasPorUnidade_() {
  var mapa = {};
  todasTasComCache_().forEach(function (t) {
    (mapa[t.unidade_id] = mapa[t.unidade_id] || []).push(t);
  });
  return mapa;
}

/**
 * "Parcela mensal" = Valor do C.G. Tesouro + Valor do C.G. SUS (algumas
 * unidades têm repasse recorrente nas duas fontes, outras só numa - sessão
 * 2026-07-27) + soma de todos os Valores de T.A.. Um T.A. sazonal vencido
 * continua entrando nessa soma normalmente - só gera aviso visual (ver
 * anotarVencimentoTas_), o analista é quem decide remover a linha.
 */
function parcelaMensalTotal_(valorContratoGestaoTesouro, valorContratoGestaoSus, tas) {
  var somaTas = (tas || []).reduce(function (soma, t) { return soma + toNumber_(t.valor_ta); }, 0);
  return toNumber_(valorContratoGestaoTesouro) + toNumber_(valorContratoGestaoSus) + somaTas;
}

/**
 * "Parcela mensal regular" (sessão 2026-07-29): mesma soma de
 * parcelaMensalTotal_, mas exclui os T.A.s marcados como "Não Regular"
 * (tipo_pagamento === 'sazonal' internamente) - só a parte do repasse que se
 * repete todo mês sem previsão de encerramento. Valor do C.G. Tesouro/SUS
 * entram sempre, por serem recorrentes por definição.
 */
function parcelaMensalRegular_(valorContratoGestaoTesouro, valorContratoGestaoSus, tas) {
  var somaTasRegulares = (tas || [])
    .filter(function (t) { return t.tipo_pagamento !== 'sazonal'; })
    .reduce(function (soma, t) { return soma + toNumber_(t.valor_ta); }, 0);
  return toNumber_(valorContratoGestaoTesouro) + toNumber_(valorContratoGestaoSus) + somaTasRegulares;
}

/**
 * Marca cada T.A. sazonal cuja data_vencimento já passou com `vencido: true`
 * (sessão 2026-07-27) - calculado toda leitura, nunca gravado, mesmo
 * princípio de dias_parado/destacar_parado (Sof.gs) - nunca fica
 * desatualizado. T.A. regular (ou sazonal sem data) nunca vence.
 */
function anotarVencimentoTas_(tas) {
  var hoje = nowIso_().slice(0, 10);
  (tas || []).forEach(function (t) {
    t.vencido = t.tipo_pagamento === 'sazonal' && !!t.data_vencimento && t.data_vencimento < hoje;
  });
  return tas;
}

/**
 * Substitui por completo os T.A.s de uma unidade (apaga os antigos e recria a
 * partir do array enviado) - mesmo princípio de substituirFontesDoSof_ em
 * Sof.gs. Ao contrário das Fontes do SOF, a lista pode ficar vazia (unidade
 * sem Termo Aditivo ainda).
 *
 * Reserva de IDs e gravação em lote (sessão 2026-07-27 - achado real: cada
 * T.A. novo fazia seu próprio ciclo de proximoId_ (lock+leitura+escrita na
 * aba Contadores) + seu próprio appendObjectRow_ isolado - uma unidade com
 * vários T.A.s virava vários ciclos de lock/escrita sequenciais só pra
 * salvar, explicando a demora de até ~20s relatada ao editar Unidades (mesma
 * classe de bug já corrigida pro log de auditoria - ver PROGRESS.md "Lentidão
 * ao trocar andamento no SOF"). Agora é 1 reserva de IDs (proximosIds_) + 1
 * escrita em lote (appendObjectRows_), não importa quantos T.A.s tenha.
 */
function substituirTasDaUnidade_(unidadeId, tasArray, session) {
  var sheet = getSheet_(SHEETS.UNIDADES_TA);
  var existentes = sheetToObjects_(sheet).filter(function (t) { return String(t.unidade_id) === String(unidadeId); });
  // deleteRowsEmLote_ (Utils.gs) agrupa índices contíguos num único
  // deleteRows - os T.A.s de uma mesma unidade são gravados em sequência,
  // então isso vira 1 chamada em vez de uma por T.A. Era o último ponto do
  // backend que ainda apagava linha a linha (varredura de 2026-08-07).
  deleteRowsEmLote_(sheet, existentes.map(function (t) { return t._row; }));

  var itens = tasArray || [];
  if (itens.length) {
    var ids = proximosIds_('UnidadesTA', itens.length);
    var novasLinhas = itens.map(function (item, i) {
      var tipoPagamento = item.tipo_pagamento === 'sazonal' ? 'sazonal' : 'regular';
      return {
        id: ids[i],
        unidade_id: unidadeId,
        objeto_ta: sanitizeString_(item.objeto_ta, 200),
        numero_ta: sanitizeString_(item.numero_ta, 20),
        valor_ta: toNumber_(item.valor_ta),
        tipo_pagamento: tipoPagamento,
        // Data só faz sentido pra sazonal - descarta lixo órfão se o
        // analista trocar de sazonal pra regular sem limpar o campo.
        data_vencimento: tipoPagamento === 'sazonal' ? sanitizeString_(item.data_vencimento, 10) : '',
        criado_por: session.id,
        data_criacao: nowIso_()
      };
    });
    appendObjectRows_(sheet, novasLinhas);
  }
  invalidarCacheTas_();
}

/**
 * Lê a aba Unidades inteira, com cache de 30s. Unidades é consultada em
 * praticamente toda tela (listarUnidades em si, além de ser recarregada -
 * com cache client-side - por SOF/Recibos/Notas de Empenho pra popular
 * filtros/formulários), então vale o mesmo tratamento das outras abas
 * "de apoio" (ListasPersonalizadas, SofFontes, NotasEmpenho).
 */
function todasUnidadesComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'unidades';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.UNIDADES));
  rows.forEach(function (u) { delete u._row; });
  cachePut_(cache, chave, rows, 30);
  return rows;
}

function invalidarCacheUnidades_() {
  CacheService.getScriptCache().remove('unidades');
}

/**
 * Busca uma Unidade por id usando o cache de 30s, em vez de
 * findById_(getSheet_(SHEETS.UNIDADES), id) - que relia a aba Unidades
 * inteira do zero. Usada nos lookups somente-leitura de SOF/Recibo (nunca
 * escreve na Unidade, então dispensa o _row que findById_ devolve).
 * Sozinho, esse ponto explicava boa parte da lentidão de "trocar andamento"
 * (atualizarSof chama recalcularDivergenciaSof_, que fazia essa leitura a
 * cada troca) e de criar/editar SOF e Recibo.
 */
function buscarUnidadePorId_(id) {
  var rows = todasUnidadesComCache_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

/**
 * Filtros da tela de Unidades. Extraída de dentro de listarUnidades (sessão
 * 2026-08-12) para virar a única definição, compartilhada com o cálculo de
 * facetas - a lista de opções tem que sair exatamente do mesmo critério que
 * filtra as linhas.
 */
function filtrarLinhasUnidades_(rows, params) {
  params = params || {};
  if (toBool_(params.somenteAtivas)) {
    rows = rows.filter(function (u) { return toBool_(u.ativo); });
  }

  var idsValores = paraArrayFiltro_(params.unidade_id);
  if (idsValores.length) rows = rows.filter(function (u) { return idsValores.indexOf(String(u.id)) !== -1; });

  var tipoValores = paraArrayFiltro_(params.tipo);
  if (tipoValores.length) rows = rows.filter(function (u) { return tipoValores.indexOf(u.tipo) !== -1; });

  var ossValores = paraArrayFiltro_(params.oss).map(function (v) { return v.toLowerCase(); });
  if (ossValores.length) {
    rows = rows.filter(function (u) {
      var ossLinha = String(u.oss || '').toLowerCase();
      return ossValores.some(function (v) { return ossLinha.indexOf(v) !== -1; });
    });
  }

  var busca = sanitizeString_(params.busca, 200).toLowerCase();
  if (busca) {
    rows = rows.filter(function (u) {
      return Object.keys(u).some(function (campo) {
        var valor = u[campo];
        if (valor === null || valor === undefined) return false;
        return String(valor).toLowerCase().indexOf(busca) !== -1;
      });
    });
  }

  return rows;
}

/** Dimensões facetáveis da tela de Unidades - espelha filtrarLinhasUnidades_. */
function dimensoesFacetaUnidades_() {
  return {
    unidade_id: function (u) { return u.id; },
    tipo: function (u) { return u.tipo; },
    oss: function (u) { return u.oss; }
  };
}

function listarUnidades(session, params) {
  params = params || {};
  var todas = todasUnidadesComCache_();
  var facetas = calcularFacetas_(todas, params, dimensoesFacetaUnidades_(), filtrarLinhasUnidades_);
  var rows = filtrarLinhasUnidades_(todas, params);

  rows.sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || '')); });

  var pageSize = Number(params.pageSize) || 20;
  var page = Number(params.page) || 1;
  var total = rows.length;
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);

  var tasPorUnidade = agruparTasPorUnidade_();
  pageRows.forEach(function (u) {
    var tas = anotarVencimentoTas_(tasPorUnidade[u.id] || []);
    u.tas = tas;
    u.parcela_mensal_total = parcelaMensalTotal_(u.valor_contrato_gestao, u.valor_contrato_gestao_sus, tas);
    u.parcela_mensal_regular = parcelaMensalRegular_(u.valor_contrato_gestao, u.valor_contrato_gestao_sus, tas);
  });

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize, facetas: facetas });
}

function criarUnidade(session, dados) {
  dados = dados || {};
  var nome = sanitizeString_(dados.nome, 200);
  var cnpj = sanitizeString_(dados.cnpj, 20);
  var contratoGestao = sanitizeString_(dados.contrato_gestao, 100);

  if (!nome) return fail_('Informe o nome da unidade.');
  if (!validarCnpj_(cnpj)) return fail_('CNPJ inválido.');
  if (!contratoGestao) return fail_('Informe o contrato de gestão.');

  var sheet = getSheet_(SHEETS.UNIDADES);
  var existentes = sheetToObjects_(sheet);
  var cnpjLimpo = cnpj.replace(/[^\d]/g, '');
  var duplicado = existentes.some(function (u) {
    return String(u.cnpj).replace(/[^\d]/g, '') === cnpjLimpo && String(u.contrato_gestao) === contratoGestao;
  });
  if (duplicado) return fail_('Já existe uma unidade cadastrada com este CNPJ e contrato de gestão.');

  var id = proximoId_('Unidades');
  var novo = {
    id: id,
    nome: nome,
    tipo: sanitizeString_(dados.tipo, 50),
    oss: sanitizeString_(dados.oss, 50),
    cnpj: cnpj,
    contrato_gestao: contratoGestao,
    contrato_ceo: sanitizeString_(dados.contrato_ceo, 50),
    // Situação do Contrato / prazos (sessão 2026-08-14): datas são texto
    // "aaaa-mm-dd" puro (mesmo padrão de data_vencimento em UnidadesTA) - o
    // cálculo de dias restantes/próximo T.A. é feito no frontend
    // (UI.calcularPrazoContratoUnidade, js/app.js), não aqui.
    situacao_contrato: sanitizeString_(dados.situacao_contrato, 50),
    data_inicial_instrumento: sanitizeString_(dados.data_inicial_instrumento, 10),
    data_final_instrumento: sanitizeString_(dados.data_final_instrumento, 10),
    valor_contrato_gestao: toNumber_(dados.valor_contrato_gestao),
    valor_contrato_gestao_sus: toNumber_(dados.valor_contrato_gestao_sus),
    classificacao_orcamentaria: sanitizeString_(dados.classificacao_orcamentaria, 200),
    acao: sanitizeString_(dados.acao, 50),
    subacao: sanitizeString_(dados.subacao, 50),
    gd: sanitizeString_(dados.gd, 50),
    ativo: true,
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(sheet, novo);
  invalidarCacheUnidades_();
  bumpVersao_('unidades');
  substituirTasDaUnidade_(id, dados.tas, session);

  var tas = anotarVencimentoTas_(listarTasPorUnidade_(id));
  novo.tas = tas;
  novo.parcela_mensal_total = parcelaMensalTotal_(novo.valor_contrato_gestao, novo.valor_contrato_gestao_sus, tas);
  novo.parcela_mensal_regular = parcelaMensalRegular_(novo.valor_contrato_gestao, novo.valor_contrato_gestao_sus, tas);
  return ok_(novo);
}

function atualizarUnidade(session, id, dados) {
  dados = dados || {};
  var sheet = getSheet_(SHEETS.UNIDADES);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Unidade não encontrada.');

  var campos = ['nome', 'tipo', 'oss', 'cnpj', 'contrato_gestao', 'contrato_ceo', 'situacao_contrato', 'data_inicial_instrumento', 'data_final_instrumento', 'classificacao_orcamentaria', 'acao', 'subacao', 'gd'];
  var atualizado = Object.assign({}, existente);
  campos.forEach(function (campo) {
    if (dados.hasOwnProperty(campo)) atualizado[campo] = sanitizeString_(dados[campo], 200);
  });
  if (dados.hasOwnProperty('valor_contrato_gestao')) atualizado.valor_contrato_gestao = toNumber_(dados.valor_contrato_gestao);
  if (dados.hasOwnProperty('valor_contrato_gestao_sus')) atualizado.valor_contrato_gestao_sus = toNumber_(dados.valor_contrato_gestao_sus);

  if (atualizado.cnpj && !validarCnpj_(atualizado.cnpj)) return fail_('CNPJ inválido.');

  if (dados.hasOwnProperty('cnpj') || dados.hasOwnProperty('contrato_gestao')) {
    var cnpjLimpo = String(atualizado.cnpj).replace(/[^\d]/g, '');
    var outras = sheetToObjects_(sheet).filter(function (u) { return String(u.id) !== String(id); });
    var duplicado = outras.some(function (u) {
      return String(u.cnpj).replace(/[^\d]/g, '') === cnpjLimpo && String(u.contrato_gestao) === atualizado.contrato_gestao;
    });
    if (duplicado) return fail_('Já existe outra unidade cadastrada com este CNPJ e contrato de gestão.');
  }

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUnidades_();
  bumpVersao_('unidades');

  if (dados.hasOwnProperty('tas')) substituirTasDaUnidade_(id, dados.tas, session);

  var tas = anotarVencimentoTas_(listarTasPorUnidade_(id));
  atualizado.tas = tas;
  atualizado.parcela_mensal_total = parcelaMensalTotal_(atualizado.valor_contrato_gestao, atualizado.valor_contrato_gestao_sus, tas);
  atualizado.parcela_mensal_regular = parcelaMensalRegular_(atualizado.valor_contrato_gestao, atualizado.valor_contrato_gestao_sus, tas);
  return ok_(atualizado);
}

/** Inativar não afeta processos (SOF/Recibo) já criados - eles guardam snapshot, não referência viva. */
function inativarUnidade(session, id) {
  var sheet = getSheet_(SHEETS.UNIDADES);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Unidade não encontrada.');

  var atualizado = Object.assign({}, existente, { ativo: false });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUnidades_();
  bumpVersao_('unidades');
  return ok_({ id: id, ativo: false });
}

function reativarUnidade(session, id) {
  var sheet = getSheet_(SHEETS.UNIDADES);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Unidade não encontrada.');

  var atualizado = Object.assign({}, existente, { ativo: true });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheUnidades_();
  bumpVersao_('unidades');
  return ok_({ id: id, ativo: true });
}

/**
 * Preenche o Contrato CEO das unidades já cadastradas (sessão 2026-08-14,
 * lista Unidade -> Contrato CEO recebida do usuário em conversa - não existe
 * em nenhuma planilha/arquivo do repositório, só aqui).
 *
 * RODE UMA VEZ, manualmente, pelo editor do Apps Script (seletor de função
 * "backfillContratoCeoUnidades" → Executar), DEPOIS de:
 *   1. criar a coluna "contrato_ceo" na aba Unidades (cabeçalho na linha 1,
 *      em qualquer coluna livre - leitura/escrita é por NOME de coluna, não
 *      por posição, ver getHeaders_ em Utils.gs);
 *   2. colar Utils.gs/Unidades.gs/Relatorios.gs atualizados e dar "Nova
 *      versão" no deploy.
 *
 * Casamento por nome NORMALIZADO (sem acento, sem espaço duplicado/nas
 * pontas, minúsculo) - tolera as diferenças de espaço que já vinham na lista
 * original ("Hosp. Pelópidas da Silveira " com espaço sobrando, por exemplo),
 * mas não tenta adivinhar nome parecido: uma unidade que não bater
 * EXATAMENTE (mesmo por uma letra só - ex.: singular/plural) fica de fora e
 * entra no log de "não encontradas" pra conferência manual, nunca é
 * preenchida "no chute". Idempotente - pode rodar de novo sem problema.
 */
function backfillContratoCeoUnidades() {
  var MAPA_CONTRATO_CEO_ = {
    'Hosp. Dom Helder Câmara': '00871/2022',
    'Hosp. Nossa Senhora das Graças (Alfa)': '01017/2022',
    'Hosp. Miguel Arraes': '01390/2022',
    'Hosp. Pelópidas da Silveira': '00872/2022',
    'UPA São Lourenço': '00011/2022',
    'UPAE Garanhuns': '45/2026',
    'UPAE Salgueiro': '12/2026',
    'UPAE Escada': '01108/2022',
    'UPAE Carpina': '00961/2022',
    'UPAE Petrolina': '44/2026',
    'Hospital Ermirio Coutinho': '00546/2022',
    'Hospital Silvio Magalhães': '00934/2022',
    'UPA Cabo': '00127/2022',
    'UPA Caruaru': '00176/2022',
    'UPA Engenho Velho': '00001/2022',
    'UPA Nova Descoberta': '00002/2022',
    'UPA Paulista': '00007/2022',
    'UPA Torrões': '00012/2022',
    'UPA Caxangá': '00010/2022',
    'UPA Imbiribeira': '00675/2021',
    'UPAE Limoeiro': '13/2026',
    'Hospital Brites de Albuquerque': '593/2023',
    'Hospital do Sertão Eduardo Campos': '01652/2022',
    'Hospital Regional Emilia Câmara': '01455/2018',
    'Hospital João Murilo de Oliveira': '01805/2022',
    'Hospital Regional Ruy de Barros Correia': '01222/2018',
    'Hospital Mestre Vitalino': '42/2026',
    'UPA Curado': '00006/2022',
    'UPA Ibura': '00577/2022',
    'UPAE Afogados da Ingazeira': '11/2026',
    'UPAE Serra Talhada': '10/2026',
    'Hospital Central de Paulista': '736/2026',
    'UPAE Grande Recife': '139/2026',
    'Hospital Regional Fernando Bezerra': '00579/2021',
    'Hospital Dom Malan': '00022/2023',
    'UPA Barra de Jangada': '0009/2022',
    'UPA Olinda': '0003/2022',
    'UPAE Ouricuri': '0860/2020',
    'Hospital São Sebastião': '00723/2020',
    'UPA Igarassu': '0008/2022',
    'UPAE Arcoverde': '09/2026',
    'UPAE Belo Jardim': '07/2026',
    'UPAE Caruaru': '718/2020',
    'UPAE Palmares': '1109/2022',
    'Hospital da Mulher do Agreste': '151/2025',
    // Recebido como "Carretas" (plural) - a unidade já cadastrada no app é
    // "CARRETA DA MULHER PERNAMBUCANA" (singular, visto em tela nesta mesma
    // sessão). Deixado aqui do jeito que veio de propósito: se não bater,
    // aparece em "não encontradas" no log, em vez de eu decidir sozinho
    // qual das duas grafias está certa.
    'Carretas da Mulher Pernambucana': '01331/2024'
  };

  function normalizarNomeUnidade_(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos (marcas combinantes pos-NFD, U+0300-U+036F)
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }

  var sheet = getSheet_(SHEETS.UNIDADES);
  var linhas = sheetToObjects_(sheet);
  var porNomeNormalizado = {};
  linhas.forEach(function (u) { porNomeNormalizado[normalizarNomeUnidade_(u.nome)] = u; });

  var aplicadas = [];
  var naoEncontradas = [];
  Object.keys(MAPA_CONTRATO_CEO_).forEach(function (nome) {
    var linha = porNomeNormalizado[normalizarNomeUnidade_(nome)];
    if (!linha) { naoEncontradas.push(nome); return; }
    var atualizado = Object.assign({}, linha, { contrato_ceo: MAPA_CONTRATO_CEO_[nome] });
    delete atualizado._row;
    updateObjectRow_(sheet, linha._row, atualizado);
    aplicadas.push(linha.nome + ' -> ' + MAPA_CONTRATO_CEO_[nome]);
  });

  invalidarCacheUnidades_();
  bumpVersao_('unidades');

  Logger.log('Contrato CEO preenchido em ' + aplicadas.length + ' unidade(s):\n' + aplicadas.join('\n'));
  if (naoEncontradas.length) {
    Logger.log('\n⚠ NÃO encontrei unidade cadastrada com este nome (confira acentuação/' +
      'singular-plural/abreviação e preencha manualmente pelo formulário da unidade):\n' +
      naoEncontradas.join('\n'));
  }
}
