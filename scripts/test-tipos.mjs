// node scripts/test-tipos.mjs — verifica que tipos-activo.js diga el mismo tipo para
// cada activo (es lo que comparten Mi cartera, el Resumen y Movimientos)
import * as T from '../tipos-activo.js';

let mal = 0, n = 0;
function ok(nombre, cond, detalle) {
  n++;
  if (!cond) { mal++; console.log(`FALLA ${nombre}: ${JSON.stringify(detalle)}`); }
}
const es = (r, k, mercado) => r && r.k === k && r.mercado === mercado;

const bonos = new Set(['AL30', 'AL30D', 'GD35', 'S30O6', 'T15D5', 'TX26', 'BPA7D']);
const panel = { tasa_fija: [{ s: 'S30O6', vence: '2026-10-30', tem: 2.5 }, { s: 'X18D6', vence: '2026-12-18' }] };

// ── BYMA ──
let r = T.tipoActivo('GGAL.BA');
ok('GGAL.BA: accion argentina en BYMA', es(r, 'accion', 'byma') && r.n === 'Acción' && r.grupo === 'Acciones' && r.sub === 'Acción · BYMA', r);
ok('PAMP.BA: la argentina por su simbolo local tambien', es(T.tipoActivo('PAMP.BA'), 'accion', 'byma'), T.tipoActivo('PAMP.BA'));
r = T.tipoActivo('NVDA.BA');
ok('NVDA.BA: CEDEAR (empresa de EE.UU. con ficha)', es(r, 'cedear', 'byma') && r.n === 'CEDEAR' && r.grupo === 'CEDEARs' && r.sub === 'CEDEAR · BYMA', r);
ok('nvda.ba en minuscula: lo mismo', es(T.tipoActivo(' nvda.ba '), 'cedear', 'byma'), T.tipoActivo(' nvda.ba '));
r = T.tipoActivo('XXXX.BA');
ok('.BA sin ficha ni catalogo: "otro", no se afirma CEDEAR', es(r, 'otro', 'byma') && r.n === 'BYMA' && r.grupo === 'Otros' && r.sub === 'BYMA', r);

// ── el catalogo opcional resuelve lo que la ficha no sabe ──
const catalogo = sym => ({ XXXX: { s: 'XXXX', t: 'cedear', m: 'byma' }, LOMA: { s: 'LOMA', t: 'accion_ar', m: 'byma' },
                           'VTI': { s: 'VTI', t: 'etf', m: 'ext' } })[sym] || null;
ok('catalogo: XXXX.BA como cedear', es(T.tipoActivo('XXXX.BA', { catalogo }), 'cedear', 'byma'), T.tipoActivo('XXXX.BA', { catalogo }));
ok('catalogo: LOMA.BA como accion argentina', es(T.tipoActivo('LOMA.BA', { catalogo }), 'accion', 'byma'), T.tipoActivo('LOMA.BA', { catalogo }));
ok('catalogo: VTI (exterior) como ETF', es(T.tipoActivo('VTI', { catalogo }), 'etf', 'ext'), T.tipoActivo('VTI', { catalogo }));
ok('catalogo que no conoce el simbolo: sigue siendo "otro"', es(T.tipoActivo('YYYY.BA', { catalogo }), 'otro', 'byma'), T.tipoActivo('YYYY.BA', { catalogo }));
ok('la ficha le gana al catalogo (GGAL.BA con catalogo cedear sigue siendo accion)',
   es(T.tipoActivo('GGAL.BA', { catalogo: () => ({ t: 'cedear' }) }), 'accion', 'byma'));

// ── renta fija ──
r = T.tipoActivo('AL30', { bonos });
ok('AL30: bono', es(r, 'bono', 'rf') && r.n === 'Bono' && r.grupo === 'Bonos' && r.sub === 'Bono · BYMA · por 100 VN', r);
ok('AL30D.BA (cargado eligiendo BYMA): bono igual', es(T.tipoActivo('AL30D.BA', { bonos }), 'bono', 'rf'), T.tipoActivo('AL30D.BA', { bonos }));
ok('AL30 sin panel de bonos (regex de respaldo): bono', es(T.tipoActivo('AL30'), 'bono', 'rf'), T.tipoActivo('AL30'));
r = T.tipoActivo('S30O6', { bonos, panel });
ok('S30O6 con panel: letra', es(r, 'letra', 'rf') && r.n === 'Letra' && r.grupo === 'Letras' && r.sub === 'Letra · BYMA · por 100 VN', r);
ok('S30O6 sin panel: letra por la forma del nombre', es(T.tipoActivo('S30O6'), 'letra', 'rf'), T.tipoActivo('S30O6'));
ok('X18D6 (Lecer) sin panel: letra', es(T.tipoActivo('X18D6'), 'letra', 'rf'), T.tipoActivo('X18D6'));
ok('T15D5 (Boncap): bono, no letra', es(T.tipoActivo('T15D5', { bonos }), 'bono', 'rf'), T.tipoActivo('T15D5', { bonos }));
ok('TX26 (CER) con panel: bono', es(T.tipoActivo('TX26', { bonos, panel }), 'bono', 'rf'), T.tipoActivo('TX26', { bonos, panel }));
ok('BPA7D (Bopreal): bono', es(T.tipoActivo('BPA7D', { bonos }), 'bono', 'rf'), T.tipoActivo('BPA7D', { bonos }));

// ── cripto ──
r = T.tipoActivo('BTC-USD');
ok('BTC-USD: cripto', es(r, 'cripto', 'cripto') && r.n === 'Cripto' && r.grupo === 'Cripto' && r.sub === 'Cripto · US$', r);
ok('ETH a secas: cripto', es(T.tipoActivo('ETH'), 'cripto', 'cripto'), T.tipoActivo('ETH'));

// ── exterior ──
r = T.tipoActivo('SPY');
ok('SPY: ETF del exterior', es(r, 'etf', 'ext') && r.n === 'ETF' && r.grupo === 'ETFs' && r.sub === 'ETF · NYSE/Nasdaq · US$', r);
r = T.tipoActivo('AAPL');
ok('AAPL: accion del exterior', es(r, 'accion', 'ext') && r.n === 'Acción' && r.grupo === 'Acciones' && r.sub === 'Acción · NYSE/Nasdaq · US$', r);
ok('GGAL (el ADR, sin .BA): accion del exterior', es(T.tipoActivo('GGAL'), 'accion', 'ext'), T.tipoActivo('GGAL'));
ok('ZZZZ sin ficha: accion del exterior', es(T.tipoActivo('ZZZZ'), 'accion', 'ext'), T.tipoActivo('ZZZZ'));

// ── casos adversarios ──
ok('ggal.ba en minuscula y con espacios: accion argentina', es(T.tipoActivo('  ggal.ba '), 'accion', 'byma') && T.tipoActivo('ggal.ba').n === 'Acción', T.tipoActivo('ggal.ba'));
ok('AL30D (sufijo D, sin panel ni bonos): bono por la regex', es(T.tipoActivo('AL30D'), 'bono', 'rf'), T.tipoActivo('AL30D'));
ok('GD35D.BA con un bonos que solo tiene GD35: bono igual', es(T.tipoActivo('GD35D.BA', { bonos: new Set(['GD35']) }), 'bono', 'rf'),
   T.tipoActivo('GD35D.BA', { bonos: new Set(['GD35']) }));
ok('BPY26D (Bopreal con D): bono', es(T.tipoActivo('BPY26D'), 'bono', 'rf'), T.tipoActivo('BPY26D'));
// la sección tasa_fija del panel real mezcla Lecap con Boncap ("Letra / Boncap", bono.html)
const panelConBoncap = { tasa_fija: [{ s: 'S30O6', vence: '2026-10-30' }, { s: 'T15D5', vence: '2026-12-15' }] };
ok('T15D5 listado en tasa_fija del panel: sigue siendo bono (Boncap)', es(T.tipoActivo('T15D5', { bonos, panel: panelConBoncap }), 'bono', 'rf'),
   T.tipoActivo('T15D5', { bonos, panel: panelConBoncap }));
ok('S30O6 con ese mismo panel: letra', es(T.tipoActivo('S30O6', { bonos, panel: panelConBoncap }), 'letra', 'rf'));
ok('panel con s en minuscula o con espacios: se normaliza', es(T.tipoActivo('S30O6', { bonos, panel: { tasa_fija: [{ s: ' s30o6 ' }] } }), 'letra', 'rf'));
ok('panel.tasa_fija que no es un arreglo: no explota, y AL30 sigue bono', es(T.tipoActivo('AL30', { bonos, panel: { tasa_fija: {} } }), 'bono', 'rf'));
ok('catalogo que dice cripto (SOL sin -USD): cripto', es(T.tipoActivo('SOL', { catalogo: s => s === 'SOL' ? { s: 'SOL', t: 'cripto', m: 'cripto' } : null }), 'cripto', 'cripto'));
ok('SOL-USD (como lo guarda Mi cartera): cripto sin catalogo', es(T.tipoActivo('SOL-USD'), 'cripto', 'cripto'));

// ── forma del resultado y constantes ──
ok('cada resultado es una copia (mutarlo no contamina al siguiente)',
   (() => { const a = T.tipoActivo('SPY'); a.n = 'roto'; return T.tipoActivo('SPY').n === 'ETF'; })());
ok('ticker vacio / null / undefined / espacios: "otro" sin mercado, nunca "accion del exterior"',
   ['', null, undefined, '   '].every(v => { const r = T.tipoActivo(v); return r && r.k === 'otro' && r.mercado === '' && r.sub === '' && r.n !== 'BYMA'; }),
   T.tipoActivo(''));
ok('iniciales con vacio: cadena vacia, no explota', T.iniciales('') === '' && T.iniciales(null) === '');
ok('todo k de tipoActivo esta en GRUPOS_TIPO y en CLASE_TIPO',
   ['GGAL.BA', 'NVDA.BA', 'XXXX.BA', 'AL30', 'S30O6', 'BTC-USD', 'SPY', 'AAPL'].every(t => {
     const k = T.tipoActivo(t).k;
     return T.GRUPOS_TIPO.some(g => g[0] === k) && k in T.CLASE_TIPO;
   }));
ok('el grupo del resultado es el titulo de GRUPOS_TIPO',
   ['GGAL.BA', 'NVDA.BA', 'XXXX.BA', 'AL30', 'S30O6', 'BTC-USD', 'SPY'].every(t => {
     const r = T.tipoActivo(t);
     return (T.GRUPOS_TIPO.find(g => g[0] === r.k) || [])[1] === r.grupo;
   }));
ok('CLASE_TIPO: rv / rf / cripto', T.CLASE_TIPO.cedear === 'rv' && T.CLASE_TIPO.bono === 'rf' && T.CLASE_TIPO.letra === 'rf' && T.CLASE_TIPO.cripto === 'cripto' && T.CLASE_TIPO.otro === 'rv');
ok('RX_LETRA: S30O6 y X18D6 si, T15D5 y AL30 no', T.RX_LETRA.test('S30O6') && T.RX_LETRA.test('X18D6') && !T.RX_LETRA.test('T15D5') && !T.RX_LETRA.test('AL30'));
ok('iniciales: GGAL.BA -> GGAL, BTC-USD -> BTC, GOOGL -> GOOG', T.iniciales('GGAL.BA') === 'GGAL' && T.iniciales('BTC-USD') === 'BTC' && T.iniciales('GOOGL') === 'GOOG');

console.log(mal ? `${mal} fallas de ${n}` : `OK ${n} casos`);
process.exit(mal ? 1 : 0);
