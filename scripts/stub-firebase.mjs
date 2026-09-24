// scripts/stub-firebase.mjs — gancho de carga (module.register) para los tests.
// mi-cartera.js importa Firebase desde www.gstatic.com (una URL https, que Node
// no baja). Acá esos imports se resuelven a un módulo vacío con los mismos
// nombres: así se pueden importar y probar las funciones puras del módulo
// (resolverSimbolo, validarCompras, sugerirCatalogo, parseNum…) sin tocar
// Firestore. Cualquier función del stub que se llame tira: los tests no
// escriben ni leen nada.
const NOMBRES = ["getFirestore", "collection", "getDocs", "doc", "getDoc", "setDoc", "updateDoc", "deleteDoc",
                 "runTransaction", "query", "where", "getApp", "initializeApp", "getApps", "getAuth", "onAuthStateChanged"];
const FUENTE = NOMBRES.map(n => `export const ${n} = () => { throw new Error("Firebase no está en los tests (${n})"); };`).join("\n");
const STUB = "data:text/javascript," + encodeURIComponent(FUENTE);

export async function resolve(specifier, context, next) {
  if (/^https:\/\/www\.gstatic\.com\/firebasejs\//.test(specifier)) return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
