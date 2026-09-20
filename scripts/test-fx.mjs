// node scripts/test-fx.mjs — el módulo del dólar nunca devuelve un número que
// no pasó las guardas, y nunca rompe: ante cualquier falla, null con motivo.
import { fxMercado, olvidar, registrarImplicito, etiquetaFx, convertir, FX_MIN, FX_MAX } from '../fx.js?v=1';

const ahora = new Date().toISOString();
const hace = h => new Date(Date.now() - h * 3600e3).toISOString();
const respuesta = lista => async () => ({ ok: true, json: async () => lista });
const item = (casa, venta, fecha = ahora) => ({ casa, venta, fechaActualizacion: fecha });

let mal = 0, n = 0;
const check = (nombre, ok, extra = '') => { n++; if (!ok) { mal++; console.log(`FALLA ${nombre}${extra ? ' -> ' + extra : ''}`); } };

// ── 1. respuesta sana ──
globalThis.fetch = respuesta([item('contadoconliqui', 1598.1), item('bolsa', 1540.1)]);
olvidar();
let s = await fxMercado();
check('ccl y mep con dato sano', s.ccl === 1598.1 && s.mep === 1540.1 && s.ok, JSON.stringify([s.ccl, s.mep]));
check('procedencia en meta, no en el número', typeof s.ccl === 'number' && s.meta.ccl.fuente === 'dolarapi contadoconliqui.venta');
check('etiqueta con fuente y edad', /^CCL \$1\.598,1 · dolarapi, hace \d+ min$/.test(etiquetaFx(s, 'ccl')), etiquetaFx(s, 'ccl'));

// ── 2. una sola consulta compartida ──
let llamadas = 0;
globalThis.fetch = async () => { llamadas++; return { ok: true, json: async () => [item('contadoconliqui', 1600)] }; };
olvidar();
await Promise.all([fxMercado(), fxMercado(), fxMercado()]);
check('tres pedidos simultáneos, un solo fetch', llamadas === 1, `fetch se llamó ${llamadas} veces`);

// ── 3. fuera de banda: por arriba y por abajo ──
for (const [v, etq] of [[95000, 'por arriba'], [3, 'por abajo'], [FX_MAX, 'justo en el tope'], [FX_MIN, 'justo en el piso']]) {
  globalThis.fetch = respuesta([item('contadoconliqui', v), item('bolsa', 1540)]);
  olvidar(); s = await fxMercado();
  check(`CCL $${v} ${etq} da null`, s.ccl === null && /banda/.test(s.motivo || ''), JSON.stringify([s.ccl, s.motivo]));
  check(`… y el MEP sano sigue vivo (${etq})`, s.mep === 1540);
}

// ── 4. dato viejo, fecha ilegible, venta no numérica ──
globalThis.fetch = respuesta([item('contadoconliqui', 1598, hace(200))]);
olvidar(); s = await fxMercado();
check('dato de hace 200 h da null', s.ccl === null && /200 h/.test(s.motivo || ''), s.motivo);
globalThis.fetch = respuesta([item('contadoconliqui', 1598, 'ayer nomás')]);
olvidar(); s = await fxMercado();
check('fecha ilegible da null', s.ccl === null && /fecha/.test(s.motivo || ''), s.motivo);
globalThis.fetch = respuesta([item('contadoconliqui', 'mil quinientos'), item('bolsa', true)]);
olvidar(); s = await fxMercado();
check('venta que no es número da null (y true tampoco cuenta)', s.ccl === null && s.mep === null);

// ── 5. la respuesta no es lista, la red se cae, HTTP 500 ──
globalThis.fetch = respuesta({ casa: 'contadoconliqui', venta: 1598 });
olvidar(); s = await fxMercado();
check('respuesta que no es lista', s.ccl === null && /lista/.test(s.motivo || ''), s.motivo);
globalThis.fetch = async () => { throw new Error('sin red'); };
olvidar(); s = await fxMercado();
check('caída de red no rompe', s.ccl === null && s.ok === false && /consultar/.test(s.motivo || ''), s.motivo);
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
olvidar(); s = await fxMercado();
check('HTTP 500 no rompe', s.ccl === null && /500/.test(s.motivo || ''), s.motivo);

// ── 6. el implícito en bonos: otra fuente, misma banda, nunca se mezcla ──
let imp = registrarImplicito({ ccl: 1589.56, mep: 1538.32 }, '2026-09-19T21:02:10Z');
check('implícito registrado con su nombre', imp.ccl === 1589.56 && imp.fuente === 'bonos' && /GD30/.test(imp.meta.ccl.fuente));
check('etiqueta del implícito dice de dónde viene', /implícito en bonos/.test(etiquetaFx(imp, 'ccl')), etiquetaFx(imp, 'ccl'));
imp = registrarImplicito({ ccl: 12, mep: null });
check('implícito fuera de banda da null', imp.ccl === null && imp.ok === false);
check('registrar basura no explota', registrarImplicito(null).fuente === 'bonos');

// ── 7. convertir(): por acá pasa toda la plata que ve el usuario ──
const fx = { ccl: 1600, mep: 1500 };
check('ARS -> CCL', convertir(160000, 'ARS', 'CCL', fx) === 100);
check('ARS -> MEP', convertir(150000, 'ARS', 'MEP', fx) === 100);
check('USD -> ARS usa el CCL', convertir(1, 'USD', 'ARS', fx) === 1600);
check('USD en vista CCL queda igual', convertir(7, 'USD', 'CCL', fx) === 7);
check('ARS en vista ARS queda igual', convertir(7, 'ARS', 'ARS', fx) === 7);
check('sin dólar no se inventa: null', convertir(1000, 'ARS', 'CCL', { ccl: null, mep: null }) === null);
check('snapshot ausente no revienta', convertir(1000, 'ARS', 'CCL', undefined) === null && convertir(5, 'ARS', 'ARS', null) === 5);
check('valor null sigue siendo null', convertir(null, 'ARS', 'CCL', fx) === null);

console.log(mal ? `${mal} fallas de ${n}` : `OK ${n} casos`);
process.exit(mal ? 1 : 0);
