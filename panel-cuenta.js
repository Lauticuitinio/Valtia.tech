// panel-cuenta.js — pestaña "Mi cuenta" del panel del inversor (Panel v3).
// Tres bloques, los del SPEC (sección "Mi cuenta"): TU PLAN (qué plan tiene y qué
// incluye), TUS DATOS (nombre, mail y contraseña, tal como los guarda Firebase Auth)
// y AVISOS POR MAIL (los interruptores del SPEC + cada cuánto).
//
// Dos reglas que ordenan todo este módulo:
//
// 1. Nada inventado. El alta, el próximo pago y el historial de pagos NO existen en
//    Firestore: no se dibujan ni se estiman. En su lugar va una línea honesta de que
//    el cobro se gestiona con nosotros y un mail de contacto. Lo mismo con el nombre:
//    si la cuenta no tiene displayName, se dice que no hay, no se arma uno con el mail.
//
// 2. Los avisos NO estrenan colección. Se cuelgan del documento que ya existe,
//    inversores/{email}/alertas/config (el de alertasMail() en panel.js, que lee
//    alertas_cartera.py), agregándole dos campos: "avisos" (el mapa de interruptores)
//    y "frecuenciaAvisos". Se escribe con merge para no pisar lo que ya hay ahí
//    (activo, frecuencia, tipos, umbralVar) — y por eso el guardado de panel.js
//    también va con merge. Mientras firestore.rules no acepte los campos nuevos, el
//    guardado va a fallar con permission-denied y se lo dice al usuario tal cual.
//
// La piel es la del panel: SOLO variables --v3-* de panel.js (así anda el tema
// oscuro). No importa panel.js —sería un import circular—: todo llega por ctx.
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const CSS_ID = 'v3-css-cuenta';
const SOPORTE = 'soporte@valtia.tech';

/* ── el documento donde viven los interruptores ────────────────────────────────
   Es el MISMO de las alertas del radar. Los campos nuevos son estos dos y nada más. */
const CAMPO_AVISOS = 'avisos';
const CAMPO_FREC = 'frecuenciaAvisos';

const CSS = `
.v3q{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0;max-width:1200px}
.v3q *{box-sizing:border-box}
.v3q-grid{display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:16px;align-items:start}
.v3q-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.v3q-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:18px 20px;min-width:0}
/* sirve para un div (la etiqueta de TU PLAN, que ya tiene su h2 con el nombre del
   plan) y para el h2 de TUS DATOS: el margen va explícito para que el h2 no traiga
   el suyo de fábrica */
.v3q-eyebrow{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--v3-mut);margin:0 0 8px}
.v3q-h{font:700 18px 'Playfair Display',serif;color:var(--v3-ink);line-height:1.25;margin:0}
.v3q-p{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:4px 0 0}
.v3q-n{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
/* TU PLAN: el único bloque sólido, sobre navy, con el dorado claro encima */
.v3q-plan{background:var(--v3-navy);border:1px solid var(--v3-navy);border-radius:12px;padding:22px 24px;color:#fff;min-width:0}
.v3q-plan .v3q-eyebrow{color:rgba(232,206,150,.85)}
.v3q-plan h2{font:600 26px 'Playfair Display',serif;color:#fff;line-height:1.2;margin:6px 0 4px}
.v3q-plan .sub{font-size:13px;color:rgba(255,255,255,.72);line-height:1.6;margin:0}
.v3q-feat{list-style:none;padding:0;margin:16px 0 0;border-top:1px solid rgba(255,255,255,.14)}
.v3q-feat li{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.6;
  color:rgba(255,255,255,.82);padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.v3q-feat li:last-child{border-bottom:none}
.v3q-feat li::before{content:'—';color:#E8CE96;flex:none;font-size:11px;line-height:1.85}
.v3q-acc{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.v3q .v3q-cta{display:inline-block;font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:#0E1830;background:#E8CE96;border:1px solid #E8CE96;padding:9px 14px;border-radius:7px;text-decoration:none;cursor:pointer}
.v3q .v3q-cta:hover{background:#fff;border-color:#fff;color:#0E1830}
.v3q .v3q-cta.linea{color:rgba(255,255,255,.8);background:transparent;border-color:rgba(255,255,255,.28)}
.v3q .v3q-cta.linea:hover{color:#0E1830;background:#fff;border-color:#fff}
.v3q-cobro{font-size:11.5px;color:rgba(255,255,255,.6);line-height:1.65;margin:16px 0 0;padding-top:13px;border-top:1px solid rgba(255,255,255,.14)}
.v3q-cobro a{color:#E8CE96;text-decoration:none}
.v3q-cobro a:hover{text-decoration:underline}
/* TUS DATOS */
.v3q-dato{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0;
  border-bottom:1px solid var(--v3-line2);min-width:0}
.v3q-dato:last-of-type{border-bottom:none}
.v3q-dato .izq{min-width:0}
.v3q-dato .l{font-size:11px;color:var(--v3-mut);line-height:1.5}
.v3q-dato .v{font:500 13.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);margin-top:2px;line-height:1.5;overflow-wrap:anywhere}
.v3q-dato .v.vacio{color:var(--v3-mut);font-style:italic}
.v3q-tag{display:inline-block;font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  padding:3px 7px;border-radius:4px;white-space:nowrap;line-height:1.5;vertical-align:middle}
.v3q-tag.ok{color:var(--v3-up);background:var(--v3-upBg)}
.v3q-tag.falta{color:var(--v3-warn);background:var(--v3-warnBg)}
.v3q-tag.pro{color:var(--v3-gold2);background:var(--v3-goldBg)}
.v3q-tag.aun{color:var(--v3-mut);background:var(--v3-neutro);letter-spacing:.06em;text-transform:none;font-weight:600;font-size:9.5px}
.v3q-btn{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-ink);
  background:transparent;border:1px solid var(--v3-line);border-radius:6px;padding:8px 12px;cursor:pointer;white-space:nowrap;flex:none}
.v3q-btn:hover:not([disabled]){border-color:var(--v3-gold);color:var(--v3-gold2)}
.v3q-btn[disabled]{opacity:.45;cursor:default}
.v3q-btn.fuerte{color:#fff;background:var(--v3-navy);border-color:var(--v3-navy)}
.v3q-btn.fuerte:hover:not([disabled]){color:#0E1830;background:#E8CE96;border-color:#E8CE96}
/* overflow-wrap: este mensaje lleva el mail de la cuenta, que es una sola palabra
   larga; en el pie de los avisos convive con el botón en una fila flex y a 375px
   sin esto empujaba el ancho */
.v3q-msg{font-size:12px;color:var(--v3-sub);line-height:1.65;margin:10px 0 0;min-width:0;overflow-wrap:anywhere}
.v3q-msg.ok{color:var(--v3-up)}
.v3q-msg.mal{color:var(--v3-dn)}
.v3q-nota{font-size:11.5px;color:var(--v3-mut);line-height:1.65;margin:12px 0 0}
.v3q-nota a,.v3q-msg a{color:var(--v3-gold);text-decoration:none}
.v3q-nota a:hover,.v3q-msg a:hover{color:var(--v3-gold2)}
/* AVISOS POR MAIL */
.v3q-banda{font-size:12px;color:var(--v3-warn);background:var(--v3-warnBg);border-radius:8px;
  padding:9px 12px;line-height:1.6;margin:12px 0 4px}
.v3q-av{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;
  padding:13px 0;border-bottom:1px solid var(--v3-line2);cursor:pointer;min-width:0}
.v3q-av:last-of-type{border-bottom:none}
/* la fila entera es un label: si el interruptor está bloqueado, el cursor no
   tiene que prometer que se puede tocar */
.v3q-av.quieto{cursor:default}
.v3q-av .t{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font:600 13.5px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.4}
.v3q-av .d{font-size:12px;color:var(--v3-mut);margin-top:3px;line-height:1.55}
.v3q-sw{position:relative;width:38px;height:22px;flex:none;display:block}
.v3q-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2}
.v3q-sw i{position:absolute;inset:0;display:block;border-radius:11px;background:var(--v3-track);
  border:1px solid var(--v3-line);transition:background .15s,border-color .15s}
.v3q-sw i::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
  background:var(--v3-card);border:1px solid var(--v3-line);transition:left .15s}
.v3q-sw input:checked+i{background:var(--v3-serie);border-color:var(--v3-serie)}
.v3q-sw input:checked+i::after{left:18px;border-color:var(--v3-serie)}
.v3q-sw input:focus-visible+i{outline:2px solid var(--v3-gold);outline-offset:2px}
.v3q-sw input[disabled]{cursor:default}
.v3q-sw input[disabled]+i{opacity:.5}
.v3q-frec{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;
  margin-top:14px;padding-top:12px;border-top:1px solid var(--v3-line)}
.v3q-frec .l{font-size:12.5px;color:var(--v3-sub)}
.v3q-seg{display:inline-flex;gap:2px;align-items:center;flex-wrap:wrap}
.v3q-seg button{font:500 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;cursor:pointer;
  color:var(--v3-mut);background:none;border:none;border-bottom:2px solid transparent;white-space:nowrap;transition:color .15s}
.v3q-seg button:hover{color:var(--v3-ink)}
.v3q-seg button.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}
.v3q-pie{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:16px}
.v3q-sk i{display:block;height:11px;border-radius:5px;background:var(--v3-track);margin:7px 0}
.v3q-sk i.corta{width:45%}
@media (max-width:980px){.v3q-grid{grid-template-columns:1fr}}
@media (max-width:420px){
  .v3q-card{padding:16px 14px}
  .v3q-plan{padding:18px 16px}
  .v3q-plan h2{font-size:23px}
  .v3q-dato{flex-wrap:wrap;gap:8px}
  .v3q-dato .v3q-btn{width:100%;text-align:center}
}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ── los planes que el panel sabe distinguir (S.plan, lo arma detectarPlan) ──
   Los textos son los de planes.html: no se repite acá ningún número que allá
   pueda cambiar (la cantidad de activos del radar, por ejemplo). */
const PLANES = {
  admin: {
    n: 'Administrador', s: 'Acceso completo al panel del inversor y a la gestión del fondo.',
    f: ['Todo lo de Cartera a medida', 'La gestión del fondo, que no ve ningún otro usuario',
        'El lector de informes y el alta de inversores'],
  },
  cliente: {
    n: 'Cartera a medida', s: 'Todo lo de Valtia PRO, más tu cartera armada con nosotros.',
    f: ['Todo lo de Valtia PRO incluido', 'Cartera armada según tu perfil y tu broker',
        'Revisión periódica de la cartera', 'Línea directa con el equipo'],
  },
  pro: {
    n: 'Valtia PRO', s: 'El análisis completo: todas las carteras, el radar y los informes.',
    f: ['Todas las carteras, con cada rotación fechada y justificada',
        'Radar de valuación completo, con puntaje y veredicto diario',
        'Informes de research completos',
        'Panel de bonos completo: curva soberana con TIR, paridad y duration'],
  },
  gratis: {
    n: 'Cuenta gratuita', s: 'Una cartera completa, tus posiciones y las herramientas.',
    f: ['Cartera Top 10 S&P 500 completa, con tesis y rotaciones',
        'Mi cartera: tus posiciones con la lectura de Valtia',
        'Inversión mensual guiada por el radar',
        'Noticias, fichas de activo y cotizaciones en vivo'],
  },
};
const planDe = S => PLANES[S.isAdmin ? 'admin' : S.cliente ? 'cliente' : S.pro ? 'pro' : 'gratis'];

/* ── los interruptores del SPEC ───────────────────────────────────────────────
   "ya" dice si HOY hay alguien mandando ese aviso. Al 23/09/2026 no lo hay para
   ninguno: el único mail que sale es el de las alertas del radar (alertas_cartera.py),
   que se prende en Resumen y usa otros campos de este mismo documento. Cuando el
   envío de uno exista, se le pone ya:true acá y desaparece su "todavía no".
   "cierre" (25/09/2026, pedido de Lauti después de ver el de Senta) sí sale: lo
   manda cierre_cartera.py desde precios_intradia.py al cierre de cada rueda, solo
   a quien lo prende acá y con el mail verificado. */
const AVISOS = [
  { k: 'cierre', pro: false, t: 'Cierre diario de tu cartera',
    d: 'Cada día de rueda, al cierre: cuánto vale, cuánto se movió en pesos y en dólares, contra el S&P 500 y lo que más se movió.', ya: true },
  { k: 'compraventa', pro: true, t: 'Compras y ventas',
    d: 'El mismo día que operamos, con el precio y la razón.', ya: false },
  { k: 'rotacion', pro: true, t: 'Rotaciones de las carteras que seguís',
    d: 'Qué entra, qué sale y por qué.', ya: false },
  { k: 'informes', pro: false, t: 'Informes nuevos',
    d: 'Cuando sale un informe de una empresa que tenés o seguís.', ya: false },
  { k: 'eventos', pro: false, t: 'Eventos de tus activos',
    d: 'Resultados, cupones y vencimientos, unos días antes.', ya: false },
  { k: 'newsletter', pro: false, t: 'Newsletter',
    d: 'Las claves de la semana y lo que se movió en el mercado.', ya: false },
  { k: 'resumen', pro: false, t: 'Resumen mensual de tu cartera',
    d: 'Cómo te fue en el mes contra tu índice de referencia.', ya: false },
];
const FRECS = [['momento', 'Al momento'], ['diaria', 'Resumen diario']];
const FREC_DEF = 'diaria';   // como el resto de los mails: como mucho uno por día

const db = () => getFirestore(getApp());
const refConfig = email => doc(db(), 'inversores', email, 'alertas', 'config');

/* ¿la cuenta tiene contraseña propia, o entra con Google? Firebase lo dice en
   providerData. Sin ese dato (no debería pasar) se ofrece el cambio igual. */
function tieneContrasenia(user) {
  try {
    const p = (user && user.providerData) || [];
    if (!p.length) return true;
    return p.some(x => x && x.providerId === 'password');
  } catch (e) { return true; }
}

function codigo(e) {
  return String((e && (e.code || e.message)) || e || '').slice(0, 70);
}

let _seq = 0;

export function renderCuenta(el, ctx) {
  return pintar(el, ctx);
}

async function pintar(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S.email;
  const vigente = () => seq === _seq && ctx.S.email === email;
  ponerCss();

  el.innerHTML = `<div class="v3q"><div class="v3q-grid">
    <div class="v3q-col">${bloquePlan(ctx)}${bloqueDatos(ctx)}</div>
    <div class="v3q-col"><div class="v3q-card" id="v3q-avisos">
      <h2 class="v3q-h">Avisos por mail</h2>
      <p class="v3q-p">Elegí qué te queremos contar y cada cuánto.</p>
      <div class="v3q-sk" aria-hidden="true"><i></i><i class="corta"></i><i></i><i class="corta"></i></div>
    </div></div></div></div>`;

  engancharDatos(el, ctx);
  await pintarAvisos(el, ctx, vigente);
}

/* ───────────────────────── TU PLAN ───────────────────────── */
function bloquePlan(ctx) {
  const esc = ctx.esc, S = ctx.S, p = planDe(S);
  const puedeSubir = !S.isAdmin && !S.cliente && !S.pro;
  return `<section class="v3q-plan">
    <div class="v3q-eyebrow">Tu plan</div>
    <h2>${esc(p.n)}</h2>
    <p class="sub">${esc(p.s)}</p>
    <ul class="v3q-feat">${p.f.map(x => `<li><span>${esc(x)}</span></li>`).join('')}</ul>
    <div class="v3q-acc">
      <a class="v3q-cta" href="/planes">${puedeSubir ? 'Ver planes y precios' : 'Ver los planes'}</a>
      <a class="v3q-cta linea" href="mailto:${SOPORTE}?subject=${encodeURIComponent('Mi plan en Valtia')}">Escribinos</a>
    </div>
    <p class="v3q-cobro">Todavía no se cobra desde la web: el alta, el cambio de plan y la baja los
      gestionamos con vos por mail, así que en tu cuenta no vas a ver ni la fecha de alta ni un
      historial de pagos. Para cualquiera de las tres cosas, escribinos a
      <a href="mailto:${SOPORTE}">${SOPORTE}</a>.</p>
  </section>`;
}

/* ───────────────────────── TUS DATOS ───────────────────────── */
function bloqueDatos(ctx) {
  const esc = ctx.esc, S = ctx.S, u = S.user || {};
  const nombre = String(u.displayName || '').trim();
  const conPass = tieneContrasenia(u);
  const verif = !!S.verificado;
  const puedeReenviar = !verif && typeof window.reenviarVerificacion === 'function';
  // h2 y no div: la tarjeta del plan ya tiene su h2 (el nombre del plan) y la de
  // avisos el suyo; sin este, esta tarjeta quedaba sin título para un lector de
  // pantalla y la página saltaba de "Tu plan" a "Avisos por mail"
  return `<section class="v3q-card">
    <h2 class="v3q-eyebrow">Tus datos</h2>
    <div class="v3q-dato">
      <div class="izq"><div class="l">Nombre</div>
        <div class="v${nombre ? '' : ' vacio'}">${nombre ? esc(nombre) : 'Tu cuenta no tiene un nombre cargado'}</div></div>
    </div>
    <div class="v3q-dato">
      <div class="izq"><div class="l">Mail de la cuenta</div>
        <div class="v">${esc(S.email || '—')} <span class="v3q-tag ${verif ? 'ok' : 'falta'}">${verif ? 'Verificado' : 'Sin verificar'}</span></div></div>
      ${puedeReenviar ? '<button type="button" class="v3q-btn" data-q="verif">Reenviar el mail</button>' : ''}
    </div>
    <div class="v3q-dato">
      <div class="izq"><div class="l">Contraseña</div>
        <div class="v">${conPass ? 'La cambiás desde un mail que te mandamos' : 'La maneja tu cuenta de Google'}</div></div>
      ${conPass ? '<button type="button" class="v3q-btn fuerte" data-q="pass">Cambiar la contraseña</button>' : ''}
    </div>
    <p class="v3q-msg" id="v3q-dmsg">${conPass
      ? 'No te pedimos la contraseña actual acá: tocás el botón y te llega un correo con el enlace para ponerle una nueva.'
      : 'Entrás con Google, así que la contraseña se cambia en tu cuenta de Google y no desde acá.'}</p>
    ${!verif ? `<p class="v3q-nota">Hasta que verifiques el mail, Mi cartera, la inversión mensual y
      los avisos quedan bloqueados: las reglas del servidor no dejan leer ni escribir tus datos.</p>` : ''}
  </section>`;
}

function engancharDatos(el, ctx) {
  const S = ctx.S;
  const msg = el.querySelector('#v3q-dmsg');
  const poner = (txt, clase) => { if (msg) { msg.textContent = txt; msg.className = 'v3q-msg' + (clase ? ' ' + clase : ''); } };

  // el reenvío del mail de verificación ya vive en index.html (avisa él mismo):
  // no se duplica acá, se llama al que existe
  const bVerif = el.querySelector('[data-q="verif"]');
  if (bVerif) bVerif.addEventListener('click', () => {
    const fallo = e => poner('No se pudo reenviar el mail (' + codigo(e) + '). Probá de nuevo en un rato.', 'mal');
    try { Promise.resolve(window.reenviarVerificacion()).catch(fallo); } catch (e) { fallo(e); }
  });

  const bPass = el.querySelector('[data-q="pass"]');
  if (bPass) bPass.addEventListener('click', async () => {
    const mail = S.email;
    if (!mail) return;
    bPass.disabled = true;
    poner('Mandando el mail…');
    try {
      await sendPasswordResetEmail(getAuth(getApp()), mail);
      poner(`Listo: te mandamos un correo a ${mail} con el enlace para poner una contraseña nueva. Revisá también el correo no deseado.`, 'ok');
      if (typeof ctx.toast === 'function') ctx.toast('Mail enviado a ' + mail);
    } catch (e) {
      poner('No se pudo mandar el mail (' + codigo(e) + '). Probá de nuevo en un rato o escribinos a ' + SOPORTE + '.', 'mal');
    }
    bPass.disabled = false;
  });
}

/* ───────────────────────── AVISOS POR MAIL ───────────────────────── */
async function pintarAvisos(el, ctx, vigente) {
  const box = el.querySelector('#v3q-avisos');
  if (!box) return;
  const esc = ctx.esc, S = ctx.S;
  const cabeza = `<h2 class="v3q-h">Avisos por mail</h2>
    <p class="v3q-p">Elegí qué te queremos contar y cada cuánto.</p>`;

  // sin el mail verificado las reglas no dejan ni leer la configuración
  if (!S.verificado) {
    box.innerHTML = cabeza + `<p class="v3q-nota">Para recibir avisos por mail, primero verificá tu
      dirección. El enlace te llegó cuando creaste la cuenta.</p>`;
    return;
  }

  let cfg = null;
  try {
    const sn = await getDoc(refConfig(S.email));
    if (sn.exists()) cfg = sn.data();
  } catch (e) {
    // sin poder leer lo que hay, no se ofrece guardar: se pisaría con los valores de fábrica
    if (!vigente()) return;
    box.innerHTML = cabeza + `<p class="v3q-nota">No pudimos leer tu configuración de avisos
      (${esc(codigo(e))}). Recargá la página para verla o cambiarla.</p>`;
    return;
  }
  if (!vigente()) return;

  const guardados = (cfg && typeof cfg[CAMPO_AVISOS] === 'object' && cfg[CAMPO_AVISOS]) || {};
  const frec = FRECS.some(([k]) => k === (cfg && cfg[CAMPO_FREC])) ? cfg[CAMPO_FREC] : FREC_DEF;
  // apagados por defecto, y los que todavía no tienen quién los mande arrancan
  // apagados aunque nunca se hayan tocado
  const estado = k => guardados[k] === true;
  const faltantes = AVISOS.filter(a => !a.ya).length;
  // si faltan TODOS, lo dice la banda de arriba y no hace falta repetirlo seis veces;
  // la marca por fila aparece cuando algunos sí salen y otros no
  const marcaFila = faltantes > 0 && faltantes < AVISOS.length;
  // Los dos que el SPEC marca (PRO) son del plan PRO. A una cuenta gratuita se le
  // muestran igual, pero sin interruptor: dejarla prenderlos y contestarle
  // "guardado" sería prometerle un mail que su plan no incluye. Si ya venían
  // prendidos (fue PRO y dejó de serlo) quedan marcados y el guardado no los pisa.
  const sinPlan = a => !!a.pro && !S.pro;
  const hayBloqueados = AVISOS.some(sinPlan);

  const fila = a => `<label class="v3q-av${sinPlan(a) ? ' quieto' : ''}">
    <div class="izq" style="min-width:0">
      <div class="t"><span>${esc(a.t)}</span>${a.pro ? `<span class="v3q-tag pro">${sinPlan(a) ? 'Con Valtia PRO' : 'PRO'}</span>` : ''}${
        marcaFila && !a.ya ? '<span class="v3q-tag aun">todavía no lo estamos mandando</span>' : ''}</div>
      <div class="d">${esc(a.d)}</div>
    </div>
    <span class="v3q-sw"><input type="checkbox" data-av="${a.k}"${estado(a.k) ? ' checked' : ''}${
      sinPlan(a) ? ' disabled' : ''} aria-label="${esc(a.t)}"><i></i></span>
  </label>`;

  box.innerHTML = cabeza +
    (faltantes ? `<p class="v3q-banda">${faltantes === AVISOS.length
      ? 'Ninguno de estos avisos se está mandando todavía. Guardamos tu elección para cuando el envío exista; hasta entonces no te va a llegar nada por acá.'
      : 'Los marcados abajo todavía no se están mandando. Guardamos tu elección para cuando el envío exista.'}</p>` : '') +
    AVISOS.map(fila).join('') +
    (hayBloqueados ? `<p class="v3q-nota">Los que dicen «Con Valtia PRO» llegan con ese plan:
      <a href="/planes">mirá los planes</a>.</p>` : '') +
    `<div class="v3q-frec"><span class="l">Cuándo mandarlos</span>
      <div class="v3q-seg" role="group" aria-label="Frecuencia de los avisos">${FRECS.map(([k, t]) =>
        `<button type="button" data-frec="${k}" class="${k === frec ? 'on' : ''}" aria-pressed="${k === frec}">${t}</button>`).join('')}</div></div>
    <div class="v3q-pie"><button type="button" class="v3q-btn fuerte" id="v3q-ok">Guardar</button>
      <span class="v3q-msg" id="v3q-amsg" style="margin:0">Llegarían a ${esc(S.email)}.</span></div>
    <p class="v3q-nota">Las alertas del radar (zona de valor, resultados, vencimientos) son otra cosa
      y esas sí salen hoy: tienen su propio interruptor al final de
      <a href="#panel/inicio" data-go="inicio">Resumen</a>, que aparece cuando ya cargaste
      alguna posición.</p>`;

  let elegida = frec;
  box.querySelectorAll('[data-frec]').forEach(b => b.addEventListener('click', () => {
    elegida = b.dataset.frec;
    box.querySelectorAll('[data-frec]').forEach(x => {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', String(on));
    });
  }));

  const ok = box.querySelector('#v3q-ok'), msg = box.querySelector('#v3q-amsg');
  const poner = (txt, clase) => { msg.textContent = txt; msg.className = 'v3q-msg' + (clase ? ' ' + clase : ''); };
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    poner('Guardando…');
    const mapa = {};
    AVISOS.forEach(a => {
      const c = box.querySelector(`[data-av="${a.k}"]`);
      mapa[a.k] = !!(c && c.checked);
    });
    try {
      // merge: este documento también guarda las alertas del radar (activo,
      // frecuencia, tipos, umbralVar) y no se pueden pisar desde acá
      await setDoc(refConfig(S.email), {
        [CAMPO_AVISOS]: mapa,
        [CAMPO_FREC]: elegida,
        actualizado: serverTimestamp(),
      }, { merge: true });
      const n = Object.values(mapa).filter(Boolean).length;
      const pendiente = faltantes === AVISOS.length ? ' Todavía no los estamos mandando.' : '';
      poner(n
        ? `Guardado: ${n} aviso${n === 1 ? '' : 's'} para ${S.email}, ${elegida === 'momento' ? 'al momento' : 'en un resumen diario'}.${pendiente}`
        : 'Guardado: por ahora no querés ningún aviso.', 'ok');
    } catch (e) {
      const c = codigo(e);
      poner(/permission-denied|insufficient/i.test(c)
        ? 'Todavía no podemos guardar esto: falta habilitar los campos nuevos del lado del servidor. Escribinos a ' + SOPORTE + ' si lo necesitás ya.'
        : 'No se pudo guardar (' + c + '). Probá de nuevo en un rato.', 'mal');
    }
    ok.disabled = false;
  });
}
