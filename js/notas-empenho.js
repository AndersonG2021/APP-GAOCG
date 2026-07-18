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
  const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
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
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovaNe">+ Nova Nota de Empenho</button>
        </div>
        <div id="listaNe"></div>
      </div>`;
    document.getElementById('btnFiltrarNe').addEventListener('click', carregar);
    document.getElementById('neBusca').addEventListener('keydown', e => { if (e.key === 'Enter') carregar(); });
    document.getElementById('btnNovaNe').addEventListener('click', abrirModalNovaNe);
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
          ${(g.cronograma || []).length ? `<a href="#" class="cartao-ne-ver-cronograma">Ver cronograma de desembolso</a>
          <div class="cartao-ne-cronograma oculto">${g.cronograma.map(c => `<div class="cartao-ne-cronograma-linha"><span>${NOMES_MESES[c.mes - 1] || c.mes}</span><span>${UI.formatarMoeda(c.valor)}</span></div>`).join('')}</div>` : ''}
          <div class="cartao-ne-rodape">
            ${(g.arquivos || []).map((a, i) => `<a href="${UI.escaparHtml(a.url)}" target="_blank" rel="noopener">Ver arquivo ${i + 1}</a>`).join(' · ') || '<span class="ajuda">Sem arquivos</span>'}
            <button type="button" class="botao sucesso" data-acao="reforco">+ Reforço</button>
          </div>
        </div>`;
    }).join('')}</div>`;

    alvo.querySelectorAll('.cartao-ne').forEach(cartao => {
      const grupo = grupos.find(g => g.numero_ne === cartao.dataset.numero);
      cartao.querySelector('[data-acao="reforco"]').addEventListener('click', () => abrirModalReforco(grupo));
      const linkCronograma = cartao.querySelector('.cartao-ne-ver-cronograma');
      if (linkCronograma) linkCronograma.addEventListener('click', e => {
        e.preventDefault();
        linkCronograma.nextElementSibling.classList.toggle('oculto');
      });
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

  /** Renderiza (ou esconde) o preview de cronograma dentro do modal de criação. */
  function renderCronogramaPreview_(cronograma) {
    const alvo = document.getElementById('novaNeCronograma');
    if (!cronograma || !cronograma.length) { alvo.classList.add('oculto'); alvo.innerHTML = ''; return; }
    alvo.classList.remove('oculto');
    alvo.innerHTML = `<label>Cronograma de desembolso (lido do documento)</label>
      <div class="cronograma-ne-grade">${cronograma.map(c => `<div class="cronograma-ne-item"><span>${UI.escaparHtml(c.rotulo)}</span><span>${UI.formatarMoeda(c.valor)}</span></div>`).join('')}</div>`;
  }

  /**
   * "Nova Nota de Empenho" - Unidade -> SOF em comum, depois:
   * - Original: Fonte + anexo, com OCR (backend lerAnexoNotaEmpenho)
   *   preenchendo Número/Cronograma/Preço Total e travando os campos (mesmo
   *   padrão de ligarAnexoComOcr_ em js/recibos.js) - "Remover anexo" libera
   *   pra tentar de novo.
   * - Reforço: escolhe a NE original já existente (do mesmo SOF) a reforçar
   *   e informa valor + arquivo, sem OCR (mesma validação simples já usada
   *   em abrirModalReforco).
   */
  function abrirModalNovaNe() {
    const corpo = `
      <form id="formNovaNe">
        <div class="campo"><label>Tipo *</label>
          <select id="novaNeTipo">
            <option value="original">Nota de Empenho original (nova)</option>
            <option value="reforco">Reforço de uma Nota de Empenho já existente</option>
          </select>
        </div>
        <div class="grade-2">
          <div class="campo"><label>Unidade *</label>
            <select id="novaNeUnidade" required><option value="">Selecione...</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>SOF *</label>
            <select id="novaNeSof" required><option value="">Selecione a unidade primeiro</option></select>
          </div>
        </div>
        <div id="blocoNovaNeOriginal">
        <div class="campo"><label>Fonte *</label>
            <select id="novaNeFonte" required><option value="">Selecione o SOF primeiro</option></select>
          </div>
        <div class="campo"><label>Anexo da Nota de Empenho *</label><input type="file" id="novaNeArquivo" accept=".pdf,image/*" /></div>
        <p class="ajuda">Ao anexar, o número, o cronograma de desembolso e o preço total são lidos automaticamente do documento.</p>
        <p id="novaNeStatusAnexo" class="ajuda oculto"></p>
        <div class="campo"><label>Número</label><input id="novaNeNumero" readonly /></div>
        <div id="novaNeCronograma" class="oculto"></div>
        <div class="campo"><label>Preço Total</label><input id="novaNePrecoTotal" readonly /></div>
        <p id="novaNeAvisoDivergencia" class="aviso-divergencia oculto">⚠ A soma do cronograma não bate com o Preço Total do documento.</p>
        </div>

        <div id="blocoNovaNeReforco" class="oculto">
          <div class="campo"><label>Nota de Empenho a reforçar *</label>
            <select id="novaNeReforcoAlvo" required><option value="">Selecione o SOF primeiro</option></select>
          </div>
          <div class="campo"><label>Valor do reforço *</label><input id="novaNeReforcoValor" type="number" step="0.01" /></div>
          <div class="campo"><label>Arquivo *</label><input type="file" id="novaNeReforcoArquivo" accept=".pdf,image/*" /></div>
        </div>

        <p id="novaNeErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Nova Nota de Empenho', corpo,
      `<button class="botao" id="btnCancelarNovaNe">Cancelar</button><button class="botao primario" id="btnSalvarNovaNe">Salvar</button>`);

    let sofsDaUnidade = [];
    let notasOriginaisDoSof = [];
    let leituraOcr = null;

    document.getElementById('novaNeTipo').addEventListener('change', function () {
      const ehReforco = this.value === 'reforco';
      document.getElementById('blocoNovaNeOriginal').classList.toggle('oculto', ehReforco);
      document.getElementById('blocoNovaNeReforco').classList.toggle('oculto', !ehReforco);
    });

    document.getElementById('novaNeUnidade').addEventListener('change', async function () {
      const selectSof = document.getElementById('novaNeSof');
      document.getElementById('novaNeFonte').innerHTML = '<option value="">Selecione o SOF primeiro</option>';
      document.getElementById('novaNeReforcoAlvo').innerHTML = '<option value="">Selecione o SOF primeiro</option>';
      sofsDaUnidade = [];
      notasOriginaisDoSof = [];
      if (!this.value) { selectSof.innerHTML = '<option value="">Selecione a unidade primeiro</option>'; return; }
      selectSof.innerHTML = '<option value="">Carregando...</option>';
      const resposta = await Api.chamar('listarSof', { unidade_id: this.value, pageSize: 1000 });
      sofsDaUnidade = resposta.items;
      selectSof.innerHTML = sofsDaUnidade.length
        ? '<option value="">Selecione...</option>' + sofsDaUnidade.map(s => `<option value="${s.id}">${UI.escaparHtml(s.sof_numero || s.id)} - ${UI.escaparHtml(s.objeto || '')}</option>`).join('')
        : '<option value="">Nenhum SOF cadastrado nesta unidade</option>';
    });

    document.getElementById('novaNeSof').addEventListener('change', async function () {
      const selectFonte = document.getElementById('novaNeFonte');
      const selectReforcoAlvo = document.getElementById('novaNeReforcoAlvo');
      const sof = sofsDaUnidade.find(s => s.id === this.value);
      const fontes = sof ? (sof.fontes || []) : [];
      selectFonte.innerHTML = fontes.length
        ? '<option value="">Selecione...</option>' + fontes.map(f => `<option>${UI.escaparHtml(f.fonte)}</option>`).join('')
        : '<option value="">Nenhuma fonte cadastrada neste SOF</option>';

      notasOriginaisDoSof = [];
      if (!this.value) { selectReforcoAlvo.innerHTML = '<option value="">Selecione o SOF primeiro</option>'; return; }
      selectReforcoAlvo.innerHTML = '<option value="">Carregando...</option>';
      const notas = await Api.chamar('listarNotasEmpenhoPorSof', { sofId: this.value });
      notasOriginaisDoSof = notas.filter(n => n.tipo === 'original');
      selectReforcoAlvo.innerHTML = notasOriginaisDoSof.length
        ? '<option value="">Selecione...</option>' + notasOriginaisDoSof.map(n => `<option value="${UI.escaparHtml(n.numero_ne)}">NE ${UI.escaparHtml(n.numero_ne)} (${UI.escaparHtml(n.fonte)})</option>`).join('')
        : '<option value="">Nenhuma Nota de Empenho original neste SOF</option>';
    });

    document.getElementById('novaNeArquivo').addEventListener('change', async function () {
      const inputEl = this;
      const arquivo = inputEl.files[0];
      const statusEl = document.getElementById('novaNeStatusAnexo');
      const erroEl = document.getElementById('novaNeErro');
      erroEl.classList.add('oculto');
      if (!arquivo) return;
      if (arquivo.size > 8 * 1024 * 1024) { UI.toast('Arquivo muito grande (máximo 8MB).', 'erro'); inputEl.value = ''; return; }
      statusEl.classList.remove('oculto');
      statusEl.textContent = 'Lendo documento...';
      try {
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        leituraOcr = { numero_ne: resultado.numero_ne, cronograma: resultado.cronograma, preco_total: resultado.preco_total, arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type };
        document.getElementById('novaNeNumero').value = resultado.numero_ne;
        document.getElementById('novaNePrecoTotal').value = resultado.preco_total;
        renderCronogramaPreview_(resultado.cronograma);
        document.getElementById('novaNeAvisoDivergencia').classList.toggle('oculto', !resultado.cronograma_diverge_do_total);
        statusEl.innerHTML = '🔒 Dados lidos do documento. <a href="#" id="novaNeRemoverAnexo">Remover anexo</a>';
        document.getElementById('novaNeRemoverAnexo').addEventListener('click', function (e) {
          e.preventDefault();
          leituraOcr = null;
          inputEl.value = '';
          document.getElementById('novaNeNumero').value = '';
          document.getElementById('novaNePrecoTotal').value = '';
          renderCronogramaPreview_([]);
          document.getElementById('novaNeAvisoDivergencia').classList.add('oculto');
          statusEl.classList.add('oculto');
        });
      } catch (err) {
        inputEl.value = '';
        leituraOcr = null;
        statusEl.classList.add('oculto');
        UI.toast(err.message, 'erro');
      }
    });

    document.getElementById('btnCancelarNovaNe').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarNovaNe').addEventListener('click', async () => {
      const erroEl = document.getElementById('novaNeErro');
      erroEl.classList.add('oculto');
      const sofId = document.getElementById('novaNeSof').value;
      if (!sofId) { UI.mostrarErro(erroEl, 'Selecione o SOF.'); return; }
      const ehReforco = document.getElementById('novaNeTipo').value === 'reforco';

      if (ehReforco) {
        const numeroNe = document.getElementById('novaNeReforcoAlvo').value;
        const notaOriginal = notasOriginaisDoSof.find(n => n.numero_ne === numeroNe);
        const valor = document.getElementById('novaNeReforcoValor').value;
        const arquivo = document.getElementById('novaNeReforcoArquivo').files[0];
        if (!notaOriginal) { UI.mostrarErro(erroEl, 'Selecione a Nota de Empenho a reforçar.'); return; }
        if (!valor || Number(valor) <= 0) { UI.mostrarErro(erroEl, 'Informe um valor válido para o reforço.'); return; }
        if (!arquivo) { UI.mostrarErro(erroEl, 'Anexe o arquivo do reforço.'); return; }
        if (arquivo.size > 8 * 1024 * 1024) { UI.mostrarErro(erroEl, 'Arquivo muito grande (máximo 8MB).'); return; }
        try {
          const arquivoBase64 = await UI.lerArquivoBase64(arquivo);
          await Api.chamar('criarNotaEmpenho', {
            data: {
              sof_id: sofId, tipo: 'reforco', numero_ne: notaOriginal.numero_ne, fonte: notaOriginal.fonte, valor,
              arquivoBase64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type
            }
          });
          UI.toast('Reforço adicionado.', 'sucesso');
          UI.fecharModal();
          await carregar();
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
        return;
      }

      const fonte = document.getElementById('novaNeFonte').value;
      if (!fonte) { UI.mostrarErro(erroEl, 'Selecione a fonte.'); return; }
      if (!leituraOcr) { UI.mostrarErro(erroEl, 'Anexe o documento da Nota de Empenho.'); return; }
      try {
        await Api.chamar('criarNotaEmpenho', {
          data: {
            sof_id: sofId, tipo: 'original', numero_ne: leituraOcr.numero_ne, fonte, valor: leituraOcr.preco_total,
            cronograma: leituraOcr.cronograma,
            arquivoBase64: leituraOcr.arquivoBase64, arquivoNome: leituraOcr.arquivoNome, arquivoTipo: leituraOcr.arquivoTipo
          }
        });
        UI.toast('Nota de Empenho criada.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  return { render };
})();
