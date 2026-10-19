(() => {
  const status = document.getElementById('offline-status');
  const install = document.getElementById('install-app');
  const dialog = document.getElementById('install-dialog');
  let prompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    install.textContent = 'Install app';
  });
  install.addEventListener('click', async () => {
    if (!prompt) { dialog.showModal(); return; }
    const current = prompt;
    prompt = null;
    try { await current.prompt(); await current.userChoice; }
    finally { install.textContent = 'Use as an app'; }
  });
  document.getElementById('close-install').addEventListener('click', () => dialog.close());
  window.addEventListener('appinstalled', () => { prompt = null; install.textContent = 'App installed'; });
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Offline access requires HTTPS or localhost';
    return;
  }
  let prepared = false, updating = false, reloadTimer, reloading = false;
  let lastInteraction = Date.now();
  for (const type of ['input', 'keydown', 'pointerdown', 'pointermove']) document.addEventListener(type, () => { lastInteraction = Date.now(); }, { passive: true });
  const version = document.querySelector('meta[name="app-version"]')?.content;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'STRUCTOGRAM_UPDATE') return;
    event.ports[0]?.postMessage({ handled: true });
    if (event.data.version === version || reloading) return;
    updating = true;
    showStatus();
    const reloadWhenIdle = () => {
      if (Date.now() - lastInteraction < 1500 || document.querySelector('dialog[open]')) { reloadTimer = setTimeout(reloadWhenIdle, 500); return; }
      const ready = window.dispatchEvent(new Event('structogram-before-update', { cancelable: true }));
      if (!ready) { status.textContent = 'Update ready · Save source, then refresh to update'; return; }
      reloading = true;
      location.reload();
    };
    clearTimeout(reloadTimer); reloadTimer = setTimeout(reloadWhenIdle, 1500);
  });
  const showStatus = () => {
    status.textContent = updating ? 'Updating automatically · Your work is saved' :
      prepared ? (navigator.onLine ? 'Ready offline · Save source for backups' : 'Offline · Your edits stay on this device') :
      'Preparing offline access…';
  };
  window.addEventListener('online', showStatus);
  window.addEventListener('offline', showStatus);
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(registration => {
    const watch = worker => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        updating = Boolean(registration.waiting);
        if (worker.state === 'redundant' && !prepared) status.textContent = 'Offline setup failed — reopen online to retry';
        else showStatus();
      });
    };
    updating = Boolean(registration.waiting);
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    showStatus();
    const check = () => registration.update().catch(() => {});
    check();
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    return navigator.serviceWorker.ready;
  }).then(() => { prepared = true; showStatus(); }).catch(() => {
    status.textContent = 'Offline access unavailable · Save source to keep your work';
  });
})();
