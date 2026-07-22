/**
 * GAOCG App - Bootstrap, roteamento entre telas e helpers de UI compartilhados
 * (toast, spinner, modal genérico). Vanilla JS, sem framework.
 */

const UI = (function () {
  function escaparHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /**
   * Contador em vez de toggle simples: se duas chamadas de Api.chamar
   * estiverem em voo ao mesmo tempo, a primeira que terminar não pode
   * esconder o spinner enquanto a outra ainda está em andamento.
   */
  let contadorCarregando = 0;
  function mostrarCarregando() {
    contadorCarregando++;
    document.getElementById('sobreposicaoCarregando').classList.remove('oculto');
  }
  function esconderCarregando() {
    contadorCarregando = Math.max(0, contadorCarregando - 1);
    if (contadorCarregando === 0) document.getElementById('sobreposicaoCarregando').classList.add('oculto');
  }

  function toast(mensagem, tipo) {
    tipo = tipo || 'info';
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.textContent = mensagem;
    document.getElementById('containerToasts').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  let callbackFecharModal = null;

  function abrirModal(titulo, corpoHtml, rodapeHtml, opcoes) {
    callbackFecharModal = null;
    document.getElementById('modalTitulo').textContent = titulo;
    document.getElementById('modalCorpo').innerHTML = corpoHtml;
    document.getElementById('modalRodape').innerHTML = rodapeHtml || '';
    const modalEl = document.getElementById('modal');
    modalEl.classList.toggle('pequeno', !!(opcoes && opcoes.pequeno));
    document.getElementById('sobreposicaoModal').classList.remove('oculto');
  }

  /**
   * Registra uma função a ser chamada sempre que o modal atual fechar, seja
   * por qual caminho for (botão Cancelar, X, clique fora, ou fechamento
   * programático após salvar) - garante que uma limpeza (ex.: liberar a trava
   * de edição simultânea) aconteça em qualquer um desses casos, não só num
   * botão específico. É zerado a cada abrirModal() e após disparar uma vez.
   */
  function aoFecharModal(callback) {
    callbackFecharModal = callback;
  }

  function fecharModal() {
    document.getElementById('sobreposicaoModal').classList.add('oculto');
    if (callbackFecharModal) {
      const callback = callbackFecharModal;
      callbackFecharModal = null;
      callback();
    }
  }

  /**
   * Mostra uma mensagem de erro num <p class="erro-campo">. Se a mesma mensagem
   * já estava sendo exibida por esse elemento (tentativa repetida com o mesmo
   * erro), aplica uma animação de "piscar" para reforçar que o erro persiste.
   */
  function mostrarErro(elementoOuId, mensagem) {
    const el = typeof elementoOuId === 'string' ? document.getElementById(elementoOuId) : elementoOuId;
    const repetiu = el.dataset.ultimaMensagem === mensagem;
    el.textContent = mensagem;
    el.dataset.ultimaMensagem = mensagem;
    el.classList.remove('oculto');
    if (repetiu) {
      el.classList.remove('piscar-erro');
      void el.offsetWidth; // força reflow para reiniciar a animação CSS
      el.classList.add('piscar-erro');
    }
  }

  function lerArquivoBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.readAsDataURL(arquivo);
    });
  }

  function formatarMoeda(valor) {
    const n = Number(valor) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarData(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('pt-BR');
  }

  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /** Gera a lista de competências (formato "mmm.aa", ex.: "mar.26") de 24 meses atrás a 6 meses à frente. */
  function listaCompetencias() {
    const hoje = new Date();
    const lista = [];
    for (let i = 6; i >= -24; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      lista.push(MESES_ABREV[d.getMonth()] + '.' + String(d.getFullYear()).slice(-2));
    }
    return lista;
  }

  /**
   * Monta as <option> de um <select> de competência. Se valorSelecionado não
   * estiver na lista padrão (dado histórico fora do intervalo gerado), ele é
   * incluído mesmo assim para não "perder" a seleção atual.
   */
  function opcoesCompetenciaHtml(valorSelecionado, incluirTodas) {
    const lista = listaCompetencias();
    if (valorSelecionado && lista.indexOf(valorSelecionado) === -1) lista.unshift(valorSelecionado);
    const opcaoInicial = incluirTodas ? '<option value="">Todas</option>' : '<option value="">-</option>';
    return opcaoInicial + lista.map(c => `<option ${c === valorSelecionado ? 'selected' : ''}>${c}</option>`).join('');
  }

  document.getElementById('botaoFecharModal').addEventListener('click', fecharModal);
  document.getElementById('sobreposicaoModal').addEventListener('click', function (e) {
    if (e.target === this) fecharModal();
  });

  const REGEX_MARCAS_DIACRITICAS = new RegExp('[̀-ͯ]', 'g');
  function normalizarBusca_(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(REGEX_MARCAS_DIACRITICAS, '');
  }

  /**
   * Transforma um <select> já existente num combo pesquisável (progressive
   * enhancement): o <select> original continua no DOM (escondido) e é a
   * fonte de verdade de `.value` - todo código já existente que lê
   * `elemento.value` ou escuta `change` no select continua funcionando sem
   * alteração nenhuma. Ao lado dele é inserido um <input> de texto + um
   * painel de opções filtráveis; escolher uma opção seta o `.value` do
   * select original e dispara `change` nele.
   *
   * Idempotente: se chamado de novo sobre um select já convertido (comum nos
   * cascatas Unidade->SOF->Fonte, onde o innerHTML do select é substituído
   * depois de uma busca), só atualiza a lista de opções a partir do estado
   * atual do select, em vez de duplicar o wrapper.
   */
  function tornarPesquisavel(idOuElemento) {
    const select = typeof idOuElemento === 'string' ? document.getElementById(idOuElemento) : idOuElemento;
    if (!select || select.tagName !== 'SELECT') return;

    const wrapperExistente = select.nextElementSibling && select.nextElementSibling.classList && select.nextElementSibling.classList.contains('select-pesquisavel')
      ? select.nextElementSibling
      : null;

    if (wrapperExistente) {
      atualizarWrapperPesquisavel_(select, wrapperExistente);
      return;
    }

    select.classList.add('select-pesquisavel-original');
    select.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'select-pesquisavel';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'select-pesquisavel-input';
    input.autocomplete = 'off';
    input.placeholder = 'Buscar...';
    const lista = document.createElement('ul');
    lista.className = 'select-pesquisavel-lista oculto';
    wrapper.appendChild(input);
    wrapper.appendChild(lista);
    select.insertAdjacentElement('afterend', wrapper);

    let indiceDestacado = -1;

    function opcoesDoSelect() {
      return Array.from(select.options).filter(o => o.value !== '' || o === select.options[0]);
    }

    function textoDaOpcaoSelecionada() {
      const opcao = select.options[select.selectedIndex];
      return opcao && opcao.value !== '' ? opcao.textContent : '';
    }

    function renderLista(filtro) {
      const termo = normalizarBusca_(filtro);
      const opcoes = opcoesDoSelect().filter(o => o.value !== '');
      const filtradas = termo ? opcoes.filter(o => normalizarBusca_(o.textContent).indexOf(termo) !== -1) : opcoes;
      indiceDestacado = -1;
      lista.innerHTML = filtradas.length
        ? filtradas.map((o, i) => `<li class="select-pesquisavel-opcao" data-valor="${escaparHtml(o.value)}" data-indice="${i}">${escaparHtml(o.textContent)}</li>`).join('')
        : '<li class="select-pesquisavel-vazio">Nenhuma opção encontrada</li>';
      lista.querySelectorAll('.select-pesquisavel-opcao').forEach(li => {
        li.addEventListener('mousedown', e => {
          e.preventDefault();
          escolherValor(li.dataset.valor);
        });
      });
    }

    function abrirLista() {
      if (select.disabled) return;
      renderLista(input.value === textoDaOpcaoSelecionada() ? '' : input.value);
      lista.classList.remove('oculto');
    }

    function fecharLista() {
      lista.classList.add('oculto');
      input.value = textoDaOpcaoSelecionada();
    }

    function escolherValor(valor) {
      select.value = valor;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = textoDaOpcaoSelecionada();
      fecharLista();
    }

    // Reflete no input trocas de valor feitas fora do wrapper (ex.:
    // autopreenchimento programático que faz `select.value = x` e dispara
    // `change` direto no <select> original, sem passar por escolherValor).
    select.addEventListener('change', () => { input.value = textoDaOpcaoSelecionada(); });

    input.addEventListener('focus', abrirLista);
    input.addEventListener('input', () => { renderLista(input.value); lista.classList.remove('oculto'); });
    input.addEventListener('blur', () => setTimeout(fecharLista, 120));
    input.addEventListener('keydown', e => {
      const itens = () => Array.from(lista.querySelectorAll('.select-pesquisavel-opcao'));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (lista.classList.contains('oculto')) { abrirLista(); return; }
        const els = itens();
        if (!els.length) return;
        indiceDestacado = Math.min(indiceDestacado + 1, els.length - 1);
        els.forEach(el => el.classList.remove('destacada'));
        els[indiceDestacado].classList.add('destacada');
        els[indiceDestacado].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const els = itens();
        if (!els.length) return;
        indiceDestacado = Math.max(indiceDestacado - 1, 0);
        els.forEach(el => el.classList.remove('destacada'));
        els[indiceDestacado].classList.add('destacada');
        els[indiceDestacado].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const els = itens();
        if (indiceDestacado >= 0 && els[indiceDestacado]) escolherValor(els[indiceDestacado].dataset.valor);
      } else if (e.key === 'Escape') {
        fecharLista();
        input.blur();
      }
    });

    input.disabled = select.disabled;
    input.value = textoDaOpcaoSelecionada();

    // Reobserva o select original (via MutationObserver) pra refletir trocas
    // programáticas de .value/.disabled feitas direto pelo código existente
    // (ex.: reset de formulário) sem precisar tocar em cada call site.
    const observer = new MutationObserver(() => atualizarWrapperPesquisavel_(select, wrapper));
    observer.observe(select, { attributes: true, attributeFilter: ['disabled'] });
    wrapper._observerSelect = observer;
    wrapper._render = () => { input.value = textoDaOpcaoSelecionada(); input.disabled = select.disabled; };
  }

  function atualizarWrapperPesquisavel_(select, wrapper) {
    if (wrapper._render) wrapper._render();
  }

  /**
   * ===== Filtro de múltipla escolha =====
   * Substitui um <div id="..."> vazio (colocado no lugar de um <select> nas
   * barras de filtro) por um combo de checkboxes com busca, permitindo
   * selecionar 0..N opções. O valor "vazio" (nenhuma opção marcada) tem o
   * mesmo efeito de "Todas"/"Todos" que os selects antigos tinham.
   *
   * Cada instância fica registrada em `registroFiltrosMultiplos` pelo id do
   * container, para que `valoresFiltroMultiplo`/`limparFiltroMultiplo` sejam
   * chamados de qualquer lugar (ex.: filtrosAtuais(), botão "Limpar filtros",
   * botão "x" individual de cada campo) sem precisar guardar a referência.
   */
  const registroFiltrosMultiplos = {};

  function normalizarOpcoesFiltro_(opcoes) {
    return (opcoes || []).map(o => (typeof o === 'string' ? { valor: o, rotulo: o } : { valor: o.valor, rotulo: o.rotulo != null ? o.rotulo : o.valor }));
  }

  function criarFiltroMultiplo(id, opcoes) {
    const raiz = document.getElementById(id);
    if (!raiz) return null;

    let normalizadas = normalizarOpcoesFiltro_(opcoes);
    let selecionados = new Set();

    raiz.classList.add('filtro-multiplo');
    raiz.innerHTML = `
      <button type="button" class="filtro-multiplo-cabecalho">
        <span class="filtro-multiplo-texto">Todas</span>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="filtro-multiplo-painel oculto">
        <input type="text" class="filtro-multiplo-busca" placeholder="Buscar..." autocomplete="off" />
        <div class="filtro-multiplo-opcoes"></div>
      </div>`;

    const botao = raiz.querySelector('.filtro-multiplo-cabecalho');
    const texto = raiz.querySelector('.filtro-multiplo-texto');
    const painel = raiz.querySelector('.filtro-multiplo-painel');
    const buscaInput = raiz.querySelector('.filtro-multiplo-busca');
    const opcoesContainer = raiz.querySelector('.filtro-multiplo-opcoes');

    function renderOpcoes(filtro) {
      const termo = normalizarBusca_(filtro);
      const filtradas = termo ? normalizadas.filter(o => normalizarBusca_(o.rotulo).indexOf(termo) !== -1) : normalizadas;
      opcoesContainer.innerHTML = filtradas.length
        ? filtradas.map(o => `
          <label class="filtro-multiplo-opcao">
            <input type="checkbox" value="${escaparHtml(o.valor)}" ${selecionados.has(o.valor) ? 'checked' : ''} />
            <span>${escaparHtml(o.rotulo)}</span>
          </label>`).join('')
        : '<div class="filtro-multiplo-vazio">Nenhuma opção encontrada</div>';
      opcoesContainer.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) selecionados.add(cb.value); else selecionados.delete(cb.value);
          atualizarTexto();
        });
      });
    }

    function atualizarTexto() {
      if (selecionados.size === 0) {
        texto.textContent = 'Todas';
      } else if (selecionados.size === 1) {
        const valor = Array.from(selecionados)[0];
        const opcao = normalizadas.find(o => o.valor === valor);
        texto.textContent = opcao ? opcao.rotulo : valor;
      } else {
        texto.textContent = `${selecionados.size} selecionadas`;
      }
      raiz.classList.toggle('tem-selecao', selecionados.size > 0);
    }

    function aoClicarFora_(e) {
      if (!raiz.contains(e.target)) fechar();
    }

    function abrir() {
      if (!painel.classList.contains('oculto')) return;
      painel.classList.remove('oculto');
      buscaInput.value = '';
      renderOpcoes('');
      buscaInput.focus();
      document.addEventListener('mousedown', aoClicarFora_, true);
    }

    function fechar() {
      painel.classList.add('oculto');
      document.removeEventListener('mousedown', aoClicarFora_, true);
    }

    botao.addEventListener('click', () => { painel.classList.contains('oculto') ? abrir() : fechar(); });
    buscaInput.addEventListener('input', () => renderOpcoes(buscaInput.value));
    buscaInput.addEventListener('keydown', e => { if (e.key === 'Escape') { fechar(); botao.focus(); } });

    atualizarTexto();

    const api = {
      obterValores: () => Array.from(selecionados),
      definirValores: (valores) => {
        selecionados = new Set((valores || []).map(String));
        atualizarTexto();
        if (!painel.classList.contains('oculto')) renderOpcoes(buscaInput.value);
      },
      limpar: () => {
        if (selecionados.size === 0) return;
        selecionados.clear();
        atualizarTexto();
        if (!painel.classList.contains('oculto')) renderOpcoes(buscaInput.value);
      },
      atualizarOpcoes: (novasOpcoes) => {
        normalizadas = normalizarOpcoesFiltro_(novasOpcoes);
        selecionados = new Set(Array.from(selecionados).filter(v => normalizadas.some(o => o.valor === v)));
        atualizarTexto();
        if (!painel.classList.contains('oculto')) renderOpcoes(buscaInput.value);
      }
    };
    registroFiltrosMultiplos[id] = api;
    return api;
  }

  function valoresFiltroMultiplo(id) {
    return registroFiltrosMultiplos[id] ? registroFiltrosMultiplos[id].obterValores() : [];
  }

  function limparFiltroMultiplo(id) {
    if (registroFiltrosMultiplos[id]) registroFiltrosMultiplos[id].limpar();
  }

  /**
   * Liga os botões "x" individuais (marcados com data-alvo="<id do filtro>")
   * e o botão maior de "Limpar filtros" (se existir, via seu id) de uma barra
   * de filtros recém-renderizada. `aoLimpar` roda depois de limpar tudo
   * (tipicamente recarrega a lista com paginaAtual = 1).
   */
  function ligarLimpezaFiltros(raizOuSeletor, botaoLimparTodosId, aoLimpar) {
    const raiz = typeof raizOuSeletor === 'string' ? document.querySelector(raizOuSeletor) : raizOuSeletor;
    if (!raiz) return;
    raiz.querySelectorAll('.filtro-multiplo-x').forEach(btn => {
      btn.addEventListener('click', () => {
        limparFiltroMultiplo(btn.dataset.alvo);
        if (aoLimpar) aoLimpar();
      });
    });
    if (botaoLimparTodosId) {
      const botaoTodos = document.getElementById(botaoLimparTodosId);
      if (botaoTodos) {
        botaoTodos.addEventListener('click', () => {
          raiz.querySelectorAll('.filtro-multiplo-x').forEach(btn => limparFiltroMultiplo(btn.dataset.alvo));
          raiz.querySelectorAll('input[type=text], input[type=search]').forEach(inp => { inp.value = ''; });
          raiz.querySelectorAll('select').forEach(sel => { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); });
          if (aoLimpar) aoLimpar();
        });
      }
    }
  }

  return {
    escaparHtml, mostrarCarregando, esconderCarregando, toast, abrirModal, fecharModal, aoFecharModal, mostrarErro, lerArquivoBase64,
    formatarMoeda, formatarData, listaCompetencias, opcoesCompetenciaHtml, tornarPesquisavel,
    criarFiltroMultiplo, valoresFiltroMultiplo, limparFiltroMultiplo, ligarLimpezaFiltros
  };
})();

const App = (function () {
  const TELAS = {
    dashboard: () => Dashboard.render(),
    sof: () => TelaSof.render(),
    notasEmpenho: () => TelaNotasEmpenho.render(),
    recibos: () => TelaRecibos.render(),
    unidades: () => TelaUnidades.render(),
    listas: () => TelaListas.render(),
    logAuditoria: () => TelaLogAuditoria.render(),
    usuarios: () => TelaUsuarios.render()
  };

  function mostrarTelaLogin() {
    document.getElementById('appShell').classList.add('oculto');
    document.getElementById('telaLogin').classList.remove('oculto');
  }

  function mostrarApp() {
    const usuario = Auth.usuario();
    document.getElementById('telaLogin').classList.add('oculto');
    document.getElementById('appShell').classList.remove('oculto');
    document.getElementById('nomeUsuarioTopo').textContent = usuario.nome;
    document.getElementById('perfilUsuarioTopo').textContent =
      usuario.perfil === 'gerente' ? 'Gerente' : 'Analista';
    document.querySelectorAll('.somente-gerente').forEach(el => el.classList.toggle('oculto', usuario.perfil !== 'gerente'));
    navegarPara('dashboard');
  }

  function abrirModalPerfil() {
    const usuario = Auth.usuario();
    const corpo = `
      <form id="formMeuNome">
        <div class="campo"><label>Nome exibido na aplicação *</label><input id="meuNome" value="${UI.escaparHtml(usuario.nome)}" required /></div>
        <p id="nomeErro" class="erro-campo oculto"></p>
      </form>
      <div class="campo"><label>Login</label><input value="${UI.escaparHtml(usuario.login)}" disabled /></div>
      <div class="campo"><label>Perfil</label><input value="${usuario.perfil === 'gerente' ? 'Gerente' : 'Analista'}" disabled /></div>
      <button type="button" class="botao" id="btnSalvarNome">Salvar nome</button>
      <hr style="border:none;border-top:1px solid var(--cinza-200);margin:16px 0" />
      <h4 style="margin:0 0 8px">Alterar senha</h4>
      <form id="formTrocarSenha">
        <div class="campo"><label>Senha atual *</label><input id="senhaAtual" type="password" required /></div>
        <div class="campo"><label>Nova senha *</label><input id="senhaNova" type="password" required /></div>
        <div class="campo"><label>Confirmar nova senha *</label><input id="senhaNovaConfirmacao" type="password" required /></div>
        <p id="perfilErro" class="erro-campo oculto"></p>
      </form>`;

    UI.abrirModal('Minha conta', corpo,
      `<button class="botao" id="btnFecharPerfil">Fechar</button><button class="botao primario" id="btnSalvarSenha">Alterar senha</button>`,
      { pequeno: true });

    document.getElementById('btnFecharPerfil').addEventListener('click', UI.fecharModal);

    document.getElementById('btnSalvarNome').addEventListener('click', async () => {
      const erroEl = document.getElementById('nomeErro');
      erroEl.classList.add('oculto');
      const novoNome = document.getElementById('meuNome').value.trim();
      if (!novoNome) { UI.mostrarErro(erroEl, 'Informe o nome.'); return; }

      try {
        await Api.chamar('alterarMeuNome', { novoNome });
        Auth.atualizarNomeLocal(novoNome);
        document.getElementById('nomeUsuarioTopo').textContent = novoNome;
        UI.toast('Nome atualizado com sucesso.', 'sucesso');
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });

    document.getElementById('btnSalvarSenha').addEventListener('click', async () => {
      const erroEl = document.getElementById('perfilErro');
      erroEl.classList.add('oculto');
      const senhaAtual = document.getElementById('senhaAtual').value;
      const senhaNova = document.getElementById('senhaNova').value;
      const senhaNovaConfirmacao = document.getElementById('senhaNovaConfirmacao').value;

      if (!senhaAtual || !senhaNova) { UI.mostrarErro(erroEl, 'Informe a senha atual e a nova senha.'); return; }
      if (senhaNova.length < 6) { UI.mostrarErro(erroEl, 'A nova senha deve ter pelo menos 6 caracteres.'); return; }
      if (senhaNova !== senhaNovaConfirmacao) { UI.mostrarErro(erroEl, 'A confirmação não confere com a nova senha.'); return; }

      try {
        await Api.chamar('alterarMinhaSenha', { senhaAtual, novaSenha: senhaNova });
        UI.toast('Senha alterada com sucesso.', 'sucesso');
        UI.fecharModal();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  function navegarPara(tela) {
    document.querySelectorAll('#barraLateral nav button').forEach(btn => {
      btn.classList.toggle('ativo', btn.dataset.tela === tela);
    });
    document.getElementById('tituloTopo').textContent = document.querySelector(
      '#barraLateral nav button[data-tela="' + tela + '"]'
    ).textContent;
    document.getElementById('conteudo').innerHTML = '';
    TELAS[tela]();
  }

  function fecharMenuMobile() {
    document.getElementById('barraLateral').classList.remove('aberta');
    document.getElementById('fundoMenuMobile').classList.add('oculto');
  }

  function init() {
    document.querySelectorAll('#barraLateral nav button').forEach(btn => {
      btn.addEventListener('click', () => { navegarPara(btn.dataset.tela); fecharMenuMobile(); });
    });

    document.getElementById('btnMenuMobile').addEventListener('click', () => {
      document.getElementById('barraLateral').classList.add('aberta');
      document.getElementById('fundoMenuMobile').classList.remove('oculto');
    });
    document.getElementById('fundoMenuMobile').addEventListener('click', fecharMenuMobile);

    document.getElementById('btnSair').addEventListener('click', () => {
      Auth.encerrarSessaoLocal();
      mostrarTelaLogin();
    });

    document.querySelector('#barraTopo .usuario-info').addEventListener('click', abrirModalPerfil);

    document.getElementById('formLogin').addEventListener('submit', async function (e) {
      e.preventDefault();
      const erroEl = document.getElementById('loginErro');
      erroEl.classList.add('oculto');
      const login = document.getElementById('loginUsuario').value.trim();
      const senha = document.getElementById('loginSenha').value;
      if (!login || !senha) {
        UI.mostrarErro(erroEl, 'Preencha usuário e senha.');
        return;
      }
      try {
        await Auth.login(login, senha);
        mostrarApp();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });

    if (Auth.carregarSessaoSalva()) {
      mostrarApp();
    } else {
      mostrarTelaLogin();
    }
  }

  return { init, mostrarTelaLogin, mostrarApp, navegarPara };
})();

document.addEventListener('DOMContentLoaded', App.init);
