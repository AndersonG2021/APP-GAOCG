/**
 * GAOCG App - Metas Mensais de Processos (tela de manutenção).
 * Ver docs/ESPECIFICACAO_METAS_PROCESSOS.md - uma linha por combinação
 * Unidade+Objeto, valendo como padrão todo mês até ser editada (sem
 * competência própria). Alimenta o painel "Processos do mês" do Dashboard
 * (js/dashboard.js). Mesmo padrão de tela de js/listas.js/js/unidades.js
 * (lista + modal de criar/editar + inativar/reativar em vez de excluir).
 */

const TelaMetasProcessos = (function () {
  const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICONE_RESTAURAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  const ICONE_PAUSA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

  let unidades = [];
  let opcoesObjeto = [];
  let metas = [];
  let mostrarInativas = false;

  async function render() {
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Metas de Processos</h2>
      <p class="dash-subtitulo">Quantidade de processos esperada por mês, por unidade e objeto - alimenta o painel "Processos do mês" no Dashboard.</p>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="metaFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="metaFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="metaFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="metaFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--cinza-700)">
            <input type="checkbox" id="metaMostrarInativas" /> Mostrar pausadas
          </label>
          <button class="botao" id="btnFiltrarMetas">Filtrar</button>
          <span style="flex:1"></span>
          <button class="botao" id="btnImportarMetas">Importar lista</button>
          <button class="botao primario" id="btnNovaMeta">+ Nova meta</button>
        </div>
        <div id="listaMetas"><p class="estado-vazio">Carregando…</p></div>
      </div>`;

    const [unidadesResp, objetos] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    unidades = unidadesResp.items;
    opcoesObjeto = objetos;

    UI.criarFiltroMultiplo('metaFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('metaFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.ligarLimpezaFiltros('.barra-filtros', null, carregar);
    document.getElementById('btnFiltrarMetas').addEventListener('click', carregar);
    document.getElementById('metaMostrarInativas').addEventListener('change', e => { mostrarInativas = e.target.checked; carregar(); });
    document.getElementById('btnNovaMeta').addEventListener('click', () => abrirFormulario());
    document.getElementById('btnImportarMetas').addEventListener('click', abrirImportacao);

    await carregar();
  }

  function filtrosAtuais_() {
    return {
      unidadeIds: UI.valoresFiltroMultiplo('metaFiltroUnidade'),
      objetos: UI.valoresFiltroMultiplo('metaFiltroObjeto'),
      incluirInativas: mostrarInativas
    };
  }

  async function carregar() {
    const params = filtrosAtuais_();
    metas = await CacheAbas.comRevalidacao('metasProcessos', params,
      (op) => Api.chamar('listarMetasProcessos', params, op),
      (novasMetas) => { metas = novasMetas; renderTabela(); }
    );
    renderTabela();
  }

  function renderTabela() {
    const alvo = document.getElementById('listaMetas');
    if (!metas.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma meta cadastrada ainda. Use "+ Nova meta" ou "Importar lista".</p>';
      return;
    }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Unidade</th><th>Objeto</th><th>Quantidade esperada / mês</th><th>Situação</th><th></th></tr></thead>
        <tbody>${metas.map(m => `
          <tr data-id="${m.id}">
            <td>${UI.escaparHtml(m.unidade_nome)}</td>
            <td>${UI.escaparHtml(m.objeto)}</td>
            <td>${Number(m.quantidade_esperada)}</td>
            <td>${m.ativo ? '<span class="selo verde">Ativa</span>' : '<span class="selo cinza">Pausada</span>'}</td>
            <td class="tabela-acoes">
              <button type="button" class="botao-icone editar" data-acao="editar" title="Editar">${ICONE_LAPIS}</button>
              ${m.ativo
                ? `<button type="button" class="botao-icone" data-acao="pausar" title="Pausar">${ICONE_PAUSA}</button>`
                : `<button type="button" class="botao-icone" data-acao="reativar" title="Reativar">${ICONE_RESTAURAR}</button>`}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      const meta = metas.find(m => m.id === tr.dataset.id);
      tr.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirFormulario(meta));
      const btnPausar = tr.querySelector('[data-acao="pausar"]');
      if (btnPausar) btnPausar.addEventListener('click', () => confirmarPausa(meta));
      const btnReativar = tr.querySelector('[data-acao="reativar"]');
      if (btnReativar) btnReativar.addEventListener('click', () => reativar(meta));
    });
  }

  function invalidarTudo_() {
    Api.invalidarCache('listarMetasProcessos');
    CacheAbas.invalidar('metasProcessos');
  }

  function confirmarPausa(meta) {
    const corpo = `<p>Pausar a meta de <strong>${UI.escaparHtml(meta.unidade_nome)} / ${UI.escaparHtml(meta.objeto)}</strong>? Ela deixa de contar no painel "Processos do mês" até ser reativada.</p>`;
    UI.abrirModal('Pausar meta', corpo,
      `<button class="botao" id="btnCancelarPausa">Cancelar</button><button class="botao perigo" id="btnConfirmarPausa">Pausar</button>`,
      { pequeno: true });
    document.getElementById('btnCancelarPausa').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarPausa').addEventListener('click', async () => {
      try {
        await Api.chamar('inativarMetaProcesso', { id: meta.id });
        invalidarTudo_();
        UI.toast('Meta pausada.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  async function reativar(meta) {
    try {
      await Api.chamar('reativarMetaProcesso', { id: meta.id });
      invalidarTudo_();
      UI.toast('Meta reativada.', 'sucesso');
      await carregar();
    } catch (err) {
      UI.toast(err.message, 'erro');
    }
  }

  /** metaExistente omitida = criação; passada = edição (reaproveita atualizarMetaProcesso). */
  function abrirFormulario(metaExistente) {
    const corpo = `
      <form id="formMeta">
        <div class="campo">
          <label>Unidade *</label>
          <select id="metaUnidade" required ${metaExistente ? 'disabled' : ''}>
            <option value="">Selecione...</option>
            ${unidades.map(u => `<option value="${u.id}" ${metaExistente && metaExistente.unidade_id === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label>Objeto *</label>
          <select id="metaObjeto" required ${metaExistente ? 'disabled' : ''}>
            <option value="">Selecione...</option>
            ${opcoesObjeto.map(o => `<option value="${UI.escaparHtml(o.valor)}" ${metaExistente && metaExistente.objeto === o.valor ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label>Quantidade esperada por mês *</label>
          <input id="metaQuantidade" type="number" min="1" step="1" value="${metaExistente ? Number(metaExistente.quantidade_esperada) : ''}" required />
        </div>
        ${metaExistente ? '<p class="ajuda">Unidade e objeto não podem ser trocados numa meta existente - pause esta e crie uma nova, se precisar mudar a combinação.</p>' : ''}
        <p id="metaErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal(metaExistente ? 'Editar meta' : 'Nova meta', corpo,
      `<button class="botao" id="btnCancelarMeta">Cancelar</button><button class="botao primario" id="btnSalvarMeta">Salvar</button>`,
      { pequeno: true });

    if (!metaExistente) { UI.tornarPesquisavel('metaUnidade'); UI.tornarPesquisavel('metaObjeto'); }

    document.getElementById('btnCancelarMeta').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarMeta').addEventListener('click', async () => {
      if (metaExistente && !UI.modalFoiEditado()) { UI.fecharModal(); return; }
      const erroEl = document.getElementById('metaErro');
      erroEl.classList.add('oculto');

      const quantidade = parseInt(document.getElementById('metaQuantidade').value, 10);
      if (!quantidade || quantidade < 1) { UI.mostrarErro(erroEl, 'Informe uma quantidade esperada de pelo menos 1.'); return; }

      try {
        if (metaExistente) {
          await Api.chamar('atualizarMetaProcesso', { id: metaExistente.id, data: { quantidade_esperada: quantidade } });
          UI.toast('Meta atualizada.', 'sucesso');
        } else {
          const unidadeId = document.getElementById('metaUnidade').value;
          const objeto = document.getElementById('metaObjeto').value;
          if (!unidadeId) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }
          if (!objeto) { UI.mostrarErro(erroEl, 'Selecione o objeto.'); return; }
          await Api.chamar('criarMetaProcesso', { data: { unidade_id: unidadeId, objeto, quantidade_esperada: quantidade } });
          UI.toast('Meta criada.', 'sucesso');
        }
        invalidarTudo_();
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /**
   * Importação em lote (seção 5.1 da especificação): textarea onde o usuário
   * cola "Unidade;Objeto;Quantidade" (uma combinação por linha - aceita ";"
   * ou tab, pra colar direto do Excel/Sheets). Mostra o resumo por linha
   * ANTES do usuário fechar o modal, pra revisar erros de nome de unidade
   * não encontrada etc.
   */
  function abrirImportacao() {
    const corpo = `
      <p class="ajuda">Uma combinação por linha, no formato <code>Unidade;Objeto;Quantidade</code> (ou colada direto do Excel/Sheets, separada por tab). Se a combinação já tiver uma meta ativa, a quantidade é atualizada; senão, uma meta nova é criada.</p>
      <div class="campo">
        <textarea id="metaImportTexto" rows="10" placeholder="Hospital Getúlio Vargas;CONTRATO DE GESTÃO (TES);1&#10;UPA Caruaru;CONTRATO DE GESTÃO (SUS);1"></textarea>
      </div>
      <div id="metaImportResultado"></div>
      <p id="metaImportErro" class="erro-campo oculto"></p>`;
    UI.abrirModal('Importar lista de metas', corpo,
      `<button class="botao" id="btnFecharImportacao">Fechar</button><button class="botao primario" id="btnProcessarImportacao">Processar</button>`);

    document.getElementById('btnFecharImportacao').addEventListener('click', async () => { UI.fecharModal(); await carregar(); });
    document.getElementById('btnProcessarImportacao').addEventListener('click', async () => {
      const erroEl = document.getElementById('metaImportErro');
      erroEl.classList.add('oculto');
      const texto = document.getElementById('metaImportTexto').value;
      const linhas = texto.split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
          const partes = l.split(/;|\t/).map(p => p.trim());
          return { unidade: partes[0] || '', objeto: partes[1] || '', quantidade: partes[2] || '' };
        });
      if (!linhas.length) { UI.mostrarErro(erroEl, 'Cole ao menos uma linha antes de processar.'); return; }

      try {
        const resposta = await Api.chamar('importarMetasProcessosLote', { linhas });
        invalidarTudo_();
        document.getElementById('metaImportResultado').innerHTML = renderResultadoImportacao_(resposta.resultado);
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  function renderResultadoImportacao_(resultado) {
    const seloPorStatus = { criada: 'verde', atualizada: 'azul', sem_alteracao: 'cinza', erro: 'vermelho' };
    const rotuloPorStatus = { criada: 'Criada', atualizada: 'Atualizada', sem_alteracao: 'Sem alteração', erro: 'Erro' };
    return `
      <table class="tabela">
        <thead><tr><th>Linha</th><th>Resultado</th><th>Detalhe</th></tr></thead>
        <tbody>${resultado.map(r => `
          <tr>
            <td>${r.linha}</td>
            <td><span class="selo ${seloPorStatus[r.status] || 'cinza'}">${rotuloPorStatus[r.status] || r.status}</span></td>
            <td>${UI.escaparHtml(r.mensagem)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  return { render };
})();
