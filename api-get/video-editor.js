const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const OUTPUT_DIR = path.join(__dirname, 'output');
const MUSIC_DIR = path.join(__dirname, 'music');
const INTROS_DIR = path.join(__dirname, 'intros');
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const TITLE_TEMPLATES = {
  default: {
    background: '#000000',
    titleColor: 'white',
    subtitleColor: 'gray',
    titleSize: 0.07,
    subtitleSize: 0.035,
    position: 'center',
    style: 'default',
  },
  podcast: {
    background: '#1a1a2e',
    titleColor: 'white',
    subtitleColor: '#a0a0cc',
    titleSize: 0.065,
    subtitleSize: 0.03,
    position: 'center',
    style: 'default',
  },
  podcast_quote: {
    background: '#ffffff',
    titleColor: '#000000',
    subtitleColor: '#333333',
    titleSize: 0.055,
    subtitleSize: 0.03,
    position: 'center',
    style: 'quote',
  },
  gaming: {
    background: '#1a0a2e',
    titleColor: '#ffdd00',
    subtitleColor: '#ff8800',
    titleSize: 0.08,
    subtitleSize: 0.035,
    position: 'center',
    style: 'default',
  },
  tutorial: {
    background: '#0a1628',
    titleColor: '#00d4ff',
    subtitleColor: '#cccccc',
    titleSize: 0.07,
    subtitleSize: 0.03,
    position: 'top',
    style: 'default',
  },
  minimal: {
    background: '#111111',
    titleColor: 'white',
    subtitleColor: '#888888',
    titleSize: 0.06,
    subtitleSize: 0.025,
    position: 'center',
    style: 'default',
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = execFile('ffmpeg', args, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
    proc.stderr.on('data', () => {});
  });
}

function downloadVideo(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const proto = parsedUrl.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(destPath);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://klap.app/',
      }
    };
    proto.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return downloadVideo(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${res.statusCode} from ${url}`));
      }
      const total = parseInt(res.headers['content-length'], 10) || 0;
      let downloaded = 0;
      res.on('data', (chunk) => { downloaded += chunk.length; });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        if (total > 0 && downloaded < total) {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          return reject(new Error(`Download incomplete: ${downloaded}/${total} bytes`));
        }
        resolve(destPath);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

function getVideoInfo(videoPath) {
  const output = execSync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
    { encoding: 'utf8' }
  );
  const info = JSON.parse(output);
  const videoStream = (info.streams || []).find(s => s.codec_type === 'video');
  const audioStream = (info.streams || []).find(s => s.codec_type === 'audio');
  return {
    duration: parseFloat(info.format?.duration || 0),
    width: videoStream?.width || 1080,
    height: videoStream?.height || 1920,
    fps: eval(videoStream?.r_frame_rate || '30/1'),
    hasAudio: !!audioStream,
    audioSampleRate: audioStream?.sample_rate || 44100,
  };
}

function escapeDrawText(text) {
  return text
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/:/g, '\\:');
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function makeConcatFile(paths, listPath) {
  const content = paths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, content, 'utf8');
}

async function addIntroTitle(inputPath, outputPath, options = {}) {
  const {
    title = 'Viral Clip',
    subtitle = '',
    duration = 3,
    fadeIn = 0.5,
    fadeOut = 0.5,
    template = '',
    style = null,
    background = null,
    titleColor = null,
    subtitleColor = null,
    titleSize = null,
    subtitleSize = null,
    position = null,
  } = options;

  const info = getVideoInfo(inputPath);
  const W = info.width;
  const H = info.height;
  const fps = info.fps;
  const titleEsc = escapeDrawText(title);
  const subEsc = escapeDrawText(subtitle);
  const tmpPath = outputPath.replace('.mp4', '_intro_tmp.mp4');

  // Resolve template
  const tmpl = { ...(TITLE_TEMPLATES[template] || TITLE_TEMPLATES.default) };
  if (style) tmpl.style = style;
  if (background) tmpl.background = background;
  if (titleColor) tmpl.titleColor = titleColor;
  if (subtitleColor) tmpl.subtitleColor = subtitleColor;
  if (titleSize) tmpl.titleSize = titleSize;
  if (subtitleSize) tmpl.subtitleSize = subtitleSize;
  if (position) tmpl.position = position;

  const bgHex = tmpl.background.replace('#', '');
  const fadeInFrames = Math.round(fadeIn * fps);
  const fadeOutStart = Math.round((duration - fadeOut) * fps);
  const fadeOutFrames = Math.round(fadeOut * fps);

  // ── Quote style (podcast quote with pause icon) ──────────────────────
  if (tmpl.style === 'quote') {
    const quoteMarkSize = Math.round(W * 0.18);
    const textSize = Math.round(W * 0.055);
    const marginX = Math.round(W * 0.1);
    const quoteY = Math.round(H * 0.15);
    const maxCharsPerLine = Math.round(W / textSize * 1.8);
    const lines = wrapText(title, Math.max(maxCharsPerLine, 15));
    const lineHeight = Math.round(textSize * 1.5);
    let startY = Math.round(H * 0.42 - (lines.length - 1) * lineHeight * 0.5);
    if (startY < Math.round(H * 0.38)) startY = Math.round(H * 0.38);
    const pauseIconSize = Math.round(Math.min(W, H) * 0.04);

    let filter = `color=c=0x${bgHex}:s=${W}x${H}:d=${duration}[bg]`;
    let prevLabel = 'bg';

    // Quote mark
    filter += `;[${prevLabel}]drawtext=text='\\"':fontfile=${FONT}:fontsize=${quoteMarkSize}:fontcolor=${tmpl.titleColor}:x=${marginX}:y=${quoteY}[q]`;
    prevLabel = 'q';

    // Title lines
    for (let i = 0; i < lines.length; i++) {
      const label = `t${i}`;
      const yPos = startY + i * lineHeight;
      filter += `;[${prevLabel}]drawtext=text='${escapeDrawText(lines[i])}':fontfile=${FONT}:fontsize=${textSize}:fontcolor=${tmpl.titleColor}:x=${marginX}:y=${yPos}[${label}]`;
      prevLabel = label;
    }

    // Subtitle
    if (subtitle) {
      const subY = startY + lines.length * lineHeight + Math.round(lineHeight * 0.5);
      filter += `;[${prevLabel}]drawtext=text='${subEsc}':fontfile=${FONT}:fontsize=${Math.round(W * tmpl.subtitleSize)}:fontcolor=${tmpl.subtitleColor}:x=${marginX}:y=${subY}[s]`;
      prevLabel = 's';
    }

    // Pause icon (bottom-right)
    const iconX = W - Math.round(pauseIconSize * 1.8);
    const iconY = H - Math.round(pauseIconSize * 1.8);
    filter += `;[${prevLabel}]drawtext=text='⏸':fontfile=${FONT}:fontsize=${pauseIconSize}:fontcolor=${tmpl.titleColor}@0.4:x=${iconX}:y=${iconY}`;

    // Fade
    filter += `,fade=in:0:${fadeInFrames},fade=out:${fadeOutStart}:${fadeOutFrames}[intro]`;
    filter += `;[0:v]setpts=PTS+${duration}/TB[mainv];[intro][mainv]concat=n=2:v=1:a=0[vid]`;

    const audioFilter = info.hasAudio
      ? `[0:a]adelay=${duration * 1000}|${duration * 1000}[a]`
      : '';

    const optAudio = info.hasAudio
      ? ['-map', '[a]', '-c:a', 'aac']
      : [];

    await ffmpeg([
      '-i', inputPath,
      '-filter_complex', filter + (audioFilter ? `;${audioFilter}` : ''),
      '-map', '[vid]',
      ...optAudio,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-y', tmpPath,
    ]);

    fs.renameSync(tmpPath, outputPath);
    return outputPath;
  }

  // ── Default style (solid background + centered title) ────────────────
  let titleY, subtitleY;
  if (tmpl.position === 'top') {
    titleY = Math.round(H * 0.15);
    subtitleY = titleY + Math.round(W * tmpl.titleSize * 1.4);
  } else if (tmpl.position === 'bottom') {
    titleY = Math.round(H * 0.7);
    subtitleY = titleY + Math.round(W * tmpl.titleSize * 1.4);
  } else {
    const centerY = H / 2;
    if (subtitle) {
      titleY = Math.round(centerY - W * tmpl.titleSize * 0.6);
      subtitleY = Math.round(centerY + W * tmpl.subtitleSize * 0.4);
    } else {
      titleY = Math.round(centerY - W * tmpl.titleSize * 0.15);
      subtitleY = Math.round(centerY + W * tmpl.subtitleSize * 0.4);
    }
  }

  const filter = (
    `color=c=0x${bgHex}:s=${W}x${H}:d=${duration}[bg];` +
    `[bg]drawtext=` +
      `text='${titleEsc}':` +
      `fontfile=${FONT}:` +
      `fontsize=${Math.round(W * tmpl.titleSize)}:` +
      `fontcolor=${tmpl.titleColor}:` +
      `x=(w-text_w)/2:y=${titleY}` +
    `${subtitle ? `,drawtext=text='${subEsc}':fontfile=${FONT}:fontsize=${Math.round(W * tmpl.subtitleSize)}:fontcolor=${tmpl.subtitleColor}:x=(w-text_w)/2:y=${subtitleY}` : ''}` +
    `,fade=in:0:${fadeInFrames},fade=out:${fadeOutStart}:${fadeOutFrames}[intro];` +
    `[0:v]setpts=PTS+${duration}/TB[mainv];` +
    `[intro][mainv]concat=n=2:v=1:a=0[vid]`
  );

  const audioFilter = info.hasAudio
    ? `[0:a]adelay=${duration * 1000}|${duration * 1000}[a]`
    : '';

  const optAudio = info.hasAudio
    ? ['-map', '[a]', '-c:a', 'aac']
    : [];

  await ffmpeg([
    '-i', inputPath,
    '-filter_complex', filter + (audioFilter ? `;${audioFilter}` : ''),
    '-map', '[vid]',
    ...optAudio,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-y', tmpPath,
  ]);

  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

async function concatIntro(inputPath, introPath, outputPath, options = {}) {
  const {
    crossfade = 0.3,
  } = options;

  const listPath = outputPath.replace('.mp4', '_concat_list.txt');
  const tmpPath = outputPath.replace('.mp4', '_concat_tmp.mp4');
  const info = getVideoInfo(inputPath);
  const introInfo = getVideoInfo(introPath);

  const hasAudio = info.hasAudio || introInfo.hasAudio;
  const introNeedsAudio = !introInfo.hasAudio && info.hasAudio;
  const mainNeedsAudio = !info.hasAudio && introInfo.hasAudio;

  let introAudioPath = introPath;
  let mainAudioPath = inputPath;

  if (introNeedsAudio) {
    const silentPath = introPath.replace('.mp4', '_silent.mp4');
    await ffmpeg([
      '-i', introPath,
      '-f', 'lavfi',
      '-i', `anullsrc=r=${info.audioSampleRate}:cl=stereo`,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y', silentPath,
    ]);
    introAudioPath = silentPath;
  }

  if (mainNeedsAudio) {
    const silentPath = inputPath.replace('.mp4', '_silent.mp4');
    await ffmpeg([
      '-i', inputPath,
      '-f', 'lavfi',
      '-i', `anullsrc=r=${introInfo.audioSampleRate}:cl=stereo`,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y', silentPath,
    ]);
    mainAudioPath = silentPath;
  }

  const finalIntro = introNeedsAudio ? introAudioPath : introPath;
  const finalMain = mainNeedsAudio ? mainAudioPath : inputPath;

  makeConcatFile([finalIntro, finalMain], listPath);

  await ffmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-y', tmpPath,
  ]);

  fs.unlinkSync(listPath);
  if (introAudioPath !== introPath) try { fs.unlinkSync(introAudioPath); } catch {}
  if (mainAudioPath !== inputPath) try { fs.unlinkSync(mainAudioPath); } catch {}

  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

async function addFadeInOut(inputPath, outputPath, options = {}) {
  const {
    fadeIn = 0.3,
    fadeOut = 0.5,
  } = options;

  const info = getVideoInfo(inputPath);
  const totalFrames = Math.round(info.duration * info.fps);
  const fadeOutStart = totalFrames - Math.round(fadeOut * info.fps);

  const tmpPath = outputPath.replace('.mp4', '_fade_tmp.mp4');

  const filter = `[0:v]fade=in:0:${Math.round(fadeIn * info.fps)},fade=out:${fadeOutStart}:${Math.round(fadeOut * info.fps)}[v]`;

  const audioFilter = info.hasAudio
    ? `;[0:a]afade=in:0:${Math.round(fadeIn * info.audioSampleRate)},afade=out:${Math.round((info.duration - fadeOut) * info.audioSampleRate)}:${Math.round(fadeOut * info.audioSampleRate)}[a]`
    : '';

  const args = [
    '-i', inputPath,
    '-filter_complex', filter + audioFilter,
    '-map', '[v]',
  ];

  if (info.hasAudio) args.push('-map', '[a]', '-c:a', 'aac');
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-y', tmpPath);

  await ffmpeg(args);
  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

async function addBackgroundMusic(inputPath, musicPath, outputPath, options = {}) {
  const {
    volume = 0.15,
    fadeIn = 1,
    fadeOut = 2,
  } = options;

  const info = getVideoInfo(inputPath);
  const tmpPath = outputPath.replace('.mp4', '_bgm_tmp.mp4');

  const musicDuration = info.duration + 1;
  const audioFadeIn = Math.round(fadeIn * info.audioSampleRate);
  const audioFadeOut = Math.round((musicDuration - fadeOut) * info.audioSampleRate);
  const fadeOutSamples = Math.round(fadeOut * info.audioSampleRate);

  if (info.hasAudio) {
    const filter = (
      `[1:a]volume=${volume},adelay=0|0,afade=in:0:${audioFadeIn},afade=out:${audioFadeOut}:${fadeOutSamples}[bgm];` +
      `[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`
    );

    await ffmpeg([
      '-i', inputPath,
      '-i', musicPath,
      '-filter_complex', filter,
      '-map', '0:v',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y', tmpPath,
    ]);
  } else {
    const filter = (
      `[1:a]volume=${volume},adelay=0|0,afade=in:0:${audioFadeIn},afade=out:${audioFadeOut}:${fadeOutSamples}[a]`
    );

    await ffmpeg([
      '-i', inputPath,
      '-i', musicPath,
      '-filter_complex', filter,
      '-map', '0:v',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y', tmpPath,
    ]);
  }

  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

async function fullEdit(options = {}) {
  const {
    videoUrl = '',
    videoPath = '',
    title = '',
    subtitle = '',
    introDuration = 3,
    introVideo = '',
    bgmPath = '',
    bgmVolume = 0.15,
    fadeIn = 0.3,
    fadeOut = 0.5,
    outputFileName = '',
    template = '',
    style = null,
    background = null,
    titleColor = null,
    subtitleColor = null,
    titleSize = null,
    subtitleSize = null,
    position = null,
  } = options;
  const introOptions = { template, style, background, titleColor, subtitleColor, titleSize, subtitleSize, position };

  ensureDir(DOWNLOAD_DIR);
  ensureDir(OUTPUT_DIR);

  let currentPath = videoPath;

  if (videoUrl && !videoPath) {
    const urlFileName = `download_${Date.now()}.mp4`;
    currentPath = path.join(DOWNLOAD_DIR, urlFileName);
    console.log(`[video-editor] Downloading: ${videoUrl}`);
    await downloadVideo(videoUrl, currentPath);
    console.log(`[video-editor] Downloaded to: ${currentPath}`);
  }

  if (!currentPath || !fs.existsSync(currentPath)) {
    throw new Error('No input video provided');
  }

  const baseName = outputFileName || `edited_${Date.now()}`;
  const step1Path = path.join(OUTPUT_DIR, `${baseName}_step1.mp4`);
  const step2Path = path.join(OUTPUT_DIR, `${baseName}_step2.mp4`);
  const step3Path = path.join(OUTPUT_DIR, `${baseName}_step3.mp4`);
  const stepbgmPath = path.join(OUTPUT_DIR, `${baseName}_bgm.mp4`);
  const finalPath = path.join(OUTPUT_DIR, `${baseName}.mp4`);

  let workingPath = currentPath;

  try {
    const hasTextIntro = title && title.trim();
    const hasCustomIntro = introVideo && fs.existsSync(introVideo);

    if (hasCustomIntro) {
      await concatIntro(workingPath, introVideo, step1Path, { crossfade: 0.3 });
      workingPath = step1Path;
    }

    if (hasTextIntro && !hasCustomIntro) {
      console.log('[video-editor] Adding intro title...');
      await addIntroTitle(workingPath, step2Path, {
        title,
        subtitle,
        duration: introDuration,
        fadeIn: 0.5,
        fadeOut: 0.5,
        ...introOptions,
      });
      workingPath = step2Path;
    }

    if (fadeIn > 0 || fadeOut > 0) {
      console.log('[video-editor] Adding fade in/out...');
      await addFadeInOut(workingPath, step3Path, { fadeIn, fadeOut });
      for (const p of [step1Path, step2Path]) {
        if (p !== workingPath && fs.existsSync(p)) try { fs.unlinkSync(p); } catch {}
      }
      workingPath = step3Path;
    }

    if (bgmPath && fs.existsSync(bgmPath)) {
      console.log('[video-editor] Adding background music...');
      await addBackgroundMusic(workingPath, bgmPath, stepbgmPath, {
        volume: bgmVolume,
        fadeIn: 1,
        fadeOut: 2,
      });
      for (const p of [step1Path, step2Path, step3Path]) {
        if (p !== workingPath && fs.existsSync(p)) try { fs.unlinkSync(p); } catch {}
      }
      workingPath = stepbgmPath;
    }

    if (workingPath !== finalPath) {
      if (workingPath !== currentPath) {
        fs.renameSync(workingPath, finalPath);
      } else {
        fs.copyFileSync(workingPath, finalPath);
      }
      workingPath = finalPath;
    }
  } catch (err) {
    for (const p of [step1Path, step2Path, step3Path, stepbgmPath, finalPath]) {
      if (p !== workingPath && fs.existsSync(p)) try { fs.unlinkSync(p); } catch {}
    }
    throw err;
  }

  if (!fs.existsSync(workingPath)) {
    throw new Error('Output file not found after editing');
  }

  return {
    outputPath: workingPath,
    fileName: path.basename(workingPath),
    duration: getVideoInfo(workingPath).duration,
  };
}

module.exports = {
  downloadVideo,
  addIntroTitle,
  concatIntro,
  addFadeInOut,
  addBackgroundMusic,
  fullEdit,
  getVideoInfo,
  TITLE_TEMPLATES,
};
