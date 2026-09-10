import { HassState } from "./ha-state.js";

export interface ColorConversionConfig {
  hasColorControl: boolean;
  supportedModes: string[];
}

export const lightColor = {
  /** Normalize hue to 0..360, treating 360 as 0. */
  normalizeHue(hue: number): number {
    const h = hue % 360;
    return h < 0 ? h + 360 : h;
  },

  /** Matter Hue (0..254) to HA Hue (0..360) */
  matterHueToHa(matterHue: number): number {
    return this.normalizeHue((matterHue / 254) * 360);
  },

  /** HA Hue (0..360) to Matter Hue (0..254) */
  haHueToMatter(haHue: number): number {
    return Math.max(
      0,
      Math.min(254, Math.round((this.normalizeHue(haHue) / 360) * 254)),
    );
  },

  /** Matter Enhanced Hue (0..65535) to HA Hue (0..360) */
  matterEnhancedHueToHa(enhancedHue: number): number {
    return this.normalizeHue((enhancedHue / 65536) * 360);
  },

  /** HA Hue (0..360) to Matter Enhanced Hue (0..65535) */
  haHueToMatterEnhanced(haHue: number): number {
    // 65536 scale, wrapping to 0..65535
    const val = Math.round((this.normalizeHue(haHue) / 360) * 65536);
    return val === 65536 ? 0 : val;
  },

  /** Matter Saturation (0..254) to HA Saturation (0..100) */
  matterSatToHa(matterSat: number): number {
    return Math.max(0, Math.min(100, Math.round((matterSat / 254) * 100)));
  },

  /** HA Saturation (0..100) to Matter Saturation (0..254) */
  haSatToMatter(haSat: number): number {
    return Math.max(0, Math.min(254, Math.round((haSat / 100) * 254)));
  },

  /** Matter XY (scaled by 65536) to HA XY (0..1) */
  matterXyToHa(matterX: number, matterY: number): [number, number] {
    return [
      Math.max(0, Math.min(1, matterX / 65536)),
      Math.max(0, Math.min(1, matterY / 65536)),
    ];
  },

  /** HA XY (0..1) to Matter XY (scaled by 65536) */
  haXyToMatter(haX: number, haY: number): [number, number] {
    return [
      Math.max(0, Math.min(65279, Math.round(haX * 65536))),
      Math.max(0, Math.min(65279, Math.round(haY * 65536))),
    ];
  },

  /** Mireds to Kelvin */
  miredsToKelvin(mireds: number): number {
    if (!mireds || mireds <= 0) return 6500;
    return Math.round(1_000_000 / mireds);
  },

  /** Kelvin to Mireds */
  kelvinToMireds(kelvin: number): number {
    if (!kelvin || kelvin <= 0) return 153; // default cold (6500K)
    return Math.round(1_000_000 / kelvin);
  },

  /**
   * Convert HA Kelvin min/max to Matter Mireds min/max.
   *
   * Inversion Rule:
   * - HA max_color_temp_kelvin (coldest, e.g. 6500 K) -> Matter min mireds (~154)
   * - HA min_color_temp_kelvin (warmest, e.g. 2700 K) -> Matter max mireds (~370)
   */
  getMiredsRange(attributes: Record<string, any> = {}): {
    minMireds: number;
    maxMireds: number;
  } {
    let minKelvin = attributes.min_color_temp_kelvin;
    let maxKelvin = attributes.max_color_temp_kelvin;

    // Fallback to legacy mireds attributes if Kelvin limits not present
    if (minKelvin === undefined && attributes.max_mireds !== undefined) {
      minKelvin = this.miredsToKelvin(attributes.max_mireds);
    }
    if (maxKelvin === undefined && attributes.min_mireds !== undefined) {
      maxKelvin = this.miredsToKelvin(attributes.min_mireds);
    }

    const minM = maxKelvin
      ? Math.max(1, Math.round(1_000_000 / maxKelvin))
      : (attributes.min_mireds ?? 153);
    const maxM = minKelvin
      ? Math.max(minM, Math.round(1_000_000 / minKelvin))
      : (attributes.max_mireds ?? 500);

    return {
      minMireds: Math.min(minM, maxM),
      maxMireds: Math.max(minM, maxM),
    };
  },

  /**
   * Clamp requested mireds to valid range based on HA attributes and endpoint limits.
   */
  clampMireds(
    mireds: number,
    attributes: Record<string, any> = {},
    endpointLimits?: { minMireds?: number; maxMireds?: number },
  ): number {
    const { minMireds: haMin, maxMireds: haMax } =
      this.getMiredsRange(attributes);
    const minM =
      endpointLimits?.minMireds !== undefined
        ? Math.max(endpointLimits.minMireds, haMin)
        : haMin;
    const maxM =
      endpointLimits?.maxMireds !== undefined
        ? Math.min(endpointLimits.maxMireds, haMax)
        : haMax;
    return Math.max(minM, Math.min(maxM, mireds));
  },

  /**
   * Clamp requested Kelvin to valid range based on HA attributes.
   */
  clampKelvin(kelvin: number, attributes: Record<string, any> = {}): number {
    let minKelvin = attributes.min_color_temp_kelvin;
    let maxKelvin = attributes.max_color_temp_kelvin;
    if (minKelvin === undefined && attributes.max_mireds !== undefined) {
      minKelvin = this.miredsToKelvin(attributes.max_mireds);
    }
    if (maxKelvin === undefined && attributes.min_mireds !== undefined) {
      maxKelvin = this.miredsToKelvin(attributes.min_mireds);
    }

    let clamped = kelvin;
    if (minKelvin !== undefined) clamped = Math.max(minKelvin, clamped);
    if (maxKelvin !== undefined) clamped = Math.min(maxKelvin, clamped);
    return clamped;
  },

  /** Extract HA HS color from RGB or HS state */
  getHsColor(state: HassState): [number, number] | undefined {
    const attrs = state.attributes as any;
    if (Array.isArray(attrs.hs_color) && attrs.hs_color.length >= 2) {
      return [attrs.hs_color[0], attrs.hs_color[1]];
    }
    if (!Array.isArray(attrs.rgb_color) || attrs.rgb_color.length < 3)
      return undefined;

    return this.rgbToHs(
      attrs.rgb_color[0],
      attrs.rgb_color[1],
      attrs.rgb_color[2],
    );
  },

  /** Convert RGB to HS */
  rgbToHs(r: number, g: number, b: number): [number, number] {
    const red = Math.max(0, Math.min(255, r)) / 255;
    const green = Math.max(0, Math.min(255, g)) / 255;
    const blue = Math.max(0, Math.min(255, b)) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    if (delta === 0) return [0, 0];

    let hue = 0;
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);

    return [this.normalizeHue(hue), Math.round((delta / max) * 100)];
  },

  /** Convert XY to HS using sRGB / D65 approximation */
  xyToHs(x: number, y: number): [number, number] {
    // Prevent division by zero
    if (y === 0) return [0, 0];

    const z = 1.0 - x - y;
    const Y = 1.0; // Assume max brightness
    const X = (Y / y) * x;
    const Z = (Y / y) * z;

    // Convert XYZ to RGB (sRGB D65)
    let r = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
    let g = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
    let b = X * 0.0557 - Y * 0.204 + Z * 1.057;

    // Apply gamma correction
    r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1.0 / 2.4) - 0.055;
    g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1.0 / 2.4) - 0.055;
    b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1.0 / 2.4) - 0.055;

    // Clamp and convert to 0-255
    r = Math.max(0, Math.min(255, Math.round(r * 255)));
    g = Math.max(0, Math.min(255, Math.round(g * 255)));
    b = Math.max(0, Math.min(255, Math.round(b * 255)));

    return this.rgbToHs(r, g, b);
  },

  /** Select best HA payload based on supported modes */
  buildColorPayload(
    supportedModes: string[],
    haMode: string | undefined,
    colorReq: {
      hs?: [number, number];
      xy?: [number, number];
      mireds?: number;
    },
  ): Record<string, any> {
    const modes = supportedModes || [];
    const payload: Record<string, any> = {};

    if (colorReq.mireds !== undefined) {
      // If a temperature was requested, it takes precedence if supported
      if (modes.includes("color_temp")) {
        payload.color_temp = colorReq.mireds;
        return payload;
      }
    }

    if (colorReq.xy) {
      if (modes.includes("xy")) {
        payload.xy_color = colorReq.xy;
        return payload;
      }
      if (
        modes.includes("hs") ||
        modes.includes("rgb") ||
        modes.includes("rgbw") ||
        modes.includes("rgbww")
      ) {
        const hs = this.xyToHs(colorReq.xy[0], colorReq.xy[1]);
        payload.hs_color = hs;
        return payload;
      }
    }

    if (colorReq.hs) {
      if (
        modes.includes("hs") ||
        modes.includes("rgb") ||
        modes.includes("rgbw") ||
        modes.includes("rgbww")
      ) {
        payload.hs_color = colorReq.hs;
        return payload;
      }
      // If only XY is supported
      if (modes.includes("xy")) {
        payload.hs_color = colorReq.hs;
        return payload;
      }
    }

    return payload;
  },
};
