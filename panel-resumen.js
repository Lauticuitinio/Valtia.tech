// panel-resumen.js — la pestaña Resumen del panel del inversor (Panel v3).
// La estructura es la del prototipo de Lauti (.claude/handoff-panel-v3, líneas
// 76-217): tarjeta principal con el valor y dos tortas, la evolución comparada
// adentro de esa misma tarjeta, la fila "Atención", hasta cuatro tarjetas de
// "hoy" y dos columnas (agenda de tus activos · research). Los colores y la
// tipografía son los de Noticias: todo sale de las variables --v3-* que define
// panel.js (así funciona el tema oscuro), títulos en Playfair 700 y cifras en
// IBM Plex Mono.
//
// Nada inventado: cada número sale del ctx o de una cuenta sobre él. Sin dato,
// una frase corta que lo dice. No hay línea de "Invertido" en la evolución: el
// panel no sabe cuánto aportaste cada mes.
//
// No importa panel.js (sería circular): todo llega por ctx.
import { base, mercadoDe } from './activos.js?v=7';
import { eventos, TIPOS, TIPO_RESUMEN } from './panel-eventos.js?v=1';
import { evolucionComparada, convertir } from './mi-cartera.js?v=45';
import { nombreBench, benchsDisponibles } from './evolucion.js?v=3';
import { resumenVentas, cantidadAjuste } from './ventas.js?v=6';

/* ───────────────────────── estilos ───────────────────────── */
const CSS_ID = 'v3-css-resumen';
const CSS = `
.rs{color:var(--v3-ink);font-family:'IBM Plex Sans',system-ui,sans-serif;
  --rs-c0:var(--v3-serie);--rs-c1:var(--v3-gold);--rs-c2:var(--v3-goldL);--rs-c3:var(--v3-up);--rs-c4:var(--v3-azul);--rs-c5:var(--v3-mut)}
[data-theme="dark"] .rs{--rs-c1:var(--v3-azul);--rs-c2:var(--v3-up);--rs-c3:var(--v3-mut);--rs-c4:var(--v3-goldS);--rs-c5:var(--v3-dn)}
.rs a{text-decoration:none}
.rs .rs-lnk{color:var(--v3-gold)}
.rs .rs-lnk:hover{color:var(--v3-gold2)}
.rs-min0{min-width:0}
.rs-num{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:.95em}
.rs-up{color:var(--v3-up)}.rs-dn{color:var(--v3-dn)}.rs-mu{color:var(--v3-mut)}
.rs-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:22px 24px;margin-bottom:18px;box-sizing:border-box}
.rs-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:30px;align-items:start}
.rs-k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut)}
.rs-k.sm{font-size:9px;margin-bottom:10px}
.rs-total{font:600 38px 'IBM Plex Mono',monospace;color:var(--v3-ink);line-height:1.05;margin-top:6px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;letter-spacing:-.02em}
.rs-pl{display:flex;align-items:baseline;gap:10px;margin-top:8px;flex-wrap:wrap}
.rs-pl .v{font:600 18px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.rs-pl .s{font-size:12px;color:var(--v3-mut)}
.rs-pl .s .rs-num{color:var(--v3-sub)}
/* el día: abajo del resultado total y más chico que él (38 · 18 · 15) */
.rs-dia{display:flex;align-items:baseline;gap:6px 10px;margin-top:11px;flex-wrap:wrap}
.rs-dia .k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut)}
.rs-dia .v{font:600 15px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.rs-dia .s{font-size:12px;color:var(--v3-mut);line-height:1.5}
.rs-dia .rs-pill{font-size:11.5px;padding:2px 7px}
.rs-pill{font:600 12.5px 'IBM Plex Mono',monospace;padding:3px 8px;border-radius:5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.rs-pill.up{color:var(--v3-up);background:var(--v3-upBg)}
.rs-pill.dn{color:var(--v3-dn);background:var(--v3-dnBg)}
.rs .rs-rz{display:inline-block;margin-top:9px;font-size:12px;color:var(--v3-sub);line-height:1.5}
.rs .rs-rz:hover{color:var(--v3-ink)}
.rs-rz b{font:600 12.5px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.rs-info{display:flex;gap:16px;margin-top:16px;font-size:12px;color:var(--v3-sub);flex-wrap:wrap}
.rs-info b{color:var(--v3-ink);font:600 12px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.rs-info b .de{font-family:'IBM Plex Sans',sans-serif}
.rs-dona{display:flex;align-items:center;gap:16px}
.rs-dona-c{position:relative;width:96px;height:96px;flex:none}
.rs-dona-c svg{width:96px;height:96px;display:block}
.rs-dona-m{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.rs-dona-m b{font:600 15px 'IBM Plex Mono',monospace;color:var(--v3-ink);line-height:1;font-variant-numeric:tabular-nums}
.rs-dona-m span{font:600 7.5px 'IBM Plex Sans',sans-serif;color:var(--v3-mut);letter-spacing:.08em;margin-top:3px;text-align:center;max-width:62px;line-height:1.25}
.rs-leg{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}
.rs-leg div{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--v3-sub)}
.rs-leg i{width:8px;height:8px;border-radius:2px;display:block;flex:none}
.rs-leg span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-leg b{color:var(--v3-ink);font:600 12px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.rs-evo{margin-top:20px;padding-top:18px;border-top:1px solid var(--v3-track)}
.rs-evo-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px 12px;flex-wrap:wrap}
.rs-segs{display:flex;align-items:center;gap:4px 14px;flex-wrap:wrap}
.rs-seg{display:inline-flex;gap:2px;align-items:center;flex-wrap:wrap}
.rs-seg button{font:500 10px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;padding:6px 10px;cursor:pointer;color:var(--v3-mut);background:none;border:none;border-bottom:2px solid transparent;white-space:nowrap;transition:color .15s;border-radius:0}
.rs-seg button:hover{color:var(--v3-ink)}
.rs-seg button.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}
.rs-seg.chico button{font-size:9.5px;padding:4px 7px;letter-spacing:.04em}
.rs-evo-leg{display:flex;gap:6px 18px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--v3-sub);align-items:baseline}
.rs-evo-leg > span{white-space:nowrap}
.rs-evo-leg i{display:inline-block;width:14px;height:0;vertical-align:middle;margin-right:6px}
.rs-evo-leg b{font:600 12px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.rs-evo-leg .dif{margin-left:auto;font-weight:600;white-space:normal}
.rs-evo-g{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;margin-top:12px}
.rs-evo-y{display:flex;flex-direction:column;justify-content:space-between;font:500 10px 'IBM Plex Mono',monospace;color:var(--v3-mut);text-align:right;padding:2px 0;font-variant-numeric:tabular-nums}
.rs-evo-p{position:relative;min-width:0}
.rs-evo-p svg{width:100%;height:clamp(160px,16vw,260px);display:block;overflow:visible}
.rs-evo-dot{position:absolute;width:5px;height:5px;box-sizing:content-box;border-radius:50%;background:var(--v3-card);border:2px solid var(--v3-serie);transform:translate(-50%,-50%);pointer-events:none}
.rs-evo-x{grid-column:2;display:flex;justify-content:space-between;gap:6px;font:500 10px 'IBM Plex Mono',monospace;color:var(--v3-mut);white-space:nowrap}
.rs-evo-x.abs{display:block;position:relative;height:14px}
.rs-evo-x.abs span{position:absolute;top:0}
.rs-evo-msg{font-size:12.5px;color:var(--v3-sub);margin:14px 0 0;line-height:1.6}
.rs-evo-notas{margin-top:10px;font-size:11px;color:var(--v3-mut);line-height:1.6}
.rs-evo-notas p{margin:0 0 2px}
.rs-mini{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-gold);background:none;border:1px solid var(--v3-line);border-radius:5px;padding:4px 9px;cursor:pointer;margin-left:6px}
.rs-mini:hover{border-color:var(--v3-gold)}
.rs-avisos{margin-top:16px;padding-top:14px;border-top:1px solid var(--v3-track);display:flex;flex-direction:column;gap:8px}
.rs-at{display:flex;gap:9px;align-items:flex-start;font-size:12px;color:var(--v3-sub);line-height:1.55}
.rs-at b{color:var(--v3-ink)}
.rs-tag{font:700 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:4px;white-space:nowrap;flex:none}
.rs-tag.warn{color:var(--v3-warn);background:var(--v3-warnBg)}
.rs-tag.nota{color:var(--v3-mut);background:var(--v3-neutro)}
.rs-hoy{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px;margin-bottom:26px}
.rs a.rs-h{display:block;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:10px;padding:16px 18px;color:var(--v3-ink);transition:border-color .15s;min-width:0}
.rs a.rs-h.dest{background:var(--v3-hl);border-color:var(--v3-goldL)}
.rs a.rs-h:hover{border-color:var(--v3-gold);color:var(--v3-ink)}
.rs-h-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.rs-h-k{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase}
.rs-h-cta{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-gold);white-space:nowrap}
.rs-h-t{font:600 15px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);margin-top:9px;line-height:1.3;overflow-wrap:anywhere}
.rs-h-p{font-size:12.5px;color:var(--v3-sub);line-height:1.55;margin-top:4px}
.rs-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:26px;align-items:start}
.rs-col-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.rs-col-h h3{font:700 22px 'Playfair Display',serif;color:var(--v3-ink);margin:0;line-height:1.2}
.rs-col-h a{font:600 10px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.rs-ag{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:10px;overflow:hidden}
.rs .rs-ev{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--v3-line2);color:var(--v3-ink)}
.rs .rs-ev:last-child{border-bottom:none}
.rs a.rs-ev:hover{background:var(--v3-hover);color:var(--v3-ink)}
.rs-ev-d{text-align:center}
.rs-ev-d b{display:block;font:600 16px 'IBM Plex Mono',monospace;color:var(--v3-ink);line-height:1;font-variant-numeric:tabular-nums}
.rs-ev-d span{display:block;font:600 9px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-mut);margin-top:3px}
.rs-ev-t{font-size:13.5px;color:var(--v3-ink);line-height:1.45;overflow-wrap:anywhere}
.rs-ev-s{font-size:11.5px;color:var(--v3-mut);margin-top:2px;overflow-wrap:anywhere}
.rs-ev-tipo{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:4px;white-space:nowrap}
.rs-ag-k{font:600 9px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);padding:12px 16px 4px;border-top:1px solid var(--v3-line2)}
.rs-vac{margin:0;padding:14px 16px;font-size:13px;color:var(--v3-sub);line-height:1.6}
.rs-rs{display:flex;flex-direction:column;gap:10px}
.rs a.rs-r{display:block;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:10px;padding:14px 16px;color:var(--v3-ink);transition:border-color .15s}
.rs a.rs-r:hover{border-color:var(--v3-gold);color:var(--v3-ink)}
.rs-r-k{display:flex;align-items:center;gap:8px;font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-gold2)}
.rs-r-k i{width:3px;height:3px;border-radius:50%;background:var(--v3-mut);display:block;flex:none}
.rs-r-k .f{color:var(--v3-mut);font-family:'IBM Plex Mono',monospace;letter-spacing:.02em}
.rs-r-k .tuyo{margin-left:auto;color:#0E1830;background:var(--v3-goldL);padding:2px 7px;border-radius:4px;letter-spacing:.08em;white-space:nowrap}
.rs-r-t{font:700 14.5px 'Playfair Display',serif;color:var(--v3-ink);margin-top:7px;line-height:1.35;overflow-wrap:anywhere}
.rs-vac-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:10px}
.rs-vacio-t{font:700 22px 'Playfair Display',serif;color:var(--v3-ink);margin:8px 0 0;line-height:1.2}
.rs-vacio-p{font-size:13.5px;color:var(--v3-sub);line-height:1.65;margin:8px 0 0;max-width:640px}
.rs-btn-oro{font:600 10.5px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#0E1830;background:var(--v3-goldL);padding:9px 16px;border-radius:7px;border:none;cursor:pointer;margin-top:14px;white-space:nowrap;transition:background .15s}
.rs-btn-oro:hover{background:var(--v3-gold)}
.rs-nota{font-size:12px;color:var(--v3-mut);line-height:1.65;margin:12px 0 0}
/* la primera vez: bloque navy con la barra de avance, tres pasos y "Mientras tanto".
   --v3-navy es oscuro en los dos temas, así que el texto de arriba va claro fijo. */
.rs-hero{background:var(--v3-navy);border-radius:12px;padding:26px 28px;margin-bottom:16px;box-sizing:border-box}
.rs-hero .k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--v3-goldL)}
.rs-hero h2{font:700 26px 'Playfair Display',serif;color:#F4F1EA;margin:10px 0 6px;line-height:1.2;overflow-wrap:anywhere}
.rs-hero p{font-size:13.5px;line-height:1.65;color:rgba(244,241,234,.74);margin:0;max-width:62ch}
.rs-barra{display:flex;gap:4px;margin-top:16px;max-width:360px}
.rs-barra i{flex:1;height:5px;border-radius:3px;background:rgba(244,241,234,.18);display:block}
.rs-barra i.ok{background:var(--v3-goldL)}
.rs-pasos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:12px;margin-bottom:26px}
.rs-paso{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:20px 22px;display:flex;flex-direction:column;gap:8px;min-width:0}
.rs-paso.ok{border-color:var(--v3-up)}
.rs-paso .top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.rs-paso .n{font:600 26px 'IBM Plex Mono',monospace;color:var(--v3-serie);line-height:1;font-variant-numeric:tabular-nums}
.rs-paso.ok .n{color:var(--v3-up)}
.rs-paso .est{font:700 9px 'IBM Plex Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--v3-mut);background:var(--v3-neutro);padding:3px 8px;border-radius:4px;white-space:nowrap}
.rs-paso.ok .est{color:var(--v3-up);background:var(--v3-upBg)}
.rs-paso b{font:600 16px 'IBM Plex Sans',sans-serif;color:var(--v3-ink);line-height:1.3}
.rs-paso p{font-size:12.5px;color:var(--v3-sub);line-height:1.6;margin:0;flex:1}
.rs-paso .rs-btn-oro{align-self:flex-start;margin-top:4px}
.rs-paso.ok .rs-btn-oro{color:var(--v3-gold);background:none;border:1px solid var(--v3-line)}
.rs-paso.ok .rs-btn-oro:hover{background:none;border-color:var(--v3-gold)}
.rs-btn-oro[disabled]{opacity:.5;cursor:not-allowed}
.rs-btn-oro[disabled]:hover{background:var(--v3-goldL)}
.rs-pv-pie{margin-top:14px}
.rs-mt-k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut);margin:26px 0 10px}
.rs-mt{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:12px;margin-bottom:26px}
.rs a.rs-mt-c{display:block;background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:18px 20px;color:var(--v3-ink);transition:border-color .15s;min-width:0}
.rs a.rs-mt-c:hover{border-color:var(--v3-gold);color:var(--v3-ink)}
.rs-mt-c .k{font:600 9.5px 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-mut)}
.rs-mt-c .t{font:700 18px 'Playfair Display',serif;color:var(--v3-ink);margin:8px 0 4px;line-height:1.3;overflow-wrap:anywhere}
.rs-mt-c .d{font-size:12.5px;color:var(--v3-sub);line-height:1.55;overflow-wrap:anywhere}
.rs-alertas{margin-top:30px}
.rs-sk{background:var(--v3-track);border-radius:6px;animation:rs-pulso 1.4s ease-in-out infinite}
@keyframes rs-pulso{0%,100%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.rs-sk{animation:none}}
@media (max-width:640px){
  .rs-card{padding:18px 16px}
  .rs-total{font-size:30px}
  .rs-col-h h3{font-size:20px}
  .rs-evo-leg .dif{margin-left:0;flex-basis:100%}
  .rs-hero{padding:20px 16px}
  .rs-hero h2{font-size:22px}
  .rs-paso{padding:16px 16px}
  .rs a.rs-mt-c{padding:16px}
}
@media (max-width:520px){
  .rs .rs-ev{grid-template-columns:44px minmax(0,1fr);gap:5px 12px;padding:12px 14px}
  .rs-ev-d{grid-row:span 2}
  .rs-ev-tipo{grid-column:2;justify-self:start}
}
`;
function asegurarCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID; st.textContent = CSS;
  document.head.appendChild(st);
}

/* ───────────────────────── utilidades ───────────────────────── */
// tramos de la torta por broker: la paleta de la spec, en este orden (--rs-c0…5 del CSS;
// en el tema oscuro --v3-serie, --v3-gold y --v3-goldL son casi el mismo dorado, así
// que ahí queda un solo dorado claro y el resto se reemplaza para que los tramos se distingan)
const PALETA = [0, 1, 2, 3, 4, 5].map(i => `var(--rs-c${i})`);
// por tipo, cada tipo con su color fijo (acciones en verde, como el prototipo)
const TIPO_N = { acc: ['Acciones y CEDEARs', 'ACCIONES'], rf: ['Renta fija', 'RENTA FIJA'], cripto: ['Cripto', 'CRIPTO'] };
const TIPO_COL = { acc: 'var(--v3-up)', rf: 'var(--v3-azul)', cripto: 'var(--v3-goldL)' };
const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RANGOS = [[91, '3M', 3], [182, '6M', 6], [365, '1A', 12]];
const ROT_BENCH = { SPY: 'S&P 500', MERV: 'Merval', CCL: 'Dólar', INF: 'Inflación' };
// los colores de TIPOS (panel-eventos.js) vienen en hex del prototipo: se pasan a variables
const HEX_VAR = { '#14213d': '--v3-serie', 'rgba(20,33,61,0.08)': '--v3-navyBg', '#1f7a4d': '--v3-up',
  'rgba(31,122,77,0.12)': '--v3-upBg', '#8a6a2f': '--v3-gold2', 'rgba(176,138,62,0.14)': '--v3-goldBg',
  '#b08a3e': '--v3-gold', '#f6eedc': '--v3-goldTint', '#57534a': '--v3-sub', '#f0ede5': '--v3-track' };
const cvar = (c, def) => `var(${HEX_VAR[String(c || '').toLowerCase().replace(/\s/g, '')] || def})`;

const N = s => `<span class="rs-num">${s}</span>`;
const upCls = n => n == null || !isFinite(n) ? 'rs-mu' : n >= 0 ? 'rs-up' : 'rs-dn';
// porcentaje con signo tipográfico (−) y coma decimal
const pctS = (n, d = 1) => {
  if (n == null || !isFinite(n)) return '—';
  const s = Math.abs(n).toFixed(d);
  const signo = Number(s) === 0 ? '' : n > 0 ? '+' : '−';
  return signo + s.replace('.', ',') + '%';
};
const puntos = n => Math.abs(n).toFixed(1).replace('.', ',');
const fmtP = p => (p > 0 && p < 1 ? p.toFixed(1).replace('.', ',') : String(Math.round(p))) + '%';
const cap = s => { const t = String(s || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const sumarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 864e5);
const leerLS = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
// las funciones del ctx "nunca rechazan", pero alguna (radar) puede tirar si el doc no llegó
const seguro = async (f, def) => {
  try { const v = await (typeof f === 'function' ? f() : f); return v == null ? def : v; } catch (e) { return def; }
};
// dd/mm si es de este año; dd/mm/aa si no (escapada: si la fecha no se puede leer, fmtC la devuelve tal cual)
const fechaCorta = (ctx, iso) => ctx.esc(String(iso || '').slice(0, 4) === ctx.hoyAR().slice(0, 4) ? ctx.fmtC(iso) : ctx.fmtF(iso));

/* ───────────────────────── estado del módulo ───────────────────────── */
let _seq = 0;
let _st = { ctx: null, el: null, vivo: () => false };
let _evoSeq = 0;

const ESQ_HOY = '<div class="rs-sk" style="height:104px;border-radius:10px"></div>'.repeat(3);
const ESQ_COL = '<div class="rs-sk" style="height:220px;border-radius:10px"></div>';
const ESQUELETO = `<div class="rs" aria-busy="true"><div class="rs-card"><div class="rs-top">
    <div><div class="rs-sk" style="width:130px;height:10px"></div><div class="rs-sk" style="width:72%;height:40px;margin-top:10px"></div>
      <div class="rs-sk" style="width:58%;height:16px;margin-top:12px"></div><div class="rs-sk" style="width:64%;height:12px;margin-top:18px"></div></div>
    <div class="rs-sk" style="height:96px"></div><div class="rs-sk" style="height:96px"></div></div>
    <div class="rs-sk" style="height:190px;margin-top:22px"></div></div>
  <div class="rs-hoy">${ESQ_HOY}</div></div>`;

const tarjetaError = (tit, txt) => `<div class="rs"><div class="rs-card" style="max-width:560px">
    <h2 class="rs-vacio-t" style="margin-top:0">${tit}</h2><p class="rs-vacio-p">${txt}</p>
    <button type="button" class="rs-btn-oro" data-rs-retry>Reintentar</button></div></div>`;

/* ───────────────────────── entrada ───────────────────────── */
export async function renderResumen(el, ctx) {
  if (!el || !ctx) return;
  const seq = ++_seq, email = ctx.S.email;
  const vivo = () => seq === _seq && ctx.S.email === email;
  _st = { ctx, el, vivo };
  try {
    asegurarCss();
    if (!el.__rsClic) {
      el.addEventListener('click', clicResumen);
      el.__rsClic = true;
    }
    // si ya hay un Resumen dibujado (cambio de moneda, compra registrada) queda
    // hasta que llegan los datos: casi todo sale de la caché y se evita el parpadeo.
    // Nunca el de OTRA cuenta: si cambió el mail, esqueleto.
    if (!el.querySelector('.rs') || el.__rsEmail !== email) el.innerHTML = ESQUELETO;
    el.__rsEmail = email;
    const [cc, disc, bset, vs] = await Promise.all([
      seguro(ctx.carteraCalc, null), seguro(ctx.disciplina, { config: null, log: [] }),
      seguro(ctx.bonosSet, new Set()), seguro(ctx.ventas, [])]);
    if (!vivo()) return;
    if (!cc || cc.fallo || !cc.r) {
      el.innerHTML = tarjetaError('No pudimos leer tu cartera', 'Puede ser la conexión. Tus posiciones siguen guardadas: probá de nuevo en un momento.');
      return;
    }
    const tiene = (cc.pos || []).length > 0;
    // la primera vez (todavía sin posiciones) necesita tres cosas más: el radar
    // de hoy, las carteras del teaser y cuáles sigue. Se piden SOLO en ese caso,
    // y con null por defecto para poder distinguir "no respondió" de "está vacío".
    const prim = tiene ? null : await datosPrimeraVez(ctx);
    // lo que se movió la cartera hoy: ctx.variacionDia() (panel.js) suma el dHoy
    // que calcular() ya dejó en cada fila de cc.r, así que es la misma cifra que
    // pinta Mi cartera. Si el panel es viejo y todavía no la trae, la tarjeta
    // sale sin la línea del día.
    const dia = tiene && typeof ctx.variacionDia === 'function'
      ? await seguro(() => ctx.variacionDia(cc), null) : null;
    if (!vivo()) return;
    const hoy = ctx.hoyAR();
    // una sola lectura de la agenda para las tarjetas de hoy y para la columna
    const evP = eventos(ctx, { desde: hoy, hasta: sumarDias(hoy, 30) }).catch(() => []);
    el.innerHTML = `<div class="rs">
      ${tiene ? tarjetaPrincipal(cc, bset, vs, ctx, dia) : primeraVez(cc, disc, vs, ctx, prim)}
      ${tiene ? `<div class="rs-hoy" data-rs="hoy">${ESQ_HOY}</div>` : ''}
      <div class="rs-cols">
        <section class="rs-min0"><div class="rs-col-h"><h3>${tiene ? 'Lo que viene en tus activos' : 'Lo que viene en el mercado'}</h3>
          <a class="rs-lnk" href="#panel/agenda" data-go="agenda">Agenda completa →</a></div>
          <div data-rs="agenda">${ESQ_COL}</div></section>
        <section class="rs-min0"><div class="rs-col-h"><h3>Research reciente</h3>
          <a class="rs-lnk" href="/informes">Informes →</a></div>
          <div data-rs="research">${ESQ_COL}</div></section>
      </div>
      ${tiene ? '<section class="rs-alertas"><div class="rs-col-h"><h3>Alertas por mail</h3></div><div id="vp-alertas"></div></section>' : ''}
    </div>`;
    const q = s => el.querySelector(`[data-rs="${s}"]`);
    if (tiene && q('evo')) pintarEvo(q('evo'), ctx, vivo, 0);
    // sin posiciones no hay tira de "hoy": esas dos tarjetas (radar y Carteras
    // Valtia) son justo lo que ahora muestra "Mientras tanto", y repetirlas sobra
    if (tiene) pintarHoy(q('hoy'), ctx, vivo, cc, disc, bset, evP);
    pintarAgenda(q('agenda'), ctx, vivo, tiene, evP);
    pintarResearch(q('research'), ctx, vivo, cc, bset);
    if (tiene && typeof ctx.alertasMail === 'function') Promise.resolve().then(() => ctx.alertasMail()).catch(() => {});
  } catch (e) {
    if (vivo()) el.innerHTML = tarjetaError('No pudimos armar tu resumen', 'Algo falló al leer los datos. Tus posiciones siguen guardadas: probá de nuevo en un momento.');
  }
}

/* clics propios de la pestaña (los data-go, data-compra y data-seguir los maneja panel.js) */
function clicResumen(e) {
  const t = e.target.closest('[data-rs-ver],[data-rs-agregar],[data-rs-retry],[data-rs-bench],[data-rs-rango],[data-rs-evo-retry]');
  const { ctx, el } = _st;
  if (!t || !ctx || !el || !el.contains(t)) return;
  e.preventDefault();
  if (t.hasAttribute('data-rs-ver')) {
    const tk = t.getAttribute('data-rs-ver');
    if (typeof ctx.verPosicion === 'function') ctx.verPosicion(tk); else ctx.portalTab('micartera');
    return;
  }
  if (t.hasAttribute('data-rs-agregar')) {
    if (typeof ctx.agregarPosicion === 'function') ctx.agregarPosicion(); else ctx.portalTab('micartera');
    return;
  }
  if (t.hasAttribute('data-rs-retry')) { ctx.invalidar('cartera'); ctx.refrescar('inicio'); return; }
  // índice, período o reintento de la evolución: se redibuja SOLO esa sección
  if (t.hasAttribute('data-rs-bench')) guardarLS('valtia-v3-bench', t.getAttribute('data-rs-bench'));
  if (t.hasAttribute('data-rs-rango')) guardarLS('valtia-v3-rango', t.getAttribute('data-rs-rango'));
  const box = el.querySelector('[data-rs="evo"]');
  if (box) pintarEvo(box, ctx, _st.vivo, 0);
}

/* ───────────────────────── tarjeta principal ───────────────────────── */
function dona(titulo, tramos, big, bigL, ctx) {
  const C = 2 * Math.PI * 38;
  let acc = 0;
  const arcos = tramos.map(t => {
    const largo = t.p / 100 * C;
    const s = `<circle cx="48" cy="48" r="38" fill="none" stroke-width="14" style="stroke:${t.c}" stroke-dasharray="${largo.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 48 48)"></circle>`;
    acc += largo;
    return s;
  }).join('');
  const aria = `${titulo}: ${tramos.map(t => `${t.n} ${fmtP(t.p)}`).join(', ')}`;
  return `<div class="rs-min0"><div class="rs-k sm">${titulo}</div>
    <div class="rs-dona"><div class="rs-dona-c">
      <svg viewBox="0 0 96 96" role="img" aria-label="${ctx.esc(aria)}"><circle cx="48" cy="48" r="38" fill="none" stroke-width="14" style="stroke:var(--v3-track)"></circle>${arcos}</svg>
      <div class="rs-dona-m"><b>${big}</b><span>${ctx.esc(bigL)}</span></div></div>
      <div class="rs-leg">${tramos.map(t => `<div><i style="background:${t.c}"></i><span title="${ctx.esc(t.n)}">${ctx.esc(t.n)}</span><b>${fmtP(t.p)}</b></div>`).join('')}</div>
    </div></div>`;
}

/* lo realizado (ventas), como lo mostraba el Resumen anterior: del año con
   posiciones abiertas; sin posiciones, el del año o, si no hubo, el total */
function lineaRealizado(cc, vs, ctx, sinPos) {
  if (!vs || !vs.length) return '';
  const m = ctx.curMoneda(cc.cur), anio = ctx.hoyAR().slice(0, 4);
  let rz;
  try { rz = resumenVentas(vs, (v, mon) => mon === m ? v : convertir(v, mon, cc.cur, cc.fx), anio); } catch (e) { return ''; }
  const o = sinPos ? (rz.delAnio.n || rz.delAnio.sinCosto ? rz.delAnio : rz) : rz.delAnio;
  if (!o.n && !o.sinCosto) return '';
  const porMon = Object.entries(o.porMoneda || {}).map(([mm, x]) => ctx.moneyS(x, mm)).join(' · ');
  const cifra = o.n && o.totalCompleto ? `<b class="${upCls(o.total)}">${ctx.moneyS(o.total, m)}</b>`
    : o.n && porMon ? `<b>${porMon}</b> (por moneda, sin cotización del dólar)` : '<b class="rs-mu">—</b>';
  const extra = [o.n ? `${o.n} ${o.n === 1 ? 'venta' : 'ventas'}` : '', o.sinCosto ? `sin contar ${o.sinCosto} sin precio de compra` : ''].filter(Boolean).join(' · ');
  return `<div><a class="rs-rz" href="#panel/micartera" data-go="micartera">Resultado realizado${o === rz.delAnio ? ' en ' + anio : ''}: ${cifra}${extra ? ' · ' + extra : ''}${sinPos ? '. No te quedan posiciones abiertas' : ''} →</a></div>`;
}

/* la línea del día: cuánto se movió la cartera HOY, en plata y en porcentaje.
   El número es el de ctx.variacionDia() (panel.js), que suma el dHoy que dejó
   calcular() en cada fila: exactamente la misma cifra que la columna "Hoy" de
   Mi cartera. Acá no se hace ninguna cuenta, solo se escribe.
   Lo que no trae variación NO se cuenta como cero: queda afuera y se aclara.
   Las posiciones que todavía esperan precio o cotización del dólar no entran en
   esta línea: ya tienen su propio aviso de "Atención" más abajo. */
function lineaDia(dia, m, ctx) {
  if (!dia || !dia.total) return '';
  if (!dia.con) {
    return `<div class="rs-dia"><span class="k">Hoy</span><span class="v rs-mu">—</span>
      <span class="s">${dia.total === 1 ? 'Tu posición todavía no trae' : 'Ninguna de tus posiciones trae'} la variación del día.</span></div>`;
  }
  // los tickers vienen sin repetir: el plural se toma de cuántos se nombran, no
  // de cuántos lotes quedaron afuera (dos lotes de AL30 son un solo nombre)
  const tks = dia.sinTickers || [];
  const varios = tks.length > 1;
  const lista = tks.slice(0, 3).map(t => ctx.esc(t)).join(', ') + (tks.length > 3 ? ' y otras' : '');
  const nota = !dia.sin ? ''
    : tks.length ? `No incluye ${lista}: todavía no ${varios ? 'traen' : 'trae'} la variación del día.`
    : `${dia.sin} ${dia.sin === 1 ? 'posición queda afuera: todavía no trae' : 'posiciones quedan afuera: todavía no traen'} la variación del día.`;
  return `<div class="rs-dia"><span class="k">Hoy</span>
    <span class="v ${upCls(dia.monto)}">${ctx.moneyS(dia.monto, m)}</span>
    ${dia.pct != null && isFinite(dia.pct) ? `<span class="rs-pill ${dia.pct >= 0 ? 'up' : 'dn'}">${pctS(dia.pct)}</span>` : ''}
    ${nota ? `<span class="s">${nota}</span>` : ''}</div>`;
}

function tarjetaPrincipal(cc, bset, vs, ctx, dia) {
  const esc = ctx.esc, r = cc.r, m = ctx.curMoneda(cc.cur);
  const filas = r.filas || [], n = filas.length;
  const conValor = filas.filter(f => f.dValor != null && isFinite(f.dValor));
  const conPx = filas.filter(f => f.actual != null).length;
  const nb = new Set(filas.map(f => String(f.broker || '').trim()).filter(Boolean)).size;
  const tot = conValor.reduce((s, f) => s + f.dValor, 0);

  // tortas: solo cuentan las filas con valor en la moneda del encabezado
  let donas = '';
  if (tot > 0) {
    const porB = new Map();
    conValor.forEach(f => { const k = String(f.broker || '').trim() || 'Sin broker'; porB.set(k, (porB.get(k) || 0) + f.dValor); });
    let tb = [...porB.entries()].map(([k, v]) => ({ n: k, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v || a.n.localeCompare(b.n));
    if (tb.length > PALETA.length) {
      const resto = tb.slice(PALETA.length - 1).reduce((s, x) => s + x.v, 0);
      tb = [...tb.slice(0, PALETA.length - 1), { n: 'Otros', v: resto }];
    }
    tb = tb.map((x, i) => ({ ...x, p: x.v / tot * 100, c: PALETA[i] }));
    const porT = { acc: 0, rf: 0, cripto: 0 };
    conValor.forEach(f => {
      let mk = 'ext';
      try { mk = mercadoDe(f.ticker, bset); } catch (e) {}
      porT[mk === 'rf' ? 'rf' : mk === 'cripto' ? 'cripto' : 'acc'] += f.dValor;
    });
    const tt = Object.entries(porT).filter(([, v]) => v > 0)
      .map(([k, v]) => ({ n: TIPO_N[k][0], corto: TIPO_N[k][1], v, p: v / tot * 100, c: TIPO_COL[k] }))
      .sort((a, b) => b.v - a.v);
    // el centro cuenta brokers de verdad: "Sin broker" es un tramo, no un broker
    const nbT = [...porB.keys()].filter(k => k !== 'Sin broker').length;
    if (tb.length) donas += dona('Por broker', tb, nbT ? String(nbT) : '—', nbT === 1 ? 'BROKER' : 'BROKERS', ctx);
    if (tt.length) donas += dona('Por tipo', tt, fmtP(tt[0].p), tt[0].corto, ctx);
  }

  // avisos: sin precio del sync, sin dólar para convertir, y qué significa ver en dólares
  const avisos = [];
  const sinPx = filas.filter(f => f.actual == null);
  if (sinPx.length === 1) {
    const f = sinPx[0];
    avisos.push(['warn', 'Atención', `<b>${esc(base(f.ticker))}</b> espera el precio del sync y queda fuera del total. <a class="rs-lnk" href="#panel/micartera" data-rs-ver="${esc(f.ticker)}">Ver en Mi cartera →</a>`]);
  } else if (sinPx.length > 1) {
    const tks = [...new Set(sinPx.map(f => base(f.ticker)))];
    avisos.push(['warn', 'Atención', `${sinPx.length} posiciones esperan el precio del sync y quedan fuera del total: ${tks.slice(0, 5).map(t => `<b>${esc(t)}</b>`).join(', ')}${tks.length > 5 ? ' y otras' : ''}. <a class="rs-lnk" href="#panel/micartera" data-go="micartera">Ver en Mi cartera →</a>`]);
  }
  const sinFx = filas.filter(f => f.actual != null && f.dValor == null).length;
  if (sinFx) avisos.push(['warn', 'Atención', `Sin cotización del dólar: ${sinFx} ${sinFx === 1 ? 'posición no suma' : 'posiciones no suman'} al total en ${m === 'ARS' ? 'pesos' : 'dólares'}.`]);
  if (cc.cur !== 'ARS') avisos.push(['nota', 'Nota', 'El costo y el valor se convierten con la cotización de hoy, así que el rendimiento es el mismo que en pesos: no es tu retorno medido en dólares.']);

  const valor = tot > 0
    ? `<div class="rs-total">${ctx.money(r.total, m)}</div>
       <div class="rs-pl"><span class="v ${upCls(r.plTot)}">${ctx.moneyS(r.plTot, m)}</span>
         ${r.plTotPct != null && isFinite(r.plTotPct) ? `<span class="rs-pill ${r.plTotPct >= 0 ? 'up' : 'dn'}">${pctS(r.plTotPct)}</span>` : ''}
         <span class="s">sobre ${N(ctx.money(r.costoTot, m))} invertidos</span></div>`
    : `<div class="rs-total rs-mu">—</div><div class="rs-pl"><span class="s">${sinFx
        ? 'Sin cotización del dólar no podemos convertir tus posiciones: el total aparece cuando llegue.'
        : !conPx ? 'Ninguna posición tiene precio todavía: el total se arma cuando llegue el del sync.'
        : 'Todavía no hay un total para mostrar.'}</span></div>`;

  return `<div class="rs-card">
    <div class="rs-top">
      <div class="rs-min0"><div class="rs-k">Valor de tu cartera</div>
        ${valor}
        ${tot > 0 ? lineaDia(dia, m, ctx) : ''}
        ${lineaRealizado(cc, vs, ctx, false)}
        <div class="rs-info"><span><b>${n}</b> ${n === 1 ? 'posición' : 'posiciones'}</span>${nb ? `<span><b>${nb}</b> ${nb === 1 ? 'broker' : 'brokers'}</span>` : ''}<span><b>${conPx}<span class="de"> de </span>${n}</b> con precio</span></div>
      </div>
      ${donas}
    </div>
    <div class="rs-evo" data-rs="evo"></div>
    ${avisos.length ? `<div class="rs-avisos">${avisos.map(([c, t, x]) => `<div class="rs-at"><span class="rs-tag ${c}">${t}</span><span>${x}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

/* ───────────────────────── la primera vez (sin posiciones) ─────────────────────────
   Lo que pide el SPEC (sección 8 · "Primera vez"): tres pasos con barra de avance y
   un bloque "Mientras tanto". El estado de cada paso NO se guarda en ningún lado: se
   deduce de datos reales (las carteras que sigue, la regla de inversión mensual), así
   que si los cambia desde otra pestaña el avance queda bien igual.
   "Mientras tanto" sale del teaser de carteras y del radar de hoy: si alguno de los
   dos no contesta, esa tarjeta no se dibuja. Nada se inventa ni se rellena. */
async function datosPrimeraVez(ctx) {
  // null como valor por defecto a propósito: distingue "no respondió" de "está vacío"
  const [act, ts, seg] = await Promise.all([
    seguro(ctx.radar, null), seguro(ctx.teaser, null), seguro(ctx.seguidas, {})]);
  return { act, ts, seg: seg || {} };
}

/* la cartera abierta: la del teaser que puede mirar cualquiera (visibilidad pública).
   Si hubiera más de una, la de más historia; entre iguales, por nombre. */
function tarjetaCarteraAbierta(ctx, ts) {
  if (!Array.isArray(ts)) return '';
  const abiertas = ts.filter(t => t && t.nombre && t.visibilidad === 'publico');
  if (!abiertas.length) return '';
  const t = abiertas.slice().sort((a, b) =>
    String(a.fechaInicio || '9999').localeCompare(String(b.fechaInicio || '9999'))
    || String(a.nombre).localeCompare(String(b.nombre)))[0];
  // '' no es cero: Number('') da 0 y eso sería inventarle un retorno de 0,00%
  const r = t.retorno == null || t.retorno === '' ? NaN : Number(t.retorno);
  const ret = Number.isFinite(r) ? r : null;
  const desde = t.fechaInicio ? `Desde el ${fechaCorta(ctx, t.fechaInicio)}` : 'Desde su lanzamiento';
  const d = ret != null
    ? `${desde} hizo <b class="${upCls(ret)}">${N(pctS(ret, 2))}</b>. Mirá cómo está armada.`
    : 'Mirá cómo está armada y qué tiene adentro. Todavía no publicamos su retorno.';
  return `<a class="rs-mt-c" href="#panel/carteras" data-go="carteras">
    <div class="k">Cartera abierta</div><div class="t">${ctx.esc(t.nombre)}</div><div class="d">${d}</div></a>`;
}

/* la rotación reciente, que antes salía en la tira de "hoy" (tarjeta b de pintarHoy).
   Sin posiciones esa tira ya no se dibuja, así que el aviso vive acá: si el usuario
   sigue alguna cartera, solo de esas; si no, la más reciente de las últimas dos
   semanas. Sin rotación reciente no se dibuja y queda la cartera abierta. */
function tarjetaRotacion(ctx, ts, seg, hoy) {
  if (!Array.isArray(ts)) return '';
  const corte = sumarDias(hoy, -14), hayseg = Object.keys(seg || {}).length > 0;
  const rot = ts.filter(t => t && t.nombre && t.ultimaRotacion
      && String(t.ultimaRotacion.fecha || '').slice(0, 10) >= corte
      && (!hayseg || seg[t.id]))
    .sort((a, b) => String(b.ultimaRotacion.fecha).localeCompare(String(a.ultimaRotacion.fecha)))[0];
  if (!rot) return '';
  const u = rot.ultimaRotacion, abre = rot.visibilidad === 'publico' || !!ctx.S.pro;
  const mov = [u.accion, u.ticker].filter(Boolean).map(x => ctx.esc(x)).join(' ');
  const tit = abre && u.ticker
    ? `${ctx.esc(rot.nombre)} rotó: ${mov}`
    : `${ctx.esc(rot.nombre)} rotó el ${fechaCorta(ctx, u.fecha)}`;
  // con la cartera cerrada y sin PRO no se puede ver qué cambió: no se promete
  const d = (seg && seg[rot.id] ? 'La seguís. ' : '')
    + (abre ? 'Mirá qué cambió y cómo queda armada.' : 'La composición y las rotaciones son de PRO.');
  return `<a class="rs-mt-c" href="#panel/carteras" data-go="carteras">
    <div class="k">Carteras Valtia</div><div class="t">${tit}</div><div class="d">${d}</div></a>`;
}

/* el radar de hoy: cuántos están en zona de compra y los primeros dos o tres.
   La lista es la MISMA que arma Qué comprar (ctx.ordenComprar, que además de
   ordenar deja afuera lo que no tiene lectura), así que el número que se
   promete acá es el que se ve al entrar. Si esa lista queda vacía, Qué comprar
   tampoco tiene nada para mostrar: la tarjeta no se dibuja. */
function tarjetaRadarHoy(ctx, act) {
  if (!Array.isArray(act) || !act.length) return '';
  let orden = [];
  try { if (typeof ctx.ordenComprar === 'function') orden = ctx.ordenComprar(act) || []; } catch (e) { orden = []; }
  if (!orden.length) return '';
  const zona = orden.filter(a => a && a.entrada && a.sym);
  const tit = zona.length
    ? `${N(zona.length)} ${zona.length === 1 ? 'activo' : 'activos'} en zona de compra`
    : 'Hoy ninguno está en zona de compra';
  let d;
  if (zona.length) {
    const tks = zona.slice(0, 3).map(a => `<b>${ctx.esc(a.sym)}</b>`);
    const lista = tks.length > 1 ? tks.slice(0, -1).join(', ') + ' y ' + tks[tks.length - 1] : tks[0];
    d = `${lista}${zona.length > 3 ? ', entre otros' : ''}. Mirá la lectura Valtia de cada uno.`;
  } else {
    d = `El radar sigue ${N(orden.length)} ${orden.length === 1 ? 'activo' : 'activos'} con su lectura Valtia: entrá a ${orden.length === 1 ? 'verlo' : 'verlos'} igual.`;
  }
  return `<a class="rs-mt-c" href="#panel/comprar" data-go="comprar">
    <div class="k">Radar de hoy</div><div class="t">${tit}</div><div class="d">${d}</div></a>`;
}

function primeraVez(cc, disc, vs, ctx, prim) {
  const verif = !!ctx.S.verificado;
  const pv = prim || { act: null, ts: null, seg: {} };
  const nSeg = Object.keys(pv.seg || {}).length;
  const cfg = (disc && disc.config) || null;
  const aporte = cfg && Number(cfg.aporte) > 0 ? Number(cfg.aporte) : null;
  const nCompras = cfg && Number(cfg.compras) > 0 ? Math.round(Number(cfg.compras)) : null;
  // el aviso que ya estaba: sin mail verificado, Mi cartera y la regla no se pueden tocar
  const gate = ' disabled title="Verificá tu email para activarlo"';

  const pasos = [
    // 1 · acá siempre está pendiente: con una posición cargada esta pantalla no existe
    { ok: false, t: 'Cargá tu primera posición',
      p: 'Lo que ya tenés en IOL, PPI, Balanz o Binance. Con la cantidad y el precio de compra alcanza.',
      cta: '+ Agregar posición', attr: 'data-rs-agregar', gate: !verif },
    // 2 · el botón NO se apaga sin verificar (las carteras abiertas se pueden
    //     mirar igual), pero ahí el texto no promete seguirlas: el botón
    //     "Seguir" de Carteras solo aparece con el mail verificado
    { ok: nSeg > 0, t: 'Elegí una cartera de referencia',
      p: nSeg > 0
        ? `Ya seguís ${N(nSeg)} ${nSeg === 1 ? 'cartera' : 'carteras'}: acá te avisamos cuando ${nSeg === 1 ? 'rota' : 'rotan'}.`
        : verif
          ? 'Seguí una de las Carteras Valtia para compararte y enterarte cuando rota.'
          : 'Mirá las Carteras Valtia y quedate con la que va con vos. Para seguirla necesitás verificar tu email.',
      cta: nSeg > 0 || !verif ? 'Ver carteras' : 'Elegir cartera', attr: 'data-go="carteras"', gate: false },
    { ok: !!cfg, t: 'Armá tu inversión mensual',
      p: cfg
        ? (aporte && nCompras
          ? `Tu regla: ${N(ctx.money(aporte, 'USD'))} por mes en ${N(nCompras)} ${nCompras === 1 ? 'compra' : 'compras'}.`
          : 'Ya tenés tu regla armada.')
        : 'Cuánto aportás por mes y en cuántas compras. Te marcamos el ritmo.',
      cta: cfg ? 'Ver mi regla' : 'Armar mi regla', attr: 'data-go="disciplina"', gate: !verif },
  ];
  const hechos = pasos.filter(s => s.ok).length;

  // primero la rotación reciente (es novedad); si no hay, la cartera abierta
  const abierta = tarjetaRotacion(ctx, pv.ts, pv.seg, ctx.hoyAR()) || tarjetaCarteraAbierta(ctx, pv.ts);
  const radar = tarjetaRadarHoy(ctx, pv.act);
  const pie = lineaRealizado(cc, vs, ctx, true)
    + (!verif ? '<p class="rs-nota">Verificá tu email para activar Mi cartera y tu inversión mensual (te mandamos el link al registrarte).</p>' : '');

  return `<div class="rs-hero">
      <div class="k">Primeros pasos · ${N(hechos)} de ${N(3)}</div>
      <h2>Tu panel está vacío. Arranquemos por acá.</h2>
      <p>Con tres cosas el panel empieza a trabajar solo: sabe qué tenés, qué cartera te sirve de referencia y cuánto querés poner por mes.</p>
      <div class="rs-barra" role="img" aria-label="Avance: ${hechos} de 3 pasos hechos">${pasos.map(s => `<i class="${s.ok ? 'ok' : ''}"></i>`).join('')}</div>
    </div>
    <div class="rs-pasos">${pasos.map((s, i) => `<div class="rs-paso${s.ok ? ' ok' : ''}">
      <div class="top"><span class="n">${i + 1}</span><span class="est">${s.ok ? 'Hecho' : 'Pendiente'}</span></div>
      <b>${s.t}</b><p>${s.p}</p>
      <button type="button" class="rs-btn-oro" ${s.attr}${s.gate ? gate : ''}>${s.cta}</button>
    </div>`).join('')}</div>
    ${pie ? `<div class="rs-pv-pie">${pie}</div>` : ''}
    ${abierta || radar ? `<div class="rs-mt-k">Mientras tanto</div><div class="rs-mt">${abierta}${radar}</div>` : ''}`;
}

/* ───────────────────────── evolución comparada ───────────────────────── */
const FRASE_EVO = {
  'sin-historia': 'Todavía no hay historia de precios suficiente para dibujar tu evolución en este período.',
  'poca-cobertura': 'La historia de precios cubre muy poco del valor de tu cartera: con eso la curva no sería la tuya.',
  'sin-mep': 'Todavía no tenemos la serie histórica del dólar MEP. Mirala en pesos o en USD CCL.',
  'error': 'No pudimos leer la historia de precios.',
  'cargando': 'La historia de precios está tardando en llegar.',
  'sin-sesion': 'La historia de precios está tardando en llegar.',
};

function prefEvo(moneda) {
  const disp = benchsDisponibles(moneda);
  let bench = leerLS('valtia-v3-bench', 'SPY');
  if (!disp.includes(bench)) bench = disp[0] || 'SPY';   // lo guardado se respeta al volver a esa moneda
  let dias = Number(leerLS('valtia-v3-rango', '182'));
  if (!RANGOS.some(x => x[0] === dias)) dias = 182;
  return { disp, bench, dias };
}

function cabEvo(titulo, disp, bench, dias) {
  return `<div class="rs-evo-h"><div class="rs-k">${titulo}</div>
    <div class="rs-segs">
      <div class="rs-seg" role="group" aria-label="Comparar contra">${disp.map(k =>
        `<button type="button" data-rs-bench="${k}" class="${k === bench ? 'on' : ''}" aria-pressed="${k === bench}">${ROT_BENCH[k] || k}</button>`).join('')}</div>
      <div class="rs-seg chico" role="group" aria-label="Período">${RANGOS.map(([d, l]) =>
        `<button type="button" data-rs-rango="${d}" class="${d === dias ? 'on' : ''}" aria-pressed="${d === dias}">${l}</button>`).join('')}</div>
    </div></div>`;
}

const notasEvo = (notas, ctx) => (notas || []).length
  ? `<div class="rs-evo-notas">${notas.map(t => `<p>${ctx.esc(t)}</p>`).join('')}</div>` : '';

async function pintarEvo(box, ctx, vivo, intento) {
  const yo = ++_evoSeq;
  const ok = () => vivo() && yo === _evoSeq && box.isConnected;
  const moneda = ctx.curVista();
  const { disp, bench, dias } = prefEvo(moneda);
  const meses = (RANGOS.find(x => x[0] === dias) || RANGOS[1])[2];
  let titulo = `Evolución · últimos ${meses} meses · comparada`;
  box.style.display = '';
  if (!intento) box.innerHTML = cabEvo(titulo, disp, bench, dias) + '<p class="rs-evo-msg">Cargando la historia de precios…</p>';
  let r = null;
  try { r = await evolucionComparada({ dias, moneda, bench }); } catch (e) { r = null; }
  if (!ok()) return;
  if (!r) r = { ok: false, motivo: 'error', notas: [] };
  // un dato raro no puede dejar la sección en "Cargando…" para siempre
  try { dibujarEvo(box, ctx, vivo, intento, ok, r, { moneda, disp, bench, dias, titulo }); }
  catch (e) {
    box.innerHTML = cabEvo(titulo, disp, bench, dias)
      + `<p class="rs-evo-msg">${FRASE_EVO.error}<button type="button" class="rs-mini" data-rs-evo-retry>Reintentar</button></p>`;
  }
}

function dibujarEvo(box, ctx, vivo, intento, ok, r, { moneda, disp, bench, dias, titulo }) {
  const d2 = r.disponibles && r.disponibles.length ? r.disponibles : disp;
  if (!r.ok) {
    // Mi cartera todavía no terminó de cargar sus posiciones: la sección no va
    if (r.motivo === 'sin-posiciones') { box.innerHTML = ''; box.style.display = 'none'; return; }
    if ((r.motivo === 'cargando' || r.motivo === 'sin-sesion') && intento < 6) {
      box.innerHTML = cabEvo(titulo, d2, bench, dias) + '<p class="rs-evo-msg">Cargando la historia de precios…</p>';
      setTimeout(() => { if (ok()) pintarEvo(box, ctx, vivo, intento + 1); }, 4000);
      return;
    }
    const reintento = ['error', 'cargando', 'sin-sesion'].includes(r.motivo);
    box.innerHTML = cabEvo(titulo, d2, bench, dias)
      + `<p class="rs-evo-msg">${FRASE_EVO[r.motivo] || FRASE_EVO.error}${reintento ? '<button type="button" class="rs-mini" data-rs-evo-retry>Reintentar</button>' : ''}</p>`
      + notasEvo(r.notas, ctx);
    return;
  }
  const P = (r.puntos || []).filter(p => p && typeof p.fecha === 'string' && Number.isFinite(p.cartera) && Number.isFinite(p.bench));
  if (P.length < 2) {
    box.innerHTML = cabEvo(titulo, d2, bench, dias) + `<p class="rs-evo-msg">${FRASE_EVO['sin-historia']}</p>` + notasEvo(r.notas, ctx);
    return;
  }
  const res = r.res || {};
  // si la historia empieza bastante después de lo pedido, el título lo dice
  if (res.desde && diasEntre(sumarDias(ctx.hoyAR(), -dias), res.desde) > 10) titulo = `Evolución · desde el ${ctx.esc(ctx.fmtF(res.desde))} · comparada`;
  const benchUsado = r.bench || bench;
  const nombre = ctx.esc(r.nombre || nombreBench(benchUsado, moneda));
  box.innerHTML = cabEvo(titulo, d2, benchUsado, dias) + graficoEvo(P, res, nombre, r, dias) + notasEvo(r.notas, ctx);
}

function graficoEvo(P, res, nombre, r, dias) {
  const t = p => Date.parse(p.fecha.slice(0, 10) + 'T12:00:00Z');
  const t0 = t(P[0]), tz = t(P[P.length - 1]), span = (tz - t0) || 1;
  const vals = P.flatMap(p => [p.cartera, p.bench]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const X = p => (t(p) - t0) / span * 600;
  const Y = v => 160 - (v - lo) / (hi - lo) * 160;
  const f1 = n => n.toFixed(1);
  const camino = (arr, k) => arr.map((p, i) => (i ? 'L' : 'M') + f1(X(p)) + ',' + f1(Y(p[k]))).join('');
  // la cartera en tramos: simulación punteada, variación real llena; cada tramo
  // arranca en el último punto del anterior para que la línea no se corte
  const tramos = [];
  let cur = null;
  P.forEach(p => {
    const tipo = p.tipo === 'real' ? 'real' : 'sim';
    if (!cur || cur.tipo !== tipo) {
      const prev = cur ? cur.pts[cur.pts.length - 1] : null;
      cur = { tipo, pts: prev ? [prev] : [] };
      tramos.push(cur);
    }
    cur.pts.push(p);
  });
  const area = camino(P, 'cartera') + `L${f1(X(P[P.length - 1]))},160L${f1(X(P[0]))},160Z`;
  const lineas = tramos.filter(x => x.pts.length > 1).map(x =>
    `<path d="${camino(x.pts, 'cartera')}" fill="none" style="stroke:var(--v3-serie)" stroke-width="2.5" stroke-linejoin="round"${x.tipo === 'sim' ? ' stroke-dasharray="5 4"' : ''} vector-effect="non-scaling-stroke"></path>`).join('');
  // un punto por mes (el último dato de cada mes), en HTML para que no se deforme con el ancho
  const dots = P.filter((p, i) => { const nx = P[i + 1]; return !nx || nx.fecha.slice(0, 7) !== p.fecha.slice(0, 7); })
    .map(p => `<i class="rs-evo-dot" style="left:${(X(p) / 6).toFixed(2)}%;top:${(Y(p.cartera) / 1.6).toFixed(2)}%"></i>`).join('');
  // eje Y: arriba, medio y abajo, en % respecto del inicio (base 100)
  const dec = hi - lo < 6 ? 1 : 0;
  const ejeY = [hi, (hi + lo) / 2, lo].map(v => `<span>${pctS(v - 100, dec)}</span>`).join('');
  // eje X: en 6M y 1A, el comienzo de cada mes (uno sí y uno no en 1A) ubicado en su
  // fecha; en 3M, o si la historia es corta, fechas repartidas con día y mes
  const inicios = [];
  for (let d0 = new Date(t0), a = d0.getUTCFullYear(), mm = d0.getUTCMonth() + 1, k = 0; k < 40; k++, mm++) {
    if (mm > 11) { mm = 0; a++; }
    const tm = Date.UTC(a, mm, 1, 12);
    if (tm > tz) break;
    inicios.push(tm);
  }
  let ejeX;
  if (dias > 91 && inicios.length >= 3) {
    const paso = Math.ceil(inicios.length / 6);
    const sel = inicios.filter((_, i) => (inicios.length - 1 - i) % paso === 0);
    ejeX = `<div class="rs-evo-x abs" aria-hidden="true">${sel.map(tm => {
      const pc = (tm - t0) / span * 100, tr = pc < 4 ? '0' : pc > 96 ? '-100%' : '-50%';
      return `<span style="left:${pc.toFixed(2)}%;transform:translateX(${tr})">${MES_C[new Date(tm).getUTCMonth()]}</span>`;
    }).join('')}</div>`;
  } else {
    const nX = span < 4 * 864e5 ? 2 : 4;
    const fx = Array.from({ length: nX }, (_, i) => new Date(t0 + span * i / (nX - 1)));
    ejeX = `<div class="rs-evo-x" aria-hidden="true">${fx.map(d => `<span>${d.getUTCDate()} ${MES_C[d.getUTCMonth()]}</span>`).join('')}</div>`;
  }
  const rc = res.cartera, rb = res.bench, dif = res.diferencia != null ? res.diferencia : (rc - rb);
  const u = puntos(dif) === '1,0' ? 'punto' : 'puntos';
  const difTxt = !isFinite(dif) ? '' : Math.abs(dif) < 0.05 ? `Vas igual que ${nombre}`
    : dif > 0 ? `Le ganás a ${nombre} por ${N(puntos(dif))} ${u}` : `Vas ${N(puntos(dif))} ${u} abajo de ${nombre}`;
  const sim = !!r.haySim, real = !!r.hayReal;
  const icoCartera = sim && !real ? 'border-top:2.5px dashed var(--v3-serie)' : 'border-top:2.5px solid var(--v3-serie)';
  const aria = `Evolución de tu cartera contra ${nombre}: ${pctS(rc)} contra ${pctS(rb)}`;
  return `<div class="rs-evo-leg">
      <span><i style="${icoCartera}"></i>Tu cartera <b class="${upCls(rc)}">${pctS(rc)}</b></span>
      <span><i style="border-top:2px solid var(--v3-bench)"></i>${nombre} <b style="color:var(--v3-ink)">${pctS(rb)}</b></span>
      ${sim && real ? '<span><i style="border-top:2.5px dashed var(--v3-serie)"></i>simulada</span>' : ''}
      ${difTxt ? `<span class="dif ${dif >= 0 ? 'rs-up' : 'rs-dn'}">${difTxt}</span>` : ''}
    </div>
    <div class="rs-evo-g">
      <div class="rs-evo-y" aria-hidden="true">${ejeY}</div>
      <div class="rs-evo-p">
        <svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="${aria}">
          <line x1="0" y1="0" x2="600" y2="0" style="stroke:var(--v3-track)" vector-effect="non-scaling-stroke"></line>
          <line x1="0" y1="80" x2="600" y2="80" style="stroke:var(--v3-track)" vector-effect="non-scaling-stroke"></line>
          <line x1="0" y1="160" x2="600" y2="160" style="stroke:var(--v3-line)" vector-effect="non-scaling-stroke"></line>
          <path d="${area}" style="fill:var(--v3-area)"></path>
          <path d="${camino(P, 'bench')}" fill="none" style="stroke:var(--v3-bench)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
          ${lineas}
        </svg>${dots}
      </div>
      ${ejeX}
    </div>`;
}

/* ───────────────────────── tarjetas de hoy ───────────────────────── */
async function pintarHoy(box, ctx, vivo, cc, disc, bset, evP) {
  if (!box) return;
  try {
    const esc = ctx.esc, tiene = (cc.pos || []).length > 0, hoy = ctx.hoyAR();
    const ten = ctx.tenencias(cc, bset);
    const [act, ts, seg, ajs, evs] = await Promise.all([
      seguro(ctx.radar, []), seguro(ctx.teaser, []), seguro(ctx.seguidas, {}),
      tiene ? seguro(ctx.ajustes, []) : [], tiene ? evP : []]);
    if (!vivo()) return;
    const cards = [];

    // (a) zona de compra: lo mejor del radar que todavía no tiene
    const orden = typeof ctx.ordenComprar === 'function' ? ctx.ordenComprar(act || []) : (act || []);
    const z = orden.find(a => a && a.entrada && !ten.radar.has(a.sym));
    if (z) {
      // redondeados como en Qué comprar (y así nada del doc entra sin pasar por un número)
      const sc = z.score != null && Number.isFinite(Number(z.score)) ? Math.round(Number(z.score)) : null;
      const rsi = z.rsi != null && Number.isFinite(Number(z.rsi)) ? Math.round(Number(z.rsi)) : null;
      const datos = [sc != null ? `Puntaje de valor ${N(sc)}` : '', rsi != null ? `RSI ${N(rsi)}` : ''].filter(Boolean).join(', ');
      cards.push({ k: 'Zona de compra', c: 'var(--v3-up)', t: `${esc(z.sym)} está en zona de compra`,
        p: (datos ? datos + '. ' : '') + 'Todavía no la tenés.', cta: 'Qué comprar', go: 'comprar' });
    }

    // (b) Carteras Valtia: la rotación más reciente de las últimas dos semanas
    //     (solo de las que sigue, si sigue alguna)
    const corte = sumarDias(hoy, -14), hayseg = Object.keys(seg || {}).length > 0;
    const rot = (ts || []).filter(t => t && t.ultimaRotacion && String(t.ultimaRotacion.fecha || '').slice(0, 10) >= corte && (!hayseg || seg[t.id]))
      .sort((a, b) => String(b.ultimaRotacion.fecha).localeCompare(String(a.ultimaRotacion.fecha)))[0];
    if (rot) {
      const u = rot.ultimaRotacion, abierta = rot.visibilidad === 'publico' || !!ctx.S.pro;
      const mov = [u.accion, u.ticker].filter(Boolean).map(esc).join(' ');
      const bench = esc(rot.benchmark || 'SPY');
      const desde = rot.fechaInicio ? ` desde el ${fechaCorta(ctx, rot.fechaInicio)}` : ' desde su lanzamiento';
      let p = '';
      if (rot.retorno != null && rot.retornoBench != null && isFinite(rot.retorno - rot.retornoBench)) {
        const d = rot.retorno - rot.retornoBench, uu = puntos(d) === '1,0' ? 'punto' : 'puntos';
        p = Math.abs(d) < 0.05 ? `Va igual que ${bench}${desde}.`
          : d > 0 ? `Le gana a ${bench} por ${N(puntos(d))} ${uu}${desde}.` : `Va ${N(puntos(d))} ${uu} abajo de ${bench}${desde}.`;
      } else if (rot.retorno != null && isFinite(rot.retorno)) p = `${cap(desde.trim())}: ${N(pctS(rot.retorno, 2))}.`;
      cards.push({ k: 'Carteras Valtia', c: 'var(--v3-gold)', dest: true,
        t: abierta && u.ticker ? `${esc(rot.nombre)} rotó: ${mov}` : `${esc(rot.nombre)} rotó el ${esc(ctx.fmtC(u.fecha))}`,
        p: (seg && seg[rot.id] ? 'La seguís. ' : '') + p, cta: 'Carteras', go: 'carteras' });
    }

    // (c) el plan del mes, si le faltan compras
    if (tiene && disc && disc.config) {
      const mes = hoy.slice(0, 7), obj = Math.max(1, Number(disc.config.compras) || 1);
      const hechas = (disc.log || []).filter(c => String(c.fecha || '').slice(0, 7) === mes).length;
      const faltan = obj - hechas;
      if (faltan > 0) {
        const aporte = Number(disc.config.aporte) || 0, nombreMes = (ctx.MESES || [])[Number(mes.slice(5)) - 1] || '';
        cards.push({ k: 'Tu plan del mes', c: 'var(--v3-gold2)',
          t: `Te falta${faltan > 1 ? 'n' : ''} ${faltan} compra${faltan > 1 ? 's' : ''} de ${obj}`,
          p: aporte > 0 ? `${N(ctx.money(aporte / obj * faltan, 'USD'))} pendientes de tu regla de ${nombreMes}.` : `Llevás ${hechas} de ${obj} este mes.`,
          cta: 'Plan', go: 'disciplina' });
      }
    }

    // (d) en tu cartera: aviso del sync, vencimiento cercano o RSI extremo
    if (tiene) {
      let d = null;
      const aj = (ajs || [])[0];
      if (aj) {
        const tk = esc(base(aj.ticker)), brk = esc(aj.broker || 'tu broker');
        let cant = '';
        try { cant = ctx.num(cantidadAjuste(aj), 4).replace(/,?0+$/, ''); } catch (e) {}
        const mas = ajs.length > 1 ? ` Hay ${ajs.length - 1} aviso${ajs.length > 2 ? 's' : ''} más.` : '';
        d = { t: aj.tipo === 'desaparecio' ? `${tk} ya no aparece en ${brk}: ¿la vendiste?` : `${tk} bajó en ${brk}: ¿vendiste${cant ? ' ' + N(cant) : ''}?`,
          p: `Lo detectó el sync${/^\d{4}-\d{2}-\d{2}/.test(String(aj.fecha || '')) ? ' el ' + fechaCorta(ctx, aj.fecha) : ''}. Confirmalo o descartalo en Mi cartera.${mas}`, ver: aj.ticker };
      }
      if (!d) {
        const v = (evs || []).find(e => e && e.mio && e.tipo === 'vencimiento' && ctx.enDias(e.f) >= 0 && ctx.enDias(e.f) <= 7);
        if (v) {
          const dd = ctx.enDias(v.f), cuando = dd === 0 ? 'hoy' : dd === 1 ? 'mañana' : `en ${dd} días`;
          d = { t: `${esc(v.k)} vence ${cuando}`, p: `${cap(esc(v.txt))}${v.sub ? ' ' + cap(esc(v.sub)) + '.' : ''}`, ver: v.tk || v.k };
        }
      }
      if (!d) {
        const porTk = new Map();
        (cc.r.filas || []).forEach(f => {
          const rsi = f.px && f.px.rsi != null ? Number(f.px.rsi) : null;
          if (rsi != null && isFinite(rsi)) porTk.set(base(f.ticker), { tk: f.ticker, rsi });
        });
        const l = [...porTk.values()];
        const alto = l.filter(x => x.rsi > 70).sort((a, b) => b.rsi - a.rsi)[0];
        const bajo = l.filter(x => x.rsi < 30).sort((a, b) => a.rsi - b.rsi)[0];
        if (alto) d = { t: `${esc(base(alto.tk))} viene sobrecomprada`, p: `RSI ${N(Math.round(alto.rsi))}. No es señal de venta; es para mirarla.`, ver: alto.tk };
        else if (bajo) d = { t: `${esc(base(bajo.tk))} viene sobrevendida`, p: `RSI ${N(Math.round(bajo.rsi))}. No es señal de compra; es para mirarla.`, ver: bajo.tk };
      }
      if (d) cards.push({ ...d, k: 'En tu cartera', c: 'var(--v3-dn)', cta: 'Ver posición' });
    }

    if (!cards.length) { box.remove(); return; }
    box.innerHTML = cards.slice(0, 4).map(h => {
      const dest = h.ver != null ? `href="#panel/micartera" data-rs-ver="${esc(h.ver)}"` : `href="#panel/${h.go}" data-go="${h.go}"`;
      return `<a class="rs-h${h.dest ? ' dest' : ''}" ${dest}>
        <div class="rs-h-top"><span class="rs-h-k" style="color:${h.c}">${h.k}</span><span class="rs-h-cta">${h.cta} →</span></div>
        <div class="rs-h-t">${h.t}</div><div class="rs-h-p">${h.p}</div></a>`;
    }).join('');
  } catch (e) {
    if (vivo()) box.remove();
  }
}

/* ───────────────────────── lo que viene ───────────────────────── */
function filaEvento(e, ctx) {
  const esc = ctx.esc, f = String(e.f || '');
  const tp = TIPOS[e.tipo] || [e.tipo || '', '', ''];
  const rot = TIPO_RESUMEN[e.tipo] || tp[0];
  const inner = `<div class="rs-ev-d"><b>${esc(f.slice(8, 10))}</b><span>${MES_C[Number(f.slice(5, 7)) - 1] || ''}</span></div>
    <div class="rs-min0"><div class="rs-ev-t"><b>${esc(e.k)}</b> ${esc(e.txt)}</div>${e.sub ? `<div class="rs-ev-s">${esc(e.sub)}</div>` : ''}</div>
    <span class="rs-ev-tipo" style="color:${cvar(tp[1], '--v3-mut')};background:${cvar(tp[2], '--v3-neutro')}">${esc(rot)}</span>`;
  return e.href ? `<a class="rs-ev" href="${esc(e.href)}">${inner}</a>` : `<div class="rs-ev">${inner}</div>`;
}

async function pintarAgenda(box, ctx, vivo, tiene, evP) {
  if (!box) return;
  try {
    const evs = ((await evP) || []).filter(e => e && e.f);
    if (!vivo()) return;
    if (!tiene) {
      const merc = evs.slice(0, 6);
      box.innerHTML = `<div class="rs-ag">${merc.length ? merc.map(e => filaEvento(e, ctx)).join('') : '<p class="rs-vac">Nada agendado en los próximos 30 días.</p>'}</div>`;
      return;
    }
    const mios = evs.filter(e => e.mio).slice(0, 6);
    if (mios.length) { box.innerHTML = `<div class="rs-ag">${mios.map(e => filaEvento(e, ctx)).join('')}</div>`; return; }
    const merc = evs.filter(e => !e.mio).slice(0, 3);
    box.innerHTML = `<div class="rs-ag"><p class="rs-vac">Nada en tus activos en los próximos 30 días.</p>
      ${merc.length ? `<div class="rs-ag-k">Lo próximo del mercado</div>${merc.map(e => filaEvento(e, ctx)).join('')}` : ''}</div>`;
  } catch (e) {
    if (vivo()) box.innerHTML = '<div class="rs-ag"><p class="rs-vac">No pudimos armar la agenda ahora. Probá de nuevo en un rato.</p></div>';
  }
}

/* ───────────────────────── research reciente ───────────────────────── */
async function pintarResearch(box, ctx, vivo, cc, bset) {
  if (!box) return;
  try {
    const esc = ctx.esc, tiene = (cc.pos || []).length > 0, hoy = ctx.hoyAR();
    const ten = ctx.tenencias(cc, bset);
    const [inf, nots] = await Promise.all([seguro(ctx.informes, []), tiene ? seguro(ctx.noticias, []) : []]);
    if (!vivo()) return;
    const fch = d => String(d.fecha || '').slice(0, 10);
    const tuyo = d => !!(d.ticker && ten.fichas.has(String(d.ticker).toUpperCase()));
    // hasta 3 informes, los más nuevos, primero los de lo que tiene
    const ord = (inf || []).filter(d => d && d.titulo && d.fecha).sort((a, b) => fch(b).localeCompare(fch(a)));
    const infs = [...ord.filter(tuyo), ...ord.filter(d => !tuyo(d))].slice(0, 3).map(d => ({
      tipo: 'Informe', f: d.fecha, t: d.titulo, tuyo: tuyo(d),
      href: d.ticker ? `activo.html?t=${encodeURIComponent(String(d.ticker).toUpperCase())}#informe` : 'informes.html' }));
    // y, si hay lugar, notas del último mes que nombran sus activos
    let notas = [];
    if (tiene) {
      const claves = [];
      ten.fichas.forEach(f => { const emp = (ctx.EMPRESAS || []).find(x => x.ticker === f); if (emp && emp.claves) claves.push(...emp.claves); });
      const corte = sumarDias(hoy, -30), lugar = 2;
      if (claves.length && lugar > 0) {
        notas = (nots || []).filter(n => n && n.titulo && fch(n) >= corte && claves.some(k => k && (String(n.titulo) + ' ' + String(n.resumen || '')).toLowerCase().includes(k)))
          .slice(0, lugar).map(n => ({ tipo: 'Nota', f: n.fecha, t: n.titulo, tuyo: true, href: `nota.html?n=${encodeURIComponent(n.id)}` }));
      }
    }
    // tres, como el prototipo: primero informes de lo que tiene, después hasta dos notas y el resto con informes
    const items = [...infs.filter(i => i.tuyo), ...notas, ...infs.filter(i => !i.tuyo)].slice(0, 3);
    if (!items.length) {
      box.innerHTML = `<div class="rs-vac-card"><p class="rs-vac">${tiene ? 'Todavía no hay informes ni notas sobre tus activos.' : 'Todavía no hay informes para mostrar acá.'} <a class="rs-lnk" href="/informes">Ver todos los informes →</a></p></div>`;
      return;
    }
    box.innerHTML = `<div class="rs-rs">${items.map(it => `<a class="rs-r" href="${esc(it.href)}">
        <div class="rs-r-k"><span>${it.tipo}</span><i></i><span class="f">${esc(ctx.fmtC(it.f))}</span>${it.tuyo ? '<span class="tuyo">la tenés</span>' : ''}</div>
        <div class="rs-r-t">${esc(it.t)}</div></a>`).join('')}</div>`;
  } catch (e) {
    if (vivo()) box.innerHTML = '<div class="rs-vac-card"><p class="rs-vac">No pudimos leer el research ahora.</p></div>';
  }
}
