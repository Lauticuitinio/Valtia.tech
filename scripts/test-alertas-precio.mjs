// node scripts/test-alertas-precio.mjs — verifica alertas-precio.js: la evaluación pura,
// la precarga del umbral, los textos, el cruce con firestore.rules y la puerta a la
// colección contra un Firestore de mentira. Sin red: alertas-precio.js importa
// Firebase por URL (gstatic) y acá esos imports se interceptan con
// module.registerHooks (Node ≥ 22.15) y se sirven desde un stub en memoria.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

let mal = 0, n = 0;
const cerca = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
function ok(nombre, cond, detalle) {
  n++;
  if (!cond) { mal++; console.log(`FALLA ${nombre}: ${JSON.stringify(detalle)}`); }
}

// ── Firestore de mentira ──
// docs: path → data. Registra lecturas (getDocs), escrituras y lotes; `denegar(op, path)`
// simula permission-denied (ya la disparó otro) y `fallar` un error de red.
class TS { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } toDate() { return new Date(this.ms); } }
const ST = { __serverTimestamp: true };   // el sentinel de serverTimestamp()
const FS = {
  docs: new Map(), lecturas: 0, escrituras: [], lotes: [], denegar: null, fallar: null, fallarLectura: null,
  todas: [],   // TODAS las escrituras de la corrida (nunca se resetea): para los invariantes del final
  ST, reloj: 0,
  // "el servidor" pone la hora: creciente, para que el orden por creada sea determinista
  resolver: d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === ST ? new TS(1758700000000 + (++FS.reloj)) : v])),
};
globalThis.__fsStub = FS;
const STUB_FIRESTORE = `
const FS = globalThis.__fsStub;
const camino = segs => segs.join('/');
const error = (code, msg) => Object.assign(new Error(msg), { code });
export const getFirestore = () => ({ stub: true });
export const collection = (db, ...segs) => ({ path: camino(segs) });
export const doc = (db, ...segs) => ({ path: camino(segs) });
export const serverTimestamp = () => FS.ST;
export async function getDocs(ref) {
  FS.lecturas++;
  if (FS.fallarLectura) throw FS.fallarLectura;
  const pre = ref.path + '/';
  const docs = [...FS.docs.entries()].filter(([p]) => p.startsWith(pre) && !p.slice(pre.length).includes('/'))
    .map(([p, d]) => ({ id: p.slice(pre.length), data: () => ({ ...d }) }));
  return { docs, size: docs.length, empty: !docs.length };
}
function escribir(op, ref, data) {
  FS.escrituras.push({ op, path: ref.path, data });
  FS.todas.push({ op, path: ref.path, data, antes: FS.docs.get(ref.path) });
  if (FS.fallar) throw FS.fallar;
  if (FS.denegar && FS.denegar(op, ref.path)) throw error('permission-denied', 'Missing or insufficient permissions.');
  if (op === 'set') FS.docs.set(ref.path, FS.resolver(data));
  else if (op === 'update') {
    if (!FS.docs.has(ref.path)) throw error('not-found', 'No document to update: ' + ref.path);
    const antes = FS.docs.get(ref.path);
    // las dos cláusulas de firestore.rules que más importan, imitadas acá:
    // se dispara UNA vez (resource.data.disparada == null) y una disparada no se
    // reanuda (resource.data.disparada == null || request.resource.data.activa == false)
    if (antes.disparada != null && (data.disparada !== undefined || data.activa === true)) throw error('permission-denied', 'Missing or insufficient permissions.');
    FS.docs.set(ref.path, { ...antes, ...FS.resolver(data) });
  } else if (op === 'delete') FS.docs.delete(ref.path);
}
export async function setDoc(ref, data) { escribir('set', ref, data); }
export async function updateDoc(ref, data) { escribir('update', ref, data); }
export async function deleteDoc(ref) { escribir('delete', ref); }
export function writeBatch() {
  const ops = [];
  return {
    set(ref, data) { ops.push(['set', ref, data]); return this; },
    update(ref, data) { ops.push(['update', ref, data]); return this; },
    delete(ref) { ops.push(['delete', ref]); return this; },
    async commit() { FS.lotes.push(ops.map(o => o[0])); ops.forEach(([op, ref, data]) => escribir(op, ref, data)); },
  };
}
`;
const GSTATIC = 'https://www.gstatic.com/firebasejs/';
// una SEGUNDA instancia del módulo, como si otro importador lo cargara con otro ?v=:
// mismo fuente servido bajo otro nombre (así no se duplica el warning del package.json)
const OTRA_INSTANCIA = 'valtia:alertas-precio-otro-v';
registerHooks({
  resolve(spec, ctx, next) { return spec.startsWith(GSTATIC) || spec === OTRA_INSTANCIA ? { url: spec, shortCircuit: true } : next(spec, ctx); },
  load(url, ctx, next) {
    if (url === OTRA_INSTANCIA) return { format: 'module', source: readFileSync(new URL('../alertas-precio.js', import.meta.url), 'utf8'), shortCircuit: true };
    if (!url.startsWith(GSTATIC)) return next(url, ctx);
    const source = url.endsWith('firebase-app.js') ? 'export const getApp = () => ({ stub: true });' : STUB_FIRESTORE;
    return { format: 'module', source, shortCircuit: true };
  },
});
const A = await import('../alertas-precio.js');
const path = (email, id) => `inversores/${email}/alertasPrecio/${id}`;
const al = (o = {}) => ({ ticker: 'GGAL.BA', condicion: 'sube', umbral: 4735, moneda: 'ARS', activa: true, disparada: null, ...o });

// ── evaluar (pura) ──
ok('sube: cruza por arriba', A.evaluar(al(), 4760));
ok('sube: por abajo no', !A.evaluar(al(), 4700));
ok('sube: la igualdad cuenta como cruce', A.evaluar(al(), 4735));
ok('baja: cruza por abajo', A.evaluar(al({ condicion: 'baja' }), 4700));
ok('baja: por arriba no', !A.evaluar(al({ condicion: 'baja' }), 4760));
ok('baja: la igualdad cuenta como cruce', A.evaluar(al({ condicion: 'baja' }), 4735));
ok('umbral 0 no dispara', !A.evaluar(al({ umbral: 0 }), 4760));
ok('umbral NaN no dispara', !A.evaluar(al({ umbral: NaN }), 4760));
ok('umbral negativo, Infinity o basura no dispara', !A.evaluar(al({ umbral: -5 }), 4760) && !A.evaluar(al({ umbral: Infinity }), 4760) && !A.evaluar(al({ umbral: 'x' }), 4760));
ok('precio 0 / NaN / null / Infinity / negativo no dispara',
   [0, NaN, null, undefined, Infinity, -1, ''].every(p => !A.evaluar(al({ condicion: 'baja' }), p)));
ok('pausada no dispara', !A.evaluar(al({ activa: false }), 4760));
ok('ya disparada no dispara (Date o Timestamp)', !A.evaluar(al({ disparada: new Date() }), 4760) && !A.evaluar(al({ disparada: new TS(1) }), 4760));
ok('condición desconocida no dispara', !A.evaluar(al({ condicion: 'igual' }), 4735));
ok('sin alerta: false', !A.evaluar(null, 4735) && !A.evaluar(undefined, 4735));
ok('precio como string con coma decimal (así lo escribe el modal)', A.evaluar(al(), '4.760,50') && A.evaluar(al({ umbral: '61,20', moneda: 'USD' }), 61.2));

// ── precargaUmbral: como se muestra el precio ──
ok('≥1000: entero (4735 → 4972 / 4498)', A.precargaUmbral(4735, 'sube') === 4972 && A.precargaUmbral(4735, 'baja') === 4498);
ok('≥100: un decimal (150 → 157,5 / 142,5)', A.precargaUmbral(150, 'sube') === 157.5 && A.precargaUmbral(150, 'baja') === 142.5);
ok('≥1: dos decimales (61,2 → 64,26 / 58,14)', A.precargaUmbral(61.2, 'sube') === 64.26 && A.precargaUmbral(61.2, 'baja') === 58.14);
ok('<1: cuatro cifras significativas (0,5 → 0,525 / 0,475)', A.precargaUmbral(0.5, 'sube') === 0.525 && A.precargaUmbral(0.5, 'baja') === 0.475);
ok('cripto chica 0,0123 → 0,01292 / 0,01168', A.precargaUmbral(0.0123, 'sube') === 0.01292 && A.precargaUmbral(0.0123, 'baja') === 0.01168);
ok('el rango se decide con el resultado (999,99 × 1,05 → 1050 entero; 99,99 × 1,05 → 105)', A.precargaUmbral(999.99, 'sube') === 1050 && A.precargaUmbral(99.99, 'sube') === 105);
ok('sin precio válido: null', A.precargaUmbral(NaN, 'sube') === null && A.precargaUmbral(0, 'baja') === null && A.precargaUmbral(null, 'sube') === null && A.precargaUmbral(-3, 'sube') === null);
ok('condición rara se toma como sube', A.precargaUmbral(100, 'x') === 105);
ok('redondearPrecio en los cuatro rangos', A.redondearPrecio(4971.75) === 4972 && A.redondearPrecio(157.46) === 157.5 && A.redondearPrecio(64.264) === 64.26 && A.redondearPrecio(0.012917) === 0.01292 && A.redondearPrecio(0) === 0 && A.redondearPrecio('x') === null);

// ── textos: fmt lo pasa quien llama, en la moneda de la alerta ──
const fmt = (v, m) => (m === 'ARS' ? '$' : 'US$') + Number(v).toLocaleString('es-AR', { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v < 1000 ? 2 : 0 });
ok('textoAlerta ARS', A.textoAlerta(al(), fmt) === 'Sube de $4.735', A.textoAlerta(al(), fmt));
ok('textoAlerta USD', A.textoAlerta(al({ condicion: 'baja', umbral: 61.2, moneda: 'USD' }), fmt) === 'Baja de US$61,20');
const visto = [];
A.textoAlerta(al({ umbral: 5, moneda: 'USD' }), (v, m) => { visto.push([v, m]); return ''; });
ok('fmt recibe (umbral, moneda de la alerta): nunca convertida', visto.length === 1 && visto[0][0] === 5 && visto[0][1] === 'USD', visto);
ok('fraseDisparo', A.fraseDisparo(al({ precioDisparo: 4760 }), fmt) === 'GGAL subió de $4.735: está en $4.760', A.fraseDisparo(al({ precioDisparo: 4760 }), fmt));
ok('fraseDisparo baja en dólares, sin el -USD', A.fraseDisparo(al({ ticker: 'BTC-USD', condicion: 'baja', umbral: 60000, moneda: 'USD', precioDisparo: 59500 }), fmt) === 'BTC bajó de US$60.000: está en US$59.500');
ok('fraseDisparo sin precioDisparo termina en el umbral', A.fraseDisparo(al(), fmt) === 'GGAL subió de $4.735');
ok('tickerCorto saca .BA y -USD, deja el resto', A.tickerCorto('GGAL.BA') === 'GGAL' && A.tickerCorto('BTC-USD') === 'BTC' && A.tickerCorto('AL30') === 'AL30' && A.tickerCorto('NVDA') === 'NVDA' && A.tickerCorto('ypfd.ba') === 'YPFD' && A.tickerCorto('') === '');
ok('fmtPrecio por defecto: $4.735 / US$61,20 / $157,5 / US$0,01292', A.fmtPrecio(4735, 'ARS') === '$4.735' && A.fmtPrecio(61.2, 'USD') === 'US$61,20' && A.fmtPrecio(157.5, 'ARS') === '$157,5' && A.fmtPrecio(0.01292, 'USD') === 'US$0,01292',
   [A.fmtPrecio(4735, 'ARS'), A.fmtPrecio(61.2, 'USD'), A.fmtPrecio(157.5, 'ARS'), A.fmtPrecio(0.01292, 'USD')]);
ok('sin fmt usa fmtPrecio', A.textoAlerta(al()) === 'Sube de $4.735' && A.fraseDisparo(al({ precioDisparo: 4760 })) === 'GGAL subió de $4.735: está en $4.760');

// ── validarAlerta (pura, antes de escribir) ──
const base = { ticker: ' ggal.ba ', condicion: 'sube', umbral: '4.735,50', moneda: 'ARS' };
const v = A.validarAlerta(base);
ok('válida: ticker en mayúsculas sin espacios, umbral número', v.ok && v.datos.ticker === 'GGAL.BA' && v.datos.umbral === 4735.5 && v.datos.condicion === 'sube' && v.datos.moneda === 'ARS', v);
ok('umbral 0 / NaN / negativo / vacío / basura', [0, NaN, -1, '', 'abc', null].every(u => !A.validarAlerta({ ...base, umbral: u }).ok));
ok('condición rara', !A.validarAlerta({ ...base, condicion: 'igual' }).ok && !A.validarAlerta({ ...base, condicion: undefined }).ok);
ok('moneda rara', !A.validarAlerta({ ...base, moneda: 'EUR' }).ok && !A.validarAlerta({ ...base, moneda: null }).ok);
ok('ticker vacío / de 17 / con barra o espacio', !A.validarAlerta({ ...base, ticker: '' }).ok && !A.validarAlerta({ ...base, ticker: 'A'.repeat(17) }).ok && A.validarAlerta({ ...base, ticker: 'A'.repeat(16) }).ok && !A.validarAlerta({ ...base, ticker: 'A/B' }).ok && !A.validarAlerta({ ...base, ticker: 'A B' }).ok);
ok('los errores vienen en voseo', /Elegí/.test(A.validarAlerta({ ...base, condicion: 'x' }).error) && /Poné/.test(A.validarAlerta({ ...base, umbral: 0 }).error));
ok('sin argumentos no explota', !A.validarAlerta().ok && !A.validarAlerta(null).ok);

// ── las reglas de Firestore ──
const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const bloque = (reglas.match(/match \/alertasPrecio\/\{aid\} \{[\s\S]*?\n      \}/) || [''])[0];
const sinCom = bloque.replace(/\/\/.*$/gm, '');
ok('el bloque match /alertasPrecio/{aid} existe', bloque.length > 0);
const listas = [...sinCom.matchAll(/hasOnly\(\[([^\]]*)\]\)/g)].map(m => m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean));
ok('el hasOnly del create tiene exactamente CAMPOS_ALERTA', listas[0] && JSON.stringify([...listas[0]].sort()) === JSON.stringify([...A.CAMPOS_ALERTA].sort()), listas[0]);
const hasAll = sinCom.match(/hasAll\(\[([^\]]*)\]\)/);
ok('...y el hasAll también (las nueve son obligatorias)', hasAll && JSON.stringify(hasAll[1].split(',').map(x => x.trim().replace(/'/g, '')).sort()) === JSON.stringify([...A.CAMPOS_ALERTA].sort()));
ok('CAMPOS_ALERTA son nueve y sin repetir', A.CAMPOS_ALERTA.length === 9 && new Set(A.CAMPOS_ALERTA).size === 9);
ok('ni avisada ni avisoMail en ningún hasOnly del bloque (los escribe SOLO el pipeline)', listas.length >= 2 && listas.every(l => !l.includes('avisada') && !l.includes('avisoMail')), listas);
ok('el update solo toca activa / vista / disparada / precioDisparo', listas[1] && JSON.stringify([...listas[1]].sort()) === JSON.stringify(['activa', 'disparada', 'precioDisparo', 'vista']), listas[1]);
ok('disparar UNA vez: disparada == request.time y resource.data.disparada == null', /request\.resource\.data\.disparada == request\.time/.test(sinCom) && /(?<!request\.)resource\.data\.disparada == null/.test(sinCom));
ok('al disparar, precioDisparo number y activa == false', /request\.resource\.data\.precioDisparo is number/.test(sinCom) && /request\.resource\.data\.activa == false/.test(sinCom));
ok('el create exige creada == request.time, activa true, disparada/precioDisparo null, vista false',
   /request\.resource\.data\.creada == request\.time/.test(sinCom) && /request\.resource\.data\.activa == true/.test(sinCom)
   && /request\.resource\.data\.disparada == null/.test(sinCom) && /request\.resource\.data\.precioDisparo == null/.test(sinCom) && /request\.resource\.data\.vista == false/.test(sinCom));
ok('condición y moneda: los mismos valores que el módulo', /condicion in \['sube', 'baja'\]/.test(sinCom) && /moneda in \['ARS', 'USD'\]/.test(sinCom) && JSON.stringify(A.CONDICIONES) === '["sube","baja"]' && JSON.stringify(A.MONEDAS) === '["ARS","USD"]');
ok('lee y borra el dueño', /allow read, delete: if esDuenio\(\)/.test(sinCom));

// ── lo que emite mi-cartera.js y lo que expone panel.js (nombres reales) ──
const mc = readFileSync(new URL('../mi-cartera.js', import.meta.url), 'utf8');
const ev = mc.match(/new CustomEvent\(["']([\w-]+)["'],\s*\{\s*detail:\s*\{([^}]*)\}/);
ok('mi-cartera.js emite EVENTO_PRECIOS con email y precios en detail', ev && ev[1] === A.EVENTO_PRECIOS && /\bemail\b/.test(ev[2]) && /\bprecios\b/.test(ev[2]), ev && ev.slice(1));
const pj = readFileSync(new URL('../panel.js', import.meta.url), 'utf8');
const ctxSrc = (pj.match(/\nconst ctx = \{[\s\S]*?\n\};/) || [''])[0];
ok('panel.js expone en ctx toast, refrescar y money', /\btoast\b/.test(ctxSrc) && /\brefrescar\b/.test(ctxSrc) && /\bmoney\b/.test(ctxSrc) && /get S\(\)/.test(ctxSrc));
ok('LOTE_MAX es el de panel-alertas.js', A.LOTE_MAX === 400 && /const LOTE_MAX = 400;/.test(readFileSync(new URL('../panel-alertas.js', import.meta.url), 'utf8')));

// ── crearAlerta contra el Firestore de mentira ──
const E1 = 'lauti@test';
const creada = await A.crearAlerta(E1, { ticker: 'ggal.ba', condicion: 'sube', umbral: '4.735', moneda: 'ARS' });
let esc = FS.escrituras.at(-1);
ok('setDoc en inversores/{email}/alertasPrecio/{id}', esc.op === 'set' && esc.path === path(E1, creada.id), esc);
ok('id = ticker-condicion-base36-rand4', /^GGAL\.BA-sube-[0-9a-z]+-[0-9a-z]{4}$/.test(creada.id), creada.id);
ok('el doc tiene EXACTAMENTE las nueve claves, en orden', JSON.stringify(Object.keys(esc.data)) === JSON.stringify(A.CAMPOS_ALERTA), Object.keys(esc.data));
ok('creada = serverTimestamp(); activa true; disparada y precioDisparo null; vista false',
   esc.data.creada === ST && esc.data.activa === true && esc.data.disparada === null && esc.data.precioDisparo === null && esc.data.vista === false, esc.data);
ok('ticker en mayúsculas con sufijo, umbral número', esc.data.ticker === 'GGAL.BA' && esc.data.umbral === 4735 && esc.data.condicion === 'sube' && esc.data.moneda === 'ARS');
ok('devuelve la alerta con id (creada local hasta releer)', creada.id && creada.ticker === 'GGAL.BA' && creada.activa === true && creada.creada instanceof Date);
const antes = FS.escrituras.length;
for (const malo of [{ umbral: 0 }, { umbral: NaN }, { umbral: -1 }, { umbral: 'abc' }, { condicion: 'igual' }, { moneda: 'EUR' }, { ticker: '' }, { ticker: 'A'.repeat(17) }]) {
  let e = null;
  try { await A.crearAlerta(E1, { ticker: 'AL30', condicion: 'baja', umbral: 65000, moneda: 'ARS', ...malo }); } catch (x) { e = x; }
  ok('valida antes de escribir: rechaza ' + JSON.stringify(malo), e && FS.escrituras.length === antes, e && e.message);
}
let sinCuenta = null;
try { await A.crearAlerta('', { ticker: 'AL30', condicion: 'baja', umbral: 65000, moneda: 'ARS' }); } catch (x) { sinCuenta = x; }
ok('sin email: throw sin escribir', sinCuenta && FS.escrituras.length === antes);
let dup = null;
try { await A.crearAlerta(E1, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 4735, moneda: 'ARS' }); } catch (x) { dup = x; }
ok('duplicado exacto activo: throw en voseo, sin escribir', dup && /Ya tenés/.test(dup.message) && FS.escrituras.length === antes, dup && dup.message);
ok('mismo ticker con otro umbral: se crea', (await A.crearAlerta(E1, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 5000, moneda: 'ARS' })).id);
ok('misma alerta con la otra condición: se crea', (await A.crearAlerta(E1, { ticker: 'GGAL.BA', condicion: 'baja', umbral: 4735, moneda: 'ARS' })).id);

// ── pausar / reanudar ──
await A.pausar(E1, creada.id, false);
esc = FS.escrituras.at(-1);
ok('pausar: updateDoc { activa: false } y nada más', esc.op === 'update' && esc.path === path(E1, creada.id) && JSON.stringify(esc.data) === '{"activa":false}', esc);
ok('el servidor la tiene pausada', FS.docs.get(path(E1, creada.id)).activa === false);
ok('una pausada no cuenta como duplicado activo', (await A.crearAlerta(E1, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 4735, moneda: 'ARS' })).id);
await A.pausar(E1, creada.id, 'si');
ok('reanudar: { activa: true } (cualquier truthy)', JSON.stringify(FS.escrituras.at(-1).data) === '{"activa":true}' && FS.docs.get(path(E1, creada.id)).activa === true);
let sinId = null;
try { await A.pausar(E1, '', true); } catch (x) { sinId = x; }
ok('pausar sin id: throw', !!sinId);

// ── leerAlertas: caché 60 s por cuenta, invalidada en cada escritura ──
FS.lecturas = 0;
const l1 = await A.leerAlertas(E1); await A.leerAlertas(E1); await A.alertasDe(E1, 'ggal.ba');
ok('tres lecturas seguidas = un getDocs', FS.lecturas === 1, FS.lecturas);
ok('la lista trae { id, ...doc } con la hora del servidor', l1.length === 4 && l1.every(a => a.id && a.creada instanceof TS && A.CAMPOS_ALERTA.every(k => k in a)), l1.map(a => a.id));
ok('de más nueva a más vieja', l1.every((a, i) => i === 0 || a.creada.toMillis() <= l1[i - 1].creada.toMillis()));
ok('alertasDe filtra por ticker sin importar la caja', (await A.alertasDe(E1, 'ggal.ba')).length === 4 && (await A.alertasDe(E1, 'GGAL.BA')).length === 4 && (await A.alertasDe(E1, 'AL30')).length === 0 && (await A.alertasDe(E1, '')).length === 0);
l1.push({ id: 'basura' }); l1[0].vista = 'basura'; l1[1].activa = 'basura';
const l1b = await A.leerAlertas(E1);
ok('devuelve copias (la lista y cada alerta): mutarlas no toca la caché', l1b.length === 4 && l1b.every(a => a.vista === false && a.activa === true), l1b.map(a => [a.vista, a.activa]));
const realNow = Date.now;
Date.now = () => realNow() + A.CACHE_MS + 1;
await A.leerAlertas(E1);
Date.now = realNow;
ok('pasados 60 s relee', FS.lecturas === 2, FS.lecturas);
FS.lecturas = 0;
const nueva = await A.crearAlerta(E1, { ticker: 'AL30', condicion: 'baja', umbral: 65000, moneda: 'ARS' });
const l2 = await A.leerAlertas(E1);
ok('cada escritura invalida: la lectura siguiente va a Firestore y trae la nueva primero', FS.lecturas === 1 && l2.length === 5 && l2[0].id === nueva.id, [FS.lecturas, l2[0] && l2[0].id]);
ok('sin email: lista vacía sin leer', (await A.leerAlertas('')).length === 0 && FS.lecturas === 1);
FS.fallarLectura = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
A.invalidarAlertas(E1);
let fallo = null;
try { await A.leerAlertas(E1); } catch (x) { fallo = x; }
ok('si Firestore no deja leer, leerAlertas tira (la pantalla decide)', fallo && fallo.code === 'permission-denied');
ok('...contarDisparadasNoVistas da 0 y evaluarConPrecios []', await A.contarDisparadasNoVistas(E1) === 0 && (await A.evaluarConPrecios(E1, { 'GGAL.BA': { precio: 9999, moneda: 'ARS' } })).length === 0);
FS.fallarLectura = null;
ok('...y el fallo no queda cacheado: la próxima vuelve a intentar', (await A.leerAlertas(E1)).length === 5);

// ── evaluarConPrecios ──
const E2 = 'otra@test';
const g = await A.crearAlerta(E2, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 4735, moneda: 'ARS' });
const b = await A.crearAlerta(E2, { ticker: 'BTC-USD', condicion: 'baja', umbral: 60000, moneda: 'USD' });
await A.crearAlerta(E2, { ticker: 'AAPL', condicion: 'sube', umbral: 200, moneda: 'USD' });    // el precio viene en ARS: no se evalúa
await A.crearAlerta(E2, { ticker: 'XXXX', condicion: 'sube', umbral: 1, moneda: 'ARS' });      // sinDatos
await A.crearAlerta(E2, { ticker: 'AL30', condicion: 'baja', umbral: 65000, moneda: 'ARS' });  // sin precio
const pausada = await A.crearAlerta(E2, { ticker: 'YPFD.BA', condicion: 'sube', umbral: 100, moneda: 'ARS' });
await A.pausar(E2, pausada.id, false);
const precios = {
  'GGAL.BA': { precio: 4760, moneda: 'ARS', factor: 1, nombre: 'Grupo Galicia' },
  'BTC-USD': { precio: 61000, moneda: 'USD' },
  AAPL: { precio: 300000, moneda: 'ARS' },
  XXXX: { precio: 5, moneda: 'ARS', sinDatos: true },
  AL30: { precio: null, moneda: 'ARS' },
  'YPFD.BA': { precio: 50000, moneda: 'ARS' },
};
FS.escrituras.length = 0;
const salt = await A.evaluarConPrecios(E2, precios);
ok('salta solo GGAL (BTC no cruzó; AAPL otra moneda; XXXX sinDatos; AL30 sin precio; YPFD pausada)',
   salt.length === 1 && salt[0].id === g.id && salt[0].precioDisparo === 4760 && salt[0].activa === false && salt[0].disparada instanceof Date, salt.map(x => x.id));
esc = FS.escrituras[0];
ok('una sola escritura: updateDoc { disparada: serverTimestamp(), precioDisparo, activa: false }',
   FS.escrituras.length === 1 && esc.op === 'update' && esc.path === path(E2, g.id) && esc.data.disparada === ST && esc.data.precioDisparo === 4760 && esc.data.activa === false && Object.keys(esc.data).length === 3, esc);
ok('el servidor la tiene disparada', FS.docs.get(path(E2, g.id)).disparada instanceof TS && FS.docs.get(path(E2, g.id)).activa === false);
FS.escrituras.length = 0;
ok('el repinte siguiente no repite', (await A.evaluarConPrecios(E2, precios)).length === 0 && FS.escrituras.length === 0);
const s2 = await A.evaluarConPrecios(E2, { ...precios, 'BTC-USD': { precio: 60000, moneda: 'USD' } });
ok('la igualdad cuenta también acá: BTC baja de 60.000 en 60.000', s2.length === 1 && s2[0].id === b.id && s2[0].precioDisparo === 60000);
ok('precios por ticker en mayúsculas: una alerta se busca también así', (await A.evaluarConPrecios(E2, { 'AL30': { precio: 60000, moneda: 'ARS' } })).length === 1);
ok('sin email / sin precios: []', (await A.evaluarConPrecios('', precios)).length === 0 && (await A.evaluarConPrecios(E2, null)).length === 0 && (await A.evaluarConPrecios(E2, 'x')).length === 0);

// ── contador del lateral y vistas ──
ok('contarDisparadasNoVistas: 3 con email o con ctx; 0 sin sesión o sin verificar',
   await A.contarDisparadasNoVistas(E2) === 3 && await A.contarDisparadasNoVistas({ S: { email: E2, verificado: true } }) === 3 && await A.contarDisparadasNoVistas({ email: E2 }) === 3
   && await A.contarDisparadasNoVistas(null) === 0 && await A.contarDisparadasNoVistas({ S: { email: null } }) === 0 && await A.contarDisparadasNoVistas({ S: { email: E2, verificado: false } }) === 0);
FS.escrituras.length = 0; FS.lotes.length = 0;
ok('marcarVistas devuelve cuántas marcó', await A.marcarVistas(E2, [g.id, b.id]) === 2);
ok('marcarVistas: un lote de update { vista: true }', FS.lotes.length === 1 && FS.lotes[0].join() === 'update,update' && FS.escrituras.every(w => JSON.stringify(w.data) === '{"vista":true}'), FS.escrituras);
ok('...y el contador baja a 1', await A.contarDisparadasNoVistas(E2) === 1);
let re = null;
FS.escrituras.length = 0;
try { await A.pausar(E2, g.id, true); } catch (x) { re = x; }
ok('una disparada no se reanuda: throw en voseo y sin escribir', re && /ya saltó/.test(re.message) && FS.escrituras.length === 0, re && re.message);

// ── permission-denied: ya la disparó otra pestaña o el pipeline ──
const E3 = 'tercera@test';
const c3 = await A.crearAlerta(E3, { ticker: 'NVDA', condicion: 'sube', umbral: 100, moneda: 'USD' });
await A.leerAlertas(E3);
FS.lecturas = 0; FS.escrituras.length = 0;
FS.denegar = (op, p) => op === 'update' && p === path(E3, c3.id);
const s3 = await A.evaluarConPrecios(E3, { NVDA: { precio: 120, moneda: 'USD' } });
FS.denegar = null;
ok('permission-denied: no tira, no la da por saltada, no relee en el momento', s3.length === 0 && FS.escrituras.length === 1 && FS.lecturas === 0);
await A.leerAlertas(E3);
ok('...pero invalidó la caché: la próxima lectura relee', FS.lecturas === 1);
FS.escrituras.length = 0;
ok('...y no la reintenta en esta pestaña', (await A.evaluarConPrecios(E3, { NVDA: { precio: 120, moneda: 'USD' } })).length === 0 && FS.escrituras.length === 0);

// ── error de red: se reintenta en el próximo refresco ──
const E4 = 'cuarta@test';
await A.crearAlerta(E4, { ticker: 'KO.BA', condicion: 'baja', umbral: 5000, moneda: 'ARS' });
FS.fallar = Object.assign(new Error('unavailable'), { code: 'unavailable' });
ok('error de red: no tira y no la da por saltada', (await A.evaluarConPrecios(E4, { 'KO.BA': { precio: 4900, moneda: 'ARS' } })).length === 0);
FS.fallar = null;
ok('...y en el próximo refresco la marca', (await A.evaluarConPrecios(E4, { 'KO.BA': { precio: 4900, moneda: 'ARS' } })).length === 1);

// ── lotes de a LOTE_MAX ──
const E5 = 'lotes@test';
const ids = [];
for (let i = 0; i < 850; i++) {
  ids.push('id' + i);
  FS.docs.set(path(E5, 'id' + i), { ticker: 'T' + i, condicion: 'sube', umbral: 1, moneda: 'ARS', creada: new TS(i), activa: false, disparada: new TS(i + 1), precioDisparo: 2, vista: false });
}
FS.lotes.length = 0;
ok('marcarVistas de a 400: 3 lotes (400/400/50), todos update', await A.marcarVistas(E5, ids) === 850 && FS.lotes.map(l => l.length).join() === '400,400,50' && FS.lotes.flat().every(o => o === 'update'), FS.lotes.map(l => l.length));
ok('...y quedaron vistas', await A.contarDisparadasNoVistas(E5) === 0);
FS.lotes.length = 0;
ok('limpiarHistorial de a 400: 2 lotes (400/1) de delete y los docs se van', await A.limpiarHistorial(E5, ids.slice(0, 401)) === 401 && FS.lotes.map(l => l.length).join() === '400,1' && FS.lotes.flat().every(o => o === 'delete')
   && [...FS.docs.keys()].filter(k => k.startsWith(`inversores/${E5}/`)).length === 449, FS.lotes.map(l => l.length));
FS.lotes.length = 0;
ok('ids repetidos, vacíos o nulos se descartan; lista vacía = 0 sin lotes', await A.marcarVistas(E5, [ids[500], ids[500], '', null]) === 1 && FS.lotes.length === 1 && await A.marcarVistas(E5, []) === 0 && await A.limpiarHistorial(E5, null) === 0 && FS.lotes.length === 1);
FS.fallar = Object.assign(new Error('unavailable'), { code: 'unavailable' });
let lote = null;
try { await A.marcarVistas(E5, [ids[600]]); } catch (x) { lote = x; }
FS.fallar = null;
ok('si un lote falla, tira (la pantalla avisa) e invalida igual', lote && lote.code === 'unavailable');
await A.borrar(E5, ids[700]);
ok('borrar: deleteDoc', FS.escrituras.at(-1).op === 'delete' && !FS.docs.has(path(E5, ids[700])));

// ── instalarEvaluacion: el circuito del panel ──
globalThis.window = new EventTarget();
const E6 = 'panel@test';
await A.crearAlerta(E6, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 4735, moneda: 'ARS' });
const toasts = [], refrescos = [];
const S = { email: E6, verificado: true };
const ctx = {
  get S() { return S; },
  toast: m => toasts.push(m),
  refrescar: (...t) => refrescos.push(t),
  // el money de panel.js: $ o US$ y es-AR, sin decimales de 1000 para arriba
  money: (v, cur) => (Number(v) < 0 ? '−' : '') + (cur === 'ARS' ? '$' : 'US$') + Math.abs(Number(v) || 0).toLocaleString('es-AR', { maximumFractionDigits: Math.abs(v) < 1000 ? 2 : 0 }),
};
ok('instalarEvaluacion: true la primera vez, false después (una sola por página)', A.instalarEvaluacion(ctx) === true && A.instalarEvaluacion(ctx) === false && A.instalarEvaluacion(null) === false);
const emitir = (email, px) => window.dispatchEvent(new CustomEvent(A.EVENTO_PRECIOS, { detail: { email, precios: px, n: 1, fx: {} } }));
const esperar = () => new Promise(r => setTimeout(r, 30));
const pxG = { 'GGAL.BA': { precio: 4760, moneda: 'ARS' } };
emitir('otro@test', pxG); await esperar();
ok('evento de otra cuenta: nada', toasts.length === 0 && refrescos.length === 0);
S.verificado = false; emitir(E6, pxG); await esperar(); S.verificado = true;
ok('mail sin verificar: nada', toasts.length === 0 && refrescos.length === 0);
emitir(E6, { 'GGAL.BA': { precio: 4700, moneda: 'ARS' } }); await esperar();
ok('sin cruce: nada', toasts.length === 0 && refrescos.length === 0);
emitir(E6, pxG); await esperar();
ok('el disparo avisa con ctx.toast (formato de ctx.money) y ctx.refrescar("alertas")', toasts.length === 1 && toasts[0] === 'GGAL subió de $4.735: está en $4.760' && refrescos.length === 1 && refrescos[0].join() === 'alertas', { toasts, refrescos });
emitir(E6, pxG); await esperar();
ok('el repinte siguiente no vuelve a avisar', toasts.length === 1 && refrescos.length === 1);
ok('el contador del lateral ya la cuenta', await A.contarDisparadasNoVistas(ctx) === 1);

// ── casos adversarios ──
// 1) el umbral escrito como en el modal de compra: "0.500" es medio, no quinientos; el
//    decimal es el último separador; $ y espacios sobran; la basura no se vuelve número
const umbralDe = u => { const r = A.validarAlerta({ ...base, umbral: u }); return r.ok ? r.datos.umbral : null; };
ok('"0.500" → 0,5 (no 500); "1.500" → 1.500; "0,5" → 0,5; "12.345.678" → 12345678; "1,900.50" (inglés) → 1.900,50; "$4.735" → 4.735; "US$ 61,20" → 61,20; "4 735" → 4.735; "1.900.5", "1e3", "-5" no sirven',
   umbralDe('0.500') === 0.5 && umbralDe('1.500') === 1500 && umbralDe('0,5') === 0.5 && umbralDe('12.345.678') === 12345678
   && umbralDe('1,900.50') === 1900.5 && umbralDe('$4.735') === 4735 && umbralDe('US$ 61,20') === 61.2 && umbralDe('4735.50') === 4735.5 && umbralDe('4 735') === 4735
   && umbralDe('1.900.5') === null && umbralDe('1e3') === null && umbralDe('-5') === null,
   ['0.500', '1.500', '0,5', '12.345.678', '1,900.50', '$4.735', 'US$ 61,20', '4 735', '1.900.5', '1e3', '-5'].map(umbralDe));
// ...y es el MISMO criterio que parseNum() de mi-cartera.js (se ejecuta el parseNum real,
// sacado del fuente): lo que el usuario escribe vale lo mismo en los dos modales
const parseNumSrc = (mc.match(/export function parseNum\(s\) \{[\s\S]*?\n\}/) || [''])[0];
const parseNum = parseNumSrc ? new Function(parseNumSrc.replace('export ', '') + '\nreturn parseNum;')() : null;
const bienEscritos = ['4.735,50', '1,900.50', '1.900', '180.50', '0.500', '12.345.678', '61,20', '0,5', '4735', '$4.735', 'US$ 61,20', '100.000', '.500', '0.125', '1.5'];
ok('parseNum() de mi-cartera.js y validarAlerta() leen igual todo umbral bien escrito',
   parseNum && bienEscritos.every(u => cerca(umbralDe(u), parseNum(u))),
   parseNum ? bienEscritos.map(u => [u, umbralDe(u), parseNum(u)]).filter(([, a, b]) => !cerca(a, b)) : 'no encontré parseNum en mi-cartera.js');
// 2) el formato decide los decimales con el valor ya redondeado
ok('fmtPrecio en el borde de cada rango: 999,999 → $1.000; 0,99999 → US$1,00; 99,999 → US$100,0',
   A.fmtPrecio(999.999, 'ARS') === '$1.000' && A.fmtPrecio(0.99999, 'USD') === 'US$1,00' && A.fmtPrecio(99.999, 'USD') === 'US$100,0',
   [A.fmtPrecio(999.999, 'ARS'), A.fmtPrecio(0.99999, 'USD'), A.fmtPrecio(99.999, 'USD')]);
// 3) dos pintar() casi juntos (catalogo().then(pintar) + el timer): dos evaluaciones en paralelo, UNA escritura
const E7 = 'paralelo@test';
const c7 = await A.crearAlerta(E7, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 4735, moneda: 'ARS' });
FS.escrituras.length = 0;
const [p1, p2] = await Promise.all([A.evaluarConPrecios(E7, pxG), A.evaluarConPrecios(E7, pxG)]);
ok('dos evaluaciones en paralelo: una sola escritura y un solo disparo', p1.length + p2.length === 1 && FS.escrituras.length === 1 && FS.escrituras[0].path === path(E7, c7.id), [p1.length, p2.length, FS.escrituras.length]);
// 4) sin mail verificado la regla no deja ni leer: crearAlerta avisa en voseo y no escribe
const E8 = 'sinverificar@test';
FS.fallarLectura = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
FS.escrituras.length = 0;
let sinVerif = null;
try { await A.crearAlerta(E8, { ticker: 'AL30', condicion: 'baja', umbral: 65000, moneda: 'ARS' }); } catch (x) { sinVerif = x; }
FS.fallarLectura = null;
ok('crearAlerta con la lectura denegada: throw en voseo (mail verificado) y sin escribir', sinVerif && /mail verificado/.test(sinVerif.message) && FS.escrituras.length === 0, sinVerif && sinVerif.message);
// 5) reanudar una disparada cuando la lectura local falla: la regla la rechaza y el módulo lo traduce
A.invalidarAlertas(E2);   // sin esto la caché contesta y el chequeo local tapa el camino que se quiere probar
FS.fallarLectura = Object.assign(new Error('unavailable'), { code: 'unavailable' });
FS.escrituras.length = 0;
let reanudar = null;
try { await A.pausar(E2, g.id, true); } catch (x) { reanudar = x; }
FS.fallarLectura = null;
ok('reanudar una disparada sin poder leer antes: se intenta, Firestore la rechaza y llega en voseo',
   reanudar && /Firestore no dejó reanudar/.test(reanudar.message) && FS.escrituras.length === 1 && FS.escrituras[0].data.activa === true && FS.docs.get(path(E2, g.id)).activa === false, reanudar && reanudar.message);
ok('...y pausar (activa=false) una disparada sí pasa (la regla lo permite)', await A.pausar(E2, g.id, false).then(() => true, e => e.message) === true);
// 6) un doc con el ticker en minúsculas (legado o del pipeline) igual encuentra su precio, que está en mayúsculas
const E9 = 'legado@test';
FS.docs.set(path(E9, 'legado'), { ticker: 'ggal.ba', condicion: 'sube', umbral: 10, moneda: 'ARS', creada: new TS(1), activa: true, disparada: null, precioDisparo: null, vista: false });
const s9 = await A.evaluarConPrecios(E9, { 'GGAL.BA': { precio: 20, moneda: 'ARS' } });
ok('ticker en minúsculas en el doc: se evalúa igual y la frase sale limpia', s9.length === 1 && A.fraseDisparo(s9[0]) === 'GGAL subió de $10,00: está en $20,00', s9.map(x => A.fraseDisparo(x)));
// 7) el panel cambió de cuenta entre el evento y el resultado: la alerta se marca (cruzó de verdad) pero no se avisa a otro
const c10 = await A.crearAlerta(E6, { ticker: 'AL30', condicion: 'baja', umbral: 65000, moneda: 'ARS' });
emitir(E6, { AL30: { precio: 60000, moneda: 'ARS' } }); S.email = 'otro@test'; await esperar(); S.email = E6;
ok('cambio de cuenta en el medio: el doc queda disparado pero no hay toast ni refresco para la cuenta nueva',
   FS.docs.get(path(E6, c10.id)).disparada instanceof TS && toasts.length === 1 && refrescos.length === 1, { toasts, refrescos });
// 8) las reglas exigen el mail verificado para ser dueño (por eso el módulo filtra por S.verificado)
ok('esDuenio() exige esVerificado() (email_verified == true)', /function esDuenio\(\)\s*\{[\s\S]*?esVerificado\(\)/.test(reglas) && /email_verified == true/.test(reglas));
// 9) el pipeline (service account, sin reglas) la disparó mientras la caché de esta pestaña estaba caliente:
//    la lista local todavía la ve activa, el update choca con la regla (resource.data.disparada != null)
const E11 = 'carrera@test';
const c11 = await A.crearAlerta(E11, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 4735, moneda: 'ARS' });
await A.leerAlertas(E11);
FS.docs.set(path(E11, c11.id), { ...FS.docs.get(path(E11, c11.id)), disparada: new TS(999), precioDisparo: 4750, activa: false, avisada: true, avisoMail: 'x' });
FS.lecturas = 0; FS.escrituras.length = 0;
const s11 = await A.evaluarConPrecios(E11, pxG);
ok('el pipeline ganó la carrera con la caché caliente: se intenta UNA vez, la regla la rechaza, no se da por saltada, no tira',
   s11.length === 0 && FS.escrituras.length === 1 && FS.escrituras[0].op === 'update' && FS.lecturas === 0, [s11.length, FS.escrituras.length, FS.lecturas]);
const l11 = await A.leerAlertas(E11);
ok('...la caché quedó invalidada: la próxima lectura la trae disparada con el precio del pipeline (no se pisa) y el lateral la cuenta',
   FS.lecturas === 1 && l11[0].precioDisparo === 4750 && l11[0].activa === false && await A.contarDisparadasNoVistas(E11) === 1, l11[0]);
FS.escrituras.length = 0;
ok('...y otro refresco no la vuelve a intentar', (await A.evaluarConPrecios(E11, pxG)).length === 0 && FS.escrituras.length === 0);
// 10) dos alertas del mismo ticker cruzan en el mismo repinte; y un doc inconsistente que solo
//     el pipeline podría dejar (disparada pero activa: true) no se dispara, no se reanuda y cuenta una vez
const E12 = 'doble@test';
const d1 = await A.crearAlerta(E12, { ticker: 'GGAL.BA', condicion: 'sube', umbral: 4700, moneda: 'ARS' });
const d2 = await A.crearAlerta(E12, { ticker: 'GGAL.BA', condicion: 'baja', umbral: 4800, moneda: 'ARS' });
FS.docs.set(path(E12, 'raro'), { ticker: 'GGAL.BA', condicion: 'sube', umbral: 1, moneda: 'ARS', creada: new TS(1), activa: true, disparada: new TS(2), precioDisparo: 2, vista: false });
A.invalidarAlertas(E12);
FS.escrituras.length = 0;
const s12 = await A.evaluarConPrecios(E12, { 'GGAL.BA': { precio: 4750, moneda: 'ARS' } });
ok('sube 4.700 y baja 4.800 en 4.750: las dos saltan, dos updates, y el doc raro no se toca',
   s12.length === 2 && new Set(s12.map(x => x.id)).size === 2 && s12.every(x => [d1.id, d2.id].includes(x.id))
   && FS.escrituras.length === 2 && FS.escrituras.every(w => w.op === 'update' && w.path !== path(E12, 'raro')), s12.map(x => x.id));
ok('...fraseDisparo distingue cada una', s12.map(x => A.fraseDisparo(x)).sort().join(' | ') === 'GGAL bajó de $4.800: está en $4.750 | GGAL subió de $4.700: está en $4.750', s12.map(x => A.fraseDisparo(x)));
let raro = null;
try { await A.pausar(E12, 'raro', true); } catch (x) { raro = x; }
ok('...el doc raro: no se reanuda (throw local, sin escribir) y el lateral cuenta 3', raro && /ya saltó/.test(raro.message) && FS.escrituras.length === 2 && await A.contarDisparadasNoVistas(E12) === 3);
// 11) otro importador carga el módulo con otro ?v= (segunda instancia): no hay segundo listener;
//     y el evento sin email (mi-cartera sin usuario), sin precios o sin detail no hace nada
const B = await import(OTRA_INSTANCIA);
ok('segunda instancia del módulo: mismo contrato, pero instalarEvaluacion devuelve false (ya hay listener en window)',
   B !== A && B.EVENTO_PRECIOS === A.EVENTO_PRECIOS && JSON.stringify(B.CAMPOS_ALERTA) === JSON.stringify(A.CAMPOS_ALERTA) && B.instalarEvaluacion(ctx) === false);
const c13 = await A.crearAlerta(E6, { ticker: 'NVDA', condicion: 'sube', umbral: 100, moneda: 'USD' });
const pxN = { NVDA: { precio: 120, moneda: 'USD' } };
const antesT = toasts.length, antesR = refrescos.length;
window.dispatchEvent(new CustomEvent(A.EVENTO_PRECIOS, { detail: { email: undefined, precios: pxN, n: 1, fx: {} } }));
window.dispatchEvent(new CustomEvent(A.EVENTO_PRECIOS, { detail: { email: E6, precios: null } }));
window.dispatchEvent(new CustomEvent(A.EVENTO_PRECIOS));
await esperar();
ok('evento sin email / sin precios / sin detail: ni toast, ni refresco, ni escritura', toasts.length === antesT && refrescos.length === antesR && FS.docs.get(path(E6, c13.id)).disparada === null);
emitir(E6, pxN); await esperar();
ok('...y el evento bien formado sí dispara (una sola vez aunque haya dos instancias cargadas)',
   toasts.length === antesT + 1 && toasts.at(-1) === 'NVDA subió de US$100: está en US$120' && refrescos.length === antesR + 1 && FS.docs.get(path(E6, c13.id)).disparada instanceof TS, toasts.at(-1));
// 12) invariantes de TODA la corrida contra las reglas: ningún set sin las nueve claves, ningún update fuera de la lista
const sets = FS.todas.filter(w => w.op === 'set'), ups = FS.todas.filter(w => w.op === 'update');
ok('todos los set tienen EXACTAMENTE las nueve claves con los tipos de la regla',
   sets.length > 5 && sets.every(w => JSON.stringify(Object.keys(w.data)) === JSON.stringify(A.CAMPOS_ALERTA) && typeof w.data.ticker === 'string' && w.data.ticker.length > 0 && w.data.ticker.length <= 16
     && A.CONDICIONES.includes(w.data.condicion) && typeof w.data.umbral === 'number' && w.data.umbral > 0 && A.MONEDAS.includes(w.data.moneda)
     && w.data.creada === ST && w.data.activa === true && w.data.disparada === null && w.data.precioDisparo === null && w.data.vista === false),
   sets.filter(w => JSON.stringify(Object.keys(w.data)) !== JSON.stringify(A.CAMPOS_ALERTA)).map(w => Object.keys(w.data)));
ok('todos los update tocan solo activa/vista/disparada/precioDisparo, y disparar lleva serverTimestamp + precioDisparo number + activa false',
   ups.length > 5 && ups.every(w => Object.keys(w.data).every(k => listas[1].includes(k)) && !('avisada' in w.data) && !('avisoMail' in w.data)
     && (!('disparada' in w.data) || (w.data.disparada === ST && typeof w.data.precioDisparo === 'number' && w.data.activa === false))
     && (!('precioDisparo' in w.data) || 'disparada' in w.data)),
   ups.filter(w => !Object.keys(w.data).every(k => listas[1].includes(k))).map(w => w.data));

console.log(mal ? `${mal} fallas de ${n}` : `OK ${n} casos`);
process.exit(mal ? 1 : 0);
