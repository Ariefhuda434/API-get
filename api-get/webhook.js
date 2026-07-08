const KLAP_API = 'https://api.klap.app/v2';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// POST /tasks/video-to-shorts
async function createShortsTask(apiKey, sourceVideoUrl, targetClipCount, transcriptionContext) {
  const body = {
    source_video_url: sourceVideoUrl,
    target_clip_count: targetClipCount || 10,
    editing_options: {
      captions: true,
      reframe: true,
    },
  };

  if (transcriptionContext) {
    body.transcription_context = transcriptionContext;
  }

  const res = await fetch(`${KLAP_API}/tasks/video-to-shorts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Klap API error (${res.status}): ${err}`);
  }

  return res.json();
}

// Poll GET /tasks/{taskId} until ready/error
async function pollTask(apiKey, taskId, interval = 5000, maxRetries = 120) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(`${KLAP_API}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Klap poll error (${res.status}): ${err}`);
    }

    const task = await res.json();

    if (task.status === 'ready' || task.status === 'error') {
      return task;
    }

    await sleep(interval);
  }

  throw new Error(`Timeout: task ${taskId} still processing after ${(interval * maxRetries) / 1000}s`);
}

// GET /projects/{folderId}
async function getProjects(apiKey, folderId) {
  const res = await fetch(`${KLAP_API}/projects/${folderId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Klap projects error (${res.status}): ${err}`);
  }

  return res.json();
}

async function processFormSubmission({ apiKey, linkYt, mauBerapaBanyak, tambahkanBriefing }, onProgress = () => {}) {
  onProgress({ step: 'analyze', message: 'Menganalisis video...' });
  const task = await createShortsTask(apiKey, linkYt, mauBerapaBanyak, tambahkanBriefing);
  onProgress({ step: 'analyze', message: 'Task created', data: { taskId: task.id, status: task.status } });

  onProgress({ step: 'poll', message: 'Menunggu hasil analisis...' });
  const completedTask = await pollTask(apiKey, task.id);
  onProgress({
    step: 'poll',
    message: completedTask.status === 'ready' ? 'Analisis selesai' : 'Analisis gagal',
    data: { taskId: task.id, status: completedTask.status },
  });

  if (completedTask.status === 'error') {
    throw new Error(`Task ${task.id} failed with status error`);
  }

  onProgress({ step: 'output', message: 'Mengambil hasil...' });
  const projects = await getProjects(apiKey, completedTask.output_id);
  onProgress({ step: 'output', message: 'Hasil siap', data: { count: projects.length } });

  return { task: completedTask, projects };
}

// POST /projects/{folderId}/{projectId}/exports
async function exportProject(apiKey, folderId, projectId) {
  const res = await fetch(`${KLAP_API}/projects/${folderId}/${projectId}/exports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Klap export error (${res.status}): ${err}`);
  }

  return res.json();
}

// GET /projects/{folderId}/{projectId}/exports/{exportId}
async function pollExport(apiKey, folderId, projectId, exportId, interval = 5000, maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(`${KLAP_API}/projects/${folderId}/${projectId}/exports/${exportId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Klap export poll error (${res.status}): ${err}`);
    }

    const exportRes = await res.json();

    if (exportRes.status === 'ready' || exportRes.status === 'error') {
      return exportRes;
    }

    await sleep(interval);
  }

  throw new Error(`Timeout: export ${exportId} still processing after ${(interval * maxRetries) / 1000}s`);
}

// Export project + poll until done, returns src_url
async function getVideoUrl(apiKey, folderId, projectId) {
  const exportTask = await exportProject(apiKey, folderId, projectId);
  const completed = await pollExport(apiKey, folderId, projectId, exportTask.id);

  if (completed.status === 'error') {
    throw new Error('Export failed');
  }

  return completed.src_url;
}

module.exports = {
  createShortsTask, pollTask, getProjects, processFormSubmission,
  exportProject, pollExport, getVideoUrl,
};
