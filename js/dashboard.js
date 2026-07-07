/**
 * GAOCG App - Dashboard e Indicadores (Funcionalidade 8).
 */

const Dashboard = (function () {
  async function render() {
    const container = document.getElementById('conteudo');
    container.innerHTML = `
      <h2 class="titulo-tela">Dashboard</h2>
      <div class="painel">
        <div class="barra-filtros">
          <div class="campo"><label>Competência dos Recibos</label><input id="dashCompetencia" placeholder="mar.26" /></div>
          <button class="botao" id="btnAtualizarDash">Atualizar</button>
        </div>
        <div id="dashConteudo"></div>
      </div>`;
    document.getElementById('btnAtualizarDash').addEventListener('click', carregar);
    await carregar();
  }

  async function carregar() {
    const competencia = document.getElementById('dashCompetencia').value.trim() || undefined;
    const dados = await Api.chamar('obterDashboard', { competencia });
    if (!document.getElementById('dashCompetencia').value) {
      document.getElementById('dashCompetencia').value = dados.recibos.competencia;
    }
    renderConteudo(dados);
  }

  function renderConteudo(dados) {
    const statusLinhas = Object.keys(dados.recibos.por_status).map(status => {
      const s = dados.recibos.por_status[status];
      return `<tr><td>${UI.escaparHtml(status)}</td><td>${s.quantidade}</td><td>${UI.formatarMoeda(s.valor_liquidado)}</td><td>${UI.formatarMoeda(s.valor_pago)}</td></tr>`;
    }).join('');

    document.getElementById('dashConteudo').innerHTML = `
      <div class="grade-indicadores">
        <div class="cartao-indicador"><div class="valor">${dados.recibos.total_recibos}</div><div class="rotulo">Recibos na competência ${UI.escaparHtml(dados.recibos.competencia)}</div></div>
        <div class="cartao-indicador"><div class="valor">${UI.formatarMoeda(dados.recibos.total_valor_pago)}</div><div class="rotulo">Total pago no período</div></div>
        <div class="cartao-indicador"><div class="valor">${dados.sof_ne_pendente.total_pendentes}</div><div class="rotulo">SOF com NE pendente de emissão</div></div>
        <div class="cartao-indicador"><div class="valor">${dados.processos_parados.length}</div><div class="rotulo">Processos "parados" (5+ dias)</div></div>
        ${dados.edicoes_fora_da_frente !== undefined ? `<div class="cartao-indicador"><div class="valor">${dados.edicoes_fora_da_frente}</div><div class="rotulo">Edições fora da frente (histórico)</div></div>` : ''}
      </div>

      <h3 style="font-size:14px;margin:16px 0 8px">Recibos por status (competência atual)</h3>
      <table class="tabela">
        <thead><tr><th>Status</th><th>Qtde</th><th>Valor Liquidado</th><th>Valor Pago</th></tr></thead>
        <tbody>${statusLinhas || '<tr><td colspan="4" class="estado-vazio">Sem recibos nesta competência.</td></tr>'}</tbody>
      </table>

      <h3 style="font-size:14px;margin:16px 0 8px">SOF com Nota de Empenho pendente</h3>
      <table class="tabela">
        <thead><tr><th>SEI</th><th>Nº SOF</th><th>Frente</th></tr></thead>
        <tbody>${dados.sof_ne_pendente.itens.map(s => `<tr><td>${UI.escaparHtml(s.sei)}</td><td>${UI.escaparHtml(s.sof_numero)}</td><td>${UI.escaparHtml(s.frente)}</td></tr>`).join('') || '<tr><td colspan="3" class="estado-vazio">Nenhum SOF pendente.</td></tr>'}</tbody>
      </table>

      <h3 style="font-size:14px;margin:16px 0 8px">Processos parados (5+ dias sem alteração de andamento/status)</h3>
      <table class="tabela">
        <thead><tr><th>Tipo</th><th>Identificação</th><th>Frente</th><th>Dias parado</th></tr></thead>
        <tbody>${dados.processos_parados.map(p => `<tr><td>${p.tipo_processo}</td><td>${UI.escaparHtml(p.sei || p.numero_processo || p.id)}</td><td>${UI.escaparHtml(p.frente)}</td><td>${p.dias_parado}</td></tr>`).join('') || '<tr><td colspan="4" class="estado-vazio">Nenhum processo parado no momento.</td></tr>'}</tbody>
      </table>`;
  }

  return { render };
})();
