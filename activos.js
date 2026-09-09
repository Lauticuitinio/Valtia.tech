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

/* mercado según el ticker guardado: byma / ext / cripto / renta fija */
export function mercadoDe(tk, bonosSet) {
  const t = String(tk || '').trim().toUpperCase();
  if (esRentaFija(t, bonosSet)) return 'rf';
  if (t.endsWith('.BA')) return 'byma';
  if (esCripto(t)) return 'cripto';
  return 'ext';
}
