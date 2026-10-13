import { BowerError } from './types';
/** The one tag grammar (B7): a canonical slug of 1-40 characters; `.bower/tags.json` is the per-folder list. */
export const TAG_MAX = 40;
/** Per note, and the list size past which it stays readable but stops growing. */
export const NOTE_TAGS_MAX = 3;
export const TAG_LIST_MAX = 30;

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Space, case and underscore spellings dedupe to one slug; anything unsafe gives null. */
export function normalizeTag(candidate: string): string | null {
  const slug = candidate.trim().toLowerCase().replace(/[ _]+/g, '-').replace(/-{2,}/g, '-');
  return slug.length <= TAG_MAX && SLUG.test(slug) ? slug : null;
}

/** A canonical, distinct list: the whole-file validity rule (no cap here, so a list over 30 stays readable). */
export const tagListOk = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((t) => typeof t === 'string' && normalizeTag(t) === t) && new Set(v).size === v.length;

export type TagVocabulary = { tags: string[]; growth: boolean };

/**
 * The one reader of `.bower/tags.json` (stored bytes or null): missing is empty with growth on; an invalid file
 * disables tags for the run (empty, growth off): one BowerError, its cause the details, is logged with
 * `console.error` and returned, bytes untouched; over 30 stays readable with growth frozen.
 */
export function readTagList(bytes: string | null): TagVocabulary & { error?: BowerError } {
  if (bytes === null) return { tags: [], growth: true };
  try {
    const parsed: unknown = JSON.parse(bytes);
    const list = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Reflect.get(parsed, 'v') === 1 ? Reflect.get(parsed, 'tags') : undefined;
    if (tagListOk(list)) return { tags: list, growth: list.length <= TAG_LIST_MAX };
    throw new Error('The tag list has an entry that is not a canonical tag, or is not a version 1 list.');
  } catch (cause) {
    const error = new BowerError('unknown', 'Bower could not read your tag list, so it will not use tags this time.', undefined, { cause });
    console.error(error);
    return { tags: [], growth: false, error };
  }
}
