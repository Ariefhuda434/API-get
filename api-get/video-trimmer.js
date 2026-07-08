const { execSync } = require('child_process');
const fs = require('fs');

const KLAP_MAX_SEC = 2700; // ~45 min safe limit
const TEMP_DIR = '/tmp/trimmed';

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function run(cmd, timeout = 300000) {
  return execSync(cmd, { timeout, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim();
}

async function getDuration(youtubeUrl) {
  try {
    const out = run(`yt-dlp --print duration "${youtubeUrl}" 2>/dev/null`);
    const secs = parseInt(out);
    return isNaN(secs) ? null : secs;
  } catch { return null; }
}

async function trimAndUpload(youtubeUrl, onProgress) {
  try {
    const dur = await getDuration(youtubeUrl);
    if (dur === null) return { url: youtubeUrl, trimmed: false, note: 'Could not check duration' };
    if (dur <= KLAP_MAX_SEC) return { url: youtubeUrl, trimmed: false, duration: dur };

    onProgress?.('trimming', `Video ${Math.round(dur / 60)} menit, memotong ke 45 menit...`);

    const tempFile = `${TEMP_DIR}/trim_${Date.now()}.mp4`;
    run(`yt-dlp -f "best[height<=360]" --download-sections "*0-${KLAP_MAX_SEC}" -o "${tempFile}" "${youtubeUrl}"`, 600000);

    const stats = fs.statSync(tempFile);
    onProgress?.('uploading', `Uploading ${(stats.size / 1024 / 1024).toFixed(1)}MB ke catbox...`);

    const { execSync } = require('child_process');
    const result = execSync(
      `curl -s --max-time 120 -F "reqtype=fileupload" -F "fileToUpload=@${tempFile}" "https://catbox.moe/user/api.php"`,
      { timeout: 180000, encoding: 'utf8' }
    ).trim();

    try { fs.unlinkSync(tempFile); } catch {}

    if (result && result.startsWith('https://')) {
      return { url: result, trimmed: true, originalDuration: dur, trimmedDuration: KLAP_MAX_SEC };
    }
    throw new Error('Upload failed: ' + result);
  } catch (err) {
    return { url: youtubeUrl, trimmed: false, error: err.message };
  }
}

module.exports = { trimAndUpload, getDuration, KLAP_MAX_SEC };
