// panel-operar.js — pestaña "Operar carteras" de la gestión (solo admin).
// Es la pantalla donde Lauti registra los movimientos de las carteras modelo:
// compré, vendí o cambié el peso. Un movimiento a la vez desde el celular, o
// una rotación entera pegada desde la planilla.
//
// Cinco reglas que ordenan todo el módulo:
//
// 1. Operar NO escribe precios. `precioEntrada`, `precioActual` y
//    `fechaSeguimiento` los pone el pipeline (fondo_sync.actualizar_carteras)
//    con precios reales el día que la posición empieza a seguirse. El precio de
//    la operación va SOLO en la alerta y en el documento de historial.
//    La subcolección `valores` tampoco se toca: la escribe el sync.
//
// 2. Guardar es SOLO un borrador. Al guardar (un movimiento o la rotación
//    pegada entera) se escribe ÚNICAMENTE su documento en `alertas`, en estado
//    "borrador", con todo lo que hace falta para ejecutarlo después: el peso
//    anterior y el nuevo, si la posición existía y en qué estado, la acción y
//    el tipo de activo cuando es nueva. NADA se toca en `posiciones` ni en
//    `historial`: la cartera sigue igual para todos y el pipeline no ve ninguna
//    entrada nueva, así que no sale ningún mail. Un borrador lo lee solo el
//    admin (lo corta la regla de `alertas`). En una pegada, un borrador por fila.
//
// 3. Publicar es TODO de una vez. Un borrador —o todos los de una cartera— se
//    publica en UN solo writeBatch: la posición con el peso nuevo ("activa", o
//    "cerrada" si queda en 0; nunca se borra), el documento de historial y la
//    alerta en estado "publicado". Antes de escribir se relee la posición: si
//    ya no está como cuando se guardó el borrador (alguien publicó otro
//    movimiento en el medio), se frena y se avisa en vez de pisar.
//
// 4. El peso se carga en PORCENTAJE y se guarda en FRACCIÓN (0 a 1), que es
//    como vive `pesoObjetivo` en Firestore. La conversión pasa por aFraccion()
//    y por ningún otro lado.
//
// 5. Deshacer. Un borrador se descarta borrando su alerta y listo. Un
//    movimiento PUBLICADO se deshace dentro de los 15 minutos, en un batch: la
//    posición vuelve al peso y al estado anterior (o se borra, si no existía
//    antes), y se borran el documento de historial y la alerta. Se apaga si ya
//    hay un movimiento más nuevo del mismo ticker, o si la posición ya no tiene
//    el peso que dejó este movimiento: devolver el peso viejo pisaría lo que
//    hizo el otro.
//
// Acá NO se manda ningún mail ni se escribe avisosRotacion: el aviso de
// rotación lo arma el pipeline (avisos_rotacion.py) en su próxima corrida,
// mirando las entradas nuevas de `historial`, que recién aparecen al publicar.
// Cuándo corre exactamente no está en este repo: por eso la pantalla dice
// "la próxima corrida automática" y no promete un horario.
//
// La piel es la del panel: SOLO variables --v3-* de panel.js (así anda el tema
// oscuro). No importa panel.js —sería un import circular—: todo llega por ctx.
import { getFirestore, collection, getDocs, getDoc, doc, writeBatch, deleteDoc, deleteField, query, where, Timestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
// el mismo lector de números que usa la importación de Mi cartera: acepta
// 1.900,50 y 1900.50. Se importa con el mismo ?v= que panel.js para que el
// navegador reutilice el módulo que ya cargó y no baje una segunda copia.
import { parseNum } from './mi-cartera.js?v=45';

const CSS_ID = 'v3-css-operar';
const db = () => getFirestore(getApp());

/* ── constantes de la pantalla ── */
// lo que Lauti elige; `tipo` queda guardado tal cual en el movimiento
const TIPOS = [['compra', 'Compré'], ['venta', 'Vendí'], ['peso', 'Cambié el peso']];
// los tipoActivo que existen hoy en las posiciones
const TIPOS_ACTIVO = [['accion', 'Acción'], ['bono', 'Bono'], ['letra', 'Letra']];
const DESTINOS = [['todos', 'Todos'], ['suscriptores', 'Solo suscriptores']];
const DESTINO_TXT = { todos: 'para todos', suscriptores: 'solo suscriptores' };
const VIS = { publico: 'Pública', clientes: 'Suscriptores', borrador: 'Borrador' };
// los dos estados que viven en `alertas` y en `historial`: el mismo par que
// lee panel-alertas.js (pide estado == 'publicado') y que corta la regla
const BORRADOR = 'borrador', PUBLICADO = 'publicado';
const VENTANA_MIN = 15;     // los minutos que dura el "Deshacer" de un publicado
const MAX_PEGADA = 40;      // borradores por pegada (un documento cada uno)
const MAX_PUBLICAR = 150;   // por publicación: el tope de Firestore son 500 operaciones por lote y cada movimiento son tres
const MAX_LISTA = 12;       // cuántos movimientos publicados se listan abajo (los borradores van todos)

const CSS = `
.v3op{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);max-width:1080px;min-width:0}
.v3op *{box-sizing:border-box}
.v3op button,.v3op input,.v3op select,.v3op textarea{font-family:inherit}
.v3op-tit{font:700 30px 'Playfair Display',serif;color:var(--v3-ink);line-height:1.1;margin:0;letter-spacing:.01em}
.v3op-sub{font-size:13px;color:var(--v3-sub);line-height:1.7;margin:8px 0 18px;max-width:720px}
.v3op-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:18px 20px;margin-bottom:14px;min-width:0}
.v3op-h{font:700 18px 'Playfair Display',serif;color:var(--v3-ink);line-height:1.25;margin:0}
.v3op-p{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:4px 0 0}
.v3op-k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--v3-mut);margin:0 0 8px}
.v3op-n{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
/* los avisos honestos: qué hace el sync y qué no hace esta pantalla */
.v3op-honesto{background:var(--v3-goldTint);border:1px solid var(--v3-line);border-left:3px solid var(--v3-gold);
  border-radius:12px;padding:14px 18px;margin-bottom:16px}
.v3op-honesto ul{list-style:none;padding:0;margin:8px 0 0}
.v3op-honesto li{font-size:12.5px;color:var(--v3-sub);line-height:1.65;padding:6px 0;display:flex;gap:10px;align-items:flex-start}
.v3op-honesto li::before{content:'—';color:var(--v3-gold);flex:none;line-height:1.65}
.v3op-honesto b{color:var(--v3-ink);font-weight:600}
/* campos */
.v3op-gr{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:14px}
.v3op-f{min-width:0}
.v3op-f.ancho{grid-column:1/-1}
.v3op label,.v3op .v3op-lbl{display:block;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;
  text-transform:uppercase;color:var(--v3-sub);margin-bottom:6px}
.v3op input,.v3op select,.v3op textarea{width:100%;padding:10px 12px;background:var(--v3-card);border:1px solid var(--v3-line);
  border-radius:8px;color:var(--v3-ink);font:400 14px 'IBM Plex Sans',system-ui,sans-serif;outline:none}
.v3op select{font-size:13.5px}
.v3op textarea{min-height:66px;resize:vertical;line-height:1.6}
.v3op input:focus,.v3op select:focus,.v3op textarea:focus{border-color:var(--v3-gold)}
.v3op input[data-op-ticker]{font:600 14px 'IBM Plex Mono',monospace;text-transform:uppercase}
.v3op input[type="number"]{font:500 14px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.v3op-ayuda{font-size:11.5px;color:var(--v3-mut);line-height:1.6;margin-top:6px;min-height:1px}
.v3op-ayuda b{color:var(--v3-sub);font:600 11.5px 'IBM Plex Mono',monospace}
.v3op-pie{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid var(--v3-line)}
.v3op-msg{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:10px 0 0;overflow-wrap:anywhere}
.v3op-msg.ok{color:var(--v3-up)}
.v3op-msg.mal{color:var(--v3-dn)}
/* botones */
.v3op-b{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#0E1830;
  background:var(--v3-goldL);border:1px solid var(--v3-goldL);border-radius:7px;padding:10px 18px;cursor:pointer;
  white-space:nowrap;transition:background .15s,color .15s,border-color .15s}
.v3op-b:hover:not([disabled]){background:var(--v3-card);color:var(--v3-ink);border-color:var(--v3-gold)}
.v3op-b[disabled]{opacity:.45;cursor:default}
.v3op-b.sec{background:transparent;color:var(--v3-ink);border-color:var(--v3-line)}
.v3op-b.sec:hover:not([disabled]){border-color:var(--v3-gold);color:var(--v3-gold2)}
.v3op-b.mini{padding:7px 12px;font-size:10px;letter-spacing:.08em}
.v3op-b.peligro{background:transparent;color:var(--v3-dn);border-color:var(--v3-line)}
.v3op-b.peligro:hover:not([disabled]){border-color:var(--v3-dn);color:var(--v3-dn)}
/* pastillas */
.v3op-tag{display:inline-block;font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  padding:3px 7px;border-radius:4px;white-space:nowrap;line-height:1.5;vertical-align:middle}
.v3op-tag.pub{color:var(--v3-up);background:var(--v3-upBg)}
.v3op-tag.sus{color:var(--v3-gold2);background:var(--v3-goldBg)}
.v3op-tag.bor{color:var(--v3-warn);background:var(--v3-warnBg)}
.v3op-tag.mut{color:var(--v3-mut);background:var(--v3-neutro)}
.v3op-banda{font-size:12.5px;color:var(--v3-warn);background:var(--v3-warnBg);border-radius:8px;
  padding:9px 12px;line-height:1.6;margin:12px 0 0}
/* pegar desde planilla */
.v3op-peg textarea{min-height:130px;font:400 12.5px 'IBM Plex Mono',ui-monospace,monospace;line-height:1.7}
.v3op-hint{font-size:11.5px;color:var(--v3-mut);line-height:1.7;margin:8px 0 12px}
.v3op-hint b{color:var(--v3-sub)}
.v3op-prev{margin-top:12px;border:1px solid var(--v3-line);border-radius:10px;overflow-x:auto}
.v3op-prev table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:620px}
.v3op-prev th{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);
  padding:8px 10px;border-bottom:1px solid var(--v3-line);text-align:left;white-space:nowrap}
.v3op-prev td{padding:8px 10px;border-bottom:1px solid var(--v3-line2);color:var(--v3-ink);white-space:nowrap;vertical-align:top}
.v3op-prev td.razon{white-space:normal;min-width:160px;color:var(--v3-sub)}
.v3op-prev tr:last-child td{border-bottom:none}
.v3op-prev tr.mal td{background:var(--v3-dnBg)}
.v3op-prev .v3op-n{font-family:'IBM Plex Mono',monospace}
.v3op-mal{color:var(--v3-dn)}
/* últimos movimientos */
.v3op-todos{display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
.v3op-todos .nota{font-size:11.5px;color:var(--v3-mut);line-height:1.5}
.v3op-mov{border:1px solid var(--v3-line);border-radius:10px;padding:12px 14px;margin-bottom:9px;background:var(--v3-card)}
.v3op-mov.bor{border-left:3px solid var(--v3-warn)}
.v3op-mov .arriba{display:flex;gap:8px 12px;align-items:baseline;flex-wrap:wrap}
.v3op-mov .tk{font:700 14px 'IBM Plex Sans',sans-serif;color:var(--v3-gold);white-space:nowrap}
.v3op-mov .em{font-size:12.5px;color:var(--v3-sub);min-width:0;overflow-wrap:anywhere}
.v3op-mov .fe{font:500 11px 'IBM Plex Mono',monospace;color:var(--v3-mut);white-space:nowrap;margin-left:auto}
.v3op-mov .cifras{display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--v3-sub)}
.v3op-mov .cifras b{font:600 12.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink)}
.v3op-mov .raz{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin-top:8px;overflow-wrap:anywhere}
.v3op-mov .acc{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.v3op-mov .acc .nota{font-size:11.5px;color:var(--v3-mut);line-height:1.5}
.v3op-vacio{font-size:12.5px;color:var(--v3-mut);line-height:1.7}
.v3op-sk i{display:block;height:11px;border-radius:5px;background:var(--v3-track);margin:7px 0}
.v3op-sk i.corta{width:45%}
@media (max-width:520px){
  .v3op-tit{font-size:25px}
  .v3op-card{padding:16px 14px}
  .v3op-honesto{padding:12px 14px}
  .v3op-pie .v3op-b{width:100%;text-align:center}
  .v3op-mov .fe{margin-left:0;flex-basis:100%}
}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ───────────────────────── utilidades ───────────────────────── */
// la hora y el día de Buenos Aires con la misma cuenta que hoyAR() de panel.js (UTC−3)
const horaAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 16);
const hoyARL = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
// sufijo corto del id del movimiento: dos movimientos del mismo ticker el mismo
// día NO se pueden pisar. Va el milisegundo primero (que nunca se repite entre
// dos guardadas) y recién después lo azaroso, que suelto podía salir vacío:
// Math.random().toString(36) no siempre trae cinco cifras después del punto
const sufijo = () => Date.now().toString(36).slice(-4) +
  Math.random().toString(36).slice(2, 5).padEnd(3, '0');
const norm = s => String(s ?? '').trim();
const limpiarTicker = s => norm(s).toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
const tickerDe = x => String((x && x.ticker) || '').trim().toUpperCase();
// para comparar nombres de cartera pegados a mano: sin acentos, sin mayúsculas
// lo que saca el replace son los combinantes Unicode (̀-ͯ), que es lo que deja normalize('NFD'). El archivo se sirve como UTF-8.
const plano = s => norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// porcentaje → fracción (0 a 1), que es como vive pesoObjetivo en Firestore
const aFraccion = p => Math.round(Number(p) * 1e6) / 1e8;
const aPorcentaje = f => Number(f) * 100;
const esNum = v => v != null && v !== '' && typeof v !== 'boolean' && isFinite(Number(v));
// dos pesos son "el mismo" si son el mismo número (con tolerancia de redondeo)
// o si los dos faltan: es la comparación de la guarda del publicar y del deshacer
const mismoPeso = (a, b) => esNum(a) && esNum(b) ? Math.abs(Number(a) - Number(b)) < 1e-9 : !esNum(a) && !esNum(b);
const pctTxt = f => f == null || !isFinite(Number(f)) ? '—'
  : aPorcentaje(f).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + '%';
const numTxt = n => n == null || !isFinite(Number(n)) ? '—'
  : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 4 });
const codigoErr = e => String((e && (e.code || e.message)) || e || '').slice(0, 90);

/* fecha en ISO desde lo que sea que haya pegado: 2026-09-23 o 23/09/2026 */
function fechaISO(s) {
  const t = norm(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

/* ¿qué le pasa a la posición? El `accion` describe el HECHO, no la palabra que
   eligió Lauti (esa queda en `tipo`):
     · añadido   → el ticker entra a la cartera (no estaba, o estaba cerrada)
     · eliminado → el peso queda en 0 y la posición pasa a "cerrada"
     · ajustado  → ya estaba y sigue adentro con otro peso */
function accionDe(pos, fr) {
  if (!(fr > 0)) return 'eliminado';
  if (!pos || pos.estado === 'cerrada') return 'añadido';
  return 'ajustado';
}
const ACCION_TXT = { 'añadido': 'Entra', 'eliminado': 'Sale', 'ajustado': 'Cambia de peso' };

/* ───────────────────────── estado del módulo ───────────────────────── */
let _seq = 0;                // secuencia del render
let _carga = 0;              // secuencia de la lectura de la cartera elegida
let _email = null;           // la cuenta que dejó este estado
let _carteras = [];          // las 6 carteras modelo, como vienen de Firestore
let _cid = '';               // la cartera elegida
let _pos = new Map();        // ticker → posición de la cartera elegida
let _movs = [];              // historial de la cartera elegida, del más nuevo al más viejo
let _borradores = [];        // alertas en borrador de la cartera elegida, de la más nueva a la más vieja
let _fallo = '';             // si alguna de las tres lecturas de la cartera elegida falló, el código del error
let _pegadas = [];           // las filas válidas de la última vista previa
let _tkPrev = '';            // el último ticker tipeado, para saber cuándo cambió

// todo esto es de UNA cuenta: si entra otra, no se hereda nada
function olvidarTodo() {
  _carga++; _carteras = []; _cid = ''; _pos = new Map(); _movs = []; _borradores = []; _fallo = ''; _pegadas = []; _tkPrev = '';
}

const carteraDe = id => _carteras.find(c => c.id === id) || null;
const monedaDe = c => c && norm(c.moneda) ? norm(c.moneda) + ' ' : '';

/* ───────────────────────── lecturas ───────────────────────── */
async function leerCarteras() {
  const snap = await getDocs(collection(db(), 'carterasModelo'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.nombre || a.id).localeCompare(String(b.nombre || b.id), 'es'));
}

async function leerPosiciones(cid) {
  const snap = await getDocs(collection(db(), 'carterasModelo', cid, 'posiciones'));
  const m = new Map();
  // el id del documento ES el ticker: se indexa por ahí y no por el campo
  snap.docs.forEach(d => m.set(String(d.id).toUpperCase(), { id: d.id, ...d.data() }));
  return m;
}

async function leerHistorial(cid) {
  const snap = await getDocs(collection(db(), 'carterasModelo', cid, 'historial'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) =>
    String(b.fecha || '').localeCompare(String(a.fecha || '')) ||
    String(b.creado || '').localeCompare(String(a.creado || '')) ||
    String(b.id).localeCompare(String(a.id)));
}

/* los borradores de UNA cartera: las alertas con cartera == cid y estado
   "borrador". Solo el admin las puede listar (la regla de `alertas` corta a
   cualquier otro en estado == 'publicado'), y esta pantalla es solo del admin */
async function leerBorradores(cid) {
  const col = collection(db(), 'alertas');
  let snap;
  try {
    snap = await getDocs(query(col, where('cartera', '==', cid), where('estado', '==', BORRADOR)));
  } catch (e) {
    // si a Firestore le faltara un índice para las dos igualdades juntas, se
    // pide solo por cartera y el estado se filtra abajo. Cualquier otro error
    // (empezando por el permiso) sube y lo muestra la lista
    if (String((e && e.code) || '') !== 'failed-precondition') throw e;
    snap = await getDocs(query(col, where('cartera', '==', cid)));
  }
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }))
    .filter(a => a.estado === BORRADOR)
    .sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')) ||
      String(b.id).localeCompare(String(a.id)));
}

/* ───────────────────────── armado de un borrador ─────────────────────────
   De los datos del formulario (o de una fila pegada) al documento de `alertas`
   que se guarda en borrador. Es puro: no toca Firestore, solo arma el documento
   y el ref lo pone ponerBorradorEnLote(). Devuelve { error } si algo no cierra.
   El borrador lleva TODO lo que hace falta para ejecutarlo al publicar (peso
   anterior y nuevo, si la posición existía y en qué estado, la acción, el tipo
   de activo si es nueva): al publicar no se vuelve a mirar el formulario. */
function armarMovimiento({ cartera, tipo, ticker, empresa, tipoActivo, pesoPct, precio, fecha, hora, razon, para }, posMapa, borradores) {
  const tk = limpiarTicker(ticker);
  if (!cartera) return { error: 'Elegí la cartera.' };
  if (!TIPOS.some(t => t[0] === tipo)) return { error: 'Elegí qué hiciste.' };
  if (!tk) return { error: 'Cargá el ticker.' };
  if (tk.length > 16) return { error: `El ticker "${tk.slice(0, 18)}" es demasiado largo.` };
  // el campo vacío NO es un cero: un 0 cierra la posición, así que tiene que
  // estar escrito
  const fr = aFraccion(pesoPct);
  if (norm(pesoPct) === '' || !isFinite(Number(pesoPct)) || fr < 0 || fr > 1) {
    return { error: 'El peso va en porcentaje, de 0 a 100 (se guarda como fracción de 0 a 1).' };
  }
  const px = Number(precio);
  if (!(px > 0)) return { error: 'Cargá el precio de la operación.' };
  const f = fechaISO(fecha);
  if (!f) return { error: 'La fecha va como 2026-09-23 o 23/09/2026.' };
  // un movimiento es algo que YA pasó: una fecha adelantada (un año mal tipeado)
  // se quedaría arriba de la lista para siempre y el aviso saldría antes de tiempo
  if (f > hoyARL()) return { error: 'La fecha no puede ser posterior a hoy.' };
  const hr = /^\d{2}:\d{2}$/.test(norm(hora)) ? norm(hora) : '';
  if (!hr) return { error: 'Cargá la hora (HH:MM).' };
  const rz = norm(razon);
  if (rz.length < 10) return { error: 'La razón es obligatoria: es lo que le da valor al suscriptor.' };

  const pos = posMapa.get(tk) || null;
  const activa = pos && pos.estado !== 'cerrada';
  if (!(fr > 0) && !activa) return { error: `${tk} no está activa en esta cartera: no se puede sacar.` };
  if (tipo === 'peso' && !activa) return { error: `${tk} no está en esta cartera: elegí "Compré".` };
  if (tipo === 'venta' && !activa) return { error: `${tk} no está en esta cartera: no se puede vender.` };
  if (tipo === 'compra' && !(fr > 0)) return { error: 'Una compra no puede quedar en 0%: usá "Vendí".' };
  // un ticker con un borrador sin publicar no admite otro: el segundo nacería
  // con un peso anterior que deja de ser cierto apenas se publique el primero,
  // y la guarda del publicar lo frenaría sí o sí
  if (Array.isArray(borradores) && borradores.some(b => tickerDe(b) === tk)) {
    return { error: `${tk} ya tiene un borrador sin publicar en esta cartera: publicalo o descartalo antes de cargar otro.` };
  }

  const emp = norm(empresa) || (pos && norm(pos.empresa)) || tk;
  const ta = TIPOS_ACTIVO.some(x => x[0] === tipoActivo) ? tipoActivo : '';
  if (!pos && !ta) return { error: `${tk} es nuevo en esta cartera: decime si es acción, bono o letra.` };

  const accion = accionDe(pos, fr);
  const ahora = new Date().toISOString();
  // el id que va a tener el documento de historial cuando se publique: queda
  // anotado en la alerta desde el borrador, así el par se reconoce siempre
  const histId = `${f}-${tk}-${sufijo()}`;
  const alertaId = `${cartera.id}-${histId}`;
  const pesoAnterior = pos && esNum(pos.pesoObjetivo) ? Number(pos.pesoObjetivo) : null;

  // la visibilidad de la ALERTA es la más angosta de las dos: la de la cartera
  // y la que eligió Lauti. "Solo suscriptores" nunca se publica a todos, y una
  // cartera en borrador no se abre por elegir "todos".
  const destino = DESTINOS.some(d => d[0] === para) ? para : 'todos';
  const visCartera = norm(cartera.visibilidad) || BORRADOR;
  const vis = visCartera === BORRADOR ? BORRADOR
    : destino === 'suscriptores' ? 'clientes' : visCartera;
  const alerta = {
    fecha: f, hora: hr, tipo, ticker: tk, empresa: emp, accion, precio: px, razonamiento: rz,
    cartera: cartera.id, carteraNombre: norm(cartera.nombre) || cartera.id,
    // la moneda de la cartera viaja con el precio: sin ella, quien lea la alerta
    // tiene que suponer en qué moneda está ese número
    moneda: norm(cartera.moneda) || '',
    visibilidad: vis, para: destino,
    // mientras esté en borrador la alerta no la ve nadie (lo corta la regla)
    estado: BORRADOR, historialId: histId, creado: ahora,
    // lo que hace falta para ejecutar el movimiento al publicar, y para deshacerlo
    pesoAnterior, pesoNuevo: fr,
    // el estado tal cual está guardado (null si el documento no tiene el campo):
    // deshacer lo devuelve exactamente así, sin inventarle un "activa"
    existiaAntes: !!pos, estadoAnterior: pos ? (norm(pos.estado) || null) : null,
  };
  // el tipo de activo solo cuando la posición todavía no existe: al publicar se
  // crea con él (una posición que se reabre conserva el que ya tiene)
  if (!pos) alerta.tipoActivo = ta;
  return { cid: cartera.id, tk, histId, alertaId, alerta, accion, pesoAnterior, pesoNuevo: fr };
}

/* guardar = UNA escritura por movimiento: el documento de alertas en borrador.
   Ni posiciones ni historial se tocan acá */
function ponerBorradorEnLote(lote, m) {
  lote.set(doc(db(), 'alertas', m.alertaId), m.alerta);
}

/* ───────────────────────── publicar: las tres escrituras ─────────────────────────
   ¿La posición sigue como cuando se guardó el borrador? Devuelve el motivo si
   no. Es la guarda contra pisar: si alguien publicó otro movimiento del mismo
   ticker en el medio, el pesoAnterior anotado ya no es el de la posición. */
function choqueDe(b, pos) {
  const tk = tickerDe(b);
  if (!tk) return 'Un borrador no dice de qué ticker es.';
  if (typeof b.existiaAntes !== 'boolean' || !esNum(b.pesoNuevo)) {
    return `${tk}: a este borrador le faltan datos (se guardó con la versión anterior de Operar). Descartalo y cargalo de nuevo.`;
  }
  if (b.existiaAntes && !pos) return `${tk}: la posición ya no está en la cartera.`;
  if (!b.existiaAntes && pos) return `${tk}: la posición ya existe en la cartera (la creó otro movimiento).`;
  if (pos) {
    if (!mismoPeso(pos.pesoObjetivo, b.pesoAnterior)) {
      return `${tk}: hoy pesa ${pctTxt(pos.pesoObjetivo)}, no el ${pctTxt(b.pesoAnterior)} que tenía cuando guardaste el borrador.`;
    }
    if ((pos.estado || 'activa') !== (b.estadoAnterior || 'activa')) {
      return `${tk}: la posición está "${pos.estado || 'activa'}", no "${b.estadoAnterior || 'activa'}" como cuando guardaste el borrador.`;
    }
  }
  return '';
}

/* las tres escrituras de UN borrador, en el lote que le pasen (el mismo para
   toda la rotación): la posición, el historial y la alerta. Devuelve el id del
   historial. precioEntrada, precioActual y fechaSeguimiento no se tocan ni de
   casualidad: por eso la posición va con merge */
function ponerPublicacionEnLote(lote, b, ahora) {
  const tk = tickerDe(b), cid = String(b.cartera), fr = Number(b.pesoNuevo);
  const emp = norm(b.empresa) || tk;
  const histId = norm(b.historialId) || `${b.fecha}-${tk}-${sufijo()}`;
  // la posición: el peso nuevo (fracción) y el estado. Nunca se borra: en 0
  // queda "cerrada"
  const posDatos = fr > 0
    ? { ticker: tk, empresa: emp, pesoObjetivo: fr, estado: 'activa' }
    : { ticker: tk, empresa: emp, pesoObjetivo: 0, estado: 'cerrada' };
  // el tipo de activo y la fecha de incorporación solo cuando el documento no
  // existe: una posición que se reabre conserva la fecha con la que nació.
  // La fecha va como Timestamp, que es el tipo con el que la escribe
  // scripts/seed-carteras.js (serverTimestamp) y el que lee cartera.html
  if (!b.existiaAntes) {
    if (norm(b.tipoActivo)) posDatos.tipoActivo = norm(b.tipoActivo);
    const dia = Date.parse(String(b.fecha) + 'T12:00:00Z');
    posDatos.fechaIncorporacion = Timestamp.fromDate(new Date(isFinite(dia) ? dia : Date.now()));
  }
  lote.set(doc(db(), 'carterasModelo', cid, 'posiciones', tk), posDatos, { merge: true });
  // el historial: los campos del modelo más lo que hace falta para deshacer.
  // `creado` es el momento de PUBLICAR (recién ahí existe el documento): de ahí
  // corren los 15 minutos del deshacer
  lote.set(doc(db(), 'carterasModelo', cid, 'historial', histId), {
    fecha: b.fecha, ticker: tk, empresa: emp, accion: b.accion, precio: b.precio, razonamiento: b.razonamiento,
    tipo: b.tipo, hora: b.hora || '',
    pesoAnterior: esNum(b.pesoAnterior) ? Number(b.pesoAnterior) : null, pesoNuevo: fr,
    existiaAntes: !!b.existiaAntes, estadoAnterior: b.estadoAnterior || null,
    alertaId: b.id, estado: PUBLICADO, creado: ahora, publicado: ahora,
  });
  lote.update(doc(db(), 'alertas', b.id), { estado: PUBLICADO, publicado: ahora, historialId: histId });
  return histId;
}

/* ───────────────────────── la pantalla ───────────────────────── */
export async function renderOperar(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S.email;
  const vigente = () => seq === _seq && ctx.S.email === email;
  ponerCss();
  // otra cuenta en la misma página: las carteras y el historial de la anterior
  // no se heredan (el estado de este módulo vive fuera del div de la pestaña)
  if (_email !== email) { olvidarTodo(); _email = email; }

  // el candado de verdad es firestore.rules; esto es para no mostrar una
  // pantalla que no va a poder guardar nada
  if (!ctx.S.isAdmin) {
    el.innerHTML = `<div class="v3op"><h1 class="v3op-tit">Operar carteras</h1>
      <p class="v3op-sub">Esta pantalla es de la administración: tu cuenta no la usa.</p></div>`;
    return;
  }

  el.innerHTML = `<div class="v3op">
    <h1 class="v3op-tit">Operar carteras</h1>
    <p class="v3op-sub">Acá se registran los movimientos de las carteras modelo. Guardar deja el movimiento en
      <b>borrador</b>: no cambia la cartera ni avisa a nadie. <b>Publicar</b> aplica el peso nuevo y deja la
      entrada en el historial que mira la corrida automática. Un movimiento publicado se puede deshacer durante
      ${VENTANA_MIN} minutos.</p>
    ${bloqueHonesto()}
    <div class="v3op-card"><div class="v3op-sk" aria-hidden="true"><i></i><i class="corta"></i><i></i></div>
      <p class="v3op-vacio">Cargando las carteras…</p></div>
  </div>`;

  let carteras;
  try { carteras = await leerCarteras(); }
  catch (e) {
    if (!vigente()) return;
    el.querySelector('.v3op-card').innerHTML =
      `<p class="v3op-msg mal">No pude leer las carteras (${ctx.esc(codigoErr(e))}).</p>`;
    return;
  }
  if (!vigente()) return;
  _carteras = carteras;
  if (!_carteras.length) {
    el.querySelector('.v3op-card').innerHTML = '<p class="v3op-vacio">No hay ninguna cartera modelo cargada.</p>';
    return;
  }
  if (!carteraDe(_cid)) _cid = _carteras[0].id;

  // si algo de acá adentro explota, la pestaña tiene que decirlo: quedarse en
  // blanco es lo único que no puede pasar (enModulo se come la excepción)
  try {
    pintarCuerpo(el, ctx);
    await cargarCartera(el, ctx, vigente);
  } catch (e) {
    if (!vigente()) return;
    el.innerHTML = `<div class="v3op"><h1 class="v3op-tit">Operar carteras</h1>
      <p class="v3op-msg mal">No pude dibujar la pantalla (${ctx.esc(codigoErr(e))}). Recargá la página.</p></div>`;
  }
}

function bloqueHonesto() {
  return `<div class="v3op-honesto">
    <div class="v3op-k">Qué pasa después de guardar</div>
    <ul>
      <li><span>Guardar <b>no cambia nada</b>: queda un borrador que solo ves vos, en la lista de abajo.
        La cartera sigue igual para todos y no sale ningún aviso hasta que lo publiques.</span></li>
      <li><span>Publicar escribe el <b>peso nuevo en la posición</b> (lo ve cualquiera que pueda ver la cartera)
        y la entrada del historial. Desde acá <b>no sale ningún mail</b>: el aviso de rotación lo manda
        la <b>próxima corrida automática</b>, mirando las entradas nuevas del historial. No sale al instante.</span></li>
      <li><span>El <b>precio de entrada</b> y el de seguimiento los pone esa corrida con precios reales.
        Lo que cargás acá es el precio de la operación, y queda solo en el movimiento.</span></li>
    </ul>
  </div>`;
}

function pintarCuerpo(el, ctx) {
  const esc = ctx.esc;
  const cuerpo = el.querySelector('.v3op');
  if (!cuerpo) return;
  // se conserva el encabezado y los avisos; se reemplaza de la primera tarjeta para abajo
  const viejo = cuerpo.querySelector('.v3op-card');
  const html = `
    <section class="v3op-card" id="v3op-form">
      <h2 class="v3op-h">Un movimiento</h2>
      <p class="v3op-p">Lo que hiciste, en una pantalla. El peso va en porcentaje y se guarda como fracción (0 a 1).</p>
      <div class="v3op-gr" style="margin-top:16px">
        <div class="v3op-f ancho">
          <label for="v3op-cartera">Cartera</label>
          <select id="v3op-cartera" data-op-cartera>${_carteras.map(c =>
            `<option value="${esc(c.id)}"${c.id === _cid ? ' selected' : ''}>${esc(c.nombre || c.id)} · ${esc(VIS[c.visibilidad] || c.visibilidad || 'sin visibilidad')}</option>`).join('')}</select>
          <div class="v3op-ayuda" id="v3op-cartera-ay"></div>
        </div>
        <div class="v3op-f">
          <label for="v3op-tipo">Qué hiciste</label>
          <select id="v3op-tipo" data-op-tipo>${TIPOS.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select>
        </div>
        <div class="v3op-f">
          <label for="v3op-ticker">Ticker</label>
          <input id="v3op-ticker" data-op-ticker maxlength="16" autocomplete="off" spellcheck="false" placeholder="NVDA">
        </div>
        <div class="v3op-f">
          <label for="v3op-empresa">Empresa</label>
          <input id="v3op-empresa" data-op-empresa maxlength="60" autocomplete="off" placeholder="NVIDIA">
        </div>
        <div class="v3op-f" id="v3op-ta-caja" hidden>
          <label for="v3op-ta">Tipo de activo</label>
          <select id="v3op-ta" data-op-ta>${TIPOS_ACTIVO.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select>
        </div>
        <div class="v3op-f">
          <label for="v3op-peso">Peso nuevo (%)</label>
          <input id="v3op-peso" data-op-peso type="number" step="0.01" min="0" max="100" inputmode="decimal" placeholder="12,5">
          <div class="v3op-ayuda" id="v3op-peso-ay">Poné 0 para sacarla del todo.</div>
        </div>
        <div class="v3op-f">
          <label for="v3op-precio">Precio de la operación</label>
          <input id="v3op-precio" data-op-precio type="number" step="any" min="0" inputmode="decimal" placeholder="182,40">
          <div class="v3op-ayuda" id="v3op-precio-ay"></div>
        </div>
        <div class="v3op-f">
          <label for="v3op-fecha">Fecha</label>
          <input id="v3op-fecha" data-op-fecha type="date" value="${esc(ctx.hoyAR())}" max="${esc(ctx.hoyAR())}">
        </div>
        <div class="v3op-f">
          <label for="v3op-hora">Hora</label>
          <input id="v3op-hora" data-op-hora type="time" value="${esc(horaAR())}">
        </div>
        <div class="v3op-f ancho">
          <label for="v3op-razon">Por qué (obligatorio)</label>
          <textarea id="v3op-razon" data-op-razon maxlength="280" placeholder="Rotamos a NVDA por el salto de márgenes del último trimestre."></textarea>
          <div class="v3op-ayuda">Una frase. Es lo que el suscriptor lee en el aviso.</div>
        </div>
        <div class="v3op-f">
          <label for="v3op-para">Para quién es el aviso</label>
          <select id="v3op-para" data-op-para>${DESTINOS.map(d => `<option value="${d[0]}">${d[1]}</option>`).join('')}</select>
        </div>
      </div>
      <div class="v3op-pie">
        <button type="button" class="v3op-b" data-op-guardar>Guardar como borrador</button>
        <span class="v3op-ayuda" style="margin:0">No cambia la cartera ni avisa a nadie hasta que lo publiques desde la lista de abajo.</span>
      </div>
      <p class="v3op-msg" id="v3op-msg" role="status" aria-live="polite"></p>
    </section>

    <section class="v3op-card v3op-peg" id="v3op-pegar">
      <h2 class="v3op-h">Pegar desde planilla</h2>
      <p class="v3op-p">Para una rotación con varios movimientos de una sola vez. Cada fila queda como un borrador.</p>
      <div class="v3op-hint" style="margin-top:12px">Una fila por movimiento, en el orden
        <b>fecha · cartera · tipo · ticker · peso · precio · razón</b>. Separá con tabulaciones
        (es lo que sale de la planilla) o con punto y coma. La cartera podés ponerla por su nombre o
        por su id. El tipo es <b>compré</b>, <b>vendí</b> o <b>peso</b>. El peso va en porcentaje (se guarda
        como fracción de 0 a 1) y los números pueden venir como 12,5 o 12.5. Si separás con comas, los
        números tienen que ir con punto decimal: si no, 12,5 se lee como dos columnas (mirá siempre la
        vista previa). El encabezado se ignora solo. Hasta ${MAX_PEGADA} movimientos por vez.
        Dos cosas que la planilla no trae: la <b>hora</b> queda la de ahora, y un ticker que todavía no está
        en la cartera hay que cargarlo de a uno arriba, porque ahí se dice si es acción, bono o letra.</div>
      <textarea id="v3op-pegada" data-op-pegada aria-label="Filas pegadas de la planilla"
        placeholder="2026-09-23&#9;Cartera IA&#9;compré&#9;NVDA&#9;12,5&#9;182,40&#9;Rotamos por el salto de márgenes"></textarea>
      <div id="v3op-prev"></div>
      <div class="v3op-pie">
        <button type="button" class="v3op-b sec" data-op-revisar>Revisar</button>
      </div>
      <p class="v3op-msg" id="v3op-msg-peg" role="status" aria-live="polite"></p>
    </section>

    <section class="v3op-card" id="v3op-ultimos">
      <h2 class="v3op-h">Últimos movimientos</h2>
      <p class="v3op-p" id="v3op-ultimos-sub">De la cartera elegida arriba. Los borradores van primero.</p>
      <div id="v3op-lista" style="margin-top:14px"><div class="v3op-sk" aria-hidden="true"><i></i><i class="corta"></i></div></div>
      <p class="v3op-msg" id="v3op-msg-lista" role="status" aria-live="polite"></p>
    </section>`;
  if (viejo) viejo.outerHTML = html; else cuerpo.insertAdjacentHTML('beforeend', html);
  enganchar(el, ctx);
}

/* ───────────────────────── eventos ─────────────────────────
   Los oyentes se enganchan a mano sobre cada campo (y no por delegación en
   document) para no cruzarse con el oyente global de panel.js. */
function enganchar(el, ctx) {
  const q = s => el.querySelector(s);
  const limpiarPrev = () => {
    _pegadas = [];
    const p = q('#v3op-prev'); if (p) p.innerHTML = '';
    const m = q('#v3op-msg-peg'); if (m) { m.className = 'v3op-msg'; m.textContent = ''; }
  };
  const sel = q('[data-op-cartera]');
  if (sel) sel.addEventListener('change', () => {
    _cid = sel.value;
    limpiarPrev();
    const m = q('#v3op-msg-lista'); if (m) { m.className = 'v3op-msg'; m.textContent = ''; }
    // la misma guarda de cuenta que recargar(): si entró otra cuenta mientras
    // se leía, no se pinta. Y si algo explota, la lista lo dice en vez de
    // quedarse en el esqueleto para siempre
    cargarCartera(el, ctx, () => _email === ctx.S.email).catch(e => {
      const l = q('#v3op-lista');
      if (l && _email === ctx.S.email) l.innerHTML = `<p class="v3op-msg mal">No pude leer la cartera (${ctx.esc(codigoErr(e))}).</p>`;
    });
  });
  // si se edita lo pegado, la vista previa de antes ya no describe lo que hay en
  // el cuadro: se va junto con su botón de confirmar, así no se guarda lo viejo
  const peg = q('[data-op-pegada]');
  if (peg) peg.addEventListener('input', () => { const p = q('#v3op-prev'); if (p && p.innerHTML) limpiarPrev(); });
  const tk = q('[data-op-ticker]');
  if (tk) {
    tk.addEventListener('input', () => { tk.value = limpiarTicker(tk.value); pintarTicker(el, ctx); });
    tk.addEventListener('blur', () => pintarTicker(el, ctx));
  }
  const tipo = q('[data-op-tipo]');
  if (tipo) tipo.addEventListener('change', () => pintarTicker(el, ctx));
  const g = q('[data-op-guardar]');
  if (g) g.addEventListener('click', () => guardarUno(el, ctx));
  const r = q('[data-op-revisar]');
  if (r) r.addEventListener('click', () => revisarPegada(el, ctx));
}

/* ───────────────────────── la cartera elegida ───────────────────────── */
async function cargarCartera(el, ctx, vigente) {
  // la cartera que se está leyendo queda fija acá: si mientras tanto se elige
  // otra, esta lectura se descarta en vez de pisar las posiciones de la nueva
  const cid = _cid, carga = ++_carga;
  const vivo = () => carga === _carga && cid === _cid && (!vigente || vigente());
  const c = carteraDe(cid);
  const ay = el.querySelector('#v3op-cartera-ay');
  const lista = el.querySelector('#v3op-lista');
  const pAy = el.querySelector('#v3op-precio-ay');
  if (ay && c) {
    // todo lo que no sea "publico" ni "clientes" se trata como no publicado:
    // es lo honesto con una visibilidad que no reconozcamos
    const v = norm(c.visibilidad);
    ay.innerHTML = v === 'publico'
      ? `<span class="v3op-tag pub">${VIS.publico}</span> La ve cualquiera, con o sin cuenta.`
      : v === 'clientes'
        ? `<span class="v3op-tag sus">${VIS.clientes}</span> La ven los suscriptores.`
        : `<span class="v3op-tag bor">${VIS.borrador}</span> Esta cartera no está publicada, no le llega a nadie.`;
  }
  if (pAy) pAy.textContent = c && c.moneda ? `En ${c.moneda}, como cotiza la cartera.` : '';
  if (lista) lista.innerHTML = '<div class="v3op-sk" aria-hidden="true"><i></i><i class="corta"></i></div>';

  // las tres lecturas a la vez: las posiciones (el peso de hoy), el historial
  // (los publicados) y los borradores (las alertas sin publicar de esta cartera)
  let fallo = '';
  const anotar = e => { if (!fallo) fallo = codigoErr(e); };
  const [posiciones, movs, borradores] = await Promise.all([
    leerPosiciones(cid).catch(e => { anotar(e); return new Map(); }),
    leerHistorial(cid).catch(e => { anotar(e); return []; }),
    leerBorradores(cid).catch(e => { anotar(e); return []; }),
  ]);
  if (!vivo()) return;
  // si una lectura falló, el estado queda marcado: con las posiciones vacías
  // por error, todo ticker parecería nuevo y el borrador nacería con un peso
  // anterior falso. guardarUno y revisarPegada miran _fallo antes de armar nada
  _pos = posiciones; _movs = movs; _borradores = borradores; _fallo = fallo;
  try {
    pintarTicker(el, ctx);
    pintarLista(el, ctx, fallo);
  } catch (e) {
    // un error al dibujar no puede dejar el esqueleto para siempre
    if (lista) lista.innerHTML = `<p class="v3op-msg mal">No pude dibujar los movimientos (${ctx.esc(codigoErr(e))}).</p>`;
  }
}

/* el ticker escrito: si ya está en la cartera se completa la empresa y se
   muestra el peso de hoy; si es nuevo, aparece el selector de tipo de activo */
function pintarTicker(el, ctx) {
  const inp = el.querySelector('[data-op-ticker]');
  const emp = el.querySelector('[data-op-empresa]');
  const caja = el.querySelector('#v3op-ta-caja');
  const ay = el.querySelector('#v3op-peso-ay');
  if (!inp) return;
  const tk = limpiarTicker(inp.value);
  const cambio = tk !== _tkPrev;
  _tkPrev = tk;
  const pos = tk ? _pos.get(tk) : null;
  const nueva = !!tk && !pos;
  if (caja) caja.hidden = !nueva;
  if (emp) {
    // si cambió el ticker, la empresa de antes ya no vale
    if (cambio && !pos) emp.value = '';
    if (pos && norm(pos.empresa)) { emp.value = norm(pos.empresa); emp.readOnly = true; }
    else {
      emp.readOnly = false;
      // para un ticker nuevo se ofrece el nombre del catálogo de la casa
      // (empresas.js), editable: es una sugerencia, no un dato de la cartera
      if (nueva && !norm(emp.value)) {
        const cat = (ctx.EMPRESAS || []).find(x => String(x.ticker || '').toUpperCase() === tk);
        if (cat && cat.nombre) emp.value = cat.nombre;
      }
      if (!tk) emp.value = '';
    }
  }
  if (ay) {
    if (!tk) ay.textContent = 'Poné 0 para sacarla del todo.';
    else if (pos && pos.estado !== 'cerrada') {
      ay.innerHTML = `Hoy pesa <b>${pctTxt(pos.pesoObjetivo)}</b>. Poné 0 para sacarla del todo.`;
    } else if (pos) {
      ay.innerHTML = `<b>${ctx.esc(tk)}</b> está cerrada en esta cartera: si le ponés peso, vuelve a entrar.`;
    } else {
      ay.innerHTML = `<b>${ctx.esc(tk)}</b> no está en esta cartera: se crea la posición al publicar.`;
    }
    // un borrador sin publicar del mismo ticker: se avisa antes de que rebote al guardar
    if (tk && _borradores.some(b => tickerDe(b) === tk)) {
      ay.innerHTML += ' Ya tiene un borrador sin publicar en esta cartera.';
    }
  }
}

/* ───────────────────────── guardar UN movimiento (borrador) ───────────────────────── */
async function guardarUno(el, ctx) {
  const q = s => el.querySelector(s);
  const email = ctx.S.email;
  const sigue = () => ctx.S.email === email;
  const msg = q('#v3op-msg'), btn = q('[data-op-guardar]');
  const decir = (t, k) => { if (msg) { msg.className = 'v3op-msg' + (k ? ' ' + k : ''); msg.textContent = t; } };
  const c = carteraDe(_cid);
  if (!c) { decir('Elegí la cartera.', 'mal'); return; }
  // sin las posiciones (o los borradores) de hoy no se sabe el peso anterior ni
  // si el ticker ya tiene un borrador: el documento nacería con datos falsos
  if (_fallo) {
    decir(`No pude leer esta cartera (${_fallo}), así que no sé el peso de hoy y no armo el borrador. Elegí otra cartera y volvé a esta, o recargá la página.`, 'mal');
    return;
  }
  const m = armarMovimiento({
    cartera: c,
    tipo: (q('[data-op-tipo]') || {}).value,
    ticker: (q('[data-op-ticker]') || {}).value,
    empresa: (q('[data-op-empresa]') || {}).value,
    tipoActivo: (q('[data-op-ta]') || {}).value,
    pesoPct: (q('[data-op-peso]') || {}).value,
    precio: (q('[data-op-precio]') || {}).value,
    fecha: (q('[data-op-fecha]') || {}).value,
    hora: (q('[data-op-hora]') || {}).value,
    razon: (q('[data-op-razon]') || {}).value,
    para: (q('[data-op-para]') || {}).value,
  }, _pos, _borradores);
  if (m.error) { decir(m.error, 'mal'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  decir('');
  try {
    // una sola escritura: la alerta en borrador. Ni posiciones ni historial
    const lote = writeBatch(db());
    ponerBorradorEnLote(lote, m);
    await lote.commit();
  } catch (e) {
    if (!sigue()) return;
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar como borrador'; }
    decir(`No se guardó nada (${codigoErr(e)}).`, 'mal');
    return;
  }
  if (!sigue()) return;
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar como borrador'; }
  ['[data-op-ticker]', '[data-op-empresa]', '[data-op-peso]', '[data-op-precio]', '[data-op-razon]']
    .forEach(s => { const x = q(s); if (x) { x.value = ''; x.readOnly = false; } });
  const cambio = (m.pesoAnterior != null ? pctTxt(m.pesoAnterior) + ' → ' : '') + pctTxt(m.pesoNuevo);
  decir(`Guardado como borrador (${m.tk}: ${ACCION_TXT[m.accion] || m.accion}, ${cambio}). No cambia la cartera ni avisa a nadie hasta que lo publiques desde la lista de abajo.`, 'ok');
  ctx.toast(`${m.tk} en borrador · publicalo desde la lista`);
  await recargar(el, ctx);
}

/* ───────────────────────── pegar desde planilla ─────────────────────────
   El mismo patrón que la importación de Mi cartera: se pega, se revisa y
   recién ahí se confirma. La vista previa muestra lo que se va a guardar YA
   normalizado y marca los errores fila por fila. */
function partir(linea) {
  // la razón es texto libre con espacios y comas: solo sirven separadores
  // explícitos. La coma queda última porque también es el separador decimal.
  const sep = linea.includes('\t') ? '\t' : linea.includes(';') ? ';' : linea.includes(',') ? ',' : '';
  if (!sep) return null;
  const partes = linea.split(sep);
  const c = partes.slice(0, 6).map(x => norm(x));
  // todo lo que sobra vuelve a unirse: una razón con comas no se parte en dos
  c.push(partes.slice(6).join(sep).trim());
  return c;
}

function parsePegada(texto, carteras, posPorCartera, borrPorCartera) {
  const filas = [], errores = [];
  const porCartera = new Map();   // cartera+ticker ya usado en esta pegada
  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    const cruda = linea.trim();
    if (!cruda) return;
    const n = i + 1;
    // el encabezado de la planilla se ignora sin ruido
    if (/fecha/i.test(cruda) && /cartera/i.test(cruda) && /ticker|s[ií]mbolo/i.test(cruda)) return;
    const c = partir(cruda);
    if (!c) { errores.push(`Línea ${n}: no pude separar las columnas (usá tabulaciones o punto y coma).`); return; }
    if (c.filter(x => x !== '').length < 7) { errores.push(`Línea ${n}: faltan columnas (van siete).`); return; }
    const f = fechaISO(c[0]);
    if (!f) { errores.push(`Línea ${n}: fecha ilegible ("${c[0].slice(0, 16)}").`); return; }
    const busca = plano(c[1]);
    const cart = carteras.find(x => plano(x.id) === busca || plano(x.nombre) === busca
      || plano(x.slug) === busca || plano(x.codigo) === busca);
    if (!cart) { errores.push(`Línea ${n}: no reconozco la cartera "${c[1].slice(0, 24)}".`); return; }
    const t = plano(c[2]);
    const tipo = /^compr/.test(t) ? 'compra' : /^vend/.test(t) ? 'venta'
      : /^(peso|cambi|ajust)/.test(t) ? 'peso' : '';
    if (!tipo) { errores.push(`Línea ${n}: el tipo va "compré", "vendí" o "peso" (vino "${c[2].slice(0, 16)}").`); return; }
    const tk = limpiarTicker(c[3]);
    const clave = cart.id + '|' + tk;
    if (porCartera.has(clave)) {
      errores.push(`Línea ${n}: ${tk} ya tiene otro movimiento en esta pegada; cargalo aparte.`); return;
    }
    const peso = parseNum(c[4]);
    const precio = parseNum(c[5]);
    // si las posiciones o los borradores de esa cartera no se pudieron leer, la
    // fila se rebota con el motivo: con un mapa vacío todo ticker parecería
    // nuevo y el borrador nacería con un peso anterior falso
    const posMapa = posPorCartera.get(cart.id), borrLista = borrPorCartera.get(cart.id);
    if (!posMapa || !borrLista) {
      errores.push(`Línea ${n}: no pude leer ${!posMapa ? 'las posiciones' : 'los borradores'} de ${cart.nombre || cart.id}; probá de nuevo.`);
      return;
    }
    // tipoActivo vacío a propósito: la planilla no trae la columna, así que un
    // ticker nuevo en la cartera se rebota y se carga de a uno arriba
    const m = armarMovimiento({
      cartera: cart, tipo, ticker: tk, empresa: '', tipoActivo: '',
      pesoPct: isFinite(peso) ? peso : '', precio: isFinite(precio) ? precio : '',
      fecha: f, hora: horaAR(), razon: c[6], para: 'todos',
    }, posMapa, borrLista);
    if (m.error) { errores.push(`Línea ${n}: ${m.error}`); return; }
    porCartera.set(clave, true);
    filas.push({ ...m, carteraNombre: norm(cart.nombre) || cart.id, moneda: monedaDe(cart),
                 tipo, peso: m.pesoNuevo, precio: Number(precio), razon: norm(c[6]) });
  });
  return { filas, errores };
}

async function revisarPegada(el, ctx) {
  const esc = ctx.esc;
  const ta = el.querySelector('[data-op-pegada]');
  const prev = el.querySelector('#v3op-prev');
  const msg = el.querySelector('#v3op-msg-peg');
  if (!ta || !prev) return;
  if (msg) { msg.className = 'v3op-msg'; msg.textContent = ''; }
  _pegadas = [];
  // el texto que se revisa queda fijo acá, igual que la cuenta y la cartera: si
  // algo de eso cambia mientras se leen las posiciones, esta revisión se cae
  const texto = String(ta.value || ''), carga = _carga, email = ctx.S.email;
  const vivo = () => carga === _carga && ctx.S.email === email && String(ta.value || '') === texto;

  // las posiciones y los borradores de CADA cartera nombrada en la pegada: sin
  // las posiciones no se sabe el peso anterior ni si el ticker ya estaba, y sin
  // los borradores no se sabe si ya hay uno del mismo ticker esperando. Los de
  // la cartera elegida ya están en memoria, salvo que su lectura haya fallado:
  // entonces se vuelven a pedir como los de cualquier otra
  const mapas = new Map(), borrs = new Map();
  if (!_fallo) { mapas.set(_cid, _pos); borrs.set(_cid, _borradores); }
  const nombradas = new Set();
  texto.split(/\r?\n/).forEach(l => {
    const c = partir(l.trim());
    if (!c) return;
    const b = plano(c[1]);
    const cart = _carteras.find(x => plano(x.id) === b || plano(x.nombre) === b
      || plano(x.slug) === b || plano(x.codigo) === b);
    if (cart && !mapas.has(cart.id)) nombradas.add(cart.id);
  });
  for (const id of nombradas) {
    // una lectura que falla queda en null (no en un mapa vacío): parsePegada
    // rebota esas filas con el motivo en vez de tratar a todo ticker como nuevo
    try { mapas.set(id, await leerPosiciones(id)); } catch (e) { mapas.set(id, null); }
    if (!vivo()) return;
    try { borrs.set(id, await leerBorradores(id)); } catch (e) { borrs.set(id, null); }
    if (!vivo()) return;
  }

  const { filas, errores } = parsePegada(texto, _carteras, mapas, borrs);
  if (!filas.length) {
    prev.innerHTML = `<div class="v3op-hint v3op-mal">No pude leer ningún movimiento.
      ${errores.length ? '<br>' + errores.slice(0, 6).map(esc).join('<br>') : ''}</div>`;
    return;
  }
  const dem = filas.length > MAX_PEGADA;
  const listas = filas.slice(0, MAX_PEGADA);
  _pegadas = listas;
  prev.innerHTML = `
    <div class="v3op-prev"><table>
      <thead><tr><th>Fecha</th><th>Cartera</th><th>Queda como</th><th>Peso</th><th>Precio</th><th>Razón</th></tr></thead>
      <tbody>${listas.map(f => `<tr>
        <td class="v3op-n">${esc(ctx.fmtF(f.alerta.fecha))}</td>
        <td>${esc(f.carteraNombre)}</td>
        <td><b>${esc(f.tk)}</b> · ${esc(ACCION_TXT[f.accion] || f.accion)}<br>
          <span class="v3op-vacio">${esc(f.alerta.empresa)}</span></td>
        <td class="v3op-n">${f.pesoAnterior != null ? esc(pctTxt(f.pesoAnterior)) + ' → ' : ''}${esc(pctTxt(f.pesoNuevo))}</td>
        <td class="v3op-n">${esc(f.moneda + numTxt(f.precio))}</td>
        <td class="razon">${esc(f.razon)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${errores.length ? `<div class="v3op-hint v3op-mal">${errores.length} fila(s) que no voy a guardar:<br>${errores.slice(0, 6).map(esc).join('<br>')}</div>` : ''}
    ${dem ? `<div class="v3op-hint v3op-mal">Pegaste ${filas.length} movimientos y entran ${MAX_PEGADA} por vez: guardo los primeros ${MAX_PEGADA}.</div>` : ''}
    <div class="v3op-pie"><button type="button" class="v3op-b" data-op-confirmar>Guardar ${listas.length} ${listas.length === 1 ? 'borrador' : 'borradores'}</button>
      <span class="v3op-ayuda" style="margin:0">Quedan en borrador: no cambian la cartera ni avisan a nadie hasta que los publiques.</span></div>`;
  const ok = prev.querySelector('[data-op-confirmar]');
  if (ok) ok.addEventListener('click', () => confirmarPegada(el, ctx));
}

async function confirmarPegada(el, ctx) {
  const prev = el.querySelector('#v3op-prev');
  const msg = el.querySelector('#v3op-msg-peg');
  const btn = prev ? prev.querySelector('[data-op-confirmar]') : null;
  const email = ctx.S.email;
  const sigue = () => ctx.S.email === email;
  const decir = (t, k) => { if (msg) { msg.className = 'v3op-msg' + (k ? ' ' + k : ''); msg.textContent = t; } };
  if (!_pegadas.length) { decir('Revisá la pegada antes de guardar.', 'mal'); return; }
  // la vista previa se armó contra los borradores que había al revisar; si
  // después se guardó uno a mano (arriba) del mismo ticker, la fila ya no vale:
  // habría dos borradores del mismo ticker en la cartera
  const repetidos = _pegadas.filter(m => m.cid === _cid && _borradores.some(b => tickerDe(b) === m.tk)).map(m => m.tk);
  if (repetidos.length) {
    _pegadas = [];
    if (prev) prev.innerHTML = '';
    decir(`${repetidos.join(', ')}: ya ${repetidos.length === 1 ? 'tiene' : 'tienen'} un borrador sin publicar en esta cartera, guardado después de revisar. No guardé nada: revisá la pegada de nuevo.`, 'mal');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    // el sello se pone al GUARDAR, no al revisar: es el orden en que se listan
    const ahora = new Date().toISOString();
    _pegadas.forEach(m => { m.alerta.creado = ahora; });
    // un borrador por fila, todos en UN solo lote: o entra la rotación entera,
    // o no entra nada. Ni posiciones ni historial se tocan
    const lote = writeBatch(db());
    _pegadas.forEach(m => ponerBorradorEnLote(lote, m));
    await lote.commit();
  } catch (e) {
    if (!sigue()) return;
    if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; }
    decir(`No se guardó nada (${codigoErr(e)}).`, 'mal');
    return;
  }
  if (!sigue()) return;
  const n = _pegadas.length;
  // la rotación puede tocar varias carteras: los borradores de las otras se ven
  // al elegirlas arriba (la lista de abajo es de UNA cartera)
  const otras = [...new Set(_pegadas.map(m => m.cid))].filter(id => id !== _cid)
    .map(id => (carteraDe(id) || {}).nombre || id);
  _pegadas = [];
  const ta = el.querySelector('[data-op-pegada]'); if (ta) ta.value = '';
  if (prev) prev.innerHTML = '';
  decir(`${n} ${n === 1 ? 'borrador guardado' : 'borradores guardados'}: no cambian la cartera ni avisan a nadie hasta que los publiques. Publicalos desde la lista de abajo${otras.length ? ` (los de ${otras.join(', ')} aparecen al elegir esa cartera arriba)` : ''}.`, 'ok');
  ctx.toast(`${n} ${n === 1 ? 'borrador guardado' : 'borradores guardados'} · sin publicar`);
  await recargar(el, ctx);
}

/* ───────────────────────── últimos movimientos ───────────────────────── */
// el sello que fija los 15 minutos: el momento de publicar (el historial nace
// recién ahí); `creado` queda de respaldo para lo que no lo tenga
const selloDe = m => String((m && (m.publicado || m.creado)) || '');

/* ¿hay un movimiento MÁS NUEVO del mismo ticker? Entonces el peso que este
   movimiento dejó anotado ya no es el que tiene la posición hoy, y devolverlo
   pisaría lo que hizo el otro. En ese caso no se deshace: se carga otro
   movimiento. "Más nuevo" es cualquiera de las dos cosas: está antes en la
   lista (_movs viene del más nuevo al más viejo, por fecha) o se publicó
   después (un movimiento con fecha vieja publicado hoy también pisa). */
function pisadoPorOtro(m) {
  const tk = tickerDe(m);
  const i = _movs.indexOf(m);
  if (!tk || i < 0) return false;
  const sello = selloDe(m);
  return _movs.some((x, j) => x !== m && tickerDe(x) === tk &&
    (j < i || (sello && selloDe(x) > sello)));
}

function puedeDeshacer(m) {
  if (!m || !selloDe(m)) return false;
  // sin existiaAntes no se sabe si la posición había que borrarla o devolverla
  // al peso viejo: ese movimiento no salió de acá y no se toca
  if (typeof m.existiaAntes !== 'boolean') return false;
  if (pisadoPorOtro(m)) return false;
  const t = Date.parse(selloDe(m));
  if (!isFinite(t)) return false;
  return Date.now() - t < VENTANA_MIN * 60e3;
}
const minutosRestantes = m => Math.max(0, Math.ceil((VENTANA_MIN * 60e3 - (Date.now() - Date.parse(selloDe(m)))) / 60e3));

// el renglón de estado de la lista (publicado, deshecho, choque): vive fuera de
// #v3op-lista para sobrevivir al repintado
const mensajeLista = el => (t, k) => {
  const m = el.querySelector('#v3op-msg-lista');
  if (m) { m.className = 'v3op-msg' + (k ? ' ' + k : ''); m.textContent = t; }
};

function pintarLista(el, ctx, fallo) {
  const esc = ctx.esc;
  const lista = el.querySelector('#v3op-lista');
  const sub = el.querySelector('#v3op-ultimos-sub');
  const c = carteraDe(_cid);
  if (sub) sub.textContent = c ? `De ${c.nombre || c.id}. Los borradores van primero.` : '';
  if (!lista) return;
  if (fallo) { lista.innerHTML = `<p class="v3op-msg mal">No pude leer los movimientos (${esc(fallo)}).</p>`; return; }
  // un borrador de la versión anterior de Operar ya tiene su historial escrito
  // (y el peso aplicado): se muestra desde ese historial, no dos veces
  const viejos = new Set(_movs.map(m => String(m.alertaId || '')));
  const borr = _borradores.filter(b => !viejos.has(String(b.id)));
  if (!borr.length && !_movs.length) {
    lista.innerHTML = '<p class="v3op-vacio">Esta cartera todavía no tiene movimientos registrados.</p>';
    return;
  }
  const mon = monedaDe(c);
  const ver = _movs.slice(0, MAX_LISTA);
  const cabecera = !borr.length ? '' : `<div class="v3op-todos">
      ${borr.length > 1 ? `<button type="button" class="v3op-b mini" data-op-publicar-todos>Publicar los ${borr.length} de esta cartera</button>` : ''}
      <span class="nota">${borr.length === 1 ? 'Hay 1 borrador sin publicar' : `Hay ${borr.length} borradores sin publicar`}:
        no cambian la cartera ni avisan a nadie hasta que los publiques.</span></div>`;

  const tarjeta = (m, esBorrador) => {
    const publicado = !esBorrador && m.estado === PUBLICADO;
    // un historial en "borrador" lo dejó la versión anterior: el peso ya está
    // aplicado y lo único sin publicar es su aviso
    const viejo = !esBorrador && m.estado === BORRADOR;
    const nuestro = publicado || viejo;
    const tag = esBorrador ? '<span class="v3op-tag bor">Borrador</span>'
      : publicado ? '<span class="v3op-tag pub">Publicado</span>'
      : viejo ? '<span class="v3op-tag bor">Borrador viejo</span>'
      : '<span class="v3op-tag mut">Cargado fuera de acá</span>';
    const pisado = nuestro ? pisadoPorOtro(m) : false;
    const sePuede = nuestro ? puedeDeshacer(m) : false;
    // sin existiaAntes anotado no se sabe cómo volver la posición: ese
    // movimiento no se deshace desde acá, y la nota tiene que decir eso y no
    // "ya pasaron los 15 minutos"
    const sinDatos = nuestro && typeof m.existiaAntes !== 'boolean';
    let acciones = '';
    if (esBorrador) {
      acciones = `<button type="button" class="v3op-b mini" data-op-publicar="${esc(m.id)}">Publicar</button>
        <button type="button" class="v3op-b mini peligro" data-op-descartar="${esc(m.id)}">Descartar</button>
        <span class="nota">Publicar escribe el peso en la cartera y la entrada del historial; el aviso sale en la próxima corrida automática.</span>`;
    } else if (nuestro) {
      acciones = `${viejo ? `<button type="button" class="v3op-b mini" data-op-publicar-viejo="${esc(m.id)}">Publicar el aviso</button>` : ''}
        ${sePuede ? `<button type="button" class="v3op-b mini peligro" data-op-deshacer="${esc(m.id)}">Deshacer</button>
          <span class="nota">quedan ${minutosRestantes(m)} min</span>` : ''}
        ${viejo ? `<span class="nota">Lo guardó la versión anterior de Operar: el peso ya está aplicado; lo que falta publicar es el aviso.</span>` : ''}
        ${!sePuede ? `<span class="nota">${pisado
          ? `Ya hay un movimiento más nuevo de ${esc(tickerDe(m) || 'este ticker')}: para cambiarlo, cargá otro movimiento.`
          : sinDatos
            ? 'No se puede deshacer desde acá: no tiene anotado cómo estaba la posición antes. Para cambiarlo, cargá otro movimiento.'
            : `Ya pasaron los ${VENTANA_MIN} minutos del deshacer: para cambiarlo, cargá otro movimiento.`}</span>` : ''}`;
    }
    const aviso = esBorrador
      ? `<span>Aviso: <b>${esc(DESTINO_TXT[m.para] || m.para || '—')}</b> · ${esc(VIS[m.visibilidad] || m.visibilidad || '—')}</span>` : '';
    return `<div class="v3op-mov${esBorrador || viejo ? ' bor' : ''}">
      <div class="arriba">
        <span class="tk">${esc(tickerDe(m) || '—')}</span>
        <span class="em">${esc(m.empresa || '')}</span>
        ${tag}
        <span class="fe">${esc(ctx.fmtF(m.fecha))}${m.hora ? ' · ' + esc(m.hora) : ''}</span>
      </div>
      <div class="cifras">
        <span>${esc(ACCION_TXT[m.accion] || m.accion || '—')}</span>
        <span>Peso: <b>${m.pesoAnterior != null ? esc(pctTxt(m.pesoAnterior)) + ' → ' : ''}${m.pesoNuevo != null ? esc(pctTxt(m.pesoNuevo)) : '—'}</b></span>
        <span>Precio: <b>${esc(mon + numTxt(m.precio))}</b></span>
        ${aviso}
      </div>
      ${m.razonamiento ? `<div class="raz">${esc(m.razonamiento)}</div>` : ''}
      ${acciones ? `<div class="acc">${acciones}</div>` : ''}
    </div>`;
  };

  lista.innerHTML = cabecera
    + borr.map(b => tarjeta(b, true)).join('')
    + ver.map(m => tarjeta(m, false)).join('')
    + (_movs.length > ver.length
      ? `<p class="v3op-vacio">Se muestran los últimos ${ver.length} publicados de ${_movs.length}.</p>` : '');

  // la cartera de ESTA lista queda fija acá: los documentos de historial no
  // llevan su cartera, y si se elige otra con la lectura en vuelo, la lista
  // vieja sigue un instante en pantalla con _cid ya apuntando a la nueva
  const cid = _cid;
  const todos = lista.querySelector('[data-op-publicar-todos]');
  if (todos) todos.addEventListener('click', () => publicarVarios(el, ctx, borr.map(b => b.id), todos));
  lista.querySelectorAll('[data-op-publicar]').forEach(b =>
    b.addEventListener('click', () => publicarVarios(el, ctx, [b.dataset.opPublicar], b)));
  lista.querySelectorAll('[data-op-descartar]').forEach(b =>
    b.addEventListener('click', () => descartar(el, ctx, b.dataset.opDescartar, b)));
  lista.querySelectorAll('[data-op-publicar-viejo]').forEach(b =>
    b.addEventListener('click', () => publicarViejo(el, ctx, cid, b.dataset.opPublicarViejo, b)));
  lista.querySelectorAll('[data-op-deshacer]').forEach(b =>
    b.addEventListener('click', () => deshacer(el, ctx, cid, b.dataset.opDeshacer, b)));
}

/* ───────────────────────── publicar ─────────────────────────
   Uno o varios borradores de la cartera elegida, TODOS en un solo writeBatch:
   por cada uno, la posición con el peso nuevo, el documento de historial y la
   alerta a "publicado". Antes de escribir se releen las posiciones de la
   cartera y se compara cada borrador con lo que hay hoy: un solo choque frena
   la publicación entera, sin escribir nada. */
async function publicarVarios(el, ctx, ids, btn) {
  // la cartera sale del propio borrador (campo `cartera`) y queda fija antes
  // del await, igual que la cuenta: si se elige otra cartera mientras tanto,
  // las rutas siguen apuntando a la del borrador
  const email = ctx.S.email;
  const sigue = () => ctx.S.email === email;
  const decir = mensajeLista(el);
  const lista = ids.map(id => _borradores.find(b => b.id === id)).filter(Boolean);
  const cid = lista.length ? norm(lista[0].cartera) : '';
  if (!lista.length || lista.length !== ids.length) {
    // el borrador ya no está en memoria (se descartó o se publicó desde otra
    // pestaña): se relee la lista en vez de quedarse mudo
    decir('Ese borrador ya no está en la lista: la vuelvo a leer.', 'mal');
    recargar(el, ctx).catch(() => {});
    return;
  }
  if (!cid || lista.some(b => norm(b.cartera) !== cid)) {
    decir('Esos borradores no son todos de la misma cartera: publicalos de a uno.', 'mal');
    return;
  }
  if (lista.length > MAX_PUBLICAR) {
    decir(`Son ${lista.length} borradores y entran ${MAX_PUBLICAR} por vez: publicalos en tandas.`, 'mal'); return;
  }
  // dos borradores del mismo ticker no se publican juntos: el segundo tiene
  // anotado un peso anterior que deja de ser cierto apenas se aplica el primero
  const vistos = new Set();
  for (const b of lista) {
    const tk = tickerDe(b);
    if (vistos.has(tk)) {
      decir(`Hay dos borradores de ${tk} en esta cartera: publicá uno y descartá el otro (su peso anterior ya no va a coincidir).`, 'mal');
      return;
    }
    vistos.add(tk);
  }
  const rotulo = btn.textContent;
  btn.disabled = true; btn.textContent = 'Publicando…';
  decir('');

  // la guarda: se relee la cartera y cada borrador tiene que encontrar la
  // posición como cuando se guardó
  let posiciones;
  try { posiciones = await leerPosiciones(cid); }
  catch (e) {
    if (!sigue()) return;
    btn.disabled = false; btn.textContent = rotulo;
    decir(`No pude releer la cartera antes de publicar (${codigoErr(e)}). No se escribió nada.`, 'mal');
    return;
  }
  if (!sigue()) return;
  const choques = lista.map(b => choqueDe(b, posiciones.get(tickerDe(b)) || null)).filter(Boolean);
  if (choques.length) {
    btn.disabled = false; btn.textContent = rotulo;
    decir(`No publiqué nada: la cartera cambió desde que guardaste ${lista.length === 1 ? 'el borrador' : 'los borradores'}. `
      + choques.join(' ') + ` Descartá ${choques.length === 1 ? 'ese borrador y cargalo' : 'esos borradores y cargalos'} de nuevo con el peso de hoy.`, 'mal');
    return;
  }

  const ahora = new Date().toISOString();
  try {
    const lote = writeBatch(db());
    lista.forEach(b => ponerPublicacionEnLote(lote, b, ahora));
    await lote.commit();
  } catch (e) {
    if (!sigue()) return;
    btn.disabled = false; btn.textContent = rotulo;
    decir(`No se publicó nada (${codigoErr(e)}).`, 'mal');
    return;
  }
  if (!sigue()) return;
  const n = lista.length, tk0 = tickerDe(lista[0]);
  ctx.toast(n === 1 ? `${tk0} publicado · el aviso sale en la próxima corrida` : `${n} movimientos publicados · el aviso sale en la próxima corrida`);
  await refrescarTodo(el, ctx, cid);
  if (!sigue()) return;
  decir(n === 1
    ? `${tk0} publicado: la cartera ya muestra el peso nuevo (${pctTxt(lista[0].pesoNuevo)}). El aviso de rotación sale en la próxima corrida automática, no al instante.`
    : `${n} movimientos publicados: la cartera ya muestra los pesos nuevos. El aviso de rotación sale en la próxima corrida automática, no al instante.`, 'ok');
}

/* compatibilidad con lo que dejó la versión anterior de Operar: un historial en
   "borrador" ya tiene el peso aplicado y el documento escrito; lo único sin
   publicar es su aviso. Publicarlo es pasar los dos documentos a "publicado",
   exactamente lo que hacía esa versión. No toca la posición. */
async function publicarViejo(el, ctx, cid, histId, btn) {
  // `cid` es la cartera de la lista dibujada (la fijó pintarLista), no _cid
  const email = ctx.S.email;
  const sigue = () => ctx.S.email === email;
  const decir = mensajeLista(el);
  const m = _movs.find(x => x.id === histId);
  if (!m || !cid || m.estado !== BORRADOR) return;
  btn.disabled = true; btn.textContent = 'Publicando…';
  decir('');
  const ahora = new Date().toISOString();
  try {
    const lote = writeBatch(db());
    lote.update(doc(db(), 'carterasModelo', cid, 'historial', histId), { estado: PUBLICADO, publicado: ahora });
    if (m.alertaId) lote.update(doc(db(), 'alertas', m.alertaId), { estado: PUBLICADO, publicado: ahora });
    await lote.commit();
  } catch (e) {
    if (!sigue()) return;
    btn.disabled = false; btn.textContent = 'Publicar el aviso';
    decir(`No se publicó (${codigoErr(e)}).`, 'mal');
    return;
  }
  if (!sigue()) return;
  ctx.toast(`Aviso de ${tickerDe(m)} publicado`);
  await refrescarTodo(el, ctx, cid);
  if (!sigue()) return;
  decir(`Aviso de ${tickerDe(m)} publicado. El peso ya estaba aplicado; el aviso de rotación sale en la próxima corrida automática, no al instante.`, 'ok');
}

/* ───────────────────────── descartar un borrador ─────────────────────────
   Se borra su alerta y listo: nunca tocó la cartera. */
async function descartar(el, ctx, alertaId, btn) {
  const email = ctx.S.email;
  const sigue = () => ctx.S.email === email;
  const decir = mensajeLista(el);
  const b = _borradores.find(x => x.id === alertaId);
  if (!b || b.estado !== BORRADOR) {
    decir('Ese borrador ya no está en la lista: la vuelvo a leer.', 'mal');
    recargar(el, ctx).catch(() => {});
    return;
  }
  const tk = tickerDe(b);
  btn.disabled = true; btn.textContent = 'Descartando…';
  decir('');
  try { await deleteDoc(doc(db(), 'alertas', alertaId)); }
  catch (e) {
    if (!sigue()) return;
    btn.disabled = false; btn.textContent = 'Descartar';
    decir(`No se pudo descartar (${codigoErr(e)}).`, 'mal');
    return;
  }
  if (!sigue()) return;
  ctx.toast(`Borrador de ${tk} descartado`);
  await recargar(el, ctx);
  if (!sigue()) return;
  decir(`Borrador de ${tk} descartado. La cartera no había cambiado y sigue igual; no se avisó a nadie.`, 'ok');
}

/* ───────────────────────── deshacer un publicado ─────────────────────────
   En un batch: la posición vuelve al peso y al estado anterior (o se borra, si
   la creó este movimiento), y se borran el documento de historial y la alerta.
   El peso anterior y el estado anterior están guardados en el propio historial,
   así que no hace falta adivinar nada. Antes se relee la posición: tiene que
   tener el peso que dejó ESTE movimiento; si no, alguien la cambió por afuera
   y devolver el peso viejo pisaría eso. */
async function deshacer(el, ctx, cid, histId, btn) {
  // `cid` es la cartera de la lista dibujada (la fijó pintarLista), no _cid
  const email = ctx.S.email;
  const sigue = () => ctx.S.email === email;
  const decir = mensajeLista(el);
  const m = _movs.find(x => x.id === histId);
  if (!m || !cid) return;
  if (pisadoPorOtro(m)) { ctx.toast('Ya hay un movimiento más nuevo de ese ticker'); return; }
  if (!puedeDeshacer(m)) { ctx.toast('Ya pasaron los ' + VENTANA_MIN + ' minutos'); return; }
  const tk = tickerDe(m);
  if (!tk) { ctx.toast('Ese movimiento no dice de qué ticker es'); return; }
  btn.disabled = true; btn.textContent = 'Deshaciendo…';
  decir('');
  const posRef = doc(db(), 'carterasModelo', cid, 'posiciones', tk);
  let pos;
  try { const s = await getDoc(posRef); pos = s.exists() ? s.data() : null; }
  catch (e) {
    if (!sigue()) return;
    btn.disabled = false; btn.textContent = 'Deshacer';
    decir(`No pude releer la posición antes de deshacer (${codigoErr(e)}). No se tocó nada.`, 'mal');
    return;
  }
  if (!sigue()) return;
  if (!pos || !mismoPeso(pos.pesoObjetivo, m.pesoNuevo)) {
    btn.disabled = false; btn.textContent = 'Deshacer';
    decir(`No deshice nada: ${tk} ${pos
      ? `hoy pesa ${pctTxt(pos.pesoObjetivo)}, no el ${pctTxt(m.pesoNuevo)} que dejó este movimiento`
      : 'ya no está en la cartera'}. Para cambiarlo, cargá otro movimiento.`, 'mal');
    return;
  }
  try {
    const lote = writeBatch(db());
    if (m.existiaAntes) {
      // exactamente como estaba: si el documento no tenía pesoObjetivo o estado
      // (pesoAnterior / estadoAnterior en null), el campo se saca en vez de
      // inventarle un 0 o un "activa"
      lote.update(posRef, {
        pesoObjetivo: esNum(m.pesoAnterior) ? Number(m.pesoAnterior) : deleteField(),
        estado: norm(m.estadoAnterior) || deleteField(),
      });
    } else {
      // la posición la creó este movimiento: se va con él
      lote.delete(posRef);
    }
    lote.delete(doc(db(), 'carterasModelo', cid, 'historial', histId));
    if (m.alertaId) lote.delete(doc(db(), 'alertas', m.alertaId));
    await lote.commit();
  } catch (e) {
    if (!sigue()) return;
    btn.disabled = false; btn.textContent = 'Deshacer';
    decir(`No se pudo deshacer (${codigoErr(e)}).`, 'mal');
    return;
  }
  if (!sigue()) return;
  const volvio = m.existiaAntes
    ? `${tk} volvió a ${pctTxt(m.pesoAnterior)}${norm(m.estadoAnterior) ? ` (${norm(m.estadoAnterior)})` : ''}`
    : `${tk} salió de la cartera (no estaba antes de este movimiento)`;
  ctx.toast(volvio);
  await refrescarTodo(el, ctx, cid);
  if (!sigue()) return;
  decir(`Deshecho: ${volvio}; se borraron la entrada del historial y su alerta.`, 'ok');
}

/* después de guardar o descartar un borrador: solo se relee la cartera elegida
   (posiciones, historial y borradores). No hay nada que invalidar en el panel
   del inversor: la cartera no cambió */
async function recargar(el, ctx) {
  // si en el medio entró otra cuenta, el estado ya es de otro: no se repinta
  if (!_cid || _email !== ctx.S.email) return;
  await cargarCartera(el, ctx, () => _email === ctx.S.email);
}

/* después de publicar o deshacer: se relee la cartera y se le avisa al panel
   del inversor que las carteras (y las alertas) cambiaron. `cid` es la cartera
   que se acaba de escribir, que no siempre es la que está elegida ahora: la
   caché que hay que tirar es la de ESA */
async function refrescarTodo(el, ctx, cid) {
  try { ctx.invalidar('cm-' + (cid || _cid), 'teaser'); } catch (e) {}
  await recargar(el, ctx);
  try { ctx.refrescar('carteras', 'alertas'); } catch (e) {}
}
