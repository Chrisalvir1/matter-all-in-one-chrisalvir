/**
 * Mock Home Assistant Client API.
 */
import { vi } from 'vitest';
import { EventEmitter } from 'node:events';

export class MockHomeAssistant extends EventEmitter {
  public connected = false;
  public hassStates = new Map<string, any>();
  public hassDevices = new Map<string, any>();
  public hassEntities = new Map<string, any>();
  public hassAreas = new Map<string, any>();
  public hassConfig = {};
  public hassServices = {};

  constructor() {
    super();
  }

  public connect() {
    this.connected = true;
    this.emit('connected', '2026.6.0');
    return Promise.resolve();
  }

  public disconnect() {
    this.connected = false;
    this.emit('disconnected');
    return Promise.resolve();
  }

  public close() {
    return this.disconnect();
  }

  public fetchData() {
    this.hassAreas.set('living_room', {
      area_id: 'living_room',
      name: 'Living Room',
    });

    this.hassDevices.set('device-light-1', {
      id: 'device-light-1',
      name: 'Living Room Lamp',
      name_by_user: null,
      area_id: 'living_room',
      manufacturer: 'Mock',
      model: 'Lamp',
    });

    this.hassEntities.set('light.living_room', {
      id: 'entity-light-1',
      entity_id: 'light.living_room',
      device_id: 'device-light-1',
      area_id: null,
      name: null,
      original_name: 'Living Room Light',
      platform: 'mock',
    });

    // Populate mock states
    this.hassStates.set('light.living_room', {
      entity_id: 'light.living_room',
      state: 'on',
      attributes: {
        friendly_name: 'Living Room Light',
        brightness: 200,
      },
    });

    this.hassStates.set('cover.garage_door', {
      entity_id: 'cover.garage_door',
      state: 'closed',
      attributes: {
        friendly_name: 'Garage Door',
        device_class: 'garage_door',
        current_position: 0,
      },
    });

    this.hassStates.set('camera.backyard', {
      entity_id: 'camera.backyard',
      state: 'recording',
      attributes: {
        friendly_name: 'Backyard Camera',
      },
    });

    this.hassStates.set('sensor.garden_moisture', {
      entity_id: 'sensor.garden_moisture',
      state: '45.5',
      attributes: {
        friendly_name: 'Garden Moisture',
        device_class: 'moisture',
        temperature: 22.4,
      },
    });

    return Promise.resolve();
  }

  public subscribe() {
    this.emit('subscribed');
    return Promise.resolve(1);
  }

  public callService = vi.fn((domain: string, service: string, entityId: string, data?: any) => {
    return Promise.resolve({
      context: { id: 'test-context', parent_id: null, user_id: null },
      response: { url: 'rtsp://mock-stream-url' },
    });
  });
}

vi.mock('../../src/homeAssistant.js', () => {
  return {
    HomeAssistant: MockHomeAssistant,
  };
});
