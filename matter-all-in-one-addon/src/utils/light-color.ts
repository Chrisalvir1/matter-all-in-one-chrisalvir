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

  /** Convert RGB (0..255) to HS (H in 0..360, S in 0..100) */
  rgbToHs(r: number, g: number, b: number): [number, number] {
    const rNorm = Math.max(0, Math.min(255, r)) / 255;
    const gNorm = Math.max(0, Math.min(255, g)) / 255;
    const bNorm = Math.max(0, Math.min(255, b)) / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === rNorm) {
        h = ((gNorm - bNorm) / delta) % 6;
      } else if (max === gNorm) {
        h = (bNorm - rNorm) / delta + 2;
      } else {
        h = (rNorm - gNorm) / delta + 4;
      }
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : Math.round((delta / max) * 100);
    return [this.normalizeHue(h), Math.max(0, Math.min(100, s))];
  },

  /** Convert CIE 1931 XY to HS (H in 0..360, S in 0..100) */
  xyToHs(x: number, y: number): [number, number] {
    const rgb = this.xyToRgb(x, y);
    return this.rgbToHs(rgb[0], rgb[1], rgb[2]);
  },

  /** Convert HS (H in 0..360, S in 0..100) to RGB (0..255) */
  hsToRgb(h: number, s: number): [number, number, number] {
    const normH = this.normalizeHue(h);
    const normS = Math.max(0, Math.min(100, s)) / 100;
    const v = 1;
    const c = v * normS;
    const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
    const m = v - c;

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (normH < 60) {
      r1 = c;
      g1 = x;
      b1 = 0;
    } else if (normH < 120) {
      r1 = x;
      g1 = c;
      b1 = 0;
    } else if (normH < 180) {
      r1 = 0;
      g1 = c;
      b1 = x;
    } else if (normH < 240) {
      r1 = 0;
      g1 = x;
      b1 = c;
    } else if (normH < 300) {
      r1 = x;
      g1 = 0;
      b1 = c;
    } else {
      r1 = c;
      g1 = 0;
      b1 = x;
    }

    return [
      Math.round((r1 + m) * 255),
      Math.round((g1 + m) * 255),
      Math.round((b1 + m) * 255),
    ];
  },

  /** Convert Kelvin color temperature (1000..40000K) to RGB using Tanner Helland algorithm */
  kelvinToRgb(kelvin: number): [number, number, number] {
    const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;
    let red = 0;
    let green = 0;
    let blue = 0;

    if (temp <= 66) {
      red = 255;
    } else {
      red = temp - 60;
      red = 329.698727446 * Math.pow(red, -0.1332047592);
      red = Math.max(0, Math.min(255, red));
    }

    if (temp <= 66) {
      green = temp;
      green = 99.4708025861 * Math.log(green) - 161.1195681661;
      green = Math.max(0, Math.min(255, green));
    } else {
      green = temp - 60;
      green = 288.1221695283 * Math.pow(green, -0.0755148492);
      green = Math.max(0, Math.min(255, green));
    }

    if (temp >= 66) {
      blue = 255;
    } else if (temp <= 19) {
      blue = 0;
    } else {
      blue = temp - 10;
      blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
      blue = Math.max(0, Math.min(255, blue));
    }

    return [Math.round(red), Math.round(green), Math.round(blue)];
  },

  /** Convert RGB (0..255) to CIE 1931 XY coordinates (0..1) */
  rgbToXy(r: number, g: number, b: number): [number, number] {
    let red = r / 255;
    let green = g / 255;
    let blue = b / 255;
    red = red > 0.04045 ? Math.pow((red + 0.055) / 1.055, 2.4) : red / 12.92;
    green =
      green > 0.04045 ? Math.pow((green + 0.055) / 1.055, 2.4) : green / 12.92;
    blue = blue > 0.04045 ? Math.pow((blue + 0.055) / 1.055, 2.4) : blue / 12.92;
    const X = red * 0.4124 + green * 0.3576 + blue * 0.1805;
    const Y = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const Z = red * 0.0193 + green * 0.1192 + blue * 0.9505;
    const sum = X + Y + Z;
    if (sum === 0) return [0, 0];
    return [
      Number((X / sum).toFixed(4)),
      Number((Y / sum).toFixed(4)),
    ];
  },

  /** Convert XY coordinates (0..1) to RGB (0..255) */
  xyToRgb(x: number, y: number): [number, number, number] {
    if (y === 0) return [0, 0, 0];
    const z = 1.0 - x - y;
    const Y = 1.0;
    const X = (Y / y) * x;
    const Z = (Y / y) * z;
    let r = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
    let g = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
    let b = X * 0.0557 - Y * 0.204 + Z * 1.057;
    r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1.0 / 2.4) - 0.055;
    g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1.0 / 2.4) - 0.055;
    b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1.0 / 2.4) - 0.055;
    return [
      Math.max(0, Math.min(255, Math.round(r * 255))),
      Math.max(0, Math.min(255, Math.round(g * 255))),
      Math.max(0, Math.min(255, Math.round(b * 255))),
    ];
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
      if (
        modes.includes("color_temp") ||
        haMode === "color_temp" ||
        modes.length === 0
      ) {
        payload.color_temp = colorReq.mireds;
        payload.color_temp_kelvin = this.miredsToKelvin(colorReq.mireds);
        return payload;
      }
      // Light is RGB-only (e.g. Govee RGB strip): synthesize color from Kelvin
      const kelvin = this.miredsToKelvin(colorReq.mireds);
      const rgb = this.kelvinToRgb(kelvin);
      if (
        modes.includes("rgb") ||
        modes.includes("rgbw") ||
        modes.includes("rgbww")
      ) {
        payload.rgb_color = rgb;
        return payload;
      }
      if (modes.includes("hs")) {
        payload.hs_color = this.rgbToHs(rgb[0], rgb[1], rgb[2]);
        return payload;
      }
      if (modes.includes("xy")) {
        payload.xy_color = this.rgbToXy(rgb[0], rgb[1], rgb[2]);
        return payload;
      }
    }

    if (colorReq.xy) {
      if (modes.includes("xy")) {
        payload.xy_color = colorReq.xy;
        return payload;
      }
      if (
        modes.includes("rgb") ||
        modes.includes("rgbw") ||
        modes.includes("rgbww")
      ) {
        payload.rgb_color = this.xyToRgb(colorReq.xy[0], colorReq.xy[1]);
        return payload;
      }
      if (modes.includes("hs")) {
        payload.hs_color = this.xyToHs(colorReq.xy[0], colorReq.xy[1]);
        return payload;
      }
    }

    if (colorReq.hs) {
      if (modes.includes("hs")) {
        payload.hs_color = colorReq.hs;
        return payload;
      }
      if (
        modes.includes("rgb") ||
        modes.includes("rgbw") ||
        modes.includes("rgbww")
      ) {
        payload.rgb_color = this.hsToRgb(colorReq.hs[0], colorReq.hs[1]);
        return payload;
      }
      if (modes.includes("xy")) {
        const rgb = this.hsToRgb(colorReq.hs[0], colorReq.hs[1]);
        payload.xy_color = this.rgbToXy(rgb[0], rgb[1], rgb[2]);
        return payload;
      }
      // If none matched, fallback to hs_color
      payload.hs_color = colorReq.hs;
      return payload;
    }

    return payload;
  },
};
