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
  profileField: $('profile-field'), profileSelect: $('profile-select'), profileNote: $('profile-note'), bridgeQrButton: $('bridge-qr-button'),
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
    els.bridgeTitle.textContent = online ? 'Bridge activo' : 'Bridge sin conexión';
    els.bridgeDescription.textContent = online ? 'Listo para publicar las entidades seleccionadas.' : 'El bridge reintentará automáticamente la conexión.';
  } catch {
    els.haDot.className = 'connection-dot offline';
    els.haStatus.textContent = 'No se pudo consultar el bridge';
    els.bridgeOrb.className = 'status-orb offline';
    els.bridgeTitle.textContent = 'Estado no disponible';
    els.bridgeDescription.textContent = 'Comprueba que el add-on esté en ejecución.';
  } finally { state.statusBusy = false; }
}

function groupEntities(entities) {
  const groups = new Map();
  for (const entity of entities) {
    const id = entity.device_id || `virtual:${entity.domain}`;
    if (!groups.has(id)) groups.set(id, { id, name: entity.device_name || entity.area_name || entity.domain, area: entity.area_name || '', manufacturer: entity.manufacturer || '', model: entity.model || '', entities: [] });
    groups.get(id).entities.push(entity);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderDevices() {
  const query = els.deviceSearch.value.trim().toLowerCase();
  const filtered = state.entities.filter((entity) => [displayName(entity), entity.entityId, entity.device_name, entity.area_name, entity.domain].some((value) => String(value || '').toLowerCase().includes(query)));
  const devices = groupEntities(filtered);
  const exported = state.entities.filter((entity) => entity.exported).length;
  els.deviceCount.textContent = `${devices.length} dispositivo${devices.length === 1 ? '' : 's'} · ${exported} entidad${exported === 1 ? '' : 'es'} publicada${exported === 1 ? '' : 's'}`;
  els.deviceList.setAttribute('aria-busy', 'false');
  if (!devices.length) { els.deviceList.innerHTML = '<div class="empty-state"><p>No hay dispositivos que coincidan con la búsqueda.</p></div>'; return; }
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

async function fetchDevices() {
  if (state.devicesBusy) return;
  state.devicesBusy = true;
  els.deviceList.setAttribute('aria-busy', 'true');
  try { state.entities = await request('/devices'); renderDevices(); }
  catch { els.deviceList.setAttribute('aria-busy', 'false'); els.deviceList.innerHTML = '<div class="empty-state"><p>No se pudieron cargar las entidades. Verifica la conexión con Home Assistant.</p><button class="button button-secondary" type="button" id="retry-load">Reintentar</button></div>'; $('retry-load').addEventListener('click', fetchDevices); }
  finally { state.devicesBusy = false; }
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

function selectEntity(entity) {
  state.activeEntity = entity;
  els.entityList.querySelectorAll('.entity-row').forEach((row) => row.classList.toggle('selected', row.dataset.entityId === entity?.entityId));
  if (!entity) { els.selectionTitle.textContent = 'No hay entidades'; els.selectionDescription.textContent = ''; els.selectionMeta.innerHTML = ''; els.selectionStatus.textContent = ''; return; }
  els.selectionTitle.textContent = displayName(entity);
  els.selectionDescription.textContent = entity.auxiliary
    ? `Acción auxiliar de ${entity.primaryEntityId || 'su dispositivo principal'}. No se expone como accesorio Matter independiente.`
    : entity.exported
      ? 'Esta entidad forma parte del bridge. Los controladores la descubrirán a través del único emparejamiento del bridge.'
      : 'Actívala para publicar el endpoint en Matter.';
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
  els.selectionStatus.className = `selection-status${entity.exported ? ' active' : ''}`;
  els.selectionStatus.textContent = entity.auxiliary
    ? 'Acción auxiliar: no se crea un mosaico ni un accesorio Matter separado.'
    : entity.exported ? '✓ Publicada en el bridge Matter' : 'Aún no se publica en Matter';
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
    showToast(next ? `${displayName(entity)} se publicó en Matter.` : `${displayName(entity)} se retiró del bridge.`);
    await fetchDevices();
    const device = groupEntities(state.entities).find((item) => item.id === state.activeDevice.id);
    if (device) openDevice(device); else setModalOpen(els.deviceModal, false);
  } catch (error) { checkbox.checked = !next; showToast(error.message || 'No se pudo actualizar la entidad.', true); }
  finally { checkbox.disabled = false; }
}

function openConfirm(title, description, action) { els.confirmTitle.textContent = title; els.confirmDescription.textContent = description; state.confirmAction = action; setModalOpen(els.confirmModal, true); }

els.deviceSearch.addEventListener('input', renderDevices);
els.profileSelect.addEventListener('change', () => { if (state.activeEntity) void updateProfile(state.activeEntity, els.profileSelect.value); });
els.bridgeQrButton.addEventListener('click', () => { window.open(`${window.location.protocol}//${window.location.hostname}:8284`, '_blank', 'noopener'); });
els.refreshButton.addEventListener('click', async () => { await Promise.all([fetchStatus(), fetchDevices()]); showToast('Lista actualizada.'); });
els.deviceModalClose.addEventListener('click', () => setModalOpen(els.deviceModal, false));
els.settingsButton.addEventListener('click', () => setModalOpen(els.settingsModal, true));
els.settingsModalClose.addEventListener('click', () => setModalOpen(els.settingsModal, false));
els.confirmCancel.addEventListener('click', () => setModalOpen(els.confirmModal, false));
els.confirmAccept.addEventListener('click', async () => { const action = state.confirmAction; setModalOpen(els.confirmModal, false); if (action) await action(); });
els.restartButton.addEventListener('click', () => openConfirm('Reiniciar bridge', 'El servicio se reiniciará y las conexiones Matter se restablecerán durante unos segundos.', async () => { try { await request('/restart', { method: 'POST' }); showToast('El bridge se está reiniciando.'); } catch { showToast('No se pudo solicitar el reinicio.', true); } }));
els.factoryResetButton.addEventListener('click', () => openConfirm('Restablecimiento de fábrica', 'Esta operación elimina configuración y emparejamientos del plugin. Tendrás que volver a emparejar el bridge.', async () => { try { await request('/factoryreset', { method: 'POST' }); showToast('Restablecimiento solicitado.'); } catch { showToast('No se pudo solicitar el restablecimiento.', true); } }));
[els.deviceModal, els.settingsModal].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) setModalOpen(modal, false); }));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') [els.confirmModal, els.settingsModal, els.deviceModal].find((modal) => modal.classList.contains('open')) && setModalOpen([els.confirmModal, els.settingsModal, els.deviceModal].find((modal) => modal.classList.contains('open')), false); });

void fetchStatus();
void fetchDevices();
setInterval(() => void fetchStatus(), 8000);
