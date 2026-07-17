// fondo-live.js — Fondo Lautaro integrado en las secciones nativas del portal.
// Diseño: estética de Lauti (crema / navy / dorado, Playfair Display + IBM Plex
// Sans) en tema claro, con variante para el modo oscuro del sitio.
// Modelo contable v2: fee inicial 10% s/aportes, fee 2% mensual s/ganancia,
// ganancia de clientes contra CAPITAL NETO repartida por capital × días.
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs,
         addDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const DEV = new URLSearchParams(location.search).has('dev') &&
            ['localhost','127.0.0.1'].includes(location.hostname);

/* ── estilos scoped (.flx wrapper): diseño de Lauti, claro/oscuro ── */
const CSS = `
.flx { font-family:'IBM Plex Sans', system-ui, -apple-system, "Segoe UI", sans-serif;
  --flPanel:#ffffff; --flPanel2:#F8F5EE; --flHover:#FBF9F3; --flLine:rgba(0,0,0,.08); --flLine2:rgba(0,0,0,.14);
  --flInk:#23201A; --flInk2:#6B6456; --flMut:#8B8375; --flGold:#B08A3E; --flGoldDeep:#8A6A2F;
  --flGood:#1F7A4D; --flCrit:#B23A3A; --flTrack:#F1EDE3; --flShadow:0 1px 4px rgba(0,0,0,.04);
  --flS1:#2B5FB0; --flS2:#1F7A4D; --flS3:#B08A3E; --flS5:#5B3FA8; --flS6:#B23A3A; }
[data-theme="dark"] .flx {
  --flPanel:#152336; --flPanel2:#101C2E; --flHover:#1A2A44; --flLine:rgba(255,255,255,.08); --flLine2:rgba(255,255,255,.16);
  --flInk:#F0EDE8; --flInk2:rgba(240,237,232,.65); --flMut:rgba(240,237,232,.42); --flGold:#D4AF6E; --flGoldDeep:#E8CE96;
  --flGood:#5BBB6F; --flCrit:#E57373; --flTrack:#0C1830; --flShadow:none;
  --flS1:#5B8DDE; --flS2:#3FA97A; --flS3:#D4AF6E; --flS5:#9085E9; --flS6:#E57373; }
.flx .mono { font-variant-numeric: tabular-nums; }
.fl-head { display:flex; align-items:flex-end; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:6px; }
.fl-meta { font-size:10px; letter-spacing:.1em; color:var(--flMut); margin:0 0 18px; text-transform:uppercase; font-weight:500; }
.fl-status { display:inline-flex; align-items:center; gap:8px; font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--flInk2); border:1px solid var(--flLine2); border-radius:999px; padding:6px 14px; background:var(--flPanel); box-shadow:var(--flShadow); }
.fl-dot { width:8px; height:8px; border-radius:50%; background:#4ade80; box-shadow:0 0 8px #4ade80; }
.fl-dot.warn { background:#f87171; box-shadow:0 0 8px #f87171; animation:flblink 1.2s infinite; }
@keyframes flblink { 50% { opacity:.3; } }
.fl-strip { font-size:11.5px; border-radius:10px; padding:9px 14px; margin:0 0 14px; border:1px solid rgba(192,138,30,.35); background:rgba(192,138,30,.09); color:#7A5A14; line-height:1.6; }
[data-theme="dark"] .fl-strip { color:#E8CE96; background:rgba(212,175,110,.08); border-color:rgba(212,175,110,.3); }
.fl-strip.info { color:#2A4A80; background:rgba(43,95,176,.07); border-color:rgba(43,95,176,.3); }
[data-theme="dark"] .fl-strip.info { color:#9DBCE8; background:rgba(91,141,222,.08); border-color:rgba(91,141,222,.3); }
.fl-strip b { font-weight:600; }
.fl-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(195px,1fr)); gap:11px; margin-bottom:18px; }
.fl-kpi { background:var(--flPanel); border:1px solid var(--flLine); border-top:3px solid var(--fla,var(--flS1)); border-radius:12px; padding:13px 15px; box-shadow:var(--flShadow); }
.fl-kpi .l { font-size:9.5px; letter-spacing:.2em; color:var(--flMut); font-weight:700; margin-bottom:7px; text-transform:uppercase; }
.fl-kpi .v { font-family:'Playfair Display', serif; font-size:clamp(19px,2vw,25px); font-weight:500; color:var(--flInk); font-variant-numeric:tabular-nums; line-height:1.15; }
.fl-kpi .s { font-size:10.5px; color:var(--flInk2); margin-top:6px; line-height:1.6; }
.fl-pill { display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:600; letter-spacing:.03em; border-radius:999px; padding:1px 8px; vertical-align:middle; white-space:nowrap; }
.fl-pill.p { color:var(--flGood); background:rgba(31,122,77,.1); }
.fl-pill.n { color:var(--flCrit); background:rgba(178,58,58,.09); }
.fl-pill.m { color:var(--flInk2); background:var(--flPanel2); }
.fl-pos { color:var(--flGood) !important; } .fl-neg { color:var(--flCrit) !important; } .fl-mut { color:var(--flMut) !important; }
.fl-sec { display:flex; align-items:center; gap:10px; margin:24px 0 10px; font-size:10.5px; font-weight:700; letter-spacing:.28em; text-transform:uppercase; color:var(--flGoldDeep); }
.fl-sec::after { content:''; flex:1; height:1px; background:var(--flLine2); }
.fl-panel { background:var(--flPanel); border:1px solid var(--flLine); border-radius:12px; overflow-x:auto; box-shadow:var(--flShadow); }
.fl-panel table { width:100%; border-collapse:collapse; font-size:12.3px; min-width:540px; }
.fl-panel th { text-align:left; font-size:9.5px; letter-spacing:.15em; color:var(--flMut); padding:10px 13px; border-bottom:1px solid var(--flLine2); background:var(--flPanel2); text-transform:uppercase; font-weight:700; }
.fl-panel td { padding:9px 13px; border-bottom:1px solid var(--flLine); color:var(--flInk); font-variant-numeric:tabular-nums; }
.fl-panel tr:last-child td { border-bottom:none; }
.fl-panel tbody tr:hover td { background:var(--flHover); }
.fl-panel tr.tot td { background:var(--flPanel2); font-weight:600; }
.fl-num { text-align:right; }
.fl-tag { font-size:8.5px; letter-spacing:.13em; border:1px solid var(--flLine2); background:var(--flPanel2); border-radius:4px; padding:2px 6px; color:var(--flInk2); font-weight:700; white-space:nowrap; text-transform:uppercase; }
.fl-grid2 { display:grid; grid-template-columns:1.35fr 1fr; gap:13px; }
@media (max-width:900px) { .fl-grid2 { grid-template-columns:1fr; } }
.fl-blk { padding:12px 16px; border-bottom:1px solid var(--flLine); }
.fl-blk:last-child { border-bottom:none; }
.fl-blk-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:7px; flex-wrap:wrap; }
.fl-blk-head .nm { font-size:12.5px; font-weight:600; color:var(--flInk); letter-spacing:.02em; }
.fl-blk-head .amt { color:var(--flInk2); font-size:11.5px; font-variant-numeric:tabular-nums; }
.fl-blk-head .amt b { color:var(--flInk); font-weight:600; }
.fl-track { position:relative; background:var(--flTrack); border-radius:6px; height:14px; }
.fl-fill { height:100%; border-radius:6px 4px 4px 6px; background:var(--flc); transition:width .7s ease; }
.fl-target { position:absolute; top:-3px; bottom:-3px; width:2px; background:var(--flInk); }
.fl-chip { display:inline-block; width:9px; height:9px; border-radius:2px; background:var(--flc); margin-right:7px; }
.fl-chart { background:var(--flPanel); border:1px solid var(--flLine); border-radius:12px; padding:13px 15px; height:255px; position:relative; box-shadow:var(--flShadow); }
.fl-chart h4 { font-size:9.5px; letter-spacing:.2em; color:var(--flMut); margin-bottom:8px; text-transform:uppercase; font-weight:700; }
.fl-chart .inner { position:absolute; inset:40px 14px 12px; }
.fl-news { background:var(--flPanel); border:1px solid var(--flLine); border-radius:12px; box-shadow:var(--flShadow); }
.fl-news .card { padding:13px 16px; border-bottom:1px solid var(--flLine); }
.fl-news .card:last-child { border-bottom:none; }
.fl-news h5 { font-family:'Playfair Display', serif; font-size:14.5px; font-weight:600; color:var(--flInk); margin-bottom:4px; }
.fl-news .m { font-size:9.5px; letter-spacing:.13em; color:var(--flGoldDeep); margin-bottom:6px; text-transform:uppercase; font-weight:700; }
.fl-news p { font-size:11.5px; color:var(--flInk2); line-height:1.7; white-space:pre-wrap; }
.fl-foot { padding:8px 14px; font-size:10px; color:var(--flMut); border-top:1px solid var(--flLine); line-height:1.6; }
.fl-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; align-items:end; padding:16px; }
.fl-form .fg label { display:block; font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--flMut); margin-bottom:6px; font-weight:700; }
.fl-input { width:100%; background:var(--flPanel); border:1px solid var(--flLine2); border-radius:6px; padding:9px 11px; color:var(--flInk); font-family:inherit; font-size:13px; box-sizing:border-box; }
.fl-input:focus { outline:none; border-color:var(--flGold); }
.fl-btn { font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#fff; background:var(--flGold); border:none; border-radius:6px; padding:11px 22px; cursor:pointer; font-family:inherit; transition:background .2s; }
.fl-btn:hover { background:var(--flGoldDeep); }
.fl-btn:disabled { opacity:.55; cursor:default; }
.fl-ev-msg { padding:0 16px 12px; font-size:12px; line-height:1.6; }

/* ── shell 2a: sidebar navy (diseño "Ejecutivo+") ── */
.fl-layout { display:flex; align-items:stretch; gap:0; }
.fl-layout .portal-nav { flex-direction:column; align-items:stretch; width:216px; flex:none;
  height:auto !important; gap:2px !important; border-bottom:none !important;
  background:#14213D !important; border:none; border-radius:14px; padding:18px 12px !important;
  position:sticky; top:76px; align-self:flex-start; max-height:calc(100vh - 96px); overflow:auto; }
.fl-layout .portal-nav a { display:block !important; padding:10px 12px !important; margin:0 0 2px !important; border-radius:8px;
  color:rgba(255,255,255,.62) !important; font:500 11px 'IBM Plex Sans',sans-serif !important; letter-spacing:.12em !important;
  text-transform:uppercase; text-decoration:none; border-bottom:none !important; }
.fl-layout .portal-nav a:hover { background:rgba(255,255,255,.06); color:#fff !important; }
.fl-layout .portal-nav a.active { background:rgba(176,138,62,.18); color:#E8CE96 !important; border-left:2px solid #B08A3E; font-weight:600 !important; }
.fl-layout .portal-nav #portal-user-name { color:rgba(255,255,255,.85); font:600 11px 'IBM Plex Sans',sans-serif; padding:12px 12px 2px; margin:0 !important; border-top:1px solid rgba(255,255,255,.1); }
.fl-layout .portal-nav button { color:#B08A3E !important; text-align:left; padding:4px 12px 0 !important; font:600 10px 'IBM Plex Sans',sans-serif !important; letter-spacing:.12em !important; }
.fl-sbbrand { display:flex; align-items:center; gap:10px; padding:2px 10px 20px; }
.fl-sbbrand .lg { width:30px; height:30px; border:1.5px solid #B08A3E; border-radius:6px; display:flex; align-items:center; justify-content:center; flex:none; }
.fl-sbbrand .nm { font:500 15px 'Playfair Display',serif; letter-spacing:.18em; color:#fff; }
.fl-sbbrand .sb { font:500 7.5px 'IBM Plex Sans',sans-serif; letter-spacing:.3em; color:#B08A3E; }
.fl-layout .portal-content { flex:1; min-width:0; padding-left:22px; }
@media (max-width:920px) {
  .fl-layout { flex-direction:column; }
  .fl-layout .portal-nav { width:100%; flex-direction:row; flex-wrap:wrap; position:static; max-height:none; align-items:center; gap:2px; }
  .fl-sbbrand { padding:2px 10px; }
  .fl-layout .portal-nav a { display:inline-block !important; }
  .fl-layout .portal-content { padding:18px 0 0; }
}

/* ── dashboard 2a: filas, moneda, donut, objetivos, flujo ── */
.fl-cur { display:inline-flex; gap:3px; background:var(--flTrack); border-radius:8px; padding:3px; }
.fl-cur button { border:none; padding:5px 14px; border-radius:6px; cursor:pointer; font:600 11px 'IBM Plex Sans',sans-serif; color:var(--flInk2); background:transparent; }
.fl-cur button.on { background:#14213D; color:#E8CE96; }
.fl-dashrow { display:grid; grid-template-columns:1.55fr 340px; gap:13px; margin-bottom:14px; }
.fl-dashrow2 { display:grid; grid-template-columns:1.5fr 1fr; gap:13px; }
@media (max-width:1000px) { .fl-dashrow, .fl-dashrow2 { grid-template-columns:1fr; } }
.fl-pad { padding:16px 18px; overflow:visible; }
.fl-h4 { font-size:9.5px; letter-spacing:.16em; color:var(--flMut); text-transform:uppercase; font-weight:700; margin:0 0 4px; }
.fl-evohead { display:flex; align-items:baseline; gap:12px; margin-top:2px; }
.fl-evohead .big { font:500 22px 'Playfair Display',serif; color:var(--flInk); font-variant-numeric:tabular-nums; }
.fl-evochart { position:relative; height:212px; margin-top:10px; }
.fl-donutwrap { position:relative; height:176px; margin:6px 0 2px; }
.fl-dcenter { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none; }
.fl-dcenter .big { font:500 20px 'Playfair Display',serif; color:var(--flInk); }
.fl-dcenter .sm { font-size:9.5px; color:var(--flMut); }
.fl-leg { display:flex; flex-direction:column; gap:7px; margin-top:10px; }
.fl-leg .row { display:flex; justify-content:space-between; align-items:center; font-size:11px; }
.fl-leg .nm { display:flex; gap:7px; align-items:center; color:var(--flInk2); font-weight:500; }
.fl-leg .sq { width:8px; height:8px; border-radius:3px; background:var(--flc); }
.fl-leg .pc { font-weight:600; color:var(--flInk); font-variant-numeric:tabular-nums; }
.fl-objs { margin-top:13px; padding-top:11px; border-top:1px solid var(--flLine); display:flex; flex-direction:column; gap:9px; }
.fl-obj .hd { display:flex; justify-content:space-between; margin-bottom:4px; font-size:10.5px; }
.fl-obj .hd .n { color:var(--flInk2); font-weight:500; }
.fl-obj .hd .n i { color:var(--flMut); font-style:normal; }
.fl-obj .bar { position:relative; height:6px; background:var(--flTrack); border-radius:99px; }
.fl-obj .fill { position:absolute; left:0; top:0; bottom:0; background:var(--flc); border-radius:99px; }
.fl-obj .tick { position:absolute; top:-2px; height:10px; width:2px; background:var(--flInk); }
.fl-mini-tbl { width:100%; border-collapse:collapse; font-size:11.5px; min-width:0 !important; }
.fl-mini-tbl th { padding:7px 10px; background:var(--flPanel2); border-bottom:none; border-radius:0; font-size:9px; }
.fl-mini-tbl td { padding:9px 10px; border-bottom:1px solid var(--flLine); }
.fl-flowbars { display:flex; align-items:flex-end; justify-content:center; gap:8px; height:112px; margin-top:8px; }
.fl-fbar { flex:1; max-width:46px; border-radius:3px 3px 0 0; min-height:3px; }
.fl-fxlbl span { flex:1; max-width:46px; text-align:center; }
.fl-fxlbl { justify-content:center; gap:8px; }
.fl-fxlbl { display:flex; justify-content:space-between; margin-top:5px; font-size:8.5px; color:var(--flMut); }
.fl-flowfoot { display:flex; justify-content:space-between; gap:8px; margin-top:12px; padding-top:12px; border-top:1px solid var(--flLine); }
.fl-flowfoot .l { font-size:8.5px; letter-spacing:.12em; color:var(--flMut); font-weight:700; text-transform:uppercase; }
.fl-flowfoot .v { font:500 15px 'Playfair Display',serif; }
.fl-link { font-size:10.5px; font-weight:700; color:var(--flGoldDeep); cursor:pointer; letter-spacing:.04em; }
`;

/* ── bloques: mapeo por palabra clave (nombres del sheet v2) ── */
const BLOCK_DEFS = [
  { key:"pasivo",   match:/cauci|liquidez|letra/i, slot:"--flS1", fallback:"Caución / liquidez" },
  { key:"moderado", match:/bono|hard/i,            slot:"--flS2", fallback:"Bonos hard dollar" },
  { key:"agresivo", match:/cedear|accion/i,        slot:"--flS5", fallback:"CEDEARs / Acciones AR" },
  { key:"crypto",   match:/crypto|binance/i,       slot:"--flS3", fallback:"Crypto (Binance)" },
];
const STABLE = new Set(["USDT","USDC","BUSD","FDUSD","TUSD"]);

const fmtARS = n => "$" + Math.round(n).toLocaleString("es-AR");
const fmtUSD = n => "US$" + Number(n).toLocaleString("es-AR",{maximumFractionDigits:2});
const fmtPct = n => (n>=0?"+":"") + n.toFixed(2) + "%";
const cls = n => n>0.004?"fl-pos":n<-0.004?"fl-neg":"fl-mut";
const pill = (n, txt) => `<span class="fl-pill ${n>0.004?"p":n<-0.004?"n":"m"}">${n>0.004?"▲":n<-0.004?"▼":"—"} ${txt}</span>`;
const rKey = (obj, part) => { const k = Object.keys(obj||{}).find(x => x.toLowerCase().includes(part)); return k ? obj[k] : null; };
// resuelve un token del wrapper .flx (para pintar los charts con el tema activo)
function flTok(name) {
  const el = document.querySelector(".flx");
  return el ? getComputedStyle(el).getPropertyValue(name).trim() : "#888";
}

function blockOf(tipo) {
  const t = String(tipo || "").toUpperCase();
  if (t.includes("CAUCION") || t.includes("LETRA")) return "pasivo";
  if (t.includes("TITULOSPUBLICOS")) return "moderado";
  return "agresivo";
}

/* ── helpers del dashboard 2a ── */
const fmtM = n => "$" + (n/1e6).toLocaleString("es-AR", {maximumFractionDigits:1}) + " M";
const curCur = () => localStorage.getItem("fl-cur") === "USD" ? "USD" : "ARS";
window.flSetCur = cur => {
  localStorage.setItem("fl-cur", cur);
  if (lastPayload) renderAll(lastPayload.sync, lastPayload.sheet, lastPayload.news);
};
// cambiar de pestaña por código (para "Ver todas →")
window.flGo = tab => {
  const l = [...document.querySelectorAll(".portal-nav a")]
    .find(a => (a.getAttribute("onclick")||"").includes("'" + tab + "'"));
  if (l) l.click();
};

// flujo mensual desde la hoja MOVIMIENTOS: aportes (+) vs devoluciones/fees (−)
function flujoMensual(movs) {
  const map = {};
  const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  (movs||[]).forEach(m => {
    const t = String(m.tipo||"").toLowerCase();
    const externo = t.startsWith("aporte") || t.startsWith("devoluc") || t.startsWith("retiro") || t.startsWith("fee");
    if (!externo) return; // transferencias internas (A IOL, A Binance, ARS->USD) no son flujo
    const mm = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(String(m.fecha||"").trim());
    if (!mm) return;
    const y = mm[3].length === 2 ? "20" + mm[3] : mm[3];
    const key = y + "-" + String(mm[2]).padStart(2, "0");
    const o = map[key] || (map[key] = { a: 0, r: 0 });
    const ars = Math.abs(Number(m.ars) || 0);
    if (t.startsWith("aporte")) o.a += ars; else o.r += ars;
  });
  return Object.keys(map).sort().slice(-12).map(k => ({
    key: k, label: MES[Number(k.slice(5)) - 1] || k.slice(5),
    a: map[k].a, r: map[k].r, net: map[k].a - map[k].r }));
}

// shell 2a: convierte la nav del portal en el sidebar navy del diseño
function installShell() {
  if (document.querySelector(".fl-layout")) return;
  const nav = document.querySelector(".portal-nav");
  const content = document.querySelector(".portal-content");
  if (!nav || !content || nav.parentElement !== content.parentElement) return;
  const wrap = document.createElement("div");
  wrap.className = "fl-layout";
  nav.parentElement.insertBefore(wrap, nav);
  wrap.appendChild(nav);
  wrap.appendChild(content);
  nav.insertAdjacentHTML("afterbegin", `<div class="fl-sbbrand">
    <div class="lg"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 12 L5 6 L8 9 L12 3 L15 6" fill="none" stroke="#B08A3E" stroke-width="1.5"/></svg></div>
    <div><div class="nm">VALTIA</div><div class="sb">ANALYTICS</div></div></div>`);
}

function compute(d) {
  const iol = d.iol || {}, ec = iol.estado_cuenta || {}, pa = iol.portafolio_argentina || {};
  const activos = (pa.activos || []).map(a => {
    const t = a.titulo || {};
    return { sim: t.simbolo || "?", tipo: String(t.tipo || "ACTIVO").toUpperCase(),
      cant: Number(a.cantidad) || 0, ppc: Number(a.ppc) || 0, ult: Number(a.ultimoPrecio) || 0,
      val: Number(a.valorizado) || 0, pnl: Number(a.gananciaDinero) || 0, pnlPct: Number(a.gananciaPorcentaje) || 0,
      blk: blockOf(t.tipo) };
  }).sort((a,b) => b.val - a.val);
  const cuentas = ec.cuentas || [];
  const efARS = cuentas.filter(c => c.moneda === "peso_Argentino").reduce((s,c) => s + (Number(c.saldo)||0), 0);
  const efUSD = cuentas.filter(c => c.moneda === "dolar_Estadounidense").reduce((s,c) => s + (Number(c.saldo)||0), 0);
  const sumV = activos.reduce((s,a) => s + a.val, 0);
  let fx = null;
  if (Math.abs(efUSD) > 0.01 && ec.totalEnPesos) {
    const f = (Number(ec.totalEnPesos) - sumV - efARS) / efUSD;
    if (f > 500 && f < 20000) fx = Math.round(f * 100) / 100;
  }
  if (!fx) fx = Number(localStorage.getItem("fl-fx")) || 1400; else localStorage.setItem("fl-fx", String(fx));
  const iolTotal = Number(ec.totalEnPesos) || (sumV + efARS + efUSD * fx);
  const bin = d.binance || {};
  const fb = (bin.futures_balance || []).filter(b => STABLE.has(b.asset));
  const fut = fb.reduce((s,b) => s + (Number(b.balance)||0), 0);
  let upnl = fb.reduce((s,b) => s + (Number(b.crossUnPnl)||0), 0);
  const marks = {};
  (bin.positions || []).forEach(p => { marks[p.symbol] = Number(p.markPrice) || 0; });
  const open = (bin.positions || []).filter(p => Math.abs(Number(p.positionAmt)||0) > 0);
  upnl += open.filter(p => p.isolated).reduce((s,p) => s + (Number(p.unRealizedProfit)||0), 0);
  const btcP = marks["BTCUSDT"] || 0;
  let ebtcQty = 0, ebtcUsd = 0, eusdt = 0;
  ((bin.earn_flexible||{}).rows||[]).concat((bin.earn_locked||{}).rows||[]).forEach(r => {
    const amt = Number(r.totalAmount) || 0;
    if (r.asset === "BTC") { ebtcQty += amt; ebtcUsd += amt * btcP; }
    else if (STABLE.has(r.asset)) eusdt += amt;
    else ebtcUsd += amt * (marks[r.asset + "USDT"] || 0);
  });
  const binTotalUSD = fut + upnl + ebtcUsd + eusdt;
  const binTotal = binTotalUSD * fx;
  const total = iolTotal + binTotal;
  const blk = { pasivo: efARS + efUSD * fx, moderado: 0, agresivo: 0, crypto: binTotal };
  activos.forEach(a => { blk[a.blk] += a.val; });
  return { fx, activos, efARS, efUSD, sumV, iolTotal, fut, upnl, ebtcQty, ebtcUsd, eusdt, btcP,
           open, binTotalUSD, binTotal, total, blk, ts: d.actualizado_utc || null };
}

let charts = [];
function chart(id, cfg) { const el = document.getElementById(id); if (el) charts.push(new Chart(el, cfg)); }
// los charts creados en tabs ocultos quedan en 0x0 y resize() no alcanza:
// al cambiar de pestaña, el que quedo en cero y ahora es visible se recrea
window.flResizeCharts = () => {
  charts = charts.map(ch => {
    try {
      const cv = ch.canvas;
      if (cv && cv.offsetParent !== null && cv.width === 0) {
        const cfg = { type: ch.config.type, data: ch.config.data, options: ch.config.options };
        ch.destroy();
        return new Chart(cv, cfg);
      }
      ch.resize();
      return ch;
    } catch (e) { return ch; }
  });
};

function renderAll(d, sheet, news) {
  const c = compute(d);
  const sh = sheet || {};
  const clientes = sh.clientes || [];
  const resumen = sh.resumen || {};
  const snaps = sh.snapshots || [];
  const movs = sh.movimientos || [];
  const aportesBrutos = sh.aportes_brutos || {};
  const ts = c.ts ? new Date(c.ts) : null;
  const ageH = ts ? (Date.now() - ts.getTime()) / 36e5 : null;
  const fresh = ageH != null && ageH <= 48;

  const capNetoTot = rKey(resumen, "capital neto de clientes") ||
                     clientes.reduce((s,x) => s + (Number(x.capital_neto)||0), 0);
  const feePend = rKey(resumen, "fee gestor pendiente") || 0;
  const patrimonioLive = c.total - feePend;
  const ganLive = capNetoTot ? patrimonioLive - capNetoTot : null;
  const rendLive = capNetoTot ? ganLive / capNetoTot : null;
  const ganCorte = rKey(resumen, "ganancia de clientes");
  const rendCorte = rKey(resumen, "rendimiento clientes");
  const cclSheet = rKey(sh.params||{}, "ccl");
  const corte = String((sh.params||{})["Fecha de corte"] || "").slice(0,10);
  const pnlIol = c.activos.reduce((s,a) => s + a.pnl, 0);
  const costoIol = c.activos.reduce((s,a) => s + (a.val - a.pnl), 0);

  const blocks = BLOCK_DEFS.map(def => {
    const row = (sh.bloques||[]).find(b => def.match.test(String(b.nombre||"")));
    return { ...def, nombre: row ? row.nombre : def.fallback, tgt: row ? Number(row.pct) : 0 };
  });

  /* ── DASHBOARD 2a: datos derivados ── */
  const cur = curCur();
  const mny = n => cur === "USD" ? fmtUSD(n / c.fx) : fmtARS(n);
  // evolución: cierres del sheet (cada uno a su CCL) + valuación en vivo de hoy
  const snapPtsE = snaps.filter(s => Number(s.total_ars) > 0);
  const evoPts = snapPtsE.map(s => ({ label: s.cierre,
      v: cur === "USD" ? Number(s.total_ars) / (Number(s.ccl) || c.fx) : Number(s.total_ars) }))
    .concat([{ label: "hoy", v: cur === "USD" ? c.total / c.fx : c.total }]);
  const evoDelta = evoPts.length > 1 ? (evoPts[evoPts.length - 1].v / evoPts[0].v - 1) * 100 : null;
  // principales posiciones: IOL + agregados de Binance, ordenadas por valor
  const topPos = c.activos.map(a => {
      const b = blocks.find(x => x.key === a.blk) || {};
      return { sim: a.sim, bloque: b.nombre || "", slot: b.slot || "--flS1",
        cant: a.cant ? a.cant.toLocaleString("es-AR") : "—",
        ult: a.ult ? fmtARS(a.ult) : "—", val: a.val, pnl: a.pnlPct };
    })
    .concat([
      { sim: "BTC · Earn", bloque: "Crypto (Binance)", slot: "--flS3",
        cant: c.ebtcQty ? c.ebtcQty.toFixed(6) : "—", ult: c.btcP ? fmtUSD(c.btcP) : "—",
        val: c.ebtcUsd * c.fx, pnl: null },
      { sim: "USDT · Futuros + Earn", bloque: "Crypto (Binance)", slot: "--flS3",
        cant: "—", ult: "US$1,00", val: (c.fut + c.eusdt + c.upnl) * c.fx, pnl: null },
    ])
    .sort((a, b) => b.val - a.val).slice(0, 6);
  // flujo mensual (aportes vs devoluciones/fees) desde MOVIMIENTOS
  const flujo = flujoMensual(movs);
  const flMax = Math.max(...flujo.map(f => Math.abs(f.net)), 1);
  const apTot = flujo.reduce((s, f) => s + f.a, 0), reTot = flujo.reduce((s, f) => s + f.r, 0);
  // objetivos por bloque (composición card)
  const objMax = Math.max(...blocks.map(b => Math.max(c.blk[b.key] / c.total, b.tgt))) * 1.15;

  const newsHtml = news.length ? news.map(n => {
    const f = n.fecha && n.fecha.toDate ? n.fecha.toDate().toLocaleString("es-AR") : (n.fecha || "");
    return `<div class="card"><div class="m">${f}${n.fuente ? " · " + n.fuente : ""}</div>
      <h5>${n.titulo || "Briefing"}</h5>
      <p>${n.contenido || n.resumen || ""}</p></div>`;
  }).join("") : `<div class="card"><p class="fl-mut">Sin briefings todavía — la tarea diaria de Cowork los deja en la página Notion "Noticias Fondo" y aparecen acá.</p></div>`;

  document.getElementById("tab-dashboard").innerHTML = `<div class="flx">
    <div class="fl-head">
      <div>
        <div class="portal-title" style="margin-bottom:0">Fondo Lautaro</div>
        <div class="fl-meta" style="margin:6px 0 0">Sync ${ts ? ts.toLocaleString("es-AR") : "—"} · FX implícito ${c.fx.toLocaleString("es-AR")}${cclSheet ? " · CCL ref. " + Number(cclSheet).toLocaleString("es-AR") : ""}${corte ? " · corte contable " + corte : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="fl-status"><span class="fl-dot${fresh?"":" warn"}"></span>${fresh ? "Telemetría al día" : "Datos desactualizados"}</span>
        <span class="fl-cur">
          <button class="${cur==="ARS"?"on":""}" onclick="flSetCur('ARS')">ARS</button>
          <button class="${cur==="USD"?"on":""}" onclick="flSetCur('USD')">USD</button>
        </span>
      </div>
    </div>
    <div style="height:14px"></div>
    ${!fresh && ts ? `<div class="fl-strip"><b>Datos viejos:</b> el último sync es de hace ${Math.round(ageH/24)} días. Revisá la tarea programada de la PC (fondo_sync.py).</div>` : ""}
    <div class="fl-kpis">
      <div class="fl-kpi" style="--fla:var(--flGold)"><div class="l">Valor total del fondo</div>
        <div class="v mono">${mny(c.total)}</div><div class="s mono">${cur==="USD"?fmtARS(c.total):fmtUSD(c.total/c.fx)} @ FX ${c.fx.toLocaleString("es-AR")}</div></div>
      ${ganLive != null ? `<div class="fl-kpi" style="--fla:${ganLive>=0?"var(--flGood)":"var(--flCrit)"}"><div class="l">Ganancia clientes · MTM</div>
        <div class="v mono ${cls(ganLive)}">${ganLive>=0?"+":""}${mny(ganLive)}</div>
        <div class="s mono">${pill(rendLive*100, fmtPct(rendLive*100))} s/capital neto${ganCorte!=null?`<br>Al corte ${corte}: <span class="${cls(ganCorte)}">${ganCorte>=0?"+":""}${mny(ganCorte)}${rendCorte!=null?" ("+fmtPct(rendCorte*100)+")":""}</span>`:""}</div></div>` : ""}
      <div class="fl-kpi" style="--fla:var(--flS1)"><div class="l">IOL · Argentina</div>
        <div class="v mono">${mny(c.iolTotal)}</div>
        <div class="s mono">${(c.iolTotal/c.total*100).toFixed(1)}% del fondo · P&L pos. <span class="${cls(pnlIol)}">${pnlIol>=0?"+":""}${mny(pnlIol)} (${fmtPct(costoIol?pnlIol/costoIol*100:0)})</span></div></div>
      <div class="fl-kpi" style="--fla:var(--flS3)"><div class="l">Binance · Crypto</div>
        <div class="v mono">${fmtUSD(c.binTotalUSD)}</div>
        <div class="s mono">${fmtARS(c.binTotal)} · ${(c.binTotal/c.total*100).toFixed(1)}% del fondo</div></div>
      <div class="fl-kpi" style="--fla:${c.upnl>=0?"var(--flGood)":"var(--flCrit)"}"><div class="l">uPnL futuros · live</div>
        <div class="v mono ${cls(c.upnl)}">${fmtUSD(c.upnl)}</div>
        <div class="s mono">${c.open.length} posición${c.open.length===1?"":"es"} abierta${c.open.length===1?"":"s"}</div></div>
      ${feePend ? `<div class="fl-kpi" style="--fla:var(--flS2)"><div class="l">Fee gestor pendiente</div>
        <div class="v mono">${mny(feePend)}</div>
        <div class="s">10% inicial s/aportes + 2% mensual s/ganancia</div></div>` : ""}
    </div>

    <div class="fl-dashrow">
      <div class="fl-panel fl-pad" style="min-width:0">
        <h4 class="fl-h4">Evolución del valor del fondo</h4>
        <div class="fl-evohead"><span class="big">${mny(c.total)}</span>${evoDelta!=null?pill(evoDelta, fmtPct(evoDelta) + " desde el primer cierre"):""}</div>
        <div class="fl-evochart"><canvas id="flChEvo"></canvas></div>
        <div class="fl-foot" style="border-top:none;padding:8px 0 0">Cierres mensuales del sheet + valuación en vivo de hoy. La curva se densifica con cada sync diario.</div>
      </div>
      <div class="fl-panel fl-pad" style="min-width:0">
        <h4 class="fl-h4">Composición real del fondo</h4>
        <div class="fl-donutwrap"><canvas id="flChSplit"></canvas>
          <div class="fl-dcenter"><div class="big">${cur==="USD"?fmtUSD(c.total/c.fx):fmtM(c.total)}</div><div class="sm">${blocks.length} bloques</div></div></div>
        <div class="fl-leg">${blocks.map(b => `<div class="row" style="--flc:var(${b.slot})">
          <span class="nm"><span class="sq"></span>${b.nombre}</span>
          <span class="pc">${(c.blk[b.key]/c.total*100).toFixed(1)}%</span></div>`).join("")}</div>
        <div class="fl-objs">${blocks.map(b => {
          const rp = c.blk[b.key]/c.total, dev = (rp - b.tgt) * 100;
          return `<div class="fl-obj" style="--flc:var(${b.slot})">
            <div class="hd"><span class="n">${b.nombre.split("/")[0].trim()} <i>· obj ${(b.tgt*100).toFixed(0)}%</i></span>
              <span class="${cls(dev)}" style="font-weight:600;font-size:10px">${dev>=0?"▲":"▼"} ${Math.abs(dev).toFixed(1)}</span></div>
            <div class="bar"><div class="fill" style="width:${(rp/objMax*100).toFixed(1)}%"></div>
              <div class="tick" style="left:${(b.tgt/objMax*100).toFixed(1)}%"></div></div></div>`;
        }).join("")}</div>
      </div>
    </div>

    <div class="fl-dashrow2">
      <div class="fl-panel fl-pad" style="min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h4 class="fl-h4" style="margin:0">Principales posiciones</h4>
          <span class="fl-link" onclick="flGo('movimientos')">Ver todas →</span>
        </div>
        <table class="fl-mini-tbl">
          <thead><tr><th>Activo</th><th>Bloque</th><th class="fl-num">Cant.</th><th class="fl-num">Último</th><th class="fl-num">Valor</th><th class="fl-num">P&L</th></tr></thead>
          <tbody>${topPos.map(p => `<tr>
            <td style="font-weight:600">${p.sim}</td>
            <td style="color:var(--flMut)"><span class="fl-chip" style="--flc:var(${p.slot})"></span>${p.bloque.split("/")[0].trim()}</td>
            <td class="fl-num">${p.cant}</td><td class="fl-num">${p.ult}</td>
            <td class="fl-num" style="font-weight:600">${mny(p.val)}</td>
            <td class="fl-num ${p.pnl!=null?cls(p.pnl):"fl-mut"}" style="font-weight:600">${p.pnl!=null?fmtPct(p.pnl):"—"}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="fl-panel fl-pad" style="min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4 class="fl-h4" style="margin:0">Flujo neto mensual</h4>
          <span class="${cls(apTot-reTot)}" style="font-weight:600;font-size:11px">${apTot-reTot>=0?"+":""}${fmtM(apTot-reTot)}</span>
        </div>
        ${flujo.length ? `<div class="fl-flowbars">${flujo.map(f => `<div class="fl-fbar" title="${f.label}: ${f.net>=0?"+":""}${fmtM(f.net)}"
            style="height:${Math.max(4, Math.abs(f.net)/flMax*100).toFixed(0)}%;background:var(${f.net>=0?"--flGold":"--flS6"});opacity:${f.net>=0?".9":".75"}"></div>`).join("")}</div>
        <div class="fl-fxlbl">${flujo.map(f => `<span>${f.label}</span>`).join("")}</div>` :
        `<div class="fl-foot" style="border-top:none;padding:20px 0">Sin movimientos externos registrados todavía.</div>`}
        <div class="fl-flowfoot">
          <div><div class="l">Aportes</div><div class="v ${apTot?"fl-pos":"fl-mut"}">${apTot?"+"+fmtM(apTot):"$0"}</div></div>
          <div><div class="l">Salidas · fees</div><div class="v ${reTot?"fl-neg":"fl-mut"}">${reTot?"−"+fmtM(reTot):"$0"}</div></div>
          <div><div class="l">Flujo neto</div><div class="v" style="color:var(--flInk)">${apTot-reTot>=0?"+":""}${fmtM(apTot-reTot)}</div></div>
        </div>
      </div>
    </div>

    <div class="fl-sec">Briefing del día · Cowork</div>
    <div class="fl-news">${newsHtml}</div></div>`;

  /* ── RENDIMIENTOS: cierres mensuales (SNAPSHOTS) ── */
  const snapRows = snaps.map(s => `<tr><td><b>${s.cierre}</b></td>
    <td class="fl-num">${s.total_ars?fmtARS(s.total_ars):"—"}</td>
    <td class="fl-num ${cls(Number(s.ganancia_mes)||0)}">${s.ganancia_mes!=null?fmtARS(s.ganancia_mes):"—"}</td>
    <td class="fl-num">${s.fee?fmtARS(s.fee):"—"}</td>
    <td class="fl-num">${s.iol_ars?fmtARS(s.iol_ars):"—"}</td>
    <td class="fl-num">${s.binance_usd?fmtUSD(s.binance_usd):"—"}</td>
    <td class="fl-num">${s.ccl?Number(s.ccl).toLocaleString("es-AR"):"—"}</td></tr>`).join("");
  document.getElementById("tab-rendimientos").innerHTML = `<div class="flx">
    <div class="portal-title">Rendimientos del fondo</div>
    <div class="fl-meta">Cierres de mes (hoja SNAPSHOTS) · base del fee 2% sobre ganancia${ganLive!=null?` · ganancia actual de clientes ${fmtPct(rendLive*100)}`:""}</div>
    <div class="fl-grid2">
      <div class="fl-panel"><table>
        <thead><tr><th>Cierre</th><th class="fl-num">Total ARS</th><th class="fl-num">Ganancia mes</th><th class="fl-num">Fee 2%</th><th class="fl-num">IOL ARS</th><th class="fl-num">Binance USD</th><th class="fl-num">CCL</th></tr></thead>
        <tbody>${snapRows || '<tr><td colspan="7" class="fl-mut" style="text-align:center">Sin cierres cargados todavía</td></tr>'}</tbody></table>
        <div class="fl-foot">La ganancia mensual es provisoria hasta completar las valuaciones IOL de 31/05 y 30/06 en el sheet (celdas amarillas de SNAPSHOTS).</div></div>
      <div class="fl-chart"><h4>Valor del fondo (ARS) por cierre</h4><div class="inner"><canvas id="flChHist"></canvas></div></div>
    </div></div>`;

  /* ── POSICIONES (tab movimientos) ── */
  const rows = c.activos.map(a => {
    const b = blocks.find(x => x.key === a.blk);
    return `<tr><td class="mono"><b>${a.sim}</b></td>
      <td><span class="fl-chip" style="--flc:var(${b.slot})"></span><span class="fl-tag">${a.tipo}</span></td>
      <td class="fl-num">${a.cant || "—"}</td><td class="fl-num">${a.ppc ? fmtARS(a.ppc) : "—"}</td>
      <td class="fl-num">${a.ult ? fmtARS(a.ult) : "—"}</td><td class="fl-num">${fmtARS(a.val)}</td>
      <td class="fl-num ${cls(a.pnl)}">${a.pnl>=0?"+":""}${fmtARS(a.pnl)} ${pill(a.pnlPct, fmtPct(a.pnlPct))}</td></tr>`;
  }).join("");
  const openRows = c.open.length ? c.open.map(p => {
    const u = Number(p.unRealizedProfit)||0, mark = Number(p.markPrice)||0, liq = Number(p.liquidationPrice)||0;
    const dLiq = mark && liq ? Math.abs(liq - mark) / mark * 100 : null;
    const liqWarn = dLiq != null && dLiq < 15;
    return `<tr><td><b>${p.symbol}</b> <span class="fl-tag">${Number(p.positionAmt)<0?"Short":"Long"} ${p.leverage}x</span></td>
      <td class="fl-num">${p.positionAmt}</td>
      <td class="fl-num">${fmtUSD(Number(p.entryPrice)||0)}</td><td class="fl-num">${fmtUSD(mark)}</td>
      <td class="fl-num ${cls(u)}">${fmtUSD(u)}</td>
      <td class="fl-num ${liqWarn?"fl-neg":""}">${fmtUSD(liq)}${dLiq!=null?` <span class="fl-pill ${liqWarn?"n":"m"}">${liqWarn?"⚠ ":""}${dLiq.toFixed(1)}%</span>`:""}</td>
      <td class="fl-num" style="color:var(--flInk2)">${p.marginType||""}</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="fl-mut" style="text-align:center">Sin posiciones abiertas de futuros</td></tr>`;
  const movRows = movs.slice().reverse().map(m => `<tr>
    <td style="white-space:nowrap">${m.fecha}</td><td><span class="fl-tag">${m.tipo}</span></td>
    <td style="color:var(--flInk2)">${m.detalle||""}</td>
    <td class="fl-num ${m.ars!=null?cls(m.ars):""}">${m.ars!=null?(m.ars>=0?"+":"")+fmtARS(m.ars):"—"}</td>
    <td class="fl-num">${m.usd!=null?fmtUSD(m.usd):"—"}</td></tr>`).join("");
  document.getElementById("tab-movimientos").innerHTML = `<div class="flx">
    <div class="portal-title">Posiciones</div>
    <div class="fl-meta">IOL + Binance al último sync · ${ts ? ts.toLocaleString("es-AR") : "—"}</div>
    <div class="fl-sec">IOL · P&L sobre costo</div>
    <div class="fl-panel"><table>
      <thead><tr><th>Activo</th><th>Bloque / tipo</th><th class="fl-num">Cant.</th><th class="fl-num">PPC</th><th class="fl-num">Último</th><th class="fl-num">Valorizado</th><th class="fl-num">P&L</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="fl-sec">Binance · futuros y earn</div>
    <div class="fl-grid2">
      <div class="fl-panel"><table>
        <thead><tr><th>Posición</th><th class="fl-num">Cant.</th><th class="fl-num">Entry</th><th class="fl-num">Mark</th><th class="fl-num">uPnL</th><th class="fl-num">Liq. (dist.)</th><th class="fl-num">Margen</th></tr></thead>
        <tbody>${openRows}</tbody></table>
      <table style="border-top:1px solid var(--flLine2)">
        <thead><tr><th>Componente</th><th class="fl-num">USD</th><th class="fl-num">ARS</th></tr></thead>
        <tbody>
        <tr><td>Futuros (wallet)</td><td class="fl-num">${fmtUSD(c.fut)}</td><td class="fl-num">${fmtARS(c.fut*c.fx)}</td></tr>
        <tr><td>PnL no realizado</td><td class="fl-num ${cls(c.upnl)}">${fmtUSD(c.upnl)}</td><td class="fl-num ${cls(c.upnl)}">${fmtARS(c.upnl*c.fx)}</td></tr>
        <tr><td>Earn BTC (${c.ebtcQty.toFixed(8)} ₿${c.btcP ? " @ " + fmtUSD(c.btcP) : ""})</td><td class="fl-num">${fmtUSD(c.ebtcUsd)}</td><td class="fl-num">${fmtARS(c.ebtcUsd*c.fx)}</td></tr>
        <tr><td>Earn USDT</td><td class="fl-num">${fmtUSD(c.eusdt)}</td><td class="fl-num">${fmtARS(c.eusdt*c.fx)}</td></tr>
        <tr class="tot"><td>Total Binance</td><td class="fl-num">${fmtUSD(c.binTotalUSD)}</td><td class="fl-num">${fmtARS(c.binTotal)}</td></tr>
        </tbody></table></div>
      <div class="fl-chart"><h4>Composición Binance (USD)</h4><div class="inner"><canvas id="flChBin"></canvas></div></div>
    </div>
    ${movRows ? `<div class="fl-sec">Últimos movimientos del fondo</div>
    <div class="fl-panel"><table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th class="fl-num">ARS</th><th class="fl-num">USD</th></tr></thead>
      <tbody>${movRows}</tbody></table>
      <div class="fl-foot">Registro de la hoja MOVIMIENTOS del sheet (últimos ${movs.length}).</div></div>` : ""}</div>`;

  /* ── ADMIN: clientes del fondo + registro de eventos ── */
  if (clientes.length) {
    const cliRows = clientes.map(x => {
      const neto = Number(x.capital_neto)||0, pct = Number(x.pct)||0;
      const gan = ganLive != null ? ganLive * pct : (Number(x.ganancia)||0);
      const valor = neto + gan;
      const ret = neto ? gan / neto * 100 : 0;
      return `<tr><td><b>${x.nombre}</b>${x.devoluciones?` <span class="fl-tag">Devol. ${fmtARS(x.devoluciones)}</span>`:""}</td>
        <td class="fl-num">${fmtARS(aportesBrutos[x.nombre]||0)}</td>
        <td class="fl-num">${fmtARS(neto)}</td>
        <td class="fl-num">${(pct*100).toFixed(1)}%</td>
        <td class="fl-num">${fmtARS(valor)}</td>
        <td class="fl-num ${cls(gan)}">${gan>=0?"+":""}${fmtARS(gan)}</td>
        <td class="fl-num">${pill(ret, fmtPct(ret))}</td></tr>`;
    }).join("");
    const adminTab = document.getElementById("tab-admin");
    const old = adminTab.querySelector("#fl-clientes");
    if (old) old.remove();
    adminTab.insertAdjacentHTML("afterbegin", `<div id="fl-clientes" class="flx">
      <div class="fl-sec" style="margin-top:6px">Clientes del fondo · valor y ganancia en vivo</div>
      <div class="fl-panel" style="margin-bottom:22px"><table>
        <thead><tr><th>Cliente</th><th class="fl-num">Aporte bruto</th><th class="fl-num">Capital neto</th><th class="fl-num">Partic.</th><th class="fl-num">Valor hoy</th><th class="fl-num">Ganancia</th><th class="fl-num">Rendimiento</th></tr></thead>
        <tbody>${cliRows}
        <tr class="tot"><td>TOTAL</td>
          <td class="fl-num">${fmtARS(Object.values(aportesBrutos).reduce((s,v)=>s+v,0))}</td>
          <td class="fl-num">${fmtARS(capNetoTot)}</td><td class="fl-num">100%</td>
          <td class="fl-num">${fmtARS(patrimonioLive)}</td>
          <td class="fl-num ${cls(ganLive)}">${ganLive>=0?"+":""}${fmtARS(ganLive)}</td>
          <td class="fl-num">${pill(rendLive*100, fmtPct(rendLive*100))}</td></tr></tbody></table>
        <div class="fl-foot">Capital neto = aportes − fee inicial 10% − devoluciones. Ganancia en vivo = (valor del fondo − fee gestor pendiente) − capital neto, repartida por participación (capital × días). <b>Mark-to-market:</b> incluye el uPnL de futuros y usa FX implícito — puede diferir del balance del sheet (Binance por wallet y CCL ${cclSheet ? Number(cclSheet).toLocaleString("es-AR") : "de referencia"}).${ganCorte!=null?` Al corte ${corte}: ${ganCorte>=0?"+":""}${fmtARS(ganCorte)} (${rendCorte!=null?fmtPct(rendCorte*100):"—"}).`:""} ${sh.nota_clientes||""}</div>
      </div>
      <div class="fl-sec">Registrar aporte / retiro</div>
      <div class="fl-panel" style="margin-bottom:22px;overflow:visible">
        <div class="fl-form">
          <div class="fg"><label>Tipo</label>
            <select id="fl-ev-tipo" class="fl-input">
              <option>Aporte</option>
              <option>Retiro / Devolución</option>
            </select></div>
          <div class="fg"><label>Cliente</label>
            <input id="fl-ev-cliente" class="fl-input" list="fl-ev-clientes" placeholder="Nombre">
            <datalist id="fl-ev-clientes">${clientes.map(x=>`<option value="${x.nombre}">`).join("")}</datalist></div>
          <div class="fg"><label>Monto ARS</label>
            <input id="fl-ev-monto" class="fl-input" type="number" min="1" step="any" placeholder="0"></div>
          <div class="fg"><label>Fecha</label>
            <input id="fl-ev-fecha" class="fl-input" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="fg"><label>Nota (opcional)</label>
            <input id="fl-ev-nota" class="fl-input" placeholder="Ej. transferencia Galicia"></div>
          <div class="fg"><button class="fl-btn" id="fl-ev-btn" onclick="flRegistrarEvento()">Registrar</button></div>
        </div>
        <div class="fl-ev-msg" id="fl-ev-msg"></div>
        <div class="fl-foot">El evento queda <b>pendiente</b> y el sync diario (9:00, o corré <code>run_sync.bat</code>) lo consolida en el sheet: los aportes entran como fila nueva en CLIENTES (fee 10% y participación se calculan solos) y todo queda logueado en MOVIMIENTOS.</div>
      </div>
      <div class="fl-sec">Eventos registrados</div>
      <div class="fl-panel" id="fl-eventos" style="margin-bottom:22px"><div class="fl-foot" style="border-top:none">Cargando…</div></div>
      </div>`);
    flLoadEventos();
  }

  /* ── charts (colores resueltos del tema activo) ── */
  charts.forEach(ch => ch.destroy()); charts = [];
  const panelBg = flTok("--flPanel"), inkSub = flTok("--flInk2"), lineC = flTok("--flLine") || "rgba(0,0,0,.08)";
  const gold = flTok("--flGold");
  const blockColors = blocks.map(b => flTok(b.slot));
  Chart.defaults.color = inkSub;
  Chart.defaults.font.family = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  const legend = { position:"bottom", labels:{ boxWidth:10, boxHeight:10, font:{size:10}, color:inkSub, padding:12 } };
  // donut de composición (leyenda propia en la card, centro con el total)
  chart("flChSplit", { type:"doughnut",
    data:{ labels: blocks.map(b=>b.nombre), datasets:[{ data: blocks.map(b=>c.blk[b.key]),
      backgroundColor: blockColors, borderColor:panelBg, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"66%", plugins:{ legend:{ display:false } } } });
  // evolución del valor del fondo (cierres + hoy)
  if (evoPts.length && document.getElementById("flChEvo")) {
    chart("flChEvo", { type:"line",
      data:{ labels: evoPts.map(p=>p.label),
        datasets:[{ label:"Fondo", data: evoPts.map(p=>p.v), borderColor:gold,
          backgroundColor:"rgba(176,138,62,.13)", fill:true, borderWidth:2,
          pointRadius: evoPts.length < 20 ? 4 : 0, pointBackgroundColor:gold, tension:.3 }] },
      options:{ responsive:true, maintainAspectRatio:false,
        interaction:{ mode:"index", intersect:false },
        plugins:{ legend:{ display:false } },
        scales:{ y:{ grid:{ color:lineC }, ticks:{ color:inkSub, font:{size:10},
                  callback:v => cur==="USD" ? "US$"+(Number(v)/1e3).toLocaleString("es-AR")+"k" : "$"+(Number(v)/1e6).toLocaleString("es-AR")+"M" } },
                 x:{ grid:{ display:false }, ticks:{ color:inkSub, font:{size:10} } } } } });
  }
  chart("flChBin", { type:"doughnut",
    data:{ labels:["Futuros","PnL no real.","Earn BTC","Earn USDT"],
      datasets:[{ data:[c.fut,c.upnl,c.ebtcUsd,c.eusdt].map(v=>Math.abs(v)),
      backgroundColor:[flTok("--flS1"), flTok("--flS2"), flTok("--flS3"), flTok("--flS5")],
      borderColor:panelBg, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend } } });
  const snapPts = snaps.filter(s => Number(s.total_ars) > 0);
  if (snapPts.length) {
    chart("flChHist", { type:"line",
      data:{ labels: snapPts.map(s=>s.cierre),
        datasets:[{ data: snapPts.map(s=>Number(s.total_ars)), borderColor:gold,
          backgroundColor:"rgba(176,138,62,.14)", fill:true, borderWidth:2,
          pointRadius:4, pointBackgroundColor:gold, tension:.25 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
        scales:{ y:{ grid:{ color:lineC }, ticks:{ color:inkSub, font:{size:10.5}, callback:v=>"$"+(Number(v)/1e6).toLocaleString("es-AR")+"M" } },
                 x:{ grid:{ display:false }, ticks:{ color:inkSub, font:{size:10.5} } } } } });
  }

  // pestaña "Movimientos" pasa a llamarse "Posiciones" para el admin
  const movLink = [...document.querySelectorAll(".portal-nav a")].find(a => a.textContent.trim() === "Movimientos");
  if (movLink) movLink.textContent = "Posiciones";
}

/* ── eventos: registrar y listar aportes/retiros ── */
let _db = null;
const EV_ESTADOS = { pendiente:["m","Pendiente de sync"], aplicado:["p","Aplicado al sheet"],
                     revisar_manual:["n","Revisar en el sheet"], error:["n","Error al aplicar"] };

window.flRegistrarEvento = async function() {
  const msg = document.getElementById("fl-ev-msg");
  const btn = document.getElementById("fl-ev-btn");
  const tipo = document.getElementById("fl-ev-tipo").value;
  const cliente = document.getElementById("fl-ev-cliente").value.trim();
  const monto = Number(document.getElementById("fl-ev-monto").value);
  const fecha = document.getElementById("fl-ev-fecha").value;
  const nota = document.getElementById("fl-ev-nota").value.trim();
  const say = (t, ok) => { msg.innerHTML = `<span class="${ok?"fl-pos":"fl-neg"}">${t}</span>`; };
  if (!cliente) return say("Completá el nombre del cliente.");
  if (!monto || monto <= 0) return say("El monto tiene que ser mayor a cero.");
  if (!fecha) return say("Elegí la fecha del movimiento.");
  if (!_db) return say("Modo dev: el registro solo funciona en producción.");
  btn.disabled = true;
  try {
    await addDoc(collection(_db, "fondoEventos"), {
      tipo, cliente, monto_ars: monto, fecha, nota,
      estado: "pendiente", creado: serverTimestamp() });
    say(`✓ ${tipo} de ${fmtARS(monto)} para ${cliente} registrado. Se consolida en el sheet en el próximo sync.`, true);
    document.getElementById("fl-ev-monto").value = "";
    document.getElementById("fl-ev-nota").value = "";
    flLoadEventos();
  } catch (e) {
    say("No se pudo guardar: " + String(e).slice(0, 140));
  }
  btn.disabled = false;
};

window.flLoadEventos = async function() {
  const box = document.getElementById("fl-eventos");
  if (!box) return;
  if (!_db) { box.innerHTML = `<div class="fl-foot" style="border-top:none">Modo dev — sin eventos.</div>`; return; }
  try {
    const snap = await getDocs(query(collection(_db, "fondoEventos"), orderBy("creado", "desc"), limit(10)));
    if (snap.empty) {
      box.innerHTML = `<div class="fl-foot" style="border-top:none">Sin eventos registrados todavía.</div>`;
      return;
    }
    const rows = snap.docs.map(d => {
      const e = d.data();
      const [k, label] = EV_ESTADOS[e.estado] || ["m", e.estado];
      const esAporte = String(e.tipo||"").toLowerCase().startsWith("aporte");
      return `<tr><td style="white-space:nowrap">${e.fecha||""}</td>
        <td><span class="fl-tag">${e.tipo||""}</span></td><td><b>${e.cliente||""}</b>${e.nota?` <span style="color:var(--flInk2);font-size:11px">· ${e.nota}</span>`:""}</td>
        <td class="fl-num ${esAporte?"fl-pos":"fl-neg"}">${esAporte?"+":"−"}${fmtARS(e.monto_ars||0)}</td>
        <td class="fl-num"><span class="fl-pill ${k}">${label}</span></td></tr>`;
    }).join("");
    box.innerHTML = `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cliente</th><th class="fl-num">Monto</th><th class="fl-num">Estado</th></tr></thead><tbody>${rows}</tbody></table>`;
  } catch (e) {
    box.innerHTML = `<div class="fl-foot" style="border-top:none">No se pudieron cargar los eventos (${String(e).slice(0,100)}).</div>`;
  }
};

async function fetchAll() {
  if (DEV) {
    const j = async f => { const r = await fetch(f); return r.ok ? await r.json() : null; };
    return { sync: await j("dev-data/sync_latest.json"), sheet: await j("dev-data/sheet_meta.json"),
      news: [{ titulo:"Briefing demo", fecha:"09/07/2026", fuente:"cowork", contenido:"Briefing de ejemplo (modo dev)." }] };
  }
  const db = getFirestore(getApp());
  _db = db;
  const [syncSnap, sheetSnap, newsSnap] = await Promise.all([
    getDoc(doc(db, "fondoSync", "latest")),
    getDoc(doc(db, "fondoMeta", "sheet")),
    getDocs(query(collection(db, "noticiasFondo"), orderBy("fecha", "desc"), limit(5))).catch(() => null),
  ]);
  return {
    sync: syncSnap.exists() ? JSON.parse(syncSnap.data().json) : null,
    sheet: sheetSnap.exists() ? JSON.parse(sheetSnap.data().json) : null,
    news: newsSnap ? newsSnap.docs.map(d => d.data()) : [],
  };
}

let started = false;
let lastPayload = null;
window.initFondoAdmin = async function initFondoAdmin() {
  if (started) return; started = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  installShell(); // sidebar navy (diseño 2a "Ejecutivo+")
  // tipografías del diseño (Playfair Display + IBM Plex Sans)
  if (!document.querySelector('link[href*="Playfair"]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
  }
  try {
    const { sync, sheet, news } = await fetchAll();
    if (!sync) {
      document.getElementById("tab-dashboard").insertAdjacentHTML("afterbegin",
        `<div class="flx"><div class="fl-strip"><b>Sin snapshot</b> <code>fondoSync/latest</code> en Firestore — corré fondo_sync.py o esperá la corrida de las 9:00.</div></div>`);
      return;
    }
    lastPayload = { sync, sheet, news };
    renderAll(sync, sheet, news);
    // el toggle claro/oscuro del portal cambia data-theme: re-renderizar con los tokens nuevos
    new MutationObserver(() => { if (lastPayload) renderAll(lastPayload.sync, lastPayload.sheet, lastPayload.news); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch (e) {
    document.getElementById("tab-dashboard").insertAdjacentHTML("afterbegin",
      `<div class="flx"><div class="fl-strip"><b>No se pudo cargar el fondo:</b> ${String(e).slice(0,200)}</div></div>`);
  }
};
if (window.__fondoAdminPending) window.initFondoAdmin();
