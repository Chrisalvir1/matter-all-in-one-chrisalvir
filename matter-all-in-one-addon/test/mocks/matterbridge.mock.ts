/**
 * Matterbridge and Endpoint mock APIs.
 */
import { vi } from "vitest";

export class MockMatterbridgeEndpoint {
  public deviceTypes: any[];
  public options: any;
  public deviceType: number = 0;
  public deviceName: string = "";
  public uniqueId: string = "";
  public serialNumber: string = "";
  public vendorId: number = 0;
  public vendorName: string = "";
  public productId: number = 0;
  public productName: string = "";
  public softwareVersion: number = 0;
  public softwareVersionString: string = "";
  public behaviors = { require: (...args: any[]) => {} };
  public createFanControlClusterServer = vi.fn().mockImplementation(() => {
    this.hasAttributeServer = vi.fn().mockReturnValue(true);
  });
  public createCompleteFanControlClusterServer = vi.fn().mockImplementation(() => {
    this.createFanControlClusterServer();
  });
  public createMultiSpeedFanControlClusterServer = vi.fn().mockImplementation(() => {
    this.createFanControlClusterServer();
  });
  public clusterServers = new Set<number>();
  public attributes = new Map<string, any>();
  public commandHandlers = new Map<string, (...args: any[]) => any>();
  public children = new Map<string, MockMatterbridgeEndpoint>();

  constructor(deviceTypes: any[], options: any) {
    this.deviceTypes = deviceTypes;
    this.options = options;
  }

  public addClusterServers(clusterIds: number[]) {
    clusterIds.forEach((id) => this.clusterServers.add(id));
  }

  public addRequiredClusterServers() {}

  public createDefaultBasicInformationClusterServer() {
    return this;
  }

  public createDefaultFanControlClusterServer() {
    return this;
  }

  public createDefaultDoorLockClusterServer() {
    return this;
  }

  public addChildDeviceTypeWithClusterServer(
    id: string,
    deviceTypes: any[],
    clusterIds: number[],
  ) {
    const child = new MockMatterbridgeEndpoint(
      Array.isArray(deviceTypes) ? deviceTypes : [deviceTypes],
      { id },
    );
    child.addClusterServers(clusterIds);
    this.children.set(id, child);
    return child;
  }

  public getChildEndpointById(id: string) {
    return this.children.get(id);
  }

  public getChildEndpointByOriginalId(id: string) {
    return this.children.get(id);
  }

  public createDefaultBridgedDeviceBasicInformationClusterServer(
    uniqueName: string,
    serialNumber: string,
    vendorId: number,
    vendorName: string,
    productLabel: string,
  ) {}

  public hasClusterServer(cluster: any): boolean {
    const id = typeof cluster === 'number' ? cluster : cluster?.id;
    return this.clusterServers.has(id);
  }

  public addClusterServer(clusterServer: any) {
    if (clusterServer && clusterServer.id) {
      this.clusterServers.add(clusterServer.id);
    }
  }

  public getClusterServer(cluster: any): any {
    if (this.clusterServers.has(cluster.id)) {
      return {
        addCommandHandler: (
          commandName: string,
          callback: (...args: any[]) => any,
        ) => {
          this.commandHandlers.set(commandName, callback);
        },
        setBarrierPositionAttribute: (value: any) => {
          this.attributes.set(`${cluster.id}:barrierPosition`, value);
        },
        setMeasuredValueAttribute: (value: any) => {
          this.attributes.set(`${cluster.id}:measuredValue`, value);
        },
      };
    }
    return undefined;
  }

  public hasAttributeServer(clusterId: number, attributeName: string): boolean {
    return true;
  }

  public setAttribute(clusterId: any, attributeName: string, value: any) {
    const id =
      typeof clusterId === "object" && clusterId !== null
        ? clusterId.id
        : clusterId;
    this.attributes.set(`${id}:${attributeName}`, value);
  }

  public updateAttribute(clusterId: any, attributeName: string, value: any) {
    const id =
      typeof clusterId === "object" && clusterId !== null
        ? clusterId.id
        : clusterId;
    this.attributes.set(`${id}:${attributeName}`, value);
  }

  public getAttribute(clusterId: any, attributeName: string): any {
    const id =
      typeof clusterId === "object" && clusterId !== null
        ? clusterId.id
        : clusterId;
    return this.attributes.get(`${id}:${attributeName}`);
  }

  public attributeSubscriptions = new Map<
    string,
    ((newValue: any, oldValue: any, context?: any) => any)[]
  >();

  public subscribeAttribute(
    clusterId: any,
    attributeName: string,
    callback: (...args: any[]) => any,
  ) {
    const id =
      typeof clusterId === "object" && clusterId !== null
        ? clusterId.id
        : clusterId;
    const key = `${id}:${attributeName}`;
    const list = this.attributeSubscriptions.get(key) ?? [];
    list.push(callback);
    this.attributeSubscriptions.set(key, list);
    return this;
  }

  public async invokeAttributeChange(
    clusterId: any,
    attributeName: string,
    newValue: any,
    oldValue?: any,
  ) {
    const id =
      typeof clusterId === "object" && clusterId !== null
        ? clusterId.id
        : clusterId;
    const key = `${id}:${attributeName}`;
    const list = this.attributeSubscriptions.get(key);
    if (list) {
      for (const cb of list) {
        await cb(newValue, oldValue, {} as any);
      }
    }
  }

  public addCommandHandler(
    commandName: string,
    callback: (...args: any[]) => any,
  ) {
    this.commandHandlers.set(commandName, callback);
  }

  public async invokeCommand(commandName: string, data?: any) {
    let handler = this.commandHandlers.get(commandName);
    if (!handler && commandName.includes(".")) {
      handler = this.commandHandlers.get(commandName.split(".").pop()!);
    }
    if (!handler && !commandName.includes(".")) {
      for (const [key, h] of this.commandHandlers.entries()) {
        if (key.endsWith("." + commandName)) {
          handler = h;
          break;
        }
      }
    }
    if (handler) {
      return await handler(data);
    }
  }
}

export const mockMatterbridge = {
  matterbridgeVersion: "3.9.0",
  systemInformation: { nodeVersion: "v22.0.0" },
  matterbridgePluginDirectory: "/tmp/matterbridge-plugins",
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

vi.mock("matterbridge", () => {
  const makeMockDeviceType = (code: number, name: string) => ({
    code,
    name,
    deviceClass: "Simple",
    category: "Utility",
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
      unregisterDevice(endpoint: any) {
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
    onOffLight: makeMockDeviceType(0x0100, "onOffLight"),
    dimmableLight: makeMockDeviceType(0x0101, "dimmableLight"),
    colorTemperatureLight: makeMockDeviceType(0x010c, "colorTemperatureLight"),
    extendedColorLight: makeMockDeviceType(0x010d, "extendedColorLight"),
    onOffPlugInUnit: makeMockDeviceType(0x010a, "onOffPlugInUnit"),
    dimmablePlugInUnit: makeMockDeviceType(0x010b, "dimmablePlugInUnit"),
    doorLock: makeMockDeviceType(0x000a, "doorLock"),
    thermostat: makeMockDeviceType(0x0301, "thermostat"),
    windowCovering: makeMockDeviceType(0x0202, "windowCovering"),
    temperatureSensor: makeMockDeviceType(0x0302, "temperatureSensor"),
    humiditySensor: makeMockDeviceType(0x0307, "humiditySensor"),
    contactSensor: makeMockDeviceType(0x0015, "contactSensor"),
    occupancySensor: makeMockDeviceType(0x0107, "occupancySensor"),
    pressureSensor: makeMockDeviceType(0x0305, "pressureSensor"),
    flowSensor: makeMockDeviceType(0x0306, "flowSensor"),
    lightSensor: makeMockDeviceType(0x0106, "lightSensor"),
    roboticVacuumCleaner: makeMockDeviceType(0x0074, "roboticVacuumCleaner"),
    basicVideoPlayer: makeMockDeviceType(0x0028, "basicVideoPlayer"),
    fan: makeMockDeviceType(0x002b, "fan"),
    cooktop: makeMockDeviceType(0x0077, "cooktop"),
    oven: makeMockDeviceType(0x0078, "oven"),
    smokeCoAlarm: makeMockDeviceType(0x0076, "smokeCoAlarm"),
    waterLeakDetector: makeMockDeviceType(0x007b, "waterLeakDetector"),
  };
});

// Keep entity imports from initializing the real Matter runtime during unit
// tests. Some sandboxed CI environments deny uv_uptime before tests can skip
// network-only cases.
vi.mock("matterbridge/devices", () => ({
  RoboticVacuumCleaner: class extends MockMatterbridgeEndpoint {
    constructor(
      name: string,
      serial: string,
      mode: string,
      _runMode?: number,
      _runModes?: any[],
      _cleanMode?: number,
      cleanModes?: any[],
    ) {
      super([{ code: 0x0074, name: "roboticVacuumCleaner" }], {
        id: `${name.replaceAll(" ", "")}-${serial.replaceAll(" ", "")}`,
        mode,
      });
      (this as any).deviceName = name;
      (this as any).serialNumber = serial;
      (this as any).supportedCleanModes = cleanModes;
    }
  },
  BasicVideoPlayer: class extends MockMatterbridgeEndpoint {},
  Cooktop: class extends MockMatterbridgeEndpoint {},
  Oven: class extends MockMatterbridgeEndpoint {},
}));
