document.addEventListener('DOMContentLoaded', () => {
    // Referencias a las vistas
    const viewInicio = document.getElementById('seleccion-perfil');
    const viewTurista = document.getElementById('vista-turista');
    const viewResidente = document.getElementById('vista-residente');
    const viewAdmin = document.getElementById('vista-admin');

    // Botones de navegación principal
    const btnSoyTurista = document.getElementById('btn-soy-turista');
    const btnSoyResidente = document.getElementById('btn-soy-residente');
    const btnSoyAdmin = document.getElementById('btn-soy-admin');
    const btnsBack = document.querySelectorAll('.btn-back');

    // Funciones de navegación
    function showView(viewToShow) {
        document.querySelectorAll('.view').forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('active');
        });
        viewToShow.classList.remove('hidden');
        viewToShow.classList.add('active');
    }

    btnSoyTurista.addEventListener('click', () => showView(viewTurista));
    btnSoyResidente.addEventListener('click', () => showView(viewResidente));
    btnSoyAdmin.addEventListener('click', () => showView(viewAdmin));

    btnsBack.forEach(btn => {
        btn.addEventListener('click', () => {
            showView(viewInicio);
        });
    });

    // Lógica Perfil Turista
    const formTurista = document.getElementById('registro-turista');
    const containerFormTurista = document.getElementById('form-turista');
    const dashboardTurista = document.getElementById('dashboard-turista');
    const tPuntos = document.getElementById('t-puntos');
    let puntosTurista = 0;

    formTurista.addEventListener('submit', (e) => {
        e.preventDefault();
        const viaje = document.getElementById('t-viaje').value;
        
        // Asignar bonus grupal
        if (viaje === 'familia' || viaje === 'amigos') {
            puntosTurista += 15;
            alert('¡Recibiste +15 pts de Bonus Grupal por viajar acompañado!');
        }

        containerFormTurista.classList.add('hidden');
        dashboardTurista.classList.remove('hidden');
        actualizarPuntosTurista();
    });

    const btnsMision = document.querySelectorAll('.btn-mision');
    btnsMision.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pts = parseInt(e.target.getAttribute('data-pts'));
            puntosTurista += pts;
            actualizarPuntosTurista();
            e.target.disabled = true;
            e.target.innerText = 'Misión Completada ✅';
            e.target.style.backgroundColor = 'gray';
            alert(`¡Misión validada y preguntas respondidas! Sumaste ${pts} puntos.`);
        });
    });

    function actualizarPuntosTurista() {
        tPuntos.innerText = puntosTurista;
    }

    // Lógica Perfil Residente
    const btnsRecomendar = document.querySelectorAll('.btn-recomendar');
    const rPuntos = document.getElementById('r-puntos');
    let puntosResidente = 0;

    btnsRecomendar.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnText = e.target.innerText;
            let pts = 0;
            if (btnText.includes('20')) pts = 20;
            if (btnText.includes('30')) pts = 30;

            puntosResidente += pts;
            rPuntos.innerText = puntosResidente;
            alert(`¡Acción registrada correctamente! Acabas de sumar ${pts} Puntos de Comunidad.`);
        });
    });

    // Lógica Perfil Admin
    const formActividad = document.getElementById('form-actividad');
    formActividad.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Actividad agregada exitosamente al sistema.');
        formActividad.reset();
    });
});
