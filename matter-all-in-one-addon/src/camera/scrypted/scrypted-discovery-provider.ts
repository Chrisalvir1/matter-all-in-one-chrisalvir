import { ingestScryptedDiscoveryPayload, type ScryptedDiscoveryPayload } from "./scrypted-runtime-ingest.js";
import { ScryptedRuntimeFacade, type ScryptedRuntimeSnapshot } from "./scrypted-runtime-facade.js";

export type ScryptedDiscoverySource = () => Promise<ScryptedDiscoveryPayload>;

export class ScryptedDiscoveryProvider {
  constructor(
    private readonly facade: ScryptedRuntimeFacade,
    private readonly source: ScryptedDiscoverySource,
  ) {}

  async refresh(): Promise<ScryptedRuntimeSnapshot> {
    try {
      const payload = await this.source();
      this.facade.setConnectionState(true);
      return ingestScryptedDiscoveryPayload(this.facade, payload);
    } catch {
      this.facade.setConnectionState(false);
      return this.facade.getSnapshot();
    }
  }
}
