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

  function mostrarCarregando() {
    document.getElementById('sobreposicaoCarregando').classList.remove('oculto');
  }
  function esconderCarregando() {
    document.getElementById('sobreposicaoCarregando').classList.add('oculto');
  }

  function toast(mensagem, tipo) {
    tipo = tipo || 'info';
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.textContent = mensagem;
    document.getElementById('containerToasts').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function abrirModal(titulo, corpoHtml, rodapeHtml, opcoes) {
    document.getElementById('modalTitulo').textContent = titulo;
    document.getElementById('modalCorpo').innerHTML = corpoHtml;
    document.getElementById('modalRodape').innerHTML = rodapeHtml || '';
    const modalEl = document.getElementById('modal');
    modalEl.classList.toggle('pequeno', !!(opcoes && opcoes.pequeno));
    document.getElementById('sobreposicaoModal').classList.remove('oculto');
  }

  function fecharModal() {
    document.getElementById('sobreposicaoModal').classList.add('oculto');
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

  return {
    escaparHtml, mostrarCarregando, esconderCarregando, toast, abrirModal, fecharModal, mostrarErro, lerArquivoBase64,
    formatarMoeda, formatarData, listaCompetencias, opcoesCompetenciaHtml
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
      <div class="campo"><label>Login</label><input value="${UI.escaparHtml(usuario.login)}" disabled /></div>
      <div class="campo"><label>Perfil</label><input value="${usuario.perfil === 'gerente' ? 'Gerente' : 'Analista'}" disabled /></div>
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
