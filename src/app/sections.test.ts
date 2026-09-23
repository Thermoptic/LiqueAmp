import { describe, expect, it } from 'vitest';
import { sectionFromPath } from './sections';

describe('sectionFromPath', () => {
  it('maps routes to sections', () => {
    expect(sectionFromPath('/')).toBe('now-playing');
    expect(sectionFromPath('/browse')).toBe('browse');
    expect(sectionFromPath('/playlists')).toBe('playlists');
    expect(sectionFromPath('/favourites')).toBe('favourites');
    expect(sectionFromPath('/history')).toBe('history');
    expect(sectionFromPath('/settings')).toBe('settings');
    expect(sectionFromPath('/unknown')).toBe('now-playing');
  });
});
