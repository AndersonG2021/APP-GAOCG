/**
 * GAOCG App - Autenticação e sessão (Funcionalidade 1).
 * Sessão sem expiração por inatividade: fica salva em sessionStorage até
 * logout manual ou fechamento da aba/navegador.
 */

const Auth = (function () {
  const CHAVE_SESSAO = 'gaocg_sessao';
  let usuarioAtual = null;

  function carregarSessaoSalva() {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return false;
    try {
      const dados = JSON.parse(bruto);
      if (!dados.token || !dados.user) return false;
      usuarioAtual = dados.user;
      Api.definirToken(dados.token);
      return true;
    } catch (e) {
      return false;
    }
  }

  function salvarSessao(token, user) {
    usuarioAtual = user;
    Api.definirToken(token);
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ token, user }));
  }

  function encerrarSessaoLocal() {
    usuarioAtual = null;
    Api.definirToken(null);
    sessionStorage.removeItem(CHAVE_SESSAO);
  }

  async function login(login, senha) {
    const resposta = await Api.chamar('login', { login, senha });
    salvarSessao(resposta.token, resposta.user);
    return resposta.user;
  }

  function usuario() {
    return usuarioAtual;
  }

  function ehGerente() {
    return !!usuarioAtual && usuarioAtual.perfil === 'gerente';
  }

  /** Frentes de SOF/Recibo visíveis para escrita: gerente = todas; analista = só a própria. */
  function frenteDoUsuario() {
    return usuarioAtual ? usuarioAtual.frente : null;
  }

  return { carregarSessaoSalva, salvarSessao, encerrarSessaoLocal, login, usuario, ehGerente, frenteDoUsuario };
})();
