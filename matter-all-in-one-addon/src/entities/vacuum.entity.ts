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
      const candidates: Array<{
        entityId: string;
        options: string[];
        state?: string;
        score: number;
      }> = [];

      for (const [id, reg] of this.platform.ha?.hassEntities?.entries() ?? []) {
        if (reg.device_id === deviceId && id.startsWith("select.")) {
          const stateObj = this.platform.ha?.hassStates?.get(id);
          const options: string[] = Array.isArray(stateObj?.attributes?.options)
            ? stateObj.attributes.options
            : [];
          if (options.length === 0) continue;

          const lowerId = id.toLowerCase();
          const friendly = String(
            stateObj?.attributes?.friendly_name ?? "",
          ).toLowerCase();
          const supportedCleanModes = getSupportedVacuumCleanModes(options);

          // Skip manual directional selectors if they have no clean modes
          const isDirectionSelector =
            /(control_manual|direction|direccion|manual_control)/i.test(
              `${lowerId} ${friendly}`,
            ) ||
            options.some((o) =>
              ["forward", "backward", "turn_left", "turn_right"].includes(
                String(o).toLowerCase(),
              ),
            );
          if (isDirectionSelector && supportedCleanModes.length === 0) {
            continue;
          }

          let score = supportedCleanModes.length * 10;
          if (
            /(modo_de_limpieza|clean_mode|cleaning_mode|work_mode|_modo$|_mode$)/i.test(
              lowerId,
            ) ||
            /(modo de limpieza|clean mode|cleaning mode)/i.test(friendly)
          ) {
            score += 50;
          }
          if (
            options.some((o) =>
              ["chargego", "smart", "spiral", "wall_follow"].includes(
                String(o).toLowerCase(),
              ),
            )
          ) {
            score += 25;
          }

          candidates.push({
            entityId: id,
            options,
            state: stateObj?.state,
            score,
          });
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0]!;
        return {
          entityId: best.entityId,
          options: best.options,
          state: best.state,
        };
      }
    }

    const [, objectId] = this.entityId.split(".");
    const patterns = [
      `select.${objectId}_modo_de_limpieza`,
      `select.${objectId}_mode`,
      `select.${objectId}_clean_mode`,
      `select.${objectId}_modo`,
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

  /** Locate linked battery sensor entity sharing the same HA device_id or entity name. */
  public getLinkedBatteryLevel(): number | null {
    const entityRegistry = this.platform.ha?.hassEntities?.get(this.entityId);
    const deviceId = entityRegistry?.device_id;

    const parseLevel = (stateObj: any): number | null => {
      if (!stateObj || isUnavailable(stateObj)) return null;
      const val = Number(stateObj.state);
      return Number.isFinite(val)
        ? Math.min(100, Math.max(0, Math.round(val)))
        : null;
    };

    if (deviceId) {
      for (const [id, reg] of this.platform.ha?.hassEntities?.entries() ?? []) {
        if (reg.device_id === deviceId && id.startsWith("sensor.")) {
          const stateObj = this.platform.ha?.hassStates?.get(id);
          const dc = String(
            stateObj?.attributes?.device_class ?? "",
          ).toLowerCase();
          const unit = String(stateObj?.attributes?.unit_of_measurement ?? "");
          if (
            dc === "battery" ||
            (/(battery|bateria)/i.test(id) && unit === "%")
          ) {
            const level = parseLevel(stateObj);
            if (level !== null) return level;
          }
        }
      }
    }

    const [, objectId] = this.entityId.split(".");
    for (const pattern of [
      `sensor.${objectId}_battery`,
      `sensor.${objectId}_bateria`,
      `sensor.${objectId}_battery_level`,
    ]) {
      const level = parseLevel(this.platform.ha?.hassStates?.get(pattern));
      if (level !== null) return level;
    }

    return null;
  }

  /** Locate linked return-to-base button entity sharing the same HA device_id or entity name. */
  public getLinkedDockButton(): string | undefined {
    const entityRegistry = this.platform.ha?.hassEntities?.get(this.entityId);
    const deviceId = entityRegistry?.device_id;

    if (deviceId) {
      for (const [id, reg] of this.platform.ha?.hassEntities?.entries() ?? []) {
        if (reg.device_id === deviceId && id.startsWith("button.")) {
          const stateObj = this.platform.ha?.hassStates?.get(id);
          const label = `${id} ${stateObj?.attributes?.friendly_name ?? ""}`;
          if (
            /(volver_a_base|return_to_base|chargego|dock|home|cargar|base)/i.test(
              label,
            )
          ) {
            return id;
          }
        }
      }
    }

    const [, objectId] = this.entityId.split(".");
    for (const candidate of [
      `button.${objectId}_volver_a_base_2`,
      `button.${objectId}_volver_a_base`,
      `button.${objectId}_return_to_base`,
    ]) {
      if (this.platform.ha?.hassStates?.has(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  /** Locate linked start cleaning button entity sharing the same HA device_id or entity name. */
  public getLinkedStartButton(): string | undefined {
    const entityRegistry = this.platform.ha?.hassEntities?.get(this.entityId);
    const deviceId = entityRegistry?.device_id;

    if (deviceId) {
      for (const [id, reg] of this.platform.ha?.hassEntities?.entries() ?? []) {
        if (reg.device_id === deviceId && id.startsWith("button.")) {
          const stateObj = this.platform.ha?.hassStates?.get(id);
          const label = `${id} ${stateObj?.attributes?.friendly_name ?? ""}`;
          if (/(iniciar_limpieza|start_cleaning|start|limpiar)/i.test(label)) {
            return id;
          }
        }
      }
    }

    const [, objectId] = this.entityId.split(".");
    for (const candidate of [
      `button.${objectId}_iniciar_limpieza`,
      `button.${objectId}_start`,
    ]) {
      if (this.platform.ha?.hassStates?.has(candidate)) {
        return candidate;
      }
    }

    return undefined;
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

    const rawAreas =
      this.state.attributes?.rooms || this.state.attributes?.zones || [];
    const supportedAreas =
      Array.isArray(rawAreas) && rawAreas.length > 0
        ? rawAreas.map((room: string, idx: number) => ({
            areaId: idx + 1,
            mapId: null,
            areaInfo: {
              locationInfo: {
                locationName: String(room),
                floorNumber: 0,
                areaType: null,
              },
              landmarkInfo: null,
            },
          }))
        : undefined;

    const initialUpdate = buildVacuumUpdate(this.state);
    const isSelectorDocked =
      cleanSelector?.state?.toLowerCase() === "chargego";
    const initialOperationalState = this.isManualChargeOnly()
      ? initialUpdate.onOff
        ? 1
        : 0
      : isSelectorDocked
        ? 66 // Docked
        : initialUpdate.operationalState === 0 &&
            this.state.state.toLowerCase() === "docked"
          ? 66
          : initialUpdate.operationalState;
    const initialRunMode =
      !isSelectorDocked && initialUpdate.onOff
        ? RUN_MODE_ID_CLEANING
        : RUN_MODE_ID_IDLE;

    this.endpoint = new RoboticVacuumCleaner(uniqueName, serialNumber, {
      mode: "server" as const,
      currentRunMode: initialRunMode,
      supportedRunModes,
      currentCleanMode: initialCleanMode,
      supportedCleanModes,
      currentPhase: null,
      phaseList: null,
      operationalState: initialOperationalState,
      operationalStateList,
      supportedAreas: supportedAreas as any,
      selectedAreas: [],
      currentArea: null,
      supportedMaps: [],
    });

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
    const cleanSelector = this.getLinkedCleanModeSelector();
    const isSelectorDocked =
      cleanSelector?.state?.toLowerCase() === "chargego";
    const isChargingOrDocked = update.isChargingOrDocked || isSelectorDocked;
    const effectiveOperationalState = isSelectorDocked
      ? 66 // Docked
      : update.operationalState;
    const effectiveOnOff = !isSelectorDocked && update.onOff;
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      const now = Date.now();
      const commandCooldown = now - this.lastCommandTime < 15000;

      if (!commandCooldown || isInitialSync || isChargingOrDocked) {
        await syncFunc(
          endpoint as any,
          "rvcOperationalState" as any,
          "operationalState",
          effectiveOperationalState,
          this.platform.log,
        );

        const runMode = effectiveOnOff
          ? RUN_MODE_ID_CLEANING
          : RUN_MODE_ID_IDLE;
        await syncFunc(
          endpoint as any,
          "rvcRunMode" as any,
          "currentMode",
          runMode,
          this.platform.log,
        );
      }

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

      const batteryLevel =
        update.batteryLevel ?? this.getLinkedBatteryLevel();
      if (batteryLevel !== null) {
        await syncFunc(
          endpoint as any,
          "powerSource" as any,
          "batPercentRemaining",
          Math.round(batteryLevel * 2),
          this.platform.log,
        );
      }

      await syncFunc(
        endpoint as any,
        "powerSource" as any,
        "batChargeState",
        isChargingOrDocked || state.state.toLowerCase() === "docked"
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
        const linkedDockBtn = this.getLinkedDockButton();
        const linkedCleanSelect = this.getLinkedCleanModeSelector();
        const hasChargeGoOption = linkedCleanSelect?.options?.some(
          (o) => String(o).toLowerCase() === "chargego",
        );
        const objectId = this.state.entity_id.split(".")[1];
        const selectEntityId = `select.${objectId}_modo`;
        const hasSelect = this.platform.ha?.hassStates?.has(selectEntityId);

        if (linkedDockBtn) {
          domain = "button";
          action = "press";
          entityId = linkedDockBtn;
          this.platform.log?.info?.(
            `[VacuumEntity] Redirecting return_to_base to button.press on ${linkedDockBtn}`,
          );
        } else if (linkedCleanSelect && hasChargeGoOption) {
          domain = "select";
          action = "select_option";
          entityId = linkedCleanSelect.entityId;
          serviceData = { option: "chargego" };
          this.platform.log?.info?.(
            `[VacuumEntity] Redirecting return_to_base to select.select_option on ${linkedCleanSelect.entityId} with option chargego`,
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
