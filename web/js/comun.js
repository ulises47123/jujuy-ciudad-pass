// Piezas compartidas entre los módulos de rol.
import { campo, h, badge } from './ui.js';

/** Categorías de recomendaciones (docs/API.md §3.4). También se sugieren para lugares. */
export const CATEGORIAS = ['Gastronomía', 'Historia', 'Naturaleza', 'Cultura', 'Paseo', 'Compras', 'Otro'];

/** Teléfono: números, espacios, +, guiones y paréntesis. Escapado para el modo "v" que usa el atributo pattern. */
export const PATRON_TELEFONO = String.raw`[0-9+\(\)\-\s]{6,40}`;
export const MENSAJE_TELEFONO = 'Usá solo números, espacios, +, guiones o paréntesis (mínimo 6).';

const ALFABETO ='0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Normaliza un código de cupón como el servidor (mayúsculas, sin espacios, O→0, I/L→1)
 * y lo devuelve con formato JCP-XXXX-XXXX. Devuelve null si no puede ser un código válido.
 */
export function normalizarCodigo(texto) {
  let resto = String(texto || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (resto.length === 11 && resto.startsWith('JCP')) resto = resto.slice(3);
  resto = resto.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (resto.length !== 8) return null;
  for (const c of resto) if (!ALFABETO.includes(c)) return null;
  return `JCP-${resto.slice(0, 4)}-${resto.slice(4)}`;
}

/** Busca un código de cupón dentro de un texto cualquiera (por ejemplo, el contenido de un QR). */
export function extraerCodigo(texto) {
  const t = String(texto || '');
  const m = t.toUpperCase().match(/JCP[-\s]?[0-9A-Z]{4}[-\s]?[0-9A-Z]{4}/);
  if (m) return normalizarCodigo(m[0]);
  return normalizarCodigo(t);
}

export function etiquetaStock(b) {
  const s = b.stock_restante !== undefined ? b.stock_restante : b.stock;
  return s === null || s === undefined ? 'Ilimitado' : String(s);
}

export function valorStock(b) {
  const s = b.stock !== undefined ? b.stock : b.stock_restante;
  return s === null || s === undefined ? '' : s;
}

export function badgeActivo(activo, { si = 'Activo', no = 'Pausado' } = {}) {
  return activo ? badge(si, 'badge-ok') : badge(no, 'badge-neutro');
}

/** Campos del formulario de beneficio (negocio y admin). */
export function camposBeneficio(b = {}) {
  return [
    campo({ etiqueta: 'Título', nombre: 'titulo', requerido: true, valor: b.titulo, ayuda: 'Ej.: “2x1 en café” o “10% de descuento en artesanías”.', atributos: { minlength: 3, maxlength: 120, autocomplete: 'off' } }),
    campo({ etiqueta: 'Descripción', nombre: 'descripcion', tipo: 'textarea', requerido: true, valor: b.descripcion, ayuda: 'Contá qué incluye y las condiciones (días, horarios, límites).', atributos: { minlength: 10, maxlength: 2000, rows: 4 } }),
    h('div', { class: 'campos-2' },
      campo({ etiqueta: 'Puntos necesarios', nombre: 'puntos', tipo: 'number', requerido: true, valor: b.puntos, atributos: { min: 1, max: 100000, step: 1, inputmode: 'numeric' } }),
      campo({ etiqueta: 'Días de validez del cupón', nombre: 'dias_validez', tipo: 'number', requerido: true, valor: b.dias_validez ?? 30, atributos: { min: 1, max: 365, step: 1, inputmode: 'numeric' } })),
    campo({ etiqueta: 'Stock', nombre: 'stock', tipo: 'number', opcional: true, valor: valorStock(b), ayuda: 'Cupones que quedan disponibles para canjear. Dejalo vacío si es ilimitado.', atributos: { min: 0, max: 100000, step: 1, inputmode: 'numeric' } }),
  ];
}
