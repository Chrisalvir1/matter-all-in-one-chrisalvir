import { HassState } from './src/utils/ha-state.js';
import { BaseEntity } from './src/entities/base.entity.js';
import { dimmablePlugInUnit } from 'matterbridge';

const state: HassState = {
  entity_id: 'light.desayunador',
  state: 'off',
  attributes: {
    supported_color_modes: ['brightness'],
    friendly_name: 'Desayunador'
  },
  last_changed: '',
  last_updated: '',
  context: { id: '', parent_id: null, user_id: null }
};

// Mock Platform
const mockPlatform: any = { log: { debug: console.log, info: console.log, warn: console.log, error: console.log } };

const entity = new BaseEntity(mockPlatform, state, dimmablePlugInUnit);
const clusters = (entity as any).getRequiredClusterIds();
console.log('Clusters:', clusters);
