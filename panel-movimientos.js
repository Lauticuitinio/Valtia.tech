// panel-movimientos.js — pestaña "Movimientos" del panel del inversor (Panel v3,
// id 'historial', grupo "Tus inversiones"). El id NO es 'movimientos' porque ese ya
// lo usa la gestión del fondo (Posiciones, #tab-movimientos de fondo-live.js).
//
// Qué muestra: todas las compras, las ventas y los avisos del sync que esperan
// respuesta, en una sola lista con filtros (tipo, broker, año y búsqueda), orden
// por columnas y exportación a CSV (punto y coma y coma decimal, para Excel en
// español). El prototipo no tiene esta pantalla: usa sus tablas y sus tarjetas
// (la de Tenencias de Mi cartera, las fichas de cifras y las etiquetas de Alertas).
//
// De dónde sale cada cosa (nada se inventa):
//   · compras  → inversores/{email}/cartera, un doc por compra (ctx.cartera()).
//     "Vendí" descuenta de la posición y el sync baja la cantidad cuando el broker
//     la baja: la cantidad COMPRADA se reconstruye con lo que queda + lo vendido de
//     esa compra (ventas con su posId) + lo que el sync bajó y todavía no se
//     respondió (avisos con su posId). Si la posición ya no existe (se vendió
//     entera), la compra sale de la foto que guardó la venta o el aviso.
//   · ventas   → inversores/{email}/ventas (ctx.ventas()), con su resultado fijo
//     (ventas.js: precio de venta contra el costo de esa compra).
//   · avisos   → inversores/{email}/ajustes (ctx.ajustes()): "en IOL bajó de 96 a
//     56, ¿vendiste?". Se responden en Mi cartera; acá solo se listan.
// Cada movimiento va en la moneda en que se hizo: acá no se convierte nada.
//
// No importa panel.js (sería un import circular): todo llega por ctx. Las
// funciones puras de arriba (armarMovimientos, filtrar, ordenar, resumen,
// csvDe…) se prueban con node en scripts/test-movimientos.mjs.
import { base, nombreDe, monedaProbable, esRentaFija } from './activos.js?v=7';
import { resultadoVenta, cantidadAjuste, monedaFactor } from './ventas.js?v=6';
import { tipoActivo, iniciales } from './tipos-activo.js?v=1';

/* ───────────────────────── datos (puro) ───────────────────────── */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dia = s => String(s || '').slice(0, 10);
const redondear = n => Math.round((Number(n) || 0) * 1e8) / 1e8;   // sin ruido de coma flotante (cripto)
export const cantTxt = n => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 8 });
const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* el nombre que se muestra al lado del ticker: el del sync (precios/{tk}.nombre)
   o el de la ficha de Valtia. Si lo único que hay es el mismo ticker, nada */
function nombreActivo(tk, px) {
  const n = String((px && px.nombre) || nombreDe(tk) || '').trim();
  return n && n.toUpperCase() !== base(tk) ? n : '';
}

/* fecha de una compra: la real, o si no hay, desde cuándo la ve el sync (aprox) */
function fechaCompra(p) {
  const f = dia(p.fecha), d = dia(p.desde);
  if (ISO.test(f)) return { f, aprox: !!p.fechaAprox };
  if (ISO.test(d)) return { f: d, aprox: true };
  return { f: '', aprox: false };
}

function compraDe(p, precios, bonos, panel, extra, enCartera, fantasma) {
  const tk = String(p.ticker || '').trim().toUpperCase();
  const px = (precios || {})[tk] || null;
  const rf = esRentaFija(tk, bonos);
  const mf = monedaFactor(p, px, rf);
  // sin moneda en ningún lado (ticker sin sufijo y sin precio todavía): la que asume
  // Mi cartera para mostrarla, marcada como supuesta
  const moneda = mf.moneda || monedaProbable(tk, bonos);
  const cant = redondear((Number(p.cantidad) || 0) + (Number(extra) || 0));
  const precio = Number(p.precioCompra) > 0 ? Number(p.precioCompra) : null;
  const { f, aprox } = fechaCompra(p);
  const sync = String(p.origen || '').startsWith('sync');
  const notas = [];
  if (sync) notas.push('la trajo el sync de tu broker');
  if (aprox) notas.push('fecha aproximada');
  if (fantasma) notas.push('ya no está en tu cartera');
  if (!mf.moneda) notas.push('moneda supuesta hasta que llegue su precio');
  if (precio == null) notas.push('sin precio de compra');
  return {
    id: 'c-' + String(p.id || tk), tipo: 'compra', f, aprox, ticker: tk, nombre: nombreActivo(tk, px),
    tipoAct: tipoActivo(tk, { bonos, panel }), broker: String(p.broker || '').trim(),
    cant, precio, moneda, monedaSupuesta: !mf.moneda, factor: mf.factor,
    total: precio != null && cant > 0 ? precio * cant * mf.factor : null,
    resultado: null, pct: null, origen: sync ? 'sync' : 'manual', detalle: notas.join(' · '),
    creado: String(p.creado || ''), posId: String(p.id || ''), tiene: enCartera.has(tk),
  };
}

function ventaDe(v, precios, bonos, panel, enCartera) {
  const tk = String(v.ticker || '').trim().toUpperCase();
  const r = resultadoVenta(v);
  const precio = Number(v.precioVenta) > 0 ? Number(v.precioVenta) : null;
  const deAviso = v.origen === 'broker';
  const notas = [];
  if (deAviso) notas.push('registrada desde un aviso del sync');
  if (r.resultado == null) notas.push('sin precio de compra: sin resultado');
  return {
    id: 'v-' + String(v.id || tk), tipo: 'venta', f: ISO.test(dia(v.fecha)) ? dia(v.fecha) : '', aprox: false,
    ticker: tk, nombre: nombreActivo(tk, (precios || {})[tk] || null), tipoAct: tipoActivo(tk, { bonos, panel }),
    broker: String(v.broker || '').trim(), cant: Number(v.cantidad) || 0, precio,
    moneda: v.moneda === 'ARS' ? 'ARS' : 'USD', monedaSupuesta: false,
    factor: Number(v.factor) > 0 ? Number(v.factor) : 1,
    total: precio != null ? r.ingreso : null, resultado: r.resultado, pct: r.pct,
    origen: deAviso ? 'broker' : 'manual', detalle: notas.join(' · '),
    creado: String(v.creado || ''), posId: String(v.posId || ''), tiene: enCartera.has(tk),
  };
}

function avisoDe(a, precios, bonos, panel, enCartera) {
  const tk = String(a.ticker || '').trim().toUpperCase();
  const brk = String(a.broker || '').trim();
  const donde = brk || 'tu broker';
  const detalle = a.tipo === 'desaparecio'
    ? `ya no aparece en ${donde} (tenías ${cantTxt(a.cantidadAntes)})`
    : `bajó en ${donde} de ${cantTxt(a.cantidadAntes)} a ${cantTxt(a.cantidadBroker)}`;
  return {
    id: 'a-' + String(a.id || tk), tipo: 'aviso', f: ISO.test(dia(a.fecha)) ? dia(a.fecha) : '', aprox: false,
    ticker: tk, nombre: nombreActivo(tk, (precios || {})[tk] || null), tipoAct: tipoActivo(tk, { bonos, panel }), broker: brk,
    cant: cantidadAjuste(a), precio: null, moneda: null, monedaSupuesta: false, factor: 1,
    total: null, resultado: null, pct: null, origen: 'sync', detalle,
    creado: String(a.creado || ''), posId: String(a.posId || ''), tiene: enCartera.has(tk),
  };
}

/* Todas las filas, sin filtrar ni ordenar.
   { pos, precios } es lo que devuelve ctx.cartera(); ventas y ajustes, los docs
   con su id; bonos, el Set de bonosPanel.todos; panel, el doc bonosPanel. */
export function armarMovimientos({ pos = [], precios = {}, ventas = [], ajustes = [], bonos = new Set(), panel = null } = {}) {
  pos = Array.isArray(pos) ? pos.filter(p => p && p.ticker) : [];
  ventas = Array.isArray(ventas) ? ventas.filter(v => v && v.ticker) : [];
  // los avisos se borran cuando se responden: los que quedan están pendientes. El
  // estado se mira igual por si el sync algún día deja los respondidos
  const avisos = (Array.isArray(ajustes) ? ajustes : []).filter(a => a && a.ticker && (!a.estado || a.estado === 'pendiente'));
  const enCartera = new Set(pos.map(p => String(p.ticker).trim().toUpperCase()));
  // lo que salió de cada compra después de cargada: vendido (ventas) y bajado por el
  // sync sin responder todavía (avisos). Sumado a lo que queda, es lo que se compró
  const salio = {};
  const sumar = (k, n) => { if (k) salio[k] = (salio[k] || 0) + (Number(n) || 0); };
  ventas.forEach(v => sumar(String(v.posId || ''), v.cantidad));
  avisos.forEach(a => sumar(String(a.posId || ''), cantidadAjuste(a)));
  const ids = new Set(pos.map(p => String(p.id || '')));
  const filas = pos.map(p => compraDe(p, precios, bonos, panel, salio[String(p.id || '')] || 0, enCartera, false));
  // compras de posiciones que ya no están (vendidas enteras, o que el sync dejó de
  // ver): la foto que guardó la venta o el aviso. Una por compra (posId)
  const fantasmas = new Map();
  [...ventas, ...avisos].forEach(x => {
    const k = String(x.posId || '');
    if (!k || ids.has(k) || fantasmas.has(k)) return;
    const foto = x.pos && typeof x.pos === 'object' ? x.pos : {};
    fantasmas.set(k, { ...foto, id: k, ticker: foto.ticker || x.ticker, cantidad: 0,
                       broker: foto.broker || x.broker || '' });
  });
  fantasmas.forEach((p, k) => filas.push(compraDe(p, precios, bonos, panel, salio[k] || 0, enCartera, true)));
  ventas.forEach(v => filas.push(ventaDe(v, precios, bonos, panel, enCartera)));
  avisos.forEach(a => filas.push(avisoDe(a, precios, bonos, panel, enCartera)));
  return filas;
}

/* filtros: tipo ('todos' | 'compra' | 'venta' | 'aviso'), broker ('' = todos,
   SIN_BROKER = los que no tienen), anio ('' = todos, 'AAAA') y q (ticker,
   nombre, broker o tipo de activo; sin importar mayúsculas ni tildes) */
// el broker es texto libre ("-" o "sin" pueden ser nombres de verdad): este no se tipea
export const SIN_BROKER = '\u0000';
export function filtrar(filas, { tipo = 'todos', broker = '', anio = '', q = '' } = {}) {
  const nq = sinTildes(q);
  return (filas || []).filter(x =>
    (tipo === 'todos' || x.tipo === tipo)
    && (!broker || (broker === SIN_BROKER ? !x.broker : x.broker === broker))
    && (!anio || String(x.f).slice(0, 4) === anio)
    && (!nq || sinTildes([x.ticker, base(x.ticker), x.nombre, x.broker, x.tipoAct && x.tipoAct.n].join(' ')).includes(nq)));
}

/* orden por columna: fecha, activo, tipo, cant, total, resultado. Lo que no tiene
   dato (sin fecha, sin total) va siempre al final. Total y resultado se ordenan
   primero por moneda (pesos, después dólares) y adentro por importe: sumar pesos
   con dólares para ordenar sería mentir. */
const ORD_TIPO = { compra: 0, venta: 1, aviso: 2 };
export const ORDEN_INICIAL = { fecha: 'desc', activo: 'asc', tipo: 'asc', cant: 'desc', total: 'desc', resultado: 'desc' };
export function ordenar(filas, { col = 'fecha', dir = 'desc' } = {}) {
  const s = dir === 'asc' ? 1 : -1;
  const nulos = (a, b, f) => (a == null && b == null) ? 0 : a == null ? 1 : b == null ? -1 : f(a, b);
  const porFecha = sg => (a, b) => nulos(a.f || null, b.f || null, (x, y) => sg * x.localeCompare(y))
    || sg * String(a.creado).localeCompare(String(b.creado));
  const recientes = porFecha(-1);
  const porMoneda = (a, b) => String(a.moneda || '~').localeCompare(String(b.moneda || '~'));
  const cmp = {
    fecha: porFecha(s),
    activo: (a, b) => s * base(a.ticker).localeCompare(base(b.ticker)) || recientes(a, b),
    tipo: (a, b) => s * (ORD_TIPO[a.tipo] - ORD_TIPO[b.tipo]) || recientes(a, b),
    cant: (a, b) => nulos(a.cant, b.cant, (x, y) => s * (x - y)) || recientes(a, b),
    total: (a, b) => nulos(a.total, b.total, (x, y) => porMoneda(a, b) || s * (x - y)) || recientes(a, b),
    resultado: (a, b) => nulos(a.resultado, b.resultado, (x, y) => porMoneda(a, b) || s * (x - y)) || recientes(a, b),
  }[col] || porFecha(s);
  return [...(filas || [])].sort((a, b) => cmp(a, b) || String(a.id).localeCompare(String(b.id)));
}

/* las cifras de arriba, por moneda y sin convertir: cuántas compras y ventas,
   cuánto se puso en compras, cuánto se cobró y el resultado de las ventas */
export function resumen(filas) {
  const r = { compras: 0, ventas: 0, avisos: 0, invertido: {}, cobrado: {}, resultado: {}, sinCosto: 0, desde: '' };
  const sumar = (o, m, v) => { if (m && v != null && isFinite(v)) o[m] = (o[m] || 0) + v; };
  (filas || []).forEach(x => {
    if (x.tipo === 'compra') {
      r.compras++;
      sumar(r.invertido, x.moneda, x.total);
      if (x.f && (!r.desde || x.f < r.desde)) r.desde = x.f;
    } else if (x.tipo === 'venta') {
      r.ventas++;
      sumar(r.cobrado, x.moneda, x.total);
      if (x.resultado == null) r.sinCosto++; else sumar(r.resultado, x.moneda, x.resultado);
    } else if (x.tipo === 'aviso') r.avisos++;
  });
  return r;
}

/* los brokers y los años que aparecen, para los selectores */
export function opciones(filas) {
  const brokers = [...new Set((filas || []).map(x => x.broker).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const anios = [...new Set((filas || []).map(x => String(x.f).slice(0, 4)).filter(a => /^\d{4}$/.test(a)))].sort().reverse();
  return { brokers, sinBroker: (filas || []).some(x => !x.broker), anios };
}

/* ── CSV: punto y coma, coma decimal, BOM y fin de línea de Windows, así Excel en
   español lo abre con las columnas y los números en su lugar ── */
export const COLS_CSV = ['fecha', 'tipo', 'ticker', 'nombre', 'tipo_activo', 'broker', 'cantidad', 'precio',
                         'moneda', 'factor', 'total', 'resultado', 'origen', 'detalle'];
const TIPO_TXT = { compra: 'Compra', venta: 'Venta', aviso: 'Aviso del sync' };
const ORIGEN_TXT = { manual: 'cargada a mano', sync: 'sync del broker', broker: 'aviso del sync' };
/* número sin separador de miles y con coma decimal; vacío si no hay dato */
export function numCsv(n) {
  if (n == null || n === '' || !isFinite(Number(n))) return '';
  let t = Number(n).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  if (t === '-0') t = '0';
  return t.replace('.', ',');
}
/* texto entre comillas. Lo que empieza con = + - @ lleva un apóstrofo adelante: un
   broker escrito "=HYPERLINK(…)" no se ejecuta como fórmula al abrir el archivo */
export function textoCsv(s) {
  let t = String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@\t]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}
export const fechaCsv = f => ISO.test(String(f || '')) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '';
export function csvDe(filas) {
  const lineas = [COLS_CSV.join(';')];
  (filas || []).forEach(x => lineas.push([
    fechaCsv(x.f), textoCsv(TIPO_TXT[x.tipo] || x.tipo), textoCsv(x.ticker), textoCsv(x.nombre),
    textoCsv(x.tipoAct && x.tipoAct.n), textoCsv(x.broker), numCsv(x.cant), numCsv(x.precio),
    textoCsv(x.moneda || ''), numCsv(x.factor), numCsv(x.total), numCsv(x.resultado),
    textoCsv(ORIGEN_TXT[x.origen] || x.origen), textoCsv(x.detalle),
  ].join(';')));
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

/* importes: en la moneda del movimiento, con el signo menos tipográfico como el
   resto del panel. Los precios chicos (cripto) conservan sus cifras */
const simbolo = m => m === 'ARS' ? '$' : 'US$';
export function plata(n, m, { precio = false, signo = false } = {}) {
  if (n == null || !isFinite(Number(n)) || !m) return '—';
  const v = Number(n), a = Math.abs(v);
  const txt = precio && a > 0 && a < 1
    ? a.toLocaleString('es-AR', { maximumSignificantDigits: 4 })
    : a.toLocaleString('es-AR', precio ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                                       : { maximumFractionDigits: a < 1000 ? 2 : 0 });
  return (v < 0 ? '−' : signo && v > 0 ? '+' : '') + simbolo(m) + txt;
}
const pctTxt = n => n == null || !isFinite(n) ? '' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.', ',') + '%';

/* ───────────────────────── estilos ───────────────────────── */
// Los del prototipo: tarjeta blanca con borde #E7E3DA y radio 12, encabezado de
// tabla 11 px en mayúsculas, filas de 14,5 px con separador #F2EFE8, fichas de
// cifras (radio 10), etiquetas de tipo (radio 6) y los selectores de la regla §0.
// Todo con las variables --v3-* de panel.js, que tienen su versión oscura.
const CSS_ID = 'v3-css-movimientos';
const CSS = `
.v3mv{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink,#101010);min-width:0;
  --mv-cedear:#EEF2FA;--mv-cedearTx:#14213D;--mv-accion:#EAF5EF;--mv-accionTx:#1F7A4D;--mv-rf:#F6EEDC;--mv-rfTx:#8A6A2F;
  --mv-cripto:#F1ECF9;--mv-criptoTx:#5B3FA8;--mv-otro:#F0F1F3;--mv-otroTx:#57534A}
[data-theme="dark"] .v3mv{--mv-cedear:rgba(143,179,232,.14);--mv-cedearTx:#8FB3E8;--mv-accion:rgba(95,203,142,.14);--mv-accionTx:#5FCB8E;
  --mv-rf:rgba(232,206,150,.14);--mv-rfTx:#E8CE96;--mv-cripto:rgba(185,166,240,.16);--mv-criptoTx:#B9A6F0;--mv-otro:rgba(255,255,255,.08);--mv-otroTx:rgba(244,241,234,.74)}
.v3mv *{box-sizing:border-box}
.v3mv-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
/* fichas de cifras (las de Mi cartera en el prototipo) */
.v3mv-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr));gap:10px;margin-bottom:14px}
.v3mv-k{border:1px solid var(--v3-line,#E7E3DA);border-radius:10px;padding:11px 14px;min-width:0;background:var(--v3-card,#fff)}
.v3mv-k .l{font-size:12.5px;color:var(--v3-mut,#8B8375);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3mv-k .v{font:600 17.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink,#101010);margin-top:5px;line-height:1.3;overflow-wrap:anywhere}
.v3mv-k .v small{font:500 13px 'IBM Plex Sans',sans-serif;color:var(--v3-mut,#8B8375);margin-left:2px}
.v3mv-k .s{font-size:12.5px;color:var(--v3-mut,#8B8375);margin-top:3px;line-height:1.45;overflow-wrap:anywhere}
.v3mv-k .up{color:var(--v3-up,#1F7A4D)}.v3mv-k .dn{color:var(--v3-dn,#B23A3A)}.v3mv-k .warn{color:var(--v3-warn,#B7791F)}
/* la tarjeta de la lista (la de Tenencias) */
.v3mv-card{background:var(--v3-card,#fff);border:1px solid var(--v3-line,#E7E3DA);border-radius:12px;container-type:inline-size;container-name:v3mv;min-width:0}
.v3mv-h{display:flex;align-items:center;justify-content:space-between;gap:10px 14px;flex-wrap:wrap;padding:16px 18px 6px}
.v3mv-h .t{display:flex;align-items:baseline;gap:8px;min-width:0}
.v3mv-h .t b{font:600 19px 'IBM Plex Sans',sans-serif;color:var(--v3-ink,#101010)}
.v3mv-h .t span{font-size:13.5px;color:var(--v3-mut,#8B8375);white-space:nowrap}
/* selectores y botones (SPEC §0): borde dorado sutil, radio 8; el activo con relleno crema */
.v3mv-seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.v3mv-seg button,.v3mv-b{font:500 12px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;cursor:pointer;white-space:nowrap;
  color:var(--v3-selTx,#57534A);background:var(--v3-selBg,#fff);border:1px solid var(--v3-sel,rgba(176,138,62,.4));border-radius:8px;
  transition:color .15s,border-color .15s,background .15s}
.v3mv-seg button:hover,.v3mv-b:hover{color:var(--v3-selOnTx,#101010)}
.v3mv-seg button.on,.v3mv-b[aria-pressed="true"]{color:var(--v3-selOnTx,#101010);border-color:var(--v3-selOn,#B08A3E);background:var(--v3-selOnBg,#FBF5E8)}
.v3mv-seg button i{font-style:normal;color:var(--v3-mut,#8B8375);margin-left:4px}
.v3mv-b{font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:8px 12px}
.v3mv-b[disabled]{opacity:.45;cursor:default}
.v3mv-seg button:focus-visible,.v3mv-b:focus-visible,.v3mv-in:focus-visible,.v3mv-ord:focus-visible,.v3mv-tk:focus-visible,.v3mv-prim:focus-visible{outline:2px solid var(--v3-focus,#14213D);outline-offset:2px}
.v3mv-ctl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 18px 12px}
.v3mv-ctl .sep{flex:1 1 0;min-width:0}
.v3mv-in{font:500 14px 'IBM Plex Sans',sans-serif;color:var(--v3-ink,#101010);background:var(--v3-input,#fff);border:1px solid var(--v3-line,#E7E3DA);
  border-radius:8px;padding:8px 12px;outline:none;min-width:0;max-width:100%}
.v3mv-in:focus{border-color:var(--v3-focus,#14213D)}
.v3mv-q{flex:1 1 200px;max-width:320px}
select.v3mv-in{padding-right:28px;cursor:pointer}
.v3mv-in option{color:#101010;background:#fff}
/* la tabla: grilla de 6 columnas como la de Tenencias */
.v3mv-t{min-width:0}
.v3mv-hd,.v3mv-row{display:grid;grid-template-columns:86px minmax(190px,2fr) 96px minmax(110px,1fr) minmax(110px,1fr) minmax(110px,1fr);gap:14px;align-items:center;padding:13px 18px}
.v3mv-hd{padding:10px 18px 10px;border-bottom:1px solid var(--v3-line,#E7E3DA);border-top:1px solid var(--v3-line2,#F2EFE8)}
.v3mv-hd > div{min-width:0}
.v3mv-ord{font:700 11px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut,#8B8375);background:none;border:0;padding:2px 0;cursor:pointer;white-space:nowrap}
.v3mv-ord:hover,.v3mv-ord.on{color:var(--v3-ink,#101010)}
.v3mv-ord b{font-weight:700;color:var(--v3-gold,#B08A3E);margin-left:3px}
.v3mv .r{text-align:right;justify-self:end}
.v3mv-row{border-bottom:1px solid var(--v3-line2,#F2EFE8);transition:background .12s}
.v3mv-row:last-child{border-bottom:0}
.v3mv-row:hover{background:var(--v3-hover,#F6F7F9)}
.v3mv-row > div{min-width:0}
.v3mv .c-f b{display:block;font:500 14px 'IBM Plex Sans',sans-serif;color:var(--v3-ink,#101010)}
.v3mv .c-f small,.v3mv .c-cp small,.v3mv .c-res small{display:block;font:500 12.5px 'IBM Plex Sans',sans-serif;color:var(--v3-mut,#8B8375);margin-top:2px}
.v3mv .c-f .sin{font:500 13px 'IBM Plex Sans',sans-serif;color:var(--v3-mut,#8B8375)}
.v3mv .c-act{display:flex;align-items:center;gap:12px}
.v3mv-logo{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden;
  font:600 10.5px 'IBM Plex Sans',sans-serif;background:var(--mv-otro);color:var(--mv-otroTx)}
.v3mv-logo.cedear,.v3mv-logo.etf{background:var(--mv-cedear);color:var(--mv-cedearTx)}
.v3mv-logo.accion{background:var(--mv-accion);color:var(--mv-accionTx)}
.v3mv-logo.bono,.v3mv-logo.letra{background:var(--mv-rf);color:var(--mv-rfTx)}
.v3mv-logo.cripto{background:var(--mv-cripto);color:var(--mv-criptoTx)}
.v3mv .an{min-width:0;flex:1}
.v3mv .an .nm{font:600 15px 'IBM Plex Sans',sans-serif;color:var(--v3-ink,#101010);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3mv .an .nm span{font-weight:400;font-size:13.5px;color:var(--v3-sub,#57534A);margin-left:6px}
.v3mv-tk{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-decoration-color:var(--v3-line,#E7E3DA);text-underline-offset:3px}
.v3mv-tk:hover{text-decoration-color:var(--v3-gold,#B08A3E)}
.v3mv .an .sb{font-size:12.5px;color:var(--v3-mut,#8B8375);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3mv-pill{display:inline-block;font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:6px;white-space:nowrap}
.v3mv-pill.compra{color:var(--v3-up,#1F7A4D);background:var(--v3-upBg,rgba(31,122,77,.12))}
.v3mv-pill.venta{color:var(--v3-dn,#B23A3A);background:var(--v3-dnBg,rgba(178,58,58,.12))}
.v3mv-pill.aviso{color:var(--v3-warn,#B7791F);background:var(--v3-warnBg,rgba(183,121,31,.1))}
.v3mv .c-cp div,.v3mv .c-tot,.v3mv .c-res div{font:500 14.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink,#101010);white-space:nowrap}
.v3mv .c-tot{font-weight:600}
.v3mv .c-res .up{color:var(--v3-up,#1F7A4D)}.v3mv .c-res .dn{color:var(--v3-dn,#B23A3A)}
.v3mv .mut{color:var(--v3-mut,#8B8375)}
.v3mv-ir{font:600 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-gold,#B08A3E);text-decoration:none;white-space:nowrap}
.v3mv-ir:hover{color:var(--v3-gold2,#8A6A2F)}
.v3mv-nada{padding:28px 18px;font-size:14px;color:var(--v3-sub,#57534A);text-align:center}
.v3mv-nada button{margin-left:6px}
.v3mv-nota{font-size:13px;color:var(--v3-mut,#8B8375);line-height:1.7;margin:18px 0 0;max-width:760px;text-align:justify;hyphens:auto}
.v3mv-aviso{font-size:13.5px;color:var(--v3-sub,#57534A);line-height:1.6;margin:0 0 12px;padding:10px 14px;border-radius:10px;background:var(--v3-warnBg,rgba(183,121,31,.1))}
.v3mv-aviso b{color:var(--v3-warn,#B7791F)}
/* estados vacíos y de error: la tarjeta del prototipo */
.v3mv-vacio{background:var(--v3-card,#fff);border:1px solid var(--v3-line,#E7E3DA);border-radius:12px;padding:22px 24px;max-width:620px}
.v3mv-vacio b{display:block;font:600 17.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink,#101010);line-height:1.3}
.v3mv-vacio p{font-size:14px;color:var(--v3-sub,#57534A);line-height:1.6;margin:8px 0 16px}
.v3mv-prim{display:inline-block;font:600 12px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-btnTx,#fff);
  background:var(--v3-btn,#14213D);border:1px solid var(--v3-btn,#14213D);border-radius:8px;padding:10px 16px;cursor:pointer;text-decoration:none;white-space:nowrap}
.v3mv-prim:hover{background:var(--v3-btnHover,#0E1830);border-color:var(--v3-btnHover,#0E1830)}
/* angosto (celular, o un ancho que no alcanza las seis columnas): cada movimiento
   es una tarjetita de tres renglones, sin scroll horizontal */
@container v3mv (max-width:799px){
  .v3mv-hd{display:none}
  .v3mv-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"act t" "cp tot" "f res";gap:6px 12px;padding:13px 16px}
  .v3mv-row .c-act{grid-area:act}.v3mv-row .c-t{grid-area:t;justify-self:end}
  .v3mv-row .c-cp{grid-area:cp;padding-left:46px}.v3mv-row .c-tot{grid-area:tot}
  .v3mv-row .c-f{grid-area:f;padding-left:46px;display:flex;align-items:baseline;gap:6px}
  .v3mv-row .c-f b{display:inline;font-size:13px;color:var(--v3-mut,#8B8375)}
  .v3mv-row .c-f small{display:inline;margin:0}
  .v3mv-row .c-res{grid-area:res}
  .v3mv-row .c-cp{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;justify-self:start;text-align:left}
  .v3mv-row .c-cp small{margin:0}
  .v3mv-h,.v3mv-ctl{padding-left:16px;padding-right:16px}
  .v3mv-ctl .sep{display:none}
  .v3mv-row .an .sb{white-space:normal}
  .v3mv-q{flex:1 1 100%;max-width:none}
  .v3mv-ctl select.v3mv-in,.v3mv-ctl .v3mv-b{flex:1 1 130px}
  .v3mv-ctl select.v3mv-in{padding:8px 4px 8px 10px;font-size:13.5px}
}
/* sin container queries (navegadores viejos): la grilla ancha con scroll adentro de la tarjeta */
@supports not (container-type:inline-size){.v3mv-card{overflow-x:auto}.v3mv-t{min-width:820px}}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ───────────────────────── estado de la pestaña ───────────────────────── */
// filtros y orden de ESTA sesión y de ESTA cuenta; al cambiar de mail, de cero
const nuevoEstado = email => ({ email, tipo: 'todos', broker: '', anio: '', q: '', col: 'fecha', dir: 'desc' });
let E = nuevoEstado('');
let D = { email: '', filas: [], faltan: [] };
let _seq = 0, _ctx = null, _tq = null;
const OCULTO = '•••••';
const PREF_OCULTAR = 'valtia-mc-ocultar';   // el mismo "Ocultar $" de Mi cartera
const ocultar = () => { try { return localStorage.getItem(PREF_OCULTAR) === '1'; } catch (e) { return false; } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seguro = async (f, d) => { try { const r = await f(); return r == null ? d : r; } catch (e) { return d; } };
const fechaCorta = f => ISO.test(String(f || '')) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}` : '';

/* ───────────────────────── HTML ───────────────────────── */
function esqueleto(ctx) {
  if (ctx && typeof ctx.skel === 'function') return ctx.skel([72, 72, 72, 72], 380);
  return '<p class="vp-cargando">Cargando tus movimientos…</p>';
}

function tarjeta(titulo, texto, boton) {
  return `<div class="v3mv-vacio"><b>${titulo}</b><p>${texto}</p>${boton || ''}</div>`;
}

/* los importes por moneda en una línea: "$1.250.000 · US$3.400" */
const porMoneda = (o, opts) => ['ARS', 'USD'].filter(m => o[m] != null).map(m => plata(o[m], m, opts));

function kpisHTML(r, tapar) {
  const $$ = (o, opts) => { const l = porMoneda(o, opts); return l.length ? (tapar ? OCULTO : l.join(' · ')) : ''; };
  const inv = $$(r.invertido), cob = $$(r.cobrado);
  const res = porMoneda(r.resultado, { signo: true });
  // verde si ganó, rojo si perdió; un cero (o casi) queda neutro
  const clsRes = ['ARS', 'USD'].filter(m => r.resultado[m] != null)
    .map(m => r.resultado[m] > 0.005 ? 'up' : r.resultado[m] < -0.005 ? 'dn' : '');
  const resTxt = !res.length ? '—' : tapar ? OCULTO
    : res.map((t, i) => `<span class="${clsRes[i]}">${esc(t)}</span>`).join(' · ');
  return `<div class="v3mv-k"><div class="l">Compras</div><div class="v">${r.compras}</div>
      <div class="s">${inv ? esc(inv) : r.compras ? 'sin precio de compra cargado' : 'todavía ninguna'}${r.desde ? ` · desde el ${esc(fechaCorta(r.desde))}` : ''}</div></div>
    <div class="v3mv-k"><div class="l">Ventas</div><div class="v">${r.ventas}</div>
      <div class="s">${cob ? `cobraste ${esc(cob)}` : r.ventas ? '—' : 'todavía ninguna'}</div></div>
    <div class="v3mv-k"><div class="l">Resultado de tus ventas</div><div class="v">${resTxt}</div>
      <div class="s">${r.ventas ? (r.sinCosto ? `${r.sinCosto} sin precio de compra, fuera de la cuenta` : 'contra lo que pagaste en cada compra') : 'se calcula al vender'}</div></div>
    <div class="v3mv-k"><div class="l">Avisos del sync</div><div class="v${r.avisos ? ' warn' : ''}">${r.avisos}</div>
      <div class="s">${r.avisos ? `esperan tu respuesta en <a class="v3mv-ir" href="#panel/micartera" data-go="micartera">Mi cartera →</a>` : 'ninguno pendiente'}</div></div>`;
}

const TIPOS = [['todos', 'Todos'], ['compra', 'Compras'], ['venta', 'Ventas'], ['aviso', 'Avisos']];
function tiposHTML(base) {
  const n = { todos: base.length };
  base.forEach(x => { n[x.tipo] = (n[x.tipo] || 0) + 1; });
  return TIPOS.filter(([k]) => k !== 'aviso' || n.aviso || E.tipo === 'aviso').map(([k, t]) =>
    `<button type="button" data-mv-tipo="${k}" class="${E.tipo === k ? 'on' : ''}" aria-pressed="${E.tipo === k}">${t}<i>${n[k] || 0}</i></button>`).join('');
}

const COLS = [['fecha', 'Fecha', ''], ['activo', 'Activo', ''], ['tipo', 'Tipo', ''], ['cant', 'Cantidad · precio', 'r'],
              ['total', 'Total', 'r'], ['resultado', 'Resultado', 'r']];
function encabezadoHTML() {
  return `<div class="v3mv-hd" role="row">${COLS.map(([k, t, c]) => {
    const on = E.col === k;
    const aria = on ? (E.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const tit = k === 'total' || k === 'resultado' ? ' title="Ordena por moneda (pesos, después dólares) y dentro de cada una por importe"' : '';
    return `<div role="columnheader" aria-sort="${aria}" class="${c}"><button type="button" class="v3mv-ord${on ? ' on' : ''}" data-mv-ord="${k}"${tit}>${t}${on ? `<b aria-hidden="true">${E.dir === 'asc' ? '▴' : '▾'}</b>` : ''}</button></div>`;
  }).join('')}</div>`;
}

function filaHTML(x, tapar) {
  const t = x.tipoAct || {};
  const tk = base(x.ticker);
  const nombreTk = x.tiene
    ? `<button type="button" class="v3mv-tk" data-mv-ver="${esc(x.ticker)}" title="Ver ${esc(tk)} en Mi cartera">${esc(tk)}</button>`
    : esc(tk);
  const sub = x.tipo === 'aviso'
    ? x.detalle
    : [t.n, x.broker || 'sin broker', x.origen === 'sync' ? 'del sync' : x.origen === 'broker' ? 'desde un aviso' : ''].filter(Boolean).join(' · ');
  const fecha = x.f
    ? `<b>${esc(fechaCorta(x.f))}</b>${x.aprox ? `<small title="Fecha aproximada: desde cuándo la ve el sync de tu broker">aprox.</small>` : ''}`
    : '<span class="sin">Sin fecha</span>';
  const $ = (n, opts) => tapar && n != null ? OCULTO : plata(n, x.moneda, opts);
  // la renta fija cotiza por lámina (factor 0,01 → cada 100 VN): la unidad sale del factor
  const unidad = x.factor > 0 && x.factor !== 1 ? ` c/${cantTxt(Math.round(1 / x.factor))} VN` : ' c/u';
  let cp, tot, res;
  if (x.tipo === 'aviso') {
    cp = `<div>${esc(cantTxt(x.cant))}</div><small>sin registrar</small>`;
    tot = '<span class="mut">—</span>';
    res = `<a class="v3mv-ir" href="#panel/micartera" data-go="micartera">Responder →</a>`;
  } else {
    cp = `<div>${esc(cantTxt(x.cant))}</div><small${x.monedaSupuesta ? ' title="Moneda supuesta hasta que llegue su precio"' : ''}>${x.precio != null
      ? `a ${esc($(x.precio, { precio: true }))}${unidad}${x.monedaSupuesta ? '*' : ''}` : 'sin precio de compra'}</small>`;
    tot = x.total != null ? esc($(x.total)) : '<span class="mut">—</span>';
    const cr = x.resultado > 0.005 ? 'up' : x.resultado < -0.005 ? 'dn' : '';
    res = x.tipo === 'venta'
      ? (x.resultado != null
        ? `<div class="${cr}">${esc($(x.resultado, { signo: true }))}</div><small class="${cr}">${esc(pctTxt(x.pct))}</small>`
        : '<span class="mut" title="Sin precio de compra cargado: no hay contra qué calcularlo">—</span>')
      : '';
  }
  return `<div class="v3mv-row" role="row">
    <div class="c-f" role="cell">${fecha}</div>
    <div class="c-act" role="cell"><span class="v3mv-logo ${esc(t.k || 'otro')}" aria-hidden="true">${esc(iniciales(x.ticker))}</span>
      <div class="an"><div class="nm">${nombreTk}${x.nombre ? `<span>${esc(x.nombre)}</span>` : ''}</div><div class="sb" title="${esc(sub)}">${esc(sub)}</div></div></div>
    <div class="c-t" role="cell"><span class="v3mv-pill ${x.tipo}">${x.tipo === 'compra' ? 'Compra' : x.tipo === 'venta' ? 'Venta' : 'Aviso'}</span></div>
    <div class="c-cp r" role="cell">${cp}</div>
    <div class="c-tot r" role="cell">${tot}</div>
    <div class="c-res r" role="cell">${res}</div>
  </div>`;
}

function armar() {
  const o = opciones(D.filas), tapar = ocultar();
  // cada opción lleva su lugar en o.brokers y no el texto: un broker que se llame como
  // una opción especial no se confunde con ella
  const optB = `<option value="t">Todos los brokers</option>${o.brokers.map((b, i) => `<option value="${i}"${E.broker === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}${o.sinBroker ? `<option value="s"${E.broker === SIN_BROKER ? ' selected' : ''}>Sin broker</option>` : ''}`;
  const optA = `<option value="">Todos los años</option>${o.anios.map(a => `<option value="${a}"${E.anio === a ? ' selected' : ''}>${a}</option>`).join('')}`;
  const falta = D.faltan.length
    ? `<p class="v3mv-aviso"><b>No pudimos leer ${D.faltan.join(' ni ')}.</b> La lista puede estar incompleta: probá recargar en un rato.</p>` : '';
  return `<div class="v3mv">${falta}
    <div class="v3mv-kpis" data-mv="kpis" aria-live="polite"></div>
    <div class="v3mv-card">
      <div class="v3mv-h"><div class="t"><b>Compras, ventas y avisos</b><span data-mv="n"></span></div>
        <div class="v3mv-seg" role="group" aria-label="Tipo de movimiento" data-mv="tipos"></div></div>
      <div class="v3mv-ctl">
        <label class="v3mv-sr" for="v3mv-q">Buscar un movimiento</label>
        <input id="v3mv-q" class="v3mv-in v3mv-q" type="search" data-mv-q placeholder="Buscar ticker, nombre o broker" value="${esc(E.q)}" autocomplete="off">
        <select class="v3mv-in" data-mv-broker aria-label="Broker">${optB}</select>
        <select class="v3mv-in" data-mv-anio aria-label="Año">${optA}</select>
        <span class="sep"></span>
        <button type="button" class="v3mv-b" data-mv-ocultar aria-pressed="${tapar}" title="${tapar ? 'Volver a mostrar los importes' : 'Tapa los importes (también en Mi cartera); las cantidades quedan'}">${tapar ? 'Mostrar $' : 'Ocultar $'}</button>
        <button type="button" class="v3mv-b" data-mv-csv title="Baja lo que estás viendo, con estos filtros y este orden">Exportar CSV</button>
      </div>
      <div class="v3mv-t" role="table" aria-label="Tus movimientos" data-mv="tabla"></div>
    </div>
    <p class="v3mv-nota">Cada movimiento va en la moneda en que lo hiciste —pesos en BYMA, dólares en el exterior y en cripto—: acá no se convierte nada. Las compras muestran la cantidad que compraste: lo que tenés hoy de esa compra más lo que vendiste. Para vender, ajustar, deshacer una venta o responder un aviso del sync, andá a Mi cartera. El CSV sale con punto y coma y coma decimal, listo para abrir en Excel, y siempre con los importes a la vista.</p>
  </div>`;
}

/* repinta solo lo que cambia con los filtros (no el buscador: no pierde el foco) */
function pintarCuerpo(el) {
  const tapar = ocultar();
  const base0 = filtrar(D.filas, { broker: E.broker, anio: E.anio, q: E.q });
  const lista = ordenar(filtrar(base0, { tipo: E.tipo }), { col: E.col, dir: E.dir });
  const q = s => el.querySelector(`[data-mv="${s}"]`);
  const k = q('kpis'); if (k) k.innerHTML = kpisHTML(resumen(base0), tapar);
  const tp = q('tipos'); if (tp) tp.innerHTML = tiposHTML(base0);
  const n = q('n'); if (n) n.textContent = lista.length === D.filas.length
    ? `${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}`
    : `${lista.length} de ${D.filas.length}`;
  const t = q('tabla');
  if (t) t.innerHTML = encabezadoHTML() + (lista.length
    ? lista.map(x => filaHTML(x, tapar)).join('')
    : `<div class="v3mv-nada" role="row"><span role="cell">Nada con estos filtros.<button type="button" class="v3mv-b" data-mv-limpiar>Limpiar filtros</button></span></div>`);
  const csv = el.querySelector('[data-mv-csv]');
  if (csv) { csv.disabled = !lista.length; csv.dataset.n = String(lista.length); }
  // "Ocultar $" es el mismo de Mi cartera: el botón dice siempre lo que hay pintado
  const oc = el.querySelector('[data-mv-ocultar]');
  if (oc) {
    oc.setAttribute('aria-pressed', String(tapar));
    oc.textContent = tapar ? 'Mostrar $' : 'Ocultar $';
    oc.title = tapar ? 'Volver a mostrar los importes' : 'Tapa los importes (también en Mi cartera); las cantidades quedan';
  }
  el.__mvTapar = tapar;
}

/* ───────────────────────── eventos (uno por contenedor) ───────────────────────── */
function descargar(nombre, texto) {
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function instalarEventos(el) {
  if (el.__mv) return;
  el.__mv = true;
  // "Ocultar $" también se toca en Mi cartera: al volver a esta pestaña (el div pasa
  // de oculto a visible), si cambió desde el último pintado, se repinta
  try {
    new IntersectionObserver(ents => {
      if (ents.some(x => x.isIntersecting) && el.querySelector('.v3mv-card') && el.__mvTapar !== ocultar()) pintarCuerpo(el);
    }).observe(el);
  } catch (x) {}
  el.addEventListener('click', e => {
    const ctx = _ctx; if (!ctx) return;
    const b = e.target.closest('[data-mv-tipo],[data-mv-ord],[data-mv-csv],[data-mv-ocultar],[data-mv-ver],[data-mv-limpiar],[data-mv-agregar],[data-mv-reintentar]');
    if (!b || !el.contains(b)) return;
    if (b.dataset.mvTipo) { E.tipo = b.dataset.mvTipo; pintarCuerpo(el); return; }
    if (b.dataset.mvOrd) {
      const c = b.dataset.mvOrd;
      if (E.col === c) E.dir = E.dir === 'asc' ? 'desc' : 'asc';
      else { E.col = c; E.dir = ORDEN_INICIAL[c] || 'desc'; }
      pintarCuerpo(el);
      const nb = el.querySelector(`[data-mv-ord="${c}"]`); if (nb) nb.focus();
      return;
    }
    if (b.hasAttribute('data-mv-csv')) {
      const base0 = filtrar(D.filas, { broker: E.broker, anio: E.anio, q: E.q });
      const lista = ordenar(filtrar(base0, { tipo: E.tipo }), { col: E.col, dir: E.dir });
      if (!lista.length) return;
      const nombre = `valtia-movimientos-${ctx.hoyAR()}.csv`;
      try {
        descargar(nombre, csvDe(lista));
        ctx.toast(`Listo: ${nombre}, con ${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}`);
      } catch (x) { ctx.toast('No se pudo armar el archivo. Probá de nuevo.'); }
      return;
    }
    if (b.hasAttribute('data-mv-ocultar')) {
      const nuevo = !ocultar();
      try { localStorage.setItem(PREF_OCULTAR, nuevo ? '1' : '0'); } catch (x) {}
      pintarCuerpo(el);
      // Mi cartera lee la misma preferencia: que ya quede igual cuando vuelvas
      try { if (window.__mcRecargar) window.__mcRecargar(); } catch (x) {}
      return;
    }
    if (b.dataset.mvVer) { ctx.verPosicion(b.dataset.mvVer); return; }
    if (b.hasAttribute('data-mv-limpiar')) {
      E = { ...nuevoEstado(E.email), col: E.col, dir: E.dir };
      pintarTodo(el);
      return;
    }
    if (b.hasAttribute('data-mv-agregar')) { ctx.agregarPosicion(); return; }
    if (b.hasAttribute('data-mv-reintentar')) {
      ctx.invalidar('cartera', 'ventas', 'aj');
      renderMovimientos(el, ctx);
    }
  });
  el.addEventListener('input', e => {
    const i = e.target.closest('[data-mv-q]'); if (!i) return;
    clearTimeout(_tq);
    _tq = setTimeout(() => { E.q = i.value; pintarCuerpo(el); }, 150);
  });
  el.addEventListener('change', e => {
    const s = e.target.closest('[data-mv-broker],[data-mv-anio]'); if (!s) return;
    if (s.hasAttribute('data-mv-broker')) {
      const v = s.value, b = /^\d+$/.test(v) ? opciones(D.filas).brokers[Number(v)] : null;
      E.broker = v === 's' ? SIN_BROKER : b != null ? b : '';
    } else E.anio = s.value;
    pintarCuerpo(el);
  });
}

function pintarTodo(el) {
  el.innerHTML = armar();
  pintarCuerpo(el);
}

/* ───────────────────────── entrada ───────────────────────── */
export async function renderMovimientos(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S && ctx.S.email;
  _ctx = ctx;
  try {
    ponerCss();
    instalarEventos(el);
    if (E.email !== email) E = nuevoEstado(email);
    if (!ctx.S.verificado) {
      el.innerHTML = `<div class="v3mv">${tarjeta('Verificá tu mail para ver tus movimientos',
        'Te mandamos un enlace cuando creaste la cuenta. Hasta que lo abras, tus compras y ventas quedan guardadas pero bloqueadas.')}</div>`;
      return;
    }
    // si ya hay una lista de esta cuenta (una compra o venta nueva), queda hasta que
    // llegan los datos; si no, el esqueleto
    if (!el.querySelector('.v3mv-card') || el.__mvEmail !== email) el.innerHTML = `<div class="v3mv">${esqueleto(ctx)}</div>`;
    el.__mvEmail = email;
    const [c, vs, ajs, bonos, panel] = await Promise.all([
      seguro(() => ctx.cartera(), null), seguro(() => ctx.ventas(), null), seguro(() => ctx.ajustes(), null),
      seguro(() => ctx.bonosSet(), new Set()), seguro(() => ctx.panelBonos(), null)]);
    if (seq !== _seq || !ctx.S || ctx.S.email !== email) return;
    if (!c) {
      el.innerHTML = `<div class="v3mv">${tarjeta('No pudimos leer tus movimientos',
        'Puede ser la conexión. Tus compras y ventas siguen guardadas: probá de nuevo en un momento.',
        '<button type="button" class="v3mv-prim" data-mv-reintentar>Reintentar</button>')}</div>`;
      return;
    }
    const faltan = [vs == null ? 'tus ventas' : '', ajs == null ? 'los avisos del sync' : ''].filter(Boolean);
    D = { email, faltan, filas: armarMovimientos({ pos: c.pos || [], precios: c.precios || {}, ventas: vs || [], ajustes: ajs || [], bonos, panel }) };
    if (!D.filas.length) {
      el.innerHTML = `<div class="v3mv">${tarjeta('Todavía no registraste movimientos',
        'Cada compra que cargues en Mi cartera, cada venta que registres con «Vendí» y cada aviso del sync de tu broker aparecen acá, con su fecha, su precio y su total.',
        '<button type="button" class="v3mv-prim" data-mv-agregar>+ Agregar posición</button>')}</div>`;
      return;
    }
    pintarTodo(el);
  } catch (e) {
    if (seq !== _seq) return;
    el.innerHTML = `<div class="v3mv">${tarjeta('No pudimos armar la lista',
      'Algo salió mal al leer tus movimientos. Tus datos no se tocaron: probá de nuevo en un momento.',
      '<button type="button" class="v3mv-prim" data-mv-reintentar>Reintentar</button>')}</div>`;
  }
}
