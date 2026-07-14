// ========================
// PRESETS DATA
// ========================
const PRESETS = {
  'Podcast': {
    icon: '&#127897;',
    desc: 'Insight, hot take, banter',
    min_duration: 30, max_duration: 90, target_duration: 60,
    captions: true, reframe: true, emojis: false, remove_silences: true, intro_title: false,
    stylePresetId: 'mNpsvuTzw499',
    context: 'Podcast conversation. Cari momen: kutipan insight mendalam, hot take kontroversial, momen emosional, cerita personal yang relatable, joke/banter lucu antar host. Hindari: intro/outro, iklan, small talk kosong.',
    tips: [
      'Fokus ke momen dimana host bilang sesuatu kontroversial atau surprising',
      'Cari bagian storytelling personal - biasanya paling relatable',
      'Audio clip yang bagus: 45-90 detik, 1 poin jelas',
      'Hot take + reaction = combo viral'
    ]
  },
  'Gaming': {
    icon: '&#127918;',
    desc: 'Clutch, epic, rage moments',
    min_duration: 10, max_duration: 60, target_duration: 30,
    captions: true, reframe: true, emojis: true, remove_silences: true, intro_title: true,
    context: 'Gaming content. Cari momen: clutch play, epic win/fail, reaksi kaget/seru, momen lucu, rage quit, plot twist gameplay. Fokus ke excitement dan reaksi player.',
    tips: [
      'Moment paling viral: unexpected play + genuine reaction',
      'Clutch 1vX situation selalu engage',
      'Rage quit atau salty moment juga menarik asal authentic',
      'Keep short: 15-30 detik. Gaming attention span cepat'
    ]
  },
  'Tutorial': {
    icon: '&#128218;',
    desc: 'Tips, hacks, how-to',
    min_duration: 20, max_duration: 90, target_duration: 45,
    captions: true, reframe: true, emojis: false, remove_silences: true, intro_title: true,
    context: 'Tutorial/educational content. Cari momen: tips actionable, before-after demo, common mistake reveal, shortcut/hack, key takeaway summary. Setiap clip harus self-contained dan ngasih value.',
    tips: [
      'Setiap clip harus ngasih 1 value yang jelas',
      'Before-after demo format sangat engaging',
      '"Most people don\'t know this..." hook terbukti efektif',
      'Clip harus bisa berdiri sendiri tanpa konteks video full'
    ]
  },
  'Vlog': {
    icon: '&#127916;',
    desc: 'Stories, travel, aesthetic',
    min_duration: 15, max_duration: 60, target_duration: 30,
    captions: true, reframe: true, emojis: true, remove_silences: true, intro_title: false,
    context: 'Vlog content. Cari momen: storytelling seru, reveal/surprise, momen aesthetic/cinematic, reaksi genuine, adventure highlight, food/travel moment memorable.',
    tips: [
      'Visual-first: cari momen yang secara visual stunning',
      'Surprise/reveal moments paling shareable',
      'Food close-up + reaction = engagement tinggi',
      'Authentic emotion > scripted moments'
    ]
  },
  'Review': {
    icon: '&#128230;',
    desc: 'Unboxing, verdict, compare',
    min_duration: 15, max_duration: 45, target_duration: 30,
    captions: true, reframe: true, emojis: true, remove_silences: true, intro_title: true,
    context: 'Product review/unboxing. Cari momen: first impression/reaction, fitur paling unik, perbandingan, verdict/rating, deal breaker, worth it or not moment.',
    tips: [
      'First reaction saat unboxing = engagement hook',
      'Verdict/rating moment: "Worth it? Let me tell you..."',
      'Comparison: "This vs That" format very shareable',
      'Deal breaker reveal = curiosity driver'
    ]
  },
  'Interview': {
    icon: '&#127908;',
    desc: 'Deep answers, revelations',
    min_duration: 30, max_duration: 90, target_duration: 60,
    captions: true, reframe: true, emojis: false, remove_silences: true, intro_title: false,
    context: 'Interview format. Cari momen: jawaban paling impactful, cerita behind-the-scene, confession/revelation, advice berharga, momen emosional, quote memorable.',
    tips: [
      'Quote-worthy answers = most shareable',
      'Emotional/vulnerable moments = high engagement',
      'Behind-the-scene/exclusive info = curiosity hook',
      'Plot twist answer yang unexpected'
    ]
  },
  'Music': {
    icon: '&#127925;',
    desc: 'Performance, hooks, crowd',
    min_duration: 15, max_duration: 60, target_duration: 30,
    captions: false, reframe: true, emojis: false, remove_silences: false, intro_title: false,
    context: 'Music/performance content. Cari momen: chorus/hook terbaik, high note, crowd reaction, solo instrument, dance break, opening yang powerful.',
    tips: [
      'Chorus/hook section = paling recognizable',
      'High note atau impressive vocal moment',
      'Crowd singing along = social proof',
      'Jangan potong di tengah frase musikal'
    ]
  },
  'Iben Podcast': {
    icon: '&#128176;',
    desc: 'Jual Emas Indonesia - Iben & Juan',
    min_duration: 15, max_duration: 90, target_duration: 60,
    captions: true, reframe: false, emojis: false, remove_silences: true, intro_title: false,
    stylePresetId: '',
    context: 'Podcast Iben dan Juan bahas Jual Emas Indonesia. Cari momen: penjelasan value proposition jual emas, cara kerja bisnis emas, insight pasar emas Indonesia, tips investasi emas, cerita partnership Iben & Juan, alasan orang beli emas lewat mereka, perbandingan emas vs investasi lain, testimoni/pengalaman customer. Hindari konten sensitif, SARA, intro/outro podcast, iklan, small talk kosong.',
    tips: [
      'Fokus ke momen yang explain kenapa orang harus beli emas lewat mereka',
      'Cari bagian Iben dan Juan explain business model-nya',
      'Insight soal pasar emas Indonesia banyak engagement',
      'Testimoni/pengalaman nyata paling ngena buat audience',
      'Pastikan tiap clip durasi minimal 15 detik sesuai aturan campaign'
    ]
  },
  'Custom': {
    icon: '&#9881;',
    desc: 'Full manual control',
    min_duration: 15, max_duration: 60, target_duration: 30,
    captions: true, reframe: true, emojis: true, remove_silences: true, intro_title: false,
    context: '',
    tips: [
      'Tulis briefing yang spesifik untuk hasil terbaik',
      'Adjust duration sesuai platform target (TikTok: 15-30s, Reels: 30-60s, Shorts: 30-60s)',
      'Setiap clip harus bisa berdiri sendiri',
      'Hook di 3 detik pertama itu wajib'
    ]
  }
};

// ========================
// GLOBAL STATE
// ========================
let selectedPreset = 'Custom';
let managedUsers = [];
let embedProjects = [];
let savedKeys = [];
let keyGenInProgress = false;
let activeJobStream = null;
let historyJobs = [];
let historyRefreshInterval = null;

const PAGE_TITLES = {
  create: 'Create New Clip',
  results: 'Clip Results',
  history: 'Processing History',
  presets: 'Content Presets',
  users: 'Managed Users',
  keys: 'Key Manager',
  editor: 'Klap Editor',
  brief: 'Content Brief',
  settings: 'Settings'
};

// ========================
// NAVIGATION
// ========================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    navigateTo(item.dataset.page);
  });
});

let loadedPages = {};

async function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.dataset.page === page) n.classList.add('active');
  });

  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] || '';
  window.location.hash = page;

  // Hide submit button on non-create pages
  const btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) btnSubmit.style.display = page === 'create' ? 'inline-flex' : 'none';

  // Load page content from external file (once)
  if (!loadedPages[page]) {
    try {
      const res = await fetch(`/dashboard/pages/${page}.html`);
      if (res.ok) {
        const html = await res.text();
        const wrapper = document.createElement('div');
        wrapper.id = `page-${page}`;
        wrapper.className = 'page';
        wrapper.innerHTML = html;
        document.getElementById('page-content').appendChild(wrapper);
        loadedPages[page] = wrapper;
      }
    } catch (e) {
      showToast('Failed to load page');
    }
  }

  // Show current, hide others
  document.querySelectorAll('#page-content > .page').forEach(p => {
    p.style.display = 'none';
  });
  if (loadedPages[page]) {
    loadedPages[page].style.display = 'block';
  }

  try {
    // Page-specific init
    if (page === 'create') { renderPresetGrid(); updateKeySelector(); initCreatePage(); }
    else if (page === 'results') { /* no auto-init */ }
    else if (page === 'history') { loadHistory(); startHistoryAutoRefresh(); }
    else if (page === 'keys') renderKeyManager();
    else if (page === 'settings') loadSettings();
    else if (page === 'presets') renderPresetsDetailPage();
    else if (page === 'users') renderUsers();
    else if (page === 'editor') initEditor();
    else if (page === 'brief') initBrief();
  } catch (e) {
    console.error('Error in page init:', e);
  }

  if (historyRefreshInterval && page !== 'history') {
    clearInterval(historyRefreshInterval);
    historyRefreshInterval = null;
  }
}

// ========================
// INIT
// ========================
function init() {
  fetch('/api/auth/check').then(r => r.json()).then(d => {
    if (!d.authenticated) window.location.href = '/login.html';
  });
  loadSettings();
  loadManagedUsers();
  loadKeys();
  loadHistory();

  const pageFromHash = window.location.hash.replace('#', '') || 'create';
  const validPages = ['create', 'results', 'history', 'presets', 'users', 'keys', 'editor', 'settings', 'brief'];
  navigateTo(validPages.includes(pageFromHash) ? pageFromHash : 'create');

  setTimeout(() => checkAllCredit(true), 2000);
}

function logout() {
  fetch('/api/auth/logout', { method: 'POST' }).then(() => {
    window.location.href = '/login.html';
  });
}

// ========================
// TOGGLE
// ========================
function toggleSwitch(el) {
  el.classList.toggle('active');
}

function setToggle(id, value) {
  const el = document.getElementById(id);
  if (el) {
    if (value) el.classList.add('active');
    else el.classList.remove('active');
  }
}

function getToggle(id) {
  const el = document.getElementById(id);
  return el ? el.classList.contains('active') : false;
}

// ========================
// UTILS
// ========================
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function copyLink(url) {
  if (!url) { showToast('Link belum tersedia'); return; }
  navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
}

function updateNav(page) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
}

