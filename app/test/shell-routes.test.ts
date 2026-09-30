import { describe, expect, it } from 'vitest';

import {
  FOLDERS_PATH,
  FOLDERS_TAB_LABEL,
  activeTab,
  barHasAvatar,
  topBarVariant,
} from '../src/shell-routes.js';

describe('activeTab (R-TABBAR-2)', () => {
  it('lights Home on Home and on Just filed', () => {
    expect(activeTab('/')).toBe('home');
    expect(activeTab('/just-filed')).toBe('home');
  });

  it('lights Folders on the tab and on every folder, note and file', () => {
    expect(activeTab(FOLDERS_PATH)).toBe('folders');
    expect(activeTab('/folder/1-Projects/Moonee%20Ponds')).toBe('folders');
    expect(activeTab('/note/abc')).toBe('folders');
    expect(activeTab('/file/abc')).toBe('folders');
  });

  it('lights Add and Bower on their own tab', () => {
    expect(activeTab('/add')).toBe('add');
    expect(activeTab('/bower')).toBe('bower');
  });

  it('lights none on Settings', () => {
    expect(activeTab('/settings')).toBeNull();
  });
});

describe('the Folders tab', () => {
  it('is labelled Folders and keeps the /notes route', () => {
    expect(FOLDERS_TAB_LABEL).toBe('Folders');
    expect(FOLDERS_PATH).toBe('/notes');
  });
});

describe('topBarVariant (R-TOPBAR-1)', () => {
  it('is tab on Home, Add and Bower', () => {
    expect(topBarVariant('/')).toBe('tab');
    expect(topBarVariant('/add')).toBe('tab');
    expect(topBarVariant('/bower')).toBe('tab');
  });

  it('is explorer on the Folders tab', () => {
    expect(topBarVariant('/notes')).toBe('explorer');
  });

  it('is inner on folders, notes, files, Just filed and Settings', () => {
    for (const path of [
      '/folder/1-Projects',
      '/note/abc',
      '/file/abc',
      '/just-filed',
      '/settings',
    ]) {
      expect(topBarVariant(path)).toBe('inner');
    }
  });

  it('shows the avatar everywhere but Settings (ST-1)', () => {
    expect(barHasAvatar('/settings')).toBe(false);
    expect(barHasAvatar('/note/abc')).toBe(true);
  });
});
