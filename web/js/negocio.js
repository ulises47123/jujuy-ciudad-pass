// Panel del negocio: resumen, validación de cupones (con QR opcional), cupones, beneficios y perfil.
import { get, post, patch } from './api.js';
import {
  h, boton, vaciar, toast, toastError, campo, conCarga, cargarEn, estadoVacio, estadoCarga,
  modalFormulario, abrirModal, confirmar, tabla, segmentado, tituloSeccion, fecha, fechaHora, relativo,
  numero, badgeEstado, icono, validar, errorFormulario, leerForm, debounce, marcarError,
} from './ui.js';
import { normalizarCodigo, extraerCodigo, etiquetaStock, camposBeneficio, badgeActivo, PATRON_TELEFONO, MENSAJE_TELEFONO } from './comun.js';

export const secciones = [
  { id: 'inicio', titulo: 'Inicio', icono: 'inicio', render: renderInicio },
  { id: 'validar', titulo: 'Validar cupón', icono: 'ticket', render: renderValidar },
  { id: 'cupones', titulo: 'Cupones', icono: 'lista', render: renderCupones },
  { id: 'beneficios', titulo: 'Mis beneficios', icono: 'regalo', render: renderBeneficios },
  { id: 'perfil', titulo: 'Perfil del negocio', icono: 'tienda', render: renderPerfil },
];

/* ================================================================ Inicio */

function renderInicio(main, ctx) {
  const u = ctx.usuario();
  const nombre = u.negocio?.nombre || u.nombre;
  main.append(tituloSeccion(`Hola, ${nombre}`, 'Así viene tu negocio en Jujuy Ciudad Pass.'));

  const cta = h('div', { class: 'tarjeta mb-2' },
    h('div', { class: 'fila entre' },
      h('div', { class: 'crecer' },
        h('h2', { class: 'sin-margen' }, '¿Llegó un turista con un cupón?'),
        h('p', { class: 'texto-2 sin-margen' }, 'Validalo en dos pasos: escribí o escaneá el código y confirmá el uso.')),
      h('a', { class: 'btn btn-primario btn-grande', href: '#/validar' }, icono('ticket'), h('span', {}, 'Validar cupón'))));
  const zona = h('div', {});
  main.append(cta, zona);

  cargarEn(zona, () => get('/negocio/resumen'), (r) => {
    zona.append(
      h('div', { class: 'grilla-stats' },
        stat(r.cupones_pendientes, 'Cupones por usar', 'stat-turquesa', '#/cupones?estado=DISPONIBLE'),
        stat(r.cupones_usados_mes, 'Usados este mes', 'stat-terracota', '#/cupones?estado=USADO'),
        stat(r.cupones_usados_total, 'Usados en total', 'stat-sol', '#/cupones?estado=USADO'),
        stat(r.beneficios_activos, 'Beneficios activos', 'stat-lapacho', '#/beneficios')),
      h('p', { class: 'texto-chico texto-2 mt-2' }, '“Cupones por usar” son los que los turistas ya canjearon y todavía pueden presentar en tu local.'));
  }, 'Cargando el resumen…');
}

function stat(valor, etiqueta, clase, href) {
  return h(href ? 'a' : 'div', { class: 'stat ' + clase, href },
    h('span', { class: 'stat-valor' }, numero(valor ?? 0)), h('span', { class: 'stat-etiqueta' }, etiqueta));
}

/* ================================================================ Validar cupón */

let soporteEscaneo = null;
async function puedeEscanear() {
  if (soporteEscaneo !== null) return soporteEscaneo;
  soporteEscaneo = false;
  try {
    if ('BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia && window.isSecureContext) {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      soporteEscaneo = Array.isArray(formatos) && formatos.includes('qr_code');
    }
  } catch { soporteEscaneo = false; }
  return soporteEscaneo;
}

function renderValidar(main, ctx) {
  main.append(tituloSeccion('Validar cupón', 'Pedile al turista que te muestre el cupón en la app Jujuy Ciudad Pass.'));

  const cCodigo = campo({
    etiqueta: 'Código del cupón', nombre: 'codigo', requerido: true,
    ayuda: 'Tiene el formato JCP-XXXX-XXXX. Podés escribirlo con o sin guiones.',
    atributos: {
      class: 'codigo-input', placeholder: 'JCP-XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters',
      spellcheck: 'false', maxlength: 24, enterkeyhint: 'search',
    },
  });
  const bBuscar = boton('Buscar cupón', { clase: 'btn-primario btn-grande', tipo: 'submit', icono: 'buscar' });
  const bEscanear = boton('Escanear QR', { clase: 'btn-turquesa btn-grande', icono: 'qr', hidden: true });
  const form = h('form', { novalidate: true, 'aria-label': 'Buscar cupón por código' },
    cCodigo, h('div', { class: 'acciones' }, bBuscar, bEscanear));
  const resultado = h('div', { class: 'mt-2', 'aria-live': 'polite' });
  main.append(h('div', { class: 'validador' }, h('div', { class: 'tarjeta' }, form), resultado));

  let camaraAbierta = null;
  puedeEscanear().then((ok) => { if (ok && bEscanear.isConnected) bEscanear.hidden = false; });
  bEscanear.addEventListener('click', async () => {
    camaraAbierta = abrirEscaner((codigo) => {
      cCodigo.control.value = codigo;
      buscar();
    });
  });

  function reiniciar() {
    vaciar(resultado);
    cCodigo.control.value = '';
    cCodigo.control.focus();
  }

  async function buscar() {
    errorFormulario(form, null);
    cCodigo.control.setCustomValidity('');
    if (!validar(form)) return;
    const codigo = normalizarCodigo(cCodigo.control.value);
    if (!codigo) {
      marcarError(cCodigo.control, 'Ese código no tiene el formato de un cupón (JCP-XXXX-XXXX, con letras y números).');
      cCodigo.control.focus();
      return;
    }
    cCodigo.control.value = codigo;
    await conCarga(bBuscar, async () => {
      estadoCarga(resultado, 'Buscando el cupón…');
      try {
        const c = await get('/negocio/cupones/' + encodeURIComponent(codigo));
        mostrarVistaPrevia({ ...c, codigo: c.codigo || codigo });
      } catch (err) {
        if (err.sesionPerdida) return;
        mostrarProblema(err);
      }
    });
  }

  function mostrarProblema(err, codigo) {
    vaciar(resultado);
    const titulo = {
      CUPON_NO_ENCONTRADO: 'No encontramos ese cupón',
      DEMASIADOS_INTENTOS: 'Demasiadas búsquedas fallidas',
      SIN_CONEXION: 'Sin conexión',
    }[err.codigo] || 'No se pudo validar';
    const extra = err.codigo === 'CUPON_NO_ENCONTRADO'
      ? 'Revisá que esté bien escrito. Solo podés validar cupones de los beneficios de tu negocio.'
      : null;
    resultado.append(h('div', { class: 'aviso aviso-error', role: 'alert' }, icono('alerta'),
      h('div', {}, h('strong', {}, titulo), h('p', { class: 'sin-margen' }, err.message), extra ? h('p', { class: 'sin-margen texto-chico' }, extra) : null,
        codigo ? null : h('div', { class: 'acciones mt-1' }, boton('Probar otro código', { clase: 'btn-chico', on: reiniciar })))));
  }

  function mostrarVistaPrevia(c, avisoPrevio) {
    vaciar(resultado);
    const vencido = c.vence_en && new Date(c.vence_en).getTime() < Date.now();
    const dl = h('dl', {},
      h('dt', {}, 'Beneficio'), h('dd', {}, c.beneficio_titulo || c.beneficio?.titulo || '—'),
      h('dt', {}, 'Turista'), h('dd', {}, c.turista_nombre || '—'),
      h('dt', {}, 'Estado'), h('dd', {}, badgeEstado(c.estado)),
      h('dt', {}, c.estado === 'VENCIDO' || vencido ? 'Venció' : 'Vence'),
      h('dd', {}, c.vence_en ? `${fechaHora(c.vence_en)} (${relativo(c.vence_en)})` : '—'));
    if (c.usado_en) dl.append(h('dt', {}, 'Usado'), h('dd', {}, fechaHora(c.usado_en)));

    const tarjeta = h('section', { class: 'cupon', 'aria-label': 'Vista previa del cupón' },
      h('div', { class: 'fila entre' }, h('span', { class: 'cupon-codigo' }, c.codigo), badgeEstado(c.estado)), dl);
    if (avisoPrevio) resultado.append(avisoPrevio);
    resultado.append(tarjeta);

    if (c.estado === 'DISPONIBLE') {
      const bConfirmar = boton('Confirmar uso', { clase: 'btn-turquesa btn-grande btn-bloque', icono: 'check' });
      const bCancelar = boton('Cancelar', { clase: 'btn-fantasma btn-bloque', on: reiniciar });
      if (vencido) {
        tarjeta.append(h('div', { class: 'aviso mt-2' }, icono('alerta'), h('div', {}, 'Según la fecha, este cupón ya venció. Si confirmás, el sistema lo va a rechazar.')));
      } else {
        tarjeta.append(h('p', { class: 'texto-chico texto-2 mt-2 sin-margen' }, 'Entregá el beneficio y tocá “Confirmar uso”. El cupón queda usado y no se puede volver a usar.'));
      }
      tarjeta.append(h('div', { class: 'mt-2' }, bConfirmar), h('div', { class: 'mt-1' }, bCancelar));
      bConfirmar.addEventListener('click', () => conCarga(bConfirmar, async () => {
        try {
          const r = await post('/negocio/cupones/' + encodeURIComponent(c.codigo) + '/usar');
          mostrarExito({ ...c, ...r });
          toast('Cupón validado.', 'ok');
        } catch (err) {
          if (err.sesionPerdida) return;
          const aviso = h('div', { class: 'aviso aviso-error', role: 'alert' }, icono('alerta'), h('div', {}, err.message));
          if (['CUPON_USADO', 'CUPON_VENCIDO', 'CUPON_ANULADO'].includes(err.codigo)) {
            // El estado cambió: refrescamos la vista previa.
            try {
              const nuevo = await get('/negocio/cupones/' + encodeURIComponent(c.codigo));
              mostrarVistaPrevia({ ...nuevo, codigo: nuevo.codigo || c.codigo }, aviso);
            } catch { mostrarVistaPrevia(c, aviso); }
          } else {
            toastError(err);
            resultado.prepend(aviso);
          }
        }
      }));
      bConfirmar.focus();
    } else {
      const msj = {
        USADO: `Este cupón ya fue usado${c.usado_en ? ' el ' + fechaHora(c.usado_en) : ''}. No lo aceptes de nuevo.`,
        VENCIDO: 'Este cupón está vencido y ya no se puede usar.',
        ANULADO: 'Este cupón fue anulado por la administración y no se puede usar.',
      }[c.estado] || 'Este cupón no se puede usar.';
      tarjeta.append(h('div', { class: 'aviso aviso-error mt-2', role: 'alert' }, icono('x'), h('div', {}, msj)),
        h('div', { class: 'mt-1' }, boton('Validar otro cupón', { clase: 'btn-bloque', on: reiniciar })));
    }
  }

  function mostrarExito(r) {
    vaciar(resultado);
    const bOtro = boton('Validar otro cupón', { clase: 'btn-primario btn-grande btn-bloque mt-2', icono: 'ticket', on: reiniciar });
    resultado.append(h('section', { class: 'cupon cupon-ok', role: 'status' },
      icono('checkCirculo'),
      h('h2', { class: 'mt-1' }, '¡Cupón validado!'),
      h('p', { class: 'cupon-codigo sin-margen' }, r.codigo),
      h('p', { class: 'mt-1 sin-margen' }, h('strong', {}, r.beneficio_titulo || ''), ' para ', h('strong', {}, r.turista_nombre || 'el turista')),
      h('p', { class: 'texto-2 texto-chico sin-margen' }, 'Usado el ' + fechaHora(r.usado_en || new Date().toISOString())),
      bOtro));
    bOtro.focus();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); buscar(); });

  const pre = ctx.params.get('codigo');
  if (pre) { cCodigo.control.value = pre; buscar(); } else cCodigo.control.focus();

  return () => { camaraAbierta?.cerrar(); };
}

/** Abre la cámara y busca un QR de cupón con BarcodeDetector. */
function abrirEscaner(alDetectar) {
  const video = h('video', { class: 'video-qr', playsinline: true, muted: true, autoplay: true, 'aria-label': 'Imagen de la cámara' });
  video.muted = true;
  const estado = h('p', { class: 'texto-2 mt-1', 'aria-live': 'polite' }, 'Pidiendo permiso para usar la cámara…');
  let stream = null;
  let timer = null;
  let terminado = false;

  const m = abrirModal({
    titulo: 'Escanear QR del cupón',
    contenido: [video, estado, h('p', { class: 'texto-chico texto-2 sin-margen' }, 'Apuntá la cámara al código QR que muestra el turista en su celular.')],
    pie: [boton('Cancelar', { on: () => m.cerrar() })],
    alCerrar: () => {
      terminado = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    },
  });

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (terminado) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      estado.textContent = 'Buscando un código QR…';
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      let ultimoAviso = 0;
      const ciclo = async () => {
        if (terminado) return;
        try {
          if (video.readyState >= 2) {
            const encontrados = await detector.detect(video);
            for (const f of encontrados) {
              const codigo = extraerCodigo(f.rawValue);
              if (codigo) {
                terminado = true;
                m.cerrar();
                toast('Código leído: ' + codigo, 'info', 2500);
                alDetectar(codigo);
                return;
              }
              if (Date.now() - ultimoAviso > 2000) {
                ultimoAviso = Date.now();
                estado.textContent = 'Ese QR no es un cupón de Jujuy Ciudad Pass. Probá con el QR del cupón.';
              }
            }
          }
        } catch { /* frame no disponible: reintentar */ }
        timer = setTimeout(ciclo, 250);
      };
      ciclo();
    } catch (err) {
      if (terminado) return;
      const msj = {
        NotAllowedError: 'No diste permiso para usar la cámara. Podés habilitarlo en la configuración del navegador o escribir el código a mano.',
        SecurityError: 'El navegador no permite usar la cámara en esta página. Escribí el código a mano.',
        NotFoundError: 'No encontramos ninguna cámara en este dispositivo. Escribí el código a mano.',
        NotReadableError: 'La cámara está siendo usada por otra aplicación. Cerrala y probá de nuevo.',
        OverconstrainedError: 'No pudimos usar la cámara trasera. Escribí el código a mano.',
      }[err?.name] || 'No se pudo abrir la cámara. Escribí el código a mano.';
      estado.textContent = msj;
      estado.classList.add('error-campo');
      video.hidden = true;
    }
  })();
  return m;
}

/* ================================================================ Cupones */

const FILTRO_CUPONES = [
  { valor: '', texto: 'Todos' },
  { valor: 'DISPONIBLE', texto: 'Por usar' },
  { valor: 'USADO', texto: 'Usados' },
  { valor: 'VENCIDO', texto: 'Vencidos' },
  { valor: 'ANULADO', texto: 'Anulados' },
];

function renderCupones(main, ctx) {
  let estado = ctx.params.get('estado') || '';
  if (!FILTRO_CUPONES.some((f) => f.valor === estado)) estado = '';
  let texto = '';
  let cupones = [];
  const zona = h('div', {});
  const bRecargar = boton('Actualizar', { icono: 'recargar', on: (e) => conCarga(e.currentTarget, cargar) });
  const cBuscar = campo({ etiqueta: 'Buscar por código o turista', nombre: 'q', tipo: 'search', clase: 'campo-busqueda', atributos: { autocomplete: 'off', placeholder: 'Ej.: JCP-7K3M o Ana' } });
  cBuscar.control.addEventListener('input', debounce(() => { texto = cBuscar.control.value.trim().toLowerCase(); pintar(); }, 200));

  main.append(
    tituloSeccion('Cupones', 'Cupones canjeados por turistas para los beneficios de tu negocio.', bRecargar),
    h('div', { class: 'filtros' },
      h('div', {}, h('span', { class: 'etiqueta' }, 'Estado'), h('div', { class: 'mt-1' },
        segmentado({ opciones: FILTRO_CUPONES, valor: estado, etiqueta: 'Filtrar por estado', alCambiar: (v) => { estado = v; cargar(); } }))),
      cBuscar),
    zona);

  function pintar() {
    vaciar(zona);
    const lista = texto
      ? cupones.filter((c) => (c.codigo || '').toLowerCase().includes(texto) || (c.turista_nombre || '').toLowerCase().includes(texto))
      : cupones;
    if (!lista.length) {
      estadoVacio(zona, texto ? 'Ningún cupón coincide con la búsqueda.' : estado ? 'No hay cupones con ese estado.' : 'Todavía no hay cupones canjeados para tus beneficios.', { ic: 'ticket' });
      return;
    }
    zona.append(tabla({
      etiqueta: 'Cupones',
      columnas: [
        { titulo: 'Código', valor: (c) => h('span', { class: 'mono' }, c.codigo) },
        { titulo: 'Beneficio', valor: (c) => c.beneficio?.titulo || c.beneficio_titulo },
        { titulo: 'Turista', valor: (c) => c.turista_nombre },
        { titulo: 'Estado', valor: (c) => badgeEstado(c.estado) },
        { titulo: 'Canjeado', valor: (c) => fecha(c.creado_en) },
        { titulo: 'Vence', valor: (c) => fecha(c.vence_en) },
        { titulo: 'Usado', valor: (c) => (c.usado_en ? fechaHora(c.usado_en) : null) },
      ],
      filas: lista,
      acciones: (c) => (c.estado === 'DISPONIBLE'
        ? [boton('Validar', { clase: 'btn-chico btn-turquesa', icono: 'ticket', on: () => ctx.ir('validar', { codigo: c.codigo }) })]
        : []),
    }), h('p', { class: 'texto-chico texto-2' }, `${lista.length} cupón${lista.length === 1 ? '' : 'es'}.`));
  }

  function cargar() {
    return cargarEn(zona, () => get('/negocio/cupones', { estado }), (r) => {
      cupones = Array.isArray(r) ? r : (r?.items || []);
      pintar();
    }, 'Cargando cupones…');
  }
  cargar();
}

/* ================================================================ Beneficios */

function renderBeneficios(main) {
  const zona = h('div', {});
  main.append(
    tituloSeccion('Mis beneficios', 'Lo que ofrecés a los turistas a cambio de sus puntos. Cada beneficio nuevo o modificado pasa por revisión.',
      boton('Nuevo beneficio', { clase: 'btn-primario', icono: 'mas', on: () => editarBeneficio() })),
    zona);

  function cargar() {
    cargarEn(zona, () => get('/negocio/beneficios'), (r) => {
      const lista = (Array.isArray(r) ? r : (r?.items || [])).filter((b) => !b.eliminado);
      if (!lista.length) {
        estadoVacio(zona, 'Todavía no cargaste beneficios. Creá el primero para aparecer en la app de los turistas.', {
          ic: 'regalo', accion: boton('Crear beneficio', { clase: 'btn-primario', icono: 'mas', on: () => editarBeneficio() }),
        });
        return;
      }
      zona.append(h('div', { class: 'grilla' }, lista.map(tarjetaBeneficio)));
    }, 'Cargando beneficios…');
  }

  function tarjetaBeneficio(b) {
    const bPausa = boton(b.activo ? 'Pausar' : 'Activar', {
      clase: 'btn-chico', icono: b.activo ? 'pausa' : 'play',
      on: async (e) => {
        const btn = e.currentTarget;
        if (b.activo) {
          const ok = await confirmar({ titulo: 'Pausar beneficio', mensaje: `¿Pausar “${b.titulo}”?`, detalle: 'Los turistas dejan de verlo en la app hasta que lo vuelvas a activar.', textoConfirmar: 'Pausar' });
          if (!ok) return;
        }
        await conCarga(btn, async () => {
          try {
            await patch(`/negocio/beneficios/${b.id}`, { activo: !b.activo });
            toast(b.activo ? 'Beneficio pausado.' : 'Beneficio activado.', 'ok');
            cargar();
          } catch (err) { if (!err.sesionPerdida) toastError(err); }
        });
      },
    });
    return h('article', { class: 'item' },
      h('div', { class: 'fila entre' }, h('h3', { class: 'crecer' }, b.titulo), h('div', { class: 'acciones' }, badgeEstado(b.estado), badgeActivo(b.activo))),
      h('p', { class: 'descripcion' }, b.descripcion),
      h('div', { class: 'meta' },
        h('span', {}, h('strong', {}, numero(b.puntos)), ' puntos'),
        h('span', {}, `Validez: ${b.dias_validez} día${b.dias_validez === 1 ? '' : 's'}`),
        h('span', {}, 'Stock: ' + etiquetaStock(b))),
      b.estado === 'RECHAZADO'
        ? h('div', { class: 'aviso aviso-error sin-margen' }, icono('x'), h('div', {}, h('strong', {}, 'Motivo del rechazo: '), b.motivo_rechazo || 'Sin motivo indicado.', h('br'), h('span', { class: 'texto-chico' }, 'Editalo para mandarlo de nuevo a revisión.')))
        : b.estado === 'PENDIENTE'
          ? h('p', { class: 'texto-chico texto-2 sin-margen' }, 'En revisión: la administración tiene que aprobarlo para que aparezca en la app.')
          : null,
      h('div', { class: 'acciones' },
        boton('Editar', { clase: 'btn-chico', icono: 'editar', on: () => editarBeneficio(b) }),
        bPausa));
  }

  function editarBeneficio(b) {
    const nuevo = !b;
    modalFormulario({
      titulo: nuevo ? 'Nuevo beneficio' : 'Editar beneficio',
      campos: [
        nuevo ? h('div', { class: 'aviso aviso-info' }, icono('info'), h('div', {}, 'Al crearlo queda “Pendiente” hasta que la administración lo apruebe.')) : null,
        ...camposBeneficio(b || {}),
      ],
      textoEnviar: nuevo ? 'Crear beneficio' : 'Guardar cambios',
      enviar: async (d) => {
        const datos = { titulo: d.titulo, descripcion: d.descripcion, puntos: d.puntos, dias_validez: d.dias_validez, stock: d.stock };
        if (nuevo) {
          if (datos.stock === null) delete datos.stock;
          await post('/negocio/beneficios', datos);
          toast('Beneficio creado. Queda pendiente de aprobación.', 'ok');
        } else {
          const cambios = {};
          for (const [k, v] of Object.entries(datos)) {
            const antes = k === 'stock' ? (b.stock !== undefined ? b.stock : b.stock_restante) ?? null : b[k];
            if (v !== antes) cambios[k] = v;
          }
          if (!Object.keys(cambios).length) { toast('No hiciste cambios.', 'info'); return true; }
          const vuelveARevision = ['titulo', 'descripcion', 'puntos'].some((k) => k in cambios) && b.estado !== 'PENDIENTE';
          if (vuelveARevision) {
            const ok = await confirmar({
              titulo: 'El beneficio vuelve a revisión',
              mensaje: 'Cambiaste el título, la descripción o los puntos. El beneficio va a quedar “Pendiente” y no se va a mostrar en la app hasta que la administración lo apruebe de nuevo.',
              textoConfirmar: 'Guardar igual',
            });
            if (!ok) return false;
          }
          await patch(`/negocio/beneficios/${b.id}`, cambios);
          toast(vuelveARevision ? 'Cambios guardados. El beneficio volvió a revisión.' : 'Cambios guardados.', 'ok');
        }
        cargar();
        return true;
      },
    });
  }

  cargar();
}

/* ================================================================ Perfil */

function renderPerfil(main, ctx) {
  const zona = h('div', {});
  main.append(tituloSeccion('Perfil del negocio', 'Estos datos los ven los turistas junto a tus beneficios.'), zona);

  cargarEn(zona, () => get('/negocio/perfil'), (r) => {
    const p = r?.negocio ?? r?.perfil ?? r ?? {};
    const u = ctx.usuario();
    const bGuardar = boton('Guardar cambios', { clase: 'btn-primario', tipo: 'submit', icono: 'check' });
    const form = h('form', { novalidate: true, 'aria-label': 'Datos del negocio' },
      campo({ etiqueta: 'Nombre del negocio', nombre: 'nombre', requerido: true, valor: p.nombre, atributos: { minlength: 2, maxlength: 80, autocomplete: 'organization' } }),
      campo({ etiqueta: 'Dirección', nombre: 'direccion', requerido: true, valor: p.direccion, ayuda: 'Calle y número, en San Salvador de Jujuy.', atributos: { maxlength: 200, autocomplete: 'street-address' } }),
      campo({ etiqueta: 'Teléfono', nombre: 'telefono', tipo: 'tel', opcional: true, valor: p.telefono, atributos: { maxlength: 40, autocomplete: 'tel', inputmode: 'tel', pattern: PATRON_TELEFONO, 'data-mensaje-patron': MENSAJE_TELEFONO } }),
      campo({ etiqueta: 'Descripción', nombre: 'descripcion', tipo: 'textarea', opcional: true, valor: p.descripcion, ayuda: 'Qué ofrecés, horarios, lo que te haga especial.', atributos: { maxlength: 2000, rows: 4 } }),
      h('div', { class: 'acciones acciones-fin' }, bGuardar));
    form.querySelector('[name=telefono]').dataset.mensajePatron = 'Usá solo números, espacios, +, guiones o paréntesis (mínimo 6).';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorFormulario(form, null);
      if (!validar(form)) return;
      const d = leerForm(form);
      await conCarga(bGuardar, async () => {
        try {
          const nuevo = await patch('/negocio/perfil', { nombre: d.nombre, direccion: d.direccion, telefono: d.telefono, descripcion: d.descripcion });
          const neg = nuevo?.negocio ?? nuevo?.perfil ?? nuevo ?? d;
          ctx.actualizarUsuario({ negocio: { ...(u.negocio || {}), ...neg } });
          toast('Perfil actualizado.', 'ok');
        } catch (err) {
          if (!err.sesionPerdida) errorFormulario(form, err);
        }
      });
    });

    zona.append(
      h('div', { class: 'dos-columnas' },
        h('div', { class: 'tarjeta' }, h('h2', {}, 'Datos del negocio'), form),
        h('div', { class: 'tarjeta' },
          h('h2', {}, 'Tu cuenta'),
          h('dl', { class: 'sin-margen' },
            h('dt', { class: 'etiqueta' }, 'Responsable'), h('dd', { class: 'sin-margen mb-1' }, u.nombre),
            h('dt', { class: 'etiqueta' }, 'Email de ingreso'), h('dd', { class: 'sin-margen mb-1 romper' }, u.email)),
          h('p', { class: 'texto-chico texto-2' }, 'Para cambiar tu contraseña usá la opción “Cambiar contraseña” del menú. Si necesitás cambiar el email, pedíselo a la administración.'))));
  }, 'Cargando perfil…');
}

