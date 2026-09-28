// panel.js — el panel del inversor de valtia.tech.
// Panel v3 (handoff de Lauti, 21/09/2026): un lateral en tres grupos —Tus
// inversiones, Para decidir, Mercado— y un solo encabezado por pestaña con el
// selector de moneda. El Fondo NO aparece en el panel del inversor: la gestión
// del fondo (fondo-live.js) es otro modo del lateral y solo lo ve el admin.
// Mi cartera vive en mi-cartera.js; acá se reutilizan su cálculo y sus tipos.
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { calcular, agruparPorBroker, agruparPorActivo, normalizarTicker, reiniciarMiCartera, completarPreciosDeRentaFija }
  from './mi-cartera.js?v=46';
import { fxMercado, registrarImplicito, etiquetaFx } from './fx.js?v=1';
import { resumenVentas, cantidadAjuste } from './ventas.js?v=6';
import { EMPRESAS } from './empresas.js?v=3';
import { renderResumen } from './panel-resumen.js?v=9';
import { renderComprar as renderComprarV3 } from './panel-comprar.js?v=2';
import { renderCarteras as renderCarterasV3 } from './panel-carteras.js?v=3';
import { renderMensual } from './panel-mensual.js?v=2';
import { renderAlertas, contarNoLeidas } from './panel-alertas.js?v=3';
// alertas de precio por activo (la única puerta a inversores/{email}/alertasPrecio): el
// panel las evalúa con los precios que lee y cuenta las que saltaron para la pastilla
import { instalarEvaluacion, evaluarConPrecios, contarDisparadasNoVistas, fraseDisparo, fmtPrecio } from './alertas-precio.js?v=1';
import { renderAgenda } from './panel-agenda.js?v=2';
import { renderCuenta } from './panel-cuenta.js?v=4';
import { renderOperar } from './panel-operar.js?v=6';
// la lista de espera PRO (waitlistPro): solo el admin la ve y solo a él se le cuenta la pastilla
import { renderEspera, contarSinContactar } from './panel-espera.js?v=1';
import { eventos } from './panel-eventos.js?v=1';
import { renderMovimientos } from './panel-movimientos.js?v=2';
import { base, radarSym, tickerFicha, esRentaFija, especieBono, parBono, linkDe, nombreDe, desglose, mergeRadar }
  from './activos.js?v=7';
// un solo criterio de "qué tipo de activo es" para Mi cartera, el Resumen y Movimientos
import { tipoActivo, GRUPOS_TIPO } from './tipos-activo.js?v=1';

/* ───────────────────────── estilos ───────────────────────── */
// Valores del prototipo «Valtia Panel v3» del zip completo (24/09/2026) con la
// paleta vigente del SPEC §0: IBM Plex Sans en todo (Playfair solo en el logo),
// números con cifras tabulares y sin Plex Mono, fondo blanco, botones y
// selectores con borde dorado sutil y radio 8, tarjetas de 10-12 px, etiquetas
// de 6 px, y el dorado claro #E8CE96 solo sobre azul.
const CSS = `
body.fl-app-on nav:not(.portal-nav){display:none!important}
body.fl-app-on #vnav-hot,body.fl-app-on #vnav-menu,body.fl-app-on #vnav-back{display:none!important}
/* SPEC §0: los números alinean (cifras tabulares) en todo el panel. sitio.css lo
   hace en el resto del sitio y deja afuera al panel, que se ocupa acá. El
   !important es por lo mismo que allá: el atajo font: de cada regla vuelve
   font-variant-numeric a normal */
body.fl-app-on,body.fl-app-on *{font-variant-numeric:tabular-nums!important}
body.fl-app-on{background:var(--v3-bg)}
/* Colores del prototipo como variables: los módulos de cada pestaña usan ESTO y
   no hex sueltos, así el tema oscuro sigue funcionando.
   --v3-navy es el azul de los bloques sólidos (con texto claro encima);
   --v3-serie es la línea de "tu cartera" (azul en claro, dorado en oscuro);
   --v3-sel* son los botones y selectores de la regla §0 (borde dorado sutil; el
   activo con borde dorado y relleno crema); --v3-skel, el gris cálido de los
   esqueletos de carga (SPEC «Estados»: #F0EDE5). */
body.fl-app-on{--v3-bg:#fff;--v3-card:#fff;--v3-line:#E7E3DA;--v3-line2:#F2EFE8;--v3-track:#F0EDE5;--v3-track2:#F6F3EC;
  --v3-ink:#101010;--v3-sub:#57534A;--v3-mut:#8B8375;--v3-navy:#14213D;--v3-serie:#14213D;--v3-area:rgba(20,33,61,.07);
  --v3-gold:#B08A3E;--v3-gold2:#8A6A2F;--v3-goldL:#E8CE96;--v3-goldS:#D9BE85;--v3-goldBg:rgba(176,138,62,.14);--v3-goldTint:rgba(176,138,62,.07);
  --v3-up:#1F7A4D;--v3-upBg:rgba(31,122,77,.12);--v3-dn:#B23A3A;--v3-dnBg:rgba(178,58,58,.12);
  --v3-warn:#B7791F;--v3-warnBg:rgba(183,121,31,.1);--v3-bench:#8A9BAD;--v3-cero:#C9C3B6;--v3-azul:#2B5FB0;
  --v3-hover:#F6F7F9;--v3-hl:#FDFBF4;--v3-navyBg:rgba(20,33,61,.08);--v3-neutro:rgba(139,131,117,.12);
  --v3-btn:#14213D;--v3-btnHover:#0E1830;--v3-btnTx:#fff;--v3-ico:#ECEEF1;--v3-icoTx:#14213D;
  --v3-sel:rgba(176,138,62,.4);--v3-selOn:#B08A3E;--v3-selBg:#fff;--v3-selOnBg:#FBF5E8;--v3-selTx:#57534A;--v3-selOnTx:#101010;
  --v3-skel:#F0EDE5;--v3-input:#fff;--v3-focus:#14213D;
  /* el CSS viejo que usa --bg3/--bg2 de la home (crema): SOLO en el panel pasan a gris neutro */
  --bg3:#F3F4F6;--bg2:#F3F4F6}
[data-theme="dark"] body.fl-app-on{--v3-bg:#0B1327;--v3-card:#121E3A;--v3-line:rgba(255,255,255,.12);--v3-line2:rgba(255,255,255,.07);
  --v3-track:rgba(255,255,255,.08);--v3-track2:rgba(255,255,255,.05);--v3-ink:#F4F1EA;--v3-sub:rgba(244,241,234,.74);--v3-mut:rgba(244,241,234,.58);
  --v3-navy:#15254A;--v3-serie:#E8CE96;--v3-area:rgba(232,206,150,.08);--v3-gold:#D9BE85;--v3-gold2:#E8CE96;--v3-goldL:#E8CE96;--v3-goldS:#B08A3E;
  --v3-goldBg:rgba(232,206,150,.14);--v3-goldTint:rgba(232,206,150,.08);--v3-up:#5FCB8E;--v3-upBg:rgba(95,203,142,.14);--v3-dn:#F08A8A;
  --v3-dnBg:rgba(240,138,138,.14);--v3-warn:#E0A93E;--v3-warnBg:rgba(224,169,62,.14);--v3-bench:#9FB0C2;--v3-cero:rgba(244,241,234,.3);
  --v3-hover:rgba(255,255,255,.04);--v3-hl:rgba(255,255,255,.04);--v3-navyBg:rgba(232,206,150,.1);--v3-neutro:rgba(244,241,234,.1);--v3-azul:#8FB3E8;
  --v3-btn:#F4F1EA;--v3-btnHover:#fff;--v3-btnTx:#0E1830;--v3-ico:rgba(255,255,255,.1);--v3-icoTx:#F4F1EA;
  --v3-sel:rgba(232,206,150,.3);--v3-selOn:#D9BE85;--v3-selBg:transparent;--v3-selOnBg:rgba(232,206,150,.12);--v3-selTx:rgba(244,241,234,.74);--v3-selOnTx:#F4F1EA;
  --v3-skel:rgba(255,255,255,.07);--v3-input:rgba(255,255,255,.04);--v3-focus:#D9BE85;
  /* el bloque claro de arriba aplica también en oscuro (no está acotado por tema):
     sin pisar --bg2 acá, en oscuro quedaba el gris claro del bloque claro */
  --bg3:rgba(255,255,255,.05);--bg2:#0B1327}
body.fl-app-on #portal-view{padding:0!important;margin:0!important}
.fl-layout{display:flex;align-items:stretch;gap:0;min-height:100vh;background:var(--v3-bg)}
/* ── lateral: 232 px, navy, pegado arriba y de alto completo ── */
.fl-layout .portal-nav{display:flex;flex-direction:column;align-items:stretch;width:232px;flex:none;box-sizing:border-box;
  height:100vh!important;gap:0!important;border:none!important;background:#14213D!important;border-radius:0;
  padding:18px 12px 14px!important;position:sticky;top:0;align-self:flex-start;max-height:100vh;overflow:auto;scrollbar-width:none}
.fl-layout .portal-nav::-webkit-scrollbar{display:none}
.fl-layout .portal-nav a[data-tab]{display:flex!important;align-items:center;justify-content:space-between;gap:8px;
  padding:10px 12px!important;margin:0 0 2px!important;border-radius:8px;border-left:2px solid transparent;border-bottom:none!important;
  color:rgba(255,255,255,.62)!important;font:500 11px 'IBM Plex Sans',sans-serif!important;letter-spacing:.1em!important;
  text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:background .15s,color .15s}
.fl-layout .portal-nav a[data-tab]:hover{background:rgba(255,255,255,.06);color:#fff!important}
.fl-layout .portal-nav a[data-tab].active{background:rgba(176,138,62,.18);color:#E8CE96!important;border-left-color:#B08A3E;font-weight:600!important}
.fl-layout .portal-nav a:focus-visible,.fl-layout .portal-nav button:focus-visible{outline:2px solid #E8CE96;outline-offset:1px}
/* título de grupo (el prototipo lo pone en 8,5 px: sube a 10,5, el mínimo de etiquetas del SPEC §0) */
.vp-grp{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.35);padding:14px 12px 6px}
/* la pastilla de cada pestaña: cuánto hay detrás */
.fl-layout .portal-nav a .vp-n{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:0;color:#E8CE96;background:rgba(232,206,150,.16);
  padding:2px 6px;border-radius:6px;flex:none;text-transform:none}
.fl-layout .portal-nav a.active .vp-n{color:#14213D;background:#E8CE96}
/* el logo: cuadrado con borde dorado y VALTIA en Playfair con la T dorada, sin itálica */
.fl-sbbrand{display:flex;align-items:center;gap:10px;padding:2px 10px 18px}
.fl-sbbrand .lg{width:30px;height:30px;box-sizing:border-box;border:1.5px solid #B08A3E;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none}
.fl-sbbrand .lg svg{display:block}
.fl-sbbrand .nm{font:700 22px 'Playfair Display',Georgia,serif;letter-spacing:.06em;color:#fff;line-height:1}
.fl-sbbrand .nm span{color:#E8CE96;font-style:normal}
.fl-sbbrand .sb{font:500 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-top:3px}
/* pie del lateral: nombre, plan, Mi cuenta y los links de salida */
.vp-foot{margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:2px}
.fl-layout .portal-nav #portal-user-name{display:block;color:rgba(255,255,255,.85);font:600 12.5px 'IBM Plex Sans',sans-serif;
  padding:6px 12px 2px;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vp-plan-w{padding:0 12px 8px}
.vp-plan{display:inline-block;max-width:100%;box-sizing:border-box;font:600 10.5px/1.4 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;
  color:#E8CE96;background:transparent;border:1px solid rgba(232,206,150,.45);border-radius:6px;padding:3px 7px}
.vp-plan.pro{background:#B08A3E;color:#14213D;border-color:#B08A3E}
.fl-layout .portal-nav a.vp-lat-l{display:block!important;padding:5px 12px!important;margin:0!important;border:none!important;border-radius:0;
  font:500 12px 'IBM Plex Sans',sans-serif!important;letter-spacing:0!important;text-transform:none;color:rgba(255,255,255,.5)!important;
  text-decoration:none;transition:color .15s}
.fl-layout .portal-nav a.vp-lat-l:hover{color:#fff!important}
.fl-layout .portal-nav a.vp-lat-l.on,.fl-layout .portal-nav a.vp-lat-l.vp-lat-ges{color:#E8CE96!important}
.fl-layout .portal-nav a.vp-lat-l.vp-lat-ges:hover{color:#fff!important}
.fl-layout .portal-nav .vp-foot button{color:#B08A3E!important;text-align:left;padding:5px 12px 2px!important;font:600 11.5px 'IBM Plex Sans',sans-serif!important;
  letter-spacing:.12em!important;background:none;border:none;cursor:pointer;text-transform:uppercase}
.fl-layout .portal-nav .vp-foot button:hover{color:#E8CE96!important}
/* dos modos del lateral: el del inversor y (solo admin) la gestión del fondo. Nunca los dos
   juntos. Van DESPUÉS de las reglas de los links y con su misma especificidad: si no, el
   display:flex de a[data-tab] les gana y se ven las dos listas a la vez */
.fl-layout .portal-nav a[data-m="ges"],.fl-layout .portal-nav div[data-m="ges"]{display:none!important}
.fl-layout .portal-nav.modo-ges a[data-m="inv"],.fl-layout .portal-nav.modo-ges div[data-m="inv"]{display:none!important}
.fl-layout .portal-nav.modo-ges a[data-m="ges"]{display:flex!important}
.fl-layout .portal-nav.modo-ges a.vp-lat-l[data-m="ges"]{display:block!important}
.fl-layout .portal-nav.modo-ges div[data-m="ges"]{display:block!important}
.fl-layout .portal-nav.modo-ges{background:#0B1327!important}
/* ── columna principal: barra de cotizaciones, barra del celular, encabezado y contenido ── */
.fl-main{flex:1;min-width:0;display:flex;flex-direction:column}
/* la barra de cotizaciones (#valtia-cot, cotizaciones.js + sitio.css) va arriba del
   contenido, a la derecha del lateral: panel.js la muda acá al abrir el panel */
.fl-main > #valtia-cot{flex:none;width:100%}
/* un encabezado por pestaña: blanco, pegado arriba, con borde abajo */
.vp-enc{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:22px 30px 16px;
  border-bottom:1px solid var(--v3-line);background:var(--v3-bg);position:sticky;top:0;z-index:60}
/* la izquierda cede ancho y la derecha no: el selector de moneda se queda en su lugar
   y, si la línea de fecha y frescura no entra, baja a un segundo renglón (no se
   corta: dice de cuándo son los precios) */
.vp-enc .izq{flex:1 1 360px;min-width:0;max-width:100%}
/* título de página (SPEC §0): IBM Plex Sans 700 28 px, negro sobre blanco */
.vp-enc h1{font:700 28px/1.1 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:-.01em;color:var(--v3-ink);margin:0}
.vp-enc .sub{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin-top:6px;min-width:0}
.vp-enc .sub .txt{font:500 12px/1.5 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);
  min-width:0;overflow-wrap:anywhere}
/* cartelito de mercado abierto/cerrado */
.vp-mkt{display:inline-flex;align-items:center;gap:6px;flex:none;font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;
  text-transform:uppercase;padding:3px 8px;border-radius:6px;line-height:1.5;white-space:nowrap}
.vp-mkt i{width:6px;height:6px;border-radius:50%;background:currentColor;display:block;flex:none}
.vp-mkt em{font-style:normal;opacity:.85}
.vp-mkt.on{color:var(--v3-up);background:var(--v3-upBg)}
.vp-mkt.off{color:var(--v3-mut);background:var(--v3-neutro)}
.vp-enc .der{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 1 auto;max-width:100%}
.vp-enc .der:empty{display:none}
.vp-enc-volver{display:inline-block;font:600 12px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-sub);text-decoration:none;margin-bottom:8px}
.vp-enc-volver:hover{color:var(--v3-gold2)}
/* botones y selectores (SPEC §0): borde dorado sutil, radio 8, texto gris; el activo
   con borde dorado, relleno crema y texto negro */
.vp-seg{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
.vp-seg button{font:500 12px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;cursor:pointer;color:var(--v3-selTx);
  background:var(--v3-selBg);border:1px solid var(--v3-sel);border-radius:8px;white-space:nowrap;transition:color .15s,border-color .15s,background .15s}
.vp-seg button:hover{color:var(--v3-selOnTx)}
.vp-seg button.on{color:var(--v3-selOnTx);border-color:var(--v3-selOn);background:var(--v3-selOnBg)}
/* el de moneda del encabezado, más grande (SPEC «Selector de moneda»: 14 px 600, 10 px 18 px) */
.vp-seg.mon button{font:600 14px 'IBM Plex Sans',sans-serif;letter-spacing:.04em;padding:10px 18px}
.vp-seg button:focus-visible,.vp-agregar:focus-visible,.vp-btn:focus-visible{outline:2px solid var(--v3-focus);outline-offset:2px}
.vp-agregar{font:600 12px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-btnTx);background:var(--v3-btn);
  padding:11px 16px;border-radius:8px;white-space:nowrap;border:1px solid var(--v3-btn);cursor:pointer;transition:background .15s,border-color .15s}
.vp-agregar:hover{background:var(--v3-btnHover);border-color:var(--v3-btnHover)}
.fl-layout .portal-content > [id^="tab-"]{scroll-margin-top:160px}
.fl-layout .portal-content{flex:1;min-width:0;padding:24px 34px 60px!important;box-sizing:border-box;width:100%;font-family:'IBM Plex Sans',system-ui,sans-serif}
/* ── celular (<920 px): el lateral se esconde y queda una barra azul fija arriba con
   todas las pestañas deslizables (más Mi cuenta y los links de salida) ── */
.vp-mbar{display:none;position:sticky;top:0;z-index:70;height:44px;box-sizing:border-box;align-items:center;gap:4px;padding:0 10px;
  background:#14213D;overflow-x:auto;overflow-y:hidden;white-space:nowrap;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.vp-mbar::-webkit-scrollbar{display:none}
.vp-mbrand{flex:none;font:700 15.5px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;color:#fff;padding-right:8px}
.vp-mbrand span{color:#E8CE96;font-style:normal}
.vp-mbar a,.vp-mbar button{flex:none;font:500 13.5px 'IBM Plex Sans',sans-serif;color:rgba(255,255,255,.75);padding:6px 10px;border-radius:6px;
  background:transparent;border:0;cursor:pointer;text-decoration:none;white-space:nowrap}
.vp-mbar a:focus-visible,.vp-mbar button:focus-visible{outline:2px solid #E8CE96;outline-offset:-2px}
.vp-mbar a.on{color:#14213D;background:#E8CE96}
.vp-mbar a .vp-n{font:600 10.5px 'IBM Plex Sans',sans-serif;margin-left:5px;color:#E8CE96}
.vp-mbar a.on .vp-n{color:#14213D}
.vp-mbar .vp-mx{color:rgba(255,255,255,.5);font-size:12.5px}
.vp-mbar .vp-mx.ges{color:#E8CE96}
.vp-mbar .vp-msalir{color:#B08A3E;font:600 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase}
.vp-msep{flex:none;width:1px;height:20px;background:rgba(255,255,255,.15);margin:0 4px}
.vp-mbar [data-m="ges"]{display:none}
.vp-mbar.modo-ges [data-m="inv"]{display:none}
.vp-mbar.modo-ges [data-m="ges"]{display:inline-block}
@media (max-width:920px){
  .fl-layout{flex-direction:column;min-height:0}
  .fl-layout .portal-nav{display:none!important}
  .vp-mbar{display:flex}
  /* el encabezado no queda pegado en el celular: con la barra azul fija ya se va
     un buen pedazo de pantalla */
  .vp-enc{position:static;padding:14px 16px 12px}
  .vp-enc h1{font-size:24px}
  .fl-layout .portal-content{padding:16px 14px 50px!important}
}
/* ── piezas compartidas por las pestañas ── */
.vp-sub{color:var(--v3-sub);font-size:14px;line-height:1.7;max-width:720px;margin:0 0 20px}
.vp-sec{display:flex;align-items:baseline;gap:12px;font:600 17px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);margin:32px 0 14px;line-height:1.2}
.vp-sec:first-child{margin-top:0}
.vp-sec::after{content:'';flex:1;height:1px;background:var(--v3-line);align-self:center;min-width:20px}
.vp-sec small{font:400 12.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut)}
/* cargando (SPEC «Estados»): esqueletos en #F0EDE5 con la altura de lo que viene.
   .vp-cargando convierte en esqueleto el "Cargando…" de las pestañas que todavía
   lo escriben como texto; el texto queda para los lectores de pantalla */
.vp-skel{display:block;background:var(--v3-skel);border-radius:12px;animation:vp-pulso 1.4s ease-in-out infinite}
.vp-skel + .vp-skel,.vp-skel + .vp-skel-fila{margin-top:12px}
.vp-skel-fila{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:12px;margin-bottom:14px}
.vp-skel-fila .vp-skel + .vp-skel{margin-top:0}
.vp-cargando{display:block;min-height:120px;margin:0;border-radius:12px;background:var(--v3-skel);color:transparent!important;
  overflow:hidden;user-select:none;animation:vp-pulso 1.4s ease-in-out infinite}
@keyframes vp-pulso{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.vp-skel,.vp-cargando{animation:none}}
.vp-nota{font-size:13px;color:var(--v3-mut);line-height:1.7;margin-top:10px;max-width:760px}
.vp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:14px}
.vp-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:18px 20px;position:relative;box-shadow:none}
.vp-card h4{font:600 16px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);margin:0 0 7px;line-height:1.3}
.vp-card p{font-size:14px;color:var(--v3-sub);line-height:1.6;margin:0}
.vp-card .l{font:600 11px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut)}
a.vp-ir,.vp-card a.vp-ir{display:inline-block;margin-top:10px;font:600 11.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-gold);text-decoration:none}
a.vp-ir:hover{color:var(--v3-gold2)}
/* etiquetas (6 px): veredicto, zona de compra, "la tenés", plan */
.vp-tag{font:700 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:6px;white-space:nowrap;display:inline-block}
.vp-tag.infra{color:var(--v3-up);background:var(--v3-upBg)}.vp-tag.precio{color:var(--v3-gold2);background:var(--v3-goldBg)}
.vp-tag.cara{color:var(--v3-dn);background:var(--v3-dnBg)}.vp-tag.sin{color:var(--v3-mut);background:var(--v3-neutro)}
.vp-tag.zona{color:var(--v3-gold2);background:transparent;border:1px solid var(--v3-gold)}.vp-tag.tengo{color:var(--v3-sub);background:transparent;border:1px solid var(--v3-line)}
.vp-tag.pro{color:var(--v3-gold2);border:1px solid var(--v3-gold)}.vp-tag.gratis{color:var(--v3-up);border:1px solid var(--v3-up)}
.vp-tag.warn{color:var(--v3-warn);background:var(--v3-warnBg)}
/* tablas: las del prototipo (encabezado 11 px en mayúsculas, filas de 14 px) */
.vp-tblwrap{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow-x:auto;position:relative}
.vp-tbl{width:100%;border-collapse:collapse;font-size:14px;min-width:640px}
.vp-tbl th{font:700 11px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);padding:12px 14px 10px;border-bottom:1px solid var(--v3-line);text-align:right;white-space:nowrap}
.vp-tbl th.l,.vp-tbl td.l{text-align:left}
.vp-tbl td{padding:12px 14px;border-bottom:1px solid var(--v3-line2);color:var(--v3-ink);text-align:right;font:500 14px 'IBM Plex Sans',system-ui,sans-serif;white-space:nowrap}
.vp-tbl td.l{font:400 14px 'IBM Plex Sans',system-ui,sans-serif}
.vp-tbl tbody tr:hover td{background:var(--v3-hover)}
.vp-tbl tr:last-child td{border-bottom:none}
.vp-tbl .tk{font:700 14px 'IBM Plex Sans',sans-serif;color:var(--v3-gold);text-decoration:none}
.vp-tbl .nm{display:block;font:400 12.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut);white-space:normal}
/* botones: el primario es navy lleno (radio 8); el secundario, el de la regla §0 */
.vp-btn{font:600 12px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-btnTx);
  background:var(--v3-btn);border:1px solid var(--v3-btn);border-radius:8px;padding:10px 18px;cursor:pointer;text-decoration:none;display:inline-block;
  transition:background .15s,border-color .15s,color .15s}
.vp-btn:hover{background:var(--v3-btnHover);border-color:var(--v3-btnHover)}
.vp-btn.sec{background:var(--v3-selBg);color:var(--v3-selTx);border-color:var(--v3-sel)}
.vp-btn.sec:hover{color:var(--v3-selOnTx);border-color:var(--v3-selOn);background:var(--v3-selBg)}
.vp-btn.mini{padding:7px 12px;font-size:11.5px}
.vp-btn[disabled]{opacity:.45;cursor:default}
/* "La compré": formulario en línea */
.vp-form{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:8px;padding:12px;border:1px dashed var(--v3-line);border-radius:10px;text-align:left}
.vp-form label{display:block;font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-sub);margin-bottom:4px}
.vp-form input,.vp-form select{padding:8px 10px;background:var(--v3-input);border:1px solid var(--v3-line);border-radius:8px;color:var(--v3-ink);
  font:500 14px 'IBM Plex Sans',system-ui,sans-serif;outline:none;min-width:90px}
.vp-form input:focus,.vp-form select:focus{border-color:var(--v3-focus)}
.vp-msg{font-size:13px;margin-top:8px}
.vp-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:calc(100vw - 32px);box-sizing:border-box;background:#14213D;color:#fff;
  border:1px solid rgba(232,206,150,.35);border-radius:10px;padding:11px 18px;font:500 14px 'IBM Plex Sans',sans-serif;z-index:999;box-shadow:0 12px 32px rgba(14,24,48,.28)}
/* bienvenida: el modal del prototipo (velo navy con desenfoque, caja de radio 14) */
.vp-bv{position:fixed;inset:0;z-index:1000;background:rgba(14,24,48,.42);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
  display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto}
.vp-bv-caja{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:14px;max-width:560px;width:100%;box-sizing:border-box;padding:26px 26px 22px;
  box-shadow:0 24px 60px rgba(14,24,48,.25);margin:auto}
.vp-bv-caja .k{font:600 11px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-gold2)}
.vp-bv-caja h3{font:600 22px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);margin:8px 0 10px;line-height:1.2}
.vp-bv-caja p{font-size:14px;color:var(--v3-sub);line-height:1.65;margin:0 0 14px}
.vp-bv-caja ul{list-style:none;padding:0;margin:0 0 16px}
.vp-bv-caja li{font-size:14px;color:var(--v3-sub);line-height:1.6;padding:10px 0;border-top:1px solid var(--v3-line2);display:flex;gap:11px;align-items:flex-start}
.vp-bv-caja li b{color:var(--v3-ink);font-weight:600}
.vp-bv-caja li i{flex-shrink:0;font:700 11.5px 'IBM Plex Sans',sans-serif;font-style:normal;color:var(--v3-gold);letter-spacing:.06em;min-width:18px;padding-top:2px}
.vp-bv-legal{font-size:13px;color:var(--v3-mut);line-height:1.65;border-top:1px solid var(--v3-line2);padding-top:12px;margin-bottom:16px}
.vp-bv-legal a{color:var(--v3-gold);text-decoration:none}
.vp-bv-pie{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
@media(max-width:560px){.vp-bv-caja{padding:22px 20px 18px}}
/* verde y rojo SOLO para subas y bajas */
.vp-pos{color:var(--v3-up)}.vp-neg{color:var(--v3-dn)}.vp-mut{color:var(--v3-mut)}
`;

/* ───────────────────────── estado y utilidades ───────────────────────── */
// frescura: el texto del encabezado (sale del precio más VIEJO); ultimoPrecioMs:
// el sello del precio más NUEVO, que es de donde sale el cartel de mercado
// abierto/cerrado. Por qué son dos, en sellosPrecios()
const S = { user: null, isAdmin: false, data: {}, email: '', verificado: false, cliente: false, pro: false, plan: 'gratis',
  frescura: '', ultimoPrecioMs: null };
const db = () => getFirestore(getApp());
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const enDias = iso => Math.round((Date.parse(String(iso).slice(0, 10)) - Date.parse(hoyAR())) / 86400e3);
const fmtF = iso => { const s = String(iso || '').slice(0, 10); const [a, m, d] = s.split('-'); return d && m ? `${d}/${m}${a ? '/' + a.slice(2) : ''}` : s; };
const money = (n, cur) => (Number(n) < 0 ? '−' : '') + (cur === 'ARS' ? '$' : 'US$') +
  Math.abs(Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: Math.abs(n) < 1000 ? 2 : 0 });
const moneyS = (n, cur) => (Number(n) >= 0 ? '+' : '') + money(n, cur);
const pct = (n, d = 1) => n == null || !isFinite(n) ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(d).replace('.', ',') + '%';
const num = (n, d = 1) => n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d });
const cls = n => n == null ? 'vp-mut' : n >= 0 ? 'vp-pos' : 'vp-neg';
const verCls = v => v === 'Infravalorada' ? 'infra' : v === 'En precio' ? 'precio' : v === 'Estirada' ? 'cara' : 'sin';
const curVista = () => { try { return localStorage.getItem('valtia-mc-cur') || 'ARS'; } catch (e) { return 'ARS'; } };
const curEtq = c => c === 'ARS' ? 'ARS' : c === 'CCL' ? 'USD CCL' : 'USD MEP';
const curMoneda = c => c === 'ARS' ? 'ARS' : 'USD';
const BROKERS = ['IOL', 'PPI', 'Balanz', 'Bull Market', 'Cocos', 'Binance', 'Lemon', 'Belo', 'Otro'];
const brokerPref = () => { try { return localStorage.getItem('valtia-mc-broker') || ''; } catch (e) { return ''; } };

function toast(msg) {
  const d = document.createElement('div'); d.className = 'vp-toast'; d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), 3200);
}

/* ───────────────────────── datos (con caché) ───────────────────────── */
/* La caché es POR CUENTA. El logout NO recarga la página (index.html solo hace
   signOut), así que este módulo sobrevive al cambio de usuario: una entrada
   vieja servida a la cuenta siguiente le mostraría la cartera de otro. Cada
   entrada se guarda con el mail de su dueño y NUNCA se sirve a otro mail, aunque
   alguien se olvide de vaciarla. */
let _c = {};
const cached = (k, f) => {
  const e = _c[k];
  if (e && e.u === S.email) return e.p;
  // si la lectura falla (red, token que todavía no llegó), la entrada se borra: la
  // próxima llamada vuelve a intentar en vez de servir el fallo toda la sesión
  const e2 = { u: S.email, p: null };
  e2.p = f().catch(() => { if (_c[k] === e2) delete _c[k]; return null; });
  _c[k] = e2;
  return e2.p;
};
const invalidar = (...ks) => ks.forEach(k => { delete _c[k]; });
async function docJson(col) {
  try { const s = await getDoc(doc(db(), col, 'latest')); return s.exists() ? { ...JSON.parse(s.data().json || '{}'), _ts: s.data().actualizado_utc || null } : null; }
  catch (e) { return null; }
}
const radarDoc = () => cached('radar', async () => {
  // el doc PRO puede dar permission-denied: eso NO es un error, es el gate
  const [pub, pro] = await Promise.all([docJson('radar'), docJson('radarPro')]);
  if (!pub) throw new Error('radar');
  const m = mergeRadar(pub, pro);
  return { ...m, _ts: (pub || {})._ts };
});
const radar = async () => ((await radarDoc()) || {}).activos || [];
/* ¿pudo leer los fundamentals? Es el gate REAL, no el plan declarado */
const radarPro = async () => !!((await radarDoc()) || {}).pro;
const teaser = () => cached('teaser', async () => ((await docJson('carterasTeaser')) || {}).carteras || []);
const calendario = () => cached('cal', async () => ((await docJson('calendario')) || {}).earnings || []);
const flujos = () => cached('flujos', async () => (await docJson('bonosFlujos')) || {});
const panelBonos = () => cached('bp', async () => {
  const bp = (await docJson('bonosPanel')) || {};
  // el CCL/MEP implícitos en bonos se registran en fx.js con su nombre: son
  // otra medición que la de dolarapi, y así la UI puede decir cuál es cuál
  registrarImplicito(bp.variables, bp._ts);
  return bp;
});
const preciosInf = () => cached('pi', async () => (await docJson('preciosInformes')) || {});
const desglosePer = () => cached('dg', async () => (await docJson('desglosePeriodos')) || {});
const bonosSet = () => cached('bset', async () => new Set(Object.keys((await panelBonos()).todos || {})));
/* ── vencimientos de renta fija ─────────────────────────────────────────────
   La fuente es bonosPanel.vencimientos ({especie: 'AAAA-MM-DD'}), que cubre TODA
   la renta fija: soberanos, Bopreal, letras, CER y dólar linked. Si el pipeline
   todavía no lo publicó, el mapa se arma con el campo vence de cada grupo y el
   comportamiento es el de antes. Una especie AUSENTE del mapa no se avisa:
   ausente significa "no sé cuándo vence", nunca "no vence". */
const GRUPOS_RF = ['soberanos', 'bopreal', 'tasa_fija', 'cer', 'dolar_linked'];
const vencMapa = () => cached('venc', async () => {
  const bp = (await panelBonos()) || {}, m = {};
  // se indexa por la especie tal cual Y por su par (AL30D y AL30): la posición
  // del usuario puede estar cargada de cualquiera de las dos formas
  const poner = (e, v) => {
    const k = String(e || '').trim().toUpperCase(), f = String(v || '').slice(0, 10);
    if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
    if (!m[k]) m[k] = f;
    const p = parBono(k); if (!m[p]) m[p] = f;
  };
  // el mapa del pipeline manda: se carga primero y poner() no pisa lo ya puesto
  Object.entries(bp.vencimientos || {}).forEach(([e, v]) => poner(e, v));
  GRUPOS_RF.forEach(g => (bp[g] || []).forEach(x => x && poner(x.s, x.vence)));
  return m;
});
const vencimientoDe = (tk, vm) => {
  if (!vm) return '';
  const e = base(tk);
  return vm[e] || vm[parBono(e)] || vm[especieBono(e)] || '';
};
// el dólar sale de fx.js: una sola consulta compartida con Mi cartera, con las
// mismas guardas que el pipeline. Sin cached() a propósito: esa caché es por
// cuenta y nunca expira, y dejaría el dólar congelado toda la sesión; fx.js ya
// memoiza con un TTL de 5 min, el mismo ritmo de la barra de precios
const fx = () => fxMercado();
const cartera = () => cached('cartera', async () => {
  if (!S.verificado) return { pos: [], precios: {} };
  const snap = await getDocs(collection(db(), 'inversores', S.email, 'cartera'));
  const pos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tks = [...new Set(pos.map(p => String(p.ticker || '').toUpperCase()))].filter(Boolean);
  const precios = {};
  await Promise.all(tks.map(async tk => {
    try { const s = await getDoc(doc(db(), 'precios', tk)); if (s.exists()) precios[tk] = s.data(); } catch (e) {}
  }));
  // la renta fija sin precio del sync se completa desde el panel de bonos, con
  // la MISMA función que usa Mi cartera: si cada pantalla lo hiciera por su
  // lado, el Inicio y Mi cartera mostrarían dos totales distintos
  try { completarPreciosDeRentaFija(pos, precios, await panelBonos(), await bonosSet()); } catch (e) {}
  return { pos, precios };
});
const ventas = () => cached('ventas', async () => {
  if (!S.verificado) return [];
  const snap = await getDocs(collection(db(), 'inversores', S.email, 'ventas'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
});
const ajustes = () => cached('aj', async () => {
  if (!S.verificado) return [];
  const snap = await getDocs(collection(db(), 'inversores', S.email, 'ajustes'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
});
async function carteraCalc() {
  const leida = await cartera();
  const c = leida || { pos: [], precios: {} };
  const f = (await fx()) || { ccl: null, mep: null };
  // los bonos del panel van explícitos: sin ellos AL30 se leería en dólares.
  // El DOCUMENTO del panel de bonos también va explícito, y no por prolijidad:
  // es de donde calcular() saca la variación del día de la renta fija, porque
  // precios/{especie} no la trae. Sin pasarlo, calcular() caía en el estado
  // interno de mi-cartera.js, que está vacío hasta que alguien abre esa
  // pestaña: el mismo usuario veía el "hoy" con los bonos adentro en Mi cartera
  // y sin ellos en el Resumen.
  // La moneda se lee UNA vez: si se leyera dos, un cambio de moneda en el medio
  // dejaría cc.cur y cc.r calculados con monedas distintas.
  const cur = curVista();
  return { ...c, fallo: !leida, fx: f, cur,
           r: calcular(c.pos, c.precios, cur, f, (await bonosSet()) || new Set(), (await panelBonos()) || null) };
}

/* ── lo que se movió tu cartera HOY ───────────────────────────────────────────
   UNA sola cuenta para todo el panel, y la cuenta NO es de acá: es la de
   calcular() (mi-cartera.js), que ya deja en cada fila dHoy y hoyPct. Acá se
   suma, nada más. Es a propósito: la tabla de Mi cartera pinta fila por fila
   ese mismo dHoy, así que si el Resumen rehiciera la aritmética por su lado,
   el mismo usuario podría ver dos cifras distintas del mismo día.

   De dónde sale la variación de cada posición (en por ciento, del día), adentro
   de calcular():
     · acciones, CEDEARs y cripto → precios/{TICKER}.d, lo que deja el sync;
     · renta fija → el campo v del panel de bonos (bonosPanel/latest), porque
       precios/{especie} NO trae la variación de los bonos. Por eso carteraCalc()
       le pasa el documento del panel a calcular().
   Con esa variación calcular() saca el cierre anterior —previo = precio/(1+d/100),
   nunca restando porcentajes— y deja en la fila dHoy = cantidad × factor ×
   (precio − previo) convertido con la MISMA conversión que el valor de esa fila,
   con el mismo factor de lámina (0,01 en los bonos, que cotizan por 100 VN).

   Lo que no trae variación queda AFUERA y se informa: nunca se asume que una
   posición no se movió. El porcentaje es sobre el valor de ayer de las
   posiciones que sí entraron, no sobre el total de la cartera.

   Se miran SOLO las posiciones que ya tienen valor en la moneda del encabezado:
   las que esperan el precio del sync o la cotización del dólar tienen su propio
   aviso en el Resumen, y nombrarlas otra vez acá sería repetir el mismo problema
   con dos nombres distintos.

   Devuelve (todo en la moneda de cc.cur, monto y pct en null si no hay nada):
     { monto, pct, valor, previo, con, sin, total, sinTickers, porId }
   donde valor/previo son el valor de hoy y el de ayer de las que entraron, y
   porId indexa por id de posición { ticker, d, monto, previo } — ahí previo es
   el PRECIO de cierre anterior de ese activo, no un importe. */
async function variacionDia(cc) {
  const todas = (cc && cc.r && cc.r.filas) || [];
  const filas = todas.filter(f => f.dValor != null && isFinite(f.dValor));
  const con = filas.filter(f => f.dHoy != null && isFinite(f.dHoy));
  const fuera = filas.filter(f => !(f.dHoy != null && isFinite(f.dHoy)));
  const salida = { monto: null, pct: null, valor: null, previo: null,
                   con: 0, sin: fuera.length, total: filas.length,
                   sinTickers: [...new Set(fuera.map(f => base(f.ticker)))], porId: {} };
  if (!con.length) return salida;
  const monto = con.reduce((s, f) => s + f.dHoy, 0);
  const valor = con.reduce((s, f) => s + f.dValor, 0);
  const previo = valor - monto;   // el valor de ayer de esas mismas posiciones
  const porId = {};
  con.forEach(f => {
    if (f.id == null) return;
    const d = f.hoyPct != null && isFinite(f.hoyPct) ? Number(f.hoyPct) : null;
    porId[f.id] = { ticker: String(f.ticker || '').toUpperCase(), d, monto: f.dHoy,
                    previo: d != null && f.actual != null ? f.actual / (1 + d / 100) : null };
  });
  return { ...salida, monto, pct: previo > 0 ? monto / previo * 100 : null,
           valor, previo, con: con.length, porId };
}
const disciplina = () => cached('disc', async () => {
  if (!S.verificado) return { config: null, log: [] };
  const snap = await getDocs(collection(db(), 'inversores', S.email, 'disciplina'));
  let config = null; const log = [];
  snap.docs.forEach(d => { const x = d.data(); if (d.id === 'config') config = x; else if (x.tipo === 'compra') log.push(x); });
  return { config, log };
});
const informes = () => cached('inf', async () => {
  const col = collection(db(), 'informes');
  const snap = await getDocs(S.pro ? col : query(col, where('visibilidad', '==', 'publico')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.titulo && d.fecha);
});
const noticias = () => cached('not', async () => {
  const snap = await getDocs(query(collection(db(), 'noticias'), where('estado', '==', 'publicado')));
  return snap.docs.map(d => ({ id: d.id, titulo: d.data().titulo, fecha: d.data().fecha, resumen: d.data().resumen, categoria: d.data().categoria }))
    .filter(n => n.titulo).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 200);
});
/* las carteras que el usuario decidió seguir (solo id + desde) */
const seguidas = () => cached('seg', async () => {
  if (!S.verificado) return {};
  const snap = await getDocs(collection(db(), 'inversores', S.email, 'carterasSeguidas'));
  const out = {};
  snap.docs.forEach(d => { out[d.id] = d.data() || {}; });
  return out;
});

const posicionesCartera = id => cached('cm-' + id, async () => {
  const snap = await getDocs(collection(db(), 'carterasModelo', id, 'posiciones'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.estado || p.estado === 'activa');
});

/* precio "de hoy" en dólares para un símbolo del radar: preciosInformes
   (15 min en rueda) y si no, el del radar (diario) */
async function precioHoy(sym) {
  const pi = (await preciosInf()) || {};
  const f = tickerFicha(sym);
  if (f && pi[f] && pi[f].p != null) return pi[f].p;
  const a = (await radar()).find(x => x.sym === sym);
  return a ? a.precio : null;
}

/* ───────────────────────── shell: lateral + encabezado + ruteo ───────────────────────── */
// El lateral es el del prototipo Panel v3: tres grupos y, en el pie, el nombre,
// el plan, Mi cuenta y los links de salida. "Mis empresas" y "Herramientas y
// datos" no son pestañas: la primera vive en el desplegable de cada fila de Mi
// cartera y la segunda es un link al sitio; las dos se siguen abriendo desde Mi
// cartera (SUBVISTAS), así que no se pierde nada.
const TABS = [
  { g: 'Tus inversiones', id: 'inicio', t: 'Resumen' },
  { g: 'Tus inversiones', id: 'micartera', t: 'Mi cartera' },
  // tus compras y ventas en una sola lista (panel-movimientos.js). El id es
  // 'historial' y no 'movimientos': ese ya es Posiciones, de la gestión del fondo
  { g: 'Tus inversiones', id: 'historial', t: 'Movimientos' },
  // lo que Valtia hizo en sus carteras: compras, ventas, pesos y rotaciones
  { g: 'Tus inversiones', id: 'alertas', t: 'Alertas' },
  { g: 'Para decidir', id: 'comprar', t: 'Qué comprar', tit: 'Qué comprar hoy' },
  { g: 'Para decidir', id: 'carteras', t: 'Carteras Valtia' },
  { g: 'Para decidir', id: 'disciplina', t: 'Inversión mensual' },
  { g: 'Mercado', id: 'agenda', t: 'Agenda', tit: 'Agenda del mercado' },
  // el plan, los datos de la cuenta y los avisos por mail: en el prototipo va en el
  // pie del lateral (debajo del plan) y al final de la barra del celular
  { g: 'Tu cuenta', id: 'cuenta', t: 'Mi cuenta', pie: true },
];
const SUBVISTAS = {
  empresas: { t: 'Mis empresas', de: 'micartera' },
  herramientas: { t: 'Datos de tus activos', de: 'micartera' },
};
// la gestión del fondo: la llena fondo-live.js y solo existe para el admin
const GESTION = [
  // Operar carteras (panel-operar.js) va primera: es lo que más se usa y lo
  // único de este grupo que ESCRIBE las carteras modelo
  { id: 'operar', t: 'Operar carteras' },
  // los mails que dejaron en «Precio de lanzamiento — escribinos» (panel-espera.js)
  { id: 'espera', t: 'Lista de espera PRO' },
  { id: 'dashboard', t: 'Fondo · Dashboard' }, { id: 'rendimientos', t: 'Rendimientos' },
  { id: 'movimientos', t: 'Posiciones' }, { id: 'fondo', t: 'Balance consolidado' },
  { id: 'senales', t: 'Señales' }, { id: 'analisis', t: 'Análisis de cartera' },
  { id: 'informes', t: 'Lector de informes' }, { id: 'admin', t: 'Inversores' },
];
const ES_GESTION = new Set(GESTION.map(x => x.id));
// el selector de moneda va donde cambia las cifras. En Qué comprar, Carteras e
// Inversión mensual todo está en dólares: un selector que no hace nada confunde
const CON_MONEDA = new Set(['inicio', 'micartera', 'empresas', 'herramientas']);
const NUEVOS = ['inicio', 'historial', 'alertas', 'comprar', 'carteras', 'empresas', 'disciplina', 'herramientas', 'agenda', 'cuenta'];
// tabs que este usuario puede abrir: los divs de Gestión y Fondo viven en el
// HTML para todos, así que sin este set cualquiera llega por #panel/admin
let _permitidos = new Set(NUEVOS.concat(['micartera']));
let _tab = 'inicio';
// cada pestaña del Panel v3 vive en su módulo (panel-*.js) y recibe el contexto;
// Mis empresas y Datos de tus activos siguen acá, como subvistas de Mi cartera
const enModulo = (f, id) => () => f($('tab-' + id), ctx).catch(() => {});
const _render = { inicio: enModulo(renderResumen, 'inicio'), comprar: enModulo(renderComprarV3, 'comprar'),
                  carteras: enModulo(renderCarterasV3, 'carteras'), disciplina: enModulo(renderMensual, 'disciplina'),
                  alertas: enModulo(renderAlertas, 'alertas'), historial: enModulo(renderMovimientos, 'historial'),
                  agenda: enModulo(renderAgenda, 'agenda'), cuenta: enModulo(renderCuenta, 'cuenta'),
                  operar: enModulo(renderOperar, 'operar'), espera: enModulo(renderEspera, 'espera'),
                  empresas: renderEmpresas, herramientas: renderHerramientas };
const _hecho = {};

function pintarPlan() {
  const c = $('vp-plan'); if (!c) return;
  c.textContent = etiquetaPlan();
  // relleno dorado para los planes pagos (PRO, cliente, admin); borde para el gratis
  c.classList.toggle('pro', S.pro);
}
function etiquetaPlan() {
  return S.isAdmin ? 'Admin' : S.cliente ? 'Cliente · a medida' : S.pro ? 'PRO' : S.verificado ? 'Gratis' : 'Gratis · verificá tu mail';
}
const nombreUsuario = () => (S.user && S.user.displayName) || String(S.email || '').split('@')[0];
const primerNombre = () => String(nombreUsuario() || '').split(' ')[0];
function hoyLargo() {
  try {
    // "Sábado 26 de septiembre", como el prototipo (sin la coma después del día)
    const s = new Date(hoyAR() + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch (e) { return ''; }
}

function instalarShell() {
  if (!$('vp-style')) { const st = document.createElement('style'); st.id = 'vp-style'; st.textContent = CSS; document.head.appendChild(st); }
  const nav = document.querySelector('.portal-nav'), content = document.querySelector('.portal-content');
  if (!nav || !content) return;
  NUEVOS.forEach(id => { if (!$('tab-' + id)) { const d = document.createElement('div'); d.id = 'tab-' + id; d.style.display = 'none'; content.appendChild(d); } });
  _permitidos = new Set(['micartera'].concat(NUEVOS));
  // "Tu posición en el fondo" no tiene lugar en el lateral del inversor (el
  // handoff saca el Fondo del panel); la ruta queda para el cliente del fondo
  if (S.cliente) _permitidos.add('fondocli');
  if (S.isAdmin) GESTION.forEach(x => _permitidos.add(x.id));
  // fondo-live.js (admin) rebautiza "Posiciones" a todo link del lateral cuyo texto sea
  // exactamente "Movimientos" (así nombraba antes su pestaña del fondo). La marca
  // oculta hace que el de esta pestaña no coincida; no se ve ni se lee en voz alta
  const marca = x => x.id === 'historial' ? '<i hidden>·</i>' : '';
  const link = (x, m) => `<a href="#panel/${x.id}" id="${x.id}-tab" data-tab="${x.id}" data-m="${m}" onclick="portalTab(event,'${x.id}')"><span>${x.t}</span>${marca(x)}</a>`;
  const enGrupo = TABS.filter(x => !x.pie);
  const grupos = [...new Set(enGrupo.map(x => x.g))];
  const cuenta = TABS.find(x => x.pie);
  nav.innerHTML = `<div class="fl-sbbrand">
      <div class="lg" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 12 L5 6 L8 9 L12 3 L15 6" fill="none" stroke="#B08A3E" stroke-width="1.5"/></svg></div>
      <div><div class="nm">VAL<span>T</span>IA</div><div class="sb">Analytics</div></div></div>` +
    grupos.map(g => `<div class="vp-grp" data-m="inv">${g}</div>` + enGrupo.filter(x => x.g === g).map(x => link(x, 'inv')).join('')).join('') +
    (S.isAdmin ? `<div class="vp-grp" data-m="ges">Gestión del fondo</div>` + GESTION.map(x => link(x, 'ges')).join('') : '') +
    `<div class="vp-foot"><span id="portal-user-name">${esc(nombreUsuario())}</span>
      <div class="vp-plan-w"><span class="vp-plan${S.pro ? ' pro' : ''}" id="vp-plan">${etiquetaPlan()}</span></div>
      ${cuenta ? `<a href="#panel/${cuenta.id}" class="vp-lat-l vp-lat-cuenta" data-m="inv" onclick="portalTab(event,'${cuenta.id}')">${cuenta.t}</a>` : ''}
      ${S.isAdmin ? `<a href="#panel/dashboard" class="vp-lat-l vp-lat-ges" data-m="inv" onclick="portalTab(event,'dashboard')">Gestión del fondo →</a>
      <a href="#panel/inicio" class="vp-lat-l vp-lat-ges" data-m="ges" onclick="portalTab(event,'inicio')">← Panel del inversor</a>` : ''}
      <a href="/herramientas" class="vp-lat-l">Herramientas y datos ↗</a>
      <a href="#" class="vp-lat-l" onclick="valtiaPanel.salir(event)">← Volver al sitio</a>
      <button type="button" onclick="logout()">Cerrar sesión</button></div>`;
  if (!document.querySelector('.fl-layout')) {
    const wrap = document.createElement('div'); wrap.className = 'fl-layout';
    nav.parentElement.insertBefore(wrap, nav); wrap.appendChild(nav);
    const main = document.createElement('div'); main.className = 'fl-main';
    main.appendChild(content); wrap.appendChild(main);
  }
  // si el shell lo armó otro (fondo-live.js arma el suyo con una barra de
  // links), se le cambia la barra por el encabezado del panel
  const main = document.querySelector('.fl-main');
  if (main && !$('vp-enc')) {
    const tb = main.querySelector('.fl-topbar'); if (tb) tb.remove();
    // la barra del celular es un div y no un <nav>: index.html le da a todo <nav> el
    // aspecto del nav del sitio, y con el panel abierto los esconde (salvo el lateral)
    main.insertAdjacentHTML('afterbegin', `<div class="vp-mbar" id="vp-mbar" role="navigation" aria-label="Secciones del panel"></div>
      <header class="vp-enc" id="vp-enc"></header>`);
  }
  llenarBarraMovil();
  pintarPlan();
  document.body.classList.add('fl-app-on');
  ubicarBarraCot();
  const og = window.goPortal;
  window.goPortal = e => { if (og) og(e); document.body.classList.add('fl-app-on'); portalTab(_tab); };
  // las fuentes las carga index.html; esto es por si el panel se monta en otra página.
  // Sin IBM Plex Mono: los números van en Plex Sans con cifras tabulares (SPEC §0)
  if (!document.querySelector('link[href*="Playfair"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
}

/* ── la barra de cotizaciones arriba del contenido (SPEC §0 y prototipo) ──────────
   #valtia-cot vive en index.html debajo del nav del sitio y la llena
   cotizaciones.js, que la vuelve a buscar por id en cada refresco: moverla no le
   corta nada. Con el panel abierto va al tope de la columna principal, a la
   derecha del lateral; al volver al sitio, a su lugar de siempre. Se sigue la
   clase fl-app-on del body y no cada botón de salida: así cubre "Volver al
   sitio", el logo del sitio, "Mi Panel" y cualquier camino futuro. */
let _cotOrigen = null;
function ubicarBarraCot() {
  const cot = $('valtia-cot'), main = document.querySelector('.fl-main');
  if (!cot || !main) return;
  const enPanel = document.body.classList.contains('fl-app-on');
  // primera de la columna aunque después se le agreguen cosas arriba (la barra del
  // celular y el encabezado entran con afterbegin)
  if (enPanel && main.firstElementChild !== cot) {
    if (!_cotOrigen && cot.parentElement !== main) _cotOrigen = { padre: cot.parentElement, sig: cot.nextElementSibling };
    main.insertBefore(cot, main.firstChild);
  } else if (!enPanel && _cotOrigen && cot.parentElement === main) {
    const { padre, sig } = _cotOrigen;
    padre.insertBefore(cot, sig && sig.parentElement === padre ? sig : null);
  }
}
try { new MutationObserver(ubicarBarraCot).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}

/* en el celular (<920 px) el lateral se esconde y queda una barra azul fija arriba
   con todas las pestañas deslizables, Mi cuenta y los links de salida (el lateral
   los tiene en su pie). Las pastillas son las mismas del lateral (contadorNav) */
function llenarBarraMovil() {
  const bar = $('vp-mbar'); if (!bar) return;
  const item = (x, m) => `<a href="#panel/${x.id}" data-mt="${x.id}" data-m="${m}" onclick="portalTab(event,'${x.id}')">${esc(x.t)}</a>`;
  bar.innerHTML = `<span class="vp-mbrand" aria-hidden="true">VAL<span>T</span>IA</span>` +
    TABS.filter(x => !x.pie).map(x => item(x, 'inv')).join('') +
    TABS.filter(x => x.pie).map(x => item(x, 'inv')).join('') +
    (S.isAdmin
      ? `<a href="#panel/dashboard" class="vp-mx ges" data-m="inv" onclick="portalTab(event,'dashboard')">Gestión del fondo →</a>` +
        GESTION.map(x => item(x, 'ges')).join('') +
        `<a href="#panel/inicio" class="vp-mx ges" data-m="ges" onclick="portalTab(event,'inicio')">← Panel del inversor</a>`
      : '') +
    `<i class="vp-msep" aria-hidden="true"></i>
    <a href="/herramientas" class="vp-mx">Herramientas y datos ↗</a>
    <a href="#" class="vp-mx" onclick="valtiaPanel.salir(event)">← Volver al sitio</a>
    <button type="button" class="vp-mx vp-msalir" onclick="logout()">Cerrar sesión</button>`;
}
/* la pestaña activa queda a la vista en la barra del celular (solo se corre la barra,
   nunca la página) */
function centrarEnBarra() {
  const bar = $('vp-mbar'); if (!bar || !bar.offsetParent) return;
  const a = bar.querySelector('a.on'); if (!a) return;
  const izq = a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2;
  try { bar.scrollTo({ left: Math.max(0, izq), behavior: 'smooth' }); } catch (e) { bar.scrollLeft = Math.max(0, izq); }
}

/* un solo encabezado para todo el panel (prototipo): título, fecha y frescura, y
   a la derecha la moneda (y "+ Agregar" en Mi cartera) */
function pintarEncabezado() {
  const h = $('vp-enc'); if (!h) return;
  const tab = _tab, ges = ES_GESTION.has(tab), sub = SUBVISTAS[tab], ficha = TABS.find(x => x.id === tab);
  // la gestión del fondo (fondo-live.js) y la posición en el fondo pintan su propio título
  const propio = ges || tab === 'fondocli';
  const tit = ges ? 'Gestión del fondo' : tab === 'inicio' ? 'Hola, ' + primerNombre()
    : sub ? sub.t : tab === 'fondocli' ? 'Tu posición en el fondo' : ficha ? (ficha.tit || ficha.t) : '';
  const cur = curVista(), conMon = CON_MONEDA.has(tab);
  const partes = [hoyLargo()];
  if (ges) partes.push('solo lo ves vos, como administrador');
  else if (conMon && S.frescura) partes.push(S.frescura);
  // con la moneda en dólares, de dónde sale el dólar y qué edad tiene
  if (conMon && cur !== 'ARS' && S.fxSnap) { try { const e = etiquetaFx(S.fxSnap, cur === 'CCL' ? 'ccl' : 'mep'); if (e) partes.push(e); } catch (x) {} }
  // el cartel del mercado va donde están los precios del usuario (las mismas
  // pestañas que muestran la frescura); en la gestión del fondo no aparece
  const mkt = !ges && conMon ? cartelMercado() : '';
  const linea = partes.filter(Boolean).join(' · ');
  // la derecha, sin espacios sueltos: vacía (Movimientos, Alertas…) no ocupa lugar
  const der = (conMon ? `<div class="vp-seg mon" role="group" aria-label="Moneda">${['ARS', 'CCL', 'MEP'].map(c =>
      `<button type="button" data-cur="${c}" class="${cur === c ? 'on' : ''}" aria-pressed="${cur === c}">${curEtq(c)}</button>`).join('')}</div>` : '')
    + (tab === 'micartera' && S.verificado ? '<button type="button" class="vp-agregar" data-agregar>+ Agregar</button>' : '');
  h.innerHTML = `<div class="izq">${sub ? `<a href="#panel/${sub.de}" data-go="${sub.de}" class="vp-enc-volver">← Mi cartera</a>` : ''}
      ${propio ? '' : `<h1>${esc(tit)}</h1>`}<div class="sub">${mkt}<span class="txt" title="${esc(linea)}">${esc(linea)}</span></div></div><div class="der">${der}</div>`;
}

/* contadores del lateral y frescura del encabezado: no dependen de que el
   usuario pase por el Resumen (antes solo se llenaban ahí) */
let _latSeq = 0;
async function actualizarLateral() {
  const email = S.email, seq = ++_latSeq;
  pastillaEspera();
  try {
    const [cc, disc, bset, f] = await Promise.all([carteraCalc(), disciplina(), bonosSet(), fx()]);
    if (S.email !== email || seq !== _latSeq) return;
    S.fxSnap = f;
    if (cc.fallo) return;   // sin leer la cartera no se pisan los contadores con ceros
    S.frescura = cc.pos.length ? frescura(cc.precios) : '';
    S.ultimoPrecioMs = cc.pos.length ? ultimoPrecioMs(cc.precios) : null;
    pintarEncabezado();
    await contadores(cc, disc, bset);
  } catch (e) {}
}

// Mi cartera relee los precios cada 2 minutos: la frescura del encabezado es la
// de esa tabla (con la regla de acá: manda la posición más desactualizada)
window.addEventListener('valtia-precios', e => {
  const d = (e && e.detail) || {};
  if (!d.email || d.email !== S.email) return;
  S.frescura = d.n ? frescura(d.precios) : '';
  S.ultimoPrecioMs = d.n ? ultimoPrecioMs(d.precios) : null;
  if (d.fx) S.fxSnap = d.fx;
  if (CON_MONEDA.has(_tab)) pintarEncabezado();
});

export function portalTab(e, tab) {
  if (typeof e === 'string') { tab = e; e = null; }
  if (e && e.preventDefault) e.preventDefault();
  if (!$('tab-' + tab) || !_permitidos.has(tab)) tab = 'inicio';
  document.querySelectorAll('.portal-content > [id^="tab-"]').forEach(el => { el.style.display = el.id === 'tab-' + tab ? 'block' : 'none'; });
  // una subvista de Mi cartera deja marcada a Mi cartera en el lateral
  const enLateral = (SUBVISTAS[tab] || {}).de || tab;
  document.querySelectorAll('.portal-nav a[data-tab]').forEach(a => {
    const on = a.dataset.tab === enLateral;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // Mi cuenta va en el pie del lateral (un link, no una pestaña del grupo)
  document.querySelectorAll('.portal-nav a.vp-lat-cuenta').forEach(a => {
    const on = enLateral === 'cuenta';
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const ges = ES_GESTION.has(tab);
  const nav = document.querySelector('.portal-nav');
  if (nav) nav.classList.toggle('modo-ges', ges);
  const bar = $('vp-mbar');
  if (bar) {
    bar.classList.toggle('modo-ges', ges);
    bar.querySelectorAll('a[data-mt]').forEach(a => {
      const on = a.dataset.mt === enLateral;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  _tab = tab;
  centrarEnBarra();
  try { sessionStorage.setItem('valtia-panel-tab', tab); sessionStorage.setItem('valtia-panel-user', S.email || ''); } catch (x) {}
  if (location.hash !== '#panel/' + tab) history.replaceState(null, '', '#panel/' + tab);
  pintarEncabezado();
  if (e) window.scrollTo(0, 0);
  if (_render[tab] && !_hecho[tab]) { _hecho[tab] = true; _render[tab](); }
  if (window.flResizeCharts) window.flResizeCharts();
}
function refrescar(...tabs) {
  tabs.forEach(t => { _hecho[t] = false; if (t === _tab) portalTab(t); });
  // Alertas también repinta el lateral: su pastilla es la de las no leídas
  if (tabs.includes('inicio') || tabs.includes('disciplina') || tabs.includes('alertas')) actualizarLateral();
}
function abrirDesdeHash() {
  const m = /^#panel\/([a-z-]+)/.exec(location.hash);
  portalTab(m ? m[1] : _tab);
}
window.addEventListener('hashchange', () => { if (/^#panel\//.test(location.hash)) abrirDesdeHash(); });

function salir(e) {
  if (e) e.preventDefault();
  try { sessionStorage.removeItem('valtia-panel-tab'); sessionStorage.removeItem('valtia-panel-user'); } catch (x) {}
  document.body.classList.remove('fl-app-on');
  if (window.showHome) window.showHome();
  history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
}

async function detectarPlan() {
  if (S.isAdmin) { S.pro = true; S.plan = 'admin'; return; }
  let pro = S.cliente;
  if (!pro && S.verificado) {
    for (const col of ['usuariosPro', 'inversores']) {
      try { const s = await getDoc(doc(db(), col, S.email)); if (s.exists()) { pro = true; break; } } catch (e) {}
    }
  }
  S.pro = pro; S.plan = S.cliente ? 'cliente' : pro ? 'pro' : 'gratis';
}

/* Bienvenida: se muestra UNA vez por cuenta, la primera vez que entra al
   panel. Dice lo que hay que decir antes de que toque nada —qué es esto, qué
   NO es, que sus datos son suyos— y deja a mano a quién escribirle.
   La marca de "ya la vio" va por cuenta: en una máquina compartida, el que
   entra después tiene derecho a verla igual. */
const BIENVENIDA_V = 1;   // subir esto la vuelve a mostrar a todos
const claveBienvenida = () => `valtia-bienvenida-v${BIENVENIDA_V}-${S.email || ''}`;

function bienvenida() {
  if (!S.email) return;
  try { if (localStorage.getItem(claveBienvenida())) return; } catch (e) { return; }
  if (document.getElementById('vp-bv')) return;
  const nombre = (S.user && S.user.displayName ? S.user.displayName : S.email.split('@')[0]).split(' ')[0];
  const f = document.createElement('div');
  f.className = 'vp-bv'; f.id = 'vp-bv';
  f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true'); f.setAttribute('aria-labelledby', 'vp-bv-t');
  f.innerHTML = `<div class="vp-bv-caja">
    <div class="k">Bienvenido a Valtia</div>
    <h3 id="vp-bv-t">Hola, ${esc(nombre)}</h3>
    <p>Valtia es una herramienta para mirar tus inversiones con criterio propio: qué tenés,
    cuánto vale hoy y qué dice la lectura automática sobre cada activo. Tres cosas antes de arrancar.</p>
    <ul>
      <li><i>01</i><div><b>Tus datos son tuyos.</b> Tu cartera y tu plan los ve tu cuenta y nadie más:
        las reglas del servidor lo impiden. No los vendemos ni los compartimos.</div></li>
      <li><i>02</i><div><b>Acá no se opera.</b> Valtia no ejecuta órdenes ni custodia fondos. Comprás y
        vendés en tu broker; acá lo registrás y lo seguís.</div></li>
      <li><i>03</i><div><b>Son lecturas, no consejos.</b> Todo lo que publicamos es análisis automático de
        precios y múltiplos, de carácter general y educativo. No es asesoramiento financiero ni una
        recomendación para tu caso.</div></li>
    </ul>
    ${!S.verificado ? `<p style="color:var(--v3-gold2)"><b>Te falta verificar tu mail.</b> Hasta que lo hagas,
      Mi cartera y la inversión mensual quedan bloqueadas. Te mandamos el enlace cuando creaste la cuenta.</p>` : ''}
    <div class="vp-bv-legal">Las alertas por mail vienen apagadas: las prendés vos desde el panel, y como
      máximo sale una por día. ¿Dudas o algo que no funciona? Escribinos a
      <a href="mailto:soporte@valtia.tech">soporte@valtia.tech</a>.</div>
    <div class="vp-bv-pie">
      <button class="vp-btn" id="vp-bv-ok">Empezar</button>
      <a class="vp-ir" href="/privacidad" style="margin:0">Privacidad</a>
      <a class="vp-ir" href="/terminos" style="margin:0">Términos</a>
    </div>
  </div>`;
  const cerrar = () => {
    try { localStorage.setItem(claveBienvenida(), new Date().toISOString()); } catch (e) {}
    document.removeEventListener('keydown', porTecla);
    f.remove();
  };
  const porTecla = ev => { if (ev.key === 'Escape') cerrar(); };
  f.addEventListener('click', ev => { if (ev.target === f) cerrar(); });
  document.addEventListener('keydown', porTecla);
  document.body.appendChild(f);
  const b = document.getElementById('vp-bv-ok');
  if (b) { b.onclick = cerrar; try { b.focus(); } catch (e) {} }
}

/* Cambio de cuenta en la misma página. Como el logout no recarga, sin esto
   quedaban vivos: la caché de datos, el registro de qué pestaña ya se dibujó
   (_hecho, que evita volver a dibujarla) y el HTML ya renderizado adentro de
   cada div tab-*. O sea que la cuenta siguiente podía ver, literalmente en
   pantalla, la cartera del usuario anterior. */
function reiniciarEstado() {
  _c = {};
  Object.keys(_hecho).forEach(k => { delete _hecho[k]; });
  _tab = 'inicio';
  try { document.querySelectorAll('.portal-content div[id^="tab-"]').forEach(d => { d.innerHTML = ''; }); } catch (e) {}
  try { reiniciarMiCartera(); } catch (e) {}
}

/* punto de entrada: lo llama enterPortal (index.html) para todo usuario */
export async function iniciarPanel({ user, isAdmin, data }) {
  if (S.email && S.email !== user.email) {
    // otra cuenta en la misma página: nada del estado anterior (panel, Mi cartera, gestión
    // del fondo) puede sobrevivir. Recargar es lo único que lo garantiza del todo
    reiniciarEstado();
    location.replace(location.pathname);
    return;
  }
  // pestaña recordada de OTRO usuario (o de una sesión cerrada): se descarta
  try {
    if (sessionStorage.getItem('valtia-panel-user') !== user.email) {
      sessionStorage.removeItem('valtia-panel-tab');
      sessionStorage.removeItem('valtia-panel-user');
    }
  } catch (x) {}
  S.user = user; S.isAdmin = !!isAdmin; S.data = data || {}; S.email = user.email;
  S.verificado = !!user.emailVerified;
  S.cliente = S.data.valorActual != null || S.data.capitalNeto != null;
  S.pro = S.isAdmin || S.cliente;
  S.frescura = ''; S.fxSnap = null; S.ultimoPrecioMs = null;
  instalarShell();
  // las alertas de precio se evalúan en cada repintado de Mi cartera (evento
  // "valtia-precios"). Una sola vez por página: instalarEvaluacion lo controla
  try { instalarEvaluacion(ctx); } catch (e) {}
  abrirDesdeHash();
  bienvenida();
  actualizarLateral();
  const antesPro = S.pro;
  await detectarPlan();
  pintarPlan();
  // el plan se resuelve después del primer render: si resultó PRO, hay que
  // rehacer lo que se dibujó con el plan provisorio Y tirar el caché de
  // informes (se pidió con el filtro de visibilidad de un usuario gratis)
  if (S.pro && !antesPro) {
    invalidar('inf');
    refrescar('inicio', 'alertas', 'comprar', 'carteras', 'empresas', 'herramientas', 'cuenta');
  } else actualizarLateral();   // el contador de carteras depende del plan
}

/* ───────────────────────── compra: "La compré" ───────────────────────── */
function formCompra(sym, precioUSD) {
  const f = tickerFicha(sym);
  const b = brokerPref();
  return `<div class="vp-form" data-form="${esc(sym)}">
    <div><label>Mercado</label><select data-mer data-pxusd="${precioUSD != null ? +Number(precioUSD).toFixed(2) : ''}">
      <option value="ext"${f ? '' : ' disabled'}>Exterior · US$</option>
      <option value="byma">BYMA · pesos (CEDEAR / local)</option>
      <option value="cripto"${/^(BTC|ETH)$/.test(sym) ? ' selected' : ''}>Cripto · US$</option></select></div>
    <div><label>Cantidad</label><input type="number" step="any" min="0" data-cant style="width:90px"></div>
    <div><label>Precio pagado</label><input type="number" step="any" min="0" data-px value="${precioUSD != null ? +Number(precioUSD).toFixed(2) : ''}" style="width:110px"></div>
    <div><label>Broker</label><input list="vp-brokers" data-brk value="${esc(b)}" maxlength="24" style="width:110px"></div>
    <button class="vp-btn mini" data-ok="${esc(sym)}">Confirmar</button>
    <button class="vp-btn mini sec" data-cancel="${esc(sym)}">Cancelar</button>
    <div class="vp-msg" data-msg style="width:100%"></div></div>`;
}
const DATALIST = `<datalist id="vp-brokers">${BROKERS.map(b => `<option value="${b}">`).join('')}</datalist>`;

async function registrarCompra(sym, form) {
  const mer = form.querySelector('[data-mer]').value;
  const cant = Number(form.querySelector('[data-cant]').value);
  const px = Number(form.querySelector('[data-px]').value);
  const brk = form.querySelector('[data-brk]').value.trim();
  const msg = form.querySelector('[data-msg]');
  if (!(cant > 0)) { msg.innerHTML = '<span class="vp-neg">Cargá la cantidad.</span>'; return; }
  if (!(px > 0)) { msg.innerHTML = `<span class="vp-neg">Cargá el precio que pagaste${mer === 'byma' ? ' en pesos' : ' en dólares'}.</span>`; return; }
  const tickerBase = mer === 'byma' ? radarSym(sym) : mer === 'ext' ? (tickerFicha(sym) || sym) : base(sym);
  const bset = await bonosSet();
  const tk = normalizarTicker(tickerBase, mer, bset);
  const f = hoyAR(), ahora = new Date().toISOString(), suf = Date.now().toString(36);
  // la moneda y el factor de lámina se saben ACÁ (el formulario los tiene):
  // si no se guardan, una compra en BYMA se lee como dólares hasta que el
  // sync cree precios/{tk} — y eso puede tardar hasta la corrida de las 9:00
  const moneda = mer === 'byma' ? 'ARS' : 'USD';
  const factor = esRentaFija(tk, bset) ? 0.01 : 1;
  try { localStorage.setItem('valtia-mc-broker', brk); } catch (e) {}
  try {
    await setDoc(doc(db(), 'inversores', S.email, 'cartera', tk + '-' + suf),
      { ticker: tk, cantidad: cant, precioCompra: px, fecha: f, broker: brk, moneda, factor, creado: ahora });
    await setDoc(doc(db(), 'inversores', S.email, 'disciplina', 'c-' + suf),
      { tipo: 'compra', ticker: tk, cantidad: cant, precio: px, fecha: f, mes: f.slice(0, 7), broker: brk, creado: ahora });
  } catch (e) {
    msg.innerHTML = `<span class="vp-neg">No se pudo guardar (${esc(String(e.code || e).slice(0, 80))}).</span>`; return;
  }
  toast(`${tk} agregada a Mi cartera y a tu plan del mes`);
  invalidar('cartera', 'disc');
  refrescar('inicio', 'historial', 'comprar', 'carteras', 'disciplina', 'empresas', 'herramientas', 'agenda');
  if (window.__mcRecargar) window.__mcRecargar();
}

async function seguirCartera(id, nombre, seguir) {
  try {
    const ref = doc(db(), 'inversores', S.email, 'carterasSeguidas', id);
    if (seguir) await setDoc(ref, { desde: hoyAR(), nombre: String(nombre || '').slice(0, 60) });
    else await deleteDoc(ref);
    toast(seguir ? `Seguís ${nombre}` : `Dejaste de seguir ${nombre}`);
    invalidar('seg');
    refrescar('carteras', 'inicio', 'comprar');
    return true;
  } catch (e) {
    toast('No se pudo guardar (' + String(e.code || e).slice(0, 40) + ')');
    return false;
  }
}

/* delegación de eventos de todo el panel */
// el precio precargado es el de la ficha en dólares: si el usuario pasa el
// mercado a BYMA (pesos), se limpia — si no, guardaba US$61 como $61
document.addEventListener('change', e => {
  const sel = e.target.closest('.vp-form [data-mer]');
  if (!sel) return;
  const inp = sel.closest('.vp-form').querySelector('[data-px]');
  const usd = sel.dataset.pxusd;
  if (!inp) return;
  if (sel.value === 'byma') { inp.value = ''; inp.placeholder = 'en pesos'; }
  else { inp.value = usd || ''; inp.placeholder = 'en dólares'; }
});

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-compra],[data-ok],[data-cancel],[data-seguir],.vp-seg button[data-cur],[data-agregar]');
  if (!t) return;
  if (t.dataset.go) { e.preventDefault(); portalTab(t.dataset.go); window.scrollTo(0, 0); return; }
  if (t.matches('[data-agregar]')) { e.preventDefault(); if (window.__mcAbrirForm) window.__mcAbrirForm(); return; }
  if (t.dataset.seguir) {
    e.preventDefault(); t.disabled = true;
    if (!(await seguirCartera(t.dataset.seguir, t.dataset.nombre, t.dataset.on !== '1'))) t.disabled = false;
    return;
  }
  if (t.dataset.compra) {
    e.preventDefault();
    const sym = t.dataset.compra, host = t.closest('[data-host]') || t.parentElement;
    const viejo = host.querySelector('.vp-form'); if (viejo) { viejo.remove(); return; }
    host.insertAdjacentHTML('beforeend', formCompra(sym, t.dataset.px ? Number(t.dataset.px) : null));
    host.querySelector('[data-cant]').focus();
    return;
  }
  if (t.dataset.ok) { e.preventDefault(); t.disabled = true; await registrarCompra(t.dataset.ok, t.closest('.vp-form')); t.disabled = false; return; }
  if (t.dataset.cancel) { e.preventDefault(); t.closest('.vp-form').remove(); return; }
  if (t.matches('.vp-seg button[data-cur]')) {
    try { localStorage.setItem('valtia-mc-cur', t.dataset.cur); } catch (x) {}
    pintarEncabezado();
    refrescar('inicio', 'empresas', 'herramientas');
    if (window.__mcRecargar) window.__mcRecargar();
  }
});

/* ───────────────────────── helpers de tenencias ───────────────────────── */
function tenencias(cc, bset) {
  const pos = cc.pos || [];
  // renta fija: si hay bonosSet manda el panel; si no, el regex de activos.js
  return {
    radar: new Set(pos.map(p => radarSym(p.ticker))),
    fichas: new Set(pos.map(p => tickerFicha(p.ticker)).filter(Boolean)),
    pares: new Set(pos.filter(p => esRentaFija(p.ticker, bset)).map(p => parBono(base(p.ticker)))),
    especies: new Set(pos.filter(p => esRentaFija(p.ticker, bset)).map(p => base(p.ticker))),
  };
}
/* los sellos de los precios del usuario, en milisegundos: el del más viejo y el
   del más nuevo (null si no hay ninguno legible). Son DOS preguntas distintas y
   por eso hay dos números:
     · "¿qué tan al día está lo que estoy mirando?" → manda el MÁS VIEJO: decir
       "actualizados recién" porque uno de siete se refrescó recién sería mentir
       sobre el resto;
     · "¿está abierto el mercado?" → manda el MÁS NUEVO: alcanza con que HAYA
       llegado un precio para saber que la rueda corre. Con el más viejo, un
       solo ticker que el sync dejó de actualizar dejaba el cartel en "cerrado"
       un martes a las 13:00 con todo lo demás refrescándose cada 15 minutos.
   Un sello ilegible se descarta solo: un único valor raro daba NaN y se llevaba
   puesta la frescura de todas las demás posiciones (y con ella el cartel). */
function sellosPrecios(precios) {
  const ts = Object.values(precios || {}).map(p => (p || {}).actualizado_utc).filter(Boolean);
  const ms = ts.map(t => {
    try { return new Date(t.seconds ? t.seconds * 1000 : t).getTime(); } catch (e) { return NaN; }
  }).filter(x => isFinite(x));
  return ms.length ? { viejo: Math.min(...ms), nuevo: Math.max(...ms) } : null;
}
const frescuraMs = precios => { const s = sellosPrecios(precios); return s ? s.viejo : null; };
const ultimoPrecioMs = precios => { const s = sellosPrecios(precios); return s ? s.nuevo : null; };
function frescura(precios) {
  const ms = frescuraMs(precios);
  if (ms == null) return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'precios actualizados recién';
  if (min < 60) return `precios actualizados hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `precios actualizados hace ${h} h` : 'precios del ' + new Date(ms).toLocaleDateString('es-AR');
}

/* ── ¿el mercado argentino está abierto? ──────────────────────────────────────
   Abierto = día hábil, entre las 11:00 y las 17:00 de Buenos Aires, Y algún
   precio del usuario actualizado hace menos de 30 minutos (el más nuevo: ver
   sellosPrecios). Que lleguen precios es lo que resuelve los feriados: un 25 de
   mayo cae en la franja horaria pero no llega nada nuevo, así que el cartel dice
   "cerrado" sin que haya que mantener un calendario de feriados.

   La hora es SIEMPRE la de Buenos Aires (UTC−3, sin horario de verano), con el
   mismo truco que hoyAR(): se corre el instante tres horas y se lee en UTC. La
   zona horaria de la computadora del visitante no entra en la cuenta.

   Sin dato de frescura no hay cartel: preferimos no decir nada antes que
   adivinar. Y dentro de la franja con precios viejos tampoco prometemos cuándo
   vuelve a abrir (si es feriado, no sabemos si mañana también lo es): se dice
   "cerrado" y la frescura del encabezado explica el resto. */
const RUEDA_DESDE = 11, RUEDA_HASTA = 17;
const FRESCO_MIN = 30;
const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ahoraAR = () => new Date(Date.now() - 3 * 3600e3);   // ojo: leerlo con getUTC*
const habilAR = d => d >= 1 && d <= 5;
function proximaApertura(a) {
  const dia = a.getUTCDay();
  if (habilAR(dia) && a.getUTCHours() < RUEDA_DESDE) return `abre hoy ${RUEDA_DESDE}:00`;
  let n = 1;
  while (n < 8 && !habilAR((dia + n) % 7)) n++;
  return `abre ${n === 1 ? 'mañana' : 'el ' + DIAS_SEM[(dia + n) % 7]} ${RUEDA_DESDE}:00`;
}
const SESGO_MIN = 5;   // desfasaje de reloj que se tolera sin borrar el cartel
function estadoMercado(ms) {
  if (ms == null || !isFinite(ms)) return null;
  const min = (Date.now() - ms) / 60000;
  // un reloj unos minutos adelantado es normal y no tiene que hacer desaparecer
  // el cartel; uno MUY adelantado sí: ahí no sabemos qué tan viejo es el precio
  if (!(min >= -SESGO_MIN)) return null;
  const edad = Math.max(0, min);
  const a = ahoraAR(), h = a.getUTCHours();
  const enRueda = habilAR(a.getUTCDay()) && h >= RUEDA_DESDE && h < RUEDA_HASTA;
  if (enRueda) return edad < FRESCO_MIN
    ? { abierto: true, txt: 'Mercado abierto', cuando: '' }
    : { abierto: false, txt: 'Mercado cerrado', cuando: '' };
  return { abierto: false, txt: 'Mercado cerrado', cuando: proximaApertura(a) };
}
function cartelMercado() {
  const e = estadoMercado(S.ultimoPrecioMs);
  if (!e) return '';
  return `<span class="vp-mkt ${e.abierto ? 'on' : 'off'}" data-mkt><i></i>${esc(e.txt)}${e.cuando ? `<em>${esc(e.cuando)}</em>` : ''}</span>`;
}
/* la hora avanza y los precios envejecen aunque nadie toque el panel: el cartel
   se repinta solo (y solo él, para no robarle el foco a los botones de moneda) */
setInterval(() => {
  const h = $('vp-enc'); if (!h) return;
  const viejo = h.querySelector('[data-mkt]'), nuevo = cartelMercado();
  if (!nuevo) { if (viejo) viejo.remove(); return; }
  if (viejo) { viejo.outerHTML = nuevo; return; }
  // todavía no había cartel (recién llega el primer sello de precios): se mete
  // al arranque de la línea de abajo en vez de rehacer el encabezado entero,
  // que es justamente lo que le sacaría el foco a los botones de moneda
  if (!CON_MONEDA.has(_tab)) return;
  const sub = h.querySelector('.sub');
  if (sub) sub.insertAdjacentHTML('afterbegin', nuevo);
}, 60000);

/* ───────────────────────── INICIO ───────────────────────── */
// El Resumen es el pantallazo de como vienen SUS inversiones: un solo bloque
// de estado (manda el valor, y de el cuelgan resultado, rendimiento e
// invertido), la composicion como barras con leyenda y los avisos abajo con
// etiqueta propia. Antes eran cuatro KPIs sueltos y una fila de chips donde
// el broker competia con "falta un precio".
const fmtC = iso => { const [aa, mm, dd] = String(iso || '').slice(0, 10).split('-'); return dd && mm ? `${dd}/${mm}` : String(iso || ''); };
const COLB = ['#B08A3E', '#4E6E9E', '#6FA287', '#D8B87A', '#9B7BA8', '#8C8477'];
const COLM = { ARS: '#9EC7A8', USD: '#3F8F63' };

/* Las alertas por mail de tus activos (alertas_cartera.py) se configuran en Mi
   cuenta: panel-cuenta.js lee y escribe inversores/{email}/alertas/config. Hasta el
   27/09/2026 vivían al final del Resumen (alertasMail(), que ya no existe). */

/* ── contadores del sidebar: cuanto hay detras de cada seccion ── */
// la misma pastilla en el lateral y en la barra del celular
function contadorNav(id, txt, tit) {
  document.querySelectorAll(`.portal-nav a[data-tab="${id}"], #vp-mbar a[data-mt="${id}"]`).forEach(a => {
    let s = a.querySelector('.vp-n');
    if (!txt) { if (s) s.remove(); a.removeAttribute('title'); return; }
    if (!s) { s = document.createElement('span'); s.className = 'vp-n'; a.appendChild(s); }
    s.textContent = txt;
    if (tit) a.title = tit;
  });
}
// la pastilla de la Lista de espera PRO: los pedidos sin contactar. Solo para el admin (a
// cualquier otro no se le lee waitlistPro) y aparte de contadores(), que no corre si la
// cartera no se pudo leer. panel-espera.js la vuelve a poner al marcar o deshacer
function pastillaEspera() {
  if (!S.isAdmin) return;
  const email = S.email;
  Promise.resolve().then(() => contarSinContactar(ctx)).then(n => {
    if (S.email !== email) return;
    n = Number(n) || 0;
    contadorNav('espera', n ? String(n) : '', n ? `${n} pedido${n === 1 ? '' : 's'} sin contactar` : '');
  }, () => {});
}
// los precios que ya se evaluaron contra las alertas de precio (ver contadores). Es por
// OBJETO: cartera() los cachea toda la sesión y devuelve el mismo objeto hasta que alguien
// hace invalidar('cartera'); una lectura nueva es un objeto nuevo y se evalúa una vez
const _preciosEvaluados = new WeakSet();
// el precio del toast como lo muestra la pestaña Alertas: money() y, por debajo de 1
// (cripto chica), fmtPrecio con sus cifras significativas ("US$0,01292", no "US$0,01")
const fmtAlerta = (n, m) => Math.abs(Number(n)) < 1 ? fmtPrecio(n, m) : money(n, m);
async function contadores(cc, disc, bset) {
  // alertas de precio: se evalúan también acá, con los precios que leyó el panel, para
  // que una que saltó quede marcada aunque el usuario no abra Mi cartera (que evalúa en
  // cada repintado, por instalarEvaluacion). Sin await: la pastilla no espera. La misma
  // alerta no salta dos veces (alertas-precio.js lleva la cuenta y la regla lo impide).
  // Solo la PRIMERA vez que llegan estos precios, recién leídos: contadores() corre en
  // cada refrescar('alertas'|'inicio'|'disciplina') y cc.precios es la caché de cartera(),
  // que no se relee sola. Evaluar de nuevo esa caché horas después haría saltar una
  // alerta recién creada con un precio viejo (abierto a las 10 con GGAL a $5.100, a las
  // 15 está a $4.800, el usuario crea "sube de $5.000" y saltaba "está en $5.100")
  try {
    const email = S.email, px = cc.precios;
    if (email && S.verificado && px && typeof px === 'object' && !_preciosEvaluados.has(px)) {
      _preciosEvaluados.add(px);
      evaluarConPrecios(email, px).then(saltaron => {
        if (!saltaron.length || S.email !== email) return;   // cambió la cuenta mientras tanto
        saltaron.forEach(a => { try { toast(fraseDisparo(a, fmtAlerta)); } catch (e) {} });
        refrescar('alertas');
      }).catch(() => {});
    }
  } catch (e) {}
  // una pastilla por ACTIVO, no por compra: dos compras de GGAL son un activo. La clave
  // es la de la tabla de Mi cartera (agruparPorActivo: ticker en mayúsculas + factor)
  const n = agruparPorActivo(cc.r.filas, cc.r.total).length;
  contadorNav('micartera', n ? String(n) : '', n ? `${n} activo${n === 1 ? '' : 's'} en tu cartera` : '');
  if (disc && disc.config) {
    const mes = hoyAR().slice(0, 7), obj = Math.max(1, Number(disc.config.compras) || 1);
    const hechas = (disc.log || []).filter(c => String(c.fecha || '').slice(0, 7) === mes).length;
    contadorNav('disciplina', `${hechas}/${obj}`, `compras de este mes: ${hechas} de ${obj}`);
  }
  try {
    const z = (await radar()).filter(a => a.entrada).length;
    contadorNav('comprar', z ? z + ' \u25ce' : '', `${z} activos en zona de compra`);
  } catch (e) {}
  // la pastilla de Alertas suma las dos cosas nuevas de esa pestaña: las alertas de las
  // carteras que todavía no leyó (solo las que su plan le deja leer) y sus alertas de
  // precio que saltaron y todavía no vio. Lo que no se pueda leer cuenta 0. El title
  // nombra solo lo que hay ("2 alertas sin leer · 1 alerta de precio que saltó")
  try {
    const [sl, sp] = await Promise.all([
      Promise.resolve().then(() => contarNoLeidas(ctx)).then(x => Number(x) || 0, () => 0),
      Promise.resolve().then(() => contarDisparadasNoVistas(ctx)).then(x => Number(x) || 0, () => 0),
    ]);
    const tot = sl + sp;
    const tit = [
      sl ? `${sl} alerta${sl === 1 ? '' : 's'} sin leer` : '',
      sp ? `${sp} alerta${sp === 1 ? '' : 's'} de precio que ${sp === 1 ? 'salt\u00f3' : 'saltaron'}` : '',
    ].filter(Boolean).join(' \u00b7 ');
    contadorNav('alertas', tot ? String(tot) : '', tit);
  } catch (e) {}
  try {
    const ts = (await teaser()) || [];
    const vis = ts.filter(x => x.visibilidad === 'publico' || S.pro).length;
    contadorNav('carteras', vis ? String(vis) : '', `${vis} cartera${vis === 1 ? '' : 's'} con tu plan`);
  } catch (e) {}
  try {
    const h = hoyAR(), hasta = new Date(Date.parse(h + 'T12:00:00Z') + 30 * 864e5).toISOString().slice(0, 10);
    const mios = (await eventos(ctx, { desde: h, hasta })).filter(e => e.mio).length;
    contadorNav('agenda', mios ? String(mios) : '', `${mios} evento${mios === 1 ? '' : 's'} de tus activos en los próximos 30 días`);
  } catch (e) {}
}

/* ───────────────────────── QUÉ COMPRAR ───────────────────────── */
function ordenComprar(act) {
  return act.filter(a => a.veredicto && (a.veredicto !== 'Sin cobertura' || a.entrada))
    .sort((x, y) => (y.entrada ? 1 : 0) - (x.entrada ? 1 : 0) || (y.score || 0) - (x.score || 0) || (x.rsi || 99) - (y.rsi || 99));
}

/* en qué carteras Valtia está cada ticker (solo las que el usuario puede leer) */
async function mapaCarteras() {
  const out = {};
  const ts = (await teaser()) || [];
  await Promise.all(ts.map(async t => {
    if (t.visibilidad !== 'publico' && !S.pro) return;
    const pos = (await posicionesCartera(t.id)) || [];
    pos.forEach(p => { const k = String(p.ticker || '').toUpperCase(); (out[k] = out[k] || []).push(t.codigo || t.nombre); });
  }));
  return out;
}

/* ───────────────────────── CARTERAS VALTIA ───────────────────────── */
const RIESGO = { conservador: 'Riesgo bajo', moderado: 'Riesgo medio', agresivo: 'Riesgo alto' };
const PERFIL = { 'renta-fija': 'Renta fija', 'renta-mixta': 'Renta mixta', 'renta-variable': 'Renta variable' };
/* Comparación contra las carteras que sigue: qué le falta y con qué peso.
   Solo de las que puede leer (la regla de Firestore manda). */
async function compararSeguidas(ts, cc, bset, seg) {
  const box = $('vp-comparar');
  if (!box) return;
  const ids = Object.keys(seg || {});
  if (!ids.length) {
    box.innerHTML = `<p class="vp-nota">Todavía no seguís ninguna. Al seguir una cartera, el panel te avisa cuando rota y te muestra acá qué te falta para replicarla.</p>`;
    return;
  }
  const total = cc.r.total || 0;
  const bloques = await Promise.all(ids.map(async id => {
    const t = ts.find(x => x.id === id);
    const nombre = (t && t.nombre) || (seg[id] || {}).nombre || id;
    if (t && t.visibilidad !== 'publico' && !S.pro) {
      return `<div class="vp-card"><h4>${esc(nombre)}</h4><p>Seguís esta cartera. Su composición es de Valtia PRO.</p>
        <a class="vp-ir" href="/planes">Ver planes →</a></div>`;
    }
    const pos = (await posicionesCartera(id)) || [];
    if (!pos.length) return '';
    const ten = tenencias(cc, bset);
    const filas = pos.map(p => {
      const k = String(p.ticker || '').toUpperCase();
      const rf = esRentaFija(k, bset);
      const tengo = rf ? ten.pares.has(parBono(base(k))) : (ten.fichas.has(k) || ten.radar.has(radarSym(k)));
      // peso real de ese activo en la cartera del usuario
      const fk = tickerFicha(k), rk = radarSym(k);
      const mio = cc.r.filas.filter(f => {
        if (rf) return esRentaFija(f.ticker, bset) && parBono(base(f.ticker)) === parBono(base(k));
        if (esRentaFija(f.ticker, bset)) return false;
        // ojo: tickerFicha devuelve null para lo que Valtia no cubre, y
        // null === null daba "es el mismo activo" para dos cosas distintas
        return (fk && tickerFicha(f.ticker) === fk) || radarSym(f.ticker) === rk;
      }).reduce((a, f) => a + (f.dValor || 0), 0);
      const pesoMio = total > 0 ? mio / total * 100 : null;
      const objetivo = Number(p.pesoObjetivo || 0) * 100;
      return { k, tengo, pesoMio, objetivo, dif: pesoMio != null ? pesoMio - objetivo : null };
    }).sort((a, b) => b.objetivo - a.objetivo);
    const faltan = filas.filter(f => !f.tengo);
    return `<div class="vp-card" style="grid-column:1/-1">
      <div class="l">Comparación · ${esc(nombre)}</div>
      <h4>Tenés ${filas.length - faltan.length} de ${filas.length}</h4>
      <div class="vp-tblwrap" style="margin-top:10px;background:transparent;border:none">
        <table class="vp-tbl" style="min-width:420px"><thead><tr>
          <th class="l">Activo</th><th>Peso objetivo</th><th>Tu peso</th><th class="l">Estado</th></tr></thead>
        <tbody>${filas.map(f => `<tr>
          <td class="l">${(h => h ? `<a class="tk" href="${h}">${esc(base(f.k))}</a>` : `<span class="tk">${esc(base(f.k))}</span>`)(linkDe(f.k, bset))}</td>
          <td>${f.objetivo ? f.objetivo.toFixed(0) + '%' : '—'}</td>
          <td>${f.pesoMio != null && f.pesoMio > 0 ? num(f.pesoMio, 1) + '%' : '—'}</td>
          <td class="l">${f.tengo
            ? (f.dif != null && Math.abs(f.dif) > 5
                ? `<span class="vp-tag ${f.dif > 0 ? 'cara' : 'precio'}">${f.dif > 0 ? 'te pasás' : 'te falta'} ${Math.abs(f.dif).toFixed(0)} pts</span>`
                : '<span class="vp-tag tengo">en línea</span>')
            : '<span class="vp-tag zona">no la tenés</span>'}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <p class="vp-nota">Tu peso se calcula sobre el total de tu cartera, incluidas las posiciones que no son de esta cartera modelo. Por eso los porcentajes propios suelen dar más bajos que el objetivo.</p>
    </div>`;
  }));
  const html = bloques.filter(Boolean).join('');
  box.innerHTML = html ? `<div class="vp-sec">Comparación con lo que seguís</div><div class="vp-grid">${html}</div>` : '';
}

/* ───────────────────────── MIS EMPRESAS ───────────────────────── */
async function renderEmpresas() {
  const el = $('tab-empresas');
  el.innerHTML = '<p class="vp-cargando">Cruzando tu cartera con informes, noticias y agenda…</p>';
  const cc = await carteraCalc();
  if (!cc.pos.length) {
    el.innerHTML = `<p class="vp-sub">Acá vas a ver, para cada activo que tengas, el informe Valtia, las últimas noticias y su próximo evento (resultados, cupón o vencimiento).</p>
      <div class="vp-card" style="max-width:520px"><h4>Todavía no cargaste posiciones</h4><p>Cargá tu cartera y esta sección se arma sola.</p><a class="vp-ir" href="#panel/micartera" data-go="micartera">Ir a Mi cartera →</a></div>`;
    return;
  }
  const [cal, bset, bp, fl, inf, pi, dg] = await Promise.all([calendario(), bonosSet(), panelBonos(), flujos(), informes(), preciosInf(), desglosePer()]);
  const m = curMoneda(cc.cur), hoy = hoyAR();
  // agrupar lotes por activo
  const grupos = new Map();
  cc.r.filas.forEach(f => {
    const rf = esRentaFija(f.ticker, bset);
    const k = rf ? base(f.ticker) : (tickerFicha(f.ticker) || base(f.ticker));
    if (!grupos.has(k)) grupos.set(k, { k, rf, filas: [], valor: 0, pl: 0, tieneValor: false, conPl: false, sinCosto: false });
    const g = grupos.get(k); g.filas.push(f);
    if (f.dValor != null) {
      g.valor += f.dValor; g.tieneValor = true;
      // sin precio de compra el "resultado" sería todo el valor: no entra (el mismo
      // criterio que el gráfico de resultado por activo de Mi cartera)
      if (f.dPl != null && Number(f.precioCompra) > 0) { g.pl += f.dPl; g.conPl = true; }
      else g.sinCosto = true;
    }
  });
  const porTicker = {}; (inf || []).forEach(d => { if (d.ticker) (porTicker[String(d.ticker).toUpperCase()] = porTicker[String(d.ticker).toUpperCase()] || []).push(d); });
  const cards = [...grupos.values()].sort((a, b) => b.valor - a.valor).map(g => {
    const cant = g.filas.reduce((s, f) => s + (Number(f.cantidad) || 0), 0);
    const ver = g.filas.map(f => f.px && f.px.veredicto).find(Boolean);
    let evento = '', extra = '', link = null, nombre = g.k;
    if (g.rf) {
      const esp = base(g.k), par = parBono(esp);
      // el Bopreal viene en su propia lista, sin ley ni paridad
      const bop = (bp.bopreal || []).find(b => b.s === esp || parBono(b.s) === par) || null;
      const sob = bop ? null : (bp.soberanos || []).find(b => parBono(b.s) === par && /D$/.test(b.s)) || null;
      const letra = (bp.tasa_fija || []).find(l => l.s === esp) || null;
      link = 'bono.html?e=' + encodeURIComponent(especieBono(esp));
      nombre = letra ? 'Letra a tasa fija' : bop ? 'Bopreal (BCRA)' : sob ? `Soberano ley ${sob.ley || 'AR'}` : 'Renta fija';
      if (sob) extra = `<p>TIR <b>${num(sob.tir, 1)}%</b> · paridad ${num(sob.paridad, 1)} · MD ${num(sob.md, 1)} · vence ${fmtF(sob.vence)}</p>`;
      if (bop) extra = `<p>TIR <b>${num(bop.tir, 1)}%</b>${bop.md != null ? ` · MD ${num(bop.md, 1)}` : ''} · vence ${fmtF(bop.vence)}</p>`;
      if (letra) extra = `<p>${letra.tem != null ? `TEM <b>${num(letra.tem, 2)}%</b> · TIREA ${num(letra.tirea, 1)}% · ` : ''}vence ${fmtF(letra.vence)}${letra.vpv ? ` · paga $ ${num(letra.vpv, 2)} por 100 VN${letra.vpv_estimado ? ' (estimado)' : ''}` : ''}</p>`;
      const d = fl[esp] || fl[par];
      if (d && d.flujos) {
        const prox = d.flujos.find(([f]) => f >= hoy);
        if (prox) evento = `💵 Próximo pago ${fmtF(prox[0])}: ~US$${(cant * Number(prox[1]) / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })} por tus ${cant.toLocaleString('es-AR')} VN (estimado)`;
      } else if (letra && letra.vence >= hoy) evento = `⏳ Vence el ${fmtF(letra.vence)} (${enDias(letra.vence)} días)`;
    } else {
      const f = tickerFicha(g.k);
      link = f ? 'activo.html?t=' + f : null;
      nombre = nombreDe(g.k);
      const e = cal.find(c => c.ficha === f && c.fecha >= hoy);
      if (e) evento = `📅 Resultados el ${fmtF(e.fecha)} (${enDias(e.fecha) === 0 ? 'hoy' : 'en ' + enDias(e.fecha) + ' días'})`;
      const docs = (porTicker[f] || []).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      const emp = EMPRESAS.find(x => x.ticker === f);
      // el precio de publicación está en dólares (el ADR): comparar contra el
      // precio en dólares de hoy, NUNCA contra el de una posición en pesos
      const pxUsd = f && pi[f] && pi[f].p != null ? pi[f].p : null;
      if (docs.length) extra = `<p>📄 <a href="/activo?t=${f}#informe" style="color:var(--v3-gold)">${esc(docs[0].titulo)}</a> · ${fmtF(docs[0].fecha)}${docs[0].precio_pub && pxUsd ? ` · ${pct((pxUsd / docs[0].precio_pub - 1) * 100, 1)} desde su publicación` : ''}</p>`;
      else if (emp && emp.slug) extra = `<p>📄 Informe Valtia disponible con PRO · <a href="/activo?t=${f}#informe" style="color:var(--v3-gold)">ver la ficha</a></p>`;
      else if (f) extra = `<p class="vp-mut">Sin informe Valtia todavía · <a href="mailto:soporte@valtia.tech?subject=Análisis de ${f}" style="color:var(--v3-gold)">pedir este análisis</a></p>`;
      else extra = `<p class="vp-mut">Sin ficha en Valtia para este ticker.</p>`;
    }
    return `<div class="vp-card" data-emp="${esc(g.k)}"><div class="l">${esc(g.k)}${ver ? ` · <span class="vp-tag ${verCls(ver)}" style="padding:1px 6px">${esc(ver)}</span>` : ''}</div>
      <h4>${link ? `<a href="${link}" style="color:inherit;text-decoration:none">${esc(nombre)}</a>` : esc(nombre)}</h4>
      <p>${cant.toLocaleString('es-AR')} ${g.rf ? 'VN' : 'unid.'}${g.tieneValor ? ` · <b>${money(g.valor, m)}</b> · ${g.conPl
        ? `<span class="${cls(g.pl)}">${moneyS(g.pl, m)}</span>${g.sinCosto ? ' <span class="vp-mut">(sin las compras que no tienen precio de compra)</span>' : ''}`
        : '<span class="vp-mut" title="Sin precio de compra no se puede calcular el resultado">resultado —</span>'}` : ' · esperando precio'}</p>
      ${(() => {
        // variación del PRECIO por período (no es el resultado de la persona)
        if (g.rf) return '';
        const d = desglose(g.filas[0].ticker, dg, g.filas[0].px, g.filas[0]);
        const ver = ['dia', 'mes', 'anio'].map(k => d.find(x => x.clave === k)).filter(x => x && x.pct != null);
        return ver.length ? `<p class="vp-mut" style="font-size:12px;margin-top:4px">El activo: ${ver.map(x =>
          `${x.label.toLowerCase()} <b class="${x.pct >= 0 ? 'vp-pos' : 'vp-neg'}">${pct(x.pct)}</b>`).join(' · ')}</p>` : '';
      })()}
      ${extra}
      ${evento ? `<p style="margin-top:6px">${evento}</p>` : ''}
      <div data-noticias="${esc(g.rf ? '' : (tickerFicha(g.k) || ''))}"></div>
      ${link ? `<a class="vp-ir" href="${link}">Ver ficha completa →</a>` : ''}</div>`;
  });
  el.innerHTML = `<p class="vp-sub">Todo lo que Valtia sabe de cada activo que tenés: informe, noticias y próximo evento.</p>
    <div class="vp-grid">${cards.join('')}</div>`;
  noticiasDeMisEmpresas(el);
}

async function noticiasDeMisEmpresas(el) {
  const boxes = [...el.querySelectorAll('[data-noticias]')].filter(b => b.dataset.noticias);
  if (!boxes.length) return;
  const ns = (await noticias()) || [];
  boxes.forEach(b => {
    const emp = EMPRESAS.find(x => x.ticker === b.dataset.noticias);
    if (!emp || !emp.claves) return;
    const hits = ns.filter(n => { const t = (String(n.titulo) + ' ' + String(n.resumen || '')).toLowerCase(); return emp.claves.some(k => t.includes(k)); }).slice(0, 3);
    if (!hits.length) return;
    b.innerHTML = `<div style="margin-top:8px;font-size:12.5px;line-height:1.6">${hits.map(n => `📰 <a href="/nota?n=${esc(n.id)}" style="color:var(--v3-ink);text-decoration:none">${esc(n.titulo)}</a> <span class="vp-mut">· ${fmtF(n.fecha)}</span>`).join('<br>')}</div>`;
  });
}

/* ───────────────────────── DISCIPLINA ───────────────────────── */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesAnterior = m => { let [a, mm] = m.split('-').map(Number); mm--; if (!mm) { mm = 12; a--; } return a + '-' + String(mm).padStart(2, '0'); };
/* ───────────────────────── HERRAMIENTAS Y DATOS ───────────────────────── */
async function renderHerramientas() {
  const el = $('tab-herramientas');
  el.innerHTML = '<p class="vp-cargando">Cargando…</p>';
  const cc = await carteraCalc();
  const bp = await panelBonos(), bset = await bonosSet();
  const rd = (await radarDoc()) || {};
  const porSym = {};
  (rd.activos || []).forEach(a => { porSym[a.sym] = a; });
  const m = curMoneda(cc.cur);
  let datos = '';
  if (cc.pos.length) {
    const filas = [...new Map(cc.r.filas.map(f => [String(f.ticker).toUpperCase(), f])).values()].filter(f => f.px);
    const fila = f => {
      const px = f.px, rf = esRentaFija(f.ticker, bset);
      const sob = rf ? [...(bp.soberanos || []), ...(bp.bopreal || [])].find(b => parBono(b.s) === parBono(base(f.ticker)) && /D$/.test(b.s)) : null;
      const letra = rf ? (bp.tasa_fija || []).find(l => l.s === base(f.ticker)) : null;
      const link = linkDe(f.ticker, bset);
      return `<tr><td class="l">${link ? `<a class="tk" href="${link}">${esc(base(f.ticker))}</a>` : `<span class="tk">${esc(base(f.ticker))}</span>`}<span class="nm">${esc(px.nombre || nombreDe(f.ticker))}</span></td>
        <td>${px.precio != null ? num(px.precio, 2) : '—'} <span class="vp-mut">${esc(px.moneda || '')}</span></td>
        <td class="l">${px.veredicto ? `<span class="vp-tag ${verCls(px.veredicto)}">${esc(px.veredicto)}</span>` : '—'}</td>
        ${rd.pro ? (() => { const ra = porSym[radarSym(f.ticker)] || {};
          return `<td>${rf ? (sob ? 'TIR ' + num(sob.tir, 1) + '%' : letra && letra.tem != null ? 'TEM ' + num(letra.tem, 2) + '%' : '—') : (ra.per != null ? num(ra.per, 1) + 'x' : '—')}</td>
        <td>${rf ? (sob ? 'MD ' + num(sob.md, 1) : letra ? 'vence ' + fmtF(letra.vence) : '—') : (ra.pb != null ? num(ra.pb, 1) + 'x' : '—')}</td>
        <td>${rf ? (sob ? 'paridad ' + num(sob.paridad, 1) : '—') : (ra.roe != null ? num(ra.roe, 1) + '%' : '—')}</td>
        <td>${rf ? '—' : (ra.deudaEbitda != null ? num(ra.deudaEbitda, 1) + 'x' : '—')}</td>
        <td>${rf ? '—' : (ra.beta != null && ra.betaR2 >= 0.10 ? num(ra.beta, 2) : '—')}</td>
        <td>${ra.valorScore ?? '—'}</td>`; })() : `<td>${px.rsi != null ? num(px.rsi, 0) : '—'}</td>`}
      </tr>`;
    };
    datos = `<p class="vp-sub">Lo que el sync sabe de cada uno de tus activos${S.pro ? '' : ' · ratios completos con PRO'}. El mapa de calor, el radar, los bonos y el dólar histórico están en <a href="/herramientas" style="color:var(--v3-gold)">Herramientas y datos ↗</a>.</p>
      <div class="vp-tblwrap"><table class="vp-tbl"><thead><tr><th class="l">Activo</th><th>Precio</th><th class="l">Lectura</th>${rd.pro ? '<th>PER / TIR</th><th>P/Libro / MD</th><th>ROE / paridad</th><th>Deuda/EBITDA</th><th>Beta</th><th>Valor</th>' : '<th>RSI</th>'}</tr></thead>
      <tbody>${filas.map(fila).join('') || '<tr><td colspan="9" class="l vp-mut">Tus posiciones todavía no tienen datos del sync (9:00).</td></tr>'}</tbody></table></div>
      ${!rd.pro ? `<p class="vp-nota">Con PRO ves PER, P/Libro, ROE, deuda sobre EBITDA y beta de tus acciones, y TIR, duration y paridad de tus bonos. <a href="/planes" style="color:var(--v3-gold)">Ver planes →</a></p>` : `<p class="vp-nota">Múltiplos de yfinance al último cierre; para renta fija, la matemática propia del panel de bonos (cada 15 min en rueda).</p>`}`;
  }
  el.innerHTML = datos || `<div class="vp-card" style="max-width:560px"><h4>Todavía no cargaste posiciones</h4><p>Cuando cargues tu cartera, acá vas a ver el precio, la lectura y los ratios de cada activo. Las herramientas del sitio están en <a href="/herramientas" style="color:var(--v3-gold)">Herramientas y datos ↗</a>.</p><a class="vp-ir" href="#panel/micartera" data-go="micartera">Ir a Mi cartera →</a></div>`;
}

/* ── Contexto para los módulos de cada pestaña (panel-*.js) ────────────────────
   Cada módulo exporta render<Pestaña>(el, ctx) y NO importa panel.js (sería un
   import circular): todo lo que necesita del panel le llega acá. Los datos son los
   mismos getters cacheados por cuenta que usa el resto del panel. */
const ctx = {
  get S() { return S; },
  $, esc, hoyAR, enDias, fmtF, fmtC, money, moneyS, pct, num, cls, verCls,
  curVista, curEtq, curMoneda, BROKERS, brokerPref, DATALIST, RIESGO, PERFIL, MESES, mesAnterior, EMPRESAS,
  toast, invalidar, refrescar, portalTab,
  // la pastilla de una pestaña en el lateral y en la barra del celular:
  //   ctx.contadorNav('espera', '3', '3 pedidos sin contactar')   ·   ('espera', '') la saca
  contadorNav,
  radarDoc, radar, teaser, calendario, flujos, panelBonos, preciosInf, desglosePer, bonosSet, vencMapa, vencimientoDe,
  fx, carteraCalc, ventas, ajustes, disciplina, informes, noticias, seguidas, posicionesCartera, precioHoy,
  // la cartera tal cual está guardada, sin calcular nada: { pos: [docs de
  // inversores/{email}/cartera con su id], precios: { TICKER: precios/{TICKER} } }.
  // Es la misma lectura cacheada que usa carteraCalc() (null si la lectura falló).
  // Movimientos la usa para listar las compras en la moneda en que se hicieron.
  cartera,
  // esqueleto de carga (SPEC «Estados»: bloques #F0EDE5 con la altura de lo que viene).
  //   ctx.skel(96, [64, 64, 64, 64], 300) → una fila de 96 px, una fila de cuatro
  //   bloques de 64 px y un bloque de 300 px. Lleva role="status" y un texto para
  //   los lectores de pantalla.
  skel: (...alturas) => `<div class="vp-skel-w" role="status" aria-label="Cargando">${alturas.map(a => Array.isArray(a)
    ? `<div class="vp-skel-fila">${a.map(h => `<span class="vp-skel" style="height:${Number(h) || 60}px"></span>`).join('')}</div>`
    : `<span class="vp-skel" style="height:${Number(a) || 60}px"></span>`).join('')}</div>`,
  // lo que se movió la cartera HOY. NO es una cuenta nueva: suma el dHoy que
  // calcular() (mi-cartera.js) ya dejó en cada fila, que es exactamente lo que
  // pinta la columna "Hoy" de la tabla de Mi cartera. Está documentado arriba
  // de variacionDia().
  //   const d = await ctx.variacionDia(cc);   // cc = await ctx.carteraCalc()
  //   d.monto / d.pct → el total del día en la moneda de cc.cur (null si nada trae variación)
  //   d.porId[pos.id] → { ticker, d, monto, previo } de esa posición
  //   d.con / d.sin / d.sinTickers → qué quedó afuera, para poder aclararlo
  // Ojo: no lee nada de Firestore ni cachea; todo sale del cc que le pasás, así
  // que cambia con la moneda del encabezado igual que cc.r.
  variacionDia,
  // qué tipo de activo es cada ticker, con UN solo criterio para todo el panel
  // (tipos-activo.js). Mi cartera, el Resumen y Movimientos usan esto y no una
  // regla propia, así el mismo activo no es "CEDEAR" acá y "Acción" allá.
  //   ctx.tipoActivo('NVDA.BA', { bonos: await ctx.bonosSet(), panel: await ctx.panelBonos() })
  //     → { k:'cedear', n:'CEDEAR', grupo:'CEDEARs', mercado:'byma', sub:'CEDEAR · BYMA' }
  //   ctx.GRUPOS_TIPO → [['cedear','CEDEARs'], ['accion','Acciones'], ...] en el orden en que se listan
  tipoActivo, GRUPOS_TIPO,
  // la serie histórica del dólar, [[fecha, venta], ...], la misma que lee
  // cargarEvolucion() en mi-cartera.js (historialInformes/_ccl y _mep).
  //   const ccl = await ctx.serieFx('ccl');   // o 'mep'
  // Cacheada por cuenta como los demás getters; [] si el doc no existe y null si la
  // lectura falla (cached() borra esa entrada y la próxima llamada reintenta).
  serieFx: cual => cached('sfx-' + cual, async () => {
    const s = await getDoc(doc(db(), 'historialInformes', cual === 'mep' ? '_mep' : '_ccl'));
    return s.exists() ? JSON.parse(s.data().json || '[]') : [];
  }),
  tenencias, frescura, ordenComprar, mapaCarteras, compararSeguidas,
  // guarda la regla de inversión mensual ({ aporte US$/mes, compras por mes }). Devuelve
  // true o el mensaje de error. Refresca el plan y el Resumen.
  guardarRegla: async ({ aporte, compras }) => {
    aporte = Number(aporte); compras = Math.round(Number(compras));
    if (!(aporte > 0) || !(compras >= 1 && compras <= 6)) return 'Completá el aporte y las compras por mes (de 1 a 6).';
    try {
      await setDoc(doc(db(), 'inversores', S.email, 'disciplina', 'config'), { aporte, compras, creado: new Date().toISOString() }, { merge: true });
      toast('Regla guardada'); invalidar('disc'); refrescar('disciplina', 'inicio');
      return true;
    } catch (e) { return 'No se pudo guardar (' + String(e.code || e).slice(0, 80) + ').'; }
  },
  // abre Mi cartera con el formulario de alta abierto
  agregarPosicion: () => { portalTab('micartera'); window.scrollTo(0, 0); setTimeout(() => { if (window.__mcAbrirForm) window.__mcAbrirForm(true); }, 50); },
  // abre Mi cartera con la fila de ese activo desplegada (la implementa mi-cartera.js)
  verPosicion: tk => { portalTab('micartera'); window.scrollTo(0, 0); if (window.__mcAbrirFila) window.__mcAbrirFila(tk); },
};
window.__valtiaCtx = ctx;

/* exposición global para los onclick del HTML */
window.portalTab = portalTab;
window.valtiaPanel = { salir, portalTab, iniciarPanel, refrescar: () => { invalidar('cartera', 'disc', 'ventas', 'aj'); refrescar('inicio', 'historial', 'comprar', 'disciplina', 'empresas', 'herramientas', 'carteras', 'agenda'); } };
