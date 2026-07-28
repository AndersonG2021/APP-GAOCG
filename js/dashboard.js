/**
 * GAOCG App - Dashboard e Indicadores (Funcionalidade 8).
 *
 * Reescrito na sessão 2026-07-27: virou um painel gerencial de verdade
 * (SOF/Notas de Empenho/Recibos/Unidades, tudo já sem excluídos), com
 * indicadores clicáveis que navegam pra outra aba já filtrada
 * (App.navegarPara(tela, opts) - ver js/app.js) ou abrem um processo direto.
 * O card antigo "Edições em processo de outro usuário (histórico)" foi
 * removido a pedido do usuário - não era um indicador de trava em tempo real
 * (nada a ver com EdicoesEmAndamento), e sim uma contagem histórica do Log de
 * Auditoria sem filtro de data de verdade (bug real, corrigido/removido
 * junto no backend).
 */

const Dashboard = (function () {
  const ICONE_RECIBO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>';
  const ICONE_CIFRAO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M9 9.2c0-1.5 1.3-2.7 3-2.7s3 1 3 2.3c0 1.6-1.8 2.1-3 2.7-1.3.6-3 1.1-3 2.7 0 1.3 1.3 2.3 3 2.3s3-1.2 3-2.7"/></svg>';
  const ICONE_ARQUIVO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const ICONE_RELOGIO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
  const ICONE_ALERTA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';
  const ICONE_PREDIO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V7l6-4 6 4v14"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/></svg>';
  const ICONE_SETA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const MESES_ABREV_PT_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  let mapaUsuarios_ = {};

  async function carregarMapaUsuarios_() {
    try {
      const usuarios = await Api.chamar('listarUsuarios', {}, { cache: true });
      mapaUsuarios_ = {};
      usuarios.forEach(u => { mapaUsuarios_[u.id] = u.nome; });
    } catch (e) {
      // Cosmético (só usado pra exibir "Criado por" nas listas) - falha
      // silenciosa não deve impedir o resto do dashboard de carregar.
    }
  }
  function nomeUsuario_(id) { return mapaUsuarios_[id] || id || '-'; }

  /** "jul.26" -> "jun.26" (espelha competenciaAnterior_ do backend, Dashboard.gs - só pro rótulo da variação). */
  function competenciaAnteriorLabel_(competencia) {
    const partes = String(competencia || '').split('.');
    let idx = MESES_ABREV_PT_.indexOf(partes[0]);
    let ano = Number(partes[1]);
    if (idx < 0 || isNaN(ano)) return '';
    idx--; if (idx < 0) { idx = 11; ano--; }
    return MESES_ABREV_PT_[idx] + '.' + String(ano).padStart(2, '0');
  }

  function variacaoPercentual_(atual, anterior) {
    if (anterior === null || anterior === undefined || anterior === 0) return null;
    return Math.round(((atual - anterior) / anterior) * 100);
  }

  async function render() {
    const container = document.getElementById('conteudo');
    container.innerHTML = `
      <p class="dash-etiqueta">Visão geral operacional</p>
      <h2 class="titulo-tela">Dashboard</h2>
      <p class="dash-subtitulo">Acompanhe pagamentos, processos e pontos de atenção da GAOCG.</p>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Competência</label><select id="dashCompetencia">${UI.opcoesCompetenciaHtml('')}</select></div>
          <button class="botao" id="btnAtualizarDash">Atualizar</button>
        </div>
        <div id="dashConteudo"></div>
      </div>`;
    document.getElementById('btnAtualizarDash').addEventListener('click', carregar);
    UI.tornarPesquisavel('dashCompetencia');
    await carregar();
  }

  async function carregar() {
    const competencia = document.getElementById('dashCompetencia').value || undefined;
    const params = { competencia };
    const dados = await CacheAbas.comRevalidacao('dashboard', params,
      () => Api.chamar('obterDashboard', params),
      renderConteudo
    );
    if (!document.getElementById('dashCompetencia').value) {
      document.getElementById('dashCompetencia').value = dados.recibos.competencia;
      UI.tornarPesquisavel('dashCompetencia');
    }
    renderConteudo(dados);
  }

  /**
   * clicavel (padrão true): quando false, o card fica só informativo - sem a
   * classe .clicavel (cursor/hover) e sem a seta (usado no card "Atendido x
   * Solicitado", que não navega pra lugar nenhum).
   */
  function cartaoIndicadorHtml_(id, icone, valor, rotulo, deltaHtml, cor, clicavel) {
    const corClasse = cor || 'azul';
    const ehClicavel = clicavel !== false;
    return `
      <div class="cartao-indicador ${ehClicavel ? 'clicavel' : ''} acento-${corClasse}" id="${id}">
        <div class="cartao-indicador-topo">
          <span class="cartao-indicador-icone ${corClasse}">${icone}</span>
          ${ehClicavel ? `<span class="cartao-indicador-seta">${ICONE_SETA}</span>` : ''}
        </div>
        <div class="valor">${valor}</div>
        <div class="rotulo">${rotulo}</div>
        ${deltaHtml || ''}
      </div>`;
  }

  function renderConteudo(dados) {
    const r = dados.recibos, ne = dados.notas_empenho, atendido = dados.sof_atendido;

    // --- Card 1: Recibos criados x pagos na competência ---
    const deltaRecibos = variacaoPercentual_(r.total_recibos, r.total_recibos_competencia_anterior);
    const competenciaAnterior = competenciaAnteriorLabel_(r.competencia);
    const pagos = r.total_recibos_pagos || 0;
    const naoPagos = r.total_recibos - pagos;
    const compRecibosHtml = `<div class="cartao-indicador-delta">${pagos} pago(s) · ${naoPagos} não pago(s)</div>`;
    const deltaVsMesHtml = deltaRecibos === null ? '' : `<div class="cartao-indicador-delta ${deltaRecibos >= 0 ? 'positivo' : 'negativo'}">${deltaRecibos >= 0 ? '+' : ''}${deltaRecibos}% vs ${UI.escaparHtml(competenciaAnterior)}</div>`;

    // --- Card 2: Atendido (empenhado) x Solicitado, acumulado geral ---
    const solicitado = (atendido && atendido.total_solicitado) || 0;
    const empenhado = (atendido && atendido.total_empenhado) || 0;
    const percentualAtendido = solicitado > 0 ? Math.round((empenhado / solicitado) * 100) : null;
    const atendidoDeltaHtml = `
      <div class="cartao-indicador-barra"><div class="cartao-indicador-barra-preenchimento" style="width:${Math.min(percentualAtendido || 0, 100)}%"></div></div>
      <div class="cartao-indicador-delta">${UI.formatarMoeda(empenhado)} empenhado</div>
      <div class="cartao-indicador-subvalor">de ${UI.formatarMoeda(solicitado)} solicitado</div>`;

    document.getElementById('dashConteudo').innerHTML = `
      <div class="grade-indicadores grade-indicadores-3">
        ${cartaoIndicadorHtml_('dashCardRecibos', ICONE_RECIBO, r.total_recibos, `Recibos na competência ${UI.escaparHtml(r.competencia)}`, compRecibosHtml + deltaVsMesHtml, 'azul')}
        ${cartaoIndicadorHtml_('dashCardAtendido', ICONE_CIFRAO, percentualAtendido === null ? '—' : percentualAtendido + '%', 'Atendido do total solicitado', atendidoDeltaHtml, 'verde', false)}
        ${cartaoIndicadorHtml_('dashCardSaldoBaixo', ICONE_ALERTA, ne.total_saldo_abaixo_20, 'NEs com saldo abaixo de 20% da parcela', '<div class="cartao-indicador-delta">Clique para ver as Notas de Empenho</div>', 'vermelho')}
      </div>

      ${painelGraficosHtml_()}`;

    // Card 1: Recibos da competência, com todos os status EXCETO "PAGO"
    // (o filtro de status é "incluir X", então mandamos todos menos PAGO).
    document.getElementById('dashCardRecibos').addEventListener('click', () => App.navegarPara('recibos', { competencia: [r.competencia], statusExceto: ['PAGO'] }));
    // Card 2 (Atendido x Solicitado) é só informativo - sem clique.
    // Card 3: Notas de Empenho já filtrado por saldo < 20% da parcela.
    document.getElementById('dashCardSaldoBaixo').addEventListener('click', () => App.navegarPara('notasEmpenho', { saldoBaixo: true }));

    configurarGraficos_();
  }

  // ===== Painel de gráficos (Parte 2 do redesign, 2026-07-28) =====
  // Uma métrica por dimensão, dentro de um período. Barras/linha usam UM hue
  // (magnitude, não identidade); pizza usa a paleta categórica validada (guia
  // dataviz) em ordem fixa, com teto de fatias. Uma tabela de valores acompanha
  // o gráfico (números exatos + acessibilidade). App é tema claro (light-only).

  const GRAF_METRICAS_ = [
    { valor: 'pago', rotulo: 'Total pago' },
    { valor: 'liquidado', rotulo: 'Total liquidado' },
    { valor: 'empenhado', rotulo: 'Total empenhado (NE)' },
    { valor: 'contagem', rotulo: 'Nº de recibos' }
  ];
  const GRAF_DIMENSOES_ = [
    { valor: 'oss', rotulo: 'OSS' },
    { valor: 'unidade', rotulo: 'Unidade' },
    { valor: 'fonte', rotulo: 'Fonte' },
    { valor: 'status', rotulo: 'Status' },
    { valor: 'mes', rotulo: 'Mês' }
  ];
  const GRAF_TIPOS_ = [
    { valor: 'barrasV', rotulo: 'Barras verticais' },
    { valor: 'barrasH', rotulo: 'Barras horizontais' },
    { valor: 'pizza', rotulo: 'Pizza / Rosca' },
    { valor: 'linha', rotulo: 'Linha (por mês)' }
  ];
  const GRAF_HUE_ = '#2a78d6';
  const GRAF_PALETA_ = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const GRAF_GRID_ = '#e1e0d9', GRAF_EIXO_ = '#c3c2b7';

  function opcoesSelectHtml_(lista, selecionado) {
    return lista.map(o => `<option value="${o.valor}" ${o.valor === selecionado ? 'selected' : ''}>${UI.escaparHtml(o.rotulo)}</option>`).join('');
  }

  function painelGraficosHtml_() {
    return `
      <div class="painel dash-graficos">
        <div class="dash-painel-cabecalho"><h3>Gráficos</h3></div>
        <div class="dash-graf-controles">
          <div class="campo"><label>Métrica</label><select id="grafMetrica">${opcoesSelectHtml_(GRAF_METRICAS_, 'pago')}</select></div>
          <div class="campo"><label>Agrupar por</label><select id="grafAgrupar">${opcoesSelectHtml_(GRAF_DIMENSOES_, 'oss')}</select></div>
          <div class="campo"><label>Tipo de gráfico</label><select id="grafTipo">${opcoesSelectHtml_(GRAF_TIPOS_, 'barrasV')}</select></div>
          <div class="campo"><label>De</label><select id="grafCompInicio">${UI.opcoesCompetenciaHtml('', true)}</select></div>
          <div class="campo"><label>Até</label><select id="grafCompFim">${UI.opcoesCompetenciaHtml('', true)}</select></div>
        </div>
        <div id="grafArea" class="dash-graf-area"><p class="estado-vazio">Carregando…</p></div>
      </div>`;
  }

  function valSelect_(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  function configurarGraficos_() {
    ['grafMetrica', 'grafAgrupar', 'grafTipo', 'grafCompInicio', 'grafCompFim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { aplicarRestricoesGrafico_(); carregarGrafico_(); });
    });
    aplicarRestricoesGrafico_();
    carregarGrafico_();
  }

  /**
   * Regras de compatibilidade da barra de controles:
   * - Métrica "empenhado" não tem dimensão "Status" (NE não tem status).
   * - Tipo "Linha" só quando Agrupar por = Mês.
   */
  function aplicarRestricoesGrafico_() {
    const metrica = valSelect_('grafMetrica');
    const agrupar = document.getElementById('grafAgrupar');
    const tipo = document.getElementById('grafTipo');
    if (!agrupar || !tipo) return;

    const optStatus = agrupar.querySelector('option[value="status"]');
    if (optStatus) optStatus.disabled = (metrica === 'empenhado');
    if (metrica === 'empenhado' && agrupar.value === 'status') agrupar.value = 'oss';

    const optLinha = tipo.querySelector('option[value="linha"]');
    if (optLinha) optLinha.disabled = (agrupar.value !== 'mes');
    if (agrupar.value !== 'mes' && tipo.value === 'linha') tipo.value = 'barrasV';
  }

  async function carregarGrafico_() {
    const area = document.getElementById('grafArea');
    if (!area) return;
    const params = {
      metrica: valSelect_('grafMetrica'),
      agruparPor: valSelect_('grafAgrupar'),
      competenciaInicio: valSelect_('grafCompInicio') || undefined,
      competenciaFim: valSelect_('grafCompFim') || undefined
    };
    const tipo = valSelect_('grafTipo');
    area.innerHTML = '<p class="estado-vazio">Carregando…</p>';
    try {
      const dados = await Api.chamar('obterGraficoDashboard', params, { silencioso: true });
      desenharGrafico_(area, dados, tipo);
    } catch (e) {
      area.innerHTML = `<p class="estado-vazio">Não foi possível carregar o gráfico. ${UI.escaparHtml(e.message || '')}</p>`;
    }
  }

  function desenharGrafico_(area, dados, tipo) {
    const itens = (dados && dados.itens) || [];
    if (!itens.length) {
      area.innerHTML = '<p class="estado-vazio">Sem dados para essa seleção/período.</p>';
      return;
    }
    const ehMoeda = !!dados.ehMoeda;
    let corpo;
    if (tipo === 'pizza') corpo = graficoPizza_(itens, ehMoeda);
    else if (tipo === 'linha') corpo = graficoLinha_(itens, ehMoeda);
    else if (tipo === 'barrasH') corpo = graficoBarrasH_(itens, ehMoeda);
    else corpo = graficoBarrasV_(itens, ehMoeda);
    area.innerHTML = `<div class="graf-render">${corpo}</div>${tabelaValores_(dados, ehMoeda)}`;
  }

  // ----- formatação e utilitários -----
  function formatarValorGraf_(v, ehMoeda) { return ehMoeda ? UI.formatarMoeda(v) : String(Math.round(v)); }
  /** Rótulo curto pra dentro do gráfico (evita textos enormes de moeda). */
  function formatarCompacto_(v, ehMoeda) {
    if (!ehMoeda) return String(Math.round(v));
    const abs = Math.abs(v);
    if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (abs >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return UI.formatarMoeda(v);
  }
  function cortar_(s, max) { s = String(s || ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; }
  /** Top N + "Outros" (evita gráficos ilegíveis com dezenas de categorias). */
  function limitarItens_(itens, max) {
    if (itens.length <= max) return itens.slice();
    const top = itens.slice(0, max);
    const resto = itens.slice(max).reduce((s, it) => s + it.valor, 0);
    top.push({ label: 'Outros', valor: resto });
    return top;
  }
  function rotuloDimensao_(dim) { const d = GRAF_DIMENSOES_.find(x => x.valor === dim); return d ? d.rotulo : 'Categoria'; }
  function tabelaValores_(dados, ehMoeda) {
    const linhas = dados.itens.map(it => `<tr><td>${UI.escaparHtml(it.label)}</td><td class="graf-td-num">${formatarValorGraf_(it.valor, ehMoeda)}</td></tr>`).join('');
    return `
      <details class="graf-tabela-wrap">
        <summary>Ver valores (${dados.itens.length}) · Total: ${formatarValorGraf_(dados.total, ehMoeda)}</summary>
        <table class="tabela graf-tabela"><thead><tr><th>${UI.escaparHtml(rotuloDimensao_(dados.agruparPor))}</th><th class="graf-td-num">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
      </details>`;
  }

  // ----- geradores de gráfico -----
  function graficoBarrasV_(itens, ehMoeda) {
    const dados = limitarItens_(itens, 16);
    const W = 720, H = 300, padL = 16, padR = 16, padT = 22, padB = 66;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = dados.length;
    const max = Math.max.apply(null, dados.map(d => d.valor)) || 1;
    const passo = plotW / n;
    const barW = Math.min(passo * 0.62, 64);
    const baseline = padT + plotH;
    const barras = dados.map((d, i) => {
      const h = max > 0 ? (d.valor / max) * plotH : 0;
      const cxBar = padL + passo * i + passo / 2;
      const bx = cxBar - barW / 2, by = baseline - h;
      return `
        <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="3" fill="${GRAF_HUE_}"/>
        <text x="${cxBar.toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle" class="graf-val-txt">${UI.escaparHtml(formatarCompacto_(d.valor, ehMoeda))}</text>
        <text transform="rotate(-35 ${cxBar.toFixed(1)} ${(baseline + 15).toFixed(1)})" x="${cxBar.toFixed(1)}" y="${(baseline + 15).toFixed(1)}" text-anchor="end" class="graf-eixo-txt">${UI.escaparHtml(cortar_(d.label, 14))}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="graf-svg" role="img" preserveAspectRatio="xMidYMid meet">
      <line x1="${padL}" y1="${baseline}" x2="${W - padR}" y2="${baseline}" stroke="${GRAF_EIXO_}" stroke-width="1"/>
      ${barras}
    </svg>`;
  }

  function graficoBarrasH_(itens, ehMoeda) {
    const dados = limitarItens_(itens, 25);
    const max = Math.max.apply(null, dados.map(d => d.valor)) || 1;
    const linhas = dados.map(d => {
      const pct = max > 0 ? (d.valor / max) * 100 : 0;
      return `<div class="graf-hbar-linha">
        <div class="graf-hbar-rotulo" title="${UI.escaparHtml(d.label)}">${UI.escaparHtml(d.label)}</div>
        <div class="graf-hbar-trilho"><div class="graf-hbar-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="graf-hbar-valor">${UI.escaparHtml(formatarCompacto_(d.valor, ehMoeda))}</div>
      </div>`;
    }).join('');
    return `<div class="graf-hbars">${linhas}</div>`;
  }

  function graficoPizza_(itens, ehMoeda) {
    const dados = limitarItens_(itens, 7);
    const total = dados.reduce((s, d) => s + d.valor, 0) || 1;
    const R = 70, cx = 90, cy = 90, C = 2 * Math.PI * R;
    let acc = 0;
    const arcos = dados.map((d, i) => {
      const dash = (d.valor / total) * C;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${GRAF_PALETA_[i % GRAF_PALETA_.length]}" stroke-width="26" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      acc += dash;
      return seg;
    }).join('');
    const legenda = dados.map((d, i) => `
      <div class="graf-leg-item">
        <span class="graf-leg-cor" style="background:${GRAF_PALETA_[i % GRAF_PALETA_.length]}"></span>
        <span class="graf-leg-rotulo" title="${UI.escaparHtml(d.label)}">${UI.escaparHtml(d.label)}</span>
        <span class="graf-leg-valor">${UI.escaparHtml(formatarCompacto_(d.valor, ehMoeda))} · ${Math.round((d.valor / total) * 100)}%</span>
      </div>`).join('');
    return `<div class="graf-pizza-wrap">
      <svg viewBox="0 0 180 180" class="graf-svg-pizza" role="img"><g>${arcos}</g></svg>
      <div class="graf-legenda">${legenda}</div>
    </div>`;
  }

  function graficoLinha_(itens, ehMoeda) {
    const W = 720, H = 260, padL = 64, padR = 16, padT = 18, padB = 42;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = itens.length;
    const max = Math.max.apply(null, itens.map(d => d.valor)) || 1;
    const x = i => n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1);
    const y = v => padT + plotH - (max > 0 ? (v / max) * plotH : 0);
    const nLinhas = 4;
    let grid = '';
    for (let g = 0; g <= nLinhas; g++) {
      const val = (max * g) / nLinhas, gy = y(val);
      grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${GRAF_GRID_}" stroke-width="1"/>`;
      grid += `<text x="${padL - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="graf-eixo-txt">${UI.escaparHtml(formatarCompacto_(val, ehMoeda))}</text>`;
    }
    const pts = itens.map((d, i) => `${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`).join(' ');
    const marcadores = itens.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.valor).toFixed(1)}" r="3.5" fill="${GRAF_HUE_}"/>`).join('');
    const rotulosX = itens.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - padB + 16}" text-anchor="middle" class="graf-eixo-txt">${UI.escaparHtml(cortar_(d.label, 8))}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="graf-svg" role="img" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <polyline fill="none" stroke="${GRAF_HUE_}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/>
      ${marcadores}
      ${rotulosX}
    </svg>`;
  }

  return { render };
})();
