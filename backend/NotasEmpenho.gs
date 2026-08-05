/**
 * GAOCG App - Controle de Notas de Empenho (Funcionalidade 5, Anexo III).
 * Sempre vinculada a um único SOF (1:N a partir do SOF).
 */

/**
 * Lê a aba NotasEmpenho inteira, com cache de 30s (mesmo padrão de
 * todasOpcoesComCache_ em ListasPersonalizadas.gs / todasFontesComCache_ em
 * Sof.gs). Reaproveitada por listarSof (números de NE nos cards), listarNotasEmpenho,
 * listarNotasEmpenhoPorSof e totalEmpenhadoSof_ - antes cada uma relia essa
 * aba do zero.
 *
 * Excluídas (soft delete, sessão 2026-07-29 - ver excluirNotaEmpenho) já
 * saem filtradas AQUI, de uma vez, pra nenhum dos muitos consumidores desta
 * função (montarGruposNotasEmpenho_, buscarNotaEmpenhoOriginal_,
 * agruparValorAtendidoPorSofFonteObjeto_ etc.) precisar lembrar de filtrar
 * individualmente - diferente do padrão usado em SOF/Recibos (filtro no
 * ponto de uso), escolhido aqui porque são bem mais pontos de leitura.
 */
function todasNotasEmpenhoComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'notas_empenho';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).filter(function (n) { return !toBool_(n.excluido); });
  rows.forEach(function (n) { delete n._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheNotasEmpenho_() {
  CacheService.getScriptCache().remove('notas_empenho');
}

/** Mesmo padrão de cache de 30s - ver todasNotasEmpenhoComCache_ acima. */
function todoCronogramaComCache_() {
  var cache = CacheService.getScriptCache();
  var chave = 'notas_empenho_cronograma';
  var emCache = cache.get(chave);
  if (emCache) return JSON.parse(emCache);

  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO_CRONOGRAMA));
  rows.forEach(function (c) { delete c._row; });
  cache.put(chave, JSON.stringify(rows), 30);
  return rows;
}

function invalidarCacheCronograma_() {
  CacheService.getScriptCache().remove('notas_empenho_cronograma');
}

/** Agrupa o cronograma por nota_empenho_id (só a NE "original" de um grupo tem cronograma), ordenado por mês. */
function agruparCronogramaPorNotaEmpenho_() {
  var mapa = {};
  todoCronogramaComCache_().forEach(function (c) {
    var chave = c.nota_empenho_id;
    if (!mapa[chave]) mapa[chave] = [];
    mapa[chave].push({ mes: toNumber_(c.mes), valor: toNumber_(c.valor) });
  });
  Object.keys(mapa).forEach(function (id) { mapa[id].sort(function (a, b) { return a.mes - b.mes; }); });
  return mapa;
}

var NOMES_MESES_CRONOGRAMA = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Ordem em que os 12 VALORES do cronograma aparecem no texto extraído do PDF
 * (sessão 2026-07-30, corrigido com um documento REAL de reforço - antes era
 * só uma suposição nunca confirmada). O grid impresso é 3 linhas x 4 colunas:
 *   Jan  Fev  Mar  Abr
 *   Mai  Jun  Jul  Ago
 *   Set  Out  Nov  Dez
 * Os RÓTULOS saem na ordem de LINHA (Jan,Fev,Mar,Abr,Mai,...,Dez - por isso a
 * suposição anterior parecia razoável), mas os VALORES saem na ordem de
 * COLUNA (Jan,Mai,Set, depois Fev,Jun,Out, depois Mar,Jul,Nov, depois
 * Abr,Ago,Dez) - um artefato de como o PDF foi gerado (os campos de valor são
 * provavelmente preenchidos coluna a coluna no template).
 *
 * Confirmado com um documento de reforço cujo próprio nome de arquivo dizia
 * "REF. OUT A DEZ 26": os valores não-zero apareciam nas posições 6, 9 e 12
 * da sequência extraída - com a ordem de LINHA (assumida antes), isso mapeava
 * errado para Jun/Set/Dez; com a ordem de COLUNA (correta), mapeia certo para
 * Out/Nov/Dez, batendo com o nome do arquivo e com o grid visual do PDF.
 * ORDEM_MESES_VALORES_CRONOGRAMA_[i] = índice do mês (0=Jan) que o i-ésimo
 * valor extraído representa.
 *
 * ⚠️ Dado histórico: NEs cadastradas ANTES desta correção podem ter o
 * cronograma salvo com os meses trocados (ordem de linha, errada) - não é
 * corrigido retroativamente aqui, só a extração de novos anexos daqui pra
 * frente. Se precisar corrigir um cronograma já salvo, é manual na planilha.
 */
var ORDEM_MESES_VALORES_CRONOGRAMA_ = [0, 4, 8, 1, 5, 9, 2, 6, 10, 3, 7, 11];

/**
 * Extrai o Cronograma de Desembolso (12 valores mensais). O texto extraído
 * desse layout (tabela de meses) lista os 12 RÓTULOS primeiro ("JANEIRO:
 * FEVEREIRO: MARÇO: ABRIL:" em blocos de linha) e só depois os 12 VALORES, um
 * por linha - nunca "MÊS: valor" adjacentes (por isso não dá pra casar
 * rótulo+valor por regex simples). Em vez disso, isola a seção do cronograma
 * (entre o título e o próximo cabeçalho conhecido), pega os 12 valores
 * monetários que aparecem nela e remapeia pra o mês certo usando
 * ORDEM_MESES_VALORES_CRONOGRAMA_ (ordem de coluna, não de linha - ver acima).
 */
function extrairCronogramaDesembolso_(texto) {
  var inicioMatch = texto.match(/CRONOGRAMA\s+DE\s+DESEMBOLSO/i);
  if (!inicioMatch) return [];
  var trecho = texto.slice(inicioMatch.index + inicioMatch[0].length);
  var fimMatch = trecho.match(/FICHA\s+FINANCEIRA|ITENS\s+DO\s+EMPENHO|MODALIDADE\s+DE\s+EMPENHO/i);
  if (fimMatch) trecho = trecho.slice(0, fimMatch.index);

  var valores = trecho.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
  if (!valores || valores.length < 12) return [];

  var porMes = [];
  for (var i = 0; i < 12; i++) {
    porMes[ORDEM_MESES_VALORES_CRONOGRAMA_[i]] = normalizarValorMonetarioBr_(valores[i]);
  }
  var cronograma = [];
  for (var m = 0; m < 12; m++) {
    cronograma.push({ mes: m + 1, rotulo: NOMES_MESES_CRONOGRAMA[m], valor: porMes[m] });
  }
  return cronograma;
}

/**
 * "Nº DA N.E. DE REFERÊNCIA:" (sessão 2026-07-30, pedido do usuário) - só
 * aparece preenchido em documentos de REFORÇO, apontando pra NE "mãe" que
 * está sendo reforçada; em NE original o rótulo existe no layout, mas sem
 * valor (fica null). Mesmo padrão "rótulo antes, valor mais adiante" do
 * cronograma: acha o rótulo, e dentro do trecho seguinte (até "CRONOGRAMA DE
 * DESEMBOLSO", a próxima seção conhecida do documento - ou um limite de
 * caracteres se essa seção não existir nesse trecho) pega o primeiro número
 * no formato de NE (mesmo REGEX_NUMERO_NE_DOCUMENTO usado pro número da
 * própria NE, definido em Recibos.gs).
 */
var REGEX_LABEL_NE_REFERENCIA_ = /N[ºO°]\s*DA\s*N\.?\s*E\.?\s*DE\s*REFER[ÊE]NCIA\s*:?/i;
function extrairNeReferencia_(texto) {
  var labelMatch = texto.match(REGEX_LABEL_NE_REFERENCIA_);
  if (!labelMatch) return null;
  var trecho = texto.slice(labelMatch.index + labelMatch[0].length);
  var fimMatch = trecho.match(/CRONOGRAMA\s+DE\s+DESEMBOLSO/i);
  trecho = fimMatch ? trecho.slice(0, fimMatch.index) : trecho.slice(0, 600);
  var numeroMatch = trecho.match(REGEX_NUMERO_NE_DOCUMENTO);
  return numeroMatch ? numeroMatch[1].toUpperCase() : null;
}

/**
 * "Preço Total" fica perto de "LOCALIDADE DE ENTREGA" no rodapé do documento,
 * numa linha só (rótulo "TOTAL" + valor), diferente do cabeçalho da tabela de
 * itens ("PREÇO UNITÁRIO"/"PREÇO TOTAL", sem valor logo depois) - o
 * lookbehind evita casar com esse cabeçalho.
 */
var REGEX_PRECO_TOTAL_NE_DOCUMENTO = /(?<!PRE[ÇC]O\s)\bTOTAL\s*:?\s*([\d.,]+)/i;

/**
 * O código orçamentário da FONTE é um número de 10 dígitos sem separadores
 * (ex.: "0605000000") - único campo do documento nesse formato exato (UG,
 * Programa de Trabalho, CNPJ, CEP etc. sempre têm pontos/barras/traços ou
 * outra quantidade de dígitos), então basta achar o primeiro token de 10
 * dígitos "soltos" no documento.
 */
var REGEX_CODIGO_FONTE_NE_DOCUMENTO = /\b(\d{10})\b/;

/**
 * Classifica o código orçamentário da FONTE na categoria usada pelo app
 * (TESOURO/SUS/Outra) - convenção confirmada com o usuário: prefixo 500 =
 * TESOURO, 600 ou 605 = SUS, 754 = Operação de Crédito (sem categoria própria
 * no app, cai em "Outra"). Prefixo não reconhecido devolve null - o campo
 * Fonte fica sem sugestão automática, em vez de arriscar uma classificação
 * errada num dado financeiro.
 */
function classificarFonteDoCodigoOrcamentario_(codigo) {
  var digitos = String(codigo || '').replace(/\D/g, '').replace(/^0+/, '');
  if (/^500/.test(digitos)) return 'TESOURO';
  if (/^(600|605)/.test(digitos)) return 'SUS';
  if (/^754/.test(digitos)) return 'Outra';
  return null;
}

/**
 * Lê (via OCR) o documento de uma Nota de Empenho ainda não cadastrada e
 * extrai Número, Fonte (classificada do código orçamentário), Preço Total e
 * Cronograma de Desembolso - usado tanto pelo botão "Nova Nota de Empenho"
 * (js/notas-empenho.js) quanto pelo mini-formulário de NE embutido na edição
 * de SOF (js/sof.js, que não usa o cronograma). Cronograma é best-effort (não
 * bloqueia o resto se não achar os 12 meses) - Número/Preço Total são os
 * únicos campos que fazem a leitura falhar se não encontrados.
 * REGEX_NUMERO_NE_DOCUMENTO é a mesma de Recibos.gs (mesmo formato de número
 * em qualquer documento do e-fisco/PE).
 */
function lerAnexoNotaEmpenho(session, params) {
  params = params || {};
  if (!params.arquivoBase64) return fail_('Nenhum arquivo enviado.');

  var texto;
  try {
    texto = extrairTextoOcr_(params.arquivoBase64, params.arquivoNome, params.arquivoTipo);
  } catch (e) {
    return fail_('Não foi possível ler o documento: ' + e.message);
  }

  var matchNumero = texto.match(REGEX_NUMERO_NE_DOCUMENTO);
  if (!matchNumero) return fail_('Não foi possível identificar o número da Nota de Empenho no documento anexado.');
  var numeroNe = matchNumero[1].toUpperCase();

  var matchTotal = texto.match(REGEX_PRECO_TOTAL_NE_DOCUMENTO);
  var precoTotal = matchTotal ? normalizarValorMonetarioBr_(matchTotal[1]) : null;
  if (precoTotal === null) return fail_('Não foi possível identificar o Preço Total no documento anexado.');

  var cronograma = extrairCronogramaDesembolso_(texto);
  var somaCronograma = cronograma.reduce(function (s, m) { return s + m.valor; }, 0);

  var matchFonteCodigo = texto.match(REGEX_CODIGO_FONTE_NE_DOCUMENTO);
  var fonteCodigo = matchFonteCodigo ? matchFonteCodigo[1] : null;

  // numero_ne_referencia (sessão 2026-07-30, pedido do usuário): quando o
  // documento é um REFORÇO, esse campo aponta pra NE "mãe" - devolvido pro
  // frontend conferir contra a NE que o analista selecionou pra reforçar
  // (aviso, não bloqueio - o OCR pode errar a leitura).
  var numeroNeReferencia = extrairNeReferencia_(texto);

  return ok_({
    numero_ne: numeroNe,
    numero_ne_referencia: numeroNeReferencia,
    preco_total: precoTotal,
    cronograma: cronograma,
    // Informativo - o valor oficial impresso é o preco_total; se a soma do
    // cronograma não bater (ou não tiver sido lido), o frontend só avisa, não bloqueia.
    cronograma_diverge_do_total: cronograma.length === 12 && Math.abs(precoTotal - somaCronograma) > 0.01,
    fonte: fonteCodigo ? classificarFonteDoCodigoOrcamentario_(fonteCodigo) : null,
    fonte_codigo: fonteCodigo
  });
}

function listarNotasEmpenhoPorSof(session, sofId) {
  var rows = todasNotasEmpenhoComCache_().filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  rows.sort(function (a, b) { return a.data_criacao < b.data_criacao ? -1 : 1; });
  return ok_(rows);
}

/**
 * Notas de Empenho (agrupadas por número) de uma Unidade - usado pelo Recibo
 * (sessão 2026-07-29) pra a analista escolher a NE certa em vez de digitar o
 * número à mão, com o Objeto sugerido automaticamente a partir da NE
 * escolhida (fecha a cadeia SOF->NE->Recibo). Enxuto de propósito (só os
 * campos que o formulário de Recibo precisa), reaproveitando
 * montarGruposNotasEmpenho_ (mesma fonte de dado de toda a tela de NE).
 */
function listarNotasEmpenhoPorUnidade(session, unidadeId) {
  var grupos = montarGruposNotasEmpenho_(session)
    .filter(function (g) { return String(g.sof_unidade_id) === String(unidadeId); });
  grupos.sort(function (a, b) { return a.numero_ne < b.numero_ne ? -1 : 1; });
  return ok_(grupos.map(function (g) {
    return { numero_ne: g.numero_ne, objeto: g.objeto, fonte: g.fonte, sof_id: g.sof_id };
  }));
}

/**
 * numero_ne é obrigatório pra original e reforço (usado pra agrupar as duas
 * sob o mesmo "card" na tela de Notas de Empenho). Reforço exige que já
 * exista uma NE original com esse número no mesmo SOF.
 * Ao gravar a primeira NE original de um SOF, marca SOF.possui_ne = true.
 *
 * mes_referencia (2026-07-20): novo campo, só para reforços - qual mês do
 * cronograma de desembolso aquele reforço se refere (puramente informativo,
 * mostrado como etiqueta na tabela de cronograma; não entra no cálculo do
 * valor_atual/alerta da NE, que continua vindo só da soma bruta menos o
 * liquidado nos Recibos).
 */
/**
 * Localiza a NE original (tipo='original') de um número dentro de um SOF -
 * usada pra herdar fonte/objeto ao criar um reforço (nunca escolhidos de
 * novo, sempre vêm da original correspondente). Compartilhada por
 * criarNotaEmpenho (reforço avulso) e criarReforcosEmLote (reforço com
 * múltiplos meses detectados por OCR, sessão 2026-07-29).
 */
function buscarNotaEmpenhoOriginal_(sofId, numeroNe) {
  return todasNotasEmpenhoComCache_().filter(function (n) {
    return String(n.sof_id) === String(sofId) && n.tipo === 'original' && n.numero_ne === numeroNe;
  })[0] || null;
}

function criarNotaEmpenho(session, dados) {
  dados = dados || {};
  var sofSheet = getSheet_(SHEETS.SOF);
  var sof = findById_(sofSheet, dados.sof_id);
  if (!sof) return fail_('SOF não encontrada.');

  var tipo = dados.tipo === 'reforco' ? 'reforco' : 'original';
  var numeroNe = sanitizeString_(dados.numero_ne, 50);
  if (!isNonEmpty_(numeroNe)) return fail_('Informe o número da Nota de Empenho.');

  // fonte/objeto (sessão 2026-07-29): a NE original é associada a um par
  // fonte+objeto específico do SOF (SofFontes) - fecha a cadeia SOF->NE do
  // objeto certo. O reforço NUNCA escolhe fonte/objeto de novo: sempre herda
  // da NE original correspondente (mesmo numero_ne), pra nunca divergir do
  // que a original já estabeleceu - ver docs/ESPECIFICACAO_NOVO_DASHBOARD.md.
  var fonteFinal, objetoFinal;
  if (tipo === 'reforco') {
    var original = buscarNotaEmpenhoOriginal_(dados.sof_id, numeroNe);
    if (!original) return fail_('Nota de Empenho original com esse número não encontrada para este SOF.');
    fonteFinal = original.fonte;
    objetoFinal = original.objeto;
  } else {
    if (!isNonEmpty_(dados.fonte)) return fail_('Selecione a fonte da Nota de Empenho.');
    if (!isNonEmpty_(dados.objeto)) return fail_('Selecione o objeto da Nota de Empenho.');
    fonteFinal = sanitizeString_(dados.fonte, 50);
    objetoFinal = sanitizeString_(dados.objeto, 300);

    // Integridade: a fonte+objeto escolhidos precisam corresponder a uma
    // linha de fonte de fato solicitada neste SOF (SofFontes) - evita uma NE
    // "órfã", que não bate com nada solicitado.
    var fontesDoSof = listarFontesPorSof_(dados.sof_id);
    var bateAlgumaFonte = fontesDoSof.some(function (f) {
      return f.fonte === fonteFinal && String(f.objeto || '') === objetoFinal;
    });
    if (!bateAlgumaFonte) return fail_('Essa combinação de fonte e objeto não corresponde a nenhuma fonte solicitada neste SOF.');
  }

  var mesReferencia = '';
  if (tipo === 'reforco' && isNonEmpty_(dados.mes_referencia)) {
    var mesNum = Number(dados.mes_referencia);
    if (!(mesNum >= 1 && mesNum <= 12)) return fail_('Mês de referência do reforço inválido.');
    mesReferencia = mesNum;
  }

  var valor = toNumber_(dados.valor);
  if (valor <= 0) return fail_('Informe um valor válido para a Nota de Empenho.');
  if (!dados.arquivoBase64 || !dados.arquivoNome) {
    return fail_('Anexe o arquivo da Nota de Empenho.');
  }

  var pasta = DriveApp.getFolderById('1f10o-GB3hFQsWXqes2kPZymhuDCeMY2c');
  var blob = Utilities.newBlob(Utilities.base64Decode(dados.arquivoBase64), dados.arquivoTipo || 'application/pdf', dados.arquivoNome);
  var arquivo = pasta.createFile(blob);

  var neSheet = getSheet_(SHEETS.NOTAS_EMPENHO);
  var id = proximoId_('NotasEmpenho');
  var nova = {
    id: id,
    sof_id: dados.sof_id,
    tipo: tipo,
    numero_ne: numeroNe,
    fonte: fonteFinal,
    objeto: objetoFinal,
    valor: valor,
    periodo: sanitizeString_(dados.periodo, 100),
    mes_referencia: mesReferencia,
    arquivo_drive_id: arquivo.getId(),
    arquivo_url: arquivo.getUrl(),
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(neSheet, nova);
  invalidarCacheNotasEmpenho_();
  registrarLog_(session, 'NotaEmpenho', id, sof.criado_por, 'CRIACAO', '', tipo + ' - valor ' + valor);

  // Cronograma de desembolso é só informativo (não altera o cálculo de
  // alerta da fonte) e só existe pra NE original criada via OCR (botão "Nova
  // Nota de Empenho") - reforço não tem cronograma próprio (tem mes_referencia).
  if (tipo === 'original' && dados.cronograma && dados.cronograma.length) {
    var cronoSheet = getSheet_(SHEETS.NOTAS_EMPENHO_CRONOGRAMA);
    var itensValidos = dados.cronograma.filter(function (item) {
      var mes = Number(item.mes);
      return mes >= 1 && mes <= 12;
    });
    if (itensValidos.length) {
      // Todos os IDs num único lock e uma escrita em lote, em vez de um
      // proximoId_/append por mês (mesma otimização de substituirFontesDoSof_).
      var idsCrono = proximosIds_('NotasEmpenhoCronograma', itensValidos.length);
      var agoraCrono = nowIso_();
      var linhasCrono = itensValidos.map(function (item, i) {
        return {
          id: idsCrono[i],
          nota_empenho_id: id,
          mes: Number(item.mes),
          valor: toNumber_(item.valor),
          criado_por: session.id,
          data_criacao: agoraCrono
        };
      });
      appendObjectRows_(cronoSheet, linhasCrono);
    }
    invalidarCacheCronograma_();
  }

  // Ao anexar a primeira NE original, marca possui_ne = true e, se o
  // andamento ainda estiver antes de "NE EMITIDA" na ordem fixa das 13
  // etapas (ETAPAS_ANDAMENTO_ em Sof.gs), avança automaticamente para lá -
  // uma única leitura/escrita da linha do SOF para os dois campos.
  if (tipo === 'original') {
    var patchSof = {};
    var logsSof = [];

    if (!toBool_(sof.possui_ne)) {
      patchSof.possui_ne = true;
      logsSof.push(['possui_ne', 'false', 'true']);
    }

    var indiceAtual = ETAPAS_ANDAMENTO_.indexOf(sof.andamento);
    var indiceNeEmitida = ETAPAS_ANDAMENTO_.indexOf('NE EMITIDA');
    if (indiceAtual < indiceNeEmitida) {
      patchSof.andamento = 'NE EMITIDA';
      patchSof.data_ultima_alteracao_andamento = nowIso_();
      patchSof.visualizado_apos_alerta = false;
      logsSof.push(['andamento', sof.andamento, 'NE EMITIDA']);
    }

    if (Object.keys(patchSof).length) {
      var atualizado = Object.assign({}, sof, patchSof);
      var rowIndex = sof._row;
      delete atualizado._row;
      updateObjectRow_(sofSheet, rowIndex, atualizado);
      logsSof.forEach(function (l) {
        registrarLog_(session, 'SOF', sof.id, sof.criado_por, l[0], l[1], l[2]);
      });
    }
  }

  bumpVersao_(['notasEmpenho', 'sof', 'dashboard']);
  return ok_(nova);
}

/**
 * Cria vários reforços de uma vez, a partir de UM único documento anexado
 * (sessão 2026-07-29, pedido do usuário: ao anexar um reforço, o OCR detecta
 * sozinho quais meses foram reforçados e o valor de cada um - reaproveita o
 * mesmo "Cronograma de Desembolso" que lerAnexoNotaEmpenho já lê pra NE
 * original; se o documento do reforço tiver esse formato, cada mês com valor
 * > 0 vira um reforço próprio). O arquivo é enviado ao Drive UMA vez só;
 * todas as linhas de reforço compartilham o mesmo arquivo_drive_id/
 * arquivo_url. fonte/objeto sempre herdados da NE original correspondente
 * (nunca escolhidos de novo, mesma regra de criarNotaEmpenho).
 *
 * dados: { sof_id, numero_ne, itens: [{ mes_referencia, valor }, ...],
 *   arquivoBase64, arquivoNome, arquivoTipo }
 */
function criarReforcosEmLote(session, dados) {
  dados = dados || {};
  var sof = findById_(getSheet_(SHEETS.SOF), dados.sof_id);
  if (!sof) return fail_('SOF não encontrada.');

  var numeroNe = sanitizeString_(dados.numero_ne, 50);
  if (!isNonEmpty_(numeroNe)) return fail_('Informe o número da Nota de Empenho a reforçar.');

  var original = buscarNotaEmpenhoOriginal_(dados.sof_id, numeroNe);
  if (!original) return fail_('Nota de Empenho original com esse número não encontrada para este SOF.');

  var itens = (dados.itens || [])
    .map(function (item) { return { mes: Number(item.mes_referencia), valor: toNumber_(item.valor) }; })
    .filter(function (item) { return item.mes >= 1 && item.mes <= 12 && item.valor > 0; });
  if (!itens.length) return fail_('Informe ao menos um mês/valor válido para o reforço.');

  if (!dados.arquivoBase64 || !dados.arquivoNome) return fail_('Anexe o arquivo do reforço.');

  var pasta = DriveApp.getFolderById('1f10o-GB3hFQsWXqes2kPZymhuDCeMY2c');
  var blob = Utilities.newBlob(Utilities.base64Decode(dados.arquivoBase64), dados.arquivoTipo || 'application/pdf', dados.arquivoNome);
  var arquivo = pasta.createFile(blob);

  var neSheet = getSheet_(SHEETS.NOTAS_EMPENHO);
  var idsNe = proximosIds_('NotasEmpenho', itens.length);
  var agora = nowIso_();
  var linhas = itens.map(function (item, i) {
    return {
      id: idsNe[i],
      sof_id: dados.sof_id,
      tipo: 'reforco',
      numero_ne: numeroNe,
      fonte: original.fonte,
      objeto: original.objeto,
      valor: item.valor,
      periodo: '',
      mes_referencia: item.mes,
      arquivo_drive_id: arquivo.getId(),
      arquivo_url: arquivo.getUrl(),
      criado_por: session.id,
      data_criacao: agora
    };
  });
  appendObjectRows_(neSheet, linhas);
  invalidarCacheNotasEmpenho_();

  // Um log por reforço criado, cada um com seu próprio id de linha (mesmo
  // princípio de registrarDiferencas_ - IDs reservados de uma vez, escrita em
  // lote), em vez de uma linha "resumo" sem processo_id de verdade.
  var idsLog = proximosIds_('LogAuditoria', linhas.length);
  var linhasLog = linhas.map(function (l, i) {
    var mesNome = NOMES_MESES_CRONOGRAMA[l.mes_referencia - 1] || l.mes_referencia;
    return montarLinhaLog_(idsLog[i], session, 'NotaEmpenho', l.id, sof.criado_por, 'CRIACAO', '', 'reforco (OCR) - ' + mesNome + ' - valor ' + l.valor);
  });
  appendObjectRows_(getSheet_(SHEETS.LOG_AUDITORIA), linhasLog);
  bumpVersao_(['notasEmpenho', 'sof', 'dashboard', 'logAuditoria']);

  return ok_({ itens: linhas, total: itens.reduce(function (s, item) { return s + item.valor; }, 0) });
}

/**
 * Exclui (logicamente) uma linha de Nota de Empenho - mãe (original) ou
 * reforço (sessão 2026-07-29, pedido do usuário: opção de excluir uma NE de
 * reforço no card de NE, ou uma NE mãe/reforço no card de SOF). Mesmo padrão
 * de excluirSof/excluirRecibo (soft delete: excluido/excluido_por/excluido_em).
 *
 * Regra: não deixa excluir a NE ORIGINAL enquanto ela tiver reforços ainda
 * ativos (evita órfãos - o reforço perderia a referência de fonte/objeto
 * "oficial", mesmo já tendo o snapshot próprio). O analista precisa excluir
 * os reforços primeiro.
 *
 * Se a excluída era a ÚNICA NE original ativa do SOF, `SOF.possui_ne` volta
 * pra false (o SOF volta a aparecer no filtro "Sem NE emitida" da tela de
 * SOF) - o andamento (stepper) NÃO é revertido automaticamente, por ser um
 * campo de fluxo de trabalho que o analista já pode ter avançado manualmente
 * por outros motivos.
 */
function excluirNotaEmpenho(session, id) {
  var sheet = getSheet_(SHEETS.NOTAS_EMPENHO);
  var existente = findById_(sheet, id);
  if (!existente) return fail_('Nota de Empenho não encontrada.');
  if (toBool_(existente.excluido)) return fail_('Esta Nota de Empenho já foi excluída.');

  if (existente.tipo === 'original') {
    var temReforcoAtivo = todasNotasEmpenhoComCache_().some(function (n) {
      return String(n.sof_id) === String(existente.sof_id) && n.numero_ne === existente.numero_ne && n.tipo === 'reforco';
    });
    if (temReforcoAtivo) return fail_('Não é possível excluir a Nota de Empenho original enquanto houver reforços lançados nela. Exclua os reforços primeiro.');
  }

  var atualizado = Object.assign({}, existente, {
    excluido: true,
    excluido_por: session.id,
    excluido_em: nowIso_()
  });
  var rowIndex = existente._row;
  delete atualizado._row;
  updateObjectRow_(sheet, rowIndex, atualizado);
  invalidarCacheNotasEmpenho_();

  // Se essa era a única NE original ativa do SOF, possui_ne volta a false.
  if (existente.tipo === 'original') {
    var sofSheet = getSheet_(SHEETS.SOF);
    var sof = findById_(sofSheet, existente.sof_id);
    if (sof && toBool_(sof.possui_ne)) {
      var aindaTemOriginal = todasNotasEmpenhoComCache_().some(function (n) {
        return String(n.sof_id) === String(existente.sof_id) && n.tipo === 'original';
      });
      if (!aindaTemOriginal) {
        var sofAtualizado = Object.assign({}, sof, { possui_ne: false });
        var sofRowIndex = sof._row;
        delete sofAtualizado._row;
        updateObjectRow_(sofSheet, sofRowIndex, sofAtualizado);
        registrarLog_(session, 'SOF', sof.id, sof.criado_por, 'possui_ne', 'true', 'false');
      }
    }
  }

  registrarLog_(session, 'NotaEmpenho', id, existente.criado_por, 'EXCLUSAO', '',
    (existente.tipo === 'original' ? 'NE original' : 'Reforço') + ' excluído(a) - valor ' + existente.valor);
  bumpVersao_(['notasEmpenho', 'sof', 'dashboard']);
  return ok_({ id: id });
}

/**
 * Soma o valor de TODAS as Notas de Empenho (mãe + reforços), agrupada por
 * "sof_id|fonte|objeto" - numa única leitura da aba NotasEmpenho, em vez de
 * relê-la (ou filtrá-la) uma vez por linha de fonte. Alimenta
 * `total_atendido` de cada linha de SofFontes (sessão 2026-07-29), usado
 * pelo destaque verde/vermelho do cronograma da SOF no frontend - consumida
 * por `obterSof` E por `listarSof` (Sof.gs); mesmo padrão de
 * valorLiquidadoAgrupadoPorNe_ logo abaixo.
 *
 * BUG corrigido nesta sessão: só `obterSof` calculava isso, mas o fluxo real
 * de abrir um card de SOF (abrirSofExistente, js/sof.js) reaproveita a linha
 * já carregada por `listarSof` (otimização de performance - ver
 * RELATORIO_LENTIDAO_SOF.md) e NUNCA chama `obterSof` - então
 * `total_atendido` ficava sempre undefined na prática, e o destaque
 * verde/vermelho do cronograma da SOF nunca aparecia.
 */
function agruparValorAtendidoPorSofFonteObjeto_() {
  var mapa = {};
  todasNotasEmpenhoComCache_().forEach(function (n) {
    var chave = n.sof_id + '|' + n.fonte + '|' + (n.objeto || '');
    mapa[chave] = (mapa[chave] || 0) + toNumber_(n.valor);
  });
  return mapa;
}

/**
 * Soma valor_liquidado de Recibos agrupado por nota_empenho (mesma convenção
 * de texto livre já usada no autopreenchimento do Recibo), numa única
 * leitura da aba Recibos. Antes, listarNotasEmpenho chamava o equivalente de
 * "valorLiquidadoPorNe_(numeroNe)" uma vez por número de NE - um N+1 clássico
 * (mesmo padrão já corrigido pra opcaoTemPausaContagem_ em ListasPersonalizadas.gs,
 * ver RELATORIO_LENTIDAO_SOF.md item 2.5): com 10 NEs cadastradas, isso lia a
 * aba Recibos inteira 10 vezes numa chamada só.
 */
function valorLiquidadoAgrupadoPorNe_() {
  var mapa = {};
  sheetToObjects_(getSheet_(SHEETS.RECIBOS)).forEach(function (r) {
    if (!r.nota_empenho) return;
    mapa[r.nota_empenho] = (mapa[r.nota_empenho] || 0) + toNumber_(r.valor_liquidado);
  });
  return mapa;
}

/**
 * Recibos ativos (não excluídos) agrupados por "numero_ne|competencia", pra
 * resolver a Situação de cada mês do cronograma numa única leitura da aba
 * Recibos (em vez de reler a aba uma vez por mês de cronograma - N+1). Novo
 * nesta sessão (2026-07-20), separado de valorLiquidadoAgrupadoPorNe_ acima
 * pra não mudar o comportamento já existente dela.
 */
function recibosPorNeECompetencia_() {
  var mapa = {};
  sheetToObjects_(getSheet_(SHEETS.RECIBOS)).forEach(function (r) {
    if (!r.nota_empenho || toBool_(r.excluido)) return;
    var chave = r.nota_empenho + '|' + r.competencia;
    (mapa[chave] = mapa[chave] || []).push(r);
  });
  return mapa;
}

var MESES_ABREV_CRONOGRAMA_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Situação de um mês do cronograma de desembolso (novo nesta sessão,
 * 2026-07-20), de acordo com o(s) Recibo(s) vinculados àquela Nota de
 * Empenho na competência correspondente (competencia = "mmm.aa", mesmo
 * formato usado em toda a tela de Recibos):
 * - Nenhum Recibo lançado pra essa competência ainda -> "Previsto".
 * - Existe Recibo e o status é exatamente "PAGO" -> "Pago".
 * - Existe Recibo e o status contém "LIQUID" (ex. alguma etapa de liquidação
 *   configurada em Listas Personalizadas) -> "Liquidado".
 * - Existe Recibo em qualquer outro status do fluxo -> "Em processamento".
 * O ano do mês é resolvido a partir dos 4 primeiros dígitos do numero_ne
 * (formato AAAANNxxxxxx, ex. "2026NE000418").
 */
function situacaoCronogramaMes_(numeroNe, mes, ano, mapaRecibos) {
  var competencia = MESES_ABREV_CRONOGRAMA_[mes - 1] + '.' + String(ano).slice(-2);
  var recibos = mapaRecibos[numeroNe + '|' + competencia] || [];
  if (!recibos.length) return 'Previsto';
  var algumPago = recibos.some(function (r) { return String(r.status || '').toUpperCase() === 'PAGO'; });
  if (algumPago) return 'Pago';
  var algumLiquidado = recibos.some(function (r) { return /LIQUID/i.test(String(r.status || '')); });
  if (algumLiquidado) return 'Liquidado';
  return 'Em processamento';
}

/**
 * Listagem própria de Notas de Empenho (Funcionalidade 5, item 4 - Should):
 * um card por número de NE (agrupando original + reforços), com o valor
 * atual já calculado (bruto - liquidado nos Recibos) e o alerta de "abaixo
 * da parcela mensal da fonte". Transversal - todos os perfis veem tudo.
 */
/**
 * Monta os grupos por numero_ne (original + reforços), com valor_bruto/
 * valor_liquidado/valor_atual/parcela_mensal_referencia/alerta já calculados -
 * antes dos filtros de params e da paginação de listarNotasEmpenho. Extraída
 * de dentro de listarNotasEmpenho (sessão 2026-07-27) pra ser reaproveitada
 * também pelo indicador de saldo do Dashboard (dashboardNotasEmpenho_,
 * Dashboard.gs), sem duplicar essa lógica em dois lugares.
 *
 * sofsCarregados é opcional (evita reler a aba SOF quando quem chama já tem
 * ela em mãos, ex. obterDashboard). Grupos cujo SOF foi excluído (soft
 * delete) ou não existe mais **saem da lista** - achado real desta sessão: a
 * versão anterior juntava com todos os SOFs sem checar excluido, então uma NE
 * de um SOF já excluído continuava aparecendo normalmente na tela de Notas de
 * Empenho.
 */
function montarGruposNotasEmpenho_(session, sofsCarregados) {
  var sofs = sofsCarregados || sheetToObjects_(getSheet_(SHEETS.SOF));
  var sofsPorId = {};
  sofs.forEach(function (s) { if (!toBool_(s.excluido)) sofsPorId[s.id] = s; });

  var unidadesPorId = {};
  todasUnidadesComCache_().forEach(function (u) { unidadesPorId[u.id] = u; });

  var fontesPorSof = agruparFontesPorSof_();
  var valorLiquidadoPorNe = valorLiquidadoAgrupadoPorNe_();
  var cronogramaPorNeId = agruparCronogramaPorNotaEmpenho_();
  var mapaRecibosPorNeCompetencia = recibosPorNeECompetencia_();
  var linhas = todasNotasEmpenhoComCache_();

  var grupos = {};
  linhas.forEach(function (n) {
    var chave = n.numero_ne;
    if (!chave) return;
    // fonte/objeto do grupo vêm da linha ORIGINAL (autoridade - reforço sempre
    // herda os dela na criação, ver criarNotaEmpenho); se por algum motivo a
    // original ainda não foi processada, o valor inicial é sobrescrito quando
    // ela aparecer, abaixo.
    if (!grupos[chave]) grupos[chave] = { numero_ne: chave, sof_id: n.sof_id, fonte: n.fonte, objeto: n.objeto || '', valor: 0, arquivos: [], original_id: null, reforcos: [], linhasNe: [] };
    grupos[chave].valor += toNumber_(n.valor);
    if (n.arquivo_url) grupos[chave].arquivos.push({ tipo: n.tipo, url: n.arquivo_url, data: n.data_criacao });
    // linhasNe (sessão 2026-07-29): linhas individuais (mãe + cada reforço),
    // com id próprio - alimenta a opção de excluir uma linha específica no
    // frontend (card de NE e tabela de NE dentro da edição de SOF).
    grupos[chave].linhasNe.push({ id: n.id, tipo: n.tipo, valor: toNumber_(n.valor), mes_referencia: n.mes_referencia ? Number(n.mes_referencia) : null });
    if (n.tipo === 'original') {
      grupos[chave].original_id = n.id;
      grupos[chave].fonte = n.fonte;
      grupos[chave].objeto = n.objeto || '';
    } else {
      grupos[chave].reforcos.push({ id: n.id, mes_referencia: n.mes_referencia ? Number(n.mes_referencia) : null });
    }
  });

  var resultado = Object.keys(grupos)
    .filter(function (numeroNe) { return !!sofsPorId[grupos[numeroNe].sof_id]; })
    .map(function (numeroNe) {
    var grupo = grupos[numeroNe];
    var sof = sofsPorId[grupo.sof_id];
    var unidade = sof ? unidadesPorId[sof.unidade_id] : null;
    var fontesDoSof = fontesPorSof[grupo.sof_id] || [];
    // Casamento por FONTE + OBJETO (sessão 2026-07-29, antes era só por
    // fonte): permite duas linhas de mesma fonte (ex.: 2x TESOURO) com
    // objetos diferentes no mesmo SOF, sem misturar parcela/saldo/cronograma
    // de uma no cálculo da outra - ver docs/ESPECIFICACAO_NOVO_DASHBOARD.md.
    var fontesDaMesmaFonte = fontesDoSof.filter(function (f) {
      return f.fonte === grupo.fonte && String(f.objeto || '') === String(grupo.objeto || '');
    });
    var parcelaMensalRef = fontesDaMesmaFonte
      .reduce(function (soma, f) { return soma + toNumber_(f.parcela_mensal); }, 0);
    // Total solicitado desta NE = total_solicitado das fontes do SOF que batem
    // com a fonte+objeto da NE (soma dos meses no cronograma da fonte). Base do
    // "Falta ser Atendido" (padronização de nomenclatura 2026-07-28: Atendido =
    // empenhado; Falta = Solicitado - Atendido).
    var totalSolicitadoFonte = fontesDaMesmaFonte
      .reduce(function (soma, f) { return soma + toNumber_(f.total_solicitado); }, 0);
    // SOF de pagamento único (só 1 mês preenchido no cronograma da fonte, ou
    // nenhum) não é um desembolso recorrente - o alerta "abaixo do previsto"
    // só faz sentido pra fontes com mais de 1 mês no cronograma.
    var mesesPreenchidosFonte = fontesDaMesmaFonte.reduce(function (soma, f) {
      return soma + (f.cronograma || []).filter(function (c) { return toNumber_(c.valor) > 0; }).length;
    }, 0);
    var valorLiquidado = valorLiquidadoPorNe[numeroNe] || 0;
    var valorAtual = grupo.valor - valorLiquidado;

    var ano = Number(String(numeroNe).substring(0, 4)) || new Date().getFullYear();
    var cronogramaBase = cronogramaPorNeId[grupo.original_id] || [];
    var cronograma = cronogramaBase.map(function (c) {
      var reforcosDoMes = grupo.reforcos.filter(function (r) { return r.mes_referencia === c.mes; });
      return {
        mes: c.mes,
        valor: c.valor,
        situacao: situacaoCronogramaMes_(numeroNe, c.mes, ano, mapaRecibosPorNeCompetencia),
        reforco: reforcosDoMes.length > 0
      };
    });

    // cronograma_solicitado (sessão 2026-07-29, pedido do usuário): meses
    // SOLICITADOS pela SOF (SofFontesCronograma da fonte+objeto casada),
    // marcados como "atendido" (verde) quando o valor acumulado empenhado
    // (grupo.valor = total_atendido, mãe + reforços) já cobre o acumulado
    // solicitado até aquele mês, e "não atendido" (vermelho) quando ainda não
    // cobre - independe de já ter sido liquidado/pago (isso é o `cronograma`
    // acima, via Recibos). Diferente do cronograma OCR: a fonte é sempre o
    // que a SOF pediu, não o que o documento da NE registrou.
    var acumuladoSolicitado = 0;
    var mesesSolicitados = [];
    fontesDaMesmaFonte.forEach(function (f) {
      (f.cronograma || []).forEach(function (c) {
        if (toNumber_(c.valor) > 0) mesesSolicitados.push({ mes: Number(c.mes), valor: toNumber_(c.valor) });
      });
    });
    mesesSolicitados.sort(function (a, b) { return a.mes - b.mes; });
    var cronogramaSolicitado = mesesSolicitados.map(function (c) {
      acumuladoSolicitado += c.valor;
      return { mes: c.mes, valor: c.valor, atendido: acumuladoSolicitado <= grupo.valor + 0.01 };
    });

    return {
      numero_ne: numeroNe,
      sof_id: grupo.sof_id,
      fonte: grupo.fonte,
      // objeto (sessão 2026-07-29): objeto específico (de SofFontes) que esta
      // NE atende - distinto de sof_objeto (o Objeto geral do SOF, abaixo).
      objeto: grupo.objeto || '',
      sof_sei: sof ? sof.sei : '',
      sof_numero: sof ? sof.sof_numero : '',
      sof_objeto: sof ? sof.objeto : '',
      sof_unidade_id: sof ? sof.unidade_id : '',
      sof_oss: sof ? sof.oss_snapshot : '',
      sof_dea: sof ? sof.dea : '',
      sof_tipo_unidade: unidade ? unidade.tipo : '',
      unidade_nome: unidade ? unidade.nome : '',
      valor_bruto: grupo.valor,
      valor_liquidado: valorLiquidado,
      valor_atual: valorAtual,
      // Nomenclatura padronizada (2026-07-28): total_atendido = empenhado
      // (valor_bruto); saldo_atual = valor_atual; falta_atendido = solicitado -
      // atendido. valor_bruto/valor_liquidado/valor_atual mantidos para não
      // quebrar quem já consome, mas a UI passa a usar os campos abaixo.
      total_solicitado: totalSolicitadoFonte,
      total_atendido: grupo.valor,
      saldo_atual: valorAtual,
      falta_atendido: totalSolicitadoFonte - grupo.valor,
      parcela_mensal_referencia: parcelaMensalRef,
      // alerta (sessão 2026-07-29): unificado com o mesmo critério do card
      // "NEs com saldo baixo" do Dashboard - FRACAO_SALDO_BAIXO_NE_ = 20% da
      // parcela mensal de referência daquele objeto - ver grupoNeComSaldoBaixo_
      // logo abaixo. Antes disparava bem mais cedo, com saldo < 100% da
      // parcela, divergindo do critério dos 20% usado em outros lugares do app.
      alerta: parcelaMensalRef > 0 && valorAtual < FRACAO_SALDO_BAIXO_NE_ * parcelaMensalRef && mesesPreenchidosFonte > 1,
      arquivos: grupo.arquivos,
      ano: ano,
      cronograma: cronograma,
      // cronograma_solicitado (sessão 2026-07-29): meses solicitados pela SOF
      // (fonte+objeto casada), verde quando cobertos pelo acumulado atendido.
      cronograma_solicitado: cronogramaSolicitado,
      // linhas (sessão 2026-07-29): mãe + cada reforço individualmente, com
      // id próprio - permite excluir uma linha específica (mãe ou reforço)
      // sem afetar as demais. Original sempre primeiro, reforços em seguida
      // ordenados por mês de referência (sem mês por último).
      linhas: grupo.linhasNe.slice().sort(function (a, b) {
        if (a.tipo !== b.tipo) return a.tipo === 'original' ? -1 : 1;
        return (a.mes_referencia || 99) - (b.mes_referencia || 99);
      })
    };
  });

  return resultado;
}

/**
 * "Saldo baixo" de uma NE (sessão 2026-07-28): saldo atual (valor_atual)
 * abaixo de 20% da parcela mensal de referência da fonte. Mesmo critério
 * usado pelo card do Dashboard (dashboardNotasEmpenho_, Dashboard.gs) e pelo
 * filtro saldoBaixo de listarNotasEmpenho, para os dois nunca divergirem.
 * Exige parcela_mensal_referencia > 0 (sem parcela de referência não há como
 * dizer se o saldo está "baixo").
 */
var FRACAO_SALDO_BAIXO_NE_ = 0.20;
function grupoNeComSaldoBaixo_(g) {
  return g.parcela_mensal_referencia > 0 &&
    g.valor_atual < FRACAO_SALDO_BAIXO_NE_ * g.parcela_mensal_referencia;
}

function listarNotasEmpenho(session, params) {
  params = params || {};
  var resultado = montarGruposNotasEmpenho_(session);

  // Filtro do Dashboard (card "NEs com saldo baixo"): só grupos com saldo
  // atual abaixo de 20% da parcela mensal de referência.
  if (toBool_(params.saldoBaixo)) resultado = resultado.filter(grupoNeComSaldoBaixo_);

  var unidadeIds = paraArrayFiltro_(params.unidade_id);
  if (unidadeIds.length) resultado = resultado.filter(function (g) { return unidadeIds.indexOf(String(g.sof_unidade_id)) !== -1; });

  var fonteValores = paraArrayFiltro_(params.fonte);
  if (fonteValores.length) resultado = resultado.filter(function (g) { return fonteValores.indexOf(g.fonte) !== -1; });

  var ossValores = paraArrayFiltro_(params.oss);
  if (ossValores.length) resultado = resultado.filter(function (g) { return ossValores.indexOf(g.sof_oss) !== -1; });

  var objetoValores = paraArrayFiltro_(params.objeto);
  if (objetoValores.length) resultado = resultado.filter(function (g) { return objetoValores.indexOf(g.sof_objeto) !== -1; });

  var tipoUnidadeValores = paraArrayFiltro_(params.tipo_unidade);
  if (tipoUnidadeValores.length) resultado = resultado.filter(function (g) { return tipoUnidadeValores.indexOf(g.sof_tipo_unidade) !== -1; });

  var deaValores = paraArrayFiltro_(params.dea);
  if (deaValores.length) resultado = resultado.filter(function (g) { return deaValores.indexOf(g.sof_dea) !== -1; });

  var busca = sanitizeString_(params.busca, 200).toLowerCase();
  if (busca) {
    resultado = resultado.filter(function (g) {
      return Object.keys(g).some(function (campo) {
        var valor = g[campo];
        if (valor === null || valor === undefined || typeof valor === 'object') return false;
        return String(valor).toLowerCase().indexOf(busca) !== -1;
      });
    });
  }

  resultado.sort(function (a, b) {
    if (a.alerta !== b.alerta) return a.alerta ? -1 : 1;
    return a.numero_ne < b.numero_ne ? -1 : 1;
  });

  var pageSize = Number(params.pageSize) || 20;
  var page = Number(params.page) || 1;
  var total = resultado.length;
  var start = (page - 1) * pageSize;
  var pageRows = resultado.slice(start, start + pageSize);

  return ok_({ items: pageRows, total: total, page: page, pageSize: pageSize });
}

function totalEmpenhadoSof_(sofId) {
  var rows = todasNotasEmpenhoComCache_().filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  return rows.reduce(function (soma, n) { return soma + toNumber_(n.valor); }, 0);
}
