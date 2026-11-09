// Cliente de la API v1 (mismo dominio). Ver docs/API.md.
// - Toda petición va con credentials:'same-origin' (cookie jcp_sesion).
// - Toda petición no GET lleva el header "X-JCP: 1" (protección CSRF).
// - Los errores llegan como {error:{codigo, mensaje, datos?}} y se convierten en ApiError.

const BASE = '/api/v1';
const TIEMPO_MAXIMO_MS = 20000;

export class ApiError extends Error {
  constructor(status, codigo, mensaje, datos = null) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.datos = datos;
  }
}

const MENSAJES_POR_STATUS = {
  400: 'La solicitud no es válida.',
  401: 'Tu sesión terminó. Volvé a ingresar.',
  403: 'No tenés permiso para hacer esto.',
  404: 'No encontramos lo que buscabas.',
  409: 'La operación entra en conflicto con el estado actual. Actualizá e intentá de nuevo.',
  410: 'Esto ya no está disponible.',
  413: 'Los datos enviados son demasiado grandes.',
  422: 'Revisá los datos ingresados.',
  429: 'Hiciste demasiados intentos. Esperá unos minutos y volvé a probar.',
  500: 'Ocurrió un error en el servidor. Intentá de nuevo en un rato.',
  502: 'El servidor no está disponible en este momento. Intentá de nuevo en unos minutos.',
  503: 'El servidor no está disponible en este momento. Intentá de nuevo en unos minutos.',
  504: 'El servidor tardó demasiado en responder. Intentá de nuevo.',
};

let manejadorNoAutenticado = null;

/** Registra qué hacer cuando cualquier petición devuelve 401 (por ejemplo, volver al login). */
export function alPerderSesion(fn) {
  manejadorNoAutenticado = fn;
}

/**
 * Hace una petición a la API.
 * @param {string} metodo GET | POST | PATCH | DELETE
 * @param {string} ruta ruta relativa a /api/v1, ej. "/negocio/resumen"
 * @param {object} [cuerpo] se envía como JSON
 * @param {object} [opciones] { consulta: {clave: valor}, ignorar401: bool, signal }
 */
export async function api(metodo, ruta, cuerpo, opciones = {}) {
  const url = new URL(BASE + ruta, window.location.origin);
  if (opciones.consulta) {
    for (const [k, v] of Object.entries(opciones.consulta)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers = { Accept: 'application/json' };
  if (metodo !== 'GET') headers['X-JCP'] = '1';
  const init = { method: metodo, headers, credentials: 'same-origin', cache: 'no-store' };
  if (cuerpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(cuerpo);
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort('tiempo'), TIEMPO_MAXIMO_MS);
  if (opciones.signal) opciones.signal.addEventListener('abort', () => control.abort('cancelado'), { once: true });
  init.signal = control.signal;

  let resp;
  try {
    resp = await fetch(url.pathname + url.search, init);
  } catch (e) {
    clearTimeout(temporizador);
    if (opciones.signal?.aborted) throw new ApiError(0, 'CANCELADO', 'Operación cancelada.');
    if (control.signal.aborted) {
      throw new ApiError(0, 'TIEMPO_AGOTADO', 'El servidor tardó demasiado en responder. Revisá tu conexión e intentá de nuevo.');
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiError(0, 'SIN_CONEXION', offline
      ? 'Estás sin conexión a internet. Revisá el wifi o los datos móviles e intentá de nuevo.'
      : 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
  }
  clearTimeout(temporizador);

  let datos = null;
  const tipo = resp.headers.get('content-type') || '';
  if (resp.status !== 204) {
    if (tipo.includes('application/json')) {
      try { datos = await resp.json(); } catch { datos = null; }
    } else {
      try { await resp.text(); } catch { /* sin cuerpo */ }
    }
  }

  if (resp.ok) return datos;

  const err = datos && typeof datos === 'object' && datos.error ? datos.error : null;
  const apiError = new ApiError(
    resp.status,
    err?.codigo || (resp.status === 401 ? 'NO_AUTENTICADO' : 'ERROR_HTTP_' + resp.status),
    (typeof err?.mensaje === 'string' && err.mensaje) || MENSAJES_POR_STATUS[resp.status] || `Error inesperado (${resp.status}).`,
    err?.datos ?? null,
  );

  // 401 (NO_AUTENTICADO / SESION_EXPIRADA) o cuenta bloqueada con la sesión abierta: se pierde la sesión.
  const sesionPerdida = resp.status === 401 || (resp.status === 403 && apiError.codigo === 'CUENTA_BLOQUEADA');
  if (sesionPerdida) apiError.sesionPerdida = true;
  if (sesionPerdida && !opciones.ignorar401 && manejadorNoAutenticado) {
    manejadorNoAutenticado(apiError);
  }
  throw apiError;
}

export const get = (ruta, consulta, op = {}) => api('GET', ruta, undefined, { ...op, consulta });
export const post = (ruta, cuerpo, op) => api('POST', ruta, cuerpo, op);
export const patch = (ruta, cuerpo, op) => api('PATCH', ruta, cuerpo, op);
export const del = (ruta, op) => api('DELETE', ruta, undefined, op);

/**
 * Normaliza respuestas de lista: acepta un array simple o el formato paginado
 * {items, total, pagina, por_pagina} (o un objeto con una única lista adentro).
 */
export function comoLista(r) {
  if (Array.isArray(r)) return { items: r, total: r.length, pagina: 1, por_pagina: r.length || 1, paginada: false };
  if (r && Array.isArray(r.items)) {
    return {
      items: r.items,
      total: Number.isFinite(r.total) ? r.total : r.items.length,
      pagina: r.pagina || 1,
      por_pagina: r.por_pagina || r.items.length || 1,
      paginada: true,
    };
  }
  if (r && typeof r === 'object') {
    const arr = Object.values(r).find(Array.isArray);
    if (arr) return { items: arr, total: arr.length, pagina: 1, por_pagina: arr.length || 1, paginada: false };
  }
  return { items: [], total: 0, pagina: 1, por_pagina: 1, paginada: false };
}

/** Trae todas las páginas de una lista de admin (para selects, por ejemplo). */
export async function traerTodo(ruta, consulta = {}, maxPaginas = 20) {
  const todos = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const r = comoLista(await get(ruta, { ...consulta, pagina, por_pagina: 100 }));
    todos.push(...r.items);
    if (!r.paginada || todos.length >= r.total || r.items.length === 0) break;
  }
  return todos;
}
