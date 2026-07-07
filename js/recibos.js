/**
 * GAOCG App - Gestão de Processos de Recibo (Funcionalidade 4, Anexo II),
 * incluindo rateio.
 */

const TelaRecibos = (function () {
  const FRENTES = ['Recibo-UPA', 'Recibo-UPAE', 'Recibo-Hospital'];
  let unidades = [];
  let itens = [];
  let paginaAtual = 1;
  let totalRegistros = 0;
  const TAMANHO_PAGINA = 20;
  let contadorLinhasRateio = 0;
  let historicoRecibosUnidade = [];

  async function render() {
    unidades = await Api.chamar('listarUnidades', { somenteAtivas: true });
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Recibos</h2>
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
          <div class="campo"><label>Frente</label>
            <select id="recFiltroFrente"><option value="">Todas</option>${FRENTES.map(f => `<option>${f}</option>`).join('')}</select>
          </div>
          <button class="botao" id="btnFiltrarRec">Filtrar</button>
          <button class="botao" id="btnExportarRec">Exportar CSV</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoRecibo">+ Novo processo</button>
        </div>
        <div id="listaRecibos"></div>
        <div class="paginacao" id="paginacaoRec"></div>
      </div>`;

    document.getElementById('btnFiltrarRec').addEventListener('click', () => { paginaAtual = 1; carregar(); });
    document.getElementById('recBusca').addEventListener('keydown', e => { if (e.key === 'Enter') { paginaAtual = 1; carregar(); } });
    document.getElementById('btnNovoRecibo').addEventListener('click', () => abrirFormularioNovo());
    document.getElementById('btnExportarRec').addEventListener('click', exportarCsv);
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('recBusca').value.trim(),
      unidade_id: document.getElementById('recFiltroUnidade').value,
      competencia: document.getElementById('recFiltroCompetencia').value.trim(),
      fonte: document.getElementById('recFiltroFonte').value,
      frente: document.getElementById('recFiltroFrente').value
    };
  }

  async function carregar() {
    const resposta = await Api.chamar('listarRecibos', Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtrosAtuais()));
    itens = resposta.items;
    totalRegistros = resposta.total;
    renderTabela();
    renderPaginacao();
  }

  function renderTabela() {
    const alvo = document.getElementById('listaRecibos');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum recibo encontrado.</p>'; return; }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Unidade</th><th>Competência</th><th>Status</th><th>Valor Pago</th><th>Rateio</th><th>Origem</th></tr></thead>
        <tbody>${itens.map(r => {
          const unidade = unidades.find(u => u.id === r.unidade_id);
          return `<tr data-id="${r.id}" class="${r.destacar_parado ? 'linha-parada' : ''}">
            <td>${UI.escaparHtml(unidade ? unidade.nome : r.unidade_id)}</td>
            <td>${UI.escaparHtml(r.competencia)}</td>
            <td>${UI.escaparHtml(r.status)}${r.destacar_parado ? ' <span class="selo amarelo">Parado</span>' : ''}</td>
            <td>${UI.formatarMoeda(r.valor_pago)}${r.alerta_divergencia_valores ? ' <span class="selo vermelho" title="Divergência de valores">!</span>' : ''}</td>
            <td>${r.rateio_grupo_id ? `<span class="selo azul">${r.percentual_rateio || ''}%</span>` : '-'}</td>
            <td>${r.origem === 'importacao_inicial' ? '<span class="selo cinza">Importado</span>' : '<span class="selo verde">Manual</span>'}</td>
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
    const colunas = ['id', 'unidade_id', 'competencia', 'status', 'valor_liquidado', 'valor_pago', 'numero_processo', 'ordem_bancaria', 'rateio_grupo_id', 'percentual_rateio', 'frente', 'origem'];
    const linhas = [colunas.join(';')].concat(resposta.items.map(r => colunas.map(c => `"${String(r[c] === undefined ? '' : r[c]).replace(/"/g, '""')}"`).join(';')));
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'recibos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function abrirReciboExistente(id) {
    const podeAbrir = await EdicaoSimultanea.entrarEmEdicao('Recibo', id);
    if (!podeAbrir) return;
    const recibo = itens.find(r => r.id === id);
    await Api.chamar('marcarReciboVisualizado', { id });
    abrirFormularioEdicao(recibo);
  }

  function opcoesUnidade(selecionadaId) {
    return `<option value="">Selecione...</option>` + unidades.map(u => `<option value="${u.id}" ${selecionadaId === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('');
  }

  async function opcoesStatus(statusAtual) {
    const opcoes = await (async () => { try { return await TelaListas.obterOpcoes('STATUS_RECIBO'); } catch (e) { return []; } })();
    const vistos = new Set();
    const unicas = opcoes.filter(o => (vistos.has(o.valor) ? false : (vistos.add(o.valor), true)));
    return `<option value="">-</option>` + unicas.map(o => `<option ${o.valor === statusAtual ? 'selected' : ''}>${UI.escaparHtml(o.valor)}</option>`).join('');
  }

  // ===================== NOVO RECIBO (com ou sem rateio) =====================

  async function abrirFormularioNovo() {
    const usuario = Auth.usuario();
    const statusOpcoes = await opcoesStatus(null);
    contadorLinhasRateio = 0;

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
          <div class="campo"><label>Ordem Bancária</label><input id="recOrdemBancaria" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recNumeroProcesso" /></div>
          <div class="campo"><label>Status</label><select id="recStatus">${statusOpcoes}</select></div>
          ${usuario.perfil === 'gerente' ? `<div class="campo"><label>Frente</label><select id="recFrente">${FRENTES.map(f => `<option>${f}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="campo"><label>Observação</label><textarea id="recObservacao" rows="2"></textarea></div>
        <div class="campo"><label><input type="checkbox" id="recTemRateio" /> Este pagamento é feito por rateio (2+ parcelas)</label></div>

        <div id="blocoSemRateio" class="grade-2">
          <div class="campo"><label>Valor Liquidado</label><input id="recValorLiquidado" type="number" step="0.01" /></div>
          <div class="campo"><label>Valor Pago</label><input id="recValorPago" type="number" step="0.01" /></div>
        </div>
        <div id="blocoComRateio" class="oculto">
          <div id="linhasRateio"></div>
          <button type="button" class="botao" id="btnAddParcelaRateio">+ Adicionar parcela</button>
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

    document.getElementById('recObjeto').addEventListener('change', function () {
      const objeto = this.value.trim();
      const ultimoLancamento = historicoRecibosUnidade.find(r => (r.objeto || '').trim().toLowerCase() === objeto.toLowerCase());
      if (!ultimoLancamento) return;
      document.getElementById('recInstrumento').value = ultimoLancamento.instrumento || '';
      document.getElementById('recParcelaContratual').value = ultimoLancamento.parcela_contratual || '';
      document.getElementById('recFonte').value = ultimoLancamento.fonte || '';
      document.getElementById('recNotaEmpenho').value = ultimoLancamento.nota_empenho || '';
    });

    document.getElementById('recTemRateio').addEventListener('change', function () {
      document.getElementById('blocoSemRateio').classList.toggle('oculto', this.checked);
      document.getElementById('blocoComRateio').classList.toggle('oculto', !this.checked);
      if (this.checked && !document.getElementById('linhasRateio').children.length) {
        adicionarLinhaRateio(); adicionarLinhaRateio();
      }
    });
    document.getElementById('btnAddParcelaRateio').addEventListener('click', adicionarLinhaRateio);
    document.getElementById('btnCancelarRec').addEventListener('click', UI.fecharModal);
    document.getElementById('btnSalvarRec').addEventListener('click', salvarReciboNovo);
  }

  function adicionarLinhaRateio() {
    contadorLinhasRateio++;
    const id = contadorLinhasRateio;
    const div = document.createElement('div');
    div.className = 'grade-3';
    div.dataset.linhaRateio = id;
    div.innerHTML = `
      <div class="campo"><label>Percentual (%)</label><input type="number" step="0.01" class="rt-percentual" /></div>
      <div class="campo"><label>Valor Liquidado</label><input type="number" step="0.01" class="rt-liquidado" /></div>
      <div class="campo"><label>Valor Pago</label><input type="number" step="0.01" class="rt-pago" /></div>`;
    document.getElementById('linhasRateio').appendChild(div);
  }

  async function salvarReciboNovo() {
    const erroEl = document.getElementById('recErro');
    erroEl.classList.add('oculto');
    const unidadeId = document.getElementById('recUnidade').value;
    if (!unidadeId) { erroEl.textContent = 'Selecione a unidade.'; erroEl.classList.remove('oculto'); return; }

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
      completo: document.getElementById('recCompleto').checked,
      frente: document.getElementById('recFrente') ? document.getElementById('recFrente').value : undefined
    };

    try {
      if (document.getElementById('recTemRateio').checked) {
        const parcelas = Array.from(document.querySelectorAll('#linhasRateio [data-linha-rateio]')).map(div => ({
          percentual_rateio: div.querySelector('.rt-percentual').value,
          valor_liquidado: div.querySelector('.rt-liquidado').value,
          valor_pago: div.querySelector('.rt-pago').value
        }));
        if (parcelas.length < 2) { erroEl.textContent = 'Informe ao menos duas parcelas de rateio.'; erroEl.classList.remove('oculto'); return; }
        await Api.chamar('criarGrupoRateioRecibo', { dadosBase, parcelas });
      } else {
        dadosBase.valor_liquidado = document.getElementById('recValorLiquidado').value;
        dadosBase.valor_pago = document.getElementById('recValorPago').value;
        await Api.chamar('criarRecibo', { data: dadosBase });
      }
      UI.toast('Recibo salvo com sucesso.', 'sucesso');
      UI.fecharModal();
      await carregar();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove('oculto');
    }
  }

  // ===================== EDIÇÃO DE RECIBO EXISTENTE =====================

  async function abrirFormularioEdicao(recibo) {
    const statusOpcoes = await opcoesStatus(recibo.status);
    const corpo = `
      <form id="formReciboEdicao">
        ${recibo.rateio_grupo_id ? `<p class="ajuda">Esta linha faz parte de um grupo de rateio (${UI.escaparHtml(recibo.rateio_grupo_id)}).</p>` : ''}
        ${recibo.divergente_da_unidade ? '<p class="aviso-divergencia">⚠ OSS/CNPJ divergem do cadastro atual da unidade.</p>' : ''}
        ${recibo.alerta_divergencia_valores ? '<p class="aviso-divergencia">⚠ Divergência entre valor liquidado/pago (ou soma do rateio x parcela contratual).</p>' : ''}
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
          <div class="campo"><label>Valor Pago</label><input id="recEdValorPago" type="number" step="0.01" value="${recibo.valor_pago}" /></div>
          <div class="campo"><label>Ordem Bancária</label><input id="recEdOrdemBancaria" value="${UI.escaparHtml(recibo.ordem_bancaria)}" /></div>
          <div class="campo"><label>Nº Processo</label><input id="recEdNumeroProcesso" value="${UI.escaparHtml(recibo.numero_processo)}" /></div>
          <div class="campo"><label>Status</label><select id="recEdStatus">${statusOpcoes}</select></div>
        </div>
        <div class="campo"><label>Observação</label><textarea id="recEdObservacao" rows="2">${UI.escaparHtml(recibo.observacao)}</textarea></div>
        <div class="campo"><label><input type="checkbox" id="recEdCompleto" ${recibo.completo ? 'checked' : ''} /> Cadastro completo</label></div>
        <p id="recEdErro" class="erro-campo oculto"></p>
      </form>`;

    UI.abrirModal('Editar Recibo', corpo,
      `<button class="botao" id="btnCancelarRecEd">Cancelar</button><button class="botao primario" id="btnSalvarRecEd">Salvar</button>`);

    document.getElementById('btnCancelarRecEd').addEventListener('click', async () => {
      await EdicaoSimultanea.sairDaEdicao('Recibo', recibo.id);
      UI.fecharModal();
    });
    document.getElementById('btnSalvarRecEd').addEventListener('click', () => salvarReciboEdicao(recibo));
  }

  async function salvarReciboEdicao(recibo, confirmado) {
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
    if (confirmado) dados.confirmado = true;

    try {
      const resposta = await Api.chamar('atualizarRecibo', { id: recibo.id, data: dados });
      if (resposta.precisaConfirmacao) {
        const confirmar = confirm('Este processo pertence à frente "' + resposta.frente_processo + '", diferente da sua. Deseja continuar com a edição?');
        if (confirmar) await salvarReciboEdicao(recibo, true);
        return;
      }
      UI.toast('Recibo atualizado com sucesso.', 'sucesso');
      await EdicaoSimultanea.sairDaEdicao('Recibo', recibo.id);
      UI.fecharModal();
      await carregar();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.classList.remove('oculto');
    }
  }

  return { render };
})();
