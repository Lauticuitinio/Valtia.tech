// panel-alertas.js — pestaña "Alertas" del panel del inversor (Panel v3, id 'alertas',
// grupo "Tus inversiones"). Es el registro de lo que Valtia hizo en sus carteras
// modelo: cada compra, venta y cambio de peso, agrupados por día, con la hora,
// el precio de esa operación y la razón.
//
// La estructura es la del prototipo de Lauti (Valtia Panel v3.html, 118-177): a la
// izquierda los filtros por tipo, "Marcar todas como leídas" y la lista por día; a la
// derecha "Este mes" y "Cómo te llegan". Los colores y la tipografía son los de
// Noticias, siempre por las variables --v3-* de panel.js (así anda el tema oscuro).
// No importa panel.js —sería un import circular—: todo llega por ctx.
//
// De dónde salen los datos:
//   · la colección global `alertas`, que escribe SOLO la pantalla Operar del admin
//     (panel-operar.js, armarMovimiento/ponerEnLote): fecha, hora, tipo, ticker,
//     empresa, accion, cartera, carteraNombre, precio, razonamiento, visibilidad,
//     estado, para, historialId y creado. Los valores que acá importan salen de ahí
//     y de ningún otro lado: `tipo` es compra | venta | peso (los tres de TIPOS en
//     panel-operar.js) y `estado` nace en "borrador" y pasa a "publicado" cuando
//     Lauti publica el movimiento;
//   · lo que hizo ESTE usuario con cada una, en `inversores/{email}/alertasEstado/{id}`
//     con { leida, hecha, cuando }. Es privado de su cuenta: nadie más lo ve.
//
// Tres cosas que este módulo NO hace, a propósito:
//   1. NO escribe alertas ni manda mails. Los avisos por mail se eligen en Mi cuenta
//      y los manda el pipeline; hoy (23/09/2026) todavía no sale ninguno de estos,
//      así que acá no se promete que lleguen.
//   2. NO inventa nada. Sin alertas no hay lista de ejemplo: hay un vacío que explica
//      qué va a aparecer ahí, sin prometer cuándo. Y no hay más tipos que los que
//      Operar escribe: un tipo que nunca se escribe sería un filtro que siempre da 0.
//   3. NO muestra los borradores. Una alerta en estado "borrador" es una operación que
//      todavía no se publicó: la consulta pide estado == "publicado", el mismo filtro
//      que tiene que llevar la regla (ver reglas_necesarias).
//
// El gate del plan es el de siempre: el que manda es firestore.rules. La consulta lleva
// EXACTAMENTE las visibilidades que la regla le deja leer a esta cuenta —si pidiera una
// de más, Firestore rechaza el listado entero, no lo recorta—, y lo que no puede leer se
// lo cuenta el bloque de PRO (una lista desenfocada —barras vacías, no datos falsos—
// con el acceso a /planes).
//
// SEGUNDO SEGMENTO (24/09/2026): "Tus alertas de precio". Arriba de los filtros hay un
// selector con la misma pinta que ellos: "De las carteras Valtia" (todo lo de arriba, tal
// cual) | "Tus alertas de precio" (las que el usuario se puso sobre SUS activos: "avisame
// si GGAL sube de $4.735"). Esas viven en inversores/{email}/alertasPrecio y entran y
// salen SOLO por alertas-precio.js: acá se listan las activas (con el precio de hoy y
// cuánto le falta), el historial de las que saltaron (tocar una abre el activo en Mi
// cartera) y un mini-form para crear una sobre un activo de la cartera que ya tenga
// precio. El umbral va en la moneda y la unidad en que cotiza el activo (cada 100 VN en
// renta fija), nunca convertido. Al dibujar ese segmento con disparadas sin ver, se
// marcan vistas (apaga la pastilla del lateral) y se repinta UNA vez. El mail lo manda el
// pipeline, que todavía no sale: acá no se promete.
import { getFirestore, collection, getDocs, doc, query, where, writeBatch, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
// la única puerta a inversores/{email}/alertasPrecio (leerAlertas se renombra: acá ya hay
// una leerAlertas, la de la colección global `alertas`)
import { leerAlertas as leerAlertasPrecio, pausar, borrar, marcarVistas, limpiarHistorial, textoAlerta, fraseDisparo,
         tickerCorto, crearAlerta, validarAlerta, precargaUmbral, fmtPrecio, EVENTO_PRECIOS } from './alertas-precio.js?v=1';
// el nombre del activo con el MISMO criterio que la fila de Mi cartera (precios.nombre o la
// ficha) y la renta fija para la unidad del umbral (cada 100 VN)
import { nombreDe, esRentaFija } from './activos.js?v=7';

const CSS_ID = 'v3-css-alertas';

/* ───────────────────────── estilos ───────────────────────── */
const CSS = `
.v3al{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0;max-width:1200px}
.v3al *{box-sizing:border-box}
.v3al-n{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.v3al-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
.v3al-col,.v3al-lat{min-width:0;display:flex;flex-direction:column;gap:12px}
@media(min-width:980px){.v3al-grid{grid-template-columns:minmax(0,1fr) minmax(250px,320px)}}
/* controles: selectores sin caja, la opción activa con subrayado dorado de 2px */
.v3al-top{display:flex;align-items:center;justify-content:space-between;gap:8px 14px;flex-wrap:wrap;margin:0}
.v3al-fil{display:inline-flex;gap:2px;flex-wrap:wrap;min-width:0}
.v3al-sel{font:500 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.06em;padding:7px 10px;margin:0;cursor:pointer;
  color:var(--v3-mut);background:none;border:none;border-bottom:2px solid transparent;border-radius:0;white-space:nowrap;transition:color .15s}
.v3al-sel:hover{color:var(--v3-ink)}
.v3al-sel.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}
.v3al-sel .v3al-n{color:var(--v3-mut);margin-left:4px}
.v3al-leer{font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-gold2);
  background:none;border:none;padding:7px 0;margin:0;cursor:pointer;white-space:nowrap}
.v3al-leer:hover{color:var(--v3-ink)}
.v3al-leer[disabled]{opacity:.45;cursor:default}
/* la lista: un bloque por día, con la fecha arriba y las alertas en una card */
.v3al-lista{display:flex;flex-direction:column;gap:14px;min-width:0}
.v3al-dia{font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin:0 0 8px 2px}
.v3al-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow:hidden}
.v3al-it{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;align-items:start;padding:14px 18px;
  border-bottom:1px solid var(--v3-line2);min-width:0}
.v3al-it:last-child{border-bottom:none}
.v3al-it.nueva{background:var(--v3-hl)}
.v3al-tipo{display:flex;flex-direction:column;gap:6px;align-items:flex-start;min-width:0}
.v3al-pill{font:700 9px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:4px;white-space:nowrap}
.v3al-hora{font:500 10.5px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--v3-mut)}
.v3al-cuerpo{min-width:0}
.v3al-tit{display:flex;align-items:flex-start;gap:8px;min-width:0}
.v3al-tit b{font:600 14px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);line-height:1.4;overflow-wrap:anywhere}
.v3al-pt{width:7px;height:7px;border-radius:50%;background:var(--v3-serie);display:block;flex:none;margin-top:6px}
.v3al-sub{font-size:11.5px;color:var(--v3-mut);margin-top:3px;line-height:1.5;overflow-wrap:anywhere}
.v3al-raz{font-size:12.5px;color:var(--v3-sub);line-height:1.55;margin-top:6px;overflow-wrap:anywhere}
.v3al-acc{display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap;margin-top:10px}
.v3al-btn{font:600 10px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;
  background:var(--v3-navy);border:1px solid var(--v3-navy);padding:7px 11px;border-radius:6px;white-space:nowrap;cursor:pointer}
.v3al-btn:hover{background:var(--v3-serie);border-color:var(--v3-serie)}
/* en oscuro --v3-serie es el dorado: con texto blanco encima no se lee */
[data-theme="dark"] .v3al-btn:hover{color:#0E1830;background:var(--v3-goldL);border-color:var(--v3-goldL)}
.v3al-btn.ok{color:var(--v3-up);background:var(--v3-upBg);border-color:transparent}
.v3al-btn.ok:hover{background:var(--v3-upBg);border-color:var(--v3-up)}
.v3al-btn[disabled]{opacity:.45;cursor:default}
.v3al .v3al-ir{font:600 10px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;
  color:var(--v3-gold2);text-decoration:none;white-space:nowrap}
.v3al .v3al-ir:hover{color:var(--v3-ink)}
/* "Este mes": el único bloque sólido, navy con dorado claro encima */
.v3al-mes{background:var(--v3-navy);border:1px solid var(--v3-navy);border-radius:12px;padding:18px 20px;color:#fff;min-width:0}
.v3al-eye{font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,206,150,.85);margin:0}
.v3al-cif{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.v3al-cif .v{font:600 22px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:#fff;line-height:1.1;overflow-wrap:anywhere}
.v3al-cif .k{font-size:10.5px;color:rgba(255,255,255,.6);margin-top:2px;line-height:1.4}
.v3al-lado{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:16px 18px;min-width:0}
.v3al-lado .v3al-eye{color:var(--v3-mut)}
.v3al-lado p{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:8px 0 0;overflow-wrap:anywhere}
.v3al-lado p b{color:var(--v3-ink);font-weight:600}
/* avisos, vacío y error */
.v3al-aviso{font-size:12px;line-height:1.55;color:var(--v3-warn);background:var(--v3-warnBg);border-radius:8px;padding:8px 12px}
.v3al-vacio{background:var(--v3-card);border:1px dashed var(--v3-line);border-radius:12px;padding:20px 22px}
.v3al-vacio b{display:block;font:700 18px 'Playfair Display',Georgia,serif;color:var(--v3-ink);line-height:1.25;margin-bottom:6px}
.v3al-vacio p{font-size:13px;color:var(--v3-sub);line-height:1.65;margin:0}
.v3al-vacio .v3al-ir{display:inline-block;margin-top:12px}
.v3al-reint{font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-gold2);
  background:none;border:none;padding:0 0 0 6px;margin:0;cursor:pointer}
.v3al-reint:hover{color:var(--v3-ink)}
/* bloque de PRO: la lista va desenfocada con el acceso a planes. Lo de atrás son
   barras vacías, NUNCA alertas inventadas: lo que no se puede leer, no se dibuja */
.v3al-pro{position:relative;border-radius:12px;overflow:hidden;min-height:210px}
.v3al-velo{filter:blur(4px);pointer-events:none;user-select:none}
.v3al-sk{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;padding:16px 18px;border-bottom:1px solid var(--v3-line2)}
.v3al-sk:last-child{border-bottom:none}
.v3al-sk i{display:block;height:10px;border-radius:5px;background:var(--v3-track);margin:4px 0}
.v3al-sk .a i:first-child{height:16px;border-radius:4px}
.v3al-sk .b i:nth-child(2){width:62%}
.v3al-sk .b i:nth-child(3){width:84%}
.v3al-lock{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
  text-align:center;padding:20px 16px;background:rgba(255,255,255,.66)}
[data-theme="dark"] .v3al-lock{background:rgba(11,19,39,.66)}
.v3al-lock b{font:700 19px 'Playfair Display',Georgia,serif;color:var(--v3-ink);line-height:1.25}
.v3al-lock p{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:0;max-width:340px}
.v3al .v3al-cta{display:inline-block;font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:#fff;background:var(--v3-navy);border:1px solid var(--v3-navy);padding:10px 20px;border-radius:7px;text-decoration:none;margin-top:2px}
.v3al .v3al-cta:hover{background:var(--v3-serie);border-color:var(--v3-serie);color:#fff}
[data-theme="dark"] .v3al .v3al-cta{color:#0E1830;background:var(--v3-goldL);border-color:var(--v3-goldL)}
[data-theme="dark"] .v3al .v3al-cta:hover{color:#0E1830;background:var(--v3-gold);border-color:var(--v3-gold)}
.v3al-nota{font:400 11.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut);line-height:1.7;margin:10px 0 0;max-width:760px}
.v3al-cargando{font:400 13px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut)}
/* celular: la etiqueta del tipo y la hora pasan a la misma línea, arriba del texto */
@media(max-width:560px){
  .v3al-it,.v3al-sk{grid-template-columns:minmax(0,1fr);gap:8px;padding:14px}
  .v3al-tipo{flex-direction:row;align-items:center;gap:8px}
  .v3al-sk .a{display:flex;gap:8px}
  .v3al-sk .a i{width:64px;margin:0}
  .v3al-cif .v{font-size:19px}
}
/* ── el selector de segmento (carteras | precio): los mismos .v3al-sel de los filtros,
   con una línea abajo que lo separa de ellos ── */
.v3al-vistas{border-bottom:1px solid var(--v3-line2);margin:0 0 16px}
.v3al-sel .v3al-pt{display:inline-block;vertical-align:middle;margin:0 0 2px 6px}
/* ── "Tus alertas de precio" ── */
.v3al-cab{display:flex;align-items:center;justify-content:space-between;gap:8px 14px;flex-wrap:wrap;min-width:0}
.v3al-cab .v3al-eye{color:var(--v3-mut)}
/* primario navy (--v3-btn) y secundario blanco con borde: nada crema ni dorado de relleno */
.v3al-btn.sec{color:var(--v3-ink);background:var(--v3-card);border-color:var(--v3-line)}
.v3al-btn.sec:hover{color:var(--v3-ink);background:var(--v3-hover);border-color:var(--v3-mut)}
.v3al-btn.pri{color:var(--v3-btnTx);background:var(--v3-btn);border-color:var(--v3-btn);transition:opacity .15s}
.v3al-btn.pri:hover{color:var(--v3-btnTx);background:var(--v3-btn);border-color:var(--v3-btn);opacity:.86}
[data-theme="dark"] .v3al-btn.sec:hover{color:var(--v3-ink);background:var(--v3-hover);border-color:var(--v3-mut)}
[data-theme="dark"] .v3al-btn.pri:hover{color:var(--v3-btnTx);background:var(--v3-btn);border-color:var(--v3-btn)}
.v3al-btn.chico{padding:5px 9px;font-size:9.5px}
.v3al-ch{display:flex;align-items:flex-start;justify-content:space-between;gap:6px 14px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--v3-line2)}
.v3al-ch b{font:600 13px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink)}
.v3al-ch .v3al-sub{margin-top:2px}
.v3al-ch .v3al-leer{padding:0}
.v3al-ch .pau{font-weight:500;color:var(--v3-mut)}
.v3al-nada{font-size:12.5px;color:var(--v3-sub);line-height:1.6;padding:16px 18px;overflow-wrap:anywhere}
/* una fila por alerta activa: ticker, nombre, pastilla con la condición, el precio de hoy */
.v3al-ap{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--v3-line2);min-width:0}
.v3al-ap:last-child{border-bottom:none}
.v3al-ap.off .v3al-tit2 b,.v3al-ap.off .v3al-pill.up,.v3al-ap.off .v3al-pill.dn{opacity:.55}
.v3al-tit2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.v3al-tit2 b{font:700 14px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink)}
.v3al-tit2 .nom{font-size:11.5px;color:var(--v3-mut);overflow-wrap:anywhere}
.v3al-hoy{font:500 11.5px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--v3-sub);margin-top:5px;overflow-wrap:anywhere}
.v3al-ap .acc{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.v3al-pill.up,.v3al-pill.dn{font:600 11px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:0;text-transform:none}
.v3al-pill.up{color:var(--v3-up);background:var(--v3-upBg)}
.v3al-pill.dn{color:var(--v3-dn);background:var(--v3-dnBg)}
.v3al-pill.pau{color:var(--v3-mut);background:var(--v3-neutro)}
/* historial: cada fila es un botón (tocarla abre el activo en Mi cartera) */
.v3al-hi{display:grid;grid-template-columns:112px minmax(0,1fr);gap:4px 14px;align-items:start;width:100%;text-align:left;padding:12px 18px;margin:0;
  border:none;border-bottom:1px solid var(--v3-line2);border-radius:0;background:none;color:var(--v3-ink);cursor:pointer;font-family:inherit;min-width:0}
.v3al-hi:last-child{border-bottom:none}
.v3al-hi:hover{background:var(--v3-hover)}
.v3al-hi .f{font:500 10.5px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--v3-mut);line-height:1.6;white-space:nowrap}
.v3al-hi .t{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.45;min-width:0;overflow-wrap:anywhere}
.v3al-hi .t .v3al-pt{margin-top:5px}
/* mini-form de alta: activo, sube/baja, umbral en la moneda y unidad del activo. El
   sube/baja son los mismos .v3al-sel (subrayado dorado, sin caja), como el "Avisarme si…"
   de la fila de Mi cartera */
.v3al-form{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:14px 18px;margin:0;background:var(--v3-hl)}
.v3al-form label,.v3al-form .lab{display:block;font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin:0 0 5px}
.v3al-form select,.v3al-form input{width:100%;font:500 13px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);background:var(--v3-card);
  border:1px solid var(--v3-line);border-radius:7px;padding:8px 10px;min-width:0;margin:0}
.v3al-form input{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.v3al-form select:focus,.v3al-form input:focus{outline:none;border-color:var(--v3-mut)}
.v3al-form .u{font:500 10.5px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--v3-mut);line-height:1.5;margin-top:5px;overflow-wrap:anywhere}
.v3al-form .acc{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap}
.v3al-form .nota{font-size:11.5px;color:var(--v3-mut);line-height:1.5;flex:1 1 200px;min-width:0}
.v3al-form .msg{color:var(--v3-dn)}
.v3al-nada .v3al-acc{margin-top:8px}
.v3al-nada .v3al-reint{padding-left:0}
@media(min-width:620px){.v3al-form{grid-template-columns:minmax(0,1.5fr) auto minmax(0,1fr)}.v3al-form .acc{grid-column:1/-1}}
@media(max-width:560px){
  .v3al-ap{grid-template-columns:minmax(0,1fr)}
  .v3al-ap .acc{justify-content:flex-start}
  .v3al-hi{grid-template-columns:minmax(0,1fr);gap:2px}
}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ───────────────────────── rótulos ───────────────────────── */
// los TRES tipos que escribe Operar, ni uno más: son los de TIPOS en panel-operar.js
// (compra | venta | peso). Un tipo que Operar no escribe sería un filtro que siempre
// da cero y una etiqueta que no existe; si mañana aparece otro valor, item() lo
// muestra con su propio nombre en vez de esconderlo. El color sale de las --v3-*
const TIPOS = {
  compra: ['Compra', 'var(--v3-up)', 'var(--v3-upBg)'],
  venta: ['Venta', 'var(--v3-dn)', 'var(--v3-dnBg)'],
  peso: ['Peso', 'var(--v3-gold2)', 'var(--v3-goldBg)'],
};
const FILTROS = [['todas', 'Todas'], ['compra', 'Compras'], ['venta', 'Ventas'], ['peso', 'Pesos']];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_DEF = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// las únicas dos que el usuario replica en su broker
const ACCIONABLE = t => t === 'compra' || t === 'venta';

const esISO = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const finito = n => n != null && n !== '' && typeof n !== 'boolean' && isFinite(Number(n));
const T12 = iso => Date.parse(iso + 'T12:00:00Z');
const addD = (iso, n) => new Date(T12(iso) + n * 864e5).toISOString().slice(0, 10);
const may = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/* ───────────────────────── datos ───────────────────────── */
const db = () => getFirestore(getApp());

// el valor que le pone Operar a una alerta cuando Lauti la publica (panel-operar.js,
// publicar(): estado 'borrador' → 'publicado'). Mismo par que ya usa `noticias` en
// panel.js y en firestore.rules: la regla pide estado == 'publicado' y la consulta
// lleva el mismo where, porque una regla no recorta un listado, lo rechaza entero
const PUBLICADO = 'publicado';

/* Las visibilidades que esta cuenta puede leer, en el MISMO orden de ideas que la
   regla de carterasModelo y de informes: "publico" cualquiera, "clientes" los
   suscriptores, y el admin además las de las carteras en borrador. Esta lista y la
   regla tienen que decir lo mismo: si la consulta pidiera una visibilidad de más,
   Firestore le voltea el listado completo y la pestaña se queda en el cartel de
   error; si pidiera una de menos, el suscriptor no ve lo que pagó. */
function visiblesPara(S) {
  if (S.isAdmin) return ['publico', 'clientes', 'borrador'];
  return S.pro ? ['publico', 'clientes'] : ['publico'];
}

/* Las alertas que ESTE usuario puede listar. El gate real es firestore.rules; la web
   acompaña con los mismos dos filtros: la visibilidad que le corresponde y solo lo
   publicado. Ojo con una alerta de una cartera en borrador: Operar le pone
   visibilidad "borrador" a propósito ("esta cartera no está publicada, no le llega a
   nadie"), así que NO alcanza con no filtrar por plan —un suscriptor la vería—. */
async function leerAlertas(ctx) {
  const vis = visiblesPara(ctx.S);
  const col = collection(db(), 'alertas');
  const filtroVis = vis.length === 1 ? where('visibilidad', '==', vis[0]) : where('visibilidad', 'in', vis);
  let snap;
  try {
    snap = await getDocs(query(col, filtroVis, where('estado', '==', PUBLICADO)));
  } catch (e) {
    // si a Firestore le faltara un índice para las dos condiciones juntas, se pide
    // solo por visibilidad y el estado se filtra abajo: peor que la consulta buena,
    // pero nunca una pestaña vacía. Cualquier otro error (empezando por el permiso)
    // sube y lo muestra el cartel con "Reintentar"
    if (String((e && e.code) || '') !== 'failed-precondition') throw e;
    snap = await getDocs(query(col, filtroVis));
  }
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }))
    .filter(a => a && a.estado === PUBLICADO)
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))
      || String(b.hora || '').localeCompare(String(a.hora || '')));
}

/* Lo que el usuario marcó de cada alerta. Es suyo y de nadie más; si no se puede leer
   (mail sin verificar, regla todavía sin publicar) la pestaña se dibuja igual y lo dice:
   antes que mostrar todo como "sin leer" sin explicación. */
async function leerEstados(ctx) {
  if (!ctx.S.verificado) return null;
  const snap = await getDocs(collection(db(), 'inversores', ctx.S.email, 'alertasEstado'));
  const out = {};
  snap.docs.forEach(d => { out[d.id] = d.data() || {}; });
  return out;
}

// caché por cuenta (y por plan: al detectarse PRO se vuelve a consultar con el gate nuevo)
let _datos = null;
async function cargar(ctx, forzar) {
  const email = ctx.S.email, pro = !!ctx.S.pro;
  if (!forzar && _datos && _datos.email === email && _datos.pro === pro) return _datos;
  const [alertas, estados] = await Promise.all([
    leerAlertas(ctx),
    Promise.resolve().then(() => leerEstados(ctx)).catch(() => undefined),
  ]);
  const d = { email, pro, alertas, estados: estados || {}, falloEstados: estados === undefined };
  _datos = d;
  return d;
}

const leida = (d, a) => !!(d.estados[a.id] || {}).leida;
const hecha = (d, a) => !!(d.estados[a.id] || {}).hecha;

/* el contador del lateral: cuántas no leyó todavía. Lo llama panel.js (contadores) */
export async function contarNoLeidas(ctx) {
  const d = await cargar(ctx);
  return d.alertas.filter(a => !leida(d, a)).length;
}

/* marca alertas en inversores/{email}/alertasEstado/{alertaId}. Va en LOTE y no de a
   una: "Marcar todas como leídas" puede tocar veinte documentos, y de a una alcanza
   con que falle la décima para que la mitad quede marcada en el servidor, la caché de
   acá no se toque y la pantalla muestre una cosa distinta de la que hay guardada.
   merge: "Ya lo hice" no puede borrar el "leída" que ya estaba, ni al revés */
const LOTE_MAX = 400;   // el tope de Firestore son 500 operaciones por lote
async function marcar(ctx, ids, campos) {
  const email = ctx.S.email;
  for (let i = 0; i < ids.length; i += LOTE_MAX) {
    const lote = writeBatch(db());
    ids.slice(i, i + LOTE_MAX).forEach(id => lote.set(
      doc(db(), 'inversores', email, 'alertasEstado', String(id)),
      { ...campos, cuando: serverTimestamp() }, { merge: true }));
    await lote.commit();
  }
  if (_datos && _datos.email === email) {
    ids.forEach(id => { _datos.estados[id] = { ...(_datos.estados[id] || {}), ...campos }; });
  }
}

/* ───────────────────────── estado del módulo ───────────────────────── */
// vista: 'carteras' (el registro de las carteras Valtia) | 'precio' (tus alertas de precio);
// form: el mini-form de alta abierto ({ ticker, cond, umbral, msg, creando }) o null; umbral
// null = el precargado (5 % del precio de hoy). Se conservan por cuenta: otra cuenta arranca
// en 'carteras' con el form cerrado
const E = { email: null, filtro: 'todas', vista: 'carteras', form: null };
let _el = null, _ctx = null, _seq = 0, _ocupado = false;
// lo último que se dibujó ({ email, d, p }): repintar() rearma con esto sin volver a leer
let _ultimo = null;
// disparadas que esta pestaña ya marcó como vistas (`${email}/${id}`): nunca se marca dos
// veces la misma, así el "marcar y repintar una vez" no puede volverse un bucle
const _vistasMarcadas = new Set();
let _marcando = false;
// las que se acaban de marcar vistas siguen con el punto mientras el usuario esté en el
// segmento: si no, el punto se apagaría en el mismo repintado que las marca
const _recien = new Set();

/* ───────────────────────── entrada ───────────────────────── */
export async function renderAlertas(el, ctx) {
  if (!el || !ctx) return;
  try {
    ponerCss();
    _el = el; _ctx = ctx;
    if (E.email !== ctx.S.email) {
      E.email = ctx.S.email; E.filtro = 'todas'; E.vista = 'carteras'; E.form = null; _ultimo = null; _recien.clear();
    }
    if (!el.__alertas) {
      el.__alertas = true;
      el.addEventListener('click', alClic);
      // el <select> del mini-form: al cambiar de activo se vuelve a proponer el umbral
      el.addEventListener('change', alCambio);
    }
    if (!el.querySelector('.v3al')) el.innerHTML = '<p class="v3al-cargando">Cargando tus alertas…</p>';
    await dibujar(false);
  } catch (e) {
    try { el.innerHTML = errorHtml(); } catch (x) {}
  }
}

const errorCartel = () => `<div class="v3al-vacio"><b>No pudimos leer las alertas</b>
  <p>Puede ser la conexión.<button type="button" class="v3al-reint" data-al="reintentar">Reintentar</button></p></div>`;
const errorHtml = () => `<div class="v3al">${errorCartel()}</div>`;

/* Las dos fuentes se piden juntas y cada una puede fallar sola: la vista abierta muestra
   su cartel de error si SU lectura falló; la otra solo aporta el número del selector (si
   no llegó, el selector va sin número). La cartera solo se pide para la vista 'precio' */
async function dibujar(forzar) {
  const el = _el, ctx = _ctx;
  if (!el || !ctx) return;
  const email = ctx.S.email, seq = ++_seq, vista = E.vista;
  const tolerar = pr => pr.then(v => v, () => null);
  const [d, p] = await Promise.all([tolerar(cargar(ctx, forzar)), tolerar(cargarPrecio(ctx, vista === 'precio'))]);
  if (ctx.S.email !== email || seq !== _seq) return;
  _ultimo = { email, d, p };
  capturarForm();   // lo que el usuario escribió en el mini-form sobrevive al repintado
  try { el.innerHTML = armarTodo(d, p, ctx); }
  catch (e) { el.innerHTML = errorHtml(); return; }
  if (vista === 'precio' && p) marcarVistasPendientes(p, ctx, email);
}

/* rearma con lo último leído (abrir o cerrar el form, un error del form): sin volver a
   Firestore. Si no hay nada leído para esta cuenta —o la vista 'precio' no tiene la
   cartera, porque lo último se leyó para 'carteras'—, lee. foco: selector a enfocar */
function repintar(foco) {
  const el = _el, ctx = _ctx;
  if (!el || !ctx) return;
  const u = _ultimo;
  if (!u || u.email !== ctx.S.email || (E.vista === 'precio' && (!u.p || (!u.p.noVerif && !u.p.cart)))) { dibujar(false); return; }
  capturarForm();
  try { el.innerHTML = armarTodo(u.d, u.p, ctx); } catch (e) { el.innerHTML = errorHtml(); return; }
  const x = foco ? el.querySelector(foco) : null;
  if (x) { try { x.focus(); if (typeof x.select === 'function') x.select(); } catch (e) {} }
}

/* ───────────────────────── armado ───────────────────────── */
function armarTodo(d, p, ctx) {
  const cuerpo = E.vista === 'precio' ? (p ? armarPrecio(p, ctx) : errorCartel()) : (d ? armar(d, ctx) : errorCartel());
  return `<div class="v3al">${selectorVista(d, p, ctx)}${cuerpo}</div>`;
}

/* "De las carteras Valtia N" | "Tus alertas de precio M" (M = activas sin disparar).
   Mismos .v3al-sel que los filtros: sin caja, la elegida con el subrayado dorado. Si hay
   alertas de precio que saltaron y no viste, "Tus alertas de precio" lleva el punto: la
   pastilla del lateral las cuenta y, desde "De las carteras Valtia", no se verían */
function selectorVista(d, p, ctx) {
  const esc = ctx.esc;
  const n = d ? String(d.alertas.length) : '';
  const m = p && !p.noVerif ? String((p.alertas || []).filter(a => a.activa !== false && a.disparada == null).length) : '';
  const nuevas = E.vista !== 'precio' && p && !p.noVerif ? (p.alertas || []).filter(a => a.disparada != null && !a.vista).length : 0;
  const pt = nuevas ? `<i class="v3al-pt" aria-label="${nuevas === 1 ? 'una saltó y no la viste' : esc(nuevas + ' saltaron y no las viste')}" title="${nuevas === 1 ? 'Una alerta saltó y no la viste' : esc(nuevas + ' alertas saltaron y no las viste')}"></i>` : '';
  const b = (k, l, c, extra) => `<button type="button" class="v3al-sel${E.vista === k ? ' on' : ''}" aria-pressed="${E.vista === k}" data-al="vista:${k}">${esc(l)}${c !== '' ? ` <span class="v3al-n">${esc(c)}</span>` : ''}${extra || ''}</button>`;
  return `<div class="v3al-top v3al-vistas"><div class="v3al-fil" role="group" aria-label="Qué alertas ver">${b('carteras', 'De las carteras Valtia', n)}${b('precio', 'Tus alertas de precio', m, pt)}</div></div>`;
}

function armar(d, ctx) {
  const esc = ctx.esc, S = ctx.S;
  const hoy = ctx.hoyAR();
  const todas = d.alertas;
  const vis = todas.filter(a => E.filtro === 'todas' || a.tipo === E.filtro);
  const sinLeer = todas.filter(a => !leida(d, a)).length;
  const puedeMarcar = !!S.verificado && !d.falloEstados;

  const avisos = [
    !S.verificado ? 'Verificá tu mail para marcar alertas como leídas o como replicadas: hasta entonces los botones quedan apagados.' : '',
    S.verificado && d.falloEstados ? 'No pudimos leer qué alertas ya marcaste, así que todas aparecen sin leer. Probá de nuevo en un rato.' : '',
  ].filter(Boolean).map(t => `<div class="v3al-aviso">${esc(t)}</div>`).join('');

  let cuerpo;
  if (!vis.length) {
    cuerpo = todas.length
      ? `<div class="v3al-vacio"><b>Nada con este filtro</b><p>No hay alertas de ese tipo todavía.</p></div>`
      : vacio(ctx);
  } else {
    cuerpo = `<div class="v3al-lista">${grupos(vis, hoy, ctx).map(g => `<div>
      <div class="v3al-dia">${esc(g.titulo)}</div>
      <div class="v3al-card">${g.items.map(a => item(a, d, ctx, puedeMarcar)).join('')}</div></div>`).join('')}</div>`;
  }

  return `<div class="v3al-grid">
    <div class="v3al-col">
      <div class="v3al-top">
        <div class="v3al-fil" role="group" aria-label="Tipo de alerta">${FILTROS.map(([k, l]) => {
          const n = k === 'todas' ? todas.length : todas.filter(a => a.tipo === k).length;
          return `<button type="button" class="v3al-sel${E.filtro === k ? ' on' : ''}" aria-pressed="${E.filtro === k}" data-al="filtro:${k}">${l} <span class="v3al-n">${n}</span></button>`;
        }).join('')}</div>
        <button type="button" class="v3al-leer" data-al="leertodas"${puedeMarcar && sinLeer ? '' : ' disabled'}>Marcar todas como leídas</button>
      </div>
      ${avisos}
      ${cuerpo}
      ${S.pro ? '' : bloquePro(ctx)}
      <p class="v3al-nota">Cada alerta es una operación de una cartera modelo de Valtia, con el precio al que se hizo y por qué. No es una recomendación personalizada ni una orden: vos decidís si la replicás en tu broker. “Ya lo hice” queda guardado en tu cuenta, es solo tuyo y no cambia nada de la cartera.</p>
    </div>
    <aside class="v3al-lat">${esteMes(todas, d, ctx)}
      <div class="v3al-lado"><div class="v3al-eye">Cómo te llegan</div>
        <p>Cada alerta queda acá, en tu panel, apenas se publica. El mail es aparte: en <b>Mi cuenta</b> elegís qué avisos querés recibir, y ahí mismo te dice cuáles ya salen y cuáles todavía no.</p>
        <p><a class="v3al-ir" href="#panel/cuenta" data-go="cuenta">Elegir qué avisos recibir →</a></p>
      </div>
    </aside>
  </div>`;
}

/* lo que hay que decir cuando todavía no hay ninguna: qué va a aparecer acá, sin
   prometer cuándo (hasta que Lauti use Operar, esto es lo que se ve) */
function vacio(ctx) {
  const abiertas = ctx.S.pro ? '' : ' Las de las carteras abiertas las vas a ver con cualquier plan.';
  return `<div class="v3al-vacio"><b>Todavía no hay alertas</b>
    <p>Acá va a quedar cada movimiento de las carteras Valtia: qué se compró o se vendió, a qué precio,
    en qué cartera y por qué se hizo, y también cuando cambia el peso de una posición. Cada uno con su
    día y su hora, el más nuevo arriba.${abiertas}</p>
    <a class="v3al-ir" href="#panel/carteras" data-go="carteras">Ver las carteras →</a></div>`;
}

/* agrupa por día, respetando el orden en que vienen (la más nueva arriba) */
function grupos(vis, hoy, ctx) {
  const out = [];
  vis.forEach(a => {
    const f = esISO(String(a.fecha || '').slice(0, 10)) ? String(a.fecha).slice(0, 10) : '';
    let g = out[out.length - 1];
    if (!g || g.f !== f) out.push(g = { f, titulo: tituloDia(f, hoy, ctx), items: [] });
    g.items.push(a);
  });
  return out;
}

function tituloDia(f, hoy, ctx) {
  if (!f) return 'Sin fecha';
  const meses = Array.isArray(ctx.MESES) && ctx.MESES.length === 12 ? ctx.MESES : MESES_DEF;
  const dia = DIAS[new Date(T12(f)).getUTCDay()] || '';
  const txt = `${dia} ${Number(f.slice(8, 10))} de ${meses[Number(f.slice(5, 7)) - 1] || ''}`
    + (f.slice(0, 4) !== hoy.slice(0, 4) ? ' de ' + f.slice(0, 4) : '');
  if (f === hoy) return 'Hoy · ' + txt;
  if (f === addD(hoy, -1)) return 'Ayer · ' + txt;
  return may(txt);
}

/* el título se arma con los datos de la alerta: nada que no esté en el documento */
function titulo(a, ctx) {
  const tk = String(a.ticker || '').trim().toUpperCase();
  const px = finito(a.precio) ? ' a US$' + ctx.num(Number(a.precio), 2) : '';
  if (a.tipo === 'compra') return tk ? `Compré ${tk}${px}` : 'Compra en la cartera';
  if (a.tipo === 'venta') return tk ? `Vendí ${tk}${px}` : 'Venta en la cartera';
  if (a.tipo === 'peso') return tk ? `Cambié el peso de ${tk}` : 'Cambié los pesos de la cartera';
  return tk ? `${tk}${px}` : 'Novedad de la cartera';
}

function item(a, d, ctx, puedeMarcar) {
  const esc = ctx.esc;
  const [rot, color, fondo] = TIPOS[a.tipo] || [may(a.tipo || 'Novedad'), 'var(--v3-mut)', 'var(--v3-neutro)'];
  const nueva = !leida(d, a);
  const ya = hecha(d, a);
  const cart = String(a.carteraNombre || a.cartera || '').trim();
  const emp = String(a.empresa || '').trim();
  const sub = [cart, emp].filter(Boolean).join(' · ');
  const id = String(a.id);
  const acc = [];
  if (ACCIONABLE(a.tipo)) {
    acc.push(`<button type="button" class="v3al-btn${ya ? ' ok' : ''}" data-al="hecha:${esc(id)}"${puedeMarcar ? '' : ' disabled'}
      title="${ya ? 'Marcada como replicada en tu broker' : 'Marcá que ya la replicaste en tu broker'}">${ya ? '✓ Hecho' : 'Ya lo hice'}</button>`);
  }
  if (a.cartera) acc.push(`<a class="v3al-ir" href="/cartera?c=${encodeURIComponent(String(a.cartera))}">Ver cartera →</a>`);
  return `<div class="v3al-it${nueva ? ' nueva' : ''}" data-al="leer:${esc(id)}">
    <div class="v3al-tipo"><span class="v3al-pill" style="color:${color};background:${fondo}">${esc(rot)}</span>
      ${a.hora ? `<span class="v3al-hora">${esc(String(a.hora).slice(0, 5))}</span>` : ''}</div>
    <div class="v3al-cuerpo">
      <div class="v3al-tit">${nueva ? '<i class="v3al-pt" aria-label="sin leer" title="sin leer"></i>' : ''}<b>${esc(titulo(a, ctx))}</b></div>
      ${sub ? `<div class="v3al-sub">${esc(sub)}</div>` : ''}
      ${a.razonamiento ? `<div class="v3al-raz">${esc(a.razonamiento)}</div>` : ''}
      ${acc.length ? `<div class="v3al-acc">${acc.join('')}</div>` : ''}
    </div></div>`;
}

/* "Este mes": tres cifras, todas contadas sobre las alertas que este usuario puede leer */
function esteMes(todas, d, ctx) {
  const mes = ctx.hoyAR().slice(0, 7);
  const delMes = todas.filter(a => String(a.fecha || '').slice(0, 7) === mes);
  const acc = delMes.filter(a => ACCIONABLE(a.tipo));
  const carteras = new Set(delMes.map(a => String(a.cartera || a.carteraNombre || '')).filter(Boolean));
  const cifras = [
    [String(delMes.length), delMes.length === 1 ? 'alerta' : 'alertas'],
    [`${acc.filter(a => hecha(d, a)).length}/${acc.length}`, 'replicadas'],
    [String(carteras.size), carteras.size === 1 ? 'cartera' : 'carteras'],
  ];
  return `<div class="v3al-mes"><div class="v3al-eye">Este mes</div>
    <div class="v3al-cif">${cifras.map(([v, k]) => `<div><div class="v">${ctx.esc(v)}</div><div class="k">${ctx.esc(k)}</div></div>`).join('')}</div></div>`;
}

/* Plan gratis: la lista de las carteras de suscriptores va desenfocada con el acceso a
   /planes. Atrás no hay alertas de mentira —serían datos inventados—: hay barras vacías */
function bloquePro(ctx) {
  const sk = `<div class="v3al-sk"><div class="a"><i></i><i></i></div><div class="b"><i></i><i></i><i></i></div></div>`;
  return `<div class="v3al-pro">
    <div class="v3al-velo v3al-card" aria-hidden="true">${sk}${sk}${sk}</div>
    <div class="v3al-lock">
      <b>Las alertas son parte de Valtia PRO</b>
      <p>Cada compra, venta y cambio de peso de las carteras de suscriptores, el mismo día, con el precio y la razón. Las de las carteras abiertas las ves siempre.</p>
      <a class="v3al-cta" href="/planes">Ver planes</a>
    </div></div>`;
}

/* ───────────────────────── tus alertas de precio: datos ───────────────────────── */
// los precios más nuevos que pintó Mi cartera (se releen cada dos minutos y emite
// EVENTO_PRECIOS con { email, precios }): el "hoy" de cada alerta usa esos si son de esta
// cuenta y, si no, los que leyó el panel (ctx.carteraCalc, que no se relee solo)
let _vivos = { email: null, precios: null };
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener(EVENTO_PRECIOS, ev => {
    const d = ev && ev.detail;
    if (d && d.email && d.precios && typeof d.precios === 'object') _vivos = { email: d.email, precios: d.precios };
  });
}

const tkM = s => String(s == null ? '' : s).trim().toUpperCase();
// Timestamp de Firestore, Date, número o ISO → milisegundos (0 si no hay)
function msDe(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t instanceof Date) return t.getTime();
  const n = typeof t === 'number' ? t : Date.parse(t);
  return Number.isFinite(n) ? n : 0;
}
// los mismos rótulos que el "Avisarme si…" de la fila de Mi cartera
const monNombre = m => m === 'ARS' ? 'en pesos ($)' : m === 'USD' ? 'en dólares (US$)' : 'moneda sin confirmar';
// el número del input como lo escribe la gente: coma decimal y sin puntos de miles
const numIn = n => (n == null || n === '' || !isFinite(Number(n))) ? ''
  : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 8, useGrouping: false });
// el precio como lo muestra la fila de Mi cartera: money() del panel y, por debajo de 1
// (cripto chica), fmtPrecio con sus cifras significativas. Siempre en la moneda de la alerta
const fmtAl = ctx => (n, m) => Math.abs(Number(n)) < 1 ? fmtPrecio(n, m) : ctx.money(n, m);
// "+4,3 %" / "−2,1 %" (con dos decimales si es menos de 0,1 %: "+0,0 %" diría que ya llegó)
const pctSigno = x => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(Math.abs(x) < 0.1 ? 2 : 1).replace('.', ',') + ' %';

/* lo que necesita el segmento: las alertas de precio de la cuenta (alertas-precio.js, con
   su caché de 60 s) y, solo si se va a dibujar, la cartera con sus precios. Sin mail
   verificado la regla no deja leer: no se pide nada y la vista lo dice. Si fallan las
   alertas, tira (la vista muestra el cartel con Reintentar); si falla la cartera, las
   alertas se dibujan igual, sin el precio de hoy */
async function cargarPrecio(ctx, conCartera) {
  const email = ctx.S.email;
  if (!ctx.S.verificado) return { email, noVerif: true, alertas: [], cart: null };
  const [alertas, cart] = await Promise.all([leerAlertasPrecio(email), conCartera ? leerCartera(ctx) : null]);
  return { email, noVerif: false, alertas: Array.isArray(alertas) ? alertas : [], cart };
}

/* la cartera por ticker (en mayúsculas, como las guarda Mi cartera), con los precios que
   leyó el panel. Nunca tira: si no se pudo leer, { fallo: true } */
async function leerCartera(ctx) {
  try {
    const [cc, bonos] = await Promise.all([ctx.carteraCalc(), Promise.resolve().then(() => ctx.bonosSet()).catch(() => null)]);
    if (!cc || cc.fallo) return { fallo: true };
    const porTk = new Map();
    const filas = cc.r && Array.isArray(cc.r.filas) ? cc.r.filas : (cc.pos || []);
    filas.forEach(f => { const tk = tkM(f && f.ticker); if (tk && !porTk.has(tk)) porTk.set(tk, f); });
    return { fallo: false, porTk, precios: cc.precios || {}, bonos: bonos instanceof Set ? bonos : new Set() };
  } catch (e) { return { fallo: true }; }
}

function pxDe(p, tk) {
  if (_vivos.email && _vivos.email === p.email && _vivos.precios && _vivos.precios[tk]) return _vivos.precios[tk];
  const c = p.cart;
  return (c && !c.fallo && c.precios && c.precios[tk]) || null;
}

// el nombre solo si dice algo más que el ticker (nombreDe devuelve el ticker si no lo conoce)
function nombreActivo(tk, px) {
  const n = String((px && px.nombre) || nombreDe(tk) || '').trim();
  return n && n.toUpperCase() !== tickerCorto(tk) && n.toUpperCase() !== tk ? n : '';
}

/* un activo de la cartera para el mini-form: el precio y la moneda en que COTIZA (el doc de
   precios, nunca el valor convertido de la vista) y la unidad, con el mismo criterio que
   calcular(): el factor de la posición, el del doc de precios o, si ninguno lo dice, la
   renta fija cotiza cada 100 VN. ok: tiene precio y se le puede poner una alerta */
function infoTicker(p, tk) {
  const c = p.cart;
  if (!c || c.fallo) return null;
  const f = c.porTk.get(tk);
  if (!f) return null;
  const px = pxDe(p, tk);
  const precio = px && !px.sinDatos ? Number(px.precio) : NaN;
  const moneda = px ? px.moneda : null;
  const ok = Number.isFinite(precio) && precio > 0 && (moneda === 'ARS' || moneda === 'USD');
  const rf = esRentaFija(tk, c.bonos);
  const factor = Number(f.factor) > 0 ? Number(f.factor) : (px && Number(px.factor) > 0 ? Number(px.factor) : (rf ? 0.01 : 1));
  // orig: el ticker TAL CUAL está en la posición (como lo manda la fila de Mi cartera);
  // crearAlerta() lo guarda en mayúsculas, así que las dos puertas escriben lo mismo
  const orig = String((f && f.ticker) || tk).trim() || tk;
  return { tk, orig, ok, precio: ok ? precio : null, moneda: ok ? moneda : null, factor, rf, nombre: nombreActivo(tk, px) };
}

// los activos de la cartera a los que se les puede poner una alerta, por ticker
function opciones(p) {
  const c = p && p.cart;
  if (!c || c.fallo) return [];
  return [...c.porTk.keys()].map(tk => infoTicker(p, tk)).filter(i => i && i.ok)
    .sort((a, b) => tickerCorto(a.tk).localeCompare(tickerCorto(b.tk)));
}

// "24/09 14:35" en hora argentina (hoy / ayer con su nombre; el año solo si no es este)
function fechaHoraAR(t, hoy) {
  const m = msDe(t);
  if (!m) return '—';
  const s = new Date(m - 3 * 3600e3).toISOString();
  const f = s.slice(0, 10), h = s.slice(11, 16);
  const dia = f === hoy ? 'hoy' : f === addD(hoy, -1) ? 'ayer'
    : `${f.slice(8, 10)}/${f.slice(5, 7)}${f.slice(0, 4) !== hoy.slice(0, 4) ? '/' + f.slice(2, 4) : ''}`;
  return `${dia} ${h}`;
}

/* ───────────────────────── tus alertas de precio: armado ───────────────────────── */
const ladoPrecio = () => `<aside class="v3al-lat"><div class="v3al-lado"><div class="v3al-eye">Cómo te llegan</div>
    <p>Cuando un activo cruza tu umbral, la alerta salta y queda acá, en el historial, con la pastilla de Alertas encendida.</p>
    <p>Por ahora se revisa cuando abrís el panel y mientras estás en <b>Mi cartera</b>, que relee los precios cada dos minutos (en rueda se actualizan cada 15 minutos). Con el panel cerrado no se revisa.</p>
    <p>El aviso por mail todavía no sale.</p>
  </div></aside>`;

function armarPrecio(p, ctx) {
  const esc = ctx.esc;
  if (p.noVerif) {
    return `<div class="v3al-grid"><div class="v3al-col">
      <div class="v3al-vacio"><b>Tus alertas de precio</b><p>Verificá tu mail para crear alertas de precio.</p></div>
    </div>${ladoPrecio()}</div>`;
  }
  const fmt = fmtAl(ctx), hoy = ctx.hoyAR();
  const lista = p.alertas || [];
  const vivas = lista.filter(a => a.disparada == null);   // ya vienen las más nuevas primero
  const activas = vivas.filter(a => a.activa !== false).length, pausadas = vivas.length - activas;
  const saltaron = lista.filter(a => a.disparada != null).sort((a, b) => msDe(b.disparada) - msDe(a.disparada));
  const n = saltaron.length;

  // con el form abierto no se repite: el form ya dice que no se pudo leer la cartera
  const aviso = p.cart && p.cart.fallo && !E.form
    ? `<div class="v3al-aviso">No pudimos leer tu cartera: tus alertas están, pero sin el precio de hoy.<button type="button" class="v3al-reint" data-al="reintentar">Reintentar</button></div>`
    : '';
  const cabAct = `<div class="v3al-ch"><b>Activas · <span class="v3al-n">${activas}</span>${pausadas
    ? ` <span class="pau">· <span class="v3al-n">${pausadas}</span> pausada${pausadas === 1 ? '' : 's'}</span>` : ''}</b></div>`;
  const filasAct = vivas.length ? vivas.map(a => filaActiva(a, p, ctx, fmt)).join('')
    : `<div class="v3al-nada">No tenés alertas de precio. Abrí la fila de un activo en Mi cartera y tocá «Avisarme si…», o creá una acá.</div>`;
  const cabHist = `<div class="v3al-ch"><div><b>Historial de las que saltaron</b>${n ? '<div class="v3al-sub">Tocá una para ir al activo.</div>' : ''}</div>${n
    ? '<button type="button" class="v3al-leer" data-ap="limpiar">Limpiar historial</button>' : ''}</div>`;
  const filasHist = n ? saltaron.map(a => filaSalto(a, ctx, fmt, hoy)).join('')
    : `<div class="v3al-nada">Todavía no saltó ninguna alerta. Cuando un activo cruce el umbral que le pusiste, vas a verla acá.</div>`;

  return `<div class="v3al-grid">
    <div class="v3al-col">
      <div class="v3al-cab"><div class="v3al-eye">Tus alertas de precio</div>
        <button type="button" class="v3al-btn sec" data-ap="nueva" aria-expanded="${!!E.form}">+ Nueva alerta</button></div>
      ${E.form ? formPrecio(p, ctx, fmt) : ''}
      ${aviso}
      <div class="v3al-card">${cabAct}${filasAct}</div>
      <div class="v3al-card">${cabHist}${filasHist}</div>
      <p class="v3al-nota">El umbral va en la moneda y la unidad en que cotiza el activo (cada 100 VN en la renta fija), sin convertir. Una alerta que ya saltó no se reanuda: si querés seguir mirando ese precio, creá otra.</p>
    </div>
    ${ladoPrecio()}
  </div>`;
}

/* una activa (o pausada): ticker, nombre, la condición en su pastilla verde o roja y el
   precio de hoy con cuánto le falta. Si el activo ya no está en la cartera, se dice */
function filaActiva(a, p, ctx, fmt) {
  const esc = ctx.esc;
  const tk = tkM(a.ticker), id = String(a.id), corto = tickerCorto(tk);
  const on = a.activa !== false, baja = a.condicion === 'baja';
  const c = p.cart && !p.cart.fallo ? p.cart : null;
  const px = pxDe(p, tk);
  const nom = nombreActivo(tk, px);
  let hoy;
  if (c && !c.porTk.has(tk)) hoy = 'ya no está en tu cartera';
  else {
    const precio = px && !px.sinDatos ? Number(px.precio) : NaN, u = Number(a.umbral);
    // sin precio, con sinDatos o sin moneda conocida: no hay "hoy" (tampoco se evalúa).
    // El % sale SOLO de precio y umbral en la misma moneda, nativos, sin convertir: si el
    // precio de hoy vino en otra moneda, esta alerta no se evalúa nunca (alertas-precio.js
    // compara solo en la misma moneda) y el único arreglo es crearla de nuevo
    if (!(Number.isFinite(precio) && precio > 0) || (px.moneda !== 'ARS' && px.moneda !== 'USD')) hoy = 'hoy —';
    else if (px.moneda !== a.moneda) hoy = 'moneda distinta al precio de hoy: borrala y creala de nuevo';
    else if (!(u > 0)) hoy = `hoy ${fmt(precio, a.moneda)}`;
    else if (baja ? precio <= u : precio >= u) hoy = `hoy ${fmt(precio, a.moneda)} · ya cruzó el umbral`;
    else hoy = `hoy ${fmt(precio, a.moneda)} · le falta ${pctSigno((u / precio - 1) * 100)}`;
  }
  const de = ' la alerta de ' + corto;
  return `<div class="v3al-ap${on ? '' : ' off'}">
    <div class="v3al-cuerpo">
      <div class="v3al-tit2"><b>${esc(corto)}</b>${nom ? `<span class="nom">${esc(nom)}</span>` : ''}<span class="v3al-pill ${baja ? 'dn' : 'up'}">${esc(textoAlerta(a, fmt))}</span>${on ? '' : '<span class="v3al-pill pau">Pausada</span>'}</div>
      <div class="v3al-hoy">${esc(hoy)}</div>
    </div>
    <div class="acc">
      <button type="button" class="v3al-btn sec chico" data-ap="${on ? 'pausar' : 'reanudar'}:${esc(id)}" aria-label="${esc((on ? 'Pausar' : 'Reanudar') + de)}">${on ? 'Pausar' : 'Reanudar'}</button>
      <button type="button" class="v3al-btn sec chico" data-ap="borrar:${esc(id)}" aria-label="${esc('Borrar' + de)}">Borrar</button>
    </div></div>`;
}

/* una que saltó: cuándo (hora AR), qué pasó y el punto si es nueva. Tocarla abre el activo */
function filaSalto(a, ctx, fmt, hoy) {
  const esc = ctx.esc;
  const tk = tkM(a.ticker), corto = tickerCorto(tk);
  const nueva = !a.vista || _recien.has(String(a.id));
  return `<button type="button" class="v3al-hi" data-ap="ver:${esc(tk)}" title="${esc('Ver ' + corto + ' en Mi cartera')}">
    <span class="f">${esc(fechaHoraAR(a.disparada, hoy))}</span>
    <span class="t">${nueva ? '<i class="v3al-pt" aria-label="nueva" title="nueva"></i>' : ''}<span>${esc(fraseDisparo(a, fmt))}</span></span></button>`;
}

const rotuloUmbral = (i, fmt) => `${monNombre(i.moneda)}, ${i.factor !== 1 ? 'cada 100 VN' : 'por unidad'} · hoy ${fmt(i.precio, i.moneda)}`;
const notaUmbral = i => i.rf ? 'Ojo: el día que un bono paga cupón o amortiza, el precio baja; una alerta de baja puede saltar por eso.' : '';

/* el mini-form de "+ Nueva alerta": un activo de la cartera con precio, sube/baja y el
   umbral precargado (5 % del precio de hoy) en la moneda y la unidad en que cotiza. Sin
   activos con precio, en su lugar explica qué falta. "Crear" es el submit del form (Enter
   en el precio lo toca) y lo agarra el mismo listener de clic, que cancela el envío */
function formPrecio(p, ctx, fmt) {
  const esc = ctx.esc, F = E.form, c = p.cart;
  const cerrar = '<button type="button" class="v3al-reint" data-ap="cancelar">Cerrar</button>';
  if (!c || c.fallo) {
    return `<div class="v3al-card"><div class="v3al-nada">No pudimos leer tu cartera, y la alerta se pone sobre un activo que tenés.
      <div class="v3al-acc"><button type="button" class="v3al-reint" data-al="reintentar">Reintentar</button>${cerrar}</div></div></div>`;
  }
  const ops = opciones(p);
  if (!ops.length) {
    const txt = c.porTk.size
      ? 'Tus activos todavía no tienen precio: cuando llegue, vas a poder ponerles una alerta.'
      : 'Primero cargá activos en Mi cartera: la alerta se pone sobre un activo que tenés, con el precio al que cotiza.';
    return `<div class="v3al-card"><div class="v3al-nada">${esc(txt)}
      <div class="v3al-acc"><a class="v3al-ir" href="#panel/micartera" data-go="micartera">Ir a Mi cartera →</a>${cerrar}</div></div></div>`;
  }
  const i = ops.find(o => o.tk === F.ticker) || ops[0];
  F.ticker = i.tk;
  const cond = F.cond === 'baja' ? 'baja' : 'sube';
  const val = F.umbral != null ? F.umbral : numIn(precargaUmbral(i.precio, cond));
  const seg = k => `<button type="button" class="v3al-sel${cond === k ? ' on' : ''}" aria-pressed="${cond === k}" data-ap="cond:${k}">${k === 'baja' ? 'Baja de' : 'Sube de'}</button>`;
  const nota = F.msg ? `<span class="msg" role="alert">${esc(F.msg)}</span>` : esc(notaUmbral(i));
  return `<div class="v3al-card"><form class="v3al-form" data-apform novalidate onsubmit="return false" aria-label="Nueva alerta de precio">
    <div><label for="v3al-f-tk">Activo</label>
      <select id="v3al-f-tk" data-apf="ticker">${ops.map(o =>
        `<option value="${esc(o.tk)}"${o.tk === i.tk ? ' selected' : ''}>${esc(tickerCorto(o.tk) + (o.nombre ? ' · ' + o.nombre : ''))}</option>`).join('')}</select></div>
    <div><span class="lab" id="v3al-f-cond">Avisame si</span>
      <div class="v3al-fil" role="group" aria-labelledby="v3al-f-cond">${seg('sube')}${seg('baja')}</div></div>
    <div><label for="v3al-f-u">Precio</label>
      <input id="v3al-f-u" type="text" inputmode="decimal" autocomplete="off" data-apf="umbral" value="${esc(val)}">
      <div class="u" data-apf-u>${esc(rotuloUmbral(i, fmt))}</div></div>
    <div class="acc">
      <button type="submit" class="v3al-btn pri" data-ap="crear"${F.creando ? ' disabled' : ''}>${F.creando ? 'Creando…' : 'Crear'}</button>
      <button type="button" class="v3al-btn sec" data-ap="cancelar">Cancelar</button>
      <span class="nota" data-apf-nota>${nota}</span>
    </div></form></div>`;
}

/* lo escrito en el mini-form pasa a E.form antes de cualquier repintado */
function capturarForm() {
  if (!E.form || !_el) return;
  const f = _el.querySelector('[data-apform]');
  if (!f) return;
  const s = f.querySelector('[data-apf="ticker"]'), i = f.querySelector('[data-apf="umbral"]');
  if (s && s.value) E.form.ticker = String(s.value);
  if (i) E.form.umbral = String(i.value);
}

/* cambiar de activo o de sube/baja toca el form EN SU LUGAR (sin repintar: el foco queda
   donde estaba, y con las flechas del <select> se puede recorrer la lista) y vuelve a
   proponer el umbral, como el "Avisarme si…" de Mi cartera */
function actualizarForm() {
  const f = _el && _el.querySelector('[data-apform]');
  const p = _ultimo && _ultimo.p;
  if (!E.form || !f || !p) { repintar(); return; }
  const i = opciones(p).find(o => o.tk === E.form.ticker);
  if (!i) { repintar(); return; }
  const cond = E.form.cond === 'baja' ? 'baja' : 'sube';
  f.querySelectorAll('[data-ap^="cond:"]').forEach(b => {
    const on = b.dataset.ap === 'cond:' + cond;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const inp = f.querySelector('[data-apf="umbral"]');
  if (inp && E.form.umbral == null) inp.value = numIn(precargaUmbral(i.precio, cond));
  const u = f.querySelector('[data-apf-u]');
  if (u) u.textContent = rotuloUmbral(i, fmtAl(_ctx));
  const n = f.querySelector('[data-apf-nota]');
  if (n) n.textContent = notaUmbral(i);
}

/* el <select> del mini-form (el único 'change' del módulo) */
function alCambio(ev) {
  if (!_ctx || ev.currentTarget !== _el || !E.form) return;
  const s = ev.target && ev.target.closest ? ev.target.closest('[data-apf="ticker"]') : null;
  if (!s || !_el.contains(s)) return;
  E.form.ticker = String(s.value || '');
  E.form.umbral = null; E.form.msg = '';
  actualizarForm();
}

/* al dibujar el segmento con disparadas sin ver: se marcan vistas (apaga la pastilla del
   lateral) y se repinta UNA vez. Sin bucle: una id ya marcada no se vuelve a marcar, y la
   relectura ya las trae vistas. Si falla, no se repinta y queda para el próximo dibujo */
async function marcarVistasPendientes(p, ctx, email) {
  if (_marcando || !p || p.noVerif) return;
  const clave = id => email + '/' + id;
  const ids = (p.alertas || []).filter(a => a.disparada != null && !a.vista && !_vistasMarcadas.has(clave(a.id))).map(a => String(a.id));
  if (!ids.length) return;
  ids.forEach(id => { _vistasMarcadas.add(clave(id)); _recien.add(id); });
  _marcando = true;
  let ok = false;
  try { await marcarVistas(email, ids); ok = true; }
  catch (e) { ids.forEach(id => { _vistasMarcadas.delete(clave(id)); _recien.delete(id); }); }
  finally { _marcando = false; }
  if (ok && ctx.S.email === email) { try { ctx.refrescar('alertas'); } catch (e) {} }
}

/* el error de crearAlerta() en palabras del usuario, con el criterio de motivoAlerta() de
   mi-cartera.js: los de alertas-precio.js ya vienen en voseo y pasan tal cual */
const ALERTA_EN_VOSEO = /^(Entrá a tu cuenta|Falta el ticker|Ese ticker no sirve|Elegí si te avisamos|Poné un precio|La alerta necesita la moneda|Ya tenés esa misma alerta)/;
function motivoCrear(e) {
  const t = String((e && e.message) || e || '');
  if ((e && e.code === 'permission-denied') || /^Firestore no dejó|permission[-_ ]denied|insufficient permissions/i.test(t))
    return 'No pudimos guardar la alerta: el servidor la rechazó. Recargá la página y probá de nuevo.';
  if (!(e && e.code) && ALERTA_EN_VOSEO.test(t)) return t;
  return 'No se pudo crear la alerta: probá de nuevo en un momento.';
}

/* ───────────────────────── interacción ───────────────────────── */
async function alClic(ev) {
  if (!_ctx || ev.currentTarget !== _el) return;
  const t = ev.target.closest('[data-al],[data-ap]');
  if (!t || !_el.contains(t)) return;
  // data-ap: lo del segmento "Tus alertas de precio"
  if (t.hasAttribute('data-ap')) { await alClicPrecio(ev, t, _ctx); return; }
  const s = String(t.dataset.al || ''), i = s.indexOf(':');
  const acc = i < 0 ? s : s.slice(0, i), val = i < 0 ? '' : s.slice(i + 1);
  const ctx = _ctx;

  if (acc === 'vista') {
    if (val !== 'carteras' && val !== 'precio') return;
    ev.preventDefault();
    if (E.vista !== val) { E.vista = val; E.form = null; _recien.clear(); }
    dibujar(false);
    return;
  }
  if (acc === 'filtro') {
    if (!FILTROS.some(x => x[0] === val)) return;
    ev.preventDefault();
    E.filtro = val;
    dibujar(false);
    return;
  }
  if (acc === 'reintentar') { ev.preventDefault(); dibujar(true); return; }
  // los links de adentro de una alerta (Ver cartera) navegan igual: no se les toca el clic
  if (acc === 'leer' && ev.target.closest('a')) return;
  if (!ctx.S.verificado || _ocupado) return;

  const d = _datos;
  if (!d || d.email !== ctx.S.email) return;

  if (acc === 'leer') {
    const a = d.alertas.find(x => String(x.id) === val);
    if (!a || leida(d, a)) return;
    await guardar(ctx, [val], { leida: true });
    return;
  }
  if (acc === 'hecha') {
    ev.preventDefault();
    const a = d.alertas.find(x => String(x.id) === val);
    if (!a) return;
    await guardar(ctx, [val], { hecha: !hecha(d, a), leida: true });
    return;
  }
  if (acc === 'leertodas') {
    ev.preventDefault();
    const ids = d.alertas.filter(x => !leida(d, x)).map(x => String(x.id));
    if (!ids.length) return;
    await guardar(ctx, ids, { leida: true });
  }
}

/* una sola puerta de escritura: guarda, avisa si falla y repinta la pestaña Y el
   contador del lateral (por eso va por ctx.refrescar y no por dibujar) */
async function guardar(ctx, ids, campos) {
  _ocupado = true;
  try {
    await marcar(ctx, ids, campos);
    ctx.refrescar('alertas');
  } catch (e) {
    try { ctx.toast('No se pudo guardar (' + String((e && (e.code || e.message)) || e).slice(0, 40) + ')'); } catch (x) {}
  } finally {
    _ocupado = false;
  }
}

/* "Tus alertas de precio": ver, nueva, sube/baja, cancelar, crear, pausar, reanudar,
   borrar y limpiar. Lo que escribe pasa SOLO por alertas-precio.js y con _ocupado */
const confirmar = txt => { try { return window.confirm(txt); } catch (e) { return false; } };

async function alClicPrecio(ev, t, ctx) {
  // lo primero, antes de cualquier await: "Crear" es el submit del mini-form y un Enter
  // en el precio lo clickea; sin esto el form se enviaría y recargaría la página
  ev.preventDefault();
  if (E.vista !== 'precio') return;
  const s = String(t.dataset.ap || ''), i = s.indexOf(':');
  const acc = i < 0 ? s : s.slice(0, i), val = i < 0 ? '' : s.slice(i + 1);
  const email = ctx.S.email;

  if (acc === 'ver') { if (val) ctx.verPosicion(val); return; }
  if (acc === 'nueva') {
    if (E.form) { E.form = null; repintar('[data-ap="nueva"]'); }
    else { E.form = { ticker: null, cond: 'sube', umbral: null, msg: '', creando: false }; repintar('[data-apf="umbral"]'); }
    return;
  }
  if (acc === 'cancelar') { E.form = null; repintar('[data-ap="nueva"]'); return; }
  if (acc === 'cond') {
    if (!E.form || (val !== 'sube' && val !== 'baja')) return;
    capturarForm();
    E.form.cond = val; E.form.umbral = null; E.form.msg = '';
    actualizarForm();
    return;
  }

  if (!ctx.S.verificado || _ocupado) return;
  if (acc === 'crear') { await crearDesdeForm(ctx); return; }

  const p = _ultimo && _ultimo.email === email ? _ultimo.p : null;
  if (!p || p.noVerif) return;
  const lista = p.alertas || [];
  const a = lista.find(x => String(x.id) === val);
  if (acc === 'pausar' || acc === 'reanudar') {
    if (!a) return;
    const tk = tickerCorto(a.ticker);
    await escribirPrecio(ctx, () => pausar(email, val, acc === 'reanudar'),
      acc === 'pausar' ? `Alerta de ${tk} pausada.` : `Alerta de ${tk} reanudada.`);
    return;
  }
  if (acc === 'borrar') {
    if (!a) return;
    if (!confirmar(`¿Borrar la alerta de ${tickerCorto(a.ticker)} (${textoAlerta(a, fmtAl(ctx))})?`)) return;
    await escribirPrecio(ctx, () => borrar(email, val), 'Alerta borrada.');
    return;
  }
  if (acc === 'limpiar') {
    const ids = lista.filter(x => x.disparada != null).map(x => String(x.id));
    const n = ids.length;
    if (!n) return;
    if (!confirmar(n === 1
      ? '¿Borrar el historial? Se borra la alerta que ya saltó. Las activas quedan.'
      : `¿Borrar el historial? Se borran las ${n} alertas que ya saltaron. Las activas quedan.`)) return;
    await escribirPrecio(ctx, () => limpiarHistorial(email, ids), 'Listo: el historial quedó vacío.');
  }
}

/* pausar, reanudar, borrar y limpiar: escribe, avisa y repinta la pestaña Y la pastilla
   del lateral (ctx.refrescar), también si falló: lo que muestra tiene que ser lo que hay */
async function escribirPrecio(ctx, fn, okTxt) {
  const email = ctx.S.email;
  _ocupado = true;
  let txt = okTxt;
  try { await fn(); }
  catch (e) {
    const m = String((e && e.message) || '');
    // los de alertas-precio.js ya vienen en voseo ("Esa alerta ya saltó…", "Firestore no dejó…")
    txt = /^(Esa alerta ya saltó|Firestore no dejó)/.test(m) ? m
      : 'No se pudo guardar (' + String((e && (e.code || e.message)) || e).slice(0, 40) + ')';
  } finally { _ocupado = false; }
  if (ctx.S.email !== email) return;
  try { ctx.toast(txt); } catch (x) {}
  try { ctx.refrescar('alertas'); } catch (x) {}
}

/* "Crear": el activo y el umbral salen de lo que está en pantalla; la moneda, del precio
   de ese activo (en la que cotiza, nunca convertida). crearAlerta() valida y rechaza el
   duplicado; el error queda escrito en el form */
async function crearDesdeForm(ctx) {
  const email = ctx.S.email;
  const p = _ultimo && _ultimo.email === email ? _ultimo.p : null;
  if (!E.form || !p) return;
  capturarForm();
  const F = E.form;
  const i = opciones(p).find(o => o.tk === F.ticker);
  if (!i) { F.msg = 'Elegí un activo de tu cartera que tenga precio.'; repintar(); return; }
  const cond = F.cond === 'baja' ? 'baja' : 'sube';
  const umbral = F.umbral != null ? F.umbral : precargaUmbral(i.precio, cond);
  const campos = { ticker: i.orig, condicion: cond, umbral, moneda: i.moneda };
  // el número se lee con el MISMO criterio que crearAlerta() (validarAlerta): "4.735",
  // "4735,5" y "1.900,50" valen lo mismo acá y en la fila de Mi cartera
  const v = validarAlerta(campos);
  if (!v.ok) { F.msg = v.error; repintar('[data-apf="umbral"]'); return; }
  // del lado equivocado del precio de hoy saltaría en el próximo refresco: la fila de Mi
  // cartera (crearAlertaDesde) la frena con el mismo texto, y acá también
  const fmt = fmtAl(ctx), u = v.datos.umbral;
  if (cond === 'sube' ? u <= i.precio : u >= i.precio) {
    F.msg = `Hoy está en ${fmt(i.precio, i.moneda)}: con «${cond === 'sube' ? 'Sube de' : 'Baja de'}» ese precio la alerta saltaría enseguida. `
      + (cond === 'sube' ? 'Poné uno más alto o elegí «Baja de».' : 'Poné uno más bajo o elegí «Sube de».');
    repintar('[data-apf="umbral"]');
    return;
  }
  _ocupado = true; F.creando = true; F.msg = '';
  repintar();
  let hecha = null, msg = '';
  try { hecha = await crearAlerta(email, campos); }
  catch (e) { msg = motivoCrear(e); }
  finally { _ocupado = false; F.creando = false; }
  if (ctx.S.email !== email) return;
  if (hecha) {
    if (E.form === F) E.form = null;
    try { ctx.toast(`Alerta creada: ${tickerCorto(hecha.ticker)} · ${textoAlerta(hecha, fmt)}${i.factor !== 1 ? ' cada 100 VN' : ''}`); } catch (x) {}
    ctx.refrescar('alertas');
    return;
  }
  if (E.form !== F) return;   // la cerró mientras se guardaba
  F.msg = msg;
  repintar('[data-apf="umbral"]');
}
