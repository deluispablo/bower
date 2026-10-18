import type { PileItem } from '@/data/types';
import { agoInSentence, plural } from '@/app/words';

/**
 * The line under a thing in a pile. A percentage shows only while a big file
 * reports real progress; a small one goes in one go, so it just says Sending….
 */
export function itemLine(it: PileItem, originInHeading = false): string | null {
  // Not sent again: Drive has other bytes than were added.
  if (it.changed) return 'Changed';
  // The heading says where every thing came from: an arrived one has nothing more to say.
  if (it.upload === undefined) return originInHeading ? null : it.origin;
  // Its bytes are not on this device: only choosing the file again sends it.
  if (it.upload < 0) return it.chooseAgain && it.kind !== 'link' ? "Didn't arrive. Choose the file again." : "Didn't arrive";
  return it.upload > 0 && it.upload < 0.99 ? `Sending… ${Math.round(it.upload * 100)}%` : 'Sending…';
}

/** Where things came from, as it reads after a count ('9 things from your phone'); an origin not here is never collapsed. */
const HEADING_ORIGIN = new Map([
  ['From this device', 'from this device'],
  ['From the camera', 'from the camera'],
  ['Dropped here', 'dropped here'],
  ['A link you pasted', 'you pasted'],
  ['Added in Drive', 'from Drive'],
  ['From this computer', 'from this computer'],
  ['From your phone', 'from your phone'],
  ['From Mail', 'from Mail'],
  ['From the browser', 'from the browser'],
]);

/** The heading's phrase for the one origin every thing of a pile shares (on its way or not), or null. */
export function headingOrigin(items: PileItem[]): string | null {
  const origin = items[0]?.origin;
  if (origin === undefined || items.some((it) => it.origin !== origin)) return null;
  return HEADING_ORIGIN.get(origin) ?? null;
}

/** The line under a pile's title: what it holds, where it came from when all of it shares one origin, and the day it was added, as Home says it. */
export function pileLine(p: { things: number; onlyNote: boolean; createdAt: number; origin?: string | null }, now = Date.now()): string {
  const added = `added ${agoInSentence(p.createdAt, now)}`;
  if (p.onlyNote) return `A note, ${added}. Bower files it as a note where it belongs.`;
  // An empty pile says so (TL-P2-22).
  return p.things ? `${plural(p.things, 'thing')}${p.origin ? ` ${p.origin}` : ''}, ${added}` : `Nothing in it, ${added}`;
}
