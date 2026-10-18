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
  let prepared = false, waiting = false;
  const showStatus = () => {
    status.textContent = waiting ? 'Update ready — close all app tabs and reopen' :
      prepared ? (navigator.onLine ? 'Ready offline · Save source for backups' : 'Offline · Your edits stay on this device') :
      'Preparing offline access…';
  };
  window.addEventListener('online', showStatus);
  window.addEventListener('offline', showStatus);
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(registration => {
    const watch = worker => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        waiting = Boolean(registration.waiting);
        if (worker.state === 'redundant' && !prepared) status.textContent = 'Offline setup failed — reopen online to retry';
        else showStatus();
      });
    };
    waiting = Boolean(registration.waiting);
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    showStatus();
    return navigator.serviceWorker.ready;
  }).then(() => { prepared = true; showStatus(); }).catch(() => {
    status.textContent = 'Offline access unavailable · Save source to keep your work';
  });
})();
