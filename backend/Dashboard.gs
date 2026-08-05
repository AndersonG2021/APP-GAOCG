/**
 * GAOCG App - Dashboard e Indicadores (Funcionalidade 8).
 */

/**
 * Recibo: indicadores do período selecionado (padrão mês atual, via
 * competencia). Soma valor_pago/valor_liquidado linha a linha (nunca sobre
 * parcela_contratual, que se repete em cada linha de uma mesma parcela dividida).
 * recibosCarregados é opcional - ver obterDashboard (evita reler a aba Recibos
 * mais de uma vez por chamada). Já vem sem excluídos (filtrado em obterDashboard).
 *
 * total_recibos_competencia_anterior (sessão 2026-07-27): usado pelo frontend
 * pra mostrar a variação percentual de "Recibos na competência" vs o mês
 * anterior - reaproveita o mesmo array já carregado, sem reler a aba.
 */
function dashboardRecibos_(session, competencia, recibosCarregados) {
  var rows = recibosCarregados || sheetToObjects_(getSheet_(SHEETS.RECIBOS));
  var doMes = competencia ? rows.filter(function (r) { return r.competencia === competencia; }) : rows;

  var porStatus = {};
  var totalLiquidado = 0;
  var totalPago = 0;

  doMes.forEach(function (r) {
    var status = r.status || '(sem status)';
    if (!porStatus[status]) porStatus[status] = { quantidade: 0, valor_pago: 0, valor_liquidado: 0 };
    porStatus[status].quantidade++;
    porStatus[status].valor_pago += toNumber_(r.valor_pago);
    porStatus[status].valor_liquidado += toNumber_(r.valor_liquidado);
    totalLiquidado += toNumber_(r.valor_liquidado);
    totalPago += toNumber_(r.valor_pago);
  });

  var competenciaAnterior = competencia ? competenciaAnterior_(competencia) : null;
  var totalRecibosAnterior = competenciaAnterior
    ? rows.filter(function (r) { return r.competencia === competenciaAnterior; }).length
    : null;

  // total_recibos_pagos (sessão 2026-07-28): quantos dos recibos da competência
  // já estão com status exatamente "PAGO" - alimenta o card "criados x pagos".
  var totalRecibosPagos = doMes.filter(function (r) {
    return String(r.status || '').toUpperCase() === 'PAGO';
  }).length;

  return {
    competencia: competencia,
    total_recibos: doMes.length,
    total_recibos_pagos: totalRecibosPagos,
    total_recibos_competencia_anterior: totalRecibosAnterior,
    total_valor_liquidado: totalLiquidado,
    total_valor_pago: totalPago,
    por_status: porStatus
  };
}

/**
 * Card "Atendido x Solicitado" (sessão 2026-07-28): compara o total empenhado
 * (soma do valor de todas as Notas de Empenho de SOFs não excluídas) com o
 * total solicitado (soma do total_solicitado de SofFontes das mesmas SOFs).
 * Acumulado geral - não filtra por competência (decisão de desenho, ver
 * docs/ESPECIFICACAO_NOVO_DASHBOARD.md). sofs já vem sem excluídos de
 * obterDashboard.
 *
 * BUG corrigido (sessão 2026-07-29): SOF.total_solicitado nunca é persistido
 * na aba SOF - é sempre recalculado a partir de SofFontes e devolvido só na
 * resposta da API (ver totalSolicitadoDeFontes_, Sof.gs). Somar
 * `s.total_solicitado` direto da linha do SOF sempre dava 0. A fonte correta
 * é a aba SofFontes (todasFontesComCache_), que grava total_solicitado de
 * verdade por linha (substituirFontesDoSof_).
 */
function dashboardSofAtendido_(session, sofs) {
  var idsSof = {};
  sofs.forEach(function (s) { idsSof[s.id] = true; });

  var totalSolicitado = 0;
  todasFontesComCache_().forEach(function (f) {
    if (idsSof[f.sof_id]) totalSolicitado += toNumber_(f.total_solicitado);
  });

  var totalEmpenhado = 0;
  todasNotasEmpenhoComCache_().forEach(function (n) {
    if (idsSof[n.sof_id]) totalEmpenhado += toNumber_(n.valor);
  });

  return {
    total_solicitado: totalSolicitado,
    total_empenhado: totalEmpenhado
  };
}

/**
 * SOF: contagem/listagem de processos com NE pendente de emissão (possui_ne = false).
 * sofsCarregados é opcional - ver obterDashboard. Cada item ganha dias_aguardando
 * (reaproveita diasSemAlteracao_, Sof.gs) e a lista vem cortada nos 8 mais
 * antigos - painel compacto do dashboard; "Ver todos" no frontend navega pra
 * aba SOF com o filtro semNe (listarSof) pra ver a lista completa.
 */
function dashboardSofPendenteNe_(session, sofsCarregados) {
  var rows = (sofsCarregados || sheetToObjects_(getSheet_(SHEETS.SOF)))
    .filter(function (s) { return !toBool_(s.possui_ne); });

  rows.forEach(function (s) {
    s.dias_aguardando = diasSemAlteracao_(s.data_ultima_alteracao_andamento || s.data_criacao);
  });
  rows.sort(function (a, b) { return b.dias_aguardando - a.dias_aguardando; });

  return {
    total_pendentes: rows.length,
    aguardando_mais_de_5_dias: rows.filter(function (s) { return s.dias_aguardando > 5; }).length,
    itens: rows.slice(0, 8)
  };
}

/**
 * Processos (SOF e Recibo) atualmente destacados como "parados" (>5 dias, sem
 * pausa_contagem_parado). sofsCarregados/recibosCarregados são opcionais - ver
 * obterDashboard (evita reler SOF/Recibos, que já tinham sido lidos pelos
 * outros dois indicadores desta mesma chamada).
 *
 * novos_hoje (sessão 2026-07-27): heurístico, não um evento armazenado de
 * verdade - conta quantos itens têm dias_parado === 6, ou seja, hoje é o
 * primeiro dia em que cada um passa a contar como parado (o limite é `> 5`).
 * Se o usuário ficar mais de um dia sem abrir o dashboard, itens que
 * cruzaram o limite "ontem" não aparecem mais aqui (viram dias_parado 7+).
 */
function dashboardParados_(session, sofsCarregados, recibosCarregados) {
  // Uma única leitura (com cache) de ListasPersonalizadas para todas as linhas
  // de SOF+Recibo, em vez de uma por linha (ver RELATORIO_LENTIDAO_SOF.md).
  var listasCarregadas = todasOpcoesComCache_();

  var sofs = (sofsCarregados || sheetToObjects_(getSheet_(SHEETS.SOF))).map(function (s) {
    return Object.assign({ tipo_processo: 'SOF' }, s, calcularDestaqueParadoSof_(s, listasCarregadas));
  }).filter(function (s) { return s.destacar_parado; });

  var recibos = (recibosCarregados || sheetToObjects_(getSheet_(SHEETS.RECIBOS))).map(function (r) {
    return Object.assign({ tipo_processo: 'Recibo' }, r, calcularDestaqueParadoRecibo_(r, listasCarregadas));
  }).filter(function (r) { return r.destacar_parado; });

  var itens = sofs.concat(recibos);
  var novosHoje = itens.filter(function (p) { return p.dias_parado === 6; }).length;

  return { itens: itens, novos_hoje: novosHoje };
}

/**
 * Notas de Empenho: saldo agregado (sessão 2026-07-27). Reaproveita
 * montarGruposNotasEmpenho_ (NotasEmpenho.gs), que já exclui grupos cujo SOF
 * foi excluído (mesma correção usada pela tela de Notas de Empenho). "Sem
 * saldo" = valor_atual <= 0 (esgotado) - mais crítico que o `alerta` que já
 * existe na tela de NE (esse dispara antes, quando ainda fica abaixo da
 * parcela mensal de referência, mas > 0).
 *
 * itens (sessão 2026-07-27, painel "Situação das NE's"): lista completa dos
 * grupos, ordenada com os em `alerta` primeiro (mesmo critério já usado na
 * tela de Notas de Empenho - saldo atual abaixo da parcela mensal de
 * referência) - o painel do dashboard é rolável com busca em vez de
 * paginado, então manda tudo de uma vez.
 */
function dashboardNotasEmpenho_(session, sofsCarregados) {
  var grupos = montarGruposNotasEmpenho_(session, sofsCarregados);
  var totalEmpenhado = 0, totalLiquidado = 0, totalSaldo = 0;
  var semSaldo = [];

  grupos.forEach(function (g) {
    totalEmpenhado += g.valor_bruto;
    totalLiquidado += g.valor_liquidado;
    totalSaldo += g.valor_atual;
    if (g.valor_atual <= 0) semSaldo.push(g);
  });
  semSaldo.sort(function (a, b) { return a.valor_atual - b.valor_atual; });

  // total_saldo_abaixo_20 (sessão 2026-07-28): card "NEs com saldo baixo" -
  // grupos com saldo atual < 20% da parcela mensal de referência. Mesmo
  // critério do filtro saldoBaixo de listarNotasEmpenho (grupoNeComSaldoBaixo_).
  var saldoAbaixo20 = grupos.filter(grupoNeComSaldoBaixo_).length;

  var itens = grupos.slice().sort(function (a, b) {
    if (a.alerta !== b.alerta) return a.alerta ? -1 : 1;
    return a.numero_ne < b.numero_ne ? -1 : 1;
  });

  return {
    total_empenhado: totalEmpenhado,
    total_liquidado: totalLiquidado,
    saldo_disponivel: totalSaldo,
    total_sem_saldo: semSaldo.length,
    total_saldo_abaixo_20: saldoAbaixo20,
    itens_sem_saldo: semSaldo.slice(0, 8),
    itens: itens
  };
}

/**
 * Unidades: total mensal comprometido (sessão 2026-07-27) - soma de
 * parcelaMensalTotal_ (Unidades.gs) de todas as unidades ativas.
 */
function dashboardUnidades_(session) {
  var unidades = todasUnidadesComCache_().filter(function (u) { return toBool_(u.ativo); });
  var tasPorUnidade = agruparTasPorUnidade_();
  var total = unidades.reduce(function (soma, u) {
    return soma + parcelaMensalTotal_(u.valor_contrato_gestao, tasPorUnidade[u.id] || []);
  }, 0);
  return { total_unidades_ativas: unidades.length, total_mensal_comprometido: total };
}

/** Mantido em português independente do locale da planilha, para casar com a lista gerada em app.js (js/app.js). */
var MESES_ABREV_PT_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function competenciaAtual_() {
  var hoje = new Date();
  return MESES_ABREV_PT_[hoje.getMonth()] + '.' + Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'yy');
}

/** "jul.26" -> "jun.26" (troca de ano quando o mês é janeiro). Usado só pela variação percentual do indicador de Recibos. */
function competenciaAnterior_(competencia) {
  var partes = String(competencia).split('.');
  var idx = MESES_ABREV_PT_.indexOf(partes[0]);
  var ano = Number(partes[1]);
  if (idx < 0 || isNaN(ano)) return null;
  idx--;
  if (idx < 0) { idx = 11; ano--; }
  return MESES_ABREV_PT_[idx] + '.' + (ano < 10 ? '0' + ano : String(ano));
}

/** "jul.26" -> ordinal comparável (ano*12 + mês). null se não parsear. Usado no filtro de período dos gráficos. */
function competenciaParaOrdinal_(competencia) {
  if (!competencia) return null;
  var partes = String(competencia).split('.');
  var idx = MESES_ABREV_PT_.indexOf(String(partes[0]).toLowerCase());
  var ano = Number(partes[1]);
  if (idx < 0 || isNaN(ano)) return null;
  // "26" -> 2026 (mesma convenção de 2 dígitos usada em todo o app).
  if (ano < 100) ano += 2000;
  return ano * 12 + idx;
}

/** Data ISO -> competência "mmm.aa". Usado pra atribuir o empenho ao mês em que foi registrado (quando não há cronograma). */
function dataParaCompetencia_(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return MESES_ABREV_PT_[d.getMonth()] + '.' + String(d.getFullYear()).slice(-2);
}

/**
 * Painel de gráficos do Dashboard (sessão 2026-07-28, ver
 * docs/ESPECIFICACAO_NOVO_DASHBOARD.md). Agrega uma métrica por uma dimensão,
 * dentro de um período (competência de/até).
 *
 * params: { metrica, agruparPor, competenciaInicio, competenciaFim }
 *   metrica   : 'pago' | 'liquidado' | 'empenhado' | 'contagem'
 *   agruparPor: 'oss' | 'unidade' | 'fonte' | 'status' | 'mes'
 *
 * Fontes de dado:
 *   - pago/liquidado/contagem -> aba Recibos (filtra por competencia do recibo).
 *   - empenhado -> Notas de Empenho (valor). Por 'mes', distribui pelo
 *     cronograma de desembolso quando a NE original tem um; senão joga o valor
 *     no mês da data_criacao. Por oss/unidade/fonte, soma o valor da NE
 *     filtrando pela competência da data_criacao. 'status' não se aplica a
 *     empenho (NE não tem status) - retorna vazio nesse caso.
 *
 * Retorno: { metrica, agruparPor, itens: [{label, valor}], total, ehMoeda }.
 */
function obterGraficoDashboard(session, params) {
  params = params || {};
  var metrica = params.metrica || 'pago';
  var agruparPor = params.agruparPor || 'oss';
  var inicioOrd = competenciaParaOrdinal_(params.competenciaInicio);
  var fimOrd = competenciaParaOrdinal_(params.competenciaFim);

  function noPeriodo_(competencia) {
    var ord = competenciaParaOrdinal_(competencia);
    if (ord === null) return inicioOrd === null && fimOrd === null;
    if (inicioOrd !== null && ord < inicioOrd) return false;
    if (fimOrd !== null && ord > fimOrd) return false;
    return true;
  }

  var acc = {};
  function add_(label, valor) {
    label = (label === '' || label === null || label === undefined) ? '(sem)' : String(label);
    acc[label] = (acc[label] || 0) + valor;
  }

  var unidadesPorId = {};
  todasUnidadesComCache_().forEach(function (u) { unidadesPorId[u.id] = u; });

  if (metrica === 'empenhado') {
    if (agruparPor === 'status') {
      return ok_({ metrica: metrica, agruparPor: agruparPor, itens: [], total: 0, ehMoeda: true });
    }
    var sofsPorId = {};
    sheetToObjects_(getSheet_(SHEETS.SOF)).forEach(function (s) { if (!toBool_(s.excluido)) sofsPorId[s.id] = s; });
    var cronogramaPorNeId = agruparCronogramaPorNotaEmpenho_();

    todasNotasEmpenhoComCache_().forEach(function (n) {
      var sof = sofsPorId[n.sof_id];
      if (!sof) return; // NE de SOF excluído/inexistente não entra
      if (agruparPor === 'mes') {
        var crono = cronogramaPorNeId[n.id];
        if (crono && crono.length) {
          var ano = Number(String(n.numero_ne).substring(0, 4)) || new Date().getFullYear();
          crono.forEach(function (c) {
            var comp = MESES_ABREV_PT_[c.mes - 1] + '.' + String(ano).slice(-2);
            if (noPeriodo_(comp)) add_(comp, toNumber_(c.valor));
          });
        } else {
          var compCriacao = dataParaCompetencia_(n.data_criacao);
          if (noPeriodo_(compCriacao)) add_(compCriacao, toNumber_(n.valor));
        }
      } else {
        var compCriacao2 = dataParaCompetencia_(n.data_criacao);
        if (!noPeriodo_(compCriacao2)) return;
        var unidade = unidadesPorId[sof.unidade_id];
        var label = agruparPor === 'oss' ? sof.oss_snapshot
          : agruparPor === 'fonte' ? n.fonte
          : (unidade ? unidade.nome : '');
        add_(label, toNumber_(n.valor));
      }
    });
  } else {
    sheetToObjects_(getSheet_(SHEETS.RECIBOS)).forEach(function (r) {
      if (toBool_(r.excluido)) return;
      if (!noPeriodo_(r.competencia)) return;
      var valor = metrica === 'contagem' ? 1
        : metrica === 'liquidado' ? toNumber_(r.valor_liquidado)
        : toNumber_(r.valor_pago);
      var unidade = unidadesPorId[r.unidade_id];
      var label = agruparPor === 'oss' ? r.oss_snapshot
        : agruparPor === 'fonte' ? r.fonte
        : agruparPor === 'status' ? r.status
        : agruparPor === 'mes' ? r.competencia
        : (unidade ? unidade.nome : '');
      add_(label, valor);
    });
  }

  var itens = Object.keys(acc).map(function (label) { return { label: label, valor: acc[label] }; });
  // Por mês: ordem cronológica. Nas demais dimensões: maior valor primeiro.
  if (agruparPor === 'mes') {
    itens.sort(function (a, b) { return (competenciaParaOrdinal_(a.label) || 0) - (competenciaParaOrdinal_(b.label) || 0); });
  } else {
    itens.sort(function (a, b) { return b.valor - a.valor; });
  }
  var total = itens.reduce(function (s, it) { return s + it.valor; }, 0);

  return ok_({ metrica: metrica, agruparPor: agruparPor, itens: itens, total: total, ehMoeda: metrica !== 'contagem' });
}

function obterDashboard(session, params) {
  params = params || {};
  var competencia = params.competencia || competenciaAtual_();

  // SOF e Recibos são lidos uma única vez aqui e repassados aos indicadores
  // abaixo - antes, cada um relia a própria aba do zero. Excluídos (soft
  // delete) saem logo aqui, de uma vez, pra nenhum indicador contar dado
  // apagado (bug real corrigido nesta sessão - nenhum dos indicadores
  // filtrava excluido antes disso).
  var sofs = sheetToObjects_(getSheet_(SHEETS.SOF)).filter(function (s) { return !toBool_(s.excluido); });
  sofs.forEach(function (s) { delete s._row; });
  var recibos = sheetToObjects_(getSheet_(SHEETS.RECIBOS)).filter(function (r) { return !toBool_(r.excluido); });
  recibos.forEach(function (r) { delete r._row; });

  return ok_({
    recibos: dashboardRecibos_(session, competencia, recibos),
    sof_atendido: dashboardSofAtendido_(session, sofs),
    sof_ne_pendente: dashboardSofPendenteNe_(session, sofs),
    processos_parados: dashboardParados_(session, sofs, recibos),
    notas_empenho: dashboardNotasEmpenho_(session, sofs),
    unidades: dashboardUnidades_(session)
  });
}
