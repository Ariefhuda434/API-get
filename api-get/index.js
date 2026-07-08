const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MAIL_API = 'https://api.mail.tm';
const KLAP_URL = 'https://klap.app';
const PASSWORD = 'AutoPass123!';
const ENV_PATH = path.join(__dirname, '.env');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createTempEmail() {
  const domains = await (await fetch(`${MAIL_API}/domains`)).json();
  const domain = domains['hydra:member'][0].domain;
  const addr = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@${domain}`;
  const r = await fetch(`${MAIL_API}/accounts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: addr, password: PASSWORD })
  });
  if (!r.ok) throw new Error(`mail.tm: ${await r.text()}`);
  const { token } = await (await fetch(`${MAIL_API}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: addr, password: PASSWORD })
  })).json();
  console.log(`[1] Email: ${addr}`);
  return { address: addr, token };
}

async function signup(page, email) {
  await page.goto(`${KLAP_URL}/signup`, { waitUntil: 'networkidle' });
  await sleep(1000);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button:has-text("Sign up")');
  await sleep(3000);
  const t = await page.evaluate(() => document.body.innerText);
  if (!t.includes('Confirmation email sent')) throw new Error(`Signup failed: ${page.url()}`);
  console.log('[2] Signed up');
}

async function waitForVerify(token) {
  console.log('[3] Waiting for verification email...');
  for (let i = 0; i < 40; i++) {
    const msgs = (await (await fetch(`${MAIL_API}/messages`, { headers: { Authorization: `Bearer ${token}` } })).json())['hydra:member'] || [];
    if (msgs.length) {
      const d = await (await fetch(`${MAIL_API}/messages/${msgs[0].id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
      const html = (d.html || [])[0] || '';
      const m = html.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/);
      if (m) return m[1].replace(/&amp;/g, '&');
    }
    await sleep(2000);
  }
  throw new Error('Timeout waiting for verification email');
}

async function verifyAndLogin(page, link) {
  console.log('[4] Verifying email...');
  await page.goto(link, { waitUntil: 'networkidle' });
  await sleep(3000);
}

async function createAndGetApiKey(page) {
  await page.goto(`${KLAP_URL}/rest-api`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes('Sign in') && page.url().includes('/login')) {
    throw new Error('Not logged in after verification');
  }

  const apiKeyPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(null), 15000);

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/') && (url.includes('key') || url.includes('token') || url.includes('credential')) && response.status() === 200) {
        try {
          const body = await response.json();
          console.log(`[6] API response: ${url.substring(0, 100)} -> ${JSON.stringify(body).substring(0, 400)}`);
          const key = body.key || body.api_key || body.apiKey || body.data?.key || body.data?.api_key || body.data?.apiKey || body.token || body.id || JSON.stringify(body);
          if (key && key !== '[]' && key !== '{}') {
            clearTimeout(timeout);
            resolve(key);
          }
        } catch {}
      }
      // Also catch any POST that might create a key
      if (response.status() === 200 && response.request().method() === 'POST') {
        try {
          const body = await response.json();
          const bodyStr = JSON.stringify(body);
          if (bodyStr.includes('kak')) {
            console.log(`[6] Found key in POST response: ${url.substring(0, 100)} -> ${bodyStr.substring(0, 400)}`);
            clearTimeout(timeout);
            resolve(body.key || body.api_key || body.apiKey || bodyStr);
          }
        } catch {}
      }
    });

    page.click('button:has-text("New API Key")').catch(() => {});
  });

  const key = await apiKeyPromise;

  if (key && key.length > 5) {
    console.log(`[7] API Key: ${key}`);
    return key;
  }

  // Fallback: truncated display
  const pageText = await page.evaluate(() => document.body.innerText);
  const m = pageText.match(/(kak[a-zA-Z0-9_\-\.]*)/);
  if (m) {
    console.log(`[7] Partial key (truncated): ${m[1]}`);
    return m[1];
  }

  console.log('[6] No key found. Dumping page text:', pageText);
  return null;
}

async function main() {
  console.log('=== Klap API Key Auto-Getter ===\n');

  const { address, token } = await createTempEmail();
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/home/ariefhuda/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
  });
  const page = await (await browser.newContext()).newPage();

  try {
    await signup(page, address);
    const link = await waitForVerify(token);
    await verifyAndLogin(page, link);
    const key = await createAndGetApiKey(page);

    if (key) {
      console.log(`\n=== SUCCESS ===`);
      console.log(`Email: ${address}`);
      console.log(`API Key: ${key}`);
      fs.writeFileSync(ENV_PATH, `KLAP_EMAIL=${address}\nKLAP_API_KEY=${key}\n`);
      console.log(`Saved to .env`);
    } else {
      console.log('\n=== FAILED ===');
      await page.screenshot({ path: 'debug.png', fullPage: true });
    }
  } catch (e) {
    console.error('\nError:', e.message);
    await page.screenshot({ path: 'error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

main();
