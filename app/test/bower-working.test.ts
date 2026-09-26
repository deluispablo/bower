import { describe, expect, it } from 'vitest';

import {
  INDETERMINATE_FILL,
  nestFill,
  sceneFor,
} from '../src/components/bower-working.js';
import {
  SHEET_LINGER_MS,
  sheetVisible,
  workingStateFor,
} from '../src/components/working-sheet.js';

describe('nestFill', () => {
  it('passes values between 0 and 1 through', () => {
    expect(nestFill(0)).toBe(0);
    expect(nestFill(0.4)).toBe(0.4);
    expect(nestFill(1)).toBe(1);
  });

  it('clamps out-of-range values', () => {
    expect(nestFill(-0.5)).toBe(0);
    expect(nestFill(1.7)).toBe(1);
    expect(nestFill(Number.POSITIVE_INFINITY)).toBe(1);
    expect(nestFill(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('treats NaN as empty', () => {
    expect(nestFill(Number.NaN)).toBe(0);
  });
});

describe('sceneFor', () => {
  it('queued: empty nest, bobbing on the rim', () => {
    expect(sceneFor('queued')).toEqual({
      className: 'bw bw--queued',
      label: 'Queued…',
      fill: 0,
      indeterminate: false,
    });
  });

  it('running without progress: slow indeterminate fill', () => {
    expect(sceneFor('running')).toEqual({
      className: 'bw bw--running bw--indeterminate',
      label: 'Working…',
      fill: INDETERMINATE_FILL,
      indeterminate: true,
    });
  });

  it('running with progress: the nest fills proportionally, clamped', () => {
    const scene = sceneFor('running', 0.25);
    expect(scene.fill).toBe(0.25);
    expect(scene.indeterminate).toBe(false);
    expect(scene.className).toBe('bw bw--running');
    expect(sceneFor('running', 3).fill).toBe(1);
  });

  it('done: full nest and "Done"', () => {
    expect(sceneFor('done', 0.2)).toEqual({
      className: 'bw bw--done',
      label: 'Done',
      fill: 1,
      indeterminate: false,
    });
  });

  it('failed: "Something went wrong", nest as far as it got', () => {
    expect(sceneFor('failed')).toMatchObject({
      className: 'bw bw--failed',
      label: 'Something went wrong',
      fill: 0,
    });
    expect(sceneFor('failed', 0.6).fill).toBe(0.6);
  });

  it('reduced motion: still class, no indeterminate animation, same texts', () => {
    const scene = sceneFor('running', undefined, true);
    expect(scene.className).toBe('bw bw--running bw--still');
    expect(scene.indeterminate).toBe(false);
    expect(scene.fill).toBe(INDETERMINATE_FILL);
    expect(scene.label).toBe(sceneFor('running').label);
    expect(sceneFor('done', undefined, true).label).toBe('Done');
  });
});

describe('sheetVisible', () => {
  it('shows while queued or running, however long', () => {
    expect(sheetVisible('queued', 0, false)).toBe(true);
    expect(sheetVisible('running', 10 * 60_000, false)).toBe(true);
  });

  it('lingers 3 s after done, failed or stale', () => {
    for (const phase of ['done', 'failed', 'stale'] as const) {
      expect(sheetVisible(phase, 0, false)).toBe(true);
      expect(sheetVisible(phase, SHEET_LINGER_MS - 1, false)).toBe(true);
      expect(sheetVisible(phase, SHEET_LINGER_MS, false)).toBe(false);
    }
  });

  it('never shows once dismissed', () => {
    expect(sheetVisible('running', 0, true)).toBe(false);
    expect(sheetVisible('done', 0, true)).toBe(false);
  });

  it('never shows for idle or quota', () => {
    expect(sheetVisible('idle', 0, false)).toBe(false);
    expect(sheetVisible('quota', 0, false)).toBe(false);
  });
});

describe('workingStateFor', () => {
  it('maps run phases to animation states', () => {
    expect(workingStateFor('queued')).toBe('queued');
    expect(workingStateFor('running')).toBe('running');
    expect(workingStateFor('done')).toBe('done');
    expect(workingStateFor('failed')).toBe('failed');
    expect(workingStateFor('stale')).toBe('failed');
    expect(workingStateFor('idle')).toBeNull();
    expect(workingStateFor('quota')).toBeNull();
  });
});
