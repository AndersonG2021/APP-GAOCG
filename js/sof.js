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
    { id: 'sofSei', rotulo: 'SEI' },
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

  async function render() {
    const [unidadesCarregadas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true }, { cache: true }),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    unidades = unidadesCarregadas;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">SOF</h2>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="sofBusca" placeholder="unidade, SEI, valor..." /></div>
          <div class="campo"><label>Unidade</label>
            <select id="sofFiltroUnidade"><option value="">Todas</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>OSS</label>
            <select id="sofFiltroOss"><option value="">Todas</option>${opcoesOss.map(o => `<option>${UI.escaparHtml(o.valor)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Objeto</label>
            <select id="sofFiltroObjeto"><option value="">Todos</option>${opcoesObjeto.map(o => `<option>${UI.escaparHtml(o.valor)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Tipo de unidade</label>
            <select id="sofFiltroTipoUnidade"><option value="">Todos</option>${tiposUnidade.map(t => `<option>${UI.escaparHtml(t)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>DEA</label>
            <select id="sofFiltroDea"><option value="">Todas</option><option>SIM</option><option>NÃO</option></select>
          </div>
          <div class="campo"><label>Fonte</label>
            <select id="sofFiltroFonte"><option value="">Todas</option>${OPCOES_FONTE.map(f => `<option>${f}</option>`).join('')}</select>
          </div>
          <button class="botao" id="btnFiltrarSof">Filtrar</button>
          <button class="botao" id="btnExportarSof">Exportar CSV</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoSof">+ Nova SOF</button>
        </div>
        <div id="listaSof"></div>
        <div class="paginacao" id="paginacaoSof"></div>
      </div>`;

    document.getElementById('btnFiltrarSof').addEventListener('click', () => { paginaAtual = 1; carregar(); });
    document.getElementById('sofBusca').addEventListener('keydown', e => { if (e.key === 'Enter') { paginaAtual = 1; carregar(); } });
    document.getElementById('btnNovoSof').addEventListener('click', async function () {
      this.disabled = true;
      try { await abrirFormulario(); } finally { this.disabled = false; }
    });
    document.getElementById('btnExportarSof').addEventListener('click', exportarCsv);
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('sofBusca').value.trim(),
      unidade_id: document.getElementById('sofFiltroUnidade').value,
      oss: document.getElementById('sofFiltroOss').value.trim(),
      objeto: document.getElementById('sofFiltroObjeto').value.trim(),
      tipo_unidade: document.getElementById('sofFiltroTipoUnidade').value,
      dea: document.getElementById('sofFiltroDea').value,
      fonte: document.getElementById('sofFiltroFonte').value
    };
  }

  async function carregar() {
    const resposta = await Api.chamar('listarSof', Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtrosAtuais()));
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

  const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  function renderCards() {
    const alvo = document.getElementById('listaSof');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum processo de SOF encontrado.</p>'; return; }
    alvo.innerHTML = `<div class="grade-cards-sof">${itens.map(s => {
      const unidade = unidades.find(u => u.id === s.unidade_id);
      const pct = percentualAndamento(s);
      const numerosNe = (s.notas_empenho_numeros || []).filter(Boolean);
      return `
        <div class="cartao-sof ${s.destacar_parado ? 'parado' : ''}" data-id="${s.id}">
          <div class="cartao-sof-acoes">
            <button type="button" class="botao-icone editar" data-acao="editar" title="Editar">${ICONE_LAPIS}</button>
            <button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button>
          </div>
          <div class="cartao-sof-corpo">
            <div class="cartao-sof-cabecalho">
              <h3>${UI.escaparHtml(unidade ? unidade.nome : s.unidade_id)}</h3>
              <span class="cartao-sof-total">${UI.formatarMoeda(s.total_solicitado)}</span>
            </div>
            ${(s.fontes || []).length ? `<div class="cartao-sof-fontes">${(s.fontes || []).map(f => `
              <div class="cartao-sof-fonte-linha"><span>${UI.escaparHtml(f.fonte)}</span><span>${UI.formatarMoeda(f.total_solicitado)}</span></div>
            `).join('')}</div>` : ''}
            <p class="cartao-sof-objeto">${UI.escaparHtml(s.objeto || '-')}</p>
            <div class="cartao-sof-meta">
              <span>Nº SOF: <strong>${UI.escaparHtml(s.sof_numero || '-')}</strong></span>
              ${s.destacar_parado ? '<span class="selo amarelo">Parado</span>' : ''}
              ${s.possui_ne
                ? `<span class="selo verde">NE ${numerosNe.length ? UI.escaparHtml(numerosNe.join(', ')) : 'emitida'}</span>`
                : '<span class="selo amarelo">NE pendente</span>'}
            </div>
            <div class="cartao-sof-andamento">
              <div class="cartao-sof-andamento-topo">
                <span>${UI.escaparHtml(s.andamento || '-')}</span>
                <span>${pct}%</span>
              </div>
              <div class="barra-progresso"><div class="barra-progresso-preenchimento ${pct >= 100 ? 'completo' : ''}" style="width:${pct}%"></div></div>
            </div>
          </div>
        </div>`;
    }).join('')}</div>`;

    alvo.querySelectorAll('.cartao-sof').forEach(cartao => {
      const id = cartao.dataset.id;
      cartao.querySelector('.cartao-sof-corpo').addEventListener('click', () => abrirSofExistente(id));
      cartao.querySelector('.botao-icone.editar').addEventListener('click', e => { e.stopPropagation(); abrirSofExistente(id); });
      cartao.querySelector('.botao-icone.excluir').addEventListener('click', e => {
        e.stopPropagation();
        excluirSofClique(itens.find(i => i.id === id));
      });
    });
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
      const podeAbrir = await EdicaoSimultanea.entrarEmEdicao('SOF', id);
      if (!podeAbrir) return;
      // O card já tem tudo que obterSof devolveria (fontes, total, destaque de
      // "parado" - listarSof calcula os 3 pra montar o próprio card), então
      // reaproveita "itens" em vez de pedir de novo ao backend - mesmo padrão
      // já usado em abrirReciboExistente (js/recibos.js). Isso elimina uma
      // requisição inteira do caminho crítico de abrir a edição (cada
      // requisição ao Apps Script Web App tem um piso de latência considerável,
      // então menos requisições por ação pesa mais que otimizar o que cada uma
      // faz por dentro - ver PROGRESS.md, seção de Performance).
      // marcarSofVisualizado é só informativo e não precisa bloquear a abertura.
      const sof = itens.find(s => s.id === id);
      Api.chamar('marcarSofVisualizado', { id }, { silencioso: true }).catch(() => {});
      const notasPromise = Api.chamar('listarNotasEmpenhoPorSof', { sofId: id }).catch(() => []);
      await abrirFormulario(sof, notasPromise);
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
          <div class="campo"><label>OSS</label><input id="sofOss" value="${UI.escaparHtml(snapshot.oss_snapshot)}" /></div>
          <div class="campo"><label>CNPJ</label><input id="sofCnpj" value="${UI.escaparHtml(snapshot.cnpj_snapshot)}" /></div>
          <div class="campo"><label>Contrato de Gestão</label><input id="sofContrato" value="${UI.escaparHtml(snapshot.contrato_snapshot)}" /></div>
          <div class="campo"><label>Ação</label><input id="sofAcao" value="${UI.escaparHtml(snapshot.acao_snapshot)}" /></div>
          <div class="campo"><label>Subação</label><input id="sofSubacao" value="${UI.escaparHtml(snapshot.subacao_snapshot)}" /></div>
          <div class="campo"><label>G.D.</label><input id="sofGd" value="${UI.escaparHtml(snapshot.gd_snapshot)}" /></div>
          <div class="campo"><label>SEI</label><input id="sofSei" value="${UI.escaparHtml(sof ? sof.sei : '')}" placeholder="0000000000.000000/0000-00" /></div>
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
        <div class="campo"><label>Andamento</label>
          <div id="stepperAndamento">${editando ? '' : '<p class="ajuda">Disponível depois que o processo for salvo.</p>'}</div>
        </div>
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
      document.getElementById('sofCnpj').value = preenchido.cnpj_snapshot;
      document.getElementById('sofContrato').value = preenchido.contrato_snapshot;
      document.getElementById('sofAcao').value = preenchido.acao_snapshot;
      document.getElementById('sofSubacao').value = preenchido.subacao_snapshot;
      document.getElementById('sofGd').value = preenchido.gd_snapshot;
    });

    document.getElementById('btnCancelarSof').addEventListener('click', UI.fecharModal);

    document.getElementById('btnSalvarSof').addEventListener('click', () => salvarSof(sof));

    if (editando) {
      atualizarStepperVisual(sof);
      await renderNotasEmpenho(sof, notasPromise);
    }
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

  async function salvarSof(sofExistente) {
    const erroEl = document.getElementById('sofErro');
    erroEl.classList.add('oculto');
    const dados = coletarDadosFormulario();
    if (!dados.unidade_id && !sofExistente) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }
    const mensagemObrigatorio = validarCamposObrigatorios();
    if (mensagemObrigatorio) { UI.mostrarErro(erroEl, mensagemObrigatorio); return; }

    try {
      let resposta;
      if (sofExistente) resposta = await Api.chamar('atualizarSof', { id: sofExistente.id, data: dados });
      else resposta = await Api.chamar('criarSof', { data: dados });

      UI.toast('SOF salvo com sucesso.', 'sucesso');
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
        <thead><tr><th>Tipo</th><th>Número</th><th>Fonte</th><th>Valor</th><th>Período</th><th>Arquivo</th></tr></thead>
        <tbody>${notas.map(n => `<tr><td>${n.tipo}</td><td>${UI.escaparHtml(n.numero_ne || '-')}</td><td>${UI.escaparHtml(n.fonte || '-')}</td><td>${UI.formatarMoeda(n.valor)}</td><td>${UI.escaparHtml(n.periodo)}</td><td>${n.arquivo_url ? `<a href="${UI.escaparHtml(n.arquivo_url)}" target="_blank" rel="noopener">Ver arquivo</a>` : '-'}</td></tr>`).join('') || '<tr><td colspan="6" class="estado-vazio">Nenhuma NE vinculada ainda.</td></tr>'}</tbody>
      </table>
      <div class="grade-3" style="margin-top:10px">
        <div class="campo"><label>Tipo</label><select id="neTipo"><option value="original">Original</option><option value="reforco">Reforço</option></select></div>
        <div class="campo"><label>Número *</label><div id="neNumeroContainer">${camposNumeroNeHtml(notas, 'original')}</div></div>
        <div class="campo"><label>Fonte *</label><select id="neFonte"><option value="">-</option>${fontesDisponiveis.map(f => `<option>${UI.escaparHtml(f)}</option>`).join('')}</select></div>
      </div>
      <div class="grade-3">
        <div class="campo"><label>Valor</label><input id="neValor" type="number" step="0.01" /></div>
      </div>
      <div class="campo"><label>Arquivo da Nota de Empenho *</label><input type="file" id="neArquivo" accept=".pdf,image/*" required /></div>
      <button class="botao sucesso" id="btnAddNe">Adicionar Nota de Empenho</button>
      <p id="neErro" class="erro-campo oculto"></p>`;

    document.getElementById('neTipo').addEventListener('change', function () {
      document.getElementById('neNumeroContainer').innerHTML = camposNumeroNeHtml(notas, this.value);
    });

    document.getElementById('btnAddNe').addEventListener('click', async () => {
      const erroEl = document.getElementById('neErro');
      erroEl.classList.add('oculto');
      const arquivoInput = document.getElementById('neArquivo');
      const arquivo = arquivoInput.files[0];
      if (!arquivo) { UI.mostrarErro(erroEl, 'Anexe o arquivo da Nota de Empenho.'); return; }
      if (arquivo.size > 8 * 1024 * 1024) { UI.mostrarErro(erroEl, 'Arquivo muito grande (máximo 8MB).'); return; }
      const numeroEl = document.getElementById('neNumero');
      if (!numeroEl || !numeroEl.value.trim()) { UI.mostrarErro(erroEl, 'Informe o número da Nota de Empenho.'); return; }
      const fonte = document.getElementById('neFonte').value;
      if (!fonte) { UI.mostrarErro(erroEl, 'Selecione a fonte da Nota de Empenho.'); return; }

      try {
        const arquivoBase64 = await UI.lerArquivoBase64(arquivo);
        const tipo = document.getElementById('neTipo').value;
        await Api.chamar('criarNotaEmpenho', {
          data: {
            sof_id: sof.id, tipo, numero_ne: numeroEl.value.trim(), fonte, valor: document.getElementById('neValor').value,
            arquivoBase64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type
          }
        });
        UI.toast('Nota de Empenho adicionada.', 'sucesso');
        await renderNotasEmpenho(sof);
        if (tipo === 'original' && sof.andamento !== 'NE EMITIDA') {
          sof.possui_ne = true;
          await avancarEtapa(sof, 'NE EMITIDA');
        }
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /**
   * Monta o HTML do stepper de Andamento (13 etapas fixas). Navegação é livre
   * (qualquer nó, pra frente ou pra trás) — a única trava é o nó "NE EMITIDA",
   * que só fica clicável depois que o SOF tiver uma Nota de Empenho anexada.
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

  function atualizarStepperVisual(sof) {
    const alvo = document.getElementById('stepperAndamento');
    if (!alvo) return;
    alvo.innerHTML = stepperHtml(sof);
    alvo.querySelectorAll('.stepper-marcador').forEach(btn => {
      btn.addEventListener('click', () => avancarEtapa(sof, btn.dataset.etapa));
    });
  }

  async function avancarEtapa(sof, etapa) {
    const erroEl = document.getElementById('sofErro');
    if (etapa === 'NE EMITIDA' && !sof.possui_ne) {
      UI.mostrarErro(erroEl, 'Anexe a Nota de Empenho na seção abaixo para avançar esta etapa.');
      const secao = document.getElementById('secaoNotasEmpenho');
      if (secao) secao.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    try {
      await Api.chamar('atualizarSof', { id: sof.id, data: { andamento: etapa } });
      sof.andamento = etapa;
      atualizarStepperVisual(sof);
      UI.toast('Andamento atualizado.', 'sucesso');
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
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
