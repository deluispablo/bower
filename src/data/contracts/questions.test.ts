/**
 * What a question is about (`contracts/questions.ts`): a pair of notes Bower asks to keep as one is a typed subject,
 * its two notes by their file ids (c3-pair-ask, TL-P4-16 addendum). An older question naming both notes as [[links]]
 * still reads as a pair, by those names (a tolerant reader); the accepted app's merge question names no note and stays
 * the folder's own.
 */
import { describe, expect, it } from 'vitest';
import { answerRun } from '../answer-loop';
import { subjectOf } from './questions';
import type { Question } from './types';

const PAIR: Question = { id: 'q-pair-note-a.note-b', text: 'Flat 3, 12 Larkspur Lane and Flat 3 (second) look like one flat. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: 1 };
const OLD: Question = { id: 'q-merge-flat-3', text: '[[Flat 3 (second)]] looks like [[Flat 3, 12 Larkspur Lane]]. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: 1 };
const ACCEPTED: Question = { id: 'q1', text: 'Flat 3, 12 Larkspur Lane and the new Wrenfield Road listing look like the same building. Keep one note for both?', yes: 'Yes, merge', no: 'No, keep both', about: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', askedAt: 1 };

describe('question subjects', () => {
  it('a pair question has a typed two-note subject', () => {
    // Its two notes by their file ids, never by words in its text; a yes starts a run of your changes and notes.
    expect(subjectOf(PAIR)).toEqual({ kind: 'pair', by: 'id', notes: ['note-a', 'note-b'] });
    expect(answerRun(PAIR, true)).toEqual({ scope: 'instructions' });
    expect(answerRun(PAIR, false)).toBeNull();
    // An older question in the text form still reads as a pair, by the two names it links, and settles the same way.
    expect(subjectOf(OLD)).toEqual({ kind: 'pair', by: 'name', notes: ['Flat 3 (second)', 'Flat 3, 12 Larkspur Lane'] });
    expect(answerRun(OLD, true)).toEqual({ scope: 'instructions' });
    // The accepted app's question names no note: the folder's own, answered at the next tidy-up.
    expect(subjectOf(ACCEPTED)).toEqual({ kind: 'folder' });
    expect(answerRun(ACCEPTED, true)).toBeNull();
    // Malformed pair ids are not pairs.
    expect(subjectOf({ ...PAIR, id: 'q-pair-note-a.note-a' }).kind).toBe('folder');
    expect(subjectOf({ ...PAIR, id: 'q-pair-note-a' }).kind).toBe('folder');
  });
});
