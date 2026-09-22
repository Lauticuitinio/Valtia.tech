// panel.js — el panel del inversor de valtia.tech.
// Panel v3 (handoff de Lauti, 21/09/2026): un lateral en tres grupos —Tus
// inversiones, Para decidir, Mercado— y un solo encabezado por pestaña con el
// selector de moneda. El Fondo NO aparece en el panel del inversor: la gestión
// del fondo (fondo-live.js) es otro modo del lateral y solo lo ve el admin.
// Mi cartera vive en mi-cartera.js; acá se reutilizan su cálculo y sus tipos.
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { calcular, agruparPorBroker, normalizarTicker, convertir, reiniciarMiCartera, completarPreciosDeRentaFija }
  from './mi-cartera.js?v=39';
import { fxMercado, registrarImplicito, etiquetaFx } from './fx.js?v=1';
import { resumenVentas, cantidadAjuste } from './ventas.js?v=6';
import { EMPRESAS } from './empresas.js?v=3';
import { renderResumen } from './panel-resumen.js?v=1';
import { renderComprar as renderComprarV3 } from './panel-comprar.js?v=1';
import { renderCarteras as renderCarterasV3 } from './panel-carteras.js?v=1';
import { renderMensual } from './panel-mensual.js?v=1';
import { renderAgenda } from './panel-agenda.js?v=1';
import { eventos } from './panel-eventos.js?v=1';
import { base, radarSym, tickerFicha, esRentaFija, especieBono, parBono, linkDe, nombreDe, desglose, mergeRadar }
  from './activos.js?v=7';

/* ───────────────────────── estilos ───────────────────────── */
const CSS = `
body.fl-app-on nav:not(.portal-nav){display:none!important}
body.fl-app-on #vnav-hot,body.fl-app-on #vnav-menu,body.fl-app-on #vnav-back{display:none!important}
body.fl-app-on{background:var(--panel-bg)}
/* Colores del prototipo Panel v3 como variables: los módulos de cada pestaña usan
   ESTO y no hex sueltos, así el tema oscuro sigue funcionando.
   --v3-navy es el azul de los bloques sólidos (con texto claro encima) y no cambia;
   --v3-serie es el color de la línea de "tu cartera" (azul en claro, dorado en oscuro). */
body.fl-app-on{--v3-bg:#fff;--v3-card:#fff;--v3-line:#E7E3DA;--v3-line2:#E7E3DA;--v3-track:#F6F3EC;--v3-track2:#F6F3EC;
  --v3-ink:#101010;--v3-sub:#57534A;--v3-mut:#8B8375;--v3-navy:#0E1830;--v3-serie:#0E1830;--v3-area:rgba(14,24,48,.06);
  --v3-gold:#B08A3E;--v3-gold2:#8A6A2F;--v3-goldL:#E8CE96;--v3-goldS:#E8CE96;--v3-goldBg:rgba(176,138,62,.14);--v3-goldTint:#F6F3EC;
  --v3-up:#1F7A4D;--v3-upBg:rgba(31,122,77,.12);--v3-dn:#B23A3A;--v3-dnBg:rgba(178,58,58,.1);
  --v3-warn:#9A5A12;--v3-warnBg:rgba(200,120,30,.12);--v3-bench:#8B8375;--v3-cero:#8B8375;--v3-azul:#2B5FB0;
  --v3-hover:#F6F3EC;--v3-hl:#F6F3EC;--v3-navyBg:rgba(14,24,48,.07);--v3-neutro:rgba(139,131,117,.12)}
[data-theme="dark"] body.fl-app-on{--v3-bg:#0B1327;--v3-card:#121E3A;--v3-line:rgba(232,206,150,.16);--v3-line2:rgba(255,255,255,.07);
  --v3-track:rgba(255,255,255,.08);--v3-track2:rgba(255,255,255,.05);--v3-ink:#F4F1EA;--v3-sub:rgba(244,241,234,.74);--v3-mut:rgba(244,241,234,.58);
  --v3-navy:#15254A;--v3-serie:#E8CE96;--v3-area:rgba(232,206,150,.08);--v3-gold:#D9BE85;--v3-gold2:#E8CE96;--v3-goldL:#E8CE96;--v3-goldS:#B08A3E;
  --v3-goldBg:rgba(232,206,150,.14);--v3-goldTint:rgba(232,206,150,.12);--v3-up:#5FCB8E;--v3-upBg:rgba(95,203,142,.14);--v3-dn:#F08A8A;
  --v3-dnBg:rgba(240,138,138,.14);--v3-warn:#E0A93E;--v3-warnBg:rgba(224,169,62,.14);--v3-bench:#9FB0C2;--v3-cero:rgba(244,241,234,.3);
  --v3-hover:rgba(255,255,255,.04);--v3-hl:rgba(232,206,150,.06);--v3-navyBg:rgba(232,206,150,.1);--v3-neutro:rgba(244,241,234,.1);--v3-azul:#8FB3E8}
body.fl-app-on #portal-view{padding:0!important;margin:0!important}
.fl-layout{display:flex;align-items:stretch;gap:0;min-height:calc(100vh - 34px);background:var(--panel-bg)}
/* lateral (232px, navy): medidas y colores del prototipo */
.fl-layout .portal-nav{display:flex;flex-direction:column;align-items:stretch;width:232px;flex:none;box-sizing:border-box;
  height:100vh!important;gap:0!important;border:none!important;background:#0E1830!important;border-radius:0;
  padding:18px 12px 14px!important;position:sticky;top:0;align-self:flex-start;max-height:100vh;overflow:auto}
.fl-layout .portal-nav a[data-tab]{display:flex!important;align-items:center;justify-content:space-between;gap:8px;
  padding:10px 12px!important;margin:0 0 2px!important;border-radius:8px;border-left:2px solid transparent;border-bottom:none!important;
  color:rgba(255,255,255,.62)!important;font:500 11px 'IBM Plex Sans',sans-serif!important;letter-spacing:.1em!important;
  text-transform:uppercase;text-decoration:none;white-space:nowrap}
.fl-layout .portal-nav a[data-tab]:hover{background:rgba(255,255,255,.06);color:#fff!important}
.fl-layout .portal-nav a[data-tab].active{background:rgba(176,138,62,.18);color:#E8CE96!important;border-left-color:#B08A3E;font-weight:600!important}
.fl-layout .portal-nav a.vp-lat-ext{display:flex!important;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px!important;
  margin:0 0 2px!important;border-radius:8px;border-left:2px solid transparent;border-bottom:none!important;color:rgba(255,255,255,.62)!important;
  font:500 11px 'IBM Plex Sans',sans-serif!important;letter-spacing:.1em!important;text-transform:uppercase;text-decoration:none}
.fl-layout .portal-nav a.vp-lat-ext:hover{background:rgba(255,255,255,.06);color:#fff!important}
.vp-flecha{font-size:11px;letter-spacing:0;color:rgba(232,206,150,.7)}
.vp-grp{font:600 8.5px 'IBM Plex Sans',sans-serif;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.5);padding:14px 12px 6px}
.vp-foot{margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:2px}
.fl-layout .portal-nav #portal-user-name{display:block;color:rgba(255,255,255,.85);font:600 11px 'IBM Plex Sans',sans-serif;
  padding:6px 12px 2px;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vp-plan-w{padding:0 12px 8px}
.vp-plan{display:inline-block;font:600 9px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;
  color:#E8CE96;background:transparent;border:1px solid rgba(232,206,150,.45);border-radius:4px;padding:3px 7px}
.vp-plan.pro{background:#E8CE96;color:#0E1830;border-color:#E8CE96}
.fl-layout .portal-nav a.vp-lat-l{display:block!important;padding:5px 12px!important;margin:0!important;border:none!important;border-radius:0;
  font:500 10.5px 'IBM Plex Sans',sans-serif!important;letter-spacing:0!important;text-transform:none;color:rgba(255,255,255,.55)!important;text-decoration:none}
.fl-layout .portal-nav a.vp-lat-l:hover{color:#fff!important}
.fl-layout .portal-nav a.vp-lat-l[data-m]{color:#E8CE96!important}
.fl-layout .portal-nav a.vp-lat-l[data-m]:hover{color:#fff!important}
.fl-layout .portal-nav .vp-foot button{color:#B08A3E!important;text-align:left;padding:5px 12px 2px!important;font:600 10px 'IBM Plex Sans',sans-serif!important;
  letter-spacing:.12em!important;background:none;border:none;cursor:pointer;text-transform:uppercase}
.fl-sbbrand{display:flex;align-items:center;gap:10px;padding:2px 10px 18px}
.fl-sbbrand .nm{font:700 20px 'Playfair Display',serif;letter-spacing:.06em;color:#fff;line-height:1.1}
.fl-sbbrand .nm em{color:#E8CE96;font-style:italic}
.fl-sbbrand .sb{font:400 9px 'IBM Plex Sans',sans-serif;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4)}
/* dos modos del lateral: el del inversor y (solo admin) la gestión del fondo. Nunca los dos
   juntos. Van DESPUÉS de las reglas de los links y con su misma especificidad: si no, el
   display:flex de a[data-tab] les gana y se ven las dos listas a la vez */
.fl-layout .portal-nav a[data-m="ges"],.fl-layout .portal-nav div[data-m="ges"]{display:none!important}
.fl-layout .portal-nav.modo-ges a[data-m="inv"],.fl-layout .portal-nav.modo-ges div[data-m="inv"]{display:none!important}
.fl-layout .portal-nav.modo-ges a[data-m="ges"]{display:flex!important}
.fl-layout .portal-nav.modo-ges a.vp-lat-l[data-m="ges"]{display:block!important}
.fl-layout .portal-nav.modo-ges div[data-m="ges"]{display:block!important}
.fl-layout .portal-nav.modo-ges{background:#0B1327!important}
/* columna principal: encabezado único + contenido */
.fl-main{flex:1;min-width:0;display:flex;flex-direction:column}
.vp-enc{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:22px 30px 16px;
  border-bottom:1px solid var(--border);background:var(--panel-bg);position:sticky;top:0;z-index:60}
.vp-enc h1{font:700 30px 'Playfair Display',serif;color:var(--text);line-height:1.1;margin:0;letter-spacing:.01em}
.vp-enc .sub{font:500 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:6px}
.vp-enc .der{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.vp-enc-volver{display:inline-block;font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--link);text-decoration:none;margin-bottom:6px}
.vp-enc-volver:hover{color:var(--text)}
/* selectores: sin caja; la opción activa lleva un subrayado dorado de 2px */
.vp-seg{display:inline-flex;gap:2px;align-items:center}
.vp-seg button{font:500 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:8px 10px;cursor:pointer;color:var(--muted);
  background:none;border:none;border-bottom:2px solid transparent;white-space:nowrap;transition:color .15s}
.vp-seg button:hover{color:var(--text)}
.vp-seg button.on{color:var(--text);border-bottom-color:#B08A3E}
.vp-agregar{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#0E1830;background:#E8CE96;
  padding:9px 16px;border-radius:7px;white-space:nowrap;border:none;cursor:pointer;transition:background .15s}
.vp-agregar:hover{background:#fff;box-shadow:inset 0 0 0 1px #E8CE96}
.fl-layout .portal-content > [id^="tab-"]{scroll-margin-top:160px}
.fl-layout .portal-content{flex:1;min-width:0;padding:24px 34px 60px!important;box-sizing:border-box;width:100%}
/* celular: el lateral se esconde y las secciones pasan a un selector arriba */
.vp-mbar{display:none;position:sticky;top:0;z-index:61;height:50px;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;background:#0E1830}
.vp-mbrand{font:700 18px 'Playfair Display',serif;letter-spacing:.06em;color:#fff;white-space:nowrap}
.vp-mbrand em{color:#E8CE96;font-style:italic}
.vp-mbar select{font:600 11px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#E8CE96;background:rgba(255,255,255,.06);
  border:1px solid rgba(232,206,150,.35);border-radius:7px;padding:8px 10px;max-width:62vw;min-width:0}
.vp-mder{display:flex;align-items:center;gap:8px;min-width:0}
.vp-mbar select option,.vp-mbar select optgroup{color:#101010;background:#fff;text-transform:none}
@media (max-width:920px){
  .fl-layout{flex-direction:column;min-height:0}
  .fl-layout .portal-nav{display:none!important}
  .vp-mbar{display:flex}
  .vp-enc{position:static;padding:16px 16px 12px}
  .vp-enc h1{font-size:25px}
  .fl-layout .portal-content{padding:18px 14px 50px!important}
}
/* secciones del panel */
.vp-sub{color:var(--sub);font-size:14px;line-height:1.7;max-width:720px;margin:-14px 0 22px}
.vp-sec{display:flex;align-items:baseline;gap:12px;font:700 19px 'Playfair Display',serif;color:var(--text);margin:32px 0 14px;line-height:1.2}
.vp-sec::after{content:'';flex:1;height:1px;background:var(--border);align-self:center;min-width:20px}
.vp-sec small{font:400 12px 'IBM Plex Sans',system-ui,sans-serif;color:var(--muted)}
.vp-cargando{color:var(--muted);font-size:13px}
.vp-nota{font-size:12px;color:var(--muted);line-height:1.7;margin-top:10px;max-width:760px}
.vp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
.vp-card{background:var(--card);border:1px solid var(--border);padding:16px 18px;position:relative}
.vp-card h4{font:700 17.5px 'Playfair Display',serif;color:var(--text);margin:0 0 7px;line-height:1.25}
.vp-card p{font-size:13px;color:var(--sub);line-height:1.65;margin:0}
.vp-card .l{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
a.vp-ir,.vp-card a.vp-ir{display:inline-block;margin-top:10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--link);text-decoration:none}
.vp-fila{display:flex;gap:10px;align-items:baseline;text-decoration:none;background:var(--bg3);border:1px solid var(--border);padding:11px 14px;margin-bottom:8px;color:var(--text);font-size:13px;line-height:1.5}
.vp-fila b{color:var(--text)}
.vp-chips{display:flex;gap:8px;flex-wrap:wrap;margin:-8px 0 20px}
.vp-chip{font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--sub)}
.vp-chip b{color:var(--text)}
.vp-tag{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:2px;white-space:nowrap;display:inline-block}
.vp-tag.infra{color:var(--green);background:rgba(31,122,77,.12)}.vp-tag.precio{color:var(--link);background:rgba(176,138,62,.14)}
.vp-tag.cara{color:var(--red);background:rgba(178,58,58,.1)}.vp-tag.sin{color:var(--muted);background:rgba(120,130,140,.12)}
.vp-tag.zona{color:#0E1830;background:#E8CE96}.vp-tag.tengo{color:var(--sub);background:transparent;border:1px solid var(--border)}
.vp-tag.pro{color:var(--link);border:1px solid var(--gold)}.vp-tag.gratis{color:var(--green);border:1px solid rgba(31,122,77,.5)}
.vp-tblwrap{background:var(--card);border:1px solid var(--border);overflow-x:auto;position:relative}
.vp-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
.vp-tbl th{font-size:9.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:11px 12px;border-bottom:1px solid var(--text);text-align:right;white-space:nowrap}
.vp-tbl th.l,.vp-tbl td.l{text-align:left}
.vp-tbl td{padding:10px 12px;border-bottom:1px solid var(--border);color:var(--text);text-align:right;font:500 12.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.vp-tbl td.l{font:400 13px 'IBM Plex Sans',system-ui,sans-serif}
.vp-tbl tbody tr:hover td{background:var(--bg3)}
.vp-tbl tr:last-child td{border-bottom:none}
.vp-tbl .tk{font:600 12.5px 'IBM Plex Mono',monospace;color:var(--link);text-decoration:none}
.vp-tbl .nm{display:block;font:400 11px 'IBM Plex Sans',system-ui,sans-serif;color:var(--muted);white-space:normal}
.vp-tbl tr.vp-blur td{filter:blur(4px);pointer-events:none;user-select:none}
.vp-lock{position:absolute;left:0;right:0;bottom:0;padding:22px;text-align:center;background:linear-gradient(to bottom,transparent,var(--card) 40%)}
.vp-lock b{display:block;font:700 18px 'Playfair Display',serif;color:var(--text)}
.vp-lock p{font-size:12.5px;color:var(--sub);margin:4px 0 10px}
.vp-btn{font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--btn-tx);
  background:var(--btn-bg);border:1px solid var(--btn-bg);padding:10px 20px;cursor:pointer;text-decoration:none;display:inline-block;transition:background .15s,color .15s,border-color .15s}
.vp-btn:hover{background:var(--btn-hover);border-color:var(--btn-hover)}
.vp-btn.sec{background:transparent;color:var(--text);border:1px solid var(--text)}
.vp-btn.sec:hover{background:var(--text);color:var(--bg);border-color:var(--text)}
.vp-btn.mini{padding:6px 12px;font-size:10px}
.vp-btn[disabled]{opacity:.45;cursor:default}
.vp-form{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:8px;padding:10px;border:1px dashed var(--border);text-align:left}
.vp-form label{display:block;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.vp-form input,.vp-form select{padding:8px 10px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:13px;outline:none;min-width:90px}
.vp-form input:focus,.vp-form select:focus{border-color:var(--gold)}
.vp-msg{font-size:12.5px;margin-top:8px}
.vp-pasos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:8px}
.vp-paso{background:var(--card);border:1px solid var(--border);padding:16px 18px;cursor:pointer}
.vp-paso .n{font:700 22px 'Playfair Display',serif;color:var(--gold);line-height:1}
.vp-paso.ok .n{color:var(--green)}
.vp-paso b{display:block;font-size:14px;color:var(--text);margin:8px 0 4px}
.vp-paso p{font-size:12.5px;color:var(--sub);line-height:1.6;margin:0}
.vp-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#0E1830;color:#E8CE96;border:1px solid #B08A3E;padding:11px 18px;font-size:13px;z-index:999;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.vp-bv{position:fixed;inset:0;z-index:1000;background:rgba(6,12,22,.72);display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto}
.vp-bv-caja{background:var(--card);border:1px solid var(--border);border-radius:12px;max-width:560px;width:100%;padding:26px 28px 22px;box-shadow:0 20px 60px rgba(0,0,0,.45);margin:auto}
.vp-bv-caja .k{font:700 10px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--link)}
.vp-bv-caja h3{font:700 25px 'Playfair Display',serif;color:var(--text);margin:8px 0 10px;line-height:1.15}
.vp-bv-caja p{font-size:13.5px;color:var(--sub);line-height:1.7;margin:0 0 14px}
.vp-bv-caja ul{list-style:none;padding:0;margin:0 0 16px}
.vp-bv-caja li{font-size:13px;color:var(--sub);line-height:1.6;padding:9px 0;border-top:1px solid var(--border);display:flex;gap:11px;align-items:flex-start}
.vp-bv-caja li b{color:var(--text);font-weight:600}
.vp-bv-caja li i{flex-shrink:0;font-style:normal;color:var(--link);font-weight:700;font-size:11px;letter-spacing:.06em;min-width:18px}
.vp-bv-legal{font-size:11.5px;color:var(--muted);line-height:1.65;border-top:1px solid var(--border);padding-top:12px;margin-bottom:16px}
.vp-bv-legal a{color:var(--link);text-decoration:none}
.vp-bv-pie{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
@media(max-width:560px){.vp-bv-caja{padding:22px 20px 18px}.vp-bv-caja h3{font-size:22px}}
.vp-spark{width:100%;height:36px;display:block;margin:8px 0 4px}
.vp-pos{color:var(--green)}.vp-neg{color:var(--red)}.vp-mut{color:var(--muted)}
.vp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:18px}
/* acá los .pkpi van sueltos (no dentro del marco de .portal-kpis): cada uno es su propia tarjeta */
.vp-kpis .pkpi{background:var(--card);border:1px solid var(--border)}
/* Resumen: cabecera, bloque de estado, composicion y avisos */
.vp-hero{display:grid;gap:14px;margin-bottom:8px;align-items:stretch}
.vp-estado{display:flex;flex-direction:column;gap:15px}
.vp-est-top{display:flex;justify-content:space-between;gap:22px;flex-wrap:wrap}
.vp-big{font:600 32px 'IBM Plex Mono',monospace;line-height:1.1;color:var(--text);
  font-variant-numeric:tabular-nums;letter-spacing:-.02em;margin:5px 0 8px}
.vp-linea{font-size:13px;color:var(--sub);display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;line-height:1.5}
.vp-linea b{font:600 18px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.vp-pill{font:600 11.5px 'IBM Plex Mono',monospace;padding:2px 8px;border-radius:2px;white-space:nowrap}
.vp-pill.pos{color:var(--green);background:rgba(31,122,77,.12)}
.vp-pill.neg{color:var(--red);background:rgba(178,58,58,.1)}
.vp-cob{text-align:right;flex:none;max-width:210px}
.vp-cob .n{font:600 20px 'IBM Plex Mono',monospace;line-height:1.2;color:var(--text);font-variant-numeric:tabular-nums}
.vp-cob .n small{font-size:12px;font-weight:500;color:var(--muted)}
.vp-cob p{font-size:11.5px;color:var(--muted);margin:0;line-height:1.5}
.vp-cob .vp-ir{margin-top:8px}
@media(max-width:640px){.vp-cob{text-align:left;max-width:none}.vp-big{font-size:27px}}
.vp-comp{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:20px;border-top:1px solid var(--border);padding-top:14px}
.vp-bar{display:flex;height:7px;border-radius:4px;overflow:hidden;background:var(--bg3);margin:8px 0}
.vp-bar i{display:block;height:100%}
.vp-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--sub)}
.vp-leg span{display:inline-flex;align-items:center;gap:5px}
.vp-leg i{width:7px;height:7px;border-radius:2px;display:inline-block;flex:none}
.vp-leg b{color:var(--text)}
.vp-avisos{border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:8px}
.vp-aviso{font-size:12.5px;color:var(--sub);display:flex;gap:10px;align-items:baseline;line-height:1.55}
.vp-aviso .vp-tag{flex:none}
.vp-tag.warn{color:#7A5C26;background:rgba(224,169,62,.18)}
[data-theme="dark"] .vp-tag.warn{color:#E0A93E}
/* dos columnas: lo que cambio a la izquierda, lo que hay para decidir a la derecha */
.vp-cols{display:grid;gap:8px 30px;align-items:start}
@media(min-width:980px){.vp-cols{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr)}}
.vp-evg{font-size:9.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:18px 0 8px}
.vp-evg:first-child{margin-top:0}
.vp-ev{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:12px;align-items:baseline;text-decoration:none;
  background:var(--card);border:1px solid var(--border);padding:11px 14px;margin-bottom:7px;
  color:var(--text);font-size:13px;line-height:1.5}
.vp-ev:hover{border-color:var(--gold)}
.vp-ev .d{font:600 10.5px 'IBM Plex Mono',monospace;color:var(--muted);white-space:nowrap}
.vp-ev .a{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--link);white-space:nowrap}
/* tarjetas compactas de la columna derecha */
.vp-buy{display:block;background:var(--card);border:1px solid var(--border);padding:13px 15px;margin-bottom:9px;text-decoration:none;color:var(--text)}
a.vp-buy:hover{border-color:var(--gold)}
.vp-buy .h{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.vp-buy .tk{font:600 13px 'IBM Plex Mono',monospace;color:var(--link)}
.vp-buy .nb{font-weight:600;color:var(--text);font-size:14px}
.vp-buy .nm{font-size:12px;color:var(--muted)}
.vp-buy .px{font:500 13px 'IBM Plex Mono',monospace;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap}
.vp-buy .tg{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0 9px}
.vp-buy .sc{font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.vp-rsi{display:flex;align-items:center;gap:9px}
.vp-rsi .t{flex:1;height:4px;border-radius:3px;background:var(--bg3);overflow:hidden}
.vp-rsi .t i{display:block;height:100%}
.vp-rsi .v{font:600 10px 'IBM Plex Mono',monospace;color:var(--muted);white-space:nowrap}
/* forma del prototipo Panel v3: cards 12px, internas 10px, métricas 8px, pills 4px, botones 5-7px. Sin sombras */
.vp-card,.vp-tblwrap,.vp-paso,.vp-form,.vp-kpis .pkpi{border-radius:12px}
.vp-ev,.vp-buy,.vp-fila{border-radius:10px}
.vp-tag,.vp-pill{border-radius:4px}
.vp-btn{border-radius:6px}
/* contadores del lateral (la pastilla del prototipo) */
.fl-layout .portal-nav a .vp-n{font:600 9px 'IBM Plex Mono',monospace;letter-spacing:0;color:#E8CE96;background:rgba(232,206,150,.16);
  padding:2px 6px;border-radius:4px;flex:none;text-transform:none}
.fl-layout .portal-nav a.active .vp-n{color:#0E1830;background:#E8CE96}
.vp-sub{margin:0 0 20px}
.vp-sec:first-child{margin-top:0}
`;

/* ───────────────────────── estado y utilidades ───────────────────────── */
const S = { user: null, isAdmin: false, data: {}, email: '', verificado: false, cliente: false, pro: false, plan: 'gratis' };
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
  // los bonos del panel van explícitos: sin ellos AL30 se leería en dólares
  return { ...c, fallo: !leida, fx: f, cur: curVista(), r: calcular(c.pos, c.precios, curVista(), f, (await bonosSet()) || new Set()) };
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
// El lateral es el del handoff Panel v3: tres grupos. "Mis empresas" y
// "Herramientas y datos" dejan de ser pestañas: la primera pasa (etapa 3) al
// desplegable de cada fila de Mi cartera y la segunda es un link al sitio.
// Mientras tanto se siguen abriendo desde Mi cartera (SUBVISTAS): no se pierde nada.
const TABS = [
  { g: 'Tus inversiones', id: 'inicio', t: 'Resumen' },
  { g: 'Tus inversiones', id: 'micartera', t: 'Mi cartera' },
  { g: 'Para decidir', id: 'comprar', t: 'Qué comprar', tit: 'Qué comprar hoy' },
  { g: 'Para decidir', id: 'carteras', t: 'Carteras Valtia' },
  { g: 'Para decidir', id: 'disciplina', t: 'Inversión mensual' },
  { g: 'Mercado', id: 'agenda', t: 'Agenda', tit: 'Agenda del mercado' },
];
const SUBVISTAS = {
  empresas: { t: 'Mis empresas', de: 'micartera' },
  herramientas: { t: 'Datos de tus activos', de: 'micartera' },
};
// la gestión del fondo: la llena fondo-live.js y solo existe para el admin
const GESTION = [
  { id: 'dashboard', t: 'Fondo · Dashboard' }, { id: 'rendimientos', t: 'Rendimientos' },
  { id: 'movimientos', t: 'Posiciones' }, { id: 'fondo', t: 'Balance consolidado' },
  { id: 'senales', t: 'Señales' }, { id: 'analisis', t: 'Análisis de cartera' },
  { id: 'informes', t: 'Lector de informes' }, { id: 'admin', t: 'Inversores' },
];
const ES_GESTION = new Set(GESTION.map(x => x.id));
// el selector de moneda va donde cambia las cifras. En Qué comprar, Carteras e
// Inversión mensual todo está en dólares: un selector que no hace nada confunde
const CON_MONEDA = new Set(['inicio', 'micartera', 'empresas', 'herramientas']);
const NUEVOS = ['inicio', 'comprar', 'carteras', 'empresas', 'disciplina', 'herramientas', 'agenda'];
// tabs que este usuario puede abrir: los divs de Gestión y Fondo viven en el
// HTML para todos, así que sin este set cualquiera llega por #panel/admin
let _permitidos = new Set(NUEVOS.concat(['micartera']));
let _tab = 'inicio';
// cada pestaña del Panel v3 vive en su módulo (panel-*.js) y recibe el contexto;
// Mis empresas y Datos de tus activos siguen acá, como subvistas de Mi cartera
const enModulo = (f, id) => () => f($('tab-' + id), ctx).catch(() => {});
const _render = { inicio: enModulo(renderResumen, 'inicio'), comprar: enModulo(renderComprarV3, 'comprar'),
                  carteras: enModulo(renderCarterasV3, 'carteras'), disciplina: enModulo(renderMensual, 'disciplina'),
                  agenda: enModulo(renderAgenda, 'agenda'), empresas: renderEmpresas, herramientas: renderHerramientas };
const _hecho = {};

function pintarPlan() {
  ['vp-plan', 'vp-plan-m'].forEach(id => { const c = $(id); if (c) { c.textContent = etiquetaPlan(); c.classList.toggle('pro', S.pro); } });
}
function etiquetaPlan() {
  return S.isAdmin ? 'Admin' : S.cliente ? 'Cliente · a medida' : S.pro ? 'PRO' : S.verificado ? 'Gratis' : 'Gratis · verificá tu mail';
}
const nombreUsuario = () => (S.user && S.user.displayName) || String(S.email || '').split('@')[0];
const primerNombre = () => String(nombreUsuario() || '').split(' ')[0];
function hoyLargo() {
  try {
    const s = new Date(hoyAR() + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
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
  const link = (x, m) => `<a href="#panel/${x.id}" id="${x.id}-tab" data-tab="${x.id}" data-m="${m}" onclick="portalTab(event,'${x.id}')"><span>${x.t}</span></a>`;
  const grupos = [...new Set(TABS.map(x => x.g))];
  nav.innerHTML = `<div class="fl-sbbrand">
      <svg width="32" height="32" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect width="34" height="34" rx="4" fill="#1A3A5C"/><polyline points="5,25 11,14 17,20 23,9 29,13" stroke="#B8975A" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="9" r="2.5" fill="#B8975A"/></svg>
      <div><div class="nm">VAL<em>T</em>IA</div><div class="sb">Analytics</div></div></div>` +
    grupos.map(g => `<div class="vp-grp" data-m="inv">${g}</div>` + TABS.filter(x => x.g === g).map(x => link(x, 'inv')).join('')).join('') +
    (S.isAdmin ? `<div class="vp-grp" data-m="ges">Gestión del fondo</div>` + GESTION.map(x => link(x, 'ges')).join('') : '') +
    `<div class="vp-foot"><span id="portal-user-name">${esc(nombreUsuario())}</span>
      <div class="vp-plan-w"><span class="vp-plan${S.pro ? ' pro' : ''}" id="vp-plan">${etiquetaPlan()}</span></div>
      ${S.isAdmin ? `<a href="#panel/dashboard" class="vp-lat-l" data-m="inv" onclick="portalTab(event,'dashboard')">Gestión del fondo →</a>
      <a href="#panel/inicio" class="vp-lat-l" data-m="ges" onclick="portalTab(event,'inicio')">← Panel del inversor</a>` : ''}
      <a href="herramientas.html" class="vp-lat-l">Herramientas y datos ↗</a>
      <a href="#" class="vp-lat-l" onclick="valtiaPanel.salir(event)">← Volver al sitio</a>
      <button onclick="logout()">Cerrar sesión</button></div>`;
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
    main.insertAdjacentHTML('afterbegin', `<div class="vp-mbar"><span class="vp-mbrand">VAL<em>T</em>IA</span>
      <span class="vp-mder"><span class="vp-plan" id="vp-plan-m"></span><select id="vp-msel" aria-label="Sección del panel"></select></span></div>
      <header class="vp-enc" id="vp-enc"></header>`);
  }
  llenarSelectMovil();
  pintarPlan();
  document.body.classList.add('fl-app-on');
  const og = window.goPortal;
  window.goPortal = e => { if (og) og(e); document.body.classList.add('fl-app-on'); portalTab(_tab); };
  if (!document.querySelector('link[href*="Playfair"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(l);
  }
}

/* en el celular el lateral se esconde: las mismas secciones, en un selector */
function llenarSelectMovil() {
  const sel = $('vp-msel'); if (!sel) return;
  const opt = (v, x) => `<option value="${v}">${esc(x)}</option>`;
  const grupos = [...new Set(TABS.map(x => x.g))];
  sel.innerHTML = (S.cliente ? '<option value="fondocli" hidden>Tu posición en el fondo</option>' : '') + grupos.map(g => `<optgroup label="${g}">${TABS.filter(x => x.g === g).map(x => opt(x.id, x.t)).join('')}</optgroup>`).join('') +
    `<optgroup label="Mi cartera en detalle">${Object.entries(SUBVISTAS).map(([id, s]) => opt(id, s.t)).join('')}</optgroup>` +
    (S.isAdmin ? `<optgroup label="Gestión del fondo">${GESTION.map(x => opt(x.id, x.t)).join('')}</optgroup>` : '') +
    `<optgroup label="Más">${opt('@herr', 'Herramientas y datos ↗')}${opt('@sitio', '← Volver al sitio')}${opt('@salir', 'Cerrar sesión')}</optgroup>`;
  sel.value = _tab;
  sel.onchange = () => {
    const v = sel.value;
    if (v.charAt(0) !== '@') { portalTab(v); window.scrollTo(0, 0); return; }
    sel.value = _tab;
    if (v === '@herr') location.href = 'herramientas.html';
    else if (v === '@sitio') salir();
    else if (v === '@salir' && window.logout) window.logout();
  };
}

/* un solo encabezado para todo el panel: título, fecha y frescura, y a la
   derecha la moneda (y "+ Agregar posición" en Mi cartera) */
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
  h.innerHTML = `<div class="izq">${sub ? `<a href="#panel/${sub.de}" data-go="${sub.de}" class="vp-enc-volver">← Mi cartera</a>` : ''}
      ${propio ? '' : `<h1>${esc(tit)}</h1>`}<div class="sub">${partes.filter(Boolean).map(esc).join(' \u00b7 ')}</div></div>
    <div class="der">${conMon ? `<div class="vp-seg" role="group" aria-label="Moneda">${['ARS', 'CCL', 'MEP'].map(c =>
        `<button type="button" data-cur="${c}" class="${cur === c ? 'on' : ''}" aria-pressed="${cur === c}">${curEtq(c)}</button>`).join('')}</div>` : ''}
      ${tab === 'micartera' && S.verificado ? '<button type="button" class="vp-agregar" data-agregar>+ Agregar posición</button>' : ''}</div>`;
}

/* contadores del lateral y frescura del encabezado: no dependen de que el
   usuario pase por el Resumen (antes solo se llenaban ahí) */
let _latSeq = 0;
async function actualizarLateral() {
  const email = S.email, seq = ++_latSeq;
  try {
    const [cc, disc, bset, f] = await Promise.all([carteraCalc(), disciplina(), bonosSet(), fx()]);
    if (S.email !== email || seq !== _latSeq) return;
    S.fxSnap = f;
    if (cc.fallo) return;   // sin leer la cartera no se pisan los contadores con ceros
    S.frescura = cc.pos.length ? frescura(cc.precios) : '';
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
  const nav = document.querySelector('.portal-nav');
  if (nav) nav.classList.toggle('modo-ges', ES_GESTION.has(tab));
  _tab = tab;
  const sel = $('vp-msel'); if (sel) sel.value = tab;
  try { sessionStorage.setItem('valtia-panel-tab', tab); sessionStorage.setItem('valtia-panel-user', S.email || ''); } catch (x) {}
  if (location.hash !== '#panel/' + tab) history.replaceState(null, '', '#panel/' + tab);
  pintarEncabezado();
  if (e) window.scrollTo(0, 0);
  if (_render[tab] && !_hecho[tab]) { _hecho[tab] = true; _render[tab](); }
  if (window.flResizeCharts) window.flResizeCharts();
}
function refrescar(...tabs) {
  tabs.forEach(t => { _hecho[t] = false; if (t === _tab) portalTab(t); });
  if (tabs.includes('inicio') || tabs.includes('disciplina')) actualizarLateral();
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
    ${!S.verificado ? `<p style="color:var(--link)"><b>Te falta verificar tu mail.</b> Hasta que lo hagas,
      Mi cartera y la inversión mensual quedan bloqueadas. Te mandamos el enlace cuando creaste la cuenta.</p>` : ''}
    <div class="vp-bv-legal">Las alertas por mail vienen apagadas: las prendés vos desde el panel, y como
      máximo sale una por día. ¿Dudas o algo que no funciona? Escribinos a
      <a href="mailto:soporte@valtia.tech">soporte@valtia.tech</a>.</div>
    <div class="vp-bv-pie">
      <button class="vp-btn" id="vp-bv-ok">Empezar</button>
      <a class="vp-ir" href="privacidad.html" style="margin:0">Privacidad</a>
      <a class="vp-ir" href="terminos.html" style="margin:0">Términos</a>
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
  S.frescura = ''; S.fxSnap = null;
  instalarShell();
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
    refrescar('inicio', 'comprar', 'carteras', 'empresas', 'herramientas');
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
  refrescar('inicio', 'comprar', 'carteras', 'disciplina', 'empresas', 'herramientas', 'agenda');
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
function frescura(precios) {
  const ts = Object.values(precios || {}).map(p => p.actualizado_utc).filter(Boolean);
  if (!ts.length) return '';
  let ms = 0;
  // manda la posición MÁS desactualizada: decir "actualizados recién" porque
  // uno de siete se refrescó recién sería mentir sobre el resto
  try { ms = Math.min(...ts.map(t => new Date(t.seconds ? t.seconds * 1000 : t).getTime())); } catch (e) { return ''; }
  if (!isFinite(ms)) return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'precios actualizados recién';
  if (min < 60) return `precios actualizados hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `precios actualizados hace ${h} h` : 'precios del ' + new Date(ms).toLocaleDateString('es-AR');
}

/* ───────────────────────── INICIO ───────────────────────── */
// El Resumen es el pantallazo de como vienen SUS inversiones: un solo bloque
// de estado (manda el valor, y de el cuelgan resultado, rendimiento e
// invertido), la composicion como barras con leyenda y los avisos abajo con
// etiqueta propia. Antes eran cuatro KPIs sueltos y una fila de chips donde
// el broker competia con "falta un precio".
const fmtC = iso => { const [aa, mm, dd] = String(iso || '').slice(0, 10).split('-'); return dd && mm ? `${dd}/${mm}` : String(iso || ''); };
const COLB = ['#B08A3E', '#4E6E9E', '#6FA287', '#D8B87A', '#9B7BA8', '#8C8477'];
const COLM = { ARS: '#9EC7A8', USD: '#3F8F63' };

/* ── alertas por mail: la config la guarda el usuario; los mails los manda
   alertas_cartera.py (máximo uno por día, apagadas por defecto). Los campos
   tienen que ser EXACTAMENTE los que aceptan las reglas (alertas/config). ── */
const TIPOS_ALERTA = [['zona', 'Entrada en zona de valor del radar'], ['estirada', 'Pasa a «Estirada»'],
  ['resultados', 'Resultados en los próximos días'], ['vencimientos', 'Vencimientos de bonos y letras'],
  ['variacion', 'Movimientos fuertes de precio']];
async function alertasMail() {
  const box = $('vp-alertas');
  if (!box) return;
  if (!S.verificado) {
    box.innerHTML = `<p class="vp-nota">Para recibir estas novedades por mail, primero verificá tu email.</p>`;
    return;
  }
  let cfg = null, ultimo = '';
  try {
    const sn = await getDoc(doc(db(), 'inversores', S.email, 'alertas', 'config'));
    if (sn.exists()) cfg = sn.data();
  } catch (e) {
    // sin leer la config no se ofrece guardar: se pisaría con valores por defecto
    box.innerHTML = `<p class="vp-nota">No pudimos leer tu configuración de alertas por mail. Recargá la página para verla o cambiarla.</p>`;
    return;
  }
  try {
    const env = await getDocs(collection(db(), 'inversores', S.email, 'alertasEnvios'));
    const ok = env.docs.filter(d => d.data().estado === 'enviado').map(d => d.id).sort();
    if (ok.length) ultimo = ok[ok.length - 1];
  } catch (e) {}
  const on = !!(cfg && cfg.activo);
  const tipos = (cfg && cfg.tipos) || {};
  const umbral = [3, 5, 8].includes(Number(cfg && cfg.umbralVar)) ? Number(cfg.umbralVar) : 5;
  const frec = cfg && cfg.frecuencia === 'semanal' ? 'semanal' : 'diaria';
  box.innerHTML = `<div class="vp-card" style="margin-top:12px">
      <label style="display:flex;gap:10px;align-items:center;cursor:pointer;font-size:13.5px;color:var(--text)">
        <input type="checkbox" id="al-on"${on ? ' checked' : ''}> <b>Recibir estas novedades por mail</b> <span class="vp-mut" style="font-size:12px">(máximo uno por día)</span></label>
      <div id="al-opc" style="display:${on ? 'block' : 'none'};margin-top:12px;font-size:12.5px;color:var(--text)">
        <div style="display:flex;flex-wrap:wrap;gap:8px 18px">${TIPOS_ALERTA.map(([k, t]) =>
          `<label style="cursor:pointer"><input type="checkbox" data-al-tipo="${k}"${tipos[k] === false ? '' : ' checked'}> ${t}</label>`).join('')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;align-items:center">
          <label>Frecuencia <select id="al-frec"><option value="diaria"${frec === 'diaria' ? ' selected' : ''}>diaria</option><option value="semanal"${frec === 'semanal' ? ' selected' : ''}>semanal (lunes)</option></select></label>
          <label>Movimiento desde <select id="al-umbral">${[3, 5, 8].map(u => `<option value="${u}"${u === umbral ? ' selected' : ''}>${u}%</option>`).join('')}</select></label>
        </div>
      </div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <button class="vp-btn" id="al-ok">Guardar</button>
        <span class="vp-nota" id="al-msg" style="margin:0">${on ? `Llegan a ${esc(S.email)}${ultimo ? ' · último envío ' + esc(fmtF(ultimo)) : ''}.` : 'Apagadas.'}
          Son lecturas automáticas, no recomendaciones. Sin montos ni cantidades de tu cartera.</span>
      </div></div>`;
  $('al-on').addEventListener('change', e => { $('al-opc').style.display = e.target.checked ? 'block' : 'none'; });
  $('al-ok').addEventListener('click', async () => {
    const btn = $('al-ok'), msg = $('al-msg');
    btn.disabled = true;
    const nuevo = {
      activo: $('al-on').checked,
      frecuencia: $('al-frec').value === 'semanal' ? 'semanal' : 'diaria',
      tipos: Object.fromEntries(TIPOS_ALERTA.map(([k]) => [k, !!box.querySelector(`[data-al-tipo="${k}"]`).checked])),
      umbralVar: [3, 5, 8].includes(Number($('al-umbral').value)) ? Number($('al-umbral').value) : 5,
      actualizado: serverTimestamp(),
    };
    try {
      await setDoc(doc(db(), 'inversores', S.email, 'alertas', 'config'), nuevo);
      msg.textContent = nuevo.activo
        ? `Listo: llegan a ${S.email}, ${nuevo.frecuencia === 'semanal' ? 'los lunes' : 'cuando haya novedades'} (máximo uno por día).`
        : 'Listo: alertas apagadas.';
    } catch (e) {
      msg.textContent = 'No se pudo guardar. Probá de nuevo en un rato.';
    }
    btn.disabled = false;
  });
}

/* ── contadores del sidebar: cuanto hay detras de cada seccion ── */
function contadorNav(id, txt, tit) {
  const a = document.querySelector(`.portal-nav a[data-tab="${id}"]`); if (!a) return;
  let s = a.querySelector('.vp-n');
  if (!txt) { if (s) s.remove(); return; }
  if (!s) { s = document.createElement('span'); s.className = 'vp-n'; a.appendChild(s); }
  s.textContent = txt;
  if (tit) a.title = tit;
}
async function contadores(cc, disc, bset) {
  const n = cc.r.filas.length;
  contadorNav('micartera', n ? String(n) : '', n ? `${n} posici${n === 1 ? '\u00f3n' : 'ones'} cargadas` : '');
  if (disc && disc.config) {
    const mes = hoyAR().slice(0, 7), obj = Math.max(1, Number(disc.config.compras) || 1);
    const hechas = (disc.log || []).filter(c => String(c.fecha || '').slice(0, 7) === mes).length;
    contadorNav('disciplina', `${hechas}/${obj}`, `compras de este mes: ${hechas} de ${obj}`);
  }
  try {
    const z = (await radar()).filter(a => a.entrada).length;
    contadorNav('comprar', z ? z + ' \u25ce' : '', `${z} activos en zona de compra`);
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
        <a class="vp-ir" href="planes.html">Ver planes →</a></div>`;
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
    if (!grupos.has(k)) grupos.set(k, { k, rf, filas: [], valor: 0, pl: 0, tieneValor: false });
    const g = grupos.get(k); g.filas.push(f);
    if (f.dValor != null) { g.valor += f.dValor; g.pl += f.dPl || 0; g.tieneValor = true; }
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
      if (docs.length) extra = `<p>📄 <a href="activo.html?t=${f}#informe" style="color:var(--link)">${esc(docs[0].titulo)}</a> · ${fmtF(docs[0].fecha)}${docs[0].precio_pub && pxUsd ? ` · ${pct((pxUsd / docs[0].precio_pub - 1) * 100, 1)} desde su publicación` : ''}</p>`;
      else if (emp && emp.slug) extra = `<p>📄 Informe Valtia disponible con PRO · <a href="activo.html?t=${f}#informe" style="color:var(--link)">ver la ficha</a></p>`;
      else if (f) extra = `<p class="vp-mut">Sin informe Valtia todavía · <a href="mailto:soporte@valtia.tech?subject=Análisis de ${f}" style="color:var(--link)">pedir este análisis</a></p>`;
      else extra = `<p class="vp-mut">Sin ficha en Valtia para este ticker.</p>`;
    }
    return `<div class="vp-card" data-emp="${esc(g.k)}"><div class="l">${esc(g.k)}${ver ? ` · <span class="vp-tag ${verCls(ver)}" style="padding:1px 6px">${esc(ver)}</span>` : ''}</div>
      <h4>${link ? `<a href="${link}" style="color:inherit;text-decoration:none">${esc(nombre)}</a>` : esc(nombre)}</h4>
      <p>${cant.toLocaleString('es-AR')} ${g.rf ? 'VN' : 'unid.'}${g.tieneValor ? ` · <b>${money(g.valor, m)}</b> · <span class="${cls(g.pl)}">${moneyS(g.pl, m)}</span>` : ' · esperando precio'}</p>
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
    b.innerHTML = `<div style="margin-top:8px;font-size:12.5px;line-height:1.6">${hits.map(n => `📰 <a href="nota.html?n=${esc(n.id)}" style="color:var(--text);text-decoration:none">${esc(n.titulo)}</a> <span class="vp-mut">· ${fmtF(n.fecha)}</span>`).join('<br>')}</div>`;
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
    datos = `<p class="vp-sub">Lo que el sync sabe de cada uno de tus activos${S.pro ? '' : ' · ratios completos con PRO'}. El mapa de calor, el radar, los bonos y el dólar histórico están en <a href="herramientas.html" style="color:var(--link)">Herramientas y datos ↗</a>.</p>
      <div class="vp-tblwrap"><table class="vp-tbl"><thead><tr><th class="l">Activo</th><th>Precio</th><th class="l">Lectura</th>${rd.pro ? '<th>PER / TIR</th><th>P/Libro / MD</th><th>ROE / paridad</th><th>Deuda/EBITDA</th><th>Beta</th><th>Valor</th>' : '<th>RSI</th>'}</tr></thead>
      <tbody>${filas.map(fila).join('') || '<tr><td colspan="9" class="l vp-mut">Tus posiciones todavía no tienen datos del sync (9:00).</td></tr>'}</tbody></table></div>
      ${!rd.pro ? `<p class="vp-nota">Con PRO ves PER, P/Libro, ROE, deuda sobre EBITDA y beta de tus acciones, y TIR, duration y paridad de tus bonos. <a href="planes.html" style="color:var(--link)">Ver planes →</a></p>` : `<p class="vp-nota">Múltiplos de yfinance al último cierre; para renta fija, la matemática propia del panel de bonos (cada 15 min en rueda).</p>`}`;
  }
  el.innerHTML = datos || `<div class="vp-card" style="max-width:560px"><h4>Todavía no cargaste posiciones</h4><p>Cuando cargues tu cartera, acá vas a ver el precio, la lectura y los ratios de cada activo. Las herramientas del sitio están en <a href="herramientas.html" style="color:var(--link)">Herramientas y datos ↗</a>.</p><a class="vp-ir" href="#panel/micartera" data-go="micartera">Ir a Mi cartera →</a></div>`;
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
  radarDoc, radar, teaser, calendario, flujos, panelBonos, preciosInf, desglosePer, bonosSet, vencMapa, vencimientoDe,
  fx, carteraCalc, ventas, ajustes, disciplina, informes, noticias, seguidas, posicionesCartera, precioHoy,
  tenencias, frescura, ordenComprar, mapaCarteras, alertasMail, compararSeguidas,
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
window.valtiaPanel = { salir, portalTab, iniciarPanel, refrescar: () => { invalidar('cartera', 'disc', 'ventas', 'aj'); refrescar('inicio', 'comprar', 'disciplina', 'empresas', 'herramientas', 'carteras', 'agenda'); } };
