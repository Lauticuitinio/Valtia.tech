// node scripts/test-movimientos.mjs — la pestaña Movimientos del panel: cómo arma
// las filas (compras reconstruidas, ventas con su resultado, avisos del sync), los
// filtros, el orden, las cifras de arriba y el CSV. panel-movimientos.js no importa
// Firebase: las funciones puras se prueban directo, sin tocar Firestore.
import * as M from '../panel-movimientos.js';

let mal = 0, n = 0;
function ok(nombre, cond, detalle) {
  n++;
  if (!cond) { mal++; console.log(`FALLA ${nombre}: ${JSON.stringify(detalle)}`); }
}
const cerca = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
const de = (filas, tipo, tk) => filas.find(x => x.tipo === tipo && (!tk || x.ticker === tk));

// ── una cartera de ejemplo ──
const pos = [
  // compra en BYMA, en pesos; después se vendieron 40 (quedan 60)
  { id: 'GGAL.BA-a1', ticker: 'GGAL.BA', cantidad: 60, precioCompra: 4000, fecha: '2026-03-10', broker: 'PPI', moneda: 'ARS', factor: 1, creado: '2026-03-10T15:00:00Z' },
  // CEDEAR sin moneda guardada: la dice precios/{tk}
  { id: 'NVDA.BA-a2', ticker: 'NVDA.BA', cantidad: 10, precioCompra: 12300, fecha: '2026-09-24', broker: 'IOL', creado: '2026-09-24T14:00:00Z' },
  // bono: cotiza cada 100 VN (factor 0,01)
  { id: 'AL30-a3', ticker: 'AL30', cantidad: 1000, precioCompra: 85000, fecha: '2026-05-02', broker: 'Balanz', moneda: 'ARS', factor: 0.01 },
  // del sync de IOL, sin fecha de compra: solo "desde"; el sync le bajó de 96 a 56
  { id: 'MELI-s1', ticker: 'MELI', cantidad: 56, precioCompra: 1500, desde: '2026-01-15', broker: 'IOL', moneda: 'USD', factor: 1, origen: 'sync-iol' },
  // sin precio de compra y sin fecha
  { id: 'KO-a5', ticker: 'KO', cantidad: 3, precioCompra: 0, broker: '' },
  // ticker sin sufijo y sin precio todavía: la moneda es supuesta
  { id: 'XYZQ-a6', ticker: 'XYZQ', cantidad: 2, precioCompra: 10, fecha: '2026-09-20', broker: 'Otro' },
];
const precios = { 'NVDA.BA': { precio: 13100, moneda: 'ARS', nombre: 'Nvidia Corporation' }, KO: { precio: 70, moneda: 'USD' } };
const ventas = [
  // venta parcial de GGAL (la posición sigue)
  { id: 'v1', ticker: 'GGAL.BA', cantidad: 40, precioVenta: 5000, costoUnitario: 4000, fecha: '2026-08-01', broker: 'PPI', moneda: 'ARS', factor: 1, origen: 'manual', posId: 'GGAL.BA-a1', creado: '2026-08-01T15:00:00Z' },
  // BTC vendido entero en dos veces: la posición ya no existe
  { id: 'v2', ticker: 'BTC-USD', cantidad: 0.1, precioVenta: 60000, costoUnitario: 50000, fecha: '2026-06-01', broker: 'Binance', moneda: 'USD', factor: 1, origen: 'manual', posId: 'BTC-USD-a9',
    pos: { ticker: 'BTC-USD', cantidad: 0.3, precioCompra: 50000, fecha: '2026-02-01', broker: 'Binance', moneda: 'USD', factor: 1 } },
  { id: 'v3', ticker: 'BTC-USD', cantidad: 0.2, precioVenta: 45000, costoUnitario: 50000, fecha: '2026-07-01', broker: 'Binance', moneda: 'USD', factor: 1, origen: 'manual', posId: 'BTC-USD-a9',
    pos: { ticker: 'BTC-USD', cantidad: 0.2, precioCompra: 50000, fecha: '2026-02-01', broker: 'Binance', moneda: 'USD', factor: 1 } },
  // venta sin precio de compra (costo 0): sin resultado
  { id: 'v4', ticker: 'KO', cantidad: 1, precioVenta: 72, costoUnitario: 0, fecha: '2026-09-01', broker: '', moneda: 'USD', factor: 1, origen: 'manual', posId: 'KO-a5' },
];
const ajustes = [
  { id: 'aj1', tipo: 'bajo', ticker: 'MELI', posId: 'MELI-s1', broker: 'IOL', cantidadAntes: 96, cantidadBroker: 56, fecha: '2026-09-25', estado: 'pendiente', pos: { ticker: 'MELI', cantidad: 96, precioCompra: 1500, broker: 'IOL', moneda: 'USD' } },
  // la posición desapareció del broker: no está en la cartera
  { id: 'aj2', tipo: 'desaparecio', ticker: 'YPFD.BA', posId: 'YPFD.BA-s2', broker: 'IOL', cantidadAntes: 20, cantidadBroker: 0, fecha: '2026-09-22', estado: 'pendiente',
    pos: { ticker: 'YPFD.BA', cantidad: 20, precioCompra: 30000, fecha: '2025-12-01', broker: 'IOL', moneda: 'ARS', factor: 1, origen: 'sync-iol' } },
  // un aviso ya respondido (si el sync alguna vez los deja): no se lista
  { id: 'aj3', tipo: 'bajo', ticker: 'GGAL.BA', posId: 'GGAL.BA-a1', broker: 'PPI', cantidadAntes: 10, cantidadBroker: 5, fecha: '2026-09-01', estado: 'respondido', pos: {} },
];
const bonos = new Set(['AL30', 'AL30D']);
const F = M.armarMovimientos({ pos, precios, ventas, ajustes, bonos });

// ── compras ──
let c = de(F, 'compra', 'GGAL.BA');
ok('GGAL: la compra muestra lo comprado (60 que quedan + 40 vendidas)', c && c.cant === 100 && c.precio === 4000 && c.total === 400000 && c.moneda === 'ARS', c);
ok('GGAL: acción argentina, sigue en la cartera, cargada a mano', c && c.tipoAct.k === 'accion' && c.tiene === true && c.origen === 'manual' && c.f === '2026-03-10' && !c.aprox, c);
ok('GGAL: el aviso ya respondido no suma a la cantidad', c && c.cant === 100, c);
c = de(F, 'compra', 'NVDA.BA');
ok('NVDA.BA: moneda del precio (ARS), CEDEAR, nombre del sync', c && c.moneda === 'ARS' && c.tipoAct.k === 'cedear' && c.nombre === 'Nvidia Corporation' && c.total === 123000, c);
c = de(F, 'compra', 'AL30');
ok('AL30: bono cada 100 VN (total = 1000 × 85.000 × 0,01)', c && c.factor === 0.01 && cerca(c.total, 850000) && c.tipoAct.k === 'bono' && c.moneda === 'ARS', c);
c = de(F, 'compra', 'MELI');
ok('MELI del sync: 56 que quedan + 40 del aviso sin responder = 96', c && c.cant === 96 && c.origen === 'sync', c);
ok('MELI sin fecha real: la de "desde", marcada aproximada', c && c.f === '2026-01-15' && c.aprox === true && /aproximada/.test(c.detalle), c);
c = de(F, 'compra', 'KO');
ok('KO sin precio de compra: sin total y dicho', c && c.precio === null && c.total === null && /sin precio de compra/.test(c.detalle), c);
ok('KO sin fecha: fecha vacía (no se inventa con "creado")', c && c.f === '' && c.aprox === false, c);
ok('KO: la venta sin costo suma a lo comprado (3 + 1)', c && c.cant === 4, c);
c = de(F, 'compra', 'XYZQ');
ok('XYZQ sin moneda en ningún lado: la supuesta (USD), marcada', c && c.moneda === 'USD' && c.monedaSupuesta === true && /moneda supuesta/.test(c.detalle), c);

// ── compras de posiciones que ya no están ──
const btc = F.filter(x => x.tipo === 'compra' && x.ticker === 'BTC-USD');
ok('BTC vendido entero: UNA compra desde la foto de la venta', btc.length === 1, btc);
ok('BTC: cantidad comprada = 0,1 + 0,2 (sin ruido de coma flotante)', btc[0] && btc[0].cant === 0.3 && btc[0].tiene === false && /ya no está/.test(btc[0].detalle), btc[0]);
ok('BTC: precio, fecha y broker de la foto', btc[0] && btc[0].precio === 50000 && btc[0].f === '2026-02-01' && btc[0].broker === 'Binance' && btc[0].moneda === 'USD', btc[0]);
c = de(F, 'compra', 'YPFD.BA');
ok('YPFD desaparecida del broker: compra desde la foto del aviso, 20 unidades', c && c.cant === 20 && c.precio === 30000 && c.origen === 'sync' && c.tiene === false, c);

// ── ventas ──
let v = F.find(x => x.id === 'v-v1');
ok('venta GGAL: 40 a $5.000, resultado +$40.000 (+25%)', v && v.tipo === 'venta' && v.total === 200000 && v.resultado === 40000 && cerca(v.pct, 25) && v.moneda === 'ARS', v);
ok('venta GGAL: la posición sigue en la cartera', v && v.tiene === true, v);
v = F.find(x => x.id === 'v-v3');
ok('venta BTC con pérdida: 0,2 × (45.000 − 50.000) = −1.000', v && cerca(v.resultado, -1000) && v.tiene === false, v);
v = F.find(x => x.id === 'v-v4');
ok('venta sin costo: sin resultado y dicho', v && v.resultado === null && v.pct === null && /sin precio de compra/.test(v.detalle), v);

// ── avisos ──
let a = F.find(x => x.id === 'a-aj1');
ok('aviso "bajó": cantidad 40 y el texto del sync', a && a.tipo === 'aviso' && a.cant === 40 && a.detalle === 'bajó en IOL de 96 a 56' && a.total === null && a.moneda === null, a);
a = F.find(x => x.id === 'a-aj2');
ok('aviso "desapareció": 20 y el texto', a && a.cant === 20 && /ya no aparece en IOL \(tenías 20\)/.test(a.detalle), a);
ok('aviso respondido: no se lista', !F.some(x => x.id === 'a-aj3'), F.map(x => x.id));
ok('total de filas: 6 compras + 2 fantasma + 4 ventas + 2 avisos', F.length === 14, F.map(x => x.id));

// ── filtros ──
ok('filtro tipo venta', M.filtrar(F, { tipo: 'venta' }).length === 4);
ok('filtro broker IOL', M.filtrar(F, { broker: 'IOL' }).every(x => x.broker === 'IOL') && M.filtrar(F, { broker: 'IOL' }).length === 5,
   M.filtrar(F, { broker: 'IOL' }).map(x => x.id));
ok('filtro "sin broker"', M.filtrar(F, { broker: M.SIN_BROKER }).map(x => x.id).sort().join() === 'c-KO-a5,v-v4', M.filtrar(F, { broker: M.SIN_BROKER }).map(x => x.id));
const conGuion = [{ ...F[0], broker: '-' }, { ...F[1], broker: '' }];
ok('un broker que se llama "-" no es "sin broker"', M.filtrar(conGuion, { broker: '-' }).length === 1 && M.filtrar(conGuion, { broker: '-' })[0].broker === '-'
   && M.filtrar(conGuion, { broker: M.SIN_BROKER }).length === 1 && M.filtrar(conGuion, { broker: M.SIN_BROKER })[0].broker === '', conGuion.map(x => x.broker));
ok('filtro año 2025', M.filtrar(F, { anio: '2025' }).map(x => x.id).join() === 'c-YPFD.BA-s2', M.filtrar(F, { anio: '2025' }).map(x => x.id));
ok('búsqueda sin importar mayúsculas: "ggal"', M.filtrar(F, { q: 'ggal' }).length === 2, M.filtrar(F, { q: 'ggal' }).map(x => x.id));
ok('búsqueda por nombre del sync: "NVIDIA"', M.filtrar(F, { q: 'NVIDIA' }).length === 1);
ok('búsqueda por broker: "balanz"', M.filtrar(F, { q: 'balanz' }).map(x => x.ticker).join() === 'AL30');
ok('búsqueda por tipo de activo sin tildes: "accion"', M.filtrar(F, { q: 'accion' }).some(x => x.ticker === 'GGAL.BA'));
ok('filtros combinados: IOL + aviso', M.filtrar(F, { broker: 'IOL', tipo: 'aviso' }).length === 2);

// ── orden ──
const ids = l => l.map(x => x.id);
let o = M.ordenar(F, { col: 'fecha', dir: 'desc' });
ok('fecha desc: lo más nuevo primero', o[0].id === 'a-aj1' && o[1].id === 'c-NVDA.BA-a2', ids(o).slice(0, 3));
ok('fecha desc: sin fecha al final', o[o.length - 1].id === 'c-KO-a5', ids(o).slice(-2));
o = M.ordenar(F, { col: 'fecha', dir: 'asc' });
ok('fecha asc: lo más viejo primero y sin fecha igual al final', o[0].id === 'c-YPFD.BA-s2' && o[o.length - 1].id === 'c-KO-a5', ids(o));
o = M.ordenar(F, { col: 'activo', dir: 'asc' });
ok('activo asc: AL30 primero, y dentro del mismo activo lo más nuevo primero', o[0].ticker === 'AL30' && (() => {
  const g = o.filter(x => x.ticker === 'GGAL.BA'); return g[0].id === 'v-v1' && g[1].id === 'c-GGAL.BA-a1'; })(), ids(o));
o = M.ordenar(F, { col: 'total', dir: 'desc' });
const conTot = o.filter(x => x.total != null);
ok('total: pesos primero, después dólares, y los sin total al final',
   conTot.every((x, i) => i === 0 || !(x.moneda === 'ARS' && conTot[i - 1].moneda === 'USD')) && o.slice(-conTot.length ? -(o.length - conTot.length) : 0).every(x => x.total == null),
   o.map(x => [x.id, x.moneda, x.total]));
ok('total desc en pesos: AL30 (850.000) primero', conTot[0].id === 'c-AL30-a3', conTot[0]);
o = M.ordenar(F, { col: 'resultado', dir: 'asc' });
ok('resultado asc: con resultado primero, sin resultado al final', o[0].resultado != null && o[o.length - 1].resultado == null && o.filter(x => x.resultado != null).length === 3, o.map(x => [x.id, x.resultado]));
ok('ordenar no toca el arreglo original', F[0].id === 'c-GGAL.BA-a1');
ok('columna desconocida: por fecha', M.ordenar(F, { col: 'zzz', dir: 'desc' })[0].id === 'a-aj1');

// ── las cifras de arriba ──
const r = M.resumen(F);
ok('resumen: 8 compras, 4 ventas, 2 avisos', r.compras === 8 && r.ventas === 4 && r.avisos === 2, r);
ok('resumen: resultado por moneda sin mezclar (ARS +40.000; USD +1.000 − 1.000 = 0)', r.resultado.ARS === 40000 && cerca(r.resultado.USD, 0), r.resultado);
ok('resumen: 1 venta sin costo, fuera de la cuenta', r.sinCosto === 1, r);
ok('resumen: la compra más vieja', r.desde === '2025-12-01', r.desde);
ok('resumen: lo cobrado en dólares (6.000 + 9.000 + 72)', cerca(r.cobrado.USD, 15072), r.cobrado);

// ── opciones de los selectores ──
const op = M.opciones(F);
ok('opciones: brokers ordenados, sin vacío, y "sin broker" disponible', op.brokers.join() === 'Balanz,Binance,IOL,Otro,PPI' && op.sinBroker === true, op);
ok('opciones: años de más nuevo a más viejo', op.anios.join() === '2026,2025', op.anios);

// ── CSV ──
const csv = M.csvDe(M.ordenar(F, { col: 'fecha', dir: 'desc' }));
const lineas = csv.replace(/^﻿/, '').split('\r\n');
ok('CSV: empieza con BOM (Excel lee los acentos)', csv.charCodeAt(0) === 0xFEFF);
ok('CSV: fin de línea de Windows y una línea por fila + encabezado', lineas.length === F.length + 2 && lineas[lineas.length - 1] === '', lineas.length);
ok('CSV: encabezado con punto y coma', lineas[0] === M.COLS_CSV.join(';') && lineas[0].split(';').length === 14, lineas[0]);
ok('CSV: todas las filas con 14 columnas', lineas.slice(1, -1).every(l => l.split(';').length === 14), lineas.slice(1, -1).map(l => l.split(';').length));
const lGgal = lineas.find(l => l.includes('"Venta"') && l.includes('"GGAL.BA"'));
ok('CSV: fecha dd/mm/aaaa, números con coma decimal y sin miles', lGgal && lGgal.startsWith('01/08/2026;') && lGgal.includes(';40;5000;"ARS";1;200000;40000;'), lGgal);
const lAl30 = lineas.find(l => l.includes('"AL30"'));
ok('CSV: el factor del bono con coma (0,01)', lAl30 && lAl30.includes(';0,01;'), lAl30);
const lBtc = lineas.find(l => l.includes('"BTC-USD"') && l.includes('"Compra"'));
ok('CSV: cantidades chicas de cripto sin notación rara (0,3)', lBtc && lBtc.includes(';0,3;50000;'), lBtc);
const lKo = lineas.find(l => l.includes('"KO"') && l.includes('"Compra"'));
ok('CSV: sin fecha y sin precio quedan vacíos', lKo && lKo.startsWith(';') && lKo.includes(';4;;"USD";1;;;'), lKo);
ok('CSV: resultado negativo con signo menos común', lineas.some(l => l.includes('"BTC-USD"') && l.includes(';-1000;')), lineas.filter(l => l.includes('BTC')));
// texto con comillas, separadores y fórmulas
const raro = M.armarMovimientos({ pos: [{ id: 'r1', ticker: 'AAPL', cantidad: 1, precioCompra: 200, fecha: '2026-01-02', broker: '=HYPERLINK("x";"y")', moneda: 'USD' }] });
const lr = M.csvDe(raro).replace(/^﻿/, '').split('\r\n')[1];
ok('CSV: un broker que empieza con = no se ejecuta como fórmula y las comillas se duplican', lr.includes(`"'=HYPERLINK(""x"";""y"")"`), lr);
ok('CSV: un ; adentro de un texto no parte la columna', lr.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/).length === 14, lr);
ok('CSV: sin filas, solo el encabezado', M.csvDe([]) === '﻿' + M.COLS_CSV.join(';') + '\r\n');

// ── números y plata ──
ok('numCsv: 0,1 + 0,2 = 0,3', M.numCsv(0.1 + 0.2) === '0,3', M.numCsv(0.1 + 0.2));
ok('numCsv: −0 es 0 y lo ínfimo también', M.numCsv(-0) === '0' && M.numCsv(1e-10) === '0', [M.numCsv(-0), M.numCsv(1e-10)]);
ok('numCsv: null, vacío y NaN quedan vacíos', M.numCsv(null) === '' && M.numCsv('') === '' && M.numCsv(NaN) === '' && M.numCsv(undefined) === '');
ok('numCsv: 1234,5 sin separador de miles', M.numCsv(1234.5) === '1234,5' && M.numCsv(-12.25) === '-12,25');
ok('fechaCsv: ISO a dd/mm/aaaa; basura, vacío', M.fechaCsv('2026-09-26') === '26/09/2026' && M.fechaCsv('26/09') === '' && M.fechaCsv(null) === '');
ok('plata: pesos con miles', M.plata(1234567, 'ARS') === '$1.234.567', M.plata(1234567, 'ARS'));
ok('plata: dólares negativos con el menos tipográfico', M.plata(-12.5, 'USD') === '−US$12,5', M.plata(-12.5, 'USD'));
ok('plata: precio de cripto chica conserva cifras', M.plata(0.01292, 'USD', { precio: true }) === 'US$0,01292', M.plata(0.01292, 'USD', { precio: true }));
ok('plata: precio con dos decimales', M.plata(12300, 'ARS', { precio: true }) === '$12.300,00', M.plata(12300, 'ARS', { precio: true }));
ok('plata: con signo', M.plata(5, 'USD', { signo: true }) === '+US$5' && M.plata(0, 'USD', { signo: true }) === 'US$0');
ok('plata: sin dato o sin moneda, raya', M.plata(null, 'ARS') === '—' && M.plata(5, null) === '—' && M.plata(NaN, 'USD') === '—');

// ── el mismo nombre en la compra y en la venta ──
const nv = M.armarMovimientos({ pos: [pos[1]], precios, ventas: [{ id: 'vn', ticker: 'NVDA.BA', cantidad: 2, precioVenta: 14000, costoUnitario: 12300, fecha: '2026-09-26', moneda: 'ARS', factor: 1, posId: 'NVDA.BA-a2' }] });
ok('venta y compra de NVDA.BA con el nombre del sync', nv.every(x => x.nombre === 'Nvidia Corporation'), nv.map(x => x.nombre));
ok('NVDA.BA: 10 que quedan + 2 vendidas = 12 compradas', de(nv, 'compra').cant === 12, de(nv, 'compra'));

// ── entradas raras ──
ok('sin nada: lista vacía', M.armarMovimientos().length === 0 && M.armarMovimientos({}).length === 0);
ok('basura en vez de arreglos: no explota', M.armarMovimientos({ pos: null, ventas: 'x', ajustes: {} }).length === 0);
ok('docs sin ticker: se ignoran', M.armarMovimientos({ pos: [{ id: 'z', cantidad: 3 }], ventas: [{ id: 'w' }], ajustes: [{ id: 'q' }] }).length === 0);
ok('venta sin posId: no inventa una compra', M.armarMovimientos({ ventas: [{ id: 'v', ticker: 'SPY', cantidad: 1, precioVenta: 500, costoUnitario: 400, fecha: '2026-01-01', moneda: 'USD', factor: 1 }] })
   .map(x => x.tipo).join() === 'venta');
ok('filtrar / ordenar / resumen con null: no explotan', M.filtrar(null).length === 0 && M.ordenar(null).length === 0 && M.resumen(null).compras === 0);

console.log(mal ? `${mal} fallas de ${n}` : `OK ${n} casos`);
process.exit(mal ? 1 : 0);
