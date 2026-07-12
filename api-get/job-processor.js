const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { createJob, updateJob, getJob, updateKeyCreditByApiKey } = require('./db');
const { trimAndUpload } = require('./video-trimmer');
const { fullEdit } = require('./video-editor');

const jobEmitter = new EventEmitter();
const JOB_EVENT = 'job-update';
const ACTIVE_JOBS = new Map();

const RETRIED_JOBS = new Set(); // jobs that already had a trim retry

// ── Klap API helper ───────────────────────────────────────────────────
async function klap(method, path, apiKey, body, behalfToken) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (behalfToken) headers['X-On-Behalf-Of'] = behalfToken;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(`https://api.klap.app/v2${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_code || data.message || data.error || `Klap API error: ${res.status}`);
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Emit SSE events ───────────────────────────────────────────────────
function emit(jobId, event, data) {
  jobEmitter.emit(`${JOB_EVENT}:${jobId}`, { jobId, event, data, ts: Date.now() });
}

// ── Main processing pipeline ──────────────────────────────────────────
function startJob(jobData) {
  const { id, apiKey, url, preset, briefing, count, captionStyle, stylePresetId, behalfToken } = jobData;

  // Spawn async processing (don't await - runs in background)
  processJob(id).catch(err => {
    console.error(`[Job ${id}] Fatal:`, err.message);
    try {
      updateJob(id, { status: 'error', error: err.message, endedAt: new Date().toISOString() });
      emit(id, 'error', err.message);
    } catch {}
    ACTIVE_JOBS.delete(id);
  });

  return id;
}

async function processJob(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error('Job not found');
  return processJobWithData(jobId, job);
}

async function processJobWithData(jobId, job) {
  if (!job) throw new Error('Job not found');

  emit(jobId, 'status', 'Starting...');

  const { apiKey, url, preset, briefing, count, captionStyle, stylePresetId, behalfToken } = job;

  try {
    // Step 1: Analyze video
    emit(jobId, 'step', 'Menganalisa video...');
    updateJob(jobId, { status: 'analyzing', message: 'Menganalisa video...' });

    const editingOptions = {
      captions: preset.captions !== false,
      reframe: preset.reframe !== false,
      emojis: preset.emojis !== false,
      remove_silences: preset.remove_silences !== false,
      intro_title: preset.intro_title === true,
    };

    const clipCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);
    const body = {
      source_video_url: url,
      language: 'id',
      transcription_context: briefing || preset.context_prefix || '',
      target_clip_count: clipCount,
      max_clip_count: clipCount,
      editing_options: editingOptions,
      min_duration: preset.min_duration || 15,
      max_duration: preset.max_duration || 60,
      target_duration: preset.target_duration || 30,
    };
    if (stylePresetId) body.style_preset_id = stylePresetId;

    const task = await klap('POST', '/tasks/video-to-shorts', apiKey, body, behalfToken);
    if (!task.id) throw new Error('Failed to create task - no ID returned');

    updateJob(jobId, { taskId: task.id, status: 'processing', message: 'Memproses video...' });

    // Step 2: Poll task until ready
    emit(jobId, 'step', 'Menunggu hasil analisa...');
    let taskResult;
    for (let i = 0; i < 120; i++) {
      await sleep(5000);
      taskResult = await klap('GET', `/tasks/${task.id}`, apiKey, null, behalfToken);
      if (taskResult.status === 'ready') break;
      if (taskResult.status === 'error') throw new Error('Task failed: ' + (taskResult.error || taskResult.message || 'Unknown error'));
      emit(jobId, 'progress', `Processing... (${i * 5 + 5}s)`);
    }
    if (!taskResult || taskResult.status !== 'ready') throw new Error('Task timeout after 10 minutes');

    const folderId = taskResult.output_id;
    if (!folderId) throw new Error('No output_id in completed task');

    updateJob(jobId, { folderId, status: 'fetching', message: 'Mendapatkan klip...' });
    emit(jobId, 'step', 'Mendapatkan daftar klip...');

    // Step 3: Get projects (shorts ideas)
    const projects = await klap('GET', `/projects/${folderId}`, apiKey, null, behalfToken);
    const items = Array.isArray(projects) ? projects : (projects.items || projects.data || []);

    if (!items.length) throw new Error('No clips generated');

    // Sort by virality
    const sorted = items.sort((a, b) => (b.virality_score || 0) - (a.virality_score || 0));

    updateJob(jobId, {
      status: 'exporting',
      message: `Exporting ${Math.min(count, sorted.length)} klip...`,
      clipsTotal: sorted.length,
    });

    // Step 4: Create exports for top clips
    const exportTargets = [];
    const clipLimit = Math.min(count || 5, sorted.length);

    for (let i = 0; i < clipLimit; i++) {
      const clip = sorted[i];
      try {
        const exportResult = await klap(
          'POST', `/projects/${folderId}/${clip.id}/exports`,
          apiKey, {}, behalfToken
        );
        exportTargets.push({
          clipId: clip.id,
          exportId: exportResult.id,
          name: clip.name || `Clip ${i + 1}`,
          viralityScore: clip.virality_score || 0,
          viralityExplanation: clip.virality_score_explanation || '',
        });
        emit(jobId, 'export_created', `Export ${i + 1}/${clipLimit}: ${exportTargets[i].name}`);
      } catch (e) {
        console.error(`[Job ${jobId}] Export failed for clip ${clip.id}:`, e.message);
      }
    }

    if (!exportTargets.length) throw new Error('All exports failed');

    updateJob(jobId, {
      status: 'finalizing',
      message: `Menunggu ${exportTargets.length} export selesai...`,
      exportsTotal: exportTargets.length,
    });

    // Step 5: Poll exports until ready
    const results = [];
    for (let i = 0; i < exportTargets.length; i++) {
      const target = exportTargets[i];
      emit(jobId, 'step', `Menunggu export ${i + 1}/${exportTargets.length}: ${target.name}`);

      let exportResult;
      for (let j = 0; j < 60; j++) {
        await sleep(5000);
        try {
          exportResult = await klap(
            'GET', `/projects/${folderId}/${target.clipId}/exports/${target.exportId}`,
            apiKey, null, behalfToken
          );
        } catch {
          continue;
        }
        if (exportResult.status === 'ready') break;
        if (exportResult.status === 'error') {
          target.error = exportResult.error || 'Export failed';
          break;
        }
      }

      results.push({
        name: target.name,
        src_url: exportResult?.src_url || '',
        status: exportResult?.status || 'error',
        viralityScore: target.viralityScore,
        viralityExplanation: target.viralityExplanation,
        error: target.error || null,
      });

      emit(jobId, 'export_done', `${target.name}: ${results[i].status}`);
    }

    // Step 5b: Auto-edit if enabled
    if (job.autoEdit) {
      const aeConfig = job.autoEditConfig || {};
      emit(jobId, 'step', 'Auto-editing clips...');
      updateJob(jobId, { status: 'auto_editing', message: 'Memproses auto-edit...' });

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status !== 'ready' || !r.src_url) continue;
        emit(jobId, 'step', `Auto-edit ${i + 1}/${results.length}: ${r.name}`);

        try {
          const editResult = await fullEdit({
            videoUrl: r.src_url,
            title: aeConfig.title || '',
            subtitle: aeConfig.subtitle || '',
            introDuration: aeConfig.introDuration || 3,
            introVideo: aeConfig.introVideo ? path.join(__dirname, 'intros', aeConfig.introVideo) : '',
            bgmPath: aeConfig.bgmPath ? path.join(__dirname, 'music', aeConfig.bgmPath) : '',
            bgmVolume: aeConfig.bgmVolume || 0.15,
            fadeIn: aeConfig.fadeIn !== undefined ? aeConfig.fadeIn : 0.3,
            fadeOut: aeConfig.fadeOut !== undefined ? aeConfig.fadeOut : 0.5,
            template: aeConfig.template || '',
            style: aeConfig.style || null,
            background: aeConfig.background || null,
            titleColor: aeConfig.titleColor || null,
            subtitleColor: aeConfig.subtitleColor || null,
            titleSize: aeConfig.titleSize || null,
            subtitleSize: aeConfig.subtitleSize || null,
            position: aeConfig.position || null,
            trimStart: aeConfig.trimStart,
            trimEnd: aeConfig.trimEnd,
          });

          if (editResult && editResult.outputPath) {
            const serverUrl = `http://localhost:${process.env.PORT || 3002}`;
            r.edited_src_url = `${serverUrl}/api/video/download/${editResult.fileName}`;
          }
        } catch (editErr) {
          console.error(`[Job ${jobId}] Auto-edit failed for ${r.name}:`, editErr.message);
          r.autoEditError = editErr.message;
        }
      }
    }

    // Calculate stats
    const completedResults = results.filter(r => r.status === 'ready');
    const avgVirality = completedResults.length
      ? completedResults.reduce((s, r) => s + (r.viralityScore || 0), 0) / completedResults.length
      : 0;
    const bestClip = completedResults.sort((a, b) => (b.viralityScore || 0) - (a.viralityScore || 0))[0] || null;

    const finalResult = {
      status: 'completed',
      message: 'Selesai!',
      endedAt: new Date().toISOString(),
      results,
      stats: {
        totalClips: clipLimit,
        completedClips: completedResults.length,
        failedClips: results.length - completedResults.length,
        avgVirality: Math.round(avgVirality * 100),
        bestClipName: bestClip?.name || '-',
        bestVirality: bestClip ? Math.round((bestClip.viralityScore || 0) * 100) : 0,
      },
    };

    updateJob(jobId, finalResult);
    emit(jobId, 'done', finalResult);

    // Deduct credit for used key
    try {
      const count = clipLimit || 5;
      updateKeyCreditByApiKey(apiKey, Math.min(count, 10));
    } catch(e) {}

  } catch (err) {
    const msg = err.message;
    console.error(`[Job ${jobId}] Error:`, msg);

    if (msg.includes('video_too_long') && !RETRIED_JOBS.has(jobId)) {
      RETRIED_JOBS.add(jobId);
      emit(jobId, 'step', 'Video terlalu panjang, memotong otomatis...');
      updateJob(jobId, { status: 'trimming', message: 'Memotong video ke 45 menit...' });

      const result = await trimAndUpload(url, ({ step, message }) => {
        emit(jobId, 'step', message);
        updateJob(jobId, { status: step, message });
      });

      if (result.trimmed && result.url) {
        emit(jobId, 'step', `Video dipotong (${Math.round(result.originalDuration / 60)}m → ${result.trimmedDuration / 60}m), ulang proses...`);
        updateJob(jobId, {
          url: result.url,
          status: 'retrying',
          message: 'Video sudah dipotong, memproses ulang...',
          trimmedUrl: result.url,
        });
        // Restart processing with the trimmed URL
        const newJob = { ...getJob(jobId), url: result.url };
        return processJobWithData(jobId, newJob);
      } else {
        const msg2 = `Video terlalu panjang (${Math.round((result.originalDuration || 0) / 60)} menit). Klap max ~45 menit untuk YouTube.`;
        updateJob(jobId, { status: 'error', error: msg2, errorNote: `video_too_long after trim: ${Math.round((result.originalDuration || 0) / 60)}m`, endedAt: new Date().toISOString() });
        emit(jobId, 'error', msg2);
        return;
      }
    }

    const detailNote = `Step: ${getJob(jobId)?.status || 'unknown'} | ${msg}`;
    const userMsg = msg.includes('payment-required') || msg.includes('Not enough credits')
      ? 'Kredit Klap tidak cukup. Top up di klap.app atau kurangi jumlah clips.'
      : msg.includes('yt_video_not_available')
      ? 'Video tidak tersedia di region Klap. Coba URL YouTube lain.'
      : msg;
    updateJob(jobId, { status: 'error', error: userMsg, errorNote: detailNote, endedAt: new Date().toISOString() });
    emit(jobId, 'error', userMsg);
  } finally {
    ACTIVE_JOBS.delete(jobId);
  }
}

function subscribeJob(jobId, callback) {
  const handler = (data) => callback(data);
  jobEmitter.on(`${JOB_EVENT}:${jobId}`, handler);
  return () => jobEmitter.removeListener(`${JOB_EVENT}:${jobId}`, handler);
}

function getActiveJob(jobId) {
  return ACTIVE_JOBS.has(jobId);
}

module.exports = { startJob, subscribeJob, getActiveJob };