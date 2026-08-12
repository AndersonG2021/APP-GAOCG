/**
 * GAOCG App - Gestão de Processos de Recibo (Funcionalidade 4, Anexo II),
 * incluindo parcela dividida.
 */

const TelaRecibos = (function () {
  let unidades = [];
  let itens = [];
  let paginaAtual = 1;
  let totalRegistros = 0;
  const TAMANHO_PAGINA = 20;
  let contadorLinhasParcelaDividida = 0;
  let historicoRecibosUnidade = [];
  // Notas de Empenho da unidade selecionada (sessão 2026-07-29) - alimenta o
  // <datalist> de "Nota de Empenho" e o autopreenchimento de Objeto ao
  // escolher/digitar uma NE existente (fecha a cadeia SOF->NE->Recibo).
  let nesDaUnidadeAtual = [];
  // Objetos com SOF/NE já cadastrados pra unidade selecionada (sessão
  // 2026-07-30) - só usada em "Novo processo de Recibo", como fallback do
  // autopreenchimento por Objeto quando ainda não existe nenhum Recibo
  // anterior daquele Objeto (ver recObjeto/listarObjetosSofPorUnidade).
  let objetosSofDaUnidadeNovo = [];
  let abrindoLinha = false;
  let ultimoFiltroJson = null;
  // Opções de STATUS_RECIBO (não deduplicadas) carregadas em render() -
  // reaproveitadas pelo <select> de status editável direto na tabela (sessão
  // 2026-08-07), pra não precisar buscar de novo a cada linha renderizada.
  let statusOpcoesTodasAtual = [];
  // Salva na hora, sem confirmação (é uma edição rápida, reversível a
  // qualquer momento escolhendo outro status de novo) - trava só o <select>
  // que está sendo salvo (por id), pra não disparar 2 chamadas simultâneas
  // na mesma linha se o usuário mudar de novo rapidinho.
  const statusSalvandoIds = new Set();

  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  /**
   * Regra de negócio (sessão 2026-08-06, pedido do usuário): a divisão em
   * parcelas só fica disponível pra Recibos de Objeto "Contrato de Gestão
   * (TES)" (comparação exata com o valor escolhido no campo Objeto - lista
   * gerenciada em Listas Personalizadas), e o split é sempre fixo (não
   * editável pelo usuário). Isolado aqui em constantes pra ser fácil de
   * mudar no futuro (outro objeto-gatilho, outro split) sem caçar número
   * mágico pelo arquivo inteiro - ver semearParcelasTes_/
   * adicionarLinhaParcelaDividida_. A parcela cujo percentual é o MAIOR do
   * array é a que aceita múltiplas Ordens Bancárias (hoje a de 70%).
   */
  const OBJETO_CONTRATO_GESTAO_TES = 'CONTRATO DE GESTÃO (TES)';
  const PARCELA_DIVIDIDA_TES_PERCENTUAIS = [70, 30];
  const PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB = Math.max(...PARCELA_DIVIDIDA_TES_PERCENTUAIS);

  function ehObjetoContratoGestaoTes_(objeto) {
    return String(objeto || '').trim().toUpperCase() === OBJETO_CONTRATO_GESTAO_TES;
  }

  /**
   * Mostra/esconde o bloco do checkbox "mais de uma parcela" conforme o
   * Objeto escolhido é ou não Contrato de Gestão (TES). Se o Objeto deixar
   * de ser TES enquanto o checkbox estava marcado, desmarca e volta pro modo
   * parcela única sozinho, pra não deixar o formulário num estado
   * inconsistente (checkbox marcado sem poder editar as parcelas).
   */
  function atualizarVisibilidadeParcelaDivididaTes_(blocoCheckboxId, checkboxId, blocoUnicoId, blocoDivididoId, linhasContainerId, objeto) {
    const ehTes = ehObjetoContratoGestaoTes_(objeto);
    document.getElementById(blocoCheckboxId).classList.toggle('oculto', !ehTes);
    const checkbox = document.getElementById(checkboxId);
    if (!ehTes && checkbox.checked) {
      checkbox.checked = false;
      document.getElementById(blocoUnicoId).classList.remove('oculto');
      document.getElementById(blocoDivididoId).classList.add('oculto');
      document.getElementById(linhasContainerId).innerHTML = '';
    }
  }

  /** Semeia as N parcelas fixas de um Recibo dividido de Contrato de Gestão (TES) - hoje 70%/30% (PARCELA_DIVIDIDA_TES_PERCENTUAIS). `dadosPorPercentual` (opcional) - ex. `{70: {...}}` - pré-popula a parcela daquele percentual (usado ao converter um Recibo avulso já existente). */
  function semearParcelasTes_(containerId, obterNotaEmpenho, dadosPorPercentual) {
    PARCELA_DIVIDIDA_TES_PERCENTUAIS.forEach(percentual => {
      const dadosExistentes = dadosPorPercentual && dadosPorPercentual[percentual];
      adicionarLinhaParcelaDividida_(containerId, obterNotaEmpenho, dadosExistentes, { percentualFixo: percentual });
    });
  }

  /**
   * filtroInicial (opcional, vindo do Dashboard via App.navegarPara): pré-
   * seleciona Competência/Status antes da primeira carga, e/ou abre um Recibo
   * específico direto (abrirId) depois dela - ver definirValoresFiltroMultiplo
   * (js/app.js) e abrirReciboExistente abaixo.
   */
  async function render(filtroInicial) {
    const [unidadesCarregadas, statusFiltroOpcoesBrutas, opcoesOss, opcoesObjeto] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true, pageSize: 100000 }, { cache: true }),
      carregarOpcoesStatus_(),
      TelaListas.obterOpcoes('OSS'),
      TelaListas.obterOpcoes('OBJETO')
    ]);
    const vistosStatus_ = new Set();
    const statusFiltroOpcoes = statusFiltroOpcoesBrutas.filter(o => (vistosStatus_.has(o.valor) ? false : (vistosStatus_.add(o.valor), true)));
    statusOpcoesTodasAtual = statusFiltroOpcoesBrutas;
    unidades = unidadesCarregadas.items;
    const tiposUnidade = Array.from(new Set(unidades.map(u => u.tipo).filter(Boolean))).sort();
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Recibos</h2>
      <div class="grade-indicadores" id="recIndicadores"></div>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="recBusca" placeholder="processo, ordem bancária, valor..." /></div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Unidade</label>
            <div id="recFiltroUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroUnidade" title="Limpar filtro de Unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">OSS</label>
            <div id="recFiltroOss"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroOss" title="Limpar filtro de OSS">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Objeto</label>
            <div id="recFiltroObjeto"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroObjeto" title="Limpar filtro de Objeto">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Tipo de unidade</label>
            <div id="recFiltroTipoUnidade"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroTipoUnidade" title="Limpar filtro de Tipo de unidade">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">DEA</label>
            <div id="recFiltroDea"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroDea" title="Limpar filtro de DEA">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Competência</label>
            <div id="recFiltroCompetencia"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroCompetencia" title="Limpar filtro de Competência">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Ano</label>
            <div id="recFiltroAno"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroAno" title="Limpar filtro de Ano">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Fonte</label>
            <div id="recFiltroFonte"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroFonte" title="Limpar filtro de Fonte">&times;</button>
          </div>
          <div class="campo campo-filtro-multiplo"><label style="width:100%">Status</label>
            <div id="recFiltroStatus"></div><button type="button" class="filtro-multiplo-x" data-alvo="recFiltroStatus" title="Limpar filtro de Status">&times;</button>
          </div>
          <div class="campo"><label>Instrumento</label><input id="recFiltroInstrumento" placeholder="Instrumento" /></div>
          <div class="campo"><label>Nota de Empenho</label><input id="recFiltroNotaEmpenho" placeholder="Nota de Empenho" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recFiltroNumeroProcesso" placeholder="Nº Processo" /></div>
          <button class="botao" id="btnFiltrarRec">Filtrar</button>
          <button class="botao botao-limpar-filtros" id="btnLimparFiltrosRec">Limpar filtros</button>
          <button class="botao" id="btnExportarRec">Exportar CSV</button>
          <button class="botao" id="btnGerarRelatorioRec">Gerar Relatório</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoRecibo">+ Novo processo</button>
        </div>
        <div id="listaRecibos"></div>
        <div class="paginacao" id="paginacaoRec"></div>
      </div>`;

    document.getElementById('btnFiltrarRec').addEventListener('click', () => { if (filtrosMudaram_()) { paginaAtual = 1; carregar(); } });
    ['recBusca', 'recFiltroInstrumento', 'recFiltroNotaEmpenho', 'recFiltroNumeroProcesso'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter' && filtrosMudaram_()) { paginaAtual = 1; carregar(); }
      });
    });
    document.getElementById('btnNovoRecibo').addEventListener('click', async function () {
      this.disabled = true;
      try { await abrirFormularioNovo(); } finally { this.disabled = false; }
    });
    document.getElementById('btnExportarRec').addEventListener('click', exportarCsv);
    document.getElementById('btnGerarRelatorioRec').addEventListener('click', abrirGerarRelatorio);
    // Opções INICIAIS - a partir da primeira carga elas vêm das facetas do
    // backend (ver FACETAS_REC_/aplicarResposta_). Substitui o estreitamento
    // antigo, que valia só para Unidade/Tipo/OSS.
    UI.criarFiltroMultiplo('recFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })));
    UI.criarFiltroMultiplo('recFiltroOss', opcoesOss.map(o => o.valor));
    UI.criarFiltroMultiplo('recFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.criarFiltroMultiplo('recFiltroTipoUnidade', tiposUnidade);
    UI.criarFiltroMultiplo('recFiltroDea', ['SIM', 'NÃO']);
    UI.criarFiltroMultiplo('recFiltroCompetencia', UI.listaCompetencias());
    UI.criarFiltroMultiplo('recFiltroAno', UI.listaAnos());
    UI.criarFiltroMultiplo('recFiltroFonte', ['TESOURO', 'SUS', 'Outra']);
    UI.criarFiltroMultiplo('recFiltroStatus', statusFiltroOpcoes.map(o => o.valor));
    if (filtroInicial && filtroInicial.competencia) UI.definirValoresFiltroMultiplo('recFiltroCompetencia', filtroInicial.competencia);
    if (filtroInicial && filtroInicial.status) UI.definirValoresFiltroMultiplo('recFiltroStatus', filtroInicial.status);
    // statusExceto (Dashboard, card de Recibos): seleciona todos os status
    // conhecidos MENOS os informados - é como o filtro múltiplo (que é
    // "incluir X") expressa um "status diferente de PAGO".
    if (filtroInicial && filtroInicial.statusExceto) {
      const excluir = filtroInicial.statusExceto.map(s => String(s).toUpperCase());
      const selecionar = statusFiltroOpcoes.map(o => o.valor)
        .filter(v => excluir.indexOf(String(v).toUpperCase()) === -1);
      UI.definirValoresFiltroMultiplo('recFiltroStatus', selecionar);
    }
    UI.ligarLimpezaFiltros('.barra-filtros', 'btnLimparFiltrosRec', () => {
      if (filtrosMudaram_()) { paginaAtual = 1; carregar(); }
    }, aoLimparFiltroIndividual_);
    await carregar();
    if (filtroInicial && filtroInicial.abrirId) abrirReciboExistente(filtroInicial.abrirId);
  }

  /** Evita reler a lista/mostrar o spinner quando Filtrar/Limpar filtros/"x" não mudam nada de fato. */
  function filtrosMudaram_() {
    return JSON.stringify(filtrosAtuais()) !== ultimoFiltroJson;
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('recBusca').value.trim(),
      unidade_id: UI.valoresFiltroMultiplo('recFiltroUnidade'),
      oss: UI.valoresFiltroMultiplo('recFiltroOss'),
      objeto: UI.valoresFiltroMultiplo('recFiltroObjeto'),
      tipo_unidade: UI.valoresFiltroMultiplo('recFiltroTipoUnidade'),
      dea: UI.valoresFiltroMultiplo('recFiltroDea'),
      competencia: UI.valoresFiltroMultiplo('recFiltroCompetencia'),
      // Ano derivado da própria competência ("jul.26" -> "2026"), ver
      // anoDaCompetencia_ em backend/Recibos.gs. Combina com Competência por E.
      ano: UI.valoresFiltroMultiplo('recFiltroAno'),
      fonte: UI.valoresFiltroMultiplo('recFiltroFonte'),
      status: UI.valoresFiltroMultiplo('recFiltroStatus'),
      instrumento: document.getElementById('recFiltroInstrumento').value.trim(),
      nota_empenho: document.getElementById('recFiltroNotaEmpenho').value.trim(),
      numero_processo: document.getElementById('recFiltroNumeroProcesso').value.trim()
    };
  }

  /** Chave de filtrosAtuais() correspondente a cada id de filtro-multiplo da barra - ver aoLimparFiltroIndividual_. */
  const CHAVE_POR_FILTRO_ = {
    recFiltroUnidade: 'unidade_id', recFiltroOss: 'oss', recFiltroObjeto: 'objeto',
    recFiltroTipoUnidade: 'tipo_unidade', recFiltroDea: 'dea', recFiltroCompetencia: 'competencia',
    recFiltroAno: 'ano', recFiltroFonte: 'fonte', recFiltroStatus: 'status'
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

  async function carregar() {
    await carregarComFiltros_(filtrosAtuais());
  }

  async function carregarComFiltros_(filtros) {
    ultimoFiltroJson = JSON.stringify(filtros);
    const params = Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtros);
    // listarRecibos já devolve os indicadores calculados sobre a mesma leitura/filtro
    // (evita reler a aba Recibos inteira duas vezes numa única troca de aba).
    const resposta = await CacheAbas.comRevalidacao('recibos', params,
      (opcoes) => Api.chamar('listarRecibos', params, opcoes),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  /** id do widget -> dimensão no mapa de facetas (ver UI.aplicarFacetas). */
  const FACETAS_REC_ = {
    recFiltroUnidade: { chave: 'unidade_id', rotulo: id => (unidades.find(u => String(u.id) === String(id)) || {}).nome || id },
    recFiltroOss: { chave: 'oss' },
    recFiltroObjeto: { chave: 'objeto' },
    recFiltroTipoUnidade: { chave: 'tipo_unidade' },
    recFiltroDea: { chave: 'dea' },
    recFiltroCompetencia: { chave: 'competencia' },
    recFiltroAno: { chave: 'ano' },
    recFiltroFonte: { chave: 'fonte' },
    recFiltroStatus: { chave: 'status' }
  };

  function aplicarResposta_(resposta) {
    itens = resposta.items;
    totalRegistros = resposta.total;
    UI.aplicarFacetas(resposta.facetas, FACETAS_REC_);
    renderTabela();
    renderPaginacao();
    renderIndicadores(resposta.indicadores);
  }

  function renderIndicadores(indicadores) {
    document.getElementById('recIndicadores').innerHTML = `
      <div class="cartao-indicador"><div class="valor">${indicadores.pendentes}</div><div class="rotulo">Pendentes (status ≠ PAGO)</div></div>
      <div class="cartao-indicador"><div class="valor">${UI.formatarMoeda(indicadores.total_pago_ano)}</div><div class="rotulo">Total pago no ano</div></div>`;
  }

  /**
   * <select> de status editável direto na listagem (sessão 2026-08-07,
   * pedido do usuário: "alterar o Status pela própria tela dos recibos sem
   * ter de entrar para editar"). Reaproveita opcoesStatusHtml_/
   * filtrarOpcoesStatusPorFonte_ (mesma regra de filtro por Fonte já usada
   * no formulário de edição) e corStatusReciboEstilo (mesmas cores do selo
   * de sempre, só que aplicadas ao próprio <select> em vez de um <span>).
   * data-status-anterior guarda o valor pra poder reverter visualmente se a
   * gravação falhar (ver aoMudarStatusInline_).
   */
  function celulaStatusHtml_(r) {
    const opcoesFiltradas = filtrarOpcoesStatusPorFonte_(statusOpcoesTodasAtual, r.fonte);
    return `<select class="select-status-recibo" data-id="${r.id}" data-status-anterior="${UI.escaparHtml(r.status || '')}" style="${UI.corStatusReciboEstilo(r.status)}">${opcoesStatusHtml_(opcoesFiltradas, r.status)}</select>`;
  }

  /**
   * Grava o novo status na hora (sem confirmação - é reversível escolhendo
   * outro status de novo) via o mesmo atualizarRecibo do formulário de
   * edição, mandando só `status` (os demais campos do Recibo não são
   * tocados). statusSalvandoIds evita 2 gravações simultâneas na mesma
   * linha; em caso de erro, volta o <select> pro valor anterior. Em caso de
   * sucesso, recarrega a lista inteira (mesmo padrão de excluir/editar) -
   * o status pode mudar o indicador "Pendentes" e o destaque "Parado".
   */
  async function aoMudarStatusInline_(select) {
    const id = select.dataset.id;
    if (statusSalvandoIds.has(id)) return;
    const statusAnterior = select.dataset.statusAnterior || '';
    const novoStatus = select.value;
    statusSalvandoIds.add(id);
    select.disabled = true;
    try {
      await Api.chamar('atualizarRecibo', { id, data: { status: novoStatus } });
      CacheAbas.invalidar('recibos');
      UI.toast('Status atualizado.', 'sucesso');
      await carregar();
    } catch (err) {
      UI.toast(err.message, 'erro');
      select.value = statusAnterior;
      select.disabled = false;
    } finally {
      statusSalvandoIds.delete(id);
    }
  }

  function linhaReciboHtml_(r) {
    const unidade = unidades.find(u => u.id === r.unidade_id);
    return `<tr data-id="${r.id}" class="${r.destacar_parado ? 'linha-parada' : ''}">
      <td><button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button></td>
      <td>${UI.escaparHtml(unidade ? unidade.nome : r.unidade_id)}</td>
      <td>${UI.escaparHtml(r.objeto || '-')}</td>
      <td>${UI.escaparHtml(r.numero_processo)}</td>
      <td>${UI.escaparHtml(r.competencia)}</td>
      <td>${UI.formatarMoeda(r.valor_liquidado)}</td>
      <td>${UI.formatarMoeda(r.valor_pago)}${r.alerta_divergencia_valores ? ' <span class="selo vermelho" title="Divergência de valores">!</span>' : ''}</td>
      <td>${UI.escaparHtml(r.ordem_bancaria)}</td>
      <td>${celulaStatusHtml_(r)}${r.destacar_parado ? ' <span class="selo amarelo">Parado</span>' : ''}</td>
    </tr>`;
  }

  function tabelaRecibosHtml_(linhas) {
    return `
      <table class="tabela">
        <thead><tr><th></th><th>Unidade</th><th>Objeto</th><th>Nº Processo</th><th>Competência</th><th>Valor Liquidado</th><th>Valor Pago</th><th>Ordem Bancária</th><th>Status</th></tr></thead>
        <tbody>${linhas.map(linhaReciboHtml_).join('')}</tbody>
      </table>`;
  }

  /**
   * Card destacado pra um grupo de parcela dividida (sessão 2026-08-07,
   * pedido do usuário: "quero que essas parcelas apareçam em destaque...
   * para não se confundir os outros pagamento") - vale pra qualquer grupo
   * (parcela_dividida_grupo_id preenchido), não só os de Contrato de Gestão
   * (TES). Unidade/Objeto/Nº Processo/Competência (compartilhados pelas
   * parcelas do mesmo pagamento) aparecem 1x só no cabeçalho do card; a
   * tabelinha embaixo mostra só o que muda entre as parcelas: percentual,
   * valores, OB e status (cada linha com seu próprio <select> de status,
   * já que cada parcela pode estar numa etapa diferente do fluxo).
   */
  function cartaoGrupoReciboHtml_(linhasDoGrupo) {
    const ordenadas = linhasDoGrupo.slice().sort((a, b) => (Number(b.percentual_parcela_dividida) || 0) - (Number(a.percentual_parcela_dividida) || 0));
    const primeira = ordenadas[0];
    const unidade = unidades.find(u => u.id === primeira.unidade_id);
    const algumParado = ordenadas.some(r => r.destacar_parado);
    return `
      <div class="cartao-grupo-recibo">
        <div class="cartao-grupo-recibo-cabecalho">
          <span class="cartao-grupo-recibo-titulo">🔗 ${UI.escaparHtml(unidade ? unidade.nome : primeira.unidade_id)} · ${UI.escaparHtml(primeira.objeto || '-')}</span>
          <span class="cartao-grupo-recibo-meta">
            ${primeira.numero_processo ? `Nº Processo ${UI.escaparHtml(primeira.numero_processo)}` : ''}
            ${primeira.competencia ? ` · Competência ${UI.escaparHtml(primeira.competencia)}` : ''}
          </span>
          ${algumParado ? '<span class="selo amarelo">Parado</span>' : ''}
        </div>
        <div class="tabela-reforcos-wrap">
          <table class="tabela">
            <thead><tr><th></th><th>Parcela</th><th>Valor Liquidado</th><th>Valor Pago</th><th>Ordem Bancária</th><th>Status</th></tr></thead>
            <tbody>${ordenadas.map(r => `
              <tr data-id="${r.id}" class="${r.destacar_parado ? 'linha-parada' : ''}">
                <td><button type="button" class="botao-icone excluir" data-acao="excluir" title="Excluir">${ICONE_LIXEIRA}</button></td>
                <td>${r.percentual_parcela_dividida !== '' && r.percentual_parcela_dividida !== undefined ? UI.escaparHtml(String(r.percentual_parcela_dividida)) + '%' : '-'}</td>
                <td>${UI.formatarMoeda(r.valor_liquidado)}</td>
                <td>${UI.formatarMoeda(r.valor_pago)}${r.alerta_divergencia_valores ? ' <span class="selo vermelho" title="Divergência de valores">!</span>' : ''}</td>
                <td>${UI.escaparHtml(r.ordem_bancaria)}</td>
                <td>${celulaStatusHtml_(r)}${r.destacar_parado ? ' <span class="selo amarelo">Parado</span>' : ''}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  /**
   * Agrupa itens da página atual por parcela_dividida_grupo_id, preservando
   * a ordem de 1ª ocorrência (a lista já vem ordenada por data_criacao
   * desc). Só agrupa linhas que estão na MESMA página - se as parcelas de
   * um grupo caírem em páginas diferentes (raro, só no limite exato de 20
   * registros), a que sobrar aparece como linha avulsa normal.
   */
  function agruparItensParaTabela_(lista) {
    const vistos = new Set();
    const blocos = [];
    lista.forEach(r => {
      if (vistos.has(r.id)) return;
      if (r.parcela_dividida_grupo_id) {
        const doGrupo = lista.filter(x => x.parcela_dividida_grupo_id === r.parcela_dividida_grupo_id);
        doGrupo.forEach(x => vistos.add(x.id));
        blocos.push({ tipo: 'grupo', grupoId: r.parcela_dividida_grupo_id, linhas: doGrupo });
      } else {
        vistos.add(r.id);
        blocos.push({ tipo: 'unica', linha: r });
      }
    });
    return blocos;
  }

  function renderTabela() {
    const alvo = document.getElementById('listaRecibos');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum recibo encontrado.</p>'; return; }

    // Linhas avulsas consecutivas ficam juntas numa tabela só (evita repetir
    // cabeçalho pra cada uma); um grupo de parcela dividida interrompe a
    // tabela corrente e vira seu próprio card (ver cartaoGrupoReciboHtml_).
    const blocos = agruparItensParaTabela_(itens);
    const partes = [];
    let bufferUnicas = [];
    const flush = () => { if (bufferUnicas.length) { partes.push(tabelaRecibosHtml_(bufferUnicas)); bufferUnicas = []; } };
    blocos.forEach(b => {
      if (b.tipo === 'unica') { bufferUnicas.push(b.linha); return; }
      flush();
      partes.push(cartaoGrupoReciboHtml_(b.linhas));
    });
    flush();
    alvo.innerHTML = partes.join('');

    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => abrirReciboExistente(tr.dataset.id));
      tr.querySelector('[data-acao="excluir"]').addEventListener('click', e => {
        e.stopPropagation();
        confirmarExclusaoRecibo(tr.dataset.id);
      });
    });
    // Select de status: clicar pra abrir/escolher não pode "vazar" o clique
    // pra linha (que abriria o modal de edição inteiro).
    alvo.querySelectorAll('.select-status-recibo').forEach(select => {
      select.addEventListener('click', e => e.stopPropagation());
      select.addEventListener('change', e => {
        e.stopPropagation();
        aoMudarStatusInline_(select);
      });
    });
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / TAMANHO_PAGINA));
    document.getElementById('paginacaoRec').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="botoes">
        <button class="botao" id="recPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="recPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('recPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('recPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
  }

  /**
   * "Gerar Relatório" (sessão 2026-08-08): escolha de colunas + agrupamento +
   * as 4 saídas (tela/PDF/CSV/Sheets), com os filtros já aplicados na tela.
   * Modal compartilhado com Unidades e Notas de Empenho
   * (TelaRelatorios.abrirParaTela, js/relatorios.js).
   *
   * Diferente do "Exportar CSV" ao lado, que despeja as colunas cruas da
   * planilha (inclusive ids e URLs de anexo) sem formatação nem totais: o
   * relatório traz colunas com rótulo, moeda formatada, subtotais por grupo e
   * total geral.
   *
   * Os filtros vão via `filtrosAtuais` (a função, não o resultado) pra serem
   * lidos no clique em "Gerar" - se o analista mexer num filtro com o modal
   * aberto, vale o estado do momento da geração.
   */
  function abrirGerarRelatorio() {
    return TelaRelatorios.abrirParaTela({
      fonte: 'recibos',
      titulo: 'Gerar Relatório de Recibos',
      obterFiltros: filtrosAtuais,
      ajuda: 'O relatório usa os filtros aplicados na tela (todas as páginas, não só a visível). Sem filtro, entram todos os recibos.'
    });
  }

  async function exportarCsv() {
    const resposta = await Api.chamar('listarRecibos', Object.assign({ page: 1, pageSize: 100000 }, filtrosAtuais()));
    const colunas = ['id', 'unidade_id', 'competencia', 'status', 'valor_liquidado', 'valor_pago', 'numero_processo',
      'ordem_bancaria', 'nota_liquidacao_url', 'ordem_bancaria_arquivo_url', 'parcela_dividida_grupo_id',
      'percentual_parcela_dividida', 'origem'];
    const linhas = [colunas.join(';')].concat(resposta.items.map(r => colunas.map(c => `"${String(r[c] === undefined ? '' : r[c]).replace(/"/g, '""')}"`).join(';')));
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'recibos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function abrirReciboExistente(id) {
    if (abrindoLinha) return;
    abrindoLinha = true;
    marcarLinhaCarregando(id, true);
    try {
      const recibo = itens.find(r => r.id === id);
      if (!recibo) return;
      // Abre o formulário na hora, com dado local (zero espera de rede), e
      // checa conflito de edição simultânea em paralelo - ver
      // EdicaoSimultanea/PROGRESS.md (seção de Performance).
      const edicaoPromise = EdicaoSimultanea.iniciarEdicao('Recibo', id);
      // marcarReciboVisualizado é só informativo (tira o destaque de "parado")
      // e não precisa bloquear a abertura do formulário - ver RELATORIO_LENTIDAO_SOF.md.
      Api.chamar('marcarReciboVisualizado', { id }, { silencioso: true }).catch(() => {});
      await abrirFormularioEdicao(recibo);
      EdicaoSimultanea.tratarConflito(edicaoPromise, 'Recibo', id);
    } finally {
      abrindoLinha = false;
      marcarLinhaCarregando(id, false);
    }
  }

  /** Feedback visual imediato no clique (a linha fica "carregando" enquanto as chamadas de rede resolvem). */
  function marcarLinhaCarregando(id, carregando) {
    const linha = document.querySelector(`tr[data-id="${id}"]`);
    if (linha) linha.classList.toggle('carregando', carregando);
  }

  /** Confirmação grande e em destaque - exclusão é lógica (excluido=true), mesmo padrão de confirmarExclusao em js/unidades.js. */
  function confirmarExclusaoRecibo(id) {
    const corpo = `<p class="aviso-exclusao">TEM CERTEZA QUE QUER EXCLUIR ESSE PROCESSO?</p>`;
    UI.abrirModal('Excluir recibo', corpo,
      `<button class="botao" id="btnCancelarExclusaoRec">Cancelar</button><button class="botao perigo" id="btnConfirmarExclusaoRec">Excluir</button>`,
      { pequeno: true });

    document.getElementById('btnCancelarExclusaoRec').addEventListener('click', UI.fecharModal);
    document.getElementById('btnConfirmarExclusaoRec').addEventListener('click', async () => {
      try {
        await Api.chamar('excluirRecibo', { id });
        CacheAbas.invalidar('recibos');
        UI.toast('Recibo excluído.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.toast(err.message, 'erro');
      }
    });
  }

  function opcoesUnidade(selecionadaId) {
    return `<option value="">Selecione...</option>` + unidades.map(u => `<option value="${u.id}" ${selecionadaId === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('');
  }

  async function carregarOpcoesStatus_() {
    try { return await TelaListas.obterOpcoes('STATUS_RECIBO'); } catch (e) { return []; }
  }

  function opcoesStatusHtml_(opcoes, statusAtual) {
    const vistos = new Set();
    const unicas = opcoes.filter(o => (vistos.has(o.valor) ? false : (vistos.add(o.valor), true)));
    return `<option value="">-</option>` + unicas.map(o => `<option ${o.valor === statusAtual ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('');
  }

  /**
   * Fluxo de Status ramificado por fonte (CLSUS/CLTESOURO, CPAG_SUS/CPAG_TESOURO
   * etc.): quando a fonte é SUS, esconde as opções do ramo TESOURO (e
   * vice-versa); fonte "Outra"/vazia usa o ramo TESOURO como padrão. Regex com
   * word-boundary pra não colidir com um status futuro tipo "SUSPENSO".
   */
  function filtrarOpcoesStatusPorFonte_(opcoes, fonte) {
    const usaTesouro = fonte !== 'SUS';
    return opcoes.filter(o => {
      const ehSus = /\bSUS\b/i.test(o.valor);
      const ehTesouro = /\bTESOURO\b/i.test(o.valor);
      if (ehSus && !ehTesouro) return !usaTesouro;
      if (ehTesouro && !ehSus) return usaTesouro;
      return true;
    });
  }

  /** Usada nos formulários de criar/editar - já filtrada pela fonte escolhida. */
  async function opcoesStatus(statusAtual, fonte) {
    const opcoes = await carregarOpcoesStatus_();
    return opcoesStatusHtml_(filtrarOpcoesStatusPorFonte_(opcoes, fonte), statusAtual);
  }

  /** Usada na barra de filtros - sem recorte por fonte, pra listar qualquer status já salvo. */
  async function opcoesStatusFiltro(statusAtual) {
    const opcoes = await carregarOpcoesStatus_();
    return opcoesStatusHtml_(opcoes, statusAtual);
  }

  /** Lê um <input type="file"> opcional e devolve {base64,nome,tipo} ou null se vazio. */
  async function lerAnexoDoInput_(input) {
    const arquivo = input && input.files[0];
    if (!arquivo) return null;
    // Se o anexo já foi lido/validado por OCR no momento em que foi escolhido
    // (ver ligarAnexoComOcr_), reaproveita em vez de reler o arquivo.
    if (input._anexoValidado) return input._anexoValidado;
    if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
    const base64 = await UI.lerArquivoBase64(arquivo);
    return { base64, nome: arquivo.name, tipo: arquivo.type };
  }

  /** Monta as <option> de um <datalist> de Notas de Empenho (sessão 2026-07-29). */
  function opcoesDatalistNe_(nes) {
    return nes.map(n => `<option value="${UI.escaparHtml(n.numero_ne)}">${UI.escaparHtml(n.objeto || '')}</option>`).join('');
  }

  /**
   * Ao digitar/escolher (via datalist) um número de Nota de Empenho que bate
   * exatamente com uma NE cadastrada na unidade, sugere o Objeto (e a Fonte)
   * dela nos campos indicados - fecha a cadeia SOF->NE->Recibo (sessão
   * 2026-07-29). Não sobrescreve nada se não houver correspondência exata
   * (nem toda "Nota de Empenho" digitada precisa corresponder a uma NE
   * rastreada no sistema - ex. dado histórico migrado).
   */
  function ligarAutopreenchimentoNe_(inputId, objetoElId, fonteElId, obterNes) {
    const inputEl = document.getElementById(inputId);
    const aplicar = function () {
      const valor = inputEl.value.trim().toLowerCase();
      if (!valor) return;
      const bateu = obterNes().find(n => String(n.numero_ne || '').toLowerCase() === valor);
      if (!bateu) return;
      const objetoEl = document.getElementById(objetoElId);
      if (objetoEl && bateu.objeto) objetoEl.value = bateu.objeto;
      const fonteEl = document.getElementById(fonteElId);
      if (fonteEl && bateu.fonte) fonteEl.value = bateu.fonte;
    };
    inputEl.addEventListener('input', aplicar);
    inputEl.addEventListener('change', aplicar);
  }

  /**
   * Liga um <input type="file"> de anexo (Nota de Liquidação/Ordem Bancária)
   * à leitura automática por OCR (backend `lerAnexoRecibo`): ao escolher o
   * arquivo, lê o valor e confere a Nota de Empenho do documento contra
   * obterNotaEmpenho(). Se bater, trava valorInputEl (somente leitura) com o
   * valor extraído e mostra um link "Remover anexo"; se não bater (ou der
   * erro), limpa o input e avisa, sem travar nada. Reaproveitado nos 3
   * contextos do formulário (novo/parcela dividida/edição).
   *
   * Quando o usuário remove um anexo que já existia salvo no Recibo (edição),
   * marca `inputEl.dataset.removerExistente = '1'` - salvarReciboEdicao lê essa
   * flag pra sinalizar ao backend que deve desanexar
   * (`removerNotaLiquidacaoArquivo`/`removerOrdemBancariaArquivo`). Nos
   * formulários de Recibo novo essa flag simplesmente não é lida por ninguém.
   *
   * `inputEl._numeroDocumentoLido` (sessão 2026-08-06) guarda o número do
   * próprio documento (LE/OB, extraído por OCR - ver `numero_documento` em
   * lerAnexoRecibo), lido em salvarReciboNovo/salvarReciboEdicao pra gravar
   * `nota_liquidacao_numero` e usado pela tabela "Documentos anexados" da
   * parcela de 70% (ver renderTabelaOrdensBancariasParcela_). `aoAtualizar`
   * (opcional) é chamado toda vez que o anexo é lido ou removido, pra quem
   * precisa reagir (ex.: essa mesma tabela, quando a LE muda).
   */
  function ligarAnexoComOcr_({ inputEl, tipo, obterNotaEmpenho, valorInputEl, aoAtualizar }) {
    const statusEl = document.createElement('p');
    statusEl.className = 'ajuda anexo-ocr-status oculto';
    inputEl.insertAdjacentElement('afterend', statusEl);

    function travar(valor, existente, numeroDocumento) {
      valorInputEl.value = valor;
      valorInputEl.readOnly = true;
      inputEl._numeroDocumentoLido = numeroDocumento || '';
      statusEl.classList.remove('oculto');
      statusEl.innerHTML = '🔒 Valor lido do documento. <a href="#" class="anexo-ocr-remover">Remover anexo</a>';
      statusEl.querySelector('.anexo-ocr-remover').addEventListener('click', function (e) {
        e.preventDefault();
        valorInputEl.readOnly = false;
        valorInputEl.value = '';
        inputEl.value = '';
        inputEl._anexoValidado = null;
        inputEl._numeroDocumentoLido = '';
        inputEl.dataset.removerExistente = existente ? '1' : '';
        statusEl.classList.add('oculto');
        if (aoAtualizar) aoAtualizar();
      });
      if (aoAtualizar) aoAtualizar();
    }

    inputEl.addEventListener('change', async function () {
      const arquivo = inputEl.files[0];
      if (!arquivo) return;
      const notaEmpenho = (obterNotaEmpenho() || '').trim();
      if (!notaEmpenho) {
        UI.toast('Preencha a Nota de Empenho antes de anexar este documento.', 'erro');
        inputEl.value = '';
        return;
      }
      try {
        if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
        const base64 = await UI.lerArquivoBase64(arquivo);
        const resultado = await Api.chamar('lerAnexoRecibo', {
          tipo, arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type, notaEmpenhoEsperada: notaEmpenho
        });
        inputEl._anexoValidado = { base64, nome: arquivo.name, tipo: arquivo.type };
        inputEl.dataset.removerExistente = '';
        travar(resultado.valor, false, resultado.numero_documento);
      } catch (err) {
        inputEl.value = '';
        inputEl._anexoValidado = null;
        UI.toast(err.message, 'erro');
      }
    });

    return { travar };
  }

  // ===================== NOVO RECIBO (com ou sem parcela dividida) =====================

  async function abrirFormularioNovo() {
    const [statusOpcoes, opcoesObjeto] = await Promise.all([opcoesStatus(null, ''), TelaListas.obterOpcoes('OBJETO')]);
    contadorLinhasParcelaDividida = 0;

    const corpo = `
      <form id="formRecibo">
        <div class="grade-2">
          <div class="campo"><label>Unidade *</label><select id="recUnidade" required>${opcoesUnidade(null)}</select></div>
          <div class="campo"><label>OSS</label><input id="recOss" /></div>
          <div class="campo"><label>CNPJ</label><input id="recCnpj" /></div>
          <div class="campo"><label>Tipo de Unidade</label><input id="recTipoUnidade" /></div>
          <div class="campo"><label>Objeto *</label>
            <select id="recObjeto">
              <option value="">Selecione...</option>
              ${opcoesObjeto.map(o => `<option>${UI.escaparHtml(o.valor)}</option>`).join('')}
            </select>
            <p class="ajuda">Escolhendo um objeto já usado antes para essa unidade, os campos abaixo são preenchidos com o último lançamento (ou, se ainda não houver Recibo, com a Fonte/Nota de Empenho/Parcela já cadastradas na SOF).</p>
          </div>
          <div class="campo"><label>Instrumento</label><input id="recInstrumento" /></div>
          <div class="campo"><label>Parcela Contratual</label><input id="recParcelaContratual" type="text" inputmode="decimal" class="campo-moeda" /></div>
          <div class="campo"><label>Fonte</label><select id="recFonte"><option value="">-</option><option>TESOURO</option><option>SUS</option><option>Outra</option></select></div>
          <div class="campo"><label>Nota de Empenho</label>
            <input id="recNotaEmpenho" list="listaNeUnidadeNovo" placeholder="Selecione a unidade pra ver as NEs cadastradas" />
            <datalist id="listaNeUnidadeNovo"></datalist>
          </div>
          <div class="campo"><label>Competência</label><select id="recCompetencia">${UI.opcoesCompetenciaHtml('')}</select></div>
          <div class="campo"><label>Ordem Bancária (nº)</label><input id="recOrdemBancaria" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recNumeroProcesso" /></div>
          <div class="campo"><label>Status</label><select id="recStatus">${statusOpcoes}</select></div>
        </div>
        <div class="campo"><label>Observação</label><textarea id="recObservacao" rows="2"></textarea></div>
        <div class="campo oculto" id="recBlocoTemParcelaDividida"><label><input type="checkbox" id="recTemParcelaDividida" /> Este pagamento é feito por mais de uma parcela?</label>
          <p class="ajuda">Disponível pra Objeto "${UI.escaparHtml(OBJETO_CONTRATO_GESTAO_TES)}" - divide automaticamente em ${UI.escaparHtml(PARCELA_DIVIDIDA_TES_PERCENTUAIS.join('%/'))}%.</p>
        </div>

        <div id="blocoParcelaUnica" class="grade-2">
          <div class="campo"><label>Valor Liquidado</label><input id="recValorLiquidado" type="text" inputmode="decimal" class="campo-moeda" /></div>
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" id="recNotaLiquidacaoArquivo" accept=".pdf,image/*" /></div>
          <div class="campo"><label>Valor Pago</label><input id="recValorPago" type="text" inputmode="decimal" class="campo-moeda" /></div>
          <div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" id="recOrdemBancariaArquivo" accept=".pdf,image/*" /></div>
        </div>
        <div id="blocoComParcelaDividida" class="oculto">
          <div id="linhasParcelaDividida" class="linhas-parcela-dividida"></div>
        </div>
        <div class="campo"><label><input type="checkbox" id="recCompleto" /> Cadastro completo (deixe desmarcado para rascunho incremental)</label></div>
        <p id="recErro" class="erro-campo oculto"></p>
      </form>`;

    UI.abrirModal('Novo processo de Recibo', corpo,
      `<button class="botao" id="btnCancelarRec">Cancelar</button><button class="botao primario" id="btnSalvarRec">Salvar</button>`);

    ['recUnidade', 'recObjeto', 'recCompetencia', 'recStatus'].forEach(id => UI.tornarPesquisavel(id));

    document.getElementById('recUnidade').addEventListener('change', async function () {
      const unidade = unidades.find(u => u.id === this.value);
      document.getElementById('recOss').value = unidade ? unidade.oss || '' : '';
      document.getElementById('recCnpj').value = unidade ? unidade.cnpj || '' : '';
      document.getElementById('recTipoUnidade').value = unidade ? unidade.tipo || '' : '';
      document.getElementById('recInstrumento').value = unidade ? unidade.contrato_gestao || '' : '';
      document.getElementById('recParcelaContratual').value = '';
      document.getElementById('recFonte').value = '';
      document.getElementById('recNotaEmpenho').value = '';
      document.getElementById('recObjeto').value = '';
      atualizarVisibilidadeParcelaDivididaTes_('recBlocoTemParcelaDividida', 'recTemParcelaDividida', 'blocoParcelaUnica', 'blocoComParcelaDividida', 'linhasParcelaDividida', '');
      historicoRecibosUnidade = [];
      nesDaUnidadeAtual = [];
      objetosSofDaUnidadeNovo = [];
      document.getElementById('listaNeUnidadeNovo').innerHTML = '';
      if (!unidade) return;

      const [resposta, nes, objetosSof] = await Promise.all([
        Api.chamar('listarRecibos', { unidade_id: unidade.id, pageSize: 1000 }),
        Api.chamar('listarNotasEmpenhoPorUnidade', { unidadeId: unidade.id }),
        Api.chamar('listarObjetosSofPorUnidade', { unidadeId: unidade.id })
      ]);
      historicoRecibosUnidade = resposta.items.slice().sort((a, b) => b.data_criacao < a.data_criacao ? -1 : 1);
      nesDaUnidadeAtual = nes;
      objetosSofDaUnidadeNovo = objetosSof;
      document.getElementById('listaNeUnidadeNovo').innerHTML = opcoesDatalistNe_(nesDaUnidadeAtual);
    });
    ligarAutopreenchimentoNe_('recNotaEmpenho', 'recObjeto', 'recFonte', () => nesDaUnidadeAtual);

    document.getElementById('recObjeto').addEventListener('change', async function () {
      const objeto = this.value.trim();
      const ultimoLancamento = historicoRecibosUnidade.find(r => (r.objeto || '').trim().toLowerCase() === objeto.toLowerCase());
      if (ultimoLancamento) {
        document.getElementById('recInstrumento').value = ultimoLancamento.instrumento || '';
        document.getElementById('recParcelaContratual').value = ultimoLancamento.parcela_contratual || '';
        document.getElementById('recFonte').value = ultimoLancamento.fonte || '';
        document.getElementById('recNotaEmpenho').value = ultimoLancamento.nota_empenho || '';
      } else {
        // Sem Recibo lançado antes pra esse Objeto (sessão 2026-07-30) - cai
        // pro SOF/NE já cadastrados pra essa unidade+objeto, se existirem
        // (ver listarObjetosSofPorUnidade). Continua tudo editável depois -
        // é só um ponto de partida, não trava nenhum campo.
        const objetoSof = objetosSofDaUnidadeNovo.find(o => (o.objeto || '').trim().toLowerCase() === objeto.toLowerCase());
        if (objetoSof) {
          document.getElementById('recParcelaContratual').value = objetoSof.parcela_mensal || '';
          document.getElementById('recFonte').value = objetoSof.fonte || '';
          document.getElementById('recNotaEmpenho').value = objetoSof.numero_ne || '';
        }
      }
      document.getElementById('recStatus').innerHTML = await opcoesStatus(document.getElementById('recStatus').value, document.getElementById('recFonte').value);
      UI.tornarPesquisavel('recStatus');
      atualizarVisibilidadeParcelaDivididaTes_('recBlocoTemParcelaDividida', 'recTemParcelaDividida', 'blocoParcelaUnica', 'blocoComParcelaDividida', 'linhasParcelaDividida', this.value);
    });

    document.getElementById('recFonte').addEventListener('change', async function () {
      document.getElementById('recStatus').innerHTML = await opcoesStatus(document.getElementById('recStatus').value, this.value);
      UI.tornarPesquisavel('recStatus');
    });

    const obterNotaEmpenhoNovo_ = () => document.getElementById('recNotaEmpenho').value;
    document.getElementById('recTemParcelaDividida').addEventListener('change', function () {
      document.getElementById('blocoParcelaUnica').classList.toggle('oculto', this.checked);
      document.getElementById('blocoComParcelaDividida').classList.toggle('oculto', !this.checked);
      if (this.checked && !document.getElementById('linhasParcelaDividida').children.length) {
        semearParcelasTes_('linhasParcelaDividida', obterNotaEmpenhoNovo_);
      }
    });
    document.getElementById('btnCancelarRec').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarRec').addEventListener('click', salvarReciboNovo);

    ligarAnexoComOcr_({
      inputEl: document.getElementById('recNotaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho: obterNotaEmpenhoNovo_, valorInputEl: document.getElementById('recValorLiquidado')
    });
    ligarAnexoComOcr_({
      inputEl: document.getElementById('recOrdemBancariaArquivo'), tipo: 'ordem_bancaria',
      obterNotaEmpenho: obterNotaEmpenhoNovo_, valorInputEl: document.getElementById('recValorPago')
    });
  }

  /**
   * Monta uma linha do editor de parcela dividida dentro do container
   * `containerId` (sessão 2026-07-30: parametrizada pra ser reaproveitada
   * tanto em "Novo processo de Recibo" - `linhasParcelaDividida`, sempre
   * linhas novas - quanto em "Editar Recibo" - `linhasParcelaDividedaEd`,
   * ver abrirFormularioEdicao, que também pode pré-popular linhas com dado
   * já existente na planilha).
   *
   * `dadosExistentes` (opcional) - quando presente, pré-preenche a linha:
   * `{ id, percentual_parcela_dividida, valor_liquidado, valor_pago,
   * nota_liquidacao_url, nota_liquidacao_numero, ordem_bancaria_arquivo_url,
   * ordem_bancaria_arquivo_drive_id, ordens_bancarias }`. Uma linha com `id`
   * (já salva na planilha) **não pode ser removida por aqui** - o backend
   * (atualizarParcelasDivididasRecibo) só cria/atualiza o que estiver
   * presente no envio; remover do formulário sem apagar de fato deixaria a
   * linha "esquecida" na planilha, órfã do que a tela mostra - por isso o
   * botão de remover só aparece em linhas novas (ainda não salvas).
   *
   * `opts.percentualFixo` (sessão 2026-08-06, Recibo dividido de Contrato de
   * Gestão (TES) - ver semearParcelasTes_): quando informado, o campo
   * Percentual nasce travado (somente leitura) com esse valor, a linha nunca
   * mostra botão de remover (split fixo, não dá pra ficar com menos que
   * PARCELA_DIVIDIDA_TES_PERCENTUAIS.length parcelas), e se for o MAIOR
   * percentual do split (PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB), a linha
   * troca o campo único "Ordem Bancária (anexo)" por uma tabela "Documentos
   * anexados" (LE + N OBs) com botão "+ Adicionar OB" - ver
   * renderTabelaOrdensBancariasParcela_. Valor Pago nessa linha vira
   * somente leitura, somado automaticamente a partir da tabela.
   */
  function adicionarLinhaParcelaDividida_(containerId, obterNotaEmpenho, dadosExistentes, opts) {
    contadorLinhasParcelaDividida++;
    const id = contadorLinhasParcelaDividida;
    const jaSalva = !!(dadosExistentes && dadosExistentes.id);
    const percentualFixo = opts && opts.percentualFixo;
    const multiOB = percentualFixo === PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB;
    const div = document.createElement('div');
    div.className = 'linha-parcela-dividida';
    div.dataset.linhaParcelaDividida = id;
    if (jaSalva) div.dataset.idExistente = dadosExistentes.id;
    if (multiOB) div.dataset.multiOb = '1';
    const valorPercentual = percentualFixo || (dadosExistentes && dadosExistentes.percentual_parcela_dividida) || '';
    div.innerHTML = `
      <div class="linha-parcela-dividida-corpo">
        <div class="grade-3">
          <div class="campo"><label>Percentual (%)</label><input type="text" inputmode="decimal" class="pd-percentual campo-moeda" value="${valorPercentual}" ${percentualFixo ? 'readonly' : ''} /></div>
          <div class="campo"><label>Valor Liquidado</label><input type="text" inputmode="decimal" class="pd-liquidado campo-moeda" value="${dadosExistentes && dadosExistentes.valor_liquidado ? dadosExistentes.valor_liquidado : ''}" /></div>
          <div class="campo"><label>Valor Pago${multiOB ? ' (soma automática)' : ''}</label><input type="text" inputmode="decimal" class="pd-pago campo-moeda" value="${dadosExistentes && dadosExistentes.valor_pago ? dadosExistentes.valor_pago : ''}" ${multiOB ? 'readonly' : ''} /></div>
        </div>
        <div class="grade-2">
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" class="pd-notaLiquidacaoArquivo" accept=".pdf,image/*" />${dadosExistentes && dadosExistentes.nota_liquidacao_url ? `<p class="ajuda"><a href="${UI.escaparHtml(dadosExistentes.nota_liquidacao_url)}" target="_blank" rel="noopener">Ver arquivo atual</a></p>` : ''}</div>
          ${multiOB ? '' : `<div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" class="pd-ordemBancariaArquivo" accept=".pdf,image/*" />${dadosExistentes && dadosExistentes.ordem_bancaria_arquivo_url ? `<p class="ajuda"><a href="${UI.escaparHtml(dadosExistentes.ordem_bancaria_arquivo_url)}" target="_blank" rel="noopener">Ver arquivo atual</a></p>` : ''}</div>`}
        </div>
        ${multiOB ? `
        <div class="campo pd-ob-bloco">
          <label>Documentos anexados (LE + Ordens Bancárias)</label>
          <div class="pd-ob-tabela-wrap"></div>
          <input type="file" class="pd-ob-novo-anexo oculto" accept=".pdf,image/*" />
          <button type="button" class="botao pd-add-ob">+ Adicionar OB</button>
        </div>` : ''}
      </div>
      ${jaSalva || percentualFixo ? '' : '<button type="button" class="linha-parcela-dividida-remover" title="Remover parcela">&times;</button>'}`;
    document.getElementById(containerId).appendChild(div);
    if (!jaSalva && !percentualFixo) {
      div.querySelector('.linha-parcela-dividida-remover').addEventListener('click', () => {
        div.remove();
        atualizarBotoesRemoverParcelaDividida_(containerId);
      });
    }
    atualizarBotoesRemoverParcelaDividida_(containerId);

    const anexoNl = ligarAnexoComOcr_({
      inputEl: div.querySelector('.pd-notaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho, valorInputEl: div.querySelector('.pd-liquidado'),
      aoAtualizar: multiOB ? () => renderTabelaOrdensBancariasParcela_(div) : undefined
    });
    if (dadosExistentes && dadosExistentes.nota_liquidacao_url) anexoNl.travar(dadosExistentes.valor_liquidado, true, dadosExistentes.nota_liquidacao_numero);

    if (multiOB) {
      div._notaLiquidacaoUrl = (dadosExistentes && dadosExistentes.nota_liquidacao_url) || '';
      div._ordensBancarias = ((dadosExistentes && dadosExistentes.ordens_bancarias) || []).map(it => ({
        numero_ob: it.numero_ob || '', valor: Number(it.valor) || 0,
        arquivo_drive_id: it.arquivo_drive_id || '', arquivo_url: it.arquivo_url || ''
      }));
      // Compatibilidade (sessão 2026-08-06): se esta linha vem de um Recibo
      // avulso que já tinha UMA Ordem Bancária no formato antigo (campo
      // único, antes desta funcionalidade existir) e ainda não foi migrada
      // pra um item da tabela, mostra ela como item herdado, em vez de
      // "sumir" da tela.
      if (dadosExistentes && dadosExistentes.ordem_bancaria_arquivo_url && !div._ordensBancarias.length) {
        div._ordensBancarias.push({
          numero_ob: '', valor: Number(dadosExistentes.valor_pago) || 0,
          arquivo_drive_id: dadosExistentes.ordem_bancaria_arquivo_drive_id || '', arquivo_url: dadosExistentes.ordem_bancaria_arquivo_url
        });
      }
      div.querySelector('.pd-liquidado').addEventListener('input', () => renderTabelaOrdensBancariasParcela_(div));

      const inputNovoOb = div.querySelector('.pd-ob-novo-anexo');
      div.querySelector('.pd-add-ob').addEventListener('click', () => inputNovoOb.click());
      inputNovoOb.addEventListener('change', async function () {
        const arquivo = inputNovoOb.files[0];
        if (!arquivo) return;
        const notaEmpenho = (obterNotaEmpenho() || '').trim();
        if (!notaEmpenho) { UI.toast('Preencha a Nota de Empenho antes de anexar este documento.', 'erro'); inputNovoOb.value = ''; return; }
        try {
          if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
          const base64 = await UI.lerArquivoBase64(arquivo);
          const resultado = await Api.chamar('lerAnexoRecibo', {
            tipo: 'ordem_bancaria', arquivoBase64: base64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type, notaEmpenhoEsperada: notaEmpenho
          });
          div._ordensBancarias.push({
            numero_ob: resultado.numero_documento || '', valor: resultado.valor,
            _base64: base64, _nome: arquivo.name, _tipo: arquivo.type
          });
          renderTabelaOrdensBancariasParcela_(div);
        } catch (err) {
          UI.toast(err.message, 'erro');
        } finally {
          inputNovoOb.value = '';
        }
      });
      renderTabelaOrdensBancariasParcela_(div);
    } else {
      const anexoOb = ligarAnexoComOcr_({
        inputEl: div.querySelector('.pd-ordemBancariaArquivo'), tipo: 'ordem_bancaria',
        obterNotaEmpenho, valorInputEl: div.querySelector('.pd-pago')
      });
      if (dadosExistentes && dadosExistentes.ordem_bancaria_arquivo_url) anexoOb.travar(dadosExistentes.valor_pago, true);
    }
  }

  /**
   * Tabela "Documentos anexados" (LE + Ordens Bancárias) da parcela de maior
   * percentual (PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB) dentro de um
   * Recibo dividido de Contrato de Gestão (TES) - sessão 2026-08-06, estilo
   * reaproveitado de "Reforços lançados" (Notas de Empenho). A linha da LE é
   * sempre 1 (número/valor lidos ao vivo do input/anexo da própria linha);
   * as de OB vêm de `div._ordensBancarias` (mutado por quem chama). Também
   * recalcula Valor Pago (soma automática) toda vez que roda.
   */
  function renderTabelaOrdensBancariasParcela_(div) {
    const itens = div._ordensBancarias || [];
    const numeroLe = div.querySelector('.pd-notaLiquidacaoArquivo')._numeroDocumentoLido || '';
    const valorLe = UI.parseValorBr(div.querySelector('.pd-liquidado').value) || 0;
    const urlLe = div._notaLiquidacaoUrl || '';
    const alvo = div.querySelector('.pd-ob-tabela-wrap');
    alvo.innerHTML = `
      <div class="tabela-reforcos-wrap">
        <table class="tabela tabela-reforcos">
          <thead><tr><th>Documento</th><th>Número</th><th>Valor</th><th>Arquivo</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td>LE</td>
              <td>${numeroLe ? UI.escaparHtml(numeroLe) : '<span class="ajuda">-</span>'}</td>
              <td>${UI.formatarMoeda(valorLe)}</td>
              <td>${urlLe ? `<a href="${UI.escaparHtml(urlLe)}" target="_blank" rel="noopener">Ver</a>` : '<span class="ajuda">-</span>'}</td>
              <td></td>
            </tr>
            ${itens.map((it, i) => `
              <tr>
                <td>OB</td>
                <td>${it.numero_ob ? UI.escaparHtml(it.numero_ob) : '<span class="ajuda">-</span>'}</td>
                <td>${UI.formatarMoeda(it.valor)}</td>
                <td>${it.arquivo_url ? `<a href="${UI.escaparHtml(it.arquivo_url)}" target="_blank" rel="noopener">Ver</a>` : '<span class="ajuda">-</span>'}</td>
                <td><button type="button" class="botao-icone excluir" data-indice-ob="${i}" title="Remover esta OB">${ICONE_LIXEIRA}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${itens.length ? '' : '<p class="ajuda">Nenhuma Ordem Bancária anexada ainda.</p>'}`;
    alvo.querySelectorAll('[data-indice-ob]').forEach(botao => {
      botao.addEventListener('click', () => {
        itens.splice(Number(botao.dataset.indiceOb), 1);
        renderTabelaOrdensBancariasParcela_(div);
      });
    });
    atualizarValorPagoComputado_(div);
  }

  /** Valor Pago da parcela multi-OB = soma automática da tabela (decisão do usuário, sessão 2026-08-06) - somente leitura, recalculado a cada mudança na tabela. */
  function atualizarValorPagoComputado_(div) {
    const soma = (div._ordensBancarias || []).reduce((s, it) => s + (Number(it.valor) || 0), 0);
    div.querySelector('.pd-pago').value = soma ? soma.toFixed(2) : '';
  }

  /** Payload de ordens_bancarias pra criarGrupoParcelaDivididaRecibo/atualizarParcelasDivididasRecibo a partir do estado local da linha (ver div._ordensBancarias). */
  function montarPayloadOrdensBancarias_(div) {
    return (div._ordensBancarias || []).map(it => ({
      numero_ob: it.numero_ob || '',
      valor: it.valor,
      arquivo_drive_id: it.arquivo_drive_id || '',
      arquivo_url: it.arquivo_url || '',
      arquivoBase64: it._base64, arquivoNome: it._nome, arquivoTipo: it._tipo
    }));
  }

  /**
   * criarGrupoParcelaDivididaRecibo/atualizarParcelasDivididasRecibo exigem
   * no mínimo 2 parcelas - esconde o botão de remover quando restam só 2.
   * Só considera linhas que TÊM botão de remover (linhas novas, sem
   * percentual fixo) - linhas já salvas ou de split fixo (TES, ver
   * adicionarLinhaParcelaDividida_) nunca têm botão, então não contam pra
   * essa trava.
   */
  function atualizarBotoesRemoverParcelaDividida_(containerId) {
    const linhas = document.querySelectorAll('#' + containerId + ' [data-linha-parcela-dividida]');
    linhas.forEach(linha => {
      const botao = linha.querySelector('.linha-parcela-dividida-remover');
      if (botao) botao.classList.toggle('oculto', linhas.length <= 2);
    });
  }

  async function salvarReciboNovo() {
    const erroEl = document.getElementById('recErro');
    erroEl.classList.add('oculto');
    // Portao unico dos campos monetarios (UI.validarCamposMoeda, js/app.js):
    // recusa texto que nao vira numero em vez de gravar R$ 0,00 sem avisar.
    if (!UI.validarCamposMoeda()) return;
    const unidadeId = document.getElementById('recUnidade').value;
    if (!unidadeId) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }

    const dadosBase = {
      unidade_id: unidadeId,
      oss_snapshot: document.getElementById('recOss').value.trim(),
      cnpj_snapshot: document.getElementById('recCnpj').value.trim(),
      tipo_unidade: document.getElementById('recTipoUnidade').value.trim(),
      objeto: document.getElementById('recObjeto').value.trim(),
      instrumento: document.getElementById('recInstrumento').value.trim(),
      parcela_contratual: UI.parseValorBr(document.getElementById('recParcelaContratual').value),
      fonte: document.getElementById('recFonte').value,
      nota_empenho: document.getElementById('recNotaEmpenho').value.trim(),
      competencia: document.getElementById('recCompetencia').value.trim(),
      ordem_bancaria: document.getElementById('recOrdemBancaria').value.trim(),
      numero_processo: document.getElementById('recNumeroProcesso').value.trim(),
      status: document.getElementById('recStatus').value,
      observacao: document.getElementById('recObservacao').value.trim(),
      completo: document.getElementById('recCompleto').checked
    };

    try {
      if (document.getElementById('recTemParcelaDividida').checked) {
        const linhas = Array.from(document.querySelectorAll('#linhasParcelaDividida [data-linha-parcela-dividida]'));
        if (linhas.length < 2) { UI.mostrarErro(erroEl, 'Informe ao menos duas parcelas.'); return; }
        const parcelas = await Promise.all(linhas.map(async div => {
          const parcela = {
            percentual_parcela_dividida: UI.parseValorBr(div.querySelector('.pd-percentual').value),
            valor_liquidado: UI.parseValorBr(div.querySelector('.pd-liquidado').value),
            valor_pago: UI.parseValorBr(div.querySelector('.pd-pago').value),
            nota_liquidacao_numero: div.querySelector('.pd-notaLiquidacaoArquivo')._numeroDocumentoLido || ''
          };
          const nl = await lerAnexoDoInput_(div.querySelector('.pd-notaLiquidacaoArquivo'));
          if (nl) Object.assign(parcela, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
          if (div.dataset.multiOb === '1') {
            parcela.ordens_bancarias = montarPayloadOrdensBancarias_(div);
          } else {
            const ob = await lerAnexoDoInput_(div.querySelector('.pd-ordemBancariaArquivo'));
            if (ob) Object.assign(parcela, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });
          }
          return parcela;
        }));
        await Api.chamar('criarGrupoParcelaDivididaRecibo', { dadosBase, parcelas });
      } else {
        dadosBase.valor_liquidado = UI.parseValorBr(document.getElementById('recValorLiquidado').value);
        dadosBase.valor_pago = UI.parseValorBr(document.getElementById('recValorPago').value);
        dadosBase.nota_liquidacao_numero = document.getElementById('recNotaLiquidacaoArquivo')._numeroDocumentoLido || '';
        const nl = await lerAnexoDoInput_(document.getElementById('recNotaLiquidacaoArquivo'));
        if (nl) Object.assign(dadosBase, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
        const ob = await lerAnexoDoInput_(document.getElementById('recOrdemBancariaArquivo'));
        if (ob) Object.assign(dadosBase, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });
        await Api.chamar('criarRecibo', { data: dadosBase });
      }
      CacheAbas.invalidar('recibos');
      UI.toast('Recibo salvo com sucesso.', 'sucesso');
      UI.fecharModal();
      await carregar();
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  // ===================== EDIÇÃO DE RECIBO EXISTENTE =====================

  async function abrirFormularioEdicao(recibo) {
    const grupoId = recibo.parcela_dividida_grupo_id || '';
    const [statusOpcoes, opcoesObjeto, nesDaUnidade, siblingsGrupo] = await Promise.all([
      opcoesStatus(recibo.status, recibo.fonte),
      TelaListas.obterOpcoes('OBJETO'),
      Api.chamar('listarNotasEmpenhoPorUnidade', { unidadeId: recibo.unidade_id }),
      grupoId ? Api.chamar('listarRecibosPorGrupo', { grupoId }) : Promise.resolve([])
    ]);
    nesDaUnidadeAtual = nesDaUnidade;
    const corpo = `
      <form id="formReciboEdicao">
        ${recibo.divergente_da_unidade ? '<p class="aviso-divergencia">⚠ OSS/CNPJ divergem do cadastro atual da unidade.</p>' : ''}
        ${recibo.alerta_divergencia_valores ? '<p class="aviso-divergencia">⚠ Divergência entre valor liquidado/pago (ou soma da parcela dividida x parcela contratual).</p>' : ''}
        <div class="grade-2">
          <div class="campo"><label>Unidade</label><select disabled>${opcoesUnidade(recibo.unidade_id)}</select></div>
          <div class="campo"><label>OSS</label><input id="recEdOss" value="${UI.escaparHtml(recibo.oss_snapshot)}" /></div>
          <div class="campo"><label>CNPJ</label><input id="recEdCnpj" value="${UI.escaparHtml(recibo.cnpj_snapshot)}" /></div>
          <div class="campo"><label>Tipo de Unidade</label><input id="recEdTipoUnidade" value="${UI.escaparHtml(recibo.tipo_unidade)}" /></div>
          <div class="campo"><label>Objeto *</label>
            <select id="recEdObjeto">
              <option value="">Selecione...</option>
              ${opcoesObjeto.map(o => `<option ${recibo.objeto === o.valor ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>Instrumento</label><input id="recEdInstrumento" value="${UI.escaparHtml(recibo.instrumento)}" /></div>
          <div class="campo"><label>Parcela Contratual</label><input id="recEdParcelaContratual" type="text" inputmode="decimal" class="campo-moeda" value="${recibo.parcela_contratual}" /></div>
          <div class="campo"><label>Fonte</label><select id="recEdFonte">${['', 'TESOURO', 'SUS', 'Outra'].map(f => `<option ${recibo.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="campo"><label>Nota de Empenho</label>
            <input id="recEdNotaEmpenho" list="listaNeUnidadeEd" value="${UI.escaparHtml(recibo.nota_empenho)}" />
            <datalist id="listaNeUnidadeEd">${opcoesDatalistNe_(nesDaUnidade)}</datalist>
          </div>
          <div class="campo"><label>Competência</label><select id="recEdCompetencia">${UI.opcoesCompetenciaHtml(recibo.competencia)}</select></div>
          <div class="campo"><label>Ordem Bancária (nº)</label><input id="recEdOrdemBancaria" value="${UI.escaparHtml(recibo.ordem_bancaria)}" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recEdNumeroProcesso" value="${UI.escaparHtml(recibo.numero_processo)}" /></div>
          <div class="campo"><label>Status</label><select id="recEdStatus">${statusOpcoes}</select></div>
        </div>
        <div class="campo ${(grupoId || ehObjetoContratoGestaoTes_(recibo.objeto)) ? '' : 'oculto'}" id="recEdBlocoTemParcelaDividida"><label><input type="checkbox" id="recEdTemParcelaDividida" ${grupoId ? 'checked disabled' : ''} /> Este pagamento é feito por mais de uma parcela?</label>
          ${grupoId ? '' : `<p class="ajuda">Disponível pra Objeto "${UI.escaparHtml(OBJETO_CONTRATO_GESTAO_TES)}" - divide automaticamente em ${UI.escaparHtml(PARCELA_DIVIDIDA_TES_PERCENTUAIS.join('%/'))}%.</p>`}
        </div>

        <div id="blocoParcelaUnicaEd" class="grade-2 ${grupoId ? 'oculto' : ''}">
          <div class="campo"><label>Valor Liquidado</label><input id="recEdValorLiquidado" type="text" inputmode="decimal" class="campo-moeda" value="${recibo.valor_liquidado}" /></div>
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" id="recEdNotaLiquidacaoArquivo" accept=".pdf,image/*" />${recibo.nota_liquidacao_url ? `<p class="ajuda"><a href="${UI.escaparHtml(recibo.nota_liquidacao_url)}" target="_blank" rel="noopener">Ver arquivo atual</a></p>` : ''}</div>
          <div class="campo"><label>Valor Pago</label><input id="recEdValorPago" type="text" inputmode="decimal" class="campo-moeda" value="${recibo.valor_pago}" /></div>
          <div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" id="recEdOrdemBancariaArquivo" accept=".pdf,image/*" />${recibo.ordem_bancaria_arquivo_url ? `<p class="ajuda"><a href="${UI.escaparHtml(recibo.ordem_bancaria_arquivo_url)}" target="_blank" rel="noopener">Ver arquivo atual</a></p>` : ''}</div>
        </div>
        <div id="blocoComParcelaDivididaEd" class="${grupoId ? '' : 'oculto'}">
          <div id="linhasParcelaDivididaEd" class="linhas-parcela-dividida"></div>
          <button type="button" class="botao ${ehObjetoContratoGestaoTes_(recibo.objeto) ? 'oculto' : ''}" id="btnAddParcelaDivididaEd">+ Adicionar parcela</button>
        </div>

        <div class="campo"><label>Observação</label><textarea id="recEdObservacao" rows="2">${UI.escaparHtml(recibo.observacao)}</textarea></div>
        <div class="campo"><label><input type="checkbox" id="recEdCompleto" ${recibo.completo ? 'checked' : ''} /> Cadastro completo</label></div>
        <p id="recEdErro" class="erro-campo oculto"></p>
      </form>`;

    UI.abrirModal('Editar Recibo', corpo,
      `<button class="botao" id="btnCancelarRecEd">Cancelar</button><button class="botao primario" id="btnSalvarRecEd">Salvar</button>`);
    UI.aoFecharModal(() => EdicaoSimultanea.sairDaEdicao('Recibo', recibo.id));

    ['recEdObjeto', 'recEdCompetencia', 'recEdStatus'].forEach(id => UI.tornarPesquisavel(id));
    ligarAutopreenchimentoNe_('recEdNotaEmpenho', 'recEdObjeto', 'recEdFonte', () => nesDaUnidadeAtual);

    document.getElementById('recEdFonte').addEventListener('change', async function () {
      document.getElementById('recEdStatus').innerHTML = await opcoesStatus(document.getElementById('recEdStatus').value, this.value);
      UI.tornarPesquisavel('recEdStatus');
    });
    // Objeto pode mudar de/para "Contrato de Gestão (TES)" durante a edição -
    // só reage se ainda não faz parte de um grupo (ver
    // atualizarVisibilidadeParcelaDivididaTes_; grupo já existente sempre
    // mostra a tabela, não dá pra "desfazer" mudando o Objeto).
    document.getElementById('recEdObjeto').addEventListener('change', function () {
      if (!grupoId) atualizarVisibilidadeParcelaDivididaTes_('recEdBlocoTemParcelaDividida', 'recEdTemParcelaDividida', 'blocoParcelaUnicaEd', 'blocoComParcelaDivididaEd', 'linhasParcelaDivididaEd', this.value);
    });

    const obterNotaEmpenhoEd_ = () => document.getElementById('recEdNotaEmpenho').value;
    const anexoNl = ligarAnexoComOcr_({
      inputEl: document.getElementById('recEdNotaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho: obterNotaEmpenhoEd_, valorInputEl: document.getElementById('recEdValorLiquidado')
    });
    if (recibo.nota_liquidacao_url) anexoNl.travar(recibo.valor_liquidado, true, recibo.nota_liquidacao_numero);
    const anexoOb = ligarAnexoComOcr_({
      inputEl: document.getElementById('recEdOrdemBancariaArquivo'), tipo: 'ordem_bancaria',
      obterNotaEmpenho: obterNotaEmpenhoEd_, valorInputEl: document.getElementById('recEdValorPago')
    });
    if (recibo.ordem_bancaria_arquivo_url) anexoOb.travar(recibo.valor_pago, true);

    // Parcela dividida na edição (sessão 2026-07-30, pedido do usuário): se
    // este Recibo já faz parte de um grupo, a tabela já nasce populada com
    // TODAS as parcelas do grupo (checkbox travado marcado - já é um grupo,
    // não dá pra "desfazer" por aqui, só adicionar mais parcelas); senão,
    // nasce vazia e some até o analista marcar o checkbox. Se o grupo é de
    // Contrato de Gestão (TES) - sessão 2026-08-06 -, cada parcela nasce com
    // o percentual travado (opts.percentualFixo) e a de maior percentual
    // (PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB) com a tabela de OBs.
    if (grupoId) {
      const grupoEhTes = ehObjetoContratoGestaoTes_(recibo.objeto);
      siblingsGrupo.forEach(s => adicionarLinhaParcelaDividida_('linhasParcelaDivididaEd', obterNotaEmpenhoEd_, s,
        grupoEhTes ? { percentualFixo: Number(s.percentual_parcela_dividida) } : undefined));
    }
    document.getElementById('recEdTemParcelaDividida').addEventListener('change', function () {
      document.getElementById('blocoParcelaUnicaEd').classList.toggle('oculto', this.checked);
      document.getElementById('blocoComParcelaDivididaEd').classList.toggle('oculto', !this.checked);
      if (this.checked && !document.getElementById('linhasParcelaDivididaEd').children.length) {
        // Primeira vez convertendo pra parcela dividida - vira Recibo
        // dividido de Contrato de Gestão (TES) (única forma de chegar aqui,
        // ver atualizarVisibilidadeParcelaDivididaTes_): a própria linha do
        // Recibo em edição vira a parcela de maior percentual (com o que ela
        // já tinha, inclusive uma eventual OB única legada migrada pra
        // tabela - ver adicionarLinhaParcelaDividida_), e a(s) outra(s)
        // nascem em branco.
        semearParcelasTes_('linhasParcelaDivididaEd', obterNotaEmpenhoEd_, {
          [PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB]: {
            id: recibo.id, percentual_parcela_dividida: PARCELA_DIVIDIDA_TES_PERCENTUAL_MULTI_OB,
            valor_liquidado: recibo.valor_liquidado, valor_pago: recibo.valor_pago,
            nota_liquidacao_url: recibo.nota_liquidacao_url, nota_liquidacao_numero: recibo.nota_liquidacao_numero,
            ordem_bancaria_arquivo_url: recibo.ordem_bancaria_arquivo_url, ordem_bancaria_arquivo_drive_id: recibo.ordem_bancaria_arquivo_drive_id
          }
        });
      }
    });
    document.getElementById('btnAddParcelaDivididaEd').addEventListener('click', () => adicionarLinhaParcelaDividida_('linhasParcelaDivididaEd', obterNotaEmpenhoEd_));

    document.getElementById('btnCancelarRecEd').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarRecEd').addEventListener('click', () => salvarReciboEdicao(recibo));
  }

  async function salvarReciboEdicao(recibo) {
    const erroEl = document.getElementById('recEdErro');
    erroEl.classList.add('oculto');
    // Portao unico dos campos monetarios (UI.validarCamposMoeda, js/app.js):
    // recusa texto que nao vira numero em vez de gravar R$ 0,00 sem avisar.
    if (!UI.validarCamposMoeda()) return;
    const dados = {
      oss_snapshot: document.getElementById('recEdOss').value.trim(),
      cnpj_snapshot: document.getElementById('recEdCnpj').value.trim(),
      tipo_unidade: document.getElementById('recEdTipoUnidade').value.trim(),
      objeto: document.getElementById('recEdObjeto').value.trim(),
      instrumento: document.getElementById('recEdInstrumento').value.trim(),
      parcela_contratual: UI.parseValorBr(document.getElementById('recEdParcelaContratual').value),
      fonte: document.getElementById('recEdFonte').value,
      nota_empenho: document.getElementById('recEdNotaEmpenho').value.trim(),
      competencia: document.getElementById('recEdCompetencia').value.trim(),
      ordem_bancaria: document.getElementById('recEdOrdemBancaria').value.trim(),
      numero_processo: document.getElementById('recEdNumeroProcesso').value.trim(),
      status: document.getElementById('recEdStatus').value,
      observacao: document.getElementById('recEdObservacao').value.trim(),
      completo: document.getElementById('recEdCompleto').checked
    };

    try {
      if (document.getElementById('recEdTemParcelaDividida').checked) {
        // Parcela dividida (sessão 2026-07-30) - cada linha da tabela vira um
        // item de `parcelas`; linhas já salvas trazem `id` (atualizam a
        // própria linha no backend), linhas novas não trazem (viram parcela
        // nova no mesmo grupo). Ver atualizarParcelasDivididasRecibo.
        const linhas = Array.from(document.querySelectorAll('#linhasParcelaDivididaEd [data-linha-parcela-dividida]'));
        if (linhas.length < 2) { UI.mostrarErro(erroEl, 'Informe ao menos duas parcelas.'); return; }
        const parcelas = await Promise.all(linhas.map(async div => {
          const parcela = {
            percentual_parcela_dividida: UI.parseValorBr(div.querySelector('.pd-percentual').value),
            valor_liquidado: UI.parseValorBr(div.querySelector('.pd-liquidado').value),
            valor_pago: UI.parseValorBr(div.querySelector('.pd-pago').value),
            nota_liquidacao_numero: div.querySelector('.pd-notaLiquidacaoArquivo')._numeroDocumentoLido || ''
          };
          if (div.dataset.idExistente) parcela.id = div.dataset.idExistente;
          const inputNl = div.querySelector('.pd-notaLiquidacaoArquivo');
          if (inputNl.dataset.removerExistente === '1') parcela.removerNotaLiquidacaoArquivo = true;
          const nl = await lerAnexoDoInput_(inputNl);
          if (nl) Object.assign(parcela, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
          if (div.dataset.multiOb === '1') {
            parcela.ordens_bancarias = montarPayloadOrdensBancarias_(div);
          } else {
            const inputOb = div.querySelector('.pd-ordemBancariaArquivo');
            if (inputOb.dataset.removerExistente === '1') parcela.removerOrdemBancariaArquivo = true;
            const ob = await lerAnexoDoInput_(inputOb);
            if (ob) Object.assign(parcela, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });
          }
          return parcela;
        }));
        await Api.chamar('atualizarParcelasDivididasRecibo', { id: recibo.id, dadosBase: dados, parcelas });
      } else {
        const inputNl = document.getElementById('recEdNotaLiquidacaoArquivo');
        const inputOb = document.getElementById('recEdOrdemBancariaArquivo');
        dados.valor_liquidado = UI.parseValorBr(document.getElementById('recEdValorLiquidado').value);
        dados.valor_pago = UI.parseValorBr(document.getElementById('recEdValorPago').value);
        dados.nota_liquidacao_numero = inputNl._numeroDocumentoLido || '';
        if (inputNl.dataset.removerExistente === '1') dados.removerNotaLiquidacaoArquivo = true;
        if (inputOb.dataset.removerExistente === '1') dados.removerOrdemBancariaArquivo = true;

        const nl = await lerAnexoDoInput_(inputNl);
        if (nl) Object.assign(dados, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
        const ob = await lerAnexoDoInput_(inputOb);
        if (ob) Object.assign(dados, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });

        await Api.chamar('atualizarRecibo', { id: recibo.id, data: dados });
      }
      CacheAbas.invalidar('recibos');
      UI.toast('Recibo atualizado com sucesso.', 'sucesso');
      UI.fecharModal();
      await carregar();
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  return { render };
})();
