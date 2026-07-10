function saveSettings() {
  localStorage.setItem('viralcut_api_key', document.getElementById('input-settings-api-key').value);
  localStorage.setItem('viralcut_webhook', document.getElementById('input-webhook').value);
  localStorage.setItem('viralcut_telegram', document.getElementById('input-telegram-id').value);
  showToast('Settings saved!');
}

function loadSettings() {
  const keyEl = document.getElementById('input-settings-api-key');
  if (keyEl) keyEl.value = localStorage.getItem('viralcut_api_key') || '';
  const webhookEl = document.getElementById('input-webhook');
  if (webhookEl) webhookEl.value = localStorage.getItem('viralcut_webhook') || '';
  const tgEl = document.getElementById('input-telegram-id');
  if (tgEl) tgEl.value = localStorage.getItem('viralcut_telegram') || '';
}
