// Panel del residente: recomendaciones propias y ranking de la comunidad.
import { get, post } from './api.js';
import {
  h, boton, vaciar, toast, campo, cargarEn, estadoVacio, modalFormulario, tituloSeccion,
  fecha, numero, badgeEstado, badge, icono, conCarga,
} from './ui.js';
import { CATEGORIAS } from './comun.js';

const MAX_PENDIENTES = 5;
const PUNTOS_POR_APROBADA = 50;
const RANGOS = [
  { nombre: 'Vecino', desde: 0 },
  { nombre: 'Vecino Activo', desde: 300 },
  { nombre: 'Embajador Local', desde: 1000 },
];

export const secciones = [
  { id: 'recomendaciones', titulo: 'Mis recomendaciones', icono: 'mensaje', render: renderRecomendaciones },
  { id: 'ranking', titulo: 'Ranking', icono: 'trofeo', render: renderRanking },
];

/* ================================================================ Recomendaciones */

function renderRecomendaciones(main, ctx) {
  const bNueva = boton('Nueva recomendación', { clase: 'btn-primario', icono: 'mas' });
  const avisoLimite = h('div', { hidden: true });
  const resumen = h('div', {});
  const zona = h('div', {});
  main.append(
    tituloSeccion('Mis recomendaciones', 'Contale a los turistas qué lugares de San Salvador de Jujuy no se pueden perder.', bNueva),
    resumen, avisoLimite, zona);

  let pendientes = 0;
  bNueva.addEventListener('click', () => {
    if (pendientes >= MAX_PENDIENTES) {
      toast(`Ya tenés ${MAX_PENDIENTES} recomendaciones pendientes. Esperá a que se revisen para cargar otra.`, 'error');
      return;
    }
    nuevaRecomendacion();
  });

  function cargar() {
    cargarEn(zona, () => get('/residente/recomendaciones'), (r) => {
      const lista = (Array.isArray(r) ? r : (r?.items || [])).slice()
        .sort((a, b) => String(b.creado_en || b.fecha || '').localeCompare(String(a.creado_en || a.fecha || '')));
      pendientes = lista.filter((x) => x.estado === 'PENDIENTE').length;
      const aprobadas = lista.filter((x) => x.estado === 'APROBADA').length;
      const rechazadas = lista.filter((x) => x.estado === 'RECHAZADA').length;

      vaciar(resumen).append(h('div', { class: 'grilla-stats mb-2' },
        h('div', { class: 'stat stat-sol' }, h('span', { class: 'stat-valor' }, numero(pendientes)), h('span', { class: 'stat-etiqueta' }, `Pendientes (máx. ${MAX_PENDIENTES})`)),
        h('div', { class: 'stat stat-turquesa' }, h('span', { class: 'stat-valor' }, numero(aprobadas)), h('span', { class: 'stat-etiqueta' }, 'Aprobadas')),
        h('div', { class: 'stat stat-lapacho' }, h('span', { class: 'stat-valor' }, numero(rechazadas)), h('span', { class: 'stat-etiqueta' }, 'Rechazadas'))));

      vaciar(avisoLimite);
      avisoLimite.hidden = pendientes < MAX_PENDIENTES;
      bNueva.setAttribute('aria-disabled', String(pendientes >= MAX_PENDIENTES));
      if (pendientes >= MAX_PENDIENTES) {
        avisoLimite.append(h('div', { class: 'aviso' }, icono('info'), h('div', {}, `Tenés ${MAX_PENDIENTES} recomendaciones esperando revisión, que es el máximo. Cuando la administración revise alguna vas a poder cargar otra.`)));
      }

      if (!lista.length) {
        estadoVacio(zona, `Todavía no cargaste recomendaciones. Por cada una aprobada sumás ${PUNTOS_POR_APROBADA} puntos de comunidad.`, {
          ic: 'mensaje', accion: boton('Crear mi primera recomendación', { clase: 'btn-primario', icono: 'mas', on: nuevaRecomendacion }),
        });
        return;
      }
      zona.append(h('div', { class: 'grilla' }, lista.map((rec) => h('article', { class: 'item' },
        h('div', { class: 'fila entre' }, h('h3', { class: 'crecer' }, rec.titulo), badgeEstado(rec.estado)),
        h('div', { class: 'meta' }, badge(rec.categoria || 'Sin categoría', 'badge-info'), h('span', {}, fecha(rec.creado_en || rec.fecha))),
        h('p', { class: 'descripcion' }, rec.descripcion),
        rec.estado === 'RECHAZADA'
          ? h('div', { class: 'aviso aviso-error sin-margen' }, icono('x'), h('div', {}, h('strong', {}, 'Motivo del rechazo: '), rec.motivo_rechazo || 'Sin motivo indicado.'))
          : rec.estado === 'APROBADA'
            ? h('p', { class: 'texto-chico sin-margen', style: { color: 'var(--ok)' } }, `Publicada en la app · +${PUNTOS_POR_APROBADA} puntos de comunidad`)
            : h('p', { class: 'texto-chico texto-2 sin-margen' }, 'Esperando revisión de la administración.')))));
    }, 'Cargando tus recomendaciones…');
  }

  function nuevaRecomendacion() {
    modalFormulario({
      titulo: 'Nueva recomendación',
      campos: [
        campo({ etiqueta: 'Título', nombre: 'titulo', requerido: true, ayuda: 'Ej.: “Empanadas en el Mercado Municipal”.', atributos: { minlength: 3, maxlength: 120, autocomplete: 'off' } }),
        campo({
          etiqueta: 'Categoría', nombre: 'categoria', tipo: 'select', requerido: true,
          opciones: [{ valor: '', texto: 'Elegí una categoría' }, ...CATEGORIAS.map((c) => ({ valor: c, texto: c }))],
        }),
        campo({ etiqueta: 'Descripción', nombre: 'descripcion', tipo: 'textarea', requerido: true, ayuda: 'Dónde queda, qué tiene de especial y algún dato útil (horarios, precios, cómo llegar).', atributos: { minlength: 20, maxlength: 2000, rows: 5 } }),
        h('p', { class: 'texto-chico texto-2' }, `La administración la revisa antes de publicarla. Si la aprueban sumás ${PUNTOS_POR_APROBADA} puntos de comunidad.`),
      ],
      textoEnviar: 'Enviar a revisión',
      enviar: async (d) => {
        await post('/residente/recomendaciones', { titulo: d.titulo, categoria: d.categoria, descripcion: d.descripcion });
        toast('¡Gracias! Tu recomendación quedó pendiente de revisión.', 'ok');
        cargar();
        return true;
      },
    });
  }

  if (ctx.params.get('nueva') === '1') nuevaRecomendacion();
  cargar();
}

/* ================================================================ Ranking */

function parsearRanking(r) {
  const lista = Array.isArray(r) ? r
    : (r?.top ?? r?.ranking ?? r?.items ?? r?.top10 ?? (r && Object.values(r).find(Array.isArray)) ?? []);
  const mi = Array.isArray(r) ? null : r?.mi_posicion;
  const miPos = typeof mi === 'number' ? mi : (mi && typeof mi === 'object' ? (mi.posicion ?? null) : null);
  return { lista, miPos, miDatos: mi && typeof mi === 'object' ? mi : null };
}

function rangoInfo(puntos) {
  let actual = RANGOS[0];
  let siguiente = null;
  for (let i = 0; i < RANGOS.length; i++) {
    if (puntos >= RANGOS[i].desde) { actual = RANGOS[i]; siguiente = RANGOS[i + 1] || null; }
  }
  return { actual, siguiente };
}

function renderRanking(main, ctx) {
  const bActualizar = boton('Actualizar', { icono: 'recargar' });
  const zona = h('div', {});
  main.append(tituloSeccion('Ranking de la comunidad', 'Los residentes que más ayudan a los turistas a descubrir Jujuy.', bActualizar), zona);

  const cargar = () => cargarEn(zona, async () => {
    const [ranking, yo] = await Promise.all([get('/residente/ranking'), ctx.refrescarUsuario().catch(() => ctx.usuario())]);
    return { ranking, yo };
  }, ({ ranking, yo }) => {
    const { lista, miPos, miDatos } = parsearRanking(ranking);
    const puntos = Number(miDatos?.puntos_comunidad ?? yo.puntos_comunidad ?? 0);
    const { actual, siguiente } = rangoInfo(puntos);
    const rango = yo.rango || miDatos?.rango || actual.nombre;
    const porcentaje = siguiente ? Math.min(100, Math.round(((puntos - actual.desde) / (siguiente.desde - actual.desde)) * 100)) : 100;

    const miTarjeta = h('section', { class: 'tarjeta', 'aria-labelledby': 'mi-posicion' },
      h('h2', { id: 'mi-posicion' }, 'Tu lugar en la comunidad'),
      h('div', { class: 'grilla-stats' },
        h('div', { class: 'stat stat-terracota' }, h('span', { class: 'stat-valor' }, miPos ? `#${miPos}` : '—'), h('span', { class: 'stat-etiqueta' }, 'Tu posición')),
        h('div', { class: 'stat stat-turquesa' }, h('span', { class: 'stat-valor' }, numero(puntos)), h('span', { class: 'stat-etiqueta' }, 'Puntos de comunidad')),
        h('div', { class: 'stat stat-sol' }, h('span', { class: 'stat-valor', style: { fontSize: '1.2rem' } }, rango), h('span', { class: 'stat-etiqueta' }, 'Rango'))),
      h('div', { class: 'mt-2' },
        h('div', { class: 'fila entre texto-chico' },
          h('span', {}, siguiente ? `Próximo rango: ${siguiente.nombre}` : '¡Llegaste al rango máximo!'),
          siguiente ? h('span', { class: 'texto-2' }, `Te faltan ${numero(siguiente.desde - puntos)} puntos`) : null),
        h('div', { class: 'progreso mt-1', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(porcentaje), 'aria-label': 'Progreso hacia el próximo rango' },
          h('div', { style: { width: porcentaje + '%' } }))),
      !miPos ? h('p', { class: 'texto-chico texto-2 mt-1 sin-margen' }, 'Todavía no aparecés en el ranking. Sumás puntos cada vez que aprueban una de tus recomendaciones.') : null,
      h('p', { class: 'texto-chico texto-2 mt-1 sin-margen' }, `Rangos: Vecino (0–299) · Vecino Activo (300–999) · Embajador Local (1000 o más). Cada recomendación aprobada suma ${PUNTOS_POR_APROBADA} puntos.`));

    const top = h('section', { class: 'tarjeta', 'aria-labelledby': 'titulo-top' }, h('h2', { id: 'titulo-top' }, 'Top 10 de residentes'));
    if (!lista.length) {
      const vacio = h('div', {});
      estadoVacio(vacio, 'Todavía no hay residentes con puntos. ¡Podés ser el primero!', { ic: 'trofeo' });
      top.append(vacio);
    } else {
      // Con empates (1-2-2-4) varias filas comparten posición: se resalta la que además coincide en nombre.
      const candidatos = lista.filter((p, i) => (p.posicion ?? i + 1) === miPos);
      const miFila = candidatos.find((p) => p.nombre === yo.nombre) || (candidatos.length === 1 ? candidatos[0] : null);
      top.append(h('ol', { class: 'ranking' }, lista.map((p, i) => {
        const pos = p.posicion ?? i + 1;
        const esYo = miFila !== null && p === miFila;
        return h('li', { class: esYo ? 'yo' : undefined, 'aria-current': esYo ? 'true' : undefined },
          h('span', { class: 'pos', 'aria-label': `Posición ${pos}` }, String(pos)),
          h('span', { class: 'nombre' }, p.nombre, esYo ? h('span', { class: 'texto-chico texto-2' }, ' (vos)') : null,
            h('br'), h('span', { class: 'texto-chico texto-2' }, p.rango || rangoInfo(Number(p.puntos_comunidad || 0)).actual.nombre)),
          h('span', { class: 'pts' }, numero(p.puntos_comunidad), h('span', { class: 'texto-chico texto-2' }, ' pts')));
      })));
    }
    zona.append(h('div', { class: 'dos-columnas' }, miTarjeta, top));
  }, 'Cargando el ranking…');

  bActualizar.addEventListener('click', (e) => conCarga(e.currentTarget, cargar));
  cargar();
}
