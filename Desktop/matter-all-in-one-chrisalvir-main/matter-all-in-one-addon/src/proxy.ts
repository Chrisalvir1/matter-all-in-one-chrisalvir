import http from 'http';

const TARGET_PORT = 8285;
const PROXY_PORT = 8283;

const server = http.createServer((req, res) => {
  // Setup standard proxy request to the plugin's actual HTTP server on 8285
  const proxyReq = http.request(
    {
      host: '127.0.0.1',
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      // Set the response headers and status from the target response
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  // Handle errors (e.g. target server not started yet)
  proxyReq.on('error', (err) => {
    // If the plugin server is down (ECONNREFUSED), serve the premium loading page.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getLoadingHtml());
  });

  // Pipe the request body to the proxy request
  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[Proxy] Listening on port ${PROXY_PORT}, proxying requests to port ${TARGET_PORT}`);
});

function getLoadingHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Iniciando Matter Bridge...</title>
  <style>
    :root {
      --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%);
      --glass-bg: rgba(30, 41, 59, 0.45);
      --glass-border: rgba(255, 255, 255, 0.08);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --accent: #a855f7;
      --accent-glow: rgba(168, 85, 247, 0.35);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      background: var(--bg-gradient);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow: hidden;
    }
    
    .glass-card {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 24px;
      padding: 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3),
                  inset 0 1px 0 rgba(255, 255, 255, 0.1);
      animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .spinner-container {
      position: relative;
      width: 80px;
      height: 80px;
      margin: 0 auto 32px;
    }
    
    .spinner {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      border: 4px solid rgba(255, 255, 255, 0.05);
      border-radius: 50%;
      border-top-color: var(--accent);
      animation: spin 1s infinite cubic-bezier(0.55, 0.15, 0.45, 0.85);
      filter: drop-shadow(0 0 8px var(--accent-glow));
    }
    
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }
    
    p {
      color: var(--text-secondary);
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(168, 85, 247, 0.1);
      border: 1px solid rgba(168, 85, 247, 0.2);
      padding: 8px 16px;
      border-radius: 12px;
      color: #e9d5ff;
      font-size: 13px;
      font-weight: 500;
    }
    
    .pulse-dot {
      width: 8px;
      height: 8px;
      background-color: var(--accent);
      border-radius: 50%;
      animation: pulse 1.5s infinite ease-in-out;
      box-shadow: 0 0 8px var(--accent-glow);
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(0.8); opacity: 0.5; }
      50% { transform: scale(1.2); opacity: 1; }
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
  <script>
    // Automatic reload check every 2 seconds
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  </script>
</head>
<body>
  <div class="glass-card">
    <div class="spinner-container">
      <div class="spinner"></div>
    </div>
    <h1>Iniciando Matter Bridge</h1>
    <p>Por favor, espera mientras se inicializan los dispositivos y se establece la conexión con Home Assistant. Esto puede tardar hasta un minuto.</p>
    <div class="status-badge">
      <div class="pulse-dot"></div>
      Cargando interfaz del addon...
    </div>
  </div>
</body>
</html>`;
}
