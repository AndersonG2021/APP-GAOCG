/**
 * GAOCG App - Alternador de visual (sessão 2026-08-13, pedido do usuário).
 *
 * O redesenho visual (paleta, tipografia, espaçamento, tema escuro - ver
 * css/tema-novo.css) roda em PARALELO ao visual de sempre, ligado por um
 * atributo em <html> (data-tema="novo"|"antigo") em vez de substituir
 * css/style.css. Isso deixa a volta pro visual de sempre a um clique de
 * distância, caso o novo visual esconda algum bug grande demais pra
 * conviver com o trabalho do dia a dia - nenhuma outra tela ou função deste
 * app é alterada por este módulo, só a aparência.
 *
 * O <html> já chega com o atributo certo ANTES do parser montar o <body> -
 * ver o script inline em index.html, que roda a MESMA leitura de
 * localStorage de forma síncrona (script normal, não "defer"), porque este
 * arquivo só executa depois que o parsing termina - tarde demais pra evitar
 * o "flash" de um tema trocando pro outro.
 */
const Tema = (function () {
  const CHAVE_VISUAL = 'gaocg_tema_visual'; // 'novo' | 'antigo'
  const CHAVE_MODO_COR = 'gaocg_tema_modo_cor'; // 'sistema' | 'claro' | 'escuro'

  function visualAtual() {
    return localStorage.getItem(CHAVE_VISUAL) || 'antigo';
  }
  function modoCorAtual() {
    return localStorage.getItem(CHAVE_MODO_COR) || 'sistema';
  }

  function aplicarNoDom_(visual, modoCor) {
    document.documentElement.setAttribute('data-tema', visual);
    if (modoCor === 'sistema') document.documentElement.removeAttribute('data-modo-cor');
    else document.documentElement.setAttribute('data-modo-cor', modoCor);
  }

  function definirVisual(visual) {
    localStorage.setItem(CHAVE_VISUAL, visual);
    aplicarNoDom_(visual, modoCorAtual());
    atualizarControles_();
  }

  function definirModoCor(modoCor) {
    localStorage.setItem(CHAVE_MODO_COR, modoCor);
    aplicarNoDom_(visualAtual(), modoCor);
    atualizarControles_();
  }

  const ICONE_MONITOR = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>';
  const ICONE_SOL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/></svg>';
  const ICONE_LUA = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>';

  /** Injeta o controle no #temaControles (ver index.html, dentro de #barraTopo). */
  function montarControles() {
    const alvo = document.getElementById('temaControles');
    if (!alvo) return;
    alvo.innerHTML = `
      <div class="tema-controles">
        <div class="tema-segmento" role="group" aria-label="Visual do app">
          <button type="button" class="tema-seg-btn" data-visual="antigo">Atual</button>
          <button type="button" class="tema-seg-btn" data-visual="novo">Novo</button>
        </div>
        <div class="tema-modo-cor oculto" id="temaModoCor">
          <button type="button" class="tema-modo-btn" data-modo="sistema" title="Seguir o sistema">${ICONE_MONITOR}</button>
          <button type="button" class="tema-modo-btn" data-modo="claro" title="Claro">${ICONE_SOL}</button>
          <button type="button" class="tema-modo-btn" data-modo="escuro" title="Escuro">${ICONE_LUA}</button>
        </div>
      </div>`;
    alvo.querySelectorAll('.tema-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => definirVisual(btn.dataset.visual));
    });
    alvo.querySelectorAll('.tema-modo-btn').forEach(btn => {
      btn.addEventListener('click', () => definirModoCor(btn.dataset.modo));
    });
    atualizarControles_();
  }

  function atualizarControles_() {
    const alvo = document.getElementById('temaControles');
    if (!alvo) return;
    const visual = visualAtual();
    const modo = modoCorAtual();
    alvo.querySelectorAll('.tema-seg-btn').forEach(btn => btn.classList.toggle('ativo', btn.dataset.visual === visual));
    alvo.querySelectorAll('.tema-modo-btn').forEach(btn => btn.classList.toggle('ativo', btn.dataset.modo === modo));
    const wrapModo = document.getElementById('temaModoCor');
    if (wrapModo) wrapModo.classList.toggle('oculto', visual !== 'novo');
  }

  return { montarControles, definirVisual, definirModoCor, visualAtual, modoCorAtual };
})();
