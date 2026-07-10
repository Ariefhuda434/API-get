function displayResults(results, config) {
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
    const name = clip.name || clip._clip_name || 'Untitled';
    const expl = clip.viralityExplanation || clip.virality_explanation || '';
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
        <div class="virality-meter" style="margin-bottom: 10px;">
          <div class="virality-bar">
            <div class="virality-fill" style="width: ${score}%; background: ${color};"></div>
          </div>
          <div class="virality-score" style="color: ${color};">${score}%</div>
        </div>
        <div class="clip-explanation">${expl || 'No explanation'}</div>
        <div class="clip-actions">
          ${src ? `<a href="${src}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none;">Download</a>` : '<button class="btn btn-secondary btn-sm" disabled>Processing...</button>'}
          <button class="btn btn-secondary btn-sm" onclick="copyLink('${src}')">Copy Link</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
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
