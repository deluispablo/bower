// @vitest-environment jsdom

/**
 * Health's report screen (#305): the three figures come from the
 * frontmatter and are hidden — never shown as zeros — on a report from
 * before the runner wrote them (#295); each finding goes through the same
 * Markdown renderer and sanitiser as a note, so `**bold**`, backticks and a
 * broken wikilink show as formatted HTML rather than literal source; and
 * the "good shape" wording is driven by the findings actually listed on
 * the screen, not by the frontmatter count, so it still reads right on an
 * old report with no figures at all.
 *
 * `summarise`/`findingsIn` as pure functions are `health-report.test.ts`'s
 * concern; the pointer to Bower's suggestions is `suggested-rules.test.tsx`'s.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { REPORT_PATH } from '../src/health-report.js';
import { buildVaultIndex } from '../src/vault-index.js';

function file(path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return {
    id: `id-${path}`,
    name,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: '2026-06-07T06:30:00.000Z',
  };
}

const REPORT_WITH_COUNTS = `---
notes: 12
findings: 2
brokenLinks: 1
---

Sunday's check.

## To fix
- [ ] **Two notes** without tags: Trip to Lisbon, \`Car insurance renewal\`
- [ ] Broken link: [[Nonexistent note]] does not exist
`;

const REPORT_NO_FRONTMATTER = `Sunday's check.

## To fix
- [ ] One thing to fix, from before the runner wrote the counts
`;

const REPORT_ALL_CLEAR = `---
notes: 6
findings: 0
brokenLinks: 0
---

Sunday's check. Nothing to report.
`;

let reportText = REPORT_WITH_COUNTS;
const getNoteText = vi.fn<(id: string) => Promise<string>>(() =>
  Promise.resolve(reportText),
);

const vault = vi.hoisted(() => ({ hasReport: true }));

vi.mock('../src/vault-store.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/vault-store.js')>();
  const index = buildVaultIndex([file(REPORT_PATH)]);
  const empty = buildVaultIndex([]);
  return {
    ...original,
    useVault: () => ({
      index: vault.hasReport ? index : empty,
      status: 'idle',
      error: undefined,
      getNoteText,
    }),
  };
});

const { Health } = await import('../src/routes/health.js');

let root: HTMLDivElement;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function mount(): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Health, {}), root);
  });
  await flush();
}

// Pinned well past the fixtures' 7 June 2026 modified time (#496: the
// bubble's wording depends on how long ago that is), so it never drifts
// with the real clock the suite happens to run under.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 28, 12, 0));
});

afterEach(() => {
  render(null, root);
  root.remove();
  getNoteText.mockClear();
  vault.hasReport = true;
  Reflect.deleteProperty(window, 'matchMedia');
  vi.useRealTimers();
});

describe('Health: the report screen', () => {
  it('shows the three figures from the frontmatter', async () => {
    reportText = REPORT_WITH_COUNTS;
    await mount();

    const figures = Array.from(root.querySelectorAll('.health-figure')).map(
      (el) => el.textContent,
    );
    expect(figures).toEqual(['12notes', '2to fix', '1broken links']);
  });

  it('renders findings through the note renderer: bold, code and a broken wikilink as HTML, never the raw source', async () => {
    reportText = REPORT_WITH_COUNTS;
    await mount();

    const [first, second] = root.querySelectorAll('.health-finding');
    expect(first?.querySelector('.health-finding-text')?.innerHTML).toContain(
      '<strong>Two notes</strong>',
    );
    expect(first?.querySelector('.health-finding-detail')?.innerHTML).toContain(
      '<code>Car insurance renewal</code>',
    );
    expect(
      second
        ?.querySelector('.health-finding-detail')
        ?.querySelector('span.wikilink-missing')?.textContent,
    ).toBe('Nonexistent note');
    expect(root.textContent).not.toContain('**');
    expect(root.textContent).not.toContain('[[');
  });

  it('hides the figures, not zeros, for a report with no counts yet — the findings list still comes from the checklist', async () => {
    reportText = REPORT_NO_FRONTMATTER;
    await mount();

    expect(root.querySelectorAll('.health-figure')).toHaveLength(0);
    expect(root.querySelectorAll('.health-finding')).toHaveLength(1);
  });

  it('says "good shape" only when there is nothing to fix, and drops the fix button', async () => {
    reportText = REPORT_ALL_CLEAR;
    await mount();

    expect(root.querySelector('.health-bubble')?.textContent).toBe(
      'the Jun 7 check. Your notes are in good shape.',
    );
    expect(root.querySelector('.health-fix-button')).toBeNull();
  });

  it('says how many small things when there are findings, and keeps the fix button', async () => {
    reportText = REPORT_WITH_COUNTS;
    await mount();

    expect(root.querySelector('.health-bubble')?.textContent).toBe(
      'the Jun 7 check. Your notes are in good shape, 2 small things to fix.',
    );
    expect(root.querySelector('.health-fix-button')).not.toBeNull();
  });

  it('drops "good shape" when a finding is Urgent, whatever the count (#496)', async () => {
    reportText = `---
notes: 12
findings: 1
brokenLinks: 0
---

## To fix
- [ ] Urgent: possible secret in \`Rules.md\`
`;
    await mount();

    expect(root.querySelector('.health-bubble')?.textContent).toBe(
      'the Jun 7 check. one small thing to fix.',
    );
  });

  it('names the relative day, not the date, for a report from this past week', async () => {
    reportText = `---
notes: 12
findings: 0
brokenLinks: 0
---

Sunday's check.
`;
    // The mocked report's `modifiedTime` is fixed to 7 June 2026 in the
    // fixture files above; move "now" one day later so the bubble reads
    // the relative label instead of falling back to the date.
    vi.setSystemTime(new Date(2026, 5, 8, 9, 0));
    await mount();

    expect(root.querySelector('.health-bubble')?.textContent).toBe(
      "Yesterday's check. Your notes are in good shape.",
    );
  });

  it('explains itself in one paragraph at the top', async () => {
    reportText = REPORT_WITH_COUNTS;
    await mount();

    expect(root.querySelector('.health-explainer')?.textContent).toContain(
      'Every Sunday Bower reads through your notes',
    );
  });

  it('says when the first check comes, not how often (#1004)', async () => {
    vault.hasReport = false;
    await mount();
    expect(root.textContent).toContain(
      'No health check yet. Next check: Sunday.',
    );
    expect(root.textContent).not.toContain('Runs every Sunday.');
  });

  it('has no way back to the phone-only Folders tab on desktop (#1004)', async () => {
    reportText = REPORT_WITH_COUNTS;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query === '(min-width: 900px)',
        media: query,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
      }),
    });
    await mount();
    expect(
      root.querySelector('.page-header-crumbs a[href="/notes"]'),
    ).toBeNull();
  });

  it('keeps Folders in the header on the phone', async () => {
    reportText = REPORT_WITH_COUNTS;
    await mount();
    expect(
      root.querySelector('.page-header-crumbs a[href="/notes"]'),
    ).not.toBeNull();
  });
});
