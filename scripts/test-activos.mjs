// node scripts/test-activos.mjs — verifica el mapa único de tickers
import * as A from '../activos.js?v=1';

const bonos = new Set(['AL30', 'AL30D', 'AL30C', 'GD35', 'GD35D', 'S15S6', 'BPA7D', 'BPB7D', 'TZX26']);
const casos = [
  ['base', A.base('GGAL.BA'), 'GGAL'],
  ['base', A.base('btc-usd'), 'BTC'],
  ['base', A.base(' al30d '), 'AL30D'],
  ['radarSym', A.radarSym('PAM'), 'PAMP'],
  ['radarSym', A.radarSym('YPF'), 'YPFD'],
  ['radarSym', A.radarSym('PAMP.BA'), 'PAMP'],
  ['radarSym', A.radarSym('BTC-USD'), 'BTC'],
  ['tickerFicha', A.tickerFicha('PAMP'), 'PAM'],
  ['tickerFicha', A.tickerFicha('YPFD.BA'), 'YPF'],
  ['tickerFicha', A.tickerFicha('GGAL.BA'), 'GGAL'],
  ['tickerFicha', A.tickerFicha('ETH-USD'), 'ETH'],
  ['tickerFicha', A.tickerFicha('AL30'), null],
  ['tickerFicha', A.tickerFicha('ZZZZ'), null],
  ['nombreDe', A.nombreDe('PAMP.BA'), 'Pampa Energía'],
  ['esRentaFija', A.esRentaFija('AL30D', bonos), true],
  ['esRentaFija', A.esRentaFija('S15S6', bonos), true],
  ['esRentaFija', A.esRentaFija('GD41', new Set()), true],
  ['esRentaFija', A.esRentaFija('T15D5'), true],
  ['esRentaFija', A.esRentaFija('GGAL.BA', bonos), false],
  ['esRentaFija', A.esRentaFija('NVDA', bonos), false],
  ['esRentaFija', A.esRentaFija('BPA7D', bonos), true],
  // el Bopreal ES la especie: bonosFlujos lo indexa con la D incluida
  ['parBono', A.parBono('BPA7D'), 'BPA7'],
  ['especieBono', A.especieBono('BPA7D'), 'BPA7D'],
  ['especieBono', A.especieBono('AL30'), 'AL30D'],
  ['especieBono', A.especieBono('AL30D'), 'AL30D'],
  ['especieBono', A.especieBono('GD35C'), 'GD35C'],
  ['especieBono', A.especieBono('S15S6'), 'S15S6'],
  ['parBono', A.parBono('AL30D'), 'AL30'],
  ['parBono', A.parBono('S15S6'), 'S15S6'],
  ['linkDe', A.linkDe('GGAL.BA'), 'activo.html?t=GGAL'],
  ['linkDe', A.linkDe('PAMP'), 'activo.html?t=PAM'],
  ['linkDe', A.linkDe('AL30', bonos), 'bono.html?e=AL30D'],
  ['linkDe', A.linkDe('S15S6', bonos), 'bono.html?e=S15S6'],
  ['linkDe', A.linkDe('ZZZZ'), null],
  ['monedaProbable', A.monedaProbable('GGAL.BA'), 'ARS'],
  ['monedaProbable', A.monedaProbable('AL30', bonos), 'ARS'],
  ['monedaProbable', A.monedaProbable('AL30D', bonos), 'USD'],
  ['monedaProbable', A.monedaProbable('NVDA'), 'USD'],
  ['mercadoDe', A.mercadoDe('GGAL.BA'), 'byma'],
  ['mercadoDe', A.mercadoDe('BTC-USD'), 'cripto'],
  ['mercadoDe', A.mercadoDe('AL30', bonos), 'rf'],
  ['mercadoDe', A.mercadoDe('NVDA'), 'ext'],
];
let mal = 0;
for (const [f, got, esp] of casos) {
  if (got !== esp) { mal++; console.log(`FALLA ${f}: obtuve ${JSON.stringify(got)} esperaba ${JSON.stringify(esp)}`); }
}
console.log(mal ? `${mal} fallas de ${casos.length}` : `OK ${casos.length} casos`);
process.exit(mal ? 1 : 0);
