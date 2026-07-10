function renderPresetGrid() {
  const grid = document.getElementById('preset-grid');
  grid.innerHTML = '';
  Object.entries(PRESETS).forEach(([name, data]) => {
    const card = document.createElement('div');
    card.className = `preset-card${name === selectedPreset ? ' selected' : ''}`;
    card.onclick = () => selectPreset(name);
    card.innerHTML = `
      <div class="preset-icon">${data.icon}</div>
      <div class="preset-name">${name}</div>
      <div class="preset-desc">${data.desc}</div>
    `;
    grid.appendChild(card);
  });
}

function selectPreset(name) {
  selectedPreset = name;
  const preset = PRESETS[name];

  document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.preset-card').forEach(c => {
    if (c.querySelector('.preset-name').textContent === name) c.classList.add('selected');
  });

  document.getElementById('input-min-dur').value = preset.min_duration;
  document.getElementById('min-dur-val').textContent = preset.min_duration + 's';
  document.getElementById('input-max-dur').value = preset.max_duration;
  document.getElementById('max-dur-val').textContent = preset.max_duration + 's';
  document.getElementById('input-target-dur').value = preset.target_duration;
  document.getElementById('target-dur-val').textContent = preset.target_duration + 's';

  setToggle('toggle-reframe', preset.reframe);
  setToggle('toggle-emoji', preset.emojis);
  setToggle('toggle-silence', preset.remove_silences);
  setToggle('toggle-intro', preset.intro_title);

  if (!preset.captions) {
    document.getElementById('input-caption-style').value = 'none';
  } else {
    document.getElementById('input-caption-style').value = 'bold';
  }

  document.getElementById('input-style-preset').value = preset.stylePresetId || '';

  renderPresetDetail(name, preset);
}

function renderPresetDetail(name, preset) {
  document.getElementById('preset-detail-title').textContent = `${name} Preset`;
  const body = document.getElementById('preset-detail-body');

  let html = '';
  if (preset.stylePresetId) {
    html += `<div style="background: rgba(0,255,136,0.08); padding: 10px 16px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 13px; border-left: 3px solid var(--primary);">
      <strong style="color: var(--primary);">Style Preset:</strong>
      <code style="color: var(--text); margin-left: 8px;">${preset.stylePresetId}</code>
      <span style="color: var(--text-muted); font-size: 12px; display: block; margin-top: 4px;">Caption style dari Klap editor</span>
    </div>`;
  }
  if (preset.context) {
    html += `<div style="background: var(--bg); padding: 12px 16px; border-radius: var(--radius-sm); margin-bottom: 16px; font-size: 13px; color: var(--text-dim); line-height: 1.6;">
      <strong style="color: var(--accent);">AI Context:</strong><br>${preset.context}
    </div>`;
  }

  html += '<div style="font-size: 13px;">';
  html += '<strong style="color: var(--primary);">Tips untuk hasil terbaik:</strong><ul style="margin-top: 8px; padding-left: 20px;">';
  preset.tips.forEach(tip => {
    html += `<li style="margin-bottom: 6px; color: var(--text-dim);">${tip}</li>`;
  });
  html += '</ul></div>';
  body.innerHTML = html;
}

async function submitJob() {
  let url = document.getElementById('input-url').value.trim();
  if (!url) { showToast('Paste YouTube URL dulu!'); return; }

  url = url.replace(/^https?:\/\/m\./, 'https://www.');
  const liveMatch = url.match(/youtube\.com\/live\/([\w-]+)/);
  if (liveMatch) url = `https://www.youtube.com/watch?v=${liveMatch[1]}`;

  const apiKey = getSelectedKey();
  if (!apiKey) {
    showToast('Pilih API key dulu! Buka Key Manager.');
    return;
  }

  const preset = PRESETS[selectedPreset];
  const stylePresetId = document.getElementById('input-style-preset').value.trim();
  const count = parseInt(document.getElementById('input-count').value);
  const captionStyle = document.getElementById('input-caption-style').value;

  const payload = {
    url,
    apiKey,
    count,
    briefing: document.getElementById('input-briefing').value,
    presetName: selectedPreset,
    preset: {
      min_duration: parseInt(document.getElementById('input-min-dur').value),
      max_duration: parseInt(document.getElementById('input-max-dur').value),
      target_duration: parseInt(document.getElementById('input-target-dur').value),
      captions: captionStyle !== 'none',
      reframe: getToggle('toggle-reframe'),
      emojis: getToggle('toggle-emoji'),
      remove_silences: getToggle('toggle-silence'),
      intro_title: getToggle('toggle-intro'),
      context_prefix: preset.context,
    },
    captionStyle,
    stylePresetId: stylePresetId || '',
  };

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create job');

        const jobId = data.jobId;
        await navigateTo('results');
        listenJob(jobId);
    setTimeout(() => {
      const usedKey = getSelectedKey();
      const idx = savedKeys.findIndex(k => k.key === usedKey);
      if (idx >= 0) checkCredit(idx);
      else checkAllCredit(true);
    }, 5000);
  } catch(e) {
    showToast('Error: ' + e.message);
  }
}

function listenJob(jobId) {
  if (activeJobStream) { activeJobStream.close(); }

  showProcessing(true);
  updateStep(1, 'Submitting...');

  const es = new EventSource(`/api/jobs/${jobId}/stream`);
  activeJobStream = es;

  es.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.event === 'init' || msg.event === 'status') {
      updateStep(1, msg.data.message || 'Starting...');
    } else if (msg.event === 'step') {
      updateStep(2, msg.data);
    } else if (msg.event === 'progress') {
      updateStep(1, msg.data);
    } else if (msg.event === 'export_created') {
      updateStep(2, msg.data);
    } else if (msg.event === 'export_done') {
      updateStep(2, msg.data);
    } else if (msg.event === 'done') {
      showProcessing(false);
      activeJobStream = null;
      es.close();
      displayResults(msg.data.results || [], msg.data);
      showToast('All clips ready!');
      setTimeout(() => { checkAllCredit(true); }, 3000);
    } else if (msg.event === 'error') {
      showProcessing(false);
      activeJobStream = null;
      es.close();
      showToast('Error: ' + msg.data);
      updateStep(1, 'Error: ' + msg.data, 'error');
      setTimeout(() => { checkAllCredit(true); }, 3000);
    }
  };

  es.onerror = () => {
    fetch(`/api/jobs/${jobId}`).then(r => r.json()).then(d => {
      if (d.job && d.job.status === 'completed') {
        showProcessing(false);
        es.close();
        displayResults(d.job.results || [], d.job);
      } else if (d.job && d.job.status === 'error') {
        showProcessing(false);
        es.close();
        showToast('Error: ' + d.job.error);
      }
    }).catch(() => {});
  };
}

function showResults(jobData) {
  displayResults(jobData.results || [], jobData);
}

function showProcessing(show) {
  document.getElementById('processing-area').style.display = show ? 'block' : 'none';
  document.getElementById('results-area').style.display = show ? 'none' : 'block';
}

function updateStep(step, label) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step-${i}`);
    el.classList.remove('done', 'active');
    if (i < step) el.classList.add('done');
    if (i === step) el.classList.add('active');
  }
  document.getElementById('step-label').textContent = `Step ${step}/5: ${label}`;
  document.getElementById('processing-status').textContent = label;
}
