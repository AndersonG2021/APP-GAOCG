/**
 * GAOCG App - Gerador de Relatórios (Parte 3 do redesign do Dashboard,
 * 2026-07-28). Ver docs/ESPECIFICACAO_NOVO_DASHBOARD.md.
 *
 * Um relatório é montado a partir de UMA fonte de dados (Recibos / Notas de
 * Empenho / SOF / Unidades), com filtros, escolha de colunas e agrupamento
 * opcional (subtotais). gerarRelatorio devolve os dados já filtrados/projetados
 * - o frontend renderiza (Tela/PDF) e exporta CSV. gerarRelatorioSheets cria
 * uma planilha no Google e devolve o link. Modelos ficam na aba
 * RelatoriosModelos e são COMPARTILHADOS (todos veem todos).
 */

/* ===== Catálogo de fontes e colunas ===== */

/** Aplica os filtros comuns a uma linha "canônica" (com os campos padronizados usados nas colunas). */
function relFiltroCompetenciaOk_(competencia, iniOrd, fimOrd) {
  if (iniOrd === null && fimOrd === null) return true;
  var o = competenciaParaOrdinal_(competencia);
  if (o === null) return false;
  if (iniOrd !== null && o < iniOrd) return false;
  if (fimOrd !== null && o > fimOrd) return false;
  return true;
}

function montarLinhasRecibos_(session, filtros) {
  var iniOrd = competenciaParaOrdinal_(filtros.competenciaInicio);
  var fimOrd = competenciaParaOrdinal_(filtros.competenciaFim);
  var oss = paraArrayFiltro_(filtros.oss), uni = paraArrayFiltro_(filtros.unidade_id),
    fontes = paraArrayFiltro_(filtros.fonte), status = paraArrayFiltro_(filtros.status);
  var unidadesPorId = {};
  todasUnidadesComCache_().forEach(function (u) { unidadesPorId[u.id] = u; });

  return sheetToObjects_(getSheet_(SHEETS.RECIBOS))
    .filter(function (r) { return !toBool_(r.excluido); })
    .filter(function (r) {
      if (!relFiltroCompetenciaOk_(r.competencia, iniOrd, fimOrd)) return false;
      if (oss.length && oss.indexOf(r.oss_snapshot) === -1) return false;
      if (uni.length && uni.indexOf(String(r.unidade_id)) === -1) return false;
      if (fontes.length && fontes.indexOf(r.fonte) === -1) return false;
      if (status.length && status.indexOf(r.status) === -1) return false;
      return true;
    })
    .map(function (r) {
      var u = unidadesPorId[r.unidade_id] || {};
      return {
        competencia: r.competencia || '', unidade: u.nome || '', oss: r.oss_snapshot || '',
        tipo_unidade: r.tipo_unidade || u.tipo || '', objeto: r.objeto || '', instrumento: r.instrumento || '',
        fonte: r.fonte || '', nota_empenho: r.nota_empenho || '', status: r.status || '',
        valor_liquidado: toNumber_(r.valor_liquidado), valor_pago: toNumber_(r.valor_pago),
        ordem_bancaria: r.ordem_bancaria || '', numero_processo: r.numero_processo || ''
      };
    });
}

function montarLinhasNe_(session, filtros) {
  var oss = paraArrayFiltro_(filtros.oss), uni = paraArrayFiltro_(filtros.unidade_id), fontes = paraArrayFiltro_(filtros.fonte);
  return montarGruposNotasEmpenho_(session)
    .filter(function (g) {
      if (oss.length && oss.indexOf(g.sof_oss) === -1) return false;
      if (uni.length && uni.indexOf(String(g.sof_unidade_id)) === -1) return false;
      if (fontes.length && fontes.indexOf(g.fonte) === -1) return false;
      return true;
    })
    .map(function (g) {
      return {
        numero_ne: g.numero_ne || '', unidade: g.unidade_nome || '', oss: g.sof_oss || '', fonte: g.fonte || '',
        objeto: g.sof_objeto || '', empenhado: g.valor_bruto, atendido: g.valor_liquidado, saldo: g.valor_atual
      };
    });
}

function montarLinhasSof_(session, filtros) {
  var oss = paraArrayFiltro_(filtros.oss), uni = paraArrayFiltro_(filtros.unidade_id);
  var unidadesPorId = {};
  todasUnidadesComCache_().forEach(function (u) { unidadesPorId[u.id] = u; });
  return sheetToObjects_(getSheet_(SHEETS.SOF))
    .filter(function (s) { return !toBool_(s.excluido); })
    .filter(function (s) {
      if (oss.length && oss.indexOf(s.oss_snapshot) === -1) return false;
      if (uni.length && uni.indexOf(String(s.unidade_id)) === -1) return false;
      return true;
    })
    .map(function (s) {
      var u = unidadesPorId[s.unidade_id] || {};
      var periodo = (s.periodo_inicio || '') + (s.periodo_fim ? ' a ' + s.periodo_fim : '');
      return {
        sei: s.sei || '', sof_numero: s.sof_numero || '', unidade: u.nome || '', oss: s.oss_snapshot || '',
        objeto: s.objeto || '', andamento: s.andamento || '', total_solicitado: toNumber_(s.total_solicitado),
        possui_ne: toBool_(s.possui_ne) ? 'Sim' : 'Não', periodo: periodo
      };
    });
}

function montarLinhasUnidades_(session, filtros) {
  var oss = paraArrayFiltro_(filtros.oss);
  return todasUnidadesComCache_()
    .filter(function (u) { return !oss.length || oss.indexOf(u.oss) !== -1; })
    .map(function (u) {
      return {
        nome: u.nome || '', tipo: u.tipo || '', oss: u.oss || '', cnpj: u.cnpj || '',
        contrato_gestao: u.contrato_gestao || '', ativo: toBool_(u.ativo) ? 'Sim' : 'Não'
      };
    });
}

var RELATORIO_CATALOGO_ = {
  recibos: {
    rotulo: 'Recibos', montar: montarLinhasRecibos_,
    colunas: [
      { key: 'competencia', rotulo: 'Competência', tipo: 'texto' },
      { key: 'unidade', rotulo: 'Unidade', tipo: 'texto' },
      { key: 'oss', rotulo: 'OSS', tipo: 'texto' },
      { key: 'tipo_unidade', rotulo: 'Tipo', tipo: 'texto' },
      { key: 'objeto', rotulo: 'Objeto', tipo: 'texto' },
      { key: 'instrumento', rotulo: 'Instrumento', tipo: 'texto' },
      { key: 'fonte', rotulo: 'Fonte', tipo: 'texto' },
      { key: 'nota_empenho', rotulo: 'Nota de Empenho', tipo: 'texto' },
      { key: 'status', rotulo: 'Status', tipo: 'texto' },
      { key: 'valor_liquidado', rotulo: 'Liquidado', tipo: 'moeda' },
      { key: 'valor_pago', rotulo: 'Pago', tipo: 'moeda' },
      { key: 'ordem_bancaria', rotulo: 'Ordem bancária', tipo: 'texto' },
      { key: 'numero_processo', rotulo: 'Nº Processo', tipo: 'texto' }
    ]
  },
  notasEmpenho: {
    rotulo: 'Notas de Empenho', montar: montarLinhasNe_,
    colunas: [
      { key: 'numero_ne', rotulo: 'Número NE', tipo: 'texto' },
      { key: 'unidade', rotulo: 'Unidade', tipo: 'texto' },
      { key: 'oss', rotulo: 'OSS', tipo: 'texto' },
      { key: 'fonte', rotulo: 'Fonte', tipo: 'texto' },
      { key: 'objeto', rotulo: 'Objeto', tipo: 'texto' },
      { key: 'empenhado', rotulo: 'Empenhado', tipo: 'moeda' },
      { key: 'atendido', rotulo: 'Atendido', tipo: 'moeda' },
      { key: 'saldo', rotulo: 'Saldo', tipo: 'moeda' }
    ]
  },
  sof: {
    rotulo: 'SOF', montar: montarLinhasSof_,
    colunas: [
      { key: 'sei', rotulo: 'SEI', tipo: 'texto' },
      { key: 'sof_numero', rotulo: 'Nº SOF', tipo: 'texto' },
      { key: 'unidade', rotulo: 'Unidade', tipo: 'texto' },
      { key: 'oss', rotulo: 'OSS', tipo: 'texto' },
      { key: 'objeto', rotulo: 'Objeto', tipo: 'texto' },
      { key: 'andamento', rotulo: 'Andamento', tipo: 'texto' },
      { key: 'total_solicitado', rotulo: 'Total solicitado', tipo: 'moeda' },
      { key: 'possui_ne', rotulo: 'Possui NE', tipo: 'texto' },
      { key: 'periodo', rotulo: 'Período', tipo: 'texto' }
    ]
  },
  unidades: {
    rotulo: 'Unidades', montar: montarLinhasUnidades_,
    colunas: [
      { key: 'nome', rotulo: 'Nome', tipo: 'texto' },
      { key: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { key: 'oss', rotulo: 'OSS', tipo: 'texto' },
      { key: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' },
      { key: 'contrato_gestao', rotulo: 'Contrato de gestão', tipo: 'texto' },
      { key: 'ativo', rotulo: 'Ativa', tipo: 'texto' }
    ]
  }
};

/** Campo (chave de coluna) usado como grupo, por dimensão de agrupamento. */
var RELATORIO_CAMPO_GRUPO_ = { oss: 'oss', unidade: 'unidade', fonte: 'fonte' };

/** Catálogo (fontes + colunas) para o frontend montar o assistente. */
function obterCatalogoRelatorios(session) {
  var fontes = Object.keys(RELATORIO_CATALOGO_).map(function (k) {
    return { fonte: k, rotulo: RELATORIO_CATALOGO_[k].rotulo, colunas: RELATORIO_CATALOGO_[k].colunas };
  });
  return ok_({ fontes: fontes });
}

/**
 * Monta o relatório (dados já filtrados e projetados nas colunas escolhidas).
 * params: { fonte, filtros, colunas:[keys], agruparPor }
 */
function gerarRelatorio(session, params) {
  params = params || {};
  var catalogo = RELATORIO_CATALOGO_[params.fonte];
  if (!catalogo) return fail_('Fonte de dados inválida.');
  var filtros = params.filtros || {};
  var linhasBrutas = catalogo.montar(session, filtros);

  var chavesSel = (params.colunas && params.colunas.length) ? params.colunas : catalogo.colunas.map(function (c) { return c.key; });
  var colunas = chavesSel
    .map(function (k) { return catalogo.colunas.filter(function (c) { return c.key === k; })[0]; })
    .filter(function (c) { return !!c; });
  if (!colunas.length) return fail_('Selecione ao menos uma coluna.');

  var campoGrupo = RELATORIO_CAMPO_GRUPO_[params.agruparPor];
  var linhas = linhasBrutas.map(function (r) {
    var o = {};
    colunas.forEach(function (c) { o[c.key] = r[c.key]; });
    if (campoGrupo) o.__grupo = (r[campoGrupo] === '' || r[campoGrupo] == null) ? '(sem)' : String(r[campoGrupo]);
    return o;
  });

  return ok_({
    fonte: params.fonte,
    fonte_rotulo: catalogo.rotulo,
    colunas: colunas,
    linhas: linhas,
    agruparPor: params.agruparPor || '',
    total_linhas: linhas.length,
    emitido_em: nowIso_()
  });
}

/* ===== Saída em Google Sheets ===== */

/** Pasta de Drive compartilhada já usada pelo app (mesma dos anexos de NE). */
var RELATORIO_PASTA_DRIVE_ = '1f10o-GB3hFQsWXqes2kPZymhuDCeMY2c';

/**
 * Cria uma planilha no Google com o relatório e devolve o link. Reaproveita
 * gerarRelatorio para os dados; quando há agrupamento, ordena por grupo e
 * escreve subtotais por grupo + total geral. A planilha é movida para a pasta
 * compartilhada do app (mesma sharing dos anexos), não gera link público.
 */
function gerarRelatorioSheets(session, params) {
  var resp = gerarRelatorio(session, params);
  if (!resp.ok) return resp;
  var dados = resp.data;
  var colunas = dados.colunas;
  var chavesMoeda = {};
  colunas.forEach(function (c) { if (c.tipo === 'moeda') chavesMoeda[c.key] = true; });

  var linhas = dados.linhas.slice();
  if (dados.agruparPor) linhas.sort(function (a, b) { return a.__grupo < b.__grupo ? -1 : a.__grupo > b.__grupo ? 1 : 0; });

  var nome = 'Relatório ' + dados.fonte_rotulo + ' - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
  var ss = SpreadsheetApp.create(nome);
  var sheet = ss.getSheets()[0];

  var matriz = [];
  matriz.push([nome]);
  matriz.push(colunas.map(function (c) { return c.rotulo; }));

  var totaisGerais = {};
  var totaisGrupo = {};
  var grupoAtual = null;

  function linhaSubtotal(rotulo, totais) {
    return colunas.map(function (c, i) {
      if (i === 0) return rotulo;
      if (chavesMoeda[c.key]) return totais[c.key] || 0;
      return '';
    });
  }

  linhas.forEach(function (r) {
    if (dados.agruparPor && r.__grupo !== grupoAtual) {
      if (grupoAtual !== null) matriz.push(linhaSubtotal('Subtotal ' + grupoAtual, totaisGrupo));
      grupoAtual = r.__grupo;
      totaisGrupo = {};
      matriz.push(['» ' + grupoAtual]);
    }
    matriz.push(colunas.map(function (c) {
      var v = r[c.key];
      return chavesMoeda[c.key] ? toNumber_(v) : (v == null ? '' : v);
    }));
    colunas.forEach(function (c) {
      if (chavesMoeda[c.key]) {
        totaisGrupo[c.key] = (totaisGrupo[c.key] || 0) + toNumber_(r[c.key]);
        totaisGerais[c.key] = (totaisGerais[c.key] || 0) + toNumber_(r[c.key]);
      }
    });
  });
  if (dados.agruparPor && grupoAtual !== null) matriz.push(linhaSubtotal('Subtotal ' + grupoAtual, totaisGrupo));
  matriz.push(linhaSubtotal('TOTAL GERAL', totaisGerais));

  var maxCols = colunas.length || 1;
  matriz = matriz.map(function (linha) {
    while (linha.length < maxCols) linha.push('');
    return linha;
  });
  sheet.getRange(1, 1, matriz.length, maxCols).setValues(matriz);
  sheet.getRange(1, 1, 1, maxCols).merge().setFontWeight('bold').setFontSize(13);
  sheet.getRange(2, 1, 1, maxCols).setFontWeight('bold');
  colunas.forEach(function (c, i) {
    if (c.tipo === 'moeda') sheet.getRange(3, i + 1, matriz.length - 2, 1).setNumberFormat('R$ #,##0.00');
  });
  sheet.setFrozenRows(2);

  try {
    var arquivo = DriveApp.getFileById(ss.getId());
    DriveApp.getFolderById(RELATORIO_PASTA_DRIVE_).addFile(arquivo);
    DriveApp.getRootFolder().removeFile(arquivo);
  } catch (e) {
    // Se não conseguir mover pra pasta compartilhada, a planilha ainda existe
    // (fica na raiz do Drive da conta do app) - o link retornado continua válido.
  }

  return ok_({ url: ss.getUrl(), nome: nome });
}

/* ===== Modelos de relatório (compartilhados) ===== */

function getSheetModelosRelatorio_() {
  var ss = getSS_();
  var sheet = ss.getSheetByName(SHEETS.RELATORIOS_MODELOS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.RELATORIOS_MODELOS);
    sheet.getRange(1, 1, 1, HEADERS.RelatoriosModelos.length).setValues([HEADERS.RelatoriosModelos]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function listarModelosRelatorio(session) {
  var rows = sheetToObjects_(getSheetModelosRelatorio_());
  return ok_(rows.map(function (m) {
    var cfg = {};
    try { cfg = JSON.parse(m.config_json || '{}'); } catch (e) { cfg = {}; }
    return { id: m.id, nome: m.nome, config: cfg, criado_por: m.criado_por, data_criacao: m.data_criacao };
  }));
}

function salvarModeloRelatorio(session, data) {
  data = data || {};
  var nome = sanitizeString_(data.nome, 120);
  if (!isNonEmpty_(nome)) return fail_('Informe um nome para o modelo.');
  var sheet = getSheetModelosRelatorio_();
  var nova = {
    id: proximoId_('RelatoriosModelos'),
    nome: nome,
    config_json: JSON.stringify(data.config || {}),
    criado_por: session.id,
    data_criacao: nowIso_()
  };
  appendObjectRow_(sheet, nova);
  return ok_(nova);
}

function excluirModeloRelatorio(session, id) {
  var sheet = getSheetModelosRelatorio_();
  var m = findById_(sheet, id);
  if (!m) return fail_('Modelo não encontrado.');
  // Compartilhado, mas só o criador (ou o gerente) pode excluir.
  if (session.perfil !== 'gerente' && String(m.criado_por) !== String(session.id)) {
    return fail_('Você só pode excluir modelos que você criou.');
  }
  deleteRow_(sheet, m._row);
  return ok_({ id: id });
}
