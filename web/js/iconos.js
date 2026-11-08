// Íconos SVG inline (trazos estilo "outline"). Son constantes del código, nunca datos del servidor.
const P = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  regalo: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8H7.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8Zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8Z"/>',
  tienda: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/>',
  estrella: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>',
  trofeo: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  mensaje: '<path d="M4 4h16v12H8l-4 4Z"/><path d="M8 9h8M8 12h5"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="M12 8v5M12 16h.01"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  salir: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M13.5 6.5l4 4"/>',
  basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M4 12.5 9.5 18 20 6"/>',
  checkCirculo: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  alerta: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  pausa: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4.5v15l12-7.5Z"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  camara: '<path d="M4 8h3l2-3h6l2 3h3v12H4Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  candadoAbierto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  recargar: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  descarga: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  android: '<path d="M6 10v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7Z"/><path d="M6 9a6 6 0 0 1 12 0Z"/><path d="M8 4l1.5 2M16 4l-1.5 2M9.5 7h.01M14.5 7h.01M3.5 11v4M20.5 11v4M9.5 18v3M14.5 18v3"/>',
  entrar: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M14 17l5-5-5-5M19 12H8"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  pregunta: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  vacio: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6Z"/>',
  sinConexion: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 5-2.6M14 9.4A10 10 0 0 1 19 12M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18"/>',
  monedas: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  montana: '<path d="M2 20 9 8l4 6 3-4 6 10Z"/><circle cx="17" cy="5" r="2"/>',
};

const NS = 'http://www.w3.org/2000/svg';

/** Devuelve un <svg> listo para insertar. El contenido sale solo de la tabla constante P. */
export function icono(nombre, clase = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', ('icono ' + clase).trim());
  svg.innerHTML = P[nombre] || P.info; // constante interna, no viene del servidor
  return svg;
}

/** Logo de la marca: sol de la libertad sobre cerros (terracota y turquesa). */
export function logo(clase = 'marca-logo') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', clase);
  svg.innerHTML =
    '<rect width="48" height="48" rx="13" fill="#fbf9f5" stroke="#e2d8cc"/>' +
    '<circle cx="31" cy="17" r="6.5" fill="#c68a35"/>' +
    '<path d="M5 38 17 18l7 10 5-6 14 16Z" fill="#c25e2e"/>' +
    '<path d="M5 38l9-8 6 4 8-7 15 11Z" fill="#0f766e"/>' +
    '<path d="M21 38v-8m0 3-2.5-1.5M21 34l2.5-1.5" stroke="#2d2621" stroke-width="1.6" stroke-linecap="round"/>';
  return svg;
}

/** Silueta de cerros, cardones y lapachos para decorar fondos. */
export function cerros() {
  const div = document.createElement('div');
  div.className = 'cerros';
  div.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1440 220');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML =
    '<path d="M0 220 140 90l140 70 160-120 180 120 200-130 220 110 160-70 140 90 100-40v150Z" fill="#c25e2e" opacity=".75"/>' +
    '<path d="M0 220l200-70 180 40 200-80 200 70 200-90 220 90 240-40v80Z" fill="#0f766e" opacity=".85"/>' +
    '<g fill="#2d2621" opacity=".85"><path d="M440 120v70h10v-70Zm-14 22v26h10v-26Zm28 10v28h10v-28Zm470-40v80h12v-80Zm-16 26v30h12v-30Zm32 12v34h12v-34Z"/></g>' +
    '<g fill="#b44a68"><circle cx="190" cy="130" r="18"/><circle cx="215" cy="118" r="22" opacity=".85"/><circle cx="240" cy="136" r="15" fill="#e7a3b8"/>' +
    '<circle cx="1290" cy="120" r="20"/><circle cx="1318" cy="104" r="24" opacity=".85"/><circle cx="1346" cy="126" r="16" fill="#e7a3b8"/></g>';
  div.append(svg);
  return div;
}
