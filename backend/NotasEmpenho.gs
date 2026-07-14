/**
 * GAOCG App - Controle de Notas de Empenho (Funcionalidade 5, Anexo III).
 * Sempre vinculada a um único SOF (1:N a partir do SOF).
 */

function listarNotasEmpenhoPorSof(session, sofId) {
  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  rows.forEach(function (n) { delete n._row; });
  rows.sort(function (a, b) { return a.data_criacao < b.data_criacao ? -1 : 1; });
  return ok_(rows);
}

/**
 * numero_ne é obrigatório pra original e reforço (usado pra agrupar as duas
 * sob o mesmo "card" na tela de Notas de Empenho). Reforço exige que já
 * exista uma NE original com esse número no mesmo SOF.
 * Ao gravar a primeira NE original de um SOF, marca SOF.possui_ne = true.
 */
function criarNotaEmpenho(session, dados) {
  dados = dados || {};
  var sofSheet = getSheet_(SHEETS.SOF);
  var sof = findById_(sofSheet, dados.sof_id);
  if (!sof) return fail_('SOF não encontrada.');

  var tipo = dados.tipo === 'reforco' ? 'reforco' : 'original';
  var numeroNe = sanitizeString_(dados.numero_ne, 50);
  if (!isNonEmpty_(numeroNe)) return fail_('Informe o número da Nota de Empenho.');
  if (!isNonEmpty_(dados.fonte)) return fail_('Selecione a fonte da Nota de Empenho.');

  if (tipo === 'reforco') {
    var neSheetCheck = getSheet_(SHEETS.NOTAS_EMPENHO);
    var existeOriginal = sheetToObjects_(neSheetCheck).some(function (n) {
      return String(n.sof_id) === String(dados.sof_id) && n.tipo === 'original' && n.numero_ne === numeroNe;
    });
    if (!existeOriginal) return fail_('Nota de Empenho original com esse número não encontrada para este SOF.');
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
    fonte: sanitizeString_(dados.fonte, 50),
    valor: valor,
    periodo: sanitizeString_(dados.periodo, 100),
    arquivo_drive_id: arquivo.getId(),
    arquivo_url: arquivo.getUrl(),
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(neSheet, nova);
  registrarLog_(session, 'NotaEmpenho', id, sof.criado_por, 'CRIACAO', '', tipo + ' - valor ' + valor);

  if (tipo === 'original' && !toBool_(sof.possui_ne)) {
    var atualizado = Object.assign({}, sof, { possui_ne: true });
    var rowIndex = sof._row;
    delete atualizado._row;
    updateObjectRow_(sofSheet, rowIndex, atualizado);
    registrarLog_(session, 'SOF', sof.id, sof.criado_por, 'possui_ne', 'false', 'true');
  }

  return ok_(nova);
}


/** Soma valor_liquidado de todas as linhas de Recibos vinculadas a essa NE por número (mesma convenção de texto livre já usada no autopreenchimento do Recibo). */
function valorLiquidadoPorNe_(numeroNe) {
  var recibos = sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  return recibos
    .filter(function (r) { return r.nota_empenho === numeroNe; })
    .reduce(function (soma, r) { return soma + toNumber_(r.valor_liquidado); }, 0);
}

/**
 * Listagem própria de Notas de Empenho (Funcionalidade 5, item 4 - Should):
 * um card por número de NE (agrupando original + reforços), com o valor
 * atual já calculado (bruto - liquidado nos Recibos) e o alerta de "abaixo
 * da parcela mensal da fonte". Transversal - todos os perfis veem tudo.
 */
function listarNotasEmpenho(session, params) {
  params = params || {};
  var sofs = sheetToObjects_(getSheet_(SHEETS.SOF));
  var sofsPorId = {};
  sofs.forEach(function (s) { sofsPorId[s.id] = s; });

  var unidadesPorId = {};
  sheetToObjects_(getSheet_(SHEETS.UNIDADES)).forEach(function (u) { unidadesPorId[u.id] = u; });

  var fontesPorSof = agruparFontesPorSof_();

  var linhas = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).map(function (n) {
    delete n._row;
    return n;
  });

  var grupos = {};
  linhas.forEach(function (n) {
    var chave = n.numero_ne;
    if (!chave) return;
    if (!grupos[chave]) grupos[chave] = { numero_ne: chave, sof_id: n.sof_id, fonte: n.fonte, valor: 0, arquivos: [] };
    grupos[chave].valor += toNumber_(n.valor);
    if (n.arquivo_url) grupos[chave].arquivos.push({ tipo: n.tipo, url: n.arquivo_url, data: n.data_criacao });
  });

  var resultado = Object.keys(grupos).map(function (numeroNe) {
    var grupo = grupos[numeroNe];
    var sof = sofsPorId[grupo.sof_id];
    var unidade = sof ? unidadesPorId[sof.unidade_id] : null;
    var fontesDoSof = fontesPorSof[grupo.sof_id] || [];
    var parcelaMensalRef = fontesDoSof
      .filter(function (f) { return f.fonte === grupo.fonte; })
      .reduce(function (soma, f) { return soma + toNumber_(f.parcela_mensal); }, 0);
    var valorLiquidado = valorLiquidadoPorNe_(numeroNe);
    var valorAtual = grupo.valor - valorLiquidado;

    return {
      numero_ne: numeroNe,
      sof_id: grupo.sof_id,
      fonte: grupo.fonte,
      sof_sei: sof ? sof.sei : '',
      sof_numero: sof ? sof.sof_numero : '',
      sof_objeto: sof ? sof.objeto : '',
      sof_unidade_id: sof ? sof.unidade_id : '',
      sof_oss: sof ? sof.oss_snapshot : '',
      sof_dea: sof ? sof.dea : '',
      sof_tipo_unidade: unidade ? unidade.tipo : '',
      valor_bruto: grupo.valor,
      valor_liquidado: valorLiquidado,
      valor_atual: valorAtual,
      parcela_mensal_referencia: parcelaMensalRef,
      alerta: parcelaMensalRef > 0 && valorAtual < parcelaMensalRef,
      arquivos: grupo.arquivos
    };
  });

  if (params.unidade_id) resultado = resultado.filter(function (g) { return String(g.sof_unidade_id) === String(params.unidade_id); });
  if (params.fonte) resultado = resultado.filter(function (g) { return g.fonte === params.fonte; });
  if (params.oss) resultado = resultado.filter(function (g) { return g.sof_oss === params.oss; });
  if (params.objeto) resultado = resultado.filter(function (g) { return g.sof_objeto === params.objeto; });
  if (params.tipo_unidade) resultado = resultado.filter(function (g) { return g.sof_tipo_unidade === params.tipo_unidade; });
  if (params.dea) resultado = resultado.filter(function (g) { return g.sof_dea === params.dea; });

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
  return ok_(resultado);
}

function totalEmpenhadoSof_(sofId) {
  var rows = sheetToObjects_(getSheet_(SHEETS.NOTAS_EMPENHO)).filter(function (n) {
    return String(n.sof_id) === String(sofId);
  });
  return rows.reduce(function (soma, n) { return soma + toNumber_(n.valor); }, 0);
}
