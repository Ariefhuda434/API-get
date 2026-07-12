function loadKeys() {
  try {
    savedKeys = JSON.parse(localStorage.getItem('viralcut_keys') || '[]');
  } catch(e) { savedKeys = []; }
}

// Sync key status (used/type) from server to localStorage
async function syncKeysFromServer() {
  try {
    const res = await fetch('/api/keys');
    const data = await res.json();
    if (data.keys) {
      for (const sk of data.keys) {
        const idx = savedKeys.findIndex(k => k.key === sk.key);
        if (idx >= 0) {
          savedKeys[idx].type = sk.type;
          savedKeys[idx].used = sk.used;
          savedKeys[idx].realCredit = sk.credit !== undefined ? sk.credit : savedKeys[idx].realCredit;
        }
      }
      saveKeys();
    }
  } catch(e) {}
}

function saveKeys() {
  localStorage.setItem('viralcut_keys', JSON.stringify(savedKeys));
  updateKeySelector();
}

function updateKeySelector() {
  const select = document.getElementById('input-api-key-select');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Pilih API key...</option>' +
    savedKeys.map((k, i) => {
      const label = k.email ? k.email.slice(0, 20) + '...' : k.key.slice(0, 16) + '...';
      const credit = k.realCredit !== undefined ? k.realCredit : ((k.creditTotal || 5) - (k.creditUsed || 0));
      const creditInfo = k.realCredit !== undefined ? ` ($${Math.max(0, credit).toFixed(2)} left)` : '';
      return `<option value="${i}">${label}${creditInfo}</option>`;
    }).join('') +
    '<option value="__manual__">Manual input...</option>';
  if (current && document.querySelector(`#input-api-key-select option[value="${current}"]`)) {
    select.value = current;
  }
}

function onKeySelectChange() {
  const select = document.getElementById('input-api-key-select');
  const manualGroup = document.getElementById('input-api-key-manual');
  manualGroup.style.display = select.value === '__manual__' ? 'block' : 'none';
}

function getSelectedKey() {
  const select = document.getElementById('input-api-key-select');
  if (select.value === '__manual__') {
    return document.getElementById('input-api-key').value.trim();
  }
  if (select.value !== '') {
    const idx = parseInt(select.value);
    return savedKeys[idx]?.key || '';
  }
  return '';
}

async function generateKey() {
  if (keyGenInProgress) { showToast('Already generating!'); return; }
  keyGenInProgress = true;

  const btn = document.getElementById('btn-gen-key');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  const card = document.getElementById('key-gen-card');
  card.style.display = 'block';
  card.style.marginBottom = '24px';
  document.getElementById('key-gen-start-msg').style.display = 'none';
  document.getElementById('key-gen-progress-area').style.display = 'block';
  const log = document.getElementById('key-gen-log');
  const resultDiv = document.getElementById('key-gen-result');
  resultDiv.style.display = 'none';
  log.innerHTML = '';

  function addLog(msg, type = 'info') {
    log.innerHTML += `<div class="${type}">${msg}</div>`;
    log.scrollTop = log.scrollHeight;
  }

  try {
    const es = new EventSource(`/api/get-key`);

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.step === 'done') {
        const result = JSON.parse(data.message);
        es.close();
        addLog(`✅ API Key: ${result.key}`, 'done');
        addLog(`📧 Email: ${result.email}`, 'done');

        savedKeys.push({
          email: result.email,
          key: result.key,
          creditTotal: 5,
          creditUsed: 0,
          createdAt: new Date().toISOString(),
          lastUsed: null
        });
        saveKeys();
        // Also save to server DB
        fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: result.email, key: result.key, credit: 5 })
        }).catch(() => {});

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
          <div class="key-label">API Key</div>
          <div class="key-value">${result.key}</div>
          <div class="key-email">📧 ${result.email} | 💰 $5 credit ready</div>
        `;
    addLog('✅ Key saved!', 'done');
    renderKeyManager();
    showToast('Key generated & saved!');
    keyGenInProgress = false;
        btn.disabled = false;
        btn.textContent = '⚡ Generate New Key';
      } else if (data.step === 'error') {
        es.close();
        addLog(`❌ Error: ${data.message}`, 'error');
        keyGenInProgress = false;
        btn.disabled = false;
        btn.textContent = '⚡ Generate New Key';
      } else {
        addLog(`${data.step}: ${data.message}`, 'step');
      }
    };

    es.onerror = () => {
      addLog('⚠️ Connection lost. Check if api-get is running on port 3003.', 'error');
      es.close();
      keyGenInProgress = false;
      btn.disabled = false;
      btn.textContent = '⚡ Generate New Key';
    };

  } catch(e) {
    addLog(`❌ Error: ${e.message}`, 'error');
    keyGenInProgress = false;
    btn.disabled = false;
    btn.textContent = '⚡ Generate New Key';
  }
}

function showCreateOneTimeKey() {
  const keyVal = prompt('Masukkan Klap API key untuk one-time use:');
  if (!keyVal || !keyVal.trim()) return;
  const label = prompt('Label / email (opsional):') || 'One-Time Key';
  savedKeys.push({
    id: 'key_' + Date.now(),
    email: label,
    key: keyVal.trim(),
    type: 'onetime',
    used: false,
    createdAt: new Date().toISOString(),
  });
  saveKeys();
  fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: label, key: keyVal.trim(), type: 'onetime' }),
  }).catch(() => {});
  renderKeyManager();
  showToast('✅ One-time key saved');
}

function deleteKey(idx) {
  if (!confirm('Hapus key ini?')) return;
  savedKeys.splice(idx, 1);
  saveKeys();
  renderKeyManager();
}

function copyKeyValue(key) {
  navigator.clipboard.writeText(key).then(() => showToast('Key copied!'));
}

function renderKeyManager() {
  loadKeys();
  syncKeysFromServer();
  ensureCreditChecked();
  document.getElementById('key-count').textContent = savedKeys.length;

  const list = document.getElementById('keys-list');
  if (!savedKeys.length) {
    document.getElementById('total-credit-badge').textContent = '$0 credit';
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128273;</div><p>Belum ada API key. Generate satu sekarang!</p></div>';
    return;
  }

  let totalRemaining = 0;
  let totalKnown = 0;
  list.innerHTML = savedKeys.map((k, i) => {
    const isOneTime = k.type === 'onetime' || k.oneTime;
    const isUsed = isOneTime && (k.used === true);

    let typeBadge = '';
    let metaLine = '';

    if (isOneTime) {
      typeBadge = isUsed
        ? '<span style="font-size:11px;background:rgba(255,68,102,0.2);color:var(--danger);padding:2px 8px;border-radius:4px;margin-left:8px;">USED</span>'
        : '<span style="font-size:11px;background:rgba(0,229,160,0.2);color:var(--success);padding:2px 8px;border-radius:4px;margin-left:8px;">ONE-TIME</span>';
      metaLine = `Key: ${k.key.slice(0, 20)}...${k.key.slice(-6)} | One-Time: ${isUsed ? 'Used' : 'Available'}`;
    } else {
      const remaining = (k.realCredit !== undefined ? k.realCredit : (k.creditTotal || 5) - (k.creditUsed || 0));
      const creditDisplay = k.realCredit !== undefined
        ? `<span style="color: ${remaining > 0 ? 'var(--accent)' : 'var(--danger)'};">${remaining > 0 ? '$' + remaining.toFixed(2) : 'OUT'}</span>`
        : `<span style="color: var(--text-muted);">$? <button class="btn btn-sm" onclick="event.stopPropagation();checkCredit(${i})" style="background:none;border:1px solid var(--border);color:var(--text-dim);cursor:pointer;padding:2px 6px;border-radius:4px;font-size:11px;">check</button></span>`;
      metaLine = `Key: ${k.key.slice(0, 20)}...${k.key.slice(-6)} | Credit: ${creditDisplay}`;

      if (k.realCredit !== undefined) {
        totalRemaining += Math.max(0, remaining);
        totalKnown++;
      }
    }

    const emailShort = k.email ? k.email.slice(0, 30) + (k.email.length > 30 ? '...' : '') : '-';

    return `
      <div class="user-card" style="margin-bottom: 8px;${isUsed ? 'opacity:0.5;' : ''}">
        <div class="user-avatar" style="background: ${isOneTime ? 'linear-gradient(135deg, #ff6b35, #f7c948)' : 'linear-gradient(135deg, #6c3bfc, #00e5a0)'};">${isOneTime ? '1' : 'K'}</div>
        <div class="user-info">
          <div class="user-name">${emailShort}${typeBadge}</div>
          <div class="user-meta">${metaLine}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          ${!isOneTime ? `<button class="btn btn-secondary btn-sm" onclick="checkCredit(${i})" title="Check real credit from Klap">&#128200;</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="copyKeyValue('${k.key}')">Copy</button>
          <button class="btn btn-danger btn-sm" onclick="deleteKey(${i})">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  const badge = document.getElementById('total-credit-badge');
  if (totalKnown > 0) {
    badge.textContent = `$${totalRemaining.toFixed(2)} credit (${totalKnown}/${savedKeys.length} keys known)`;
    badge.style.background = totalRemaining > 0 ? 'var(--accent-glow)' : 'rgba(255,68,102,0.15)';
    badge.style.color = totalRemaining > 0 ? 'var(--accent)' : 'var(--danger)';
  } else {
    badge.textContent = `$? credit (click Check Credits)`;
    badge.style.background = 'var(--accent-glow)';
    badge.style.color = 'var(--accent)';
  }
}

async function ensureKeySynced(k) {
  if (k._synced) return true;
  try {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: k.email || '', key: k.key, credit: k.creditTotal || 5 })
    });
    const d = await res.json();
    if (d.key) k._serverId = d.key.id;
    k._synced = true;
    saveKeys();
    return true;
  } catch(e) { return false; }
}

async function checkCredit(idx) {
  const k = savedKeys[idx];
  if (!k) return;
  const btn = document.querySelector(`.btn-secondary.btn-sm[onclick="checkCredit(${idx})"]`);
  if (btn) btn.textContent = '...';
  try {
    if (k.email) {
      const realRes = await fetch('/api/keys/check-credit-real?email=' + encodeURIComponent(k.email));
      const realData = await realRes.json();
      if (realData.ok && realData.credit !== null) {
        savedKeys[idx].realCredit = realData.credit;
        saveKeys();
        showToast('✅ $' + Math.max(0, realData.credit).toFixed(2) + ' credit dari Klap');
        renderKeyManager();
        return;
      }
      if (realData.error) showToast('⚠️ Login gagal: ' + realData.error);
    }
    await ensureKeySynced(k);
    const keyParam = `${encodeURIComponent(k.email || '')}:${encodeURIComponent(k.key)}`;
    const res = await fetch('/api/keys/check-credit?keys=' + encodeURIComponent(keyParam));
    const data = await res.json();
    if (data.keys && data.keys.length) {
      savedKeys[idx].realCredit = data.keys[0].credit;
      saveKeys();
      showToast('✅ $' + Math.max(0, data.keys[0].credit).toFixed(2) + ' credit (server)');
    } else {
      const est = Math.max(0, (k.creditTotal || 5) - (k.creditUsed || 0));
      savedKeys[idx].realCredit = est;
      saveKeys();
      showToast('✅ $' + est.toFixed(2) + ' credit (estimasi)');
    }
    renderKeyManager();
  } catch(e) {
    showToast('❌ Error: ' + e.message);
    if (btn) btn.textContent = '🔍';
  }
}

async function checkAllCredit(silent = true) {
  if (!silent) showToast('Cek semua credit...');
  try {
    let successCount = 0;
    let failCount = 0;
    let dbCount = 0;
    for (const k of savedKeys) {
      if (k.type === 'onetime' || k.oneTime) continue;
      if (!k.email) continue;
      try {
        const realRes = await fetch('/api/keys/check-credit-real?email=' + encodeURIComponent(k.email));
        const realData = await realRes.json();
        if (realData.ok && realData.credit !== null) {
          const idx = savedKeys.findIndex(sk => sk.key === k.key);
          if (idx >= 0) savedKeys[idx].realCredit = realData.credit;
          successCount++;
        } else {
          failCount++;
        }
      } catch(e) { failCount++; }
    }
    for (const k of savedKeys) {
      if (k.realCredit !== undefined || k._synced) continue;
      await ensureKeySynced(k);
    }
    const keyParam = savedKeys.filter(k => k.key && k.realCredit === undefined).map(k => `${encodeURIComponent(k.email || '')}:${encodeURIComponent(k.key)}`).join(',');
    if (keyParam) {
      const res = await fetch('/api/keys/check-credit?keys=' + encodeURIComponent(keyParam));
      const data = await res.json();
      if (data.keys) {
        data.keys.forEach(ck => {
          const idx = savedKeys.findIndex(sk => sk.key === ck.key);
          if (idx >= 0) savedKeys[idx].realCredit = ck.credit;
        });
      }
    }
    savedKeys.forEach((k, i) => {
      if (k.realCredit === undefined) {
        k.realCredit = Math.max(0, (k.creditTotal || 5) - (k.creditUsed || 0));
        dbCount++;
      }
    });
    saveKeys();
    if (!silent) {
      let msg = '✅ ' + successCount + ' dari Klap';
      if (failCount > 0) msg += ', ⚠️ ' + failCount + ' gagal';
      if (dbCount > 0) msg += ', 📁 ' + dbCount + ' server';
      showToast(msg);
    } else if (successCount > 0 && failCount === 0) {
      // silent auto-check success, no toast
    } else if (failCount > 0 && successCount === 0) {
      showToast('⚠️ Semua login gagal, pake data server');
    }
    renderKeyManager();
    updateKeySelector();
  } catch(e) {
    if (!silent) showToast('❌ Error: ' + e.message);
  }
}

function ensureCreditChecked() {
  if (savedKeys.length > 0 && !window._creditChecking) {
    window._creditChecking = true;
    checkAllCredit(true).finally(() => { window._creditChecking = false; });
  }
}
