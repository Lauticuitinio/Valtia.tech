/* Catálogo de activos de Valtia, compartido por informes.html, nota.html y
   activo.html. Los que tienen `slug` tienen informe publicado; el resto solo
   ficha (precio, gráfico, radar si corresponde, noticias).
   claves: substrings (en minúsculas) que identifican al activo en el texto
   de una noticia. Cuidado con palabras ambiguas ("meta" solo va como
   "meta platforms").
   AL AGREGAR/EDITAR: bumpear ?v= de empresas.js en las TRES páginas, y si el
   activo es nuevo correr fondo-sync/informes_live.py (precios+historial). */
export const EMPRESAS = [
  /* ── con informe publicado ── */
  { sector: "arg", slug: "informe-ypf",   ticker: "YPF",   nombre: "YPF",               claves: ["ypf"] },
  { sector: "arg", slug: "informe-pampa", ticker: "PAM",   nombre: "Pampa Energía",     claves: ["pampa energ"] },
  { sector: "arg", slug: "informe-ggal",  ticker: "GGAL",  nombre: "Grupo Galicia",     claves: ["grupo galicia", "banco galicia", "ggal"] },
  { sector: "tech", slug: "informe-nvda",  ticker: "NVDA",  nombre: "NVIDIA",            claves: ["nvidia", "nvda"] },
  { sector: "tech", slug: "informe-mu",    ticker: "MU",    nombre: "Micron",            claves: ["micron"] },
  { sector: "tech", slug: "informe-intc",  ticker: "INTC",  nombre: "Intel",             claves: ["intel "] },
  { sector: "consumo", slug: "informe-wmt",   ticker: "WMT",   nombre: "Walmart",           claves: ["walmart"] },
  { sector: "consumo", slug: "informe-nke",   ticker: "NKE",   nombre: "Nike",              claves: ["nike"] },
  { sector: "tech", slug: "informe-nflx",  ticker: "NFLX",  nombre: "Netflix",           claves: ["netflix"] },
  { sector: "consumo", slug: "informe-mcd",   ticker: "MCD",   nombre: "McDonald's",        claves: ["mcdonald"] },
  { sector: "consumo", slug: "informe-ko",    ticker: "KO",    nombre: "Coca-Cola",         claves: ["coca-cola", "coca cola"] },
  { sector: "fin", slug: "informe-ma",    ticker: "MA",    nombre: "Mastercard",        claves: ["mastercard"] },
  { sector: "tech", slug: "informe-meta",  ticker: "META",  nombre: "Meta",              claves: ["meta platforms", "facebook", "instagram", "zuckerberg"] },
  { sector: "tech", slug: "informe-msft",  ticker: "MSFT",  nombre: "Microsoft",         claves: ["microsoft"] },
  { sector: "tech", slug: "informe-googl", ticker: "GOOGL", nombre: "Alphabet",          claves: ["alphabet", "google"] },
  { sector: "tech", slug: "informe-meli",  ticker: "MELI",  nombre: "MercadoLibre",      claves: ["mercadolibre", "mercado libre"] },
  { sector: "salud", slug: "informe-jnj",   ticker: "JNJ",   nombre: "Johnson & Johnson", claves: ["johnson & johnson", "johnson y johnson"] },
  { sector: "fin", slug: "informe-cme",   ticker: "CME",   nombre: "CME Group",         claves: ["cme group"] },
  /* ── solo ficha (sin informe todavía) ── */
  { sector: "tech", ticker: "AAPL", nombre: "Apple",            claves: ["apple"] },
  { sector: "tech", ticker: "AMZN", nombre: "Amazon",           claves: ["amazon"] },
  { sector: "tech", ticker: "TSLA", nombre: "Tesla",            claves: ["tesla"] },
  { sector: "tech", ticker: "AVGO", nombre: "Broadcom",         claves: ["broadcom"] },
  { sector: "tech", ticker: "TSM",  nombre: "TSMC",             claves: ["tsmc", "taiwan semiconductor"] },
  { sector: "fin",  ticker: "JPM",  nombre: "JPMorgan",         claves: ["jpmorgan", "jp morgan"] },
  { sector: "fin",  ticker: "V",    nombre: "Visa",             claves: ["visa"] },
  { sector: "arg",  ticker: "VIST", nombre: "Vista Energy",     claves: ["vista energy", "vista oil"] },
  { sector: "arg",  ticker: "BMA",  nombre: "Banco Macro",      claves: ["banco macro"] },
  { sector: "arg",  ticker: "CEPU", nombre: "Central Puerto",   claves: ["central puerto"] },
  { sector: "arg",  ticker: "TGS",  nombre: "Transp. Gas del Sur", claves: ["transportadora de gas"] },
  { sector: "cripto", ticker: "BTC", nombre: "Bitcoin",         claves: ["bitcoin"] },
  { sector: "cripto", ticker: "ETH", nombre: "Ethereum",        claves: ["ethereum"] },
  { sector: "etf", ticker: "SPY", nombre: "S&P 500 (SPY)",      claves: ["s&p 500", "sp 500"] },
  { sector: "etf", ticker: "QQQ", nombre: "Nasdaq 100 (QQQ)",   claves: ["nasdaq"] },
];

export const SECTORES = [
  { k: "arg",     n: "Argentina" },
  { k: "tech",    n: "Tecnología e IA" },
  { k: "consumo", n: "Consumo" },
  { k: "fin",     n: "Financieras" },
  { k: "salud",   n: "Salud" },
  { k: "cripto",  n: "Cripto" },
  { k: "etf",     n: "ETFs e índices" },
  { k: "macro",   n: "Macro y sectores" },
];

/* Empresas/activos mencionados en un texto (ya en minúsculas). */
export const mencionadas = (texto, max = 2) =>
  EMPRESAS.filter(e => e.claves.some(k => texto.includes(k))).slice(0, max);
