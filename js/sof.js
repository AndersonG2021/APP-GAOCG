/**
 * GAOCG App - Gestão de Processos de SOF (Funcionalidade 3, Anexo I) + Notas de
 * Empenho acopladas (Funcionalidade 5).
 */

const TelaSof = (function () {
  const OPCOES_FONTE = ['TESOURO', 'SUS', 'Outra'];
  const ETAPAS_ANDAMENTO = [
    'SES-NP_DGPO', 'SES-DGPO', 'SES', 'NAP_POAS', 'SES-GPOAS', 'SES-GORC', 'SES-GPF',
    'SES-CEO_GAOCG', 'SES-DGMCG', 'SES-GEMP', 'NE EMITIDA', 'SES-CJCG', 'C.G./T.A. FORMALIZADO'
  ];
  const CAMPOS_OBRIGATORIOS = [
    { id: 'sofOss', rotulo: 'OSS' },
    { id: 'sofCnpj', rotulo: 'CNPJ' },
    { id: 'sofContrato', rotulo: 'Contrato de Gestão' },
    { id: 'sofAcao', rotulo: 'Ação' },
    { id: 'sofSubacao', rotulo: 'Subação' },
    { id: 'sofGd', rotulo: 'G.D.' },
    { id: 'sofSei', rotulo: 'Número do Processo' },
    { id: 'sofNumero', rotulo: 'Nº SOF' },
    { id: 'sofPeriodoInicio', rotulo: 'Período (início)' },
    { id: 'sofPeriodoFim', rotulo: 'Período (fim)' },
    { id: 'sofDea', rotulo: 'DEA' },
    { id: 'sofObjeto', rotulo: 'Objeto' }
  ];
  let unidades = [];
  let itens = [];
  let paginaAtual = 1;
  let totalRegistros = 0;
  const TAMANHO_PAGINA = 20;
  let sofEmEdicaoId = null;
  let abrindoLinha = false;
  let linhasFontes = [];
  let ultimoFiltroJson = null;

  async function render() {
    const [unidadesCarregadas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    unidades = unidadesCarregadas.items;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">SOF</h2>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="sofBusca" placeholder="unidade, SEI, valor..." /></div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="sofFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="sofFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="sofFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo de unidade</label>
            <div id="sofFiltroTipoUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroTipoUnidade" title="Limpar filtro de Tipo de unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">DEA</label>
            <div id="sofFiltroDea"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroDea" title="Limpar filtro de DEA">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Fonte</label>
            <div id="sofFiltroFonte"></div><button type="button" class="filtro-multiplo-x" data-alvo="sofFiltroFonte" title="Limpar filtro de Fonte">&times;</button>
          </div>
          <button class="botao" id="btnFiltrarSof">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosSof">Limpar filtros</button>
          <button class="botao" id="btnExportarSof">Exportar CSV</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoSof">+ Nova SOF</button>
        </div>
        <div id="listaSof"></div>
        <div class="paginacao" id="paginacaoSof"></div>
      </div>`;

    document.getElementById('btnFiltrarSof').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('sofBusca').addEventListener('keydown', e => {
      if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    });
    document.getElementById('btnNovoSof').addEventListener('click', async function () {
      this.disabled = true;
      try { await abrirFormulario(); } finally { this.disabled = false; }
    });
    document.getElementById('btnExportarSof').addEventListener('click', exportarCsv);
    UI.criarFiltroMultiplo('sofFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('sofFiltroOss', opcoesOss.map(o => o.valor));
    UI.criarFiltroMultiplo('sofFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.criarFiltroMultiplo('sofFiltroTipoUnidade', tiposUnidade);
    UI.criarFiltroMultiplo('sofFiltroDea', ['SIM', 'NÃO']);
    UI.criarFiltroMultiplo('sofFiltroFonte', OPCOES_FONTE);
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosSof', () => {
      document.getElementById('sofBusca').value = '';
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    });
    await carregar();
  }

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('sofBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('sofFiltroUnidade'),
      oss: UI.valoresFiltroMultiplo('sofFiltroOss'),
      objeto: UI.valoresFiltroMultiplo('sofFiltroObjeto'),
      tipo_unidade: UI.valoresFiltroMultiplo('sofFiltroTipoUnidade'),
      dea: UI.valoresFiltroMultiplo('sofFiltroDea'),
      fonte: UI.valoresFiltroMultiplo('sofFiltroFonte')
    };
  }

  async function carregar() {
    const filtros = filtrosAtuais();
    ultimoFiltroJson = JSON.stringify(filtros);
    const resposta = await Api.chamar('listarSof', Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtros));
    itens = resposta.items;
    totalRegistros = resposta.total;
    renderCards();
    renderPaginacao();
  }

  function percentualAndamento(sof) {
    const idx = sof && sof.andamento ? ETAPAS_ANDAMENTO.indexOf(sof.andamento) : -1;
    if (idx < 0) return 0;
    return Math.round(((idx + 1) / ETAPAS_ANDAMENTO.length) * 100);
  }

  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  function cartaoSofHtml(s) {
    const unidade = unidades.find(u => u.id === s.unidade_id);
    const pct = percentualAndamento(s);
    const fontesTexto = (s.fontes || []).map(f => f.fonte).filter(Boolean).join(', ');
    return `
      <div class="cartao-sof ${s.destacar_parado ? 'parado' : ''}" data-id="${s.id}">
        <div class="cartao-sof-topo">
          <div class="cartao-sof-topo-acoes">
            ${s.destacar_parado ? `<span class="selo amarelo">${s.dias_parado} dia(s) parado</span>` : ''}
            <button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button>
          </div>
        </div>
        <h3 class="cartao-sof-titulo">${UI.escaparHtml(s.sof_numero || '-')}</h3>
        <p class="cartao-sof-subtitulo">${UI.escaparHtml(unidade ? unidade.nome : s.unidade_id)}</p>
        <div class="cartao-sof-infogrid">
          <div class="cartao-sof-infogrid-item"><span>Número do Processo</span><strong>${UI.escaparHtml(s.sei || '-')}</strong></div>
          <div class="cartao-sof-infogrid-item"><span>Objeto</span><strong>${UI.escaparHtml(s.objeto || '-')}</strong></div>
          <div class="cartao-sof-infogrid-item"><span>Fonte</span><strong>${UI.escaparHtml(fontesTexto || '-')}</strong></div>
          <div class="cartao-sof-infogrid-item"><span>Total Solicitado</span><strong>${UI.formatarMoeda(s.total_solicitado)}</strong></div>
        </div>
        <div class="cartao-sof-andamento">
          <div class="cartao-sof-andamento-topo">
            <span>Andamento <strong>${UI.escaparHtml(s.andamento || '-')}</strong></span>
            <span>${pct}%</span>
          </div>
          <div class="barra-progresso"><div class="barra-progresso-preenchimento ${pct >= 100 ? 'completo' : ''}" style="width:${pct}%"></div></div>
          ${stepperHtml(s)}
        </div>
        <div class="cartao-sof-rodape">
          ${s.possui_ne ? '<span class="selo verde">NE Emitida</span>' : '<span class="selo amarelo">Aguardando NE</span>'}
          <button type="button" class="botao primario" data-acao="abrir">Abrir processo &rarr;</button>
        </div>
      </div>`;
  }

  function ligarEventosCartaoSof_(cartaoEl, sof) {
    cartaoEl.querySelector('.botao-icone.excluir').addEventListener('click', () => excluirSofClique(sof));
    cartaoEl.querySelector('[data-acao="abrir"]').addEventListener('click', () => abrirSofExistente(sof.id));
    cartaoEl.querySelectorAll('.stepper-marcador').forEach(btn => {
      btn.addEventListener('click', () => avancarEtapaCartao(sof, btn.dataset.etapa, cartaoEl));
    });
  }

  function renderCards() {
    const alvo = document.getElementById('listaSof');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum processo de SOF encontrado.</p>'; return; }
    alvo.innerHTML = `<div class="grade-cards-sof">${itens.map(cartaoSofHtml).join('')}</div>`;
    alvo.querySelectorAll('.cartao-sof').forEach(cartao => {
      const sof = itens.find(i => i.id === cartao.dataset.id);
      if (sof) ligarEventosCartaoSof_(cartao, sof);
    });
  }

  /** Reconstrói só um card (depois de avançar uma etapa do stepper direto na lista), sem recarregar a página inteira. */
  function rerenderCartaoSof_(sof) {
    const atual = document.querySelector(`.cartao-sof[data-id="${sof.id}"]`);
    if (!atual) return;
    atual.outerHTML = cartaoSofHtml(sof);
    const novo = document.querySelector(`.cartao-sof[data-id="${sof.id}"]`);
    if (novo) ligarEventosCartaoSof_(novo, sof);
  }

  /**
   * Avança/retrocede o andamento direto no card, sem precisar abrir o modal
   * de edição - o stepper de 13 etapas fica à mostra e editável na lista.
   */
  async function avancarEtapaCartao(sof, etapa, cartaoEl) {
    if (etapa === 'NE EMITIDA' && !sof.possui_ne) {
      UI.toast('Anexe a Nota de Empenho no processo (botão "Abrir processo") para avançar esta etapa.', 'erro');
      return;
    }
    try {
      await Api.chamar('atualizarSof', { id: sof.id, data: { andamento: etapa } });
      sof.andamento = etapa;
      sof.dias_parado = 0;
      sof.destacar_parado = false;
      rerenderCartaoSof_(sof);
      UI.toast('Andamento atualizado.', 'sucesso');
    } catch (err) {
      UI.toast(err.message, 'erro');
    }
  }

  async function excluirSofClique(sof) {
    if (!sof) return;
    if (!confirm('Excluir este processo de SOF? A exclusão pode ser revertida apenas por um administrador diretamente na planilha.')) return;
    try {
      await Api.chamar('excluirSof', { id: sof.id });
      UI.toast('SOF excluído.', 'sucesso');
      await carregar();
    } catch (err) {
      UI.toast(err.message, 'erro');
    }
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / TAMANHO_PAGINA));
    document.getElementById('paginacaoSof').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="botoes">
        <button class="botao" id="sofPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="sofPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('sofPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('sofPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
  }

  async function exportarCsv() {
    const resposta = await Api.chamar('listarSof', Object.assign({ page: 1, pageSize: 100000 }, filtrosAtuais()));
    const colunas = ['id', 'unidade_id', 'sei', 'sof_numero', 'periodo_inicio', 'periodo_fim', 'andamento', 'objeto', 'total_solicitado', 'possui_ne'];
    const linhas = [colunas.concat('fontes').join(';')].concat(resposta.items.map(s => {
      const valores = colunas.map(c => `"${String(s[c] === undefined ? '' : s[c]).replace(/"/g, '""')}"`);
      const fontesTexto = (s.fontes || []).map(f => `${f.fonte}:${Number(f.total_solicitado || 0).toFixed(2)}`).join(';');
      valores.push(`"${fontesTexto.replace(/"/g, '""')}"`);
      return valores.join(';');
    }));
    baixarArquivo('sof.csv', linhas.join('\n'));
  }

  function baixarArquivo(nome, conteudo, mimeType) {
    const blob = new Blob(['﻿' + conteudo], { type: mimeType || 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
  }

  /** Abre HTML gerado em nova aba (Blob + URL de objeto) - revoga a URL depois de um tempo, não na hora, senão a aba nem termina de carregar o conteúdo antes dela sumir. */
  function abrirDocumentoEmNovaAba_(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function abrirSofExistente(id) {
    if (abrindoLinha) return;
    abrindoLinha = true;
    marcarCartaoCarregando(id, true);
    try {
      // O card já tem tudo que obterSof devolveria (fontes, total, destaque de
      // "parado" - listarSof calcula os 3 pra montar o próprio card), então
      // reaproveita "itens" em vez de pedir de novo ao backend - mesmo padrão
      // já usado em abrirReciboExistente (js/recibos.js).
      const sof = itens.find(s => s.id === id);
      if (!sof) return;
      // Abre o formulário na hora, com dado local (zero espera de rede), e
      // checa conflito de edição simultânea em paralelo - ver
      // EdicaoSimultanea/PROGRESS.md (seção de Performance).
      const edicaoPromise = EdicaoSimultanea.iniciarEdicao('SOF', id);
      Api.chamar('marcarSofVisualizado', { id }, { silencioso: true }).catch(() => {});
      // silencioso: a seção de Notas de Empenho pode aparecer um instante
      // depois do resto do formulário, sem travar a tela toda com o spinner
      // global enquanto isso.
      const notasPromise = Api.chamar('listarNotasEmpenhoPorSof', { sofId: id }, { silencioso: true }).catch(() => []);
      await abrirFormulario(sof, notasPromise);
      EdicaoSimultanea.tratarConflito(edicaoPromise, 'SOF', id);
    } finally {
      abrindoLinha = false;
      marcarCartaoCarregando(id, false);
    }
  }

  /** Feedback visual imediato no clique (o card fica "carregando" enquanto as chamadas de rede resolvem). */
  function marcarCartaoCarregando(id, carregando) {
    const cartao = document.querySelector(`.cartao-sof[data-id="${id}"]`);
    if (cartao) cartao.classList.toggle('carregando', carregando);
  }

  function camposAutopreenchimento(unidade, sof) {
    const mapa = {
      oss_snapshot: 'oss', cnpj_snapshot: 'cnpj', contrato_snapshot: 'contrato_gestao',
      classificacao_orcamentaria_snapshot: 'classificacao_orcamentaria', acao_snapshot: 'acao',
      subacao_snapshot: 'subacao', gd_snapshot: 'gd'
    };
    const resultado = {};
    Object.keys(mapa).forEach(campoSnapshot => {
      resultado[campoSnapshot] = sof ? (sof[campoSnapshot] || '') : (unidade ? unidade[mapa[campoSnapshot]] || '' : '');
    });
    return resultado;
  }

  /**
   * Formulário único de SOF - fundiu o antigo "+ Nova SOF" (simples) com o
   * que era o modal separado "Criar SOF - SEI" (só disponível editando).
   * Pedido do usuário: o formulário do documento SEI passou a ser o próprio
   * formulário de criação, não um passo extra depois. Ver PROGRESS.md.
   */
  async function abrirFormulario(sof, notasPromise) {
    const editando = !!sof;
    sofEmEdicaoId = editando ? sof.id : null;
    linhasFontes = (sof && sof.fontes && sof.fontes.length)
      ? sof.fontes.map(f => ({ fonte: f.fonte, codigo_poas: f.codigo_poas, parcela_mensal: f.parcela_mensal, cronograma: f.cronograma || [] }))
      : [{ fonte: '', codigo_poas: '', parcela_mensal: '', cronograma: [] }];
    linhasManutencaoSei_ = parseManutencaoSei_(sof ? sof.sei_manutencao_linhas : null);
    const unidadeAtual = sof ? unidades.find(u => u.id === sof.unidade_id) : null;
    const snapshot = camposAutopreenchimento(unidadeAtual, sof);
    const opcoesObjeto = await TelaListas.obterOpcoes('OBJETO');
    const opcoesOss = await TelaListas.obterOpcoes('OSS');

    const opt = (valorAtual, valor) => `<option value="${UI.escaparHtml(valor)}" ${valorAtual === valor ? 'selected' : ''}>${UI.escaparHtml(valor)}</option>`;
    const selectSimNao = (id, valorAtual) => `<select id="${id}"><option value="">-</option><option ${valorAtual === 'SIM' ? 'selected' : ''}>SIM</option><option ${valorAtual === 'NÃO' ? 'selected' : ''}>NÃO</option></select>`;
    const v = campo => UI.escaparHtml(sof ? sof[campo] || '' : '');

    const corpo = `
      <form id="formSof">
        <div class="campo"><label>Unidade *</label>
          <select id="sofUnidade" required ${editando ? 'disabled' : ''}>
            <option value="">Selecione...</option>
            ${unidades.map(u => `<option value="${u.id}" ${sof && sof.unidade_id === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('')}
          </select>
        </div>
        ${sof && sof.divergente_da_unidade ? '<p class="aviso-divergencia">⚠ Um ou mais campos abaixo divergem do cadastro atual da unidade.</p>' : ''}

        <h4 class="sei-secao-titulo">Dados do cadastro</h4>
        <div class="grade-3">
          <div class="campo"><label>CNPJ</label><input id="sofCnpj" value="${UI.escaparHtml(snapshot.cnpj_snapshot)}" /></div>
          <div class="campo"><label>Contrato de Gestão</label><input id="sofContrato" value="${UI.escaparHtml(snapshot.contrato_snapshot)}" /></div>
          <div class="campo"><label>Ação</label><input id="sofAcao" value="${UI.escaparHtml(snapshot.acao_snapshot)}" /></div>
          <div class="campo"><label>Subação</label><input id="sofSubacao" value="${UI.escaparHtml(snapshot.subacao_snapshot)}" /></div>
          <div class="campo"><label>G.D.</label><input id="sofGd" value="${UI.escaparHtml(snapshot.gd_snapshot)}" /></div>
          <div class="campo"><label>T.A.</label><input id="sofTa" value="${v('ta')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Identificação do processo</h4>
        <div class="grade-3">
          <div class="campo"><label>Número do Processo *</label><input id="sofSei" value="${v('sei')}" placeholder="0000000000.000000/0000-00" /></div>
          <div class="campo"><label>Nº SOF *</label><input id="sofNumero" value="${v('sof_numero')}" placeholder="000/0000" /></div>
          <div class="campo"><label>DEA *</label>
            <select id="sofDea">
              <option value="">-</option>
              <option ${sof && sof.dea === 'SIM' ? 'selected' : ''}>SIM</option>
              <option ${sof && sof.dea === 'NÃO' ? 'selected' : ''}>NÃO</option>
            </select>
          </div>
          <div class="campo"><label>Período - início *</label><input type="date" id="sofPeriodoInicio" value="${v('periodo_inicio')}" /></div>
          <div class="campo"><label>Período - fim *</label><input type="date" id="sofPeriodoFim" value="${v('periodo_fim')}" /></div>
        </div>
        <div class="grade-3">
          <div class="campo"><label>Número do documento (SEI)</label><input id="seiNumeroDocumento" value="${v('sei_numero_documento')}" placeholder="Ex.: 419/2026" /></div>
          <div class="campo"><label>Data</label><input type="date" id="seiData" value="${sof && sof.sei_data ? sof.sei_data : hojeIso_()}" /></div>
          <div class="campo"><label>Solicito</label><select id="seiTipoSolicitacao"><option value="">Selecione...</option>${OPCOES_SEI_SOLICITACAO.map(o => opt(sof ? sof.sei_tipo_solicitacao : '', o)).join('')}</select></div>
        </div>
        <div class="grade-3">
          <div class="campo"><label>Previsto no PCA?</label>${selectSimNao('seiPrevistoPca', sof ? sof.sei_previsto_pca : '')}</div>
          <div class="campo"><label>Nº do PCA</label><input id="seiNumeroPca" value="${v('sei_numero_pca')}" /></div>
          <div class="campo"><label>Nº do DFD</label><input id="seiNumeroDfd" value="${v('sei_numero_dfd')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Pleito</h4>
        <div class="campo"><label>Assinalar o pleito</label><select id="seiTipoPleito"><option value="">Selecione...</option>${OPCOES_SEI_PLEITO.map(o => opt(sof ? sof.sei_tipo_pleito : '', o)).join('')}</select></div>
        <div class="campo"><label>Justificativa do pleito para a CPF/SAD</label><textarea id="seiJustificativaPleito" rows="3">${v('sei_justificativa_pleito')}</textarea></div>

        <h4 class="sei-secao-titulo">Contexto</h4>
        <div class="grade-2">
          <div class="campo"><label>Área/setor solicitante</label><input id="seiAreaSetorSolicitante" value="${v('sei_area_setor_solicitante')}" /></div>
          <div class="campo"><label>Tema POAS</label><input id="seiTemaPoas" value="${v('sei_tema_poas')}" /></div>
        </div>
        <div class="campo"><label>Objeto (lista) *</label>
          <select id="sofObjeto">
            <option value="">Selecione...</option>
            ${opcoesObjeto.map(o => `<option ${sof && sof.objeto === o.valor ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('')}
          </select>
        </div>
        <div class="campo"><label>Objeto da despesa (texto completo p/ documento SEI)</label><textarea id="seiObjetoDespesa" rows="6" placeholder="Parágrafo completo, com despachos/notas técnicas/valores, igual ao que vai constar no documento.">${v('sei_objeto_despesa')}</textarea></div>

        <h4 class="sei-secao-titulo">Destinação e classificação</h4>
        <div class="grade-3">
          <div class="campo"><label>OSS</label>${selectOssHtml_(opcoesOss, snapshot.oss_snapshot)}</div>
          <div class="campo"><label>Destinação (Hospital, Geres etc.)</label><input id="seiDestinacao" value="${UI.escaparHtml((sof && sof.sei_destinacao) || (unidadeAtual ? unidadeAtual.tipo : '') || '')}" /></div>
          <div class="campo"><label>Credor</label><input id="seiCredor" value="${UI.escaparHtml((sof && sof.sei_credor) || (unidadeAtual ? unidadeAtual.nome : '') || '')}" /></div>
          <div class="campo"><label>CPF/CNPJ</label><input id="seiCredorCnpj" value="${UI.escaparHtml((sof && sof.sei_credor_cnpj) || snapshot.cnpj_snapshot || '')}" /></div>
          <div class="campo"><label>Ação (documento)</label><input id="seiAcao" value="${UI.escaparHtml((sof && sof.sei_acao) || snapshot.acao_snapshot || '')}" /></div>
          <div class="campo"><label>Subação (documento)</label><input id="seiSubacao" value="${UI.escaparHtml((sof && sof.sei_subacao) || snapshot.subacao_snapshot || '')}" /></div>
          <div class="campo"><label>Grupo de despesa</label><input id="seiGrupoDespesa" value="${v('sei_grupo_despesa')}" placeholder="Ex.: 3.3.50" /></div>
        </div>

        <div class="campo">
          <label>Fontes de recurso e cronograma de desembolso *</label>
          <div id="sofFontesContainer" class="linhas-fonte"></div>
          <div class="linhas-fonte-rodape">
            <button type="button" class="botao" id="btnAdicionarFonte">+ Adicionar fonte</button>
            <span class="linhas-fonte-total">Total geral: <strong id="sofFontesTotalGeral">R$ 0,00</strong></span>
          </div>
          <p class="ajuda">Preencha só os meses que se aplicam - pagamento único usa 1 mês, pagamento recorrente usa vários.</p>
        </div>

        <h4 class="sei-secao-titulo">Medida compensatória POAS</h4>
        <div class="campo"><textarea id="seiMedidaCompensatoriaPoas" rows="2">${v('sei_medida_compensatoria_poas')}</textarea></div>

        <h4 class="sei-secao-titulo">Manutenção de Geres, Hospitais Regionais e Suprimento Individual</h4>
        <div id="seiManutencaoContainer" class="linhas-fonte"></div>
        <button type="button" class="botao" id="btnAdicionarLinhaManutencaoSei">+ Adicionar linha</button>

        <h4 class="sei-secao-titulo">Despesas SUS/Portaria ou Convênio/Recursos Próprios</h4>
        <div class="grade-2">
          <div class="campo"><label>Nº do Convênio ou Portaria</label><input id="seiConvenioNumero" value="${v('sei_convenio_numero')}" /></div>
          <div class="campo"><label>Nº do E-fisco</label><input id="seiConvenioEfisco" value="${v('sei_convenio_efisco')}" /></div>
          <div class="campo"><label>Nº da Conta</label><input id="seiConvenioConta" value="${v('sei_convenio_conta')}" /></div>
          <div class="campo"><label>Banco</label><input id="seiConvenioBanco" value="${v('sei_convenio_banco')}" /></div>
          <div class="campo"><label>Contrapartida do Convênio Nº</label><input id="seiContrapartidaConvenio" value="${v('sei_contrapartida_convenio')}" /></div>
          <div class="campo"><label>Nº da Conta (contrapartida)</label><input id="seiContrapartidaConta" value="${v('sei_contrapartida_conta')}" /></div>
          <div class="campo"><label>Banco (contrapartida)</label><input id="seiContrapartidaBanco" value="${v('sei_contrapartida_banco')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Licitações</h4>
        <div class="grade-2">
          <div class="campo"><label>Número do Contrato</label><input id="sofNumeroContrato" value="${v('contrato')}" /></div>
          <div class="campo"><label>CEO E-fisco</label><input id="sofCeo" value="${v('ceo')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Solicitante</h4>
        <div class="grade-3">
          <div class="campo"><label>Nome</label><input id="seiSolicitanteNome" value="${v('sei_solicitante_nome')}" /></div>
          <div class="campo"><label>Cargo</label><input id="seiSolicitanteCargo" value="${v('sei_solicitante_cargo')}" /></div>
          <div class="campo"><label>Setor</label><input id="seiSolicitanteSetor" value="${UI.escaparHtml((sof && sof.sei_solicitante_setor) || (sof && sof.sei_area_setor_solicitante) || '')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Ordenador</h4>
        <div class="grade-3">
          <div class="campo"><label>Nome</label><input id="seiOrdenadorNome" value="${v('sei_ordenador_nome')}" /></div>
          <div class="campo"><label>Cargo</label><input id="seiOrdenadorCargo" value="${v('sei_ordenador_cargo')}" /></div>
          <div class="campo"><label>Setor</label><input id="seiOrdenadorSetor" value="${v('sei_ordenador_setor')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Assinatura da Nota de Empenho</h4>
        <div class="grade-2">
          <div class="campo"><label>Nome</label><input id="seiAssinaturaNeNome" value="${v('sei_assinatura_ne_nome')}" /></div>
          <div class="campo"><label>Cargo</label><input id="seiAssinaturaNeCargo" value="${v('sei_assinatura_ne_cargo')}" /></div>
        </div>

        <h4 class="sei-secao-titulo">Assinatura da Nota de Liquidação</h4>
        <div class="grade-2">
          <div class="campo"><label>Nome</label><input id="seiAssinaturaNlNome" value="${v('sei_assinatura_nl_nome')}" /></div>
          <div class="campo"><label>Cargo</label><input id="seiAssinaturaNlCargo" value="${v('sei_assinatura_nl_cargo')}" /></div>
        </div>

        <div class="campo"><label>Observação</label><textarea id="sofObservacao" rows="2">${v('observacao')}</textarea></div>
        <p class="ajuda">O andamento do processo é editado direto no card da listagem (stepper), sem precisar abrir esta tela.</p>
        <p id="sofErro" class="erro-campo oculto"></p>
      </form>
      ${editando ? '<div id="secaoNotasEmpenho" style="border-top:1px solid var(--cinza-200);margin-top:16px;padding-top:12px"></div>' : ''}`;

    UI.abrirModal(editando ? 'Editar SOF' : 'Nova SOF', corpo,
      `<button class="botao" id="btnCancelarSof">Cancelar</button><button class="botao" id="btnGerarDocumentoSei">Salvar e gerar documento SEI</button><button class="botao primario" id="btnSalvarSof">Salvar</button>`,
      { grande: true });
    if (editando) UI.aoFecharModal(() => EdicaoSimultanea.sairDaEdicao('SOF', sof.id));

    renderFontesFormulario();
    document.getElementById('btnAdicionarFonte').addEventListener('click', () => {
      linhasFontes = lerLinhasFontesDoDom_();
      linhasFontes.push({ fonte: '', codigo_poas: '', parcela_mensal: '', cronograma: [] });
      renderFontesFormulario();
    });

    renderManutencaoSeiFormulario_();
    document.getElementById('btnAdicionarLinhaManutencaoSei').addEventListener('click', () => {
      linhasManutencaoSei_ = lerLinhasManutencaoSeiDoDom_();
      linhasManutencaoSei_.push({ codigo: '', elemento: '', valor: '' });
      renderManutencaoSeiFormulario_();
    });

    document.getElementById('sofUnidade').addEventListener('change', function () {
      const unidade = unidades.find(u => u.id === this.value);
      const preenchido = camposAutopreenchimento(unidade, null);
      document.getElementById('sofOss').value = preenchido.oss_snapshot;
      document.getElementById('sofOss').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('sofCnpj').value = preenchido.cnpj_snapshot;
      document.getElementById('sofContrato').value = preenchido.contrato_snapshot;
      document.getElementById('sofAcao').value = preenchido.acao_snapshot;
      document.getElementById('sofSubacao').value = preenchido.subacao_snapshot;
      document.getElementById('sofGd').value = preenchido.gd_snapshot;
      document.getElementById('seiDestinacao').value = unidade ? unidade.tipo || '' : '';
      document.getElementById('seiCredor').value = unidade ? unidade.nome || '' : '';
      document.getElementById('seiCredorCnpj').value = preenchido.cnpj_snapshot;
      document.getElementById('seiAcao').value = preenchido.acao_snapshot;
      document.getElementById('seiSubacao').value = preenchido.subacao_snapshot;
    });

    document.getElementById('btnCancelarSof').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarSof').addEventListener('click', () => salvarSof(sof, { gerarDocumento: false }));
    document.getElementById('btnGerarDocumentoSei').addEventListener('click', () => salvarSof(sof, { gerarDocumento: true }));

    ['sofUnidade', 'sofOss', 'sofObjeto'].forEach(id => UI.tornarPesquisavel(id));

    if (editando) {
      await renderNotasEmpenho(sof, notasPromise);
    }
  }

  /** Monta o <select> de OSS a partir da lista personalizada; se o valor do snapshot não estiver na lista, entra como opção extra selecionada (não perde dado já existente). */
  function selectOssHtml_(opcoesOss, valorAtual) {
    const valores = opcoesOss.map(o => o.valor);
    const extra = valorAtual && valores.indexOf(valorAtual) === -1 ? [valorAtual] : [];
    const todas = extra.concat(valores);
    return `<select id="sofOss">
      <option value="">Selecione...</option>
      ${todas.map(v => `<option ${v === valorAtual ? 'selected' : ''}>${UI.escaparHtml(v)}</option>`).join('')}
    </select>`;
  }

  const NOMES_MESES_ABREV_FONTE_ = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  /** Lê as linhas de fonte direto do DOM (fonte da verdade entre re-renders). */
  function lerLinhasFontesDoDom_() {
    return Array.from(document.querySelectorAll('#sofFontesContainer .linha-fonte-cronograma')).map(linha => ({
      fonte: linha.querySelector('.linha-fonte-select').value,
      codigo_poas: linha.querySelector('.linha-fonte-codigo-poas').value.trim(),
      parcela_mensal: linha.querySelector('.linha-fonte-parcela').value,
      cronograma: Array.from(linha.querySelectorAll('.linha-fonte-mes')).map(i => ({ mes: Number(i.dataset.mes), valor: i.value }))
    }));
  }

  /**
   * Cada Fonte virou um mini-cronograma: Fonte/Código POAS/Parcela Mensal numa
   * linha, e 12 valores mensais (Jan-Dez) preenchidos manualmente embaixo -
   * pode ter só 1 mês (pagamento único) ou vários (pagamento recorrente).
   * Total Solicitado deixou de ser digitado - vira somente leitura, soma dos
   * meses. Parcela Mensal continua separada, não entra no documento gerado e
   * segue sendo só a base do alerta da Nota de Empenho.
   * Classe própria "linha-fonte-cronograma" (em vez de reaproveitar
   * ".linha-fonte") porque essa linha não cabe mais no grid de 4 colunas numa
   * única linha que ".linha-fonte" pressupõe (usado também pelas linhas de
   * Manutenção, que continuam simples e não podem mudar de layout).
   */
  function linhaFonteHtml(item, indice, podeRemover) {
    const porMes = {};
    (item.cronograma || []).forEach(c => { porMes[c.mes] = c.valor; });
    const mesesHtml = NOMES_MESES_ABREV_FONTE_.map((nome, i) => {
      const mes = i + 1;
      return `<div class="campo linha-fonte-mes-campo"><label>${nome}</label><input class="linha-fonte-mes" type="number" step="0.01" data-mes="${mes}" value="${porMes[mes] || ''}" /></div>`;
    }).join('');
    return `
      <div class="linha-fonte-cronograma" data-indice="${indice}">
        ${podeRemover ? '<button type="button" class="botao-icone linha-fonte-remover" title="Remover fonte">&times;</button>' : ''}
        <div class="linha-fonte-cabecalho">
          <div class="campo"><label>Fonte</label>
            <select class="linha-fonte-select">
              <option value="">-</option>
              ${OPCOES_FONTE.map(f => `<option ${item.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>Código POAS</label><input class="linha-fonte-codigo-poas" value="${UI.escaparHtml(item.codigo_poas || '')}" /></div>
          <div class="campo"><label>Parcela Mensal</label><input class="linha-fonte-parcela" type="number" step="0.01" value="${item.parcela_mensal || ''}" /></div>
          <div class="campo"><label>Total Solicitado</label><strong class="linha-fonte-total-exibicao">R$ 0,00</strong></div>
        </div>
        <div class="linha-fonte-meses">${mesesHtml}</div>
      </div>`;
  }

  function atualizarTotalLinhaFonte_(linhaEl) {
    const soma = Array.from(linhaEl.querySelectorAll('.linha-fonte-mes')).reduce((s, i) => s + (Number(i.value) || 0), 0);
    const alvo = linhaEl.querySelector('.linha-fonte-total-exibicao');
    if (alvo) alvo.textContent = UI.formatarMoeda(soma);
    return soma;
  }

  function atualizarTotalGeralFormulario() {
    const linhas = Array.from(document.querySelectorAll('#sofFontesContainer .linha-fonte-cronograma'));
    const soma = linhas.reduce((total, linha) => total + atualizarTotalLinhaFonte_(linha), 0);
    const alvo = document.getElementById('sofFontesTotalGeral');
    if (alvo) alvo.textContent = UI.formatarMoeda(soma);
  }

  function renderFontesFormulario() {
    const alvo = document.getElementById('sofFontesContainer');
    alvo.innerHTML = linhasFontes.map((item, i) => linhaFonteHtml(item, i, linhasFontes.length > 1)).join('');

    alvo.querySelectorAll('.linha-fonte-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasFontes = lerLinhasFontesDoDom_();
        const indice = Number(btn.closest('.linha-fonte-cronograma').dataset.indice);
        linhasFontes.splice(indice, 1);
        renderFontesFormulario();
      });
    });
    alvo.querySelectorAll('.linha-fonte-select').forEach(select => {
      select.addEventListener('change', function () {
        const outras = Array.from(alvo.querySelectorAll('.linha-fonte-select')).filter(s => s !== this);
        if (this.value && outras.some(s => s.value === this.value)) {
          confirm('Você está escolhendo a mesma fonte que a anterior, isso está correto?');
        }
      });
    });
    alvo.querySelectorAll('.linha-fonte-mes').forEach(input => {
      input.addEventListener('input', atualizarTotalGeralFormulario);
    });
    atualizarTotalGeralFormulario();
  }

  /** Junta os campos "de sempre" do SOF com os ~34 campos do documento SEI (formulário único desde a fusão). */
  function coletarDadosFormulario() {
    const linhasManutencao = lerLinhasManutencaoSeiDoDom_().filter(l => l.codigo || l.elemento || l.valor);
    return {
      unidade_id: document.getElementById('sofUnidade').value,
      oss_snapshot: document.getElementById('sofOss').value.trim(),
      cnpj_snapshot: document.getElementById('sofCnpj').value.trim(),
      contrato_snapshot: document.getElementById('sofContrato').value.trim(),
      acao_snapshot: document.getElementById('sofAcao').value.trim(),
      subacao_snapshot: document.getElementById('sofSubacao').value.trim(),
      gd_snapshot: document.getElementById('sofGd').value.trim(),
      sei: document.getElementById('sofSei').value.trim(),
      sof_numero: document.getElementById('sofNumero').value.trim(),
      periodo_inicio: document.getElementById('sofPeriodoInicio').value,
      periodo_fim: document.getElementById('sofPeriodoFim').value,
      dea: document.getElementById('sofDea').value.trim(),
      ta: document.getElementById('sofTa').value.trim(),
      ceo: document.getElementById('sofCeo').value.trim(),
      contrato: document.getElementById('sofNumeroContrato').value.trim(),
      fontes: lerLinhasFontesDoDom_(),
      objeto: document.getElementById('sofObjeto').value.trim(),
      observacao: document.getElementById('sofObservacao').value.trim(),
      completo: true,

      sei_numero_documento: document.getElementById('seiNumeroDocumento').value.trim(),
      sei_data: document.getElementById('seiData').value,
      sei_tipo_solicitacao: document.getElementById('seiTipoSolicitacao').value,
      sei_previsto_pca: document.getElementById('seiPrevistoPca').value,
      sei_numero_pca: document.getElementById('seiNumeroPca').value.trim(),
      sei_numero_dfd: document.getElementById('seiNumeroDfd').value.trim(),
      sei_tipo_pleito: document.getElementById('seiTipoPleito').value,
      sei_justificativa_pleito: document.getElementById('seiJustificativaPleito').value.trim(),
      sei_area_setor_solicitante: document.getElementById('seiAreaSetorSolicitante').value.trim(),
      sei_tema_poas: document.getElementById('seiTemaPoas').value.trim(),
      sei_objeto_despesa: document.getElementById('seiObjetoDespesa').value.trim(),
      sei_destinacao: document.getElementById('seiDestinacao').value.trim(),
      sei_credor: document.getElementById('seiCredor').value.trim(),
      sei_credor_cnpj: document.getElementById('seiCredorCnpj').value.trim(),
      sei_acao: document.getElementById('seiAcao').value.trim(),
      sei_subacao: document.getElementById('seiSubacao').value.trim(),
      sei_grupo_despesa: document.getElementById('seiGrupoDespesa').value.trim(),
      sei_medida_compensatoria_poas: document.getElementById('seiMedidaCompensatoriaPoas').value.trim(),
      sei_manutencao_linhas: JSON.stringify(linhasManutencao),
      sei_convenio_numero: document.getElementById('seiConvenioNumero').value.trim(),
      sei_convenio_efisco: document.getElementById('seiConvenioEfisco').value.trim(),
      sei_convenio_conta: document.getElementById('seiConvenioConta').value.trim(),
      sei_convenio_banco: document.getElementById('seiConvenioBanco').value.trim(),
      sei_contrapartida_convenio: document.getElementById('seiContrapartidaConvenio').value.trim(),
      sei_contrapartida_conta: document.getElementById('seiContrapartidaConta').value.trim(),
      sei_contrapartida_banco: document.getElementById('seiContrapartidaBanco').value.trim(),
      sei_solicitante_nome: document.getElementById('seiSolicitanteNome').value.trim(),
      sei_solicitante_cargo: document.getElementById('seiSolicitanteCargo').value.trim(),
      sei_solicitante_setor: document.getElementById('seiSolicitanteSetor').value.trim(),
      sei_ordenador_nome: document.getElementById('seiOrdenadorNome').value.trim(),
      sei_ordenador_cargo: document.getElementById('seiOrdenadorCargo').value.trim(),
      sei_ordenador_setor: document.getElementById('seiOrdenadorSetor').value.trim(),
      sei_assinatura_ne_nome: document.getElementById('seiAssinaturaNeNome').value.trim(),
      sei_assinatura_ne_cargo: document.getElementById('seiAssinaturaNeCargo').value.trim(),
      sei_assinatura_nl_nome: document.getElementById('seiAssinaturaNlNome').value.trim(),
      sei_assinatura_nl_cargo: document.getElementById('seiAssinaturaNlCargo').value.trim()
    };
  }

  /**
   * Lê o mini-formulário de Nota de Empenho embutido na edição de SOF (sem
   * botão próprio - só é salvo/adicionado junto com o botão "Salvar" do
   * formulário principal). Retorna `null` se o mini-formulário nem existe na
   * tela (SOF novo) ou está totalmente vazio (usuário não quer adicionar
   * nenhuma NE nesse Salvar). Lança erro com mensagem amigável se algo foi
   * preenchido parcialmente.
   */
  async function lerMiniFormularioNe_() {
    const numeroEl = document.getElementById('neNumero');
    if (!numeroEl) return null;
    const tipo = document.getElementById('neTipo').value;
    const numero = numeroEl.value.trim();
    const fonte = document.getElementById('neFonte').value;
    const valor = document.getElementById('neValor').value;
    const arquivoInput = document.getElementById('neArquivo');
    const arquivo = arquivoInput.files[0];

    const algumPreenchido = numero || fonte || valor || arquivo;
    if (!algumPreenchido) return null;

    if (!numero) throw new Error('Informe o número da Nota de Empenho (ou limpe os outros campos da NE pra não adicionar nenhuma).');
    if (!fonte) throw new Error('Selecione a fonte da Nota de Empenho.');
    if (!arquivo) throw new Error('Anexe o arquivo da Nota de Empenho.');
    if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo da Nota de Empenho muito grande (máximo 8MB).');

    const arquivoBase64 = await UI.lerArquivoBase64(arquivo);
    return { tipo, numero_ne: numero, fonte, valor, arquivoBase64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type };
  }

  /**
   * Salva o SOF - opcoes.gerarDocumento (novo, sessão de fusão do formulário
   * SEI) também monta/baixa/abre o documento HTML na sequência, disponível
   * tanto na criação quanto na edição (antes só existia editando).
   */
  async function salvarSof(sofExistente, opcoes) {
    opcoes = opcoes || {};
    const erroEl = document.getElementById('sofErro');
    erroEl.classList.add('oculto');
    const dados = coletarDadosFormulario();
    if (!dados.unidade_id && !sofExistente) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }
    const mensagemObrigatorio = validarCamposObrigatorios();
    if (mensagemObrigatorio) { UI.mostrarErro(erroEl, mensagemObrigatorio); return; }
    if (opcoes.gerarDocumento && !dados.sei_numero_documento) {
      UI.mostrarErro(erroEl, 'Informe o "Número do documento (SEI)" pra gerar o documento.');
      return;
    }

    let dadosNe;
    try {
      dadosNe = await lerMiniFormularioNe_();
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
      return;
    }

    try {
      let resposta;
      if (sofExistente) resposta = await Api.chamar('atualizarSof', { id: sofExistente.id, data: dados });
      else resposta = await Api.chamar('criarSof', { data: dados });

      if (dadosNe) {
        await Api.chamar('criarNotaEmpenho', {
          data: { sof_id: resposta.id, tipo: dadosNe.tipo, numero_ne: dadosNe.numero_ne, fonte: dadosNe.fonte, valor: dadosNe.valor,
            arquivoBase64: dadosNe.arquivoBase64, arquivoNome: dadosNe.arquivoNome, arquivoTipo: dadosNe.arquivoTipo }
        });
        if (dadosNe.tipo === 'original') {
          resposta.possui_ne = true;
          const idxAtual = ETAPAS_ANDAMENTO.indexOf(resposta.andamento);
          const idxNeEmitida = ETAPAS_ANDAMENTO.indexOf('NE EMITIDA');
          if (idxAtual < idxNeEmitida) resposta.andamento = 'NE EMITIDA';
        }
      }

      if (opcoes.gerarDocumento) {
        const html = montarDocumentoSeiHtml_(Object.assign({}, sofExistente, resposta, dados));
        baixarArquivo(`SOF_SEI_${resposta.sof_numero || resposta.id}.html`, html, 'text/html;charset=utf-8');
        abrirDocumentoEmNovaAba_(html);
      }

      UI.toast(
        opcoes.gerarDocumento ? 'SOF salva e documento gerado com sucesso.' : (dadosNe ? 'SOF e Nota de Empenho salvos com sucesso.' : 'SOF salvo com sucesso.'),
        'sucesso'
      );
      if (sofExistente) {
        UI.fecharModal();
        await carregar();
      } else {
        // Reabre imediatamente em modo edição: só a partir daqui o SOF tem
        // id e a seção de Notas de Empenho (produto final do processo) pode
        // ser usada, sem exigir que o usuário feche e reabra manualmente.
        await carregar();
        await abrirSofExistente(resposta.id);
      }
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  function camposNumeroNeHtml(notas, tipo) {
    if (tipo === 'reforco') {
      const numerosOriginais = Array.from(new Set(notas.filter(n => n.tipo === 'original').map(n => n.numero_ne).filter(Boolean)));
      if (!numerosOriginais.length) return '<p class="ajuda">Nenhuma NE original cadastrada ainda neste SOF — adicione a original primeiro.</p>';
      return `<select id="neNumero">${numerosOriginais.map(num => `<option value="${UI.escaparHtml(num)}">${UI.escaparHtml(num)}</option>`).join('')}</select>`;
    }
    return '<input id="neNumero" />';
  }

  async function renderNotasEmpenho(sof, notasPromise) {
    const notas = await (notasPromise || Api.chamar('listarNotasEmpenhoPorSof', { sofId: sof.id }));
    const total = notas.reduce((s, n) => s + Number(n.valor || 0), 0);
    const opcoesFonte = (sof.fontes || []).map(f => f.fonte).filter(Boolean);
    const fontesDisponiveis = opcoesFonte.length ? opcoesFonte : OPCOES_FONTE;
    const alvo = document.getElementById('secaoNotasEmpenho');
    alvo.innerHTML = `
      <h4 style="margin:0 0 8px">Notas de Empenho (total: ${UI.formatarMoeda(total)})</h4>
      <table class="tabela">
        <thead><tr><th>Tipo</th><th>Número</th><th>Fonte</th><th>Valor Empenhado</th><th>Período</th><th>Arquivo</th></tr></thead>
        <tbody>${notas.map(n => `<tr><td>${n.tipo}</td><td>${UI.escaparHtml(n.numero_ne || '-')}</td><td>${UI.escaparHtml(n.fonte || '-')}</td><td>${UI.formatarMoeda(n.valor)}</td><td>${UI.escaparHtml(n.periodo)}</td><td>${n.arquivo_url ? `<a href="${UI.escaparHtml(n.arquivo_url)}" target="_blank" rel="noopener">Ver arquivo</a>` : '-'}</td></tr>`).join('') || '<tr><td colspan="6" class="estado-vazio">Nenhuma NE vinculada ainda.</td></tr>'}</tbody>
      </table>
      <p class="ajuda">Preencha abaixo pra anexar uma nova Nota de Empenho a este SOF - ela só é salva quando você clicar em "Salvar" (rodapé desta tela). Deixe em branco se não quiser adicionar nenhuma agora.</p>
      <div class="grade-3">
        <div class="campo"><label>Tipo</label><select id="neTipo"><option value="original">Original</option><option value="reforco">Reforço</option></select></div>
        <div class="campo"><label>Número</label><div id="neNumeroContainer">${camposNumeroNeHtml(notas, 'original')}</div></div>
        <div class="campo"><label>Fonte</label><select id="neFonte"><option value="">-</option>${fontesDisponiveis.map(f => `<option>${UI.escaparHtml(f)}</option>`).join('')}</select></div>
      </div>
      <div class="grade-3">
        <div class="campo"><label>Valor Empenhado</label><input id="neValor" type="number" step="0.01" /></div>
      </div>
      <div class="campo"><label>Arquivo da Nota de Empenho</label><input type="file" id="neArquivo" accept=".pdf,image/*" /></div>`;

    document.getElementById('neTipo').addEventListener('change', function () {
      document.getElementById('neNumeroContainer').innerHTML = camposNumeroNeHtml(notas, this.value);
      UI.tornarPesquisavel('neNumero');
    });
    UI.tornarPesquisavel('neNumero');
    ligarOcrMiniFormularioNe_();
  }

  /**
   * Ao anexar o arquivo no mini-formulário de NE (dentro da edição de SOF),
   * lê o documento por OCR e preenche Número (só quando Tipo = original - em
   * Reforço o Número já vem de um <select> com os números existentes),
   * Fonte (classificada do código orçamentário do documento) e Valor
   * Empenhado, travando os campos (mesmo padrão de ligarAnexoComOcr_ em
   * js/recibos.js) com link "Remover anexo" pra refazer.
   */
  function ligarOcrMiniFormularioNe_() {
    const inputEl = document.getElementById('neArquivo');
    const statusEl = document.createElement('p');
    statusEl.className = 'ajuda anexo-ocr-status oculto';
    inputEl.insertAdjacentElement('afterend', statusEl);

    function travar(resultado) {
      const numeroEl = document.getElementById('neNumero');
      if (numeroEl && document.getElementById('neTipo').value === 'original') {
        numeroEl.value = resultado.numero_ne;
        numeroEl.readOnly = true;
      }
      const fonteEl = document.getElementById('neFonte');
      const fonteEncontrada = resultado.fonte && Array.from(fonteEl.options).some(o => o.value === resultado.fonte);
      if (fonteEncontrada) {
        fonteEl.value = resultado.fonte;
        fonteEl.disabled = true;
      }
      document.getElementById('neValor').value = resultado.preco_total;
      document.getElementById('neValor').readOnly = true;

      statusEl.classList.remove('oculto');
      statusEl.innerHTML = (fonteEncontrada
        ? '🔒 Número/Fonte/Valor lidos do documento.'
        : '🔒 Número/Valor lidos do documento (Fonte não identificada - selecione manualmente).')
        + ' <a href="#" class="anexo-ocr-remover">Remover anexo</a>';
      statusEl.querySelector('.anexo-ocr-remover').addEventListener('click', e => {
        e.preventDefault();
        if (numeroEl && document.getElementById('neTipo').value === 'original') {
          numeroEl.readOnly = false;
          numeroEl.value = '';
        }
        fonteEl.disabled = false;
        if (fonteEncontrada) fonteEl.value = '';
        document.getElementById('neValor').readOnly = false;
        document.getElementById('neValor').value = '';
        inputEl.value = '';
        statusEl.classList.add('oculto');
      });
    }

    inputEl.addEventListener('change', async function () {
      const arquivo = inputEl.files[0];
      if (!arquivo) return;
      try {
        if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        travar(resultado);
      } catch (err) {
        inputEl.value = '';
        UI.toast(err.message, 'erro');
      }
    });
  }

  /**
   * Monta o HTML do stepper de Andamento (13 etapas fixas), embutido direto
   * no card da listagem (Funcionalidade 3) - não existe mais dentro do modal
   * de edição. Navegação é livre (qualquer nó, pra frente ou pra trás) — a
   * única trava é o nó "NE EMITIDA", que só fica clicável depois que o SOF
   * tiver uma Nota de Empenho anexada.
   */
  function stepperHtml(sof) {
    const atual = sof && sof.andamento ? ETAPAS_ANDAMENTO.indexOf(sof.andamento) : -1;
    return `<div class="stepper">${ETAPAS_ANDAMENTO.map((etapa, i) => {
      const estado = i < atual ? 'concluido' : (i === atual ? 'atual' : 'futuro');
      const bloqueado = etapa === 'NE EMITIDA' && !sof.possui_ne;
      return `<div class="stepper-no ${estado}">
        <button type="button" class="stepper-marcador" data-etapa="${UI.escaparHtml(etapa)}" ${bloqueado ? 'disabled' : ''} title="${bloqueado ? 'Anexe a Nota de Empenho para liberar esta etapa' : ''}">${i <= atual ? '✓' : (i + 1)}</button>
        <span class="stepper-rotulo">${UI.escaparHtml(etapa)}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function validarCamposObrigatorios() {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      const valor = document.getElementById(campo.id).value.trim();
      if (!valor) return 'Preencha o campo obrigatório: ' + campo.rotulo + '.';
    }
    const fontes = lerLinhasFontesDoDom_();
    if (!fontes.length) return 'Informe ao menos uma fonte.';
    for (const linha of fontes) {
      if (!String(linha.fonte || '').trim() || !String(linha.parcela_mensal || '').trim()) {
        return 'Preencha fonte e parcela mensal em todas as linhas de fonte.';
      }
      const soma = linha.cronograma.reduce((s, c) => s + (Number(c.valor) || 0), 0);
      if (soma <= 0) return 'Preencha ao menos um mês com valor maior que zero em cada linha de fonte.';
    }
    return null;
  }

  // ===================== Documento SEI =====================
  // Documento "Solicitação Orçamentária e Financeira" (modelo SEI/GOVPE) - os
  // campos vivem no formulário único de SOF (abrirFormulario, acima; até uma
  // sessão anterior isso era um modal separado, só disponível editando -
  // ver PROGRESS.md, sessão de fusão do formulário na criação). Os campos
  // ficam salvos no próprio SOF (via criarSof/atualizarSof) e o documento é
  // gerado como HTML autocontido (sem o timbre nem o rodapé de endereço da
  // Secretaria, por pedido do usuário) pelo botão "Salvar e gerar documento SEI".

  const OPCOES_SEI_SOLICITACAO = [
    'CLASSIFICAÇÃO DA DESPESA',
    'DECLARAÇÃO DE DISPONIBILIDADE ORÇAMENTÁRIA',
    'DOTAÇÃO ORÇAMENTÁRIA E PROGRAMAÇÃO FINANCEIRA PARA EMPENHO'
  ];
  const OPCOES_SEI_PLEITO = [
    'Licitação', 'Adesão à ARP', 'Reajuste', 'TAC',
    'Dispensa de Licitação', 'Consumo de ARP', 'Acréscimo Contratual', 'Contratação Direta',
    'Inexigibilidade', 'Edital de Credenciamento', 'Emenda Parlamentar Estadual', 'Reequilíbrio Econômico Financeiro',
    'Formação de ARP', 'Adesão a Credenciamento'
  ];
  const NOMES_MESES_SEI_ = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const OBSERVACOES_SEI_ = [
    'Para as Diárias/Capacitação acrescentar: período do evento, localização do evento, número de participantes e carga horária;',
    'Para as solicitações da Despesa de Exercícios Anteriores (DEA): deverão vir com o DH e competência;',
    'Para os Contratos: informar o credor, período, número do contrato CEO, valor do contrato anual e mensal, cópia do contrato e último termo aditivo se houver;',
    'Para as solicitações de Auxílio Funeral e dias deixados de receber acrescentar: cópias da certidão de óbito do ex-servidor(a), documentação do requerente, bem como o despacho do jurídico com o deferimento. Informar o nome do requerente, CPF, nome do ex-servidor, matrícula, data do óbito, cargo/função;',
    'Para as solicitações de Medicamentos: informar credor, item do e-Fisco, quantidade, valor unitário, período de abastecimento com a compra, vencimento da ata, número e data da emissão da Nota Fiscal (nos casos de pagamento de NF). Para os medicamentos oriundos de ação judicial, informar o número do processo;',
    'Para as solicitações de Plantão Extra: informar a unidade, competência a que se refere o plantão, bem como especificar o valor de pessoa física e obrigação patronal.'
  ];
  let linhasManutencaoSei_ = [];

  function hojeIso_() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** "2026-07-21" -> "21 de Julho de 2026" (formato usado no cabeçalho do documento). */
  function formatarDataSeiExtenso_(iso) {
    if (!iso) return '';
    const partes = String(iso).split('-');
    if (partes.length !== 3) return iso;
    const mes = NOMES_MESES_SEI_[Number(partes[1]) - 1] || partes[1];
    return `${Number(partes[2])} de ${mes} de ${partes[0]}`;
  }

  function parseManutencaoSei_(jsonTexto) {
    try {
      const arr = JSON.parse(jsonTexto || '[]');
      return Array.isArray(arr) && arr.length ? arr : [{ codigo: '', elemento: '', valor: '' }];
    } catch (e) {
      return [{ codigo: '', elemento: '', valor: '' }];
    }
  }

  function lerLinhasManutencaoSeiDoDom_() {
    return Array.from(document.querySelectorAll('#seiManutencaoContainer .linha-fonte')).map(linha => ({
      codigo: linha.querySelector('.linha-manutencao-codigo').value.trim(),
      elemento: linha.querySelector('.linha-manutencao-elemento').value.trim(),
      valor: linha.querySelector('.linha-manutencao-valor').value
    }));
  }

  function linhaManutencaoSeiHtml_(item, indice) {
    return `
      <div class="linha-fonte" data-indice="${indice}">
        <div class="campo"><label>Código</label><input class="linha-manutencao-codigo" value="${UI.escaparHtml(item.codigo || '')}" /></div>
        <div class="campo"><label>Elemento</label><input class="linha-manutencao-elemento" value="${UI.escaparHtml(item.elemento || '')}" /></div>
        <div class="campo"><label>Valor</label><input class="linha-manutencao-valor" type="number" step="0.01" value="${item.valor || ''}" /></div>
        <button type="button" class="botao-icone linha-fonte-remover linha-manutencao-remover" title="Remover linha">&times;</button>
      </div>`;
  }

  function renderManutencaoSeiFormulario_() {
    const alvo = document.getElementById('seiManutencaoContainer');
    if (!alvo) return;
    alvo.innerHTML = linhasManutencaoSei_.map((item, i) => linhaManutencaoSeiHtml_(item, i)).join('');
    alvo.querySelectorAll('.linha-manutencao-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasManutencaoSei_ = lerLinhasManutencaoSeiDoDom_();
        const indice = Number(btn.closest('.linha-fonte').dataset.indice);
        linhasManutencaoSei_.splice(indice, 1);
        if (!linhasManutencaoSei_.length) linhasManutencaoSei_.push({ codigo: '', elemento: '', valor: '' });
        renderManutencaoSeiFormulario_();
      });
    });
  }

  /** Divide um array em grupos de N (usado só pra montar a tabela de "Assinalar o pleito" no documento gerado, 4 colunas por linha). */
  function agruparEm_(lista, tamanho) {
    const grupos = [];
    for (let i = 0; i < lista.length; i += tamanho) grupos.push(lista.slice(i, i + tamanho));
    return grupos;
  }

  /**
   * Monta o HTML autocontido do documento "Criar SOF - SEI" - `sof` aqui já
   * deve vir mesclado com os dados recém-salvos (ver salvarSof, opção gerarDocumento).
   * Não reproduz a marcação bagunçada de spans aninhados do export original do
   * SEI - usa HTML/CSS limpo com o mesmo layout visual, sem o timbre (imagem)
   * nem o rodapé de endereço da Secretaria (pedido explícito do usuário).
   */
  function montarDocumentoSeiHtml_(sof) {
    const nl2br_ = texto => UI.escaparHtml(texto || '').replace(/\n/g, '<br>');
    const marcado_ = (valorAtual, opcao) => valorAtual === opcao ? 'X' : '&nbsp;';
    const fontes = sof.fontes || [];
    const totalFontes = fontes.reduce((s, f) => s + (Number(f.total_solicitado) || 0), 0);
    const linhasManutencao = parseManutencaoSei_(sof.sei_manutencao_linhas).filter(l => l.codigo || l.elemento || l.valor);
    const totalManutencao = linhasManutencao.reduce((s, l) => s + (Number(l.valor) || 0), 0);

    const solicitacaoHtml = OPCOES_SEI_SOLICITACAO.map(op =>
      `<p>( ${marcado_(sof.sei_tipo_solicitacao, op)} ) ${UI.escaparHtml(op)}</p>`).join('');

    const pleitoHtml = agruparEm_(OPCOES_SEI_PLEITO, 4).map(linha =>
      `<tr>${linha.map(op => `<td>( ${marcado_(sof.sei_tipo_pleito, op)} ) ${UI.escaparHtml(op)}</td>`).join('')}</tr>`).join('');

    const fontesHtml = fontes.length
      ? fontes.map(f => {
          const porMes = {};
          (f.cronograma || []).forEach(c => { porMes[c.mes] = c.valor; });
          const celulasMeses = Array.from({ length: 12 }, (_, i) => `<td>${porMes[i + 1] ? UI.formatarMoeda(porMes[i + 1]) : ''}</td>`).join('');
          return `<tr><td>${UI.escaparHtml(f.codigo_poas || '')}</td><td>${UI.escaparHtml(f.fonte || '')}</td>${celulasMeses}<td>${UI.formatarMoeda(f.total_solicitado)}</td></tr>`;
        }).join('')
      : `<tr><td colspan="15" style="text-align:center">Nenhuma fonte cadastrada no SOF.</td></tr>`;

    const manutencaoHtml = linhasManutencao.length
      ? linhasManutencao.map(l => `<tr><td>${UI.escaparHtml(l.codigo || '')}</td><td>${UI.escaparHtml(l.elemento || '')}</td><td>${UI.formatarMoeda(l.valor)}</td></tr>`).join('')
        + `<tr><td></td><td><strong>TOTAL</strong></td><td><strong>${UI.formatarMoeda(totalManutencao)}</strong></td></tr>`
      : '';

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<title>${UI.escaparHtml(sof.sei_numero_documento || sof.sof_numero || sof.id)} - Solicitação Orçamentária e Financeira</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #000; max-width: 900px; margin: 24px auto; padding: 0 16px; }
  p { margin: 6pt 0; text-align: justify; }
  h2 { text-align: center; font-size: 13pt; }
  table.sei-tabela { border-collapse: collapse; width: 100%; margin: 8px 0; }
  table.sei-tabela td, table.sei-tabela th { border: 1px solid #000; padding: 4px 8px; font-size: 10.5pt; vertical-align: top; }
  table.sei-tabela th { text-align: center; }
  .sei-direita { text-align: right; }
  .sei-assinatura-ne { background: #f1c40f; }
  .sei-assinatura-nl { background: #e6a19b; }
</style>
</head>
<body>
  <h2>${UI.escaparHtml(sof.sei_numero_documento || '')} - SES – Secretaria de Saúde - Solicitação Orçamentária e Financeira</h2>
  <p class="sei-direita">Em, ${UI.escaparHtml(formatarDataSeiExtenso_(sof.sei_data))}</p>
  <p><strong>Diretoria Geral de Planejamento Orçamentário - DGPO</strong></p>
  <p>Prezado(a), Solicito (assinalar com X):</p>
  ${solicitacaoHtml}

  <table class="sei-tabela">
    <tr><td>Previsto no PCA? ( ${marcado_(sof.sei_previsto_pca, 'SIM')} ) SIM &nbsp; ( ${marcado_(sof.sei_previsto_pca, 'NÃO')} ) NÃO</td></tr>
    <tr><td>Nº Plano de Contratações Anual (PCA): ${UI.escaparHtml(sof.sei_numero_pca || '')}</td></tr>
    <tr><td>Nº Documento de Formalização da Demanda (DFD): ${UI.escaparHtml(sof.sei_numero_dfd || '')}</td></tr>
  </table>

  <p>Assinalar o pleito:</p>
  <table class="sei-tabela"><tbody>${pleitoHtml}</tbody></table>

  <p>Justificativa do pleito para a CPF/SAD:</p>
  <p>${nl2br_(sof.sei_justificativa_pleito)}</p>

  <p>Área/setor solicitante: ${UI.escaparHtml(sof.sei_area_setor_solicitante || '')}</p>
  <p>Tema POAS: ${UI.escaparHtml(sof.sei_tema_poas || '')}</p>
  <p>Objeto da despesa: ${nl2br_(sof.sei_objeto_despesa)}</p>

  <p>Destinação (Hospital, Geres, etc...): ${UI.escaparHtml(sof.sei_destinacao || '')}</p>
  <p>Credor: ${UI.escaparHtml(sof.sei_credor || '')}</p>
  <p>CPF/CNPJ: ${UI.escaparHtml(sof.sei_credor_cnpj || '')}</p>
  <p>Ação: ${UI.escaparHtml(sof.sei_acao || '')}</p>
  <p>Subação: ${UI.escaparHtml(sof.sei_subacao || '')}</p>
  <p>Grupo de despesa: ${UI.escaparHtml(sof.sei_grupo_despesa || '')}</p>

  <p>Valor total com cronograma de desembolso (mensal):</p>
  <table class="sei-tabela">
    <thead><tr><th>Código POAS</th><th>Fonte</th>${NOMES_MESES_SEI_.map(m => `<th>${m.substring(0, 3).toUpperCase()}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${fontesHtml}</tbody>
    <tfoot><tr><td colspan="14" style="text-align:right"><strong>TOTAL</strong></td><td><strong>${UI.formatarMoeda(totalFontes)}</strong></td></tr></tfoot>
  </table>

  <p>Medida compensatória POAS (caso seja necessário):</p>
  <p>${nl2br_(sof.sei_medida_compensatoria_poas)}</p>

  <p>Para os casos de MANUTENÇÃO DE GERES, HOSPITAIS REGIONAIS e SUPRIMENTO INDIVIDUAL:</p>
  ${manutencaoHtml ? `<table class="sei-tabela"><thead><tr><th>Código</th><th>Elemento</th><th>Valor</th></tr></thead><tbody>${manutencaoHtml}</tbody></table>` : '<p class="ajuda">-</p>'}

  <p>Para os casos de DESPESAS SUS/PORTARIA OU CONVÊNIO/RECURSOS PRÓPRIOS:</p>
  <p>Nº do Convênio ou Portaria: ${UI.escaparHtml(sof.sei_convenio_numero || '')}</p>
  <p>Nº do E-fisco: ${UI.escaparHtml(sof.sei_convenio_efisco || '')}</p>
  <p>Nº da Conta: ${UI.escaparHtml(sof.sei_convenio_conta || '')}</p>
  <p>Banco: ${UI.escaparHtml(sof.sei_convenio_banco || '')}</p>
  <p>Contrapartida do Convênio Nº: ${UI.escaparHtml(sof.sei_contrapartida_convenio || '')}</p>
  <p>Nº da Conta: ${UI.escaparHtml(sof.sei_contrapartida_conta || '')}</p>
  <p>Banco: ${UI.escaparHtml(sof.sei_contrapartida_banco || '')}</p>

  <p>Para os casos de LICITAÇÕES:</p>
  <p>Número do Contrato: ${UI.escaparHtml(sof.contrato || '')}</p>
  <p>CEO E-fisco: ${UI.escaparHtml(sof.ceo || '')}</p>

  <p>Observações:</p>
  ${OBSERVACOES_SEI_.map(o => `<p>${o}</p>`).join('')}

  <table class="sei-tabela">
    <tr><th colspan="2">SOLICITANTE</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_solicitante_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_solicitante_cargo || '')}</td></tr>
    <tr><td>SETOR</td><td>${UI.escaparHtml(sof.sei_solicitante_setor || '')}</td></tr>
  </table>

  <table class="sei-tabela">
    <tr><th colspan="2">ORDENADOR</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_ordenador_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_ordenador_cargo || '')}</td></tr>
    <tr><td>SETOR</td><td>${UI.escaparHtml(sof.sei_ordenador_setor || '')}</td></tr>
  </table>

  <table class="sei-tabela">
    <tr><th colspan="2" class="sei-assinatura-ne">ASSINATURA DA NOTA DE EMPENHO</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_assinatura_ne_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_assinatura_ne_cargo || '')}</td></tr>
  </table>

  <table class="sei-tabela">
    <tr><th colspan="2" class="sei-assinatura-nl">ASSINATURA DA NOTA DE LIQUIDAÇÃO</th></tr>
    <tr><td>NOME</td><td>${UI.escaparHtml(sof.sei_assinatura_nl_nome || '')}</td></tr>
    <tr><td>CARGO</td><td>${UI.escaparHtml(sof.sei_assinatura_nl_cargo || '')}</td></tr>
  </table>
</body>
</html>`;
  }

  return { render };
})();
