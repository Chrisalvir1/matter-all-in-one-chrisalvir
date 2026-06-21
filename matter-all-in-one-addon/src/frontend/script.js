'use strict';

const API = './api/custom';
const state = { entities: [], activeDevice: null, activeEntity: null, statusBusy: false, devicesBusy: false, confirmAction: null, toastTimer: null };
const $ = (id) => document.getElementById(id);
const els = {
  bridgeOrb: $('bridge-orb'), bridgeTitle: $('bridge-title'), bridgeDescription: $('bridge-description'),
  haDot: $('ha-dot'), haStatus: $('ha-status'), version: $('version'), deviceSearch: $('device-search'),
  deviceCount: $('device-count'), deviceList: $('device-list'), refreshButton: $('refresh-button'),
  deviceModal: $('device-modal'), deviceModalClose: $('device-modal-close'), deviceModalIcon: $('device-modal-icon'),
  deviceModalName: $('device-modal-name'), deviceModalId: $('device-modal-id'), entityList: $('entity-list'),
  modalExportCount: $('modal-export-count'), selectionPanel: $('selection-panel'), selectionTitle: $('selection-title'),
  selectionDescription: $('selection-description'), selectionMeta: $('selection-meta'), selectionStatus: $('selection-status'),
  deviceQrContainer: $('device-qr-container'), deviceQrCode: $('device-qr-code'), deviceManualCode: $('device-manual-code'), deviceQrButton: $('device-qr-button'),
  resetAccessoryButton: $('reset-accessory-button'),
  profileField: $('profile-field'), profileSelect: $('profile-select'), profileNote: $('profile-note'),
  settingsButton: $('settings-button'), settingsModal: $('settings-modal'), settingsModalClose: $('settings-modal-close'),
  restartButton: $('restart-button'), factoryResetButton: $('factory-reset-button'), confirmModal: $('confirm-modal'),
  confirmTitle: $('confirm-title'), confirmDescription: $('confirm-description'), confirmCancel: $('confirm-cancel'),
  confirmAccept: $('confirm-accept'), toast: $('toast'),
};

const ICONS = { light: '💡', switch: '🔌', cover: '🪟', lock: '🔒', climate: '🌡️', fan: '🌀', sensor: '◌', binary_sensor: '◐', camera: '📷', vacuum: '◉', button: '●', humidifier: '💧', media_player: '▶' };
const PRIORITY = ['light', 'switch', 'cover', 'lock', 'climate', 'fan', 'vacuum', 'camera', 'humidifier', 'sensor', 'binary_sensor', 'button', 'media_player'];

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function displayName(entity) { return entity.attributes?.friendly_name || entity.friendlyName || entity.entityId; }
function icon(domain) { return ICONS[domain] || '◇'; }
function isOn(value) { return ['on', 'open', 'home', 'playing', 'unlocked', 'active'].includes(String(value ?? '').toLowerCase()); }
function stateLabel(value) { return String(value ?? 'desconocido').replaceAll('_', ' '); }

async function request(path, options) {
  const response = await fetch(`${API}${path}`, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function showToast(message, error = false) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? ' error' : ''}`;
  state.toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3600);
}

function setModalOpen(modal, open) { modal.classList.toggle('open', open); if (open) document.body.style.overflow = 'hidden'; else if (![els.deviceModal, els.settingsModal, els.confirmModal].some((item) => item.classList.contains('open'))) document.body.style.overflow = ''; }

async function fetchStatus() {
  if (state.statusBusy) return;
  state.statusBusy = true;
  try {
    const data = await request('/status');
    const online = data.haStatus === 'conectado';
    els.haDot.className = `connection-dot ${online ? 'online' : 'offline'}`;
    els.haStatus.textContent = online ? 'Home Assistant conectado' : 'Reconectando con Home Assistant';
    els.version.textContent = data.version ? `Add-on v${data.version}${data.matterbridgeVersion ? ` · Matterbridge v${data.matterbridgeVersion}` : ''}` : '—';
    els.bridgeOrb.className = `status-orb ${online ? 'online' : 'offline'}`;
    els.bridgeTitle.textContent = online ? 'Servicio activo' : 'Servicio sin conexión';
    els.bridgeDescription.textContent = online ? 'Listo para publicar las entidades seleccionadas.' : 'El servicio reintentará automáticamente la conexión.';
  } catch {
    els.haDot.className = 'connection-dot offline';
    els.haStatus.textContent = 'No se pudo consultar el servicio';
    els.bridgeOrb.className = 'status-orb offline';
    els.bridgeTitle.textContent = 'Estado no disponible';
    els.bridgeDescription.textContent = 'Comprueba que el add-on esté en ejecución.';
  } finally { state.statusBusy = false; }
}

// Group entities by their HA device_id (physical device), not by entity
function groupEntities(entities) {
  const groups = new Map();
  for (const entity of entities) {
    // Use device_id if available, otherwise group by domain (virtual group)
    const id = entity.device_id || `virtual:${entity.domain}`;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        name: entity.device_name || entity.area_name || entity.domain,
        area: entity.area_name || '',
        manufacturer: entity.manufacturer || '',
        model: entity.model || '',
        entities: [],
      });
    }
    groups.get(id).entities.push(entity);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderDevices() {
  const query = els.deviceSearch.value.trim().toLowerCase();
  const filtered = state.entities.filter((entity) =>
    [displayName(entity), entity.entityId, entity.device_name, entity.area_name, entity.domain].some((value) =>
      String(value || '').toLowerCase().includes(query)
    )
  );
  const devices = groupEntities(filtered);
  const exportedCount = state.entities.filter((entity) => entity.exported).length;
  els.deviceCount.textContent = `${devices.length} dispositivo${devices.length === 1 ? '' : 's'} · ${exportedCount} activo${exportedCount === 1 ? '' : 's'} en Matter`;
  els.deviceList.setAttribute('aria-busy', 'false');
  if (!devices.length) {
    els.deviceList.innerHTML = '<div class="empty-state"><p>No hay dispositivos que coincidan con la búsqueda.</p></div>';
    return;
  }
  els.deviceList.replaceChildren(...devices.map(buildDeviceCard));
}

function buildDeviceCard(device) {
  const exported = device.entities.filter((entity) => entity.exported).length;
  const domains = [...new Set(device.entities.map((entity) => entity.domain))].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const element = document.createElement('article');
  element.className = 'device-card';
  element.innerHTML = `<div class="card-top"><span class="device-icon">${icon(domains[0])}</span><span class="export-badge ${exported ? 'active' : ''}">${exported}/${device.entities.length}</span></div><h3 title="${escapeHtml(device.name)}">${escapeHtml(device.name)}</h3><p class="device-meta">${escapeHtml(device.area || device.manufacturer || 'Sin área asignada')}</p><div class="tags">${domains.slice(0, 3).map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`).join('')}</div><div class="card-footer"><span class="entity-summary">${device.entities.length} entidad${device.entities.length === 1 ? '' : 'es'}</span><button class="button button-secondary" type="button">Configurar</button></div>`;
  element.querySelector('button').addEventListener('click', () => openDevice(device));
  return element;
}

async function fetchDevices(refreshSelection = false) {
  if (state.devicesBusy) return;
  state.devicesBusy = true;
  els.deviceList.setAttribute('aria-busy', 'true');
  try {
    state.entities = await request('/devices');
    renderDevices();
    if (refreshSelection && state.activeEntity && els.deviceModal.classList.contains('open')) {
      const selected = state.entities.find((entity) => entity.entityId === state.activeEntity.entityId);
      if (selected) {
        const qrWasVisible = els.deviceQrContainer.style.display !== 'none';
        selectEntity(selected);
        if (qrWasVisible && selected.pairingCode) {
          showQrCode(selected);
          els.deviceQrButton.textContent = 'Ocultar Código';
        }
      }
    }
  } catch {
    els.deviceList.setAttribute('aria-busy', 'false');
    els.deviceList.innerHTML = '<div class="empty-state"><p>No se pudieron cargar las entidades. Verifica la conexión con Home Assistant.</p><button class="button button-secondary" type="button" id="retry-load">Reintentar</button></div>';
    $('retry-load').addEventListener('click', fetchDevices);
  } finally { state.devicesBusy = false; }
}

function openDevice(device) {
  state.activeDevice = device;
  els.deviceModalIcon.textContent = icon(device.entities[0]?.domain);
  els.deviceModalName.textContent = device.name;
  els.deviceModalId.textContent = device.area || device.id;
  const sorted = [...device.entities].sort((a, b) => Number(b.exported) - Number(a.exported) || displayName(a).localeCompare(displayName(b)));
  els.modalExportCount.textContent = `${sorted.filter((entity) => entity.exported).length}/${sorted.length} publicadas`;
  els.entityList.replaceChildren(...sorted.map((entity) => buildEntityRow(entity)));
  setModalOpen(els.deviceModal, true);
  selectEntity(sorted[0] || null);
}

function buildEntityRow(entity) {
  const element = document.createElement('div');
  element.className = `entity-row${entity.exported ? '' : ' dimmed'}`;
  element.dataset.entityId = entity.entityId;
  const control = entity.auxiliary
    ? '<span class="export-control">Integrada</span>'
    : `<label class="export-control" title="Publicar en Matter"><span>${entity.exported ? 'Activo' : 'Inactivo'}</span><span class="toggle"><input type="checkbox" ${entity.exported ? 'checked' : ''} aria-label="Exportar ${escapeHtml(displayName(entity))}"><span></span></span></label>`;
  element.innerHTML = `<span class="entity-row-icon">${icon(entity.domain)}</span><div><div class="entity-row-name">${escapeHtml(displayName(entity))}</div><div class="entity-row-id">${escapeHtml(entity.entityId)}</div><span class="entity-state ${isOn(entity.state) ? 'on' : ''}">${escapeHtml(stateLabel(entity.state))}</span></div>${control}`;
  const checkbox = element.querySelector('input');
  if (checkbox) {
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => toggleEntity(entity, checkbox));
  }
  element.addEventListener('click', () => selectEntity(entity));
  return element;
}

function renderQrSection(entity) {
  // Reset QR area
  els.deviceQrContainer.style.display = 'none';
  els.deviceQrCode.innerHTML = '';
  els.deviceManualCode.textContent = '';
  els.deviceQrButton.style.display = 'none';
  els.resetAccessoryButton.style.display = 'none';
  els.deviceQrButton.textContent = 'Mostrar Código de Emparejamiento';

  if (!entity || entity.auxiliary || !entity.exported) return;

  // Always show the QR button for exported (active) entities
  els.deviceQrButton.style.display = 'block';
  // This is intentionally per-accessory: it clears only this node's fabrics
  // and reopens commissioning if a controller left a stale fabric behind.
  els.resetAccessoryButton.style.display = entity.commissioned ? 'block' : 'none';

  if (entity.commissioned && entity.homeName) {
    els.deviceQrButton.textContent = `Código Matter · Conectado: ${entity.homeName}`;
  } else if (entity.commissioned) {
    els.deviceQrButton.textContent = 'Código Matter · Ya emparejado';
  } else if (entity.pairingCode) {
    els.deviceQrButton.textContent = 'Mostrar Código de Emparejamiento';
  } else {
    // Exported but QR not ready yet (serverNode may still be starting)
    els.deviceQrButton.textContent = '⏳ Generando código…';
    els.deviceQrButton.disabled = true;
    // Poll until pairingCode is available
    pollForPairingCode(entity);
  }
}

function pollForPairingCode(entity) {
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    if (attempts > 20) { clearInterval(interval); els.deviceQrButton.textContent = 'Código no disponible'; return; }
    try {
      const fresh = await request('/devices');
      const found = fresh.find((e) => e.entityId === entity.entityId);
      if (found && found.pairingCode) {
        clearInterval(interval);
        // Update in state
        const idx = state.entities.findIndex((e) => e.entityId === entity.entityId);
        if (idx !== -1) state.entities[idx] = found;
        // Only re-render if this entity is still selected
        if (state.activeEntity && state.activeEntity.entityId === entity.entityId) {
          state.activeEntity = found;
          els.deviceQrButton.disabled = false;
          els.deviceQrButton.textContent = 'Mostrar Código de Emparejamiento';
        }
      }
    } catch { /* ignore */ }
  }, 2000);
}

function selectEntity(entity) {
  state.activeEntity = entity;
  els.entityList.querySelectorAll('.entity-row').forEach((row) => row.classList.toggle('selected', row.dataset.entityId === entity?.entityId));
  if (!entity) {
    els.selectionTitle.textContent = 'No hay entidades';
    els.selectionDescription.textContent = '';
    els.selectionMeta.innerHTML = '';
    els.selectionStatus.textContent = '';
    renderQrSection(null);
    return;
  }

  // Title: device name + home name if commissioned
  let titleText = displayName(entity);
  els.selectionTitle.textContent = titleText;

  // Home name badge next to title
  let homeLabel = '';
  if (entity.exported && entity.commissioned && entity.homeName) {
    homeLabel = `<span class="home-badge" title="Casa conectada">🏠 ${escapeHtml(entity.homeName)}</span>`;
  } else if (entity.exported && entity.commissioned) {
    homeLabel = `<span class="home-badge commissioned" title="Emparejado">✓ Emparejado</span>`;
  }
  els.selectionTitle.innerHTML = `${escapeHtml(titleText)}${homeLabel ? ' ' + homeLabel : ''}`;

  els.selectionDescription.textContent = entity.auxiliary
    ? `Acción auxiliar de ${entity.primaryEntityId || 'su dispositivo principal'}. No se expone como accesorio Matter independiente.`
    : entity.exported
      ? (entity.commissioned
          ? `Accesorio Matter activo${entity.homeName ? ` · Casa: ${entity.homeName}` : ''}. Usa el botón para ver el código QR si necesitas añadirlo a otra casa.`
          : 'Accesorio Matter listo para emparejar. Usa el código QR único para agregarlo a Apple Home, Google Home u otro controlador.')
      : 'Actívala para publicar la entidad como accesorio Matter independiente.';

  const profiles = Array.isArray(entity.profiles) ? entity.profiles : [];
  els.profileField.hidden = entity.auxiliary || profiles.length === 0;
  els.profileSelect.replaceChildren(...profiles.map((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = `${profile.label}${profile.appleHome === 'supported' ? '' : profile.appleHome === 'experimental' ? ' · experimental' : ' · no compatible con Apple Home'}`;
    option.selected = profile.id === (entity.profileId || entity.matterType);
    return option;
  }));
  const currentProfile = profiles.find((profile) => profile.id === (entity.profileId || entity.matterType)) || profiles[0];
  els.profileNote.textContent = currentProfile ? `${currentProfile.description} ${profileCompatibilityText(currentProfile.appleHome)}` : '';
  els.profileSelect.disabled = entity.auxiliary;

  els.selectionMeta.innerHTML = `<div><dt>Entidad</dt><dd>${escapeHtml(entity.entityId)}</dd></div><div><dt>Tipo Matter</dt><dd>${escapeHtml(entity.matterType || 'Predeterminado')}</dd></div><div><dt>Estado HA</dt><dd>${escapeHtml(stateLabel(entity.state))}</dd></div>`;

  els.selectionStatus.className = `selection-status${entity.exported ? ' active' : ''}${entity.commissioned ? ' commissioned' : ''}`;
  els.selectionStatus.textContent = entity.auxiliary
    ? 'Acción auxiliar: no se crea un mosaico ni un accesorio Matter separado.'
    : entity.exported
      ? (entity.commissioned
          ? `✓ Emparejado${entity.homeName ? ' · ' + entity.homeName : ''}`
          : '✓ Publicada como accesorio Matter — pendiente de emparejar')
      : 'Aún no se publica en Matter';

  renderQrSection(entity);
}

function profileCompatibilityText(compatibility) {
  if (compatibility === 'supported') return 'Reconocido por la lista actual de accesorios Matter de Apple Home.';
  if (compatibility === 'experimental') return 'Tipo Matter oficial; Apple Home no lo lista actualmente como categoría Matter compatible.';
  return 'Tipo Matter oficial, pero Apple Home no lo reconoce actualmente como categoría Matter compatible.';
}

async function updateProfile(entity, profileId) {
  if (!profileId || profileId === entity.profileId || profileId === entity.matterType) return;
  els.profileSelect.disabled = true;
  try {
    const result = await request(`/device-profile/${encodeURIComponent(entity.entityId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId }) });
    if (!result.success) throw new Error(result.error || 'No se pudo cambiar el perfil Matter');
    showToast(`Perfil Matter actualizado para ${displayName(entity)}.`);
    await fetchDevices();
    const device = groupEntities(state.entities).find((item) => item.id === state.activeDevice.id);
    if (device) openDevice(device);
  } catch (error) { showToast(error.message || 'No se pudo cambiar el perfil Matter.', true); els.profileSelect.disabled = false; }
}

async function toggleEntity(entity, checkbox) {
  const next = checkbox.checked;
  checkbox.disabled = true;
  try {
    const result = await request(`/${next ? 'register' : 'unregister'}/${encodeURIComponent(entity.entityId)}`, { method: 'POST' });
    if (!result.success) throw new Error(result.error || 'No se pudo actualizar la entidad');
    entity.exported = next;
    showToast(next ? `${displayName(entity)} se publicó en Matter.` : `${displayName(entity)} se retiró de Matter.`);
    await fetchDevices();
    const device = groupEntities(state.entities).find((item) => item.id === state.activeDevice?.id);
    if (device) openDevice(device); else setModalOpen(els.deviceModal, false);
  } catch (error) { checkbox.checked = !next; showToast(error.message || 'No se pudo actualizar la entidad.', true); }
  finally { checkbox.disabled = false; }
}

function openConfirm(title, description, action) { els.confirmTitle.textContent = title; els.confirmDescription.textContent = description; state.confirmAction = action; setModalOpen(els.confirmModal, true); }

function showQrCode(entity) {
  if (!entity || !entity.pairingCode) return;
  els.deviceQrCode.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(els.deviceQrCode, {
      text: entity.pairingCode,
      width: 180,
      height: 180,
      colorDark: '#0b1020',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } else {
    els.deviceQrCode.textContent = 'Librería QR no cargada.';
  }
  els.deviceManualCode.textContent = entity.manualPairingCode || entity.pairingCode;
  els.deviceQrContainer.style.display = 'block';
}

els.deviceSearch.addEventListener('input', renderDevices);
els.profileSelect.addEventListener('change', () => { if (state.activeEntity) void updateProfile(state.activeEntity, els.profileSelect.value); });

els.deviceQrButton.addEventListener('click', () => {
  if (els.deviceQrContainer.style.display !== 'none') {
    // Toggle off
    els.deviceQrContainer.style.display = 'none';
    const entity = state.activeEntity;
    if (entity && entity.exported) {
      if (entity.commissioned && entity.homeName) {
        els.deviceQrButton.textContent = `Código Matter · Conectado: ${entity.homeName}`;
      } else if (entity.commissioned) {
        els.deviceQrButton.textContent = 'Código Matter · Ya emparejado';
      } else {
        els.deviceQrButton.textContent = 'Mostrar Código de Emparejamiento';
      }
    }
    return;
  }
  // Toggle on: show QR
  const entity = state.activeEntity;
  if (!entity) return;

  if (entity.pairingCode) {
    showQrCode(entity);
    els.deviceQrButton.textContent = 'Ocultar Código';
  } else {
    // No pairing code yet, show message and poll
    els.deviceQrCode.innerHTML = '<p style="color:#888;font-size:0.85rem;">El código QR aún se está generando. Espera unos segundos…</p>';
    els.deviceQrContainer.style.display = 'block';
    els.deviceQrButton.textContent = 'Ocultar Código';
  }
});

els.resetAccessoryButton.addEventListener('click', () => {
  const entity = state.activeEntity;
  if (!entity) return;
  openConfirm(
    'Restablecer conexión Matter',
    `Se eliminará únicamente el emparejamiento Matter de ${displayName(entity)}. No afecta otros accesorios. El mismo código QR volverá a quedar listo para escanear.`,
    async () => {
      try {
        const result = await request(`/reset-accessory/${encodeURIComponent(entity.entityId)}`, { method: 'POST' });
        if (!result.success) throw new Error(result.error || 'No se pudo restablecer el accesorio');
        showToast('Conexión Matter restablecida. Esperando el código de emparejamiento…');
        setTimeout(() => void fetchDevices(true), 1200);
      } catch (error) {
        showToast(error.message || 'No se pudo restablecer el accesorio.', true);
      }
    },
  );
});

els.refreshButton.addEventListener('click', async () => { await Promise.all([fetchStatus(), fetchDevices()]); showToast('Lista actualizada.'); });
els.deviceModalClose.addEventListener('click', () => setModalOpen(els.deviceModal, false));
els.settingsButton.addEventListener('click', () => setModalOpen(els.settingsModal, true));
els.settingsModalClose.addEventListener('click', () => setModalOpen(els.settingsModal, false));
els.confirmCancel.addEventListener('click', () => setModalOpen(els.confirmModal, false));
els.confirmAccept.addEventListener('click', async () => { const action = state.confirmAction; setModalOpen(els.confirmModal, false); if (action) await action(); });
els.restartButton.addEventListener('click', () => openConfirm('Reiniciar servicio', 'El servicio se reiniciará y las conexiones Matter se restablecerán durante unos segundos.', async () => { try { await request('/restart', { method: 'POST' }); showToast('El servicio se está reiniciando.'); } catch { showToast('No se pudo solicitar el reinicio.', true); } }));
els.factoryResetButton.addEventListener('click', () => openConfirm('Restablecimiento de fábrica', 'Esta operación elimina configuración y emparejamientos. Tendrás que volver a configurar y emparejar los accesorios.', async () => { try { await request('/factoryreset', { method: 'POST' }); showToast('Restablecimiento solicitado.'); } catch { showToast('No se pudo solicitar el restablecimiento.', true); } }));
[els.deviceModal, els.settingsModal].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) setModalOpen(modal, false); }));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') [els.confirmModal, els.settingsModal, els.deviceModal].find((modal) => modal.classList.contains('open')) && setModalOpen([els.confirmModal, els.settingsModal, els.deviceModal].find((modal) => modal.classList.contains('open')), false); });

void fetchStatus();
void fetchDevices();
setInterval(() => void fetchStatus(), 8000);
// Refresh fabrics and commissioning state without requiring a page reload.
setInterval(() => void fetchDevices(true), 4000);
