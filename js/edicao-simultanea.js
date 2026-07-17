/**
 * GAOCG App - Aviso de Edição Simultânea (Funcionalidade 10).
 * Sempre informativo, nunca bloqueia: oferece "Sair" ou "Continuar mesmo assim".
 * Sem expiração automática por tempo - a decisão é sempre manual e imediata.
 *
 * Fluxo otimista (ver PROGRESS.md, seção de Performance): abrir uma edição não
 * espera mais a checagem de conflito responder - o formulário já abre com os
 * dados que a tela já tinha localmente, e a checagem roda em paralelo. Só se
 * vier de fato um conflito é que um aviso aparece, alguns instantes depois,
 * dentro do formulário já aberto. Isso elimina uma requisição inteira do
 * caminho crítico de "abrir edição" no caso comum (ninguém mais editando).
 */
const EdicaoSimultanea = (function () {
  /** Dispara a checagem de conflito em segundo plano - não bloqueia nada, o chamador não espera essa promise antes de abrir o formulário. */
  function iniciarEdicao(tipoProcesso, processoId) {
    return Api.chamar('abrirEdicao', { tipoProcesso, processoId }).catch(() => null);
  }

  /**
   * Chamar logo depois de abrir o formulário. Se a checagem em segundo plano
   * voltar com conflito, injeta um aviso no topo do formulário já aberto.
   */
  async function tratarConflito(promiseEdicao, tipoProcesso, processoId) {
    const resposta = await promiseEdicao;
    if (!resposta || !resposta.emEdicaoPorOutro) return;

    const modalCorpo = document.getElementById('modalCorpo');
    if (!modalCorpo) return; // o modal já foi fechado antes da checagem responder

    const aviso = document.createElement('div');
    aviso.className = 'aviso-edicao-simultanea';
    aviso.innerHTML = `
      <p>Este processo está sendo editado por <strong>${UI.escaparHtml(resposta.usuario_nome)}</strong>
      desde ${UI.formatarData(resposta.iniciado_em)}.</p>
      <p>Você pode sair e voltar mais tarde, ou continuar mesmo assim (a última gravação prevalece).</p>
      <div class="aviso-edicao-simultanea-botoes">
        <button type="button" class="botao" id="btnSairEdicaoConflito">Sair</button>
        <button type="button" class="botao primario" id="btnContinuarEdicaoConflito">Continuar mesmo assim</button>
      </div>`;
    modalCorpo.insertBefore(aviso, modalCorpo.firstChild);

    document.getElementById('btnSairEdicaoConflito').addEventListener('click', () => {
      // Nunca chegamos a assumir a trava (abrirEdicao detectou o conflito e
      // não sobrescreveu a linha, que continua com o outro usuário) - zera o
      // callback de fechar pra não chamar liberarEdicao sobre a trava alheia.
      UI.aoFecharModal(() => {});
      UI.fecharModal();
    });
    document.getElementById('btnContinuarEdicaoConflito').addEventListener('click', async () => {
      await Api.chamar('assumirEdicao', { tipoProcesso, processoId }, { silencioso: true }).catch(() => {});
      aviso.remove();
    });
  }

  /**
   * Chamada de limpeza pura (libera a trava pra outros usuários) - o modal já
   * fechou da tela antes disso rodar, então não há por que travar a interface
   * com o spinner global esperando essa resposta (ver Api.chamar/silencioso).
   */
  function sairDaEdicao(tipoProcesso, processoId) {
    return Api.chamar('liberarEdicao', { tipoProcesso, processoId }, { silencioso: true }).catch(() => {});
  }

  return { iniciarEdicao, tratarConflito, sairDaEdicao };
})();
