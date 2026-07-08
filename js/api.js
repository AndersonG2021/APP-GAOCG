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

  async function chamar(action, payload, opcoes) {
    const usarCache = !!(opcoes && opcoes.cache);
    const chave = usarCache ? chaveCache(action, payload) : null;
    if (usarCache && cache.has(chave)) return cache.get(chave);

    const corpo = Object.assign({ action, token }, payload || {});

    UI.mostrarCarregando();
    try {
      const resposta = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(corpo)
      });

      if (!resposta.ok) {
        throw new Error('Falha de comunicação com o servidor (HTTP ' + resposta.status + ').');
      }

      const json = await resposta.json();
      if (!json.ok) {
        if (json.error && json.error.toLowerCase().indexOf('sessão') !== -1) {
          Auth.encerrarSessaoLocal();
          App.mostrarTelaLogin();
        }
        throw new Error(json.error || 'Erro desconhecido retornado pelo servidor.');
      }
      if (usarCache) cache.set(chave, json.data);
      return json.data;
    } finally {
      UI.esconderCarregando();
    }
  }

  return { chamar, definirToken, invalidarCache };
})();
