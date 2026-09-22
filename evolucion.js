/* ── Evolución de Mi cartera contra el S&P 500 ──────────────────────────────
   Cuentas puras (sin Firestore ni DOM), para probarlas con node.

   Dos tramos, y la web los muestra distintos:
   - SIMULACIÓN: la composición de HOY valuada con los cierres históricos
     (historialInformes, columna sin dividendos) y el dólar CCL de cada día.
     Responde "cómo le habría ido a esta cartera", no "cuánto ganaste": las
     fechas de compra reales casi nunca están cargadas y el sync del broker
     pisa las cantidades, así que la historia real no se puede reconstruir.
   - REAL: las fotos diarias que guarda el pipeline al cierre
     (inversores/{email}/evolucion/{fecha}). El rendimiento de cada día usa las
     cantidades de la foto ANTERIOR con los precios de hoy: agregar o vender no
     cuenta como ganancia ni pérdida.
   Todo en dólares CCL y en variación de precio: sin dividendos ni en la
   cartera ni en el S&P 500 (SPY en los mismos días). Los cupones y
   amortizaciones de bonos sí se suman, cuando el precio ya los descontó, para
   que el cobro no se lea como una pérdida. */

// la serie se guarda con el símbolo de la ficha, no con el de la cartera
export const ALIAS_SERIE = { "BTC-USD": "BTC", "ETH-USD": "ETH" };
export const serieDe = tk => ALIAS_SERIE[String(tk || "").toUpperCase()] || String(tk || "").toUpperCase();

// un precio que se multiplica o se divide así en un día PUEDE ser un split o
// un cambio de ratio de CEDEAR: se confirma mirando si la cantidad se movió a
// la inversa en las fotos de alrededor (si no, la variación es real y cuenta)
export const SALTO_MAX = 1.8, SALTO_MIN = 0.55;

/* último valor con fecha <= f en una serie ordenada [[fecha, valor, ...]].
   crudo: en las series de precios usa el cierre sin dividendos (columna 6)
   si está; los docs viejos solo traen la columna 1. */
export function valorAl(serie, fecha, crudo = false) {
  if (!Array.isArray(serie) || !serie.length || String(serie[0][0]) > fecha) return null;
  let lo = 0, hi = serie.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (String(serie[mid][0]) <= fecha) lo = mid; else hi = mid - 1;
  }
  const fila = serie[lo];
  const v = Number(crudo && fila.length > 6 && fila[6] != null ? fila[6] : fila[1]);
  return isFinite(v) && v > 0 ? v : null;
}

/* regla de respaldo; mi-cartera.js le pasa a simular() su monedaPosicion,
   la MISMA que usa calcular() (con los bonos del panel) */
const monedaDe = (p, px) => (px && px.moneda) || p.moneda || (String(p.ticker || "").toUpperCase().endsWith(".BA") ? "ARS" : "USD");
const factorDe = (p, px) => Number(p.factor) > 0 ? Number(p.factor) : (px && Number(px.factor) > 0 ? Number(px.factor) : 1);

/* Simulación de la composición de hoy entre `desde` y `hasta`.
   Una posición entra solo si tiene serie desde el primer día del rango: si
   entrara a mitad de camino, su valor aparecería como un salto de la curva.
   Devuelve { puntos: [{fecha, cartera, spy}] (base 100), incluidas, excluidas:
   [{ticker, motivo}], cobertura: parte del valor de HOY que entra (0 a 1), o
   null si no se puede saber (sin precios de hoy, o posiciones en pesos sin
   ningún dólar CCL para valuarlas) }. */
export function simular({ posiciones = [], precios = {}, series = {}, ccl = [], spy = [], desde, hasta, cclHoy = null,
                          monedaDe: monedaFn = monedaDe }) {
  const fechas = (spy || []).map(r => String(r[0])).filter(f => f >= desde && f <= hasta);
  const cambioHoy = Number(cclHoy) > 0 ? Number(cclHoy) : valorAl(ccl, hasta);
  const incluidas = [], excluidas = [];
  let valorHoy = 0, valorHoyIncl = 0, sinCambio = false;
  for (const p of posiciones) {
    const tk = String(p.ticker || "").toUpperCase();
    const q = Number(p.cantidad) || 0;
    if (!tk || q <= 0) continue;
    const px = precios[tk] || null, mon = monedaFn(p, px), fac = factorDe(p, px);
    const pHoy = px && Number(px.precio) > 0 ? Number(px.precio) : null;
    const vHoy = pHoy == null ? null : mon === "ARS" ? (cambioHoy > 0 ? q * pHoy * fac / cambioHoy : null) : q * pHoy * fac;
    if (pHoy != null && vHoy == null) sinCambio = true;
    if (vHoy != null) valorHoy += vHoy;
    const s = series[serieDe(tk)];
    if (!Array.isArray(s) || s.length < 2) { excluidas.push({ ticker: tk, motivo: "sin historia de precios" }); continue; }
    if (!fechas.length || valorAl(s, fechas[0], true) == null) { excluidas.push({ ticker: tk, motivo: "su historia empieza después" }); continue; }
    incluidas.push({ tk, s, q, mon, fac });
    if (vHoy != null) valorHoyIncl += vHoy;
  }
  const puntos = [];
  let base = null, baseSpy = null;
  if (incluidas.length) {
    for (const f of fechas) {
      const cambio = valorAl(ccl, f);
      let v = 0, ok = true;
      for (const x of incluidas) {
        const precio = valorAl(x.s, f, true);
        if (precio == null || (x.mon === "ARS" && !(cambio > 0))) { ok = false; break; }
        v += x.q * precio * x.fac / (x.mon === "ARS" ? cambio : 1);
      }
      const vs = valorAl(spy, f, true);
      if (!ok || !(v > 0) || vs == null) continue;
      if (base == null) { base = v; baseSpy = vs; }
      puntos.push({ fecha: f, cartera: v / base * 100, spy: vs / baseSpy * 100 });
    }
  }
  return { puntos, incluidas: incluidas.map(x => x.tk), excluidas,
           cobertura: sinCambio || !(valorHoy > 0) ? null : valorHoyIncl / valorHoy };
}

const sumarDias = (f, n) => {
  const t = Date.parse(String(f) + "T12:00:00Z");
  return isFinite(t) ? new Date(t + n * 864e5).toISOString().slice(0, 10) : String(f);
};

/* ¿el salto de precio de la foto i es un split? Sí, si entre las fotos de
   antes (i-2, i-1) y las de después (i, i+1, i+2) la cantidad de esa
   posición se movió a la inversa del precio (±25%). */
function esSplit(fotos, i, id, salto) {
  const q = k => {
    const foto = fotos[k];
    const x = foto && foto.pos.find(y => y.id === id);
    return x && Number(x.q) > 0 ? Number(x.q) : null;
  };
  for (const antes of [i - 2, i - 1]) {
    const qa = q(antes);
    if (!qa) continue;
    for (const despues of [i, i + 1, i + 2]) {
      const qd = q(despues);
      if (qd && Math.abs((qd / qa) * salto - 1) < 0.25) return true;
    }
  }
  return false;
}

/* Serie real desde las fotos diarias:
   [{fecha, ccl, spy, pos: [{id, tk, q, p, mon, fac, pag?}]}].
   Por día: valor de hoy de las cantidades de la foto anterior, contra su valor
   al último precio válido. Así:
   - agregar o vender no cuenta (se usan las cantidades de antes);
   - un dato faltante (precio, CCL o SPY) no borra dos días: se compara contra
     el último válido cuando vuelve;
   - un cambio de moneda o de factor saca a esa posición ese día, y un salto de
     precio también, pero solo si fue un split (la cantidad se movió a la
     inversa): una caída real, por grande que sea, cuenta;
   - los pagos de bonos (pag: [[fecha, USD cada 100 VN]]) que ya pasaron o
     caen en los próximos 5 días (el bono cotiza ex antes de pagar) se suman
     una sola vez, y recién cuando el precio bajó al menos la mitad de lo
     pagado: si el precio todavía no lo descontó (o quedó congelado al vencer),
     sumarlo inventaría una ganancia.
   cclSerie: el CCL histórico, por si una foto vino sin dólar. */
export function serieReal(fotos = [], { cclSerie = [] } = {}) {
  const f = fotos.filter(x => x && x.fecha && Array.isArray(x.pos))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const puntos = [];
  const ultimo = new Map();      // id -> último precio válido {p, u (USD por unidad, con factor), mon, fac, fecha, pag}
  const primera = new Map();     // id -> fecha de la primera foto con la posición
  const cobrados = new Map();    // id -> Set de fechas de pagos ya sumados
  let idx = 100, idxSpy = 100, ultSpy = null, ultCcl = null;
  for (let i = 0; i < f.length; i++) {
    const hoy = f[i];
    const ccl = Number(hoy.ccl) > 0 ? Number(hoy.ccl) : (valorAl(cclSerie, hoy.fecha) || ultCcl);
    if (ccl > 0) ultCcl = ccl;
    const deHoy = new Map();
    for (const x of hoy.pos) {
      if (!primera.has(x.id)) primera.set(x.id, hoy.fecha);
      const p = Number(x.p), fac = Number(x.fac) > 0 ? Number(x.fac) : 1;
      if (!(p > 0) || (x.mon === "ARS" && !(ccl > 0))) continue;
      deHoy.set(x.id, { p, fac, mon: x.mon, u: fac * (x.mon === "ARS" ? p / ccl : p), fecha: hoy.fecha, pag: x.pag });
    }
    if (i > 0) {
      let num = 0, den = 0;
      for (const x of f[i - 1].pos) {
        const id = x.id, q = Number(x.q);
        const a = ultimo.get(id), h = deHoy.get(id);
        if (!(q > 0) || !a || !h) continue;
        if (a.mon !== h.mon || a.fac !== h.fac) continue;
        // pagos pendientes de este bono: ni sumados ya, ni anteriores a tenerlo, ni de hace más de 10 días
        const hechos = cobrados.get(id) || new Set();
        const pend = new Map();
        const minimo = sumarDias(hoy.fecha, -10), maximo = sumarDias(hoy.fecha, 5), desde = primera.get(id) || "";
        for (const lista of [a.pag, h.pag]) {
          for (const par of (Array.isArray(lista) ? lista : [])) {
            const fp = String(par && par[0]), m = Number(par && par[1]);
            if (m > 0 && fp > desde && fp >= minimo && fp <= maximo && !hechos.has(fp)) pend.set(fp, m);
          }
        }
        let pendUSD = 0;
        pend.forEach(m => { pendUSD += h.fac * m; });
        const suma = pendUSD > 0 && a.u - h.u >= 0.5 * pendUSD;
        const valorHoy = h.u + (suma ? pendUSD : 0);
        if (suma) { pend.forEach((m, fp) => hechos.add(fp)); cobrados.set(id, hechos); }
        const salto = valorHoy / a.u;
        if ((salto > SALTO_MAX || salto < SALTO_MIN) && esSplit(f, i, id, h.p / a.p)) continue;
        den += q * a.u;
        num += q * valorHoy;
      }
      if (den > 0) idx *= num / den;
    }
    const s = Number(hoy.spy);
    if (s > 0) {
      if (ultSpy > 0) idxSpy *= s / ultSpy;
      ultSpy = s;
    }
    deHoy.forEach((v, id) => ultimo.set(id, v));
    puntos.push({ fecha: hoy.fecha, cartera: idx, spy: idxSpy });
  }
  return puntos;
}

/* Empalma la simulación y la serie real:
   - la simulación hasta el día anterior a la primera foto;
   - la real, escalada para seguir desde donde quedó la simulación;
   - si las fotos se cortaron, la simulación sigue desde la última foto. */
export function combinar(sim = [], real = []) {
  if (!real.length) return sim.map(x => ({ ...x, tipo: "sim" }));
  const alDia = fecha => { let r = null; for (const x of sim) { if (x.fecha <= fecha) r = x; else break; } return r; };
  const f0 = real[0].fecha, fz = real[real.length - 1].fecha;
  const e0 = alDia(f0);
  const k = e0 ? e0.cartera / 100 : 1, ks = e0 ? e0.spy / 100 : 1;
  const reales = real.map(x => ({ fecha: x.fecha, cartera: x.cartera * k, spy: x.spy * ks, tipo: "real" }));
  const out = [...sim.filter(x => x.fecha < f0).map(x => ({ ...x, tipo: "sim" })), ...reales];
  const ez = alDia(fz), zr = reales[reales.length - 1];
  if (ez) {
    const kz = zr.cartera / ez.cartera, kzs = zr.spy / ez.spy;
    sim.filter(x => x.fecha > fz).forEach(x => out.push({ fecha: x.fecha, cartera: x.cartera * kz, spy: x.spy * kzs, tipo: "sim" }));
  }
  return out;
}

/* Recorta desde una fecha y rebasa las dos curvas a 100 en el primer punto. */
export function recortar(puntos = [], desde = "") {
  const p = puntos.filter(x => x.fecha >= desde && x.cartera > 0 && x.spy > 0);
  if (!p.length) return [];
  const c0 = p[0].cartera, s0 = p[0].spy;
  return p.map(x => ({ ...x, cartera: x.cartera / c0 * 100, spy: x.spy / s0 * 100 }));
}

/* Rendimiento del período (en %) de cada curva y la diferencia en puntos. */
export function resumen(puntos = []) {
  if (puntos.length < 2) return null;
  const a = puntos[0], z = puntos[puntos.length - 1];
  const cartera = (z.cartera / a.cartera - 1) * 100, spy = (z.spy / a.spy - 1) * 100;
  return { cartera, spy, diferencia: cartera - spy, desde: a.fecha, hasta: z.fecha };
}

/* ── Contra qué se compara la cartera (Resumen del Panel v3) ─────────────────
   Cada índice se expresa en la MISMA moneda que la cartera y en base 100 al
   primer punto. Series: spy [[fecha, cierre, ..., sin dividendos]], ccl y mep
   [[fecha, venta]], merval [[fecha, cierre en pesos]], inflacion [[fin de mes,
   variación mensual %]].
   - S&P 500: en dólares tal cual; en pesos, por el CCL de cada día.
   - Merval: en pesos tal cual; en dólares, dividido el CCL o el MEP del día.
   - Dólar y la inflación argentina: solo tienen sentido contra una cartera en
     pesos. En dólares, "el dólar" es una línea plana y la inflación en pesos no
     se compara con nada: no se ofrecen. */
export const BENCHS = {
  SPY: { corto: "S&P 500", monedas: ["ARS", "CCL", "MEP"] },
  MERV: { corto: "Merval", monedas: ["ARS", "CCL", "MEP"] },
  CCL: { corto: "Dólar", monedas: ["ARS"] },
  INF: { corto: "Inflación", monedas: ["ARS"] },
};
export const nombreBench = (b, moneda) =>
  b === "SPY" ? "S&P 500" : b === "MERV" ? (moneda === "ARS" ? "Merval" : "Merval en dólares")
  : b === "CCL" ? "Dólar CCL" : b === "INF" ? "Inflación" : b;
export const benchsDisponibles = moneda => Object.keys(BENCHS).filter(k => BENCHS[k].monedas.includes(moneda));

/* índice de precios acumulado (base 100 un mes antes del primer dato) a una
   fecha. Dentro del mes se interpola de forma geométrica entre los cierres;
   después del último dato publicado queda en el último valor (no se inventa
   la inflación del mes en curso). null antes del primer dato. */
export function indiceInflacion(mensual = [], fecha) {
  const m = (mensual || []).filter(x => Array.isArray(x) && x[0] && isFinite(Number(x[1])))
    .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
  if (!m.length) return null;
  const t = s => Date.parse(String(s).slice(0, 10) + "T12:00:00Z");
  const f = t(fecha);
  let nivel = 100, ini = t(m[0][0]) - 30 * 864e5;
  if (f < ini) return null;
  for (const [fin, v] of m) {
    const tf = t(fin), k = 1 + Number(v) / 100;
    if (f <= tf) return nivel * Math.pow(k, Math.max(0, Math.min(1, (f - ini) / (tf - ini || 1))));
    nivel *= k; ini = tf;
  }
  return nivel;
}

/* valor "crudo" del índice elegido en la moneda elegida, a una fecha. null
   si falta cualquier dato de ese día (el punto no se dibuja). */
export function valorBench(b, moneda, fecha, s = {}) {
  const cambio = moneda === "MEP" ? valorAl(s.mep, fecha) : valorAl(s.ccl, fecha);
  if (b === "SPY") {
    const v = valorAl(s.spy, fecha, true);
    if (v == null) return null;
    if (moneda !== "ARS") return v;
    const c = valorAl(s.ccl, fecha);
    return c ? v * c : null;
  }
  if (b === "MERV") {
    const v = valorAl(s.merval, fecha);
    if (v == null) return null;
    if (moneda === "ARS") return v;
    return cambio ? v / cambio : null;
  }
  if (moneda !== "ARS") return null;
  if (b === "CCL") return valorAl(s.ccl, fecha);
  if (b === "INF") return indiceInflacion(s.inflacion, fecha);
  return null;
}

/* Pasa los puntos de la cartera (base 100, en dólares CCL) a otra moneda y les
   agrega el índice elegido, todo rebasado a 100 en el primer punto que tiene
   los dos datos. Para el MEP la cartera se calcula aparte (simular() con la
   serie del MEP): esto solo resuelve pesos (× CCL del día) y el índice. */
export function compararCon(puntos = [], { bench = "SPY", moneda = "CCL", series = {} } = {}) {
  const out = [];
  for (const x of puntos) {
    let c = x.cartera;
    if (moneda === "ARS") {
      const k = valorAl(series.ccl, x.fecha);
      if (!k) continue;
      c = c * k;
    }
    const b = valorBench(bench, moneda, x.fecha, series);
    if (!(c > 0) || !(b > 0)) continue;
    out.push({ ...x, cartera: c, bench: b });
  }
  if (!out.length) return [];
  const c0 = out[0].cartera, b0 = out[0].bench;
  return out.map(x => ({ ...x, cartera: x.cartera / c0 * 100, bench: x.bench / b0 * 100 }));
}
