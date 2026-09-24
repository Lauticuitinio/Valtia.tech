// tipos-activo.js — UN solo criterio para decir qué tipo de activo es cada ticker.
// Mi cartera, el Resumen y Movimientos lo importan de acá para que el mismo activo
// no sea "CEDEAR" en una pestaña y "Acción" en otra. Módulo puro: sin Firestore
// ni DOM, así se prueba con node (scripts/test-tipos.mjs).
//
//   tipoActivo('GGAL.BA')  -> { k:'accion', n:'Acción', grupo:'Acciones', mercado:'byma', sub:'Acción · BYMA' }
//   tipoActivo('NVDA.BA')  -> { k:'cedear', ... }        empresa de EE.UU. con ficha, comprada en BYMA
//   tipoActivo('AL30')     -> { k:'bono', ... }          renta fija que no es letra
//   tipoActivo('S30O6')    -> { k:'letra', ... }         por bonosPanel.tasa_fija o por la forma del nombre
//   tipoActivo('BTC-USD')  -> { k:'cripto', ... }
//   tipoActivo('SPY')      -> { k:'etf', ... }           exterior, sector ETF de la ficha
//   tipoActivo('AAPL')     -> { k:'accion', mercado:'ext', ... }
//   tipoActivo('XXXX.BA')  -> { k:'otro', n:'BYMA', ... } sin ficha ni catálogo NO se afirma que es CEDEAR
//   tipoActivo('T15D5')    -> { k:'bono', ... }          Boncap: bono aunque el panel lo liste en tasa_fija
//   tipoActivo('')         -> { k:'otro', n:'Otro', mercado:'', sub:'' }  sin ticker no se afirma nada
//
// El ratio del CEDEAR no se muestra en ningún lado: no existe el dato.
import { base, esRentaFija, tickerFicha, sectorDe, esCripto } from './activos.js?v=7';

// orden en que se listan los grupos (clave, título)
export const GRUPOS_TIPO = [['cedear', 'CEDEARs'], ['accion', 'Acciones'], ['etf', 'ETFs'], ['bono', 'Bonos'],
                            ['letra', 'Letras'], ['cripto', 'Cripto'], ['otro', 'Otros']];
// clase gruesa: renta variable, renta fija o cripto
export const CLASE_TIPO = { cedear: 'rv', accion: 'rv', etf: 'rv', bono: 'rf', letra: 'rf', cripto: 'cripto', otro: 'rv' };
// letras del Tesoro por la forma del nombre: S30O6 (Lecap), X18D6 (Lecer). Las T (Boncap) son bonos.
export const RX_LETRA = /^[SX]\d{2}[A-Z]\d{1,2}$/;

const TIPOS = {
  letra:     { k: 'letra',  n: 'Letra',  grupo: 'Letras',   mercado: 'rf',     sub: 'Letra · BYMA · por 100 VN' },
  bono:      { k: 'bono',   n: 'Bono',   grupo: 'Bonos',    mercado: 'rf',     sub: 'Bono · BYMA · por 100 VN' },
  cripto:    { k: 'cripto', n: 'Cripto', grupo: 'Cripto',   mercado: 'cripto', sub: 'Cripto · US$' },
  accionAr:  { k: 'accion', n: 'Acción', grupo: 'Acciones', mercado: 'byma',   sub: 'Acción · BYMA' },
  cedear:    { k: 'cedear', n: 'CEDEAR', grupo: 'CEDEARs',  mercado: 'byma',   sub: 'CEDEAR · BYMA' },
  etfByma:   { k: 'etf',    n: 'ETF',    grupo: 'ETFs',     mercado: 'byma',   sub: 'ETF · BYMA' },
  otro:      { k: 'otro',   n: 'BYMA',   grupo: 'Otros',    mercado: 'byma',   sub: 'BYMA' },
  // sin ticker: no se afirma mercado ni tipo
  vacio:     { k: 'otro',   n: 'Otro',   grupo: 'Otros',    mercado: '',       sub: '' },
  etf:       { k: 'etf',    n: 'ETF',    grupo: 'ETFs',     mercado: 'ext',    sub: 'ETF · NYSE/Nasdaq · US$' },
  accionExt: { k: 'accion', n: 'Acción', grupo: 'Acciones', mercado: 'ext',    sub: 'Acción · NYSE/Nasdaq · US$' },
};
const tipo = k => ({ ...TIPOS[k] });
// lo que dice el catálogo (catalogo-activos.js, entrada.t) para un .BA
const POR_CATALOGO_BYMA = { cedear: 'cedear', accion_us: 'cedear', accion_ar: 'accionAr', etf: 'etfByma', bono: 'bono', letra: 'letra' };

/* bonos: Set con las claves de bonosPanel.todos · panel: el doc bonosPanel/latest
   (se mira tasa_fija, [{ s, vence, ... }]) · catalogo: función sym => entrada|null,
   con entrada.t en cedear|accion_ar|accion_us|etf|bono|letra (opcional). */
export function tipoActivo(ticker, { bonos = new Set(), panel = null, catalogo = null } = {}) {
  const t = String(ticker || '').trim().toUpperCase();
  // sin ticker no hay nada que afirmar: ni "BYMA" ni "acción del exterior"
  if (!t) return tipo('vacio');
  const cat = typeof catalogo === 'function' ? (catalogo(t) || catalogo(base(t)) || null) : null;
  // 1 · renta fija: letra si tiene forma de letra (S.../X...) o si el panel de bonos
  //     la lista a tasa fija. OJO: esa sección mezcla Lecap con Boncap (bono.html la
  //     titula "Letra / Boncap"), y los T... son bonos aunque estén ahí
  if (esRentaFija(t, bonos)) {
    const esp = base(t);
    const tf = panel && Array.isArray(panel.tasa_fija) ? panel.tasa_fija : [];
    const enTasaFija = tf.some(l => l && String(l.s || '').trim().toUpperCase() === esp);
    const letra = RX_LETRA.test(esp) || (enTasaFija && !/^T/.test(esp));
    return tipo(letra ? 'letra' : 'bono');
  }
  // 2 · cripto: por el sufijo -USD (así las guarda Mi cartera), BTC/ETH a secas,
  //     o porque el catálogo lo dice (entrada.t === 'cripto')
  if (esCripto(t) || (cat && cat.t === 'cripto')) return tipo('cripto');
  // 3 · BYMA: acción argentina (sector de la ficha), CEDEAR (empresa de EE.UU. con
  //     ficha), lo que diga el catálogo, y si nada aplica, "BYMA" a secas
  if (t.endsWith('.BA')) {
    if (sectorDe(t) === 'Argentina') return tipo('accionAr');
    if (tickerFicha(t)) return tipo('cedear');
    const k = cat && POR_CATALOGO_BYMA[cat.t];
    return tipo(k || 'otro');
  }
  // 4 · exterior: ETF por el sector de la ficha o por el catálogo; si no, acción
  if (sectorDe(t) === 'ETF' || (cat && cat.t === 'etf')) return tipo('etf');
  return tipo('accionExt');
}

/* las letras del ícono redondo del ticker (GGAL.BA -> GGAL, BTC-USD -> BTC) */
export const iniciales = tk => base(tk).slice(0, 4);
