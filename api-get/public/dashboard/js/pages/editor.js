// ── Video Editor State ────────────────────────────────────────────────

let editorVideo = null;
let editorDuration = 0;
let editorZoom = 1;
let editorPlayheadPos = 0;
let editorIsPlaying = false;
let editorIsDraggingPlayhead = false;
let editorRAF = null;
let editorBgmTracks = [];
let editorTemplates = [];
let editorIntros = [];
let editorWaveformData = null;
let editorWaveformLoading = false;
let editorCurrentTab = 'text';

// ── Layer State ───────────────────────────────────────────────────────
let textLayers = [];
let imageLayers = [];
let shapeLayers = [];
let selectedLayerId = null;
let layerIdCounter = 1;
let isDraggingLayer = false;
let dragOffset = { x: 0, y: 0 };

// ── Segment State ─────────────────────────────────────────────────────
let segments = [];
let selectedSegmentIdx = -1;

// ── Effects State ─────────────────────────────────────────────────────
let editorEffects = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

// ── Transition State ──────────────────────────────────────────────────
let editorTransition = { type: 'none', duration: 0.3 };

// ── Frame Preset & Freeze Frame ──────────────────────────────────────
let editorFramePreset = 'none';
let editorFreezeFrame = { enabled: false, time: 1, duration: 3, title: '', subtitle: '' };

const PX_PER_SECOND_BASE = 80;
const PADDING = 60;

function initEditor() {
  // Reset state
  selectedLayerId = null;
  isDraggingLayer = false;

  const video = document.getElementById('editor-video');
  if (video) {
    // Stop any playing video before re-init
    video.pause();
  }

  loadBgmTracks();
  loadTemplates();
  loadIntros();
  setupEditorListeners();
  setupTimelineMouse();
  initEditorFromUrl();
  setupKeyboardShortcuts();
  initLayerDrag();
}

// ── Initialization helpers ────────────────────────────────────────────

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

function loadIntros() {
  fetch('/api/video/intros')
    .then(r => r.json())
    .then(data => {
      editorIntros = data.intros || [];
      const sel = document.getElementById('editor-intro-select');
      if (sel) {
        sel.innerHTML = '<option value="">No Intro Video</option>' +
          editorIntros.map(t => `<option value="${t}">${t.replace(/\.\w+$/, '').replace('intro_', '')}</option>`).join('');
      }
    })
    .catch(() => {});
}

// ── Layer drag — handles drag-drop on the preview ────────────────────

function initLayerDrag() {
  const container = document.getElementById('editor-layers-container');
  if (!container) return;
  container.onmousedown = onLayerMouseDown;
}

function onLayerMouseDown(e) {
  const layerEl = e.target.closest('.editor-layer-el');
  if (!layerEl) return;
  const id = parseInt(layerEl.dataset.layerId);
  selectLayerById(id);
  const type = layerEl.dataset.layerType;
  const rect = layerEl.getBoundingClientRect();
  const containerRect = document.getElementById('editor-layers-container').getBoundingClientRect();
  isDraggingLayer = true;
  dragOffset = {
    x: e.clientX - (rect.left + rect.width / 2),
    y: e.clientY - (rect.top + rect.height / 2),
  };
  layerEl.style.cursor = 'grabbing';
}

function onLayerMouseMove(e) {
  if (!isDraggingLayer || !selectedLayerId) return;
  const container = document.getElementById('editor-layers-container');
  const rect = container.getBoundingClientRect();
  const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100));
  const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100));

  const layer = findLayer(selectedLayerId);
  if (!layer) return;

  layer.x = Math.round(xPct * 10) / 10;
  layer.y = Math.round(yPct * 10) / 10;

  if (layer.type === 'text') {
    document.getElementById('editor-text-x').value = layer.x;
    document.getElementById('editor-text-y').value = layer.y;
    document.getElementById('editor-text-x-val').textContent = layer.x + '%';
    document.getElementById('editor-text-y-val').textContent = layer.y + '%';
  } else if (layer.type === 'image') {
    document.getElementById('editor-image-x').value = layer.x;
    document.getElementById('editor-image-y').value = layer.y;
  } else if (layer.type === 'shape') {
    document.getElementById('editor-shape-x').value = layer.x;
    document.getElementById('editor-shape-y').value = layer.y;
    const xv = document.getElementById('editor-shape-x-val');
    const yv = document.getElementById('editor-shape-y-val');
    if (xv) xv.textContent = layer.x + '%';
    if (yv) yv.textContent = layer.y + '%';
  }
  renderLayers();
}

function onLayerMouseUp() {
  isDraggingLayer = false;
  const el = document.querySelector('.editor-layer-el[data-layer-id="' + selectedLayerId + '"]');
  if (el) el.style.cursor = 'grab';
}

// ── Layer Helpers ─────────────────────────────────────────────────────

function findLayer(id) {
  if (!id) return null;
  let l = textLayers.find(t => t.id === id);
  if (l) return l;
  l = imageLayers.find(i => i.id === id);
  if (l) return l;
  return shapeLayers.find(s => s.id === id);
}

function selectLayerById(id) {
  selectedLayerId = id;
  const layer = findLayer(id);
  if (!layer) return;
  if (layer.type === 'text') {
    switchEditorTab('text');
    showTextControls(layer);
  } else if (layer.type === 'image') {
    switchEditorTab('image');
    showImageControls(layer);
  } else if (layer.type === 'shape') {
    switchEditorTab('shapes');
    showShapeControls(layer);
  }
  refreshLayerList();
  renderLayers();
}

// ── Tab Switching ─────────────────────────────────────────────────────

function switchEditorTab(tab) {
  editorCurrentTab = tab;
  document.querySelectorAll('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.editor-tab-content').forEach(c => c.classList.toggle('active', c.id === 'editor-tab-' + tab));
}

// ── Text Layer Functions ──────────────────────────────────────────────

function addTextLayer() {
  const layer = {
    id: layerIdCounter++,
    type: 'text',
    text: 'Double click to edit',
    font: 'Arial',
    size: 48,
    color: '#ffffff',
    opacity: 100,
    bgColor: '#000000',
    bgOpacity: 0,
    style: 'normal',
    spacing: 0,
    borderRadius: 4,
    x: 50,
    y: 50,
  };
  textLayers.push(layer);
  selectLayerById(layer.id);
  showTextControls(layer);
  refreshLayerList();
  renderLayers();
}

function showTextControls(layer) {
  const panel = document.getElementById('editor-text-controls');
  panel.style.display = 'block';
  document.getElementById('editor-text-input').value = layer.text;
  document.getElementById('editor-font-select').value = layer.font;
  document.getElementById('editor-font-size').value = layer.size;
  document.getElementById('editor-font-color').value = layer.color;
  document.getElementById('editor-text-opacity').value = layer.opacity;
  document.getElementById('editor-text-bgcolor').value = layer.bgColor;
  document.getElementById('editor-text-bgopacity').value = layer.bgOpacity;
  document.getElementById('editor-text-style').value = layer.style;
  document.getElementById('editor-text-spacing').value = layer.spacing;
  document.getElementById('editor-text-borderradius').value = layer.borderRadius || 0;
  document.getElementById('editor-text-x').value = layer.x;
  document.getElementById('editor-text-y').value = layer.y;
  document.getElementById('editor-text-x-val').textContent = layer.x + '%';
  document.getElementById('editor-text-y-val').textContent = layer.y + '%';
}

function updateSelectedText() {
  const layer = findLayer(selectedLayerId);
  if (!layer || layer.type !== 'text') return;
  layer.text = document.getElementById('editor-text-input').value;
  layer.font = document.getElementById('editor-font-select').value;
  layer.size = parseInt(document.getElementById('editor-font-size').value);
  layer.color = document.getElementById('editor-font-color').value;
  layer.opacity = parseInt(document.getElementById('editor-text-opacity').value);
  layer.bgColor = document.getElementById('editor-text-bgcolor').value;
  layer.bgOpacity = parseInt(document.getElementById('editor-text-bgopacity').value);
  layer.style = document.getElementById('editor-text-style').value;
  layer.spacing = parseInt(document.getElementById('editor-text-spacing').value);
  layer.borderRadius = parseInt(document.getElementById('editor-text-borderradius').value);
  layer.x = parseFloat(document.getElementById('editor-text-x').value);
  layer.y = parseFloat(document.getElementById('editor-text-y').value);
  document.getElementById('editor-text-x-val').textContent = layer.x + '%';
  document.getElementById('editor-text-y-val').textContent = layer.y + '%';
  refreshLayerList();
  renderLayers();
}

// ── Image Layer Functions ────────────────────────────────────────────

function addImageLayer(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    addImageLayerBySrc(e.target.result);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function addImageLayerBySrc(src) {
  const layer = {
    id: layerIdCounter++,
    type: 'image',
    src: src,
    x: 50,
    y: 50,
    size: 100,
    opacity: 100,
  };
  imageLayers.push(layer);
  selectLayerById(layer.id);
  showImageControls(layer);
  refreshLayerList();
  renderLayers();
}

function loadServerImages() {
  fetch('/api/images')
    .then(r => r.json())
    .then(data => {
      const container = document.getElementById('editor-server-image-list');
      if (!container) return;
      const images = data.images || [];
      if (!images.length) {
        container.innerHTML = '<div class="editor-layer-empty">No images in server folder</div>';
        return;
      }
      container.innerHTML = images.map(name => `
        <div class="editor-server-image" onclick="addImageLayerBySrc('/ss/${name}')" title="${name}">
          <img src="/ss/${name}" loading="lazy" onerror="this.parentElement.style.display='none'">
          <span>${name}</span>
        </div>
      `).join('');
    })
    .catch(() => {});
}

function showImageControls(layer) {
  const panel = document.getElementById('editor-image-controls');
  panel.style.display = 'block';
  document.getElementById('editor-image-opacity').value = layer.opacity;
  document.getElementById('editor-image-size').value = layer.size;
  document.getElementById('editor-image-x').value = layer.x;
  document.getElementById('editor-image-y').value = layer.y;
}

function updateSelectedImage() {
  const layer = findLayer(selectedLayerId);
  if (!layer || layer.type !== 'image') return;
  layer.opacity = parseInt(document.getElementById('editor-image-opacity').value);
  layer.size = parseInt(document.getElementById('editor-image-size').value);
  layer.x = parseFloat(document.getElementById('editor-image-x').value);
  layer.y = parseFloat(document.getElementById('editor-image-y').value);
  refreshLayerList();
  renderLayers();
}

// ── Shape Layer Functions ────────────────────────────────────────────

const SHAPE_TYPES = [
  { id: 'rectangle', label: 'Rectangle', icon: '▬' },
  { id: 'circle', label: 'Circle', icon: '●' },
  { id: 'ellipse', label: 'Ellipse', icon: '⬮' },
  { id: 'triangle', label: 'Triangle', icon: '▲' },
  { id: 'star', label: 'Star', icon: '★' },
  { id: 'diamond', label: 'Diamond', icon: '◆' },
  { id: 'arrow', label: 'Arrow', icon: '➤' },
  { id: 'line', label: 'Line', icon: '╌' },
];

function addShapeLayer(type) {
  const layer = {
    id: layerIdCounter++,
    type: 'shape',
    shapeType: type,
    x: 50,
    y: 50,
    width: 20,
    height: 20,
    color: '#ffffff',
    opacity: 100,
    borderWidth: 0,
    borderColor: '#ffffff',
    rotation: 0,
  };
  shapeLayers.push(layer);
  selectLayerById(layer.id);
  showShapeControls(layer);
  refreshLayerList();
  renderLayers();
}

function showShapeControls(layer) {
  const panel = document.getElementById('editor-shape-controls');
  panel.style.display = 'block';
  document.getElementById('editor-shape-type-label').textContent = layer.label || layer.shapeType;
  document.getElementById('editor-shape-width').value = layer.width;
  document.getElementById('editor-shape-height').value = layer.height;
  document.getElementById('editor-shape-color').value = layer.color;
  document.getElementById('editor-shape-opacity').value = layer.opacity;
  document.getElementById('editor-shape-border').value = layer.borderWidth;
  document.getElementById('editor-shape-bordercolor').value = layer.borderColor;
  document.getElementById('editor-shape-rotation').value = layer.rotation;
  document.getElementById('editor-shape-x').value = layer.x;
  document.getElementById('editor-shape-y').value = layer.y;
  const xv = document.getElementById('editor-shape-x-val');
  const yv = document.getElementById('editor-shape-y-val');
  if (xv) xv.textContent = layer.x + '%';
  if (yv) yv.textContent = layer.y + '%';
}

function updateSelectedShape() {
  const layer = findLayer(selectedLayerId);
  if (!layer || layer.type !== 'shape') return;
  layer.width = parseInt(document.getElementById('editor-shape-width').value);
  layer.height = parseInt(document.getElementById('editor-shape-height').value);
  layer.color = document.getElementById('editor-shape-color').value;
  layer.opacity = parseInt(document.getElementById('editor-shape-opacity').value);
  layer.borderWidth = parseInt(document.getElementById('editor-shape-border').value);
  layer.borderColor = document.getElementById('editor-shape-bordercolor').value;
  layer.rotation = parseInt(document.getElementById('editor-shape-rotation').value);
  layer.x = parseFloat(document.getElementById('editor-shape-x').value);
  layer.y = parseFloat(document.getElementById('editor-shape-y').value);
  const xv = document.getElementById('editor-shape-x-val');
  const yv = document.getElementById('editor-shape-y-val');
  if (xv) xv.textContent = layer.x + '%';
  if (yv) yv.textContent = layer.y + '%';
  refreshLayerList();
  renderLayers();
}

// ── Align Layer ───────────────────────────────────────────────────────

function alignLayer(dir) {
  const layer = findLayer(selectedLayerId);
  if (!layer) return;
  switch (dir) {
    case 'left': layer.x = 0; break;
    case 'center-h': layer.x = 50; break;
    case 'right': layer.x = 100; break;
    case 'top': layer.y = 0; break;
    case 'center-v': layer.y = 50; break;
    case 'bottom': layer.y = 100; break;
  }
  renderLayers();
  // Refresh controls for the current tab
  if (layer.type === 'text') showTextControls(layer);
  else if (layer.type === 'image') showImageControls(layer);
  else if (layer.type === 'shape') showShapeControls(layer);
}

// ── Delete Layer ──────────────────────────────────────────────────────

function deleteSelectedLayer() {
  if (!selectedLayerId) return;
  textLayers = textLayers.filter(l => l.id !== selectedLayerId);
  imageLayers = imageLayers.filter(l => l.id !== selectedLayerId);
  shapeLayers = shapeLayers.filter(l => l.id !== selectedLayerId);
  selectedLayerId = null;
  document.getElementById('editor-text-controls').style.display = 'none';
  document.getElementById('editor-image-controls').style.display = 'none';
  document.getElementById('editor-shape-controls').style.display = 'none';
  refreshLayerList();
  renderLayers();
}

// ── Layer List Rendering ─────────────────────────────────────────────

function refreshLayerList() {
  // Text layers list
  const textList = document.getElementById('editor-text-layer-list');
  if (textLayers.length === 0) {
    textList.innerHTML = '<div class="editor-layer-empty">No text layers. Click "+ Add Text"</div>';
  } else {
    textList.innerHTML = textLayers.map(l => `
      <div class="editor-layer-item${l.id === selectedLayerId ? ' selected' : ''}" onclick="selectLayerById(${l.id})">
        <span class="editor-layer-icon">T</span>
        <span class="editor-layer-name">${l.text.slice(0, 20) || 'Text'}</span>
        <button class="editor-layer-del" onclick="event.stopPropagation();selectedLayerId=${l.id};deleteSelectedLayer()">×</button>
      </div>
    `).join('');
  }

  // Image layers list
  const imgList = document.getElementById('editor-image-layer-list');
  if (imageLayers.length === 0) {
    imgList.innerHTML = '<div class="editor-layer-empty">No images. Click "+ Add Image"</div>';
  } else {
    imgList.innerHTML = imageLayers.map(l => `
      <div class="editor-layer-item${l.id === selectedLayerId ? ' selected' : ''}" onclick="selectLayerById(${l.id})">
        <span class="editor-layer-icon">🖼</span>
        <span class="editor-layer-name">Image ${l.id}</span>
        <button class="editor-layer-del" onclick="event.stopPropagation();selectedLayerId=${l.id};deleteSelectedLayer()">×</button>
      </div>
    `).join('');
  }

  // Shape layers list
  const shapeList = document.getElementById('editor-shape-layer-list');
  if (shapeLayers.length === 0) {
    shapeList.innerHTML = '<div class="editor-layer-empty">No shapes. Pick one below</div>';
  } else {
    shapeList.innerHTML = shapeLayers.map(l => {
      const st = SHAPE_TYPES.find(s => s.id === l.shapeType);
      return `
      <div class="editor-layer-item${l.id === selectedLayerId ? ' selected' : ''}" onclick="selectLayerById(${l.id})">
        <span class="editor-layer-icon">${st ? st.icon : '◻'}</span>
        <span class="editor-layer-name">${st ? st.label : l.shapeType} ${l.id}</span>
        <button class="editor-layer-del" onclick="event.stopPropagation();selectedLayerId=${l.id};deleteSelectedLayer()">×</button>
      </div>`;
    }).join('');
  }
}

// ── Render Layers on Preview ─────────────────────────────────────────

function renderLayers() {
  const container = document.getElementById('editor-layers-container');
  if (!container) return;
  const existing = container.querySelectorAll('.editor-layer-el');
  existing.forEach(el => el.remove());

  const rect = container.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;

  // Render text layers
  textLayers.forEach(l => {
    const div = document.createElement('div');
    div.className = 'editor-layer-el' + (l.id === selectedLayerId ? ' selected' : '');
    div.dataset.layerId = l.id;
    div.dataset.layerType = 'text';
    const br = l.borderRadius !== undefined ? l.borderRadius : 4;
    div.style.cssText = `
      position:absolute;
      left:${l.x}%;
      top:${l.y}%;
      transform:translate(-50%,-50%);
      font-family:${l.font};
      font-size:${l.size}px;
      color:${l.color};
      opacity:${l.opacity / 100};
      text-align:center;
      pointer-events:auto;
      cursor:grab;
      z-index:${10 + l.id};
      letter-spacing:${l.spacing}px;
      padding:8px 16px;
      border-radius:${br}px;
      max-width:80%;
      word-break:break-word;
      ${l.style === 'bold' ? 'font-weight:bold;' : ''}
      ${l.style === 'outline' ? `-webkit-text-stroke:2px ${l.color === '#ffffff' ? '#000' : '#fff'};` : ''}
      ${l.style === 'shadow' ? 'text-shadow:3px 3px 6px rgba(0,0,0,0.8);' : ''}
      ${l.style === 'glow' ? `text-shadow:0 0 20px ${l.color},0 0 40px ${l.color};` : ''}
    `;
    if (l.bgOpacity > 0) {
      div.style.background = l.bgColor + Math.round(l.bgOpacity / 100 * 255).toString(16).padStart(2, '0');
    }
    div.textContent = l.text || 'Text';
    container.appendChild(div);
  });

  // Render image layers
  imageLayers.forEach(l => {
    const img = document.createElement('img');
    img.className = 'editor-layer-el' + (l.id === selectedLayerId ? ' selected' : '');
    img.dataset.layerId = l.id;
    img.dataset.layerType = 'image';
    img.src = l.src;
    img.style.cssText = `
      position:absolute;
      left:${l.x}%;
      top:${l.y}%;
      transform:translate(-50%,-50%);
      width:${l.size}%;
      opacity:${l.opacity / 100};
      pointer-events:auto;
      cursor:grab;
      z-index:${5 + l.id};
      object-fit:contain;
      border:${l.id === selectedLayerId ? '2px solid var(--primary)' : '2px solid transparent'};
      border-radius:4px;
    `;
    container.appendChild(img);
  });

  // Render shape layers
  const SHAPE_SVG = {
    rectangle: (w, h, c, o, bw, bc) => `<rect x="${bw/2}" y="${bw/2}" width="${w-bw}" height="${h-bw}" fill="${c}" fill-opacity="${o}" stroke="${bc}" stroke-width="${bw}" rx="2"/>`,
    circle: (w, h, c, o, bw, bc) => `<circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)/2-bw/2}" fill="${c}" fill-opacity="${o}" stroke="${bc}" stroke-width="${bw}"/>`,
    ellipse: (w, h, c, o, bw, bc) => `<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2-bw/2}" ry="${h/2-bw/2}" fill="${c}" fill-opacity="${o}" stroke="${bc}" stroke-width="${bw}"/>`,
    triangle: (w, h, c, o, bw, bc) => `<polygon points="${w/2},${bw} ${w-bw},${h-bw} ${bw},${h-bw}" fill="${c}" fill-opacity="${o}" stroke="${bc}" stroke-width="${bw}" stroke-linejoin="round"/>`,
    star: (w, h, c, o, bw, bc) => {
      const cx = w/2, cy = h/2, outer = Math.min(w,h)/2-bw/2, inner = outer*0.4;
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = (i * Math.PI / 5) - Math.PI / 2;
        pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${c}" fill-opacity="${o}" stroke="${bc}" stroke-width="${bw}" stroke-linejoin="round"/>`;
    },
    diamond: (w, h, c, o, bw, bc) => `<polygon points="${w/2},${bw} ${w-bw},${h/2} ${w/2},${h-bw} ${bw},${h/2}" fill="${c}" fill-opacity="${o}" stroke="${bc}" stroke-width="${bw}" stroke-linejoin="round"/>`,
    arrow: (w, h, c, o, bw, bc) => {
      const bodyW = w * 0.6, headW = w * 0.4, headH = h;
      return `<line x1="${bw}" y1="${h/2}" x2="${bodyW}" y2="${h/2}" stroke="${c}" stroke-width="${bw||2}" stroke-opacity="${o}"/><polygon points="${bodyW},${bw} ${w-bw},${h/2} ${bodyW},${h-bw}" fill="${c}" fill-opacity="${o}" stroke="${bc}" stroke-width="${bw}" stroke-linejoin="round"/>`;
    },
    line: (w, h, c, o, bw, bc) => `<line x1="${bw}" y1="${h/2}" x2="${w-bw}" y2="${h/2}" stroke="${c||bc}" stroke-width="${Math.max(bw||2,2)}" stroke-opacity="${o}" stroke-linecap="round"/>`,
  };

  shapeLayers.forEach(l => {
    const svgFn = SHAPE_SVG[l.shapeType];
    if (!svgFn) return;
    const wPx = Math.round(rect.width * l.width / 100);
    const hPx = Math.round(rect.height * l.height / 100);
    const svgContent = svgFn(wPx, hPx, l.color, l.opacity/100, l.borderWidth, l.borderColor);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${wPx} ${hPx}`);
    svg.setAttribute('width', wPx);
    svg.setAttribute('height', hPx);
    svg.innerHTML = svgContent;
    const div = document.createElement('div');
    div.className = 'editor-layer-el' + (l.id === selectedLayerId ? ' selected' : '');
    div.dataset.layerId = l.id;
    div.dataset.layerType = 'shape';
    div.style.cssText = `
      position:absolute;
      left:${l.x}%;
      top:${l.y}%;
      transform:translate(-50%,-50%) rotate(${l.rotation}deg);
      width:${l.width}%;
      height:${l.height}%;
      pointer-events:auto;
      cursor:grab;
      z-index:${3 + l.id};
      overflow:visible;
      ${l.id === selectedLayerId ? 'outline:2px dashed var(--primary);outline-offset:2px;' : ''}
    `;
    div.appendChild(svg);
    container.appendChild(div);
  });
}

// ── Effects ───────────────────────────────────────────────────────────

function safeVal(id, fallback = 0) {
  const el = document.getElementById(id);
  return el ? parseInt(el.value) : fallback;
}
function safeText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function applyEffects() {
  editorEffects.brightness = safeVal('ef-brightness');
  editorEffects.contrast = safeVal('ef-contrast');
  editorEffects.saturation = safeVal('ef-saturation');
  editorEffects.blur = safeVal('ef-blur');
  editorEffects.grayscale = safeVal('ef-grayscale');
  editorEffects.sepia = safeVal('ef-sepia');

  safeText('ef-brightness-val', editorEffects.brightness);
  safeText('ef-contrast-val', editorEffects.contrast);
  safeText('ef-saturation-val', editorEffects.saturation);
  safeText('ef-blur-val', editorEffects.blur);
  safeText('ef-grayscale-val', editorEffects.grayscale + '%');
  safeText('ef-sepia-val', editorEffects.sepia + '%');

  const video = document.getElementById('editor-video');
  if (!video) return;
  const b = 1 + editorEffects.brightness / 100;
  const c = 1 + editorEffects.contrast / 100;
  const s = 1 + editorEffects.saturation / 100;
  const blur = editorEffects.blur;
  const gs = editorEffects.grayscale / 100;
  const sep = editorEffects.sepia / 100;

  video.style.filter = `brightness(${b}) contrast(${c}) saturate(${s}) blur(${blur}px) grayscale(${gs}) sepia(${sep})`;
}

// ── Transition ────────────────────────────────────────────────────────

function onTransitionChange() {
  editorTransition.type = document.getElementById('editor-transition-type').value;
}

// ── Frame Preset & Freeze Frame ─────────────────────────────────────

function onFramePresetChange() {
  editorFramePreset = document.getElementById('editor-frame-preset').value;
}

function onFreezeChange() {
  editorFreezeFrame = {
    enabled: document.getElementById('editor-freeze-enable').checked,
    time: parseFloat(document.getElementById('editor-freeze-time').value) || 1,
    duration: parseInt(document.getElementById('editor-freeze-duration').value) || 3,
    title: document.getElementById('editor-freeze-title').value || '',
    subtitle: document.getElementById('editor-freeze-subtitle').value || '',
  };
}

// ── Timeline Segments ─────────────────────────────────────────────────

function initSegments() {
  if (editorDuration <= 0) return;
  segments = [{ start: 0, end: editorDuration }];
  selectedSegmentIdx = 0;
  drawTimelineCanvas();
}

function splitAtPlayhead() {
  if (editorDuration <= 0 || segments.length === 0) return;
  const time = editorPlayheadPos;
  let splitIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (time > segments[i].start && time < segments[i].end) {
      splitIdx = i;
      break;
    }
  }
  if (splitIdx === -1) { showToast('Playhead not inside any segment'); return; }
  const seg = segments[splitIdx];
  const newSeg = { start: time, end: seg.end };
  seg.end = time;
  segments.splice(splitIdx + 1, 0, newSeg);
  selectedSegmentIdx = splitIdx + 1;
  drawTimelineCanvas();
  showToast('Segment split at ' + formatTime(time));
}

function removeSelectedSegment() {
  if (segments.length <= 1) { showToast('Cannot remove the only segment'); return; }
  if (selectedSegmentIdx < 0 || selectedSegmentIdx >= segments.length) return;
  segments.splice(selectedSegmentIdx, 1);
  selectedSegmentIdx = Math.min(selectedSegmentIdx, segments.length - 1);
  drawTimelineCanvas();
}

// ── Video Loading ────────────────────────────────────────────────────

function setupEditorListeners() {
  const video = document.getElementById('editor-video');
  if (!video) return;
  video.onloadedmetadata = onVideoLoaded;
  video.ontimeupdate = onVideoTimeUpdate;
  video.onplay = () => { editorIsPlaying = true; startPlayheadAnimation(); };
  video.onpause = () => { editorIsPlaying = false; stopPlayheadAnimation(); };
  video.onseeked = updatePlayheadPosition;
  video.onerror = () => {
    showToast('⚠️ Video error: format tidak didukung atau URL bermasalah');
    if (window._videoLoadTimeout) clearTimeout(window._videoLoadTimeout);
  };

  const track = document.getElementById('editor-timeline-track');
  if (!track) return;
  track.onmousedown = onTimelineMouseDown;

  const bgmVol = document.getElementById('editor-bgm-volume');
  if (bgmVol) {
    bgmVol.oninput = () => {
      const lbl = document.getElementById('editor-bgm-volume-label');
      if (lbl) lbl.textContent = bgmVol.value + '%';
    };
  }
}

function setupTimelineMouse() {
  // Combined document-level mouse handlers (layers + timeline)
  document.onmousemove = (e) => {
    onTimelineMouseMove(e);
    onLayerMouseMove(e);
  };
  document.onmouseup = (e) => {
    onTimelineMouseUp(e);
    onLayerMouseUp(e);
  };
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') {
      e.preventDefault();
      const video = document.getElementById('editor-video');
      if (video.paused) video.play(); else video.pause();
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      splitAtPlayhead();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedLayerId) { deleteSelectedLayer(); }
    }
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
  if (!video) { showToast('Video element not found'); return; }
  showToast('Loading video...');
  video.src = url;
  video.load();
  // Timeout: if video doesn't load metadata within 30s, show error
  if (window._videoLoadTimeout) clearTimeout(window._videoLoadTimeout);
  window._videoLoadTimeout = setTimeout(() => {
    if (video.readyState < 1) {
      showToast('⚠️ Video gagal load. Cek URL atau coba video lain.');
    }
  }, 30000);
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
  try {
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
    loadWaveform();
    resetEffects();
  } catch(e) {
    console.error('onVideoLoaded error:', e);
  }
}

function resetEffects() {
  const ids = ['ef-brightness','ef-contrast','ef-saturation','ef-blur','ef-grayscale','ef-sepia'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
  applyEffects();
}

function loadWaveform() {
  const urlEl = document.getElementById('editor-video-url');
  if (!urlEl) return;
  const videoUrl = urlEl.value.trim();
  if (!videoUrl || editorWaveformLoading) return;
  editorWaveformLoading = true;
  editorWaveformData = null;

  fetch('/api/video/waveform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.success && data.points) {
        editorWaveformData = data.points;
        drawTimelineCanvas();
      }
    })
    .catch(() => {})
    .finally(() => { editorWaveformLoading = false; });
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

  const barY = 20;
  const barH = 40;

  // Draw each segment
  if (segments.length === 0) initSegments();
  segments.forEach((seg, idx) => {
    const sx = seg.start * pps;
    const ex = seg.end * pps;
    const sw = ex - sx;

    const isSelected = idx === selectedSegmentIdx;

    // Segment background
    ctx.fillStyle = isSelected ? '#1a3050' : '#2a3a4a';
    ctx.fillRect(sx, barY, sw, barH);

    // Segment gradient bar
    const grad = ctx.createLinearGradient(sx, barY, ex, barY);
    grad.addColorStop(0, isSelected ? '#0088ff' : '#0050ff');
    grad.addColorStop(1, isSelected ? '#44eeff' : '#00d4ff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(sx + 2, barY + 2, sw - 4, barH - 4, 3);
    ctx.fill();

    // Segment label
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(seg.start) + ' - ' + formatTime(seg.end), sx + sw / 2, barY + barH / 2 + 4);

    // Split line between segments
    if (idx > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, barY);
      ctx.lineTo(sx, barY + barH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

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

  // Waveform (only on first segment area for simplicity)
  if (editorWaveformData && editorWaveformData.length > 0 && segments.length > 0) {
    const firstSeg = segments[0];
    const sx = firstSeg.start * pps;
    const ex = firstSeg.end * pps;
    const segDur = firstSeg.end - firstSeg.start;
    ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
    const waveformCount = Math.min(editorWaveformData.length, Math.floor((ex - sx) / 3));
    const waveformStep = Math.max(1, Math.floor(editorWaveformData.length / waveformCount));
    for (let i = 0; i < waveformCount; i++) {
      const idx = Math.min(Math.floor(i * waveformStep), editorWaveformData.length - 1);
      const val = editorWaveformData[idx] || 0;
      const hw = Math.max(2, val * 32);
      const x = sx + (ex - sx) * i / waveformCount;
      ctx.fillRect(x, 40 - hw / 2, Math.max(2, (ex - sx) / waveformCount - 1), hw);
    }
  } else if (segments.length > 0) {
    const sx = segments[0].start * pps;
    const ex = segments[0].end * pps;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    const barCount = 60;
    for (let i = 0; i < barCount; i++) {
      const hw = 4 + Math.random() * 16;
      ctx.fillRect(sx + (ex - sx) * i / barCount, 40 - hw / 2, Math.max(2, (ex - sx) / barCount - 1), hw);
    }
    if (editorWaveformLoading) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading waveform...', w / 2, 50);
    }
  }

  // Playhead
  const playheadX = editorPlayheadPos * pps;
  ctx.strokeStyle = '#ff3366';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, h);
  ctx.stroke();

  // Time at playhead
  ctx.fillStyle = '#ff3366';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(formatTime(editorPlayheadPos), playheadX, h - 4);
}

function updatePlayheadPosition() {
  const pps = getPixelsPerSecond();
  const x = editorPlayheadPos * pps;
  const playhead = document.getElementById('editor-playhead');
  playhead.style.left = x + 'px';
  playhead.style.display = editorDuration > 0 ? 'block' : 'none';
  drawTimelineCanvas();
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

  // Check if clicking on a segment to select it
  for (let i = segments.length - 1; i >= 0; i--) {
    if (time >= segments[i].start && time <= segments[i].end) {
      selectedSegmentIdx = i;
      break;
    }
  }

  editorPlayheadPos = Math.max(0, Math.min(time, editorDuration));
  document.getElementById('editor-video').currentTime = editorPlayheadPos;
  updatePlayheadPosition();
  editorIsDraggingPlayhead = true;
  drawTimelineCanvas();
}

function onTimelineMouseMove(e) {
  const track = document.getElementById('editor-timeline-track');
  const rect = track.getBoundingClientRect();
  const pps = getPixelsPerSecond();
  const x = e.clientX - rect.left + track.scrollLeft;
  const time = Math.max(0, Math.min(x / pps, editorDuration));

  if (editorIsDraggingPlayhead) {
    // Check which segment this time falls in
    for (let i = 0; i < segments.length; i++) {
      if (time >= segments[i].start && time <= segments[i].end) {
        if (selectedSegmentIdx !== i) {
          selectedSegmentIdx = i;
          drawTimelineCanvas();
        }
        break;
      }
    }
    editorPlayheadPos = time;
    document.getElementById('editor-video').currentTime = editorPlayheadPos;
    document.getElementById('editor-time-current').textContent = formatTime(editorPlayheadPos);
    updatePlayheadPosition();
    drawTimelineCanvas();
  }
}

function onTimelineMouseUp(e) {
  editorIsDraggingPlayhead = false;
}

function zoomTimeline(dir) {
  editorZoom = Math.max(0.25, Math.min(4, editorZoom * (dir > 0 ? 1.5 : 0.67)));
  document.getElementById('editor-zoom-level').textContent = editorZoom.toFixed(1) + 'x';
  renderTimeline();
  updatePlayheadPosition();
  drawTimelineCanvas();
}

function updateTrimSliders() {
  // No longer used - replaced by segments
}

function updateTrimDisplay() {
  // No longer used - replaced by segments
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

  // Build segments payload
  const segPayload = segments.map((seg, idx) => {
    const transition = idx > 0 ? editorTransition : { type: 'none', duration: 0 };
    return {
      start: seg.start,
      end: seg.end,
      transition: idx > 0 ? transition : null,
    };
  });

  const payload = {
    videoUrl,
    segments: segPayload,
    textLayers: textLayers.map(l => ({
      text: l.text,
      font: l.font,
      size: l.size,
      color: l.color,
      opacity: l.opacity / 100,
      bgColor: l.bgColor,
      bgOpacity: l.bgOpacity / 100,
      style: l.style,
      spacing: l.spacing,
      borderRadius: l.borderRadius !== undefined ? l.borderRadius : 0,
      x: l.x / 100,
      y: l.y / 100,
    })),
    imageLayers: imageLayers.map(l => ({
      src: l.src,
      x: l.x / 100,
      y: l.y / 100,
      size: l.size / 100,
      opacity: l.opacity / 100,
    })),
    shapeLayers: shapeLayers.map(l => ({
      shapeType: l.shapeType,
      x: l.x / 100,
      y: l.y / 100,
      width: l.width / 100,
      height: l.height / 100,
      color: l.color,
      opacity: l.opacity / 100,
      borderWidth: l.borderWidth,
      borderColor: l.borderColor,
      rotation: l.rotation,
    })),
    effects: editorEffects,
    transition: editorTransition,
    aspectRatio: editorFramePreset,
    freezeFrame: editorFreezeFrame,
    introDuration: parseInt(document.getElementById('editor-intro-duration').value) || 3,
    introVideo: document.getElementById('editor-intro-select')?.value || '',
    template: document.getElementById('editor-template-select').value || '',
    bgm: document.getElementById('editor-bgm-select').value || '',
    bgmVolume: parseInt(document.getElementById('editor-bgm-volume').value) / 100,
  };

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
  if (!video) return;
  if (path.startsWith('/')) path = window.location.origin + path;
  if (window._videoLoadTimeout) clearTimeout(window._videoLoadTimeout);
  video.src = path;
  video.load();
  video.play().catch(() => {});
  document.getElementById('editor-video-url').value = path;
  showToast('Preview ready');
}

async function quickPreview() {
  const videoUrl = document.getElementById('editor-video-url').value.trim();
  if (!videoUrl) { showToast('Load video dulu'); return; }

  const btn = document.querySelector('[onclick="quickPreview()"]');
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = 'Previewing...';
  btn.disabled = true;

  const introDurEl = document.getElementById('editor-intro-duration');
  const tmplEl = document.getElementById('editor-template-select');
  const title = (textLayers[0] && textLayers[0].text) || '';
  const titleColor = (textLayers[0] && textLayers[0].color) || '#ffffff';
  const titleSize = (textLayers[0] && textLayers[0].size) || 48;

  try {
    const res = await fetch('/api/video/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl,
        title,
        introDuration: introDurEl ? parseInt(introDurEl.value) : 3,
        template: tmplEl ? tmplEl.value : '',
        titleColor,
        titleSize,
      }),
    });
    const data = await res.json();
    if (data.success) {
      previewEditedVideo(data.outputPath);
    } else {
      showToast('Preview failed: ' + (data.error || 'Unknown'));
    }
  } catch (e) {
    showToast('Preview error: ' + e.message);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
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
