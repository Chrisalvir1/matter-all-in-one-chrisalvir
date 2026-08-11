import { describe, it, expect } from 'vitest';
import { lightConverter } from '../../src/converters/light.converter.js';
import { colorPayloadForHomeAssistant, degreesToMatterHue, enhancedMatterHueToDegrees, haXyToMatter, matterHueToDegrees, matterXyToHa } from '../../src/utils/light-color.js';

describe('lightConverter', () => {
  it('converts state and brightness bidirectionally', () => {
    expect(lightConverter.toOnOff({ state: 'on', attributes: {} } as any)).toBe(true);
    expect(lightConverter.toOnOff({ state: 'off', attributes: {} } as any)).toBe(false);
    expect(lightConverter.toLevel({ state: 'on', attributes: { brightness: 127 } } as any)).toBe(127);
    expect(lightConverter.toHaBrightness(126)).toBe(126);
  });

  it('round-trips every Matter hue without a sector shift', () => {
    for (let hue = 0; hue <= 254; hue++) expect(degreesToMatterHue(matterHueToDegrees(hue))).toBe(hue);
  });

  it('uses the Matter 1/65536 XY scale and round-trips coordinates', () => {
    const xy = matterXyToHa(32768, 16384);
    expect(xy).toEqual([0.5, 0.25]);
    expect(haXyToMatter(xy)).toEqual([32768, 16384]);
  });

  it('routes HomeKit XY commands through a light native color mode', () => {
    const hsState = { state: 'on', attributes: { supported_color_modes: ['hs'], brightness: 255 } } as any;
    const xyState = { state: 'on', attributes: { supported_color_modes: ['xy'] } } as any;
    expect(colorPayloadForHomeAssistant(xyState, 32768, 16384)).toEqual({ xy_color: [0.5, 0.25] });
    const hs = colorPayloadForHomeAssistant(hsState, 32768, 16384).hs_color;
    expect(hs).toHaveLength(2);
    expect(hs[0]).toBeGreaterThanOrEqual(0);
    expect(hs[0]).toBeLessThan(360);
  });

  it('supports enhanced 16-bit hue commands forwarded by Matterbridge 3.10.4', () => {
    expect(enhancedMatterHueToDegrees(0)).toBe(0);
    expect(enhancedMatterHueToDegrees(32768)).toBe(180);
  });
});
