/**
 * GAOCG App - Modo de cor (claro/escuro/sistema) do visual "novo".
 *
 * Até 2026-08-13..14 este módulo também deixava escolher entre o visual
 * "Atual" (antigo, css/style.css puro) e o "Novo" (css/tema-novo.css, ligado
 * por data-tema="novo" em <html>) - um período de transição pra poder voltar
 * atrás caso o redesenho escondesse algum bug grande demais pra conviver com
 * o trabalho do dia a dia. Isso não se confirmou e a escolha foi removida
 * (sessão 2026-08-14, pedido do usuário): data-tema="novo" agora é fixo,
 * aplicado direto no script inline de index.html, sem depender deste
 * arquivo nem de preferência salva. O que sobra aqui é só o modo de cor
 * dentro do visual novo (claro/escuro/sistema), que continua sendo escolha
 * do usuário.
 */
const Tema = (function () {
  const CHAVE_MODO_COR = 'gaocg_tema_modo_cor'; // 'sistema' | 'claro' | 'escuro'

  function modoCorAtual() {
    return localStorage.getItem(CHAVE_MODO_COR) || 'sistema';
  }

  function definirModoCor(modoCor) {
    localStorage.setItem(CHAVE_MODO_COR, modoCor);
    if (modoCor === 'sistema') document.documentElement.removeAttribute('data-modo-cor');
    else document.documentElement.setAttribute('data-modo-cor', modoCor);
    atualizarControles_();
  }

  const ICONE_MONITOR = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>';
  const ICONE_SOL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/></svg>';
  const ICONE_LUA = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>';

  /** Injeta o controle no #temaControles (ver index.html, dentro de #barraTopo). */
  function montarControles() {
    const alvo = document.getElementById('temaControles');
    if (!alvo) return;
    alvo.innerHTML = `
      <div class="tema-controles">
        <div class="tema-modo-cor" id="temaModoCor">
          <button type="button" class="tema-modo-btn" data-modo="sistema" title="Seguir o sistema">${ICONE_MONITOR}</button>
          <button type="button" class="tema-modo-btn" data-modo="claro" title="Claro">${ICONE_SOL}</button>
          <button type="button" class="tema-modo-btn" data-modo="escuro" title="Escuro">${ICONE_LUA}</button>
        </div>
      </div>`;
    alvo.querySelectorAll('.tema-modo-btn').forEach(btn => {
      btn.addEventListener('click', () => definirModoCor(btn.dataset.modo));
    });
    atualizarControles_();
  }

  function atualizarControles_() {
    const alvo = document.getElementById('temaControles');
    if (!alvo) return;
    const modo = modoCorAtual();
    alvo.querySelectorAll('.tema-modo-btn').forEach(btn => btn.classList.toggle('ativo', btn.dataset.modo === modo));
  }

  return { montarControles, definirModoCor, modoCorAtual };
})();
