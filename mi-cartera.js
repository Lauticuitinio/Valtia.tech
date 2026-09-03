// mi-cartera.js — seguimiento de la cartera propia del cliente.
// El cliente carga sus posiciones (ticker, cantidad, precio de compra) y ve
// valor actual, resultado y la lectura Valtia de cada activo. Los precios y
// fundamentals los deja el sync diario en precios/{TICKER}; acá solo se lee.
//
// Diseño separado a propósito: renderMiCartera() es puro (datos -> HTML) para
// poder verificarlo con datos de prueba sin tocar Firestore.
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

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
.mc-ver{font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:4px;white-space:nowrap}
.mc-ver.infra{color:#4caf50;background:rgba(76,175,80,.12)}
.mc-ver.precio{color:var(--gold);background:rgba(184,151,90,.14)}
.mc-ver.cara{color:#ef5350;background:rgba(239,83,80,.12)}
.mc-ver.sin{color:var(--muted);background:rgba(120,130,140,.12)}
.mc-del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:15px;line-height:1;padding:2px 6px}
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
`;

const money = (n, cur) => (Number(n) < 0 ? "−" : "") + (cur === "ARS" ? "$" : "US$") +
  Math.abs(Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: Math.abs(n) < 1000 ? 2 : 0 });
// con signo explícito (para resultados): +US$930 / −US$160
const moneyS = (n, cur) => (Number(n) >= 0 ? "+" : "") + money(n, cur);

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

/* ── cálculo: posiciones + precios → filas con resultado ── */
export function calcular(posiciones, precios, cur = _cur, fx = _fx) {
  const filas = posiciones.map(p => {
    const px = precios[String(p.ticker).toUpperCase()] || null;
    const moneda = (px && px.moneda) || p.moneda || "USD";
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
  const corto = f => String(f.ticker).replace(/\.BA$/, "");
  const sobrev = conVer.filter(f => f.px.rsi != null && f.px.rsi > 70).map(corto);
  const sobrec = conVer.filter(f => f.px.rsi != null && f.px.rsi < 30).map(corto);
  let extra = "";
  if (sobrev.length) extra += ` ${sobrev.join(", ")} viene${sobrev.length > 1 ? "n" : ""} sobrecomprado${sobrev.length > 1 ? "s" : ""} (RSI &gt; 70).`;
  if (sobrec.length) extra += ` ${sobrec.join(", ")} está${sobrec.length > 1 ? "n" : ""} sobrevendido${sobrec.length > 1 ? "s" : ""} (RSI &lt; 30).`;
  if (!partes.length && !extra) return "";
  return `<div class="mc-lect">Lectura Valtia: ${partes.join(" y ")}.${extra}</div>`;
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

/* ── render puro: se puede llamar con datos de prueba ── */
export function renderMiCartera(el, posiciones, precios, opts = {}) {
  asegurarEstilo();
  const r = calcular(posiciones, precios);
  const cur = curLabel();
  const fxTxt = _cur === "CCL" ? (_fx.ccl ? `CCL $${_fx.ccl.toLocaleString("es-AR")}` : "")
              : _cur === "MEP" ? (_fx.mep ? `MEP $${_fx.mep.toLocaleString("es-AR")}` : "") : "";
  const cabecera = `
    <div class="mc-head"><div>
      <div class="portal-title" style="margin-bottom:0">Mi cartera</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Seguimiento de tus posiciones con la valuación de Valtia
        · <a href="disciplina.html" style="color:var(--gold);text-decoration:none">Tu plan de disciplina mensual →</a></div>
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
      <div id="mc-modo-uno">
        <div class="row">
          <div><label>Ticker</label><input id="mc-ticker" placeholder="AAPL, BTC-USD, GGAL" maxlength="12" autocomplete="off"></div>
          <div><label>Cantidad</label><input id="mc-cant" type="number" step="any" min="0" placeholder="10"></div>
          <div><label>Precio de compra</label><input id="mc-precio" type="number" step="any" min="0" placeholder="180.50"></div>
          <div><label>Fecha (opcional)</label><input id="mc-fecha" type="date"></div>
          <div><button class="mc-btn" id="mc-add">Agregar posición</button></div>
        </div>
      </div>
      <div id="mc-modo-imp" class="mc-imp" style="display:none">
        <div class="mc-hint">Copiá las filas de tu planilla o del broker y pegalas acá: una posición por línea, en el orden
          <b>ticker · cantidad · precio de compra · fecha</b>. Sirven tabulaciones, comas o punto y coma, y los números
          pueden venir como 1.900,50 o 1900.50. El encabezado de la planilla se ignora solo.</div>
        <textarea id="mc-paste" placeholder="NVDA	20	150,50	2026-03-10&#10;MELI	2	1.900&#10;KO;50;70"></textarea>
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
    el.innerHTML = `<div class="mc-wrap">${cabecera}${form}
      <div class="mc-empty">
        <h4>Todavía no cargaste posiciones</h4>
        <p>Agregá lo que tenés —acciones, CEDEARs o cripto— con la cantidad y el precio al que compraste.
           Al día siguiente vas a ver el valor actualizado, tu resultado y la lectura de Valtia sobre cada activo.</p>
      </div></div>`;
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

  const rows = filas.map(f => {
    const px = f.px || {};
    return `<tr>
      <td class="l"><span class="mc-tk">${esc(String(f.ticker).replace(/\.BA$/, ""))}</span>${
        String(f.ticker).endsWith(".BA") ? '<span class="mc-nm" style="display:inline;color:var(--gold);opacity:.7"> BYMA</span>' : ""}
        <span class="mc-nm">${esc(px.nombre && px.nombre !== f.ticker ? px.nombre : "")}</span></td>
      <td>${num(f.cantidad, 4).replace(/,0+$/, "")}</td>
      <td>${f.dCompra != null ? money(f.dCompra, cur) : "—"}</td>
      <td>${f.dActual != null ? money(f.dActual, cur) : "—"}</td>
      <td>${f.dValor != null ? money(f.dValor, cur) : "—"}</td>
      <td class="${f.dPl == null ? "mc-mut" : f.dPl >= 0 ? "mc-pos" : "mc-neg"}">${f.dPl == null ? "—" : moneyS(f.dPl, cur)}</td>
      <td class="${f.plPct == null ? "mc-mut" : f.plPct >= 0 ? "mc-pos" : "mc-neg"}" style="font-weight:600">${f.plPct == null ? "—" : pct(f.plPct)}</td>
      <td>${f.peso != null ? num(f.peso) + "%" : "—"}</td>
      <td>${num(px.per)}</td>
      <td>${num(px.rsi)}</td>
      <td class="l">${px.sinDatos
        ? `<span class="mc-ver sin" title="Revisá que el ticker esté bien escrito">Ticker no encontrado</span>`
        : `<span class="mc-ver ${verCls(px.veredicto)}">${esc(px.veredicto || (f.actual == null ? "Buscando precio…" : "Sin dato"))}</span>`}</td>
      <td><button class="mc-del" data-del="${esc(f.id)}" title="Quitar">✕</button></td>
    </tr>`;
  }).join("");

  el.innerHTML = `<div class="mc-wrap">
    ${cabecera}${avisoFx}
    <div class="mc-kpis">
      <div class="mc-k"><div class="l">Valor actual</div><div class="v">${money(r.total, cur)}</div><div class="s">${r.filas.length} ${r.filas.length === 1 ? "posición" : "posiciones"}</div></div>
      <div class="mc-k"><div class="l">Invertido</div><div class="v">${money(r.costoTot, cur)}</div><div class="s">a precio de compra</div></div>
      <div class="mc-k"><div class="l">Resultado</div><div class="v ${r.plTot >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(r.plTot, cur)}</div><div class="s">ganancia / pérdida no realizada</div></div>
      <div class="mc-k"><div class="l">Rendimiento</div><div class="v ${(r.plTotPct || 0) >= 0 ? "mc-pos" : "mc-neg"}">${r.plTotPct == null ? "—" : pct(r.plTotPct)}</div><div class="s">sobre lo invertido</div></div>
    </div>
    ${form}
    <div class="mc-tblwrap"><table class="mc-tbl">
      <thead><tr>
        ${th("ticker", "Activo", "l")}${th("cantidad", "Cant.")}${th("dCompra", "Compra")}
        ${th("dActual", "Actual")}${th("dValor", "Valor")}${th("dPl", "Resultado")}${th("plPct", "%")}
        ${th("peso", "Peso")}<th>PER</th><th>RSI</th><th class="l">Lectura Valtia</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${lectura(r)}
    <div class="mc-foot">Los precios se actualizan cada 15 minutos durante la rueda; los ratios y la lectura, una vez por día.
      El resultado es sobre el precio de compra que cargaste.
      ${_cur !== "ARS" ? `Los valores en pesos se convierten al ${_cur === "CCL" ? "contado con liqui" : "dólar MEP"} de hoy —
        tanto el costo como el valor actual—, así que el rendimiento en % coincide con el de pesos.` : ""}
      Esta información es de carácter general y no constituye asesoramiento financiero personalizado.</div>
  </div>`;

  el.querySelectorAll("th[data-col]").forEach(h => h.onclick = () => {
    const c = h.dataset.col;
    _orden = { col: c, desc: _orden.col === c ? !_orden.desc : true };
    renderMiCartera(el, posiciones, precios, opts);
    if (opts.onRerender) opts.onRerender();
  });
}

/* ── Firestore: carga, alta y baja de posiciones ── */
let _el = null, _user = null, _pos = [], _precios = {};

async function leerTodo() {
  const db = getFirestore(getApp());
  const snap = await getDocs(collection(db, "inversores", _user.email, "cartera"));
  _pos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  _precios = {};
  const tks = [...new Set(_pos.map(p => String(p.ticker).toUpperCase()))];
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

function pintar() {
  renderMiCartera(_el, _pos, _precios, { frescura: frescura(), onRerender: enganchar });
  enganchar();
}

function enganchar() {
  const add = _el.querySelector("#mc-add");
  if (add) add.onclick = agregar;
  _el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => quitar(b.dataset.del));
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

function revisarImport() {
  const txt = _el.querySelector("#mc-paste").value;
  const { filas, errores } = parseImport(txt);
  const prev = _el.querySelector("#mc-prev");
  if (!filas.length) {
    prev.innerHTML = `<div class="mc-hint mc-bad">No pude leer ninguna posición.
      ${errores.slice(0, 4).map(esc).join("<br>")}</div>`;
    return;
  }
  _porImportar = filas;
  prev.innerHTML = `
    <div class="mc-prev"><table>
      <thead><tr><th>Ticker</th><th>Cantidad</th><th>Precio compra</th><th>Fecha</th></tr></thead>
      <tbody>${filas.map(f => `<tr><td><b>${esc(f.ticker)}</b></td><td>${num(f.cantidad, 4).replace(/,0+$/, "")}</td>
        <td>${f.precioCompra ? money(f.precioCompra, "USD") : "—"}</td><td>${esc(f.fecha || "—")}</td></tr>`).join("")}</tbody>
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
        fecha: f.fecha, creado: new Date().toISOString(),
      });
      ok++;
    } catch (e) { fallo++; }
  }
  _porImportar = null;
  msg.innerHTML = `<span style="color:#4caf50">${ok} posición(es) importadas.</span>` +
    (fallo ? ` <span style="color:#ef5350">${fallo} fallaron.</span>` : "") +
    ` <span style="color:var(--muted)">Los precios aparecen en la próxima actualización.</span>`;
  await leerTodo();
  pintar();
}

async function agregar() {
  const msg = _el.querySelector("#mc-msg");
  const tk = (_el.querySelector("#mc-ticker").value || "").trim().toUpperCase();
  const cant = parseFloat(_el.querySelector("#mc-cant").value);
  const pc = parseFloat(_el.querySelector("#mc-precio").value);
  const fecha = _el.querySelector("#mc-fecha").value || "";
  if (!tk || !(cant > 0)) {
    msg.innerHTML = `<span style="color:#ef5350">Completá al menos el ticker y la cantidad.</span>`;
    return;
  }
  try {
    const db = getFirestore(getApp());
    const id = tk + "-" + Date.now().toString(36);
    await setDoc(doc(db, "inversores", _user.email, "cartera", id), {
      ticker: tk, cantidad: cant, precioCompra: isFinite(pc) ? pc : 0, fecha,
      creado: new Date().toISOString(),
    });
    msg.innerHTML = `<span style="color:#4caf50">${tk} agregado. El precio aparece con la actualización de mañana.</span>`;
    await leerTodo();
    pintar();
  } catch (e) {
    msg.innerHTML = `<span style="color:#ef5350">No se pudo guardar: ${esc(String(e).slice(0, 90))}</span>`;
  }
}

async function quitar(id) {
  try {
    const db = getFirestore(getApp());
    await deleteDoc(doc(db, "inversores", _user.email, "cartera", id));
    await leerTodo();
    pintar();
  } catch (e) {}
}

export async function initMiCartera(user, el) {
  if (!user || !el) return;
  _user = user; _el = el;
  asegurarEstilo();
  if (!user.emailVerified) {
    // sin verificar, las reglas de Firestore bloquean la cartera del usuario
    el.innerHTML = `<div class="portal-title">Mi cartera</div>
      <div class="mc-empty"><h4>Verificá tu email para activar Mi Cartera</h4>
      <p>Te mandamos un mail de verificación a <b>${esc(user.email)}</b>. Abrilo, tocá el link
      y recargá la página — tus posiciones y el plan de Disciplina se activan al instante.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="portal-title">Mi cartera</div><p style="color:var(--sub);font-size:14px">Cargando tus posiciones…</p>`;
  try {
    await Promise.all([leerTodo(), cargarFx()]);
    pintar();
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
        try { await Promise.all([leerTodo(), cargarFx()]); pintar(); } catch (e) {}
      }, 120000);
    }
  } catch (e) {
    el.innerHTML = `<div class="portal-title">Mi cartera</div>
      <p style="color:var(--sub);font-size:14px">No pudimos cargar tu cartera (${esc(String(e).slice(0, 120))}).</p>`;
  }
}
