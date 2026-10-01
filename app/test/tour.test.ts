import { describe, expect, it } from 'vitest';

import {
  TOUR_TABS,
  helpSheet,
  tourLabel,
  tourNextLabel,
  tourSheet,
} from '../src/help-rows.js';

describe('the tour copy (K-28, R-TR-2)', () => {
  it('runs over the four tabs: Home, Folders, Add, Bower', () => {
    expect(TOUR_TABS).toEqual(['home', 'notes', 'add', 'bower']);
    expect(TOUR_TABS.map((tab) => tourSheet(tab).title)).toEqual([
      'Home',
      'Folders',
      'Add',
      'Bower',
    ]);
  });

  it("uses each tab's Help lede and rows, word for word, at both widths", () => {
    for (const tab of TOUR_TABS) {
      for (const desktop of [false, true]) {
        for (const demo of [false, true]) {
          const step = tourSheet(tab, { desktop, demo });
          const help = helpSheet(tab, { desktop, demo });
          expect(step.title).toBe(help.title);
          expect(step.lede).toBe(help.lede);
          expect(step.rows).toEqual(help.rows);
        }
      }
    }
  });

  it('labels the steps: "Tour · n of 4", "Next: <tab>", "Let\'s go"', () => {
    expect(TOUR_TABS.map((_, i) => tourLabel(i))).toEqual([
      'Tour · 1 of 4',
      'Tour · 2 of 4',
      'Tour · 3 of 4',
      'Tour · 4 of 4',
    ]);
    expect(TOUR_TABS.map((_, i) => tourNextLabel(i))).toEqual([
      'Next: Folders',
      'Next: Add',
      'Next: Bower',
      "Let's go",
    ]);
  });

  it('says "Tap" on the phone and "Click" on desktop on step 4', () => {
    expect(tourSheet('bower').rows[1]?.text).toContain('Tap one');
    expect(tourSheet('bower', { desktop: true }).rows[1]?.text).toContain(
      'Click one',
    );
  });
});
