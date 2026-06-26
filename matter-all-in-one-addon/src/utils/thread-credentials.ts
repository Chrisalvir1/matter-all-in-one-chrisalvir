/**
 * Thread network credentials manager helper.
 */
import { safeSetAttribute } from './matter-attributes.js';

export interface ThreadNetworkCredentials {
  panId: number;
  extendedPanId: string;
  networkName: string;
  channel: number;
  masterKey: string;
}

export class ThreadCredentialsManager {
  private activeCredentials: ThreadNetworkCredentials | null = null;

  /**
   * Set the credentials.
   */
  public setCredentials(creds: ThreadNetworkCredentials) {
    this.activeCredentials = creds;
  }

  /**
   * Get the active credentials.
   */
  public getCredentials(): ThreadNetworkCredentials | null {
    return this.activeCredentials;
  }

  /**
   * Sync Thread credentials with a Matter ThreadNetworkDiagnostics cluster.
   */
  public syncWithEndpoint(endpoint: any, clusterId: any) {
    if (!this.activeCredentials) return;
    safeSetAttribute(endpoint, clusterId, 'channel', this.activeCredentials.channel);
    safeSetAttribute(endpoint, clusterId, 'panId', this.activeCredentials.panId);
  }
}
