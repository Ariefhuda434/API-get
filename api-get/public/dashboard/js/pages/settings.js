function saveSettings() {
  const keyEl = document.getElementById('input-settings-api-key');
  const whEl = document.getElementById('input-webhook');
  const tgEl = document.getElementById('input-telegram-id');
  if (keyEl) localStorage.setItem('viralcut_api_key', keyEl.value);
  if (whEl) localStorage.setItem('viralcut_webhook', whEl.value);
  if (tgEl) localStorage.setItem('viralcut_telegram', tgEl.value);
  showToast('Settings saved!');
}

function loadSettings() {
  const keyEl = document.getElementById('input-settings-api-key');
  if (keyEl) keyEl.value = localStorage.getItem('viralcut_api_key') || '';
  const webhookEl = document.getElementById('input-webhook');
  if (webhookEl) webhookEl.value = localStorage.getItem('viralcut_webhook') || '';
  const tgEl = document.getElementById('input-telegram-id');
  if (tgEl) tgEl.value = localStorage.getItem('viralcut_telegram') || '';
  loadTikTokAccounts();
}

// ── TikTok Account Management ────────────────────────────────────────

async function loadTikTokAccounts() {
  const ttCount = document.getElementById('tt-count');
  if (!ttCount) return;
  ttCount.textContent = '...';
  try {
    const res = await fetch('/api/tiktok/accounts');
    const data = await res.json();
    const accounts = data.accounts || [];
    ttCount.textContent = accounts.length;
    const list = document.getElementById('tt-accounts-list');
    if (!accounts.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128249;</div><p>Belum ada akun TikTok. Tambah satu sekarang!</p></div>';
      return;
    }
    list.innerHTML = accounts.map(a => `
      <div class="user-card" style="margin-bottom: 8px;">
        <div class="user-avatar" style="background: linear-gradient(135deg, #ff0050, #00f2ea);">T</div>
        <div class="user-info">
          <div class="user-name">${a.label || a.username}</div>
          <div class="user-meta">@${a.username} | ${a.hasPassword ? '✓ password saved' : '⚠ no password'}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="editTikTokAccount('${a.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTikTokAccount('${a.id}')">Hapus</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('tt-count').textContent = '0';
    showToast('Gagal load TikTok accounts: ' + e.message);
  }
}

async function saveTikTokAccount() {
  const id = document.getElementById('tt-edit-id').value;
  const label = document.getElementById('tt-label').value.trim();
  const username = document.getElementById('tt-username').value.trim();
  const password = document.getElementById('tt-password').value.trim();

  if (!username || !password) {
    showToast('Username dan password wajib diisi');
    return;
  }

  try {
    const res = await fetch('/api/tiktok/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id || 'new', label, username, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Save failed');
    showToast('Akun TikTok berhasil disimpan!');
    cancelEditTikTok();
    loadTikTokAccounts();
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

function editTikTokAccount(id) {
  fetch('/api/tiktok/accounts')
    .then(r => r.json())
    .then(data => {
      const acc = data.accounts.find(a => a.id === id);
      if (!acc) return;
      document.getElementById('tt-edit-id').value = acc.id;
      document.getElementById('tt-label').value = acc.label || acc.username;
      document.getElementById('tt-username').value = acc.username;
      document.getElementById('tt-password').value = '';
      document.getElementById('tt-form-title').textContent = 'Edit Akun TikTok';
      document.getElementById('tt-cancel-btn').style.display = 'inline-flex';
      document.getElementById('tt-add-card').scrollIntoView({ behavior: 'smooth' });
    })
    .catch(e => showToast('Error: ' + e.message));
}

function cancelEditTikTok() {
  document.getElementById('tt-edit-id').value = '';
  document.getElementById('tt-label').value = '';
  document.getElementById('tt-username').value = '';
  document.getElementById('tt-password').value = '';
  document.getElementById('tt-form-title').textContent = 'Tambah Akun TikTok';
  document.getElementById('tt-cancel-btn').style.display = 'none';
}

async function deleteTikTokAccount(id) {
  if (!confirm('Hapus akun TikTok ini?')) return;
  try {
    await fetch('/api/tiktok/accounts/' + id, { method: 'DELETE' });
    showToast('Akun berhasil dihapus');
    loadTikTokAccounts();
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── TikTok Post from Results ─────────────────────────────────────────

async function postToTikTok(clipUrl, clipName, apiKey, folderId, projectId) {
  const accounts = await fetchTikTokAccounts();
  if (!accounts.length) {
    showToast('Belum ada akun TikTok. Tambah di Settings > TikTok Accounts');
    return;
  }

  let selectedAccount;
  if (accounts.length === 1) {
    selectedAccount = accounts[0];
  } else {
    selectedAccount = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.display = 'flex';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <h3>Pilih Akun TikTok</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p style="color: var(--text-dim); margin-bottom: 16px;">Pilih akun untuk posting video ini:</p>
            ${accounts.map(a => `
              <div class="user-card" style="cursor:pointer;margin-bottom:8px;" onclick="(function(){document.querySelector('.tt-modal-selected').value='${a.id}';document.querySelector('#tt-confirm-btn').click()})()">
                <div class="user-avatar" style="background: linear-gradient(135deg, #ff0050, #00f2ea);">T</div>
                <div class="user-info">
                  <div class="user-name">${a.label || a.username}</div>
                  <div class="user-meta">@${a.username}</div>
                </div>
              </div>
            `).join('')}
            <input type="hidden" class="tt-modal-selected" value="" />
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Batal</button>
            <button class="btn btn-primary" id="tt-confirm-btn" onclick="const v=this.closest('.modal').querySelector('.tt-modal-selected').value;if(v){this.closest('.modal-overlay').remove();resolve(v)}else{showToast('Pilih akun dulu')}">Posting</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    });
  }

  const caption = prompt('Caption untuk TikTok:', clipName || '') || clipName || '';
  showToast('Memposting ke TikTok...');

  try {
    const res = await fetch('/api/tiktok/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        folderId,
        apiKey,
        caption: caption,
        tiktokAccountId: selectedAccount.id,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Video berhasil diposting ke TikTok!');
    } else {
      showToast('❌ Gagal: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function fetchTikTokAccounts() {
  try {
    const res = await fetch('/api/tiktok/accounts');
    const data = await res.json();
    return data.accounts || [];
  } catch {
    return [];
  }
}
