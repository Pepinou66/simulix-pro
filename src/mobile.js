'use strict';
/* =====================================================================
   Version mobile :
   - application Android (Capacitor) : enregistrement / partage des fichiers,
     ouverture de projets, recherche de mise à jour (APK sur GitHub Releases) ;
   - version web installable (PWA, Android et iPhone/iPad) : service worker.
   ===================================================================== */
const SIMULIX_VERSION = '__VERSION__';
(function () {
  const C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
  if (native) {
    const P = C.Plugins, b64 = s => btoa(unescape(encodeURIComponent(s)));
    const share = async (name, data) => { // fichier écrit dans l'application puis feuille de partage (Enregistrer dans Fichiers, Drive, e-mail…)
      const r = await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
      try { await P.Share.share({ title: name, files: [r.uri], dialogTitle: name }); } catch (e) { }
      return name;
    };
    window.simulix = {
      isMobile: true,
      saveFile: (name, text) => share(name, b64(text)),
      saveDataURL: (name, url) => share(name, url.split(',')[1]),
      savePDF: async (name, pages) => { const uris = []; for (let i = 0; i < pages.length; i++) { const n = name.replace(/\.pdf$/i, '') + '_F' + (i + 1) + '.png'; uris.push((await P.Filesystem.writeFile({ path: n, data: pages[i].split(',')[1], directory: 'CACHE' })).uri); } try { await P.Share.share({ title: name, files: uris }); } catch (e) { } return name; },
      openFile: () => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.sxp,.json,application/json,application/octet-stream,*/*'; i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res({ name: f.name, text: r.result }); r.readAsText(f, 'utf-8'); }; i.click(); }),
      mobileUpdate: async (manual) => { // compare la version installée à la dernière release GitHub
        try {
          const r = await fetch('https://api.github.com/repos/Pepinou66/simulix-pro/releases/latest', { cache: 'no-store' }); const j = await r.json();
          const latest = String(j.tag_name || '').replace(/^v/, ''), apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
          const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; } return false; };
          if (latest && apk && newer(latest, SIMULIX_VERSION)) {
            if (await confirmDlg('Simulix Pro ' + latest + ' est disponible (version installée : ' + SIMULIX_VERSION + '). Télécharger la mise à jour ?')) location.href = apk.browser_download_url;
          } else if (manual) toast('✔ Vous utilisez la dernière version (' + SIMULIX_VERSION + ')');
        } catch (e) { if (manual) toast('⚠ Impossible de vérifier les mises à jour (connexion internet ?)'); }
      }
    };
    window.addEventListener('load', () => setTimeout(() => window.simulix.mobileUpdate(false), 4000));
  } else if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.simulix && !/claudeusercontent|claude\.ai/.test(location.host)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }
})();
