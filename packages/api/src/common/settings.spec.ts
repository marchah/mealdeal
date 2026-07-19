import { describe, expect, it } from 'vitest';
import { parseSettings } from './settings';

describe('parseSettings', () => {
  it('accepts a five-digit USER_LOCATION ZIP', () => {
    expect(parseSettings({ USER_LOCATION: '02139' }).USER_LOCATION).toBe('02139');
  });

  it('leaves USER_LOCATION unset when it is missing', () => {
    expect(parseSettings({}).USER_LOCATION).toBeNull();
  });

  it('treats Docker Compose’s empty USER_LOCATION value as unset', () => {
    expect(parseSettings({ USER_LOCATION: '' }).USER_LOCATION).toBeNull();
  });

  it('rejects an invalid USER_LOCATION ZIP', () => {
    expect(() => parseSettings({ USER_LOCATION: '0213' })).toThrow(
      'USER_LOCATION must be a five-digit US ZIP code',
    );
  });
});
