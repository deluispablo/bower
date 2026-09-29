import { describe, expect, it } from 'vitest';

import { addedLine } from '../src/components/folder-items.js';
import type { DriveFile } from '../src/drive.js';

function csv(appProperties?: Record<string, string>): DriveFile {
  return {
    id: 'id-budget',
    name: 'Budget.csv',
    mimeType: 'text/csv',
    parents: ['FOLDER_ID'],
    path: '2-Areas/Finance/Budget.csv',
    size: 3072,
    ...(appProperties !== undefined && { appProperties }),
  };
}

describe('addedLine', () => {
  it('says a CSV with a Google source is a copy of the Sheet', () => {
    expect(addedLine(csv({ bowerSource: 'SOURCE_ID' }), null, undefined)).toBe(
      'Spreadsheet (CSV) · copy of your Google Sheet',
    );
  });

  it('uses the kind word Spreadsheet (CSV) for a CSV with no source', () => {
    expect(addedLine(csv(), null, undefined)).toBe('Spreadsheet (CSV) · 3 KB');
  });
});
