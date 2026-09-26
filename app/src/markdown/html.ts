/** Small HTML helpers shared by the Markdown renderer. */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use in HTML content and double-quoted attributes. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Anchor slug of a heading, from its Markdown source: `## Frontmatter (YAML)`
 * → `frontmatter-yaml`. Wikilinks count by their display text.
 */
export function slugify(text: string): string {
  return text
    .replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * The sanitizer prefixes every `id` with `user-content-` so a note cannot
 * shadow document properties (DOM clobbering). Links to a heading must use
 * this prefixed form.
 */
export const HEADING_ID_PREFIX = 'user-content-';

/** Fragment (without `#`) that reaches a heading after sanitization. */
export function headingAnchor(heading: string): string {
  return HEADING_ID_PREFIX + slugify(heading);
}
