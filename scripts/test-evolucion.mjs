// Pruebas de evolucion.js (evolución de Mi cartera contra el S&P 500).  node scripts/test-evolucion.mjs
import { valorAl, serieDe, simular, serieReal, combinar, recortar, resumen } from "../evolucion.js";

let fallos = 0, casos = 0;
const cerca = (a, b, tol = 1e-6) => a != null && b != null && Math.abs(a - b) <= tol;
function check(nombre, cond, detalle = "") {
  casos++;
  if (!cond) { fallos++; console.log("FALLA", nombre, detalle); }
}

// ── valorAl ──
const s = [["2026-01-02", 10], ["2026-01-05", 11], ["2026-01-06", 12]];
check("antes del inicio: null", valorAl(s, "2026-01-01") === null);
check("fecha exacta", valorAl(s, "2026-01-05") === 11);
check("feriado: el cierre anterior", valorAl(s, "2026-01-04") === 10);
check("después del final: el último", valorAl(s, "2026-02-01") === 12);
check("valor inválido: null", valorAl([["2026-01-02", 0]], "2026-01-03") === null);
check("alias cripto", serieDe("btc-usd") === "BTC" && serieDe("GGAL.BA") === "GGAL.BA");
const conCrudo = [["2026-01-02", 98, 1, 1, 1, 1, 100], ["2026-01-05", 99, 1, 1, 1, 1, null]];
check("crudo: columna sin dividendos", valorAl(conCrudo, "2026-01-02", true) === 100 && valorAl(conCrudo, "2026-01-02") === 98);
check("crudo sin columna 6: usa la 1", valorAl(conCrudo, "2026-01-05", true) === 99 && valorAl(s, "2026-01-05", true) === 11);

// ── simular ──
const spy = [["2026-01-02", 100], ["2026-01-05", 105], ["2026-01-06", 110]];
const ccl = [["2026-01-01", 1000], ["2026-01-05", 1100]];
const series = {
  AAPL: [["2026-01-02", 50], ["2026-01-05", 55], ["2026-01-06", 60]],
  "GGAL.BA": [["2026-01-02", 5000], ["2026-01-05", 5000], ["2026-01-06", 5500]],
  "SPCX.BA": [["2026-01-05", 100], ["2026-01-06", 100]],
};
const posiciones = [
  { id: "a", ticker: "AAPL", cantidad: 2 },
  { id: "g", ticker: "GGAL.BA", cantidad: 22, moneda: "ARS" },
  { id: "x", ticker: "AL30", cantidad: 1000, moneda: "ARS", factor: 0.01 },
  { id: "s", ticker: "SPCX.BA", cantidad: 1, moneda: "ARS" },
];
const precios = { AAPL: { precio: 60, moneda: "USD" }, "GGAL.BA": { precio: 5500, moneda: "ARS" },
                  AL30: { precio: 88000, moneda: "ARS", factor: 0.01 }, "SPCX.BA": { precio: 100, moneda: "ARS" } };
const base = { posiciones, precios, series, ccl, spy, desde: "2026-01-02", hasta: "2026-01-06" };
const sim = simular({ ...base, cclHoy: 1100 });
check("simulación: 3 puntos", sim.puntos.length === 3, JSON.stringify(sim.puntos));
check("base 100", cerca(sim.puntos[0].cartera, 100) && cerca(sim.puntos[0].spy, 100));
check("el CCL que sube compensa la suba en dólares", cerca(sim.puntos[1].cartera, 100), sim.puntos[1].cartera);
check("día 3: 230/210", cerca(sim.puntos[2].cartera, 230 / 210 * 100), sim.puntos[2].cartera);
check("S&P en los mismos días", cerca(sim.puntos[2].spy, 110));
check("bono sin historia afuera", sim.excluidas.some(e => e.ticker === "AL30" && /sin historia/.test(e.motivo)));
check("historia que empieza tarde afuera", sim.excluidas.some(e => e.ticker === "SPCX.BA" && /después/.test(e.motivo)));
check("cobertura sobre el valor de hoy", cerca(sim.cobertura, 230 / (230 + 800 + 100 / 1100), 1e-9), sim.cobertura);
check("sin CCL del navegador usa el último histórico", cerca(simular({ ...base, cclHoy: null }).cobertura, sim.cobertura, 1e-9));
check("sin ningún CCL: cobertura desconocida (null), no inflada", simular({ ...base, ccl: [], cclHoy: null }).cobertura === null);
check("sin precios de hoy: cobertura null", simular({ ...base, precios: {}, cclHoy: 1100 }).cobertura === null);
check("sin CCL histórico no inventa puntos con pesos", simular({ ...base, ccl: [], cclHoy: 1100 }).puntos.length === 0);
check("rango sin datos: vacío sin romper", simular({ ...base, desde: "2027-01-01", hasta: "2027-02-01" }).puntos.length === 0);
const serieCruda = { ...series, AAPL: [["2026-01-02", 49, 0, 0, 0, 0, 50], ["2026-01-05", 54, 0, 0, 0, 0, 55], ["2026-01-06", 59, 0, 0, 0, 0, 60]] };
check("la simulación usa el cierre sin dividendos", cerca(simular({ ...base, series: serieCruda, cclHoy: 1100 }).puntos[2].cartera, sim.puntos[2].cartera));

// ── serieReal ──
const P = (id, q, p, mon = "USD", fac = 1, pag) => ({ id, tk: id, q, p, mon, fac, ...(pag ? { pag } : {}) });
const fotos = [
  { fecha: "2026-09-16", ccl: 1500, spy: 700, pos: [P("a", 10, 100), P("g", 100, 3000, "ARS")] },
  { fecha: "2026-09-17", ccl: 1600, spy: 707, pos: [P("a", 10, 110), P("g", 100, 3000, "ARS"), P("n", 50, 200)] },
  { fecha: "2026-09-18", ccl: 1600, spy: 700, pos: [P("a", 20, 110), P("n", 50, 210)] },
];
const real = serieReal([fotos[2], fotos[0], fotos[1]]);
check("real: primer día 100", real.length === 3 && real[0].cartera === 100 && real[0].fecha === "2026-09-16");
check("real: agregar una posición no es ganancia", cerca(real[1].cartera, 1287.5 / 1200 * 100), real[1].cartera);
check("real: vender y comprar no son resultado", cerca(real[2].cartera, real[1].cartera * 11600 / 11100), real[2].cartera);
check("real: S&P encadenado", cerca(real[2].spy, 100));
check("real: fotos inválidas se ignoran", serieReal([null, { fecha: "x" }, fotos[0]]).length === 1);
const dos = (a, b) => serieReal([{ fecha: "d1", ccl: 1000, spy: 100, pos: a }, { fecha: "d2", ccl: 1000, spy: 100, pos: b }]);
check("real: bono con factor", cerca(dos([P("b", 1000, 80000, "ARS", 0.01)], [P("b", 1000, 88000, "ARS", 0.01)])[1].cartera, 110));

// split / cambio de ratio de CEDEAR, en los tres órdenes posibles
const aapl = P("x", 1, 100);                                            // ancla que no se mueve
const splitMismoDia = dos([P("n", 10, 30000, "ARS"), aapl], [P("n", 100, 3000, "ARS"), aapl]);
check("split el mismo día: no es pérdida", cerca(splitMismoDia[1].cartera, 100), splitMismoDia[1].cartera);
const splitPrecioPrimero = serieReal([
  { fecha: "d1", ccl: 1000, spy: 1, pos: [P("n", 10, 30000, "ARS"), aapl] },
  { fecha: "d2", ccl: 1000, spy: 1, pos: [P("n", 10, 3000, "ARS"), aapl] },
  { fecha: "d3", ccl: 1000, spy: 1, pos: [P("n", 100, 3000, "ARS"), aapl] }]);
check("split con el precio primero: no es pérdida", cerca(splitPrecioPrimero[1].cartera, 100) && cerca(splitPrecioPrimero[2].cartera, 100), splitPrecioPrimero.map(x => x.cartera));
const splitCantidadPrimero = serieReal([
  { fecha: "d1", ccl: 1000, spy: 1, pos: [P("n", 10, 30000, "ARS"), aapl] },
  { fecha: "d2", ccl: 1000, spy: 1, pos: [P("n", 100, 30000, "ARS"), aapl] },
  { fecha: "d3", ccl: 1000, spy: 1, pos: [P("n", 100, 3000, "ARS"), aapl] }]);
check("split con la cantidad primero: no es pérdida", cerca(splitCantidadPrimero[1].cartera, 100) && cerca(splitCantidadPrimero[2].cartera, 100), splitCantidadPrimero.map(x => x.cartera));

// moneda o factor que cambian entre fotos
const cambioMoneda = dos([P("g", 10, 6000, "USD"), P("a", 100, 100)], [P("g", 10, 6000, "ARS"), P("a", 100, 100)]);
check("moneda corregida entre fotos: sin salto falso", cerca(cambioMoneda[1].cartera, 100), cambioMoneda[1].cartera);
const cambioFactor = dos([P("b", 1000, 80000, "ARS", 1), P("a", 100, 100)], [P("b", 1000, 80000, "ARS", 0.01), P("a", 100, 100)]);
check("factor corregido entre fotos: sin salto falso", cerca(cambioFactor[1].cartera, 100), cambioFactor[1].cartera);

// datos faltantes: se compara contra el último válido cuando vuelve
const spyFalta = serieReal([{ fecha: "d1", ccl: 1, spy: 700, pos: [] }, { fecha: "d2", ccl: 1, spy: null, pos: [] }, { fecha: "d3", ccl: 1, spy: 770, pos: [] }]);
check("SPY faltante un día: no se pierde el +10%", cerca(spyFalta[2].spy, 110), spyFalta.map(x => x.spy));
const cclFalta = serieReal([
  { fecha: "d1", ccl: 1500, spy: 1, pos: [P("g", 1, 1500, "ARS")] },
  { fecha: "d2", ccl: null, spy: 1, pos: [P("g", 1, 1650, "ARS")] },
  { fecha: "d3", ccl: 1500, spy: 1, pos: [P("g", 1, 1800, "ARS")] }]);
check("CCL faltante: usa el último conocido, sin perder la suba", cerca(cclFalta[2].cartera, 120), cclFalta.map(x => x.cartera));
check("CCL faltante: con serie histórica usa la de ese día", cerca(serieReal([
  { fecha: "2026-01-02", ccl: 1000, spy: 1, pos: [P("g", 1, 1000, "ARS")] },
  { fecha: "2026-01-05", ccl: null, spy: 1, pos: [P("g", 1, 1100, "ARS")] }], { cclSerie: ccl })[1].cartera, 100));
const precioFalta = serieReal([
  { fecha: "d1", ccl: 1, spy: 1, pos: [P("x", 1, 100), P("y", 1, 100)] },
  { fecha: "d2", ccl: 1, spy: 1, pos: [P("x", 1, null), P("y", 1, 100)] },
  { fecha: "d3", ccl: 1, spy: 1, pos: [P("x", 1, 150), P("y", 1, 100)] }]);
check("precio faltante: el +50% de x se cuenta cuando vuelve (+25% la cartera)", cerca(precioFalta[2].cartera, 125), precioFalta.map(x => x.cartera));

// pagos de bonos: el cupón no es pérdida
const cupon = serieReal([
  { fecha: "2026-09-28", ccl: 1600, spy: 1, pos: [P("b", 10000, 157600, "ARS", 0.01, [["2026-09-29", 0.5]])] },
  { fecha: "2026-09-29", ccl: 1600, spy: 1, pos: [P("b", 10000, 156800, "ARS", 0.01)] }]);
// ayer: 10000*0.01*157600/1600 = 9850 USD ; hoy: 10000*0.01*156800/1600 = 9800 + cupón 10000*0.01*0.5 = 50 USD
check("cupón cobrado: suma lo pagado (la baja del precio no es pérdida)", cerca(cupon[1].cartera, (9800 + 50) / 9850 * 100), cupon[1].cartera);
const cuponViejo = serieReal([
  { fecha: "2026-10-01", ccl: 1600, spy: 1, pos: [P("b", 10000, 156800, "ARS", 0.01, [["2026-09-29", 0.5]])] },
  { fecha: "2026-10-02", ccl: 1600, spy: 1, pos: [P("b", 10000, 156800, "ARS", 0.01, [["2026-09-29", 0.5]])] }]);
check("un pago anterior a las dos fotos no se suma", cerca(cuponViejo[1].cartera, 100));

// amortización grande (BOPREAL): la baja ex antes del pago, y el precio atrasado después
const fijo = P("f", 1000, 1);
const bpa = (fecha, p, pag) => ({ fecha, ccl: 1500, spy: 1, pos: [P("b", 1000, p, "USD", 0.01, pag), fijo] });
const PAG = [["2027-04-30", 52.5]];
const exAntes = serieReal([bpa("2027-04-27", 102, PAG), bpa("2027-04-28", 51.5, PAG), bpa("2027-04-29", 51.5, PAG), bpa("2027-04-30", 51.5)]);
check("amortización con la baja ex antes del pago: sin ganancia ni pérdida falsas", exAntes.every(x => x.cartera > 99 && x.cartera < 102) && cerca(exAntes[3].cartera, exAntes[1].cartera), exAntes.map(x => x.cartera));
check("amortización: suma el cobro una sola vez (+0,99%)", cerca(exAntes[1].cartera, 2040 / 2020 * 100), exAntes.map(x => x.cartera));
const precioTarde = serieReal([bpa("2027-04-29", 102, PAG), bpa("2027-04-30", 102, PAG), bpa("2027-05-01", 51.5, PAG), bpa("2027-05-02", 51.5)]);
check("pago con el precio atrasado: se suma recién cuando el precio baja", precioTarde.every(x => x.cartera > 99 && x.cartera < 102) && cerca(precioTarde[3].cartera, precioTarde[2].cartera), precioTarde.map(x => x.cartera));
const venc = (fecha, p, pag) => ({ fecha, ccl: 1600, spy: 1, pos: [P("o", 10000, p, "ARS", 0.01, pag), P("f", 1605, 1)] });
const vencimiento = serieReal([venc("2027-10-27", 160600, [["2027-10-29", 100.5]]), venc("2027-10-28", 160680, [["2027-10-29", 100.5]]),
                              venc("2027-10-29", 160680), venc("2027-11-01", 160680)]);
check("vencimiento con el precio congelado: no duplica el valor", vencimiento.every(x => x.cartera < 101), vencimiento.map(x => x.cartera));
const caida = serieReal([
  { fecha: "d1", ccl: 1, spy: 1, pos: [P("g", 100, 50), P("f", 5000, 1)] },
  { fecha: "d2", ccl: 1, spy: 1, pos: [P("g", 100, 23), P("f", 5000, 1)] },
  { fecha: "d3", ccl: 1, spy: 1, pos: [P("g", 100, 27.6), P("f", 5000, 1)] }]);
check("una caída real de más del 45% (sin cambio de cantidad) cuenta", cerca(caida[1].cartera, 73) && cerca(caida[2].cartera, 77.6), caida.map(x => x.cartera));
const cripto = dos([P("btc", 1, 60000)], [P("btc", 1, 30000)]);
check("cripto que cae 50% en el día: cuenta", cerca(cripto[1].cartera, 50), cripto[1].cartera);

// fotos que se cortan: la simulación sigue desde la última
const simLarga = [["2026-07-01", 100], ["2026-07-15", 102], ["2026-08-01", 110], ["2026-08-20", 120]].map(([fecha, c]) => ({ fecha, cartera: c, spy: 100 }));
const realCorta = [{ fecha: "2026-07-01", cartera: 100, spy: 100 }, { fecha: "2026-07-15", cartera: 101, spy: 100 }];
const cont = combinar(simLarga, realCorta);
check("fotos cortadas: la simulación sigue desde la última foto", cont.map(x => x.tipo).join() === "real,real,sim,sim" && cerca(cont[3].cartera, 101 * 120 / 102), JSON.stringify(cont));
check("fotos cortadas: el rango reciente no queda vacío", recortar(cont, "2026-08-01").length === 2);

// ── combinar, recortar, resumen ──
const simC = [{ fecha: "2026-09-14", cartera: 100, spy: 100 }, { fecha: "2026-09-15", cartera: 120, spy: 110 },
              { fecha: "2026-09-16", cartera: 125, spy: 111 }];
const comb = combinar(simC, real);
check("combinar: simulación hasta el día anterior a la primera foto", comb.filter(x => x.tipo === "sim").map(x => x.fecha).join() === "2026-09-14,2026-09-15");
check("combinar: la real sigue desde el valor simulado de ese día", cerca(comb.find(x => x.tipo === "real").cartera, 125) && cerca(comb.find(x => x.tipo === "real").spy, 111));
check("combinar sin fotos: todo simulación", combinar(simC, []).every(x => x.tipo === "sim"));
check("combinar sin simulación: la real en base 100", cerca(combinar([], real)[0].cartera, 100));
const rec = recortar(comb, "2026-09-15");
check("recortar rebasa a 100", rec.length === 4 && cerca(rec[0].cartera, 100) && cerca(rec[0].spy, 100));
const res = resumen(rec);
check("resumen", res && cerca(res.cartera, comb[comb.length - 1].cartera / 120 * 100 - 100) && cerca(res.diferencia, res.cartera - res.spy) && res.hasta === "2026-09-18");
check("resumen con un punto: null", resumen(rec.slice(0, 1)) === null);

console.log(fallos ? `${fallos} FALLAS de ${casos}` : `OK ${casos} casos`);
process.exit(fallos ? 1 : 0);
