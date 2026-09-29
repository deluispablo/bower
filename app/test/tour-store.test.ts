import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';
import { currentToast, dismissToast } from '../src/toast-store.js';
import {
  announceTourSkipped,
  endTour,
  getTourState,
  markTourSeen,
  replayTour,
  resetTourStore,
  showoffPlayed,
} from '../src/tour-store.js';

const updateSettings = vi.fn();

vi.mock('../src/api.js', () => ({
  updateSettings: (input: unknown) => updateSettings(input) as unknown,
}));

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'FOLDER_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const NOW = new Date('2026-09-27T10:00:00.000Z');

beforeEach(() => {
  resetTourStore();
  updateSettings.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tour store', () => {
  it('replays once: ending the tour clears the replay and dismisses it', () => {
    replayTour();
    expect(getTourState()).toEqual({
      replay: true,
      dismissed: false,
      showoff: false,
    });

    endTour(true);
    expect(getTourState()).toEqual({
      replay: false,
      dismissed: true,
      showoff: true,
    });

    showoffPlayed();
    expect(getTourState().showoff).toBe(false);
  });

  it('a skip does not ask for the show-off', () => {
    endTour(false);
    expect(getTourState()).toEqual({
      replay: false,
      dismissed: true,
      showoff: false,
    });
  });

  it('says where to replay the tour once per session', () => {
    announceTourSkipped();
    expect(currentToast()?.message).toBe(
      'Replay the tour any time from Settings.',
    );
    dismissToast();
    announceTourSkipped();
    expect(currentToast()).toBeNull();
    resetTourStore();
    announceTourSkipped();
    expect(currentToast()).not.toBeNull();
    dismissToast();
  });
});

describe('markTourSeen', () => {
  it('saves tourSeenAt the first time only', async () => {
    updateSettings.mockResolvedValue({ hasApiKey: false });

    await markTourSeen(me, NOW);
    await markTourSeen(me, NOW);

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({
      tourSeenAt: '2026-09-27T10:00:00.000Z',
    });
  });

  it('never touches the flag once the account has seen the tour', async () => {
    await markTourSeen({ ...me, tourSeenAt: NOW.toISOString() }, NOW);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('logs a failure and does not throw or retry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    updateSettings.mockRejectedValue(new Error('offline'));

    await expect(markTourSeen(me, NOW)).resolves.toBeUndefined();

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
  });
});
