/**
 * GAOCG App - Gestão de Processos de SOF (Funcionalidade 3, Anexo I) + Notas de
 * Empenho acopladas (Funcionalidade 5).
 */

const TelaSof = (function () {
  const FRENTES = ['SOF-UPA', 'SOF-UPAE', 'SOF-Hospital'];
  const ETAPAS_ANDAMENTO = [
    'SES-NP_DGPO', 'SES-DGPO', 'SES', 'NAP_POAS', 'SES-GPOAS', 'SES-GORC', 'SES-GPF',
    'SES-CEO_GAOCG', 'SES-DGMCG', 'SES-GEMP', 'NE EMITIDA', 'SES-CJCG', 'C.G./T.A. FORMALIZADO'
  ];
  const CAMPOS_OBRIGATORIOS = [
    { id: 'sofOss', rotulo: 'OSS' },
    { id: 'sofCnpj', rotulo: 'CNPJ' },
    { id: 'sofContrato', rotulo: 'Contrato de Gestão' },
    { id: 'sofAcao', rotulo: 'Ação' },
    { id: 'sofSubacao', rotulo: 'Subação' },
    { id: 'sofGd', rotulo: 'G.D.' },
    { id: 'sofSei', rotulo: 'SEI' },
    { id: 'sofNumero', rotulo: 'Nº SOF' },
    { id: 'sofPeriodoInicio', rotulo: 'Período (início)' },
    { id: 'sofPeriodoFim', rotulo: 'Período (fim)' },
    { id: 'sofDea', rotulo: 'DEA' },
    { id: 'sofParcelaMensal', rotulo: 'Parcela Mensal' },
    { id: 'sofFonte', rotulo: 'Fonte' },
    { id: 'sofTotalSolicitado', rotulo: 'Total Solicitado' },
    { id: 'sofObjeto', rotulo: 'Objeto' }
  ];
  let unidades = [];
  let itens = [];
  let paginaAtual = 1;
  let totalRegistros = 0;
  const TAMANHO_PAGINA = 20;
  let sofEmEdicaoId = null;
  let abrindoLinha = false;

  async function render() {
    unidades = await Api.chamar('listarUnidades', { somenteAtivas: true }, { cache: true });
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">SOF</h2>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Busca livre</label><input id="sofBusca" placeholder="unidade, SEI, valor..." /></div>
          <div class="campo"><label>Unidade</label>
            <select id="sofFiltroUnidade"><option value="">Todas</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Fonte</label>
            <select id="sofFiltroFonte"><option value="">Todas</option><option>TESOURO</option><option>SUS</option><option>Outra</option></select>
          </div>
          <div class="campo"><label>Frente</label>
            <select id="sofFiltroFrente"><option value="">Todas</option>${FRENTES.map(f => `<option>${f}</option>`).join('')}</select>
          </div>
          <button class="botao" id="btnFiltrarSof">Filtrar</button>
          <button class="botao" id="btnExportarSof">Exportar CSV</button>
          <span style="flex:1"></span>
          <button class="botao primario" id="btnNovoSof">+ Novo processo</button>
        </div>
        <div id="listaSof"></div>
        <div class="paginacao" id="paginacaoSof"></div>
      </div>`;

    document.getElementById('btnFiltrarSof').addEventListener('click', () => { paginaAtual = 1; carregar(); });
    document.getElementById('sofBusca').addEventListener('keydown', e => { if (e.key === 'Enter') { paginaAtual = 1; carregar(); } });
    document.getElementById('btnNovoSof').addEventListener('click', async function () {
      this.disabled = true;
      try { await abrirFormulario(); } finally { this.disabled = false; }
    });
    document.getElementById('btnExportarSof').addEventListener('click', exportarCsv);
    await carregar();
  }

  function filtrosAtuais() {
    return {
      busca: document.getElementById('sofBusca').value.trim(),
      unidade_id: document.getElementById('sofFiltroUnidade').value,
      fonte: document.getElementById('sofFiltroFonte').value,
      frente: document.getElementById('sofFiltroFrente').value
    };
  }

  async function carregar() {
    const resposta = await Api.chamar('listarSof', Object.assign({ page: paginaAtual, pageSize: TAMANHO_PAGINA }, filtrosAtuais()));
    itens = resposta.items;
    totalRegistros = resposta.total;
    renderTabela();
    renderPaginacao();
  }

  function renderTabela() {
    const alvo = document.getElementById('listaSof');
    if (!itens.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhum processo de SOF encontrado.</p>'; return; }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Unidade</th><th>SEI</th><th>Nº SOF</th><th>Andamento</th><th>Frente</th><th>NE</th><th>Total Solicitado</th></tr></thead>
        <tbody>${itens.map(s => {
          const unidade = unidades.find(u => u.id === s.unidade_id);
          return `<tr data-id="${s.id}" class="${s.destacar_parado ? 'linha-parada' : ''}">
            <td>${UI.escaparHtml(unidade ? unidade.nome : s.unidade_id)}</td>
            <td>${UI.escaparHtml(s.sei)}</td>
            <td>${UI.escaparHtml(s.sof_numero)}</td>
            <td>${UI.escaparHtml(s.andamento)}${s.destacar_parado ? ' <span class="selo amarelo">Parado</span>' : ''}</td>
            <td>${UI.escaparHtml(s.frente)}</td>
            <td>${s.possui_ne ? '<span class="selo verde">Emitida</span>' : '<span class="selo amarelo">Pendente</span>'}</td>
            <td>${UI.formatarMoeda(s.total_solicitado)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => abrirSofExistente(tr.dataset.id)));
  }

  function renderPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / TAMANHO_PAGINA));
    document.getElementById('paginacaoSof').innerHTML = `
      <span>${totalRegistros} registro(s) - página ${paginaAtual} de ${totalPaginas}</span>
      <div class="botoes">
        <button class="botao" id="sofPagAnterior" ${paginaAtual <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="botao" id="sofPagProxima" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima</button>
      </div>`;
    document.getElementById('sofPagAnterior').addEventListener('click', () => { paginaAtual--; carregar(); });
    document.getElementById('sofPagProxima').addEventListener('click', () => { paginaAtual++; carregar(); });
  }

  async function exportarCsv() {
    const resposta = await Api.chamar('listarSof', Object.assign({ page: 1, pageSize: 100000 }, filtrosAtuais()));
    const colunas = ['id', 'unidade_id', 'sei', 'sof_numero', 'periodo_inicio', 'periodo_fim', 'andamento', 'objeto', 'fonte', 'total_solicitado', 'frente', 'possui_ne'];
    const linhas = [colunas.join(';')].concat(resposta.items.map(s => colunas.map(c => `"${String(s[c] === undefined ? '' : s[c]).replace(/"/g, '""')}"`).join(';')));
    baixarArquivo('sof.csv', linhas.join('\n'));
  }

  function baixarArquivo(nome, conteudo) {
    const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
  }

  async function abrirSofExistente(id) {
    if (abrindoLinha) return;
    abrindoLinha = true;
    try {
      const podeAbrir = await EdicaoSimultanea.entrarEmEdicao('SOF', id);
      if (!podeAbrir) return;
      const sof = await Api.chamar('obterSof', { id });
      await Api.chamar('marcarSofVisualizado', { id });
      await abrirFormulario(sof);
    } finally {
      abrindoLinha = false;
    }
  }

  function camposAutopreenchimento(unidade, sof) {
    const mapa = {
      oss_snapshot: 'oss', cnpj_snapshot: 'cnpj', contrato_snapshot: 'contrato_gestao',
      classificacao_orcamentaria_snapshot: 'classificacao_orcamentaria', acao_snapshot: 'acao',
      subacao_snapshot: 'subacao', gd_snapshot: 'gd'
    };
    const resultado = {};
    Object.keys(mapa).forEach(campoSnapshot => {
      resultado[campoSnapshot] = sof ? (sof[campoSnapshot] || '') : (unidade ? unidade[mapa[campoSnapshot]] || '' : '');
    });
    return resultado;
  }

  async function abrirFormulario(sof) {
    const editando = !!sof;
    sofEmEdicaoId = editando ? sof.id : null;
    const usuario = Auth.usuario();
    const unidadeAtual = sof ? unidades.find(u => u.id === sof.unidade_id) : null;
    const snapshot = camposAutopreenchimento(unidadeAtual, sof);
    const corpo = `
      <form id="formSof">
        <div class="campo"><label>Unidade *</label>
          <select id="sofUnidade" required ${editando ? 'disabled' : ''}>
            <option value="">Selecione...</option>
            ${unidades.map(u => `<option value="${u.id}" ${sof && sof.unidade_id === u.id ? 'selected' : ''}>${UI.escaparHtml(u.nome)}</option>`).join('')}
          </select>
        </div>
        ${sof && sof.divergente_da_unidade ? '<p class="aviso-divergencia">⚠ Um ou mais campos abaixo divergem do cadastro atual da unidade.</p>' : ''}
        <div class="grade-3">
          <div class="campo"><label>OSS</label><input id="sofOss" value="${UI.escaparHtml(snapshot.oss_snapshot)}" /></div>
          <div class="campo"><label>CNPJ</label><input id="sofCnpj" value="${UI.escaparHtml(snapshot.cnpj_snapshot)}" /></div>
          <div class="campo"><label>Contrato de Gestão</label><input id="sofContrato" value="${UI.escaparHtml(snapshot.contrato_snapshot)}" /></div>
          <div class="campo"><label>Ação</label><input id="sofAcao" value="${UI.escaparHtml(snapshot.acao_snapshot)}" /></div>
          <div class="campo"><label>Subação</label><input id="sofSubacao" value="${UI.escaparHtml(snapshot.subacao_snapshot)}" /></div>
          <div class="campo"><label>G.D.</label><input id="sofGd" value="${UI.escaparHtml(snapshot.gd_snapshot)}" /></div>
          <div class="campo"><label>SEI</label><input id="sofSei" value="${UI.escaparHtml(sof ? sof.sei : '')}" placeholder="0000000000.000000/0000-00" /></div>
          <div class="campo"><label>Nº SOF</label><input id="sofNumero" value="${UI.escaparHtml(sof ? sof.sof_numero : '')}" placeholder="000/0000" /></div>
          <div class="campo"><label>Período - início</label><input type="date" id="sofPeriodoInicio" value="${UI.escaparHtml(sof ? sof.periodo_inicio : '')}" /></div>
          <div class="campo"><label>Período - fim</label><input type="date" id="sofPeriodoFim" value="${UI.escaparHtml(sof ? sof.periodo_fim : '')}" /></div>
          <div class="campo"><label>DEA</label>
            <select id="sofDea">
              <option value="">-</option>
              <option ${sof && sof.dea === 'SIM' ? 'selected' : ''}>SIM</option>
              <option ${sof && sof.dea === 'NÃO' ? 'selected' : ''}>NÃO</option>
            </select>
          </div>
          <div class="campo"><label>T.A.</label><input id="sofTa" value="${UI.escaparHtml(sof ? sof.ta : '')}" /></div>
          <div class="campo"><label>Parcela Mensal</label><input id="sofParcelaMensal" type="number" step="0.01" value="${sof ? sof.parcela_mensal : ''}" /></div>
          <div class="campo"><label>Fonte</label>
            <select id="sofFonte"><option value="">-</option>${['TESOURO', 'SUS', 'Outra'].map(f => `<option ${sof && sof.fonte === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>CEO</label><input id="sofCeo" value="${UI.escaparHtml(sof ? sof.ceo : '')}" /></div>
          <div class="campo"><label>Total Solicitado</label><input id="sofTotalSolicitado" type="number" step="0.01" value="${sof ? sof.total_solicitado : ''}" /></div>
          ${usuario.perfil === 'gerente' && !editando ? `<div class="campo"><label>Frente</label><select id="sofFrente">${FRENTES.map(f => `<option>${f}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="campo"><label>Objeto</label><textarea id="sofObjeto" rows="2">${UI.escaparHtml(sof ? sof.objeto : '')}</textarea></div>
        <div class="campo"><label>Observação</label><textarea id="sofObservacao" rows="2">${UI.escaparHtml(sof ? sof.observacao : '')}</textarea></div>
        <div class="campo"><label>Andamento</label>
          <div id="stepperAndamento">${editando ? '' : '<p class="ajuda">Disponível depois que o processo for salvo.</p>'}</div>
        </div>
        <p id="sofErro" class="erro-campo oculto"></p>
      </form>
      ${editando ? '<div id="secaoNotasEmpenho" style="border-top:1px solid var(--cinza-200);margin-top:16px;padding-top:12px"></div>' : ''}`;

    UI.abrirModal(editando ? 'Editar SOF' : 'Novo processo de SOF', corpo,
      `<button class="botao" id="btnCancelarSof">Cancelar</button><button class="botao primario" id="btnSalvarSof">Salvar</button>`);

    document.getElementById('sofUnidade').addEventListener('change', function () {
      const unidade = unidades.find(u => u.id === this.value);
      const preenchido = camposAutopreenchimento(unidade, null);
      document.getElementById('sofOss').value = preenchido.oss_snapshot;
      document.getElementById('sofCnpj').value = preenchido.cnpj_snapshot;
      document.getElementById('sofContrato').value = preenchido.contrato_snapshot;
      document.getElementById('sofAcao').value = preenchido.acao_snapshot;
      document.getElementById('sofSubacao').value = preenchido.subacao_snapshot;
      document.getElementById('sofGd').value = preenchido.gd_snapshot;
    });

    document.getElementById('btnCancelarSof').addEventListener('click', async () => {
      if (editando) await EdicaoSimultanea.sairDaEdicao('SOF', sof.id);
      UI.fecharModal();
    });

    document.getElementById('btnSalvarSof').addEventListener('click', () => salvarSof(sof));

    if (editando) {
      atualizarStepperVisual(sof);
      await renderNotasEmpenho(sof);
    }
  }

  function coletarDadosFormulario() {
    return {
      unidade_id: document.getElementById('sofUnidade').value,
      oss_snapshot: document.getElementById('sofOss').value.trim(),
      cnpj_snapshot: document.getElementById('sofCnpj').value.trim(),
      contrato_snapshot: document.getElementById('sofContrato').value.trim(),
      acao_snapshot: document.getElementById('sofAcao').value.trim(),
      subacao_snapshot: document.getElementById('sofSubacao').value.trim(),
      gd_snapshot: document.getElementById('sofGd').value.trim(),
      sei: document.getElementById('sofSei').value.trim(),
      sof_numero: document.getElementById('sofNumero').value.trim(),
      periodo_inicio: document.getElementById('sofPeriodoInicio').value,
      periodo_fim: document.getElementById('sofPeriodoFim').value,
      dea: document.getElementById('sofDea').value.trim(),
      ta: document.getElementById('sofTa').value.trim(),
      parcela_mensal: document.getElementById('sofParcelaMensal').value,
      fonte: document.getElementById('sofFonte').value,
      ceo: document.getElementById('sofCeo').value.trim(),
      total_solicitado: document.getElementById('sofTotalSolicitado').value,
      objeto: document.getElementById('sofObjeto').value.trim(),
      observacao: document.getElementById('sofObservacao').value.trim(),
      completo: true,
      frente: document.getElementById('sofFrente') ? document.getElementById('sofFrente').value : undefined
    };
  }

  async function salvarSof(sofExistente, confirmado) {
    const erroEl = document.getElementById('sofErro');
    erroEl.classList.add('oculto');
    const dados = coletarDadosFormulario();
    if (confirmado) dados.confirmado = true;
    if (!dados.unidade_id && !sofExistente) { UI.mostrarErro(erroEl, 'Selecione a unidade.'); return; }
    const mensagemObrigatorio = validarCamposObrigatorios();
    if (mensagemObrigatorio) { UI.mostrarErro(erroEl, mensagemObrigatorio); return; }

    try {
      let resposta;
      if (sofExistente) resposta = await Api.chamar('atualizarSof', { id: sofExistente.id, data: dados });
      else resposta = await Api.chamar('criarSof', { data: dados });

      if (resposta.precisaConfirmacao) {
        const confirmar = confirm('Este processo pertence à frente "' + resposta.frente_processo + '", diferente da sua. Deseja continuar com a edição?');
        if (confirmar) await salvarSof(sofExistente, true);
        return;
      }

      UI.toast('SOF salvo com sucesso.', 'sucesso');
      if (sofExistente) {
        await EdicaoSimultanea.sairDaEdicao('SOF', sofExistente.id);
        UI.fecharModal();
        await carregar();
      } else {
        // Reabre imediatamente em modo edição: só a partir daqui o SOF tem
        // id e a seção de Notas de Empenho (produto final do processo) pode
        // ser usada, sem exigir que o usuário feche e reabra manualmente.
        await carregar();
        await abrirSofExistente(resposta.id);
      }
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  async function renderNotasEmpenho(sof) {
    const notas = await Api.chamar('listarNotasEmpenhoPorSof', { sofId: sof.id });
    const total = notas.reduce((s, n) => s + Number(n.valor || 0), 0);
    const alvo = document.getElementById('secaoNotasEmpenho');
    alvo.innerHTML = `
      <h4 style="margin:0 0 8px">Notas de Empenho (total: ${UI.formatarMoeda(total)})</h4>
      <table class="tabela">
        <thead><tr><th>Tipo</th><th>Número</th><th>Valor</th><th>Período</th><th>Arquivo</th></tr></thead>
        <tbody>${notas.map(n => `<tr><td>${n.tipo}</td><td>${UI.escaparHtml(n.numero_ne || '-')}</td><td>${UI.formatarMoeda(n.valor)}</td><td>${UI.escaparHtml(n.periodo)}</td><td>${n.arquivo_url ? `<a href="${UI.escaparHtml(n.arquivo_url)}" target="_blank" rel="noopener">Ver arquivo</a>` : '-'}</td></tr>`).join('') || '<tr><td colspan="5" class="estado-vazio">Nenhuma NE vinculada ainda.</td></tr>'}</tbody>
      </table>
      <div class="grade-3" style="margin-top:10px">
        <div class="campo"><label>Tipo</label><select id="neTipo"><option value="original">Original</option><option value="reforco">Reforço</option></select></div>
        <div class="campo"><label>Número (obrigatório p/ original)</label><input id="neNumero" /></div>
        <div class="campo"><label>Valor</label><input id="neValor" type="number" step="0.01" /></div>
      </div>
      <div class="campo"><label>Arquivo da Nota de Empenho *</label><input type="file" id="neArquivo" accept=".pdf,image/*" required /></div>
      <button class="botao sucesso" id="btnAddNe">Adicionar Nota de Empenho</button>
      <p id="neErro" class="erro-campo oculto"></p>`;

    document.getElementById('btnAddNe').addEventListener('click', async () => {
      const erroEl = document.getElementById('neErro');
      erroEl.classList.add('oculto');
      const arquivoInput = document.getElementById('neArquivo');
      const arquivo = arquivoInput.files[0];
      if (!arquivo) { UI.mostrarErro(erroEl, 'Anexe o arquivo da Nota de Empenho.'); return; }
      if (arquivo.size > 8 * 1024 * 1024) { UI.mostrarErro(erroEl, 'Arquivo muito grande (máximo 8MB).'); return; }

      try {
        const arquivoBase64 = await lerArquivoBase64(arquivo);
        const tipo = document.getElementById('neTipo').value;
        await Api.chamar('criarNotaEmpenho', {
          data: {
            sof_id: sof.id, tipo, numero_ne: document.getElementById('neNumero').value.trim(), valor: document.getElementById('neValor').value,
            arquivoBase64, arquivoNome: arquivo.name, arquivoTipo: arquivo.type
          }
        });
        UI.toast('Nota de Empenho adicionada.', 'sucesso');
        await renderNotasEmpenho(sof);
        if (tipo === 'original' && sof.andamento !== 'NE EMITIDA') {
          sof.possui_ne = true;
          await avancarEtapa(sof, 'NE EMITIDA');
        }
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  /** Monta o HTML do stepper de Andamento (13 etapas fixas) a partir do andamento atual do SOF. */
  function stepperHtml(sof) {
    const atual = sof && sof.andamento ? ETAPAS_ANDAMENTO.indexOf(sof.andamento) : -1;
    return `<div class="stepper">${ETAPAS_ANDAMENTO.map((etapa, i) => {
      const estado = i <= atual ? 'concluido' : (i === atual + 1 ? 'proximo' : 'futuro');
      return `<div class="stepper-no ${estado}">
        <button type="button" class="stepper-marcador" data-etapa="${UI.escaparHtml(etapa)}" ${estado === 'proximo' ? '' : 'disabled'}>${i <= atual ? '✓' : (i + 1)}</button>
        <span class="stepper-rotulo">${UI.escaparHtml(etapa)}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function atualizarStepperVisual(sof) {
    const alvo = document.getElementById('stepperAndamento');
    if (!alvo) return;
    alvo.innerHTML = stepperHtml(sof);
    alvo.querySelectorAll('.stepper-marcador').forEach(btn => {
      btn.addEventListener('click', () => avancarEtapa(sof, btn.dataset.etapa));
    });
  }

  async function avancarEtapa(sof, etapa) {
    const erroEl = document.getElementById('sofErro');
    if (etapa === 'NE EMITIDA' && !sof.possui_ne) {
      UI.mostrarErro(erroEl, 'Anexe a Nota de Empenho na seção abaixo para avançar esta etapa.');
      const secao = document.getElementById('secaoNotasEmpenho');
      if (secao) secao.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    try {
      await Api.chamar('atualizarSof', { id: sof.id, data: { andamento: etapa } });
      sof.andamento = etapa;
      atualizarStepperVisual(sof);
      UI.toast('Andamento atualizado.', 'sucesso');
    } catch (err) {
      UI.mostrarErro(erroEl, err.message);
    }
  }

  function lerArquivoBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.readAsDataURL(arquivo);
    });
  }

  function validarCamposObrigatorios() {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      const valor = document.getElementById(campo.id).value.trim();
      if (!valor) return 'Preencha o campo obrigatório: ' + campo.rotulo + '.';
    }
    return null;
  }

  return { render };
})();
