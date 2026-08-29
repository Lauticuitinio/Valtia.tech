/* Mapa empresa ↔ informe, compartido por informes.html y nota.html.
   claves: substrings (en minúsculas) que identifican a la empresa en el
   texto de una noticia. Cuidado con palabras ambiguas ("meta" solo va
   como "meta platforms"). */
export const EMPRESAS = [
  { slug: "informe-ypf",   ticker: "YPF",   nombre: "YPF",               claves: ["ypf"] },
  { slug: "informe-pampa", ticker: "PAM",   nombre: "Pampa Energía",     claves: ["pampa energ"] },
  { slug: "informe-ggal",  ticker: "GGAL",  nombre: "Grupo Galicia",     claves: ["grupo galicia", "banco galicia", "ggal"] },
  { slug: "informe-nvda",  ticker: "NVDA",  nombre: "NVIDIA",            claves: ["nvidia", "nvda"] },
  { slug: "informe-mu",    ticker: "MU",    nombre: "Micron",            claves: ["micron"] },
  { slug: "informe-intc",  ticker: "INTC",  nombre: "Intel",             claves: ["intel "] },
  { slug: "informe-wmt",   ticker: "WMT",   nombre: "Walmart",           claves: ["walmart"] },
  { slug: "informe-nke",   ticker: "NKE",   nombre: "Nike",              claves: ["nike"] },
  { slug: "informe-nflx",  ticker: "NFLX",  nombre: "Netflix",           claves: ["netflix"] },
  { slug: "informe-mcd",   ticker: "MCD",   nombre: "McDonald's",        claves: ["mcdonald"] },
  { slug: "informe-ko",    ticker: "KO",    nombre: "Coca-Cola",         claves: ["coca-cola", "coca cola"] },
  { slug: "informe-ma",    ticker: "MA",    nombre: "Mastercard",        claves: ["mastercard"] },
  { slug: "informe-meta",  ticker: "META",  nombre: "Meta",              claves: ["meta platforms", "facebook", "instagram", "zuckerberg"] },
  { slug: "informe-msft",  ticker: "MSFT",  nombre: "Microsoft",         claves: ["microsoft"] },
  { slug: "informe-googl", ticker: "GOOGL", nombre: "Alphabet",          claves: ["alphabet", "google"] },
  { slug: "informe-meli",  ticker: "MELI",  nombre: "MercadoLibre",      claves: ["mercadolibre", "mercado libre"] },
  { slug: "informe-jnj",   ticker: "JNJ",   nombre: "Johnson & Johnson", claves: ["johnson & johnson", "johnson y johnson"] },
  { slug: "informe-cme",   ticker: "CME",   nombre: "CME Group",         claves: ["cme group"] },
];

/* Empresas con informe mencionadas en un texto (ya en minúsculas). */
export const mencionadas = (texto, max = 2) =>
  EMPRESAS.filter(e => e.claves.some(k => texto.includes(k))).slice(0, max);
