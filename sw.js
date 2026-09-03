/**
 * GAOCG App - Service Worker MÍNIMO (sessão 2026-09-01, pedido do usuário:
 * app instalável na tela inicial do celular/desktop).
 *
 * Existe SÓ pra satisfazer o requisito de "instalável" do Chrome/Android
 * (precisa de um service worker registrado com handler de fetch, mesmo que
 * ele não faça nada) - NÃO cacheia nada, de propósito.
 *
 * Por quê: o app inteiro depende de uma conexão viva com o Apps Script (não
 * existe modo offline - sem rede, não tem como logar nem carregar nada
 * mesmo). Um cache aqui não daria "modo offline" de verdade, só criaria uma
 * nova camada de staleness em cima do cache HTTP normal do navegador -
 * exatamente a classe de bug que JÁ aconteceu nesta sessão (anel de
 * carregamento preso em 0% porque o navegador tinha um js/app.js antigo em
 * cache, sessão 2026-09-01, "O carregamento só fica em 0%"). Se um dia
 * quiser cache de verdade aqui, pense muito bem em como invalidar
 * corretamente a cada deploy antes de adicionar - NÃO é grátis.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Passthrough puro - deixa o navegador cuidar do cache normal dele, sem
// interceptar/guardar nada aqui.
//
// SÓ intercepta GET (achado 2026-09-03, pedido do usuário: "vez ou outra o
// app fica bem lento pra carregar e dá esse erro... Parâmetro action
// ausente"): repassar `event.request` pra um novo fetch() dentro do SW
// funciona quase sempre, mas sob rede instável o navegador às vezes precisa
// reenviar a requisição internamente - e o corpo (stream) de um POST já
// consumido na 1ª tentativa sai VAZIO no reenvio. O backend (Code.gs) trata
// corpo vazio como "sem action nenhum" e devolve exatamente esse erro. Como
// este Service Worker não faz cache nenhum (só existe pra satisfazer o
// requisito de instalabilidade, que basta um handler de fetch existir - não
// que ele intercepte tudo), não há motivo pra tocar em POST/PUT/DELETE: só
// GET passa por aqui, o resto segue direto pelo navegador, sem risco nenhum
// de corpo perdido.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
