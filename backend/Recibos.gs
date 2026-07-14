/**
 * GAOCG App - Gestão de Processos de Recibo (Funcionalidade 4, Anexo II),
 * incluindo parcela dividida e a migração do histórico (executada uma única
 * vez, no lançamento do sistema).
 */

var PASTA_NOTA_LIQUIDACAO_ID = '1szdIJMxBvIL5BU-ZbTWJh6AAN_tjxTyl';
var PASTA_ORDEM_BANCARIA_ID = '1BtvWiTqnwxOS52SZZCpvC1HjGbWSDaoN';

/**
 * Padrão da Nota de Empenho nos documentos oficiais do e-fisco/PE (ex:
 * "2026NE000418"). Usado em vez de amarrar a extração ao rótulo que a
 * precede ("EMPENHO:"), porque esse rótulo também aparece dentro de
 * "DATA DO EMPENHO:" nos mesmos documentos - o formato do próprio número é
 * um jeito mais robusto de achar o valor certo independente de layout.
 */
var REGEX_NUMERO_NE_DOCUMENTO = /\b(\d{4}NE\d{6})\b/i;
var REGEX_VALOR_LIQUIDADO_DOCUMENTO = /VALOR\s+LIQUIDADO\s*:?\s*([\d.,]+)/i;
var REGEX_VALOR_LIQUIDO_OB_DOCUMENTO = /VALOR\s+L[ÍI]QUIDO\s*:?\s*([\d.,]+)/i;

/**
 * Lê (via OCR) uma Nota de Liquidação ou Ordem Bancária recém escolhida no
 * formulário - antes de salvar o Recibo - e extrai o valor correspondente
 * (Valor Liquidado / Valor Líquido), validando que a Nota de Empenho citada
 * no documento é a mesma do Recibo em edição. Chamada pelo frontend assim
 * que o usuário anexa o arquivo (ver ligarAnexoComOcr_ em js/recibos.js).
 */
function lerAnexoRecibo(session, params) {
  params = params || {};
  var tipo = params.tipo === 'ordem_bancaria' ? 'ordem_bancaria' : 'nota_liquidacao';
  var notaEmpenhoEsperada = sanitizeString_(params.notaEmpenhoEsperada, 50);
  if (!isNonEmpty_(notaEmpenhoEsperada)) return fail_('Preencha a Nota de Empenho antes de anexar este documento.');
  if (!params.arquivoBase64) return fail_('Nenhum arquivo enviado.');

  var texto;
  try {
    texto = extrairTextoOcr_(params.arquivoBase64, params.arquivoNome, params.arquivoTipo);
  } catch (e) {
    return fail_('Não foi possível ler o documento: ' + e.message);
  }

  var matchNe = texto.match(REGEX_NUMERO_NE_DOCUMENTO);
  if (!matchNe) return fail_('Não foi possível identificar a Nota de Empenho no documento anexado.');
  var neDocumento = matchNe[1].toUpperCase();
  if (neDocumento !== notaEmpenhoEsperada.toUpperCase()) {
    return fail_('A Nota de Empenho do documento (' + neDocumento + ') não corresponde à Nota de Empenho do Recibo (' + notaEmpenhoEsperada + ').');
  }

  var regexValor = tipo === 'ordem_bancaria' ? REGEX_VALOR_LIQUIDO_OB_DOCUMENTO : REGEX_VALOR_LIQUIDADO_DOCUMENTO;
  var matchValor = texto.match(regexValor);
  if (!matchValor) return fail_('Não foi possível identificar o valor no documento anexado.');
  var valor = normalizarValorMonetarioBr_(matchValor[1]);
  if (valor === null) return fail_('Valor identificado no documento é inválido.');

  return ok_({ valor: valor, numero_ne: neDocumento });
}

function diasSemAlteracaoRecibo_(dataIso) {
  return diasSemAlteracao_(dataIso);
}

/** listasCarregadas opcional - ver calcularDestaqueParadoSof_ em Sof.gs. */
function calcularDestaqueParadoRecibo_(recibo, listasCarregadas) {
  var dias = diasSemAlteracao_(recibo.data_ultima_alteracao_status || recibo.data_criacao);
  var pausado = opcaoTemPausaContagem_('STATUS_RECIBO', recibo.status, listasCarregadas);
  return { dias_parado: dias, destacar_parado: dias > 5 && !pausado && !toBool_(recibo.visualizado_apos_alerta) };
}

/**
 * Recalcula alerta_divergencia_valores para todas as linhas de um grupo de
 * parcela dividida (ou para uma única linha avulsa, se parcelaDivididaGrupoId
 * for vazio). Regras: (a) valor_liquidado != valor_pago da própria linha; ou
 * (b) soma dos valor_pago do grupo != parcela_contratual. Ambos são apenas
 * informativos.
 */
function recalcularAlertaRecibo_(parcelaDivididaGrupoId, unidadeId) {
  var sheet = getSheet_(SHEETS.RECIBOS);
  var todos = sheetToObjects_(sheet);
  var linhas = parcelaDivididaGrupoId
    ? todos.filter(function (r) { return String(r.parcela_dividida_grupo_id) === String(parcelaDivididaGrupoId); })
    : [];

  if (!linhas.length) return;

  var somaPago = linhas.reduce(function (s, r) { return s + toNumber_(r.valor_pago); }, 0);
  var parcelaContratual = toNumber_(linhas[0].parcela_contratual);
  var divergenciaSoma = Math.abs(somaPago - parcelaContratual) > 0.01;

  linhas.forEach(function (linha) {
    var divergenciaLinha = Math.abs(toNumber_(linha.valor_liquidado) - toNumber_(linha.valor_pago)) > 0.01;
    var alerta = divergenciaLinha || divergenciaSoma;
    if (toBool_(linha.alerta_divergencia_valores) !== alerta) {
      var atualizado = Object.assign({}, linha, { alerta_divergencia_valores: alerta });
      var rowIndex = linha._row;
      delete atualizado._row;
      updateObjectRow_(sheet, rowIndex, atualizado);
    }
  });
}

/** Sobe um arquivo (Nota de Liquidação ou Ordem Bancária) pra pasta do Drive e devolve id/url. */
function anexarArquivoRecibo_(folderId, base64, nome, tipo) {
  var pasta = DriveApp.getFolderById(folderId);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), tipo || 'application/pdf', nome);
  var arquivo = pasta.createFile(blob);
  return { driveId: arquivo.getId(), url: arquivo.getUrl() };
}

function montarLinhaRecibo_(session, dados, unidade) {
  return {
    unidade_id: dados.unidade_id,
    oss_snapshot: isNonEmpty_(dados.oss_snapshot) ? sanitizeString_(dados.oss_snapshot, 200) : (unidade ? unidade.oss : ''),
    cnpj_snapshot: isNonEmpty_(dados.cnpj_snapshot) ? sanitizeString_(dados.cnpj_snapshot, 30) : (unidade ? unidade.cnpj : ''),
    tipo_unidade: sanitizeString_(dados.tipo_unidade, 50),
    objeto: sanitizeString_(dados.objeto, 500),
    instrumento: sanitizeString_(dados.instrumento, 100),
    parcela_contratual: toNumber_(dados.parcela_contratual),
    fonte: sanitizeString_(dados.fonte, 50),
    nota_empenho: sanitizeString_(dados.nota_empenho, 50),
    competencia: sanitizeString_(dados.competencia, 20),
    valor_liquidado: toNumber_(dados.valor_liquidado),
    valor_pago: toNumber_(dados.valor_pago),
    ordem_bancaria: sanitizeString_(dados.ordem_bancaria, 50),
    numero_processo: sanitizeString_(dados.numero_processo, 50),
    observacao: sanitizeString_(dados.observacao, 2000),
    status: sanitizeString_(dados.status, 200),
    parcela_dividida_grupo_id: sanitizeString_(dados.parcela_dividida_grupo_id, 50),
    percentual_parcela_dividida: dados.percentual_parcela_dividida === undefined || dados.percentual_parcela_dividida === '' ? '' : toNumber_(dados.percentual_parcela_dividida),
    completo: toBool_(dados.completo)
  };
}

/** Cria um único recibo (sem parcela dividida, ou uma linha adicional de um parcela_dividida_grupo_id já existente). */
function criarRecibo(session, dados) {
  dados = dados || {};
  if (!dados.unidade_id) return fail_('Selecione a unidade.');
  var unidade = findById_(getSheet_(SHEETS.UNIDADES), dados.unidade_id);
  if (!unidade) return fail_('Unidade não encontrada.');

  var linha = montarLinhaRecibo_(session, dados, unidade);
  var id = proximoId_('Recibos');
  var novo = Object.assign({ id: id }, linha, {
    divergente_da_unidade: false,
    alerta_divergencia_valores: false,
    origem: 'manual',
    criado_por: session.id,
    data_criacao: nowIso_(),
    data_ultima_alteracao_status: nowIso_(),
    visualizado_apos_alerta: true
  });
  novo.divergente_da_unidade = String(novo.oss_snapshot) !== String(unidade.oss) || String(novo.cnpj_snapshot) !== String(unidade.cnpj);

  if (dados.notaLiquidacaoArquivoBase64 && dados.notaLiquidacaoArquivoNome) {
    var nl = anexarArquivoRecibo_(PASTA_NOTA_LIQUIDACAO_ID, dados.notaLiquidacaoArquivoBase64, dados.notaLiquidacaoArquivoNome, dados.notaLiquidacaoArquivoTipo);
    novo.nota_liquidacao_drive_id = nl.driveId;
    novo.nota_liquidacao_url = nl.url;
  }
  if (dados.ordemBancariaArquivoBase64 && dados.ordemBancariaArquivoNome) {
    var ob = anexarArquivoRecibo_(PASTA_ORDEM_BANCARIA_ID, dados.ordemBancariaArquivoBase64, dados.ordemBancariaArquivoNome, dados.ordemBancariaArquivoTipo);
    novo.ordem_bancaria_arquivo_drive_id = ob.driveId;
    novo.ordem_bancaria_arquivo_url = ob.url;
  }

  appendObjectRow_(getSheet_(SHEETS.RECIBOS), novo);
  registrarLog_(session, 'Recibo', id, novo.criado_por, 'CRIACAO', '', 'Processo criado');
  if (novo.parcela_dividida_grupo_id) recalcularAlertaRecibo_(novo.parcela_dividida_grupo_id);
  return ok_(novo);
}

/**
 * Cria um grupo de parcela dividida completo de uma vez (duas ou mais
 * parcelas vinculadas ao mesmo parcela_dividida_grupo_id). Não exige que a
 * soma dos percentuais feche 100% - é informativo. Cada parcela pode trazer
 * sua própria Nota de Liquidação/Ordem Bancária (documentos diferentes por
 * parcela, mesmo processo).
 */
function criarGrupoParcelaDivididaRecibo(session, dadosBase, parcelas) {
  if (!parcelas || parcelas.length < 2) return fail_('Informe ao menos duas parcelas.');
  var unidade = findById_(getSheet_(SHEETS.UNIDADES), dadosBase.unidade_id);
  if (!unidade) return fail_('Unidade não encontrada.');

  var parcelaDivididaGrupoId = proximoId_('Recibos') + '-PD';
  var criados = [];
  var sheet = getSheet_(SHEETS.RECIBOS);

  parcelas.forEach(function (parcela) {
    var combinado = Object.assign({}, dadosBase, parcela, { parcela_dividida_grupo_id: parcelaDivididaGrupoId });
    var linha = montarLinhaRecibo_(session, combinado, unidade);
    var id = proximoId_('Recibos');
    var novo = Object.assign({ id: id }, linha, {
      divergente_da_unidade: String(linha.oss_snapshot) !== String(unidade.oss) || String(linha.cnpj_snapshot) !== String(unidade.cnpj),
      alerta_divergencia_valores: false,
      origem: 'manual',
      criado_por: session.id,
      data_criacao: nowIso_(),
      data_ultima_alteracao_status: nowIso_(),
      visualizado_apos_alerta: true
    });

    if (combinado.notaLiquidacaoArquivoBase64 && combinado.notaLiquidacaoArquivoNome) {
      var nl = anexarArquivoRecibo_(PASTA_NOTA_LIQUIDACAO_ID, combinado.notaLiquidacaoArquivoBase64, combinado.notaLiquidacaoArquivoNome, combinado.notaLiquidacaoArquivoTipo);
      novo.nota_liquidacao_drive_id = nl.driveId;
      novo.nota_liquidacao_url = nl.url;
    }
    if (combinado.ordemBancariaArquivoBase64 && combinado.ordemBancariaArquivoNome) {
      var ob = anexarArquivoRecibo_(PASTA_ORDEM_BANCARIA_ID, combinado.ordemBancariaArquivoBase64, combinado.ordemBancariaArquivoNome, combinado.ordemBancariaArquivoTipo);
      novo.ordem_bancaria_arquivo_drive_id = ob.driveId;
      novo.ordem_bancaria_arquivo_url = ob.url;
    }

    appendObjectRow_(sheet, novo);
    registrarLog_(session, 'Recibo', id, novo.criado_por, 'CRIACAO', '', 'Parcela criada (grupo ' + parcelaDivididaGrupoId + ')');
    criados.push(novo);
  });

  recalcularAlertaRecibo_(parcelaDivididaGrupoId);
  return ok_(criados);
}

/** Qualquer analista ou gerente pode editar qualquer Recibo (sem segmentação por dono). */
function atualizarRecibo(session, id, dados) {
  dados = dados || {};
  var sheet = getSheet_(SHEETS.RECIBOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Recibo não encontrado.');

  var antigo = Object.assign({}, existente);
  var atualizado = Object.assign({}, existente);

  var camposTexto = ['tipo_unidade', 'objeto', 'instrumento', 'fonte', 'nota_empenho', 'competencia',
    'ordem_bancaria', 'numero_processo', 'observacao', 'status', 'oss_snapshot', 'cnpj_snapshot'];
  camposTexto.forEach(function (campo) {
    if (dados.hasOwnProperty(campo)) atualizado[campo] = sanitizeString_(dados[campo], 2000);
  });
  ['parcela_contratual', 'valor_liquidado', 'valor_pago', 'percentual_parcela_dividida'].forEach(function (campo) {
    if (dados.hasOwnProperty(campo)) atualizado[campo] = toNumber_(dados[campo]);
  });
  if (dados.hasOwnProperty('completo')) atualizado.completo = toBool_(dados.completo);

  // Desanexa (só a referência - o arquivo em si continua no Drive, não é
  // apagado) antes de eventualmente anexar um novo, pra permitir remover e
  // reanexar na mesma edição.
  if (dados.removerNotaLiquidacaoArquivo) {
    atualizado.nota_liquidacao_drive_id = '';
    atualizado.nota_liquidacao_url = '';
  }
  if (dados.removerOrdemBancariaArquivo) {
    atualizado.ordem_bancaria_arquivo_drive_id = '';
    atualizado.ordem_bancaria_arquivo_url = '';
  }

  if (dados.notaLiquidacaoArquivoBase64 && dados.notaLiquidacaoArquivoNome) {
    var nl = anexarArquivoRecibo_(PASTA_NOTA_LIQUIDACAO_ID, dados.notaLiquidacaoArquivoBase64, dados.notaLiquidacaoArquivoNome, dados.notaLiquidacaoArquivoTipo);
    atualizado.nota_liquidacao_drive_id = nl.driveId;
    atualizado.nota_liquidacao_url = nl.url;
  }
  if (dados.ordemBancariaArquivoBase64 && dados.ordemBancariaArquivoNome) {
    var ob = anexarArquivoRecibo_(PASTA_ORDEM_BANCARIA_ID, dados.ordemBancariaArquivoBase64, dados.ordemBancariaArquivoNome, dados.ordemBancariaArquivoTipo);
    atualizado.ordem_bancaria_arquivo_drive_id = ob.driveId;
    atualizado.ordem_bancaria_arquivo_url = ob.url;
  }

  if (atualizado.status !== existente.status) {
    atualizado.data_ultima_alteracao_status = nowIso_();
    atualizado.visualizado_apos_alerta = false;
  }

  if (dados.hasOwnProperty('oss_snapshot') || dados.hasOwnProperty('cnpj_snapshot')) {
    var unidade = findById_(getSheet_(SHEETS.UNIDADES), atualizado.unidade_id);
    atualizado.divergente_da_unidade = !!unidade &&
      (String(atualizado.oss_snapshot || '') !== String(unidade.oss || '') || String(atualizado.cnpj_snapshot || '') !== String(unidade.cnpj || ''));
  }

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  registrarDiferencas_(session, 'Recibo', id, existente.criado_por, antigo, atualizado, ['_row']);

  if (atualizado.parcela_dividida_grupo_id) recalcularAlertaRecibo_(atualizado.parcela_dividida_grupo_id);
  else recalcularAlertaRecibo_(null);

  // Para linha avulsa (sem parcela dividida), o alerta de liquidado x pago é
  // recalculado direto aqui, já que recalcularAlertaRecibo_ só age sobre
  // grupos com parcela_dividida_grupo_id preenchido.
  if (!atualizado.parcela_dividida_grupo_id) {
    var alerta = Math.abs(toNumber_(atualizado.valor_liquidado) - toNumber_(atualizado.valor_pago)) > 0.01;
    if (toBool_(atualizado.alerta_divergencia_valores) !== alerta) {
      atualizado.alerta_divergencia_valores = alerta;
      updateObjectRow_(sheet, rowIndex, atualizado);
    }
  }

  return ok_(atualizado);
}

function marcarReciboVisualizado(session, id) {
  var sheet = getSheet_(SHEETS.RECIBOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Recibo não encontrado.');
  var atualizado = Object.assign({}, existente, { visualizado_apos_alerta: true });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  return ok_({ id: id });
}

/** Resolve o DEA de cada Nota de Empenho via o SOF de origem (sof_id -> dea), indexado por numero_ne. */
function mapaDeaPorNumeroNe_() {
  var sofsPorId = {};
  sheetToObjects_(getSheet_(SHEETS.SOF)).forEach(function (s) { sofsPorId[s.id] = s.dea; });
  var mapa = {};
  sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).forEach(function (n) { mapa[n.numero_ne] = sofsPorId[n.sof_id] || ''; });
  return mapa;
}

/** Filtros compartilhados por listarRecibos e indicadoresRecibos (mesma lista visível = mesmos indicadores). */
function filtrarLinhasRecibos_(rows, params) {
  if (params.unidade_id) rows = rows.filter(function (r) { return String(r.unidade_id) === String(params.unidade_id); });
  if (params.oss) rows = rows.filter(function (r) { return String(r.oss_snapshot).toLowerCase() === String(params.oss).toLowerCase(); });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.competencia) rows = rows.filter(function (r) { return r.competencia === params.competencia; });
  if (params.fonte) rows = rows.filter(function (r) { return r.fonte === params.fonte; });
  if (params.tipo_unidade) rows = rows.filter(function (r) { return r.tipo_unidade === params.tipo_unidade; });
  if (params.dea) {
    var mapaDea = mapaDeaPorNumeroNe_();
    rows = rows.filter(function (r) { return mapaDea[r.nota_empenho] === params.dea; });
  }

  ['objeto', 'instrumento', 'nota_empenho', 'numero_processo'].forEach(function (campo) {
    if (params[campo]) {
      var termo = String(params[campo]).toLowerCase();
      rows = rows.filter(function (r) { return String(r[campo] || '').toLowerCase().indexOf(termo) !== -1; });
    }
  });

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

function listarRecibos(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  rows.forEach(function (r) { delete r._row; });
  rows = filtrarLinhasRecibos_(rows, params);

  rows.sort(function (a, b) { return b.data_criacao < a.data_criacao ? -1 : 1; });

  var pageSize = Number(params.pageSize) || 20;
  var page = Number(params.page) || 1;
  var total = rows.length;
  var start = (page - 1) * pageSize;
  var pageRows = rows.slice(start, start + pageSize);

  // destacar_parado só é exibido - calcular só na página visível, com uma
  // única leitura (cacheada) de ListasPersonalizadas (ver RELATORIO_LENTIDAO_SOF.md).
  var listasCarregadas = todasOpcoesComCache_();
  pageRows.forEach(function (r) { Object.assign(r, calcularDestaqueParadoRecibo_(r, listasCarregadas)); });

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize });
}

/**
 * Indicadores da tela de Recibos, calculados sobre as mesmas linhas
 * filtradas de listarRecibos (sem paginação) - refletem os filtros ativos.
 * "total_a_pagar" fica de fora por enquanto: depende de uma tabela futura de
 * valores mensais recebidos por unidade, ainda não implementada (ver
 * PROGRESS.md, Fase 5).
 */
function indicadoresRecibos(session, params) {
  params = params || {};
  var rows = sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  rows.forEach(function (r) { delete r._row; });
  rows = filtrarLinhasRecibos_(rows, params);

  var anoAtual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yy');
  var pendentes = 0;
  var totalPagoAno = 0;
  rows.forEach(function (r) {
    if (r.status !== 'PAGO') pendentes++;
    if (String(r.competencia || '').slice(-2) === anoAtual) totalPagoAno += toNumber_(r.valor_pago);
  });

  return ok_({ pendentes: pendentes, total_pago_ano: totalPagoAno });
}

/**
 * Migração do histórico de Recibo (execução única, no lançamento do sistema).
 * NÃO gera entradas em LogAuditoria (decisão de negócio). Cada linha recebe
 * origem = 'importacao_inicial'. `linhas` deve trazer os mesmos campos de
 * Recibos (exceto id/origem/criado_por/data_criacao), com unidade_id já
 * resolvido contra o cadastro de Unidades (pré-condição: Unidades populada
 * antes desta rotina).
 */
function migrarRecibosHistorico(session, linhas) {
  requireGerente_(session);
  if (!linhas || !linhas.length) return fail_('Nenhuma linha para migrar.');

  var sheet = getSheet_(SHEETS.RECIBOS);
  var grupos = {};
  var criados = [];

  linhas.forEach(function (linha) {
    var id = proximoId_('Recibos');
    var novo = Object.assign({}, linha, {
      id: id,
      origem: 'importacao_inicial',
      criado_por: 'rotina_importacao_inicial',
      data_criacao: linha.data_criacao || nowIso_(),
      data_ultima_alteracao_status: linha.data_ultima_alteracao_status || nowIso_(),
      visualizado_apos_alerta: true,
      alerta_divergencia_valores: false,
      divergente_da_unidade: false
    });
    appendObjectRow_(sheet, novo);
    criados.push(novo);
    if (novo.parcela_dividida_grupo_id) grupos[novo.parcela_dividida_grupo_id] = true;
  });

  Object.keys(grupos).forEach(function (grupoId) { recalcularAlertaRecibo_(grupoId); });
  return ok_({ importados: criados.length });
}
