async function clearAllHistory() {
  if (!confirm('Hapus semua history job? Data tidak bisa dikembalikan.')) return;
  try {
    const jobs = historyJobs;
    for (const j of jobs) {
      await fetch('/api/jobs/' + j.id, { method: 'DELETE' });
    }
    showToast('History cleared');
    loadHistory();
  } catch(e) {
    showToast('Error: ' + e.message);
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/jobs');
    const data = await res.json();
    historyJobs = data.jobs || [];
    renderHistory();
  } catch(e) {
    historyJobs = [];
    renderHistory();
  }
}

function startHistoryAutoRefresh() {
  if (historyRefreshInterval) clearInterval(historyRefreshInterval);
  historyRefreshInterval = setInterval(loadHistory, 30000);
}

function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;
  if (!historyJobs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128203;</div><p>No jobs yet. Create one!</p></div>';
    return;
  }
  container.innerHTML = historyJobs.map(j => {
    const isError = j.status === 'error';
    const isDone = j.status === 'completed';
    const statusColor = isDone ? 'var(--accent)' : isError ? 'var(--danger)' : 'var(--warning)';
    const errorMsg = j.error ? j.error : '';
    const clipsInfo = j.stats ? `${j.stats.completedClips || 0}/${j.stats.totalClips || j.count || 0} clips` : `${j.count || 0} clips`;
    return `
      <div class="user-card ${isError ? 'error-card' : ''}" onclick="viewHistoryJob('${j.id}')" style="cursor:pointer; ${isError ? 'border-left: 3px solid var(--danger);' : ''}">
        <div class="user-avatar" style="background: ${statusColor};">${j.presetName?.charAt(0) || 'C'}</div>
        <div class="user-info">
          <div class="user-name">${j.url?.slice(0, 60) || 'Unknown'}</div>
          <div class="user-meta">
            ${j.presetName || '-'} | ${clipsInfo} | 
            Status: <span style="color:${statusColor};">${j.status}</span>
            ${j.stats?.avgVirality ? `| Virality: ${j.stats.avgVirality}%` : ''}
            ${errorMsg ? `<br><span style="color: var(--danger); font-size: 12px;">&#9888; ${errorMsg}</span>` : ''}
          </div>
        </div>
        <div style="font-size: 12px; color: var(--text-dim); text-align: right;">
          <div>${new Date(j.createdAt).toLocaleString('id-ID')}</div>
          ${j.endedAt ? `<div style="margin-top: 4px; font-size: 11px;">${new Date(j.endedAt).toLocaleString('id-ID')}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function viewHistoryJob(jobId) {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    const data = await res.json();
    if (data.job && data.job.results?.length) {
      await navigateTo('results');
      displayResults(data.job.results, data.job);
    } else if (data.job && data.job.status === 'completed') {
      showToast('Job completed but no results data');
    } else if (data.job && (data.job.status === 'processing' || data.job.status === 'pending')) {
      showToast('Job still processing');
    } else {
      showToast('Job failed or no results');
    }
  } catch(e) {
    showToast('Error loading job: ' + e.message);
  }
}
