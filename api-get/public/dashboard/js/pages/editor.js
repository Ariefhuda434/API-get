// ── State ──────────────────────────────────────────────────────────────
let textLayers = [];
let shapeLayers = [];
let selectedLayer = null; // { id, type: 'text'|'shape' }
let editorDuration = 0;
let editorSegments = [];
let editorSelectedSegment = 0;
let editorZoom = 1;
let editorIsPlaying = false;
let editorAnimFrame = null;
let layerIdCounter = 0;

// ── Init ───────────────────────────────────────────────────────────────
function initEditor() {
  textLayers = [];
  shapeLayers = [];
  selectedLayer = null;
  editorDuration = 0;
  editorSegments = [];
  layerIdCounter = 0;
  editorZoom = 1;
  const video = document.getElementById('editor-video');
  if (video) video.pause();
  setupEditorListeners();
  renderLayerList();
}

function setupEditorListeners() {
  const video = document.getElementById('editor-video');
  if (!video) return;
  video.onloadedmetadata = onVideoLoaded;
  video.ontimeupdate = onVideoTimeUpdate;
  video.onplay = () => { editorIsPlaying = true; startPlayheadAnim(); };
  video.onpause = () => { editorIsPlaying = false; stopPlayheadAnim(); };
  video.onseeked = updatePlayheadPosition;
  video.onerror = () => showToast('Video error: format tidak didukung');

  const track = document.getElementById('editor-timeline-track');
  if (track) track.onmousedown = onTimelineMouseDown;

  // Keyboard shortcuts
  document.onkeydown = (e) => {
    if (e.key === 's' || e.key === 'S') splitAtPlayhead();
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') deleteSelectedLayer();
    }
  };
}

// ── Tab Switching ──────────────────────────────────────────────────────
function switchEditorTab(tab) {
  document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.editor-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.editor-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`editor-tab-${tab}`).classList.add('active');
}

// ── Layer Management ───────────────────────────────────────────────────
function addTextLayer() {
  const id = ++layerIdCounter;
  textLayers.push({
    id, type: 'text',
    text: 'Your Text',
    font: 'Arial', size: 48, color: '#ffffff', opacity: 100,
    bgColor: '#000000', bgOpacity: 0, borderRadius: 4,
    style: 'normal', spacing: 0, x: 50, y: 50
  });
  selectLayer(id, 'text');
  renderLayerList();
  renderLayers();
  showTextControls();
}

function addShapeLayer(shapeType) {
  const id = ++layerIdCounter;
  shapeLayers.push({
    id, type: 'shape', shapeType,
    width: 15, height: 15, color: '#ffffff', opacity: 100,
    border: 0, borderColor: '#ffffff', rotation: 0, x: 50, y: 50
  });
  selectLayer(id, 'shape');
  renderLayerList();
  renderLayers();
  showShapeControls();
}

function selectLayer(id, type) {
  selectedLayer = { id, type };
  renderLayerList();
  document.querySelectorAll('.editor-layer-item').forEach(el => {
    if (parseInt(el.dataset.id) === id && el.dataset.type === type) el.classList.add('selected');
  });
  if (type === 'text') showTextControls();
  else showShapeControls();
}

function deleteSelectedLayer() {
  if (!selectedLayer) return;
  if (selectedLayer.type === 'text') {
    textLayers = textLayers.filter(l => l.id !== selectedLayer.id);
  } else {
    shapeLayers = shapeLayers.filter(l => l.id !== selectedLayer.id);
  }
  selectedLayer = null;
  document.getElementById('editor-text-controls').style.display = 'none';
  document.getElementById('editor-shape-controls').style.display = 'none';
  renderLayerList();
  renderLayers();
}

function findLayer(id, type) {
  if (type === 'text') return textLayers.find(l => l.id === id);
  return shapeLayers.find(l => l.id === id);
}

function getSelectedLayer() {
  if (!selectedLayer) return null;
  return findLayer(selectedLayer.id, selectedLayer.type);
}

// ── Layer List ─────────────────────────────────────────────────────────
function renderLayerList() {
  const container = document.getElementById('editor-layer-list');
  const shapeContainer = document.getElementById('editor-layer-list-shapes');
  if (!container) return;

  const all = [...textLayers.map(l => ({...l, _type: 'text'})), ...shapeLayers.map(l => ({...l, _type: 'shape'}))];
  const html = all.length === 0 ? '<div class="editor-layer-empty">Add text or shapes</div>' :
    all.map(l => {
      const isSelected = selectedLayer && selectedLayer.id === l.id && selectedLayer.type === l._type;
      const icon = l._type === 'text' ? 'T' : { rectangle:'▬',circle:'●',ellipse:'⬮',triangle:'▲',star:'★',diamond:'◆',arrow:'➤',line:'╌' }[l.shapeType] || '◻';
      const name = l._type === 'text' ? l.text : l.shapeType;
      return `<div class="editor-layer-item ${isSelected ? 'selected' : ''}" data-id="${l.id}" data-type="${l._type}" onclick="selectLayer(${l.id},'${l._type}')">
        <span class="editor-layer-icon">${icon}</span>
        <span class="editor-layer-name">${escHtml(name.substring(0,20))}</span>
        <button class="editor-layer-del" onclick="event.stopPropagation();deleteLayerById(${l.id},'${l._type}')">✕</button>
      </div>`;
    }).join('');
  container.innerHTML = html;
  if (shapeContainer) shapeContainer.innerHTML = html;
}

function deleteLayerById(id, type) {
  selectedLayer = null;
  if (type === 'text') textLayers = textLayers.filter(l => l.id !== id);
  else shapeLayers = shapeLayers.filter(l => l.id !== id);
  document.getElementById('editor-text-controls').style.display = 'none';
  document.getElementById('editor-shape-controls').style.display = 'none';
  renderLayerList();
  renderLayers();
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Text Controls ──────────────────────────────────────────────────────
function showTextControls() {
  const controls = document.getElementById('editor-text-controls');
  const shapeControls = document.getElementById('editor-shape-controls');
  if (shapeControls) shapeControls.style.display = 'none';
  controls.style.display = 'block';
  const l = getSelectedLayer();
  if (!l || l.type !== 'text') return;
  document.getElementById('editor-text-input').value = l.text;
  document.getElementById('editor-font').value = l.font;
  document.getElementById('editor-font-size').value = l.size;
  document.getElementById('editor-font-color').value = l.color;
  document.getElementById('editor-text-opacity').value = l.opacity;
  document.getElementById('editor-text-bgcolor').value = l.bgColor;
  document.getElementById('editor-text-bgopacity').value = l.bgOpacity;
  document.getElementById('editor-text-style').value = l.style;
  document.getElementById('editor-text-spacing').value = l.spacing;
  document.getElementById('editor-text-bgradius').value = l.borderRadius;
  document.getElementById('editor-layer-x').value = l.x;
  document.getElementById('editor-layer-y').value = l.y;
  document.getElementById('editor-layer-x-val').textContent = l.x + '%';
  document.getElementById('editor-layer-y-val').textContent = l.y + '%';
}

function updateSelected() {
  const l = getSelectedLayer();
  if (!l) return;
  if (l.type === 'text') {
    l.text = document.getElementById('editor-text-input').value;
    l.font = document.getElementById('editor-font').value;
    l.size = parseInt(document.getElementById('editor-font-size').value);
    l.color = document.getElementById('editor-font-color').value;
    l.opacity = parseInt(document.getElementById('editor-text-opacity').value);
    l.bgColor = document.getElementById('editor-text-bgcolor').value;
    l.bgOpacity = parseInt(document.getElementById('editor-text-bgopacity').value);
    l.style = document.getElementById('editor-text-style').value;
    l.spacing = parseInt(document.getElementById('editor-text-spacing').value);
    l.borderRadius = parseInt(document.getElementById('editor-text-bgradius').value);
    l.x = parseInt(document.getElementById('editor-layer-x').value);
    l.y = parseInt(document.getElementById('editor-layer-y').value);
    document.getElementById('editor-layer-x-val').textContent = l.x + '%';
    document.getElementById('editor-layer-y-val').textContent = l.y + '%';
  } else {
    l.width = parseInt(document.getElementById('editor-shape-width').value);
    l.height = parseInt(document.getElementById('editor-shape-height').value);
    l.color = document.getElementById('editor-shape-color').value;
    l.opacity = parseInt(document.getElementById('editor-shape-opacity').value);
    l.border = parseInt(document.getElementById('editor-shape-border').value);
    l.borderColor = document.getElementById('editor-shape-bordercolor').value;
    l.rotation = parseInt(document.getElementById('editor-shape-rotation').value);
    l.x = parseInt(document.getElementById('editor-layer-x-shape').value);
    l.y = parseInt(document.getElementById('editor-layer-y-shape').value);
    document.getElementById('editor-layer-x-val-shape').textContent = l.x + '%';
    document.getElementById('editor-layer-y-val-shape').textContent = l.y + '%';
  }
  renderLayerList();
  renderLayers();
}

function alignLayer(dir) {
  const l = getSelectedLayer();
  if (!l) return;
  if (dir === 'left') l.x = 0;
  else if (dir === 'center-h') l.x = 50;
  else if (dir === 'right') l.x = 100;
  else if (dir === 'top') l.y = 0;
  else if (dir === 'center-v') l.y = 50;
  else if (dir === 'bottom') l.y = 100;
  if (l.type === 'text') {
    document.getElementById('editor-layer-x').value = l.x;
    document.getElementById('editor-layer-y').value = l.y;
  } else {
    document.getElementById('editor-layer-x-shape').value = l.x;
    document.getElementById('editor-layer-y-shape').value = l.y;
  }
  updateSelected();
}

// ── Shape Controls ─────────────────────────────────────────────────────
function showShapeControls() {
  const controls = document.getElementById('editor-shape-controls');
  const textControls = document.getElementById('editor-text-controls');
  if (textControls) textControls.style.display = 'none';
  controls.style.display = 'block';
  const l = getSelectedLayer();
  if (!l || l.type !== 'shape') return;
  document.getElementById('editor-shape-width').value = l.width;
  document.getElementById('editor-shape-height').value = l.height;
  document.getElementById('editor-shape-color').value = l.color;
  document.getElementById('editor-shape-opacity').value = l.opacity;
  document.getElementById('editor-shape-border').value = l.border;
  document.getElementById('editor-shape-bordercolor').value = l.borderColor;
  document.getElementById('editor-shape-rotation').value = l.rotation;
  document.getElementById('editor-layer-x-shape').value = l.x;
  document.getElementById('editor-layer-y-shape').value = l.y;
  document.getElementById('editor-layer-x-val-shape').textContent = l.x + '%';
  document.getElementById('editor-layer-y-val-shape').textContent = l.y + '%';
}

// ── Render Layers ──────────────────────────────────────────────────────
function renderLayers() {
  const container = document.getElementById('editor-layers-container');
  if (!container) return;
  container.innerHTML = '';

  // Text layers
  textLayers.forEach(l => {
    const div = document.createElement('div');
    div.className = 'editor-layer-el' + (selectedLayer && selectedLayer.id === l.id && selectedLayer.type === 'text' ? ' selected' : '');
    div.dataset.layerId = l.id;
    div.dataset.layerType = 'text';
    const bg = l.bgOpacity > 0 ? l.bgColor + Math.round(l.bgOpacity / 100 * 255).toString(16).padStart(2, '0') : 'transparent';
    const letterSpacing = l.spacing > 0 ? `letter-spacing:${l.spacing}px;` : '';
    const styleCSS = l.style === 'bold' ? 'font-weight:bold;' :
      l.style === 'outline' ? `-webkit-text-stroke:1px ${l.color === '#ffffff' ? '#000' : '#fff'};color:${l.color};` :
      l.style === 'shadow' ? 'text-shadow:3px 3px 6px rgba(0,0,0,0.8);' :
      l.style === 'glow' ? `text-shadow:0 0 20px ${l.color},0 0 40px ${l.color};` : '';
    div.style.cssText = `
      position:absolute; left:${l.x}%; top:${l.y}%;
      transform:translate(-50%,-50%);
      font-family:${l.font}; font-size:${l.size}px; color:${l.color};
      opacity:${l.opacity / 100};
      background:${bg};
      padding:8px 16px; border-radius:${l.borderRadius}px;
      ${letterSpacing} ${styleCSS}
      max-width:80%; text-align:center; word-wrap:break-word;
      pointer-events:auto; cursor:grab;
    `;
    div.textContent = l.text;
    div.onmousedown = (e) => onLayerMouseDown(e, l.id, 'text');
    container.appendChild(div);
  });

  // Shape layers
  shapeLayers.forEach(l => {
    const div = document.createElement('div');
    div.className = 'editor-layer-el' + (selectedLayer && selectedLayer.id === l.id && selectedLayer.type === 'shape' ? ' selected' : '');
    div.dataset.layerId = l.id;
    div.dataset.layerType = 'shape';
    const border = l.border > 0 ? `border:${l.border}px solid ${l.borderColor};` : '';
    const rotation = l.rotation > 0 ? `transform:translate(-50%,-50%) rotate(${l.rotation}deg);` : 'transform:translate(-50%,-50%);';
    let shapeHtml = '';
    const w = l.width * 6;
    const h = l.height * 6;
    if (l.shapeType === 'rectangle') {
      shapeHtml = `<div style="width:${w}px;height:${h}px;background:${l.color};opacity:${l.opacity/100};border-radius:3px;${border}"></div>`;
    } else if (l.shapeType === 'circle') {
      const r = Math.min(w,h)/2;
      shapeHtml = `<div style="width:${r*2}px;height:${r*2}px;background:${l.color};opacity:${l.opacity/100};border-radius:50%;${border}"></div>`;
    } else if (l.shapeType === 'ellipse') {
      shapeHtml = `<div style="width:${w}px;height:${h*0.6}px;background:${l.color};opacity:${l.opacity/100};border-radius:50%;${border}"></div>`;
    } else if (l.shapeType === 'triangle') {
      shapeHtml = `<div style="width:0;height:0;border-left:${w/2}px solid transparent;border-right:${w/2}px solid transparent;border-bottom:${h}px solid ${l.color};opacity:${l.opacity/100};${border.replace('border:','')}"></div>`;
    } else if (l.shapeType === 'star') {
      shapeHtml = `<div style="font-size:${Math.max(w,h)}px;line-height:1;color:${l.color};opacity:${l.opacity/100};${border.replace(/border[^;]+;/g,'')}">★</div>`;
    } else if (l.shapeType === 'diamond') {
      shapeHtml = `<div style="width:${w}px;height:${h}px;background:${l.color};opacity:${l.opacity/100};transform:rotate(45deg);${border}"></div>`;
    } else if (l.shapeType === 'arrow') {
      shapeHtml = `<div style="font-size:${Math.max(w,h)}px;line-height:1;color:${l.color};opacity:${l.opacity/100}">➤</div>`;
    } else if (l.shapeType === 'line') {
      shapeHtml = `<div style="width:${w}px;height:3px;background:${l.color};opacity:${l.opacity/100};border-radius:2px;${border}"></div>`;
    }
    div.style.cssText = `
      position:absolute; left:${l.x}%; top:${l.y}%;
      ${rotation}
      pointer-events:auto; cursor:grab;
    `;
    div.innerHTML = shapeHtml;
    div.onmousedown = (e) => onLayerMouseDown(e, l.id, 'shape');
    container.appendChild(div);
  });
}

// ── Drag & Drop ────────────────────────────────────────────────────────
let dragLayer = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function onLayerMouseDown(e, id, type) {
  selectLayer(id, type);
  const rect = e.target.getBoundingClientRect();
  dragLayer = { id, type };
  dragOffsetX = (e.clientX - rect.left) / rect.width;
  dragOffsetY = (e.clientY - rect.top) / rect.height;
  document.onmousemove = onDragMove;
  document.onmouseup = onDragEnd;
  e.preventDefault();
}

function onDragMove(e) {
  if (!dragLayer) return;
  const container = document.getElementById('editor-preview-container');
  if (!container) return;
  const crect = container.getBoundingClientRect();
  const px = (e.clientX - crect.left) / crect.width * 100;
  const py = (e.clientY - crect.top) / crect.height * 100;
  const l = findLayer(dragLayer.id, dragLayer.type);
  if (!l) return;
  l.x = Math.max(0, Math.min(100, px));
  l.y = Math.max(0, Math.min(100, py));
  if (l.type === 'text') {
    document.getElementById('editor-layer-x').value = l.x;
    document.getElementById('editor-layer-y').value = l.y;
    document.getElementById('editor-layer-x-val').textContent = l.x + '%';
    document.getElementById('editor-layer-y-val').textContent = l.y + '%';
  } else {
    document.getElementById('editor-layer-x-shape').value = l.x;
    document.getElementById('editor-layer-y-shape').value = l.y;
    document.getElementById('editor-layer-x-val-shape').textContent = l.x + '%';
    document.getElementById('editor-layer-y-val-shape').textContent = l.y + '%';
  }
  renderLayers();
}

function onDragEnd() {
  dragLayer = null;
  document.onmousemove = null;
  document.onmouseup = null;
}

// ── Freeze Frame ───────────────────────────────────────────────────────
function updateFreeze() {
  // Just update the freeze frame preview (no preview needed, values read on export)
  renderLayers();
}

function getFreezeConfig() {
  const enabled = document.getElementById('editor-freeze-enable').checked;
  if (!enabled) return null;
  return {
    time: parseFloat(document.getElementById('editor-freeze-time').value) || 1,
    duration: parseInt(document.getElementById('editor-freeze-duration').value) || 3,
    title: document.getElementById('editor-freeze-title').value || '',
    subtitle: document.getElementById('editor-freeze-subtitle').value || '',
  };
}

// ── Video Loading ──────────────────────────────────────────────────────
function loadEditorVideo() {
  const url = document.getElementById('editor-video-url').value.trim();
  if (!url) { showToast('Masukkan URL video'); return; }
  const video = document.getElementById('editor-video');
  if (!video) return;
  showToast('Loading video...');
  video.src = url;
  video.load();
  if (window._videoLoadTimeout) clearTimeout(window._videoLoadTimeout);
  window._videoLoadTimeout = setTimeout(() => {
    if (video.readyState < 1) showToast('Video gagal load. Cek URL atau coba video lain.');
  }, 30000);
}

function loadEditorFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const video = document.getElementById('editor-video');
  if (!video) return;
  video.src = URL.createObjectURL(file);
  video.load();
}

function onVideoLoaded() {
  const video = document.getElementById('editor-video');
  if (!video) return;
  editorDuration = video.duration || 0;
  const durEl = document.getElementById('editor-time-duration');
  if (durEl) durEl.textContent = formatTime(editorDuration);
  const emptyEl = document.getElementById('editor-timeline-empty');
  if (emptyEl) emptyEl.style.display = 'none';
  initSegments();
  renderTimeline();
  drawTimelineCanvas();
}

function onVideoTimeUpdate() {
  const video = document.getElementById('editor-video');
  if (!video) return;
  const cur = document.getElementById('editor-time-current');
  if (cur) cur.textContent = formatTime(video.currentTime);
  updatePlayheadPosition();
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// ── Timeline ───────────────────────────────────────────────────────────
function initSegments() {
  if (!editorSegments.length) {
    editorSegments = [{ start: 0, end: editorDuration }];
  }
  editorSelectedSegment = 0;
}

function splitAtPlayhead() {
  const video = document.getElementById('editor-video');
  if (!video) return;
  const t = video.currentTime;
  const idx = editorSegments.findIndex(s => t >= s.start && t < s.end);
  if (idx < 0) return;
  const s = editorSegments[idx];
  if (Math.abs(t - s.start) < 0.5 || Math.abs(t - s.end) < 0.5) return;
  editorSegments.splice(idx, 1, { start: s.start, end: t }, { start: t, end: s.end });
  renderTimeline();
  drawTimelineCanvas();
}

function removeSelectedSegment() {
  if (editorSegments.length <= 1) return;
  editorSegments.splice(editorSelectedSegment, 1);
  if (editorSelectedSegment >= editorSegments.length) editorSelectedSegment = editorSegments.length - 1;
  renderTimeline();
  drawTimelineCanvas();
}

function getPixelsPerSecond() {
  const track = document.getElementById('editor-timeline-track');
  const w = track ? track.clientWidth - 40 : 800;
  return (w / editorDuration) * editorZoom;
}

function getTimelineWidth() {
  return editorDuration * getPixelsPerSecond();
}

function renderTimeline() {
  const track = document.getElementById('editor-timeline-track');
  if (!track) return;
  const pp = getPixelsPerSecond();
  // Remove old segments
  track.querySelectorAll('.editor-timeline-segment').forEach(el => el.remove());
  // Remove old trim handles
  track.querySelectorAll('.editor-trim-handle').forEach(el => el.remove());
  editorSegments.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'editor-timeline-segment' + (i === editorSelectedSegment ? ' selected' : '');
    div.style.cssText = `position:absolute;left:${s.start*pp+20}px;width:${(s.end-s.start)*pp}px;top:18px;height:44px;background:${i===editorSelectedSegment?'rgba(0,212,255,0.3)':'rgba(255,255,255,0.1)'};border-radius:4px;cursor:pointer;`;
    div.onclick = () => { editorSelectedSegment = i; renderTimeline(); drawTimelineCanvas(); };
    track.appendChild(div);
  });
}

function drawTimelineCanvas() {
  const canvas = document.getElementById('editor-timeline-canvas');
  if (!canvas) return;
  const track = document.getElementById('editor-timeline-track');
  const w = track ? track.clientWidth : 800;
  const h = 80;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const pp = getPixelsPerSecond();

  ctx.clearRect(0, 0, w, h);

  // Draw waveform-style bars
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = 0; x < w; x += 4) {
    const bar = 10 + Math.sin(x * 0.1) * 8 + Math.cos(x * 0.05) * 4;
    ctx.fillRect(x, 40 - bar / 2, 2, bar);
  }

  // Draw time ruler
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px monospace';
  const interval = Math.max(1, Math.floor(5 / editorZoom));
  for (let t = 0; t <= editorDuration; t += interval) {
    const x = t * pp + 20;
    ctx.fillText(formatTime(t), x, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, 18, 1, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
  }
}

let playheadAnimId = null;

function startPlayheadAnim() {
  stopPlayheadAnim();
  function tick() {
    updatePlayheadPosition();
    playheadAnimId = requestAnimationFrame(tick);
  }
  tick();
}

function stopPlayheadAnim() {
  if (playheadAnimId) { cancelAnimationFrame(playheadAnimId); playheadAnimId = null; }
}

function updatePlayheadPosition() {
  const video = document.getElementById('editor-video');
  const playhead = document.getElementById('editor-playhead');
  if (!video || !playhead) return;
  const pp = getPixelsPerSecond();
  playhead.style.left = (video.currentTime * pp + 18) + 'px';
  playhead.style.display = 'block';
}

function zoomTimeline(dir) {
  editorZoom = Math.max(0.25, Math.min(10, editorZoom + dir * 0.25));
  document.getElementById('editor-zoom-level').textContent = editorZoom.toFixed(2) + 'x';
  renderTimeline();
  drawTimelineCanvas();
  updatePlayheadPosition();
}

// ── Timeline Mouse ─────────────────────────────────────────────────────
let tlDragging = false;
function onTimelineMouseDown(e) {
  const track = document.getElementById('editor-timeline-track');
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const pp = getPixelsPerSecond();
  const t = Math.max(0, Math.min(editorDuration, (e.clientX - rect.left - 18) / pp));
  const video = document.getElementById('editor-video');
  if (video) video.currentTime = t;
  tlDragging = true;
  document.onmousemove = onTimelineMouseMove;
  document.onmouseup = onTimelineMouseUp;
}

function onTimelineMouseMove(e) {
  if (!tlDragging) return;
  const track = document.getElementById('editor-timeline-track');
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const pp = getPixelsPerSecond();
  const t = Math.max(0, Math.min(editorDuration, (e.clientX - rect.left - 18) / pp));
  const video = document.getElementById('editor-video');
  if (video) video.currentTime = t;
}

function onTimelineMouseUp() {
  tlDragging = false;
  document.onmousemove = null;
  document.onmouseup = null;
}

// ── Export ─────────────────────────────────────────────────────────────
async function exportEditedVideo() {
  const video = document.getElementById('editor-video');
  const url = document.getElementById('editor-video-url').value.trim();
  if (!video || !video.src) { showToast('Load video dulu'); return; }

  const progress = document.getElementById('editor-export-progress');
  const result = document.getElementById('editor-export-result');
  if (progress) progress.style.display = 'block';
  if (result) result.style.display = 'none';

  const payload = {
    videoUrl: url.startsWith('http') ? url : '',
    segments: editorSegments,
    textLayers: textLayers.map(l => ({
      text: l.text, font: l.font, size: l.size,
      color: l.color, opacity: l.opacity,
      bgColor: l.bgColor, bgOpacity: l.bgOpacity, borderRadius: l.borderRadius,
      x: l.x, y: l.y, style: l.style, spacing: l.spacing,
    })),
    shapeLayers: shapeLayers.map(l => ({
      type: l.shapeType, color: l.color, opacity: l.opacity,
      width: l.width, height: l.height,
      border: l.border, borderColor: l.borderColor, rotation: l.rotation,
      x: l.x, y: l.y,
    })),
    freezeFrame: getFreezeConfig(),
    aspectRatio: document.getElementById('editor-frame-preset').value,
    trimStart: editorSegments.length > 0 ? editorSegments[0].start : 0,
    trimEnd: editorSegments.length > 0 ? editorSegments[editorSegments.length - 1].end : editorDuration,
  };

  try {
    const res = await fetch('/api/video/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      result.innerHTML = `<a href="${data.outputPath}" target="_blank" class="btn btn-primary btn-sm">⬇ Download Video</a> <span style="font-size:12px;color:var(--text-dim);margin-left:8px;">${data.duration ? formatTime(data.duration) : ''}</span>`;
      result.style.display = 'flex';
      previewEditedVideo(data.outputPath);
    } else {
      result.innerHTML = `<span style="color:var(--danger);">Error: ${data.error}</span>`;
      result.style.display = 'flex';
    }
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger);">Error: ${e.message}</span>`;
    result.style.display = 'flex';
  }
}

function previewEditedVideo(path) {
  const video = document.getElementById('editor-video');
  if (!video) return;
  video.src = path;
  video.load();
  video.play().catch(() => {});
}

async function quickPreview() {
  const video = document.getElementById('editor-video');
  if (!video) return;
  // Truncate to first 5 seconds for quick preview
  const origEnd = editorDuration;
  editorDuration = Math.min(5, origEnd);
  initSegments();
  renderTimeline();
  drawTimelineCanvas();
  video.currentTime = 0;
  video.play().catch(() => {});
  showToast('Preview mode: first 5s');
}
