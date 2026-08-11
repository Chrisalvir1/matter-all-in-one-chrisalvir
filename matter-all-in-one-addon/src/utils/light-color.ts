import type { HassState } from './ha-state.js';

const UINT8_MAX = 254;
const UINT16_SCALE = 65_536;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeHueDegrees(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function matterHueToDegrees(hue: number): number {
  return normalizeHueDegrees((clamp(hue, 0, UINT8_MAX) * 360) / UINT8_MAX);
}

export function degreesToMatterHue(hue: number): number {
  return Math.min(UINT8_MAX, Math.round((normalizeHueDegrees(hue) * UINT8_MAX) / 360));
}

export function enhancedMatterHueToDegrees(hue: number): number {
  return normalizeHueDegrees((clamp(hue, 0, 65_535) * 360) / UINT16_SCALE);
}

export function degreesToEnhancedMatterHue(hue: number): number {
  return Math.min(65_535, Math.round((normalizeHueDegrees(hue) * UINT16_SCALE) / 360));
}

export function matterSaturationToPercent(saturation: number): number {
  return clamp((clamp(saturation, 0, UINT8_MAX) * 100) / UINT8_MAX, 0, 100);
}

export function percentToMatterSaturation(saturation: number): number {
  return Math.round((clamp(saturation, 0, 100) * UINT8_MAX) / 100);
}

export function matterXyToHa(colorX: number, colorY: number): [number, number] {
  const x = clamp(colorX, 0, 65_535) / UINT16_SCALE;
  const y = clamp(colorY, 0, 65_535) / UINT16_SCALE;
  return sanitizeXy([x, y]);
}

export function haXyToMatter(xy: readonly number[]): [number, number] {
  const [x, y] = sanitizeXy(xy);
  return [Math.min(65_535, Math.round(x * UINT16_SCALE)), Math.min(65_535, Math.round(y * UINT16_SCALE))];
}

export function sanitizeXy(xy: readonly number[]): [number, number] {
  let x = clamp(Number(xy[0]), 0, 0.999_984_741_210_937_5);
  let y = clamp(Number(xy[1]), 0.000_001, 0.999_984_741_210_937_5);
  const sum = x + y;
  if (sum > 1) {
    x /= sum;
    y /= sum;
  }
  return [x, y];
}

function gammaEncode(value: number): number {
  return value <= 0.003_130_8 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function xyToRgb(x: number, y: number, brightness = 255): [number, number, number] {
  [x, y] = sanitizeXy([x, y]);
  const luminance = clamp(brightness, 1, 255) / 255;
  const X = (luminance / y) * x;
  const Z = (luminance / y) * (1 - x - y);
  let red = 3.2406 * X - 1.5372 * luminance - 0.4986 * Z;
  let green = -0.9689 * X + 1.8758 * luminance + 0.0415 * Z;
  let blue = 0.0557 * X - 0.204 * luminance + 1.057 * Z;
  red = Math.max(0, gammaEncode(red));
  green = Math.max(0, gammaEncode(green));
  blue = Math.max(0, gammaEncode(blue));
  const peak = Math.max(red, green, blue, 1);
  return [red, green, blue].map((channel) => Math.round(clamp((channel / peak) * 255, 0, 255))) as [number, number, number];
}

export function rgbToHs(rgb: readonly number[]): [number, number] {
  const [red, green, blue] = rgb.map((value) => clamp(Number(value), 0, 255) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return [0, 0];
  let hue: number;
  if (max === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (max === green) hue = 60 * ((blue - red) / delta + 2);
  else hue = 60 * ((red - green) / delta + 4);
  return [normalizeHueDegrees(hue), (delta / max) * 100];
}

export function getHsColor(state: HassState): [number, number] | undefined {
  const attributes = state.attributes as any;
  if (Array.isArray(attributes.hs_color) && attributes.hs_color.length >= 2) {
    return [normalizeHueDegrees(Number(attributes.hs_color[0])), clamp(Number(attributes.hs_color[1]), 0, 100)];
  }
  if (Array.isArray(attributes.rgb_color) && attributes.rgb_color.length >= 3) return rgbToHs(attributes.rgb_color);
  return undefined;
}

export function colorPayloadForHomeAssistant(state: HassState, colorX: number, colorY: number): Record<string, number[]> {
  const xy = matterXyToHa(colorX, colorY);
  const modes: string[] = (state.attributes as any).supported_color_modes ?? [];
  if (modes.includes('xy')) return { xy_color: xy };
  const rgb = xyToRgb(xy[0], xy[1], Number((state.attributes as any).brightness ?? 255));
  if (modes.includes('hs')) return { hs_color: rgbToHs(rgb) };
  if (modes.some((mode) => ['rgb', 'rgbw', 'rgbww'].includes(mode))) return { rgb_color: rgb };
  return { xy_color: xy };
}
