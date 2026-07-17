/**
 * GAOCG App - Acompanhamento de Notas de Empenho (Funcionalidade 5, item 4).
 * O cadastro de novas NEs continua sendo feito dentro da tela de SOF (produto
 * final do processo); esta tela é o acompanhamento transversal dos valores:
 * um card por número de NE (original + reforços somados), com o valor atual
 * (bruto - liquidado nos Recibos vinculados) em destaque, e alerta quando
 * esse valor fica abaixo da parcela mensal da fonte correspondente.
 */

const TelaNotasEmpenho = (function () {
  const OPCOES_FONTE = ['TESOURO', 'SUS', 'Outra'];
  let unidades = [];
  let grupos = [];

  async function render() {
    const [unidadesCarregadas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true }, { cache: true }),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    unidades = unidadesCarregadas;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Notas de Empenho</h2>
      <div class="painel">
        <p class="ajuda">Cada card agrupa a Nota de Empenho original e seus reforços pelo número. O valor atual já desconta o que foi liquidado nos Recibos vinculados a essa NE.</p>
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="neBusca" placeholder="número, SEI, valor..." /></div>
          <div class="campo"><label>Unidade</label>
            <select id="neFiltroUnidade"><option value="">Todas</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>OSS</label>
            <select id="neFiltroOss"><option value="">Todas</option>${opcoesOss.map(o => `<option>${UI.escaparHtml(o.valor)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Objeto</label>
            <select id="neFiltroObjeto"><option value="">Todos</option>${opcoesObjeto.map(o => `<option>${UI.escaparHtml(o.valor)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Tipo de unidade</label>
            <select id="neFiltroTipoUnidade"><option value="">Todos</option>${tiposUnidade.map(t => `<option>${UI.escaparHtml(t)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>DEA</label>
            <select id="neFiltroDea"><option value="">Todas</option><option>SIM</option><option>NÃO</option></select>
          </div>
          <div class="campo"><label>Fonte</label>
            <select id="neFiltroFonte"><option value="">Todas</option>${OPCOES_FONTE.map(f => `<option>${f}</option>`).join('')}</select>
          </div>
          <button class="botao" id="btnFiltrarNe">Filtrar</button>
        </div>
        <div id="listaNe"></div>
      </div>`;
    document.getElementById('btnFiltrarNe').addEventListener('click', carregar);
    document.getElementById('neBusca').addEventListener('keydown', e => { if (e.key === 'Enter') carregar(); });
    await carregar();
  }

  async function carregar() {
    const params = {
      busca: document.getElementById('neBusca').value.trim(),
      unidade_id: document.getElementById('neFiltroUnidade').value,
      oss: document.getElementById('neFiltroOss').value,
      objeto: document.getElementById('neFiltroObjeto').value,
      tipo_unidade: document.getElementById('neFiltroTipoUnidade').value,
      dea: document.getElementById('neFiltroDea').value,
      fonte: document.getElementById('neFiltroFonte').value
    };
    grupos = await Api.chamar('listarNotasEmpenho', params);
    renderCards();
  }

  function renderCards() {
    const alvo = document.getElementById('listaNe');
    if (!grupos.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhuma Nota de Empenho encontrada.</p>'; return; }
    alvo.innerHTML = `<div class="grade-cards-sof">${grupos.map(g => {
      const unidade = unidades.find(u => u.id === g.sof_unidade_id);
      return `
        <div class="cartao-ne ${g.alerta ? 'alerta' : ''}" data-numero="${UI.escaparHtml(g.numero_ne)}">
          <div class="cartao-sof-cabecalho">
            <h3>NE ${UI.escaparHtml(g.numero_ne)}</h3>
            <span class="cartao-ne-valor ${g.alerta ? 'vermelho' : ''}">${UI.formatarMoeda(g.valor_atual)}</span>
          </div>
          <div class="cartao-sof-meta">
            <span>${UI.escaparHtml(unidade ? unidade.nome : '-')}</span>
            <span class="selo azul">${UI.escaparHtml(g.fonte || '-')}</span>
            ${g.alerta ? '<span class="selo vermelho">Abaixo da parcela mensal</span>' : ''}
          </div>
          <p class="cartao-sof-objeto">${UI.escaparHtml(g.sof_objeto || '-')}</p>
          <p class="cartao-ne-detalhe">Bruto: ${UI.formatarMoeda(g.valor_bruto)} &minus; Liquidado: ${UI.formatarMoeda(g.valor_liquidado)}</p>
          <div class="cartao-ne-rodape">
            ${(g.arquivos || []).map((a, i) => `<a href="${UI.escaparHtml(a.url)}" target="_blank" rel="noopener">Ver arquivo ${i + 1}</a>`).join(' · ') || '<span class="ajuda">Sem arquivos</span>'}
            <button type="button" class="botao sucesso" data-acao="reforco">+ Reforço</button>
          </div>
        </div>`;
    }).join('')}</div>`;

    alvo.querySelectorAll('.cartao-ne').forEach(cartao => {
      const grupo = grupos.find(g => g.numero_ne === cartao.dataset.numero);
      cartao.querySelector('[data-acao="reforco"]').addEventListener('click', () => abrirModalReforco(grupo));
    });
  }

  function abrirModalReforco(grupo) {
    const corpo = `
      <form id="formReforcoNe">
        <p class="ajuda">Reforço para a NE ${UI.escaparHtml(grupo.numero_ne)} (fonte ${UI.escaparHtml(grupo.fonte)}).</p>
        <div class="campo"><label>Valor do reforço *</label><input id="reforcoValor" type="number" step="0.01" required /></div>
        <div class="campo"><label>Arquivo *</label><input type="file" id="reforcoArquivo" accept=".pdf,image/*" required /></div>
        <p id="reforcoErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Adicionar reforço', corpo,
      `<button class="botao" id="btnCancelarReforco">Cancelar</button><button class="botao primario" id="btnSalvarReforco">Salvar</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarReforco').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarReforco').addEventListener('click', async () => {
      const erroEl = document.getElementById('reforcoErro');
      erroEl.classList.add('oculto');
      const valor = document.getElementById('reforcoValor').value;
      const arquivo = document.getElementById('reforcoArquivo').files[0];
      if (!valor || Number(valor) <= 0) { UI.mostrarErro(erroEl, 'Informe um valor válido.'); return; }
      if (!arquivo) { UI.mostrarErro(erroEl, 'Anexe o arquivo do reforço.'); return; }
      if (arquivo.size > 8 * 1024 * 1024) { UI.mostrarErro(erroEl, 'Arquivo muito grande (máximo 8MB).'); return; }

      try {
        const arquivoBase64 = await UI.lerArquivoBase64(arquivo);
        await Api.chamar('criarNotaEmpenho', {
          data: {
            sof_id: grupo.sof_id, tipo: 'reforco', numero_ne: grupo.numero_ne, fonte: grupo.fonte, valor,
            arquivoBase64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type
          }
        });
        UI.toast('Reforço adicionado.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  return { render };
})();
