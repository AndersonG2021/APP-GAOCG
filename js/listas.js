/**
 * GAOCG App - Administração das opções (globais) de "andamento" (SOF) e
 * "status" (Recibo) (Funcionalidades 3, 4 e 8 - pausa_contagem_parado).
 */

const TelaListas = (function () {
  let tipoAtual = 'ANDAMENTO_SOF';
  let opcoes = [];

  const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  const ABAS = [
    { tipo: 'ANDAMENTO_SOF', id: 'tabAndamento', rotulo: 'Andamento (SOF)' },
    { tipo: 'STATUS_RECIBO', id: 'tabStatus', rotulo: 'Status (Recibo)' },
    { tipo: 'OSS', id: 'tabOss', rotulo: 'OSS' },
    { tipo: 'OBJETO', id: 'tabObjeto', rotulo: 'Objeto' }
  ];

  /** OSS e Objeto não têm o conceito de "pausa contagem parado" (exclusivo de Andamento/Status). */
  function temPausa() {
    return tipoAtual === 'ANDAMENTO_SOF' || tipoAtual === 'STATUS_RECIBO';
  }

  async function render() {
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Listas Personalizadas</h2>
      <div class="painel">
        <div class="barra-filtros">
          ${ABAS.map(a => `<button class="botao" id="${a.id}">${a.rotulo}</button>`).join('')}
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovaOpcao">+ Nova opção</button>
        </div>
        <div id="listaOpcoes"></div>
      </div>`;

    ABAS.forEach(a => document.getElementById(a.id).addEventListener('click', () => { tipoAtual = a.tipo; carregar(); }));
    document.getElementById('btnNovaOpcao').addEventListener('click', () => abrirFormulario());
    await carregar();
  }

  async function carregar() {
    marcarTabAtiva();
    opcoes = await Api.chamar('listarOpcoes', { tipo_lista: tipoAtual });
    renderTabela();
  }

  function marcarTabAtiva() {
    ABAS.forEach(a => document.getElementById(a.id).classList.toggle('primario', tipoAtual === a.tipo));
  }

  function renderTabela() {
    const alvo = document.getElementById('listaOpcoes');
    if (!opcoes.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma opção cadastrada ainda.</p>';
      return;
    }
    const gerente = Auth.ehGerente();
    const pausa = temPausa();
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Valor</th>${pausa ? '<th>Pausa contagem "parado"</th>' : ''}${gerente ? '<th></th>' : ''}</tr></thead>
        <tbody>${opcoes.map(o => `
          <tr data-id="${o.id}">
            <td>${UI.escaparHtml(o.valor)}</td>
            ${pausa ? `<td>${o.pausa_contagem_parado ? '<span class="selo amarelo">Sim - espera externa</span>' : '<span class="selo cinza">Não</span>'}</td>` : ''}
            ${gerente ? `<td class="tabela-acoes">
              <button type="button" class="botao-icone editar" data-acao="editar" title="Editar">${ICONE_LAPIS}</button>
              <button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button>
            </td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>`;

    if (!gerente) return;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      const opcao = opcoes.find(o => o.id === tr.dataset.id);
      tr.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirFormulario(opcao));
      tr.querySelector('[data-acao="excluir"]').addEventListener('click', () => confirmarExclusaoOpcao(opcao));
    });
  }

  /** Confirmação grande e em destaque, mesmo padrão de confirmarExclusao em js/unidades.js - exclusão aqui é física (sem FK, ver excluirOpcao). */
  function confirmarExclusaoOpcao(opcao) {
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ESSA OPÇÃO? PROCESSOS QUE JÁ USAM ESSE VALOR NÃO SERÃO ALTERADOS, MAS ELA DEIXARÁ DE APARECER PARA NOVOS CADASTROS.</p>`;
    UI.abrirModal('Excluir opção', corpo,
      `<button class="botao" id="btnCancelarExclusaoOpcao">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusaoOpcao">Excluir</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarExclusaoOpcao').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusaoOpcao').addEventListener('click', async () => {
      try {
        await Api.chamar('excluirOpcao', { id: opcao.id });
        Api.invalidarCache('listarOpcoes');
        UI.toast('Opção excluída.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  /** opcaoExistente omitido = criação; passado = edição (reaproveita atualizarOpcao). */
  function abrirFormulario(opcaoExistente) {
    const pausa = temPausa();
    const corpo = `
      <form id="formOpcao">
        <div class="campo"><label>Texto da opção *</label><input id="opValor" required value="${opcaoExistente ? UI.escaparHtml(opcaoExistente.valor) : ''}" /></div>
        ${pausa ? `<div class="campo">
          <label><input type="checkbox" id="opPausa" ${opcaoExistente && opcaoExistente.pausa_contagem_parado ? 'checked' : ''} /> Representa espera externa conhecida (pausa a contagem de "parado")</label>
          <p class="ajuda">Ex.: "AGUARDANDO AUTORIZAÇÃO CPF", "AGUARDANDO DISPONIBILIDADE ORÇAMENTÁRIA".</p>
        </div>` : ''}
        <p id="opErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal((opcaoExistente ? 'Editar opção' : 'Nova opção') + ' - ' + (ABAS.find(a => a.tipo === tipoAtual) || {}).rotulo, corpo,
      `<button class="botao" id="btnCancelarOpcao">Cancelar</button><button class="botao primario" id="btnSalvarOpcao">Salvar</button>`);

    document.getElementById('btnCancelarOpcao').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarOpcao').addEventListener('click', async () => {
      const erroEl = document.getElementById('opErro');
      erroEl.classList.add('oculto');
      const valor = document.getElementById('opValor').value.trim();
      if (!valor) { UI.mostrarErro(erroEl, 'Informe o texto da opção.'); return; }
      const pausaContagemParado = document.getElementById('opPausa') ? document.getElementById('opPausa').checked : false;
      try {
        if (opcaoExistente) {
          await Api.chamar('atualizarOpcao', { id: opcaoExistente.id, data: { valor, pausa_contagem_parado: pausaContagemParado } });
          UI.toast('Opção atualizada.', 'sucesso');
        } else {
          await Api.chamar('criarOpcao', { data: { tipo_lista: tipoAtual, valor, pausa_contagem_parado: pausaContagemParado } });
          UI.toast('Opção criada.', 'sucesso');
        }
        Api.invalidarCache('listarOpcoes');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /** Usado por sof.js/recibos.js para popular os <select> de andamento/status. */
  async function obterOpcoes(tipoLista) {
    return Api.chamar('listarOpcoes', { tipo_lista: tipoLista }, { cache: true });
  }

  return { render, obterOpcoes };
})();
