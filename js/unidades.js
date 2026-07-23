/**
 * GAOCG App - Cadastro Mestre de Unidades (Funcionalidade 2), incluindo o
 * Valor do Contrato de Gestão e os Termos Aditivos (T.A.s) vinculados.
 */

const TelaUnidades = (function () {
  const OPCOES_TIPO = ['UPA', 'UPAE', 'Hospital', 'Carreta', 'Outro'];
  let unidades = [];
  let todasUnidades = []; // sem filtro nenhum - só pra popular o dropdown do filtro "Unidade", separado da lista filtrada exibida nos cartões
  let linhasTas = [];
  let ultimoFiltroJson = null;
  let paginaAtual = 1;
  let totalRegistros = 0;
  const TAMANHO_PAGINA = 20;

  const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  const ICONE_RESTAURAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

  async function render() {
    const [opcoesOss, todasUnidadesCarregadas] = await Promise.all([
      TelaListas.obterOpcoes('OSS'),
      Api.chamar('listarUnidades', { pageSize: 100000 }, { cache: true })
    ]);
    todasUnidades = todasUnidadesCarregadas.items;
    const container = document.getElementById('conteudo');
    container.innerHTML = `
      <h2 class="titulo-tela">Unidades</h2>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="uniBusca" placeholder="nome, OSS, CNPJ..." /></div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="uniFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="uniFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo</label>
            <div id="uniFiltroTipo"></div><button type="button" class="filtro-multiplo-x" data-alvo="uniFiltroTipo" title="Limpar filtro de Tipo">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="uniFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="uniFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <label style="align-self:center;font-size:13px;white-space:nowrap"><input type="checkbox" id="chkSomenteAtivas" checked /> Somente ativas</label>
          <button class="botao" id="btnFiltrarUni">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosUni">Limpar filtros</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovaUnidade">+ Nova unidade</button>
        </div>
        <div id="listaUnidades"></div>
        <div class="paginacao" id="paginacaoUni"></div>
      </div>`;

    document.getElementById('btnNovaUnidade').addEventListener('click', () => abrirFormulario());
    document.getElementById('chkSomenteAtivas').addEventListener('change', () => { paginaAtual = 1; carregar(); });
    document.getElementById('btnFiltrarUni').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('uniBusca').addEventListener('keydown', e => { if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    UI.criarFiltroMultiplo('uniFiltroUnidade', todasUnidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('uniFiltroTipo', OPCOES_TIPO);
    UI.criarFiltroMultiplo('uniFiltroOss', opcoesOss.map(o => o.valor));
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosUni', () => {
      document.getElementById('uniBusca').value = '';
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    });
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('uniBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('uniFiltroUnidade'),
      tipo: UI.valoresFiltroMultiplo('uniFiltroTipo'),
      oss: UI.valoresFiltroMultiplo('uniFiltroOss'),
      somenteAtivas: document.getElementById('chkSomenteAtivas').checked
    };
  }

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  async function carregar() {
    const filtros = filtrosAtuais();
    ultimoFiltroJson = JSON.stringify(filtros);
    const resposta = await Api.chamar('listarUnidades', Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtros));
    unidades = resposta.items;
    totalRegistros = resposta.total;
    renderCards();
    renderPaginacao();
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / TAMANHO_PAGINA));
    document.getElementById('paginacaoUni').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="botoes">
        <button class="botao" id="uniPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="uniPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('uniPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('uniPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
  }

  function detalheTasHtml(unidade) {
    const linhasTasHtml = (unidade.tas || []).length
      ? unidade.tas.map(t => `<div class="cartao-unidade-detalhe-linha"><span>${UI.escaparHtml(t.objeto_ta || '-')} (T.A. ${UI.escaparHtml(t.numero_ta || '-')})</span><span>${UI.formatarMoeda(t.valor_ta)}</span></div>`).join('')
      : '<p class="ajuda">Nenhum Termo Aditivo cadastrado.</p>';
    return `
      <div class="cartao-unidade-detalhe oculto">
        <div class="cartao-unidade-detalhe-linha"><span>Valor do C.G.</span><span>${UI.formatarMoeda(unidade.valor_contrato_gestao)}</span></div>
        ${linhasTasHtml}
      </div>`;
  }

  function renderCards() {
    const alvo = document.getElementById('listaUnidades');
    if (!unidades.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma unidade cadastrada.</p>';
      return;
    }
    alvo.innerHTML = `<div class="grade-cards-unidade">${unidades.map(u => `
      <div class="cartao-unidade ${u.ativo ? '' : 'inativa'}" data-id="${u.id}">
        <div class="cartao-unidade-acoes">
          <button type="button" class="botao-icone editar" data-acao="editar" title="Editar">${ICONE_LAPIS}</button>
          ${u.ativo
            ? `<button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button>`
            : `<button type="button" class="botao-icone" data-acao="restaurar" title="Restaurar">${ICONE_RESTAURAR}</button>`}
        </div>
        <div class="cartao-unidade-corpo">
          <div class="cartao-unidade-cabecalho">
            <h3>${UI.escaparHtml(u.nome)}</h3>
            <span class="cartao-unidade-parcela">Parcela mensal: ${UI.formatarMoeda(u.parcela_mensal_total)}</span>
          </div>
          <div class="cartao-unidade-meta">${UI.escaparHtml(u.tipo || '-')} · OSS ${UI.escaparHtml(u.oss || '-')} · ${UI.escaparHtml(u.cnpj || '-')}</div>
          ${detalheTasHtml(u)}
        </div>
      </div>`).join('')}</div>`;

    alvo.querySelectorAll('.cartao-unidade').forEach(cartao => {
      const id = cartao.dataset.id;
      const unidade = unidades.find(u => u.id === id);

      cartao.querySelector('.cartao-unidade-corpo').addEventListener('click', () => {
        cartao.querySelector('.cartao-unidade-detalhe').classList.toggle('oculto');
      });
      cartao.querySelector('[data-acao="editar"]').addEventListener('click', e => {
        e.stopPropagation();
        abrirFormulario(unidade);
      });
      const btnExcluir = cartao.querySelector('[data-acao="excluir"]');
      if (btnExcluir) btnExcluir.addEventListener('click', e => { e.stopPropagation(); confirmarExclusao(unidade); });
      const btnRestaurar = cartao.querySelector('[data-acao="restaurar"]');
      if (btnRestaurar) btnRestaurar.addEventListener('click', async e => {
        e.stopPropagation();
        await Api.chamar('reativarUnidade', { id: unidade.id });
        Api.invalidarCache('listarUnidades');
        UI.toast('Unidade restaurada.', 'sucesso');
        await carregar();
      });
    });
  }

  /** Confirmação grande e em destaque - exclusão é lógica (ativo=false), a unidade some do painel mas não do banco. */
  function confirmarExclusao(unidade) {
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ESSA UNIDADE E TODOS OS SEUS DADOS? SE FIZER ISSO NENHUM USUÁRIO TERÁ ACESSO A ESSAS INFORMAÇÕES!</p>`;
    UI.abrirModal('Excluir unidade', corpo,
      `<button class="botao" id="btnCancelarExclusao">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusao">Excluir</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarExclusao').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusao').addEventListener('click', async () => {
      try {
        await Api.chamar('inativarUnidade', { id: unidade.id });
        Api.invalidarCache('listarUnidades');
        UI.toast('Unidade excluída.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  /** Lê as linhas de T.A. direto do DOM (fonte da verdade entre re-renders) - mesmo padrão de lerLinhasFontesDoDom_ em js/sof.js. */
  function lerLinhasTasDoDom_() {
    return Array.from(document.querySelectorAll('#tasContainer .linha-fonte')).map(linha => ({
      objeto_ta: linha.querySelector('.linha-ta-objeto').value,
      numero_ta: linha.querySelector('.linha-ta-numero').value,
      valor_ta: linha.querySelector('.linha-ta-valor').value
    }));
  }

  function linhaTaHtml(item, indice) {
    return `
      <div class="linha-fonte" data-indice="${indice}">
        <div class="campo"><label>Objeto do T.A.</label><input class="linha-ta-objeto" value="${UI.escaparHtml(item.objeto_ta || '')}" placeholder="Ex.: T.E.A. ou Aquisição de Equipamentos" /></div>
        <div class="campo"><label>Nº do T.A.</label><input class="linha-ta-numero" value="${UI.escaparHtml(item.numero_ta || '')}" placeholder="Ex.: 1º" /></div>
        <div class="campo"><label>Valor do T.A.</label><input class="linha-ta-valor" type="number" step="0.01" value="${item.valor_ta || ''}" /></div>
        <button type="button" class="botao-icone linha-fonte-remover" title="Remover T.A.">&times;</button>
      </div>`;
  }

  function renderTasFormulario() {
    const alvo = document.getElementById('tasContainer');
    alvo.innerHTML = linhasTas.map((item, i) => linhaTaHtml(item, i)).join('');
    alvo.querySelectorAll('.linha-fonte-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        linhasTas = lerLinhasTasDoDom_();
        const indice = Number(btn.closest('.linha-fonte').dataset.indice);
        linhasTas.splice(indice, 1);
        renderTasFormulario();
      });
    });
  }

  function abrirFormulario(unidade) {
    const editando = !!unidade;
    linhasTas = (unidade && unidade.tas) ? unidade.tas.map(t => ({ objeto_ta: t.objeto_ta, numero_ta: t.numero_ta, valor_ta: t.valor_ta })) : [];

    const corpo = `
      <form id="formUnidade">
        <div class="grade-2">
          <div class="campo"><label>Nome *</label><input id="uNome" value="${UI.escaparHtml(unidade ? unidade.nome : '')}" required /></div>
          <div class="campo"><label>Tipo</label>
            <select id="uTipo">
              ${OPCOES_TIPO.map(t => `<option ${unidade && unidade.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>OSS</label><input id="uOss" value="${UI.escaparHtml(unidade ? unidade.oss : '')}" /></div>
          <div class="campo"><label>CNPJ *</label><input id="uCnpj" value="${UI.escaparHtml(unidade ? unidade.cnpj : '')}" required placeholder="00.000.000/0000-00" /></div>
          <div class="campo"><label>Contrato de Gestão *</label><input id="uContrato" value="${UI.escaparHtml(unidade ? unidade.contrato_gestao : '')}" required /></div>
          <div class="campo"><label>Valor do C.G.</label><input id="uValorContratoGestao" type="number" step="0.01" value="${unidade && unidade.valor_contrato_gestao ? unidade.valor_contrato_gestao : ''}" /></div>
          <div class="campo"><label>Classificação Orçamentária</label><input id="uClassificacao" value="${UI.escaparHtml(unidade ? unidade.classificacao_orcamentaria : '')}" /></div>
          <div class="campo"><label>Ação</label><input id="uAcao" value="${UI.escaparHtml(unidade ? unidade.acao : '')}" /></div>
          <div class="campo"><label>Subação</label><input id="uSubacao" value="${UI.escaparHtml(unidade ? unidade.subacao : '')}" /></div>
          <div class="campo"><label>G.D.</label><input id="uGd" value="${UI.escaparHtml(unidade ? unidade.gd : '')}" /></div>
        </div>
        <div class="campo">
          <label>Termos Aditivos (T.A.)</label>
          <div id="tasContainer" class="linhas-fonte"></div>
          <button type="button" class="botao" id="btnAdicionarTa">+ Adicionar parcela mensal</button>
        </div>
        <p id="uErro" class="erro-campo oculto"></p>
      </form>`;
    const rodape = `
      <button class="botao" id="btnCancelarUnidade">Cancelar</button>
      <button class="botao primario" id="btnSalvarUnidade">Salvar</button>`;

    UI.abrirModal(editando ? 'Editar unidade' : 'Nova unidade', corpo, rodape);
    document.getElementById('btnCancelarUnidade').addEventListener('click', UI.fecharModal);

    renderTasFormulario();
    document.getElementById('btnAdicionarTa').addEventListener('click', () => {
      linhasTas = lerLinhasTasDoDom_();
      linhasTas.push({ objeto_ta: '', numero_ta: '', valor_ta: '' });
      renderTasFormulario();
    });

    document.getElementById('btnSalvarUnidade').addEventListener('click', async () => {
      const erroEl = document.getElementById('uErro');
      erroEl.classList.add('oculto');
      const dados = {
        nome: document.getElementById('uNome').value.trim(),
        tipo: document.getElementById('uTipo').value,
        oss: document.getElementById('uOss').value.trim(),
        cnpj: document.getElementById('uCnpj').value.trim(),
        contrato_gestao: document.getElementById('uContrato').value.trim(),
        valor_contrato_gestao: document.getElementById('uValorContratoGestao').value,
        classificacao_orcamentaria: document.getElementById('uClassificacao').value.trim(),
        acao: document.getElementById('uAcao').value.trim(),
        subacao: document.getElementById('uSubacao').value.trim(),
        gd: document.getElementById('uGd').value.trim(),
        tas: lerLinhasTasDoDom_()
      };
      try {
        if (editando) await Api.chamar('atualizarUnidade', { id: unidade.id, data: dados });
        else await Api.chamar('criarUnidade', { data: dados });
        Api.invalidarCache('listarUnidades');
        UI.toast('Unidade salva com sucesso.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  return { render };
})();
