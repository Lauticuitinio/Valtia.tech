// ventas.js — ventas y resultado realizado de Mi cartera.
// Módulo PURO (sin Firestore) para poder probarlo con node
// (scripts/test-ventas.mjs). Lo usan mi-cartera.js y panel.js.
//
// Criterio: identificación específica. Cada venta sale de UNA posición (la
// fila donde se tocó "Vendí") y se lleva como costo el precio de compra de esa
// posición. El resultado queda fijo en la venta: si después cambia la cartera,
// lo realizado no se mueve.

// campos de una posición que se guardan en la venta, para poder deshacerla
export const CAMPOS_POS = ['ticker', 'cantidad', 'precioCompra', 'fecha', 'broker', 'moneda', 'factor',
                           'origen', 'desde', 'fechaAprox', 'ultimaCompra', 'creado'];

// los campos que aceptan las reglas de Firestore (ventas/{vid}): si se agrega
// uno acá, hay que agregarlo también en firestore.rules (lo verifica el test)
export const CAMPOS_VENTA = ['ticker', 'cantidad', 'precioVenta', 'costoUnitario', 'fecha', 'fechaCompra',
                             'broker', 'moneda', 'factor', 'origen', 'posId', 'pos', 'creado'];

// para comparar cantidades con decimales (cripto: 0,1323 BTC)
const EPS = 1e-9;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dia = s => String(s || '').slice(0, 10);

/* moneda y factor de lámina con el mismo criterio que calcular() de
   mi-cartera: manda el doc de precios; si no, lo que diga la posición. A
   diferencia de calcular(), acá NO se asume USD: la venta congela la moneda
   para siempre, así que si no se sabe devuelve moneda null y la venta no se
   registra. esRF: renta fija sin factor en ningún lado → cotiza cada 100 VN. */
export function monedaFactor(pos, px, esRF = false) {
  const m = (px && px.moneda) || (pos && pos.moneda) || null;
  const factor = Number(pos && pos.factor) > 0 ? Number(pos.factor)
               : (px && Number(px.factor) > 0 ? Number(px.factor) : (esRF ? 0.01 : 1));
  return { moneda: m === 'ARS' ? 'ARS' : m ? 'USD' : null, factor };
}

/* resultado de una venta en SU moneda; resultado null si no se cargó el
   precio de compra (no se inventa un costo) */
export function resultadoVenta(v) {
  const cant = Number(v && v.cantidad) || 0;
  const pv = Number(v && v.precioVenta) || 0;
  const pc = Number(v && v.costoUnitario) || 0;
  const fac = Number(v && v.factor) > 0 ? Number(v.factor) : 1;
  const ingreso = cant * pv * fac;
  if (!(pc > 0) || !(cant > 0) || !(pv > 0)) return { resultado: null, pct: null, costo: null, ingreso };
  const costo = cant * pc * fac;
  return { resultado: ingreso - costo, pct: (pv / pc - 1) * 100, costo, ingreso };
}

/* días entre la compra y la venta. Con la fecha de compra real es exacto; si
   solo se sabe desde cuándo la vio el sync ("desde" de la foto), es un
   mínimo y va con aprox:true. null si no se sabe nada. */
export function tenencia(v) {
  const b = dia(v && v.fecha), real = dia(v && v.fechaCompra), desde = dia(v && v.pos && v.pos.desde);
  const a = ISO.test(real) ? real : ISO.test(desde) ? desde : '';
  if (!a || !ISO.test(b)) return null;
  const d = Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
  return d >= 0 ? { dias: d, aprox: !ISO.test(real) } : null;
}

/* solo los días exactos (con fecha de compra real) */
export function diasTenencia(v) {
  const t = tenencia(v);
  return t && !t.aprox ? t.dias : null;
}

/* valida lo que cargó el usuario. {ok:false, error} o {ok:true, resto} con
   lo que queda de la posición (0 = se vendió entera). moneda: la de
   monedaFactor(); null = todavía no se sabe en qué cotiza (no se registra). */
export function validarVenta(pos, cant, precio, fecha, hoy, moneda) {
  if (moneda === null) {
    return { ok: false, error: 'Todavía no sabemos en qué moneda cotiza este activo: esperá a que aparezca su precio para registrar la venta.' };
  }
  const disp = Number(pos && pos.cantidad) || 0;
  if (!(cant > 0)) return { ok: false, error: 'Poné cuántas vendiste.' };
  if (cant > disp + EPS * Math.max(1, disp)) {
    return { ok: false, error: `No podés vender más de lo que tiene esta posición (${disp.toLocaleString('es-AR')}).` };
  }
  if (!(precio > 0)) return { ok: false, error: 'Poné el precio al que vendiste.' };
  if (!ISO.test(String(fecha || ''))) return { ok: false, error: 'Poné la fecha de la venta.' };
  if (hoy && fecha > hoy) return { ok: false, error: 'La fecha de la venta no puede ser futura.' };
  // solo contra una fecha de compra real: "desde" es una cota del sync, no la compra
  const compra = dia(pos && pos.fecha);
  if (ISO.test(compra) && fecha < compra) {
    return { ok: false, error: `La venta no puede ser anterior a la compra (${compra.split('-').reverse().join('/')}).` };
  }
  let resto = disp - cant;
  if (Math.abs(resto) <= EPS * Math.max(1, disp)) resto = 0;
  return { ok: true, resto };
}

/* el documento de la venta, listo para Firestore */
export function armarVenta(pos, px, cant, precio, fecha, ahoraISO, esRF = false) {
  const { moneda, factor } = monedaFactor(pos, px, esRF);
  const foto = {};
  CAMPOS_POS.forEach(k => { if (pos[k] !== undefined && pos[k] !== null) foto[k] = pos[k]; });
  return {
    ticker: String(pos.ticker),
    cantidad: cant,
    precioVenta: precio,
    costoUnitario: Number(pos.precioCompra) > 0 ? Number(pos.precioCompra) : 0,
    fecha,
    // solo la fecha de compra REAL: el "desde" del sync queda en la foto y la
    // tenencia lo usa como mínimo, nunca como dato exacto
    fechaCompra: ISO.test(dia(pos.fecha)) ? dia(pos.fecha) : '',
    broker: String(pos.broker || ''),
    moneda,
    factor,
    origen: 'manual',
    posId: String(pos.id),
    pos: foto,
    creado: ahoraISO,
  };
}

/* cómo deshacer: si la posición sigue, se le suman las unidades; si se vendió
   entera (ya no existe), se la recrea desde la foto guardada en la venta */
export function planDeshacer(v, posActual) {
  if (posActual) return { tipo: 'sumar', cantidad: Number(v.cantidad) };
  const datos = { ...(v.pos || {}), cantidad: Number(v.cantidad) };
  if (!datos.ticker) datos.ticker = v.ticker;
  return { tipo: 'recrear', datos };
}

/* totales: por moneda (sin mezclar pesos con dólares) y convertidos con
   conv(valor, moneda) a la moneda que eligió el usuario. Si alguna no se pudo
   convertir (sin cotización), totalCompleto queda en false. Las ventas sin
   precio de compra no entran en ningún total y se cuentan en sinCosto, en el
   total y en el del año, para poder decirlo. anio: 'AAAA'. */
export function resumenVentas(ventas, conv, anio) {
  const nuevo = () => ({ n: 0, porMoneda: {}, total: 0, totalCompleto: true, sinCosto: 0 });
  const out = { ...nuevo(), delAnio: nuevo() };
  const sumar = (o, r, m) => {
    o.n++;
    o.porMoneda[m] = (o.porMoneda[m] || 0) + r;
    const c = conv ? conv(r, m) : null;
    if (c == null || !isFinite(c)) o.totalCompleto = false; else o.total += c;
  };
  (ventas || []).forEach(v => {
    const delAnio = !!anio && dia(v.fecha).slice(0, 4) === String(anio);
    const { resultado } = resultadoVenta(v);
    if (resultado == null) {
      out.sinCosto++;
      if (delAnio) out.delAnio.sinCosto++;
      return;
    }
    const m = v.moneda === 'ARS' ? 'ARS' : 'USD';
    sumar(out, resultado, m);
    if (delAnio) sumar(out.delAnio, resultado, m);
  });
  return out;
}
