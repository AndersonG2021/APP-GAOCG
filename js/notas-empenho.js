/**
 * GAOCG App - Listagem própria de Notas de Empenho (Funcionalidade 5, item 4
 * - Should), filtrável por unidade e período. O cadastro de novas NEs
 * continua sendo feito dentro da tela de SOF (produto final do processo);
 * esta tela é só para acompanhamento/consulta transversal.
 */

const TelaNotasEmpenho = (function () {
  let unidades = [];

  async function render() {
    unidades = await Api.chamar('listarUnidades', { somenteAtivas: true });
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Notas de Empenho</h2>
      <div class="painel">
        <p class="ajuda">A NE é o produto final do processo de SOF: a primeira Nota de Empenho original emitida "resolve" a pendência daquele SOF; reforços entram depois, ao longo do tempo, sem alterar essa marcação.</p>
        <div class="barra-filtros">
          <div class="campo"><label>Unidade</label>
            <select id="neFiltroUnidade"><option value="">Todas</option>${unidades.map(u => `<option value="${u.id}">${UI.escaparHtml(u.nome)}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Período</label><input id="neFiltroPeriodo" placeholder="ex.: 2026" /></div>
          <button class="botao" id="btnFiltrarNe">Filtrar</button>
        </div>
        <div id="listaNe"></div>
      </div>`;
    document.getElementById('btnFiltrarNe').addEventListener('click', carregar);
    await carregar();
  }

  async function carregar() {
    const params = {
      unidade_id: document.getElementById('neFiltroUnidade').value,
      periodo: document.getElementById('neFiltroPeriodo').value.trim()
    };
    const notas = await Api.chamar('listarNotasEmpenho', params);
    renderTabela(notas);
  }

  function renderTabela(notas) {
    const alvo = document.getElementById('listaNe');
    if (!notas.length) { alvo.innerHTML = '<p class="estado-vazio">Nenhuma Nota de Empenho encontrada.</p>'; return; }
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>SOF</th><th>Unidade</th><th>Criado por</th><th>Tipo</th><th>Número</th><th>Valor</th><th>Período</th></tr></thead>
        <tbody>${notas.map(n => {
          const unidade = unidades.find(u => u.id === n.sof_unidade_id);
          return `<tr>
            <td>${UI.escaparHtml(n.sof_sei || n.sof_numero || n.sof_id)}</td>
            <td>${UI.escaparHtml(unidade ? unidade.nome : '-')}</td>
            <td>${UI.escaparHtml(n.sof_criado_por)}</td>
            <td>${n.tipo === 'original' ? '<span class="selo azul">Original</span>' : '<span class="selo cinza">Reforço</span>'}</td>
            <td>${UI.escaparHtml(n.numero_ne || '-')}</td>
            <td>${UI.formatarMoeda(n.valor)}</td>
            <td>${UI.escaparHtml(n.periodo)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  return { render };
})();
