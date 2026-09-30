/** Frontmatter key helpers shared by Details and Compare (pure). */

/** Frontmatter keys Bower or Obsidian keep for themselves: never a "More"
 * field. */
export const BOOKKEEPING_KEYS: ReadonlySet<string> = new Set([
  'kind',
  'status',
  'original',
  'bower_origins',
  'not_stated',
  'tags',
  'tag',
  'aliases',
  'cssclasses',
  'title',
  'created',
  'updated',
  'date',
  'type',
  'source',
  'pages',
  // Bower's note box keeps these (R-INS-8, R-VERDICT-1). `score` and `fit`
  // stay readable by Compare and the front page; they are only kept out of
  // "More".
  'bower_updated',
  'bower_change',
  'bower_before',
  'by',
  'pile_note',
  'facts',
  'score',
  'verdict',
  'made_for',
]);

/** "pet_policy" as "Pet policy". */
export function humaniseKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
