// mi-cartera.js — seguimiento de la cartera propia del cliente.
// El cliente carga sus posiciones (ticker, cantidad, precio de compra) y ve
// valor actual, resultado y la lectura Valtia de cada activo. Los precios y
// fundamentals los deja el sync diario en precios/{TICKER}; acá solo se lee.
//
// Diseño separado a propósito: renderMiCartera() es puro (datos -> HTML) para
// poder verificarlo con datos de prueba sin tocar Firestore.
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, query, where }
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
// "Avisarme si…": la alerta de precio del activo, desde su desplegable. Este es
// el ÚNICO camino a inversores/{email}/alertasPrecio: acá se crea y se lee lo que
// ya hay; la pestaña Alertas lista, marca vistas y limpia
import { crearAlerta, precargaUmbral, alertasDe, textoAlerta, fmtPrecio, tickerCorto } from './alertas-precio.js?v=1';

/* ── el catálogo grande (catalogo-activos.js: 1.469 CEDEARs, acciones, ETFs,
   bonos, letras y cripto; solo símbolo, nombre y en qué mercado cotiza, y en
   los CEDEARs el ratio y el subyacente de la nómina de BYMA) ──
   Pesa 99 KB, así que NO se importa arriba: se pide con import() la primera
   vez que hace falta —al abrir el modal de alta, o cuando una fila sin precio
   necesita saber en qué mercado cotiza su símbolo— y queda cacheado. Nunca
   traba el primer pintado. _cat guarda el módulo ya cargado para que el
   render, que es sincrónico, lo consulte sin esperar; hasta que llega, el
   modal no afirma nada sobre el catálogo. */
let _cat = null, _catProm = null, _catPedido = false;
function catalogo() {
  if (_cat) return Promise.resolve(_cat);
  if (!_catProm) _catProm = import("./catalogo-activos.js?v=2")
    .then(m => { _cat = m; return m; })
    .catch(() => { _catProm = null; return null; });   // una falla no queda cacheada
  return _catProm;
}

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
/* ── "Avisarme si…": la alerta de precio del activo (alertas-precio.js). Mismo
   dibujo que el panel de Ajustar: borde punteado sobre la card, sin crema. El
   segmento sube/baja subraya en dorado (.mc3-seg, como el agrupar de arriba);
   "Crear alerta" es el primario navy de la piel (--v3-btn/--v3-btnTx, que en
   oscuro se invierte solo) y Cancelar el secundario blanco con borde. El umbral
   va en Mono tabular de 140 px; a 375 px el renglón se parte en líneas. ── */
.mc3-b.al{color:var(--v3-sub);border:1px solid var(--v3-line)}
.mc3-b.al:hover,.mc3-b.al[aria-expanded="true"]{color:var(--v3-ink);border-color:var(--v3-gold)}
.mc3-b.al[disabled],.mc3-b.al[disabled]:hover{color:var(--v3-mut);border-color:var(--v3-line);opacity:.55;cursor:default}
.mc3-b.ok{color:var(--v3-btnTx);background:var(--v3-btn);border:1px solid var(--v3-btn);transition:opacity .15s}
.mc3-b.ok:hover{opacity:.86}
.mc3-b.ok[disabled],.mc3-b.ok[disabled]:hover{opacity:.4;cursor:default}
.mc3-b.sec{color:var(--v3-sub);background:var(--v3-card);border:1px solid var(--v3-line)}
.mc3-b.sec:hover{color:var(--v3-ink);border-color:var(--v3-ink)}
.mc3-alp{margin-top:12px;padding:12px 14px;border:1px dashed var(--v3-line);border-radius:8px;background:var(--v3-card);
  font-size:12px;color:var(--v3-sub);line-height:1.6;min-width:0}
.mc3-alp[hidden]{display:none}
.mc3-alp .fila{display:flex;gap:8px 10px;align-items:center;flex-wrap:wrap}
.mc3-alp .fila+.fila{margin-top:10px}
.mc3-alp input{font:500 13px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;text-align:right;width:140px;max-width:100%;
  box-sizing:border-box;padding:7px 9px;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:6px;color:var(--v3-ink);outline:none}
.mc3-alp input:focus{border-color:var(--v3-gold)}
.mc3-alp .u{font-size:11.5px;color:var(--v3-mut)}
.mc3-alp .u:empty{display:none}
.mc3-alp .u b{font:600 11.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-sub)}
.mc3-alp .msg{font-size:12px;line-height:1.5;margin-top:8px}
.mc3-alp .msg:empty{display:none}
.mc3-alp .nota{font-size:11.5px;color:var(--v3-mut);line-height:1.6;margin-top:8px}
.mc3-alp .nota:empty{display:none}
.mc3-alp .nota a{color:var(--v3-gold);text-decoration:none;font-weight:600}
.mc3-alp .nota a:hover{color:var(--v3-gold2)}
/* con varias compras el botón va debajo de "Tus compras": la alerta es del activo, no de una compra */
.mc3-alw{padding:0 18px 20px}
.mc3-alw>.mc3-acc{margin-top:0}
.mc-brk{display:inline-block;font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--v3-ink);
  border:1px solid var(--v3-line);background:var(--v3-card);padding:4px 9px;border-radius:4px;cursor:pointer}
.mc-brk:hover{border-color:var(--v3-gold);color:var(--v3-gold2)}
.mc-brk-in{font:400 12px 'IBM Plex Sans',system-ui,sans-serif;padding:4px 8px;background:var(--v3-card);border:1px solid var(--v3-gold);
  border-radius:4px;color:var(--v3-ink);width:140px;outline:none}
select.mc-brk-in{width:auto;max-width:200px}
/* ── la posición guardada con el sufijo de otro mercado (NVDA-USD): el precio
   no va a llegar nunca; el desplegable lo dice y ofrece pasarla con un clic ── */
.mc3-fix{margin:14px 18px 0;padding:12px 14px;border:1px solid var(--v3-line);border-left:3px solid var(--v3-warn);border-radius:8px;
  background:var(--v3-card);font-size:12.5px;color:var(--v3-sub);line-height:1.6}
.mc3-fix b{color:var(--v3-ink)}
.mc3-fix .mc3-acc{margin-top:8px}
.mc-del{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-dn);background:none;
  border:1px solid var(--v3-line);padding:6px 12px;border-radius:5px;cursor:pointer;white-space:nowrap}
.mc-del:hover{border-color:var(--v3-dn)}

/* ── "Tus compras": un activo comprado varias veces es UNA fila (como en Senta),
   y su desplegable lista cada compra con SUS botones, porque las ventas y los
   ajustes siguen siendo por compra. Cada renglón es flex con salto de línea: a
   375 px la fecha, los números y los botones se acomodan en varias líneas y no
   aparece desplazamiento horizontal. ── */
.mc3-cmps{padding:0 18px 20px}
.mc3-cmp{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 0;border-top:1px solid var(--v3-line2)}
.mc3-cmp-i{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;flex:1 1 260px;min-width:0;font-size:12.5px;color:var(--v3-sub)}
.mc3-cmp-i b{font:600 12.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);white-space:nowrap}
.mc3-cmp-i .n{font:500 12.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);white-space:nowrap}
.mc3-cmp-i .n em{font:400 11.5px 'IBM Plex Sans',sans-serif;font-style:normal;color:var(--v3-warn)}
.mc3-cmp-i .pl{font:600 12.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.mc3-cmp>.mc3-acc{margin-top:0;flex:none}
.mc3-cmp>.mc3-ajp{flex-basis:100%;margin-top:0}
.mc3-cmps-nota{font-size:11.5px;color:var(--v3-mut);line-height:1.6;margin-top:10px}

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
.mc-tabs{display:flex;gap:2px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
.mc-tab{font:500 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:7px 10px;background:none;border:none;
  border-bottom:2px solid transparent;color:var(--v3-mut);cursor:pointer;white-space:nowrap;transition:color .15s}
.mc-tab:hover{color:var(--v3-ink)}
.mc-tab.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}

/* ── el modal de alta (prototipo, "Agregar activo") ──
   Cuelga de <body> y no de la pestaña: los repintados de la tabla (el refresco
   de precios cada 2 min) no pueden borrar lo que el usuario está tipeando.
   El velo es el navy de la piel con transparencia; como el texto sobre el
   dorado claro, es de los pocos literales, porque es el mismo en los dos temas. */
.mc-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(14,24,48,.45);color:var(--v3-ink);font-family:'IBM Plex Sans',system-ui,sans-serif;
  /* la piel del modal: nada de crema. El acento es el navy de la piel (botón
     sólido, foco de los campos) y las cajas fijas van en un gris neutro muy
     tenue. En oscuro el navy no se distingue del fondo: ahí el acento es el
     dorado claro con texto navy, y el gris es un velo blanco, como --v3-track2. */
  --mc-soft:#F7F7F8;--mc-acc:var(--v3-navy);--mc-accTx:#fff}
[data-theme="dark"] .mc-modal{--mc-soft:rgba(255,255,255,.05);--mc-acc:var(--v3-goldL);--mc-accTx:#0E1830}
.mc-modal button,.mc-modal input,.mc-modal select,.mc-modal textarea{font-family:inherit}
.mc-mdl{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:14px;width:100%;max-width:560px;min-width:0;
  max-height:calc(100vh - 40px);display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(14,24,48,.25)}
.mc-mdl-hd{display:flex;align-items:flex-start;gap:12px;padding:22px 24px 0}
/* dentro del modal no hay Playfair: el título va en Plex Sans 600 */
.mc-mdl-hd h3{font:600 20px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:-.01em;color:var(--v3-ink);margin:0;line-height:1.25;flex:1;min-width:0}
.mc-mdl-x{font-size:17px;line-height:1;color:var(--v3-mut);background:none;border:1px solid transparent;border-radius:6px;
  cursor:pointer;padding:5px 9px;flex:none}
.mc-mdl-x:hover{color:var(--v3-ink);border-color:var(--v3-line)}
.mc-mdl .mc-tabs{margin:14px 24px 0}
/* overscroll-behavior: llegar al final del modal no arrastra la página de atrás */
.mc-mdl-bd{padding:16px 24px 6px;overflow-y:auto;overscroll-behavior:contain;flex:1;min-height:0}
.mc-mdl-pie{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;
  padding:14px 24px 20px;border-top:1px solid var(--v3-line)}
.mc-mdl-pie .mc-msg{margin:0;margin-right:auto;flex:1 1 170px;min-width:0;line-height:1.5}
.mc-gr{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:14px}
.mc-mdl label,.mc-mdl .mc-lbl{display:block;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:var(--v3-sub);margin-bottom:6px}
.mc-mdl input,.mc-mdl select{width:100%;box-sizing:border-box;padding:10px 12px;background:var(--v3-card);
  border:1px solid var(--v3-line);border-radius:8px;color:var(--v3-ink);font:400 14px 'IBM Plex Sans',system-ui,sans-serif;outline:none}
.mc-mdl select{font-size:13.5px}
.mc-mdl input:focus,.mc-mdl select:focus{border-color:var(--mc-acc)}
.mc-mdl input#mc-ticker{font:600 14px 'IBM Plex Mono',monospace;text-transform:uppercase}
/* el nombre no se escribe: sale del catálogo (activos.js y catalogo-activos.js) */
.mc-mdl .fijo{box-sizing:border-box;font:500 13.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut);padding:10px 12px;
  border:1px solid var(--v3-line);border-radius:8px;background:var(--mc-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-mdl .fijo.ok{color:var(--v3-ink)}
.mc-sub{font-size:11.5px;color:var(--v3-mut);line-height:1.6;margin-top:8px;min-height:1px}
.mc-sub b{color:var(--v3-sub);font:600 11.5px 'IBM Plex Mono',monospace}
/* la sugerencia del catálogo ("IBIT es un CEDEAR en BYMA y un ETF en EE.UU.") y
   el motivo por el que con ese mercado no se guarda */
.mc-sub .warn{color:var(--v3-warn)}
.mc-sub .bad{color:var(--v3-dn)}
/* el precio de referencia, debajo de "Se guarda como…" (como Senta): último
   precio y cierre anterior con la hora del dato y, en los CEDEARs, el ratio y
   el subyacente. Caja gris tenue como las fijas (nada de crema), Plex Sans con
   cifras tabulares; el botón es el chico de los choques de mercado */
.mc-ref{margin-top:10px;padding:9px 12px;border:1px solid var(--v3-line);border-radius:8px;background:var(--mc-soft);
  font:400 12px/1.6 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-sub);font-variant-numeric:tabular-nums}
.mc-ref[hidden]{display:none}
.mc-ref b{font-weight:600;color:var(--v3-ink)}
.mc-ref small{font-size:11px;color:var(--v3-mut)}
.mc-ref-p{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.mc-ref-p>span{flex:1 1 220px;min-width:0}
.mc-ref-l+.mc-ref-p,.mc-ref-p+.mc-ref-l{margin-top:3px}
.mc-ref .mc-sug-b{padding:4px 10px;flex:none}
/* los botones de un clic del choque de mercado ("Cargarlo en BYMA (NVDA.BA)"):
   secundarios, blancos con borde */
.mc-sug-bs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.mc-sug-b{font:600 11px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);background:var(--v3-card);border:1px solid var(--v3-line);
  border-radius:6px;padding:6px 10px;cursor:pointer;transition:border-color .15s}
.mc-sug-b:hover{border-color:var(--v3-ink)}
/* ── las sugerencias del catálogo debajo del símbolo: lista propia (listbox),
   posicionada absoluta para que al abrirse no empuje los campos de compras ── */
.mc-sug{position:relative}
.mc-sug-l{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:6;margin:0;padding:6px;list-style:none;
  max-height:min(264px,44vh);overflow-y:auto;overscroll-behavior:contain;background:var(--v3-card);border:1px solid var(--v3-line);
  border-radius:8px;box-shadow:0 12px 32px rgba(14,24,48,.14)}
.mc-sug-l[hidden]{display:none}
.mc-sug-l li{padding:7px 10px;border-radius:6px;font-size:12.5px;color:var(--v3-sub);cursor:pointer;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.mc-sug-l li b{font:600 12.5px 'IBM Plex Mono',monospace;color:var(--v3-ink)}
.mc-sug-l li span{color:var(--v3-mut)}
.mc-sug-l li.hl{background:var(--mc-soft)}
/* ── el broker: un <select> con la lista entera y, con «Otro…», un campo corto al lado ── */
.mc-bk{display:flex;gap:8px;min-width:0}
.mc-bk select{flex:1 1 auto;min-width:0}
.mc-bk-otro{flex:0 1 46%;min-width:0}
.mc-bk-otro[hidden]{display:none}
.mc-k2{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-sub);margin:20px 0 8px}
.mc-cmps{display:flex;flex-direction:column;gap:8px}
.mc-cmp-hd,.mc-cmp{display:grid;grid-template-columns:1.15fr .85fr .95fr 28px;gap:8px;align-items:center}
.mc-cmp-hd{font:600 9px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);padding:0 9px 2px}
.mc-cmp{border:1px solid var(--v3-line);border-radius:9px;padding:8px}
.mc-cmp input{padding:8px;border-radius:6px;border-color:var(--v3-line2);font:500 12.5px 'IBM Plex Mono',monospace;
  font-variant-numeric:tabular-nums;min-width:0}
/* cantidad y precio son campos de texto (aceptan coma o punto): la alineación
   va por el data-*, no por el type */
.mc-cmp [data-c-cant],.mc-cmp [data-c-px]{text-align:right}
.mc-cmp-x{background:none;border:none;color:var(--v3-mut);font-size:16px;line-height:1;cursor:pointer;padding:4px;border-radius:5px}
.mc-cmp-x:hover{color:var(--v3-dn)}
.mc-cmp-x[disabled]{opacity:.3;cursor:default}
.mc-mas{font:600 12px 'IBM Plex Sans',sans-serif;color:var(--mc-acc);background:none;border:none;cursor:pointer;padding:9px 0 2px}
.mc-mas:hover{text-decoration:underline}
/* el resumen: caja blanca con línea, sin fondo crema */
.mc-res{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:9px;padding:12px 14px;margin-top:16px;font-size:12.5px;color:var(--v3-sub)}
.mc-res .f{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.mc-res .f+.f{margin-top:7px}
/* el Mono y el nowrap son para los NÚMEROS (los dos renglones de arriba). La
   nota de abajo es prosa: si hereda esto, la frase de la cantidad negativa sale
   en Mono de 14 px y en un solo renglón de 470 px, y el cuerpo del modal se
   desplaza para el costado a 375 px justo cuando hay algo para leer. */
.mc-res .f b{font:600 14px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);white-space:nowrap}
.mc-res .nota{font-size:11.5px;color:var(--v3-mut);line-height:1.6;margin-top:9px}
.mc-res .nota b{font:600 11.5px 'IBM Plex Sans',system-ui,sans-serif;color:inherit;white-space:normal}
.mc-res .nota.bad{color:var(--v3-dn)}
.mc-imp textarea{width:100%;min-height:120px;padding:12px;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:6px;
  color:var(--v3-ink);font:400 12.5px 'IBM Plex Mono',ui-monospace,monospace;outline:none;resize:vertical}
.mc-imp textarea:focus{border-color:var(--mc-acc)}
/* los botones del modal: navy sólido con texto blanco (en oscuro, dorado claro
   con texto navy: ver --mc-acc) y el secundario blanco con borde. Las pestañas
   de arriba subrayan con el mismo acento: nada dorado adentro del modal. */
.mc-modal .mc-btn{background:var(--mc-acc);border-color:var(--mc-acc);color:var(--mc-accTx)}
.mc-modal .mc-btn:hover{background:var(--mc-acc);border-color:var(--mc-acc);color:var(--mc-accTx);opacity:.86}
.mc-modal .mc-btn[disabled],.mc-modal .mc-btn[disabled]:hover{opacity:.4}
.mc-modal .mc-btn.sec,.mc-modal .mc-btn.sec:hover{background:var(--v3-card);color:var(--v3-ink);border-color:var(--v3-line);opacity:1}
.mc-modal .mc-btn.sec:hover{border-color:var(--v3-ink)}
.mc-modal .mc-tab.on{border-bottom-color:var(--mc-acc)}
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
  /* la línea de resumen puede saltar: con las compras juntas el broker dice
     "IOL + Balanz" y en un solo renglón el precio de hoy quedaba cortado ("$90.…") */
  .mc3-row>.c-meta{display:block;grid-area:meta;white-space:normal}
  .mc3-row>.c-val{grid-area:val;text-align:left}
  .mc3-row>.c-pl{grid-area:pl}
  .mc3-row>.c-hoy{grid-area:hoy;text-align:left;font-size:12px}
  .mc3-row>.c-hoy .mc3-hoyk{display:inline}
  .mc3-row>.c-hoy small{display:inline;margin:0 0 0 6px}
  .mc3-row>.c-rot{grid-area:rot;align-self:center}
  .mc3-row>.c-brk,.mc3-row>.c-cnt,.mc3-row>.c-px{display:none}
  .mc3-grp{padding:9px 14px}
  .mc3-fix{margin:12px 14px 0}
  .mc3-mets{padding:14px 14px 0}
  .mc3-cols{padding:14px 14px 18px}
  .mc3-cmps{padding:0 14px 18px}
  .mc3-alw{padding:0 14px 18px}
  .mc-vrow{padding:12px 14px}
}
/* en el celular el modal ocupa toda la pantalla, y la compra pasa a dos
   renglones (fecha arriba, cantidad y precio abajo): a 375 px entra sin
   desplazamiento horizontal */
@media (max-width:640px){
  .mc-modal{padding:0}
  .mc-mdl{max-width:none;height:100%;max-height:none;border:none;border-radius:0}
  .mc-mdl-hd{padding:16px 16px 0}
  .mc-mdl .mc-tabs{margin:12px 16px 0}
  .mc-mdl-bd{padding:14px 16px 6px}
  /* el mensaje ocupa su propio renglón (vacío no mide nada) y los dos botones
     entran juntos abajo, en vez de caer uno por línea */
  .mc-mdl-pie{padding:12px 16px 16px}
  .mc-mdl-pie .mc-msg{flex:1 1 100%;margin-right:0}
  .mc-cmp-hd{display:none}
  .mc-cmp{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 28px;grid-template-areas:"fe fe qu" "ca px qu"}
  .mc-cmp>[data-c-fecha]{grid-area:fe}
  .mc-cmp>[data-c-cant]{grid-area:ca}
  .mc-cmp>[data-c-px]{grid-area:px}
  .mc-cmp>.mc-cmp-x{grid-area:qu}
}
`;

/* ── brokers y mercados ──
   El inversor argentino tiene las tenencias repartidas (IOL, PPI, Binance…):
   cada posición lleva su broker y la tabla se agrupa con subtotales. La lista
   son los brokers, bancos y billeteras que más se usan acá, en ese orden:
   ALyCs, bancos, exchanges y billeteras cripto, brokers del exterior. "Otro"
   va último y en el modal deja el campo libre para escribir cualquier cuenta.
   El mercado define cómo se guarda el ticker: en BYMA "GGAL" es la acción
   local en pesos (GGAL.BA), en el exterior es el ADR en dólares. */
const BROKERS = ["IOL", "PPI", "Balanz", "Bull Market", "Cocos", "Allaria", "Eco Valores", "Adcap", "SBS", "Rava", "Criteria",
                 "Veta", "TSA Bursátil", "Santander", "Galicia", "BBVA", "Macro", "ICBC", "HSBC", "Supervielle",
                 "Binance", "Lemon", "Belo", "Ripio", "Buenbit", "Bybit", "OKX", "Interactive Brokers", "Schwab", "Otro"];
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

/* ── UNA FILA POR ACTIVO (lo que pidió Lauti: "un precio promedio de compra,
   no dos listas de compra, como Senta") ──
   Por detrás NADA cambia: cada compra sigue siendo su propio documento en
   inversores/{email}/cartera y calcular() sigue devolviendo una fila por
   documento, que es lo que suman los totales, el Resumen y los gráficos. Esta
   función junta esas filas SOLO para mostrarlas.
   · Clave: ticker + factor de lámina. Dos compras de GGAL.BA son una fila; un
     precio cada 100 VN y uno por unidad no se promedian, así que no se juntan.
   · Promedio de compra PONDERADO por cantidad, la misma cuenta que hace el
     modal de alta en vivo (una compra sin precio entra con precio 0: suma
     cantidad y no suma plata; la fila lo avisa con una pastilla). Va en la
     moneda de las compras; si quedaron en monedas distintas, se arma con el
     dCompra que ya convirtió calcular() —la cotización que usa el resto de la
     tabla— y la fila queda en la moneda de la vista.
   · valor, costo, "Hoy" y resultado son las sumas de las compras, con el mismo
     criterio que los totales de calcular() (el costo entra solo si la compra
     tiene valor): sumar las filas de acá da lo mismo que sumar las de allá.
   · Con UNA sola compra la fila es exactamente la de siempre: se conserva el
     documento entero, con su id. Con varias, el id es "act:" + clave (+ sufijo,
     para que el mismo activo repartido en dos brokers tenga dos ids).
   · brokers: si las compras están en varios, la fila lo dice ("IOL + PPI" o
     "3 brokers") y nunca los mezcla en silencio.
   Devuelve filas con la misma forma que las de calcular() más compras (las
   filas originales), brokers, sinPrecio (cuántas compras no tienen precio) y
   promFalta (monedas distintas y sin dólar: no hay promedio posible). */
export function agruparPorActivo(filas, total, cur = "ARS", sufijo = "") {
  const m = new Map();
  (filas || []).forEach(f => {
    const px = f.px || {};
    const fac = Number(f.factor) > 0 ? Number(f.factor) : (Number(px.factor) > 0 ? Number(px.factor) : 1);
    const k = String(f.ticker || "").toUpperCase() + "|" + fac;
    if (!m.has(k)) m.set(k, { k, fac, compras: [] });
    m.get(k).compras.push(f);
  });
  const n = v => Number(v) || 0;
  const unicos = arr => [...new Set(arr)];
  return [...m.values()].map(({ k, fac, compras }) => {
    const brokers = unicos(compras.map(c => String(c.broker || "").trim()));
    if (compras.length === 1) return { ...compras[0], compras, brokers };
    const c0 = compras[0];
    const cantidad = compras.reduce((s, c) => s + n(c.cantidad), 0);
    const mismaMon = compras.every(c => c.moneda === c0.moneda);
    const conPrecio = compras.filter(c => n(c.precioCompra) > 0);
    // el promedio ya convertido (la conversión es lineal: es el mismo número
    // que convertir el promedio); null si a alguna compra le faltó el dólar
    const dCompra = conPrecio.some(c => c.dCompra == null) ? null
      : cantidad > 0 ? conPrecio.reduce((s, c) => s + n(c.cantidad) * c.dCompra, 0) / cantidad : 0;
    let precioCompra = 0, promFalta = false;
    if (mismaMon) precioCompra = cantidad > 0 ? conPrecio.reduce((s, c) => s + n(c.cantidad) * n(c.precioCompra), 0) / cantidad : 0;
    else if (dCompra == null) promFalta = conPrecio.length > 0;
    else precioCompra = dCompra;
    const moneda = mismaMon ? c0.moneda : cur;
    const conValor = compras.filter(c => c.dValor != null);
    const dValor = conValor.length ? conValor.reduce((s, c) => s + c.dValor, 0) : null;
    const dCosto = conValor.length ? conValor.reduce((s, c) => s + (c.dCosto ?? 0), 0)
                 : compras.every(c => c.dCosto != null) ? compras.reduce((s, c) => s + c.dCosto, 0) : null;
    const dPl = (dValor != null && dCosto != null) ? dValor - dCosto : null;
    const costo = mismaMon ? compras.reduce((s, c) => s + n(c.costo), 0) : dCosto;
    const valor = mismaMon ? (compras.every(c => c.valor != null) ? compras.reduce((s, c) => s + c.valor, 0) : null) : dValor;
    const plPct = mismaMon ? ((valor != null && costo > 0) ? (valor - costo) / costo * 100 : null)
                           : ((dPl != null && dCosto > 0) ? dPl / dCosto * 100 : null);
    const conHoy = compras.filter(c => c.dHoy != null);
    const dHoy = conHoy.length ? conHoy.reduce((s, c) => s + c.dHoy, 0) : null;
    const conHoyOrig = compras.filter(c => c.hoy != null);
    const hoy = conHoyOrig.length ? conHoyOrig.reduce((s, c) => s + c.hoy, 0) : null;
    // la variación del día es del activo: es la misma en todas sus compras
    const hoyPct = conHoy.length ? conHoy[0].hoyPct : null;
    // la fecha de la primera compra (para "desde el …" del costo total)
    const fechas = compras.map(c => String(c.fecha || "").slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const nombres = brokers.map(b => b || "sin broker");
    return {
      id: "act:" + k + sufijo, ticker: c0.ticker, compras, brokers,
      broker: brokers.length === 1 ? brokers[0] : brokers.length === 2 ? nombres.join(" + ") : `${brokers.length} brokers`,
      brokerTitulo: nombres.join(" · "),
      cantidad, precioCompra, moneda, factor: fac, fecha: fechas[0] || "",
      px: c0.px, actual: c0.actual, dActual: c0.dActual,
      costo, valor, dCompra, dCosto, dValor, dPl, plPct, hoyPct, hoy, dHoy,
      peso: total > 0 && dValor != null ? dValor / total * 100 : null,
      sinPrecio: compras.length - conPrecio.length, promFalta,
    };
  });
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
// el precio de una alerta, en SU moneda (nunca convertida): money() del archivo,
// salvo por debajo de 1 (cripto chica), donde money redondea a dos decimales y
// "US$0,01" no dice nada; ahí va el formato de alertas-precio.js (cuatro cifras)
const precioAlerta = (n, m) => _ocultar ? OCULTO : (Math.abs(Number(n)) < 1 ? fmtPrecio(n, m) : money(n, m));

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

function analisis(r, cur, bonos, extra, activos) {
  const con = r.filas.filter(f => f.dValor != null && f.dValor > 0);
  // la concentración y la cuenta de posiciones van por ACTIVO (dos compras de
  // KO son una posición, como en la tabla); las barras de abajo suman las
  // compras, que da lo mismo (y "Por broker" necesita cada compra en su broker)
  const porActivo = (activos || con).filter(f => f.dValor != null && f.dValor > 0);
  if (porActivo.length < 2) return "";
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

  // concentración: cuánto pesan los activos más grandes
  const pesos = porActivo.map(f => f.dValor / total * 100).sort((a, b) => b - a);
  const topN = n => pesos.slice(0, n).reduce((s, x) => s + x, 0);
  const mayor = porActivo.slice().sort((a, b) => b.dValor - a.dValor)[0];
  // el aviso de concentración vive ahora en la card "Peso de cada posición" (arriba
  // de la tabla): repetirlo acá, con otro umbral, decía lo mismo dos veces

  return `<div class="mc-an">
    <h4>Análisis de tu cartera</h4>
    <div class="sub">Cómo está repartido lo que tenés, sumando todos tus brokers. Calculado sobre
      ${porActivo.length} de ${(activos || r.filas).length} posiciones (las que ya tienen precio).</div>
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
        <div class="nota">${porActivo.length} posiciones con precio. La mayor es <b>${esc(base(mayor.ticker))}</b>.</div>
      </div>
      ${extra || ""}
    </div>
  </div>`;
}

/* Renta fija: qué rinde cada especie y qué vas a cobrar en los próximos meses */
function analisisRentaFija(r, bonos, panel, flujos, hoy) {
  // una especie por renglón: las compras del mismo bono se suman (los nominales
  // son el total, y un cupón no se lista dos veces)
  const porEsp = new Map();
  r.filas.filter(f => esRentaFija(f.ticker, bonos)).forEach(f => {
    const k = String(f.ticker || "").toUpperCase();
    if (!porEsp.has(k)) porEsp.set(k, { ticker: f.ticker, cantidad: 0 });
    porEsp.get(k).cantidad += Number(f.cantidad) || 0;
  });
  const rf = [...porEsp.values()];
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
  if (typeof document === "undefined") return;
  if (document.getElementById("v3-css-micartera")) return;
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
/* un número para precargar en un campo de texto que después lee parseNum: con
   coma decimal y sin puntos de miles, así "1,234" es uno coma dos tres cuatro
   y nunca mil doscientos (parseNum toma "1.234" como miles) */
const numIn = n => (n == null || n === "" || !isFinite(Number(n))) ? ""
  : Number(n).toLocaleString("es-AR", { maximumFractionDigits: 8, useGrouping: false });

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
        <div><label>Cantidad vendida · de ${cantTxt(n)}</label><input data-aj-cant type="text" inputmode="decimal" autocomplete="off" value="${numIn(n)}"${moneda ? "" : " disabled"}></div>
        <div><label>Precio de venta · ${monNombre(moneda)}, ${unidad}</label>
          <input data-aj-px type="text" inputmode="decimal" autocomplete="off" placeholder="el que te pagaron"${moneda ? "" : " disabled"}></div>
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
// "Avisarme si…": el mini-panel de la alerta de precio. Es por ACTIVO (ticker,
// no id de compra) y sobrevive al repintado de los dos minutos como _ajAbierto:
// lo elegido (sube/baja) y lo escrito se vuelven a poner al redibujar
let _alAbierta = null;    // ticker (en mayúsculas) con el panel abierto
let _alCond = "sube";     // sube | baja elegido en ese panel
let _alTexto = null;      // el umbral tal cual lo escribió el usuario; null = el precargado
let _alSabidas = { email: null, por: {} };   // ticker → alertas ya leídas ("Tenés N alertas…")
let _alCreando = null;    // ticker cuya alerta se está grabando (frena el doble clic, aun con un repintado en el medio)
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
  // con varias compras el promedio es ponderado por cantidad (agruparPorActivo)
  const nc = (f.compras || []).length > 1 ? `${f.compras.length} compras` : "";
  if (conCosto) {
    const orig = money(Number(f.precioCompra), f.moneda);
    out.push(f.dCompra != null
      ? ["Precio promedio", money(f.dCompra, cur), [otra ? orig : "", fac !== 1 ? "cada 100 VN" : "", nc].filter(Boolean).join(" · ")]
      : ["Precio promedio", orig, ["sin dólar para convertir", nc].filter(Boolean).join(" · ")]);
    if (f.dCosto != null) out.push(["Costo total", money(f.dCosto, cur), f.fecha && fmtFecha(f.fecha) !== "—" ? "desde el " + fmtFecha(f.fecha) : ""]);
  } else out.push(["Precio promedio", "—", f.promFalta ? "sin dólar para el promedio" : "sin cargar", "var(--v3-mut)"]);
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

/* los botones de una compra (un documento): Vendí, y Ajustar con el broker y
   Quitar. Son los MISMOS botones y los mismos data-* que tenía la fila cuando
   cada compra era una fila: engancharDetalle() los encuentra igual, y cada uno
   lleva el id del documento, así la venta, el broker y la baja siguen siendo
   por compra. `sola`: la posición tiene una única compra y se ve como siempre. */
function accionesHTML(id, brk, aj, sola) {
  return `<div class="mc3-acc">
      <button type="button" class="mc3-b vend" data-vender="${id}" title="Registrar una venta de esta ${sola ? "posición" : "compra"}">Vendí</button>
      <button type="button" class="mc3-b aj" data-ajustar="${sola ? "" : id}" aria-expanded="${aj}">Ajustar</button>
    </div>
    <div class="mc3-ajp" data-ajp${aj ? "" : " hidden"}>
      <div class="fila">Broker: <span class="mc-brk" data-brk="${id}" title="Cambiar broker">${esc(brk || "sin broker")}</span>
        <span class="mc-mut">tocalo para cambiarlo</span></div>
      <div class="fila"><button type="button" class="mc-del" data-del="${id}" title="Quitar (si la cargaste por error)">${sola ? "Quitar de mi cartera" : "Quitar esta compra"}</button>
        <span class="mc-mut">si la cargaste por error. Si la vendiste, usá «Vendí» para que quede el resultado.</span></div>
    </div>`;
}

/* "Tus compras": con varias compras del mismo activo, el desplegable las lista
   una por una —fecha, broker, cantidad, precio y resultado propio— cada una
   con sus botones. Cada compra es su documento: nada se junta por detrás. */
function comprasHTML(f, cur, bonos) {
  const compras = f.compras || [];
  if (compras.length < 2) return "";
  const rf = esRentaFija(f.ticker, bonos);
  const orden = [...compras].sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || ""))
                                          || String(a.creado || "").localeCompare(String(b.creado || "")));
  const uno = c => {
    const id = esc(c.id), aj = _ajAbierto === c.id;
    const brk = String(c.broker || "").trim();
    const px = c.px || {};
    const fac = Number(c.factor) > 0 ? Number(c.factor) : (Number(px.factor) > 0 ? Number(px.factor) : 1);
    const precio = Number(c.precioCompra) > 0
      ? (c.dCompra != null ? money(c.dCompra, cur) : money(Number(c.precioCompra), c.moneda)) : "";
    // sin precio de compra no hay resultado propio que mostrar (sería todo el
    // valor, como ya evita el gráfico); la fila lo avisa con su pastilla
    const pl = (c.dPl == null || !precio) ? (c.dValor != null ? `<span class="mc-mut" title="Sin precio de compra no se puede calcular el resultado de esta compra">resultado —</span>` : "")
      : `<span class="pl ${c.dPl >= 0 ? "mc-pos" : "mc-neg"}" title="Resultado de esta compra sola">${moneyS(c.dPl, cur)}${c.plPct != null ? ` (${pct1(c.plPct)})` : ""}</span>`;
    return `<div class="mc3-cmp" data-compra="${id}">
      <div class="mc3-cmp-i">
        <b>${fmtFecha(c.fecha) !== "—" ? fmtFecha(c.fecha) : "sin fecha"}</b>
        <span>${esc(brk || "sin broker")}</span>
        <span class="n" data-cantde="${id}">${cantFmt(c.cantidad)}${rf ? " VN" : ""}</span>
        <span class="n">${precio ? "a " + precio + (fac !== 1 ? " / 100 VN" : "") : "<em>sin precio de compra</em>"}</span>
        ${c.dValor != null ? `<span class="n">= ${money(c.dValor, cur)}</span>` : ""}
        ${pl}
      </div>
      ${accionesHTML(id, brk, aj, false)}
    </div>`;
  };
  return `<div class="mc3-cmps"><div class="mc3-ck">Tus compras · ${compras.length}</div>
    ${orden.map(uno).join("")}
    <div class="mc3-cmps-nota">La fila de arriba junta estas compras: cantidad total y precio promedio ponderado.
      Las ventas y los ajustes van por compra: «Vendí» registra la venta contra el precio de esa compra.</div>
  </div>`;
}

/* ── "Avisarme si…": una alerta de precio por ACTIVO (alertas-precio.js), desde su
   desplegable. El umbral va en la moneda y la unidad en que COTIZA el activo
   —px.precio y px.moneda, nunca el valor convertido de la vista; cada 100 VN en
   la renta fija— porque es contra eso que compara el panel en cada repintado (y
   el pipeline, cuando exista). Sin precio, con sinDatos o en otra moneda, el
   botón queda apagado y el title dice por qué. ── */
const TXT_SIN_PRECIO_ALERTA = "Todavía no tenemos el precio de este activo: cuando llegue vas a poder ponerle una alerta.";
/* lo que hace HOY la alerta, sin prometer de más: la compara el panel con los
   precios que lee Mi cartera (al abrir el panel y cada dos minutos mientras estás
   acá; el sync los actualiza cada 15 minutos en rueda). El pipeline que la revisa
   con el panel cerrado y manda el mail todavía no existe */
const NOTA_ALERTA = "Te avisamos acá, en el panel: cuando el precio cruce ese valor, la alerta salta y queda en Alertas. "
  + "Por ahora se revisa cuando abrís el panel y mientras estás en Mi cartera (los precios se actualizan cada 15 minutos en rueda). "
  + "El aviso por mail todavía no sale.";

/* ¿es un CEDEAR? Con el panel, su criterio único (ctx.tipoActivo, tipos-activo.js);
   sin él, lo mismo que hace ese módulo con un .BA: acción argentina por el sector
   de la ficha, CEDEAR si tiene ficha de EE.UU. o si el catálogo lo dice */
function esCedearAlerta(tk, bonos, panel) {
  const cat = _cat ? s => _cat.buscarCatalogo(s, "byma") : null;
  const ctx = typeof window !== "undefined" ? window.__valtiaCtx : null;
  if (ctx && typeof ctx.tipoActivo === "function") {
    try { return (ctx.tipoActivo(tk, { bonos, panel, catalogo: cat }) || {}).k === "cedear"; } catch (e) {}
  }
  if (sectorDe(tk, bonos) === "Argentina") return false;
  if (tickerFicha(tk)) return true;
  const e = cat ? cat(tk) : null;
  return !!e && (e.t === "cedear" || e.t === "accion_us");
}

/* lo que el panel necesita saber de una fila para ofrecerle una alerta. Pura y
   exportada para probarla: { puede, motivo, ticker, precio, moneda, factor,
   unidad, precarga: { sube, baja }, notas } */
export function datosAlerta(f, opts = {}) {
  const px = (f && f.px) || {};
  const ticker = String((f && f.ticker) || "");
  const tk = ticker.toUpperCase();
  const precio = Number(px.precio), moneda = px.moneda;
  const puede = !!tk && !px.sinDatos && Number.isFinite(precio) && precio > 0 && (moneda === "ARS" || moneda === "USD");
  if (!puede) return { puede: false, motivo: TXT_SIN_PRECIO_ALERTA, ticker, precio: null, moneda: null, factor: 1, unidad: "", precarga: { sube: null, baja: null }, notas: [] };
  const bonos = opts.bonos || new Set();
  const rf = esRentaFija(tk, bonos);
  // el mismo criterio que calcular() y monedaFactor() (ventas.js): la posición,
  // el doc de precios y, si ninguno lo dice, la renta fija cotiza cada 100 VN
  const factor = Number(f.factor) > 0 ? Number(f.factor) : (Number(px.factor) > 0 ? Number(px.factor) : (rf ? 0.01 : 1));
  const unidad = `${monNombre(moneda)}, ${factor !== 1 ? "cada 100 VN" : "por unidad"}`;
  const notas = [];
  if (rf) notas.push("Ojo: el día que un bono paga cupón o amortiza, el precio baja; una alerta de baja puede saltar por eso.");
  else if (mercadoDe(tk, bonos) === "cripto") notas.push("Las cripto cotizan todo el día, pero acá el precio se actualiza en horario de rueda: la alerta puede saltar con demora.");
  else if (tk.endsWith(".BA") && moneda === "ARS" && esCedearAlerta(tk, bonos, opts.panel || _panel)) notas.push("Es el precio en pesos: adentro está también lo que se mueva el dólar.");
  return { puede: true, motivo: "", ticker, precio, moneda, factor, unidad,
           precarga: { sube: precargaUmbral(precio, "sube"), baja: precargaUmbral(precio, "baja") }, notas };
}

/* "Tenés 2 alertas activas para este activo (Sube de $4.735 · Baja de $4.000) · Verlas":
   solo con lo que ya se leyó (_alSabidas); pedirAlertasDe() lo completa */
function lineaAlertasDe(tk) {
  // lo leído es de UNA cuenta: si cambió el mail, no se muestra lo del anterior
  if (!_user || _alSabidas.email !== _user.email) return "";
  const l = _alSabidas.por[tk];
  if (!Array.isArray(l) || !l.length) return "";
  const act = l.filter(a => a.activa !== false && a.disparada == null);
  const salt = l.filter(a => a.disparada != null);
  const paus = l.length - act.length - salt.length;
  const ver = `<a href="#panel/alertas" data-go="alertas">Verlas</a>`;
  if (!act.length && paus <= 0) return `Ya ${salt.length === 1 ? "saltó una alerta" : `saltaron ${salt.length} alertas`} de este activo · ${ver}`;
  const partes = [];
  if (act.length) partes.push(`${act.length} ${act.length === 1 ? "alerta activa" : "alertas activas"}`);
  if (paus > 0) partes.push(`${paus} ${paus === 1 ? "pausada" : "pausadas"}`);
  if (salt.length) partes.push(`${salt.length} que ya ${salt.length === 1 ? "saltó" : "saltaron"}`);
  const det = act.map(a => textoAlerta(a, precioAlerta)).join(" · ");
  return `Tenés ${partes.join(", ")} para este activo${det ? ` (${esc(det)})` : ""} · ${ver}`;
}

/* el botón "Avisarme si…" y su mini-panel (cerrado salvo que _alAbierta sea este
   ticker). Con una sola compra va en la columna de acciones, debajo de Vendí y
   Ajustar; con varias, debajo de "Tus compras" (detalleHTML) */
function alertaHTML(f, opts) {
  const d = datosAlerta(f, opts);
  const tk = String(f.ticker || "").toUpperCase();
  const btn = on => `<button type="button" class="mc3-b al" data-alerta="${esc(tk)}" aria-expanded="${on}"${d.puede ? "" : ` disabled title="${esc(d.motivo)}"`}>Avisarme si…</button>`;
  if (!d.puede) return `<div class="mc3-acc">${btn(false)}</div>`;
  const abierto = _alAbierta === tk;
  const cond = abierto && _alCond === "baja" ? "baja" : "sube";
  const pre = d.precarga[cond];
  const val = abierto && _alTexto != null ? _alTexto : numIn(pre);
  // "(≈ US$4,13 al CCL de hoy)" de lo escrito, si la vista está en otra moneda
  const vAprox = abierto && _alTexto != null ? parseNum(_alTexto) : pre;
  const seg = c => `<button type="button" data-al-cond="${c}" class="${cond === c ? "on" : ""}" aria-pressed="${cond === c}">${c === "baja" ? "Baja de" : "Sube de"}</button>`;
  return `<div class="mc3-acc">${btn(abierto)}</div>
    <div class="mc3-alp" data-alp data-ticker="${esc(f.ticker)}" data-precio="${d.precio}" data-moneda="${d.moneda}"${d.factor !== 1 ? ' data-vn="1"' : ""}${abierto ? "" : " hidden"}>
      <div class="fila">
        <span class="mc3-seg" role="group" aria-label="Cuándo avisar">${seg("sube")}${seg("baja")}</span>
        <input type="text" inputmode="decimal" autocomplete="off" data-al-umbral value="${esc(val)}" aria-label="Precio del aviso, ${esc(d.unidad)}">
        <span class="u" data-al-aprox>${aprox(Number.isFinite(vAprox) && vAprox > 0 ? vAprox : null, d.moneda)}</span>
        <span class="u">${esc(d.unidad)} · hoy <b>${precioAlerta(d.precio, d.moneda)}</b></span>
      </div>
      <div class="fila">
        <button type="button" class="mc3-b ok" data-al-ok${_alCreando === tk ? " disabled" : ""}>${_alCreando === tk ? "Creando…" : "Crear alerta"}</button>
        <button type="button" class="mc3-b sec" data-al-no>Cancelar</button>
      </div>
      <div class="msg" data-al-msg></div>
      <div class="nota">${esc(NOTA_ALERTA)}</div>
      ${d.notas.map(t => `<div class="nota">${esc(t)}</div>`).join("")}
      <div class="nota" data-al-ya>${lineaAlertasDe(tk)}</div>
    </div>`;
}

/* ── lo que hace el mini-panel (instalarDelegado lo engancha una vez por
   contenedor, así sobrevive a los repintados, como Ajustar) ── */
const tkAl = s => String(s || "").trim().toUpperCase();
// el panel de ese ticker que está en pantalla AHORA (un repintado pudo rehacerlo)
const panelAlerta = tk => (_el ? [..._el.querySelectorAll("[data-alp]")].find(x => tkAl(x.dataset.ticker) === tk) : null) || null;
// el panel vuelve a como arranca: cerrado, "Sube de" y el precio precargado
function olvidarAlerta() { _alAbierta = null; _alCond = "sube"; _alTexto = null; }

function ponerAprox(p, v) {
  const a = p.querySelector("[data-al-aprox]");
  if (a) a.innerHTML = aprox(Number.isFinite(v) && v > 0 ? v : null, p.dataset.moneda);
}
function msgAlerta(p, html) {
  const m = p && p.querySelector("[data-al-msg]");
  if (m) m.innerHTML = html || "";
}
/* sube/baja: marca el segmento y vuelve a precargar el umbral (5 % arriba o abajo
   del precio de hoy, en su moneda y su unidad) */
function ponerCondicion(p, cond) {
  p.querySelectorAll("[data-al-cond]").forEach(b => {
    const on = b.dataset.alCond === cond;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const pre = precargaUmbral(Number(p.dataset.precio), cond);
  const inp = p.querySelector("[data-al-umbral]");
  if (inp) inp.value = numIn(pre);
  ponerAprox(p, pre);
}
function cerrarAlerta(p, foco = false) {
  olvidarAlerta();
  if (!p) return;
  p.hidden = true;
  ponerCondicion(p, "sube");
  msgAlerta(p, "");
  const det = p.closest(".mc3-det");
  const btn = det && det.querySelector("[data-alerta]");
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
    if (foco) try { btn.focus(); } catch (e) {}
  }
}
/* "Avisarme si…": abre o cierra el panel de SU fila sin repintar la tabla */
function alternarAlerta(btn) {
  if (!btn || btn.disabled) return;
  const det = btn.closest(".mc3-det");
  const p = det && det.querySelector("[data-alp]");
  if (!p) return;
  if (!p.hidden) { cerrarAlerta(p); return; }
  olvidarAlerta();
  _alAbierta = tkAl(btn.dataset.alerta);
  ponerCondicion(p, "sube");
  p.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  const inp = p.querySelector("[data-al-umbral]");
  if (inp) try { inp.focus(); inp.select(); } catch (e) {}
  pedirAlertasDe(_alAbierta);
}

/* las alertas que ya tiene este activo (alertasDe: la caché de 60 s de
   alertas-precio.js), para el renglón "Tenés N alertas…". Si falla la lectura
   no se dice nada: el renglón queda vacío y la alerta se puede crear igual */
function pedirAlertasDe(ticker) {
  const email = _user && _user.email, tk = tkAl(ticker);
  if (!email || !tk) return;
  alertasDe(email, tk).then(l => {
    if (!_user || _user.email !== email) return;   // cambió la cuenta mientras tanto
    if (_alSabidas.email !== email) _alSabidas = { email, por: {} };
    _alSabidas.por[tk] = l;
    const p = panelAlerta(tk), ya = p && p.querySelector("[data-al-ya]");
    if (ya) ya.innerHTML = lineaAlertasDe(tk);
  }).catch(() => {});
}

/* el error de crearAlerta() en palabras del usuario. Pura y exportada para probarla.
   · Los de validarAlerta()/crearAlerta() ya vienen en voseo (duplicado, ticker,
     condición, umbral, moneda, sin sesión): pasan tal cual, y SOLO esos.
   · Permiso: alertas-precio.js lo reescribe como "Firestore no dejó…"; la regla ya
     está publicada y pide lo mismo que la cartera (dueño con mail verificado), así
     que no se le echa la culpa a una regla que falta: se pide recargar.
   · Todo lo demás (red, Firestore con code, un TypeError en inglés): el genérico */
const ALERTA_EN_VOSEO = /^(Entrá a tu cuenta|Falta el ticker|Ese ticker no sirve|Elegí si te avisamos|Poné un precio|La alerta necesita la moneda|Ya tenés esa misma alerta)/;
export function motivoAlerta(e) {
  const t = String((e && e.message) || e || "");
  if ((e && e.code === "permission-denied") || /^Firestore no dejó|permission[-_ ]denied|insufficient permissions/i.test(t))
    return "No pudimos guardar la alerta: el servidor la rechazó. Recargá la página y probá de nuevo.";
  if (!(e && e.code) && ALERTA_EN_VOSEO.test(t)) return t;
  return "No se pudo crear la alerta: probá de nuevo en un momento.";
}

/* "Crear alerta": valida, graba con crearAlerta() y cierra el panel. El umbral va
   tal cual en la moneda y la unidad en que cotiza el activo (data-precio y
   data-moneda salen de px.precio y px.moneda, nunca de la vista convertida) */
async function crearAlertaDesde(p) {
  if (!p) return;
  const tk = tkAl(p.dataset.ticker);
  const ticker = String(p.dataset.ticker || "");   // TAL CUAL está en la cartera
  const moneda = p.dataset.moneda, precio = Number(p.dataset.precio);
  const rojo = t => `<span style="color:var(--v3-dn)">${esc(t)}</span>`;
  // un repintado (el refresco de precios) puede rehacer el panel mientras se graba:
  // los mensajes van al que está en pantalla
  const vivo = () => (p.isConnected ? p : panelAlerta(tk));
  const decir = t => msgAlerta(vivo(), rojo(t));
  if (!tk || _alCreando) return;   // un segundo clic mientras graba
  const onB = p.querySelector("[data-al-cond].on");
  const condicion = onB && onB.dataset.alCond === "baja" ? "baja" : "sube";
  const inp = p.querySelector("[data-al-umbral]");
  const umbral = parseNum(inp ? inp.value : "");
  const alCampo = () => { if (inp) try { inp.focus(); inp.select(); } catch (e) {} };
  if (!Number.isFinite(umbral) || umbral <= 0) { decir("Poné un precio mayor a cero para el aviso."); alCampo(); return; }
  // del lado equivocado del precio de hoy la alerta saltaría en el próximo refresco
  if (Number.isFinite(precio) && precio > 0 && (condicion === "sube" ? umbral <= precio : umbral >= precio)) {
    decir(`Hoy está en ${precioAlerta(precio, moneda)}: con «${condicion === "sube" ? "Sube de" : "Baja de"}» ese precio la alerta saltaría enseguida. `
      + (condicion === "sube" ? "Poné uno más alto o elegí «Baja de»." : "Poné uno más bajo o elegí «Sube de»."));
    alCampo(); return;
  }
  if (moneda !== "ARS" && moneda !== "USD") { decir(TXT_SIN_PRECIO_ALERTA); return; }
  // el mail se fija ANTES del await, como en guardarCompras: si en el medio se
  // cambia de cuenta, la alerta queda en la cuenta de quien la pidió y la
  // pantalla (que ya es de otro) no se toca
  const email = _user && _user.email;
  if (!email) { decir("Se cerró la sesión: volvé a entrar para crear la alerta."); return; }
  _alCreando = tk;
  const btn = p.querySelector("[data-al-ok]");
  if (btn) { btn.disabled = true; btn.textContent = "Creando…"; }
  msgAlerta(p, "");
  let error = null;
  try { await crearAlerta(email, { ticker, condicion, umbral, moneda }); }
  catch (e) { error = e; }
  finally {
    // solo si sigue siendo la suya: un cambio de cuenta en el medio ya lo limpió
    if (_alCreando === tk) _alCreando = null;
    const b = (vivo() || p).querySelector("[data-al-ok]");
    if (b) { b.disabled = false; b.textContent = "Crear alerta"; }
  }
  if (!_user || _user.email !== email) return;
  // mientras se grababa el panel pudo cerrarse (Cancelar, Escape) o cerrarse la
  // fila: entonces lo que haya que decir va al renglón de arriba, no a un panel
  // escondido, y no se toca el estado de otro panel que el usuario haya abierto
  const q = vivo(), visible = !!q && !q.hidden && _alAbierta === tk;
  if (error) {
    const t = motivoAlerta(error);
    if (visible) decir(t); else avisoAlerta(t, false);
    return;
  }
  if (visible) {
    // el foco vuelve a "Avisarme si…" solo si estaba en el panel (o se perdió al
    // apagarse "Crear alerta"): si el usuario ya escribe en otro lado, no se lo saca
    const a = document.activeElement;
    cerrarAlerta(q, !a || a === document.body || q.contains(a));
  }
  avisoAlerta(`Listo: te avisamos si ${tickerCorto(ticker)} ${condicion} de ${precioAlerta(umbral, moneda)}${p.dataset.vn ? " cada 100 VN" : ""}.`, true);
  const ctx = typeof window !== "undefined" ? window.__valtiaCtx : null;
  // la pestaña Alertas y la pastilla del lateral
  if (ctx && typeof ctx.refrescar === "function") { try { ctx.refrescar("alertas"); } catch (e) {} }
  pedirAlertasDe(tk);
}

/* el resultado de una alerta en el renglón de mensajes (#mc-msg, arriba de todo).
   Si no se ve desde donde está el usuario, el mismo texto va también en el aviso
   flotante del panel (ctx.toast) */
function avisoAlerta(txt, ok) {
  const m = _el && _el.querySelector("#mc-msg");
  if (m) m.innerHTML = `<span style="color:var(${ok ? "--v3-up" : "--v3-dn"})">${esc(txt)}</span>`;
  const ctx = typeof window !== "undefined" ? window.__valtiaCtx : null;
  try {
    const r = m && m.getBoundingClientRect();
    if (ctx && typeof ctx.toast === "function" && (!r || r.bottom < 0 || r.top > (window.innerHeight || 0))) ctx.toast(txt);
  } catch (e) {}
}

function detalleHTML(f, opts, cur) {
  const ctxOk = typeof window !== "undefined" && !!window.__valtiaCtx;
  const c = ctxOk ? _detCache[f.id] : null;
  const esperando = t => `<div class="mc3-ck">${t}</div><div class="mc3-txt" style="margin-top:8px">Buscando…</div>`;
  const id = esc(f.id);
  // con una sola compra los botones van donde siempre (tercera columna); con
  // varias, cada compra lleva los suyos en "Tus compras", más abajo
  const sola = (f.compras || []).length < 2;
  const aj = sola && _ajAbierto === f.id;
  const brk = String(f.broker || "").trim();
  const bonos = opts.bonos || new Set();
  const link = linkDe(f.ticker, bonos);
  // el ticker lleva el sufijo de un mercado en el que el símbolo no cotiza
  // (NVDA-USD): un botón por mercado posible pasa TODAS sus compras
  const rota = filaRota(f, bonos);
  const fix = rota ? `<div class="mc3-fix" data-fix="${esc(f.ticker)}">
      <b>${esc(f.ticker)} no existe:</b> ${esc(punto(`${rota.s} es ${rota.esTxt}`))} Pasala al mercado que corresponde y el precio llega en la próxima actualización, en unos 15 minutos.
      <div class="mc3-acc">${rota.opciones.map(o => `<button type="button" class="mc3-b aj" data-pasar="${esc(f.ticker)}" data-mercado="${o.mercado}">${esc(o.txt)}</button>`).join("")}</div>
    </div>` : "";
  return `<div class="mc3-det" data-det="${id}">${fix}
    <div class="mc3-mets" data-mets>${metricas(f, opts, cur).map(m => metHTML(m)).join("")}${c && c.pe ? c.pe : ""}</div>
    <div class="mc3-cols">
      ${ctxOk ? `<div class="mc3-col" data-dl>${c ? c.lect : esperando("Lectura Valtia")}</div>
      <div class="mc3-col" data-dn>${c ? c.not : esperando("Últimas noticias")}</div>` : ""}
      <div class="mc3-col">
        ${ctxOk ? `<div data-de>${c ? c.ev : esperando("Próximo evento")}</div>` : (link ? `<a class="mc3-lk" href="${link}" style="margin-top:0">Ver la ficha →</a>` : "")}
        ${sola ? accionesHTML(id, brk, aj, true) + alertaHTML(f, opts) : ""}
      </div>
    </div>
    ${sola ? "" : comprasHTML(f, cur, bonos) + `<div class="mc3-alw">${alertaHTML(f, opts)}</div>`}
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
  if (_abierta !== id) { _ajAbierto = null; olvidarAlerta(); }
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
    // "Avisarme si…": abrir o cerrar su panel, sube/baja, crear y cancelar
    const al = t.closest("[data-alerta]");
    if (al) { ev.preventDefault(); alternarAlerta(al); return; }
    const alCond = t.closest("[data-al-cond]");
    if (alCond) {
      ev.preventDefault();
      const p = alCond.closest("[data-alp]");
      if (!p) return;
      _alCond = alCond.dataset.alCond === "baja" ? "baja" : "sube";
      _alTexto = null;
      ponerCondicion(p, _alCond);
      msgAlerta(p, "");
      return;
    }
    const alOk = t.closest("[data-al-ok]");
    if (alOk) { ev.preventDefault(); crearAlertaDesde(alOk.closest("[data-alp]")); return; }
    const alNo = t.closest("[data-al-no]");
    if (alNo) { ev.preventDefault(); cerrarAlerta(alNo.closest("[data-alp]"), true); return; }
    const aj = t.closest("[data-ajustar]");
    if (aj) {
      ev.preventDefault();
      // el panel que abre es el de SU compra (en "Tus compras") o, con una sola
      // compra, el de la posición; lo que se recuerda es el id del documento
      const det = aj.closest(".mc3-det"), caja = aj.closest("[data-compra]") || det;
      const p = caja && caja.querySelector("[data-ajp]");
      if (!p) return;
      p.hidden = !p.hidden;
      aj.setAttribute("aria-expanded", String(!p.hidden));
      _ajAbierto = p.hidden ? null : (caja.dataset.compra || det.dataset.det);
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
  // el umbral de la alerta: lo escrito se recuerda (_alTexto) para el repintado y
  // el "≈ … al CCL de hoy" sigue al número. Enter crea; Escape cierra el panel
  el.addEventListener("input", ev => {
    const t = ev.target;
    if (!t || !t.matches || !t.matches("[data-al-umbral]")) return;
    _alTexto = t.value;
    const p = t.closest("[data-alp]");
    if (p) { ponerAprox(p, parseNum(t.value)); msgAlerta(p, ""); }
  });
  el.addEventListener("keydown", ev => {
    const t = ev.target;
    if (!t || !t.closest || (ev.key !== "Enter" && ev.key !== "Escape")) return;
    const p = t.closest("[data-alp]");
    if (!p) return;
    if (ev.key === "Escape") { ev.preventDefault(); cerrarAlerta(p, true); }
    else if (t.matches("[data-al-umbral]")) { ev.preventDefault(); crearAlertaDesde(p); }
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
  // la fila que estaba abierta, ANTES de rehacer la vista: si el agrupado le
  // cambia el id a su activo (act:CLAVE ↔ act:CLAVE@broker) o se quitó una de
  // sus compras, se la vuelve a encontrar por sus compras y sigue abierta
  const abiertaAntes = (_abierta && _vista && _vista.el === el && _vista.porId) ? _vista.porId[_abierta] : null;
  // lo último que se dibujó: lo usan el desplegable, el orden, el agrupado y
  // __mcAbrirFila sin volver a pedir nada. Las filas y porId se completan más
  // abajo, cuando están armadas por activo; deCompra: id de documento → id de
  // la fila (del activo) que lo muestra
  _vista = { el, posiciones, precios, opts, cur, filas: [], porId: {}, deCompra: {} };
  // Panel v3: el título, la fecha, la frescura de los precios, el selector de
  // moneda y de dónde sale el dólar van en el encabezado único del panel
  const cabecera = "";

  // el alta vive en un modal (abrirModal), afuera de acá: lo único que queda en
  // la pestaña es el renglón donde se escriben sus mensajes
  const form = `<div class="mc-msg" id="mc-msg"></div>`;

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
        <p>Tus ventas y su resultado están más abajo. Si compraste algo nuevo, cargalo acá.</p>
        <button type="button" class="mc-btn" data-mc-abrir style="margin-top:16px">+ Agregar posición</button></div>` : `<div class="mc-empty">
        <h4>Todavía no cargaste posiciones</h4>
        <p>Agregá lo que tenés —acciones, CEDEARs o cripto— con la cantidad y el precio al que compraste.
           Al día siguiente vas a ver el valor actualizado, tu resultado y la lectura de Valtia sobre cada activo.</p>
        <button type="button" class="mc-btn" data-mc-abrir style="margin-top:16px">+ Agregar posición</button>
      </div>`}${seccionVentas(opts.ventas || [], cur)}</div>`;
    reponerEscrito(el, escrito);
    _abierta = null; _ajAbierto = null;
    return;
  }

  const dir = _orden.desc ? -1 : 1;
  const ordenar = arr => [...arr].sort((a, b) => {
    const A = a[_orden.col], B = b[_orden.col];
    if (A == null) return 1;
    if (B == null) return -1;
    return typeof A === "string" ? A.localeCompare(B) * dir : (A - B) * dir;
  });

  // UNA FILA POR ACTIVO: las compras del mismo activo se juntan (agruparPorActivo)
  // solo para mostrarlas. Los importes de arriba, los gráficos, la lectura y el
  // análisis siguen saliendo de r, por compra, como siempre: no cambia ningún total.
  const activos = agruparPorActivo(r.filas, r.total, cur);
  // Todas | Por broker (agruparPorBroker, el criterio de siempre) | Por tipo.
  // Por broker, los subtotales se cuentan sobre las COMPRAS y recién después
  // cada broker junta las suyas por activo: KO en IOL y KO en PPI son dos filas,
  // cada una con su parte (cantidad, promedio y valor de ese broker). Por tipo,
  // el activo va entero a su grupo. El orden de columna elegido se respeta
  // dentro de cada grupo.
  const agr = agruparPref();
  let grupos = null, lista = null;
  if (agr === "broker") grupos = agruparPorBroker(r.filas, r.total).map(g => ({ ...g, nombre: g.broker,
    filas: ordenar(agruparPorActivo(g.filas, r.total, cur, "@" + g.broker)) }));
  else if (agr === "tipo") grupos = agruparPorTipo(ordenar(activos), r.total, bonos);
  else lista = ordenar(activos);
  const visibles = grupos ? grupos.flatMap(g => g.filas) : lista;
  _vista.filas = visibles;
  _vista.porId = Object.fromEntries(visibles.map(f => [f.id, f]));
  visibles.forEach(f => (f.compras || [f]).forEach(c => { _vista.deCompra[c.id] = f.id; }));
  if (_abierta && !_vista.porId[_abierta]) {
    const ids = new Set(((abiertaAntes && abiertaAntes.compras) || [abiertaAntes]).filter(Boolean).map(c => c.id));
    const otra = ids.size ? visibles.find(f => (f.compras || [f]).some(c => ids.has(c.id))) : null;
    if (otra) _abierta = otra.id; else { _abierta = null; _ajAbierto = null; }
  }

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
    // guardada con el sufijo de otro mercado (NVDA-USD): el desplegable la arregla
    const rota = filaRota(f, bonos);
    if (rota) pills.push(["warn", "no existe", `${f.ticker} no existe: ${punto(`${rota.s} es ${rota.esTxt}`)} Abrí la fila para pasarla al mercado que corresponde`]);
    else if (px.sinDatos) pills.push(["warn", "Ticker no encontrado", "Revisá que el ticker esté bien escrito"]);
    else if (px.veredicto && px.veredicto !== "Sin cobertura") pills.push([verCls(px.veredicto), px.veredicto, "Lectura automática de Valtia"]);
    else if (f.actual != null) pills.push(["sin", "Sin lectura", "Valtia no tiene lectura de valor de este activo"]);
    // sin doc de precio todavía (recién cargada): el pipeline lo crea en su
    // próxima corrida, a cualquier hora, así que "unos 15 minutos" es cierto
    if (!rota && !px.sinDatos && f.actual == null) pills.push(["warn", "sin precio", "El precio llega en la próxima actualización, en unos 15 minutos: hasta entonces queda fuera del total"]);
    if (px.rsi != null && px.rsi > 70) pills.push(["warn", "RSI " + num(px.rsi, 0), "Sobrecomprada: no es señal de venta, es para mirarla"]);
    if (rf) {
      const R = rfDatos(f.ticker, bonos, opts.panel);
      const d = R && R.vence ? diasHasta(R.vence) : null;
      if (d != null && d >= 0 && d <= 30) pills.push(["warn", "vence " + ddmm(R.vence), d === 0 ? "Vence hoy" : `Vence en ${d} ${d === 1 ? "día" : "días"}`]);
    }
    if (f.actual != null && !(Number(f.precioCompra) > 0) && !f.promFalta) pills.push(["warn", "sin precio de compra", "Sin precio de compra, el resultado es todo el valor: cargalo para que sea real"]);
    // varias compras del mismo activo: la fila las junta y lo dice; si alguna
    // vino sin precio, el promedio la cuenta con precio 0 y también se dice
    const nc = (f.compras || []).length;
    if (nc > 1) pills.push(["sin", `${nc} compras`, "La fila junta tus compras de este activo: cantidad total y precio promedio ponderado. Abrila para verlas una por una"]);
    if (nc > 1 && f.sinPrecio > 0 && Number(f.precioCompra) > 0) pills.push(["warn", `${f.sinPrecio} sin precio de compra`, "Entran al promedio con precio 0, así que el resultado de esa parte es todo su valor: quitalas desde el desplegable y cargalas de nuevo con su precio"]);
    if (f.promFalta) pills.push(["warn", "promedio sin dólar", "Compras en dos monedas y sin cotización del dólar: no podemos armar el precio promedio"]);
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
    const promTit = prom ? `Precio promedio de compra: ${money(Number(f.precioCompra), f.moneda)}${fac !== 1 ? " cada 100 VN" : ""}${nc > 1 ? ` · ponderado por cantidad, ${nc} compras` : ""}` : "";
    // lo que se movió esta posición hoy. Sin variación del día va un guion: no
    // se inventa un cero (se leería como "no se movió")
    const hoyCls = f.dHoy == null ? "mc-mut" : f.dHoy >= 0 ? "mc-pos" : "mc-neg";
    const hoyTit = f.dHoy == null ? "Todavía no tenemos la variación del día de este activo: esta fila no entra en el total de arriba"
                                  : "Lo que se movió esta posición hoy, contra el cierre de ayer";
    return `<div class="mc3-pos" data-pos="${esc(f.id)}">
      <div class="mc3-row${on ? " on" : ""}" data-fila="${esc(f.id)}" role="button" tabindex="0" aria-expanded="${on}">
        <div class="c-act"><div class="mc3-tk"><b>${esc(tk)}</b>${mk === "byma" || mk === "rf" ? '<span class="mc3-mk">BYMA</span>' : ""}${nombre ? `<span class="mc3-nm">${esc(nombre)}</span>` : ""}</div>
          ${pills.length ? `<div class="mc3-pills">${pills.map(([c, t, tt]) => `<span class="mc3-pill ${c}"${tt ? ` title="${esc(tt)}"` : ""}>${esc(t)}</span>`).join("")}</div>` : ""}</div>
        <span class="c-brk mc3-brk"${f.brokers && f.brokers.length > 1 ? ` title="En varios brokers: ${esc(f.brokerTitulo)}"` : ""}>${esc(brk)}</span>
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

  // el renglón del grupo: cuánto suma, qué parte del total es, cuánto se movió
  // hoy y cuánto va ganando. El peso va pegado al monto, que es la pregunta que
  // se hace al agrupar ("¿cuánto tengo en IOL y qué parte de todo es?")
  const grpHTML = g => `<div class="mc3-grp"><b>${esc(g.nombre)}</b><span>${g.filas.length} ${g.filas.length === 1 ? "posición" : "posiciones"}${sinDolar ? "" : ` · ${money(g.valor, cur)}${g.peso != null ? ` · <em title="Lo que pesa este grupo en el total de tu cartera">${num(g.peso)}% de tu cartera</em>` : ""}${g.hoy != null ? ` · hoy <em class="${g.hoy >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(g.hoy, cur)}</em>` : ""}${g.plPct != null ? ` · <em class="${g.pl >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(g.pl, cur)} (${pct1(g.plPct)})</em>` : ""}`}</span></div>`;
  const filasHTML = grupos ? grupos.map(g => grpHTML(g) + g.filas.map(filaHTML).join("")).join("") : lista.map(filaHTML).join("");

  // las cuentas ("N de M con precio", "N sin variación del día") van por ACTIVO,
  // como las filas: dos compras de KO comparten el precio y son una posición.
  // Los importes (valor, hoy, resultado y su %) salen de r, sumados por compra
  const conPrecio = activos.filter(f => f.actual != null).length;
  const hoySin = activos.filter(f => f.dValor != null && f.dHoy == null).length;
  // el total del día: suma solo las filas que traen la variación, y si alguna
  // quedó afuera se dice al lado del número (y no en un título que nadie abre)
  const hoyOk = !sinDolar && r.hoyTot != null;
  const hoyFuera = !sinDolar && hoySin > 0
    ? `<em>· ${hoySin === 1 ? "1 posición sin variación del día" : `${hoySin} posiciones sin variación del día`}</em>` : "";
  const arriba = `<div class="mc3-top">
      <div class="mc3-tot">
        <span><b>${sinDolar ? "—" : money(r.total, cur)}</b> valor</span>
        <span title="Lo que se movió tu cartera hoy, contra el cierre de ayer"><b class="${hoyOk ? (r.hoyTot >= 0 ? "mc-pos" : "mc-neg") : ""}">${hoyOk ? moneyS(r.hoyTot, cur) : "—"}</b>${hoyOk && r.hoyTotPct != null
          ? `<i class="mc3-pp ${r.hoyTotPct >= 0 ? "up" : "dn"}">${pct1(r.hoyTotPct)}</i>` : ""} hoy${hoyFuera}</span>
        <span><b class="${sinDolar ? "" : r.plTot >= 0 ? "mc-pos" : "mc-neg"}">${sinDolar ? "—" : moneyS(r.plTot, cur)}</b>${!sinDolar && r.plTotPct != null
          ? `<i class="mc3-pp ${r.plTotPct >= 0 ? "up" : "dn"}" title="sobre ${esc(money(r.costoTot, cur))} invertidos">${pct1(r.plTotPct)}</i>` : ""} resultado</span>
        <span><b class="k">${conPrecio} de ${activos.length}</b> con precio</span>
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
      va un guion y esa fila no entra en el total de arriba. Debajo de la cantidad va tu precio promedio de compra.
      Si compraste un activo varias veces, es una sola fila con la cantidad total y el promedio ponderado; al abrirla
      ves cada compra por separado, y desde ahí vendés o ajustás cada una.</p>
    <div class="mc-subnav">Todos tus activos juntos: <a href="#panel/empresas" data-go="empresas">informes, noticias y agenda →</a>
      <span>·</span> <a href="#panel/herramientas" data-go="herramientas">ratios y datos →</a></div>
    ${lectura(r)}
    ${analisis(r, cur, bonos, opts.rentaFija || "", activos)}
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
  // una posición sin precio puede estar guardada con el sufijo de otro mercado
  // (NVDA-USD, con el mercado "Cripto" recordado de una carga anterior). Para
  // saberlo hace falta el catálogo, que se pide recién acá y una sola vez;
  // cuando llega se repinta y la fila ofrece arreglarla (filaRota)
  if (!_cat && !_catPedido && _pos.some(p => { const px = _precios[String(p.ticker || "").toUpperCase()]; return !px || px.sinDatos || px.precio == null; })) {
    _catPedido = true;
    catalogo().then(m => { if (m && _el && _user) pintar(); });
  }
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
  root.querySelectorAll("[data-pasar]").forEach(b => b.onclick = () => pasarMercado(b.dataset.pasar, b.dataset.mercado, b));
  root.querySelectorAll(".mc-brk[data-brk]").forEach(chip => chip.onclick = () => {
    const id = chip.dataset.brk;
    const actual = chip.textContent === "sin broker" ? "" : chip.textContent;
    // un <select> con la lista entera (antes era un campo con datalist, que con
    // un valor puesto mostraba solo ese); «Otro…» pasa a un campo libre
    const sel = document.createElement("select");
    sel.className = "mc-brk-in";
    const ops = [["", "sin broker"], ...BROKERS.map(b => [b, b === "Otro" ? "Otro…" : b])];
    if (actual && !BROKERS.includes(actual)) ops.splice(1, 0, [actual, actual]);
    sel.innerHTML = ops.map(([v, t]) => `<option value="${esc(v)}"${v === actual ? " selected" : ""}>${esc(t)}</option>`).join("");
    chip.replaceWith(sel); sel.focus();
    let listo = false;
    const fin = v => { if (listo) return; listo = true; guardarBroker(id, v); };
    const libre = () => {
      const inp = document.createElement("input");
      inp.className = "mc-brk-in"; inp.maxLength = 24; inp.placeholder = "¿Qué cuenta?";
      sel.replaceWith(inp); inp.focus();
      inp.addEventListener("keydown", ev => { if (ev.key === "Enter") fin(inp.value.trim()); if (ev.key === "Escape") { listo = true; pintar(); } });
      inp.addEventListener("blur", () => fin(inp.value.trim()));
    };
    sel.addEventListener("change", () => { if (sel.value === "Otro") libre(); else fin(sel.value); });
    sel.addEventListener("keydown", ev => { if (ev.key === "Escape") { listo = true; pintar(); } });
    // se fue sin elegir: vuelve el chip
    sel.addEventListener("blur", () => { if (!listo && sel.isConnected) { listo = true; pintar(); } });
  });
}

function enganchar() {
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
  // el botón del estado vacío: el del encabezado lo maneja panel.js (__mcAbrirForm)
  _el.querySelectorAll("[data-mc-abrir]").forEach(b => b.onclick = () => abrirFormulario(true));
}

/* cotizaciones para convertir (misma fuente que la barra del sitio) */
/* el dólar sale de fx.js: misma fuente que la barra, pero con guardas y una
   sola consulta por carga compartida con el panel. Si no pasa las guardas,
   _fx.ccl queda en null y el aviso de "sin dólar" se encarga. fxMercado()
   nunca rechaza. */
async function cargarFx() { _fx = await fxMercado(); }

/* ── importar: primero muestra qué entendió, después confirma ── */
let _porImportar = null;

/* ══════════════════ el modal de alta ══════════════════
   Reemplaza a la tarjeta que se desplegaba arriba de la tabla. Dos decisiones
   que NO se discuten y que explican por qué esto es más simple de lo que
   parece en el prototipo:

   1) SIN MIGRACIÓN. Por detrás se sigue guardando como siempre: un documento
      por compra en inversores/{email}/cartera, con ticker, cantidad,
      precioCompra, fecha, broker, moneda y factor. La "lista de compras" del
      modal es una comodidad de carga —tres compras del mismo activo en un solo
      paso—, no un cambio de modelo: cada renglón sale como su propio documento,
      igual que si se hubieran cargado de a una.
   2) SIN VENTAS. Acá solo entran compras. Para vender ya está «Vendí» en la
      fila, que es lo único que deja la venta registrada con su resultado. Si
      alguien escribe una cantidad negativa se le dice dónde va.

   El modal cuelga de <body> y no de _el: así el refresco de precios (que
   redibuja la pestaña entera cada 2 minutos) no puede borrar lo que se está
   tipeando. _modal guarda el nodo, a quién devolverle el foco y el escuchador
   de teclado que hay que sacar al cerrar. */
let _modal = null;
const $m = sel => (_modal ? _modal.el.querySelector(sel) : null);

const FOCO = 'a[href],button:not([disabled]):not([hidden]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])';
/* el foco no se escapa del diálogo mientras está abierto */
function atraparFoco(caja, ev) {
  const f = [...caja.querySelectorAll(FOCO)]
    .filter(x => x.offsetWidth || x.offsetHeight || x.getClientRects().length);
  if (!f.length) return;
  const a = f[0], z = f[f.length - 1], act = document.activeElement;
  if (!caja.contains(act)) { ev.preventDefault(); (ev.shiftKey ? z : a).focus(); return; }
  if (!ev.shiftKey && act === z) { ev.preventDefault(); a.focus(); }
  else if (ev.shiftKey && act === a) { ev.preventDefault(); z.focus(); }
}

const opcMercados = sel => MERCADOS.map(([k, n]) =>
  `<option value="${k}"${sel === k ? " selected" : ""}>${n}</option>`).join("");

/* ── el broker del modal ──
   Un <select> con la lista entera visible al tocarlo. Antes era un campo con
   datalist, que filtra por lo escrito: con "IOL" precargado, al tocarlo
   aparecía solo IOL y parecía que la lista era esa. Si la preferencia guardada
   (valtia-mc-broker) no está en la lista, va como opción elegida igual; sin
   preferencia, la primera opción pide elegir, así nadie guarda "IOL" sin
   querer. «Otro…» destapa un campo corto al lado para escribir cualquier
   cuenta. Lo que se guarda sigue siendo un texto (brokerDe). */
export function brokerSelectHTML(id, valor) {
  const v = String(valor || "").trim();
  const ops = BROKERS.map(b => `<option value="${esc(b)}"${b === v ? " selected" : ""}>${b === "Otro" ? "Otro…" : esc(b)}</option>`);
  if (v && !BROKERS.includes(v)) ops.unshift(`<option value="${esc(v)}" selected>${esc(v)}</option>`);
  else if (!v) ops.unshift(`<option value="" selected>Elegí tu broker</option>`);
  return `<div class="mc-bk"><select id="${id}">${ops.join("")}</select>
    <input id="${id}-otro" class="mc-bk-otro" placeholder="¿Qué cuenta?" maxlength="24" autocomplete="off" aria-label="Nombre de la cuenta" hidden></div>`;
}
/* el broker que se guarda: la opción elegida o, con «Otro…», lo escrito al lado */
function brokerDe(id) {
  const s = $m("#" + id);
  if (!s) return "";
  if (s.value === "Otro") return String(($m("#" + id + "-otro") || {}).value || "").trim();
  return String(s.value || "").trim();
}
function engancharBrokerSel(root) {
  root.querySelectorAll(".mc-bk select").forEach(s => {
    const otro = root.querySelector("#" + s.id + "-otro");
    if (!otro) return;
    const ver = () => { otro.hidden = s.value !== "Otro"; };
    s.addEventListener("change", () => { ver(); if (s.value === "Otro") try { otro.focus(); } catch (e) {} });
    ver();
  });
}

/* un renglón de la lista de compras. Los valores viven en el DOM: agregar o
   sacar un renglón no repinta los demás, así que no se pierde lo escrito ni
   el cursor. La fecha arranca en hoy. Cantidad y precio son campos de TEXTO
   (inputmode=decimal para el teclado del celular) que lee parseNum: aceptan
   coma o punto decimal y miles con punto; un type=number leía "0,3923" como 0
   y Guardar quedaba apagado sin decir por qué. Una cantidad negativa se puede
   escribir, para poder explicar que las ventas van por otro lado. */
const filaCompraHTML = (hoy, v = {}) => `<div class="mc-cmp" data-cmp>
    <input type="date" data-c-fecha max="${hoy}" value="${esc(v.fecha || hoy)}" aria-label="Fecha de la compra">
    <input type="text" inputmode="decimal" autocomplete="off" data-c-cant placeholder="Cantidad" value="${numIn(v.cant)}" aria-label="Cantidad comprada">
    <input type="text" inputmode="decimal" autocomplete="off" data-c-px placeholder="Precio" value="${numIn(v.px)}" aria-label="Precio de compra">
    <button type="button" class="mc-cmp-x" data-c-quitar aria-label="Sacar esta compra" title="Sacar esta compra">×</button>
  </div>`;

function modalHTML() {
  const mkt = pref("valtia-mc-mercado", "byma");
  const brk = pref("valtia-mc-broker", "");
  return `<div class="mc-mdl" role="dialog" aria-modal="true" aria-labelledby="mc-mdl-t">
    <div class="mc-mdl-hd">
      <h3 id="mc-mdl-t">Agregar activo</h3>
      <button type="button" class="mc-mdl-x" data-mc-cerrar aria-label="Cerrar">✕</button>
    </div>
    <div class="mc-tabs" role="group" aria-label="Cómo querés cargarlo">
      <button type="button" class="mc-tab on" data-modo="uno" aria-pressed="true">Una por una</button>
      <button type="button" class="mc-tab" data-modo="imp" aria-pressed="false">Pegar desde planilla</button>
    </div>
    <div class="mc-mdl-bd">
      <div id="mc-modo-uno">
        <div class="mc-gr">
          <div><label for="mc-mercado">Mercado</label><select id="mc-mercado">${opcMercados(mkt)}</select></div>
          <div><label for="mc-broker">Broker / cuenta</label>${brokerSelectHTML("mc-broker", brk)}</div>
          <div><label for="mc-ticker">Símbolo</label>
            <div class="mc-sug">
              <input id="mc-ticker" placeholder="GGAL, AL30, NVDA…" maxlength="12" autocomplete="off" spellcheck="false"
                role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="mc-sug-l">
              <ul id="mc-sug-l" class="mc-sug-l" role="listbox" aria-label="Coincidencias del catálogo" hidden></ul>
            </div></div>
          <div><div class="mc-lbl" id="mc-nombre-k">Nombre</div>
            <div class="fijo" id="mc-nombre" aria-labelledby="mc-nombre-k">—</div></div>
        </div>
        <div class="mc-sub" id="mc-guarda"></div>
        <div class="mc-ref" id="mc-ref" hidden></div>
        <div class="mc-k2">Tus compras</div>
        <div class="mc-cmp-hd" aria-hidden="true"><span>Fecha</span><span>Cantidad</span><span>Precio</span><span></span></div>
        <div class="mc-cmps" id="mc-compras"></div>
        <button type="button" class="mc-mas" id="mc-mas">+ Agregar otra compra</button>
        <div class="mc-res">
          <div class="f"><span>Posición</span><b id="mc-posic">—</b></div>
          <div class="f"><span>Precio promedio de compra</span><b id="mc-prom">—</b></div>
          <div class="f"><span>Total invertido</span><b id="mc-tot">—</b></div>
          <div class="nota" id="mc-resnota"></div>
        </div>
      </div>
      <div id="mc-modo-imp" class="mc-imp" style="display:none">
        <div class="mc-gr" style="margin-bottom:12px">
          <div><label for="mc-imp-mercado">¿De qué mercado es este resumen?</label>
            <select id="mc-imp-mercado">${opcMercados(mkt)}</select></div>
          <div><label for="mc-imp-broker">Broker / cuenta</label>${brokerSelectHTML("mc-imp-broker", brk)}</div>
        </div>
        <div class="mc-hint">Copiá las filas del resumen de tu broker y pegalas acá: una posición por línea, en el orden
          <b>ticker · cantidad · precio de compra · fecha</b>. Sirven tabulaciones, comas o punto y coma, y los números
          pueden venir como 1.900,50 o 1900.50. El encabezado se ignora solo. Si elegís BYMA, "GGAL" se guarda como la
          acción local en pesos (GGAL.BA); los bonos y letras quedan tal cual.</div>
        <textarea id="mc-paste" aria-label="Filas pegadas de tu broker" placeholder="GGAL	100	4.500	2026-03-10&#10;AL30	1000	85.400&#10;NVDA;20;38.000"></textarea>
        <div id="mc-prev"></div>
        <button type="button" class="mc-btn" id="mc-imp-btn" style="margin-top:12px">Revisar</button>
      </div>
    </div>
    <div class="mc-mdl-pie">
      <div class="mc-msg" id="mc-mdl-msg"></div>
      <button type="button" class="mc-btn sec" data-mc-cerrar>Cancelar</button>
      <button type="button" class="mc-btn" id="mc-add">Guardar</button>
    </div>
  </div>`;
}

/* lo que define la moneda y el factor: el mercado elegido y el ticker ya
   normalizado. Es la MISMA cuenta que hace guardarCompras() al grabar; la
   única diferencia es que acá se usa el set de bonos que ya está en memoria
   (al guardar se espera el de Firestore), así la vista previa nunca dice una
   moneda y el documento guarda otra. */
function contextoModal(escritura) {
  const mercado = ($m("#mc-mercado") || {}).value || "byma";
  const crudo = (($m("#mc-ticker") || {}).value || "").trim().toUpperCase();
  // escritura: con qué se normaliza cuando no es lo tipeado tal cual (el
  // r.simbolo de resolverSimbolo: BRK.B → BRK-B en el exterior, NVDA-USD → NVDA en BYMA)
  const usar = escritura || crudo;
  const tk = usar ? normalizarTicker(usar, mercado, _bonos) : "";
  const moneda = tk ? monedaMercado(mercado, tk, _bonos) : (mercado === "byma" ? "ARS" : "USD");
  return { mercado, crudo, tk, moneda, factor: tk && _bonos.has(tk) ? 0.01 : 1 };
}

/* lo tipeado en cada renglón, crudo y como número. parseNum entiende coma o
   punto decimal y miles con punto ("0,3923", "1.234,5", "1900.50"); el
   type=number de antes leía "0,3923" como 0 y la compra no se guardaba. */
const leerCompras = () => [...(_modal ? _modal.el.querySelectorAll("[data-cmp]") : [])].map(r => {
  const cRaw = r.querySelector("[data-c-cant]").value, pRaw = r.querySelector("[data-c-px]").value;
  return { fila: r, fecha: r.querySelector("[data-c-fecha]").value || "",
           cantTxt: cRaw, pxTxt: pRaw, cant: parseNum(cRaw), px: parseNum(pRaw) };
});

/* ── qué falta para guardar, en orden: símbolo, choque de mercado, cantidad,
   precio. Recibe lo tipeado (texto) y devuelve la primera falla con el campo
   a marcar (campo: "simbolo" | "mercado" | "cant" | "px", i: el renglón), o las
   compras listas para grabar. Los renglones vacíos del todo se ignoran cuando
   hay otro con algo escrito (el "+ Agregar otra compra" que quedó sin usar).
   Una compra sin precio se guarda con 0, como siempre. ── */
export function validarCompras(simbolo, choque, filas) {
  const sim = String(simbolo || "").trim();
  if (!sim) return { error: "Falta el símbolo: escribilo como lo ves en tu broker.", campo: "simbolo" };
  // sin una letra ni un número no hay ticker: normalizarTicker daría "" y la
  // compra se guardaría sin símbolo (antes lo frenaba el botón apagado)
  if (!/[A-Za-z0-9]/.test(sim)) return { error: "El símbolo no se entiende: escribilo como lo ves en tu broker (GGAL, AL30, NVDA…).", campo: "simbolo" };
  if (choque) return { error: choque, campo: "mercado" };
  const vacio = s => !String(s ?? "").trim();
  const lista = (filas || []).map((f, i) => ({ f, i })).filter(x => !vacio(x.f.cantTxt) || !vacio(x.f.pxTxt));
  if (!lista.length) return { error: "Falta la cantidad de la compra.", campo: "cant", i: 0 };
  const compras = [];
  for (const { f, i } of lista) {
    const cant = parseNum(f.cantTxt), px = parseNum(f.pxTxt);
    if (vacio(f.cantTxt) || !isFinite(cant)) return { error: "Falta la cantidad de la compra.", campo: "cant", i };
    if (cant < 0) return { error: "La cantidad es negativa: las ventas se registran desde la fila del activo, con «Vendí».", campo: "cant", i };
    if (cant === 0) return { error: "La cantidad es 0: poné cuántas compraste.", campo: "cant", i };
    if (!vacio(f.pxTxt) && (!isFinite(px) || px < 0)) return { error: "El precio no se entiende: escribilo como 1.234,56 o 1234.56 (o dejalo vacío).", campo: "px", i };
    compras.push({ fecha: f.fecha || "", cant, px: isFinite(px) && px > 0 ? px : 0, fila: f.fila });
  }
  return { compras };
}

/* ── el símbolo tipeado, según el catálogo (catalogo-activos.js) ──
   Cada entrada trae en qué mercado cotiza. Un mismo símbolo puede estar en dos
   (NVDA es CEDEAR en BYMA y acción en EE.UU.; IBIT igual) y no existir en el
   tercero: NVDA-USD no es nada. Textos: "un CEDEAR en BYMA", "una cripto". */
const MERCADO_NOM = { byma: "BYMA", ext: "Exterior", cripto: "Cripto" };   // como en el selector
const MERCADO_EN = { byma: "BYMA", ext: "EE.UU.", cripto: "cripto" };     // dónde cotiza
const TIPO_UN = { cedear: "un CEDEAR", accion_ar: "una acción", accion_us: "una acción", etf: "un ETF",
                  bono: "un bono", letra: "una letra", on: "una ON", cripto: "una cripto" };
const TIPO_EL = { cedear: "el CEDEAR", accion_ar: "la acción", accion_us: "la acción", etf: "el ETF",
                  bono: "el bono", letra: "la letra", on: "la ON", cripto: "la cripto" };
const TIPO_CORTO = { cedear: "CEDEAR", accion_ar: "acción", accion_us: "acción", etf: "ETF", bono: "bono", letra: "letra", on: "ON" };
const queEs = e => e.t === "cripto" ? "una cripto" : `${TIPO_UN[e.t] || "un activo"} en ${MERCADO_EN[e.m] || e.m}`;
/* cierra la frase sin duplicar el punto de "EE.UU." */
const punto = t => /\.$/.test(t) ? t : t + ".";
/* "CEDEAR en BYMA" / "acción en EE.UU." / "cripto": el renglón de las sugerencias */
const tipoEn = e => e.t === "cripto" ? "cripto" : `${TIPO_CORTO[e.t] || "activo"} en ${MERCADO_EN[e.m] || e.m}`;
const esEntradaRF = e => e.t === "bono" || e.t === "letra" || e.t === "on";

/* buscarCatalogo, más la renta fija que el panel de bonos conoce y el catálogo
   no (una letra nueva): para el modal es "un bono en BYMA" igual */
function buscarConCatalogo(simbolo, mercado) {
  const e = _cat ? _cat.buscarCatalogo(simbolo, mercado) : null;
  if (e || mercado !== "byma") return e;
  const c = canon(String(simbolo || "").trim().toUpperCase(), _bonos);
  return esRentaFija(c, _bonos) ? { s: c, n: "Renta fija BYMA · cotiza por 100 VN", t: "bono", m: "byma" } : null;
}

/* ── resolverSimbolo: qué es lo tipeado con el mercado elegido. PURA: el
   catálogo entra por `buscar(simbolo, mercado)` (buscarCatalogo, o una de
   prueba); con buscar = null (todavía no cargó) no se afirma nada sobre él.
   Devuelve:
   - tk: cómo se guarda con ese mercado (NVDA.BA / NVDA / NVDA-USD; la renta
     fija sin sufijo, como la lista el panel de bonos)
   - nombre: el del catálogo en ese mercado o, si ahí no está, en el primero
     donde esté ("" si en ninguno). activos.js tiene prioridad para los que
     tienen ficha: eso lo aplica nombreCatalogo, no esto.
   - enCatalogo: true/false en el mercado elegido; null sin catálogo
   - mercadosPosibles: en cuáles lo tiene el catálogo, ["byma", "ext"]
   - esTxt: "un CEDEAR en BYMA y una acción en EE.UU." (todas sus entradas)
   - choque: el aviso cuando con ese mercado el ticker NO existe, y entonces
     no se guarda: elegido Cripto y el símbolo no es una cripto (NVDA-USD), o
     elegido BYMA/Exterior y el símbolo es solo una cripto (BTC.BA), o un bono
     o una letra fuera de BYMA (cotizan ahí y se guardan sin sufijo: en otro
     mercado irían en la moneda equivocada). Entre BYMA y Exterior NO hay
     choque: KO puede ser el CEDEAR o la acción, y nuestra lista de EE.UU. es
     S&P 500 + Nasdaq 100 + ETFs, así que un ADR que no está es una compra
     legítima. Ahí solo se informa cuál es cuál.
   - sugerencias: los otros mercados donde está, para los botones de un clic:
     [{ mercado, tk, txt: "Cargarlo en BYMA (NVDA.BA)" }]
   - aviso: lo que se informa sin bloquear (no está en el catálogo, se guarda
     igual; o está acá y también allá)
   - cambiarA: si está en UN solo mercado y no es el elegido, ese mercado (el
     modal cambia el selector solo si el usuario no lo tocó a mano)
   - entrada: la entrada del catálogo en el mercado elegido (o null); en un
     CEDEAR trae el ratio y el subyacente para la línea de referencia ── */
/* ── con qué escritura se guarda un símbolo en un mercado ──
   1) Sin el sufijo de OTRO mercado: "NVDA.BA" en Cripto o Exterior es NVDA,
      "NVDA-USD" en BYMA es NVDA (normalizarTicker le pone después el sufijo
      que va). Antes "NVDA-USD" elegido BYMA daba NVDA-USD.BA, y el botón de
      un clic "Cargarlo en Exterior" ofrecía NVDA.BA: otra posición rota.
   2) La del catálogo si lo tiene con otra (las acciones por clase): BRK-B o
      BRK.B tipeado con BYMA es BRKB, el CEDEAR; BRKB con Exterior es BRK.B.
   3) En el exterior, las clases con guion (BRK-B): así las resuelve el sync
      (yfinance) y así ya están guardadas; con punto, Yahoo no las encuentra.
   Es la MISMA regla que aplica elegir una sugerencia de la lista, así lo que
   se guarda no depende de si se tipeó entero o se tocó la sugerencia. */
export function escrituraEn(simbolo, mercado, entrada) {
  let e = String(simbolo || "").trim().toUpperCase();
  e = mercado === "byma" ? e.replace(/-USD$/, "") : e.replace(/\.BA$/, "");
  if (entrada && entrada.s && entrada.s !== e) e = String(entrada.s);
  return mercado === "ext" ? e.replace(/\./g, "-") : e;
}

export function resolverSimbolo(crudo, mercadoElegido, buscar, bonos = new Set()) {
  const s = String(crudo || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  const mercado = MERCADOS.some(([k]) => k === mercadoElegido) ? mercadoElegido : "byma";
  const entradas = s && typeof buscar === "function" ? MERCADOS.map(([k]) => buscar(s, k)).filter(Boolean) : [];
  const enM = m => entradas.find(e => e.m === m) || null;
  const tkEn = m => normalizarTicker(escrituraEn(s, m, enM(m)), m, bonos);
  // simbolo: la escritura con la que se normaliza en el mercado elegido (lo
  // que usan la línea "Se guarda como" y guardarCompras); con el catálogo sin
  // cargar, lo tipeado sin el sufijo de otro mercado
  const r = { tk: s ? tkEn(mercado) : "", simbolo: s ? escrituraEn(s, mercado, enM(mercado)) : "",
              nombre: "", enCatalogo: null, mercadosPosibles: [], esTxt: "",
              choque: "", sugerencias: [], aviso: "", cambiarA: null, entrada: null };
  if (!s || typeof buscar !== "function") return r;
  const aca = enM(mercado);
  r.entrada = aca;
  const otras = entradas.filter(e => e.m !== mercado);
  r.mercadosPosibles = entradas.map(e => e.m);
  r.enCatalogo = !!aca;
  r.nombre = aca ? aca.n : (otras[0] ? otras[0].n : "");
  r.esTxt = entradas.map(queEs).join(" y ");
  r.sugerencias = otras.map(e => ({ mercado: e.m, tk: tkEn(e.m), txt: `Cargarlo en ${MERCADO_NOM[e.m]} (${tkEn(e.m)})` }));
  if (!entradas.length) {
    r.aviso = "No está en nuestro catálogo: se guarda igual, revisá que esté escrito como en tu broker.";
    return r;
  }
  if (aca) {
    // está acá y también en otro lado (KO: CEDEAR en BYMA, acción en EE.UU.): se dice cuál es cuál
    if (otras.length) r.aviso = `En ${MERCADO_EN[mercado]} es ${TIPO_EL[aca.t] || "el activo"} (${r.tk}); `
      + otras.map(e => `en ${MERCADO_EN[e.m]}, ${TIPO_EL[e.t] || "el activo"} (${tkEn(e.m)})`).join("; ") + ".";
    return r;
  }
  if (entradas.length === 1) r.cambiarA = entradas[0].m;
  const otrasTxt = otras.map(queEs).join(" y ");
  if (mercado === "cripto") r.choque = punto(`${s} no es una cripto: es ${otrasTxt}`);
  else if (otras.every(e => e.m === "cripto")) r.choque = `${s} es una cripto: en ${MERCADO_EN[mercado]} no existe.`;
  else if (otras.every(esEntradaRF)) r.choque = `${s} es ${otrasTxt}: en ${MERCADO_EN[mercado]} no existe.`;
  else r.aviso = `${s} es ${otrasTxt}; en ${MERCADO_EN[mercado]} no lo tenemos en la lista. Si lo compraste ahí, se guarda igual como ${r.tk}.`;
  return r;
}

/* ── hasta `max` coincidencias del catálogo para lo tipeado: primero por el
   principio del símbolo (el exacto adelante, después los más cortos), después
   por el nombre (desde dos letras). Cada entrada del catálogo es una: NVDA
   CEDEAR y NVDA acción son dos renglones. La acción por clase se encuentra
   escrita de cualquier forma (BRK-B, BRK.B, BRKB). PURA. ── */
export function sugerirCatalogo(texto, catalogo, max = 8) {
  const t = String(texto || "").trim().toUpperCase();
  if (!t || !Array.isArray(catalogo)) return [];
  const clave = t.replace(/\.BA$/, "").replace(/-USD$/, "");
  const compacta = clave.replace(/[.\-]/g, "");
  if (!compacta) return [];
  const norm = x => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = norm(clave);
  const porSim = [], porNom = [];
  for (const e of catalogo) {
    if (e.s.startsWith(clave) || e.s.replace(/[.\-]/g, "").startsWith(compacta)) porSim.push(e);
    else if (q.length >= 2 && norm(e.n).includes(q)) porNom.push(e);
  }
  const ORD = { byma: 0, ext: 1, cripto: 2 };
  const exacto = e => (e.s === clave || e.s.replace(/[.\-]/g, "") === compacta) ? 0 : 1;
  porSim.sort((a, b) => exacto(a) - exacto(b) || a.s.length - b.s.length || a.s.localeCompare(b.s) || (ORD[a.m] ?? 9) - (ORD[b.m] ?? 9));
  return porSim.concat(porNom).slice(0, max);
}

/* el nombre del activo sale del catálogo: primero activos.js (los que tienen
   ficha), después catalogo-activos.js. No se escribe ni se inventa. Si está en
   el catálogo pero en otro mercado, el nombre se muestra igual, en gris (la
   línea de abajo explica); si no está en ninguno, se dice y se carga igual. */
function nombreCatalogo(tk, r) {
  if (!tk) return { txt: "—", ok: false };
  if (tickerFicha(tk)) return { txt: nombreDe(tk), ok: true };
  if (r && r.nombre) return { txt: r.nombre, ok: !!r.enCatalogo };
  if (esRentaFija(tk, _bonos)) return { txt: "Renta fija BYMA · cotiza por 100 VN", ok: true };
  if (r && r.enCatalogo === null) return { txt: "Buscando en el catálogo…", ok: false };
  return { txt: "No está en nuestro catálogo", ok: false };
}

/* ── una posición guardada con el sufijo de otro mercado (NVDA-USD, BTC.BA) ──
   Pasa cuando el modal tenía recordado el mercado de una carga anterior. El
   precio no va a llegar nunca: si no está (doc sinDatos, o sin doc todavía) y
   el catálogo tiene el símbolo base en otros mercados pero no en el del
   sufijo, la fila lo dice y el desplegable ofrece pasarla con un clic
   (pasarMercado). null si no es el caso o si el catálogo todavía no cargó
   (pintar() lo pide y repinta cuando llega). */
function filaRota(f, bonos) {
  const px = f.px || null;
  if (!_cat || esRentaFija(f.ticker, bonos)) return null;
  if (f.actual != null && !(px && px.sinDatos)) return null;
  const s = _cat.claveCatalogo(f.ticker);
  const mk = mercadoDe(f.ticker, bonos);
  const entradas = MERCADOS.map(([k]) => _cat.buscarCatalogo(s, k)).filter(Boolean);
  if (!s || !entradas.length || entradas.some(e => e.m === mk)) return null;
  // la escritura de cada mercado (BRKB en BYMA, BRK-B en el exterior), como en el modal
  return { s, esTxt: entradas.map(queEs).join(" y "),
           opciones: entradas.map(e => { const tk = normalizarTicker(escrituraEn(s, e.m, e), e.m, bonos); return { mercado: e.m, tk, txt: `Pasar a ${MERCADO_NOM[e.m]} (${tk})` }; }) };
}

/* ── las sugerencias del catálogo debajo del símbolo ──
   Lista propia (role=listbox): flechas, Enter, Escape y clic. Elegir una
   completa el símbolo Y el mercado; es una elección explícita, así que el
   catálogo deja de cambiar el selector solo. La lista se pinta cuando el
   catálogo ya está; si todavía no, se pide y se pinta al llegar. */
function pedirSugerencias() {
  if (!_modal) return;
  if (_cat) { pintarSugerencias(); return; }
  const inp = $m("#mc-ticker");
  catalogo().then(() => { if (_modal && inp && document.activeElement === inp) pintarSugerencias(); });
}
function pintarSugerencias() {
  const inp = $m("#mc-ticker"), lst = $m("#mc-sug-l");
  if (!inp || !lst) return;
  const items = _cat ? sugerirCatalogo(inp.value, _cat.CATALOGO) : [];
  _modal.sug = { items, hl: -1 };
  lst.innerHTML = items.map((e, i) =>
    `<li role="option" id="mc-sug-${i}" data-i="${i}" aria-selected="false"><b>${esc(e.s)}</b> · ${esc(e.n)} · <span>${esc(tipoEn(e))}</span></li>`).join("");
  const abierta = items.length > 0 && document.activeElement === inp;
  lst.hidden = !abierta;
  inp.setAttribute("aria-expanded", String(abierta));
  inp.removeAttribute("aria-activedescendant");
}
function marcarSugerencia(i) {
  const s = _modal && _modal.sug, lst = $m("#mc-sug-l"), inp = $m("#mc-ticker");
  if (!s || !lst) return;
  s.hl = i;
  [...lst.children].forEach((li, j) => {
    li.classList.toggle("hl", j === i); li.setAttribute("aria-selected", String(j === i));
    if (j === i && li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
  });
  if (inp) { if (i >= 0) inp.setAttribute("aria-activedescendant", "mc-sug-" + i); else inp.removeAttribute("aria-activedescendant"); }
}
/* cierra la lista; dice si estaba abierta (Escape la cierra a ella y no al modal) */
function cerrarSugerencias() {
  const lst = $m("#mc-sug-l"), inp = $m("#mc-ticker");
  if (!lst || lst.hidden) return false;
  lst.hidden = true;
  if (inp) { inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); }
  if (_modal && _modal.sug) _modal.sug.hl = -1;
  return true;
}
function elegirSugerencia(i) {
  const e = _modal && _modal.sug && _modal.sug.items[i];
  const inp = $m("#mc-ticker"), sel = $m("#mc-mercado");
  if (!e || !inp) return;
  // la acción por clase va con guion en el exterior (BRK-B: así la resuelve el
  // sync y así ya está guardada en alguna cartera); en BYMA, como la lista BYMA
  inp.value = escrituraEn(e.s, e.m, e);
  if (sel) { sel.value = e.m; _modal.mercadoManual = true; _modal.mercadoAuto = null; }
  cerrarSugerencias();
  actualizarModal();
  const c = $m("[data-c-cant]");
  if (c) try { c.focus(); } catch (e2) {}
}

/* ══ el precio de referencia (lo que pidió Lauti el 25/09: "como Senta, le da
   la referencia") ══
   Debajo de "Se guarda como…": el último precio del activo y el cierre
   anterior, con la hora del dato; en los CEDEARs, además, de qué empresa es,
   el ratio y cuánto vale la acción allá. Es una REFERENCIA: no bloquea
   Guardar ni cambia lo que se guarda. "Usar este precio" solo completa un
   campo que el usuario ve y puede cambiar, y nunca pisa uno ya escrito.
   Las fuentes, en este orden (elegirPrecioRef):
   1) precios/{ticker}: el intradía lo reescribe cada 15 min en rueda, así que
      es el más fresco. Vale si es de HOY desde las 10:00 (antes de esa hora
      es la copia del cierre anterior que deja el sync de las 09:00), si el
      catálogo no dice que ese papel todavía no operó hoy y si el catálogo de
      hoy no se armó DESPUÉS (entonces el más fresco es el catálogo).
   2) preciosCatalogo/latest (precios_catalogo.py en fondo-sync): un mapa
      {TICKER: [p, pc, mon, fecha]} para todo el catálogo, que el intradía
      rehace una vez por hora en rueda y una vez después del cierre. Se lee
      UNA vez por apertura del modal y queda en memoria 10 minutos.
   3) la renta fija del panel de bonos (el mismo bonosPanel/latest que ya
      bajó bonosSet): precio cada 100 VN y variación del día.
   Sin ninguna: "Sin precio de referencia todavía…". Nada se estima ni se
   completa con otra cosa. */
const AR_MS = 3 * 3600e3;
const DESDE_RUEDA = 10 * 60;        // el intradía arranca a las 10:00 (precios_intradia.py)
const CIERRE_REF = 18 * 60 + 45;    // después, el catálogo guarda el cierre del día (precios_catalogo.py)
const DIAS_SEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/* un Timestamp de Firestore, una fecha ISO o milisegundos -> milisegundos (o null) */
function msDe(t) {
  if (t == null || t === "") return null;
  if (typeof t === "number") return isFinite(t) ? t : null;
  if (typeof t.toMillis === "function") { try { return t.toMillis(); } catch (e) { return null; } }
  if (t.seconds != null) return Number(t.seconds) * 1000 + Math.round(Number(t.nanoseconds || 0) / 1e6);
  const ms = Date.parse(t);
  return isFinite(ms) ? ms : null;
}
/* el día en la Argentina de un instante en milisegundos (diaAR, más arriba,
   recibe un Date: son dos funciones para no romper a quienes ya la usan) */
const diaMs = ms => new Date(ms - AR_MS).toISOString().slice(0, 10);
const minutosAR = ms => { const d = new Date(ms - AR_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const horaAR = ms => new Date(ms - AR_MS).toISOString().slice(11, 16);
/* "jueves 24" si fue en la última semana; si no, "12/09" */
function diaTxt(fecha, hoy) {
  const f = Date.parse(String(fecha || "").slice(0, 10) + "T12:00:00Z"), h = Date.parse(hoy + "T12:00:00Z");
  if (!isFinite(f)) return "";
  const d = new Date(f), dias = Math.round((h - f) / 86400e3);
  if (dias >= 1 && dias <= 6) return `${DIAS_SEM[d.getUTCDay()]} ${d.getUTCDate()}`;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* el precio redondeado como se muestra: de 1.000 para arriba sin decimales,
   de 1 a 1.000 con dos, debajo de 1 con cuatro cifras (cripto chica). "Usar
   este precio" completa ESTE número, el que la persona está leyendo. */
export function redondearRef(n) {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return null;
  if (v >= 1000) return Math.round(v);
  if (v >= 1) return Math.round(v * 100) / 100;
  return Number(v.toPrecision(4));
}
export function precioRefTxt(n, moneda) {
  const r = redondearRef(n);
  if (r == null) return "—";
  const txt = r >= 1000 ? r.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    : r >= 1 ? r.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : r.toLocaleString("es-AR", { maximumFractionDigits: 10 });
  return (moneda === "ARS" ? "$" : "US$") + txt;
}
/* cuánto cambió contra el cierre anterior, en por ciento; null sin él */
export function variacionRef(p, pc) {
  const a = Number(p), b = Number(pc);
  return a > 0 && b > 0 ? (a / b - 1) * 100 : null;
}
const varRef1 = v => Math.round(v * 10) / 10;
const varRefTxt = v => (varRef1(v) >= 0 ? "+" : "−") + Math.abs(varRef1(v)).toFixed(1).replace(".", ",") + "%";
/* "15:1" (quince CEDEARs son una acción) o "1:3" (un CEDEAR son tres), como la nómina */
export function ratioTxt(r) {
  const v = Number(r);
  if (!(v > 0)) return "";
  const n = x => Number(x.toFixed(2)).toLocaleString("es-AR", { maximumFractionDigits: 2, useGrouping: false });
  return v >= 1 ? `${n(v)}:1` : `1:${n(1 / v)}`;
}

/* la referencia de un ticker, de la fuente que corresponda (ver arriba). PURA:
   todo entra por parámetro. pdoc: precios/{tk} (o null); catalogo: { mapa,
   act } de preciosCatalogo/latest (o null); panel: bonosPanel/latest ya
   leído (o null). Devuelve { p, pc, moneda, fuente, deHoy, cuando, fecha }
   (fecha: el día del dato, "" si no se sabe), o null si no hay precio en
   ningún lado. */
export function elegirPrecioRef({ tk, pdoc = null, catalogo = null, panel = null, bonos = new Set(), ahora = Date.now() } = {}) {
  const t = String(tk || "").trim().toUpperCase();
  if (!t) return null;
  const hoy = diaMs(ahora);
  const esCripto = /-USD$/.test(t);
  const c = catalogo && catalogo.mapa ? catalogo.mapa[t] : null;
  const cOk = Array.isArray(c) && Number(c[0]) > 0 && (c[2] === "ARS" || c[2] === "USD");
  const cFecha = cOk && /^\d{4}-\d{2}-\d{2}$/.test(String(c[3] || "")) ? String(c[3]) : "";
  const act = cOk ? msDe(catalogo.act) : null;
  // 1) precios/{tk}: de hoy, desde que arranca la rueda, si el catálogo no
  //    dice que el papel todavía no operó hoy (feriado acá, o antes de que abra)
  //    y si el catálogo de hoy no es MÁS NUEVO: un doc que el intradía dejó de
  //    refrescar (nadie tiene ya ese ticker, o Yahoo le falló a ese papel)
  //    queda con el precio de la mañana, y el catálogo se rehace cada hora
  if (pdoc && !pdoc.sinDatos && Number(pdoc.precio) > 0 && (pdoc.moneda === "ARS" || pdoc.moneda === "USD")) {
    const ms = msDe(pdoc.actualizado_utc);
    const noOperoHoy = !esCripto && !!cFecha && cFecha < hoy;
    const catMasNuevo = ms != null && act != null && act > ms && (esCripto ? diaMs(act) === hoy : cFecha === hoy);
    if (ms != null && diaMs(ms) === hoy && minutosAR(ms) >= DESDE_RUEDA && !noOperoHoy && !catMasNuevo) {
      const p = Number(pdoc.precio), d = pdoc.d == null ? NaN : Number(pdoc.d);
      let pc = isFinite(d) && d > -100 ? p / (1 + d / 100) : null;
      // sin variación del día (la renta fija: escribir_precio_bono no la
      // escribe), el cierre anterior del catálogo si es de la misma rueda y
      // la misma moneda: es el mismo cierre, no una estimación
      if (pc == null && cOk && cFecha === hoy && c[2] === pdoc.moneda && Number(c[1]) > 0) pc = Number(c[1]);
      return { p, pc, moneda: pdoc.moneda, fuente: "precios", deHoy: true, cuando: `precio de las ${horaAR(ms)}`, fecha: hoy };
    }
  }
  // 2) preciosCatalogo/latest
  if (cOk) {
    let deHoy = false, cuando = "";
    if (esCripto) {
      // la cripto no cierra: el dato es el precio de cuando se armó el doc
      deHoy = act != null && diaMs(act) === hoy;
      if (act != null) cuando = deHoy ? `precio de las ${horaAR(act)}` : `precio del ${diaTxt(diaMs(act), hoy)} a las ${horaAR(act)}`;
    } else if (cFecha === hoy) {
      deHoy = true;
      cuando = act != null && diaMs(act) === hoy && minutosAR(act) < CIERRE_REF ? `precio de las ${horaAR(act)}` : "cierre de hoy";
    } else if (cFecha) {
      cuando = `cierre del ${diaTxt(cFecha, hoy)}`;
    }
    return { p: Number(c[0]), pc: Number(c[1]) > 0 ? Number(c[1]) : null, moneda: c[2], fuente: "catalogo", deHoy, cuando,
             fecha: esCripto ? (act != null ? diaMs(act) : "") : cFecha };
  }
  // 3) la renta fija del panel de bonos (cada 100 VN)
  const todos = panel && panel.todos;
  if (todos && esRentaFija(t, bonos)) {
    const esp = canon(t, bonos), b = todos[esp];
    if (b && Number(b.p) > 0) {
      const p = Number(b.p), v = b.v == null ? NaN : Number(b.v);
      // v = 0 no distingue "sin cambio" de "sin dato": sin cierre anterior, como en el pipeline
      return { p, pc: isFinite(v) && v !== 0 && v > -100 ? p / (1 + v / 100) : null,
               moneda: monedaProbable(esp, bonos), fuente: "panel", deHoy: false, cuando: "panel de bonos", fecha: "" };
    }
  }
  return null;
}

/* "Hoy: $33.460 · cierre anterior $32.862 (+1,8%) · precio de las 14:15".
   Si el dato no es de hoy arranca con "Último:"; sin cierre anterior, esa
   parte no va. unidad: " cada 100 VN" en la renta fija. html: los números en
   <b> y la variación con color (el modal); sin html, texto plano. PURA. */
export function lineaRef(ref, { unidad = "", html = false } = {}) {
  if (!ref || !(Number(ref.p) > 0)) return "";
  const b = x => html ? `<b>${x}</b>` : x;
  let s = `${ref.deHoy ? "Hoy" : "Último"}: ${b(precioRefTxt(ref.p, ref.moneda))}${unidad}`;
  if (Number(ref.pc) > 0) {
    s += ` · cierre anterior ${b(precioRefTxt(ref.pc, ref.moneda))}`;
    const v = variacionRef(ref.p, ref.pc);
    if (v != null) {
      const cls = varRef1(v) > 0 ? "mc-pos" : varRef1(v) < 0 ? "mc-neg" : "mc-mut";
      s += html ? ` <span class="${cls}">(${varRefTxt(v)})</span>` : ` (${varRefTxt(v)})`;
    }
  }
  if (ref.cuando) s += html ? ` · <small>${esc(ref.cuando)}</small>` : ` · ${ref.cuando}`;
  return s;
}

/* ── el CEDEAR: de qué empresa es, dónde cotiza el subyacente y el ratio ──
   Salen de la entrada del catálogo (r, u y b: ver _CEDEARS en
   catalogo-activos.js). b es la bolsa cuando NO es de EE.UU.: ahí no se dice
   "en EE.UU." ni se busca precio allá. */
const BOLSA_NOM = { B3: "B3, Brasil", XETRA: "Xetra, Alemania", FRA: "Fráncfort", LSE: "Londres", TSX: "Toronto",
                    EURONEXT: "Euronext", MIL: "Milán", SIX: "Zúrich", TSE: "Tokio", HKEX: "Hong Kong", BME: "Madrid",
                    OMX: "Nasdaq Nórdico" };
/* la clave del subyacente en preciosCatalogo (como la guarda la cartera en el
   exterior: AXP, BAC, BRK-B); "" si no es un CEDEAR o si no cotiza en EE.UU. */
export function claveSubyacente(e) {
  if (!e || e.t !== "cedear" || e.b) return "";
  return String(e.u || e.s || "").trim().toUpperCase().replace(/\./g, "-");
}
/* "Es el CEDEAR de American Express Co (AXP en EE.UU.) · ratio 15:1" */
export function lineaCedear(e, nombre) {
  if (!e || e.t !== "cedear") return "";
  // la clase con punto, como la ve quien opera allá (BRK.B)
  const sub = String(e.u || e.s || "").replace(/-/g, ".");
  const donde = e.b ? (BOLSA_NOM[e.b] || e.b) : "EE.UU.";
  return `Es el CEDEAR de ${nombre || e.n} (${sub} en ${donde})` + (Number(e.r) > 0 ? ` · ratio ${ratioTxt(e.r)}` : "");
}
/* "≈ US$336,55 la acción allá · al CCL, ≈ $33.476 por CEDEAR". precioUS: la
   fila [p, pc, mon, fecha] de preciosCatalogo para claveSubyacente(e); ccl:
   _fx.ccl. Sin precio en dólares, "": no se inventa. Sin CCL, sin la cuenta.
   hoy ("YYYY-MM-DD"): si el precio de allá es más viejo que el del CEDEAR
   (base: el día de ese precio; sin él, hoy) —feriado en EE.UU., o antes de
   que abra Nueva York— se dice de cuándo, para no compararlos callado. */
export function lineaSubyacente(e, precioUS, ccl, hoy = "", base = "") {
  if (!claveSubyacente(e) || !Array.isArray(precioUS) || !(Number(precioUS[0]) > 0) || precioUS[2] !== "USD") return "";
  const p = Number(precioUS[0]);
  const f = String(precioUS[3] || "");
  const deOtroDia = !!hoy && /^\d{4}-\d{2}-\d{2}$/.test(f) && f < (base || hoy);
  let s = `≈ ${precioRefTxt(p, "USD")} la acción allá` + (deOtroDia ? ` (cierre del ${diaTxt(f, hoy)})` : "");
  if (Number(ccl) > 0 && Number(e.r) > 0) s += ` · al CCL, ≈ ${precioRefTxt(p * Number(ccl) / Number(e.r), "ARS")} por CEDEAR`;
  return s;
}

/* "20 CEDEARs", "1.000 VN", "0,5 BTC", "3 acciones": lo que suman las compras
   que se están cargando, con la unidad del activo (Senta dice "nominales") */
export function posicionTxt(cant, e, tk, factor = 1) {
  const n = Number(cant);
  if (!(n > 0)) return "—";
  const c = n.toLocaleString("es-AR", { maximumFractionDigits: 8 });
  const t = e && e.t, uno = n === 1, k = String(tk || "").toUpperCase();
  if (factor !== 1 || t === "bono" || t === "letra" || t === "on") return `${c} VN`;
  if (t === "cedear") return `${c} ${uno ? "CEDEAR" : "CEDEARs"}`;
  if (t === "accion_ar" || t === "accion_us") return `${c} ${uno ? "acción" : "acciones"}`;
  if (t === "cripto" || /-USD$/.test(k)) return `${c} ${k.replace(/-USD$/, "") || (e && e.s) || ""}`.trim();
  return `${c} ${uno ? "nominal" : "nominales"}`;
}

/* a qué renglón va "Usar este precio": el primero con el precio vacío y la
   fecha de hoy o la del día del precio (diaRef: un "cierre del viernes" sirve
   para una compra del viernes). -1 si no hay: lo que el usuario escribió no se
   pisa nunca, y el precio de hoy no se le pone a una compra de otro día (sería
   un costo equivocado que nadie mira). PURA (filas: {fecha, pxTxt}). */
export function filaParaPrecio(filas, hoy, diaRef = "") {
  const dias = new Set([hoy, diaRef].filter(Boolean));
  return (filas || []).findIndex(f => !!f && dias.has(f.fecha) && !String(f.pxTxt ?? "").trim());
}
/* lo que "Usar este precio" escribe en el campo: el redondeado que se muestra,
   con coma decimal y sin puntos de miles (numIn), que parseNum lee igual
   ("33460", "336,55", "0,0001234"). "" si no hay precio. PURA. */
export function precioParaCampo(n) {
  const r = redondearRef(n);
  return r == null ? "" : numIn(r);
}

/* preciosCatalogo/latest: UNA lectura por apertura del modal y queda en
   memoria 10 minutos (se abre y se cierra varias veces seguidas al cargar
   una cartera). Una falla no queda guardada: la próxima apertura reintenta. */
const PCAT_TTL = 10 * 60e3;
let _pcat = null, _pcatProm = null;
function preciosCatalogoDoc() {
  if (_pcat && Date.now() - _pcat.leido < PCAT_TTL) return Promise.resolve(_pcat);
  if (!_pcatProm) {
    const p = (async () => {
      try {
        const s = await getDoc(doc(getFirestore(getApp()), "preciosCatalogo", "latest"));
        if (!s.exists()) return null;
        const d = s.data() || {};
        const mapa = JSON.parse(d.json || "{}");
        _pcat = { leido: Date.now(), mapa: mapa && typeof mapa === "object" ? mapa : {}, act: msDe(d.actualizado_utc) };
        return _pcat;
      } catch (e) { return null; }
    })();
    _pcatProm = p;
    // la promesa se suelta al terminar (bien o mal): la que sigue lee de nuevo o usa _pcat
    p.then(() => { if (_pcatProm === p) _pcatProm = null; });
  }
  return _pcatProm;
}
/* al abrir el modal: el mapa del catálogo y el panel de bonos (la misma
   promesa que ya pidió bonosSet: no es otra lectura) */
function cargarRefModal() {
  const m = _modal;
  if (!m) return;
  // si el doc ya está en memoria (menos de 10 min), se usa desde el primer pintado
  if (_pcat && Date.now() - _pcat.leido < PCAT_TTL) { m.pcat = _pcat; m.pcatEstado = "listo"; }
  else m.pcatEstado = "cargando";
  preciosCatalogoDoc().then(pc => {
    if (_modal !== m) return;
    m.pcat = pc; m.pcatEstado = pc ? "listo" : "sin";
    actualizarModal();
  });
  panelBonosDoc().then(p => { if (_modal === m && p) { m.panel = p; actualizarModal(); } }).catch(() => {});
}
/* precios/{tk} para la referencia: el que ya tiene la cartera (se refresca
   cada 2 min) o, si no, una lectura por ticker y por apertura, 350 ms después
   de la última tecla (no se lee cada letra), solo de un símbolo que existe
   (catálogo o renta fija) y en día hábil desde las 10:00, que es cuando puede
   ser de hoy. undefined mientras se pide; null si no hay. */
function precioDocRef(tk, r) {
  const m = _modal;
  if (!m) return null;
  // la espera es de UN símbolo (pdocTk): si el símbolo cambió o se borró, la
  // del anterior se cancela y no se lee un ticker que ya no está escrito; si
  // es el mismo sigue corriendo, así tipear la cantidad no la posterga
  if (m.pdocT && m.pdocTk !== tk) { clearTimeout(m.pdocT); m.pdocT = null; }
  if (!tk) return null;
  if (_precios[tk]) return _precios[tk];
  if (m.pdocs.has(tk)) return m.pdocs.get(tk);
  const ahora = Date.now(), dow = new Date(ahora - AR_MS).getUTCDay();
  const existe = !!r && (r.enCatalogo === true || esRentaFija(tk, _bonos));
  if (!existe || dow === 0 || dow === 6 || minutosAR(ahora) < DESDE_RUEDA) return null;
  if (!m.pdocT) {
    m.pdocTk = tk;
    m.pdocT = setTimeout(async () => {
      m.pdocT = null;
      if (_modal !== m || m.pdocs.has(tk)) return;
      m.pdocs.set(tk, undefined);
      let d = null;
      try {
        const s = await getDoc(doc(getFirestore(getApp()), "precios", tk));
        d = s.exists() ? s.data() : null;
      } catch (e) {}
      m.pdocs.set(tk, d);
      if (_modal === m && m.refTk === tk) actualizarModal();
    }, 350);
  }
  return undefined;
}
/* la caja de referencia, con lo que haya en este momento */
function pintarReferencia(ctx, r, nom) {
  const m = _modal, box = $m("#mc-ref");
  if (!m || !box) return;
  const { tk, moneda, factor } = ctx;
  m.refTk = tk; m.ref = null; m.refUsar = null;
  if (!tk || r.choque) {
    // sin símbolo que buscar: tampoco queda pendiente la lectura del anterior
    if (m.pdocT) { clearTimeout(m.pdocT); m.pdocT = null; }
    box.hidden = true; box.innerHTML = ""; m.refHtml = ""; return;
  }
  const e = r.entrada || null;
  const pdoc = precioDocRef(tk, r);
  const ref = elegirPrecioRef({ tk, pdoc: pdoc || null, catalogo: m.pcat, panel: m.panel || _panel, bonos: _bonos });
  const partes = [];
  const ced = lineaCedear(e, nom && nom.ok ? nom.txt : "");
  if (ced) partes.push(`<div class="mc-ref-l">${esc(ced)}</div>`);
  if (ref) {
    m.ref = ref;
    // el botón solo si el precio va en la moneda en que se guarda y hay un
    // renglón sin precio con la fecha de hoy (o la del precio)
    const i = ref.moneda === moneda ? filaParaPrecio(leerCompras(), hoyAR(), ref.fecha) : -1;
    // lo que completa el botón: el número que se está mostrando, en esa moneda
    if (i >= 0) m.refUsar = redondearRef(ref.p);
    partes.push(`<div class="mc-ref-p"><span>${lineaRef(ref, { unidad: factor !== 1 ? " cada 100 VN" : "", html: true })}</span>`
      + (i >= 0 ? `<button type="button" class="mc-sug-b" data-mc-usar>Usar este precio</button>` : "") + `</div>`);
  } else {
    const buscando = pdoc === undefined || m.pcatEstado === "cargando";
    // sin precio se dice que no hay, y nada se promete: si no está en el
    // catálogo, puede que Valtia tampoco lo encuentre después
    // (r.enCatalogo es null mientras el catálogo no cargó: ahí no se afirma nada)
    const fuera = r.enCatalogo === false && !esRentaFija(tk, _bonos);
    partes.push(`<div class="mc-ref-p"><span class="mc-mut">${buscando ? "Buscando el precio de referencia…"
      : fuera ? "Sin precio de referencia: no lo tenemos en el catálogo."
      : "Sin precio de referencia por ahora: cuando lo cargues, Valtia lo busca."}</span></div>`);
  }
  const k = claveSubyacente(e);
  const us = k && m.pcat && m.pcat.mapa ? lineaSubyacente(e, m.pcat.mapa[k], _fx && _fx.ccl, hoyAR(), ref && ref.fecha) : "";
  if (us) partes.push(`<div class="mc-ref-l">${esc(us)}</div>`);
  // se repinta solo si cambió: el modal se rehace en cada tecla y en cada
  // "change", y el "change" de la cantidad salta justo al tocar el botón (el
  // campo pierde el foco); si la caja se rehiciera ahí, el clic caería en un
  // botón que ya no existe y "Usar este precio" no haría nada
  const html = partes.join("");
  if (m.refHtml !== html) { box.innerHTML = html; m.refHtml = html; }
  box.hidden = false;
}

/* la línea del símbolo, el nombre y el resumen, en vivo. El precio promedio
   es el ponderado por cantidad —el mismo número que después muestran la fila
   y el desplegable— y va en la moneda del mercado elegido, que es la moneda
   en la que se guarda el precio. Con montoTxt() y no con money(): "Ocultar $"
   no puede tapar un número que la persona está tipeando en ese momento. El
   resumen usa lo parseado, así se ve cómo se interpretó "1.234,5". Guardar
   nunca se apaga: al tocarlo, guardarCompras dice qué falta. */
function actualizarModal() {
  if (!_modal) return;
  const sel = $m("#mc-mercado");
  const buscar = _cat ? buscarConCatalogo : null;
  let ctx = contextoModal();
  let r = resolverSimbolo(ctx.crudo, ctx.mercado, buscar, _bonos);
  const rehacer = () => { ctx = contextoModal(); r = resolverSimbolo(ctx.crudo, ctx.mercado, buscar, _bonos); };
  // el selector arranca con la preferencia; si el símbolo existe en UN solo
  // mercado y el usuario no tocó el selector en este modal, se cambia solo y
  // se dice. Si después el símbolo cambia y ya no es ese caso, vuelve el
  // mercado de antes (así "BTC" y después "NVDA" no deja Cripto puesto).
  if (sel && !_modal.mercadoManual) {
    const a = _modal.mercadoAuto;
    if (a && ctx.crudo !== a.crudo) {
      if (r.mercadosPosibles.length === 1 && r.mercadosPosibles[0] === a.a) { a.crudo = ctx.crudo; a.esTxt = r.esTxt; }
      else { sel.value = a.de; _modal.mercadoAuto = null; rehacer(); }
    }
    if (r.cambiarA && r.cambiarA !== ctx.mercado) {
      _modal.mercadoAuto = { de: _modal.mercadoAuto ? _modal.mercadoAuto.de : ctx.mercado, a: r.cambiarA, crudo: ctx.crudo, esTxt: r.esTxt };
      sel.value = r.cambiarA;
      rehacer();
    }
  }
  // lo que se guarda puede no ser lo tipeado tal cual (BRK.B → BRK-B, NVDA-USD
  // en BYMA → NVDA.BA): la línea, el nombre y la moneda van con esa escritura
  if (r.simbolo && r.simbolo !== ctx.crudo) ctx = contextoModal(r.simbolo);
  const { tk, moneda, factor } = ctx;
  const nom = nombreCatalogo(tk, r);
  const nEl = $m("#mc-nombre");
  if (nEl) { nEl.textContent = nom.txt; nEl.classList.toggle("ok", nom.ok); }
  const unidad = factor !== 1 ? "cada 100 VN" : "por unidad";
  const enQue = moneda === "ARS" ? "en pesos" : "en dólares";
  const g = $m("#mc-guarda");
  if (g) {
    const a = _modal.mercadoAuto;
    // el aviso de que el catálogo cambió el mercado dura mientras el símbolo sea ese
    const auto = a && a.crudo === ctx.crudo && a.a === ctx.mercado ? `${ctx.crudo} es ${a.esTxt}: pasé el mercado a ${MERCADO_NOM[a.a]}.` : "";
    const botones = !r.enCatalogo && r.sugerencias.length
      ? `<div class="mc-sug-bs">${r.sugerencias.map(sg => `<button type="button" class="mc-sug-b" data-mc-mercado="${sg.mercado}">${esc(sg.txt)}</button>`).join("")}</div>` : "";
    g.innerHTML = !tk ? "Escribilo como lo ves en tu broker."
      : r.choque ? `<span class="bad">${esc(r.choque)} Con ese mercado no se guarda.</span>${botones}`
      : (auto ? `<span class="warn">${esc(auto)}</span> ` : "")
        + (r.aviso ? `<span class="${r.enCatalogo ? "" : "warn"}">${esc(r.aviso)}</span> ` : "")
        + `Se guarda como <b>${esc(tk)}</b> · el precio va ${enQue}, ${unidad}.${botones}`;
  }
  // el precio de referencia (y en un CEDEAR, el ratio y la acción allá)
  pintarReferencia(ctx, r, nom);

  const todas = leerCompras();
  const val = todas.filter(c => isFinite(c.cant) && c.cant > 0);
  const negativa = todas.some(c => isFinite(c.cant) && c.cant < 0);
  const cant = val.reduce((s, c) => s + c.cant, 0);
  // una compra sin precio entra con precio 0, igual que siempre: suma cantidad
  // y no suma plata (la fila después avisa "sin precio de compra")
  const invertido = val.reduce((s, c) => s + c.cant * (isFinite(c.px) && c.px > 0 ? c.px : 0), 0);
  const sinPx = val.filter(c => !(isFinite(c.px) && c.px > 0)).length;
  const prom = cant > 0 && invertido > 0 ? invertido / cant : null;
  const pEl = $m("#mc-prom"), tEl = $m("#mc-tot"), posEl = $m("#mc-posic");
  // la posición que suman estas compras, con la unidad del activo (como Senta);
  // el precio promedio ya está en su propia línea, no se repite acá
  // (con un choque de mercado el ticker no existe: no se le pone unidad)
  if (posEl) posEl.textContent = r.choque ? posicionTxt(cant) : posicionTxt(cant, r.entrada, tk, factor);
  if (pEl) pEl.textContent = prom == null ? "—" : montoTxt(prom, moneda) + (factor !== 1 ? " / 100 VN" : "");
  if (tEl) tEl.textContent = invertido > 0 ? montoTxt(invertido * factor, moneda) : "—";
  const nota = $m("#mc-resnota");
  if (nota) {
    const partes = [];
    if (negativa) partes.push("Una cantidad es negativa: <b>las ventas se registran desde la fila del activo, con «Vendí»</b>, que es lo que deja el resultado guardado. Acá van solo las compras.");
    if (!negativa && sinPx) partes.push(`${sinPx === 1 ? "Una compra queda" : `${sinPx} compras quedan`} sin precio: se guardan igual, pero de esa parte no vamos a poder calcular el resultado.`);
    partes.push("El precio de hoy lo trae Valtia solo, no hace falta cargarlo: hasta que llegue, la posición queda sin precio y afuera del total.");
    nota.innerHTML = partes.join(" ");
    nota.classList.toggle("bad", negativa);
  }
  // con un solo renglón no se puede sacar el último: siempre queda uno para escribir
  const xs = [..._modal.el.querySelectorAll("[data-c-quitar]")];
  xs.forEach(x => { x.disabled = xs.length < 2; });
}

function agregarCompra(v) {
  const cont = $m("#mc-compras");
  if (!cont) return;
  const primera = !cont.children.length;
  cont.insertAdjacentHTML("beforeend", filaCompraHTML(hoyAR(), v));
  actualizarModal();
  // la primera fila no roba el foco: recién se abrió el modal y el cursor va al símbolo
  const i = !primera && cont.lastElementChild && cont.lastElementChild.querySelector("[data-c-cant]");
  if (i) try { i.focus(); } catch (e) {}
}

function engancharModal() {
  const el = _modal.el;
  el.querySelectorAll("[data-mc-cerrar]").forEach(b => b.onclick = () => cerrarModal());
  el.querySelectorAll(".mc-tab").forEach(t => t.onclick = () => {
    el.querySelectorAll(".mc-tab").forEach(x => {
      const on = x === t;
      x.classList.toggle("on", on);
      x.setAttribute("aria-pressed", String(on));
    });
    const imp = t.dataset.modo === "imp";
    el.querySelector("#mc-modo-uno").style.display = imp ? "none" : "block";
    el.querySelector("#mc-modo-imp").style.display = imp ? "block" : "none";
    // "Guardar" es del alta de a una; la planilla tiene su propio "Importar"
    const g = el.querySelector("#mc-add");
    if (g) g.hidden = imp;
    const f = el.querySelector(imp ? "#mc-paste" : "#mc-ticker");
    if (f) try { f.focus(); } catch (e) {}
  });
  const mas = el.querySelector("#mc-mas");
  if (mas) mas.onclick = () => agregarCompra();
  const ib = el.querySelector("#mc-imp-btn");
  if (ib) ib.onclick = revisarImport;
  const add = el.querySelector("#mc-add");
  if (add) add.onclick = guardarCompras;
  engancharBrokerSel(el);
  // el mercado tocado a mano: el catálogo deja de cambiarlo solo
  const sel = el.querySelector("#mc-mercado");
  if (sel) sel.addEventListener("change", () => { if (_modal) { _modal.mercadoManual = true; _modal.mercadoAuto = null; } });
  // los botones de un clic del choque ("Cargarlo en BYMA (NVDA.BA)"): cambian
  // el selector, y eso también cuenta como tocarlo a mano
  // lo que dijo Guardar ("falta la cantidad", el choque) se borra apenas se
  // cambia algo: el aviso era sobre lo que había, y al tocar de nuevo se rehace
  const limpiarMsg = () => { const m = el.querySelector("#mc-mdl-msg"); if (m) m.textContent = ""; };
  el.addEventListener("click", ev => {
    const b = ev.target && ev.target.closest && ev.target.closest("[data-mc-mercado]");
    if (!b || !sel || !_modal) return;
    sel.value = b.dataset.mcMercado; _modal.mercadoManual = true; _modal.mercadoAuto = null;
    limpiarMsg();
    actualizarModal();
  });
  // "Usar este precio": completa el precio vacío del renglón de hoy (o del
  // día del precio) con la referencia redondeada como se muestra. Nunca pisa
  // un precio ya escrito ni va a una compra de otra fecha, y es solo un campo
  // más: se puede cambiar antes de Guardar
  el.addEventListener("click", ev => {
    const u = ev.target && ev.target.closest && ev.target.closest("[data-mc-usar]");
    if (!u || !_modal || _modal.refUsar == null) return;
    const filas = leerCompras();
    const i = filaParaPrecio(filas, hoyAR(), _modal.ref && _modal.ref.fecha);
    const txt = precioParaCampo(_modal.refUsar);
    const inp = i >= 0 ? filas[i].fila.querySelector("[data-c-px]") : null;
    if (!inp || !txt || String(inp.value || "").trim()) return;
    inp.value = txt;
    limpiarMsg();
    actualizarModal();
    // el botón se va si ya no queda un renglón sin precio: el foco va al campo completado
    try { inp.focus(); } catch (e) {}
  });
  // el símbolo: sugerencias del catálogo mientras se escribe (flechas, Enter,
  // clic); Enter sin nada elegido lo da por escrito y pasa a la cantidad
  const tkIn = el.querySelector("#mc-ticker"), lst = el.querySelector("#mc-sug-l");
  if (tkIn) {
    tkIn.addEventListener("input", pedirSugerencias);
    tkIn.addEventListener("focus", pedirSugerencias);
    tkIn.addEventListener("blur", () => cerrarSugerencias());
    tkIn.addEventListener("keydown", ev => {
      const s = _modal && _modal.sug;
      const abierta = !!(s && s.items.length && lst && !lst.hidden);
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!abierta) { pedirSugerencias(); if (_modal.sug.items.length) marcarSugerencia(0); return; }
        marcarSugerencia((s.hl + (ev.key === "ArrowDown" ? 1 : -1) + s.items.length) % s.items.length);
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (abierta && s.hl >= 0) { elegirSugerencia(s.hl); return; }
        cerrarSugerencias();
        actualizarModal();
        const c = el.querySelector("[data-c-cant]");
        if (c) try { c.focus(); } catch (e) {}
      } else if (ev.key === "Tab") cerrarSugerencias();
    });
  }
  if (lst) {
    // mousedown con preventDefault: el clic en una opción no le saca el foco al campo
    lst.addEventListener("mousedown", ev => ev.preventDefault());
    lst.addEventListener("click", ev => { const li = ev.target.closest("[data-i]"); if (li) elegirSugerencia(Number(li.dataset.i)); });
    lst.addEventListener("mousemove", ev => {
      const li = ev.target.closest("[data-i]");
      if (li && _modal && _modal.sug && _modal.sug.hl !== Number(li.dataset.i)) marcarSugerencia(Number(li.dataset.i));
    });
  }
  // un solo escuchador para todo lo que se tipea: los renglones de compras
  // van y vienen, engancharlos de a uno se olvidaría de los nuevos
  el.addEventListener("input", ev => {
    if (ev.target && ev.target.closest && ev.target.closest("#mc-modo-uno")) { limpiarMsg(); actualizarModal(); }
  });
  el.addEventListener("change", ev => {
    if (ev.target && ev.target.closest && ev.target.closest("#mc-modo-uno")) { limpiarMsg(); actualizarModal(); }
  });
  el.addEventListener("click", ev => {
    const q = ev.target.closest && ev.target.closest("[data-c-quitar]");
    if (!q || q.disabled) return;
    const f = q.closest("[data-cmp]");
    if (f) { f.remove(); actualizarModal(); }
  });
  agregarCompra();
}

function abrirModal(prefill) {
  if (typeof document === "undefined" || !document.body) return false;
  asegurarEstilo();
  if (_modal) { prellenarModal(prefill); return true; }
  const volver = document.activeElement;
  const el = document.createElement("div");
  el.className = "mc-modal";
  el.id = "mc-modal";
  el.innerHTML = modalHTML();
  document.body.appendChild(el);
  const porTecla = ev => {
    if (!_modal) return;
    // con la lista de sugerencias abierta, Escape cierra la lista y no el modal
    if (ev.key === "Escape") { ev.preventDefault(); if (!cerrarSugerencias()) cerrarModal(); return; }
    if (ev.key === "Tab") atraparFoco(_modal.el, ev);
  };
  // mercadoManual: el usuario tocó el selector de mercado (el catálogo ya no lo
  // cambia solo); mercadoAuto: el cambio que hizo el catálogo, para decirlo y
  // para deshacerlo; sug: las sugerencias que se están mostrando bajo el símbolo
  // la referencia de precio: pcat (preciosCatalogo/latest) y su estado, el
  // panel de bonos, los precios/{tk} pedidos en esta apertura (pdocs) con su
  // espera entre teclas (pdocT, del símbolo pdocTk), y lo que se está
  // mostrando (ref, refTk, refUsar)
  _modal = { el, volver, porTecla, mercadoManual: false, mercadoAuto: null, sug: { items: [], hl: -1 },
             pcat: null, pcatEstado: "", panel: null, pdocs: new Map(), pdocT: null, pdocTk: "", ref: null, refTk: "", refUsar: null, refHtml: "" };
  document.addEventListener("keydown", porTecla, true);
  // tocar afuera cierra. Se piden las DOS mitades del clic sobre el velo: si
  // alguien selecciona texto adentro y suelta el botón afuera, no se le cierra
  // el modal con todo lo que escribió
  let desdeElVelo = false;
  el.addEventListener("mousedown", ev => { desdeElVelo = ev.target === el; });
  el.addEventListener("click", ev => { if (ev.target === el && desdeElVelo) cerrarModal(); });
  // antes del primer pintado, así arranca en "Buscando…" y no en "Sin precio"
  cargarRefModal();
  engancharModal();
  prellenarModal(prefill);
  // el catálogo (99 KB) se pide recién acá, una vez; cuando llega se rehace la
  // línea del símbolo (nombre, mercado, sugerencias)
  catalogo().then(() => { if (_modal) { actualizarModal(); const i = $m("#mc-ticker"); if (i && document.activeElement === i) pintarSugerencias(); } });
  // El Resumen abre el modal a los 50 ms de entrar a la pestaña: el panel de
  // bonos puede no haber llegado. Con el set vacío, un AL30D se anuncia "en
  // pesos" y después se guarda en dólares (guardarCompras espera el set de
  // verdad). Cuando llega, se rehace la nota para que digan lo mismo.
  if (!_bonos.size) bonosSet().then(s => {
    if (s && s.size && !_bonos.size) _bonos = s;
    actualizarModal();
  }).catch(() => {});
  return true;
}

/* el ticker que llega de la ficha de un activo (?agregar=NVDA) */
function prellenarModal(prefill) {
  if (!_modal) return;
  const sel = $m("#mc-mercado"), inp = $m("#mc-ticker");
  if (prefill && prefill.mercado && sel && MERCADOS.some(([k]) => k === prefill.mercado)) {
    sel.value = prefill.mercado;
    // la ficha ya dijo el mercado: cuenta como elegido, el catálogo no lo cambia solo
    if (_modal) { _modal.mercadoManual = true; _modal.mercadoAuto = null; }
  }
  if (prefill && prefill.ticker && inp) inp.value = prefill.ticker;
  const foco = (prefill && prefill.ticker) ? $m("[data-c-cant]") : inp;
  if (foco) try { foco.focus(); } catch (e) {}
  // el símbolo de la ficha viene entero: si el catálogo ya cargó, se ve enseguida
  actualizarModal();
}

function cerrarModal() {
  const m = _modal;
  if (!m) return;
  _modal = null;
  _porImportar = null;
  clearTimeout(m.pdocT);
  try { document.removeEventListener("keydown", m.porTecla, true); } catch (e) {}
  try { m.el.remove(); } catch (e) {}
  // el foco vuelve a donde estaba (el botón "+ Agregar posición" que lo abrió)
  const v = m.volver;
  if (v && v.isConnected && typeof v.focus === "function") { try { v.focus(); } catch (e) {} return; }
  const b = document.querySelector("[data-agregar]");
  if (b) try { b.focus(); } catch (e) {}
}

/* La abre el botón del encabezado del panel y window.__mcAbrirForm: sin
   argumento alterna, con true abre (el Resumen), con false cierra. */
export function abrirFormulario(abrir, prefill) {
  const quiere = abrir == null ? !_modal : !!abrir;
  if (!quiere) { cerrarModal(); return false; }
  if (!_user) return false;              // la pestaña todavía no arrancó
  return abrirModal(prefill);
}

async function revisarImport() {
  const ta = $m("#mc-paste");
  if (!ta) return;
  const txt = ta.value;
  const mercado = ($m("#mc-imp-mercado") || {}).value || "byma";
  const broker = brokerDe("mc-imp-broker");
  setPref("valtia-mc-mercado", mercado); if (broker) setPref("valtia-mc-broker", broker);
  const { filas, errores } = parseImport(txt);
  const prev = $m("#mc-prev");
  if (!prev) return;
  if (!filas.length) {
    prev.innerHTML = `<div class="mc-hint mc-bad">No pude leer ninguna posición.
      ${errores.slice(0, 4).map(esc).join("<br>")}</div>`;
    return;
  }
  const bonos = await bonosSet();
  // si cerraron el modal mientras se pedía el panel de bonos, no se revive la
  // vista previa: cerrarModal() ya vació _porImportar y tiene que quedar vacío
  if (!_modal || !prev.isConnected) return;
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
    <button type="button" class="mc-btn" id="mc-imp-ok" style="margin-top:12px">Importar ${filas.length} ${filas.length === 1 ? "posición" : "posiciones"}</button>`;
  const ok = $m("#mc-imp-ok");
  if (ok) ok.onclick = confirmarImport;
}

async function confirmarImport() {
  // se toman las filas y se vacían ANTES de grabar: un segundo clic no las duplica
  const filas = _porImportar;
  _porImportar = null;
  if (!filas || !filas.length) return;
  // el mail se fija ACÁ y no se vuelve a mirar _user adentro del bucle: si en el
  // medio se cambia de cuenta (reiniciarMiCartera), lo pegado por el usuario
  // anterior no puede terminar en la cartera del nuevo
  const email = _user && _user.email;
  if (!email) return;
  const btn = $m("#mc-imp-ok");
  if (btn) { btn.disabled = true; btn.textContent = "Importando…"; }
  const db = getFirestore(getApp());
  let ok = 0, fallo = 0;
  for (const f of filas) {
    if (!_user || _user.email !== email) break;
    try {
      const id = f.ticker + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
      await setDoc(doc(db, "inversores", email, "cartera", id), {
        ticker: f.ticker, cantidad: f.cantidad, precioCompra: f.precioCompra,
        fecha: f.fecha, broker: f.broker || "", moneda: f.moneda, factor: f.factor, creado: new Date().toISOString(),
      });
      ok++;
    } catch (e) { fallo++; }
  }
  // si entró aunque sea una, el modal cumplió y el mensaje va abajo, como
  // siempre; si no entró ninguna, queda abierto con el error a la vista
  const msgModal = $m("#mc-mdl-msg");
  if (ok) cerrarModal();
  // si mientras se importaba se cambió de cuenta, la pestaña ya es de otro
  // usuario (o no existe): ni se repinta ni se le escribe el mensaje encima
  if (!_el || !_user || _user.email !== email) return;
  try { await releer(); } catch (e) {}
  pintar();
  if (ok) avisarPanel();
  const texto = `<span style="color:var(--v3-up)">${ok} ${ok === 1 ? "posición importada" : "posiciones importadas"}.</span>` +
    (fallo ? ` <span style="color:var(--v3-dn)">${fallo} fallaron.</span>` : "") +
    ` <span style="color:var(--v3-mut)">Los precios llegan en la próxima actualización, en unos 15 minutos.</span>`;
  const destino = ok ? _el.querySelector("#mc-msg") : msgModal;
  if (destino && destino.isConnected) destino.innerHTML = texto;
}

/* cómo se nombra una compra que no entró, para poder decir cuál falló */
const compraTxt = c => cantTxt(c.cant) + (c.fecha ? " del " + fmtFecha(c.fecha) : " sin fecha");

/* Guarda la lista de compras: UN DOCUMENTO POR RENGLÓN, con la misma forma de
   siempre (ticker, cantidad, precioCompra, fecha, broker, moneda, factor).
   El id lleva un sufijo al azar además de la hora: dos renglones guardados en
   el mismo milisegundo compartirían id y el segundo pisaría al primero.
   Al panel se le avisa UNA sola vez, al final, y no una por compra. */
async function guardarCompras() {
  if (!_modal) return;
  const msg = $m("#mc-mdl-msg");
  const rojo = t => `<span style="color:var(--v3-dn)">${t}</span>`;
  const { mercado, crudo } = contextoModal();
  const broker = brokerDe("mc-broker");
  // Guardar nunca está apagado: acá se valida en orden (símbolo, choque de
  // mercado, cantidad, precio), se explica al lado del botón y se marca el
  // campo con el foco. Un choque (NVDA en Cripto: NVDA-USD no existe) no se guarda.
  const r = resolverSimbolo(crudo, mercado, _cat ? buscarConCatalogo : null, _bonos);
  const filas = leerCompras();
  const v = validarCompras(crudo, r.choque, filas);
  if (v.error) {
    if (msg) msg.innerHTML = rojo(esc(v.error));
    const campo = v.campo === "simbolo" ? $m("#mc-ticker") : v.campo === "mercado" ? $m("#mc-mercado")
      : (filas[v.i] && filas[v.i].fila.querySelector(v.campo === "px" ? "[data-c-px]" : "[data-c-cant]"));
    if (campo) try { campo.focus(); if (campo.select) campo.select(); } catch (e) {}
    return;
  }
  const compras = v.compras;
  // nunca se graba un documento sin ticker (validarCompras ya lo frena; esto es el cinturón)
  if (!normalizarTicker(r.simbolo || crudo, mercado, _bonos)) {
    if (msg) msg.innerHTML = rojo("El símbolo no se entiende: escribilo como lo ves en tu broker (GGAL, AL30, NVDA…).");
    const i = $m("#mc-ticker"); if (i) try { i.focus(); } catch (e) {}
    return;
  }
  // el mail se fija ANTES de cualquier await y es el que se usa para escribir:
  // si en el medio se cambia de cuenta (reiniciarMiCartera), las compras que
  // tipeó el usuario anterior no pueden caer en la cartera del nuevo
  const email = _user && _user.email;
  if (!email) {
    if (msg) msg.innerHTML = rojo("Se cerró la sesión: volvé a entrar y cargalas de nuevo.");
    return;
  }
  // un segundo clic mientras graba duplicaría las compras
  const btn = $m("#mc-add");
  if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = "Guardando…"; }
  try {
    const bonos = await bonosSet();
    // la misma escritura que anunció "Se guarda como" (r.simbolo): sin el
    // sufijo de otro mercado y, en las acciones por clase, la del catálogo
    const tk = normalizarTicker(r.simbolo || crudo, mercado, bonos);
    const moneda = monedaMercado(mercado, tk, bonos);
    const factor = bonos.has(tk) ? 0.01 : 1;
    setPref("valtia-mc-mercado", mercado); if (broker) setPref("valtia-mc-broker", broker);
    const db = getFirestore(getApp());
    let ok = 0, ultimo = null;
    const fallaron = [];
    for (const c of compras) {
      if (!_user || _user.email !== email) { fallaron.push(c); continue; }
      try {
        const id = tk + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
        // moneda y factor: el modal los sabe (mercado elegido). Sin ellos, hasta
        // la próxima corrida del sync una compra en pesos se lee en dólares
        await setDoc(doc(db, "inversores", email, "cartera", id), {
          ticker: tk, cantidad: c.cant, precioCompra: isFinite(c.px) && c.px > 0 ? c.px : 0,
          fecha: c.fecha || "", broker, moneda, factor, creado: new Date().toISOString(),
        });
        ok++;
      } catch (e) { fallaron.push(c); ultimo = e; }
    }
    if (!ok) {
      // sin `ultimo` no hubo error de Firestore: se cambió de cuenta en el medio
      if (msg && msg.isConnected) msg.innerHTML = rojo(ultimo
        ? `No se pudo guardar: ${esc(String(ultimo.message || ultimo).slice(0, 90))}`
        : "Se cerró la sesión antes de guardar: volvé a entrar y cargalas de nuevo.");
      return;
    }
    const donde = mercado === "byma" ? `BYMA, en ${moneda === "USD" ? "dólares" : "pesos"}` : mercado === "cripto" ? "cripto, en dólares" : "exterior, en dólares";
    cerrarModal();
    // la pestaña puede ser ya la de otra cuenta: no se repinta ni se le escribe
    if (!_el || !_user || _user.email !== email) return;
    try { await releer(); } catch (e) {}
    pintar();
    avisarPanel();
    // el repintado rehace la pestaña: el mensaje se escribe recién ahora
    const m2 = _el && _el.querySelector("#mc-msg");
    if (m2) m2.innerHTML = `<span style="color:var(--v3-up)">${esc(tk)} agregado (${donde}${broker ? ", " + esc(broker) : ""})${ok > 1 ? `, ${ok} compras` : ""}. El precio llega en la próxima actualización, en unos 15 minutos.</span>`
      + (fallaron.length ? " " + rojo(`De ${compras.length} compras entraron ${ok}: ${fallaron.length === 1 ? "quedó afuera" : "quedaron afuera"} ${esc(fallaron.map(compraTxt).join(" · "))}. ${fallaron.length === 1 ? "Cargala" : "Cargalas"} de nuevo.`) : "");
  } catch (e) {
    if (msg && msg.isConnected) msg.innerHTML = rojo(`No se pudo guardar: ${esc(String(e).slice(0, 90))}`);
  } finally {
    // si salió bien, el modal ya se cerró y este botón no existe más
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = "Guardar"; }
  }
}

/* ── ventas: formulario en la fila, registro atómico y deshacer ── */
function abrirVenta(id) {
  const viejo = _el.querySelector(".mc-vrow");
  if (viejo) { const era = viejo.dataset.para; viejo.remove(); if (era === id) return; }
  // la fila de la grilla (Panel v3): la del ACTIVO al que pertenece esta compra
  // (con varias compras la fila las junta y el desplegable las lista); el
  // formulario va al pie de esa posición, debajo de su desplegable si está abierto
  const filaId = (_vista && _vista.deCompra && _vista.deCompra[id]) || id;
  const tr = [..._el.querySelectorAll(".mc3-row[data-fila]")].find(x => x.dataset.fila === filaId);
  const p = _pos.find(x => x.id === id);
  if (!tr || !p) return;
  // ¿la fila tiene otras compras? entonces se aclara de cuál se vende
  const varias = filaId !== id;
  const cual = fmtFecha(p.fecha) !== "—" ? "del " + fmtFecha(p.fecha) : "sin fecha";
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
      <div><label>Cantidad vendida</label><input id="mc-v-cant" type="text" inputmode="decimal" autocomplete="off" value="${numIn(Number(p.cantidad) || "")}"></div>
      <div><label>Precio de venta · ${monNombre(moneda)}, ${unidad}</label><input id="mc-v-px" type="text" inputmode="decimal" autocomplete="off" value="${numIn(px && px.precio != null && isFinite(px.precio) ? +(px.precio >= 100 ? Number(px.precio).toFixed(2) : Number(px.precio).toPrecision(6)) : "")}"></div>
      <div><label>Fecha de la venta</label><input id="mc-v-fecha" type="date" max="${hoy}" value="${hoy}"></div>
      <div class="prev" id="mc-v-prev"></div>
      <div><button class="mc-btn" id="mc-v-ok">Registrar venta</button> <button class="mc-undo" id="mc-v-no">Cancelar</button></div>
      <div class="nota">${varias ? `Es la compra ${cual}${p.broker ? ", en " + esc(p.broker) : ""}, de ${cantTxt(p.cantidad)}: si vendiste más que eso, registrá el resto desde otra de tus compras. ` : ""}Tu costo en esta ${varias ? "compra" : "posición"}: <b>${costo ? (moneda ? money(costo, moneda) : num(costo, 2)) + " " + unidad + aprox(costo, moneda)
        : "sin precio de compra cargado, así que el resultado no se va a poder calcular"}</b>.
        ${px && px.precio != null ? "El precio viene con la última cotización: poné el que te pagaron." : ""}
        ${sync ? "Esta posición la trae el sync de tu broker: en la próxima corrida la cantidad se ajusta a lo que diga el broker." : ""}
        ${!moneda ? (px && px.sinDatos
          ? "<b>No encontramos este ticker</b>, así que no sabemos en qué moneda cotiza: revisá que esté bien escrito (quitalo desde «Ajustar» y volvé a cargarlo) para poder registrar la venta."
          : "<b>Todavía no tenemos la cotización de este activo</b>, así que no sabemos en qué moneda está: esperá a que llegue su precio (en la próxima actualización, en unos 15 minutos) para registrar la venta.") : ""}</div>
      <div class="mc-msg" id="mc-v-msg" style="flex-basis:100%;margin:0"></div>
    </div>`;
  (tr.closest(".mc3-pos") || tr.parentElement).appendChild(fila);
  if (!moneda) fila.querySelectorAll("input, #mc-v-ok").forEach(i => { i.disabled = true; });
  // campos de texto: parseNum entiende coma o punto decimal y miles con punto
  const leer = () => ({
    cant: parseNum(fila.querySelector("#mc-v-cant").value),
    precio: parseNum(fila.querySelector("#mc-v-px").value),
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
      const celdas = [..._el.querySelectorAll("[data-cantde]")];
      const celda = celdas.find(x => x.dataset.cantde === p.id);
      if (celda && p2) celda.textContent = cantFmt(p2.cantidad) + (esRF ? " VN" : "");
      // si la fila junta varias compras, su cantidad total también se pone al día
      const filaId = _vista && _vista.deCompra ? _vista.deCompra[p.id] : null;
      if (filaId && filaId !== p.id) {
        const tot = _pos.filter(x => _vista.deCompra[x.id] === filaId).reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
        const ct = celdas.find(x => x.dataset.cantde === filaId);
        if (ct) ct.textContent = cantFmt(tot) + (esRF ? " VN" : "");
      }
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
  // campos de texto: parseNum entiende coma o punto decimal ("0,5" ya no vale 0)
  return { a, px, esRF, moneda: monedaFactor(a.pos || {}, px, esRF, a.ticker).moneda,
           cant: parseNum(card.querySelector("[data-aj-cant]").value),
           precio: parseNum(card.querySelector("[data-aj-px]").value),
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
   viene en la URL (?agregar=NVDA); se abre el modal UNA vez, con el mercado que
   corresponde a la ficha (dólares), y el cursor queda en la cantidad */
function prellenarDesdeUrl() {
  let tk = "";
  try { tk = (new URLSearchParams(location.search).get("agregar") || "").trim().toUpperCase().slice(0, 12); } catch (e) {}
  if (!tk || !/^[A-Z0-9.\-]+$/.test(tk)) return;
  abrirFormulario(true, { ticker: tk, mercado: /^(BTC|ETH)(-USD)?$/.test(tk) ? "cripto" : "ext" });
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

/* ── "Pasar a BYMA (NVDA.BA)": la posición estaba guardada con el sufijo de
   otro mercado (filaRota). Se actualiza CADA compra de ese activo —todas las
   que tienen ese ticker, en cualquier broker— con el ticker nuevo, la moneda
   del mercado (pesos en BYMA salvo la renta fija en dólares; dólares en el
   exterior y en cripto) y factor 1. El mail se fija ANTES del primer await y
   se verifica después de cada uno, como en guardarCompras: si en el medio se
   cambia de cuenta, no se escribe nada en la del nuevo. ── */
async function pasarMercado(ticker, mercado, btn) {
  if (!MERCADOS.some(([k]) => k === mercado)) return;
  const viejo = String(ticker || "").trim().toUpperCase();
  const compras = _pos.filter(p => String(p.ticker || "").toUpperCase() === viejo);
  const email = _user && _user.email;
  if (!viejo || !compras.length || !email) return;
  const s = _cat ? _cat.claveCatalogo(viejo) : base(viejo);
  // el mismo ticker que anunció el botón (filaRota): la escritura del catálogo en ese mercado
  const tk = normalizarTicker(escrituraEn(s, mercado, _cat ? _cat.buscarCatalogo(s, mercado) : null), mercado, _bonos);
  const moneda = monedaMercado(mercado, tk, _bonos);
  const factor = _bonos.has(tk) ? 0.01 : 1;
  if (!tk) return;
  // el precio de compra NO se convierte: si la posición estaba en dólares y
  // pasa a pesos (NVDA-USD → NVDA.BA), el número queda y ahora se lee en pesos.
  // Se avisa, porque el costo y el resultado salen de ahí.
  const nomMon = m => m === "ARS" ? "pesos" : "dólares";
  const cambiaMoneda = compras.some(c => Number(c.precioCompra) > 0 && (c.moneda || monedaProbable(c.ticker, _bonos)) !== moneda);
  if (btn) { btn.disabled = true; btn.textContent = "Pasando…"; }
  const db = getFirestore(getApp());
  let ok = 0, fallo = 0;
  for (const c of compras) {
    if (!_user || _user.email !== email) { fallo++; continue; }
    try { await updateDoc(doc(db, "inversores", email, "cartera", c.id), { ticker: tk, moneda, factor }); ok++; }
    catch (e) { fallo++; }
  }
  // la pestaña puede ser ya la de otra cuenta: no se repinta ni se le escribe
  if (!_el || !_user || _user.email !== email) return;
  try { await releer(); } catch (e) {}
  pintar();
  if (ok) avisarPanel();
  // el repintado rehace la pestaña: el mensaje se escribe recién ahora
  const m = _el.querySelector("#mc-msg");
  if (!m) return;
  m.innerHTML = ok
    ? `<span style="color:var(--v3-up)">Listo: ${esc(viejo)} pasó a ${esc(tk)}${ok > 1 ? ` (${ok} compras)` : ""}. El precio llega en la próxima actualización, en unos 15 minutos.</span>`
      + (cambiaMoneda ? ` <span style="color:var(--v3-warn)">El precio de compra quedó como lo cargaste y ahora se lee en ${nomMon(moneda)}: si lo que pagaste estaba en ${nomMon(moneda === "ARS" ? "USD" : "ARS")}, quitá la posición desde «Ajustar» y cargala de nuevo con el precio en ${nomMon(moneda)}.</span>` : "")
      + (fallo ? ` <span style="color:var(--v3-dn)">${fallo} ${fallo === 1 ? "compra no se pudo pasar" : "compras no se pudieron pasar"}: probá de nuevo.</span>` : "")
    : `<span style="color:var(--v3-dn)">No se pudo pasar ${esc(viejo)} a ${esc(tk)}: probá de nuevo en un momento.</span>`;
}

/* Cambio de cuenta sin recargar la página: el módulo sobrevive y estas
   variables todavía tienen las posiciones, las ventas y los avisos del usuario
   anterior. Las llama el panel apenas detecta que cambió el mail. */
export function reiniciarMiCartera() {
  // el modal puede tener a medio cargar una compra de la cuenta anterior
  cerrarModal();
  _el = null; _user = null; _pos = []; _precios = {}; _ventas = []; _ajustes = [];
  _porImportar = null; _listo = { email: null, p: null };
  // el desplegable guarda informes, noticias y eventos de la cuenta anterior
  _vista = null; _abierta = null; _ajAbierto = null; _pendiente = null; _detCache = {};
  // la alerta a medio escribir y las ya leídas ("Tenés N alertas…") son de la cuenta anterior
  olvidarAlerta(); _alSabidas = { email: null, por: {} }; _alCreando = null;
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
    olvidarAlerta(); _alSabidas = { email: null, por: {} }; _alCreando = null;
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
        // modal de alta abierto = el usuario está cargando compras o armando el
        // paste de la planilla: no se toca nada hasta que lo cierre
        if (_modal) return;
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
