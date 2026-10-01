// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BowerNoteBox,
  NOTE_FOLDED_KEY,
  boxParts,
  checkItems,
  countPoints,
  foldedLine,
  readingRequest,
  readingText,
  ruleChange,
  takeCheckSection,
  updatedWhen,
  verdictRow,
  whoFor,
} from '../src/components/bower-note-box.js';
import type { RequestRow } from '../src/bower-tab.js';
import { kindById } from '../src/kinds.js';
import { noteMetaFrom } from '../src/note-meta.js';
import { currentToast, dismissToast } from '../src/toast-store.js';

vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ index: null, getNoteText: () => Promise.resolve('') }),
}));

const TOP =
  '<div class="bower-note"><div class="bower-note-head">' +
  '<div class="bower-note-title">Bower\'s note</div>' +
  '<div class="bower-note-legend">· from <em class="bower-legend-file">the file</em>, <em class="bower-legend-notes">your notes</em></div></div>' +
  '<ul class="bower-note-rows">' +
  '<li class="bower-note-row"><span class="bower-origin bower-origin-file"></span><div class="bower-note-text">Pays 72,000 a year.</div></li>' +
  '<li class="bower-note-row bower-note-check"><span class="bower-origin bower-origin-notes"></span><div class="bower-note-text">Ten minutes by bike.</div><span class="bower-note-word">Check</span></li>' +
  '</ul></div>\n';

const OFFER: Record<string, unknown> = {
  kind: 'job-offer',
  salary: 72000,
  score: 79,
  not_stated: ['bonus', 'notice_period'],
};

let host: HTMLElement;
const writeText = vi.fn<(text: string) => Promise<void>>();

function mount(
  frontmatter: Record<string, unknown>,
  checkSection: string[] = [],
  path = 'Areas/Offer.md',
): void {
  void act(() => {
    render(
      h(BowerNoteBox, { html: TOP, frontmatter, checkSection, path }),
      host,
    );
  });
}

const foldButton = (): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>('.bower-note-box-fold');

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  localStorage.clear();
  writeText.mockReset();
  writeText.mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  void act(() => {
    render(null, host);
  });
  host.remove();
  dismissToast();
});

function boxRows(html: string): string {
  return boxParts(html).rows;
}

describe('pure helpers', () => {
  it('takes the top box apart and drops its own title', () => {
    const parts = boxParts(TOP);
    expect(parts.rows).toContain('bower-note-rows');
    expect(parts.legend).toContain('from');
    expect(parts.rows + parts.legend).not.toContain('bower-note-title');
    expect(boxParts('<p>nothing</p>')).toEqual({
      legend: '',
      rows: '',
      joined: '',
    });
  });

  it('reads the note\'s own "What to check" section and removes it', () => {
    const html =
      '<h2>Terms</h2><p>x</p><h2>What to check</h2><ul><li>Bonus</li><li>Notice</li></ul><p>after</p>';
    const out = takeCheckSection(html);
    expect(out.items).toEqual(['Bonus', 'Notice']);
    expect(out.rest).not.toContain('What to check');
    expect(out.rest).toContain('after');
    expect(takeCheckSection('<p>none</p>')).toEqual({
      items: [],
      rest: '<p>none</p>',
    });
  });

  it('names the check items from not_stated, one question per item', () => {
    const kind = kindById('job-offer');
    const meta = noteMetaFrom(OFFER);
    const out = checkItems(kind, meta, []);
    expect(out.items).toHaveLength(2);
    expect(out.questions).toHaveLength(2);
    expect(checkItems(kind, meta, ['Ask about the start date']).items).toEqual([
      'Ask about the start date',
    ]);
  });

  it('says who the questions go to', () => {
    expect(whoFor(kindById('job-offer'))).toBe('the employer');
    expect(whoFor(kindById('rental-listing'))).toBe('the agent');
    expect(whoFor(undefined)).toBe('the agent');
  });

  it('writes the rule-change line only when bower_change is there', () => {
    const now = new Date(2026, 8, 29, 10);
    expect(ruleChange({}, now)).toBeNull();
    expect(ruleChange({ bower_updated: '2026-09-29' }, now)).toBeNull();
    expect(
      ruleChange(
        {
          bower_updated: '2026-09-29',
          bower_change: 'your rule now asks for 70, not 80.',
          bower_before: 'Your rule asked for 80.',
        },
        now,
      ),
    ).toEqual({
      line: 'Updated today · your rule now asks for 70, not 80.',
      before: 'Your rule asked for 80.',
    });
    expect(updatedWhen('2026-09-28', now)).toBe('28 Sep');
  });
});

describe('BowerNoteBox (issue #757)', () => {
  it('draws the still mark by its name, or a posed bird when asked (#918)', () => {
    mount({});
    const head = (): Element | null =>
      host.querySelector('.bower-note-box-head');
    expect(head()?.querySelector('svg.b.mark')).not.toBeNull();
    void act(() => {
      render(
        h(BowerNoteBox, { html: TOP, frontmatter: {}, headBird: 'reading' }),
        host,
      );
    });
    expect(head()?.querySelector('svg.b.mark')).toBeNull();
    expect(head()?.querySelector('svg.b.p-read')).not.toBeNull();
  });

  it('is open by default with every section, in order', () => {
    mount(OFFER);
    const head = foldButton();
    expect(head?.tagName).toBe('BUTTON');
    expect(head?.getAttribute('aria-label')).toBe("Fold Bower's note");
    expect(head?.getAttribute('aria-expanded')).toBe('true');
    const controls = head?.getAttribute('aria-controls') ?? '';
    expect(host.querySelector(`[id="${controls}"]`)).not.toBeNull();
    const titles = [...host.querySelectorAll('.bower-box-title')].map(
      (node) => node.textContent,
    );
    expect(titles.slice(0, 2)).toEqual(['Summary', 'Key facts']);
    expect(titles[titles.length - 1]).toBe('What to check');
    expect(host.querySelectorAll('.bower-note-row')).toHaveLength(2);
    expect(host.querySelector('.bower-origin-notes')).not.toBeNull();
    expect(host.querySelector('.bower-note-word')?.textContent).toBe('Check');
    // The key facts appear once, with the score tile first.
    expect(host.querySelectorAll('.key-facts')).toHaveLength(1);
    expect(host.querySelector('.key-fact-pill')?.textContent).toBe('79');
  });

  it('folds to one 52 px row and remembers it per note (#908, R-NOTEBOX-2)', async () => {
    mount(OFFER);
    await act(() => {
      foldButton()?.click();
    });
    expect(localStorage.getItem(NOTE_FOLDED_KEY)).toBe(
      JSON.stringify(['Areas/Offer.md']),
    );
    expect(foldButton()?.getAttribute('aria-expanded')).toBe('false');
    expect(
      host.querySelector('.bower-note-box-body')?.hasAttribute('hidden'),
    ).toBe(true);
    // Points and what to check only: no score or facts (G-18).
    const line = host.querySelector(
      '.bower-note-box-head .bower-note-box-line',
    );
    expect(line?.textContent).toBe('2 points · 1 to check');
    expect(
      host.querySelector('.bower-note-box-head .key-fact-pill'),
    ).toBeNull();

    // The same note mounted later is still folded; another note is open.
    await act(() => {
      render(null, host);
    });
    mount(OFFER);
    expect(foldButton()?.getAttribute('aria-expanded')).toBe('false');
    await act(() => {
      render(null, host);
    });
    mount(OFFER, [], 'Areas/Other.md');
    expect(foldButton()?.getAttribute('aria-expanded')).toBe('true');
  });

  it('writes the folded row: "3 points · 1 to check", no " · 0 to check"', () => {
    expect(foldedLine(3, 1)).toBe('3 points · 1 to check');
    expect(foldedLine(3, 0)).toBe('3 points');
    expect(foldedLine(1, 0)).toBe('1 point');
    const rows = boxRows(TOP);
    expect(countPoints(rows)).toEqual({ points: 2, toCheck: 1 });
    expect(countPoints('')).toEqual({ points: 0, toCheck: 0 });
  });

  it('has no fold control with fold={false} and stays open', () => {
    localStorage.setItem(NOTE_FOLDED_KEY, JSON.stringify(['Areas/Offer.md']));
    void act(() => {
      render(
        h(BowerNoteBox, {
          html: TOP,
          frontmatter: OFFER,
          path: 'Areas/Offer.md',
          fold: false,
        }),
        host,
      );
    });
    expect(foldButton()).toBeNull();
    expect(
      host.querySelector('.bower-note-box-body')?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('shows the blue line and "Before today" only when asked', async () => {
    mount({
      ...OFFER,
      bower_updated: '2026-09-28',
      bower_change: 'your job-offer rule now asks for 70, not 80.',
      bower_before: 'Your rule asked for 80.',
    });
    expect(
      host.querySelector('.bower-note-box-updated-line')?.textContent,
    ).toContain(
      'Updated 28 Sep · your job-offer rule now asks for 70, not 80.',
    );
    expect(host.textContent).not.toContain('Before today');
    await act(() => {
      host.querySelector<HTMLButtonElement>('.bower-note-box-changed')?.click();
    });
    expect(host.textContent).toContain('Before today');
    expect(host.textContent).toContain('Your rule asked for 80.');
  });

  it('shows no blue line without the frontmatter', () => {
    mount(OFFER);
    expect(host.querySelector('.bower-note-box-updated')).toBeNull();
  });

  it('copies one question per line and says so', async () => {
    mount(OFFER);
    await act(() => {
      host.querySelector<HTMLButtonElement>('.bower-note-box-copy')?.click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect((writeText.mock.calls[0]?.[0] ?? '').split('\n')).toHaveLength(2);
    expect(currentToast()?.message).toBe('Copied 2 questions');
    expect(host.querySelector('.bower-note-box-copy')?.textContent).toBe(
      'Copy as questions for the employer',
    );
  });

  it('says so when the clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    mount(OFFER);
    await act(() => {
      host.querySelector<HTMLButtonElement>('.bower-note-box-copy')?.click();
    });
    expect(currentToast()?.message).toBe(
      "Bower couldn't copy that. Try again.",
    );
  });

  it('shows no What to check without anything to check', () => {
    mount({ kind: 'job-offer', salary: 72000 });
    expect(host.querySelector('.bower-note-box-check')).toBeNull();
    expect(host.querySelector('.bower-note-box-line')).toBeNull();
  });
});

describe('Bower reads inside the note box (issue #784, R-BIRD-10)', () => {
  const NOTE = 'Housing/Offer.md';
  const SINCE = '2026-09-29T10:00:00.000Z';
  const row = (state: RequestRow['state']): RequestRow => ({
    key: 'a',
    state,
    text: `Move “Offer” (${NOTE}) to Jobs.`,
    kind: 'job',
    since: SINCE,
    fileId: null,
  });
  const at = (minutes: number): number => Date.parse(SINCE) + minutes * 60_000;

  function mountReading(
    requests: RequestRow[],
    extra: Partial<Parameters<typeof BowerNoteBox>[0]> = {},
  ): void {
    void act(() => {
      render(
        h(BowerNoteBox, {
          html: TOP,
          frontmatter: OFFER,
          path: NOTE,
          requests,
          ...extra,
        }),
        host,
      );
    });
  }

  it('finds a fresh running request for this path only', () => {
    expect(readingRequest([row('tidying')], NOTE, at(1))?.row.state).toBe(
      'tidying',
    );
    expect(readingRequest([row('waiting')], NOTE, at(1))).toBeNull();
    expect(readingRequest([row('done')], NOTE, at(1))).toBeNull();
    expect(readingRequest([row('tidying')], 'Other.md', at(1))).toBeNull();
  });

  it('drops out after 10 minutes without an update', () => {
    expect(readingRequest([row('tidying')], NOTE, at(9.9))).not.toBeNull();
    expect(readingRequest([row('tidying')], NOTE, at(10))).toBeNull();
    // A later update keeps it going.
    expect(
      readingRequest(
        [row('tidying')],
        NOTE,
        at(12),
        new Date(at(5)).toISOString(),
      ),
    ).not.toBeNull();
  });

  it('writes the line for the kind and up to two sources', () => {
    const offer = kindById('job-offer');
    expect(readingText(offer, ['your CV'])).toBe(
      'Reading the offer and your CV. About a minute; you can keep reading.',
    );
    expect(readingText(offer)).toBe(
      'Reading the offer. About a minute; you can keep reading.',
    );
    expect(readingText(offer, ['your CV', 'your notes', 'a third'])).toContain(
      'and your CV and your notes.',
    );
    expect(readingText(kindById('rental-listing'))).toContain('the listing');
    expect(readingText(undefined)).toContain('the document');
  });

  it('shows the reading bird and status instead of the content', () => {
    mountReading([row('tidying')], {
      sources: ['your CV'],
      updatedAt: new Date().toISOString(),
    });
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toContain(
      'Reading the offer and your CV. About a minute; you can keep reading.',
    );
    expect(host.textContent).toContain('Writing now');
    expect(host.querySelector('.bower-note-box-facts-block')).toBeNull();
    expect(host.querySelector('.bower-origin')).toBeNull();
  });

  it('shows the normal box when the request is not running', () => {
    mountReading([row('done')]);
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('.key-facts')).not.toBeNull();
  });
});

describe('the verdict row (issue #792, R-VERDICT-1, R-VERDICT-4)', () => {
  it('needs a score (or fit) and a verdict, both from the frontmatter', () => {
    expect(verdictRow({ score: 79, verdict: 'Apply first' })).toEqual({
      score: '79',
      tone: 'good',
      verdict: 'Apply first',
    });
    expect(verdictRow({ fit: '55', verdict: 'Worth a look' })?.tone).toBe(
      'fair',
    );
    expect(verdictRow({ score: 79 })).toBeNull();
    expect(verdictRow({ verdict: 'Skip' })).toBeNull();
    expect(verdictRow({ score: 'high', verdict: 'Skip' })).toBeNull();
  });

  it('shows the row and does not repeat the score as a key fact tile', () => {
    mount({ ...OFFER, verdict: 'Apply first' });
    const row = host.querySelector('.bower-note-box-verdict');
    expect(row?.textContent).toBe('79Apply first');
    expect(host.querySelector('.key-facts .key-fact-pill')).toBeNull();
    expect(host.querySelector('.key-facts')?.textContent).toContain('72,000');
  });

  it('keeps the score tile and shows no row without a verdict', () => {
    mount(OFFER);
    expect(host.querySelector('.bower-note-box-verdict')).toBeNull();
    expect(host.querySelector('.key-facts .key-fact-pill')).not.toBeNull();
  });
});
