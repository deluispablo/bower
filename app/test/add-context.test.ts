import { afterEach, describe, expect, it, vi } from 'vitest';

import { setQueue, type QueueItem } from '../src/add-queue-store.js';
import type { DriveFile } from '../src/drive.js';

// #335: the one writer of Add's context note, shared by leaving Add and
// the tidy-up starting (`run-store.tsx`).
const createTextFile =
  vi.fn<
    (
      parentId: string,
      name: string,
      content: string,
      options?: unknown,
    ) => Promise<DriveFile>
  >();
const showToast = vi.fn();

vi.mock('../src/drive.js', () => ({
  INSTRUCTION_APP_PROPERTIES: { bower: 'instruction' },
  createTextFile,
}));
vi.mock('../src/toast-store.js', () => ({ showToast }));

const { getContextText, resetContext, setContextText, writeContextNote } =
  await import('../src/add-context.js');

function item(id: string, status: QueueItem['status']): QueueItem {
  return { id, kind: 'file', name: `${id}.pdf`, status, progress: 0 };
}

const written: DriveFile = {
  id: 'NOTE_ID',
  name: 'note.md',
  mimeType: 'text/markdown',
  parents: ['FOLDER_ID'],
  path: '0-Inbox/note.md',
};

describe('writeContextNote', () => {
  afterEach(() => {
    resetContext();
    setQueue([]);
    vi.clearAllMocks();
  });

  it('names only the rows already in the inbox, then clears the box', async () => {
    createTextFile.mockResolvedValue(written);
    setQueue([item('a', 'done'), item('b', 'failed'), item('c', 'done')]);
    setContextText('Translate these.');

    expect(await writeContextNote('FOLDER_ID')).toBe(true);
    const content = createTextFile.mock.calls[0]?.[2] ?? '';
    expect(content).toContain('- a.pdf\n- c.pdf\n');
    expect(content).not.toContain('b.pdf');
    expect(getContextText()).toBe('');
  });

  it('writes nothing without text, or without a new row', async () => {
    setQueue([item('a', 'done')]);
    expect(await writeContextNote('FOLDER_ID')).toBe(false);

    createTextFile.mockResolvedValue(written);
    setContextText('File these.');
    await writeContextNote('FOLDER_ID');
    setContextText('And these.');
    expect(await writeContextNote('FOLDER_ID')).toBe(false);
    expect(createTextFile).toHaveBeenCalledTimes(1);
  });

  it('puts the text back and says so when the write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createTextFile.mockRejectedValue(new Error('offline'));
    setQueue([item('a', 'done')]);
    setContextText('File these.');

    expect(await writeContextNote('FOLDER_ID')).toBe(false);
    expect(getContextText()).toBe('File these.');
    expect(showToast).toHaveBeenCalledWith(
      'Could not save what you wrote about these. Try again.',
    );
    expect(error).toHaveBeenCalled();

    // The batch was not claimed, so a retry names it again.
    createTextFile.mockResolvedValue(written);
    expect(await writeContextNote('FOLDER_ID')).toBe(true);
    error.mockRestore();
  });

  it('keeps a rule sentence in your rules before the note, and the note keeps it too (#435)', async () => {
    const order: string[] = [];
    createTextFile.mockImplementation(() => {
      order.push('note');
      return Promise.resolve(written);
    });
    const keepRule = vi.fn((sentence: string) => {
      order.push(`rule: ${sentence}`);
      return Promise.resolve('Garden');
    });
    setQueue([item('a', 'done')]);
    setContextText(
      'Receipts: add them to a table. From now on, file garden receipts under Garden.',
    );

    expect(await writeContextNote('FOLDER_ID', keepRule)).toBe(true);
    expect(order).toEqual([
      'rule: From now on, file garden receipts under Garden.',
      'note',
    ]);
    expect(createTextFile.mock.calls[0]?.[2]).toContain(
      'From now on, file garden receipts under Garden.',
    );
  });

  it('keeps nothing without a rule sentence, and writes the note when the rule fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createTextFile.mockResolvedValue(written);
    const keepRule = vi.fn(() => Promise.reject(new Error('conflict')));
    setQueue([item('a', 'done')]);
    setContextText('Translate these.');
    await writeContextNote('FOLDER_ID', keepRule);
    expect(keepRule).not.toHaveBeenCalled();

    setQueue([item('a', 'done'), item('b', 'done')]);
    setContextText('Always tag these #garden');
    expect(await writeContextNote('FOLDER_ID', keepRule)).toBe(true);
    expect(keepRule).toHaveBeenCalledWith('Always tag these #garden');
    expect(createTextFile).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith(
      'Could not add your rule yet. Bower still reads it.',
    );
    error.mockRestore();
  });
});
