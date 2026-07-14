const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const OUTPUT_DIR = path.join(__dirname, 'output');
const MUSIC_DIR = path.join(__dirname, 'music');
const INTROS_DIR = path.join(__dirname, 'intros');
const FONT_DIR = path.join(__dirname, 'fonts');

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const FONT_MAP = {
  'Arial': { regular: '/usr/share/fonts/truetype/freefont/FreeSans.ttf', bold: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf' },
  'Helvetica': { regular: '/usr/share/fonts/truetype/freefont/FreeSans.ttf', bold: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf' },
  'Verdana': { regular: '/usr/share/fonts/truetype/freefont/FreeSans.ttf', bold: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf' },
  'Georgia': { regular: '/usr/share/fonts/truetype/freefont/FreeSerif.ttf', bold: '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf' },
  'Times New Roman': { regular: '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf', bold: '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf' },
  'Courier New': { regular: '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf', bold: '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf' },
  'Impact': { regular: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf', bold: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf' },
  'Comic Sans MS': { regular: '/usr/share/fonts/truetype/freefont/FreeSans.ttf', bold: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf' },
  'Montserrat': { regular: path.join(FONT_DIR, 'Montserrat-Regular.ttf'), bold: path.join(FONT_DIR, 'Montserrat-Bold.ttf') },
  'Poppins': { regular: path.join(FONT_DIR, 'Poppins-Regular.ttf'), bold: path.join(FONT_DIR, 'Poppins-Bold.ttf') },
  'Roboto': { regular: path.join(FONT_DIR, 'Roboto-Regular.ttf'), bold: path.join(FONT_DIR, 'Roboto-Bold.ttf') },
  'Oswald': { regular: path.join(FONT_DIR, 'Oswald-Regular.ttf'), bold: path.join(FONT_DIR, 'Oswald-Bold.ttf') },
  'Inter': { regular: path.join(FONT_DIR, 'Inter-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Bold.ttf') },
  'Raleway': { regular: path.join(FONT_DIR, 'Raleway-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Regular.ttf') },
  'Nunito': { regular: path.join(FONT_DIR, 'Nunito-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Regular.ttf') },
  'Open Sans': { regular: path.join(FONT_DIR, 'OpenSans-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Bold.ttf') },
  'Merriweather': { regular: path.join(FONT_DIR, 'Merriweather-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Bold.ttf') },
  'Playfair Display': { regular: path.join(FONT_DIR, 'PlayfairDisplay-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Bold.ttf') },
  'Lora': { regular: path.join(FONT_DIR, 'Lora-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Bold.ttf') },
  'Bebas Neue': { regular: path.join(FONT_DIR, 'BebasNeue-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Bold.ttf') },
  'Josefin Sans': { regular: path.join(FONT_DIR, 'JosefinSans-Regular.ttf'), bold: path.join(FONT_DIR, 'Inter-Bold.ttf') },
};

function getFontPath(fontName, isBold) {
  const entry = FONT_MAP[fontName];
  if (!entry) return FONT;
  if (isBold && entry.bold && fs.existsSync(entry.bold)) return entry.bold;
  if (entry.regular && fs.existsSync(entry.regular)) return entry.regular;
  return FONT;
}

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

function ffmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = execFile('ffmpeg', args, { maxBuffer: 1024 * 1024 * 100, timeout: opts.timeout || 600000 }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed && err.signal === 'SIGTERM') reject(new Error('FFmpeg timed out'));
        else reject(new Error(stderr || err.message));
      } else resolve(stdout);
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
  const fpsStr = `:r=${fps}`;

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

    let filter = `color=c=0x${bgHex}:s=${W}x${H}:d=${duration}${fpsStr}[bg]`;
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
      '-crf', '28',
      '-y', tmpPath,
    ], { timeout: 120000 });

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
    `color=c=0x${bgHex}:s=${W}x${H}:d=${duration}${fpsStr}[bg];` +
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
    '-crf', '28',
    '-y', tmpPath,
  ], { timeout: 120000 });

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

// ── Trim Helper ────────────────────────────────────────────────────────
async function trimVideo(inputPath, outputPath, startTime, endTime) {
  const duration = endTime - startTime;
  await ffmpeg([
    '-y', '-ss', String(startTime), '-i', inputPath,
    '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    '-c:a', 'aac',
    outputPath,
  ]);
}

function normalizeHexColor(c) {
  if (!c || typeof c !== 'string') return c;
  if (c.startsWith('#')) {
    if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    if (c.length === 5) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] + c[4] + c[4];
  }
  return c;
}

// ── Add Multiple Text Overlays ─────────────────────────────────────────
async function addTextOverlays(inputPath, outputPath, textLayers = [], options = {}) {
  const info = getVideoInfo(inputPath);
  const W = info.width;
  const H = info.height;
  if (!textLayers.length) return inputPath;

  const tmpDir = path.dirname(outputPath);
  let currentPath = inputPath;
  for (let i = 0; i < textLayers.length; i++) {
    const l = textLayers[i];
    const xPx = Math.round(W * (l.x || 0.5));
    const yPx = Math.round(H * (l.y || 0.5));
    const sizePx = Math.round(H * (l.size ? l.size / 100 : 0.07));
    const isBold = l.style === 'bold';
    const fontPath = getFontPath(l.font || 'Arial', isBold);
    const escapedText = escapeDrawText(l.text || '');
    const color = l.color || 'white';
    const opacity = l.opacity !== undefined ? l.opacity : 1;

    let borderW = 0;
    let borderC = 'white';
    let shadowX = 0;
    let shadowY = 0;
    let shadowC = 'black@0';
    if (l.style === 'bold') { /* handled via font selection */ }
    else if (l.style === 'outline') { borderW = 2; borderC = color === '#ffffff' ? 'black' : 'white'; }
    else if (l.style === 'shadow') { shadowX = 3; shadowY = 3; shadowC = 'black@0.8'; }
    else if (l.style === 'glow') { shadowX = 0; shadowY = 0; shadowC = `${color}@0.7`; }

    // Note: border-radius is preview-only (CSS on frontend). FFmpeg drawtext doesn't support rounded box.
    // The borderRadius field is received but ignored for export rendering.
    let box = 0;
    let boxcolor = 'black@0';
    if (l.bgOpacity && l.bgOpacity > 0) {
      box = 1;
      const bgCol = normalizeHexColor(l.bgColor || '#000000');
      boxcolor = `${bgCol}@${l.bgOpacity}`;
    }

    const passPath = i < textLayers.length - 1
      ? path.join(tmpDir, `_txt_l${i}.mp4`)
      : outputPath;

    const startT = l.startTime || 0;
    const endT = l.endTime || 999;
    const enableExpr = `:enable='between(t,${startT},${endT})'`;

    const args = [
      '-i', currentPath,
      '-vf', `drawtext=text='${escapedText}':fontfile=${fontPath}:fontsize=${sizePx}:fontcolor=${color}@${opacity}:x=${xPx}:y=${yPx}:box=${box}:boxcolor=${boxcolor}:borderw=${borderW}:bordercolor=${borderC}:shadowx=${shadowX}:shadowy=${shadowY}:shadowcolor=${shadowC}` + (l.spacing > 0 ? `:spacing=${l.spacing * 10}` : '') + enableExpr,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      info.hasAudio ? '-c:a' : null, info.hasAudio ? 'copy' : null,
      '-y', passPath,
    ].filter(v => v !== null);
    await ffmpeg(args);

    if (currentPath !== inputPath && currentPath !== outputPath && fs.existsSync(currentPath)) {
      try { fs.unlinkSync(currentPath); } catch {}
    }
    currentPath = passPath;
  }
  return outputPath;
}

// ── Add Image Overlays ─────────────────────────────────────────────────
async function addImageOverlays(inputPath, outputPath, imageLayers = []) {
  const info = getVideoInfo(inputPath);
  const W = info.width;
  const H = info.height;
  if (!imageLayers.length) return inputPath;

  const tmpPath = outputPath.replace('.mp4', '_img_tmp.mp4');
  const imgDir = path.join(DOWNLOAD_DIR, 'img_layers');
  ensureDir(imgDir);

  let filter = '';
  let inputCount = 1;
  let inputs = ['-i', inputPath];

  for (let i = 0; i < imageLayers.length; i++) {
    const l = imageLayers[i];
    if (!l.src) continue;
    const imgPath = path.join(imgDir, `layer_${i}_${Date.now()}.png`);

    // Decode base64 data URL or download from URL
    if (l.src.startsWith('data:')) {
      const b64 = l.src.split(',')[1];
      fs.writeFileSync(imgPath, Buffer.from(b64, 'base64'));
    } else if (l.src.startsWith('http://') || l.src.startsWith('https://')) {
      await downloadVideo(l.src, imgPath);
    } else if (l.src.startsWith('/')) {
      // Local server path - fetch from this server
      const localPath = path.join(__dirname, 'public', l.src.replace(/^\//, ''));
      if (fs.existsSync(localPath)) {
        fs.copyFileSync(localPath, imgPath);
      } else {
        continue;
      }
    } else {
      continue;
    }

    if (!fs.existsSync(imgPath)) continue;
    inputs.push('-i', imgPath);

    const xPx = Math.round(W * (l.x || 0.5) - (W * (l.size || 0.5)) / 2);
    const yPx = Math.round(H * (l.y || 0.5) - (H * (l.size || 0.5)) / 2);
    const imgW = Math.round(W * (l.size || 0.5));
    const opacity = l.opacity !== undefined ? l.opacity : 1;

    const label = `img${i}`;
    const prev = inputCount === 1 ? '0:v' : `${inputCount - 1}:v`;

    if (opacity < 1) {
      filter += `[${inputCount}:v]format=rgba,colorchannelmixer=aa=${opacity}[img${i}a];`;
      filter += `[${prev}][img${i}a]overlay=${xPx}:${yPx}[ov${i}];`;
      prevLabel = `ov${i}`;
    } else {
      filter += `[${prev}][${inputCount}:v]overlay=${xPx}:${yPx}[ov${i}];`;
    }
    inputCount++;
  }

  if (!filter) return inputPath;

  // Remove trailing ';' and final label
  const filterStr = filter.replace(/;\s*$/, '');
  const lastLabel = `ov${imageLayers.length - 1}`;

  const args = [
    ...inputs,
    '-filter_complex', `${filterStr}`,
    '-map', `[${lastLabel}]`,
  ];
  if (info.hasAudio) args.push('-map', '0:a', '-c:a', 'aac');
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-y', tmpPath);

  await ffmpeg(args);
  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

// ── Apply Video Effects ────────────────────────────────────────────────
async function addVideoEffects(inputPath, outputPath, effects = {}) {
  const info = getVideoInfo(inputPath);
  const {
    brightness = 0,
    contrast = 0,
    saturation = 0,
    blur = 0,
    grayscale = 0,
    sepia = 0,
  } = effects;

  if (!brightness && !contrast && !saturation && !blur && !grayscale && !sepia) {
    if (inputPath !== outputPath) fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const tmpPath = outputPath.replace('.mp4', '_efx_tmp.mp4');
  const filters = [];

  // Brightness/contrast/saturation via eq filter
  const bVal = 1 + brightness / 100;
  const cVal = 1 + contrast / 100;
  const sVal = 1 + saturation / 100;
  if (brightness !== 0 || contrast !== 0 || saturation !== 0) {
    filters.push(`eq=brightness=${bVal}:contrast=${cVal}:saturation=${sVal}`);
  }

  // Blur
  if (blur > 0) {
    filters.push(`boxblur=${blur}:${blur}`);
  }

  // Grayscale
  if (grayscale > 0) {
    const g = grayscale / 100;
    const r = 0.3 * g + 0.3 * (1 - g);
    const gv = 0.59 * g + 0.3 * (1 - g);
    const b = 0.11 * g + 0.3 * (1 - g);
    filters.push(`colorchannelmixer=.${Math.round(r * 1000)}:.${Math.round(gv * 1000)}:.${Math.round(b * 1000)}:0:.${Math.round(r * 1000)}:.${Math.round(gv * 1000)}:.${Math.round(b * 1000)}:0:.${Math.round(r * 1000)}:.${Math.round(gv * 1000)}:.${Math.round(b * 1000)}`);
  }

  // Sepia
  if (sepia > 0) {
    const s = sepia / 100;
    filters.push(`colorchannelmixer=.393:0.769:0.189:0:.349:0.686:0.168:0:.272:0.534:0.131`);
  }

  const filterStr = filters.join(',');
  const args = [
    '-i', inputPath,
    '-vf', filterStr,
    ...(info.hasAudio ? ['-c:a', 'aac'] : []),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-y', tmpPath,
  ];

  await ffmpeg(args);
  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

// ── Add Shape Overlays ────────────────────────────────────────────────
async function addShapeOverlays(inputPath, outputPath, shapes = []) {
  if (!shapes.length) {
    if (inputPath !== outputPath) fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const tmpPath = outputPath.replace('.mp4', '_shp_tmp.mp4');
  const info = getVideoInfo(inputPath);
  const W = info.width;
  const H = info.height;
  const dur = info.duration;

  const imgDir = path.join(DOWNLOAD_DIR, 'shape_layers');
  ensureDir(imgDir);

  let inputs = ['-i', inputPath];
  let filter = '';
  let overlayChain = '';
  let inputCount = 1;
  const overlaysToClean = [];

  for (const sh of shapes) {
    const sW = Math.round(W * (sh.width || 0.2));
    const sH = Math.round(H * (sh.height || 0.2));
    const cX = Math.round(W * (sh.x || 0.5));
    const cY = Math.round(H * (sh.y || 0.5));
    const xPx = cX - Math.round(sW / 2);
    const yPx = cY - Math.round(sH / 2);
    const color = sh.color || '#ffffff';
    const opacity = sh.opacity !== undefined ? sh.opacity : 1;
    const bw = sh.borderWidth || 0;
    const bc = sh.borderColor || color;

    const shapeImg = path.join(imgDir, `shape_${Date.now()}_${Math.random().toString(36).slice(2,6)}.png`);

    // Render shape to transparent PNG
    let shapeFilter = `color=c=0x00000000:s=${sW}x${sH}:d=0.04,format=rgba`;

    if (sh.shapeType === 'rectangle' || sh.shapeType === 'rect') {
      if (bw > 0) {
        shapeFilter += `,drawbox=x=0:y=0:w=${sW}:h=${sH}:color=${bc}@${opacity}:t=fill,drawbox=x=${bw}:y=${bw}:w=${sW-2*bw}:h=${sH-2*bw}:color=${color}@${opacity}:t=fill`;
      } else {
        shapeFilter += `,drawbox=x=0:y=0:w=${sW}:h=${sH}:color=${color}@${opacity}:t=fill`;
      }
    } else if (sh.shapeType === 'circle') {
      const cr = Math.min(sW, sH) / 2;
      shapeFilter += `,geq=lum='if(lte(pow(X-${sW/2},2)+pow(Y-${sH/2},2),${cr*cr}),255,0)':alpha='if(lte(pow(X-${sW/2},2)+pow(Y-${sH/2},2),${cr*cr}),255,0)'`;
    } else if (sh.shapeType === 'ellipse') {
      const rx = sW / 2, ry = sH / 2;
      shapeFilter += `,geq=lum='if(lte(pow(X-${sW/2},2)/${rx*rx}+pow(Y-${sH/2},2)/${ry*ry},1),255,0)':alpha='if(lte(pow(X-${sW/2},2)/${rx*rx}+pow(Y-${sH/2},2)/${ry*ry},1),255,0)'`;
    } else {
      // Unicode shapes for triangle, star, diamond, arrow, line
      const unicodeMap = { triangle: '▲', star: '★', diamond: '◆', arrow: '➤', line: '━' };
      const char = unicodeMap[sh.shapeType] || '●';
      const fontSize = Math.round(Math.min(sW, sH) * 0.9);
      shapeFilter += `,drawtext=text='${escapeDrawText(char)}':fontfile=${FONT}:fontsize=${fontSize}:fontcolor=${color}@${opacity}:x=(w-text_w)/2:y=(h-text_h)/2:borderw=${bw}:bordercolor=${bc}`;
    }

    if (sh.rotation && sh.rotation !== 0) {
      const rad = (sh.rotation * Math.PI) / 180;
      shapeFilter += `,rotate=${rad}:c=none`;
    }

    try {
      await ffmpeg([
        '-f', 'lavfi', '-i', shapeFilter,
        '-frames:v', '1',
        '-y', shapeImg,
      ], { timeout: 30000 });
    } catch (e) {
      continue;
    }

    if (!fs.existsSync(shapeImg)) continue;
    overlaysToClean.push(shapeImg);
    inputs.push('-i', shapeImg);

    const label = `shp${inputCount}`;
    const prev = inputCount === 1 ? '0:v' : `shp${inputCount - 1}`;
    const sStart = sh.startTime || 0;
    const sEnd = sh.endTime || 999;
    filter += `[${prev}][${inputCount}:v]overlay=${xPx}:${yPx}:enable='between(t,${sStart},${sEnd})'[${label}];`;
    inputCount++;
  }

  if (!filter) {
    if (inputPath !== outputPath) fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const lastLabel = `shp${inputCount - 1}`;
  const filterStr = filter.replace(/;\s*$/, '');
  const hasAudio = info.hasAudio;
  const args = [
    ...inputs,
    '-filter_complex', filterStr,
    '-map', `[${lastLabel}]`,
  ];
  if (hasAudio) args.push('-map', '0:a', '-c:a', 'aac');
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-y', tmpPath);

  await ffmpeg(args, { timeout: 120000 });
  fs.renameSync(tmpPath, outputPath);

  // Cleanup shape PNGs
  for (const p of overlaysToClean) {
    try { fs.unlinkSync(p); } catch {}
  }

  return outputPath;
}

// ── Apply Aspect Ratio Crop ────────────────────────────────────────────
async function applyAspectRatio(inputPath, outputPath, aspectRatio) {
  if (!aspectRatio || aspectRatio === 'none') {
    if (inputPath !== outputPath) fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const info = getVideoInfo(inputPath);
  const W = info.width;
  const H = info.height;

  const [rw, rh] = aspectRatio.split(':').map(Number);
  if (!rw || !rh) {
    if (inputPath !== outputPath) fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  const tmpPath = outputPath.replace('.mp4', '_ar_tmp.mp4');
  const sourceRatio = W / H;
  const targetRatio = rw / rh;

  if (Math.abs(sourceRatio - targetRatio) < 0.01) {
    // Already correct aspect ratio
    if (inputPath !== outputPath) fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  if (sourceRatio > targetRatio) {
    // Source is wider - crop horizontally to match target
    const cropW = Math.round(H * targetRatio);
    const cropX = Math.round((W - cropW) / 2);
    await ffmpeg([
      '-i', inputPath,
      '-vf', `crop=${cropW}:${H}:${cropX}:0`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      info.hasAudio ? '-c:a' : null, info.hasAudio ? 'aac' : null,
      '-y', tmpPath,
    ].filter(v => v !== null));
  } else {
    // Source is taller - crop vertically to match target
    const cropH = Math.round(W / targetRatio);
    if (cropH <= H) {
      const cropY = Math.round((H - cropH) / 2);
      await ffmpeg([
        '-i', inputPath,
        '-vf', `crop=${W}:${cropH}:0:${cropY}`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        info.hasAudio ? '-c:a' : null, info.hasAudio ? 'aac' : null,
        '-y', tmpPath,
      ].filter(v => v !== null));
    } else {
      // Scale down then pad
      const scaleH = Math.round(W / targetRatio);
      const padY = Math.round((scaleH - H) / 2);
      await ffmpeg([
        '-i', inputPath,
        '-vf', `scale=${W}:${scaleH}:force_original_aspect_ratio=decrease,pad=${W}:${scaleH}:0:${padY}:black`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        info.hasAudio ? '-c:a' : null, info.hasAudio ? 'aac' : null,
        '-y', tmpPath,
      ].filter(v => v !== null));
    }
  }

  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

// ── Extract Video Frame for Freeze Frame ──────────────────────────────
async function extractVideoFrame(videoPath, timeSec, outputPath) {
  await ffmpeg([
    '-ss', String(timeSec),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '2',
    '-y', outputPath,
  ], { timeout: 30000 });
}

// ── Create Freeze Frame Title Card ────────────────────────────────────
async function addFreezeFrameTitle(inputPath, freezeFrameImg, outputPath, options = {}) {
  const {
    duration = 3,
    template = '',
  } = options;

  const info = getVideoInfo(inputPath);
  const W = info.width;
  const H = info.height;
  const fps = info.fps || 30;
  const totalFrames = Math.round(duration * fps);
  const tmpPath = outputPath.replace('.mp4', '_ff_tmp.mp4');

  const fadeInFrames = Math.round(0.5 * fps);
  const fadeOutStart = Math.max(0, totalFrames - Math.round(0.5 * fps));
  const fadeOutFrames = Math.round(0.5 * fps);

  // Create intro from freeze frame image only (no title/subtitle baked in)
  let filter =
    `[1:v]scale=${W}:${H},loop=loop=${totalFrames - 1}:size=1,setpts=N/FRAME_RATE/TB[bg];` +
    `[bg]fade=in:0:${fadeInFrames},fade=out:${fadeOutStart}:${fadeOutFrames}[bgf]`;

  filter += `;[0:v]setpts=PTS+${duration}/TB[mainv]`;
  filter += `;[bgf][mainv]concat=n=2:v=1:a=0[vid]`;

  const hasAudio = info.hasAudio;
  let audioFilter = '';
  if (hasAudio) {
    audioFilter = `;[0:a]adelay=${Math.round(duration * 1000)}|${Math.round(duration * 1000)}[a]`;
  }

  const args = [
    '-i', inputPath,
    '-i', freezeFrameImg,
    '-filter_complex', filter + audioFilter,
    '-map', '[vid]',
  ];
  if (hasAudio) {
    args.push('-map', '[a]', '-c:a', 'aac');
  }
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-y', tmpPath);

  await ffmpeg(args, { timeout: 120000 });

  fs.renameSync(tmpPath, outputPath);

  try { if (fs.existsSync(freezeFrameImg)) fs.unlinkSync(freezeFrameImg); } catch {}

  return outputPath;
}

// ── Concat Multiple Segments with Transitions ─────────────────────────
async function concatWithTransitions(segmentPaths, outputPath, transitions = []) {
  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0], outputPath);
    return outputPath;
  }

  const tmpPath = outputPath.replace('.mp4', '_cat_tmp.mp4');

  // Build concat or xfade filter
  let filter = '';
  let inputs = [];

  for (let i = 0; i < segmentPaths.length; i++) {
    inputs.push('-i', segmentPaths[i]);
  }

  if (transitions.length === 0 || transitions.every(t => !t || t.type === 'none')) {
    // Simple concat
    const listPath = outputPath.replace('.mp4', '_concat.txt');
    makeConcatFile(segmentPaths, listPath);
    await ffmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac',
      '-y', tmpPath,
    ]);
    try { fs.unlinkSync(listPath); } catch {}
  } else {
    // Use xfade for each transition
    let totalDur = 0;
    const durInfo = segmentPaths.map(p => getVideoInfo(p).duration);
    const hasAnyAudio = segmentPaths.some(p => getVideoInfo(p).hasAudio);

    const filterParts = [];
    const audioParts = [];
    let audioCount = 0;

    for (let i = 0; i < segmentPaths.length; i++) {
      if (i === 0) {
        totalDur += durInfo[i];
        if (hasAnyAudio) {
          audioParts.push(`[0:a]adelay=0|0[as${audioCount}]`);
          audioCount++;
        }
        continue;
      }

      const trans = transitions[i - 1] || { type: 'crossfade', duration: 0.3 };
      const dur = Math.min(trans.duration || 0.3, durInfo[i - 1], durInfo[i]);
      const offset = Math.max(0, totalDur - dur);
      const xfadeType = trans.type === 'crossfade' ? 'fade' :
                         trans.type === 'fadeblack' ? 'fadeblack' :
                         trans.type === 'fadewhite' ? 'fadewhite' :
                         trans.type === 'slideleft' ? 'slideleft' :
                         trans.type === 'slideright' ? 'slideright' :
                         trans.type === 'slideup' ? 'slideup' :
                         trans.type === 'slidedown' ? 'slidedown' : 'fade';

      const prev = i === 1 ? `0:v` : `v${i - 1}`;
      filterParts.push(`[${prev}][${i}:v]xfade=transition=${xfadeType}:duration=${dur}:offset=${offset}[v${i}]`);

      if (hasAnyAudio) {
        audioParts.push(`[${i}:a]adelay=${totalDur * 1000}|${totalDur * 1000}[as${audioCount}]`);
        audioCount++;
      }

      totalDur += durInfo[i] - dur;
    }

    const lastIdx = segmentPaths.length - 1;
    const lastLabel = `[v${lastIdx}]`;
    let filterStr = filterParts.join(';');

    const args = [...inputs];

    if (hasAnyAudio && audioCount > 0) {
      const audioInputs = audioParts.map(s => s.split('[')[1].split(']')[0]);
      const audioStr = audioParts.join(';');
      filterStr = filterStr + ';' + audioStr + ';' + audioInputs.map(a => `[${a}]`).join('') + `amix=inputs=${audioCount}:duration=first[aud]`;
      args.push('-filter_complex', filterStr);
      args.push('-map', lastLabel, '-map', '[aud]');
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
      args.push('-c:a', 'aac', '-y', tmpPath);
    } else {
      args.push('-filter_complex', filterStr);
      args.push('-map', lastLabel);
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-y', tmpPath);
    }

    await ffmpeg(args);
  }

  fs.renameSync(tmpPath, outputPath);
  return outputPath;
}

// ── Full Edit Pipeline ─────────────────────────────────────────────────
async function fullEdit(options = {}) {
  const {
    videoUrl = '',
    videoPath = '',
    segments: inputSegments,
    textLayers = [],
    imageLayers = [],
    shapeLayers = [],
    effects = {},
    transition: globalTransition = { type: 'none', duration: 0.3 },
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
    trimStart,
    trimEnd,
    aspectRatio = '',
    freezeFrame = null,
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
  const finalPath = path.join(OUTPUT_DIR, `${baseName}.mp4`);
  const tempFiles = [];

  // Determine segments: use inputSegments or fall back to trimStart/trimEnd or full video
  let segs = [];
  if (inputSegments && inputSegments.length > 0) {
    segs = inputSegments;
  } else if (trimStart >= 0 || trimEnd > 0) {
    const dur = getVideoInfo(currentPath).duration;
    segs = [{ start: trimStart || 0, end: trimEnd || dur }];
  } else {
    const dur = getVideoInfo(currentPath).duration;
    segs = [{ start: 0, end: dur }];
  }

  let workingPath = '';

  try {
    // Step 1: Process each segment (trim + effects)
    const segmentPaths = [];
    const transitions = [];

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const segPath = path.join(OUTPUT_DIR, `${baseName}_seg${i}.mp4`);
      tempFiles.push(segPath);

      // Trim segment
      console.log(`[video-editor] Segment ${i}: ${seg.start}s → ${seg.end}s`);
      await trimVideo(currentPath, segPath, seg.start, seg.end);

      // Apply effects to this segment
      const efxPath = path.join(OUTPUT_DIR, `${baseName}_seg${i}_efx.mp4`);
      tempFiles.push(efxPath);
      await addVideoEffects(segPath, efxPath, effects);
      if (segPath !== efxPath) { try { fs.unlinkSync(segPath); } catch {} }

      segmentPaths.push(efxPath);

      // Collect transition for this boundary
      if (i > 0 && seg.transition) {
        transitions.push(seg.transition);
      } else if (i > 0) {
        transitions.push(globalTransition);
      }
    }

    // Step 2: Concat segments with transitions
    workingPath = path.join(OUTPUT_DIR, `${baseName}_concat.mp4`);
    tempFiles.push(workingPath);
    console.log(`[video-editor] Concatenating ${segmentPaths.length} segments with transitions`);
    await concatWithTransitions(segmentPaths, workingPath, transitions);

    // Cleanup segment files
    for (const p of segmentPaths) {
      if (p !== workingPath && fs.existsSync(p)) try { fs.unlinkSync(p); } catch {}
    }

    // Step 3: Add intro video
    const hasCustomIntro = introVideo && fs.existsSync(introVideo);
    if (hasCustomIntro) {
      const introPath = path.join(OUTPUT_DIR, `${baseName}_intro.mp4`);
      tempFiles.push(introPath);
      await concatIntro(workingPath, introVideo, introPath, { crossfade: 0.3 });
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = introPath;
    }

    // Step 4: Add title card (if no intro video) or freeze frame title
    const hasFreezeFrame = freezeFrame && freezeFrame.enabled;
    const hasTextIntro = title && title.trim();
    if (hasFreezeFrame && !hasCustomIntro) {
      const freezeTime = freezeFrame.time || 1;
      const freezeDur = freezeFrame.duration || 3;
      const freezeImg = path.join(OUTPUT_DIR, `${baseName}_freeze_frame.png`);
      tempFiles.push(freezeImg);
      try {
        await extractVideoFrame(workingPath, freezeTime, freezeImg);
        if (fs.existsSync(freezeImg)) {
          const ffPath = path.join(OUTPUT_DIR, `${baseName}_freeze_intro.mp4`);
          tempFiles.push(ffPath);
          await addFreezeFrameTitle(workingPath, freezeImg, ffPath, {
            duration: freezeDur,
            template,
          });
          try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
          workingPath = ffPath;
        }
      } catch (e) {
        console.log(`[video-editor] Freeze frame failed: ${e.message}, using text intro`);
      }
    } else if (hasTextIntro && !hasCustomIntro) {
      const titlePath = path.join(OUTPUT_DIR, `${baseName}_title.mp4`);
      tempFiles.push(titlePath);
      await addIntroTitle(workingPath, titlePath, {
        title, subtitle,
        duration: introDuration,
        fadeIn: 0.5, fadeOut: 0.5,
        ...introOptions,
      });
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = titlePath;
    }

    // Step 5: Add text overlays
    if (textLayers.length > 0) {
      const txtPath = path.join(OUTPUT_DIR, `${baseName}_text.mp4`);
      tempFiles.push(txtPath);
      console.log(`[video-editor] Adding ${textLayers.length} text overlays to ${workingPath}`);
      if (!fs.existsSync(workingPath)) {
        console.log(`[video-editor] ERROR: workingPath ${workingPath} does not exist!`);
        throw new Error('Working path missing before text overlays');
      }
      await addTextOverlays(workingPath, txtPath, textLayers);
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = txtPath;
    }

    // Step 6: Add image overlays
    if (imageLayers.length > 0) {
      const imgPath = path.join(OUTPUT_DIR, `${baseName}_img.mp4`);
      tempFiles.push(imgPath);
      await addImageOverlays(workingPath, imgPath, imageLayers);
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = imgPath;
    }

    // Step 7: Add shape overlays
    if (shapeLayers.length > 0) {
      const shpPath = path.join(OUTPUT_DIR, `${baseName}_shape.mp4`);
      tempFiles.push(shpPath);
      console.log(`[video-editor] Adding ${shapeLayers.length} shape overlays`);
      await addShapeOverlays(workingPath, shpPath, shapeLayers);
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = shpPath;
    }

    // Step 8: Fade in/out
    if (fadeIn > 0 || fadeOut > 0) {
      const fadePath = path.join(OUTPUT_DIR, `${baseName}_fade.mp4`);
      tempFiles.push(fadePath);
      await addFadeInOut(workingPath, fadePath, { fadeIn, fadeOut });
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = fadePath;
    }

    // Step 10: BGM
    if (bgmPath && fs.existsSync(bgmPath)) {
      const bgmOutPath = path.join(OUTPUT_DIR, `${baseName}_bgm.mp4`);
      tempFiles.push(bgmOutPath);
      await addBackgroundMusic(workingPath, bgmPath, bgmOutPath, {
        volume: bgmVolume, fadeIn: 1, fadeOut: 2,
      });
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = bgmOutPath;
    }

    // Step 11: Apply aspect ratio crop
    if (aspectRatio && aspectRatio !== 'none') {
      const arPath = path.join(OUTPUT_DIR, `${baseName}_ar.mp4`);
      tempFiles.push(arPath);
      console.log(`[video-editor] Applying aspect ratio: ${aspectRatio}`);
      await applyAspectRatio(workingPath, arPath, aspectRatio);
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = arPath;
    }

    // Finalize
    if (workingPath !== finalPath) {
      fs.renameSync(workingPath, finalPath);
      workingPath = finalPath;
    }
  } catch (err) {
    for (const p of tempFiles) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
    try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch {}
    throw err;
  }

  // Cleanup temp files
  for (const p of tempFiles) {
    try { if (fs.existsSync(p) && p !== finalPath) fs.unlinkSync(p); } catch {}
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

// ── Google Drive URL Resolver ───────────────────────────────────────────
function resolveDriveUrl(url) {
  if (url.includes('drive.google.com')) {
    const match = url.match(/\/file\/d\/([^/]+)/);
    if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
}

// ── Combine Videos from Brief ───────────────────────────────────────────
async function combineVideosFromBrief(brief) {
  const {
    urls = [], title = 'Untitled', caption = '', hashtags = [],
    keywords = '', products = [], aspectRatio = 'none',
    freezeFrame = null, font = 'Poppins', fontSize = 48,
    color = '#ffffff', bgColor = '#000000', bgOpacity = 60,
  } = brief;

  const baseName = 'brief_' + Date.now();
  const briefDir = path.join(OUTPUT_DIR, 'briefs');
  ensureDir(briefDir);
  const tempFiles = [];

  let progressCallback = brief._onProgress || (() => {});

  try {
    // Step 1: Download all videos
    progressCallback({ type: 'progress', text: 'Downloading videos...', percent: 5 });
    const videoPaths = [];
    for (let i = 0; i < urls.length; i++) {
      const url = resolveDriveUrl(urls[i].trim());
      const ext = path.extname(new URL(url).pathname) || '.mp4';
      const vPath = path.join(briefDir, `${baseName}_src${i}${ext}`);
      tempFiles.push(vPath);
      progressCallback({ type: 'progress', text: `Downloading video ${i + 1}/${urls.length}...`, percent: 5 + (i / urls.length) * 25 });
      try {
        await downloadVideo(url, vPath);
        videoPaths.push(vPath);
      } catch (e) {
        progressCallback({ type: 'progress', text: `Failed to download video ${i + 1}: ${e.message}`, percent: 0 });
        throw new Error(`Failed to download video ${i + 1}: ${e.message}`);
      }
    }

    if (videoPaths.length === 0) throw new Error('No videos downloaded');

    progressCallback({ type: 'progress', text: 'Combining videos...', percent: 35 });

    // Step 2: Concatenate all videos
    let workingPath = videoPaths[0];
    if (videoPaths.length > 1) {
      const concatPath = path.join(briefDir, `${baseName}_concat.mp4`);
      tempFiles.push(concatPath);
      await concatWithTransitions(videoPaths, concatPath);
      workingPath = concatPath;
    }

    const info = getVideoInfo(workingPath);
    const W = info.width;
    const H = info.height;
    const dur = info.duration;

    // Step 3: Freeze frame intro
    if (freezeFrame && freezeFrame.enabled !== false) {
      progressCallback({ type: 'progress', text: 'Adding freeze frame intro...', percent: 45 });
      const freezeTime = freezeFrame.time || 1;
      const freezeDur = freezeFrame.duration || 3;
      const freezeImg = path.join(briefDir, `${baseName}_freeze.png`);
      tempFiles.push(freezeImg);
      try {
        await extractVideoFrame(workingPath, Math.min(freezeTime, Math.max(0, dur - 1)), freezeImg);
        if (fs.existsSync(freezeImg)) {
          const ffPath = path.join(briefDir, `${baseName}_freeze_intro.mp4`);
          tempFiles.push(ffPath);
          await addFreezeFrameTitle(workingPath, freezeImg, ffPath, {
            duration: freezeDur,
          });
          try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
          workingPath = ffPath;
        }
      } catch (e) {
        progressCallback({ type: 'progress', text: `Freeze frame skipped: ${e.message}`, percent: 45 });
      }
    }

    // Step 4: Add caption as text overlay
    progressCallback({ type: 'progress', text: 'Adding caption overlay...', percent: 60 });

    // Build text layers from caption + hashtags
    const textLayers = [];
    if (caption) {
      textLayers.push({
        text: caption, font: font, size: fontSize,
        color: color, opacity: 100,
        bgColor: bgColor, bgOpacity: bgOpacity, borderRadius: 8,
        x: 50, y: 80, style: 'normal', spacing: 2,
        startTime: 0, endTime: 999,
      });
    }

    if (hashtags && hashtags.length) {
      const tags = Array.isArray(hashtags) ? hashtags.join(' ') : hashtags;
      textLayers.push({
        text: tags, font: font, size: Math.round(fontSize * 0.6),
        color: color, opacity: 80,
        bgColor: bgColor, bgOpacity: 40, borderRadius: 4,
        x: 50, y: 92, style: 'normal', spacing: 1,
        startTime: 0, endTime: 999,
      });
    }

    if (textLayers.length > 0) {
      const txtPath = path.join(briefDir, `${baseName}_text.mp4`);
      tempFiles.push(txtPath);
      await addTextOverlays(workingPath, txtPath, textLayers);
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = txtPath;
    }

    // Step 5: Apply aspect ratio
    if (aspectRatio && aspectRatio !== 'none') {
      progressCallback({ type: 'progress', text: 'Applying frame preset...', percent: 80 });
      const arPath = path.join(briefDir, `${baseName}_ar.mp4`);
      tempFiles.push(arPath);
      await applyAspectRatio(workingPath, arPath, aspectRatio);
      try { if (fs.existsSync(workingPath)) fs.unlinkSync(workingPath); } catch {}
      workingPath = arPath;
    }

    progressCallback({ type: 'progress', text: 'Finalizing...', percent: 95 });

    // Cleanup temp files
    for (const p of tempFiles) {
      if (p !== workingPath && fs.existsSync(p)) try { fs.unlinkSync(p); } catch {}
    }

    progressCallback({ type: 'done', url: '/' + path.relative(__dirname, workingPath), outputPath: workingPath, message: 'Video generated successfully!' });

    return workingPath;

  } catch (e) {
    // Cleanup on error
    for (const p of tempFiles) { if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch {} }
    progressCallback({ type: 'error', message: e.message });
    throw e;
  }
}

module.exports = {
  downloadVideo,
  addIntroTitle,
  concatIntro,
  addFadeInOut,
  addBackgroundMusic,
  addTextOverlays,
  addImageOverlays,
  addShapeOverlays,
  addVideoEffects,
  applyAspectRatio,
  extractVideoFrame,
  addFreezeFrameTitle,
  concatWithTransitions,
  fullEdit,
  combineVideosFromBrief,
  resolveDriveUrl,
  getVideoInfo,
  TITLE_TEMPLATES,
};
