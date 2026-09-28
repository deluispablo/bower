import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  REPORT_PATH,
  findReport,
  findingsIn,
  fixMessage,
  healthRowSubtitle,
  isReportNew,
  reportDateLabel,
  summarise,
} from '../src/health-report.js';
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
    expect(healthRowSubtitle(2)).toBe('Sunday · 2 small things to fix');
  });

  it('singular for one', () => {
    expect(healthRowSubtitle(1)).toBe('Sunday · one small thing to fix');
  });

  it('says the notes are in good shape at zero', () => {
    expect(healthRowSubtitle(0)).toBe('Sunday · your notes are in good shape');
  });

  it('never claims a count before the report has loaded', () => {
    expect(healthRowSubtitle(undefined)).toBe('Sunday · not checked yet');
  });
});
