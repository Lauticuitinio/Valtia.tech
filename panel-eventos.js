// panel-eventos.js — la agenda del panel (Panel v3). La usan la pestaña Agenda y
// "Lo que viene en tus activos" del Resumen: una sola fuente, así los dos dicen lo
// mismo. Sin Firestore acá: los datos llegan por ctx (los mismos docs cacheados
// que usa el resto del panel).
//
// Un evento: { f: 'AAAA-MM-DD', hora: '' | 'HH:MM', mk: 'AR' | 'US', tipo, k, txt,
//              sub, tk: ticker de la cartera o null, mio: bool, href }
// tipo: balance · dividendo · cupon · vencimiento · licitacion · ipo · macro · rotacion
//
// Qué hay y qué no: resultados de empresas (doc calendario, fecha estimada por la
// empresa, sin hora), pagos de bonos (bonosFlujos), vencimientos de letras
// (bonosPanel.tasa_fija) y de la renta fija que el usuario tiene (mapa de
// vencimientos del pipeline). Dividendos, IPO, licitaciones y datos macro todavía
// no tienen fuente: los filtros existen, pero hoy no traen nada (y la pestaña lo dice).
import { EMPRESAS } from './empresas.js?v=3';
import { base, parBono, especieBono, esRentaFija, tickerFicha } from './activos.js?v=7';

/* rótulo y colores de cada tipo (los del prototipo) */
export const TIPOS = {
  balance: ['Balance', '#14213D', 'rgba(20,33,61,0.08)'],
  dividendo: ['Dividendo', '#1F7A4D', 'rgba(31,122,77,0.12)'],
  cupon: ['Cupón', '#1F7A4D', 'rgba(31,122,77,0.12)'],
  vencimiento: ['Vencimiento', '#8A6A2F', 'rgba(176,138,62,0.14)'],
  licitacion: ['Licitación', '#8A6A2F', 'rgba(176,138,62,0.14)'],
  ipo: ['IPO', '#B08A3E', '#F6EEDC'],
  macro: ['Macro', '#57534A', '#F0EDE5'],
  rotacion: ['Rotación', '#B08A3E', '#F6EEDC'],
};
// en el Resumen el balance se llama "Resultados" (así lo muestra el prototipo)
export const TIPO_RESUMEN = { balance: 'Resultados' };

const ARG = new Set(EMPRESAS.filter(e => e.sector === 'arg').map(e => e.ticker));
const fmt = (n, d = 2) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const entero = n => Math.round(Number(n) || 0).toLocaleString('es-AR');

/* todos los eventos entre `desde` y `hasta` (inclusive), ordenados por fecha.
   Cada fuente falla por su cuenta: si una no está, las otras siguen. */
export async function eventos(ctx, { desde, hasta } = {}) {
  const hoy = ctx.hoyAR();
  desde = desde || hoy;
  hasta = hasta || new Date(Date.parse(hoy + 'T12:00:00Z') + 120 * 864e5).toISOString().slice(0, 10);
  const enRango = f => f && f >= desde && f <= hasta;
  const [cal, fl, bp, vm, cc, bset] = await Promise.all([
    ctx.calendario().catch(() => []), ctx.flujos().catch(() => ({})), ctx.panelBonos().catch(() => ({})),
    ctx.vencMapa().catch(() => ({})), ctx.carteraCalc().catch(() => null), ctx.bonosSet().catch(() => new Set()),
  ]);
  const pos = (cc && cc.pos) || [];
  const set = bset || new Set();
  // lo que el usuario tiene: por ficha (acciones), por par (bonos) y por especie
  const fichas = new Map(), pares = new Map(), especies = new Map();
  pos.forEach(p => {
    const q = Number(p.cantidad) || 0;
    if (esRentaFija(p.ticker, set)) {
      const e = base(p.ticker), par = parBono(e);
      pares.set(par, (pares.get(par) || 0) + q);
      especies.set(e, (especies.get(e) || 0) + q);
    } else {
      const f = tickerFicha(p.ticker);
      if (f) fichas.set(f, (fichas.get(f) || 0) + q);
    }
  });
  const out = [];
  const yaVence = new Set();   // especies con el vencimiento ya puesto (para no repetir)

  // 1 · resultados de empresas
  (cal || []).forEach(e => {
    if (!enRango(e.fecha)) return;
    const q = fichas.get(e.ficha);
    out.push({ f: e.fecha, hora: '', mk: ARG.has(e.ficha) ? 'AR' : 'US', tipo: 'balance',
      k: e.nombre || e.sym, txt: 'presenta resultados del trimestre.',
      sub: q ? `fecha estimada por la empresa · tenés ${entero(q)} ${q === 1 ? 'acción' : 'acciones'}` : 'fecha estimada por la empresa',
      tk: q ? e.ficha : null, mio: !!q, href: e.ficha ? 'activo.html?t=' + encodeURIComponent(e.ficha) : null });
  });

  // 2 · pagos de bonos (renta y amortización). El pago del día del vencimiento se
  //     anuncia como vencimiento, una sola vez.
  Object.keys(fl || {}).forEach(par => {
    const d = fl[par] || {};
    const esp = especieBono(par), venc = ctx.vencimientoDe(esp, vm);
    const vn = pares.get(parBono(par)) || 0;
    (d.flujos || []).forEach(([f, monto]) => {
      if (!enRango(f)) return;
      const esVenc = venc && f === venc;
      if (esVenc) yaVence.add(parBono(par));
      out.push({ f, hora: '', mk: 'AR', tipo: esVenc ? 'vencimiento' : 'cupon',
        k: esp, txt: esVenc ? `vence: último pago de US$ ${fmt(monto)} por cada 100 VN.` : `paga US$ ${fmt(monto)} por cada 100 VN.`,
        sub: vn ? `≈ US$${entero(vn * Number(monto) / 100)} por tus ${entero(vn)} VN (estimado)`
                : `bono ${d.ley === 'NY' ? 'ley Nueva York' : 'ley Argentina'} · renta y/o amortización`,
        tk: vn ? esp : null, mio: !!vn, href: 'bono.html?e=' + encodeURIComponent(esp) });
    });
  });

  // 3 · letras a tasa fija
  ((bp && bp.tasa_fija) || []).forEach(l => {
    const f = String(l.vence || '').slice(0, 10);
    if (!enRango(f) || !l.s) return;
    const vn = especies.get(l.s) || 0;
    yaVence.add(parBono(l.s));
    out.push({ f, hora: '', mk: 'AR', tipo: 'vencimiento', k: l.s,
      txt: l.vpv ? `vence y paga $ ${fmt(l.vpv)} por cada 100 VN${l.vpv_estimado ? ' (estimado)' : ''}.` : 'vence.',
      sub: vn && l.vpv ? `te acreditan ≈ $ ${entero(vn * Number(l.vpv) / 100)} por tus ${entero(vn)} VN`
         : l.tirea != null ? `letra a tasa fija · TIREA ${String(l.tirea).replace('.', ',')}%` : 'letra a tasa fija',
      tk: vn ? l.s : null, mio: !!vn, href: 'bono.html?e=' + encodeURIComponent(l.s) });
  });

  // 4 · el resto de la renta fija que el usuario tiene (CER, dólar linked): se sabe
  //     cuándo vence, no cuánto paga
  especies.forEach((vn, esp) => {
    const par = parBono(esp);
    if (yaVence.has(par)) return;
    const f = ctx.vencimientoDe(esp, vm);
    if (!enRango(f)) return;
    yaVence.add(par);
    out.push({ f, hora: '', mk: 'AR', tipo: 'vencimiento', k: esp, txt: 'vence: es el último pago.',
      sub: `tus ${entero(vn)} VN`, tk: esp, mio: true, href: 'bono.html?e=' + encodeURIComponent(esp) });
  });

  return out.sort((a, b) => a.f.localeCompare(b.f) || (b.mio ? 1 : 0) - (a.mio ? 1 : 0) || String(a.k).localeCompare(String(b.k)));
}
