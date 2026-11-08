// Panel web de Jujuy Ciudad Pass: login, sesión y navegación según el rol.
import { get, post, alPerderSesion } from './api.js';
import {
  h, boton, vaciar, toast, toastError, campo, validar, errorFormulario, conCarga, marcarError,
  estadoCarga, estadoError, modalFormulario, ROLES, icono,
} from './ui.js';
import { logo, cerros } from './iconos.js';

const URL_APK = '/descargas/jujuy-pass.apk';
const MODULOS = {
  negocio: () => import('./negocio.js'),
  residente: () => import('./residente.js'),
  admin: () => import('./admin.js'),
};

const app = document.getElementById('app');
let usuario = null;
let modulo = null;
let limpiezaSeccion = null;
let enLogin = false;
let navegacion = 0;
let refs = {};

/* ------------------------------------------------------------------ Inicio */

async function iniciar() {
  alPerderSesion((err) => {
    if (enLogin) return;
    mostrarLogin({
      aviso: err?.codigo === 'CUENTA_BLOQUEADA'
        ? (err.message || 'Tu cuenta fue bloqueada. Comunicate con la administración.')
        : 'Tu sesión venció o se cerró. Volvé a ingresar para seguir.',
    });
  });
  window.addEventListener('hashchange', () => { if (!enLogin && modulo) mostrarSeccion(); });

  estadoCarga(app, 'Cargando el panel…');
  try {
    const r = await get('/auth/yo', null, { ignorar401: true });
    usuario = r?.usuario ?? r;
    await entrarAlPanel();
  } catch (err) {
    if (err.sesionPerdida) mostrarLogin(err.codigo === 'CUENTA_BLOQUEADA' ? { aviso: err.message } : {});
    else if (err.codigo === 'ROL_NO_PERMITIDO_EN_CLIENTE') mostrarLogin({ esTurista: true });
    else {
      vaciar(app);
      const cont = h('main', { class: 'pantalla-login', id: 'contenido' }, h('div', { class: 'tarjeta' }));
      app.append(cont);
      estadoError(cont.firstChild, err, () => iniciar());
    }
  }
}

/* ------------------------------------------------------------------ Login */

function bloqueTurista() {
  return h('div', { class: 'aviso aviso-info', role: 'alert' },
    icono('android'),
    h('div', {},
      h('strong', {}, 'Esta es una cuenta de turista.'),
      h('p', { class: 'sin-margen' }, 'Los turistas usan Jujuy Ciudad Pass solo desde la app para Android. Este panel es para negocios, residentes y administración.'),
      h('a', { class: 'btn btn-turquesa btn-chico mt-1', href: URL_APK, download: '' }, icono('descarga'), h('span', {}, 'Descargar la app (Android)'))));
}

function mostrarLogin({ aviso, esTurista = false } = {}) {
  enLogin = true;
  limpiarSeccion();
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  usuario = null;
  modulo = null;
  document.title = 'Ingresar · Jujuy Ciudad Pass';

  const cEmail = campo({ etiqueta: 'Email', nombre: 'email', tipo: 'email', requerido: true, atributos: { autocomplete: 'username', maxlength: 254, inputmode: 'email', spellcheck: 'false' } });
  const cPass = campo({ etiqueta: 'Contraseña', nombre: 'password', tipo: 'password', requerido: true, atributos: { autocomplete: 'current-password', maxlength: 128 } });
  const verPass = h('label', { class: 'check texto-chico' }, h('input', { type: 'checkbox', on: { change: (e) => { cPass.control.type = e.target.checked ? 'text' : 'password'; } } }), h('span', {}, 'Mostrar contraseña'));
  const bIngresar = boton('Ingresar', { clase: 'btn-primario btn-bloque btn-grande', tipo: 'submit', icono: 'entrar' });
  const zonaTurista = h('div', {});
  if (esTurista) zonaTurista.append(bloqueTurista());

  const form = h('form', { novalidate: true, 'aria-label': 'Ingresar al panel' },
    aviso ? h('div', { class: 'aviso', role: 'status' }, icono('info'), h('div', {}, aviso)) : null,
    zonaTurista, cEmail, cPass, verPass, h('div', { class: 'mt-2' }, bIngresar));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorFormulario(form, null);
    vaciar(zonaTurista);
    if (!validar(form)) return;
    const email = cEmail.control.value.trim();
    const password = cPass.control.value; // las contraseñas no se recortan
    await conCarga(bIngresar, async () => {
      try {
        const r = await post('/auth/login', { email, password, cliente: 'web' }, { ignorar401: true });
        usuario = r?.usuario ?? r;
        if (!usuario || !usuario.rol) {
          const yo = await get('/auth/yo', null, { ignorar401: true });
          usuario = yo?.usuario ?? yo;
        }
        await entrarAlPanel();
        toast(`¡Hola, ${usuario.nombre}!`, 'ok');
      } catch (err) {
        if (err.codigo === 'ROL_NO_PERMITIDO_EN_CLIENTE') {
          zonaTurista.append(bloqueTurista());
          zonaTurista.querySelector('a')?.focus();
        } else {
          errorFormulario(form, err);
          if (err.codigo === 'CREDENCIALES_INVALIDAS') cPass.control.select();
        }
      }
    });
  });

  vaciar(app).append(
    h('main', { class: 'pantalla-login', id: 'contenido' },
      cerros(),
      h('div', { class: 'tarjeta' },
        h('div', { class: 'login-marca' },
          logo(),
          h('h1', { class: 'sin-margen' }, 'Ingresar al panel'),
          h('p', { class: 'texto-2 sin-margen' }, 'Para negocios adheridos, residentes y administración.')),
        form,
        h('p', { class: 'texto-chico texto-2 mt-2 sin-margen' },
          '¿Sos turista? ', h('a', { href: URL_APK, download: '' }, 'Descargá la app para Android'), '.'),
        h('p', { class: 'texto-chico mt-1 sin-margen' }, h('a', { href: './' }, '← Volver a la portada')))));
  cEmail.control.focus();
}

/* ------------------------------------------------------------------ Panel */

async function entrarAlPanel() {
  if (usuario?.rol === 'turista' || !MODULOS[usuario?.rol]) {
    // No debería pasar (el servidor rechaza turistas en web), pero por las dudas.
    try { await post('/auth/logout', undefined, { ignorar401: true }); } catch { /* nada */ }
    mostrarLogin({ esTurista: usuario?.rol === 'turista', aviso: usuario?.rol === 'turista' ? null : 'Tu cuenta no tiene acceso a este panel.' });
    return;
  }
  modulo = await MODULOS[usuario.rol]();
  enLogin = false;
  armarEstructura();
  await mostrarSeccion();
}

function armarEstructura() {
  const menuId = 'menu-principal';
  const bMenu = boton('', { clase: 'btn-fantasma btn-icono btn-menu', icono: 'menu', etiqueta: 'Abrir menú', 'aria-controls': menuId, 'aria-expanded': 'false', on: () => abrirMenu(true) });
  const chip = h('div', { class: 'usuario-chip' });
  const marcaSub = h('small', {});
  const bSalir = boton('', { clase: 'btn-fantasma btn-icono', icono: 'salir', etiqueta: 'Cerrar sesión', title: 'Cerrar sesión', on: (e) => cerrarSesion(e.currentTarget) });

  const lista = h('ul', {});
  for (const s of modulo.secciones) {
    lista.append(h('li', {}, h('a', { href: '#/' + s.id, dataset: { seccion: s.id } }, icono(s.icono), h('span', {}, s.titulo))));
  }
  const menu = h('nav', { class: 'menu', id: menuId, 'aria-label': 'Secciones del panel' },
    h('div', { class: 'menu-cabecera' }, h('strong', {}, 'Menú'), boton('', { clase: 'btn-fantasma btn-icono', icono: 'cerrar', etiqueta: 'Cerrar menú', on: () => abrirMenu(false) })),
    lista,
    h('div', { class: 'menu-pie' },
      h('button', { type: 'button', class: 'menu-item', on: { click: () => { abrirMenu(false); cambiarPassword(); } } }, icono('llave'), h('span', {}, 'Cambiar contraseña')),
      h('button', { type: 'button', class: 'menu-item', on: { click: (e) => { abrirMenu(false); cerrarSesion(e.currentTarget); } } }, icono('salir'), h('span', {}, 'Cerrar sesión'))));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) abrirMenu(false); });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { abrirMenu(false); bMenu.focus(); } });
  const velo = h('div', { class: 'velo', on: { click: () => abrirMenu(false) } });
  const main = h('main', { class: 'contenido', id: 'contenido', tabindex: '-1' });

  const saltar = h('a', { class: 'saltar', href: '#contenido', on: { click: (e) => { e.preventDefault(); main.focus(); } } }, 'Saltar al contenido');

  vaciar(app).append(
    saltar,
    h('header', { class: 'cabecera' },
      h('div', { class: 'cabecera-int' },
        bMenu,
        h('a', { class: 'marca', href: '#/' + modulo.secciones[0].id }, logo(), h('span', { class: 'marca-texto' }, h('strong', {}, 'Jujuy Ciudad Pass'), marcaSub)),
        h('div', { class: 'espacio' }),
        chip, bSalir)),
    h('div', { class: 'panel' }, menu, velo, main));

  refs = { menu, velo, main, bMenu, chip, marcaSub, lista };
  pintarUsuario();
}

function pintarUsuario() {
  if (!refs.chip || !usuario) return;
  vaciar(refs.chip).append(h('strong', {}, usuario.nombre || usuario.email), h('small', {}, ROLES[usuario.rol] || usuario.rol));
  refs.marcaSub.textContent = usuario.rol === 'negocio' && usuario.negocio?.nombre
    ? usuario.negocio.nombre
    : 'Panel de ' + (ROLES[usuario.rol] || '').toLowerCase();
}

function abrirMenu(abrir) {
  if (!refs.menu) return;
  refs.menu.classList.toggle('abierto', abrir);
  refs.velo.classList.toggle('visible', abrir);
  refs.bMenu.setAttribute('aria-expanded', String(abrir));
  if (abrir) refs.menu.querySelector('a[aria-current="page"], a')?.focus();
}

function leerRuta() {
  const crudo = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
  const [id, consulta = ''] = crudo.split('?');
  return { id: decodeURIComponent(id || ''), params: new URLSearchParams(consulta) };
}

function limpiarSeccion() {
  if (typeof limpiezaSeccion === 'function') {
    try { limpiezaSeccion(); } catch { /* nada */ }
  }
  limpiezaSeccion = null;
}

async function mostrarSeccion() {
  const { id, params } = leerRuta();
  const seccion = modulo.secciones.find((s) => s.id === id) || modulo.secciones[0];
  if (seccion.id !== id) {
    history.replaceState(null, '', '#/' + seccion.id);
  }
  const yo = ++navegacion;
  limpiarSeccion();
  for (const a of refs.lista.querySelectorAll('a')) {
    if (a.dataset.seccion === seccion.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.title = `${seccion.titulo} · Jujuy Ciudad Pass`;
  const main = refs.main;
  vaciar(main);
  const ctx = {
    usuario: () => usuario,
    params,
    ir: (destino, consulta) => {
      const q = consulta ? '?' + new URLSearchParams(consulta).toString() : '';
      const nuevo = '#/' + destino + q;
      if (location.hash === nuevo) mostrarSeccion(); else location.hash = nuevo;
    },
    recargar: () => mostrarSeccion(),
    refrescarUsuario: async () => {
      const r = await get('/auth/yo');
      usuario = r?.usuario ?? r;
      pintarUsuario();
      return usuario;
    },
    actualizarUsuario: (cambios) => { usuario = { ...usuario, ...cambios }; pintarUsuario(); },
  };
  try {
    const limpiar = await seccion.render(main, ctx);
    if (yo === navegacion) limpiezaSeccion = limpiar || null;
    else if (typeof limpiar === 'function') limpiar();
  } catch (err) {
    if (err?.sesionPerdida) return;
    console.error(err);
    estadoError(main, err, () => mostrarSeccion());
  }
  if (yo === navegacion && document.activeElement === document.body) {
    main.querySelector('.foco-seccion')?.focus({ preventScroll: true });
  }
}

/* ------------------------------------------------------------------ Cuenta */

function cambiarPassword() {
  const cActual = campo({ etiqueta: 'Contraseña actual', nombre: 'actual', tipo: 'password', requerido: true, atributos: { autocomplete: 'current-password', maxlength: 128 } });
  const cNueva = campo({ etiqueta: 'Contraseña nueva', nombre: 'nueva', tipo: 'password', requerido: true, ayuda: 'Mínimo 8 caracteres. Al cambiarla se cierran tus otras sesiones abiertas.', atributos: { autocomplete: 'new-password', minlength: 8, maxlength: 128 } });
  const cRepetir = campo({ etiqueta: 'Repetí la contraseña nueva', nombre: 'repetir', tipo: 'password', requerido: true, atributos: { autocomplete: 'new-password', maxlength: 128 } });
  modalFormulario({
    titulo: 'Cambiar contraseña',
    campos: [cActual, cNueva, cRepetir],
    textoEnviar: 'Cambiar contraseña',
    antesDeValidar: () => {
      cRepetir.control.setCustomValidity('');
      cNueva.control.setCustomValidity('');
      if (cRepetir.control.value && cRepetir.control.value !== cNueva.control.value) cRepetir.control.setCustomValidity('Las contraseñas no coinciden.');
      if (cNueva.control.value && cNueva.control.value === cActual.control.value) cNueva.control.setCustomValidity('La contraseña nueva tiene que ser distinta de la actual.');
    },
    enviar: async () => {
      try {
        await post('/auth/cambiar-password', { actual: cActual.control.value, nueva: cNueva.control.value });
      } catch (err) {
        if (err.codigo === 'PASSWORD_ACTUAL_INCORRECTA') {
          // Mensaje general + marca en el campo; dejamos el foco ahí para reescribirla.
          setTimeout(() => { marcarError(cActual.control, 'La contraseña actual no es correcta.'); cActual.control.select(); }, 0);
        }
        throw err;
      }
      toast('Listo: cambiaste tu contraseña. Se cerraron tus otras sesiones.', 'ok');
      return true;
    },
  });
}

async function cerrarSesion(btn) {
  await conCarga(btn, async () => {
    try {
      await post('/auth/logout', undefined, { ignorar401: true });
    } catch (err) {
      if (!err.sesionPerdida) { toastError(err, 'No se pudo cerrar la sesión'); return; }
    }
    mostrarLogin({ aviso: 'Cerraste sesión. ¡Hasta pronto!' });
  });
}

iniciar();
