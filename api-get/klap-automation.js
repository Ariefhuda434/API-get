const { chromium } = require('playwright');

const KLAP_URL = 'https://klap.app';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const PROVIDERS = ['mailtm', 'guerrilla'];

async function createTempEmail() {
  const provider = PROVIDERS[Math.floor(Math.random() * PROVIDERS.length)];

  if (provider === 'guerrilla') {
    const params = new URLSearchParams({ f: 'get_email_address', ip: '127.0.0.1', agent: 'getter' });
    const data = await (await fetch(`https://api.guerrillamail.com/ajax.php?${params}`)).json();
    return { address: data.email_addr, token: data.sid_token, provider: 'guerrilla' };
  }

  // mail.tm
  const domains = await (await fetch('https://api.mail.tm/domains')).json();
  const domain = domains['hydra:member'][0].domain;
  const addr = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@${domain}`;
  const r = await fetch('https://api.mail.tm/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: addr, password: 'AutoPass123!' })
  });
  if (!r.ok) throw new Error(`mail.tm: ${await r.text()}`);
  const { token } = await (await fetch('https://api.mail.tm/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: addr, password: 'AutoPass123!' })
  })).json();
  return { address: addr, token, provider: 'mailtm' };
}

async function signup(page, email) {
  await page.goto(`${KLAP_URL}/signup`, { waitUntil: 'networkidle' });
  await sleep(1000);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'AutoPass123!');
  await page.click('button:has-text("Sign up")');
  await sleep(3000);
  const t = await page.evaluate(() => document.body.innerText);
  if (!t.includes('Confirmation email sent')) {
    throw new Error('Signup failed - no confirmation message');
  }
}

async function waitForVerify(token, provider) {
  for (let i = 0; i < 60; i++) {
    let msgs = [];

    if (provider === 'guerrilla') {
      const list = await (await fetch(`https://api.guerrillamail.com/ajax.php?f=get_email_list&sid_token=${token}&offset=0`)).json();
      msgs = (list.list || []).filter(m => m.mail_id > 1);
    } else {
      const data = await (await fetch('https://api.mail.tm/messages', {
        headers: { Authorization: `Bearer ${token}` }
      })).json();
      msgs = data['hydra:member'] || [];
    }

    if (msgs.length) {
      let html = '';

      if (provider === 'guerrilla') {
        const email = await (await fetch(`https://api.guerrillamail.com/ajax.php?f=fetch_email&sid_token=${token}&email_id=${msgs[0].mail_id}`)).json();
        html = email.mail_body || '';
      } else {
        const d = await (await fetch(`https://api.mail.tm/messages/${msgs[0].id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })).json();
        html = (d.html || [])[0] || '';
      }

      const m = html.match(/https:\/\/service\.klap\.app\/auth\/v1\/verify[^\s"'>]*/);
      if (m) return m[0].replace(/&amp;/g, '&');
    }
    await sleep(2000);
  }
  throw new Error('Timeout waiting for verification email');
}

async function createAndGetApiKey(page) {
  await page.goto(`${KLAP_URL}/rest-api`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes('Sign in') && page.url().includes('/login')) {
    throw new Error('Not logged in after verification');
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 20000);

    page.on('response', async (response) => {
      const url = response.url();
      try {
        if (url.includes('/api/') && url.includes('key') && response.status() === 200) {
          const body = await response.json();
          const key = body.key || body.api_key || body.apiKey || body.token;
          if (key) {
            clearTimeout(timeout);
            resolve(key);
          }
        }
        if (response.status() === 200 && response.request().method() === 'POST') {
          const body = await response.json();
          const bodyStr = JSON.stringify(body);
          if (bodyStr.includes('kak')) {
            clearTimeout(timeout);
            resolve(body.key || body.api_key || body.apiKey || bodyStr);
          }
        }
      } catch {}
    });

    page.click('button:has-text("New API Key")').catch(() => {});
  });
}

async function getKlapApiKey(onProgress) {
  if (!onProgress) onProgress = () => {};

  onProgress({ step: 'email', message: 'Membuat email temporary...' });
  const { address: email, token, provider } = await createTempEmail();

  const launchOpts = { headless: true };
  if (process.env.CHROMIUM_PATH) {
    launchOpts.executablePath = process.env.CHROMIUM_PATH;
  }
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    onProgress({ step: 'signup', message: 'Mendaftar ke Klap.app...' });
    await signup(page, email);

    onProgress({ step: 'verify', message: 'Menunggu email verifikasi...' });
    const link = await waitForVerify(token, provider);

    onProgress({ step: 'confirm', message: 'Mengkonfirmasi email...' });
    await page.goto(link, { waitUntil: 'networkidle' });
    await sleep(3000);

    onProgress({ step: 'key', message: 'Membuat API Key...' });
    const key = await createAndGetApiKey(page);

    if (!key) {
      throw new Error('Gagal mendapatkan API Key');
    }

    return { email, key };
  } finally {
    await browser.close();
  }
}

module.exports = { getKlapApiKey };
