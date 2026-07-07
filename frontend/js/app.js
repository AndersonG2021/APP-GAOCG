/**
 * SGOF - GAOCG | Frontend (Vanilla JS)
 * Fase 1: Login, proteção de rota, dashboard de SOFs e modal de criação.
 */

// ===================== CONFIGURAÇÃO =====================

const CONFIG = {
  // Substitua pela URL do Web App publicado no Google Apps Script (.../exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbxQQN4UEJQwf2OVEywBWxayN4vL09Oq95z9TVU3Vga94gSx5GKcEyVUS7WdmuV5MnD8/exec',
  SESSION_STORAGE_KEY: 'sgof_session'
};

// Mapeia colunas da aba Base_Referencia para os campos do formulário de SOF,
// usados na cascata disparada pela seleção de Unidade. Parcela Contratual
// NÃO entra na cascata: é sempre digitada manualmente pelo usuário.
const CASCADE_FIELD_MAP = {
  TIPO: 'tipoInput',
  OSS: 'ossInput',
  CNPJ: 'cnpjInput',
  FF: 'fonteInput',
  'AÇÃO': 'acaoInput',
  SUB: 'subAcaoInput',
  'G.D': 'grupoDespesaInput',
  INSTRUMENTO: 'contratoInput'
};

// Mapeia ids de campos do formulário para as colunas da aba SOF.
const FORM_FIELD_TO_COLUMN = {
  tipoInput: 'TIPO',
  ossInput: 'OSS',
  cnpjInput: 'CNPJ',
  numProcessoInput: 'NUM_PROCESSO',
  acaoInput: 'ACAO',
  subAcaoInput: 'SUB_ACAO',
  grupoDespesaInput: 'GRUPO_DESPESA',
  unidadeInput: 'UNIDADE',
  numSeiInput: 'NUM_SEI',
  numSofInput: 'NUM_SOF',
  periodoInput: 'PERIODO',
  objetoInput: 'OBJETO',
  fonteInput: 'FONTE',
  contratoInput: 'CONTRATO',
  parcelaMensalInput: 'PARCELA_MENSAL',
  totalSolicitadoInput: 'TOTAL_SOLICITADO',
  obsInput: 'OBS',
  ddoInput: 'DDO',
  dpfInput: 'DPF'
};

const state = {
  token: null,
  user: null,
  sofs: [],
  baseReferencia: []
};

// ===================== HELPERS DE UI =====================

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeInput(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function showSpinner() {
  document.getElementById('spinnerOverlay').classList.remove('hidden');
}

function hideSpinner() {
  document.getElementById('spinnerOverlay').classList.add('hidden');
}

function showToast(message, type) {
  type = type || 'error';
  const colors = { error: 'bg-red-600', success: 'bg-green-600', info: 'bg-slate-700' };
  const el = document.createElement('div');
  el.className = 'text-white text-sm rounded-lg px-4 py-3 shadow-lg fade-in ' + (colors[type] || colors.error);
  el.textContent = message;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(function () { el.remove(); }, 4000);
}

// ===================== SESSÃO =====================

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  sessionStorage.setItem(CONFIG.SESSION_STORAGE_KEY, JSON.stringify({ token: token, user: user }));
}

function loadSession() {
  const raw = sessionStorage.getItem(CONFIG.SESSION_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.user) return false;
    state.token = parsed.token;
    state.user = parsed.user;
    return true;
  } catch (err) {
    return false;
  }
}

function clearSession() {
  state.token = null;
  state.user = null;
  sessionStorage.removeItem(CONFIG.SESSION_STORAGE_KEY);
}

function handleSessionExpired() {
  clearSession();
  showLoginScreen();
}

// ===================== COMUNICAÇÃO COM O BACKEND =====================

/**
 * Envia POST em texto puro (evita preflight CORS) com { action, token, ...payload }.
 * Lança Error com mensagem amigável em caso de falha.
 */
async function apiRequest(action, payload) {
  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('COLOQUE_AQUI') !== -1) {
    const msg = 'URL da API não configurada. Edite CONFIG.API_URL em js/app.js.';
    showToast(msg, 'error');
    throw new Error(msg);
  }

  const body = Object.assign({ action: action, token: state.token }, payload || {});

  showSpinner();
  try {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error('Falha de comunicação com o servidor (HTTP ' + response.status + ').');
    }

    const json = await response.json();
    if (!json.ok) {
      throw new Error(json.error || 'Erro desconhecido retornado pelo servidor.');
    }
    return json;
  } catch (err) {
    if (err.message && err.message.toLowerCase().indexOf('sessão') !== -1) {
      handleSessionExpired();
    }
    showToast(err.message || 'Erro inesperado ao comunicar com o servidor.', 'error');
    throw err;
  } finally {
    hideSpinner();
  }
}

// ===================== TELAS =====================

function showLoginScreen() {
  document.getElementById('dashboardScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function showDashboardScreen() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('dashboardScreen').classList.remove('hidden');
  document.getElementById('userNome').textContent = state.user.nome;
  document.getElementById('userPerfil').textContent = state.user.perfil;
  document.getElementById('novoUsuarioBtn').classList.toggle('hidden', state.user.perfil !== 'Gerente');
}

// ===================== LOGIN / LOGOUT =====================

document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const loginErrorEl = document.getElementById('loginError');
  loginErrorEl.classList.add('hidden');

  const login = sanitizeInput(document.getElementById('loginInput').value);
  const senha = document.getElementById('senhaInput').value;

  if (!login || !senha) {
    loginErrorEl.textContent = 'Preencha usuário e senha.';
    loginErrorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await apiRequest('login', { login: login, senha: senha });
    saveSession(res.token, res.user);
    showDashboardScreen();
    await Promise.all([loadBaseReferencia(), loadSOFs()]);
  } catch (err) {
    loginErrorEl.textContent = err.message;
    loginErrorEl.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', function () {
  clearSession();
  showLoginScreen();
});

// ===================== DASHBOARD DE SOFs =====================

async function loadSOFs() {
  const res = await apiRequest('getSOFs', {});
  state.sofs = res.data || [];
  renderSOFGrid();
}

function renderSOFGrid() {
  const grid = document.getElementById('sofGrid');
  const emptyState = document.getElementById('sofEmptyState');
  grid.innerHTML = '';

  if (!state.sofs.length) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  state.sofs.forEach(function (sof) {
    grid.insertAdjacentHTML('beforeend', renderSOFCard(sof));
  });
}

function renderSOFCard(sof) {
  const pct = Math.max(0, Math.min(100, Number(sof.PROGRESSO_PCT) || 0));
  const statusColors = {
    'Em Elaboração': 'bg-slate-100 text-slate-600',
    'Em Análise': 'bg-yellow-100 text-yellow-700',
    'Aprovado': 'bg-green-100 text-green-700',
    'Concluído': 'bg-blue-100 text-blue-700'
  };
  const statusClass = statusColors[sof.STATUS] || 'bg-slate-100 text-slate-600';

  return (
    '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col gap-2">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<h3 class="font-semibold text-slate-800">' + escapeHtml(sof.UNIDADE || 'Unidade não informada') + '</h3>' +
        '<span class="text-xs px-2 py-0.5 rounded-full whitespace-nowrap ' + statusClass + '">' + escapeHtml(sof.STATUS || '-') + '</span>' +
      '</div>' +
      '<p class="text-sm text-slate-500 line-clamp-2">' + escapeHtml(sof.OBJETO || 'Sem objeto informado') + '</p>' +
      '<p class="text-xs text-slate-400">Nº SOF: ' + escapeHtml(sof.NUM_SOF || '-') + '</p>' +
      '<div>' +
        '<div class="flex justify-between text-xs text-slate-500 mb-1">' +
          '<span>Progresso</span><span>' + pct + '%</span>' +
        '</div>' +
        '<div class="w-full bg-slate-100 rounded-full h-2">' +
          '<div class="bg-blue-600 h-2 rounded-full" style="width: ' + pct + '%"></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

// ===================== BASE DE REFERÊNCIA / CASCATA =====================

async function loadBaseReferencia() {
  const res = await apiRequest('getBaseReferencia', {});
  state.baseReferencia = res.data || [];
  populateUnidadeOptions();
}

function populateUnidadeOptions() {
  const select = document.getElementById('unidadeInput');
  const vistos = new Set();
  const opcoes = state.baseReferencia.filter(function (r) {
    if (!r.UNIDADE || vistos.has(r.UNIDADE)) return false;
    vistos.add(r.UNIDADE);
    return true;
  });

  select.innerHTML = '<option value="">Selecione...</option>' + opcoes.map(function (r) {
    return '<option value="' + escapeHtml(r.UNIDADE) + '">' + escapeHtml(r.UNIDADE) + '</option>';
  }).join('');
}

document.getElementById('unidadeInput').addEventListener('change', function (e) {
  const unidade = e.target.value;
  const ref = state.baseReferencia.find(function (r) { return String(r.UNIDADE) === unidade; });

  Object.keys(CASCADE_FIELD_MAP).forEach(function (baseKey) {
    const fieldId = CASCADE_FIELD_MAP[baseKey];
    const el = document.getElementById(fieldId);
    if (el) el.value = ref ? (ref[baseKey] || '') : '';
  });
});

// ===================== MODAL NOVA SOF =====================

function openSofModal() {
  document.getElementById('sofForm').reset();
  document.getElementById('sofModal').classList.remove('hidden');
}

function closeSofModal() {
  document.getElementById('sofModal').classList.add('hidden');
}

document.getElementById('novaSofBtn').addEventListener('click', openSofModal);
document.getElementById('closeSofModalBtn').addEventListener('click', closeSofModal);
document.getElementById('cancelSofBtn').addEventListener('click', closeSofModal);

function collectSofFormData() {
  const data = {};
  Object.keys(FORM_FIELD_TO_COLUMN).forEach(function (fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const coluna = FORM_FIELD_TO_COLUMN[fieldId];
    data[coluna] = el.type === 'checkbox' ? el.checked : sanitizeInput(el.value);
  });
  return data;
}

document.getElementById('sofForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const data = collectSofFormData();
  if (!data.UNIDADE || !data.OBJETO) {
    showToast('Preencha ao menos Unidade e Objeto.', 'error');
    return;
  }

  try {
    await apiRequest('createSOF', { data: data });
    showToast('SOF criada com sucesso!', 'success');
    closeSofModal();
    await loadSOFs();
  } catch (err) {
    // erro já exibido via toast em apiRequest
  }
});

// ===================== ALTERAR SENHA (qualquer usuário logado) =====================

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.add('hidden');
}

document.getElementById('changePasswordBtn').addEventListener('click', function () {
  document.getElementById('changePasswordForm').reset();
  document.getElementById('changePasswordError').classList.add('hidden');
  document.getElementById('changePasswordModal').classList.remove('hidden');
});
document.getElementById('closeChangePasswordModalBtn').addEventListener('click', closeChangePasswordModal);
document.getElementById('cancelChangePasswordBtn').addEventListener('click', closeChangePasswordModal);

document.getElementById('changePasswordForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const errorEl = document.getElementById('changePasswordError');
  errorEl.classList.add('hidden');

  const senhaAtual = document.getElementById('senhaAtualInput').value;
  const novaSenha = document.getElementById('novaSenhaInput').value;
  const confirmar = document.getElementById('confirmarSenhaInput').value;

  if (novaSenha !== confirmar) {
    errorEl.textContent = 'A confirmação não corresponde à nova senha.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    await apiRequest('changePassword', { senhaAtual: senhaAtual, novaSenha: novaSenha });
    showToast('Senha alterada com sucesso!', 'success');
    closeChangePasswordModal();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ===================== NOVO USUÁRIO (restrito a Gerente) =====================

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

document.getElementById('novoUsuarioBtn').addEventListener('click', function () {
  document.getElementById('userForm').reset();
  document.getElementById('userFormError').classList.add('hidden');
  document.getElementById('userModal').classList.remove('hidden');
});
document.getElementById('closeUserModalBtn').addEventListener('click', closeUserModal);
document.getElementById('cancelUserBtn').addEventListener('click', closeUserModal);

document.getElementById('userForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const errorEl = document.getElementById('userFormError');
  errorEl.classList.add('hidden');

  const data = {
    Nome: sanitizeInput(document.getElementById('novoNomeInput').value),
    Login: sanitizeInput(document.getElementById('novoLoginInput').value),
    Senha: document.getElementById('novaSenhaUsuarioInput').value,
    Perfil: document.getElementById('novoPerfilInput').value
  };

  try {
    await apiRequest('createUser', { data: data });
    showToast('Usuário criado com sucesso!', 'success');
    closeUserModal();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ===================== INICIALIZAÇÃO / PROTEÇÃO DE ROTA =====================

(async function init() {
  if (loadSession()) {
    showDashboardScreen();
    try {
      await Promise.all([loadBaseReferencia(), loadSOFs()]);
    } catch (err) {
      // se a sessão expirou no servidor, apiRequest já trata (handleSessionExpired)
    }
  } else {
    showLoginScreen();
  }
})();
