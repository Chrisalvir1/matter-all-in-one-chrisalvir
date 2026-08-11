import fs from 'node:fs';

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    if (before.includes('HOMEKIT_COLOR_PIPELINE_3_10_4')) return;
    throw new Error(`Patch did not match ${path}`);
  }
  fs.writeFileSync(path, after);
}

patch('src/entities/base.entity.ts', (source) => {
  source = source.replace(
    "import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';",
    "import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';\nimport { MatterbridgeOnOffServer } from 'matterbridge/behaviors';",
  );
  source = source.replace(
    "import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID, MATTER_BRIDGE_VENDOR_NAME } from '../utils/matter-device-identity.js';",
    "import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID, MATTER_BRIDGE_VENDOR_NAME } from '../utils/matter-device-identity.js';\nimport { colorPayloadForHomeAssistant, degreesToEnhancedMatterHue, degreesToMatterHue, enhancedMatterHueToDegrees, getHsColor, haXyToMatter, matterHueToDegrees, matterSaturationToPercent, percentToMatterSaturation } from '../utils/light-color.js';\n// HOMEKIT_COLOR_PIPELINE_3_10_4",
  );
  source = source.replace(/  private getHsColor\(state: HassState\): \[number, number\] \| undefined \{[\s\S]*?\n  \}\n\n  protected getMatterSerialNumber/, "  private getHsColor(state: HassState): [number, number] | undefined {\n    return getHsColor(state);\n  }\n\n  protected getMatterSerialNumber");
  source = source.replace(
    "    const [domain] = this.entityId.split('.');\n\n    // Explicitly set metadata properties",
    "    const [domain] = this.entityId.split('.');\n    // 3.10.4 bakes Lighting into the bare server. Explicitly remove that\n    // feature from switches and other non-light endpoints.\n    const onOffBehavior = domain === 'light' ? MatterbridgeOnOffServer : MatterbridgeOnOffServer.with();\n    (this.endpoint as any).behaviors?.inject?.(onOffBehavior, { onOff: this.state.state === 'on' });\n\n    // Explicitly set metadata properties",
  );
  source = source.replace(
    "const hs: [number, number] = [Math.round((hue / 254) * 360), Math.round((saturation / 254) * 100)];",
    "const hs: [number, number] = [matterHueToDegrees(hue), matterSaturationToPercent(saturation)];",
  );
  source = source.replace(
    "const xy: [number, number] = [x / 65535, y / 65535];\n          this.lastCommands.set('xy_color', { value: xy, timestamp: Date.now() });\n          await this.platform.ha.callService('light', 'turn_on', this.entityId, { xy_color: xy });",
    "const payload = colorPayloadForHomeAssistant(this.state, x, y);\n          this.lastCommands.set(Object.keys(payload)[0], { value: Object.values(payload)[0], timestamp: Date.now() });\n          await this.platform.ha.callService('light', 'turn_on', this.entityId, payload);",
  );
  source = source.replace(
    "await updateColor(this.endpoint, ColorControl.id, 'currentHue', Math.round((hs[0] / 360) * 254), this.platform.log);\n            await updateColor(this.endpoint, ColorControl.id, 'currentSaturation', Math.round((hs[1] / 100) * 254), this.platform.log);",
    "await updateColor(this.endpoint, ColorControl.id, 'currentHue', degreesToMatterHue(hs[0]), this.platform.log);\n            await updateColor(this.endpoint, ColorControl.id, 'enhancedCurrentHue', degreesToEnhancedMatterHue(hs[0]), this.platform.log);\n            await updateColor(this.endpoint, ColorControl.id, 'currentSaturation', percentToMatterSaturation(hs[1]), this.platform.log);",
  );
  source = source.replace(
    "await updateColor(this.endpoint, ColorControl.id, 'currentX', Math.round(xy[0] * 65535), this.platform.log);\n            await updateColor(this.endpoint, ColorControl.id, 'currentY', Math.round(xy[1] * 65535), this.platform.log);",
    "const [matterX, matterY] = haXyToMatter(xy);\n            await updateColor(this.endpoint, ColorControl.id, 'currentX', matterX, this.platform.log);\n            await updateColor(this.endpoint, ColorControl.id, 'currentY', matterY, this.platform.log);",
  );
  const insertion = `
        const sendCurrentHs = async (hueDegrees: number, saturationPercent: number) =>
          sendHs(degreesToMatterHue(hueDegrees), percentToMatterSaturation(saturationPercent));
        const stepHs = async (hueDelta = 0, saturationDelta = 0) => {
          const [hue, saturation] = currentHs();
          await sendCurrentHs(hue + hueDelta, Math.min(100, Math.max(0, saturation + saturationDelta)));
        };
        this.endpoint.addCommandHandler('stepHue', async (data: any) => {
          const request = data?.request ?? data;
          await stepHs((request?.stepMode === 1 ? -1 : 1) * matterHueToDegrees(request?.stepSize ?? 0));
        });
        this.endpoint.addCommandHandler('moveHue', async (data: any) => {
          const request = data?.request ?? data;
          await stepHs((request?.moveMode === 1 ? -1 : 1) * matterHueToDegrees(request?.rate ?? 0));
        });
        this.endpoint.addCommandHandler('enhancedStepHue', async (data: any) => {
          const request = data?.request ?? data;
          await stepHs((request?.stepMode === 1 ? -1 : 1) * enhancedMatterHueToDegrees(request?.stepSize ?? 0));
        });
        this.endpoint.addCommandHandler('enhancedMoveHue', async (data: any) => {
          const request = data?.request ?? data;
          await stepHs((request?.moveMode === 1 ? -1 : 1) * enhancedMatterHueToDegrees(request?.rate ?? 0));
        });
        this.endpoint.addCommandHandler('stepSaturation', async (data: any) => {
          const request = data?.request ?? data;
          await stepHs(0, (request?.stepMode === 1 ? -1 : 1) * matterSaturationToPercent(request?.stepSize ?? 0));
        });
        this.endpoint.addCommandHandler('moveSaturation', async (data: any) => {
          const request = data?.request ?? data;
          await stepHs(0, (request?.moveMode === 1 ? -1 : 1) * matterSaturationToPercent(request?.rate ?? 0));
        });
`;
  source = source.replace("        this.endpoint.addCommandHandler('moveToHueAndSaturation', async (data: any) => {", insertion + "\n        this.endpoint.addCommandHandler('moveToHueAndSaturation', async (data: any) => {");
  return source;
});

patch('src/entities/composite-device.entity.ts', (source) => {
  source = source.replace(
    "import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';",
    "import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';\nimport { MatterbridgeOnOffServer } from 'matterbridge/behaviors';",
  );
  source = source.replace(
    "import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID, MATTER_BRIDGE_VENDOR_NAME } from '../utils/matter-device-identity.js';",
    "import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID, MATTER_BRIDGE_VENDOR_NAME } from '../utils/matter-device-identity.js';\nimport { colorPayloadForHomeAssistant, degreesToEnhancedMatterHue, degreesToMatterHue, getHsColor, haXyToMatter, matterHueToDegrees, matterSaturationToPercent, percentToMatterSaturation } from '../utils/light-color.js';\n// HOMEKIT_COLOR_PIPELINE_3_10_4",
  );
  source = source.replace(
    "      const child = this.endpoint.addChildDeviceTypeWithClusterServer(endpointId(member.entityId), memberType, clusterIds);",
    "      const child = this.endpoint.addChildDeviceTypeWithClusterServer(endpointId(member.entityId), memberType, clusterIds);\n      if (clusterIds.includes(OnOff.id)) {\n        (child as any).behaviors?.inject?.(domain === 'light' ? MatterbridgeOnOffServer : MatterbridgeOnOffServer.with(), { onOff: isOn(member.state) });\n      }",
  );
  source = source.replace(
    "const hs = [Math.round((hue / 254) * 360), Math.round((sat / 254) * 100)];",
    "const hs = [matterHueToDegrees(hue), matterSaturationToPercent(sat)];",
  );
  source = source.replace(
    "await update(endpoint, ColorControl.id, 'currentHue', Math.round((hue / 360) * 254), this.platform.log);\n            await update(endpoint, ColorControl.id, 'currentSaturation', Math.round((sat / 100) * 254), this.platform.log);",
    "await update(endpoint, ColorControl.id, 'currentHue', degreesToMatterHue(hue), this.platform.log);\n            await update(endpoint, ColorControl.id, 'enhancedCurrentHue', degreesToEnhancedMatterHue(hue), this.platform.log);\n            await update(endpoint, ColorControl.id, 'currentSaturation', percentToMatterSaturation(sat), this.platform.log);",
  );
  const marker = "      // Color temperature — prefer kelvin if the light supports it";
  source = source.replace(marker, `      endpoint.addCommandHandler('moveToColor', async (data: any) => {
        const request = data?.request ?? data;
        if (typeof request?.colorX !== 'number' || typeof request?.colorY !== 'number') return;
        const currentState = this.states.get(entityId) ?? member.state;
        const payload = colorPayloadForHomeAssistant(currentState, request.colorX, request.colorY);
        this.lastCommands.set(\`${'${entityId}'}:\${Object.keys(payload)[0]}\`, { value: Object.values(payload)[0], timestamp: Date.now() });
        await this.platform.ha.callService('light', 'turn_on', entityId, payload);
      });

` + marker);
  source = source.replace("this.shouldIgnoreStateUpdate('brightness')", "this.shouldIgnoreStateUpdate(`${entityId}:brightness`)");
  source = source.replace("this.shouldIgnoreStateUpdate('color_temp')", "this.shouldIgnoreStateUpdate(`${entityId}:color_temp`)");
  source = source.replace("this.shouldIgnoreStateUpdate('hs_color')", "this.shouldIgnoreStateUpdate(`${entityId}:hs_color`)");
  source = source.replace("this.lastCommands.set('brightness'", "this.lastCommands.set(`${entityId}:brightness`");
  source = source.replace("this.lastCommands.set('color_temp'", "this.lastCommands.set(`${entityId}:color_temp`");
  source = source.replace("this.lastCommands.set('hs_color'", "this.lastCommands.set(`${entityId}:hs_color`");
  return source;
});
