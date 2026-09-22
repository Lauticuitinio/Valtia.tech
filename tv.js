// tv.js — el único lugar de la web que dibuja widgets de TradingView.
//
// QUÉ HACE
// Una función, widget(destino, tipo, config), que arma el embebido oficial de
// TradingView con la piel del sitio (navy + dorado, Playfair + IBM Plex) y se
// ocupa de las cuatro cosas que en las páginas se hacían mal o no se hacían:
//
// 1) TEMA. Lee document.documentElement.dataset.theme (el mismo que index.html
//    guarda en localStorage 'valtia-tema') y le pasa al widget colorTheme y
//    backgroundColor. Si el visitante cambia de tema, un MutationObserver sobre
//    el atributo data-theme del <html> vuelve a dibujar los widgets ya pintados:
//    TradingView no tiene API para cambiarle el tema a un iframe vivo, así que
//    la única forma honesta es rehacerlo.
// 2) CARGA DIFERIDA. Cada widget se dibuja recién cuando entra en pantalla
//    (IntersectionObserver, con 240px de anticipo). Una página con diez widgets
//    no levanta diez iframes de una: levanta los que se ven.
// 3) SE CAYÓ Y NO ROMPE NADA. Si a los 12 segundos el iframe no apareció (o el
//    script dio error), aparece un cartel discreto en el hueco del widget y la
//    página sigue andando. Si el iframe aparece tarde, el cartel se va solo.
// 4) ATRIBUCIÓN. SIEMPRE se agrega el div tradingview-widget-copyright con el
//    link a TradingView. Los widgets son gratis y están permitidos en sitios
//    comerciales justamente porque queda esa atribución: NO se saca, NO se
//    esconde con display:none y NO se le cambia el link. Si alguien la borra,
//    estamos usando los widgets fuera de los términos de TradingView.
//
// Además pasa locale 'es' y, donde el widget lo acepta, la tipografía del sitio
// (fontFamily: IBM Plex Sans). Lo que venga en `config` desde la página siempre
// gana: acá sólo se completan los huecos.
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
// No lee NADA de adentro del iframe: es otro dominio (cross-origin) y además los
// términos de TradingView prohíben extraer los datos del embebido. Los widgets
// son para MOSTRAR. Si una página necesita números para calcular, los saca de
// Firestore o de los módulos propios (fx.js, activos.js), nunca de acá.
// Lo único que este módulo mira del DOM del widget es si existe el <iframe>,
// para saber si cargó. Eso es el contenedor, no el contenido.
//
// SÍMBOLOS PROBADOS A MANO (22/09/2026), TODOS EN BYMA (prefijo BCBA:)
// · Acciones en pesos: GGAL, YPFD, PAMP, BMA, TXAR, ALUA, COME, CRES.
// · CEDEARs: AAPL, NVDA (el nombre del papel ya trae el ratio de conversión).
// · Bonos: AL30, AL30D, GD30, GD30D. Letra: S30N6. Bopreal: BPOA7. ON: YMCIO.
// · Índices: IMV (S&P MERVAL) e IAB. OJO: IAB es el "S&P/BYMA Índice General",
//   NO el "Índice Argentina Bursátil" (ese nombre no existe; ya se coló una vez
//   en mercados.html). Comprobado en es.tradingview.com/symbols/BCBA-IAB/.
// Segunda tanda, comprobada el 22/09/2026 dibujando el market-quotes y viendo
// que cada fila trajera precio (si el símbolo no existe, la fila no aparece):
// · Acciones: EDN, CEPU, TGSU2, TGNO4, LOMA, MIRG, SUPV, BBAR, VALO, TRAN,
//   IRSA, METR, AGRO, BYMA.
// · CEDEARs: MSFT, GOOGL, AMZN, META, TSLA, KO, JNJ, MELI, BRKB, DISN, VIST.
// · Bonos en pesos: AE38 (Bonar 2038) y GD35 (Global 2035).
// NO ANDAN los CER (BCBA:TX26, BCBA:TZXD6): TradingView no los tiene. No los
// uses; para esos hay que mostrar el dato propio. Tampoco TVC:DXY ni TVC:US10Y:
// el embebido los levanta vacíos.
// El screener con {"market":"argentina"} lista 1515 especies argentinas con
// filtros; también existen "america", "crypto" y "forex".

const BASE = 'https://s3.tradingview.com/external-embedding/embed-widget-';

// Los dieciséis widgets del catálogo. La clave es el `tipo` que recibe widget()
// y también el nombre del script: embed-widget-<tipo>.js.
const ALTO_POR_DEFECTO = {
  'symbol-info': 170,
  'advanced-chart': 500,
  'symbol-overview': 400,
  'financials': 550,
  'technical-analysis': 450,
  'market-quotes': 500,
  'screener': 550,
  'hotlists': 450,
  'stock-heatmap': 520,
  'crypto-coins-heatmap': 520,
  'etf-heatmap': 520,
  'ticker-tape': 78,
  'single-ticker': 100,
  'market-overview': 460,
  'events': 550,
  'forex-cross-rates': 400,
};

export const TIPOS = Object.keys(ALTO_POR_DEFECTO);

// La nota legal corta que las páginas muestran al pie del bloque de widgets.
export const NOTA_LEGAL =
  'Los datos de mercado los provee TradingView, pueden tener demora y son sólo ' +
  'informativos: no son asesoramiento financiero.';

// Para que una página pueda armar ejemplos sin volver a probar símbolo por símbolo.
export const SIMBOLOS_PROBADOS = Object.freeze({
  acciones: ['BCBA:GGAL', 'BCBA:YPFD', 'BCBA:PAMP', 'BCBA:BMA', 'BCBA:TXAR', 'BCBA:ALUA', 'BCBA:COME', 'BCBA:CRES',
    'BCBA:EDN', 'BCBA:CEPU', 'BCBA:TGSU2', 'BCBA:TGNO4', 'BCBA:LOMA', 'BCBA:MIRG', 'BCBA:SUPV', 'BCBA:BBAR',
    'BCBA:VALO', 'BCBA:TRAN', 'BCBA:IRSA', 'BCBA:METR', 'BCBA:AGRO', 'BCBA:BYMA'],
  cedears: ['BCBA:AAPL', 'BCBA:NVDA', 'BCBA:MSFT', 'BCBA:GOOGL', 'BCBA:AMZN', 'BCBA:META', 'BCBA:TSLA',
    'BCBA:KO', 'BCBA:JNJ', 'BCBA:MELI', 'BCBA:BRKB', 'BCBA:DISN', 'BCBA:VIST'],
  bonos: ['BCBA:AL30', 'BCBA:AL30D', 'BCBA:GD30', 'BCBA:GD30D', 'BCBA:AE38', 'BCBA:GD35'],
  letras: ['BCBA:S30N6'],
  bopreal: ['BCBA:BPOA7'],
  obligaciones: ['BCBA:YMCIO'],
  // IAB = S&P/BYMA Índice General (no "Índice Argentina Bursátil").
  indices: ['BCBA:IMV', 'BCBA:IAB'],
  // Dejado a la vista para que nadie los vuelva a intentar: o no existen en
  // TradingView, o existen pero el embebido los muestra vacíos.
  noAndan: ['BCBA:TX26', 'BCBA:TZXD6', 'TVC:DXY', 'TVC:US10Y'],
});

const ESPERA_MS = 12000;   // cuánto le damos a TradingView antes del cartel
const ANTICIPO = '240px';  // cuánto antes de entrar en pantalla lo dibujamos
const TIPOGRAFIA = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";

// ── piel ────────────────────────────────────────────────────────────────────
// Un solo <style> para todas las páginas. Usa las variables del sitio con
// respaldo en los colores literales, porque hay páginas (calendario.html) que
// sólo definen el tema claro.
const CSS = [
  '.vtv{position:relative;width:100%;max-width:100%;margin:0 0 24px;',
  'background:var(--card,#fff);border:1px solid var(--border,var(--line,#E7E3DA));overflow:hidden}',
  '.vtv-cabezal{display:flex;align-items:center;justify-content:space-between;gap:6px 14px;',
  'flex-wrap:wrap;padding:13px 18px;border-bottom:1px solid var(--border,var(--line,#E7E3DA))}',
  ".vtv-titulo{font:700 11.5px " + TIPOGRAFIA + ";letter-spacing:.08em;text-transform:uppercase;",
  'color:var(--text,var(--ink,#101010))}',
  ".vtv-fuente{font:400 10.5px " + TIPOGRAFIA + ";color:var(--muted,var(--mut,#8B8375))}",
  '.vtv-slot{position:relative;width:100%;max-width:100%}',
  '.vtv-slot iframe{max-width:100%!important;border:0}',
  // La atribución de TradingView. Discreta, sí; invisible, NUNCA.
  '.vtv .tradingview-widget-copyright{padding:7px 18px 9px;',
  "font:400 10.5px " + TIPOGRAFIA + ';line-height:1.5;',
  'color:var(--muted,var(--mut,#8B8375));border-top:1px solid var(--border,var(--line,#E7E3DA))}',
  '.vtv .tradingview-widget-copyright a{color:var(--gold,#B08A3E);text-decoration:none}',
  '.vtv .tradingview-widget-copyright a:hover{color:var(--gold2,#8A6A2F);text-decoration:underline}',
  '.vtv .tradingview-widget-copyright .blue-text{color:inherit}',
  // cartel de "no cargó"
  '.vtv-aviso{display:flex;align-items:center;justify-content:center;gap:10px 14px;flex-wrap:wrap;',
  'text-align:center;padding:26px 18px;border:1px dashed var(--border,var(--line,#E7E3DA));',
  "margin:14px 18px;font:400 12.5px " + TIPOGRAFIA + ';line-height:1.7;',
  'color:var(--sub,#57534A)}',
  ".vtv-aviso button{font:600 10.5px " + TIPOGRAFIA + ';letter-spacing:.08em;text-transform:uppercase;',
  'padding:7px 14px;border:1px solid var(--border,var(--line,#E7E3DA));background:transparent;',
  'color:var(--text,var(--ink,#101010));cursor:pointer}',
  '.vtv-aviso button:hover{border-color:var(--gold,#B08A3E);color:var(--gold,#B08A3E)}',
  ".vtv-nota{font:400 11.5px " + TIPOGRAFIA + ';line-height:1.7;color:var(--muted,var(--mut,#8B8375));',
  'margin:10px 0 0;max-width:70ch}',
  // a 375px el cabezal y la atribución respiran menos, pero nada se sale de pantalla
  '@media(max-width:480px){.vtv-cabezal{padding:11px 13px}',
  '.vtv .tradingview-widget-copyright{padding:7px 13px 9px}',
  '.vtv-aviso{margin:12px 13px;padding:22px 13px}}',
].join('');

function piel() {
  if (typeof document === 'undefined' || document.getElementById('vtv-estilos')) return;
  const st = document.createElement('style');
  st.id = 'vtv-estilos';
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

// ── tema ────────────────────────────────────────────────────────────────────
function temaActual() {
  const t = (document.documentElement.dataset.theme || '').toLowerCase();
  return t === 'dark' ? 'dark' : 'light';
}

// Los colores que le pasamos al widget son los del sitio, no los de TradingView.
const PALETA = {
  light: { fondo: '#FFFFFF', grilla: '#E7E3DA' },
  dark: { fondo: '#0E1830', grilla: '#1B2748' },
};

// ── registro de widgets vivos ───────────────────────────────────────────────
const vivos = new Set();
let mirandoTema = false;

function mirarTema() {
  if (mirandoTema || typeof MutationObserver === 'undefined') return;
  mirandoTema = true;
  let anterior = temaActual();
  // index.html cambia html.dataset.theme (y lo guarda en 'valtia-tema'); acá nos
  // enteramos por el atributo, que es lo que realmente cambia en el DOM.
  new MutationObserver(() => {
    const ahora = temaActual();
    if (ahora === anterior) return;
    anterior = ahora;
    vivos.forEach(w => { if (w.dibujado) dibujar(w); });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

// ── atribución ──────────────────────────────────────────────────────────────
// Devuelve el div tradingview-widget-copyright tal como lo pide el embebido.
// Cuando el widget es de un símbolo, el link apunta a la ficha de ese símbolo
// (es lo que hace el embebido oficial); si no, al home de TradingView.
function atribucion(config) {
  const cont = document.createElement('div');
  cont.className = 'tradingview-widget-copyright';
  const a = document.createElement('a');
  a.rel = 'noopener nofollow';
  a.target = '_blank';   // link externo: acá sí corresponde
  const simbolo = typeof config.symbol === 'string' ? config.symbol.trim() : '';
  if (simbolo) {
    a.href = 'https://es.tradingview.com/symbols/' + encodeURIComponent(simbolo.replace(/:/g, '-')) + '/';
    a.innerHTML = '<span class="blue-text">' + escapar(simbolo.split(':').pop()) + ' por TradingView</span>';
  } else {
    a.href = 'https://es.tradingview.com/';
    a.innerHTML = '<span class="blue-text">Seguí los mercados en TradingView</span>';
  }
  cont.appendChild(a);
  return cont;
}

function escapar(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ── armado del widget ───────────────────────────────────────────────────────
function configFinal(tipo, config) {
  const tema = temaActual();
  const p = PALETA[tema];
  // Copia: nunca se toca el objeto que mandó la página.
  const c = Object.assign({}, config);
  if (c.colorTheme === undefined) c.colorTheme = tema;
  if (c.backgroundColor === undefined && c.isTransparent !== true) c.backgroundColor = p.fondo;
  if (c.gridColor === undefined) c.gridColor = p.grilla;
  if (c.locale === undefined) c.locale = 'es';
  // Los widgets que no soportan fontFamily ignoran la clave sin romperse.
  if (c.fontFamily === undefined) c.fontFamily = TIPOGRAFIA;
  if (c.width === undefined && c.autosize !== true) c.width = '100%';
  if (c.height === undefined && c.autosize !== true) c.height = String(ALTO_POR_DEFECTO[tipo] || 400);
  return c;
}

function dibujar(w) {
  limpiar(w);
  const c = configFinal(w.tipo, w.config);

  const slot = w.slot;
  slot.innerHTML = '';
  const alto = w.alto || (c.autosize === true ? '100%' : (ALTO_POR_DEFECTO[w.tipo] || 400) + 'px');
  slot.style.height = typeof alto === 'number' ? alto + 'px' : alto;

  // Estructura exacta que pide TradingView: contenedor > hueco + script + atribución.
  const cont = document.createElement('div');
  cont.className = 'tradingview-widget-container';
  cont.style.height = '100%';
  const hueco = document.createElement('div');
  hueco.className = 'tradingview-widget-container__widget';
  hueco.style.height = '100%';
  cont.appendChild(hueco);

  // El JSON va como TEXTO adentro del <script>, y el script hay que crearlo con
  // createElement: si se arma con innerHTML, el navegador no lo ejecuta.
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.async = true;
  s.src = BASE + w.tipo + '.js';
  s.text = JSON.stringify(c);
  s.addEventListener('error', () => avisar(w));
  cont.appendChild(s);

  slot.appendChild(cont);
  // La atribución va afuera del slot para que el iframe no la tape nunca.
  w.marco.insertBefore(atribucion(c), w.pieDesde);
  w.dibujado = true;

  // ¿Cargó? Alcanza con ver si apareció el <iframe> (no miramos adentro: es
  // otro dominio y está prohibido por los términos de TradingView).
  if (slot.querySelector('iframe')) return;
  if (typeof MutationObserver !== 'undefined') {
    w.obsCarga = new MutationObserver(() => {
      if (!slot.querySelector('iframe')) return;
      w.obsCarga.disconnect();
      w.obsCarga = null;
      clearTimeout(w.reloj);
      w.reloj = null;
      const aviso = w.marco.querySelector('.vtv-aviso');
      if (aviso) aviso.remove();   // llegó tarde, pero llegó
    });
    w.obsCarga.observe(slot, { childList: true, subtree: true });
  }
  w.reloj = setTimeout(() => { if (!slot.querySelector('iframe')) avisar(w); }, ESPERA_MS);
}

function avisar(w) {
  if (w.marco.querySelector('.vtv-aviso')) return;
  const box = document.createElement('div');
  box.className = 'vtv-aviso';
  box.setAttribute('role', 'status');
  const txt = document.createElement('span');
  txt.textContent = 'TradingView no respondió; probá recargar.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Probar de nuevo';
  btn.addEventListener('click', () => { box.remove(); dibujar(w); });
  box.appendChild(txt);
  box.appendChild(btn);
  w.marco.insertBefore(box, w.pieDesde);
  // El hueco vacío no tiene por qué seguir ocupando media pantalla.
  w.slot.style.height = '0px';
}

function limpiar(w) {
  if (w.reloj) { clearTimeout(w.reloj); w.reloj = null; }
  if (w.obsCarga) { w.obsCarga.disconnect(); w.obsCarga = null; }
  const aviso = w.marco.querySelector('.vtv-aviso');
  if (aviso) aviso.remove();
  const copia = w.marco.querySelector('.tradingview-widget-copyright');
  if (copia) copia.remove();
}

// ── API ─────────────────────────────────────────────────────────────────────
/**
 * Dibuja un widget de TradingView con la piel del sitio.
 *
 * @param {Element|string} destino  nodo o selector donde va el widget.
 * @param {string} tipo             uno de TIPOS ('advanced-chart', 'screener', …).
 * @param {object} [config]         el JSON de configuración de TradingView tal
 *                                  cual lo documenta ellos. Lo que pongas acá
 *                                  gana sobre los valores del sitio.
 * @param {object} [opciones]       { titulo, fuente, alto }: el cabezal editorial
 *                                  y la altura del hueco. Nada de esto viaja a
 *                                  TradingView.
 * @returns {{marco:Element, redibujar:Function, quitar:Function}|null}
 *
 * Ejemplo:
 *   import { widget, NOTA_LEGAL } from './tv.js';
 *   widget('#grafico', 'advanced-chart', { symbol: 'BCBA:GGAL', interval: 'D' },
 *          { titulo: 'Galicia', fuente: 'TradingView · BYMA', alto: 460 });
 */
export function widget(destino, tipo, config, opciones) {
  if (typeof document === 'undefined') return null;
  const host = typeof destino === 'string' ? document.querySelector(destino) : destino;
  if (!host || !host.appendChild) {
    console.warn('[tv.js] no encontré el destino del widget:', destino);
    return null;
  }
  if (!ALTO_POR_DEFECTO[tipo]) {
    console.warn('[tv.js] tipo de widget desconocido:', tipo, '— los válidos son', TIPOS.join(', '));
    return null;
  }

  piel();
  mirarTema();

  const op = opciones || {};
  const marco = document.createElement('div');
  marco.className = 'vtv';

  if (op.titulo || op.fuente) {
    const cab = document.createElement('div');
    cab.className = 'vtv-cabezal';
    const t = document.createElement('span');
    t.className = 'vtv-titulo';
    t.textContent = op.titulo || '';
    const f = document.createElement('span');
    f.className = 'vtv-fuente';
    f.textContent = op.fuente || 'TradingView';
    cab.appendChild(t);
    cab.appendChild(f);
    marco.appendChild(cab);
  }

  const slot = document.createElement('div');
  slot.className = 'vtv-slot';
  marco.appendChild(slot);
  // Marca dónde termina el widget y empieza el pie (atribución / avisos).
  const pieDesde = document.createComment('vtv-pie');
  marco.appendChild(pieDesde);
  host.appendChild(marco);

  const w = {
    tipo, config: config || {}, marco, slot, pieDesde,
    alto: op.alto, dibujado: false, reloj: null, obsCarga: null, obsVista: null,
  };
  vivos.add(w);

  // Recién cuando entra en pantalla. Sin IntersectionObserver (navegador viejo),
  // se dibuja de una: peor para la carga, pero se ve.
  if (typeof IntersectionObserver === 'undefined') {
    dibujar(w);
  } else {
    w.obsVista = new IntersectionObserver(entradas => {
      if (!entradas.some(e => e.isIntersecting)) return;
      w.obsVista.disconnect();
      w.obsVista = null;
      dibujar(w);
    }, { rootMargin: ANTICIPO });
    w.obsVista.observe(marco);
  }

  return {
    marco,
    redibujar: () => dibujar(w),
    quitar: () => {
      limpiar(w);
      if (w.obsVista) { w.obsVista.disconnect(); w.obsVista = null; }
      vivos.delete(w);
      marco.remove();
    },
  };
}

/**
 * Vuelve a dibujar todos los widgets ya pintados. Sirve si una página cambia el
 * tema por su cuenta sin tocar el atributo data-theme del <html>.
 */
export function redibujarTodo() {
  vivos.forEach(w => { if (w.dibujado) dibujar(w); });
}

/**
 * Atajo para el pie de página: mete la NOTA_LEGAL con la tipografía del sitio.
 * @param {Element|string} destino
 */
export function notaLegal(destino) {
  if (typeof document === 'undefined') return null;
  const host = typeof destino === 'string' ? document.querySelector(destino) : destino;
  if (!host || !host.appendChild) return null;
  piel();
  const p = document.createElement('p');
  p.className = 'vtv-nota';
  p.textContent = NOTA_LEGAL;
  host.appendChild(p);
  return p;
}
