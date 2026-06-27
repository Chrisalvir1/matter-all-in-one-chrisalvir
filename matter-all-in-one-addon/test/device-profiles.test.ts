import { describe, expect, it } from 'vitest';
import { getDefaultExportProfileId, getExportProfile, getExportProfiles } from '../src/device-profiles.js';

describe('device export profiles', () => {
  it('offers the official RVC profile as Apple Home-supported', () => {
    expect(getExportProfiles('vacuum')).toEqual([
      expect.objectContaining({ id: 'roboticVacuumCleaner', appleHome: 'supported' }),
    ]);
    expect(getDefaultExportProfileId('vacuum')).toBe('roboticVacuumCleaner');
  });

  it('labels Basic Video Player as unsupported by Apple Home Matter', () => {
    expect(getExportProfile('media_player', 'basicVideoPlayer')).toEqual(
      expect.objectContaining({ appleHome: 'unsupported' }),
    );
  });
});
