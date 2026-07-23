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
          <span class="cartao-sof-id">${UI.escaparHtml(s.id)}</span>
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

  function baixarArquivo(nome, conteudo) {
    const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
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

  async function abrirFormulario(sof, notasPromise) {
    const editando = !!sof;
    sofEmEdicaoId = editando ? sof.id : null;
    linhasFontes = (sof && sof.fontes && sof.fontes.length)
      ? sof.fontes.map(f => ({ fonte: f.fonte, parcela_mensal: f.parcela_mensal, total_solicitado: f.total_solicitado }))
      : [{ fonte: '', parcela_mensal: '', total_solicitado: '' }];
    const unidadeAtual = sof ? unidades.find(u => u.id === sof.unidade_id) : null;
    const snapshot = camposAutopreenchimento(unidadeAtual, sof);
    const opcoesObjeto = await TelaListas.obterOpcoes('OBJETO');
    const opcoesOss = await TelaListas.obterOpcoes('OSS');
    const corpo = `
      <form id="formSof">
        <div class="campo"><label>Unidade *</label>
          <select id="sofUnidade" required ${editando ? 'disabled' : ''}>
            <option value="">Selecione...</option>
            ${unidades.map(u => `<option value="${u.id}" ${sof && sof.unidade_id === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('')}
          </select>
        </div>
        ${sof && sof.divergente_da_unidade ? '<p class="aviso-divergencia">⚠ Um ou mais campos abaixo divergem do cadastro atual da unidade.</p>' : ''}
        <div class="grade-3">
          <div class="campo"><label>OSS</label>${selectOssHtml_(opcoesOss, snapshot.oss_snapshot)}</div>
          <div class="campo"><label>CNPJ</label><input id="sofCnpj" value="${UI.escaparHtml(snapshot.cnpj_snapshot)}" /></div>
          <div class="campo"><label>Contrato de Gestão</label><input id="sofContrato" value="${UI.escaparHtml(snapshot.contrato_snapshot)}" /></div>
          <div class="campo"><label>Ação</label><input id="sofAcao" value="${UI.escaparHtml(snapshot.acao_snapshot)}" /></div>
          <div class="campo"><label>Subação</label><input id="sofSubacao" value="${UI.escaparHtml(snapshot.subacao_snapshot)}" /></div>
          <div class="campo"><label>G.D.</label><input id="sofGd" value="${UI.escaparHtml(snapshot.gd_snapshot)}" /></div>
          <div class="campo"><label>Número do Processo</label><input id="sofSei" value="${UI.escaparHtml(sof ? sof.sei : '')}" placeholder="0000000000.000000/0000-00" /></div>
          <div class="campo"><label>Nº SOF</label><input id="sofNumero" value="${UI.escaparHtml(sof ? sof.sof_numero : '')}" placeholder="000/0000" /></div>
          <div class="campo"><label>Período - início</label><input type="date" id="sofPeriodoInicio" value="${UI.escaparHtml(sof ? sof.periodo_inicio : '')}" /></div>
          <div class="campo"><label>Período - fim</label><input type="date" id="sofPeriodoFim" value="${UI.escaparHtml(sof ? sof.periodo_fim : '')}" /></div>
          <div class="campo"><label>DEA</label>
            <select id="sofDea">
              <option value="">-</option>
              <option ${sof && sof.dea === 'SIM' ? 'selected' : ''}>SIM</option>
              <option ${sof && sof.dea === 'NÃO' ? 'selected' : ''}>NÃO</option>
            </select>
          </div>
          <div class="campo"><label>T.A.</label><input id="sofTa" value="${UI.escaparHtml(sof ? sof.ta : '')}" /></div>
          <div class="campo"><label>CEO</label><input id="sofCeo" value="${UI.escaparHtml(sof ? sof.ceo : '')}" /></div>
        </div>
        <div class="campo">
          <label>Fontes de recurso *</label>
          <div id="sofFontesContainer" class="linhas-fonte"></div>
          <div class="linhas-fonte-rodape">
            <button type="button" class="botao" id="btnAdicionarFonte">+ Adicionar fonte</button>
            <span class="linhas-fonte-total">Total geral: <strong id="sofFontesTotalGeral">R$ 0,00</strong></span>
          </div>
        </div>
        <div class="campo"><label>Objeto *</label>
          <select id="sofObjeto">
            <option value="">Selecione...</option>
            ${opcoesObjeto.map(o => `<option ${sof && sof.objeto === o.valor ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('')}
          </select>
        </div>
        <div class="campo"><label>Observação</label><textarea id="sofObservacao" rows="2">${UI.escaparHtml(sof ? sof.observacao : '')}</textarea></div>
        <p class="ajuda">O andamento do processo agora é editado direto no card da listagem (stepper), sem precisar abrir esta tela.</p>
        <p id="sofErro" class="erro-campo oculto"></p>
      </form>
      ${editando ? '<div id="secaoNotasEmpenho" style="border-top:1px solid var(--cinza-200);margin-top:16px;padding-top:12px"></div>' : ''}`;

    UI.abrirModal(editando ? 'Editar SOF' : 'Nova SOF', corpo,
      `<button class="botao" id="btnCancelarSof">Cancelar</button><button class="botao primario" id="btnSalvarSof">Salvar</button>`);
    if (editando) UI.aoFecharModal(() => EdicaoSimultanea.sairDaEdicao('SOF', sof.id));

    renderFontesFormulario();
    document.getElementById('btnAdicionarFonte').addEventListener('click', () => {
      linhasFontes = lerLinhasFontesDoDom_();
      linhasFontes.push({ fonte: '', parcela_mensal: '', total_solicitado: '' });
      renderFontesFormulario();
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
    });

    document.getElementById('btnCancelarSof').addEventListener('click', UI.fecharModal);

    document.getElementById('btnSalvarSof').addEventListener('click', () => salvarSof(sof));

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

  /** Lê as linhas de fonte direto do DOM (fonte da verdade entre re-renders). */
  function lerLinhasFontesDoDom_() {
    return Array.from(document.querySelectorAll('#sofFontesContainer .linha-fonte')).map(linha => ({
      fonte: linha.querySelector('.linha-fonte-select').value,
      parcela_mensal: linha.querySelector('.linha-fonte-parcela').value,
      total_solicitado: linha.querySelector('.linha-fonte-total').value
    }));
  }

  function linhaFonteHtml(item, indice, podeRemover) {
    return `
      <div class="linha-fonte" data-indice="${indice}">
        <div class="campo"><label>Fonte</label>
          <select class="linha-fonte-select">
            <option value="">-</option>
            ${OPCOES_FONTE.map(f => `<option ${item.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="campo"><label>Parcela Mensal</label><input class="linha-fonte-parcela" type="number" step="0.01" value="${item.parcela_mensal || ''}" /></div>
        <div class="campo"><label>Total Solicitado</label><input class="linha-fonte-total" type="number" step="0.01" value="${item.total_solicitado || ''}" /></div>
        ${podeRemover ? '<button type="button" class="botao-icone linha-fonte-remover" title="Remover fonte">&times;</button>' : ''}
      </div>`;
  }

  function atualizarTotalGeralFormulario() {
    const totais = Array.from(document.querySelectorAll('#sofFontesContainer .linha-fonte-total')).map(i => Number(i.value) || 0);
    const soma = totais.reduce((a, b) => a + b, 0);
    const alvo = document.getElementById('sofFontesTotalGeral');
    if (alvo) alvo.textContent = UI.formatarMoeda(soma);
  }

  function renderFontesFormulario() {
    const alvo = document.getElementById('sofFontesContainer');
    alvo.innerHTML = linhasFontes.map((item, i) => linhaFonteHtml(item, i, linhasFontes.length > 1)).join('');

    alvo.querySelectorAll('.linha-fonte-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasFontes = lerLinhasFontesDoDom_();
        const indice = Number(btn.closest('.linha-fonte').dataset.indice);
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
    alvo.querySelectorAll('.linha-fonte-total').forEach(input => {
      input.addEventListener('input', atualizarTotalGeralFormulario);
    });
    atualizarTotalGeralFormulario();
  }

  function coletarDadosFormulario() {
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
      fontes: lerLinhasFontesDoDom_(),
      objeto: document.getElementById('sofObjeto').value.trim(),
      observacao: document.getElementById('sofObservacao').value.trim(),
      completo: true
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

  async function salvarSof(sofExistente) {
    const erroEl = document.getElementById('sofErro');
    erroEl.classList.add('oculto');
    const dados = coletarDadosFormulario();
    if (!dados.unidade_id && !sofExistente) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }
    const mensagemObrigatorio = validarCamposObrigatorios();
    if (mensagemObrigatorio) { UI.mostrarErro(erroEl, mensagemObrigatorio); return; }

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

      UI.toast(dadosNe ? 'SOF e Nota de Empenho salvos com sucesso.' : 'SOF salvo com sucesso.', 'sucesso');
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
      if (!String(linha.fonte || '').trim() || !String(linha.parcela_mensal || '').trim() || !String(linha.total_solicitado || '').trim()) {
        return 'Preencha fonte, parcela mensal e total solicitado em todas as linhas de fonte.';
      }
    }
    return null;
  }

  return { render };
})();
