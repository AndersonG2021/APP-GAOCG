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

  const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

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
    // Unidade/Tipo de unidade/OSS se estreitam entre si em tempo real (sessão
    // 2026-07-27) - ver UI.recalcularFiltrosCruzadosUnidade (js/app.js).
    const recalcularFiltrosCruzados_ = () => UI.recalcularFiltrosCruzadosUnidade({
      idUnidade: 'recFiltroUnidade', idTipo: 'recFiltroTipoUnidade', idOss: 'recFiltroOss',
      unidadesTodas: unidades, opcoesTipoOriginais: tiposUnidade, opcoesOssOriginais: opcoesOss.map(o => o.valor)
    });
    UI.criarFiltroMultiplo('recFiltroUnidade', unidades.map(u => ({ valor: u.id, rotulo: u.nome })), recalcularFiltrosCruzados_);
    UI.criarFiltroMultiplo('recFiltroOss', opcoesOss.map(o => o.valor), recalcularFiltrosCruzados_);
    UI.criarFiltroMultiplo('recFiltroObjeto', opcoesObjeto.map(o => o.valor));
    UI.criarFiltroMultiplo('recFiltroTipoUnidade', tiposUnidade, recalcularFiltrosCruzados_);
    UI.criarFiltroMultiplo('recFiltroDea', ['SIM', 'NÃO']);
    UI.criarFiltroMultiplo('recFiltroCompetencia', UI.listaCompetencias());
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
    recFiltroFonte: 'fonte', recFiltroStatus: 'status'
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
      () => Api.chamar('listarRecibos', params),
      aplicarResposta_
    );
    aplicarResposta_(resposta);
  }

  function aplicarResposta_(resposta) {
    itens = resposta.items;
    totalRegistros = resposta.total;
    renderTabela();
    renderPaginacao();
    renderIndicadores(resposta.indicadores);
  }

  function renderIndicadores(indicadores) {
    document.getElementById('recIndicadores').innerHTML = `
      <div class="cartao-indicador"><div class="valor">${indicadores.pendentes}</div><div class="rotulo">Pendentes (status ≠ PAGO)</div></div>
      <div class="cartao-indicador"><div class="valor">${UI.formatarMoeda(indicadores.total_pago_ano)}</div><div class="rotulo">Total pago no ano</div></div>`;
  }

  function renderTabela() {
    const alvo = document.getElementById('listaRecibos');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum recibo encontrado.</p>'; return; }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th></th><th>Unidade</th><th>Objeto</th><th>Nº Processo</th><th>Competência</th><th>Valor Liquidado</th><th>Valor Pago</th><th>Ordem Bancária</th><th>Status</th></tr></thead>
        <tbody>${itens.map(r => {
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
            <td>${UI.seloStatusReciboHtml(r.status)}${r.destacar_parado ? ' <span class="selo amarelo">Parado</span>' : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => abrirReciboExistente(tr.dataset.id));
      tr.querySelector('[data-acao="excluir"]').addEventListener('click', e => {
        e.stopPropagation();
        confirmarExclusaoRecibo(tr.dataset.id);
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
   */
  function ligarAnexoComOcr_({ inputEl, tipo, obterNotaEmpenho, valorInputEl }) {
    const statusEl = document.createElement('p');
    statusEl.className = 'ajuda anexo-ocr-status oculto';
    inputEl.insertAdjacentElement('afterend', statusEl);

    function travar(valor, existente) {
      valorInputEl.value = valor;
      valorInputEl.readOnly = true;
      statusEl.classList.remove('oculto');
      statusEl.innerHTML = '🔒 Valor lido do documento. <a href="#" class="anexo-ocr-remover">Remover anexo</a>';
      statusEl.querySelector('.anexo-ocr-remover').addEventListener('click', function (e) {
        e.preventDefault();
        valorInputEl.readOnly = false;
        valorInputEl.value = '';
        inputEl.value = '';
        inputEl._anexoValidado = null;
        inputEl.dataset.removerExistente = existente ? '1' : '';
        statusEl.classList.add('oculto');
      });
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
        travar(resultado.valor, false);
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
          <div class="campo"><label>Parcela Contratual</label><input id="recParcelaContratual" type="number" step="0.01" /></div>
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
        <div class="campo"><label><input type="checkbox" id="recTemParcelaDividida" /> Este pagamento é feito por mais de uma parcela?</label></div>

        <div id="blocoParcelaUnica" class="grade-2">
          <div class="campo"><label>Valor Liquidado</label><input id="recValorLiquidado" type="number" step="0.01" /></div>
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" id="recNotaLiquidacaoArquivo" accept=".pdf,image/*" /></div>
          <div class="campo"><label>Valor Pago</label><input id="recValorPago" type="number" step="0.01" /></div>
          <div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" id="recOrdemBancariaArquivo" accept=".pdf,image/*" /></div>
        </div>
        <div id="blocoComParcelaDividida" class="oculto">
          <div id="linhasParcelaDividida" class="linhas-parcela-dividida"></div>
          <button type="button" class="botao" id="btnAddParcelaDividida">+ Adicionar parcela</button>
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
    });

    document.getElementById('recFonte').addEventListener('change', async function () {
      document.getElementById('recStatus').innerHTML = await opcoesStatus(document.getElementById('recStatus').value, this.value);
      UI.tornarPesquisavel('recStatus');
    });

    document.getElementById('recTemParcelaDividida').addEventListener('change', function () {
      document.getElementById('blocoParcelaUnica').classList.toggle('oculto', this.checked);
      document.getElementById('blocoComParcelaDividida').classList.toggle('oculto', !this.checked);
      if (this.checked && !document.getElementById('linhasParcelaDividida').children.length) {
        adicionarLinhaParcelaDividida(); adicionarLinhaParcelaDividida();
      }
    });
    document.getElementById('btnAddParcelaDividida').addEventListener('click', adicionarLinhaParcelaDividida);
    document.getElementById('btnCancelarRec').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarRec').addEventListener('click', salvarReciboNovo);

    const obterNotaEmpenhoNovo_ = () => document.getElementById('recNotaEmpenho').value;
    ligarAnexoComOcr_({
      inputEl: document.getElementById('recNotaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho: obterNotaEmpenhoNovo_, valorInputEl: document.getElementById('recValorLiquidado')
    });
    ligarAnexoComOcr_({
      inputEl: document.getElementById('recOrdemBancariaArquivo'), tipo: 'ordem_bancaria',
      obterNotaEmpenho: obterNotaEmpenhoNovo_, valorInputEl: document.getElementById('recValorPago')
    });
  }

  function adicionarLinhaParcelaDividida() {
    contadorLinhasParcelaDividida++;
    const id = contadorLinhasParcelaDividida;
    const div = document.createElement('div');
    div.className = 'linha-parcela-dividida';
    div.dataset.linhaParcelaDividida = id;
    div.innerHTML = `
      <div class="linha-parcela-dividida-corpo">
        <div class="grade-3">
          <div class="campo"><label>Percentual (%)</label><input type="number" step="0.01" class="pd-percentual" /></div>
          <div class="campo"><label>Valor Liquidado</label><input type="number" step="0.01" class="pd-liquidado" /></div>
          <div class="campo"><label>Valor Pago</label><input type="number" step="0.01" class="pd-pago" /></div>
        </div>
        <div class="grade-2">
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" class="pd-notaLiquidacaoArquivo" accept=".pdf,image/*" /></div>
          <div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" class="pd-ordemBancariaArquivo" accept=".pdf,image/*" /></div>
        </div>
      </div>
      <button type="button" class="linha-parcela-dividida-remover" title="Remover parcela">&times;</button>`;
    document.getElementById('linhasParcelaDividida').appendChild(div);
    div.querySelector('.linha-parcela-dividida-remover').addEventListener('click', () => {
      div.remove();
      atualizarBotoesRemoverParcelaDividida_();
    });
    atualizarBotoesRemoverParcelaDividida_();

    const obterNotaEmpenhoPd_ = () => document.getElementById('recNotaEmpenho').value;
    ligarAnexoComOcr_({
      inputEl: div.querySelector('.pd-notaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho: obterNotaEmpenhoPd_, valorInputEl: div.querySelector('.pd-liquidado')
    });
    ligarAnexoComOcr_({
      inputEl: div.querySelector('.pd-ordemBancariaArquivo'), tipo: 'ordem_bancaria',
      obterNotaEmpenho: obterNotaEmpenhoPd_, valorInputEl: div.querySelector('.pd-pago')
    });
  }

  /** criarGrupoParcelaDivididaRecibo exige no mínimo 2 parcelas - esconde o botão de remover quando restam só 2. */
  function atualizarBotoesRemoverParcelaDividida_() {
    const linhas = document.querySelectorAll('#linhasParcelaDividida [data-linha-parcela-dividida]');
    linhas.forEach(linha => {
      linha.querySelector('.linha-parcela-dividida-remover').classList.toggle('oculto', linhas.length <= 2);
    });
  }

  async function salvarReciboNovo() {
    const erroEl = document.getElementById('recErro');
    erroEl.classList.add('oculto');
    const unidadeId = document.getElementById('recUnidade').value;
    if (!unidadeId) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }

    const dadosBase = {
      unidade_id: unidadeId,
      oss_snapshot: document.getElementById('recOss').value.trim(),
      cnpj_snapshot: document.getElementById('recCnpj').value.trim(),
      tipo_unidade: document.getElementById('recTipoUnidade').value.trim(),
      objeto: document.getElementById('recObjeto').value.trim(),
      instrumento: document.getElementById('recInstrumento').value.trim(),
      parcela_contratual: document.getElementById('recParcelaContratual').value,
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
            percentual_parcela_dividida: div.querySelector('.pd-percentual').value,
            valor_liquidado: div.querySelector('.pd-liquidado').value,
            valor_pago: div.querySelector('.pd-pago').value
          };
          const nl = await lerAnexoDoInput_(div.querySelector('.pd-notaLiquidacaoArquivo'));
          if (nl) Object.assign(parcela, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
          const ob = await lerAnexoDoInput_(div.querySelector('.pd-ordemBancariaArquivo'));
          if (ob) Object.assign(parcela, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });
          return parcela;
        }));
        await Api.chamar('criarGrupoParcelaDivididaRecibo', { dadosBase, parcelas });
      } else {
        dadosBase.valor_liquidado = document.getElementById('recValorLiquidado').value;
        dadosBase.valor_pago = document.getElementById('recValorPago').value;
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
    const [statusOpcoes, opcoesObjeto, nesDaUnidade] = await Promise.all([
      opcoesStatus(recibo.status, recibo.fonte),
      TelaListas.obterOpcoes('OBJETO'),
      Api.chamar('listarNotasEmpenhoPorUnidade', { unidadeId: recibo.unidade_id })
    ]);
    nesDaUnidadeAtual = nesDaUnidade;
    const corpo = `
      <form id="formReciboEdicao">
        ${recibo.parcela_dividida_grupo_id ? `<p class="ajuda">Esta linha faz parte de um grupo de parcela dividida (${UI.escaparHtml(recibo.parcela_dividida_grupo_id)}).</p>` : ''}
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
          <div class="campo"><label>Parcela Contratual</label><input id="recEdParcelaContratual" type="number" step="0.01" value="${recibo.parcela_contratual}" /></div>
          <div class="campo"><label>Fonte</label><select id="recEdFonte">${['', 'TESOURO', 'SUS', 'Outra'].map(f => `<option ${recibo.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="campo"><label>Nota de Empenho</label>
            <input id="recEdNotaEmpenho" list="listaNeUnidadeEd" value="${UI.escaparHtml(recibo.nota_empenho)}" />
            <datalist id="listaNeUnidadeEd">${opcoesDatalistNe_(nesDaUnidade)}</datalist>
          </div>
          <div class="campo"><label>Competência</label><select id="recEdCompetencia">${UI.opcoesCompetenciaHtml(recibo.competencia)}</select></div>
          <div class="campo"><label>Valor Liquidado</label><input id="recEdValorLiquidado" type="number" step="0.01" value="${recibo.valor_liquidado}" /></div>
          <div class="campo"><label>Nota de Liquidação (anexo)</label><input type="file" id="recEdNotaLiquidacaoArquivo" accept=".pdf,image/*" />${recibo.nota_liquidacao_url ? `<p class="ajuda"><a href="${UI.escaparHtml(recibo.nota_liquidacao_url)}" target="_blank" rel="noopener">Ver arquivo atual</a></p>` : ''}</div>
          <div class="campo"><label>Valor Pago</label><input id="recEdValorPago" type="number" step="0.01" value="${recibo.valor_pago}" /></div>
          <div class="campo"><label>Ordem Bancária (anexo)</label><input type="file" id="recEdOrdemBancariaArquivo" accept=".pdf,image/*" />${recibo.ordem_bancaria_arquivo_url ? `<p class="ajuda"><a href="${UI.escaparHtml(recibo.ordem_bancaria_arquivo_url)}" target="_blank" rel="noopener">Ver arquivo atual</a></p>` : ''}</div>
          <div class="campo"><label>Ordem Bancária (nº)</label><input id="recEdOrdemBancaria" value="${UI.escaparHtml(recibo.ordem_bancaria)}" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recEdNumeroProcesso" value="${UI.escaparHtml(recibo.numero_processo)}" /></div>
          <div class="campo"><label>Status</label><select id="recEdStatus">${statusOpcoes}</select></div>
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

    const obterNotaEmpenhoEd_ = () => document.getElementById('recEdNotaEmpenho').value;
    const anexoNl = ligarAnexoComOcr_({
      inputEl: document.getElementById('recEdNotaLiquidacaoArquivo'), tipo: 'nota_liquidacao',
      obterNotaEmpenho: obterNotaEmpenhoEd_, valorInputEl: document.getElementById('recEdValorLiquidado')
    });
    if (recibo.nota_liquidacao_url) anexoNl.travar(recibo.valor_liquidado, true);
    const anexoOb = ligarAnexoComOcr_({
      inputEl: document.getElementById('recEdOrdemBancariaArquivo'), tipo: 'ordem_bancaria',
      obterNotaEmpenho: obterNotaEmpenhoEd_, valorInputEl: document.getElementById('recEdValorPago')
    });
    if (recibo.ordem_bancaria_arquivo_url) anexoOb.travar(recibo.valor_pago, true);

    document.getElementById('btnCancelarRecEd').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarRecEd').addEventListener('click', () => salvarReciboEdicao(recibo));
  }

  async function salvarReciboEdicao(recibo) {
    const erroEl = document.getElementById('recEdErro');
    erroEl.classList.add('oculto');
    const dados = {
      oss_snapshot: document.getElementById('recEdOss').value.trim(),
      cnpj_snapshot: document.getElementById('recEdCnpj').value.trim(),
      tipo_unidade: document.getElementById('recEdTipoUnidade').value.trim(),
      objeto: document.getElementById('recEdObjeto').value.trim(),
      instrumento: document.getElementById('recEdInstrumento').value.trim(),
      parcela_contratual: document.getElementById('recEdParcelaContratual').value,
      fonte: document.getElementById('recEdFonte').value,
      nota_empenho: document.getElementById('recEdNotaEmpenho').value.trim(),
      competencia: document.getElementById('recEdCompetencia').value.trim(),
      valor_liquidado: document.getElementById('recEdValorLiquidado').value,
      valor_pago: document.getElementById('recEdValorPago').value,
      ordem_bancaria: document.getElementById('recEdOrdemBancaria').value.trim(),
      numero_processo: document.getElementById('recEdNumeroProcesso').value.trim(),
      status: document.getElementById('recEdStatus').value,
      observacao: document.getElementById('recEdObservacao').value.trim(),
      completo: document.getElementById('recEdCompleto').checked
    };

    try {
      const inputNl = document.getElementById('recEdNotaLiquidacaoArquivo');
      const inputOb = document.getElementById('recEdOrdemBancariaArquivo');
      if (inputNl.dataset.removerExistente === '1') dados.removerNotaLiquidacaoArquivo = true;
      if (inputOb.dataset.removerExistente === '1') dados.removerOrdemBancariaArquivo = true;

      const nl = await lerAnexoDoInput_(inputNl);
      if (nl) Object.assign(dados, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
      const ob = await lerAnexoDoInput_(inputOb);
      if (ob) Object.assign(dados, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });

      await Api.chamar('atualizarRecibo', { id: recibo.id, data: dados });
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
