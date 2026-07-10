function renderPresetsDetailPage() {
  const container = document.getElementById('presets-detail-list');
  container.innerHTML = Object.entries(PRESETS).map(([name, data]) => `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header">
        <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">${data.icon}</span> ${name}
        </div>
        <button class="btn btn-secondary btn-sm" onclick="selectPreset('${name}'); navigateTo('create');">Use Preset</button>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <div class="form-label" style="margin-bottom: 8px;">AI Context</div>
          <div style="background: var(--bg); padding: 12px; border-radius: var(--radius-sm); font-size: 13px; color: var(--text-dim); line-height: 1.6;">
            ${data.context || '<em>No preset context (manual mode)</em>'}
          </div>
        </div>
        <div>
          <div class="form-label" style="margin-bottom: 8px;">Settings</div>
          <div style="font-size: 13px; color: var(--text-dim);">
            Duration: ${data.min_duration}s - ${data.max_duration}s (target: ${data.target_duration}s)<br>
            Captions: ${data.captions ? 'Yes' : 'No'} | Reframe: ${data.reframe ? 'Yes' : 'No'}<br>
            Emoji: ${data.emojis ? 'Yes' : 'No'} | Remove silence: ${data.remove_silences ? 'Yes' : 'No'}<br>
            Intro title: ${data.intro_title ? 'Yes' : 'No'}
          </div>
          <div class="form-label" style="margin-top: 12px; margin-bottom: 8px;">Tips</div>
          <ul style="font-size: 13px; color: var(--text-dim); padding-left: 20px;">
            ${data.tips.map(t => `<li style="margin-bottom: 4px;">${t}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `).join('');
}
