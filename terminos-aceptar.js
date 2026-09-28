// terminos-aceptar.js — la aceptación de los Términos y Condiciones de valtia.tech.
//
// Dos momentos, los dos desde index.html:
//  · el alta con mail y contraseña (signupWithEmail): pedirTerminosAlta() muestra el
//    modal ANTES de crear la cuenta, y sin «Confirmar» no se crea. Lo aceptado queda
//    anotado en memoria (anotarAlta) y lo guarda exigirTerminos() apenas existe la
//    sesión, sin volver a preguntar;
//  · todo ingreso al panel (Google o mail, cuentas nuevas y viejas, el admin
//    también): exigirTerminos() lee inversores/{email}/legal/terminos y, si no está
//    o su versión no es TERMINOS_VERSION, el modal bloquea el panel hasta
//    «Confirmar» (o «Cerrar sesión»). Con el mail sin verificar igual se puede
//    aceptar: firestore.rules le deja escribir ese doc al dueño aunque no verificó.
//    Si la sesión cambia con el modal abierto (salió desde otra pestaña, o entró
//    otra cuenta), index.html llama a cerrarTerminos() y esa vuelta no entra.
// El texto legal no se copia acá: se lee de /terminos (la página pública) y se
// muestra solo su parte legal, así hay un único texto. Las páginas públicas no se
// bloquean: esto lo llama solo el panel.
// Modal propio (no el confirm() del navegador) con la piel del panel: IBM Plex Sans,
// botones de la regla §0 (el primario navy), claro y oscuro. Sale ANTES de que
// panel.js ponga sus --v3-*, así que trae tokens propios con los mismos valores.
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// La versión del texto legal que se acepta: la fecha del cambio. Subirla cuando
// cambie el texto de /terminos o de /privacidad hace que TODOS vuelvan a aceptar la
// próxima vez que entren al panel. Hasta 20 caracteres (lo exige firestore.rules).
export const TERMINOS_VERSION = '2026-09-27';

// lo único que se guarda en inversores/{email}/legal/terminos (el hasOnly de las reglas)
export const CAMPOS_LEGAL = ['version', 'aceptado'];

// cuánto se espera al servidor al guardar: sin red, setDoc no falla, queda esperando
const ESPERA_MS = 15000;
// al volver de leer /terminos o /privacidad en medio del alta, index.html reabre
// «Crear cuenta» con el mail (la contraseña no se guarda nunca)
export const CLAVE_VOLVER = 'valtia-alta-volver';

const norm = s => String(s || '').trim().toLowerCase();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* qué dice el doc guardado: 'ok' (aceptó esta versión), 'vieja' (aceptó otra) o 'falta' */
export function estadoDe(datos) {
  if (!datos || typeof datos !== 'object') return 'falta';
  return datos.version === TERMINOS_VERSION ? 'ok' : 'vieja';
}

/* el aviso cuando no se pudo guardar: honesto, con el código para diagnosticar sin
   abrir la consola, y siempre con salida (reintentar o seguir al panel igual) */
export function mensajeError(e, alta = false) {
  const code = String((e && e.code) || '').replace(/^firestore\//, '');
  const cod = /^[a-z-]{3,40}$/.test(code) ? ` (${code})` : '';
  const causa = code === 'permission-denied' ? `: el servidor no lo permitió${cod}`
    : code === 'unavailable' ? `: no hay conexión con el servidor${cod}`
    : code === 'deadline-exceeded' ? `: el servidor no respondió a tiempo${cod}`
    : cod;
  return (alta ? 'Tu cuenta ya está creada, pero no' : 'No')
    + ` pudimos guardar tu aceptación${causa}. Reintentá, o seguí al panel igual:`
    + ' la próxima vez que entres te la vamos a pedir de nuevo.';
}

/* ── alta con mail: lo aceptado espera a que exista la cuenta ── */
let _alta = null;
export function anotarAlta(email) { _alta = { email: norm(email), version: TERMINOS_VERSION }; }
export function olvidarAlta() { _alta = null; }
function tomarAlta(email) {
  const a = _alta;
  _alta = null;
  return !!a && a.email === norm(email) && a.version === TERMINOS_VERSION;
}

/* ── lo que este navegador ya vio guardado (solo por si después no se puede LEER) ──
   Va por uid y no por mail: la marca queda en el navegador después de cerrar sesión
   y en una compu compartida no tiene que dejar escrito el mail de nadie. */
const claveLocal = uid => 'valtia-terminos-' + String(uid || '');
function recordar(uid) { if (!uid) return; try { localStorage.setItem(claveLocal(uid), TERMINOS_VERSION); } catch (e) {} }
function yaRecordado(uid) { if (!uid) return false; try { return localStorage.getItem(claveLocal(uid)) === TERMINOS_VERSION; } catch (e) { return false; } }

function conTiempo(p, ms) {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('sin respuesta'), { code: 'deadline-exceeded' })), ms); }),
  ]).finally(() => clearTimeout(t));
}

/* ───────────────────────── el texto (de /terminos) ───────────────────────── */
// Solo lo legal de la página (main.lg-txt, más la vigencia del título), copiado
// nodo por nodo con una lista cerrada de etiquetas: nada de scripts, estilos ni
// atributos, salvo los href de mail o del propio sitio.
const QUITAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'IMG', 'PICTURE',
  'VIDEO', 'AUDIO', 'CANVAS', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'NAV', 'ASIDE', 'LINK', 'META']);
// los h2 de la página pasan a h3: en el modal, el h2 es «Términos y Condiciones»
const ETIQUETA = { P: 'p', H1: 'h3', H2: 'h3', H3: 'h4', H4: 'h4', H5: 'h4', UL: 'ul', OL: 'ol', LI: 'li', B: 'b', STRONG: 'b',
  I: 'i', EM: 'i', A: 'a', SPAN: 'span', SECTION: 'section', DIV: 'div', BR: 'br' };
// los únicos href que pasan: un mail, o una página del propio sitio ("/algo"), nunca
// "//otro.com" ni "/\otro.com" (el navegador lee esa \ como / y sale del sitio)
export function hrefPropio(h) {
  return /^mailto:[^\s"'<>\\]+$/i.test(h) || /^\/(?![\/\\])[^\s"'<>\\]*$/.test(h);
}
function copiar(origen, destino) {
  origen.childNodes.forEach(n => {
    if (n.nodeType === 3) { destino.appendChild(document.createTextNode(n.nodeValue)); return; }
    if (n.nodeType !== 1 || QUITAR.has(n.tagName)) return;
    const tag = ETIQUETA[n.tagName];
    if (!tag) { copiar(n, destino); return; }   // etiqueta que no está en la lista: queda su texto
    const el = document.createElement(tag);
    if (tag === 'a') {
      const h = n.getAttribute('href') || '';
      if (hrefPropio(h)) el.setAttribute('href', h);
    }
    if (tag === 'span' && n.classList.contains('n')) el.className = 'n';
    if (n.classList.contains('lg-intro')) el.className = 'ta-intro';
    if (n.classList.contains('lg-pie')) el.className = 'ta-cierre';
    copiar(n, el);
    destino.appendChild(el);
  });
}
function extraerLegal(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const main = d.querySelector('main.lg-txt');
  if (!main || !main.querySelector('.lg-sec')) throw new Error('la página no trae el texto legal');
  const caja = document.createElement('div');
  const vig = d.querySelector('.v-baj');
  if (vig && vig.textContent.trim()) {
    const p = document.createElement('p');
    p.className = 'ta-vig';
    p.textContent = vig.textContent.trim().replace(/\s+/g, ' ');
    caja.appendChild(p);
  }
  copiar(main, caja);
  return caja.innerHTML;
}
let _texto = null;   // una sola lectura por página; si falla, la próxima apertura vuelve a probar
function cargarTexto() {
  if (!_texto) {
    _texto = fetch('/terminos', { cache: 'no-cache', credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(extraerLegal);
    _texto.catch(() => { _texto = null; });
  }
  return _texto;
}
// si no se pudo leer la página: un resumen corto y los links al texto completo
const RESUMEN = `<p>No pudimos cargar el texto completo ahora. En pocas palabras:</p>
<ul>
<li>El contenido de Valtia es de carácter general y educativo: no es asesoramiento financiero personalizado ni oferta pública de valores.</li>
<li>Valtia no intermedia, no custodia fondos ni ejecuta órdenes: las decisiones son tuyas y se ejecutan en tu broker.</li>
<li>Invertir implica riesgo de pérdida. Los rendimientos pasados no garantizan resultados futuros.</li>
<li>Los datos que cargás en tu cuenta son privados: solo los ve tu cuenta (y la administración del sitio).</li>
</ul>
<p>Lo que aceptás es el texto completo: <a href="/terminos">Términos y Condiciones</a> y <a href="/privacidad">Política de Privacidad</a>.</p>`;

/* ───────────────────────── estilos ───────────────────────── */
const CSS = `
.ta-velo{--ta-card:#fff;--ta-line:#E7E3DA;--ta-line2:#F2EFE8;--ta-box:#FAF8F3;--ta-ink:#101010;--ta-sub:#57534A;--ta-mut:#8B8375;
  --ta-kick:#8A6A2F;--ta-link:#8A6A2F;--ta-num:#8A6A2F;
  --ta-btn:#14213D;--ta-btnHover:#0E1830;--ta-btnTx:#fff;
  --ta-sel:rgba(176,138,62,.4);--ta-selOn:#B08A3E;--ta-selBg:#fff;--ta-selOnBg:#FBF5E8;--ta-selTx:#57534A;--ta-selOnTx:#101010;
  --ta-focus:#14213D;--ta-dn:#B23A3A;--ta-dnBg:rgba(178,58,58,.07);--ta-dnLine:rgba(178,58,58,.32);--ta-skel:#F0EDE5;
  position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;
  padding:20px 16px;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;
  background:rgba(14,24,48,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
  font-family:'IBM Plex Sans',system-ui,sans-serif;color-scheme:light}
[data-theme="dark"] .ta-velo{--ta-card:#121E3A;--ta-line:rgba(255,255,255,.12);--ta-line2:rgba(255,255,255,.07);--ta-box:rgba(255,255,255,.04);
  --ta-ink:#F4F1EA;--ta-sub:rgba(244,241,234,.74);--ta-mut:rgba(244,241,234,.58);
  --ta-kick:#E8CE96;--ta-link:#E8CE96;--ta-num:#D9BE85;
  --ta-btn:#F4F1EA;--ta-btnHover:#fff;--ta-btnTx:#0E1830;
  --ta-sel:rgba(232,206,150,.3);--ta-selOn:#D9BE85;--ta-selBg:transparent;--ta-selOnBg:rgba(232,206,150,.12);--ta-selTx:rgba(244,241,234,.74);--ta-selOnTx:#F4F1EA;
  --ta-focus:#D9BE85;--ta-dn:#F08A8A;--ta-dnBg:rgba(240,138,138,.1);--ta-dnLine:rgba(240,138,138,.35);--ta-skel:rgba(255,255,255,.07);
  color-scheme:dark;background:rgba(6,12,22,.72)}
html.ta-abierto{overflow:hidden}
.ta-velo *,.ta-velo *::before,.ta-velo *::after{box-sizing:border-box}
.ta-caja{background:var(--ta-card);color:var(--ta-ink);border:1px solid var(--ta-line);border-radius:14px;width:100%;max-width:620px;
  margin:auto;padding:26px 26px 22px;box-shadow:0 24px 60px rgba(14,24,48,.25);font-variant-numeric:tabular-nums}
.ta-k{font:600 11px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--ta-kick)}
.ta-caja h2{font:600 22px/1.2 'IBM Plex Sans',system-ui,sans-serif;color:var(--ta-ink);margin:8px 0 8px}
.ta-baj{font-size:14px;line-height:1.6;color:var(--ta-sub);margin:0}
.ta-texto{margin:16px 0 10px;max-height:min(44vh,400px);overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--ta-line);
  border-radius:10px;background:var(--ta-box);padding:14px 18px 6px;scrollbar-width:thin}
.ta-texto:focus-visible,.ta-caja a:focus-visible,.ta-btn:focus-visible,.ta-ck input:focus-visible{outline:2px solid var(--ta-focus);outline-offset:2px}
.ta-texto .ta-vig{font-size:12.5px;color:var(--ta-mut);margin:0 0 10px}
.ta-texto .ta-intro{font-size:14.5px;line-height:1.65;color:var(--ta-ink);margin:0 0 14px}
.ta-texto section{margin:0 0 14px}
.ta-texto h3{font:600 15px/1.35 'IBM Plex Sans',system-ui,sans-serif;color:var(--ta-ink);margin:0 0 6px}
.ta-texto h3 .n{color:var(--ta-num);margin-right:6px}
.ta-texto h4{font:600 14px/1.4 'IBM Plex Sans',system-ui,sans-serif;color:var(--ta-ink);margin:0 0 6px}
.ta-texto p,.ta-texto li{font-size:14px;line-height:1.65;color:var(--ta-sub);overflow-wrap:anywhere}
.ta-texto p{margin:0 0 10px}
.ta-texto ul,.ta-texto ol{margin:0 0 10px;padding-left:20px;display:flex;flex-direction:column;gap:5px}
.ta-texto b{color:var(--ta-ink);font-weight:600}
.ta-texto .ta-cierre{font-size:13px;line-height:1.6;color:var(--ta-mut);border-top:1px solid var(--ta-line2);padding:10px 0 8px;margin-top:4px}
.ta-caja a{color:var(--ta-link);text-decoration:underline;text-decoration-color:rgba(176,138,62,.55);text-underline-offset:3px}
.ta-caja a:hover{color:var(--ta-ink)}
.ta-cargando{font-size:13px;color:var(--ta-mut);margin:2px 0 12px}
.ta-sk{display:block;height:11px;border-radius:6px;background:var(--ta-skel);margin:0 0 11px;animation:ta-pulso 1.4s ease-in-out infinite}
@keyframes ta-pulso{0%,100%{opacity:1}50%{opacity:.5}}
@media(prefers-reduced-motion:reduce){.ta-sk{animation:none}}
.ta-links{font-size:13px;line-height:1.6;color:var(--ta-mut);margin:0 0 14px}
.ta-ck{display:flex;gap:11px;align-items:flex-start;min-height:44px;padding:11px 14px;border:1px solid var(--ta-sel);border-radius:8px;
  background:var(--ta-selBg);color:var(--ta-selTx);font-size:14px;line-height:1.5;cursor:pointer;transition:border-color .15s,background .15s,color .15s}
.ta-ck:hover{border-color:var(--ta-selOn);color:var(--ta-selOnTx)}
.ta-ck.on{border-color:var(--ta-selOn);background:var(--ta-selOnBg);color:var(--ta-selOnTx)}
.ta-ck input{accent-color:var(--ta-selOn);width:18px;height:18px;margin:1px 0 0;flex:none;cursor:pointer}
.ta-ck input:disabled{cursor:default}
.ta-err{margin:12px 0 0;padding:10px 12px;border:1px solid var(--ta-dnLine);border-radius:8px;background:var(--ta-dnBg);
  color:var(--ta-dn);font-size:13.5px;line-height:1.55}
.ta-err:empty{display:none}
.ta-pie{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}
.ta-btn{font:600 12px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;border-radius:8px;padding:11px 18px;
  cursor:pointer;border:1px solid var(--ta-btn);background:var(--ta-btn);color:var(--ta-btnTx);transition:background .15s,border-color .15s,color .15s}
.ta-btn:hover:not([disabled]){background:var(--ta-btnHover);border-color:var(--ta-btnHover)}
.ta-btn[disabled]{opacity:.45;cursor:not-allowed}
.ta-btn.sec{background:var(--ta-selBg);color:var(--ta-selTx);border-color:var(--ta-sel)}
.ta-btn.sec:hover:not([disabled]){background:var(--ta-selOnBg);color:var(--ta-selOnTx);border-color:var(--ta-selOn)}
.ta-btn[hidden]{display:none}
.ta-salida{margin-left:auto}
@media(max-width:560px){
  .ta-velo{padding:16px}
  .ta-caja{padding:22px 18px 18px}
  .ta-caja h2{font-size:20px}
  .ta-texto{padding:12px 14px 4px;max-height:40vh}
  .ta-pie .ta-btn{flex:1 1 100%}
  .ta-salida{margin-left:0}
}
@media(max-height:560px){.ta-texto{max-height:34vh}}
`;
function instalarCss() {
  if (document.getElementById('ta-css')) return;
  const s = document.createElement('style');
  s.id = 'ta-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ───────────────────────── el modal ───────────────────────── */
const FOCO = 'a[href],button:not([disabled]):not([hidden]),input:not([disabled]),[tabindex="0"]';
/* el foco no se escapa del diálogo mientras está abierto (como el modal de Mi cartera) */
function atraparFoco(caja, ev) {
  const f = [...caja.querySelectorAll(FOCO)].filter(x => x.offsetWidth || x.offsetHeight || x.getClientRects().length);
  if (!f.length) { ev.preventDefault(); return; }
  const a = f[0], z = f[f.length - 1], act = document.activeElement;
  if (!caja.contains(act)) { ev.preventDefault(); (ev.shiftKey ? z : a).focus(); return; }
  if (!ev.shiftKey && act === z) { ev.preventDefault(); a.focus(); }
  else if (ev.shiftKey && act === a) { ev.preventDefault(); z.focus(); }
}

// un solo modal a la vez: un doble toque devuelve el mismo. Si el que está abierto es
// de otro momento (el alta, u otra cuenta), se cierra como 'fuera' y sale el nuevo.
let _abierto = null;   // { clave, promesa, cerrar }

/* o: { obligatorio, actualizacion, email, guardar, error, tildado, cerrarSesion }
   Devuelve 'ok' | 'cancelar' | 'seguir' | 'fuera' (lo cerró un cambio de sesión).
   Con «Cerrar sesión» no vuelve: recarga. */
function abrir(o) {
  const clave = (o.obligatorio ? 'panel:' : 'alta:') + norm(o.email);
  if (_abierto) {
    if (_abierto.clave === clave) return _abierto.promesa;
    _abierto.cerrar('fuera');
  }
  instalarCss();
  const previo = document.activeElement;
  const kick = !o.obligatorio ? 'Antes de crear tu cuenta' : o.actualizacion ? 'Versión nueva' : 'Antes de entrar a tu panel';
  const bajada = !o.obligatorio ? 'Para crear tu cuenta necesitás aceptarlos. Leelos acá abajo o en su página.'
    : o.actualizacion ? 'Cambiamos los Términos y Condiciones. Para seguir usando tu panel, leé la versión nueva y aceptala.'
    : 'Para entrar a tu panel necesitás aceptarlos. Leelos acá abajo o en su página.';
  const velo = document.createElement('div');
  velo.className = 'ta-velo';
  velo.id = 'ta-velo';
  velo.innerHTML = `<div class="ta-caja" role="dialog" aria-modal="true" aria-labelledby="ta-t" aria-describedby="ta-d">
    <div class="ta-k">${esc(kick)}</div>
    <h2 id="ta-t">Términos y Condiciones</h2>
    <p id="ta-d" class="ta-baj">${esc(bajada)}</p>
    <div class="ta-texto" id="ta-texto" tabindex="0" role="region" aria-label="Texto de los Términos y Condiciones" aria-busy="true">
      <p class="ta-cargando">Cargando el texto…</p><span class="ta-sk" style="width:92%"></span><span class="ta-sk" style="width:84%"></span>
      <span class="ta-sk" style="width:88%"></span><span class="ta-sk" style="width:60%"></span></div>
    <p class="ta-links">El texto completo también está en su página: <a href="/terminos">Términos y Condiciones</a> · <a href="/privacidad">Política de Privacidad</a></p>
    <label class="ta-ck" for="ta-ck"><input type="checkbox" id="ta-ck"><span>Leí y acepto los Términos y Condiciones y la Política de Privacidad</span></label>
    <div class="ta-err" id="ta-err" role="alert"></div>
    <div class="ta-pie">
      <button type="button" class="ta-btn" id="ta-ok" disabled>Confirmar</button>
      <button type="button" class="ta-btn sec" id="ta-seguir" hidden>Seguir al panel</button>
      <button type="button" class="ta-btn sec ta-salida" id="ta-no">${o.obligatorio ? 'Cerrar sesión' : 'Cancelar'}</button>
    </div>
  </div>`;
  const caja = velo.firstElementChild;
  const $ = id => velo.querySelector('#' + id);
  const texto = $('ta-texto'), ck = $('ta-ck'), lbl = velo.querySelector('.ta-ck'), err = $('ta-err');
  const ok = $('ta-ok'), seguir = $('ta-seguir'), no = $('ta-no');
  let ocupado = false, fin;
  const promesa = new Promise(r => { fin = r; });

  // el resto de la página queda inerte (lectores de pantalla y teclado) y sin scroll
  const apagados = [];
  [...document.body.children].forEach(el => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.inert) return;
    el.inert = true; apagados.push(el);
  });
  document.documentElement.classList.add('ta-abierto');
  document.body.appendChild(velo);

  const marcar = () => { lbl.classList.toggle('on', ck.checked); ok.disabled = ocupado || !ck.checked; };
  if (o.tildado) ck.checked = true;
  if (o.error) { err.textContent = o.error; ok.textContent = 'Reintentar'; seguir.hidden = false; }
  marcar();

  cargarTexto().then(html => { texto.innerHTML = html; }, () => { texto.innerHTML = RESUMEN; })
    .finally(() => texto.removeAttribute('aria-busy'));

  let cerrado = false;
  function cerrar(r) {
    if (cerrado) return;
    cerrado = true;
    document.removeEventListener('keydown', porTecla, true);
    velo.remove();
    apagados.forEach(el => { el.inert = false; });
    document.documentElement.classList.remove('ta-abierto');
    if (_abierto && _abierto.promesa === promesa) _abierto = null;
    if (!o.obligatorio && previo && previo.isConnected && typeof previo.focus === 'function') {
      try { previo.focus({ preventScroll: true }); } catch (e) {}
    }
    fin(r);
  }
  const bloquear = si => { ocupado = si; [ck, no, seguir].forEach(b => { b.disabled = si; }); marcar(); };

  async function confirmar() {
    if (ocupado || !ck.checked) return;
    if (!o.obligatorio) { cerrar('ok'); return; }   // alta: se guarda cuando exista la cuenta
    bloquear(true);
    ok.textContent = 'Guardando…';
    err.textContent = '';
    caja.setAttribute('aria-busy', 'true');
    try {
      await conTiempo(Promise.resolve().then(o.guardar), ESPERA_MS);
      cerrar('ok');
    } catch (e) {
      caja.removeAttribute('aria-busy');
      bloquear(false);
      ok.textContent = 'Reintentar';
      seguir.hidden = false;
      err.textContent = mensajeError(e);
      ok.focus();
    }
  }
  async function salir() {
    if (ocupado) return;
    if (!o.obligatorio) { cerrar('cancelar'); return; }
    bloquear(true);
    ok.disabled = true;
    no.textContent = 'Cerrando sesión…';
    try {
      if (typeof o.cerrarSesion === 'function') await o.cerrarSesion();
      else location.reload();
    } catch (e) { try { location.reload(); } catch (x) {} }
  }
  function porTecla(ev) {
    if (ev.key === 'Tab') atraparFoco(caja, ev);
    else if (ev.key === 'Escape') {
      // obligatorio: Escape no lo cierra (hay que confirmar o cerrar sesión)
      ev.preventDefault(); ev.stopPropagation();
      if (!o.obligatorio && !ocupado) cerrar('cancelar');
    }
  }

  ck.addEventListener('change', marcar);
  ok.addEventListener('click', confirmar);
  no.addEventListener('click', salir);
  seguir.addEventListener('click', () => { if (!ocupado) cerrar('seguir'); });
  document.addEventListener('keydown', porTecla, true);
  // en el alta, si se va a leer una página del sitio, al volver se reabre «Crear cuenta»
  // (con el panel no hace falta: al volver, el ingreso vuelve a pedir la aceptación)
  if (!o.obligatorio) {
    velo.addEventListener('click', ev => {
      const a = ev.target.closest && ev.target.closest('a[href^="/"]');
      // con Ctrl/Cmd/Shift se abre aparte y la persona se queda acá: no hay "volver"
      if (!a || ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
      try { sessionStorage.setItem(CLAVE_VOLVER, JSON.stringify({ email: String(o.email || '').slice(0, 120), t: Date.now() })); } catch (e) {}
    });
  }
  try { texto.focus({ preventScroll: true }); } catch (e) {}
  _abierto = { clave, promesa, cerrar };
  return promesa;
}

/* Cambió la sesión (salió, u otra pestaña entró con otra cuenta): el modal que
   hubiera quedado abierto ya no corresponde, y la puerta que estaba leyendo para
   la sesión anterior no abre nada. index.html la llama en cada onAuthStateChanged. */
let _gen = 0;
export function cerrarTerminos() {
  _gen++;
  if (_abierto) _abierto.cerrar('fuera');
}

/* ───────────────────────── lo que usa index.html ───────────────────────── */

/* Alta con mail y contraseña: el modal ANTES de crear la cuenta. true = confirmó. */
export async function pedirTerminosAlta({ email } = {}) {
  return (await abrir({ obligatorio: false, email })) === 'ok';
}

/* Todo ingreso al panel. Resuelve cuando se puede seguir ('ok' | 'seguir'), o con
   'fuera' si mientras tanto cambió la sesión (cerrarTerminos): ahí el que llamó no
   entra. Si la persona elige «Cerrar sesión», llama a cerrarSesion (que recarga). */
let _listo = '';   // la cuenta que ya pasó en esta página
export async function exigirTerminos(user, { cerrarSesion } = {}) {
  const email = String((user && user.email) || '');
  const uid = user && user.uid;
  if (!email || _listo === norm(email)) return 'ok';
  const gen = _gen;
  let ref = null, estado = 'error';
  try {
    ref = doc(getFirestore(getApp()), 'inversores', email, 'legal', 'terminos');
    const s = await getDoc(ref);
    estado = estadoDe(s.exists() ? s.data() : null);
  } catch (e) { estado = 'error'; }
  const alta = tomarAlta(email);   // la aceptó recién, al crear la cuenta en esta página
  if (gen !== _gen) return 'fuera';
  if (estado === 'ok') { recordar(uid); _listo = norm(email); return 'ok'; }

  const guardar = async () => {
    if (!ref) throw Object.assign(new Error('sin base de datos'), { code: 'unavailable' });
    await setDoc(ref, { version: TERMINOS_VERSION, aceptado: serverTimestamp() });
    recordar(uid);
  };
  let error = '';
  if (alta) {
    try { await conTiempo(guardar(), ESPERA_MS); if (gen !== _gen) return 'fuera'; _listo = norm(email); return 'ok'; }
    catch (e) { error = mensajeError(e, true); }
    if (gen !== _gen) return 'fuera';
  } else if (estado === 'error' && yaRecordado(uid)) {
    // no se pudo leer (sin red, o sin permiso), pero este navegador ya vio guardada
    // ESTA versión para esta cuenta: no se la vuelve a trabar
    _listo = norm(email);
    return 'ok';
  }
  // tildado: solo si la persona ya lo tildó en el alta y lo que falló fue guardarlo
  const r = await abrir({ obligatorio: true, actualizacion: estado === 'vieja', email, guardar, error, tildado: !!error, cerrarSesion });
  if (r === 'ok' || r === 'seguir') _listo = norm(email);
  return r === 'ok' || r === 'seguir' ? r : 'fuera';
}
