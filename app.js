document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicialización de Datos Predeterminados en LocalStorage

    const defaultUsers = {
        "Mateo Garcia": {
            name: "Mateo Garcia",
            type: "turista",
            points: 1250,
            location: "Argentina",
            completed: 2,
            group: true,
            estadia: "pleno",
            insignias: ["Guardián del Patrimonio"],
            cupones: []
        },
        "Carlos R.": {
            name: "Carlos R.",
            type: "residente",
            points: 2890,
            barrio: "Barrio Centro",
            completed: 4,
            group: false,
            estadia: "",
            insignias: ["Embajador Local"],
            cupones: []
        },
        "Maria L.": {
            name: "Maria L.",
            type: "residente",
            points: 3450,
            barrio: "Barrio Centro",
            completed: 8,
            group: false,
            estadia: "",
            insignias: ["Embajador Local", "Turista Responsable"],
            cupones: []
        },
        "Admin": {
            name: "Admin",
            type: "admin",
            points: 0,
            location: "",
            completed: 0,
            group: false,
            estadia: "",
            insignias: [],
            cupones: []
        }
    };

    const defaultMisiones = {
        cabildo: {
            id: "cabildo",
            titulo: 'Cabildo de Jujuy',
            categoria: 'Historico',
            puntos: 50,
            insignia: 'Guardián del Patrimonio',
            descripcion: 'Visita el casco céntrico e ingresa tus respuestas patrimoniales.',
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
            id: "botanico",
            titulo: 'Parque Botánico Municipal',
            categoria: 'Naturaleza',
            puntos: 120,
            insignia: 'Explorador Verde',
            descripcion: 'Completa el recorrido de senderos y avistamiento ecológico.',
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
        },
        'corredor-sabores': {
            id: "corredor-sabores",
            titulo: 'Corredor Gastronómico Paseo Pachamama',
            categoria: 'Sabores',
            puntos: 70,
            insignia: 'Embajador Gastronómico',
            descripcion: 'Visita el Paseo y cata una empanada o humita tradicional.',
            preguntas: [
                {
                    q: '¿Cuál es el ingrediente base de la tradicional humita jujeña?',
                    options: ['Maíz choclo rallado', 'Carne de llama desmechada', 'Harina de trigo'],
                    correct: 'Maíz choclo rallado'
                }
            ]
        },
        'pachamama-ofrenda': {
            id: "pachamama-ofrenda",
            titulo: 'Ofrenda en el Mercado 6 de Agosto',
            categoria: 'Estacional',
            puntos: 100,
            insignia: 'Alma Jujeña',
            descripcion: 'Visita el Mercado Municipal y participa de las actividades de ofrenda y sahumado tradicional.',
            preguntas: [
                {
                    q: '¿En honor a quién se realiza la ofrenda del sahumado en Jujuy?',
                    options: ['La Pachamama (Madre Tierra)', 'El Dios del Sol', 'Los Reyes Magos'],
                    correct: 'La Pachamama (Madre Tierra)'
                }
            ]
        },
        'carrozas-primavera': {
            id: "carrozas-primavera",
            titulo: 'Desfile de Carrozas en Ciudad Cultural',
            categoria: 'Estacional',
            puntos: 100,
            insignia: 'Embajador Local',
            descripcion: 'Completa el circuito de exposición de carrozas estudiantiles y responde las preguntas de los talleres ecológicos.',
            preguntas: [
                {
                    q: '¿Quiénes construyen las famosas carrozas de la Fiesta Nacional de los Estudiantes?',
                    options: ['Los estudiantes de secundaria', 'Empresas privadas de turismo', 'Artistas plásticos contratados'],
                    correct: 'Los estudiantes de secundaria'
                }
            ]
        },
        'carnaval-desentierro': {
            id: "carnaval-desentierro",
            titulo: 'Circuito de Comparsa y Desentierro del Diablo',
            categoria: 'Estacional',
            puntos: 100,
            insignia: 'Alma Jujeña',
            descripcion: 'Registra tu visita a un evento tradicional de carnaval oficial en la capital y responde sobre su historia gastronómica.',
            preguntas: [
                {
                    q: '¿Qué personaje mítico se desentierra para dar inicio a los festejos de carnaval?',
                    options: ['El diablo del carnaval (Pujllay)', 'El duende de la Puna', 'El Coquena'],
                    correct: 'El diablo del carnaval (Pujllay)'
                }
            ]
        }
    };

    const defaultTiendas = [
        { id: "cafe-cortesia", premio: "Café de Cortesía gratis", costo: 200, tienda: "Cafeterías", desc: "Válido en confiterías céntricas adheridas." },
        { id: "pase-museos", premio: "Pase 2x1 en Museos", costo: 500, tienda: "Cultura", desc: "Accede a dos museos provinciales al precio de uno." },
        { id: "souvenirs-feria", premio: "20% OFF en Souvenirs", costo: 800, tienda: "Artesanos", desc: "Descuento en ferias artesanales de la capital." }
    ];

    const defaultVisitas = {
        "cabildo": 342,
        "botanico": 185,
        "corredor-sabores": 95,
        "pachamama-ofrenda": 54,
        "carrozas-primavera": 12,
        "carnaval-desentierro": 8
    };

    const defaultLogs = [
        { username: "Mateo Garcia", attraction: "Cabildo de Jujuy", points: 65, timestamp: "19/8/2026, 15:42:10" },
        { username: "Mateo Garcia", attraction: "Parque Botánico Municipal", points: 135, timestamp: "19/8/2026, 16:15:33" },
        { username: "Maria L.", attraction: "Eco-reporte: Limpiar Plaza", points: 100, timestamp: "19/8/2026, 17:05:00" },
        { username: "Carlos R.", attraction: "Eco-reporte: Limpiar Plaza", points: 100, timestamp: "19/8/2026, 17:11:12" }
    ];

    // Cargar bases si no existen en LocalStorage
    const existingUsers = localStorage.getItem('jujuy_pass_users');
    if (!existingUsers || !JSON.parse(existingUsers)["Admin"]) {
        localStorage.setItem('jujuy_pass_users', JSON.stringify(defaultUsers));
    }

    if (!localStorage.getItem('jujuy_pass_misiones')) {
        localStorage.setItem('jujuy_pass_misiones', JSON.stringify(defaultMisiones));
    }

    if (!localStorage.getItem('jujuy_pass_tiendas')) {
        localStorage.setItem('jujuy_pass_tiendas', JSON.stringify(defaultTiendas));
    }

    if (!localStorage.getItem('jujuy_pass_visitas')) {
        localStorage.setItem('jujuy_pass_visitas', JSON.stringify(defaultVisitas));
    }

    if (!localStorage.getItem('jujuy_pass_logs')) {
        localStorage.setItem('jujuy_pass_logs', JSON.stringify(defaultLogs));
    }

    // Helpers DB
    function getUsersDb() { return JSON.parse(localStorage.getItem('jujuy_pass_users')); }
    function saveUsersDb(db) { localStorage.setItem('jujuy_pass_users', JSON.stringify(db)); }
    function getMisionesDb() { return JSON.parse(localStorage.getItem('jujuy_pass_misiones')); }
    function saveMisionesDb(db) { localStorage.setItem('jujuy_pass_misiones', JSON.stringify(db)); }
    function getTiendasDb() { return JSON.parse(localStorage.getItem('jujuy_pass_tiendas')); }
    function saveTiendasDb(db) { localStorage.setItem('jujuy_pass_tiendas', JSON.stringify(db)); }
    function getVisitasDb() { return JSON.parse(localStorage.getItem('jujuy_pass_visitas')); }
    function saveVisitasDb(db) { localStorage.setItem('jujuy_pass_visitas', JSON.stringify(db)); }
    function getLogsDb() { return JSON.parse(localStorage.getItem('jujuy_pass_logs') || '[]'); }
    function saveLogsDb(logs) { localStorage.setItem('jujuy_pass_logs', JSON.stringify(logs)); }

    // Estado activo
    let currentUser = null;
    let recommendationAppliedBy = null;

    // Referencias del DOM
    const modalBienvenida = document.getElementById('modal-bienvenida');
    const modalLogin = document.getElementById('modal-login');
    const modalSeleccion = document.getElementById('modal-seleccion-perfil');
    
    const formTuristaSection = document.getElementById('form-turista-section');
    const formResidenteSection = document.getElementById('form-residente-section');
    
    const viewHome = document.getElementById('view-home');
    const viewMisiones = document.getElementById('view-misiones');
    const viewComunidad = document.getElementById('view-comunidad');
    const viewAdmin = document.getElementById('view-admin');

    const navHome = document.getElementById('nav-home');
    const navMisiones = document.getElementById('nav-misiones');
    const navComunidad = document.getElementById('nav-comunidad');
    const navAdmin = document.getElementById('nav-admin');

    const inputCodeRecommend = document.getElementById('input-code-recommend');
    const btnApplyRecommend = document.getElementById('btn-apply-recommend');
    const recommendStatusMsg = document.getElementById('recommend-status-msg');

    const seasonSelector = document.getElementById('season-selector');
    const adminCicloActual = document.getElementById('admin-ciclo-actual');

    // Gestión de Temporadas / Ciclos Estacionales
    seasonSelector.addEventListener('change', () => {
        const value = seasonSelector.value;
        actualizarVisibilidadMisionesEstacionales(value);
    });

    function actualizarVisibilidadMisionesEstacionales(season) {
        document.querySelectorAll('.mision-card.estacional').forEach(card => {
            card.classList.add('hidden');
        });
        
        if (season === 'pachamama') {
            document.querySelectorAll('.estacional-pachamama').forEach(c => c.classList.remove('hidden'));
            adminCicloActual.innerText = 'Agosto - Pachamama';
        } else if (season === 'estudiantes') {
            document.querySelectorAll('.estacional-estudiantes').forEach(c => c.classList.remove('hidden'));
            adminCicloActual.innerText = 'Septiembre - Estudiantes';
        } else if (season === 'carnaval') {
            document.querySelectorAll('.estacional-carnaval').forEach(c => c.classList.remove('hidden'));
            adminCicloActual.innerText = 'Febrero - Carnaval';
        }
    }

    // Flujo bienvenida / Login
    document.getElementById('btn-usuario-nuevo').addEventListener('click', () => {
        modalBienvenida.classList.add('hidden');
        modalSeleccion.classList.remove('hidden');
    });

    document.getElementById('btn-usuario-existente').addEventListener('click', () => {
        modalBienvenida.classList.add('hidden');
        modalLogin.classList.remove('hidden');
    });

    document.getElementById('btn-login-cancelar').addEventListener('click', () => {
        modalLogin.classList.add('hidden');
        modalBienvenida.classList.remove('hidden');
    });

    document.getElementById('form-login-usuario').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const db = getUsersDb();

        if (db[username]) {
            currentUser = db[username];
            modalLogin.classList.add('hidden');
            alert(`Bienvenido de nuevo, ${currentUser.name}. Se han cargado tus datos.`);
            
            if (currentUser.type === 'turista') {
                showView('home');
            } else if (currentUser.type === 'residente') {
                showView('comunidad');
            } else if (currentUser.type === 'admin') {
                showView('admin');
            }
            actualizarUI();
        } else {
            alert(`Error: El usuario "${username}" no existe. Si eres nuevo, por favor regresa y regístrate.`);
        }
    });

    document.getElementById('btn-cambiar-perfil').addEventListener('click', () => {
        currentUser = null;
        recommendationAppliedBy = null;
        modalBienvenida.classList.remove('hidden');
        formTuristaSection.classList.add('hidden');
        formResidenteSection.classList.add('hidden');
        hideAllViews();
    });

    // Nuevo Usuario
    document.getElementById('sel-turista').addEventListener('click', () => {
        modalSeleccion.classList.add('hidden');
        formTuristaSection.classList.remove('hidden');
    });

    document.getElementById('sel-residente').addEventListener('click', () => {
        modalSeleccion.classList.add('hidden');
        formResidenteSection.classList.remove('hidden');
    });

    document.getElementById('sel-admin').addEventListener('click', () => {
        modalSeleccion.classList.add('hidden');
        currentUser = {
            name: "Administrador Municipal",
            type: "admin",
            points: 0,
            insignias: [],
            cupones: []
        };
        showView('admin');
        actualizarUI();
    });

    // Registro de Turista
    document.getElementById('form-perfil-turista').addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('turista-nombre').value.trim();
        const origen = document.getElementById('turista-origen').value.trim();
        const tiempo = document.getElementById('turista-tiempo').value;
        const modalidad = document.getElementById('turista-modalidad').value;

        currentUser = {
            name: nombre,
            type: 'turista',
            points: 0,
            location: origen,
            completed: 0,
            group: (modalidad === 'familia' || modalidad === 'amigos' || modalidad === 'grupo'),
            estadia: tiempo,
            insignias: [],
            cupones: []
        };

        const db = getUsersDb();
        db[nombre] = currentUser;
        saveUsersDb(db);

        formTuristaSection.classList.add('hidden');
        alert(`Registro exitoso. Bienvenido, ${nombre}. Comienzas con 0 puntos.`);
        showView('home');
        actualizarUI();
    });

    // Registro de Residente
    document.getElementById('form-perfil-residente').addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('residente-nombre').value.trim();
        const barrio = document.getElementById('residente-barrio').value.trim();

        currentUser = {
            name: nombre,
            type: 'residente',
            points: 0,
            barrio: barrio,
            completed: 0,
            group: false,
            estadia: "",
            insignias: [],
            cupones: []
        };

        const db = getUsersDb();
        db[nombre] = currentUser;
        saveUsersDb(db);

        formResidenteSection.classList.add('hidden');
        alert(`Registro exitoso. Bienvenido, ${nombre}. Comienzas con 0 puntos.`);
        showView('comunidad');
        actualizarUI();
    });

    // Navegación Pestañas
    const navItems = [navHome, navMisiones, navComunidad, navAdmin];
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            if (!currentUser) {
                alert('Por favor selecciona o inicia sesión con tu perfil primero.');
                return;
            }
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

    // Toggle Vista Lista/Mapa Misiones
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

    // Cuestionario Modal Misión
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
        const misiones = getMisionesDb();
        const datos = misiones[id];
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

    // Submit Cuestionario (Guarda en Logs y Visitas)
    document.getElementById('form-verificar-preguntas').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('modal-mision-id').value;
        const basePts = parseInt(document.getElementById('modal-mision-puntos-val').value);
        const misiones = getMisionesDb();
        const datos = misiones[id];
        
        let correctas = true;
        datos.preguntas.forEach((pregunta, index) => {
            const selected = document.querySelector(`input[name="pregunta-${index}"]:checked`).value;
            if (selected !== pregunta.correct) {
                correctas = false;
            }
        });

        if (correctas) {
            const visitaPts = 10;
            const respuestasPts = 10;
            const completarMisionPts = basePts - 20 > 0 ? basePts - 20 : 30;
            
            let ptsGanados = visitaPts + respuestasPts + completarMisionPts;
            let desgloseMsg = `Visita (+${visitaPts}) + Respuestas (+${respuestasPts}) + Misión (+${completarMisionPts})`;

            if (currentUser.group) {
                ptsGanados += 15;
                desgloseMsg += ` + Bono Grupal (+15)`;
            }

            if (recommendationAppliedBy) {
                ptsGanados += 50;
                desgloseMsg += ` + Recomendación Cruzada (+50)`;
                
                const db = getUsersDb();
                if (db[recommendationAppliedBy]) {
                    db[recommendationAppliedBy].points += 50;
                    saveUsersDb(db);
                }
                recommendationAppliedBy = null;
                document.getElementById('tourist-recommendation-box').classList.add('hidden');
            }

            currentUser.points += ptsGanados;
            currentUser.completed += 1;

            if (datos.insignia && !currentUser.insignias.includes(datos.insignia)) {
                currentUser.insignias.push(datos.insignia);
                alert(`¡Has ganado la insignia: "${datos.insignia}"!`);
            }

            const visitas = getVisitasDb();
            visitas[id] = (visitas[id] || 0) + 1;
            saveVisitasDb(visitas);

            const logs = getLogsDb();
            logs.push({
                username: currentUser.name,
                attraction: datos.titulo,
                points: ptsGanados,
                timestamp: new Date().toLocaleString()
            });
            saveLogsDb(logs);

            const db = getUsersDb();
            db[currentUser.name] = currentUser;
            saveUsersDb(db);
            
            actualizarUI();
            modalMision.classList.add('hidden');
            alert(`Misión completada. Puntos sumados: ${desgloseMsg} = +${ptsGanados} pts.`);
        } else {
            alert('Respuestas incorrectas. Inténtalo de nuevo.');
        }
    });

    // Canje de Recompensas
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-canjear')) {
            const costo = parseInt(e.target.getAttribute('data-costo'));
            const premio = e.target.getAttribute('data-premio');

            if (currentUser.points >= costo) {
                currentUser.points -= costo;
                const codigoCupon = `CUPON-${premio.toUpperCase().substring(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`;
                currentUser.cupones.push(`${premio} (${codigoCupon})`);

                const db = getUsersDb();
                db[currentUser.name] = currentUser;
                saveUsersDb(db);

                actualizarUI();
                alert(`Canje exitoso. Código de cupón: ${codigoCupon}`);
            } else {
                alert(`Puntos insuficientes. Requieres ${costo} puntos.`);
            }
        }
    });

    // Recomendación Residente -> Turista
    btnApplyRecommend.addEventListener('click', () => {
        const cod = inputCodeRecommend.value.trim();
        const db = getUsersDb();

        if (db[cod] && db[cod].type === 'residente') {
            recommendationAppliedBy = cod;
            recommendStatusMsg.innerText = `Recomendación válida de: ${cod}. Bono de +50 pts listo para tu siguiente misión.`;
            recommendStatusMsg.classList.remove('hidden', 'text-error');
            recommendStatusMsg.classList.add('text-secondary');
        } else {
            recommendStatusMsg.innerText = `Residente "${cod}" no registrado.`;
            recommendStatusMsg.classList.remove('hidden', 'text-secondary');
            recommendStatusMsg.classList.add('text-error');
        }
    });

    document.getElementById('btn-generar-recomendar').addEventListener('click', () => {
        const lugar = document.getElementById('residente-lugar-recomendar').value.trim();
        if (!lugar) {
            alert('Ingresa el lugar a recomendar.');
            return;
        }
        document.getElementById('codigo-generado').innerText = currentUser.name;
        document.getElementById('box-codigo-generado').classList.remove('hidden');
        alert(`Comparte tu usuario "${currentUser.name}" con el turista.`);
    });

    // Acciones Residente
    const btnsComunidadAccion = document.querySelectorAll('.btn-residente-accion');
    btnsComunidadAccion.forEach(btn => {
        btn.addEventListener('click', () => {
            const pts = parseInt(btn.getAttribute('data-puntos'));
            const msg = btn.getAttribute('data-msg');
            currentUser.points += pts;
            
            if (currentUser.points >= 3000 && !currentUser.insignias.includes("Embajador Local")) {
                currentUser.insignias.push("Embajador Local");
                alert("¡Eres Embajador Local de Jujuy!");
            }

            const db = getUsersDb();
            db[currentUser.name] = currentUser;
            saveUsersDb(db);

            const logs = getLogsDb();
            logs.push({
                username: currentUser.name,
                attraction: msg,
                points: pts,
                timestamp: new Date().toLocaleString()
            });
            saveLogsDb(logs);

            actualizarUI();
            alert(`Acción registrada: "${msg}". Sumaste ${pts} puntos.`);
        });
    });

    document.getElementById('btn-scan-qr').addEventListener('click', () => {
        alert('Simulador de escaneo: escanea un código QR en misiones.');
        showView('misiones');
    });

    // 2. Lógica Administrativa CRUD

    // Navegar entre sub-pestañas del Administrador
    window.switchAdminTab = function(tabName) {
        document.getElementById('admin-subtab-metrics').classList.add('hidden');
        document.getElementById('admin-subtab-misiones').classList.add('hidden');
        document.getElementById('admin-subtab-usuarios').classList.add('hidden');
        document.getElementById('admin-subtab-tiendas').classList.add('hidden');

        document.getElementById(`admin-subtab-${tabName}`).classList.remove('hidden');
        document.getElementById(`admin-subtab-${tabName}`).classList.add('flex');

        document.querySelectorAll('[id^="subtab-btn-"]').forEach(btn => {
            btn.className = 'px-4 py-2 text-xs font-bold bg-surface-container text-on-surface-variant rounded-xl';
        });
        document.getElementById(`subtab-btn-${tabName}`).className = 'px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-xl';
    };

    // FORMULARIO: Crear / Editar Misión
    const formNuevaMision = document.getElementById('form-nueva-mision');
    formNuevaMision.addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('edit-mision-id').value;
        const nombre = document.getElementById('admin-mision-nombre').value.trim();
        const categoria = document.getElementById('admin-mision-cat').value;
        const puntos = parseInt(document.getElementById('admin-mision-puntos').value);
        const db = getMisionesDb();

        const id = editId ? editId : nombre.toLowerCase().replace(/\s+/g, '-');

        db[id] = {
            id: id,
            titulo: nombre,
            categoria: categoria,
            puntos: puntos,
            insignia: categoria === 'Historico' ? 'Guardián del Patrimonio' : 'Explorador Verde',
            descripcion: editId ? (db[editId].descripcion || '') : 'Misión agregada por la Municipalidad.',
            preguntas: editId ? (db[editId].preguntas || [
                {
                    q: 'Pregunta de validación rápida:',
                    options: ['Correcto', 'Incorrecto'],
                    correct: 'Correcto'
                }
            ]) : [
                {
                    q: 'Pregunta de validación rápida:',
                    options: ['Correcto', 'Incorrecto'],
                    correct: 'Correcto'
                }
            ]
        };

        saveMisionesDb(db);
        
        // Resetear formulario
        formNuevaMision.reset();
        document.getElementById('edit-mision-id').value = '';
        document.getElementById('admin-mision-form-title').innerText = 'Agregar Nueva Misión / Atractivo';
        document.getElementById('admin-mision-btn-submit').innerText = 'Publicar Misión';
        document.getElementById('admin-mision-btn-cancel').classList.add('hidden');

        alert(editId ? 'Misión editada con éxito.' : 'Nueva misión publicada.');
        actualizarUI();
    });

    document.getElementById('admin-mision-btn-cancel').addEventListener('click', () => {
        formNuevaMision.reset();
        document.getElementById('edit-mision-id').value = '';
        document.getElementById('admin-mision-form-title').innerText = 'Agregar Nueva Misión / Atractivo';
        document.getElementById('admin-mision-btn-submit').innerText = 'Publicar Misión';
        document.getElementById('admin-mision-btn-cancel').classList.add('hidden');
    });

    // Misiones CRUD Acciones (Editar/Eliminar)
    window.editarMision = function(id) {
        const db = getMisionesDb();
        const mision = db[id];
        if (!mision) return;

        document.getElementById('edit-mision-id').value = id;
        document.getElementById('admin-mision-nombre').value = mision.titulo;
        document.getElementById('admin-mision-cat').value = mision.categoria;
        document.getElementById('admin-mision-puntos').value = mision.puntos;

        document.getElementById('admin-mision-form-title').innerText = 'Editar Misión';
        document.getElementById('admin-mision-btn-submit').innerText = 'Guardar Cambios';
        document.getElementById('admin-mision-btn-cancel').classList.remove('hidden');

        // Scroll al formulario
        document.getElementById('admin-mision-form-title').scrollIntoView({ behavior: 'smooth' });
    };

    window.eliminarMision = function(id) {
        if (!confirm('¿Seguro de que deseas eliminar esta misión?')) return;
        const db = getMisionesDb();
        delete db[id];
        saveMisionesDb(db);
        actualizarUI();
    };

    // FORMULARIO: Agregar Usuario Admin
    document.getElementById('form-nuevo-usuario-admin').addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('admin-user-nombre').value.trim();
        const rol = document.getElementById('admin-user-rol').value;
        const puntos = parseInt(document.getElementById('admin-user-puntos').value);

        const db = getUsersDb();
        if (db[nombre]) {
            alert('El nombre de usuario ya existe.');
            return;
        }

        db[nombre] = {
            name: nombre,
            type: rol,
            points: puntos,
            location: rol === 'turista' ? 'Jujuy, Argentina' : '',
            barrio: rol === 'residente' ? 'Barrio Centro' : '',
            completed: 0,
            group: false,
            estadia: rol === 'turista' ? 'pleno' : '',
            insignias: [],
            cupones: []
        };

        saveUsersDb(db);
        document.getElementById('form-nuevo-usuario-admin').reset();
        alert('Usuario registrado exitosamente.');
        actualizarUI();
    });

    window.eliminarUsuario = function(username) {
        if (username === 'Admin') {
            alert('No puedes eliminar al usuario administrador principal.');
            return;
        }
        if (!confirm(`¿Seguro de que deseas eliminar al usuario "${username}"?`)) return;
        const db = getUsersDb();
        delete db[username];
        saveUsersDb(db);
        actualizarUI();
    };

    // FORMULARIO: Agregar Tienda / Recompensa
    document.getElementById('form-nuevo-premio').addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('admin-premio-nombre').value.trim();
        const tienda = document.getElementById('admin-premio-tienda').value.trim();
        const costo = parseInt(document.getElementById('admin-premio-costo').value);
        const desc = document.getElementById('admin-premio-desc').value.trim();

        const db = getTiendasDb();
        const id = nombre.toLowerCase().replace(/\s+/g, '-');

        db.push({
            id: id,
            premio: nombre,
            costo: costo,
            tienda: tienda,
            desc: desc
        });

        saveTiendasDb(db);
        document.getElementById('form-nuevo-premio').reset();
        alert('Premio y comercio adheridos con éxito.');
        actualizarUI();
    });

    window.eliminarPremio = function(id) {
        if (!confirm('¿Seguro de eliminar este beneficio?')) return;
        let db = getTiendasDb();
        db = db.filter(item => item.id !== id);
        saveTiendasDb(db);
        actualizarUI();
    };

    // 3. Actualización de Interfaz e Interacción Dinámica

    function actualizarUI() {
        if (!currentUser) return;

        const db = getUsersDb();
        const misiones = getMisionesDb();
        const tiendas = getTiendasDb();
        const visitas = getVisitasDb();
        const logs = getLogsDb();

        // Saludo y Pasaporte
        document.getElementById('saludo-usuario').innerText = currentUser.name;
        document.getElementById('passport-username').innerText = currentUser.name;
        
        const pLoc = document.getElementById('passport-location');
        const subtPasaporte = document.getElementById('subt-pasaporte');

        let totalMisionesObjetivo = 4;
        if (currentUser.type === 'turista') {
            pLoc.innerText = currentUser.location || 'Argentina';
            let tipoPass = "Pasaporte Explorador (1 día)";
            if (currentUser.estadia === "express") { tipoPass = "Pasaporte Express (Mediodía)"; totalMisionesObjetivo = 2; }
            if (currentUser.estadia === "pleno") { tipoPass = "Pasaporte Jujuy a Pleno (2 días)"; totalMisionesObjetivo = 6; }
            if (currentUser.estadia === "sinprisa") { tipoPass = "Pasaporte Jujuy Sin Prisa (3+ días)"; totalMisionesObjetivo = 8; }
            subtPasaporte.innerText = `Tu pasaporte: ${tipoPass}`;
            document.getElementById('tourist-recommendation-box').classList.remove('hidden');
        } else {
            pLoc.innerText = currentUser.barrio || 'San Salvador de Jujuy';
            subtPasaporte.innerText = "Perfil de Comunidad Residente";
            document.getElementById('tourist-recommendation-box').classList.add('hidden');
            totalMisionesObjetivo = 10;
        }

        document.getElementById('animated-points').innerText = currentUser.points;
        document.getElementById('misiones-contador').innerText = currentUser.completed;

        if (currentUser.group) {
            document.getElementById('bonus-banner').classList.remove('hidden');
        } else {
            document.getElementById('bonus-banner').classList.add('hidden');
        }

        // Renderizar insignias
        const insigniasContainer = document.getElementById('insignias-contenedor');
        insigniasContainer.innerHTML = '';
        if (currentUser.insignias && currentUser.insignias.length > 0) {
            currentUser.insignias.forEach(ins => {
                const span = document.createElement('span');
                span.className = 'text-[10px] bg-secondary-container text-on-secondary-container font-bold px-2.5 py-1 rounded-md border border-outline-variant';
                span.innerText = ins;
                insigniasContainer.appendChild(span);
            });
        } else {
            insigniasContainer.innerHTML = '<span class="text-xs bg-primary-container text-on-primary px-3 py-1 rounded-md">Ninguna</span>';
        }

        // Renderizar cupones
        const cuponesBox = document.getElementById('cupones-box');
        const cuponesLista = document.getElementById('cupones-lista');
        cuponesLista.innerHTML = '';
        if (currentUser.cupones && currentUser.cupones.length > 0) {
            cuponesBox.classList.remove('hidden');
            currentUser.cupones.forEach(cup => {
                const li = document.createElement('li');
                li.innerText = cup;
                cuponesLista.appendChild(li);
            });
        } else {
            cuponesBox.classList.add('hidden');
        }

        // Rango / Progreso
        let nivelText = "Novato";
        if (currentUser.points >= 500 && currentUser.points < 1500) nivelText = "Explorador";
        if (currentUser.points >= 1500) nivelText = "Experto / Embajador";
        document.getElementById('recompensa-sig-lbl').innerText = `Nivel actual: ${nivelText}`;

        let porcentajeMisiones = Math.round((currentUser.completed / totalMisionesObjetivo) * 100);
        if (porcentajeMisiones > 100) porcentajeMisiones = 100;
        document.getElementById('porcentaje-pasaporte-lbl').innerText = `${porcentajeMisiones}%`;
        document.getElementById('barra-progreso').style.width = `${porcentajeMisiones}%`;
        
        let restantes = 1500 - currentUser.points;
        if (restantes < 0) restantes = 0;
        document.getElementById('pts-faltantes').innerText = `${restantes} pts para el siguiente nivel`;

        // Renderizar Tienda de Recompensas de forma dinámica
        const tiendaContainer = document.getElementById('tienda-recompensas-container');
        tiendaContainer.innerHTML = '';
        tiendas.forEach(t => {
            const card = document.createElement('div');
            card.className = 'bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm flex flex-col justify-between gap-md';
            card.innerHTML = `
                <div>
                    <span class="text-xs bg-secondary/10 text-secondary font-bold px-3 py-1 rounded-full">${t.tienda}</span>
                    <h4 class="font-bold text-on-surface text-sm mt-3">${t.premio}</h4>
                    <p class="text-xs text-on-surface-variant mt-2">${t.desc}</p>
                </div>
                <button class="btn-canjear w-full py-3 bg-primary text-on-primary text-xs font-bold rounded-xl mt-2 hover:bg-primary-container" data-costo="${t.costo}" data-premio="${t.premio}">
                    Canjear (${t.costo} pts)
                </button>
            `;
            tiendaContainer.appendChild(card);
        });

        // Renderizar Lista de Misiones de forma dinámica
        const misionesContainer = document.getElementById('misiones-list-container');
        misionesContainer.innerHTML = '';
        Object.values(misiones).forEach(m => {
            const isEstacional = m.categoria === 'Estacional';
            const hideClass = isEstacional ? 'mision-card estacional hidden' : '';
            const colorBar = m.categoria === 'Historico' ? 'bg-secondary' : (m.categoria === 'Naturaleza' ? 'bg-tertiary-fixed-dim' : 'bg-primary-container');
            const badgeColor = m.categoria === 'Historico' ? 'text-secondary bg-secondary/10' : 'text-tertiary-container bg-tertiary-fixed/30';
            
            const card = document.createElement('div');
            card.className = `${hideClass} flex bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden relative border border-outline-variant p-4`;
            card.innerHTML = `
                <div class="absolute left-0 top-0 bottom-0 w-1 ${colorBar}"></div>
                <div class="flex flex-col flex-1 gap-xs ml-2">
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-bold px-3 py-1 rounded-full ${badgeColor}">${m.categoria}</span>
                        <span class="font-label-lg font-bold text-primary flex items-center gap-xs">+${m.puntos} pts</span>
                    </div>
                    <h3 class="text-body-lg font-bold text-on-surface leading-tight mt-3">${m.titulo}</h3>
                    <p class="text-xs text-on-surface-variant mt-1">${m.descripcion}</p>
                    <button class="btn-mision-activar mt-3 px-4 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold self-start" data-id="${m.id}" data-puntos="${m.puntos}">
                        Iniciar Misión
                    </button>
                </div>
            `;
            misionesContainer.appendChild(card);
        });
        actualizarVisibilidadMisionesEstacionales(seasonSelector.value);

        // Leaderboard Comunidad
        const leaderboard = document.getElementById('leaderboard-ranking');
        leaderboard.innerHTML = '';
        const residentes = Object.values(db).filter(u => u.type === 'residente').sort((a, b) => b.points - a.points);
        residentes.forEach((res, index) => {
            const div = document.createElement('div');
            div.className = `flex items-center gap-md p-md ${index < residentes.length - 1 ? 'border-b border-outline-variant' : ''}`;
            div.innerHTML = `
                <div class="font-bold text-primary w-8">${index + 1}</div>
                <div class="flex-1">
                    <span class="font-label-lg text-on-surface block font-bold text-sm">${res.name}</span>
                    <span class="text-xs text-on-surface-variant">${res.barrio || 'Residente'}</span>
                </div>
                <span class="font-label-lg text-tertiary-fixed-dim font-bold">${res.points} pts</span>
            `;
            leaderboard.appendChild(div);
        });

        // panel de administración: Métricas generales
        const totalUsuarios = Object.keys(db).length;
        document.getElementById('admin-total-usuarios').innerText = totalUsuarios;

        const turistas = Object.values(db).filter(u => u.type === 'turista');
        let sumaDias = 0;
        turistas.forEach(t => {
            if (t.estadia === "express") sumaDias += 0.5;
            if (t.estadia === "explorador") sumaDias += 1;
            if (t.estadia === "pleno") sumaDias += 2;
            if (t.estadia === "sinprisa") sumaDias += 4;
        });
        const promedio = turistas.length > 0 ? (sumaDias / turistas.length).toFixed(1) : 0;
        document.getElementById('admin-promedio-estadia').innerText = `${promedio} días`;

        // Renderizar gráfico de visitas (estadísticas)
        const adminGrafico = document.getElementById('admin-grafico-barras');
        adminGrafico.innerHTML = '';
        const maxVisitas = Math.max(...Object.keys(misiones).map(id => visitas[id] || 0), 1);
        
        Object.values(misiones).forEach(m => {
            const count = visitas[m.id] || 0;
            const porcentajeBarra = Math.round((count / maxVisitas) * 100);
            const barContainer = document.createElement('div');
            barContainer.className = 'flex flex-col gap-1 w-full';
            barContainer.innerHTML = `
                <div class="flex justify-between text-xs font-bold text-on-surface">
                    <span>${m.titulo}</span>
                    <span>${count} visitas</span>
                </div>
                <div class="w-full h-3.5 bg-surface-variant rounded-full overflow-hidden border border-outline-variant">
                    <div class="h-full bg-secondary rounded-full transition-all duration-500" style="width: ${porcentajeBarra}%"></div>
                </div>
            `;
            adminGrafico.appendChild(barContainer);
        });

        // Renderizar tabla de validaciones de administrador
        const tablaVisitas = document.getElementById('admin-tabla-visitas');
        tablaVisitas.innerHTML = '';
        Object.values(misiones).forEach(m => {
            const count = visitas[m.id] || 0;
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant';
            tr.innerHTML = `
                <td class="py-3 font-bold">${m.titulo}</td>
                <td class="py-3 text-primary font-bold">${count} visitas</td>
                <td class="py-3 text-on-surface-variant">${m.categoria}</td>
            `;
            tablaVisitas.appendChild(tr);
        });

        // Renderizar tabla de validaciones en vivo
        const tablaLogs = document.getElementById('admin-historial-validaciones');
        tablaLogs.innerHTML = '';
        const logsSorted = [...logs].reverse();
        logsSorted.forEach(log => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant';
            tr.innerHTML = `
                <td class="py-3 font-bold">${log.username}</td>
                <td class="py-3 text-on-surface text-[11px]">${log.attraction}</td>
                <td class="py-3 text-secondary font-bold">+${log.points} pts</td>
                <td class="py-3 text-on-surface-variant font-mono text-[10px]">${log.timestamp}</td>
            `;
            tablaLogs.appendChild(tr);
        });

        // CRUD ADMIN: Tabla de Misiones
        const crudMisionesTbody = document.getElementById('admin-crud-misiones-tbody');
        crudMisionesTbody.innerHTML = '';
        Object.values(misiones).forEach(m => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant';
            tr.innerHTML = `
                <td class="py-3 font-bold">${m.titulo}</td>
                <td class="py-3 text-on-surface-variant">${m.categoria}</td>
                <td class="py-3 text-primary font-bold">${m.puntos} pts</td>
                <td class="py-3 flex gap-sm">
                    <button class="px-2 py-1 bg-secondary text-on-secondary rounded text-[10px] font-bold" onclick="editarMision('${m.id}')">Editar</button>
                    <button class="px-2 py-1 bg-primary text-on-primary rounded text-[10px] font-bold" onclick="eliminarMision('${m.id}')">Eliminar</button>
                </td>
            `;
            crudMisionesTbody.appendChild(tr);
        });

        // CRUD ADMIN: Tabla de Usuarios
        const crudUsuariosTbody = document.getElementById('admin-crud-usuarios-tbody');
        crudUsuariosTbody.innerHTML = '';
        Object.values(db).forEach(u => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant';
            tr.innerHTML = `
                <td class="py-3 font-bold">${u.name}</td>
                <td class="py-3 text-on-surface-variant uppercase text-[10px] font-bold">${u.type}</td>
                <td class="py-3 text-primary font-bold">${u.points} pts</td>
                <td class="py-3">
                    <button class="px-2 py-1 bg-primary text-on-primary rounded text-[10px] font-bold" onclick="eliminarUsuario('${u.name}')">Eliminar</button>
                </td>
            `;
            crudUsuariosTbody.appendChild(tr);
        });

        // CRUD ADMIN: Tabla de Tiendas
        const crudTiendasTbody = document.getElementById('admin-crud-tiendas-tbody');
        crudTiendasTbody.innerHTML = '';
        tiendas.forEach(t => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant';
            tr.innerHTML = `
                <td class="py-3 font-bold">${t.premio}</td>
                <td class="py-3 text-on-surface-variant">${t.tienda}</td>
                <td class="py-3 text-primary font-bold">${t.costo} pts</td>
                <td class="py-3">
                    <button class="px-2 py-1 bg-primary text-on-primary rounded text-[10px] font-bold" onclick="eliminarPremio('${t.id}')">Eliminar</button>
                </td>
            `;
            crudTiendasTbody.appendChild(tr);
        });
    }

    // Inicializar por defecto
    actualizarUI();
});
