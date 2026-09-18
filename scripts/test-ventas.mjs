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
// sin precio ni moneda guardada: solo lo que el ticker dice sin dudas
ok('ticker .BA: pesos', V.monedaDeTicker('TXAR.BA') === 'ARS');
ok('YPFD.BA termina en D pero es accion: pesos', V.monedaDeTicker('YPFD.BA') === 'ARS');
ok('cripto: dolares', V.monedaDeTicker('BTC-USD') === 'USD');
ok('bono en pesos', V.monedaDeTicker('AL30', true) === 'ARS');
ok('bono D y C: dolares', V.monedaDeTicker('AL30D', true) === 'USD' && V.monedaDeTicker('GD30C', true) === 'USD');
ok('letra: pesos', V.monedaDeTicker('S30N6', true) === 'ARS');
ok('sin sufijo y no es bono: no se sabe', V.monedaDeTicker('AAPL') === null && V.monedaDeTicker('') === null);
ok('la posicion sin moneda usa su ticker', V.monedaFactor({ ticker: 'TXAR.BA' }, null).moneda === 'ARS');
ok('el ticker aparte (foto de un aviso sin ticker)', V.monedaFactor({}, null, false, 'BTC-USD').moneda === 'USD');
ok('el precio le gana al ticker', V.monedaFactor({ ticker: 'X.BA' }, { moneda: 'USD' }).moneda === 'USD');
ok('la moneda guardada le gana al ticker', V.monedaFactor({ ticker: 'X.BA', moneda: 'USD' }, null).moneda === 'USD');
ok('sin sufijo y sin datos sigue bloqueando', V.monedaFactor({ ticker: 'AAPL' }, null).moneda === null);
ok('venta desde un aviso sin moneda: la del ticker del aviso',
   V.ventaDesdeAjuste({ ticker: 'GGAL.BA', pos: { precioCompra: 5000 }, cantidadAntes: 10, cantidadBroker: 0 }, 10, null, 6000, '2026-09-01', 'x').moneda === 'ARS');

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

// ── ventas desde un ajuste del sync ──
const aj = { id: 'GGAL-2026-09-11', tipo: 'bajo', ticker: 'GGAL.BA', posId: 'GGAL', broker: 'IOL',
             cantidadAntes: 96, cantidadBroker: 56, fecha: '2026-09-11',
             pos: { ticker: 'GGAL.BA', cantidad: 96, precioCompra: 7970.89, moneda: 'ARS', factor: 1, origen: 'sync IOL', desde: '2026-09-09', fechaAprox: true } };
ok('cantidad del ajuste', V.cantidadAjuste(aj) === 40);
ok('cripto sin ruido de coma flotante', V.cantidadAjuste({ cantidadAntes: 0.266468, cantidadBroker: 0.132293 }) === 0.134175);
ok('desaparecio: vende todo', V.cantidadAjuste({ cantidadAntes: 5, cantidadBroker: 0 }) === 5);
ok('sin baja: 0', V.cantidadAjuste({ cantidadAntes: 5, cantidadBroker: 5 }) === 0 && V.cantidadAjuste({}) === 0);
const va = V.ventaDesdeAjuste(aj, 40, null, 9000, '2026-09-11', 'x');
ok('venta desde ajuste: costo de la foto, moneda del sync, sin fechaCompra ("desde" no es compra)',
   va.cantidad === 40 && va.costoUnitario === 7970.89 && va.moneda === 'ARS' && va.fechaCompra === '' && va.origen === 'broker' && va.posId === 'GGAL' && va.broker === 'IOL', va);
ok('solo campos de las reglas', Object.keys(va).every(k => V.CAMPOS_VENTA.includes(k)), Object.keys(va));
ok('resultado de esa venta', cerca(V.resultadoVenta(va).resultado, 40 * (9000 - 7970.89)));
ok('la tenencia queda aproximada (solo "desde")', V.tenencia(va) && V.tenencia(va).aprox === true, V.tenencia(va));
ok('el precio del doc manda sobre la moneda de la foto', V.ventaDesdeAjuste(aj, 40, { moneda: 'USD' }, 9000, '2026-09-11', 'x').moneda === 'USD');
ok('validar ajuste ok', V.validarAjuste(aj, 40, 9000, '2026-09-11', '2026-09-11', 'ARS').ok);
ok('validar: una parte tambien', V.validarAjuste(aj, 15, 9000, '2026-09-11', '2026-09-11', 'ARS').ok);
ok('validar: mas de lo que bajo, no', !V.validarAjuste(aj, 41, 9000, '2026-09-11', '2026-09-11', 'ARS').ok);
ok('validar: cantidad 0, no', !V.validarAjuste(aj, 0, 9000, '2026-09-11', '2026-09-11', 'ARS').ok);
ok('validar: sin baja', !V.validarAjuste({ cantidadAntes: 5, cantidadBroker: 5 }, 1, 9000, '2026-09-11', '2026-09-11', 'ARS').ok);
ok('validar: moneda null', !V.validarAjuste(aj, 40, 9000, '2026-09-11', '2026-09-11', null).ok);
ok('validar: precio 0', !V.validarAjuste(aj, 40, 0, '2026-09-11', '2026-09-11', 'ARS').ok);
ok('validar: fecha futura', !V.validarAjuste(aj, 40, 9000, '2026-09-12', '2026-09-11', 'ARS').ok);
ok('validar: antes de la compra real', !V.validarAjuste({ ...aj, pos: { ...aj.pos, fecha: '2026-09-10' } }, 40, 9000, '2026-09-09', '2026-09-11', 'ARS').ok);
const parcial = V.ventaDesdeAjuste(aj, 15, null, 9000, '2026-09-11', 'x');
ok('venta parcial: 15 con el mismo costo', parcial.cantidad === 15 && parcial.costoUnitario === 7970.89);
const resto = V.restoDeAjuste(aj, 15, 'y');
ok('el resto del aviso: 81 → 56 (quedan 25), misma foto, pendiente', resto.cantidadAntes === 81 && resto.cantidadBroker === 56 && V.cantidadAjuste(resto) === 25
   && resto.pos.precioCompra === 7970.89 && resto.estado === 'pendiente' && resto.creado === 'y', resto);
ok('resto: solo los campos de las reglas', Object.keys(resto).every(k => ['tipo', 'ticker', 'posId', 'broker', 'cantidadAntes', 'cantidadBroker', 'fecha', 'estado', 'pos', 'creado'].includes(k)));

// ── deshacer una venta de aviso: vuelve el aviso ──
const vuelto = V.ajusteDesdeVenta({ ...va, id: 'aj-GGAL-2026-09-11', creado: '2026-09-11T12:00:00Z' });
ok('parcial: bajo 96 → 56, misma foto, pendiente', vuelto.tipo === 'bajo' && vuelto.cantidadAntes === 96 && vuelto.cantidadBroker === 56
   && vuelto.pos.precioCompra === 7970.89 && vuelto.estado === 'pendiente' && vuelto.posId === 'GGAL' && vuelto.broker === 'IOL', vuelto);
const vTotal = V.ventaDesdeAjuste({ ...aj, cantidadBroker: 0 }, 96, null, 9000, '2026-09-11', 'x');
ok('total: desaparecio 96 → 0', V.ajusteDesdeVenta(vTotal).tipo === 'desaparecio' && V.ajusteDesdeVenta(vTotal).cantidadBroker === 0);
ok('sin foto: antes = lo vendido', V.ajusteDesdeVenta({ cantidad: 5, ticker: 'KO.BA' }).cantidadAntes === 5 && V.ajusteDesdeVenta({ cantidad: 5, ticker: 'KO.BA' }).tipo === 'desaparecio');
const CAMPOS_AVISO = ['tipo', 'ticker', 'posId', 'broker', 'cantidadAntes', 'cantidadBroker', 'fecha', 'estado', 'pos', 'creado'];
ok('solo los campos que aceptan las reglas de ajustes', Object.keys(vuelto).every(k => CAMPOS_AVISO.includes(k)), Object.keys(vuelto));

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
