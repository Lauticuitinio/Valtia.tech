// panel-comprar.js — pestaña "Qué comprar" del panel del inversor (Panel v3).
// Estructura y valores: «Pestaña 3 · Qué comprar» del SPEC y el prototipo «Valtia
// Panel v3» del zip completo (24/09/2026): la línea de arriba (radar sobre n · k en
// zona de compra · m ya las tenés), una fila por activo con sus etiquetas, dos barras
// finas (Valor y RSI), precio, variación de 30 días y "La compré" / "Compré más";
// las filas en zona de compra con fondo #FDFBF4 y el pie con la definición.
// Piel vigente del SPEC §0: IBM Plex Sans en todo (sin Plex Mono ni Playfair), cifras
// tabulares, etiquetas de 6 px, botones de radio 8 (el primario navy, el secundario
// con el borde dorado sutil) y el dorado claro solo sobre azul. Los colores salen de
// las variables --v3-* de panel.js, así anda el tema oscuro. No importa panel.js:
// todo llega por ctx.
//
// Lo que se conserva de la versión anterior: el orden de ordenComprar, en qué
// carteras Valtia está cada activo (mapaCarteras), los múltiplos solo si Firestore
// dejó leer radarPro (el gate real, no el plan declarado), la marca "no gana plata",
// la zona del RSI y el botón "La compré" con el mecanismo data-compra / data-host.
import { tickerFicha, desglose } from './activos.js?v=7';

const CSS_ID = 'v3-css-comprar';

// La grilla del prototipo necesita 856px de fila. Cuando la caja es más angosta (el
// lateral de 232px + una pantalla de laptop, o el celular) la fila se reacomoda en dos:
// arriba el activo; abajo las barras (hasta 360px), precio y variación, y el botón.
// Va por container query (el ancho real de la caja) y, de respaldo, por media query.
const DOS_LINEAS = `
.v3c-row{grid-template-columns:minmax(0,360px) 1fr auto;grid-template-areas:"act act act" "bar px btn" "bar vr btn";gap:4px 14px;padding:14px 16px}
.v3c-act{grid-area:act;margin-bottom:8px}
.v3c-bar{grid-area:bar}
.v3c-px{grid-area:px;align-self:end;font-size:14.5px}
.v3c-var{grid-area:vr;align-self:start}
.v3c-btnw{grid-area:btn}
.v3c-pro{padding:16px}`;
const MUY_ANGOSTO = `.v3c-z{display:none}`;

// valores del prototipo (estilos inline de la pestaña) pasados a variables
const CSS = `
.v3c{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0;max-width:100%;font-variant-numeric:tabular-nums}
.v3c a{text-decoration:none}
.v3c a:focus-visible,.v3c button:focus-visible{outline:2px solid var(--v3-focus);outline-offset:2px}
.v3c-top{display:flex;align-items:center;justify-content:space-between;gap:8px 14px;flex-wrap:wrap;margin-bottom:16px}
.v3c-resumen{font-size:14.5px;color:var(--v3-sub);line-height:1.5}
.v3c-resumen b{color:var(--v3-ink);font-weight:600}
.v3c a.v3c-ir{font:600 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-gold);white-space:nowrap}
.v3c a.v3c-ir:hover{color:var(--v3-gold2)}
.v3c-aviso{font-size:14px;line-height:1.55;color:var(--v3-sub);background:var(--v3-warnBg);border-radius:10px;padding:10px 14px;margin:-4px 0 14px}
.v3c-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow-x:auto;container-type:inline-size;container-name:v3c}
.v3c-row{display:grid;grid-template-columns:minmax(220px,1.6fr) minmax(160px,1fr) 120px 110px 130px;gap:18px;align-items:center;
  padding:14px 22px;border-bottom:1px solid var(--v3-line2)}
.v3c-rows>.v3c-row:last-child{border-bottom:none}
/* en zona de compra: el crema del SPEC (#FDFBF4) */
.v3c-row.zona{background:var(--v3-hl)}
.v3c-act,.v3c-bar{min-width:0}
.v3c-id{display:flex;align-items:baseline;gap:4px 8px;flex-wrap:wrap;min-width:0}
.v3c .v3c-tk{font:700 15.5px 'IBM Plex Sans',sans-serif;color:var(--v3-gold)}
.v3c a.v3c-tk:hover{color:var(--v3-gold2)}
.v3c-nm{font-size:13.5px;color:var(--v3-sub);overflow-wrap:anywhere}
.v3c-sec{font:500 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--v3-mut)}
.v3c-mult{font-size:12.5px;color:var(--v3-mut);margin-top:5px;line-height:1.5}
.v3c-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.v3c-tag{font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:6px;white-space:nowrap;line-height:1.5;
  max-width:100%;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
.v3c-tag.v-infra{color:var(--v3-up);background:var(--v3-upBg)}
.v3c-tag.v-precio{color:var(--v3-gold2);background:var(--v3-goldBg)}
.v3c-tag.v-cara{color:var(--v3-dn);background:var(--v3-dnBg)}
.v3c-tag.v-sin{color:var(--v3-mut);background:var(--v3-neutro)}
/* ◎ zona de compra: texto blanco sobre navy (en oscuro el token se invierte) */
.v3c-tag.zona{color:var(--v3-btnTx);background:var(--v3-btn)}
.v3c-tag.tengo{color:var(--v3-sub);border:1px solid var(--v3-line);padding:1px 6px}
.v3c-tag.warn{color:var(--v3-warn);background:var(--v3-warnBg);cursor:help}
.v3c-tag.cart{color:var(--v3-sub);background:var(--v3-neutro)}
.v3c-bl{display:flex;justify-content:space-between;gap:8px;font:600 11px 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-mut)}
.v3c-bl+.v3c-tr+.v3c-bl{margin-top:7px}
.v3c-bl>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v3c-bl b{font-weight:600;color:var(--v3-ink);flex:none}
.v3c-z{font-weight:500}
.v3c-tr{height:4px;border-radius:2px;background:var(--v3-track);margin-top:5px;position:relative;overflow:hidden}
.v3c-tr i{position:absolute;top:0;bottom:0;left:0;border-radius:2px;display:block}
/* la barra de Valor es navy (en oscuro, crema: el navy no se ve sobre el fondo) */
.v3c-tr i.val{background:var(--v3-btn)}
.v3c-px{text-align:right;font:600 15.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);white-space:nowrap}
.v3c-var{text-align:right;font:500 13.5px 'IBM Plex Sans',sans-serif;white-space:nowrap}
.v3c-var span{font:500 11.5px 'IBM Plex Sans',sans-serif;color:var(--v3-mut)}
.v3c-btnw{text-align:right}
/* "La compré" es el botón primario (navy) y "Compré más" el secundario (.sec) de panel.js */
.v3c .vp-btn.v3c-btn{white-space:nowrap}
.v3c-row>.vp-form{grid-column:1/-1;margin-top:0}
.v3c-pro{border-top:1px solid var(--v3-line);padding:18px 22px;text-align:center}
.v3c-pro b{display:block;font:600 17px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.3}
.v3c-pro p{font-size:14px;color:var(--v3-sub);line-height:1.6;margin:6px auto 12px;max-width:560px}
.v3c-nota{font-size:13px;color:var(--v3-mut);line-height:1.7;margin:18px 0 0;max-width:760px;text-align:justify;hyphens:auto}
.v3c-nota+.v3c-nota{margin-top:8px}
@media (max-width:480px){.v3c-nota{text-align:left}}
.v3c-vacio{padding:22px 24px;font-size:14px;color:var(--v3-sub);line-height:1.6}
.v3c-vacio b{display:block;font:600 17px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.3;margin-bottom:4px}
.v3c-vacio .vp-btn{margin-top:12px}
/* cargando (SPEC «Estados»): bloques #F0EDE5 con la altura de las filas */
.v3c-sk i{display:block;height:10px;border-radius:6px;background:var(--v3-skel);margin:6px 0;animation:v3c-pulso 1.4s ease-in-out infinite}
.v3c-sk .v3c-px i,.v3c-sk .v3c-var i,.v3c-sk .v3c-btnw i{margin-left:auto;width:70%}
.v3c-sk .v3c-btnw i{height:30px;border-radius:8px}
@keyframes v3c-pulso{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.v3c-sk i{animation:none}}
@container v3c (max-width:860px){${DOS_LINEAS}}
@media (max-width:760px){${DOS_LINEAS}}
@container v3c (max-width:480px){${MUY_ANGOSTO}}
@media (max-width:480px){${MUY_ANGOSTO}}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ── utilidades ── */
const finito = n => n != null && n !== '' && typeof n !== 'boolean' && isFinite(Number(n));
const menos = s => String(s).replace(/^-/, '−');
const ancho = n => finito(n) ? Math.max(0, Math.min(100, Number(n))) : 0;
const ZONA_RSI = { Debil: 'Débil' };
// RSI: ≥70 sobrecomprado (rojo), ≤35 bajo (verde), el resto dorado (prototipo, línea 832)
const tonoRsi = r => r == null ? 'var(--v3-mut)' : r >= 70 ? 'var(--v3-dn)' : r <= 35 ? 'var(--v3-up)' : 'var(--v3-gold)';
const claseVer = v => v === 'Infravalorada' ? 'v-infra' : v === 'En precio' ? 'v-precio' : v === 'Estirada' ? 'v-cara' : 'v-sin';

async function seguro(f, def) {
  try { const v = await f(); return v == null ? def : v; } catch (e) { return def; }
}

/* precio "de hoy" en dólares: preciosInformes (15 min en rueda) y si no, el del radar */
function precioDe(a, f, pi) {
  if (f && pi[f] && finito(pi[f].p)) return Number(pi[f].p);
  return finito(a.precio) ? Number(a.precio) : null;
}

/* variación de 30 días del precio en dólares: la serie de la ficha (el ADR para
   las argentinas) y si no hay ficha, la del símbolo del radar */
function var30(a, f, dg) {
  try {
    const d = desglose(f || a.sym, dg || {}, null, null).find(x => x.clave === 'mes');
    return d && finito(d.pct) ? Number(d.pct) : null;
  } catch (e) { return null; }
}

/* los múltiplos que existan (solo llegan si Firestore dejó leer radarPro) */
function multiplos(a) {
  const m1 = n => menos(Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 }));
  const m0 = n => menos(Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }));
  const p = [];
  if (finito(a.per)) p.push('PER ' + m1(a.per) + 'x');
  if (finito(a.evebitda)) p.push('EV/EBITDA ' + m1(a.evebitda) + 'x');
  if (finito(a.fcfy)) p.push('FCF ' + m1(a.fcfy) + '%');
  if (finito(a.roe)) p.push('ROE ' + m0(a.roe) + '%');
  if (finito(a.calidadScore)) p.push('Calidad ' + m0(a.calidadScore));
  return p.join(' · ');
}

/* fecha del radar (dd/mm, hora de Buenos Aires) a partir de actualizado_utc */
function fechaRadar(ts, ctx) {
  if (!ts) return '';
  // una fecha rara no puede tirar abajo la pestaña: sin fecha, el pie va sin ella
  try {
    let ms = NaN;
    if (typeof ts === 'object' && ts.seconds != null) ms = Number(ts.seconds) * 1000;
    else if (typeof ts === 'object' && typeof ts.toDate === 'function') ms = ts.toDate().getTime();
    else if (typeof ts === 'number') ms = ts;
    else ms = Date.parse(String(ts));
    if (isFinite(ms)) return ctx.fmtC(new Date(ms - 3 * 3600e3).toISOString().slice(0, 10));
    const m = /^\d{4}-\d{2}-\d{2}/.exec(String(ts));
    return m ? ctx.fmtC(m[0]) : '';
  } catch (e) { return ''; }
}

function esqueleto() {
  const fila = `<div class="v3c-row v3c-sk" aria-hidden="true">
      <div class="v3c-act"><i style="width:38%"></i><i style="width:64%"></i></div>
      <div class="v3c-bar"><i></i><i></i></div>
      <div class="v3c-px"><i></i></div><div class="v3c-var"><i></i></div><div class="v3c-btnw"><i></i></div></div>`;
  return `<div class="v3c"><div class="v3c-card" role="status" aria-busy="true" aria-label="Cargando el radar"><div class="v3c-rows">${fila.repeat(5)}</div></div>
    <p class="v3c-nota">Cargando el radar…</p></div>`;
}

function estadoVacio(el, ctx, titulo, texto) {
  el.innerHTML = `<div class="v3c"><div class="v3c-card v3c-vacio"><b>${titulo}</b>${texto}
      <div><button type="button" class="vp-btn mini sec" data-v3c-reintentar>Reintentar</button></div></div></div>`;
  const b = el.querySelector('[data-v3c-reintentar]');
  if (b) b.addEventListener('click', () => {
    try { ctx.invalidar('radar', 'pi', 'dg'); } catch (e) {}
    renderComprar(el, ctx);
  });
}

let _seq = 0;
// de qué cuenta es la lista que quedó dibujada en cada caja: si entra otra cuenta, no
// se le deja a la vista el "ya la tenés" de la anterior mientras carga la suya
const _dueno = new WeakMap();

export async function renderComprar(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S.email;
  const vigente = () => seq === _seq && ctx.S.email === email;
  try {
    ponerCss();
    // el esqueleto solo la primera vez: al redibujar (compra, cambio de plan) la
    // lista anterior queda a la vista hasta que llega la nueva, si es de la misma cuenta
    if (!el.querySelector('.v3c-rows') || el.querySelector('.v3c-sk') || _dueno.get(el) !== email) el.innerHTML = esqueleto();
    const [rd, cc, pi, dg, mapa] = await Promise.all([
      seguro(() => ctx.radarDoc(), {}),
      seguro(() => ctx.carteraCalc(), { pos: [], fallo: true }),
      seguro(() => ctx.preciosInf(), {}),
      seguro(() => ctx.desglosePer(), {}),
      seguro(() => ctx.mapaCarteras(), {}),
    ]);
    if (!vigente()) return;
    const esc = ctx.esc, S = ctx.S;
    const lista = ctx.ordenComprar(rd.activos || []);
    if (!lista.length) {
      estadoVacio(el, ctx, 'El radar no está disponible ahora',
        'La lectura de Valtia se actualiza una vez por día. Probá de nuevo en un rato.');
      return;
    }
    // el gate lo define lo que Firestore dejó leer, no una variable del cliente
    const conRatios = !!rd.pro;
    const ten = ctx.tenencias(cc || { pos: [] });
    const tieneSet = ten.radar || new Set();
    const bloqueado = !S.verificado;
    const fecha = fechaRadar(rd._ts, ctx);
    const n = lista.length;
    const enZona = lista.filter(a => a.entrada).length;
    const yaTenes = lista.filter(a => tieneSet.has(a.sym)).length;
    const fmtUsd = p => p == null ? '—' : 'US$' + ctx.num(p, Math.abs(p) >= 1000 ? 0 : 2);

    const fila = a => {
      const f = tickerFicha(a.sym), p = precioDe(a, f, pi), tengo = tieneSet.has(a.sym);
      const sc = finito(a.score) ? Math.round(Number(a.score)) : null;
      const r = finito(a.rsi) ? Number(a.rsi) : null;
      const v = var30(a, f, dg);
      const mult = conRatios ? multiplos(a) : '';
      const zona = ZONA_RSI[a.rsiZona] || a.rsiZona || '';
      // en qué carteras Valtia está (solo las que su plan deja leer): por la ficha y por el símbolo
      const enC = [...new Set([...((f && mapa[f]) || []), ...(mapa[a.sym] || [])])];
      const tk = f ? `<a class="v3c-tk" href="/activo?t=${encodeURIComponent(f)}">${esc(a.sym)}</a>`
        : `<span class="v3c-tk">${esc(a.sym)}</span>`;
      const tr = tonoRsi(r);
      return `<div class="v3c-row${a.entrada ? ' zona' : ''}" data-host>
        <div class="v3c-act">
          <div class="v3c-id">${tk}${a.nombre ? `<span class="v3c-nm">${esc(a.nombre)}</span>` : ''}${a.sector ? `<span class="v3c-sec">${esc(a.sector)}</span>` : ''}</div>
          ${mult ? `<div class="v3c-mult">${esc(mult)}</div>` : ''}
          <div class="v3c-tags">
            ${a.veredicto ? `<span class="v3c-tag ${claseVer(a.veredicto)}">${esc(a.veredicto)}</span>` : ''}
            ${a.entrada ? '<span class="v3c-tag zona">◎ zona de compra</span>' : ''}
            ${tengo ? '<span class="v3c-tag tengo">ya la tenés</span>' : ''}
            ${a.pierdePlata ? '<span class="v3c-tag warn" title="El puntaje mide qué tan barata cotiza; esta empresa hoy no gana dinero">no gana plata</span>' : ''}
            ${enC.map(c => `<span class="v3c-tag cart">en ${esc(c)}</span>`).join('')}
          </div>
        </div>
        <div class="v3c-bar">
          <div class="v3c-bl" title="Puntaje de valor, de 0 a 100"><span>Valor</span><b>${sc != null ? sc : '—'}</b></div>
          <div class="v3c-tr"><i class="val" style="width:${ancho(sc)}%"></i></div>
          <div class="v3c-bl"${zona ? ` title="RSI ${esc(zona)}"` : ''}><span>RSI${zona ? `<span class="v3c-z"> · ${esc(zona)}</span>` : ''}</span><b style="color:${tr}">${r != null ? r.toFixed(0) : '—'}</b></div>
          <div class="v3c-tr"><i style="width:${ancho(r)}%;background:${tr}"></i></div>
        </div>
        <div class="v3c-px">${fmtUsd(p)}</div>
        <div class="v3c-var" style="color:${v == null ? 'var(--v3-mut)' : v >= 0 ? 'var(--v3-up)' : 'var(--v3-dn)'}">${v != null ? menos(ctx.pct(v, 1)) : '—'} <span>30d</span></div>
        <div class="v3c-btnw"><button type="button" class="vp-btn mini v3c-btn${tengo ? ' sec' : ''}" data-compra="${esc(a.sym)}" data-px="${p != null && f ? p : ''}"${bloqueado ? ' disabled title="Verificá tu mail para registrar compras"' : ''}>${tengo ? 'Compré más' : 'La compré'}</button></div>
      </div>`;
    };

    const zonaTxt = enZona ? `${enZona} en zona de compra` : 'ninguno en zona de compra';
    const yaTxt = yaTenes ? ` · ${yaTenes} ya ${yaTenes === 1 ? 'la tenés' : 'las tenés'}` : '';
    const avisos = [
      cc && cc.fallo && S.verificado ? 'No pudimos leer tu cartera: puede faltar la marca "ya la tenés". Probá recargar en un momento.' : '',
      bloqueado ? 'Verificá tu mail para registrar compras desde acá: hasta entonces "La compré" queda apagado.' : '',
    ].filter(Boolean).map(t => `<div class="v3c-aviso">${esc(t)}</div>`).join('');

    el.innerHTML = `<div class="v3c">
      ${ctx.DATALIST || ''}
      <div class="v3c-top">
        <span class="v3c-resumen">Radar sobre ${n} activos · <b>${zonaTxt}</b>${yaTxt}</span>
        <a class="v3c-ir" href="#panel/carteras" data-go="carteras">Ver carteras Valtia →</a>
      </div>
      ${avisos}
      <div class="v3c-card">
        <div class="v3c-rows">${lista.map(fila).join('')}</div>
        ${conRatios ? '' : `<div class="v3c-pro">
          <b>Los números detrás de la lectura son PRO</b>
          <p>La lista completa, el veredicto y la zona de compra son gratis. Con PRO ves el PER, el EV/EBITDA, el rendimiento del flujo de caja libre (FCF), el ROE y el puntaje de calidad de cada uno.</p>
          <a class="vp-btn mini" href="/planes">Ver planes</a></div>`}
      </div>
      <p class="v3c-nota">Zona de compra: puntaje de valor ≥ 60 y RSI &lt; 45. Primero van las que están en zona y después el resto, por puntaje. Es la lectura automática de Valtia sobre ${n} activos${fecha ? `, radar del ${esc(fecha)}` : ''}; no es una recomendación personalizada. Precios en dólares, las argentinas por su ADR; la variación es la de los últimos 30 días.</p>
      <p class="v3c-nota">"La compré" registra la compra en Mi cartera y en tu plan de inversión mensual, con el mercado, la cantidad, el precio que pagaste y el broker. Si compraste en BYMA (CEDEAR o acción local), el precio va en pesos.</p>
    </div>`;
    _dueno.set(el, email);
  } catch (e) {
    if (!vigente()) return;
    estadoVacio(el, ctx, 'No pudimos cargar el radar', 'Puede ser la conexión. Probá de nuevo en un momento.');
  }
}
