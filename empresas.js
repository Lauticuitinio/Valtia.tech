/* Mapa empresa ↔ informe, compartido por informes.html y nota.html.
   claves: substrings (en minúsculas) que identifican a la empresa en el
   texto de una noticia. Cuidado con palabras ambiguas ("meta" solo va
   como "meta platforms"). */
export const EMPRESAS = [
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
];

export const SECTORES = [
  { k: "arg",     n: "Argentina" },
  { k: "tech",    n: "Tecnología e IA" },
  { k: "consumo", n: "Consumo" },
  { k: "fin",     n: "Financieras" },
  { k: "salud",   n: "Salud" },
  { k: "macro",   n: "Macro y sectores" },
];

/* Empresas con informe mencionadas en un texto (ya en minúsculas). */
export const mencionadas = (texto, max = 2) =>
  EMPRESAS.filter(e => e.claves.some(k => texto.includes(k))).slice(0, max);
