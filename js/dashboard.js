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
    await carregarMapaUsuarios_();
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

  function cartaoIndicadorHtml_(id, icone, valor, rotulo, deltaHtml, cor) {
    const corClasse = cor || 'azul';
    return `
      <div class="cartao-indicador clicavel acento-${corClasse}" id="${id}">
        <div class="cartao-indicador-topo">
          <span class="cartao-indicador-icone ${corClasse}">${icone}</span>
          <span class="cartao-indicador-seta">${ICONE_SETA}</span>
        </div>
        <div class="valor">${valor}</div>
        <div class="rotulo">${rotulo}</div>
        ${deltaHtml || ''}
      </div>`;
  }

  function renderConteudo(dados) {
    const r = dados.recibos, sofNe = dados.sof_ne_pendente, parados = dados.processos_parados,
      ne = dados.notas_empenho, uni = dados.unidades;

    const deltaRecibos = variacaoPercentual_(r.total_recibos, r.total_recibos_competencia_anterior);
    const competenciaAnterior = competenciaAnteriorLabel_(r.competencia);
    const deltaRecibosHtml = deltaRecibos === null ? '' : `<div class="cartao-indicador-delta ${deltaRecibos >= 0 ? 'positivo' : 'negativo'}">${deltaRecibos >= 0 ? '+' : ''}${deltaRecibos}% vs ${UI.escaparHtml(competenciaAnterior)}</div>`;

    const percentualPago = r.total_valor_liquidado > 0 ? Math.round((r.total_valor_pago / r.total_valor_liquidado) * 100) : null;
    const deltaPagoHtml = percentualPago === null ? '' : `<div class="cartao-indicador-delta">${percentualPago}% do valor liquidado</div>`;

    const statusLinhas = Object.keys(r.por_status).map(status => {
      const s = r.por_status[status];
      return `<tr data-status="${UI.escaparHtml(status)}">
        <td>${UI.seloStatusReciboHtml(status)}</td><td>${s.quantidade}</td>
        <td>${UI.formatarMoeda(s.valor_liquidado)}</td><td>${UI.formatarMoeda(s.valor_pago)}</td>
      </tr>`;
    }).join('');

    const paradosHtml = parados.itens.length ? `
      <table class="tabela">
        <thead><tr><th>Tipo</th><th>Identificação</th><th>Criado por</th><th>Dias parado</th></tr></thead>
        <tbody>${parados.itens.map(p => `
          <tr data-id="${p.id}" data-tipo="${p.tipo_processo}">
            <td>${p.tipo_processo}</td>
            <td>${UI.escaparHtml(p.sei || p.numero_processo || p.id)}</td>
            <td>${UI.escaparHtml(nomeUsuario_(p.criado_por))}</td>
            <td>${p.dias_parado}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="estado-vazio">Nenhum processo parado no momento.</p>';

    document.getElementById('dashConteudo').innerHTML = `
      <div class="grade-indicadores">
        ${cartaoIndicadorHtml_('dashCardRecibos', ICONE_RECIBO, r.total_recibos, `Recibos na competência ${UI.escaparHtml(r.competencia)}`, deltaRecibosHtml, 'azul')}
        ${cartaoIndicadorHtml_('dashCardPago', ICONE_CIFRAO, UI.formatarMoeda(r.total_valor_pago), 'Valor pago no período', deltaPagoHtml, 'verde')}
        ${cartaoIndicadorHtml_('dashCardSofNe', ICONE_ARQUIVO, sofNe.total_pendentes, 'SOFs sem NE emitida', `<div class="cartao-indicador-delta">${sofNe.aguardando_mais_de_5_dias} aguardando há mais de 5 dias</div>`, 'amarelo')}
        ${cartaoIndicadorHtml_('dashCardParados', ICONE_RELOGIO, parados.itens.length, 'Processos parados', `<div class="cartao-indicador-delta">${parados.novos_hoje} novo(s) hoje</div>`, 'roxo')}
        ${cartaoIndicadorHtml_('dashCardSaldoNe', ICONE_ALERTA, UI.formatarMoeda(ne.saldo_disponivel), 'Saldo disponível em Notas de Empenho', ne.total_sem_saldo > 0 ? `<div class="cartao-indicador-delta negativo">${ne.total_sem_saldo} sem saldo</div>` : '', 'vermelho')}
        ${cartaoIndicadorHtml_('dashCardUnidades', ICONE_PREDIO, UI.formatarMoeda(uni.total_mensal_comprometido), 'Total mensal comprometido (Unidades ativas)', `<div class="cartao-indicador-delta">${uni.total_unidades_ativas} unidade(s) ativa(s)</div>`, 'ciano')}
      </div>

      <div class="dash-grade-paineis">
        <div class="painel">
          <div class="dash-painel-cabecalho">
            <h3>Recibos por status</h3>
            <a href="#" id="dashVerTodosRecibos">Ver todos &rarr;</a>
          </div>
          <p class="ajuda">Valores consolidados da competência ${UI.escaparHtml(r.competencia)}</p>
          <div class="barra-progresso"><div class="barra-progresso-preenchimento ${percentualPago >= 100 ? 'completo' : ''}" style="width:${Math.min(percentualPago || 0, 100)}%"></div></div>
          <p class="ajuda">${UI.formatarMoeda(r.total_valor_pago)} pagos de ${UI.formatarMoeda(r.total_valor_liquidado)} liquidados</p>
          <table class="tabela">
            <thead><tr><th>Status</th><th>Qtde</th><th>Liquidado</th><th>Pago</th></tr></thead>
            <tbody>${statusLinhas || '<tr><td colspan="4" class="estado-vazio">Sem recibos nesta competência.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="painel">
          <div class="dash-painel-cabecalho">
            <h3>Situação das NE's</h3>
            <a href="#" id="dashVerTodosNe">Ver todas &rarr;</a>
          </div>
          <input type="text" id="dashBuscaNe" class="dash-busca" placeholder="Buscar por número, unidade ou objeto..." />
          <div class="dash-lista dash-lista-rolavel" id="dashNeLista"></div>
        </div>
      </div>

      <div class="painel" id="dashPainelParados">
        <h3 style="font-size:14px;margin:0 0 8px">Processos parados (5+ dias sem alteração de andamento/status)</h3>
        ${paradosHtml}
      </div>`;

    renderNeLista_(ne.itens, '');
    document.getElementById('dashBuscaNe').addEventListener('input', function () { renderNeLista_(ne.itens, this.value); });
    document.getElementById('dashVerTodosNe').addEventListener('click', e => { e.preventDefault(); App.navegarPara('notasEmpenho'); });

    document.getElementById('dashCardRecibos').addEventListener('click', () => App.navegarPara('recibos', { competencia: [r.competencia] }));
    document.getElementById('dashCardPago').addEventListener('click', () => App.navegarPara('recibos', { competencia: [r.competencia] }));
    document.getElementById('dashCardSofNe').addEventListener('click', () => App.navegarPara('sof', { semNe: true }));
    document.getElementById('dashCardParados').addEventListener('click', () => {
      document.getElementById('dashPainelParados').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('dashCardSaldoNe').addEventListener('click', () => App.navegarPara('notasEmpenho'));
    document.getElementById('dashCardUnidades').addEventListener('click', () => App.navegarPara('unidades'));

    document.getElementById('dashVerTodosRecibos').addEventListener('click', e => { e.preventDefault(); App.navegarPara('recibos', { competencia: [r.competencia] }); });

    document.querySelectorAll('#dashConteudo tr[data-status]').forEach(tr => {
      tr.addEventListener('click', () => App.navegarPara('recibos', { competencia: [r.competencia], status: [tr.dataset.status] }));
    });
    document.querySelectorAll('#dashPainelParados tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => App.navegarPara(tr.dataset.tipo === 'SOF' ? 'sof' : 'recibos', { abrirId: tr.dataset.id }));
    });
  }

  /** Lista de "Situação das NE's" (sessão 2026-07-27) - reconstruída a cada busca, sem re-renderizar o resto do dashboard. Vermelho quando `alerta` (saldo atual abaixo da parcela mensal de referência - mesmo critério da tela de Notas de Empenho). */
  function renderNeLista_(itens, filtroTexto) {
    const termo = (filtroTexto || '').trim().toLowerCase();
    const filtrados = termo
      ? itens.filter(g => (g.numero_ne || '').toLowerCase().includes(termo) || (g.unidade_nome || '').toLowerCase().includes(termo) || (g.sof_objeto || '').toLowerCase().includes(termo))
      : itens;
    const alvo = document.getElementById('dashNeLista');
    if (!alvo) return;
    alvo.innerHTML = filtrados.length ? filtrados.map(g => `
      <div class="dash-item-lista dash-item-ne ${g.alerta ? 'alerta' : ''}" data-numero="${UI.escaparHtml(g.numero_ne)}">
        <div class="dash-item-lista-corpo">
          <strong>NE ${UI.escaparHtml(g.numero_ne)}</strong>
          <span>${UI.escaparHtml(g.unidade_nome || '-')} · ${UI.escaparHtml(g.sof_objeto || '-')}</span>
        </div>
        <div class="dash-item-ne-valores">
          <span>Solicitado: ${UI.formatarMoeda(g.valor_bruto)}</span>
          <span>Atendido: ${UI.formatarMoeda(g.valor_liquidado)}</span>
          <span><strong>Saldo: ${UI.formatarMoeda(g.valor_atual)}</strong></span>
        </div>
      </div>`).join('') : '<p class="estado-vazio">Nenhuma Nota de Empenho encontrada.</p>';
    alvo.querySelectorAll('.dash-item-ne').forEach(el => {
      el.addEventListener('click', () => App.navegarPara('notasEmpenho'));
    });
  }

  return { render };
})();
