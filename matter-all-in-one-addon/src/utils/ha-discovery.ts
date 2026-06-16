/**
 * @description Auto-discovery of Home Assistant on the local network.
 * Probes common HA hostnames and IP ranges via HTTP to find a reachable instance
 * without requiring the user to configure a host or token.
 *
 * Priority order:
 *   1. HA_URL env variable  (set automatically by HA OS supervisor inside add-ons)
 *   2. http://homeassistant.local:8123  (mDNS default hostname)
 *   3. http://homeassistant:8123        (common hostname inside HA OS)
 *   4. http://supervisor/core           (supervisor internal URL, only inside HA add-on)
 *   5. Scan 192.168.x.x / 10.x.x.x subnets of all local interfaces for port 8123
 *
 * @file src/utils/ha-discovery.ts
 * @author chrisalvir
 * @license Apache-2.0
 */

import { networkInterfaces } from 'node:os';
import http from 'node:http';

/** Timeout in ms for each probe request */
const PROBE_TIMEOUT_MS = 1500;

/**
 * Probe a single URL to see if it responds with a Home Assistant /api/ endpoint.
 * Returns the base URL (http://host:port) if reachable, or null.
 */
async function probeHassUrl(baseUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const url = `${baseUrl}/api/`;
    try {
      const req = http.get(url, { timeout: PROBE_TIMEOUT_MS }, (res) => {
        // HA responds with 200 or 401 on /api/. Both mean HA is there.
        if (res.statusCode && (res.statusCode === 200 || res.statusCode === 401)) {
          resolve(baseUrl);
        } else {
          resolve(null);
        }
        // Consume response body to free socket
        res.resume();
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Return the list of local IPv4 subnets (e.g. "192.168.1") from all active
 * network interfaces. Used to build candidate IPs to scan.
 */
function getLocalSubnets(): string[] {
  const subnets = new Set<string>();
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      // Extract the /24 subnet prefix  e.g. "192.168.1"
      const parts = iface.address.split('.');
      if (parts.length === 4) {
        subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }
  return [...subnets];
}

/**
 * Scan a /24 subnet for HA on port 8123.
 * Tries all .1 – .254 addresses in parallel batches of 20.
 * Returns the first URL that responds, or null.
 */
async function scanSubnet(subnet: string): Promise<string | null> {
  const BATCH = 20;
  for (let base = 1; base <= 254; base += BATCH) {
    const batch: Promise<string | null>[] = [];
    for (let i = base; i < base + BATCH && i <= 254; i++) {
      batch.push(probeHassUrl(`http://${subnet}.${i}:8123`));
    }
    const results = await Promise.all(batch);
    const found = results.find((r) => r !== null);
    if (found) return found;
  }
  return null;
}

/**
 * Discover a reachable Home Assistant instance on the local network.
 *
 * @param log - Optional logger function (receives a string message).
 * @returns The base HTTP URL of the discovered HA instance (e.g. "http://192.168.1.100:8123"),
 *          or null if no HA instance was found.
 */
export async function discoverHassUrl(log?: (msg: string) => void): Promise<string | null> {
  const info = (msg: string) => log?.(msg);

  // 1. Environment variable (set by HA OS supervisor inside add-ons)
  if (process.env.HA_URL) {
    info(`Using HA_URL from environment: ${process.env.HA_URL}`);
    return process.env.HA_URL;
  }

  // 2. Well-known hostnames — fastest path on most networks
  const wellKnown = [
    'http://homeassistant.local:8123',
    'http://homeassistant:8123',
    'http://supervisor/core',         // only works inside HA OS add-on
  ];

  info('Probing well-known Home Assistant hostnames...');
  for (const candidate of wellKnown) {
    const result = await probeHassUrl(candidate);
    if (result) {
      info(`Found Home Assistant at ${result}`);
      return result;
    }
  }

  // 3. Scan local subnets
  const subnets = getLocalSubnets();
  if (subnets.length === 0) {
    info('No local network interfaces found. Cannot scan for Home Assistant.');
    return null;
  }

  info(`Scanning local subnets for Home Assistant: ${subnets.join(', ')}`);
  for (const subnet of subnets) {
    const result = await scanSubnet(subnet);
    if (result) {
      info(`Found Home Assistant at ${result}`);
      return result;
    }
  }

  info('Home Assistant not found on local network.');
  return null;
}

/**
 * Convert an HTTP/HTTPS URL to the ws:// or wss:// equivalent needed by the
 * HomeAssistant WebSocket class. Also strips the /core supervisor suffix.
 *
 * @example
 *   toWsUrl('http://192.168.1.100:8123')   // 'ws://192.168.1.100:8123'
 *   toWsUrl('https://ha.example.com')       // 'wss://ha.example.com'
 *   toWsUrl('http://supervisor/core')       // 'ws://supervisor'
 */
export function toWsUrl(url: string): string {
  return url
    .replace(/^\/core\/?$/, '')          // bare /core path
    .replace(/\/core\/?$/, '')           // trailing /core
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');
}
