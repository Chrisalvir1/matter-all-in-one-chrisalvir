'use strict';

const API = './api/custom';
const state = { entities: [], activeDevice: null, activeEntity: null, activeFilter: 'all', statusBusy: false, devicesBusy: false, confirmAction: null, toastTimer: null, pollId: null };
const $ = (id) => document.getElementById(id);
const els = {
  bridgeOrb: $('bridge-orb'), bridgeTitle: $('bridge-title'), bridgeDescription: $('bridge-description'),
  haDot: $('ha-dot'), haStatus: $('ha-status'), version: $('version'), deviceSearch: $('device-search'),
  deviceCount: $('device-count'), deviceList: $('device-list'), refreshButton: $('refresh-button'),
  overviewMessage: $('overview-message'), statDevices: $('stat-devices'), statExported: $('stat-exported'), statPaired: $('stat-paired'),
  pendingCount: $('pending-count'), mqttCount: $('mqtt-count'), issueCount: $('issue-count'),
  diagnosticsPanel: $('diagnostics-panel'), diagnosticsIcon: $('diagnostics-icon'), diagnosticsHeadingText: $('diagnostics-heading-text'),
  diagnosticsSummary: $('diagnostics-summary'), diagnosticsList: $('diagnostics-list'),
  fabricsSection: $('fabrics-section'), fabricsList: $('fabrics-list'),
  deviceModal: $('device-modal'), deviceModalClose: $('device-modal-close'), deviceModalIcon: $('device-modal-icon'),
  deviceModalName: $('device-modal-name'), deviceModalId: $('device-modal-id'), entityList: $('entity-list'),
  modalExportCount: $('modal-export-count'), selectionPanel: $('selection-panel'), selectionTitle: $('selection-title'),
  selectionDescription: $('selection-description'), selectionMeta: $('selection-meta'), selectionStatus: $('selection-status'),
  qrPanel: $('qr-panel'), qrStatusLabel: $('qr-status-label'), qrSpinnerWrap: $('qr-spinner-wrap'),
  commissionedHint: $('commissioned-hint'),
  deviceQrContainer: $('device-qr-container'), deviceQrCode: $('device-qr-code'), deviceManualCode: $('device-manual-code'), deviceQrButton: $('device-qr-button'),
  resetAccessoryButton: $('reset-accessory-button'), matterActions: $('matter-actions'), reconnectAccessoryButton: $('reconnect-accessory-button'), regenerateCodeButton: $('regenerate-code-button'),
  profileField: $('profile-field'), profileSelect: $('profile-select'), profileNote: $('profile-note'),
  settingsButton: $('settings-button'), settingsModal: $('settings-modal'), settingsModalClose: $('settings-modal-close'),
  quickRestartButton: $('quick-restart-button'), restartButton: $('restart-button'), factoryResetButton: $('factory-reset-button'), confirmModal: $('confirm-modal'),
  confirmTitle: $('confirm-title'), confirmDescription: $('confirm-description'), confirmCancel: $('confirm-cancel'),
  confirmAccept: $('confirm-accept'), toast: $('toast'),
};

const ICONS = { light: '💡', switch: '🔌', cover: '🪟', lock: '🔒', climate: '🌡️', fan: '🌀', sensor: '◌', binary_sensor: '◐', camera: '📷', vacuum: '◉', button: '●', humidifier: '💧', media_player: '▶' };
const PRIORITY = ['light', 'switch', 'cover', 'lock', 'climate', 'fan', 'vacuum', 'camera', 'humidifier', 'sensor', 'binary_sensor', 'button', 'media_player'];

function getControllerIcon(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('apple')) return '🍎';
  if (n.includes('google')) return '🌐';
  if (n.includes('alexa') || n.includes('amazon')) return '🔊';
  if (n.includes('smartthings') || n.includes('samsung')) return '💠';
  if (n.includes('home assistant')) return '🏠';
  if (n.includes('thinq') || n.includes('lg')) return '📺';
  if (n.includes('homey')) return '⚪';
  if (n.includes('tuya')) return '🟠';
  if (n.includes('aqara')) return '🟢';
  return '🏠';
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function highlightMatch(text, query) {
  const str = String(text ?? '');
  if (!query) return escapeHtml(str);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${q})`, 'gi');
  const parts = str.split(regex);
  return parts.map((part) => regex.test(part) ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)).join('');
}
function displayName(entity) { return entity.attributes?.friendly_name || entity.friendlyName || entity.entityId; }
function icon(domain) { return ICONS[domain] || '◇'; }
function isOn(value) { return ['on', 'open', 'home', 'playing', 'unlocked', 'active'].includes(String(value ?? '').toLowerCase()); }
function stateLabel(value) { return String(value ?? 'desconocido').replaceAll('_', ' '); }
function matterNodeKey(entity) { return entity.compositeDeviceId ? `device:${entity.compositeDeviceId}` : entity.entityId; }

async function request(path, options) {
  const response = await fetch(`${API}${path}`, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function showToast(message, error = false) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? ' error' : ''}`;
  state.toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3600);
}

function setModalOpen(modal, open) {
  modal.hidden = !open;
  modal.classList.toggle('open', open);
  if (open) document.body.style.overflow = 'hidden';
  else if (![els.deviceModal, els.settingsModal, els.confirmModal].some((item) => item.classList.contains('open'))) document.body.style.overflow = '';
}

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
    // A configured composite can intentionally span more than one HA
    // device_id. Its Matter node is the source of truth for this screen: one
    // node means one card and one pairing flow. Standalone entities without a
    // HA device_id (such as Broadlink IR devices or custom addon entities) get
    // their own distinct card using their friendly name.
    const id = entity.compositeDeviceId ? `matter:${entity.compositeDeviceId}` : (entity.device_id || `entity:${entity.entityId}`);
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        name: entity.device_name || displayName(entity) || entity.area_name || entity.domain,
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
  const searched = state.entities.filter((entity) =>
    [displayName(entity), entity.entityId, entity.device_name, entity.area_name, entity.domain].some((value) =>
      String(value || '').toLowerCase().includes(query)
    )
  );
  // A physical accessory can contain legacy child endpoints. Its pairing
  // state belongs to the accessory/card, not to an individual channel.
  const devices = groupEntities(searched).filter(matchesDeviceFilter);
  const exportedNodes = new Set(state.entities.filter((entity) => entity.exported).map(matterNodeKey)).size;
  const pairedNodes = new Set(state.entities.filter((entity) => entity.exported && entity.commissioned).map(matterNodeKey)).size;
  const pendingNodes = new Set(state.entities.filter((entity) => entity.exported && !entity.commissioned).map(matterNodeKey)).size;
  const allDevices = groupEntities(state.entities);
  const issues = allDevices.filter((device) => device.entities.some((entity) => entity.exported && entity.hasIssue)).length;
  const mqttDevicesCount = allDevices.filter((device) => device.entities.some((entity) => entity.origin === 'mqtt' || entity.entityId.startsWith('mqtt.'))).length;
  els.statDevices.textContent = String(allDevices.length);
  els.statExported.textContent = String(exportedNodes);
  els.statPaired.textContent = String(pairedNodes);
  els.pendingCount.textContent = String(pendingNodes);
  if (els.mqttCount) els.mqttCount.textContent = String(mqttDevicesCount);
  els.issueCount.textContent = String(issues);
  els.overviewMessage.textContent = exportedNodes
    ? `${exportedNodes} accesorio${exportedNodes === 1 ? '' : 's'} listo${exportedNodes === 1 ? '' : 's'} para Matter`
    : 'Selecciona un dispositivo para comenzar';
  els.deviceCount.textContent = `${devices.length} dispositivo${devices.length === 1 ? '' : 's'} · ${exportedNodes} accesorio${exportedNodes === 1 ? '' : 's'} activo${exportedNodes === 1 ? '' : 's'} en Matter`;
  els.deviceList.setAttribute('aria-busy', 'false');
  if (!devices.length) {
    els.deviceList.innerHTML = '<div class="empty-state"><p>No hay dispositivos que coincidan con la búsqueda.</p></div>';
    return;
  }
  els.deviceList.replaceChildren(...devices.map(buildDeviceCard));
}

function isDevicePaired(device) {
  return device.entities.some((entity) => entity.exported && entity.commissioned);
}

function matchesDeviceFilter(device) {
  const exported = device.entities.some((entity) => entity.exported);
  if (state.activeFilter === 'active') return exported;
  if (state.activeFilter === 'mqtt') return device.entities.some((entity) => entity.origin === 'mqtt' || entity.entityId.startsWith('mqtt.'));
  // A device is pending pairing if it has any exported entity not yet commissioned
  if (state.activeFilter === 'pending') return device.entities.some((entity) => entity.exported && !entity.commissioned);
  if (state.activeFilter === 'unpublished') return !exported && device.entities.some((entity) => !entity.auxiliary);
  if (state.activeFilter === 'issues') return device.entities.some((entity) => entity.exported && entity.hasIssue);
  return true;
}

function buildDeviceCard(device) {
  const query = els.deviceSearch.value.trim().toLowerCase();
  const exported = device.entities.filter((entity) => entity.exported).length;
  const domains = [...new Set(device.entities.map((entity) => entity.domain))].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const element = document.createElement('article');
  const hasIssue = device.entities.some((entity) => entity.exported && entity.hasIssue);
  const isMqtt = device.entities.some((entity) => entity.origin === 'mqtt' || entity.entityId.startsWith('mqtt.'));

  // Detect which specific entities matched the current search query
  const matchingEntities = query ? device.entities.filter((entity) =>
    [displayName(entity), entity.entityId, entity.domain].some((val) => String(val || '').toLowerCase().includes(query))
  ) : [];

  let searchMatchesHtml = '';
  if (query && matchingEntities.length > 0) {
    const listHtml = matchingEntities.slice(0, 3).map((e) => `<span class="search-match-item">↳ ${highlightMatch(displayName(e), query)}</span>`).join(' ');
    const more = matchingEntities.length > 3 ? ` <span class="search-match-item">+${matchingEntities.length - 3} más</span>` : '';
    searchMatchesHtml = `<div class="search-matches"><span class="search-matches-label">Coincidencia en entidad:</span>${listHtml}${more}</div>`;
  }

  const originText = isMqtt ? 'MQTT Auto-Discovery' : (device.area ? `${device.area} · Home Assistant` : 'Home Assistant');
  const highlightedTitle = highlightMatch(device.name, query);

  element.className = `device-card${hasIssue ? ' needs-attention' : ''}`;
  element.innerHTML = `<div class="card-top"><span class="device-icon">${icon(domains[0])}</span><span class="export-badge ${exported ? 'active' : ''}">${exported}/${device.entities.length}</span></div><h3 title="${escapeHtml(device.name)}">${highlightedTitle}</h3><p class="device-meta">${escapeHtml(originText)}</p><div class="tags">${isMqtt ? '<span class="tag tag-mqtt">📡 MQTT</span>' : ''}${hasIssue ? '<span class="tag tag-warning">Revisar</span>' : ''}${domains.slice(0, 3).map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`).join('')}</div>${searchMatchesHtml}<div class="card-footer"><span class="entity-summary">${device.entities.length} entidad${device.entities.length === 1 ? '' : 'es'}</span><button class="button button-secondary" type="button">Configurar</button></div>`;
  
  const targetEntity = matchingEntities[0] || null;
  element.addEventListener('click', () => openDevice(device, targetEntity));
  element.querySelector('button')?.addEventListener('click', (event) => {
    event.stopPropagation();
    openDevice(device, targetEntity);
  });
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
        selectEntity(selected);
      }
    }
  } catch {
    els.deviceList.setAttribute('aria-busy', 'false');
    if (!state.entities || state.entities.length === 0) {
      els.deviceList.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Conectando con el servicio…</p><button class="button button-secondary" type="button" id="retry-load">Reintentar</button></div>';
      $('retry-load')?.addEventListener('click', () => void fetchDevices());
    }
  } finally { state.devicesBusy = false; }
}

function openDevice(device, targetEntity = null) {
  state.activeDevice = device;
  els.deviceModalIcon.textContent = icon(device.entities[0]?.domain);
  els.deviceModalName.textContent = device.name;
  const isMqtt = device.entities.some((e) => e.origin === 'mqtt' || e.entityId.startsWith('mqtt.'));
  els.deviceModalId.textContent = isMqtt ? `MQTT · ${device.id}` : (device.area || device.id);
  const sorted = [...device.entities].sort((a, b) => {
    if (targetEntity) {
      if (a.entityId === targetEntity.entityId) return -1;
      if (b.entityId === targetEntity.entityId) return 1;
    }
    const primaryDelta = Number(b.entityId === b.compositePrimaryEntityId) - Number(a.entityId === a.compositePrimaryEntityId);
    return primaryDelta || Number(b.exported) - Number(a.exported) || displayName(a).localeCompare(displayName(b));
  });
  const activeNodes = new Set(sorted.filter((entity) => entity.exported).map(matterNodeKey)).size;
  const groupedEndpoints = sorted.filter((entity) => entity.exported).length;
  els.modalExportCount.textContent = activeNodes
    ? `${activeNodes} accesorio Matter · ${groupedEndpoints}/${sorted.length} endpoints`
    : `0/${sorted.length} publicadas`;
  els.entityList.replaceChildren(...sorted.map((entity) => buildEntityRow(entity, targetEntity?.entityId === entity.entityId)));
  setModalOpen(els.deviceModal, true);
  const initialSelection = targetEntity ? sorted.find((e) => e.entityId === targetEntity.entityId) || sorted[0] : (sorted[0] || null);
  selectEntity(initialSelection);
}

function buildEntityRow(entity, isSearchHit = false) {
  const query = els.deviceSearch.value.trim().toLowerCase();
  const element = document.createElement('div');
  element.className = `entity-row${entity.exported ? '' : ' dimmed'}${isSearchHit ? ' search-hit' : ''}`;
  element.dataset.entityId = entity.entityId;
  const compositeChild = entity.composite && entity.entityId !== entity.compositePrimaryEntityId;
  const isMqtt = entity.origin === 'mqtt' || entity.entityId.startsWith('mqtt.');
  const control = entity.auxiliary || compositeChild
    ? '<span class="export-control">Integrada</span>'
    : `<label class="export-control" title="Publicar dispositivo en Matter"><span>${entity.exported ? 'Activo' : 'Inactivo'}</span><span class="toggle"><input type="checkbox" ${entity.exported ? 'checked' : ''} aria-label="Exportar ${escapeHtml(displayName(entity))}"><span></span></span></label>`;
  
  const highlightedName = highlightMatch(displayName(entity), query);
  const highlightedId = highlightMatch(entity.entityId, query);

  element.innerHTML = `<span class="entity-row-icon">${icon(entity.domain)}</span><div><div class="entity-row-name">${highlightedName}${isMqtt ? ' <span class="badge-mqtt">MQTT</span>' : ''}</div><div class="entity-row-id">${highlightedId}</div><span class="entity-state ${isOn(entity.state) ? 'on' : ''}">${escapeHtml(stateLabel(entity.state))}</span></div>${control}`;
  const checkbox = element.querySelector('input');
  if (checkbox) {
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => toggleEntity(entity, checkbox));
  }
  element.addEventListener('click', () => selectEntity(entity));
  return element;
}

function renderQrSection(entity) {
  // Reset QR panel areas
  if (els.commissionedHint) els.commissionedHint.style.display = 'none';
  if (els.deviceQrContainer) els.deviceQrContainer.style.display = 'none';
  if (els.deviceQrCode) els.deviceQrCode.innerHTML = '';
  if (els.deviceManualCode) els.deviceManualCode.textContent = '';
  if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = 'none';
  if (els.deviceQrButton) els.deviceQrButton.style.display = 'none';
  if (els.resetAccessoryButton) els.resetAccessoryButton.style.display = 'none';
  if (els.matterActions) els.matterActions.hidden = true;
  if (els.fabricsSection) els.fabricsSection.hidden = true;
  if (els.fabricsList) els.fabricsList.innerHTML = '';

  // Update QR panel status label
  if (els.qrStatusLabel) {
    if (!entity || !entity.exported) {
      els.qrStatusLabel.textContent = 'Sin publicar en Matter';
      els.qrStatusLabel.className = 'qr-status-label';
    } else if (entity.commissioned) {
      els.qrStatusLabel.textContent = '✓ Emparejado';
      els.qrStatusLabel.className = 'qr-status-label commissioned';
    } else {
      els.qrStatusLabel.textContent = '● Listo para emparejar';
      els.qrStatusLabel.className = 'qr-status-label active';
    }
  }

  if (!entity || entity.auxiliary || !entity.exported) return;

  const matterFabrics = Array.isArray(entity.matterFabrics) ? entity.matterFabrics : [];

  if (entity.commissioned && matterFabrics.length > 0) {
    // Show connected ecosystems list
    if (els.fabricsSection && els.fabricsList) {
      els.fabricsSection.hidden = false;
      els.fabricsList.innerHTML = matterFabrics.map((fabric) => {
        const vendor = fabric.controller || 'Controlador Matter';
        const house = fabric.label || entity.homeName || 'Casa';
        const idx = fabric.fabricIndex || fabric.fabricId || '1';
        const icon = getControllerIcon(vendor);
        return `<div class="fabric-item">
          <div class="fabric-info">
            <div class="fabric-controller-line">
              <strong class="fabric-name">${icon} ${escapeHtml(vendor)}</strong>
            </div>
            <div class="fabric-home-name">🏠 Casa: <strong>${escapeHtml(house)}</strong></div>
            <span class="fabric-detail">Fabric ID: ${escapeHtml(fabric.fabricId || idx)}</span>
          </div>
          <button class="fabric-disconnect-btn" type="button" data-fabric-index="${escapeHtml(idx)}" data-controller="${escapeHtml(vendor)}" title="Desconectar este accesorio de ${escapeHtml(vendor)}">Desconectar</button>
        </div>`;
      }).join('');

      els.fabricsList.querySelectorAll('.fabric-disconnect-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const fIndex = btn.dataset.fabricIndex;
          const controllerName = btn.dataset.controller || 'este controlador';
          openConfirm(
            `Desconectar de ${controllerName}`,
            `Se eliminará el emparejamiento con ${controllerName}. Este accesorio dejará de responder en esa casa y se generará un nuevo código QR limpio listo para volver a vincular.`,
            async () => {
              try {
                btn.disabled = true;
                btn.textContent = 'Desconectando…';
                const res = await request(`/remove-fabric/${encodeURIComponent(entity.entityId)}/${encodeURIComponent(fIndex)}`, { method: 'POST' });
                if (!res.success) throw new Error(res.error || 'No se pudo desconectar');
                showToast(`Desconectado de ${controllerName}. Nuevo código QR listo.`);
                // Update entity in place with returned data
                if (res.pairingCode !== undefined) {
                  entity.pairingCode = res.pairingCode;
                  entity.manualPairingCode = res.manualPairingCode;
                  entity.commissioned = (res.remainingFabrics ?? 0) > 0;
                  entity.fabricCount = res.remainingFabrics ?? 0;
                  entity.matterFabrics = entity.matterFabrics?.filter(f => String(f.fabricIndex) !== String(fIndex) && String(f.fabricId) !== String(fIndex)) ?? [];
                }
                await fetchDevices(true);
              } catch (err) {
                showToast(err.message || 'Error al desconectar.', true);
                await fetchDevices(true);
              }
            }
          );
        });
      });
    }

    // Commissioned accessory: show hint and actions, keep basic QR hidden
    if (els.commissionedHint) els.commissionedHint.style.display = 'block';
    if (els.deviceQrContainer) els.deviceQrContainer.style.display = 'none';
    els.matterActions.hidden = false;
    els.deviceQrButton.style.display = 'block';
    els.deviceQrButton.textContent = 'Añadir a otra casa (Multi-Admin)';
    if (els.reconnectAccessoryButton) els.reconnectAccessoryButton.textContent = '↻ Recargar / Sincronizar';
    if (els.regenerateCodeButton) els.regenerateCodeButton.textContent = 'Desconectar todo y nuevo QR';
  } else if (entity.exported) {
    // Not commissioned: show QR directly and large in the panel ready to pair!
    if (els.commissionedHint) els.commissionedHint.style.display = 'none';
    els.matterActions.hidden = true;
    if (entity.pairingCode) {
      showQrCode(entity);
      els.deviceQrButton.style.display = 'none';
    } else {
      // No pairing code yet — show spinner and begin fast poll
      if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = 'flex';
      void pollForPairingCode(entity.entityId);
    }
  }
}

function selectEntity(entity) {
  state.activeEntity = entity;
  els.entityList.querySelectorAll('.entity-row').forEach((row) => row.classList.toggle('selected', row.dataset.entityId === entity?.entityId));
  if (!entity) {
    els.selectionTitle.textContent = 'No hay entidades';
    els.selectionDescription.textContent = '';
    els.selectionMeta.innerHTML = '';
    els.selectionStatus.textContent = '';
    if (els.fabricsSection) els.fabricsSection.hidden = true;
    els.diagnosticsPanel.hidden = true;
    renderQrSection(null);
    return;
  }

  const matterFabrics = Array.isArray(entity.matterFabrics) ? entity.matterFabrics : [];
  const controllers = matterFabrics.map((fabric) => fabric.controller).filter(Boolean);
  const controllerSummary = [...new Set(controllers)].join(', ');

  // Title: device name + home name if commissioned
  let titleText = displayName(entity);

  // Home name badge next to title
  let homeLabel = '';
  if (entity.exported && entity.commissioned && entity.homeName) {
    homeLabel = `<span class="home-badge" title="Etiqueta del controlador Matter">🏠 ${escapeHtml(entity.homeName)}</span>`;
  } else if (entity.exported && entity.commissioned) {
    homeLabel = `<span class="home-badge commissioned" title="Emparejado">✓ Emparejado</span>`;
  }
  els.selectionTitle.innerHTML = `<span class="selection-title-text">${escapeHtml(titleText)}</span>${homeLabel ? ' ' + homeLabel : ''}`;

  els.selectionDescription.textContent = entity.auxiliary
    ? `Acción auxiliar de ${entity.primaryEntityId || 'su dispositivo principal'}. No se expone como accesorio Matter independiente.`
    : entity.composite && entity.entityId !== entity.compositePrimaryEntityId
      ? entity.exported
        ? 'Endpoint integrado en el mismo accesorio Matter de este dispositivo físico. Comparte su código QR y emparejamiento.'
        : 'Endpoint que se integrará en el accesorio Matter del dispositivo físico. Activa la entidad principal para publicar el grupo completo.'
    : entity.exported
      ? (entity.commissioned
          ? `Accesorio Matter activo y conectado a ${controllerSummary || 'Matter'}. Puedes añadirlo a otra casa con el botón o desconectarlo cuando lo desees.`
          : 'Accesorio Matter listo para emparejar. Escanea el código QR en Apple Home, Google Home u otro controlador.')
      : entity.composite
        ? 'Entidad principal del dispositivo Matter compuesto. Al activarla se publicarán todos sus endpoints compatibles con un único código QR.'
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
  els.profileSelect.disabled = entity.auxiliary || entity.composite;

  const isMqtt = entity.origin === 'mqtt' || entity.entityId.startsWith('mqtt.');
  const mqttMeta = isMqtt
    ? `<div><dt>Origen</dt><dd><span class="badge-mqtt">MQTT Auto-Discovery</span></dd></div>${entity.attributes?.state_topic ? `<div><dt>Tópico Estado</dt><dd title="${escapeHtml(entity.attributes.state_topic)}">${escapeHtml(entity.attributes.state_topic)}</dd></div>` : ''}${entity.attributes?.command_topic ? `<div><dt>Tópico Comando</dt><dd title="${escapeHtml(entity.attributes.command_topic)}">${escapeHtml(entity.attributes.command_topic)}</dd></div>` : ''}`
    : `<div><dt>Estado HA</dt><dd>${escapeHtml(stateLabel(entity.state))}</dd></div>`;
  
  const connectionMeta = entity.exported && entity.commissioned
    ? `<div><dt>Controladores</dt><dd title="${escapeHtml(controllerSummary)}">${escapeHtml(controllerSummary || 'Controlador Matter sin VID reportado')}</dd></div><div><dt>Casas vinculadas</dt><dd>${escapeHtml(entity.fabricCount || 1)}</dd></div>`
    : '';

  els.selectionMeta.innerHTML = `<div><dt>Entidad</dt><dd>${escapeHtml(entity.entityId)}</dd></div><div><dt>Tipo Matter</dt><dd>${escapeHtml(entity.matterType || 'Predeterminado')}</dd></div>${mqttMeta}${connectionMeta}`;

  els.selectionStatus.className = `selection-status${entity.exported ? ' active' : ''}${entity.commissioned ? ' commissioned' : ''}`;
  els.selectionStatus.textContent = entity.auxiliary
    ? 'Acción auxiliar: no se crea un mosaico ni un accesorio Matter separado.'
    : entity.exported
      ? (entity.commissioned
          ? `✓ Emparejado${entity.homeName ? ' · ' + entity.homeName : ''}`
          : '✓ Publicado en Matter — Listo para emparejar')
      : entity.composite && entity.entityId !== entity.compositePrimaryEntityId
        ? 'Integrada: se publica junto con la entidad principal'
      : 'Aún no se publica en Matter';

  renderDiagnostics(entity);
  renderQrSection(entity);
}

function renderDiagnostics(entity) {
  const diagnostics = Array.isArray(entity.diagnostics) ? entity.diagnostics : [];
  const logs = Array.isArray(entity.logs) ? entity.logs : [];

  if (!entity || !entity.exported) {
    els.diagnosticsPanel.hidden = true;
    return;
  }

  els.diagnosticsPanel.hidden = false;
  const isHealthy = !entity.hasIssue;

  els.diagnosticsPanel.classList.toggle('has-issues', !isHealthy);
  if (els.diagnosticsIcon) els.diagnosticsIcon.textContent = isHealthy ? '✓' : '!';
  if (els.diagnosticsHeadingText) {
    els.diagnosticsHeadingText.textContent = isHealthy ? 'Diagnóstico y estado' : 'Atención requerida';
  }

  if (isHealthy) {
    els.diagnosticsSummary.textContent = entity.commissioned
      ? '✓ Accesorio en línea y sincronizado con Matter y Home Assistant.'
      : '✓ Accesorio activo y listo para ser emparejado.';
  } else {
    els.diagnosticsSummary.textContent = 'Se detectó una advertencia reciente o estado no disponible en Home Assistant:';
  }

  const rows = diagnostics.slice(0, 5).map((item) => {
    const row = document.createElement('li');
    const date = new Date(item.timestamp);
    const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
    const isInfo = item.level === 'info';
    const isWarn = item.level === 'warning';
    const levelClass = isInfo ? 'success' : (isWarn ? 'warning' : 'error');
    const levelLabel = isInfo ? 'OK' : (isWarn ? 'Aviso' : 'Error');
    row.innerHTML = `<span class="diagnostic-level ${levelClass}">${levelLabel}</span><div><strong>${escapeHtml(item.message)}</strong><small>${escapeHtml(time)}</small></div>`;
    return row;
  });

  logs.slice(0, 3).forEach((line) => {
    const row = document.createElement('li');
    row.className = 'diagnostic-log';
    row.innerHTML = `<span class="diagnostic-level warning">Log</span><div><strong>${escapeHtml(line)}</strong></div>`;
    rows.push(row);
  });

  if (!rows.length) {
    const row = document.createElement('li');
    row.className = 'diagnostic-empty';
    row.textContent = isHealthy ? 'Sin errores registrados para este accesorio.' : 'No hay detalles adicionales.';
    rows.push(row);
  }
  els.diagnosticsList.replaceChildren(...rows);
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
    const device = groupEntities(state.entities).find((item) => item.id === state.activeDevice?.id);
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
    const compositeLabel = entity.composite ? 'El dispositivo completo' : displayName(entity);
    showToast(next ? `${compositeLabel} se publicó en Matter.` : `${compositeLabel} se retiró de Matter.`);
    // Refresh device list in background without closing the modal
    void fetchDevices();
    // Update only the current entity row state without reopening the modal
    const fresh = await request('/devices');
    if (Array.isArray(fresh)) {
      state.entities = fresh;
      renderDevices();
      // If modal is open, update selection panel for the affected entity only
      if (state.activeEntity?.entityId === entity.entityId && els.deviceModal.classList.contains('open')) {
        const updated = fresh.find((e) => e.entityId === entity.entityId);
        if (updated) {
          state.activeEntity = updated;
          // Update the entity row export badge without full modal re-open
          const row = els.entityList.querySelector(`[data-entity-id="${CSS.escape(entity.entityId)}"]`);
          if (row) {
            row.classList.toggle('dimmed', !updated.exported);
            const cb = row.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = !!updated.exported;
          }
          selectEntity(updated);
        }
      }
    }
  } catch (error) { checkbox.checked = !next; showToast(error.message || 'No se pudo actualizar la entidad.', true); }
  finally { checkbox.disabled = false; }
}

function openConfirm(title, description, action) { els.confirmTitle.textContent = title; els.confirmDescription.textContent = description; state.confirmAction = action; setModalOpen(els.confirmModal, true); }

function showQrCode(entity) {
  if (!entity || !entity.pairingCode) return;
  if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = 'none';
  els.deviceQrCode.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(els.deviceQrCode, {
      text: entity.pairingCode,
      width: 232,
      height: 232,
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
document.querySelectorAll('.filter-chip').forEach((button) => button.addEventListener('click', () => {
  state.activeFilter = button.dataset.filter || 'all';
  document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
  renderDevices();
}));
els.profileSelect.addEventListener('change', () => { if (state.activeEntity) void updateProfile(state.activeEntity, els.profileSelect.value); });

async function pollForPairingCode(entityOrId, maxAttempts = 40) {
  const targetEntityId = typeof entityOrId === 'object' && entityOrId !== null ? entityOrId.entityId : entityOrId;
  if (!targetEntityId) return;

  // Cancel any previous spinner
  if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = 'flex';
  if (els.deviceQrContainer) els.deviceQrContainer.style.display = 'none';

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const fresh = await request('/devices');
      if (Array.isArray(fresh)) {
        state.entities = fresh;
        const found = fresh.find((e) => e.entityId === targetEntityId);
        if (found && found.pairingCode) {
          if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = 'none';
          if (state.activeEntity?.entityId === targetEntityId) {
            state.activeEntity = found;
            showQrCode(found);
          }
          renderDevices();
          break;
        }
      }
    } catch {
      // Ignore transient poll error
    }
  }
  // If still no code after all attempts, hide spinner and show message
  if (els.qrSpinnerWrap && els.qrSpinnerWrap.style.display !== 'none') {
    els.qrSpinnerWrap.style.display = 'none';
    if (els.deviceQrCode) els.deviceQrCode.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No se pudo generar el código QR. Presiona Recargar.</p>';
    if (els.deviceQrContainer) els.deviceQrContainer.style.display = 'block';
  }
}

els.deviceQrButton.addEventListener('click', () => {
  // For commissioned devices: toggle QR visibility ("Add to another home")
  if (els.deviceQrContainer.style.display !== 'none') {
    els.deviceQrContainer.style.display = 'none';
    const entity = state.activeEntity;
    if (entity && entity.exported && entity.commissioned) {
      els.deviceQrButton.textContent = 'Añadir a otra casa (Ver QR)';
    }
    return;
  }
  // Toggle on: show QR
  const entity = state.activeEntity;
  if (!entity) return;

  if (entity.pairingCode) {
    showQrCode(entity);
    if (entity.commissioned) els.deviceQrButton.textContent = 'Ocultar Código QR';
  } else {
    // No pairing code yet — show spinner and fast poll
    if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = 'flex';
    els.deviceQrButton.textContent = 'Ocultar Código QR';
    void pollForPairingCode(entity.entityId);
  }
});

const doResetAccessory = () => {
  const entity = state.activeEntity;
  if (!entity) return;
  openConfirm(
    'Desconectar todo y generar nuevo QR',
    `Se desvincularán todos los controladores Matter de ${displayName(entity)} (Apple Home, Google Home, SmartThings, Alexa, etc.) y se regenerarán sus credenciales con un nuevo código QR limpio.`,
    async () => {
      try {
        const result = await request(`/reset-accessory/${encodeURIComponent(entity.entityId)}`, { method: 'POST' });
        if (!result.success) throw new Error(result.error || 'No se pudo restablecer el accesorio');
        if (result.pairingCode) {
          entity.pairingCode = result.pairingCode;
          entity.manualPairingCode = result.manualPairingCode;
          entity.commissioned = false;
          entity.matterFabrics = [];
          entity.fabricCount = 0;
          entity.homeName = null;
          showQrCode(entity);
          els.deviceQrButton.textContent = 'Ocultar Código QR';
          showToast('Accesorio desvinculado de todas las casas. Nuevo código QR listo.');
          void fetchDevices(true);
        } else {
          showToast('Desvinculación solicitada. Esperando nuevo código QR…');
          void pollForPairingCode(entity.entityId);
        }
      } catch (error) {
        showToast(error.message || 'No se pudo restablecer el accesorio.', true);
      }
    },
  );
};

if (els.resetAccessoryButton) els.resetAccessoryButton.addEventListener('click', doResetAccessory);
if (els.regenerateCodeButton) els.regenerateCodeButton.addEventListener('click', doResetAccessory);

els.reconnectAccessoryButton.addEventListener('click', async () => {
  const entity = state.activeEntity;
  if (!entity) return;
  els.reconnectAccessoryButton.disabled = true;
  try {
    const result = await request(`/refresh-accessory/${encodeURIComponent(entity.entityId)}`, { method: 'POST' });
    if (!result.success) throw new Error(result.error || 'No se pudo sincronizar');
    await fetchDevices(true);
    showToast('Estado sincronizado con Home Assistant y Matter.');
  } catch (error) {
    showToast(error.message || 'No se pudo sincronizar el estado Matter.', true);
  } finally {
    els.reconnectAccessoryButton.disabled = false;
  }
});

els.refreshButton.addEventListener('click', async () => { await Promise.all([fetchStatus(), fetchDevices()]); showToast('Lista actualizada.'); });
els.deviceModalClose.addEventListener('click', () => setModalOpen(els.deviceModal, false));
els.settingsButton.addEventListener('click', () => setModalOpen(els.settingsModal, true));
els.settingsModalClose.addEventListener('click', () => setModalOpen(els.settingsModal, false));
els.confirmCancel.addEventListener('click', () => setModalOpen(els.confirmModal, false));
els.confirmAccept.addEventListener('click', async () => { const action = state.confirmAction; setModalOpen(els.confirmModal, false); if (action) await action(); });
const doRestart = () => openConfirm('Reiniciar servicio', 'El servicio se reiniciará y las conexiones Matter se restablecerán durante unos segundos.', async () => { try { await request('/restart', { method: 'POST' }); showToast('El servicio se está reiniciando.'); } catch { showToast('No se pudo solicitar el reinicio.', true); } });
if (els.quickRestartButton) els.quickRestartButton.addEventListener('click', doRestart);
els.restartButton.addEventListener('click', doRestart);
els.factoryResetButton.addEventListener('click', () => openConfirm('Restablecimiento de fábrica', 'Esta operación elimina configuración y emparejamientos. Tendrás que volver a configurar y emparejar los accesorios.', async () => { try { await request('/factoryreset', { method: 'POST' }); showToast('Restablecimiento solicitado.'); } catch { showToast('No se pudo solicitar el restablecimiento.', true); } }));
[els.deviceModal, els.settingsModal].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) setModalOpen(modal, false); }));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const topModal = [els.confirmModal, els.settingsModal, els.deviceModal].find((modal) => modal && modal.classList.contains('open'));
    if (topModal) setModalOpen(topModal, false);
  }
});

void fetchStatus();
void fetchDevices();
setInterval(() => void fetchStatus(), 8000);
// Refresh fabrics and commissioning state without requiring a page reload.
setInterval(() => void fetchDevices(true), 4000);

// --- SSE: Real-time push for fabric/commissioning changes ---
function connectSSE() {
  try {
    const sse = new EventSource(`${API}/events`);
    sse.onmessage = (ev) => {
      try {
        const update = JSON.parse(ev.data);
        if (!update || !update.entityId) return;
        // Merge update into state.entities
        const idx = state.entities.findIndex((e) => e.entityId === update.entityId);
        if (idx !== -1) {
          state.entities[idx] = { ...state.entities[idx], ...update };
          renderDevices();
          // If modal is open for this entity, update the selection panel
          if (state.activeEntity?.entityId === update.entityId && els.deviceModal.classList.contains('open')) {
            state.activeEntity = state.entities[idx];
            selectEntity(state.activeEntity);
          }
        }
      } catch {
        // ignore malformed SSE data
      }
    };
    sse.onerror = () => {
      sse.close();
      // Reconnect after 5s if SSE drops
      setTimeout(connectSSE, 5000);
    };
  } catch {
    // SSE not supported or blocked — fallback to polling only
  }
}
connectSSE();

// MQTT Configuration
const mqttHostInput = $('mqtt-host');
const mqttPortInput = $('mqtt-port');
const mqttUserInput = $('mqtt-user');
const mqttPassInput = $('mqtt-pass');
const mqttSaveButton = $('mqtt-save-button');

async function loadMqttConfig() {
  try {
    const res = await request('/mqtt-config');
    if (res) {
      if (mqttHostInput) mqttHostInput.value = res.host || '';
      if (mqttPortInput) mqttPortInput.value = res.port || '';
      if (mqttUserInput) mqttUserInput.value = res.user || '';
      if (mqttPassInput) mqttPassInput.value = res.password || '';
    }
  } catch (e) {
    console.error('Failed to load MQTT config', e);
  }
}

if (mqttSaveButton) {
  mqttSaveButton.addEventListener('click', async () => {
    const data = {
      host: mqttHostInput?.value || '',
      port: Number(mqttPortInput?.value) || 1883,
      user: mqttUserInput?.value || '',
      password: mqttPassInput?.value || ''
    };
    try {
      await request('/mqtt-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      showToast('Configuración MQTT guardada. Reinicia el servicio para aplicar.');
    } catch (e) {
      showToast('Error al guardar configuración MQTT: ' + (e.message || e), true);
    }
  });
}

// Load config when settings modal opens
els.settingsButton?.addEventListener('click', () => {
  void loadMqttConfig();
});

