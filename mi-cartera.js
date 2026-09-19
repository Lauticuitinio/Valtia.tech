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
import { base, linkDe, esRentaFija, parBono, sectorDe, mercadoDe, desglose, monedaProbable } from './activos.js?v=6';
import { simular, serieReal, combinar, recortar, resumen, serieDe } from './evolucion.js?v=2';
import { validarVenta, armarVenta, planDeshacer, resultadoVenta, resumenVentas, tenencia, monedaFactor,
         cantidadAjuste, validarAjuste, ventaDesdeAjuste, ajusteDesdeVenta, restoDeAjuste }
  from './ventas.js?v=6';

const STYLE = `
.mc-wrap{width:100%}
.mc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.mc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:22px}
.mc-k{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
.mc-k .l{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.mc-k .v{font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1;color:var(--text)}
.mc-k .s{font-size:11px;color:var(--muted);margin-top:5px}
.mc-pos{color:#4caf50}.mc-neg{color:#ef5350}.mc-mut{color:var(--muted)}
.mc-tblwrap{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow-x:auto}
.mc-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:820px}
.mc-tbl th{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  padding:11px 12px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;cursor:pointer;user-select:none}
.mc-tbl th:first-child,.mc-tbl th.l{text-align:left}
.mc-tbl th:hover{color:var(--text)}
.mc-tbl td{padding:11px 12px;border-bottom:.5px solid var(--border);color:var(--text);text-align:right;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.mc-tbl td.l{text-align:left}
.mc-tbl tr:last-child td{border-bottom:none}
.mc-tbl tr:hover td{background:rgba(184,151,90,.05)}
.mc-tk{font-weight:700;color:var(--gold)}
.mc-nm{display:block;font-size:11px;color:var(--muted);font-weight:400}
.mc-orig{display:block;font-size:10.5px;color:var(--muted);font-weight:400}.mc-orig.il{display:inline;font-size:inherit}
.mc-ver{font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:4px;white-space:nowrap}
.mc-ver.infra{color:#4caf50;background:rgba(76,175,80,.12)}
.mc-ver.precio{color:var(--gold);background:rgba(184,151,90,.14)}
.mc-ver.cara{color:#ef5350;background:rgba(239,83,80,.12)}
.mc-ver.sin{color:var(--muted);background:rgba(120,130,140,.12)}
.mc-del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:15px;line-height:1;padding:2px 6px}
.mc-vend{background:none;border:1px solid var(--border);color:var(--sub);cursor:pointer;font-size:10px;font-weight:600;
  letter-spacing:.06em;text-transform:uppercase;border-radius:5px;padding:3px 8px;margin-right:4px}
.mc-vend:hover{border-color:var(--gold);color:var(--gold)}
.mc-vrow td{background:rgba(184,151,90,.06)!important;text-align:left!important;white-space:normal!important}
.mc-vform{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:4px 0}
.mc-vform label{display:block;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.mc-vform input{padding:7px 9px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;width:140px}
.mc-vform .prev{font-size:12.5px;color:var(--sub);align-self:center;min-width:200px}
.mc-vform .nota{flex-basis:100%;font-size:11.5px;color:var(--muted);line-height:1.5}
.mc-ventas{margin-top:26px}
.mc-ventas h4{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;color:var(--text);margin:0 0 4px}
.mc-ventas .sub{font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.6;max-width:780px}
.mc-ventas .mc-tbl{min-width:720px}
.mc-ventas .mc-tbl th{cursor:default}
.mc-undo{background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;text-decoration:underline;padding:0}
.mc-undo:hover{color:var(--gold)}
.mc-aj{background:rgba(224,169,62,.08);border:1px solid rgba(224,169,62,.45);border-left:3px solid #E0A93E;border-radius:8px;padding:12px 16px;margin-bottom:14px}
.mc-aj .t{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.mc-aj p{margin:4px 0 8px;font-size:13.5px;color:var(--text);line-height:1.5}
.mc-btn.sec{background:transparent;color:var(--gold);border:1px solid var(--gold)}
.mc-btn-mini{padding:7px 12px;font-size:10.5px}
.mc-del:hover{color:#ef5350}
.mc-form{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:20px}
.mc-form .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;align-items:end}
.mc-form label{display:block;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
.mc-form input{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid var(--border);
  border-radius:6px;color:var(--text);font-family:'Jost',sans-serif;font-size:14px;outline:none}
[data-theme="light"] .mc-form input{background:var(--bg3)}
.mc-form input:focus{border-color:var(--gold)}
.mc-btn{font-family:'Jost',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  color:var(--navy);background:var(--gold);border:none;padding:11px 22px;border-radius:5px;cursor:pointer}
.mc-btn:hover{background:var(--gold2)}
.mc-msg{font-size:12px;margin-top:10px}
.mc-empty{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:34px 28px;text-align:center}
.mc-empty h4{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;color:var(--text);margin-bottom:8px}
.mc-empty p{font-size:13px;color:var(--sub);line-height:1.7;max-width:520px;margin:0 auto}
.mc-foot{font-size:11px;color:var(--muted);line-height:1.7;margin-top:14px}
.mc-an{margin-top:26px}
.mc-an h4{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:var(--text);margin:0 0 4px}
.mc-an .sub{font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:16px}
.mc-angrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.mc-anbox{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
.mc-anbox .t{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.mc-bar{display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:12.5px}
.mc-bar .n{flex:none;width:104px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-bar .t2{flex:1;height:7px;border-radius:4px;background:rgba(120,130,140,.16);overflow:hidden}
.mc-bar .t2 i{display:block;height:100%;background:var(--gold);border-radius:4px}
.mc-bar .p{flex:none;width:46px;text-align:right;color:var(--sub);font-variant-numeric:tabular-nums}
.mc-anbox .nota{font-size:11.5px;color:var(--muted);line-height:1.6;margin-top:10px}
.mc-alerta{background:rgba(224,169,62,.08);border:1px solid rgba(224,169,62,.4);border-left:3px solid #E0A93E;
  border-radius:0 8px 8px 0;padding:11px 14px;font-size:12.5px;color:var(--sub);line-height:1.6;margin-top:12px}
.mc-rf{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
.mc-rf th{font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);padding:7px 8px;
  border-bottom:1px solid var(--border);text-align:right;white-space:nowrap}
.mc-rf th:first-child,.mc-rf td:first-child{text-align:left}
.mc-rf td{padding:7px 8px;border-bottom:.5px solid var(--border);color:var(--text);text-align:right;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.mc-rf tr:last-child td{border-bottom:none}
.mc-lect{background:var(--card);border:1px solid var(--border);border-left:3px solid var(--gold);
  border-radius:0 10px 10px 0;padding:14px 18px;margin-top:18px;font-size:13px;color:var(--sub);line-height:1.7}
.mc-lect b{color:var(--text)}
.mc-tabs{display:flex;gap:8px;margin-bottom:14px}
.mc-tab{font-family:'Jost',sans-serif;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer}
.mc-tab.on{background:var(--gold);border-color:var(--gold);color:var(--navy)}
.mc-imp textarea{width:100%;min-height:120px;padding:12px;background:rgba(255,255,255,.05);border:1px solid var(--border);
  border-radius:6px;color:var(--text);font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12.5px;outline:none;resize:vertical}
[data-theme="light"] .mc-imp textarea{background:var(--bg3)}
.mc-imp textarea:focus{border-color:var(--gold)}
.mc-hint{font-size:11.5px;color:var(--muted);line-height:1.7;margin:8px 0 12px}
.mc-prev{margin-top:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.mc-prev table{width:100%;border-collapse:collapse;font-size:12.5px}
.mc-prev th{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:8px 10px;
  border-bottom:1px solid var(--border);text-align:left}
.mc-prev td{padding:8px 10px;border-bottom:.5px solid var(--border);color:var(--text)}
.mc-prev tr:last-child td{border-bottom:none}
.mc-bad{color:#ef5350}
.mc-live{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted)}
.mc-dot{width:6px;height:6px;border-radius:50%;background:#4caf50;display:inline-block}
.mc-cur{display:flex;gap:0;border:1px solid var(--border);border-radius:7px;overflow:hidden}
.mc-cur button{font-family:'Jost',sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.06em;
  padding:7px 13px;border:none;background:transparent;color:var(--muted);cursor:pointer;white-space:nowrap}
.mc-cur button+button{border-left:1px solid var(--border)}
.mc-cur button.on{background:var(--gold);color:var(--navy)}
.mc-curwrap{display:flex;flex-direction:column;align-items:flex-end;gap:7px}
.mc-form select{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid var(--border);
  border-radius:6px;color:var(--text);font-family:'Jost',sans-serif;font-size:13.5px;outline:none}
[data-theme="light"] .mc-form select{background:var(--bg3)}
.mc-form select:focus{border-color:var(--gold)}
.mc-grp td{background:rgba(184,151,90,.07);font-size:12px;color:var(--text);padding:9px 12px;text-align:left;
  border-top:1px solid var(--border);white-space:normal}
.mc-grp td b{color:var(--gold);letter-spacing:.06em;text-transform:uppercase;font-size:11px}
.mc-grp td span{color:var(--muted);margin-left:8px}
.mc-brk{display:inline-block;font-size:9.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;
  color:var(--muted);border:1px solid var(--border);border-radius:4px;padding:1px 6px;margin-top:4px;cursor:pointer}
.mc-brk:hover{color:var(--gold);border-color:var(--gold)}
.mc-brk-in{font:400 12px 'Jost',sans-serif;padding:3px 6px;background:var(--bg3);border:1px solid var(--gold);
  border-radius:4px;color:var(--text);width:120px;outline:none}
.mc-brks{display:flex;gap:8px;flex-wrap:wrap;margin:-8px 0 18px}
.mc-evo{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin:0 0 22px}
.mc-evo-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.mc-evo-t{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.mc-evo-r{font-size:13.5px;margin-top:6px;line-height:1.55}
.mc-evo-rg{display:flex;gap:4px}
.mc-evo-rg button{font-size:11px;font-weight:600;padding:4px 10px;border:1px solid var(--border);background:transparent;color:var(--muted);border-radius:6px;cursor:pointer}
.mc-evo-rg button.on{background:var(--gold);border-color:var(--gold);color:#0E1830}
.mc-evo-box{position:relative;height:240px}
.mc-evo-ley{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);margin-top:8px}
.mc-evo-ley i{display:inline-block;width:18px;height:0;border-top:2px solid;vertical-align:middle;margin-right:5px}
.mc-evo-nota{font-size:11.5px;color:var(--muted);line-height:1.6;margin-top:8px}
.mc-brks .b{font-size:12px;color:var(--sub);border:1px solid var(--border);border-radius:999px;padding:4px 11px}
.mc-brks .b b{color:var(--text)}
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
   se reconocen contra el panel de bonos y quedan tal cual. */
export function normalizarTicker(ticker, mercado, bonosSet = new Set()) {
  const t = String(ticker || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!t) return "";
  if (mercado === "byma") return (t.endsWith(".BA") || bonosSet.has(t)) ? t : t + ".BA";
  if (mercado === "cripto") return t.endsWith("-USD") ? t : t + "-USD";
  return t;
}

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
             peso: total > 0 ? valor / total * 100 : null };
  }).sort((a, b) => b.valor - a.valor || a.broker.localeCompare(b.broker));
}

let _bonosSet = null;
async function bonosSet() {
  if (_bonosSet) return _bonosSet;
  _bonosSet = new Set();
  try {
    const snap = await getDoc(doc(getFirestore(getApp()), "bonosPanel", "latest"));
    if (snap.exists()) _bonosSet = new Set(Object.keys(JSON.parse(snap.data().json || "{}").todos || {}));
  } catch (e) {}
  return _bonosSet;
}

const money = (n, cur) => (Number(n) < 0 ? "−" : "") + (cur === "ARS" ? "$" : "US$") +
  Math.abs(Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: Math.abs(n) < 1000 ? 2 : 0 });
// con signo explícito (para resultados): +US$930 / −US$160
const moneyS = (n, cur) => (Number(n) >= 0 ? "+" : "") + money(n, cur);

/* el panel (panel.js) cachea la cartera: cuando cambia acá, se le avisa */
function avisarPanel() {
  try { if (window.valtiaPanel && window.valtiaPanel.refrescar) window.valtiaPanel.refrescar(); } catch (e) {}
}

/* ── moneda de visualización (como el portafolio de IOL) ──
   Las posiciones se guardan en la moneda en la que cotizan (los CEDEARs y
   acciones locales en pesos, las de EE.UU. en dólares) y acá se convierten
   a lo que el usuario elija: pesos, dólar CCL o dólar MEP. */
let _fx = { ccl: null, mep: null };
let _cur = (typeof localStorage !== "undefined" && localStorage.getItem("valtia-mc-cur")) || "ARS";

export function convertir(valor, monedaOrigen, display, fx) {
  if (valor == null) return null;
  const tasa = display === "CCL" ? fx.ccl : display === "MEP" ? fx.mep : null;
  if (display === "ARS") {
    // para pasar dólares a pesos se usa el CCL, que es la referencia de equity
    return monedaOrigen === "ARS" ? valor : (fx.ccl ? valor * fx.ccl : null);
  }
  if (!tasa) return null;
  return monedaOrigen === "ARS" ? valor / tasa : valor;
}

const curLabel = () => (_cur === "ARS" ? "ARS" : "USD");

/* ventas y avisos: lo que se CARGA va en la moneda en que cotiza el activo
   (la que muestra el broker) y lo que se MUESTRA va en la moneda elegida
   arriba, con el importe original abajo. Sin dólar para convertir, queda en su
   moneda. enLinea: el original entre paréntesis, para textos corridos. */
const monNombre = m => m === "ARS" ? "en pesos ($)" : m === "USD" ? "en dólares (US$)" : "moneda sin confirmar";
function enVista(valor, moneda, signo = false, enLinea = false) {
  const f = signo ? moneyS : money;
  if (valor == null || !moneda) return "—";
  const cur = curLabel();
  const c = moneda === cur ? null : convertir(valor, moneda, _cur, _fx);
  if (c == null || !isFinite(c)) return f(valor, moneda);
  const orig = f(valor, moneda);
  return f(c, cur) + (enLinea ? ` <span class="mc-orig il">(${orig})</span>` : `<span class="mc-orig">${orig}</span>`);
}
/* "(≈ US$4,13 al CCL de hoy)": el formulario se llena en la moneda del activo */
function aprox(valor, moneda, signo = false) {
  const cur = curLabel();
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

export function calcular(posiciones, precios, cur = _cur, fx = _fx, bonos = _bonos) {
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
    return { ...p, px, moneda, actual, costo, valor,
             dCompra: c(Number(p.precioCompra) || 0), dActual: c(actual),
             dCosto, dValor, dPl,
             plPct: (valor != null && costo > 0) ? (valor - costo) / costo * 100 : null };
  });
  const total = filas.reduce((s, f) => s + (f.dValor ?? 0), 0);
  const costoTot = filas.reduce((s, f) => s + (f.dValor != null ? (f.dCosto ?? 0) : 0), 0);
  const plTot = total - costoTot;
  filas.forEach(f => { f.peso = total > 0 && f.dValor != null ? f.dValor / total * 100 : null; });
  return { filas, total, costoTot, plTot,
           plTotPct: costoTot > 0 ? plTot / costoTot * 100 : null };
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
  const corto = f => base(f.ticker);
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
  const pesoMayor = mayor.dValor / total * 100;

  const alerta = pesoMayor > 25
    ? `<div class="mc-alerta"><b>${esc(base(mayor.ticker))}</b> pesa el <b>${pesoMayor.toFixed(0)}%</b> de tu cartera.
       Es una concentración alta: lo que le pase a ese activo mueve la cartera entera.</div>` : "";

  return `<div class="mc-an">
    <h4>Análisis de tu cartera</h4>
    <div class="sub">Cómo está repartido lo que tenés, sumando todos tus brokers. Calculado sobre
      ${con.length} de ${r.filas.length} posiciones (las que ya tienen precio).</div>
    <div class="mc-angrid">
      ${barras("Por moneda", porMoneda, total,
        porMoneda.length > 1 ? "El % en pesos es tu exposición al peso, aunque lo mires en dólares." : "")}
      ${barras("Por mercado", porMercado, total, "")}
      ${barras("Por broker", porBroker, total,
        porBroker.some(b => b.n === "Sin broker") ? "Poné el broker desde la tabla de arriba para completar el reparto." : "")}
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
    ${alerta}
  </div>`;
}

/* Renta fija: qué rinde cada especie y qué vas a cobrar en los próximos meses */
function analisisRentaFija(r, bonos, panel, flujos, hoy) {
  const rf = r.filas.filter(f => esRentaFija(f.ticker, bonos));
  if (!rf.length) return "";
  const sob = [...(panel.soberanos || []), ...(panel.bopreal || [])];
  const filas = rf.map(f => {
    const esp = base(f.ticker), par = parBono(esp);
    const b = sob.find(x => x.s === esp) || sob.find(x => parBono(x.s) === par && /D$/.test(x.s));
    const l = (panel.tasa_fija || []).find(x => x.s === esp);
    const tasa = b && b.tir != null ? `TIR ${b.tir.toFixed(1).replace(".", ",")}%`
               : l && l.tem != null ? `TEM ${l.tem.toFixed(2).replace(".", ",")}%` : "—";
    const vence = (b && b.vence) || (l && l.vence) || "";
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
  });
  cobros.sort((a, b) => a.f.localeCompare(b.f));
  const totalUsd = cobros.reduce((s, c) => s + (c.usd || 0), 0);
  return `<div class="mc-anbox" style="grid-column:1/-1">
    <div class="t">Tu renta fija</div>
    <table class="mc-rf"><thead><tr><th>Especie</th><th>Nominales</th><th>Tasa</th><th>Paridad</th><th>Vence</th></tr></thead>
      <tbody>${filas}</tbody></table>
    ${cobros.length ? `<div class="nota"><b>Próximos 90 días:</b> ${cobros.slice(0, 4).map(c =>
        `${c.tk} el ${c.f.slice(8, 10)}/${c.f.slice(5, 7)}${c.usd ? ` (~US$${Math.round(c.usd).toLocaleString("es-AR")})` : ""}`).join(" · ")}${cobros.length > 4 ? ` y ${cobros.length - 4} más` : ""}.
      ${totalUsd > 0 ? `Total estimado a cobrar: <b>US$${Math.round(totalUsd).toLocaleString("es-AR")}</b>.` : ""}
      Son estimaciones sobre los nominales que tenés cargados.</div>`
      : `<div class="nota">Sin pagos previstos en los próximos 90 días.</div>`}
  </div>`;
}

let _orden = { col: "dValor", desc: true };

/* los estilos se aseguran acá (y no solo al iniciar) para que cualquier
   render —incluido uno con datos de prueba— se vea igual que en producción */
function asegurarEstilo() {
  if (typeof document === "undefined" || document.getElementById("mc-style")) return;
  const st = document.createElement("style");
  st.id = "mc-style";
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
          ${a.tipo === "desaparecio" ? `Si la pasaste a otro broker o ${esc(a.broker)} no la mostró ese día, "La sigo teniendo" la devuelve a tu cartera con su costo (si la transferiste, después cambiale el broker en la fila). Si vendiste solo una parte, poné esa cantidad: el resto queda preguntando.` : `La cantidad del panel ya sigue a ${esc(a.broker)}: acá solo se registra el resultado.`}
          ${!moneda ? "<b>Todavía no tenemos la cotización de este activo</b>: esperá a que aparezca su precio para registrar la venta." : ""}</div>
        <div class="mc-msg" data-aj-msg style="flex-basis:100%;margin:0"></div>
      </div></div>`;
  }).join("");
}

/* ── render puro: se puede llamar con datos de prueba ── */
export function renderMiCartera(el, posiciones, precios, opts = {}) {
  asegurarEstilo();
  const escrito = escritoEnAvisos(el);
  const r = calcular(posiciones, precios);
  const cur = curLabel();
  const fxTxt = _cur === "CCL" ? (_fx.ccl ? `CCL $${_fx.ccl.toLocaleString("es-AR")}` : "")
              : _cur === "MEP" ? (_fx.mep ? `MEP $${_fx.mep.toLocaleString("es-AR")}` : "") : "";
  const cabecera = `
    <div class="mc-head"><div>
      <div class="portal-title" style="margin-bottom:0">Mi cartera</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Seguimiento de tus posiciones con la valuación de Valtia
        · <a href="disciplina.html" style="color:var(--gold);text-decoration:none">Las candidatas del mes →</a></div>
    </div>
    <div class="mc-curwrap">
      <div class="mc-cur">
        <button data-cur="ARS" class="${_cur === "ARS" ? "on" : ""}">Pesos</button>
        <button data-cur="CCL" class="${_cur === "CCL" ? "on" : ""}">USD CCL</button>
        <button data-cur="MEP" class="${_cur === "MEP" ? "on" : ""}">USD MEP</button>
      </div>
      ${opts.frescura ? `<div class="mc-live"><span class="mc-dot"${String(opts.frescura).startsWith("Precios del") ? ' style="background:#E0A93E"' : ""}></span>${esc(opts.frescura)}${fxTxt ? " · " + fxTxt : ""}</div>` : ""}
    </div></div>`;

  const form = `
    <div class="mc-form">
      <div class="mc-tabs">
        <button class="mc-tab on" data-modo="uno">Agregar una</button>
        <button class="mc-tab" data-modo="imp">Importar desde Excel</button>
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
      <div class="mc-msg" id="mc-msg"></div>
    </div>`;

  const fxFalta = posiciones.length && (
    (_cur === "ARS" && !_fx.ccl && r.filas.some(f => f.moneda !== "ARS")) ||
    (_cur === "CCL" && !_fx.ccl) || (_cur === "MEP" && !_fx.mep));
  const avisoFx = fxFalta ? `<div style="background:rgba(224,169,62,.12);border:1px solid rgba(224,169,62,.45);border-left:3px solid #E0A93E;border-radius:8px;padding:10px 14px;font-size:12.5px;line-height:1.6;margin-bottom:16px;color:var(--text)">⚠ No pudimos traer la cotización del dólar: los totales de abajo <b>excluyen tus posiciones en USD</b>. Recargá la página en unos minutos.</div>` : "";

  if (!posiciones.length) {
    el.innerHTML = `<div class="mc-wrap">${cabecera}${bloqueAjustes(opts.ajustes || [], precios, opts.bonos || new Set())}${form}
      ${(opts.ventas || []).length ? `<div class="mc-empty"><h4>No te quedan posiciones abiertas</h4>
        <p>Tus ventas y su resultado están más abajo. Si compraste algo nuevo, cargalo con el formulario.</p></div>` : `<div class="mc-empty">
        <h4>Todavía no cargaste posiciones</h4>
        <p>Agregá lo que tenés —acciones, CEDEARs o cripto— con la cantidad y el precio al que compraste.
           Al día siguiente vas a ver el valor actualizado, tu resultado y la lectura de Valtia sobre cada activo.</p>
      </div>`}${seccionVentas(opts.ventas || [], cur)}</div>`;
    reponerEscrito(el, escrito);
    // sin posiciones no hay curva: el gráfico anterior no puede quedar vivo
    if (_evoChart) { try { _evoChart.destroy(); } catch (e) {} _evoChart = null; }
    return;
  }

  const dir = _orden.desc ? -1 : 1;
  const filas = [...r.filas].sort((a, b) => {
    const A = a[_orden.col], B = b[_orden.col];
    if (A == null) return 1;
    if (B == null) return -1;
    return typeof A === "string" ? A.localeCompare(B) * dir : (A - B) * dir;
  });

  const th = (col, label, extra = "") =>
    `<th class="${extra}" data-col="${col}">${label}${_orden.col === col ? (_orden.desc ? " ↓" : " ↑") : ""}</th>`;

  const fila = f => {
    const px = f.px || {};
    // variación del precio por período (no es "lo que ganaste": eso es la
    // columna Resultado, que sale del precio de compra)
    const dg = desglose(f.ticker, opts.desg || {}, px, f);
    return `<tr data-fila="${esc(f.id)}">
      <td class="l">${(h => h ? `<a class="mc-tk" href="${h}" style="text-decoration:none">${esc(base(f.ticker))}</a>` : `<span class="mc-tk">${esc(base(f.ticker))}</span>`)(linkDe(f.ticker))}${
        String(f.ticker).endsWith(".BA") ? '<span class="mc-nm" style="display:inline;color:var(--gold);opacity:.7"> BYMA</span>' : ""}
        <span class="mc-nm">${esc(px.nombre && px.nombre !== f.ticker ? px.nombre : "")}</span>
        <span class="mc-brk" data-brk="${esc(f.id)}" title="Cambiar broker">${esc(f.broker || "sin broker")}</span></td>
      <td>${num(f.cantidad, 4).replace(/,0+$/, "")}</td>
      <td>${f.dCompra != null ? money(f.dCompra, cur) : "—"}</td>
      <td>${f.dActual != null ? money(f.dActual, cur) : "—"}</td>
      <td>${f.dValor != null ? money(f.dValor, cur) : "—"}</td>
      <td class="${f.dPl == null ? "mc-mut" : f.dPl >= 0 ? "mc-pos" : "mc-neg"}">${f.dPl == null ? "—" : moneyS(f.dPl, cur)}</td>
      <td class="${f.plPct == null ? "mc-mut" : f.plPct >= 0 ? "mc-pos" : "mc-neg"}" style="font-weight:600">${f.plPct == null ? "—" : pct(f.plPct)}</td>
      <td>${f.peso != null ? num(f.peso) + "%" : "—"}</td>
      ${["dia", "mes", "anio"].map(k => {
        const d = (dg.find(x => x.clave === k) || {});
        return d.pct == null
          ? `<td class="mc-mut" title="${esc(d.nota || "")}">—</td>`
          : `<td class="${d.pct >= 0 ? "mc-pos" : "mc-neg"}" title="${esc(d.nota || (d.plata != null ? "sobre lo que tenés hoy" : ""))}">${pct(d.pct)}${d.nota ? "*" : ""}</td>`;
      }).join("")}
      <td>${num(px.rsi)}</td>
      <td class="l">${px.sinDatos
        ? `<span class="mc-ver sin" title="Revisá que el ticker esté bien escrito">Ticker no encontrado</span>`
        : `<span class="mc-ver ${verCls(px.veredicto)}">${esc(px.veredicto || (f.actual == null ? "Buscando precio…" : "Sin dato"))}</span>`}</td>
      <td style="white-space:nowrap"><button class="mc-vend" data-vender="${esc(f.id)}" title="Registrar una venta de esta posición">Vendí</button><button class="mc-del" data-del="${esc(f.id)}" title="Quitar (si la cargaste por error)">✕</button></td>
    </tr>`;
  };
  // vista por broker: si alguna posición tiene broker, la tabla se agrupa
  // con subtotales (el orden de columna elegido se respeta dentro del grupo)
  const grupos = agruparPorBroker(filas, r.total);
  const agrupada = grupos.length > 1 || (grupos.length === 1 && grupos[0].broker !== "Sin broker");
  const rows = agrupada
    ? grupos.map(g => `<tr class="mc-grp"><td colspan="12"><b>${esc(g.broker)}</b>
        <span>${g.filas.length} ${g.filas.length === 1 ? "posición" : "posiciones"} · ${money(g.valor, cur)}${g.plPct != null ? ` · <span class="${g.pl >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(g.pl, cur)} (${pct(g.plPct)})</span>` : ""}${g.peso != null ? ` · ${num(g.peso)}% de tu cartera` : ""}</span></td></tr>`
        + g.filas.map(fila).join("")).join("")
    : filas.map(fila).join("");
  const reparto = agrupada ? `<div class="mc-brks">${grupos.map(g =>
    `<span class="b"><b>${esc(g.broker)}</b> ${g.peso != null ? num(g.peso) + "%" : "—"} · ${money(g.valor, cur)}</span>`).join("")}</div>` : "";

  el.innerHTML = `<div class="mc-wrap">
    ${cabecera}${avisoFx}${bloqueAjustes(opts.ajustes || [], precios, opts.bonos || new Set())}
    <div class="mc-kpis">
      <div class="mc-k"><div class="l">Valor actual</div><div class="v">${money(r.total, cur)}</div><div class="s">${r.filas.length} ${r.filas.length === 1 ? "posición" : "posiciones"}</div></div>
      <div class="mc-k"><div class="l">Invertido</div><div class="v">${money(r.costoTot, cur)}</div><div class="s">a precio de compra</div></div>
      <div class="mc-k"><div class="l">Resultado</div><div class="v ${r.plTot >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(r.plTot, cur)}</div><div class="s">ganancia / pérdida no realizada</div></div>
      <div class="mc-k"><div class="l">Rendimiento</div><div class="v ${(r.plTotPct || 0) >= 0 ? "mc-pos" : "mc-neg"}">${r.plTotPct == null ? "—" : pct(r.plTotPct)}</div><div class="s">sobre lo invertido</div></div>
    </div>
    <div class="mc-evo" id="mc-evo"></div>
    ${reparto}
    ${form}
    <div class="mc-tblwrap"><table class="mc-tbl">
      <thead><tr>
        ${th("ticker", "Activo", "l")}${th("cantidad", "Cant.")}${th("dCompra", "Compra")}
        ${th("dActual", "Actual")}${th("dValor", "Valor")}${th("dPl", "Resultado")}${th("plPct", "%")}
        ${th("peso", "Peso")}<th title="Variación del precio en el período, no tu resultado">Día</th><th>Mes</th><th>Año</th>
        <th>RSI</th><th class="l">Lectura Valtia</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${lectura(r)}
    ${analisis(r, cur, opts.bonos || new Set(), opts.rentaFija || "")}
    ${seccionVentas(opts.ventas || [], cur)}
    <div class="mc-foot">Los precios se actualizan cada 15 minutos durante la rueda; los ratios y la lectura, una vez por día.
      El resultado es sobre el precio de compra que cargaste. Si vendiste algo, tocá «Vendí» en su fila:
      queda registrado abajo, en Ventas y resultado realizado.
      ${_cur !== "ARS" ? `Los valores en pesos se convierten al ${_cur === "CCL" ? "contado con liqui" : "dólar MEP"} de hoy —
        tanto el costo como el valor actual—, así que el rendimiento en % coincide con el de pesos.` : ""}
      Esta información es de carácter general y no constituye asesoramiento financiero personalizado.</div>
  </div>`;
  reponerEscrito(el, escrito);
  pintarEvolucion(el);

  el.querySelectorAll("th[data-col]").forEach(h => h.onclick = () => {
    const c = h.dataset.col;
    _orden = { col: c, desc: _orden.col === c ? !_orden.desc : true };
    renderMiCartera(el, posiciones, precios, opts);
    if (opts.onRerender) opts.onRerender();
  });
}

/* ── evolución contra el S&P 500 (las cuentas viven en evolucion.js) ── */
const _evo = { email: null, cargado: false, cargando: null, error: false, intento: 0, fotos: [], series: {}, spy: [], ccl: [],
               pedidos: new Set(), rango: 91 };
let _evoChart = null, _evoTema = null;
const RANGOS_EVO = [[30, "1M"], [91, "3M"], [182, "6M"], [365, "1A"]];
const diaAR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const fechaCorta = f => (f ? `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}` : "");
// en rangos que cruzan de año, "del 15/09 al 15/09" no dice nada: se agrega el año
const conAnio = (a, b) => String(a).slice(0, 4) === String(b).slice(0, 4)
  ? [fechaCorta(a), fechaCorta(b)] : [`${fechaCorta(a)}/${String(a).slice(2, 4)}`, `${fechaCorta(b)}/${String(b).slice(2, 4)}`];

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
            return { fecha: x.fecha || d.id, ccl: x.ccl, spy: x.spy, pos };
          });
        } catch (e) { fallo = true; }
      })());
      tareas.push(leerSerie("SPY").then(v => { if (v === undefined) fallo = true; else nuevo.spy = v || []; }));
      tareas.push(leerSerie("_ccl").then(v => { if (v === undefined) fallo = true; else nuevo.ccl = v || []; }));
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
      if (!fallo) { _evo.fotos = nuevo.fotos || []; _evo.spy = nuevo.spy || []; _evo.ccl = nuevo.ccl || []; }
      _evo.cargado = !fallo;
      _evo.error = fallo;
    }
  })();
  _evo.cargando = carga;
  try { await carga; } finally { if (_evo.cargando === carga) _evo.cargando = null; }
}

/* colores de ejes del tema activo (oscuro por defecto, claro a elección) */
function temaEvo() {
  const cs = getComputedStyle(document.documentElement);
  return { txt: cs.getPropertyValue("--muted").trim() || "#8B8375", grid: cs.getPropertyValue("--border").trim() || "rgba(128,128,128,.2)" };
}
function vigilarTemaEvo() {
  if (_evoTema || typeof MutationObserver === "undefined") return;
  _evoTema = new MutationObserver(() => { if (_el && _evoChart) pintarEvolucion(_el); });
  _evoTema.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

const diasHabiles = (a, b) => {
  let n = 0;
  for (let d = new Date(a + "T12:00:00Z"); d < new Date(b + "T12:00:00Z"); d = new Date(d.getTime() + 864e5)) {
    const w = d.getUTCDay();
    if (w > 0 && w < 6) n++;
  }
  return n;
};

function pintarEvolucion(el) {
  if (_evoChart) { try { _evoChart.destroy(); } catch (e) {} _evoChart = null; }
  const box = el && el.querySelector("#mc-evo");
  if (!box) return;
  vigilarTemaEvo();
  const titulo = `<div class="mc-evo-t">Tu cartera contra el S&amp;P 500 · en dólares CCL</div>`;
  // reintento con freno: como mucho una carga por minuto
  const reintentar = () => {
    if (_evo.cargando || Date.now() - _evo.intento < 60000) return;
    cargarEvolucion().then(() => { if (_el) pintarEvolucion(_el); }).catch(() => {});
  };
  if (!_evo.cargado) {
    box.innerHTML = titulo + `<div class="mc-evo-nota">${_evo.error
      ? "No pudimos traer la historia de precios; lo volvemos a intentar en unos minutos."
      : "Cargando la historia de precios…"}</div>`;
    reintentar();
    return;
  }
  // una posición nueva sin su serie todavía: se pide y se vuelve a pintar
  if (_pos.some(p => !_evo.pedidos.has(serieDe(p.ticker)))) reintentar();

  const hoy = diaAR(), desde = diaAR(new Date(Date.now() - _evo.rango * 864e5));
  const sim = simular({ posiciones: _pos, precios: _precios, series: _evo.series, ccl: _evo.ccl, spy: _evo.spy,
                        desde, hasta: hoy, cclHoy: _fx.ccl, monedaDe: (p, px) => monedaPosicion(p, px, _bonos) });
  const real = serieReal(_evo.fotos, { cclSerie: _evo.ccl });
  // con menos del 30% del valor de hoy cubierto (o sin poder saberlo) no se muestra la simulación
  const simUsable = sim.cobertura != null && sim.cobertura >= 0.3 ? sim.puntos : [];
  const pts = recortar(combinar(simUsable, real), desde);
  const res = resumen(pts);
  const haySim = pts.some(x => x.tipo === "sim"), hayReal = pts.some(x => x.tipo === "real");
  const iReal = pts.findIndex(x => x.tipo === "real");
  const ultFoto = _evo.fotos.reduce((m, f) => (f.fecha > m ? f.fecha : m), "");
  const ultSpy = _evo.spy.length ? String(_evo.spy[_evo.spy.length - 1][0]) : hoy;
  const fotosViejas = ultFoto && diasHabiles(ultFoto, ultSpy) > 5;

  const iUltReal = pts.map(x => x.tipo).lastIndexOf("real");
  const simDespues = hayReal && iUltReal < pts.length - 1;
  // el rótulo dice qué parte es simulación: un % simulado no se pinta de verde
  const rotulo = !res ? "" : haySim && !hayReal ? "Tu cartera de hoy, simulada"
    : simDespues ? `Tu cartera (real del ${fechaCorta(pts[iReal].fecha)} al ${fechaCorta(pts[iUltReal].fecha)}, simulada el resto)`
    : haySim ? `Tu cartera (simulada hasta el ${fechaCorta(pts[Math.max(0, iReal - 1)].fecha)}, real desde ahí)` : "Tu cartera";
  const colorC = res && !haySim ? (res.cartera >= 0 ? "mc-pos" : "mc-neg") : "";
  const botones = RANGOS_EVO.map(([d, l]) => `<button data-evo="${d}" class="${_evo.rango === d ? "on" : ""}">${l}</button>`).join("");
  const cab = `<div class="mc-evo-h"><div>${titulo}
      ${res ? `<div class="mc-evo-r">${rotulo}: <b class="${colorC}">${pct(res.cartera)}</b> · S&amp;P 500: <b>${pct(res.spy)}</b>
        <span style="color:var(--muted)">· del ${conAnio(res.desde, res.hasta)[0]} al ${conAnio(res.desde, res.hasta)[1]}</span></div>` : ""}</div>
    <div class="mc-evo-rg">${botones}</div></div>`;

  const notas = [];
  if (haySim) notas.push(`La línea punteada es una <b>simulación</b>: cómo le habría ido a tu cartera de hoy con el precio de cada día y el dólar CCL de esa fecha. No es lo que ganaste, porque no sabemos cuándo compraste cada cosa.`);
  if (hayReal) notas.push(`La línea llena es la <b>variación real</b> de tu cartera, con una foto al cierre de cada rueda: lo que agregás o vendés no cuenta como ganancia ni pérdida, y los cupones y amortizaciones de bonos suman el día que se pagan.`);
  else if (!_evo.fotos.length) notas.push(`Después del cierre de cada rueda guardamos una foto de tu cartera; con dos fotos vas a ver acá tu variación real.`);
  if (fotosViejas) notas.push(`La última foto de tu cartera es del ${fechaCorta(ultFoto)}: desde ahí no tenemos datos para seguir la curva real.`);
  const excl = sim.excluidas.map(e => base(e.ticker));
  if (haySim && excl.length) notas.push(`La simulación cubre el ${Math.round(sim.cobertura * 100)}% del valor de hoy; quedan afuera ${esc(excl.slice(0, 8).join(", "))}${excl.length > 8 ? " y otras" : ""}, sin historia de precios en el período.`);
  if (sim.puntos.length && sim.cobertura == null) notas.push(`No mostramos la simulación: sin el dólar CCL o sin precios de hoy no podemos saber qué parte de tu cartera cubre.`);
  else if (sim.puntos.length && !simUsable.length) notas.push(`No mostramos la simulación: las posiciones con historia de precios son menos del 30% del valor de tu cartera.`);
  notas.push(`Variación de precio en dólares CCL, base 100 al inicio del período: no incluye dividendos, ni en tu cartera ni en el S&amp;P 500. No es asesoramiento financiero.`);

  const enganchar = () => box.querySelectorAll("[data-evo]").forEach(b => b.onclick = () => {
    _evo.rango = Number(b.dataset.evo);
    pintarEvolucion(_el);
  });
  if (pts.length < 2) {
    box.innerHTML = cab + `<div class="mc-evo-nota">${notas.join(" ")}</div>`;
    enganchar();
    return;
  }
  box.innerHTML = cab + `<div class="mc-evo-box"><canvas></canvas></div>
    <div class="mc-evo-ley">${haySim ? `<span><i style="border-top-style:dashed;border-color:#B08A3E"></i>Tu cartera (simulación)</span>` : ""}
      ${hayReal ? `<span><i style="border-color:#B08A3E"></i>Tu cartera (real)</span>` : ""}<span><i style="border-color:#8A9BAD"></i>S&amp;P 500</span></div>
    <div class="mc-evo-nota">${notas.join(" ")}</div>`;
  enganchar();
  if (typeof Chart === "undefined") return;
  const simData = pts.map(x => (x.tipo === "sim" ? x.cartera : null));
  const realData = pts.map(x => (x.tipo === "real" ? x.cartera : null));
  if (iReal > 0) realData[iReal - 1] = pts[iReal - 1].cartera;   // la línea real sale del último punto simulado
  if (simDespues) simData[iUltReal] = pts[iUltReal].cartera;       // y la simulación sigue desde la última foto
  const tema = temaEvo();
  _evoChart = new Chart(box.querySelector("canvas"), {
    type: "line",
    data: { labels: pts.map(x => x.fecha), datasets: [
      { label: "Tu cartera (simulación)", data: simData, borderColor: "#B08A3E", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: "Tu cartera (real)", data: realData, borderColor: "#B08A3E", borderWidth: 2.5,
        pointRadius: realData.filter(v => v != null).length < 25 ? 2 : 0, tension: 0.2 },
      { label: "S&P 500", data: pts.map(x => x.spy), borderColor: "#8A9BAD", borderWidth: 1.8, pointRadius: 0, tension: 0.2 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: {
        // el punto de empalme es simulado aunque la línea real salga de ahí
        filter: it => it.raw != null && !(it.datasetIndex === 1 && pts[it.dataIndex].tipo !== "real")
          && !(it.datasetIndex === 0 && pts[it.dataIndex].tipo !== "sim"),
        callbacks: {
          title: it => (it[0] ? String(it[0].label).split("-").reverse().join("/") : ""),
          label: c => `${c.dataset.label}: ${pct(c.raw - 100)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: tema.txt, maxTicksLimit: 6, maxRotation: 0,
             callback: function (v) { return fechaCorta(this.getLabelForValue(v)); } } },
        y: { grid: { color: tema.grid }, ticks: { color: tema.txt, maxTicksLimit: 5 } },
      },
    },
  });
}

/* ── Firestore: carga, alta y baja de posiciones ── */
let _el = null, _user = null, _pos = [], _precios = {}, _ventas = [], _ajustes = [];

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
  _precios = {};
  // también los tickers de los avisos: una posición que "desapareció" ya no
  // está en la cartera, pero su aviso muestra la cotización de referencia
  const tks = [...new Set([..._pos, ..._ajustes].map(p => String(p.ticker || "").toUpperCase()).filter(Boolean))];
  if (tks.length) {
    const px = await getDocs(collection(db, "precios"));
    px.docs.forEach(d => { if (tks.includes(d.id)) _precios[d.id] = d.data(); });
  }
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
  renderMiCartera(_el, _pos, _precios, { frescura: frescura(), onRerender: enganchar,
                                         bonos: _bonos, rentaFija: rf, desg: _desg, ventas: _ventas, ajustes: _ajustes });
  enganchar();
}

/* variaciones por período ya calculadas por el sync (doc público) */
async function cargarDesglose() {
  try {
    const s2 = await getDoc(doc(getFirestore(getApp()), "desglosePeriodos", "latest"));
    if (s2.exists()) _desg = JSON.parse(s2.data().json || "{}");
  } catch (e) {}
}

/* panel de bonos y flujos: solo se piden si la cartera tiene renta fija */
async function cargarRentaFija() {
  if (!_pos.some(p => esRentaFija(p.ticker, _bonos))) return;
  const db = getFirestore(getApp());
  for (const [col, set] of [["bonosPanel", v => { _panel = v; }], ["bonosFlujos", v => { _flujos = v; }]]) {
    try {
      const s2 = await getDoc(doc(db, col, "latest"));
      if (s2.exists()) set(JSON.parse(s2.data().json || "{}"));
    } catch (e) {}
  }
}

function enganchar() {
  const add = _el.querySelector("#mc-add");
  if (add) add.onclick = agregar;
  _el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => quitar(b.dataset.del));
  _el.querySelectorAll("[data-vender]").forEach(b => b.onclick = () => abrirVenta(b.dataset.vender));
  _el.querySelectorAll("[data-deshacer]").forEach(b => b.onclick = () => deshacerVenta(b.dataset.deshacer, b));
  _el.querySelectorAll(".mc-aj").forEach(card => {
    card.querySelectorAll("input").forEach(i => i.addEventListener("input", () => vistaAjuste(card)));
    card.querySelector("[data-aj-ok]").onclick = () => confirmarAjuste(card);
    card.querySelector("[data-aj-no]").onclick = () => descartarAjuste(card);
    const tengo = card.querySelector("[data-aj-tengo]");
    if (tengo) tengo.onclick = () => recuperarAjuste(card, tengo);
    vistaAjuste(card);
  });
  _el.querySelectorAll(".mc-brk[data-brk]").forEach(chip => chip.onclick = () => {
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
  _el.querySelectorAll(".mc-tab").forEach(t => t.onclick = () => {
    _el.querySelectorAll(".mc-tab").forEach(x => x.classList.toggle("on", x === t));
    const imp = t.dataset.modo === "imp";
    _el.querySelector("#mc-modo-uno").style.display = imp ? "none" : "block";
    _el.querySelector("#mc-modo-imp").style.display = imp ? "block" : "none";
  });
  const ib = _el.querySelector("#mc-imp-btn");
  if (ib) ib.onclick = revisarImport;
  _el.querySelectorAll(".mc-cur button").forEach(b => b.onclick = () => {
    _cur = b.dataset.cur;
    try { localStorage.setItem("valtia-mc-cur", _cur); } catch (e) {}
    pintar();
  });
}

/* cotizaciones para convertir (misma fuente que la barra del sitio) */
async function cargarFx() {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares");
    if (!r.ok) return;
    const d = await r.json();
    const v = casa => { const x = d.find(y => y.casa === casa); return x ? x.venta : null; };
    _fx = { ccl: v("contadoconliqui"), mep: v("bolsa") };
  } catch (e) {}
}

/* ── importar: primero muestra qué entendió, después confirma ── */
let _porImportar = null;

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
        <td>${f.precioCompra ? money(f.precioCompra, f.monedaHint) : "—"}</td><td>${esc(f.fecha || "—")}</td><td>${esc(broker || "—")}</td></tr>`).join("")}</tbody>
    </table></div>
    ${errores.length ? `<div class="mc-hint mc-bad">${errores.length} línea(s) que no pude leer:<br>${errores.slice(0, 4).map(esc).join("<br>")}</div>` : ""}
    <button class="mc-btn" id="mc-imp-ok" style="margin-top:12px">Importar ${filas.length} ${filas.length === 1 ? "posición" : "posiciones"}</button>`;
  const ok = _el.querySelector("#mc-imp-ok");
  if (ok) ok.onclick = confirmarImport;
}

async function confirmarImport() {
  const msg = _el.querySelector("#mc-msg");
  if (!_porImportar || !_porImportar.length) return;
  const db = getFirestore(getApp());
  let ok = 0, fallo = 0;
  for (const f of _porImportar) {
    try {
      const id = f.ticker + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
      await setDoc(doc(db, "inversores", _user.email, "cartera", id), {
        ticker: f.ticker, cantidad: f.cantidad, precioCompra: f.precioCompra,
        fecha: f.fecha, broker: f.broker || "", moneda: f.moneda, factor: f.factor, creado: new Date().toISOString(),
      });
      ok++;
    } catch (e) { fallo++; }
  }
  _porImportar = null;
  await leerTodo();
  pintar();
  const msg2 = _el.querySelector("#mc-msg");
  if (msg2) msg2.innerHTML = `<span style="color:#4caf50">${ok} ${ok === 1 ? "posición importada" : "posiciones importadas"}.</span>` +
    (fallo ? ` <span style="color:#ef5350">${fallo} fallaron.</span>` : "") +
    ` <span style="color:var(--muted)">Los precios aparecen en la próxima actualización (cada 15 min en rueda).</span>`;
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
    msg.innerHTML = `<span style="color:#ef5350">Completá al menos el ticker y la cantidad.</span>`;
    return;
  }
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
    await leerTodo();
    pintar();
    // el repintado recrea el formulario: el mensaje se escribe recién ahora
    const msg2 = _el.querySelector("#mc-msg");
    if (msg2) msg2.innerHTML = `<span style="color:#4caf50">${esc(tk)} agregado (${donde}${broker ? ", " + esc(broker) : ""}). El precio aparece en la próxima actualización — cada 15 min en rueda.</span>`;
    avisarPanel();
  } catch (e) {
    msg.innerHTML = `<span style="color:#ef5350">No se pudo guardar: ${esc(String(e).slice(0, 90))}</span>`;
  }
}

/* ── ventas: formulario en la fila, registro atómico y deshacer ── */
function abrirVenta(id) {
  const viejo = _el.querySelector(".mc-vrow");
  if (viejo) { const era = viejo.dataset.para; viejo.remove(); if (era === id) return; }
  const tr = [..._el.querySelectorAll("tr[data-fila]")].find(x => x.dataset.fila === id);
  const p = _pos.find(x => x.id === id);
  if (!tr || !p) return;
  const px = _precios[String(p.ticker).toUpperCase()] || null;
  const esRF = esRentaFija(p.ticker, _bonos);
  const { moneda, factor } = monedaFactor(p, px, esRF);
  const unidad = factor !== 1 ? "cada 100 VN" : "por unidad";
  const hoy = hoyAR();
  const sync = String(p.origen || "").startsWith("sync");
  const costo = Number(p.precioCompra) > 0 ? Number(p.precioCompra) : 0;
  const fila = document.createElement("tr");
  // sin moneda no hay nada que registrar: la fila es un aviso y el refresco
  // de 2 min la puede pisar para traer el precio (por eso no se enfoca nada)
  fila.className = "mc-vrow" + (moneda ? "" : " mc-vrow-espera");
  fila.dataset.para = id;
  // un id por formulario: si se reintenta después de un error, no se duplica la venta
  fila.dataset.vid = base(p.ticker) + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  fila.innerHTML = `<td colspan="14"><div class="mc-vform">
      <div><label>Cantidad vendida</label><input id="mc-v-cant" type="number" step="any" min="0" value="${Number(p.cantidad) || ""}"></div>
      <div><label>Precio de venta · ${monNombre(moneda)}, ${unidad}</label><input id="mc-v-px" type="number" step="any" min="0" value="${px && px.precio != null ? px.precio : ""}"></div>
      <div><label>Fecha de la venta</label><input id="mc-v-fecha" type="date" max="${hoy}" value="${hoy}"></div>
      <div class="prev" id="mc-v-prev"></div>
      <div><button class="mc-btn" id="mc-v-ok">Registrar venta</button> <button class="mc-undo" id="mc-v-no">Cancelar</button></div>
      <div class="nota">Tu costo en esta posición: <b>${costo ? (moneda ? money(costo, moneda) : num(costo, 2)) + " " + unidad + aprox(costo, moneda)
        : "sin precio de compra cargado, así que el resultado no se va a poder calcular"}</b>.
        ${px && px.precio != null ? "El precio viene con la última cotización: poné el que te pagaron." : ""}
        ${sync ? "Esta posición la trae el sync de tu broker: en la próxima corrida la cantidad se ajusta a lo que diga el broker." : ""}
        ${!moneda ? (px && px.sinDatos
          ? "<b>No encontramos este ticker</b>, así que no sabemos en qué moneda cotiza: revisá que esté bien escrito (quitalo con ✕ y volvé a cargarlo) para poder registrar la venta."
          : "<b>Todavía no tenemos la cotización de este activo</b>, así que no sabemos en qué moneda está: esperá a que aparezca su precio (cada 15 min en rueda) para registrar la venta.") : ""}</div>
      <div class="mc-msg" id="mc-v-msg" style="flex-basis:100%;margin:0"></div>
    </div></td>`;
  tr.after(fila);
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
  if (!pre.ok) { msg.innerHTML = `<span style="color:#ef5350">${esc(pre.error)}</span>`; return; }
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
      const tr = [..._el.querySelectorAll("tr[data-fila]")].find(x => x.dataset.fila === p.id);
      if (tr && p2) tr.children[1].textContent = cantTxt(p2.cantidad);
      btn.disabled = false;
      msg.innerHTML = `<span style="color:#ef5350">${esc(String((e && e.message) || e).slice(0, 180))}</span>`;
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
    msg.innerHTML = `<span style="color:#4caf50">${texto}</span> <span class="mc-mut">No pude actualizar la tabla: recargá la página.</span>`;
    return;
  }
  const m2 = _el.querySelector("#mc-msg");
  if (m2) m2.innerHTML = `<span style="color:#4caf50">${texto}</span>`;
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
    if (aviso) aviso.innerHTML = `<span style="color:#ef5350">No se pudo deshacer: ${esc(error)}</span>`;
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
  if (!v.ok) { msg.innerHTML = `<span style="color:#ef5350">${esc(v.error)}</span>`; return; }
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
      msg.innerHTML = `<span style="color:#ef5350">${esc(String((e && e.message) || e).slice(0, 180))}</span>`;
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
    msg.innerHTML = `<span style="color:#4caf50">${texto}</span> <span class="mc-mut">No pude actualizar la tabla: recargá la página.</span>`;
    return;
  }
  const m2 = _el.querySelector("#mc-msg");
  if (m2) m2.innerHTML = `<span style="color:#4caf50">${texto}</span>`;
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
    if (msg && msg.isConnected) msg.innerHTML = `<span style="color:#ef5350">No se pudo descartar: ${esc(String((e && e.message) || e).slice(0, 120))}</span>`;
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
    if (m2) m2.innerHTML = `<span style="color:#4caf50">${esc(base(a.ticker))} volvió a tu cartera con su costo. Si la transferiste a otro broker, cambiale el broker en la fila; si sigue en ${esc(a.broker)}, el sync la vuelve a comparar mañana.</span>`;
  } catch (e) {
    btn.disabled = false;
    const msg = card.querySelector("[data-aj-msg]");
    if (msg && msg.isConnected) msg.innerHTML = `<span style="color:#ef5350">No se pudo recuperar: ${esc(String((e && e.message) || e).slice(0, 120))}</span>`;
  }
}

/* llegada desde la ficha de un activo ("+ Agregar a Mi cartera"): el ticker
   viene en la URL (?agregar=NVDA); se precarga UNA vez, con el mercado que
   corresponde a la ficha (dólares), y el cursor queda en la cantidad */
function prellenarDesdeUrl() {
  let tk = "";
  try { tk = (new URLSearchParams(location.search).get("agregar") || "").trim().toUpperCase().slice(0, 12); } catch (e) {}
  if (!tk || !/^[A-Z0-9.\-]+$/.test(tk)) return;
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
  _porImportar = null;
  if (_evoChart) { try { _evoChart.destroy(); } catch (e) {} _evoChart = null; }
  Object.assign(_evo, { email: null, cargado: false, cargando: null, error: false,
                        intento: 0, fotos: [], series: {}, spy: [], ccl: [] });
  try { _evo.pedidos.clear(); _deshaciendo.clear(); } catch (e) {}
}

export async function initMiCartera(user, el) {
  if (!user || !el) return;
  _user = user; _el = el;
  // otra sesión en la misma página (logout y login sin recargar): las fotos
  // son privadas y no pueden quedar en memoria para la cuenta siguiente
  if (_evo.email !== user.email) {
    if (_evoChart) { try { _evoChart.destroy(); } catch (e) {} _evoChart = null; }
    Object.assign(_evo, { email: user.email, cargado: false, cargando: null, error: false, intento: 0, fotos: [] });
  }
  asegurarEstilo();
  if (!user.emailVerified) {
    // sin verificar, las reglas de Firestore bloquean la cartera del usuario
    el.innerHTML = `<div class="portal-title">Mi cartera</div>
      <div class="mc-empty"><h4>Verificá tu email para activar Mi Cartera</h4>
      <p>Te mandamos un mail de verificación a <b>${esc(user.email)}</b>. Abrilo, tocá el link
      y recargá la página — tus posiciones y el plan de inversión mensual se activan al instante.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="portal-title">Mi cartera</div><p style="color:var(--sub);font-size:14px">Cargando tus posiciones…</p>`;
  // el panel (panel.js) avisa cuando registra una compra o cambia la moneda
  window.__mcRecargar = async () => {
    _cur = pref("valtia-mc-cur", "ARS");
    try { await Promise.all([leerTodo(), cargarFx()]); pintar(); } catch (e) {}
  };
  try {
    await Promise.all([leerTodo(), cargarFx()]);
    _bonos = await bonosSet();
    await Promise.all([cargarRentaFija(), cargarDesglose()]);
    pintar();
    prellenarDesdeUrl();
    // la historia de precios y las fotos se cargan aparte: no demoran la tabla
    cargarEvolucion().then(() => pintarEvolucion(_el)).catch(() => {});
    // el sync intradía reescribe los precios cada ~15 min: se releen solos
    // (sin pisar lo que el usuario esté escribiendo ni si la pestaña no se ve)
    if (!window.__mcTimer) {
      window.__mcTimer = setInterval(async () => {
        if (document.hidden || !_el || _el.offsetParent === null) return;
        const act = document.activeElement;
        if (act && _el.contains(act) && /INPUT|TEXTAREA/.test(act.tagName)) return;
        // pestaña Importar abierta = el usuario está armando el paste: no pisar
        const imp = _el.querySelector("#mc-modo-imp");
        if (imp && imp.style.display !== "none") return;
        // formulario de venta abierto: no pisarlo (salvo el aviso de "esperá el precio",
        // que justamente necesita el refresco para que el precio llegue)
        if (_el.querySelector(".mc-vrow:not(.mc-vrow-espera)")) return;
        // un aviso del sync con el precio escrito: tampoco se pisa
        if (Object.keys(escritoEnAvisos(_el)).length) return;
        try { await Promise.all([leerTodo(), cargarFx()]); pintar(); } catch (e) {}
      }, 120000);
    }
  } catch (e) {
    el.innerHTML = `<div class="portal-title">Mi cartera</div>
      <p style="color:var(--sub);font-size:14px">No pudimos cargar tu cartera (${esc(String(e).slice(0, 120))}).</p>`;
  }
}
