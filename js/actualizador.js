window.QuipuUpdater = (() => {
  let installedVersion = '1.0.0';

  async function init() {
    try {
      const res = await fetch('./version.json');
      if (res.ok) {
        const data = await res.json();
        installedVersion = data.version || '1.0.0';
        const lbl = document.getElementById('currentVersionLabel');
        if (lbl) lbl.textContent = installedVersion;
      }
    } catch (e) {
      console.warn('No se pudo leer version.json local');
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const btnCheck = document.getElementById('btnCheckUpdates');
    if (btnCheck) {
      btnCheck.addEventListener('click', checkForUpdates);
    }
  }

  async function checkForUpdates() {
    const statusEl = document.getElementById('updateStatusText');
    statusEl.textContent = 'Buscando actualizaciones en GitHub...';

    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Sin conexión');

      const remoteData = await res.json();
      if (remoteData.version !== installedVersion) {
        statusEl.textContent = `¡Nueva versión ${remoteData.version} disponible! Actualizando...`;

        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            await reg.update();
          }
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }

        setTimeout(() => window.location.reload(true), 900);
      } else {
        statusEl.textContent = `✅ Tenés la última versión (${installedVersion}).`;
      }
    } catch (err) {
      statusEl.textContent = '⚠️ Sin conexión a internet para comprobar actualizaciones.';
    }
  }

  return { init, checkForUpdates };
})();