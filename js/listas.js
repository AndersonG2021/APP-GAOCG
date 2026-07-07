/**
 * GAOCG App - Administração das opções de "andamento" (SOF) e "status" (Recibo),
 * com escopo por frente (Funcionalidades 3, 4 e 8 - pausa_contagem_parado).
 */

const TelaListas = (function () {
  const FRENTES_SOF = ['SOF-UPA', 'SOF-UPAE', 'SOF-Hospital'];
  const FRENTES_RECIBO = ['Recibo-UPA', 'Recibo-UPAE', 'Recibo-Hospital'];
  let tipoAtual = 'ANDAMENTO_SOF';
  let opcoes = [];

  async function render() {
    const usuario = Auth.usuario();
    tipoAtual = (usuario.perfil !== 'gerente' && usuario.frente.indexOf('Recibo') === 0) ? 'STATUS_RECIBO' : 'ANDAMENTO_SOF';

    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Listas Personalizadas</h2>
      <div class="painel">
        <div class="barra-filtros">
          <button class="botao" id="tabAndamento">Andamento (SOF)</button>
          <button class="botao" id="tabStatus">Status (Recibo)</button>
          ${usuario.perfil === 'gerente' ? '' : `<span class="ajuda" style="align-self:center">Você só cria opções para sua frente (${UI.escaparHtml(usuario.frente)}); novas opções ficam visíveis só nela.</span>`}
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovaOpcao">+ Nova opção</button>
        </div>
        <div id="listaOpcoes"></div>
      </div>`;

    document.getElementById('tabAndamento').addEventListener('click', () => { tipoAtual = 'ANDAMENTO_SOF'; carregar(); });
    document.getElementById('tabStatus').addEventListener('click', () => { tipoAtual = 'STATUS_RECIBO'; carregar(); });
    document.getElementById('btnNovaOpcao').addEventListener('click', abrirFormulario);
    await carregar();
  }

  async function carregar() {
    marcarTabAtiva();
    opcoes = await Api.chamar('listarOpcoes', { tipo_lista: tipoAtual });
    renderTabela();
  }

  function marcarTabAtiva() {
    document.getElementById('tabAndamento').classList.toggle('primario', tipoAtual === 'ANDAMENTO_SOF');
    document.getElementById('tabStatus').classList.toggle('primario', tipoAtual === 'STATUS_RECIBO');
  }

  function renderTabela() {
    const alvo = document.getElementById('listaOpcoes');
    if (!opcoes.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma opção cadastrada ainda.</p>';
      return;
    }
    const gerente = Auth.ehGerente();
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Valor</th><th>Frente</th><th>Pausa contagem "parado"</th><th>Ativa</th>${gerente ? '<th>Ações</th>' : ''}</tr></thead>
        <tbody>${opcoes.map(o => `
          <tr>
            <td>${UI.escaparHtml(o.valor)}</td>
            <td>${UI.escaparHtml(o.frente)}</td>
            <td>${o.pausa_contagem_parado ? '<span class="selo amarelo">Sim - espera externa</span>' : '<span class="selo cinza">Não</span>'}</td>
            <td>${o.ativo ? '<span class="selo verde">Ativa</span>' : '<span class="selo cinza">Inativa</span>'}</td>
            ${gerente ? `<td><button class="botao" data-toggle-pausa="${o.id}">Alternar pausa</button> <button class="botao" data-toggle-ativo="${o.id}">Alternar ativa</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>`;

    alvo.querySelectorAll('[data-toggle-pausa]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opcao = opcoes.find(o => o.id === btn.dataset.togglePausa);
        await Api.chamar('atualizarOpcao', { id: opcao.id, data: { pausa_contagem_parado: !opcao.pausa_contagem_parado } });
        await carregar();
      });
    });
    alvo.querySelectorAll('[data-toggle-ativo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opcao = opcoes.find(o => o.id === btn.dataset.toggleAtivo);
        await Api.chamar('atualizarOpcao', { id: opcao.id, data: { ativo: !opcao.ativo } });
        await carregar();
      });
    });
  }

  function abrirFormulario() {
    const usuario = Auth.usuario();
    const frentesDisponiveis = tipoAtual === 'ANDAMENTO_SOF' ? FRENTES_SOF : FRENTES_RECIBO;
    const corpo = `
      <form id="formOpcao">
        <div class="campo"><label>Texto da opção *</label><input id="opValor" required /></div>
        <div class="campo"><label>Frente</label>
          <select id="opFrente" ${usuario.perfil === 'gerente' ? '' : 'disabled'}>
            ${frentesDisponiveis.map(f => `<option value="${f}" ${f === usuario.frente ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label><input type="checkbox" id="opPausa" /> Representa espera externa conhecida (pausa a contagem de "parado")</label>
          <p class="ajuda">Ex.: "AGUARDANDO AUTORIZAÇÃO CPF", "AGUARDANDO DISPONIBILIDADE ORÇAMENTÁRIA".</p>
        </div>
        <p id="opErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Nova opção - ' + (tipoAtual === 'ANDAMENTO_SOF' ? 'Andamento (SOF)' : 'Status (Recibo)'), corpo,
      `<button class="botao" id="btnCancelarOpcao">Cancelar</button><button class="botao primario" id="btnSalvarOpcao">Salvar</button>`);

    document.getElementById('btnCancelarOpcao').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarOpcao').addEventListener('click', async () => {
      const erroEl = document.getElementById('opErro');
      erroEl.classList.add('oculto');
      const valor = document.getElementById('opValor').value.trim();
      if (!valor) { erroEl.textContent = 'Informe o texto da opção.'; erroEl.classList.remove('oculto'); return; }
      try {
        await Api.chamar('criarOpcao', {
          data: {
            tipo_lista: tipoAtual,
            frente: document.getElementById('opFrente').value,
            valor,
            pausa_contagem_parado: document.getElementById('opPausa').checked
          }
        });
        UI.toast('Opção criada.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        erroEl.textContent = err.message;
        erroEl.classList.remove('oculto');
      }
    });
  }

  /** Usado por sof.js/recibos.js para popular os <select> de andamento/status. */
  async function obterOpcoes(tipoLista) {
    return Api.chamar('listarOpcoes', { tipo_lista: tipoLista });
  }

  return { render, obterOpcoes };
})();
