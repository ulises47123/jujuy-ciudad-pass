// Jujuy Ciudad Pass - Modern Interactive Application
let state = {
  user: null,
  userLat: -24.1858,
  userLng: -65.2995,
  lugares: [],
  beneficios: [],
  canjes: [],
  historial: [],
  recomendaciones: [],
  usuarios: [],
  map: null,
  markers: []
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('jujuy_user');
  if (savedUser) {
    try {
      state.user = JSON.parse(savedUser);
      updateHeaderUI();
      loadUserRoleView();
    } catch(e) {
      localStorage.removeItem('jujuy_user');
      window.navigateHome();
    }
  } else {
    window.navigateHome();
  }

  // Real-time polling every 6 seconds to keep live data fresh
  setInterval(() => {
    if (state.user) {
      refreshData();
    }
  }, 6000);
});

// ================= GLOBAL NAVIGATION & VIEWS =================
window.navigateHome = function() {
  if (state.user) {
    loadUserRoleView();
  } else {
    hideAllViews();
    document.getElementById('view-landing').classList.remove('hidden');
    updateHeaderUI();
  }
};

function hideAllViews() {
  ['view-landing', 'view-turista', 'view-residente', 'view-admin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function loadUserRoleView() {
  hideAllViews();
  if (!state.user) {
    window.navigateHome();
    return;
  }

  const mobileNav = document.getElementById('mobile-bottom-nav');
  const mobTourist = document.getElementById('mobile-tourist-menu');
  const mobResident = document.getElementById('mobile-resident-menu');

  if (state.user.rol === 'turista') {
    document.getElementById('view-turista').classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');
    if (mobTourist) mobTourist.classList.remove('hidden');
    if (mobResident) mobResident.classList.add('hidden');
    window.switchTouristTab('misiones');
    loadLugares();
    loadBeneficios();
    loadHistorialTurista();
  } else if (state.user.rol === 'residente') {
    document.getElementById('view-residente').classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');
    if (mobTourist) mobTourist.classList.add('hidden');
    if (mobResident) mobResident.classList.remove('hidden');
    window.switchResidentTab('canjes');
    loadRecomendaciones();
  } else if (state.user.rol === 'admin') {
    document.getElementById('view-admin').classList.remove('hidden');
    if (mobileNav) mobileNav.classList.add('hidden');
    window.switchAdminTab('estadisticas');
    loadAdminData();
  }
  updateHeaderUI();
}

function updateHeaderUI() {
  const guestBtn = document.getElementById('guest-header-btn');
  const authPill = document.getElementById('auth-header-pill');
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const pointsBadge = document.getElementById('user-points-badge');
  const pointsVal = document.getElementById('user-points-val');
  const mobileNav = document.getElementById('mobile-bottom-nav');

  if (state.user) {
    if (guestBtn) guestBtn.classList.add('hidden');
    if (authPill) authPill.classList.remove('hidden');
    if (nameEl) nameEl.textContent = state.user.nombre;
    if (roleEl) roleEl.textContent = state.user.rol.toUpperCase();

    if (state.user.rol === 'turista') {
      if (pointsBadge) pointsBadge.classList.remove('hidden');
      if (pointsVal) pointsVal.textContent = state.user.puntos_turista || 0;
    } else {
      if (pointsBadge) pointsBadge.classList.add('hidden');
    }
  } else {
    if (guestBtn) guestBtn.classList.remove('hidden');
    if (authPill) authPill.classList.add('hidden');
    if (mobileNav) mobileNav.classList.add('hidden');
  }
}

// ================= AUTHENTICATION =================
window.openLoginModal = function() {
  document.getElementById('modal-login').classList.remove('hidden');
};

window.openRegisterModal = function() {
  document.getElementById('modal-register').classList.remove('hidden');
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
};

window.fillDemoLogin = function(email, pw) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = pw;
};

window.handleLogin = async function(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!email || !password) {
    alert('Por favor ingresá tu correo y contraseña.');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.status === 'success') {
      state.user = data.usuario || data.user;
      localStorage.setItem('jujuy_user', JSON.stringify(state.user));
      window.closeModal('modal-login');
      loadUserRoleView();
    } else {
      alert(data.message || 'Credenciales incorrectas. Verificá tu correo y contraseña.');
    }
  } catch (err) {
    alert('Error al conectar con el servidor.');
  }
};

window.handleRegister = async function(e) {
  if (e) e.preventDefault();
  const nombre = document.getElementById('reg-nombre').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  if (!nombre || !email || !password) {
    alert('Por favor completá todos los campos obligatorios.');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password, rol: 'turista' })
    });
    const data = await res.json();
    if (data.status === 'success') {
      state.user = data.usuario || data.user;
      localStorage.setItem('jujuy_user', JSON.stringify(state.user));
      window.closeModal('modal-register');
      loadUserRoleView();
    } else {
      alert(data.message || 'Error al registrarse');
    }
  } catch (err) {
    alert('Error de conexión.');
  }
};

window.logoutUser = function() {
  state.user = null;
  localStorage.removeItem('jujuy_user');
  window.navigateHome();
};

// ================= TURISTA LOGIC =================
window.switchTouristTab = function(tabName) {
  ['misiones', 'mapa', 'beneficios', 'historial'].forEach(t => {
    const content = document.getElementById(`tourist-tab-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    const mobBtn = document.getElementById(`m-btn-${t}`);
    if (content) content.classList.add('hidden');
    if (btn) btn.classList.remove('active-tab');
    if (mobBtn) mobBtn.classList.remove('active-tab');
  });

  const targetContent = document.getElementById(`tourist-tab-${tabName}`);
  const targetBtn = document.getElementById(`tab-btn-${tabName}`);
  const targetMobBtn = document.getElementById(`m-btn-${tabName}`);
  if (targetContent) targetContent.classList.remove('hidden');
  if (targetBtn) targetBtn.classList.add('active-tab');
  if (targetMobBtn) targetMobBtn.classList.add('active-tab');

  if (tabName === 'mapa') {
    initLeafletMap();
  }
};

async function loadLugares() {
  try {
    const res = await fetch('/api/lugares');
    const data = await res.json();
    state.lugares = data.lugares || [];
    renderLugares();
  } catch(e) {
    console.error(e);
  }
}

function renderLugares() {
  const container = document.getElementById('misiones-container');
  if (!container) return;

  if (state.lugares.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-stone-400 col-span-full">No hay atracciones disponibles actualmente.</div>`;
    return;
  }

  container.innerHTML = state.lugares.map(l => {
    const pts = l.puntos_otorgados || l.puntos || 50;
    const locBadge = l.direccion || 'San Salvador de Jujuy • Centro';
    return `
    <div class="light-card p-5 flex flex-col justify-between transition-all group">
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <span class="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-[#fbeee7] text-[#c25e2e] border border-[#e7ded5]">${l.categoria || 'Atracción'}</span>
          <span class="text-xs font-black text-[#c25e2e] flex items-center gap-1 bg-[#fbeee7] px-2.5 py-0.5 rounded-full border border-[#e7ded5]">
            <i class="fa-solid fa-gem"></i> +${pts} pts
          </span>
        </div>
        <h4 class="text-base font-black text-stone-900 group-hover:text-[#c25e2e] transition-colors">${l.nombre}</h4>
        <p class="text-xs text-stone-600 mt-2 line-clamp-2 leading-relaxed">${l.descripcion}</p>
        <p class="text-[11px] text-[#0f766e] font-semibold mt-2.5 flex items-center gap-1.5">
          <i class="fa-solid fa-location-dot text-[#0f766e]"></i> <span>${locBadge}</span>
        </p>
      </div>

      <div class="mt-4 pt-4 border-t border-[#e7ded5] flex flex-col sm:flex-row gap-2">
        <button onclick="window.validarGPS(${l.id}, ${l.latitud}, ${l.longitud})" class="flex-1 py-2 px-3 rounded-xl bg-[#e6f6f4] hover:bg-[#d5f0ec] text-[#0f766e] border border-[#cbebe7] text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs">
          <i class="fa-solid fa-location-crosshairs"></i> Validar GPS
        </button>
        <button onclick="window.abrirTrivia(${l.id})" class="flex-1 py-2 px-3 rounded-xl bg-[#fbeee7] hover:bg-[#f5ded2] text-[#9c431b] border border-[#e7ded5] text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs">
          <i class="fa-solid fa-brain"></i> Trivia
        </button>
      </div>
    </div>
  `;
  }).join('');
}

window.detectRealGPS = function() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        alert(`Ubicación GPS detectada: ${state.userLat.toFixed(4)}, ${state.userLng.toFixed(4)}`);
      },
      () => {
        alert('No se pudo acceder al GPS real. Usando coordenadas del centro de Jujuy (-24.1858, -65.2995)');
      }
    );
  }
};

window.validarGPS = async function(lugarId, destLat, destLng) {
  if (!state.user) return window.openLoginModal();
  
  // Utilizar la ubicación GPS actual del usuario
  const lat = state.userLat || -24.1858;
  const lon = state.userLng || -65.2995;

  try {
    const res = await fetch('/api/turista/visita/gps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id: state.user.id,
        lugar_id: lugarId,
        latitud: lat,
        longitud: lon
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert(`🎉 ¡Excelente! Visita validada con éxito. Ganaste ${data.puntos_ganados || 50} puntos.`);
      state.user.puntos_turista = data.puntos_totales;
      localStorage.setItem('jujuy_user', JSON.stringify(state.user));
      updateHeaderUI();
      loadHistorialTurista();
    } else {
      alert(data.message || 'Error al validar visita.');
    }
  } catch(e) {
    alert('Error al contactar con el servidor.');
  }
};

window.abrirTrivia = function(lugarId) {
  if (!state.user) return window.openLoginModal();
  const lugar = state.lugares.find(l => l.id === lugarId);
  if (!lugar) return;

  document.getElementById('trivia-place-title').textContent = lugar.nombre;
  const preg = lugar.pregunta_verificacion || lugar.pregunta_trivia || '¿Cuál es la importancia histórica de este lugar en Jujuy?';
  document.getElementById('trivia-question-text').textContent = preg;

  let options = [];
  if (lugar.opciones && Array.isArray(lugar.opciones) && lugar.opciones.length > 0) {
    options = [...lugar.opciones];
  } else {
    const correct = lugar.respuesta_correcta || lugar.respuesta_trivia || '1593';
    options = [correct, '1810', '1834'];
  }
  options.sort(() => Math.random() - 0.5);

  const container = document.getElementById('trivia-options-container');
  container.innerHTML = options.map(opt => `
    <button onclick="window.responderTrivia(${lugar.id}, '${opt.replace(/'/g, "\\'")}')" class="p-3 text-left bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-400 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 transition">
      ${opt}
    </button>
  `).join('');

  document.getElementById('modal-trivia').classList.remove('hidden');
};

window.responderTrivia = async function(lugarId, respuesta) {
  try {
    const res = await fetch('/api/turista/visita/trivia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id: state.user.id,
        lugar_id: lugarId,
        respuesta: respuesta
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert(`🎉 ¡Trivia correcta! Sumaste ${data.puntos_ganados || 50} puntos.`);
      state.user.puntos_turista = data.puntos_totales;
      localStorage.setItem('jujuy_user', JSON.stringify(state.user));
      updateHeaderUI();
      window.closeModal('modal-trivia');
      loadHistorialTurista();
    } else {
      alert(data.message || 'Respuesta incorrecta, volvé a intentarlo.');
    }
  } catch(e) {
    alert('Error al validar la trivia.');
  }
};

async function loadBeneficios() {
  try {
    const res = await fetch('/api/beneficios');
    const data = await res.json();
    state.beneficios = data.beneficios || [];
    renderBeneficios();
  } catch(e) {
    console.error(e);
  }
}

function renderBeneficios() {
  const container = document.getElementById('beneficios-container');
  if (!container) return;

  if (state.beneficios.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-stone-400 col-span-full">No hay beneficios disponibles actualmente.</div>`;
    return;
  }

  container.innerHTML = state.beneficios.map(b => `
    <div class="light-card rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all group">
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <span class="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-[#fbeee7] text-[#c25e2e] border border-[#e7ded5]">${b.comercio || 'Comercio'}</span>
          <span class="text-xs font-black text-[#0f766e] flex items-center gap-1 bg-[#e6f6f4] px-2.5 py-0.5 rounded-full border border-[#cbebe7]">
            <i class="fa-solid fa-gem"></i> ${b.puntos_necesarios} pts
          </span>
        </div>
        <h4 class="text-base font-black text-stone-900 group-hover:text-[#c25e2e] transition-colors">${b.nombre}</h4>
        <p class="text-xs text-stone-600 mt-2">${b.descripcion}</p>
      </div>

      <button onclick="window.canjearBeneficio(${b.id}, ${b.puntos_necesarios})" class="mt-4 w-full py-2.5 px-4 rounded-xl btn-terracotta text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs hover:shadow transition">
        <i class="fa-solid fa-gift"></i> Canjear Cupón
      </button>
    </div>
  `).join('');
}

window.canjearBeneficio = async function(beneficioId, costo) {
  if (!state.user) return window.openLoginModal();
  if ((state.user.puntos_turista || 0) < costo) {
    return alert(`Puntos insuficientes. Tenés ${state.user.puntos_turista || 0} pts y necesitás ${costo} pts.`);
  }

  try {
    const res = await fetch('/api/turista/canjear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id: state.user.id,
        beneficio_id: beneficioId
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert(`🎉 ¡Canje exitoso! Tu código de cupón es: ${data.codigo_cupon}`);
      state.user.puntos_turista = data.puntos_restantes;
      localStorage.setItem('jujuy_user', JSON.stringify(state.user));
      updateHeaderUI();
      loadHistorialTurista();
      window.switchTouristTab('historial');
    } else {
      alert(data.message || 'Error al canjear beneficio.');
    }
  } catch(e) {
    alert('Error de conexión.');
  }
};

async function loadHistorialTurista() {
  if (!state.user) return;
  try {
    const [resCanjes, resVisitas] = await Promise.all([
      fetch(`/api/turista/canjes?usuario_id=${state.user.id}`),
      fetch(`/api/turista/historial?usuario_id=${state.user.id}`)
    ]);
    const dataCanjes = await resCanjes.json();
    const dataVisitas = await resVisitas.json();

    renderCanjes(dataCanjes.canjes || []);
    renderVisitas(dataVisitas.historial || []);
  } catch(e) {
    console.error(e);
  }
}

function renderCanjes(canjes) {
  const container = document.getElementById('canjes-container');
  if (!container) return;

  if (canjes.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-stone-400 col-span-full">Aún no has canjeado beneficios.</div>`;
    return;
  }

  container.innerHTML = canjes.map(c => `
    <div class="light-card rounded-2xl p-4 flex items-center justify-between gap-4">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${c.usado ? 'bg-stone-200 text-stone-600' : 'bg-[#e6f6f4] text-[#0f766e] border border-[#cbebe7]'}">
          ${c.usado ? 'Utilizado' : 'Disponible para Uso'}
        </span>
        <h4 class="text-sm font-bold text-stone-900 mt-1">${c.beneficio_nombre || 'Beneficio'}</h4>
        <p class="text-xs text-[#c25e2e] font-mono font-bold mt-1">CÓDIGO: ${c.codigo_cupon}</p>
      </div>
      <div class="text-2xl text-stone-300">
        <i class="fa-solid fa-qrcode"></i>
      </div>
    </div>
  `).join('');
}

function renderVisitas(visitas) {
  const container = document.getElementById('historial-visitas-container');
  if (!container) return;

  if (visitas.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-stone-400">Aún no has registrado visitas. ¡Explorá San Salvador de Jujuy!</div>`;
    return;
  }

  container.innerHTML = visitas.map(v => `
    <div class="p-3.5 flex items-center justify-between border-b border-[#e7ded5] last:border-b-0 hover:bg-[#fbf9f5] transition">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-[#e6f6f4] text-[#0f766e] flex items-center justify-center text-xs">
          <i class="fa-solid fa-check"></i>
        </div>
        <div>
          <span class="font-bold text-stone-900 text-sm">${v.lugar_nombre || 'Atracción'}</span>
          <span class="text-[10px] text-stone-500 block">${v.metodo === 'gps' ? 'Validación GPS' : 'Validación Trivia'} • ${v.fecha || 'Reciente'}</span>
        </div>
      </div>
      <span class="text-xs font-black text-[#c25e2e] bg-[#fbeee7] px-2.5 py-0.5 rounded-full border border-[#e7ded5]">+${v.puntos_ganados || 50} pts</span>
    </div>
  `).join('');
}

function initLeafletMap() {
  setTimeout(() => {
    if (!state.map) {
      state.map = L.map('map').setView([-24.1858, -65.2995], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(state.map);
    } else {
      state.map.invalidateSize();
    }

    // Clear old markers
    state.markers.forEach(m => state.map.removeLayer(m));
    state.markers = [];

    // Add attractions to map
    state.lugares.forEach(l => {
      const marker = L.marker([l.latitud, l.longitud]).addTo(state.map);
      const pts = l.puntos_otorgados || l.puntos || 50;
      marker.bindPopup(`
        <div class="font-sans text-stone-900 text-xs">
          <strong class="text-sm text-[#c25e2e]">${l.nombre}</strong><br>
          <span class="text-stone-600">${l.categoria || 'Atracción'}</span><br>
          <p class="my-1">${l.descripcion || ''}</p>
          <span class="font-bold text-[#0f766e]">+${pts} puntos</span>
        </div>
      `);
      state.markers.push(marker);
    });
  }, 100);
}

// ================= RESIDENTE LOGIC =================
window.switchResidentTab = function(tabName) {
  ['canjes', 'recomendar'].forEach(t => {
    const content = document.getElementById(`res-tab-${t}`);
    const btn = document.getElementById(`res-tab-btn-${t}`);
    const mobBtn = document.getElementById(`m-res-btn-${t}`);
    if (content) content.classList.add('hidden');
    if (btn) btn.classList.remove('active-tab');
    if (mobBtn) mobBtn.classList.remove('active-tab');
  });

  const targetContent = document.getElementById(`res-tab-${tabName}`);
  const targetBtn = document.getElementById(`res-tab-btn-${tabName}`);
  const targetMobBtn = document.getElementById(`m-res-btn-${tabName}`);
  if (targetContent) targetContent.classList.remove('hidden');
  if (targetBtn) targetBtn.classList.add('active-tab');
  if (targetMobBtn) targetMobBtn.classList.add('active-tab');

  if (tabName === 'recomendar') {
    loadRecomendaciones();
  }
};

window.validateCouponForm = async function(e) {
  e.preventDefault();
  const code = document.getElementById('coupon-input-code').value.trim().toUpperCase();
  const resultDiv = document.getElementById('coupon-validation-result');

  try {
    const res = await fetch('/api/residente/canjear_cupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_cupon: code })
    });
    const data = await res.json();
    resultDiv.classList.remove('hidden');

    if (data.status === 'success') {
      resultDiv.className = 'mt-4 p-4 rounded-xl text-xs sm:text-sm font-bold bg-[#e6f6f4] text-[#0f766e] border border-[#cbebe7] text-center';
      resultDiv.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i> ¡Cupón Válido y Aplicado! Beneficio: ${data.beneficio || code}`;
      document.getElementById('coupon-input-code').value = '';
    } else {
      resultDiv.className = 'mt-4 p-4 rounded-xl text-xs sm:text-sm font-bold bg-[#fbeee7] text-[#c25e2e] border border-[#e7ded5] text-center';
      resultDiv.innerHTML = `<i class="fa-solid fa-circle-xmark mr-2"></i> ${data.message || 'Cupón inválido o ya utilizado'}`;
    }
  } catch(err) {
    alert('Error al validar cupón.');
  }
};

window.openNewRecomModal = function() {
  document.getElementById('modal-new-recom').classList.remove('hidden');
};

window.saveRecommendation = async function(e) {
  if (e) e.preventDefault();
  const nombreInput = document.getElementById('recom-nombre');
  const catInput = document.getElementById('recom-categoria');
  const descInput = document.getElementById('recom-desc');

  const titulo = nombreInput ? nombreInput.value.trim() : '';
  const categoria = catInput ? catInput.value.trim() : 'Recomendación Local';
  const descripcion = descInput ? descInput.value.trim() : '';

  if (!titulo || !descripcion) {
    alert('Por favor completá el nombre del lugar y el motivo de tu recomendación.');
    return;
  }

  const userId = (state.user && state.user.id) ? state.user.id : 1;

  try {
    const res = await fetch('/api/residente/recomendacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id: userId,
        titulo: titulo,
        categoria: categoria,
        descripcion: descripcion
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert('🎉 ¡Recomendación publicada con éxito!');
      if (nombreInput) nombreInput.value = '';
      if (descInput) descInput.value = '';
      window.closeModal('modal-new-recom');
      loadRecomendaciones();
    } else {
      alert(data.message || 'Error al guardar');
    }
  } catch(err) {
    alert('Error al conectar con el servidor.');
  }
};

async function loadRecomendaciones() {
  try {
    const res = await fetch('/api/recomendaciones');
    const data = await res.json();
    state.recomendaciones = data.recomendaciones || [];
    renderRecomendaciones();
  } catch(e) {
    console.error(e);
  }
}

function renderRecomendaciones() {
  const container = document.getElementById('recomendaciones-container');
  if (!container) return;

  if (state.recomendaciones.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-stone-400 col-span-full">No hay recomendaciones todavía. ¡Sé el primero en compartir!</div>`;
    return;
  }

  container.innerHTML = state.recomendaciones.map(r => `
    <div class="light-card rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all">
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <span class="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-[#fbeee7] text-[#c25e2e] border border-[#e7ded5]">${r.categoria || 'Recomendación'}</span>
          <span class="text-[11px] text-stone-500 font-semibold"><i class="fa-solid fa-user-circle"></i> ${r.autor_nombre || 'Vecino'}</span>
        </div>
        <h4 class="text-base font-black text-stone-900">${r.titulo}</h4>
        <p class="text-xs text-stone-600 mt-2">${r.descripcion}</p>
      </div>
    </div>
  `).join('');
}

// ================= ADMIN LOGIC =================
window.switchAdminTab = function(tabName) {
  ['estadisticas', 'lugares', 'beneficios', 'usuarios'].forEach(t => {
    const content = document.getElementById(`admin-tab-${t}`);
    const btn = document.getElementById(`admin-tab-btn-${t}`);
    if (content) content.classList.add('hidden');
    if (btn) btn.classList.remove('active-tab');
  });

  const targetContent = document.getElementById(`admin-tab-${tabName}`);
  const targetBtn = document.getElementById(`admin-tab-btn-${tabName}`);
  if (targetContent) targetContent.classList.remove('hidden');
  if (targetBtn) targetBtn.classList.add('active-tab');

  if (tabName === 'estadisticas') {
    loadAdminStats();
  }
};

async function loadAdminData() {
  await Promise.all([loadAdminStats(), loadAdminPlaces(), loadAdminBenefits(), loadAdminUsers()]);
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/estadisticas');
    const data = await res.json();
    if (data.status === 'success') {
      const u = data.usuarios || {};
      document.getElementById('admin-stat-total-users').textContent = u.total || 0;
      document.getElementById('admin-stat-turistas').textContent = u.turistas || 0;
      document.getElementById('admin-stat-residentes').textContent = u.residentes || 0;

      // Top más
      const masBody = document.getElementById('admin-top-mas-body');
      if (masBody) {
        masBody.innerHTML = (data.top_mas_visitados || []).map(l => `
          <tr class="hover:bg-slate-50">
            <td class="p-3 font-bold text-slate-800">${l.nombre}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold">${l.categoria}</span></td>
            <td class="p-3 text-right font-black text-emerald-600">${l.total_visitas || 0} visitas</td>
          </tr>
        `).join('') || '<tr><td colspan="3" class="p-3 text-center text-slate-400">Sin datos de visitas aún</td></tr>';
      }

      // Top menos
      const menosBody = document.getElementById('admin-top-menos-body');
      if (menosBody) {
        menosBody.innerHTML = (data.top_menos_visitados || []).map(l => `
          <tr class="hover:bg-slate-50">
            <td class="p-3 font-bold text-slate-800">${l.nombre}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">${l.categoria}</span></td>
            <td class="p-3 text-right font-black text-rose-600">${l.total_visitas || 0} visitas</td>
          </tr>
        `).join('') || '<tr><td colspan="3" class="p-3 text-center text-slate-400">Sin datos de visitas aún</td></tr>';
      }

      // Canjes
      const canjesBody = document.getElementById('admin-canjes-historial-body');
      if (canjesBody) {
        canjesBody.innerHTML = (data.historial_canjes || []).map(c => `
          <tr class="hover:bg-slate-50">
            <td class="p-3 font-mono font-bold text-sky-700">${c.codigo_unico}</td>
            <td class="p-3 text-slate-800 font-medium">${c.turista_nombre}</td>
            <td class="p-3 text-slate-700">${c.beneficio_nombre}</td>
            <td class="p-3 font-bold text-amber-600">${c.puntos_gastados} pts</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded ${c.estado === 'CONFIRMADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} text-[10px] font-bold">${c.estado}</span></td>
          </tr>
        `).join('') || '<tr><td colspan="5" class="p-3 text-center text-slate-400">Sin canjes registrados</td></tr>';
      }
    }
  } catch(e) {
    console.error(e);
  }
}

async function loadAdminPlaces() {
  try {
    const res = await fetch('/api/lugares');
    const data = await res.json();
    state.lugares = data.lugares || [];
    renderAdminLugaresTable();
  } catch(e) {
    console.error(e);
  }
}

function renderAdminLugaresTable() {
  const tbody = document.getElementById('admin-lugares-table-body');
  if (!tbody) return;

  tbody.innerHTML = state.lugares.map(l => {
    const pts = l.puntos_otorgados || l.puntos || 50;
    const loc = l.direccion || 'San Salvador de Jujuy';
    const preg = l.pregunta_verificacion || l.pregunta_trivia || 'N/A';
    return `
    <tr class="hover:bg-slate-50 transition">
      <td class="p-4 font-bold text-slate-900">${l.nombre}</td>
      <td class="p-4"><span class="px-2 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] uppercase font-bold">${l.categoria}</span></td>
      <td class="p-4 font-bold text-amber-600">+${pts} pts</td>
      <td class="p-4 text-slate-600 text-xs flex items-center gap-1 mt-3">
        <i class="fa-solid fa-location-dot text-emerald-600"></i> ${loc}
      </td>
      <td class="p-4 text-slate-600 text-xs">${preg}</td>
      <td class="p-4 text-right">
        <button onclick="window.deleteAdminPlace(${l.id})" class="text-rose-600 hover:text-rose-700 text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 transition">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `;
  }).join('');
}

window.openNewPlaceModal = function() {
  document.getElementById('modal-admin-place').classList.remove('hidden');
};

window.saveAdminPlace = async function(e) {
  e.preventDefault();
  const nombre = document.getElementById('admin-place-nombre').value.trim();
  const descripcion = document.getElementById('admin-place-desc').value.trim();
  const categoria = document.getElementById('admin-place-cat').value.trim();
  const puntos = parseInt(document.getElementById('admin-place-puntos').value);
  const latitud = parseFloat(document.getElementById('admin-place-lat').value);
  const longitud = parseFloat(document.getElementById('admin-place-lng').value);
  const pregunta_trivia = document.getElementById('admin-place-preg').value.trim();
  const respuesta_trivia = document.getElementById('admin-place-resp').value.trim();

  try {
    const res = await fetch('/api/admin/lugares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, descripcion, categoria, puntos, latitud, longitud, pregunta_trivia, respuesta_trivia })
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert('¡Atracción guardada con éxito!');
      window.closeModal('modal-admin-place');
      loadAdminPlaces();
    } else {
      alert(data.message || 'Error al guardar');
    }
  } catch(err) {
    alert('Error al conectar con el servidor.');
  }
};

window.deleteAdminPlace = async function(id) {
  if (!confirm('¿Estás seguro de eliminar esta atracción?')) return;
  try {
    const res = await fetch('/api/admin/lugares/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.status === 'success') {
      loadAdminPlaces();
    }
  } catch(e) {
    alert('Error al eliminar');
  }
};

async function loadAdminBenefits() {
  try {
    const res = await fetch('/api/beneficios');
    const data = await res.json();
    state.beneficios = data.beneficios || [];
    renderAdminBenefitsTable();
  } catch(e) {
    console.error(e);
  }
}

function renderAdminBenefitsTable() {
  const tbody = document.getElementById('admin-beneficios-table-body');
  if (!tbody) return;

  tbody.innerHTML = state.beneficios.map(b => `
    <tr class="hover:bg-slate-50 transition">
      <td class="p-4 font-bold text-slate-900">${b.nombre}</td>
      <td class="p-4"><span class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] uppercase font-bold border border-rose-200">${b.comercio}</span></td>
      <td class="p-4 font-bold text-amber-600">${b.puntos_necesarios} pts</td>
      <td class="p-4 text-right">
        <button onclick="window.deleteAdminBenefit(${b.id})" class="text-rose-600 hover:text-rose-700 text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 transition">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

window.openNewBenefitModal = function() {
  document.getElementById('modal-admin-benefit').classList.remove('hidden');
};

window.saveAdminBenefit = async function(e) {
  e.preventDefault();
  const nombre = document.getElementById('admin-ben-titulo').value.trim();
  const descripcion = document.getElementById('admin-ben-desc').value.trim();
  const comercio = document.getElementById('admin-ben-comercio').value.trim();
  const puntos_necesarios = parseInt(document.getElementById('admin-ben-puntos').value);

  try {
    const res = await fetch('/api/admin/beneficios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, tipo: 'Descuento', descripcion, puntos_necesarios, comercio })
    });
    const data = await res.json();
    if (data.status === 'success') {
      alert('¡Beneficio guardado!');
      window.closeModal('modal-admin-benefit');
      loadAdminBenefits();
    } else {
      alert(data.message || 'Error al guardar');
    }
  } catch(err) {
    alert('Error al conectar con el servidor.');
  }
};

window.deleteAdminBenefit = async function(id) {
  if (!confirm('¿Estás seguro de eliminar este beneficio?')) return;
  try {
    const res = await fetch('/api/admin/beneficios/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.status === 'success') {
      loadAdminBenefits();
    }
  } catch(e) {
    alert('Error al eliminar');
  }
};

async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/usuarios');
    const data = await res.json();
    state.usuarios = data.usuarios || [];
    renderAdminUsersTable();
  } catch(e) {
    console.error(e);
  }
}

function renderAdminUsersTable() {
  const tbody = document.getElementById('admin-usuarios-table-body');
  if (!tbody) return;

  tbody.innerHTML = state.usuarios.map(u => `
    <tr class="hover:bg-slate-50 transition">
      <td class="p-4 font-mono text-slate-400">#${u.id}</td>
      <td class="p-4 font-bold text-slate-900">${u.nombre}</td>
      <td class="p-4 text-slate-600 font-mono text-xs">${u.email}</td>
      <td class="p-4"><span class="px-2 py-0.5 rounded ${u.rol === 'admin' ? 'bg-rose-100 text-rose-700' : u.rol === 'residente' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'} text-[10px] uppercase font-bold">${u.rol}</span></td>
      <td class="p-4 font-bold text-amber-600">${u.puntos_turista || 0} pts</td>
    </tr>
  `).join('');
}

function refreshData() {
  if (!state.user) return;
  if (state.user.rol === 'turista') {
    loadLugares();
    loadBeneficios();
  } else if (state.user.rol === 'residente') {
    loadRecomendaciones();
  } else if (state.user.rol === 'admin') {
    loadAdminData();
  }
}
