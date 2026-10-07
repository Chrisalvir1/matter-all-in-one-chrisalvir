import { describe, expect, it } from "vitest";
import { isUnavailable } from "../src/utils/ha-state.js";

const state = (value: string, attributes: Record<string, unknown> = {}) =>
  ({ state: value, attributes }) as any;

describe("isUnavailable", () => {
  it.each(["unavailable", "unknown", "offline", "none", "disconnected", ""])(
    "recognizes HA state %j as unavailable",
    (value) => {
      expect(isUnavailable(state(value))).toBe(true);
      expect(isUnavailable(state(value.toUpperCase()))).toBe(true);
    },
  );

  it("recognizes missing state objects and false online flags", () => {
    expect(isUnavailable(null)).toBe(true);
    expect(isUnavailable(undefined)).toBe(true);
    for (const attribute of ["available", "online", "connected", "is_online"]) {
      expect(isUnavailable(state("on", { [attribute]: false }))).toBe(true);
    }
    expect(isUnavailable(state("on", { is_online: true }))).toBe(false);
  });
});
