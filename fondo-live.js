// fondo-live.js — Fondo Lautaro en las secciones nativas del portal (solo admin).
// Modelo contable v2 (sheet 08/07/2026): fee inicial 10% sobre aportes, fee 2%
// mensual sobre ganancias, ganancia de clientes contra CAPITAL NETO (aportes
// - fee inicial - devoluciones), repartida por capital ponderado por dias.
// Datos: Firestore fondoSync/latest (telemetria IOL+Binance) + fondoMeta/sheet.
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs,
         addDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const DEV = new URLSearchParams(location.search).has('dev') &&
            ['localhost','127.0.0.1'].includes(location.hostname);

/* ── estilos scoped: tokens del portal, tipografía de marca ── */
const CSS = `
.fl-head { display:flex; align-items:flex-end; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:6px; }
.fl-meta { font-size:11px; letter-spacing:.08em; color:var(--muted); margin:0 0 22px; text-transform:uppercase; }
.fl-status { display:inline-flex; align-items:center; gap:8px; font-size:10px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--sub); border:1px solid var(--border); border-radius:999px; padding:6px 14px; background:var(--card); }
.fl-dot { width:7px; height:7px; border-radius:50%; background:var(--green); box-shadow:0 0 0 3px rgba(46,125,50,.15); }
.fl-dot.warn { background:#C62828; box-shadow:0 0 0 3px rgba(198,40,40,.15); }
.fl-strip { font-size:13px; border-radius:8px; padding:12px 16px; margin:0 0 18px; border:1px solid var(--border); border-left:3px solid var(--gold); background:var(--card); color:var(--sub); line-height:1.65; }
.fl-strip b { color:var(--text); font-weight:600; }
.fl-strip.warn { border-left-color:#C62828; }
.fl-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:26px; }
.fl-kpi { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:18px 20px 16px; position:relative; }
.fl-kpi::before { content:''; position:absolute; top:0; left:20px; width:26px; height:2px; background:var(--gold); opacity:.85; }
.fl-kpi .l { font-family:'Jost',sans-serif; font-size:9.5px; letter-spacing:.2em; color:var(--muted); font-weight:600; margin-bottom:10px; text-transform:uppercase; }
.fl-kpi .v { font-family:'Cormorant Garamond',serif; font-size:clamp(24px,2.2vw,31px); font-weight:500; color:var(--text); line-height:1.05; font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
.fl-kpi .s { font-size:11.5px; color:var(--sub); margin-top:9px; line-height:1.7; }
.fl-pill { display:inline-flex; align-items:center; gap:3px; font-family:'Jost',sans-serif; font-size:10.5px; font-weight:600; letter-spacing:.03em; border-radius:999px; padding:1px 8px; vertical-align:middle; white-space:nowrap; }
.fl-pill.p { color:var(--green); background:rgba(46,125,50,.1); }
.fl-pill.n { color:var(--red); background:rgba(198,40,40,.09); }
.fl-pill.m { color:var(--sub); background:var(--bg3); }
.fl-pos { color:var(--green) !important; } .fl-neg { color:var(--red) !important; } .fl-mut { color:var(--muted) !important; }
.fl-sec { display:flex; align-items:center; gap:12px; margin:30px 0 14px; font-family:'Jost',sans-serif; font-size:10px; font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:var(--gold); }
.fl-sec::before { content:''; display:block; width:32px; height:1px; background:var(--gold); opacity:.6; }
.fl-sec::after { content:''; flex:1; height:1px; background:var(--border); }
.fl-panel { background:var(--card); border:1px solid var(--border); border-radius:10px; overflow-x:auto; }
.fl-panel table { width:100%; border-collapse:collapse; font-size:13px; min-width:540px; }
.fl-panel th { text-align:left; font-family:'Jost',sans-serif; font-size:9.5px; letter-spacing:.16em; color:var(--muted); padding:12px 16px; border-bottom:1px solid var(--border); text-transform:uppercase; font-weight:600; }
.fl-panel td { padding:11px 16px; border-bottom:1px solid var(--border); color:var(--text); font-variant-numeric:tabular-nums; }
.fl-panel tr:last-child td { border-bottom:none; }
.fl-panel tbody tr:hover td { background:var(--bg3); }
.fl-panel tr.tot td { background:var(--bg3); font-weight:600; }
.fl-num { text-align:right; }
.fl-tag { font-family:'Jost',sans-serif; font-size:8.5px; letter-spacing:.12em; border:1px solid var(--border); border-radius:3px; padding:2px 7px; color:var(--sub); font-weight:600; white-space:nowrap; text-transform:uppercase; }
.fl-grid2 { display:grid; grid-template-columns:1.35fr 1fr; gap:14px; }
@media (max-width:900px) { .fl-grid2 { grid-template-columns:1fr; } }
.fl-blk { padding:15px 20px; border-bottom:1px solid var(--border); }
.fl-blk:last-child { border-bottom:none; }
.fl-blk-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:9px; flex-wrap:wrap; }
.fl-blk-head .nm { font-family:'Jost',sans-serif; font-size:13px; font-weight:500; color:var(--text); letter-spacing:.02em; }
.fl-blk-head .amt { color:var(--sub); font-size:12px; font-variant-numeric:tabular-nums; }
.fl-blk-head .amt b { color:var(--text); font-weight:600; }
.fl-track { position:relative; background:var(--bg3); border-radius:999px; height:9px; }
.fl-fill { height:100%; border-radius:999px; background:var(--flc); transition:width .7s ease; }
.fl-target { position:absolute; top:-4px; bottom:-4px; width:2px; background:var(--sub); border-radius:1px; }
.fl-chip { display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--flc); margin-right:8px; }
.fl-chart { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:16px 18px; height:270px; position:relative; }
.fl-chart h4 { font-family:'Jost',sans-serif; font-size:9.5px; letter-spacing:.18em; color:var(--muted); margin-bottom:8px; text-transform:uppercase; font-weight:600; }
.fl-chart .inner { position:absolute; inset:44px 16px 14px; }
.fl-news { background:var(--card); border:1px solid var(--border); border-radius:10px; }
.fl-news .card { padding:15px 20px; border-bottom:1px solid var(--border); }
.fl-news .card:last-child { border-bottom:none; }
.fl-news h5 { font-family:'Cormorant Garamond',serif; font-size:17px; font-weight:600; color:var(--text); margin-bottom:4px; letter-spacing:.01em; }
.fl-news .m { font-family:'Jost',sans-serif; font-size:9.5px; letter-spacing:.14em; color:var(--gold); margin-bottom:7px; text-transform:uppercase; font-weight:600; }
.fl-news p { font-size:13px; color:var(--sub); line-height:1.75; white-space:pre-wrap; }
.fl-foot { padding:10px 16px; font-size:11px; color:var(--muted); border-top:1px solid var(--border); line-height:1.6; }
.fl-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; align-items:end; padding:16px 20px; }
.fl-form .fg label { display:block; font-family:'Jost',sans-serif; font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; font-weight:600; }
.fl-input { width:100%; background:transparent; border:1px solid var(--border); border-radius:6px; padding:9px 11px; color:var(--text); font-family:'Jost',sans-serif; font-size:13.5px; box-sizing:border-box; color-scheme:inherit; }
.fl-input:focus { outline:none; border-color:var(--gold); }
.fl-btn { font-family:'Jost',sans-serif; font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#0D1B2A; background:var(--gold); border:none; border-radius:4px; padding:11px 22px; cursor:pointer; transition:background .2s; }
.fl-btn:hover { background:var(--gold2,#D4AF6E); }
.fl-btn:disabled { opacity:.55; cursor:default; }
.fl-ev-msg { padding:0 20px 14px; font-size:12.5px; line-height:1.6; }
`;

/* ── bloques: mapeo por palabra clave, color categórico fijo ── */
const BLOCK_DEFS = [
  { key:"pasivo",   match:/cauci|liquidez|letra/i, hex:"#2a78d6", fallback:"Caución / liquidez" },
  { key:"moderado", match:/bono|hard/i,            hex:"#1baf7a", fallback:"Bonos hard dollar" },
  { key:"agresivo", match:/cedear|accion/i,        hex:"#4a3aa7", fallback:"CEDEARs / Acciones AR" },
  { key:"crypto",   match:/crypto|binance/i,       hex:"#B8975A", fallback:"Crypto (Binance)" },
];
const STABLE = new Set(["USDT","USDC","BUSD","FDUSD","TUSD"]);

const fmtARS = n => "$" + Math.round(n).toLocaleString("es-AR");
const fmtUSD = n => "US$" + Number(n).toLocaleString("es-AR",{maximumFractionDigits:2});
const fmtPct = n => (n>=0?"+":"") + n.toFixed(2) + "%";
const cls = n => n>0.004?"fl-pos":n<-0.004?"fl-neg":"fl-mut";
const pill = (n, txt) => `<span class="fl-pill ${n>0.004?"p":n<-0.004?"n":"m"}">${n>0.004?"▲":n<-0.004?"▼":"—"} ${txt}</span>`;
const tok = name => getComputedStyle(document.body).getPropertyValue(name).trim() || "#888";
const rKey = (obj, part) => { const k = Object.keys(obj||{}).find(x => x.toLowerCase().includes(part)); return k ? obj[k] : null; };

function blockOf(tipo) {
  const t = String(tipo || "").toUpperCase();
  if (t.includes("CAUCION") || t.includes("LETRA")) return "pasivo";
  if (t.includes("TITULOSPUBLICOS")) return "moderado";
  return "agresivo";
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
  const ts = c.ts ? new Date(c.ts) : null;
  const ageH = ts ? (Date.now() - ts.getTime()) / 36e5 : null;
  const fresh = ageH != null && ageH <= 48;

  // ── modelo v2: ganancia de clientes contra capital neto, con AUM en vivo ──
  const capNetoTot = rKey(resumen, "capital neto de clientes") ||
                     clientes.reduce((s,x) => s + (Number(x.capital_neto)||0), 0);
  const feePend = rKey(resumen, "fee gestor pendiente") || 0;
  const patrimonioLive = c.total - feePend;
  const ganLive = capNetoTot ? patrimonioLive - capNetoTot : null;
  const rendLive = capNetoTot ? ganLive / capNetoTot : null;
  const cclSheet = rKey(sh.params||{}, "ccl");
  const corte = String((sh.params||{})["Fecha de corte"] || "").slice(0,10);
  const ganCorte = rKey(resumen, "ganancia de clientes");
  const rendCorte = rKey(resumen, "rendimiento clientes");

  // targets de bloque desde el sheet
  const blocks = BLOCK_DEFS.map(def => {
    const row = (sh.bloques||[]).find(b => def.match.test(String(b.nombre||"")));
    return { ...def, nombre: row ? row.nombre : def.fallback, tgt: row ? Number(row.pct) : 0 };
  });

  /* ── DASHBOARD ── */
  const maxPct = Math.max(...blocks.map(b => Math.max(c.blk[b.key]/c.total, b.tgt))) * 1.15;
  const bloquesHtml = blocks.map(b => {
    const real = c.blk[b.key], rp = real / c.total, dev = rp - b.tgt;
    return `<div class="fl-blk" style="--flc:${b.hex}">
      <div class="fl-blk-head"><span class="nm"><span class="fl-chip"></span>${b.nombre}</span>
        <span class="amt">${fmtARS(real)} · <b>${(rp*100).toFixed(1)}%</b>
        ${pill(dev, (dev>=0?"+":"") + (dev*100).toFixed(1) + " vs " + (b.tgt*100).toFixed(0) + "%")}</span></div>
      <div class="fl-track"><div class="fl-fill" style="width:${(rp/maxPct*100).toFixed(1)}%"></div>
        <div class="fl-target" title="objetivo ${(b.tgt*100).toFixed(0)}%" style="left:${(b.tgt/maxPct*100).toFixed(1)}%"></div></div></div>`;
  }).join("");

  const newsHtml = news.length ? news.map(n => {
    const f = n.fecha && n.fecha.toDate ? n.fecha.toDate().toLocaleString("es-AR") : (n.fecha || "");
    return `<div class="card"><div class="m">${f}${n.fuente ? " · " + n.fuente : ""}</div>
      <h5>${n.titulo || "Briefing"}</h5>
      <p>${n.contenido || n.resumen || ""}</p></div>`;
  }).join("") : `<div class="card"><p class="fl-mut">Sin briefings todavía — la tarea diaria de Cowork los deja en la página Notion "Noticias Fondo" y aparecen acá.</p></div>`;

  document.getElementById("tab-dashboard").innerHTML = `
    <div class="fl-head">
      <div class="portal-title" style="margin-bottom:0">Fondo Lautaro</div>
      <span class="fl-status"><span class="fl-dot${fresh?"":" warn"}"></span>${fresh ? "Telemetría al día" : "Datos desactualizados"}</span>
    </div>
    <div class="fl-meta">Sync ${ts ? ts.toLocaleString("es-AR") : "—"} · FX implícito ${c.fx.toLocaleString("es-AR")}${cclSheet ? " · CCL ref. " + Number(cclSheet).toLocaleString("es-AR") : ""}${corte ? " · corte contable " + corte : ""}</div>
    ${!fresh && ts ? `<div class="fl-strip warn"><b>Datos viejos:</b> el último sync es de hace ${Math.round(ageH/24)} días. Revisá la tarea programada de la PC (fondo_sync.py).</div>` : ""}
    <div class="fl-kpis">
      <div class="fl-kpi"><div class="l">Valor total del fondo</div>
        <div class="v">${fmtARS(c.total)}</div><div class="s">${fmtUSD(c.total/c.fx)} @ FX ${c.fx.toLocaleString("es-AR")}</div></div>
      ${ganLive != null ? `<div class="fl-kpi"><div class="l">Ganancia clientes · mark-to-market</div>
        <div class="v ${cls(ganLive)}">${ganLive>=0?"+":""}${fmtARS(ganLive)}</div>
        <div class="s">${pill(rendLive*100, fmtPct(rendLive*100))} s/capital neto${ganCorte!=null?`<br>Al corte ${corte} (sheet): <span class="${cls(ganCorte)}">${ganCorte>=0?"+":""}${fmtARS(ganCorte)}${rendCorte!=null?" ("+fmtPct(rendCorte*100)+")":""}</span>`:""}</div></div>` : ""}
      <div class="fl-kpi"><div class="l">IOL · Argentina</div>
        <div class="v">${fmtARS(c.iolTotal)}</div>
        <div class="s">${(c.iolTotal/c.total*100).toFixed(1)}% del fondo</div></div>
      <div class="fl-kpi"><div class="l">Binance · Crypto</div>
        <div class="v">${fmtUSD(c.binTotalUSD)}</div>
        <div class="s">${fmtARS(c.binTotal)} · ${(c.binTotal/c.total*100).toFixed(1)}% del fondo</div></div>
      <div class="fl-kpi"><div class="l">uPnL futuros · live</div>
        <div class="v ${cls(c.upnl)}">${fmtUSD(c.upnl)}</div>
        <div class="s">${c.open.length} posición${c.open.length===1?"":"es"} abierta${c.open.length===1?"":"s"}</div></div>
      ${feePend ? `<div class="fl-kpi"><div class="l">Fee gestor pendiente</div>
        <div class="v">${fmtARS(feePend)}</div>
        <div class="s">10% inicial s/aportes + 2% mensual s/ganancia</div></div>` : ""}
    </div>
    <div class="fl-sec">Distribución por bloques · real vs objetivo</div>
    <div class="fl-grid2">
      <div class="fl-panel" style="min-width:0">${bloquesHtml}</div>
      <div class="fl-chart"><h4>Composición real del fondo</h4><div class="inner"><canvas id="flChSplit"></canvas></div></div>
    </div>
    <div class="fl-sec">Briefing del día · Cowork</div>
    <div class="fl-news">${newsHtml}</div>`;

  /* ── RENDIMIENTOS: cierres mensuales (SNAPSHOTS) ── */
  const snapRows = snaps.map(s => `<tr><td><b>${s.cierre}</b></td>
    <td class="fl-num">${s.total_ars?fmtARS(s.total_ars):"—"}</td>
    <td class="fl-num ${cls(Number(s.ganancia_mes)||0)}">${s.ganancia_mes!=null?fmtARS(s.ganancia_mes):"—"}</td>
    <td class="fl-num">${s.fee?fmtARS(s.fee):"—"}</td>
    <td class="fl-num">${s.iol_ars?fmtARS(s.iol_ars):"—"}</td>
    <td class="fl-num">${s.binance_usd?fmtUSD(s.binance_usd):"—"}</td>
    <td class="fl-num">${s.ccl?Number(s.ccl).toLocaleString("es-AR"):"—"}</td></tr>`).join("");
  document.getElementById("tab-rendimientos").innerHTML = `
    <div class="portal-title">Rendimientos del fondo</div>
    <div class="fl-meta">Cierres de mes (hoja SNAPSHOTS) · base del fee 2% sobre ganancia${ganLive!=null?` · ganancia actual de clientes ${fmtPct(rendLive*100)}`:""}</div>
    <div class="fl-grid2">
      <div class="fl-panel"><table>
        <thead><tr><th>Cierre</th><th class="fl-num">Total ARS</th><th class="fl-num">Ganancia mes</th><th class="fl-num">Fee 2%</th><th class="fl-num">IOL ARS</th><th class="fl-num">Binance USD</th><th class="fl-num">CCL</th></tr></thead>
        <tbody>${snapRows || '<tr><td colspan="7" class="fl-mut" style="text-align:center">Sin cierres cargados todavía</td></tr>'}</tbody></table>
        <div class="fl-foot">La ganancia mensual es provisoria hasta completar las valuaciones IOL de 31/05 y 30/06 en el sheet (celdas amarillas de SNAPSHOTS).</div></div>
      <div class="fl-chart"><h4>Valor del fondo (ARS) por cierre</h4><div class="inner"><canvas id="flChHist"></canvas></div></div>
    </div>`;

  /* ── POSICIONES (tab movimientos) ── */
  const rows = c.activos.map(a => {
    const b = blocks.find(x => x.key === a.blk);
    return `<tr><td><b>${a.sim}</b></td>
      <td><span class="fl-chip" style="--flc:${b.hex}"></span><span class="fl-tag">${a.tipo}</span></td>
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
      <td class="fl-num" style="color:var(--sub)">${p.marginType||""}</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="fl-mut" style="text-align:center">Sin posiciones abiertas de futuros</td></tr>`;
  const movRows = movs.slice().reverse().map(m => `<tr>
    <td style="white-space:nowrap">${m.fecha}</td><td><span class="fl-tag">${m.tipo}</span></td>
    <td style="color:var(--sub)">${m.detalle||""}</td>
    <td class="fl-num ${m.ars!=null?cls(m.ars):""}">${m.ars!=null?(m.ars>=0?"+":"")+fmtARS(m.ars):"—"}</td>
    <td class="fl-num">${m.usd!=null?fmtUSD(m.usd):"—"}</td></tr>`).join("");
  document.getElementById("tab-movimientos").innerHTML = `
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
      <table style="border-top:1px solid var(--border)">
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
      <div class="fl-foot">Registro de la hoja MOVIMIENTOS del sheet (últimos ${movs.length}).</div></div>` : ""}`;

  /* ── ADMIN: clientes del fondo ── */
  if (clientes.length) {
    const cliRows = clientes.map(x => {
      const neto = Number(x.capital_neto)||0, pct = Number(x.pct)||0;
      const gan = ganLive != null ? ganLive * pct : (Number(x.ganancia)||0);
      const valor = neto + gan;
      const ret = neto ? gan / neto * 100 : 0;
      return `<tr><td><b>${x.nombre}</b>${x.devoluciones?` <span class="fl-tag">Devol. ${fmtARS(x.devoluciones)}</span>`:""}</td>
        <td class="fl-num">${fmtARS((sh.aportes_brutos||{})[x.nombre]||0)}</td>
        <td class="fl-num">${fmtARS(neto)}</td>
        <td class="fl-num">${(pct*100).toFixed(1)}%</td>
        <td class="fl-num">${fmtARS(valor)}</td>
        <td class="fl-num ${cls(gan)}">${gan>=0?"+":""}${fmtARS(gan)}</td>
        <td class="fl-num">${pill(ret, fmtPct(ret))}</td></tr>`;
    }).join("");
    const adminTab = document.getElementById("tab-admin");
    const old = adminTab.querySelector("#fl-clientes");
    if (old) old.remove();
    adminTab.insertAdjacentHTML("afterbegin", `<div id="fl-clientes">
      <div class="fl-sec" style="margin-top:6px">Clientes del fondo · valor y ganancia en vivo</div>
      <div class="fl-panel" style="margin-bottom:26px"><table>
        <thead><tr><th>Cliente</th><th class="fl-num">Aporte bruto</th><th class="fl-num">Capital neto</th><th class="fl-num">Partic.</th><th class="fl-num">Valor hoy</th><th class="fl-num">Ganancia</th><th class="fl-num">Rendimiento</th></tr></thead>
        <tbody>${cliRows}
        <tr class="tot"><td>TOTAL</td>
          <td class="fl-num">${fmtARS(Object.values(sh.aportes_brutos||{}).reduce((s,v)=>s+v,0))}</td>
          <td class="fl-num">${fmtARS(capNetoTot)}</td><td class="fl-num">100%</td>
          <td class="fl-num">${fmtARS(patrimonioLive)}</td>
          <td class="fl-num ${cls(ganLive)}">${ganLive>=0?"+":""}${fmtARS(ganLive)}</td>
          <td class="fl-num">${pill(rendLive*100, fmtPct(rendLive*100))}</td></tr></tbody></table>
        <div class="fl-foot">Capital neto = aportes − fee inicial 10% − devoluciones. Ganancia en vivo = (valor del fondo − fee gestor pendiente) − capital neto, repartida por participación (capital × días). <b>Mark-to-market:</b> incluye el uPnL de los futuros abiertos y usa FX implícito de IOL — por eso puede diferir del balance del sheet (que valúa Binance por wallet y CCL ${cclSheet ? Number(cclSheet).toLocaleString("es-AR") : "de referencia"}).${ganCorte!=null?` Al corte ${corte}: ${ganCorte>=0?"+":""}${fmtARS(ganCorte)} (${rendCorte!=null?fmtPct(rendCorte*100):"—"}).`:""} ${sh.nota_clientes||""}</div>
      </div>
      <div class="fl-sec">Registrar aporte / retiro</div>
      <div class="fl-panel" style="margin-bottom:26px;overflow:visible">
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
      <div class="fl-panel" id="fl-eventos" style="margin-bottom:26px"><div class="fl-foot" style="border-top:none">Cargando…</div></div>
      </div>`);
    flLoadEventos();
  }

  /* ── charts (colores resueltos del tema activo) ── */
  charts.forEach(ch => ch.destroy()); charts = [];
  const cardBg = tok("--card"), subC = tok("--sub"), borderC = tok("--border") || "rgba(0,0,0,.08)";
  Chart.defaults.font.family = "'Jost', sans-serif";
  const legend = { position:"bottom", labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:"circle", font:{size:10.5}, color:subC, padding:14 } };
  chart("flChSplit", { type:"doughnut",
    data:{ labels: blocks.map(b=>b.nombre), datasets:[{ data: blocks.map(b=>c.blk[b.key]),
      backgroundColor: blocks.map(b=>b.hex), borderColor:cardBg, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"68%", plugins:{ legend } } });
  chart("flChBin", { type:"doughnut",
    data:{ labels:["Futuros","PnL no real.","Earn BTC","Earn USDT"],
      datasets:[{ data:[c.fut,c.upnl,c.ebtcUsd,c.eusdt].map(v=>Math.abs(v)),
      backgroundColor:["#2a78d6","#1baf7a","#B8975A","#4a3aa7"], borderColor:cardBg, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"68%", plugins:{ legend } } });
  const snapPts = snaps.filter(s => Number(s.total_ars) > 0);
  if (snapPts.length) {
    chart("flChHist", { type:"line",
      data:{ labels: snapPts.map(s=>s.cierre),
        datasets:[{ data: snapPts.map(s=>Number(s.total_ars)), borderColor:"#B8975A",
          backgroundColor:"rgba(184,151,90,.12)", fill:true, borderWidth:2,
          pointRadius:4, pointBackgroundColor:"#B8975A", tension:.3 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
        scales:{ y:{ grid:{ color:borderC }, ticks:{ color:subC, font:{size:10.5}, callback:v=>"$"+(Number(v)/1e6).toLocaleString("es-AR")+"M" } },
                 x:{ grid:{ display:false }, ticks:{ color:subC, font:{size:10.5} } } } } });
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
        <td><span class="fl-tag">${e.tipo||""}</span></td><td><b>${e.cliente||""}</b>${e.nota?` <span style="color:var(--sub);font-size:11.5px">· ${e.nota}</span>`:""}</td>
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
      news: [{ titulo:"Briefing demo", fecha:"08/07/2026", fuente:"cowork", contenido:"Briefing de ejemplo (modo dev)." }] };
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
  try {
    const { sync, sheet, news } = await fetchAll();
    if (!sync) {
      document.getElementById("tab-dashboard").insertAdjacentHTML("afterbegin",
        `<div class="fl-strip warn"><b>Sin snapshot</b> <code>fondoSync/latest</code> en Firestore — corré fondo_sync.py o esperá la corrida de las 9:00.</div>`);
      return;
    }
    lastPayload = { sync, sheet, news };
    renderAll(sync, sheet, news);
    // el toggle claro/oscuro del portal cambia data-theme: re-renderizar con los tokens nuevos
    new MutationObserver(() => { if (lastPayload) renderAll(lastPayload.sync, lastPayload.sheet, lastPayload.news); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch (e) {
    document.getElementById("tab-dashboard").insertAdjacentHTML("afterbegin",
      `<div class="fl-strip warn"><b>No se pudo cargar el fondo:</b> ${String(e).slice(0,200)}</div>`);
  }
};
if (window.__fondoAdminPending) window.initFondoAdmin();
