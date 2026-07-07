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

  document.getElementById('botaoFecharModal').addEventListener('click', fecharModal);
  document.getElementById('sobreposicaoModal').addEventListener('click', function (e) {
    if (e.target === this) fecharModal();
  });

  return { escaparHtml, mostrarCarregando, esconderCarregando, toast, abrirModal, fecharModal, formatarMoeda, formatarData };
})();

const App = (function () {
  const TELAS = {
    dashboard: () => Dashboard.render(),
    sof: () => TelaSof.render(),
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
      usuario.perfil === 'gerente' ? 'Gerente' : ('Analista - ' + usuario.frente);
    document.querySelectorAll('.somente-gerente').forEach(el => el.classList.toggle('oculto', usuario.perfil !== 'gerente'));
    navegarPara('dashboard');
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

  function init() {
    document.querySelectorAll('#barraLateral nav button').forEach(btn => {
      btn.addEventListener('click', () => navegarPara(btn.dataset.tela));
    });

    document.getElementById('btnSair').addEventListener('click', () => {
      Auth.encerrarSessaoLocal();
      mostrarTelaLogin();
    });

    document.getElementById('formLogin').addEventListener('submit', async function (e) {
      e.preventDefault();
      const erroEl = document.getElementById('loginErro');
      erroEl.classList.add('oculto');
      const login = document.getElementById('loginUsuario').value.trim();
      const senha = document.getElementById('loginSenha').value;
      if (!login || !senha) {
        erroEl.textContent = 'Preencha usuário e senha.';
        erroEl.classList.remove('oculto');
        return;
      }
      try {
        await Auth.login(login, senha);
        mostrarApp();
      } catch (err) {
        erroEl.textContent = err.message;
        erroEl.classList.remove('oculto');
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
