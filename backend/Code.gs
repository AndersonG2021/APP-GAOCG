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


      // Unidades (Funcionalidade 2)
      case 'listarUnidades': return jsonOut_(listarUnidades(session, params));
      case 'criarUnidade': return jsonOut_(criarUnidade(session, params.data));
      case 'atualizarUnidade': return jsonOut_(atualizarUnidade(session, params.id, params.data));
      case 'inativarUnidade': return jsonOut_(inativarUnidade(session, params.id));
      case 'reativarUnidade': return jsonOut_(reativarUnidade(session, params.id));

      // Listas Personalizadas (andamento/status por frente - Funcionalidades 3, 4, 8)
      case 'listarOpcoes': return jsonOut_(listarOpcoes(session, params));
      case 'criarOpcao': return jsonOut_(criarOpcao(session, params.data));
      case 'atualizarOpcao': return jsonOut_(atualizarOpcao(session, params.id, params.data));

      // SOF (Funcionalidade 3)
      case 'listarSof': return jsonOut_(listarSof(session, params));
      case 'obterSof': return jsonOut_(obterSof(session, params.id));
      case 'criarSof': return jsonOut_(criarSof(session, params.data));
      case 'atualizarSof': return jsonOut_(atualizarSof(session, params.id, params.data));
      case 'marcarSofVisualizado': return jsonOut_(marcarSofVisualizado(session, params.id));
      case 'excluirSof': return jsonOut_(excluirSof(session, params.id));

      // Notas de Empenho (Funcionalidade 5)
      case 'listarNotasEmpenhoPorSof': return jsonOut_(listarNotasEmpenhoPorSof(session, params.sofId));
      case 'listarNotasEmpenho': return jsonOut_(listarNotasEmpenho(session, params));
      case 'criarNotaEmpenho': return jsonOut_(criarNotaEmpenho(session, params.data));

      // Recibos (Funcionalidade 4)
      case 'listarRecibos': return jsonOut_(listarRecibos(session, params));
      case 'criarRecibo': return jsonOut_(criarRecibo(session, params.data));
      case 'criarGrupoRateioRecibo': return jsonOut_(criarGrupoRateioRecibo(session, params.dadosBase, params.parcelas));
      case 'atualizarRecibo': return jsonOut_(atualizarRecibo(session, params.id, params.data));
      case 'marcarReciboVisualizado': return jsonOut_(marcarReciboVisualizado(session, params.id));
      case 'migrarRecibosHistorico': return jsonOut_(migrarRecibosHistorico(session, params.linhas));

      // Log de Auditoria (Funcionalidade 6)
      case 'listarLogAuditoria': return jsonOut_(listarLogAuditoria(session, params));

      // Edição Simultânea (Funcionalidade 10)
      case 'abrirEdicao': return jsonOut_(abrirEdicao(session, params.tipoProcesso, params.processoId));
      case 'assumirEdicao': return jsonOut_(assumirEdicao(session, params.tipoProcesso, params.processoId));
      case 'liberarEdicao': return jsonOut_(liberarEdicao(session, params.tipoProcesso, params.processoId));

      // Dashboard (Funcionalidade 8)
      case 'obterDashboard': return jsonOut_(obterDashboard(session, params));

      default:
        return jsonOut_(fail_('Ação desconhecida: ' + action));
    }
  } catch (err) {
    return jsonOut_(fail_('Erro interno no servidor: ' + err.message));
  }
}
