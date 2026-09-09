// activos.js — UNA sola normalización de tickers para toda la web.
// Antes cada página tenía su propio mapa (PAM↔PAMP, YPF↔YPFD, .BA, -USD, +D)
// y se contradecían entre sí. Acá viven las reglas y el resto importa.
//
//   base('GGAL.BA')        -> 'GGAL'      quita sufijos de mercado
//   radarSym('PAM')        -> 'PAMP'      símbolo como figura en radar/latest
//   tickerFicha('PAMP.BA') -> 'PAM'       ticker de activo.html (null si no hay ficha)
//   esRentaFija('AL30D')   -> true        títulos públicos y letras
//   especieBono('AL30')    -> 'AL30D'     especie que abre bono.html (USD para soberanos)
//   linkDe('GGAL.BA')      -> 'activo.html?t=GGAL'
//   monedaProbable('AL30') -> 'ARS'       cuando precios/{tk} todavía no la trae
import { EMPRESAS } from './empresas.js?v=3';

// argentinas: la ficha y el precio en dólares usan el ADR de NYSE; el radar y
// BYMA usan el símbolo local
const LOCAL_A_ADR = { PAMP: 'PAM', YPFD: 'YPF' };
const ADR_A_LOCAL = { PAM: 'PAMP', YPF: 'YPFD' };

const FICHAS = new Set(EMPRESAS.map(e => String(e.ticker).toUpperCase()));
const NOMBRES = Object.fromEntries(EMPRESAS.map(e => [String(e.ticker).toUpperCase(), e.nombre]));

/* ticker sin sufijo de mercado: GGAL.BA -> GGAL, BTC-USD -> BTC, AL30D -> AL30D */
export function base(tk) {
  return String(tk || '').trim().toUpperCase().replace(/\.BA$/, '').replace(/-USD$/, '');
}

/* símbolo con el que aparece en radar/latest (PAMP, YPFD, BTC, ETH, GGAL...) */
export function radarSym(tk) {
  const b = base(tk);
  return ADR_A_LOCAL[b] || b;
}

/* ticker de la ficha (activo.html?t=) o null si Valtia no tiene ficha */
export function tickerFicha(tk) {
  const b = base(tk);
  const f = LOCAL_A_ADR[b] || b;
  return FICHAS.has(f) ? f : null;
}

const SECTORES = Object.fromEntries(EMPRESAS.map(e => [String(e.ticker).toUpperCase(), e.sector]));
const NOMBRE_SECTOR = { arg: 'Argentina', tech: 'Tecnología', consumo: 'Consumo',
                        fin: 'Financieras', salud: 'Salud', cripto: 'Cripto', etf: 'ETF' };

/* sector de la ficha (null si Valtia no lo cubre) */
export function sectorDe(tk, bonosSet) {
  if (esRentaFija(tk, bonosSet)) return 'Renta fija';
  const f = tickerFicha(tk);
  const s = f && SECTORES[f];
  return s ? (NOMBRE_SECTOR[s] || s) : null;
}

export function nombreDe(tk) {
  const f = tickerFicha(tk);
  return (f && NOMBRES[f]) || base(tk);
}

/* soberanos, Bopreal y letras. bonosSet (claves de bonosPanel.todos) manda;
   la regex es el respaldo cuando el panel todavía no cargó */
const RX_SOBERANO = /^(AL|GD|AE|AN|AO)\d{2}[CD]?$/;
const RX_BOPREAL = /^BP[A-Z0-9]{2,4}[CD]?$/;
const RX_LETRA = /^[STX]\d{2}[A-Z]\d[CD]?$/;
export function esRentaFija(tk, bonosSet) {
  const t = String(tk || '').trim().toUpperCase();
  if (!t || t.endsWith('.BA') || t.endsWith('-USD')) return false;
  if (bonosSet && bonosSet.size && bonosSet.has(t)) return true;
  return RX_SOBERANO.test(t) || RX_BOPREAL.test(t) || RX_LETRA.test(t);
}

/* la especie que abre bono.html: los soberanos/Bopreal se muestran en su
   versión en dólares (AL30 -> AL30D); las letras son una sola especie */
export function especieBono(tk) {
  const t = String(tk || '').trim().toUpperCase();
  if (RX_LETRA.test(t)) return t;
  if (/[CD]$/.test(t)) return t;
  return t + 'D';
}

/* la especie "par" de los flujos (bonosFlujos usa AL30, sin sufijo) */
export function parBono(tk) {
  const t = String(tk || '').trim().toUpperCase();
  return RX_LETRA.test(t) ? t : t.replace(/[CD]$/, '');
}

export function esCripto(tk) {
  const t = String(tk || '').trim().toUpperCase();
  return t.endsWith('-USD') || ['BTC', 'ETH'].includes(t);
}

/* a dónde lleva el ticker dentro de la web (o null si no hay página) */
export function linkDe(tk, bonosSet) {
  if (esRentaFija(tk, bonosSet)) return 'bono.html?e=' + encodeURIComponent(especieBono(tk));
  const f = tickerFicha(tk);
  return f ? 'activo.html?t=' + encodeURIComponent(f) : null;
}

/* moneda en la que cotiza, cuando precios/{tk} todavía no la trae */
export function monedaProbable(tk, bonosSet) {
  const t = String(tk || '').trim().toUpperCase();
  if (t.endsWith('.BA')) return 'ARS';
  if (esRentaFija(t, bonosSet)) return /[CD]$/.test(t) ? 'USD' : 'ARS';
  return 'USD';
}

/* ── desglose por período ────────────────────────────────────────────────
   Un solo lugar para las reglas de honestidad: si esto se escribe tres veces
   (ficha, cartera, panel), en alguna queda el número crudo sin su asterisco.

   dp  = doc desglosePeriodos/latest (variaciones ya calculadas por el sync)
   px  = doc precios/{ticker} (de ahí sale la variación del día)
   pos = {cantidad, precioCompra, fecha, factor} — opcional

   Reglas:
   - el "hoy" sale del ticker que la persona TIENE (el CEDEAR en pesos), no
     del ADR: son dos precios distintos;
   - si no hay serie del .BA se usa la del ADR y se dice "en dólares";
   - la plata solo se calcula cuando el período empieza DESPUÉS de la compra;
     si no, es la variación del activo y no "lo que ganaste". */
export const PERIODOS = [['dia', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'],
                         ['tresM', '3 meses'], ['ytd', 'En el año'],
                         ['anio', '1 año'], ['dosA', '2 años']];

export function desglose(ticker, dp, px, pos) {
  const t = String(ticker || '').toUpperCase();
  const propio = (dp || {})[t] || null;            // serie del ticker que tiene
  const f = tickerFicha(t);
  const adr = !propio && f ? (dp || {})[f] : null; // respaldo: el ADR en USD
  const d = propio || adr;
  const hoyPct = px && px.d != null ? Number(px.d) : null;
  const compra = pos && pos.fecha ? String(pos.fecha).slice(0, 10) : null;
  const valor = pos && px && px.precio != null
    ? (Number(pos.cantidad) || 0) * Number(px.precio) * (Number(pos.factor) > 0 ? Number(pos.factor) : 1)
    : null;
  const DIAS = { dia: 1, semana: 7, mes: 30, tresM: 91, ytd: null, anio: 365, dosA: 730 };
  const hoy = new Date(Date.now() - 3 * 3600e3);
  return PERIODOS.map(([k, label]) => {
    const pct = k === 'dia' ? hoyPct : (d ? d[k] : null);
    if (pct == null) {
      return { clave: k, label, pct: null,
               nota: d ? (d.desde ? 'la serie arranca el ' + d.desde.split('-').reverse().join('/') : 'sin serie')
                       : 'sin serie de precios' };
    }
    // ¿el período empieza antes de que lo comprara?
    let recorte = null;
    if (compra) {
      const ini = k === 'ytd' ? new Date(hoy.getFullYear(), 0, 1)
                              : new Date(hoy.getTime() - (DIAS[k] || 0) * 86400e3);
      if (new Date(compra) > ini) recorte = compra;
    }
    // La plata solo se afirma cuando SE SABE que la posición existía todo el
    // período. Sin fecha de compra no se sabe: ahí el número es la variación
    // del activo y decir "ganaste tanto" sería inventar (en la cartera real
    // del fondo esa cuenta sobreestima el resultado del año al doble).
    const plata = (valor != null && compra && !recorte && pct != null)
      ? valor - valor / (1 + pct / 100) : null;
    return { clave: k, label, pct, plata,
             enDolares: !propio && !!adr,
             nota: recorte ? 'lo compraste el ' + recorte.split('-').reverse().join('/')
                 : (!propio && adr) ? 'variación del ADR en dólares'
                 : !compra ? 'variación del activo (no sabemos desde cuándo lo tenés)' : null };
  });
}

/* Lo único que se puede afirmar como resultado propio: desde la compra. */
export function desdeLaCompra(pos, px) {
  if (!pos || !px || px.precio == null) return null;
  const pc = Number(pos.precioCompra) || 0;
  if (!(pc > 0)) return null;
  const fac = Number(pos.factor) > 0 ? Number(pos.factor) : 1;
  const cant = Number(pos.cantidad) || 0;
  const costo = cant * pc * fac, valor = cant * Number(px.precio) * fac;
  return { pct: (valor / costo - 1) * 100, plata: valor - costo, costo, valor,
           desde: pos.fecha ? String(pos.fecha).slice(0, 10) : null };
}

/* mercado según el ticker guardado: byma / ext / cripto / renta fija */
export function mercadoDe(tk, bonosSet) {
  const t = String(tk || '').trim().toUpperCase();
  if (esRentaFija(t, bonosSet)) return 'rf';
  if (t.endsWith('.BA')) return 'byma';
  if (esCripto(t)) return 'cripto';
  return 'ext';
}
