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
/**
 * Bug corrigido (sessão 2026-08-06): a primeira versão buscava o rótulo
 * "VALOR LÍQUIDO:", um chute nunca confirmado contra um documento real (ver
 * PROGRESS.md, sessão 2026-07-13 - só a Nota de Liquidação havia sido
 * testada de fato). Uma Ordem Bancária real do e-fisco/PE anexada pelo
 * usuário mostrou que o rótulo correto é "VALOR DA ORDEM BANCÁRIA:" - é
 * esse valor (não "líquido") que o documento traz.
 */
var REGEX_VALOR_ORDEM_BANCARIA_DOCUMENTO = /VALOR\s+DA\s+ORDEM\s+BANC[ÁA]RIA\s*:?\s*([\d.,]+)/i;

/**
 * Número do próprio documento (não da NE citada dentro dele) - sessão
 * 2026-08-06, pedido do usuário: a parcela de 70% de um Recibo dividido de
 * Contrato de Gestão (TES) pode ter mais de uma Ordem Bancária, mostradas
 * numa tabela "Documentos anexados" (LE + cada OB) com número e valor de
 * cada uma. Mesmo raciocínio de REGEX_NUMERO_NE_DOCUMENTO (formato do
 * número, não o rótulo que o precede) - confirmado contra documentos reais:
 * Nota de Liquidação 2026LE000755 ("NÚMERO:"/"LIQUIDAÇÃO:") e Ordem
 * Bancária 2026OB010537 ("NÚMERO:").
 */
var REGEX_NUMERO_LE_DOCUMENTO = /\b(\d{4}LE\d{6})\b/i;
var REGEX_NUMERO_OB_DOCUMENTO = /\b(\d{4}OB\d{6})\b/i;

/**
 * Lê a aba Recibos inteira, com cache de 30s (sessão 2026-07-30, mesmo padrão
 * de todasNotasEmpenhoComCache_ em NotasEmpenho.gs / todasFontesComCache_ em
 * Sof.gs) - achado real ao investigar lentidão de 10-15s ao selecionar a
 * unidade no "Novo processo de Recibo": listarRecibos relia a aba inteira do
 * zero (sheetToObjects_, sem cache nenhum) em toda chamada, mesmo sendo
 * chamada várias vezes seguidas em poucos segundos (ex.: 1x por seleção de
 * unidade no formulário). Como cada escrita em Recibos precisa invalidar
 * este cache (ver invalidarCacheRecibos_ logo abaixo), só é seguro usar este
 * helper em pontos de LEITURA - pontos que escrevem (criarRecibo,
 * atualizarRecibo etc.) continuam lendo a aba direto via findById_/
 * sheetToObjects_, porque precisam do _row pra saber em qual linha escrever
 * (o cache não guarda _row).
 */
function todasRecibosComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'recibos_todos';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  rows.forEach(function (r) { delete r._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheRecibos_() {
  CacheService.getScriptCache().remove('recibos_todos');
}

/**
 * Lê (via OCR) uma Nota de Liquidação ou Ordem Bancária recém escolhida no
 * formulário - antes de salvar o Recibo - e extrai o valor correspondente
 * (Valor Liquidado / Valor da Ordem Bancária), validando que a Nota de
 * Empenho citada no documento é a mesma do Recibo em edição. Chamada pelo
 * frontend assim que o usuário anexa o arquivo (ver ligarAnexoComOcr_ em
 * js/recibos.js).
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

  var regexValor = tipo === 'ordem_bancaria' ? REGEX_VALOR_ORDEM_BANCARIA_DOCUMENTO : REGEX_VALOR_LIQUIDADO_DOCUMENTO;
  var matchValor = texto.match(regexValor);
  if (!matchValor) return fail_('Não foi possível identificar o valor no documento anexado.');
  var valor = normalizarValorMonetarioBr_(matchValor[1]);
  if (valor === null) return fail_('Valor identificado no documento é inválido.');

  // Número do próprio documento (2026LE.../2026OB...) - best-effort: ao
  // contrário da NE/do valor acima, não bloqueia o anexo se não achar (só
  // deixa de mostrar o número na tabela "Documentos anexados" da parcela de
  // 70% - ver ligarAnexoComOcr_/adicionarLinhaParcelaDividida_ em js/recibos.js).
  var regexNumeroDocumento = tipo === 'ordem_bancaria' ? REGEX_NUMERO_OB_DOCUMENTO : REGEX_NUMERO_LE_DOCUMENTO;
  var matchNumeroDocumento = texto.match(regexNumeroDocumento);
  var numeroDocumento = matchNumeroDocumento ? matchNumeroDocumento[1].toUpperCase() : '';

  return ok_({ valor: valor, numero_ne: neDocumento, numero_documento: numeroDocumento });
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

/** Cria a aba RecibosOrdensBancarias sob demanda, se ainda não existir - mesmo padrão de getSheetModelosRelatorio_ (Relatorios.gs), evita passo manual de criar aba. */
function getSheetOrdensBancariasRecibo_() {
  var ss = getSS_();
  var sheet = ss.getSheetByName(SHEETS.RECIBOS_ORDENS_BANCARIAS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.RECIBOS_ORDENS_BANCARIAS);
    sheet.getRange(1, 1, 1, HEADERS.RecibosOrdensBancarias.length).setValues([HEADERS.RecibosOrdensBancarias]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Soma dos itens de ordens_bancarias de uma parcela - usada tanto pra
 * recalcular valor_pago (soma automática, decisão do usuário) quanto por
 * quem só precisa do total sem mexer na planilha.
 */
function somaOrdensBancarias_(itens) {
  return (itens || []).reduce(function (soma, item) { return soma + toNumber_(item.valor); }, 0);
}

/**
 * Substitui (apaga e recria) as Ordens Bancárias de UMA parcela de Recibo -
 * mesmo padrão "apagar-e-recriar" de substituirFontesDoSof_ (Sof.gs). Cada
 * item pode trazer um arquivo novo (arquivoBase64/arquivoNome/arquivoTipo -
 * sobe pro Drive agora) ou já ter vindo de uma OB salva anteriormente e não
 * mexida nesta edição (arquivo_drive_id/arquivo_url já prontos - só recria a
 * linha do banco, sem reenviar o arquivo). numero_ob vem do OCR
 * (REGEX_NUMERO_OB_DOCUMENTO em lerAnexoRecibo), best-effort - pode vir vazio.
 */
function substituirOrdensBancariasParcela_(reciboId, itens, criadoPor) {
  var sheet = getSheetOrdensBancariasRecibo_();
  var todas = sheetToObjects_(sheet);
  var linhasExistentes = todas.filter(function (r) { return String(r.recibo_id) === String(reciboId); });
  deleteRowsEmLote_(sheet, linhasExistentes.map(function (r) { return r._row; }));

  if (!itens || !itens.length) return;
  var ids = proximosIds_('RecibosOrdensBancarias', itens.length);
  var novasLinhas = itens.map(function (item, indice) {
    var arquivoDriveId = item.arquivo_drive_id || '';
    var arquivoUrl = item.arquivo_url || '';
    if (item.arquivoBase64 && item.arquivoNome) {
      var ob = anexarArquivoRecibo_(PASTA_ORDEM_BANCARIA_ID, item.arquivoBase64, item.arquivoNome, item.arquivoTipo);
      arquivoDriveId = ob.driveId;
      arquivoUrl = ob.url;
    }
    return {
      id: ids[indice],
      recibo_id: reciboId,
      numero_ob: sanitizeString_(item.numero_ob, 50),
      valor: toNumber_(item.valor),
      arquivo_drive_id: arquivoDriveId,
      arquivo_url: arquivoUrl,
      criado_por: criadoPor,
      data_criacao: nowIso_()
    };
  });
  appendObjectRows_(sheet, novasLinhas);
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
    // Número do próprio documento de Nota de Liquidação (ex. "2026LE000755"),
    // extraído por OCR (ver lerAnexoRecibo) - mostrado na tabela "Documentos
    // anexados" da parcela de 70% de um Recibo dividido de Contrato de
    // Gestão (TES), mas gravado pra qualquer Recibo com NL lida, sem
    // depender do Objeto (sessão 2026-08-06).
    nota_liquidacao_numero: sanitizeString_(dados.nota_liquidacao_numero, 50),
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
  var unidade = buscarUnidadePorId_(dados.unidade_id);
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
    visualizado_apos_alerta: true,
    excluido: false
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
  invalidarCacheRecibos_();
  bumpVersao_(['recibos', 'dashboard']);
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
  var unidade = buscarUnidadePorId_(dadosBase.unidade_id);
  if (!unidade) return fail_('Unidade não encontrada.');

  var parcelaDivididaGrupoId = proximoId_('Recibos') + '-PD';
  var criados = [];
  var sheet = getSheet_(SHEETS.RECIBOS);

  parcelas.forEach(function (parcela) {
    var combinado = Object.assign({}, dadosBase, parcela, { parcela_dividida_grupo_id: parcelaDivididaGrupoId });
    // Múltiplas Ordens Bancárias numa parcela só (sessão 2026-08-06, parcela
    // de 70% de Contrato de Gestão (TES)): valor_pago vira a soma automática
    // dos itens - calculado ANTES de montarLinhaRecibo_ pra já nascer certo
    // na própria linha (evita um 2º updateObjectRow_ logo em seguida).
    if (parcela.ordens_bancarias) combinado.valor_pago = somaOrdensBancarias_(parcela.ordens_bancarias);
    var linha = montarLinhaRecibo_(session, combinado, unidade);
    var id = proximoId_('Recibos');
    var novo = Object.assign({ id: id }, linha, {
      divergente_da_unidade: String(linha.oss_snapshot) !== String(unidade.oss) || String(linha.cnpj_snapshot) !== String(unidade.cnpj),
      alerta_divergencia_valores: false,
      origem: 'manual',
      criado_por: session.id,
      data_criacao: nowIso_(),
      data_ultima_alteracao_status: nowIso_(),
      visualizado_apos_alerta: true,
      excluido: false
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
    if (parcela.ordens_bancarias) {
      substituirOrdensBancariasParcela_(id, parcela.ordens_bancarias, session.id);
      novo.ordens_bancarias = parcela.ordens_bancarias;
    }
    registrarLog_(session, 'Recibo', id, novo.criado_por, 'CRIACAO', '', 'Parcela criada (grupo ' + parcelaDivididaGrupoId + ')');
    criados.push(novo);
  });

  recalcularAlertaRecibo_(parcelaDivididaGrupoId);
  invalidarCacheRecibos_();
  bumpVersao_(['recibos', 'dashboard']);
  return ok_(criados);
}

/**
 * Todas as linhas (não excluídas) de um mesmo grupo de parcela dividida -
 * usado pela edição de Recibo pra mostrar/editar as parcelas já lançadas
 * (ver atualizarParcelasDivididasRecibo, logo abaixo). Cada linha ganha
 * `ordens_bancarias` (sessão 2026-08-06) com as Ordens Bancárias já salvas
 * daquela parcela - reidrata a tabela "Documentos anexados" ao reabrir um
 * Recibo dividido de Contrato de Gestão (TES) pra editar.
 */
function listarRecibosPorGrupo(session, grupoId) {
  if (!grupoId) return ok_([]);
  var linhas = todasRecibosComCache_().filter(function (r) {
    return !toBool_(r.excluido) && String(r.parcela_dividida_grupo_id || '') === String(grupoId);
  });
  linhas.sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });

  var todasOrdensBancarias = sheetToObjects_(getSheetOrdensBancariasRecibo_());
  linhas.forEach(function (linha) {
    linha.ordens_bancarias = todasOrdensBancarias.filter(function (o) { return String(o.recibo_id) === String(linha.id); });
  });
  return ok_(linhas);
}

/**
 * Cria ou atualiza um grupo de parcela dividida a partir da edição de um
 * Recibo já existente (sessão 2026-07-30, pedido do usuário: "quando eu
 * clicar nele, no Editar Recibo apareça a opção de adicionar mais de uma
 * parcela, e pode anexar as liquidações e ordens bancárias, para cada
 * parcela"). Reaproveita montarLinhaRecibo_ (mesmo helper de
 * criarRecibo/criarGrupoParcelaDivididaRecibo) pra montar os campos de
 * negócio de cada linha - só os campos de auditoria/anexo/id são tratados à
 * parte aqui.
 *
 * Duas situações, resolvidas pela mesma lógica:
 * (a) o Recibo `id` ainda é avulso (sem parcela_dividida_grupo_id): um
 *     grupo novo é criado - o item de `parcelas` com `id` igual ao Recibo
 *     em edição vira a atualização dessa MESMA linha (não uma linha nova),
 *     virando a 1ª parcela do grupo.
 * (b) o Recibo `id` já pertence a um grupo: cada item de `parcelas` com
 *     `id` próprio atualiza a linha correspondente (valor/anexo/percentual
 *     - o frontend sempre manda TODAS as linhas do grupo, não só as que
 *     mudaram, senão as omitidas ficariam com dado desatualizado); itens
 *     sem `id` viram parcelas novas no mesmo grupo.
 *
 * Por segurança, um item de `parcelas` com `id` que não pertença nem ao
 * grupo-alvo nem seja o próprio Recibo em edição é ignorado silenciosamente
 * (nunca deveria acontecer vindo do frontend, mas evita cruzar dado de
 * outro Recibo por um id externo/errado).
 */
function atualizarParcelasDivididasRecibo(session, id, dadosBase, parcelas) {
  dadosBase = dadosBase || {};
  if (!parcelas || parcelas.length < 2) return fail_('Informe ao menos duas parcelas.');

  var sheet = getSheet_(SHEETS.RECIBOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Recibo não encontrado.');

  var grupoId = existente.parcela_dividida_grupo_id || (proximoId_('Recibos') + '-PD');
  var unidade = buscarUnidadePorId_(existente.unidade_id);
  var resultado = [];

  parcelas.forEach(function (parcela) {
    if (parcela.id) {
      var linha = findById_(sheet, parcela.id);
      if (!linha) return;
      var pertenceAoGrupo = String(linha.parcela_dividida_grupo_id || '') === String(grupoId);
      var ehLinhaBase = String(linha.id) === String(existente.id);
      if (!pertenceAoGrupo && !ehLinhaBase) return;

      var combinado = Object.assign({ unidade_id: existente.unidade_id }, linha, dadosBase, parcela, { parcela_dividida_grupo_id: grupoId });
      if (parcela.ordens_bancarias) combinado.valor_pago = somaOrdensBancarias_(parcela.ordens_bancarias);
      var camposCalculados = montarLinhaRecibo_(session, combinado, unidade);
      var atualizado = Object.assign({}, linha, camposCalculados, {
        divergente_da_unidade: !!unidade && (String(camposCalculados.oss_snapshot) !== String(unidade.oss || '') || String(camposCalculados.cnpj_snapshot) !== String(unidade.cnpj || ''))
      });
      if (dadosBase.status !== undefined && dadosBase.status !== linha.status) {
        atualizado.data_ultima_alteracao_status = nowIso_();
        atualizado.visualizado_apos_alerta = false;
      }
      if (parcela.removerNotaLiquidacaoArquivo) { atualizado.nota_liquidacao_drive_id = ''; atualizado.nota_liquidacao_url = ''; }
      if (parcela.notaLiquidacaoArquivoBase64 && parcela.notaLiquidacaoArquivoNome) {
        var nl = anexarArquivoRecibo_(PASTA_NOTA_LIQUIDACAO_ID, parcela.notaLiquidacaoArquivoBase64, parcela.notaLiquidacaoArquivoNome, parcela.notaLiquidacaoArquivoTipo);
        atualizado.nota_liquidacao_drive_id = nl.driveId;
        atualizado.nota_liquidacao_url = nl.url;
      }
      if (parcela.removerOrdemBancariaArquivo) { atualizado.ordem_bancaria_arquivo_drive_id = ''; atualizado.ordem_bancaria_arquivo_url = ''; }
      if (parcela.ordemBancariaArquivoBase64 && parcela.ordemBancariaArquivoNome) {
        var ob = anexarArquivoRecibo_(PASTA_ORDEM_BANCARIA_ID, parcela.ordemBancariaArquivoBase64, parcela.ordemBancariaArquivoNome, parcela.ordemBancariaArquivoTipo);
        atualizado.ordem_bancaria_arquivo_drive_id = ob.driveId;
        atualizado.ordem_bancaria_arquivo_url = ob.url;
      }

      var rowIndex = linha._row;
      delete atualizado._row;
      updateObjectRow_(sheet, rowIndex, atualizado);
      if (parcela.ordens_bancarias) {
        substituirOrdensBancariasParcela_(linha.id, parcela.ordens_bancarias, session.id);
        atualizado.ordens_bancarias = parcela.ordens_bancarias;
      }
      registrarDiferencas_(session, 'Recibo', linha.id, linha.criado_por, linha, atualizado, ['_row', 'ordens_bancarias']);
      resultado.push(atualizado);
    } else {
      var combinadoNovo = Object.assign({ unidade_id: existente.unidade_id }, existente, dadosBase, parcela, { parcela_dividida_grupo_id: grupoId });
      if (parcela.ordens_bancarias) combinadoNovo.valor_pago = somaOrdensBancarias_(parcela.ordens_bancarias);
      var camposNovo = montarLinhaRecibo_(session, combinadoNovo, unidade);
      var novoId = proximoId_('Recibos');
      var novo = Object.assign({ id: novoId }, camposNovo, {
        divergente_da_unidade: !!unidade && (String(camposNovo.oss_snapshot) !== String(unidade.oss || '') || String(camposNovo.cnpj_snapshot) !== String(unidade.cnpj || '')),
        alerta_divergencia_valores: false,
        origem: 'manual',
        criado_por: session.id,
        data_criacao: nowIso_(),
        data_ultima_alteracao_status: nowIso_(),
        visualizado_apos_alerta: true,
        excluido: false
      });

      if (parcela.notaLiquidacaoArquivoBase64 && parcela.notaLiquidacaoArquivoNome) {
        var nl2 = anexarArquivoRecibo_(PASTA_NOTA_LIQUIDACAO_ID, parcela.notaLiquidacaoArquivoBase64, parcela.notaLiquidacaoArquivoNome, parcela.notaLiquidacaoArquivoTipo);
        novo.nota_liquidacao_drive_id = nl2.driveId;
        novo.nota_liquidacao_url = nl2.url;
      }
      if (parcela.ordemBancariaArquivoBase64 && parcela.ordemBancariaArquivoNome) {
        var ob2 = anexarArquivoRecibo_(PASTA_ORDEM_BANCARIA_ID, parcela.ordemBancariaArquivoBase64, parcela.ordemBancariaArquivoNome, parcela.ordemBancariaArquivoTipo);
        novo.ordem_bancaria_arquivo_drive_id = ob2.driveId;
        novo.ordem_bancaria_arquivo_url = ob2.url;
      }

      appendObjectRow_(sheet, novo);
      if (parcela.ordens_bancarias) {
        substituirOrdensBancariasParcela_(novoId, parcela.ordens_bancarias, session.id);
        novo.ordens_bancarias = parcela.ordens_bancarias;
      }
      registrarLog_(session, 'Recibo', novoId, novo.criado_por, 'CRIACAO', '', 'Parcela adicionada (grupo ' + grupoId + ')');
      resultado.push(novo);
    }
  });

  recalcularAlertaRecibo_(grupoId);
  invalidarCacheRecibos_();
  bumpVersao_(['recibos', 'dashboard']);
  return ok_(resultado);
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
    'ordem_bancaria', 'numero_processo', 'observacao', 'status', 'oss_snapshot', 'cnpj_snapshot', 'nota_liquidacao_numero'];
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
    var unidade = buscarUnidadePorId_(atualizado.unidade_id);
    atualizado.divergente_da_unidade = !!unidade &&
      (String(atualizado.oss_snapshot || '') !== String(unidade.oss || '') || String(atualizado.cnpj_snapshot || '') !== String(unidade.cnpj || ''));
  }

  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  // data_ultima_alteracao_status/visualizado_apos_alerta são derivados (mudam sozinhos
  // junto de status, não são uma edição real do usuário) - mesmo princípio do SOF.
  registrarDiferencas_(session, 'Recibo', id, existente.criado_por, antigo, atualizado,
    ['_row', 'data_ultima_alteracao_status', 'visualizado_apos_alerta']);

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

  invalidarCacheRecibos_();
  bumpVersao_(['recibos', 'dashboard']);
  return ok_(atualizado);
}

/**
 * Exclusão lógica (soft delete): mantém a linha e o histórico de auditoria,
 * apenas marca excluido = true e some da listagem padrão (listarRecibos) -
 * mesmo padrão de excluirSof em Sof.gs. Qualquer perfil autenticado
 * (analista ou gerente) pode excluir.
 */
function excluirRecibo(session, id) {
  var sheet = getSheet_(SHEETS.RECIBOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Recibo não encontrado.');
  if (toBool_(existente.excluido)) return fail_('Este recibo já foi excluído.');

  var atualizado = Object.assign({}, existente, {
    excluido: true,
    excluido_por: session.id,
    excluido_em: nowIso_()
  });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);

  registrarLog_(session, 'Recibo', id, existente.criado_por, 'EXCLUSAO', '', 'Recibo excluído (lógico)');
  invalidarCacheRecibos_();
  bumpVersao_(['recibos', 'dashboard']);
  return ok_({ id: id });
}

function marcarReciboVisualizado(session, id) {
  var sheet = getSheet_(SHEETS.RECIBOS);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Recibo não encontrado.');
  var atualizado = Object.assign({}, existente, { visualizado_apos_alerta: true });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheRecibos_();
  bumpVersao_(['recibos', 'dashboard']);
  return ok_({ id: id });
}

/** Resolve o DEA de cada Nota de Empenho via o SOF de origem (sof_id -> dea), indexado por numero_ne. */
function mapaDeaPorNumeroNe_() {
  var sofsPorId = {};
  sheetToObjects_(getSheet_(SHEETS.SOF)).forEach(function (s) { sofsPorId[s.id] = s.dea; });
  var mapa = {};
  todasNotasEmpenhoComCache_().forEach(function (n) { mapa[n.numero_ne] = sofsPorId[n.sof_id] || ''; });
  return mapa;
}

/** Filtros compartilhados por listarRecibos e indicadoresRecibos (mesma lista visível = mesmos indicadores). */
function filtrarLinhasRecibos_(rows, params) {
  rows = rows.filter(function (r) { return !toBool_(r.excluido); });

  var unidadeIds = paraArrayFiltro_(params.unidade_id);
  if (unidadeIds.length) rows = rows.filter(function (r) { return unidadeIds.indexOf(String(r.unidade_id)) !== -1; });

  var ossValores = paraArrayFiltro_(params.oss).map(function (v) { return v.toLowerCase(); });
  if (ossValores.length) rows = rows.filter(function (r) { return ossValores.indexOf(String(r.oss_snapshot || '').toLowerCase()) !== -1; });

  var statusValores = paraArrayFiltro_(params.status);
  if (statusValores.length) rows = rows.filter(function (r) { return statusValores.indexOf(r.status) !== -1; });

  var competenciaValores = paraArrayFiltro_(params.competencia);
  if (competenciaValores.length) rows = rows.filter(function (r) { return competenciaValores.indexOf(r.competencia) !== -1; });

  var fonteValores = paraArrayFiltro_(params.fonte);
  if (fonteValores.length) rows = rows.filter(function (r) { return fonteValores.indexOf(r.fonte) !== -1; });

  var tipoUnidadeValores = paraArrayFiltro_(params.tipo_unidade);
  if (tipoUnidadeValores.length) rows = rows.filter(function (r) { return tipoUnidadeValores.indexOf(r.tipo_unidade) !== -1; });

  var deaValores = paraArrayFiltro_(params.dea);
  if (deaValores.length) {
    var mapaDea = mapaDeaPorNumeroNe_();
    rows = rows.filter(function (r) { return deaValores.indexOf(mapaDea[r.nota_empenho]) !== -1; });
  }

  ['objeto', 'instrumento', 'nota_empenho', 'numero_processo'].forEach(function (campo) {
    var valores = paraArrayFiltro_(params[campo]).map(function (v) { return v.toLowerCase(); });
    if (valores.length) {
      rows = rows.filter(function (r) {
        var valorLinha = String(r[campo] || '').toLowerCase();
        return valores.some(function (v) { return valorLinha.indexOf(v) !== -1; });
      });
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

/**
 * Indicadores da tela de Recibos, calculados sobre as linhas já filtradas
 * (sem paginação) - refletem os filtros ativos. "total_a_pagar" fica de fora
 * por enquanto: depende de uma tabela futura de valores mensais recebidos
 * por unidade, ainda não implementada (ver PROGRESS.md, Fase 5).
 */
function calcularIndicadoresRecibos_(rowsFiltradas) {
  var anoAtual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yy');
  var pendentes = 0;
  var totalPagoAno = 0;
  rowsFiltradas.forEach(function (r) {
    if (r.status !== 'PAGO') pendentes++;
    if (String(r.competencia || '').slice(-2) === anoAtual) totalPagoAno += toNumber_(r.valor_pago);
  });
  return { pendentes: pendentes, total_pago_ano: totalPagoAno };
}

/**
 * listarRecibos já retorna os indicadores (campo `indicadores`) calculados
 * sobre a mesma leitura/filtro - a tela de Recibos parava de fazer 2
 * requisições (listarRecibos + indicadoresRecibos, cada uma relendo a aba
 * Recibos inteira) pra fazer só 1. `indicadoresRecibos` continua existindo
 * como ação separada por compatibilidade, caso algo mais precise só dele.
 */
function listarRecibos(session, params) {
  params = params || {};
  var rows = filtrarLinhasRecibos_(todasRecibosComCache_(), params);

  var indicadores = calcularIndicadoresRecibos_(rows);

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

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize, indicadores: indicadores });
}

function indicadoresRecibos(session, params) {
  params = params || {};
  var rows = filtrarLinhasRecibos_(todasRecibosComCache_(), params);

  return ok_(calcularIndicadoresRecibos_(rows));
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
  invalidarCacheRecibos_();
  bumpVersao_(['recibos', 'dashboard']);
  return ok_({ importados: criados.length });
}
