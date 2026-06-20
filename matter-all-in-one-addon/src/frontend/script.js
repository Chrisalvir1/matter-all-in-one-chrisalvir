/**
 * Matter 1.5.x Bridge · Liquid Glass UI · script.js v3
 * - Carga dispositivos automáticamente al iniciar
 * - Agrupa entidades por dispositivo HA real
 * - Modal de configuración de tipo Matter por entidad
 * - QR del bridge en sidebar (siempre visible)
 */

'use strict';

// ── API Base ──────────────────────────────────────────────────
const API = './api/custom';

// ── State ─────────────────────────────────────────────────────
let bridgeQrCode     = '';
let bridgeManualCode = '';
let qrSidebarRendered = false;
let modalQrRendered  = false;
let allEntities      = [];
let activeEntity     = null;
let pendingConfirm   = null;
let logsInterval     = null;
let entityPollingInterval = null;

// ── HomeKit 2026 Type Map ──────────────────────────────────────
const HK_TYPES = {
  light: [
    { id: 'dimmableLight',           name: '💡 Luz Regulable (Dimmable)',        desc: 'Luz con control de On/Off y brillo. Compatible con escenas y automatizaciones de Apple Home.' },
    { id: 'colorTemperatureLight',   name: '💡 Luz Temperatura de Color (CCT)',  desc: 'Brillo + temperatura de color (2700K–6500K). Ideal para tiras LED blancas y bombillas CCT.' },
    { id: 'extendedColorLight',      name: '💡 Luz RGB Completa (RGBW)',         desc: 'Control total RGB + blanco cálido/frío. Máxima compatibilidad con luz de color.' },
    { id: 'onOffLight',              name: '💡 Luz Simple (On/Off)',             desc: 'Solo encendido y apagado. Sin regulación de brillo. Para luces de interruptor simples.' },
  ],
  switch: [
    { id: 'onOffPlugInUnit',         name: '🔌 Enchufe Inteligente',             desc: 'Exponer como enchufe On/Off. Aparece en la sección Enchufes de Apple Home.' },
    { id: 'onOffLight',              name: '💡 Interruptor como Luz',            desc: 'Exponer el switch como una luz simple. Útil para interruptores de tira LED sin dimmer.' },
  ],
  cover: [
    { id: 'windowCovering',          name: '🪟 Persiana / Cortina',              desc: 'Window Covering: control de posición y tilt. Compatible con persianas, estores y cortinas motorizadas.' },
    { id: 'closure',                 name: '🚪 Cerramiento Unificado',           desc: 'Closure Unified: puertas de garaje, puertas de entrada, verjas automatizadas.' },
  ],
  lock: [
    { id: 'doorLock',                name: '🔒 Cerradura de Puerta',             desc: 'Door Lock con soporte de credenciales PIN y acceso temporal.' },
  ],
  climate: [
    { id: 'thermostat',              name: '❄️ Termostato HVAC',                 desc: 'Control de temperatura, modo calor/frío/auto y humedad.' },
  ],
  sensor: [
    { id: 'temperatureSensor',       name: '🌡️ Sensor de Temperatura',           desc: 'Temperature Sensor. Reporta grados Celsius en tiempo real.' },
    { id: 'humiditySensor',          name: '💧 Sensor de Humedad Relativa',      desc: 'Relative Humidity Sensor. Muestra porcentaje de humedad.' },
    { id: 'lightSensor',             name: '☀️ Sensor de Luminosidad',           desc: 'Light Sensor (Lux). Para automatizaciones basadas en nivel de luz.' },
    { id: 'pressureSensor',          name: '📊 Sensor de Presión',               desc: 'Pressure Sensor (hPa). Para estaciones meteorológicas.' },
    { id: 'flowSensor',              name: '💧 Sensor de Flujo de Agua',         desc: 'Flow Sensor. Para sistemas de riego y fontanería.' },
    { id: 'occupancySensor',         name: '👤 Sensor de Presencia',             desc: 'Occupancy Sensor. Para automatizaciones de iluminación.' },
  ],
  binary_sensor: [
    { id: 'contactSensor',           name: '🚪 Sensor de Contacto',              desc: 'Detecta apertura y cierre de puertas, ventanas y cajones.' },
    { id: 'occupancySensor',         name: '👤 Sensor de Movimiento/Presencia',  desc: 'Motion / Occupancy Sensor. Para detectar presencia en habitaciones.' },
  ],
  camera: [
    { id: 'camera',                  name: '📹 Cámara de Red',                   desc: 'Network Camera. Visualización de vídeo en Apple Home.' },
  ],
  fan: [
    { id: 'onOffPlugInUnit',         name: '🌀 Ventilador Simple',               desc: 'Ventilador como enchufe On/Off simple.' },
  ],
  vacuum: [
    { id: 'roboticVacuumCleaner',    name: '🤖 Aspiradora Robot (RVC)',          desc: 'Robotic Vacuum Cleaner (Matter RVC device type 0x0074). Apple Home reconoce start/pause/stop.' },
    { id: 'onOffPlugInUnit',         name: '🔌 Aspiradora (On/Off básico)',       desc: 'Fallback: expone como enchufe On/Off simple.' },
  ],
  media_player: [
    { id: 'onOffPlugInUnit',         name: '📺 Media Player (On/Off)',           desc: 'Exponer el reproductor multimedia como enchufe inteligente.' },
  ],
  button: [
    { id: 'PetFeeder',               name: '🐾 Alimentador de Mascotas',         desc: 'Expone el botón de dispensar comida como un accesorio nombrado. Al activarlo desde Apple Home, envía el comando de alimentación a tu Tuya/Smart Life.' },
    { id: 'onOffPlugInUnit',         name: '🔌 Botón como Enchufe',              desc: 'Fallback: expone el botón como un enchufe on/off genérico.' },
  ],
  humidifier: [
    { id: 'fan',                     name: '🌀 Ventilador (Mapeo de Humedad)',  desc: 'Exponer el humidificador como un ventilador Matter. El control de velocidad del ventilador ajustará el porcentaje de humedad deseado (target humidity) del humidificador.' },
    { id: 'onOffPlugInUnit',         name: '🔌 Enchufe / Interruptor (On/Off)',  desc: 'Exponer como interruptor simple de encendido y apagado en Apple Home.' },
  ],
};

  light: '💡', switch: '🔌', cover: '🪟', lock: '🔒', climate: '❄️',
  sensor: '🌡️', binary_sensor: '🚨', camera: '📹', fan: '🌀',
  vacuum: '🤖', media_player: '📺', button: '🐾', humidifier: '💧',
};

  'light','switch','cover','lock','climate','camera',
  'fan','vacuum','media_player','button','binary_sensor','sensor','humidifier',
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
const deviceList     = $('device-list');
const deviceSearch   = $('device-search');
const deviceBadge    = $('device-count-badge');

// Sidebar bridge status
const sbsOrb         = $('sbs-orb');
const sbsTitle       = $('sbs-title');
const sbsDesc        = $('sbs-desc');
const haDot          = $('ha-dot');
const haStatusText   = $('ha-status-text');

// Sidebar QR
const sidebarQrEl    = $('sidebar-qrcode');
const sqrLoading     = $('sqr-loading');
const sidebarManual  = $('sidebar-manual-code');
const sidebarCopyBtn = $('sidebar-copy-btn');
const commBannerSm   = $('commissioned-banner-sm');

// Entity modal
const deviceModal    = $('device-modal');
const dmIcon         = $('dm-icon');
const dmName         = $('device-modal-name');
const dmId           = $('dm-id');
const dmEntitiesList = $('dm-entities-list');
const dmRightPlaceholder = $('dm-right-placeholder');
const dmRightContent = $('dm-right-content');

const modalQrEl      = $('modal-qrcode');
const modalQrPh      = $('modal-qr-ph');
const modalManual    = $('modal-manual-code');
const modalCopyBtn   = $('modal-copy-btn');
const modalQrExport  = $('modal-qr-export-btn');
const decommissionBtn       = $('decommission-btn');

const commissionedStatusCard = $('commissioned-status-card');
const commissionedFabricName = $('commissioned-fabric-name');
const qrPairingCard          = $('qr-pairing-card');
const dmLogsSection          = $('dm-logs-section');
const modalLogsConsole       = $('modal-logs-console');
const clearLogsBtn           = $('clear-logs-btn');
const copyLogsBtn            = $('copy-logs-btn');
const logsDetails            = $('logs-details');

// Confirm modal
const confirmModal   = $('confirm-modal');
const confirmTitle   = $('confirm-title');
const confirmDesc    = $('confirm-desc');
const confirmOk      = $('confirm-ok');
const confirmCancel  = $('confirm-cancel');

// Advanced modal
const advancedBtn    = $('advanced-btn');
const advancedModal  = $('advanced-modal');
const advModalClose  = $('adv-modal-close');
const restartBtn     = $('restart-btn');
const factoryBtn     = $('factoryreset-btn');

// Pending restart banner
const pendingRestartBanner = $('pending-restart-banner');
const bannerRestartBtn     = $('banner-restart-btn');

// ── QR Rendering ──────────────────────────────────────────────
function renderQR(container, text, size = 160) {
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

    // HA connection status
    const connected = d.haStatus === 'conectado';
    if (haDot) {
      haDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    }
    if (haStatusText) {
      haStatusText.textContent = connected ? 'HA Conectado' : 'HA Desconectado';
    }

    // Dynamic version
    const versionPill = $('version-pill');
    if (versionPill && d.version) {
      versionPill.textContent = `v${d.version}`;
    }

    // Bridge status orb
    if (sbsOrb) {
      if (d.commissioned) {
        sbsOrb.className = 'sbs-orb connected';
        if (sbsTitle) sbsTitle.textContent = 'Puente Vinculado';
        if (sbsDesc) sbsDesc.textContent  = 'Emparejado y funcionando';
      } else if (d.qrPairingCode) {
        sbsOrb.className = 'sbs-orb waiting';
        if (sbsTitle) sbsTitle.textContent = 'Esperando Vinculación';
        if (sbsDesc) sbsDesc.textContent  = 'Escanea el QR del sidebar';
      } else {
        sbsOrb.className = 'sbs-orb';
        if (sbsTitle) sbsTitle.textContent = 'Iniciando...';
        if (sbsDesc) sbsDesc.textContent  = 'Cargando servicios';
      }
    }

    // QR code
    if (d.qrPairingCode && d.qrPairingCode !== bridgeQrCode) {
      bridgeQrCode = d.qrPairingCode;
      qrSidebarRendered = false;
    }
    bridgeManualCode = d.manualPairingCode || '';
    if (sidebarManual) {
      sidebarManual.textContent = bridgeManualCode || '---- --- ----';
    }

    if (!qrSidebarRendered && bridgeQrCode && sidebarQrEl) {
      const ok = renderQR(sidebarQrEl, bridgeQrCode, 150);
      if (ok) {
        if (sqrLoading) sqrLoading.style.display = 'none';
        sidebarQrEl.style.display = 'block';
        qrSidebarRendered = true;
      }
    }

    if (commBannerSm) {
      commBannerSm.style.display = d.commissioned ? 'block' : 'none';
    }

  } catch(e) {
    console.error('Error fetching status:', e);
    if (haDot) haDot.className = 'status-dot disconnected';
    if (haStatusText) haStatusText.textContent = 'Sin conexión';
  }
}

// ── Agrupación por dispositivo HA ─────────────────────────────
function groupEntitiesByDevice(entities) {
  const grouped = new Map();

  for (const entity of entities) {
    const devId   = entity.device_id || `__domain_${entity.domain}`;
    const devName = entity.device_name ||
                    `${entity.domain.charAt(0).toUpperCase() + entity.domain.slice(1)}`;
    const area    = entity.area_name || '';

    if (!grouped.has(devId)) {
      grouped.set(devId, {
        id: devId,
        name: devName,
        area,
        manufacturer: entity.manufacturer || '',
        model: entity.model || '',
        isVirtual: !entity.device_id,
        entities: [],
        commissioned: false,
        fabric: null,
      });
    }
    const dev = grouped.get(devId);
    dev.entities.push(entity);
    if (entity.exported && entity.commissioned) {
      dev.commissioned = true;
      if (entity.fabric) {
        dev.fabric = entity.fabric;
      }
    }
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

function deviceRepresentativeIcon(device) {
  const domains = device.entities.map(e => e.domain);
  for (const p of DOMAIN_PRIORITY) {
    if (domains.includes(p)) return domainIcon(p);
  }
  return domainIcon(domains[0]);
}

function exportedCount(device) {
  return device.entities.filter(e => e.exported).length;
}

function stateClass(state) {
  const s = (state || '').toLowerCase();
  if (['on','home','open','unlocked','playing'].includes(s)) return 'on';
  if (['off','away','closed','locked','idle'].includes(s)) return 'off';
  return '';
}

// ── Fetch y render principal ──────────────────────────────────
async function fetchDevices() {
  deviceList.innerHTML = `<div class="devices-empty"><div class="spinner large"></div><p>Cargando dispositivos...</p></div>`;
  try {
    const res = await fetch(`${API}/devices`);
    if (!res.ok) throw new Error('devices error');
    allEntities = await res.json();
    renderDeviceList(allEntities, '');
  } catch(e) {
    deviceList.innerHTML = `<div class="devices-empty"><p style="color:var(--accent-r)">❌ Error al cargar dispositivos. Verifica que Home Assistant esté conectado.</p></div>`;
  }
}

// ── Render lista de dispositivos agrupados ────────────────────
function renderDeviceList(entities, searchQuery) {
  const q = (searchQuery || '').toLowerCase().trim();

  const filtered = q
    ? entities.filter(e =>
        (e.friendlyName || '').toLowerCase().includes(q) ||
        (e.entityId || '').toLowerCase().includes(q) ||
        (e.device_name || '').toLowerCase().includes(q) ||
        (e.area_name || '').toLowerCase().includes(q)
      )
    : entities;

  const devices = groupEntitiesByDevice(filtered);

  const totalDevices = devices.length;
  const commissionedDevices = devices.filter(d => d.commissioned).length;
  if (totalDevices > 0) {
    if (commissionedDevices > 0) {
      deviceBadge.textContent = `${totalDevices} (${commissionedDevices} enlazado${commissionedDevices > 1 ? 's' : ''})`;
    } else {
      deviceBadge.textContent = `${totalDevices}`;
    }
  } else {
    deviceBadge.textContent = '';
  }

  if (devices.length === 0) {
    deviceList.innerHTML = q
      ? `<div class="devices-empty"><p>No se encontraron dispositivos para "<strong>${esc(q)}</strong>".</p></div>`
      : `<div class="devices-empty"><p>No se encontraron dispositivos. Asegúrate de que Home Assistant esté conectado.</p></div>`;
    return;
  }

  deviceList.innerHTML = '';

  devices.forEach(device => {
    const card = buildDeviceCard(device);
    deviceList.appendChild(card);
  });
}

// ── Card de dispositivo ───────────────────────────────────────
function buildDeviceCard(device) {
  const wrapper = document.createElement('div');
  wrapper.className = 'device-card glass-card' + (device.commissioned ? ' connected-home' : '');
  wrapper.dataset.deviceId = device.id;

  const exported  = exportedCount(device);
  const total     = device.entities.length;
  const icon      = deviceRepresentativeIcon(device);
  const anyOn     = device.entities.some(e =>
    ['on','open','home','playing'].includes((e.state || '').toLowerCase())
  );
  const stateHint = anyOn ? 'on' : 'off';

  const uniqueDomains = [...new Set(device.entities.map(e => e.domain))].slice(0, 3);
  const fabricBadge = device.commissioned
    ? `<div class="dc-fabric-badge"><span class="dot"></span>Enlazado a ${esc(device.fabric || 'Casa')}</div>`
    : '';

  wrapper.innerHTML = `
    <div class="dc-header">
      <div class="dc-icon-wrap ${stateHint}">
        <span class="dc-icon">${icon}</span>
      </div>
      <div class="dc-info">
        <div class="dc-name">${esc(device.name)}</div>
        ${device.area ? `<div class="dc-area">📍 ${esc(device.area)}</div>` : ''}
        ${device.manufacturer ? `<div class="dc-mfr">${esc(device.manufacturer)}${device.model ? ' · ' + esc(device.model) : ''}</div>` : ''}
        <div class="dc-domains">
          ${uniqueDomains.map(d => `<span class="dc-domain-tag">${esc(d)}</span>`).join('')}
        </div>
        ${fabricBadge}
      </div>
      <div class="dc-right">
        <div class="dc-export-count ${exported > 0 ? 'active' : ''}">
          ${exported}/${total}
          <span class="dc-export-label">Matter</span>
        </div>
        <button class="pill-btn secondary sm dc-config-btn" style="margin-left: 12px;">⚙️ Configurar</button>
      </div>
    </div>
  `;

  const configBtn = wrapper.querySelector('.dc-config-btn');
  configBtn.addEventListener('click', () => {
    openDeviceModal(device);
  });

  return wrapper;
}

// ── Filas de entidades dentro del dispositivo ─────────────────
function renderEntityRows(container, device) {
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

// ── Fila de entidad individual en Modal ───────────────────────────────
function buildModalEntityRow(entity, device) {
  const row = document.createElement('div');
  row.className = 'entity-row' + (entity.exported ? ' exported' : ' not-exported');
  row.dataset.entityId = entity.entityId;
  row.style.cursor = 'pointer';
  row.style.border = '1px solid transparent';
  row.style.transition = 'border-color 0.2s';

  const icon   = domainIcon(entity.domain);
  const sc     = stateClass(entity.state);
  
  row.innerHTML = `
    <div class="er-top">
      <div class="er-icon">${icon}</div>
      <div class="er-info">
        <div class="er-name" title="${esc(entity.friendlyName)}">${esc(entity.friendlyName)}</div>
        <div class="er-entity-id" title="${esc(entity.entityId)}">${esc(entity.entityId)}</div>
      </div>
    </div>
    <div class="er-mid">
      <div class="er-state">
        <span class="er-state-pill ${sc}">${esc(entity.state || '—')}</span>
      </div>
      <div class="er-matter">
        ${entity.exported
          ? `<span class="er-matter-type">${esc(entity.matterType || 'Matter')}</span>`
          : `<span class="er-matter-disabled">No exportado</span>`
        }
      </div>
    </div>
    <div class="er-actions">
      <label class="toggle-switch" title="Exportar a Matter" onclick="event.stopPropagation()">
        <input type="checkbox" class="export-toggle" ${entity.exported ? 'checked' : ''} data-id="${esc(entity.entityId)}">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;

  // Toggle exportar
  const toggle = row.querySelector('.export-toggle');
  toggle.addEventListener('change', async (e) => {
    e.stopPropagation();
    const isExported = e.target.checked;
    const action = isExported ? 'register' : 'unregister';
    try {
      const res = await fetch(`${API}/${action}/${encodeURIComponent(entity.entityId)}`, { method: 'POST' });
      if (res.ok) {
        entity.exported = isExported;
        row.className = 'entity-row' + (isExported ? ' exported' : ' not-exported');
        row.querySelector('.er-matter').innerHTML = isExported
          ? `<span class="er-matter-type">${esc(entity.matterType || 'Matter')}</span>`
          : `<span class="er-matter-disabled">No exportado</span>`;
        updateDeviceCardCounter(device);
        fetchDevices();
        
        if (activeEntity && activeEntity.entityId === entity.entityId) {
          selectEntity(entity);
        }
      } else {
        e.target.checked = !isExported;
      }
    } catch {
      e.target.checked = !isExported;
    }
  });

  row.addEventListener('click', () => {
    document.querySelectorAll('.entity-row').forEach(r => r.style.borderColor = 'transparent');
    row.style.borderColor = 'var(--accent-b)';
    selectEntity(entity);
  });

  return row;
}

// ── Actualizar contador del card ──────────────────────────────
function updateDeviceCardCounter(device) {
  const card = document.querySelector(`.device-card[data-device-id="${CSS.escape(device.id)}"]`);
  if (!card) return;
  const exported = exportedCount(device);
  const total    = device.entities.length;
  const countEl  = card.querySelector('.dc-export-count');
  if (countEl) {
    countEl.innerHTML = `${exported}/${total}<span class="dc-export-label">Matter</span>`;
    countEl.classList.toggle('active', exported > 0);
  }
}

// ── Modal de dispositivo ──────────────────────────────────────────────
function openDeviceModal(device) {
  dmIcon.textContent = deviceRepresentativeIcon(device);
  dmName.textContent = device.name;
  dmId.textContent   = device.id;
  
  dmEntitiesList.innerHTML = '';
  const sorted = [...device.entities].sort((a, b) => {
    if (a.exported !== b.exported) return a.exported ? -1 : 1;
    const pa = DOMAIN_PRIORITY.indexOf(a.domain);
    const pb = DOMAIN_PRIORITY.indexOf(b.domain);
    if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return (a.friendlyName || '').localeCompare(b.friendlyName || '');
  });

  sorted.forEach(entity => {
    const row = buildModalEntityRow(entity, device);
    dmEntitiesList.appendChild(row);
  });

  deviceModal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Seleccionar la primera entidad exportada, o la primera si no hay exportadas
  const firstExported = sorted.find(e => e.exported);
  if (firstExported) {
    const row = dmEntitiesList.querySelector(`.entity-row[data-entity-id="${CSS.escape(firstExported.entityId)}"]`);
    if (row) {
      row.style.borderColor = 'var(--accent-b)';
      selectEntity(firstExported);
    }
  } else if (sorted.length > 0) {
    const row = dmEntitiesList.querySelector('.entity-row');
    if (row) {
      row.style.borderColor = 'var(--accent-b)';
      selectEntity(sorted[0]);
    }
  } else {
    dmRightPlaceholder.style.display = 'flex';
    dmRightContent.style.display = 'none';
  }
}

function selectEntity(entity) {
  activeEntity = entity;
  modalQrRendered = false;

  if (!entity.exported) {
    dmRightPlaceholder.style.display = 'flex';
    dmRightPlaceholder.textContent = 'Selecciona una entidad exportada para ver su código de emparejamiento.';
    dmRightContent.style.display = 'none';
    stopLogsPolling();
    stopEntityPolling();
    return;
  }

  dmRightPlaceholder.style.display = 'none';
  dmRightContent.style.display = 'block';

  const qrSection = document.getElementById('dm-qr-section');
  const qrCodeDiv = document.getElementById('modal-qrcode');
  const manualCodeEl = document.getElementById('modal-manual-code');
  const qrLoading = document.getElementById('modal-qr-loading');

  if (entity.commissioned) {
    commissionedStatusCard.style.display = 'block';
    commissionedFabricName.textContent = `Vinculado a ${esc(entity.fabric || 'Casa')}`;
    qrPairingCard.style.display = 'none';
    stopEntityPolling();
  } else {
    commissionedStatusCard.style.display = 'none';
    qrPairingCard.style.display = 'block';

    if (entity.pairingCode) {
      qrLoading.style.display = 'none';
      qrCodeDiv.style.display = 'block';
      if (!modalQrRendered) {
        renderQR(qrCodeDiv, entity.pairingCode, 160);
        modalQrRendered = true;
      }
      manualCodeEl.textContent = entity.manualPairingCode || '---- --- ----';
      stopEntityPolling();
    } else {
      qrCodeDiv.style.display = 'none';
      qrLoading.style.display = 'flex';
      manualCodeEl.textContent = 'Generando...';
      startEntityPolling(entity.entityId);
    }
  }

  if (logsDetails && logsDetails.open) {
    startLogsPolling();
  }
}

function closeDeviceModal() {
  deviceModal.classList.remove('open');
  document.body.style.overflow = '';
  activeEntity = null;
  stopLogsPolling();
  stopEntityPolling();
}

$('device-modal-close') && $('device-modal-close').addEventListener('click', closeDeviceModal);
deviceModal && deviceModal.addEventListener('click', (e) => {
  if (e.target === deviceModal) closeDeviceModal();
});

// ── Copy QR & manual codes ────────────────────────────────────
sidebarCopyBtn && sidebarCopyBtn.addEventListener('click', () => {
  const code = sidebarManual.textContent;
  navigator.clipboard.writeText(code).then(() => {
    sidebarCopyBtn.textContent = '✅';
    setTimeout(() => { sidebarCopyBtn.textContent = '📋'; }, 1500);
  });
});

modalCopyBtn && modalCopyBtn.addEventListener('click', () => {
  const code = modalManual.textContent;
  navigator.clipboard.writeText(code).then(() => {
    modalCopyBtn.textContent = '✅';
    setTimeout(() => { modalCopyBtn.textContent = '📋'; }, 1500);
  });
});

modalQrExport && modalQrExport.addEventListener('click', () => {
  const canvas = modalQrEl.querySelector('canvas');
  const img    = modalQrEl.querySelector('img');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : img?.src;
  if (!dataUrl || !activeEntity) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `matter-bridge-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
});

// ── Búsqueda ──────────────────────────────────────────────────
deviceSearch && deviceSearch.addEventListener('input', (e) => {
  renderDeviceList(allEntities, e.target.value);
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

confirmOk    && confirmOk.addEventListener('click', () => { if (pendingConfirm) pendingConfirm(); closeConfirm(); });
confirmCancel && confirmCancel.addEventListener('click', closeConfirm);

// ── Advanced modal ────────────────────────────────────────────
advancedBtn    && advancedBtn.addEventListener('click', () => advancedModal.classList.add('open'));
advModalClose  && advModalClose.addEventListener('click', () => advancedModal.classList.remove('open'));

// ── Restart / Factory Reset ───────────────────────────────────
restartBtn && restartBtn.addEventListener('click', () => {
  openConfirm(
    'Reiniciar Puente',
    '¿Deseas reiniciar el servicio Matter? Tardará unos segundos.',
    async () => {
      try { await fetch(`${API}/restart`, { method: 'POST' }); } catch {}
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
        qrSidebarRendered = false;
        sidebarQrEl.innerHTML = '';
        sidebarQrEl.style.display = 'none';
        sqrLoading.style.display = 'flex';
        sidebarManual.textContent = '---- --- ----';
      } catch {}
    }
  );
});

// ── Desconectar de la casa ────────────────────────────────────
decommissionBtn && decommissionBtn.addEventListener('click', async () => {
  if (!activeEntity) return;
  if (!confirm('¿Estás seguro de que deseas desconectar este dispositivo de su casa actual en HomeKit? Esto borrará la vinculación y permitirá emparejarlo de nuevo.')) {
    return;
  }
  try {
    decommissionBtn.disabled = true;
    decommissionBtn.textContent = 'Desconectando...';
    const res = await fetch(`${API}/decommission/${encodeURIComponent(activeEntity.entityId)}`, {
      method: 'POST'
    });
    if (res.ok) {
      // Re-fetch the devices list
      await fetchDevices();
      
      // Find the parent device and entity in the updated list to refresh the modal view
      const parentDevice = groupEntitiesByDevice(allEntities).find(d => d.entities.some(e => e.entityId === activeEntity.entityId));
      if (parentDevice) {
        openDeviceModal(parentDevice);
        const updatedEntity = parentDevice.entities.find(e => e.entityId === activeEntity.entityId);
        if (updatedEntity) {
          selectEntity(updatedEntity);
        }
      }
    } else {
      alert('Error al desconectar el dispositivo');
    }
  } catch (err) {
    console.error(err);
    alert('Error al desconectar el dispositivo');
  } finally {
    decommissionBtn.disabled = false;
    decommissionBtn.textContent = '❌ Desconectar de la casa';
  }
});

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (deviceModal && deviceModal.classList.contains('open')) closeDeviceModal();
    if (confirmModal.classList.contains('open')) closeConfirm();
    if (advancedModal.classList.contains('open')) advancedModal.classList.remove('open');
  }
});

// ── Logs Console Helper Functions & Listeners ─────────────────
async function fetchLogs() {
  if (!activeEntity || !activeEntity.exported) return;
  try {
    const res = await fetch(`${API}/logs`);
    if (!res.ok) throw new Error('logs error');
    const d = await res.json();
    if (modalLogsConsole && Array.isArray(d.logs)) {
      const isAtBottom = modalLogsConsole.scrollHeight - modalLogsConsole.clientHeight <= modalLogsConsole.scrollTop + 20;
      modalLogsConsole.textContent = d.logs.join('\n');
      if (isAtBottom) {
        modalLogsConsole.scrollTop = modalLogsConsole.scrollHeight;
      }
    }
  } catch (e) {
    console.error('Error fetching logs:', e);
  }
}

function startLogsPolling() {
  if (logsInterval) clearInterval(logsInterval);
  fetchLogs();
  logsInterval = setInterval(fetchLogs, 1500);
}

function stopLogsPolling() {
  if (logsInterval) {
    clearInterval(logsInterval);
    logsInterval = null;
  }
}

// ── Entity Pairing Code Polling Functions ──────────────────────
function startEntityPolling(entityId) {
  if (entityPollingInterval) clearInterval(entityPollingInterval);
  entityPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API}/devices`);
      if (!res.ok) return;
      const devices = await res.json();
      const updated = devices.find(e => e.entityId === entityId);
      if (updated) {
        // Update the entity in allEntities
        const index = allEntities.findIndex(e => e.entityId === entityId);
        if (index !== -1) {
          allEntities[index] = updated;
        }
        
        // If it's still the active entity, update the UI
        if (activeEntity && activeEntity.entityId === entityId) {
          if (updated.pairingCode !== activeEntity.pairingCode || updated.commissioned !== activeEntity.commissioned) {
            activeEntity = updated;
            
            // Update the row in the modal list if open
            const row = dmEntitiesList.querySelector(`.entity-row[data-entity-id="${CSS.escape(entityId)}"]`);
            if (row) {
              row.className = 'entity-row' + (updated.exported ? ' exported' : ' not-exported');
              const statusPill = row.querySelector('.er-state-pill');
              if (statusPill) {
                statusPill.className = `er-state-pill ${stateClass(updated.state)}`;
                statusPill.textContent = esc(updated.state || '—');
              }
            }
            selectEntity(updated);
          }
        }
      }
      
      // Stop polling once we have a pairing code or it is commissioned or no longer exported
      if (updated && (updated.pairingCode || updated.commissioned || !updated.exported)) {
        stopEntityPolling();
      }
    } catch (err) {
      console.error('Error polling entity pairing code:', err);
    }
  }, 2000);
}

function stopEntityPolling() {
  if (entityPollingInterval) {
    clearInterval(entityPollingInterval);
    entityPollingInterval = null;
  }
}

if (logsDetails) {
  logsDetails.addEventListener('toggle', () => {
    const chevron = logsDetails.querySelector('.details-chevron');
    if (chevron) {
      chevron.style.transform = logsDetails.open ? 'rotate(180deg)' : '';
    }
    if (logsDetails.open) {
      startLogsPolling();
    } else {
      stopLogsPolling();
    }
  });
}

if (clearLogsBtn) {
  clearLogsBtn.addEventListener('click', async () => {
    try {
      await fetch(`${API}/logs/clear`, { method: 'POST' });
      if (modalLogsConsole) modalLogsConsole.textContent = '';
    } catch (e) {
      console.error('Error clearing logs:', e);
    }
  });
}

if (copyLogsBtn) {
  copyLogsBtn.addEventListener('click', () => {
    if (modalLogsConsole) {
      const text = modalLogsConsole.textContent;
      const showCopied = () => {
        const origText = copyLogsBtn.textContent;
        copyLogsBtn.textContent = '✅ Copiado';
        setTimeout(() => { copyLogsBtn.textContent = origText; }, 1500);
      };
      
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(showCopied).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }

      function fallbackCopy() {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.top = '0';
          textarea.style.left = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          showCopied();
        } catch (err) {
          console.error('Fallback copy failed', err);
          alert('Error al copiar logs. Selecciona el texto manualmente.');
        }
      }
    }
  });
}


// ── Pending Restart Banner Event & State Check ───────────────
if (localStorage.getItem('pendingRestart') === 'true') {
  if (pendingRestartBanner) pendingRestartBanner.style.display = 'flex';
}

if (bannerRestartBtn) {
  bannerRestartBtn.addEventListener('click', async () => {
    bannerRestartBtn.disabled = true;
    const origText = bannerRestartBtn.innerHTML;
    bannerRestartBtn.innerHTML = '🔄 Reiniciando...';
    try {
      const res = await fetch(`${API}/restart`, { method: 'POST' });
      if (res.ok) {
        localStorage.removeItem('pendingRestart');
        setTimeout(() => {
          if (pendingRestartBanner) pendingRestartBanner.style.display = 'none';
          bannerRestartBtn.disabled = false;
          bannerRestartBtn.innerHTML = origText;
        }, 3000);
      } else {
        alert('Error al reiniciar el puente');
        bannerRestartBtn.disabled = false;
        bannerRestartBtn.innerHTML = origText;
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al reiniciar el puente');
      bannerRestartBtn.disabled = false;
      bannerRestartBtn.innerHTML = origText;
    }
  });
}

// ── Init ──────────────────────────────────────────────────────
fetchStatus();
fetchDevices();
setInterval(fetchStatus, 8000);
