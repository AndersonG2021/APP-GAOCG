/**
 * GAOCG App - Sugestões (sessão 2026-08-14, pedido do usuário).
 *
 * Qualquer usuário autenticado pode enviar uma sugestão sobre o app. Cada um
 * vê só as próprias (o backend já filtra - ver listarSugestoes,
 * backend/Sugestoes.gs) - exceto o Administrador do Aplicativo, que vê
 * todas e é quem dá o feedback.
 *
 * Fluxo de status: Aguardando análise -> Em análise (Administrador abriu) ->
 * Lida (Administrador respondeu). Editar o texto depois de "Lida" reabre pra
 * "Aguardando análise" (pedido do usuário - evita feedback desatualizado em
 * cima de um texto que já mudou).
 */
const TelaSugestoes = (function () {
  let sugestoes = [];
  let mapaUsuarios_ = {};

  const CORES_STATUS_ = {
    'Aguardando análise': 'amarelo',
    'Em análise': 'azul',
    'Lida': 'verde'
  };

  async function render() {
    const container = document.getElementById('conteudo');
    const souAdmin = Auth.ehAdministrador();
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 class="titulo-tela" style="margin:0">Sugestões</h2>
        <button class="botao primario" id="btnNovaSugestao">+ Nova sugestão</button>
      </div>
      <div class="painel">
        <p class="ajuda">${souAdmin ? 'Você vê as sugestões de todos os usuários.' : 'Você vê só as sugestões que você mesmo enviou.'}</p>
        <div id="listaSugestoes"></div>
      </div>`;
    document.getElementById('btnNovaSugestao').addEventListener('click', abrirFormularioNova_);
    if (souAdmin) await carregarMapaUsuarios_();
    await carregar();
  }

  /** Só o Administrador precisa resolver usuario_id -> nome (pra saber quem enviou cada uma). */
  async function carregarMapaUsuarios_() {
    try {
      const usuarios = await Api.chamar('listarUsuarios', {}, { cache: true });
      mapaUsuarios_ = {};
      usuarios.forEach(u => { mapaUsuarios_[u.id] = u.nome; });
    } catch (e) {
      // Cosmético (só usado pra exibir o nome do autor) - falha silenciosa.
    }
  }

  async function carregar() {
    sugestoes = await Api.chamar('listarSugestoes', {});
    renderLista();
  }

  function renderLista() {
    const alvo = document.getElementById('listaSugestoes');
    if (!sugestoes.length) {
      alvo.innerHTML = '<p class="estado-vazio">Nenhuma sugestão ainda.</p>';
      return;
    }
    const souAdmin = Auth.ehAdministrador();
    alvo.innerHTML = sugestoes.map(s => `
      <div class="cartao-sugestao" data-id="${s.id}">
        <div class="cartao-sugestao-topo">
          ${souAdmin ? `<strong>${UI.escaparHtml(mapaUsuarios_[s.usuario_id] || s.usuario_id)}</strong>` : `<span class="ajuda">${UI.formatarData(s.data_criacao)}</span>`}
          <span class="selo ${CORES_STATUS_[s.status] || 'cinza'}">${UI.escaparHtml(s.status)}</span>
        </div>
        <p class="cartao-sugestao-texto">${UI.escaparHtml(s.texto)}</p>
        ${s.feedback_administrador ? `<p class="cartao-sugestao-feedback"><strong>Feedback do Administrador:</strong> ${UI.escaparHtml(s.feedback_administrador)}</p>` : ''}
      </div>`).join('');

    alvo.querySelectorAll('.cartao-sugestao').forEach(cartao => {
      cartao.addEventListener('click', () => abrirDetalhe_(sugestoes.find(s => s.id === cartao.dataset.id)));
    });
  }

  function abrirFormularioNova_() {
    const corpo = `
      <form id="formNovaSugestao">
        <div class="campo"><label>Sua sugestão *</label><textarea id="novaSugestaoTexto" rows="5" required placeholder="Conte sua ideia, problema ou sugestão de melhoria para o GAOCG App..."></textarea></div>
        <p id="novaSugestaoErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Nova sugestão', corpo,
      `<button class="botao" id="btnCancelarSugestao">Cancelar</button><button class="botao primario" id="btnEnviarSugestao">Enviar sugestão</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarSugestao').addEventListener('click', UI.fecharModal);
    document.getElementById('btnEnviarSugestao').addEventListener('click', async () => {
      const erroEl = document.getElementById('novaSugestaoErro');
      erroEl.classList.add('oculto');
      const texto = document.getElementById('novaSugestaoTexto').value.trim();
      if (!texto) { UI.mostrarErro(erroEl, 'Escreva sua sugestão antes de enviar.'); return; }
      try {
        await Api.chamar('criarSugestao', { data: { texto } });
        UI.toast('Sugestão enviada. Obrigado!', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /**
   * Administrador abrindo uma "Aguardando análise" pela 1ª vez: marca "Em
   * análise" ANTES de montar o modal - a visualização já conta -, silencioso
   * pra não travar a abertura do modal esperando essa chamada.
   */
  async function abrirDetalhe_(sugestao) {
    const usuarioLogado = Auth.usuario();
    const souAutor = usuarioLogado && String(usuarioLogado.id) === String(sugestao.usuario_id);
    const souAdmin = Auth.ehAdministrador();

    if (souAdmin && sugestao.status === 'Aguardando análise') {
      Api.chamar('marcarSugestaoEmAnalise', { id: sugestao.id }, { silencioso: true })
        .then(() => {
          sugestao.status = 'Em análise';
          const idx = sugestoes.findIndex(s => s.id === sugestao.id);
          if (idx !== -1) sugestoes[idx] = sugestao;
          renderLista();
          const seloModal = document.getElementById('detalheSugestaoStatus');
          if (seloModal) { seloModal.textContent = 'Em análise'; seloModal.className = 'selo azul'; }
        })
        .catch(() => { /* conveniência - se falhar, o modal já abriu normalmente */ });
    }

    const corpo = `
      <div class="campo"><label>Status</label><br><span id="detalheSugestaoStatus" class="selo ${CORES_STATUS_[sugestao.status] || 'cinza'}">${UI.escaparHtml(sugestao.status)}</span></div>
      <div class="campo"><label>Sugestão${souAutor ? '' : ` (de ${UI.escaparHtml(mapaUsuarios_[sugestao.usuario_id] || sugestao.usuario_id)})`}</label>
        <textarea id="detalheSugestaoTexto" rows="5" ${souAutor ? '' : 'disabled'}>${UI.escaparHtml(sugestao.texto)}</textarea>
      </div>
      ${souAutor ? '<p class="ajuda">Editar depois de respondida reabre a sugestão como "Aguardando análise".</p>' : ''}
      ${souAdmin
        ? `<div class="campo"><label>Feedback do Administrador</label><textarea id="detalheSugestaoFeedback" rows="4" placeholder="Escreva sua resposta...">${UI.escaparHtml(sugestao.feedback_administrador || '')}</textarea></div>`
        : (sugestao.feedback_administrador ? `<div class="campo"><label>Feedback do Administrador</label><p>${UI.escaparHtml(sugestao.feedback_administrador)}</p></div>` : '')}
      <p id="detalheSugestaoErro" class="erro-campo oculto"></p>`;

    const botoes = [];
    if (souAutor) botoes.push('<button class="botao" id="btnSalvarEdicaoSugestao">Salvar edição</button>');
    if (souAdmin) botoes.push('<button class="botao primario" id="btnEnviarFeedback">Enviar feedback</button>');

    UI.abrirModal('Sugestão', corpo, `<button class="botao" id="btnFecharSugestao">Fechar</button>${botoes.join('')}`);
    document.getElementById('btnFecharSugestao').addEventListener('click', UI.fecharModal);

    if (souAutor) {
      document.getElementById('btnSalvarEdicaoSugestao').addEventListener('click', async () => {
        // Nada mudou: só fecha, sem chamar o backend à toa (mesmo
        // dirty-tracking usado em todo card do app - ver UI.modalFoiEditado).
        if (!UI.modalFoiEditado()) { UI.fecharModal(); return; }
        const erroEl = document.getElementById('detalheSugestaoErro');
        erroEl.classList.add('oculto');
        const texto = document.getElementById('detalheSugestaoTexto').value.trim();
        if (!texto) { UI.mostrarErro(erroEl, 'Escreva sua sugestão antes de salvar.'); return; }
        try {
          await Api.chamar('atualizarSugestao', { id: sugestao.id, data: { texto } });
          UI.toast('Sugestão atualizada.', 'sucesso');
          UI.fecharModal();
          await carregar();
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
      });
    }
    if (souAdmin) {
      document.getElementById('btnEnviarFeedback').addEventListener('click', async () => {
        const erroEl = document.getElementById('detalheSugestaoErro');
        erroEl.classList.add('oculto');
        const feedback = document.getElementById('detalheSugestaoFeedback').value.trim();
        if (!feedback) { UI.mostrarErro(erroEl, 'Escreva um feedback antes de enviar.'); return; }
        try {
          await Api.chamar('responderSugestao', { id: sugestao.id, feedback });
          UI.toast('Feedback enviado.', 'sucesso');
          UI.fecharModal();
          await carregar();
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
      });
    }
  }

  return { render };
})();
