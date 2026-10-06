// panel-espera.js — pestaña "Lista de espera PRO" de la gestión (solo admin, id 'espera').
// En Planes (y en la sección de planes de la home) está «Precio de lanzamiento —
// escribinos»: el que deja su mail crea un documento en `waitlistPro` con
// { email, fecha "AAAA-MM-DD", origen } y hasta ahora nadie lo veía. Acá Lauti ve la
// lista, le escribe a cada uno y anota a quién ya le escribió.
//
// Qué escribe y qué no:
//   · Escribe SOLO `contactado` (serverTimestamp) con «Ya le escribí», y lo borra
//     (deleteField) con «Deshacer». Un updateDoc por pedido, nada más: la regla de
//     `waitlistPro` deja leer, actualizar y borrar solo a isAdmin().
//   · `avisado` y `respondido` los pone el pipeline (fondo-sync) con sus propios
//     mails: acá se muestran si están y no se tocan.
//   · «Dar PRO» (desde el 06/10/2026) crea usuariosPro/{mail en minúscula} con
//     { plan: 'pro', nota, desde: serverTimestamp() }, lo mismo que marcar_pro.py, y
//     «Quitar» lo borra. Cada uno pide confirmar en la misma fila. La regla de
//     `usuariosPro` deja crear y borrar solo a isAdmin(). El mail tiene que ser el de
//     la cuenta con la que la persona entra a Valtia: la web busca ese doc por ese mail.
//   · No manda ningún mail. «Escribirle» abre el programa de correo del admin con un
//     mailto: (el mail viaja en el href, que no sale de su navegador) y «Copiar mails
//     sin contactar» los deja en el portapapeles.
//
// Todo lo de `waitlistPro` lo crea cualquiera sin cuenta: el mail, la fecha y el origen
// son texto de afuera. Se escapan siempre, la fecha solo se usa si tiene forma de
// AAAA-MM-DD, y un "mail" con caracteres raros no entra al mailto ni a la lista copiada
// (con una coma o un "?cc=" metería destinatarios que Lauti no eligió).
//
// Piel del panel nuevo (SPEC §0): IBM Plex Sans en todo (sin Plex Mono ni Playfair),
// cifras tabulares, tarjetas de 12 px, etiquetas de 6 px, el botón primario navy y el
// secundario con el borde dorado sutil (radio 8). SOLO variables --v3-* de panel.js (así
// anda el tema oscuro). No importa panel.js —sería un import circular—: todo llega por ctx.
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc, deleteDoc, deleteField, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

const CSS_ID = 'v3-css-espera';
const COL = 'waitlistPro';
const PRO = 'usuariosPro';
const db = () => getFirestore(getApp());
// una lectura de hace menos de esto se reutiliza (la pastilla del lateral y la pestaña
// piden lo mismo al abrir el panel); más vieja, la pestaña vuelve a leer
const FRESCO_MS = 60e3;
const ASUNTO = 'Valtia PRO';

const CSS = `
.v3es{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);max-width:1080px;min-width:0;container-type:inline-size}
.v3es *{box-sizing:border-box}
.v3es button{font-family:inherit}
.v3es a:focus-visible,.v3es button:focus-visible{outline:2px solid var(--v3-focus);outline-offset:2px}
/* título de página (SPEC §0): IBM Plex Sans 700 28 px y la bajada de 14 px */
.v3es-tit{font:700 28px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.1;margin:0;letter-spacing:-.01em}
.v3es-sub{font-size:14px;color:var(--v3-sub);line-height:1.7;margin:8px 0 18px;max-width:720px}
/* las tres cifras de arriba */
.v3es-cifras{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 18px}
.v3es-cif{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:14px 18px;min-width:0}
.v3es-cif .k{font:600 11px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin:0}
.v3es-cif .v{font:600 26px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.15;margin-top:6px}
.v3es-cif .s{font-size:12.5px;color:var(--v3-mut);line-height:1.45;margin-top:2px}
.v3es-cif.pend{border-left:3px solid var(--v3-gold)}
.v3es-cif.pend .v{color:var(--v3-gold2)}
/* filtro y botones de la lista */
.v3es-top{display:flex;align-items:center;justify-content:space-between;gap:10px 12px;flex-wrap:wrap;margin:0 0 12px}
.v3es-fil{display:inline-flex;gap:6px;flex-wrap:wrap;min-width:0}
.v3es-sel{font:500 12px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;margin:0;cursor:pointer;color:var(--v3-selTx);
  background:var(--v3-selBg);border:1px solid var(--v3-sel);border-radius:8px;white-space:nowrap;transition:color .15s,border-color .15s,background .15s}
.v3es-sel:hover{color:var(--v3-selOnTx)}
.v3es-sel.on{color:var(--v3-selOnTx);border-color:var(--v3-selOn);background:var(--v3-selOnBg)}
.v3es-sel .n{color:var(--v3-mut);margin-left:4px}
.v3es-acc{display:inline-flex;gap:8px 10px;flex-wrap:wrap;align-items:center}
/* botones: el primario navy lleno (el token se invierte en oscuro) y el secundario de la regla §0 */
.v3es-b{font:600 12px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-btnTx);background:var(--v3-btn);
  border:1px solid var(--v3-btn);border-radius:8px;padding:10px 16px;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-block;
  line-height:1.3;transition:background .15s,color .15s,border-color .15s}
.v3es-b:hover:not([disabled]){background:var(--v3-btnHover);border-color:var(--v3-btnHover)}
.v3es-b[disabled]{opacity:.45;cursor:default}
.v3es-b.sec{background:var(--v3-selBg);color:var(--v3-selTx);border-color:var(--v3-sel)}
.v3es-b.sec:hover:not([disabled]){background:var(--v3-selBg);color:var(--v3-selOnTx);border-color:var(--v3-selOn)}
.v3es-b.mini{padding:7px 11px;font-size:11.5px;letter-spacing:.08em}
/* "Deshacer" y "Actualizar": texto, sin caja */
.v3es-lnk{font:600 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-btn);background:none;border:none;
  padding:4px 0;margin:0;cursor:pointer;white-space:nowrap}
.v3es-lnk:hover:not([disabled]){color:var(--v3-gold2)}
.v3es-lnk[disabled]{opacity:.45;cursor:default}
.v3es-msg{font-size:14px;color:var(--v3-sub);line-height:1.6;margin:0 0 12px;overflow-wrap:anywhere;display:flex;gap:4px 12px;flex-wrap:wrap;align-items:center}
.v3es-msg:empty{display:none}
.v3es-msg.mal{color:var(--v3-dn)}
.v3es-copia{width:100%;min-height:70px;margin:0 0 12px;padding:10px 12px;border:1px solid var(--v3-line);border-radius:8px;background:var(--v3-input);
  color:var(--v3-ink);font:400 13.5px/1.6 'IBM Plex Sans',sans-serif;resize:vertical}
/* la tabla (encabezado de 11 px en mayúsculas, filas de 14 px, como las del panel) */
.v3es-tw{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow:hidden;min-width:0}
.v3es-t{width:100%;border-collapse:collapse;font-size:14px}
.v3es-t th{font:700 11px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);padding:12px 14px 10px;
  border-bottom:1px solid var(--v3-line);text-align:left;white-space:nowrap}
.v3es-t td{padding:12px 14px;border-bottom:1px solid var(--v3-line2);color:var(--v3-ink);vertical-align:middle;text-align:left;font:400 14px 'IBM Plex Sans',sans-serif}
.v3es-t tbody tr:last-child td{border-bottom:none}
.v3es-t tbody tr:hover td{background:var(--v3-hover)}
.v3es-t td.mail{font-weight:600;overflow-wrap:anywhere;word-break:break-word;min-width:0}
.v3es-t td.fe{white-space:nowrap;font-weight:500}
.v3es-t td.est,.v3es-t td.ir{white-space:nowrap}
.v3es-t td.ir{text-align:right}
.v3es-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.v3es-f{font-size:12.5px;color:var(--v3-mut);white-space:nowrap}
.v3es-av{display:block;line-height:1.5}
.v3es-mut{color:var(--v3-mut)}
.v3es-tag{display:inline-block;font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:6px;
  white-space:nowrap;line-height:1.5;vertical-align:middle}
.v3es-tag.hecho{color:var(--v3-sub);background:var(--v3-neutro)}
.v3es-tag.rep{color:var(--v3-gold2);background:var(--v3-goldBg);margin-left:6px}
.v3es-tag.pro{color:var(--v3-gold2);background:var(--v3-goldBg)}
.v3es-est{display:inline-flex;gap:4px 10px;align-items:center;flex-wrap:nowrap}
/* vacío y error */
.v3es-vacio{background:var(--v3-card);border:1px dashed var(--v3-line);border-radius:12px;padding:20px 22px}
.v3es-vacio b{display:block;font:600 17.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.3;margin-bottom:6px}
.v3es-vacio p{font-size:14px;color:var(--v3-sub);line-height:1.65;margin:0}
.v3es-vacio .v3es-b{margin-top:12px}
.v3es-nota{font-size:13px;color:var(--v3-mut);line-height:1.7;margin:12px 0 0;max-width:760px}
.v3es-nota b{color:var(--v3-sub);font-weight:600}
/* angosto: cada pedido es una tarjeta (sin scroll horizontal) */
@container (max-width:760px){
  .v3es-t thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .v3es-t,.v3es-t tbody,.v3es-t tr,.v3es-t td{display:block;width:100%}
  .v3es-t tbody tr{padding:12px 16px;border-bottom:1px solid var(--v3-line2)}
  .v3es-t tbody tr:last-child{border-bottom:none}
  .v3es-t td{border:none!important;padding:3px 0;display:flex;gap:12px;justify-content:space-between;align-items:baseline;text-align:right;white-space:normal}
  .v3es-t td::before{content:attr(data-l);font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);flex:none;text-align:left}
  .v3es-t td.mail{display:block;text-align:left;font-size:15px;padding-bottom:6px}
  .v3es-t td.mail::before{content:none}
  .v3es-t td.est,.v3es-t td.ir{align-items:center}
  .v3es-t td.ir{padding-top:8px}
  .v3es-t td.ir::before{content:none}
  .v3es-t td.ir .v3es-b{width:100%;text-align:center}
  .v3es-t tbody tr:hover td{background:none}
  .v3es-avw{min-width:0;text-align:right}
}
@container (max-width:520px){
  .v3es-cifras{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .v3es-cif{padding:12px}
  .v3es-cif .k{font-size:10.5px;letter-spacing:.08em}
  .v3es-cif .v{font-size:22px}
  .v3es-cif .s{display:none}
  .v3es-top{align-items:stretch}
  .v3es-acc{width:100%;justify-content:space-between}
}
@media (max-width:520px){.v3es-tit{font-size:24px}}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ───────────────────────── utilidades ───────────────────────── */
const codigoErr = e => String((e && (e.code || e.message)) || e || '').slice(0, 90);
const esISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
// un mail "de verdad", sin nada que un mailto: o una lista separada por comas pueda leer
// como otra cosa (comas, punto y coma, espacios, ?, &, #, comillas, <>)
const MAIL_OK = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const mailOk = m => typeof m === 'string' && m.length < 120 && MAIL_OK.test(m);
const clave = m => String(m || '').trim().toLowerCase();
// el id que arma Firestore. Los botones de «Dar PRO» buscan la fila por ese id: uno
// armado a mano (con un salto de línea, por ejemplo) podía apuntar a otra fila
const idOk = id => typeof id === 'string' && /^[A-Za-z0-9]{20}$/.test(id);

/* un sello de tiempo de Firestore en milisegundos, venga como venga: Timestamp del SDK,
   { seconds, nanoseconds } (lo que escribe el pipeline en Python), Date, ISO o número.
   null si no se entiende o si cae fuera de 2000–2100: un sello fuera del rango de Date
   hacía tirar a toISOString() y se caía la lista entera ("Invalid time value"); uno
   escrito en otra unidad (segundos por milisegundos) daba un dd/mm sin sentido */
const MS_MIN = Date.UTC(2000, 0, 1), MS_MAX = Date.UTC(2100, 0, 1);
const enRango = n => (typeof n === 'number' && isFinite(n) && n >= MS_MIN && n < MS_MAX ? n : null);
function aMs(v) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  try {
    if (typeof v.toMillis === 'function') return enRango(v.toMillis());
    if (typeof v.toDate === 'function') return enRango(v.toDate().getTime());
  } catch (e) { return null; }
  if (v instanceof Date) return enRango(v.getTime());
  if (typeof v === 'number') return enRango(v);
  if (typeof v === 'string') return enRango(Date.parse(v));
  if (typeof v === 'object' && v.seconds != null && isFinite(Number(v.seconds))) {
    return enRango(Number(v.seconds) * 1000 + Math.floor((Number(v.nanoseconds) || 0) / 1e6));
  }
  return null;
}
// dd/mm en la hora de Buenos Aires (UTC−3, la misma cuenta que hoyAR() de panel.js)
const ddmm = ms => { const s = new Date(ms - 3 * 3600e3).toISOString(); return s.slice(8, 10) + '/' + s.slice(5, 7); };
const fechaHora = ms => { const s = new Date(ms - 3 * 3600e3).toISOString(); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`; };
// ¿el campo está? (el pipeline escribe un sello; cualquier cosa que no sea vacío o false cuenta)
const hay = v => v != null && v !== false && v !== '';

const ORIGENES = { planes: 'Planes', index: 'Inicio' };
const origenTxt = o => typeof o === 'string' && o.trim() ? (ORIGENES[o.trim()] || o.trim()) : '';

/* un documento de waitlistPro → una fila de la tabla. Todo lo que viene de afuera se
   queda como texto (se escapa al dibujar) */
function aFila(id, x) {
  x = x || {};
  const email = typeof x.email === 'string' ? x.email.trim() : '';
  const fecha = esISO(x.fecha) ? x.fecha : '';
  return {
    id, email, fecha,
    fechaRaw: typeof x.fecha === 'string' ? x.fecha : '',
    origen: origenTxt(x.origen),
    avisado: hay(x.avisado), avisadoMs: aMs(x.avisado),
    respondido: hay(x.respondido), respondidoMs: aMs(x.respondido),
    contactado: hay(x.contactado), contactadoMs: aMs(x.contactado),
  };
}
// el más nuevo arriba; los que no traen una fecha válida, al final
const ordenar = filas => filas.sort((a, b) =>
  (b.fecha ? 1 : 0) - (a.fecha ? 1 : 0) || b.fecha.localeCompare(a.fecha) || clave(a.email).localeCompare(clave(b.email)) || a.id.localeCompare(b.id));

/* ───────────────────────── lectura (con caché por cuenta) ───────────────────────── */
let _datos = null;     // { email, t, filas }
let _prom = null;      // { email, p }: la lectura en curso, para no pedir dos veces lo mismo

async function leer() {
  // quién tiene PRO se lee junto con la lista; si esa lectura falla, la lista se ve igual
  // y la columna «Plan» queda sin botones (pro: null)
  const [snap, sp] = await Promise.all([getDocs(collection(db(), COL)), getDocs(collection(db(), PRO)).catch(() => null)]);
  const pro = sp ? new Map(sp.docs.map(d => [clave(d.id), aMs((d.data() || {}).desde)])) : null;
  return { filas: ordenar(snap.docs.map(d => aFila(d.id, d.data()))), pro };
}

function cargar(ctx, forzar) {
  const email = ctx.S.email;
  if (!forzar && _datos && _datos.email === email && Date.now() - _datos.t < FRESCO_MS) return Promise.resolve(_datos);
  if (_prom && _prom.email === email && !forzar) return _prom.p;
  const p = leer().then(({ filas, pro }) => {
    const d = { email, t: Date.now(), filas, pro };
    if (ctx.S.email === email) _datos = d;
    return d;
  }).finally(() => { if (_prom && _prom.p === p) _prom = null; });
  _prom = { email, p };
  return p;
}

const sinContactar = filas => filas.filter(f => !f.contactado);

/* la pastilla del lateral: cuántos pedidos esperan que Lauti les escriba. La llama
   panel.js (pastillaEspera, desde actualizarLateral) y SOLO para el admin; a cualquier
   otro no le lee nada */
export async function contarSinContactar(ctx) {
  if (!ctx || !ctx.S || !ctx.S.isAdmin) return 0;
  const email = ctx.S.email;
  const d = _datos && _datos.email === email ? _datos : await cargar(ctx, false);
  return sinContactar(d.filas).length;
}

function pastilla(ctx) {
  if (!ctx || typeof ctx.contadorNav !== 'function' || !_datos || _datos.email !== ctx.S.email) return;
  const n = sinContactar(_datos.filas).length;
  try { ctx.contadorNav('espera', n ? String(n) : '', n ? `${n} pedido${n === 1 ? '' : 's'} sin contactar` : ''); } catch (e) {}
}

/* ───────────────────────── estado de la pantalla ───────────────────────── */
// filtro: 'todos' | 'pend' | 'hechos'; msg: la línea de estado ({ t, k, deshacer, copia });
// conf: la fila que está pidiendo confirmar ({ id, que: 'dar' | 'quitar' })
const E = { email: null, filtro: 'todos', msg: null, conf: null };
const _ocupados = new Set();   // ids con una escritura en curso
let _el = null, _ctx = null, _seq = 0;

/* ───────────────────────── entrada ───────────────────────── */
export async function renderEspera(el, ctx) {
  if (!el || !ctx) return;
  try {
    ponerCss();
    // el candado de verdad es firestore.rules (read/update solo isAdmin); esto es para
    // no mostrar ni leer nada si la pestaña llegara a abrirse con otra cuenta
    if (!ctx.S.isAdmin) {
      el.innerHTML = `<div class="v3es"><h1 class="v3es-tit">Lista de espera PRO</h1>
        <p class="v3es-sub">Esta pantalla es de la administración: tu cuenta no la usa.</p></div>`;
      return;
    }
    _el = el; _ctx = ctx;
    if (E.email !== ctx.S.email) { E.email = ctx.S.email; E.filtro = 'todos'; E.msg = null; E.conf = null; _ocupados.clear(); }
    if (!el.__espera) {
      el.__espera = true;
      el.addEventListener('click', alClic);
    }
    el.innerHTML = cabecera(ctx) + (typeof ctx.skel === 'function' ? ctx.skel([84, 84, 84], 34, 260)
      : '<p class="vp-cargando" role="status">Cargando la lista de espera…</p>') + '</div>';
    await dibujar(false);
  } catch (e) {
    try { el.innerHTML = cabecera(ctx) + errorHtml(e, ctx) + '</div>'; } catch (x) {}
  }
}

const cabecera = () => `<div class="v3es">
  <h1 class="v3es-tit">Lista de espera PRO</h1>
  <p class="v3es-sub">Los mails que dejaron en «Precio de lanzamiento — escribinos», en Planes. Escribiles desde acá,
    marcá a quién ya le escribiste y dale el plan PRO a quien corresponda. Esta lista la ves solo vos.</p>`;

const errorHtml = (e, ctx) => `<div class="v3es-vacio"><b>No pudimos leer la lista de espera</b>
  <p>Puede ser la conexión o que la sesión no sea la de administración${e ? ` (${ctx.esc(codigoErr(e))})` : ''}. Probá de nuevo.</p>
  <button type="button" class="v3es-b sec mini" data-es="reintentar">Reintentar</button></div>`;

async function dibujar(forzar) {
  const el = _el, ctx = _ctx;
  if (!el || !ctx || !ctx.S.isAdmin) return;
  const email = ctx.S.email, seq = ++_seq;
  let d;
  try { d = await cargar(ctx, forzar); }
  catch (e) {
    if (seq !== _seq || ctx.S.email !== email) return;
    el.innerHTML = cabecera(ctx) + errorHtml(e, ctx) + '</div>';
    return;
  }
  if (seq !== _seq || ctx.S.email !== email) return;
  // un dato que no se pudo dibujar no deja la pantalla a medias ni un error suelto en la
  // consola («Actualizar» y «Reintentar» llaman acá sin nadie que espere la promesa)
  try { pintar(); } catch (e) { el.innerHTML = cabecera(ctx) + errorHtml(e, ctx) + '</div>'; return; }
  pastilla(ctx);
}

/* rearma con lo que ya está leído (filtro, marcar, deshacer): sin volver a Firestore */
function pintar(foco) {
  const el = _el, ctx = _ctx;
  if (!el || !ctx || !_datos || _datos.email !== ctx.S.email) return;
  el.innerHTML = cabecera(ctx) + cuerpo(_datos.filas, ctx) + '</div>';
  // el selector lleva el id del documento (lo elige quien lo crea): si igual no se puede
  // leer, se queda sin foco y no tira
  let x = null;
  try { x = foco ? el.querySelector(foco) : null; } catch (e) {}
  if (x) { try { x.focus(); } catch (e) {} }
}

/* ───────────────────────── armado ───────────────────────── */
function cuerpo(filas, ctx) {
  const esc = ctx.esc;
  if (!filas.length) {
    return `<div class="v3es-vacio"><b>Todavía nadie se anotó desde Planes</b>
      <p>Cuando alguien deje su mail en «Precio de lanzamiento — escribinos», aparece acá con la fecha en que se anotó.</p>
      <button type="button" class="v3es-b sec mini" data-es="actualizar">Volver a mirar</button></div>`;
  }
  const pend = sinContactar(filas);
  const hechos = filas.length - pend.length;
  // hoy y los seis días anteriores. `fecha` la pone el navegador del que se anota en UTC:
  // a la noche de Buenos Aires ya es "mañana", por eso se acepta un día adelante
  const semana = filas.filter(f => { if (!f.fecha) return false; const k = ctx.enDias(f.fecha); return k >= -6 && k <= 1; }).length;
  const distintos = new Set(filas.map(f => clave(f.email)).filter(Boolean)).size;
  // cuántas veces aparece cada mail: el que se anotó dos veces lleva la marca
  const veces = {};
  filas.forEach(f => { const k = clave(f.email); if (k) veces[k] = (veces[k] || 0) + 1; });
  const copiables = mailsParaCopiar(filas);

  const cif = (k, v, s, cls) => `<div class="v3es-cif${cls ? ' ' + cls : ''}"><p class="k">${k}</p><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const vista = E.filtro === 'pend' ? pend : E.filtro === 'hechos' ? filas.filter(f => f.contactado) : filas;
  const fil = (id, t, n) => `<button type="button" class="v3es-sel${E.filtro === id ? ' on' : ''}" data-es-filtro="${id}" aria-pressed="${E.filtro === id}">${t}<span class="n">${n}</span></button>`;

  const m = E.msg;
  const msg = m ? `<div class="v3es-msg${m.k === 'mal' ? ' mal' : ''}" id="v3es-msg" role="status" aria-live="polite"><span>${esc(m.t)}</span>${
      m.deshacer && _datos.filas.some(f => f.id === m.deshacer && f.contactado)
        ? `<button type="button" class="v3es-lnk" data-es-deshacer="${esc(m.deshacer)}"${_ocupados.has(m.deshacer) ? ' disabled' : ''}>Deshacer</button>` : ''}</div>`
      + (m.copia ? `<textarea class="v3es-copia" readonly aria-label="Mails sin contactar para copiar a mano">${esc(m.copia)}</textarea>` : '')
    : '<div class="v3es-msg" id="v3es-msg" role="status" aria-live="polite"></div>';

  return `<div class="v3es-cifras">
      ${cif('Anotados', filas.length, distintos !== filas.length ? `${distintos} mail${distintos === 1 ? '' : 's'} distinto${distintos === 1 ? '' : 's'}` : 'pedidos en total')}
      ${cif('Sin contactar', pend.length, pend.length ? 'esperan que les escribas' : 'les escribiste a todos', pend.length ? 'pend' : '')}
      ${cif('Últimos 7 días', semana, 'se anotaron esta semana')}
    </div>
    <div class="v3es-top">
      <div class="v3es-fil" role="group" aria-label="Filtrar la lista">${fil('todos', 'Todos', filas.length)}${fil('pend', 'Sin contactar', pend.length)}${fil('hechos', 'Contactados', hechos)}</div>
      <div class="v3es-acc">
        <button type="button" class="v3es-b sec mini" data-es="copiar"${copiables.ok.length ? '' : ' disabled'}
          title="${copiables.ok.length ? 'Los mails sin contactar, separados por coma, sin repetir' : 'No hay mails sin contactar'}">Copiar mails sin contactar</button>
        <button type="button" class="v3es-lnk" data-es="actualizar">Actualizar</button>
      </div>
    </div>
    ${msg}
    ${vista.length ? tabla(vista, veces, ctx) : `<div class="v3es-vacio"><p>${E.filtro === 'pend'
      ? 'No queda nadie sin contactar: ya les escribiste a todos.'
      : 'Todavía no marcaste a nadie como contactado. Cuando le escribas a alguien, tocá «Ya le escribí» en su fila.'}</p></div>`}
    <p class="v3es-nota"><b>Aviso por mail</b> lo anota la corrida automática cuando te manda el aviso de un pedido nuevo;
      esta pantalla no lo escribe. <b>Ya le escribí</b> solo deja la marca con la fecha: el mail lo mandás vos, con
      «Escribirle» o desde tu casilla. <b>Dar PRO</b> le abre el plan pago a esa casilla: tiene que ser el mismo mail con
      el que la persona entra a Valtia (y tenerlo verificado), y lo ve la próxima vez que abra o recargue la página. Desde ese
      momento esa casilla también recibe los avisos por mail de los clientes: compras, ventas e informes. Dar PRO no le manda
      ningún mail de bienvenida.${
      _datos && _datos.pro ? ` Hoy hay ${_datos.pro.size} cuenta${_datos.pro.size === 1 ? '' : 's'} con PRO dado a mano.` : ''}</p>`;
}

function tabla(filas, veces, ctx) {
  const esc = ctx.esc;
  const filasHtml = filas.map(f => {
    const n = veces[clave(f.email)] || 0;
    const rep = n > 1 ? `<span class="v3es-tag rep" title="Este mail aparece ${n} veces en la lista">se anotó ${n} veces</span>` : '';
    const mail = f.email ? esc(f.email) : '<span class="v3es-mut">sin mail</span>';
    const fecha = f.fecha ? esc(ctx.fmtF(f.fecha))
      : `<span class="v3es-mut"${f.fechaRaw ? ` title="${esc('Vino como: ' + f.fechaRaw.slice(0, 40))}"` : ''}>—</span>`;
    const origen = f.origen ? esc(f.origen) : '<span class="v3es-mut">—</span>';
    const aviso = '<div class="v3es-avw">' + (f.avisado
        ? `<span class="v3es-av">Te llegó el aviso${f.avisadoMs != null ? ` <span class="v3es-f" title="${esc(fechaHora(f.avisadoMs))}">${ddmm(f.avisadoMs)}</span>` : ''}</span>`
        : '<span class="v3es-av v3es-mut">—</span>')
      + (f.respondido
        ? `<span class="v3es-av v3es-f"${f.respondidoMs != null ? ` title="${esc(fechaHora(f.respondidoMs))}"` : ''}>Respondido${f.respondidoMs != null ? ' el ' + ddmm(f.respondidoMs) : ''}</span>` : '') + '</div>';
    const ocupado = _ocupados.has(f.id);
    const estado = f.contactado
      ? `<span class="v3es-est"><span class="v3es-tag hecho"${f.contactadoMs != null ? ` title="${esc(fechaHora(f.contactadoMs))}"` : ''}>Contactado${f.contactadoMs != null ? ' el ' + ddmm(f.contactadoMs) : ''}</span>
          <button type="button" class="v3es-lnk" data-es-deshacer="${esc(f.id)}"${ocupado ? ' disabled' : ''} aria-label="Deshacer: ${esc(f.email || 'este pedido')} vuelve a sin contactar">Deshacer</button></span>`
      : `<button type="button" class="v3es-b mini" data-es-marcar="${esc(f.id)}"${ocupado ? ' disabled' : ''} aria-label="Ya le escribí a ${esc(f.email || 'este pedido')}">${ocupado ? 'Guardando…' : 'Ya le escribí'}</button>`;
    const pro = _datos && _datos.pro, k = clave(f.email), conf = E.conf && E.conf.id === f.id ? E.conf.que : '';
    const proMs = pro && pro.has(k) ? pro.get(k) : null;
    const plan = !pro ? '<span class="v3es-mut" title="No se pudo leer quién tiene PRO: tocá «Actualizar»">—</span>'
      : !mailOk(f.email) || !idOk(f.id) ? '<span class="v3es-mut" title="Con este pedido no se puede dar el plan desde acá: revisá el mail">—</span>'
      : conf ? `<span class="v3es-est"><button type="button" class="v3es-b mini" data-es-pro-ok="${esc(f.id)}"${ocupado ? ' disabled' : ''}>${
            ocupado ? 'Guardando…' : conf === 'dar' ? 'Confirmar PRO' : 'Confirmar: quitar'}</button>
          <button type="button" class="v3es-lnk" data-es-pro-no="1"${ocupado ? ' disabled' : ''}>Cancelar</button></span>`
      : pro.has(k) ? `<span class="v3es-est"><span class="v3es-tag pro"${proMs != null ? ` title="${esc(fechaHora(proMs))}"` : ''}>PRO${proMs != null ? ' desde ' + ddmm(proMs) : ''}</span>
          <button type="button" class="v3es-lnk" data-es-quitar="${esc(f.id)}" aria-label="Quitarle el plan PRO a ${esc(f.email)}">Quitar</button></span>`
      : `<button type="button" class="v3es-b sec mini" data-es-pro="${esc(f.id)}" aria-label="Darle el plan PRO a ${esc(f.email)}">Dar PRO</button>`;
    const ir = mailOk(f.email)
      ? `<a class="v3es-b sec mini" href="${esc(mailtoDe(f.email))}" aria-label="Escribirle a ${esc(f.email)}">Escribirle</a>`
      : `<span class="v3es-mut" title="El mail tiene caracteres que no parecen de un mail: revisalo antes de escribirle">${f.email ? 'Mail con formato raro' : '—'}</span>`;
    return `<tr data-id="${esc(f.id)}">
      <td class="mail" data-l="Mail">${mail}${rep}</td>
      <td class="fe" data-l="Fecha">${fecha}</td>
      <td data-l="Origen">${origen}</td>
      <td data-l="Aviso por mail">${aviso}</td>
      <td class="est" data-l="Estado">${estado}</td>
      <td class="est" data-l="Plan">${plan}</td>
      <td class="ir" data-l="">${ir}</td></tr>`;
  }).join('');
  return `<div class="v3es-tw"><table class="v3es-t">
    <caption class="v3es-sr">Pedidos de la lista de espera PRO, del más nuevo al más viejo</caption>
    <thead><tr><th scope="col">Mail</th><th scope="col">Fecha</th><th scope="col">Origen</th><th scope="col">Aviso por mail</th>
      <th scope="col">Estado</th><th scope="col">Plan</th><th scope="col"><span class="v3es-sr">Escribirle</span></th></tr></thead>
    <tbody>${filasHtml}</tbody></table></div>`;
}

/* mailto: con el asunto. El mail ya pasó por mailOk (sin comas, ?, & ni espacios): igual
   se codifica, dejando la @ legible */
const mailtoDe = m => `mailto:${encodeURIComponent(m).replace(/%40/g, '@')}?subject=${encodeURIComponent(ASUNTO)}`;

/* los sin contactar que se pueden copiar: sin repetir (sin importar mayúsculas), del más
   nuevo al más viejo, y solo los que tienen forma de mail */
function mailsParaCopiar(filas) {
  const vistos = new Set(), ok = [];
  let raros = 0;
  sinContactar(filas).forEach(f => {
    const k = clave(f.email);
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    if (mailOk(f.email)) ok.push(f.email); else raros++;
  });
  return { ok, raros };
}

/* ───────────────────────── eventos ───────────────────────── */
function alClic(ev) {
  const t = ev.target.closest('[data-es],[data-es-filtro],[data-es-marcar],[data-es-deshacer],[data-es-pro],[data-es-quitar],[data-es-pro-ok],[data-es-pro-no]');
  if (!t || !_el || !_el.contains(t) || t.disabled) return;
  const d = t.dataset;
  if (d.esFiltro) {
    E.filtro = ['todos', 'pend', 'hechos'].includes(d.esFiltro) ? d.esFiltro : 'todos';
    pintar(`[data-es-filtro="${E.filtro}"]`);
    return;
  }
  if (d.esPro || d.esQuitar) { pedirConfirmar(d.esPro || d.esQuitar, d.esPro ? 'dar' : 'quitar'); return; }
  if (d.esProNo) { E.conf = null; E.msg = null; pintar(); return; }
  if (d.esProOk) { cambiarPro(d.esProOk); return; }
  if (d.esMarcar) { marcar(d.esMarcar); return; }
  if (d.esDeshacer) { deshacer(d.esDeshacer); return; }
  if (d.es === 'copiar') { copiar(); return; }
  if (d.es === 'reintentar' || d.es === 'actualizar') {
    E.msg = null;
    if (_el && !_datos) _el.innerHTML = cabecera(_ctx) + (typeof _ctx.skel === 'function' ? _ctx.skel([84, 84, 84], 34, 260) : '') + '</div>';
    else if (t) { t.disabled = true; t.textContent = 'Leyendo…'; }
    dibujar(true);
  }
}

/* «Ya le escribí»: UN updateDoc con { contactado: serverTimestamp() }. La regla deja
   actualizar solo al admin; no se toca ningún otro campo */
async function marcar(id) {
  const ctx = _ctx;
  if (!ctx || !ctx.S.isAdmin || !_datos) return;
  const email = ctx.S.email;
  const f = _datos.filas.find(x => x.id === id);
  if (!f || f.contactado || _ocupados.has(id)) return;
  _ocupados.add(id);
  pintar();
  try {
    await updateDoc(doc(db(), COL, id), { contactado: serverTimestamp() });
  } catch (e) {
    _ocupados.delete(id);
    if (ctx.S.email !== email) return;
    E.msg = { t: `No se guardó la marca de ${f.email || 'ese pedido'} (${codigoErr(e)}). Probá de nuevo.`, k: 'mal' };
    pintar(`[data-es-marcar="${cssId(id)}"]`);
    return;
  }
  _ocupados.delete(id);
  if (ctx.S.email !== email) return;
  // el sello real lo pone el servidor; para dibujar alcanza con la hora de acá
  f.contactado = true; f.contactadoMs = Date.now();
  E.msg = { t: `Anotado: ya le escribiste a ${f.email || 'ese pedido'}.`, k: 'ok', deshacer: id };
  pintar('#v3es-msg [data-es-deshacer]');
  pastilla(ctx);
  try { ctx.toast(`Marcado como contactado: ${f.email || 'pedido'}`); } catch (e) {}
}

/* «Dar PRO» y «Quitar» piden confirmar en la misma fila: el primer clic solo cambia el
   botón por «Confirmar…» y explica qué va a pasar; no escribe nada */
function pedirConfirmar(id, que) {
  const ctx = _ctx;
  if (!ctx || !ctx.S.isAdmin || !_datos || !_datos.pro) return;
  const f = _datos.filas.find(x => x.id === id);
  if (!f || !mailOk(f.email) || !idOk(id) || _ocupados.has(id)) return;
  // el permiso se guarda con el mail en minúscula: se muestra ESE, letra por letra (una
  // «I» mayúscula se lee como una «l» y el permiso iría a otra casilla)
  const k = clave(f.email);
  E.conf = { id, que };
  E.msg = { t: que === 'dar'
    ? `Vas a darle el plan PRO a ${k}. Tiene que ser, letra por letra, el mail con el que entra a Valtia: si usa otro, no le va a aparecer.`
    : `Vas a quitarle el plan PRO a ${k}: deja de ver lo pago la próxima vez que abra o recargue la página.`, k: 'ok' };
  pintar(`[data-es-pro-ok="${cssId(id)}"]`);
}

/* la escritura, ya confirmada: crea o borra usuariosPro/{mail en minúscula}. El doc es el
   mismo que arma marcar_pro.py: { plan, nota, desde } */
async function cambiarPro(id) {
  const ctx = _ctx;
  if (!ctx || !ctx.S.isAdmin || !_datos || !_datos.pro || !E.conf || E.conf.id !== id) return;
  const email = ctx.S.email, que = E.conf.que;
  const f = _datos.filas.find(x => x.id === id);
  if (!f || !mailOk(f.email) || !idOk(id) || _ocupados.has(id)) return;
  const k = clave(f.email);
  _ocupados.add(id);
  pintar();
  try {
    if (que === 'dar') await setDoc(doc(db(), PRO, k), { plan: 'pro', nota: 'alta desde la lista de espera', desde: serverTimestamp() });
    else await deleteDoc(doc(db(), PRO, k));
  } catch (e) {
    _ocupados.delete(id);
    if (ctx.S.email !== email) return;
    E.conf = null;
    if (que === 'dar' && /permission-denied/.test(codigoErr(e))) {
      // dar PRO a quien ya lo tiene es pisar un doc que existe, y la regla no deja: lo
      // más probable es que la lista esté vieja (se lo dieron desde otra pestaña o con
      // el script). Se lee de nuevo, que es lo que lo muestra
      E.msg = { t: `No se pudo dar el plan PRO a ${k}: puede que ya lo tuviera. Leí la lista de nuevo; si en su fila dice «PRO», ya está.`, k: 'mal' };
      dibujar(true);
      return;
    }
    E.msg = { t: `No se pudo ${que === 'dar' ? 'dar' : 'quitar'} el plan PRO a ${k} (${codigoErr(e)}). Probá de nuevo.`, k: 'mal' };
    pintar();
    return;
  }
  _ocupados.delete(id);
  if (ctx.S.email !== email) return;
  E.conf = null;
  if (que === 'dar') _datos.pro.set(k, Date.now()); else _datos.pro.delete(k);
  E.msg = { t: que === 'dar'
    ? `Listo: ${k} ya tiene el plan PRO. Lo ve la próxima vez que abra o recargue Valtia. Avisale vos: esta pantalla no le manda ningún mail.`
    : `Listo: ${k} ya no tiene el plan PRO.`, k: 'ok' };
  pintar(que === 'dar' ? `[data-es-quitar="${cssId(id)}"]` : `[data-es-pro="${cssId(id)}"]`);
  try { ctx.toast(que === 'dar' ? `Plan PRO dado a ${k}` : `Plan PRO quitado a ${k}`); } catch (e) {}
}

/* «Deshacer»: borra `contactado` con deleteField() y el pedido vuelve a sin contactar */
async function deshacer(id) {
  const ctx = _ctx;
  if (!ctx || !ctx.S.isAdmin || !_datos) return;
  const email = ctx.S.email;
  const f = _datos.filas.find(x => x.id === id);
  if (!f || !f.contactado || _ocupados.has(id)) return;
  _ocupados.add(id);
  pintar();
  try {
    await updateDoc(doc(db(), COL, id), { contactado: deleteField() });
  } catch (e) {
    _ocupados.delete(id);
    if (ctx.S.email !== email) return;
    E.msg = { t: `No se pudo deshacer la marca de ${f.email || 'ese pedido'} (${codigoErr(e)}). Probá de nuevo.`, k: 'mal' };
    pintar();
    return;
  }
  _ocupados.delete(id);
  if (ctx.S.email !== email) return;
  f.contactado = false; f.contactadoMs = null;
  E.msg = { t: `Listo: ${f.email || 'ese pedido'} vuelve a sin contactar.`, k: 'ok' };
  pintar(`[data-es-marcar="${cssId(id)}"]`);
  pastilla(ctx);
}
// el id de Firestore va en un selector de atributo entre comillas. Lo elige quien crea
// el documento (addDoc da uno limpio, pero la regla no obliga): CSS.escape cubre también
// saltos de línea y demás; sin CSS.escape, al menos comillas y barras. Es window.CSS:
// acá `CSS` a secas es la hoja de estilos del módulo
const cssId = id => (window.CSS && typeof window.CSS.escape === 'function')
  ? window.CSS.escape(String(id)) : String(id).replace(/["\\]/g, '\\$&');

/* «Copiar mails sin contactar»: al portapapeles, separados por coma (se pegan tal cual en
   el CCO). Si el navegador no deja, quedan en un cuadro para copiarlos a mano */
async function copiar() {
  const ctx = _ctx;
  if (!ctx || !ctx.S.isAdmin || !_datos) return;
  const { ok, raros } = mailsParaCopiar(_datos.filas);
  if (!ok.length) return;
  const texto = ok.join(', ');
  const cola = raros ? ` ${raros} con formato raro quedaron afuera.` : '';
  let copiado = false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { await navigator.clipboard.writeText(texto); copiado = true; }
  } catch (e) {}
  if (!copiado) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0';
      document.body.appendChild(ta); ta.select();
      copiado = document.execCommand('copy');
      ta.remove();
    } catch (e) {}
  }
  E.msg = copiado
    ? { t: `Copiado${ok.length === 1 ? '' : 's'} ${ok.length} mail${ok.length === 1 ? '' : 's'} sin contactar, separados por coma.${cola}`, k: 'ok' }
    : { t: `El navegador no dejó copiar: seleccioná los mails de abajo y copialos a mano.${cola}`, k: 'ok', copia: texto };
  pintar(copiado ? '[data-es="copiar"]' : '.v3es-copia');
  if (!copiado) { const x = _el && _el.querySelector('.v3es-copia'); if (x) { try { x.select(); } catch (e) {} } }
}
