// panel-mensual.js — pestaña "Inversión mensual" del panel del inversor (Panel v3).
// La estructura es la del prototipo de Lauti (.claude/handoff-panel-v3, líneas
// 552-624): a la izquierda la regla, los aportes de los últimos 6 meses y las
// últimas compras; a la derecha las candidatas para la próxima compra. Los colores
// y la tipografía son los de Noticias, vía las variables --v3-* de panel.js.
//
// Todo sale del ctx: la regla y el log de compras (disciplina), la cartera (qué
// tiene y en qué moneda cargó cada compra), el radar, los precios del día y el
// dólar. Nada se inventa: sin dato, la pantalla lo dice.
import { base, radarSym, tickerFicha, esRentaFija, esCripto, monedaProbable } from './activos.js?v=7';

const CSS = `
.im-wrap{color:var(--v3-ink);font-family:'IBM Plex Sans',system-ui,sans-serif;overflow-wrap:break-word}
.im-wrap *,.im-wrap *::before,.im-wrap *::after{box-sizing:border-box}
.im-wrap .n{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.im-grid{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(0,1.2fr);gap:26px;align-items:start}
@media (max-width:900px){.im-grid{grid-template-columns:minmax(0,1fr)}}
.im-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.im-k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut)}
.im-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px}
.im-vacio{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:0}

/* la regla: bloque sólido navy, texto claro encima */
.im-regla{background:var(--v3-navy);border-radius:12px;padding:22px 24px;color:#fff}
.im-regla .im-k{color:var(--v3-goldL);opacity:.8}
.im-big{display:flex;align-items:baseline;gap:4px 8px;margin-top:8px;flex-wrap:wrap}
.im-big b{font:600 34px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em;line-height:1.1;color:#fff}
.im-big span{font-size:13px;color:rgba(255,255,255,.6)}
.im-segs{display:flex;gap:6px;margin-top:16px}
.im-segs i{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.15);display:block}
.im-segs i.on{background:var(--v3-goldL)}
.im-prog{display:flex;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;font-size:12px;color:rgba(255,255,255,.7);margin-top:8px}
.im-prog b{color:#fff;font-weight:600}
.im-stats{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);font-size:12px;color:rgba(255,255,255,.7)}
.im-stats b{font:600 15px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:#fff}
.im-stats b.g{color:var(--v3-goldL)}
.im-regla-nota{font-size:11px;color:rgba(255,255,255,.5);line-height:1.5;margin-top:8px}
.im-links{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:16px}
.im-links a{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-goldL);text-decoration:none}
.im-links a:hover{color:#fff}

/* sin regla / sin verificar / error */
.im-def{padding:22px 24px}
.im-def-t{font:700 22px 'Playfair Display',serif;color:var(--v3-ink);margin:8px 0 8px;line-height:1.2}
.im-def p{font-size:13px;color:var(--v3-sub);line-height:1.65;margin:0}
.im-def-f{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:16px}
.im-def-f label{display:block;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);margin-bottom:5px}
.im-def-f input{font:500 14px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;padding:9px 11px;border:1px solid var(--v3-line);border-radius:6px;
  background:var(--v3-card);color:var(--v3-ink);width:132px;max-width:100%;outline:none}
.im-def-f input:focus{border-color:var(--v3-gold)}
.im-def-c{font-size:12px;color:var(--v3-mut);margin-top:10px;min-height:1em}
.im-msg{font-size:12.5px;color:var(--v3-dn);margin-top:8px;line-height:1.5}
.im-msg:empty{display:none}
.im-btn-oro{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#0E1830;background:var(--v3-goldL);
  border:1px solid var(--v3-goldL);padding:10px 16px;border-radius:7px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}
.im-btn-oro:hover{background:var(--v3-card);border-color:var(--v3-gold);color:var(--v3-ink)}
.im-btn-oro[disabled]{opacity:.5;cursor:default}
.im-btn-sec{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-ink);background:transparent;
  border:1px solid var(--v3-line);padding:9px 14px;border-radius:7px;cursor:pointer;white-space:nowrap;margin-top:14px;transition:border-color .15s}
.im-btn-sec:hover{border-color:var(--v3-gold)}
.im-btn-sec[disabled],.im-aviso button[disabled]{opacity:.5;cursor:default}

/* aportes de los últimos 6 meses contra la regla */
.im-ap{padding:16px 18px;container-type:inline-size;--im-ok:var(--v3-serie);--im-no:var(--v3-gold);--im-cur:var(--v3-goldL)}
[data-theme="dark"] .im-ap{--im-ok:var(--v3-goldL);--im-no:var(--v3-mut);--im-cur:var(--v3-azul)}
.im-ap-h{display:flex;justify-content:space-between;gap:6px 12px;align-items:baseline;flex-wrap:wrap}
.im-ap-ley{font-size:11px;color:var(--v3-mut);white-space:nowrap}
.im-ap-ley i{display:inline-block;width:14px;border-top:1.5px dashed var(--v3-gold);vertical-align:middle;margin-right:5px}
.im-ap-v,.im-ap-b,.im-ap-m{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.im-ap-v{margin-top:16px;font:600 10px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);text-align:center}
.im-ap-v span{white-space:nowrap}
.im-ap-b{position:relative;align-items:end;height:96px;margin-top:6px}
.im-ap-b .reg{position:absolute;left:0;right:0;border-top:1.5px dashed var(--v3-gold);display:block;z-index:1;pointer-events:none}
.im-ap-b div{border-radius:4px 4px 0 0}
.im-ap-b .ok{background:var(--im-ok)}
.im-ap-b .no{background:var(--im-no)}
.im-ap-b .cur{background:var(--im-cur)}
.im-ap-b .cero{background:var(--v3-track);height:2px;border-radius:1px}
.im-ap-m{margin-top:6px;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);text-align:center}
.im-ap-nota{font-size:11px;color:var(--v3-mut);line-height:1.5;margin-top:10px}
.im-ap .im-vacio{margin-top:12px}
/* el "US$" de cada cifra se cae cuando la columna no alcanza para la más larga
   (Plex Mono 10px = 6px por carácter; la clase dice cuántos caracteres tiene) */
@container (max-width:245px){.im-ap.w6 .im-ap-v .mon{display:none}}
@container (max-width:313px){.im-ap.w8 .im-ap-v .mon{display:none}}
@container (max-width:349px){.im-ap.w9 .im-ap-v .mon{display:none}}
@container (max-width:385px){.im-ap.w10 .im-ap-v .mon{display:none}}

/* últimas compras */
.im-cmp{overflow:hidden}
.im-cmp-h{padding:12px 16px;border-bottom:1px solid var(--v3-track)}
.im-cmp-r{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:12px;align-items:baseline;padding:10px 16px;border-bottom:1px solid var(--v3-line2);font-size:12.5px}
.im-cmp-r:last-child{border-bottom:none}
.im-cmp-r .f{font:600 10px 'IBM Plex Mono',monospace;color:var(--v3-mut);white-space:nowrap}
.im-cmp-r .t{min-width:0}
.im-cmp-r .t b{color:var(--v3-gold);font-weight:700}
.im-cmp-r .t span{color:var(--v3-sub)}
.im-cmp-r .m{font:600 12px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);white-space:nowrap}
.im-cmp .im-vacio{padding:14px 16px}

/* candidatas */
.im-der{min-width:0;container-type:inline-size}
.im-der-h{display:flex;align-items:baseline;justify-content:space-between;gap:4px 12px;margin-bottom:12px;flex-wrap:wrap}
.im-h2{font:700 22px 'Playfair Display',serif;color:var(--v3-ink);margin:0;line-height:1.2}
.im-der-h span{font:500 11px 'IBM Plex Sans',sans-serif;color:var(--v3-mut)}
.im-aviso{font-size:12.5px;color:var(--v3-sub);line-height:1.55;background:var(--v3-warnBg);border-radius:10px;padding:10px 14px;margin-bottom:10px}
.im-aviso button{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-gold2);background:none;border:none;padding:0;margin-left:6px;cursor:pointer}
.im-aviso button:hover{color:var(--v3-ink)}
.im-cands{display:flex;flex-direction:column;gap:10px}
.im-cand{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:10px;padding:16px 18px;transition:border-color .15s}
.im-cand:hover{border-color:var(--v3-gold)}
.im-cand-row{display:flex;gap:16px;align-items:center}
.im-cand-izq{flex:1;min-width:0}
.im-cand-t{display:flex;align-items:baseline;gap:4px 8px;flex-wrap:wrap}
.im-cand-t .tk{font:700 15px 'IBM Plex Sans',sans-serif;color:var(--v3-gold);text-decoration:none}
.im-cand-t a.tk:hover{color:var(--v3-gold2)}
.im-cand-t .nm{font-size:12.5px;color:var(--v3-sub)}
.im-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.im-pill{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:4px;white-space:nowrap}
.im-pill.zona{color:#0E1830;background:var(--v3-goldL)}
.im-pill.warn{color:var(--v3-warn);background:var(--v3-warnBg)}
.im-porque{font-size:12.5px;color:var(--v3-sub);line-height:1.55;margin-top:8px}
.im-cand-der{text-align:right;flex:none}
.im-cand-der .px{font:600 15px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);white-space:nowrap}
.im-cand-der .u{font-size:11.5px;color:var(--v3-mut);margin-top:2px;white-space:nowrap}
.im-wrap .vp-btn.im-compre{display:inline-block;margin-top:10px;font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:#0E1830;background:var(--v3-goldL);border:1px solid var(--v3-goldL);padding:7px 12px;border-radius:5px;white-space:nowrap;cursor:pointer}
.im-wrap .vp-btn.im-compre:hover{background:var(--v3-card);border-color:var(--v3-gold);color:var(--v3-ink)}
.im-cand .vp-form{margin-top:12px}
.im-pie{font-size:11.5px;color:var(--v3-mut);line-height:1.7;margin:18px 0 0}
.im-pie a{color:var(--v3-gold2);text-decoration:none}
.im-pie a:hover{color:var(--v3-ink)}
.im-ir{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-gold2);text-decoration:none;display:inline-block;margin-top:10px}
.im-ir:hover{color:var(--v3-ink)}
@container (max-width:460px){
  .im-cand-row{flex-wrap:wrap;align-items:flex-start;gap:12px}
  .im-cand-der{flex:1 1 100%;text-align:left;display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px}
  .im-cand-der .u{margin-top:0}
  .im-wrap .vp-btn.im-compre{margin-top:0;margin-left:auto}
}
`;

function instalarCss() {
  if (document.getElementById('v3-css-mensual')) return;
  const st = document.createElement('style');
  st.id = 'v3-css-mensual';
  st.textContent = CSS;
  document.head.appendChild(st);
}

const ORD = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima'];
// colores de los veredictos (VER del prototipo, línea 778) con las variables del panel
const VER = {
  Infravalorada: ['var(--v3-up)', 'var(--v3-upBg)'],
  'En precio': ['var(--v3-gold2)', 'var(--v3-goldBg)'],
  Estirada: ['var(--v3-dn)', 'var(--v3-dnBg)'],
};
const verColores = v => VER[v] || ['var(--v3-mut)', 'var(--v3-neutro)'];
// rsiZona del radar: Sobrevendido · Debil · Firme · Sobrecomprado
const ZONA_RSI = { sobrevendido: 'sobrevendida', debil: 'débil', 'débil': 'débil', firme: 'firme', sobrecomprado: 'sobrecomprada' };
const zonaRsi = z => { const k = String(z || '').trim().toLowerCase(); return k ? (ZONA_RSI[k] || k) : ''; };

// renders superpuestos (cambio de pestaña, "La compré", cambio de cuenta): dibuja solo
// el último de cada contenedor
const _seq = new WeakMap();
const ultimo = (el, seq) => _seq.get(el) === seq;

export async function renderMensual(el, ctx) {
  if (!el || !ctx) return;
  const seq = (_seq.get(el) || 0) + 1;
  _seq.set(el, seq);
  const email = ctx.S && ctx.S.email;
  try {
    instalarCss();
    await dibujar(el, ctx, seq);
  } catch (e) {
    if (!ultimo(el, seq) || (ctx.S && ctx.S.email) !== email) return;
    try { pintarError(el, ctx, 'No pudimos armar tu plan'); } catch (x) {}
  }
}

function pintarError(el, ctx, titulo) {
  el.innerHTML = `<div class="im-wrap"><div class="im-card im-def" style="max-width:560px">
      <div class="im-k">Inversión mensual</div>
      <h3 class="im-def-t">${ctx.esc(titulo)}</h3>
      <p>Puede ser la conexión. Tu regla y tus compras siguen guardadas: probá de nuevo en un momento.</p>
      <button type="button" class="im-btn-sec" data-im-reintentar>Reintentar</button></div></div>`;
  const b = el.querySelector('[data-im-reintentar]');
  if (b) b.onclick = () => reintentar(el, ctx, b);
}

// el dibujo viejo queda mientras carga: el botón avisa que está probando
function reintentar(el, ctx, b) {
  b.disabled = true; b.textContent = 'Probando…';
  ctx.invalidar('disc', 'cartera', 'radar', 'pi');
  renderMensual(el, ctx);
}

async function dibujar(el, ctx, seq) {
  const { esc, num, money } = ctx;
  const email = ctx.S.email;
  const vigente = () => ultimo(el, seq) && ctx.S.email === email;
  if (!el.querySelector('.im-wrap')) el.innerHTML = '<p class="vp-cargando">Cargando tu plan…</p>';

  if (!ctx.S.verificado) {
    el.innerHTML = `<div class="im-wrap"><div class="im-card im-def" style="max-width:560px">
        <div class="im-k">Inversión mensual</div>
        <h3 class="im-def-t">Verificá tu email para activar tu plan</h3>
        <p>Te mandamos un mail al registrarte. Abrilo, tocá el link y recargá.</p></div></div>`;
    return;
  }

  const nada = () => null;
  const [disc, cc, pi, rd, bs, fx] = await Promise.all([
    Promise.resolve().then(() => ctx.disciplina()).catch(nada),
    Promise.resolve().then(() => ctx.carteraCalc()).catch(nada),
    Promise.resolve().then(() => ctx.preciosInf()).catch(nada),
    Promise.resolve().then(() => ctx.radarDoc()).catch(nada),
    Promise.resolve().then(() => ctx.bonosSet()).catch(nada),
    Promise.resolve().then(() => ctx.fx()).catch(nada),
  ]);
  if (!vigente()) return;
  if (!disc) { pintarError(el, ctx, 'No pudimos leer tu plan'); return; }

  const set = bs instanceof Set ? bs : new Set();
  const precios = (pi && typeof pi === 'object') ? pi : {};
  const falloCartera = !cc || !!cc.fallo;
  const pos = (cc && Array.isArray(cc.pos)) ? cc.pos : [];
  const pxDoc = (cc && cc.precios) || {};

  /* ── la regla y el mes ── */
  const config = disc.config || null;
  const log = (Array.isArray(disc.log) ? disc.log : []).filter(c => c && c.tipo === 'compra');
  const hoy = ctx.hoyAR(), mes = hoy.slice(0, 7);
  const mesNombre = m => ctx.MESES[Number(String(m).slice(5, 7)) - 1] || '';
  const obj = Math.max(1, Number(config && config.compras) || 1);
  const aporte = config ? (Number(config.aporte) || 0) : 0;
  const monto = config ? aporte / obj : 0;
  const mesDe = c => String(c.fecha || '').slice(0, 7);
  const comprasEn = m => log.filter(c => mesDe(c) === m).length;
  // la racha, con la misma cuenta que el panel de siempre y disciplina.html
  let racha = 0;
  if (config) {
    let m = mes;
    if (comprasEn(m) >= obj) racha++;
    m = ctx.mesAnterior(m);
    for (let i = 0; i < 120 && comprasEn(m) >= obj; i++) { racha++; m = ctx.mesAnterior(m); }
  }
  const hechas = comprasEn(mes), faltan = config ? Math.max(0, obj - hechas) : 0;

  /* ── cuánto puso cada compra, en dólares ──
     El log guarda cantidad y precio pagado, sin la moneda. La moneda y el factor de
     lámina salen de la posición que creó esa misma compra (mismo ticker y mismo
     "creado"), con el mismo criterio que usa Mi cartera; si ya no está, del ticker.
     Las compras en pesos se pasan con el CCL de hoy; sin CCL, no suman. */
  const porAlta = new Map();
  pos.forEach(p => { if (p && p.creado) porAlta.set(String(p.ticker || '').toUpperCase() + '|' + p.creado, p); });
  const ccl = fx && Number(fx.ccl) > 0 ? Number(fx.ccl) : null;
  const compras = log.map(c => {
    const tk = String(c.ticker || '').toUpperCase();
    const p = porAlta.get(tk + '|' + c.creado) || null;
    const px = pxDoc[tk] || null;
    const fac = p && Number(p.factor) > 0 ? Number(p.factor)
      : px && Number(px.factor) > 0 ? Number(px.factor)
      : esRentaFija(tk, set) ? 0.01 : 1;
    const mon = (px && px.moneda) || (p && p.moneda) || monedaProbable(tk, set);
    const moneda = mon === 'ARS' ? 'ARS' : 'USD';
    const v = (Number(c.cantidad) || 0) * (Number(c.precio) || 0) * fac;
    const usd = moneda === 'ARS' ? (ccl ? v / ccl : null) : v;
    return { ...c, tk, v, moneda, usd };
  });
  let totalUsd = 0, enPesos = 0, pesosSinFx = 0;
  compras.forEach(c => {
    if (c.moneda === 'ARS') { enPesos++; if (c.usd == null) pesosSinFx++; }
    if (c.usd != null && isFinite(c.usd)) totalUsd += c.usd;
  });
  const usdTxt = n => money(Math.round(n), 'USD');
  const plural = (n, s, p) => n === 1 ? s : p;

  /* ── columna izquierda: la regla (o el formulario para definirla) ── */
  let regla;
  if (config) {
    const segs = Array.from({ length: obj }, (_, i) => `<i class="${i < hechas ? 'on' : ''}"></i>`).join('');
    const der = faltan
      ? (monto > 0 ? `<span>faltan <span class="n">${esc(money(monto * faltan, 'USD'))}</span></span>`
        : `<span>${plural(faltan, 'falta', 'faltan')} <span class="n">${faltan}</span> ${plural(faltan, 'compra', 'compras')}</span>`)
      : '<span>plan del mes cumplido ✓</span>';
    const notaPesos = pesosSinFx
      ? `Sin contar <span class="n">${pesosSinFx}</span> ${plural(pesosSinFx, 'compra en pesos', 'compras en pesos')}: ahora no hay cotización del dólar para pasarlas.`
      : enPesos ? `Las compras en pesos se pasan a dólares al CCL de hoy.` : '';
    regla = `<div class="im-regla">
        <div class="im-k">Tu regla · ${esc(mesNombre(mes))}</div>
        <div class="im-big"><b>${esc(money(aporte, 'USD'))}</b><span>por mes en <span class="n">${obj}</span> ${plural(obj, 'compra', 'compras')}</span></div>
        <div class="im-segs" aria-hidden="true">${segs}</div>
        <div class="im-prog"><span><b><span class="n">${hechas}</span> de <span class="n">${obj}</span></b> ${plural(obj, 'compra hecha', 'compras hechas')}</span>${der}</div>
        <div class="im-stats">
          <span><b class="g">${racha}</b> ${racha ? plural(racha, 'mes seguido', 'meses seguidos') : 'meses seguidos: arrancá este mes'}</span>
          ${log.length ? `<span><b>${esc(usdTxt(totalUsd))}</b> aportados</span>` : '<span>todavía sin compras registradas</span>'}
        </div>
        ${notaPesos ? `<div class="im-regla-nota">${notaPesos}</div>` : ''}
        <div class="im-links"><a href="inversion-mensual.html">Recalcular la regla →</a><a href="disciplina.html">Historial completo →</a></div>
      </div>`;
  } else {
    regla = `<div class="im-card im-def">
        <div class="im-k">Tu regla · ${esc(mesNombre(mes))}</div>
        <h3 class="im-def-t">Definí tu regla</h3>
        <p>Cuánto aportás por mes en dólares y en cuántas compras lo repartís. Es tu contrato con vos mismo.</p>
        <div class="im-def-f">
          <div><label for="im-aporte">Aporte mensual (US$)</label><input type="number" id="im-aporte" min="1" step="any" value="200" inputmode="decimal"></div>
          <div><label for="im-compras">Compras por mes</label><input type="number" id="im-compras" min="1" max="6" step="1" value="2" inputmode="numeric"></div>
          <button type="button" class="im-btn-oro" id="im-guardar">Guardar mi regla</button>
        </div>
        <div class="im-def-c" id="im-porc"></div>
        <div class="im-msg" id="im-msg" role="status"></div>
        <a class="im-ir" href="inversion-mensual.html">¿Cuánto aportar? Calculalo acá →</a>
      </div>`;
  }

  /* ── aportes de los últimos 6 meses ── */
  const meses = [];
  for (let i = 0, m = mes; i < 6; i++) { meses.unshift(m); m = ctx.mesAnterior(m); }
  const porMes = meses.map(m => {
    const cs = compras.filter(c => mesDe(c) === m);
    return { m, n: cs.length, usd: cs.reduce((s, c) => s + (c.usd != null && isFinite(c.usd) ? c.usd : 0), 0),
             pesos: cs.filter(c => c.moneda === 'ARS').length, sinFx: cs.filter(c => c.usd == null).length };
  });
  let aportes;
  if (compras.length) {
    const tope = Math.max(aporte || 0, ...porMes.map(x => x.usd)) * 1.13 || 1;
    const barra = x => {
      const titulo = `${mesNombre(x.m)} ${x.m.slice(0, 4)}: ${usdTxt(x.usd)} en ${x.n} ${plural(x.n, 'compra', 'compras')}` +
        (x.sinFx ? ` (sin contar ${x.sinFx} en pesos)` : '');
      if (!(x.usd > 0)) return `<div class="cero" title="${esc(titulo)}"></div>`;
      const c = x.m === mes ? 'cur' : !config ? 'ok' : x.usd >= aporte - 0.5 ? 'ok' : 'no';
      return `<div class="${c}" style="height:max(3px,${(x.usd / tope * 100).toFixed(1)}%)" title="${esc(titulo)}"></div>`;
    };
    const conPesos = porMes.reduce((s, x) => s + x.pesos, 0), sinFx6 = porMes.reduce((s, x) => s + x.sinFx, 0);
    const nota = sinFx6
      ? `Sin cotización del dólar: no suman <span class="n">${sinFx6}</span> ${plural(sinFx6, 'compra en pesos', 'compras en pesos')}.`
      : conPesos ? 'Las compras en pesos, al CCL de hoy.' : '';
    aportes = `<div class="im-ap-v">${porMes.map(x => `<span><span class="mon">US$</span>${esc(num(Math.round(x.usd), 0))}</span>`).join('')}</div>
      <div class="im-ap-b">${config && aporte > 0 ? `<i class="reg" style="top:${(100 - aporte / tope * 100).toFixed(1)}%"></i>` : ''}${porMes.map(barra).join('')}</div>
      <div class="im-ap-m">${porMes.map(x => `<span>${esc(mesNombre(x.m).slice(0, 3))}</span>`).join('')}</div>
      ${nota ? `<div class="im-ap-nota">${nota}</div>` : ''}`;
  } else {
    aportes = '<p class="im-vacio">Todavía nada: es normal al empezar. Cada "La compré" suma su aporte acá.</p>';
  }
  // cuántos caracteres tiene la cifra más larga con su "US$" (define cuándo se cae el prefijo)
  const largo = Math.min(10, Math.max(6, ...porMes.map(x => 3 + num(Math.round(x.usd), 0).length)));
  const cardAportes = `<div class="im-card im-ap w${largo === 7 ? 8 : largo}">
      <div class="im-ap-h"><div class="im-k">Aportes · últimos 6 meses</div>${config && aporte > 0 ? `<span class="im-ap-ley"><i></i>tu regla <span class="n">${esc(money(aporte, 'USD'))}</span></span>` : ''}</div>
      ${aportes}</div>`;

  /* ── últimas compras ── */
  const ult = compras.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) ||
    String(b.creado || '').localeCompare(String(a.creado || ''))).slice(0, 6);
  const cant = c => {
    const q = (Number(c.cantidad) || 0).toLocaleString('es-AR', { maximumFractionDigits: 4 });
    if (esRentaFija(c.tk, set)) return `<span class="n">${q}</span> VN`;
    if (esCripto(c.tk)) return `<span class="n">${q}</span>`;
    return `<span class="n">${q}</span> acc.`;
  };
  const cardCompras = `<div class="im-card im-cmp"><div class="im-cmp-h im-k">Últimas compras</div>
      ${ult.length ? ult.map(c => `<div class="im-cmp-r">
          <span class="f">${esc(c.fecha ? ctx.fmtC(c.fecha) : '—')}</span>
          <span class="t"><b>${esc(base(c.tk) || '—')}</b> <span>· ${cant(c)}${c.broker ? ' · ' + esc(c.broker) : ''}</span></span>
          <span class="m">${c.v > 0 ? esc(money(c.v, c.moneda)) : '—'}</span></div>`).join('')
        : '<p class="im-vacio">Todavía nada: es normal al empezar.</p>'}</div>`;

  /* ── columna derecha: candidatas del radar que todavía no tiene ── */
  const activos = (rd && Array.isArray(rd.activos)) ? rd.activos : [];
  const ten = ctx.tenencias(cc && Array.isArray(cc.pos) ? cc : { pos: [] }, set);
  const libres = ctx.ordenComprar(activos).filter(a => a.score != null && !ten.radar.has(a.sym));
  // de 3 a 5: todas las que están en zona de compra, con un mínimo de 3 y un máximo de 5
  const cands = libres.slice(0, Math.min(5, Math.max(3, libres.filter(a => a.entrada).length)));
  const puntuados = activos.filter(a => a.score != null && isFinite(a.score));
  const maxScore = puntuados.length ? Math.max(...puntuados.map(a => Number(a.score))) : null;
  const empatadosArriba = puntuados.filter(a => Number(a.score) === maxScore).length;
  const puesto = a => 1 + puntuados.filter(x => Number(x.score) > Number(a.score)).length;
  // "sector que te falta": solo se afirma si se conoce el sector de todas sus acciones
  const porSym = {};
  activos.forEach(a => { if (a && a.sym) porSym[a.sym] = a; });
  const misSectores = new Set();
  let sectorDudoso = falloCartera || !pos.length;
  pos.forEach(p => {
    const tk = String((p && p.ticker) || '');
    if (!tk || esRentaFija(tk, set)) return;
    const ra = porSym[radarSym(tk)];
    if (ra && ra.sector) misSectores.add(String(ra.sector));
    else if (!esCripto(tk)) sectorDudoso = true;
  });
  const porque = a => {
    const partes = [];
    if (!falloCartera) partes.push('No la tenés.');
    const r = puesto(a), pts = `<span class="n">${esc(a.score)}</span>`;
    const lugar = `<span class="n">${r}º</span> de <span class="n">${puntuados.length}</span> en el radar`;
    const mejor = r === 1 ? (empatadosArriba > 1 ? 'es de las mejor puntuadas del radar' : 'es la mejor puntuada del radar') : '';
    if (a.entrada) partes.push(mejor ? `Está en zona de compra y ${mejor}.` : `Está en zona de compra, con puntaje de valor ${pts} (${lugar}).`);
    else partes.push(mejor ? `${mejor.charAt(0).toUpperCase() + mejor.slice(1)} (puntaje de valor ${pts}), pero todavía no está en zona de compra.`
      : `Puntaje de valor ${pts}, ${lugar}; todavía no está en zona de compra.`);
    if (!sectorDudoso && a.sector && !misSectores.has(String(a.sector))) partes.push(`Sector que te falta: ${esc(a.sector)}.`);
    if (a.rsi != null && isFinite(a.rsi)) {
      const z = zonaRsi(a.rsiZona);
      partes.push(`RSI <span class="n">${Math.round(Number(a.rsi))}</span>${z ? ': ' + esc(z) : ''}.`);
    }
    return partes.join(' ');
  };
  const usdPx = p => 'US$' + num(p, p >= 1000 ? 0 : 2);
  const fmtU = u => num(u, u >= 10 ? 0 : u >= 1 ? 1 : u >= 0.01 ? 2 : 4);
  const card = a => {
    const f = tickerFicha(a.sym);
    const p = f && precios[f] && precios[f].p != null && isFinite(precios[f].p) ? Number(precios[f].p)
      : a.precio != null && isFinite(a.precio) ? Number(a.precio) : null;
    const [vc, vb] = verColores(a.veredicto);
    const u = p > 0 && monto > 0 ? monto / p : null;
    const unidad = esCripto(a.sym) ? esc(base(a.sym)) : 'acc.';
    const tk = f ? `<a class="tk" href="activo.html?t=${encodeURIComponent(f)}">${esc(a.sym)}</a>` : `<span class="tk">${esc(a.sym)}</span>`;
    return `<div class="im-cand" data-host>
        <div class="im-cand-row">
          <div class="im-cand-izq">
            <div class="im-cand-t">${tk}<span class="nm">${esc(a.nombre || '')}</span></div>
            <div class="im-pills">
              ${a.veredicto ? `<span class="im-pill" style="color:${vc};background:${vb}">${esc(a.veredicto)}</span>` : ''}
              ${a.entrada ? '<span class="im-pill zona">◎ zona de compra</span>' : ''}
              ${a.pierdePlata ? '<span class="im-pill warn" title="El puntaje mide qué tan barata cotiza; esta empresa hoy no gana dinero">no gana plata</span>' : ''}
            </div>
            <div class="im-porque">${porque(a)}</div>
          </div>
          <div class="im-cand-der">
            <div class="px">${p != null ? esc(usdPx(p)) : '—'}</div>
            ${u != null ? `<div class="u">≈ <span class="n">${esc(fmtU(u))}</span> ${unidad} con <span class="n">${esc(money(monto, 'USD'))}</span></div>` : ''}
            <button type="button" class="vp-btn mini im-compre" data-compra="${esc(a.sym)}" data-px="${p != null && f ? esc(p) : ''}">La compré</button>
          </div>
        </div>
      </div>`;
  };
  const titulo = config && faltan > 0
    ? `Candidatas para la ${ORD[hechas] || (hechas + 1) + 'ª'} compra`
    : 'Candidatas para tu próxima compra';
  // "ya tenés todo" solo es cierto si el radar trae puntajes: sin ninguno, es que no está disponible
  const hayPuntajes = ctx.ordenComprar(activos).some(a => a.score != null);
  const vacioCands = !hayPuntajes
    ? '<div class="im-card im-def"><p>El radar no está disponible ahora.</p><button type="button" class="im-btn-sec" data-im-reintentar>Reintentar</button></div>'
    : `<div class="im-card im-def"><p>Ya tenés todo lo que el radar puntúa. La lista completa, con lo que ya tenés, está en Qué comprar.</p>
        <a class="im-ir" href="#panel/comprar" data-go="comprar">Ir a Qué comprar →</a></div>`;
  const aviso = falloCartera
    ? `<div class="im-aviso">No pudimos leer tu cartera: puede que alguna de estas ya la tengas.<button type="button" data-im-reintentar>Reintentar</button></div>`
    : '';
  const der = `<div class="im-der">
      <div class="im-der-h"><h2 class="im-h2">${esc(titulo)}</h2><span>${falloCartera ? 'lo mejor puntuado del radar' : 'del radar, que todavía no tenés'}</span></div>
      ${aviso}
      <div class="im-cands">${cands.map(card).join('') || vacioCands}</div>
      ${!cands.length ? '' : `<p class="im-pie">"La compré" registra la compra en Mi cartera y en tu plan del mes, con el mercado, la cantidad, el precio que pagaste y el broker.
        ${config ? '"≈" es lo que entra con tu monto por compra al precio de hoy en dólares. ' : ''}Si comprás en BYMA, cargá la cantidad y el precio en pesos.
        Las candidatas son lo mejor puntuado del radar${falloCartera ? '' : ' que no tenés'}: es la lectura automática de Valtia, no una recomendación personalizada.</p>`}
    </div>`;

  if (!vigente()) return;
  el.innerHTML = `<div class="im-wrap">${ctx.DATALIST || ''}
      <div class="im-grid">
        <div class="im-col">${regla}${cardAportes}${cardCompras}</div>
        ${der}
      </div></div>`;

  /* ── eventos propios (los de "La compré" y data-go los maneja panel.js) ── */
  el.querySelectorAll('[data-im-reintentar]').forEach(b => {
    b.onclick = () => reintentar(el, ctx, b);
  });
  const g = el.querySelector('#im-guardar');
  if (g) {
    const inA = el.querySelector('#im-aporte'), inC = el.querySelector('#im-compras');
    const msg = el.querySelector('#im-msg'), pc = el.querySelector('#im-porc');
    const calc = () => {
      const a = Number(inA.value), c = Math.round(Number(inC.value));
      pc.innerHTML = a > 0 && c >= 1 && c <= 6
        ? `<span class="n">${esc(money(a / c, 'USD'))}</span> por compra` : '';
    };
    inA.oninput = calc; inC.oninput = calc; calc();
    g.onclick = async () => {
      msg.textContent = ''; g.disabled = true;
      let r;
      try { r = await ctx.guardarRegla({ aporte: inA.value, compras: inC.value }); } catch (e) { r = 'No se pudo guardar.'; }
      if (r === true) return;   // guardarRegla ya refresca el plan y el Resumen
      if (!vigente()) return;
      g.disabled = false;
      msg.textContent = typeof r === 'string' ? r : 'No se pudo guardar.';
    };
  }
}
