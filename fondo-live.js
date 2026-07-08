// fondo-live.js — Fondo Lautaro en las secciones nativas del portal (solo admin).
// Puebla: #tab-dashboard (KPIs + bloques + briefing), #tab-rendimientos (historial),
// #tab-movimientos → "Posiciones" (IOL + Binance) y #tab-admin (clientes del fondo).
// Usa los tokens de marca del portal (--card/--border/--text/--gold...) y se
// re-renderiza cuando cambia el tema claro/oscuro.
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs }
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
`;

/* ── paleta categórica por bloque (identidad fija) ── */
const BLOCKS = [
  { key:"pasivo",   nombre:"Pasivo / Conservador", hex:"#2a78d6" },
  { key:"moderado", nombre:"Moderado / Cobertura", hex:"#1baf7a" },
  { key:"agresivo", nombre:"Agresivo",             hex:"#4a3aa7" },
  { key:"crypto",   nombre:"Crypto (Binance)",     hex:"#B8975A" },
];
const STABLE = new Set(["USDT","USDC","BUSD","FDUSD","TUSD"]);

const fmtARS = n => "$" + Math.round(n).toLocaleString("es-AR");
const fmtUSD = n => "US$" + Number(n).toLocaleString("es-AR",{maximumFractionDigits:2});
const fmtPct = n => (n>=0?"+":"") + n.toFixed(2) + "%";
const cls = n => n>0.004?"fl-pos":n<-0.004?"fl-neg":"fl-mut";
const pill = (n, txt) => `<span class="fl-pill ${n>0.004?"p":n<-0.004?"n":"m"}">${n>0.004?"▲":n<-0.004?"▼":"—"} ${txt}</span>`;
const tok = name => getComputedStyle(document.body).getPropertyValue(name).trim() || "#888";

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
  const aportes = clientes.reduce((s,x) => s + (Number(x.aporte_ars)||0), 0);
  const im = sh.input_mensual || {};
  const hist = sh.historial || [];
  const feeRate = Number((sh.params||{})["Fee mensual sobre ganancias"]) || 0.2;
  const pnlFutMes = Number(im["P&L Neto Futures (mes)"]) || 0;
  const feeMes = Math.max(0, pnlFutMes * feeRate);
  const diasOp = Number(im["Días operados"]) || 0, diasG = Number(im["Días ganadores"]) || 0;
  const winRate = diasOp ? diasG / diasOp * 100 : null;
  const lastH = hist.length ? hist[hist.length-1] : null;
  const pnlFondo = aportes ? c.total - aportes : null;
  const pnlIol = c.activos.reduce((s,a) => s + a.pnl, 0);
  const costoIol = c.activos.reduce((s,a) => s + (a.val - a.pnl), 0);
  const ts = c.ts ? new Date(c.ts) : null;
  const ageH = ts ? (Date.now() - ts.getTime()) / 36e5 : null;
  const fresh = ageH != null && ageH <= 48;

  const tgt = { pasivo:.2, moderado:.1, agresivo:.3, crypto:.4 };
  (sh.bloques||[]).forEach(b => {
    const n = String(b.nombre||"").toLowerCase();
    if (n.includes("pasivo")) tgt.pasivo = b.pct;
    else if (n.includes("moderado")) tgt.moderado = b.pct;
    else if (n.includes("agresivo")) tgt.agresivo = b.pct;
    else if (n.includes("crypto")) tgt.crypto = b.pct;
  });

  /* ── DASHBOARD ── */
  const maxPct = Math.max(...BLOCKS.map(b => Math.max(c.blk[b.key]/c.total, tgt[b.key]))) * 1.15;
  const bloquesHtml = BLOCKS.map(b => {
    const real = c.blk[b.key], rp = real / c.total, dev = rp - tgt[b.key];
    return `<div class="fl-blk" style="--flc:${b.hex}">
      <div class="fl-blk-head"><span class="nm"><span class="fl-chip"></span>${b.nombre}</span>
        <span class="amt">${fmtARS(real)} · <b>${(rp*100).toFixed(1)}%</b>
        ${pill(dev, (dev>=0?"+":"") + (dev*100).toFixed(1) + " vs " + (tgt[b.key]*100).toFixed(0) + "%")}</span></div>
      <div class="fl-track"><div class="fl-fill" style="width:${(rp/maxPct*100).toFixed(1)}%"></div>
        <div class="fl-target" title="objetivo ${(tgt[b.key]*100).toFixed(0)}%" style="left:${(tgt[b.key]/maxPct*100).toFixed(1)}%"></div></div></div>`;
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
    <div class="fl-meta">Sync ${ts ? ts.toLocaleString("es-AR") : "—"} · FX implícito ${c.fx.toLocaleString("es-AR")}${im.ccl ? " · CCL " + Number(im.ccl).toLocaleString("es-AR") : ""} · IOL + Binance</div>
    ${!fresh && ts ? `<div class="fl-strip warn"><b>Datos viejos:</b> el último sync es de hace ${Math.round(ageH/24)} días. Revisá la tarea programada de la PC (fondo_sync.py).</div>` : ""}
    <div class="fl-kpis">
      <div class="fl-kpi"><div class="l">AUM total</div>
        <div class="v">${fmtARS(c.total)}</div><div class="s">${fmtUSD(c.total/c.fx)} @ FX ${c.fx.toLocaleString("es-AR")}</div></div>
      ${aportes ? `<div class="fl-kpi"><div class="l">Resultado vs aportes</div>
        <div class="v ${cls(pnlFondo)}">${pnlFondo>=0?"+":""}${fmtARS(pnlFondo)}</div>
        <div class="s">${pill(pnlFondo, fmtPct(pnlFondo/aportes*100))} sobre ${fmtARS(aportes)}</div></div>` : ""}
      <div class="fl-kpi"><div class="l">IOL · Argentina</div>
        <div class="v">${fmtARS(c.iolTotal)}</div>
        <div class="s">${(c.iolTotal/c.total*100).toFixed(1)}% del AUM · ${pill(pnlIol, fmtPct(costoIol?pnlIol/costoIol*100:0))} sobre costo</div></div>
      <div class="fl-kpi"><div class="l">Binance · Crypto</div>
        <div class="v">${fmtUSD(c.binTotalUSD)}</div>
        <div class="s">${fmtARS(c.binTotal)} · ${(c.binTotal/c.total*100).toFixed(1)}% del AUM</div></div>
      <div class="fl-kpi"><div class="l">uPnL futuros · live</div>
        <div class="v ${cls(c.upnl)}">${fmtUSD(c.upnl)}</div>
        <div class="s">${c.open.length} posición${c.open.length===1?"":"es"} abierta${c.open.length===1?"":"s"}</div></div>
      ${pnlFutMes ? `<div class="fl-kpi"><div class="l">Cierre ${im.mes || "mes"}</div>
        <div class="v ${cls(pnlFutMes)}">${fmtUSD(pnlFutMes)}</div>
        <div class="s">Fee gestor ${fmtUSD(feeMes)}${winRate!=null?" · win "+winRate.toFixed(0)+"%":""}${lastH&&lastH.profit_factor?" · PF "+Number(lastH.profit_factor).toFixed(2):""}</div></div>` : ""}
    </div>
    ${sh.notas_mes ? `<div class="fl-strip"><b>Notas del mes (${im.mes || "—"}):</b> ${sh.notas_mes}</div>` : ""}
    <div class="fl-sec">Distribución por bloques · real vs modelo</div>
    <div class="fl-grid2">
      <div class="fl-panel" style="min-width:0">${bloquesHtml}</div>
      <div class="fl-chart"><h4>Composición real del AUM</h4><div class="inner"><canvas id="flChSplit"></canvas></div></div>
    </div>
    <div class="fl-sec">Briefing del día · Cowork</div>
    <div class="fl-news">${newsHtml}</div>`;

  /* ── RENDIMIENTOS ── */
  const histRows = hist.map(h => `<tr><td><b>${h.periodo}</b></td>
    <td class="fl-num">${h.aum_usd?fmtUSD(h.aum_usd):"—"}</td>
    <td class="fl-num">${h.retorno_usd_pct!=null?pill(Number(h.retorno_usd_pct), fmtPct(Number(h.retorno_usd_pct)*100)):"—"}</td>
    <td class="fl-num ${cls(Number(h.pnl_futures_usd)||0)}">${h.pnl_futures_usd!=null?fmtUSD(h.pnl_futures_usd):"—"}</td>
    <td class="fl-num">${h.fee_usd!=null?fmtUSD(Math.abs(Number(h.fee_usd))):"—"}</td>
    <td class="fl-num">${h.win_rate!=null?(Number(h.win_rate)*100).toFixed(0)+"%":"—"}</td>
    <td class="fl-num">${h.profit_factor!=null?Number(h.profit_factor).toFixed(2):"—"}</td>
    <td style="font-size:11.5px;color:var(--sub)">${h.notas||""}</td></tr>`).join("");
  document.getElementById("tab-rendimientos").innerHTML = `
    <div class="portal-title">Rendimientos del fondo</div>
    <div class="fl-meta">Un registro por mes cerrado · fuente: hoja Historial del sheet de gestión</div>
    <div class="fl-grid2">
      <div class="fl-panel"><table>
        <thead><tr><th>Período</th><th class="fl-num">AUM USD</th><th class="fl-num">Retorno</th><th class="fl-num">P&L Fut.</th><th class="fl-num">Fee</th><th class="fl-num">Win</th><th class="fl-num">PF</th><th>Notas</th></tr></thead>
        <tbody>${histRows || '<tr><td colspan="8" class="fl-mut" style="text-align:center">Sin meses cerrados todavía</td></tr>'}</tbody></table></div>
      <div class="fl-chart"><h4>AUM del fondo (USD) por mes</h4><div class="inner"><canvas id="flChHist"></canvas></div></div>
    </div>`;

  /* ── POSICIONES (tab movimientos) ── */
  const rows = c.activos.map(a => {
    const b = BLOCKS.find(x => x.key === a.blk);
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
    </div>`;

  /* ── ADMIN: clientes del fondo ── */
  if (clientes.length) {
    const cliRows = clientes.map(x => {
      const pct = Number(x.pct) || 0, cap = pct * c.total, pnl = cap - (Number(x.aporte_ars)||0);
      const ret = x.aporte_ars ? pnl / x.aporte_ars * 100 : 0;
      return `<tr><td><b>${x.nombre}</b>${x.notas?` <span class="fl-tag">${x.notas}</span>`:""}</td>
        <td class="fl-num">${fmtARS(x.aporte_ars)}</td><td class="fl-num">${(pct*100).toFixed(1)}%</td>
        <td class="fl-num">${fmtARS(cap)}</td>
        <td class="fl-num ${cls(pnl)}">${pnl>=0?"+":""}${fmtARS(pnl)}</td>
        <td class="fl-num">${pill(ret, fmtPct(ret))}</td></tr>`;
    }).join("");
    const adminTab = document.getElementById("tab-admin");
    const old = adminTab.querySelector("#fl-clientes");
    if (old) old.remove();
    adminTab.insertAdjacentHTML("afterbegin", `<div id="fl-clientes">
      <div class="fl-sec" style="margin-top:6px">Clientes del fondo · participación y P&L en vivo</div>
      <div class="fl-panel" style="margin-bottom:26px"><table>
        <thead><tr><th>Cliente</th><th class="fl-num">Aporte</th><th class="fl-num">% Fondo</th><th class="fl-num">Capital hoy</th><th class="fl-num">P&L</th><th class="fl-num">Retorno</th></tr></thead>
        <tbody>${cliRows}
        <tr class="tot"><td>TOTAL</td><td class="fl-num">${fmtARS(aportes)}</td><td class="fl-num">100%</td>
          <td class="fl-num">${fmtARS(c.total)}</td><td class="fl-num ${cls(pnlFondo)}">${pnlFondo>=0?"+":""}${fmtARS(pnlFondo)}</td>
          <td class="fl-num">${pill(pnlFondo, fmtPct(pnlFondo/aportes*100))}</td></tr></tbody></table>
        <div class="fl-foot">Capital hoy = participación (sheet ⚙️ Config) × AUM en vivo. El P&L compara contra el aporte nominal del sheet.</div>
      </div></div>`);
  }

  /* ── charts (colores resueltos del tema activo) ── */
  charts.forEach(ch => ch.destroy()); charts = [];
  const cardBg = tok("--card"), subC = tok("--sub"), borderC = tok("--border") || "rgba(0,0,0,.08)";
  Chart.defaults.font.family = "'Jost', sans-serif";
  const legend = { position:"bottom", labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:"circle", font:{size:10.5}, color:subC, padding:14 } };
  chart("flChSplit", { type:"doughnut",
    data:{ labels: BLOCKS.map(b=>b.nombre), datasets:[{ data: BLOCKS.map(b=>c.blk[b.key]),
      backgroundColor: BLOCKS.map(b=>b.hex), borderColor:cardBg, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"68%", plugins:{ legend } } });
  chart("flChBin", { type:"doughnut",
    data:{ labels:["Futuros","PnL no real.","Earn BTC","Earn USDT"],
      datasets:[{ data:[c.fut,c.upnl,c.ebtcUsd,c.eusdt].map(v=>Math.abs(v)),
      backgroundColor:["#2a78d6","#1baf7a","#B8975A","#4a3aa7"], borderColor:cardBg, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"68%", plugins:{ legend } } });
  if (hist.length) {
    chart("flChHist", { type:"line",
      data:{ labels: hist.map(h=>h.periodo),
        datasets:[{ data: hist.map(h=>Number(h.aum_usd)||null), borderColor:"#B8975A",
          backgroundColor:"rgba(184,151,90,.12)", fill:true, borderWidth:2,
          pointRadius:4, pointBackgroundColor:"#B8975A", tension:.3 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
        scales:{ y:{ grid:{ color:borderC }, ticks:{ color:subC, font:{size:10.5}, callback:v=>"US$"+Number(v).toLocaleString("es-AR") } },
                 x:{ grid:{ display:false }, ticks:{ color:subC, font:{size:10.5} } } } } });
  }

  // pestaña "Movimientos" pasa a llamarse "Posiciones" para el admin
  const movLink = [...document.querySelectorAll(".portal-nav a")].find(a => a.textContent.trim() === "Movimientos");
  if (movLink) movLink.textContent = "Posiciones";
}

async function fetchAll() {
  if (DEV) {
    const j = async f => { const r = await fetch(f); return r.ok ? await r.json() : null; };
    return { sync: await j("dev-data/sync_latest.json"), sheet: await j("dev-data/sheet_meta.json"),
      news: [{ titulo:"Briefing demo", fecha:"08/07/2026", fuente:"cowork", contenido:"Briefing de ejemplo (modo dev)." }] };
  }
  const db = getFirestore(getApp());
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
