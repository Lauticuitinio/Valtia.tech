// fondo-live.js — las tres pantallas de la administración que quedaron de la gestión vieja:
// Señales, Análisis de cartera y Lector de informes. Las del fondo (Dashboard, Rendimientos,
// Posiciones, Balance consolidado e Inversores) se sacaron el 05/10/2026 por pedido de Lauti:
// el fondo es privado y no va mezclado con Valtia. Lo que sigue llegando del fondo es solo lo
// que usa Análisis de cartera (fondoSync/latest y fondoAnalisis/latest).
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
.fl-pill.w { color:#C06A3A; background:rgba(192,106,58,.12); }
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
/* lector de informes dentro del portal */
.fl-reader { background:var(--flPanel); border:1px solid var(--flLine); border-radius:14px; padding:clamp(20px,3.5vw,42px); box-shadow:var(--flShadow); }
.fl-reader .rh { border-bottom:2px solid var(--flGold); padding-bottom:18px; margin-bottom:6px; }
.fl-reader .rh h1 { font:500 clamp(24px,3.2vw,34px)/1.2 'Playfair Display',serif; color:var(--flInk); }
.fl-reader .rh .meta { font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--flMut); margin-top:9px; font-weight:600; }
.fl-reader h2 { font:500 24px 'Playfair Display',serif; margin:38px 0 12px; padding-top:22px; border-top:1px solid var(--flLine); color:var(--flInk); }
.fl-reader h3 { font-size:15px; font-weight:600; margin:22px 0 8px; color:var(--flInk); }
.fl-reader p { margin:10px 0; font-size:14px; line-height:1.85; color:var(--flInk2); }
.fl-reader p strong, .fl-reader li strong, .fl-reader td strong { color:var(--flInk); font-weight:600; }
.fl-reader ul { margin:10px 0 10px 22px; }
.fl-reader li { margin:7px 0; font-size:13.5px; line-height:1.8; color:var(--flInk2); }
.fl-reader .kicker { color:var(--flMut); font-style:italic; }
.fl-reader .tag { display:inline-block; font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:#fff; background:var(--flGold); border-radius:4px; padding:3px 9px; margin:16px 0 4px; font-weight:700; }
.fl-reader .tag.bull { background:var(--flGood); }
.fl-reader .tag.bear { background:var(--flCrit); }
.fl-reader .tag.neutral { background:#C08A1E; }
.fl-reader .fecha { font-size:10.5px; color:var(--flMut); text-transform:uppercase; letter-spacing:.08em; }
.fl-reader table { width:100%; border-collapse:collapse; margin:14px 0; font-size:12.5px; display:block; overflow-x:auto; }
.fl-reader th { text-align:left; background:var(--flPanel2); color:var(--flInk); padding:9px 12px; font-weight:700; font-size:10px; letter-spacing:.1em; text-transform:uppercase; border-bottom:1px solid var(--flLine2); }
.fl-reader td { padding:9px 12px; border-bottom:1px solid var(--flLine); color:var(--flInk2); vertical-align:top; line-height:1.7; min-width:120px; }
.fl-reader .card { background:var(--flPanel2); border:1px solid var(--flLine); border-left:3px solid var(--flGold); border-radius:8px; padding:14px 18px; margin:16px 0; font-size:13px; line-height:1.8; color:var(--flInk2); }
.fl-reader .card.warn { border-left-color:#C08A1E; }
.fl-reader .card.risk { border-left-color:var(--flCrit); }
.fl-reader .card.ok { border-left-color:var(--flGood); }
.fl-reader .disclaimer { margin-top:40px; padding:16px 20px; background:var(--flPanel2); border-radius:8px; font-size:11px; color:var(--flMut); line-height:1.7; }
.fl-back { display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--flGoldDeep); cursor:pointer; margin-bottom:14px; }

/* (la CSS del shell — sidebar/topbar — vive en panel.js desde la fase 1 del panel) */
/* ── dashboard 2a: filas, moneda, donut, objetivos, flujo ── */
.fl-cur { display:inline-flex; gap:3px; background:var(--flTrack); border-radius:8px; padding:3px; }
.fl-cur button { border:none; padding:5px 14px; border-radius:6px; cursor:pointer; font:600 11px 'IBM Plex Sans',sans-serif; color:var(--flInk2); background:transparent; }
.fl-cur button.on { background:#14213D; color:#E8CE96; }
.fl-rango button { padding:4px 10px; font-size:10.5px; }
.fl-dashrow { display:grid; grid-template-columns:1.55fr 340px; gap:13px; margin-bottom:14px; }
.fl-dashrow2 { display:grid; grid-template-columns:1.5fr 1fr; gap:13px; }
.fl-dashrow > *, .fl-dashrow2 > * { min-width:0; }
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

/* ── Mapa de cartera (solapa Análisis) ── */
.fl-ana-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:16px; }
.fl-ana-chip { background:var(--flPanel); border:1px solid var(--flLine); border-radius:10px; padding:12px 14px; box-shadow:var(--flShadow); }
.fl-ana-chip .l { font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--flMut); font-weight:700; margin-bottom:4px; }
.fl-ana-chip .v { font:500 19px 'Playfair Display',serif; color:var(--flInk); }
.fl-ana-ctrl { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px; font-size:11px; color:var(--flMut); }
.fl-fbtn { font:600 11px 'IBM Plex Sans',sans-serif; padding:6px 13px; border-radius:99px; border:1px solid var(--flLine2); background:var(--flPanel); color:var(--flInk2); cursor:pointer; }
.fl-fbtn.on { background:var(--flGold); border-color:var(--flGold); color:#fff; }
.fl-ana-sel { font:500 11.5px 'IBM Plex Sans',sans-serif; padding:6px 10px; border-radius:8px; border:1px solid var(--flLine2); background:var(--flPanel); color:var(--flInk); }
.fl-ana-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:14px; }
.fl-ana-card { background:var(--flPanel); border:1px solid var(--flLine); border-radius:12px; padding:16px 18px; box-shadow:var(--flShadow); }
.fl-ana-hd { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px; }
.fl-ana-hd .tk { font:700 15px 'IBM Plex Sans',sans-serif; color:var(--flInk); }
.fl-ana-hd .nm { font-weight:400; color:var(--flMut); font-size:12px; }
.fl-ana-hd .sec { font-size:10.5px; color:var(--flMut); margin-top:2px; }
.fl-ana-px { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
.fl-ana-px .p { font:500 22px 'Playfair Display',serif; color:var(--flInk); }
.fl-ana-px .y { font-size:11px; color:var(--flInk2); }
.fl-w52 { position:relative; height:4px; border-radius:2px; background:var(--flTrack); margin:10px 0 5px; }
.fl-w52 i { position:absolute; top:-3px; width:10px; height:10px; border-radius:50%; background:var(--flGold); transform:translateX(-50%); border:2px solid var(--flPanel); box-sizing:content-box; }
.fl-w52lbl { display:flex; justify-content:space-between; font-size:9.5px; color:var(--flMut); margin-bottom:10px; }
.fl-ana-kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:10px; }
.fl-ana-kpi { background:var(--flPanel2); border-radius:8px; padding:6px 9px; }
.fl-ana-kpi span { display:block; font-size:8.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--flMut); font-weight:700; }
.fl-ana-kpi b { font-size:12px; font-weight:600; color:var(--flInk); font-variant-numeric:tabular-nums; }
.fl-ana-an { display:flex; justify-content:space-between; gap:10px; font-size:11px; color:var(--flInk2); margin-bottom:10px; }
.fl-ana-an b { color:var(--flInk); }
.fl-ana-hoy { background:var(--flPanel2); border-left:3px solid var(--flGold); border-radius:0 8px 8px 0; padding:9px 12px; font-size:11.5px; line-height:1.55; color:var(--flInk2); margin-bottom:10px; }
.fl-ana-hoy b { color:var(--flInk); }
.fl-ana-tog { width:100%; font:600 11px 'IBM Plex Sans',sans-serif; padding:8px; border-radius:8px; border:1px solid var(--flLine2); background:transparent; color:var(--flInk2); cursor:pointer; }
.fl-ana-tog:hover { background:var(--flHover); }
.fl-ana-det { display:none; margin-top:12px; }
.fl-ana-det.open { display:block; }
.fl-ana-views { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.fl-ana-view { background:var(--flPanel2); border-radius:8px; padding:10px 12px; font-size:11.5px; line-height:1.55; color:var(--flInk2); }
.fl-ana-view .vh { font-size:9px; letter-spacing:.08em; text-transform:uppercase; font-weight:700; color:var(--flGoldDeep); margin-bottom:5px; }
.fl-ana-bb { display:grid; gap:8px; }
.fl-ana-case { border:1px solid var(--flLine); border-radius:8px; padding:10px 12px; }
.fl-ana-case .bh { font-size:9px; letter-spacing:.08em; text-transform:uppercase; font-weight:700; margin-bottom:6px; }
.fl-ana-case ul { margin:0; padding-left:16px; }
.fl-ana-case li { font-size:11.5px; line-height:1.6; color:var(--flInk2); margin-bottom:5px; }
.fl-ana-comp { background:var(--flPanel); border:1px solid var(--flLine); border-radius:12px; padding:14px 16px; box-shadow:var(--flShadow); }
.fl-ana-comp .hd { display:flex; justify-content:space-between; margin-bottom:8px; }
.fl-ana-crow { display:flex; justify-content:space-between; gap:10px; padding:7px 9px; border-radius:7px; font-size:11px; color:var(--flInk2); }
.fl-ana-crow.own { background:var(--flPanel2); border-left:3px solid var(--flGold); }
.fl-ana-crow .n { font-weight:600; color:var(--flInk); white-space:nowrap; }
.fl-ana-verd { margin-top:8px; padding-top:8px; border-top:1px solid var(--flLine); font-size:11px; line-height:1.55; color:var(--flInk2); }
.fl-ana-mc { border-radius:12px; padding:16px 18px; border:1px solid var(--flLine); background:var(--flPanel); box-shadow:var(--flShadow); }
.fl-ana-mc .flag { font-size:22px; }
.fl-ana-mc .stance { font-size:9.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:3px 9px; border-radius:99px; }
.fl-ana-hold { font-size:11px; color:var(--flInk2); background:var(--flPanel2); border-left:3px solid var(--flS1); border-radius:0 8px 8px 0; padding:7px 11px; margin-bottom:8px; }
.fl-ana-hold b { color:var(--flInk); font-variant-numeric:tabular-nums; }
.fl-ana-sys { font-size:11px; color:var(--flInk2); border:1px dashed var(--flLine2); border-radius:8px; padding:6px 11px; margin-bottom:10px; }
.fl-ana-sys b { color:var(--flInk); }
.fl-ana-sys.warn { border:1px solid var(--flCrit); }
.fl-ana-sys.warn .dw { color:var(--flCrit); font-weight:700; }
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
const RANGOS = { "1S": 7, "1M": 30, "3M": 90, "6M": 180, "1A": 365, "5A": 1825 };  // "1D" intradía, "Máx" sin filtro
const curRango = () => {
  const r = localStorage.getItem("fl-rango");
  return !r || r === "Todo" ? "Máx" : r;
};
const reRender = () => {
  if (lastPayload) renderAll(lastPayload.sync, lastPayload.mercado, lastPayload.informes,
    lastPayload.radar, lastPayload.analisis);
};
window.flSetCur = cur => { localStorage.setItem("fl-cur", cur); reRender(); };
window.flSetRango = r => { localStorage.setItem("fl-rango", r); reRender(); };
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
  let aTot = 0, rTot = 0;
  (movs||[]).forEach(m => {
    const t = String(m.tipo||"").toLowerCase();
    const externo = t.startsWith("aporte") || t.startsWith("devoluc") || t.startsWith("retiro") || t.startsWith("fee");
    if (!externo) return; // transferencias internas (A IOL, A Binance, ARS->USD) no son flujo
    const ars = Math.abs(Number(m.ars) || 0);
    if (t.startsWith("aporte")) aTot += ars; else rTot += ars;
    // fechas d/m/aa (sheet histórico) o ISO aaaa-mm-dd (ledger); sin fecha
    // clara ("may-jun") cuentan en los totales pero no en las barras
    const f = String(m.fecha||"").trim();
    let key = null;
    let mm = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(f);
    if (mm) key = (mm[3].length === 2 ? "20" + mm[3] : mm[3]) + "-" + String(mm[2]).padStart(2, "0");
    else { mm = /^(\d{4})-(\d{2})/.exec(f); if (mm) key = mm[1] + "-" + mm[2]; }
    if (!key) return;
    const o = map[key] || (map[key] = { a: 0, r: 0 });
    if (t.startsWith("aporte")) o.a += ars; else o.r += ars;
  });
  const bars = Object.keys(map).sort().slice(-12).map(k => ({
    key: k, label: MES[Number(k.slice(5)) - 1] || k.slice(5),
    a: map[k].a, r: map[k].r, net: map[k].a - map[k].r }));
  return { bars, aportes: aTot, salidas: rTot };
}

// shell 2a: convierte la nav del portal en el sidebar navy del diseño
function installShell() {
  if (document.querySelector(".fl-layout")) { document.body.classList.add("fl-app-on"); return; }
  const nav = document.querySelector(".portal-nav");
  const content = document.querySelector(".portal-content");
  if (!nav || !content || nav.parentElement !== content.parentElement) return;
  const wrap = document.createElement("div");
  wrap.className = "fl-layout";
  nav.parentElement.insertBefore(wrap, nav);
  wrap.appendChild(nav);
  // columna principal: barra superior con las secciones del sitio + contenido.
  // Así se navega a Noticias/Herramientas/etc. sin "salir" por el sidebar
  // (pedido de Lauti); "Inicio" reemplaza al viejo "← Volver al sitio".
  const main = document.createElement("div");
  main.className = "fl-main";
  main.innerHTML = `<div class="fl-topbar">
    <a onclick="flExitApp(event)">← Inicio</a>
    <a href="/noticias">Noticias</a>
    <a href="/cartera">Carteras</a>
    <a href="/informes">Informes</a>
    <a href="/herramientas">Herramientas</a>
    <span class="sep"></span>
    <span class="dom">VALTIA.TECH</span>
  </div>`;
  main.appendChild(content);
  wrap.appendChild(main);
  nav.insertAdjacentHTML("afterbegin", `<div class="fl-sbbrand">
    <div class="lg"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 12 L5 6 L8 9 L12 3 L15 6" fill="none" stroke="#B08A3E" stroke-width="1.5"/></svg></div>
    <div><div class="nm">VALTIA</div><div class="sb">ANALYTICS</div></div></div>`);
  document.body.classList.add("fl-app-on");
  // si vuelve al panel desde el sitio (Mi Panel / chip), reactivar el modo app
  const og = window.goPortal;
  window.goPortal = e => { if (og) og(e); document.body.classList.add("fl-app-on"); };
}

window.flExitApp = e => {
  if (e) e.preventDefault();
  document.body.classList.remove("fl-app-on");
  if (window.showHome) window.showHome();
  window.scrollTo(0, 0);
};

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
      const chico = cv && cv.parentElement && Math.abs(cv.clientWidth - cv.parentElement.clientWidth) > 4;
      if (cv && cv.offsetParent !== null && (cv.width === 0 || chico)) {
        const cfg = { type: ch.config.type, data: ch.config.data, options: ch.config.options };
        ch.destroy();
        return new Chart(cv, cfg);
      }
      ch.resize();
      return ch;
    } catch (e) { return ch; }
  });
};

function renderAll(d, mercado, informes, radar, analisis) {
  const c = compute(d);
  /* ── SEÑALES: sistema dinámico de rotación ── */
  const tabSen = document.getElementById("tab-senales");
  if (tabSen && mercado && mercado.senales) {
    const rg = mercado.regimen || {};
    const senCls = s => s.includes("FUERTE") || s.includes("🟡") ? "p" : s.includes("MANTENER") ? "m" : s.includes("REVISAR") ? "w" : "n";
    const dotRg = rg.estado === "RISK ON" ? "#4ade80" : rg.estado === "NEUTRAL" ? "#facc15" : "#f87171";
    const senRows = mercado.senales.map(s => `<tr>
      <td class="fl-num" style="color:var(--flMut)">${s.ranking}</td>
      <td><b>${s.tk}</b> <span style="color:var(--flMut);font-size:11px">${s.nombre||""}</span><div><span class="fl-tag">${s.cedear||""}</span></div></td>
      <td style="color:var(--flInk2)">${s.sector||""}</td>
      <td style="text-align:center">${s.en_cartera ? "✓" : "—"}</td>
      <td class="fl-num">${s.score_tec ?? "—"}</td>
      <td class="fl-num">${s.score_fund ?? "—"}</td>
      <td class="fl-num" style="font-weight:700;font-size:14px">${s.score ?? "—"}</td>
      <td><span class="fl-pill ${senCls(s.senal||"")}">${s.senal||""}</span></td>
      <td style="color:var(--flInk2);font-size:11.5px">${s.rotar_hacia||"—"}</td>
      <td class="fl-num ${s.mom3m!=null?cls(s.mom3m*100):""}">${s.mom3m!=null?fmtPct(s.mom3m*100):"—"}</td></tr>`).join("");
    tabSen.innerHTML = `<div class="flx">
      <div class="fl-head">
        <div>
          <div class="portal-title" style="margin-bottom:0">Señales</div>
          <div class="fl-meta" style="margin:6px 0 0">Sistema dinámico de rotación · recalculado a diario · ${String(mercado.actualizado||"").slice(0,10)}</div>
        </div>
      </div>
      <div style="height:14px"></div>
      <div class="fl-dashrow2" style="margin-bottom:14px">
        <div class="fl-panel fl-pad">
          <h4 class="fl-h4">Régimen de mercado</h4>
          <div style="display:flex;align-items:center;gap:10px;margin:8px 0 10px">
            <span style="width:12px;height:12px;border-radius:50%;background:${dotRg}"></span>
            <span style="font:500 26px 'Playfair Display',serif;color:var(--flInk)">${rg.estado||"—"}</span>
          </div>
          <div style="font-size:12px;color:var(--flInk2);margin-bottom:10px">Cash recomendado: <b style="color:var(--flInk)">${rg.cash_recomendado!=null?(rg.cash_recomendado*100).toFixed(0)+"%":"—"}</b></div>
          ${(rg.indicadores||[]).map(i => `<div style="display:flex;gap:8px;font-size:12px;color:var(--flInk2);margin-bottom:5px">
            <span class="${i.ok?"fl-pos":"fl-neg"}" style="font-weight:700">${i.ok?"✓":"✗"}</span>
            <span><b style="color:var(--flInk)">${i.nombre}</b> · ${i.detalle||""}</span></div>`).join("")}
        </div>
        <div class="fl-panel fl-pad">
          <h4 class="fl-h4">Escala de señales</h4>
          <div style="display:flex;flex-direction:column;gap:7px;margin-top:8px;font-size:12px;color:var(--flInk2)">
            <div><span class="fl-pill p">≥ 75</span> Comprar fuerte</div>
            <div><span class="fl-pill p">60–74</span> Comprar</div>
            <div><span class="fl-pill m">45–59</span> Mantener</div>
            <div><span class="fl-pill w">30–44</span> Revisar</div>
            <div><span class="fl-pill n">&lt; 30</span> Reducir / salir</div>
          </div>
        </div>
      </div>
      <div class="fl-panel"><table style="min-width:820px">
        <thead><tr><th class="fl-num">#</th><th>Activo</th><th>Sector</th><th style="text-align:center">Cartera</th>
          <th class="fl-num">Técnico</th><th class="fl-num">Fundam.</th><th class="fl-num">Score</th><th>Señal</th><th>Rotar hacia</th><th class="fl-num">Mom 3M</th></tr></thead>
        <tbody>${senRows}</tbody></table>
        <div class="fl-foot">Metodología del Fondo_Tracker: score compuesto = técnico 55% (momentum 3M 35%, tendencia EMA50/200 25%, fuerza relativa vs SPY 20%, momentum 6M 10%, volatilidad inversa 10%) + fundamental 45% (PEG 30%, upside al price target 25%, margen operativo 20%, rating de analistas 15%, FCF yield 10%). Scores en percentiles dentro del universo. Datos: Yahoo Finance vía el sync diario. Uso interno — no constituye recomendación de inversión.</div>
      </div></div>`;
  } else if (tabSen) {
    tabSen.innerHTML = `<div class="flx"><div class="portal-title">Señales</div>
      <div class="fl-strip">Sin datos del sistema de rotación todavía — corré el sync (run_sync.bat) para calcular el primer ranking.</div></div>`;
  }

  /* ── RADAR DE VALUACIÓN: lectura propia sobre la watchlist ── */
  if (tabSen && radar && Array.isArray(radar.activos)) {
    const rmoney = p => p == null ? "—" : "$" + Number(p).toLocaleString("es-AR",
      { minimumFractionDigits: p < 10 ? 2 : 0, maximumFractionDigits: p >= 1000 ? 0 : 2 });
    const r1 = v => v == null ? "—" : Number(v).toFixed(1);
    const verCls = v => v === "Infravalorada" ? "p" : v === "Estirada" ? "n" : v === "En precio" ? "m" : "";
    const acts = [...radar.activos].sort((a, b) =>
      (a.score == null) - (b.score == null) || (b.score || 0) - (a.score || 0));
    const cnt = v => radar.activos.filter(a => a.veredicto === v).length;
    const rows = acts.map(a => `<tr>
      <td><b>${a.sym}</b> ${a.entrada ? '<span style="color:var(--flGold,#B8975A)">◆</span>' : ""}<span style="color:var(--flMut);font-size:11px"> ${a.nombre || ""}</span></td>
      <td style="color:var(--flInk2)">${a.sector || ""}</td>
      <td class="fl-num">${rmoney(a.precio)}</td>
      <td class="fl-num">${r1(a.per)}</td>
      <td class="fl-num">${r1(a.pb)}</td>
      <td class="fl-num">${r1(a.ps)}</td>
      <td class="fl-num" style="font-weight:700">${a.valorScore ?? "—"}</td>
      <td class="fl-num">${a.calidadScore ?? "—"}</td>
      <td class="fl-num">${r1(a.rsi)}<span style="color:var(--flMut);font-size:10px"> ${a.rsiZona || ""}</span></td>
      <td><span class="fl-pill ${verCls(a.veredicto)}">${a.veredicto}</span></td></tr>`).join("");
    const radarHtml = `<div class="flx" style="margin-top:22px">
      <div class="fl-head"><div>
        <div class="portal-title" style="margin-bottom:0">Radar de valuación</div>
        <div class="fl-meta" style="margin:6px 0 0">Lectura propia sobre la watchlist · ${cnt("Infravalorada")} infravaloradas · ${cnt("Estirada")} estiradas · datos ${String(radar.actualizado || "").slice(0, 10)}</div>
      </div></div>
      <div style="height:12px"></div>
      <div class="fl-panel"><table style="min-width:820px">
        <thead><tr><th>Activo</th><th>Sector</th><th class="fl-num">Precio</th><th class="fl-num">PER</th>
          <th class="fl-num">P/L</th><th class="fl-num">P/V</th><th class="fl-num">Valor</th>
          <th class="fl-num">Calidad</th><th class="fl-num">RSI</th><th>Veredicto</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <div class="fl-foot">${radar.metodologia || ""} El puntaje de valor y calidad son percentiles dentro de la watchlist. ◆ = zona de compra (barata + RSI flojo). Refresco diario vía el sync. Uso interno — no es recomendación.</div>
      </div></div>`;
    tabSen.insertAdjacentHTML("beforeend", radarHtml);
  }

  /* ── ANÁLISIS: mapa de cartera, nativo con los tokens del panel ── */
  const tabAna = document.getElementById("tab-analisis");
  if (tabAna && analisis && analisis.json) {
    try { renderAnalisis(tabAna, JSON.parse(analisis.json), d, c, mercado); }
    catch (e) { tabAna.innerHTML = `<div class="flx"><div class="portal-title">Análisis de cartera</div><div class="fl-strip">No pude leer el mapa: ${String(e).slice(0, 120)}</div></div>`; }
  } else if (tabAna && !analisis) {
    tabAna.innerHTML = `<div class="flx"><div class="portal-title">Análisis de cartera</div>
      <div class="fl-strip">Sin mapa de cartera cargado — corré <code>python seed_analisis.py</code> con el último Dashboard_Cartera_Fondo.html.</div></div>`;
  }

  /* ── INFORMES: lista + lector, todo dentro del portal ── */
  _informes = informes || [];
  flRenderInformesList();

  /* ── gráficos: se limpian los que hubiera (al cambiar de tema se redibuja todo) y
        quedan los valores por defecto de Chart.js con los colores del tema activo ── */
  charts.forEach(ch => ch.destroy()); charts = [];
  Chart.defaults.color = flTok("--flInk2");
  Chart.defaults.font.family = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
}

/* ── informes: lista + lector dentro del portal ── */
let _informes = [];

window.flRenderInformesList = function() {
  const tabInf = document.getElementById("tab-informes");
  if (!tabInf) return;
  if (!_informes.length) {
    tabInf.innerHTML = `<div class="flx"><div class="portal-title">Informes</div>
      <div class="fl-strip">Sin informes publicados todavía.</div></div>`;
    return;
  }
  const infSorted = _informes.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  tabInf.innerHTML = `<div class="flx">
    <div class="portal-title">Informes</div>
    <div class="fl-meta">Research publicado · se lee acá mismo · gestioná el contenido desde Firestore (colección informes)</div>
    ${infSorted.map(i => `<div class="fl-panel fl-pad" style="margin-bottom:12px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <span class="fl-tag">${i.tipo || "Informe"}</span><span class="fl-tag">${String(i.fecha||"").slice(0,10)}</span>
        <span class="fl-tag">${i.visibilidad === "publico" ? "Público" : "Clientes"}</span></div>
      <div style="font:500 21px 'Playfair Display',serif;color:var(--flInk);margin-bottom:6px">${i.titulo}</div>
      <div style="font-size:12.5px;color:var(--flInk2);line-height:1.7;margin-bottom:10px">${i.resumen || ""}</div>
      <span class="fl-back" style="margin:0" onclick="flLeerInforme('${i.id}')">Leer informe →</span>
    </div>`).join("")}</div>`;
};

window.flLeerInforme = async function(id) {
  const tabInf = document.getElementById("tab-informes");
  if (!tabInf || !_db) return;
  tabInf.innerHTML = `<div class="flx"><div class="fl-strip" style="display:block">Cargando informe…</div></div>`;
  try {
    const snap = await getDoc(doc(_db, "informes", id));
    if (!snap.exists()) throw new Error("no existe");
    const d = snap.data();
    const meta = _informes.find(x => x.id === id) || {};
    tabInf.innerHTML = `<div class="flx">
      <span class="fl-back" onclick="flRenderInformesList()">← Todos los informes</span>
      <div class="fl-reader">
        <div class="rh">
          <div style="display:flex;gap:8px;margin-bottom:10px"><span class="fl-tag">${d.tipo || meta.tipo || "Informe"}</span>${d.categorias ? `<span class="fl-tag">${d.categorias}</span>` : ""}</div>
          <h1>${d.titulo}</h1>
          <div class="meta">${String(d.fecha||"").slice(0,10)} · ${d.autor || "Valtia Analytics"}</div>
        </div>
        ${d.contenido_html || "<p>Sin contenido.</p>"}
      </div></div>`;
    tabInf.scrollIntoView({ block: "start" });
  } catch (e) {
    tabInf.innerHTML = `<div class="flx">
      <span class="fl-back" onclick="flRenderInformesList()">← Todos los informes</span>
      <div class="fl-strip" style="display:block">No se pudo cargar el informe (${String(e).slice(0,120)}).</div></div>`;
  }
};

/* ── la base de la sesión: la usa el lector de informes ── */
let _db = null;

/* ── Mapa de cartera: render nativo (checklist de integración de Lauti:
      mismos tokens, tema claro/oscuro, sin iframe ni doble scroll) ── */
let _anaData = null;
let _anaState = { sig: "all", sec: "all", sort: "none", open: {} };

const anaPill = s => s === "promediar" ? "p" : s === "mantener" ? "m" : "n";

function anaCards() {
  const st = _anaState;
  let list = _anaData.posiciones.filter(p =>
    (st.sig === "all" || p.sig === st.sig) && (st.sec === "all" || p.sector === st.sec));
  if (st.sort === "up") list = [...list].sort((a, b) => (b.up ?? -1e9) - (a.up ?? -1e9));
  if (st.sort === "y1") list = [...list].sort((a, b) => (b.y1 ?? -1e9) - (a.y1 ?? -1e9));
  if (st.sort === "fpe") list = [...list].sort((a, b) => (a.fpe ?? 1e9) - (b.fpe ?? 1e9));
  if (!list.length) return `<div class="fl-strip">Nada con esos filtros.</div>`;
  return `<div class="fl-ana-grid">` + list.map(p => {
    const i = _anaData.posiciones.indexOf(p);
    const abierto = !!_anaState.open[p.tk];
    return `<div class="fl-ana-card">
      <div class="fl-ana-hd">
        <div><span class="tk">${p.tk} <span class="nm">${p.nombre || ""}</span></span><div class="sec">${p.sector || ""}</div></div>
        <span class="fl-pill ${anaPill(p.sig)}">${p.senal || p.sig || ""}</span>
      </div>
      <div class="fl-ana-px"><span class="p">${p.px || "—"}</span><span class="y">${p.y1txt || ""}</span></div>
      ${p.w52pos != null ? `<div class="fl-w52"><i style="left:${p.w52pos}%"></i></div>
      <div class="fl-w52lbl"><span>${p.w52lo || ""}</span><span>52 sem</span><span>${p.w52hi || ""}</span></div>` : ""}
      ${p.kpis && p.kpis.length ? `<div class="fl-ana-kpis">${p.kpis.map(k => `<div class="fl-ana-kpi"><span>${k.l}</span><b>${k.v}</b></div>`).join("")}</div>` : ""}
      <div class="fl-ana-an"><span>Target analistas <b>${p.target || "—"}</b></span><span>Balance <b>${p.balance || "—"}</b></span></div>
      ${p._h ? `<div class="fl-ana-hold">En cartera: <b>${Number(p._h.qty).toLocaleString("es-AR")} u.</b>${p._h.pct != null ? ` · <b>${p._h.pct.toFixed(1).replace(".", ",")}%</b> del fondo` : ""}${p._h.val ? ` · ${fmtARS(p._h.val)}` : ""}</div>` : ""}
      ${p._s ? `<div class="fl-ana-sys${p._s.discrepa ? " warn" : ""}">Sistema de rotación: <b>${p._s.score} pts · ${p._s.senal}</b>${p._s.discrepa ? ` <span class="dw">· ⚠ difiere de tu lectura (${p.sig})</span>` : " · coincide"}</div>` : ""}
      ${p.hoy ? `<div class="fl-ana-hoy"><b>Hoy:</b> ${p.hoy}</div>` : ""}
      <button class="fl-ana-tog" onclick="flAnaTog('${p.tk}')">${abierto ? "▲ Cerrar" : "▼ Ver tesis, mi lectura y la tuya"}</button>
      <div class="fl-ana-det${abierto ? " open" : ""}">
        <div class="fl-ana-views">
          <div class="fl-ana-view"><div class="vh">Mi lectura (Claudio)</div>${p.mi || "—"}</div>
          <div class="fl-ana-view"><div class="vh">Tu lectura</div>${p.tu || "—"}</div>
        </div>
        <div class="fl-ana-bb">
          <div class="fl-ana-case"><div class="bh" style="color:var(--flGood)">▲ Bull case</div><ul>${(p.bull || []).map(x => `<li>${x}</li>`).join("")}</ul></div>
          <div class="fl-ana-case"><div class="bh" style="color:var(--flCrit)">▼ Bear case</div><ul>${(p.bear || []).map(x => `<li>${x}</li>`).join("")}</ul></div>
        </div>
      </div>
    </div>`;
  }).join("") + `</div>`;
}

window.flAnaTog = tk => { _anaState.open[tk] = !_anaState.open[tk]; const g = document.getElementById("fl-ana-cards"); if (g) g.innerHTML = anaCards(); };
window.flAnaSig = (el, sig) => { _anaState.sig = sig; el.parentElement.querySelectorAll(".fl-fbtn").forEach(b => b.classList.remove("on")); el.classList.add("on"); const g = document.getElementById("fl-ana-cards"); if (g) g.innerHTML = anaCards(); };
window.flAnaSec = v => { _anaState.sec = v; const g = document.getElementById("fl-ana-cards"); if (g) g.innerHTML = anaCards(); };
window.flAnaSort = v => { _anaState.sort = v; const g = document.getElementById("fl-ana-cards"); if (g) g.innerHTML = anaCards(); };

function renderAnalisis(tab, data, sync, comp, mercado) {
  _anaData = data;
  const st = _anaState;
  const sectores = [...new Set(data.posiciones.map(p => p.sector).filter(Boolean))].sort();
  const tonoCol = t => t === "success" ? "var(--flGood)" : t === "danger" ? "var(--flCrit)" : "var(--flGold)";

  // ── cruce 1: tenencias reales del sync (IOL) → unidades y % del fondo ──
  const ALIAS = { YPF: "YPFD", PAMPA: "PAMP" };
  const byTk = {};
  ((((sync || {}).iol || {}).portafolio_argentina || {}).activos || []).forEach(a => {
    const s = a.titulo && a.titulo.simbolo;
    if (s) byTk[s] = a;
  });
  const totalFondo = comp && comp.total;
  // ── cruce 2: señal del sistema de rotación vs lectura del mapa ──
  const sys = {};
  ((mercado || {}).senales || []).forEach(s => { if (s.tk) sys[s.tk] = s; });
  let discrepancias = 0, conSistema = 0;
  data.posiciones.forEach(p => {
    const a = byTk[p.tk] || byTk[ALIAS[p.tk]];
    p._h = a ? { qty: a.cantidad, val: a.valorizado,
                 pct: (totalFondo && a.valorizado) ? a.valorizado / totalFondo * 100 : null } : null;
    const s = sys[p.tk];
    if (s && s.score != null) {
      conSistema++;
      const mapa = p.sig === "promediar" ? 1 : p.sig === "rotar" ? -1 : 0;
      const sist = s.score >= 60 ? 1 : s.score < 45 ? -1 : 0;
      p._s = { score: s.score, senal: String(s.senal || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim(),
               discrepa: mapa * sist === -1 };
      if (p._s.discrepa) discrepancias++;
    } else p._s = null;
  });
  data._discrepancias = conSistema ? discrepancias : null;
  tab.innerHTML = `<div class="flx">
    <div class="fl-head"><div>
      <div class="portal-title" style="margin-bottom:0">${data.titulo || "Mapa de cartera"}</div>
      <div class="fl-meta" style="margin:6px 0 0">${data.sub || ""}</div>
    </div></div>
    <div style="height:14px"></div>
    ${data.strip && data.strip.length ? `<div class="fl-ana-strip">${data.strip.map(k => {
      const verde = /promediar|upside/i.test(k.l), rojo = /rotar/i.test(k.l);
      return `<div class="fl-ana-chip"><div class="l">${k.l}</div><div class="v" style="${verde ? "color:var(--flGood)" : rojo ? "color:var(--flCrit)" : ""}">${k.v}</div></div>`;
    }).join("")}${data._discrepancias != null ? `<div class="fl-ana-chip"><div class="l">Mapa vs sistema</div><div class="v" style="color:${data._discrepancias ? "var(--flCrit)" : "var(--flGood)"}">${data._discrepancias ? data._discrepancias + " discrepancia" + (data._discrepancias > 1 ? "s" : "") : "Alineados"}</div></div>` : ""}</div>` : ""}
    <div class="fl-ana-ctrl">
      <span>Señal:</span>
      <button class="fl-fbtn${st.sig === "all" ? " on" : ""}" onclick="flAnaSig(this,'all')">Todas</button>
      <button class="fl-fbtn${st.sig === "promediar" ? " on" : ""}" onclick="flAnaSig(this,'promediar')">Promediar</button>
      <button class="fl-fbtn${st.sig === "mantener" ? " on" : ""}" onclick="flAnaSig(this,'mantener')">Mantener</button>
      <button class="fl-fbtn${st.sig === "rotar" ? " on" : ""}" onclick="flAnaSig(this,'rotar')">Rotar</button>
      <select class="fl-ana-sel" onchange="flAnaSec(this.value)">
        <option value="all">Todos los sectores</option>
        ${sectores.map(s => `<option value="${s}"${st.sec === s ? " selected" : ""}>${s}</option>`).join("")}
      </select>
      <span style="margin-left:6px">Ordenar:</span>
      <select class="fl-ana-sel" onchange="flAnaSort(this.value)">
        <option value="none"${st.sort === "none" ? " selected" : ""}>Por defecto</option>
        <option value="up"${st.sort === "up" ? " selected" : ""}>Upside analistas ↓</option>
        <option value="y1"${st.sort === "y1" ? " selected" : ""}>Momentum 1 año ↓</option>
        <option value="fpe"${st.sort === "fpe" ? " selected" : ""}>Fwd P/E ↑ (más barata)</option>
      </select>
    </div>
    <div id="fl-ana-cards">${anaCards()}</div>

    ${data.competencia && data.competencia.length ? `
    <div style="height:26px"></div>
    <h4 class="fl-h4">Competencia por sector</h4>
    <div class="fl-meta" style="margin:4px 0 12px">Cada posición contra sus rivales directos. La fila resaltada es la tuya.</div>
    <div class="fl-ana-grid">${data.competencia.map(c => `
      <div class="fl-ana-comp">
        <div class="hd"><b style="color:var(--flInk)">${c.tk}</b><span class="fl-tag">${c.sector || ""}</span></div>
        ${(c.rows || []).map(r => `<div class="fl-ana-crow${r.tuya ? " own" : ""}"><span class="n">${r.n}</span><span>${r.nota || ""}</span></div>`).join("")}
        ${c.veredicto ? `<div class="fl-ana-verd">⚖ ${c.veredicto}</div>` : ""}
      </div>`).join("")}</div>` : ""}

    ${data.macro && data.macro.length ? `
    <div style="height:26px"></div>
    <h4 class="fl-h4">Macro y ponderación por país</h4>
    <div class="fl-meta" style="margin:4px 0 12px">Dónde conviene estar más y menos ponderado.</div>
    <div class="fl-ana-grid">${data.macro.map(m => `
      <div class="fl-ana-mc">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span class="flag">${m.flag || ""}</span>
          <div><div style="font:500 17px 'Playfair Display',serif;color:var(--flInk)">${m.pais}</div>
          <span class="stance" style="color:${tonoCol(m.tono)};border:1px solid ${tonoCol(m.tono)}">${m.postura || ""}</span></div>
        </div>
        ${(m.kpis || []).length ? `<div class="fl-ana-kpis" style="grid-template-columns:1fr 1fr">${m.kpis.map(k => `<div class="fl-ana-kpi"><span>${k.l}</span><b>${k.v}</b></div>`).join("")}</div>` : ""}
        ${m.tesis ? `<div style="font-size:11.5px;line-height:1.6;color:var(--flInk2);margin-bottom:8px"><b style="color:var(--flInk)">Tesis:</b> ${m.tesis}</div>` : ""}
        ${m.riesgo ? `<div style="font-size:11px;line-height:1.55;color:var(--flMut)"><b>⚠ Riesgo:</b> ${m.riesgo}</div>` : ""}
      </div>`).join("")}</div>
    ${data.ponderacion ? `<div class="fl-ana-hoy" style="margin-top:14px">${data.ponderacion}</div>` : ""}` : ""}

    <div class="fl-foot" style="margin-top:16px">${data.fuente || ""} Documento privado del gestor (fondoAnalisis/latest) · se actualiza con seed_analisis.py · los clientes no lo ven.</div>
  </div>`;
}

async function fetchAll() {
  if (DEV) {
    const j = async f => { const r = await fetch(f, { cache: "no-store" }); return r.ok ? await r.json() : null; };
    return { sync: await j("dev-data/sync_latest.json"),
      mercado: await j("dev-data/mercado.json"), informes: [], radar: await j("dev-data/radar.json"),
      analisis: await j("dev-data/analisis.json") };
  }
  const db = getFirestore(getApp());
  _db = db;
  // solo lo que usan Señales, Análisis de cartera y el Lector de informes. La contabilidad
  // del fondo (fondoMeta, fondoWeb, fondoHistorial, fondoIntradia, noticiasFondo) ya no se
  // lee desde la web: esas pantallas se sacaron el 05/10/2026
  const [syncSnap, mercadoSnap, informesSnap, radarSnap, anaSnap] = await Promise.all([
    getDoc(doc(db, "fondoSync", "latest")),
    getDoc(doc(db, "mercado", "latest")).catch(() => null),
    getDocs(collection(db, "informes")).catch(() => null),
    getDoc(doc(db, "radar", "latest")).catch(() => null),
    getDoc(doc(db, "fondoAnalisis", "latest")).catch(() => null),
  ]);
  return {
    sync: syncSnap.exists() ? JSON.parse(syncSnap.data().json) : null,
    mercado: mercadoSnap && mercadoSnap.exists() ? JSON.parse(mercadoSnap.data().json) : null,
    informes: informesSnap ? informesSnap.docs.map(d => ({ id: d.id, titulo: d.data().titulo,
      fecha: d.data().fecha, tipo: d.data().tipo, resumen: d.data().resumen,
      slug: d.data().slug, visibilidad: d.data().visibilidad })) : [],
    radar: radarSnap && radarSnap.exists() ? JSON.parse(radarSnap.data().json) : null,
    analisis: anaSnap && anaSnap.exists() ? anaSnap.data() : null,
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
    const { sync, mercado, informes, radar, analisis } = await fetchAll();
    if (!sync) {
      document.getElementById("tab-senales").insertAdjacentHTML("afterbegin",
        `<div class="flx"><div class="fl-strip"><b>Sin snapshot</b> <code>fondoSync/latest</code> en Firestore — corré fondo_sync.py o esperá la corrida de las 9:00.</div></div>`);
      return;
    }
    lastPayload = { sync, mercado, informes, radar, analisis };
    renderAll(sync, mercado, informes, radar, analisis);
    // el toggle claro/oscuro del portal cambia data-theme: re-renderizar con los tokens nuevos
    new MutationObserver(reRender)
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch (e) {
    document.getElementById("tab-senales").insertAdjacentHTML("afterbegin",
      `<div class="flx"><div class="fl-strip"><b>No se pudo cargar el fondo:</b> ${String(e).slice(0,200)}</div></div>`);
  }
};
if (window.__fondoAdminPending) window.initFondoAdmin();
