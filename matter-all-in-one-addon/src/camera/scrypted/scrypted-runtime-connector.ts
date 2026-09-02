import type { ScryptedDiscoveryPayload } from "./scrypted-runtime-ingest.js";

export type ScryptedRuntimeFetcher = () => Promise<ScryptedDiscoveryPayload>;

export type ScryptedRuntimeConnection = {
  connected: boolean;
  fetchDiscovery: ScryptedRuntimeFetcher;
};

export function createScryptedRuntimeConnection(
  fetcher: ScryptedRuntimeFetcher,
): ScryptedRuntimeConnection {
  return {
    connected: false,
    async fetchDiscovery(): Promise<ScryptedDiscoveryPayload> {
      try {
        const payload = await fetcher();
        this.connected = true;
        return payload;
      } catch (error) {
        this.connected = false;
        throw error;
      }
    },
  };
}
