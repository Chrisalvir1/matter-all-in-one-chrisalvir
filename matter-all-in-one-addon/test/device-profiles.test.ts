import { describe, expect, it } from 'vitest';
import { getDefaultExportProfileId, getExportProfile, getExportProfiles } from '../src/device-profiles.js';

describe('device export profiles', () => {
  it('offers the official RVC profile as the only vacuum profile', () => {
    expect(getExportProfiles('vacuum')).toEqual([
      expect.objectContaining({ id: 'roboticVacuumCleaner', appleHome: 'experimental' }),
    ]);
    expect(getDefaultExportProfileId('vacuum')).toBe('roboticVacuumCleaner');
  });

  it('labels Basic Video Player as unsupported by Apple Home Matter', () => {
    expect(getExportProfile('media_player', 'basicVideoPlayer')).toEqual(
      expect.objectContaining({ appleHome: 'unsupported' }),
    );
  });
});
