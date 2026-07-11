function loadManagedUsers() {
  try {
    managedUsers = JSON.parse(localStorage.getItem('viralcut_users') || '[]');
  } catch(e) { managedUsers = []; }
}

function saveManagedUsers() {
  localStorage.setItem('viralcut_users', JSON.stringify(managedUsers));
}

function getSettingsApiKey() {
  const el = document.getElementById('input-settings-api-key');
  return el ? el.value.trim() : (localStorage.getItem('viralcut_api_key') || '');
}

async function createManagedUser() {
  const apiKey = getSettingsApiKey();
  if (!apiKey) { showToast('Set API Key dulu di Settings!'); return; }

  try {
    const res = await fetch('/api/klap/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    const user = await res.json();
    if (!user.id) throw new Error('Failed to create user: ' + JSON.stringify(user));

    managedUsers.push({
      id: user.id,
      email: user.email || 'ghost@managed.user',
      orgId: user.organizationId || '-',
      created: new Date().toISOString(),
      tokens: []
    });
    saveManagedUsers();
    renderUsers();
    showToast('User created: ' + user.id.slice(0, 8) + '...');
  } catch(e) {
    showToast('Error: ' + e.message);
  }
}

async function generateUserToken(userId) {
  const apiKey = getSettingsApiKey();
  if (!apiKey) { showToast('Set API Key dulu di Settings!'); return; }

  try {
    const res = await fetch(`/api/klap/users/${userId}/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    const data = await res.json();
    if (!data.external_access_token) throw new Error('No token returned');

    const user = managedUsers.find(u => u.id === userId);
    if (user) {
      user.tokens.push({
        token: data.external_access_token,
        created: new Date().toISOString(),
        label: 'Token ' + (user.tokens.length + 1)
      });
      saveManagedUsers();
      renderUsers();
      showToast('Token generated!');
    }
  } catch(e) {
    showToast('Error: ' + e.message);
  }
}

function deleteUser(userId) {
  if (!confirm('Hapus user ini?')) return;
  managedUsers = managedUsers.filter(u => u.id !== userId);
  saveManagedUsers();
  renderUsers();
}

function copyToken(token) {
  navigator.clipboard.writeText(token).then(() => showToast('Token copied!'));
}

function renderUsers() {
  const container = document.getElementById('users-list');
  loadManagedUsers();

  if (!managedUsers.length) {
    container.innerHTML = '<div class="empty-users"><div class="empty-icon">&#128101;</div><p>No managed users yet. Create one to get started.</p></div>';
    return;
  }

  container.innerHTML = managedUsers.map(user => {
    const shortId = user.id.slice(0, 12) + '...';
    const latestToken = user.tokens.length > 0 ? user.tokens[user.tokens.length - 1] : null;
    return `
      <div class="user-card">
        <div class="user-avatar">${user.email.charAt(0).toUpperCase()}</div>
        <div class="user-info">
          <div class="user-name">${user.email}</div>
          <div class="user-meta">ID: ${shortId} | Tokens: ${user.tokens.length}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm" onclick="generateUserToken('${user.id}')">+ Token</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.id}')">Delete</button>
        </div>
      </div>
      ${latestToken ? `
      <div style="margin: -8px 0 12px 60px; padding: 12px 16px; background: var(--bg); border-radius: var(--radius-sm); border: 1px solid var(--border);">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Latest Token:</div>
        <div class="token-box">${latestToken.token}</div>
        <div class="token-actions">
          <button class="btn btn-primary btn-sm" onclick="copyToken('${latestToken.token}')">Copy Token</button>
          <button class="btn btn-secondary btn-sm" onclick="openKlapEmbed('${latestToken.token}')">Open Editor</button>
        </div>
      </div>` : ''}
    `;
  }).join('');

  const select = document.getElementById('embed-user-select');
  if (select) {
    select.innerHTML = '<option value="">Select managed user...</option>' +
      managedUsers.map(u => `<option value="${u.id}">${u.email}</option>`).join('');
  }
}

function openKlapEmbed(token) {
  navigateTo('editor');
  setTimeout(() => {
    const embedGrid = document.getElementById('embed-grid');
    embedGrid.style.display = 'block';
    embedGrid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">&#128249;</div>
        <h3 style="margin-bottom: 8px;">Klap Editor Ready</h3>
        <p style="color: var(--text-dim); margin-bottom: 20px;">Paste a project ID to open the editor for a specific project:</p>
        <div style="display: flex; gap: 8px; max-width: 500px; margin: 0 auto;">
          <input type="text" class="form-input" id="embed-project-input" placeholder="tnX8jxsCNpvn" />
          <button class="btn btn-primary" onclick="loadEmbedProject()">Open</button>
        </div>
        <div id="embed-player-container" style="margin-top: 24px; max-width: 360px; margin-left: auto; margin-right: auto;"></div>
      </div>
    `;
  }, 100);
}

function loadEmbedProject() {
  const projectId = document.getElementById('embed-project-input').value.trim();
  const userSelect = document.getElementById('embed-user-select');
  const userId = userSelect.value;
  const user = managedUsers.find(u => u.id === userId);
  if (!user || !user.tokens.length) {
    showToast('Select a managed user with at least one token first');
    return;
  }
  const token = user.tokens[user.tokens.length - 1].token;
  const container = document.getElementById('embed-player-container');
  container.innerHTML = `
    <div class="embed-container">
      <iframe src="https://app.klap.app/embed/${projectId}#external_access_token=${token}" allow="clipboard-read; clipboard-write" loading="lazy"></iframe>
    </div>
    <p style="color: var(--text-muted); font-size: 12px; margin-top: 8px;">Editing project: ${projectId}</p>
  `;
  showToast('Embed player loaded!');
}

function openEditorForClip(projectId) {
  navigateTo('editor');
  setTimeout(() => {
    document.getElementById('embed-project-input').value = projectId;
    loadEmbedProject();
  }, 200);
}

function refreshPlayers() {
  loadManagedUsers();
  renderUsers();
  const embedGrid = document.getElementById('embed-grid');
  if (embedGrid) embedGrid.style.display = 'none';
  const embedEmpty = document.getElementById('embed-empty');
  if (embedEmpty) embedEmpty.style.display = 'block';
  showToast('Refreshed!');
}
