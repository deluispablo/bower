import { describe, expect, it } from 'vitest';

import {
  BIRD_STATES,
  ONCE_STATES,
  birdClasses,
} from '../src/components/bird-classes.js';
import type { BirdFace, BirdState } from '../src/components/bird-classes.js';

/** The pose class each state plays, as named in docs/design/gen.py. */
const POSES: Record<BirdState, string> = {
  looking: 'p-look',
  hello: 'p-hello',
  shiny: 'p-shiny',
  singing: 'p-sing',
  tidying: 'p-tidy',
  showoff: 'p-dance',
  confused: 'p-confused',
  building: 'p-build',
  asleep: 'p-sleep',
  peeking: 'p-peek',
  offline: 'p-offline',
  done: 'p-done',
};

/** The still face each state falls back to when motion is off. */
const STILL_FACES: Record<BirdState, BirdFace | undefined> = {
  looking: undefined,
  hello: 'happy',
  shiny: 'curious',
  singing: undefined,
  tidying: undefined,
  showoff: 'proud',
  confused: 'worried',
  building: undefined,
  asleep: 'sleepy',
  peeking: undefined,
  offline: undefined,
  done: undefined,
};

function classList(value: string): string[] {
  return value.split(' ');
}

describe('BIRD_STATES', () => {
  it('lists the twelve states once each', () => {
    expect([...BIRD_STATES].sort()).toEqual(Object.keys(POSES).sort());
  });
});

describe('ONCE_STATES', () => {
  it('hello, showoff and done play once', () => {
    expect([...ONCE_STATES].sort()).toEqual(['done', 'hello', 'showoff']);
  });
});

describe('birdClasses', () => {
  for (const state of Object.keys(POSES) as BirdState[]) {
    it(`${state}: the base class and its pose`, () => {
      expect(classList(birdClasses(state, undefined, false, false))).toEqual([
        'b',
        POSES[state],
      ]);
    });

    it(`${state}, reduced motion: no pose, its still face if it has one`, () => {
      const face = STILL_FACES[state];
      expect(classList(birdClasses(state, undefined, false, true))).toEqual(
        face === undefined ? ['b'] : ['b', `e-${face}`],
      );
    });
  }

  it('never adds a pose class with reduced motion', () => {
    for (const state of BIRD_STATES) {
      const classes = classList(birdClasses(state, undefined, false, true));
      expect(classes.some((name) => name.startsWith('p-'))).toBe(false);
    }
  });

  it('flip turns the bird round, with or without motion', () => {
    expect(classList(birdClasses('looking', undefined, true, false))).toEqual([
      'b',
      'p-look',
      'flip',
    ]);
    expect(classList(birdClasses('confused', undefined, true, true))).toEqual([
      'b',
      'e-worried',
      'flip',
    ]);
  });

  it('a face override sits on top of the pose', () => {
    expect(classList(birdClasses('looking', 'happy', false, false))).toEqual([
      'b',
      'p-look',
      'e-happy',
    ]);
  });

  it('a face override replaces the still face with reduced motion', () => {
    expect(classList(birdClasses('asleep', 'curious', false, true))).toEqual([
      'b',
      'e-curious',
    ]);
    expect(classList(birdClasses('tidying', 'proud', true, true))).toEqual([
      'b',
      'e-proud',
      'flip',
    ]);
  });
});
