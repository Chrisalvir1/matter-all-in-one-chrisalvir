import { expect, it } from "vitest";
import {
  deviceNeedsAttention,
  entityIssue,
} from "../src/frontend/src/utils/accessory-issues.js";

it("keeps offline devices visible and excludes camera history from active issues", () => {
  const bodega = {
    entityId: "light.bodega",
    name: "Bodega",
    domain: "light",
    exported: true,
    state: "unavailable",
  };
  const camera = {
    entityId: "camera.michi",
    name: "Comedero Michi",
    domain: "camera",
    commissioned: true,
    state: "idle",
    logs: [
      { timestamp: "previous", level: "info", message: "Live View started" },
    ],
  };
  const devices = [bodega, camera].map((entity) => ({
    id: entity.entityId,
    name: entity.name,
    area: "",
    manufacturer: "",
    model: "",
    entities: [entity],
  }));
  expect(
    devices.filter(deviceNeedsAttention).map((device) => device.name),
  ).toEqual(["Bodega"]);
  expect(entityIssue({ ...camera, hasIssue: true })).toBe(
    "Comedero Michi: incidencia activa",
  );
});
