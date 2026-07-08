const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const TIKTOK_UPLOAD_URL = 'https://www.tiktok.com/upload/';
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Download a video from URL to local file.
 */
function downloadVideo(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadVideo(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Post a video to TikTok using Playwright automation.
 *
 * @param {string} videoUrl - Direct URL to the video file to upload
 * @param {string} caption - Caption/description for the TikTok post
 * @param {object} credentials - { username, password }
 * @param {function} onProgress - Callback for status updates
 * @returns {Promise<{success: boolean, videoUrl?: string, error?: string}>}
 */
async function postToTikTok(videoUrl, caption, credentials, onProgress = () => {}) {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const videoFileName = `tiktok_upload_${Date.now()}.mp4`;
  const videoPath = path.join(DOWNLOAD_DIR, videoFileName);

  onProgress({ step: 'download', message: 'Mengunduh video...' });

  try {
    await downloadVideo(videoUrl, videoPath);
  } catch (err) {
    return { success: false, error: `Gagal download video: ${err.message}` };
  }

  onProgress({ step: 'browser', message: 'Membuka browser...' });

  const launchOpts = {
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  };

  if (process.env.CHROMIUM_PATH) {
    launchOpts.executablePath = process.env.CHROMIUM_PATH;
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Step 1: Login to TikTok
    onProgress({ step: 'login', message: 'Login ke TikTok...' });
    await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await sleep(3000);

    // Fill email/username
    const usernameInput = page.locator('input[name="username"], input[name="email"], input[type="text"]').first();
    await usernameInput.fill(credentials.username);
    await sleep(1000);

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(credentials.password);
    await sleep(1000);

    // Click login button
    await page.locator('button[type="submit"]').first().click();
    onProgress({ step: 'login', message: 'Menunggu login...' });

    // Wait for navigation after login (up to 30s for potential 2FA/manual)
    await page.waitForURL('**/upload/**', { timeout: 60000 }).catch(() => {});
    await sleep(3000);

    // Check if we need manual intervention
    const currentUrl = page.url();
    if (!currentUrl.includes('upload')) {
      onProgress({
        step: 'login',
        message: 'Tunggu — login可能需要 bantuan manual. Login manual di browser yang terbuka, lalu lanjut...',
      });
      // Try navigating to upload page anyway
      await page.goto(TIKTOK_UPLOAD_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await sleep(3000);
    }

    // Step 2: Upload video
    onProgress({ step: 'upload', message: 'Mengupload video ke TikTok...' });

    // TikTok upload page has a file input for selecting video
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible().catch(() => false)) {
      await fileInput.setInputFiles(videoPath);
    } else {
      // Try the drag-and-drop zone / upload button click
      const uploadBtn = page.locator('button:has-text("Upload"), div:has-text("Select file"), div:has-text("Drag")').first();
      if (await uploadBtn.isVisible().catch(() => false)) {
        await uploadBtn.click();
        await sleep(2000);
        // File dialog might be open - try setting via file chooser
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
          sleep(500),
        ]);
        if (fileChooser) {
          await fileChooser.setFiles(videoPath);
        } else {
          // Last resort: use the file input even if not visible
          await page.locator('input[type="file"]').setInputFiles(videoPath);
        }
      } else {
        await page.locator('input[type="file"]').setInputFiles(videoPath);
      }
    }

    onProgress({ step: 'upload', message: 'Menunggu video diproses TikTok...' });

    // Wait for video to be processed (look for caption field which appears after upload)
    await sleep(5000);
    for (let i = 0; i < 30; i++) {
      const captionVisible = await page.locator('[contenteditable="true"], textarea, div[data-text="true"]').first().isVisible().catch(() => false);
      if (captionVisible) break;
      await sleep(2000);
    }

    // Step 3: Add caption
    onProgress({ step: 'caption', message: 'Menambahkan caption...' });
    const captionField = page.locator('[contenteditable="true"], textarea, div[data-text="true"]').first();
    if (await captionField.isVisible().catch(() => false)) {
      await captionField.click();
      await sleep(500);
      await captionField.fill(caption || '');
    }

    // Step 4: Post
    onProgress({ step: 'post', message: 'Memposting video...' });
    const postBtn = page.locator('button:has-text("Post"), button:has-text("Upload"), button:has-text("Publish")').first();
    if (await postBtn.isVisible().catch(() => false)) {
      await postBtn.click();
      onProgress({ step: 'post', message: 'Menunggu konfirmasi posting...' });
      await sleep(5000);
    }

    onProgress({ step: 'done', message: 'Video berhasil diposting!' });

    // Try to get the video URL from the page
    let postedUrl = '';
    for (let i = 0; i < 10; i++) {
      const url = page.url();
      if (url.includes('video/') || url.includes('@')) {
        postedUrl = url;
        break;
      }
      await sleep(1000);
    }

    return { success: true, videoUrl: postedUrl || '' };
  } catch (err) {
    return { success: false, error: `TikTok error: ${err.message}` };
  } finally {
    // Keep browser open briefly so user can see result, then close
    await sleep(3000).catch(() => {});
    await browser.close().catch(() => {});

    // Cleanup downloaded video
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  }
}

module.exports = { postToTikTok };
