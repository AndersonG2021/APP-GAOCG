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
  let abrindoLinha = false;

  async function render() {
    const [unidadesCarregadas, statusFiltroOpcoes] = await Promise.all([
      Api.chamar('listarUnidades', { somenteAtivas: true }, { cache: true }),
      opcoesStatusFiltro('')
    ]);
    unidades = unidadesCarregadas;
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Recibos</h2>
      <div class="grade-indicadores" id="recIndicadores"></div>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="recBusca" placeholder="processo, ordem bancária, valor..." /></div>
          <div class="campo"><label>Unidade</label>
            <select id="recFiltroUnidade"><option value="">Todas</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Competência</label><select id="recFiltroCompetencia">${UI.opcoesCompetenciaHtml('', true)}</select></div>
          <div class="campo"><label>Fonte</label>
            <select id="recFiltroFonte"><option value="">Todas</option><option>TESOURO</option><option>SUS</option><option>Outra</option></select>
          </div>
          <div class="campo"><label>Status</label><select id="recFiltroStatus">${statusFiltroOpcoes}</select></div>
          <div class="campo"><label>Objeto</label><input id="recFiltroObjeto" placeholder="Objeto" /></div>
          <div class="campo"><label>Instrumento</label><input id="recFiltroInstrumento" placeholder="Instrumento" /></div>
          <div class="campo"><label>Nota de Empenho</label><input id="recFiltroNotaEmpenho" placeholder="Nota de Empenho" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recFiltroNumeroProcesso" placeholder="Nº Processo" /></div>
          <button class="botao" id="btnFiltrarRec">Filtrar</button>
          <button class="botao" id="btnExportarRec">Exportar CSV</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoRecibo">+ Novo processo</button>
        </div>
        <div id="listaRecibos"></div>
        <div class="paginacao" id="paginacaoRec"></div>
      </div>`;

    document.getElementById('btnFiltrarRec').addEventListener('click', () => { paginaAtual = 1; carregar(); });
    ['recBusca', 'recFiltroObjeto', 'recFiltroInstrumento', 'recFiltroNotaEmpenho', 'recFiltroNumeroProcesso'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') { paginaAtual = 1; carregar(); } });
    });
    document.getElementById('btnNovoRecibo').addEventListener('click', async function () {
      this.disabled = true;
      try { await abrirFormularioNovo(); } finally { this.disabled = false; }
    });
    document.getElementById('btnExportarRec').addEventListener('click', exportarCsv);
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('recBusca').value.trim(),
      unidade_id: document.getElementById('recFiltroUnidade').value,
      competencia: document.getElementById('recFiltroCompetencia').value.trim(),
      fonte: document.getElementById('recFiltroFonte').value,
      status: document.getElementById('recFiltroStatus').value,
      objeto: document.getElementById('recFiltroObjeto').value.trim(),
      instrumento: document.getElementById('recFiltroInstrumento').value.trim(),
      nota_empenho: document.getElementById('recFiltroNotaEmpenho').value.trim(),
      numero_processo: document.getElementById('recFiltroNumeroProcesso').value.trim()
    };
  }

  async function carregar() {
    const filtros = filtrosAtuais();
    const [resposta, indicadores] = await Promise.all([
      Api.chamar('listarRecibos', Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtros)),
      Api.chamar('indicadoresRecibos', filtros)
    ]);
    itens = resposta.items;
    totalRegistros = resposta.total;
    renderTabela();
    renderPaginacao();
    renderIndicadores(indicadores);
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
        <thead><tr><th>Unidade</th><th>Nº Processo</th><th>Competência</th><th>Valor Liquidado</th><th>Valor Pago</th><th>Ordem Bancária</th><th>Status</th></tr></thead>
        <tbody>${itens.map(r => {
          const unidade = unidades.find(u => u.id === r.unidade_id);
          return `<tr data-id="${r.id}" class="${r.destacar_parado ? 'linha-parada' : ''}">
            <td>${UI.escaparHtml(unidade ? unidade.nome : r.unidade_id)}</td>
            <td>${UI.escaparHtml(r.numero_processo)}</td>
            <td>${UI.escaparHtml(r.competencia)}</td>
            <td>${UI.formatarMoeda(r.valor_liquidado)}</td>
            <td>${UI.formatarMoeda(r.valor_pago)}${r.alerta_divergencia_valores ? ' <span class="selo vermelho" title="Divergência de valores">!</span>' : ''}</td>
            <td>${UI.escaparHtml(r.ordem_bancaria)}</td>
            <td>${UI.escaparHtml(r.status)}${r.destacar_parado ? ' <span class="selo amarelo">Parado</span>' : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => abrirReciboExistente(tr.dataset.id)));
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
      const podeAbrir = await EdicaoSimultanea.entrarEmEdicao('Recibo', id);
      if (!podeAbrir) return;
      const recibo = itens.find(r => r.id === id);
      // marcarReciboVisualizado é só informativo (tira o destaque de "parado")
      // e não precisa bloquear a abertura do formulário - ver RELATORIO_LENTIDAO_SOF.md.
      Api.chamar('marcarReciboVisualizado', { id }).catch(() => {});
      await abrirFormularioEdicao(recibo);
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
    if (arquivo.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 8MB).');
    const base64 = await UI.lerArquivoBase64(arquivo);
    return { base64, nome: arquivo.name, tipo: arquivo.type };
  }

  // ===================== NOVO RECIBO (com ou sem parcela dividida) =====================

  async function abrirFormularioNovo() {
    const statusOpcoes = await opcoesStatus(null, '');
    contadorLinhasParcelaDividida = 0;

    const corpo = `
      <form id="formRecibo">
        <div class="grade-2">
          <div class="campo"><label>Unidade *</label><select id="recUnidade" required>${opcoesUnidade(null)}</select></div>
          <div class="campo"><label>OSS</label><input id="recOss" /></div>
          <div class="campo"><label>CNPJ</label><input id="recCnpj" /></div>
          <div class="campo"><label>Tipo de Unidade</label><input id="recTipoUnidade" /></div>
          <div class="campo"><label>Objeto</label><input id="recObjeto" list="recObjetoLista" disabled /><datalist id="recObjetoLista"></datalist>
            <p class="ajuda">Selecione a unidade primeiro. Escolhendo um objeto já usado antes para ela, os campos abaixo são preenchidos com o último lançamento.</p>
          </div>
          <div class="campo"><label>Instrumento</label><input id="recInstrumento" /></div>
          <div class="campo"><label>Parcela Contratual</label><input id="recParcelaContratual" type="number" step="0.01" /></div>
          <div class="campo"><label>Fonte</label><select id="recFonte"><option value="">-</option><option>TESOURO</option><option>SUS</option><option>Outra</option></select></div>
          <div class="campo"><label>Nota de Empenho</label><input id="recNotaEmpenho" /></div>
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

      const objetoInput = document.getElementById('recObjeto');
      const objetoLista = document.getElementById('recObjetoLista');
      objetoInput.disabled = !unidade;
      objetoLista.innerHTML = '';
      historicoRecibosUnidade = [];
      if (!unidade) return;

      const resposta = await Api.chamar('listarRecibos', { unidade_id: unidade.id, pageSize: 1000 });
      historicoRecibosUnidade = resposta.items.slice().sort((a, b) => b.data_criacao < a.data_criacao ? -1 : 1);

      const vistos = new Set();
      historicoRecibosUnidade.forEach(r => {
        const objeto = (r.objeto || '').trim();
        if (objeto && !vistos.has(objeto)) {
          vistos.add(objeto);
          objetoLista.insertAdjacentHTML('beforeend', `<option value="${UI.escaparHtml(objeto)}"></option>`);
        }
      });
    });

    document.getElementById('recObjeto').addEventListener('change', async function () {
      const objeto = this.value.trim();
      const ultimoLancamento = historicoRecibosUnidade.find(r => (r.objeto || '').trim().toLowerCase() === objeto.toLowerCase());
      if (!ultimoLancamento) return;
      document.getElementById('recInstrumento').value = ultimoLancamento.instrumento || '';
      document.getElementById('recParcelaContratual').value = ultimoLancamento.parcela_contratual || '';
      document.getElementById('recFonte').value = ultimoLancamento.fonte || '';
      document.getElementById('recNotaEmpenho').value = ultimoLancamento.nota_empenho || '';
      document.getElementById('recStatus').innerHTML = await opcoesStatus(document.getElementById('recStatus').value, document.getElementById('recFonte').value);
    });

    document.getElementById('recFonte').addEventListener('change', async function () {
      document.getElementById('recStatus').innerHTML = await opcoesStatus(document.getElementById('recStatus').value, this.value);
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
      UI.toast('Recibo salvo com sucesso.', 'sucesso');
      UI.fecharModal();
      await carregar();
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  // ===================== EDIÇÃO DE RECIBO EXISTENTE =====================

  async function abrirFormularioEdicao(recibo) {
    const statusOpcoes = await opcoesStatus(recibo.status, recibo.fonte);
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
          <div class="campo"><label>Objeto</label><input id="recEdObjeto" value="${UI.escaparHtml(recibo.objeto)}" /></div>
          <div class="campo"><label>Instrumento</label><input id="recEdInstrumento" value="${UI.escaparHtml(recibo.instrumento)}" /></div>
          <div class="campo"><label>Parcela Contratual</label><input id="recEdParcelaContratual" type="number" step="0.01" value="${recibo.parcela_contratual}" /></div>
          <div class="campo"><label>Fonte</label><select id="recEdFonte">${['', 'TESOURO', 'SUS', 'Outra'].map(f => `<option ${recibo.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="campo"><label>Nota de Empenho</label><input id="recEdNotaEmpenho" value="${UI.escaparHtml(recibo.nota_empenho)}" /></div>
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

    document.getElementById('recEdFonte').addEventListener('change', async function () {
      document.getElementById('recEdStatus').innerHTML = await opcoesStatus(document.getElementById('recEdStatus').value, this.value);
    });

    document.getElementById('btnCancelarRecEd').addEventListener('click', async () => {
      await EdicaoSimultanea.sairDaEdicao('Recibo', recibo.id);
      UI.fecharModal();
    });
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
      const nl = await lerAnexoDoInput_(document.getElementById('recEdNotaLiquidacaoArquivo'));
      if (nl) Object.assign(dados, { notaLiquidacaoArquivoBase64: nl.base64, notaLiquidacaoArquivoNome: nl.nome, notaLiquidacaoArquivoTipo: nl.tipo });
      const ob = await lerAnexoDoInput_(document.getElementById('recEdOrdemBancariaArquivo'));
      if (ob) Object.assign(dados, { ordemBancariaArquivoBase64: ob.base64, ordemBancariaArquivoNome: ob.nome, ordemBancariaArquivoTipo: ob.tipo });

      await Api.chamar('atualizarRecibo', { id: recibo.id, data: dados });
      UI.toast('Recibo atualizado com sucesso.', 'sucesso');
      await EdicaoSimultanea.sairDaEdicao('Recibo', recibo.id);
      UI.fecharModal();
      await carregar();
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  return { render };
})();
