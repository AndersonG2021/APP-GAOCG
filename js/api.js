/**
 * GAOCG App - Wrapper de chamadas à Web App do Apps Script.
 *
 * Usa POST com Content-Type "text/plain" (nunca "application/json") para que
 * o navegador trate a requisição como "simples" e NÃO dispare um preflight
 * OPTIONS - o Apps Script Web App não responde bem a esse preflight. Leituras
 * simples também podem usar GET (nunca gera preflight). Ver Code.gs/Utils.gs
 * no backend para o outro lado dessa decisão.
 */

const Api = (function () {
  // Preenchido após o deploy do Apps Script (Implantar > Nova implantação > Aplicativo da Web).
  const API_URL = 'https://script.google.com/macros/s/AKfycbzbLozyF4h0HLbCeJdWyj1skAmxgrUhjV17FvKzXKVqF9l3gIAnS6ufmvj-PvjAOv4ZTg/exec';

  let token = null;
  const cache = new Map();

  function definirToken(novoToken) {
    token = novoToken;
  }

  function chaveCache(action, payload) {
    return action + ':' + JSON.stringify(payload || {});
  }

  /** Remove do cache todas as entradas da ação informada (qualquer payload). */
  function invalidarCache(action) {
    Array.from(cache.keys()).forEach(chave => {
      if (chave.indexOf(action + ':') === 0) cache.delete(chave);
    });
  }

  /**
   * "Parâmetro \"action\" ausente." (achado 2026-09-03, pedido do usuário:
   * "vez ou outra o app fica bem lento pra carregar e dá esse erro") -
   * mensagem do PRIMEIRÍSSIMO `if` de handleRequest_ (Code.gs, backend),
   * antes de qualquer autenticação/leitura/escrita: só acontece quando o
   * corpo do POST chega vazio no servidor, o que só pode ser perda de
   * requisição em trânsito (rede instável) - nunca a lógica de negócio já
   * tendo rodado. Por isso é seguro reenviar automaticamente, mesmo para
   * ações de escrita: nada foi executado na tentativa que falhou.
   */
  const ERRO_ACTION_AUSENTE_ = 'Parâmetro "action" ausente.';

  async function requisitar_(corpo) {
    const resposta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    });
    if (!resposta.ok) {
      throw new Error('Falha de comunicação com o servidor (HTTP ' + resposta.status + ').');
    }
    return resposta.json();
  }

  /**
   * opcoes.silencioso: pra chamadas de limpeza/"fire and forget" que o
   * usuário não precisa esperar (ex.: liberar a trava de edição simultânea ao
   * fechar um modal que já sumiu da tela, marcar um card como visualizado).
   * Sem isso, toda chamada trava a tela inteira com o spinner global até a
   * requisição terminar - mesmo quando não há nada visível esperando por ela,
   * o que é sentido como lentidão mesmo já sendo uma chamada não bloqueante
   * no código (ver PROGRESS.md, seção de Performance).
   */
  async function chamar(action, payload, opcoes) {
    const usarCache = !!(opcoes && opcoes.cache);
    const chave = usarCache ? chaveCache(action, payload) : null;
    if (usarCache && cache.has(chave)) return cache.get(chave);

    const corpo = Object.assign({ action, token }, payload || {});
    const silencioso = !!(opcoes && opcoes.silencioso);

    if (!silencioso) UI.mostrarCarregando();
    try {
      let json = await requisitar_(corpo);
      if (!json.ok && json.error === ERRO_ACTION_AUSENTE_) {
        json = await requisitar_(corpo);
      }

      if (!json.ok) {
        if (json.error && json.error.toLowerCase().indexOf('sessão') !== -1) {
          Auth.encerrarSessaoLocal();
          App.mostrarTelaLogin();
        }
        const erro = new Error(json.error || 'Erro desconhecido retornado pelo servidor.');
        // dados (sessão 2026-08-12): payload extra que o backend às vezes manda
        // junto com o erro (ver fail_ em Utils.gs) - hoje só texto_ocr_debug em
        // lerAnexoNotaEmpenho, pra diagnosticar leituras que falharam (antes
        // esse texto só vinha em respostas de sucesso, exatamente o oposto de
        // quando faz falta). undefined pra qualquer chamada que não manda nada.
        erro.dados = json.data;
        throw erro;
      }
      if (usarCache) cache.set(chave, json.data);
      return json.data;
    } finally {
      if (!silencioso) UI.esconderCarregando();
    }
  }

  return { chamar, definirToken, invalidarCache };
})();
