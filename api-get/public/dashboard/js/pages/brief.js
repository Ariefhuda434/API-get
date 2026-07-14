function initBrief() {
  // Nothing special needed
}

async function submitBrief() {
  const urls = document.getElementById('brief-urls').value.trim().split('\n').filter(Boolean);
  if (!urls.length) { showToast('Masukkan minimal 1 video URL'); return; }

  const data = {
    urls,
    title: document.getElementById('brief-title').value.trim() || 'Untitled',
    caption: document.getElementById('brief-caption').value.trim(),
    hashtags: document.getElementById('brief-hashtags').value.trim().split(',').map(s => s.trim()).filter(Boolean),
    keywords: document.getElementById('brief-keywords').value.trim(),
    products: document.getElementById('brief-products').value.trim().split('\n').filter(Boolean),
    aspectRatio: document.getElementById('brief-aspect').value,
    freezeFrame: document.getElementById('brief-freeze-enable').checked ? {
      time: parseFloat(document.getElementById('brief-freeze-time').value) || 1,
      duration: parseInt(document.getElementById('brief-freeze-duration').value) || 3,
    } : null,
    font: document.getElementById('brief-font').value,
    fontSize: parseInt(document.getElementById('brief-size').value) || 48,
    color: document.getElementById('brief-color').value,
    bgColor: document.getElementById('brief-bgcolor').value,
    bgOpacity: parseInt(document.getElementById('brief-bgopacity').value) || 60,
  };

  if (!data.caption) { showToast('Caption wajib diisi'); return; }

  const progress = document.getElementById('brief-progress');
  const progressText = document.getElementById('brief-progress-text');
  const progressBar = document.getElementById('brief-progress-bar');
  const result = document.getElementById('brief-result');
  const resultBody = document.getElementById('brief-result-body');

  progress.style.display = 'block';
  result.style.display = 'none';
  progressText.textContent = 'Downloading videos...';
  progressBar.style.width = '10%';

  try {
    const res = await fetch('/api/video/from-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    // Stream progress
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress') {
            progressText.textContent = msg.text || 'Processing...';
            if (msg.percent) progressBar.style.width = msg.percent + '%';
          } else if (msg.type === 'done') {
            progressBar.style.width = '100%';
            progressText.textContent = 'Done!';
            resultBody.innerHTML = `
              <p style="margin-bottom:12px;color:var(--text-dim);">${msg.message || 'Video ready!'}</p>
              <a href="${msg.url || msg.outputPath}" target="_blank" class="btn btn-primary btn-sm">⬇ Download Video</a>
              <button class="btn btn-outline btn-sm" onclick="openInEditor('${msg.url || msg.outputPath}')" style="margin-left:8px;">✏ Edit in Editor</button>
            `;
            result.style.display = 'block';
            progress.style.display = 'none';
          } else if (msg.type === 'error') {
            progressText.textContent = 'Error: ' + msg.message;
            showToast('Error: ' + msg.message);
          }
        } catch(e) {}
      }
    }
  } catch (e) {
    progressText.textContent = 'Error: ' + e.message;
    showToast('Error: ' + e.message);
  }
}

function openInEditor(path) {
  const input = document.getElementById('editor-video-url');
  const tab = document.querySelector('[data-page="editor"]');
  if (input) input.value = path;
  if (tab) navigateTo('editor');
}
