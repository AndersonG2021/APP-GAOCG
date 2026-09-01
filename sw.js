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
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
