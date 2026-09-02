import { describe, expect, it } from "vitest";
import {
  resolveDisplayManufacturer,
  resolveDisplayModel,
} from "../src/camera/scrypted/scrypted-storage.js";

describe("resolveDisplayManufacturer", () => {
  it("uses identityOverride.manufacturer when set", () => {
    expect(
      resolveDisplayManufacturer({
        identityOverride: {
          manufacturer: "Reolink",
          manufacturerSource: "manual",
          modelSource: "unknown",
        },
        sourceManufacturer: "Unknown",
      }),
    ).toBe("Reolink");
  });

  it("falls back to sourceManufacturer when no override", () => {
    expect(resolveDisplayManufacturer({ sourceManufacturer: "Tapo" })).toBe(
      "Tapo",
    );
  });

  it("returns 'Marca no identificada' when no data", () => {
    expect(resolveDisplayManufacturer({})).toBe("Marca no identificada");
  });

  it("normalizes 'Unknown' to 'Marca no identificada'", () => {
    expect(resolveDisplayManufacturer({ sourceManufacturer: "Unknown" })).toBe(
      "Marca no identificada",
    );
  });

  it("normalizes 'N/A' to 'Marca no identificada'", () => {
    expect(resolveDisplayManufacturer({ sourceManufacturer: "N/A" })).toBe(
      "Marca no identificada",
    );
  });

  it("normalizes 'Cámara IP' to 'Marca no identificada'", () => {
    expect(
      resolveDisplayManufacturer({ sourceManufacturer: "Cámara IP" }),
    ).toBe("Marca no identificada");
  });

  it("override empty string falls back to source", () => {
    expect(
      resolveDisplayManufacturer({
        identityOverride: {
          manufacturer: "",
          manufacturerSource: "manual",
          modelSource: "unknown",
        },
        sourceManufacturer: "Aqara",
      }),
    ).toBe("Aqara");
  });
});

describe("resolveDisplayModel", () => {
  it("uses identityOverride.model when set", () => {
    expect(
      resolveDisplayModel({
        identityOverride: {
          model: "C125",
          manufacturerSource: "scrypted",
          modelSource: "manual",
        },
        sourceModel: "C120",
      }),
    ).toBe("C125");
  });

  it("falls back to sourceModel when no override", () => {
    expect(resolveDisplayModel({ sourceModel: "G3" })).toBe("G3");
  });

  it("returns undefined when no model data", () => {
    expect(resolveDisplayModel({})).toBeUndefined();
  });

  it("allows brand with no model (displayModel undefined)", () => {
    expect(
      resolveDisplayModel({
        identityOverride: {
          manufacturer: "Ring",
          manufacturerSource: "manual",
          modelSource: "unknown",
        },
      }),
    ).toBeUndefined();
  });
});
