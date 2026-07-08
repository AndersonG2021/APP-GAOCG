/**
 * GAOCG App - Cadastro Mestre de Unidades (Funcionalidade 2).
 */

const TelaUnidades = (function () {
  let unidades = [];

  async function render() {
    const container = document.getElementById('conteudo');
    container.innerHTML = `
      <h2 class="titulo-tela">Unidades</h2>
      <div class="painel">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <label style="font-size:13px"><input type="checkbox" id="chkSomenteAtivas" checked /> Somente ativas</label>
          <button class="botao primario" id="btnNovaUnidade">+ Nova unidade</button>
        </div>
        <div id="listaUnidades"></div>
      </div>`;

    document.getElementById('btnNovaUnidade').addEventListener('click', () => abrirFormulario());
    document.getElementById('chkSomenteAtivas').addEventListener('change', carregar);
    await carregar();
  }

  async function carregar() {
    const somenteAtivas = document.getElementById('chkSomenteAtivas').checked;
    unidades = await Api.chamar('listarUnidades', { somenteAtivas });
    renderTabela();
  }

  function renderTabela() {
    const alvo = document.getElementById('listaUnidades');
    if (!unidades.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma unidade cadastrada.</p>';
      return;
    }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Nome</th><th>Tipo</th><th>OSS</th><th>CNPJ</th><th>Contrato de Gestão</th><th>Ativo</th></tr></thead>
        <tbody>${unidades.map(u => `
          <tr data-id="${u.id}">
            <td>${UI.escaparHtml(u.nome)}</td>
            <td>${UI.escaparHtml(u.tipo)}</td>
            <td>${UI.escaparHtml(u.oss)}</td>
            <td>${UI.escaparHtml(u.cnpj)}</td>
            <td>${UI.escaparHtml(u.contrato_gestao)}</td>
            <td>${u.ativo ? '<span class="selo verde">Ativa</span>' : '<span class="selo cinza">Inativa</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => abrirFormulario(unidades.find(u => u.id === tr.dataset.id)));
    });
  }

  function abrirFormulario(unidade) {
    const editando = !!unidade;
    const corpo = `
      <form id="formUnidade">
        <div class="grade-2">
          <div class="campo"><label>Nome *</label><input id="uNome" value="${UI.escaparHtml(unidade ? unidade.nome : '')}" required /></div>
          <div class="campo"><label>Tipo</label>
            <select id="uTipo">
              ${['UPA', 'UPAE', 'Hospital', 'Carreta', 'Outro'].map(t => `<option ${unidade && unidade.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>OSS</label><input id="uOss" value="${UI.escaparHtml(unidade ? unidade.oss : '')}" /></div>
          <div class="campo"><label>CNPJ *</label><input id="uCnpj" value="${UI.escaparHtml(unidade ? unidade.cnpj : '')}" required placeholder="00.000.000/0000-00" /></div>
          <div class="campo"><label>Contrato de Gestão *</label><input id="uContrato" value="${UI.escaparHtml(unidade ? unidade.contrato_gestao : '')}" required /></div>
          <div class="campo"><label>Classificação Orçamentária</label><input id="uClassificacao" value="${UI.escaparHtml(unidade ? unidade.classificacao_orcamentaria : '')}" /></div>
          <div class="campo"><label>Ação</label><input id="uAcao" value="${UI.escaparHtml(unidade ? unidade.acao : '')}" /></div>
          <div class="campo"><label>Subação</label><input id="uSubacao" value="${UI.escaparHtml(unidade ? unidade.subacao : '')}" /></div>
          <div class="campo"><label>G.D.</label><input id="uGd" value="${UI.escaparHtml(unidade ? unidade.gd : '')}" /></div>
        </div>
        <p id="uErro" class="erro-campo oculto"></p>
      </form>`;
    const rodape = `
      ${editando ? `<button class="botao ${unidade.ativo ? 'perigo' : 'sucesso'}" id="btnToggleAtivo">${unidade.ativo ? 'Inativar' : 'Reativar'}</button>` : ''}
      <button class="botao" id="btnCancelarUnidade">Cancelar</button>
      <button class="botao primario" id="btnSalvarUnidade">Salvar</button>`;

    UI.abrirModal(editando ? 'Editar unidade' : 'Nova unidade', corpo, rodape);
    document.getElementById('btnCancelarUnidade').addEventListener('click', UI.fecharModal);

    if (editando) {
      document.getElementById('btnToggleAtivo').addEventListener('click', async () => {
        await Api.chamar(unidade.ativo ? 'inativarUnidade' : 'reativarUnidade', { id: unidade.id });
        Api.invalidarCache('listarUnidades');
        UI.toast('Unidade atualizada.', 'sucesso');
        UI.fecharModal();
        await carregar();
      });
    }

    document.getElementById('btnSalvarUnidade').addEventListener('click', async () => {
      const erroEl = document.getElementById('uErro');
      erroEl.classList.add('oculto');
      const dados = {
        nome: document.getElementById('uNome').value.trim(),
        tipo: document.getElementById('uTipo').value,
        oss: document.getElementById('uOss').value.trim(),
        cnpj: document.getElementById('uCnpj').value.trim(),
        contrato_gestao: document.getElementById('uContrato').value.trim(),
        classificacao_orcamentaria: document.getElementById('uClassificacao').value.trim(),
        acao: document.getElementById('uAcao').value.trim(),
        subacao: document.getElementById('uSubacao').value.trim(),
        gd: document.getElementById('uGd').value.trim()
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
