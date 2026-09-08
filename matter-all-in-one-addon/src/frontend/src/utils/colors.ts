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

export function extractLightColor(attributes: Record<string, any> = {}): [number, number, number] {
  if (Array.isArray(attributes.rgb_color) && attributes.rgb_color.length >= 3) {
    return [
      Math.round(attributes.rgb_color[0]),
      Math.round(attributes.rgb_color[1]),
      Math.round(attributes.rgb_color[2]),
    ];
  }
  if (typeof attributes.color_temp_kelvin === "number" && attributes.color_temp_kelvin > 0) {
    return kelvinToRgb(attributes.color_temp_kelvin);
  }
  if (typeof attributes.color_temp === "number" && attributes.color_temp > 0) {
    const k = Math.round(1000000 / attributes.color_temp);
    return kelvinToRgb(k);
  }
  return [255, 209, 89]; // Warm 2700K incandescent default
}

export function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
    .join("")}`;
}
