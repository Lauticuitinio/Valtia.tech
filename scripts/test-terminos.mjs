// node scripts/test-terminos.mjs — verifica terminos-aceptar.js: la versión, los
// textos, la puerta del panel contra un Firestore de mentira (los caminos que no
// abren el modal), el cruce con firestore.rules y cómo lo usa index.html. Sin red:
// el módulo importa Firebase por URL (gstatic) y acá esos imports se interceptan con
// module.registerHooks (Node ≥ 22.15). El modal en sí se prueba en el navegador.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

let mal = 0, n = 0;
function ok(nombre, cond, detalle) {
  n++;
  if (!cond) { mal++; console.log(`FALLA ${nombre}: ${JSON.stringify(detalle)}`); }
}

// ── Firestore de mentira ──
const ST = { __serverTimestamp: true };
const FS = { docs: new Map(), lecturas: [], escrituras: [], fallarLectura: null, fallarEscritura: null, ST };
globalThis.__fsTerminos = FS;
const STUB_FIRESTORE = `
const FS = globalThis.__fsTerminos;
export const getFirestore = () => ({ stub: true });
export const doc = (db, ...segs) => ({ path: segs.join('/') });
export const serverTimestamp = () => FS.ST;
export async function getDoc(ref) {
  FS.lecturas.push(ref.path);
  if (FS.fallarLectura) throw FS.fallarLectura;
  const d = FS.docs.get(ref.path);
  return { exists: () => d != null, data: () => (d == null ? undefined : { ...d }) };
}
export async function setDoc(ref, data) {
  FS.escrituras.push({ path: ref.path, data });
  if (FS.fallarEscritura) throw FS.fallarEscritura;
  FS.docs.set(ref.path, { ...data });
}
`;
const GSTATIC = 'https://www.gstatic.com/firebasejs/';
registerHooks({
  resolve(spec, ctx, next) { return spec.startsWith(GSTATIC) ? { url: spec, shortCircuit: true } : next(spec, ctx); },
  load(url, ctx, next) {
    if (!url.startsWith(GSTATIC)) return next(url, ctx);
    const source = url.endsWith('firebase-app.js') ? 'export const getApp = () => ({ stub: true });' : STUB_FIRESTORE;
    return { format: 'module', source, shortCircuit: true };
  },
});
// localStorage de mentira (el módulo lo usa solo para "este navegador ya lo vio guardado")
const LS = new Map();
globalThis.localStorage = { getItem: k => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: k => LS.delete(k) };

const T = await import('../terminos-aceptar.js');
const leer = p => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── la versión ──
ok('TERMINOS_VERSION es una fecha AAAA-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(T.TERMINOS_VERSION), T.TERMINOS_VERSION);
ok('TERMINOS_VERSION entra en el límite de las reglas (≤ 20)', T.TERMINOS_VERSION.length > 0 && T.TERMINOS_VERSION.length <= 20);

// ── estadoDe ──
ok('sin doc: falta', T.estadoDe(null) === 'falta' && T.estadoDe(undefined) === 'falta' && T.estadoDe('x') === 'falta');
ok('la versión vigente: ok', T.estadoDe({ version: T.TERMINOS_VERSION, aceptado: 1 }) === 'ok');
ok('otra versión o sin versión: vieja', T.estadoDe({ version: '2020-01-01' }) === 'vieja' && T.estadoDe({}) === 'vieja');

// ── mensajeError: honesto, con código y con salida ──
const mPD = T.mensajeError({ code: 'permission-denied' });
ok('permission-denied: dice el código y ofrece reintentar o seguir', /\(permission-denied\)/.test(mPD) && /Reintentá/.test(mPD) && /seguí al panel/.test(mPD) && /^No pudimos guardar/.test(mPD), mPD);
ok('sin conexión y sin respuesta tienen su frase', /conexión/.test(T.mensajeError({ code: 'unavailable' })) && /a tiempo/.test(T.mensajeError({ code: 'deadline-exceeded' })));
ok('el código de Firestore sin prefijo', /\(permission-denied\)/.test(T.mensajeError({ code: 'firestore/permission-denied' })));
ok('un error sin código no inventa paréntesis', !/\(/.test(T.mensajeError(new Error('x'))) && !/\(/.test(T.mensajeError(null)));
ok('en el alta aclara que la cuenta ya está creada', /^Tu cuenta ya está creada/.test(T.mensajeError({ code: 'unavailable' }, true)));

// ── exigirTerminos: los caminos que NO abren el modal (el modal se prueba en el navegador) ──
const path = e => `inversores/${e}/legal/terminos`;
const reiniciar = () => { FS.lecturas = []; FS.escrituras = []; FS.fallarLectura = null; FS.fallarEscritura = null; };

reiniciar();
FS.docs.set(path('vieja@valtia.test'), { version: T.TERMINOS_VERSION, aceptado: 1 });
const rVieja = await T.exigirTerminos({ email: 'vieja@valtia.test', uid: 'u-vieja' });
ok('cuenta que ya aceptó esta versión: lee una vez, no escribe', rVieja === 'ok' && FS.lecturas.length === 1 && FS.lecturas[0] === path('vieja@valtia.test') && FS.escrituras.length === 0, FS);
ok('la marca local va por uid: el mail no queda escrito en el navegador',
   LS.get('valtia-terminos-u-vieja') === T.TERMINOS_VERSION && ![...LS.keys()].some(k => k.includes('@')), [...LS.keys()]);
await T.exigirTerminos({ email: 'vieja@valtia.test', uid: 'u-vieja' });
ok('en la misma página no vuelve a leer', FS.lecturas.length === 1);

reiniciar();
T.anotarAlta('  Nueva@Valtia.test ');
await T.exigirTerminos({ email: 'nueva@valtia.test' });
const w = FS.escrituras[0];
ok('alta: guarda sin preguntar, en su doc', FS.escrituras.length === 1 && w.path === path('nueva@valtia.test'), FS.escrituras);
ok('alta: guarda EXACTAMENTE CAMPOS_LEGAL, versión vigente y la hora del servidor',
   w && JSON.stringify(Object.keys(w.data).sort()) === JSON.stringify([...T.CAMPOS_LEGAL].sort())
   && w.data.version === T.TERMINOS_VERSION && w.data.aceptado === ST, w);

reiniciar();
T.anotarAlta('otra@valtia.test');
T.olvidarAlta();
FS.fallarLectura = Object.assign(new Error('sin permiso'), { code: 'permission-denied' });
LS.set('valtia-terminos-u-leida', T.TERMINOS_VERSION);
await T.exigirTerminos({ email: 'Leida@valtia.test', uid: 'u-leida' });
ok('no se pudo leer pero este navegador ya la vio guardada: pasa sin escribir', FS.escrituras.length === 0 && FS.lecturas.length === 1, FS);

// la sesión cambia (salió o entró otra cuenta desde otra pestaña) mientras la puerta
// lee: no abre el modal (en Node, abrirlo reventaría: no hay document) ni escribe
reiniciar();
const pFuera = T.exigirTerminos({ email: 'fuera@valtia.test', uid: 'u-fuera' });
T.cerrarTerminos();
ok('cambio de sesión durante la lectura: devuelve "fuera", sin modal ni escritura', (await pFuera) === 'fuera' && FS.escrituras.length === 0);
reiniciar();
T.anotarAlta('fuera2@valtia.test');
const pFuera2 = T.exigirTerminos({ email: 'fuera2@valtia.test', uid: 'u-fuera2' });
T.cerrarTerminos();
ok('lo mismo con un alta anotada: no guarda a nombre de una sesión que ya no está', (await pFuera2) === 'fuera' && FS.escrituras.length === 0);

// ── los links que se copian del texto legal ──
ok('href: pasan las páginas del sitio y los mails', T.hrefPropio('/terminos') && T.hrefPropio('/privacidad#privacidad-2') && T.hrefPropio('mailto:soporte@valtia.tech'));
ok('href: no pasa nada que salga del sitio ni ejecute código',
   !['//otro.com', '/\\otro.com', '/\\\\otro.com', 'javascript:alert(1)', 'https://otro.com', ' /terminos', '/a b', 'mailto:a@b.c\\x', ''].some(T.hrefPropio));

reiniciar();
FS.docs.set(path('cambio@valtia.test'), { version: '2026-01-01', aceptado: 1 });
T.anotarAlta('cambio@valtia.test');
await T.exigirTerminos({ email: 'cambio@valtia.test' });
ok('versión vieja con alta anotada: guarda la vigente encima (update)', FS.escrituras.length === 1 && FS.docs.get(path('cambio@valtia.test')).version === T.TERMINOS_VERSION);

reiniciar();
T.anotarAlta('alguien@valtia.test');
FS.docs.set(path('distinta@valtia.test'), { version: T.TERMINOS_VERSION });
await T.exigirTerminos({ email: 'distinta@valtia.test' });
T.anotarAlta('alguien@valtia.test');
ok('el alta anotada es de UN mail: otra cuenta no la usa', FS.escrituras.length === 0);
T.olvidarAlta();

await T.exigirTerminos(null);
await T.exigirTerminos({});
ok('sin usuario o sin mail no hace nada', true);

// ── firestore.rules ──
const reglas = leer('../firestore.rules');
const iInv = reglas.indexOf('match /inversores/{email} {');
const iBaja = reglas.indexOf('match /alertasBaja/{token}');
const bloque = (reglas.match(/match \/legal\/\{docId\} \{[\s\S]*?\n      \}/) || [''])[0];
const iLegal = reglas.indexOf('match /legal/{docId}');
const sinCom = bloque.replace(/\/\/.*$/gm, '');
ok('el bloque match /legal/{docId} existe y está adentro de /inversores/{email}', bloque.length > 0 && iInv > -1 && iLegal > iInv && iLegal < iBaja);
const lista = (sinCom.match(/hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
ok('hasOnly del bloque == CAMPOS_LEGAL', JSON.stringify([...lista].sort()) === JSON.stringify([...T.CAMPOS_LEGAL].sort()), lista);
ok('el dueño escribe SIN exigir el mail verificado (el alta acepta antes de verificar)',
   /allow create, update: if request\.auth != null && request\.auth\.token\.email == email/.test(sinCom) && !/esDuenio|esVerificado|email_verified/.test(sinCom));
ok('lee el dueño o el admin', /allow read: if isAdmin\(\) \|\| \(request\.auth != null && request\.auth\.token\.email == email\)/.test(sinCom));
ok('el admin NO escribe por otros', !/allow (create|update|write)[^;]*isAdmin/.test(sinCom));
ok('solo el doc "terminos"', /docId == 'terminos'/.test(sinCom));
ok('version string de 1 a 20', /version is string/.test(sinCom) && /version\.size\(\) > 0/.test(sinCom) && /version\.size\(\) <= 20/.test(sinCom));
ok('aceptado == request.time', /request\.resource\.data\.aceptado == request\.time/.test(sinCom));
ok('sin delete', /allow delete: if false;/.test(sinCom) && !/allow[^;]*\bdelete\b[^;]*if (?!false)/.test(sinCom));

// ── el módulo: modal propio, sin pestañas nuevas ──
const mod = leer('../terminos-aceptar.js');
ok('no usa confirm()/alert() del navegador', !/\b(window\.)?(confirm|alert)\(/.test(mod.replace(/\/\/.*$/gm, '')));
ok('ningún link con target _blank', !/_blank/.test(mod));
ok('aria-modal, foco atrapado y Escape que no cierra el obligatorio', /aria-modal="true"/.test(mod) && /atraparFoco/.test(mod) && /if \(!o\.obligatorio && !ocupado\) cerrar\('cancelar'\)/.test(mod));
ok('la casilla y el botón con el texto pedido', /Leí y acepto los Términos y Condiciones y la Política de Privacidad/.test(mod) && />Confirmar</.test(mod) && /id="ta-ok" disabled/.test(mod));
ok('lee el texto de /terminos con DOMParser', /fetch\('\/terminos'/.test(mod) && /DOMParser/.test(mod));
ok('sin Plex Mono ni Playfair', !/Plex Mono|Playfair/.test(mod));

// ── terminos.html trae lo que el módulo extrae ──
const term = leer('../terminos.html');
ok('terminos.html tiene main.lg-txt con secciones .lg-sec y la vigencia .v-baj',
   /<main class="lg-txt">/.test(term) && (term.match(/class="lg-sec"/g) || []).length >= 5 && /class="v-baj"/.test(term));

// ── index.html ──
const idx = leer('../index.html');
ok('index.html importa el módulo con ?v=1', /from '\.\/terminos-aceptar\.js\?v=1'/.test(idx));
const alta = (idx.match(/window\.signupWithEmail = async function\(\) \{[\s\S]*?\n  \};/) || [''])[0];
const iPedir = alta.indexOf('pedirTerminosAlta('), iAnotar = alta.indexOf('anotarAlta('), iCrear = alta.indexOf('createUserWithEmailAndPassword(');
ok('alta: primero el modal, después anotar y recién ahí crear la cuenta', iPedir > -1 && iAnotar > iPedir && iCrear > iAnotar, { iPedir, iAnotar, iCrear });
ok('alta: sin confirmar, return antes de crear', /if \(!\(await pedirTerminosAlta\(\{ email \}\)\)\) \{[\s\S]*?return;\s*\}/.test(alta));
ok('alta: si falla la creación, se olvida lo anotado', /catch\(e\) \{\s*olvidarAlta\(\);/.test(alta));
const ingreso = (idx.match(/onAuthStateChanged\(auth, async \(user\) => \{[\s\S]*?\n  \}\);/) || [''])[0];
const iExigir = ingreso.indexOf('await exigirTerminos('), iEntrar = ingreso.indexOf('enterPortal(');
ok('ingreso: exigirTerminos antes de enterPortal', iExigir > -1 && iEntrar > iExigir, { iExigir, iEntrar });
ok('ingreso: «Cerrar sesión» del modal es el logout del sitio', /paso = await exigirTerminos\(user, \{ cerrarSesion: \(\) => window\.logout\(\) \}\)/.test(ingreso));
const iCerrar = ingreso.indexOf('cerrarTerminos()'), iIf = ingreso.indexOf('if (user)');
ok('ingreso: cada cambio de sesión cierra el modal que hubiera quedado de la anterior', iCerrar > -1 && iCerrar < iIf, { iCerrar, iIf });
const iMisma = ingreso.search(/if \(paso === 'fuera' \|\| !auth\.currentUser \|\| auth\.currentUser\.uid !== user\.uid\) return;/);
ok('ingreso: si la sesión cambió mientras esperaba, esa vuelta no entra al panel', iMisma > iExigir && iMisma < iEntrar, { iMisma, iExigir, iEntrar });
ok('la vuelta de leer usa la misma clave que el módulo', idx.includes(`'${T.CLAVE_VOLVER}'`));

console.log(`test-terminos: ${n - mal}/${n} ok`);
if (mal) process.exit(1);
