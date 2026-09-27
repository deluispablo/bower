import { readFileSync } from 'node:fs';

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

// bird.css parsed with a regex (no CSS engine), read from disk relative to
// the app package root (vitest's working directory; `?raw` is empty for CSS
// under vitest). Types for `node:fs` come from ./node-fs.d.ts.
const BIRD_CSS = readFileSync('src/styles/bird.css', 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The declarations of every rule whose selector list includes `selector`. */
function declarations(selector: string): string {
  const bodies: string[] = [];
  for (const match of BIRD_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((part) => part.trim());
    if (selectors.includes(selector)) bodies.push(match[2] ?? '');
  }
  return bodies.join(';');
}

/** Every rule selector in bird.css that starts with `prefix`. */
function selectorsStartingWith(prefix: string): string[] {
  const found: string[] = [];
  for (const match of BIRD_CSS.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const part of (match[1] ?? '').split(',')) {
      const selector = part.trim();
      if (selector.startsWith(prefix)) found.push(selector);
    }
  }
  return found;
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

describe('bird.css faces (v8.2: the lids carry the mood)', () => {
  it('worried and sleepy lower the upper lid and leave the eye alone', () => {
    for (const face of ['worried', 'sleepy']) {
      expect(declarations(`.e-${face} .ld`)).toMatch(/transform:\s*translateY/);
      expect(selectorsStartingWith(`.e-${face} .ey`)).toEqual([]);
    }
  });

  it('sleepy, happy and proud raise the lower lid', () => {
    for (const face of ['sleepy', 'happy', 'proud']) {
      expect(declarations(`.e-${face} .lb`)).toMatch(
        /transform:\s*translateY\(-/,
      );
    }
  });

  it('asleep shuts the eye with the lids, not by squashing it', () => {
    expect(declarations('.p-sleep .ld')).toMatch(/transform:\s*translateY/);
    expect(selectorsStartingWith('.p-sleep .ey')).toEqual([]);
  });
});

describe('bird.css joints', () => {
  // Spec §4.1 and #161: every joint pivots in drawing units, so no
  // rotation can detach a part.
  const JOINTS: Record<string, string> = {
    tl: '30px 76px',
    hd: '60px 64px',
    wg: '54px 57px',
    ft: '47px 84px',
  };
  for (const [part, origin] of Object.entries(JOINTS)) {
    it(`${part} pivots at ${origin} of the view box`, () => {
      const body = declarations(`.b .${part}`);
      expect(body).toMatch(/transform-box:\s*view-box/);
      expect(body).toContain(`transform-origin: ${origin}`);
    });
  }
});

describe('bird.css plays-once states', () => {
  for (const pose of ['p-hello', 'p-dance', 'p-done']) {
    it(`${pose} never loops forever`, () => {
      for (const selector of selectorsStartingWith(`.${pose} `)) {
        expect(declarations(selector)).not.toContain('infinite');
      }
    });
  }

  it('done lasts 2 s (spec §4.3)', () => {
    expect(declarations('.p-done .rig')).toMatch(/animation:\s*hopwink 2s/);
  });
});
