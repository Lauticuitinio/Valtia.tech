// nav-auth.js — estado de sesión en la navegación de las páginas públicas.
// Si hay sesión: "Acceso Cliente" pasa a "Mi Panel" (vuelve al portal) y se
// ocultan los links comerciales (¿Qué hacemos? / Planes / Contacto).
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCxKNw0995b8a7XXyENiMjDQbfRCe9IBlw',
  authDomain: 'valtia-analytics.firebaseapp.com',
  projectId: 'valtia-analytics',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

onAuthStateChanged(getAuth(app), user => {
  const links = [...document.querySelectorAll('nav a, .nav-links a')];
  const mkt = links.filter(a => {
    const h = (a.getAttribute('href') || '').toLowerCase();
    return h.includes('#servicios') || h.includes('#planes') || h.includes('#contacto');
  });
  let cta = document.querySelector('.nav-cta');
  if (user) {
    if (cta) {
      cta.textContent = 'Mi Panel';
      cta.setAttribute('href', 'index.html');
      cta.removeAttribute('onclick');
    } else {
      // páginas sin CTA (ej. cartera.html): agregar el acceso al panel
      const wrap = document.querySelector('.nav-links');
      if (wrap && !document.getElementById('nav-mipanel')) {
        wrap.insertAdjacentHTML('beforeend',
          `<a id="nav-mipanel" href="index.html" style="color:var(--gold);font-weight:600">Mi Panel</a>`);
      }
    }
    mkt.forEach(a => { a.style.display = 'none'; });
  } else {
    if (cta) {
      cta.textContent = 'Acceso Cliente';
      cta.setAttribute('href', 'index.html');
    }
    const extra = document.getElementById('nav-mipanel');
    if (extra) extra.remove();
    mkt.forEach(a => { a.style.display = ''; });
  }
});
