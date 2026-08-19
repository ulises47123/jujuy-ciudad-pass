document.addEventListener('DOMContentLoaded', () => {
    // Inicializar base de usuarios simulada en LocalStorage
    const defaultUsers = {
        "Mateo Garcia": {
            name: "Mateo Garcia",
            type: "turista",
            points: 1250,
            location: "Argentina",
            completed: 2,
            group: true,
            estadia: "pleno", // 2 días (Pasaporte Jujuy a Pleno)
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

    const existingUsers = localStorage.getItem('jujuy_pass_users');
    if (!existingUsers || !JSON.parse(existingUsers)["Admin"]) {
        localStorage.setItem('jujuy_pass_users', JSON.stringify(defaultUsers));
    }

    // Inicializar base de visitas en LocalStorage
    const defaultVisitas = {
        "cabildo": 342,
        "botanico": 185,
        "corredor-sabores": 95,
        "pachamama-ofrenda": 54,
        "carrozas-primavera": 12,
        "carnaval-desentierro": 8
    };

    if (!localStorage.getItem('jujuy_pass_visitas')) {
        localStorage.setItem('jujuy_pass_visitas', JSON.stringify(defaultVisitas));
    }

    const defaultLogs = [
        { username: "Mateo Garcia", attraction: "Cabildo de Jujuy", points: 65, timestamp: "19/8/2026, 15:42:10" },
        { username: "Mateo Garcia", attraction: "Parque Botánico Municipal", points: 135, timestamp: "19/8/2026, 16:15:33" },
        { username: "Maria L.", attraction: "Eco-reporte: Limpiar Plaza", points: 100, timestamp: "19/8/2026, 17:05:00" },
        { username: "Carlos R.", attraction: "Eco-reporte: Limpiar Plaza", points: 100, timestamp: "19/8/2026, 17:11:12" }
    ];

    if (!localStorage.getItem('jujuy_pass_logs')) {
        localStorage.setItem('jujuy_pass_logs', JSON.stringify(defaultLogs));
    }

    function getUsersDb() {
        return JSON.parse(localStorage.getItem('jujuy_pass_users'));
    }

    function saveUsersDb(db) {
        localStorage.setItem('jujuy_pass_users', JSON.stringify(db));
    }

    function getVisitasDb() {
        return JSON.parse(localStorage.getItem('jujuy_pass_visitas'));
    }

    function saveVisitasDb(db) {
        localStorage.setItem('jujuy_pass_visitas', JSON.stringify(db));
    }

    function getLogsDb() {
        return JSON.parse(localStorage.getItem('jujuy_pass_logs') || '[]');
    }

    function saveLogsDb(logs) {
        localStorage.setItem('jujuy_pass_logs', JSON.stringify(logs));
    }

    // Estado activo
    let currentUser = null;
    let recommendationAppliedBy = null;

    // Preguntas para las misiones
    const misionesData = {
        cabildo: {
            titulo: 'Cabildo de Jujuy',
            categoria: 'Historico',
            insignia: 'Guardián del Patrimonio',
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
            categoria: 'Naturaleza',
            insignia: 'Explorador Verde',
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
            titulo: 'Corredor Gastronómico Paseo Pachamama',
            categoria: 'Sabores',
            insignia: 'Embajador Gastronómico',
            preguntas: [
                {
                    q: '¿Cuál es el ingrediente base de la tradicional humita jujeña?',
                    options: ['Maíz choclo rallado', 'Carne de llama desmechada', 'Harina de trigo'],
                    correct: 'Maíz choclo rallado'
                }
            ]
        },
        'pachamama-ofrenda': {
            titulo: 'Ofrenda en el Mercado 6 de Agosto',
            categoria: 'Estacional',
            insignia: 'Alma Jujeña',
            preguntas: [
                {
                    q: '¿En honor a quién se realiza la ofrenda del sahumado en Jujuy?',
                    options: ['La Pachamama (Madre Tierra)', 'El Dios del Sol', 'Los Reyes Magos'],
                    correct: 'La Pachamama (Madre Tierra)'
                }
            ]
        },
        'carrozas-primavera': {
            titulo: 'Desfile de Carrozas en Ciudad Cultural',
            categoria: 'Estacional',
            insignia: 'Embajador Local',
            preguntas: [
                {
                    q: '¿Quiénes construyen las famosas carrozas de la Fiesta Nacional de los Estudiantes?',
                    options: ['Los estudiantes de secundaria', 'Empresas privadas de turismo', 'Artistas plásticos contratados'],
                    correct: 'Los estudiantes de secundaria'
                }
            ]
        },
        'carnaval-desentierro': {
            titulo: 'Circuito de Comparsa y Desentierro del Diablo',
            categoria: 'Estacional',
            insignia: 'Alma Jujeña',
            preguntas: [
                {
                    q: '¿Qué personaje mítico se desentierra para dar inicio a los festejos de carnaval?',
                    options: ['El diablo del carnaval (Pujllay)', 'El duende de la Puna', 'El Coquena'],
                    correct: 'El diablo del carnaval (Pujllay)'
                }
            ]
        }
    };

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
            document.querySelector('.estacional-pachamama').classList.remove('hidden');
            adminCicloActual.innerText = 'Agosto - Pachamama';
        } else if (season === 'estudiantes') {
            document.querySelector('.estacional-estudiantes').classList.remove('hidden');
            adminCicloActual.innerText = 'Septiembre - Estudiantes';
        } else if (season === 'carnaval') {
            document.querySelector('.estacional-carnaval').classList.remove('hidden');
            adminCicloActual.innerText = 'Febrero - Carnaval';
        }
    }

    // Inicialización del flujo de bienvenida
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

    // Login Form
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
            alert(`Error: El usuario "${username}" no existe. Si eres nuevo, por favor regresa y registrate como usuario nuevo.`);
        }
    });

    // Salir / Cambiar Perfil
    document.getElementById('btn-cambiar-perfil').addEventListener('click', () => {
        currentUser = null;
        recommendationAppliedBy = null;
        modalBienvenida.classList.remove('hidden');
        formTuristaSection.classList.add('hidden');
        formResidenteSection.classList.add('hidden');
        hideAllViews();
    });

    // Botones de selección de perfil (NUEVO USUARIO)
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
            points: 0
        };
        showView('admin');
        actualizarUI();
    });

    // Registro de Turista Nuevo (Inicia con 0 Puntos)
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

    // Registro de Residente Nuevo (Inicia con 0 Puntos)
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
        alert(`Registro exitoso. Bienvenido vecino, ${nombre}. Comienzas con 0 puntos.`);
        showView('comunidad');
        actualizarUI();
    });

    // Navegación de pestañas
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

    // Submit del cuestionario de misión (Valida respuestas y desglosa puntos detallados)
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
            // Desglose de puntos según PDF:
            // Visitar y validar atractivo: +10 pts
            // Responder correctamente: +10 pts
            // Completar misión: +30 pts (Total base = 50 pts, o el valor de basePts especificado)
            const visitaPts = 10;
            const respuestasPts = 10;
            const completarMisionPts = basePts - 20 > 0 ? basePts - 20 : 30;
            
            let ptsGanados = visitaPts + respuestasPts + completarMisionPts;
            let desgloseMsg = `Visita (+${visitaPts}) + Respuestas (+${respuestasPts}) + Misión (+${completarMisionPts})`;

            // Asignar bono de grupo si aplica
            if (currentUser.group) {
                ptsGanados += 15;
                desgloseMsg += ` + Bono Grupal (+15)`;
            }

            // Asignar bono de recomendación de residente
            if (recommendationAppliedBy) {
                ptsGanados += 50;
                desgloseMsg += ` + Recomendación Cruzada (+50)`;
                
                // Dar puntos al residente que recomendó
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

            // Asignar insignia por la categoría
            if (datos.insignia && !currentUser.insignias.includes(datos.insignia)) {
                currentUser.insignias.push(datos.insignia);
                alert(`¡Has ganado la insignia: "${datos.insignia}" por tu contribución!`);
            }

            // Registrar visita en estadísticas
            const visitas = getVisitasDb();
            if (visitas[id] !== undefined) {
                visitas[id] += 1;
            } else {
                visitas[id] = 1;
            }
            saveVisitasDb(visitas);

            // Registrar en el historial de validaciones en vivo
            const logs = getLogsDb();
            logs.push({
                username: currentUser.name,
                attraction: datos.titulo,
                points: ptsGanados,
                timestamp: new Date().toLocaleString()
            });
            saveLogsDb(logs);

            // Guardar cambios en DB local
            const db = getUsersDb();
            db[currentUser.name] = currentUser;
            saveUsersDb(db);
            
            actualizarUI();
            modalMision.classList.add('hidden');
            
            // Cambiar estado del botón de la misión
            const btn = document.querySelector(`button[data-id="${id}"]`);
            if (btn) {
                btn.disabled = true;
                btn.innerText = 'Completada';
                btn.className = 'mt-3 px-4 py-2.5 bg-outline-variant text-outline rounded-xl text-xs font-bold self-start cursor-default';
            }

            alert(`¡Respuestas Correctas!\nPuntos sumados: ${desgloseMsg} = +${ptsGanados} pts.`);
        } else {
            alert('Respuestas incorrectas. Por favor lee la cartelería informativa e intenta de nuevo.');
        }
    });

    // Tienda de Recompensas (Canjear puntos por cupones)
    const btnsCanjear = document.querySelectorAll('.btn-canjear');
    btnsCanjear.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!currentUser) return;
            
            const costo = parseInt(btn.getAttribute('data-costo'));
            const premio = btn.getAttribute('data-premio');

            if (currentUser.points >= costo) {
                currentUser.points -= costo;
                
                // Generar cupón al azar
                const codigoCupon = `CUPON-${premio.toUpperCase().substring(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`;
                currentUser.cupones.push(`${premio} (${codigoCupon})`);

                // Guardar cambios en DB local
                const db = getUsersDb();
                db[currentUser.name] = currentUser;
                saveUsersDb(db);

                actualizarUI();
                alert(`Canje exitoso. Obtuviste el cupón: ${codigoCupon}`);
            } else {
                alert(`Puntos insuficientes. Necesitas ${costo} puntos para este beneficio.`);
            }
        });
    });

    // Aplicar código de recomendación de residente en perfil turista
    btnApplyRecommend.addEventListener('click', () => {
        const cod = inputCodeRecommend.value.trim();
        const db = getUsersDb();

        if (db[cod] && db[cod].type === 'residente') {
            recommendationAppliedBy = cod;
            recommendStatusMsg.innerText = `Recomendación válida de: ${cod}. Se acreditarán 50 pts extra en tu próxima misión completada.`;
            recommendStatusMsg.classList.remove('hidden', 'text-error');
            recommendStatusMsg.classList.add('text-secondary');
        } else {
            recommendStatusMsg.innerText = `El residente "${cod}" no se encuentra registrado en el sistema.`;
            recommendStatusMsg.classList.remove('hidden', 'text-secondary');
            recommendStatusMsg.classList.add('text-error');
        }
    });

    // Generar código de recomendación en perfil Residente
    document.getElementById('btn-generar-recomendar').addEventListener('click', () => {
        const lugar = document.getElementById('residente-lugar-recomendar').value.trim();
        if (!lugar) {
            alert('Por favor escribe el nombre del lugar a recomendar.');
            return;
        }

        const box = document.getElementById('box-codigo-generado');
        const codeSpan = document.getElementById('codigo-generado');
        
        codeSpan.innerText = currentUser.name;
        box.classList.remove('hidden');
        
        alert(`Comparte tu nombre de usuario "${currentUser.name}" con el turista para que ambos sumen puntos.`);
    });

    // Acciones generales de residente
    const btnsComunidadAccion = document.querySelectorAll('.btn-residente-accion');
    btnsComunidadAccion.forEach(btn => {
        btn.addEventListener('click', () => {
            const pts = parseInt(btn.getAttribute('data-puntos'));
            const msg = btn.getAttribute('data-msg');
            currentUser.points += pts;
            
            // Asignar insignia de embajador si pasa los 3000 puntos
            if (currentUser.points >= 3000 && !currentUser.insignias.includes("Embajador Local")) {
                currentUser.insignias.push("Embajador Local");
                alert("¡Felicidades! Has sido nombrado Embajador Local de Jujuy por tu nivel de participación.");
            }

            // Guardar cambios en DB local
            const db = getUsersDb();
            db[currentUser.name] = currentUser;
            saveUsersDb(db);

            // Registrar en el historial de validaciones en vivo
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

    // Simular Escaneo General
    document.getElementById('btn-scan-qr').addEventListener('click', () => {
        alert('Simulador de escaneo: escanea un código QR en el Cabildo o Parque Botánico abriendo la pestaña de Misiones.');
        showView('misiones');
    });

    // Formulario de administración (agregar misiones)
    document.getElementById('form-nueva-mision').addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('admin-mision-nombre').value.trim();
        const categoria = document.getElementById('admin-mision-cat').value;
        const puntos = parseInt(document.getElementById('admin-mision-puntos').value);
        const id = nombre.toLowerCase().replace(/\s+/g, '-');

        misionesData[id] = {
            titulo: nombre,
            categoria: categoria,
            insignia: categoria === 'Historico' ? 'Guardián del Patrimonio' : 'Explorador Verde',
            preguntas: [
                {
                    q: 'Pregunta de validación rápida para esta nueva ubicación:',
                    options: ['Opción correcta (Verdadero)', 'Opción incorrecta (Falso)'],
                    correct: 'Opción correcta (Verdadero)'
                }
            ]
        };

        // Registrar en estadísticas de visitas iniciales
        const visitas = getVisitasDb();
        visitas[id] = 0;
        saveVisitasDb(visitas);

        // Renderizar nueva tarjeta de misión
        const list = document.getElementById('misiones-list-container');
        const colorBar = categoria === 'Historico' ? 'bg-secondary' : (categoria === 'Naturaleza' ? 'bg-tertiary-fixed-dim' : 'bg-error');
        const badgeColor = categoria === 'Historico' ? 'text-secondary bg-secondary/10' : 'text-tertiary-container bg-tertiary-fixed/30';
        
        const card = document.createElement('div');
        card.className = 'flex bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden relative border border-outline-variant p-4';
        card.innerHTML = `
            <div class="absolute left-0 top-0 bottom-0 w-1 ${colorBar}"></div>
            <div class="flex flex-col flex-1 gap-xs ml-2">
                <div class="flex justify-between items-start">
                    <span class="text-label-sm font-label-sm ${badgeColor} px-3 py-1 rounded-full">${categoria}</span>
                    <span class="font-label-lg font-bold text-primary flex items-center gap-xs">+${puntos} pts</span>
                </div>
                <h3 class="text-body-lg font-bold text-on-surface leading-tight mt-3">${nombre}</h3>
                <p class="text-xs text-on-surface-variant mt-1">Nueva misión agregada desde el panel administrativo.</p>
                <button class="btn-mision-activar mt-3 px-4 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold self-start" data-id="${id}" data-puntos="${puntos}">
                    Iniciar Misión
                </button>
            </div>
        `;

        list.appendChild(card);
        alert('Nueva misión agregada exitosamente.');
        document.getElementById('form-nueva-mision').reset();
        actualizarUI();
    });

    // Actualizar la interfaz basada en el usuario activo
    function actualizarUI() {
        if (!currentUser) return;

        // Actualizar saludo y pasaporte
        document.getElementById('saludo-usuario').innerText = currentUser.name;
        document.getElementById('passport-username').innerText = currentUser.name;
        
        const pLoc = document.getElementById('passport-location');
        const subtPasaporte = document.getElementById('subt-pasaporte');

        // Cálculo dinámico de progreso del pasaporte según su estadía (Cambiante de verdad)
        let totalMisionesObjetivo = 4; // Explorador por defecto
        if (currentUser.type === 'turista') {
            pLoc.innerText = currentUser.location || 'Argentina';
            
            let tipoPass = "Pasaporte Explorador (1 día)";
            if (currentUser.estadia === "express") {
                tipoPass = "Pasaporte Express (Mediodía)";
                totalMisionesObjetivo = 2;
            }
            if (currentUser.estadia === "pleno") {
                tipoPass = "Pasaporte Jujuy a Pleno (2 días)";
                totalMisionesObjetivo = 6;
            }
            if (currentUser.estadia === "sinprisa") {
                tipoPass = "Pasaporte Jujuy Sin Prisa (3+ días)";
                totalMisionesObjetivo = 8;
            }
            
            subtPasaporte.innerText = `Tu pasaporte: ${tipoPass}`;
            document.getElementById('tourist-recommendation-box').classList.remove('hidden');
        } else {
            pLoc.innerText = currentUser.barrio || 'San Salvador de Jujuy';
            subtPasaporte.innerText = "Perfil de Comunidad Residente";
            document.getElementById('tourist-recommendation-box').classList.add('hidden');
            totalMisionesObjetivo = 10; // Objetivo residente de acciones comunitarias
        }

        document.getElementById('animated-points').innerText = currentUser.points;
        document.getElementById('misiones-contador').innerText = currentUser.completed;

        // Mostrar / ocultar bono de grupo
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

        // Nivel e información de progreso dinámico del pasaporte
        let nivelText = "Novato";
        if (currentUser.points >= 500 && currentUser.points < 1500) nivelText = "Explorador";
        if (currentUser.points >= 1500) nivelText = "Experto / Embajador";

        document.getElementById('recompensa-sig-lbl').innerText = `Nivel actual: ${nivelText}`;

        // Porcentaje real dinámico de misiones completadas respecto al objetivo del pasaporte
        let porcentajeMisiones = Math.round((currentUser.completed / totalMisionesObjetivo) * 100);
        if (porcentajeMisiones > 100) porcentajeMisiones = 100;
        
        document.getElementById('porcentaje-pasaporte-lbl').innerText = `${porcentajeMisiones}%`;
        document.getElementById('barra-progreso').style.width = `${porcentajeMisiones}%`;
        
        // Puntos faltantes para siguiente rango
        let restantes = 1500 - currentUser.points;
        if (restantes < 0) restantes = 0;
        document.getElementById('pts-faltantes').innerText = `${restantes} pts para el siguiente nivel`;

        // Renderizar tabla de posiciones en vivo (Comunidad)
        const db = getUsersDb();
        const leaderboard = document.getElementById('leaderboard-ranking');
        leaderboard.innerHTML = '';
        
        const residentes = Object.values(db)
            .filter(u => u.type === 'residente')
            .sort((a, b) => b.points - a.points);
        
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

        // Actualizar datos de administración
        const totalUsuarios = Object.keys(db).length;
        document.getElementById('admin-total-usuarios').innerText = totalUsuarios;

        // Calcular promedio de estadía
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

        // Renderizar Gráfico de barras interactivo de administración
        const visitas = getVisitasDb();
        const adminGrafico = document.getElementById('admin-grafico-barras');
        adminGrafico.innerHTML = '';

        // Obtener el valor máximo para escalar las barras del gráfico al 100%
        const maxVisitas = Math.max(...Object.values(visitas), 1);

        Object.entries(visitas).forEach(([misionId, count]) => {
            const mData = misionesData[misionId];
            const titulo = mData ? mData.titulo : misionId;
            const porcentajeBarra = Math.round((count / maxVisitas) * 100);

            const barContainer = document.createElement('div');
            barContainer.className = 'flex flex-col gap-1 w-full';
            barContainer.innerHTML = `
                <div class="flex justify-between text-xs font-bold text-on-surface">
                    <span>${titulo}</span>
                    <span>${count} visitas</span>
                </div>
                <div class="w-full h-3.5 bg-surface-variant rounded-full overflow-hidden border border-outline-variant">
                    <div class="h-full bg-secondary rounded-full transition-all duration-500" style="width: ${porcentajeBarra}%"></div>
                </div>
            `;
            adminGrafico.appendChild(barContainer);
        });

        // Renderizar tabla de visitas de administrador
        const tablaVisitas = document.getElementById('admin-tabla-visitas');
        tablaVisitas.innerHTML = '';
        
        Object.entries(visitas).forEach(([misionId, count]) => {
            const mData = misionesData[misionId];
            const titulo = mData ? mData.titulo : misionId;
            const cat = mData ? mData.categoria : "Personalizado";
            
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant';
            tr.innerHTML = `
                <td class="py-3 font-bold">${titulo}</td>
                <td class="py-3 text-primary font-bold">${count} visitas</td>
                <td class="py-3 text-on-surface-variant">${cat}</td>
            `;
            tablaVisitas.appendChild(tr);
        });

        // Renderizar tabla de historial de validaciones en vivo
        const logs = getLogsDb();
        const tablaLogs = document.getElementById('admin-historial-validaciones');
        tablaLogs.innerHTML = '';

        // Mostrar logs ordenados del más reciente al más antiguo
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
    }

    // Inicializar visualización de temporada por defecto (Pachamama - Agosto)
    actualizarVisibilidadMisionesEstacionales('pachamama');
});
