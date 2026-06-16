/**
 * Matter 1.5 Bridge · Liquid Glass UI · script.js
 * v2 — Vista jerárquica: Dispositivo HA → Entidades seleccionables
 */

'use strict';

// ── API Base ──────────────────────────────────────────────────
const API = './api/custom';

// ── State ─────────────────────────────────────────────────────
let bridgeQrCode      = '';
let bridgeManualCode  = '';
let qrBridgeRendered  = false;
let modalQrRendered   = false;
let allEntities       = [];   // lista plana de entidades desde API
let deviceMap         = {};   // { deviceId: { name, area, entities[] } }
let activeDevice      = null; // dispositivo HA activo en modal
let pendingConfirm    = null;

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
    { id: 'doorLock',                name: '🔒 Cerradura de Puerta',         desc: 'Door Lock con soporte de credenciales PIN y acceso temporal. Compatible HomeKit 2026.' },
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
    { id: 'occupancySensor',         name: '👤 Sensor de Presencia',         desc: 'Occupancy Sensor. Detección de presencia para automatizaciones de iluminación.' },
    { id: 'soilMoistureSensor',      name: '🌱 Sensor de Humedad de Suelo',  desc: 'Soil Moisture Sensor (Matter 1.5). Para sistemas de riego automático y jardinería.' },
  ],
  binary_sensor: [
    { id: 'contactSensor',           name: '🚪 Sensor de Contacto',          desc: 'Detecta apertura y cierre de puertas, ventanas y cajones.' },
    { id: 'occupancySensor',         name: '👤 Sensor de Movimiento/Presencia', desc: 'Motion / Occupancy Sensor. Para detectar presencia en habitaciones y zonas.' },
  ],
  camera: [
    { id: 'camera',                  name: '📹 Cámara de Red',               desc: 'Network Camera (Matter 1.5). Visualización de vídeo en tiempo real en Apple Home.' },
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
  vacuum: '🤖', media_player: '📺', input_boolean: '🎛️',
  script: '⚡', automation: '🔄', scene: '🎨',
};

const DOMAIN_PRIORITY = [
  'light','switch','cover','lock','climate','camera',
  'fan','vacuum','media_player','binary_sensor','sensor','input_boolean',
];

function domainIcon(domain) {
  return DOMAIN_ICONS[domain] || '🔷';
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const $ = id => document.getElementById(id);

// ── DOM refs ──────────────────────────────────────────────────
const navItems   = document.querySelectorAll('.nav-item');
const tabPanels  = document.querySelectorAll('.tab-panel');

// Bridge tab
const qrCanvas      = $('qrcode-canvas');
const qrLoading     = $('qr-loading');
const manualCode    = $('manual-code');
const copyBtn       = $('copy-btn');
const commBanner    = $('commissioned-banner');
const statusOrb     = $('status-orb');
const statusTitle   = $('status-title');
const statusDesc    = $('status-desc');
const haDot         = $('ha-dot');
const haStatusText  = $('ha-status-text');

// Devices tab
const deviceGrid    = $('device-grid');
const deviceSearch  = $('device-search');
const deviceBadge   = $('device-count-badge');

// Device modal (entidades del dispositivo)
const deviceModal       = $('device-modal');
const modalClose        = $('modal-close');
const modalIcon         = $('modal-icon');
const modalName         = $('modal-device-name');
const modalEntityId     = $('modal-entity-id');  // usaremos para área/modelo
const modalStatePill    = $('modal-state');
const modalDomain       = $('modal-domain');
const modalMatterType   = $('modal-matter-type');
const modalHaState      = $('modal-ha-state');
const hkSelect          = $('hk-type-select');
const hkTypeInfo        = $('hk-type-info');
const saveTypeBtn       = $('save-type-btn');
const saveFeedback      = $('save-feedback');
const modalQrEl         = $('modal-qrcode');
const modalQrPh         = $('modal-qr-placeholder');
const modalManual       = $('modal-manual-code');
const modalCopyBtn      = $('modal-copy-btn');
const modalQrDeviceName = $('modal-qr-device-name');

// Confirm modal
const confirmModal  = $('confirm-modal');
const confirmTitle  = $('confirm-title');
const confirmDesc   = $('confirm-desc');
const confirmOk     = $('confirm-ok');
const confirmCancel = $('confirm-cancel');

// Advanced / Settings
const advancedBtn   = $('advanced-btn');
const advancedModal = $('advanced-modal');
const advModalClose = $('adv-modal-close');
const restartBtn    = $('restart-btn');
const factoryBtn    = $('factoryreset-btn');

// ── Tab Navigation ────────────────────────────────────────────
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

// ── QR Rendering ──────────────────────────────────────────────
function renderQR(container, text, size = 180) {
  container.innerHTML = '';
  if (!text || typeof QRCode === 'undefined') return false;
  try {
    new QRCode(container, {
      text, width: size, height: size,
      colorDark: '#0a0c18', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    return true;
  } catch(e) {
    console.error('QR render error:', e);
    return false;
  }
}

// ── Status Polling ────────────────────────────────────────────
async function fetchStatus() {
  try {
    const res = await fetch(`${API}/status`);
    if (!res.ok) throw new Error('status error');
    const d = await res.json();

    const connected = d.haStatus === 'conectado';
    haDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    haStatusText.textContent = connected ? 'HA Conectado' : 'HA Desconectado';

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

    commBanner.style.display = d.commissioned ? 'flex' : 'none';
    statusOrb.className = 'status-orb ' + (d.commissioned ? 'connected' : (d.status === 'esperando' ? 'waiting' : ''));
    statusOrb.querySelector('#status-orb-label').textContent = d.commissioned ? 'OK' : (d.status === 'esperando' ? 'Pair' : '…');

    if (d.commissioned) {
      statusTitle.textContent = 'Puente Vinculado';
      statusDesc.textContent  = 'El puente está emparejado y funcionando con normalidad.';
    } else if (d.status === 'esperando') {
      statusTitle.textContent = 'Esperando Vinculación';
      statusDesc.textContent  = 'Listo para emparejar. Escanea el código QR de la izquierda.';
    } else {
      statusTitle.textContent = 'Iniciando Servicio';
      statusDesc.textContent  = 'El puente Matter se está iniciando. Por favor espera...';
    }
  } catch(e) {
    haDot.className = 'status-dot disconnected';
    haStatusText.textContent = 'Sin conexión';
  }
}

// ── Agrupación de entidades por dispositivo HA ────────────────
/**
 * Toma la lista plana de entidades y las agrupa por device_id.
 * Si una entidad no tiene device_id, se agrupa por dominio.
 * Devuelve un Map ordenado: dispositivos reales primero,
 * luego grupos por dominio (entidades sin dispositivo HA).
 */
function groupEntitiesByDevice(entities) {
  const grouped = new Map();

  for (const entity of entities) {
    // El backend puede enviar device_id, device_name, area_name
    const devId   = entity.device_id || `__domain_${entity.domain}`;
    const devName = entity.device_name || entity.device_id
                    ? (entity.device_name || entity.device_id)
                    : `${entity.domain.charAt(0).toUpperCase() + entity.domain.slice(1)}s`;
    const area    = entity.area_name || '';

    if (!grouped.has(devId)) {
      // Determinar icono principal del dispositivo por la primera entidad
      grouped.set(devId, {
        id: devId,
        name: devName,
        area,
        isVirtual: !entity.device_id,   // true = agrupado por dominio, sin dispositivo real
        entities: [],
      });
    }
    grouped.get(devId).entities.push(entity);
  }

  // Ordenar: dispositivos reales primero, luego virtuales; dentro por nombre
  return [...grouped.values()].sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

// ── Icono representativo del dispositivo (dominio más relevante) ─
function deviceRepresentativeIcon(device) {
  const domains = device.entities.map(e => e.domain);
  for (const p of DOMAIN_PRIORITY) {
    if (domains.includes(p)) return domainIcon(p);
  }
  return domainIcon(domains[0]);
}

// ── Cuenta de entidades exportadas en un dispositivo ─────────
function exportedCount(device) {
  return device.entities.filter(e => e.exported).length;
}

// ── Fetch y render principal ──────────────────────────────────
async function fetchDevices() {
  deviceGrid.innerHTML = `<div class="devices-empty" id="devices-loading"><div class="spinner large"></div><p>Cargando dispositivos...</p></div>`;
  try {
    const res = await fetch(`${API}/devices`);
    if (!res.ok) throw new Error('devices error');
    allEntities = await res.json();
    renderDeviceGroups(allEntities, '');
  } catch(e) {
    deviceGrid.innerHTML = `<div class="devices-empty"><p style="color:var(--accent-r)">Error al cargar dispositivos. Verifica la conexión con Home Assistant.</p></div>`;
  }
}

function stateClass(state) {
  const s = (state || '').toLowerCase();
  if (s === 'on' || s === 'home' || s === 'open' || s === 'unlocked' || s === 'playing') return 'on';
  if (s === 'off' || s === 'away' || s === 'closed' || s === 'locked' || s === 'idle')   return 'off';
  return '';
}

// ── Render lista de dispositivos agrupados ────────────────────
function renderDeviceGroups(entities, searchQuery) {
  const q = (searchQuery || '').toLowerCase().trim();

  // Filtrar entidades si hay búsqueda
  const filtered = q
    ? entities.filter(e =>
        e.friendlyName.toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q) ||
        (e.device_name || '').toLowerCase().includes(q) ||
        (e.area_name || '').toLowerCase().includes(q) ||
        (e.matterType || '').toLowerCase().includes(q)
      )
    : entities;

  const devices = groupEntitiesByDevice(filtered);

  // Actualizar badge con número de dispositivos reales
  const realDeviceCount = devices.filter(d => !d.isVirtual).length;
  const totalDevices = devices.length;
  deviceBadge.textContent = totalDevices;
  deviceBadge.classList.toggle('show', totalDevices > 0);

  if (devices.length === 0) {
    deviceGrid.innerHTML = q
      ? `<div class="devices-empty"><p>No se encontraron dispositivos para "${esc(q)}".</p></div>`
      : `<div class="devices-empty"><p>No se encontraron dispositivos. Asegúrate de que Home Assistant esté conectado.</p></div>`;
    return;
  }

  deviceGrid.innerHTML = '';

  // Si hay búsqueda, mostrar contador de resultados
  if (q) {
    const info = document.createElement('div');
    info.className = 'search-results-info';
    info.textContent = `${devices.length} dispositivo${devices.length !== 1 ? 's' : ''} · ${filtered.length} entidad${filtered.length !== 1 ? 'es' : ''}`;
    deviceGrid.appendChild(info);
  }

  devices.forEach(device => {
    const card = buildDeviceGroupCard(device);
    deviceGrid.appendChild(card);
  });
}

// ── Construir card de dispositivo (con entidades colapsadas) ──
function buildDeviceGroupCard(device) {
  const wrapper = document.createElement('div');
  wrapper.className = 'device-group-card glass-card';
  wrapper.dataset.deviceId = device.id;

  const exported  = exportedCount(device);
  const total     = device.entities.length;
  const allOn     = device.entities.every(e => (e.state || '').toLowerCase() === 'on' ||
                                               (e.state || '').toLowerCase() === 'home' ||
                                               (e.state || '').toLowerCase() === 'open');
  const anyOn     = device.entities.some(e => (e.state || '').toLowerCase() === 'on' ||
                                              (e.state || '').toLowerCase() === 'open');
  const stateHint = allOn ? 'on' : (anyOn ? 'partial' : 'off');
  const icon      = deviceRepresentativeIcon(device);

  // Dominios únicos para etiquetas
  const uniqueDomains = [...new Set(device.entities.map(e => e.domain))].slice(0, 3);

  wrapper.innerHTML = `
    <div class="dgc-header">
      <div class="dgc-icon-wrap ${stateHint}">
        <span class="dgc-icon">${icon}</span>
      </div>
      <div class="dgc-info">
        <div class="dgc-name">${esc(device.name)}</div>
        ${device.area ? `<div class="dgc-area">📍 ${esc(device.area)}</div>` : ''}
        <div class="dgc-meta">
          ${uniqueDomains.map(d => `<span class="dgc-domain-tag">${esc(d)}</span>`).join('')}
        </div>
      </div>
      <div class="dgc-right">
        <div class="dgc-export-count ${exported > 0 ? 'active' : ''}">
          ${exported}/${total}
          <span class="dgc-export-label">Matter</span>
        </div>
        <div class="dgc-chevron">
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
          </svg>
        </div>
      </div>
    </div>
    <div class="dgc-entities" style="display:none;">
      <div class="dgc-entities-inner"></div>
    </div>
  `;

  // Click en header → expandir/colapsar entidades
  const header      = wrapper.querySelector('.dgc-header');
  const entitiesDiv = wrapper.querySelector('.dgc-entities');
  const entitiesInner = wrapper.querySelector('.dgc-entities-inner');
  const chevron     = wrapper.querySelector('.dgc-chevron');

  header.addEventListener('click', () => {
    const isOpen = entitiesDiv.style.display !== 'none';
    if (isOpen) {
      entitiesDiv.style.display = 'none';
      wrapper.classList.remove('expanded');
      chevron.style.transform = '';
    } else {
      // Renderizar entidades la primera vez
      if (!entitiesInner.dataset.rendered) {
        renderEntityRows(entitiesInner, device);
        entitiesInner.dataset.rendered = '1';
      }
      entitiesDiv.style.display = 'block';
      wrapper.classList.add('expanded');
      chevron.style.transform = 'rotate(90deg)';
    }
  });

  return wrapper;
}

// ── Renderizar filas de entidades dentro del dispositivo ──────
function renderEntityRows(container, device) {
  // Ordenar entidades: exportadas primero, luego por dominio priority, luego por nombre
  const sorted = [...device.entities].sort((a, b) => {
    if (a.exported !== b.exported) return a.exported ? -1 : 1;
    const pa = DOMAIN_PRIORITY.indexOf(a.domain);
    const pb = DOMAIN_PRIORITY.indexOf(b.domain);
    if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return (a.friendlyName || '').localeCompare(b.friendlyName || '');
  });

  sorted.forEach(entity => {
    const row = buildEntityRow(entity, device);
    container.appendChild(row);
  });
}

// ── Construir fila de entidad individual ──────────────────────
function buildEntityRow(entity, device) {
  const row = document.createElement('div');
  row.className = 'entity-row' + (entity.exported ? ' exported' : ' not-exported');
  row.dataset.entityId = entity.entityId;

  const icon = domainIcon(entity.domain);
  const sc   = stateClass(entity.state);
  const types = HK_TYPES[entity.domain] || [];
  const hasConfig = types.length > 0;

  row.innerHTML = `
    <div class="er-icon">${icon}</div>
    <div class="er-info">
      <div class="er-name">${esc(entity.friendlyName)}</div>
      <div class="er-entity-id">${esc(entity.entityId)}</div>
    </div>
    <div class="er-state">
      <span class="er-state-pill ${sc}">${esc(entity.state || '—')}</span>
    </div>
    <div class="er-matter">
      ${entity.exported
        ? `<span class="er-matter-type">${esc(entity.matterType || 'Matter')}</span>`
        : `<span class="er-matter-disabled">No exportado</span>`
      }
    </div>
    <div class="er-controls">
      ${hasConfig
        ? `<button class="er-config-btn" title="Configurar tipo Matter" data-entity-id="${esc(entity.entityId)}">⚙️</button>`
        : ''
      }
      <label class="toggle-switch" title="Exportar a Matter">
        <input type="checkbox" class="export-toggle" ${entity.exported ? 'checked' : ''} data-id="${esc(entity.entityId)}">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;

  // Toggle exportar
  const toggle = row.querySelector('.export-toggle');
  toggle.addEventListener('change', async (e) => {
    const isExported = e.target.checked;
    try {
      const res = await fetch(`${API}/device-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: entity.entityId, exported: isExported }),
      });
      if (res.ok) {
        entity.exported = isExported;
        row.className = 'entity-row' + (isExported ? ' exported' : ' not-exported');
        const matterEl = row.querySelector('.er-matter');
        matterEl.innerHTML = isExported
          ? `<span class="er-matter-type">${esc(entity.matterType || 'Matter')}</span>`
          : `<span class="er-matter-disabled">No exportado</span>`;
        // Actualizar contador del card padre
        updateDeviceCardCounter(device);
      } else {
        e.target.checked = !isExported;
      }
    } catch (err) {
      e.target.checked = !isExported;
    }
  });

  // Botón configurar tipo Matter
  const configBtn = row.querySelector('.er-config-btn');
  if (configBtn) {
    configBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEntityTypeModal(entity, device);
    });
  }

  return row;
}

// ── Actualizar contador Matter del card de dispositivo ────────
function updateDeviceCardCounter(device) {
  const card = document.querySelector(`.device-group-card[data-device-id="${CSS.escape(device.id)}"]`);
  if (!card) return;
  const exported = exportedCount(device);
  const total    = device.entities.length;
  const countEl  = card.querySelector('.dgc-export-count');
  if (countEl) {
    countEl.textContent = '';
    countEl.innerHTML = `${exported}/${total}<span class="dgc-export-label">Matter</span>`;
    countEl.classList.toggle('active', exported > 0);
  }
}

// ── Modal de configuración de tipo Matter para una entidad ────
function openEntityTypeModal(entity, device) {
  activeDevice = { entity, device };
  modalQrRendered = false;

  const icon = domainIcon(entity.domain);
  modalIcon.textContent = icon;
  modalName.textContent = entity.friendlyName;
  modalEntityId.textContent = entity.entityId;

  const sc = stateClass(entity.state);
  modalStatePill.textContent = entity.state || '—';
  modalStatePill.className = `modal-state-pill ${sc}`;

  modalDomain.textContent     = entity.domain;
  modalMatterType.textContent = entity.matterType || '-';
  modalHaState.textContent    = entity.state || '-';
  modalQrDeviceName.textContent = entity.friendlyName;

  // Dropdown de tipos HomeKit
  const types = HK_TYPES[entity.domain] || [];
  hkSelect.innerHTML = '';
  if (types.length === 0) {
    hkSelect.innerHTML = '<option value="">— Tipo no configurable —</option>';
    hkSelect.disabled = true;
    saveTypeBtn.disabled = true;
  } else {
    hkSelect.disabled = false;
    saveTypeBtn.disabled = false;
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (entity.matterType && entity.matterType.toLowerCase().includes(t.id.toLowerCase())) {
        opt.selected = true;
      }
      hkSelect.appendChild(opt);
    });
    updateHkTypeDesc();
  }

  // QR del dispositivo
  modalQrPh.style.display = 'flex';
  modalQrEl.style.display = 'none';
  const code = bridgeManualCode;
  if (code) {
    modalManual.textContent = code;
    const ok = renderQR(modalQrEl, code, 160);
    if (ok) {
      modalQrPh.style.display = 'none';
      modalQrEl.style.display = 'block';
      modalQrRendered = true;
    }
  } else {
    modalManual.textContent = '---- --- ----';
  }

  saveFeedback.textContent = '';
  saveFeedback.className   = 'save-feedback';

  deviceModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function updateHkTypeDesc() {
  const sel = hkSelect.value;
  const domain = activeDevice?.entity?.domain;
  const types  = (domain && HK_TYPES[domain]) || [];
  const t = types.find(x => x.id === sel);
  const descEl = $('hk-type-desc');
  if (descEl) descEl.textContent = t ? t.desc : 'Selecciona un tipo para ver la descripción.';
}

hkSelect && hkSelect.addEventListener('change', updateHkTypeDesc);

// ── Guardar tipo Matter de la entidad ────────────────────────
saveTypeBtn && saveTypeBtn.addEventListener('click', async () => {
  if (!activeDevice) return;
  const { entity } = activeDevice;
  const newType = hkSelect.value;
  if (!newType) return;

  saveTypeBtn.disabled = true;
  saveFeedback.textContent = 'Guardando...';
  saveFeedback.className = 'save-feedback saving';

  try {
    const res = await fetch(`${API}/device-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: entity.entityId, matterType: newType }),
    });
    if (res.ok) {
      entity.matterType = newType;
      modalMatterType.textContent = newType;
      saveFeedback.textContent = '✅ Guardado. Reinicia el puente para aplicar.';
      saveFeedback.className = 'save-feedback success';
      // Actualizar etiqueta en la fila
      const entityRow = document.querySelector(`.entity-row[data-entity-id="${CSS.escape(entity.entityId)}"] .er-matter-type`);
      if (entityRow) entityRow.textContent = newType;
    } else {
      saveFeedback.textContent = '❌ Error al guardar. Intenta de nuevo.';
      saveFeedback.className = 'save-feedback error';
    }
  } catch(e) {
    saveFeedback.textContent = '❌ Sin conexión con el servidor.';
    saveFeedback.className = 'save-feedback error';
  } finally {
    saveTypeBtn.disabled = false;
  }
});

// ── Cerrar modal ──────────────────────────────────────────────
function closeDeviceModal() {
  deviceModal.classList.remove('open');
  document.body.style.overflow = '';
  activeDevice = null;
}

modalClose && modalClose.addEventListener('click', closeDeviceModal);

deviceModal && deviceModal.addEventListener('click', (e) => {
  if (e.target === deviceModal) closeDeviceModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (deviceModal.classList.contains('open')) closeDeviceModal();
    if (confirmModal.classList.contains('open')) closeConfirm();
    if (advancedModal.classList.contains('open')) advancedModal.classList.remove('open');
  }
});

// ── Modal copy button ─────────────────────────────────────────
modalCopyBtn && modalCopyBtn.addEventListener('click', () => {
  const code = modalManual.textContent;
  navigator.clipboard.writeText(code).then(() => {
    modalCopyBtn.textContent = '✅';
    setTimeout(() => { modalCopyBtn.textContent = '📋'; }, 1500);
  });
});

// ── Búsqueda ──────────────────────────────────────────────────
deviceSearch && deviceSearch.addEventListener('input', (e) => {
  renderDeviceGroups(allEntities, e.target.value);
});

// ── Copy main bridge code ─────────────────────────────────────
copyBtn && copyBtn.addEventListener('click', () => {
  const code = manualCode.textContent;
  navigator.clipboard.writeText(code).then(() => {
    copyBtn.textContent = '✅';
    setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
  });
});

// ── Confirm modal ─────────────────────────────────────────────
function openConfirm(title, desc, onOk) {
  confirmTitle.textContent = title;
  confirmDesc.textContent  = desc;
  pendingConfirm = onOk;
  confirmModal.classList.add('open');
}

function closeConfirm() {
  confirmModal.classList.remove('open');
  pendingConfirm = null;
}

confirmOk && confirmOk.addEventListener('click', () => {
  if (pendingConfirm) pendingConfirm();
  closeConfirm();
});
confirmCancel && confirmCancel.addEventListener('click', closeConfirm);

// ── Advanced / Settings modal ─────────────────────────────────
advancedBtn && advancedBtn.addEventListener('click', () => {
  advancedModal.classList.add('open');
});
advModalClose && advModalClose.addEventListener('click', () => {
  advancedModal.classList.remove('open');
});

// ── Restart / Factory Reset ───────────────────────────────────
restartBtn && restartBtn.addEventListener('click', () => {
  openConfirm(
    'Reiniciar Puente',
    '¿Deseas reiniciar el servicio Matter? Tardará unos segundos.',
    async () => {
      try { await fetch(`${API}/restart`, { method: 'POST' }); } catch(e) {}
    }
  );
});

factoryBtn && factoryBtn.addEventListener('click', () => {
  openConfirm(
    '⚠️ Restablecimiento de Fábrica',
    'Esto eliminará TODOS los emparejamientos. ¿Continuar?',
    async () => {
      try {
        await fetch(`${API}/factoryreset`, { method: 'POST' });
        bridgeQrCode = '';
        qrBridgeRendered = false;
        qrCanvas.innerHTML = '';
        qrCanvas.style.display = 'none';
        qrLoading.style.display = 'flex';
        manualCode.textContent = '---- --- ----';
      } catch(e) {}
    }
  );
});

// ── Init ──────────────────────────────────────────────────────
fetchStatus();
setInterval(fetchStatus, 8000);
