// nav-menu.js — navegación lateral compartida por todas las páginas.
// · Desktop: una franja invisible en el borde izquierdo (con un hilo dorado
//   como pista) abre el panel al pasar el cursor; se cierra al salir de él.
// · Mobile (<880px): el nav de escritorio se oculta y el botón ☰ abre el
//   mismo panel desde la derecha.
// Sin dependencias: se sirve como script clásico en cada página.
(function () {
  var nav = document.querySelector('nav');
  if (!nav || document.getElementById('vnav-burger')) return;

  var LINKS = [
    ['index.html', 'Inicio'],
    ['cartera.html', 'Carteras'],
    ['disciplina.html', 'Disciplina'],
    ['noticias.html', 'Noticias'],
    ['informes.html', 'Informes'],
    ['herramientas.html', 'Herramientas'],
    ['calendario.html', 'Calendario'],
    ['planes.html', 'Planes'],
  ];
  var aca = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  var st = document.createElement('style');
  st.textContent = [
    '#vnav-burger{display:none;align-items:center;justify-content:center;width:38px;height:34px;',
    'border:1px solid rgba(184,151,90,.45);border-radius:8px;background:transparent;cursor:pointer;',
    'flex-shrink:0;padding:0;margin-left:10px}',
    '#vnav-burger svg{display:block}',
    '@media(max-width:880px){#vnav-burger{display:flex}nav .nav-links{display:none!important}nav .nav-cta{display:none!important}}',
    '#vnav-back{position:fixed;inset:0;background:rgba(6,12,22,.55);z-index:998;opacity:0;',
    'pointer-events:none;transition:opacity .2s}',
    '#vnav-menu{position:fixed;top:0;right:0;height:100%;width:min(78vw,300px);z-index:999;',
    'background:#0D1B2A;color:#F0EDE8;box-shadow:-12px 0 40px rgba(0,0,0,.35);',
    'transform:translateX(105%);visibility:hidden;transition:transform .22s ease,visibility .22s;display:flex;flex-direction:column;',
    "padding:18px 0 24px;font-family:'Jost','IBM Plex Sans',sans-serif}",
    '#vnav-menu .vn-top{display:flex;align-items:center;justify-content:space-between;padding:0 20px 14px;',
    'border-bottom:1px solid rgba(184,151,90,.18)}',
    '#vnav-menu .vn-brand{font-size:12px;letter-spacing:.22em;color:#D4AF6E;text-transform:uppercase;font-weight:600}',
    '#vnav-menu .vn-x{background:none;border:none;color:rgba(240,237,232,.7);font-size:20px;cursor:pointer;padding:4px 8px}',
    '#vnav-menu a.vn-link{display:block;padding:14px 22px;color:rgba(240,237,232,.85);text-decoration:none;',
    'font-size:14px;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid rgba(184,151,90,.08)}',
    '#vnav-menu a.vn-link.on{color:#D4AF6E;font-weight:600}',
    '#vnav-menu a.vn-cta{margin:18px 20px 0;text-align:center;background:#B8975A;color:#0D1B2A;',
    'font-weight:600;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:13px 10px;',
    'border-radius:8px;text-decoration:none}',
    '@media(max-width:880px){body.vnav-open{overflow:hidden}}',
    'body.vnav-open #vnav-back{opacity:1;pointer-events:auto}',
    'body.vnav-open #vnav-menu{transform:translateX(0);visibility:visible}',
    // desktop: barra lateral oculta que aparece al pasar el cursor por el borde
    '#vnav-hot{position:fixed;left:0;top:0;width:16px;height:100%;z-index:997;display:none;cursor:pointer;',
    'border:none;background:transparent;padding:0;margin:0;outline:none}',
    '#vnav-hot:focus-visible::before{opacity:1;height:110px}',
    '#vnav-hot::before{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:72px;',
    'border-radius:0 3px 3px 0;background:#B8975A;opacity:.4;transition:opacity .2s,height .2s}',
    '#vnav-hot:hover::before{opacity:.95;height:110px}',
    '@media(min-width:881px){#vnav-hot{display:block}#vnav-back{display:none}',
    '#vnav-menu{left:0;right:auto;width:250px;transform:translateX(-105%);box-shadow:12px 0 40px rgba(0,0,0,.35)}',
    'body.vnav-open #vnav-menu{transform:translateX(0)}}',
  ].join('');
  document.head.appendChild(st);

  var btn = document.createElement('button');
  btn.id = 'vnav-burger';
  btn.setAttribute('aria-label', 'Abrir menú');
  btn.innerHTML = '<svg width="18" height="14" viewBox="0 0 18 14" fill="none">' +
    '<path d="M1 1h16M1 7h16M1 13h16" stroke="#B8975A" stroke-width="1.8" stroke-linecap="round"/></svg>';
  nav.appendChild(btn);

  var hot = document.createElement('button');
  hot.id = 'vnav-hot';
  hot.type = 'button';
  hot.setAttribute('aria-label', 'Abrir menú');
  hot.title = 'Menú';
  document.body.appendChild(hot);

  var back = document.createElement('div');
  back.id = 'vnav-back';
  var menu = document.createElement('div');
  menu.id = 'vnav-menu';
  menu.innerHTML =
    '<div class="vn-top"><span class="vn-brand">Valtia</span>' +
    '<button class="vn-x" aria-label="Cerrar menú">✕</button></div>' +
    LINKS.map(function (l) {
      var on = aca === l[0] || (aca === '' && l[0] === 'index.html');
      return '<a class="vn-link' + (on ? ' on' : '') + '" href="' + l[0] + '">' + l[1] + '</a>';
    }).join('') +
    '<a class="vn-link" id="vnav-tema" href="#" style="display:none">◐ &nbsp;Cambiar tema</a>' +
    '<a class="vn-cta" id="vnav-cta" href="index.html?login=1">Ingresar / Crear cuenta</a>' +
    '<div style="margin-top:auto;padding:18px 22px 0;font-size:10.5px;color:rgba(240,237,232,.4)">' +
    '<a href="terminos.html" style="color:inherit">Términos</a> · <a href="privacidad.html" style="color:inherit">Privacidad</a></div>';
  document.body.appendChild(back);
  document.body.appendChild(menu);

  // el CTA del panel refleja el estado de sesion VIGENTE cada vez que se abre
  // (mismo criterio que nav-auth: "Mi Panel" con sesion, login sin ella)
  function syncCta() {
    var cta = document.getElementById('vnav-cta');
    if (!cta) return;
    var navCta = document.querySelector('.nav-cta');
    var logged = !!document.getElementById('nav-mipanel') ||
                 (navCta && navCta.textContent.indexOf('Mi Panel') > -1);
    cta.textContent = logged ? 'Mi Panel' : 'Ingresar / Crear cuenta';
    cta.setAttribute('href', logged ? 'index.html' : 'index.html?login=1');
  }
  function abrir() {
    syncCta();
    // las paginas navy pierden su theme-btn (vive dentro de .nav-links):
    // el panel ofrece el toggle si la pagina lo tiene definido
    var t = document.getElementById('vnav-tema');
    if (t) t.style.display = (window.tg || window.toggleTheme) ? 'block' : 'none';
    document.body.classList.add('vnav-open');
  }
  function cerrar() { document.body.classList.remove('vnav-open'); }
  var esDesktop = function () { return window.matchMedia('(min-width:881px)').matches; };
  btn.addEventListener('click', abrir);
  back.addEventListener('click', cerrar);
  menu.querySelector('.vn-x').addEventListener('click', cerrar);
  // desktop: abrir al entrar en la franja del borde (con 120ms de intención,
  // para que un roce no lo dispare), cerrar al salir del panel; si el cursor
  // pasó por la franja pero nunca entró al panel, se cierra solo; y un clic
  // afuera también cierra.
  var tAbrir = null, dentro = false;
  hot.addEventListener('mouseenter', function () {
    if (!esDesktop()) return;
    clearTimeout(tAbrir);
    tAbrir = setTimeout(abrir, 120);
  });
  hot.addEventListener('mouseleave', function () {
    clearTimeout(tAbrir);
    if (!esDesktop()) return;
    setTimeout(function () { if (!dentro) cerrar(); }, 320);
  });
  hot.addEventListener('click', abrir);
  hot.addEventListener('focus', function () { if (esDesktop()) abrir(); });
  menu.addEventListener('mouseenter', function () { dentro = true; });
  menu.addEventListener('mouseleave', function () { dentro = false; if (esDesktop()) cerrar(); });
  document.addEventListener('pointerdown', function (e) {
    if (esDesktop() && document.body.classList.contains('vnav-open') &&
        !menu.contains(e.target) && !hot.contains(e.target)) cerrar();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });
  var tema = menu.querySelector('#vnav-tema');
  if (tema) tema.addEventListener('click', function (e) {
    e.preventDefault();
    var f = window.tg || window.toggleTheme;
    if (f) f();
  });
})();
