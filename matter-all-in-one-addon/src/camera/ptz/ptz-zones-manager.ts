/**
 * Surveillance Zones and PTZ Manager for Matter 1.6.1 + MatterBridge 3.10.11.
 * Manages up to 5 surveillance zones per camera, persists them, and executes PTZ moves.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  CameraPtzInfo,
  PtzZone,
  PtzViewport,
  detectCameraPtzCapabilities,
  MAX_PTZ_PRESETS,
  getDefaultPtzZones,
} from "./ptz-capabilities.js";

export interface PtzStoreData {
  version: number;
  cameras: Record<
    string,
    {
      zones: PtzZone[];
      currentZoneId?: number;
      currentPreset?: number;
      lastMovement?: {
        timestamp: number;
        direction?: string;
        viewport?: PtzViewport;
      };
    }
  >;
}

export class PtzZonesManager extends EventEmitter {
  private static instance: PtzZonesManager | null = null;
  private storePath: string;
  private cameraInfos = new Map<string, CameraPtzInfo>();
  private loaded = false;

  public static getInstance(customPath?: string): PtzZonesManager {
    if (!PtzZonesManager.instance) {
      PtzZonesManager.instance = new PtzZonesManager(customPath);
    }
    return PtzZonesManager.instance;
  }

  constructor(customPath?: string) {
    super();
    this.storePath =
      customPath ||
      process.env.PTZ_STORE_PATH ||
      (fsSync.existsSync("/data")
        ? "/data/ptz-zones-store.json"
        : path.resolve("./ptz-zones-store.json"));
  }

  public async init(): Promise<void> {
    if (this.loaded) return;
    await this.loadFromDisk();
    this.loaded = true;
  }

  private async loadFromDisk(): Promise<void> {
    try {
      if (fsSync.existsSync(this.storePath)) {
        const raw = await fs.readFile(this.storePath, "utf-8");
        const data: PtzStoreData = JSON.parse(raw);
        if (data && data.cameras) {
          for (const [entityId, entry] of Object.entries(data.cameras)) {
            const existing = this.cameraInfos.get(entityId) || {
              entityId,
              name: entityId,
              hasPtz: true,
              ptzType: "digital",
              maxPresets: MAX_PTZ_PRESETS,
              currentPreset: entry.currentPreset || 1,
              currentZoneId: entry.currentZoneId || 1,
              zones: entry.zones || getDefaultPtzZones(),
              supportsHardwarePtz: false,
              supportsDigitalPtz: true,
            };
            existing.zones = entry.zones || existing.zones;
            existing.currentZoneId = entry.currentZoneId || existing.currentZoneId;
            existing.currentPreset = entry.currentPreset || existing.currentPreset;
            this.cameraInfos.set(entityId, existing);
          }
        }
      }
    } catch (err) {
      // Clean fallback if file is empty or corrupted
    }
  }

  public async saveToDisk(): Promise<void> {
    try {
      const storeData: PtzStoreData = {
        version: 1,
        cameras: {},
      };

      for (const [entityId, info] of this.cameraInfos.entries()) {
        storeData.cameras[entityId] = {
          zones: info.zones,
          currentZoneId: info.currentZoneId,
          currentPreset: info.currentPreset,
        };
      }

      const dir = path.dirname(this.storePath);
      if (!fsSync.existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(
        this.storePath,
        JSON.stringify(storeData, null, 2),
        "utf-8",
      );
    } catch (err) {
      // Error logging handled by caller
    }
  }

  /**
   * Registers or updates a camera's PTZ capabilities.
   */
  public registerCamera(
    entityId: string,
    state?: any,
    streamSource?: any,
    scryptedDevice?: any,
  ): CameraPtzInfo {
    const detected = detectCameraPtzCapabilities(
      entityId,
      state,
      streamSource,
      scryptedDevice,
    );

    const existing = this.cameraInfos.get(entityId);
    if (existing) {
      existing.name = detected.name;
      existing.hasPtz = detected.hasPtz;
      existing.ptzType = detected.ptzType;
      existing.supportsHardwarePtz = detected.supportsHardwarePtz;
      existing.supportsDigitalPtz = detected.supportsDigitalPtz;
      return existing;
    }

    this.cameraInfos.set(entityId, detected);
    void this.saveToDisk();
    return detected;
  }

  public getCameraPtzInfo(entityId: string): CameraPtzInfo | undefined {
    return this.cameraInfos.get(entityId);
  }

  public getAllPtzCameras(): CameraPtzInfo[] {
    return Array.from(this.cameraInfos.values());
  }

  public getZones(entityId: string): PtzZone[] {
    const info = this.cameraInfos.get(entityId);
    return info ? info.zones : [];
  }

  public async saveZone(
    entityId: string,
    zone: Partial<PtzZone> & { id: number },
  ): Promise<PtzZone> {
    let info = this.cameraInfos.get(entityId);
    if (!info) {
      info = this.registerCamera(entityId);
    }

    if (zone.id < 1 || zone.id > MAX_PTZ_PRESETS) {
      throw new Error(`El ID de zona debe estar entre 1 y ${MAX_PTZ_PRESETS}`);
    }

    const existingIndex = info.zones.findIndex((z) => z.id === zone.id);
    const sanitizedViewport: PtzViewport = {
      x: Math.max(0, Math.min(1, zone.viewport?.x ?? 0)),
      y: Math.max(0, Math.min(1, zone.viewport?.y ?? 0)),
      width: Math.max(0.1, Math.min(1, zone.viewport?.width ?? 1)),
      height: Math.max(0.1, Math.min(1, zone.viewport?.height ?? 1)),
    };

    const updatedZone: PtzZone = {
      id: zone.id,
      name: zone.name?.trim() || `Zona ${zone.id}`,
      enabled: zone.enabled !== undefined ? zone.enabled : true,
      viewport: sanitizedViewport,
    };

    if (existingIndex >= 0) {
      info.zones[existingIndex] = updatedZone;
    } else {
      if (info.zones.length >= MAX_PTZ_PRESETS) {
        throw new Error(`Máximo de ${MAX_PTZ_PRESETS} zonas alcanzado`);
      }
      info.zones.push(updatedZone);
      info.zones.sort((a, b) => a.id - b.id);
    }

    await this.saveToDisk();
    this.emit("zoneUpdated", { entityId, zone: updatedZone, info });
    return updatedZone;
  }

  public async deleteZone(entityId: string, zoneId: number): Promise<boolean> {
    const info = this.cameraInfos.get(entityId);
    if (!info) return false;

    const initialLength = info.zones.length;
    info.zones = info.zones.filter((z) => z.id !== zoneId);
    if (info.zones.length !== initialLength) {
      await this.saveToDisk();
      this.emit("zoneDeleted", { entityId, zoneId, info });
      return true;
    }
    return false;
  }

  /**
   * Activates a surveillance zone by ID (1..5).
   * Maps to preset movement and DPTZ viewport positioning.
   */
  public async setActiveZone(
    entityId: string,
    zoneId: number,
  ): Promise<{ success: boolean; zone?: PtzZone; info?: CameraPtzInfo }> {
    const info = this.cameraInfos.get(entityId);
    if (!info) return { success: false };

    const zone = info.zones.find((z) => z.id === zoneId);
    if (!zone) return { success: false };

    info.currentZoneId = zoneId;
    info.currentPreset = zoneId;

    await this.saveToDisk();
    this.emit("zoneActivated", { entityId, zone, info });
    return { success: true, zone, info };
  }

  /**
   * Relative Move (Arrow controls: Up, Down, Left, Right, Zoom In, Zoom Out)
   */
  public async moveDirection(
    entityId: string,
    direction: "up" | "down" | "left" | "right" | "zoom_in" | "zoom_out" | "center",
    step = 0.1,
  ): Promise<CameraPtzInfo | undefined> {
    const info = this.cameraInfos.get(entityId);
    if (!info) return undefined;

    const currentZone =
      info.zones.find((z) => z.id === info.currentZoneId) || info.zones[0];
    const vp = currentZone.viewport || { x: 0, y: 0, width: 1, height: 1 };

    let newX = vp.x;
    let newY = vp.y;
    let newW = vp.width;
    let newH = vp.height;

    switch (direction) {
      case "up":
        newY = Math.max(0, vp.y - step);
        break;
      case "down":
        newY = Math.min(1 - vp.height, vp.y + step);
        break;
      case "left":
        newX = Math.max(0, vp.x - step);
        break;
      case "right":
        newX = Math.min(1 - vp.width, vp.x + step);
        break;
      case "zoom_in":
        newW = Math.max(0.2, vp.width - step);
        newH = Math.max(0.2, vp.height - step);
        break;
      case "zoom_out":
        newW = Math.min(1, vp.width + step);
        newH = Math.min(1, vp.height + step);
        if (newX + newW > 1) newX = 1 - newW;
        if (newY + newH > 1) newY = 1 - newH;
        break;
      case "center":
        newX = 0;
        newY = 0;
        newW = 1;
        newH = 1;
        break;
    }

    currentZone.viewport = {
      x: Math.round(newX * 100) / 100,
      y: Math.round(newY * 100) / 100,
      width: Math.round(newW * 100) / 100,
      height: Math.round(newH * 100) / 100,
    };

    await this.saveToDisk();
    this.emit("cameraMoved", { entityId, direction, viewport: currentZone.viewport, info });
    return info;
  }
}
