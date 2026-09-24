// alertas-precio.js — alertas de precio por activo ("avisame si GGAL sube de $4.735").
//
// Es la ÚNICA puerta a la colección inversores/{email}/alertasPrecio/{id}: la fila
// del activo en Mi cartera (mi-cartera.js) crea y pausa, la pestaña Alertas
// (panel-alertas.js) lista, marca vistas y limpia el historial, y el panel
// (panel.js) cuenta las disparadas sin ver para la pastilla del lateral. Ninguno
// escribe la colección por su cuenta. No importa panel.js (sería un import
// circular): cada función recibe el email, o el ctx del panel cuando lo necesita.
//
// EL CIRCUITO (panel + pipeline)
//   1. El dueño crea la alerta desde la fila del activo: ticker tal cual está en
//      la posición (GGAL.BA, AL30, BTC-USD, NVDA), condición sube|baja, umbral y
//      moneda. El umbral va en la moneda y la unidad en que cotiza el activo
//      (cada 100 VN en renta fija): se compara contra precios/{ticker}.precio tal
//      cual, sin factor y sin convertir.
//   2. En cada pintar(), mi-cartera.js emite en window el evento "valtia-precios"
//      con detail { email, precios, n, fx } (mi-cartera.js, final de pintar()).
//      instalarEvaluacion(ctx) lo escucha una sola vez por página, filtra por la
//      cuenta abierta y llama a evaluarConPrecios(): cada alerta activa y sin
//      disparar se compara con precios[ticker].precio, solo si ese precio es un
//      número, no está marcado sinDatos y está en la misma moneda que la alerta.
//      Si cruza (sube: precio >= umbral; baja: precio <= umbral), se la marca
//      disparada UNA vez —{ disparada: hora del servidor, precioDisparo, activa:
//      false }— y el panel avisa con ctx.toast(fraseDisparo) y ctx.refrescar('alertas').
//   3. El pipeline de precios (precios_intradia.py, del lado del servidor con
//      service account; NO está en este repo) es el que tiene que evaluar lo mismo
//      cada 15 min con el panel cerrado, mandar el mail y escribir avisada/avisoMail.
//      Este módulo no depende de que exista: sin pipeline las alertas saltan igual
//      desde el panel, solo que sin mail. Si los dos llegan a la vez, la regla deja
//      disparar solo al primero (resource.data.disparada == null): el segundo recibe
//      permission-denied, relee y lo ignora. Un Set en vuelo evita repetir en la
//      misma pestaña.
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
//   · No manda mails ni promete que lleguen: eso es del pipeline. Tampoco escribe
//     avisada ni avisoMail (las reglas se lo rechazarían al dueño).
//   · No convierte monedas: una alerta en ARS se compara solo contra un precio en
//     ARS. Si el ticker cotiza en otra moneda, esa alerta no se evalúa.
//   · No evalúa fuera de rueda ni tiene reloj propio: solo corre cuando Mi cartera
//     repinta con precios. Fuera de rueda los precios no cambian; y cuando el panel
//     está cerrado, el que tiene que mirar es el pipeline.
//   · No dibuja nada: sin CSS ni DOM propios. Cada pantalla arma su vista con
//     textoAlerta()/fraseDisparo() y el formato de precio que use.
//   · No reanuda una disparada (la regla tampoco): se crea otra.
//
// EL DOCUMENTO (firestore.rules, match /alertasPrecio/{aid}; probado en
// scripts/test-alertas-precio.mjs contra las reglas): EXACTAMENTE estas nueve claves
//   { ticker, condicion, umbral, moneda, creada: serverTimestamp(), activa: true,
//     disparada: null, precioDisparo: null, vista: false }
// El dueño después solo toca activa / vista / disparada / precioDisparo.
//
// LO QUE ESPERA DEL ctx DE panel.js (verificado el 24/09/2026): ctx.S.email,
// ctx.S.verificado, ctx.toast(msg), ctx.refrescar(...pestañas) y, si está,
// ctx.money(n, moneda) para el toast; si falta, usa fmtPrecio() de acá.
//
// La lectura se cachea 60 s por cuenta y se invalida en cada escritura de este
// módulo. Lo que dispare el pipeline mientras tanto aparece en la próxima lectura.
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

/* ───────────────────────── constantes ───────────────────────── */
// las nueve claves del doc, en el orden del hasOnly de firestore.rules
export const CAMPOS_ALERTA = ['ticker', 'condicion', 'umbral', 'moneda', 'creada', 'activa', 'disparada', 'precioDisparo', 'vista'];
export const CONDICIONES = ['sube', 'baja'];
export const MONEDAS = ['ARS', 'USD'];
// el evento que emite mi-cartera.js al final de cada pintar(): detail { email, precios, n, fx }
export const EVENTO_PRECIOS = 'valtia-precios';
export const CACHE_MS = 60 * 1000;
// mismo tope que panel-alertas.js: Firestore acepta 500 operaciones por lote
export const LOTE_MAX = 400;
const TICKER_MAX = 16;   // el de las reglas

const db = () => getFirestore(getApp());
const coleccion = email => collection(db(), 'inversores', email, 'alertasPrecio');
const referencia = (email, id) => doc(db(), 'inversores', email, 'alertasPrecio', String(id));

/* ───────────────────────── helpers puros ───────────────────────── */
// un número finito > 0, o null. Los strings se leen con EL MISMO criterio que
// parseNum() de mi-cartera.js (no se importa: ese módulo trae Firebase y DOM), así
// "1.900,50", "1,900.50", "1.900" y "0.500" valen lo mismo en el modal de compra y
// en el de la alerta: saca $ / US$ y espacios; con coma y punto, el decimal es el
// que aparece último; solo coma es decimal; solo punto con exactamente tres cifras
// al final son miles ("1.900"), salvo que empiece en "0." ("0.500" es medio).
// Más estricto que parseNum con la basura: letras, signos o un tercer separador
// no se convierten en un número, dan null.
function positivo(x) {
  if (typeof x === 'string') {
    let t = x.trim().replace(/^(US)?\$\s*/i, '').replace(/\s+/g, '');
    if (!t || /[^\d.,]/.test(t)) return null;
    const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
    if (coma > -1 && punto > -1) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (coma > -1) t = t.replace(',', '.');
    else if (punto > -1 && t.length - punto - 1 === 3 && t.replace(/\./g, '').length > 3 && !t.startsWith('0.')) t = t.replace(/\./g, '');
    x = Number(t);
  }
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
}
const tickerLimpio = tk => String(tk == null ? '' : tk).trim().toUpperCase();
// Timestamp de Firestore, Date, número o ISO → milisegundos (0 si no hay)
function ms(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t instanceof Date) return t.getTime();
  const n = typeof t === 'number' ? t : Date.parse(t);
  return Number.isFinite(n) ? n : 0;
}
const esPermisoDenegado = e => !!e && (e.code === 'permission-denied'
  || /permission[-_ ]denied|insufficient permissions/i.test(String(e.message || e)));
const SIN_PERMISO = 'Firestore no dejó guardar la alerta: las alertas necesitan el mail verificado.';

/* ───────────────────────── evaluación (pura) ───────────────────────── */
// ¿cruzó? sube → precio >= umbral; baja → precio <= umbral (la igualdad cuenta).
// false si el precio o el umbral no son finitos > 0, si está pausada o ya saltó.
export function evaluar(alerta, precio) {
  if (!alerta || alerta.activa === false || alerta.disparada != null) return false;
  const p = positivo(precio), u = positivo(alerta.umbral);
  if (p == null || u == null) return false;
  if (alerta.condicion === 'sube') return p >= u;
  if (alerta.condicion === 'baja') return p <= u;
  return false;
}

// redondea como se muestra el precio: ≥1000 entero; ≥100 un decimal; ≥1 dos
// decimales; <1 cuatro cifras significativas (cripto chica)
export function redondearPrecio(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v);
  if (a >= 100) return Math.round(v * 10) / 10;
  if (a >= 1) return Math.round(v * 100) / 100;
  if (a === 0) return 0;
  return Number(v.toPrecision(4));
}

// el umbral que propone el formulario: 5 % arriba del precio (sube) o abajo (baja)
export function precargaUmbral(precio, condicion) {
  const p = positivo(precio);
  if (p == null) return null;
  return redondearPrecio(p * (condicion === 'baja' ? 0.95 : 1.05));
}

// formato por defecto, en la moneda de la alerta (nunca convertida): "$4.735",
// "US$61,20", "US$0,01292". Las pantallas pueden pasar el suyo (ctx.money).
export function fmtPrecio(n, moneda) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  // los decimales se deciden con el valor YA redondeado: 999,999 es "$1.000", no "$1.000,0"
  const r = Math.abs(redondearPrecio(v));
  const dec = r >= 1000 ? 0 : r >= 100 ? 1 : r >= 1 ? 2 : null;
  const txt = dec == null
    ? r.toLocaleString('es-AR', { maximumFractionDigits: 10 })
    : r.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (v < 0 ? '−' : '') + (moneda === 'ARS' ? '$' : 'US$') + txt;
}

// para mostrar: sin el sufijo .BA / -USD (en el doc va con sufijo)
export const tickerCorto = tk => tickerLimpio(tk).replace(/\.BA$/, '').replace(/-USD$/, '');

// "Sube de $4.735" / "Baja de US$61,20". fmt(valor, moneda) lo pasa quien llama.
export function textoAlerta(a, fmt) {
  const f = typeof fmt === 'function' ? fmt : fmtPrecio;
  return `${a && a.condicion === 'baja' ? 'Baja' : 'Sube'} de ${f(a ? a.umbral : NaN, a && a.moneda)}`;
}

// "GGAL subió de $4.735: está en $4.760" (sin precioDisparo, termina en el umbral)
export function fraseDisparo(a, fmt) {
  const f = typeof fmt === 'function' ? fmt : fmtPrecio;
  if (!a) return '';
  const verbo = a.condicion === 'baja' ? 'bajó' : 'subió';
  const ahora = positivo(a.precioDisparo);
  return `${tickerCorto(a.ticker)} ${verbo} de ${f(a.umbral, a.moneda)}` + (ahora != null ? `: está en ${f(ahora, a.moneda)}` : '');
}

// valida lo que va al doc ANTES de escribir. Devuelve { ok, error, datos }; datos
// trae ticker en mayúsculas y umbral como número.
export function validarAlerta(campos) {
  const { ticker, condicion, umbral, moneda } = campos || {};
  const tk = tickerLimpio(ticker);
  if (!tk) return { ok: false, error: 'Falta el ticker del activo.' };
  if (tk.length > TICKER_MAX || /[\s/]/.test(tk)) return { ok: false, error: `Ese ticker no sirve para una alerta (hasta ${TICKER_MAX} caracteres, sin espacios ni barras).` };
  if (!CONDICIONES.includes(condicion)) return { ok: false, error: 'Elegí si te avisamos cuando sube o cuando baja.' };
  const u = positivo(umbral);
  if (u == null) return { ok: false, error: 'Poné un precio mayor a cero para el aviso.' };
  if (!MONEDAS.includes(moneda)) return { ok: false, error: 'La alerta necesita la moneda en la que cotiza el activo (ARS o USD).' };
  return { ok: true, error: null, datos: { ticker: tk, condicion, umbral: u, moneda } };
}

/* ───────────────────────── lectura (caché 60 s por cuenta) ───────────────────────── */
const _cache = new Map();   // email → { t, p: Promise<lista> }
// la lista y cada alerta se copian: la pantalla puede tocar lo que recibe sin ensuciar la caché
const copia = l => l.map(a => ({ ...a }));

// se llama sola en cada escritura de acá; a mano solo si otra cosa tocó la colección
export function invalidarAlertas(email) {
  if (email) _cache.delete(String(email)); else _cache.clear();
}

// todas las alertas de la cuenta, { id, ...doc }, las más nuevas primero. Tira si
// Firestore no deja leer (sin sesión o mail sin verificar): cada pantalla decide.
export function leerAlertas(email) {
  email = String(email || '');
  if (!email) return Promise.resolve([]);
  const ahora = Date.now(), e = _cache.get(email);
  if (e && ahora - e.t < CACHE_MS) return e.p.then(copia);
  const e2 = { t: ahora, p: null };
  e2.p = getDocs(coleccion(email)).then(snap => {
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => ms(b.creada) - ms(a.creada));
    return lista;
  }).catch(err => {
    // si falló, la próxima llamada vuelve a intentar en vez de servir el fallo un minuto
    if (_cache.get(email) === e2) _cache.delete(email);
    throw err;
  });
  _cache.set(email, e2);
  return e2.p.then(copia);
}

// las de un activo (con sufijo o sin él, da igual la caja)
export async function alertasDe(email, ticker) {
  const tk = tickerLimpio(ticker);
  if (!tk) return [];
  return (await leerAlertas(email)).filter(a => tickerLimpio(a.ticker) === tk);
}

/* ───────────────────────── escritura ───────────────────────── */
const rand4 = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

// crea la alerta con el doc EXACTO que aceptan las reglas. Rechaza (throw, en
// voseo) un duplicado exacto activo: mismo ticker, condición y umbral, sin disparar.
export async function crearAlerta(email, campos) {
  email = String(email || '');
  if (!email) throw new Error('Entrá a tu cuenta para crear una alerta.');
  const v = validarAlerta(campos || {});
  if (!v.ok) throw new Error(v.error);
  const { ticker, condicion, umbral, moneda } = v.datos;
  let activas;
  try { activas = (await leerAlertas(email)).filter(a => a.activa !== false && a.disparada == null); }
  catch (e) {
    // sin mail verificado la regla no deja ni leer: mismo aviso que si no dejara escribir
    if (esPermisoDenegado(e)) throw new Error(SIN_PERMISO);
    throw e;
  }
  if (activas.some(a => tickerLimpio(a.ticker) === ticker && a.condicion === condicion && Number(a.umbral) === umbral)) {
    throw new Error(`Ya tenés esa misma alerta activa para ${tickerCorto(ticker)}.`);
  }
  const id = `${ticker}-${condicion}-${Date.now().toString(36)}-${rand4()}`;
  const docu = { ticker, condicion, umbral, moneda, creada: serverTimestamp(), activa: true, disparada: null, precioDisparo: null, vista: false };
  try {
    await setDoc(referencia(email, id), docu);
  } catch (e) {
    if (esPermisoDenegado(e)) throw new Error(SIN_PERMISO);
    throw e;
  } finally {
    invalidarAlertas(email);
  }
  // creada queda con la hora local hasta la próxima lectura (el doc tiene la del servidor)
  return { id, ...docu, creada: new Date() };
}

// pausa (activa=false) o reanuda (activa=true). Una disparada no se reanuda.
export async function pausar(email, id, activa) {
  email = String(email || ''); id = String(id || '');
  if (!email || !id) throw new Error('Falta la cuenta o la alerta.');
  activa = !!activa;
  if (activa) {
    let a = null;
    try { a = (await leerAlertas(email)).find(x => x.id === id) || null; } catch (e) {}
    if (a && a.disparada != null) throw new Error('Esa alerta ya saltó y no se reanuda. Si querés seguir vigilando ese precio, creá una nueva.');
  }
  try { await updateDoc(referencia(email, id), { activa }); }
  catch (e) {
    // si la lectura local falló, de que ya saltó se entera acá: la regla no reanuda
    // una disparada, y sin mail verificado no deja tocar nada
    if (esPermisoDenegado(e)) throw new Error(activa
      ? 'Firestore no dejó reanudar la alerta: si ya saltó no se reanuda, creá una nueva.'
      : 'Firestore no dejó pausar la alerta: las alertas necesitan el mail verificado.');
    throw e;
  } finally { invalidarAlertas(email); }
}

export async function borrar(email, id) {
  email = String(email || ''); id = String(id || '');
  if (!email || !id) throw new Error('Falta la cuenta o la alerta.');
  try { await deleteDoc(referencia(email, id)); }
  finally { invalidarAlertas(email); }
}

// de a LOTE_MAX por lote, como panel-alertas.js: si falla un lote, ese lote entero
// no se aplica (los anteriores sí; la caché se invalida igual y la pantalla relee)
async function porLotes(email, ids, op) {
  email = String(email || '');
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(x => String(x == null ? '' : x)).filter(Boolean))];
  if (!email || !lista.length) return 0;
  try {
    for (let i = 0; i < lista.length; i += LOTE_MAX) {
      const lote = writeBatch(db());
      lista.slice(i, i + LOTE_MAX).forEach(id => op(lote, referencia(email, id)));
      await lote.commit();
    }
  } finally {
    invalidarAlertas(email);
  }
  return lista.length;
}

// las disparadas que el usuario ya vio (apaga la pastilla del lateral). update y
// no set+merge: un set sobre un id que ya no existe sería un create sin los nueve
// campos y la regla lo rechaza. Devuelve cuántas marcó.
export const marcarVistas = (email, ids) => porLotes(email, ids, (lote, ref) => lote.update(ref, { vista: true }));

// saca del historial las disparadas que el usuario ya no quiere ver (borra los docs)
export const limpiarHistorial = (email, ids) => porLotes(email, ids, (lote, ref) => lote.delete(ref));

/* ───────────────────────── contador del lateral ───────────────────────── */
// recibe el email o el ctx del panel. 0 si no hay sesión o si la lectura falla.
export async function contarDisparadasNoVistas(emailOCtx) {
  let email = null, verificado = true;
  if (typeof emailOCtx === 'string') email = emailOCtx;
  else if (emailOCtx && emailOCtx.S) { email = emailOCtx.S.email; verificado = emailOCtx.S.verificado !== false; }
  else if (emailOCtx && typeof emailOCtx.email === 'string') email = emailOCtx.email;
  if (!email || !verificado) return 0;
  try { return (await leerAlertas(email)).filter(a => a.disparada != null && !a.vista).length; }
  catch (e) { return 0; }
}

/* ───────────────────────── evaluación contra los precios del panel ───────────────────────── */
const _enVuelo = new Set();   // `${email}/${id}` que esta pestaña ya marcó (o está marcando)

// mi-cartera.js guarda los precios por ticker en mayúsculas; el doc también
const precioDe = (precios, ticker) => {
  const tk = String(ticker == null ? '' : ticker);
  return precios[tk] || precios[tickerLimpio(tk)] || null;
};

// recorre las activas sin disparar cuyo ticker tenga precio (finito, sin sinDatos,
// misma moneda) y marca las que cruzaron. Devuelve las que saltaron, ya con
// precioDisparo, activa: false y disparada (hora local hasta la próxima lectura).
export async function evaluarConPrecios(email, precios) {
  email = String(email || '');
  if (!email || !precios || typeof precios !== 'object') return [];
  let lista;
  try { lista = await leerAlertas(email); } catch (e) { return []; }
  const saltaron = [];
  let toco = false;
  for (const a of lista) {
    if (a.activa === false || a.disparada != null) continue;
    const px = precioDe(precios, a.ticker);
    if (!px || px.sinDatos) continue;
    const p = positivo(px.precio);
    if (p == null || px.moneda !== a.moneda) continue;
    if (!evaluar(a, p)) continue;
    const clave = email + '/' + a.id;
    if (_enVuelo.has(clave)) continue;
    _enVuelo.add(clave);
    toco = true;
    try {
      await updateDoc(referencia(email, a.id), { disparada: serverTimestamp(), precioDisparo: p, activa: false });
      saltaron.push({ ...a, disparada: new Date(), precioDisparo: p, activa: false });
    } catch (e) {
      // permission-denied: ya la disparó otra pestaña o el pipeline (la regla deja
      // UNA sola vez). Se relee en la próxima y se ignora. Otro error (red): se
      // suelta la marca para reintentar en el próximo refresco de precios.
      if (!esPermisoDenegado(e)) _enVuelo.delete(clave);
    }
  }
  if (toco) invalidarAlertas(email);
  return saltaron;
}

// una sola vez por página: escucha "valtia-precios" (mi-cartera.js), filtra por la
// cuenta abierta y, por cada disparo, ctx.toast(fraseDisparo) y ctx.refrescar('alertas').
// Devuelve true si la instaló ahora, false si ya estaba o no hay window.
let _instalada = false;
// Cada lectura de precios se evalúa UNA sola vez. mi-cartera.js emite el evento
// en cada pintar(), también en repintados sin releer (cambiar de moneda, volver
// a la pestaña horas después, crear una alerta): con esos precios viejos una
// alerta recién creada podía saltar contra un precio que ya no es el de hoy, y
// una alerta disparada no se puede deshacer. leerTodo() arma un objeto _precios
// NUEVO en cada lectura, así que alcanza con recordar los objetos ya evaluados.
const _evaluados = new WeakSet();
export function instalarEvaluacion(ctx) {
  if (!ctx || typeof window === 'undefined' || !window.addEventListener) return false;
  // el flag va en window por si dos importadores cargan el módulo con distinto ?v=
  if (_instalada || window.__valtiaAlertasPrecio) return false;
  _instalada = true; window.__valtiaAlertasPrecio = true;
  window.addEventListener(EVENTO_PRECIOS, ev => {
    const d = ev && ev.detail;
    if (!d || !d.precios || typeof d.precios !== 'object') return;
    const S = ctx.S || {};
    if (!S.email || d.email !== S.email || S.verificado === false) return;
    // recién acá: un evento de otra cuenta o sin verificar no gasta la lectura
    if (_evaluados.has(d.precios)) return;
    _evaluados.add(d.precios);
    const email = S.email;
    evaluarConPrecios(email, d.precios).then(saltaron => {
      if (!saltaron.length || (ctx.S || {}).email !== email) return;   // cambió la cuenta mientras tanto
      const fmt = typeof ctx.money === 'function' ? ctx.money : fmtPrecio;
      if (typeof ctx.toast === 'function') saltaron.forEach(a => { try { ctx.toast(fraseDisparo(a, fmt)); } catch (e) {} });
      if (typeof ctx.refrescar === 'function') { try { ctx.refrescar('alertas'); } catch (e) {} }
    }).catch(() => {});
  });
  return true;
}
