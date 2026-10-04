import type { PileItem } from '@/data/types';

/**
 * The line under a thing in a pile. A percentage shows only while a big file
 * reports real progress; a small one goes in one go, so it just says Sending….
 */
export function itemLine(it: PileItem): string {
  if (it.upload === undefined) return it.origin;
  if (it.upload < 0) return "Didn't arrive";
  return it.upload > 0 && it.upload < 0.99 ? `Sending… ${Math.round(it.upload * 100)}%` : 'Sending…';
}
