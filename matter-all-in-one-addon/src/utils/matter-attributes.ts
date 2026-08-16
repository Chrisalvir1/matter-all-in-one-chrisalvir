/**
 * Utilities for getting and setting attributes on Matter endpoints.
 */
import { MatterbridgeEndpoint } from 'matterbridge';
import { ClusterId } from 'matterbridge/matter/types';

/**
 * Safely set an attribute value on a MatterbridgeEndpoint, updating it and catching errors.
 */
export async function safeSetAttribute(
  endpoint: MatterbridgeEndpoint,
  clusterId: ClusterId,
  attributeName: string,
  value: any,
  log?: any
): Promise<boolean> {
  try {
    if (endpoint.hasAttributeServer(clusterId, attributeName)) {
      await endpoint.setAttribute(clusterId, attributeName, value, log);
      return true;
    }
  } catch (err) {
    if (log && typeof log.error === 'function') {
      log.error(`Failed to set attribute ${attributeName} on cluster ${clusterId}: ${err}`);
    }
  }
  return false;
}

/**
 * Safely update/notify of an attribute value on a MatterbridgeEndpoint.
 */
export async function safeUpdateAttribute(
  endpoint: MatterbridgeEndpoint,
  clusterId: ClusterId,
  attributeName: string,
  value: any,
  log?: any
): Promise<boolean> {
  try {
    if (endpoint.hasAttributeServer(clusterId, attributeName)) {
      await endpoint.updateAttribute(clusterId, attributeName, value, log);
      return true;
    }
  } catch (err) {
    if (log && typeof log.error === 'function') {
      log.error(`Failed to update attribute ${attributeName} on cluster ${clusterId}: ${err}`);
    }
  }
  return false;
}
