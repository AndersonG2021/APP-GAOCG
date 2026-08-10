/**
 * GAOCG App - Ponte com a extensão "GAOCG SEI Bridge" (Extension/gaocg-sei-bridge).
 *
 * Envia um documento gerado aqui (hoje: a SOF) para um processo JÁ ABERTO numa
 * aba do SEI, preenchendo o formulário nativo de "Incluir Documento". Não há
 * servidor no meio nem API do SEI: a extensão automatiza o DOM sobre a sessão
 * do próprio usuário, então só funciona com o SEI aberto e logado no mesmo
 * navegador.
 *
 * Pré-requisitos (se algum faltar, o usuário recebe uma mensagem dizendo qual):
 *   1. Chrome/Edge com a extensão instalada em modo desenvolvedor;
 *   2. o ID da extensão configurado aqui (ver ID_PADRAO_/idExtensao abaixo);
 *   3. uma aba aberta em sei.pe.gov.br com o processo carregado.
 */

const SeiBridge = (function () {
  /**
   * ID da extensão sem compactação. ATENÇÃO: o Chrome deriva esse ID do
   * CAMINHO da pasta no disco - se a pasta for movida ou renomeada, o ID muda e
   * este valor precisa ser atualizado.
   *
   * Para não exigir um novo deploy do app a cada mudança de ID (a extensão é
   * carregada manualmente por cada máquina), o valor pode ser sobrescrito em
   * runtime pelo localStorage, sem tocar no código:
   *
   *     localStorage.setItem('gaocg_sei_extension_id', 'novo-id-aqui');
   *
   * O ID abaixo veio do README da extensão (lá ele estava com um espaço à
   * esquerda, o que fazia o sendMessage falhar silenciosamente - corrigido).
   */
  const ID_PADRAO_ = 'mnohlkhmphcilholmgolecdelpmebkdg';
  const CHAVE_ID_LOCAL_ = 'gaocg_sei_extension_id';

  function idExtensao() {
    let salvo = '';
    try { salvo = localStorage.getItem(CHAVE_ID_LOCAL_) || ''; } catch (e) { salvo = ''; }
    return (salvo || ID_PADRAO_).trim();
  }

  function extensaoDisponivel() {
    return !!(window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage);
  }

  /**
   * chrome.runtime.sendMessage é baseado em callback e sinaliza falha por
   * chrome.runtime.lastError (que PRECISA ser lido, senão o Chrome loga
   * "Unchecked runtime.lastError" no console). Aqui vira Promise, com um
   * timeout próprio: se a extensão não existir, em alguns casos o callback
   * simplesmente nunca é chamado.
   */
  function enviarMensagem_(mensagem, timeoutMs) {
    return new Promise((resolve, reject) => {
      let concluido = false;
      const temporizador = setTimeout(() => {
        if (concluido) return;
        concluido = true;
        reject(new Error('A extensão não respondeu. Verifique se ela está instalada e ativa em chrome://extensions.'));
      }, timeoutMs || 30000);

      try {
        chrome.runtime.sendMessage(idExtensao(), mensagem, (resposta) => {
          if (concluido) return;
          concluido = true;
          clearTimeout(temporizador);
          const erro = chrome.runtime.lastError;
          if (erro) {
            reject(new Error(
              'Não foi possível falar com a extensão GAOCG SEI Bridge (' + erro.message + '). ' +
              'Confira se ela está instalada e se o ID configurado está correto.'
            ));
            return;
          }
          resolve(resposta || {});
        });
      } catch (e) {
        if (concluido) return;
        concluido = true;
        clearTimeout(temporizador);
        reject(e);
      }
    });
  }

  /**
   * O documento da SOF é gerado por montarDocumentoSeiHtml_ (js/sof.js) como um
   * HTML completo (<html>/<head><style>/<body>), próprio para baixar ou
   * imprimir. O editor do SEI (CKEditor) recebe só o CONTEÚDO do corpo e
   * descarta <style>, então aqui o documento é convertido: pega o body e
   * transforma as regras da folha de estilo em atributos style inline, que
   * sobrevivem à colagem no editor.
   *
   * Sem isso, o documento chegaria no SEI sem nenhuma borda de tabela - é o
   * grosso do layout da SOF (cronograma de desembolso, assinaturas).
   */
  function prepararHtmlParaEditor_(htmlCompleto) {
    const doc = new DOMParser().parseFromString(htmlCompleto, 'text/html');
    const corpo = doc.body;
    if (!corpo) return htmlCompleto;

    const aplicar = (seletor, estilo) => {
      corpo.querySelectorAll(seletor).forEach(el => {
        el.setAttribute('style', ((el.getAttribute('style') || '') + ';' + estilo).replace(/^;/, ''));
      });
    };

    aplicar('table.sei-tabela', 'border-collapse:collapse;width:100%;margin:8px 0');
    aplicar('table.sei-tabela td, table.sei-tabela th', 'border:1px solid #000;padding:4px 8px;font-size:10.5pt;vertical-align:top');
    aplicar('table.sei-tabela th', 'text-align:center');
    aplicar('p', 'margin:6pt 0;text-align:justify');
    aplicar('h2', 'text-align:center;font-size:13pt');
    aplicar('.sei-direita', 'text-align:right');
    aplicar('.sei-assinatura-ne', 'background:#f1c40f');
    aplicar('.sei-assinatura-nl', 'background:#e6a19b');

    // border="1" como reforço: se o SEI higienizar os atributos style, as
    // tabelas ainda saem com borda em vez de virar texto corrido.
    corpo.querySelectorAll('table.sei-tabela').forEach(t => t.setAttribute('border', '1'));

    return corpo.innerHTML;
  }

  /**
   * Envia a SOF para o SEI. `htmlCompleto` é o retorno de
   * montarDocumentoSeiHtml_ (js/sof.js) - reaproveitado exatamente como está,
   * pra o que vai ao SEI ser o MESMO documento que o botão "Salvar e gerar
   * documento SEI" baixa.
   *
   * autoEnviar fica sempre false: o analista revisa e clica em "Confirmar
   * Dados" no próprio SEI. É um sistema de processos oficial - confirmar
   * automaticamente um documento sem revisão humana não é algo que o app deva
   * fazer por conta própria.
   */
  async function enviarSof(sof, htmlCompleto) {
    if (!extensaoDisponivel()) {
      UI.toast('Extensão GAOCG SEI Bridge não encontrada. Instale-a no Chrome/Edge para enviar direto ao SEI.', 'erro');
      return false;
    }
    if (!sof.sei) {
      UI.toast('Esta SOF não tem o número do processo SEI preenchido - não dá pra saber para qual processo enviar.', 'erro');
      return false;
    }

    try {
      const resposta = await enviarMensagem_({
        type: 'ENVIAR_DOCUMENTO',
        numeroProcesso: sof.sei,
        documento: {
          tipo: 'sof',
          numero: sof.sof_numero ? ('SOF ' + sof.sof_numero) : String(sof.id || ''),
          descricaoEspecificacao: sof.objeto || '',
          observacoes: sof.observacao || '',
          nivelAcesso: 'publico',
          conteudoHtml: prepararHtmlParaEditor_(htmlCompleto),
          autoEnviar: false
        }
      });

      if (!resposta.ok) {
        UI.toast('SEI: ' + (resposta.erro || 'erro desconhecido ao preencher o documento.'), 'erro');
        return false;
      }
      // conteudoInserido === false: o cadastro foi preenchido, mas o editor de
      // texto ainda não estava aberto (no SEI ele só aparece depois de
      // "Confirmar Dados"). O usuário precisa saber disso, senão confirma um
      // documento vazio achando que deu tudo certo.
      UI.toast(
        resposta.conteudoInserido
          ? 'Dados enviados ao SEI. Revise na aba do SEI e clique em "Confirmar Dados".'
          : 'Cadastro preenchido no SEI. Confirme os dados e cole o conteúdo do documento no editor que abrir.',
        'sucesso'
      );
      return true;
    } catch (e) {
      UI.toast(e.message, 'erro');
      return false;
    }
  }

  return { enviarSof, extensaoDisponivel, prepararHtmlParaEditor_ };
})();
