let _lastJobConfig = null;

function displayResults(results, config) {
  _lastJobConfig = config;
  if (!results || !results.length) { showToast('No results'); return; }
  const sorted = [...results].sort((a, b) => (b.viralityScore || b.virality_score || 0) - (a.viralityScore || a.virality_score || 0));

  const avg = sorted.reduce((s, r) => s + (r.viralityScore || r.virality_score || 0), 0) / sorted.length;
  const best = Math.max(...sorted.map(r => r.viralityScore || r.virality_score || 0));
  document.getElementById('stat-total').textContent = sorted.length;
  document.getElementById('stat-avg').textContent = Math.round(avg * 100) + '%';
  document.getElementById('stat-best').textContent = Math.round(best * 100) + '%';
  document.getElementById('stat-preset').textContent = config?.preset || config?.presetName || '-';

  const grid = document.getElementById('clips-grid');
  grid.innerHTML = '';
  document.getElementById('results-empty').style.display = 'none';

  sorted.forEach((clip, i) => {
    const score = Math.round((clip.viralityScore || clip.virality_score || 0) * 100);
    const color = getViralityColor((clip.viralityScore || clip.virality_score || 0));
    const label = getViralityLabel((clip.viralityScore || clip.virality_score || 0));
    const src = clip.src_url || '';
    const editedSrc = clip.edited_src_url || '';
    const name = clip.name || clip._clip_name || 'Untitled';
    const expl = clip.viralityExplanation || clip.virality_explanation || '';
    const projectId = clip.clipId || clip.id || '';
    const folderId = config?.folderId || '';
    const apiKey = config?.apiKey || '';
    const aeError = clip.autoEditError || '';
    const card = document.createElement('div');
    card.className = 'clip-card';
    card.innerHTML = `
      <div class="clip-preview" style="background: linear-gradient(135deg, ${color}22, #0d1b2a);">
        <span>${getViralityEmoji((clip.viralityScore || clip.virality_score || 0))}</span>
        <div class="clip-rank">#${i + 1}</div>
        <div class="clip-virality-badge" style="background: ${color}33; color: ${color};">${score}% ${label}</div>
      </div>
      <div class="clip-body">
        <div class="clip-title">${name}</div>
        ${editedSrc ? '<div style="font-size:11px;color:var(--accent);margin-bottom:4px;">&#10003; Auto-edited</div>' : ''}
        ${aeError ? `<div style="font-size:11px;color:var(--danger);margin-bottom:4px;">&#9888; Auto-edit: ${aeError}</div>` : ''}
        <div class="virality-meter" style="margin-bottom: 10px;">
          <div class="virality-bar">
            <div class="virality-fill" style="width: ${score}%; background: ${color};"></div>
          </div>
          <div class="virality-score" style="color: ${color};">${score}%</div>
        </div>
        <div class="clip-explanation">${expl || 'No explanation'}</div>
        <div class="clip-actions">
          ${src ? `<a href="${src}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none;">Download</a>` : '<button class="btn btn-secondary btn-sm" disabled>Processing...</button>'}
          ${editedSrc ? `<a href="${editedSrc}" target="_blank" class="btn btn-accent btn-sm" style="text-decoration:none;">Edited</a>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="copyLink('${editedSrc || src}')">Copy Link</button>
          ${src ? `<button class="btn btn-outline btn-sm" onclick="openTitleEditor('${src.replace(/'/g, "\\'")}', '${name.replace(/'/g, "\\'")}')">Title</button>` : ''}
          ${src && folderId ? `<button class="btn btn-sm" style="background:linear-gradient(135deg,#ff0050,#00f2ea);color:#fff;border:none;" onclick="postClipToTikTok('${(editedSrc || src).replace(/'/g, "\\'")}', '${name.replace(/'/g, "\\'")}', '${apiKey}', '${folderId}', '${projectId}')">TikTok</button>` : ''}
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

async function postClipToTikTok(clipUrl, clipName, apiKey, folderId, projectId) {
  const accounts = await fetchTikTokAccounts();
  if (!accounts.length) {
    showToast('Belum ada akun TikTok. Tambah di Settings > TikTok Accounts');
    return;
  }

  const container = document.createElement('div');
  container.className = 'modal-overlay';
  container.style.display = 'flex';
  container.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Posting ke TikTok</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Pilih Akun</label>
          <select class="form-select tt-account-select">
            ${accounts.map(a => `<option value="${a.id}">${a.label || a.username} (@${a.username})</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Caption</label>
          <textarea class="form-textarea tt-caption-input" placeholder="Tulis caption..." rows="3">${clipName || ''}</textarea>
          <div class="form-hint">#fyp #izinpost #clipper akan ditambahkan otomatis</div>
        </div>
        <div class="tt-post-result" style="display:none;margin-top:16px;padding:12px;border-radius:8px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Batal</button>
        <button class="btn btn-primary tt-post-btn" onclick="doTikTokPost(this)">
          &#128249; Posting ke TikTok
        </button>
      </div>
      <div class="te-spinner tt-post-spinner" style="display:none;">
        <div class="spinner" style="width:24px;height:24px;margin:0;"></div>
        <span>Posting ke TikTok...</span>
      </div>
    </div>`;
  document.body.appendChild(container);

  window._ttPostContext = { clipUrl, clipName, apiKey, folderId, projectId, container };
}

async function doTikTokPost(btn) {
  const modal = btn.closest('.modal');
  const accountId = modal.querySelector('.tt-account-select').value;
  const caption = modal.querySelector('.tt-caption-input').value.trim();
  const ctx = window._ttPostContext;
  if (!ctx) return;

  btn.style.display = 'none';
  modal.querySelector('.tt-post-spinner').style.display = 'flex';
  const resultEl = modal.querySelector('.tt-post-result');
  resultEl.style.display = 'none';

  try {
    const res = await fetch('/api/tiktok/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: ctx.projectId,
        folderId: ctx.folderId,
        apiKey: ctx.apiKey,
        caption,
        tiktokAccountId: accountId,
      }),
    });
    const data = await res.json();
    resultEl.style.display = 'block';
    if (data.success) {
      resultEl.className = 'tt-post-result';
      resultEl.style.background = 'rgba(0,229,160,0.1)';
      resultEl.style.color = 'var(--success)';
      resultEl.style.border = '1px solid var(--success)';
      resultEl.textContent = '✅ Video berhasil diposting ke TikTok!';
    } else {
      resultEl.className = 'tt-post-result';
      resultEl.style.background = 'rgba(255,68,102,0.1)';
      resultEl.style.color = 'var(--danger)';
      resultEl.style.border = '1px solid var(--danger)';
      resultEl.textContent = '❌ Gagal: ' + (data.error || 'Unknown error');
    }
  } catch (e) {
    const resultEl = modal.querySelector('.tt-post-result');
    resultEl.style.display = 'block';
    resultEl.className = 'tt-post-result';
    resultEl.style.background = 'rgba(255,68,102,0.1)';
    resultEl.style.color = 'var(--danger)';
    resultEl.style.border = '1px solid var(--danger)';
    resultEl.textContent = '❌ Error: ' + e.message;
  } finally {
    modal.querySelector('.tt-post-spinner').style.display = 'none';
  }
}

// ── Title Editor (Stage 2) ──────────────────────────────────────────

let editingClipUrl = '';

function openTitleEditor(clipUrl, clipName) {
  editingClipUrl = clipUrl;
  document.getElementById('te-clip-url').value = clipUrl;
  document.getElementById('te-title').value = clipName || '';
  document.getElementById('te-subtitle').value = '';
  document.getElementById('te-template').value = 'default';
  document.getElementById('te-position').value = 'center';
  document.getElementById('te-title-color').value = '#ffffff';
  document.getElementById('te-bg-color').value = '#000000';
  document.getElementById('te-duration').value = '3';
  document.getElementById('te-dur-val').textContent = '3s';
  document.getElementById('te-result').style.display = 'none';
  document.getElementById('te-spinner').style.display = 'none';
  document.getElementById('te-generate-btn').style.display = 'inline-flex';
  document.getElementById('title-editor-modal').style.display = 'flex';
  onTitleTemplateChange();
}

function closeTitleEditor() {
  document.getElementById('title-editor-modal').style.display = 'none';
}

function onTitleTemplateChange() {
  const tpl = document.getElementById('te-template').value;
  const colorMap = {
    default: { title: '#ffffff', bg: '#000000' },
    podcast: { title: '#ffffff', bg: '#1a1a2e' },
    podcast_quote: { title: '#000000', bg: '#ffffff' },
    gaming: { title: '#ffdd00', bg: '#1a0a2e' },
    tutorial: { title: '#00d4ff', bg: '#0a1628' },
    minimal: { title: '#ffffff', bg: '#111111' },
  };
  const colors = colorMap[tpl] || colorMap.default;
  document.getElementById('te-title-color').value = colors.title;
  document.getElementById('te-bg-color').value = colors.bg;
  if (tpl === 'podcast_quote') {
    document.getElementById('te-position').value = 'center';
  }
}

async function generateTitle() {
  const title = document.getElementById('te-title').value.trim();
  if (!title) { showToast('Title text required'); return; }

  const btn = document.getElementById('te-generate-btn');
  btn.style.display = 'none';
  const spinner = document.getElementById('te-spinner');
  spinner.style.display = 'flex';
  document.getElementById('te-result').style.display = 'none';

  try {
    const res = await fetch('/api/video/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: editingClipUrl,
        title,
        subtitle: document.getElementById('te-subtitle').value.trim(),
        template: document.getElementById('te-template').value,
        position: document.getElementById('te-position').value,
        titleColor: document.getElementById('te-title-color').value,
        background: document.getElementById('te-bg-color').value,
        introDuration: parseFloat(document.getElementById('te-duration').value),
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Edit failed');

    const resultDiv = document.getElementById('te-result');
    resultDiv.style.display = 'flex';
    document.getElementById('te-result-msg').textContent = 'Title added! ';
    document.getElementById('te-result-link').href = data.outputPath;
    showToast('Title generated!');
  } catch(e) {
    showToast('Error: ' + e.message);
    const resultDiv = document.getElementById('te-result');
    resultDiv.style.display = 'flex';
    document.getElementById('te-result-msg').textContent = 'Failed: ' + e.message;
    document.getElementById('te-result-link').style.display = 'none';
  } finally {
    spinner.style.display = 'none';
  }
}

function getViralityColor(score) {
  if (score >= 0.8) return '#ff4444';
  if (score >= 0.6) return '#ff6b35';
  if (score >= 0.4) return '#ffa500';
  if (score >= 0.2) return '#00e5a0';
  return '#8888a0';
}

function getViralityLabel(score) {
  if (score >= 0.8) return 'SUPER VIRAL';
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.4) return 'GOOD';
  if (score >= 0.2) return 'MODERATE';
  return 'LOW';
}

function getViralityEmoji(score) {
  if (score >= 0.8) return '&#128293;&#128293;&#128293;';
  if (score >= 0.6) return '&#128293;&#128293;';
  if (score >= 0.4) return '&#128293;';
  if (score >= 0.2) return '&#10024;';
  return '&#128206;';
}
