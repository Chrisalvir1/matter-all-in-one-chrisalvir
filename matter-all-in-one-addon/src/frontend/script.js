"use strict";

const API = "./api/custom";
const state = {
  entities: [],
  activeDevice: null,
  activeEntity: null,
  activeFilter: "all",
  statusBusy: false,
  devicesBusy: false,
  confirmAction: null,
  toastTimer: null,
  pollId: null,
  multiAdminOpenEntityId: null,
  qrPollingEntityId: null,
  diagnosticsText: "",
  scryptedCameras: [],
  scryptedConfig: null,
};
const $ = (id) => document.getElementById(id);
const els = {
  bridgeOrb: $("bridge-orb"),
  bridgeTitle: $("bridge-title"),
  bridgeDescription: $("bridge-description"),
  haDot: $("ha-dot"),
  haStatus: $("ha-status"),
  version: $("version"),
  deviceSearch: $("device-search"),
  deviceCount: $("device-count"),
  deviceList: $("device-list"),
  refreshButton: $("refresh-button"),
  overviewMessage: $("overview-message"),
  statDevices: $("stat-devices"),
  statExported: $("stat-exported"),
  statPaired: $("stat-paired"),
  pendingCount: $("pending-count"),
  mqttCount: $("mqtt-count"),
  cameraCount: $("camera-count"),
  issueCount: $("issue-count"),
  diagnosticsPanel: $("diagnostics-panel"),
  diagnosticsIcon: $("diagnostics-icon"),
  diagnosticsHeadingText: $("diagnostics-heading-text"),
  diagnosticsSummary: $("diagnostics-summary"),
  diagnosticsList: $("diagnostics-list"),
  copyDiagnosticsButton: $("copy-diagnostics-button"),
  fabricsSection: $("fabrics-section"),
  fabricsList: $("fabrics-list"),
  deviceModal: $("device-modal"),
  deviceModalClose: $("device-modal-close"),
  deviceModalIcon: $("device-modal-icon"),
  deviceModalName: $("device-modal-name"),
  deviceModalId: $("device-modal-id"),
  entityList: $("entity-list"),
  modalExportCount: $("modal-export-count"),
  selectionPanel: $("selection-panel"),
  selectionTitle: $("selection-title"),
  selectionDescription: $("selection-description"),
  selectionMeta: $("selection-meta"),
  selectionStatus: $("selection-status"),
  qrPanel: $("qr-panel"),
  qrStatusLabel: $("qr-status-label"),
  qrSpinnerWrap: $("qr-spinner-wrap"),
  commissionedHint: $("commissioned-hint"),
  multiAdminHint: $("multi-admin-hint"),
  deviceQrContainer: $("device-qr-container"),
  deviceQrCode: $("device-qr-code"),
  deviceManualCode: $("device-manual-code"),
  manualCodeLabel: $("manual-code-label"),
  cameraDetailsContainer: $("camera-details-container"),
  uncommissionedMultiadminHint: $("uncommissioned-multiadmin-hint"),
  copyManualCodeBtn: $("copy-manual-code-btn"),
  downloadQrBtn: $("download-qr-btn"),
  qrCenterLogo: $("qr-center-logo"),
  deviceQrButton: $("device-qr-button"),
  resetAccessoryButton: $("reset-accessory-button"),
  matterActions: $("matter-actions"),
  reconnectAccessoryButton: $("reconnect-accessory-button"),
  regenerateCodeButton: $("regenerate-code-button"),
  profileField: $("profile-field"),
  profileSelect: $("profile-select"),
  profileNote: $("profile-note"),
  settingsButton: $("settings-button"),
  settingsModal: $("settings-modal"),
  settingsModalClose: $("settings-modal-close"),
  quickRestartButton: $("quick-restart-button"),
  restartButton: $("restart-button"),
  factoryResetButton: $("factory-reset-button"),
  confirmModal: $("confirm-modal"),
  confirmTitle: $("confirm-title"),
  confirmDescription: $("confirm-description"),
  confirmCancel: $("confirm-cancel"),
  confirmAccept: $("confirm-accept"),
  toast: $("toast"),
  btnConnectScrypted: $("btn-connect-scrypted"),
  scryptedHeaderBar: $("scrypted-header-bar"),
  scryptedStatusPill: $("scrypted-status-pill"),
  scryptedHostDisplay: $("scrypted-host-display"),
  scryptedCamerasCount: $("scrypted-cameras-count"),
  scryptedLastUpdate: $("scrypted-last-update"),
  scryptedRefreshNowBtn: $("scrypted-refresh-now-btn"),
  scryptedSyncBtn: $("scrypted-sync-btn"),
  camerasContainer: $("cameras-container"),
  scryptedManageBtn: $("scrypted-manage-btn"),
  scryptedConnectModal: $("scrypted-connect-modal"),
  scryptedModalClose: $("scrypted-modal-close"),
  scryptedConnectForm: $("scrypted-connect-form"),
  scryptedServerUrl: $("scrypted-server-url"),
  scryptedUsername: $("scrypted-username"),
  scryptedPassword: $("scrypted-password"),
  scryptedAllowSelfSigned: $("scrypted-allow-self-signed"),
  scryptedApiToken: $("scrypted-api-token"),
  scryptedServerToken: $("scrypted-server-token"),
  scryptedTestResult: $("scrypted-test-result"),
  scryptedTestBtn: $("scrypted-test-btn"),
  scryptedLoadCamerasBtn: $("scrypted-load-cameras-btn"),
  scryptedCancelBtn: $("scrypted-cancel-btn"),
  cameraConfigModal: $("camera-config-modal"),
  camCfgClose: $("cam-cfg-close"),
  camCfgForm: $("camera-config-form"),
  camCfgId: $("cam-cfg-id"),
  camCfgTitle: $("cam-cfg-title"),
  camCfgSubtitle: $("cam-cfg-subtitle"),
  camToggleMatter: $("cam-toggle-matter"),
  camToggleHksv: $("cam-toggle-hksv"),
  camToggleGoogle: $("cam-toggle-google"),
  camToggleAlexa: $("cam-toggle-alexa"),
  camToggleSt: $("cam-toggle-st"),
  camToggleNas: $("cam-toggle-nas"),
  camCfgSensorsList: $("cam-cfg-sensors-list"),
  camCfgCancel: $("cam-cfg-cancel"),
  camQrTabHomekit: $("cam-qr-tab-homekit"),
  camQrTabMatter: $("cam-qr-tab-matter"),
  camModalQrTypeLabel: $("cam-modal-qr-type-label"),
  camModalManualLabel: $("cam-modal-manual-label"),
  camModalQrNote: $("cam-modal-qr-note"),
  camModalPairedBadge: $("cam-modal-paired-badge"),
  camModalPairedBox: $("cam-modal-paired-box"),
  camModalPairedHomeName: $("cam-modal-paired-home-name"),
  camModalUnpairBtn: $("cam-modal-unpair-btn"),
  camModalQrCode: $("cam-modal-qr-code"),
  camModalQrLogo: $("cam-modal-qr-logo"),
  camModalManualCode: $("cam-modal-manual-code"),
  camModalCopyCodeBtn: $("cam-modal-copy-code-btn"),
  camModalDownloadQrBtn: $("cam-modal-download-qr-btn"),
  camModalShareCodeBtn: $("cam-modal-share-code-btn"),
  camModalResetPairBtn: $("cam-modal-reset-pair-btn"),
  camCfgRtspUrl: $("cam-cfg-rtsp-url"),
  camCfgTestRtspBtn: $("cam-cfg-test-rtsp-btn"),
  camCfgDiagnoseRtspBtn: $("cam-cfg-diagnose-rtsp-btn"),
  camCfgSaveRtspBtn: $("cam-cfg-save-rtsp-btn"),
  camCfgTransportPref: $("cam-cfg-transport-pref"),
  camCfgRtspResult: $("cam-cfg-rtsp-result"),
  camModalVideoSpec: $("cam-modal-video-spec"),
  camModalAudioSpec: $("cam-modal-audio-spec"),
  camModalErrorTag: $("cam-modal-error-tag"),
  camModalToggleLog: $("cam-modal-toggle-log"),
  camModalCopyLog: $("cam-modal-copy-log"),
  camModalLogBox: $("cam-modal-log-box"),
  camModalNasBtn: $("cam-modal-nas-btn"),
  camModalDeleteBtn: $("cam-modal-delete-btn"),
  nasConfigModal: $("nas-config-modal"),
  nasCfgClose: $("nas-cfg-close"),
  nasCfgForm: $("nas-config-form"),
  nasCfgCameraId: $("nas-cfg-camera-id"),
  nasProtocol: $("nas-protocol"),
  nasEndpoint: $("nas-endpoint"),
  nasCredentials: $("nas-credentials"),
  nasPath: $("nas-path"),
  nasRetention: $("nas-retention"),
  nasMaxSpace: $("nas-max-space"),
  nasFormat: $("nas-format"),
  nasCfgCancel: $("nas-cfg-cancel"),
};

const ICONS = {
  light: "💡",
  switch: "🔌",
  cover: "🪟",
  lock: "🔒",
  climate: "🌡️",
  fan: "🌀",
  sensor: "◌",
  binary_sensor: "◐",
  camera: "📷",
  vacuum: "◉",
  button: "●",
  humidifier: "💧",
  media_player: "▶",
};
const PRIORITY = [
  "camera",
  "doorbell",
  "siren",
  "light",
  "cover",
  "lock",
  "climate",
  "fan",
  "vacuum",
  "switch",
  "humidifier",
  "sensor",
  "binary_sensor",
  "button",
  "media_player",
];

function getControllerIcon(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("apple")) return "🍎";
  if (n.includes("google")) return "🌐";
  if (n.includes("alexa") || n.includes("amazon")) return "🔊";
  if (n.includes("smartthings") || n.includes("samsung")) return "💠";
  if (n.includes("home assistant")) return "🏠";
  if (n.includes("thinq") || n.includes("lg")) return "📺";
  if (n.includes("homey")) return "⚪";
  if (n.includes("tuya")) return "🟠";
  if (n.includes("aqara")) return "🟢";
  return "🏠";
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
}
function highlightMatch(text, query) {
  const str = String(text ?? "");
  if (!query) return escapeHtml(str);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${q})`, "gi");
  const parts = str.split(regex);
  return parts
    .map((part) =>
      regex.test(part) ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part),
    )
    .join("");
}
function displayName(entity) {
  return (
    entity.attributes?.friendly_name || entity.friendlyName || entity.entityId
  );
}
function icon(domain) {
  return ICONS[domain] || "◇";
}
function isOn(value) {
  return ["on", "open", "home", "playing", "unlocked", "active"].includes(
    String(value ?? "").toLowerCase(),
  );
}
function stateLabel(value) {
  return String(value ?? "desconocido").replaceAll("_", " ");
}
function matterNodeKey(entity) {
  return entity.compositeDeviceId
    ? `device:${entity.compositeDeviceId}`
    : entity.entityId;
}

async function request(path, options) {
  const response = await fetch(`${API}${path}`, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function showToast(message, error = false) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? " error" : ""}`;
  state.toastTimer = setTimeout(() => {
    els.toast.className = "toast";
  }, 3600);
}

function setModalOpen(modal, open) {
  modal.hidden = !open;
  modal.classList.toggle("open", open);
  if (open) document.body.style.overflow = "hidden";
  else if (
    ![els.deviceModal, els.settingsModal, els.confirmModal].some((item) =>
      item.classList.contains("open"),
    )
  )
    document.body.style.overflow = "";
}

async function fetchStatus() {
  if (state.statusBusy) return;
  state.statusBusy = true;
  try {
    const data = await request("/status");
    const online = data.haStatus === "conectado";
    els.haDot.className = `connection-dot ${online ? "online" : "offline"}`;
    els.haStatus.textContent = online
      ? "Home Assistant conectado"
      : "Reconectando con Home Assistant";
    els.version.textContent = data.version
      ? `Add-on v${data.version}${data.matterbridgeVersion ? ` · Matterbridge v${data.matterbridgeVersion}` : ""}`
      : "—";
    els.bridgeOrb.className = `status-orb ${online ? "online" : "offline"}`;
    els.bridgeTitle.textContent = online
      ? "Servicio activo"
      : "Servicio sin conexión";
    els.bridgeDescription.textContent = online
      ? "Listo para publicar las entidades seleccionadas."
      : "El servicio reintentará automáticamente la conexión.";
  } catch {
    els.haDot.className = "connection-dot offline";
    els.haStatus.textContent = "No se pudo consultar el servicio";
    els.bridgeOrb.className = "status-orb offline";
    els.bridgeTitle.textContent = "Estado no disponible";
    els.bridgeDescription.textContent =
      "Comprueba que el add-on esté en ejecución.";
  } finally {
    state.statusBusy = false;
  }
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
    const id = entity.compositeDeviceId
      ? `matter:${entity.compositeDeviceId}`
      : entity.device_id || `entity:${entity.entityId}`;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        name:
          entity.device_name ||
          displayName(entity) ||
          entity.area_name ||
          entity.domain,
        area: entity.area_name || "",
        manufacturer: entity.manufacturer || "",
        model: entity.model || "",
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
    [
      displayName(entity),
      entity.entityId,
      entity.device_name,
      entity.area_name,
      entity.domain,
      entity.manufacturer,
      entity.model,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(query),
    ),
  );
  // A physical accessory can contain legacy child endpoints. Its pairing
  // state belongs to the accessory/card, not to an individual channel.
  const devices = groupEntities(searched).filter(matchesDeviceFilter);
  const exportedNodes = new Set(
    state.entities.filter((entity) => entity.exported).map(matterNodeKey),
  ).size;
  const pairedNodes = new Set(
    state.entities
      .filter((entity) => entity.exported && entity.commissioned)
      .map(matterNodeKey),
  ).size;
  const pendingNodes = new Set(
    state.entities
      .filter((entity) => entity.exported && !entity.commissioned)
      .map(matterNodeKey),
  ).size;
  const allDevices = groupEntities(state.entities);
  const issues = allDevices.filter((device) =>
    device.entities.some((entity) => entity.exported && entity.hasIssue),
  ).length;
  const mqttDevicesCount = allDevices.filter((device) =>
    device.entities.some(
      (entity) =>
        entity.origin === "mqtt" || entity.entityId.startsWith("mqtt."),
    ),
  ).length;
  const cameraDevicesCount = allDevices.filter((device) =>
    device.entities.some((entity) => entity.domain === "camera"),
  ).length;
  els.statDevices.textContent = String(allDevices.length);
  els.statExported.textContent = String(exportedNodes);
  els.statPaired.textContent = String(pairedNodes);
  els.pendingCount.textContent = String(pendingNodes);
  if (els.mqttCount) els.mqttCount.textContent = String(mqttDevicesCount);
  const totalCameras =
    cameraDevicesCount + (state.scryptedCameras ? state.scryptedCameras.length : 0);
  if (els.cameraCount) els.cameraCount.textContent = String(totalCameras);
  els.issueCount.textContent = String(issues);
  els.overviewMessage.textContent = exportedNodes
    ? `${exportedNodes} accesorio${exportedNodes === 1 ? "" : "s"} listo${exportedNodes === 1 ? "" : "s"} para Matter`
    : "Selecciona un dispositivo para comenzar";
  els.deviceCount.textContent = `${devices.length} dispositivo${devices.length === 1 ? "" : "s"} · ${exportedNodes} accesorio${exportedNodes === 1 ? "" : "s"} activo${exportedNodes === 1 ? "" : "s"} en Matter`;
  els.deviceList.setAttribute("aria-busy", "false");

  if (state.activeFilter === "cameras") {
    if (els.btnConnectScrypted) {
      els.btnConnectScrypted.hidden = false;
    }
    if (els.scryptedHeaderBar) {
      els.scryptedHeaderBar.hidden = false;
      updateScryptedHeader();
    }

    const filteredScrypted = (state.scryptedCameras || []).filter((cam) => {
      if (!query) return true;
      return (
        (cam.name || "").toLowerCase().includes(query) ||
        (cam.model || "").toLowerCase().includes(query) ||
        (cam.cameraId || "").toLowerCase().includes(query) ||
        extractCameraBrand(cam).toLowerCase().includes(query)
      );
    });

    const filteredHaDevices = devices;

    if (filteredScrypted.length === 0 && filteredHaDevices.length === 0) {
      els.deviceList.innerHTML =
        '<div class="empty-state"><p>No se han descubierto cámaras aún. Conecta tu servidor Scrypted o escanea tu red.</p><button class="button button-primary" type="button" id="scan-cameras-empty-btn">🔌 Conectar con Scrypted</button></div>';
      $("scan-cameras-empty-btn")?.addEventListener("click", () => {
        openScryptedModal();
      });
      return;
    }

    // Agrupar TODAS las cámaras por MARCA
    const brandsMap = new Map();

    // 1. Añadir cámaras de Scrypted
    for (const cam of filteredScrypted) {
      const brand = extractCameraBrand(cam);
      if (!brandsMap.has(brand)) {
        brandsMap.set(brand, { scrypted: [], ha: [] });
      }
      brandsMap.get(brand).scrypted.push(cam);
    }

    // 2. Añadir cámaras de Home Assistant
    for (const dev of filteredHaDevices) {
      const brand = extractCameraBrand(dev);
      if (!brandsMap.has(brand)) {
        brandsMap.set(brand, { scrypted: [], ha: [] });
      }
      brandsMap.get(brand).ha.push(dev);
    }

    // 3. Renderizar secciones agrupadas por marca (alfabético, 'Marca no identificada' siempre al final)
    const brandSections = [];
    const sortedBrands = [...brandsMap.keys()].sort((a, b) => {
      const isAUnknown = a.toLowerCase() === "marca no identificada";
      const isBUnknown = b.toLowerCase() === "marca no identificada";
      if (isAUnknown && !isBUnknown) return 1;
      if (!isAUnknown && isBUnknown) return -1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    });

    for (const brand of sortedBrands) {
      const group = brandsMap.get(brand);
      const totalCount = group.scrypted.length + group.ha.length;

      // Ordenar cámaras por nombre dentro de cada grupo
      group.scrypted.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "es", {
          sensitivity: "base",
        }),
      );
      group.ha.sort((a, b) =>
        (a.name || a.deviceName || "").localeCompare(
          b.name || b.deviceName || "",
          "es",
          { sensitivity: "base" },
        ),
      );

      const section = document.createElement("section");
      section.className = "camera-brand-group";

      const header = document.createElement("header");
      header.className = "camera-brand-group__header";

      const h3 = document.createElement("h3");
      h3.textContent = `📹 ${brand}`;

      const countSpan = document.createElement("span");
      countSpan.className = "brand-camera-count";
      countSpan.textContent = `${totalCount} ${totalCount === 1 ? "cámara" : "cámaras"}`;

      header.appendChild(h3);
      header.appendChild(countSpan);

      const grid = document.createElement("div");
      grid.className = "cameras-grid";

      // Renderizar cámaras Scrypted
      for (const cam of group.scrypted) {
        grid.appendChild(renderCameraCard(cam));
      }

      // Renderizar cámaras Home Assistant
      for (const dev of group.ha) {
        grid.appendChild(buildDeviceCard(dev));
      }

      section.appendChild(header);
      section.appendChild(grid);
      brandSections.push(section);
    }

    els.deviceList.replaceChildren(...brandSections);
    return;
  } else {
    if (els.btnConnectScrypted) {
      els.btnConnectScrypted.hidden = true;
    }
    if (els.scryptedHeaderBar) {
      els.scryptedHeaderBar.hidden = true;
    }
  }

  if (!devices.length) {
    els.deviceList.innerHTML =
      '<div class="empty-state"><p>No hay dispositivos que coincidan con la búsqueda.</p></div>';
    return;
  }
  els.deviceList.replaceChildren(...devices.map(buildDeviceCard));
}

function isDevicePaired(device) {
  return device.entities.some(
    (entity) => entity.exported && entity.commissioned,
  );
}

function matchesDeviceFilter(device) {
  const exported = device.entities.some((entity) => entity.exported);
  if (state.activeFilter === "cameras")
    return device.entities.some((entity) => entity.domain === "camera");
  if (state.activeFilter === "active") return exported;
  if (state.activeFilter === "mqtt")
    return device.entities.some(
      (entity) =>
        entity.origin === "mqtt" || entity.entityId.startsWith("mqtt."),
    );
  // A device is pending pairing if it has any exported entity not yet commissioned
  if (state.activeFilter === "pending")
    return device.entities.some(
      (entity) => entity.exported && !entity.commissioned,
    );
  if (state.activeFilter === "unpublished")
    return !exported && device.entities.some((entity) => !entity.auxiliary);
  if (state.activeFilter === "issues")
    return device.entities.some((entity) => entity.exported && entity.hasIssue);
  return true;
}

function buildDeviceCard(device) {
  const query = els.deviceSearch.value.trim().toLowerCase();
  const exported = device.entities.filter((entity) => entity.exported).length;
  const domains = [
    ...new Set(device.entities.map((entity) => entity.domain)),
  ].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const element = document.createElement("article");
  const hasIssue = device.entities.some(
    (entity) => entity.exported && entity.hasIssue,
  );
  const isMqtt = device.entities.some(
    (entity) => entity.origin === "mqtt" || entity.entityId.startsWith("mqtt."),
  );

  // Detect which specific entities matched the current search query
  const matchingEntities = query
    ? device.entities.filter((entity) =>
        [
          displayName(entity),
          entity.entityId,
          entity.domain,
          entity.manufacturer,
          entity.model,
        ].some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(query),
        ),
      )
    : [];

  let searchMatchesHtml = "";
  if (query && matchingEntities.length > 0) {
    const listHtml = matchingEntities
      .slice(0, 3)
      .map(
        (e) =>
          `<span class="search-match-item">↳ ${highlightMatch(displayName(e), query)}</span>`,
      )
      .join(" ");
    const more =
      matchingEntities.length > 3
        ? ` <span class="search-match-item">+${matchingEntities.length - 3} más</span>`
        : "";
    searchMatchesHtml = `<div class="search-matches"><span class="search-matches-label">Coincidencia en entidad:</span>${listHtml}${more}</div>`;
  }

  const brandInfo = device.manufacturer
    ? `${device.manufacturer}${device.model ? ` (${device.model})` : ""}`
    : "";
  const originText = isMqtt
    ? "MQTT Auto-Discovery"
    : brandInfo
      ? `${brandInfo}${device.area ? ` · 📍 ${device.area}` : ""}`
      : device.area
        ? `📍 ${device.area} · Home Assistant`
        : "Home Assistant";
  const highlightedTitle = highlightMatch(device.name, query);
  const brandTag = device.manufacturer
    ? `<span class="tag tag-brand">${escapeHtml(device.manufacturer)}</span>`
    : "";

  element.className = `device-card${hasIssue ? " needs-attention" : ""}`;
  element.innerHTML = `<div class="card-top"><span class="device-icon">${icon(domains[0])}</span><span class="export-badge ${exported ? "active" : ""}">${exported}/${device.entities.length}</span></div><h3 title="${escapeHtml(device.name)}">${highlightedTitle}</h3><p class="device-meta">${escapeHtml(originText)}</p><div class="tags">${isMqtt ? '<span class="tag tag-mqtt">📡 MQTT</span>' : ""}${brandTag}${hasIssue ? '<span class="tag tag-warning">Revisar</span>' : ""}${domains
    .slice(0, 3)
    .map((domain) => `<span class="tag">${escapeHtml(domain)}</span>`)
    .join(
      "",
    )}</div>${searchMatchesHtml}<div class="card-footer"><span class="entity-summary">${device.entities.length} entidad${device.entities.length === 1 ? "" : "es"}</span><button class="button button-secondary" type="button">Configurar</button></div>`;

  const targetEntity = matchingEntities[0] || null;
  element.addEventListener("click", () => openDevice(device, targetEntity));
  element.querySelector("button")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openDevice(device, targetEntity);
  });
  return element;
}

async function fetchDevices(refreshSelection = false) {
  if (state.devicesBusy) return;
  state.devicesBusy = true;
  els.deviceList.setAttribute("aria-busy", "true");
  try {
    state.entities = await request("/devices");
    await fetchScrypted();
    renderDevices();
    if (
      refreshSelection &&
      state.activeEntity &&
      els.deviceModal.classList.contains("open")
    ) {
      const selected = state.entities.find(
        (entity) => entity.entityId === state.activeEntity.entityId,
      );
      if (selected) {
        selectEntity(selected);
      }
    }
  } catch {
    els.deviceList.setAttribute("aria-busy", "false");
    if (!state.entities || state.entities.length === 0) {
      els.deviceList.innerHTML =
        '<div class="empty-state"><span class="spinner"></span><p>Conectando con el servicio…</p><button class="button button-secondary" type="button" id="retry-load">Reintentar</button></div>';
      $("retry-load")?.addEventListener("click", () => void fetchDevices());
    }
  } finally {
    state.devicesBusy = false;
  }
}

function openDevice(device, targetEntity = null) {
  state.multiAdminOpenEntityId = null;
  state.activeDevice = device;
  els.deviceModalIcon.textContent = icon(device.entities[0]?.domain);
  els.deviceModalName.textContent = device.name;
  const isMqtt = device.entities.some(
    (e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."),
  );
  const brandSub = device.manufacturer
    ? `${device.manufacturer}${device.model ? ` · ${device.model}` : ""}${device.area ? ` · 📍 ${device.area}` : ""}`
    : device.area
      ? `📍 ${device.area}`
      : device.id;
  els.deviceModalId.textContent = isMqtt ? `MQTT · ${device.id}` : brandSub;
  const sorted = [...device.entities].sort((a, b) => {
    if (targetEntity) {
      if (a.entityId === targetEntity.entityId) return -1;
      if (b.entityId === targetEntity.entityId) return 1;
    }
    const primaryDelta =
      Number(b.entityId === b.compositePrimaryEntityId) -
      Number(a.entityId === a.compositePrimaryEntityId);
    return (
      primaryDelta ||
      Number(b.exported) - Number(a.exported) ||
      displayName(a).localeCompare(displayName(b))
    );
  });
  const activeNodes = new Set(
    sorted.filter((entity) => entity.exported).map(matterNodeKey),
  ).size;
  const groupedEndpoints = sorted.filter((entity) => entity.exported).length;
  els.modalExportCount.textContent = activeNodes
    ? `${activeNodes} accesorio Matter · ${groupedEndpoints}/${sorted.length} endpoints`
    : `0/${sorted.length} publicadas`;
  els.entityList.replaceChildren(
    ...sorted.map((entity) =>
      buildEntityRow(entity, targetEntity?.entityId === entity.entityId),
    ),
  );
  setModalOpen(els.deviceModal, true);
  const initialSelection = targetEntity
    ? sorted.find((e) => e.entityId === targetEntity.entityId) || sorted[0]
    : sorted[0] || null;
  selectEntity(initialSelection);
}

function buildEntityRow(entity, isSearchHit = false) {
  const query = els.deviceSearch.value.trim().toLowerCase();
  const element = document.createElement("div");
  element.className = `entity-row${entity.exported ? "" : " dimmed"}${isSearchHit ? " search-hit" : ""}`;
  element.dataset.entityId = entity.entityId;
  const compositeChild =
    entity.composite && entity.entityId !== entity.compositePrimaryEntityId;
  const isMqtt =
    entity.origin === "mqtt" || entity.entityId.startsWith("mqtt.");
  const control =
    entity.auxiliary || compositeChild
      ? '<span class="export-control">Integrada</span>'
      : `<label class="export-control" title="Publicar dispositivo en Matter"><span>${entity.exported ? "Activo" : "Inactivo"}</span><span class="toggle"><input type="checkbox" ${entity.exported ? "checked" : ""} aria-label="Exportar ${escapeHtml(displayName(entity))}"><span></span></span></label>`;

  const highlightedName = highlightMatch(displayName(entity), query);
  const highlightedId = highlightMatch(entity.entityId, query);

  element.innerHTML = `<span class="entity-row-icon">${icon(entity.domain)}</span><div><div class="entity-row-name">${highlightedName}${isMqtt ? ' <span class="badge-mqtt">MQTT</span>' : ""}</div><div class="entity-row-id">${highlightedId}</div><span class="entity-state ${isOn(entity.state) ? "on" : ""}">${escapeHtml(stateLabel(entity.state))}</span></div>${control}`;
  const checkbox = element.querySelector("input");
  if (checkbox) {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => toggleEntity(entity, checkbox));
  }
  element.addEventListener("click", () => selectEntity(entity));
  return element;
}

function renderQrSection(entity) {
  const qrEntityId = entity?.entityId || "";
  const qrChanged = els.deviceQrCode?.dataset.entityId !== qrEntityId;
  // Reset QR panel areas
  if (els.commissionedHint) els.commissionedHint.style.display = "none";
  if (els.multiAdminHint) els.multiAdminHint.style.display = "none";
  if (els.deviceQrContainer) els.deviceQrContainer.style.display = "none";
  if (els.deviceQrCode && qrChanged) {
    els.deviceQrCode.innerHTML = "";
    els.deviceQrCode.dataset.entityId = qrEntityId;
    delete els.deviceQrCode.dataset.pairingCode;
  }
  if (els.deviceManualCode && qrChanged) els.deviceManualCode.textContent = "";
  if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "none";
  if (els.deviceQrButton) els.deviceQrButton.style.display = "none";
  if (els.resetAccessoryButton) els.resetAccessoryButton.style.display = "none";
  if (els.matterActions) els.matterActions.hidden = true;
  if (els.fabricsSection) els.fabricsSection.hidden = true;
  if (els.fabricsList) els.fabricsList.innerHTML = "";

  const isMultiAdminActive = Boolean(
    entity &&
    state.multiAdminOpenEntityId &&
    state.multiAdminOpenEntityId === entity.entityId,
  );

  // Update QR panel status label
  if (els.qrStatusLabel) {
    if (!entity || !entity.exported) {
      els.qrStatusLabel.textContent = "Sin publicar";
      els.qrStatusLabel.className = "qr-status-label";
    } else if (entity.domain === "camera" && entity.homekitCamera) {
      els.qrStatusLabel.textContent =
        "🍎 Listo para Apple Home (HomeKit Live View)";
      els.qrStatusLabel.className = "qr-status-label active";
    } else if (isMultiAdminActive) {
      els.qrStatusLabel.textContent = "● Modo Multi-Admin Abierto (15 min)";
      els.qrStatusLabel.className = "qr-status-label active";
    } else if (entity.commissioned) {
      els.qrStatusLabel.textContent = "✓ Emparejado";
      els.qrStatusLabel.className = "qr-status-label commissioned";
    } else {
      els.qrStatusLabel.textContent = "● Listo para emparejar";
      els.qrStatusLabel.className = "qr-status-label active";
    }
  }

  if (!entity || entity.auxiliary || !entity.exported) return;

  if (entity.domain === "camera" && entity.homekitCamera) {
    if (els.commissionedHint) els.commissionedHint.style.display = "none";
    if (els.multiAdminHint) els.multiAdminHint.style.display = "none";
    if (els.matterActions) els.matterActions.hidden = true;
    if (els.fabricsSection) els.fabricsSection.hidden = true;
    if (els.deviceQrButton) els.deviceQrButton.style.display = "none";
    if (els.qrStatusLabel) {
      const isPaired = Boolean(entity.homekitCamera.isPaired);
      els.qrStatusLabel.textContent = isPaired
        ? "✓ Emparejado a Apple Home"
        : "🍎 Listo para Apple Home (HomeKit Live View)";
      els.qrStatusLabel.className = `qr-status-label ${isPaired ? "commissioned" : "active"}`;
    }
    showQrCode(entity);
    return;
  }

  const matterFabrics = Array.isArray(entity.matterFabrics)
    ? entity.matterFabrics
    : [];

  const isCommissioned = Boolean(
    entity.commissioned ||
      (entity.fabricCount ?? 0) > 0 ||
      matterFabrics.length > 0,
  );

  if (isCommissioned) {
    if (els.uncommissionedMultiadminHint)
      els.uncommissionedMultiadminHint.style.display = "none";
    // Show connected ecosystems list
    if (els.fabricsSection && els.fabricsList) {
      els.fabricsSection.hidden = false;
      if (matterFabrics.length > 0) {
        els.fabricsList.innerHTML = matterFabrics
          .map((fabric) => {
            const vendor = fabric.controller || "Controlador Matter";
            const house = fabric.label || entity.homeName || "Casa";
            const idx = fabric.fabricIndex || fabric.fabricId || "1";
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
          })
          .join("");
      } else {
        els.fabricsList.innerHTML = `
          <div class="fabric-item">
            <div class="fabric-info">
              <div class="fabric-controller-line">
                <strong class="fabric-name">✓ Conectado a Matter</strong>
              </div>
              <span class="fabric-detail">Emparejado a tu ecosistema</span>
            </div>
          </div>`;
      }

      els.fabricsList
        .querySelectorAll(".fabric-disconnect-btn")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const fIndex = btn.dataset.fabricIndex;
            const controllerName = btn.dataset.controller || "este controlador";
            openConfirm(
              `Desconectar de ${controllerName}`,
              `Se eliminará el emparejamiento con ${controllerName}. Este accesorio dejará de responder en esa casa y se generará un nuevo código QR limpio listo para volver a vincular.`,
              async () => {
                try {
                  btn.disabled = true;
                  btn.textContent = "Desconectando…";
                  const res = await request(
                    `/remove-fabric/${encodeURIComponent(entity.entityId)}/${encodeURIComponent(fIndex)}`,
                    { method: "POST" },
                  );
                  if (!res.success)
                    throw new Error(res.error || "No se pudo desconectar");
                  showToast(
                    `Desconectado de ${controllerName}. Nuevo código QR listo.`,
                  );
                  // Update entity in place with returned data
                  if (res.pairingCode !== undefined) {
                    entity.pairingCode = res.pairingCode;
                    entity.manualPairingCode = res.manualPairingCode;
                    entity.commissioned = (res.remainingFabrics ?? 0) > 0;
                    entity.fabricCount = res.remainingFabrics ?? 0;
                    entity.matterFabrics =
                      entity.matterFabrics?.filter(
                        (f) =>
                          String(f.fabricIndex) !== String(fIndex) &&
                          String(f.fabricId) !== String(fIndex),
                      ) ?? [];
                  }
                  state.multiAdminOpenEntityId = null;
                  await fetchDevices(true);
                } catch (err) {
                  showToast(err.message || "Error al desconectar.", true);
                  await fetchDevices(true);
                }
              },
            );
          });
        });
    }

    // Commissioned accessory: handle multi-admin mode vs standby
    els.matterActions.hidden = false;
    els.deviceQrButton.style.display = "block";
    els.deviceQrButton.disabled = false;
    if (els.reconnectAccessoryButton)
      els.reconnectAccessoryButton.textContent = "↻ Recargar / Sincronizar";
    if (els.regenerateCodeButton)
      els.regenerateCodeButton.textContent = "Desconectar todo y nuevo QR";

    if (isMultiAdminActive) {
      if (els.commissionedHint) els.commissionedHint.style.display = "none";
      if (els.multiAdminHint) els.multiAdminHint.style.display = "block";
      els.deviceQrButton.textContent = "✕ Cerrar ventana Multi-Admin";
      if (entity.pairingCode) {
        showQrCode(entity);
      } else {
        if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "flex";
        void pollForPairingCode(entity.entityId);
      }
    } else {
      if (els.commissionedHint) els.commissionedHint.style.display = "block";
      if (els.multiAdminHint) els.multiAdminHint.style.display = "none";
      if (els.deviceQrContainer) els.deviceQrContainer.style.display = "none";
      els.deviceQrButton.textContent = "🌐 Añadir a otra casa (Multi-Admin)";
    }
  } else if (entity.exported) {
    if (els.uncommissionedMultiadminHint)
      els.uncommissionedMultiadminHint.style.display = "block";
    // Not commissioned: show QR directly and large in the panel ready to pair!
    if (els.commissionedHint) els.commissionedHint.style.display = "none";
    if (els.multiAdminHint) els.multiAdminHint.style.display = "none";
    els.matterActions.hidden = true;
    if (entity.pairingCode) {
      showQrCode(entity);
      els.deviceQrButton.style.display = "none";
    } else {
      // No pairing code yet — show spinner and begin fast poll
      if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "flex";
      void pollForPairingCode(entity.entityId);
    }
  }
}

function selectEntity(entity) {
  if (state.activeEntity?.entityId !== entity?.entityId) {
    state.multiAdminOpenEntityId = null;
  }
  state.activeEntity = entity;
  els.entityList
    .querySelectorAll(".entity-row")
    .forEach((row) =>
      row.classList.toggle(
        "selected",
        row.dataset.entityId === entity?.entityId,
      ),
    );
  if (!entity) {
    els.selectionTitle.textContent = "No hay entidades";
    els.selectionDescription.textContent = "";
    els.selectionMeta.innerHTML = "";
    els.selectionStatus.textContent = "";
    if (els.fabricsSection) els.fabricsSection.hidden = true;
    els.diagnosticsPanel.hidden = true;
    renderQrSection(null);
    return;
  }

  const matterFabrics = Array.isArray(entity.matterFabrics)
    ? entity.matterFabrics
    : [];
  const controllers = matterFabrics
    .map((fabric) => fabric.controller)
    .filter(Boolean);
  const controllerSummary = [...new Set(controllers)].join(", ");

  // Title: device name + home name if commissioned
  let titleText = displayName(entity);

  // Home name badge next to title
  let homeLabel = "";
  if (entity.domain === "camera" && entity.homekitCamera) {
    const isPaired = Boolean(entity.homekitCamera.isPaired);
    homeLabel = isPaired
      ? `<span class="home-badge commissioned" title="Emparejado con Apple Home">🍎 Apple Home</span>`
      : `<span class="home-badge" title="Listo para Apple Home">🍎 HomeKit HAP</span>`;
  } else if (entity.exported && entity.commissioned && entity.homeName) {
    homeLabel = `<span class="home-badge" title="Etiqueta del controlador Matter">🏠 ${escapeHtml(entity.homeName)}</span>`;
  } else if (entity.exported && entity.commissioned) {
    homeLabel = `<span class="home-badge commissioned" title="Emparejado">✓ Emparejado</span>`;
  }
  els.selectionTitle.innerHTML = `<span class="selection-title-text">${escapeHtml(titleText)}</span>${homeLabel ? " " + homeLabel : ""}`;

  els.selectionDescription.textContent =
    entity.domain === "camera" && entity.homekitCamera
      ? entity.homekitCamera.isPaired
        ? "Accesorio HomeKit IP Camera activo y vinculado a Apple Home con soporte para Live View RTP/SRTP y sensor de movimiento."
        : "Cámara HomeKit HAP lista para emparejar. Abre la app Casa (Apple Home) en tu iPhone o iPad y escanea el código QR de abajo o ingresa el código PIN."
      : entity.auxiliary
        ? `Acción auxiliar de ${entity.primaryEntityId || "su dispositivo principal"}. No se expone como accesorio Matter independiente.`
        : entity.composite &&
            entity.entityId !== entity.compositePrimaryEntityId
          ? entity.exported
            ? "Endpoint integrado en el mismo accesorio Matter de este dispositivo físico. Comparte su código QR y emparejamiento."
            : "Endpoint que se integrará en el accesorio Matter del dispositivo físico. Activa la entidad principal para publicar el grupo completo."
          : entity.exported
            ? entity.commissioned
              ? `Accesorio Matter activo y conectado a ${controllerSummary || "Matter"}. Puedes añadirlo a otra casa con el botón o desconectarlo cuando lo desees.`
              : "Accesorio Matter listo para emparejar. Escanea el código QR en Apple Home, Google Home u otro controlador."
            : entity.composite
              ? "Entidad principal del dispositivo Matter compuesto. Al activarla se publicarán todos sus endpoints compatibles con un único código QR."
              : "Actívala para publicar la entidad como accesorio Matter independiente.";

  const profiles = Array.isArray(entity.profiles) ? entity.profiles : [];
  els.profileField.hidden = entity.auxiliary || profiles.length === 0;
  els.profileSelect.replaceChildren(
    ...profiles.map((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = `${profile.label}${profile.appleHome === "supported" ? "" : profile.appleHome === "experimental" ? " · experimental" : " · no compatible con Apple Home"}`;
      option.selected = profile.id === (entity.profileId || entity.matterType);
      return option;
    }),
  );
  const currentProfile =
    profiles.find(
      (profile) => profile.id === (entity.profileId || entity.matterType),
    ) || profiles[0];
  els.profileNote.textContent = currentProfile
    ? `${currentProfile.description} ${profileCompatibilityText(currentProfile.appleHome)}`
    : "";
  els.profileSelect.disabled = Boolean(entity.auxiliary);

  const isMqtt =
    entity.origin === "mqtt" || entity.entityId.startsWith("mqtt.");
  const mqttMeta = isMqtt
    ? `<div><dt>Origen</dt><dd><span class="badge-mqtt">MQTT Auto-Discovery</span></dd></div>${entity.attributes?.state_topic ? `<div><dt>Tópico Estado</dt><dd title="${escapeHtml(entity.attributes.state_topic)}">${escapeHtml(entity.attributes.state_topic)}</dd></div>` : ""}${entity.attributes?.command_topic ? `<div><dt>Tópico Comando</dt><dd title="${escapeHtml(entity.attributes.command_topic)}">${escapeHtml(entity.attributes.command_topic)}</dd></div>` : ""}`
    : `<div><dt>Estado HA</dt><dd>${escapeHtml(stateLabel(entity.state))}</dd></div>`;

  const connectionMeta =
    entity.domain === "camera" && entity.homekitCamera
      ? `<div><dt>Protocolo</dt><dd>HomeKit HAP (Live View RTP)</dd></div><div><dt>Estado</dt><dd>${escapeHtml(entity.homekitCamera.isPaired ? "Emparejado a Apple Home" : "Listo para escanear")}</dd></div>`
      : entity.exported && entity.commissioned
        ? `<div><dt>Controladores</dt><dd title="${escapeHtml(controllerSummary)}">${escapeHtml(controllerSummary || "Controlador Matter sin VID reportado")}</dd></div><div><dt>Casas vinculadas</dt><dd>${escapeHtml(entity.fabricCount || 1)}</dd></div>`
        : "";

  const typeText =
    entity.deviceTypeLabel ||
    (entity.domain === "camera"
      ? "Cámara HomeKit HAP"
      : entity.domain === "fan"
        ? "Fan"
        : entity.domain === "humidifier"
          ? "Humidifier"
          : entity.matterType || "Predeterminado");
  const brandMeta = entity.manufacturer
    ? `<div><dt>Marca</dt><dd>${escapeHtml(entity.manufacturer)}</dd></div>`
    : "";
  const modelMeta = entity.model
    ? `<div><dt>Modelo</dt><dd>${escapeHtml(entity.model)}</dd></div>`
    : "";
  els.selectionMeta.innerHTML = `<div><dt>Entidad</dt><dd>${escapeHtml(entity.entityId)}</dd></div><div><dt>Tipo</dt><dd>${escapeHtml(typeText)}</dd></div>${brandMeta}${modelMeta}${mqttMeta}${connectionMeta}`;

  els.selectionStatus.className = `selection-status${entity.exported ? " active" : ""}${entity.commissioned || entity.homekitCamera?.isPaired ? " commissioned" : ""}`;
  els.selectionStatus.textContent =
    entity.domain === "camera" && entity.homekitCamera
      ? entity.homekitCamera.isPaired
        ? "✓ Vinculado a Apple Home — Live View y Sensores activos"
        : `● Publicado en puerto ${entity.homekitCamera.port} — Listo para escanear`
      : entity.auxiliary
        ? "Acción auxiliar: no se crea un mosaico ni un accesorio Matter separado."
        : entity.exported
          ? entity.commissioned
            ? `✓ Emparejado${entity.homeName ? " · " + entity.homeName : ""}`
            : "✓ Publicado en Matter — Listo para emparejar"
          : entity.composite &&
              entity.entityId !== entity.compositePrimaryEntityId
            ? "Integrada: se publica junto con la entidad principal"
            : "Aún no se publica en Matter";

  renderDiagnostics(entity);
  renderQrSection(entity);
}

function renderDiagnostics(entity) {
  const diagnostics = Array.isArray(entity.diagnostics)
    ? entity.diagnostics
    : [];
  const logs = Array.isArray(entity.logs) ? entity.logs : [];
  state.diagnosticsText = [
    `Entidad: ${entity?.entityId || ""}`,
    ...diagnostics.map(
      (item) =>
        `[${item.timestamp}] ${String(item.level).toUpperCase()}: ${item.message}`,
    ),
    ...logs.map((line) => `[LOG] ${line}`),
  ].join("\n");
  if (els.copyDiagnosticsButton)
    els.copyDiagnosticsButton.disabled = !state.diagnosticsText.trim();

  if (!entity || !entity.exported) {
    els.diagnosticsPanel.hidden = true;
    return;
  }

  els.diagnosticsPanel.hidden = false;
  const isHealthy = !entity.hasIssue;

  els.diagnosticsPanel.classList.toggle("has-issues", !isHealthy);
  if (els.diagnosticsIcon)
    els.diagnosticsIcon.textContent = isHealthy ? "✓" : "!";
  if (els.diagnosticsHeadingText) {
    els.diagnosticsHeadingText.textContent = isHealthy
      ? "Diagnóstico y estado"
      : "Atención requerida";
  }

  if (isHealthy) {
    els.diagnosticsSummary.textContent = entity.commissioned
      ? "✓ Accesorio en línea y sincronizado con Matter y Home Assistant."
      : "✓ Accesorio activo y listo para ser emparejado.";
  } else {
    els.diagnosticsSummary.textContent =
      "Se detectó una advertencia reciente o estado no disponible en Home Assistant:";
  }

  const rows = diagnostics.slice(0, 5).map((item) => {
    const row = document.createElement("li");
    const date = new Date(item.timestamp);
    const time = Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString();
    const isInfo = item.level === "info";
    const isWarn = item.level === "warning";
    const levelClass = isInfo ? "success" : isWarn ? "warning" : "error";
    const levelLabel = isInfo ? "OK" : isWarn ? "Aviso" : "Error";
    row.innerHTML = `<span class="diagnostic-level ${levelClass}">${levelLabel}</span><div><strong>${escapeHtml(item.message)}</strong><small>${escapeHtml(time)}</small></div>`;
    return row;
  });

  logs.slice(0, 3).forEach((line) => {
    const row = document.createElement("li");
    row.className = "diagnostic-log";
    row.innerHTML = `<span class="diagnostic-level warning">Log</span><div><strong>${escapeHtml(line)}</strong></div>`;
    rows.push(row);
  });

  if (!rows.length) {
    const row = document.createElement("li");
    row.className = "diagnostic-empty";
    row.textContent = isHealthy
      ? "Sin errores registrados para este accesorio."
      : "No hay detalles adicionales.";
    rows.push(row);
  }
  els.diagnosticsList.replaceChildren(...rows);
}

els.copyDiagnosticsButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.diagnosticsText);
    showToast("Diagnóstico y logs copiados.");
  } catch {
    showToast("No se pudo copiar el diagnóstico.", true);
  }
});

function profileCompatibilityText(compatibility) {
  if (compatibility === "supported")
    return "Reconocido por la lista actual de accesorios Matter de Apple Home.";
  if (compatibility === "experimental")
    return "Tipo Matter oficial; Apple Home no lo lista actualmente como categoría Matter compatible.";
  return "Tipo Matter oficial, pero Apple Home no lo reconoce actualmente como categoría Matter compatible.";
}

async function updateProfile(entity, profileId) {
  if (
    !profileId ||
    profileId === entity.profileId ||
    profileId === entity.matterType
  )
    return;
  els.profileSelect.disabled = true;
  try {
    const result = await request(
      `/device-profile/${encodeURIComponent(entity.entityId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      },
    );
    if (!result.success)
      throw new Error(result.error || "No se pudo cambiar el perfil Matter");
    showToast(`Perfil Matter actualizado para ${displayName(entity)}.`);
    await fetchDevices();
    const device = groupEntities(state.entities).find(
      (item) => item.id === state.activeDevice?.id,
    );
    if (device) openDevice(device);
  } catch (error) {
    showToast(error.message || "No se pudo cambiar el perfil Matter.", true);
    els.profileSelect.disabled = false;
  }
}

async function toggleEntity(entity, checkbox) {
  const next = checkbox.checked;
  checkbox.disabled = true;
  try {
    const result = await request(
      `/${next ? "register" : "unregister"}/${encodeURIComponent(entity.entityId)}`,
      { method: "POST" },
    );
    if (!result.success)
      throw new Error(result.error || "No se pudo actualizar la entidad");
    entity.exported = next;
    const compositeLabel = entity.composite
      ? "El dispositivo completo"
      : displayName(entity);
    showToast(
      next
        ? `${compositeLabel} se publicó en Matter.`
        : `${compositeLabel} se retiró de Matter.`,
    );
    // Refresh device list in background without closing the modal
    void fetchDevices();
    // Update only the current entity row state without reopening the modal
    const fresh = await request("/devices");
    if (Array.isArray(fresh)) {
      state.entities = fresh;
      renderDevices();
      // If modal is open, update selection panel for the affected entity only
      if (
        state.activeEntity?.entityId === entity.entityId &&
        els.deviceModal.classList.contains("open")
      ) {
        const updated = fresh.find((e) => e.entityId === entity.entityId);
        if (updated) {
          state.activeEntity = updated;
          // Update the entity row export badge without full modal re-open
          const row = els.entityList.querySelector(
            `[data-entity-id="${CSS.escape(entity.entityId)}"]`,
          );
          if (row) {
            row.classList.toggle("dimmed", !updated.exported);
            const cb = row.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = !!updated.exported;
          }
          selectEntity(updated);
        }
      }
    }
  } catch (error) {
    checkbox.checked = !next;
    showToast(error.message || "No se pudo actualizar la entidad.", true);
  } finally {
    checkbox.disabled = false;
  }
}

function openConfirm(title, description, action) {
  els.confirmTitle.textContent = title;
  els.confirmDescription.textContent = description;
  state.confirmAction = action;
  setModalOpen(els.confirmModal, true);
}

function showQrCode(entity) {
  if (!entity) return;

  if (entity.domain === "camera" && entity.homekitCamera) {
    if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "none";
    const setupUri = entity.homekitCamera.setupUri || entity.pairingCode;
    const pin = entity.homekitCamera.pincode
      ? entity.homekitCamera.pincode
      : entity.manualPairingCode || entity.pairingCode;
    if (els.manualCodeLabel)
      els.manualCodeLabel.textContent = "PIN HOMEKIT (MANUAL)";
    renderQrCodePayload(entity, setupUri, pin);
    const hk = entity.homekitCamera;
    const strategyDesc =
      hk.liveViewStatus || "Passthrough H.264 (Sin transcodificación)";
    const snapshotDesc =
      hk.snapshotStatus || "Disponible (Home Assistant Proxy)";
    const audioDesc = hk.audioStatus || "Audio activo (AAC)";
    const recDesc = hk.recordingStatus || "🔴 HKSV no compatible";
    const pairingDesc =
      hk.pairingState || "Publicado; emparejamiento administrado en Apple Home";
    const ffmpegDesc = hk.ffmpegVersion
      ? `FFmpeg: ${hk.ffmpegVersion}`
      : "FFmpeg disponible";
    const hksvActionBtn = hk.hksvCapable
      ? `<button id="toggle-camera-hksv-btn" type="button" style="width:100%;margin-top:6px;padding:8px 12px;background:${hk.hksvEnabled ? "#475569" : "#10b981"};color:#ffffff;border:none;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;">${hk.hksvEnabled ? "⏹ Desactivar HKSV (Solo Live View)" : "▶️ Habilitar HKSV (Grabación en iCloud)"}</button>`
      : "";

    const motionDesc =
      hk.motionSensorStatus ||
      (hk.motionSensorSupported
        ? "Integrado (HomeKit MotionSensor — Trigger HKSV)"
        : "MotionSensor no disponible desde Home Assistant");

    if (els.cameraDetailsContainer) {
      els.cameraDetailsContainer.style.display = "block";
      els.cameraDetailsContainer.innerHTML = `
        <div style="font-size:0.95rem;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
          <span>🍎 Apple Home (HomeKit HAP)</span>
          <span style="font-size:0.75rem;padding:2px 6px;background:rgba(16,185,129,0.15);color:#10b981;border-radius:4px;font-weight:600;">Nativo Live View & HKSV</span>
        </div>
        <div style="color:var(--text-secondary);margin-bottom:2px;">• <strong>Live View:</strong> ${escapeHtml(strategyDesc)}</div>
        <div style="color:var(--text-secondary);margin-bottom:2px;">• <strong>Snapshot:</strong> ${escapeHtml(snapshotDesc)}</div>
        <div style="color:var(--text-secondary);margin-bottom:2px;">• <strong>Audio:</strong> ${escapeHtml(audioDesc)}</div>
        <div style="color:var(--text-secondary);margin-bottom:2px;">• <strong>Grabación (HKSV):</strong> ${escapeHtml(recDesc)}</div>
        <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;padding-left:8px;">↳ Requisitos: Home Hub requerido (Apple TV 4K / HomePod) · iCloud+ requerido</div>
        <div style="color:var(--text-secondary);margin-bottom:2px;">• <strong>Sensor Movimiento:</strong> ${escapeHtml(motionDesc)}</div>
        <div style="color:var(--text-secondary);margin-bottom:2px;">• <strong>Estado Pairing:</strong> ${escapeHtml(pairingDesc)}</div>
        <div style="color:var(--text-secondary);margin-bottom:8px;">• <strong>Motor:</strong> ${escapeHtml(ffmpegDesc)} · Puerto: ${hk.port}</div>
        ${hksvActionBtn}
        <button id="set-camera-motion-btn" type="button" style="width:100%;margin-top:4px;padding:6px 10px;background:#475569;color:#ffffff;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">⚙️ Vincular sensor de movimiento</button>
        <button id="reset-camera-pairing-btn" type="button" style="width:100%;margin-top:4px;padding:6px 10px;background:#3b82f6;color:#ffffff;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">🔄 Reiniciar emparejamiento / Añadir a otra casa</button>
        <div style="margin-top:12px;text-align:left;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:8px;padding:8px 10px;font-size:0.75rem;color:var(--text-secondary);">
          <div style="font-weight:600;color:var(--text-primary);margin-bottom:2px;">🧪 Matter Camera 1.5/1.6 (Backend Desacoplado)</div>
          <div>Device Type: 0x0142 · Clusters: 0x0551, 0x0553. <em>Nota: Apple Home no utiliza Matter para live view ni grabación; usa el QR HomeKit superior.</em></div>
        </div>
      `;
    }

    const toggleHksvBtn = document.getElementById("toggle-camera-hksv-btn");
    if (toggleHksvBtn) {
      toggleHksvBtn.addEventListener("click", async () => {
        try {
          toggleHksvBtn.disabled = true;
          const nextState = !hk.hksvEnabled;
          const res = await request(
            `/camera-hksv/${encodeURIComponent(entity.entityId)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled: nextState }),
            },
          );
          if (!res.success)
            throw new Error(res.error || "No se pudo cambiar el estado HKSV");
          showToast(
            nextState
              ? "HKSV habilitado. Configura la grabación en la app Casa."
              : "HKSV pausado para esta cámara.",
          );
          await fetchDevices(true);
        } catch (err) {
          showToast(err.message || "Error al actualizar HKSV", true);
          toggleHksvBtn.disabled = false;
        }
      });
    }

    const motionBtn = document.getElementById("set-camera-motion-btn");
    if (motionBtn) {
      motionBtn.addEventListener("click", async () => {
        const current = hk.motionSensorEntityId || "";
        const selected = window.prompt(
          "Escribe la entidad binary_sensor de movimiento (vacío para volver a detección automática):",
          current,
        );
        if (selected === null) return;
        try {
          motionBtn.disabled = true;
          const res = await request(
            `/camera-motion-sensor/${encodeURIComponent(entity.entityId)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ motionEntityId: selected.trim() }),
            },
          );
          if (!res.success)
            throw new Error(res.error || "No se pudo vincular el sensor.");
          showToast(
            "Sensor guardado. Reinicia el emparejamiento de la cámara para que Apple Home reciba el servicio.",
          );
          await fetchDevices(true);
        } catch (err) {
          showToast(err.message || "Error al vincular el sensor.", true);
        } finally {
          motionBtn.disabled = false;
        }
      });
    }

    const resetBtn = document.getElementById("reset-camera-pairing-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        openConfirm(
          "Reiniciar emparejamiento HomeKit",
          `Se generará un nuevo código PIN y MAC para la cámara ${entity.entityId}. Deberás volver a escanear el nuevo código QR en Apple Home.`,
          async () => {
            try {
              resetBtn.disabled = true;
              resetBtn.textContent = "Reiniciando…";
              const res = await request(
                `/reset-camera-pairing/${encodeURIComponent(entity.entityId)}`,
                { method: "POST" },
              );
              if (!res.success)
                throw new Error(
                  res.error || "No se pudo reiniciar emparejamiento.",
                );
              showToast("Emparejamiento HomeKit reiniciado con éxito.");
              await fetchDevices(true);
            } catch (err) {
              showToast(err.message || "Error al reiniciar.", true);
              resetBtn.disabled = false;
              resetBtn.textContent =
                "🔄 Reiniciar emparejamiento / Añadir a otra casa";
            }
          },
        );
      });
    }

    els.deviceQrContainer.style.display = "block";
    return;
  }

  // Standard Matter accessories (lights, switches, plugs, locks, fans, covers, sensors, appliances)
  renderDeviceQr(entity);
}

function renderQrCodePayload(entity, code, manualCodeText) {
  if (!code) {
    if (els.deviceQrContainer) els.deviceQrContainer.style.display = "none";
    if (els.qrCenterLogo) els.qrCenterLogo.style.display = "none";
    return;
  }

  if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "none";
  if (els.deviceManualCode) {
    els.deviceManualCode.textContent = manualCodeText || code;
  }

  // renderQrSection hides the container before every refresh. If this is the
  // same valid Multi-Admin code, retain the already generated QR but make it
  // visible again instead of returning with an empty panel.
  if (els.deviceQrCode && els.deviceQrCode.dataset.pairingCode === code) {
    if (els.deviceQrContainer) els.deviceQrContainer.style.display = "block";
    if (els.qrCenterLogo) els.qrCenterLogo.style.display = "flex";
    return;
  }

  if (els.deviceQrCode) {
    els.deviceQrCode.innerHTML = "";
    els.deviceQrCode.dataset.entityId = entity?.entityId || "";
    els.deviceQrCode.dataset.pairingCode = code;

    try {
      if (typeof QRCode !== "undefined") {
        new QRCode(els.deviceQrCode, {
          text: code,
          width: 224,
          height: 224,
          colorDark: "#09101f",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H,
        });
        if (els.qrCenterLogo) els.qrCenterLogo.style.display = "flex";
      } else {
        els.deviceQrCode.textContent = "Librería QR no cargada.";
        if (els.qrCenterLogo) els.qrCenterLogo.style.display = "none";
      }
    } catch (err) {
      console.error("Error al renderizar código QR:", err);
      els.deviceQrCode.textContent = "Error al generar código QR.";
      if (els.qrCenterLogo) els.qrCenterLogo.style.display = "none";
    }
  }

  if (els.deviceQrContainer) els.deviceQrContainer.style.display = "block";
}

function formatManualCode(code) {
  if (!code) return "—————";
  const str = String(code).trim();
  if (str.includes("-") || str.includes(" ")) return str;
  if (/^\d{11}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 7)}-${str.slice(7)}`;
  }
  if (/^\d{21}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 7)}-${str.slice(7, 11)}-${str.slice(11, 15)}-${str.slice(15, 19)}-${str.slice(19)}`;
  }
  return str;
}

function renderDeviceQr(entity) {
  if (!entity || !entity.pairingCode) return;
  if (els.manualCodeLabel)
    els.manualCodeLabel.textContent = "CÓDIGO NUMÉRICO MANUAL";
  if (els.cameraDetailsContainer) {
    els.cameraDetailsContainer.style.display = "none";
    els.cameraDetailsContainer.innerHTML = "";
  }
  // renderQrSection hides the container before every refresh. If this is the
  // same valid Multi-Admin code, retain the already generated QR but make it
  // visible again instead of returning with an empty panel.
  renderQrCodePayload(
    entity,
    entity.pairingCode,
    formatManualCode(entity.manualPairingCode || entity.pairingCode),
  );
}

// Copy manual pairing code with 1 click
els.copyManualCodeBtn?.addEventListener("click", async () => {
  const codeText = els.deviceManualCode?.textContent?.trim();
  if (!codeText || codeText === "—————") return;
  const cleanCode = codeText.replace(/\s+/g, "");
  try {
    await navigator.clipboard.writeText(cleanCode);
    const copyTextEl = els.copyManualCodeBtn.querySelector(".copy-text");
    if (copyTextEl) copyTextEl.textContent = "¡Copiado!";
    els.copyManualCodeBtn.classList.add("copied");
    showToast("✓ Código copiado al portapapeles: " + cleanCode);
    setTimeout(() => {
      if (copyTextEl) copyTextEl.textContent = "Copiar";
      els.copyManualCodeBtn.classList.remove("copied");
    }, 2500);
  } catch {
    showToast("Código: " + cleanCode);
  }
});

// Download high-resolution QR image (PNG)
els.downloadQrBtn?.addEventListener("click", () => {
  const pairingCode = els.deviceQrCode?.dataset.pairingCode;
  if (!pairingCode) return;
  const entityName =
    state.activeEntity?.name || state.activeDevice?.name || "matter-accessory";
  const filename = `${entityName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr.png`;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    if (typeof QRCode !== "undefined" && QRCode.toCanvas) {
      QRCode.toCanvas(canvas, pairingCode, {
        width: 900,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#09101f", light: "#ffffff" },
      })
        .then(() => {
          const logoImg = new Image();
          logoImg.onload = () => {
            const logoSize = 180;
            const pos = (1024 - logoSize) / 2;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.roundRect(pos - 12, pos - 12, logoSize + 24, logoSize + 24, 28);
            ctx.fill();
            ctx.shadowColor = "rgba(0,0,0,0.25)";
            ctx.shadowBlur = 18;
            ctx.drawImage(logoImg, pos, pos, logoSize, logoSize);

            const a = document.createElement("a");
            a.download = filename;
            a.href = canvas.toDataURL("image/png");
            a.click();
            showToast("✓ Código QR descargado exitosamente");
          };
          logoImg.onerror = () => {
            const a = document.createElement("a");
            a.download = filename;
            a.href = canvas.toDataURL("image/png");
            a.click();
            showToast("✓ Código QR descargado");
          };
          logoImg.src = "logo.png";
        })
        .catch(() => {
          QRCode.toDataURL(pairingCode, {
            width: 1024,
            errorCorrectionLevel: "H",
          }).then((url) => {
            const a = document.createElement("a");
            a.download = filename;
            a.href = url;
            a.click();
            showToast("✓ Código QR descargado");
          });
        });
    } else {
      showToast("Descarga no disponible en este navegador", true);
    }
  } catch (err) {
    console.error("Error al descargar QR:", err);
    showToast("Error al exportar código QR", true);
  }
});

els.deviceSearch.addEventListener("input", renderDevices);
document.querySelectorAll(".filter-chip").forEach((button) =>
  button.addEventListener("click", () => {
    state.activeFilter = button.dataset.filter || "all";
    document
      .querySelectorAll(".filter-chip")
      .forEach((chip) => chip.classList.toggle("active", chip === button));
    renderDevices();
  }),
);
els.profileSelect.addEventListener("change", () => {
  if (state.activeEntity)
    void updateProfile(state.activeEntity, els.profileSelect.value);
});

async function pollForPairingCode(entityOrId, maxAttempts = 40) {
  const targetEntityId =
    typeof entityOrId === "object" && entityOrId !== null
      ? entityOrId.entityId
      : entityOrId;
  if (!targetEntityId) return;
  if (state.qrPollingEntityId === targetEntityId) return;
  state.qrPollingEntityId = targetEntityId;

  // Cancel any previous spinner
  if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "flex";
  if (els.deviceQrContainer) els.deviceQrContainer.style.display = "none";

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const fresh = await request("/devices");
      if (Array.isArray(fresh)) {
        state.entities = fresh;
        const found = fresh.find((e) => e.entityId === targetEntityId);
        if (found && found.pairingCode) {
          if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "none";
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
  if (els.qrSpinnerWrap && els.qrSpinnerWrap.style.display !== "none") {
    els.qrSpinnerWrap.style.display = "none";
    if (els.deviceQrCode)
      els.deviceQrCode.innerHTML =
        '<p style="color:var(--muted);font-size:0.85rem;">No se pudo generar el código QR. Presiona Recargar.</p>';
    if (els.deviceQrContainer) els.deviceQrContainer.style.display = "block";
  }
  if (state.qrPollingEntityId === targetEntityId)
    state.qrPollingEntityId = null;
}

els.deviceQrButton.addEventListener("click", async () => {
  const entity = state.activeEntity;
  if (!entity) return;

  // If already open in Multi-Admin mode: toggle off / close
  if (state.multiAdminOpenEntityId === entity.entityId) {
    state.multiAdminOpenEntityId = null;
    renderQrSection(entity);
    showToast("Ventana de emparejamiento cerrada en pantalla.");
    return;
  }

  // If commissioned, open Matter commissioning window via backend API
  if (entity.commissioned) {
    els.deviceQrButton.disabled = true;
    els.deviceQrButton.textContent = "Abriendo ventana Matter…";
    if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "flex";
    if (els.deviceQrContainer) els.deviceQrContainer.style.display = "none";

    try {
      const res = await request(
        `/open-commissioning/${encodeURIComponent(entity.entityId)}`,
        { method: "POST" },
      );
      if (!res.success)
        throw new Error(
          res.error || "No se pudo abrir la ventana de emparejamiento",
        );
      state.multiAdminOpenEntityId = entity.entityId;
      if (res.pairingCode) {
        entity.pairingCode = res.pairingCode;
        entity.manualPairingCode = res.manualPairingCode;
      }
      showToast(
        "✓ Modo Multi-Admin abierto (15 min). Ya puedes escanear en Google Home, Alexa o SmartThings.",
      );
      renderQrSection(entity);
    } catch (err) {
      showToast(
        err.message || "Error al abrir ventana de emparejamiento.",
        true,
      );
      renderQrSection(entity);
    }
    return;
  }

  // Not commissioned: simple display toggle
  if (els.deviceQrContainer.style.display !== "none") {
    els.deviceQrContainer.style.display = "none";
    els.deviceQrButton.textContent = "Ver Código QR";
  } else {
    showQrCode(entity);
    els.deviceQrButton.textContent = "Ocultar Código QR";
  }
});

const doResetAccessory = () => {
  const entity = state.activeEntity;
  if (!entity) return;
  openConfirm(
    "Desconectar todo y generar nuevo QR",
    `Se desvincularán todos los controladores Matter de ${displayName(entity)} (Apple Home, Google Home, SmartThings, Alexa, etc.) y se regenerarán sus credenciales con un nuevo código QR limpio.`,
    async () => {
      const buttons = [
        els.resetAccessoryButton,
        els.regenerateCodeButton,
      ].filter(Boolean);
      try {
        buttons.forEach((button) => (button.disabled = true));
        if (els.qrSpinnerWrap) els.qrSpinnerWrap.style.display = "flex";
        const result = await request(
          `/reset-accessory/${encodeURIComponent(entity.entityId)}`,
          { method: "POST" },
        );
        if (!result.success)
          throw new Error(
            result.error || "No se pudo restablecer el accesorio",
          );
        if (result.pairingCode) {
          entity.pairingCode = result.pairingCode;
          entity.manualPairingCode = result.manualPairingCode;
          entity.commissioned = false;
          entity.matterFabrics = [];
          entity.fabricCount = 0;
          entity.homeName = null;
          showQrCode(entity);
          els.deviceQrButton.textContent = "Ocultar Código QR";
          showToast(
            "Accesorio desvinculado de todas las casas. Nuevo código QR listo.",
          );
          void fetchDevices(true);
        } else {
          showToast("Desvinculación solicitada. Esperando nuevo código QR…");
          void pollForPairingCode(entity.entityId);
        }
      } catch (error) {
        showToast(
          error.message || "No se pudo restablecer el accesorio.",
          true,
        );
      } finally {
        buttons.forEach((button) => (button.disabled = false));
      }
    },
  );
};

if (els.resetAccessoryButton)
  els.resetAccessoryButton.addEventListener("click", doResetAccessory);
if (els.regenerateCodeButton)
  els.regenerateCodeButton.addEventListener("click", doResetAccessory);

els.reconnectAccessoryButton.addEventListener("click", async () => {
  const entity = state.activeEntity;
  if (!entity) return;
  els.reconnectAccessoryButton.disabled = true;
  try {
    const result = await request(
      `/refresh-accessory/${encodeURIComponent(entity.entityId)}`,
      { method: "POST" },
    );
    if (!result.success)
      throw new Error(result.error || "No se pudo sincronizar");
    await fetchDevices(true);
    showToast("Estado sincronizado con Home Assistant y Matter.");
  } catch (error) {
    showToast(
      error.message || "No se pudo sincronizar el estado Matter.",
      true,
    );
  } finally {
    els.reconnectAccessoryButton.disabled = false;
  }
});

els.refreshButton.addEventListener("click", async () => {
  await Promise.all([fetchStatus(), fetchDevices()]);
  showToast("Lista actualizada.");
});
els.deviceModalClose.addEventListener("click", () =>
  setModalOpen(els.deviceModal, false),
);
els.settingsButton.addEventListener("click", () =>
  setModalOpen(els.settingsModal, true),
);
els.settingsModalClose.addEventListener("click", () =>
  setModalOpen(els.settingsModal, false),
);
els.confirmCancel.addEventListener("click", () =>
  setModalOpen(els.confirmModal, false),
);
els.confirmAccept.addEventListener("click", async () => {
  const action = state.confirmAction;
  setModalOpen(els.confirmModal, false);
  if (action) await action();
});
const doRestart = () =>
  openConfirm(
    "Reiniciar servicio",
    "El servicio se reiniciará y las conexiones Matter se restablecerán durante unos segundos.",
    async () => {
      try {
        await request("/restart", { method: "POST" });
        showToast("El servicio se está reiniciando.");
      } catch {
        showToast("No se pudo solicitar el reinicio.", true);
      }
    },
  );
if (els.quickRestartButton)
  els.quickRestartButton.addEventListener("click", doRestart);
els.restartButton.addEventListener("click", doRestart);
els.factoryResetButton.addEventListener("click", () =>
  openConfirm(
    "Restablecimiento de fábrica",
    "Esta operación elimina configuración y emparejamientos. Tendrás que volver a configurar y emparejar los accesorios.",
    async () => {
      try {
        await request("/factoryreset", { method: "POST" });
        showToast("Restablecimiento solicitado.");
      } catch {
        showToast("No se pudo solicitar el restablecimiento.", true);
      }
    },
  ),
);
[els.deviceModal, els.settingsModal].forEach((modal) =>
  modal.addEventListener("click", (event) => {
    if (event.target === modal) setModalOpen(modal, false);
  }),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const topModal = [
      els.confirmModal,
      els.settingsModal,
      els.deviceModal,
    ].find((modal) => modal && modal.classList.contains("open"));
    if (topModal) setModalOpen(topModal, false);
  }
});

// --- Adaptive Polling & Lifecycle Management (CPU Optimized for Raspberry Pi 5) ---
let currentSSE = null;
let sseRetryDelay = 1000;
let sseReconnectTimer = null;
let devicesPollTimer = null;
let statusPollTimer = null;

function isSSEActive() {
  return currentSSE && currentSSE.readyState === EventSource.OPEN;
}

function scheduleNextDevicesPoll() {
  if (devicesPollTimer) clearTimeout(devicesPollTimer);
  if (document.hidden) return;
  // Responsive 10s poll heartbeat when SSE is active (<0.2% CPU on RPi 5),
  // and 5s fallback when reconnecting to keep BLE fans and states in real-time.
  const interval = isSSEActive() ? 10000 : 5000;
  devicesPollTimer = setTimeout(async () => {
    if (!document.hidden) {
      await fetchDevices(true);
    }
    scheduleNextDevicesPoll();
  }, interval);
}

function scheduleNextStatusPoll() {
  if (statusPollTimer) clearTimeout(statusPollTimer);
  if (document.hidden) return;
  const interval = isSSEActive() ? 30000 : 10000;
  statusPollTimer = setTimeout(async () => {
    if (!document.hidden) {
      await fetchStatus();
    }
    scheduleNextStatusPoll();
  }, interval);
}

// React instantly when user switches back to the Home Assistant tab:
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    void fetchStatus();
    void fetchDevices(true);
    if (!isSSEActive()) connectSSE();
    scheduleNextDevicesPoll();
    scheduleNextStatusPoll();
  } else {
    if (devicesPollTimer) clearTimeout(devicesPollTimer);
    if (statusPollTimer) clearTimeout(statusPollTimer);
  }
});

function connectSSE() {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  if (currentSSE) {
    try {
      currentSSE.close();
    } catch {}
    currentSSE = null;
  }

  try {
    const sse = new EventSource(`${API}/events`);
    currentSSE = sse;

    sse.onopen = () => {
      sseRetryDelay = 1000;
      void fetchDevices(true);
      scheduleNextDevicesPoll();
      scheduleNextStatusPoll();
    };

    sse.onmessage = (ev) => {
      try {
        const update = JSON.parse(ev.data);
        if (update && update.type === "scrypted_status") {
          if (!state.scryptedConfig) state.scryptedConfig = {};
          state.scryptedConfig.connectionStatus = update.status;
          updateScryptedHeader();
          return;
        }
        if (update && update.type === "cameras_updated") {
          state.scryptedCameras = update.cameras || [];
          updateScryptedHeader();
          renderDevices();
          return;
        }
        if (!update || !update.entityId) return;
        const idx = state.entities.findIndex(
          (e) => e.entityId === update.entityId,
        );
        if (idx !== -1) {
          if (update.type === "state_changed") {
            state.entities[idx].state = update.state;
            if (state.entities[idx].rawState) {
              state.entities[idx].rawState.state = update.state;
              Object.assign(
                state.entities[idx].rawState.attributes || {},
                update.attributes || {},
              );
            }
          } else {
            state.entities[idx] = { ...state.entities[idx], ...update };
          }
          renderDevices();
          if (
            state.activeEntity?.entityId === update.entityId &&
            els.deviceModal.classList.contains("open")
          ) {
            state.activeEntity = state.entities[idx];
            selectEntity(state.activeEntity);
          }
        }
      } catch {
        // ignore non-JSON or ping messages
      }
    };

    sse.onerror = () => {
      if (currentSSE === sse) {
        try {
          sse.close();
        } catch {}
        currentSSE = null;
      }
      scheduleNextDevicesPoll();
      const delay = sseRetryDelay;
      sseRetryDelay = Math.min(sseRetryDelay * 2, 15000);
      sseReconnectTimer = setTimeout(connectSSE, delay);
    };
  } catch {
    scheduleNextDevicesPoll();
    sseReconnectTimer = setTimeout(connectSSE, 10000);
  }
}

void fetchStatus();
void fetchDevices();
connectSSE();
scheduleNextDevicesPoll();
scheduleNextStatusPoll();

// MQTT Configuration
const mqttHostInput = $("mqtt-host");
const mqttPortInput = $("mqtt-port");
const mqttUserInput = $("mqtt-user");
const mqttPassInput = $("mqtt-pass");
const mqttSaveButton = $("mqtt-save-button");

async function loadMqttConfig() {
  try {
    const res = await request("/mqtt-config");
    if (res) {
      if (mqttHostInput) mqttHostInput.value = res.host || "";
      if (mqttPortInput) mqttPortInput.value = res.port || "";
      if (mqttUserInput) mqttUserInput.value = res.user || "";
      if (mqttPassInput) mqttPassInput.value = res.password || "";
    }
  } catch (e) {
    console.error("Failed to load MQTT config", e);
  }
}

if (mqttSaveButton) {
  mqttSaveButton.addEventListener("click", async () => {
    const data = {
      host: mqttHostInput?.value || "",
      port: Number(mqttPortInput?.value) || 1883,
      user: mqttUserInput?.value || "",
      password: mqttPassInput?.value || "",
    };
    try {
      await request("/mqtt-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      showToast(
        "Configuración MQTT guardada. Reinicia el servicio para aplicar.",
      );
    } catch (e) {
      showToast(
        "Error al guardar configuración MQTT: " + (e.message || e),
        true,
      );
    }
  });
}

// Load config when settings modal opens
els.settingsButton?.addEventListener("click", () => {
  void loadMqttConfig();
});

// ==========================================================================
// SCRYPTED CAMERA INTEGRATION & MODEL GROUPING
// ==========================================================================

async function fetchScrypted() {
  try {
    const [cfg, cams] = await Promise.all([
      request("/scrypted/config").catch(() => null),
      request("/cameras").catch(() => null),
    ]);
    if (cfg) state.scryptedConfig = cfg;
    if (cams) {
      state.scryptedCameras = Array.isArray(cams)
        ? cams
        : Array.isArray(cams.cameras)
          ? cams.cameras
          : [];
    }
    updateScryptedHeader();
  } catch (err) {
    console.debug("[Scrypted] Error fetching state:", err);
  }
}

function updateScryptedHeader() {
  if (!els.scryptedHeaderBar) return;
  const cfg = state.scryptedConfig;
  const count = state.scryptedCameras ? state.scryptedCameras.length : 0;

  if (els.scryptedHostDisplay) {
    let hostLabel = "No configurado";
    if (cfg && cfg.serverUrl) {
      try {
        hostLabel = new URL(cfg.serverUrl).host;
      } catch {
        hostLabel = cfg.serverUrl;
      }
    }
    els.scryptedHostDisplay.textContent = hostLabel;
  }

  if (els.scryptedCamerasCount) {
    els.scryptedCamerasCount.textContent = `${count} cámara${count === 1 ? "" : "s"}`;
  }

  if (els.scryptedStatusPill) {
    const status = cfg?.connectionStatus || "not_configured";
    if (status === "connected") {
      els.scryptedStatusPill.textContent = "🟢 Conectado";
      els.scryptedStatusPill.style.borderColor = "rgba(52, 211, 153, 0.6)";
    } else if (status === "disconnected_using_cache") {
      els.scryptedStatusPill.textContent = "⚠️ Desconectado (usando caché)";
      els.scryptedStatusPill.style.borderColor = "rgba(251, 191, 36, 0.6)";
    } else if (status === "reconnecting") {
      els.scryptedStatusPill.textContent = "🔄 Reconectando...";
      els.scryptedStatusPill.style.borderColor = "rgba(56, 189, 248, 0.6)";
    } else if (status === "error") {
      els.scryptedStatusPill.textContent = "🔴 Error de conexión";
      els.scryptedStatusPill.style.borderColor = "rgba(239, 68, 68, 0.6)";
    } else {
      els.scryptedStatusPill.textContent = "🔌 No configurado";
      els.scryptedStatusPill.style.borderColor = "rgba(255, 255, 255, 0.2)";
    }
  }

  if (els.scryptedLastUpdate) {
    if (cfg?.lastConnected) {
      const date = new Date(cfg.lastConnected);
      els.scryptedLastUpdate.textContent = `🕐 Actualizado ${date.toLocaleTimeString()}`;
    } else {
      els.scryptedLastUpdate.textContent = "🕐 No sincronizado";
    }
  }
}

function normalizeForGroup(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const unknownValues = [
    "",
    "unknown",
    "n/a",
    "na",
    "desconocido",
    "sin marca",
    "other",
    "otras marcas",
    "generic",
    "cámara ip",
    "camara ip",
    "marca no identificada",
    "modelo no identificado",
  ];
  return unknownValues.includes(v) ? null : v;
}

function extractCameraBrand(item) {
  if (!item) return "Marca no identificada";

  // 1. Check server-resolved displayManufacturer
  if (item.displayManufacturer) {
    const norm = normalizeForGroup(item.displayManufacturer);
    if (norm !== null) {
      return item.displayManufacturer.trim();
    }
  }

  // 2. Check manual override
  if (item.identityOverride?.manufacturer) {
    const norm = normalizeForGroup(item.identityOverride.manufacturer);
    if (norm !== null) {
      return item.identityOverride.manufacturer.trim();
    }
  }

  // 3. Check sourceManufacturer
  if (item.sourceManufacturer) {
    const norm = normalizeForGroup(item.sourceManufacturer);
    if (norm !== null) {
      return item.sourceManufacturer.trim();
    }
  }

  // 4. Check raw manufacturer or brand fields (e.g. from HA devices)
  const rawBrand =
    item.manufacturer ||
    item.brand ||
    item.info?.manufacturer ||
    "";
  const rawModel = item.model || item.info?.model || "";
  const rawName = item.name || item.deviceName || "";
  const combined = `${rawBrand} ${rawModel} ${rawName}`.toLowerCase();

  if (combined.includes("ring")) return "Ring";
  if (combined.includes("nest") || combined.includes("google")) return "Google Nest";
  if (combined.includes("wyze")) return "Wyze";
  if (
    combined.includes("tapo") ||
    combined.includes("tp-link") ||
    combined.includes("tplink")
  )
    return "Tapo";
  if (combined.includes("aqara")) return "Aqara";
  if (combined.includes("eufy") || combined.includes("anker")) return "Eufy";
  if (combined.includes("reolink")) return "Reolink";
  if (combined.includes("amcrest")) return "Amcrest";
  if (combined.includes("dahua")) return "Dahua";
  if (combined.includes("hikvision")) return "Hikvision";
  if (combined.includes("blink")) return "Blink";
  if (combined.includes("arlo")) return "Arlo";
  if (combined.includes("ezviz")) return "Ezviz";
  if (combined.includes("imou")) return "Imou";
  if (combined.includes("unifi") || combined.includes("ubiquiti")) return "UniFi";
  if (combined.includes("sonoff")) return "Sonoff";
  if (combined.includes("tuya") || combined.includes("smart life")) return "Tuya";
  if (combined.includes("xiaomi") || combined.includes("mijia")) return "Xiaomi";

  const normRaw = normalizeForGroup(rawBrand);
  if (normRaw !== null) {
    return rawBrand.trim();
  }

  return "Marca no identificada";
}
window.extractCameraBrand = extractCameraBrand;

function buildScryptedCameraElements(query) {
  if (!state.scryptedCameras || state.scryptedCameras.length === 0) return [];

  const filtered = state.scryptedCameras.filter((cam) => {
    if (!query) return true;
    return (
      (cam.name || "").toLowerCase().includes(query) ||
      (cam.displayModel || cam.model || "").toLowerCase().includes(query) ||
      (cam.cameraId || "").toLowerCase().includes(query) ||
      extractCameraBrand(cam).toLowerCase().includes(query)
    );
  });

  // Agrupación automática únicamente por MARCA
  const camerasByBrand = filtered.reduce((acc, camera) => {
    const brand = extractCameraBrand(camera);
    if (!acc[brand]) {
      acc[brand] = [];
    }
    acc[brand].push(camera);
    return acc;
  }, {});

  const sortedBrands = Object.keys(camerasByBrand).sort((a, b) => {
    const isAUnknown = a.toLowerCase() === "marca no identificada";
    const isBUnknown = b.toLowerCase() === "marca no identificada";
    if (isAUnknown && !isBUnknown) return 1;
    if (!isAUnknown && isBUnknown) return -1;
    return a.localeCompare(b, "es", { sensitivity: "base" });
  });

  const sections = [];
  for (const brandName of sortedBrands) {
    const brandCameras = camerasByBrand[brandName];
    brandCameras.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "es", { sensitivity: "base" }),
    );

    const section = document.createElement("section");
    section.className = "camera-brand-group";

    const header = document.createElement("header");
    header.className = "camera-brand-group__header";

    const h3 = document.createElement("h3");
    h3.textContent = `📹 ${brandName}`;

    const countSpan = document.createElement("span");
    countSpan.className = "brand-camera-count";
    countSpan.textContent = `${brandCameras.length} ${brandCameras.length === 1 ? "cámara" : "cámaras"}`;

    header.appendChild(h3);
    header.appendChild(countSpan);

    const grid = document.createElement("div");
    grid.className = "cameras-grid";
    for (const camera of brandCameras) {
      grid.appendChild(renderCameraCard(camera));
    }

    section.appendChild(header);
    section.appendChild(grid);
    sections.push(section);
  }
  return sections;
}

function buildScryptedModelSection(brandName, cameras) {
  cameras.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "es", { sensitivity: "base" }),
  );

  const section = document.createElement("section");
  section.className = "camera-brand-group";

  const header = document.createElement("header");
  header.className = "camera-brand-group__header";

  const h3 = document.createElement("h3");
  h3.textContent = `📹 ${brandName}`;

  const countSpan = document.createElement("span");
  countSpan.className = "brand-camera-count";
  countSpan.textContent = `${cameras.length} ${cameras.length === 1 ? "cámara" : "cámaras"}`;

  header.appendChild(h3);
  header.appendChild(countSpan);

  const grid = document.createElement("div");
  grid.className = "cameras-grid";
  for (const camera of cameras) {
    grid.appendChild(renderCameraCard(camera));
  }

  section.appendChild(header);
  section.appendChild(grid);
  return section;
}

function buildScryptedCameraCard(camera) {
  const card = document.createElement("article");
  card.className = "device-card scrypted-camera-card is-scrypted-camera";
  card.dataset.cameraId = camera.cameraId;

  const brand = extractCameraBrand(camera);
  const isOnline = camera.status?.connection === "online";
  const statusDot = isOnline ? "🟢" : "🔴";
  const statusText = isOnline ? "En línea" : "Desconectado";
  const modelDisplay = camera.displayModel || camera.model || "";
  const sensorsCount = camera.sensors?.length || 0;

  const hasAudio =
    camera.capabilities?.observed?.hasAudio !== false &&
    camera.capabilities?.observed?.audioCodec !== "none";

  const binding = camera.bindingState;
  const isMatterCommissioned = Boolean(binding?.matterCommissioned);
  const realHomeName = binding?.homeName || state.status?.homeName;

  const isPaired = camera.identity?.homeKitPairingState === "paired";
  const hapStateText = isPaired
    ? "🍏 HomeKit: Emparejada"
    : camera.identity?.homeKitPairingState === "unverifiable"
      ? "HomeKit: Estado no verificable"
      : "HomeKit: No emparejada";

  const matterStateText = isMatterCommissioned
    ? "Comisionada"
    : binding?.matterState === "pending"
      ? "Pendiente de vincular"
      : "Estado desconocido";

  const fabricCount = binding?.fabricCount || 0;
  const multiAdminText =
    binding?.multiAdminState === "full"
      ? "Completo"
      : binding?.multiAdminState === "in_use"
        ? `Vinculada a ${fabricCount} fabric${fabricCount === 1 ? "" : "s"}`
        : binding?.multiAdminState === "unavailable"
          ? "No disponible"
          : "Disponible";

  const homeBadge = realHomeName
    ? `<span class="home-badge commissioned" title="Etiqueta del controlador Matter">🏠 ${escapeHtml(realHomeName)}</span>`
    : "";

  const fabricsListHtml =
    binding?.fabrics && binding.fabrics.length > 0
      ? binding.fabrics
          .map((f) => {
            const shortFid =
              f.fabricId && f.fabricId.length > 10
                ? `${f.fabricId.slice(0, 6)}...${f.fabricId.slice(-4)}`
                : f.fabricId || "N/A";
            const label = f.label || "Fabric sin etiqueta";
            return `<span class="tag" style="font-size: 0.68rem; background: rgba(255,255,255,0.06);">#${f.fabricIndex} ${escapeHtml(label)} (FID: ${escapeHtml(shortFid)})</span>`;
          })
          .join(" ")
      : '<span style="color: var(--text-secondary); font-size: 0.72rem;">Sin fabrics comisionadas</span>';

  card.innerHTML = `
    <div class="card-top">
      <span class="device-icon" style="font-size: 1.4rem;">📹</span>
      <div class="card-pills-group">
        <span class="badge-scrypted-tag">SCRYPTED</span>
        ${homeBadge}
        ${isMatterCommissioned ? `<span class="tag" style="background: rgba(59, 130, 246, 0.2); border-color: rgba(96, 165, 250, 0.5); color: #93c5fd; font-size: 0.72rem; font-weight: 600;">⚡ Matter: ${matterStateText}</span>` : `<span class="tag" style="font-size: 0.72rem;">⚡ Matter: ${matterStateText}</span>`}
        ${isPaired ? `<span class="tag" style="background: rgba(16, 185, 129, 0.2); border-color: rgba(52, 211, 153, 0.5); color: #6ee7b7; font-size: 0.72rem; font-weight: 600;">${hapStateText}</span>` : `<span class="tag" style="font-size: 0.72rem;">${hapStateText}</span>`}
      </div>
    </div>
    <h3 title="${escapeHtml(camera.name)}">${escapeHtml(camera.name)}</h3>
    <p class="device-meta">${statusDot} ${statusText} · ${escapeHtml(brand)}${modelDisplay && modelDisplay !== "Modelo no identificado" ? ` (${escapeHtml(modelDisplay)})` : ""}</p>
    
    <!-- Bloque central de vinculación y administración -->
    <div class="camera-admin-block" style="background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px; margin: 8px 0; font-size: 0.75rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>🏠 <strong>Casa:</strong> ${realHomeName ? escapeHtml(realHomeName) : '<em style="color:var(--text-secondary);">nombre no expuesto por Matter</em>'}</span>
        <span>Multi-admin: <strong>${escapeHtml(multiAdminText)}</strong></span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 4px;">
        <span style="color: var(--text-secondary);">Fabrics (${fabricCount}):</span>
        ${fabricsListHtml}
      </div>
    </div>

    <div class="tags">
      <span class="tag tag-brand">${escapeHtml(brand)}</span>
      <span class="badge-scrypted-source">⚡ Scrypted</span>
      <span class="codec-pill">● Passthrough H.264</span>
      ${hasAudio ? '<span class="tag" style="background: rgba(16, 185, 129, 0.15); border-color: rgba(52, 211, 153, 0.4); color: #6ee7b7;">🎤 Entrada de audio</span>' : '<span class="tag">Sin audio</span>'}
      <span class="tag" style="opacity: 0.7;">Talkback: no compatible</span>
      ${sensorsCount > 0 ? `<span class="tag">${sensorsCount} sensor${sensorsCount === 1 ? "" : "es"}</span>` : ""}
    </div>
    <div class="card-footer">
      <span class="entity-summary">${isPaired ? "🍏 HAP: Emparejada" : "Toca para ver QR y detalles"}</span>
      <button class="button button-secondary" type="button">Configurar</button>
    </div>
  `;

  card.addEventListener("click", () => {
    openCameraConfigModal(camera);
  });

  card.querySelector("button")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openCameraConfigModal(camera);
  });

  return card;
}

const renderCameraCard = buildScryptedCameraCard;
window.renderCameraCard = renderCameraCard;

function clearScryptedSecretInputs() {
  if (els.scryptedPassword) els.scryptedPassword.value = "";
  if (els.scryptedApiToken) els.scryptedApiToken.value = "";
  if (els.scryptedServerToken) els.scryptedServerToken.value = "";
}

function setModalState(modalState) {
  const isBusy = modalState === "testing" || modalState === "loading_cameras";
  if (els.scryptedTestBtn) els.scryptedTestBtn.disabled = isBusy;
  if (els.scryptedLoadCamerasBtn) els.scryptedLoadCamerasBtn.disabled = isBusy;
  if (els.scryptedCancelBtn) els.scryptedCancelBtn.disabled = isBusy;
}

function openScryptedModal() {
  if (els.scryptedServerUrl && state.scryptedConfig?.serverUrl) {
    els.scryptedServerUrl.value = state.scryptedConfig.serverUrl;
  }
  if (els.scryptedUsername && state.scryptedConfig?.username) {
    els.scryptedUsername.value = state.scryptedConfig.username;
  }
  clearScryptedSecretInputs();
  if (
    els.scryptedAllowSelfSigned &&
    state.scryptedConfig?.allowSelfSignedCertificate !== undefined
  ) {
    els.scryptedAllowSelfSigned.checked = Boolean(
      state.scryptedConfig.allowSelfSignedCertificate,
    );
  }
  if (els.scryptedTestResult) {
    els.scryptedTestResult.hidden = true;
    els.scryptedTestResult.className = "test-result-box";
    els.scryptedTestResult.textContent = "";
  }
  setModalState("idle");
  setModalOpen(els.scryptedConnectModal, true);
}

function generateCameraSetupId(id) {
  let hash = 0;
  const str = String(id || "camera");
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 37 + str.charCodeAt(i)) >>> 0;
  }
  return (hash & 0xffff)
    .toString(36)
    .toUpperCase()
    .padStart(4, "S")
    .substring(0, 4);
}

function computeHomeKitSetupUri(setupId, pincode = "031-45-154", category = 17) {
  try {
    const pin = parseInt(String(pincode).replace(/-/g, ""), 10);
    const low = (pin | (1 << 28) | (category & 1 ? 1 << 31 : 0)) >>> 0;
    const high = (category >> 1) >>> 0;
    const num = BigInt(high) * 4294967296n + BigInt(low);
    let enc = num.toString(36).toUpperCase();
    while (enc.length < 9) enc = "0" + enc;
    const cleanSetupId = String(setupId || "SC01")
      .toUpperCase()
      .padStart(4, "S")
      .substring(0, 4);
    return "X-HM://" + enc + cleanSetupId;
  } catch {
    return (
      "X-HM://00GW95DQA" +
      String(setupId || "SC01")
        .toUpperCase()
        .padStart(4, "S")
        .substring(0, 4)
    );
  }
}

function openCameraConfigModal(camera) {
  if (!els.cameraConfigModal) return;

  const brand = extractCameraBrand(camera);
  const isOnline = camera.status?.connection === "online";
  const statusDot = isOnline ? "🟢" : "🔴";
  const statusText = isOnline ? "En línea" : "Desconectado";
  const modelDisplay =
    camera.displayModel || camera.model || "Modelo no identificado";

  els.camCfgId.value = camera.cameraId;
  els.camCfgTitle.textContent = camera.name;
  els.camCfgSubtitle.textContent = `${statusDot} ${statusText} · ${brand}${modelDisplay && modelDisplay !== "Modelo no identificado" ? ` (${modelDisplay})` : ""} · ID: ${camera.cameraId}`;

  // 1. Render Dual-Target Liquid Glass QR Code (HomeKit HKSV vs Matter)
  let activeCamQrMode = "homekit";

  function renderCamModalQr() {
    if (!els.camModalQrCode) return;
    els.camModalQrCode.innerHTML = "";

    const isHomeKit = activeCamQrMode === "homekit";

    if (els.camQrTabHomekit) {
      els.camQrTabHomekit.className = isHomeKit
        ? "button button-sm button-primary"
        : "button button-sm button-secondary";
    }
    if (els.camQrTabMatter) {
      els.camQrTabMatter.className = !isHomeKit
        ? "button button-sm button-primary"
        : "button button-sm button-secondary";
    }

    if (els.camModalQrTypeLabel) {
      els.camModalQrTypeLabel.textContent = isHomeKit
        ? "CÓDIGO APPLE HOME (HKSV / HAP)"
        : "CÓDIGO MATTER (JOINT FABRIC 1.6)";
    }

    if (els.camModalManualLabel) {
      els.camModalManualLabel.textContent = isHomeKit
        ? "CÓDIGO DE EMPAREJAMIENTO (PIN)"
        : "CÓDIGO NUMÉRICO MANUAL";
    }

    if (els.camModalQrNote) {
      els.camModalQrNote.textContent = isHomeKit
        ? "Escanea con la app Casa de Apple (iPhone / iPad / Mac) para vincular con Vídeo Seguro de HomeKit (HKSV), streaming en directo y grabación en iCloud."
        : "Escanea con un controlador compatible con Matter 1.5+ Camera (ej. Samsung SmartThings). Nota: Apple Home requiere la pestaña Apple Home (HAP) para Live View.";
    }

    const isPaired = camera.identity?.homeKitPairingState === "paired";
    const binding = camera.bindingState;
    const realHomeName = binding?.homeName || state.status?.homeName;
    const fabricLabel =
      binding?.fabrics?.[0]?.label ||
      state.status?.fabricLabel ||
      state.status?.homeName ||
      "Fabric Matter 1";

    if (els.camModalPairedBox) {
      els.camModalPairedBox.style.display =
        isHomeKit && isPaired ? "block" : "none";
      if (els.camModalPairedHomeName) {
        els.camModalPairedHomeName.textContent =
          realHomeName || "nombre no expuesto por Matter";
      }
      const fabricEl = $("cam-modal-paired-fabric-name");
      if (fabricEl) {
        fabricEl.textContent = fabricLabel;
      }
    }
    if (els.camModalPairedBadge) {
      els.camModalPairedBadge.style.display = "none";
    }

    const qrWrapper = els.camModalQrCode?.closest(".qr-visual-wrapper");
    const manualBox = els.camModalManualCode?.closest(".qr-manual-box");

    if (isHomeKit && isPaired) {
      if (qrWrapper) qrWrapper.style.display = "none";
      if (manualBox) manualBox.style.display = "none";
      return;
    } else {
      if (qrWrapper) qrWrapper.style.display = "block";
      if (manualBox) manualBox.style.display = "block";
    }

    let pairingPayload = "";
    let manualCodeDisplay = "";

    if (isHomeKit) {
      // HomeKit Setup URI (X-HM://...)
      const setupId =
        camera.identity?.homeKitSetupId ||
        generateCameraSetupId(camera.cameraId);
      const pincode = camera.identity?.homeKitPincode || "031-45-154";

      pairingPayload =
        camera.identity?.homeKitSetupUri ||
        computeHomeKitSetupUri(setupId, pincode, 17);
      manualCodeDisplay = pincode;
    } else {
      // Matter pairing code
      const bridgeEntity =
        (state.entities || []).find(
          (e) =>
            e.pairingCode && (e.isBridge || e.entityId?.includes("bridge")),
        ) || (state.entities || []).find((e) => e.pairingCode);

      pairingPayload =
        camera.identity?.matterPairingCode ||
        bridgeEntity?.pairingCode ||
        "";

      const manualCode =
        camera.identity?.matterPairingCode ||
        bridgeEntity?.manualPairingCode ||
        pairingPayload;

      manualCodeDisplay = formatManualCode(manualCode);
    }

    if (els.camModalManualCode) {
      els.camModalManualCode.textContent = manualCodeDisplay;
    }

    els.camModalQrCode.dataset.pairingCode = pairingPayload;
    els.camModalQrCode.dataset.qrMode = activeCamQrMode;
    els.camModalQrCode.dataset.cameraId = camera.cameraId;

    try {
      if (typeof QRCode !== "undefined") {
        new QRCode(els.camModalQrCode, {
          text: pairingPayload,
          width: 224,
          height: 224,
          colorDark: "#09101f",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M,
        });
        if (els.camModalQrLogo) els.camModalQrLogo.style.display = "flex";
      } else {
        els.camModalQrCode.textContent = "Librería QR no cargada.";
        if (els.camModalQrLogo) els.camModalQrLogo.style.display = "none";
      }
    } catch (err) {
      console.error("Error al renderizar QR de cámara:", err);
      els.camModalQrCode.textContent = "Error al generar código QR.";
      if (els.camModalQrLogo) els.camModalQrLogo.style.display = "none";
    }
  }

  if (els.camQrTabHomekit) {
    els.camQrTabHomekit.onclick = () => {
      activeCamQrMode = "homekit";
      renderCamModalQr();
    };
  }

  if (els.camQrTabMatter) {
    els.camQrTabMatter.onclick = () => {
      activeCamQrMode = "matter";
      renderCamModalQr();
    };
  }

  if (els.camModalResetPairBtn) {
    els.camModalResetPairBtn.onclick = async () => {
      els.camModalResetPairBtn.disabled = true;
      showToast("Reiniciando vinculación HomeKit...");
      try {
        const res = await request(
          `/reset-camera-pairing/scrypted.${camera.cameraId}`,
          { method: "POST" },
        );
        if (res.success && res.setupUri) {
          camera.identity.homeKitSetupUri = res.setupUri;
          camera.identity.homeKitPincode = res.record?.pincode || "031-45-154";
          camera.identity.homeKitSetupId = res.record?.setupId;
          camera.identity.homeKitPort = res.record?.port;
          camera.identity.homeKitPairingState = "not_paired";
          renderCamModalQr();
          showToast("✓ Vinculación reiniciada. Escanea el nuevo código QR.");
        } else {
          showToast(res.error || "No se pudo reiniciar la vinculación", true);
        }
      } catch (err) {
        showToast(err.message || "Error al reiniciar vinculación", true);
      } finally {
        els.camModalResetPairBtn.disabled = false;
      }
    };
  }

  if (els.camModalUnpairBtn) {
    els.camModalUnpairBtn.onclick = async () => {
      if (
        !confirm(
          `¿Restablecer emparejamiento HomeKit para "${camera.name}"?\nEsta acción eliminará únicamente la vinculación actual en HAP para que puedas escanear el QR de nuevo con el mismo identificador. No afectará a Scrypted ni a Matter.`,
        )
      ) {
        return;
      }
      els.camModalUnpairBtn.disabled = true;
      showToast("Restableciendo emparejamiento HomeKit...");
      try {
        const res = await request(
          `/reset-camera-pairing/scrypted.${camera.cameraId}`,
          { method: "POST" },
        );

        if (res.success && res.setupUri) {
          camera.identity.homeKitSetupUri = res.setupUri;
          camera.identity.homeKitPincode = res.record?.pincode || "031-45-154";
          camera.identity.homeKitSetupId = res.record?.setupId;
          camera.identity.homeKitPort = res.record?.port;
          camera.identity.homeKitPairingState = "not_paired";
          renderCamModalQr();
          showToast("✓ Emparejamiento HomeKit restablecido. Escanea el nuevo código.");
          loadCameras().catch(() => {});
        } else {
          showToast(res.error || "No se pudo restablecer", true);
        }
      } catch (err) {
        showToast(err.message || "Error al restablecer", true);
      } finally {
        els.camModalUnpairBtn.disabled = false;
      }
    };
  }

  // RTSP Stream controls - Use real directUrl or real discovered profile, NEVER invent from cameraId
  const realRtspUrl =
    camera.source?.streamReference?.directUrl ||
    camera.source?.profiles?.find((p) => p.directUrl)?.directUrl ||
    "";

  if (els.camCfgRtspUrl) {
    els.camCfgRtspUrl.value = realRtspUrl;
    els.camCfgRtspUrl.placeholder =
      "rtsp://<ip>:<puerto>/<ruta-rebroadcast-scrypted>";
  }
  if (els.camCfgRtspResult) {
    els.camCfgRtspResult.hidden = true;
    els.camCfgRtspResult.textContent = "";
  }

  if (els.camCfgTestRtspBtn) {
    els.camCfgTestRtspBtn.onclick = async () => {
      const url = els.camCfgRtspUrl?.value?.trim();
      if (!url) {
        showToast("Ingresa una URL RTSP para verificar", true);
        return;
      }
      els.camCfgTestRtspBtn.disabled = true;
      if (els.camCfgRtspResult) {
        els.camCfgRtspResult.hidden = false;
        els.camCfgRtspResult.className = "test-result-box";
        els.camCfgRtspResult.textContent =
          "Verificando stream RTSP (ffprobe)...";
      }
      try {
        const res = await request(
          `/cameras/${camera.cameraId}/verify-stream`,
          {
            method: "POST",
            body: JSON.stringify({ streamUrl: url }),
          },
        );
        if (els.camCfgRtspResult) {
          if (res.ok && res.status === "verified") {
            const v = res.validation || {};
            const resStr = v.resolution
              ? ` · ${v.resolution.width}x${v.resolution.height}`
              : "";
            const codecStr = v.videoCodec ? ` (${v.videoCodec.toUpperCase()})` : "";
            els.camCfgRtspResult.className = "test-result-box success";
            els.camCfgRtspResult.textContent = `✓ Stream verificado${codecStr}${resStr}. Live View listo para Apple Home.`;
            camera.status.connection = "online";
            camera.status.cache = "fresh";
          } else if (res.status === "not_found") {
            els.camCfgRtspResult.className = "test-result-box error";
            els.camCfgRtspResult.textContent =
              "❌ Error 404 (Not Found): La ruta RTSP no existe en el servidor. Verifica la ruta en el plugin Rebroadcast de Scrypted.";
          } else if (res.status === "unauthorized") {
            els.camCfgRtspResult.className = "test-result-box error";
            els.camCfgRtspResult.textContent =
              "❌ Error 401/403: Autenticación requerida. Agrega usuario:contraseña@ en la URL.";
          } else if (res.status === "source_offline") {
            els.camCfgRtspResult.className = "test-result-box error";
            els.camCfgRtspResult.textContent =
              "❌ No se pudo conectar al servidor RTSP. Revisa IP, puerto o firewall.";
          } else if (res.status === "timeout") {
            els.camCfgRtspResult.className = "test-result-box error";
            els.camCfgRtspResult.textContent =
              "❌ Tiempo de espera agotado al conectar al stream RTSP.";
          } else {
            els.camCfgRtspResult.className = "test-result-box error";
            els.camCfgRtspResult.textContent = `❌ ${res.validation?.error || "Stream inválido o no compatible"}`;
          }
        }
      } catch (err) {
        if (els.camCfgRtspResult) {
          els.camCfgRtspResult.className = "test-result-box error";
          els.camCfgRtspResult.textContent = `❌ Error al verificar stream: ${err.message}`;
        }
      } finally {
        els.camCfgTestRtspBtn.disabled = false;
      }
    };
  }

  if (els.camCfgSaveRtspBtn) {
    els.camCfgSaveRtspBtn.onclick = async () => {
      const url = els.camCfgRtspUrl?.value?.trim();
      if (!url) {
        showToast("Ingresa una URL RTSP válida", true);
        return;
      }
      els.camCfgSaveRtspBtn.disabled = true;
      showToast("Guardando URL del stream...");
      try {
        const res = await request(
          `/cameras/${camera.cameraId}/stream-url`,
          {
            method: "POST",
            body: JSON.stringify({ streamUrl: url }),
          },
        );
        if (res.success) {
          if (!camera.source.streamReference) {
            camera.source.streamReference = { protocol: "rtsp" };
          }
          camera.source.streamReference.directUrl = url;
          showToast("✓ Stream RTSP actualizado y reconectado en vivo");
          if (els.camCfgRtspResult) {
            els.camCfgRtspResult.hidden = false;
            els.camCfgRtspResult.className = "test-result-box success";
            els.camCfgRtspResult.textContent = `✓ URL de stream guardada y aplicada: ${url}`;
          }
        } else {
          showToast(res.error || "Error al guardar stream", true);
        }
      } catch (err) {
        showToast(err.message || "Error al guardar stream", true);
      } finally {
        els.camCfgSaveRtspBtn.disabled = false;
      }
    };
  }


  renderCamModalQr();

  function renderTechnicalSpecs() {
    const mfr =
      camera.displayManufacturer ||
      camera.sourceManufacturer ||
      "Marca no identificada";
    const mdl =
      camera.displayModel ||
      camera.sourceModel ||
      "Modelo no identificado";
    const sn =
      camera.displaySerialNumber ||
      camera.serialNumber ||
      "Serial no disponible";

    const videoCodec =
      camera.capabilities?.observed?.videoCodec?.toUpperCase() || "H.264";
    const profile = camera.capabilities?.observed?.profile
      ? ` (${camera.capabilities.observed.profile})`
      : "";
    const res = camera.capabilities?.observed?.resolution
      ? `${camera.capabilities.observed.resolution.width}x${camera.capabilities.observed.resolution.height}`
      : "1920x1080";
    const fps = camera.capabilities?.observed?.fps || 30;

    const hasAudio =
      camera.capabilities?.observed?.hasAudio !== false &&
      camera.capabilities?.observed?.audioCodec !== "none";
    const audioCodec =
      camera.capabilities?.observed?.audioCodec?.toUpperCase() || "AAC";
    const audioDesc = hasAudio
      ? `${audioCodec} · Entrada de audio activa`
      : "Sin audio";

    const metrics = camera.capabilities?.latencyMetrics;
    const descVal = metrics?.timeToDescribeMs?.value;
    const frameVal = metrics?.timeToFirstFrameMs?.value;
    const transport =
      metrics?.selectedTransport?.value ||
      camera.exportConfig?.rtspTransportPreference ||
      "tcp";

    const gopVal =
      camera.capabilities?.observed?.gopSeconds ??
      metrics?.observedGopSeconds?.value;
    let gopDesc = "";
    if (gopVal != null) {
      if (gopVal <= 2) {
        gopDesc = `${gopVal}s (adecuado para Live View y HKSV fluido)`;
      } else if (gopVal > 4) {
        gopDesc = `${gopVal}s (recomendación: ajustar keyframe upstream a 1–2 s)`;
      } else {
        gopDesc = `${gopVal}s`;
      }
    }

    const hasDirectUrl = Boolean(
      camera.source?.streamReference?.directUrl || els.camCfgRtspUrl?.value?.trim(),
    );

    let diagnosticHtml = "";
    if (descVal != null) {
      const gopPart = gopDesc ? ` · GOP: ${gopDesc}` : "";
      diagnosticHtml = `<strong>⏱️ Diagnóstico:</strong> DESCRIBE: ${descVal}ms (${metrics?.timeToDescribeMs?.confidence || "alta"}) · 1er Frame: ${frameVal != null ? `${frameVal}ms` : "N/A"} · Transporte: ${transport.toUpperCase()}${gopPart}`;
    } else if (metrics?.error) {
      diagnosticHtml = `<strong>⏱️ Diagnóstico:</strong> <span style="color:var(--danger, #ff4d4f); font-weight:600;">❌ Fallo en stream: ${escapeHtml(metrics.error)}</span>`;
    } else if (hasDirectUrl) {
      diagnosticHtml = `<strong>⏱️ Diagnóstico:</strong> <em>Pendiente de diagnóstico (pulsa "Diagnosticar Stream" abajo)</em>`;
    } else {
      diagnosticHtml = `<strong>⏱️ Diagnóstico:</strong> <span style="opacity:0.8;">Sin stream RTSP configurado ni descubierto</span>`;
    }

    if (els.camModalVideoSpec) {
      els.camModalVideoSpec.innerHTML = `
        <div style="margin-bottom: 4px;"><strong>🏷️ Identidad:</strong> ${escapeHtml(mfr)} · ${escapeHtml(mdl)} · SN: <code>${escapeHtml(sn)}</code></div>
        <div style="margin-bottom: 4px;"><strong>📹 Video:</strong> ${escapeHtml(videoCodec)}${escapeHtml(profile)} · ${escapeHtml(res)} @ ${fps}fps (Passthrough directo H.264 sin recodificación)</div>
        <div style="margin-bottom: 4px;"><strong>🔊 Audio:</strong> ${escapeHtml(audioDesc)} · <span style="opacity:0.8;">Talkback: no compatible</span></div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); background: rgba(0,0,0,0.2); padding: 6px 8px; border-radius: 6px; margin-top: 6px;">
          ${diagnosticHtml}
        </div>
      `;
    }
  }

  renderTechnicalSpecs();

  if (els.camCfgDiagnoseRtspBtn) {
    els.camCfgDiagnoseRtspBtn.onclick = async () => {
      const url = els.camCfgRtspUrl?.value?.trim();
      if (!url) {
        showToast("Ingresa una URL RTSP para diagnosticar", true);
        return;
      }
      els.camCfgDiagnoseRtspBtn.disabled = true;
      if (els.camCfgRtspResult) {
        els.camCfgRtspResult.hidden = false;
        els.camCfgRtspResult.className = "test-result-box";
        els.camCfgRtspResult.textContent =
          "Diagnosticando stream RTSP (DESCRIBE, primer frame, transporte y GOP)...";
      }
      try {
        const res = await request(
          `/cameras/${camera.cameraId}/diagnose-stream`,
          {
            method: "POST",
            body: JSON.stringify({ streamUrl: url, timeoutMs: 4000 }),
          },
        );
        if (res.success && res.metrics && res.metrics.timeToDescribeMs?.value != null) {
          camera.capabilities.latencyMetrics = res.metrics;
          if (res.camera?.capabilities?.observed?.gopSeconds) {
            if (!camera.capabilities.observed) {
              camera.capabilities.observed = res.camera.capabilities.observed;
            } else {
              camera.capabilities.observed.gopSeconds =
                res.camera.capabilities.observed.gopSeconds;
            }
          }
          renderTechnicalSpecs();
          if (els.camCfgRtspResult) {
            els.camCfgRtspResult.className = "test-result-box success";
            const gopText =
              res.metrics.observedGopSeconds?.value != null
                ? ` · GOP: ${res.metrics.observedGopSeconds.value}s`
                : "";
            els.camCfgRtspResult.textContent = `✓ Diagnóstico completado. DESCRIBE: ${res.metrics.timeToDescribeMs.value}ms · 1er Frame: ${res.metrics.timeToFirstFrameMs?.value || "N/A"}ms · Transporte: ${(res.metrics.selectedTransport?.value || "tcp").toUpperCase()}${gopText}`;
          }
          showToast("✓ Diagnóstico de stream completado");
        } else {
          if (res.metrics) {
            camera.capabilities.latencyMetrics = res.metrics;
            renderTechnicalSpecs();
          }
          if (els.camCfgRtspResult) {
            els.camCfgRtspResult.className = "test-result-box error";
            const causeStr = res.cause ? ` [${res.cause}]` : "";
            const errorMsg =
              res.error ||
              res.metrics?.error ||
              "No se pudo obtener información del stream";
            els.camCfgRtspResult.textContent = `❌ ${errorMsg}${causeStr}`;
          }
          showToast(res.error || "Error al diagnosticar stream", true);
        }
      } catch (err) {
        if (els.camCfgRtspResult) {
          els.camCfgRtspResult.className = "test-result-box error";
          els.camCfgRtspResult.textContent = `❌ ${err.message || "Error al diagnosticar stream"}`;
        }
        showToast(err.message || "Error al diagnosticar stream", true);
      } finally {
        els.camCfgDiagnoseRtspBtn.disabled = false;
      }
    };
  }

  if (els.camCfgTransportPref) {
    els.camCfgTransportPref.value =
      camera.exportConfig?.rtspTransportPreference || "tcp";
    els.camCfgTransportPref.onchange = async () => {
      const selected = els.camCfgTransportPref.value;
      if (!camera.exportConfig) {
        camera.exportConfig = {
          matterEnabled: true,
          homeKitEnabled: true,
          hksvEnabledByDefault: true,
          googleHomeEnabled: false,
          alexaEnabled: false,
          smartThingsEnabled: false,
          nasEnabled: false,
        };
      }
      camera.exportConfig.rtspTransportPreference = selected;
      try {
        await request(`/cameras/${camera.cameraId}/export-config`, {
          method: "POST",
          body: JSON.stringify(camera.exportConfig),
        });
        showToast(`✓ Preferencia RTSP: ${selected.toUpperCase()}`);
        renderTechnicalSpecs();
      } catch (err) {
        showToast("Error al guardar preferencia de transporte", true);
      }
    };
  }

  if (els.camModalAudioSpec) {
    els.camModalAudioSpec.style.display = "none";
  }

  // 3. Platform toggles
  const exp = camera.exportConfig || {};
  if (els.camToggleMatter)
    els.camToggleMatter.checked = exp.matterEnabled !== false;
  if (els.camToggleGoogle)
    els.camToggleGoogle.checked = Boolean(exp.googleHomeEnabled);
  if (els.camToggleAlexa)
    els.camToggleAlexa.checked = Boolean(exp.alexaEnabled);
  if (els.camToggleSt)
    els.camToggleSt.checked = Boolean(exp.smartThingsEnabled);
  if (els.camToggleNas)
    els.camToggleNas.checked = Boolean(exp.nasEnabled);

  // 4. Sensors list
  if (els.camCfgSensorsList) {
    const sensors = camera.sensors || [];
    if (sensors.length > 0) {
      els.camCfgSensorsList.innerHTML = sensors
        .map((s) => {
          const icon =
            s.type === "motion"
              ? "🏃"
              : s.type === "doorbell"
                ? "🔔"
                : s.type === "person"
                  ? "👤"
                  : s.type === "package"
                    ? "📦"
                    : s.type === "light"
                      ? "💡"
                      : "🏠";
          const stateLabel = s.state ? "🟢 Detectado" : "⚪ Inactivo";
          return `
          <label class="checkbox-row" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" name="sensor_${s.sensorId}" data-sensor-id="${s.sensorId}" ${s.enabled !== false ? "checked" : ""} />
              <span>${icon} ${escapeHtml(s.name)}</span>
            </div>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">${stateLabel}</span>
          </label>
        `;
        })
        .join("");
    } else {
      els.camCfgSensorsList.innerHTML =
        '<p style="color:var(--text-secondary); font-size:0.85rem; margin: 4px 0;">Sin sensores detectados.</p>';
    }
  }

  // 5. Camera Logs
  const streamStatusMsg =
    camera.source?.streamValidationStatus === "verified"
      ? "Stream RTSP verificado con éxito. Live View listo."
      : camera.source?.streamReference?.directUrl
        ? "Stream RTSP configurado (pendiente de verificación)."
        : "Sin stream RTSP configurado. Verifica el stream en Scrypted.";

  const logs = camera.status?.logs || [
    {
      timestamp: new Date().toISOString(),
      level: "info",
      message: streamStatusMsg,
      details: camera.source?.streamReference?.directUrl
        ? `URL: ${camera.source.streamReference.directUrl}`
        : "URL no asignada",
    },
  ];


  if (els.camModalErrorTag) {
    if (camera.status?.lastError) {
      els.camModalErrorTag.style.display = "inline";
      els.camModalErrorTag.textContent = `(⚠️ ${camera.status.lastError})`;
    } else {
      els.camModalErrorTag.style.display = "none";
    }
  }

  if (els.camModalLogBox) {
    els.camModalLogBox.style.display = "none";
    els.camModalLogBox.innerHTML = logs
      .map(
        (l) =>
          `<div class="camera-log-item ${l.level || "info"}">[${(l.timestamp || "").slice(11, 19)}] [${(l.level || "info").toUpperCase()}] ${escapeHtml(l.message || "")} ${l.details ? "· " + escapeHtml(typeof l.details === "object" ? JSON.stringify(l.details) : l.details) : ""}</div>`,
      )
      .join("");
  }
  if (els.camModalToggleLog) {
    els.camModalToggleLog.textContent = "📜 Ver log";
  }

  // 6. Action buttons
  if (els.camModalNasBtn) {
    els.camModalNasBtn.style.display = exp.nasEnabled ? "inline-block" : "none";
    els.camModalNasBtn.onclick = () => {
      setModalOpen(els.cameraConfigModal, false);
      openNasConfigModal(camera);
    };
  }

  if (els.camModalDeleteBtn) {
    els.camModalDeleteBtn.onclick = () => {
      setModalOpen(els.cameraConfigModal, false);
      state.confirmAction = async () => {
        try {
          await request(`/cameras/${camera.cameraId}`, { method: "DELETE" });
          showToast(`Cámara "${camera.name}" retirada de la exportación.`);
          await fetchScrypted();
          renderDevices();
        } catch (err) {
          showToast(err.message || "Error al retirar de la exportación", true);
        }
      };
      els.confirmTitle.textContent = `¿Retirar "${camera.name}" de la exportación?`;
      els.confirmDescription.textContent =
        "Esta acción despublicará la cámara y detendrá el streaming en HomeKit y Matter. No modificará tu configuración en Scrypted ni borrará las claves de pairing HAP/Matter.";
      setModalOpen(els.confirmModal, true);
    };
  }

  setModalOpen(els.cameraConfigModal, true);
}

function openNasConfigModal(camera) {
  if (!els.nasConfigModal) return;
  els.nasCfgCameraId.value = camera.cameraId;
  els.nasCfgTitle.textContent = `💾 NAS / Servidor para ${camera.name}`;
  setModalOpen(els.nasConfigModal, true);
}

// Event Listeners for Scrypted Controls
els.btnConnectScrypted?.addEventListener("click", () => {
  openScryptedModal();
});
els.scryptedManageBtn?.addEventListener("click", () => {
  openScryptedModal();
});
els.scryptedModalClose?.addEventListener("click", () => {
  clearScryptedSecretInputs();
  setModalOpen(els.scryptedConnectModal, false);
});
els.scryptedCancelBtn?.addEventListener("click", () => {
  clearScryptedSecretInputs();
  setModalOpen(els.scryptedConnectModal, false);
});

els.scryptedTestBtn?.addEventListener("click", async () => {
  const serverUrl = els.scryptedServerUrl?.value?.trim();
  const username = els.scryptedUsername?.value?.trim();
  const password = els.scryptedPassword?.value || "";
  const allowSelfSigned = els.scryptedAllowSelfSigned?.checked ?? false;

  if (!serverUrl) {
    showToast("Ingresa la URL del servidor Scrypted", true);
    return;
  }
  if (!username) {
    showToast("Ingresa el usuario de Scrypted", true);
    return;
  }
  if (!password) {
    showToast("Ingresa la contraseña de Scrypted", true);
    return;
  }

  setModalState("testing");
  if (els.scryptedTestResult) {
    els.scryptedTestResult.hidden = false;
    els.scryptedTestResult.className = "test-result-box";
    els.scryptedTestResult.textContent = "Comprobando conexión con Scrypted...";
  }

  try {
    const result = await request("/scrypted/connection-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverUrl,
        username,
        password,
        allowSelfSignedCertificate: allowSelfSigned,
      }),
    });
    if (result.ok) {
      if (els.scryptedTestResult) {
        els.scryptedTestResult.className = "test-result-box success";
        els.scryptedTestResult.textContent = `✅ ${result.message}`;
        if (result.latencyMs != null) {
          els.scryptedTestResult.textContent += ` (${result.latencyMs}ms)`;
        }
      }
      setModalState("connected");
    } else {
      if (els.scryptedTestResult) {
        els.scryptedTestResult.className = "test-result-box error";
        els.scryptedTestResult.textContent = `❌ ${result.message}`;
      }
      setModalState("error");
    }
  } catch (err) {
    if (els.scryptedTestResult) {
      els.scryptedTestResult.className = "test-result-box error";
      els.scryptedTestResult.textContent = `❌ Error: ${err.message || err}`;
    }
    setModalState("error");
  }
});

els.scryptedConnectForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const serverUrl = els.scryptedServerUrl?.value?.trim();
  const username = els.scryptedUsername?.value?.trim();
  const password = els.scryptedPassword?.value || "";
  const allowSelfSigned = els.scryptedAllowSelfSigned?.checked ?? false;
  const apiToken = els.scryptedApiToken?.value?.trim() || undefined;

  if (!serverUrl || !username || !password) {
    showToast("Completa URL, usuario y contraseña", true);
    return;
  }

  setModalState("loading_cameras");
  try {
    const result = await request("/scrypted/connect-and-load-cameras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverUrl,
        username,
        password,
        allowSelfSignedCertificate: allowSelfSigned,
        ...(apiToken ? { apiToken } : {}),
        autoReconnect: true,
      }),
    });

    clearScryptedSecretInputs();
    setModalOpen(els.scryptedConnectModal, false);

    if (result.noCamerasFound) {
      showToast(
        "La conexión fue correcta, pero Scrypted no expuso cámaras compatibles.",
      );
    } else {
      const total = result.totalCameras || 0;
      showToast(
        `✅ ${total} cámara${total === 1 ? "" : "s"} importada${total === 1 ? "" : "s"} desde Scrypted.`,
      );
    }

    if (result.cameras && Array.isArray(result.cameras)) {
      state.scryptedCameras = result.cameras;
    }

    state.activeFilter = "cameras";
    document.querySelectorAll(".filter-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.filter === "cameras");
    });
    await fetchScrypted();
    await loadCameras();
    renderDevices();
  } catch (err) {
    setModalState("error");
    showToast(err.message || "Error al conectar con Scrypted", true);
  }
});

els.scryptedRefreshNowBtn?.addEventListener("click", async () => {
  els.scryptedRefreshNowBtn.disabled = true;
  showToast("Actualizando cámaras desde Scrypted...");
  try {
    const res = await request("/scrypted/load-cameras", { method: "POST" });
    showToast(res.message || "Sincronización completada.");
    await fetchScrypted();
    renderDevices();
  } catch (err) {
    showToast(err.message || "Error al sincronizar con Scrypted", true);
  } finally {
    els.scryptedRefreshNowBtn.disabled = false;
  }
});

els.camCfgClose?.addEventListener("click", () => {
  setModalOpen(els.cameraConfigModal, false);
});
els.camCfgCancel?.addEventListener("click", () => {
  setModalOpen(els.cameraConfigModal, false);
});

// Copy manual pairing code from camera modal
els.camModalCopyCodeBtn?.addEventListener("click", async () => {
  const codeText = els.camModalManualCode?.textContent?.trim();
  if (!codeText || codeText === "—————") return;
  const cleanCode = codeText.replace(/\s+/g, "");
  try {
    await navigator.clipboard.writeText(cleanCode);
    const copyTextEl = els.camModalCopyCodeBtn.querySelector(".copy-text");
    if (copyTextEl) copyTextEl.textContent = "¡Copiado!";
    els.camModalCopyCodeBtn.classList.add("copied");
    setTimeout(() => {
      if (copyTextEl) copyTextEl.textContent = "Copiar";
      els.camModalCopyCodeBtn.classList.remove("copied");
    }, 2000);
    showToast("✓ Código copiado al portapapeles: " + cleanCode);
  } catch {
    showToast("Código: " + cleanCode);
  }
});

// Share code
els.camModalShareCodeBtn?.addEventListener("click", () => {
  const codeText = els.camModalManualCode?.textContent?.trim() || "";
  const cameraId = els.camCfgId?.value;
  const camera = state.scryptedCameras?.find((c) => c.cameraId === cameraId);
  const cameraName = camera?.name || "Cámara";
  const qrMode = els.camModalQrCode?.dataset.qrMode || "homekit";
  const modeLabel =
    qrMode === "homekit" ? "Apple Home (HKSV)" : "Matter (Joint Fabric 1.6)";

  if (navigator.share) {
    navigator
      .share({
        title: `Vincular ${cameraName} en ${modeLabel}`,
        text: `Código de vinculación ${modeLabel} para ${cameraName}: ${codeText}`,
      })
      .catch(() => {});
  } else {
    navigator.clipboard.writeText(codeText);
    showToast(`✓ Código copiado: ${codeText}`);
  }
});

// Download camera QR
els.camModalDownloadQrBtn?.addEventListener("click", () => {
  const pairingCode = els.camModalQrCode?.dataset.pairingCode;
  if (!pairingCode) return;
  const cameraId = els.camCfgId?.value;
  const camera = state.scryptedCameras?.find((c) => c.cameraId === cameraId);
  const cameraName = camera?.name || "camera";
  const qrMode = els.camModalQrCode?.dataset.qrMode || "homekit";
  const filename = `${cameraName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${qrMode}-qr.png`;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    if (typeof QRCode !== "undefined" && QRCode.toCanvas) {
      QRCode.toCanvas(canvas, pairingCode, {
        width: 900,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#09101f", light: "#ffffff" },
      })
        .then(() => {
          const logoImg = new Image();
          logoImg.onload = () => {
            const logoSize = 180;
            const pos = (1024 - logoSize) / 2;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.roundRect(pos - 12, pos - 12, logoSize + 24, logoSize + 24, 28);
            ctx.fill();
            ctx.shadowColor = "rgba(0,0,0,0.25)";
            ctx.shadowBlur = 18;
            ctx.drawImage(logoImg, pos, pos, logoSize, logoSize);

            const a = document.createElement("a");
            a.download = filename;
            a.href = canvas.toDataURL("image/png");
            a.click();
            showToast("✓ Código QR de la cámara descargado exitosamente");
          };
          logoImg.onerror = () => {
            const a = document.createElement("a");
            a.download = filename;
            a.href = canvas.toDataURL("image/png");
            a.click();
            showToast("✓ Código QR de la cámara descargado");
          };
          logoImg.src = "logo.png";
        })
        .catch(() => {
          const existing =
            els.camModalQrCode?.querySelector("canvas") ||
            els.camModalQrCode?.querySelector("img");
          if (existing) {
            const a = document.createElement("a");
            a.download = filename;
            a.href = existing.src || existing.toDataURL?.("image/png");
            a.click();
            showToast("✓ Código QR descargado");
          }
        });
    } else {
      const existing =
        els.camModalQrCode?.querySelector("canvas") ||
        els.camModalQrCode?.querySelector("img");
      if (existing) {
        const a = document.createElement("a");
        a.download = filename;
        a.href = existing.src || existing.toDataURL?.("image/png");
        a.click();
        showToast("✓ Código QR descargado");
      }
    }
  } catch (err) {
    showToast("Error al exportar QR: " + (err.message || err), true);
  }
});

// Toggle camera log
els.camModalToggleLog?.addEventListener("click", () => {
  if (!els.camModalLogBox) return;
  const isHidden = els.camModalLogBox.style.display === "none";
  els.camModalLogBox.style.display = isHidden ? "block" : "none";
  els.camModalToggleLog.textContent = isHidden ? "Ocultar log" : "📜 Ver log";
});

// Copy camera log
els.camModalCopyLog?.addEventListener("click", () => {
  const cameraId = els.camCfgId?.value;
  if (cameraId) {
    copyCameraLog(cameraId);
  }
});

els.camCfgForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cameraId = els.camCfgId.value;
  if (!cameraId) return;

  const exportConfig = {
    matterEnabled: els.camToggleMatter.checked,
    hksvEnabledByDefault: true,
    googleHomeEnabled: els.camToggleGoogle.checked,
    alexaEnabled: els.camToggleAlexa.checked,
    smartThingsEnabled: els.camToggleSt.checked,
    nasEnabled: els.camToggleNas.checked,
  };

  try {
    await request(`/cameras/${cameraId}/export-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportConfig),
    });
    setModalOpen(els.cameraConfigModal, false);
    showToast("Configuración de exportación guardada.");
    await fetchScrypted();
    renderDevices();
  } catch (err) {
    showToast(err.message || "Error al guardar configuración", true);
  }
});

els.nasCfgClose?.addEventListener("click", () => {
  setModalOpen(els.nasConfigModal, false);
});
els.nasCfgCancel?.addEventListener("click", () => {
  setModalOpen(els.nasConfigModal, false);
});

els.nasCfgForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cameraId = els.nasCfgCameraId.value;
  if (!cameraId) return;

  const nasData = {
    enabled: true,
    protocol: els.nasProtocol?.value || "smb",
    endpoint: els.nasEndpoint?.value || "",
    credentials: els.nasCredentials?.value || "",
    path: els.nasPath?.value || "/",
    retentionDays: Number(els.nasRetention?.value) || 30,
    maxSpaceGb: Number(els.nasMaxSpace?.value) || 500,
    format: els.nasFormat?.value || "fmp4",
  };

  try {
    await request(`/cameras/${cameraId}/nas-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nasData),
    });
    setModalOpen(els.nasConfigModal, false);
    showToast("Configuración NAS guardada.");
    await fetchScrypted();
    renderDevices();
  } catch (err) {
    showToast(err.message || "Error al guardar configuración NAS", true);
  }
});

// ==========================================================================
// SYNC CAMERAS, MODEL GROUPING & LOG DIAGNOSTICS
// ==========================================================================

async function syncNewCameras() {
  const syncButton =
    document.querySelector(".btn-sync") ||
    document.getElementById("scrypted-sync-btn");
  const originalText = syncButton
    ? syncButton.innerHTML
    : "🔄 Sincronizar nuevas cámaras";
  if (syncButton) {
    syncButton.innerHTML = "⏳ Sincronizando...";
    syncButton.disabled = true;
  }
  try {
    const response = await fetch("./api/custom/scrypted/load-cameras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() =>
      fetch("/api/scrypted/load-cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    if (!response || !response.ok) {
      throw new Error("Error al sincronizar cámaras");
    }
    const result = await response.json();
    if (result.cameras && Array.isArray(result.cameras)) {
      state.scryptedCameras = result.cameras;
    }
    await loadCameras();
    renderDevices();
    const newCount = result.newCameras || 0;
    const updatedCount = result.updatedCameras || 0;
    const removedCount = result.removedCameras || 0;
    let message = `✅ Sincronización completada`;
    if (newCount > 0) message += ` · ${newCount} nuevas`;
    if (updatedCount > 0) message += ` · ${updatedCount} actualizadas`;
    if (removedCount > 0) message += ` · ${removedCount} eliminadas`;
    showNotification(message, "success");
    updateCameraCount(result.totalCameras);
    updateLastUpdated();
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, "error");
  } finally {
    if (syncButton) {
      syncButton.innerHTML = originalText;
      syncButton.disabled = false;
    }
  }
}
window.syncNewCameras = syncNewCameras;

function updateCameraCount(count) {
  const countElement =
    document.querySelector(".camera-count") ||
    document.getElementById("scrypted-cameras-count");
  if (countElement) {
    countElement.textContent = `📹 ${count} cámara${count === 1 ? "" : "s"}`;
  }
}
window.updateCameraCount = updateCameraCount;

function updateLastUpdated() {
  const updatedElement =
    document.querySelector(".last-updated") ||
    document.getElementById("scrypted-last-update");
  if (updatedElement) {
    updatedElement.textContent = `🕐 Actualizado ahora`;
  }
}
window.updateLastUpdated = updateLastUpdated;

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.innerHTML = message;
  notification.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 8px; background: ${type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#667eea"}; color: white; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; animation: slideIn 0.3s ease;`;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}
window.showNotification = showNotification;

async function loadCameras() {
  try {
    const response = await fetch("./api/custom/cameras").catch(() =>
      fetch("/api/cameras"),
    );
    const raw = await response.json();
    const cameras = Array.isArray(raw) ? raw : raw.cameras || [];
    state.scryptedCameras = cameras;

    // Group cameras by effective brand, normalize for deduplication
    const brandMap = new Map();
    for (const camera of cameras) {
      const displayBrand = extractCameraBrand(camera);
      const key = normalizeForGroup(displayBrand) ?? "__unknown__";
      if (!brandMap.has(key)) {
        brandMap.set(key, { displayName: displayBrand, cameras: [] });
      }
      brandMap.get(key).cameras.push(camera);
    }

    // Sort alphabetically, 'Marca no identificada' always last
    const sortedBrands = [...brandMap.entries()].sort(([ka, a], [kb, b]) => {
      if (ka === "__unknown__") return 1;
      if (kb === "__unknown__") return -1;
      return a.displayName.localeCompare(b.displayName, "es", {
        sensitivity: "base",
      });
    });

    const container = document.getElementById("cameras-container");
    if (container) {
      container.innerHTML = "";
      for (const [, { displayName, cameras: brandCameras }] of sortedBrands) {
        // Sort cameras by name within each brand
        brandCameras.sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", "es", {
            sensitivity: "base",
          }),
        );

        const section = document.createElement("section");
        section.className = "camera-brand-group";
        section.dataset.brand = normalizeForGroup(displayName) ?? "unknown";

        const header = document.createElement("header");
        header.className = "camera-brand-group__header";

        const h3 = document.createElement("h3");
        h3.textContent = `📹 ${displayName}`;

        const countSpan = document.createElement("span");
        countSpan.className = "brand-camera-count";
        countSpan.textContent = `${brandCameras.length} ${brandCameras.length === 1 ? "cámara" : "cámaras"}`;

        header.appendChild(h3);
        header.appendChild(countSpan);

        const grid = document.createElement("div");
        grid.className = "cameras-grid";
        for (const camera of brandCameras) {
          const card = renderCameraCard(camera);
          grid.appendChild(card);
        }

        section.appendChild(header);
        section.appendChild(grid);
        container.appendChild(section);
      }
    }

    renderDevices();
    updateCameraCount(cameras.length);
    updateLastUpdated();
  } catch (error) {
    console.error("Error loading cameras:", error);
    showNotification(`Error al cargar cámaras: ${error.message}`, "error");
  }
}
window.loadCameras = loadCameras;

function copyCameraLog(cameraId) {
  const camera = state.scryptedCameras?.find((c) => c.cameraId === cameraId);
  if (!camera) return;

  const logPayload = {
    cameraName: camera.name,
    cameraId: camera.cameraId,
    model: camera.model || "Cámara IP",
    status: camera.status?.connection || "online",
    lastFetched: camera.status?.lastFetched || new Date().toISOString(),
    lastError: camera.status?.lastError || null,
    lastErrorAt: camera.status?.lastErrorAt || null,
    stream: {
      protocol: camera.source?.streamReference?.protocol || "rtsp",
      url: camera.source?.streamReference?.directUrl || null,
      validationStatus:
        camera.source?.streamValidationStatus || "not_checked",
      verifiedAt: camera.source?.streamReference?.verifiedAt || null,
    },

    capabilities: camera.capabilities?.observed || {
      videoCodec: "h264",
      resolution: "1920x1080",
      fps: 30,
      audioCodec: "aac",
    },
    homekit: {
      accessoryId: camera.identity?.homeKitAccessoryId || null,
      pairingState: camera.identity?.homeKitPairingState || "not_paired",
      hksvEnabled: Boolean(camera.exportConfig?.hksvEnabledByDefault),
      streamCopy: true,
      prebuffer: "4s in RAM",
    },
    matter: {
      pairingCode: camera.identity?.matterPairingCode || "",
      clusters: [
        "0x0551 (AV Stream Management)",
        "0x0553 (WebRTC Transport)",
        "0x040D (Occupancy/Motion)",
        "0x0552 (Doorbell)",
      ],
    },
    sensors: (camera.sensors || []).map((s) => ({
      name: s.name,
      type: s.type,
      state: Boolean(s.state),
      lastEvent: s.lastEventAt || null,
    })),
    recentLogs: camera.status?.logs || [
      {
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Cámara activa sin errores reportados.",
      },
    ],
  };

  const formatted = JSON.stringify(logPayload, null, 2);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(formatted)
      .then(() => {
        showNotification(
          `📋 Log específico de "${camera.name}" copiado al portapapeles.`,
          "success",
        );
      })
      .catch(() => {
        showNotification(`Error al copiar log al portapapeles.`, "error");
      });
  } else {
    showNotification(`📋 Log específico de "${camera.name}" generado.`, "info");
  }
}
window.copyCameraLog = copyCameraLog;

els.scryptedSyncBtn?.addEventListener("click", syncNewCameras);
