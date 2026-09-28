import { Accessory, Categories, Characteristic, Service, uuid } from "hap-nodejs";

/** Generic HAP bridge for HA entities that Matter/Apple Home do not model yet. */
export type HapProfile = "humidifier" | "fan" | "switch" | "light" | "lock" | "thermostat";

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
    const on = service.getCharacteristic(Characteristic.On);
    if (on) on.onGet(() => ["on", "heat", "humidifying"].includes(String(current()?.state).toLowerCase())).onSet((v: any) => void this.platform.ha.callService(domain, v ? "turn_on" : "turn_off", this.entityId));
    if (this.profile === "humidifier") {
      const C: any = Characteristic;
      if (C.RelativeHumidityHumidifierDehumidifierCurrent) service.getCharacteristic(C.RelativeHumidityHumidifierDehumidifierCurrent)?.onGet(() => Number(current()?.attributes?.current_humidity ?? current()?.attributes?.humidity ?? 0));
      if (C.RelativeHumidityHumidifierDehumidifierTarget) service.getCharacteristic(C.RelativeHumidityHumidifierDehumidifierTarget)?.onGet(() => Number(current()?.attributes?.humidity ?? 0));
    }
  }
  async publish(): Promise<void> {
    if (this.isPublished) return;
    this.accessory.on("paired", () => { this.record.isPaired = true; });
    this.accessory.on("unpaired", () => { this.record.isPaired = false; });
    await this.accessory.publish({ username: this.record.username, pincode: this.record.pincode, port: this.record.port, category: Categories.OTHER, setupID: this.record.setupId });
    this.isPublished = true;
  }
  async unpublish(): Promise<void> { if (this.isPublished) await this.accessory.unpublish(); this.isPublished = false; }
}
