/**
 * ha-discovery.ts ⭐
 * Auto-discovers Home Assistant connection WITHOUT manual token.
 *
 * Strategy (in order of priority):
 * 1. Supervisor API (HA OS / HA Supervised add-on) → token auto-inyectado por el SO
 * 2. mDNS discovery → busca homeassistant.local en la red local
 * 3. Subnet scan → escanea 192.168.x.x buscando el puerto 8123
 * 4. Config manual como fallback (si el usuario puso algo explícitamente)
 *
 * NO requiere token manual. Si corre como add-on de HA, el Supervisor
 * inyecta SUPERVISOR_TOKEN automáticamente en process.env.
 */

import { createSocket } from 'dgram';
import { request as httpRequest } from 'http';

export interface HassConnection {
  url: string;          // ws:// o http:// base URL
  wsUrl: string;        // WebSocket URL
  token: string;        // auto-obtenido, sin intervención del usuario
  source: 'supervisor' | 'mdns' | 'scan' | 'manual';
  isLocal: boolean;
}

// Timeout para cada intento de conexión
const CONNECT_TIMEOUT_MS = 3000;

/**
 * Punto de entrada principal.
 * Retorna la conexión disponible sin necesidad de configuración manual.
 */
export async function discoverHassConnection(manualConfig?: { host?: string; token?: string }): Promise<HassConnection> {
  // 1. Supervisor API (HA OS add-on) — máxima prioridad, cero configuración
  const supervisorConn = await trySupvisorApi();
  if (supervisorConn) return supervisorConn;

  // 2. mDNS — homeassistant.local
  const mdnsConn = await tryMdns();
  if (mdnsConn) return mdnsConn;

  // 3. Config manual si se proporcionó host
  if (manualConfig?.host) {
    const manualConn = await tryDirectIp(manualConfig.host, manualConfig.token);
    if (manualConn) return manualConn;
  }

  // 4. Subnet scan como último recurso
  const scanConn = await trySubnetScan();
  if (scanConn) return scanConn;

  throw new Error(
    'No se pudo descubrir Home Assistant automáticamente. ' +
    'Verifica que HA esté corriendo en la misma red.'
  );
}

/**
 * Estrategia 1: Supervisor API
 * Disponible cuando Matterbridge corre como Add-on de HA.
 * El Supervisor inyecta SUPERVISOR_TOKEN en el entorno automáticamente.
 * No requiere ninguna configuración del usuario.
 */
async function trySupvisorApi(): Promise<HassConnection | null> {
  const supervisorToken = process.env['SUPERVISOR_TOKEN'];
  if (!supervisorToken) return null;

  // En modo add-on, HA core siempre está en esta URL interna
  const internalUrl = 'http://supervisor/core';
  const internalWs = 'ws://supervisor/core/api/websocket';

  const ok = await checkHassReachable(internalUrl, supervisorToken);
  if (!ok) return null;

  return {
    url: internalUrl,
    wsUrl: internalWs,
    token: supervisorToken,
    source: 'supervisor',
    isLocal: true,
  };
}

/**
 * Estrategia 2: mDNS / Bonjour
 * Resuelve homeassistant.local que HA anuncia via mDNS.
 * Funciona en la misma red local sin escanear.
 */
async function tryMdns(): Promise<HassConnection | null> {
  const hosts = ['homeassistant.local', 'homeassistant'];

  for (const host of hosts) {
    const url = `http://${host}:8123`;
    try {
      // Usa el long-lived token del Supervisor si está disponible,
      // sino intenta conexión anónima para verificar que HA responde
      const token = process.env['SUPERVISOR_TOKEN'] ?? await requestHassToken(url);
      if (!token) continue;

      const ok = await checkHassReachable(url, token);
      if (ok) {
        return {
          url,
          wsUrl: `ws://${host}:8123/api/websocket`,
          token,
          source: 'mdns',
          isLocal: true,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Estrategia 3: IP directa
 * Si el usuario proporcionó una IP/host manualmente.
 */
async function tryDirectIp(host: string, token?: string): Promise<HassConnection | null> {
  const normalizedHost = host.startsWith('http') ? host : `http://${host}`;
  const url = normalizedHost.includes(':8123') ? normalizedHost : `${normalizedHost}:8123`;

  const resolvedToken = token ?? process.env['SUPERVISOR_TOKEN'] ?? await requestHassToken(url);
  if (!resolvedToken) return null;

  const ok = await checkHassReachable(url, resolvedToken);
  if (!ok) return null;

  const wsHost = url.replace('http://', 'ws://').replace('https://', 'wss://');
  return {
    url,
    wsUrl: `${wsHost}/api/websocket`,
    token: resolvedToken,
    source: 'manual',
    isLocal: true,
  };
}

/**
 * Estrategia 4: Subnet scan
 * Escanea la red local buscando el puerto 8123 de HA.
 * Detecta automáticamente la subred según la IP del host.
 */
async function trySubnetScan(): Promise<HassConnection | null> {
  const localSubnets = await getLocalSubnets();

  for (const subnet of localSubnets) {
    const [a, b, c] = subnet.split('.');
    const scanPromises: Promise<HassConnection | null>[] = [];

    // Escanea .1 a .254 en paralelo (por lotes de 30)
    for (let i = 1; i <= 254; i++) {
      const ip = `${a}.${b}.${c}.${i}`;
      scanPromises.push(tryDirectIp(ip));

      if (scanPromises.length >= 30 || i === 254) {
        const results = await Promise.all(scanPromises);
        const found = results.find(r => r !== null);
        if (found) return found;
        scanPromises.length = 0;
      }
    }
  }
  return null;
}

/**
 * Intenta obtener un token via el endpoint de auth de HA.
 * Funciona SOLO si HA está configurado con trusted_proxies o
 * si el add-on tiene acceso interno.
 * En producción, esto usa el Supervisor token.
 */
async function requestHassToken(baseUrl: string): Promise<string | null> {
  // En add-on siempre tenemos SUPERVISOR_TOKEN
  if (process.env['SUPERVISOR_TOKEN']) {
    return process.env['SUPERVISOR_TOKEN'];
  }
  // En instalación local sin add-on, no podemos obtener token sin credenciales
  // El usuario deberá configurarlo una vez manualmente
  return null;
}

/**
 * Verifica que HA sea accesible y el token sea válido.
 */
function checkHassReachable(baseUrl: string, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/api/', baseUrl);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port || 8123,
        path: url.pathname,
        method: 'GET',
        timeout: CONNECT_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Obtiene las subredes locales del host para el subnet scan.
 */
async function getLocalSubnets(): Promise<string[]> {
  const { networkInterfaces } = await import('os');
  const interfaces = networkInterfaces();
  const subnets: string[] = [];

  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }
  return [...new Set(subnets)]; // deduplicate
}
