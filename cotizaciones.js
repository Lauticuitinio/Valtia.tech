// cotizaciones.js — barra de cotizaciones en vivo, única para todo el sitio.
// Monta en cualquier <div id="valtia-cot"></div> (index, noticias,
// herramientas). Inyecta su propio CSS y hace marquee infinito.
//
// Fuentes (todas públicas, sin API key):
//   dolarapi.com/v1/dolares       → 7 tipos de dólar (en vivo)
//   dolarapi.com/v1/cotizaciones  → euro, real, chileno, uruguayo (en vivo)
//   CoinGecko simple/price        → 6 cripto con variación 24h (en vivo)
//   ArgentinaDatos                → riesgo país e inflación mensual (oficial)
//   Firestore radar/latest (REST) → acciones del radar, último cierre del sync
//
// Si una fuente falla, se muestran las demás: nunca se inventan valores ni
// quedan campos en "$--" colgados (los ítems sin dato no se renderizan).

const STYLE = `
.vc-bar{background:#0B1327;border-bottom:1px solid rgba(232,206,150,.12);overflow:hidden;position:relative}
.vc-bar::after{content:"";position:absolute;top:0;right:0;width:56px;height:100%;pointer-events:none;
  background:linear-gradient(90deg,rgba(11,19,39,0),#0B1327)}
.vc-track{display:flex;width:max-content;animation:vc-scroll 110s linear infinite}
.vc-bar:hover .vc-track{animation-play-state:paused}
.vc-seq{display:flex;align-items:center;gap:24px;padding:9px 26px}
.vc-g{font:700 9px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;color:#B08A3E;
  text-transform:uppercase;white-space:nowrap;padding-right:16px;border-right:1px solid rgba(255,255,255,.14)}
.vc-i{display:flex;align-items:center;gap:7px;white-space:nowrap;
  font:500 12px 'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
.vc-n{color:rgba(255,255,255,.5);letter-spacing:.04em}
.vc-v{color:#fff;font-weight:600}
.vc-c{font-size:11px}
.vc-up{color:#3FCE8A}.vc-dn{color:#E88A8A}.vc-nt{color:rgba(255,255,255,.35)}
a.vc-i{text-decoration:none;cursor:pointer}
a.vc-i:hover .vc-n{color:#E8CE96}
a.vc-i:hover .vc-v{color:#E8CE96}
@keyframes vc-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){
  .vc-track{animation:none}
  .vc-bar{overflow-x:auto}
  .vc-seq:nth-child(2){display:none}
}
`;

const GRUPOS = [
  ["dolar", "Dólar"], ["cripto", "Cripto"], ["monedas", "Monedas"],
  ["arg", "Argentina"], ["acciones", "Acciones · último cierre"],
];

const S = new Map();  // key -> {grp, n, v, c}  (c: variación % o null)

const ars = n => "$" + Number(n).toLocaleString("es-AR", { maximumFractionDigits: n < 100 ? 2 : 0 });
const usd = n => "US$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : n < 1000 ? 2 : 0 });
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function put(key, grp, n, v, c) {
  if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return;
  S.set(key, { grp, n, v, c: (typeof c === "number" && isFinite(c)) ? c : null });
}

// cada precio lleva a su lugar: acciones y BTC/ETH a la ficha del activo,
// los dólares al histórico de Herramientas. El resto no linkea.
const ADR_FICHA = { PAMP: "PAM", YPFD: "YPF" };
function linkDe(k) {
  if (k.startsWith("s-")) return "activo.html?t=" + (ADR_FICHA[k.slice(2)] || k.slice(2));
  if (k === "c-bitcoin") return "activo.html?t=BTC";
  if (k === "c-ethereum") return "activo.html?t=ETH";
  if (k.startsWith("d-")) return "herramientas.html";
  return null;
}

function itemHtml(k, it) {
  const cls = it.c == null ? "vc-nt" : it.c >= 0 ? "vc-up" : "vc-dn";
  const chg = it.c == null ? "" :
    `<span class="vc-c ${cls}" data-c="${esc(k)}">${it.c >= 0 ? "▲" : "▼"}${Math.abs(it.c).toFixed(2)}%</span>`;
  const cuerpo = `<span class="vc-n">${esc(it.n)}</span>` +
    `<span class="vc-v" data-v="${esc(k)}">${esc(it.v)}</span>${chg}`;
  const link = linkDe(k);
  return link ? `<a class="vc-i" href="${link}" title="Ver más">${cuerpo}</a>`
              : `<span class="vc-i">${cuerpo}</span>`;
}

function seqHtml() {
  let out = "";
  for (const [gk, glabel] of GRUPOS) {
    const items = [...S.entries()].filter(([, it]) => it.grp === gk);
    if (!items.length) continue;
    out += `<span class="vc-g">${esc(glabel)}</span>` + items.map(([k, it]) => itemHtml(k, it)).join("");
  }
  return `<span class="vc-seq">${out}</span>`;
}

let montado = false;
function render() {
  if (!S.size) return;
  const monts = document.querySelectorAll("#valtia-cot");
  if (!monts.length) return;
  const html = seqHtml();
  monts.forEach(m => {
    if (!montado || !m.querySelector(".vc-track")) {
      // el marquee necesita la secuencia duplicada para el loop sin costura
      m.className = "vc-bar";
      m.innerHTML = `<div class="vc-track">${html}${html}</div>`;
    } else {
      // refresco en caliente: actualiza valores sin reiniciar la animación
      S.forEach((it, k) => {
        m.querySelectorAll(`[data-v="${k}"]`).forEach(e => { e.textContent = it.v; });
        if (it.c != null) {
          m.querySelectorAll(`[data-c="${k}"]`).forEach(e => {
            e.textContent = (it.c >= 0 ? "▲" : "▼") + Math.abs(it.c).toFixed(2) + "%";
            e.className = "vc-c " + (it.c >= 0 ? "vc-up" : "vc-dn");
          });
        }
      });
    }
  });
  montado = true;
  // otras partes de la página pueden engancharse (ej. las tarjetas de dólar)
  document.dispatchEvent(new CustomEvent("valtia:cotizaciones", { detail: Object.fromEntries(S) }));
}

const j = async u => { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json(); };

async function cargarDolar() {
  const d = await j("https://dolarapi.com/v1/dolares");
  const M = { oficial: "Oficial", blue: "Blue", bolsa: "MEP", contadoconliqui: "CCL",
              mayorista: "Mayorista", cripto: "Cripto", tarjeta: "Tarjeta" };
  Object.keys(M).forEach(casa => {
    const x = d.find(v => v.casa === casa);
    if (x) put("d-" + casa, "dolar", M[casa], ars(x.venta), null);
  });
}

async function cargarMonedas() {
  const c = await j("https://dolarapi.com/v1/cotizaciones");
  const M = { EUR: "Euro", BRL: "Real", CLP: "Chileno", UYU: "Uruguayo" };
  Object.keys(M).forEach(mon => {
    const x = c.find(v => v.moneda === mon);
    if (x) put("m-" + mon, "monedas", M[mon], ars(x.venta), null);
  });
}

async function cargarCripto() {
  const ids = "bitcoin,ethereum,solana,binancecoin,ripple,cardano";
  const g = await j(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
  const M = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL",
              binancecoin: "BNB", ripple: "XRP", cardano: "ADA" };
  Object.keys(M).forEach(id => {
    const x = g[id];
    if (x) put("c-" + id, "cripto", M[id], usd(x.usd), x.usd_24h_change);
  });
}

async function cargarMacro() {
  try {
    const rp = await j("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo");
    if (rp && rp.valor != null) put("a-rp", "arg", "Riesgo país", Math.round(rp.valor) + " pb", null);
  } catch (e) {}
  try {
    const inf = await j("https://api.argentinadatos.com/v1/finanzas/indices/inflacion");
    const u = Array.isArray(inf) ? inf[inf.length - 1] : null;
    if (u && u.valor != null) {
      const m = String(u.fecha).slice(0, 7).split("-");
      const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
      put("a-inf", "arg", "Inflación " + (MES[+m[1] - 1] || ""),
          String(u.valor).replace(".", ",") + "%", null);
    }
  } catch (e) {}
  try {
    const pf = await j("https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo");
    const tasas = (pf || []).map(x => x.tnaClientes).filter(x => typeof x === "number" && x > 0);
    if (tasas.length) put("a-pf", "arg", "Plazo fijo (máx. TNA)",
                          (Math.max(...tasas) * 100).toFixed(1).replace(".", ",") + "%", null);
  } catch (e) {}
}

// Acciones del radar (mismo dato que la herramienta Radar de valuación):
// precio del último cierre que trajo el sync diario, no intradiario.
async function cargarAcciones() {
  const KEY = "AIzaSyCxKNw0995b8a7XXyENiMjDQbfRCe9IBlw";
  const url = "https://firestore.googleapis.com/v1/projects/valtia-analytics/databases/(default)" +
              "/documents/radar/latest?key=" + KEY;
  const doc = await j(url);
  const data = JSON.parse(doc.fields.json.stringValue);
  // el radar valúa las argentinas por su ADR en USD: se muestran con el
  // ticker del ADR para no confundir con la cotización local en pesos
  const orden = [["NVDA"], ["MSFT"], ["GOOGL"], ["META"], ["MELI"], ["KO"],
                 ["GGAL", "GGAL ADR"], ["YPFD", "YPF ADR"], ["VIST"], ["PAMP", "PAM ADR"]];
  orden.forEach(([sym, label]) => {
    const a = (data.activos || []).find(x => x.sym === sym);
    if (a && a.precio) put("s-" + sym, "acciones", label || sym, usd(a.precio), null);
  });
}

async function ciclo(fns) {
  // cada fuente falla por su cuenta: una caída no vacía la barra
  await Promise.all(fns.map(f => f().catch(() => {})));
  render();
}

function init() {
  if (!document.getElementById("valtia-cot")) return;
  const st = document.createElement("style");
  st.textContent = STYLE;
  document.head.appendChild(st);
  ciclo([cargarDolar, cargarCripto, cargarMonedas, cargarMacro, cargarAcciones]);
  setInterval(() => ciclo([cargarCripto]), 60000);          // cripto: 1 min
  setInterval(() => ciclo([cargarDolar, cargarMonedas]), 300000);  // dólar: 5 min
  setInterval(() => ciclo([cargarMacro, cargarAcciones]), 1800000); // macro: 30 min
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
