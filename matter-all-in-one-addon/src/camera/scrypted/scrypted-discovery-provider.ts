import {
  ingestScryptedDiscoveryPayload,
  type ScryptedDiscoveryPayload,
} from "./scrypted-runtime-ingest.js";
import {
  ScryptedRuntimeFacade,
  type ScryptedRuntimeSnapshot,
} from "./scrypted-runtime-facade.js";
import {
  createScryptedRuntimeConnection,
  type ScryptedRuntimeConnection,
  type ScryptedRuntimeFetcher,
} from "./scrypted-runtime-connector.js";

export type ScryptedDiscoverySource =
  | ScryptedRuntimeFetcher
  | ScryptedRuntimeConnection;

export class ScryptedDiscoveryProvider {
  public readonly connection: ScryptedRuntimeConnection;

  constructor(
    private readonly facade: ScryptedRuntimeFacade,
    connector: ScryptedDiscoverySource,
  ) {
    this.connection =
      typeof connector === "function"
        ? createScryptedRuntimeConnection(connector)
        : connector;
  }

  async refresh(): Promise<ScryptedRuntimeSnapshot> {
    try {
      const payload = await this.connection.fetchDiscovery();
      this.facade.setConnectionState(this.connection.connected);
      return ingestScryptedDiscoveryPayload(this.facade, payload);
    } catch {
      this.facade.setConnectionState(false);
      return this.facade.getSnapshot();
    }
  }
}
