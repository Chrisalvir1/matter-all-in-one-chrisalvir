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
};

const DOMAIN_ICONS = {
  light: '💡', switch: '🔌', cover: '🪟', lock: '🔒', climate: '❄️',
  sensor: '🌡️', binary_sensor: '🚨', camera: '📹', fan: '🌀',
  vacuum: '🤖', media_player: '📺',
};

const DOMAIN_PRIORITY = [
  'light','switch','cover','lock','climate','camera',
  'fan','vacuum','media_player','binary_sensor','sensor',
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
const entityModal    = $('entity-modal');
const emIcon         = $('em-icon');
const emName         = $('entity-modal-name');
const emId           = $('em-id');
const emState        = $('em-state');
const emDomain       = $('em-domain');
const emMatterType   = $('em-matter-type');
const emHaState      = $('em-ha-state');
const emQrLabel      = $('em-qr-device-label');
const hkSelect       = $('hk-type-select');
const saveTypeBtn    = $('save-type-btn');
const saveFeedback   = $('save-feedback');
const modalQrEl      = $('modal-qrcode');
const modalQrPh      = $('modal-qr-ph');
const modalManual    = $('modal-manual-code');
const modalCopyBtn   = $('modal-copy-btn');
const modalQrExport  = $('modal-qr-export-btn');

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
    haDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    haStatusText.textContent = connected ? 'HA Conectado' : 'HA Desconectado';

    // Bridge status orb
    if (d.commissioned) {
      sbsOrb.className = 'sbs-orb connected';
      sbsTitle.textContent = 'Puente Vinculado';
      sbsDesc.textContent  = 'Emparejado y funcionando';
    } else if (d.qrPairingCode) {
      sbsOrb.className = 'sbs-orb waiting';
      sbsTitle.textContent = 'Esperando Vinculación';
      sbsDesc.textContent  = 'Escanea el QR del sidebar';
    } else {
      sbsOrb.className = 'sbs-orb';
      sbsTitle.textContent = 'Iniciando...';
      sbsDesc.textContent  = 'Cargando servicios';
    }

    // QR code
    if (d.qrPairingCode && d.qrPairingCode !== bridgeQrCode) {
      bridgeQrCode = d.qrPairingCode;
      qrSidebarRendered = false;
    }
    bridgeManualCode = d.manualPairingCode || '';
    sidebarManual.textContent = bridgeManualCode || '---- --- ----';

    if (!qrSidebarRendered && bridgeQrCode) {
      const ok = renderQR(sidebarQrEl, bridgeQrCode, 150);
      if (ok) {
        sqrLoading.style.display = 'none';
        sidebarQrEl.style.display = 'block';
        qrSidebarRendered = true;
      }
    }

    commBannerSm.style.display = d.commissioned ? 'block' : 'none';

  } catch(e) {
    haDot.className = 'status-dot disconnected';
    haStatusText.textContent = 'Sin conexión';
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
      });
    }
    grouped.get(devId).entities.push(entity);
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
  deviceBadge.textContent = totalDevices > 0 ? `${totalDevices}` : '';

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
  wrapper.className = 'device-card glass-card';
  wrapper.dataset.deviceId = device.id;

  const exported  = exportedCount(device);
  const total     = device.entities.length;
  const icon      = deviceRepresentativeIcon(device);
  const anyOn     = device.entities.some(e =>
    ['on','open','home','playing'].includes((e.state || '').toLowerCase())
  );
  const stateHint = anyOn ? 'on' : 'off';

  const uniqueDomains = [...new Set(device.entities.map(e => e.domain))].slice(0, 3);

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
      </div>
      <div class="dc-right">
        <div class="dc-export-count ${exported > 0 ? 'active' : ''}">
          ${exported}/${total}
          <span class="dc-export-label">Matter</span>
        </div>
        <div class="dc-chevron">
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
          </svg>
        </div>
      </div>
    </div>
    <div class="dc-entities" style="display:none;">
      <div class="dc-entities-inner"></div>
    </div>
  `;

  const header        = wrapper.querySelector('.dc-header');
  const entitiesDiv   = wrapper.querySelector('.dc-entities');
  const entitiesInner = wrapper.querySelector('.dc-entities-inner');
  const chevron       = wrapper.querySelector('.dc-chevron');

  header.addEventListener('click', () => {
    const isOpen = entitiesDiv.style.display !== 'none';
    if (isOpen) {
      entitiesDiv.style.display = 'none';
      wrapper.classList.remove('expanded');
      chevron.style.transform = '';
    } else {
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

// ── Fila de entidad individual ────────────────────────────────
function buildEntityRow(entity, device) {
  const row = document.createElement('div');
  row.className = 'entity-row' + (entity.exported ? ' exported' : ' not-exported');
  row.dataset.entityId = entity.entityId;

  const icon   = domainIcon(entity.domain);
  const sc     = stateClass(entity.state);
  const types  = HK_TYPES[entity.domain] || [];
  const hasCfg = types.length > 0;

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
      ${hasCfg
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
        updateDeviceCardCounter(device);
      } else {
        e.target.checked = !isExported;
      }
    } catch {
      e.target.checked = !isExported;
    }
  });

  // Botón configurar tipo
  const configBtn = row.querySelector('.er-config-btn');
  if (configBtn) {
    configBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEntityModal(entity);
    });
  }

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

// ── Modal de configuración de tipo Matter ─────────────────────
function openEntityModal(entity) {
  activeEntity = entity;
  modalQrRendered = false;

  emIcon.textContent = domainIcon(entity.domain);
  emName.textContent = entity.friendlyName;
  emId.textContent   = entity.entityId;
  emQrLabel.textContent = entity.friendlyName;

  const sc = stateClass(entity.state);
  emState.textContent  = entity.state || '—';
  emState.className    = `em-state-pill ${sc}`;

  emDomain.textContent     = entity.domain;
  emMatterType.textContent = entity.matterType || '—';
  emHaState.textContent    = entity.state || '—';

  // Dropdown HomeKit types
  const types = HK_TYPES[entity.domain] || [];
  hkSelect.innerHTML = '';
  if (types.length === 0) {
    hkSelect.innerHTML = '<option value="">— Tipo no configurable para este dominio —</option>';
    hkSelect.disabled  = true;
    saveTypeBtn.disabled = true;
  } else {
    hkSelect.disabled   = false;
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

  // QR del bridge (compartido para todas las entidades)
  modalQrPh.style.display  = 'flex';
  modalQrEl.style.display  = 'none';
  if (bridgeQrCode || bridgeManualCode) {
    modalManual.textContent = bridgeManualCode || '---- --- ----';
    if (bridgeQrCode) {
      const ok = renderQR(modalQrEl, bridgeQrCode, 160);
      if (ok) {
        modalQrPh.style.display = 'none';
        modalQrEl.style.display = 'block';
        modalQrRendered = true;
      }
    }
  } else {
    modalManual.textContent = '---- --- ----';
  }

  saveFeedback.textContent = '';
  saveFeedback.className   = 'save-feedback';

  entityModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function updateHkTypeDesc() {
  const sel    = hkSelect.value;
  const domain = activeEntity?.domain;
  const types  = (domain && HK_TYPES[domain]) || [];
  const t      = types.find(x => x.id === sel);
  const descEl = $('hk-type-desc');
  if (descEl) descEl.textContent = t ? t.desc : 'Selecciona un tipo para ver la descripción.';
}

hkSelect && hkSelect.addEventListener('change', updateHkTypeDesc);

// ── Guardar tipo Matter ───────────────────────────────────────
saveTypeBtn && saveTypeBtn.addEventListener('click', async () => {
  if (!activeEntity) return;
  const newType = hkSelect.value;
  if (!newType) return;

  saveTypeBtn.disabled = true;
  saveFeedback.textContent = 'Guardando...';
  saveFeedback.className   = 'save-feedback saving';

  try {
    const res = await fetch(`${API}/device-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: activeEntity.entityId, matterType: newType }),
    });
    if (res.ok) {
      activeEntity.matterType = newType;
      emMatterType.textContent = newType;
      saveFeedback.textContent = '✅ Guardado. Reinicia el puente para aplicar.';
      saveFeedback.className   = 'save-feedback success';
      // Actualizar fila
      const entityRow = document.querySelector(`.entity-row[data-entity-id="${CSS.escape(activeEntity.entityId)}"] .er-matter-type`);
      if (entityRow) entityRow.textContent = newType;
    } else {
      saveFeedback.textContent = '❌ Error al guardar. Intenta de nuevo.';
      saveFeedback.className   = 'save-feedback error';
    }
  } catch {
    saveFeedback.textContent = '❌ Sin conexión con el servidor.';
    saveFeedback.className   = 'save-feedback error';
  } finally {
    saveTypeBtn.disabled = false;
  }
});

// ── Cerrar entity modal ───────────────────────────────────────
function closeEntityModal() {
  entityModal.classList.remove('open');
  document.body.style.overflow = '';
  activeEntity = null;
}

$('entity-modal-close') && $('entity-modal-close').addEventListener('click', closeEntityModal);
entityModal && entityModal.addEventListener('click', (e) => {
  if (e.target === entityModal) closeEntityModal();
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

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (entityModal.classList.contains('open')) closeEntityModal();
    if (confirmModal.classList.contains('open')) closeConfirm();
    if (advancedModal.classList.contains('open')) advancedModal.classList.remove('open');
  }
});

// ── Init ──────────────────────────────────────────────────────
fetchStatus();
fetchDevices();
setInterval(fetchStatus, 8000);
setInterval(fetchDevices, 30000);
