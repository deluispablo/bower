import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  REPORT_PATH,
  checkWhen,
  findReport,
  findingsIn,
  fixMessage,
  hasUrgentFinding,
  healthRowSubtitle,
  isReportNew,
  reportDateLabel,
  reportDayStart,
  summarise,
} from '../src/health-report.js';
import { relativeTime } from '../src/navigation.js';
import { parseFrontmatter } from '../src/markdown/frontmatter.js';
import { buildVaultIndex } from '../src/vault-index.js';

/** A realistic `Lint Report.md`, the fixture `summarise`/`findingsIn` tests against. */
const REPORT_FIXTURE = `---
notes: 184
findings: 3
brokenLinks: 1
---

Sunday's check.

## To fix
- [ ] 2 notes without tags: Trip to Lisbon, Car insurance renewal
- [ ] Duplicate: "Sourdough" and "Sourdough starter" — same recipe, two notes
- [ ] Broken link in Weeknight curry: [[Flour type]] does not exist
`;

function note(path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return {
    id: `id-${path}`,
    name,
    mimeType: 'text/markdown',
    parents: ['PARENT'],
    path,
    modifiedTime: '2026-06-07T06:30:00.000Z',
  };
}

describe('findReport', () => {
  it('finds the report at the top of the folder', () => {
    const index = buildVaultIndex([note('index.md'), note(REPORT_PATH)]);

    expect(findReport(index)?.path).toBe('Lint Report.md');
  });

  it('ignores a file with the same name inside a subfolder', () => {
    const index = buildVaultIndex([note('3-Resources/Lint Report.md')]);

    expect(findReport(index)).toBeUndefined();
  });
});

describe('isReportNew', () => {
  const modified = '2026-06-07T06:30:00.000Z';

  it('is new when the screen was opened before the report changed', () => {
    expect(isReportNew(modified, '2026-06-01T10:00:00.000Z')).toBe(true);
  });

  it('is not new when the screen was opened after the report changed', () => {
    expect(isReportNew(modified, '2026-06-07T09:00:00.000Z')).toBe(false);
  });

  it('is not new when opened at exactly the report’s time', () => {
    expect(isReportNew(modified, modified)).toBe(false);
  });

  it('is new when the screen was never opened', () => {
    expect(isReportNew(modified, '')).toBe(true);
  });

  it('is never new without a report or with an unreadable time', () => {
    expect(isReportNew(undefined, '')).toBe(false);
    expect(isReportNew('not-a-date', '')).toBe(false);
  });
});

describe('summarise', () => {
  it('reads the three figures from the frontmatter', () => {
    const report = parseFrontmatter(REPORT_FIXTURE);

    expect(summarise(report)).toEqual({
      notes: 184,
      findings: 3,
      brokenLinks: 1,
    });
  });

  it('is undefined for a report with no frontmatter yet — hide the figures, never show zeros as fact', () => {
    const report = parseFrontmatter('Nothing to report.');

    expect(summarise(report)).toBeUndefined();
  });

  it('is undefined for an empty report', () => {
    expect(summarise(parseFrontmatter(''))).toBeUndefined();
  });

  it('is undefined when the frontmatter has other keys but none of the three', () => {
    const report = parseFrontmatter('---\ntags: [meta]\n---\nBody.');

    expect(summarise(report)).toBeUndefined();
  });

  it('never returns a negative or non-finite count', () => {
    const report = parseFrontmatter(
      '---\nnotes: -3\nfindings: not-a-number\n---\nBody.',
    );

    expect(summarise(report)).toEqual({
      notes: 0,
      findings: 0,
      brokenLinks: 0,
    });
  });
});

describe('findingsIn', () => {
  it('reads the checklist items from the fixture, splitting off a detail after the colon', () => {
    const report = parseFrontmatter(REPORT_FIXTURE);

    expect(findingsIn(report.body)).toEqual([
      {
        text: '2 notes without tags',
        detail: 'Trip to Lisbon, Car insurance renewal',
      },
      {
        text: 'Duplicate',
        detail: '"Sourdough" and "Sourdough starter" — same recipe, two notes',
      },
      {
        text: 'Broken link in Weeknight curry',
        detail: '[[Flour type]] does not exist',
      },
    ]);
  });

  it('is empty for a report with no checklist', () => {
    expect(findingsIn('Nothing to fix.')).toEqual([]);
  });

  it('keeps a checklist item with no colon as text only', () => {
    expect(findingsIn('- [ ] Everything looks fine')).toEqual([
      { text: 'Everything looks fine' },
    ]);
  });

  it('never splits on a colon inside a **bold** title, even one with no other colon to split on', () => {
    // #492: the old naive first-colon split cut this mid-span, leaving
    // "**Orphan file" as the title and "<path>.**" as the detail.
    expect(
      findingsIn(
        '- [ ] **Orphan file: 2-Areas/Trips/old-plan.md** nothing links to it',
      ),
    ).toEqual([
      {
        text: '**Orphan file: 2-Areas/Trips/old-plan.md** nothing links to it',
      },
    ]);
  });

  it('never splits on a colon inside an hh:mm time in the detail', () => {
    // #492: "…14:44…" used to split into text "…14" and detail "44…".
    expect(
      findingsIn(
        '- [ ] **Stale move**: last touched 2026-09-27 14:44, nothing links to it',
      ),
    ).toEqual([
      {
        text: '**Stale move**',
        detail: 'last touched 2026-09-27 14:44, nothing links to it',
      },
    ]);
  });

  it('renders one card with a clean bold title and the full detail when both a colon-bearing bold title and a time share one item', () => {
    expect(
      findingsIn(
        '- [ ] **Orphan file: 2-Areas/Trips/old-plan.md** last touched 2026-09-27 14:44: nothing links to it.',
      ),
    ).toEqual([
      {
        text: '**Orphan file: 2-Areas/Trips/old-plan.md** last touched 2026-09-27 14:44',
        detail: 'nothing links to it.',
      },
    ]);
  });
});

describe('reportDateLabel', () => {
  it('formats a valid Drive timestamp in English, regardless of locale', () => {
    expect(reportDateLabel('2026-06-07T06:30:00.000Z')).toBe('Jun 7');
  });

  it('never falls back to the device locale for the month name', () => {
    // December: the month most likely to differ from an English label if
    // this ever regresses to `toLocaleDateString`.
    expect(reportDateLabel('2026-12-25T00:00:00.000Z')).toBe('Dec 25');
  });

  it('is empty for an unreadable date', () => {
    expect(reportDateLabel('not-a-date')).toBe('');
  });
});

describe('reportDayStart', () => {
  // Built from local `Date` components throughout, never a hardcoded UTC
  // offset, so these hold regardless of the machine's timezone.
  it('rounds a Drive timestamp down to local midnight', () => {
    const modified = new Date(2026, 8, 27, 23, 40).toISOString();
    expect(reportDayStart(modified)).toBe(new Date(2026, 8, 27).toISOString());
  });

  it('is empty for an unreadable date', () => {
    expect(reportDayStart('not-a-date')).toBe('');
  });

  it('makes a late-Sunday report read "yesterday" on Monday morning, not "today" (#447)', () => {
    // The report was written late Sunday; Home renders early Monday, well
    // under 24 rolling hours later — `relativeTime` on the raw timestamp
    // would say "today" here, which is the bug.
    const sunday = new Date(2026, 8, 27, 23, 40).toISOString();
    const mondayMorning = new Date(2026, 8, 28, 7, 0).getTime();
    expect(relativeTime(sunday, mondayMorning)).toBe('today');
    expect(relativeTime(reportDayStart(sunday), mondayMorning)).toBe(
      'yesterday',
    );
  });

  it('still reads "today" for a report made earlier the same calendar day', () => {
    const morning = new Date(2026, 8, 28, 7, 0).toISOString();
    const evening = new Date(2026, 8, 28, 20, 0).getTime();
    expect(relativeTime(reportDayStart(morning), evening)).toBe('today');
  });
});

describe('fixMessage', () => {
  it('names the report date', () => {
    expect(fixMessage('Jun 7')).toBe(
      'Fix what the health check from Jun 7 found',
    );
  });

  it('falls back when there is no date to name', () => {
    expect(fixMessage('')).toBe('Fix what the health check found');
  });
});

describe('healthRowSubtitle', () => {
  it('names the day and the count, plural', () => {
    expect(healthRowSubtitle(2)).toBe('Checked Sunday · 2 small things to fix');
  });

  it('singular for one', () => {
    expect(healthRowSubtitle(1)).toBe(
      'Checked Sunday · one small thing to fix',
    );
  });

  it('says the notes are in good shape at zero', () => {
    expect(healthRowSubtitle(0)).toBe(
      'Checked Sunday · your notes are in good shape',
    );
  });

  it('never claims a count before the report has loaded', () => {
    expect(healthRowSubtitle(undefined)).toBe('Not checked yet');
  });

  it('never returns a day together with "not checked yet" (#584)', () => {
    for (const when of ['Today', 'Yesterday', 'Last Wednesday', 'Sep 20']) {
      const line = healthRowSubtitle(undefined, when);
      expect(line).toBe('Not checked yet');
      expect(line).not.toContain(when);
    }
  });

  it('takes the shared "when" label instead of a hardcoded day (#496)', () => {
    expect(healthRowSubtitle(2, 'Last Wednesday')).toBe(
      'Checked last Wednesday · 2 small things to fix',
    );
    expect(healthRowSubtitle(3, 'Yesterday')).toBe(
      'Checked yesterday · 3 small things to fix',
    );
  });
});

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]; // prettier-ignore

describe('checkWhen', () => {
  it('is "Today" for a report from earlier the same day', () => {
    const modifiedTime = new Date(2026, 8, 27, 8, 0).toISOString();
    const now = new Date(2026, 8, 27, 20, 0).getTime();
    expect(checkWhen(modifiedTime, now)).toBe('Today');
  });

  it('is "Yesterday" for a report one calendar day back', () => {
    const modifiedTime = new Date(2026, 8, 27, 8, 0).toISOString();
    const now = new Date(2026, 8, 28, 9, 0).getTime();
    expect(checkWhen(modifiedTime, now)).toBe('Yesterday');
  });

  it('names the weekday for a report 2-6 days back', () => {
    const modifiedTime = new Date(2026, 8, 27, 8, 0).toISOString();
    const now = new Date(2026, 8, 30, 9, 0).getTime();
    const weekday = WEEKDAYS[new Date(2026, 8, 27).getDay()];
    expect(checkWhen(modifiedTime, now)).toBe(`Last ${weekday}`);
  });

  it('falls back to the calendar date at a week or more', () => {
    const modifiedTime = new Date(2026, 8, 27, 8, 0).toISOString();
    const now = new Date(2026, 9, 5, 9, 0).getTime();
    expect(checkWhen(modifiedTime, now)).toBe('Sep 27');
  });

  it('is "Sunday" for an unreadable date', () => {
    expect(checkWhen('not-a-date', Date.now())).toBe('Sunday');
  });
});

describe('the Notes row and the Health bubble read the same "when" (#496)', () => {
  it('agree on one fixture date instead of "Sunday" next to a real date', () => {
    const modifiedTime = new Date(2026, 8, 27, 8, 0).toISOString();
    const now = new Date(2026, 8, 28, 9, 0).getTime();

    const when = checkWhen(modifiedTime, now);

    expect(when).toBe('Yesterday');
    expect(healthRowSubtitle(2, when)).toBe(
      'Checked yesterday · 2 small things to fix',
    );
  });
});

describe('hasUrgentFinding', () => {
  it('is true when a finding is titled "Urgent: …"', () => {
    expect(
      hasUrgentFinding([{ text: 'Urgent: possible secret in Rules.md' }]),
    ).toBe(true);
  });

  it('is false when nothing is urgent', () => {
    expect(hasUrgentFinding([{ text: '2 notes without tags' }])).toBe(false);
  });

  it('is false for an empty findings list', () => {
    expect(hasUrgentFinding([])).toBe(false);
  });
});
