/**
 * GAOCG App - Gestão de Usuários (Funcionalidade 9), exclusiva do gerente.
 */

const TelaUsuarios = (function () {
  const FRENTES = ['SOF-UPA', 'SOF-UPAE', 'SOF-Hospital', 'Recibo-UPA', 'Recibo-UPAE', 'Recibo-Hospital'];
  let usuarios = [];

  async function render() {
    if (!Auth.ehGerente()) {
      document.getElementById('conteudo').innerHTML = '<p class="estado-vazio">Acesso restrito ao perfil gerente.</p>';
      return;
    }
    document.getElementById('conteudo').innerHTML = `
      <h2 class="titulo-tela">Usuários</h2>
      <div class="painel">
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button class="botao primario" id="btnNovoUsuario">+ Novo usuário</button>
        </div>
        <div id="listaUsuarios"></div>
      </div>`;
    document.getElementById('btnNovoUsuario').addEventListener('click', () => abrirFormulario());
    await carregar();
  }

  async function carregar() {
    usuarios = await Api.chamar('listarUsuarios', {});
    renderTabela();
  }

  function renderTabela() {
    const alvo = document.getElementById('listaUsuarios');
    alvo.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Frente</th><th>Ativo</th></tr></thead>
        <tbody>${usuarios.map(u => `
          <tr data-id="${u.id}">
            <td>${UI.escaparHtml(u.nome)}</td>
            <td>${UI.escaparHtml(u.login)}</td>
            <td>${u.perfil === 'gerente' ? '<span class="selo azul">Gerente</span>' : '<span class="selo cinza">Analista</span>'}</td>
            <td>${UI.escaparHtml(u.frente || '-')}</td>
            <td>${u.ativo ? '<span class="selo verde">Ativo</span>' : '<span class="selo cinza">Inativo</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    alvo.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => abrirFormulario(usuarios.find(u => u.id === tr.dataset.id)));
    });
  }

  function abrirFormulario(usuario) {
    const editando = !!usuario;
    const corpo = `
      <form id="formUsuario">
        <div class="campo"><label>Nome *</label><input id="usNome" value="${UI.escaparHtml(usuario ? usuario.nome : '')}" required /></div>
        <div class="campo"><label>Login *</label><input id="usLogin" value="${UI.escaparHtml(usuario ? usuario.login : '')}" ${editando ? 'disabled' : ''} required /></div>
        ${!editando ? `<div class="campo"><label>Senha inicial *</label><input id="usSenha" type="password" minlength="6" required /></div>` : ''}
        <div class="campo"><label>Perfil</label>
          <select id="usPerfil">
            <option value="analista" ${usuario && usuario.perfil === 'analista' ? 'selected' : ''}>Analista</option>
            <option value="gerente" ${usuario && usuario.perfil === 'gerente' ? 'selected' : ''}>Gerente</option>
          </select>
        </div>
        <div class="campo" id="grupoFrente"><label>Frente</label>
          <select id="usFrente">
            ${FRENTES.map(f => `<option ${usuario && usuario.frente === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <p id="usErro" class="erro-campo oculto"></p>
      </form>`;
    const rodape = `
      ${editando ? `
        <button class="botao ${usuario.ativo ? 'perigo' : 'sucesso'}" id="btnToggleUsuario">${usuario.ativo ? 'Inativar' : 'Reativar'}</button>
        <button class="botao" id="btnRedefinirSenha">Redefinir senha</button>` : ''}
      <button class="botao" id="btnCancelarUsuario">Cancelar</button>
      <button class="botao primario" id="btnSalvarUsuario">Salvar</button>`;

    UI.abrirModal(editando ? 'Editar usuário' : 'Novo usuário', corpo, rodape);

    const perfilSelect = document.getElementById('usPerfil');
    const atualizarVisibilidadeFrente = () => {
      document.getElementById('grupoFrente').classList.toggle('oculto', perfilSelect.value === 'gerente');
    };
    perfilSelect.addEventListener('change', atualizarVisibilidadeFrente);
    atualizarVisibilidadeFrente();

    document.getElementById('btnCancelarUsuario').addEventListener('click', UI.fecharModal);

    if (editando) {
      document.getElementById('btnToggleUsuario').addEventListener('click', async () => {
        if (usuario.ativo) {
          await Api.chamar('inativarUsuario', { id: usuario.id });
        } else {
          await Api.chamar('atualizarUsuario', { id: usuario.id, data: { ativo: true } });
        }
        UI.toast('Usuário atualizado.', 'sucesso');
        UI.fecharModal();
        await carregar();
      });
      document.getElementById('btnRedefinirSenha').addEventListener('click', async () => {
        const novaSenha = prompt('Nova senha (mínimo 6 caracteres):');
        if (!novaSenha) return;
        try {
          await Api.chamar('redefinirSenha', { id: usuario.id, novaSenha });
          UI.toast('Senha redefinida.', 'sucesso');
        } catch (err) {
          UI.toast(err.message, 'erro');
        }
      });
    }

    document.getElementById('btnSalvarUsuario').addEventListener('click', async () => {
      const erroEl = document.getElementById('usErro');
      erroEl.classList.add('oculto');
      const dados = {
        nome: document.getElementById('usNome').value.trim(),
        perfil: document.getElementById('usPerfil').value,
        frente: document.getElementById('usFrente').value
      };
      if (!editando) {
        dados.login = document.getElementById('usLogin').value.trim();
        dados.senha = document.getElementById('usSenha').value;
      }
      try {
        if (editando) await Api.chamar('atualizarUsuario', { id: usuario.id, data: dados });
        else await Api.chamar('criarUsuario', { data: dados });
        UI.toast('Usuário salvo com sucesso.', 'sucesso');
        UI.fecharModal();
        await carregar();
      } catch (err) {
        UI.mostrarErro(erroEl, err.message);
      }
    });
  }

  return { render };
})();
