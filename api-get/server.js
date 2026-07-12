const express = require('express');
const path = require('path');
const session = require('express-session');
const { getKlapApiKey } = require('./klap-automation');
const { processFormSubmission, pollTask, getVideoUrl } = require('./webhook');
const { requireAuth } = require('./auth');
const { postToTikTok } = require('./tiktok-poster');
const { fullEdit, getVideoInfo, downloadVideo } = require('./video-editor');
const { getAllJobs, getJob, createJob, updateJob, getAllKeys, saveKey, updateKey, getKey, getKeyByApiKey, markKeyAsUsed } = require('./db');
const { startJob, subscribeJob } = require('./job-processor');

const app = express();
const PORT = process.env.PORT || 3002;

// Env config
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'viral-cut-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 },
}));

app.use(express.json());

// CORS - allow Viral Cut dashboard to call api-get
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// SSE keepalive helper — sends a comment every 15s to prevent timeout
function sseKeepalive(res) {
  const interval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);
  res.on('close', () => clearInterval(interval));
  return interval;
}

// Cache get-key results per session so EventSource reconnects don't get blocked
const keyGenCache = new Map(); // sessionKey -> { promise, events }

// Root route — catch BEFORE express.static so index.html doesn't hijack it
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

// Static files (login.html, dashboard assets, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes ──────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Username atau password salah' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated, username: req.session.username || '' });
});

// GET /api/get-key — auto-get Klap API key (requires auth)
// Caches result per session so EventSource browser reconnects get the same data
app.get('/api/get-key', requireAuth, async (req, res) => {
  const sessionKey = req.sessionID || req.ip;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (step, message) => {
    res.write(`data: ${JSON.stringify({ step, message })}\n\n`);
  };

  // If a key-gen is already running for this session, replay events + wait for result
  const cached = keyGenCache.get(sessionKey);
  if (cached) {
    for (const evt of cached.events) {
      sendEvent(evt.step, evt.message);
    }
    try {
      const result = await cached.promise;
      sendEvent('done', JSON.stringify(result));
    } catch (err) {
      sendEvent('error', err.message);
    }
    res.end();
    return;
  }

  const events = [];
  const promise = getKlapApiKey(({ step, message }) => {
    events.push({ step, message });
    sendEvent(step, message);
  });

  keyGenCache.set(sessionKey, { promise, events });

  const keepalive = sseKeepalive(res);

  try {
    const result = await promise;
    sendEvent('done', JSON.stringify(result));
  } catch (err) {
    sendEvent('error', err.message);
  } finally {
    clearInterval(keepalive);
    keyGenCache.delete(sessionKey);
    res.end();
  }
});

// POST /api/webhook/process-form — body: { linkYt, mauBerapaBanyak, tambahkanBriefing, api }
app.post('/api/webhook/process-form', requireAuth, async (req, res) => {
  const { linkYt, mauBerapaBanyak, tambahkanBriefing, api: apiKey } = req.body;

  if (!linkYt || !apiKey) {
    return res.status(400).json({
      success: false,
      error: 'Field wajib: linkYt (YouTube URL) dan api (Klap API key)',
    });
  }

  try {
    const result = await processFormSubmission({
      apiKey,
      linkYt,
      mauBerapaBanyak: parseInt(mauBerapaBanyak, 10) || 10,
      tambahkanBriefing: tambahkanBriefing || '',
    });

    res.json({
      success: true,
      task: result.task,
      projects: result.projects,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/webhook/process-form-stream — SSE streaming progress
app.get('/api/webhook/process-form-stream', requireAuth, async (req, res) => {
  const { linkYt, mauBerapaBanyak, tambahkanBriefing, api: apiKey } = req.query;

  if (!linkYt || !apiKey) {
    res.status(400).json({ success: false, error: 'Field wajib: linkYt dan api' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const keepalive = sseKeepalive(res);

  const sendEvent = (step, message, data) => {
    res.write(`data: ${JSON.stringify({ step, message, data })}\n\n`);
  };

  try {
    const result = await processFormSubmission(
      {
        apiKey,
        linkYt,
        mauBerapaBanyak: parseInt(mauBerapaBanyak, 10) || 10,
        tambahkanBriefing: tambahkanBriefing || '',
      },
      ({ step, message, data }) => sendEvent(step, message, data),
    );

    sendEvent('done', 'Selesai', result);
  } catch (err) {
    sendEvent('error', err.message);
  } finally {
    clearInterval(keepalive);
    res.end();
  }
});

// ── Key Management API ────────────────────────────────────────────────

// GET /api/keys — List all saved API keys
app.get('/api/keys', requireAuth, (req, res) => {
  const keys = getAllKeys().map(k => ({
    id: k.id, email: k.email, key: k.key, credit: k.credit || 0,
    type: k.type || 'credit',
    used: k.type === 'onetime' ? (k.used || false) : undefined,
    usedAt: k.type === 'onetime' ? (k.usedAt || null) : undefined,
    createdAt: k.createdAt,
  }));
  res.json({ keys });
});

// POST /api/keys — Save a new API key
app.post('/api/keys', requireAuth, (req, res) => {
  const { email, key, credit, type } = req.body;
  if (!key) return res.status(400).json({ error: 'key wajib diisi' });
  const entry = {
    id: `key_${Date.now()}`,
    email: email || '',
    key,
    type: type === 'onetime' ? 'onetime' : 'credit',
    createdAt: new Date().toISOString(),
  };
  if (entry.type === 'onetime') {
    entry.used = false;
  } else {
    entry.credit = parseInt(credit) || 0;
    entry.creditTotal = 5;
    entry.creditUsed = 0;
  }
  saveKey(entry);
  res.json({ success: true, key: entry });
});

// PUT /api/keys/:id — Update key (e.g. credit balance)
app.put('/api/keys/:id', requireAuth, async (req, res) => {
  const old = getKey(req.params.id);
  if (!old) return res.status(404).json({ error: 'Key not found' });
  deleteKey(req.params.id);
  saveKey({ ...old, ...req.body, id: req.params.id });
  res.json({ success: true });
});

// GET /api/keys/check-credit — Check stored credit from local DB
// If ?keys=... is provided, looks up those API keys in the DB
app.get('/api/keys/check-credit', requireAuth, (req, res) => {
  let keyList = getAllKeys();
  if (req.query.keys) {
    const searchKeys = req.query.keys.split(',').map(pair => {
      const [email, key] = pair.split(':');
      return key || '';
    }).filter(Boolean);
    keyList = keyList.filter(k => searchKeys.includes(k.key));
  }
  const results = keyList.map(k => ({
    id: k.id, email: k.email, key: k.key,
    credit: Math.max(0, (k.creditTotal || 5) - (k.creditUsed || 0)),
    ok: true,
  }));
  res.json({ keys: results });
});

// GET /api/keys/check-credit-real — Login to Klap & get real credit balance
app.get('/api/keys/check-credit-real', requireAuth, async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const { getKlapCredit } = require('./klap-automation');
    const result = await getKlapCredit(email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/keys/:id — Delete a key
app.delete('/api/keys/:id', requireAuth, (req, res) => {
  const { deleteKey } = require('./db');
  deleteKey(req.params.id);
  res.json({ success: true });
});

// GET /api/webhook/status/:taskId?api=YOUR_API_KEY — single status check
app.get('/api/webhook/status/:taskId', requireAuth, async (req, res) => {
  const { api: apiKey } = req.query;
  const { taskId } = req.params;

  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'Query parameter api (API key) wajib' });
  }

  try {
    const task = await pollTask(apiKey, taskId, 1000, 1);
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── TikTok Account Management ─────────────────────────────────────────

// GET /api/tiktok/accounts — List saved TikTok accounts
app.get('/api/tiktok/accounts', requireAuth, (req, res) => {
  const { getTikTokAccounts } = require('./db');
  const accounts = getTikTokAccounts().map(a => ({
    id: a.id,
    label: a.label || a.username,
    username: a.username,
    hasPassword: !!a.password,
    createdAt: a.createdAt,
  }));
  res.json({ accounts });
});

// POST /api/tiktok/accounts — Save a TikTok account
app.post('/api/tiktok/accounts', requireAuth, (req, res) => {
  const { id, label, username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username dan password wajib' });
  }
  const { saveTikTokAccount } = require('./db');
  const account = saveTikTokAccount({
    id: id || 'new',
    label: label || username,
    username,
    password,
    createdAt: new Date().toISOString(),
  });
  res.json({ success: true, account: { ...account, password: undefined } });
});

// DELETE /api/tiktok/accounts/:id — Delete a TikTok account
app.delete('/api/tiktok/accounts/:id', requireAuth, (req, res) => {
  const { deleteTikTokAccount } = require('./db');
  deleteTikTokAccount(req.params.id);
  res.json({ success: true });
});

// POST /api/tiktok/post — post a generated short to TikTok
// body: { projectId, folderId, apiKey, caption?, tiktokAccountId? }
app.post('/api/tiktok/post', requireAuth, async (req, res) => {
  const { projectId, folderId, apiKey, caption, tiktokAccountId } = req.body;

  if (!projectId || !folderId || !apiKey) {
    return res.status(400).json({ success: false, error: 'Field wajib: projectId, folderId, apiKey' });
  }

  let tiktokUsername, tiktokPassword;

  if (tiktokAccountId) {
    const { getTikTokAccounts } = require('./db');
    const accounts = getTikTokAccounts();
    const account = accounts.find(a => a.id === tiktokAccountId);
    if (!account) {
      return res.status(400).json({ success: false, error: 'TikTok account not found' });
    }
    tiktokUsername = account.username;
    tiktokPassword = account.password;
  } else {
    tiktokUsername = process.env.TIKTOK_USERNAME;
    tiktokPassword = process.env.TIKTOK_PASSWORD;
  }

  if (!tiktokUsername || !tiktokPassword) {
    return res.status(400).json({
      success: false,
      error: 'TikTok credentials belum diatur. Tambah akun di Settings atau set TIKTOK_USERNAME/TIKTOK_PASSWORD di .env',
    });
  }

  try {
    const videoUrl = await getVideoUrl(apiKey, folderId, projectId);

    const extraHashtags = '#fyp #izinpost #clipper';
    const fullCaption = caption ? `${caption}\n${extraHashtags}` : extraHashtags;
    const result = await postToTikTok(videoUrl, fullCaption, {
      username: tiktokUsername,
      password: tiktokPassword,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Job Management API ───────────────────────────────────────────────

// POST /api/jobs — Submit a new clip generation job
app.post('/api/jobs', requireAuth, async (req, res) => {
  const { url, apiKey, count, briefing, presetName, preset, captionStyle, stylePresetId, behalfToken, autoEdit, autoEditConfig } = req.body;
  if (!url || !apiKey) return res.status(400).json({ error: 'url and apiKey required' });

  // Check one-time key validity
  const keyData = getKeyByApiKey(apiKey);
  if (keyData && keyData.type === 'onetime' && keyData.used) {
    return res.status(403).json({ error: 'API key sudah digunakan. Buat key baru untuk pemakaian berikutnya.' });
  }

  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const job = {
    id,
    url,
    apiKey,
    count: Math.min(parseInt(count) || 5, 20),
    briefing: briefing || '',
    presetName: presetName || 'Custom',
    preset: preset || {},
    captionStyle: captionStyle || 'bold',
    stylePresetId: stylePresetId || '',
    behalfToken: behalfToken || '',
    autoEdit: autoEdit === true,
    autoEditConfig: autoEditConfig || {},
    status: 'pending',
    message: 'Queued...',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    results: [],
    stats: {},
  };

  createJob(job);
  startJob(job);

  res.json({ success: true, jobId: id });
});

// GET /api/jobs — List all jobs (with error details)
app.get('/api/jobs', requireAuth, (req, res) => {
  const jobs = getAllJobs().map(j => ({
    id: j.id, url: j.url, presetName: j.presetName, count: j.count,
    status: j.status, message: j.message, stats: j.stats,
    error: j.error || null, errorNote: j.errorNote || null,
    clipsTotal: j.clipsTotal || 0, exportsTotal: j.exportsTotal || 0,
    taskId: j.taskId || null,
    createdAt: j.createdAt, endedAt: j.endedAt,
  }));
  res.json({ jobs });
});

// GET /api/jobs/:id — Get single job with full results
app.get('/api/jobs/:id', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

// DELETE /api/jobs/:id — Delete a job
app.delete('/api/jobs/:id', requireAuth, (req, res) => {
  const { deleteJob } = require('./db');
  deleteJob(req.params.id);
  res.json({ success: true });
});

// GET /api/jobs/:id/stream — SSE stream for job progress
app.get('/api/jobs/:id/stream', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const keepalive = sseKeepalive(res);

  // Send current state
  res.write(`data: ${JSON.stringify({ event: 'init', data: job })}\n\n`);

  // Subscribe to updates
  const unsubscribe = subscribeJob(req.params.id, (update) => {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
    if (update.event === 'done' || update.event === 'error') {
      setTimeout(() => { try { res.end(); } catch {} }, 500);
    }
  });

  req.on('close', () => {
    clearInterval(keepalive);
    unsubscribe();
  });
});

// ── Video Editor API ──────────────────────────────────────────────────

// POST /api/video/edit — full video editing pipeline
app.post('/api/video/edit', requireAuth, async (req, res) => {
  const {
    videoUrl,
    videoPath,
    segments,
    textLayers = [],
    imageLayers = [],
    shapeLayers = [],
    effects = {},
    transition = { type: 'none', duration: 0.3 },
    title = '',
    subtitle = '',
    introDuration = 3,
    introVideo,
    bgm,
    bgmVolume = 0.15,
    fadeIn = 0.3,
    fadeOut = 0.5,
    template = '',
    style = null,
    background = null,
    titleColor = null,
    subtitleColor = null,
    titleSize = null,
    subtitleSize = null,
    position = null,
    trimStart,
    trimEnd,
    aspectRatio = '',
    freezeFrame = null,
  } = req.body;

  if (!videoUrl && !videoPath) {
    return res.status(400).json({ success: false, error: 'videoUrl atau videoPath wajib diisi' });
  }

  try {
    const path = require('path');
    const fs = require('fs');

    // Resolve image layer data URLs (they're base64 in the request)
    const resolvedImageLayers = imageLayers.map(l => ({
      ...l,
      src: l.src || '',
    }));

    const result = await fullEdit({
      videoUrl,
      videoPath,
      segments,
      textLayers,
      imageLayers: resolvedImageLayers,
      shapeLayers,
      effects,
      transition,
      title,
      subtitle,
      introDuration,
      introVideo: introVideo ? path.join(__dirname, 'intros', introVideo) : '',
      bgmPath: bgm ? path.join(__dirname, 'music', bgm) : '',
      bgmVolume,
      fadeIn,
      fadeOut,
      template,
      style,
      background,
      titleColor,
      subtitleColor,
      titleSize,
      subtitleSize,
      position,
      trimStart,
      trimEnd,
      aspectRatio,
      freezeFrame,
    });

    res.json({
      success: true,
      outputPath: `/api/video/download/${result.fileName}`,
      fileName: result.fileName,
      duration: result.duration,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/video/download/:file — serve edited video
app.get('/api/video/download/:file', requireAuth, (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const filePath = path.join(__dirname, 'output', req.params.file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});

// POST /api/video/upload-image — upload image overlay
app.post('/api/video/upload-image', requireAuth, async (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const imgDir = path.join(__dirname, 'downloads', 'uploads');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    const busboy = require('busboy');
    let filePath = '';
    const bb = busboy({ headers: req.headers });
    bb.on('file', (fieldname, file, info) => {
      const ext = path.extname(info.filename) || '.png';
      const name = `img_${Date.now()}${ext}`;
      filePath = path.join(imgDir, name);
      const ws = fs.createWriteStream(filePath);
      file.pipe(ws);
    });
    bb.on('finish', () => {
      if (filePath && fs.existsSync(filePath)) {
        res.json({ success: true, path: `/api/video/download-img/${path.basename(filePath)}` });
      } else {
        res.status(400).json({ error: 'No file uploaded' });
      }
    });
    bb.on('error', (err) => res.status(500).json({ error: err.message }));
    req.pipe(bb);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video/download-img/:file — serve uploaded image
app.get('/api/video/download-img/:file', requireAuth, (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const filePath = path.join(__dirname, 'downloads', 'uploads', req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// GET /api/video/music — list available BGM tracks
app.get('/api/video/music', requireAuth, (req, res) => {
  const fs = require('fs');
  const musicDir = path.join(__dirname, 'music');
  if (!fs.existsSync(musicDir)) {
    return res.json({ tracks: [] });
  }
  const files = fs.readdirSync(musicDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
  res.json({ tracks: files });
});

// GET /api/video/templates — list available title templates
app.get('/api/video/templates', requireAuth, (req, res) => {
  const { TITLE_TEMPLATES } = require('./video-editor');
  res.json({ templates: Object.keys(TITLE_TEMPLATES) });
});

// GET /api/video/intros — list available intro videos
app.get('/api/video/intros', requireAuth, (req, res) => {
  const fs = require('fs');
  const introsDir = path.join(__dirname, 'intros');
  if (!fs.existsSync(introsDir)) return res.json({ intros: [] });
  const files = fs.readdirSync(introsDir).filter(f => /\.(mp4|mov|avi|webm)$/i.test(f));
  res.json({ intros: files });
});

// POST /api/video/waveform — extract audio waveform data from video URL
app.post('/api/video/waveform', requireAuth, async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' });

  try {
    const { downloadVideo, getVideoInfo } = require('./video-editor');
    const fs = require('fs');
    const waveformDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(waveformDir)) fs.mkdirSync(waveformDir, { recursive: true });

    const localPath = path.join(waveformDir, `waveform_${Date.now()}.mp4`);
    await downloadVideo(videoUrl, localPath);

    const info = getVideoInfo(localPath);
    const numPoints = 200;
    const duration = info.duration || 1;

    let points = new Array(numPoints).fill(0);

    if (info.hasAudio) {
      const wavPath = localPath.replace('.mp4', '.wav');
      const { execFileSync } = require('child_process');
      try {
        execFileSync('ffmpeg', [
          '-y', '-i', localPath,
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ar', '22050',
          '-ac', '1',
          wavPath,
        ], { stdio: 'pipe' });

        const buf = fs.readFileSync(wavPath);
        const samples = new Int16Array(buf.buffer, 44);
        const samplesPerPoint = Math.max(1, Math.floor(samples.length / numPoints));

        points = [];
        for (let i = 0; i < numPoints; i++) {
          const start = i * samplesPerPoint;
          const end = Math.min(start + samplesPerPoint, samples.length);
          let max = 0;
          for (let j = start; j < end; j++) {
            const abs = Math.abs(samples[j]);
            if (abs > max) max = abs;
          }
          points.push(max / 32768);
        }

        try { fs.unlinkSync(wavPath); } catch {}
      } catch (e) {
        console.error('[waveform] Audio extraction failed:', e.message);
      }
    }

    // Cleanup
    try { fs.unlinkSync(localPath); } catch {}

    res.json({ success: true, points, duration, sampleRate: 22050 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/video/preview — quick preview render (first 5s, low-res)
app.post('/api/video/preview', requireAuth, async (req, res) => {
  const {
    videoUrl,
    title = '',
    subtitle = '',
    introDuration = 3,
    introVideo,
    bgm,
    bgmVolume = 0.15,
    template = '',
    style = null,
    background = null,
    titleColor = null,
    subtitleColor = null,
    titleSize = null,
    subtitleSize = null,
    position = null,
  } = req.body;

  if (!videoUrl) return res.status(400).json({ success: false, error: 'videoUrl required' });

  try {
    const fs = require('fs');
    const { execFileSync } = require('child_process');
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const previewKey = `preview_${Date.now()}`;
    const downloadPath = path.join(outputDir, `${previewKey}_src.mp4`);

    // Download first 5s at low res for speed
    const { downloadVideo } = require('./video-editor');
    await downloadVideo(videoUrl, downloadPath);

    const previewPath = path.join(outputDir, `${previewKey}_preview.mp4`);

    // Build drawtext filter
    const W = 540; const H = 960;
    const titleSizePx = Math.round(W * (titleSize ? titleSize / 100 : 0.07));
    const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    const titleEsc = (title || '').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/:/g, '\\:');
    const color = titleColor || '#ffffff';

    let filter = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`;
    if (titleEsc) {
      filter += `,drawtext=text='${titleEsc}':fontfile=${font}:fontsize=${titleSizePx}:fontcolor=${color}:x=(w-text_w)/2:y=(h-text_h)/2`;
    }

    // Quick render with low preset
    const args = [
      '-y', '-ss', '0', '-t', '5',
      '-i', downloadPath,
      '-filter_complex', filter,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
      '-an',
      '-shortest',
      previewPath,
    ];

    execFileSync('ffmpeg', args, { stdio: 'pipe', timeout: 30000 });

    // Cleanup source
    try { fs.unlinkSync(downloadPath); } catch {}

    res.json({
      success: true,
      outputPath: `/api/video/download/${path.basename(previewPath)}`,
      fileName: path.basename(previewPath),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/video/test — quick test edit with sample params
app.post('/api/video/test', requireAuth, async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' });
  try {
    const result = await fullEdit({
      videoUrl,
      title: 'Viral Clip',
      subtitle: 'Powered by AI',
      introDuration: 3,
      fadeIn: 0.3,
      fadeOut: 0.5,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Klap API Proxy (bypass CORS) ──────────────────────────────────────
// Dashboard calls /api/klap/*, server forwards to https://api.klap.app/v2/*

app.use('/api/klap', async (req, res) => {
  const url = `https://api.klap.app/v2${req.path}`;
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });

  const headers = {
    'Authorization': auth,
    'Content-Type': 'application/json',
    ...(req.headers['x-on-behalf-of'] ? { 'X-On-Behalf-Of': req.headers['x-on-behalf-of'] } : {}),
  };

  const options = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    options.body = JSON.stringify(req.body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Webhook:    http://localhost:${PORT}/api/webhook/process-form`);
  console.log(`Video Edit: http://localhost:${PORT}/api/video/edit`);
  console.log(`Music:      http://localhost:${PORT}/api/video/music`);
  console.log(`Dashboard:  http://localhost:${PORT}/`);
  console.log(`Login:      http://localhost:${PORT}/login.html`);
});

// No timeout for SSE connections (default Node.js is 2min)
server.timeout = 0;
