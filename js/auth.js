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

  /** Atualiza o nome em memória/sessionStorage após alterarMeuNome, sem exigir novo login. */
  function atualizarNomeLocal(novoNome) {
    if (!usuarioAtual) return;
    usuarioAtual = Object.assign({}, usuarioAtual, { nome: novoNome });
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return;
    try {
      const dados = JSON.parse(bruto);
      dados.user = usuarioAtual;
      sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(dados));
    } catch (e) { /* sessão inválida, ignora */ }
  }

  function ehGerente() {
    return !!usuarioAtual && usuarioAtual.perfil === 'gerente';
  }

  return { carregarSessaoSalva, salvarSessao, encerrarSessaoLocal, login, usuario, ehGerente, atualizarNomeLocal };
})();
