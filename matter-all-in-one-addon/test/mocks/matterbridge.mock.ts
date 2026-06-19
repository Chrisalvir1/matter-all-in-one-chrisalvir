/**
 * Matterbridge and Endpoint mock APIs.
 */
import { vi } from 'vitest';

export class MockMatterbridgeEndpoint {
  public deviceTypes: any[];
  public options: any;
  public clusterServers = new Set<number>();
  public attributes = new Map<string, any>();
  public commandHandlers = new Map<string, (...args: any[]) => any>();

  constructor(deviceTypes: any[], options: any) {
    this.deviceTypes = deviceTypes;
    this.options = options;
  }

  public addClusterServers(clusterIds: number[]) {
    clusterIds.forEach(id => this.clusterServers.add(id));
  }

  public addRequiredClusterServers() {}

  public createDefaultBridgedDeviceBasicInformationClusterServer(
    uniqueName: string,
    serialNumber: string,
    vendorId: number,
    vendorName: string,
    productLabel: string
  ) {}

  public hasClusterServer(cluster: any): boolean {
    return this.clusterServers.has(cluster.id);
  }

  public addClusterServer(clusterServer: any) {
    if (clusterServer && clusterServer.id) {
      this.clusterServers.add(clusterServer.id);
    }
  }

  public getClusterServer(cluster: any): any {
    if (this.clusterServers.has(cluster.id)) {
      return {
        addCommandHandler: (commandName: string, callback: (...args: any[]) => any) => {
          this.commandHandlers.set(commandName, callback);
        },
        setBarrierPositionAttribute: (value: any) => {
          this.attributes.set(`${cluster.id}:barrierPosition`, value);
        },
        setMeasuredValueAttribute: (value: any) => {
          this.attributes.set(`${cluster.id}:measuredValue`, value);
        }
      };
    }
    return undefined;
  }

  public hasAttributeServer(clusterId: number, attributeName: string): boolean {
    return true;
  }

  public setAttribute(clusterId: number, attributeName: string, value: any) {
    this.attributes.set(`${clusterId}:${attributeName}`, value);
  }

  public updateAttribute(clusterId: number, attributeName: string, value: any) {
    this.attributes.set(`${clusterId}:${attributeName}`, value);
  }

  public addCommandHandler(commandName: string, callback: (...args: any[]) => any) {
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
  matterbridgeVersion: '3.9.0',
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
  const makeMockDeviceType = (code: number, name: string) => ({
    code,
    name,
    deviceClass: 'Simple',
    category: 'Utility',
  });

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
    MatterbridgeAccessoryPlatform: class {
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
      unregisterDevice(endpoint: any) {
        return Promise.resolve();
      }
    },
    MatterbridgeEndpoint: MockMatterbridgeEndpoint,
    onOffLight: makeMockDeviceType(0x0100, 'onOffLight'),
    dimmableLight: makeMockDeviceType(0x0101, 'dimmableLight'),
    colorTemperatureLight: makeMockDeviceType(0x010c, 'colorTemperatureLight'),
    extendedColorLight: makeMockDeviceType(0x010d, 'extendedColorLight'),
    onOffPlugInUnit: makeMockDeviceType(0x010a, 'onOffPlugInUnit'),
    dimmablePlugInUnit: makeMockDeviceType(0x010b, 'dimmablePlugInUnit'),
    doorLock: makeMockDeviceType(0x000a, 'doorLock'),
    thermostat: makeMockDeviceType(0x0301, 'thermostat'),
    windowCovering: makeMockDeviceType(0x0202, 'windowCovering'),
    temperatureSensor: makeMockDeviceType(0x0302, 'temperatureSensor'),
    humiditySensor: makeMockDeviceType(0x0307, 'humiditySensor'),
    contactSensor: makeMockDeviceType(0x0015, 'contactSensor'),
    occupancySensor: makeMockDeviceType(0x0107, 'occupancySensor'),
    pressureSensor: makeMockDeviceType(0x0305, 'pressureSensor'),
    flowSensor: makeMockDeviceType(0x0306, 'flowSensor'),
    lightSensor: makeMockDeviceType(0x0106, 'lightSensor'),
    roboticVacuumCleaner: makeMockDeviceType(0x0074, 'roboticVacuumCleaner'),
  };
});
