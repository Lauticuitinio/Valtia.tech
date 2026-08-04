// nav-auth.js — estado de sesión en la navegación de las páginas públicas.
// Si hay sesión: "Acceso Cliente" pasa a "Mi Panel" y se ocultan los links
// comerciales. Los candados PRO solo se abren para clientes reales
// (usuariosPro/{email} o inversores/{email}) — el login solo no alcanza,
// hasta que exista el cobro online.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCxKNw0995b8a7XXyENiMjDQbfRCe9IBlw',
  authDomain: 'valtia-analytics.firebaseapp.com',
  projectId: 'valtia-analytics',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const ADMIN_EMAIL = 'valtyaanalytics@gmail.com';

// ¿Tiene acceso PRO? admin, alta manual en usuariosPro, o cliente del fondo.
// Compartido con las páginas (informes/carteras) vía window.valtiaEsPro.
window.valtiaEsPro = async function (user) {
  if (!user || !user.email) return false;
  if (user.email === ADMIN_EMAIL) return true;
  const db = getFirestore(app);
  for (const col of ['usuariosPro', 'inversores']) {
    try {
      if ((await getDoc(doc(db, col, user.email))).exists()) return true;
    } catch (e) { /* sin permiso = no es de esa colección */ }
  }
  return false;
};

function pintarCandados(abiertos) {
  document.querySelectorAll('.pro-overlay').forEach(o => { o.style.display = abiertos ? 'none' : ''; });
  document.querySelectorAll('.preview-blur').forEach(b => {
    b.style.filter = abiertos ? 'none' : '';
    if (abiertos) b.style.pointerEvents = '';
    b.style.userSelect = '';
  });
  document.querySelectorAll('.badge-p').forEach(b => { b.textContent = abiertos ? 'PRO ✓' : 'PRO'; });
}

onAuthStateChanged(getAuth(app), async user => {
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
    pintarCandados(await window.valtiaEsPro(user));
  } else {
    if (cta) {
      cta.textContent = 'Acceso Cliente';
      cta.setAttribute('href', 'index.html');
      cta.setAttribute('onclick', 'openLogin(event)');
    }
    const extra = document.getElementById('nav-mipanel');
    if (extra) extra.remove();
    mkt.forEach(a => { a.style.display = ''; });
    pintarCandados(false);
  }
});
