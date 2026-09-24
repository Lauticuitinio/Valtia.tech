// node scripts/test-modal.mjs — el modal de alta de Mi cartera: cómo se resuelve
// el símbolo contra el catálogo (resolverSimbolo), las sugerencias al escribir,
// la validación de Guardar, los números con coma y el broker.
// mi-cartera.js importa Firebase desde gstatic: stub-firebase.mjs lo reemplaza
// por un módulo vacío, así que acá no se toca Firestore.
import { register } from "node:module";
register("./stub-firebase.mjs", import.meta.url);

const M = await import("../mi-cartera.js");
const C = await import("../catalogo-activos.js");

let mal = 0, n = 0;
function ok(nombre, cond, detalle) {
  n++;
  if (!cond) { mal++; console.log(`FALLA ${nombre}: ${JSON.stringify(detalle)}`); }
}
const cerca = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

// ── el catálogo: variantes de las acciones por clase (BRK-B ↔ BRK.B ↔ BRKB) ──
ok("catálogo: BRK-B en ext es BRK.B", (C.buscarCatalogo("BRK-B", "ext") || {}).s === "BRK.B");
ok("catálogo: BRK-B en byma es el CEDEAR BRKB", (C.buscarCatalogo("BRK-B", "byma") || {}).s === "BRKB");
ok("catálogo: BRK.B en byma es BRKB", (C.buscarCatalogo("BRK.B", "byma") || {}).s === "BRKB");
ok("catálogo: BRKB en ext es BRK.B", (C.buscarCatalogo("BRKB", "ext") || {}).s === "BRK.B");
ok("catálogo: BF-B en ext es BF.B", (C.buscarCatalogo("BF-B", "ext") || {}).s === "BF.B");
ok("catálogo: sin mercado, BYMA antes que ext (BRK-B)", (C.buscarCatalogo("BRK-B") || {}).m === "byma");
ok("catálogo: NVDA está en byma y ext", C.entradasCatalogo("NVDA").map(e => e.m).join(",") === "byma,ext");
ok("catálogo: NVDA-USD no está en cripto", C.buscarCatalogo("NVDA-USD", "cripto") === null);
ok("catálogo: NVDA-USD sí es NVDA en byma", (C.buscarCatalogo("NVDA-USD", "byma") || {}).t === "cedear");
ok("catálogo: BTC solo cripto", C.entradasCatalogo("BTC").map(e => e.m).join(",") === "cripto");
ok("catálogo: AL30 solo byma, bono", C.entradasCatalogo("AL30").map(e => e.m + "/" + e.t).join(",") === "byma/bono");
ok("catálogo: GGAL.BA -> GGAL", (C.buscarCatalogo("GGAL.BA", "byma") || {}).t === "accion_ar");
// BA.C es el CEDEAR de Bank of America (mismo papel que BAC en EE.UU.): la
// escritura exacta gana en su mercado, y en BYMA "BAC" encuentra el CEDEAR
ok("catálogo: BAC en ext es BAC, exacto", (C.buscarCatalogo("BAC", "ext") || {}).s === "BAC");
ok("catálogo: BAC en byma es el CEDEAR BA.C", (C.buscarCatalogo("BAC", "byma") || {}).s === "BA.C");
ok("catálogo: NVDA en byma es NVDA, no otra escritura", (C.buscarCatalogo("NVDA", "byma") || {}).s === "NVDA");
ok("catálogo: GGAL no inventa GGA.L", C.entradasCatalogo("GGAL").every(e => e.s === "GGAL"));
ok("catálogo: ZZZZ no está", C.buscarCatalogo("ZZZZ") === null && C.entradasCatalogo("ZZZZ").length === 0);
ok("catálogo: variantes de BRK-B", C.variantesClase("BRK-B").join(" ") === "BRK-B BRK.B BRK-B BRKB");
ok("catálogo: variantes de GGAL no rompen nada", C.variantesClase("GGAL")[0] === "GGAL");

// ── resolverSimbolo: pura, con un catálogo de prueba ──
const MINI = [
  { s: "NVDA", n: "Nvidia Corporation", t: "cedear", m: "byma" },
  { s: "NVDA", n: "Nvidia", t: "accion_us", m: "ext" },
  { s: "IBIT", n: "ISHARES BITCOIN TRUST", t: "cedear", m: "byma" },
  { s: "IBIT", n: "iShares Bitcoin Trust ETF", t: "etf", m: "ext" },
  { s: "BTC", n: "Bitcoin", t: "cripto", m: "cripto" },
  { s: "AL30", n: "Bonar 2030 (AL30)", t: "bono", m: "byma" },
  { s: "KO", n: "The Coca Cola Company", t: "cedear", m: "byma" },
  { s: "KO", n: "Coca-Cola Company (The)", t: "accion_us", m: "ext" },
  { s: "GGAL", n: "Grupo Financiero Galicia", t: "accion_ar", m: "byma" },
  { s: "GGAL", n: "Grupo Galicia", t: "accion_us", m: "ext" },
  { s: "GT", n: "Goodyear", t: "cedear", m: "byma" },
  { s: "GT", n: "GateToken", t: "cripto", m: "cripto" },
  { s: "MSFT", n: "Microsoft", t: "accion_us", m: "ext" },
];
// como buscarCatalogo: recibe el símbolo tal cual se tipeó y saca el sufijo de mercado (claveCatalogo)
const clave = s => String(s || "").trim().toUpperCase().replace(/\.BA$/, "").replace(/-USD$/, "");
const buscar = (s, m) => MINI.find(e => e.s === clave(s) && e.m === m) || null;
const bonos = new Set(["AL30", "AL30D", "GD30"]);

let r = M.resolverSimbolo("nvda", "cripto", buscar);
ok("NVDA en Cripto: choque con el texto de Lauti", r.choque === "NVDA no es una cripto: es un CEDEAR en BYMA y una acción en EE.UU.", r);
ok("NVDA en Cripto: no está ahí, sí en byma y ext", r.enCatalogo === false && r.mercadosPosibles.join(",") === "byma,ext", r);
ok("NVDA en Cripto: el ticker que NO se guarda", r.tk === "NVDA-USD", r);
ok("NVDA en Cripto: dos botones", r.sugerencias.map(s => s.txt).join(" | ") === "Cargarlo en BYMA (NVDA.BA) | Cargarlo en Exterior (NVDA)", r);
ok("NVDA en Cripto: no cambia solo (dos mercados posibles)", r.cambiarA === null, r);
ok("NVDA en Cripto: el nombre sale igual", r.nombre === "Nvidia Corporation", r);

r = M.resolverSimbolo("NVDA", "byma", buscar);
ok("NVDA en BYMA: en catálogo, sin choque", r.enCatalogo === true && r.choque === "" && r.tk === "NVDA.BA", r);
ok("NVDA en BYMA: informa cuál es cuál", r.aviso === "En BYMA es el CEDEAR (NVDA.BA); en EE.UU., la acción (NVDA).", r);
ok("NVDA en BYMA: la sugerencia es el exterior", r.sugerencias.length === 1 && r.sugerencias[0].mercado === "ext", r);

r = M.resolverSimbolo("IBIT", "cripto", buscar);
ok("IBIT en Cripto: choque", r.choque === "IBIT no es una cripto: es un CEDEAR en BYMA y un ETF en EE.UU.", r);

r = M.resolverSimbolo("BTC", "byma", buscar);
ok("BTC en BYMA: choque", r.choque === "BTC es una cripto: en BYMA no existe.", r);
ok("BTC en BYMA: cambia solo a cripto", r.cambiarA === "cripto" && r.sugerencias[0].tk === "BTC-USD", r);
r = M.resolverSimbolo("BTC", "ext", buscar);
ok("BTC en Exterior: choque", r.choque === "BTC es una cripto: en EE.UU. no existe.", r);
r = M.resolverSimbolo("BTC", "cripto", buscar);
ok("BTC en Cripto: bien", r.enCatalogo === true && r.choque === "" && r.tk === "BTC-USD" && r.aviso === "", r);

r = M.resolverSimbolo("AL30", "ext", buscar, bonos);
ok("AL30 en Exterior: choque (la renta fija es de BYMA)", r.choque === "AL30 es un bono en BYMA: en EE.UU. no existe." && r.cambiarA === "byma", r);
r = M.resolverSimbolo("AL30", "cripto", buscar, bonos);
ok("AL30 en Cripto: choque", r.choque === "AL30 no es una cripto: es un bono en BYMA.", r);
r = M.resolverSimbolo("AL30", "byma", buscar, bonos);
ok("AL30 en BYMA: sin sufijo, sin choque", r.tk === "AL30" && r.enCatalogo === true && r.choque === "", r);
r = M.resolverSimbolo("AL30.BA", "byma", buscar, bonos);
ok("AL30.BA tipeado: se limpia", r.tk === "AL30", r);

r = M.resolverSimbolo("KO", "ext", buscar);
ok("KO en Exterior: sin choque, informa", r.choque === "" && r.enCatalogo === true && r.aviso === "En EE.UU. es la acción (KO); en BYMA, el CEDEAR (KO.BA).", r);

r = M.resolverSimbolo("MSFT", "byma", buscar);
ok("MSFT solo en ext, elegido BYMA: no bloquea, avisa", r.choque === "" && r.enCatalogo === false, r);
ok("MSFT en BYMA: el aviso dice que se guarda igual", r.aviso === "MSFT es una acción en EE.UU.; en BYMA no lo tenemos en la lista. Si lo compraste ahí, se guarda igual como MSFT.BA.", r);
ok("MSFT en BYMA: cambia solo a ext", r.cambiarA === "ext", r);
r = M.resolverSimbolo("MSFT", "cripto", buscar);
ok("MSFT en Cripto: choque", r.choque === "MSFT no es una cripto: es una acción en EE.UU." && r.cambiarA === "ext", r);

r = M.resolverSimbolo("GT", "ext", buscar);
ok("GT (CEDEAR y cripto) en Exterior: no bloquea", r.choque === "" && r.sugerencias.length === 2, r);
r = M.resolverSimbolo("GT", "cripto", buscar);
ok("GT en Cripto: es una cripto, bien", r.enCatalogo === true && r.choque === "", r);

r = M.resolverSimbolo("ZZZZ", "byma", buscar);
ok("ZZZZ: no está, se guarda igual", r.enCatalogo === false && r.choque === "" && r.tk === "ZZZZ.BA", r);
ok("ZZZZ: el aviso", r.aviso === "No está en nuestro catálogo: se guarda igual, revisá que esté escrito como en tu broker.", r);
ok("ZZZZ: sin sugerencias ni cambio", r.sugerencias.length === 0 && r.cambiarA === null && r.nombre === "", r);

r = M.resolverSimbolo("NVDA", "cripto", null);
ok("sin catálogo (todavía no cargó): no afirma nada", r.enCatalogo === null && r.choque === "" && r.aviso === "" && r.tk === "NVDA-USD", r);
r = M.resolverSimbolo("", "byma", buscar);
ok("vacío: nada", r.tk === "" && r.enCatalogo === null && r.mercadosPosibles.length === 0, r);
r = M.resolverSimbolo("nvda", "otro", buscar);
ok("mercado desconocido: BYMA", r.tk === "NVDA.BA", r);
r = M.resolverSimbolo("ggal", "byma", buscar);
ok("minúsculas: GGAL.BA con nombre", r.tk === "GGAL.BA" && r.nombre === "Grupo Financiero Galicia", r);

// ── la escritura con la que se guarda (escrituraEn): sin el sufijo de otro
//    mercado, la del catálogo en las acciones por clase, con guion en el exterior ──
ok("escrituraEn: NVDA.BA en cripto es NVDA", M.escrituraEn("NVDA.BA", "cripto", null) === "NVDA");
ok("escrituraEn: NVDA-USD en byma es NVDA", M.escrituraEn("nvda-usd", "byma", null) === "NVDA");
ok("escrituraEn: NVDA.BA en byma queda", M.escrituraEn("NVDA.BA", "byma", null) === "NVDA.BA");
ok("escrituraEn: BTC-USD en cripto queda", M.escrituraEn("BTC-USD", "cripto", null) === "BTC-USD");
ok("escrituraEn: BRK.B en ext es BRK-B (yfinance)", M.escrituraEn("BRK.B", "ext", { s: "BRK.B", m: "ext" }) === "BRK-B");
ok("escrituraEn: BRKB en ext es BRK-B", M.escrituraEn("BRKB", "ext", { s: "BRK.B", m: "ext" }) === "BRK-B");
ok("escrituraEn: BRK-B en byma es BRKB (el CEDEAR)", M.escrituraEn("BRK-B", "byma", { s: "BRKB", m: "byma" }) === "BRKB");
ok("escrituraEn: sin entrada, lo tipeado", M.escrituraEn("ZZZZ", "byma", null) === "ZZZZ");
r = M.resolverSimbolo("NVDA.BA", "cripto", buscar);
ok("NVDA.BA tipeado en Cripto: choque y los botones sin el .BA", r.choque !== "" && r.tk === "NVDA-USD"
   && r.sugerencias.map(s => s.txt).join(" | ") === "Cargarlo en BYMA (NVDA.BA) | Cargarlo en Exterior (NVDA)", r);
r = M.resolverSimbolo("NVDA-USD", "byma", buscar);
ok("NVDA-USD tipeado en BYMA: se guarda como NVDA.BA", r.tk === "NVDA.BA" && r.simbolo === "NVDA" && r.enCatalogo === true, r);
ok("NVDA-USD en BYMA: el aviso con los tickers limpios", r.aviso === "En BYMA es el CEDEAR (NVDA.BA); en EE.UU., la acción (NVDA).", r);
r = M.resolverSimbolo("NVDA-USD", "cripto", buscar);
ok("NVDA-USD tipeado en Cripto (el caso de Lauti): botones limpios", r.choque !== ""
   && r.sugerencias.map(s => s.tk).join(",") === "NVDA.BA,NVDA", r);
r = M.resolverSimbolo("ggal.ba", "ext", buscar);
ok("ggal.ba tipeado con Exterior: el ADR GGAL, no GGAL.BA en dólares", r.tk === "GGAL" && r.simbolo === "GGAL", r);
r = M.resolverSimbolo("NVDA-USD", "byma", null);
ok("sin catálogo, NVDA-USD en BYMA igual se limpia", r.tk === "NVDA.BA" && r.simbolo === "NVDA", r);
r = M.resolverSimbolo("NVDA", "byma", buscar);
ok("sin cambio de escritura, simbolo = lo tipeado", r.simbolo === "NVDA", r);

// con el catálogo de verdad
r = M.resolverSimbolo("BRK.B", "ext", C.buscarCatalogo);
ok("catálogo real: BRK.B tipeado en ext se guarda BRK-B", r.tk === "BRK-B" && r.simbolo === "BRK-B" && r.enCatalogo === true, r);
r = M.resolverSimbolo("BRKB", "ext", C.buscarCatalogo);
ok("catálogo real: BRKB tipeado en ext se guarda BRK-B", r.tk === "BRK-B", r);
r = M.resolverSimbolo("BRK-B", "byma", C.buscarCatalogo);
ok("catálogo real: BRK-B en BYMA es el CEDEAR BRKB.BA", r.tk === "BRKB.BA" && r.enCatalogo === true, r);
ok("catálogo real: ...y su sugerencia del exterior es BRK-B", r.sugerencias.map(s => s.tk).join(",") === "BRK-B", r);
r = M.resolverSimbolo("BRK.B", "cripto", C.buscarCatalogo);
ok("catálogo real: BRK.B en Cripto choca con botones bien escritos", r.choque !== "" && r.sugerencias.map(s => s.tk).join(",") === "BRKB.BA,BRK-B", r);
r = M.resolverSimbolo("AL30.BA", "byma", C.buscarCatalogo, bonos);
ok("catálogo real: AL30.BA en BYMA es AL30", r.tk === "AL30" && r.enCatalogo === true, r);
r = M.resolverSimbolo("NVDA", "cripto", C.buscarCatalogo);
ok("catálogo real: NVDA en Cripto choca", r.choque.startsWith("NVDA no es una cripto"), r);
r = M.resolverSimbolo("BRK-B", "ext", C.buscarCatalogo);
ok("catálogo real: BRK-B en ext (como en la cartera de Lauti)", r.enCatalogo === true && r.tk === "BRK-B" && r.nombre === "Berkshire Hathaway", r);
r = M.resolverSimbolo("NFLX", "ext", C.buscarCatalogo);
ok("catálogo real: NFLX en ext", r.enCatalogo === true && r.choque === "", r);
r = M.resolverSimbolo("ETH", "byma", C.buscarCatalogo);
ok("catálogo real: ETH en BYMA choca y propone cripto", r.choque !== "" && r.sugerencias[0].tk === "ETH-USD", r);

// ── sugerencias al escribir ──
let s = M.sugerirCatalogo("NVD", MINI);
ok("sugerir: prefijo del símbolo, byma antes que ext", s.map(e => e.s + "@" + e.m).join(",") === "NVDA@byma,NVDA@ext", s);
s = M.sugerirCatalogo("galicia", MINI);
ok("sugerir: por nombre", s.map(e => e.s).join(",") === "GGAL,GGAL", s);
s = M.sugerirCatalogo("K", MINI);
ok("sugerir: una letra busca solo por símbolo", s.map(e => e.s).join(",") === "KO,KO", s);
s = M.sugerirCatalogo("btc-usd", MINI);
ok("sugerir: con -USD también", s.length === 1 && s[0].s === "BTC", s);
s = M.sugerirCatalogo("", MINI);
ok("sugerir: vacío no sugiere", s.length === 0, s);
s = M.sugerirCatalogo("A", C.CATALOGO);
ok("sugerir: a lo sumo 8", s.length === 8, s.length);
ok("sugerir: el exacto primero", s[0].s === "A", s.map(e => e.s));
s = M.sugerirCatalogo("brk-b", C.CATALOGO);
ok("sugerir: BRK-B encuentra BRKB y BRK.B", s.map(e => e.s).sort().join(",") === "BRK.B,BRKB", s.map(e => e.s));
s = M.sugerirCatalogo("bitcoin", C.CATALOGO, 8);
ok("sugerir: 'bitcoin' trae BTC e IBIT", s.some(e => e.s === "BTC") && s.some(e => e.s === "IBIT"), s.map(e => e.s));
s = M.sugerirCatalogo("galicia", C.CATALOGO);
ok("sugerir: acentos no importan (Galicia)", s.some(e => e.s === "GGAL"), s.map(e => e.s));

// ── números con coma (parseNum es lo que leen cantidad y precio) ──
ok("parseNum 0,3923", cerca(M.parseNum("0,3923"), 0.3923));
ok("parseNum 1.234,5", cerca(M.parseNum("1.234,5"), 1234.5));
ok("parseNum 1900.50", cerca(M.parseNum("1900.50"), 1900.5));
ok("parseNum 1.900", cerca(M.parseNum("1.900"), 1900));
ok("parseNum 0.125", cerca(M.parseNum("0.125"), 0.125));
ok("parseNum vacío es NaN", Number.isNaN(M.parseNum("")));
ok("parseNum abc es NaN", Number.isNaN(M.parseNum("abc")));
ok("parseNum -5", M.parseNum("-5") === -5);

// ── validarCompras: qué falta para guardar, en orden ──
const fila = (cantTxt, pxTxt, fecha = "2026-09-23") => ({ fila: null, fecha, cantTxt, pxTxt });
let v = M.validarCompras("", "", [fila("10", "100")]);
ok("falta el símbolo primero", v.campo === "simbolo" && /símbolo/.test(v.error), v);
v = M.validarCompras("$$$", "", [fila("10", "100")]);
ok("un símbolo sin letras ni números no se guarda (antes daba ticker vacío)", v.campo === "simbolo" && /no se entiende/.test(v.error), v);
v = M.validarCompras(".", "", [fila("10", "100")]);
ok("un punto solo tampoco", v.campo === "simbolo", v);
v = M.validarCompras("NVDA", "NVDA no es una cripto: es un CEDEAR en BYMA y una acción en EE.UU.", [fila("10", "100")]);
ok("el choque no se guarda", v.campo === "mercado" && v.error.startsWith("NVDA no es una cripto"), v);
v = M.validarCompras("NVDA", "", [fila("", "")]);
ok("falta la cantidad", v.campo === "cant" && v.i === 0 && /cantidad/.test(v.error), v);
v = M.validarCompras("NVDA", "", [fila("0", "100")]);
ok("cantidad 0", v.campo === "cant" && /0/.test(v.error), v);
v = M.validarCompras("NVDA", "", [fila("-3", "100")]);
ok("cantidad negativa: las ventas van por Vendí", v.campo === "cant" && /Vendí/.test(v.error), v);
v = M.validarCompras("NVDA", "", [fila("abc", "100")]);
ok("cantidad ilegible", v.campo === "cant", v);
v = M.validarCompras("NVDA", "", [fila("10", "abc")]);
ok("precio inválido", v.campo === "px" && /precio/i.test(v.error), v);
v = M.validarCompras("NVDA", "", [fila("10", "-1")]);
ok("precio negativo", v.campo === "px", v);
v = M.validarCompras("NVDA", "", [fila("0,3923", "1.234,56")]);
ok("con coma: guarda 0,3923 a 1234,56", !v.error && v.compras.length === 1 && cerca(v.compras[0].cant, 0.3923) && cerca(v.compras[0].px, 1234.56), v);
v = M.validarCompras("NVDA", "", [fila("10", "")]);
ok("sin precio se guarda con 0", !v.error && v.compras[0].px === 0, v);
v = M.validarCompras("NVDA", "", [fila("10", "100"), fila("", "")]);
ok("el renglón vacío de más se ignora", !v.error && v.compras.length === 1, v);
v = M.validarCompras("NVDA", "", [fila("", ""), fila("5", "100")]);
ok("el primero vacío y el segundo con datos: entra el segundo", !v.error && v.compras.length === 1 && v.compras[0].cant === 5, v);
v = M.validarCompras("NVDA", "", [fila("10", "100"), fila("", "50")]);
ok("precio sin cantidad en el segundo renglón: apunta ahí", v.campo === "cant" && v.i === 1, v);
v = M.validarCompras("NVDA", "", [fila("1", "2", ""), fila("3", "4")]);
ok("dos compras, la fecha vacía queda vacía", !v.error && v.compras.length === 2 && v.compras[0].fecha === "", v);

// ── el broker: un <select> con la lista entera ──
let h = M.brokerSelectHTML("mc-broker", "IOL");
ok("broker: IOL elegido", /<option value="IOL" selected>IOL<\/option>/.test(h), h);
ok("broker: la lista entera está", ["PPI", "Balanz", "Cocos", "Binance", "Interactive Brokers", "Schwab"].every(b => h.includes(`value="${b}"`)), h);
ok("broker: Otro…", /<option value="Otro">Otro…<\/option>/.test(h), h);
ok("broker: el id se conserva", /<select id="mc-broker">/.test(h) && /id="mc-broker-otro"/.test(h), h);
h = M.brokerSelectHTML("mc-broker", "Mi banco");
ok("broker: la preferencia que no está en la lista va elegida igual", /<option value="Mi banco" selected>Mi banco<\/option>/.test(h), h);
ok("broker: ...y IOL no queda elegido", !/value="IOL" selected/.test(h), h);
h = M.brokerSelectHTML("mc-imp-broker", "");
ok("broker: sin preferencia pide elegir", /<option value="" selected>Elegí tu broker<\/option>/.test(h) && !/value="IOL" selected/.test(h), h);
ok("broker: nada de datalist", !/datalist|list=/.test(h), h);

// ── "Avisarme si…": lo que la fila le ofrece a la alerta de precio (datosAlerta) ──
// el umbral va en la moneda y la unidad en que COTIZA el activo: px.precio y px.moneda tal cual
const AVISO_CUPON = "Ojo: el día que un bono paga cupón o amortiza, el precio baja; una alerta de baja puede saltar por eso.";
const AVISO_CRIPTO = "Las cripto cotizan todo el día, pero acá el precio se actualiza en horario de rueda: la alerta puede saltar con demora.";
const AVISO_CEDEAR = "Es el precio en pesos: adentro está también lo que se mueva el dólar.";
let da = M.datosAlerta({ ticker: "GGAL.BA", px: { precio: 4000, moneda: "ARS" } }, { bonos });
ok("alerta: GGAL.BA se puede", da.puede && da.ticker === "GGAL.BA" && da.moneda === "ARS" && da.precio === 4000, da);
ok("alerta: GGAL.BA en pesos, por unidad", da.unidad === "en pesos ($), por unidad" && da.factor === 1, da);
ok("alerta: precarga 5 % arriba y abajo", da.precarga.sube === 4200 && da.precarga.baja === 3800, da.precarga);
ok("alerta: una acción argentina no lleva notas", da.notas.length === 0, da.notas);
da = M.datosAlerta({ ticker: "NVDA.BA", px: { precio: 12000, moneda: "ARS" } }, { bonos });
ok("alerta: CEDEAR en pesos avisa del dólar", da.puede && da.notas.length === 1 && da.notas[0] === AVISO_CEDEAR, da.notas);
da = M.datosAlerta({ ticker: "NVDA", px: { precio: 180, moneda: "USD" } }, { bonos });
ok("alerta: NVDA en dólares, por unidad y sin notas", da.unidad === "en dólares (US$), por unidad" && da.notas.length === 0, da);
da = M.datosAlerta({ ticker: "AL30D", px: { precio: 61.2, moneda: "USD" } }, { bonos });
ok("alerta: bono sin factor en ningún lado cotiza cada 100 VN", da.puede && da.factor === 0.01 && da.unidad === "en dólares (US$), cada 100 VN", da);
ok("alerta: bono avisa del cupón", da.notas.length === 1 && da.notas[0] === AVISO_CUPON, da.notas);
ok("alerta: bono, el precio NO se multiplica por el factor", da.precio === 61.2 && cerca(da.precarga.sube, 64.26), da);
da = M.datosAlerta({ ticker: "AL30", factor: 0.01, px: { precio: 85000, moneda: "ARS", factor: 0.01 } }, { bonos });
ok("alerta: bono en pesos cada 100 VN", da.unidad === "en pesos ($), cada 100 VN" && da.precarga.sube === 89250, da);
da = M.datosAlerta({ ticker: "BTC-USD", px: { precio: 60000, moneda: "USD" } }, { bonos });
ok("alerta: cripto avisa de la demora", da.puede && da.notas[0] === AVISO_CRIPTO, da.notas);
da = M.datosAlerta({ ticker: "ZZZZ.BA", px: { sinDatos: true, precio: 100, moneda: "ARS" } }, { bonos });
ok("alerta: sinDatos no se puede y dice por qué", !da.puede && /Todavía no tenemos el precio/.test(da.motivo) && da.precarga.sube === null, da);
ok("alerta: sin precio no se puede", !M.datosAlerta({ ticker: "KO", px: { moneda: "USD" } }).puede);
ok("alerta: sin doc de precio no se puede", !M.datosAlerta({ ticker: "KO" }).puede);
ok("alerta: precio cero no se puede", !M.datosAlerta({ ticker: "KO", px: { precio: 0, moneda: "USD" } }).puede);
ok("alerta: otra moneda no se puede", !M.datosAlerta({ ticker: "SAN.MC", px: { precio: 5, moneda: "EUR" } }).puede);
ok("alerta: sin moneda no se puede (no se adivina)", !M.datosAlerta({ ticker: "KO", px: { precio: 60 } }).puede);
ok("alerta: sin ticker no se puede", !M.datosAlerta({ px: { precio: 60, moneda: "USD" } }).puede && !M.datosAlerta(null).puede);

// ── los errores de crearAlerta() en palabras del usuario (motivoAlerta) ──
// los de validarAlerta()/crearAlerta() ya vienen en voseo y pasan tal cual; nada más pasa crudo
const A = await import("../alertas-precio.js?v=1");
const errDe = campos => new Error(A.validarAlerta(campos).error);
ok("alerta: el umbral inválido pasa tal cual", M.motivoAlerta(errDe({ ticker: "GGAL.BA", condicion: "sube", umbral: 0, moneda: "ARS" })) === "Poné un precio mayor a cero para el aviso.");
ok("alerta: la moneda que no sirve pasa tal cual", /^La alerta necesita la moneda/.test(M.motivoAlerta(errDe({ ticker: "GGAL.BA", condicion: "sube", umbral: 5, moneda: "EUR" }))));
ok("alerta: el ticker largo pasa tal cual", /^Ese ticker no sirve/.test(M.motivoAlerta(errDe({ ticker: "UNTICKERDEMASLARGO", condicion: "sube", umbral: 5, moneda: "USD" }))));
ok("alerta: el duplicado pasa tal cual", M.motivoAlerta(new Error("Ya tenés esa misma alerta activa para GGAL.")) === "Ya tenés esa misma alerta activa para GGAL.");
ok("alerta: sin sesión pasa tal cual", M.motivoAlerta(new Error("Entrá a tu cuenta para crear una alerta.")) === "Entrá a tu cuenta para crear una alerta.");
const PERMISO = "No pudimos guardar la alerta: el servidor la rechazó. Recargá la página y probá de nuevo.";
ok("alerta: el permiso que reescribe el módulo", M.motivoAlerta(new Error("Firestore no dejó guardar la alerta: las alertas necesitan el mail verificado.")) === PERMISO);
ok("alerta: permission-denied de Firestore", M.motivoAlerta(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })) === PERMISO);
ok("alerta: el permiso no culpa a una regla sin publicar (ya está publicada)", !/regla|publicar/i.test(PERMISO));
const RED = "No se pudo crear la alerta: probá de nuevo en un momento.";
ok("alerta: error de red con code", M.motivoAlerta(Object.assign(new Error("Failed to get documents from server."), { code: "unavailable" })) === RED);
ok("alerta: un error técnico en inglés no se muestra crudo", M.motivoAlerta(new TypeError("Cannot read properties of undefined (reading 'x')")) === RED);
ok("alerta: sin error ni mensaje", M.motivoAlerta(null) === RED && M.motivoAlerta(undefined) === RED && M.motivoAlerta(new Error("")) === RED);
ok("alerta: con code no pasa aunque empiece en voseo", M.motivoAlerta(Object.assign(new Error("Poné un precio"), { code: "unavailable" })) === RED);

// ── lo de siempre sigue exportado ──
ok("exports: normalizarTicker", M.normalizarTicker("nvda", "byma") === "NVDA.BA" && M.normalizarTicker("btc", "cripto") === "BTC-USD");
ok("exports: parseNum, agruparPorActivo, escrituraEn", ["parseNum", "agruparPorActivo", "escrituraEn", "sugerirCatalogo", "validarCompras", "resolverSimbolo", "brokerSelectHTML"].every(f => typeof M[f] === "function"));
ok("exports: monedaMercado", M.monedaMercado("byma", "GGAL.BA") === "ARS" && M.monedaMercado("ext", "NVDA") === "USD" && M.monedaMercado("byma", "AL30D", bonos) === "USD");
["renderMiCartera", "calcular", "parseImport", "abrirFormulario", "abrirFila", "initMiCartera", "reiniciarMiCartera",
 "evolucionComparada", "completarPreciosDeRentaFija", "agruparPorActivo", "agruparPorBroker", "convertir", "monedaPosicion"].forEach(f =>
  ok(`exports: ${f}`, typeof M[f] === "function"));

console.log(mal ? `${mal} fallas de ${n}` : `OK ${n} casos`);
process.exit(mal ? 1 : 0);
