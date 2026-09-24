// panel-movimientos.js — pestaña "Movimientos" del panel del inversor (Panel v3,
// id 'historial', grupo "Tus inversiones"). El id NO es 'movimientos' porque ese ya
// lo usa la gestión del fondo (Posiciones, #tab-movimientos de fondo-live.js).
//
// PLACEHOLDER: por ahora solo dice qué va a haber acá. La lista real de compras y
// ventas —con filtros y exportación— la arma otro módulo que reemplaza este
// archivo entero. No importa panel.js (sería un import circular): todo llega por
// ctx, y la navegación es la de siempre, data-go, que resuelve panel.js.
const CSS_ID = 'v3-css-movimientos';

/* ───────────────────────── estilos ───────────────────────── */
const CSS = `
.v3mv{font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);min-width:0;max-width:1200px}
.v3mv *{box-sizing:border-box}
.v3mv-card{background:var(--v3-card);border:1px solid var(--v3-line);border-radius:12px;padding:22px 24px;max-width:560px}
.v3mv-card b{display:block;font:600 15.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--v3-ink);line-height:1.3}
.v3mv-card p{font-size:13.5px;color:var(--v3-sub);line-height:1.65;margin:8px 0 16px}
.v3mv-btn{display:inline-block;font:600 10.5px 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:var(--v3-ink);background:transparent;border:1px solid var(--v3-line);border-radius:6px;padding:9px 16px;text-decoration:none;
  white-space:nowrap;cursor:pointer;transition:border-color .15s}
.v3mv-btn:hover{border-color:var(--v3-ink)}
`;

function ponerCss() {
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ───────────────────────── entrada ───────────────────────── */
export async function renderMovimientos(el, ctx) {
  if (!el || !ctx) return;
  try {
    ponerCss();
    el.innerHTML = `<div class="v3mv"><div class="v3mv-card"><b>Movimientos</b>
      <p>Muy pronto vas a ver acá todas tus compras y ventas en una sola lista, con filtros y exportación.</p>
      <a class="v3mv-btn" href="#panel/micartera" data-go="micartera">Ir a Mi cartera</a></div></div>`;
  } catch (e) {}
}
