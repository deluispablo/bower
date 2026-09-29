import { describe, expect, it } from 'vitest';

import type { Run } from '../src/api.js';
import {
  birdStateFor,
  bubbleFor,
  greetingFor,
  homeStateFor,
  inboxLine,
  lastTidyUpLine,
  quarantinedMessage,
  refusedMessage,
  restingBird,
  runCounts,
  tidyUpAgo,
} from '../src/home.js';
import type { BubbleInput, BubblePart, HomeState } from '../src/home.js';
import { runCounts as sheetRunCounts } from '../src/run-progress.js';

function at(hour: number): Date {
  const date = new Date('2026-09-27T00:00:00');
  date.setHours(hour, 0, 0, 0);
  return date;
}

describe('greetingFor', () => {
  it('says good morning before noon', () => {
    expect(greetingFor(at(6))).toBe('Good morning');
    expect(greetingFor(at(11))).toBe('Good morning');
  });

  it('says good afternoon from noon to 6 pm', () => {
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(17))).toBe('Good afternoon');
  });

  it('says good evening from 6 pm', () => {
    expect(greetingFor(at(18))).toBe('Good evening');
    expect(greetingFor(at(23))).toBe('Good evening');
  });

  it('adds the name when there is one', () => {
    expect(greetingFor(at(9), 'Alex')).toBe('Good morning, Alex');
  });

  it('never invents a name: undefined or blank stays alone', () => {
    expect(greetingFor(at(9))).toBe('Good morning');
    expect(greetingFor(at(9), '')).toBe('Good morning');
    expect(greetingFor(at(9), '   ')).toBe('Good morning');
  });
});

function run(state: Run['state'], processed: string[] = []): Run {
  return {
    state,
    requestedAt: '2026-09-27T08:00:00Z',
    finishedAt: '2026-09-27T08:05:00Z',
    processed,
  };
}

/** Three things filed and one message answered. */
const DONE_RUN = run('done', [
  '0-Inbox/Lease agreement 2026.pdf',
  '0-Inbox/Scan of a letter.jpg',
  '0-Inbox/Tomato seedlings.md',
  '0-Inbox/Bower - 2026-09-27 0815 What do I still need.md',
]);

function text(parts: BubblePart[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : part.text))
    .join('');
}

function links(parts: BubblePart[]): string[] {
  return parts.flatMap((part) =>
    typeof part === 'string' ? [] : [`${part.link}:${part.text}`],
  );
}

describe('homeStateFor', () => {
  const base = {
    phase: 'idle' as const,
    pending: 0,
    lastFinished: null,
    loading: false,
  };

  it('waiting while things are in the inbox', () => {
    expect(homeStateFor({ ...base, pending: 3 })).toBe('waiting');
    expect(homeStateFor({ ...base, phase: 'quota', pending: 3 })).toBe(
      'waiting',
    );
  });

  it('empty on the first day: nothing waiting, no tidy-up yet', () => {
    expect(homeStateFor(base)).toBe('empty');
  });

  it('running while a run is queued or running', () => {
    expect(homeStateFor({ ...base, phase: 'queued', pending: 3 })).toBe(
      'running',
    );
    expect(homeStateFor({ ...base, phase: 'running', pending: 3 })).toBe(
      'running',
    );
  });

  it('done right after a run, and once nothing waits after one', () => {
    expect(homeStateFor({ ...base, phase: 'done', pending: 1 })).toBe('done');
    expect(homeStateFor({ ...base, lastFinished: DONE_RUN })).toBe('done');
  });

  it('failed after a failed or stale run, until the next one', () => {
    expect(homeStateFor({ ...base, phase: 'failed', pending: 3 })).toBe(
      'failed',
    );
    expect(homeStateFor({ ...base, phase: 'stale', pending: 3 })).toBe(
      'failed',
    );
  });

  it('loading instead of empty until the index resolves (#322)', () => {
    expect(homeStateFor({ ...base, loading: true })).toBe('loading');
    expect(
      homeStateFor({ ...base, loading: true, lastFinished: DONE_RUN }),
    ).toBe('done');
  });

  it('never loading once something else already answers the question', () => {
    expect(homeStateFor({ ...base, loading: true, pending: 3 })).toBe(
      'waiting',
    );
    expect(
      homeStateFor({ ...base, loading: true, phase: 'running', pending: 3 }),
    ).toBe('running');
    expect(
      homeStateFor({ ...base, loading: true, phase: 'failed', pending: 3 }),
    ).toBe('failed');
    expect(homeStateFor({ ...base, loading: true, phase: 'done' })).toBe(
      'done',
    );
  });
});

describe('runCounts and lastTidyUpLine', () => {
  it('counts a message to Bower as answered, the rest as filed', () => {
    expect(runCounts(DONE_RUN)).toEqual({ filed: 3, answered: 1 });
    expect(lastTidyUpLine(DONE_RUN)).toBe('3 filed · 1 answered');
  });

  it('leaves out a half at zero, says Nothing new at both', () => {
    expect(lastTidyUpLine(run('done', ['0-Inbox/a.pdf']))).toBe('1 filed');
    expect(lastTidyUpLine(run('done'))).toBe('Nothing new');
  });

  it('says Failed for a failed run', () => {
    expect(lastTidyUpLine(run('failed', ['0-Inbox/a.pdf']))).toBe(
      'Failed · Did not finish',
    );
    expect(
      lastTidyUpLine({ ...run('failed', []), reason: 'drive_unavailable' }),
    ).toBe('Failed · Drive did not answer');
  });

  it('counts neither: the "What is this?" context note (#444)', () => {
    const withContext = run('done', [
      '0-Inbox/Lease agreement 2026.pdf',
      '0-Inbox/Bower - 2026-09-27 0815 What do I still need.md',
      '0-Inbox/Bower - 2026-09-27 0900 Context.md',
    ]);
    expect(runCounts(withContext)).toEqual({ filed: 1, answered: 1 });
    expect(lastTidyUpLine(withContext)).toBe('1 filed · 1 answered');
  });

  it('a run recovered from .bower/last-run.json shows its own sentence (#564)', () => {
    // No `processed` list, only a count baked into `summary` — the runner
    // never writes paths there (`agent/run.sh`).
    const recovered: Run = {
      state: 'done',
      requestedAt: '2026-09-27T08:00:00Z',
      finishedAt: '2026-09-27T08:05:00Z',
      summary: 'Tidied up 3 things.',
    };
    expect(lastTidyUpLine(recovered)).toBe('Tidied up 3 things.');
  });

  it("agrees with the working sheet's own count for the same run (#506)", () => {
    // Two things filed, a context note, no question: Home's "filed" total
    // and the sheet's "processed" total (`run-progress.ts#runCounts`) must
    // land on the same number, since both exclude the same context note.
    const processed = [
      '0-Inbox/Lease agreement 2026.pdf',
      '0-Inbox/IMG_4471.jpg',
      '0-Inbox/Bower - 2026-09-27 0900 Context.md',
    ];
    const withContext = run('done', processed);
    expect(runCounts(withContext)).toEqual({ filed: 2, answered: 0 });
    expect(sheetRunCounts(processed, processed).processed).toBe(2);
  });
});

describe('tidyUpAgo', () => {
  it('just now, minutes, hours, then days', () => {
    const iso = '2026-09-27T08:00:00Z';
    const finished = Date.parse(iso);
    expect(tidyUpAgo(iso, finished + 30_000)).toBe('just now');
    expect(tidyUpAgo(iso, finished + 5 * 60_000)).toBe('5 min ago');
    expect(tidyUpAgo(iso, finished + 2 * 3_600_000)).toBe('2 h ago');
    expect(tidyUpAgo(iso, finished + 30 * 3_600_000)).toBe('yesterday');
  });
});

describe('bubbleFor (the C.4 table, as the boards write it)', () => {
  const base: BubbleInput = {
    state: 'waiting',
    pending: 3,
    offline: false,
    error: false,
    editingPins: false,
    lastFinished: null,
  };

  it('Waiting: the count and a Tidy up link', () => {
    const parts = bubbleFor(base);
    expect(text(parts)).toBe(
      '3 things in your inbox. Tidy up when you have added everything.',
    );
    expect(links(parts)).toEqual(['tidy-up:Tidy up']);
    expect(text(bubbleFor({ ...base, pending: 1 }))).toBe(
      '1 thing in your inbox. Tidy up when you have added everything.',
    );
  });

  it('Editing pins: the count alone', () => {
    expect(text(bubbleFor({ ...base, editingPins: true }))).toBe(
      '3 things in your inbox.',
    );
  });

  it('Empty: the welcome', () => {
    expect(text(bubbleFor({ ...base, state: 'empty', pending: 0 }))).toBe(
      'Welcome. Add a few things from your phone or your Drive, then tap Tidy up once. I file them where they belong; you can always ask me for more.',
    );
  });

  it('Running: how many, how long, keep adding', () => {
    expect(text(bubbleFor({ ...base, state: 'running' }))).toBe(
      "Tidying up 3 things. Takes a few minutes; I'll say when I'm done. You can keep adding.",
    );
  });

  it('Done: what it filed and answered, and See what I did (no destinations)', () => {
    const parts = bubbleFor({
      ...base,
      state: 'done',
      pending: 0,
      lastFinished: DONE_RUN,
    });
    expect(text(parts)).toBe(
      'All tidy. 3 filed and 1 question answered. See what I did.',
    );
    expect(links(parts)).toEqual(['activity:See what I did']);
    expect(
      text(
        bubbleFor({
          ...base,
          state: 'done',
          lastFinished: run('done', ['0-Inbox/a.pdf']),
        }),
      ),
    ).toBe('All tidy. 1 filed. See what I did.');
    expect(
      text(bubbleFor({ ...base, state: 'done', lastFinished: run('done') })),
    ).toBe('All tidy. Nothing new this time. See what I did.');
  });

  describe('Done with a report that says where things went (#617)', () => {
    const files = [
      '0-Inbox/a.pdf',
      '0-Inbox/b.pdf',
      '0-Inbox/c.pdf',
      '0-Inbox/d.pdf',
      '0-Inbox/e.pdf',
    ];
    const filed: Run = {
      ...run('done', files),
      items: files.map((path) => ({
        path,
        kind: 'file' as const,
        to: `1-Projects/Flat hunt/${path.slice(8)}`,
      })),
    };

    it('says how many were filed, what Bower added, and links to Just filed', () => {
      const parts = bubbleFor({
        ...base,
        state: 'done',
        pending: 0,
        lastFinished: { ...filed, added: 'I added bike times to the flats' },
      });
      expect(text(parts)).toBe(
        'All tidy. 5 filed, and I added bike times to the flats. See where they went.',
      );
      expect(links(parts)).toEqual(['just-filed:See where they went']);
    });

    it('drops the clause when the report has no added', () => {
      const parts = bubbleFor({
        ...base,
        state: 'done',
        pending: 0,
        lastFinished: filed,
      });
      expect(text(parts)).toBe('All tidy. 5 filed. See where they went.');
      expect(links(parts)).toEqual(['just-filed:See where they went']);
    });

    it('the Last tidy-up line counts what is new to you', () => {
      expect(lastTidyUpLine(filed, 4)).toBe('5 filed · 4 new to you');
      expect(lastTidyUpLine(filed, 0)).toBe('5 filed');
    });
  });

  it('Done: adds what the run set aside or had refused (spec A.3/A.5)', () => {
    const parts = bubbleFor({
      ...base,
      state: 'done',
      lastFinished: { ...DONE_RUN, quarantined: ['a'], refused: ['b', 'c'] },
    });
    expect(text(parts)).toBe(
      'All tidy. 3 filed and 1 question answered. See what I did. ' +
        `${quarantinedMessage(1)} ${refusedMessage(2)}`,
    );
  });

  it('Failed: the reason in words, nothing was lost, and Try again opens the failure (#316)', () => {
    const parts = bubbleFor({
      ...base,
      state: 'failed',
      lastFinished: {
        state: 'failed',
        requestedAt: '2026-01-01T00:00:00.000Z',
        error: 'sync up: copy failed',
        reason: 'drive_unavailable',
      },
    });
    expect(text(parts)).toBe(
      'Google Drive stopped answering half way through copying things back. Nothing was lost; your 3 things are still in the inbox. Try again.',
    );
    expect(text(parts)).not.toContain('sync up');
    expect(links(parts)).toEqual(['failure:Try again']);
    expect(text(bubbleFor({ ...base, state: 'failed', pending: 1 }))).toBe(
      'Something went wrong before Bower could finish. Nothing was lost; your 1 thing is still in the inbox. Try again.',
    );
  });

  it('Loading: never the Empty welcome (#322)', () => {
    expect(text(bubbleFor({ ...base, state: 'loading', pending: 0 }))).toBe(
      'Looking for what is waiting for you.',
    );
  });

  it('offline and a failed listing come first', () => {
    expect(text(bubbleFor({ ...base, offline: true, error: true }))).toBe(
      "No signal here. I'll keep an eye out.",
    );
    expect(text(bubbleFor({ ...base, error: true }))).toBe(
      'Could not load your notes.',
    );
  });
});

describe('birdStateFor and restingBird', () => {
  const base: { state: HomeState; offline: boolean; justDone: boolean } = {
    state: 'waiting',
    offline: false,
    justDone: false,
  };

  it("holds the boards' pose per state", () => {
    expect(birdStateFor(base)).toBe('looking');
    expect(birdStateFor({ ...base, state: 'empty' })).toBe('hello');
    expect(birdStateFor({ ...base, state: 'running' })).toBe('tidying');
    expect(birdStateFor({ ...base, state: 'done', justDone: true })).toBe(
      'showoff',
    );
    expect(birdStateFor({ ...base, state: 'done' })).toBe('looking');
    expect(birdStateFor({ ...base, state: 'failed' })).toBe('confused');
    expect(birdStateFor({ ...base, state: 'loading' })).toBe('looking');
  });

  it('offline beats every state: the sad pose next to the greeting (#325)', () => {
    const states: HomeState[] = [
      'waiting',
      'empty',
      'running',
      'done',
      'failed',
    ];
    for (const state of states) {
      expect(birdStateFor({ ...base, state, offline: true })).toBe('offline');
      expect(
        birdStateFor({ ...base, state, offline: true, justDone: true }),
      ).toBe('offline');
    }
  });

  it('the dance and the hello play once, then rest on Looking', () => {
    expect(restingBird('showoff')).toBe('looking');
    expect(restingBird('hello')).toBe('looking');
    expect(restingBird('confused')).toBe('confused');
  });
});

describe('inboxLine', () => {
  it('per state, as the boards write it', () => {
    expect(inboxLine('waiting', 3)).toBe('waiting to be filed');
    expect(inboxLine('running', 3)).toBe('Tidying up…');
    expect(inboxLine('failed', 3)).toBe('still waiting');
    expect(inboxLine('done', 0)).toBe('Nothing waiting. Add something.');
    expect(inboxLine('empty', 0)).toBe('Nothing waiting. Add something.');
  });
});
