// scripts/test-informe-graficos.mjs — los gráficos de adentro de los informes (informe-graficos.js).
// Son funciones puras: se les pasan datos y devuelven texto. Acá se controla que con
// datos de menos no dibujen nada, que los números salgan de los datos y que nada de lo
// que viene de afuera (títulos, tickers) entre sin escapar.
//   node scripts/test-informe-graficos.mjs
import { filasDe, figuraDesde, figuraFamilia, CSS_FIGURAS } from '../informe-graficos.js';

let ok = 0, mal = 0;
const check = (nombre, cond, detalle) => { if (cond) ok++; else { mal++; console.log('  FALLA', nombre, detalle === undefined ? '' : '-> ' + JSON.stringify(detalle)); } };

// un año y medio de ruedas (lunes a viernes) que sube parejo de 100 a ~139
const dia = i => new Date(Date.UTC(2025, 3, 1) + i * 86400e3);
const serie = [];
for (let i = 0, c = 100; i < 550; i++) {
  const d = dia(i);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
  c *= 1.00085;
  serie.push([d.toISOString().slice(0, 10), +(c * 0.98).toFixed(2), 1, 1, 1, 1000, +c.toFixed(2)]);
}
const filas = filasDe(serie);

// filasDe
check('filasDe usa el cierre real (índice 6)', filas.length === serie.length && filas[0].c === serie[0][6], filas[0]);
check('filasDe: los docs viejos [fecha, cierre]', JSON.stringify(filasDe([['2026-01-02', 10], ['2026-01-05', 11]])) === '[{"f":"2026-01-02","c":10},{"f":"2026-01-05","c":11}]');
check('filasDe descarta lo que no es una fila', filasDe([null, 'x', ['mal', 5], ['2026-01-02', 0], ['2026-01-03', 'a']]).length === 0 && filasDe(null).length === 0);

// la acción contra su índice desde la publicación
const bench = filas.map(r => ({ f: r.f, c: r.c * 2 }));
const fecha = filas[filas.length - 40].f;
const fig = figuraDesde({ ticker: 'KO', benchNom: 'S&P 500 (SPY)', filas, bench, fecha, precioPub: null });
const esperado = (filas[filas.length - 1].c / filas[filas.length - 40].c - 1) * 100;
check('desde: dibuja la figura con las dos series', fig.includes('<figure class="inf-fig">') && fig.includes('S&amp;P 500 (SPY)') && (fig.match(/<path /g) || []).length === 2);
check('desde: la variación es la del cierre de ese día a hoy', fig.includes('+' + esperado.toFixed(1).replace('.', ',') + '%'), esperado);
check('desde: con precio_pub, la base es ese precio', figuraDesde({ ticker: 'KO', benchNom: 'SPY', filas, bench, fecha, precioPub: filas[filas.length - 1].c }).includes('+0,0%'));
check('desde: un informe con menos de 5 ruedas no tiene figura', figuraDesde({ ticker: 'KO', benchNom: 'SPY', filas, bench, fecha: filas[filas.length - 4].f }) === '');
check('desde: sin fecha o sin historia, nada', figuraDesde({ ticker: 'KO', filas, bench, fecha: '' }) === '' && figuraDesde({ ticker: 'KO', filas: [], bench, fecha }) === '');
check('desde: sin índice dibuja solo la acción', (figuraDesde({ ticker: 'KO', benchNom: 'SPY', filas, bench: [], fecha }).match(/<path /g) || []).length === 1);
check('desde: escapa el ticker', !figuraDesde({ ticker: '<i>K', benchNom: 'SPY', filas, bench, fecha }).includes('<i>K'));
// sin el dibujo (va arriba del gráfico de TradingView): quedan los dos porcentajes, los mismos
const sola = figuraDesde({ ticker: 'KO', benchNom: 'S&P 500 (SPY)', filas, bench, fecha, precioPub: null, dibujo: false });
check('desde sin dibujo: los mismos porcentajes y ninguna curva', sola.includes('class="inf-fig sola"') && !sola.includes('<svg') && (sola.match(/\+[\d,]+%/g) || []).join() === (fig.match(/<b class="(?:up|dn)">(\+[\d,]+%)<\/b>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join() && sola.includes('S&amp;P 500 (SPY)'), sola.match(/\+[\d,]+%/g));
check('desde sin dibujo: dice de qué día a qué día', sola.includes(fecha.split('-').reverse().join('/')) && sola.includes(filas[filas.length - 1].f.split('-').reverse().join('/')));
check('desde sin dibujo: con datos de menos tampoco hay nada', figuraDesde({ ticker: 'KO', filas, bench, fecha: filas[filas.length - 4].f, dibujo: false }) === '' && !figuraDesde({ ticker: '<i>K', benchNom: 'SPY', filas, bench, fecha, dibujo: false }).includes('<i>K'));

// la empresa al lado de su familia
const veces = n => n.toFixed(1) + 'x';
const fam = figuraFamilia({ ticker: 'KO', familia: 'Consumo defensivo', items: [
  { nombre: 'P/E', valor: 27.4, mediana: 21.8, fmt: veces, mejor: 'bajo' }, { nombre: 'Margen operativo', valor: 30, mediana: 15, mejor: 'alto' },
  { nombre: 'Sin mediana', valor: 5, mediana: null }, { nombre: 'Negativo', valor: -3, mediana: 8 }] });
check('familia: entran solo los que tienen los dos números positivos', (fam.match(/class="f"/g) || []).length === 2 && !fam.includes('Sin mediana') && !fam.includes('Negativo'));
check('familia: usa el formato que le pasan y dice cuál es la familia', fam.includes('27.4x') && fam.includes('21.8x · familia') && fam.includes('Consumo defensivo'));
check('familia: la barra más larga es la del número más grande', /width:78\.0%"><\/i><em>27\.4x/.test(fam) && /width:39\.0%"><\/i><em>15/.test(fam), fam.match(/width:[\d.]+%/g));
check('familia: con menos de dos números no hay figura', figuraFamilia({ ticker: 'KO', items: [{ nombre: 'P/E', valor: 1, mediana: 2 }] }) === '' && figuraFamilia({ ticker: 'KO', items: [] }) === '');
check('estilos: vienen con el módulo', typeof CSS_FIGURAS === 'string' && CSS_FIGURAS.includes('.inf-fig'));

console.log(`test-informe-graficos: ${ok}/${ok + mal} ok`);
process.exit(mal ? 1 : 0);
