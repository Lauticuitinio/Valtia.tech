// mi-cartera.js — seguimiento de la cartera propia del cliente.
// El cliente carga sus posiciones (ticker, cantidad, precio de compra) y ve
// valor actual, resultado y la lectura Valtia de cada activo. Los precios y
// fundamentals los deja el sync diario en precios/{TICKER}; acá solo se lee.
//
// Diseño separado a propósito: renderMiCartera() es puro (datos -> HTML) para
// poder verificarlo con datos de prueba sin tocar Firestore.
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc, runTransaction, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { base, canon, linkDe, esRentaFija, parBono, sectorDe, mercadoDe, desglose, monedaProbable,
         nombreDe, tickerFicha, radarSym } from './activos.js?v=7';
import { EMPRESAS } from './empresas.js?v=3';
import { eventos, TIPOS, TIPO_RESUMEN } from './panel-eventos.js?v=1';
import { simular, serieReal, combinar, recortar, serieDe, valorAl, compararCon, benchsDisponibles, nombreBench } from './evolucion.js?v=3';
import { validarVenta, armarVenta, planDeshacer, resultadoVenta, resumenVentas, tenencia, monedaFactor,
         cantidadAjuste, validarAjuste, ventaDesdeAjuste, ajusteDesdeVenta, restoDeAjuste }
  from './ventas.js?v=6';
import { fxMercado, convertir } from './fx.js?v=1';
export { convertir } from './fx.js?v=1';

/* Panel v3 (handoff de Lauti): la ESTRUCTURA es la del prototipo —fila de totales,
   dos gráficos, tabla con desplegable por fila— y los COLORES y la TIPOGRAFÍA son
   los de Noticias: fondo blanco, Playfair 700 en los títulos, IBM Plex Sans en
   rótulos y cuerpo, IBM Plex Mono en todos los números. Los colores salen de las
   variables --v3-* que define panel.js (así anda el tema oscuro); el único literal
   es el texto #0E1830 sobre el dorado claro, igual en los dos temas. */
const STYLE = `
.mc-wrap{width:100%;color:var(--v3-ink);font-family:'IBM Plex Sans',system-ui,sans-serif;
  --mc3-p1:var(--v3-serie);--mc3-p2:var(--v3-gold);--mc3-p3:var(--v3-goldL);--mc3-p4:var(--v3-up);--mc3-p5:var(--v3-azul);--mc3-p6:var(--v3-mut)}
/* en oscuro --v3-serie y --v3-goldL son el mismo dorado: dos tramos seguidos no se distinguirían */
[data-theme="dark"] .mc-wrap{--mc3-p1:var(--v3-ink);--mc3-p3:var(--v3-goldS)}
/* botones y campos heredan la tipografía de la página (si no, el navegador les pone Arial) */
.mc-wrap button,.mc-wrap input,.mc-wrap select,.mc-wrap textarea{font-family:inherit}
.mc-pos{color:var(--v3-up)}.mc-neg{color:var(--v3-dn)}.mc-mut{color:var(--v3-mut)}
.mc-orig{display:block;font-size:10.5px;color:var(--v3-mut);font-weight:400}.mc-orig.il{display:inline;font-size:inherit}

/* ── fila superior: totales + agrupar ── */
.mc3-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.mc3-tot{display:flex;gap:8px 18px;font-size:13px;color:var(--v3-sub);flex-wrap:wrap;align-items:baseline}
.mc3-tot b{font:600 15px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);letter-spacing:-.01em}
.mc3-tot b.mc-pos{color:var(--v3-up)}.mc3-tot b.mc-neg{color:var(--v3-dn)}
.mc3-tot b.k{font-size:13px}
/* la aclaración de los totales (qué quedó afuera de la suma del día) */
.mc3-tot em{font-style:normal;font-size:11.5px;color:var(--v3-mut);margin-left:6px}
.mc3-pp{font:600 11px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-style:normal;padding:2px 7px;border-radius:4px;margin-left:6px;white-space:nowrap}
.mc3-pp.up{color:var(--v3-up);background:var(--v3-upBg)}.mc3-pp.dn{color:var(--v3-dn);background:var(--v3-dnBg)}
.mc3-ctrl{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
/* "Ocultar $": tapa los importes para mostrarle la pantalla a alguien */
.mc3-ojo{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-mut);
  background:none;border:1px solid var(--v3-line);padding:6px 11px;border-radius:5px;cursor:pointer;white-space:nowrap;
  transition:color .15s,border-color .15s,background .15s}
.mc3-ojo:hover{color:var(--v3-ink);border-color:var(--v3-gold)}
.mc3-ojo[aria-pressed="true"]{color:var(--v3-gold2);border-color:var(--v3-gold);background:var(--v3-goldBg)}
.mc3-seg{display:inline-flex;gap:2px;align-items:center}
.mc3-seg button{font:500 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;cursor:pointer;color:var(--v3-mut);
  background:none;border:none;border-bottom:2px solid transparent;white-space:nowrap;transition:color .15s}
.mc3-seg button:hover{color:var(--v3-ink)}
.mc3-seg button.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}

/* ── avisos ── */
.mc3-aviso{background:var(--v3-warnBg);border:1px solid var(--v3-line);border-left:3px solid var(--v3-warn);border-radius:10px;
  padding:10px 14px;font-size:12.5px;line-height:1.6;margin-bottom:16px;color:var(--v3-ink)}

/* ── dos cards de gráficos ── */
.mc3-graf{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:14px;margin-bottom:14px}
.mc3-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:16px 18px;min-width:0}
.mc3-ch{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.mc3-ch span{font-size:11px;color:var(--v3-mut);white-space:nowrap}
.mc3-k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut)}
.mc3-bars{display:flex;flex-direction:column;gap:7px;margin-top:12px}
.mc3-bar{display:grid;gap:10px;align-items:center;font-size:11.5px}
.mc3-bar b{color:var(--v3-gold);font:700 11.5px 'IBM Plex Sans',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc3-bar .t{position:relative;height:10px;background:var(--v3-track2);border-radius:3px}
.mc3-bar .t i{position:absolute;top:0;bottom:0;border-radius:3px;display:block}
.mc3-bar .t i.z{top:-2px;bottom:-2px;width:1px;background:var(--v3-cero);border-radius:0}
.mc3-bar .v{text-align:right;font:600 11.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.mc3-mas{font-size:11px;color:var(--v3-mut);text-align:center;letter-spacing:.04em}
.mc3-nota{font-size:11.5px;color:var(--v3-mut);line-height:1.6;margin-top:10px}
.mc3-stack{display:flex;height:22px;border-radius:6px;overflow:hidden;margin-top:14px;gap:2px}
.mc3-stack div{min-width:3px}
.mc3-ley{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px;font-size:11.5px;color:var(--v3-sub)}
.mc3-ley span{display:flex;align-items:center;gap:6px;white-space:nowrap}
.mc3-ley i{width:8px;height:8px;border-radius:2px;display:block;flex:none}
.mc3-ley b{color:var(--v3-ink);font:600 11.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.mc3-frase{font-size:12px;color:var(--v3-sub);line-height:1.6;margin-top:14px;padding-top:12px;border-top:1px solid var(--v3-track)}
.mc3-frase b{color:var(--v3-ink);font:600 12px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}

/* ── la tabla (grilla del prototipo) ── */
.mc3-tbl{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow-x:auto}
/* con la columna "Hoy" son ocho: para que la grilla siga entrando en una
   pantalla de 1280 con el lateral abierto, las columnas angostas se apretaron
   un poco (todas tienen de sobra para el número más largo que muestran).
   El ancho mínimo es el que REALMENTE ocupa la fila —las ocho columnas (870)
   + los siete espacios (84) + los costados (36)—: si fuera menor, entre ese
   número y 990 la fila se salía de la caja y aparecía una barra de desplazamiento
   de unos pocos píxeles, justo antes de pasar a la vista angosta. */
.mc3-in{min-width:990px}
.mc3-hd,.mc3-row{display:grid;grid-template-columns:minmax(176px,1.5fr) 82px 110px 112px 120px 108px 130px 32px;gap:12px}
.mc3-hd{padding:10px 18px;border-bottom:1px solid var(--v3-line);font:700 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;
  text-transform:uppercase;color:var(--v3-mut)}
.mc3-hd .r{text-align:right}
.mc3-hd [data-col]{cursor:pointer;user-select:none;transition:color .15s}
.mc3-hd [data-col]:hover,.mc3-hd [data-col].on{color:var(--v3-ink)}
.mc3-row{align-items:center;padding:13px 18px;border-bottom:1px solid var(--v3-line2);cursor:pointer;background:var(--v3-card);
  scroll-margin-top:110px;transition:background .12s}
.mc3-row:hover,.mc3-row.on{background:var(--v3-hover)}
.mc3-row:focus-visible{outline:2px solid var(--v3-gold);outline-offset:-2px}
.mc3-row>*{min-width:0}
.mc3-tk{display:flex;align-items:baseline;gap:8px;min-width:0}
.mc3-tk b{font:700 14px 'IBM Plex Sans',sans-serif;color:var(--v3-gold);white-space:nowrap}
.mc3-mk{font:600 8.5px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-gold2);flex:none}
.mc3-nm{font-size:12px;color:var(--v3-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.mc3-pills{display:flex;gap:6px;margin-top:5px;flex-wrap:wrap}
.mc3-pill{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:4px;white-space:nowrap}
.mc3-pill.infra{color:var(--v3-up);background:var(--v3-upBg)}
.mc3-pill.precio{color:var(--v3-gold2);background:var(--v3-goldBg)}
.mc3-pill.cara{color:var(--v3-dn);background:var(--v3-dnBg)}
.mc3-pill.sin{color:var(--v3-mut);background:var(--v3-neutro)}
.mc3-pill.warn{color:var(--v3-warn);background:var(--v3-warnBg)}
.mc3-brk{font-size:12.5px;color:var(--v3-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc3-n{text-align:right;font:500 13px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);white-space:nowrap}
.mc3-n.f{font-weight:600}
.mc3-n.mc-pos{color:var(--v3-up)}.mc3-n.mc-neg{color:var(--v3-dn)}.mc3-n.mc-mut{color:var(--v3-mut)}
.mc3-n small{display:block;font:500 10.5px 'IBM Plex Mono',monospace;margin-top:2px}
/* el precio promedio de compra, debajo de la cantidad */
.mc3-n small.pm{color:var(--v3-mut);font-weight:400}
/* el rótulo "Hoy" de esa celda: solo se ve en la vista angosta, donde la fila
   se abre en renglones y el número queda sin encabezado que lo explique */
.mc3-hoyk{display:none;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);margin-right:6px}
.mc3-meta{display:none;font:500 11.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-mut);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc3-rot{text-align:center;color:var(--v3-mut);font-size:12px;display:inline-block;transition:transform .15s}
.mc3-row.on .mc3-rot{transform:rotate(180deg)}
.mc3-grp{display:flex;gap:6px 14px;align-items:baseline;flex-wrap:wrap;padding:9px 18px;background:var(--v3-track2);
  border-bottom:1px solid var(--v3-line2);font-size:12px;color:var(--v3-sub)}
.mc3-grp b{font:700 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-gold2)}
.mc3-grp span{font:500 11.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.mc3-grp em{font-style:normal}
.mc3-pie{font-size:11.5px;color:var(--v3-mut);line-height:1.7;margin:18px 0 0;max-width:760px}

/* ── el desplegable de cada fila ── */
.mc3-det{background:var(--v3-hover);border-bottom:1px solid var(--v3-line);border-left:3px solid var(--v3-gold);cursor:default}
.mc3-mets{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;padding:16px 18px 0}
.mc3-met{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:8px;padding:10px 12px;min-width:0}
.mc3-met .k{font:600 8.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc3-met .v{font:600 14px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);margin-top:5px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc3-met .s{font-size:10.5px;color:var(--v3-mut);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc3-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:16px;padding:16px 18px 20px}
.mc3-col{min-width:0}
.mc3-ck{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--v3-gold2)}
.mc3-inf{font:700 14px 'Playfair Display',serif;color:var(--v3-ink);margin-top:8px;line-height:1.35}
.mc3-txt{font-size:12px;color:var(--v3-sub);line-height:1.6;margin-top:4px}
.mc3-txt a{color:var(--v3-gold);text-decoration:none}.mc3-txt a:hover{color:var(--v3-gold2)}
.mc3-clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.mc3-f{font:500 10.5px 'IBM Plex Mono',monospace;color:var(--v3-mut)}
.mc3-lk{display:inline-block;margin-top:8px;font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:var(--v3-gold);text-decoration:none}
.mc3-lk:hover{color:var(--v3-gold2)}
.mc3-nots{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.mc3-nots a{display:block;font-size:12.5px;color:var(--v3-ink);line-height:1.5;text-decoration:none}
.mc3-nots a:hover{color:var(--v3-gold2)}
.mc3-nots a span{font:600 10px 'IBM Plex Mono',monospace;color:var(--v3-mut);margin-right:6px}
.mc3-ev{font:600 14px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);margin-top:8px}
.mc3-ev span{font:500 10.5px 'IBM Plex Mono',monospace;color:var(--v3-mut);margin-left:6px;white-space:nowrap}
.mc3-acc{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.mc3-b{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;border-radius:5px;
  white-space:nowrap;cursor:pointer;background:none;transition:border-color .15s,color .15s}
.mc3-b.vend{color:var(--v3-serie);border:1px solid var(--v3-serie)}
.mc3-b.vend:hover{color:var(--v3-gold2);border-color:var(--v3-gold)}
.mc3-b.aj{color:var(--v3-sub);border:1px solid var(--v3-line)}
.mc3-b.aj:hover,.mc3-b.aj[aria-expanded="true"]{color:var(--v3-ink);border-color:var(--v3-gold)}
.mc3-ajp{margin-top:12px;padding:12px 14px;border:1px dashed var(--v3-line);border-radius:8px;background:var(--v3-card);
  font-size:12px;color:var(--v3-sub);line-height:1.6}
.mc3-ajp[hidden]{display:none}
.mc3-ajp .fila{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mc3-ajp .fila+.fila{margin-top:10px;padding-top:10px;border-top:1px solid var(--v3-line2)}
.mc-brk{display:inline-block;font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--v3-ink);
  border:1px solid var(--v3-line);background:var(--v3-card);padding:4px 9px;border-radius:4px;cursor:pointer}
.mc-brk:hover{border-color:var(--v3-gold);color:var(--v3-gold2)}
.mc-brk-in{font:400 12px 'IBM Plex Sans',system-ui,sans-serif;padding:4px 8px;background:var(--v3-card);border:1px solid var(--v3-gold);
  border-radius:4px;color:var(--v3-ink);width:140px;outline:none}
.mc-del{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-dn);background:none;
  border:1px solid var(--v3-line);padding:6px 12px;border-radius:5px;cursor:pointer;white-space:nowrap}
.mc-del:hover{border-color:var(--v3-dn)}

/* ── venta: el formulario que abre "Vendí" ── */
.mc-vrow{background:var(--v3-hover);border-bottom:1px solid var(--v3-line);border-left:3px solid var(--v3-serie);padding:14px 18px;cursor:default}
.mc-vform{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:4px 0}
.mc-vform label{display:block;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-mut);margin-bottom:3px}
.mc-vform input{padding:7px 9px;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:6px;color:var(--v3-ink);
  font:500 13px 'IBM Plex Mono',monospace;width:140px;outline:none}
.mc-vform input:focus{border-color:var(--v3-gold)}
.mc-vform .prev{font-size:12.5px;color:var(--v3-sub);align-self:center;min-width:200px}
.mc-vform .prev b{font-family:'IBM Plex Mono',monospace}
.mc-vform .nota{flex-basis:100%;font-size:11.5px;color:var(--v3-mut);line-height:1.5}
.mc-undo{background:none;border:none;color:var(--v3-mut);cursor:pointer;font-size:11px;text-decoration:underline;padding:0}
.mc-undo:hover{color:var(--v3-gold2)}

/* ── avisos del sync ── */
.mc-aj{background:var(--v3-warnBg);border:1px solid var(--v3-line);border-left:3px solid var(--v3-warn);border-radius:12px;padding:12px 16px;margin-bottom:14px}
.mc-aj .t{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut)}
.mc-aj p{margin:4px 0 8px;font-size:13.5px;color:var(--v3-ink);line-height:1.5}

/* ── botones y formulario de alta ── */
.mc-btn{font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#0E1830;
  background:var(--v3-goldL);border:1px solid var(--v3-goldL);padding:10px 18px;border-radius:7px;cursor:pointer;
  transition:background .15s,color .15s,border-color .15s}
.mc-btn:hover{background:var(--v3-card);color:var(--v3-ink);border-color:var(--v3-gold)}
.mc-btn[disabled]{opacity:.5;cursor:default}
.mc-btn.sec{background:transparent;color:var(--v3-ink);border:1px solid var(--v3-line)}
.mc-btn.sec:hover{border-color:var(--v3-gold)}
.mc-btn-mini{padding:7px 12px;font-size:10px}
.mc-msg{font-size:12px;margin-top:10px}
.mc-form{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:18px 20px;margin-bottom:18px;scroll-margin-top:160px}
.mc-form .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr));gap:12px;align-items:end}
.mc-form label{display:block;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-mut);margin-bottom:5px}
.mc-form input,.mc-form select{width:100%;padding:10px 12px;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:6px;
  color:var(--v3-ink);font:400 14px 'IBM Plex Sans',system-ui,sans-serif;outline:none}
.mc-form select{font-size:13.5px}
.mc-form input:focus,.mc-form select:focus{border-color:var(--v3-gold)}
.mc-tabs{display:flex;gap:2px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
.mc-tab{font:500 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;background:none;border:none;
  border-bottom:2px solid transparent;color:var(--v3-mut);cursor:pointer;white-space:nowrap;transition:color .15s}
.mc-tab:hover{color:var(--v3-ink)}
.mc-tab.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}
.mc-cerrar{margin-left:auto;font:600 10px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:var(--v3-mut);background:none;border:none;cursor:pointer;padding:8px 4px}
.mc-cerrar:hover{color:var(--v3-ink)}
.mc-imp textarea{width:100%;min-height:120px;padding:12px;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:6px;
  color:var(--v3-ink);font:400 12.5px 'IBM Plex Mono',ui-monospace,monospace;outline:none;resize:vertical}
.mc-imp textarea:focus{border-color:var(--v3-gold)}
.mc-hint{font-size:11.5px;color:var(--v3-mut);line-height:1.7;margin:8px 0 12px}
.mc-hint b{color:var(--v3-sub)}
.mc-prev{margin-top:12px;border:1px solid var(--v3-line);border-radius:10px;overflow-x:auto}
.mc-prev table{width:100%;border-collapse:collapse;font-size:12.5px}
.mc-prev th{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);padding:8px 10px;
  border-bottom:1px solid var(--v3-line);text-align:left;white-space:nowrap}
.mc-prev td{padding:8px 10px;border-bottom:1px solid var(--v3-line2);color:var(--v3-ink);white-space:nowrap}
.mc-prev tr:last-child td{border-bottom:none}
.mc-bad{color:var(--v3-dn)}
.mc-subnav{font-size:12px;color:var(--v3-mut);margin:8px 0 0}
.mc-subnav a{color:var(--v3-gold);text-decoration:none;font-weight:600}
.mc-subnav a:hover{color:var(--v3-gold2)}
.mc-subnav span{margin:0 4px}

/* ── estados vacíos y pie ── */
.mc-empty{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:34px 28px;text-align:center}
.mc-empty h4{font:700 20px 'Playfair Display',serif;color:var(--v3-ink);margin-bottom:8px;line-height:1.2}
.mc-empty p{font-size:13px;color:var(--v3-sub);line-height:1.7;max-width:520px;margin:0 auto}
.mc-cargando{color:var(--v3-sub);font-size:13px}
.mc-foot{font-size:11px;color:var(--v3-mut);line-height:1.7;margin-top:22px;max-width:860px}

/* ── lectura, análisis y renta fija ── */
.mc-lect{background:var(--v3-card);border:1px solid var(--v3-line);border-left:3px solid var(--v3-gold);border-radius:12px;
  padding:14px 18px;margin-top:22px;font-size:13px;color:var(--v3-sub);line-height:1.7}
.mc-lect b{color:var(--v3-ink)}
.mc-an{margin-top:26px}
.mc-an h4,.mc-ventas h4{font:700 19px 'Playfair Display',serif;color:var(--v3-ink);margin:0 0 6px;line-height:1.2}
.mc-an .sub,.mc-ventas .sub{font-size:12.5px;color:var(--v3-mut);line-height:1.6;margin-bottom:14px;max-width:780px}
.mc-angrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:14px}
.mc-anbox{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:16px 18px;min-width:0;overflow-x:auto}
.mc-anbox .t{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin-bottom:12px}
.mc-bar{display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:12.5px}
.mc-bar .n{flex:none;width:104px;color:var(--v3-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-bar .t2{flex:1;height:6px;background:var(--v3-track2);border-radius:3px;overflow:hidden}
.mc-bar .t2 i{display:block;height:100%;background:var(--v3-gold);border-radius:3px}
.mc-bar .p{flex:none;width:46px;text-align:right;color:var(--v3-sub);font:500 11.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.mc-anbox .nota{font-size:11.5px;color:var(--v3-mut);line-height:1.6;margin-top:10px}
.mc-anbox .nota b{color:var(--v3-ink)}
.mc-rf{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
.mc-rf th{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--v3-mut);padding:7px 8px;
  border-bottom:1px solid var(--v3-line);text-align:right;white-space:nowrap}
.mc-rf th:first-child,.mc-rf td:first-child{text-align:left}
.mc-rf td{padding:7px 8px;border-bottom:1px solid var(--v3-line2);color:var(--v3-ink);text-align:right;
  font:500 12px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.mc-rf td:first-child b{font:700 12px 'IBM Plex Sans',sans-serif;color:var(--v3-gold)}
.mc-rf tr:last-child td{border-bottom:none}

/* ── ventas y resultado realizado ── */
.mc-ventas{margin-top:26px}
.mc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:14px;margin-bottom:14px}
.mc-k{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:14px 16px}
.mc-k .l{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin-bottom:9px}
.mc-k .v{font:600 22px 'IBM Plex Mono',monospace;line-height:1.1;color:var(--v3-ink);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.mc-k .v.mc-pos{color:var(--v3-up)}.mc-k .v.mc-neg{color:var(--v3-dn)}
.mc-k .s{font-size:11px;color:var(--v3-mut);margin-top:5px}
.mc-tblwrap{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow-x:auto}
.mc-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}
.mc-tbl th{font:700 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);
  padding:10px 12px;border-bottom:1px solid var(--v3-line);text-align:right;white-space:nowrap}
.mc-tbl th.l{text-align:left}
.mc-tbl td{padding:11px 12px;border-bottom:1px solid var(--v3-line2);color:var(--v3-ink);text-align:right;
  font:500 12.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.mc-tbl td.l{text-align:left;font:400 13px 'IBM Plex Sans',system-ui,sans-serif}
.mc-tbl td.mc-pos{color:var(--v3-up)}.mc-tbl td.mc-neg{color:var(--v3-dn)}.mc-tbl td.mc-mut{color:var(--v3-mut)}
.mc-tbl tr:last-child td{border-bottom:none}
.mc-tbl tbody tr:hover td{background:var(--v3-hover)}
.mc-tk{font:700 13px 'IBM Plex Sans',sans-serif;color:var(--v3-gold)}
.mc-nm{display:block;font:400 11px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut)}

/* ── angosto: la fila pasa a cuatro líneas, sin scroll horizontal ──
   Se mide la CAJA de la tabla (no la ventana): con el lateral abierto, entre
   920 y ~1180 px la grilla de 990 px tampoco entra. El corte es el ancho
   mínimo de .mc3-in menos uno: así no queda ninguna franja en la que la vista
   ancha esté puesta pero la fila no entre. Sin container queries (navegadores
   viejos) queda el scroll dentro de la caja, como el prototipo. */
.mc3-tbl{container-type:inline-size;container-name:mc3t}
@container mc3t (max-width:989px){
  .mc3-in{min-width:0}
  /* el encabezado no desaparece: queda como una línea de "ordenar por" (en el
     celular también se ordena, como antes) */
  .mc3-hd{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;padding:10px 14px}
  .mc3-hd::before{content:"Ordenar:";font-weight:600;color:var(--v3-mut)}
  .mc3-hd>span:last-child{display:none}
  /* "Hoy" no entra en la línea de Valor y Resultado sin apretar los números:
     va abajo, en su propio renglón y con el rótulo adelante */
  .mc3-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 14px;
    grid-template-areas:"act act rot" "meta meta rot" "val pl rot" "hoy hoy rot";
    gap:6px 12px;padding:12px 14px}
  .mc3-row>.c-act{grid-area:act}
  .mc3-row>.c-meta{display:block;grid-area:meta}
  .mc3-row>.c-val{grid-area:val;text-align:left}
  .mc3-row>.c-pl{grid-area:pl}
  .mc3-row>.c-hoy{grid-area:hoy;text-align:left;font-size:12px}
  .mc3-row>.c-hoy .mc3-hoyk{display:inline}
  .mc3-row>.c-hoy small{display:inline;margin:0 0 0 6px}
  .mc3-row>.c-rot{grid-area:rot;align-self:center}
  .mc3-row>.c-brk,.mc3-row>.c-cnt,.mc3-row>.c-px{display:none}
  .mc3-grp{padding:9px 14px}
  .mc3-mets{padding:14px 14px 0}
  .mc3-cols{padding:14px 14px 18px}
  .mc-vrow{padding:12px 14px}
}
@media (max-width:760px){.mc-form{padding:16px}}
`;

/* ── brokers y mercados ──
   El inversor argentino tiene las tenencias repartidas (IOL, PPI, Binance…):
   cada posición lleva su broker y la tabla se agrupa con subtotales. El
   mercado define cómo se guarda el ticker: en BYMA "GGAL" es la acción local
   en pesos (GGAL.BA), en el exterior es el ADR en dólares. */
const BROKERS = ["IOL", "PPI", "Balanz", "Bull Market", "Cocos", "Binance", "Lemon", "Belo", "Otro"];
const MERCADOS = [["byma", "BYMA · pesos (acciones, CEDEARs, bonos)"],
                  ["ext", "Exterior · dólares (NYSE / Nasdaq)"],
                  ["cripto", "Cripto"]];
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

/* Ticker canónico según el mercado. Los bonos y letras (AL30, S30O6, GD30D…)
   quedan SIN sufijo, que es como los lista el panel de bonos y como los guarda
   el sync. Antes solo se reconocían si el panel ya había cargado: con el set
   vacío, AL30 en "BYMA" se guardaba como AL30.BA y después nada lo encontraba
   (ni precio del panel, ni ficha, ni cupones). Ahora canon() también mira el
   patrón del ticker, y un AL30.BA tipeado a mano se limpia. */
export function normalizarTicker(ticker, mercado, bonosSet = new Set()) {
  const t = String(ticker || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!t) return "";
  const c = canon(t, bonosSet);
  if (esRentaFija(c, bonosSet)) return c;
  if (mercado === "byma") return t.endsWith(".BA") ? t : t + ".BA";
  if (mercado === "cripto") return t.endsWith("-USD") ? t : t + "-USD";
  return t;
}

/* el subtotal del día de un grupo: suma solo las filas que traen la variación
   (las otras muestran un guion y no entran, igual que en el total de arriba) */
const hoyDe = fs => {
  const con = fs.filter(f => f.dHoy != null);
  return { hoy: con.length ? con.reduce((a, f) => a + f.dHoy, 0) : null, hoyN: con.length };
};

/* Subtotales por broker sobre las filas ya calculadas. */
export function agruparPorBroker(filas, total) {
  const m = new Map();
  filas.forEach(f => {
    const k = String(f.broker || "").trim() || "Sin broker";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  });
  return [...m.entries()].map(([broker, fs]) => {
    const valor = fs.reduce((a, f) => a + (f.dValor ?? 0), 0);
    const costo = fs.reduce((a, f) => a + (f.dValor != null ? (f.dCosto ?? 0) : 0), 0);
    return { broker, filas: fs, valor, costo, pl: valor - costo,
             plPct: costo > 0 ? (valor - costo) / costo * 100 : null,
             peso: total > 0 ? valor / total * 100 : null, ...hoyDe(fs) };
  }).sort((a, b) => b.valor - a.valor || a.broker.localeCompare(b.broker));
}

/* El panel de bonos se pide UNA vez y se guarda la PROMESA, no el valor.
   Antes se asignaba un Set vacío antes del await: el segundo que llamaba
   mientras la consulta estaba en vuelo se llevaba el set vacío, y con él los
   CER y dólar linked (TX26, DICP…) dejaban de ser renta fija, porque no tienen
   un patrón de ticker que los delate: sin link, sin mercado, sin nada.
   Además el documento se descargaba dos veces (acá para las claves y en
   cargarRentaFija para el resto): ahora se conserva entero. */
let _panelProm = null;
function panelBonosDoc() {
  if (!_panelProm) {
    _panelProm = (async () => {
      try {
        const snap = await getDoc(doc(getFirestore(getApp()), "bonosPanel", "latest"));
        return snap.exists() ? JSON.parse(snap.data().json || "{}") : null;
      } catch (e) { return null; }
    })();
    // una falla no queda cacheada para siempre: el próximo intento vuelve a pedir
    _panelProm.then(v => { if (!v) _panelProm = null; });
  }
  return _panelProm;
}
async function bonosSet() {
  const p = await panelBonosDoc();
  return new Set(Object.keys((p && p.todos) || {}));
}

/* ── "Ocultar $" ──
   El botón de arriba tapa los importes en plata y deja los porcentajes y las
   cantidades, que es lo que sirve para mostrarle la pantalla a alguien. Se tapa
   acá, en las dos funciones por las que pasa TODA la plata de la pantalla (la
   tabla, los totales, los gráficos, el desplegable, las ventas y los avisos del
   sync): así no queda ningún importe suelto afuera y no hay que acordarse de
   taparlo en cada lugar nuevo. Es solo visual: los datos no cambian. */
const OCULTO = "•••••";
let _ocultar = pref("valtia-mc-ocultar", "") === "1";

// el importe formateado, SIN tapar: lo usa la vista previa de la importación,
// donde el usuario tiene que poder revisar lo que pegó antes de guardarlo
const montoTxt = (n, cur) => (Number(n) < 0 ? "−" : "") + (cur === "ARS" ? "$" : "US$") +
  Math.abs(Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: Math.abs(n) < 1000 ? 2 : 0 });
const money = (n, cur) => _ocultar ? OCULTO : montoTxt(n, cur);
// con signo explícito (para resultados): +US$930 / −US$160
const moneyS = (n, cur) => _ocultar ? OCULTO : (Number(n) >= 0 ? "+" : "") + montoTxt(n, cur);
// los pocos importes que se arman a mano en dólares (cupones y vencimientos)
const usdRedondo = n => _ocultar ? OCULTO : "US$" + Math.round(Number(n) || 0).toLocaleString("es-AR");

/* el panel (panel.js) cachea la cartera: cuando cambia acá, se le avisa */
function avisarPanel() {
  // los eventos del desplegable marcan "tuyo" con la cartera: se recalculan con la nueva
  _evCache = { email: null, t: 0, p: null };
  try { if (window.valtiaPanel && window.valtiaPanel.refrescar) window.valtiaPanel.refrescar(); } catch (e) {}
}

/* ── moneda de visualización (como el portafolio de IOL) ──
   Las posiciones se guardan en la moneda en la que cotizan (los CEDEARs y
   acciones locales en pesos, las de EE.UU. en dólares) y acá se convierten
   a lo que el usuario elija: pesos, dólar CCL o dólar MEP. */
let _fx = { ccl: null, mep: null, meta: { ccl: null, mep: null }, ok: false, motivo: null };
// con el almacenamiento bloqueado, localStorage.getItem TIRA: acá, al cargar el
// módulo, eso tumbaba también panel.js (que lo importa). pref() lo atrapa.
let _cur = pref("valtia-mc-cur", "ARS");

// convertir() vive en fx.js (es tipo de cambio puro) y se re-exporta de acá
// para que panel.js siga importándola de este módulo sin cambios.

const curLabel = () => (_cur === "ARS" ? "ARS" : "USD");

/* ventas y avisos: lo que se CARGA va en la moneda en que cotiza el activo
   (la que muestra el broker) y lo que se MUESTRA va en la moneda elegida
   arriba, con el importe original abajo. Sin dólar para convertir, queda en su
   moneda. enLinea: el original entre paréntesis, para textos corridos. */
const monNombre = m => m === "ARS" ? "en pesos ($)" : m === "USD" ? "en dólares (US$)" : "moneda sin confirmar";
function enVista(valor, moneda, signo = false, enLinea = false) {
  const f = signo ? moneyS : money;
  if (valor == null || !moneda) return "—";
  // tapado: una sola pastilla, no el importe convertido Y el original tapados
  // dos veces seguidas ("••••• •••••")
  if (_ocultar) return OCULTO;
  const cur = curLabel();
  const c = moneda === cur ? null : convertir(valor, moneda, _cur, _fx);
  if (c == null || !isFinite(c)) return f(valor, moneda);
  const orig = f(valor, moneda);
  return f(c, cur) + (enLinea ? ` <span class="mc-orig il">(${orig})</span>` : `<span class="mc-orig">${orig}</span>`);
}
/* "(≈ US$4,13 al CCL de hoy)": el formulario se llena en la moneda del activo */
function aprox(valor, moneda, signo = false) {
  const cur = curLabel();
  // con los importes tapados, el equivalente sería "(≈ ••••• al CCL de hoy)"
  // al lado de un número que el usuario está tipeando: no aporta nada
  if (_ocultar) return "";
  if (valor == null || !moneda || moneda === cur) return "";
  const c = convertir(valor, moneda, _cur, _fx);
  if (c == null || !isFinite(c)) return "";
  return ` <span class="mc-mut" style="font-weight:400">(≈ ${(signo ? moneyS : money)(c, cur)} al ${_cur === "MEP" ? "MEP" : "CCL"} de hoy)</span>`;
}
const pct = n => (n >= 0 ? "+" : "") + Number(n).toFixed(2).replace(".", ",") + "%";
const num = (n, d = 1) => n == null ? "—" : Number(n).toFixed(d).replace(".", ",");
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const verCls = v => v === "Infravalorada" ? "infra" : v === "Estirada" ? "cara"
                  : v === "En precio" ? "precio" : "sin";

/* ── importación desde Excel ──
   Acepta filas pegadas de una planilla o del broker, separadas por tabs,
   comas, punto y coma o espacios: TICKER · cantidad · precio · fecha.
   Números en formato argentino (1.900,50) o inglés (1900.50). ── */
export function parseNum(s) {
  let t = String(s ?? "").replace(/[^\d.,-]/g, "").trim();  // saca $ , US$, espacios
  if (!t) return NaN;
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  if (coma > -1 && punto > -1) {
    // el separador decimal es el que aparece último: 1.900,50 o 1,900.50
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma > -1) {
    t = t.replace(",", ".");                       // 1900,50
  } else if (punto > -1) {
    // solo punto: "1.900" son miles, "180.50" es decimal — pero un número
    // que empieza en "0." nunca es miles (cantidades cripto: 0.125 BTC)
    const dec = t.length - punto - 1;
    if (dec === 3 && t.replace(/[.-]/g, "").length > 3
        && !t.startsWith("0.") && !t.startsWith("-0.")) t = t.replace(/\./g, "");
  }
  return parseFloat(t);
}

export function parseImport(texto) {
  const filas = [], errores = [];
  String(texto || "").split(/\r?\n/).forEach((linea, i) => {
    const cruda = linea.trim();
    if (!cruda) return;
    // separador por prioridad: la coma va última porque también es el
    // separador decimal argentino (150,50 no debe partirse en dos columnas)
    const sep = cruda.includes("\t") ? /\t/
              : cruda.includes(";") ? /;/
              : /\s/.test(cruda) ? /\s+/
              : /,/;
    const c = cruda.split(sep).map(x => x.trim().replace(/^[,;]+|[,;]+$/g, "")).filter(x => x !== "");
    if (c.length < 2) { errores.push(`Línea ${i + 1}: faltan datos ("${cruda.slice(0, 30)}")`); return; }
    const ticker = c[0].toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    const cant = parseNum(c[1]);
    if (!ticker || ticker.length > 12) { errores.push(`Línea ${i + 1}: ticker inválido ("${c[0].slice(0, 14)}")`); return; }
    if (!isFinite(cant) || cant <= 0) {
      // probablemente el encabezado de la planilla: se ignora sin ruido
      if (i === 0 || /cantidad|ticker|s[ií]mbolo|activo/i.test(cruda)) return;
      errores.push(`Línea ${i + 1}: cantidad inválida ("${c[1]}")`);
      return;
    }
    const precio = c.length > 2 ? parseNum(c[2]) : NaN;
    // la fecha se busca en cualquier columna, en formato ISO o dd/mm/aaaa
    const iso = c.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x));
    const dmy = c.find(x => /^\d{2}\/\d{2}\/\d{4}$/.test(x));
    const fecha = iso || (dmy ? dmy.split("/").reverse().join("-") : "");
    filas.push({ ticker, cantidad: cant, precioCompra: isFinite(precio) ? precio : 0, fecha });
  });
  return { filas, errores };
}

/* moneda en la que cotiza lo que se carga: BYMA es pesos, salvo las especies
   en dólares del panel de bonos (AL30D, GD30C); exterior y cripto, dólares.
   Es lo que se guarda en la posición y lo que hereda una venta registrada
   antes de que exista el precio. */
export function monedaMercado(mercado, tk, bonos = new Set()) {
  if (mercado !== "byma") return "USD";
  return bonos.has(tk) && /[DC]$/.test(tk) ? "USD" : "ARS";
}

/* ── cálculo: posiciones + precios → filas con resultado ── */
/* moneda de una posición: la del precio, la guardada o, si no hay ninguna, la
   que indica el ticker (GGAL.BA en pesos, AL30D en dólares), no USD a ciegas.
   La usan la tabla y la simulación de la evolución: tienen que coincidir. */
export const monedaPosicion = (p, px, bonos = _bonos) => (px && px.moneda) || p.moneda || monedaProbable(p.ticker, bonos);

/* ── la variación del día, en por ciento ──
   Las acciones, los CEDEARs y la cripto la traen en su propio documento de
   precios (campo d, el que ya usa desglose() para la fila "Hoy"). La renta fija
   NO: el sync no se la escribe, así que sale del panel de bonos (campo v), que
   es de donde salen también sus precios. Si no está en ninguno de los dos,
   devuelve null y la fila muestra un guion: un cero se leería como "no se
   movió", que es otra cosa. */
const GRUPOS_RF = ["soberanos", "bopreal", "tasa_fija", "cer", "dolar_linked"];
function variacionDia(ticker, px, bonos = _bonos, panel = _panel) {
  const d = px && px.d != null ? Number(px.d) : null;
  if (d != null && isFinite(d)) return d;
  const tk = String(ticker || "").toUpperCase();
  if (!panel || !tk || !esRentaFija(tk, bonos)) return null;
  // la misma clave que usa completarPreciosDeRentaFija para buscar el precio:
  // si el precio salió de todos[esp], la variación tiene que salir de ahí
  const esp = canon(tk, bonos);
  const b = (panel.todos || {})[esp];
  if (b && b.v != null && isFinite(Number(b.v))) return Number(b.v);
  // si esa especie no está en "todos", se la busca en su grupo (es la misma
  // vuelta que da el Resumen del panel: las dos pantallas tienen que coincidir)
  const g = GRUPOS_RF.map(k => (panel[k] || []).find(x => x && String(x.s || "").toUpperCase() === esp)).find(Boolean);
  return g && g.v != null && isFinite(Number(g.v)) ? Number(g.v) : null;
}

export function calcular(posiciones, precios, cur = _cur, fx = _fx, bonos = _bonos, panel = _panel) {
  const filas = posiciones.map(p => {
    const px = precios[String(p.ticker).toUpperCase()] || null;
    const moneda = monedaPosicion(p, px, bonos);
    const actual = px && px.precio != null ? px.precio : null;
    // factor de lámina: los bonos cotizan cada 100 nominales (factor 0,01),
    // las acciones y CEDEARs 1 a 1. Los precios se muestran como cotizan;
    // el factor solo entra en los totales. Si la posición no lo trae, se usa
    // el del doc de precios (el sync lo marca para la renta fija BYMA).
    const fac = Number(p.factor) > 0 ? Number(p.factor)
              : (px && Number(px.factor) > 0 ? Number(px.factor) : 1);
    const costo = (Number(p.cantidad) || 0) * (Number(p.precioCompra) || 0) * fac;
    const valor = actual != null ? (Number(p.cantidad) || 0) * actual * fac : null;
    const c = v => convertir(v, moneda, cur, fx);   // a la moneda elegida
    const dCosto = c(costo), dValor = c(valor);
    const dPl = (dValor != null && dCosto != null) ? dValor - dCosto : null;
    // lo que se movió HOY esta posición: el cierre de ayer sale de la variación
    // del día (previo = precio / (1 + d/100)) y la diferencia se multiplica por
    // lo que tenés. Una variación de −100% dejaría el cierre de ayer en cero:
    // ahí no hay cuenta posible y queda en null.
    const hoyPct = variacionDia(p.ticker, px, bonos, panel);
    const previo = (hoyPct != null && 1 + hoyPct / 100 > 0 && actual != null) ? actual / (1 + hoyPct / 100) : null;
    const hoy = previo != null ? (Number(p.cantidad) || 0) * (actual - previo) * fac : null;
    const dHoy = dValor != null ? c(hoy) : null;
    return { ...p, px, moneda, actual, costo, valor,
             dCompra: c(Number(p.precioCompra) || 0), dActual: c(actual),
             dCosto, dValor, dPl, hoyPct: dHoy != null ? hoyPct : null, hoy, dHoy,
             plPct: (valor != null && costo > 0) ? (valor - costo) / costo * 100 : null };
  });
  const total = filas.reduce((s, f) => s + (f.dValor ?? 0), 0);
  const costoTot = filas.reduce((s, f) => s + (f.dValor != null ? (f.dCosto ?? 0) : 0), 0);
  const plTot = total - costoTot;
  // el total del día suma SOLO las filas que traen la variación; las otras se
  // cuentan aparte para poder decir cuántas quedaron afuera. El % es sobre el
  // cierre de ayer de esas mismas filas (dValor − dHoy), no sobre el total.
  const conHoy = filas.filter(f => f.dHoy != null);
  const hoyTot = conHoy.reduce((s, f) => s + f.dHoy, 0);
  const hoyBase = conHoy.reduce((s, f) => s + (f.dValor - f.dHoy), 0);
  filas.forEach(f => { f.peso = total > 0 && f.dValor != null ? f.dValor / total * 100 : null; });
  return { filas, total, costoTot, plTot,
           plTotPct: costoTot > 0 ? plTot / costoTot * 100 : null,
           hoyTot: conHoy.length ? hoyTot : null,
           hoyTotPct: hoyBase > 0 ? hoyTot / hoyBase * 100 : null,
           hoyN: conHoy.length,
           hoySin: filas.filter(f => f.dValor != null && f.dHoy == null).length };
}

/* ── lectura Valtia: qué le dice la valuación sobre SU cartera ── */
function lectura(r) {
  const conVer = r.filas.filter(f => f.px && f.px.veredicto && f.px.veredicto !== "Sin cobertura");
  if (!conVer.length) return "";
  const peso = v => conVer.filter(f => f.px.veredicto === v)
                          .reduce((s, f) => s + (f.peso || 0), 0);
  const est = peso("Estirada"), inf = peso("Infravalorada");
  const partes = [];
  if (est > 0) partes.push(`<b>${est.toFixed(0)}%</b> de tu cartera está en activos que nuestra lectura marca <b>estirados</b>`);
  if (inf > 0) partes.push(`<b>${inf.toFixed(0)}%</b> en activos <b>infravalorados</b>`);
  const corto = f => esc(base(f.ticker));
  const sobrev = conVer.filter(f => f.px.rsi != null && f.px.rsi > 70).map(corto);
  const sobrec = conVer.filter(f => f.px.rsi != null && f.px.rsi < 30).map(corto);
  let extra = "";
  if (sobrev.length) extra += ` ${sobrev.join(", ")} viene${sobrev.length > 1 ? "n" : ""} sobrecomprado${sobrev.length > 1 ? "s" : ""} (RSI &gt; 70).`;
  if (sobrec.length) extra += ` ${sobrec.join(", ")} está${sobrec.length > 1 ? "n" : ""} sobrevendido${sobrec.length > 1 ? "s" : ""} (RSI &lt; 30).`;
  if (!partes.length && !extra) return "";
  return `<div class="mc-lect">Lectura Valtia: ${partes.join(" y ")}.${extra}</div>`;
}

/* ── Análisis de la cartera: cómo está repartida y qué riesgo tiene ──
   Todo se calcula en el navegador sobre las filas ya valuadas: no hace
   falta ningún dato nuevo. Lo que no se puede clasificar se declara. */
function barras(titulo, partes, total, nota) {
  const vis = partes.filter(p => p.v > 0).sort((a, b) => b.v - a.v);
  if (!vis.length) return "";
  return `<div class="mc-anbox"><div class="t">${titulo}</div>
    ${vis.map(p => {
      const q = total > 0 ? p.v / total * 100 : 0;
      return `<div class="mc-bar"><span class="n" title="${esc(p.n)}">${esc(p.n)}</span>
        <span class="t2"><i style="width:${q.toFixed(1)}%"></i></span>
        <span class="p">${q.toFixed(0)}%</span></div>`;
    }).join("")}
    ${nota ? `<div class="nota">${nota}</div>` : ""}</div>`;
}

const MERCADO_NOMBRE = { byma: "BYMA (pesos)", ext: "Exterior (dólares)", cripto: "Cripto", rf: "Renta fija" };

function analisis(r, cur, bonos, extra) {
  const con = r.filas.filter(f => f.dValor != null && f.dValor > 0);
  if (con.length < 2) return "";
  const total = con.reduce((s, f) => s + f.dValor, 0);
  const suma = fn => {
    const m = new Map();
    con.forEach(f => { const k = fn(f); if (k) m.set(k, (m.get(k) || 0) + f.dValor); });
    return [...m.entries()].map(([n, v]) => ({ n, v }));
  };
  const porMoneda = suma(f => f.moneda === "ARS" ? "En pesos" : "En dólares");
  const porMercado = suma(f => MERCADO_NOMBRE[mercadoDe(f.ticker, bonos)] || "Otro");
  const sectores = suma(f => sectorDe(f.ticker, bonos));
  const clasif = sectores.reduce((s, x) => s + x.v, 0);
  const sinSector = total - clasif;
  const porBroker = suma(f => String(f.broker || "").trim() || "Sin broker");

  // concentración: cuánto pesan las posiciones más grandes
  const pesos = con.map(f => f.dValor / total * 100).sort((a, b) => b - a);
  const topN = n => pesos.slice(0, n).reduce((s, x) => s + x, 0);
  const mayor = con.slice().sort((a, b) => b.dValor - a.dValor)[0];
  // el aviso de concentración vive ahora en la card "Peso de cada posición" (arriba
  // de la tabla): repetirlo acá, con otro umbral, decía lo mismo dos veces

  return `<div class="mc-an">
    <h4>Análisis de tu cartera</h4>
    <div class="sub">Cómo está repartido lo que tenés, sumando todos tus brokers. Calculado sobre
      ${con.length} de ${r.filas.length} posiciones (las que ya tienen precio).</div>
    <div class="mc-angrid">
      ${barras("Por moneda", porMoneda, total,
        porMoneda.length > 1 ? "El % en pesos es tu exposición al peso, aunque lo mires en dólares." : "")}
      ${barras("Por mercado", porMercado, total, "")}
      ${barras("Por broker", porBroker, total,
        porBroker.some(b => b.n === "Sin broker") ? "Poné el broker desde «Ajustar», en el desplegable de cada fila, para completar el reparto." : "")}
      ${barras("Por sector", sectores, total,
        sinSector > 0 ? `${(sinSector / total * 100).toFixed(0)}% sin sector asignado: son activos que Valtia todavía no cubre.` : "")}
      <div class="mc-anbox"><div class="t">Concentración</div>
        <div class="mc-bar"><span class="n">Mayor posición</span><span class="t2"><i style="width:${Math.min(100, pesos[0]).toFixed(1)}%"></i></span><span class="p">${pesos[0].toFixed(0)}%</span></div>
        ${pesos.length >= 3 ? `<div class="mc-bar"><span class="n">Top 3</span><span class="t2"><i style="width:${Math.min(100, topN(3)).toFixed(1)}%"></i></span><span class="p">${topN(3).toFixed(0)}%</span></div>` : ""}
        ${pesos.length >= 5 ? `<div class="mc-bar"><span class="n">Top 5</span><span class="t2"><i style="width:${Math.min(100, topN(5)).toFixed(1)}%"></i></span><span class="p">${topN(5).toFixed(0)}%</span></div>` : ""}
        <div class="nota">${con.length} posiciones con precio. La mayor es <b>${esc(base(mayor.ticker))}</b>.</div>
      </div>
      ${extra || ""}
    </div>
  </div>`;
}

/* Renta fija: qué rinde cada especie y qué vas a cobrar en los próximos meses */
function analisisRentaFija(r, bonos, panel, flujos, hoy) {
  const rf = r.filas.filter(f => esRentaFija(f.ticker, bonos));
  if (!rf.length) return "";
  const sob = [...(panel.soberanos || []), ...(panel.bopreal || [])];
  // CER y dólar linked no están en soberanos ni en tasa_fija: su vencimiento
  // sale del mapa que publica el pipeline. Antes la fila salía con tres guiones
  // aunque la fecha existía.
  const venc = panel.vencimientos || {};
  const filas = rf.map(f => {
    const esp = base(f.ticker), par = parBono(esp, bonos);
    const b = sob.find(x => x.s === esp) || sob.find(x => parBono(x.s) === par && /D$/.test(x.s));
    const l = (panel.tasa_fija || []).find(x => x.s === esp);
    const tasa = b && b.tir != null ? `TIR ${b.tir.toFixed(1).replace(".", ",")}%`
               : l && l.tem != null ? `TEM ${l.tem.toFixed(2).replace(".", ",")}%` : "—";
    const vence = (b && b.vence) || (l && l.vence) || venc[esp] || venc[par] || "";
    return `<tr><td><b>${esc(esp)}</b></td><td>${Number(f.cantidad).toLocaleString("es-AR")}</td>
      <td>${tasa}</td><td>${b && b.paridad != null ? b.paridad.toFixed(1).replace(".", ",") : "—"}</td>
      <td>${vence ? vence.split("-").reverse().join("/") : "—"}</td></tr>`;
  }).join("");
  // próximos cobros a 90 días (cupones, amortizaciones y vencimientos)
  const corte = new Date(Date.parse(hoy) + 90 * 86400e3).toISOString().slice(0, 10);
  const cobros = [];
  rf.forEach(f => {
    const esp = base(f.ticker), par = parBono(esp);
    const d = flujos[esp] || flujos[par];
    if (d && d.flujos) {
      d.flujos.filter(([fe]) => fe >= hoy && fe <= corte)
        .forEach(([fe, m]) => cobros.push({ f: fe, tk: esp, usd: (Number(f.cantidad) || 0) * Number(m) / 100 }));
    }
    const l = (panel.tasa_fija || []).find(x => x.s === esp);
    if (l && l.vence >= hoy && l.vence <= corte && l.vpv)
      cobros.push({ f: l.vence, tk: esp, ars: (Number(f.cantidad) || 0) * Number(l.vpv) / 100 });
    // CER y dólar linked: se sabe CUÁNDO vencen pero no cuánto pagan (el
    // capital ajusta por CER o por el A3500), así que va la fecha sin importe.
    // Solo si no entró ya por flujos o como letra, para no listarlo dos veces.
    const vf = venc[esp] || venc[par];
    if (vf && vf >= hoy && vf <= corte && !l && !(d && d.flujos)) cobros.push({ f: vf, tk: esp });
  });
  cobros.sort((a, b) => a.f.localeCompare(b.f));
  const totalUsd = cobros.reduce((s, c) => s + (c.usd || 0), 0);
  return `<div class="mc-anbox" style="grid-column:1/-1">
    <div class="t">Tu renta fija</div>
    <table class="mc-rf"><thead><tr><th>Especie</th><th>Nominales</th><th>Tasa</th><th>Paridad</th><th>Vence</th></tr></thead>
      <tbody>${filas}</tbody></table>
    ${cobros.length ? `<div class="nota"><b>Próximos 90 días:</b> ${cobros.slice(0, 4).map(c =>
        `${esc(c.tk)} el ${c.f.slice(8, 10)}/${c.f.slice(5, 7)}${c.usd ? ` (~${usdRedondo(c.usd)})` : ""}`).join(" · ")}${cobros.length > 4 ? ` y ${cobros.length - 4} más` : ""}.
      ${totalUsd > 0 ? `Total estimado a cobrar: <b>${usdRedondo(totalUsd)}</b>.` : ""}
      Son estimaciones sobre los nominales que tenés cargados.</div>`
      : `<div class="nota">Sin pagos previstos en los próximos 90 días.</div>`}
  </div>`;
}

let _orden = { col: "dValor", desc: true };

/* los estilos se aseguran acá (y no solo al iniciar) para que cualquier
   render —incluido uno con datos de prueba— se vea igual que en producción */
function asegurarEstilo() {
  if (typeof document === "undefined" || document.getElementById("v3-css-micartera")) return;
  const st = document.createElement("style");
  st.id = "v3-css-micartera";
  st.textContent = STYLE;
  document.head.appendChild(st);
}

/* ── ventas y resultado realizado (el cálculo vive en ventas.js) ── */
const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const fmtFecha = iso => {
  const s = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : "—";
};
const cantTxt = n => num(n, 4).replace(/,0+$/, "");

function seccionVentas(ventas, cur) {
  if (!ventas.length) return "";
  const anio = hoyAR().slice(0, 4);
  // lo que ya está en la moneda de la vista se suma tal cual (US$ en la vista CCL no necesita dólar)
  const s = resumenVentas(ventas, (v, m) => m === cur ? v : convertir(v, m, _cur, _fx), anio);
  const porMon = o => Object.entries(o.porMoneda)
    .map(([m, v]) => `<span class="${v >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(v, m)}</span>`).join(" · ");
  // el total convertido solo se afirma si se pudieron convertir todas; las
  // ventas sin precio de compra no entran en el total, pero se dice cuántas son
  const kpi = (tit, o) => {
    const partes = [];
    if (o.n) partes.push(`${o.n} ${o.n === 1 ? "venta" : "ventas"}`);
    if (o.n && (Object.keys(o.porMoneda).length > 1 || !o.totalCompleto
                || Object.keys(o.porMoneda)[0] !== cur)) partes.push(porMon(o));
    if (o.sinCosto) partes.push(`${o.sinCosto} sin precio de compra`);
    return `<div class="mc-k"><div class="l">${tit}</div>
      <div class="v ${!o.n || !o.totalCompleto ? "" : o.total >= 0 ? "mc-pos" : "mc-neg"}">${!o.n || !o.totalCompleto ? "—" : moneyS(o.total, cur)}</div>
      <div class="s">${partes.join(" · ") || "sin ventas"}</div></div>`;
  };
  const orden = [...ventas].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""))
                                        || String(b.creado || "").localeCompare(String(a.creado || "")));
  const filas = orden.map(v => {
    const { resultado, pct: q } = resultadoVenta(v);
    const m = v.moneda === "ARS" ? "ARS" : "USD";
    const t = tenencia(v);
    const c = x => x == null ? "mc-mut" : x >= 0 ? "mc-pos" : "mc-neg";
    return `<tr>
      <td class="l">${fmtFecha(v.fecha)}</td>
      <td class="l"><span class="mc-tk">${esc(base(v.ticker))}</span><span class="mc-nm">${esc(v.broker || "sin broker")}</span></td>
      <td>${cantTxt(v.cantidad)}</td>
      <td>${Number(v.costoUnitario) > 0 ? enVista(v.costoUnitario, m) : "—"}</td>
      <td>${enVista(v.precioVenta, m)}</td>
      <td class="${c(resultado)}"${resultado == null ? ' title="Sin precio de compra cargado: no se puede calcular"' : ""}>${resultado == null ? "—" : enVista(resultado, m, true)}</td>
      <td class="${c(q)}">${q == null ? "—" : pct(q)}</td>
      <td${t && t.aprox ? ' title="Desde que el sync vio la posición: la compra puede ser anterior"' : ""}>${t == null ? "—" : (t.aprox ? "≥ " : "") + t.dias + " d"}</td>
      <td><button class="mc-undo" data-deshacer="${esc(v.id)}" title="Borra la venta y devuelve la posición a tu cartera">Deshacer</button></td>
    </tr>`;
  }).join("");
  // ¿hay ventas en la otra moneda? ¿se pudieron convertir? (sin dólar, cada
  // venta queda en su moneda y no se dice lo contrario)
  // sinFx: faltó el dólar para sumar algún total (sale de los totales mismos, así
  // el texto nunca contradice al número); mezcla: se convirtió algo con el de hoy
  const sinFx = (s.n > 0 && !s.totalCompleto) || (s.delAnio.n > 0 && !s.delAnio.totalCompleto);
  const otra = ventas.find(v => (v.moneda === "ARS" ? "ARS" : "USD") !== cur);
  const mezcla = !!otra && !sinFx && convertir(1, otra.moneda === "ARS" ? "ARS" : "USD", _cur, _fx) != null;
  // el rótulo de moneda va en cada KPI que sí se pudo sumar
  const etqBase = ` · ${_cur === "ARS" ? "en pesos" : "US$ " + _cur}`;
  const etqDe = o => (o.n > 0 && !o.totalCompleto) ? "" : etqBase;
  const faltaAnio = s.delAnio.n > 0 && !s.delAnio.totalCompleto;
  return `<div class="mc-ventas">
    <h4>Ventas y resultado realizado</h4>
    <div class="sub">Lo que ya vendiste. La ganancia o pérdida quedó fija al vender, contra el precio de compra de esa
      posición, en la moneda en que operaste${mezcla ? `. Acá se muestra en ${_cur === "ARS" ? "pesos" : "dólares " + _cur}
      con la cotización de hoy, igual que el resto de tu cartera (abajo de cada importe, el original), así que no es
      tu resultado medido en esa moneda` : sinFx ? `. <b>No pudimos traer la cotización del dólar</b>: cada
      venta queda en su moneda y ${faltaAnio ? "los totales no se pueden sumar" : "el realizado total no se puede sumar"}; recargá la página en unos minutos` : ""}.${s.sinCosto
      ? ` ${s.sinCosto} ${s.sinCosto === 1 ? "venta sin precio de compra no entra" : "ventas sin precio de compra no entran"} en los totales.` : ""}</div>
    <div class="mc-msg" id="mc-ventas-msg"></div>
    <div class="mc-kpis">${kpi(`Realizado en ${anio}${etqDe(s.delAnio)}`, s.delAnio)}${kpi(`Realizado total${etqDe(s)}`, s)}</div>
    <div class="mc-tblwrap"><table class="mc-tbl"><thead><tr>
      <th class="l">Fecha</th><th class="l">Activo</th><th>Cant.</th><th>Compra</th><th>Venta</th>
      <th>Resultado</th><th>%</th><th title="Días entre la compra y la venta">Tenencia</th><th></th>
    </tr></thead><tbody>${filas}</tbody></table></div>
  </div>`;
}

/* lo que el usuario escribió en un aviso sobrevive a CUALQUIER repintado
   (responder otro aviso, cambiar la moneda, ordenar una columna, el refresco
   de 2 min): se guarda antes de armar el HTML y se repone después */
function escritoEnAvisos(el) {
  const out = {};
  if (!el) return out;
  el.querySelectorAll(".mc-aj").forEach(c => {
    const v = {};
    ["cant", "px", "fecha"].forEach(k => {
      const i = c.querySelector(`[data-aj-${k}]`);
      if (i && i.value !== i.defaultValue) v[k] = i.value;
    });
    if (Object.keys(v).length) out[c.dataset.aj] = v;
  });
  return out;
}
function reponerEscrito(el, escrito) {
  Object.entries(escrito || {}).forEach(([id, v]) => {
    const c = [...el.querySelectorAll(".mc-aj")].find(x => x.dataset.aj === id);
    if (!c) return;
    Object.entries(v).forEach(([k, val]) => { const i = c.querySelector(`[data-aj-${k}]`); if (i) i.value = val; });
  });
}

/* ── avisos del sync: una tarjeta por baja detectada en el broker ── */
function bloqueAjustes(ajustes, precios, bonos) {
  if (!ajustes.length) return "";
  const hoy = hoyAR();
  return ajustes.map(a => {
    const pos = a.pos || {}, px = precios[String(a.ticker || "").toUpperCase()] || null;
    const esRF = esRentaFija(a.ticker, bonos);
    const { moneda, factor } = monedaFactor(pos, px, esRF, a.ticker);
    const unidad = factor !== 1 ? "cada 100 VN" : "por unidad";
    const n = cantidadAjuste(a), costo = Number(pos.precioCompra) > 0 ? Number(pos.precioCompra) : 0;
    const que = a.tipo === "desaparecio"
      ? `ya no aparece en ${esc(a.broker)} (tenías ${cantTxt(a.cantidadAntes)})`
      : `bajó en ${esc(a.broker)} de ${cantTxt(a.cantidadAntes)} a ${cantTxt(a.cantidadBroker)}`;
    return `<div class="mc-aj" data-aj="${esc(a.id)}" data-vid="aj-${esc(a.id)}-${Math.random().toString(36).slice(2, 6)}">
      <div class="t">Movimiento detectado en ${esc(a.broker)} · ${fmtFecha(a.fecha)}</div>
      <p><b>${esc(base(a.ticker))}</b> ${que}. ¿Vendiste <b>${cantTxt(n)}</b>?</p>
      <div class="mc-vform">
        <div><label>Cantidad vendida · de ${cantTxt(n)}</label><input data-aj-cant type="number" step="any" min="0" max="${n}" value="${n}"${moneda ? "" : " disabled"}></div>
        <div><label>Precio de venta · ${monNombre(moneda)}, ${unidad}</label>
          <input data-aj-px type="number" step="any" min="0" placeholder="el que te pagaron"${moneda ? "" : " disabled"}></div>
        <div><label>Fecha de la venta</label><input data-aj-fecha type="date" max="${hoy}"${moneda ? "" : " disabled"}></div>
        <div class="prev" data-aj-prev></div>
        <div><button class="mc-btn" data-aj-ok${moneda ? "" : " disabled"}>Sí, registrar la venta</button>
          ${a.tipo === "desaparecio" ? `<button class="mc-btn sec mc-btn-mini" data-aj-tengo>La sigo teniendo</button>` : ""}
          <button class="mc-undo" data-aj-no>No fue una venta</button></div>
        <div class="nota">Tu costo en esa posición: <b>${costo ? (moneda ? money(costo, moneda) : num(costo, 2)) + " " + unidad + aprox(costo, moneda) : "sin precio de compra, así que el resultado no se va a poder calcular"}</b>.
          Lo vimos el ${fmtFecha(a.fecha)}, pero la venta pudo ser antes: <b>poné el día y el precio reales</b>.
          ${px && px.precio != null && moneda ? `Cotización de hoy, como referencia: ${money(px.precio, moneda)}${aprox(px.precio, moneda)}.` : ""}
          ${a.tipo === "desaparecio" ? `Si la pasaste a otro broker o ${esc(a.broker)} no la mostró ese día, "La sigo teniendo" la devuelve a tu cartera con su costo (si la transferiste, después cambiale el broker desde «Ajustar» en su fila). Si vendiste solo una parte, poné esa cantidad: el resto queda preguntando.` : `La cantidad del panel ya sigue a ${esc(a.broker)}: acá solo se registra el resultado.`}
          ${!moneda ? "<b>Todavía no tenemos la cotización de este activo</b>: esperá a que aparezca su precio para registrar la venta." : ""}</div>
        <div class="mc-msg" data-aj-msg style="flex-basis:100%;margin:0"></div>
      </div></div>`;
  }).join("");
}

/* ══════════════════ Panel v3: gráficos, grilla y desplegable ══════════════════ */

// lo último que se dibujó (para abrir una fila, ordenar o agrupar sin releer nada)
let _vista = null;
let _abierta = null;      // id de la posición desplegada (una sola a la vez)
let _ajAbierto = null;    // id de la posición con "Ajustar" abierto
let _pendiente = null;    // ticker pedido desde otra pestaña antes de que Mi cartera dibujara
let _detCache = {};       // id -> columnas ya armadas del desplegable (no parpadean al repintar)
let _evCache = { email: null, t: 0, p: null };

const AGRUPAR = [["ninguno", "Todas"], ["broker", "Por broker"], ["tipo", "Por tipo"]];
const agruparPref = () => { const v = pref("valtia-mc-agrupar", "ninguno"); return AGRUPAR.some(([k]) => k === v) ? v : "ninguno"; };
const TIPOS_ORDEN = ["Acciones y CEDEARs", "Renta fija", "Cripto"];
const tipoDe = (tk, bonos) => { const m = mercadoDe(tk, bonos); return m === "rf" ? "Renta fija" : m === "cripto" ? "Cripto" : "Acciones y CEDEARs"; };

/* subtotales por tipo, con la misma cuenta que agruparPorBroker */
function agruparPorTipo(filas, total, bonos) {
  const m = new Map();
  filas.forEach(f => { const k = tipoDe(f.ticker, bonos); if (!m.has(k)) m.set(k, []); m.get(k).push(f); });
  return [...m.entries()].map(([nombre, fs]) => {
    const valor = fs.reduce((a, f) => a + (f.dValor ?? 0), 0);
    const costo = fs.reduce((a, f) => a + (f.dValor != null ? (f.dCosto ?? 0) : 0), 0);
    return { nombre, filas: fs, valor, costo, pl: valor - costo,
             plPct: costo > 0 ? (valor - costo) / costo * 100 : null,
             peso: total > 0 ? valor / total * 100 : null, ...hoyDe(fs) };
  }).sort((a, b) => b.valor - a.valor || TIPOS_ORDEN.indexOf(a.nombre) - TIPOS_ORDEN.indexOf(b.nombre));
}

// tramos de la barra de pesos, en este orden (paleta de Noticias): serie, gold,
// goldL, up, azul, mut. Van por variables locales (.mc-wrap) para el tema oscuro
const PALETA = ["var(--mc3-p1)", "var(--mc3-p2)", "var(--mc3-p3)", "var(--mc3-p4)", "var(--mc3-p5)", "var(--mc3-p6)"];

const cantFmt = n => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 8 });
const pct1 = n => n == null || !isFinite(n) ? "—" : (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1).replace(".", ",") + "%";
const isoOk = iso => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "").slice(0, 10));
const ddmm = iso => isoOk(iso) ? String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) : "";
const MES_AB = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// "9 ene"; si no es de este año, "9 ene 2027" (si no, no se sabe de qué enero es)
const diaMes = iso => {
  if (!isoOk(iso)) return "";
  const s = String(iso), a = s.slice(0, 4);
  return Number(s.slice(8, 10)) + " " + MES_AB[Number(s.slice(5, 7)) - 1] + (a !== hoyAR().slice(0, 4) ? " " + a : "");
};
const diasHasta = iso => Math.round((Date.parse(String(iso).slice(0, 10)) - Date.parse(hoyAR())) / 864e5);
const zonaRsi = z => z === "Debil" ? "Débil" : String(z || "");
const cap = s => { const t = String(s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; };

/* datos de renta fija del panel de bonos: la misma búsqueda que analisisRentaFija */
function rfDatos(tk, bonos, panel) {
  if (!panel) return null;
  const esp = base(tk), par = parBono(esp, bonos);
  const sob = [...(panel.soberanos || []), ...(panel.bopreal || [])];
  const b = sob.find(x => x.s === esp) || sob.find(x => parBono(x.s) === par && /D$/.test(x.s)) || null;
  const l = (panel.tasa_fija || []).find(x => x.s === esp) || null;
  const venc = panel.vencimientos || {};
  const v = String((b && b.vence) || (l && l.vence) || venc[esp] || venc[par] || "").slice(0, 10);
  return { esp, par, b, l, vence: isoOk(v) ? v : "" };
}

/* ── las dos cards de gráficos (prototipo 235-258) ──
   Por activo: los lotes del mismo activo (mismo ticker sin sufijo) se suman. */
function graficos(r, cur) {
  // un dato raro no puede tirar la tabla: sin gráficos, pero con todo lo demás
  try { return graficos_(r, cur); } catch (e) { return ""; }
}
function graficos_(r, cur) {
  const m = new Map();
  r.filas.forEach(f => {
    const k = base(f.ticker);
    if (!m.has(k)) m.set(k, { tk: k, valor: 0, conValor: false, pl: 0, conPl: false, sinCosto: false });
    const a = m.get(k);
    if (f.dValor != null) { a.valor += f.dValor; a.conValor = true; }
    // sin precio de compra el "resultado" sería todo el valor: no entra en el gráfico
    if (f.dPl != null && Number(f.precioCompra) > 0) { a.pl += f.dPl; a.conPl = true; }
    else if (f.dValor != null) a.sinCosto = true;
  });
  const act = [...m.values()];
  const conValor = act.filter(a => a.conValor && a.valor > 0);
  if (!conValor.length) return "";

  // Resultado por activo: barras ± con el cero al 25% del ancho. La escala es la
  // misma para los dos lados y ninguna barra se sale de su lado.
  const res = act.filter(a => a.conPl).sort((a, b) => b.pl - a.pl);
  const cero = 25;
  const maxPos = Math.max(0, ...res.map(a => a.pl)), maxNeg = Math.max(0, ...res.map(a => -a.pl));
  const k0 = Math.min(maxPos > 0 ? (100 - cero) / maxPos : Infinity, maxNeg > 0 ? cero / maxNeg : Infinity);
  const k = isFinite(k0) ? k0 : 0;
  const ancho = Math.max(64, Math.ceil(Math.max(0, ...res.map(a => moneyS(a.pl, cur).length)) * 7.1) + 2);
  const barra = a => {
    const w = Math.max(a.pl !== 0 ? 0.8 : 0, Math.abs(a.pl) * k);
    const izq = a.pl < 0 ? Math.max(0, cero - w) : cero;
    const c = a.pl < 0 ? "var(--v3-dn)" : "var(--v3-up)";
    return `<div class="mc3-bar" style="grid-template-columns:48px minmax(0,1fr) ${ancho}px"><b title="${esc(a.tk)}">${esc(a.tk)}</b>
      <div class="t"><i style="left:${izq.toFixed(2)}%;width:${w.toFixed(2)}%;background:${c}"></i><i class="z" style="left:${cero}%"></i></div>
      <span class="v" style="color:${c}">${moneyS(a.pl, cur)}</span></div>`;
  };
  const vis = res.length > 12 ? [...res.slice(0, 6), null, ...res.slice(-6)] : res;
  const barras = vis.map(a => a ? barra(a) : `<div class="mc3-mas">· · · ${res.length - 12} activos más en la tabla · · ·</div>`).join("");
  const sinCosto = act.filter(a => !a.conPl && a.sinCosto).length;
  const notaRes = sinCosto ? `<div class="mc3-nota">No ${sinCosto === 1 ? "entra 1 activo" : `entran ${sinCosto} activos`} sin precio de compra.</div>` : "";

  // Peso de cada posición: barra apilada + leyenda + la frase
  const tot = conValor.reduce((s, a) => s + a.valor, 0);
  const ord = conValor.sort((a, b) => b.valor - a.valor).map(a => ({ tk: a.tk, p: a.valor / tot * 100 }));
  const tramos = ord.length > PALETA.length
    ? [...ord.slice(0, PALETA.length - 1), { tk: `Otras ${ord.length - PALETA.length + 1}`, p: ord.slice(PALETA.length - 1).reduce((s, a) => s + a.p, 0) }]
    : ord;
  tramos.forEach((t, i) => { t.c = PALETA[i]; });
  const pp = p => p < 1 ? "<1%" : Math.round(p) + "%";
  const mayor = ord[0];
  const frase = ord.length === 1 ? `Tenés una sola posición con precio: ${esc(mayor.tk)} es todo tu total.`
    : mayor.p > 30 ? `${esc(mayor.tk)} pesa <b>${Math.round(mayor.p)}%</b> de tu cartera. No es un problema, pero es el activo que más mueve tu total.`
    : `Ninguna posición pasa del <b>${Math.ceil(mayor.p)}%</b>.`;

  return `<div class="mc3-graf">
    <div class="mc3-card"><div class="mc3-ch"><div class="mc3-k">Resultado por activo</div><span>${cur === "ARS" ? "en pesos" : "en dólares"}</span></div>
      ${res.length ? `<div class="mc3-bars">${barras}</div>${notaRes}`
        : `<div class="mc3-nota" style="margin-top:12px">Todavía no hay resultado para mostrar: falta el precio de compra de tus posiciones.</div>`}</div>
    <div class="mc3-card"><div class="mc3-ch"><div class="mc3-k">Peso de cada posición</div><span>sobre el total</span></div>
      <div class="mc3-stack">${tramos.map(t => `<div style="flex:${t.p.toFixed(3)} 1 0;background:${t.c}" title="${esc(t.tk)} ${esc(pp(t.p))}"></div>`).join("")}</div>
      <div class="mc3-ley">${tramos.map(t => `<span><i style="background:${t.c}"></i>${esc(t.tk)} <b>${esc(pp(t.p))}</b></span>`).join("")}</div>
      <div class="mc3-frase">${frase}</div></div>
  </div>`;
}

/* ── el desplegable (prototipo 284-321) ── */
const metHTML = ([k, v, s, c], attr = "") =>
  `<div class="mc3-met"${attr}><div class="k" title="${esc(k)}">${esc(k)}</div><div class="v"${c ? ` style="color:${c}"` : ""}>${v}</div><div class="s"${s ? ` title="${esc(s)}"` : ""}>${s ? esc(s) : "&nbsp;"}</div></div>`;

/* métricas que salen de lo que Mi cartera ya tiene (posición, precios, desglose,
   panel de bonos, flujos). Lo que no existe no se muestra. */
function metricas(f, opts, cur) {
  try { return metricas_(f, opts, cur); } catch (e) { return []; }
}
function metricas_(f, opts, cur) {
  const px = f.px || {}, bonos = opts.bonos || new Set();
  const rf = esRentaFija(f.ticker, bonos);
  const fac = Number(f.factor) > 0 ? Number(f.factor) : (Number(px.factor) > 0 ? Number(px.factor) : 1);
  const out = [];
  const conCosto = Number(f.precioCompra) > 0;
  const otra = f.moneda && f.moneda !== cur;
  if (conCosto) {
    const orig = money(Number(f.precioCompra), f.moneda);
    out.push(f.dCompra != null
      ? ["Precio promedio", money(f.dCompra, cur), [otra ? orig : "", fac !== 1 ? "cada 100 VN" : ""].filter(Boolean).join(" · ")]
      : ["Precio promedio", orig, "sin dólar para convertir"]);
    if (f.dCosto != null) out.push(["Costo total", money(f.dCosto, cur), f.fecha && fmtFecha(f.fecha) !== "—" ? "desde el " + fmtFecha(f.fecha) : ""]);
  } else out.push(["Precio promedio", "—", "sin cargar", "var(--v3-mut)"]);
  if (f.peso != null) out.push(["Peso en cartera", num(f.peso, 1) + "%", f.peso > 30 ? "concentrada" : "", f.peso > 30 ? "var(--v3-warn)" : ""]);
  // variación del PRECIO por período (no es lo que ganaste: eso es el Resultado)
  const dg = desglose(f.ticker, opts.desg || {}, px, f);
  [["dia", "Hoy"], ["mes", "Var. 30 días"], ["anio", "Var. 1 año"]].forEach(([k, l]) => {
    const d = dg.find(x => x.clave === k);
    if (d && d.pct != null) out.push([l, pct1(d.pct), d.enDolares ? "del ADR, en dólares" : "del precio", d.pct >= 0 ? "var(--v3-up)" : "var(--v3-dn)"]);
  });
  if (!rf && px.rsi != null) out.push(["RSI", num(px.rsi, 0), zonaRsi(px.rsiZona).toLowerCase(),
    px.rsi > 70 ? "var(--v3-dn)" : px.rsi < 30 ? "var(--v3-up)" : ""]);
  if (rf) {
    const R = rfDatos(f.ticker, bonos, opts.panel);
    if (R && R.b && R.b.tir != null) out.push(["TIR", num(R.b.tir, 1) + "%", /D$/.test(R.b.s || "") ? "anual, en dólares" : "anual"]);
    else if (R && R.l && R.l.tem != null) out.push(["TEM", num(R.l.tem, 2) + "%", "tasa mensual"]);
    if (R && R.b && R.b.paridad != null) out.push(["Paridad", num(R.b.paridad, 1), ""]);
    if (R && R.vence) {
      const d = diasHasta(R.vence);
      out.push(["Vence", fmtFecha(R.vence), d > 0 ? `en ${d} ${d === 1 ? "día" : "días"}` : d === 0 ? "hoy" : "ya venció", d >= 0 && d <= 30 ? "var(--v3-warn)" : ""]);
    }
    const fl = opts.flujos || {}, esp = base(f.ticker);
    const dfl = fl[esp] || fl[parBono(esp)];
    const hoy = hoyAR();
    const prox = dfl && Array.isArray(dfl.flujos) ? dfl.flujos.find(([fe]) => fe >= hoy) : null;
    if (prox) out.push(["Próximo pago", diaMes(prox[0]), `≈ ${usdRedondo((Number(f.cantidad) || 0) * Number(prox[1]) / 100)} (estimado)`]);
  }
  return out;
}

/* Lectura Valtia: el informe más nuevo de ese activo; si no hay, la lectura
   automática del doc de precios; si no hay nada, se dice y se ofrece pedirlo */
function colLectura(f, inf, bonos, pro = false) {
  const px = f.px || {};
  const ficha = tickerFicha(f.ticker), b = base(f.ticker), par = parBono(b, bonos);
  const claves = new Set([ficha, b, par].filter(Boolean));
  const link = linkDe(f.ticker, bonos);
  const tit = `<div class="mc3-ck">Lectura Valtia</div>`;
  const docs = (inf || []).filter(d => d && d.ticker && claves.has(String(d.ticker).toUpperCase()))
    .sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
  if (docs.length) {
    const d = docs[0];
    const href = ficha ? `activo.html?t=${encodeURIComponent(ficha)}#informe` : (link || "informes.html");
    return tit + `<div class="mc3-inf">${esc(d.titulo)}</div>
      ${d.resumen ? `<div class="mc3-txt mc3-clamp">${esc(d.resumen)}</div>` : ""}
      ${fmtFecha(d.fecha) !== "—" ? `<div class="mc3-txt mc3-f">Informe del ${fmtFecha(d.fecha)}</div>` : ""}
      <a class="mc3-lk" href="${href}">Leer informe →</a>`;
  }
  const emp = ficha ? EMPRESAS.find(x => x.ticker === ficha) : null;
  const conPro = emp && emp.slug;
  // a quien ya es PRO no se le ofrece PRO: el informe existe y lo abre en la ficha
  const lineaPro = conPro ? (pro ? `Hay un informe Valtia de ${esc(emp.nombre)}: lo leés en su ficha.`
                                 : `Hay un informe Valtia de ${esc(emp.nombre)}: lo leés completo con PRO.`) : "";
  const ver = px.veredicto && px.veredicto !== "Sin cobertura" ? px.veredicto : "";
  const lkFicha = ficha ? `<a class="mc3-lk" href="/activo?t=${encodeURIComponent(ficha)}${conPro ? "#informe" : ""}">${conPro && pro ? "Leer informe →" : "Ver la ficha →"}</a>`
    : link ? `<a class="mc3-lk" href="${link}">Ver la ficha →</a>` : "";
  if (ver || px.rsi != null) {
    const frase = { Infravalorada: "La lectura de valor la marca infravalorada", "En precio": "La lectura de valor la ve en precio",
                    Estirada: "La lectura de valor la marca estirada" }[ver] || (ver ? "Lectura de valor: " + ver.toLowerCase() : "Sin lectura de valor");
    const partes = [];
    if (px.score != null && isFinite(px.score)) partes.push(`Puntaje de valor ${num(px.score, 0)}.`);
    if (px.rsi != null) partes.push(`RSI ${num(px.rsi, 0)}${px.rsiZona ? ": " + esc(zonaRsi(px.rsiZona).toLowerCase()) : ""}.${px.rsi > 70 ? " No es señal de venta; es para mirarla." : ""}`);
    partes.push("Es la lectura automática, no un informe.");
    return tit + `<div class="mc3-inf">${esc(frase)}</div><div class="mc3-txt">${partes.join(" ")}</div>
      ${lineaPro ? `<div class="mc3-txt">${lineaPro}</div>` : ""}${lkFicha}`;
  }
  if (conPro) return tit + `<div class="mc3-inf">Informe Valtia de ${esc(emp.nombre)}</div>
    <div class="mc3-txt">${pro ? "Lo leés completo en su ficha." : "Lo leés completo con PRO."}</div>${lkFicha}`;
  return tit + `<div class="mc3-inf">Sin informe Valtia todavía</div>
    <div class="mc3-txt">${link ? `<a href="${link}">Ver la ficha</a> · ` : ""}<a href="mailto:soporte@valtia.tech?subject=${encodeURIComponent("Análisis de " + b)}">pedir este análisis</a></div>`;
}

/* Últimas noticias: las dos más nuevas que nombran al activo (claves del catálogo) */
function colNoticias(f, nots) {
  const tit = `<div class="mc3-ck">Últimas noticias</div>`;
  const ficha = tickerFicha(f.ticker);
  const emp = ficha ? EMPRESAS.find(x => x.ticker === ficha) : null;
  const claves = (emp && emp.claves) || [];
  const hits = claves.length ? (nots || []).filter(n => {
    const t = (String(n.titulo || "") + " " + String(n.resumen || "")).toLowerCase();
    return claves.some(k => t.includes(k));
  }).slice(0, 2) : [];
  if (!hits.length) return tit + `<div class="mc3-txt" style="margin-top:8px">Sin noticias recientes.</div>`;
  return tit + `<div class="mc3-nots">${hits.map(n =>
    `<a href="/nota?n=${encodeURIComponent(n.id)}">${ddmm(n.fecha) ? `<span>${ddmm(n.fecha)}</span>` : ""}${esc(n.titulo)}</a>`).join("")}</div>`;
}

/* Próximo evento: el primero de la agenda del panel que toca esta posición */
function colEvento(f, evs, bonos) {
  const tit = `<div class="mc3-ck">Próximo evento</div>`;
  const rf = esRentaFija(f.ticker, bonos);
  const ficha = tickerFicha(f.ticker), esp = base(f.ticker), par = parBono(esp, bonos);
  const ev = (evs || []).find(e => {
    if (!e || !e.mio || !e.tk) return false;
    const t = String(e.tk).toUpperCase();
    return rf ? (t === esp || parBono(t, bonos) === par) : (!!ficha && t === ficha);
  });
  if (!ev) return tit + `<div class="mc3-ev">—</div><div class="mc3-txt">Sin eventos programados.</div>`;
  const tipo = TIPO_RESUMEN[ev.tipo] || (TIPOS[ev.tipo] || [cap(ev.tipo)])[0];
  const d = diasHasta(ev.f);
  const cuando = d === 0 ? "hoy" : d === 1 ? "mañana" : d > 1 ? `en ${d} días` : "";
  return tit + `<div class="mc3-ev">${esc(tipo)} · ${diaMes(ev.f)}${cuando ? `<span>${cuando}</span>` : ""}</div>
    <div class="mc3-txt">${esc(ev.k)} ${esc(ev.txt || "")}${ev.sub ? " " + esc(cap(ev.sub)) + "." : ""}</div>`;
}

function detalleHTML(f, opts, cur) {
  const ctxOk = typeof window !== "undefined" && !!window.__valtiaCtx;
  const c = ctxOk ? _detCache[f.id] : null;
  const esperando = t => `<div class="mc3-ck">${t}</div><div class="mc3-txt" style="margin-top:8px">Buscando…</div>`;
  const id = esc(f.id), aj = _ajAbierto === f.id;
  const brk = String(f.broker || "").trim();
  const link = linkDe(f.ticker, opts.bonos || new Set());
  return `<div class="mc3-det" data-det="${id}">
    <div class="mc3-mets" data-mets>${metricas(f, opts, cur).map(m => metHTML(m)).join("")}${c && c.pe ? c.pe : ""}</div>
    <div class="mc3-cols">
      ${ctxOk ? `<div class="mc3-col" data-dl>${c ? c.lect : esperando("Lectura Valtia")}</div>
      <div class="mc3-col" data-dn>${c ? c.not : esperando("Últimas noticias")}</div>` : ""}
      <div class="mc3-col">
        ${ctxOk ? `<div data-de>${c ? c.ev : esperando("Próximo evento")}</div>` : (link ? `<a class="mc3-lk" href="${link}" style="margin-top:0">Ver la ficha →</a>` : "")}
        <div class="mc3-acc">
          <button type="button" class="mc3-b vend" data-vender="${id}" title="Registrar una venta de esta posición">Vendí</button>
          <button type="button" class="mc3-b aj" data-ajustar aria-expanded="${aj}">Ajustar</button>
        </div>
        <div class="mc3-ajp" data-ajp${aj ? "" : " hidden"}>
          <div class="fila">Broker: <span class="mc-brk" data-brk="${id}" title="Cambiar broker">${esc(brk || "sin broker")}</span>
            <span class="mc-mut">tocalo para cambiarlo</span></div>
          <div class="fila"><button type="button" class="mc-del" data-del="${id}" title="Quitar (si la cargaste por error)">Quitar de mi cartera</button>
            <span class="mc-mut">si la cargaste por error. Si la vendiste, usá «Vendí» para que quede el resultado.</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* la agenda se arma una vez cada 5 minutos por cuenta (sus fuentes ya están cacheadas) */
function eventosCache(ctx) {
  const email = ctx.S && ctx.S.email;
  if (_evCache.p && _evCache.email === email && Date.now() - _evCache.t < 5 * 60e3) return _evCache.p;
  const p = Promise.resolve().then(() => eventos(ctx)).catch(() => []);
  _evCache = { email, t: Date.now(), p };
  return p;
}

/* completa las tres columnas con lo que tiene el panel (window.__valtiaCtx). Sin
   el panel, el desplegable queda con las métricas. Nunca tira. */
async function llenarDetalle(det, f, opts = {}) {
  try {
    const ctx = typeof window !== "undefined" ? window.__valtiaCtx : null;
    if (!ctx || !det || !f) return;
    const email = ctx.S && ctx.S.email;
    const bonos = opts.bonos || new Set();
    const rf = esRentaFija(f.ticker, bonos);
    const seguro = fn => { try { return Promise.resolve(fn()).catch(() => null); } catch (e) { return Promise.resolve(null); } };
    const [inf, nots, evs, rad] = await Promise.all([
      seguro(() => ctx.informes()), seguro(() => ctx.noticias()), seguro(() => eventosCache(ctx)),
      rf ? Promise.resolve(null) : seguro(() => ctx.radar()),
    ]);
    // cambió la cuenta o se cerró la fila mientras tanto: no se pinta nada
    if (!det.isConnected || (ctx.S && ctx.S.email) !== email || (_user && _user.email !== email)) return;
    const c = { lect: colLectura(f, inf, bonos, !!(ctx.S && ctx.S.pro)), not: colNoticias(f, nots), ev: colEvento(f, evs, bonos), pe: "" };
    const a = !rf && Array.isArray(rad) ? rad.find(x => x && x.sym === radarSym(f.ticker)) : null;
    if (a && a.per != null && isFinite(a.per)) c.pe = metHTML(["P/E actual", num(a.per, 1) + "x", "del radar"], " data-pe");
    _detCache[f.id] = c;
    const poner = (sel, html) => { const n = det.querySelector(sel); if (n) n.innerHTML = html; };
    poner("[data-dl]", c.lect); poner("[data-dn]", c.not); poner("[data-de]", c.ev);
    const mets = det.querySelector("[data-mets]");
    if (mets) {
      mets.querySelectorAll("[data-pe]").forEach(x => x.remove());
      if (c.pe) mets.insertAdjacentHTML("beforeend", c.pe);
    }
  } catch (e) {}
}

/* abre (o cierra) el desplegable de una posición sin repintar la tabla: lo que
   el usuario tenga escrito en otro lado (el formulario de una venta) no se pierde */
function alternarFila(el, id, forzar) {
  const v = _vista;
  if (!v || v.el !== el) return null;
  const abrir = forzar != null ? !!forzar : _abierta !== id;
  el.querySelectorAll(".mc3-det").forEach(d => d.remove());
  el.querySelectorAll(".mc3-row.on").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-expanded", "false"); });
  if (_abierta !== id) _ajAbierto = null;
  _abierta = abrir ? id : null;
  if (!abrir) return null;
  const row = [...el.querySelectorAll(".mc3-row[data-fila]")].find(x => x.dataset.fila === id);
  const f = v.porId[id];
  if (!row || !f) { _abierta = null; return null; }
  row.classList.add("on"); row.setAttribute("aria-expanded", "true");
  row.insertAdjacentHTML("afterend", detalleHTML(f, v.opts, v.cur));
  const det = row.nextElementSibling;
  if (det && typeof v.opts.onDetalle === "function") { try { v.opts.onDetalle(det); } catch (e) {} }
  llenarDetalle(det, f, v.opts);
  return row;
}

/* la posición que corresponde a un ticker que llega de otra pestaña (del Resumen:
   "NVDA", "AL30", "GGAL.BA"…). Manda la coincidencia exacta; si hay varios lotes,
   el de mayor valor. */
function buscarFila(filas, q, bonos) {
  const Q = String(q || "").trim().toUpperCase();
  if (!Q) return null;
  const qb = base(Q), qf = tickerFicha(Q), qr = radarSym(Q);
  const qp = esRentaFija(Q, bonos) ? parBono(qb, bonos) : null;
  const puntos = f => {
    const t = String(f.ticker || "").toUpperCase();
    if (t === Q) return 4;
    if (base(t) === qb) return 3;
    if ((qf && tickerFicha(t) === qf) || radarSym(t) === qr) return 2;
    if (qp && esRentaFija(t, bonos) && parBono(base(t), bonos) === qp) return 1;
    return 0;
  };
  let mejor = null, pm = 0;
  (filas || []).forEach(f => {
    const p = puntos(f);
    if (p > pm || (p > 0 && p === pm && (f.dValor || 0) > (mejor.dValor || 0))) { mejor = f; pm = p; }
  });
  return pm > 0 ? mejor : null;
}

/* window.__mcAbrirFila(ticker): abre esa fila y la lleva a la vista. Si Mi cartera
   todavía está cargando, queda anotada y se abre apenas se dibuje. */
export function abrirFila(ticker) {
  _pendiente = String(ticker || "").trim().toUpperCase() || null;
  if (!_pendiente || !_vista || !_el || _vista.el !== _el) return false;
  return aplicarPendiente();
}
function aplicarPendiente() {
  const q = _pendiente, v = _vista;
  _pendiente = null;
  if (!q || !v || !v.el) return false;
  const f = buscarFila(v.filas, q, v.opts.bonos);
  if (!f) return false;
  const row = alternarFila(v.el, f.id, true);
  if (!row) return false;
  const llevar = () => {
    try { row.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { try { row.scrollIntoView(); } catch (e2) {} }
    try { row.focus({ preventScroll: true }); } catch (e) {}
  };
  // si la pestaña se acaba de mostrar, se espera un cuadro para que tenga medidas
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(llevar); else llevar();
  return true;
}
if (typeof window !== "undefined") window.__mcAbrirFila = abrirFila;

/* un solo escuchador por contenedor (sobrevive a los repintados): abrir fila,
   Ajustar, agrupar y ordenar */
function instalarDelegado(el) {
  if (!el || el.__mc3 || typeof el.addEventListener !== "function") return;
  el.__mc3 = true;
  const repintar = () => {
    const v = _vista;
    if (!v || v.el !== el) return;
    renderMiCartera(el, v.posiciones, v.precios, v.opts);
    if (v.opts.onRerender) v.opts.onRerender();
  };
  const ordenar = c => {
    _orden = { col: c, desc: _orden.col === c ? !_orden.desc : true };
    repintar();
  };
  el.addEventListener("click", ev => {
    const t = ev.target;
    if (!t || !t.closest) return;
    const aj = t.closest("[data-ajustar]");
    if (aj) {
      ev.preventDefault();
      const det = aj.closest(".mc3-det"), p = det && det.querySelector("[data-ajp]");
      if (!p) return;
      p.hidden = !p.hidden;
      aj.setAttribute("aria-expanded", String(!p.hidden));
      _ajAbierto = p.hidden ? null : det.dataset.det;
      return;
    }
    const oc = t.closest("[data-ocultar]");
    if (oc) {
      ev.preventDefault();
      _ocultar = !_ocultar;
      setPref("valtia-mc-ocultar", _ocultar ? "1" : "0");
      repintar();
      // el repintado rehace el botón: el foco vuelve al nuevo, para el teclado
      const n = el.querySelector("[data-ocultar]");
      if (n) try { n.focus(); } catch (e) {}
      return;
    }
    const g = t.closest("[data-agrupar]");
    if (g) { ev.preventDefault(); setPref("valtia-mc-agrupar", g.dataset.agrupar); repintar(); return; }
    const s = t.closest(".mc3-hd [data-col]");
    if (s) { ev.preventDefault(); ordenar(s.dataset.col); return; }
    const row = t.closest(".mc3-row[data-fila]");
    if (row && !t.closest("a,button,input,select,textarea,label")) alternarFila(el, row.dataset.fila);
  });
  el.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const t = ev.target;
    if (!t || !t.matches) return;
    if (t.matches(".mc3-row[data-fila]")) { ev.preventDefault(); alternarFila(el, t.dataset.fila); return; }
    if (t.matches(".mc3-hd [data-col]")) {
      ev.preventDefault();
      const c = t.dataset.col;
      ordenar(c);
      const nuevo = [...el.querySelectorAll(".mc3-hd [data-col]")].find(x => x.dataset.col === c);
      if (nuevo) try { nuevo.focus(); } catch (e) {}
    }
  });
}

/* ── render puro: se puede llamar con datos de prueba ── */
export function renderMiCartera(el, posiciones, precios, opts = {}) {
  asegurarEstilo();
  instalarDelegado(el);
  const escrito = escritoEnAvisos(el);
  // el panel de bonos va explícito (los defaults siguen siendo los de siempre):
  // de ahí sale la variación del día de la renta fija, que no viene en precios
  const r = calcular(posiciones, precios, _cur, _fx, _bonos, opts.panel || _panel);
  const cur = curLabel();
  const bonos = opts.bonos || new Set();
  // lo último que se dibujó: lo usan el desplegable, el orden y el agrupado sin
  // volver a pedir nada
  _vista = { el, posiciones, precios, opts, cur, filas: r.filas,
             porId: Object.fromEntries(r.filas.map(f => [f.id, f])) };
  if (_abierta && !_vista.porId[_abierta]) { _abierta = null; _ajAbierto = null; }
  // Panel v3: el título, la fecha, la frescura de los precios, el selector de
  // moneda y de dónde sale el dólar van en el encabezado único del panel
  const cabecera = "";

  const form = `
    <div class="mc-form" id="mc-form"${formVisible(posiciones.length) ? "" : " hidden"}>
      <div class="mc-tabs">
        <button class="mc-tab on" data-modo="uno">Agregar una</button>
        <button class="mc-tab" data-modo="imp">Importar desde Excel</button>
        ${posiciones.length ? '<button class="mc-cerrar" data-cerrar-form aria-label="Cerrar el formulario">Cerrar ✕</button>' : ""}
      </div>
      <datalist id="mc-brokers">${BROKERS.map(b => `<option value="${b}">`).join("")}</datalist>
      <div id="mc-modo-uno">
        <div class="row">
          <div><label>Mercado</label><select id="mc-mercado">${MERCADOS.map(([k, n]) => `<option value="${k}"${pref("valtia-mc-mercado", "byma") === k ? " selected" : ""}>${n}</option>`).join("")}</select></div>
          <div><label>Ticker</label><input id="mc-ticker" placeholder="GGAL, AL30, NVDA…" maxlength="12" autocomplete="off"></div>
          <div><label>Cantidad</label><input id="mc-cant" type="number" step="any" min="0" placeholder="10"></div>
          <div><label>Precio de compra</label><input id="mc-precio" type="number" step="any" min="0" placeholder="en la moneda del mercado"></div>
          <div><label>Broker / cuenta</label><input id="mc-broker" list="mc-brokers" placeholder="IOL, PPI, Binance…" maxlength="24" value="${esc(pref("valtia-mc-broker", ""))}"></div>
          <div><label>Fecha (opcional)</label><input id="mc-fecha" type="date"></div>
          <div><button class="mc-btn" id="mc-add">Agregar posición</button></div>
        </div>
      </div>
      <div id="mc-modo-imp" class="mc-imp" style="display:none">
        <div class="row" style="margin-bottom:12px">
          <div><label>¿De qué mercado es este resumen?</label><select id="mc-imp-mercado">${MERCADOS.map(([k, n]) => `<option value="${k}"${pref("valtia-mc-mercado", "byma") === k ? " selected" : ""}>${n}</option>`).join("")}</select></div>
          <div><label>Broker / cuenta</label><input id="mc-imp-broker" list="mc-brokers" placeholder="IOL, PPI, Binance…" maxlength="24" value="${esc(pref("valtia-mc-broker", ""))}"></div>
        </div>
        <div class="mc-hint">Copiá las filas del resumen de tu broker y pegalas acá: una posición por línea, en el orden
          <b>ticker · cantidad · precio de compra · fecha</b>. Sirven tabulaciones, comas o punto y coma, y los números
          pueden venir como 1.900,50 o 1900.50. El encabezado se ignora solo. Si elegís BYMA, "GGAL" se guarda como la
          acción local en pesos (GGAL.BA); los bonos y letras quedan tal cual.</div>
        <textarea id="mc-paste" placeholder="GGAL	100	4.500	2026-03-10&#10;AL30	1000	85.400&#10;NVDA;20;38.000"></textarea>
        <div id="mc-prev"></div>
        <button class="mc-btn" id="mc-imp-btn" style="margin-top:12px">Revisar</button>
      </div>
    </div>
    <div class="mc-msg" id="mc-msg"></div>`;

  const fxFalta = posiciones.length && (
    (_cur === "ARS" && !_fx.ccl && r.filas.some(f => f.moneda !== "ARS")) ||
    (_cur === "CCL" && !_fx.ccl) || (_cur === "MEP" && !_fx.mep));
  // vista en dólares sin dólar: no hay NADA convertible. Un "US$0" de titular se lee como
  // "no tenés nada"; va un guion y el aviso dice qué pasa y qué hacer.
  const sinDolar = !!posiciones.length && ((_cur === "CCL" && !_fx.ccl) || (_cur === "MEP" && !_fx.mep));
  const avisoFx = fxFalta ? `<div class="mc3-aviso">⚠ No pudimos traer la cotización del dólar: ${sinDolar ? "por ahora <b>no podemos mostrar tu cartera en dólares</b>. Pasá a Pesos o recargá la página en unos minutos." : "los totales de abajo <b>excluyen tus posiciones en USD</b>. Recargá la página en unos minutos."}</div>` : "";

  // "Ocultar $": el estado vive en localStorage, así que sobrevive al refresco
  // de dos minutos y a cambiar de pestaña
  const ojo = `<button type="button" class="mc3-ojo" data-ocultar aria-pressed="${_ocultar}"
      title="${_ocultar ? "Volver a mostrar los importes" : "Tapa los importes para poder mostrarle la pantalla a alguien; los porcentajes y las cantidades quedan"}"
    >${_ocultar ? "Mostrar $" : "Ocultar $"}</button>`;

  if (!posiciones.length) {
    // sin posiciones no hay tabla, pero las ventas de abajo sí tienen importes:
    // si el botón no estuviera, no habría cómo destaparlos desde esta pantalla
    el.innerHTML = `<div class="mc-wrap">${cabecera}${bloqueAjustes(opts.ajustes || [], precios, opts.bonos || new Set())}${form}
      ${(opts.ventas || []).length ? `<div class="mc3-top"><span></span><div class="mc3-ctrl">${ojo}</div></div>` : ""}
      ${(opts.ventas || []).length ? `<div class="mc-empty"><h4>No te quedan posiciones abiertas</h4>
        <p>Tus ventas y su resultado están más abajo. Si compraste algo nuevo, cargalo con el formulario.</p></div>` : `<div class="mc-empty">
        <h4>Todavía no cargaste posiciones</h4>
        <p>Agregá lo que tenés —acciones, CEDEARs o cripto— con la cantidad y el precio al que compraste.
           Al día siguiente vas a ver el valor actualizado, tu resultado y la lectura de Valtia sobre cada activo.</p>
      </div>`}${seccionVentas(opts.ventas || [], cur)}</div>`;
    reponerEscrito(el, escrito);
    _abierta = null; _ajAbierto = null;
    return;
  }

  const dir = _orden.desc ? -1 : 1;
  const filas = [...r.filas].sort((a, b) => {
    const A = a[_orden.col], B = b[_orden.col];
    if (A == null) return 1;
    if (B == null) return -1;
    return typeof A === "string" ? A.localeCompare(B) * dir : (A - B) * dir;
  });

  // encabezado de la grilla: las columnas que se pueden ordenar llevan data-col
  const flecha = c => _orden.col === c ? (_orden.desc ? " ↓" : " ↑") : "";
  const ordPor = l => l === "%" ? "resultado en %" : l === "Hoy" ? "lo que se movió hoy" : l.toLowerCase();
  const hc = (c, l, cl = "") => `<span class="${[cl, _orden.col === c ? "on" : ""].filter(Boolean).join(" ")}" data-col="${c}" role="button" tabindex="0" title="Ordenar por ${ordPor(l)}">${l}${flecha(c)}</span>`;
  const encabezado = `<div class="mc3-hd">${hc("ticker", "Activo")}${hc("broker", "Broker")}${hc("cantidad", "Cantidad", "r")}${hc("dActual", "Precio hoy", "r")}${hc("dValor", "Valor", "r")}${hc("dHoy", "Hoy", "r")}<span class="r">${hc("dPl", "Resultado")} · ${hc("plPct", "%")}</span><span></span></div>`;

  const filaHTML = f => {
    const px = f.px || {};
    const rf = esRentaFija(f.ticker, bonos);
    // la etiqueta sale del MERCADO y no de si el texto termina en ".BA": un bono
    // bien guardado (TX26, AL30) también cotiza en BYMA
    const mk = mercadoDe(f.ticker, bonos);
    const tk = base(f.ticker), nd = nombreDe(f.ticker);
    const nombre = px.nombre && String(px.nombre).toUpperCase() !== String(f.ticker).toUpperCase() ? px.nombre : (nd !== tk ? nd : "");
    const pills = [];
    if (px.sinDatos) pills.push(["warn", "Ticker no encontrado", "Revisá que el ticker esté bien escrito"]);
    else if (px.veredicto && px.veredicto !== "Sin cobertura") pills.push([verCls(px.veredicto), px.veredicto, "Lectura automática de Valtia"]);
    else if (f.actual != null) pills.push(["sin", "Sin lectura", "Valtia no tiene lectura de valor de este activo"]);
    if (!px.sinDatos && f.actual == null) pills.push(["warn", "sin precio", "Espera el precio del sync: queda fuera del total"]);
    if (px.rsi != null && px.rsi > 70) pills.push(["warn", "RSI " + num(px.rsi, 0), "Sobrecomprada: no es señal de venta, es para mirarla"]);
    if (rf) {
      const R = rfDatos(f.ticker, bonos, opts.panel);
      const d = R && R.vence ? diasHasta(R.vence) : null;
      if (d != null && d >= 0 && d <= 30) pills.push(["warn", "vence " + ddmm(R.vence), d === 0 ? "Vence hoy" : `Vence en ${d} ${d === 1 ? "día" : "días"}`]);
    }
    if (f.actual != null && !(Number(f.precioCompra) > 0)) pills.push(["warn", "sin precio de compra", "Sin precio de compra, el resultado es todo el valor: cargalo para que sea real"]);
    const on = _abierta === f.id;
    const cant = cantFmt(f.cantidad) + (rf ? " VN" : "");
    const pxHoy = f.dActual != null ? money(f.dActual, cur) : "—";
    const brk = String(f.broker || "").trim() || "sin broker";
    // el precio promedio de compra, debajo de la cantidad: es el mismo que ya
    // calcula calcular() (dCompra, convertido a la moneda de arriba) y el que
    // muestra el desplegable, así que los dos dicen siempre lo mismo
    const fac = Number(f.factor) > 0 ? Number(f.factor) : (Number(px.factor) > 0 ? Number(px.factor) : 1);
    const prom = Number(f.precioCompra) > 0
      ? (f.dCompra != null ? money(f.dCompra, cur) : money(Number(f.precioCompra), f.moneda)) : "";
    const promTit = prom ? `Precio promedio de compra: ${money(Number(f.precioCompra), f.moneda)}${fac !== 1 ? " cada 100 VN" : ""}` : "";
    // lo que se movió esta posición hoy. Sin variación del día va un guion: no
    // se inventa un cero (se leería como "no se movió")
    const hoyCls = f.dHoy == null ? "mc-mut" : f.dHoy >= 0 ? "mc-pos" : "mc-neg";
    const hoyTit = f.dHoy == null ? "Todavía no tenemos la variación del día de este activo: esta fila no entra en el total de arriba"
                                  : "Lo que se movió esta posición hoy, contra el cierre de ayer";
    return `<div class="mc3-pos" data-pos="${esc(f.id)}">
      <div class="mc3-row${on ? " on" : ""}" data-fila="${esc(f.id)}" role="button" tabindex="0" aria-expanded="${on}">
        <div class="c-act"><div class="mc3-tk"><b>${esc(tk)}</b>${mk === "byma" || mk === "rf" ? '<span class="mc3-mk">BYMA</span>' : ""}${nombre ? `<span class="mc3-nm">${esc(nombre)}</span>` : ""}</div>
          ${pills.length ? `<div class="mc3-pills">${pills.map(([c, t, tt]) => `<span class="mc3-pill ${c}"${tt ? ` title="${esc(tt)}"` : ""}>${esc(t)}</span>`).join("")}</div>` : ""}</div>
        <span class="c-brk mc3-brk">${esc(brk)}</span>
        <span class="c-cnt mc3-n"><span data-cantde="${esc(f.id)}">${cant}</span>${prom ? `<small class="pm" title="${esc(promTit)}">${prom}</small>` : ""}</span>
        <span class="c-px mc3-n">${pxHoy}</span>
        <span class="c-val mc3-n f">${f.dValor != null ? money(f.dValor, cur) : "—"}</span>
        <span class="c-hoy mc3-n f ${hoyCls}" title="${esc(hoyTit)}"><em class="mc3-hoyk">Hoy</em>${f.dHoy == null ? "—"
          : moneyS(f.dHoy, cur) + (f.hoyPct != null ? `<small>${pct1(f.hoyPct)}</small>` : "")}</span>
        <span class="c-pl mc3-n f ${f.dPl == null ? "mc-mut" : f.dPl >= 0 ? "mc-pos" : "mc-neg"}">${f.dPl == null ? "—" : moneyS(f.dPl, cur)}${f.plPct != null ? `<small>${pct1(f.plPct)}</small>` : ""}</span>
        <span class="c-meta mc3-meta">${esc(brk)} · ${cant}${prom ? " · " + prom : ""} · ${pxHoy}</span>
        <span class="c-rot mc3-rot" aria-hidden="true">▾</span>
      </div>${on ? detalleHTML(f, opts, cur) : ""}</div>`;
  };

  // Todas | Por broker (agruparPorBroker, el criterio de siempre) | Por tipo.
  // El orden de columna elegido se respeta dentro de cada grupo.
  const agr = agruparPref();
  const grupos = agr === "broker" ? agruparPorBroker(filas, r.total).map(g => ({ ...g, nombre: g.broker }))
    : agr === "tipo" ? agruparPorTipo(filas, r.total, bonos) : null;
  // el renglón del grupo: cuánto suma, qué parte del total es, cuánto se movió
  // hoy y cuánto va ganando. El peso va pegado al monto, que es la pregunta que
  // se hace al agrupar ("¿cuánto tengo en IOL y qué parte de todo es?")
  const grpHTML = g => `<div class="mc3-grp"><b>${esc(g.nombre)}</b><span>${g.filas.length} ${g.filas.length === 1 ? "posición" : "posiciones"}${sinDolar ? "" : ` · ${money(g.valor, cur)}${g.peso != null ? ` · <em title="Lo que pesa este grupo en el total de tu cartera">${num(g.peso)}% de tu cartera</em>` : ""}${g.hoy != null ? ` · hoy <em class="${g.hoy >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(g.hoy, cur)}</em>` : ""}${g.plPct != null ? ` · <em class="${g.pl >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(g.pl, cur)} (${pct1(g.plPct)})</em>` : ""}`}</span></div>`;
  const filasHTML = grupos ? grupos.map(g => grpHTML(g) + g.filas.map(filaHTML).join("")).join("") : filas.map(filaHTML).join("");

  const conPrecio = r.filas.filter(f => f.actual != null).length;
  // el total del día: suma solo las filas que traen la variación, y si alguna
  // quedó afuera se dice al lado del número (y no en un título que nadie abre)
  const hoyOk = !sinDolar && r.hoyTot != null;
  const hoyFuera = !sinDolar && r.hoySin > 0
    ? `<em>· ${r.hoySin === 1 ? "1 posición sin variación del día" : `${r.hoySin} posiciones sin variación del día`}</em>` : "";
  const arriba = `<div class="mc3-top">
      <div class="mc3-tot">
        <span><b>${sinDolar ? "—" : money(r.total, cur)}</b> valor</span>
        <span title="Lo que se movió tu cartera hoy, contra el cierre de ayer"><b class="${hoyOk ? (r.hoyTot >= 0 ? "mc-pos" : "mc-neg") : ""}">${hoyOk ? moneyS(r.hoyTot, cur) : "—"}</b>${hoyOk && r.hoyTotPct != null
          ? `<i class="mc3-pp ${r.hoyTotPct >= 0 ? "up" : "dn"}">${pct1(r.hoyTotPct)}</i>` : ""} hoy${hoyFuera}</span>
        <span><b class="${sinDolar ? "" : r.plTot >= 0 ? "mc-pos" : "mc-neg"}">${sinDolar ? "—" : moneyS(r.plTot, cur)}</b>${!sinDolar && r.plTotPct != null
          ? `<i class="mc3-pp ${r.plTotPct >= 0 ? "up" : "dn"}" title="sobre ${esc(money(r.costoTot, cur))} invertidos">${pct1(r.plTotPct)}</i>` : ""} resultado</span>
        <span><b class="k">${conPrecio} de ${r.filas.length}</b> con precio</span>
      </div>
      <div class="mc3-ctrl">
        ${ojo}
        <div class="mc3-seg" role="group" aria-label="Agrupar la tabla">${AGRUPAR.map(([k, l]) =>
          `<button type="button" data-agrupar="${k}" class="${agr === k ? "on" : ""}" aria-pressed="${agr === k}">${l}</button>`).join("")}</div>
      </div>
    </div>`;

  el.innerHTML = `<div class="mc-wrap">
    ${cabecera}${avisoFx}${bloqueAjustes(opts.ajustes || [], precios, bonos)}
    ${form}
    ${arriba}
    ${sinDolar ? "" : graficos(r, cur)}
    <div class="mc3-tbl"><div class="mc3-in">${encabezado}${filasHTML}</div></div>
    <p class="mc3-pie">Tocá una fila para ver la lectura de Valtia, las noticias y el próximo evento de ese activo. Los precios se
      sincronizan en rueda; el costo y el valor se convierten con la cotización de hoy.
      «Hoy» es lo que se movió esa posición en la rueda, contra el cierre de ayer; si todavía no tenemos su variación del día
      va un guion y esa fila no entra en el total de arriba. Debajo de la cantidad va tu precio promedio de compra.</p>
    <div class="mc-subnav">Todos tus activos juntos: <a href="#panel/empresas" data-go="empresas">informes, noticias y agenda →</a>
      <span>·</span> <a href="#panel/herramientas" data-go="herramientas">ratios y datos →</a></div>
    ${lectura(r)}
    ${analisis(r, cur, bonos, opts.rentaFija || "")}
    ${seccionVentas(opts.ventas || [], cur)}
    <div class="mc-foot">Los precios se actualizan cada 15 minutos durante la rueda; los ratios y la lectura, una vez por día.
      El resultado es sobre el precio de compra que cargaste. Si vendiste algo, abrí su fila y tocá «Vendí»:
      queda registrado abajo, en Ventas y resultado realizado.
      ${_cur !== "ARS" ? `Los valores en pesos se convierten al ${_cur === "CCL" ? "contado con liqui" : "dólar MEP"} de hoy —
        tanto el costo como el valor actual—, así que el rendimiento en % coincide con el de pesos.` : ""}
      Esta información es de carácter general y no constituye asesoramiento financiero personalizado.</div>
  </div>`;
  reponerEscrito(el, escrito);
  // la fila que estaba abierta se vuelve a abrir con el repintado: sus columnas
  // (informe, noticias, evento) se completan aparte
  const det = el.querySelector(".mc3-det");
  if (det && _abierta && _vista.porId[_abierta]) llenarDetalle(det, _vista.porId[_abierta], opts);
}

/* ── evolución (las cuentas viven en evolucion.js) ──
   Panel v3: el gráfico pasó al Resumen, que lo pide con evolucionComparada().
   Mi cartera ya no lo dibuja, pero sigue CARGANDO la historia al iniciar
   (cargarEvolucion): evolucionComparada() depende de _evo. */
const _evo = { email: null, cargado: false, cargando: null, error: false, intento: 0, fotos: [], series: {}, spy: [], ccl: [],
               mep: [], merval: [], inflacion: [], pedidos: new Set() };
const diaAR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);

/* fotos del último año (con margen para el día anterior al primer punto),
   SPY, el CCL histórico y la serie de cada ticker. Un error de red no marca
   la carga como hecha: se reintenta en un repintado siguiente. */
async function cargarEvolucion() {
  if (!_user || !_pos.length) return;
  if (_evo.cargando) return _evo.cargando;
  _evo.intento = Date.now();
  const email = _user.email;
  const carga = (async () => {
    const db = getFirestore(getApp());
    // null: el doc no existe · undefined: falló la lectura
    const leerSerie = async id => {
      try {
        const snap = await getDoc(doc(db, "historialInformes", id));
        return snap.exists() ? JSON.parse(snap.data().json || "[]") : null;
      } catch (e) { return undefined; }
    };
    let fallo = false;
    const nuevo = { series: {} };
    const tareas = [];
    const completa = !_evo.cargado;
    if (completa) {
      tareas.push((async () => {
        try {
          const desde = diaAR(new Date(Date.now() - 400 * 864e5));
          const snap = await getDocs(query(collection(db, "inversores", email, "evolucion"), where("fecha", ">=", desde)));
          nuevo.fotos = snap.docs.map(d => {
            const x = d.data();
            let pos = [];
            try { pos = JSON.parse(x.json || "[]"); } catch (e) {}
            return { fecha: x.fecha || d.id, ccl: x.ccl, mep: x.mep, spy: x.spy, pos };
          });
        } catch (e) { fallo = true; }
      })());
      tareas.push(leerSerie("SPY").then(v => { if (v === undefined) fallo = true; else nuevo.spy = v || []; }));
      tareas.push(leerSerie("_ccl").then(v => { if (v === undefined) fallo = true; else nuevo.ccl = v || []; }));
      // contra qué se compara en el Resumen: si alguna falla, esa comparación no se ofrece
      // (no invalida la carga: la evolución contra el S&P se puede dibujar igual)
      tareas.push(leerSerie("_mep").then(v => { nuevo.mep = v || []; }));
      tareas.push(leerSerie("_merval").then(v => { nuevo.merval = v || []; }));
      tareas.push(leerSerie("_inflacion").then(v => { nuevo.inflacion = v || []; }));
    }
    const pedidos = _evo.pedidos;
    [...new Set(_pos.map(p => serieDe(p.ticker)))].filter(t => !pedidos.has(t)).forEach(t => {
      pedidos.add(t);
      tareas.push(leerSerie(t).then(v => {
        if (v === undefined) pedidos.delete(t);
        else if (v) nuevo.series[t] = v;
      }));
    });
    await Promise.all(tareas);
    // si mientras tanto cambió la sesión, lo leído es de la cuenta anterior: afuera
    if (!_user || _user.email !== email || _evo.email !== email) return;
    Object.assign(_evo.series, nuevo.series);
    if (completa) {
      if (!fallo) {
        _evo.fotos = nuevo.fotos || []; _evo.spy = nuevo.spy || []; _evo.ccl = nuevo.ccl || [];
        _evo.mep = nuevo.mep || []; _evo.merval = nuevo.merval || []; _evo.inflacion = nuevo.inflacion || [];
      }
      _evo.cargado = !fallo;
      _evo.error = fallo;
    }
  })();
  _evo.cargando = carga;
  try { await carga; } finally { if (_evo.cargando === carga) _evo.cargando = null; }
}

/* ── Evolución comparada (la dibuja el Resumen del Panel v3) ─────────────────
   Misma cuenta que el gráfico de siempre —simulación de la cartera de hoy hasta
   la primera foto y variación real desde ahí— en la moneda del encabezado, y
   contra el índice elegido. Todo en base 100 al inicio del período: el panel no
   sabe cuánto aportaste cada mes, así que no inventa una línea de "invertido".
   Devuelve { ok, motivo?, puntos: [{fecha, cartera, bench, tipo}], res, bench,
   nombre, disponibles, haySim, hayReal, notas }. Nunca rechaza. */
let _listo = { email: null, p: null };
export async function evolucionComparada({ dias = 182, moneda = "CCL", bench = "SPY" } = {}) {
  const email = _user && _user.email;
  const vacio = motivo => ({ ok: false, motivo, puntos: [], disponibles: benchsDisponibles(moneda), notas: [] });
  if (!email || !_listo.p || _listo.email !== email) return vacio("sin-sesion");
  try { await _listo.p; } catch (e) { return vacio("error"); }
  if (_listo.fallo) {
    try { await Promise.all([leerTodo(), cargarFx()]); _listo.fallo = false; } catch (e) { return vacio("error"); }
    if (!_user || _user.email !== email) return vacio("sin-sesion");
  }
  if (!_pos.length) return vacio("sin-posiciones");
  if (!_evo.cargado) { try { await cargarEvolucion(); } catch (e) {} }
  if (!_user || _user.email !== email) return vacio("sin-sesion");
  if (!_evo.cargado) return vacio(_evo.error ? "error" : "cargando");
  const disponibles = benchsDisponibles(moneda);
  if (!disponibles.includes(bench)) bench = "SPY";
  const hoy = diaAR(), desde = diaAR(new Date(Date.now() - dias * 864e5));
  // en MEP la cartera se valúa con el MEP de cada día; en pesos y en CCL, con el CCL
  const mep = moneda === "MEP";
  const cambio = mep ? _evo.mep : _evo.ccl;
  if (mep && !(cambio || []).length) return vacio("sin-mep");
  const sim = simular({ posiciones: _pos, precios: _precios, series: _evo.series, ccl: cambio, spy: _evo.spy,
                        desde, hasta: hoy, cclHoy: mep ? _fx.mep : _fx.ccl, monedaDe: (p, px) => monedaPosicion(p, px, _bonos) });
  const fotos = mep ? _evo.fotos.map(f => ({ ...f, ccl: Number(f.mep) > 0 ? f.mep : valorAl(_evo.mep, f.fecha) })) : _evo.fotos;
  const real = serieReal(fotos, { cclSerie: cambio });
  const simUsable = sim.cobertura != null && sim.cobertura >= 0.3 ? sim.puntos : [];
  const base = recortar(combinar(simUsable, real), desde);
  const series = { spy: _evo.spy, ccl: _evo.ccl, mep: _evo.mep, merval: _evo.merval, inflacion: _evo.inflacion };
  const puntos = compararCon(base, { bench, moneda: mep ? "MEP" : moneda === "ARS" ? "ARS" : "CCL", series });
  const haySim = puntos.some(x => x.tipo === "sim"), hayReal = puntos.some(x => x.tipo === "real");
  const notas = [];
  if (haySim) notas.push("La parte punteada es una simulación: tu cartera de hoy con los precios de cada día. No es lo que ganaste, porque no sabemos cuándo compraste cada cosa.");
  if (hayReal) notas.push("La parte llena es la variación real, con una foto al cierre de cada rueda: lo que agregás o vendés no cuenta como ganancia.");
  const excl = sim.excluidas.map(e => base_(e.ticker));
  if (haySim && excl.length) notas.push(`La simulación cubre el ${Math.round(sim.cobertura * 100)}% del valor de hoy; quedan afuera ${excl.slice(0, 6).join(", ")}${excl.length > 6 ? " y otras" : ""}, sin historia de precios en el período.`);
  if (bench === "INF" && _evo.inflacion.length) notas.push(`Inflación del INDEC hasta ${String(_evo.inflacion[_evo.inflacion.length - 1][0]).slice(0, 7).split("-").reverse().join("/")}; el mes en curso todavía no se publicó.`);
  notas.push("Variación de precio, sin dividendos, base 100 al inicio. No es asesoramiento financiero.");
  if (puntos.length < 2) return { ...vacio(sim.puntos.length && !simUsable.length ? "poca-cobertura" : "sin-historia"), notas };
  const a = puntos[0], z = puntos[puntos.length - 1];
  const res = { cartera: (z.cartera / a.cartera - 1) * 100, bench: (z.bench / a.bench - 1) * 100, desde: a.fecha, hasta: z.fecha };
  res.diferencia = res.cartera - res.bench;
  return { ok: true, puntos, res, bench, nombre: nombreBench(bench, moneda), disponibles, haySim, hayReal, notas };
}
const base_ = tk => base(tk);

/* El gráfico de antes, además de dibujar, mantenía la historia al día: si la
   carga había fallado la reintentaba, y si entraba una posición nueva pedía su
   serie. Eso se conserva acá (lo llama cada repintado de Mi cartera), con el
   mismo freno: como mucho una carga por minuto. */
function asegurarEvolucion() {
  if (!_user || !_pos.length || _evo.cargando || Date.now() - _evo.intento < 60000) return;
  const falta = !_evo.cargado || _pos.some(p => !_evo.pedidos.has(serieDe(p.ticker)));
  if (falta) cargarEvolucion().catch(() => {});
}

/* ── Firestore: carga, alta y baja de posiciones ── */
let _el = null, _user = null, _pos = [], _precios = {}, _ventas = [], _ajustes = [];

/* Los precios se piden DOCUMENTO POR DOCUMENTO, solo los tickers que el usuario
   tiene. Antes se bajaba la colección "precios" entera —al entrar y otra vez
   cada dos minutos— y se descartaba casi todo: con el catálogo creciendo eso se
   paga en lecturas en cada refresco, y además obliga a dejar abierta la regla
   de LISTAR la colección (con list abierto, cualquiera con sesión se lleva el
   catálogo completo por REST). Es el mismo patrón que ya usa el Resumen.

   De a tandas y no todo junto: una cartera de 200 posiciones largaría 200
   lecturas en paralelo de una, y con el refresco cada dos minutos eso es una
   tormenta contra Firestore. Un ticker sin documento no entra en el mapa y la
   fila queda "Buscando precio…", igual que antes.

   OJO con el catch vacío: un ticker que falla tampoco entra en el mapa, y eso
   SÍ cambia respecto del código viejo. Antes, una falla de permisos o de red
   al leer precios cortaba leerTodo() y el usuario veía el cartel de error de
   initMiCartera(). Ahora, si fallan TODAS las lecturas, la tabla muestra
   "Buscando precio…" en cada fila y no dice por qué. Es el precio de que un
   ticker roto no arrastre a los demás; si alguna vez molesta, el arreglo es
   contar los fallos y propagar sólo cuando no entró ni uno. */
const TANDA_PRECIOS = 20;
async function leerPrecios(db, tickers) {
  const out = {};
  for (let i = 0; i < tickers.length; i += TANDA_PRECIOS) {
    await Promise.all(tickers.slice(i, i + TANDA_PRECIOS).map(async tk => {
      try {
        const s = await getDoc(doc(db, "precios", tk));
        if (s.exists()) out[tk] = s.data();
      } catch (e) {}
    }));
  }
  return out;
}

async function leerTodo() {
  const db = getFirestore(getApp());
  const snap = await getDocs(collection(db, "inversores", _user.email, "cartera"));
  _pos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // las ventas no pueden trabar la carga de la cartera (p. ej. con reglas viejas)
  try {
    const sv = await getDocs(collection(db, "inversores", _user.email, "ventas"));
    _ventas = sv.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { _ventas = []; }
  // avisos del sync ("bajó en IOL: ¿vendiste?"); tampoco pueden trabar la carga
  try {
    const sa = await getDocs(collection(db, "inversores", _user.email, "ajustes"));
    _ajustes = sa.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { _ajustes = []; }
  // también los tickers de los avisos: una posición que "desapareció" ya no
  // está en la cartera, pero su aviso muestra la cotización de referencia
  const tks = [...new Set([..._pos, ..._ajustes].map(p => String(p.ticker || "").toUpperCase()).filter(Boolean))];
  _precios = tks.length ? await leerPrecios(db, tks) : {};
  // leerTodo arranca _precios de cero: en cada refresco hay que volver a
  // completar la renta fija desde el panel, o los bonos pierden el precio a los
  // dos minutos (en la primera carga el panel todavía no está y no hace nada)
  completarPreciosRF();
}

/* "actualizado hace X": el sync intradía escribe cada ~15 min mientras el
   mercado opera; fuera de rueda el dato queda del último cierre */
function frescura() {
  const ts = Object.values(_precios).map(p => p.actualizado_utc).filter(Boolean);
  if (!ts.length) return "";
  let ms = 0;
  try {
    ms = Math.max(...ts.map(t => new Date(t.seconds ? t.seconds * 1000 : t).getTime()));
  } catch (e) { return ""; }
  if (!isFinite(ms)) return "";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return "Precios actualizados recién";
  if (min < 60) return `Precios actualizados hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Precios actualizados hace ${h} h`;
  return "Precios del " + new Date(ms).toLocaleDateString("es-AR");
}

let _bonos = new Set(), _panel = null, _flujos = null, _desg = null;

function pintar() {
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const rf = _panel ? analisisRentaFija(calcular(_pos, _precios), _bonos, _panel, _flujos || {}, hoy) : "";
  renderMiCartera(_el, _pos, _precios, { frescura: frescura(), onRerender: enganchar, onDetalle: engancharDetalle,
                                         bonos: _bonos, rentaFija: rf, desg: _desg, ventas: _ventas, ajustes: _ajustes,
                                         panel: _panel, flujos: _flujos || {} });
  enganchar();
  // un ticker pedido desde otra pestaña (ctx.verPosicion) antes de que hubiera datos
  if (_pendiente) aplicarPendiente();
  // la historia de precios que usa el Resumen: reintento y series de posiciones nuevas
  asegurarEvolucion();
  try { window.dispatchEvent(new CustomEvent("valtia-precios", { detail: { email: _user && _user.email, precios: _precios, n: _pos.length, fx: _fx } })); } catch (e) {}
}

/* variaciones por período ya calculadas por el sync (doc público) */
async function cargarDesglose() {
  try {
    const s2 = await getDoc(doc(getFirestore(getApp()), "desglosePeriodos", "latest"));
    if (s2.exists()) _desg = JSON.parse(s2.data().json || "{}");
  } catch (e) {}
}

/* relectura después de un cambio: si al entrar no había renta fija y ahora sí
   (un bono recién agregado o importado), trae el panel de bonos y los flujos */
async function releer() {
  await leerTodo();
  if (!_panel) { try { await cargarRentaFija(); } catch (e) {} }
}

/* panel de bonos y flujos: solo hacen falta si la cartera tiene renta fija. El
   panel es el MISMO documento que ya bajó bonosSet(): no se vuelve a pedir */
async function cargarRentaFija() {
  if (!_pos.some(p => esRentaFija(p.ticker, _bonos))) return;
  _panel = (await panelBonosDoc()) || _panel;
  try {
    const s2 = await getDoc(doc(getFirestore(getApp()), "bonosFlujos", "latest"));
    if (s2.exists()) _flujos = JSON.parse(s2.data().json || "{}");
  } catch (e) {}
  completarPreciosRF();
}

/* El precio de un bono está en el panel de bonos, que la página ya tiene.
   El sync también lo escribe en precios/{ticker}, pero recién en su próxima
   corrida: mientras tanto una letra recién cargada decía "Buscando precio…"
   por horas, sin valor, y como el análisis pide al menos dos posiciones
   valuadas, arrastraba con ella la caja de renta fija y el desglose por sector.
   Acá se completa lo que FALTA: el doc del sync, si existe y trae precio, manda.
   Misma forma que escribe escribir_precio_bono() en el pipeline.

   Es UNA función, pura y exportada, porque la usan dos pantallas: Mi cartera y
   el Inicio del panel. Si cada una completara los precios por su lado, el mismo
   usuario vería dos totales distintos con una solapa de diferencia. Completa
   `precios` en el lugar y lo devuelve. */
export function completarPreciosDeRentaFija(posiciones, precios, panel, bonos) {
  const todos = panel && panel.todos;
  if (!todos || !precios) return precios;
  (posiciones || []).forEach(p => {
    const tk = String((p && p.ticker) || "").toUpperCase();
    if (!tk || !esRentaFija(tk, bonos)) return;
    const px = precios[tk];
    if (px && px.precio != null) return;
    const esp = canon(tk, bonos), d = todos[esp];
    if (!d || !(Number(d.p) > 0)) return;
    precios[tk] = { ticker: tk, precio: Number(d.p), d: d.v != null ? Number(d.v) : null,
                    moneda: monedaProbable(esp, bonos), factor: 0.01,
                    nombre: "Renta fija BYMA · cotiza por 100 VN", veredicto: "Sin cobertura",
                    delPanel: true };
  });
  return precios;
}
function completarPreciosRF() {
  completarPreciosDeRentaFija([..._pos, ..._ajustes], _precios, _panel, _bonos);
}

/* los botones de una posición (viven en su desplegable): Vendí, quitarla y cambiar
   el broker. Se enganchan en todo Mi cartera al repintar y en el desplegable que
   se abre después, sin repintar (alternarFila → opts.onDetalle). */
function engancharDetalle(root) {
  if (!root) return;
  root.querySelectorAll("[data-del]").forEach(b => b.onclick = () => quitar(b.dataset.del));
  root.querySelectorAll("[data-vender]").forEach(b => b.onclick = () => abrirVenta(b.dataset.vender));
  root.querySelectorAll(".mc-brk[data-brk]").forEach(chip => chip.onclick = () => {
    const id = chip.dataset.brk;
    const inp = document.createElement("input");
    inp.className = "mc-brk-in"; inp.setAttribute("list", "mc-brokers"); inp.maxLength = 24;
    inp.value = chip.textContent === "sin broker" ? "" : chip.textContent;
    chip.replaceWith(inp); inp.focus();
    let listo = false;
    const cerrar = () => { if (listo) return; listo = true; guardarBroker(id, inp.value.trim()); };
    inp.addEventListener("keydown", ev => { if (ev.key === "Enter") cerrar(); if (ev.key === "Escape") { listo = true; pintar(); } });
    inp.addEventListener("blur", cerrar);
  });
}

function enganchar() {
  const add = _el.querySelector("#mc-add");
  if (add) add.onclick = agregar;
  engancharDetalle(_el);
  _el.querySelectorAll("[data-deshacer]").forEach(b => b.onclick = () => deshacerVenta(b.dataset.deshacer, b));
  _el.querySelectorAll(".mc-aj").forEach(card => {
    card.querySelectorAll("input").forEach(i => i.addEventListener("input", () => vistaAjuste(card)));
    card.querySelector("[data-aj-ok]").onclick = () => confirmarAjuste(card);
    card.querySelector("[data-aj-no]").onclick = () => descartarAjuste(card);
    const tengo = card.querySelector("[data-aj-tengo]");
    if (tengo) tengo.onclick = () => recuperarAjuste(card, tengo);
    vistaAjuste(card);
  });
  _el.querySelectorAll(".mc-tab").forEach(t => t.onclick = () => {
    _el.querySelectorAll(".mc-tab").forEach(x => x.classList.toggle("on", x === t));
    const imp = t.dataset.modo === "imp";
    _el.querySelector("#mc-modo-uno").style.display = imp ? "none" : "block";
    _el.querySelector("#mc-modo-imp").style.display = imp ? "block" : "none";
  });
  const ib = _el.querySelector("#mc-imp-btn");
  if (ib) ib.onclick = revisarImport;
  _el.querySelectorAll("[data-cerrar-form]").forEach(b => b.onclick = () => abrirFormulario(false));
}

/* cotizaciones para convertir (misma fuente que la barra del sitio) */
/* el dólar sale de fx.js: misma fuente que la barra, pero con guardas y una
   sola consulta por carga compartida con el panel. Si no pasa las guardas,
   _fx.ccl queda en null y el aviso de "sin dólar" se encarga. fxMercado()
   nunca rechaza. */
async function cargarFx() { _fx = await fxMercado(); }

/* ── importar: primero muestra qué entendió, después confirma ── */
let _porImportar = null;

/* el formulario de alta: cerrado mientras haya posiciones, hasta que se toca
   "+ Agregar posición" en el encabezado del panel. El estado sobrevive a los
   repintados (el refresco de precios cada 2 min vuelve a dibujar todo). */
let _formAbierto = false;
const formVisible = n => _formAbierto || !n;
export function abrirFormulario(abrir) {
  _formAbierto = abrir == null ? (!_pos.length || !_formAbierto) : !!abrir;
  const f = _el && _el.querySelector("#mc-form");
  if (!f) return _formAbierto;
  f.hidden = !formVisible(_pos.length);
  if (f.hidden) {
    const uno = f.querySelector("#mc-modo-uno"), imp = f.querySelector("#mc-modo-imp");
    if (uno) uno.style.display = "block";
    if (imp) imp.style.display = "none";
    f.querySelectorAll(".mc-tab").forEach(x => x.classList.toggle("on", x.dataset.modo === "uno"));
  }
  if (!f.hidden && _formAbierto) {
    try { f.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { f.scrollIntoView(); }
    const i = f.querySelector("#mc-ticker");
    if (i) try { i.focus({ preventScroll: true }); } catch (e) {}
  }
  return _formAbierto;
}

async function revisarImport() {
  const txt = _el.querySelector("#mc-paste").value;
  const mercado = (_el.querySelector("#mc-imp-mercado") || {}).value || "byma";
  const broker = ((_el.querySelector("#mc-imp-broker") || {}).value || "").trim();
  setPref("valtia-mc-mercado", mercado); if (broker) setPref("valtia-mc-broker", broker);
  const { filas, errores } = parseImport(txt);
  const prev = _el.querySelector("#mc-prev");
  if (!filas.length) {
    prev.innerHTML = `<div class="mc-hint mc-bad">No pude leer ninguna posición.
      ${errores.slice(0, 4).map(esc).join("<br>")}</div>`;
    return;
  }
  const bonos = await bonosSet();
  filas.forEach(f => {
    f.ticker = normalizarTicker(f.ticker, mercado, bonos);
    f.broker = broker;
    // moneda y factor como en "Agregar una": sin esto, una venta de una
    // posición recién importada podía quedar congelada en dólares
    f.moneda = monedaMercado(mercado, f.ticker, bonos);
    f.factor = bonos.has(f.ticker) ? 0.01 : 1;
    f.monedaHint = f.moneda;   // la vista previa muestra exactamente lo que se guarda
  });
  _porImportar = filas;
  prev.innerHTML = `
    <div class="mc-prev"><table>
      <thead><tr><th>Se guarda como</th><th>Cantidad</th><th>Precio compra</th><th>Fecha</th><th>Broker</th></tr></thead>
      <tbody>${filas.map(f => `<tr><td><b>${esc(f.ticker)}</b></td><td>${num(f.cantidad, 4).replace(/,0+$/, "")}</td>
        <td>${f.precioCompra ? montoTxt(f.precioCompra, f.monedaHint) : "—"}</td><td>${esc(f.fecha || "—")}</td><td>${esc(broker || "—")}</td></tr>`).join("")}</tbody>
    </table></div>
    ${errores.length ? `<div class="mc-hint mc-bad">${errores.length} línea(s) que no pude leer:<br>${errores.slice(0, 4).map(esc).join("<br>")}</div>` : ""}
    <button class="mc-btn" id="mc-imp-ok" style="margin-top:12px">Importar ${filas.length} ${filas.length === 1 ? "posición" : "posiciones"}</button>`;
  const ok = _el.querySelector("#mc-imp-ok");
  if (ok) ok.onclick = confirmarImport;
}

async function confirmarImport() {
  // se toman las filas y se vacían ANTES de grabar: un segundo clic no las duplica
  const filas = _porImportar;
  _porImportar = null;
  if (!filas || !filas.length) return;
  const btn = _el.querySelector("#mc-imp-ok");
  if (btn) { btn.disabled = true; btn.textContent = "Importando…"; }
  const db = getFirestore(getApp());
  let ok = 0, fallo = 0;
  for (const f of filas) {
    try {
      const id = f.ticker + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
      await setDoc(doc(db, "inversores", _user.email, "cartera", id), {
        ticker: f.ticker, cantidad: f.cantidad, precioCompra: f.precioCompra,
        fecha: f.fecha, broker: f.broker || "", moneda: f.moneda, factor: f.factor, creado: new Date().toISOString(),
      });
      ok++;
    } catch (e) { fallo++; }
  }
  try { await releer(); } catch (e) {}
  pintar();
  if (ok) avisarPanel();
  const msg2 = _el.querySelector("#mc-msg");
  if (msg2) msg2.innerHTML = `<span style="color:var(--v3-up)">${ok} ${ok === 1 ? "posición importada" : "posiciones importadas"}.</span>` +
    (fallo ? ` <span style="color:var(--v3-dn)">${fallo} fallaron.</span>` : "") +
    ` <span style="color:var(--v3-mut)">Los precios aparecen en la próxima actualización (cada 15 min en rueda).</span>`;
}

async function agregar() {
  const msg = _el.querySelector("#mc-msg");
  const mercado = (_el.querySelector("#mc-mercado") || {}).value || "byma";
  const broker = ((_el.querySelector("#mc-broker") || {}).value || "").trim();
  const crudo = (_el.querySelector("#mc-ticker").value || "").trim().toUpperCase();
  const cant = parseFloat(_el.querySelector("#mc-cant").value);
  const pc = parseFloat(_el.querySelector("#mc-precio").value);
  const fecha = _el.querySelector("#mc-fecha").value || "";
  if (!crudo || !(cant > 0)) {
    msg.innerHTML = `<span style="color:var(--v3-dn)">Completá al menos el ticker y la cantidad.</span>`;
    return;
  }
  // un segundo clic mientras graba crearía otra posición igual
  const btn = _el.querySelector("#mc-add");
  if (btn) { if (btn.disabled) return; btn.disabled = true; }
  try {
    const bonos = await bonosSet();
    const tk = normalizarTicker(crudo, mercado, bonos);
    const moneda = monedaMercado(mercado, tk, bonos);
    setPref("valtia-mc-mercado", mercado); if (broker) setPref("valtia-mc-broker", broker);
    const db = getFirestore(getApp());
    const id = tk + "-" + Date.now().toString(36);
    // moneda y factor: el formulario los sabe (mercado elegido). Sin ellos,
    // hasta la próxima corrida del sync una compra en pesos se lee en dólares
    await setDoc(doc(db, "inversores", _user.email, "cartera", id), {
      ticker: tk, cantidad: cant, precioCompra: isFinite(pc) ? pc : 0, fecha,
      broker, moneda,
      factor: bonos.has(tk) ? 0.01 : 1,
      creado: new Date().toISOString(),
    });
    const donde = mercado === "byma" ? `BYMA, en ${moneda === "USD" ? "dólares" : "pesos"}` : mercado === "cripto" ? "cripto, en dólares" : "exterior, en dólares";
    await releer();
    pintar();
    // el repintado recrea el formulario: el mensaje se escribe recién ahora
    const msg2 = _el.querySelector("#mc-msg");
    if (msg2) msg2.innerHTML = `<span style="color:var(--v3-up)">${esc(tk)} agregado (${donde}${broker ? ", " + esc(broker) : ""}). El precio aparece en la próxima actualización — cada 15 min en rueda.</span>`;
    avisarPanel();
  } catch (e) {
    msg.innerHTML = `<span style="color:var(--v3-dn)">No se pudo guardar: ${esc(String(e).slice(0, 90))}</span>`;
  } finally {
    // si salió bien, pintar() ya recreó el formulario con un botón nuevo
    if (btn && btn.isConnected) btn.disabled = false;
  }
}

/* ── ventas: formulario en la fila, registro atómico y deshacer ── */
function abrirVenta(id) {
  const viejo = _el.querySelector(".mc-vrow");
  if (viejo) { const era = viejo.dataset.para; viejo.remove(); if (era === id) return; }
  // la fila de la grilla (Panel v3): el formulario va al pie de esa posición,
  // debajo de su desplegable si está abierto
  const tr = [..._el.querySelectorAll(".mc3-row[data-fila]")].find(x => x.dataset.fila === id);
  const p = _pos.find(x => x.id === id);
  if (!tr || !p) return;
  const px = _precios[String(p.ticker).toUpperCase()] || null;
  const esRF = esRentaFija(p.ticker, _bonos);
  const { moneda, factor } = monedaFactor(p, px, esRF);
  const unidad = factor !== 1 ? "cada 100 VN" : "por unidad";
  const hoy = hoyAR();
  const sync = String(p.origen || "").startsWith("sync");
  const costo = Number(p.precioCompra) > 0 ? Number(p.precioCompra) : 0;
  const fila = document.createElement("div");
  // sin moneda no hay nada que registrar: la fila es un aviso y el refresco
  // de 2 min la puede pisar para traer el precio (por eso no se enfoca nada)
  fila.className = "mc-vrow" + (moneda ? "" : " mc-vrow-espera");
  fila.dataset.para = id;
  // un id por formulario: si se reintenta después de un error, no se duplica la venta
  fila.dataset.vid = base(p.ticker) + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  fila.innerHTML = `<div class="mc-vform">
      <div><label>Cantidad vendida</label><input id="mc-v-cant" type="number" step="any" min="0" value="${Number(p.cantidad) || ""}"></div>
      <div><label>Precio de venta · ${monNombre(moneda)}, ${unidad}</label><input id="mc-v-px" type="number" step="any" min="0" value="${px && px.precio != null && isFinite(px.precio) ? +(px.precio >= 100 ? Number(px.precio).toFixed(2) : Number(px.precio).toPrecision(6)) : ""}"></div>
      <div><label>Fecha de la venta</label><input id="mc-v-fecha" type="date" max="${hoy}" value="${hoy}"></div>
      <div class="prev" id="mc-v-prev"></div>
      <div><button class="mc-btn" id="mc-v-ok">Registrar venta</button> <button class="mc-undo" id="mc-v-no">Cancelar</button></div>
      <div class="nota">Tu costo en esta posición: <b>${costo ? (moneda ? money(costo, moneda) : num(costo, 2)) + " " + unidad + aprox(costo, moneda)
        : "sin precio de compra cargado, así que el resultado no se va a poder calcular"}</b>.
        ${px && px.precio != null ? "El precio viene con la última cotización: poné el que te pagaron." : ""}
        ${sync ? "Esta posición la trae el sync de tu broker: en la próxima corrida la cantidad se ajusta a lo que diga el broker." : ""}
        ${!moneda ? (px && px.sinDatos
          ? "<b>No encontramos este ticker</b>, así que no sabemos en qué moneda cotiza: revisá que esté bien escrito (quitalo desde «Ajustar» y volvé a cargarlo) para poder registrar la venta."
          : "<b>Todavía no tenemos la cotización de este activo</b>, así que no sabemos en qué moneda está: esperá a que aparezca su precio (cada 15 min en rueda) para registrar la venta.") : ""}</div>
      <div class="mc-msg" id="mc-v-msg" style="flex-basis:100%;margin:0"></div>
    </div>`;
  (tr.closest(".mc3-pos") || tr.parentElement).appendChild(fila);
  if (!moneda) fila.querySelectorAll("input, #mc-v-ok").forEach(i => { i.disabled = true; });
  // type=number siempre entrega el valor con punto decimal: parseFloat, no parseNum
  const leer = () => ({
    cant: parseFloat(fila.querySelector("#mc-v-cant").value),
    precio: parseFloat(fila.querySelector("#mc-v-px").value),
    fecha: fila.querySelector("#mc-v-fecha").value,
  });
  const vista = () => {
    const { cant, precio, fecha } = leer();
    const out = fila.querySelector("#mc-v-prev");
    const v = validarVenta(p, cant, precio, fecha, hoyAR(), moneda);
    if (!v.ok) { out.innerHTML = `<span class="mc-mut">${esc(v.error)}</span>`; return; }
    const { resultado, pct: q } = resultadoVenta(armarVenta(p, px, cant, precio, fecha, "", esRF));
    out.innerHTML = resultado == null ? `<span class="mc-mut">Resultado: sin precio de compra</span>`
      : `Resultado: <b class="${resultado >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(resultado, moneda)}</b>${aprox(resultado, moneda, true)} · ${pct(q)}`
        + (v.resto === 0 ? " · vendés toda la posición" : "");
  };
  fila.querySelectorAll("input").forEach(i => i.addEventListener("input", vista));
  fila.querySelector("#mc-v-no").onclick = () => fila.remove();
  // la posición se toma de _pos al momento del clic: si un intento anterior
  // falló y releyó, el reintento prevalida contra la cantidad real
  fila.querySelector("#mc-v-ok").onclick = () => registrarVenta(_pos.find(x => x.id === p.id) || p, px, esRF, leer(), fila);
  vista();
  if (moneda) fila.querySelector("#mc-v-px").focus();
}

async function registrarVenta(p, px, esRF, { cant, precio, fecha }, fila) {
  const msg = fila.querySelector("#mc-v-msg"), btn = fila.querySelector("#mc-v-ok");
  const pre = validarVenta(p, cant, precio, fecha, hoyAR(), monedaFactor(p, px, esRF).moneda);
  if (!pre.ok) { msg.innerHTML = `<span style="color:var(--v3-dn)">${esc(pre.error)}</span>`; return; }
  btn.disabled = true;
  const db = getFirestore(getApp());
  const refPos = doc(db, "inversores", _user.email, "cartera", p.id);
  const refVenta = doc(db, "inversores", _user.email, "ventas", fila.dataset.vid);
  let venta = null;
  try {
    // la posición se relee ADENTRO de la transacción: la que está en memoria
    // puede tener minutos (otra pestaña, el refresco pausado). Si alguien la
    // cambia en el medio, Firestore reintenta con los datos nuevos en vez de pisarlos
    await runTransaction(db, async tx => {
      const sv = await tx.get(refVenta);
      const sp = await tx.get(refPos);
      if (sv.exists()) { venta = sv.data(); return; }       // un reintento de una que ya entró
      if (!sp.exists()) throw new Error("Esa posición ya no está en tu cartera (¿la vendiste o la borraste desde otra pestaña?). Recargá la página.");
      const fresca = { id: p.id, ...sp.data() };
      const v = validarVenta(fresca, cant, precio, fecha, hoyAR(), monedaFactor(fresca, px, esRF).moneda);
      if (!v.ok) throw new Error(v.error);
      venta = armarVenta(fresca, px, cant, precio, fecha, new Date().toISOString(), esRF);
      tx.set(refVenta, venta);
      if (v.resto === 0) tx.delete(refPos); else tx.update(refPos, { cantidad: v.resto });
    });
  } catch (e) {
    // el commit puede haber entrado aunque acá llegue un error (se cortó la
    // red justo después de mandarlo). Antes de invitar a reintentar, se relee:
    // si la venta ya está, es un éxito; si no, el error, con la tabla al día
    // para que un reintento (o cerrar y reabrir) parta de la cantidad real.
    let entro = false;
    try { await leerTodo(); entro = _ventas.some(x => x.id === fila.dataset.vid); } catch (e2) {}
    if (!entro) {
      // la fila de arriba muestra la cantidad que acaba de releerse, para que
      // el error ("no podés vender más de 60") y la tabla digan lo mismo
      const p2 = _pos.find(x => x.id === p.id);
      const celda = [..._el.querySelectorAll("[data-cantde]")].find(x => x.dataset.cantde === p.id);
      if (celda && p2) celda.textContent = cantFmt(p2.cantidad) + (esRF ? " VN" : "");
      btn.disabled = false;
      msg.innerHTML = `<span style="color:var(--v3-dn)">${esc(String((e && e.message) || e).slice(0, 180))}</span>`;
      return;
    }
    venta = _ventas.find(x => x.id === fila.dataset.vid);
  }
  // la venta ya quedó guardada: si falla el refresco, NO se invita a reintentar
  const { resultado } = resultadoVenta(venta);
  const texto = `Venta registrada: ${cantTxt(venta.cantidad)} ${esc(base(venta.ticker))}`
    + (resultado != null ? ` con un resultado de ${enVista(resultado, venta.moneda === "ARS" ? "ARS" : "USD", true, true)}` : "")
    + ". La ves más abajo, en Ventas y resultado realizado.";
  try {
    await leerTodo();
    pintar();
    avisarPanel();
  } catch (e) {
    msg.innerHTML = `<span style="color:var(--v3-up)">${texto}</span> <span class="mc-mut">No pude actualizar la tabla: recargá la página.</span>`;
    return;
  }
  const m2 = _el.querySelector("#mc-msg");
  if (m2) m2.innerHTML = `<span style="color:var(--v3-up)">${texto}</span>`;
}

const _deshaciendo = new Set();
async function deshacerVenta(vid, btn) {
  if (_deshaciendo.has(vid)) return;                    // doble clic: manda el primero
  const v = _ventas.find(x => x.id === vid);
  if (!v) return;
  const deAviso = v.origen === "broker";
  if (!confirm(deAviso
    ? `¿Deshacer la venta de ${cantTxt(v.cantidad)} ${base(v.ticker)} del ${fmtFecha(v.fecha)}? Se borra la venta y vuelve el aviso para que la respondas de nuevo (la cantidad del panel sigue a ${v.broker || "tu broker"}).`
    : `¿Deshacer la venta de ${cantTxt(v.cantidad)} ${base(v.ticker)} del ${fmtFecha(v.fecha)}? La posición vuelve a tu cartera.`)) return;
  _deshaciendo.add(vid);
  if (btn) { btn.disabled = true; btn.textContent = "Deshaciendo…"; }
  const db = getFirestore(getApp());
  const refVenta = doc(db, "inversores", _user.email, "ventas", vid);
  let error = "";
  try {
    // todo se decide con lo que hay en Firestore AHORA, no con la memoria: si
    // la venta ya se deshizo (otra pestaña, un reintento), no se suma dos veces
    await runTransaction(db, async tx => {
      const sv = await tx.get(refVenta);
      if (!sv.exists()) return;                         // ya estaba deshecha
      const venta = sv.data();
      if (venta.origen === "broker") {
        // salió de un aviso del sync: la cantidad del panel ya la fijó el
        // broker, así que no se suma nada. La venta se borra y el aviso vuelve,
        // leyendo antes su lugar: nunca se pisa un aviso nuevo del sync
        const refBack = doc(db, "inversores", _user.email, "ajustes", vid.replace(/^aj-/, ""));
        const sb = await tx.get(refBack);
        if (sb.exists()) throw new Error("Ya hay un aviso pendiente para esta venta: respondelo antes de deshacerla.");
        tx.delete(refVenta);
        tx.set(refBack, ajusteDesdeVenta(venta));
        return;
      }
      const pid = venta.posId || (base(venta.ticker) + "-" + Date.now().toString(36));
      const refPos = doc(db, "inversores", _user.email, "cartera", pid);
      const sp = await tx.get(refPos);
      tx.delete(refVenta);
      if (sp.exists()) tx.update(refPos, { cantidad: (Number(sp.data().cantidad) || 0) + Number(venta.cantidad) });
      else tx.set(refPos, planDeshacer(venta, null).datos);
    });
  } catch (e) {
    error = String((e && e.message) || e).slice(0, 140);
  } finally {
    _deshaciendo.delete(vid);
  }
  let refrescada = true;
  try {
    await leerTodo();
    // el commit pudo entrar aunque acá llegara un error: si la venta ya no
    // está, se deshizo, y el mensaje no puede decir lo contrario que la tabla
    if (error && !_ventas.some(v => v.id === vid)) error = "";
    pintar(); avisarPanel();
  } catch (e) { refrescada = false; }
  const aviso = _el.querySelector("#mc-ventas-msg") || _el.querySelector("#mc-msg");
  if (error) {
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = "Deshacer"; }
    if (aviso) aviso.innerHTML = `<span style="color:var(--v3-dn)">No se pudo deshacer: ${esc(error)}</span>`;
  } else if (!refrescada && aviso) {
    aviso.innerHTML = `<span class="mc-mut">Se deshizo la venta, pero no pude actualizar la tabla: recargá la página.</span>`;
  }
}

/* ── responder un aviso del sync ── */
function datosAjuste(card) {
  const a = _ajustes.find(x => x.id === card.dataset.aj);
  if (!a) return null;
  const px = _precios[String(a.ticker || "").toUpperCase()] || null;
  const esRF = esRentaFija(a.ticker, _bonos);
  return { a, px, esRF, moneda: monedaFactor(a.pos || {}, px, esRF, a.ticker).moneda,
           cant: parseFloat(card.querySelector("[data-aj-cant]").value),
           precio: parseFloat(card.querySelector("[data-aj-px]").value),
           fecha: card.querySelector("[data-aj-fecha]").value };
}

function vistaAjuste(card) {
  const d = datosAjuste(card), out = card.querySelector("[data-aj-prev]");
  if (!d || !out) return;
  const v = validarAjuste(d.a, d.cant, d.precio, d.fecha, hoyAR(), d.moneda);
  if (!v.ok) { out.innerHTML = `<span class="mc-mut">${esc(v.error)}</span>`; return; }
  const { resultado, pct: q } = resultadoVenta(ventaDesdeAjuste(d.a, d.cant, d.px, d.precio, d.fecha, "", d.esRF));
  out.innerHTML = resultado == null ? `<span class="mc-mut">Resultado: sin precio de compra</span>`
    : `Resultado: <b class="${resultado >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(resultado, d.moneda)}</b>${aprox(resultado, d.moneda, true)} · ${pct(q)}`;
}

async function confirmarAjuste(card) {
  const d = datosAjuste(card); if (!d) return;
  const msg = card.querySelector("[data-aj-msg]"), btn = card.querySelector("[data-aj-ok]");
  const v = validarAjuste(d.a, d.cant, d.precio, d.fecha, hoyAR(), d.moneda);
  if (!v.ok) { msg.innerHTML = `<span style="color:var(--v3-dn)">${esc(v.error)}</span>`; return; }
  btn.disabled = true;
  const db = getFirestore(getApp());
  const refAj = doc(db, "inversores", _user.email, "ajustes", d.a.id);
  // un id de venta por TARJETA: un reintento desde la misma tarjeta no registra
  // dos veces, y dos respuestas al mismo aviso (parciales, o un aviso que el
  // sync reutilizó el mismo día) nunca chocan entre sí
  const vid = card.dataset.vid || ("aj-" + d.a.id + "-" + Math.random().toString(36).slice(2, 6));
  const refVenta = doc(db, "inversores", _user.email, "ventas", vid);
  let venta = null, resto = 0;
  try {
    // la cantidad del panel ya la ajustó el sync: la transacción crea la venta
    // desde la foto del aviso (fresca, no la de memoria) y, si se respondió
    // todo lo que bajó, borra el aviso; si fue una parte, deja el resto
    await runTransaction(db, async tx => {
      const sv = await tx.get(refVenta);
      const sa = await tx.get(refAj);
      if (sv.exists()) { venta = sv.data(); return; }          // un reintento de una que ya entró
      if (!sa.exists()) throw new Error("Este aviso ya se respondió desde otra pestaña. Recargá la página.");
      const fresco = { id: d.a.id, ...sa.data() };
      const v = validarAjuste(fresco, d.cant, d.precio, d.fecha, hoyAR(), d.moneda);
      if (!v.ok) throw new Error(v.error);
      venta = ventaDesdeAjuste(fresco, d.cant, d.px, d.precio, d.fecha, new Date().toISOString(), d.esRF);
      tx.set(refVenta, venta);
      resto = Math.round((cantidadAjuste(fresco) - d.cant) * 1e8) / 1e8;
      if (resto > 0) tx.set(refAj, restoDeAjuste(fresco, d.cant, new Date().toISOString()));
      else tx.delete(refAj);
    });
  } catch (e) {
    let entro = false;
    try { await leerTodo(); entro = _ventas.some(x => x.id === vid); } catch (e2) {}
    if (!entro) {
      btn.disabled = false;
      msg.innerHTML = `<span style="color:var(--v3-dn)">${esc(String((e && e.message) || e).slice(0, 180))}</span>`;
      return;
    }
    venta = _ventas.find(x => x.id === vid);
  }
  const { resultado } = resultadoVenta(venta);
  const texto = `Venta registrada: ${cantTxt(venta.cantidad)} ${esc(base(venta.ticker))}`
    + (resultado != null ? ` con un resultado de ${enVista(resultado, venta.moneda === "ARS" ? "ARS" : "USD", true, true)}` : "")
    + ". La ves más abajo, en Ventas y resultado realizado."
    + (resto > 0 ? ` Quedan ${cantTxt(resto)} por responder en el aviso.` : "");
  // lo escrito en ESTA tarjeta ya se usó: si queda un resto, la tarjeta nueva
  // arranca con el resto como cantidad, no con lo que se acaba de registrar
  card.querySelectorAll("input").forEach(i => { i.value = i.defaultValue; });
  try { await leerTodo(); pintar(); avisarPanel(); } catch (e) {
    msg.innerHTML = `<span style="color:var(--v3-up)">${texto}</span> <span class="mc-mut">No pude actualizar la tabla: recargá la página.</span>`;
    return;
  }
  const m2 = _el.querySelector("#mc-msg");
  if (m2) m2.innerHTML = `<span style="color:var(--v3-up)">${texto}</span>`;
}

async function descartarAjuste(card) {
  const a = _ajustes.find(x => x.id === card.dataset.aj); if (!a) return;
  const txt = a.tipo === "desaparecio"
    ? `¿Descartar el aviso de ${base(a.ticker)}? No se registra ninguna venta y la posición NO vuelve al panel: se pierde su precio de compra y su fecha. Si la seguís teniendo, usá "La sigo teniendo".`
    : `¿Descartar el aviso de ${base(a.ticker)}? No se registra ninguna venta; la cantidad del panel ya sigue a ${a.broker}.`;
  if (!confirm(txt)) return;
  try {
    await deleteDoc(doc(getFirestore(getApp()), "inversores", _user.email, "ajustes", a.id));
    await leerTodo(); pintar(); avisarPanel();
  } catch (e) {
    const msg = card.querySelector("[data-aj-msg]");
    if (msg && msg.isConnected) msg.innerHTML = `<span style="color:var(--v3-dn)">No se pudo descartar: ${esc(String((e && e.message) || e).slice(0, 120))}</span>`;
  }
}

/* "La sigo teniendo": la posición vuelve a la cartera desde la foto del aviso
   (misma cantidad, mismo costo, misma fecha) y el aviso se retira, juntos */
async function recuperarAjuste(card, btn) {
  const a = _ajustes.find(x => x.id === card.dataset.aj); if (!a) return;
  const pos = { ...(a.pos || {}) };
  if (!pos.ticker || !(Number(a.cantidadAntes) > 0)) return;
  btn.disabled = true;
  const db = getFirestore(getApp());
  const refAj = doc(db, "inversores", _user.email, "ajustes", a.id);
  const refPos = doc(db, "inversores", _user.email, "cartera", a.posId || (base(a.ticker) + "-" + Date.now().toString(36)));
  try {
    await runTransaction(db, async tx => {
      const sa = await tx.get(refAj);
      const sp = await tx.get(refPos);
      if (!sa.exists()) return;                                     // ya respondido en otra pestaña
      const fresco = sa.data();
      if (fresco.tipo !== "desaparecio") throw new Error("Este aviso cambió (la posición volvió a aparecer en el broker). Recargá la página.");
      if (sp.exists()) throw new Error("Esa posición ya está en tu cartera: si el aviso no corresponde, descartalo.");
      // vuelve SIN el origen del sync: si la transferiste a otro broker, el
      // sync no la va a dar por vendida otra vez; si sigue en el broker, mañana
      // la vuelve a adoptar
      const { origen, ...foto } = fresco.pos || {};
      tx.set(refPos, { ...foto, ticker: foto.ticker || fresco.ticker, cantidad: Number(fresco.cantidadAntes) });
      tx.delete(refAj);
    });
    await leerTodo(); pintar(); avisarPanel();
    const m2 = _el.querySelector("#mc-msg");
    if (m2) m2.innerHTML = `<span style="color:var(--v3-up)">${esc(base(a.ticker))} volvió a tu cartera con su costo. Si la transferiste a otro broker, cambiale el broker desde «Ajustar» en su fila; si sigue en ${esc(a.broker)}, el sync la vuelve a comparar mañana.</span>`;
  } catch (e) {
    btn.disabled = false;
    const msg = card.querySelector("[data-aj-msg]");
    if (msg && msg.isConnected) msg.innerHTML = `<span style="color:var(--v3-dn)">No se pudo recuperar: ${esc(String((e && e.message) || e).slice(0, 120))}</span>`;
  }
}

/* llegada desde la ficha de un activo ("+ Agregar a Mi cartera"): el ticker
   viene en la URL (?agregar=NVDA); se precarga UNA vez, con el mercado que
   corresponde a la ficha (dólares), y el cursor queda en la cantidad */
function prellenarDesdeUrl() {
  let tk = "";
  try { tk = (new URLSearchParams(location.search).get("agregar") || "").trim().toUpperCase().slice(0, 12); } catch (e) {}
  if (!tk || !/^[A-Z0-9.\-]+$/.test(tk)) return;
  abrirFormulario(true);
  const inp = _el.querySelector("#mc-ticker"), sel = _el.querySelector("#mc-mercado");
  if (!inp || !sel) return;
  inp.value = tk;
  sel.value = /^(BTC|ETH)(-USD)?$/.test(tk) ? "cripto" : "ext";
  const cant = _el.querySelector("#mc-cant");
  if (cant) cant.focus();
  // que un F5 no vuelva a precargar
  try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
}

async function guardarBroker(id, broker) {
  try {
    const db = getFirestore(getApp());
    await setDoc(doc(db, "inversores", _user.email, "cartera", id), { broker }, { merge: true });
    if (broker) setPref("valtia-mc-broker", broker);
    await leerTodo();
  } catch (e) {}
  pintar();
  avisarPanel();
}

async function quitar(id) {
  try {
    const db = getFirestore(getApp());
    await deleteDoc(doc(db, "inversores", _user.email, "cartera", id));
    await leerTodo();
    pintar();
    avisarPanel();
  } catch (e) {}
}

/* Cambio de cuenta sin recargar la página: el módulo sobrevive y estas
   variables todavía tienen las posiciones, las ventas y los avisos del usuario
   anterior. Las llama el panel apenas detecta que cambió el mail. */
export function reiniciarMiCartera() {
  _el = null; _user = null; _pos = []; _precios = {}; _ventas = []; _ajustes = [];
  _porImportar = null; _formAbierto = false; _listo = { email: null, p: null };
  // el desplegable guarda informes, noticias y eventos de la cuenta anterior
  _vista = null; _abierta = null; _ajAbierto = null; _pendiente = null; _detCache = {};
  _evCache = { email: null, t: 0, p: null };
  Object.assign(_evo, { email: null, cargado: false, cargando: null, error: false,
                        intento: 0, fotos: [], series: {}, spy: [], ccl: [], mep: [], merval: [], inflacion: [] });
  try { _evo.pedidos.clear(); _deshaciendo.clear(); } catch (e) {}
}

export async function initMiCartera(user, el) {
  if (!user || !el) return;
  _user = user; _el = el;
  // otra sesión en la misma página (logout y login sin recargar): las fotos
  // son privadas y no pueden quedar en memoria para la cuenta siguiente
  if (_evo.email !== user.email) {
    Object.assign(_evo, { email: user.email, cargado: false, cargando: null, error: false, intento: 0, fotos: [] });
    _detCache = {}; _abierta = null; _ajAbierto = null;
  }
  asegurarEstilo();
  if (!user.emailVerified) {
    // sin verificar, las reglas de Firestore bloquean la cartera del usuario
    el.innerHTML = `<div class="mc-empty"><h4>Verificá tu email para activar Mi Cartera</h4>
      <p>Te mandamos un mail de verificación a <b>${esc(user.email)}</b>. Abrilo, tocá el link
      y recargá la página — tus posiciones y el plan de inversión mensual se activan al instante.</p></div>`;
    return;
  }
  el.innerHTML = `<p class="mc-cargando">Cargando tus posiciones…</p>`;
  let avisarListo = () => {};
  _listo = { email: user.email, p: new Promise(r => { avisarListo = r; }) };
  // el panel (panel.js) avisa cuando registra una compra o cambia la moneda.
  // Sin argumento alterna (botón del encabezado); con true lo abre (el Resumen)
  window.__mcAbrirForm = abrir => abrirFormulario(abrir);
  // ctx.verPosicion(ticker): abre esa fila con su desplegable
  window.__mcAbrirFila = abrirFila;
  window.__mcRecargar = async () => {
    _cur = pref("valtia-mc-cur", "ARS");
    _ocultar = pref("valtia-mc-ocultar", "") === "1";
    try { await Promise.all([releer(), cargarFx()]); pintar(); } catch (e) {}
  };
  try {
    // el panel de bonos se pide junto con todo lo demás (antes iba después, en
    // serie) y tiene que estar ANTES de decidir qué es renta fija: un CER solo
    // se reconoce por figurar ahí
    const [, , bset] = await Promise.all([leerTodo(), cargarFx(), bonosSet()]);
    _bonos = bset;
    await Promise.all([cargarRentaFija(), cargarDesglose()]);
    pintar();
    avisarListo();
    prellenarDesdeUrl();
    // la historia de precios y las fotos se cargan aparte: no demoran la tabla.
    // Mi cartera ya no dibuja la evolución (está en el Resumen), pero la carga
    // sigue acá: evolucionComparada() depende de _evo
    cargarEvolucion().catch(() => {});
    // el sync intradía reescribe los precios cada ~15 min: se releen solos
    // (sin pisar lo que el usuario esté escribiendo ni si la pestaña no se ve)
    if (!window.__mcTimer) {
      window.__mcTimer = setInterval(async () => {
        if (document.hidden || !_el || _el.offsetParent === null) return;
        const act = document.activeElement;
        if (act && _el.contains(act) && /INPUT|TEXTAREA/.test(act.tagName)) return;
        // pestaña Importar abierta = el usuario está armando el paste: no pisar
        const imp = _el.querySelector("#mc-modo-imp"), fm = _el.querySelector("#mc-form");
        if (imp && imp.style.display !== "none" && fm && !fm.hidden) return;
        // formulario de venta abierto: no pisarlo (salvo el aviso de "esperá el precio",
        // que justamente necesita el refresco para que el precio llegue)
        if (_el.querySelector(".mc-vrow:not(.mc-vrow-espera)")) return;
        // un aviso del sync con el precio escrito: tampoco se pisa
        if (Object.keys(escritoEnAvisos(_el)).length) return;
        try { await Promise.all([releer(), cargarFx()]); pintar(); } catch (e) {}
      }, 120000);
    }
  } catch (e) {
    _listo.fallo = true;
    avisarListo();
    el.innerHTML = `<p class="mc-cargando">No pudimos cargar tu cartera (${esc(String(e).slice(0, 120))}). Recargá la página en unos minutos.</p>`;
  }
}
