/**
 * Entry point for matter-all-in-one-chrisalvir plugin.
 */
import { PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { HomeAssistantPlatform, HomeAssistantPlatformConfig } from './platform.js';

/**
 * Initialize the plugin.
 */
export default function initializePlugin(
  matterbridge: PlatformMatterbridge,
  log: AnsiLogger,
  config: HomeAssistantPlatformConfig
): HomeAssistantPlatform {
  return new HomeAssistantPlatform(matterbridge, log, config);
}
