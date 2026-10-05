// panel-carteras.js — pestaña "Carteras Valtia" del panel v3 (id `carteras`).
// Estructura y valores: «Pestaña 4 · Carteras Valtia» del SPEC y el prototipo
// «Valtia Panel v3» del zip completo (24/09/2026): una tarjeta por cartera con el
// perfil, el nombre y su etiqueta (La seguís / Acceso / PRO), la sparkline cartera
// vs. índice, tres cifras (desde el lanzamiento · el índice en el mismo lapso ·
// última rotación), la barra de coincidencias con los chips de sus activos, "Ver
// cartera →" y Seguir / Dejar de seguir. Sin acceso la tarjeta se muestra igual con
// sus cifras (el rendimiento es público) y el botón lleva a los planes.
// Piel vigente del SPEC §0: IBM Plex Sans en todo (sin Plex Mono ni Playfair),
// cifras tabulares, tarjetas de 12 px, etiquetas de 6 px, botones de radio 8 y el
// dorado claro solo sobre azul; los colores, de las variables --v3-* de panel.js.
// Todo sale del ctx: teaser() (la vidriera pública de las carteras: retorno, serie,
// última rotación), posicionesCartera() (solo las que el plan deja leer), seguidas()
// y la cartera del usuario para las coincidencias. No importa panel.js.
import { base, radarSym, esRentaFija, parBono } from './activos.js?v=7';

// prefijo propio (.v3ca-*): panel-comprar.js ya usa .v3c-* y las dos hojas quedan
// juntas en <head>; con el mismo prefijo, .v3c-card/.v3c-bar/.v3c-tag de una
// pestaña desarmaban la otra
const CSS = `
.v3ca{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0;font-variant-numeric:tabular-nums}
.v3ca a{text-decoration:none}
.v3ca a:focus-visible,.v3ca button:focus-visible{outline:2px solid var(--v3-focus);outline-offset:2px}
.v3ca-intro{font-size:15.5px;color:var(--v3-sub);line-height:1.7;margin:0 0 18px;max-width:72ch;text-align:justify;hyphens:auto}
.v3ca-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));gap:16px}
@media(max-width:480px){.v3ca-grid{grid-template-columns:minmax(0,1fr)}.v3ca-intro{font-size:14.5px;text-align:left}}
.v3ca-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:20px 22px;
  display:flex;flex-direction:column;gap:12px;min-width:0;box-sizing:border-box}
/* borde dorado si la sigue */
.v3ca-card.sigue{border-color:var(--v3-gold)}
@media(max-width:480px){.v3ca-card{padding:18px 16px}}
.v3ca-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.v3ca-top .izq{flex:1 1 200px;min-width:0}
.v3ca-eye{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--v3-gold2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3ca-nom{font:600 19px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.2;margin-top:4px;overflow-wrap:anywhere}
/* la etiqueta: con acceso, blanco sobre navy (en oscuro el token se invierte); sin acceso, dorado */
.v3ca-tag{font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:4px 9px;border-radius:6px;
  white-space:nowrap;color:var(--v3-btnTx);background:var(--v3-btn);flex:none}
.v3ca-tag.pro{color:var(--v3-gold2);background:var(--v3-goldBg)}
.v3ca-spark{width:100%;height:56px;display:block;overflow:visible}
.v3ca-spark .c{fill:none;stroke:var(--v3-gold);stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
.v3ca-spark .b{fill:none;stroke:var(--v3-cero);stroke-width:1.2;stroke-dasharray:3 3}
.v3ca-spark-vacio{height:56px;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 12px;
  font-size:13px;color:var(--v3-mut);border:1px dashed var(--v3-line);border-radius:10px;box-sizing:border-box}
/* tres cifras: las etiquetas en la primera fila (abajo, por si una ocupa dos renglones)
   y los valores alineados en la segunda */
.v3ca-cif{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto auto;grid-auto-flow:column;column-gap:8px;row-gap:4px}
.v3ca-cif .k{align-self:end;font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-mut);line-height:1.35;overflow-wrap:anywhere}
.v3ca-cif .v{font:600 16.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3ca-cif .v.up{color:var(--v3-up)}.v3ca-cif .v.dn{color:var(--v3-dn)}.v3ca-cif .v.sub{color:var(--v3-sub)}.v3ca-cif .v.mut{color:var(--v3-mut)}
.v3ca-tir,.v3ca-msg{font-size:14px;color:var(--v3-sub);line-height:1.55;margin:0}
.v3ca-tir b,.v3ca-msg b,.v3ca-coinc b{font-weight:600;color:var(--v3-ink)}
.v3ca-msg a{color:var(--v3-gold)}
.v3ca-msg a:hover{color:var(--v3-gold2)}
.v3ca-coinc{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--v3-sub)}
.v3ca-bar{display:flex;height:7px;flex:1;min-width:40px;border-radius:6px;overflow:hidden;background:var(--v3-track)}
.v3ca-bar i{display:block;height:100%;background:var(--v3-gold)}
.v3ca-coinc span{white-space:nowrap}
@media(max-width:480px){.v3ca-coinc span{white-space:normal}}
.v3ca-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
/* los activos de la cartera; el que ya tenés, blanco sobre navy */
.v3ca-chip{font:600 12px 'IBM Plex Sans',sans-serif;color:var(--v3-sub);background:var(--v3-track);padding:3px 8px;border-radius:6px}
.v3ca-chip.on{color:var(--v3-btnTx);background:var(--v3-btn)}
.v3ca-mas{font-size:12.5px;color:var(--v3-mut)}
.v3ca-pie{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:auto;padding-top:6px}
.v3ca .v3ca-link{font:600 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-gold)}
.v3ca .v3ca-link:hover{color:var(--v3-gold2)}
/* Seguir / Ver planes: el botón primario (navy) de panel.js; Dejar de seguir, el secundario (.sec) */
.v3ca .vp-btn.v3ca-seg{white-space:nowrap}
.v3ca-nota{font-size:13px;color:var(--v3-mut);line-height:1.7;margin:18px 0 0;max-width:760px;text-align:justify;hyphens:auto}
@media(max-width:480px){.v3ca-nota{text-align:left}}
/* la comparación con las que seguís (compararSeguidas de panel.js) va separada del pie */
.v3ca-comp{margin-top:30px}
.v3ca-comp:empty{display:none}
.v3ca-vacio{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:20px 22px;max-width:560px;box-sizing:border-box}
.v3ca-vacio h4{font:600 19px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);margin:0 0 6px;line-height:1.25}
.v3ca-vacio p{font-size:14px;color:var(--v3-sub);line-height:1.65;margin:0}
.v3ca-vacio .vp-btn{margin-top:14px}
/* cargando (SPEC «Estados»): bloques #F0EDE5 con la altura de lo que viene */
.v3ca-sk{background:var(--v3-skel);border-radius:6px;animation:v3ca-pulso 1.4s ease-in-out infinite}
@keyframes v3ca-pulso{50%{opacity:.55}}
@media(prefers-reduced-motion:reduce){.v3ca-sk{animation:none}}
`;

// la bajada del SPEC usa frases que el §0 no permite ("carteras vivas", "sin
// backtests"): esta dice lo mismo sin ellas
const INTRO = `<p class="v3ca-intro">Cada cartera muestra su rendimiento desde el día en que se lanzó y cada rotación queda fechada con su razón. Seguí la que va con vos: el panel te avisa cuando rota y te muestra qué te falta para replicarla.</p>`;

// cada llamada nueva invalida a la anterior: si el usuario sigue una cartera
// mientras la primera todavía carga, no la pisa un dibujo viejo
let _seq = 0;

function instalarCss() {
  if (document.getElementById('v3-css-carteras')) return;
  const st = document.createElement('style');
  st.id = 'v3-css-carteras';
  st.textContent = CSS;
  document.head.appendChild(st);
}

const numero = v => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return isFinite(x) ? x : null;
};
// el signo menos tipográfico, como el prototipo ("−4,94%")
const menos = s => String(s).replace(/^-/, '−');
const tono = n => n == null ? 'mut' : n >= 0 ? 'up' : 'dn';

/* sparkline 300x56: cartera (dorada) y benchmark (punteado) en la MISMA escala,
   para que la distancia entre las dos líneas sea la real. Los huecos del
   benchmark cortan la línea en vez de inventar el tramo */
function sparkline(t, ctx) {
  const s = (Array.isArray(t.serie) ? t.serie : []).filter(Array.isArray);
  const nC = s.filter(p => numero(p[1]) != null).length;
  if (s.length < 2 || nC < 2) {
    return `<div class="v3ca-spark-vacio">Todavía no hay historia suficiente para graficarla.</div>`;
  }
  const vals = [];
  s.forEach(p => { const a = numero(p[1]), b = numero(p[2]); if (a != null) vals.push(a); if (b != null) vals.push(b); });
  let mn = Infinity, mx = -Infinity;
  vals.forEach(v => { if (v < mn) mn = v; if (v > mx) mx = v; });
  const rg = mx - mn || 1, H = 56, ult = s.length - 1;
  const X = i => (i / ult * 300).toFixed(1);
  const Y = v => (H - 4 - (v - mn) / rg * (H - 8)).toFixed(1);
  // tramos continuos; un punto suelto entre dos huecos no dibuja nada y se descarta
  const trazo = idx => {
    const tramos = []; let cur = [];
    s.forEach((p, i) => {
      const v = numero(p[idx]);
      if (v == null) { if (cur.length) tramos.push(cur); cur = []; return; }
      cur.push(X(i) + ',' + Y(v));
    });
    if (cur.length) tramos.push(cur);
    return tramos.filter(t => t.length >= 2).map(t => 'M' + t.join('L')).join('');
  };
  const dC = trazo(1), dB = trazo(2);
  if (!dC) return `<div class="v3ca-spark-vacio">Todavía no hay historia suficiente para graficarla.</div>`;
  const bench = t.benchmark ? String(t.benchmark) : '';
  const lbl = `Evolución de ${t.nombre || t.id} desde su lanzamiento${dB ? ', comparada con ' + (bench || 'su índice') + ' (línea punteada)' : ''}`;
  return `<svg class="v3ca-spark" viewBox="0 0 300 56" preserveAspectRatio="none" role="img" aria-label="${ctx.esc(lbl)}"><title>${ctx.esc(lbl)}</title>${dB ? `<path class="b" d="${dB}" vector-effect="non-scaling-stroke"></path>` : ''}<path class="c" d="${dC}" vector-effect="non-scaling-stroke"></path></svg>`;
}

function esqueleto() {
  const card = `<div class="v3ca-card" aria-hidden="true">
    <div><div class="v3ca-sk" style="height:11px;width:42%"></div><div class="v3ca-sk" style="height:21px;width:64%;margin-top:8px"></div></div>
    <div class="v3ca-sk" style="height:56px"></div>
    <div class="v3ca-sk" style="height:40px"></div>
    <div class="v3ca-sk" style="height:7px"></div>
    <div class="v3ca-sk" style="height:22px;width:70%"></div>
    <div class="v3ca-sk" style="height:32px;width:48%;margin-top:auto;border-radius:8px"></div></div>`;
  return `<div class="v3ca-grid" role="status" aria-label="Cargando las carteras">${card.repeat(3)}</div>`;
}

function estado(el, ctx, titulo, texto, conReintentar) {
  el.innerHTML = `<div class="v3ca">${INTRO}<div class="v3ca-vacio"><h4>${ctx.esc(titulo)}</h4><p>${ctx.esc(texto)}</p>
    ${conReintentar ? '<button type="button" class="vp-btn mini sec" data-v3ca-reintentar>Reintentar</button>' : ''}</div></div>`;
  const b = el.querySelector('[data-v3ca-reintentar]');
  if (b) b.addEventListener('click', () => { ctx.invalidar('teaser', 'seg'); renderCarteras(el, ctx); });
}

function cardCartera(t, x, ctx) {
  const { esc, fmtC, fmtF, pct, num, RIESGO, PERFIL } = ctx;
  const S = ctx.S;
  const { abre, sigue, filas, cc, tienePos } = x;
  const id = String(t.id || '');
  const nombre = t.nombre || id;

  // encabezado: código · riesgo (· perfil) + la etiqueta de acceso (las del prototipo)
  const rot = [t.codigo || id, RIESGO[t.nivelRiesgo] || t.nivelRiesgo || '', PERFIL[t.perfil] || ''].filter(Boolean).join(' · ');
  // «Acceso libre», como dice la página de la cartera
  const tag = abre ? (sigue ? 'La seguís' : 'Acceso libre') : 'PRO';
  const tagTit = abre ? (sigue ? 'Seguís esta cartera' : 'Tu plan incluye esta cartera completa') : 'Composición y rotaciones con Valtia PRO';

  // las tres cifras: seis celdas en dos filas (etiquetas arriba, valores abajo)
  const ret = numero(t.retorno), retB = numero(t.retornoBench);
  const desde = t.fechaInicio ? `Desde ${esc(fmtC(t.fechaInicio))}` : 'Desde el inicio';
  const bench = t.benchmark ? esc(t.benchmark) : 'Índice';
  const ur = t.ultimaRotacion && t.ultimaRotacion.fecha ? t.ultimaRotacion : null;
  const urTit = ur && abre && (ur.accion || ur.ticker) ? ` title="${esc([ur.accion, ur.ticker].filter(Boolean).join(' '))}"` : '';
  const cifras = `<div class="v3ca-cif">
      <div class="k"${t.fechaInicio ? ` title="Lanzada el ${esc(fmtF(t.fechaInicio))}"` : ''}>${desde}</div><div class="v ${tono(ret)}">${esc(menos(pct(ret, 2)))}</div>
      <div class="k">${bench} mismo lapso</div><div class="v ${retB == null ? 'mut' : 'sub'}">${esc(menos(pct(retB, 2)))}</div>
      <div class="k">Última rotación</div><div class="v${ur ? '' : ' mut'}"${urTit}>${ur ? esc(fmtC(ur.fecha)) : '—'}</div>
    </div>`;

  const tir = numero(t.tir), tirPeso = numero(t.tirPeso);
  const lineaTir = tir != null
    ? `<p class="v3ca-tir">Rinde <b>${esc(num(tir, 1))}%</b> anual en dólares si se mantiene a vencimiento${tirPeso != null && tirPeso < 99 ? ` (sobre el <b>${esc(num(tirPeso, 0))}%</b> en bonos)` : ''}.</p>`
    : '';

  // coincidencias con la cartera del usuario + los 5 activos de más peso
  let medio = '';
  if (!abre) {
    const n = numero(t.posiciones);
    medio = `<p class="v3ca-msg">${n != null ? `<b>${esc(num(n, 0))}</b> ${n === 1 ? 'posición' : 'posiciones'} · ` : ''}Composición y rotaciones con PRO.</p>`;
  } else if (filas == null) {
    medio = `<p class="v3ca-msg">No pudimos leer la composición ahora. Probá de nuevo en un rato.</p>`;
  } else if (!filas.length) {
    medio = `<p class="v3ca-msg">La composición todavía no está cargada.</p>`;
  } else {
    const n = filas.length, k = filas.filter(f => f.tengo).length;
    let linea = '';
    if (tienePos) {
      linea = `<div class="v3ca-coinc"><div class="v3ca-bar"><i style="width:${(k / n * 100).toFixed(1)}%"></i></div>
        <span><b>${k} de ${n}</b> coinciden con tu cartera</span></div>`;
    } else if (cc.fallo) {
      linea = `<p class="v3ca-msg">No pudimos leer tu cartera para compararla.</p>`;
    } else if (S.verificado) {
      linea = `<p class="v3ca-msg">Cargá tu cartera y te mostramos cuántas coinciden. <a href="#panel/micartera" data-go="micartera">Ir a Mi cartera →</a></p>`;
    }
    const top = filas.slice(0, 5), resto = n - top.length;
    const chips = `<div class="v3ca-chips">${top.map(f => {
      const tit = (f.peso > 0 ? `Peso objetivo ${num(f.peso * 100, 0)}%` : '') + (f.tengo ? (f.peso > 0 ? ' · ' : '') + 'la tenés' : '');
      return `<span class="v3ca-chip${f.tengo ? ' on' : ''}"${tit ? ` title="${esc(tit)}"` : ''}>${esc(base(f.k))}</span>`;
    }).join('')}${resto > 0 ? `<span class="v3ca-mas">y ${resto} más</span>` : ''}</div>`;
    medio = linea + chips;
  }

  // pie: "Ver cartera →" (cartera.html muestra el rendimiento de todas, con o sin
  // acceso) + seguir / dejar de seguir; sin acceso, el botón lleva a los planes
  const verCartera = `<a class="v3ca-link" href="/cartera?c=${encodeURIComponent(id)}">Ver cartera →</a>`;
  let pie;
  if (abre) {
    const boton = S.verificado
      ? `<button type="button" class="vp-btn mini v3ca-seg${sigue ? ' sec' : ''}" data-seguir="${esc(id)}" data-nombre="${esc(nombre)}" data-on="${sigue ? '1' : '0'}">${sigue ? 'Dejar de seguir' : 'Seguir'}</button>`
      : '';
    pie = verCartera + boton;
  } else {
    // si la seguía cuando tenía acceso, que la pueda dejar de seguir desde acá
    const boton = sigue && S.verificado
      ? `<button type="button" class="vp-btn mini sec v3ca-seg" data-seguir="${esc(id)}" data-nombre="${esc(nombre)}" data-on="1">Dejar de seguir</button>`
      : `<a class="vp-btn mini v3ca-seg" href="/planes">Ver planes</a>`;
    pie = verCartera + boton;
  }

  return `<div class="v3ca-card${sigue ? ' sigue' : ''}">
    <div class="v3ca-top">
      <div class="izq"><div class="v3ca-eye" title="${esc(rot)}">${esc(rot)}</div><div class="v3ca-nom">${esc(nombre)}</div></div>
      <span class="v3ca-tag${abre ? '' : ' pro'}" title="${esc(tagTit)}">${tag}</span>
    </div>
    ${sparkline(t, ctx)}
    ${cifras}
    ${lineaTir}
    ${medio}
    <div class="v3ca-pie">${pie}</div>
  </div>`;
}

export async function renderCarteras(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S.email;
  const vigente = () => seq === _seq && ctx.S.email === email;
  try {
    instalarCss();
    el.innerHTML = `<div class="v3ca">${INTRO}${esqueleto()}</div>`;

    // carteraCalc no pasa por la caché y puede rechazar (el cálculo o el dólar):
    // si falla, la cartera cuenta como "no se pudo leer" en vez de tirar abajo
    // la pestaña entera, que no depende de ella
    const leer = f => Promise.resolve().then(f).catch(() => null);
    const [ts0, cc0, bset, seg0] = await Promise.all([
      leer(() => ctx.teaser()), leer(() => ctx.carteraCalc()), leer(() => ctx.bonosSet()), leer(() => ctx.seguidas())]);
    if (!vigente()) return;
    if (!Array.isArray(ts0)) {
      estado(el, ctx, 'No pudimos leer las carteras', 'Puede ser la conexión. Probá de nuevo en un momento.', true);
      return;
    }
    const ts = ts0.filter(t => t && typeof t === 'object');
    if (!ts.length) {
      // teaser() devuelve [] tanto si no hay nada publicado como si la lectura
      // falló (docJson se traga el error): no se puede afirmar cuál de las dos
      estado(el, ctx, 'No hay carteras para mostrar', 'Puede que todavía no estén publicadas o que no hayamos podido leerlas. Probá de nuevo en un momento.', true);
      return;
    }
    const S = ctx.S;
    const cc = cc0 || { pos: [], fallo: true, r: { filas: [], total: 0 } };
    const seg = seg0 || {};
    const ten = ctx.tenencias(cc, bset);
    const tienePos = !cc.fallo && (cc.pos || []).length > 0;
    // la misma comparación que compararSeguidas: un bono cuenta en cualquiera de
    // sus especies (AL30 y AL30D son el mismo título); una acción por su ficha o
    // por su símbolo del radar
    const tenido = k => esRentaFija(k, bset)
      ? ten.pares.has(parBono(base(k)))
      : (ten.fichas.has(k) || ten.radar.has(radarSym(k)));
    // puede abrirla: pública, o su plan la deja leer (la regla de Firestore manda)
    const abre = t => t.visibilidad === 'publico' || !!S.pro;

    const comps = await Promise.all(ts.map(t => abre(t) ? leer(() => ctx.posicionesCartera(t.id)) : Promise.resolve(undefined)));
    if (!vigente()) return;

    const cards = ts.map((t, i) => {
      const pos = comps[i];
      const filas = Array.isArray(pos)
        ? pos.map(p => {
            const k = String(p.ticker || '').trim().toUpperCase();
            return { k, peso: numero(p.pesoObjetivo) || 0, tengo: tienePos && !!k && tenido(k) };
          }).filter(f => f.k).sort((a, b) => b.peso - a.peso)
        : null;
      return cardCartera(t, { abre: abre(t), sigue: !!seg[t.id], filas, cc, tienePos }, ctx);
    }).join('');

    const bs = [...new Set(ts.map(t => t.benchmark).filter(Boolean).map(String))];
    // la comparación contra un índice se menciona solo si hay alguno de verdad
    const hayBench = bs.length > 0 || ts.some(t => numero(t.retornoBench) != null);
    const bn = bs.length === 1 ? ctx.esc(bs[0]) : 'el índice de referencia de cada una';
    const hayCerradas = ts.some(t => !abre(t));
    const pie = (hayBench
      ? `Rendimientos desde el lanzamiento de cada cartera, comparados con ${bn} en el mismo lapso.`
      : 'Rendimientos desde el lanzamiento de cada cartera.')
      + (hayCerradas ? ' Composición y rotaciones completas con PRO.' : '');

    el.innerHTML = `<div class="v3ca">${INTRO}
      <div class="v3ca-grid">${cards}</div>
      <p class="v3ca-nota">${pie}</p>
      <div id="vp-comparar" class="v3ca-comp"></div></div>`;
    // sin la cartera del usuario, compararSeguidas diría "Tenés 0 de N" y "no la
    // tenés" en cada fila: se avisa que no se pudo comparar en lugar de mostrar eso
    const box = el.querySelector ? el.querySelector('#vp-comparar') : null;
    if (cc.fallo && Object.keys(seg).length) {
      if (box) box.innerHTML = `<p class="v3ca-nota">No pudimos leer tu cartera, así que por ahora no podemos compararla con las carteras que seguís.</p>`;
    } else {
      try { await ctx.compararSeguidas(ts, cc, bset, seg); } catch (e) {}
    }
  } catch (e) {
    if (vigente()) estado(el, ctx, 'No pudimos mostrar las carteras', 'Algo falló al armar esta pestaña. Probá de nuevo en un momento.', true);
  }
}
