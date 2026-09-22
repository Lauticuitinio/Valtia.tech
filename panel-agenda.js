// panel-agenda.js — la pestaña Agenda del panel del inversor (Panel v3, id 'agenda',
// título "Agenda del mercado"). Tres vistas —Lista (la de entrada), Semana y Mes— con
// los mismos filtros: mercado, tipo de evento y "◆ Solo mis activos".
//
// La estructura es la del prototipo (Valtia Panel v3.html, 406-550); los colores y la
// tipografía, los de Noticias, siempre por las variables --v3-* de panel.js.
//
// Los datos salen de eventos() de panel-eventos.js: resultados de empresas (fecha
// estimada por cada una) y pagos y vencimientos de bonos y letras. Dividendos, IPO,
// licitaciones y datos macro todavía no tienen fuente: los filtros están y la pestaña
// lo dice, en vez de mostrar una lista vacía sin explicación.
//
// El estado (vista, filtros, semana y mes visibles, día elegido) vive en este módulo:
// los clics redibujan SOLO esta pestaña y el estado sobrevive a los redibujos que pide
// el panel (cambio de moneda, compra registrada). Si cambia la cuenta, se reinicia.
import { eventos, TIPOS } from './panel-eventos.js?v=1';

/* ───────────────────────── estilos ───────────────────────── */
const ESTILO = `
.ag{min-width:0}
.ag-cargando{font:400 13px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut)}
.ag-n{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
/* controles: selectores sin caja, la opción activa con subrayado dorado de 2px */
.ag-top{display:flex;align-items:center;justify-content:space-between;gap:12px 18px;flex-wrap:wrap;margin:0 0 16px}
.ag-fil{display:flex;gap:6px 18px;flex-wrap:wrap;align-items:center;min-width:0}
.ag-der{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.ag-seg{display:inline-flex;flex-wrap:wrap;gap:2px;align-items:center;min-width:0}
.ag-sel{font:500 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.06em;padding:8px 10px;margin:0;cursor:pointer;
  color:var(--v3-mut);background:none;border:none;border-bottom:2px solid transparent;border-radius:0;white-space:nowrap;transition:color .15s}
.ag-sel:hover{color:var(--v3-ink)}
.ag-sel.on{color:var(--v3-ink);border-bottom-color:var(--v3-gold)}
.ag-cuenta{font:400 12.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-sub);white-space:nowrap}
/* lista: fecha grande a la izquierda (sticky) y la card del día a la derecha */
.ag-lista{display:flex;flex-direction:column;gap:14px}
.ag-dia{display:grid;grid-template-columns:96px minmax(0,1fr);gap:18px;align-items:start}
.ag-fecha{position:sticky;top:96px;padding-top:6px}
.ag-fecha .d{font:700 30px 'Playfair Display',Georgia,serif;font-variant-numeric:lining-nums;color:var(--v3-ink);line-height:1}
/* nowrap: "sep · miércoles" pasa apenas los 96px y, cortado, deja el punto colgando;
   así se mete en el hueco de 18px de la grilla sin tocar la card */
.ag-fecha .m{font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--v3-gold2);margin-top:4px;white-space:nowrap}
.ag-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow:hidden}
.ag-fila{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:14px;align-items:center;padding:13px 18px;
  border-bottom:1px solid var(--v3-line2);color:inherit;text-decoration:none;transition:background .15s}
.ag-fila:last-child{border-bottom:none}
/* sin hora (hoy ninguna fuente la trae) no se reserva la columna */
.ag-fila.sin-h{grid-template-columns:minmax(0,1fr) auto}
.ag-lista .ag-fila:hover,a.ag-fila:hover{background:var(--v3-hover)}
.ag-fila .h{font:600 10px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--v3-mut);white-space:nowrap}
.ag-fila .b{min-width:0}
/* ARG/USA en línea con el texto: si el texto no entra, sigue debajo en vez de dejar el rótulo solo */
.ag-fila .l1{display:block}
.ag-fila .mk{font:600 9px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;margin-right:8px}
.ag-fila .t{font:400 13.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);line-height:1.45;min-width:0;overflow-wrap:anywhere}
.ag-fila .s{font:400 11.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut);margin-top:3px;line-height:1.5;overflow-wrap:anywhere}
.ag-fila .p{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.ag-pill{font:700 9px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:4px;white-space:nowrap}
.ag-pill.tuyo{color:#0E1830;background:var(--v3-goldL)}
.ag-vacio{background:var(--v3-card);border:1px dashed var(--v3-line);border-radius:10px;padding:18px;
  font:400 13px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut);line-height:1.6}
.ag-vacio a{color:var(--v3-gold);text-decoration:none;font-weight:600;white-space:nowrap}
.ag-vacio a:hover{color:var(--v3-gold2)}
.ag-aviso{margin:0 0 12px}
.ag-reint{font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--v3-gold2);
  background:none;border:none;padding:0 0 0 6px;margin:0;cursor:pointer}
.ag-reint:hover{color:var(--v3-ink)}
/* navegación ‹ › Hoy + título */
.ag-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.ag-flecha{width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--v3-mut);
  font:400 18px 'IBM Plex Sans',system-ui,sans-serif;line-height:1;border-radius:6px;background:none;border:none;padding:0;margin:0}
.ag-flecha:hover{color:var(--v3-ink);background:var(--v3-track)}
.ag-hoy{font:500 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:7px 8px;margin:0;
  cursor:pointer;color:var(--v3-gold2);background:none;border:none;border-radius:6px}
.ag-hoy:hover{color:var(--v3-ink)}
.ag-tit{font:700 20px 'Playfair Display',Georgia,serif;color:var(--v3-ink);margin-left:8px;line-height:1.2}
/* semana: siete cards, lunes a domingo */
.ag-sem{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.ag-sd{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:10px;padding:12px 10px;min-height:190px;cursor:pointer;
  display:flex;flex-direction:column;gap:6px;min-width:0;transition:border-color .15s}
.ag-sd:hover,.ag-sd.sel{border-color:var(--v3-gold)}
.ag-sd .hd{display:flex;align-items:baseline;gap:6px;margin-bottom:4px}
.ag-hoyn{font:600 16px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:#fff;background:var(--v3-navy);border-radius:6px;padding:2px 7px;line-height:1.2}
.ag-sd .dn{font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-mut)}
.ag-sev{border-left:3px solid var(--v3-line);border-radius:0 5px 5px 0;padding:5px 7px;min-width:0}
.ag-sev .k{font:600 11px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-sev .tl{font:400 10px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-sub);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-sev .tl b{color:var(--v3-gold2)}
/* mes: grilla 7 x 6 */
.ag-mes{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;overflow:hidden}
.ag-mh{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-bottom:1px solid var(--v3-line)}
.ag-mh div{padding:8px;font:600 9.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--v3-mut);text-align:center}
.ag-mg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.ag-mc{min-height:108px;padding:8px;border-right:1px solid var(--v3-line2);border-bottom:1px solid var(--v3-line2);background:var(--v3-card);
  cursor:pointer;display:flex;flex-direction:column;gap:3px;min-width:0;transition:background .15s}
.ag-mc:nth-child(7n){border-right:none}
.ag-mc:nth-last-child(-n+7){border-bottom:none}
.ag-mc.fuera{background:var(--v3-bg)}
.ag-mc.sel,.ag-mc:hover{background:var(--v3-hl)}
.ag-mc .n{font:600 12px 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--v3-ink);border-radius:5px;padding:1px 6px;align-self:flex-start;line-height:1.4}
.ag-mc.fuera .n{color:var(--v3-cero)}
/* sin el crema del prototipo el fondo de afuera es blanco: lo de otro mes se atenúa entero */
.ag-mc.fuera .ev,.ag-mc.fuera .mas,.ag-mc.fuera .pt{opacity:.55}
.ag-mc .n.hoy{color:#fff;background:var(--v3-navy)}
/* en oscuro el navy de bloque casi no se distingue de la card: hoy va en dorado claro */
[data-theme="dark"] .ag-hoyn,[data-theme="dark"] .ag-mc .n.hoy{color:#0E1830;background:var(--v3-goldL)}
.ag-mc .ev{display:flex;align-items:center;gap:5px;font:400 10.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0}
.ag-mc .ev i{width:6px;height:6px;border-radius:50%;display:block;flex:none}
.ag-mc .ev span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-mc .mas{font:400 10px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut)}
.ag-mc .pt{display:none}
/* detalle del día elegido (semana y mes) */
.ag-det{margin-top:18px}
.ag-det-t{font:700 20px 'Playfair Display',Georgia,serif;color:var(--v3-ink);margin:0 0 10px;line-height:1.25}
.ag-pie{font:400 11.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-mut);line-height:1.7;margin:22px 0 0;max-width:760px}
/* sin lateral el encabezado deja de ser sticky: la fecha se pega debajo de la barra de 50px */
@media (max-width:920px){.ag-fecha{top:62px}}
@media (max-width:760px){
  .ag-dia{grid-template-columns:minmax(0,1fr);gap:8px}
  .ag-fecha{position:static;padding-top:0;display:flex;align-items:baseline;gap:10px}
  .ag-fecha .m{margin-top:0}
  .ag-fila{display:flex;flex-wrap:wrap;gap:6px 12px;padding:12px 14px}
  .ag-fila .h{flex:none}
  .ag-fila .h:empty{display:none}
  .ag-fila .b{flex:1 1 0}
  .ag-fila .p{flex-basis:100%;justify-content:flex-start}
  .ag-tit{margin-left:4px;font-size:18px}
  .ag-sem{grid-template-columns:minmax(0,1fr)}
  .ag-sd{min-height:0;padding:10px 12px}
  .ag-sd .hd{margin-bottom:0}
  .ag-mh div{padding:8px 0;letter-spacing:.06em}
  .ag-mc{min-height:48px;padding:6px 2px;align-items:center;gap:4px}
  .ag-mc .n{align-self:center;padding:1px 4px}
  .ag-mc .ev,.ag-mc .mas{display:none}
  .ag-mc .pt{display:block;width:6px;height:6px;border-radius:50%}
}
`;

function ponerEstilo() {
  if (document.getElementById('v3-css-agenda')) return;
  const st = document.createElement('style');
  st.id = 'v3-css-agenda';
  st.textContent = ESTILO;
  document.head.appendChild(st);
}

/* ───────────────────────── rótulos y colores ───────────────────────── */
const MESES_DEF = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_C = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MERCADOS = [['todos', 'Todos'], ['AR', 'Argentina'], ['US', 'EE.UU.']];
const FILTROS = [['todos', 'Todo'], ['balance', 'Balances'], ['dividendo', 'Dividendos'], ['vencimiento', 'Vencimientos'], ['ipo', 'IPO'], ['macro', 'Macro']];
// "Vencimientos" junta todo lo que es plata de renta fija que llega o se licita
const GRUPO = { balance: ['balance'], dividendo: ['dividendo'], vencimiento: ['vencimiento', 'cupon', 'licitacion'], ipo: ['ipo'], macro: ['macro'] };
// tipos que hoy no tienen fuente en panel-eventos.js
const SIN_FUENTE = { dividendo: 'dividendos', ipo: 'salidas a bolsa', macro: 'datos macro' };
const VISTAS = [['lista', 'Lista'], ['semana', 'Semana'], ['mes', 'Mes']];

// los rótulos salen de TIPOS (una sola fuente con el Resumen); los colores, de las
// variables --v3-* (los hex de TIPOS son los del prototipo y no siguen el tema oscuro)
const COLOR = {
  balance: ['var(--v3-serie)', 'var(--v3-navyBg)'],
  dividendo: ['var(--v3-up)', 'var(--v3-upBg)'],
  cupon: ['var(--v3-up)', 'var(--v3-upBg)'],
  vencimiento: ['var(--v3-gold2)', 'var(--v3-goldBg)'],
  licitacion: ['var(--v3-gold2)', 'var(--v3-goldBg)'],
  ipo: ['var(--v3-gold)', 'var(--v3-goldTint)'],
  macro: ['var(--v3-sub)', 'var(--v3-track)'],
  rotacion: ['var(--v3-gold)', 'var(--v3-goldTint)'],
};
const colorDe = t => COLOR[t] || ['var(--v3-mut)', 'var(--v3-neutro)'];
const rotulo = t => (TIPOS[t] && TIPOS[t][0]) || String(t || '');
const MK = { AR: ['ARG', 'var(--v3-gold2)'], US: ['USA', 'var(--v3-serie)'] };

/* ───────────────────────── fechas (AAAA-MM-DD, sin husos) ───────────────────────── */
const T12 = iso => Date.parse(iso + 'T12:00:00Z');
const addD = (iso, n) => new Date(T12(iso) + n * 864e5).toISOString().slice(0, 10);
const dow = iso => new Date(T12(iso)).getUTCDay();
const lunesDe = iso => addD(iso, -((dow(iso) + 6) % 7));
const dnum = iso => String(Number(iso.slice(8, 10)));
const sumarMes = (ym, n) => {
  let [a, m] = ym.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; a++; }
  while (m < 1) { m += 12; a--; }
  return a + '-' + String(m).padStart(2, '0');
};
const esISO = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/* ───────────────────────── estado del módulo ───────────────────────── */
const E = { email: null, vista: 'lista', mk: 'todos', tipo: 'todos', mios: false, lunes: '', mes: '', dia: '' };
let _el = null, _ctx = null, _seq = 0;
let _ult = null;   // último rango leído: { email, desde, hasta, evs, cc }

function reiniciar(hoy) {
  E.vista = 'lista'; E.mk = 'todos'; E.tipo = 'todos'; E.mios = false;
  E.lunes = lunesDe(hoy); E.mes = hoy.slice(0, 7); E.dia = hoy;
  _ult = null;
}

const hayFiltros = () => E.mk !== 'todos' || E.tipo !== 'todos' || E.mios;
const pasa = e => (E.mk === 'todos' || e.mk === E.mk)
  && (E.tipo === 'todos' || (GRUPO[E.tipo] || []).includes(e.tipo))
  && (!E.mios || e.mio);

/* el rango que se le pide a eventos(): lo visible y nada más */
function rango(hoy) {
  if (E.vista === 'semana') return { desde: E.lunes, hasta: addD(E.lunes, 6) };
  if (E.vista === 'mes') {
    const p = E.mes + '-01', ini = addD(p, -((dow(p) + 6) % 7));
    return { desde: ini, hasta: addD(ini, 41) };
  }
  return { desde: hoy, hasta: addD(hoy, 30) };
}

/* ───────────────────────── entrada ───────────────────────── */
export async function renderAgenda(el, ctx) {
  if (!el || !ctx) return;
  try {
    ponerEstilo();
    _el = el; _ctx = ctx;
    const hoy = ctx.hoyAR();
    // otra cuenta: estado de fábrica y nada de la agenda anterior en pantalla mientras carga
    const nueva = E.email !== ctx.S.email || !esISO(E.dia);
    if (nueva) { reiniciar(hoy); E.email = ctx.S.email; }
    if (!el.__agenda) {
      el.__agenda = true;
      el.addEventListener('click', alClic);
      el.addEventListener('keydown', alTecla);
    }
    if (nueva || !el.querySelector('.ag')) el.innerHTML = '<p class="ag-cargando">Cargando la agenda…</p>';
    await dibujar(true);
  } catch (e) {
    try { el.innerHTML = errorHtml(); } catch (x) {}
  }
}

async function dibujar(forzar) {
  const el = _el, ctx = _ctx;
  if (!el || !ctx) return;
  const email = ctx.S.email, seq = ++_seq;
  try {
    const hoy = ctx.hoyAR();
    const { desde, hasta } = rango(hoy);
    let d = _ult;
    if (forzar || !d || d.email !== email || d.desde !== desde || d.hasta !== hasta) {
      const [evs, cc] = await Promise.all([
        eventos(ctx, { desde, hasta }),
        Promise.resolve().then(() => ctx.carteraCalc()).catch(() => null),
      ]);
      if (ctx.S.email !== email || seq !== _seq) return;
      if (!Array.isArray(evs)) throw new Error('sin eventos');
      // la fecha es la llave de la lista, la semana y el mes: se deja en AAAA-MM-DD y un
      // evento sin fecha legible se descarta (antes que dejar la pestaña en error)
      const limpios = evs.filter(e => e && esISO(String(e.f || '').slice(0, 10)))
        .map(e => (String(e.f).length === 10 ? e : { ...e, f: String(e.f).slice(0, 10) }));
      d = _ult = { email, desde, hasta, evs: limpios, cc };
    }
    // si el clic vino del teclado, el foco vuelve al mismo control después de redibujar
    const act = document.activeElement;
    const foco = act && el.contains(act) && act.dataset ? act.dataset.ag : '';
    el.innerHTML = armar(d, hoy);
    if (foco && /^[\w:.-]+$/.test(foco)) {
      const b = el.querySelector('[data-ag="' + foco + '"]');
      if (b) { try { b.focus({ preventScroll: true }); } catch (x) {} }
    }
  } catch (e) {
    if (ctx.S.email !== email || seq !== _seq) return;
    el.innerHTML = errorHtml();
  }
}

const errorHtml = () => `<div class="ag"><div class="ag-vacio">No pudimos leer la agenda.<button type="button" class="ag-reint" data-ag="reintentar">Reintentar</button></div></div>`;

/* ───────────────────────── armado ───────────────────────── */
function armar(d, hoy) {
  const filtrados = d.evs.filter(pasa);
  // el contador es de lo que se ve: en el mes, solo los días de ese mes
  const vis = E.vista === 'mes' ? filtrados.filter(e => String(e.f).slice(0, 7) === E.mes) : filtrados;
  const porF = {};
  filtrados.forEach(e => { (porF[e.f] = porF[e.f] || []).push(e); });
  const aviso = avisoDe(d);
  let cuerpo;
  if (E.vista === 'lista') cuerpo = vistaLista(vis, aviso);
  else {
    cuerpo = (aviso ? `<div class="ag-vacio ag-aviso">${aviso}</div>` : '')
      + (E.vista === 'semana' ? vistaSemana(porF, hoy) : vistaMes(porF, hoy))
      + detalle(porF, d.evs, hoy);
  }
  return `<div class="ag">${controles(vis)}${cuerpo}
    <p class="ag-pie">Resultados de empresas según la fecha estimada por cada una; pagos y vencimientos de bonos según el flujo publicado. Dividendos, salidas a bolsa y datos macro todavía no están cargados. “◆ tuyo” marca lo que toca un activo de tu cartera.</p></div>`;
}

/* lo que hay que decir cuando el filtro no puede traer nada (no cuando no hay nada) */
function avisoDe(d) {
  const S = _ctx.S || {};
  const g = GRUPO[E.tipo] || [];
  if (SIN_FUENTE[E.tipo] && !d.evs.some(e => g.includes(e.tipo)))
    return `Todavía no cargamos ${SIN_FUENTE[E.tipo]}. Por ahora la agenda trae resultados de empresas y pagos y vencimientos de bonos.`;
  if (E.mios) {
    if (!S.verificado) return 'Verificá tu email para cargar tu cartera: después, acá vas a ver lo que toca a tus activos.';
    if (d.cc && d.cc.fallo) return 'No pudimos leer tu cartera, así que no sabemos qué eventos son tuyos. Probá de nuevo en un rato.';
    if (d.cc && !(d.cc.pos || []).length)
      return 'Todavía no cargaste posiciones: cuando las cargues, acá vas a ver lo que les toca. <a href="#panel/micartera" data-go="micartera">Ir a Mi cartera →</a>';
  }
  return '';
}

function controles(vis) {
  const n = vis.length, k = vis.filter(e => e.mio).length;
  const seg = (items, cur, clave, etq) => `<div class="ag-seg" role="group" aria-label="${etq}">${items.map(([v, l]) =>
    `<button type="button" class="ag-sel${cur === v ? ' on' : ''}" aria-pressed="${cur === v}" data-ag="${clave}:${v}">${l}</button>`).join('')}</div>`;
  return `<div class="ag-top">
    <div class="ag-fil">${seg(MERCADOS, E.mk, 'mk', 'Mercado')}${seg(FILTROS, E.tipo, 'tipo', 'Tipo de evento')}<button type="button" class="ag-sel${E.mios ? ' on' : ''}" aria-pressed="${E.mios}" data-ag="mios">◆ Solo mis activos</button></div>
    <div class="ag-der"><span class="ag-cuenta"><span class="ag-n">${n}</span> ${n === 1 ? 'evento' : 'eventos'} · <span class="ag-n">${k}</span> ${k === 1 ? 'toca' : 'tocan'} tu cartera</span>${seg(VISTAS, E.vista, 'vista', 'Vista')}</div>
  </div>`;
}

/* una fila de evento: la de la lista y la del detalle del día */
function fila(e) {
  const esc = _ctx.esc;
  const [c, b] = colorDe(e.tipo);
  const mk = MK[e.mk] || ['', 'var(--v3-mut)'];
  const tag = e.href ? 'a' : 'div';
  const href = e.href ? ` href="${esc(e.href)}"` : '';
  return `<${tag} class="ag-fila${e.hora ? '' : ' sin-h'}"${href}>`
    + (e.hora ? `<div class="h">${esc(e.hora)}</div>` : '')
    + `<div class="b"><div class="l1">${mk[0] ? `<span class="mk" style="color:${mk[1]}">${mk[0]}</span>` : ''}<span class="t"><b>${esc(e.k)}</b> ${esc(e.txt)}</span></div>`
    + `${e.sub ? `<div class="s">${esc(e.sub)}</div>` : ''}</div>`
    + `<div class="p">${e.mio ? '<span class="ag-pill tuyo">◆ tuyo</span>' : ''}<span class="ag-pill" style="color:${c};background:${b}">${esc(rotulo(e.tipo))}</span></div>`
    + `</${tag}>`;
}

const mesesDe = () => (_ctx && Array.isArray(_ctx.MESES) && _ctx.MESES.length === 12 ? _ctx.MESES : MESES_DEF);
const mesC = iso => mesesDe()[Number(iso.slice(5, 7)) - 1].slice(0, 3);
function tituloDia(f, hoy) {
  const m = mesesDe()[Number(f.slice(5, 7)) - 1];
  return `${DIAS[dow(f)]} ${dnum(f)} de ${m}${f.slice(0, 4) !== hoy.slice(0, 4) ? ' de ' + f.slice(0, 4) : ''}`;
}
const cuantos = n => n ? n + (n === 1 ? ' evento' : ' eventos') : 'sin eventos';

/* ── Lista: próximos 30 días agrupados por día ── */
function vistaLista(vis, aviso) {
  if (!vis.length) {
    const msg = aviso || (hayFiltros() ? 'Nada con estos filtros.' : 'Nada agendado en los próximos 30 días.');
    return `<div class="ag-vacio">${msg}</div>`;
  }
  const grupos = [];
  vis.forEach(e => {
    let g = grupos[grupos.length - 1];
    if (!g || g.f !== e.f) grupos.push(g = { f: e.f, items: [] });
    g.items.push(e);
  });
  return `<div class="ag-lista">${grupos.map(g => `<div class="ag-dia">
      <div class="ag-fecha"><div class="d">${g.f.slice(8, 10)}</div><div class="m">${mesC(g.f)} · ${DIAS[dow(g.f)]}</div></div>
      <div class="ag-card">${g.items.map(fila).join('')}</div></div>`).join('')}</div>`;
}

/* navegación ‹ › Hoy + título, compartida por semana y mes */
function nav(tit, unidad) {
  const esc = _ctx.esc;
  const ant = unidad === 'mes' ? 'Mes anterior' : 'Semana anterior', sig = unidad === 'mes' ? 'Mes siguiente' : 'Semana siguiente';
  return `<div class="ag-nav"><button type="button" class="ag-flecha" data-ag="prev" aria-label="${ant}" title="${ant}">‹</button>`
    + `<button type="button" class="ag-flecha" data-ag="next" aria-label="${sig}" title="${sig}">›</button>`
    + `<button type="button" class="ag-hoy" data-ag="hoy">Hoy</button><div class="ag-tit">${esc(tit)}</div></div>`;
}

/* ── Semana: lunes a domingo ── */
function vistaSemana(porF, hoy) {
  const esc = _ctx.esc;
  const dias = Array.from({ length: 7 }, (_, i) => addD(E.lunes, i));
  const dom = dias[6], a1 = E.lunes.slice(0, 4), a2 = dom.slice(0, 4);
  const tit = `${dnum(E.lunes)} ${mesC(E.lunes)}${a1 !== a2 ? ' ' + a1 : ''} – ${dnum(dom)} ${mesC(dom)} ${a2}`;
  return nav(tit, 'semana') + `<div class="ag-sem">${dias.map((f, i) => {
    const its = porF[f] || [], esHoy = f === hoy, sel = f === E.dia;
    return `<div class="ag-sd${sel ? ' sel' : ''}" role="button" tabindex="0" data-ag="dia:${f}" aria-pressed="${sel}" aria-label="${esc(tituloDia(f, hoy) + ': ' + cuantos(its.length))}">`
      + `<div class="hd">${esHoy ? `<span class="ag-hoyn">${dnum(f)}</span>` : ''}<span class="dn">${DIAS_C[i]}${esHoy ? '' : ` <span class="ag-n">${dnum(f)}</span>`}</span></div>`
      + its.map(e => {
        const [c, b] = colorDe(e.tipo);
        return `<div class="ag-sev" style="border-left-color:${c};background:${b}"><div class="k">${esc(e.k)}</div><div class="tl">${esc(rotulo(e.tipo))}${e.mio ? ' <b>◆</b>' : ''}</div></div>`;
      }).join('')
      + `</div>`;
  }).join('')}</div>`;
}

/* ── Mes: grilla 7 x 6 que arranca el lunes ── */
function vistaMes(porF, hoy) {
  const esc = _ctx.esc;
  const p = E.mes + '-01', ini = addD(p, -((dow(p) + 6) % 7));
  const nm = mesesDe()[Number(E.mes.slice(5, 7)) - 1];
  const tit = nm.charAt(0).toUpperCase() + nm.slice(1) + ' ' + E.mes.slice(0, 4);
  const celdas = Array.from({ length: 42 }, (_, i) => addD(ini, i));
  return nav(tit, 'mes') + `<div class="ag-mes"><div class="ag-mh">${DIAS_C.map(x => `<div>${x}</div>`).join('')}</div>`
    + `<div class="ag-mg">${celdas.map(f => {
      const its = porF[f] || [], fuera = f.slice(0, 7) !== E.mes, sel = f === E.dia;
      return `<div class="ag-mc${fuera ? ' fuera' : ''}${sel ? ' sel' : ''}" role="button" tabindex="0" data-ag="dia:${f}" aria-pressed="${sel}" aria-label="${esc(tituloDia(f, hoy) + ': ' + cuantos(its.length))}">`
        + `<span class="n${f === hoy ? ' hoy' : ''}">${dnum(f)}</span>`
        + its.slice(0, 3).map(e => `<div class="ev"><i style="background:${colorDe(e.tipo)[0]}"></i><span>${esc(e.k)}</span></div>`).join('')
        + (its.length > 3 ? `<span class="mas"><span class="ag-n">+${its.length - 3}</span> más</span>` : '')
        + (its.length ? `<i class="pt" style="background:${colorDe(its[0].tipo)[0]}"></i>` : '')
        + `</div>`;
    }).join('')}</div></div>`;
}

/* ── detalle del día elegido, debajo de la semana o del mes ── */
function detalle(porF, todos, hoy) {
  const esc = _ctx.esc;
  const f = E.dia, its = porF[f] || [];
  let cuerpo;
  if (its.length) cuerpo = `<div class="ag-card">${its.map(fila).join('')}</div>`;
  else {
    const escondidos = hayFiltros() && todos.some(e => e.f === f);
    cuerpo = `<div class="ag-vacio">${escondidos ? 'Nada con estos filtros para este día.' : 'Nada agendado para este día.'}</div>`;
  }
  return `<div class="ag-det"><div class="ag-det-t">${esc(tituloDia(f, hoy))}</div>${cuerpo}</div>`;
}

/* ───────────────────────── interacción ───────────────────────── */
function mover(dir, hoy) {
  if (E.vista === 'semana') {
    E.lunes = addD(E.lunes, 7 * dir);
    const fin = addD(E.lunes, 6);
    // el día elegido tiene que estar a la vista: si no, hoy (si cae) o el lunes
    if (!(E.dia >= E.lunes && E.dia <= fin)) E.dia = hoy >= E.lunes && hoy <= fin ? hoy : E.lunes;
  } else if (E.vista === 'mes') {
    E.mes = sumarMes(E.mes, dir);
    if (E.dia.slice(0, 7) !== E.mes) E.dia = hoy.slice(0, 7) === E.mes ? hoy : E.mes + '-01';
  }
}

function alClic(ev) {
  if (!_ctx || ev.currentTarget !== _el) return;
  const t = ev.target.closest('[data-ag]');
  if (!t || !_el.contains(t)) return;
  const s = String(t.dataset.ag || ''), i = s.indexOf(':');
  const acc = i < 0 ? s : s.slice(0, i), val = i < 0 ? '' : s.slice(i + 1);
  const hoy = _ctx.hoyAR();
  let forzar = false;
  if (acc === 'vista' && VISTAS.some(x => x[0] === val)) {
    // al cambiar de vista se abre la semana o el mes del día elegido
    if (val === 'semana') E.lunes = lunesDe(esISO(E.dia) ? E.dia : hoy);
    if (val === 'mes') E.mes = (esISO(E.dia) ? E.dia : hoy).slice(0, 7);
    E.vista = val;
  } else if (acc === 'mk' && MERCADOS.some(x => x[0] === val)) E.mk = val;
  else if (acc === 'tipo' && FILTROS.some(x => x[0] === val)) E.tipo = val;
  else if (acc === 'mios') E.mios = !E.mios;
  else if (acc === 'prev' || acc === 'next') mover(acc === 'next' ? 1 : -1, hoy);
  else if (acc === 'hoy') { E.lunes = lunesDe(hoy); E.mes = hoy.slice(0, 7); E.dia = hoy; }
  else if (acc === 'dia' && esISO(val)) E.dia = val;
  else if (acc === 'reintentar') forzar = true;
  else return;
  ev.preventDefault();
  dibujar(forzar);
}

/* los días de la semana y del mes son role=button: Enter y espacio los eligen */
function alTecla(ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
  const t = ev.target;
  if (!t || !t.matches || !t.matches('[role="button"][data-ag]')) return;
  ev.preventDefault();
  t.click();
}
