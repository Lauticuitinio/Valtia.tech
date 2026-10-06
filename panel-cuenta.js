// panel-cuenta.js — pestaña "Mi cuenta" del panel del inversor (Panel v3).
// Los bloques del SPEC (sección "Mi cuenta") con la estructura y los valores del
// prototipo «Valtia Panel v3» del zip completo (24/09/2026, líneas 178-224): a la
// izquierda TU PLAN (navy: qué plan tiene, qué incluye, "Cambiar de plan" y "Dar de
// baja" por mail), TUS DATOS (nombre, mail y contraseña, tal como los guarda Firebase
// Auth) y PAGOS (el cobro es manual por ahora); a la derecha AVISOS POR MAIL (los
// interruptores del SPEC + cada cuánto, con las alertas de tus activos arriba de
// todo). Piel vigente del SPEC §0: IBM Plex Sans en todo (sin Plex Mono ni
// Playfair), selectores con el borde dorado sutil y radio 8, etiquetas de 6 px y el
// dorado claro solo sobre azul.
//
// Dos reglas que ordenan todo este módulo:
//
// 1. Nada inventado. La fecha de alta del plan, el próximo pago y el historial de
//    pagos NO existen en Firestore: no se dibujan ni se estiman. Lo que sí se muestra
//    es cuándo se creó la cuenta (lo guarda Firebase Auth en user.metadata) y, en vez
//    del próximo pago, lo que es cierto según el plan (gratis: sin cargo; pago: se
//    coordina por mail). Lo mismo con el nombre: si la cuenta no tiene displayName,
//    se dice que no hay, no se arma uno con el mail.
//
// 2. Todos los avisos viven en UN documento, inversores/{email}/alertas/config, y
//    esta tarjeta es la única pantalla que lo escribe. Tiene dos grupos de campos:
//    - las ALERTAS DE TUS ACTIVOS (activo, tipos, frecuencia, umbralVar), las que lee
//      alertas_cartera.py con config_valida(). Hasta el 27/09/2026 se configuraban al
//      final del Resumen (alertasMail() de panel.js); Lauti las pidió acá y aquella
//      tarjeta se sacó. Mismos campos, mismos valores y mismos tipos que antes: no
//      se cambia ninguno sin cambiar también el pipeline y firestore.rules.
//    - los interruptores del resto de los avisos: "avisos" (el mapa) y
//      "frecuenciaAvisos".
//    Un solo Guardar escribe los dos grupos juntos con merge y actualizado =
//    serverTimestamp(), que es lo que exige la regla (keys hasOnly y actualizado ==
//    request.time).
//
// La piel es la del panel: SOLO variables --v3-* de panel.js (así anda el tema
// oscuro). No importa panel.js —sería un import circular—: todo llega por ctx.
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, query, where, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, sendPasswordResetEmail, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const CSS_ID = 'v3-css-cuenta';
const SOPORTE = 'soporte@valtia.tech';

/* ── el documento donde viven los interruptores ────────────────────────────────
   Es el MISMO de las alertas de tus activos. Los campos del resto de los avisos son
   estos dos y nada más. */
const CAMPO_AVISOS = 'avisos';
const CAMPO_FREC = 'frecuenciaAvisos';

/* ── alertas de tus activos (alertas_cartera.py) ───────────────────────────────
   Los campos, las claves y los valores son EXACTAMENTE los que aceptan
   firestore.rules (match /alertas/{docId}) y los que normaliza config_valida():
     activo: bool (apagadas por defecto) · frecuencia: 'diaria' | 'semanal'
     tipos: { zona, estirada, resultados, vencimientos, variacion: bool }
       (un tipo que no vino en el doc cuenta como prendido, igual que en el pipeline)
     umbralVar: 3 | 5 | 8 (5 por defecto) */
const TIPOS_ALERTA = [['zona', 'Entrada en zona de valor del radar'], ['estirada', 'Pasa a «Estirada»'],
  ['resultados', 'Resultados en los próximos días'], ['vencimientos', 'Vencimientos de bonos y letras'],
  ['variacion', 'Movimientos fuertes de precio']];
const FRECS_ALERTA = [['diaria', 'Diaria'], ['semanal', 'Semanal (lunes)']];
const UMBRALES = [3, 5, 8];
const UMBRAL_DEF = 5;

const CSS = `
.v3q{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0;max-width:1200px;
  --q-on:var(--v3-serie);--q-off:#D5D9E0}
[data-theme="dark"] .v3q{--q-off:rgba(255,255,255,.18)}
.v3q *{box-sizing:border-box}
.v3q-n{font-variant-numeric:tabular-nums}
.v3q a:focus-visible,.v3q button:focus-visible{outline:2px solid var(--v3-focus);outline-offset:2px}
/* prototipo 180: dos columnas 0,9 / 1,1; a la izquierda el plan, los datos y los pagos,
   a la derecha los avisos por mail */
.v3q-grid{display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:16px;align-items:start}
.v3q-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.v3q-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:18px 20px;min-width:0}
/* sirve para un div (la etiqueta de TU PLAN, que ya tiene su h2 con el nombre del
   plan) y para el h2 de TUS DATOS y PAGOS: el margen va explícito para que el h2 no
   traiga el suyo de fábrica */
.v3q-eyebrow{font:600 11px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin:0 0 6px}
.v3q-h{font:600 18px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.3;margin:0}
.v3q-p{font-size:14px;color:var(--v3-sub);line-height:1.6;margin:4px 0 10px}
.v3q-txt{font-size:14px;color:var(--v3-sub);line-height:1.6;margin:8px 0 0;overflow-wrap:anywhere}
.v3q-txt a{color:var(--v3-gold);text-decoration:none;font-weight:600}
.v3q-txt a:hover{color:var(--v3-gold2)}
/* TU PLAN: el único bloque sólido, sobre navy, con el dorado claro encima */
.v3q-plan{background:var(--v3-navy);border:1px solid var(--v3-navy);border-radius:12px;padding:22px 24px;color:#fff;min-width:0}
.v3q-plan .v3q-eyebrow{color:rgba(232,206,150,.85);letter-spacing:.16em}
.v3q-plan h2{font:600 28px 'IBM Plex Sans',sans-serif;color:#fff;line-height:1.2;margin:8px 0 4px}
.v3q-plan .sub{font-size:14.5px;color:rgba(255,255,255,.7);line-height:1.6;margin:0}
.v3q-feat{list-style:none;padding:0;margin:14px 0 0}
.v3q-feat li{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.55;color:rgba(255,255,255,.82);padding:5px 0}
.v3q-feat li::before{content:'—';color:#E8CE96;flex:none}
.v3q-fechas{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr));gap:12px;margin-top:16px;padding-top:14px;
  border-top:1px solid rgba(255,255,255,.12)}
.v3q-fechas .l{font-size:12px;color:rgba(255,255,255,.55)}
.v3q-fechas .v{font:600 15.5px 'IBM Plex Sans',sans-serif;color:#fff;margin-top:4px;line-height:1.35}
.v3q-acc{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.v3q .v3q-cta{display:inline-block;font:600 12px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:#14213D;background:#E8CE96;border:1px solid #E8CE96;padding:9px 14px;border-radius:8px;text-decoration:none;cursor:pointer;white-space:nowrap}
.v3q .v3q-cta:hover{background:#fff;border-color:#fff;color:#14213D}
.v3q .v3q-cta.linea{color:rgba(255,255,255,.75);background:transparent;border-color:rgba(255,255,255,.25)}
.v3q .v3q-cta.linea:hover{color:#fff;border-color:rgba(255,255,255,.6)}
/* TUS DATOS: etiqueta, valor y la acción a la derecha, como texto (prototipo 196-199) */
.v3q-dato{display:flex;justify-content:space-between;align-items:center;gap:8px 14px;padding:11px 0;
  border-bottom:1px solid var(--v3-line2);min-width:0}
.v3q-dato:last-of-type{border-bottom:none}
.v3q-dato .izq{min-width:0}
.v3q-dato .l{font-size:12.5px;color:var(--v3-mut);line-height:1.5}
.v3q-dato .v{font:500 15px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);margin-top:2px;line-height:1.5;overflow-wrap:anywhere}
.v3q-dato .v.vacio{color:var(--v3-mut);font-weight:400;font-size:14px}
.v3q-act{font:600 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-btn);
  background:none;border:none;padding:4px 0;margin:0;cursor:pointer;white-space:nowrap;flex:none}
.v3q-act:hover:not([disabled]){color:var(--v3-gold2)}
.v3q-act[disabled]{opacity:.45;cursor:default}
/* el campo del nombre, cuando se edita en la misma fila */
.v3q-in{display:block;width:100%;max-width:320px;margin-top:5px;padding:9px 11px;font:500 15px 'IBM Plex Sans',sans-serif;
  color:var(--v3-ink);background:var(--v3-card);border:1px solid var(--v3-line);border-radius:8px;outline:none}
.v3q-in:focus{border-color:var(--v3-gold)}
/* etiquetas (6 px) */
.v3q-tag{display:inline-block;font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  padding:2px 7px;border-radius:6px;white-space:nowrap;line-height:1.5;vertical-align:middle}
.v3q-tag.ok{color:var(--v3-up);background:var(--v3-upBg)}
.v3q-tag.falta{color:var(--v3-warn);background:var(--v3-warnBg)}
.v3q-tag.pro{color:var(--v3-btnTx);background:var(--v3-btn)}
.v3q-tag.pro.sin{color:var(--v3-gold2);background:transparent;border:1px solid var(--v3-gold);padding:1px 6px}
.v3q-tag.aun{color:var(--v3-mut);background:var(--v3-neutro);letter-spacing:.02em;text-transform:none;font-weight:600}
/* botón primario (Guardar): navy lleno, radio 8; el token se invierte en oscuro */
.v3q-btn{font:600 12px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-btnTx);
  background:var(--v3-btn);border:1px solid var(--v3-btn);border-radius:8px;padding:10px 18px;cursor:pointer;white-space:nowrap;flex:none;
  transition:background .15s,border-color .15s}
.v3q-btn:hover:not([disabled]){background:var(--v3-btnHover);border-color:var(--v3-btnHover)}
.v3q-btn[disabled]{opacity:.45;cursor:default}
/* overflow-wrap: este mensaje lleva el mail de la cuenta, que es una sola palabra
   larga; en el pie de los avisos convive con el botón en una fila flex y a 375px
   sin esto empujaba el ancho */
.v3q-msg{font-size:13.5px;color:var(--v3-sub);line-height:1.6;margin:10px 0 0;min-width:0;overflow-wrap:anywhere}
.v3q-msg.ok{color:var(--v3-up)}
.v3q-msg.mal{color:var(--v3-dn)}
.v3q-nota{font-size:13px;color:var(--v3-mut);line-height:1.65;margin:12px 0 0}
.v3q-nota a,.v3q-msg a{color:var(--v3-gold);text-decoration:none;font-weight:600}
.v3q-nota a:hover,.v3q-msg a:hover{color:var(--v3-gold2)}
/* AVISOS POR MAIL (prototipo 209-222): una fila por aviso con su interruptor */
.v3q-banda{font-size:14px;color:var(--v3-sub);background:var(--v3-warnBg);border-radius:10px;
  padding:10px 14px;line-height:1.6;margin:4px 0 6px}
.v3q-av{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;
  padding:13px 0;border-bottom:1px solid var(--v3-line2);cursor:pointer;min-width:0}
.v3q-av:last-of-type{border-bottom:none}
/* la fila entera es un label: si el interruptor está bloqueado, el cursor no
   tiene que prometer que se puede tocar */
.v3q-av.quieto{cursor:default}
.v3q-av .t{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;font:600 15px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.4}
.v3q-av .d{font-size:13.5px;color:var(--v3-mut);margin-top:3px;line-height:1.5}
/* el interruptor del prototipo: 38 x 22, navy prendido y gris apagado, perilla blanca */
.v3q-sw{position:relative;width:38px;height:22px;flex:none;display:block}
.v3q-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:2}
.v3q-sw i{position:absolute;inset:0;display:block;border-radius:11px;background:var(--q-off);transition:background .15s}
.v3q-sw i::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;
  background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.v3q-sw input:checked+i{background:var(--q-on)}
.v3q-sw input:checked+i::after{left:19px}
.v3q-sw input:focus-visible+i{outline:2px solid var(--v3-focus);outline-offset:2px}
.v3q-sw input[disabled]{cursor:default}
.v3q-sw input[disabled]+i{opacity:.5}
.v3q-frec{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;
  margin-top:16px;padding-top:14px;border-top:1px solid var(--v3-line)}
.v3q-frec .l{font-size:14px;color:var(--v3-sub)}
/* frecuencia: los selectores de la regla §0 (borde dorado sutil; el elegido con relleno crema) */
.v3q-seg{display:inline-flex;gap:2px;align-items:center;flex-wrap:wrap}
.v3q-seg button{font:500 12px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;cursor:pointer;
  color:var(--v3-selTx);background:var(--v3-selBg);border:1px solid var(--v3-sel);border-radius:8px;white-space:nowrap;
  transition:color .15s,border-color .15s,background .15s}
.v3q-seg button:hover{color:var(--v3-selOnTx)}
.v3q-seg button.on{color:var(--v3-selOnTx);border-color:var(--v3-selOn);background:var(--v3-selOnBg)}
.v3q-seg button[disabled]{cursor:default}
.v3q-seg button[disabled]:not(.on):hover{color:var(--v3-selTx)}
.v3q-pie{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:16px}
/* ALERTAS DE TUS ACTIVOS: la fila con su interruptor, como las demás, y abajo sus
   opciones en un recuadro; con el interruptor apagado quedan a la vista pero
   deshabilitadas */
.v3q-al{border-bottom:1px solid var(--v3-line2);padding-bottom:14px}
.v3q-al .v3q-av{border-bottom:none;padding-bottom:10px}
.v3q-alop{background:var(--v3-hl);border:1px solid var(--v3-line2);border-radius:10px;padding:12px 14px;min-width:0;transition:opacity .15s}
.v3q-alop.off{opacity:.5}
.v3q-alop .l{font-size:13px;color:var(--v3-sub);line-height:1.5}
.v3q-tipos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:2px 18px;margin-top:6px}
.v3q-ck{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--v3-ink);line-height:1.45;padding:4px 0;cursor:pointer;min-width:0}
.v3q-ck input{accent-color:var(--v3-selOn);width:15px;height:15px;margin:2px 0 0;flex:none;cursor:pointer}
.v3q-ck input:focus-visible{outline:2px solid var(--v3-focus);outline-offset:2px}
.v3q-alop.off .v3q-ck,.v3q-alop.off .v3q-ck input{cursor:default}
.v3q-alfila{display:flex;justify-content:space-between;align-items:center;gap:8px 12px;flex-wrap:wrap;
  margin-top:12px;padding-top:12px;border-top:1px solid var(--v3-line2)}
.v3q-alnota{font-size:13px;color:var(--v3-mut);line-height:1.6;margin:10px 0 0}
/* la de "sin posiciones" va fuera del recuadro (no se atenúa con el interruptor apagado) */
#v3q-al-pos{margin:-2px 0 10px}
.v3q-alnota a{color:var(--v3-gold);text-decoration:none;font-weight:600}
.v3q-alnota a:hover{color:var(--v3-gold2)}
.v3q-sk i{display:block;height:12px;border-radius:6px;background:var(--v3-skel);margin:10px 0}
.v3q-sk i.corta{width:45%}
@media (max-width:1100px){.v3q-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:420px){
  .v3q-card{padding:16px 14px}
  .v3q-plan{padding:18px 16px}
  .v3q-plan h2{font-size:24px}
  .v3q-dato{flex-wrap:wrap}
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
   "ya" dice si HOY hay alguien mandando ese aviso; los que no, llevan la etiqueta
   «todavía no lo estamos mandando». Las alertas de tus activos (alertas_cartera.py)
   no están en esta lista: tienen su bloque propio arriba, con otros campos de este
   mismo documento, y esas sí salen. Cuando el envío de uno de estos exista, se le
   pone ya:true acá y desaparece su etiqueta.
   "cierre" (25/09/2026, pedido de Lauti después de ver el de Senta) sí sale: lo
   manda cierre_cartera.py desde precios_intradia.py al cierre de cada rueda, solo
   a quien lo prende acá y con el mail verificado.
   Desde el 06/10/2026 también salen (y miran este interruptor):
   - "compraventa" y "rotacion": los mails de las carteras (avisos_rotacion.py). Una
     operación sola es «Compras y ventas»; una rotación o varias juntas le llegan a
     quien tenga prendido cualquiera de los dos (adentro hay compras y ventas).
     Con el plan PRO valen PRENDIDOS si la cuenta nunca los tocó (deOrigen): el mail
     de una compra no depende de haber pasado por esta pantalla. Tiene que coincidir
     con POR_DEFECTO de avisos_config.py, que es quien decide del lado del envío.
   - "informes": informes_avisos.py, apagado salvo que se prenda acá. */
const AVISOS = [
  { k: 'cierre', pro: false, t: 'Cierre diario de tu cartera',
    d: 'Cada día de rueda, al cierre: cuánto vale, cuánto se movió en pesos y en dólares, contra el S&P 500 y lo que más se movió.', ya: true },
  { k: 'compraventa', pro: true, deOrigen: true, t: 'Compras y ventas',
    d: 'Cada compra o venta de las carteras, con el precio y la razón. Sale a la mañana siguiente de operar.', ya: true },
  { k: 'rotacion', pro: true, deOrigen: true, t: 'Rotaciones de las carteras que seguís',
    d: 'Cuando hay más de un movimiento junto: qué entra, qué sale y por qué. Con «Compras y ventas» prendido ya las recibís.', ya: true },
  { k: 'informes', pro: false, t: 'Informes nuevos',
    d: 'Cuando sale un informe de una empresa que tenés en Mi cartera o seguís con una alerta de precio, y los informes de contexto.', ya: true },
  { k: 'eventos', pro: false, t: 'Eventos de tus activos',
    d: 'Resultados, cupones y vencimientos, unos días antes.', ya: false },
  // el newsletter es la lista `newsletter` (la misma del formulario de Noticias y la
  // que lee newsletter_envio.py): el interruptor muestra si esta casilla está en la
  // lista, y Guardar la suma o la saca. Ver suscripcionNews() más abajo.
  { k: 'newsletter', pro: false, t: 'Newsletter',
    d: 'Las noticias del día, de lunes a viernes a la mañana, y los lunes el resumen de la semana.', ya: true },
  { k: 'resumen', pro: false, t: 'Resumen mensual de tu cartera',
    d: 'Cómo te fue en el mes contra tu índice de referencia.', ya: false },
];
const FRECS = [['momento', 'Al momento'], ['diaria', 'Resumen diario']];
const FREC_DEF = 'diaria';   // como el resto de los mails: como mucho uno por día

const db = () => getFirestore(getApp());
const refConfig = email => doc(db(), 'inversores', email, 'alertas', 'config');

/* ── la suscripción al newsletter de esta casilla ──────────────────────────────
   Los docs de `newsletter` con email == el de la sesión (puede haber más de uno si se
   anotó dos veces desde Noticias). La regla solo deja leer los de la propia casilla y
   con el mail verificado. Devuelve los ids; levanta si no se pudo leer. */
async function suscripcionNews(email) {
  const sn = await getDocs(query(collection(db(), 'newsletter'), where('email', '==', email)));
  return sn.docs.map(d => d.id);
}

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

// el título de la tarjeta de avisos (prototipo 210): el mismo mientras carga y después
const CABEZA_AVISOS = `<h2 class="v3q-h">Qué avisos recibir por mail</h2>
    <p class="v3q-p">Elegí qué te queremos contar y cada cuánto.</p>`;

export function renderCuenta(el, ctx) {
  return pintar(el, ctx);
}

async function pintar(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S.email;
  const vigente = () => seq === _seq && ctx.S.email === email;
  ponerCss();

  el.innerHTML = `<div class="v3q"><div class="v3q-grid">
    <div class="v3q-col">${bloquePlan(ctx)}${bloqueDatos(ctx)}${bloquePagos(ctx)}</div>
    <div class="v3q-col"><div class="v3q-card" id="v3q-avisos">
      ${CABEZA_AVISOS}
      <div class="v3q-sk" role="status" aria-label="Cargando tus avisos"><i></i><i class="corta"></i><i></i><i class="corta"></i><i></i><i class="corta"></i></div>
    </div></div></div></div>`;

  engancharDatos(el, ctx);
  await pintarAvisos(el, ctx, vigente);
}

/* ───────────────────────── TU PLAN ───────────────────────── */
// cuándo se creó la cuenta, como lo guarda Firebase Auth (user.metadata.creationTime,
// una fecha en texto). En hora de Buenos Aires, dd/mm/aaaa; '' si no está o no se lee
function cuentaCreada(user) {
  try {
    const t = user && user.metadata && user.metadata.creationTime;
    const ms = t ? Date.parse(t) : NaN;
    if (!Number.isFinite(ms)) return '';
    const s = new Date(ms - 3 * 3600e3).toISOString();
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  } catch (e) { return ''; }
}

function bloquePlan(ctx) {
  const esc = ctx.esc, S = ctx.S, p = planDe(S);
  const alta = cuentaCreada(S.user);
  // "Próximo pago": no hay fecha guardada en ningún lado; se dice lo que es cierto
  // según el plan, sin inventar un día
  const prox = S.isAdmin ? '' : (S.cliente || S.pro) ? 'Lo coordinamos por mail' : 'Sin cargo: es gratis';
  const fechas = [alta ? ['Cuenta creada', alta] : null, prox ? ['Próximo pago', prox] : null].filter(Boolean);
  return `<section class="v3q-plan">
    <div class="v3q-eyebrow">Tu plan</div>
    <h2>${esc(p.n)}</h2>
    <p class="sub">${esc(p.s)}</p>
    <ul class="v3q-feat">${p.f.map(x => `<li><span>${esc(x)}</span></li>`).join('')}</ul>
    ${fechas.length ? `<div class="v3q-fechas">${fechas.map(([l, v]) =>
      `<div><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>` : ''}
    <div class="v3q-acc">
      <a class="v3q-cta" href="/planes">${S.isAdmin ? 'Ver los planes' : 'Cambiar de plan'}</a>
      ${S.isAdmin ? '' : `<a class="v3q-cta linea" href="mailto:${SOPORTE}?subject=${encodeURIComponent('Baja')}">Dar de baja</a>`}
    </div>
  </section>`;
}

/* ───────────────────────── PAGOS ─────────────────────────
   El cobro no pasa por la web: no hay pagos guardados que listar. Se dice eso, con el
   mail de contacto, en vez de dibujar una tabla vacía o de ejemplo */
function bloquePagos(ctx) {
  const S = ctx.S;
  const paga = !S.isAdmin && (S.cliente || S.pro);
  const txt = S.isAdmin
    ? 'La cuenta de administración no tiene pagos.'
    : paga
      ? 'Por ahora el cobro es manual y no pasa por la web: el alta, el cambio de plan y la baja los coordinamos con vos por mail. Por eso acá no vas a ver un historial de pagos.'
      : 'Tu cuenta es gratuita, así que no tiene pagos. Si pasás a un plan pago, por ahora el cobro es manual y lo coordinamos con vos por mail.';
  return `<section class="v3q-card">
    <h2 class="v3q-eyebrow">Pagos</h2>
    <p class="v3q-txt">${txt}</p>
    ${S.isAdmin ? '' : `<p class="v3q-txt">Para el plan, el cobro o la baja, escribinos a <a href="mailto:${SOPORTE}">${SOPORTE}</a>.</p>`}
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
    <div class="v3q-dato" id="v3q-nom">
      <div class="izq"><div class="l">Nombre</div>
        <div class="v${nombre ? '' : ' vacio'}">${nombre ? esc(nombre) : 'Todavía no cargaste tu nombre'}</div></div>
      <button type="button" class="v3q-act" data-q="nombre" aria-label="${nombre ? 'Cambiar el nombre' : 'Cargar tu nombre'}">${nombre ? 'Cambiar' : 'Cargar'}</button>
    </div>
    <div class="v3q-dato">
      <div class="izq"><div class="l">Mail de la cuenta</div>
        <div class="v">${esc(S.email || '—')} <span class="v3q-tag ${verif ? 'ok' : 'falta'}">${verif ? 'Verificado' : 'Sin verificar'}</span></div></div>
      ${puedeReenviar ? '<button type="button" class="v3q-act" data-q="verif">Reenviar el mail</button>' : ''}
    </div>
    <div class="v3q-dato">
      <div class="izq"><div class="l">Contraseña</div>
        <div class="v">${conPass ? 'La cambiás desde un mail que te mandamos' : 'La maneja tu cuenta de Google'}</div></div>
      ${conPass ? '<button type="button" class="v3q-act" data-q="pass" aria-label="Cambiar la contraseña">Cambiar</button>' : ''}
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

  // el nombre: es el displayName de Firebase Auth, el mismo que usa el saludo del
  // panel. Se edita en la misma fila; guardado, se repinta la pestaña y el nombre
  // de la barra lateral
  const fNom = el.querySelector('#v3q-nom');
  const bNom = el.querySelector('[data-q="nombre"]');
  if (fNom && bNom) bNom.addEventListener('click', () => {
    const user = getAuth(getApp()).currentUser;
    if (!user) return;
    const actual = String(user.displayName || '').trim();
    fNom.innerHTML = `<div class="izq" style="flex:1"><label class="l" for="v3q-nom-in">Nombre</label>
      <input type="text" id="v3q-nom-in" class="v3q-in" maxlength="60" autocomplete="name" placeholder="Cómo querés que te llamemos"></div>
      <button type="button" class="v3q-act" data-q="nombre-ok">Guardar</button>
      <button type="button" class="v3q-act" data-q="nombre-no">Cancelar</button>`;
    const inp = fNom.querySelector('#v3q-nom-in');
    inp.value = actual;
    inp.focus();
    const ok = fNom.querySelector('[data-q="nombre-ok"]');
    const guardar = async () => {
      const nuevo = inp.value.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (nuevo === actual) { pintar(el, ctx); return; }
      ok.disabled = true;
      poner('Guardando…');
      try {
        await updateProfile(user, { displayName: nuevo });
        const lat = document.getElementById('portal-user-name');
        if (lat) lat.textContent = nuevo || String(S.email || '').split('@')[0];
        await pintar(el, ctx);
        const m = el.querySelector('#v3q-dmsg');
        if (m) { m.textContent = nuevo ? `Listo: te vamos a llamar ${nuevo}.` : 'Listo: sacamos el nombre.'; m.className = 'v3q-msg ok'; }
        if (typeof ctx.toast === 'function') ctx.toast('Nombre guardado');
      } catch (e) {
        ok.disabled = false;
        poner('No se pudo guardar el nombre (' + codigo(e) + '). Probá de nuevo en un rato.', 'mal');
      }
    };
    ok.addEventListener('click', guardar);
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); guardar(); }
      if (ev.key === 'Escape') pintar(el, ctx);
    });
    fNom.querySelector('[data-q="nombre-no"]').addEventListener('click', () => pintar(el, ctx));
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
// las alertas de tus activos tal como las lee el pipeline (config_valida): apagadas si
// activo no es true, un tipo ausente cuenta como prendido, diaria y 5 % por defecto
function alertasDe(cfg) {
  const c = cfg || {};
  const tipos = c.tipos && typeof c.tipos === 'object' ? c.tipos : {};
  return {
    on: c.activo === true,
    tipos: Object.fromEntries(TIPOS_ALERTA.map(([k]) => [k, tipos[k] !== false])),
    frec: c.frecuencia === 'semanal' ? 'semanal' : 'diaria',
    umbral: UMBRALES.includes(Number(c.umbralVar)) ? Number(c.umbralVar) : UMBRAL_DEF,
  };
}

// el último mail de alertas que salió: alertasEnvios/{aaaa-mm-dd} con estado
// "enviado" (lo escribe solo el pipeline). '' si no hay o no se pudo leer
async function ultimoEnvio(email) {
  try {
    const env = await getDocs(collection(db(), 'inversores', email, 'alertasEnvios'));
    const ok = env.docs.filter(d => (d.data() || {}).estado === 'enviado').map(d => d.id).sort();
    return ok.length ? ok[ok.length - 1] : '';
  } catch (e) { return ''; }
}
const fechaCorta = iso => {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a.slice(2)}` : '';
};

async function pintarAvisos(el, ctx, vigente) {
  const box = el.querySelector('#v3q-avisos');
  if (!box) return;
  const esc = ctx.esc, S = ctx.S;
  const cabeza = CABEZA_AVISOS;

  // sin el mail verificado las reglas no dejan ni leer la configuración
  if (!S.verificado) {
    box.innerHTML = cabeza + `<p class="v3q-nota">Para recibir avisos por mail, primero verificá tu
      dirección. El enlace te llegó cuando creaste la cuenta.</p>`;
    return;
  }

  // news: los ids de la suscripción al newsletter de esta casilla; null si no se pudo
  // leer (entonces ese interruptor queda quieto: no se adivina ni se pisa)
  let cfg = null, ultimo = '', news = null;
  try {
    const [sn, u, nw] = await Promise.all([getDoc(refConfig(S.email)), ultimoEnvio(S.email),
      suscripcionNews(S.email).catch(() => null)]);
    if (sn.exists()) cfg = sn.data();
    ultimo = u;
    news = nw;
  } catch (e) {
    // sin poder leer lo que hay, no se ofrece guardar: se pisaría con los valores de fábrica
    if (!vigente()) return;
    box.innerHTML = cabeza + `<p class="v3q-nota">No pudimos leer tu configuración de avisos
      (${esc(codigo(e))}). Recargá la página para verla o cambiarla.</p>`;
    return;
  }
  if (!vigente()) return;

  const al = alertasDe(cfg);
  const guardados = (cfg && typeof cfg[CAMPO_AVISOS] === 'object' && cfg[CAMPO_AVISOS]) || {};
  const frec = FRECS.some(([k]) => k === (cfg && cfg[CAMPO_FREC])) ? cfg[CAMPO_FREC] : FREC_DEF;
  // Los dos que el SPEC marca (PRO) son del plan PRO. A una cuenta gratuita se le
  // muestran igual, pero sin interruptor: dejarla prenderlos y contestarle
  // "guardado" sería prometerle un mail que su plan no incluye. Si ya venían
  // prendidos (fue PRO y dejó de serlo) quedan marcados y el guardado no los pisa.
  const sinPlan = a => !!a.pro && !S.pro;
  // apagados por defecto, salvo los de las carteras (deOrigen), que con el plan valen
  // prendidos mientras la cuenta no los apague: así los trata el envío
  // el del newsletter no sale del doc de avisos: dice si la casilla está en la lista
  const estado = a => a.k === 'newsletter' && news ? news.length > 0
    : typeof guardados[a.k] === 'boolean' ? guardados[a.k] : !!a.deOrigen && !sinPlan(a);
  const sinLista = a => a.k === 'newsletter' && news === null;
  const faltantes = AVISOS.filter(a => !a.ya).length;
  // la marca va en cada fila que todavía no sale: las alertas de tus activos
  // salen siempre, así que nunca es "ninguno se manda"
  const marcaFila = faltantes > 0;
  const hayBloqueados = AVISOS.some(sinPlan);

  const fila = a => `<label class="v3q-av${sinPlan(a) ? ' quieto' : ''}">
    <div class="izq" style="min-width:0">
      <div class="t"><span>${esc(a.t)}</span>${a.pro ? (sinPlan(a) ? '<span class="v3q-tag pro sin">Con Valtia PRO</span>' : '<span class="v3q-tag pro">PRO</span>') : ''}${
        marcaFila && !a.ya ? '<span class="v3q-tag aun">todavía no lo estamos mandando</span>' : ''}${
        sinLista(a) ? '<span class="v3q-tag aun">no pudimos leer tu suscripción: recargá la página</span>' : ''}</div>
      <div class="d">${esc(a.d)}</div>
    </div>
    <span class="v3q-sw"><input type="checkbox" data-av="${a.k}"${estado(a) ? ' checked' : ''}${
      sinPlan(a) || sinLista(a) ? ' disabled' : ''} aria-label="${esc(a.t)}"><i></i></span>
  </label>`;

  // ALERTAS DE TUS ACTIVOS: la fila con su interruptor y abajo sus opciones. Con el
  // interruptor apagado las opciones se ven pero no se tocan (y se guardan como están)
  const dis = al.on ? '' : ' disabled';
  const boton = (attr, v, t, on) =>
    `<button type="button" ${attr}="${v}" class="${on ? 'on' : ''}" aria-pressed="${on}"${dis}>${esc(t)}</button>`;
  const bloqueAlertas = `<section class="v3q-al" aria-labelledby="v3q-al-t">
    <label class="v3q-av">
      <div class="izq" style="min-width:0">
        <div class="t"><span id="v3q-al-t">Alertas de tus activos</span></div>
        <div class="d">Lecturas automáticas sobre lo que tenés en Mi cartera, no recomendaciones. Como mucho un mail por día y sin montos ni cantidades de tu cartera.</div>
      </div>
      <span class="v3q-sw"><input type="checkbox" id="v3q-al-on"${al.on ? ' checked' : ''} aria-label="Alertas de tus activos"><i></i></span>
    </label>
    <p class="v3q-alnota" id="v3q-al-pos" hidden>Se aplica a los activos que cargues en
      <a href="#panel/micartera" data-go="micartera">Mi cartera</a>.</p>
    <div class="v3q-alop${al.on ? '' : ' off'}" id="v3q-alop">
      <div role="group" aria-labelledby="v3q-al-tl"><div class="l" id="v3q-al-tl">Qué te avisamos</div>
        <div class="v3q-tipos">${TIPOS_ALERTA.map(([k, t]) => `<label class="v3q-ck"><input type="checkbox" data-alq-tipo="${k}"${
          al.tipos[k] ? ' checked' : ''}${dis}><span>${esc(t)}</span></label>`).join('')}</div></div>
      <div class="v3q-alfila"><span class="l" id="v3q-al-fl">Frecuencia</span>
        <div class="v3q-seg" role="group" aria-labelledby="v3q-al-fl">${FRECS_ALERTA.map(([k, t]) =>
          boton('data-alq-frec', k, t, k === al.frec)).join('')}</div></div>
      <div class="v3q-alfila"><span class="l" id="v3q-al-ul">Movimiento desde</span>
        <div class="v3q-seg" role="group" aria-labelledby="v3q-al-ul">${UMBRALES.map(u =>
          boton('data-alq-umbral', u, u + '%', u === al.umbral)).join('')}</div></div>
      ${ultimo ? `<p class="v3q-alnota">Último envío: ${esc(fechaCorta(ultimo))}.</p>` : ''}
    </div>
  </section>`;

  box.innerHTML = cabeza +
    (faltantes ? `<p class="v3q-banda">Los que dicen «todavía no lo estamos mandando» no salen todavía:
      guardamos tu elección para cuando el envío exista. Los demás ya salen.</p>` : '') +
    bloqueAlertas +
    AVISOS.map(fila).join('') +
    (hayBloqueados ? `<p class="v3q-nota">Los que dicen «Con Valtia PRO» llegan con ese plan:
      <a href="/planes">mirá los planes</a>.</p>` : '') +
    `<div class="v3q-frec"><span class="l">Cuándo mandar los demás avisos</span>
      <div class="v3q-seg" role="group" aria-label="Frecuencia de los demás avisos">${FRECS.map(([k, t]) =>
        `<button type="button" data-frec="${k}" class="${k === frec ? 'on' : ''}" aria-pressed="${k === frec}">${t}</button>`).join('')}</div></div>
    <div class="v3q-pie"><button type="button" class="v3q-btn" id="v3q-ok">Guardar</button>
      <span class="v3q-msg" id="v3q-amsg" style="margin:0">Llegan a ${esc(S.email)}.</span></div>`;

  // sin posiciones el bloque se ve igual, con una línea que dice sobre qué se aplica.
  // La cartera es la lectura cacheada del panel: no se espera para dibujar
  if (typeof ctx.cartera === 'function') {
    Promise.resolve().then(() => ctx.cartera()).then(c => {
      if (!vigente() || !c || !Array.isArray(c.pos) || c.pos.length) return;
      const p = box.querySelector('#v3q-al-pos');
      if (p) p.hidden = false;
    }).catch(() => {});
  }

  // los selectores de la regla §0: uno elegido por grupo
  const elegir = (attr, fijar) => {
    const bs = box.querySelectorAll(`[${attr}]`);
    bs.forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      fijar(b.getAttribute(attr));
      bs.forEach(x => {
        const on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', String(on));
      });
    }));
  };
  let elegida = frec, alFrec = al.frec, alUmbral = al.umbral;
  elegir('data-frec', v => { elegida = v; });
  elegir('data-alq-frec', v => { alFrec = v; });
  elegir('data-alq-umbral', v => { alUmbral = Number(v); });

  // los tipos, la frecuencia y el umbral se habilitan solo con el interruptor prendido
  const alOn = box.querySelector('#v3q-al-on'), alOp = box.querySelector('#v3q-alop');
  alOn.addEventListener('change', () => {
    alOp.classList.toggle('off', !alOn.checked);
    alOp.querySelectorAll('input, button').forEach(x => { x.disabled = !alOn.checked; });
  });

  const ok = box.querySelector('#v3q-ok'), msg = box.querySelector('#v3q-amsg');
  const poner = (txt, clase) => { msg.textContent = txt; msg.className = 'v3q-msg' + (clase ? ' ' + clase : ''); };
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    poner('Guardando…');
    // Uno que el plan no deja tocar no se escribe: queda como estaba (con merge, lo
    // que no va en el mapa no se pisa). Guardarle un "apagado" a una cuenta gratuita
    // le cortaría, sin que lo haya pedido, los avisos de las carteras abiertas que
    // le llegan por estar en el newsletter
    const mapa = {};
    AVISOS.forEach(a => {
      if (sinPlan(a)) return;
      const c = box.querySelector(`[data-av="${a.k}"]`);
      mapa[a.k] = !!(c && c.checked);
    });
    // un deshabilitado conserva su "checked": apagar el interruptor no borra los tipos
    const tipos = Object.fromEntries(TIPOS_ALERTA.map(([k]) => {
      const c = box.querySelector(`[data-alq-tipo="${k}"]`);
      return [k, !!(c && c.checked)];
    }));
    const nuevo = {
      activo: !!alOn.checked,
      frecuencia: alFrec === 'semanal' ? 'semanal' : 'diaria',
      tipos,
      umbralVar: UMBRALES.includes(alUmbral) ? alUmbral : UMBRAL_DEF,
      [CAMPO_AVISOS]: mapa,
      [CAMPO_FREC]: FRECS.some(([k]) => k === elegida) ? elegida : FREC_DEF,
      actualizado: serverTimestamp(),
    };
    try {
      // todo junto y con merge: si el doc tuviera algo más (no debería: la regla no
      // deja), no se pisa desde acá
      await setDoc(refConfig(S.email), nuevo, { merge: true });
      // el newsletter: sumar esta casilla a la lista o sacarla (solo si se pudo leer
      // cómo estaba). Nunca un segundo doc para la misma casilla: saldrían dos mails
      let newsMal = '';
      if (news) {
        const quiere = mapa.newsletter === true;
        try {
          if (quiere && !news.length) {
            const r = await addDoc(collection(db(), 'newsletter'), { email: S.email, fecha: serverTimestamp() });
            news = [r.id];
          } else if (!quiere && news.length) {
            await Promise.all(news.map(id => deleteDoc(doc(db(), 'newsletter', id))));
            news = [];
          }
        } catch (e) { newsMal = codigo(e); }
      }
      const conNews = !!(news && news.length);
      const n = AVISOS.filter(a => a.k !== 'newsletter' && mapa[a.k]).length;
      const partes = [nuevo.activo
        ? `alertas de tus activos prendidas, ${nuevo.frecuencia === 'semanal' ? 'los lunes' : 'cuando haya novedades (máximo un mail por día)'}`
        : 'alertas de tus activos apagadas'];
      // "otros … prendidos" y no "N más": con las alertas apagadas, "más" no suma a nada
      if (n) partes.push(`${n === 1 ? 'otro aviso prendido' : `otros ${n} avisos prendidos`}, ${nuevo[CAMPO_FREC] === 'momento' ? 'al momento' : 'en un resumen diario'}`);
      if (conNews) partes.push('newsletter prendido');
      if (newsMal) {
        poner(`Guardado, salvo el newsletter: no se pudo cambiar tu suscripción (${newsMal}). Probá de nuevo en un rato.`, 'mal');
      } else {
        poner(nuevo.activo || n || conNews
          ? `Guardado para ${S.email}: ${partes.join('; ')}.`
          : 'Guardado: por ahora no querés ningún aviso.', 'ok');
      }
    } catch (e) {
      const c = codigo(e);
      poner(/permission-denied|insufficient/i.test(c)
        ? 'No se pudo guardar: el servidor no aceptó el cambio. Recargá la página y probá de nuevo; si sigue, escribinos a ' + SOPORTE + '.'
        : 'No se pudo guardar (' + c + '). Probá de nuevo en un rato.', 'mal');
    }
    ok.disabled = false;
  });
}
