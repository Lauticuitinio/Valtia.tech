// panel.js — el panel del inversor de valtia.tech.
// Un solo shell (sidebar navy) para TODOS los logueados, ordenado como el
// recorrido del inversor: Inicio → Qué comprar → Carteras Valtia → Mi cartera
// → Mis empresas → Disciplina → Herramientas y datos. Fondo Valtia aparece
// solo para clientes del fondo y Gestión solo para el admin (fondo-live.js).
// Mi cartera vive en mi-cartera.js; acá se reutilizan su cálculo y sus tipos.
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { calcular, agruparPorBroker, normalizarTicker } from './mi-cartera.js?v=15';
import { EMPRESAS } from './empresas.js?v=3';
import { base, radarSym, tickerFicha, esRentaFija, especieBono, parBono, linkDe, nombreDe, desglose }
  from './activos.js?v=4';

/* ───────────────────────── estilos ───────────────────────── */
const CSS = `
body.fl-app-on nav:not(.portal-nav){display:none!important}
body.fl-app-on #vnav-hot,body.fl-app-on #vnav-menu,body.fl-app-on #vnav-back{display:none!important}
body.fl-app-on #portal-view{padding:0!important;margin:0!important}
.fl-layout{display:flex;align-items:stretch;gap:0;min-height:calc(100vh - 34px)}
.fl-layout .portal-nav{display:flex;flex-direction:column;align-items:stretch;width:232px;flex:none;box-sizing:border-box;
  height:100vh!important;gap:1px!important;border-bottom:none!important;background:#14213D!important;border:none;border-radius:0;
  padding:18px 12px 14px!important;position:sticky;top:0;align-self:flex-start;max-height:100vh;overflow:auto}
.fl-layout .portal-nav a{display:block!important;padding:9px 12px!important;margin:0 0 1px!important;border-radius:8px;
  color:rgba(255,255,255,.62)!important;font:500 11px 'IBM Plex Sans',sans-serif!important;letter-spacing:.1em!important;
  text-transform:uppercase;text-decoration:none;border-bottom:none!important;border-left:2px solid transparent}
.fl-layout .portal-nav a:hover{background:rgba(255,255,255,.06);color:#fff!important}
.fl-layout .portal-nav a.active{background:rgba(176,138,62,.18);color:#E8CE96!important;border-left-color:#B08A3E;font-weight:600!important}
.vp-grp{font:600 8.5px 'IBM Plex Sans',sans-serif;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.35);padding:14px 12px 5px}
.vp-foot{margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,.12)}
.fl-layout .portal-nav #portal-user-name{display:block;color:rgba(255,255,255,.85);font:600 11px 'IBM Plex Sans',sans-serif;
  padding:6px 12px 2px;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vp-plan{display:inline-block;margin:2px 12px 8px;font:600 9px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;
  color:#E8CE96;border:1px solid rgba(232,206,150,.45);border-radius:4px;padding:3px 7px}
.vp-plan.pro{background:#B08A3E;color:#14213D;border-color:#B08A3E}
.fl-layout .portal-nav a.vp-sitio{font-size:10px!important;color:rgba(255,255,255,.5)!important;text-transform:none;letter-spacing:.04em!important}
.fl-layout .portal-nav button{color:#B08A3E!important;text-align:left;padding:6px 12px 2px!important;font:600 10px 'IBM Plex Sans',sans-serif!important;
  letter-spacing:.12em!important;background:none;border:none;cursor:pointer;text-transform:uppercase}
.fl-main{flex:1;min-width:0;display:flex;flex-direction:column}
.fl-topbar{display:flex;align-items:center;gap:4px;padding:9px 14px 9px 0;margin-left:22px;border-bottom:1px solid rgba(0,0,0,.08);
  background:#FBF9F3;position:sticky;top:0;z-index:60;overflow-x:auto}
[data-theme="dark"] .fl-topbar{background:#0F1B30;border-bottom-color:rgba(255,255,255,.08)}
.fl-topbar a{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#6B6456;
  padding:7px 13px;border-radius:8px;text-decoration:none;white-space:nowrap;cursor:pointer}
[data-theme="dark"] .fl-topbar a{color:rgba(240,237,232,.6)}
.fl-topbar a:hover{background:rgba(176,138,62,.1);color:#8A6A2F}
[data-theme="dark"] .fl-topbar a:hover{background:rgba(232,206,150,.1);color:#E8CE96}
.fl-topbar .sep{flex:1}
.fl-topbar .dom{font:600 9.5px 'IBM Plex Mono',monospace;letter-spacing:.12em;color:#B08A3E;white-space:nowrap}
.fl-sbbrand{display:flex;align-items:center;gap:10px;padding:2px 10px 12px}
.fl-sbbrand .lg{width:30px;height:30px;border:1.5px solid #B08A3E;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none}
.fl-sbbrand .nm{font:500 15px 'Playfair Display',serif;letter-spacing:.18em;color:#fff}
.fl-sbbrand .sb{font:500 7.5px 'IBM Plex Sans',sans-serif;letter-spacing:.3em;color:#B08A3E}
.fl-layout .portal-content{flex:1;min-width:0;padding-left:22px}
@media (max-width:920px){
  .fl-layout{flex-direction:column;min-height:0}
  .fl-layout .portal-nav{width:100%;flex-direction:row;flex-wrap:wrap;position:static;height:auto!important;max-height:none;align-items:center;gap:2px;border-radius:0;padding:10px 8px!important}
  .fl-sbbrand{padding:2px 10px;width:100%}
  .vp-grp{display:none}
  .vp-foot{margin:0;padding:0;border:none;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
  .fl-layout .portal-nav a{display:inline-block!important;padding:7px 10px!important;font-size:10px!important}
  .fl-layout .portal-content{padding:18px 14px 0}
  .fl-topbar{margin-left:0;padding:8px 12px}
}
/* secciones del panel */
.vp-sub{color:var(--sub);font-size:14px;line-height:1.7;max-width:720px;margin:-14px 0 22px}
.vp-sec{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:var(--text);margin:30px 0 12px}
.vp-sec small{font-family:'Jost',sans-serif;font-size:12px;color:var(--muted);margin-left:10px}
.vp-cargando{color:var(--muted);font-size:13px}
.vp-nota{font-size:12px;color:var(--muted);line-height:1.7;margin-top:10px;max-width:760px}
.vp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
.vp-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px;position:relative}
.vp-card h4{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:400;color:var(--text);margin:0 0 6px}
.vp-card p{font-size:13px;color:var(--sub);line-height:1.65;margin:0}
.vp-card .l{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.vp-card a.vp-ir{display:inline-block;margin-top:10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);text-decoration:none}
.vp-fila{display:flex;gap:10px;align-items:baseline;text-decoration:none;background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:11px 14px;margin-bottom:8px;color:var(--text);font-size:13px;line-height:1.5}
.vp-fila b{color:var(--text)}
.vp-chips{display:flex;gap:8px;flex-wrap:wrap;margin:-8px 0 20px}
.vp-chip{font-size:11px;padding:5px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--sub)}
.vp-chip b{color:var(--text)}
.vp-tag{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:4px;white-space:nowrap;display:inline-block}
.vp-tag.infra{color:#4caf50;background:rgba(76,175,80,.12)}.vp-tag.precio{color:var(--gold);background:rgba(184,151,90,.14)}
.vp-tag.cara{color:#ef5350;background:rgba(239,83,80,.12)}.vp-tag.sin{color:var(--muted);background:rgba(120,130,140,.12)}
.vp-tag.zona{color:#14213D;background:#E8CE96}.vp-tag.tengo{color:var(--sub);background:transparent;border:1px solid var(--border)}
.vp-tag.pro{color:#B08A3E;border:1px solid #B08A3E}.vp-tag.gratis{color:#4caf50;border:1px solid rgba(76,175,80,.5)}
.vp-tblwrap{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow-x:auto;position:relative}
.vp-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
.vp-tbl th{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:11px 12px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap}
.vp-tbl th.l,.vp-tbl td.l{text-align:left}
.vp-tbl td{padding:10px 12px;border-bottom:.5px solid var(--border);color:var(--text);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.vp-tbl tr:last-child td{border-bottom:none}
.vp-tbl .tk{font-weight:700;color:var(--gold);text-decoration:none}
.vp-tbl .nm{display:block;font-size:11px;color:var(--muted);font-weight:400;white-space:normal}
.vp-tbl tr.vp-blur td{filter:blur(4px);pointer-events:none;user-select:none}
.vp-lock{position:absolute;left:0;right:0;bottom:0;padding:22px;text-align:center;background:linear-gradient(to bottom,transparent,var(--card) 40%)}
.vp-lock b{display:block;font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;color:var(--text)}
.vp-lock p{font-size:12.5px;color:var(--sub);margin:4px 0 10px}
.vp-btn{font-family:'Jost',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--navy);
  background:var(--gold);border:none;padding:10px 20px;border-radius:5px;cursor:pointer;text-decoration:none;display:inline-block}
.vp-btn:hover{background:var(--gold2)}
.vp-btn.sec{background:transparent;color:var(--gold);border:1px solid var(--gold)}
.vp-btn.mini{padding:6px 12px;font-size:10px}
.vp-btn[disabled]{opacity:.45;cursor:default}
.vp-form{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:8px;padding:10px;border:1px dashed var(--border);border-radius:8px;text-align:left}
.vp-form label{display:block;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.vp-form input,.vp-form select{padding:7px 9px;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Jost',sans-serif;font-size:13px;outline:none;min-width:90px}
[data-theme="light"] .vp-form input,[data-theme="light"] .vp-form select{background:var(--bg3)}
.vp-form input:focus,.vp-form select:focus{border-color:var(--gold)}
.vp-msg{font-size:12.5px;margin-top:8px}
.vp-cur{display:inline-flex;border:1px solid var(--border);border-radius:7px;overflow:hidden;vertical-align:middle}
.vp-cur button{font-family:'Jost',sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.06em;padding:6px 12px;border:none;background:transparent;color:var(--muted);cursor:pointer}
.vp-cur button+button{border-left:1px solid var(--border)}
.vp-cur button.on{background:var(--gold);color:var(--navy)}
.vp-pasos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:8px}
.vp-paso{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px;cursor:pointer}
.vp-paso .n{font-family:'Cormorant Garamond',serif;font-size:26px;color:var(--gold);line-height:1}
.vp-paso.ok .n{color:#4caf50}
.vp-paso b{display:block;font-size:14px;color:var(--text);margin:8px 0 4px}
.vp-paso p{font-size:12.5px;color:var(--sub);line-height:1.6;margin:0}
.vp-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#14213D;color:#E8CE96;border:1px solid #B08A3E;border-radius:8px;padding:11px 18px;font-size:13px;z-index:999;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.vp-spark{width:100%;height:36px;display:block;margin:8px 0 4px}
.vp-pos{color:#4caf50}.vp-neg{color:#ef5350}.vp-mut{color:var(--muted)}
.vp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:18px}
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
const titulo = t => `<div class="portal-title">${t}</div>`;

function toast(msg) {
  const d = document.createElement('div'); d.className = 'vp-toast'; d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), 3200);
}

/* ───────────────────────── datos (con caché) ───────────────────────── */
const _c = {};
const cached = (k, f) => _c[k] || (_c[k] = f().catch(() => null));
const invalidar = (...ks) => ks.forEach(k => { delete _c[k]; });
async function docJson(col) {
  try { const s = await getDoc(doc(db(), col, 'latest')); return s.exists() ? { ...JSON.parse(s.data().json || '{}'), _ts: s.data().actualizado_utc || null } : null; }
  catch (e) { return null; }
}
const radarDoc = () => cached('radar', async () => (await docJson('radar')) || { activos: [] });
const radar = async () => (await radarDoc()).activos || [];
const teaser = () => cached('teaser', async () => ((await docJson('carterasTeaser')) || {}).carteras || []);
const calendario = () => cached('cal', async () => ((await docJson('calendario')) || {}).earnings || []);
const flujos = () => cached('flujos', async () => (await docJson('bonosFlujos')) || {});
const panelBonos = () => cached('bp', async () => (await docJson('bonosPanel')) || {});
const preciosInf = () => cached('pi', async () => (await docJson('preciosInformes')) || {});
const desglosePer = () => cached('dg', async () => (await docJson('desglosePeriodos')) || {});
const bonosSet = () => cached('bset', async () => new Set(Object.keys((await panelBonos()).todos || {})));
const fx = () => cached('fx', async () => {
  const r = await fetch('https://dolarapi.com/v1/dolares'); const d = await r.json();
  const v = casa => { const x = d.find(y => y.casa === casa); return x ? x.venta : null; };
  return { ccl: v('contadoconliqui'), mep: v('bolsa') };
});
const cartera = () => cached('cartera', async () => {
  if (!S.verificado) return { pos: [], precios: {} };
  const snap = await getDocs(collection(db(), 'inversores', S.email, 'cartera'));
  const pos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tks = [...new Set(pos.map(p => String(p.ticker || '').toUpperCase()))].filter(Boolean);
  const precios = {};
  await Promise.all(tks.map(async tk => {
    try { const s = await getDoc(doc(db(), 'precios', tk)); if (s.exists()) precios[tk] = s.data(); } catch (e) {}
  }));
  return { pos, precios };
});
async function carteraCalc() {
  const c = (await cartera()) || { pos: [], precios: {} };
  const f = (await fx()) || { ccl: null, mep: null };
  return { ...c, fx: f, cur: curVista(), r: calcular(c.pos, c.precios, curVista(), f) };
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

/* ───────────────────────── shell: sidebar + topbar + ruteo ───────────────────────── */
const TABS = [
  { g: 'Tu panel', id: 'inicio', t: 'Inicio' },
  { g: 'Tu panel', id: 'comprar', t: 'Qué comprar' },
  { g: 'Tu panel', id: 'carteras', t: 'Carteras Valtia' },
  { g: 'Tu panel', id: 'micartera', t: 'Mi cartera' },
  { g: 'Tu panel', id: 'empresas', t: 'Mis empresas' },
  { g: 'Tu panel', id: 'disciplina', t: 'Disciplina' },
  { g: 'Tu panel', id: 'herramientas', t: 'Herramientas y datos' },
  { g: 'Fondo Valtia', id: 'fondocli', t: 'Tu posición', cliente: true },
  { g: 'Gestión', id: 'dashboard', t: 'Fondo · Dashboard', admin: true },
  { g: 'Gestión', id: 'rendimientos', t: 'Rendimientos', admin: true },
  { g: 'Gestión', id: 'movimientos', t: 'Movimientos', admin: true },
  { g: 'Gestión', id: 'fondo', t: 'Balance consolidado', admin: true },
  { g: 'Gestión', id: 'senales', t: 'Señales', admin: true },
  { g: 'Gestión', id: 'analisis', t: 'Análisis de cartera', admin: true },
  { g: 'Gestión', id: 'informes', t: 'Lector de informes', admin: true },
  { g: 'Gestión', id: 'admin', t: 'Inversores', admin: true },
];
const NUEVOS = ['inicio', 'comprar', 'carteras', 'empresas', 'disciplina', 'herramientas'];
// tabs que este usuario puede abrir: los divs de Gestión y Fondo viven en el
// HTML para todos, así que sin este set cualquiera llega por #panel/admin
let _permitidos = new Set(NUEVOS.concat(['micartera']));
let _tab = 'inicio';
const _render = { inicio: renderInicio, comprar: renderComprar, carteras: renderCarteras, empresas: renderEmpresas,
                  disciplina: renderDisciplina, herramientas: renderHerramientas };
const _hecho = {};

function etiquetaPlan() {
  return S.isAdmin ? 'Admin' : S.cliente ? 'Cliente · a medida' : S.pro ? 'PRO' : S.verificado ? 'Gratis' : 'Gratis · verificá tu mail';
}

function instalarShell() {
  if (!$('vp-style')) { const st = document.createElement('style'); st.id = 'vp-style'; st.textContent = CSS; document.head.appendChild(st); }
  const nav = document.querySelector('.portal-nav'), content = document.querySelector('.portal-content');
  if (!nav || !content) return;
  NUEVOS.forEach(id => { if (!$('tab-' + id)) { const d = document.createElement('div'); d.id = 'tab-' + id; d.style.display = 'none'; content.appendChild(d); } });
  const grupos = [];
  _permitidos = new Set(['micartera']);
  TABS.forEach(t => {
    if (t.admin && !S.isAdmin) return;
    if (t.cliente && !S.cliente) return;
    _permitidos.add(t.id);
    let g = grupos.find(x => x.g === t.g); if (!g) grupos.push(g = { g: t.g, items: [] });
    g.items.push(t);
  });
  const link = t => `<a href="#panel/${t.id}" id="${t.id}-tab" data-tab="${t.id}" onclick="portalTab(event,'${t.id}')">${t.t}</a>`;
  nav.innerHTML = `<div class="fl-sbbrand">
      <div class="lg"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 12 L5 6 L8 9 L12 3 L15 6" fill="none" stroke="#B08A3E" stroke-width="1.5"/></svg></div>
      <div><div class="nm">VALTIA</div><div class="sb">ANALYTICS</div></div></div>` +
    grupos.map(g => `<div class="vp-grp">${g.g}</div>` + g.items.map(link).join('')).join('') +
    `<div class="vp-foot"><span id="portal-user-name">—</span><span class="vp-plan${S.pro ? ' pro' : ''}" id="vp-plan">${etiquetaPlan()}</span>
      <a href="#" class="vp-sitio" onclick="valtiaPanel.salir(event)">← Volver al sitio</a>
      <button onclick="logout()">Cerrar sesión</button></div>`;
  if (!document.querySelector('.fl-layout')) {
    const wrap = document.createElement('div'); wrap.className = 'fl-layout';
    nav.parentElement.insertBefore(wrap, nav); wrap.appendChild(nav);
    const main = document.createElement('div'); main.className = 'fl-main';
    main.innerHTML = `<div class="fl-topbar">
      <a onclick="valtiaPanel.salir(event)">← Sitio</a>
      <a href="noticias.html">Noticias</a>
      <a href="calendario.html">Calendario</a>
      <a href="informes.html">Informes</a>
      <a href="planes.html">Planes</a>
      <span class="sep"></span><span class="dom">VALTIA.TECH</span></div>`;
    main.appendChild(content); wrap.appendChild(main);
  }
  document.body.classList.add('fl-app-on');
  const og = window.goPortal;
  window.goPortal = e => { if (og) og(e); document.body.classList.add('fl-app-on'); portalTab(_tab); };
  if (!document.querySelector('link[href*="Playfair"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
}

export function portalTab(e, tab) {
  if (typeof e === 'string') { tab = e; e = null; }
  if (e && e.preventDefault) e.preventDefault();
  if (!$('tab-' + tab) || !_permitidos.has(tab)) tab = 'inicio';
  document.querySelectorAll('.portal-content > [id^="tab-"]').forEach(el => { el.style.display = el.id === 'tab-' + tab ? 'block' : 'none'; });
  document.querySelectorAll('.portal-nav a[data-tab]').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  _tab = tab;
  try { sessionStorage.setItem('valtia-panel-tab', tab); sessionStorage.setItem('valtia-panel-user', S.email || ''); } catch (x) {}
  if (location.hash !== '#panel/' + tab) history.replaceState(null, '', '#panel/' + tab);
  if (e) window.scrollTo(0, 0);
  if (_render[tab] && !_hecho[tab]) { _hecho[tab] = true; _render[tab](); }
  if (window.flResizeCharts) window.flResizeCharts();
}
function refrescar(...tabs) {
  tabs.forEach(t => { _hecho[t] = false; if (t === _tab) portalTab(t); });
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

/* punto de entrada: lo llama enterPortal (index.html) para todo usuario */
export async function iniciarPanel({ user, isAdmin, data }) {
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
  instalarShell();
  abrirDesdeHash();
  const antesPro = S.pro;
  await detectarPlan();
  const chip = $('vp-plan');
  if (chip) { chip.textContent = etiquetaPlan(); chip.classList.toggle('pro', S.pro); }
  // el plan se resuelve después del primer render: si resultó PRO, hay que
  // rehacer lo que se dibujó con el plan provisorio Y tirar el caché de
  // informes (se pidió con el filtro de visibilidad de un usuario gratis)
  if (S.pro && !antesPro) {
    invalidar('inf');
    refrescar('inicio', 'comprar', 'carteras', 'empresas', 'herramientas');
  }
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
  refrescar('inicio', 'comprar', 'carteras', 'disciplina', 'empresas', 'herramientas');
  if (window.__mcRecargar) window.__mcRecargar();
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
  const t = e.target.closest('[data-go],[data-compra],[data-ok],[data-cancel],.vp-cur button');
  if (!t) return;
  if (t.dataset.go) { e.preventDefault(); portalTab(t.dataset.go); return; }
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
  if (t.matches('.vp-cur button')) {
    try { localStorage.setItem('valtia-mc-cur', t.dataset.cur); } catch (x) {}
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
const selectorCur = () => `<span class="vp-cur">${['ARS', 'CCL', 'MEP'].map(c => `<button data-cur="${c}" class="${curVista() === c ? 'on' : ''}">${curEtq(c)}</button>`).join('')}</span>`;

/* ───────────────────────── INICIO ───────────────────────── */
async function renderInicio() {
  const el = $('tab-inicio');
  const nombre = esc((S.user.displayName || S.email.split('@')[0]).split(' ')[0]);
  el.innerHTML = titulo('Hola, ' + nombre) + '<p class="vp-cargando">Armando tu panorama…</p>';
  const [cc, disc] = await Promise.all([carteraCalc(), disciplina()]);
  const tiene = cc.pos.length > 0;
  let h = titulo('Hola, ' + nombre);
  if (tiene) h += bloqueKpis(cc); else h += bloqueCamino(cc, disc);
  h += `<div class="vp-sec">Qué cambió${tiene ? ' en tu cartera' : ''}</div><div id="vp-cambios"><p class="vp-cargando">Buscando novedades…</p></div>`;
  h += `<div class="vp-sec">Qué comprar hoy<small>lectura Valtia · <a href="#panel/comprar" data-go="comprar" style="color:var(--gold)">ver la lista completa →</a></small></div><div id="vp-top3" class="vp-grid"><p class="vp-cargando">Cargando el radar…</p></div>`;
  h += `<div class="vp-sec">Carteras Valtia<small><a href="#panel/carteras" data-go="carteras" style="color:var(--gold)">ver todas →</a></small></div><div id="vp-cart3" class="vp-grid"></div>`;
  if (S.cliente) {
    const v = Number(S.data.valorActual) || 0;
    h += `<div class="vp-sec">Fondo Valtia</div><div class="vp-card" style="max-width:420px"><div class="l">Tu posición en el fondo (a medida)</div>
      <h4>$${Math.round(v).toLocaleString('es-AR')}</h4><p>a precios de mercado · ${S.data.actualizado_utc ? 'actualizada el ' + new Date(S.data.actualizado_utc.seconds ? S.data.actualizado_utc.seconds * 1000 : S.data.actualizado_utc).toLocaleDateString('es-AR') : ''}</p>
      <a class="vp-ir" href="#panel/fondocli" data-go="fondocli">Ver el detalle →</a></div>`;
  }
  el.innerHTML = h;
  cambios(cc, disc); top3(cc); carterasMini(cc);
}

function bloqueKpis(cc) {
  const r = cc.r, cur = cc.cur, m = curMoneda(cur);
  // dos causas distintas de "no suma al total": sin precio del sync, o sin
  // cotización del dólar para convertir. Antes las contaba juntas.
  const sinPx = r.filas.filter(f => f.actual == null).length;
  const sinFx = r.filas.filter(f => f.actual != null && f.dValor == null).length;
  const brokers = agruparPorBroker(r.filas, r.total);
  const porMoneda = {};
  r.filas.forEach(f => { if (f.dValor != null) porMoneda[f.moneda] = (porMoneda[f.moneda] || 0) + f.dValor; });
  return `<div class="vp-kpis">
      <div class="pkpi"><div class="pkpi-label">Valor de tu cartera</div><div class="pkpi-value">${money(r.total, m)}</div><div class="pkpi-sub">${r.filas.filter(f => f.dValor != null).length} de ${r.filas.length} posici${r.filas.length === 1 ? 'ón' : 'ones'} en ${brokers.length} broker${brokers.length === 1 ? '' : 's'}</div></div>
      <div class="pkpi"><div class="pkpi-label">Invertido</div><div class="pkpi-value">${money(r.costoTot, m)}</div><div class="pkpi-sub">costo de lo que tiene precio</div></div>
      <div class="pkpi"><div class="pkpi-label">Resultado</div><div class="pkpi-value ${r.plTot >= 0 ? 'pos' : 'neg'}">${moneyS(r.plTot, m)}</div><div class="pkpi-sub">no realizado</div></div>
      <div class="pkpi"><div class="pkpi-label">Rendimiento</div><div class="pkpi-value ${(r.plTotPct || 0) >= 0 ? 'pos' : 'neg'}">${pct(r.plTotPct)}</div><div class="pkpi-sub">sobre lo invertido</div></div>
    </div>
    <div class="vp-chips">${selectorCur()}
      ${brokers.map(b => `<span class="vp-chip"><b>${esc(b.broker)}</b> ${b.peso != null ? b.peso.toFixed(0) + '%' : ''}</span>`).join('')}
      ${Object.entries(porMoneda).map(([k, v]) => `<span class="vp-chip">${k === 'ARS' ? 'en pesos' : 'en dólares'} <b>${r.total ? (v / r.total * 100).toFixed(0) : 0}%</b></span>`).join('')}
      ${frescura(cc.precios) ? `<span class="vp-chip">${frescura(cc.precios)}</span>` : ''}
      ${sinPx ? `<span class="vp-chip" style="color:#E0A93E">${sinPx} ${sinPx > 1 ? 'esperan' : 'espera'} precio (9:00)</span>` : ''}
      ${sinFx ? `<span class="vp-chip" style="color:#E0A93E">sin cotización del dólar: ${sinFx} ${sinFx > 1 ? 'posiciones quedan' : 'posición queda'} fuera del total</span>` : ''}
      <a class="vp-chip" href="#panel/micartera" data-go="micartera" style="text-decoration:none;color:var(--gold)">ver Mi cartera →</a>
    </div>
    ${cur !== 'ARS' ? `<p class="vp-nota" style="margin:-12px 0 18px">El costo y el valor se convierten con la cotización de hoy, así que el rendimiento es el mismo que en pesos: no es tu retorno medido en dólares.</p>` : ''}`;
}

function bloqueCamino(cc, disc) {
  const compras = (disc && disc.log || []).length;
  const pasos = [
    { ok: compras > 0, go: 'comprar', t: 'Mirá qué comprar hoy', p: 'La lectura Valtia de 34 activos, con los que están en zona de compra primero.' },
    { ok: cc.pos.length > 0, go: 'micartera', t: 'Cargá tu cartera', p: 'Lo que ya tenés en IOL, PPI, Balanz o Binance. Se importa pegando desde Excel.' },
    { ok: !!(disc && disc.config), go: 'disciplina', t: 'Definí tu regla de Disciplina', p: 'Cuánto aportás por mes y en cuántas compras. Te marcamos el ritmo.' },
  ];
  return `<p class="vp-sub">Tu panel arma un panorama completo de tus inversiones, estén en el broker que estén. Tres pasos para empezar:</p>
    <div class="vp-pasos">${pasos.map((s, i) => `<div class="vp-paso${s.ok ? ' ok' : ''}" data-go="${s.go}"><div class="n">${s.ok ? '✓' : '0' + (i + 1)}</div><b>${s.t}</b><p>${s.p}</p></div>`).join('')}</div>
    ${!S.verificado ? `<p class="vp-nota">Verificá tu email para activar Mi cartera y Disciplina (te mandamos el link al registrarte).</p>` : ''}`;
}

async function cambios(cc, disc) {
  const box = $('vp-cambios'); if (!box) return;
  const items = [];
  const fila = (icono, txt, go, href) => `<a class="vp-fila" ${go ? `href="#panel/${go}" data-go="${go}"` : `href="${href}"`}><span>${icono}</span><span>${txt}</span></a>`;
  const tiene = cc.pos.length > 0, ten = tenencias(cc), hoy = hoyAR();
  try {
    const act = await radar();
    if (tiene) {
      act.filter(a => ten.radar.has(a.sym)).forEach(a => {
        if (a.entrada) items.push(fila('◎', `<b>${esc(a.sym)}</b> está hoy en zona de compra según el radar (valor ${a.score ?? '—'}, RSI ${a.rsi != null ? a.rsi.toFixed(0) : '—'}).`, 'comprar'));
        else if (a.rsi != null && a.rsi > 70) items.push(fila('▲', `<b>${esc(a.sym)}</b> viene sobrecomprado (RSI ${a.rsi.toFixed(0)}).`, 'micartera'));
        else if (a.rsi != null && a.rsi < 30) items.push(fila('▼', `<b>${esc(a.sym)}</b> está sobrevendido (RSI ${a.rsi.toFixed(0)}).`, 'micartera'));
      });
    } else {
      const zona = act.filter(a => a.entrada);
      if (zona.length) items.push(fila('◎', `<b>${zona.length} activo${zona.length > 1 ? 's' : ''} en zona de compra</b> hoy: ${zona.map(a => esc(a.sym)).slice(0, 5).join(', ')} →`, 'comprar'));
    }
  } catch (e) {}
  try {
    const cal = await calendario();
    cal.filter(c => c.fecha >= hoy && enDias(c.fecha) <= (tiene ? 7 : 3) && (!tiene || ten.fichas.has(c.ficha)))
      .forEach(c => items.push(fila('📅', `<b>${esc(c.nombre)}</b> presenta resultados el ${fmtF(c.fecha)}${enDias(c.fecha) === 0 ? ' (hoy)' : ''}.`, null, 'calendario.html')));
  } catch (e) {}
  if (tiene && ten.pares.size) {
    try {
      const fl = await flujos();
      cc.pos.forEach(p => {
        if (!ten.especies.has(base(p.ticker))) return;
        // los soberanos se indexan por el par (AL30) y los Bopreal por su
        // símbolo completo (BPA7D): se prueban las dos formas
        const esp = base(p.ticker), par = fl[esp] ? esp : parBono(esp), d = fl[par];
        if (!d || !d.flujos) return;
        d.flujos.filter(([f]) => f >= hoy && enDias(f) <= 30).slice(0, 1).forEach(([f, monto]) => {
          const est = (Number(p.cantidad) || 0) * Number(monto) / 100;
          items.push(fila('💵', `<b>${esc(base(p.ticker))}</b> paga el ${fmtF(f)}: ~US$${est.toLocaleString('es-AR', { maximumFractionDigits: 0 })} por tus ${Number(p.cantidad).toLocaleString('es-AR')} VN (estimado).`, null, 'bono.html?e=' + encodeURIComponent(especieBono(par))));
        });
      });
      const tf = ((await panelBonos()).tasa_fija || []);
      tf.filter(l => ten.especies.has(l.s) && l.vence >= hoy && enDias(l.vence) <= 30)
        .forEach(l => items.push(fila('⏳', `<b>${esc(l.s)}</b> vence el ${fmtF(l.vence)}${l.vpv ? ` y paga ${l.vpv} por cada 100 VN` : ''}.`, null, 'bono.html?e=' + encodeURIComponent(l.s))));
    } catch (e) {}
  }
  try {
    const inf = (await informes()) || [];
    const corte = new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 10);
    inf.filter(d => String(d.fecha).slice(0, 10) >= corte && (!tiene || (d.ticker && ten.fichas.has(String(d.ticker).toUpperCase()))))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, tiene ? 5 : 2)
      .forEach(d => items.push(fila('📄', `Informe${d.ticker ? ' de <b>' + esc(d.ticker) + '</b>' : ''}: ${esc(d.titulo)} · ${fmtF(d.fecha)} →`, null, d.ticker ? 'activo.html?t=' + encodeURIComponent(d.ticker) + '#informe' : 'informes.html')));
  } catch (e) {}
  try {
    const corte = new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 10);
    ((await teaser()) || []).forEach(t => {
      const u = t.ultimaRotacion;
      if (!u || u.fecha < corte) return;
      // el movimiento (qué y en qué sentido) es contenido de la cartera: si el
      // usuario no la puede abrir, solo se le anuncia que hubo rotación
      const abierta = t.visibilidad === 'publico' || S.pro;
      items.push(fila('🔄', abierta && u.ticker
        ? `<b>${esc(t.nombre)}</b> rotó el ${fmtF(u.fecha)}: ${esc(u.accion)} ${esc(u.ticker)} →`
        : `<b>${esc(t.nombre)}</b> rotó el ${fmtF(u.fecha)} →`, null, 'cartera.html?c=' + t.id));
    });
  } catch (e) {}
  if (disc && disc.config) {
    const mes = hoy.slice(0, 7), obj = Math.max(1, Number(disc.config.compras) || 1);
    const hechas = disc.log.filter(c => String(c.fecha || '').slice(0, 7) === mes).length;
    if (hechas < obj) items.push(fila('◎', `Disciplina: este mes te falta${obj - hechas > 1 ? 'n' : ''} <b>${obj - hechas} compra${obj - hechas > 1 ? 's' : ''}</b> de ${obj}.`, 'disciplina'));
    else items.push(fila('✓', `Disciplina: <b>plan del mes cumplido</b> (${hechas} de ${obj}).`, 'disciplina'));
  }
  box.innerHTML = items.length ? items.join('') : `<p class="vp-nota">${tiene ? 'Nada nuevo sobre tus activos hoy: sin zona de compra, resultados ni pagos en los próximos días.' : 'Sin novedades hoy.'}</p>`;
}

async function top3(cc) {
  const box = $('vp-top3'); if (!box) return;
  const ten = tenencias(cc), pi = (await preciosInf()) || {};
  const lista = ordenComprar(await radar()).filter(a => !ten.radar.has(a.sym)).slice(0, 3);
  box.innerHTML = lista.map(a => {
    const f = tickerFicha(a.sym), p = f && pi[f] && pi[f].p != null ? pi[f].p : a.precio;
    return `<div class="vp-card"><div class="l">${esc(a.sector || '')}</div><h4>${f ? `<a href="activo.html?t=${f}" style="color:inherit;text-decoration:none">${esc(a.sym)}</a>` : esc(a.sym)} <span style="font-size:13px;color:var(--muted)">${esc(a.nombre)}</span></h4>
      <p><span class="vp-tag ${verCls(a.veredicto)}">${esc(a.veredicto)}</span> ${a.entrada ? '<span class="vp-tag zona">◎ zona de compra</span>' : ''} · US$${num(p, 2)}${a.rsi != null ? ` · RSI ${a.rsi.toFixed(0)}` : ''}</p></div>`;
  }).join('') || '<p class="vp-nota">El radar no está disponible ahora.</p>';
}

async function carterasMini(cc) {
  const box = $('vp-cart3'); if (!box) return;
  const ts = (await teaser()) || [];
  box.innerHTML = ts.map(t => cardCartera(t, null)).join('') || '<p class="vp-nota">Las carteras no están disponibles ahora.</p>';
}

/* ───────────────────────── QUÉ COMPRAR ───────────────────────── */
function ordenComprar(act) {
  return act.filter(a => a.veredicto && (a.veredicto !== 'Sin cobertura' || a.entrada))
    .sort((x, y) => (y.entrada ? 1 : 0) - (x.entrada ? 1 : 0) || (y.score || 0) - (x.score || 0) || (x.rsi || 99) - (y.rsi || 99));
}

async function renderComprar() {
  const el = $('tab-comprar');
  el.innerHTML = titulo('Qué comprar hoy') + '<p class="vp-cargando">Cargando el radar…</p>';
  const [rd, cc, pi] = await Promise.all([radarDoc(), carteraCalc(), preciosInf()]);
  const ten = tenencias(cc);
  const lista = ordenComprar(rd.activos || []);
  const enCarteras = await mapaCarteras();
  const fecha = rd._ts ? new Date(rd._ts.seconds ? rd._ts.seconds * 1000 : rd._ts).toLocaleDateString('es-AR') : (rd.snapshot || '');
  const LIBRES = 5;
  const fila = (a, i) => {
    const f = tickerFicha(a.sym), p = f && pi[f] && pi[f].p != null ? pi[f].p : a.precio;
    const tengo = ten.radar.has(a.sym);
    const enC = (enCarteras[f || a.sym] || []).map(c => `<span class="vp-tag tengo">en ${esc(c)}</span>`).join(' ');
    const blur = !S.pro && i >= LIBRES;
    return `<tr class="${blur ? 'vp-blur' : ''}">
      <td class="l">${f ? `<a class="tk" href="activo.html?t=${f}">${esc(a.sym)}</a>` : `<span class="tk">${esc(a.sym)}</span>`}<span class="nm">${esc(a.nombre)} · ${esc(a.sector || '')}</span></td>
      <td class="l"><span class="vp-tag ${verCls(a.veredicto)}">${esc(a.veredicto)}</span> ${a.entrada ? '<span class="vp-tag zona">◎ zona de compra</span>' : ''} ${a.pierdePlata ? '<span class="vp-tag" style="color:#E0A93E;border:1px solid rgba(224,169,62,.5)" title="El puntaje mide qué tan barata cotiza; esta empresa hoy no gana dinero">no gana plata</span>' : ''} ${tengo ? '<span class="vp-tag tengo">lo tenés</span>' : ''} ${enC}</td>
      <td>${a.score ?? '—'}</td>
      <td>${p != null ? 'US$' + num(p, 2) : '—'}</td>
      <td>${a.rsi != null ? a.rsi.toFixed(0) : '—'}<span class="nm">${esc(a.rsiZona || '')}</span></td>
      ${S.pro ? `<td>${a.per != null ? num(a.per, 1) + 'x' : '—'}</td><td>${a.evebitda != null ? num(a.evebitda, 1) + 'x' : '—'}</td><td>${a.fcfy != null ? num(a.fcfy, 1) + '%' : '—'}</td><td>${a.calidadScore ?? '—'}</td>` : ''}
      <td data-host><button class="vp-btn mini sec" data-compra="${esc(a.sym)}" data-px="${p != null && f ? p : ''}" ${blur ? 'disabled' : ''}>La compré</button></td>
    </tr>`;
  };
  el.innerHTML = titulo('Qué comprar hoy') + `
    <p class="vp-sub">Una sola lista, con el criterio a la vista: primero lo que está en <b>zona de compra</b> (puntaje de valor ≥ 60 y RSI &lt; 45), después por puntaje de valor. Es la lectura propia de Valtia sobre ${lista.length} activos${fecha ? ', radar del ' + fecha : ''}; no es una recomendación personalizada. Los precios son en dólares (las argentinas por su ADR).</p>
    ${DATALIST}
    <div class="vp-tblwrap"><table class="vp-tbl"><thead><tr>
      <th class="l">Activo</th><th class="l">Lectura Valtia</th><th>Valor</th><th>Precio</th><th>RSI</th>${S.pro ? '<th>PER</th><th>EV/EBITDA</th><th>FCF yield</th><th>Calidad</th>' : ''}<th></th></tr></thead>
      <tbody>${lista.map(fila).join('')}</tbody></table>
      ${!S.pro && lista.length > LIBRES ? `<div class="vp-lock"><b>Con PRO ves los ${lista.length} activos con PER, EV/EBITDA, FCF yield y calidad</b><p>Gratis ves los 5 mejor puntuados con su veredicto y la zona de compra.</p><a class="vp-btn" href="planes.html">Ver planes</a></div>` : ''}
    </div>
    <p class="vp-nota">"La compré" registra la compra en Mi cartera y en tu plan de Disciplina, con el mercado, la cantidad, el precio que pagaste y el broker. Si compraste en BYMA (CEDEAR o acción local), el precio va en pesos.</p>`;
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
function sparkline(serie) {
  if (!serie || serie.length < 2) return '';
  const ys = serie.map(s => Number(s[1])), mn = Math.min(...ys), mx = Math.max(...ys), rg = mx - mn || 1;
  const pts = ys.map((y, i) => `${(i / (ys.length - 1) * 100).toFixed(1)},${(30 - (y - mn) / rg * 28 + 1).toFixed(1)}`).join(' ');
  return `<svg class="vp-spark" viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#B08A3E" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
const RIESGO = { conservador: 'Riesgo bajo', moderado: 'Riesgo medio', agresivo: 'Riesgo alto' };
const PERFIL = { 'renta-fija': 'Renta fija', 'renta-mixta': 'Renta mixta', 'renta-variable': 'Renta variable' };
function cardCartera(t, extra) {
  const priv = t.visibilidad && t.visibilidad !== 'publico', bloqueada = priv && !S.pro;
  return `<div class="vp-card"><div class="l">${esc(t.codigo || t.id)} · ${RIESGO[t.nivelRiesgo] || esc(t.nivelRiesgo || '')}${PERFIL[t.perfil] ? ' · ' + PERFIL[t.perfil] : ''}${priv ? ` · <span class="vp-tag pro" style="padding:1px 6px">PRO</span>` : ''}</div>
    <h4>${esc(t.nombre)}</h4>
    ${sparkline(t.serie)}
    <p>Desde ${t.fechaInicio ? fmtF(t.fechaInicio) : 'inicio'}: <b class="${cls(t.retorno)}">${pct(t.retorno, 2)}</b>${t.retornoBench != null ? ` · ${esc(t.benchmark || 'SPY')} ${pct(t.retornoBench, 2)}` : ''} · ${t.posiciones} posiciones${t.ultimaRotacion ? ` · última rotación ${fmtF(t.ultimaRotacion.fecha)}` : ''}</p>
    ${t.tir != null ? `<p style="margin-top:4px">Rinde <b>${num(t.tir, 1)}% anual en dólares</b> si se mantiene a vencimiento${t.tirPeso != null && t.tirPeso < 99 ? ` (sobre el ${t.tirPeso}% en bonos)` : ''}.</p>` : ''}
    ${extra || ''}
    ${bloqueada ? `<a class="vp-ir" href="planes.html">Composición y rotaciones con PRO →</a>` : `<a class="vp-ir" href="cartera.html?c=${esc(t.id)}">Ver composición y tesis →</a>`}</div>`;
}

async function renderCarteras() {
  const el = $('tab-carteras');
  el.innerHTML = titulo('Carteras Valtia') + '<p class="vp-cargando">Cargando…</p>';
  const [ts, cc, bset] = await Promise.all([teaser(), carteraCalc(), bonosSet()]);
  const ten = tenencias(cc, bset);
  const cards = await Promise.all((ts || []).map(async t => {
    let extra = '';
    if (cc.pos.length && (t.visibilidad === 'publico' || S.pro)) {
      const pos = (await posicionesCartera(t.id)) || [];
      if (pos.length) {
        // un bono se cuenta como tenido en cualquiera de sus especies
        // (AL30 y AL30D son el mismo título): se compara por el par
        const faltan = pos.map(p => String(p.ticker || '').toUpperCase()).filter(k =>
          esRentaFija(k, bset) ? !ten.pares.has(parBono(base(k)))
                               : !ten.fichas.has(k) && !ten.radar.has(radarSym(k)));
        extra = `<p style="margin-top:6px">Tenés <b>${pos.length - faltan.length} de ${pos.length}</b>${faltan.length ? ` · te faltan ${faltan.slice(0, 4).map(esc).join(', ')}${faltan.length > 4 ? ' y ' + (faltan.length - 4) + ' más' : ''}` : ' · la tenés completa'}.</p>`;
      }
    }
    return cardCartera(t, extra);
  }));
  el.innerHTML = titulo('Carteras Valtia') + `<p class="vp-sub">Carteras vivas con track record real desde su lanzamiento, sin backtests: cada rotación queda fechada con su razonamiento. Elegí la que va con vos y compará con lo que ya tenés.</p>
    <div class="vp-grid">${cards.join('') || '<p class="vp-nota">Las carteras no están disponibles ahora.</p>'}</div>`;
}

/* ───────────────────────── MIS EMPRESAS ───────────────────────── */
async function renderEmpresas() {
  const el = $('tab-empresas');
  el.innerHTML = titulo('Mis empresas') + '<p class="vp-cargando">Cruzando tu cartera con informes, noticias y agenda…</p>';
  const cc = await carteraCalc();
  if (!cc.pos.length) {
    el.innerHTML = titulo('Mis empresas') + `<p class="vp-sub">Acá vas a ver, para cada activo que tengas, el informe Valtia, las últimas noticias y su próximo evento (resultados, cupón o vencimiento).</p>
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
      if (letra) extra = `<p>${letra.tem != null ? `TEM <b>${num(letra.tem, 2)}%</b> · TIREA ${num(letra.tirea, 1)}% · ` : ''}vence ${fmtF(letra.vence)}${letra.vpv ? ` · paga ${letra.vpv} por 100 VN` : ''}</p>`;
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
      if (docs.length) extra = `<p>📄 <a href="activo.html?t=${f}#informe" style="color:var(--gold)">${esc(docs[0].titulo)}</a> · ${fmtF(docs[0].fecha)}${docs[0].precio_pub && pxUsd ? ` · ${pct((pxUsd / docs[0].precio_pub - 1) * 100, 1)} desde su publicación` : ''}</p>`;
      else if (emp && emp.slug) extra = `<p>📄 Informe Valtia disponible con PRO · <a href="activo.html?t=${f}#informe" style="color:var(--gold)">ver la ficha</a></p>`;
      else if (f) extra = `<p class="vp-mut">Sin informe Valtia todavía · <a href="mailto:valtyaanalytics@gmail.com?subject=Análisis de ${f}" style="color:var(--gold)">pedir este análisis</a></p>`;
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
  el.innerHTML = titulo('Mis empresas') + `<p class="vp-sub">Todo lo que Valtia sabe de cada activo que tenés: informe, noticias y próximo evento. ${selectorCur()}</p>
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
async function renderDisciplina() {
  const el = $('tab-disciplina');
  el.innerHTML = titulo('Disciplina') + '<p class="vp-cargando">Cargando tu plan…</p>';
  if (!S.verificado) {
    el.innerHTML = titulo('Disciplina') + `<div class="vp-card" style="max-width:520px"><h4>Verificá tu email para activar tu plan</h4><p>Te mandamos un mail al registrarte. Abrilo, tocá el link y recargá.</p></div>`;
    return;
  }
  const [disc, cc, pi] = await Promise.all([disciplina(), carteraCalc(), preciosInf()]);
  const config = disc && disc.config, log = (disc && disc.log) || [];
  const hoy = hoyAR(), mes = hoy.slice(0, 7);
  const obj = Math.max(1, Number(config && config.compras) || 1);
  const comprasEn = m => log.filter(c => String(c.fecha || '').slice(0, 7) === m).length;
  let racha = 0;
  if (config) { let m = mes; if (comprasEn(m) >= obj) racha++; m = mesAnterior(m); for (let i = 0; i < 120 && comprasEn(m) >= obj; i++) { racha++; m = mesAnterior(m); } }
  const hechas = comprasEn(mes), faltan = Math.max(0, obj - hechas);
  const ten = tenencias(cc);
  const cand = ordenComprar(await radar()).filter(a => a.score != null && !ten.radar.has(a.sym)).slice(0, 5);
  const monto = config ? (Number(config.aporte) || 0) / obj : 0;
  const filaC = a => {
    const f = tickerFicha(a.sym), p = f && pi[f] && pi[f].p != null ? pi[f].p : a.precio;
    return `<tr><td class="l">${f ? `<a class="tk" href="activo.html?t=${f}">${esc(a.sym)}</a>` : `<span class="tk">${esc(a.sym)}</span>`}<span class="nm">${esc(a.nombre)}</span></td>
      <td class="l"><span class="vp-tag ${verCls(a.veredicto)}">${esc(a.veredicto)}</span> ${a.entrada ? '<span class="vp-tag zona">◎ zona</span>' : ''}</td>
      <td>${a.score ?? '—'}</td><td>${p != null ? 'US$' + num(p, 2) : '—'}</td>
      <td>${p && monto ? num(monto / p, 3) : '—'}</td>
      <td data-host><button class="vp-btn mini sec" data-compra="${esc(a.sym)}" data-px="${p != null && f ? p : ''}">La compré</button></td></tr>`;
  };
  el.innerHTML = titulo('Disciplina') + `
    <p class="vp-sub">El método del inversor constante: una regla mensual, candidatas del radar que todavía no tenés, y cada compra marcada se suma sola a Mi cartera.</p>
    ${DATALIST}
    ${config ? `<div class="vp-kpis">
        <div class="pkpi"><div class="pkpi-label">Tu regla</div><div class="pkpi-value" style="font-size:26px">US$${Number(config.aporte || 0).toLocaleString('es-AR')}</div><div class="pkpi-sub">por mes en ${obj} compra${obj > 1 ? 's' : ''} (US$${Math.round(monto).toLocaleString('es-AR')} c/u)</div></div>
        <div class="pkpi"><div class="pkpi-label">${MESES[Number(mes.slice(5)) - 1]}</div><div class="pkpi-value ${faltan ? '' : 'pos'}">${hechas} / ${obj}</div><div class="pkpi-sub">${faltan ? `te falta${faltan > 1 ? 'n' : ''} ${faltan}` : 'plan cumplido ✓'}</div></div>
        <div class="pkpi"><div class="pkpi-label">Racha</div><div class="pkpi-value">${racha ? '🔥 ' + racha : '—'}</div><div class="pkpi-sub">${racha ? `mes${racha > 1 ? 'es' : ''} seguido${racha > 1 ? 's' : ''} cumpliendo` : 'arrancá este mes'}</div></div>
        <div class="pkpi"><div class="pkpi-label">Compras registradas</div><div class="pkpi-value">${log.length}</div><div class="pkpi-sub"><a href="disciplina.html" style="color:var(--gold)">historial y regla →</a></div></div>
      </div>`
    : `<div class="vp-card" style="max-width:640px;margin-bottom:22px"><h4>Definí tu regla</h4><p>Cuánto aportás por mes en dólares y en cuántas compras lo repartís. Es tu contrato con vos mismo.</p>
        <div class="vp-form" style="border:none;padding:10px 0 0">
          <div><label>Aporte mensual (USD)</label><input type="number" id="vp-d-aporte" min="1" step="any" value="200" style="width:120px"></div>
          <div><label>Compras por mes</label><input type="number" id="vp-d-compras" min="1" max="6" step="1" value="2" style="width:90px"></div>
          <button class="vp-btn mini" id="vp-d-guardar">Guardar mi regla</button><div class="vp-msg" id="vp-d-msg" style="width:100%"></div></div></div>`}
    <div class="vp-sec">Candidatas del mes<small>lo mejor puntuado del radar que no tenés</small></div>
    <div class="vp-tblwrap"><table class="vp-tbl"><thead><tr><th class="l">Activo</th><th class="l">Lectura</th><th>Valor</th><th>Precio</th><th>Sugerido</th><th></th></tr></thead>
      <tbody>${cand.map(filaC).join('') || '<tr><td colspan="6" class="l vp-mut">El radar no está disponible ahora.</td></tr>'}</tbody></table></div>
    <p class="vp-nota">"Sugerido" es la cantidad que entra con tu monto por compra al precio de hoy en dólares. Si comprás en BYMA, cargá la cantidad y el precio en pesos.</p>
    ${log.length ? `<div class="vp-sec">Últimas compras</div><div class="vp-tblwrap"><table class="vp-tbl" style="min-width:420px"><thead><tr><th class="l">Fecha</th><th class="l">Activo</th><th>Cantidad</th><th>Precio</th><th class="l">Broker</th></tr></thead>
      <tbody>${log.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 8).map(c => `<tr><td class="l">${fmtF(c.fecha)}</td><td class="l"><b>${esc(c.ticker)}</b></td><td>${Number(c.cantidad).toLocaleString('es-AR')}</td><td>${num(c.precio, 2)}</td><td class="l">${esc(c.broker || '—')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  const g = $('vp-d-guardar');
  if (g) g.onclick = async () => {
    const aporte = Number($('vp-d-aporte').value), compras = Math.round(Number($('vp-d-compras').value));
    const msg = $('vp-d-msg');
    if (!(aporte > 0) || !(compras >= 1)) { msg.innerHTML = '<span class="vp-neg">Completá el aporte y las compras por mes.</span>'; return; }
    try {
      await setDoc(doc(db(), 'inversores', S.email, 'disciplina', 'config'), { aporte, compras, creado: new Date().toISOString() }, { merge: true });
      toast('Regla guardada'); invalidar('disc'); refrescar('disciplina', 'inicio');
    } catch (e) { msg.innerHTML = `<span class="vp-neg">No se pudo guardar (${esc(String(e.code || e).slice(0, 80))}).</span>`; }
  };
}

/* ───────────────────────── HERRAMIENTAS Y DATOS ───────────────────────── */
const HERRAMIENTAS = [
  ['heatmap', 'Mapa de calor', 'Acciones y CEDEARs del día, en un vistazo.', false],
  ['calendario', 'Calendario económico', 'Eventos macro de la semana.', false],
  ['dolar', 'Dólar histórico', 'Oficial, MEP, CCL y blue en el tiempo.', false],
  ['cauciones', 'Calculadora de cauciones', 'Cuánto rinde colocar pesos a plazo.', false],
  ['radar', 'Radar de valuación', 'Los 34 activos con múltiplos por familia, calidad y zona de compra.', true],
  ['acciones', 'Acciones ARG / EE.UU.', 'Tabla comparada de las principales.', true],
  ['bonos', 'Bonos soberanos', 'TIR, paridad, duration, curva y letras a tasa fija.', true],
  ['ratios', 'Ratios de CEDEARs', 'Múltiplos de los CEDEARs más operados.', true],
];
async function renderHerramientas() {
  const el = $('tab-herramientas');
  el.innerHTML = titulo('Herramientas y datos') + '<p class="vp-cargando">Cargando…</p>';
  const cc = await carteraCalc();
  const bp = await panelBonos(), bset = await bonosSet();
  const m = curMoneda(cc.cur);
  const cards = HERRAMIENTAS.map(([id, t, p, pro]) => `<div class="vp-card"><div class="l">${pro ? `<span class="vp-tag ${S.pro ? 'gratis' : 'pro'}" style="padding:1px 6px">${S.pro ? 'incluida' : 'PRO'}</span>` : '<span class="vp-tag gratis" style="padding:1px 6px">gratis</span>'}</div>
      <h4>${t}</h4><p>${p}</p><a class="vp-ir" href="herramientas.html#${id}">${pro && !S.pro ? 'Ver con PRO →' : 'Abrir →'}</a></div>`).join('');
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
        ${S.pro ? `<td>${rf ? (sob ? 'TIR ' + num(sob.tir, 1) + '%' : letra && letra.tem != null ? 'TEM ' + num(letra.tem, 2) + '%' : '—') : (px.per != null ? num(px.per, 1) + 'x' : '—')}</td>
        <td>${rf ? (sob ? 'MD ' + num(sob.md, 1) : letra ? 'vence ' + fmtF(letra.vence) : '—') : (px.pb != null ? num(px.pb, 1) + 'x' : '—')}</td>
        <td>${rf ? (sob ? 'paridad ' + num(sob.paridad, 1) : '—') : (px.ps != null ? num(px.ps, 1) + 'x' : '—')}</td>
        <td>${rf ? '—' : (px.debtcap != null ? num(px.debtcap * 100, 0) + '%' : '—')}</td>
        <td>${rf ? '—' : (px.divYield != null ? num(px.divYield, 2) + '%' : '—')}</td>
        <td>${px.valorScore ?? '—'}</td>` : `<td>${px.rsi != null ? num(px.rsi, 0) : '—'}</td>`}
      </tr>`;
    };
    datos = `<div class="vp-sec">Datos de tus activos<small>lo que el sync sabe de cada uno${S.pro ? '' : ' · ratios completos con PRO'}</small></div>
      <div class="vp-tblwrap"><table class="vp-tbl"><thead><tr><th class="l">Activo</th><th>Precio</th><th class="l">Lectura</th>${S.pro ? '<th>PER / TIR</th><th>P/Libro / MD</th><th>P/Ventas / paridad</th><th>Deuda/cap</th><th>Div. yield</th><th>Valor</th>' : '<th>RSI</th>'}</tr></thead>
      <tbody>${filas.map(fila).join('') || '<tr><td colspan="9" class="l vp-mut">Tus posiciones todavía no tienen datos del sync (9:00).</td></tr>'}</tbody></table></div>
      ${!S.pro ? `<p class="vp-nota">Con PRO ves PER, P/Libro, P/Ventas, deuda y dividendos de tus acciones, y TIR, duration y paridad de tus bonos. <a href="planes.html" style="color:var(--gold)">Ver planes →</a></p>` : `<p class="vp-nota">Múltiplos de yfinance al último cierre; para renta fija, la matemática propia del panel de bonos (cada 15 min en rueda).</p>`}`;
  }
  el.innerHTML = titulo('Herramientas y datos') + `<div class="vp-grid">${cards}</div>${datos}`;
}

/* exposición global para los onclick del HTML */
window.portalTab = portalTab;
window.valtiaPanel = { salir, portalTab, iniciarPanel, refrescar: () => { invalidar('cartera', 'disc'); refrescar('inicio', 'comprar', 'disciplina', 'empresas', 'herramientas', 'carteras'); } };
