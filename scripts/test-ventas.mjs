// node scripts/test-ventas.mjs — verifica el cálculo de ventas y resultado realizado
import * as V from '../ventas.js';
import { readFileSync } from 'node:fs';

let mal = 0, n = 0;
const cerca = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
function ok(nombre, cond, detalle) {
  n++;
  if (!cond) { mal++; console.log(`FALLA ${nombre}: ${JSON.stringify(detalle)}`); }
}

// ── resultado de una venta ──
let r = V.resultadoVenta({ cantidad: 10, precioVenta: 150, costoUnitario: 100, factor: 1 });
ok('accion: resultado', cerca(r.resultado, 500), r);
ok('accion: %', cerca(r.pct, 50), r);
r = V.resultadoVenta({ cantidad: 1000, precioVenta: 85000, costoUnitario: 80000, factor: 0.01 });
ok('bono (cotiza cada 100 VN): 1000 VN x 5000 x 0,01', cerca(r.resultado, 50000), r);
r = V.resultadoVenta({ cantidad: 0.1323, precioVenta: 80000, costoUnitario: 79155.15, factor: 1 });
ok('cripto con decimales', cerca(r.resultado, 0.1323 * (80000 - 79155.15)), r);
r = V.resultadoVenta({ cantidad: 5, precioVenta: 90, costoUnitario: 120 });
ok('perdida y factor por defecto 1', cerca(r.resultado, -150) && cerca(r.pct, -25), r);
r = V.resultadoVenta({ cantidad: 5, precioVenta: 90, costoUnitario: 0 });
ok('sin precio de compra: no se inventa el resultado', r.resultado === null && r.pct === null && cerca(r.ingreso, 450), r);

// ── tenencia ──
ok('dias exactos', V.diasTenencia({ fechaCompra: '2026-01-10', fecha: '2026-03-11' }) === 60);
ok('dias sin compra', V.diasTenencia({ fechaCompra: '', fecha: '2026-03-11' }) === null);
ok('dias al reves', V.diasTenencia({ fechaCompra: '2026-04-01', fecha: '2026-03-11' }) === null);
const tAprox = V.tenencia({ fechaCompra: '', fecha: '2026-09-20', pos: { desde: '2026-09-09', fechaAprox: true } });
ok('con solo el "desde" del sync es un minimo (aprox)', tAprox && tAprox.dias === 11 && tAprox.aprox === true, tAprox);
ok('...y diasTenencia no lo da como exacto', V.diasTenencia({ fechaCompra: '', fecha: '2026-09-20', pos: { desde: '2026-09-09' } }) === null);
const tReal = V.tenencia({ fechaCompra: '2026-09-01', fecha: '2026-09-20', pos: { desde: '2026-09-09' } });
ok('la fecha real le gana al "desde"', tReal && tReal.dias === 19 && tReal.aprox === false, tReal);

// ── validación ──
const pos = { id: 'GGAL.BA-abc', ticker: 'GGAL.BA', cantidad: 100, precioCompra: 4500, fecha: '2026-03-10', broker: 'IOL' };
const HOY = '2026-09-10';
ok('parcial deja resto', V.validarVenta(pos, 40, 6000, '2026-09-01', HOY, 'ARS').resto === 60);
ok('total deja 0', V.validarVenta(pos, 100, 6000, '2026-09-01', HOY, 'ARS').resto === 0);
ok('mas de lo que tiene', !V.validarVenta(pos, 101, 6000, '2026-09-01', HOY, 'ARS').ok);
ok('cantidad 0', !V.validarVenta(pos, 0, 6000, '2026-09-01', HOY, 'ARS').ok);
ok('cantidad NaN', !V.validarVenta(pos, NaN, 6000, '2026-09-01', HOY, 'ARS').ok);
ok('precio 0', !V.validarVenta(pos, 10, 0, '2026-09-01', HOY, 'ARS').ok);
ok('fecha futura', !V.validarVenta(pos, 10, 6000, '2026-09-11', HOY, 'ARS').ok);
ok('fecha mal formada', !V.validarVenta(pos, 10, 6000, '01/09/2026', HOY, 'ARS').ok);
ok('venta anterior a la compra', !V.validarVenta(pos, 10, 6000, '2026-03-09', HOY, 'ARS').ok);
ok('mismo dia que la compra', V.validarVenta(pos, 10, 6000, '2026-03-10', HOY, 'ARS').ok);
const sinMon = V.validarVenta(pos, 10, 6000, '2026-09-01', HOY, null);
ok('moneda desconocida: no se registra', !sinMon.ok && /moneda/.test(sinMon.error), sinMon);
ok('sin pasar moneda (undefined) no bloquea', V.validarVenta(pos, 10, 6000, '2026-09-01', HOY).ok);
const posSync = { id: 'BTC', ticker: 'BTC-USD', cantidad: 0.1323, precioCompra: 79155.15, desde: '2026-09-09', fechaAprox: true };
const rv = V.validarVenta(posSync, 0.1323, 80000, '2026-09-01', HOY, 'USD');
ok('cripto entera con decimales: resto 0 exacto y "desde" no bloquea la fecha', rv.ok && rv.resto === 0, rv);
ok('cripto: 0.1323000000001 cuenta como todo', V.validarVenta(posSync, 0.1323000000001, 80000, '2026-09-09', HOY, 'USD').resto === 0);

// ── moneda y factor ──
ok('manda el precio', JSON.stringify(V.monedaFactor({ moneda: 'USD', factor: 0 }, { moneda: 'ARS', factor: 0.01 })) === '{"moneda":"ARS","factor":0.01}');
ok('factor de la posicion le gana al del precio', V.monedaFactor({ factor: 1 }, { factor: 0.01 }).factor === 1);
ok('sin moneda en ningun lado: null (NO se asume USD)', JSON.stringify(V.monedaFactor({}, null)) === '{"moneda":null,"factor":1}');
ok('moneda rara se normaliza a USD', V.monedaFactor({ moneda: 'EUR' }, null).moneda === 'USD');
ok('renta fija sin factor: 0,01', V.monedaFactor({ moneda: 'ARS' }, null, true).factor === 0.01);
ok('renta fija: el factor del precio le gana', V.monedaFactor({ moneda: 'ARS' }, { factor: 1 }, true).factor === 1);

// ── documento de la venta ──
const px = { moneda: 'ARS', precio: 6100 };
const doc = V.armarVenta({ ...pos, px, dValor: 1, peso: 3 }, px, 40, 6000, '2026-09-01', '2026-09-10T15:00:00Z');
ok('solo campos que aceptan las reglas', Object.keys(doc).every(k => V.CAMPOS_VENTA.includes(k)), Object.keys(doc));
ok('la foto no se lleva basura de calcular() ni el id', !('px' in doc.pos) && !('dValor' in doc.pos) && !('id' in doc.pos), doc.pos);
ok('costo = precio de compra de esa posicion', doc.costoUnitario === 4500 && doc.moneda === 'ARS' && doc.factor === 1, doc);
ok('fechaCompra y posId', doc.fechaCompra === '2026-03-10' && doc.posId === 'GGAL.BA-abc', doc);
ok('sin precio de compra -> costo 0 (resultado null)', V.armarVenta({ ...pos, precioCompra: undefined }, px, 1, 1, '2026-09-01', 'x').costoUnitario === 0);
const dSync = V.armarVenta(posSync, null, 0.1, 80000, '2026-09-10', 'x');
ok('sync: fechaCompra vacia (el "desde" no es la compra) y queda en la foto', dSync.fechaCompra === '' && dSync.pos.desde === '2026-09-09', dSync);
ok('renta fija sin factor: la venta sale con 0,01', V.armarVenta({ ...pos, ticker: 'AL30' }, { moneda: 'ARS' }, 1000, 65000, '2026-09-01', 'x', true).factor === 0.01);

// ── deshacer ──
ok('si la posicion sigue, suma', JSON.stringify(V.planDeshacer(doc, { id: 'x' })) === '{"tipo":"sumar","cantidad":40}');
const rec = V.planDeshacer(doc, null);
ok('si ya no existe, la recrea con lo vendido', rec.tipo === 'recrear' && rec.datos.cantidad === 40 && rec.datos.ticker === 'GGAL.BA' && rec.datos.precioCompra === 4500, rec);

// ── resumen ──
const ventas = [
  { cantidad: 10, precioVenta: 150, costoUnitario: 100, moneda: 'USD', fecha: '2026-02-01' },   // +500 USD
  { cantidad: 100, precioVenta: 6000, costoUnitario: 4500, moneda: 'ARS', fecha: '2026-09-01' }, // +150.000 ARS
  { cantidad: 5, precioVenta: 90, costoUnitario: 120, moneda: 'USD', fecha: '2025-12-20' },     // -150 USD (otro año)
  { cantidad: 5, precioVenta: 90, costoUnitario: 0, moneda: 'USD', fecha: '2026-03-01' },       // sin costo, 2026
];
const conv = (v, m) => (m === 'ARS' ? v / 1500 : v);   // a USD a 1500
const s = V.resumenVentas(ventas, conv, '2026');
ok('total por moneda', cerca(s.porMoneda.USD, 350) && cerca(s.porMoneda.ARS, 150000), s);
ok('total convertido', cerca(s.total, 350 + 100) && s.totalCompleto, s);
ok('del año', s.delAnio.n === 2 && cerca(s.delAnio.total, 500 + 100), s.delAnio);
ok('sin costo contado aparte en el total', s.sinCosto === 1 && s.n === 3, s);
ok('...y TAMBIEN en el del año (para no mostrarlo como completo)', s.delAnio.sinCosto === 1, s.delAnio);
const sinFx = V.resumenVentas(ventas, (v, m) => (m === 'ARS' ? null : v), '2026');
ok('sin cotizacion: total incompleto', !sinFx.totalCompleto && cerca(sinFx.porMoneda.ARS, 150000), sinFx);
ok('lista vacia', V.resumenVentas([], conv, '2026').n === 0);
const soloSinCosto = V.resumenVentas([ventas[3]], conv, '2026');
ok('todas sin costo: n 0 pero sinCosto 1 (la UI no dice "sin ventas")', soloSinCosto.n === 0 && soloSinCosto.delAnio.sinCosto === 1, soloSinCosto);

// ── las reglas de Firestore ──
const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const bloque = (reglas.match(/match \/ventas\/\{vid\} \{[\s\S]*?\n      \}/) || [''])[0];
const m = bloque.match(/hasOnly\(\[([^\]]*)\]\)/);
const enReglas = m ? m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean).sort() : null;
ok('firestore.rules y CAMPOS_VENTA coinciden', enReglas && JSON.stringify(enReglas) === JSON.stringify([...V.CAMPOS_VENTA].sort()), enReglas);
ok('una venta no se edita: sin "update" (un reintento con el mismo id se rechaza)', bloque && !/\bupdate\b/.test(bloque.replace(/\/\/.*$/gm, '')), bloque.slice(0, 80));
ok('solo se borra una venta que existe', /allow delete: if esDuenio\(\) && resource != null/.test(bloque));

console.log(mal ? `${mal} fallas de ${n}` : `OK ${n} casos`);
process.exit(mal ? 1 : 0);
