// panel-alertas.js — pestaña "Alertas" del panel del inversor (Panel v3, id 'alertas',
// grupo "Tus inversiones"). Es el registro de lo que Valtia hizo en sus carteras
// modelo: cada compra, venta y cambio de peso, agrupados por día, con la hora,
// el precio de esa operación y la razón.
//
// La estructura es la del prototipo de Lauti (Valtia Panel v3.html, 118-177): a la
// izquierda los filtros por tipo, "Marcar todas como leídas" y la lista por día; a la
// derecha "Este mes" y "Cómo te llegan". Los colores y la tipografía son los de
// Noticias, siempre por las variables --v3-* de panel.js (así anda el tema oscuro).
// No importa panel.js —sería un import circular—: todo llega por ctx.
//
// De dónde salen los datos:
//   · la colección global `alertas`, que escribe SOLO la pantalla Operar del admin
//     (panel-operar.js, armarMovimiento/ponerEnLote): fecha, hora, tipo, ticker,
//     empresa, accion, cartera, carteraNombre, precio, razonamiento, visibilidad,
//     estado, para, historialId y creado. Los valores que acá importan salen de ahí
//     y de ningún otro lado: `tipo` es compra | venta | peso (los tres de TIPOS en
//     panel-operar.js) y `estado` nace en "borrador" y pasa a "publicado" cuando
//     Lauti publica el movimiento;
//   · lo que hizo ESTE usuario con cada una, en `inversores/{email}/alertasEstado/{id}`
//     con { leida, hecha, cuando }. Es privado de su cuenta: nadie más lo ve.
//
// Tres cosas que este módulo NO hace, a propósito:
//   1. NO escribe alertas ni manda mails. Los avisos por mail se eligen en Mi cuenta
//      y los manda el pipeline; hoy (23/09/2026) todavía no sale ninguno de estos,
//      así que acá no se promete que lleguen.
//   2. NO inventa nada. Sin alertas no hay lista de ejemplo: hay un vacío que explica
//      qué va a aparecer ahí, sin prometer cuándo. Y no hay más tipos que los que
//      Operar escribe: un tipo que nunca se escribe sería un filtro que siempre da 0.
//   3. NO muestra los borradores. Una alerta en estado "borrador" es una operación que
//      todavía no se publicó: la consulta pide estado == "publicado", el mismo filtro
//      que tiene que llevar la regla (ver reglas_necesarias).
//
// El gate del plan es el de siempre: el que manda es firestore.rules. La consulta lleva
// EXACTAMENTE las visibilidades que la regla le deja leer a esta cuenta —si pidiera una
// de más, Firestore rechaza el listado entero, no lo recorta—, y lo que no puede leer se
// lo cuenta el bloque de PRO (una lista desenfocada —barras vacías, no datos falsos—
// con el acceso a /planes).
import { getFirestore, collection, getDocs, doc, query, where, writeBatch, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

const CSS_ID = 'v3-css-alertas';

/* ───────────────────────── estilos ───────────────────────── */
const CSS = `
.v3al{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0;max-width:1200px}
.v3al *{box-sizing:border-box}
.v3al-n{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.v3al-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
.v3al-col,.v3al-lat{min-width:0;display:flex;flex-direction:column;gap:12px}
@media(min-width:980px){.v3al-grid{grid-template-columns:minmax(0,1fr) minmax(250px,320px)}}
/* controles: selectores sin caja, la opción activa con subrayado dorado de 2px */
.v3al-top{display:flex;align-items:center;justify-content:space-between;gap:8px 14px;flex-wrap:wrap;margin:0}
.v3al-fil{display:inline-flex;gap:2px;flex-wrap:wrap;min-width:0}
.v3al-sel{font:500 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.06em;padding:7px 10px;margin:0;cursor:pointer;
  color:var(--v3-mut);background:none;border:none;border-bottom:2px solid transparent;border-radius:0;white-space:nowrap;transition:color .15s}
.v3al-sel:hover{color:var(--v3-ink)}
.v3al-sel.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}
.v3al-sel .v3al-n{color:var(--v3-mut);margin-left:4px}
.v3al-leer{font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-gold2);
  background:none;border:none;padding:7px 0;margin:0;cursor:pointer;white-space:nowrap}
.v3al-leer:hover{color:var(--v3-ink)}
.v3al-leer[disabled]{opacity:.45;cursor:default}
/* la lista: un bloque por día, con la fecha arriba y las alertas en una card */
.v3al-lista{display:flex;flex-direction:column;gap:14px;min-width:0}
.v3al-dia{font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin:0 0 8px 2px}
.v3al-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow:hidden}
.v3al-it{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;align-items:start;padding:14px 18px;
  border-bottom:1px solid var(--v3-line2);min-width:0}
.v3al-it:last-child{border-bottom:none}
.v3al-it.nueva{background:var(--v3-hl)}
.v3al-tipo{display:flex;flex-direction:column;gap:6px;align-items:flex-start;min-width:0}
.v3al-pill{font:700 9px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:4px;white-space:nowrap}
.v3al-hora{font:500 10.5px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--v3-mut)}
.v3al-cuerpo{min-width:0}
.v3al-tit{display:flex;align-items:flex-start;gap:8px;min-width:0}
.v3al-tit b{font:600 14px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);line-height:1.4;overflow-wrap:anywhere}
.v3al-pt{width:7px;height:7px;border-radius:50%;background:var(--v3-serie);display:block;flex:none;margin-top:6px}
.v3al-sub{font-size:11.5px;color:var(--v3-mut);margin-top:3px;line-height:1.5;overflow-wrap:anywhere}
.v3al-raz{font-size:12.5px;color:var(--v3-sub);line-height:1.55;margin-top:6px;overflow-wrap:anywhere}
.v3al-acc{display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap;margin-top:10px}
.v3al-btn{font:600 10px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;
  background:var(--v3-navy);border:1px solid var(--v3-navy);padding:7px 11px;border-radius:6px;white-space:nowrap;cursor:pointer}
.v3al-btn:hover{background:var(--v3-serie);border-color:var(--v3-serie)}
/* en oscuro --v3-serie es el dorado: con texto blanco encima no se lee */
[data-theme="dark"] .v3al-btn:hover{color:#0E1830;background:var(--v3-goldL);border-color:var(--v3-goldL)}
.v3al-btn.ok{color:var(--v3-up);background:var(--v3-upBg);border-color:transparent}
.v3al-btn.ok:hover{background:var(--v3-upBg);border-color:var(--v3-up)}
.v3al-btn[disabled]{opacity:.45;cursor:default}
.v3al .v3al-ir{font:600 10px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;
  color:var(--v3-gold2);text-decoration:none;white-space:nowrap}
.v3al .v3al-ir:hover{color:var(--v3-ink)}
/* "Este mes": el único bloque sólido, navy con dorado claro encima */
.v3al-mes{background:var(--v3-navy);border:1px solid var(--v3-navy);border-radius:12px;padding:18px 20px;color:#fff;min-width:0}
.v3al-eye{font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,206,150,.85);margin:0}
.v3al-cif{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.v3al-cif .v{font:600 22px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:#fff;line-height:1.1;overflow-wrap:anywhere}
.v3al-cif .k{font-size:10.5px;color:rgba(255,255,255,.6);margin-top:2px;line-height:1.4}
.v3al-lado{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:16px 18px;min-width:0}
.v3al-lado .v3al-eye{color:var(--v3-mut)}
.v3al-lado p{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:8px 0 0;overflow-wrap:anywhere}
.v3al-lado p b{color:var(--v3-ink);font-weight:600}
/* avisos, vacío y error */
.v3al-aviso{font-size:12px;line-height:1.55;color:var(--v3-warn);background:var(--v3-warnBg);border-radius:8px;padding:8px 12px}
.v3al-vacio{background:var(--v3-card);border:1px dashed var(--v3-line);border-radius:12px;padding:20px 22px}
.v3al-vacio b{display:block;font:700 18px 'Playfair Display',Georgia,serif;color:var(--v3-ink);line-height:1.25;margin-bottom:6px}
.v3al-vacio p{font-size:13px;color:var(--v3-sub);line-height:1.65;margin:0}
.v3al-vacio .v3al-ir{display:inline-block;margin-top:12px}
.v3al-reint{font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-gold2);
  background:none;border:none;padding:0 0 0 6px;margin:0;cursor:pointer}
.v3al-reint:hover{color:var(--v3-ink)}
/* bloque de PRO: la lista va desenfocada con el acceso a planes. Lo de atrás son
   barras vacías, NUNCA alertas inventadas: lo que no se puede leer, no se dibuja */
.v3al-pro{position:relative;border-radius:12px;overflow:hidden;min-height:210px}
.v3al-velo{filter:blur(4px);pointer-events:none;user-select:none}
.v3al-sk{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;padding:16px 18px;border-bottom:1px solid var(--v3-line2)}
.v3al-sk:last-child{border-bottom:none}
.v3al-sk i{display:block;height:10px;border-radius:5px;background:var(--v3-track);margin:4px 0}
.v3al-sk .a i:first-child{height:16px;border-radius:4px}
.v3al-sk .b i:nth-child(2){width:62%}
.v3al-sk .b i:nth-child(3){width:84%}
.v3al-lock{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
  text-align:center;padding:20px 16px;background:rgba(255,255,255,.66)}
[data-theme="dark"] .v3al-lock{background:rgba(11,19,39,.66)}
.v3al-lock b{font:700 19px 'Playfair Display',Georgia,serif;color:var(--v3-ink);line-height:1.25}
.v3al-lock p{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:0;max-width:340px}
.v3al .v3al-cta{display:inline-block;font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:#fff;background:var(--v3-navy);border:1px solid var(--v3-navy);padding:10px 20px;border-radius:7px;text-decoration:none;margin-top:2px}
.v3al .v3al-cta:hover{background:var(--v3-serie);border-color:var(--v3-serie);color:#fff}
[data-theme="dark"] .v3al .v3al-cta{color:#0E1830;background:var(--v3-goldL);border-color:var(--v3-goldL)}
[data-theme="dark"] .v3al .v3al-cta:hover{color:#0E1830;background:var(--v3-gold);border-color:var(--v3-gold)}
.v3al-nota{font:400 11.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut);line-height:1.7;margin:10px 0 0;max-width:760px}
.v3al-cargando{font:400 13px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut)}
/* celular: la etiqueta del tipo y la hora pasan a la misma línea, arriba del texto */
@media(max-width:560px){
  .v3al-it,.v3al-sk{grid-template-columns:minmax(0,1fr);gap:8px;padding:14px}
  .v3al-tipo{flex-direction:row;align-items:center;gap:8px}
  .v3al-sk .a{display:flex;gap:8px}
  .v3al-sk .a i{width:64px;margin:0}
  .v3al-cif .v{font-size:19px}
}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ───────────────────────── rótulos ───────────────────────── */
// los TRES tipos que escribe Operar, ni uno más: son los de TIPOS en panel-operar.js
// (compra | venta | peso). Un tipo que Operar no escribe sería un filtro que siempre
// da cero y una etiqueta que no existe; si mañana aparece otro valor, item() lo
// muestra con su propio nombre en vez de esconderlo. El color sale de las --v3-*
const TIPOS = {
  compra: ['Compra', 'var(--v3-up)', 'var(--v3-upBg)'],
  venta: ['Venta', 'var(--v3-dn)', 'var(--v3-dnBg)'],
  peso: ['Peso', 'var(--v3-gold2)', 'var(--v3-goldBg)'],
};
const FILTROS = [['todas', 'Todas'], ['compra', 'Compras'], ['venta', 'Ventas'], ['peso', 'Pesos']];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_DEF = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// las únicas dos que el usuario replica en su broker
const ACCIONABLE = t => t === 'compra' || t === 'venta';

const esISO = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const finito = n => n != null && n !== '' && typeof n !== 'boolean' && isFinite(Number(n));
const T12 = iso => Date.parse(iso + 'T12:00:00Z');
const addD = (iso, n) => new Date(T12(iso) + n * 864e5).toISOString().slice(0, 10);
const may = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/* ───────────────────────── datos ───────────────────────── */
const db = () => getFirestore(getApp());

// el valor que le pone Operar a una alerta cuando Lauti la publica (panel-operar.js,
// publicar(): estado 'borrador' → 'publicado'). Mismo par que ya usa `noticias` en
// panel.js y en firestore.rules: la regla pide estado == 'publicado' y la consulta
// lleva el mismo where, porque una regla no recorta un listado, lo rechaza entero
const PUBLICADO = 'publicado';

/* Las visibilidades que esta cuenta puede leer, en el MISMO orden de ideas que la
   regla de carterasModelo y de informes: "publico" cualquiera, "clientes" los
   suscriptores, y el admin además las de las carteras en borrador. Esta lista y la
   regla tienen que decir lo mismo: si la consulta pidiera una visibilidad de más,
   Firestore le voltea el listado completo y la pestaña se queda en el cartel de
   error; si pidiera una de menos, el suscriptor no ve lo que pagó. */
function visiblesPara(S) {
  if (S.isAdmin) return ['publico', 'clientes', 'borrador'];
  return S.pro ? ['publico', 'clientes'] : ['publico'];
}

/* Las alertas que ESTE usuario puede listar. El gate real es firestore.rules; la web
   acompaña con los mismos dos filtros: la visibilidad que le corresponde y solo lo
   publicado. Ojo con una alerta de una cartera en borrador: Operar le pone
   visibilidad "borrador" a propósito ("esta cartera no está publicada, no le llega a
   nadie"), así que NO alcanza con no filtrar por plan —un suscriptor la vería—. */
async function leerAlertas(ctx) {
  const vis = visiblesPara(ctx.S);
  const col = collection(db(), 'alertas');
  const filtroVis = vis.length === 1 ? where('visibilidad', '==', vis[0]) : where('visibilidad', 'in', vis);
  let snap;
  try {
    snap = await getDocs(query(col, filtroVis, where('estado', '==', PUBLICADO)));
  } catch (e) {
    // si a Firestore le faltara un índice para las dos condiciones juntas, se pide
    // solo por visibilidad y el estado se filtra abajo: peor que la consulta buena,
    // pero nunca una pestaña vacía. Cualquier otro error (empezando por el permiso)
    // sube y lo muestra el cartel con "Reintentar"
    if (String((e && e.code) || '') !== 'failed-precondition') throw e;
    snap = await getDocs(query(col, filtroVis));
  }
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }))
    .filter(a => a && a.estado === PUBLICADO)
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))
      || String(b.hora || '').localeCompare(String(a.hora || '')));
}

/* Lo que el usuario marcó de cada alerta. Es suyo y de nadie más; si no se puede leer
   (mail sin verificar, regla todavía sin publicar) la pestaña se dibuja igual y lo dice:
   antes que mostrar todo como "sin leer" sin explicación. */
async function leerEstados(ctx) {
  if (!ctx.S.verificado) return null;
  const snap = await getDocs(collection(db(), 'inversores', ctx.S.email, 'alertasEstado'));
  const out = {};
  snap.docs.forEach(d => { out[d.id] = d.data() || {}; });
  return out;
}

// caché por cuenta (y por plan: al detectarse PRO se vuelve a consultar con el gate nuevo)
let _datos = null;
async function cargar(ctx, forzar) {
  const email = ctx.S.email, pro = !!ctx.S.pro;
  if (!forzar && _datos && _datos.email === email && _datos.pro === pro) return _datos;
  const [alertas, estados] = await Promise.all([
    leerAlertas(ctx),
    Promise.resolve().then(() => leerEstados(ctx)).catch(() => undefined),
  ]);
  const d = { email, pro, alertas, estados: estados || {}, falloEstados: estados === undefined };
  _datos = d;
  return d;
}

const leida = (d, a) => !!(d.estados[a.id] || {}).leida;
const hecha = (d, a) => !!(d.estados[a.id] || {}).hecha;

/* el contador del lateral: cuántas no leyó todavía. Lo llama panel.js (contadores) */
export async function contarNoLeidas(ctx) {
  const d = await cargar(ctx);
  return d.alertas.filter(a => !leida(d, a)).length;
}

/* marca alertas en inversores/{email}/alertasEstado/{alertaId}. Va en LOTE y no de a
   una: "Marcar todas como leídas" puede tocar veinte documentos, y de a una alcanza
   con que falle la décima para que la mitad quede marcada en el servidor, la caché de
   acá no se toque y la pantalla muestre una cosa distinta de la que hay guardada.
   merge: "Ya lo hice" no puede borrar el "leída" que ya estaba, ni al revés */
const LOTE_MAX = 400;   // el tope de Firestore son 500 operaciones por lote
async function marcar(ctx, ids, campos) {
  const email = ctx.S.email;
  for (let i = 0; i < ids.length; i += LOTE_MAX) {
    const lote = writeBatch(db());
    ids.slice(i, i + LOTE_MAX).forEach(id => lote.set(
      doc(db(), 'inversores', email, 'alertasEstado', String(id)),
      { ...campos, cuando: serverTimestamp() }, { merge: true }));
    await lote.commit();
  }
  if (_datos && _datos.email === email) {
    ids.forEach(id => { _datos.estados[id] = { ...(_datos.estados[id] || {}), ...campos }; });
  }
}

/* ───────────────────────── estado del módulo ───────────────────────── */
const E = { email: null, filtro: 'todas' };
let _el = null, _ctx = null, _seq = 0, _ocupado = false;

/* ───────────────────────── entrada ───────────────────────── */
export async function renderAlertas(el, ctx) {
  if (!el || !ctx) return;
  try {
    ponerCss();
    _el = el; _ctx = ctx;
    if (E.email !== ctx.S.email) { E.email = ctx.S.email; E.filtro = 'todas'; }
    if (!el.__alertas) {
      el.__alertas = true;
      el.addEventListener('click', alClic);
    }
    if (!el.querySelector('.v3al')) el.innerHTML = '<p class="v3al-cargando">Cargando tus alertas…</p>';
    await dibujar(false);
  } catch (e) {
    try { el.innerHTML = errorHtml(); } catch (x) {}
  }
}

const errorHtml = () => `<div class="v3al"><div class="v3al-vacio"><b>No pudimos leer las alertas</b>
  <p>Puede ser la conexión.<button type="button" class="v3al-reint" data-al="reintentar">Reintentar</button></p></div></div>`;

async function dibujar(forzar) {
  const el = _el, ctx = _ctx;
  if (!el || !ctx) return;
  const email = ctx.S.email, seq = ++_seq;
  try {
    const d = await cargar(ctx, forzar);
    if (ctx.S.email !== email || seq !== _seq) return;
    el.innerHTML = armar(d, ctx);
  } catch (e) {
    if (ctx.S.email !== email || seq !== _seq) return;
    el.innerHTML = errorHtml();
  }
}

/* ───────────────────────── armado ───────────────────────── */
function armar(d, ctx) {
  const esc = ctx.esc, S = ctx.S;
  const hoy = ctx.hoyAR();
  const todas = d.alertas;
  const vis = todas.filter(a => E.filtro === 'todas' || a.tipo === E.filtro);
  const sinLeer = todas.filter(a => !leida(d, a)).length;
  const puedeMarcar = !!S.verificado && !d.falloEstados;

  const avisos = [
    !S.verificado ? 'Verificá tu mail para marcar alertas como leídas o como replicadas: hasta entonces los botones quedan apagados.' : '',
    S.verificado && d.falloEstados ? 'No pudimos leer qué alertas ya marcaste, así que todas aparecen sin leer. Probá de nuevo en un rato.' : '',
  ].filter(Boolean).map(t => `<div class="v3al-aviso">${esc(t)}</div>`).join('');

  let cuerpo;
  if (!vis.length) {
    cuerpo = todas.length
      ? `<div class="v3al-vacio"><b>Nada con este filtro</b><p>No hay alertas de ese tipo todavía.</p></div>`
      : vacio(ctx);
  } else {
    cuerpo = `<div class="v3al-lista">${grupos(vis, hoy, ctx).map(g => `<div>
      <div class="v3al-dia">${esc(g.titulo)}</div>
      <div class="v3al-card">${g.items.map(a => item(a, d, ctx, puedeMarcar)).join('')}</div></div>`).join('')}</div>`;
  }

  return `<div class="v3al"><div class="v3al-grid">
    <div class="v3al-col">
      <div class="v3al-top">
        <div class="v3al-fil" role="group" aria-label="Tipo de alerta">${FILTROS.map(([k, l]) => {
          const n = k === 'todas' ? todas.length : todas.filter(a => a.tipo === k).length;
          return `<button type="button" class="v3al-sel${E.filtro === k ? ' on' : ''}" aria-pressed="${E.filtro === k}" data-al="filtro:${k}">${l} <span class="v3al-n">${n}</span></button>`;
        }).join('')}</div>
        <button type="button" class="v3al-leer" data-al="leertodas"${puedeMarcar && sinLeer ? '' : ' disabled'}>Marcar todas como leídas</button>
      </div>
      ${avisos}
      ${cuerpo}
      ${S.pro ? '' : bloquePro(ctx)}
      <p class="v3al-nota">Cada alerta es una operación de una cartera modelo de Valtia, con el precio al que se hizo y por qué. No es una recomendación personalizada ni una orden: vos decidís si la replicás en tu broker. “Ya lo hice” queda guardado en tu cuenta, es solo tuyo y no cambia nada de la cartera.</p>
    </div>
    <aside class="v3al-lat">${esteMes(todas, d, ctx)}
      <div class="v3al-lado"><div class="v3al-eye">Cómo te llegan</div>
        <p>Cada alerta queda acá, en tu panel, apenas se publica. El mail es aparte: en <b>Mi cuenta</b> elegís qué avisos querés recibir, y ahí mismo te dice cuáles ya salen y cuáles todavía no.</p>
        <p><a class="v3al-ir" href="#panel/cuenta" data-go="cuenta">Elegir qué avisos recibir →</a></p>
      </div>
    </aside>
  </div></div>`;
}

/* lo que hay que decir cuando todavía no hay ninguna: qué va a aparecer acá, sin
   prometer cuándo (hasta que Lauti use Operar, esto es lo que se ve) */
function vacio(ctx) {
  const abiertas = ctx.S.pro ? '' : ' Las de las carteras abiertas las vas a ver con cualquier plan.';
  return `<div class="v3al-vacio"><b>Todavía no hay alertas</b>
    <p>Acá va a quedar cada movimiento de las carteras Valtia: qué se compró o se vendió, a qué precio,
    en qué cartera y por qué se hizo, y también cuando cambia el peso de una posición. Cada uno con su
    día y su hora, el más nuevo arriba.${abiertas}</p>
    <a class="v3al-ir" href="#panel/carteras" data-go="carteras">Ver las carteras →</a></div>`;
}

/* agrupa por día, respetando el orden en que vienen (la más nueva arriba) */
function grupos(vis, hoy, ctx) {
  const out = [];
  vis.forEach(a => {
    const f = esISO(String(a.fecha || '').slice(0, 10)) ? String(a.fecha).slice(0, 10) : '';
    let g = out[out.length - 1];
    if (!g || g.f !== f) out.push(g = { f, titulo: tituloDia(f, hoy, ctx), items: [] });
    g.items.push(a);
  });
  return out;
}

function tituloDia(f, hoy, ctx) {
  if (!f) return 'Sin fecha';
  const meses = Array.isArray(ctx.MESES) && ctx.MESES.length === 12 ? ctx.MESES : MESES_DEF;
  const dia = DIAS[new Date(T12(f)).getUTCDay()] || '';
  const txt = `${dia} ${Number(f.slice(8, 10))} de ${meses[Number(f.slice(5, 7)) - 1] || ''}`
    + (f.slice(0, 4) !== hoy.slice(0, 4) ? ' de ' + f.slice(0, 4) : '');
  if (f === hoy) return 'Hoy · ' + txt;
  if (f === addD(hoy, -1)) return 'Ayer · ' + txt;
  return may(txt);
}

/* el título se arma con los datos de la alerta: nada que no esté en el documento */
function titulo(a, ctx) {
  const tk = String(a.ticker || '').trim().toUpperCase();
  const px = finito(a.precio) ? ' a US$' + ctx.num(Number(a.precio), 2) : '';
  if (a.tipo === 'compra') return tk ? `Compré ${tk}${px}` : 'Compra en la cartera';
  if (a.tipo === 'venta') return tk ? `Vendí ${tk}${px}` : 'Venta en la cartera';
  if (a.tipo === 'peso') return tk ? `Cambié el peso de ${tk}` : 'Cambié los pesos de la cartera';
  return tk ? `${tk}${px}` : 'Novedad de la cartera';
}

function item(a, d, ctx, puedeMarcar) {
  const esc = ctx.esc;
  const [rot, color, fondo] = TIPOS[a.tipo] || [may(a.tipo || 'Novedad'), 'var(--v3-mut)', 'var(--v3-neutro)'];
  const nueva = !leida(d, a);
  const ya = hecha(d, a);
  const cart = String(a.carteraNombre || a.cartera || '').trim();
  const emp = String(a.empresa || '').trim();
  const sub = [cart, emp].filter(Boolean).join(' · ');
  const id = String(a.id);
  const acc = [];
  if (ACCIONABLE(a.tipo)) {
    acc.push(`<button type="button" class="v3al-btn${ya ? ' ok' : ''}" data-al="hecha:${esc(id)}"${puedeMarcar ? '' : ' disabled'}
      title="${ya ? 'Marcada como replicada en tu broker' : 'Marcá que ya la replicaste en tu broker'}">${ya ? '✓ Hecho' : 'Ya lo hice'}</button>`);
  }
  if (a.cartera) acc.push(`<a class="v3al-ir" href="/cartera?c=${encodeURIComponent(String(a.cartera))}">Ver cartera →</a>`);
  return `<div class="v3al-it${nueva ? ' nueva' : ''}" data-al="leer:${esc(id)}">
    <div class="v3al-tipo"><span class="v3al-pill" style="color:${color};background:${fondo}">${esc(rot)}</span>
      ${a.hora ? `<span class="v3al-hora">${esc(String(a.hora).slice(0, 5))}</span>` : ''}</div>
    <div class="v3al-cuerpo">
      <div class="v3al-tit">${nueva ? '<i class="v3al-pt" aria-label="sin leer" title="sin leer"></i>' : ''}<b>${esc(titulo(a, ctx))}</b></div>
      ${sub ? `<div class="v3al-sub">${esc(sub)}</div>` : ''}
      ${a.razonamiento ? `<div class="v3al-raz">${esc(a.razonamiento)}</div>` : ''}
      ${acc.length ? `<div class="v3al-acc">${acc.join('')}</div>` : ''}
    </div></div>`;
}

/* "Este mes": tres cifras, todas contadas sobre las alertas que este usuario puede leer */
function esteMes(todas, d, ctx) {
  const mes = ctx.hoyAR().slice(0, 7);
  const delMes = todas.filter(a => String(a.fecha || '').slice(0, 7) === mes);
  const acc = delMes.filter(a => ACCIONABLE(a.tipo));
  const carteras = new Set(delMes.map(a => String(a.cartera || a.carteraNombre || '')).filter(Boolean));
  const cifras = [
    [String(delMes.length), delMes.length === 1 ? 'alerta' : 'alertas'],
    [`${acc.filter(a => hecha(d, a)).length}/${acc.length}`, 'replicadas'],
    [String(carteras.size), carteras.size === 1 ? 'cartera' : 'carteras'],
  ];
  return `<div class="v3al-mes"><div class="v3al-eye">Este mes</div>
    <div class="v3al-cif">${cifras.map(([v, k]) => `<div><div class="v">${ctx.esc(v)}</div><div class="k">${ctx.esc(k)}</div></div>`).join('')}</div></div>`;
}

/* Plan gratis: la lista de las carteras de suscriptores va desenfocada con el acceso a
   /planes. Atrás no hay alertas de mentira —serían datos inventados—: hay barras vacías */
function bloquePro(ctx) {
  const sk = `<div class="v3al-sk"><div class="a"><i></i><i></i></div><div class="b"><i></i><i></i><i></i></div></div>`;
  return `<div class="v3al-pro">
    <div class="v3al-velo v3al-card" aria-hidden="true">${sk}${sk}${sk}</div>
    <div class="v3al-lock">
      <b>Las alertas son parte de Valtia PRO</b>
      <p>Cada compra, venta y cambio de peso de las carteras de suscriptores, el mismo día, con el precio y la razón. Las de las carteras abiertas las ves siempre.</p>
      <a class="v3al-cta" href="/planes">Ver planes</a>
    </div></div>`;
}

/* ───────────────────────── interacción ───────────────────────── */
async function alClic(ev) {
  if (!_ctx || ev.currentTarget !== _el) return;
  const t = ev.target.closest('[data-al]');
  if (!t || !_el.contains(t)) return;
  const s = String(t.dataset.al || ''), i = s.indexOf(':');
  const acc = i < 0 ? s : s.slice(0, i), val = i < 0 ? '' : s.slice(i + 1);
  const ctx = _ctx;

  if (acc === 'filtro') {
    if (!FILTROS.some(x => x[0] === val)) return;
    ev.preventDefault();
    E.filtro = val;
    dibujar(false);
    return;
  }
  if (acc === 'reintentar') { ev.preventDefault(); dibujar(true); return; }
  // los links de adentro de una alerta (Ver cartera) navegan igual: no se les toca el clic
  if (acc === 'leer' && ev.target.closest('a')) return;
  if (!ctx.S.verificado || _ocupado) return;

  const d = _datos;
  if (!d || d.email !== ctx.S.email) return;

  if (acc === 'leer') {
    const a = d.alertas.find(x => String(x.id) === val);
    if (!a || leida(d, a)) return;
    await guardar(ctx, [val], { leida: true });
    return;
  }
  if (acc === 'hecha') {
    ev.preventDefault();
    const a = d.alertas.find(x => String(x.id) === val);
    if (!a) return;
    await guardar(ctx, [val], { hecha: !hecha(d, a), leida: true });
    return;
  }
  if (acc === 'leertodas') {
    ev.preventDefault();
    const ids = d.alertas.filter(x => !leida(d, x)).map(x => String(x.id));
    if (!ids.length) return;
    await guardar(ctx, ids, { leida: true });
  }
}

/* una sola puerta de escritura: guarda, avisa si falla y repinta la pestaña Y el
   contador del lateral (por eso va por ctx.refrescar y no por dibujar) */
async function guardar(ctx, ids, campos) {
  _ocupado = true;
  try {
    await marcar(ctx, ids, campos);
    ctx.refrescar('alertas');
  } catch (e) {
    try { ctx.toast('No se pudo guardar (' + String((e && (e.code || e.message)) || e).slice(0, 40) + ')'); } catch (x) {}
  } finally {
    _ocupado = false;
  }
}
