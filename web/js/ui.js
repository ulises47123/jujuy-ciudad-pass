// Utilidades de interfaz: creación segura de DOM, toasts, modales, confirmaciones,
// estados de carga/vacío/error, formularios con validación y formateo.
// Regla: los datos del servidor se insertan SIEMPRE como texto (textContent / nodos de texto).

import { icono } from './iconos.js';

/* ------------------------------------------------------------------ DOM */

/**
 * Crea un elemento. h('button', {class:'btn', on:{click: fn}}, 'Texto', otroNodo)
 * Los hijos string se insertan como nodos de texto (nunca como HTML).
 */
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (['value', 'checked', 'selected', 'disabled', 'hidden', 'required', 'multiple', 'readOnly'].includes(k)) el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

/** Escapa texto para los (pocos) casos en que haga falta armar HTML. */
export function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function vaciar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function boton(texto, { clase = '', icono: ic, on, tipo = 'button', etiqueta, ...resto } = {}) {
  const b = h('button', { type: tipo, class: ('btn ' + clase).trim(), 'aria-label': etiqueta, ...resto });
  if (ic) b.append(icono(ic));
  if (texto) b.append(h('span', {}, texto));
  if (on) b.addEventListener('click', on);
  return b;
}

let contadorIds = 0;
export const nuevoId = (p = 'id') => `${p}-${++contadorIds}`;

export function debounce(fn, ms = 350) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------------------------------------------ Toasts */

let zonaToasts;
export function toast(mensaje, tipo = 'info', duracion) {
  if (!zonaToasts) {
    zonaToasts = h('div', { class: 'toasts', role: 'region', 'aria-label': 'Notificaciones' });
    document.body.append(zonaToasts);
  }
  const ic = { ok: 'checkCirculo', error: 'alerta', info: 'info' }[tipo] || 'info';
  const t = h('div', { class: `toast toast-${tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    icono(ic), h('span', {}, mensaje));
  const cerrar = () => t.remove();
  t.append(h('button', { type: 'button', 'aria-label': 'Cerrar notificación', on: { click: cerrar } }, '×'));
  zonaToasts.append(t);
  while (zonaToasts.children.length > 3) zonaToasts.firstElementChild.remove();
  setTimeout(cerrar,duracion ?? (tipo === 'error' ? 7000 : 4000));
  return t;
}

/** Muestra un error (ApiError u otro) como toast. */
export function toastError(err, prefijo = '') {
  const msg = err?.message || 'Ocurrió un error inesperado.';
  toast(prefijo ? `${prefijo}: ${msg}` : msg, 'error');
}

/* ------------------------------------------------------------------ Modales */

/**
 * Abre un modal accesible (<dialog> nativo: atrapa el foco y cierra con Esc).
 * @returns {{dialog, cuerpo, pie, cerrar}}
 */
export function abrirModal({ titulo, contenido, pie, ancho = false, alCerrar, cerrable = true } = {}) {
  const idTitulo = nuevoId('modal-titulo');
  const previo = document.activeElement;
  const cuerpo = h('div', { class: 'modal-cuerpo' });
  const zonaPie = h('div', { class: 'modal-pie' });
  const dialog = h('dialog', { class: 'modal' + (ancho ? ' ancho' : ''), 'aria-labelledby': idTitulo },
    h('div', { class: 'modal-cabecera' },
      h('h2', { id: idTitulo }, titulo),
      cerrable ? boton('', { clase: 'btn-fantasma btn-icono', icono: 'cerrar', etiqueta: 'Cerrar', on: () => cerrar() }) : null),
    cuerpo, zonaPie);
  if (contenido) agregar(cuerpo, [contenido]);
  if (pie) agregar(zonaPie, [pie]); else zonaPie.hidden = true;

  let cerrado = false;
  function cerrar(valor) {
    if (cerrado) return;
    cerrado = true;
    try { dialog.close(); } catch { /* ya cerrado */ }
    dialog.remove();
    if (previo && typeof previo.focus === 'function' && document.contains(previo)) previo.focus();
    alCerrar?.(valor);
  }
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); if (cerrable) cerrar(); });
  dialog.addEventListener('close', () => cerrar());
  // Clic en el fondo cierra (solo si el clic empezó y terminó fuera del contenido).
  let abajoEnFondo = false;
  dialog.addEventListener('mousedown', (e) => { abajoEnFondo = e.target === dialog; });
  dialog.addEventListener('click', (e) => { if (cerrable && abajoEnFondo && e.target === dialog) cerrar(); });

  document.body.append(dialog);
  dialog.showModal();
  const primero = cuerpo.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea');
  (primero || dialog.querySelector('.modal-pie .btn, .modal-cabecera .btn'))?.focus();
  return { dialog, cuerpo, pie: zonaPie, cerrar };
}

/** Pide confirmación. Resuelve true/false. */
export function confirmar({ titulo = '¿Confirmás?', mensaje, detalle, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', peligro = false } = {}) {
  return new Promise((resolver) => {
    let resultado = false;
    const bCancelar = boton(textoCancelar, { on: () => m.cerrar() });
    const bOk = boton(textoConfirmar, {
      clase: peligro ? 'btn-peligro' : 'btn-primario',
      on: () => { resultado = true; m.cerrar(); },
    });
    const contenido = [h('p', {}, mensaje)];
    if (detalle) contenido.push(detalle instanceof Node ? detalle : h('p', { class: 'texto-2 texto-chico' }, detalle));
    const m = abrirModal({ titulo, contenido, pie: [bCancelar, bOk], alCerrar: () => resolver(resultado) });
    (peligro ? bCancelar : bOk).focus();
  });
}

/** Pide un texto (por ejemplo, el motivo de un rechazo). Resuelve el texto o null si cancela. */
export function pedirTexto({ titulo, mensaje, etiqueta = 'Motivo', textoConfirmar = 'Aceptar', requerido = true, min = 3, max = 300, peligro = false, valor = '' } = {}) {
  return new Promise((resolver) => {
    let resultado = null;
    const c = campo({ etiqueta, nombre: 'texto', tipo: 'textarea', requerido, valor, atributos: { minlength: requerido ? min : undefined, maxlength: max }, ayuda: `Máximo ${max} caracteres.` });
    const form = h('form', { novalidate: true }, mensaje ? h('p', {}, mensaje) : null, c);
    const enviar = (e) => {
      e?.preventDefault();
      if (!validar(form)) return;
      resultado = c.control.value.trim();
      m.cerrar();
    };
    form.addEventListener('submit', enviar);
    const m = abrirModal({
      titulo, contenido: form,
      pie: [boton('Cancelar', { on: () => m.cerrar() }), boton(textoConfirmar, { clase: peligro ? 'btn-peligro' : 'btn-primario', on: enviar })],
      alCerrar: () => resolver(resultado),
    });
  });
}

/* ------------------------------------------------------------------ Carga */

/** Ejecuta fn mostrando el botón "cargando" y deshabilitado. Devuelve lo que devuelva fn. */
export async function conCarga(btn, fn) {
  if (!btn) return fn();
  if (btn.dataset.ocupado === '1') return undefined;
  btn.dataset.ocupado = '1';
  const estabaDeshabilitado = btn.disabled;
  btn.disabled = true;
  btn.classList.add('cargando');
  btn.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    btn.disabled = estabaDeshabilitado;
    btn.classList.remove('cargando');
    btn.removeAttribute('aria-busy');
    delete btn.dataset.ocupado;
  }
}

export function estadoCarga(contenedor, texto = 'Cargando…') {
  vaciar(contenedor).append(h('div', { class: 'estado', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, texto)));
}

export function estadoVacio(contenedor, texto, { ic = 'vacio', accion } = {}) {
  vaciar(contenedor).append(h('div', { class: 'estado' }, icono(ic), h('p', {}, texto), accion || null));
}

export function estadoError(contenedor, err, reintentar) {
  const ic = err?.codigo === 'SIN_CONEXION' || err?.codigo === 'TIEMPO_AGOTADO' ? 'sinConexion' : 'alerta';
  vaciar(contenedor).append(h('div', { class: 'estado estado-error', role: 'alert' },
    icono(ic),
    h('p', {}, err?.message || 'No se pudo cargar la información.'),
    reintentar ? boton('Reintentar', { icono: 'recargar', on: reintentar }) : null));
}

/**
 * Patrón común: muestra carga, ejecuta cargar(), y si falla muestra error con "Reintentar".
 * render(datos) se llama con el resultado.
 */
export async function cargarEn(contenedor, cargar, render, textoCarga) {
  // Si hay cargas superpuestas en el mismo contenedor (ej. filtro + recarga), solo se pinta la última pedida.
  const turno = (contenedor._turnoCarga = (contenedor._turnoCarga || 0) + 1);
  estadoCarga(contenedor, textoCarga);
  try {
    const datos = await cargar();
    if (!contenedor.isConnected || turno !== contenedor._turnoCarga) return;
    vaciar(contenedor);
    render(datos);
  } catch (err) {
    if (err?.sesionPerdida) return; // el panel ya vuelve al login
    if (contenedor.isConnected && turno === contenedor._turnoCarga) estadoError(contenedor, err, () => cargarEn(contenedor, cargar, render, textoCarga));
  }
}

/* ------------------------------------------------------------------ Formularios */

/**
 * Crea un campo con label, ayuda y mensaje de error asociados (aria-describedby).
 * tipo: text | email | password | number | date | tel | search | textarea | select | checkbox
 */
export function campo({ etiqueta, nombre, tipo = 'text', requerido = false, valor, ayuda, opcional = false, atributos = {}, opciones = [], clase = '' }) {
  const id = nuevoId('c-' + nombre);
  const idAyuda = ayuda ? id + '-ayuda' : null;
  const idError = id + '-error';
  let control;
  if (tipo === 'textarea') {
    control = h('textarea', { id, name: nombre, required: requerido, ...atributos });
    if (valor !== undefined && valor !== null) control.value = valor;
  } else if (tipo === 'select') {
    control = h('select', { id, name: nombre, required: requerido, ...atributos },
      opciones.map((o) => h('option', { value: o.valor }, o.texto)));
    if (valor !== undefined && valor !== null) control.value = String(valor);
  } else if (tipo === 'checkbox') {
    control = h('input', { id, name: nombre, type: 'checkbox', ...atributos });
    control.checked = !!valor;
    const envoltura = h('div', { class: 'campo ' + clase },
      h('label', { class: 'check', for: id }, control, h('span', {}, etiqueta)),
      ayuda ? h('p', { class: 'ayuda', id: idAyuda }, ayuda) : null);
    if (idAyuda) control.setAttribute('aria-describedby', idAyuda);
    envoltura.control = control;
    return envoltura;
  } else {
    control = h('input', { id, name: nombre, type: tipo, required: requerido, ...atributos });
    if (valor !== undefined && valor !== null) control.value = valor;
  }
  control.setAttribute('aria-describedby', [idAyuda, idError].filter(Boolean).join(' '));
  const err = h('p', { class: 'error-campo', id: idError, 'aria-live': 'polite' });
  control.addEventListener('input', () => limpiarError(control));
  control.addEventListener('change', () => limpiarError(control));
  const label = h('label', { for: id }, etiqueta);
  if (opcional) label.append(' ', h('span', { class: 'opcional' }, '(opcional)'));
  const envoltura = h('div', { class: ('campo ' + clase).trim() }, label, control, ayuda ? h('p', { class: 'ayuda', id: idAyuda }, ayuda) : null, err);
  envoltura.control = control;
  envoltura.error = err;
  return envoltura;
}

function errorDe(control) {
  const id = (control.getAttribute('aria-describedby') || '').split(' ').find((x) => x.endsWith('-error'));
  return id ? document.getElementById(id) : null;
}

function limpiarError(control) {
  if (control.getAttribute('aria-invalid') === 'true') {
    control.removeAttribute('aria-invalid');
    control.setCustomValidity('');
    const e = errorDe(control);
    if (e) e.textContent = '';
  }
}

export function marcarError(control, mensaje) {
  control.setAttribute('aria-invalid', 'true');
  const e = errorDe(control);
  if (e) e.textContent = mensaje;
}

function mensajeValidez(c) {
  const v = c.validity;
  if (v.customError) return c.validationMessage;
  if (v.valueMissing) return c.tagName === 'SELECT' ? 'Elegí una opción.' : 'Este campo es obligatorio.';
  if (v.typeMismatch && c.type === 'email') return 'Ingresá un email válido (ej.: nombre@dominio.com).';
  if (v.typeMismatch) return 'El formato no es válido.';
  if (v.badInput) return c.type === 'date' ? 'Ingresá una fecha válida.' : 'Ingresá un número válido.';
  if (v.tooShort) return `Tiene que tener al menos ${c.minLength} caracteres (tiene ${c.value.length}).`;
  if (v.tooLong) return `Puede tener como máximo ${c.maxLength} caracteres.`;
  if (v.rangeUnderflow) return `El valor mínimo es ${c.min}.`;
  if (v.rangeOverflow) return `El valor máximo es ${c.max}.`;
  if (v.stepMismatch) return c.step === '1' || c.step === '' ? 'Tiene que ser un número entero.' : `Usá múltiplos de ${c.step}.`;
  if (v.patternMismatch) return c.dataset.mensajePatron || 'El formato no es válido.';
  return 'Revisá este campo.';
}

/**
 * Valida un formulario con la API de validación nativa y muestra los errores en español.
 * Los textos con solo espacios cuentan como vacíos. Devuelve true si es válido.
 */
export function validar(form) {
  let primero = null;
  for (const c of form.elements) {
    if (!c.willValidate || c.type === 'checkbox' || c.type === 'radio' || c.tagName === 'BUTTON') continue;
    if (c.validity.customError) { /* lo dejó el código: respetarlo */ }
    else if (c.required && (c.tagName === 'TEXTAREA' || ['text', 'email', 'password', 'search', 'tel'].includes(c.type)) && c.value.trim() === '') {
      c.setCustomValidity('Este campo es obligatorio.');
    } else if (c.minLength > 0 && c.value.trim().length > 0 && c.value.trim().length < c.minLength) {
      c.setCustomValidity(`Tiene que tener al menos ${c.minLength} caracteres.`);
    }
    if (!c.checkValidity()) {
      marcarError(c, mensajeValidez(c));
      primero ||= c;
    }
  }
  if (primero) { primero.focus(); return false; }
  return true;
}

/** Caja de error general del formulario (se crea si no existe). */
export function errorFormulario(form, err) {
  let caja = form.querySelector(':scope > .error-form');
  if (!caja) {
    caja = h('div', { class: 'error-form', role: 'alert' });
    form.prepend(caja);
  }
  vaciar(caja);
  if (!err) return;
  caja.append(icono('alerta'), h('div', {}, err.message || String(err)));
  // Si el servidor devuelve errores por campo ({datos: {campo: "mensaje"}}), marcarlos.
  const d = err.datos;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const porCampo = d.campos && typeof d.campos === 'object' ? d.campos : d;
    for (const [nombre, msj] of Object.entries(porCampo)) {
      const c = form.elements.namedItem(nombre);
      if (c && typeof msj === 'string' && c.setAttribute) marcarError(c, msj);
    }
  }
  caja.scrollIntoView?.({ block: 'nearest' });
}

/** Lee un formulario como objeto plano (trim en textos). */
export function leerForm(form) {
  const o = {};
  for (const c of form.elements) {
    if (!c.name || c.disabled) continue;
    if (c.type === 'checkbox') o[c.name] = c.checked;
    else if (c.type === 'radio') { if (c.checked) o[c.name] = c.value; }
    else if (c.type === 'number') o[c.name] = c.value === '' ? null : Number(c.value);
    else o[c.name] = typeof c.value === 'string' ? c.value.trim() : c.value;
  }
  return o;
}

/**
 * Abre un modal con formulario. enviar(datos, form) debe devolver una promesa;
 * si falla, el error se muestra en el formulario y el modal queda abierto.
 */
export function modalFormulario({ titulo, campos, textoEnviar = 'Guardar', claseEnviar = 'btn-primario', iconoEnviar = 'check', ancho = false, antesDeValidar, enviar, alAbrir }) {
  return new Promise((resolver) => {
    let resultado;
    const form = h('form', { novalidate: true }, campos);
    const bEnviar = boton(textoEnviar, { clase: claseEnviar, tipo: 'submit', icono: iconoEnviar });
    bEnviar.setAttribute('form', form.id = nuevoId('form'));
    const m = abrirModal({
      titulo, contenido: form, ancho,
      pie: [boton('Cancelar', { on: () => m.cerrar() }), bEnviar],
      alCerrar: () => resolver(resultado),
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorFormulario(form, null);
      antesDeValidar?.(form);
      if (!validar(form)) return;
      await conCarga(bEnviar, async () => {
        try {
          resultado = await enviar(leerForm(form), form);
          if (resultado === false) { resultado = undefined; return; }
          m.cerrar();
        } catch (err) {
          if (err?.sesionPerdida) { m.cerrar(); return; }
          errorFormulario(form, err);
        }
      });
    });
    alAbrir?.(form, m);
  });
}

/* ------------------------------------------------------------------ Tablas y paginación */

/**
 * columnas: [{titulo, valor: fila => Node|string, clase}]
 * acciones: fila => [botones]
 */
export function tabla({ columnas, filas, acciones, claseFila, etiqueta }) {
  const thead = h('thead', {}, h('tr', {},
    columnas.map((c) => h('th', { scope: 'col' }, c.titulo)),
    acciones ? h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Acciones')) : null));
  const tbody = h('tbody', {}, filas.map((f) => {
    const tr = h('tr', { class: claseFila?.(f) || undefined },
      columnas.map((c) => {
        const v = c.valor(f);
        return h('td', { 'data-etiqueta': c.titulo, class: c.clase }, v === null || v === undefined || v === '' ? '—' : v);
      }));
    if (acciones) tr.append(h('td', { class: 'acciones-celda' }, h('div', { class: 'acciones' }, acciones(f))));
    return tr;
  }));
  return h('div', { class: 'tabla-envoltura' }, h('table', { class: 'tabla', 'aria-label': etiqueta }, thead, tbody));
}

export function paginacion({ pagina, total, porPagina, alCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  return h('nav', { class: 'paginacion', 'aria-label': 'Paginación' },
    h('span', { class: 'texto-2 texto-chico' }, `Mostrando ${desde}–${hasta} de ${numero(total)}`),
    h('div', { class: 'acciones' },
      boton('Anterior', { clase: 'btn-chico', disabled: pagina <= 1, on: () => alCambiar(pagina - 1) }),
      h('span', { class: 'texto-chico', 'aria-live': 'polite' }, `Página ${pagina} de ${paginas}`),
      boton('Siguiente', { clase: 'btn-chico', disabled: pagina >= paginas, on: () => alCambiar(pagina + 1) })));
}

/** Botones tipo "pastilla" para filtrar. */
export function segmentado({ opciones, valor, alCambiar, etiqueta }) {
  const cont = h('div', { class: 'segmentado', role: 'group', 'aria-label': etiqueta });
  for (const o of opciones) {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.valor === valor) }, o.texto);
    b.addEventListener('click', () => {
      for (const x of cont.children) x.setAttribute('aria-pressed', String(x === b));
      alCambiar(o.valor);
    });
    cont.append(b);
  }
  return cont;
}

export function tituloSeccion(titulo, bajada, ...acciones) {
  return h('div', { class: 'titulo-seccion' },
    h('div', {}, h('h1', { tabindex: '-1', class: 'foco-seccion' }, titulo), bajada ? h('p', {}, bajada) : null),
    acciones.length ? h('div', { class: 'acciones' }, acciones) : null);
}

/* ------------------------------------------------------------------ Formato */

const ZONA = 'America/Argentina/Jujuy';
const fmtFecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: ZONA });
const fmtFechaHora = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ZONA });
const fmtNumero = new Intl.NumberFormat('es-AR');

function aFecha(iso) {
  if (!iso) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00Z' : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const fecha = (iso) => { const d = aFecha(iso); return d ? fmtFecha.format(d) : '—'; };
export const fechaHora = (iso) => { const d = aFecha(iso); return d ? fmtFechaHora.format(d) : '—'; };
export const numero = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : fmtNumero.format(Number(n)));

/** "vence en 3 días", "venció hace 2 días", "vence hoy". */
export function relativo(iso) {
  const d = aFecha(iso);
  if (!d) return '';
  const dif = d.getTime() - Date.now();
  const dias = Math.round(dif / 86400000);
  const horas = Math.round(dif / 3600000);
  if (Math.abs(horas) < 24) {
    if (horas === 0) return dif >= 0 ? 'en menos de una hora' : 'hace menos de una hora';
    return dif >= 0 ? `en ${horas} h` : `hace ${-horas} h`;
  }
  return dif >= 0 ? `en ${dias} día${dias === 1 ? '' : 's'}` : `hace ${-dias} día${dias === -1 ? '' : 's'}`;
}

const ESTADOS = {
  DISPONIBLE: ['Disponible', 'badge-info'],
  USADO: ['Usado', 'badge-ok'],
  VENCIDO: ['Vencido', 'badge-neutro'],
  ANULADO: ['Anulado', 'badge-error'],
  PENDIENTE: ['Pendiente', 'badge-pendiente'],
  APROBADO: ['Aprobado', 'badge-ok'],
  APROBADA: ['Aprobada', 'badge-ok'],
  RECHAZADO: ['Rechazado', 'badge-error'],
  RECHAZADA: ['Rechazada', 'badge-error'],
};
export function badgeEstado(estado) {
  const [texto, clase] = ESTADOS[estado] || [estado || '—', 'badge-neutro'];
  return h('span', { class: 'badge ' + clase }, texto);
}
export function badge(texto, clase = 'badge-neutro') {
  return h('span', { class: 'badge ' + clase }, texto);
}

export const ROLES = { turista: 'Turista', negocio: 'Negocio', residente: 'Residente', admin: 'Administración' };

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado al portapapeles.', 'ok');
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = texto;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    toast(ok ? 'Copiado al portapapeles.' : 'No se pudo copiar. Seleccioná el texto y copialo a mano.', ok ? 'ok' : 'error');
  }
}

export { icono };
