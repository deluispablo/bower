import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { REPORT_PATH, findReport, isReportNew } from '../src/health-report.js';
import { buildVaultIndex } from '../src/vault-index.js';

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
