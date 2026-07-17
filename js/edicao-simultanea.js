/**
 * GAOCG App - Aviso de Edição Simultânea (Funcionalidade 10).
 * Sempre informativo, nunca bloqueia: oferece "Sair" ou "Continuar mesmo assim".
 * Sem expiração automática por tempo - a decisão é sempre manual e imediata.
 */

const EdicaoSimultanea = (function () {
  /** Resolve com true se a tela de edição pode abrir, false se o usuário escolheu "Sair". */
  function entrarEmEdicao(tipoProcesso, processoId) {
    return Api.chamar('abrirEdicao', { tipoProcesso, processoId }).then(resposta => {
      if (!resposta.emEdicaoPorOutro) return true;

      return new Promise(resolve => {
        const corpo = `<p>Este processo está sendo editado por <strong>${UI.escaparHtml(resposta.usuario_nome)}</strong>
          desde ${UI.formatarData(resposta.iniciado_em)}.</p>
          <p>Você pode sair e voltar mais tarde, ou continuar mesmo assim (a última gravação prevalece).</p>`;
        UI.abrirModal('Edição em andamento', corpo,
          `<button class="botao" id="btnSairEdicao">Sair</button>
           <button class="botao primario" id="btnContinuarEdicao">Continuar mesmo assim</button>`,
          { pequeno: true });

        document.getElementById('btnSairEdicao').addEventListener('click', () => {
          UI.fecharModal();
          resolve(false);
        });
        document.getElementById('btnContinuarEdicao').addEventListener('click', async () => {
          await Api.chamar('assumirEdicao', { tipoProcesso, processoId });
          UI.fecharModal();
          resolve(true);
        });
      });
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

  return { entrarEmEdicao, sairDaEdicao };
})();
