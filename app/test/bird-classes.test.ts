import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BIRD_STATES,
  ONCE_STATES,
  birdClasses,
} from '../src/components/bird-classes.js';
import type { BirdFace, BirdState } from '../src/components/bird-classes.js';

/** The pose class each state plays, as named in the design canvas. */
const POSES: Record<BirdState, string> = {
  idle: 'p-idle',
  looking: 'p-look',
  hello: 'p-hello',
  shiny: 'p-shiny',
  singing: 'p-sing',
  tidying: 'p-tidy',
  flying: 'p-fly',
  showoff: 'p-dance',
  confused: 'p-confused',
  building: 'p-build',
  asleep: 'p-sleep',
  peeking: 'p-peek',
  offline: 'p-offline',
  done: 'p-done',
  listening: 'p-listen',
  pointing: 'p-point',
  reading: 'p-read',
  perched: 'p-perch',
};

/** The still face each state falls back to when motion is off. */
const STILL_FACES: Record<BirdState, BirdFace | undefined> = {
  idle: undefined,
  looking: undefined,
  hello: 'happy',
  shiny: 'curious',
  singing: undefined,
  tidying: undefined,
  flying: undefined,
  showoff: 'proud',
  confused: 'worried',
  building: undefined,
  asleep: 'sleepy',
  peeking: undefined,
  offline: undefined,
  done: undefined,
  listening: 'curious',
  pointing: undefined,
  reading: undefined,
  perched: undefined,
};

/** The still class a held pose gets when motion is off (spec §6.21). */
const STILL_CLASSES: Partial<Record<BirdState, string>> = {
  pointing: 's-point',
  reading: 's-read',
  perched: 's-perch',
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
  it('lists the eighteen states once each', () => {
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
      const held = STILL_CLASSES[state];
      expect(classList(birdClasses(state, undefined, false, true))).toEqual([
        'b',
        ...(held === undefined ? [] : [held]),
        ...(face === undefined ? [] : [`e-${face}`]),
      ]);
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

describe('birdClasses, the round 7 poses (spec §6.21)', () => {
  it('pointing down adds pd right after the pose', () => {
    expect(
      classList(birdClasses('pointing', undefined, false, false, true)),
    ).toEqual(['b', 'p-point', 'pd']);
    expect(
      classList(birdClasses('pointing', undefined, false, false, false)),
    ).toEqual(['b', 'p-point']);
  });

  it('only a pointing bird takes pd', () => {
    expect(
      classList(birdClasses('reading', undefined, false, false, true)),
    ).toEqual(['b', 'p-read']);
  });

  it('with reduced motion, pointing holds s-point and keeps pd', () => {
    expect(
      classList(birdClasses('pointing', undefined, false, true, true)),
    ).toEqual(['b', 's-point', 'pd']);
    expect(classList(birdClasses('pointing', undefined, true, true))).toEqual([
      'b',
      's-point',
      'flip',
    ]);
  });

  it('with reduced motion, reading holds s-read and perched holds s-perch', () => {
    expect(classList(birdClasses('reading', undefined, false, true))).toEqual([
      'b',
      's-read',
    ]);
    expect(classList(birdClasses('perched', undefined, false, true))).toEqual([
      'b',
      's-perch',
    ]);
  });

  it('with reduced motion, listening holds the curious face and no pose', () => {
    expect(classList(birdClasses('listening', undefined, false, true))).toEqual(
      ['b', 'e-curious'],
    );
  });

  it('the still classes exist in bird.css and hold the pose without motion', () => {
    expect(declarations('.s-point .wg')).toMatch(
      /rotate\(var\(--bird-point-angle\)\)/,
    );
    expect(declarations('.s-point')).toContain('--bird-point-angle: 214deg');
    expect(declarations('.s-point.pd')).toContain('--bird-point-angle: 242deg');
    expect(declarations('.s-read .rd')).toMatch(/opacity:\s*1/);
    expect(declarations('.s-perch .lb')).toMatch(/translateY\(-2px\)/);
    for (const still of ['.s-point', '.s-read', '.s-perch']) {
      expect(selectorsStartingWith(still).join(' ')).not.toMatch(/animation/);
      expect(declarations(`${still} .wg`)).not.toContain('animation');
    }
  });

  it('the point angle is bird-local, never the PARA Areas colour', () => {
    expect(BIRD_CSS).toContain('--bird-point-angle');
    expect(BIRD_CSS).not.toMatch(/--pa/);
  });

  it('a bird never takes a tap (rule 4), except the nap button', () => {
    expect(declarations('.b')).toMatch(/pointer-events:\s*none/);
  });

  it('the hop-turn flips at the top of a 7 px hop, through 0.5 and -0.5 only', () => {
    const turn = /@keyframes turnaround\s*\{(?:[^{}]*\{[^{}]*\})*/.exec(
      BIRD_CSS,
    );
    const body = turn?.[0] ?? '';
    expect(body).toMatch(/60\.6%[^}]*translateY\(-6px\) scaleX\(0\.5\)/);
    expect(body).toMatch(/61\.2%[^}]*translateY\(-7px\) scaleX\(-0\.5\)/);
    expect(body).toMatch(/86\.6%[^}]*translateY\(-6px\) scaleX\(-0\.5\)/);
    expect(body).toMatch(/87\.2%[^}]*translateY\(-7px\) scaleX\(0\.5\)/);
    // No stop sits between -0.5 and 0.5, so nothing rests on a sliver.
    expect(body).not.toMatch(/scaleX\((?:-?0\.[0-4]\d*|0)\)/);
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
