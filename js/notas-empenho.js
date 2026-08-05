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
  const ICONE_PASTA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
  let unidades = [];
  let grupos = [];
  let gruposTodos = [];
  let ultimoFiltroJson = null;
  let paginaAtual = 1;
  let totalRegistros = 0;
  const TAMANHO_PAGINA = 20;

  /**
   * opts (opcional, vindo do Dashboard via App.navegarPara): `saldoBaixo: true`
   * já marca o filtro "Somente saldo < 20% da parcela" antes da primeira carga
   * (card "NEs com saldo baixo" do Dashboard).
   */
  async function render(opts) {
    const [unidadesCarregadas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    unidades = unidadesCarregadas.items;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Notas de Empenho</h2>
      <div class="painel">
        <p class="ajuda">Cada card agrupa a Nota de Empenho original e seus reforços pelo número. O valor atual já desconta o que foi liquidado nos Recibos vinculados a essa NE.</p>
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="neBusca" placeholder="número, SEI, valor..." /></div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="neFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="neFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="neFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo de unidade</label>
            <div id="neFiltroTipoUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroTipoUnidade" title="Limpar filtro de Tipo de unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">DEA</label>
            <div id="neFiltroDea"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroDea" title="Limpar filtro de DEA">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Fonte</label>
            <div id="neFiltroFonte"></div><button type="button" class="filtro-multiplo-x" data-alvo="neFiltroFonte" title="Limpar filtro de Fonte">&times;</button>
          </div>
          <div class="campo campo-checkbox-filtro">
            <label class="rotulo-checkbox"><input type="checkbox" id="neFiltroSaldoBaixo" /> Somente saldo &lt; 20% da parcela</label>
          </div>
          <button class="botao" id="btnFiltrarNe">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosNe">Limpar filtros</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovaNe">+ Nova Nota de Empenho</button>
        </div>
        <div id="listaNe"></div>
        <div class="paginacao" id="paginacaoNe"></div>
      </div>`;
    document.getElementById('btnFiltrarNe').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('neBusca').addEventListener('keydown', e => { if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    document.getElementById('btnNovaNe').addEventListener('click', abrirModalNovaNe);
    // Unidade/Tipo de unidade/OSS se estreitam entre si em tempo real (sessão
    // 2026-07-27) - ver UI.recalcularFiltrosCruzadosUnidade (js/app.js).
    const recalcularFiltrosCruzados_ = () => UI.recalcularFiltrosCruzadosUnidade({
      idUnidade: 'neFiltroUnidade', idTipo: 'neFiltroTipoUnidade', idOss: 'neFiltroOss',
      unidadesTodas: unidades, opcoesTipoOriginais: tiposUnidade, opcoesOssOriginais: opcoesOss.map(o => o.valor)
    });
    UI.criarFiltroMultiplo('neFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })), recalcularFiltrosCruzados_);
    UI.criarFiltroMultiplo('neFiltroOss', opcoesOss.map(o => o.valor), recalcularFiltrosCruzados_);
    UI.criarFiltroMultiplo('neFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.criarFiltroMultiplo('neFiltroTipoUnidade', tiposUnidade, recalcularFiltrosCruzados_);
    UI.criarFiltroMultiplo('neFiltroDea', ['SIM', 'NÃO']);
    UI.criarFiltroMultiplo('neFiltroFonte', OPCOES_FONTE);
    document.getElementById('neFiltroSaldoBaixo').addEventListener('change', () => {
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    });
    if (opts && opts.saldoBaixo) document.getElementById('neFiltroSaldoBaixo').checked = true;
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosNe', () => {
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    }, aoLimparFiltroIndividual_);
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('neBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('neFiltroUnidade'),
      oss: UI.valoresFiltroMultiplo('neFiltroOss'),
      objeto: UI.valoresFiltroMultiplo('neFiltroObjeto'),
      tipo_unidade: UI.valoresFiltroMultiplo('neFiltroTipoUnidade'),
      dea: UI.valoresFiltroMultiplo('neFiltroDea'),
      fonte: UI.valoresFiltroMultiplo('neFiltroFonte'),
      saldoBaixo: document.getElementById('neFiltroSaldoBaixo').checked
    };
  }

  /** Chave de filtrosAtuais() correspondente a cada id de filtro-multiplo da barra - ver aoLimparFiltroIndividual_. */
  const CHAVE_POR_FILTRO_ = {
    neFiltroUnidade: 'unidade_id', neFiltroOss: 'oss', neFiltroObjeto: 'objeto',
    neFiltroTipoUnidade: 'tipo_unidade', neFiltroDea: 'dea', neFiltroFonte: 'fonte'
  };

  /**
   * "x" individual de um filtro: recarrega usando o último filtro realmente
   * aplicado (ultimoFiltroJson), só com este campo zerado por cima - ver
   * mesma função em js/sof.js para a explicação completa.
   */
  function aoLimparFiltroIndividual_(idCampo) {
    const chave = CHAVE_POR_FILTRO_[idCampo];
    if (!chave) return;
    const aplicado = ultimoFiltroJson ? JSON.parse(ultimoFiltroJson) : {};
    const filtros = Object.assign({}, aplicado, { [chave]: [] });
    paginaAtual = 1;
    carregarComFiltros_(filtros);
  }

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  async function carregar() {
    await carregarComFiltros_(filtrosAtuais());
  }

  async function carregarComFiltros_(filtros) {
    // Zera o cache do combo "Nota de Empenho a Reforçar" (Nova NE -> Reforço):
    // ele é buscado sem filtro na primeira vez que esse tipo é selecionado no
    // modal, e precisa refletir qualquer NE criada desde o último carregar().
    gruposTodos = [];
    ultimoFiltroJson = JSON.stringify(filtros);
    const params = Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtros);
    const resposta = await CacheAbas.comRevalidacao('notasEmpenho', params,
      () => Api.chamar('listarNotasEmpenho', params),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  function aplicarResposta_(resposta) {
    grupos = resposta.items;
    totalRegistros = resposta.total;
    renderCards();
    renderPaginacao();
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / TAMANHO_PAGINA));
    document.getElementById('paginacaoNe').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="botoes">
        <button class="botao" id="nePagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="nePagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('nePagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('nePagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
  }

  function seloSituacao_(situacao) {
    if (situacao === 'Pago') return 'verde';
    if (situacao === 'Liquidado') return 'azul';
    if (situacao === 'Em processamento') return 'amarelo';
    return 'cinza';
  }

  /**
   * "Cronograma solicitado" (sessão 2026-07-29, pedido do usuário): meses
   * SOLICITADOS pela SOF (fonte+objeto casada com esta NE), verde quando o
   * acumulado empenhado (mãe + reforços) já cobre o acumulado solicitado até
   * aquele mês, vermelho quando ainda não - vem pronto do backend
   * (g.cronograma_solicitado, montarGruposNotasEmpenho_ em NotasEmpenho.gs).
   * Diferente do cronograma abaixo (que é o lido por OCR do documento da NE,
   * com Situação vinda dos Recibos/pagamento) - aqui o sinal é só "o valor
   * empenhado já dá pra cobrir esse mês do que a SOF pediu", sem depender de
   * já ter sido liquidado/pago.
   */
  function cronogramaSolicitadoBoxHtml_(g) {
    const meses = g.cronograma_solicitado || [];
    if (!meses.length) return '';
    const total = meses.reduce((s, c) => s + Number(c.valor || 0), 0);
    return `
      <div class="cartao-ne-cronograma-solicitado">
        <div class="cartao-ne-cronograma-cabecalho">
          <div>
            <strong>CRONOGRAMA SOLICITADO (SOF)</strong>
            <div class="ajuda">${UI.escaparHtml(g.objeto || g.sof_objeto || '-')}</div>
          </div>
          <span class="cartao-ne-cronograma-badge">${meses.length} meses</span>
        </div>
        <div class="cronograma-solicitado-grade">
          ${meses.map(c => `
            <div class="cronograma-solicitado-item ${c.atendido ? 'atendido' : 'pendente'}" title="${c.atendido ? 'Coberto pelo total atendido' : 'Ainda não atendido'}">
              <span class="cronograma-solicitado-mes">${UI.escaparHtml(NOMES_MESES[c.mes - 1] || c.mes)}</span>
              <span class="cronograma-solicitado-valor">${UI.formatarMoeda(c.valor)}</span>
            </div>`).join('')}
        </div>
        <p class="ajuda">🟩 já coberto pelo total atendido (R$ ${UI.formatarMoeda(g.total_atendido)}) · 🟥 ainda não atendido · Total solicitado: ${UI.formatarMoeda(total)}</p>
      </div>`;
  }

  function cronogramaBoxHtml_(g) {
    const cronograma = g.cronograma || [];
    const total = cronograma.reduce((s, c) => s + Number(c.valor || 0), 0);
    const confereTotal = Math.abs(total - Number(g.valor_bruto || 0)) < 0.01;
    return `
      <div class="cartao-ne-cronograma-caixa oculto">
        ${cronogramaSolicitadoBoxHtml_(g)}
        ${cronograma.length ? `
        <div class="cartao-ne-cronograma-cabecalho">
          <div>
            <strong>CRONOGRAMA DE DESEMBOLSO (documento)</strong>
            <div class="ajuda">Pagamentos mensais · ${g.ano || ''}</div>
          </div>
          <span class="cartao-ne-cronograma-badge">${cronograma.length} meses</span>
        </div>
        <table class="tabela">
          <thead><tr><th>Mês</th><th>Valor previsto</th><th>Situação</th></tr></thead>
          <tbody>${cronograma.map(c => `
            <tr>
              <td>${UI.escaparHtml(NOMES_MESES[c.mes - 1] || c.mes)}${c.reforco ? ' <span class="selo azul">+ reforço</span>' : ''}</td>
              <td>${UI.formatarMoeda(c.valor)}</td>
              <td><span class="selo ${seloSituacao_(c.situacao)}">${UI.escaparHtml(c.situacao)}</span></td>
            </tr>`).join('') || '<tr><td colspan="3" class="estado-vazio">Sem cronograma lido para esta NE.</td></tr>'}</tbody>
          <tfoot><tr>
            <td><strong>Total do cronograma</strong></td>
            <td><strong>${UI.formatarMoeda(total)}</strong></td>
            <td class="ajuda">${confereTotal ? 'Conforme valor bruto' : 'Diverge do valor bruto'}</td>
          </tr></tfoot>
        </table>` : ''}
      </div>`;
  }

  function cartaoNeHtml_(g) {
    const cronograma = g.cronograma || [];
    const cronogramaSolicitado = g.cronograma_solicitado || [];
    const temCronograma = cronograma.length > 0 || cronogramaSolicitado.length > 0;
    return `
      <div class="cartao-ne ${g.alerta ? 'alerta' : ''}" data-numero="${UI.escaparHtml(g.numero_ne)}">
        <div class="cartao-ne-topo">
          <span class="cartao-ne-meta">${ICONE_PASTA} ${UI.escaparHtml(g.objeto || '-')} · SOF ${UI.escaparHtml(g.sof_numero || '-')}</span>
          ${g.alerta ? '<span class="selo vermelho">Saldo abaixo da parcela</span>' : ''}
        </div>
        <h3 class="cartao-ne-numero">${UI.escaparHtml(g.numero_ne)}</h3>
        <p class="cartao-ne-unidade">${UI.escaparHtml(g.unidade_nome || '-')}</p>
        <div class="cartao-ne-infogrid">
          <div class="cartao-ne-infogrid-item"><span>Total Solicitado</span><strong>${UI.formatarMoeda(g.total_solicitado)}</strong></div>
          <div class="cartao-ne-infogrid-item"><span>Total Atendido</span><strong>${UI.formatarMoeda(g.total_atendido)}</strong></div>
          <div class="cartao-ne-infogrid-item"><span>Saldo Atual</span><strong class="${g.alerta ? 'vermelho' : ''}">${UI.formatarMoeda(g.saldo_atual)}</strong></div>
          <div class="cartao-ne-infogrid-item"><span>Falta ser Atendido</span><strong>${UI.formatarMoeda(g.falta_atendido)}</strong></div>
        </div>
        <div class="cartao-ne-rodape">
          <div class="cartao-ne-rodape-links">
            ${temCronograma ? '<a href="#" class="cartao-ne-ver-cronograma">Ver cronograma ↓</a>' : '<span class="ajuda">Sem cronograma</span>'}
            ${(g.arquivos || []).map((a, i) => `<a href="${UI.escaparHtml(a.url)}" target="_blank" rel="noopener">Ver arquivo${g.arquivos.length > 1 ? ' ' + (i + 1) : ''}</a>`).join('')}
          </div>
          <button type="button" class="botao sucesso" data-acao="reforco">+ Reforço</button>
        </div>
        ${temCronograma ? cronogramaBoxHtml_(g) : ''}
      </div>`;
  }

  function renderCards() {
    const alvo = document.getElementById('listaNe');
    if (!grupos.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhuma Nota de Empenho encontrada.</p>'; return; }
    alvo.innerHTML = `<div class="grade-cards-sof">${grupos.map(cartaoNeHtml_).join('')}</div>`;

    alvo.querySelectorAll('.cartao-ne').forEach(cartao => {
      const grupo = grupos.find(g => g.numero_ne === cartao.dataset.numero);
      cartao.querySelector('[data-acao="reforco"]').addEventListener('click', () => abrirModalReforco(grupo));
      const linkCronograma = cartao.querySelector('.cartao-ne-ver-cronograma');
      if (linkCronograma) linkCronograma.addEventListener('click', e => {
        e.preventDefault();
        const caixa = cartao.querySelector('.cartao-ne-cronograma-caixa');
        caixa.classList.toggle('oculto');
        const aberto = !caixa.classList.contains('oculto');
        linkCronograma.textContent = aberto ? 'Ocultar cronograma ↑' : 'Ver cronograma ↓';
      });
    });
  }

  /**
   * "+ Reforço" no card da NE (sessão 2026-07-29, pedido do usuário): o
   * documento é lido por OCR (mesma extração de lerAnexoNotaEmpenho usada
   * pra NE original) - se o documento tiver a tabela "Cronograma de
   * Desembolso", cada mês com valor > 0 é tratado como um mês reforçado (o
   * analista não digita nada: 1 mês vira 1 reforço, 2+ meses viram vários
   * reforços de uma vez, todos compartilhando o mesmo arquivo anexado -
   * criarReforcosEmLote, NotasEmpenho.gs). Se o documento não tiver essa
   * tabela (formato mais simples, sem cronograma), cai pro Preço Total lido
   * como valor único, sem mês associado - só nesse caso residual (ou se a
   * leitura falhar) os campos manuais de Mês/Valor ficam disponíveis, como
   * uma rede de segurança, não o caminho principal.
   */
  function abrirModalReforco(grupo) {
    const corpo = `
      <form id="formReforcoNe">
        <p class="ajuda">Reforço para a NE ${UI.escaparHtml(grupo.numero_ne)} (fonte ${UI.escaparHtml(grupo.fonte)}). Anexe o documento - os meses reforçados e os valores são identificados automaticamente.</p>
        <div class="campo"><label>Arquivo *</label><input type="file" id="reforcoArquivo" accept=".pdf,image/*" required /></div>
        <p id="reforcoStatusAnexo" class="ajuda oculto"></p>
        <div id="reforcoMesesDetectados" class="oculto"></div>
        <div class="grade-2" id="reforcoManualCampos">
          <div class="campo"><label>Mês de referência do reforço *</label>
            <select id="reforcoMes" required><option value="">Selecione...</option>${NOMES_MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Valor do reforço *</label><input id="reforcoValor" type="number" step="0.01" required /></div>
        </div>
        <p id="reforcoErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Adicionar reforço', corpo,
      `<button class="botao" id="btnCancelarReforco">Cancelar</button><button class="botao primario" id="btnSalvarReforco">Salvar</button>`,
      { pequeno: true });

    UI.tornarPesquisavel('reforcoMes');

    let itensDetectados = null; // [{mes_referencia, valor}, ...] quando o OCR acha 1+ meses no cronograma do documento
    let arquivoLido = null; // {arquivoBase64, arquivoNome, arquivoTipo}

    function mostrarMesesDetectados_(itens) {
      const alvo = document.getElementById('reforcoMesesDetectados');
      if (!itens || !itens.length) { alvo.classList.add('oculto'); alvo.innerHTML = ''; return; }
      alvo.classList.remove('oculto');
      alvo.innerHTML = `<label>Meses reforçados (lidos do documento)</label>
        <div class="cronograma-ne-grade">${itens.map(it => `<div class="cronograma-ne-item"><span>${UI.escaparHtml(NOMES_MESES[it.mes_referencia - 1])}</span><span>${UI.formatarMoeda(it.valor)}</span></div>`).join('')}</div>`;
    }

    document.getElementById('reforcoArquivo').addEventListener('change', async function () {
      const inputEl = this;
      const arquivo = inputEl.files[0];
      const statusEl = document.getElementById('reforcoStatusAnexo');
      const erroEl = document.getElementById('reforcoErro');
      const camposManuais = document.getElementById('reforcoManualCampos');
      erroEl.classList.add('oculto');
      itensDetectados = null;
      arquivoLido = null;
      mostrarMesesDetectados_(null);
      if (!arquivo) return;
      if (arquivo.size > 8 * 1024 * 1024) { UI.toast('Arquivo muito grande (máximo 8MB).', 'erro'); inputEl.value = ''; return; }
      statusEl.classList.remove('oculto');
      statusEl.textContent = 'Lendo documento...';
      try {
        const base64 = await UI.lerArquivoBase64(arquivo);
        arquivoLido = { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type };
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        const mesesComValor = (resultado.cronograma || []).filter(c => Number(c.valor) > 0);

        let mensagemStatus;
        if (mesesComValor.length) {
          itensDetectados = mesesComValor.map(c => ({ mes_referencia: c.mes, valor: c.valor }));
          mostrarMesesDetectados_(itensDetectados);
          camposManuais.classList.add('oculto');
          document.getElementById('reforcoMes').required = false;
          document.getElementById('reforcoValor').required = false;
          const totalDetectado = itensDetectados.reduce((s, it) => s + it.valor, 0);
          mensagemStatus = `🔒 ${itensDetectados.length} mês(es) identificado(s) automaticamente, total ${UI.formatarMoeda(totalDetectado)}.`;
        } else if (resultado.preco_total) {
          document.getElementById('reforcoValor').value = resultado.preco_total;
          document.getElementById('reforcoValor').readOnly = true;
          camposManuais.classList.remove('oculto');
          mensagemStatus = `🔒 Valor lido do documento (${UI.formatarMoeda(resultado.preco_total)}) - não foi possível identificar o mês; selecione manualmente.`;
        } else {
          camposManuais.classList.remove('oculto');
          mensagemStatus = 'Não foi possível ler meses nem valor no documento - preencha manualmente.';
        }
        statusEl.innerHTML = mensagemStatus + ' <a href="#" id="reforcoRemoverAnexo">Remover anexo' + (itensDetectados ? '' : ' / preencher manualmente') + '</a>';
        document.getElementById('reforcoRemoverAnexo').addEventListener('click', e => {
          e.preventDefault();
          itensDetectados = null;
          arquivoLido = null;
          inputEl.value = '';
          mostrarMesesDetectados_(null);
          camposManuais.classList.remove('oculto');
          document.getElementById('reforcoMes').required = true;
          document.getElementById('reforcoValor').required = true;
          document.getElementById('reforcoValor').readOnly = false;
          document.getElementById('reforcoValor').value = '';
          statusEl.classList.add('oculto');
        });
      } catch (err) {
        inputEl.value = '';
        arquivoLido = null;
        statusEl.classList.add('oculto');
        camposManuais.classList.remove('oculto');
        UI.toast('Não foi possível ler o documento automaticamente - preencha manualmente. ' + err.message, 'erro');
      }
    });

    document.getElementById('btnCancelarReforco').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarReforco').addEventListener('click', async () => {
      const erroEl = document.getElementById('reforcoErro');
      erroEl.classList.add('oculto');
      if (!arquivoLido) { UI.mostrarErro(erroEl, 'Anexe o arquivo do reforço.'); return; }

      try {
        if (itensDetectados && itensDetectados.length) {
          await Api.chamar('criarReforcosEmLote', {
            data: Object.assign({ sof_id: grupo.sof_id, numero_ne: grupo.numero_ne, itens: itensDetectados }, arquivoLido)
          });
        } else {
          const mesReferencia = document.getElementById('reforcoMes').value;
          const valor = document.getElementById('reforcoValor').value;
          if (!mesReferencia) { UI.mostrarErro(erroEl, 'Selecione o mês de referência do reforço.'); return; }
          if (!valor || Number(valor) <= 0) { UI.mostrarErro(erroEl, 'Informe um valor válido.'); return; }
          await Api.chamar('criarNotaEmpenho', {
            data: Object.assign({ sof_id: grupo.sof_id, tipo: 'reforco', numero_ne: grupo.numero_ne, fonte: grupo.fonte, valor, mes_referencia: mesReferencia }, arquivoLido)
          });
        }
        CacheAbas.invalidar('notasEmpenho');
        // Reforço muda o valor atendido acumulado da fonte+objeto - a tela de
        // SOF (cronograma verde/vermelho) precisa refletir isso na próxima
        // vez que for aberta, não só a tela de NE.
        CacheAbas.invalidar('sof');
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
   * "Nova Nota de Empenho":
   * - Original: Unidade -> SOF em comum -> Fonte + anexo, com OCR (backend
   *   lerAnexoNotaEmpenho) preenchendo Número/Cronograma/Preço Total e
   *   travando os campos (mesmo padrão de ligarAnexoComOcr_ em js/recibos.js)
   *   - "Remover anexo" libera pra tentar de novo.
   * - Reforço (sessão 2026-07-29, com OCR): os campos Unidade/SOF somem -
   *   busca direto, num combo pesquisável, a Nota de Empenho original (de
   *   qualquer SOF/unidade) a reforçar; ao anexar o arquivo, o OCR
   *   (lerAnexoNotaEmpenho) tenta identificar sozinho quais meses foram
   *   reforçados e o valor de cada um (mesmo mecanismo de abrirModalReforco,
   *   duplicado aqui por ser um modal/DOM separado) - Mês/Valor manuais só
   *   aparecem como reserva, se a leitura não achar a tabela de cronograma.
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
        <div id="blocoNovaNeUnidadeSof" class="grade-2">
          <div class="campo"><label>Unidade *</label>
            <select id="novaNeUnidade" required><option value="">Selecione...</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>SOF *</label>
            <select id="novaNeSof" required><option value="">Selecione a unidade primeiro</option></select>
          </div>
        </div>
        <div id="blocoNovaNeOriginal">
        <div class="grade-2">
          <div class="campo"><label>Fonte *</label>
            <select id="novaNeFonte" required><option value="">Selecione o SOF primeiro</option></select>
          </div>
          <div class="campo"><label>Objeto *</label>
            <select id="novaNeObjeto" required><option value="">Selecione a fonte primeiro</option></select>
          </div>
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
          <div class="campo"><label>Nota de Empenho a Reforçar *</label>
            <select id="novaNeReforcoAlvo" required><option value="">Selecione o tipo "Reforço" acima</option></select>
          </div>
          <div class="campo"><label>Arquivo *</label><input type="file" id="novaNeReforcoArquivo" accept=".pdf,image/*" /></div>
          <p class="ajuda">Ao anexar, os meses reforçados e os valores são identificados automaticamente.</p>
          <p id="novaNeReforcoStatusAnexo" class="ajuda oculto"></p>
          <div id="novaNeReforcoMesesDetectados" class="oculto"></div>
          <div class="grade-2" id="novaNeReforcoManualCampos">
            <div class="campo"><label>Mês de referência do reforço *</label>
              <select id="novaNeReforcoMes" required><option value="">Selecione...</option>${NOMES_MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
            </div>
            <div class="campo"><label>Valor do reforço *</label><input id="novaNeReforcoValor" type="number" step="0.01" /></div>
          </div>
        </div>

        <p id="novaNeErro" class="erro-campo oculto"></p>
      </form>`;
    UI.abrirModal('Nova Nota de Empenho', corpo,
      `<button class="botao" id="btnCancelarNovaNe">Cancelar</button><button class="botao primario" id="btnSalvarNovaNe">Salvar</button>`);

    let sofsDaUnidade = [];
    let leituraOcr = null;
    let fontesDoSofAtual = [];
    // Reforço lido por OCR (sessão 2026-07-29) - ver abrirModalReforco (mesma
    // lógica, duplicada aqui porque este modal tem seu próprio DOM/estado).
    let itensReforcoDetectados = null;
    let arquivoReforcoLido = null;

    function mostrarMesesReforcoDetectados_(itens) {
      const alvo = document.getElementById('novaNeReforcoMesesDetectados');
      if (!alvo) return;
      if (!itens || !itens.length) { alvo.classList.add('oculto'); alvo.innerHTML = ''; return; }
      alvo.classList.remove('oculto');
      alvo.innerHTML = `<label>Meses reforçados (lidos do documento)</label>
        <div class="cronograma-ne-grade">${itens.map(it => `<div class="cronograma-ne-item"><span>${UI.escaparHtml(NOMES_MESES[it.mes_referencia - 1])}</span><span>${UI.formatarMoeda(it.valor)}</span></div>`).join('')}</div>`;
    }

    /** Repopula o <select> de Objeto a partir da Fonte escolhida (cascata, sessão 2026-07-29). */
    function atualizarObjetoNovaNe_() {
      const selectObjeto = document.getElementById('novaNeObjeto');
      const fonteValor = document.getElementById('novaNeFonte').value;
      const opcoes = Array.from(new Set(fontesDoSofAtual.filter(f => f.fonte === fonteValor).map(f => f.objeto).filter(Boolean)));
      selectObjeto.innerHTML = opcoes.length
        ? opcoes.map(o => `<option value="${UI.escaparHtml(o)}">${UI.escaparHtml(o)}</option>`).join('')
        : '<option value="">Selecione a fonte primeiro</option>';
      selectObjeto.disabled = !opcoes.length;
    }

    ['novaNeUnidade', 'novaNeSof', 'novaNeReforcoAlvo', 'novaNeReforcoMes'].forEach(id => UI.tornarPesquisavel(id));

    document.getElementById('novaNeTipo').addEventListener('change', async function () {
      const ehReforco = this.value === 'reforco';
      document.getElementById('blocoNovaNeUnidadeSof').classList.toggle('oculto', ehReforco);
      document.getElementById('blocoNovaNeOriginal').classList.toggle('oculto', ehReforco);
      document.getElementById('blocoNovaNeReforco').classList.toggle('oculto', !ehReforco);
      if (ehReforco && !gruposTodos.length) {
        const selectAlvo = document.getElementById('novaNeReforcoAlvo');
        selectAlvo.innerHTML = '<option value="">Carregando...</option>';
        gruposTodos = (await Api.chamar('listarNotasEmpenho', { pageSize: 100000 })).items;
        selectAlvo.innerHTML = gruposTodos.length
          ? '<option value="">Selecione...</option>' + gruposTodos.map(g => `<option value="${UI.escaparHtml(g.numero_ne)}">NE ${UI.escaparHtml(g.numero_ne)} — ${UI.escaparHtml(g.unidade_nome || '')} — ${UI.escaparHtml(g.fonte || '')}</option>`).join('')
          : '<option value="">Nenhuma Nota de Empenho cadastrada</option>';
        UI.tornarPesquisavel('novaNeReforcoAlvo');
      }
    });

    document.getElementById('novaNeUnidade').addEventListener('change', async function () {
      const selectSof = document.getElementById('novaNeSof');
      document.getElementById('novaNeFonte').innerHTML = '<option value="">Selecione o SOF primeiro</option>';
      sofsDaUnidade = [];
      if (!this.value) { selectSof.innerHTML = '<option value="">Selecione a unidade primeiro</option>'; UI.tornarPesquisavel('novaNeSof'); return; }
      selectSof.innerHTML = '<option value="">Carregando...</option>';
      const resposta = await Api.chamar('listarSof', { unidade_id: this.value, pageSize: 1000 });
      sofsDaUnidade = resposta.items;
      selectSof.innerHTML = sofsDaUnidade.length
        ? '<option value="">Selecione...</option>' + sofsDaUnidade.map(s => `<option value="${s.id}">${UI.escaparHtml(s.sof_numero || s.id)} - ${UI.escaparHtml(s.objeto || '')}</option>`).join('')
        : '<option value="">Nenhum SOF cadastrado nesta unidade</option>';
      UI.tornarPesquisavel('novaNeSof');
    });

    document.getElementById('novaNeSof').addEventListener('change', function () {
      const selectFonte = document.getElementById('novaNeFonte');
      const sof = sofsDaUnidade.find(s => s.id === this.value);
      fontesDoSofAtual = sof ? (sof.fontes || []) : [];
      const fontesUnicas = Array.from(new Set(fontesDoSofAtual.map(f => f.fonte).filter(Boolean)));
      selectFonte.innerHTML = fontesUnicas.length
        ? '<option value="">Selecione...</option>' + fontesUnicas.map(f => `<option>${UI.escaparHtml(f)}</option>`).join('')
        : '<option value="">Nenhuma fonte cadastrada neste SOF</option>';
      atualizarObjetoNovaNe_();
    });
    document.getElementById('novaNeFonte').addEventListener('change', atualizarObjetoNovaNe_);

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

    document.getElementById('novaNeReforcoArquivo').addEventListener('change', async function () {
      const inputEl = this;
      const arquivo = inputEl.files[0];
      const statusEl = document.getElementById('novaNeReforcoStatusAnexo');
      const erroEl = document.getElementById('novaNeErro');
      const camposManuais = document.getElementById('novaNeReforcoManualCampos');
      erroEl.classList.add('oculto');
      itensReforcoDetectados = null;
      arquivoReforcoLido = null;
      mostrarMesesReforcoDetectados_(null);
      if (!arquivo) return;
      if (arquivo.size > 8 * 1024 * 1024) { UI.toast('Arquivo muito grande (máximo 8MB).', 'erro'); inputEl.value = ''; return; }
      statusEl.classList.remove('oculto');
      statusEl.textContent = 'Lendo documento...';
      try {
        const base64 = await UI.lerArquivoBase64(arquivo);
        arquivoReforcoLido = { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type };
        const resultado = await Api.chamar('lerAnexoNotaEmpenho', { arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type });
        const mesesComValor = (resultado.cronograma || []).filter(c => Number(c.valor) > 0);

        let mensagemStatus;
        if (mesesComValor.length) {
          itensReforcoDetectados = mesesComValor.map(c => ({ mes_referencia: c.mes, valor: c.valor }));
          mostrarMesesReforcoDetectados_(itensReforcoDetectados);
          camposManuais.classList.add('oculto');
          document.getElementById('novaNeReforcoMes').required = false;
          document.getElementById('novaNeReforcoValor').required = false;
          const totalDetectado = itensReforcoDetectados.reduce((s, it) => s + it.valor, 0);
          mensagemStatus = `🔒 ${itensReforcoDetectados.length} mês(es) identificado(s) automaticamente, total ${UI.formatarMoeda(totalDetectado)}.`;
        } else if (resultado.preco_total) {
          document.getElementById('novaNeReforcoValor').value = resultado.preco_total;
          document.getElementById('novaNeReforcoValor').readOnly = true;
          camposManuais.classList.remove('oculto');
          mensagemStatus = `🔒 Valor lido do documento (${UI.formatarMoeda(resultado.preco_total)}) - não foi possível identificar o mês; selecione manualmente.`;
        } else {
          camposManuais.classList.remove('oculto');
          mensagemStatus = 'Não foi possível ler meses nem valor no documento - preencha manualmente.';
        }
        statusEl.innerHTML = mensagemStatus + ' <a href="#" id="novaNeReforcoRemoverAnexo">Remover anexo' + (itensReforcoDetectados ? '' : ' / preencher manualmente') + '</a>';
        document.getElementById('novaNeReforcoRemoverAnexo').addEventListener('click', e => {
          e.preventDefault();
          itensReforcoDetectados = null;
          arquivoReforcoLido = null;
          inputEl.value = '';
          mostrarMesesReforcoDetectados_(null);
          camposManuais.classList.remove('oculto');
          document.getElementById('novaNeReforcoMes').required = true;
          document.getElementById('novaNeReforcoValor').required = true;
          document.getElementById('novaNeReforcoValor').readOnly = false;
          document.getElementById('novaNeReforcoValor').value = '';
          statusEl.classList.add('oculto');
        });
      } catch (err) {
        inputEl.value = '';
        arquivoReforcoLido = null;
        statusEl.classList.add('oculto');
        camposManuais.classList.remove('oculto');
        UI.toast('Não foi possível ler o documento automaticamente - preencha manualmente. ' + err.message, 'erro');
      }
    });

    document.getElementById('btnCancelarNovaNe').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarNovaNe').addEventListener('click', async () => {
      const erroEl = document.getElementById('novaNeErro');
      erroEl.classList.add('oculto');
      const ehReforco = document.getElementById('novaNeTipo').value === 'reforco';

      if (ehReforco) {
        const numeroNe = document.getElementById('novaNeReforcoAlvo').value;
        const grupo = gruposTodos.find(g => g.numero_ne === numeroNe);
        if (!grupo) { UI.mostrarErro(erroEl, 'Selecione a Nota de Empenho a reforçar.'); return; }
        if (!arquivoReforcoLido) { UI.mostrarErro(erroEl, 'Anexe o arquivo do reforço.'); return; }
        try {
          if (itensReforcoDetectados && itensReforcoDetectados.length) {
            await Api.chamar('criarReforcosEmLote', {
              data: Object.assign({ sof_id: grupo.sof_id, numero_ne: grupo.numero_ne, itens: itensReforcoDetectados }, arquivoReforcoLido)
            });
          } else {
            const mesReferencia = document.getElementById('novaNeReforcoMes').value;
            const valor = document.getElementById('novaNeReforcoValor').value;
            if (!mesReferencia) { UI.mostrarErro(erroEl, 'Selecione o mês de referência do reforço.'); return; }
            if (!valor || Number(valor) <= 0) { UI.mostrarErro(erroEl, 'Informe um valor válido para o reforço.'); return; }
            await Api.chamar('criarNotaEmpenho', {
              data: Object.assign({ sof_id: grupo.sof_id, tipo: 'reforco', numero_ne: grupo.numero_ne, fonte: grupo.fonte, valor, mes_referencia: mesReferencia }, arquivoReforcoLido)
            });
          }
          CacheAbas.invalidar('notasEmpenho');
          CacheAbas.invalidar('sof');
          UI.toast('Reforço adicionado.', 'sucesso');
          UI.fecharModal();
          await carregar();
        } catch (err) {
          UI.mostrarErro(erroEl, err.message);
        }
        return;
      }

      const sofId = document.getElementById('novaNeSof').value;
      if (!sofId) { UI.mostrarErro(erroEl, 'Selecione o SOF.'); return; }
      const fonte = document.getElementById('novaNeFonte').value;
      if (!fonte) { UI.mostrarErro(erroEl, 'Selecione a fonte.'); return; }
      const objeto = document.getElementById('novaNeObjeto').value;
      if (!objeto) { UI.mostrarErro(erroEl, 'Selecione o objeto.'); return; }
      if (!leituraOcr) { UI.mostrarErro(erroEl, 'Anexe o documento da Nota de Empenho.'); return; }
      try {
        await Api.chamar('criarNotaEmpenho', {
          data: {
            sof_id: sofId, tipo: 'original', numero_ne: leituraOcr.numero_ne, fonte, objeto, valor: leituraOcr.preco_total,
            cronograma: leituraOcr.cronograma,
            arquivoBase64: leituraOcr.arquivoBase64, arquivoNome: leituraOcr.arquivoNome, arquivoTipo: leituraOcr.arquivoTipo
          }
        });
        CacheAbas.invalidar('notasEmpenho');
        CacheAbas.invalidar('sof');
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
