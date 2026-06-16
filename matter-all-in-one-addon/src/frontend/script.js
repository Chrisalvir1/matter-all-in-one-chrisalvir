/**
 * Matter 1.5 Bridge · Liquid Glass UI · script.js
 * Frontend logic: polling, device cards, HomeKit 2026 type modal, QR code.
 */

'use strict';

// ── API Base ──────────────────────────────────────────────────
const API = '/api/custom';

// ── State ─────────────────────────────────────────────────────
let bridgeQrCode = '';
let bridgeManualCode = '';
let qrBridgeRendered = false;
let modalQrRendered = false;
let devicesList = [];
let activeDevice = null;
let pendingConfirm = null;

// ── HomeKit 2026 Type Map ──────────────────────────────────────
const HK_TYPES = {
  light: [
    { id: 'dimmableLight',           name: '💡 Luz Regulable',              desc: 'Luz con control de On/Off y brillo (Dimmable Light). Compatible con escenas y automatizaciones.' },
    { id: 'colorTemperatureLight',   name: '💡 Luz de Temperatura de Color', desc: 'Brillo + temperatura de color (2700K–6500K). Ideal para tiras LED blancas y bombillas CCT.' },
    { id: 'extendedColorLight',      name: '💡 Luz RGBW Completa',          desc: 'Control total RGB + blanco cálido/frío. Máxima compatibilidad con luz de color.' },
    { id: 'onOffLight',              name: '💡 Luz Simple On/Off',           desc: 'Solo encendido y apagado. Sin regulación de brillo. Para luces de interruptor simples.' },
  ],
  switch: [
    { id: 'onOffPlugInUnit',         name: '🔌 Enchufe Inteligente',         desc: 'Exponer como enchufe enchufable On/Off. Aparece en la sección "Enchufes" de Apple Home.' },
    { id: 'onOffLight',              name: '💡 Interruptor como Luz',        desc: 'Exponer el switch como una luz simple. Útil para interruptores de tira LED sin dimmer.' },
  ],
  cover: [
    { id: 'windowCovering',          name: '🪟 Persiana / Cortina',          desc: 'Window Covering (Matter 1.5): control de posición y tilt. Compatible con persianas, estores y cortinas motorizadas.' },
    { id: 'closure',                 name: '🚪 Cerramiento Unificado',       desc: 'Closure Unified (Matter 1.5): puertas de garaje, puertas de entrada, verjas automatizadas.' },
  ],
  lock: [
    { id: 'doorLock',                name: '🔒 Cerradura de Puerta',         desc: 'Door Lock con soporte de credenciales PIN y acceso temporal. Fully compatible HomeKit 2026.' },
  ],
  climate: [
    { id: 'thermostat',              name: '❄️ Termostato HVAC',             desc: 'Control de temperatura, modo calor/frío/auto y humedad. Compatible con todos los termostatos Matter.' },
  ],
  sensor: [
    { id: 'temperatureSensor',       name: '🌡️ Sensor de Temperatura',      desc: 'Temperature Sensor (Matter 1.5). Reporta grados Celsius en tiempo real.' },
    { id: 'humiditySensor',          name: '💧 Sensor de Humedad Relativa',  desc: 'Relative Humidity Sensor. Muestra porcentaje de humedad en Apple Home / Google Home.' },
    { id: 'lightSensor',             name: '☀️ Sensor de Luminosidad',       desc: 'Light Sensor (Lux). Permite automatizaciones basadas en nivel de luz ambiente.' },
    { id: 'pressureSensor',          name: '📊 Sensor de Presión',           desc: 'Pressure Sensor (hPa). Para estaciones meteorológicas y sensores de aire.' },
    { id: 'flowSensor',              name: '💧 Sensor de Flujo de Agua',     desc: 'Flow Sensor. Medición de caudal de agua en sistemas de riego y fontanería.' },
    { id: 'occupancySensor',         name: '👤 Sensor de Presencia/Ocupación', desc: 'Occupancy Sensor. Detección de presencia para automatizaciones de iluminación.' },
  ],
  binary_sensor: [
    { id: 'contactSensor',           name: '🚪 Sensor de Contacto',          desc: 'Detecta apertura y cierre de puertas, ventanas y cajones. Activa automatizaciones.' },
    { id: 'occupancySensor',         name: '👤 Sensor de Movimiento/Presencia', desc: 'Motion / Occupancy Sensor. Para detectar presencia en habitaciones y zonas.' },
  ],
  camera: [
    { id: 'camera',                  name: '📹 Cámara de Red',               desc: 'Network Camera (Matter 1.5). Visualización de vídeo en tiempo real en Apple Home y Google Home.' },
  ],
  input_boolean: [
    { id: 'onOffPlugInUnit',         name: '🔌 Interruptor Virtual (Enchufe)', desc: 'Exponer el input_boolean como un enchufe virtual On/Off.' },
    { id: 'onOffLight',              name: '💡 Interruptor Virtual (Luz)',    desc: 'Exponer el input_boolean como una luz simple On/Off.' },
  ],
  fan: [
    { id: 'onOffPlugInUnit',         name: '🌀 Ventilador Simple',            desc: 'Ventilador como enchufe On/Off. Para ventiladores sin control de velocidad.' },
  ],
  vacuum: [
    { id: 'onOffPlugInUnit',         name: '🤖 Aspiradora Robot (básico)',    desc: 'Exponer la aspiradora como enchufe On/Off para control de inicio/pausa simple.' },
  ],
  media_player: [
    { id: 'onOffPlugInUnit',         name: '📺 Media Player (On/Off)',        desc: 'Exponer el reproductor multimedia como enchufe inteligente para control de energía.' },
  ],
};

const DOMAIN_ICONS = {
  light: '💡', switch: '🔌', cover: '🪟', lock: '🔒', climate: '❄️',
  sensor: '🌡️', binary_sensor: '🚨', camera: '📹', fan: '🌀',
  input_boolean: '🔘', vacuum: '🤖', media_player: '📺',
  automation: '⚡', script: '📜', scene: '🎨',
};
const DEFAULT_ICON = '🔧';

function domainIcon(domain) {
  return DOMAIN_ICONS[domain] || DEFAULT_ICON;
}

// ── DOM References ─────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// Sidebar nav
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

// Bridge tab
const qrCanvas       = $('qrcode-canvas');
const qrLoading      = $('qr-loading');
const manualCode     = $('manual-code');
const copyBtn        = $('copy-btn');
const commBanner     = $('commissioned-banner');
const statusOrb      = $('status-orb');
const statusTitle    = $('status-title');
const statusDesc     = $('status-desc');
const haDot          = $('ha-dot');
const haStatusText   = $('ha-status-text');
const fabricCount    = $('fabric-count');
const sysOs          = $('sys-os');
const sysNode        = $('sys-node');
const sysUptime      = $('sys-uptime');
const sysCpu         = $('sys-cpu');
const sysMem         = $('sys-mem');

// Devices tab
const deviceGrid     = $('device-grid');
const deviceSearch   = $('device-search');
const deviceBadge    = $('device-count-badge');

// Device modal
const deviceModal    = $('device-modal');
const modalClose     = $('modal-close');
const modalIcon      = $('modal-icon');
const modalName      = $('modal-device-name');
const modalEntityId  = $('modal-entity-id');
const modalStatePill = $('modal-state');
const modalDomain    = $('modal-domain');
const modalMatterType = $('modal-matter-type');
const modalHaState   = $('modal-ha-state');
const hkSelect       = $('hk-type-select');
const hkTypeInfo     = $('hk-type-info');
const saveTypeBtn    = $('save-type-btn');
const saveFeedback   = $('save-feedback');
const modalQrEl      = $('modal-qrcode');
const modalQrPh      = $('modal-qr-placeholder');
const modalManual    = $('modal-manual-code');
const modalCopyBtn   = $('modal-copy-btn');

// Confirm modal
const confirmModal   = $('confirm-modal');
const confirmTitle   = $('confirm-title');
const confirmDesc    = $('confirm-desc');
const confirmOk      = $('confirm-ok');
const confirmCancel  = $('confirm-cancel');

// Settings
const restartBtn     = $('restart-btn');
const factoryBtn     = $('factoryreset-btn');

// ── Tab Navigation ─────────────────────────────────────────────
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    navItems.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(targetTab);
    if (panel) panel.classList.add('active');
    if (targetTab === 'tab-devices') fetchDevices();
  });
});

// ── QR Rendering ───────────────────────────────────────────────
function renderQR(container, text, size = 180) {
  container.innerHTML = '';
  if (!text || typeof QRCode === 'undefined') return false;
  try {
    new QRCode(container, {
      text,
      width: size, height: size,
      colorDark: '#0a0c18',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    return true;
  } catch(e) {
    console.error('QR render error:', e);
    return false;
  }
}

// ── Status Polling ─────────────────────────────────────────────
async function fetchStatus() {
  try {
    const res = await fetch(`${API}/status`);
    if (!res.ok) throw new Error('status error');
    const d = await res.json();

    // HA badge
    const connected = d.haStatus === 'conectado';
    haDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    haStatusText.textContent = connected ? 'HA Conectado' : 'HA Desconectado';

    // QR
    if (d.qrPairingCode && d.qrPairingCode !== bridgeQrCode) {
      bridgeQrCode = d.qrPairingCode;
      qrBridgeRendered = false;
    }
    bridgeManualCode = d.manualPairingCode || '';
    manualCode.textContent = bridgeManualCode || '---- --- ----';

    if (!qrBridgeRendered && bridgeQrCode) {
      const ok = renderQR(qrCanvas, bridgeQrCode, 198);
      if (ok) {
        qrLoading.style.display = 'none';
        qrCanvas.style.display = 'block';
        qrBridgeRendered = true;
      }
    }

    // Commissioned banner
    if (d.commissioned) {
      commBanner.style.display = 'flex';
    } else {
      commBanner.style.display = 'none';
    }

    // Fabric count
    const fc = Array.isArray(d.pairedFabrics) ? d.pairedFabrics.length : 0;
    fabricCount.textContent = fc;

    // Status orb
    statusOrb.className = 'status-orb ' + (d.commissioned ? 'connected' : (d.status === 'esperando' ? 'waiting' : ''));
    statusOrb.querySelector('#status-orb-label').textContent = d.commissioned ? 'OK' : (d.status === 'esperando' ? 'Pair' : '…');
    if (d.commissioned) {
      statusTitle.textContent = 'Puente Vinculado';
      statusDesc.textContent = 'El puente está emparejado y funcionando con normalidad.';
    } else if (d.status === 'esperando') {
      statusTitle.textContent = 'Esperando Vinculación';
      statusDesc.textContent = 'Listo para emparejar. Escanea el código QR de la izquierda.';
    } else {
      statusTitle.textContent = 'Iniciando Servicio';
      statusDesc.textContent = 'El puente Matter se está iniciando. Por favor espera...';
    }

    // System info
    sysOs.textContent     = d.systemInfo?.os          || 'Linux';
    sysNode.textContent   = d.systemInfo?.nodeVersion  || '-';
    sysUptime.textContent = d.systemInfo?.uptime       || '-';
    sysCpu.textContent    = d.systemInfo?.cpu          || '-';
    sysMem.textContent    = d.systemInfo?.memory       || '-';

  } catch(e) {
    haDot.className = 'status-dot disconnected';
    haStatusText.textContent = 'Sin conexión';
  }
}

// ── Devices ───────────────────────────────────────────────────
async function fetchDevices() {
  try {
    const res = await fetch(`${API}/devices`);
    if (!res.ok) throw new Error('devices error');
    devicesList = await res.json();
    renderDeviceCards(devicesList);
    // update badge
    deviceBadge.textContent = devicesList.length;
    deviceBadge.classList.toggle('show', devicesList.length > 0);
  } catch(e) {
    deviceGrid.innerHTML = `<div class="devices-empty"><p style="color:var(--accent-r)">Error al cargar dispositivos.</p></div>`;
  }
}

function stateClass(state) {
  const s = (state || '').toLowerCase();
  if (s === 'on' || s === 'home' || s === 'open' || s === 'unlocked' || s === 'playing') return 'on';
  if (s === 'off' || s === 'away' || s === 'closed' || s === 'locked' || s === 'idle') return 'off';
  return '';
}

function renderDeviceCards(list) {
  if (!list || list.length === 0) {
    deviceGrid.innerHTML = `<div class="devices-empty"><p>No se encontraron dispositivos. Asegúrate de que Home Assistant esté conectado y tenga entidades compatibles.</p></div>`;
    return;
  }
  deviceGrid.innerHTML = '';
  list.forEach(device => {
    const card = document.createElement('button');
    card.className = 'device-card';
    card.setAttribute('aria-label', `Ver detalles de ${device.friendlyName}`);
    const icon = domainIcon(device.domain);
    const sc   = stateClass(device.state);
    card.innerHTML = `
      <div class="dc-icon">${icon}</div>
      <div class="dc-name">${esc(device.friendlyName)}</div>
      <div class="dc-entity">${esc(device.entityId)}</div>
      <div class="dc-footer">
        <span class="dc-state-pill ${sc}">${esc(device.state)}</span>
        <span class="dc-type-pill">${esc(device.matterType || 'Matter')}</span>
      </div>
      <span class="dc-arrow">›</span>
    `;
    card.addEventListener('click', () => openDeviceModal(device));
    deviceGrid.appendChild(card);
  });
}

// Search filter
deviceSearch.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderDeviceCards(devicesList); return; }
  const filtered = devicesList.filter(d =>
    d.friendlyName.toLowerCase().includes(q) ||
    d.entityId.toLowerCase().includes(q) ||
    (d.matterType || '').toLowerCase().includes(q)
  );
  renderDeviceCards(filtered);
});

// ── Device Detail Modal ────────────────────────────────────────
function openDeviceModal(device) {
  activeDevice = device;
  modalQrRendered = false;

  // Populate header
  const icon = domainIcon(device.domain);
  modalIcon.textContent = icon;
  modalName.textContent = device.friendlyName;
  modalEntityId.textContent = device.entityId;
  const sc = stateClass(device.state);
  modalStatePill.textContent = device.state;
  modalStatePill.className = `modal-state-pill ${sc}`;

  // Info rows
  modalDomain.textContent    = device.domain;
  modalMatterType.textContent = device.matterType || '-';
  modalHaState.textContent   = device.state;

  // Build HomeKit 2026 type dropdown
  const types = HK_TYPES[device.domain] || [];
  hkSelect.innerHTML = '';
  if (types.length === 0) {
    hkSelect.innerHTML = '<option value="">— Tipo no configurable para este dominio —</option>';
    hkSelect.disabled = true;
    saveTypeBtn.disabled = true;
  } else {
    hkSelect.disabled = false;
    saveTypeBtn.disabled = false;
    types.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      // Try to pre-select the current matter type
      if (device.matterType && device.matterType.toLowerCase() === t.id.toLowerCase()) {
        opt.selected = true;
      } else if (i === 0 && !types.some(x => x.id.toLowerCase() === (device.matterType||'').toLowerCase())) {
        opt.selected = true;
      }
      hkSelect.appendChild(opt);
    });
    updateHkTypeInfo();
  }

  // QR in modal
  modalQrEl.innerHTML = '';
  if (bridgeQrCode) {
    modalQrPh.style.display = 'none';
    modalQrEl.style.display = 'block';
    const ok = renderQR(modalQrEl, bridgeQrCode, 168);
    if (!ok) {
      modalQrPh.style.display = 'flex';
      modalQrEl.style.display = 'none';
    } else {
      modalQrRendered = true;
    }
  } else {
    modalQrPh.style.display = 'flex';
    modalQrEl.style.display = 'none';
  }
  modalManual.textContent = bridgeManualCode || '---- --- ----';

  saveFeedback.textContent = '';
  saveFeedback.className = 'save-feedback';

  // Open modal
  deviceModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDeviceModal() {
  deviceModal.classList.remove('open');
  document.body.style.overflow = '';
  activeDevice = null;
}

function updateHkTypeInfo() {
  const domain = activeDevice?.domain;
  if (!domain) return;
  const types = HK_TYPES[domain] || [];
  const selected = types.find(t => t.id === hkSelect.value);
  hkTypeInfo.textContent = selected ? selected.desc : 'Selecciona un tipo para ver la descripción.';
}

hkSelect.addEventListener('change', updateHkTypeInfo);

modalClose.addEventListener('click', closeDeviceModal);
deviceModal.addEventListener('click', (e) => {
  if (e.target === deviceModal) closeDeviceModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDeviceModal();
});

// Save HomeKit type override
saveTypeBtn.addEventListener('click', async () => {
  if (!activeDevice) return;
  const selectedId = hkSelect.value;
  if (!selectedId) return;

  saveTypeBtn.disabled = true;
  saveFeedback.textContent = 'Guardando...';
  saveFeedback.className = 'save-feedback';

  try {
    const res = await fetch(`${API}/device-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: activeDevice.entityId, matterType: selectedId }),
    });
    if (res.ok) {
      saveFeedback.textContent = '✅ Tipo guardado. Reinicia el puente para aplicar.';
      saveFeedback.className = 'save-feedback success';
      // Update local list so the card reflects the override
      const idx = devicesList.findIndex(d => d.entityId === activeDevice.entityId);
      if (idx !== -1) devicesList[idx].matterType = selectedId;
    } else {
      saveFeedback.textContent = '⚠️ No se pudo guardar. Intenta reiniciar el puente.';
      saveFeedback.className = 'save-feedback error';
    }
  } catch(e) {
    saveFeedback.textContent = '❌ Error de conexión al guardar el tipo.';
    saveFeedback.className = 'save-feedback error';
  } finally {
    saveTypeBtn.disabled = false;
  }
});

// Copy bridge QR code in modal
modalCopyBtn.addEventListener('click', () => {
  const code = modalManual.textContent;
  if (code && code !== '---- --- ----') {
    navigator.clipboard.writeText(code).then(() => {
      modalCopyBtn.textContent = '✓';
      setTimeout(() => { modalCopyBtn.textContent = '📋'; }, 2000);
    });
  }
});

// Copy in bridge tab
copyBtn.addEventListener('click', () => {
  const code = manualCode.textContent;
  if (code && code !== '---- --- ----') {
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.textContent = '✓';
      setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
    });
  }
});

// ── Confirm Dialog ─────────────────────────────────────────────
function showConfirm(title, desc, onConfirm) {
  confirmTitle.textContent = title;
  confirmDesc.textContent = desc;
  confirmModal.classList.add('open');
  pendingConfirm = onConfirm;
}
confirmCancel.addEventListener('click', () => {
  confirmModal.classList.remove('open');
  pendingConfirm = null;
});
confirmOk.addEventListener('click', async () => {
  confirmModal.classList.remove('open');
  if (pendingConfirm) {
    await pendingConfirm();
    pendingConfirm = null;
  }
});

// ── Restart / Factory Reset ────────────────────────────────────
restartBtn.addEventListener('click', () => {
  showConfirm(
    '¿Reiniciar el Puente?',
    'El complemento de Home Assistant se reiniciará limpiamente. Esto tarda unos segundos.',
    async () => {
      try {
        const r = await fetch(`${API}/restart`, { method: 'POST' });
        if (r.ok) {
          setTimeout(() => window.location.reload(), 3000);
        }
      } catch(e) { console.error(e); }
    }
  );
});

factoryBtn.addEventListener('click', () => {
  showConfirm(
    '¿Restablecer de Fábrica?',
    'Se borrarán PERMANENTEMENTE todos los emparejamientos Matter actuales. Tendrás que escanear el QR de nuevo para vincular Apple Home, Google Home o Alexa.',
    async () => {
      try {
        const r = await fetch(`${API}/factoryreset`, { method: 'POST' });
        if (r.ok) {
          setTimeout(() => window.location.reload(), 4000);
        }
      } catch(e) { console.error(e); }
    }
  );
});

// ── Utility ───────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Init & Polling ─────────────────────────────────────────────
fetchStatus();
setInterval(fetchStatus, 5000);

// Preload devices when page loads
fetchDevices();
setInterval(() => {
  const devPanel = document.getElementById('tab-devices');
  if (devPanel && devPanel.classList.contains('active')) fetchDevices();
}, 10000);
