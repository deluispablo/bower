import { describe, expect, it } from 'vitest';

import {
  ACTS,
  EXAMPLES,
  FEATURES,
  HOW_IT_WORKS,
  LEARN_INTRO_CARD,
  exampleHref,
  findExample,
  isLearnPath,
} from '../src/learn.js';

describe('Learn Bower copy (R-LEARN-2)', () => {
  it('has the six examples in the board order, with their marks', () => {
    expect(EXAMPLES.map((e) => [e.title, e.kind])).toEqual([
      ['Flat hunting', 'projects'],
      ['A job search', 'projects'],
      ['Health papers', 'areas'],
      ['Money', 'areas'],
      ['Things you read', 'resources'],
      ['Finished things', 'archives'],
    ]);
  });

  it('has four how-it-works cards and the first card reads "The intro"', () => {
    expect(HOW_IT_WORKS.map((c) => c.title)).toEqual([
      'Add a pile',
      'Tidy up',
      "Read Bower's note",
      'Ask',
    ]);
    expect(LEARN_INTRO_CARD).toEqual({
      title: 'The intro',
      hint: 'Five screens, two minutes',
    });
  });

  it('gives every example unique slugs and all four acts', () => {
    expect(new Set(EXAMPLES.map((e) => e.slug)).size).toBe(EXAMPLES.length);
    expect(ACTS.map((a) => a.title)).toEqual([
      'You add',
      'Bower files and writes',
      'You ask',
      'You get',
    ]);
    for (const example of EXAMPLES) {
      for (const act of ACTS) {
        expect(example.acts[act.id].length).toBeGreaterThan(0);
      }
    }
  });

  it('ties every claim to a feature that exists', () => {
    for (const example of EXAMPLES) {
      for (const act of ACTS) {
        for (const claim of example.acts[act.id]) {
          expect(claim.text.trim()).not.toBe('');
          expect(Object.keys(FEATURES)).toContain(claim.feature);
        }
      }
    }
    for (const feature of Object.values(FEATURES)) {
      expect(feature.spec).toMatch(/^R-[A-Z]+/);
    }
  });

  it('uses every feature at least once, so none is listed without a claim', () => {
    const used = new Set(
      EXAMPLES.flatMap((e) =>
        ACTS.flatMap((a) => e.acts[a.id].map((c) => c.feature)),
      ),
    );
    expect([...used].sort()).toEqual(Object.keys(FEATURES).sort());
  });

  it('never says what Bower does not do', () => {
    const all = JSON.stringify(EXAMPLES);
    for (const banned of [
      'asks once',
      'stops there',
      'never leave',
      'vault',
      'Dr ',
      'Dr.',
      '4-Archive"',
      'Nothing else happens',
    ]) {
      expect(all).not.toContain(banned);
    }
  });

  it('finds an example by its slug and links to it', () => {
    expect(findExample('money')?.title).toBe('Money');
    expect(findExample('nope')).toBeUndefined();
    expect(findExample(undefined)).toBeUndefined();
    expect(exampleHref('money')).toBe('/learn/money');
  });

  it('knows a Learn path from anything else', () => {
    expect(isLearnPath('/learn')).toBe(true);
    expect(isLearnPath('/learn/money')).toBe(true);
    expect(isLearnPath('/learning')).toBe(false);
    expect(isLearnPath('/welcome')).toBe(false);
  });
});
