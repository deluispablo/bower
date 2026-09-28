import { beforeEach, describe, expect, it, vi } from 'vitest';

const listFolder = vi.hoisted(() => vi.fn());
const getText = vi.hoisted(() => vi.fn());

vi.mock('../src/drive.js', () => ({
  FOLDER_MIME: 'application/vnd.google-apps.folder',
  listFolder,
  getText,
}));

import {
  clearFileFacts,
  parseFileFacts,
  readFileFacts,
} from '../src/file-facts.js';

const FOLDER = 'application/vnd.google-apps.folder';

describe('parseFileFacts', () => {
  it('reads pages, sheets and entries per path and ignores the key', () => {
    const facts = parseFileFacts(
      JSON.stringify({
        '3-Resources/a.pdf': { k: '1 2', pages: 42 },
        '3-Resources/b.xlsx': { k: '3 4', sheets: 3 },
        '3-Resources/c.zip': { k: '5 6', entries: 14 },
      }),
    );
    expect(facts.get('3-Resources/a.pdf')).toEqual({ pages: 42 });
    expect(facts.get('3-Resources/b.xlsx')).toEqual({ sheets: 3 });
    expect(facts.get('3-Resources/c.zip')).toEqual({ entries: 14 });
  });

  it('drops what is not the runner shape, entry by entry', () => {
    const facts = parseFileFacts(
      JSON.stringify({
        'a.pdf': { pages: '42' },
        'b.pdf': { pages: -1 },
        'c.pdf': 7,
        'd.pdf': null,
        'e.pdf': { pages: 3 },
      }),
    );
    expect([...facts.keys()]).toEqual(['e.pdf']);
  });

  it('reads nothing from text that is not an object', () => {
    expect(parseFileFacts('not json').size).toBe(0);
    expect(parseFileFacts('[1, 2]').size).toBe(0);
    expect(parseFileFacts('null').size).toBe(0);
  });
});

describe('readFileFacts', () => {
  beforeEach(() => {
    clearFileFacts();
    listFolder.mockReset();
    getText.mockReset();
  });

  it('reads the file once and keeps it', async () => {
    listFolder.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'ROOT'
          ? [{ id: 'DOT', name: '.bower', mimeType: FOLDER }]
          : [
              {
                id: 'F',
                name: 'file-facts.json',
                mimeType: 'application/json',
              },
            ],
      ),
    );
    getText.mockResolvedValue('{"a.pdf":{"pages":2}}');
    const first = await readFileFacts('ROOT');
    const second = await readFileFacts('ROOT');
    expect(first.get('a.pdf')).toEqual({ pages: 2 });
    expect(second).toBe(first);
    expect(getText).toHaveBeenCalledTimes(1);
  });

  it('reads as no facts when the folder or the file is not there', async () => {
    listFolder.mockResolvedValue([]);
    expect((await readFileFacts('ROOT')).size).toBe(0);
  });

  it('reads as no facts on a Drive failure, and tries again next time', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listFolder.mockRejectedValueOnce(new Error('offline'));
    expect((await readFileFacts('ROOT')).size).toBe(0);
    expect(log).toHaveBeenCalled();
    listFolder.mockResolvedValue([]);
    expect((await readFileFacts('ROOT')).size).toBe(0);
    expect(listFolder).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
