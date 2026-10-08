import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

describe('markSeen reports its errors', () => {
  it('Replay markSeen errors are reported to user', () => {
    // markSeen errors in Replay.tsx should be caught and reported to the user
    // Not silently swallowed with void runs.markSeen()
    const filename = fileURLToPath(import.meta.url);
    const replayPath = join(dirname(filename), 'Replay.tsx');
    const source = readFileSync(replayPath, 'utf-8');

    // Check that markSeen errors are handled with report()
    // Currently code uses void runs.markSeen() which swallows errors
    const hasProperErrorHandling = /runs\.markSeen.*\)\.catch|report.*markSeen/.test(source);
    expect(hasProperErrorHandling).toBe(true);
  });

  it('NoteScreen markSeen errors are reported to user', () => {
    // markSeen errors in NoteScreen.tsx should include report() for user-facing message
    // Not just logged to console.error
    const filename = fileURLToPath(import.meta.url);
    const noteScreenPath = join(dirname(filename), '../note/NoteScreen.tsx');
    const source = readFileSync(noteScreenPath, 'utf-8');

    // Check that markSeen error handling includes report() call
    const hasProperErrorHandling = /markSeen.*report|report.*markSeen/.test(source);
    expect(hasProperErrorHandling).toBe(true);
  });
});
