import { Accessory, Categories, Characteristic, Service, uuid } from "@homebridge/hap-nodejs";

/** Generic HAP bridge for HA entities that Matter/Apple Home do not model yet. */
export type HapProfile = "humidifier" | "fan" | "switch" | "light" | "lock" | "thermostat" | "plug" | "dimmer" | "vacuum";

/** Map each HapProfile to the correct HomeKit accessory category so Apple Home shows the right icon. */
function categoryForProfile(profile: HapProfile): Categories {
  switch (profile) {
    case "humidifier": return Categories.AIR_HUMIDIFIER;
    case "fan":        return Categories.FAN;
    case "light":      return Categories.LIGHTBULB;
    case "lock":       return Categories.DOOR_LOCK;
    case "thermostat": return Categories.THERMOSTAT;
    case "plug":       return Categories.OUTLET;
    case "dimmer":     return Categories.LIGHTBULB;
    case "vacuum":     return Categories.OTHER;
    default:           return Categories.SWITCH;
  }
}

export class HomeKitEntityAccessory {
  public readonly accessory: Accessory;
  public isPublished = false;
  constructor(public readonly platform: any, public readonly entityId: string, public readonly profile: HapProfile, public readonly record: any) {
    this.accessory = new Accessory(record.name || entityId, record.uuid || uuid.generate(`homekit:entity:${entityId}:${profile}`));
    const info = this.accessory.getService(Service.AccessoryInformation)!;
    info.setCharacteristic(Characteristic.Manufacturer, record.manufacturer || "Home Assistant");
    info.setCharacteristic(Characteristic.Model, record.model || `HAP ${profile}`);
    info.setCharacteristic(Characteristic.SerialNumber, entityId.replaceAll(".", "_"));
    this.buildService();
  }
  private buildService(): void {
    const current = () => this.platform?.ha?.hassStates?.get(this.entityId);
    const domain = this.entityId.split(".")[0];
    const service = this.profile === "humidifier" ? this.accessory.addService(Service.HumidifierDehumidifier, this.record.name) :
      this.profile === "fan" ? this.accessory.addService(Service.Fanv2, this.record.name) :
      this.profile === "lock" ? this.accessory.addService(Service.LockMechanism, this.record.name) :
      this.profile === "light" ? this.accessory.addService(Service.Lightbulb, this.record.name) :
      this.profile === "thermostat" ? this.accessory.addService(Service.Thermostat, this.record.name) :
      this.accessory.addService(Service.Switch, this.record.name);

    if (this.profile === "humidifier") {
      // HumidifierDehumidifier requires Active (not On), CurrentHumidifierDehumidifierState,
      // TargetHumidifierDehumidifierState and CurrentRelativeHumidity per the HAP spec.
      const isActive = () => ["on", "humidifying"].includes(String(current()?.state).toLowerCase());
      service.getCharacteristic(Characteristic.Active)
        .onGet(() => isActive() ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
        .onSet((v: any) => void this.platform.ha.callService(domain, v ? "turn_on" : "turn_off", this.entityId));

      service.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
        .onGet(() => isActive()
          ? Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
          : Characteristic.CurrentHumidifierDehumidifierState.IDLE);

      service.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
        .onGet(() => Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER)
        .onSet(() => { /* humidifier-only device, mode is fixed */ });

      service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => Number(current()?.attributes?.current_humidity ?? current()?.attributes?.humidity ?? 0));

      const target = service.getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold);
      if (target) {
        target.onGet(() => Number(current()?.attributes?.humidity ?? 0));
      }
    } else {
      // All other profiles use a simple On/Off characteristic.
      const on = service.getCharacteristic(Characteristic.On);
      if (on) on
        .onGet(() => ["on", "heat"].includes(String(current()?.state).toLowerCase()))
        .onSet((v: any) => void this.platform.ha.callService(domain, v ? "turn_on" : "turn_off", this.entityId));
    }
  }
  async publish(): Promise<void> {
    if (this.isPublished) return;
    this.accessory.on("paired", () => { this.record.isPaired = true; });
    this.accessory.on("unpaired", () => { this.record.isPaired = false; });
    await this.accessory.publish({ username: this.record.username, pincode: this.record.pincode, port: this.record.port, category: categoryForProfile(this.profile), setupID: this.record.setupId });
    this.isPublished = true;
  }
  async unpublish(): Promise<void> { if (this.isPublished) await this.accessory.unpublish(); this.isPublished = false; }
}
