/**
 * Markdown formatting for the note editor's toolbar (#50): pure text in,
 * text and selection out, so the `<textarea>` stays a plain textarea and
 * no editor library is needed.
 *
 * Bold, italic and link wrap the selection; heading, list and checkbox
 * prefix every line the selection touches.
 */

export type Format =
  'bold' | 'italic' | 'link' | 'heading' | 'list' | 'checkbox';

export interface Formatted {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const LINK_PLACEHOLDER = 'url';
const MAX_HEADING_LEVEL = 6;

function wrap(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
): Formatted {
  const selected = text.slice(start, end);
  return {
    text: text.slice(0, start) + before + selected + after + text.slice(end),
    selectionStart: start + before.length,
    selectionEnd: end + before.length,
  };
}

/** `[selection](url)`, with `url` selected so typing replaces it. */
function link(text: string, start: number, end: number): Formatted {
  const selected = text.slice(start, end);
  const before = `[${selected}](`;
  return {
    text:
      text.slice(0, start) + before + LINK_PLACEHOLDER + ')' + text.slice(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + LINK_PLACEHOLDER.length,
  };
}

/** The new start of `line`, or `null` to leave it as it is. */
type LinePrefixer = (line: string) => string | null;

const prefixers: Record<'heading' | 'list' | 'checkbox', LinePrefixer> = {
  // `# ` on a plain line; one level deeper on a heading, up to `######`.
  heading: (line) => {
    const level = /^(#{1,6}) /.exec(line)?.[1]?.length ?? 0;
    if (level === 0) return '# ';
    return level < MAX_HEADING_LEVEL ? '#' : null;
  },
  list: (line) => (/^\s*[-*+] /.test(line) ? null : '- '),
  checkbox: (line) => {
    if (/^\s*[-*+] \[[ xX]\] /.test(line)) return null;
    // A list item becomes a task rather than a list item inside a task.
    return /^\s*[-*+] /.test(line) ? '' : '- [ ] ';
  },
};

function prefixLines(
  text: string,
  start: number,
  end: number,
  prefixer: LinePrefixer,
): Formatted {
  const blockStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  // A selection ending right at the start of a line does not touch it.
  const lastChar = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const newline = text.indexOf('\n', lastChar);
  const blockEnd = newline === -1 ? text.length : newline;

  const lines = text.slice(blockStart, blockEnd).split('\n');
  const single = lines.length === 1;
  let shiftStart = 0;
  let shiftEnd = 0;
  let offset = blockStart;

  const changed = lines.map((line, i) => {
    const lineStart = offset;
    offset += line.length + 1;
    // Blank lines inside a multi-line selection stay blank.
    const skip = !single && line.trim() === '';
    const prefix = skip ? null : prefixer(line);
    if (prefix === null) return line;

    let next: string;
    if (prefix === '') {
      // Checkbox on a list item: insert `[ ] ` after the bullet.
      const bullet = /^\s*[-*+] /.exec(line)?.[0] ?? '';
      next = bullet + '[ ] ' + line.slice(bullet.length);
    } else {
      next = prefix + line;
    }
    const added = next.length - line.length;
    if (i === 0 && start >= lineStart) shiftStart = added;
    shiftEnd += added;
    return next;
  });

  return {
    text: text.slice(0, blockStart) + changed.join('\n') + text.slice(blockEnd),
    selectionStart: start + shiftStart,
    selectionEnd: end + shiftEnd,
  };
}

/**
 * `text` with `format` applied to the selection `[selectionStart,
 * selectionEnd)`, and where the selection should be afterwards. An empty
 * selection wraps nothing (the cursor lands between the markers) or
 * prefixes the cursor's line.
 */
export function applyFormat(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: Format,
): Formatted {
  const start = Math.max(
    0,
    Math.min(selectionStart, selectionEnd, text.length),
  );
  const end = Math.min(text.length, Math.max(selectionStart, selectionEnd));
  switch (format) {
    case 'bold':
      return wrap(text, start, end, '**', '**');
    case 'italic':
      return wrap(text, start, end, '*', '*');
    case 'link':
      return link(text, start, end);
    case 'heading':
    case 'list':
    case 'checkbox':
      return prefixLines(text, start, end, prefixers[format]);
  }
}
