// informe-graficos.js — los gráficos de adentro de los informes, dibujados con datos reales.
// Pedido de Lauti del 05/10/2026. Van adentro del informe, entre el encabezado y el texto.
// (La portada NO se dibuja acá: ahí van fotos.)
//
// Dos piezas, las dos SVG o HTML hechos a mano (sin librerías ni imágenes externas):
//   figuraDesde()      la acción contra su índice desde el día en que se publicó el
//                      informe, las dos arrancando en cero
//   figuraFamilia()    los números de la empresa al lado de la mediana de su familia en
//                      el radar
//
// Son funciones puras: reciben los datos y devuelven texto. No leen Firestore ni tocan
// la página; quien las llama (activo.html) les pasa lo que ya bajó. Si los datos no
// alcanzan devuelven '' y no se muestra nada: nunca se dibuja un gráfico inventado.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => v == null || v === '' || typeof v === 'boolean' || !isFinite(Number(v)) ? null : Number(v);
const pctTxt = (n, d = 1) => (n >= 0 ? '+' : '−') + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const diaMs = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z').getTime();
const fCorta = iso => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d && m ? `${d}/${m}/${a}` : ''; };

/* Las filas del histórico tal como están en historialInformes/{TICKER}:
     [fecha, cierre ajustado, apertura, máximo, mínimo, volumen, cierre real]
   → [{ f, c }] con el cierre REAL (el índice 6; los docs viejos traen solo [fecha, cierre]).
   Es la misma regla que usan informes.html (cierreEn) y activo.html (filaReal). */
export function filasDe(serie) {
  return (Array.isArray(serie) ? serie : [])
    .filter(Array.isArray)
    .map(p => ({ f: String(p[0]).slice(0, 10), c: Number(p.length > 6 && p[6] != null ? p[6] : p[1]) }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.f) && isFinite(r.c) && r.c > 0);
}

/* ───────────────────────── adentro del informe ───────────────────────── */
export const CSS_FIGURAS = `
.inf-figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:14px;margin:22px 0 6px}
.inf-fig{margin:0;background:#fff;border:1px solid #E7E3DA;border-radius:10px;padding:16px 18px;min-width:0}
.inf-fig figcaption{font:600 15px 'IBM Plex Sans',sans-serif;color:#101010;line-height:1.35;margin:0 0 4px}
.inf-fig .inf-fig-res{display:flex;gap:4px 16px;flex-wrap:wrap;font:500 13.5px 'IBM Plex Sans',sans-serif;color:#57534A;margin:0 0 10px}
.inf-fig .inf-fig-res b{font-weight:700;font-variant-numeric:tabular-nums}
.inf-fig .up{color:#1F7A4D}.inf-fig .dn{color:#B23A3A}
.inf-fig svg{display:block;width:100%;height:auto;overflow:visible}
.inf-fig .inf-fig-nota{font:400 12px 'IBM Plex Sans',sans-serif !important;color:#8B8375 !important;line-height:1.6 !important;margin:10px 0 0 !important;text-align:left !important}
.inf-fig .ley{display:inline-flex;align-items:center;gap:6px}
.inf-fig .ley i{display:inline-block;width:16px;height:0;border-top:2.5px solid #14213D}
.inf-fig .ley i.b{border-top:2px dashed #8A9BAD}
.inf-fam{display:grid;gap:12px;margin-top:4px}
.inf-fam .f{min-width:0}
.inf-fam .n{display:flex;justify-content:space-between;gap:10px;font:600 13px 'IBM Plex Sans',sans-serif;color:#101010;margin-bottom:5px}
.inf-fam .n span{font-weight:500;color:#8B8375;font-size:12px;white-space:nowrap}
.inf-fam .b{display:flex;align-items:center;gap:8px;margin-top:3px}
.inf-fam .b i{display:block;height:9px;border-radius:5px;background:#14213D;min-width:3px}
.inf-fam .b.m i{background:#C9C3B6}
.inf-fam .b em{font:600 12.5px 'IBM Plex Sans',sans-serif;font-style:normal;color:#101010;font-variant-numeric:tabular-nums;white-space:nowrap}
.inf-fam .b.m em{color:#8B8375;font-weight:500}
`;

/* La acción contra su índice desde la publicación, las dos en variación porcentual
   desde ese día. filas y bench: [{ f, c }] ordenadas por fecha. fecha: el día del
   informe (ISO). precioPub: el precio que guarda el informe (si no, el cierre de ese
   día). Devuelve '' si el informe tiene menos de 5 ruedas o falta algún dato. */
export function figuraDesde({ ticker, benchNom, filas, bench, fecha, precioPub }) {
  const f0 = String(fecha || '').slice(0, 10);
  const s = (filas || []).filter(r => r && r.c > 0 && r.f);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f0) || s.length < 10) return '';
  const despues = s.filter(r => r.f > f0);
  if (despues.length < 5) return '';
  const cierreAl = (lista, dia) => { let v = null; for (const r of lista) { if (r.f > dia) break; v = r.c; } return v; };
  const base = num(precioPub) > 0 ? num(precioPub) : cierreAl(s, f0);
  if (!(base > 0)) return '';
  const b = (bench || []).filter(r => r && r.c > 0 && r.f);
  const baseB = cierreAl(b, f0);
  // a lo sumo ~140 puntos; siempre el último
  const paso = Math.max(1, Math.ceil(despues.length / 140));
  const pts = despues.filter((_, i) => i % paso === 0);
  if (pts[pts.length - 1] !== despues[despues.length - 1]) pts.push(despues[despues.length - 1]);
  const serieA = [{ f: f0, v: 0 }].concat(pts.map(r => ({ f: r.f, v: (r.c / base - 1) * 100 })));
  const serieB = baseB > 0 ? serieA.map(p => { const c = cierreAl(b, p.f); return { f: p.f, v: c > 0 ? (c / baseB - 1) * 100 : null }; }) : [];
  const hayB = serieB.filter(p => p.v != null).length >= 5;
  const vals = serieA.map(p => p.v).concat(hayB ? serieB.filter(p => p.v != null).map(p => p.v) : []);
  let mn = Math.min(0, ...vals), mx = Math.max(0, ...vals);
  const aire = (mx - mn || 1) * 0.08; mn -= aire; mx += aire;
  const W = 720, H = 250, L = 46, R = 12, T = 10, B = 26;
  const t0 = diaMs(f0), t1 = diaMs(serieA[serieA.length - 1].f), dt = t1 - t0 || 1;
  const X = f => (L + (diaMs(f) - t0) / dt * (W - L - R)).toFixed(1);
  const Y = v => (T + (mx - v) / (mx - mn) * (H - T - B)).toFixed(1);
  const camino = serie => { let d = '', abierto = false; serie.forEach(p => { if (p.v == null) { abierto = false; return; } d += (abierto ? 'L' : 'M') + X(p.f) + ',' + Y(p.v); abierto = true; }); return d; };
  const finA = serieA[serieA.length - 1].v;
  const finB = hayB ? [...serieB].reverse().find(p => p.v != null).v : null;
  // tres marcas en el eje: el mínimo, el cero y el máximo (redondeados)
  const marcas = [...new Set([Math.round(mn + aire), 0, Math.round(mx - aire)])];
  const eje = marcas.map(v => `<line x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}" stroke="${v === 0 ? '#C9C3B6' : '#F0EDE5'}" stroke-width="1"/>
    <text x="${L - 8}" y="${(Number(Y(v)) + 4).toFixed(1)}" text-anchor="end" font-family="'IBM Plex Sans',sans-serif" font-size="11" fill="#8B8375">${esc(v === 0 ? '0%' : pctTxt(v, 0))}</text>`).join('');
  const etiqueta = `Variación de ${ticker} desde la publicación del informe (${fCorta(f0)}): ${pctTxt(finA)}${finB != null ? `; ${benchNom} en el mismo lapso: ${pctTxt(finB)}` : ''}`;
  return `<figure class="inf-fig">
    <figcaption>Desde que publicamos este informe</figcaption>
    <div class="inf-fig-res">
      <span class="ley"><i></i>${esc(ticker)} <b class="${finA >= 0 ? 'up' : 'dn'}">${esc(pctTxt(finA))}</b></span>
      ${finB != null ? `<span class="ley"><i class="b"></i>${esc(benchNom)} <b class="${finB >= 0 ? 'up' : 'dn'}">${esc(pctTxt(finB))}</b></span>` : ''}
    </div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(etiqueta)}"><title>${esc(etiqueta)}</title>
      ${eje}
      ${hayB ? `<path d="${camino(serieB)}" fill="none" stroke="#8A9BAD" stroke-width="1.6" stroke-dasharray="5 4"/>` : ''}
      <path d="${camino(serieA)}" fill="none" stroke="#14213D" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="${X(serieA[serieA.length - 1].f)}" cy="${Y(finA)}" r="4" fill="#14213D"/>
      <circle cx="${X(f0)}" cy="${Y(0)}" r="4.5" fill="#B08A3E"/>
      <text x="${L}" y="${H - 6}" font-family="'IBM Plex Sans',sans-serif" font-size="11" fill="#8B8375">${esc(fCorta(f0))}</text>
      <text x="${W - R}" y="${H - 6}" text-anchor="end" font-family="'IBM Plex Sans',sans-serif" font-size="11" fill="#8B8375">${esc(fCorta(serieA[serieA.length - 1].f))}</text>
    </svg>
    <p class="inf-fig-nota">Variación del precio en dólares desde el día de publicación (el punto dorado, a US$${esc(base.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}), con los cierres tal como se operaron y sin dividendos. Se actualiza sola.</p>
  </figure>`;
}

/* Los números de la empresa al lado de la mediana de su familia. items:
   [{ nombre, valor, mediana, fmt, mejor }] (mejor: 'bajo' o 'alto', para la aclaración).
   Entran solo los que tienen los dos números y son positivos; con menos de dos, ''. */
export function figuraFamilia({ ticker, familia, items }) {
  const ok = (items || []).filter(x => x && num(x.valor) > 0 && num(x.mediana) > 0);
  if (ok.length < 2) return '';
  const fila = x => {
    const v = num(x.valor), m = num(x.mediana), tope = Math.max(v, m);
    const fmt = typeof x.fmt === 'function' ? x.fmt : (n => n.toLocaleString('es-AR', { maximumFractionDigits: 1 }));
    return `<div class="f">
      <div class="n">${esc(x.nombre)}<span>${x.mejor === 'alto' ? 'más alto, mejor' : 'más bajo, más barata'}</span></div>
      <div class="b"><i style="width:${Math.max(2, v / tope * 78).toFixed(1)}%"></i><em>${esc(fmt(v))}</em></div>
      <div class="b m"><i style="width:${Math.max(2, m / tope * 78).toFixed(1)}%"></i><em>${esc(fmt(m))} · familia</em></div>
    </div>`;
  };
  return `<figure class="inf-fig">
    <figcaption>${esc(ticker)} al lado de su familia</figcaption>
    <div class="inf-fig-res"><span>La barra oscura es ${esc(ticker)}; la clara, la mediana de ${esc(familia || 'su familia')} en el radar.</span></div>
    <div class="inf-fam">${ok.map(fila).join('')}</div>
    <p class="inf-fig-nota">Números del radar de Valtia, que se recalculan todos los días. La mediana es la de las empresas de su misma familia, sin contarla a ella.</p>
  </figure>`;
}
