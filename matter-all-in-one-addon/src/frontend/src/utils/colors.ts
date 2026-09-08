export function kelvinToRgb(kelvin: number): [number, number, number] {
  const temp = Math.max(1000, Math.min(40000, kelvin || 2700)) / 100;
  let red: number;
  let green: number;
  let blue: number;

  if (temp <= 66) {
    red = 255;
    green = Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661));
    blue = temp <= 19 ? 0 : Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
  } else {
    red = Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
    green = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
    blue = 255;
  }
  return [Math.round(red), Math.round(green), Math.round(blue)];
}

export function miredsToKelvin(mireds: number): number {
  if (!mireds || mireds <= 0) return 2700;
  return Math.round(1000000 / mireds);
}

export function kelvinToMireds(kelvin: number): number {
  if (!kelvin || kelvin <= 0) return 370;
  return Math.round(1000000 / kelvin);
}

export function hsToRgb(h: number, s: number, v = 100): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const val = Math.max(0, Math.min(100, v)) / 100;
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hue < 60) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (hue < 120) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (hue < 180) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (hue < 240) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (hue < 300) {
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
}

export function xyToRgb(x: number, y: number): [number, number, number] {
  if (y === 0) return [255, 255, 255];
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
}

export function getKelvinDescription(kelvin: number): string {
  if (kelvin < 2400) return "Cálido Muy Suave";
  if (kelvin < 3200) return "Blanco Cálido";
  if (kelvin < 4500) return "Blanco Neutro";
  if (kelvin < 6000) return "Luz Natural / Día";
  return "Blanco Frío";
}

export interface LightColorInfo {
  rgb: [number, number, number];
  hex: string;
  kelvin?: number;
  mireds?: number;
  isColorMode: boolean;
  colorMode?: string;
  label: string;
}

export function extractLightColorInfo(attributes: Record<string, any> = {}): LightColorInfo {
  const colorMode = attributes.color_mode;
  let kelvin: number | undefined;
  let mireds: number | undefined;

  if (typeof attributes.color_temp_kelvin === "number" && attributes.color_temp_kelvin > 0) {
    kelvin = Math.round(attributes.color_temp_kelvin);
    mireds = Math.round(1000000 / kelvin);
  } else if (typeof attributes.color_temp === "number" && attributes.color_temp > 0) {
    mireds = Math.round(attributes.color_temp);
    kelvin = Math.round(1000000 / mireds);
  }

  // If color_temp mode or no RGB/HS/XY attributes are present but Kelvin is
  const isColorTempMode =
    colorMode === "color_temp" ||
    (!attributes.rgb_color &&
      !attributes.hs_color &&
      !attributes.xy_color &&
      !attributes.rgbw_color &&
      !attributes.rgbww_color &&
      kelvin !== undefined);

  if (isColorTempMode && kelvin !== undefined) {
    const rgb = kelvinToRgb(kelvin);
    const hex = rgbToHex(rgb);
    const desc = getKelvinDescription(kelvin);
    return {
      rgb,
      hex,
      kelvin,
      mireds,
      isColorMode: false,
      colorMode: colorMode || "color_temp",
      label: `${kelvin}K · ${desc}`,
    };
  }

  // Check RGB
  if (Array.isArray(attributes.rgb_color) && attributes.rgb_color.length >= 3) {
    const rgb: [number, number, number] = [
      Math.round(attributes.rgb_color[0]),
      Math.round(attributes.rgb_color[1]),
      Math.round(attributes.rgb_color[2]),
    ];
    const hex = rgbToHex(rgb);
    return {
      rgb,
      hex,
      kelvin,
      mireds,
      isColorMode: true,
      colorMode: colorMode || "rgb",
      label: `Color (${hex})`,
    };
  }

  // Check RGBW / RGBWW
  const rgbMulti = attributes.rgbw_color ?? attributes.rgbww_color;
  if (Array.isArray(rgbMulti) && rgbMulti.length >= 3) {
    const rgb: [number, number, number] = [
      Math.round(rgbMulti[0]),
      Math.round(rgbMulti[1]),
      Math.round(rgbMulti[2]),
    ];
    const hex = rgbToHex(rgb);
    return {
      rgb,
      hex,
      kelvin,
      mireds,
      isColorMode: true,
      colorMode: colorMode || (attributes.rgbw_color ? "rgbw" : "rgbww"),
      label: `Color (${hex})`,
    };
  }

  // Check HS
  if (Array.isArray(attributes.hs_color) && attributes.hs_color.length >= 2) {
    const rgb = hsToRgb(attributes.hs_color[0], attributes.hs_color[1]);
    const hex = rgbToHex(rgb);
    return {
      rgb,
      hex,
      kelvin,
      mireds,
      isColorMode: true,
      colorMode: colorMode || "hs",
      label: `Color (${hex})`,
    };
  }

  // Check XY
  if (Array.isArray(attributes.xy_color) && attributes.xy_color.length >= 2) {
    const rgb = xyToRgb(attributes.xy_color[0], attributes.xy_color[1]);
    const hex = rgbToHex(rgb);
    return {
      rgb,
      hex,
      kelvin,
      mireds,
      isColorMode: true,
      colorMode: colorMode || "xy",
      label: `Color (${hex})`,
    };
  }

  // Fallback to Kelvin if present
  if (kelvin !== undefined) {
    const rgb = kelvinToRgb(kelvin);
    const hex = rgbToHex(rgb);
    const desc = getKelvinDescription(kelvin);
    return {
      rgb,
      hex,
      kelvin,
      mireds,
      isColorMode: false,
      colorMode: colorMode || "color_temp",
      label: `${kelvin}K · ${desc}`,
    };
  }

  // Default warm white
  const defaultRgb: [number, number, number] = [255, 209, 89];
  return {
    rgb: defaultRgb,
    hex: rgbToHex(defaultRgb),
    kelvin: 2700,
    mireds: 370,
    isColorMode: false,
    colorMode: colorMode || "brightness",
    label: "2700K · Blanco Cálido",
  };
}

export function extractLightColor(attributes: Record<string, any> = {}): [number, number, number] {
  return extractLightColorInfo(attributes).rgb;
}

export function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
    .join("")}`;
}
