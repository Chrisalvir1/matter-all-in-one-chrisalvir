/**
 * Matterbridge and Endpoint mock APIs.
 */
import { vi } from 'vitest';

export class MockMatterbridgeEndpoint {
  public deviceTypes: any[];
  public options: any;
  public clusterServers = new Set<number>();
  public attributes = new Map<string, any>();
  public commandHandlers = new Map<string, Function>();

  constructor(deviceTypes: any[], options: any) {
    this.deviceTypes = deviceTypes;
    this.options = options;
  }

  public addClusterServers(clusterIds: number[]) {
    clusterIds.forEach(id => this.clusterServers.add(id));
  }

  public addRequiredClusterServers() {}

  public hasAttributeServer(clusterId: number, attributeName: string): boolean {
    return true;
  }

  public setAttribute(clusterId: number, attributeName: string, value: any) {
    this.attributes.set(`${clusterId}:${attributeName}`, value);
  }

  public updateAttribute(clusterId: number, attributeName: string, value: any) {
    this.attributes.set(`${clusterId}:${attributeName}`, value);
  }

  public addCommandHandler(commandName: string, callback: Function) {
    this.commandHandlers.set(commandName, callback);
  }

  public async invokeCommand(commandName: string, data?: any) {
    const handler = this.commandHandlers.get(commandName);
    if (handler) {
      return await handler(data);
    }
  }
}

export const mockMatterbridge = {
  matterbridgeVersion: '3.8.0',
  systemInformation: { nodeVersion: 'v22.0.0' },
  matterbridgePluginDirectory: '/tmp/matterbridge-plugins',
  addBridgedEndpoint: vi.fn(),
  removeBridgedEndpoint: vi.fn(),
};

export const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  notice: vi.fn(),
  debug: vi.fn(),
  logLevel: 0,
};

vi.mock('matterbridge', () => {
  return {
    MatterbridgeDynamicPlatform: class {
      public matterbridge: any;
      public log: any;
      public config: any;
      constructor(mb: any, log: any, config: any) {
        this.matterbridge = mb;
        this.log = log;
        this.config = config;
      }
      registerDevice(endpoint: any) {
        return Promise.resolve();
      }
    },
    MatterbridgeEndpoint: MockMatterbridgeEndpoint,
  };
});
