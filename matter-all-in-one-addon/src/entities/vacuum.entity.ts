/**
 * vacuum.entity.ts
 *
 * Matterbridge entity for Home Assistant `vacuum.*` devices.
 * Exposes them as the official Matter RVC (Robotic Vacuum Cleaner) — device type 0x0074.
 *
 * Uses the official RoboticVacuumCleaner implementation provided by
 * Matterbridge. Apple Home supports RVC when it is commissioned as an
 * independent Matter server node (mode: 'server'), never as a bridged child.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import { RoboticVacuumCleaner } from "matterbridge/devices";
import { ClusterId } from "matterbridge/matter/types";
import { BaseEntity } from "./base.entity.js";
import { type HassState, isUnavailable } from "../utils/ha-state.js";
import {
  buildVacuumUpdate,
  buildVacuumMatterMeta,
  getSupportedVacuumCleanModes,
} from "../converters/vacuum.converter.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import {
  MATTER_BRIDGE_VENDOR_ID,
  MATTER_BRIDGE_VENDOR_NAME,
} from "../utils/matter-device-identity.js";

export { buildVacuumMatterMeta };

// Mode IDs used as currentMode values
const RUN_MODE_ID_IDLE = 1;
const RUN_MODE_ID_CLEANING = 2;
const ROPVOCNIC_MODEL = "Ropvocnic Tuya Vacuum";
const ELECTRICAL_POWER_MEASUREMENT_ID = 0x0090 as ClusterId;

export class VacuumEntity extends BaseEntity {
  declare public endpoint: RoboticVacuumCleaner;
  private lastCommandTime = 0;

  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    super(platform, state, deviceType);
  }

  /** Learned IR robots are manually connected to their charger; they cannot dock. */
  private isManualChargeOnly(): boolean {
    const identity = `${this.entityId} ${this.state.attributes?.friendly_name ?? ""}`;
    return (
      this.entityId.startsWith("switch.omni_broadlink_") &&
      /(?:^|[_\s-])(everybot|ircedge|robot|aspiradora|vacuum|cleaner)(?:$|[_\s-])/i.test(
        identity,
      )
    );
  }

  /** Locate linked select.*_modo_de_limpieza / select.*_mode entity sharing the same HA device_id or entity name. */
  public getLinkedCleanModeSelector():
    { entityId: string; options: string[]; state?: string } | undefined {
    const entityRegistry = this.platform.ha?.hassEntities?.get(this.entityId);
    const deviceId = entityRegistry?.device_id;

    if (deviceId) {
      const selectors: Array<{
        entityId: string;
        options: string[];
        state?: string;
        name: string;
      }> = [];
      for (const [id, reg] of this.platform.ha?.hassEntities?.entries() ?? []) {
        if (reg.device_id === deviceId && id.startsWith("select.")) {
          const stateObj = this.platform.ha?.hassStates?.get(id);
          const options = Array.isArray(stateObj?.attributes?.options)
            ? stateObj.attributes.options
            : [];
          if (options.length > 0) {
            selectors.push({
              entityId: id,
              options,
              state: stateObj?.state,
              name: `${id} ${stateObj?.attributes?.friendly_name ?? reg.name ?? ""}`.toLowerCase(),
            });
          }
        }
      }
      const namedMode = selectors.find((selector) =>
        /mode|modo|clean|limp|aspir/i.test(selector.name),
      );
      const selected =
        namedMode ?? (selectors.length === 1 ? selectors[0] : undefined);
      if (selected) {
        return {
          entityId: selected.entityId,
          options: selected.options,
          state: selected.state,
        };
      }
    }

    const [domain, objectId] = this.entityId.split(".");
    const patterns = [
      `select.${objectId}_modo_de_limpieza`,
      `select.${objectId}_mode`,
      `select.${objectId}_clean_mode`,
    ];
    for (const pattern of patterns) {
      const stateObj = this.platform.ha?.hassStates?.get(pattern);
      if (stateObj) {
        const options = Array.isArray(stateObj.attributes?.options)
          ? stateObj.attributes.options
          : [];
        return { entityId: pattern, options, state: stateObj.state };
      }
    }

    return undefined;
  }

  public isLinkedCleanModeSelector(entityId: string): boolean {
    return this.getLinkedCleanModeSelector()?.entityId === entityId;
  }

  private getBatteryLevel(state: HassState): number | null {
    const rawAttributeLevel = state.attributes?.battery_level;
    if (
      rawAttributeLevel !== undefined &&
      rawAttributeLevel !== null &&
      rawAttributeLevel !== ""
    ) {
      const attributeLevel = Number(rawAttributeLevel);
      if (
        Number.isFinite(attributeLevel) &&
        attributeLevel >= 0 &&
        attributeLevel <= 100
      ) {
        return attributeLevel;
      }
    }

    const deviceId = this.platform.ha?.hassEntities?.get(this.entityId)?.device_id;
    if (!deviceId) return null;
    for (const [entityId, registryEntry] of this.platform.ha?.hassEntities?.entries() ?? []) {
      if (
        registryEntry.device_id !== deviceId ||
        !entityId.startsWith("sensor.")
      ) continue;
      const sensor = this.platform.ha?.hassStates?.get(entityId);
      if (sensor?.attributes?.device_class !== "battery") continue;
      if (
        sensor.state === undefined ||
        sensor.state === null ||
        sensor.state === ""
      ) continue;
      const level = Number(sensor.state);
      if (Number.isFinite(level) && level >= 0 && level <= 100) return level;
    }
    return null;
  }

  public async updateLinkedBatteryLevel(value: unknown): Promise<void> {
    if (
      !this.endpoint ||
      value === undefined ||
      value === null ||
      value === ""
    ) return;
    const level = Number(value);
    if (!Number.isFinite(level) || level < 0 || level > 100) return;
    await safeUpdateAttribute(
      this.endpoint as any,
      "powerSource" as any,
      "batPercentRemaining",
      Math.round(level * 2),
      this.platform.log,
    );
  }

  /** A same-device power sensor is an optional Matter capability of this RVC. */
  public getLinkedPowerSensor(): HassState | undefined {
    const deviceId = this.platform.ha?.hassEntities?.get(
      this.entityId,
    )?.device_id;
    if (!deviceId) return undefined;
    for (const [entityId, registryEntry] of this.platform.ha?.hassEntities?.entries() ?? []) {
      if (
        !entityId.startsWith("sensor.") ||
        registryEntry.device_id !== deviceId
      ) continue;
      const sensor = this.platform.ha?.hassStates?.get(entityId);
      if (sensor?.attributes?.device_class === "power") return sensor;
    }
    return undefined;
  }

  private powerToMilliwatts(state: HassState): number | null {
    const value = Number(state.state);
    if (!Number.isFinite(value)) return null;
    const unit = String(state.attributes?.unit_of_measurement ?? "W").trim();
    const multipliers: Record<string, number> = {
      mW: 1,
      W: 1_000,
      kW: 1_000_000,
      MW: 1_000_000_000,
      GW: 1_000_000_000_000,
    };
    const multiplier = multipliers[unit] ?? 1_000;
    const milliWatts = Math.round(value * multiplier);
    return Number.isSafeInteger(milliWatts) ? milliWatts : null;
  }

  public async updateLinkedPowerSensor(state: HassState): Promise<void> {
    if (!this.endpoint || state.attributes?.device_class !== "power") return;
    const linked = this.getLinkedPowerSensor();
    if (linked?.entity_id !== state.entity_id) return;
    const milliWatts = this.powerToMilliwatts(state);
    if (milliWatts === null) return;
    await safeUpdateAttribute(
      this.endpoint as any,
      ELECTRICAL_POWER_MEASUREMENT_ID,
      "activePower",
      milliWatts,
      this.platform.log,
    );
  }

  public async updateLinkedCleanMode(entityId: string, state: string): Promise<void> {
    if (!this.endpoint || !this.isLinkedCleanModeSelector(entityId)) return;
    const selector = this.getLinkedCleanModeSelector();
    const selected =
      selector &&
      getSupportedVacuumCleanModes(selector.options).find(
        (mode) => mode.option.toLowerCase() === String(state).toLowerCase(),
      );
    if (!selected) return;
    await safeUpdateAttribute(
      this.endpoint as any,
      "rvcCleanMode" as any,
      "currentMode",
      selected.mode,
      this.platform.log,
    );
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;
    const uniqueName = rawName.substring(0, 32).trim();
    const stableId = this.entityId.replaceAll(".", "_");
    const serialNumber = this.getMatterSerialNumber();

    const supportedRunModes = [
      { label: "Idle", mode: 1, modeTags: [{ value: 16384 }] }, // 0x4000 = 16384 (Idle)
      { label: "Cleaning", mode: 2, modeTags: [{ value: 16385 }] }, // 0x4001 = 16385 (Cleaning)
    ];

    const operationalStateList = [
      { operationalStateId: 0 }, // Stopped
      { operationalStateId: 1 }, // Running
      { operationalStateId: 2 }, // Paused
      { operationalStateId: 3 }, // Error
      ...(this.isManualChargeOnly()
        ? []
        : [
            { operationalStateId: 64 }, // SeekingCharger
            { operationalStateId: 65 }, // Charging
            { operationalStateId: 66 }, // Docked
          ]),
    ];

    const cleanSelector = this.getLinkedCleanModeSelector();
    const cleanModeDefs = cleanSelector
      ? getSupportedVacuumCleanModes(cleanSelector.options)
      : [];
    const supportedCleanModes =
      cleanModeDefs.length > 0
        ? cleanModeDefs.map((def) => ({
            label: def.label,
            mode: def.mode,
            // Every Tuya mode vacuums. The second tag is intentionally unique so
            // Apple Home presents distinct choices instead of merging them all
            // into one Deep Clean button.
            modeTags: [{ value: 16385 }, { value: def.modeTag }],
          }))
        : [{ label: "Vacuum", mode: 1, modeTags: [{ value: 16385 }] }];
    const initialCleanMode = cleanSelector?.state
      ? (cleanModeDefs.find(
          (d) => d.option.toLowerCase() === cleanSelector.state?.toLowerCase(),
        )?.mode ?? 1)
      : 1;

    const rawAreas = this.state.attributes?.rooms || this.state.attributes?.zones || [];
    const supportedAreas = Array.isArray(rawAreas)
      ? rawAreas.map((room: string, idx: number) => ({
          areaId: idx + 1,
          mapId: 1,
          areaInfo: { locationInfo: { locationName: String(room) } },
        }))
      : [];

    this.endpoint = new RoboticVacuumCleaner(uniqueName, serialNumber, {
      mode: "server" as const,
      currentRunMode: RUN_MODE_ID_IDLE,
      supportedRunModes,
      currentCleanMode: initialCleanMode,
      supportedCleanModes,
      currentPhase: null,
      phaseList: null,
      operationalState: 0,
      operationalStateList,
      supportedAreas: supportedAreas as any,
      selectedAreas: [],
      currentArea: null,
      supportedMaps: [],
    });
    // Keep the linked power measurement on the same RVC endpoint and QR.
    // Apple Home may not render this optional reading in its vacuum UI.
    this.endpoint.addClusterServers([ELECTRICAL_POWER_MEASUREMENT_ID]);

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = uniqueName;
    this.endpoint.uniqueId = stableId;
    this.endpoint.serialNumber = serialNumber;
    this.endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    this.endpoint.vendorName = MATTER_BRIDGE_VENDOR_NAME;
    this.endpoint.productId = 0x8000;
    // These properties populate the standalone ServerNode Basic Information
    // cluster that Apple Home reads. Setting only the endpoint cluster below is
    // insufficient because Matterbridge creates the node before attaching it.
    this.endpoint.productName = ROPVOCNIC_MODEL;
    this.applyMatterbridgeFirmware();

    safeSetAttribute(
      this.endpoint as any,
      "basicInformation" as any,
      "vendorName",
      MATTER_BRIDGE_VENDOR_NAME,
      this.platform.log,
    );
    safeSetAttribute(
      this.endpoint as any,
      "basicInformation" as any,
      "productName",
      ROPVOCNIC_MODEL,
      this.platform.log,
    );
    safeSetAttribute(
      this.endpoint as any,
      "basicInformation" as any,
      "nodeLabel",
      uniqueName,
      this.platform.log,
    );
    safeSetAttribute(
      this.endpoint as any,
      "basicInformation" as any,
      "softwareVersionString",
      "Matterbridge bridge endpoint",
      this.platform.log,
    );

    this.registerCommandHandlers();

    return this.endpoint as unknown as MatterbridgeEndpoint;
  }

  // ─── State sync (HA → Matter) ─────────────────────────────────────────

  override async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    if (!this.endpoint) return;
    await this.syncState(this.endpoint, newState, isInitialSync);
    this.state = newState;
  }

  private async syncState(
    endpoint: RoboticVacuumCleaner,
    state: HassState,
    isInitialSync = false,
  ): Promise<void> {
    const update = buildVacuumUpdate(state as any);
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      const now = Date.now();
      const commandCooldown = now - this.lastCommandTime < 15000;

      if (!commandCooldown || isInitialSync || update.isChargingOrDocked) {
        await syncFunc(
          endpoint as any,
          "rvcOperationalState" as any,
          "operationalState",
          update.operationalState,
          this.platform.log,
        );

        const runMode = update.onOff ? RUN_MODE_ID_CLEANING : RUN_MODE_ID_IDLE;
        await syncFunc(
          endpoint as any,
          "rvcRunMode" as any,
          "currentMode",
          runMode,
          this.platform.log,
        );
      }

      const cleanSelector = this.getLinkedCleanModeSelector();
      if (cleanSelector?.state) {
        const activeMatch = getSupportedVacuumCleanModes(
          cleanSelector.options,
        ).find(
          (d) => d.option.toLowerCase() === cleanSelector.state?.toLowerCase(),
        );
        if (activeMatch) {
          await syncFunc(
            endpoint as any,
            "rvcCleanMode" as any,
            "currentMode",
            activeMatch.mode,
            this.platform.log,
          );
        }
      }

      const batteryLevel = this.getBatteryLevel(state);
      if (batteryLevel !== null) {
        await syncFunc(
          endpoint as any,
          "powerSource" as any,
          "batPercentRemaining",
          Math.round(batteryLevel * 2),
          this.platform.log,
        );
      }

      const linkedPower = this.getLinkedPowerSensor();
      const powerMilliWatts = linkedPower
        ? this.powerToMilliwatts(linkedPower)
        : null;
      if (powerMilliWatts !== null) {
        await syncFunc(
          endpoint as any,
          ELECTRICAL_POWER_MEASUREMENT_ID,
          "activePower",
          powerMilliWatts,
          this.platform.log,
        );
      }

      await syncFunc(
        endpoint as any,
        "powerSource" as any,
        "batChargeState",
        update.isChargingOrDocked || state.state.toLowerCase() === "docked"
          ? 1
          : 3,
        this.platform.log,
      );
    } catch (err) {
      this.platform.log?.warn?.(
        `[VacuumEntity] syncState error for ${this.state.entity_id}: ${err}`,
      );
    }
  }

  private async syncCleanModeState(mode: number): Promise<void> {
    safeSetAttribute(
      this.endpoint as any,
      "rvcCleanMode" as any,
      "currentMode",
      mode,
      this.platform.log,
    );
  }

  // ─── Command handlers (Matter → HA) ───────────────────────────────────

  protected override registerCommandHandlers(
    endpoint?: MatterbridgeEndpoint,
  ): void {
    if (!endpoint) endpoint = this.endpoint as unknown as MatterbridgeEndpoint;

    endpoint.addCommandHandler("RvcRunMode.changeToMode", async (data: any) => {
      this.assertOnline();
      this.lastCommandTime = Date.now();
      this.platform.log?.info?.(
        `[VacuumEntity] changeToMode commanded: ${JSON.stringify(data)}`,
      );
      const { request } = data;
      if (request?.newMode === RUN_MODE_ID_CLEANING) {
        safeSetAttribute(
          endpoint as any,
          "rvcOperationalState" as any,
          "operationalState",
          1,
          this.platform.log,
        );
        safeSetAttribute(
          endpoint as any,
          "rvcRunMode" as any,
          "currentMode",
          RUN_MODE_ID_CLEANING,
          this.platform.log,
        );
        await this.callHaService("vacuum.start");
      } else if (request?.newMode === RUN_MODE_ID_IDLE) {
        safeSetAttribute(
          endpoint as any,
          "rvcOperationalState" as any,
          "operationalState",
          this.isManualChargeOnly() ? 0 : 64,
          this.platform.log,
        );
        safeSetAttribute(
          endpoint as any,
          "rvcRunMode" as any,
          "currentMode",
          RUN_MODE_ID_IDLE,
          this.platform.log,
        );
        await this.callHaService("vacuum.return_to_base");
      }
    });

    endpoint.addCommandHandler(
      "RvcCleanMode.changeToMode",
      async (data: any) => {
        this.assertOnline();
        this.platform.log?.info?.(
          `[VacuumEntity] RvcCleanMode.changeToMode commanded: ${JSON.stringify(data)}`,
        );
        const newMode = data?.request?.newMode;
        const cleanSelector = this.getLinkedCleanModeSelector();
        if (cleanSelector && typeof newMode === "number") {
          const defs = getSupportedVacuumCleanModes(cleanSelector.options);
          const match = defs.find((d) => d.mode === newMode);
          if (match) {
            this.lastCommandTime = Date.now();
            await this.platform.ha?.callService(
              "select",
              "select_option",
              cleanSelector.entityId,
              { option: match.option },
            );
            await this.syncCleanModeState(match.mode);
          }
        }
      },
    );

    // Matterbridge 3.10.12+ advertises ServiceArea.SkipArea for every RVC.
    // Home Assistant's generic vacuum API has no portable skip-area service,
    // so reject this command explicitly instead of allowing Matterbridge to
    // acknowledge it while the vacuum continues cleaning the selected area.
    endpoint.addCommandHandler("ServiceArea.skipArea", async () => {
      this.assertOnline();
      throw new Error(
        "SkipArea is not supported by the configured Home Assistant vacuum entity",
      );
    });

    endpoint.addCommandHandler("RvcOperationalState.resume", async () => {
      this.assertOnline();
      this.lastCommandTime = Date.now();
      safeSetAttribute(
        endpoint as any,
        "rvcOperationalState" as any,
        "operationalState",
        1,
        this.platform.log,
      );
      safeSetAttribute(
        endpoint as any,
        "rvcRunMode" as any,
        "currentMode",
        RUN_MODE_ID_CLEANING,
        this.platform.log,
      );
      await this.callHaService("vacuum.start");
    });

    endpoint.addCommandHandler("RvcOperationalState.pause", async () => {
      this.assertOnline();
      this.lastCommandTime = Date.now();
      safeSetAttribute(
        endpoint as any,
        "rvcOperationalState" as any,
        "operationalState",
        2,
        this.platform.log,
      );
      const features = this.state.attributes.supported_features ?? 0;
      const SUPPORT_PAUSE = 4;
      if (!(features & SUPPORT_PAUSE)) {
        this.platform.log?.info?.(
          `[VacuumEntity] pause command received but not supported, falling back to vacuum.stop`,
        );
        await this.callHaService("vacuum.stop");
      } else {
        await this.callHaService("vacuum.pause");
      }
    });

    endpoint.addCommandHandler("RvcOperationalState.goHome", async () => {
      this.assertOnline();
      this.lastCommandTime = Date.now();
      safeSetAttribute(
        endpoint as any,
        "rvcOperationalState" as any,
        "operationalState",
        this.isManualChargeOnly() ? 0 : 64,
        this.platform.log,
      );
      safeSetAttribute(
        endpoint as any,
        "rvcRunMode" as any,
        "currentMode",
        RUN_MODE_ID_IDLE,
        this.platform.log,
      );
      await this.callHaService("vacuum.return_to_base");
    });

    endpoint.addCommandHandler("goHome", async () => {
      this.assertOnline();
      this.lastCommandTime = Date.now();
      safeSetAttribute(
        endpoint as any,
        "rvcOperationalState" as any,
        "operationalState",
        this.isManualChargeOnly() ? 0 : 64,
        this.platform.log,
      );
      safeSetAttribute(
        endpoint as any,
        "rvcRunMode" as any,
        "currentMode",
        RUN_MODE_ID_IDLE,
        this.platform.log,
      );
      await this.callHaService("vacuum.return_to_base");
    });

    endpoint.addCommandHandler("identify", async () => {
      this.platform.log?.info?.(
        `[VacuumEntity] identify (Play sound to locate) commanded`,
      );
      await this.callHaService("vacuum.locate");
    });
  }

  private async callHaService(service: string): Promise<void> {
    try {
      let domain = "vacuum";
      let action = "start";
      let entityId = this.state.entity_id;
      let serviceData: Record<string, any> = {};

      const isSwitchEntity = this.state.entity_id.startsWith("switch.");

      if (isSwitchEntity) {
        domain = "switch";
        if (service === "vacuum.start") {
          action = "turn_on";
        } else {
          action = "turn_off";
        }
      } else if (service === "vacuum.return_to_base") {
        const objectId = this.state.entity_id.split(".")[1];
        const btnEntityId2 = `button.${objectId}_volver_a_base_2`;
        const btnEntityId = `button.${objectId}_volver_a_base`;
        const selectEntityId = `select.${objectId}_modo`;

        const hasBtn2 = this.platform.ha?.hassStates?.has(btnEntityId2);
        const hasBtn = this.platform.ha?.hassStates?.has(btnEntityId);
        const hasSelect = this.platform.ha?.hassStates?.has(selectEntityId);

        if (hasBtn2) {
          domain = "button";
          action = "press";
          entityId = btnEntityId2;
          this.platform.log?.info?.(
            `[VacuumEntity] Redirecting return_to_base to button.press on ${btnEntityId2}`,
          );
        } else if (hasBtn) {
          domain = "button";
          action = "press";
          entityId = btnEntityId;
          this.platform.log?.info?.(
            `[VacuumEntity] Redirecting return_to_base to button.press on ${btnEntityId}`,
          );
        } else if (hasSelect) {
          domain = "select";
          action = "select_option";
          entityId = selectEntityId;
          serviceData = { option: "chargego" };
          this.platform.log?.info?.(
            `[VacuumEntity] Redirecting return_to_base to select.select_option on ${selectEntityId} with option chargego`,
          );
        } else {
          [domain, action] = service.split(".");
        }
      } else {
        [domain, action] = service.split(".");
      }

      await this.platform.ha?.callService(
        domain,
        action,
        entityId,
        serviceData,
      );
      this.platform.log?.info?.(
        `[VacuumEntity] Called ${domain}.${action} on ${entityId} with ${JSON.stringify(serviceData)}`,
      );
    } catch (err) {
      this.platform.log?.error?.(
        `[VacuumEntity] Failed to call ${service}: ${err}`,
      );
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  public override async setReachability(reachable: boolean): Promise<void> {
    await super.setReachability(reachable);
    if (!reachable && this.endpoint) {
      try {
        // Matter RvcOperationalState: 0 = Stopped
        // Never set operationalState to 3 (Error) when unreachable/offline;
        // Error (3) causes Apple Home to render an active "Alert" badge with
        // an active action button, misleading the user into thinking the robot
        // has a physical jam rather than being powered off or disconnected.
        safeSetAttribute(
          this.endpoint as any,
          "rvcOperationalState" as any,
          "operationalState",
          0,
          this.platform.log,
        );
        safeSetAttribute(
          this.endpoint as any,
          "rvcRunMode" as any,
          "currentMode",
          RUN_MODE_ID_IDLE,
          this.platform.log,
        );
      } catch {}
    } else if (reachable && this.endpoint && this.state) {
      try {
        await this.syncState(this.endpoint, this.state);
      } catch {}
    }
  }

  static matterTypeLabel = "RoboticVacuumCleaner" as const;
}
