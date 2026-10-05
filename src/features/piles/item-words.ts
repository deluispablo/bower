import type { PileItem } from '@/data/types';
import { agoInSentence, plural } from '@/app/words';

/**
 * The line under a thing in a pile. A percentage shows only while a big file
 * reports real progress; a small one goes in one go, so it just says Sending….
 */
export function itemLine(it: PileItem): string {
  if (it.upload === undefined) return it.origin;
  if (it.upload < 0) return "Didn't arrive";
  return it.upload > 0 && it.upload < 0.99 ? `Sending… ${Math.round(it.upload * 100)}%` : 'Sending…';
}

/** The line under a pile's title: what it holds and the day it was added, as Home says it. */
export function pileLine(p: { things: number; onlyNote: boolean; createdAt: number }, now = Date.now()): string {
  const added = `added ${agoInSentence(p.createdAt, now)}`;
  return p.onlyNote ? `A note, ${added}. Bower files it as a note where it belongs.` : `${plural(p.things, 'thing')}, ${added}`;
}
