/**
 * GAOCG App - Gerador de Relatórios (Parte 3 do redesign do Dashboard,
 * 2026-07-28). Assistente em um modal: fonte -> filtros -> colunas ->
 * agrupamento -> formato. Saídas: Visualizar/PDF (janela de impressão), CSV e
 * Google Sheets (backend). Modelos são compartilhados (todos veem todos).
 * Ver docs/ESPECIFICACAO_NOVO_DASHBOARD.md e backend/Relatorios.gs.
 */

const TelaRelatorios = (function () {
  const FILTROS_POR_FONTE_ = {
    recibos: ['competencia', 'oss', 'unidade', 'fonte', 'status'],
    notasEmpenho: ['oss', 'unidade', 'fonte'],
    sof: ['oss', 'unidade'],
    unidades: ['oss']
  };
  const ROTULO_DIMENSAO_ = { oss: 'OSS', unidade: 'Unidade', fonte: 'Fonte' };
  const OPCOES_FONTE_ = ['TESOURO', 'SUS', 'Outra'];

  const state = { catalogo: {}, opcoes: { oss: [], unidades: [], status: [] }, modelos: [] };
  let carregado = false;

  async function carregarBase_() {
    if (carregado) return;
    const [cat, unidades, oss, status, modelos] = await Promise.all([
      Api.chamar('obterCatalogoRelatorios', {}, { cache: true }),
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('STATUS_RECIBO'),
      Api.chamar('listarModelosRelatorio')
    ]);
    cat.fontes.forEach(f => { state.catalogo[f.fonte] = f; });
    state.opcoes.unidades = (unidades.items || []).map(u => ({ valor: u.id, rotulo: u.nome }));
    state.opcoes.oss = (oss || []).map(o => o.valor);
    state.opcoes.status = (status || []).map(o => o.valor);
    state.modelos = modelos || [];
    state.fontesOrdem = cat.fontes.map(f => f.fonte);
    carregado = true;
  }

  async function abrir() {
    try {
      await carregarBase_();
    } catch (e) {
      UI.toast('Não foi possível carregar o gerador de relatórios. ' + (e.message || ''), 'erro');
      return;
    }
    const corpo = `
      <div class="rel-wizard">
        <div class="rel-secao rel-modelos">
          <label>Modelos salvos (compartilhados)</label>
          <div class="rel-linha">
            <select id="relModeloSel" class="rel-input">${opcoesModelosHtml_()}</select>
            <button type="button" class="botao" id="btnRelCarregarModelo">Carregar</button>
            <button type="button" class="botao" id="btnRelExcluirModelo">Excluir</button>
          </div>
        </div>

        <div class="rel-secao">
          <label>1. Fonte de dados</label>
          <select id="relFonte" class="rel-input">${state.fontesOrdem.map(fk => `<option value="${fk}">${UI.escaparHtml(state.catalogo[fk].rotulo)}</option>`).join('')}</select>
        </div>

        <div class="rel-secao">
          <label>2. Período e filtros</label>
          <div id="relFiltros" class="rel-filtros"></div>
        </div>

        <div class="rel-secao">
          <label>3. Colunas <span class="rel-hint">(marque as que entram)</span></label>
          <div id="relColunas" class="rel-colunas"></div>
        </div>

        <div class="rel-secao">
          <label>4. Agrupar e totais</label>
          <div class="rel-linha">
            <select id="relAgrupar" class="rel-input">
              <option value="">Sem agrupamento</option>
              <option value="oss">Por OSS</option>
              <option value="unidade">Por Unidade</option>
              <option value="fonte">Por Fonte</option>
            </select>
            <label class="rotulo-checkbox"><input type="checkbox" id="relIncluirGrafico" /> Incluir gráfico (por grupo)</label>
          </div>
        </div>

        <div class="rel-secao">
          <label>5. Formato de saída</label>
          <div class="rel-formatos">
            <label class="rotulo-checkbox"><input type="radio" name="relFormato" value="tela" checked /> Visualizar na tela</label>
            <label class="rotulo-checkbox"><input type="radio" name="relFormato" value="pdf" /> PDF (impressão)</label>
            <label class="rotulo-checkbox"><input type="radio" name="relFormato" value="csv" /> Excel / CSV</label>
            <label class="rotulo-checkbox"><input type="radio" name="relFormato" value="sheets" /> Google Sheets</label>
          </div>
        </div>

        <div class="rel-secao rel-salvar">
          <label>Salvar este relatório como modelo</label>
          <div class="rel-linha">
            <input type="text" id="relNomeModelo" class="rel-input" placeholder="Nome do modelo" />
            <button type="button" class="botao" id="btnRelSalvarModelo">Salvar modelo</button>
          </div>
        </div>
      </div>`;

    const rodape = `<button class="botao" id="btnRelFechar">Fechar</button><button class="botao primario" id="btnRelGerar">Gerar relatório</button>`;
    UI.abrirModal('Gerar relatório', corpo, rodape, { grande: true });

    document.getElementById('relFonte').addEventListener('change', aoMudarFonte_);
    document.getElementById('btnRelGerar').addEventListener('click', () => gerarComConfig(lerConfigAtual_()));
    document.getElementById('btnRelFechar').addEventListener('click', UI.fecharModal);
    document.getElementById('btnRelSalvarModelo').addEventListener('click', salvarModelo_);
    document.getElementById('btnRelCarregarModelo').addEventListener('click', carregarModeloSelecionado_);
    document.getElementById('btnRelExcluirModelo').addEventListener('click', excluirModeloSelecionado_);

    aoMudarFonte_();
  }

  function opcoesModelosHtml_() {
    return '<option value="">— novo relatório —</option>' +
      state.modelos.map(m => `<option value="${UI.escaparHtml(m.id)}">${UI.escaparHtml(m.nome)}</option>`).join('');
  }

  /** Reconstrói filtros e colunas para a fonte escolhida. */
  function aoMudarFonte_() {
    const fonte = valId_('relFonte');
    montarFiltros_(fonte);
    montarColunas_(fonte);
  }

  function montarFiltros_(fonte) {
    const disp = FILTROS_POR_FONTE_[fonte] || [];
    let html = '';
    if (disp.indexOf('competencia') !== -1) {
      html += `<div class="campo"><label>Competência de</label><select id="relCompInicio" class="rel-input">${UI.opcoesCompetenciaHtml('', true)}</select></div>`;
      html += `<div class="campo"><label>até</label><select id="relCompFim" class="rel-input">${UI.opcoesCompetenciaHtml('', true)}</select></div>`;
    }
    if (disp.indexOf('oss') !== -1) html += filtroMultiploCampo_('OSS', 'relFiltroOss');
    if (disp.indexOf('unidade') !== -1) html += filtroMultiploCampo_('Unidade', 'relFiltroUnidade');
    if (disp.indexOf('fonte') !== -1) html += filtroMultiploCampo_('Fonte', 'relFiltroFonte');
    if (disp.indexOf('status') !== -1) html += filtroMultiploCampo_('Status', 'relFiltroStatus');
    document.getElementById('relFiltros').innerHTML = html;

    if (disp.indexOf('oss') !== -1) UI.criarFiltroMultiplo('relFiltroOss', state.opcoes.oss);
    if (disp.indexOf('unidade') !== -1) UI.criarFiltroMultiplo('relFiltroUnidade', state.opcoes.unidades);
    if (disp.indexOf('fonte') !== -1) UI.criarFiltroMultiplo('relFiltroFonte', OPCOES_FONTE_);
    if (disp.indexOf('status') !== -1) UI.criarFiltroMultiplo('relFiltroStatus', state.opcoes.status);
  }

  function filtroMultiploCampo_(rotulo, id) {
    return `<div class="campo"><label style="width:100%">${rotulo}</label><div id="${id}"></div></div>`;
  }

  function montarColunas_(fonte) {
    const cols = state.catalogo[fonte].colunas;
    document.getElementById('relColunas').innerHTML = cols.map(c =>
      `<label class="rotulo-checkbox rel-col-item"><input type="checkbox" id="relCol_${c.key}" value="${c.key}" checked /> ${UI.escaparHtml(c.rotulo)}</label>`
    ).join('');
  }

  function valId_(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  function lerConfigAtual_() {
    const fonte = valId_('relFonte');
    const cols = state.catalogo[fonte].colunas.map(c => c.key)
      .filter(k => { const el = document.getElementById('relCol_' + k); return el && el.checked; });
    const disp = FILTROS_POR_FONTE_[fonte] || [];
    const filtros = {};
    if (disp.indexOf('competencia') !== -1) {
      filtros.competenciaInicio = valId_('relCompInicio') || undefined;
      filtros.competenciaFim = valId_('relCompFim') || undefined;
    }
    if (disp.indexOf('oss') !== -1) filtros.oss = UI.valoresFiltroMultiplo('relFiltroOss');
    if (disp.indexOf('unidade') !== -1) filtros.unidade_id = UI.valoresFiltroMultiplo('relFiltroUnidade');
    if (disp.indexOf('fonte') !== -1) filtros.fonte = UI.valoresFiltroMultiplo('relFiltroFonte');
    if (disp.indexOf('status') !== -1) filtros.status = UI.valoresFiltroMultiplo('relFiltroStatus');
    const radioFmt = document.querySelector('input[name=relFormato]:checked');
    return {
      fonte, filtros, colunas: cols,
      agruparPor: valId_('relAgrupar'),
      incluirGrafico: document.getElementById('relIncluirGrafico').checked,
      formato: radioFmt ? radioFmt.value : 'tela'
    };
  }

  function aplicarConfig_(config) {
    if (!config || !config.fonte || !state.catalogo[config.fonte]) return;
    document.getElementById('relFonte').value = config.fonte;
    aoMudarFonte_();
    state.catalogo[config.fonte].colunas.forEach(c => {
      const el = document.getElementById('relCol_' + c.key);
      if (el) el.checked = !config.colunas || config.colunas.indexOf(c.key) !== -1;
    });
    const f = config.filtros || {};
    if (document.getElementById('relCompInicio')) document.getElementById('relCompInicio').value = f.competenciaInicio || '';
    if (document.getElementById('relCompFim')) document.getElementById('relCompFim').value = f.competenciaFim || '';
    if (f.oss) UI.definirValoresFiltroMultiplo('relFiltroOss', f.oss);
    if (f.unidade_id) UI.definirValoresFiltroMultiplo('relFiltroUnidade', f.unidade_id);
    if (f.fonte) UI.definirValoresFiltroMultiplo('relFiltroFonte', f.fonte);
    if (f.status) UI.definirValoresFiltroMultiplo('relFiltroStatus', f.status);
    document.getElementById('relAgrupar').value = config.agruparPor || '';
    document.getElementById('relIncluirGrafico').checked = !!config.incluirGrafico;
    const fmt = document.querySelector('input[name=relFormato][value="' + (config.formato || 'tela') + '"]');
    if (fmt) fmt.checked = true;
  }

  // ----- geração -----
  /**
   * Gera a partir de uma config pronta, em vez de ler o assistente do DOM -
   * o que permite outras telas reaproveitarem as 4 saídas (tela/PDF/CSV/
   * Sheets) sem duplicar nada. É o que a tela de Unidades usa no botão
   * "Gerar Relatório" (sessão 2026-07-29), mandando os filtros que já estão
   * aplicados na tela. config: { fonte, filtros, colunas, agruparPor,
   * incluirGrafico, formato }. Devolve true só quando gerou de fato - quem
   * chama de um modal próprio usa isso pra não fechar (e perder a seleção do
   * usuário) quando deu erro.
   */
  async function gerarComConfig(config) {
    if (!config.colunas.length) { UI.toast('Selecione ao menos uma coluna.', 'erro'); return false; }
    try {
      if (config.formato === 'sheets') {
        const resp = await Api.chamar('gerarRelatorioSheets', paramsBackend_(config));
        window.open(resp.url, '_blank');
        UI.toast('Planilha gerada no Google Sheets.', 'sucesso');
        return true;
      }
      const dados = await Api.chamar('gerarRelatorio', paramsBackend_(config));
      if (config.formato === 'csv') { baixarCsv_(dados, config); return true; }
      abrirJanelaImpressao_(relatorioParaHtml_(dados, config), config.formato === 'pdf');
      return true;
    } catch (e) {
      UI.toast('Falha ao gerar relatório. ' + (e.message || ''), 'erro');
      return false;
    }
  }

  function paramsBackend_(config) {
    return { fonte: config.fonte, filtros: config.filtros, colunas: config.colunas, agruparPor: config.agruparPor };
  }

  // ----- modelos -----
  async function salvarModelo_() {
    const nome = (document.getElementById('relNomeModelo').value || '').trim();
    if (!nome) { UI.toast('Informe um nome para o modelo.', 'erro'); return; }
    try {
      await Api.chamar('salvarModeloRelatorio', { data: { nome, config: lerConfigAtual_() } });
      state.modelos = await Api.chamar('listarModelosRelatorio');
      document.getElementById('relModeloSel').innerHTML = opcoesModelosHtml_();
      document.getElementById('relNomeModelo').value = '';
      UI.toast('Modelo salvo.', 'sucesso');
    } catch (e) { UI.toast('Falha ao salvar modelo. ' + (e.message || ''), 'erro'); }
  }

  function carregarModeloSelecionado_() {
    const id = valId_('relModeloSel');
    const m = state.modelos.filter(x => String(x.id) === String(id))[0];
    if (!m) { UI.toast('Selecione um modelo.', 'erro'); return; }
    aplicarConfig_(m.config);
    UI.toast('Modelo "' + m.nome + '" carregado.', 'sucesso');
  }

  async function excluirModeloSelecionado_() {
    const id = valId_('relModeloSel');
    if (!id) { UI.toast('Selecione um modelo.', 'erro'); return; }
    if (!confirm('Excluir este modelo de relatório?')) return;
    try {
      await Api.chamar('excluirModeloRelatorio', { id });
      state.modelos = await Api.chamar('listarModelosRelatorio');
      document.getElementById('relModeloSel').innerHTML = opcoesModelosHtml_();
      UI.toast('Modelo excluído.', 'sucesso');
    } catch (e) { UI.toast('Falha ao excluir. ' + (e.message || ''), 'erro'); }
  }

  // ----- saída CSV -----
  function baixarCsv_(dados, config) {
    const sep = ';';
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const linhaCsv = arr => arr.join(sep);
    const cab = linhaCsv(dados.colunas.map(c => esc(c.rotulo)));
    const corpo = dados.linhas.map(r => linhaCsv(dados.colunas.map(c =>
      c.tipo === 'moeda' ? esc(Number(r[c.key] || 0).toFixed(2).replace('.', ',')) : esc(r[c.key])
    )));
    const csv = '﻿' + [cab].concat(corpo).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'relatorio_' + config.fonte + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ----- saída Visualizar/PDF (janela de impressão) -----
  function periodoTexto_(config) {
    const f = config.filtros || {};
    if (f.competenciaInicio && f.competenciaFim) return f.competenciaInicio + ' a ' + f.competenciaFim;
    if (f.competenciaInicio) return 'a partir de ' + f.competenciaInicio;
    if (f.competenciaFim) return 'até ' + f.competenciaFim;
    return '';
  }

  function relatorioParaHtml_(dados, config) {
    const cols = dados.colunas;
    const moedaCols = cols.filter(c => c.tipo === 'moeda');
    const cel = (v, tipo) => tipo === 'moeda' ? UI.formatarMoeda(Number(v || 0)) : (v == null ? '' : UI.escaparHtml(String(v)));
    const periodo = periodoTexto_(config);

    let html = `<div class="rel-doc">
      <h1>Relatório · ${UI.escaparHtml(dados.fonte_rotulo)}</h1>
      <p class="rel-meta">${periodo ? 'Período: ' + UI.escaparHtml(periodo) + ' · ' : ''}Emitido em ${UI.escaparHtml(UI.formatarData(dados.emitido_em) || '')} · ${dados.total_linhas} registro(s)</p>`;

    if (config.incluirGrafico && dados.agruparPor && moedaCols.length) {
      html += graficoRelatorioHtml_(dados, moedaCols[0]);
    }

    const thead = `<thead><tr>${cols.map(c => `<th class="${c.tipo === 'moeda' ? 'rel-num' : ''}">${UI.escaparHtml(c.rotulo)}</th>`).join('')}</tr></thead>`;
    let tbody = '';
    const totGeral = {};

    if (dados.agruparPor) {
      const grupos = {};
      dados.linhas.forEach(r => { (grupos[r.__grupo] = grupos[r.__grupo] || []).push(r); });
      Object.keys(grupos).sort().forEach(g => {
        tbody += `<tr class="rel-grupo"><td colspan="${cols.length}">${UI.escaparHtml(g)}</td></tr>`;
        const sub = {};
        grupos[g].forEach(r => {
          tbody += `<tr>${cols.map(c => `<td class="${c.tipo === 'moeda' ? 'rel-num' : ''}">${cel(r[c.key], c.tipo)}</td>`).join('')}</tr>`;
          moedaCols.forEach(c => { sub[c.key] = (sub[c.key] || 0) + Number(r[c.key] || 0); totGeral[c.key] = (totGeral[c.key] || 0) + Number(r[c.key] || 0); });
        });
        tbody += linhaTotaisHtml_('Subtotal ' + g, cols, sub, 'rel-subtotal');
      });
    } else {
      dados.linhas.forEach(r => {
        tbody += `<tr>${cols.map(c => `<td class="${c.tipo === 'moeda' ? 'rel-num' : ''}">${cel(r[c.key], c.tipo)}</td>`).join('')}</tr>`;
        moedaCols.forEach(c => { totGeral[c.key] = (totGeral[c.key] || 0) + Number(r[c.key] || 0); });
      });
    }

    const tfoot = moedaCols.length ? linhaTotaisHtml_('TOTAL GERAL', cols, totGeral, 'rel-total') : '';
    html += `<table class="rel-tabela">${thead}<tbody>${tbody}</tbody><tfoot>${tfoot}</tfoot></table>`;
    if (!dados.linhas.length) html += '<p class="rel-vazio">Nenhum registro para os filtros escolhidos.</p>';
    html += `</div>`;
    return html;
  }

  function linhaTotaisHtml_(rotulo, cols, totais, classe) {
    return `<tr class="${classe}">${cols.map((c, i) =>
      i === 0 ? `<td>${UI.escaparHtml(rotulo)}</td>`
        : `<td class="${c.tipo === 'moeda' ? 'rel-num' : ''}">${c.tipo === 'moeda' ? UI.formatarMoeda(totais[c.key] || 0) : ''}</td>`
    ).join('')}</tr>`;
  }

  function graficoRelatorioHtml_(dados, moedaCol) {
    const grupos = {};
    dados.linhas.forEach(r => { grupos[r.__grupo] = (grupos[r.__grupo] || 0) + Number(r[moedaCol.key] || 0); });
    const arr = Object.keys(grupos).map(k => ({ label: k, valor: grupos[k] })).sort((a, b) => b.valor - a.valor);
    const max = Math.max.apply(null, arr.map(a => a.valor)) || 1;
    const linhas = arr.map(a => `
      <div class="rel-bar-linha">
        <div class="rel-bar-rot">${UI.escaparHtml(a.label)}</div>
        <div class="rel-bar-trilho"><div class="rel-bar-fill" style="width:${(max > 0 ? a.valor / max * 100 : 0).toFixed(1)}%"></div></div>
        <div class="rel-bar-val">${UI.formatarMoeda(a.valor)}</div>
      </div>`).join('');
    return `<div class="rel-grafico"><h2>${UI.escaparHtml(moedaCol.rotulo)} por ${UI.escaparHtml(ROTULO_DIMENSAO_[dados.agruparPor] || dados.agruparPor)}</h2>${linhas}</div>`;
  }

  function abrirJanelaImpressao_(htmlRelatorio, autoImprimir) {
    const win = window.open('', '_blank');
    if (!win) { UI.toast('Permita pop-ups para gerar/visualizar o relatório.', 'erro'); return; }
    const script = autoImprimir ? '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},250);};</scr' + 'ipt>' : '';
    win.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório GAOCG</title><style>' + CSS_IMPRESSAO_ + '</style></head><body>' + htmlRelatorio + script + '</body></html>');
    win.document.close();
  }

  const CSS_IMPRESSAO_ = `
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; margin: 24px; }
    .rel-doc h1 { font-size: 18px; margin: 0 0 4px; color: #1e3a8a; }
    .rel-meta { font-size: 12px; color: #64748b; margin: 0 0 16px; }
    .rel-grafico { margin: 0 0 20px; }
    .rel-grafico h2 { font-size: 13px; margin: 0 0 8px; color: #334155; }
    .rel-bar-linha { display: grid; grid-template-columns: 180px 1fr 120px; align-items: center; gap: 10px; margin-bottom: 6px; }
    .rel-bar-rot { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rel-bar-trilho { background: #eef2f7; border-radius: 5px; height: 16px; overflow: hidden; }
    .rel-bar-fill { height: 100%; background: #2a78d6; border-radius: 5px; }
    .rel-bar-val { font-size: 12px; text-align: right; }
    table.rel-tabela { width: 100%; border-collapse: collapse; font-size: 12px; }
    .rel-tabela th, .rel-tabela td { border: 1px solid #d7dbe2; padding: 5px 8px; text-align: left; }
    .rel-tabela thead th { background: #1e3a8a; color: #fff; }
    .rel-num { text-align: right; font-variant-numeric: tabular-nums; }
    .rel-grupo td { background: #eef2f7; font-weight: 700; }
    .rel-subtotal td { background: #f7f9fc; font-weight: 600; }
    .rel-total td { background: #dbeafe; font-weight: 700; }
    .rel-vazio { color: #64748b; font-size: 13px; }
    @media print { body { margin: 0; } .rel-tabela thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;

  return { abrir, gerarComConfig };
})();
