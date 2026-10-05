// panel-rendimientos.js — pestaña "Rendimiento de las carteras" de la administración (solo admin).
// Reemplaza a «Rendimientos del fondo» (05/10/2026, pedido de Lauti: el fondo sale del
// panel y en su lugar va el rendimiento de las carteras de Valtia).
//
// Dos bloques:
//  1. Una fila por cartera: cuánto rinde desde su lanzamiento, cuánto hizo su índice en
//     el mismo lapso, la diferencia, la última semana, el último mes y la curva.
//  2. Por cartera, qué rinde cada posición desde que entró y cuánto le aporta al total.
//
// Nada inventado y nada nuevo que leer: los números de las carteras son los de la
// vidriera pública (ctx.teaser(): carterasTeaser/latest, lo mismo que ve cualquiera en
// la página Carteras) y las posiciones son las de carterasModelo/{id}/posiciones
// (ctx.posicionesCartera(id), las activas). Si un dato falta va un guion, no una
// estimación. Esta pantalla no escribe nada.
//
// La piel es la del panel: SOLO variables --v3-* de panel.js (así anda el tema oscuro).
// No importa panel.js —sería un import circular—: todo llega por ctx.

const CSS_ID = 'v3-css-rend';
const VIS = { publico: ['pub', 'Pública'], clientes: ['sus', 'Suscriptores'], borrador: ['bor', 'Sin publicar'] };

const CSS = `
.v3rd{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);max-width:1240px;min-width:0}
.v3rd *{box-sizing:border-box}
.v3rd a:focus-visible,.v3rd button:focus-visible{outline:2px solid var(--v3-focus);outline-offset:2px}
.v3rd-tit{font:700 28px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.1;margin:0;letter-spacing:-.01em}
.v3rd-sub{font-size:14px;color:var(--v3-sub);line-height:1.7;margin:8px 0 18px;max-width:760px}
.v3rd-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:18px 20px;margin-bottom:14px;min-width:0}
.v3rd-h{font:600 18px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.3;margin:0}
.v3rd-p{font-size:13.5px;color:var(--v3-mut);line-height:1.6;margin:4px 0 0}
.v3rd-w{overflow-x:auto;margin-top:12px}
.v3rd-t{width:100%;border-collapse:collapse;font-size:14px}
.v3rd-t th{font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);
  padding:9px 10px;border-bottom:1px solid var(--v3-line);text-align:right;white-space:nowrap}
.v3rd-t td{padding:11px 10px;border-bottom:1px solid var(--v3-line2);text-align:right;white-space:nowrap;vertical-align:middle;
  font-variant-numeric:tabular-nums;color:var(--v3-ink)}
.v3rd-t th:first-child,.v3rd-t td:first-child{text-align:left;padding-left:0}
.v3rd-t th:last-child,.v3rd-t td:last-child{padding-right:0}
.v3rd-t tr:last-child td{border-bottom:none}
.v3rd-t .nom{font:600 15px 'IBM Plex Sans',sans-serif;color:var(--v3-ink)}
.v3rd-t .det{display:block;font-size:12px;color:var(--v3-mut);margin-top:2px}
.v3rd-t .gr{font:700 16px 'IBM Plex Sans',sans-serif}
.v3rd-t .tk{font:700 14.5px 'IBM Plex Sans',sans-serif}
.v3rd-t .em{display:block;font-size:12px;color:var(--v3-mut);max-width:200px;overflow:hidden;text-overflow:ellipsis}
.v3rd .up{color:var(--v3-up)}
.v3rd .dn{color:var(--v3-dn)}
.v3rd .mut{color:var(--v3-mut)}
.v3rd-tag{display:inline-block;font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  padding:2px 7px;border-radius:6px;white-space:nowrap;line-height:1.5;vertical-align:middle;margin-left:6px}
.v3rd-tag.pub{color:var(--v3-up);background:var(--v3-upBg)}
.v3rd-tag.sus{color:var(--v3-gold2);background:var(--v3-goldBg)}
.v3rd-tag.bor{color:var(--v3-warn);background:var(--v3-warnBg)}
.v3rd-spark{display:block;width:150px;height:40px;margin-left:auto}
.v3rd-spark path{fill:none;stroke-width:1.6}
.v3rd-spark .c{stroke:var(--v3-gold)}
.v3rd-spark .b{stroke:var(--v3-mut);stroke-dasharray:3 3;stroke-width:1.1}
.v3rd-ley{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--v3-mut);margin-top:10px}
.v3rd-ley i{display:inline-block;width:18px;height:0;border-top:2px solid var(--v3-gold);vertical-align:middle;margin-right:6px}
.v3rd-ley i.b{border-top:2px dashed var(--v3-mut)}
.v3rd-res{display:flex;gap:6px 18px;flex-wrap:wrap;font-size:13.5px;color:var(--v3-sub);margin-top:8px}
.v3rd-res b{color:var(--v3-ink);font-weight:600}
.v3rd-vacio{font-size:14px;color:var(--v3-mut);line-height:1.7;margin:10px 0 0}
.v3rd-nota{font-size:12.5px;color:var(--v3-mut);line-height:1.65;margin:12px 0 0;max-width:820px}
.v3rd-sk i{display:block;height:13px;border-radius:6px;background:var(--v3-skel);margin:10px 0}
.v3rd-sk i.c{width:45%}
@media (max-width:760px){
  .v3rd-tit{font-size:24px}
  .v3rd-card{padding:16px 14px}
  .v3rd-t .opc{display:none}
}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

const numero = v => v == null || v === '' || typeof v === 'boolean' || !isFinite(Number(v)) ? null : Number(v);
const tono = n => n == null ? 'mut' : n >= 0 ? 'up' : 'dn';
// «+3,88%» con el menos tipográfico; guion si no hay dato
const pctTxt = (n, d = 2) => n == null ? '—'
  : (n >= 0 ? '+' : '−') + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const precioTxt = n => n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* la variación de la cartera en los últimos `dias` días corridos, con su propia serie
   (base 100): el último punto contra el último punto de `dias` días antes o más viejo.
   null si la serie no llega tan atrás. */
export function variacion(serie, dias) {
  const s = (Array.isArray(serie) ? serie : []).filter(p => Array.isArray(p) && numero(p[1]) != null && /^\d{4}-\d{2}-\d{2}/.test(String(p[0])));
  if (s.length < 2) return null;
  const ult = s[s.length - 1];
  const corte = new Date(String(ult[0]).slice(0, 10) + 'T12:00:00Z').getTime() - dias * 86400e3;
  let ref = null;
  for (const p of s) {
    if (new Date(String(p[0]).slice(0, 10) + 'T12:00:00Z').getTime() <= corte) ref = p; else break;
  }
  if (!ref || !(numero(ref[1]) > 0)) return null;
  return (numero(ult[1]) / numero(ref[1]) - 1) * 100;
}

/* la curva de la cartera (dorada) y la de su índice (punteada), en la misma escala */
function curva(t, esc) {
  const s = (Array.isArray(t.serie) ? t.serie : []).filter(Array.isArray);
  const vals = [];
  s.forEach(p => { const a = numero(p[1]), b = numero(p[2]); if (a != null) vals.push(a); if (b != null) vals.push(b); });
  if (s.length < 2 || s.filter(p => numero(p[1]) != null).length < 2) return '<span class="mut">—</span>';
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1, W = 150, H = 40, ult = s.length - 1;
  const X = i => (i / ult * W).toFixed(1), Y = v => (H - 3 - (v - mn) / rg * (H - 6)).toFixed(1);
  const trazo = idx => {
    const tramos = []; let cur = [];
    s.forEach((p, i) => {
      const v = numero(p[idx]);
      if (v == null) { if (cur.length) tramos.push(cur); cur = []; return; }
      cur.push(X(i) + ',' + Y(v));
    });
    if (cur.length) tramos.push(cur);
    return tramos.filter(x => x.length >= 2).map(x => 'M' + x.join('L')).join('');
  };
  const dC = trazo(1), dB = trazo(2);
  if (!dC) return '<span class="mut">—</span>';
  const lbl = `Evolución de ${t.nombre || t.id} desde su lanzamiento${dB ? ', con su índice en línea punteada' : ''}`;
  return `<svg class="v3rd-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(lbl)}"><title>${esc(lbl)}</title>${dB ? `<path class="b" d="${dB}"></path>` : ''}<path class="c" d="${dC}"></path></svg>`;
}

let _seq = 0;

export async function renderRendimientos(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S.email;
  const vigente = () => seq === _seq && ctx.S.email === email;
  const esc = ctx.esc;
  ponerCss();
  const cabeza = `<h1 class="v3rd-tit">Rendimiento de las carteras</h1>
    <p class="v3rd-sub">Cómo viene cada cartera desde que se lanzó, contra su índice, y qué rinde cada posición.
      Son los mismos números que se ven en la página Carteras.</p>`;
  if (!ctx.S.isAdmin) {
    el.innerHTML = `<div class="v3rd">${cabeza}<p class="v3rd-vacio">Esta pantalla es de la administración: tu cuenta no la usa.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="v3rd">${cabeza}<div class="v3rd-card"><div class="v3rd-sk" role="status" aria-label="Cargando las carteras"><i></i><i class="c"></i><i></i><i class="c"></i></div></div></div>`;

  let ts;
  try { ts = (await ctx.teaser()) || []; }
  catch (e) { ts = null; }
  if (!vigente()) return;
  if (!ts || !ts.length) {
    el.innerHTML = `<div class="v3rd">${cabeza}<div class="v3rd-card"><p class="v3rd-vacio">${ts === null
      ? 'No pudimos leer las carteras. Recargá la página para probar de nuevo.'
      : 'Todavía no hay carteras con datos para mostrar.'}</p></div></div>`;
    return;
  }
  // primero las que más rinden; las que no tienen número, al final
  const orden = [...ts].sort((a, b) => (numero(b.retorno) ?? -Infinity) - (numero(a.retorno) ?? -Infinity));
  const fechas = orden.map(t => {
    const s = (Array.isArray(t.serie) ? t.serie : []).filter(Array.isArray);
    return s.length ? String(s[s.length - 1][0]).slice(0, 10) : '';
  }).filter(Boolean).sort();
  const al = fechas.length ? fechas[fechas.length - 1] : '';

  const filaCartera = t => {
    const ret = numero(t.retorno), retB = numero(t.retornoBench);
    const dif = ret != null && retB != null ? ret - retB : null;
    const sem = variacion(t.serie, 7), mes = variacion(t.serie, 30);
    const [vc, vt] = VIS[String(t.visibilidad || '')] || ['bor', String(t.visibilidad || 'sin visibilidad')];
    const bench = t.benchmark ? String(t.benchmark) : 'su índice';
    return `<tr>
      <td><span class="nom">${esc(t.nombre || t.id)}</span><span class="v3rd-tag ${vc}">${esc(vt)}</span>
        <span class="det">${t.fechaInicio ? 'Lanzada el ' + esc(ctx.fmtF(t.fechaInicio)) : 'Sin fecha de lanzamiento'}</span></td>
      <td class="gr ${tono(ret)}">${esc(pctTxt(ret))}</td>
      <td class="opc">${esc(pctTxt(retB))}<span class="det">${esc(bench)}</span></td>
      <td class="${tono(dif)}">${dif == null ? '—' : esc(pctTxt(dif)).replace('%', ' pts')}</td>
      <td class="opc ${tono(sem)}">${esc(pctTxt(sem))}</td>
      <td class="opc ${tono(mes)}">${esc(pctTxt(mes))}</td>
      <td class="opc">${curva(t, esc)}</td>
    </tr>`;
  };

  el.innerHTML = `<div class="v3rd">${cabeza}
    <section class="v3rd-card">
      <h2 class="v3rd-h">Todas las carteras</h2>
      <p class="v3rd-p">${al ? 'Datos al ' + esc(ctx.fmtF(al)) + '. ' : ''}«Diferencia» es lo que le saca (o le pierde) la cartera a su índice en el mismo lapso.</p>
      <div class="v3rd-w"><table class="v3rd-t">
        <thead><tr><th scope="col">Cartera</th><th scope="col">Desde el lanzamiento</th><th scope="col" class="opc">Su índice</th>
          <th scope="col">Diferencia</th><th scope="col" class="opc">Última semana</th><th scope="col" class="opc">Último mes</th>
          <th scope="col" class="opc">Evolución</th></tr></thead>
        <tbody>${orden.map(filaCartera).join('')}</tbody>
      </table></div>
      <div class="v3rd-ley"><span><i></i>La cartera</span><span><i class="b"></i>Su índice</span></div>
    </section>
    <div id="v3rd-pos">${orden.map(t => `<section class="v3rd-card" data-rd="${esc(String(t.id || ''))}">
      <h2 class="v3rd-h">${esc(t.nombre || t.id)} · posición por posición</h2>
      <div class="v3rd-sk" role="status" aria-label="Cargando las posiciones"><i></i><i class="c"></i></div></section>`).join('')}</div>
    <p class="v3rd-nota">El rendimiento de cada posición es el precio de hoy contra el precio al que entró a la cartera, los dos
      puestos por la corrida automática. «Aporta» es ese rendimiento multiplicado por el peso: los puntos que esa posición le
      suma o le resta a la cartera con los pesos de hoy. No incluye dividendos ni las posiciones que ya se cerraron.</p>
  </div>`;

  // las posiciones de cada cartera, cada una por su cuenta: si una falla, las demás se ven igual
  await Promise.all(orden.map(async t => {
    const id = String(t.id || '');
    let pos = null;
    try { pos = await ctx.posicionesCartera(id); } catch (e) { pos = null; }
    if (!vigente()) return;
    const caja = [...el.querySelectorAll('[data-rd]')].find(x => x.dataset.rd === id);
    if (!caja) return;
    const tit = `<h2 class="v3rd-h">${esc(t.nombre || t.id)} · posición por posición</h2>`;
    if (pos === null) { caja.innerHTML = tit + '<p class="v3rd-vacio">No pudimos leer las posiciones de esta cartera.</p>'; return; }
    if (!pos.length) { caja.innerHTML = tit + '<p class="v3rd-vacio">Esta cartera no tiene posiciones activas.</p>'; return; }
    const filas = pos.map(p => {
      const e = numero(p.precioEntrada), a = numero(p.precioActual), w = numero(p.pesoObjetivo);
      const r = e > 0 && a != null ? (a / e - 1) * 100 : null;
      return { tk: String(p.id || p.ticker || '').toUpperCase(), em: p.empresa || '', w, e, a, r, ap: r != null && w != null ? r * w : null, f: p.fechaIncorporacion || '' };
    }).sort((x, y) => (y.r ?? -Infinity) - (x.r ?? -Infinity));
    const con = filas.filter(f => f.r != null);
    const mejor = con[0], peor = con[con.length - 1];
    const suben = con.filter(f => f.r >= 0).length;
    const mon = t.moneda ? String(t.moneda) + ' ' : '';
    caja.innerHTML = tit + (con.length ? `<div class="v3rd-res">
        <span><b>${suben}</b> de ${con.length} en positivo</span>
        <span>La que más rinde: <b>${esc(mejor.tk)}</b> <span class="${tono(mejor.r)}">${esc(pctTxt(mejor.r, 1))}</span></span>
        ${con.length > 1 ? `<span>La que menos: <b>${esc(peor.tk)}</b> <span class="${tono(peor.r)}">${esc(pctTxt(peor.r, 1))}</span></span>` : ''}
      </div>` : '') + `<div class="v3rd-w"><table class="v3rd-t">
        <thead><tr><th scope="col">Activo</th><th scope="col">Peso</th><th scope="col" class="opc">Entró a</th>
          <th scope="col" class="opc">Hoy</th><th scope="col">Rinde</th><th scope="col">Aporta</th></tr></thead>
        <tbody>${filas.map(f => `<tr>
          <td><span class="tk">${esc(f.tk)}</span><span class="em">${esc(f.em)}</span></td>
          <td>${f.w == null ? '—' : (f.w * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + '%'}</td>
          <td class="opc"${f.f ? ` title="Entró el ${esc(ctx.fmtF(f.f))}"` : ''}>${f.e == null ? '—' : esc(mon + precioTxt(f.e))}</td>
          <td class="opc">${f.a == null ? '—' : esc(mon + precioTxt(f.a))}</td>
          <td class="${tono(f.r)}">${esc(pctTxt(f.r, 1))}</td>
          <td class="${tono(f.ap)}">${f.ap == null ? '—' : esc(pctTxt(f.ap, 2)).replace('%', ' pts')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }));
}
