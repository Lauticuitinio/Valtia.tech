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
.mc-wrap{max-width:1180px}
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
`;

const money = (n, cur) => (Number(n) < 0 ? "−" : "") + (cur === "ARS" ? "$" : "US$") +
  Math.abs(Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0 });
// con signo explícito (para resultados): +US$930 / −US$160
const moneyS = (n, cur) => (Number(n) >= 0 ? "+" : "") + money(n, cur);
const pct = n => (n >= 0 ? "+" : "") + Number(n).toFixed(2).replace(".", ",") + "%";
const num = (n, d = 1) => n == null ? "—" : Number(n).toFixed(d).replace(".", ",");
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const verCls = v => v === "Infravalorada" ? "infra" : v === "Estirada" ? "cara"
                  : v === "En precio" ? "precio" : "sin";

/* ── cálculo: posiciones + precios → filas con resultado ── */
export function calcular(posiciones, precios) {
  const filas = posiciones.map(p => {
    const px = precios[String(p.ticker).toUpperCase()] || null;
    const actual = px && px.precio != null ? px.precio : null;
    const costo = (Number(p.cantidad) || 0) * (Number(p.precioCompra) || 0);
    const valor = actual != null ? (Number(p.cantidad) || 0) * actual : null;
    const pl = valor != null ? valor - costo : null;
    const plPct = (pl != null && costo > 0) ? pl / costo * 100 : null;
    return { ...p, px, actual, costo, valor, pl, plPct,
             moneda: (px && px.moneda) || p.moneda || "USD" };
  });
  const total = filas.reduce((s, f) => s + (f.valor ?? 0), 0);
  const costoTot = filas.reduce((s, f) => s + (f.valor != null ? f.costo : 0), 0);
  const plTot = total - costoTot;
  filas.forEach(f => { f.peso = total > 0 && f.valor != null ? f.valor / total * 100 : null; });
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
  const sobrev = conVer.filter(f => f.px.rsi != null && f.px.rsi > 70).map(f => f.ticker);
  const sobrec = conVer.filter(f => f.px.rsi != null && f.px.rsi < 30).map(f => f.ticker);
  let extra = "";
  if (sobrev.length) extra += ` ${sobrev.join(", ")} viene${sobrev.length > 1 ? "n" : ""} sobrecomprado${sobrev.length > 1 ? "s" : ""} (RSI &gt; 70).`;
  if (sobrec.length) extra += ` ${sobrec.join(", ")} está${sobrec.length > 1 ? "n" : ""} sobrevendido${sobrec.length > 1 ? "s" : ""} (RSI &lt; 30).`;
  if (!partes.length && !extra) return "";
  return `<div class="mc-lect">Lectura Valtia: ${partes.join(" y ")}.${extra}</div>`;
}

let _orden = { col: "valor", desc: true };

/* ── render puro: se puede llamar con datos de prueba ── */
export function renderMiCartera(el, posiciones, precios, opts = {}) {
  const r = calcular(posiciones, precios);
  const cur = r.filas[0] ? r.filas[0].moneda : "USD";
  const cabecera = `
    <div class="mc-head"><div>
      <div class="portal-title" style="margin-bottom:0">Mi cartera</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Seguimiento de tus posiciones con la valuación de Valtia${opts.actualizado ? " · precios al " + esc(opts.actualizado) : ""}</div>
    </div></div>`;

  const form = `
    <div class="mc-form">
      <div class="row">
        <div><label>Ticker</label><input id="mc-ticker" placeholder="AAPL, BTC-USD, GGAL" maxlength="12" autocomplete="off"></div>
        <div><label>Cantidad</label><input id="mc-cant" type="number" step="any" min="0" placeholder="10"></div>
        <div><label>Precio de compra</label><input id="mc-precio" type="number" step="any" min="0" placeholder="180,50"></div>
        <div><label>Fecha (opcional)</label><input id="mc-fecha" type="date"></div>
        <div><button class="mc-btn" id="mc-add">Agregar posición</button></div>
      </div>
      <div class="mc-msg" id="mc-msg"></div>
    </div>`;

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
      <td class="l"><span class="mc-tk">${esc(f.ticker)}</span><span class="mc-nm">${esc(px.nombre || "")}</span></td>
      <td>${num(f.cantidad, 4).replace(/,0+$/, "")}</td>
      <td>${money(f.precioCompra, f.moneda)}</td>
      <td>${f.actual != null ? money(f.actual, f.moneda) : "—"}</td>
      <td>${f.valor != null ? money(f.valor, f.moneda) : "—"}</td>
      <td class="${f.pl == null ? "mc-mut" : f.pl >= 0 ? "mc-pos" : "mc-neg"}">${f.pl == null ? "—" : moneyS(f.pl, f.moneda)}</td>
      <td class="${f.plPct == null ? "mc-mut" : f.plPct >= 0 ? "mc-pos" : "mc-neg"}" style="font-weight:600">${f.plPct == null ? "—" : pct(f.plPct)}</td>
      <td>${f.peso != null ? num(f.peso) + "%" : "—"}</td>
      <td>${num(px.per)}</td>
      <td>${num(px.rsi)}</td>
      <td class="l"><span class="mc-ver ${verCls(px.veredicto)}">${esc(px.veredicto || "Sin dato")}</span></td>
      <td><button class="mc-del" data-del="${esc(f.id)}" title="Quitar">✕</button></td>
    </tr>`;
  }).join("");

  el.innerHTML = `<div class="mc-wrap">
    ${cabecera}
    <div class="mc-kpis">
      <div class="mc-k"><div class="l">Valor actual</div><div class="v">${money(r.total, cur)}</div><div class="s">${r.filas.length} posicion${r.filas.length === 1 ? "" : "es"}</div></div>
      <div class="mc-k"><div class="l">Invertido</div><div class="v">${money(r.costoTot, cur)}</div><div class="s">a precio de compra</div></div>
      <div class="mc-k"><div class="l">Resultado</div><div class="v ${r.plTot >= 0 ? "mc-pos" : "mc-neg"}">${moneyS(r.plTot, cur)}</div><div class="s">ganancia / pérdida no realizada</div></div>
      <div class="mc-k"><div class="l">Rendimiento</div><div class="v ${(r.plTotPct || 0) >= 0 ? "mc-pos" : "mc-neg"}">${r.plTotPct == null ? "—" : pct(r.plTotPct)}</div><div class="s">sobre lo invertido</div></div>
    </div>
    ${form}
    <div class="mc-tblwrap"><table class="mc-tbl">
      <thead><tr>
        ${th("ticker", "Activo", "l")}${th("cantidad", "Cant.")}${th("precioCompra", "Compra")}
        ${th("actual", "Actual")}${th("valor", "Valor")}${th("pl", "Resultado")}${th("plPct", "%")}
        ${th("peso", "Peso")}<th>PER</th><th>RSI</th><th class="l">Lectura Valtia</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${lectura(r)}
    <div class="mc-foot">Los precios y ratios se actualizan una vez por día con el cierre de mercado; no son intradiarios.
      El resultado es sobre el precio de compra que cargaste. Esta información es de carácter general y no constituye
      asesoramiento financiero personalizado.</div>
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

function ultimaActualizacion() {
  const ts = Object.values(_precios).map(p => p.actualizado_utc).filter(Boolean);
  if (!ts.length) return "";
  try {
    const t = ts[0].seconds ? ts[0].seconds * 1000 : ts[0];
    return new Date(t).toLocaleDateString("es-AR");
  } catch (e) { return ""; }
}

function pintar() {
  renderMiCartera(_el, _pos, _precios, { actualizado: ultimaActualizacion(), onRerender: enganchar });
  enganchar();
}

function enganchar() {
  const add = _el.querySelector("#mc-add");
  if (add) add.onclick = agregar;
  _el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => quitar(b.dataset.del));
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
  if (!document.getElementById("mc-style")) {
    const st = document.createElement("style");
    st.id = "mc-style";
    st.textContent = STYLE;
    document.head.appendChild(st);
  }
  el.innerHTML = `<div class="portal-title">Mi cartera</div><p style="color:var(--sub);font-size:14px">Cargando tus posiciones…</p>`;
  try {
    await leerTodo();
    pintar();
  } catch (e) {
    el.innerHTML = `<div class="portal-title">Mi cartera</div>
      <p style="color:var(--sub);font-size:14px">No pudimos cargar tu cartera (${esc(String(e).slice(0, 120))}).</p>`;
  }
}
