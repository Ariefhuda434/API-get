// ── Video Editor State ────────────────────────────────────────────────

let editorVideo = null;
let editorDuration = 0;
let editorZoom = 1;
let editorTrimStart = 0;
let editorTrimEnd = 1;
let editorPlayheadPos = 0;
let editorIsPlaying = false;
let editorIsDraggingPlayhead = false;
let editorIsDraggingTrimStart = false;
let editorIsDraggingTrimEnd = false;
let editorRAF = null;
let editorBgmTracks = [];
let editorTemplates = [];

const PX_PER_SECOND_BASE = 80;

function initEditor() {
  loadBgmTracks();
  loadTemplates();
  setupEditorListeners();
  initEditorFromUrl();
}

function loadBgmTracks() {
  fetch('/api/video/music')
    .then(r => r.json())
    .then(data => {
      editorBgmTracks = data.tracks || [];
      const sel = document.getElementById('editor-bgm-select');
      sel.innerHTML = '<option value="">No BGM</option>' +
        editorBgmTracks.map(t => `<option value="${t}">${t}</option>`).join('');
    })
    .catch(() => {});
}

function loadTemplates() {
  fetch('/api/video/templates')
    .then(r => r.json())
    .then(data => {
      editorTemplates = data.templates || [];
      const sel = document.getElementById('editor-template-select');
      sel.innerHTML = '<option value="">Default</option>' +
        editorTemplates.map(t => `<option value="${t}">${t}</option>`).join('');
    })
    .catch(() => {});
}

function setupEditorListeners() {
  const video = document.getElementById('editor-video');
  video.addEventListener('loadedmetadata', onVideoLoaded);
  video.addEventListener('timeupdate', onVideoTimeUpdate);
  video.addEventListener('play', () => { editorIsPlaying = true; startPlayheadAnimation(); });
  video.addEventListener('pause', () => { editorIsPlaying = false; stopPlayheadAnimation(); });
  video.addEventListener('seeked', updatePlayheadPosition);

  // Timeline track clicks
  const track = document.getElementById('editor-timeline-track');
  track.addEventListener('mousedown', onTimelineMouseDown);
  document.addEventListener('mousemove', onTimelineMouseMove);
  document.addEventListener('mouseup', onTimelineMouseUp);

  // Trim handles
  document.getElementById('editor-trim-start').addEventListener('mousedown', (e) => {
    e.stopPropagation();
    editorIsDraggingTrimStart = true;
  });
  document.getElementById('editor-trim-end').addEventListener('mousedown', (e) => {
    e.stopPropagation();
    editorIsDraggingTrimEnd = true;
  });
}

function initEditorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  if (url) {
    document.getElementById('editor-video-url').value = url;
    loadEditorVideo();
  }
}

function loadEditorVideo() {
  const url = document.getElementById('editor-video-url').value.trim();
  if (!url) { showToast('Masukkan URL video'); return; }
  const video = document.getElementById('editor-video');
  video.src = url;
  video.load();
}

function loadEditorFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById('editor-video-url').value = file.name;
  const video = document.getElementById('editor-video');
  video.src = url;
  video.load();
}

function onVideoLoaded() {
  const video = document.getElementById('editor-video');
  editorDuration = video.duration || 0;
  document.getElementById('editor-time-duration').textContent = formatTime(editorDuration);
  document.getElementById('editor-timeline-empty').style.display = 'none';

  editorTrimStart = 0;
  editorTrimEnd = editorDuration;
  updateTrimDisplay();
  updateTrimSliders();
  renderTimeline();
  drawTimelineCanvas();
}

function onVideoTimeUpdate() {
  const video = document.getElementById('editor-video');
  editorPlayheadPos = video.currentTime;
  document.getElementById('editor-time-current').textContent = formatTime(editorPlayheadPos);
  updatePlayheadPosition();
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Timeline Canvas ──────────────────────────────────────────────────

function getPixelsPerSecond() {
  return PX_PER_SECOND_BASE * editorZoom;
}

function getTimelineWidth() {
  return editorDuration * getPixelsPerSecond();
}

function renderTimeline() {
  const canvas = document.getElementById('editor-timeline-canvas');
  const track = document.getElementById('editor-timeline-track');
  const w = Math.max(getTimelineWidth(), track.clientWidth);
  const h = 80;
  canvas.width = w * (window.devicePixelRatio || 1);
  canvas.height = h * (window.devicePixelRatio || 1);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.getContext('2d').scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
}

function drawTimelineCanvas() {
  const canvas = document.getElementById('editor-timeline-canvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  const pps = getPixelsPerSecond();

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#1b2838';
  ctx.fillRect(0, 0, w, h);

  // Clip bar
  const startX = editorTrimStart * pps;
  const endX = editorTrimEnd * pps;
  const barY = 20;
  const barH = 40;

  // Full clip area
  ctx.fillStyle = '#2a3a4a';
  ctx.fillRect(0, barY, w, barH);

  // Trimmed area
  const grad = ctx.createLinearGradient(startX, barY, endX, barY);
  grad.addColorStop(0, '#0050ff');
  grad.addColorStop(1, '#00d4ff');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(startX, barY, endX - startX, barH, 4);
  ctx.fill();

  // Time ruler
  ctx.fillStyle = '#8899aa';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';

  const step = Math.max(1, Math.floor(30 / editorZoom / 5) * 5);
  for (let t = 0; t <= editorDuration; t += step) {
    const x = t * pps;
    ctx.fillRect(x, 0, 1, 8);
    ctx.fillText(formatTime(t), x, 16);
  }

  // Waveform placeholder
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) {
    const hWave = 4 + Math.random() * 20;
    ctx.fillRect(startX + (endX - startX) * i / 40, 40 + (20 - hWave / 2), Math.max(2, (endX - startX) / 40 - 1), hWave);
  }

  // Playhead
  const playheadX = editorPlayheadPos * pps;
  ctx.strokeStyle = '#ff3366';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, h);
  ctx.stroke();
}

function updatePlayheadPosition() {
  const track = document.getElementById('editor-timeline-track');
  const pps = getPixelsPerSecond();
  const x = editorPlayheadPos * pps;
  const playhead = document.getElementById('editor-playhead');
  playhead.style.left = x + 'px';
  drawTimelineCanvas();

  // Update trim highlights
  const trimStart = document.getElementById('editor-trim-handle-start');
  const trimEnd = document.getElementById('editor-trim-handle-end');
  trimStart.style.left = (editorTrimStart * pps) + 'px';
  trimEnd.style.left = (editorTrimEnd * pps) + 'px';
}

function startPlayheadAnimation() {
  stopPlayheadAnimation();
  editorRAF = requestAnimationFrame(animatePlayhead);
}

function stopPlayheadAnimation() {
  if (editorRAF) { cancelAnimationFrame(editorRAF); editorRAF = null; }
}

function animatePlayhead() {
  if (!editorIsPlaying) return;
  const video = document.getElementById('editor-video');
  editorPlayheadPos = video.currentTime;
  updatePlayheadPosition();
  editorRAF = requestAnimationFrame(animatePlayhead);
}

// ── Timeline Interactions ────────────────────────────────────────────

function onTimelineMouseDown(e) {
  const track = document.getElementById('editor-timeline-track');
  const rect = track.getBoundingClientRect();
  const x = e.clientX - rect.left + track.scrollLeft;
  const pps = getPixelsPerSecond();
  const time = x / pps;

  if (editorDuration === 0) return;

  editorPlayheadPos = Math.max(0, Math.min(time, editorDuration));
  document.getElementById('editor-video').currentTime = editorPlayheadPos;
  updatePlayheadPosition();
  editorIsDraggingPlayhead = true;
}

function onTimelineMouseMove(e) {
  const track = document.getElementById('editor-timeline-track');
  const rect = track.getBoundingClientRect();
  const pps = getPixelsPerSecond();
  const x = e.clientX - rect.left + track.scrollLeft;
  const time = Math.max(0, Math.min(x / pps, editorDuration));

  if (editorIsDraggingTrimStart) {
    editorTrimStart = Math.min(time, editorTrimEnd - 0.5);
    updateTrimSliders();
    updateTrimDisplay();
    updatePlayheadPosition();
    drawTimelineCanvas();
  } else if (editorIsDraggingTrimEnd) {
    editorTrimEnd = Math.max(time, editorTrimStart + 0.5);
    updateTrimSliders();
    updateTrimDisplay();
    updatePlayheadPosition();
    drawTimelineCanvas();
  } else if (editorIsDraggingPlayhead) {
    editorPlayheadPos = time;
    document.getElementById('editor-video').currentTime = editorPlayheadPos;
    document.getElementById('editor-time-current').textContent = formatTime(editorPlayheadPos);
    updatePlayheadPosition();
    drawTimelineCanvas();
  }
}

function onTimelineMouseUp(e) {
  editorIsDraggingPlayhead = false;
  editorIsDraggingTrimStart = false;
  editorIsDraggingTrimEnd = false;
}

function zoomTimeline(dir) {
  editorZoom = Math.max(0.25, Math.min(4, editorZoom * (dir > 0 ? 1.5 : 0.67)));
  document.getElementById('editor-zoom-level').textContent = editorZoom.toFixed(1) + 'x';
  renderTimeline();
  updatePlayheadPosition();
  drawTimelineCanvas();
}

function updateTrimSliders() {
  if (editorDuration === 0) return;
  document.getElementById('editor-trim-start').value = (editorTrimStart / editorDuration * 100);
  document.getElementById('editor-trim-end').value = (editorTrimEnd / editorDuration * 100);
}

function updateTrimDisplay() {
  if (editorDuration === 0) return;
  const startPct = parseFloat(document.getElementById('editor-trim-start').value) / 100;
  const endPct = parseFloat(document.getElementById('editor-trim-end').value) / 100;
  editorTrimStart = startPct * editorDuration;
  editorTrimEnd = endPct * editorDuration;

  document.getElementById('editor-trim-start-label').textContent = formatTime(editorTrimStart);
  document.getElementById('editor-trim-end-label').textContent = formatTime(editorTrimEnd);

  if (!editorIsDraggingTrimStart && !editorIsDraggingTrimEnd) {
    updatePlayheadPosition();
    drawTimelineCanvas();
  }
}

// ── Text Overlay Controls ────────────────────────────────────────────

function updateOverlayText() {
  document.getElementById('editor-overlay-text').textContent = document.getElementById('editor-text-input').value;
}

function updateOverlayStyle() {
  const text = document.getElementById('editor-overlay-text');
  const fontFamily = document.getElementById('editor-font-select').value;
  const fontSize = document.getElementById('editor-font-size').value;
  const color = document.getElementById('editor-font-color').value;
  const position = document.getElementById('editor-text-position').value;
  const style = document.getElementById('editor-text-style').value;

  text.style.fontFamily = fontFamily;
  text.style.fontSize = fontSize + 'px';
  text.style.color = color;

  const overlay = document.getElementById('editor-text-overlay');
  overlay.style.justifyContent = position === 'top' ? 'flex-start' : position === 'bottom' ? 'flex-end' : 'center';

  // Text style effects
  text.style.textShadow = 'none';
  text.style.webkitTextStroke = 'none';
  text.style.fontWeight = 'normal';

  if (style === 'bold') {
    text.style.fontWeight = 'bold';
  } else if (style === 'outline') {
    text.style.webkitTextStroke = `2px ${color === '#ffffff' ? '#000000' : '#ffffff'}`;
  } else if (style === 'shadow') {
    text.style.textShadow = '3px 3px 6px rgba(0,0,0,0.8)';
  } else if (style === 'glow') {
    text.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
  }
}

// ── Export ────────────────────────────────────────────────────────────

async function exportEditedVideo() {
  const videoUrl = document.getElementById('editor-video-url').value.trim();
  if (!videoUrl) { showToast('Load video dulu'); return; }

  const progress = document.getElementById('editor-export-progress');
  progress.style.display = 'block';
  const spinner = progress.querySelector('.te-spinner');
  const result = progress.querySelector('.editor-export-result');
  spinner.style.display = 'flex';
  result.style.display = 'none';

  const payload = {
    videoUrl,
    title: document.getElementById('editor-text-input').value || '',
    subtitle: '',
    introDuration: parseInt(document.getElementById('editor-intro-duration').value) || 3,
    template: document.getElementById('editor-template-select').value || '',
    bgm: document.getElementById('editor-bgm-select').value || '',
    bgmVolume: parseInt(document.getElementById('editor-bgm-volume').value) / 100,
    titleColor: document.getElementById('editor-font-color').value,
    titleSize: parseInt(document.getElementById('editor-font-size').value),
    position: document.getElementById('editor-text-position').value,
    style: document.getElementById('editor-text-style').value,
  };

  // Add trim params if changed
  if (editorTrimStart > 0 || editorTrimEnd < editorDuration) {
    payload.trimStart = editorTrimStart;
    payload.trimEnd = editorTrimEnd;
  }

  try {
    const res = await fetch('/api/video/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    spinner.style.display = 'none';
    result.style.display = 'block';

    if (data.success) {
      result.innerHTML = `
        <div style="color:var(--success);margin-bottom:8px;">✅ Video siap!</div>
        <a href="${data.outputPath}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none;">Download</a>
        <button class="btn btn-secondary btn-sm" onclick="previewEditedVideo('${data.outputPath}')">Preview</button>`;
    } else {
      result.innerHTML = `<div style="color:var(--danger);">❌ ${data.error || 'Gagal'}</div>`;
    }
  } catch (e) {
    spinner.style.display = 'none';
    result.style.display = 'block';
    result.innerHTML = `<div style="color:var(--danger);">❌ ${e.message}</div>`;
  }
}

function previewEditedVideo(path) {
  const video = document.getElementById('editor-video');
  video.src = path;
  video.load();
  video.play();
  document.getElementById('editor-video-url').value = window.location.origin + path;
}

// ── Canvas roundRect polyfill ─────────────────────────────────────────

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}