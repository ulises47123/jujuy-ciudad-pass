document.addEventListener('DOMContentLoaded', () => {
    // Variables de estado
    let currentProfile = 'turista';
    let userPoints = 1250;
    let completedMissions = 2;
    let groupBonusActive = false;

    // Datos de preguntas para simular misiones
    const misionesData = {
        cabildo: {
            titulo: 'Cabildo de Jujuy',
            preguntas: [
                {
                    q: '¿En qué año se fundó el Cabildo de Jujuy?',
                    options: ['1593', '1810', '1834'],
                    correct: '1593'
                },
                {
                    q: '¿Qué reliquia histórica entregó el General Belgrano al Cabildo?',
                    options: ['La Bandera Nacional de la Libertad Civil', 'Su espada de combate', 'El escudo provincial'],
                    correct: 'La Bandera Nacional de la Libertad Civil'
                }
            ]
        },
        botanico: {
            titulo: 'Parque Botánico Municipal',
            preguntas: [
                {
                    q: '¿Qué ecosistema protege principalmente este parque?',
                    options: ['Selva de Yungas', 'Puna y Prepuna', 'Estepa Patagónica'],
                    correct: 'Selva de Yungas'
                },
                {
                    q: '¿Cuál es el ave emblemática que se puede avistar en la reserva?',
                    options: ['Tucán Grande', 'Cóndor Andino', 'Hornero'],
                    correct: 'Tucán Grande'
                }
            ]
        }
    };

    // Referencias del DOM
    const modalSeleccion = document.getElementById('modal-seleccion-perfil');
    const formTuristaSection = document.getElementById('form-turista-section');
    const viewHome = document.getElementById('view-home');
    const viewMisiones = document.getElementById('view-misiones');
    const viewComunidad = document.getElementById('view-comunidad');
    const viewAdmin = document.getElementById('view-admin');

    const navHome = document.getElementById('nav-home');
    const navMisiones = document.getElementById('nav-misiones');
    const navComunidad = document.getElementById('nav-comunidad');
    const navAdmin = document.getElementById('nav-admin');

    // Botones de selección de perfil
    document.getElementById('sel-turista').addEventListener('click', () => setPerfil('turista'));
    document.getElementById('sel-residente').addEventListener('click', () => setPerfil('residente'));
    document.getElementById('sel-admin').addEventListener('click', () => setPerfil('admin'));
    document.getElementById('btn-cambiar-perfil').addEventListener('click', () => {
        modalSeleccion.classList.remove('hidden');
        formTuristaSection.classList.add('hidden');
        hideAllViews();
    });

    // Configuración del perfil
    function setPerfil(perfil) {
        currentProfile = perfil;
        modalSeleccion.classList.add('hidden');
        
        if (perfil === 'turista') {
            formTuristaSection.classList.remove('hidden');
            hideAllViews();
        } else if (perfil === 'residente') {
            formTuristaSection.classList.add('hidden');
            document.getElementById('passport-username').innerText = 'Vecino Colaborador';
            document.getElementById('passport-location').innerText = 'San Salvador de Jujuy';
            groupBonusActive = false;
            document.getElementById('bonus-banner').classList.add('hidden');
            showView('home');
        } else if (perfil === 'admin') {
            formTuristaSection.classList.add('hidden');
            showView('admin');
        }
    }

    // Envío del formulario de turista
    document.getElementById('form-perfil-turista').addEventListener('submit', (e) => {
        e.preventDefault();
        const origen = document.getElementById('turista-origen').value;
        const modalidad = document.getElementById('turista-modalidad').value;
        
        document.getElementById('passport-username').innerText = 'Turista Explorador';
        document.getElementById('passport-location').innerText = origen;
        
        if (modalidad === 'familia' || modalidad === 'amigos') {
            groupBonusActive = true;
            document.getElementById('bonus-banner').classList.remove('hidden');
            alert('Modo Grupal activado: Recibirás 15 puntos extra por misión.');
        } else {
            groupBonusActive = false;
            document.getElementById('bonus-banner').classList.add('hidden');
        }

        formTuristaSection.classList.add('hidden');
        showView('home');
    });

    // Navegación de pestañas
    const navItems = [navHome, navMisiones, navComunidad, navAdmin];
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const path = item.getAttribute('data-path');
            showView(path);
        });
    });

    function hideAllViews() {
        viewHome.classList.add('hidden');
        viewMisiones.classList.add('hidden');
        viewComunidad.classList.add('hidden');
        viewAdmin.classList.add('hidden');
        
        navItems.forEach(nav => {
            nav.classList.remove('text-secondary', 'font-bold');
            nav.classList.add('text-on-surface-variant');
        });
    }

    function showView(path) {
        hideAllViews();
        const activeNav = document.getElementById(`nav-${path}`);
        if (activeNav) {
            activeNav.classList.remove('text-on-surface-variant');
            activeNav.classList.add('text-secondary', 'font-bold');
        }

        if (path === 'home') viewHome.classList.remove('hidden');
        if (path === 'misiones') viewMisiones.classList.remove('hidden');
        if (path === 'comunidad') viewComunidad.classList.remove('hidden');
        if (path === 'admin') viewAdmin.classList.remove('hidden');
    }

    // Toggle Vista Lista/Mapa en Misiones
    const btnToggleList = document.getElementById('btn-toggle-list');
    const btnToggleMap = document.getElementById('btn-toggle-map');
    const listContainer = document.getElementById('misiones-list-container');
    const mapContainer = document.getElementById('misiones-map-container');

    btnToggleList.addEventListener('click', () => {
        btnToggleList.classList.add('text-on-surface', 'font-bold');
        btnToggleList.classList.remove('text-on-surface-variant');
        btnToggleMap.classList.remove('text-on-surface', 'font-bold');
        btnToggleMap.classList.add('text-on-surface-variant');
        listContainer.classList.remove('hidden');
        mapContainer.classList.add('hidden');
    });

    btnToggleMap.addEventListener('click', () => {
        btnToggleMap.classList.add('text-on-surface', 'font-bold');
        btnToggleMap.classList.remove('text-on-surface-variant');
        btnToggleList.classList.remove('text-on-surface', 'font-bold');
        btnToggleList.classList.add('text-on-surface-variant');
        listContainer.classList.add('hidden');
        mapContainer.classList.remove('hidden');
    });

    // Iniciar misión y abrir cuestionario
    const modalMision = document.getElementById('modal-mision-preguntas');
    const containerPreguntas = document.getElementById('preguntas-contenedor');
    const tituloPreguntas = document.getElementById('mision-pregunta-titulo');
    
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-mision-activar')) {
            const id = e.target.getAttribute('data-id');
            const pts = e.target.getAttribute('data-puntos');
            cargarPreguntas(id, pts);
        }
    });

    function cargarPreguntas(id, pts) {
        const datos = misionesData[id];
        if (!datos) return;

        tituloPreguntas.innerText = `Validar: ${datos.titulo}`;
        document.getElementById('modal-mision-id').value = id;
        document.getElementById('modal-mision-puntos-val').value = pts;
        
        containerPreguntas.innerHTML = '';
        datos.preguntas.forEach((pregunta, index) => {
            const div = document.createElement('div');
            div.className = 'flex flex-col gap-xs';
            
            const label = document.createElement('span');
            label.className = 'text-sm font-bold text-on-surface';
            label.innerText = `${index + 1}. ${pregunta.q}`;
            div.appendChild(label);

            pregunta.options.forEach(opt => {
                const optLabel = document.createElement('label');
                optLabel.className = 'flex items-center gap-sm text-sm cursor-pointer p-2 rounded-lg hover:bg-surface-container';
                
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = `pregunta-${index}`;
                radio.value = opt;
                radio.required = true;
                radio.className = 'accent-secondary';
                
                optLabel.appendChild(radio);
                optLabel.appendChild(document.createTextNode(opt));
                div.appendChild(optLabel);
            });

            containerPreguntas.appendChild(div);
        });

        modalMision.classList.remove('hidden');
    }

    // Submit del cuestionario de misión
    document.getElementById('form-verificar-preguntas').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('modal-mision-id').value;
        const basePts = parseInt(document.getElementById('modal-mision-puntos-val').value);
        const datos = misionesData[id];
        
        let correctas = true;
        datos.preguntas.forEach((pregunta, index) => {
            const selected = document.querySelector(`input[name="pregunta-${index}"]:checked`).value;
            if (selected !== pregunta.correct) {
                correctas = false;
            }
        });

        if (correctas) {
            let ptsGanados = basePts;
            if (groupBonusActive) {
                ptsGanados += 15;
            }

            userPoints += ptsGanados;
            completedMissions += 1;
            
            actualizarUI();
            modalMision.classList.add('hidden');
            
            // Cambiar estado del botón de la misión
            const btn = document.querySelector(`button[data-id="${id}"]`);
            if (btn) {
                btn.disabled = true;
                btn.innerText = 'Completada';
                btn.className = 'mt-2 px-4 py-2 bg-outline-variant text-outline rounded-xl text-label-sm font-bold self-start cursor-default';
            }

            alert(`Felicidades, respondiste correctamente y sumaste ${ptsGanados} puntos.`);
        } else {
            alert('Respuestas incorrectas. Por favor lee la cartelería informativa y vuelve a intentarlo.');
        }
    });

    // Acciones de comunidad
    const btnsComunidadAccion = document.querySelectorAll('.btn-residente-accion');
    btnsComunidadAccion.forEach(btn => {
        btn.addEventListener('click', () => {
            const pts = parseInt(btn.getAttribute('data-puntos'));
            const msg = btn.getAttribute('data-msg');
            userPoints += pts;
            actualizarUI();
            alert(`Acción registrada: "${msg}". Sumaste ${pts} puntos.`);
        });
    });

    // Simular Escaneo General (FAB del Home)
    document.getElementById('btn-scan-qr').addEventListener('click', () => {
        alert('Simulador de escaneo: escanea un código QR en el Cabildo o Parque Botánico abriendo la pestaña de Misiones.');
        showView('misiones');
    });

    // Formulario de administración (agregar misiones)
    document.getElementById('form-nueva-mision').addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('admin-mision-nombre').value;
        const categoria = document.getElementById('admin-mision-cat').value;
        const puntos = parseInt(document.getElementById('admin-mision-puntos').value);
        const id = nombre.toLowerCase().replace(/\s+/g, '-');

        // Agregar datos de preguntas para la simulación
        misionesData[id] = {
            titulo: nombre,
            preguntas: [
                {
                    q: 'Pregunta de validación rápida para esta nueva ubicación:',
                    options: ['Opción correcta (Verdadero)', 'Opción incorrecta (Falso)'],
                    correct: 'Opción correcta (Verdadero)'
                }
            ]
        };

        // Renderizar nueva tarjeta de misión
        const list = document.getElementById('misiones-list-container');
        const colorBar = categoria === 'Historico' ? 'bg-secondary' : (categoria === 'Naturaleza' ? 'bg-tertiary-fixed-dim' : 'bg-error');
        const badgeColor = categoria === 'Historico' ? 'text-secondary bg-secondary/10' : 'text-tertiary-container bg-tertiary-fixed/30';
        
        const card = document.createElement('div');
        card.className = 'flex bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden relative border border-outline-variant';
        card.innerHTML = `
            <div class="absolute left-0 top-0 bottom-0 w-1 ${colorBar}"></div>
            <div class="flex flex-col flex-1 p-md gap-xs">
                <div class="flex justify-between items-start">
                    <span class="text-label-sm font-label-sm ${badgeColor} px-2 py-0.5 rounded-full">${categoria}</span>
                    <span class="font-label-lg font-bold text-primary flex items-center gap-xs">+${puntos} pts</span>
                </div>
                <h3 class="text-body-lg font-bold text-on-surface leading-tight mt-xs">${nombre}</h3>
                <p class="text-label-sm text-on-surface-variant">Nueva misión agregada desde el panel administrativo.</p>
                <button class="btn-mision-activar mt-2 px-4 py-2 bg-secondary text-on-secondary rounded-xl text-label-sm font-bold self-start" data-id="${id}" data-puntos="${puntos}">
                    Iniciar Misión
                </button>
            </div>
        `;

        list.appendChild(card);
        alert('Nueva misión agregada exitosamente y publicada en el pasaporte.');
        document.getElementById('form-nueva-mision').reset();
    });

    // Actualizar la interfaz
    function actualizarUI() {
        document.getElementById('animated-points').innerText = userPoints;
        document.getElementById('misiones-contador').innerText = completedMissions;
        
        // Progreso para nivel 5 (meta 1500)
        let restantes = 1500 - userPoints;
        if (restantes < 0) restantes = 0;
        document.getElementById('pts-faltantes').innerText = `${restantes} pts para el siguiente nivel`;
        
        let porcentaje = (userPoints / 1500) * 100;
        if (porcentaje > 100) porcentaje = 100;
        document.getElementById('barra-progreso').style.width = `${porcentaje}%`;
    }

    actualizarUI();
});
