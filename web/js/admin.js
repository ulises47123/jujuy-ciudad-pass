// Panel de administración: estadísticas, lugares (+mapa y trivia), beneficios, usuarios,
// recomendaciones, temporadas, canjes y alertas anti-trampa.
import { get, post, patch, del, comoLista, traerTodo } from './api.js';
import {
  h, boton, vaciar, toast, toastError, campo, conCarga, cargarEn, estadoVacio,
  modalFormulario, abrirModal, confirmar, pedirTexto, tabla, paginacion, segmentado, tituloSeccion,
  fecha, fechaHora, numero, badgeEstado, badge, icono, debounce, nuevoId, copiar, ROLES,
} from './ui.js';
import { CATEGORIAS, camposBeneficio, etiquetaStock, badgeActivo, PATRON_TELEFONO, MENSAJE_TELEFONO } from './comun.js';

export const secciones = [
  { id: 'estadisticas', titulo: 'Estadísticas', icono: 'grafico', render: renderEstadisticas },
  { id: 'lugares', titulo: 'Lugares y trivia', icono: 'pin', render: renderLugares },
  { id: 'beneficios', titulo: 'Beneficios', icono: 'regalo', render: renderBeneficios },
  { id: 'usuarios', titulo: 'Usuarios', icono: 'usuarios', render: renderUsuarios },
  { id: 'recomendaciones', titulo: 'Recomendaciones', icono: 'mensaje', render: renderRecomendaciones },
  { id: 'temporadas', titulo: 'Temporadas', icono: 'calendario', render: renderTemporadas },
  { id: 'canjes', titulo: 'Canjes', icono: 'ticket', render: renderCanjes },
  { id: 'alertas', titulo: 'Alertas anti-trampa', icono: 'escudo', render: renderAlertas },
];

const POR_PAGINA = 25;
const CENTRO_JUJUY = [-24.1858, -65.2995];

/** Lista con paginación del servidor (o array simple). Devuelve {recargar, reiniciar}. */
function listaPaginada(zona, { cargar, render, vacio, textoCarga }) {
  let pagina = 1;
  async function ir(p) {
    pagina = p;
    await cargarEn(zona, () => cargar({ pagina, por_pagina: POR_PAGINA }), (r) => {
      const l = comoLista(r);
      if (!l.items.length) {
        if (pagina > 1) { ir(pagina - 1); return; }
        estadoVacio(zona, typeof vacio === 'function' ? vacio() : vacio);
        return;
      }
      zona.append(render(l.items));
      if (l.paginada && l.total > l.por_pagina) {
        zona.append(paginacion({ pagina: l.pagina, total: l.total, porPagina: l.por_pagina, alCambiar: (n) => { ir(n); zona.scrollIntoView({ block: 'start' }); } }));
      } else {
        zona.append(h('p', { class: 'texto-chico texto-2 mt-1' }, `${numero(l.total)} en total.`));
      }
    }, textoCarga);
  }
  return { recargar: () => ir(pagina), reiniciar: () => ir(1) };
}

/** Ejecuta una acción de un botón con carga, toast de éxito y recarga. */
function accion(btn, fn, exito, despues) {
  return conCarga(btn, async () => {
    try {
      const r = await fn();
      if (exito) toast(typeof exito === 'function' ? exito(r) : exito, 'ok');
      despues?.(r);
    } catch (err) {
      if (!err.sesionPerdida) toastError(err);
    }
  });
}

function filtroConEtiqueta(etiqueta, control) {
  return h('div', {}, h('span', { class: 'etiqueta' }, etiqueta), h('div', { class: 'mt-1' }, control));
}

/* ================================================================ Estadísticas */

function renderEstadisticas(main) {
  const bAct = boton('Actualizar', { icono: 'recargar' });
  const zona = h('div', {});
  main.append(tituloSeccion('Estadísticas', 'Cómo viene Jujuy Ciudad Pass.', bAct), zona);

  const nombreLugar = (x) => (typeof x === 'string' ? x : x?.nombre ?? x?.lugar_nombre ?? x?.lugar ?? '—');
  const visitasLugar = (x) => (typeof x === 'object' && x ? x.visitas ?? x.cantidad ?? x.total ?? x.visitas_total ?? null : null);
  const stat = (valor, etiqueta, clase, href, extra) => h(href ? 'a' : 'div', { class: 'stat ' + clase, href },
    h('span', { class: 'stat-valor' }, numero(valor ?? 0)), h('span', { class: 'stat-etiqueta' }, etiqueta),
    extra ? h('span', { class: 'texto-chico texto-2' }, extra) : null);
  const listaLugares = (titulo, items, vacio) => h('section', { class: 'tarjeta' }, h('h2', {}, titulo),
    items?.length
      ? h('ol', { class: 'ranking' }, items.map((x, i) => h('li', {},
        h('span', { class: 'pos' }, String(i + 1)), h('span', { class: 'nombre' }, nombreLugar(x)),
        visitasLugar(x) !== null ? h('span', { class: 'pts' }, numero(visitasLugar(x)), h('span', { class: 'texto-chico texto-2' }, ' visitas')) : null)))
      : h('p', { class: 'texto-2' }, vacio));

  const cargar = () => cargarEn(zona, () => get('/admin/estadisticas'), (r) => {
    const u = r.usuarios || {};
    const pctUsados = r.canjes_total ? Math.round((r.canjes_usados / r.canjes_total) * 100) : 0;
    zona.append(
      h('h2', {}, 'Para revisar'),
      h('div', { class: 'grilla-stats mb-2' },
        stat(r.alertas_abiertas, 'Alertas abiertas', 'stat-lapacho', '#/alertas'),
        stat(r.recomendaciones_pendientes, 'Recomendaciones pendientes', 'stat-sol', '#/recomendaciones?estado=PENDIENTE'),
        stat(r.beneficios_pendientes, 'Beneficios pendientes', 'stat-terracota', '#/beneficios?estado=PENDIENTE')),
      h('h2', {}, 'Actividad'),
      h('div', { class: 'grilla-stats mb-2' },
        stat(r.visitas_total, 'Visitas totales', 'stat-turquesa'),
        stat(r.visitas_7d, 'Visitas últimos 7 días', 'stat-turquesa'),
        stat(r.canjes_total, 'Canjes totales', 'stat-terracota', '#/canjes'),
        stat(r.canjes_usados, 'Cupones usados', 'stat-terracota', '#/canjes?estado=USADO', r.canjes_total ? `${pctUsados}% de los canjes` : null)),
      h('h2', {}, 'Usuarios'),
      h('div', { class: 'grilla-stats mb-2' },
        stat(u.total, 'Usuarios en total', 'stat-sol', '#/usuarios'),
        stat(u.turistas, 'Turistas', 'stat-turquesa', '#/usuarios?rol=turista'),
        stat(u.negocios, 'Negocios', 'stat-terracota', '#/usuarios?rol=negocio'),
        stat(u.residentes, 'Residentes', 'stat-lapacho', '#/usuarios?rol=residente'),
        stat(u.admins, 'Administradores', 'stat-sol', '#/usuarios?rol=admin')),
      h('div', { class: 'dos-columnas' },
        listaLugares('Lugares más visitados', r.lugares_mas_visitados, 'Todavía no hay visitas.'),
        listaLugares('Lugares menos visitados', r.lugares_menos_visitados, 'Todavía no hay datos.')));
  }, 'Cargando estadísticas…');
  bAct.addEventListener('click', (e) => conCarga(e.currentTarget, cargar));
  cargar();
}

/* ================================================================ Lugares */

let promesaLeaflet = null;
function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!promesaLeaflet) {
    promesaLeaflet = new Promise((resolver, rechazar) => {
      if (!document.querySelector('link[data-leaflet]')) {
        document.head.append(h('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css', 'data-leaflet': '1' }));
      }
      const s = h('script', { src: 'vendor/leaflet/leaflet.js' });
      s.onload = () => (window.L ? resolver(window.L) : rechazar(new Error('El mapa no se pudo iniciar.')));
      s.onerror = () => { promesaLeaflet = null; s.remove(); rechazar(new Error('No se pudo cargar el mapa.')); };
      document.head.append(s);
    });
  }
  return promesaLeaflet;
}

function renderLugares(main) {
  let lugares = [];
  let texto = '';
  let filtro = 'todos';
  const zona = h('div', {});
  const cBuscar = campo({ etiqueta: 'Buscar lugar', nombre: 'q', tipo: 'search', clase: 'campo-busqueda', atributos: { autocomplete: 'off', placeholder: 'Nombre, categoría o dirección' } });
  cBuscar.control.addEventListener('input', debounce(() => { texto = cBuscar.control.value.trim().toLowerCase(); pintar(); }, 200));

  main.append(
    tituloSeccion('Lugares y trivia', 'Los puntos que los turistas visitan. Cada lugar necesita al menos una pregunta activa para poder activarse.',
      boton('Nuevo lugar', { clase: 'btn-primario', icono: 'mas', on: () => formLugar(null) })),
    h('div', { class: 'filtros' },
      filtroConEtiqueta('Mostrar', segmentado({
        etiqueta: 'Filtrar por estado', valor: filtro,
        opciones: [{ valor: 'todos', texto: 'Todos' }, { valor: 'activos', texto: 'Activos' }, { valor: 'inactivos', texto: 'Inactivos' }],
        alCambiar: (v) => { filtro = v; pintar(); },
      })),
      cBuscar),
    zona);

  function pintar() {
    vaciar(zona);
    const lista = lugares.filter((l) => (filtro === 'todos' || (filtro === 'activos') === !!l.activo)
      && (!texto || [l.nombre, l.categoria, l.direccion].some((x) => (x || '').toLowerCase().includes(texto))));
    if (!lista.length) {
      estadoVacio(zona, lugares.length ? 'Ningún lugar coincide con el filtro.' : 'Todavía no hay lugares cargados.', {
        ic: 'pin', accion: lugares.length ? null : boton('Crear el primer lugar', { clase: 'btn-primario', icono: 'mas', on: () => formLugar(null) }),
      });
      return;
    }
    zona.append(tabla({
      etiqueta: 'Lugares',
      columnas: [
        { titulo: 'Lugar', valor: (l) => h('div', {}, h('strong', {}, l.nombre), l.direccion ? h('div', { class: 'texto-chico texto-2' }, l.direccion) : null) },
        { titulo: 'Categoría', valor: (l) => l.categoria },
        { titulo: 'Puntos', valor: (l) => numero(l.puntos) },
        { titulo: 'Radio', valor: (l) => `${numero(l.radio_m)} m` },
        { titulo: 'Preguntas', valor: (l) => (l.cantidad_preguntas ? numero(l.cantidad_preguntas) : badge('Sin preguntas', 'badge-pendiente')) },
        { titulo: 'Estado', valor: (l) => badgeActivo(l.activo, { si: 'Activo', no: 'Inactivo' }) },
      ],
      filas: lista,
      acciones: (l) => [
        boton('Editar', { clase: 'btn-chico', icono: 'editar', on: () => formLugar(l) }),
        boton('Preguntas', { clase: 'btn-chico', icono: 'pregunta', on: () => modalPreguntas(l, cargar) }),
        l.activo
          ? boton('Desactivar', { clase: 'btn-chico btn-peligro-borde', icono: 'pausa', on: (e) => desactivar(l, e.currentTarget) })
          : boton('Activar', { clase: 'btn-chico btn-turquesa', icono: 'play', on: (e) => activar(l, e.currentTarget) }),
      ],
    }), h('p', { class: 'texto-chico texto-2 mt-1' }, `${lista.length} de ${lugares.length} lugares.`));
  }

  function cargar() {
    return cargarEn(zona, () => traerTodo('/admin/lugares'), (lista) => { lugares = lista; pintar(); }, 'Cargando lugares…');
  }

  async function activar(l, btn) {
    if (l.cantidad_preguntas === 0) {
      const ok = await confirmar({
        titulo: 'El lugar no tiene preguntas',
        mensaje: `“${l.nombre}” no tiene preguntas de trivia. Para activarlo necesitás cargar al menos una pregunta activa.`,
        textoConfirmar: 'Cargar preguntas',
      });
      if (ok) modalPreguntas(l, cargar);
      return;
    }
    accion(btn, () => patch(`/admin/lugares/${l.id}`, { activo: true }), `“${l.nombre}” está activo y visible en la app.`, cargar);
  }

  async function desactivar(l, btn) {
    const ok = await confirmar({
      titulo: 'Desactivar lugar', peligro: true, textoConfirmar: 'Desactivar',
      mensaje: `¿Desactivar “${l.nombre}”?`,
      detalle: 'Los turistas dejan de verlo en la app. Se conserva el historial de visitas y podés volver a activarlo cuando quieras.',
    });
    if (!ok) return;
    accion(btn, () => patch(`/admin/lugares/${l.id}`, { activo: false }), 'Lugar desactivado.', cargar);
  }

  function formLugar(l) {
    const nuevo = !l;
    const idLista = nuevoId('cats');
    const cLat = campo({ etiqueta: 'Latitud', nombre: 'latitud', tipo: 'number', requerido: true, valor: l?.latitud, atributos: { min: -90, max: 90, step: 'any', inputmode: 'decimal' } });
    const cLon = campo({ etiqueta: 'Longitud', nombre: 'longitud', tipo: 'number', requerido: true, valor: l?.longitud, atributos: { min: -180, max: 180, step: 'any', inputmode: 'decimal' } });
    const cRadio = campo({ etiqueta: 'Radio de validación (m)', nombre: 'radio_m', tipo: 'number', requerido: true, valor: l?.radio_m ?? 100, ayuda: 'Entre 20 y 1000 metros. El turista tiene que estar dentro del círculo.', atributos: { min: 20, max: 1000, step: 1, inputmode: 'numeric' } });
    const divMapa = h('div', { class: 'mapa', 'aria-label': 'Mapa para ubicar el lugar. Hacé clic para marcar el punto, o escribí la latitud y la longitud.' });
    const estadoMapa = h('p', { class: 'ayuda', 'aria-live': 'polite' }, 'Cargando el mapa…');
    const datos = {};

    const campos = [
      nuevo ? h('div', { class: 'aviso aviso-info' }, icono('info'), h('div', {}, 'El lugar se crea inactivo. Después cargale al menos una pregunta de trivia y activalo.')) : null,
      campo({ etiqueta: 'Nombre', nombre: 'nombre', requerido: true, valor: l?.nombre, atributos: { minlength: 3, maxlength: 80, autocomplete: 'off' } }),
      h('div', { class: 'campos-2' },
        campo({ etiqueta: 'Categoría', nombre: 'categoria', requerido: true, valor: l?.categoria, ayuda: 'Elegí una sugerida o escribí otra.', atributos: { list: idLista, maxlength: 60, autocomplete: 'off' } }),
        campo({ etiqueta: 'Dirección', nombre: 'direccion', requerido: true, valor: l?.direccion, atributos: { maxlength: 200, autocomplete: 'off' } })),
      h('datalist', { id: idLista }, CATEGORIAS.map((c) => h('option', { value: c }))),
      campo({ etiqueta: 'Descripción', nombre: 'descripcion', tipo: 'textarea', requerido: true, valor: l?.descripcion, atributos: { minlength: 10, maxlength: 2000, rows: 3 } }),
      h('div', { class: 'campos-2' },
        campo({ etiqueta: 'Puntos que otorga', nombre: 'puntos', tipo: 'number', requerido: true, valor: l?.puntos ?? 50, ayuda: 'Entre 1 y 1000.', atributos: { min: 1, max: 1000, step: 1, inputmode: 'numeric' } }),
        cRadio),
      h('fieldset', {}, h('legend', {}, 'Ubicación'), divMapa, estadoMapa, h('div', { class: 'campos-2 mt-1' }, cLat, cLon)),
    ];

    modalFormulario({
      titulo: nuevo ? 'Nuevo lugar' : `Editar: ${l.nombre}`,
      campos, ancho: true,
      textoEnviar: nuevo ? 'Crear lugar' : 'Guardar cambios',
      alAbrir: async (form, m) => {
        let L;
        try { L = await cargarLeaflet(); } catch (err) {
          estadoMapa.textContent = `${err.message} Podés escribir la latitud y la longitud a mano.`;
          divMapa.hidden = true;
          return;
        }
        if (!divMapa.isConnected) return;
        const tieneCoords = Number.isFinite(Number(l?.latitud)) && Number.isFinite(Number(l?.longitud)) && l?.latitud !== null;
        const mapa = L.map(divMapa).setView(tieneCoords ? [l.latitud, l.longitud] : CENTRO_JUJUY, tieneCoords ? 16 : 14);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; colaboradores de OpenStreetMap',
        }).addTo(mapa);
        let marcador = null;
        let circulo = null;
        const radio = () => Math.min(1000, Math.max(20, Number(cRadio.control.value) || 100));
        const poner = (lat, lon, centrar) => {
          if (!marcador) {
            marcador = L.marker([lat, lon], { draggable: true, title: 'Ubicación del lugar (arrastrá para mover)' }).addTo(mapa);
            circulo = L.circle([lat, lon], { radius: radio(), color: '#c25e2e', weight: 2, fillColor: '#c25e2e', fillOpacity: 0.15 }).addTo(mapa);
            marcador.on('drag', () => circulo.setLatLng(marcador.getLatLng()));
            marcador.on('dragend', () => { const p = marcador.getLatLng(); escribir(p.lat, p.lng); });
          } else {
            marcador.setLatLng([lat, lon]);
            circulo.setLatLng([lat, lon]);
            circulo.setRadius(radio());
          }
          if (centrar) mapa.setView([lat, lon], Math.max(mapa.getZoom(), 15));
        };
        const escribir = (lat, lon) => {
          cLat.control.value = lat.toFixed(6);
          cLon.control.value = lon.toFixed(6);
          for (const c of [cLat.control, cLon.control]) c.dispatchEvent(new Event('change'));
          estadoMapa.textContent = `Punto marcado: ${lat.toFixed(6)}, ${lon.toFixed(6)}. Podés arrastrar el marcador para ajustarlo.`;
        };
        mapa.on('click', (e) => { poner(e.latlng.lat, e.latlng.lng); escribir(e.latlng.lat, e.latlng.lng); });
        const desdeInputs = () => {
          const lat = Number(cLat.control.value);
          const lon = Number(cLon.control.value);
          if (cLat.control.value !== '' && cLon.control.value !== '' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) poner(lat, lon, true);
        };
        cLat.control.addEventListener('input', debounce(desdeInputs, 400));
        cLon.control.addEventListener('input', debounce(desdeInputs, 400));
        cRadio.control.addEventListener('input', () => circulo?.setRadius(radio()));
        if (tieneCoords) poner(Number(l.latitud), Number(l.longitud));
        estadoMapa.textContent = tieneCoords
          ? 'Hacé clic en el mapa o arrastrá el marcador para cambiar la ubicación. El círculo muestra el radio de validación.'
          : 'Hacé clic (o tocá) en el mapa para marcar el lugar. El círculo muestra el radio de validación.';
        setTimeout(() => mapa.invalidateSize(), 80);
        m.dialog.addEventListener('close', () => mapa.remove(), { once: true });
        datos.mapa = mapa;
      },
      enviar: async (d) => {
        const cuerpo = {
          nombre: d.nombre, descripcion: d.descripcion, direccion: d.direccion, categoria: d.categoria,
          latitud: d.latitud, longitud: d.longitud, radio_m: d.radio_m, puntos: d.puntos,
        };
        if (nuevo) {
          const r = await post('/admin/lugares', { ...cuerpo, activo: false });
          toast('Lugar creado (inactivo). Ahora cargale preguntas de trivia.', 'ok');
          cargar();
          const creado = r?.lugar ?? r;
          if (creado?.id) setTimeout(() => modalPreguntas({ ...cuerpo, ...creado }, cargar), 50);
        } else {
          const cambios = {};
          for (const [k, v] of Object.entries(cuerpo)) if (v !== l[k]) cambios[k] = v;
          if (!Object.keys(cambios).length) { toast('No hiciste cambios.', 'info'); return true; }
          await patch(`/admin/lugares/${l.id}`, cambios);
          toast('Lugar actualizado.', 'ok');
          cargar();
        }
        return true;
      },
    });
  }

  cargar();
}

/* ---------------- Preguntas de trivia ---------------- */

function modalPreguntas(lugar, alCambiar) {
  let huboCambios = false;
  const zona = h('div', {});
  const bNueva = boton('Nueva pregunta', { clase: 'btn-primario', icono: 'mas', on: () => formPregunta(null) });
  const m = abrirModal({
    titulo: `Trivia: ${lugar.nombre}`, ancho: true,
    contenido: [
      h('p', { class: 'texto-2 texto-chico' }, 'Cuando el turista llega al lugar, la app le muestra una de las preguntas activas al azar, con las opciones mezcladas. La respuesta correcta nunca se envía a la app.'),
      h('div', { class: 'acciones mb-2' }, bNueva),
      zona,
    ],
    pie: [boton('Listo', { on: () => m.cerrar() })],
    alCerrar: () => { if (huboCambios) alCambiar?.(); },
  });

  const cargar = () => cargarEn(zona, () => traerTodo(`/admin/lugares/${lugar.id}/preguntas`), (lista) => {
    if (!lista.length) {
      estadoVacio(zona, 'Este lugar todavía no tiene preguntas. Cargá al menos una para poder activarlo.', { ic: 'pregunta' });
      return;
    }
    zona.append(h('div', { class: 'lista' }, lista.map((p) => {
      const activa = p.activa !== false;
      const ops = Array.isArray(p.opciones) ? p.opciones : [];
      return h('article', { class: 'item' },
        h('div', { class: 'fila entre' }, h('h3', { class: 'crecer' }, p.texto), badgeActivo(activa, { si: 'Activa', no: 'Inactiva' })),
        h('ol', { class: 'opciones-pregunta', 'aria-label': 'Opciones' }, ops.map((o, i) => h('li', { class: i === p.correcta_index ? 'correcta' : undefined },
          i === p.correcta_index ? icono('check') : h('span', { class: 'icono', 'aria-hidden': 'true' }),
          h('span', {}, o), i === p.correcta_index ? h('span', { class: 'sr-only' }, ' (respuesta correcta)') : null))),
        h('div', { class: 'acciones' },
          boton('Editar', { clase: 'btn-chico', icono: 'editar', on: () => formPregunta(p) }),
          activa
            ? boton('Desactivar', {
              clase: 'btn-chico btn-peligro-borde', icono: 'basura',
              on: async (e) => {
                const btn = e.currentTarget;
                const ok = await confirmar({ titulo: 'Desactivar pregunta', peligro: true, textoConfirmar: 'Desactivar', mensaje: '¿Desactivar esta pregunta?', detalle: 'Deja de mostrarse a los turistas. Si era la única activa, el lugar no va a poder activarse hasta que cargues otra.' });
                if (!ok) return;
                accion(btn, () => del(`/admin/preguntas/${p.id}`), 'Pregunta desactivada.', () => { huboCambios = true; cargar(); });
              },
            })
            : boton('Reactivar', { clase: 'btn-chico btn-turquesa', icono: 'play', on: (e) => accion(e.currentTarget, () => patch(`/admin/preguntas/${p.id}`, { activa: true }), 'Pregunta reactivada.', () => { huboCambios = true; cargar(); }) })));
    })));
  }, 'Cargando preguntas…');

  function formPregunta(p) {
    const editor = editorOpciones(p?.opciones?.length ? p.opciones : ['', '', ''], p ? p.correcta_index : -1);
    modalFormulario({
      titulo: p ? 'Editar pregunta' : 'Nueva pregunta',
      campos: [
        campo({ etiqueta: 'Pregunta', nombre: 'texto', tipo: 'textarea', requerido: true, valor: p?.texto, ayuda: 'Algo que se pueda responder estando en el lugar (un detalle, una placa, un color).', atributos: { minlength: 5, maxlength: 300, rows: 2 } }),
        editor,
      ],
      textoEnviar: p ? 'Guardar pregunta' : 'Agregar pregunta',
      enviar: async (d) => {
        const { opciones, correcta_index } = editor.leer();
        if (correcta_index < 0) throw new Error('Marcá cuál de las opciones es la correcta.');
        const repetidas = new Set(opciones.map((o) => o.toLowerCase()));
        if (repetidas.size !== opciones.length) throw new Error('Hay opciones repetidas. Cada opción tiene que ser distinta.');
        const cuerpo = { texto: d.texto, opciones, correcta_index };
        if (p) await patch(`/admin/preguntas/${p.id}`, cuerpo);
        else await post(`/admin/lugares/${lugar.id}/preguntas`, cuerpo);
        toast(p ? 'Pregunta actualizada.' : 'Pregunta agregada.', 'ok');
        huboCambios = true;
        cargar();
        return true;
      },
    });
  }

  cargar();
  return m;
}

function editorOpciones(iniciales, correcta) {
  const grupo = nuevoId('correcta');
  const filas = h('div', {});
  const bAgregar = boton('Agregar opción', { clase: 'btn-chico', icono: 'mas' });
  const cont = h('fieldset', {},
    h('legend', {}, 'Opciones de respuesta'),
    h('p', { class: 'ayuda mb-1' }, 'Entre 2 y 6 opciones. Marcá con el círculo cuál es la correcta.'),
    filas, h('div', { class: 'mb-2' }, bAgregar));

  function renumerar() {
    const lista = [...filas.children];
    lista.forEach((f, i) => {
      f.querySelector('input[type=radio]').setAttribute('aria-label', `La opción ${i + 1} es la correcta`);
      f.querySelector('input[type=text]').setAttribute('aria-label', `Opción ${i + 1}`);
      f.querySelector('input[type=text]').placeholder = `Opción ${i + 1}`;
      f.querySelector('button').disabled = lista.length <= 2;
      f.querySelector('button').setAttribute('aria-label', `Quitar la opción ${i + 1}`);
    });
    bAgregar.disabled = lista.length >= 6;
  }
  function agregar(texto = '', marcada = false) {
    const idErr = nuevoId('op-err');
    const radio = h('input', { type: 'radio', name: grupo });
    radio.checked = marcada;
    const input = h('input', { type: 'text', required: true, maxlength: 120, autocomplete: 'off', 'aria-describedby': idErr });
    input.value = texto;
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); input.setCustomValidity(''); document.getElementById(idErr).textContent = ''; });
    const bQuitar = boton('', { clase: 'btn-fantasma btn-icono', icono: 'basura', on: () => { fila.remove(); renumerar(); filas.querySelector('input[type=text]')?.focus(); } });
    const fila = h('div', {}, h('div', { class: 'opcion-editor' }, radio, input, bQuitar), h('p', { class: 'error-campo', id: idErr, style: { margin: '-.3rem 0 .5rem 2rem' } }));
    filas.append(fila);
    renumerar();
    return input;
  }
  iniciales.forEach((t, i) => agregar(t, i === correcta));
  bAgregar.addEventListener('click', () => agregar().focus());

  cont.leer = () => {
    const radios = [...filas.querySelectorAll('input[type=radio]')];
    return {
      opciones: [...filas.querySelectorAll('input[type=text]')].map((i) => i.value.trim()),
      correcta_index: radios.findIndex((r) => r.checked),
    };
  };
  return cont;
}

/* ================================================================ Beneficios */

const FILTRO_BENEFICIOS = [
  { valor: '', texto: 'Todos' },
  { valor: 'PENDIENTE', texto: 'Pendientes' },
  { valor: 'APROBADO', texto: 'Aprobados' },
  { valor: 'RECHAZADO', texto: 'Rechazados' },
];

function renderBeneficios(main, ctx) {
  let estado = ctx.params.get('estado') || '';
  if (!FILTRO_BENEFICIOS.some((f) => f.valor === estado)) estado = '';
  const zona = h('div', {});
  main.append(
    tituloSeccion('Beneficios', 'Aprobá o rechazá los beneficios que proponen los negocios, o creá uno directamente.',
      boton('Nuevo beneficio', { clase: 'btn-primario', icono: 'mas', on: (e) => nuevoBeneficio(e.currentTarget) })),
    h('div', { class: 'filtros' }, filtroConEtiqueta('Estado', segmentado({ opciones: FILTRO_BENEFICIOS, valor: estado, etiqueta: 'Filtrar por estado', alCambiar: (v) => { estado = v; lista.reiniciar(); } }))),
    zona);

  const lista = listaPaginada(zona, {
    cargar: (pag) => get('/admin/beneficios', { estado, ...pag }),
    vacio: () => (estado ? 'No hay beneficios con ese estado.' : 'Todavía no hay beneficios.'),
    textoCarga: 'Cargando beneficios…',
    render: (items) => tabla({
      etiqueta: 'Beneficios',
      columnas: [
        { titulo: 'Beneficio', valor: (b) => h('div', {}, h('strong', {}, b.titulo), b.descripcion ? h('div', { class: 'texto-chico texto-2' }, recortar(b.descripcion, 120)) : null) },
        { titulo: 'Negocio', valor: (b) => b.negocio?.nombre ?? b.negocio_nombre },
        { titulo: 'Puntos', valor: (b) => numero(b.puntos) },
        { titulo: 'Validez', valor: (b) => `${b.dias_validez} días` },
        { titulo: 'Stock', valor: (b) => etiquetaStock(b) },
        {
          titulo: 'Estado',
          valor: (b) => h('div', {}, h('div', { class: 'acciones' }, badgeEstado(b.estado), b.activo === false ? badge('Pausado', 'badge-neutro') : null, b.eliminado ? badge('Eliminado', 'badge-error') : null),
            b.estado === 'RECHAZADO' && b.motivo_rechazo ? h('div', { class: 'texto-chico texto-2 mt-1' }, 'Motivo: ', b.motivo_rechazo) : null),
        },
      ],
      filas: items,
      claseFila: (b) => (b.eliminado ? 'eliminada' : ''),
      acciones: (b) => (b.eliminado ? [] : [
        b.estado !== 'APROBADO' ? boton('Aprobar', { clase: 'btn-chico btn-turquesa', icono: 'check', on: (e) => accion(e.currentTarget, () => patch(`/admin/beneficios/${b.id}`, { estado: 'APROBADO' }), `“${b.titulo}” aprobado.`, lista.recargar) }) : null,
        b.estado !== 'RECHAZADO' ? boton('Rechazar', { clase: 'btn-chico btn-peligro-borde', icono: 'x', on: (e) => rechazar(b, e.currentTarget) }) : null,
        boton(b.activo === false ? 'Activar' : 'Pausar', {
          clase: 'btn-chico', icono: b.activo === false ? 'play' : 'pausa',
          on: (e) => accion(e.currentTarget, () => patch(`/admin/beneficios/${b.id}`, { activo: b.activo === false }), b.activo === false ? 'Beneficio activado.' : 'Beneficio pausado.', lista.recargar),
        }),
        boton('Borrar', { clase: 'btn-chico btn-peligro-borde', icono: 'basura', on: (e) => borrar(b, e.currentTarget) }),
      ]),
    }),
  });

  async function rechazar(b, btn) {
    const motivo = await pedirTexto({ titulo: 'Rechazar beneficio', mensaje: `El negocio va a ver este motivo junto a “${b.titulo}”.`, etiqueta: 'Motivo del rechazo', textoConfirmar: 'Rechazar', peligro: true });
    if (motivo === null) return;
    accion(btn, () => patch(`/admin/beneficios/${b.id}`, { estado: 'RECHAZADO', motivo_rechazo: motivo }), 'Beneficio rechazado.', lista.recargar);
  }

  async function borrar(b, btn) {
    const ok = await confirmar({ titulo: 'Borrar beneficio', peligro: true, textoConfirmar: 'Borrar', mensaje: `¿Borrar “${b.titulo}”?`, detalle: 'Deja de mostrarse en la app y en el panel del negocio. Los cupones ya emitidos se conservan en el historial.' });
    if (!ok) return;
    accion(btn, () => del(`/admin/beneficios/${b.id}`), 'Beneficio borrado.', lista.recargar);
  }

  async function nuevoBeneficio(btn) {
    let negocios;
    await conCarga(btn, async () => {
      try {
        negocios = (await traerTodo('/admin/usuarios', { rol: 'negocio' }))
          .filter((u) => u.negocio?.id)
          .map((u) => ({ valor: String(u.negocio.id), texto: `${u.negocio.nombre}${u.bloqueado ? ' (bloqueado)' : ''}` }))
          .sort((a, b) => a.texto.localeCompare(b.texto, 'es'));
      } catch (err) { if (!err.sesionPerdida) toastError(err, 'No se pudieron cargar los negocios'); }
    });
    if (!negocios) return;
    if (!negocios.length) {
      const ok = await confirmar({ titulo: 'No hay negocios', mensaje: 'Para crear un beneficio primero tiene que existir un usuario con rol “negocio”.', textoConfirmar: 'Ir a Usuarios' });
      if (ok) ctx.ir('usuarios', { nuevo: 'negocio' });
      return;
    }
    modalFormulario({
      titulo: 'Nuevo beneficio',
      campos: [
        h('div', { class: 'aviso aviso-info' }, icono('info'), h('div', {}, 'Los beneficios creados por la administración quedan aprobados directamente.')),
        campo({ etiqueta: 'Negocio', nombre: 'negocio_id', tipo: 'select', requerido: true, opciones: [{ valor: '', texto: 'Elegí un negocio' }, ...negocios] }),
        ...camposBeneficio({}),
      ],
      textoEnviar: 'Crear beneficio',
      enviar: async (d) => {
        const cuerpo = { negocio_id: Number(d.negocio_id), titulo: d.titulo, descripcion: d.descripcion, puntos: d.puntos, dias_validez: d.dias_validez };
        if (d.stock !== null) cuerpo.stock = d.stock;
        await post('/admin/beneficios', cuerpo);
        toast('Beneficio creado y aprobado.', 'ok');
        lista.recargar();
        return true;
      },
    });
  }

  lista.reiniciar();
}

function recortar(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/* ================================================================ Usuarios */

function renderUsuarios(main, ctx) {
  let rol = ctx.params.get('rol') || '';
  if (!ROLES[rol]) rol = '';
  let q = '';
  const zona = h('div', {});
  const cBuscar = campo({ etiqueta: 'Buscar', nombre: 'q', tipo: 'search', clase: 'campo-busqueda', atributos: { autocomplete: 'off', placeholder: 'Nombre o email', maxlength: 100 } });
  const cRol = campo({ etiqueta: 'Rol', nombre: 'rol', tipo: 'select', valor: rol, opciones: [{ valor: '', texto: 'Todos los roles' }, ...Object.entries(ROLES).map(([valor, texto]) => ({ valor, texto }))] });
  cBuscar.control.addEventListener('input', debounce(() => { q = cBuscar.control.value.trim(); lista.reiniciar(); }, 400));
  cRol.control.addEventListener('change', () => { rol = cRol.control.value; lista.reiniciar(); });

  main.append(
    tituloSeccion('Usuarios', 'Creá cuentas de negocios, residentes y administradores; bloqueá o reseteá contraseñas.',
      boton('Nuevo usuario', { clase: 'btn-primario', icono: 'mas', on: () => nuevoUsuario() })),
    h('form', { class: 'filtros', role: 'search', on: { submit: (e) => { e.preventDefault(); q = cBuscar.control.value.trim(); lista.reiniciar(); } } }, cBuscar, cRol),
    zona);

  const yoId = ctx.usuario().id;
  const lista = listaPaginada(zona, {
    cargar: (pag) => get('/admin/usuarios', { rol, q, ...pag }),
    vacio: () => (q || rol ? 'Ningún usuario coincide con la búsqueda.' : 'No hay usuarios.'),
    textoCarga: 'Cargando usuarios…',
    render: (items) => tabla({
      etiqueta: 'Usuarios',
      claseFila: (u) => (u.id === yoId ? 'destacada' : ''),
      columnas: [
        { titulo: 'Nombre', valor: (u) => h('div', {}, h('strong', {}, u.nombre), u.id === yoId ? h('span', { class: 'texto-chico texto-2' }, ' (vos)') : null, u.negocio?.nombre ? h('div', { class: 'texto-chico texto-2' }, u.negocio.nombre) : null) },
        { titulo: 'Email', valor: (u) => h('span', { class: 'romper' }, u.email) },
        { titulo: 'Rol', valor: (u) => badge(ROLES[u.rol] || u.rol, { admin: 'badge-lapacho', negocio: 'badge-pendiente', residente: 'badge-info', turista: 'badge-neutro' }[u.rol]) },
        {
          titulo: 'Puntos',
          valor: (u) => (u.rol === 'turista' ? `${numero(u.puntos)} (hist. ${numero(u.puntos_historicos)})`
            : u.rol === 'residente' ? `${numero(u.puntos_comunidad)} comunidad` : null),
        },
        { titulo: 'Rango', valor: (u) => (u.rol === 'turista' || u.rol === 'residente' ? u.rango : null) },
        { titulo: 'Estado', valor: (u) => (u.bloqueado ? badge('Bloqueado', 'badge-error') : badge('Activo', 'badge-ok')) },
        { titulo: 'Alta', valor: (u) => fecha(u.creado_en) },
      ],
      filas: items,
      acciones: (u) => [
        boton('Editar nombre', { clase: 'btn-chico', icono: 'editar', on: () => editarNombre(u) }),
        u.id === yoId ? null : u.bloqueado
          ? boton('Desbloquear', { clase: 'btn-chico btn-turquesa', icono: 'candadoAbierto', on: (e) => bloquear(u, false, e.currentTarget) })
          : boton('Bloquear', { clase: 'btn-chico btn-peligro-borde', icono: 'candado', on: (e) => bloquear(u, true, e.currentTarget) }),
        boton('Resetear contraseña', { clase: 'btn-chico', icono: 'llave', on: (e) => resetear(u, e.currentTarget) }),
      ],
    }),
  });

  function editarNombre(u) {
    modalFormulario({
      titulo: 'Editar nombre',
      campos: [campo({ etiqueta: 'Nombre', nombre: 'nombre', requerido: true, valor: u.nombre, atributos: { minlength: 2, maxlength: 80, autocomplete: 'off' } })],
      enviar: async (d) => {
        if (d.nombre === u.nombre) { toast('No hiciste cambios.', 'info'); return true; }
        await patch(`/admin/usuarios/${u.id}`, { nombre: d.nombre });
        toast('Nombre actualizado.', 'ok');
        if (u.id === yoId) ctx.actualizarUsuario({ nombre: d.nombre });
        lista.recargar();
        return true;
      },
    });
  }

  async function bloquear(u, bloquearlo, btn) {
    const ok = await confirmar(bloquearlo
      ? { titulo: 'Bloquear usuario', peligro: true, textoConfirmar: 'Bloquear', mensaje: `¿Bloquear a ${u.nombre} (${u.email})?`, detalle: 'Se cierran todas sus sesiones y no va a poder ingresar hasta que lo desbloquees.' }
      : { titulo: 'Desbloquear usuario', textoConfirmar: 'Desbloquear', mensaje: `¿Desbloquear a ${u.nombre}? Va a poder volver a ingresar.` });
    if (!ok) return;
    accion(btn, () => patch(`/admin/usuarios/${u.id}`, { bloqueado: bloquearlo }), bloquearlo ? 'Usuario bloqueado.' : 'Usuario desbloqueado.', lista.recargar);
  }

  async function resetear(u, btn) {
    const ok = await confirmar({ titulo: 'Resetear contraseña', peligro: true, textoConfirmar: 'Generar temporal', mensaje: `¿Generar una contraseña temporal para ${u.nombre}?`, detalle: 'Su contraseña actual deja de funcionar. Vas a ver la temporal una sola vez para pasársela.' });
    if (!ok) return;
    await conCarga(btn, async () => {
      try {
        const r = await post(`/admin/usuarios/${u.id}/reset-password`);
        const clave = r?.password_temporal ?? '';
        const m = abrirModal({
          titulo: 'Contraseña temporal',
          contenido: [
            h('p', {}, 'Pasale esta contraseña a ', h('strong', {}, u.nombre), ' (', h('span', { class: 'romper' }, u.email), ').'),
            h('div', { class: 'clave-temporal', tabindex: '0', 'aria-label': 'Contraseña temporal' }, clave),
            h('div', { class: 'aviso mt-2' }, icono('alerta'), h('div', {}, 'Anotala ahora: no se vuelve a mostrar. Pedile que la cambie desde “Cambiar contraseña” apenas ingrese.')),
          ],
          pie: [boton('Copiar', { icono: 'copiar', on: () => copiar(clave) }), boton('Listo', { clase: 'btn-primario', on: () => m.cerrar() })],
        });
      } catch (err) { if (!err.sesionPerdida) toastError(err); }
    });
  }

  function nuevoUsuario(rolInicial = '') {
    const cPass = campo({ etiqueta: 'Contraseña inicial', nombre: 'password', tipo: 'text', requerido: true, ayuda: 'Mínimo 8 caracteres. Pasásela al usuario y pedile que la cambie al ingresar.', atributos: { minlength: 8, maxlength: 128, autocomplete: 'new-password', spellcheck: 'false', class: 'mono' } });
    const bGenerar = boton('Generar una segura', { clase: 'btn-chico', icono: 'llave', on: () => { cPass.control.value = generarClave(); cPass.control.dispatchEvent(new Event('input')); } });
    const cRolNuevo = campo({
      etiqueta: 'Rol', nombre: 'rol', tipo: 'select', requerido: true, valor: rolInicial,
      opciones: [{ valor: '', texto: 'Elegí un rol' }, { valor: 'negocio', texto: 'Negocio' }, { valor: 'residente', texto: 'Residente' }, { valor: 'admin', texto: 'Administración' }],
      ayuda: 'Los turistas se registran solos desde la app Android.',
    });
    const cNegNombre = campo({ etiqueta: 'Nombre del negocio', nombre: 'neg_nombre', requerido: true, atributos: { minlength: 2, maxlength: 80, autocomplete: 'off' } });
    const cNegDir = campo({ etiqueta: 'Dirección', nombre: 'neg_direccion', requerido: true, atributos: { maxlength: 200, autocomplete: 'off' } });
    const cNegTel = campo({ etiqueta: 'Teléfono', nombre: 'neg_telefono', tipo: 'tel', opcional: true, atributos: { maxlength: 40, inputmode: 'tel', pattern: PATRON_TELEFONO, 'data-mensaje-patron': MENSAJE_TELEFONO } });
    const cNegDesc = campo({ etiqueta: 'Descripción', nombre: 'neg_descripcion', tipo: 'textarea', opcional: true, atributos: { maxlength: 2000, rows: 3 } });
    const grupoNegocio = h('fieldset', {}, h('legend', {}, 'Datos del negocio'), cNegNombre, cNegDir, cNegTel, cNegDesc);
    const sincronizar = () => {
      const esNegocio = cRolNuevo.control.value === 'negocio';
      grupoNegocio.hidden = !esNegocio;
      grupoNegocio.disabled = !esNegocio;
    };
    cRolNuevo.control.addEventListener('change', sincronizar);
    sincronizar();

    modalFormulario({
      titulo: 'Nuevo usuario',
      campos: [
        campo({ etiqueta: 'Nombre y apellido', nombre: 'nombre', requerido: true, atributos: { minlength: 2, maxlength: 80, autocomplete: 'off' } }),
        campo({ etiqueta: 'Email', nombre: 'email', tipo: 'email', requerido: true, atributos: { maxlength: 254, autocomplete: 'off', spellcheck: 'false' } }),
        cPass, h('div', { class: 'mb-2', style: { marginTop: '-.4rem' } }, bGenerar),
        cRolNuevo, grupoNegocio,
      ],
      textoEnviar: 'Crear usuario',
      enviar: async (d) => {
        const cuerpo = { nombre: d.nombre, email: d.email, password: cPass.control.value, rol: d.rol };
        if (d.rol === 'negocio') {
          cuerpo.negocio = { nombre: d.neg_nombre, direccion: d.neg_direccion, telefono: d.neg_telefono || '', descripcion: d.neg_descripcion || '' };
        }
        await post('/admin/usuarios', cuerpo);
        toast(`Usuario ${d.email} creado.`, 'ok');
        lista.reiniciar();
        return true;
      },
    });
  }

  lista.reiniciar();
  const pedido = ctx.params.get('nuevo');
  if (pedido) nuevoUsuario(['negocio', 'residente', 'admin'].includes(pedido) ? pedido : '');
}

function generarClave() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => abc[n % abc.length]).join('');
}

/* ================================================================ Recomendaciones */

const FILTRO_RECOS = [
  { valor: 'PENDIENTE', texto: 'Pendientes' },
  { valor: 'APROBADA', texto: 'Aprobadas' },
  { valor: 'RECHAZADA', texto: 'Rechazadas' },
  { valor: '', texto: 'Todas' },
];

function renderRecomendaciones(main, ctx) {
  let estado = ctx.params.has('estado') ? ctx.params.get('estado') : 'PENDIENTE';
  if (!FILTRO_RECOS.some((f) => f.valor === estado)) estado = 'PENDIENTE';
  const zona = h('div', {});
  main.append(
    tituloSeccion('Recomendaciones', 'Lo que los residentes sugieren a los turistas. Al aprobar una, el residente suma 50 puntos de comunidad.'),
    h('div', { class: 'filtros' }, filtroConEtiqueta('Estado', segmentado({ opciones: FILTRO_RECOS, valor: estado, etiqueta: 'Filtrar por estado', alCambiar: (v) => { estado = v; lista.reiniciar(); } }))),
    zona);

  const lista = listaPaginada(zona, {
    cargar: (pag) => get('/admin/recomendaciones', { estado, ...pag }),
    vacio: () => (estado === 'PENDIENTE' ? '¡Al día! No hay recomendaciones esperando revisión.' : 'No hay recomendaciones con ese estado.'),
    textoCarga: 'Cargando recomendaciones…',
    render: (items) => h('div', { class: 'grilla' }, items.map((r) => h('article', { class: 'item' },
      h('div', { class: 'fila entre' }, h('h3', { class: 'crecer' }, r.titulo), badgeEstado(r.estado)),
      h('div', { class: 'meta' }, badge(r.categoria || 'Sin categoría', 'badge-info'),
        h('span', {}, 'Por ', h('strong', {}, r.autor_nombre || r.residente_nombre || r.autor?.nombre || '—')),
        h('span', {}, fecha(r.fecha || r.creado_en))),
      h('p', { class: 'descripcion' }, r.descripcion),
      r.estado === 'RECHAZADA' && r.motivo_rechazo ? h('p', { class: 'texto-chico texto-2 sin-margen' }, 'Motivo: ', r.motivo_rechazo) : null,
      r.estado === 'PENDIENTE' || !r.estado
        ? h('div', { class: 'acciones' },
          boton('Aprobar', { clase: 'btn-chico btn-turquesa', icono: 'check', on: (e) => accion(e.currentTarget, () => post(`/admin/recomendaciones/${r.id}/aprobar`), 'Recomendación aprobada y publicada.', lista.recargar) }),
          boton('Rechazar', {
            clase: 'btn-chico btn-peligro-borde', icono: 'x',
            on: async (e) => {
              const btn = e.currentTarget;
              const motivo = await pedirTexto({ titulo: 'Rechazar recomendación', mensaje: `El residente va a ver este motivo junto a “${r.titulo}”.`, etiqueta: 'Motivo del rechazo', textoConfirmar: 'Rechazar', peligro: true });
              if (motivo === null) return;
              accion(btn, () => post(`/admin/recomendaciones/${r.id}/rechazar`, { motivo }), 'Recomendación rechazada.', lista.recargar);
            },
          }))
        : null))),
  });
  lista.reiniciar();
}

/* ================================================================ Temporadas */

function renderTemporadas(main) {
  let temporadas = [];
  const zona = h('div', {});
  main.append(
    tituloSeccion('Temporadas', 'Multiplican los puntos que ganan los turistas (por ejemplo, x2 en Carnaval). Solo puede haber una activa y se aplica si hoy está dentro de sus fechas.',
      boton('Nueva temporada', { clase: 'btn-primario', icono: 'mas', on: () => formTemporada(null) })),
    zona);

  const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Jujuy' });
  const dia = (s) => (s ? String(s).slice(0, 10) : '');

  function situacion(t) {
    if (t.vigente === true) return badge('Vigente hoy', 'badge-ok');
    const d = hoy();
    if (dia(t.fecha_fin) && d > dia(t.fecha_fin)) return badge('Finalizada', 'badge-neutro');
    if (dia(t.fecha_inicio) && d < dia(t.fecha_inicio)) return badge('Programada', 'badge-info');
    return badge('En fechas', 'badge-ok');
  }

  const cargar = () => cargarEn(zona, () => traerTodo('/admin/temporadas'), (lista) => {
    temporadas = lista.slice().sort((a, b) => dia(b.fecha_inicio).localeCompare(dia(a.fecha_inicio)));
    if (!temporadas.length) {
      estadoVacio(zona, 'No hay temporadas. Sin temporada activa, los puntos se otorgan normales (x1).', { ic: 'calendario', accion: boton('Crear temporada', { clase: 'btn-primario', icono: 'mas', on: () => formTemporada(null) }) });
      return;
    }
    const activa = temporadas.find((t) => t.activa);
    zona.append(
      activa
        ? h('div', { class: 'aviso aviso-ok' }, icono('checkCirculo'), h('div', {}, 'Temporada activa: ', h('strong', {}, activa.nombre), ` (x${activa.multiplicador}).`,
          dia(activa.fecha_fin) && hoy() > dia(activa.fecha_fin) ? ' Ojo: sus fechas ya terminaron, así que no se está aplicando.' : dia(activa.fecha_inicio) && hoy() < dia(activa.fecha_inicio) ? ' Se va a aplicar cuando empiecen sus fechas.' : ''))
        : h('div', { class: 'aviso aviso-info' }, icono('info'), h('div', {}, 'No hay temporada activa: los puntos se otorgan normales (x1).')),
      tabla({
        etiqueta: 'Temporadas',
        claseFila: (t) => (t.activa ? 'destacada' : ''),
        columnas: [
          { titulo: 'Nombre', valor: (t) => h('strong', {}, t.nombre) },
          { titulo: 'Desde', valor: (t) => fecha(dia(t.fecha_inicio)) },
          { titulo: 'Hasta', valor: (t) => fecha(dia(t.fecha_fin)) },
          { titulo: 'Multiplicador', valor: (t) => `x${t.multiplicador}` },
          { titulo: 'Fechas', valor: situacion },
          { titulo: 'Estado', valor: (t) => badgeActivo(t.activa, { si: 'Activa', no: 'Inactiva' }) },
        ],
        filas: temporadas,
        acciones: (t) => [
          boton('Editar', { clase: 'btn-chico', icono: 'editar', on: () => formTemporada(t) }),
          t.activa
            ? boton('Desactivar', { clase: 'btn-chico btn-peligro-borde', icono: 'pausa', on: (e) => cambiarActiva(t, false, e.currentTarget) })
            : boton('Activar', { clase: 'btn-chico btn-turquesa', icono: 'play', on: (e) => cambiarActiva(t, true, e.currentTarget) }),
        ],
      }));
  }, 'Cargando temporadas…');

  async function cambiarActiva(t, activar, btn) {
    const otra = temporadas.find((x) => x.activa && x.id !== t.id);
    const ok = await confirmar(activar
      ? { titulo: 'Activar temporada', textoConfirmar: 'Activar', mensaje: `¿Activar “${t.nombre}” (x${t.multiplicador})?`, detalle: otra ? `Se va a desactivar “${otra.nombre}”, porque solo puede haber una activa.` : 'Se aplica a las visitas que ocurran dentro de sus fechas.' }
      : { titulo: 'Desactivar temporada', peligro: true, textoConfirmar: 'Desactivar', mensaje: `¿Desactivar “${t.nombre}”? Los puntos vuelven a otorgarse normales (x1).` });
    if (!ok) return;
    accion(btn, () => patch(`/admin/temporadas/${t.id}`, { activa: activar }), activar ? 'Temporada activada.' : 'Temporada desactivada.', cargar);
  }

  function formTemporada(t) {
    const cIni = campo({ etiqueta: 'Fecha de inicio', nombre: 'fecha_inicio', tipo: 'date', requerido: true, valor: dia(t?.fecha_inicio) });
    const cFin = campo({ etiqueta: 'Fecha de fin', nombre: 'fecha_fin', tipo: 'date', requerido: true, valor: dia(t?.fecha_fin), ayuda: 'Incluida.' });
    modalFormulario({
      titulo: t ? 'Editar temporada' : 'Nueva temporada',
      campos: [
        campo({ etiqueta: 'Nombre', nombre: 'nombre', requerido: true, valor: t?.nombre, ayuda: 'Ej.: “Carnaval 2027” o “Vacaciones de invierno”.', atributos: { minlength: 3, maxlength: 80, autocomplete: 'off' } }),
        h('div', { class: 'campos-2' }, cIni, cFin),
        campo({ etiqueta: 'Multiplicador de puntos', nombre: 'multiplicador', tipo: 'number', requerido: true, valor: t?.multiplicador ?? 1.5, ayuda: 'Entre 0,5 y 5. Ej.: 2 duplica los puntos de cada visita.', atributos: { min: 0.5, max: 5, step: 0.05, inputmode: 'decimal' } }),
        campo({ etiqueta: 'Activa', nombre: 'activa', tipo: 'checkbox', valor: t ? !!t.activa : false, ayuda: 'Solo puede haber una activa: si la activás, se desactivan las demás.' }),
      ],
      textoEnviar: t ? 'Guardar cambios' : 'Crear temporada',
      antesDeValidar: () => {
        cFin.control.setCustomValidity('');
        if (cIni.control.value && cFin.control.value && cFin.control.value < cIni.control.value) cFin.control.setCustomValidity('La fecha de fin no puede ser anterior a la de inicio.');
      },
      enviar: async (d) => {
        const cuerpo = { nombre: d.nombre, fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin, multiplicador: Math.round(d.multiplicador * 100) / 100, activa: d.activa };
        if (t) {
          const cambios = {};
          for (const [k, v] of Object.entries(cuerpo)) {
            const antes = k.startsWith('fecha') ? dia(t[k]) : k === 'activa' ? !!t[k] : t[k];
            if (v !== antes) cambios[k] = v;
          }
          if (!Object.keys(cambios).length) { toast('No hiciste cambios.', 'info'); return true; }
          await patch(`/admin/temporadas/${t.id}`, cambios);
          toast('Temporada actualizada.', 'ok');
        } else {
          await post('/admin/temporadas', cuerpo);
          toast('Temporada creada.', 'ok');
        }
        cargar();
        return true;
      },
    });
  }

  cargar();
}

/* ================================================================ Canjes */

const FILTRO_CANJES = [
  { valor: '', texto: 'Todos' },
  { valor: 'DISPONIBLE', texto: 'Disponibles' },
  { valor: 'USADO', texto: 'Usados' },
  { valor: 'VENCIDO', texto: 'Vencidos' },
  { valor: 'ANULADO', texto: 'Anulados' },
];

function renderCanjes(main, ctx) {
  let estado = ctx.params.get('estado') || '';
  if (!FILTRO_CANJES.some((f) => f.valor === estado)) estado = '';
  const zona = h('div', {});
  main.append(
    tituloSeccion('Canjes', 'Cupones que los turistas obtuvieron con sus puntos. Podés anular un cupón y, si corresponde, devolver los puntos.'),
    h('div', { class: 'filtros' }, filtroConEtiqueta('Estado', segmentado({ opciones: FILTRO_CANJES, valor: estado, etiqueta: 'Filtrar por estado', alCambiar: (v) => { estado = v; lista.reiniciar(); } }))),
    zona);

  const turista = (c) => c.turista_nombre ?? c.usuario_nombre ?? c.usuario?.nombre ?? c.turista?.nombre;
  const lista = listaPaginada(zona, {
    cargar: (pag) => get('/admin/canjes', { estado, ...pag }),
    vacio: () => (estado ? 'No hay canjes con ese estado.' : 'Todavía no hay canjes.'),
    textoCarga: 'Cargando canjes…',
    render: (items) => tabla({
      etiqueta: 'Canjes',
      columnas: [
        { titulo: 'Código', valor: (c) => h('span', { class: 'mono' }, c.codigo) },
        { titulo: 'Beneficio', valor: (c) => h('div', {}, c.beneficio?.titulo ?? c.beneficio_titulo ?? '—', (c.beneficio?.negocio_nombre ?? c.negocio_nombre) ? h('div', { class: 'texto-chico texto-2' }, c.beneficio?.negocio_nombre ?? c.negocio_nombre) : null) },
        { titulo: 'Turista', valor: turista },
        { titulo: 'Puntos', valor: (c) => numero(c.puntos) },
        { titulo: 'Estado', valor: (c) => badgeEstado(c.estado) },
        { titulo: 'Canjeado', valor: (c) => fechaHora(c.creado_en) },
        { titulo: 'Vence / usado', valor: (c) => (c.usado_en ? 'Usado ' + fechaHora(c.usado_en) : 'Vence ' + fecha(c.vence_en)) },
      ],
      filas: items,
      acciones: (c) => (c.estado === 'DISPONIBLE' || c.estado === 'VENCIDO'
        ? [boton('Anular', { clase: 'btn-chico btn-peligro-borde', icono: 'x', on: () => anular(c) })]
        : []),
    }),
  });

  function anular(c) {
    modalFormulario({
      titulo: 'Anular cupón',
      campos: [
        h('p', {}, 'Vas a anular el cupón ', h('strong', { class: 'mono' }, c.codigo), ' de ', h('strong', {}, turista(c) || 'un turista'), ` (${c.beneficio?.titulo ?? c.beneficio_titulo ?? 'beneficio'}).`),
        h('p', { class: 'texto-2 texto-chico' }, 'Un cupón anulado ya no se puede usar en el negocio. Esta acción no se puede deshacer.'),
        campo({ etiqueta: `Devolverle los ${numero(c.puntos)} puntos al turista`, nombre: 'devolver_puntos', tipo: 'checkbox', valor: true, ayuda: 'Desmarcalo si el cupón se anula por un uso indebido.' }),
      ],
      textoEnviar: 'Anular cupón', claseEnviar: 'btn-peligro', iconoEnviar: 'x',
      enviar: async (d) => {
        await post(`/admin/canjes/${c.id}/anular`, { devolver_puntos: !!d.devolver_puntos });
        toast(d.devolver_puntos ? 'Cupón anulado y puntos devueltos.' : 'Cupón anulado sin devolver puntos.', 'ok');
        lista.recargar();
        return true;
      },
    });
  }

  lista.reiniciar();
}

/* ================================================================ Alertas */

const TIPOS_ALERTA = {
  UBICACION_FALSA: ['Ubicación falsa', 'El dispositivo informó una ubicación simulada (mock).'],
  VIAJE_IMPOSIBLE: ['Viaje imposible', 'Se movió entre dos puntos a más de 200 km/h.'],
  MUESTRAS_IDENTICAS: ['Muestras GPS idénticas', 'Todas las muestras tenían exactamente las mismas coordenadas.'],
  DISPOSITIVO_CON_DEMASIADAS_CUENTAS: ['Dispositivo con muchas cuentas', 'Un mismo teléfono intentó crear demasiadas cuentas de turista.'],
  FUERZA_BRUTA_CUPONES: ['Fuerza bruta de cupones', 'Un negocio probó muchos códigos de cupón inexistentes.'],
};

function renderAlertas(main) {
  let resueltas = false;
  const zona = h('div', {});
  main.append(
    tituloSeccion('Alertas anti-trampa', 'Comportamientos sospechosos detectados automáticamente. Revisalos y marcalos como resueltos.'),
    h('div', { class: 'filtros' }, filtroConEtiqueta('Mostrar', segmentado({
      etiqueta: 'Filtrar alertas', valor: 'false',
      opciones: [{ valor: 'false', texto: 'Abiertas' }, { valor: 'true', texto: 'Resueltas' }],
      alCambiar: (v) => { resueltas = v === 'true'; lista.reiniciar(); },
    }))),
    zona);

  const usuarioDe = (a) => a.usuario_nombre ?? a.usuario?.nombre ?? (a.usuario_email ? a.usuario_email : null) ?? (a.usuario_id ? `Usuario #${a.usuario_id}` : null);
  const detalleDe = (a) => {
    const partes = [];
    const texto = a.detalle ?? a.descripcion ?? a.mensaje;
    if (typeof texto === 'string' && texto) partes.push(h('p', { class: 'descripcion' }, texto));
    const extra = (texto && typeof texto === 'object') ? texto : a.datos;
    if (extra && typeof extra === 'object') {
      partes.push(h('dl', { class: 'meta sin-margen' }, Object.entries(extra).map(([k, v]) => h('span', {}, h('strong', {}, k.replace(/_/g, ' ') + ': '), typeof v === 'object' ? JSON.stringify(v) : String(v)))));
    }
    return partes;
  };

  const lista = listaPaginada(zona, {
    cargar: (pag) => get('/admin/alertas', { resueltas: String(resueltas), ...pag }),
    vacio: () => (resueltas ? 'No hay alertas resueltas.' : '¡Todo tranquilo! No hay alertas abiertas.'),
    textoCarga: 'Cargando alertas…',
    render: (items) => h('div', { class: 'lista' }, items.map((a) => {
      const [nombre, explicacion] = TIPOS_ALERTA[a.tipo] || [a.tipo || 'Alerta', ''];
      return h('article', { class: 'item' },
        h('div', { class: 'fila entre' },
          h('h3', { class: 'crecer' }, nombre),
          a.resuelta ? badge('Resuelta', 'badge-ok') : badge('Abierta', 'badge-error')),
        h('div', { class: 'meta' },
          h('span', { class: 'mono' }, a.tipo),
          h('span', {}, fechaHora(a.creado_en ?? a.fecha)),
          usuarioDe(a) ? h('span', {}, 'Usuario: ', h('strong', {}, usuarioDe(a))) : null,
          a.dispositivo_id ? h('span', { class: 'romper' }, 'Dispositivo: ', a.dispositivo_id) : null,
          a.lugar_nombre ? h('span', {}, 'Lugar: ', a.lugar_nombre) : null,
          a.resuelta_en ? h('span', {}, 'Resuelta: ', fechaHora(a.resuelta_en)) : null),
        explicacion ? h('p', { class: 'texto-chico texto-2 sin-margen' }, explicacion) : null,
        detalleDe(a),
        !a.resuelta && !resueltas
          ? h('div', { class: 'acciones' }, boton('Marcar como resuelta', { clase: 'btn-chico btn-turquesa', icono: 'check', on: (e) => accion(e.currentTarget, () => post(`/admin/alertas/${a.id}/resolver`), 'Alerta resuelta.', lista.recargar) }))
          : null);
    })),
  });
  lista.reiniciar();
}

