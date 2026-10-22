// ¿Reconoce el panel que YPFD (la acción local) y YPF (el ADR de Nueva York, que es
// como la siguen las carteras de perfil) son la misma empresa? Prueba las mismas
// comparaciones que usan compararSeguidas (panel.js), la pestaña Carteras
// (panel-carteras.js) y Qué comprar (panel-comprar.js, con mapaCarteras).
//   node scripts/test-ypf.mjs
import { base, radarSym, tickerFicha } from '../activos.js?v=7';

let fallas = 0;
const ok = (nombre, cond, extra) => { console.log((cond ? 'ok    ' : 'FALLA ') + nombre + (cond ? '' : '  ' + JSON.stringify(extra))); if (!cond) fallas++; };

// tenencias() de panel.js, sin renta fija
const tenencias = pos => ({ radar: new Set(pos.map(radarSym)), fichas: new Set(pos.map(tickerFicha).filter(Boolean)) });
// compararSeguidas: ¿la tiene? y ¿cuánto pesa?
const tiene = (ten, k) => ten.fichas.has(k) || ten.radar.has(radarSym(k));
const mismo = (f, k) => { const fk = tickerFicha(k), rk = radarSym(k); return (fk && tickerFicha(f) === fk) || radarSym(f) === rk; };
// mapaCarteras + Qué comprar: el mapa va por el ticker de la cartera, la búsqueda por ficha y por símbolo del radar
const enCarteras = (tickersCartera, symRadar) => {
  const mapa = {};
  tickersCartera.forEach(t => { const k = String(t).toUpperCase(); (mapa[k] = mapa[k] || []).push('Renta Variable'); });
  const f = tickerFicha(symRadar);
  return [...new Set([...((f && mapa[f]) || []), ...(mapa[symRadar] || [])])];
};

console.log('YPF tiene ficha:', tickerFicha('YPF'), '· símbolo del radar:', radarSym('YPF'));
for (const delUsuario of ['YPFD.BA', 'YPFD', 'YPF', 'ypfd.ba']) {
  const ten = tenencias([delUsuario]);
  ok(`usuario con ${delUsuario}: la cartera (YPF) figura como que la tiene`, tiene(ten, 'YPF'), [...ten.radar, ...ten.fichas]);
  ok(`usuario con ${delUsuario}: su fila suma al peso de YPF`, mismo(delUsuario, 'YPF'));
}
ok('una cartera que la siguiera como YPFD también matchea con el ADR del usuario', tiene(tenencias(['YPF']), 'YPFD') && mismo('YPF', 'YPFD'));
ok('Qué comprar (radar YPFD) dice que está en la cartera que tiene YPF', enCarteras(['YPF', 'MSFT'], 'YPFD').length === 1);
ok('PAMP y PAM: lo mismo', tiene(tenencias(['PAMP.BA']), 'PAM') && mismo('PAMP.BA', 'PAM') && enCarteras(['PAM'], 'PAMP').length === 1);
ok('y no confunde: GGAL no es YPF', !tiene(tenencias(['GGAL.BA']), 'YPF') && !mismo('GGAL.BA', 'YPF'));
ok('ni YPF con un activo sin ficha', !mismo('ZZZZ.BA', 'YPF') && !tiene(tenencias(['ZZZZ.BA']), 'YPF'));
console.log(fallas ? `\n${fallas} FALLAS` : '\ntodo bien');
process.exit(fallas ? 1 : 0);
