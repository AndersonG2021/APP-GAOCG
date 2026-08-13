/**
 * GAOCG App - Backend (Google Apps Script), ponto de entrada da Web App.
 *
 * Deploy: Implantar como "Aplicativo da Web"
 *   - Executar como: Eu (usuário que implantou)
 *   - Quem tem acesso: Qualquer pessoa
 *
 * Todo endpoint (inclusive leitura) exige um token válido, exceto as ações
 * em PUBLIC_ACTIONS. O frontend (GitHub Pages) nunca acessa a planilha
 * diretamente - toda leitura/escrita passa por aqui. Ver Utils.gs para a
 * explicação da estratégia de CORS (evitar preflight, em vez de tentar
 * responder a ele).
 */

var PUBLIC_ACTIONS = ['ping', 'login'];

function doGet(e) {
  return handleRequest_(e.parameter || {});
}

function doPost(e) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut_(fail_('Corpo da requisição inválido (JSON malformado).'));
    }
  }
  return handleRequest_(body);
}

function handleRequest_(params) {
  var action = params.action;
  if (!action) return jsonOut_(fail_('Parâmetro "action" ausente.'));

  var session = null;
  if (PUBLIC_ACTIONS.indexOf(action) === -1) {
    session = requireAuth_(params.token);
    if (!session) return jsonOut_(fail_('Sessão inválida. Faça login novamente.'));
  }

  try {
    switch (action) {
      case 'ping': return jsonOut_(ok_({ pong: true }));
      case 'login': return jsonOut_(login_(params.login, params.senha));

      // Usuários (Funcionalidade 9)
      case 'listarUsuarios': return jsonOut_(listarUsuarios(session));
      case 'criarUsuario': return jsonOut_(criarUsuario(session, params.data));
      case 'atualizarUsuario': return jsonOut_(atualizarUsuario(session, params.id, params.data));
      case 'inativarUsuario': return jsonOut_(inativarUsuario(session, params.id));
      case 'redefinirSenha': return jsonOut_(redefinirSenha(session, params.id, params.novaSenha));
      case 'alterarMinhaSenha': return jsonOut_(alterarMinhaSenha(session, params.senhaAtual, params.novaSenha));
      case 'alterarMeuNome': return jsonOut_(alterarMeuNome(session, params.novoNome));


      // Unidades (Funcionalidade 2)
      case 'listarUnidades': return jsonOut_(listarUnidades(session, params));
      case 'criarUnidade': return jsonOut_(criarUnidade(session, params.data));
      case 'atualizarUnidade': return jsonOut_(atualizarUnidade(session, params.id, params.data));
      case 'inativarUnidade': return jsonOut_(inativarUnidade(session, params.id));
      case 'reativarUnidade': return jsonOut_(reativarUnidade(session, params.id));

      // Listas Personalizadas (andamento/status globais - Funcionalidades 3, 4, 8)
      case 'listarOpcoes': return jsonOut_(listarOpcoes(session, params));
      case 'criarOpcao': return jsonOut_(criarOpcao(session, params.data));
      case 'atualizarOpcao': return jsonOut_(atualizarOpcao(session, params.id, params.data));
      case 'excluirOpcao': return jsonOut_(excluirOpcao(session, params.id));

      // SOF (Funcionalidade 3)
      case 'listarSof': return jsonOut_(listarSof(session, params));
      case 'obterSof': return jsonOut_(obterSof(session, params.id));
      case 'obterTemplateSof': return jsonOut_(obterTemplateSof(session, params.tipo, params.unidadeId));
      case 'criarSof': return jsonOut_(criarSof(session, params.data));
      case 'atualizarSof': return jsonOut_(atualizarSof(session, params.id, params.data));
      case 'marcarSofVisualizado': return jsonOut_(marcarSofVisualizado(session, params.id));
      case 'excluirSof': return jsonOut_(excluirSof(session, params.id));

      // Notas de Empenho (Funcionalidade 5)
      case 'listarNotasEmpenhoPorSof': return jsonOut_(listarNotasEmpenhoPorSof(session, params.sofId));
      case 'listarNotasEmpenhoPorUnidade': return jsonOut_(listarNotasEmpenhoPorUnidade(session, params.unidadeId));
      case 'listarObjetosSofPorUnidade': return jsonOut_(listarObjetosSofPorUnidade(session, params.unidadeId));
      case 'listarNotasEmpenho': return jsonOut_(listarNotasEmpenho(session, params));
      case 'lerAnexoNotaEmpenho': return jsonOut_(lerAnexoNotaEmpenho(session, params));
      case 'descartarArquivoNaoSalvoNotaEmpenho': return jsonOut_(descartarArquivoNaoSalvoNotaEmpenho(session, params.arquivoId));
      case 'criarNotaEmpenho': return jsonOut_(criarNotaEmpenho(session, params.data));
      case 'criarReforcosEmLote': return jsonOut_(criarReforcosEmLote(session, params.data));
      case 'excluirNotaEmpenho': return jsonOut_(excluirNotaEmpenho(session, params.id));
      case 'excluirNotasEmpenhoEmLote': return jsonOut_(excluirNotasEmpenhoEmLote(session, params.ids));

      // Recibos (Funcionalidade 4)
      case 'listarRecibos': return jsonOut_(listarRecibos(session, params));
      case 'indicadoresRecibos': return jsonOut_(indicadoresRecibos(session, params));
      case 'criarRecibo': return jsonOut_(criarRecibo(session, params.data));
      case 'criarGrupoParcelaDivididaRecibo': return jsonOut_(criarGrupoParcelaDivididaRecibo(session, params.dadosBase, params.parcelas));
      case 'atualizarRecibo': return jsonOut_(atualizarRecibo(session, params.id, params.data));
      case 'listarRecibosPorGrupo': return jsonOut_(listarRecibosPorGrupo(session, params.grupoId));
      case 'atualizarParcelasDivididasRecibo': return jsonOut_(atualizarParcelasDivididasRecibo(session, params.id, params.dadosBase, params.parcelas));
      case 'excluirRecibo': return jsonOut_(excluirRecibo(session, params.id));
      case 'marcarReciboVisualizado': return jsonOut_(marcarReciboVisualizado(session, params.id));
      case 'migrarRecibosHistorico': return jsonOut_(migrarRecibosHistorico(session, params.linhas));
      case 'lerAnexoRecibo': return jsonOut_(lerAnexoRecibo(session, params));

      // Log de Auditoria (Funcionalidade 6)
      case 'listarLogAuditoria': return jsonOut_(listarLogAuditoria(session, params));

      // Edição Simultânea (Funcionalidade 10)
      case 'abrirEdicao': return jsonOut_(abrirEdicao(session, params.tipoProcesso, params.processoId));
      case 'assumirEdicao': return jsonOut_(assumirEdicao(session, params.tipoProcesso, params.processoId));
      case 'liberarEdicao': return jsonOut_(liberarEdicao(session, params.tipoProcesso, params.processoId));

      // Dashboard (Funcionalidade 8)
      case 'obterDashboard': return jsonOut_(obterDashboard(session, params));
      case 'obterGraficoDashboard': return jsonOut_(obterGraficoDashboard(session, params));

      // Relatórios (Parte 3 do redesign do Dashboard)
      case 'obterCatalogoRelatorios': return jsonOut_(obterCatalogoRelatorios(session));
      case 'gerarRelatorio': return jsonOut_(gerarRelatorio(session, params));
      case 'gerarRelatorioSheets': return jsonOut_(gerarRelatorioSheets(session, params));
      case 'listarModelosRelatorio': return jsonOut_(listarModelosRelatorio(session));
      case 'salvarModeloRelatorio': return jsonOut_(salvarModeloRelatorio(session, params.data));
      case 'excluirModeloRelatorio': return jsonOut_(excluirModeloRelatorio(session, params.id));

      // Versões (cache client-side por aba)
      case 'getVersoes': return jsonOut_(getVersoes(session, params));

      default:
        return jsonOut_(fail_('Ação desconhecida: ' + action));
    }
  } catch (err) {
    return jsonOut_(fail_('Erro interno no servidor: ' + err.message));
  }
}
