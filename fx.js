// fx.js — el único lugar de la web que sabe cuánto vale el dólar.
//
// Antes: TRES fetch al mismo endpoint por carga (la barra, panel.js fx() y
// mi-cartera.js cargarFx()). Ahora dos: la barra por su lado, y este módulo
// compartido por el panel y Mi cartera.
//
// dolarapi lee DolarHoy y lo sirve como JSON: es el mismo número que muestra
// la barra de precios (verificado al centavo el 19/09/2026).
//
// Dos cosas que hace y las tres implementaciones viejas no hacían:
// 1) GUARDAS, las MISMAS que ccl_dolarapi() en fx_lib.py del pipeline: banda
//    FX_MIN<v<FX_MAX y antigüedad máxima 96 h. Un dato que no pasa devuelve
//    null, que es el camino que Mi cartera ya sabe mostrar. NUNCA se inventa
//    un valor por defecto.
// 2) PROCEDENCIA. Hay dos CCL legítimos conviviendo: el de dolarapi (barra,
//    Mi cartera) y el implícito en bonos (panel de bonos, mail de alertas).
//    Ninguno está mal: miden cosas distintas. Acá quedan separados y
//    etiquetados para que la UI pueda decir de dónde sale cada número.
//
// OJO para el que venga después: .ccl y .mep son números planos o null. Si
// alguien los "mejora" devolviendo {valor,fuente}, rompe calcular(),
// convertir() y los avisos SIN error de sintaxis: los totales salen mal.
// La procedencia va en .meta.

export const FX_MIN = 500;
export const FX_MAX = 20000;
// 96 h y no 24: un dato del viernes tiene que servir el lunes a la mañana.
// La que protege de verdad es la banda; la etiqueta "hace N h" deja ver la edad.
export const MAX_EDAD_H = 96;

const ENDPOINT = 'https://dolarapi.com/v1/dolares';
const TTL_MS = 5 * 60 * 1000;   // el mismo ritmo al que refresca la barra

const numf = x => {
  if (x === null || x === undefined || typeof x === 'boolean') return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
};
const fechaf = s => {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isFinite(d.getTime()) ? d : null;
};

function validar(item, casa, ahora, por) {
  if (!item || typeof item !== 'object') { por.push(`${casa}: no vino en la respuesta`); return null; }
  const venta = numf(item.venta);
  if (venta === null) { por.push(`${casa}: venta no es un número`); return null; }
  if (!(venta > FX_MIN && venta < FX_MAX)) { por.push(`${casa}: $${venta} fuera de la banda ${FX_MIN}-${FX_MAX}`); return null; }
  const f = fechaf(item.fechaActualizacion);
  if (!f) { por.push(`${casa}: sin fecha de actualización legible`); return null; }
  const edadH = (ahora - f.getTime()) / 3600000;
  if (edadH > MAX_EDAD_H) { por.push(`${casa}: el dato tiene ${Math.round(edadH)} h (máx. ${MAX_EDAD_H})`); return null; }
  return { valor: venta, fecha: f.toISOString(), edadH };
}

const vacio = motivo => ({
  ccl: null, mep: null, meta: { ccl: null, mep: null },
  fuente: 'dolarapi', ok: false, motivo, pedido: new Date().toISOString(), crudo: null,
});

let _promesa = null, _cuando = 0;

async function pedir() {
  let d;
  try {
    const r = await fetch(ENDPOINT);
    if (!r.ok) return vacio(`dolarapi respondió ${r.status}`);
    d = await r.json();
  } catch (e) { return vacio('no se pudo consultar dolarapi'); }
  if (!Array.isArray(d)) return vacio('dolarapi devolvió algo que no es una lista');
  const ahora = Date.now(), por = [];
  const de = casa => d.find(x => x && x.casa === casa) || null;
  const ccl = validar(de('contadoconliqui'), 'CCL', ahora, por);
  const mep = validar(de('bolsa'), 'MEP', ahora, por);
  return {
    ccl: ccl ? ccl.valor : null,
    mep: mep ? mep.valor : null,
    meta: {
      ccl: ccl ? { ...ccl, fuente: 'dolarapi contadoconliqui.venta' } : null,
      mep: mep ? { ...mep, fuente: 'dolarapi bolsa.venta' } : null,
    },
    fuente: 'dolarapi', ok: !!(ccl || mep),
    motivo: por.length ? por.join(' · ') : null,
    pedido: new Date(ahora).toISOString(),
    crudo: d,
  };
}

/** Tipo de cambio de mercado, con guardas. NUNCA rechaza: si algo falla
 *  devuelve el snapshot con ccl/mep en null y el motivo adentro. Una sola
 *  consulta compartida por todos los que la pidan, refrescada cada 5 min. */
export function fxMercado(opt = {}) {
  const vencido = Date.now() - _cuando > TTL_MS;
  if (!_promesa || opt.refrescar || vencido) {
    _cuando = Date.now();
    _promesa = pedir().catch(() => vacio('error inesperado al resolver el dólar'));
  }
  return _promesa;
}
export function olvidar() { _promesa = null; _cuando = 0; }

/* El OTRO CCL: el implícito en bonos que calcula bonos_sync (GD30/GD30C) y
   viaja en bonosPanel.variables. No se pide acá: lo registra quien ya leyó
   ese documento, así fx.js no arrastra Firestore. */
let _imp = { ccl: null, mep: null, meta: { ccl: null, mep: null }, fuente: 'bonos', ok: false, motivo: 'todavía no se leyó bonosPanel' };

export function registrarImplicito(variables, actualizado) {
  if (!variables || typeof variables !== 'object') return _imp;
  const marca = (v, etq) => {
    const n = numf(v);
    if (n === null || !(n > FX_MIN && n < FX_MAX)) return null;
    return { valor: n, fecha: actualizado || null, fuente: etq };
  };
  const c = marca(variables.ccl, 'implícito GD30/GD30C');
  const m = marca(variables.mep, 'implícito AL30/AL30D');
  _imp = { ccl: c ? c.valor : null, mep: m ? m.valor : null, meta: { ccl: c, mep: m },
           fuente: 'bonos', ok: !!(c || m), motivo: (c || m) ? null : 'bonosPanel sin ccl/mep válidos' };
  return _imp;
}
export function implicito() { return _imp; }

/* Pasar un importe de la moneda en que cotiza el activo a la moneda de la
   vista (ARS, CCL o MEP). Vivía en mi-cartera.js; está acá porque es tipo de
   cambio puro y así se puede probar en Node sin arrastrar Firebase. Por esta
   función pasa toda la plata que ve el usuario: sin dólar devuelve null,
   nunca inventa una tasa. */
export function convertir(valor, monedaOrigen, display, fx) {
  if (valor == null) return null;
  fx = fx || {};   // un snapshot ausente devuelve null, no un TypeError
  const tasa = display === "CCL" ? fx.ccl : display === "MEP" ? fx.mep : null;
  if (display === "ARS") {
    // para pasar dólares a pesos se usa el CCL, que es la referencia de equity
    return monedaOrigen === "ARS" ? valor : (fx.ccl ? valor * fx.ccl : null);
  }
  if (!tasa) return null;
  return monedaOrigen === "ARS" ? valor / tasa : valor;
}

/** "CCL $1.598 · dolarapi, hace 12 min". Sin dato devuelve "". */
export function etiquetaFx(snap, cual = 'ccl') {
  const s = snap || {}, v = s[cual], m = (s.meta || {})[cual];
  if (v == null || !m) return '';
  const plata = '$' + Number(v).toLocaleString('es-AR');
  const edad = typeof m.edadH === 'number'
    ? (m.edadH < 1 ? `hace ${Math.max(1, Math.round(m.edadH * 60))} min` : `hace ${Math.round(m.edadH)} h`) : '';
  const quien = s.fuente === 'bonos' ? 'implícito en bonos' : 'dolarapi';
  return `${cual.toUpperCase()} ${plata} · ${quien}${edad ? ', ' + edad : ''}`;
}
