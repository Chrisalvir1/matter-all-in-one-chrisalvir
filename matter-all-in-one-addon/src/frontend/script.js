// API Base URL (Relative since frontend is served on the same host & port 8283)
const API_BASE = '/api/custom';

// State Variables
let currentQrCode = '';
let qrcodeInstance = null;
let activeTab = 'bridge-tab';
let devicesList = [];
let updateInterval = null;

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const searchInput = document.getElementById('device-search');
const devicesTbody = document.getElementById('devices-tbody');
const copyBtn = document.getElementById('copy-btn');
const manualCodeText = document.getElementById('manual-code');
const haBadge = document.getElementById('ha-badge');
const haBadgeText = document.getElementById('ha-badge-text');
const pulseDot = haBadge.querySelector('.pulse-dot');

// Status ring elements
const statusRing = document.getElementById('status-ring');
const statusBadge = document.getElementById('status-badge');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');

// System Info
const sysOs = document.getElementById('sys-os');
const sysNode = document.getElementById('sys-node');
const sysUptime = document.getElementById('sys-uptime');
const sysCpu = document.getElementById('sys-cpu');
const sysMem = document.getElementById('sys-mem');

// Action buttons
const restartBtn = document.getElementById('restart-btn');
const factoryResetBtn = document.getElementById('factoryreset-btn');

// Modal Elements
const modal = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');
let pendingAction = null;

// Tab Navigation
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');
    
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(targetTab).classList.add('active');
    activeTab = targetTab;
    
    if (activeTab === 'devices-tab') {
      fetchDevices();
    }
  });
});

// Periodic Status Polling
async function fetchStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    
    // Update Home Assistant Connection Badge
    if (data.haStatus === 'conectado') {
      haBadgeText.textContent = 'Home Assistant: Conectado';
      pulseDot.classList.add('active');
    } else {
      haBadgeText.textContent = 'Home Assistant: Desconectado';
      pulseDot.classList.remove('active');
    }
    
    // Update Pairing QR Code & Manual Code
    if (data.qrPairingCode && data.qrPairingCode !== currentQrCode) {
      currentQrCode = data.qrPairingCode;
      renderQRCode(data.qrPairingCode);
    }
    
    if (data.manualPairingCode) {
      manualCodeText.textContent = data.manualPairingCode;
    } else {
      manualCodeText.textContent = '---- --- ----';
    }
    
    // Update Bridge Status Badge & Info
    updateStatusCard(data);
    
    // Update System Info
    sysOs.textContent = data.systemInfo.os || '-';
    sysNode.textContent = data.systemInfo.nodeVersion || '-';
    sysUptime.textContent = data.systemInfo.uptime || '-';
    sysCpu.textContent = data.systemInfo.cpu || '-';
    sysMem.textContent = data.systemInfo.memory || '-';
    
  } catch (err) {
    console.error('Failed to poll status:', err);
    // Display starting/offline state
    haBadgeText.textContent = 'Home Assistant: Sin conexión';
    pulseDot.classList.remove('active');
  }
}

// Update Status Card UI based on state
function updateStatusCard(data) {
  statusRing.className = 'status-ring';
  statusBadge.className = 'status-inner';
  
  if (data.status === 'vinculado' || data.commissioned) {
    statusRing.classList.add('vinculado');
    statusBadge.classList.add('vinculado');
    statusBadge.textContent = 'OK';
    statusTitle.textContent = 'Puente Vinculado';
    statusDesc.textContent = 'El puente está emparejado y funcionando con normalidad.';
  } else if (data.status === 'esperando') {
    statusRing.classList.add('esperando');
    statusBadge.classList.add('esperando');
    statusBadge.textContent = 'Pair';
    statusTitle.textContent = 'Esperando Vinculación';
    statusDesc.textContent = 'Listo para emparejar. Escanea el código QR de la izquierda.';
  } else {
    statusBadge.textContent = 'Wait';
    statusTitle.textContent = 'Iniciando Servicio';
    statusDesc.textContent = 'El puente de Matter se está iniciando. Por favor, espera...';
  }
}

// Render QR Code using QRCode.js
function renderQRCode(qrText) {
  const qrDisplay = document.getElementById('qrcode-display');
  const qrPlaceholder = document.getElementById('qr-placeholder');
  
  qrDisplay.innerHTML = '';
  
  try {
    if (qrText && typeof QRCode !== 'undefined') {
      qrPlaceholder.style.display = 'none';
      qrDisplay.style.display = 'block';
      
      new QRCode(qrDisplay, {
        text: qrText,
        width: 180,
        height: 180,
        colorDark: '#0b0f19',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      qrPlaceholder.style.display = 'block';
      qrDisplay.style.display = 'none';
      qrPlaceholder.textContent = 'Esperando código...';
    }
  } catch (err) {
    console.error('QR rendering error:', err);
    qrPlaceholder.style.display = 'block';
    qrDisplay.style.display = 'none';
    qrPlaceholder.textContent = 'Error al generar código QR';
  }
}

// Fetch Bridged Devices List
async function fetchDevices() {
  try {
    const res = await fetch(`${API_BASE}/devices`);
    if (!res.ok) throw new Error('API error');
    devicesList = await res.json();
    renderDevices(devicesList);
  } catch (err) {
    console.error('Failed to fetch devices:', err);
    devicesTbody.innerHTML = `<tr><td colspan="5" class="table-loading" style="color: var(--accent-danger)">Error al cargar la lista de dispositivos.</td></tr>`;
  }
}

// Render Devices list to Table
function renderDevices(devices) {
  if (devices.length === 0) {
    devicesTbody.innerHTML = `<tr><td colspan="5" class="table-loading">No se encontraron dispositivos enlazados. Asegúrate de que tienes entidades compatibles en Home Assistant.</td></tr>`;
    return;
  }
  
  devicesTbody.innerHTML = '';
  devices.forEach(device => {
    const tr = document.createElement('tr');
    
    // Domain icon or class mapping
    let domainIcon = '🔌';
    if (device.domain === 'light') domainIcon = '💡';
    else if (device.domain === 'cover') domainIcon = '🏁';
    else if (device.domain === 'camera') domainIcon = '📹';
    else if (device.domain === 'sensor') domainIcon = '🌡️';
    else if (device.domain === 'lock') domainIcon = '🔒';
    else if (device.domain === 'fan') domainIcon = '🌀';
    else if (device.domain === 'climate') domainIcon = '❄️';

    tr.innerHTML = `
      <td><strong>${domainIcon} ${escapeHtml(device.friendlyName)}</strong></td>
      <td><code>${escapeHtml(device.entityId)}</code></td>
      <td><span class="badge domain">${escapeHtml(device.matterType)}</span></td>
      <td><span class="badge state">${escapeHtml(device.state)}</span></td>
      <td><span class="badge status-active">${escapeHtml(device.status)}</span></td>
    `;
    devicesTbody.appendChild(tr);
  });
}

// Helper to escape HTML characters
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

// Search and Filter Devices
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const filtered = devicesList.filter(device => 
    device.friendlyName.toLowerCase().includes(query) ||
    device.entityId.toLowerCase().includes(query) ||
    device.matterType.toLowerCase().includes(query)
  );
  renderDevices(filtered);
});

// Copy Manual Pairing Code to Clipboard
copyBtn.addEventListener('click', () => {
  const code = manualCodeText.textContent;
  if (code && code !== '---- --- ----') {
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.textContent = '✓';
      setTimeout(() => {
        copyBtn.textContent = '📋';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy code:', err);
    });
  }
});

// Modal Confirmation Dialog Handling
function showConfirmation(title, desc, confirmCallback) {
  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  modal.classList.add('active');
  pendingAction = confirmCallback;
}

modalCancel.addEventListener('click', () => {
  modal.classList.remove('active');
  pendingAction = null;
});

modalConfirm.addEventListener('click', async () => {
  if (pendingAction) {
    modal.classList.remove('active');
    await pendingAction();
    pendingAction = null;
  }
});

// Restart complementary action
restartBtn.addEventListener('click', () => {
  showConfirmation(
    '¿Reiniciar Puente?',
    'Se reiniciará el complemento de Home Assistant de forma limpia y se reconectará a los controladores. Esto tomará unos segundos.',
    async () => {
      try {
        const res = await fetch(`${API_BASE}/restart`, { method: 'POST' });
        if (res.ok) {
          alert('Petición de reinicio enviada. El complemento se volverá a iniciar ahora.');
          window.location.reload();
        }
      } catch (err) {
        console.error('Restart failed:', err);
      }
    }
  );
});

// Factory Reset action
factoryResetBtn.addEventListener('click', () => {
  showConfirmation(
    '¿Restablecer de Fábrica?',
    'Esto borrará de forma permanente todas las vinculaciones y emparejamientos actuales de Apple Home, Google Home o Alexa. Tendrás que volver a enlazar el puente Matter escaneando un nuevo código QR.',
    async () => {
      try {
        const res = await fetch(`${API_BASE}/factoryreset`, { method: 'POST' });
        if (res.ok) {
          alert('Puente restablecido con éxito. El complemento se reiniciará con una configuración nueva.');
          window.location.reload();
        }
      } catch (err) {
        console.error('Factory reset failed:', err);
      }
    }
  );
});

// Initialization
fetchStatus();
updateInterval = setInterval(fetchStatus, 5000);

// Fetch devices periodically if active
setInterval(() => {
  if (activeTab === 'devices-tab') {
    fetchDevices();
  }
}, 8000);
