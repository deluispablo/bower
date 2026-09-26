/**
 * Frontmatter: the YAML block between `---` lines at the top of a note.
 * Parses the subset notes actually use: `key: value` scalars, quoted strings,
 * inline lists `[a, b]`, block lists (`- item`), nested mappings and `|`/`>`
 * block text. Anything else keeps its raw text. Never throws.
 */

export interface Frontmatter {
  data: Record<string, unknown>;
  /** The note without its frontmatter. */
  body: string;
}

interface Read<T> {
  value: T;
  /** Text after the closing quote or bracket. */
  rest: string;
}

function setKey(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  // defineProperty keeps a `__proto__` key an ordinary own property.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function isComment(line: string): boolean {
  return line.trimStart().startsWith('#');
}

/** Drops a trailing ` # comment` from an unquoted value. */
function stripComment(text: string): string {
  const match = /[ \t]#/.exec(text);
  return (match === null ? text : text.slice(0, match.index)).trimEnd();
}

/** Nothing, or only a comment, after a quoted string or a list. */
function isEndOfValue(rest: string): boolean {
  const trimmed = rest.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

const DOUBLE_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '0': '\0',
  b: '\b',
  f: '\f',
  '"': '"',
  '\\': '\\',
  '/': '/',
  ' ': ' ',
};

function readDoubleQuoted(text: string): Read<string> | null {
  let value = '';
  for (let i = 1; i < text.length; i++) {
    const char = text.charAt(i);
    if (char === '"') return { value, rest: text.slice(i + 1) };
    if (char !== '\\') {
      value += char;
      continue;
    }
    const next = text.charAt(i + 1);
    const hexLength =
      next === 'x' ? 2 : next === 'u' ? 4 : next === 'U' ? 8 : 0;
    const hex = text.slice(i + 2, i + 2 + hexLength);
    if (hexLength > 0 && new RegExp(`^[0-9a-fA-F]{${hexLength}}$`).test(hex)) {
      const code = Number.parseInt(hex, 16);
      value += code <= 0x10ffff ? String.fromCodePoint(code) : hex;
      i += 1 + hexLength;
      continue;
    }
    value += DOUBLE_ESCAPES[next] ?? next;
    i++;
  }
  return null;
}

function readSingleQuoted(text: string): Read<string> | null {
  let value = '';
  for (let i = 1; i < text.length; i++) {
    const char = text.charAt(i);
    if (char !== "'") {
      value += char;
      continue;
    }
    if (text.charAt(i + 1) === "'") {
      value += "'";
      i++;
      continue;
    }
    return { value, rest: text.slice(i + 1) };
  }
  return null;
}

function readQuoted(text: string): Read<string> | null {
  return text.startsWith('"') ? readDoubleQuoted(text) : readSingleQuoted(text);
}

/** `true`, `false`, `null`, plain numbers; everything else stays a string. */
function parseScalar(text: string): unknown {
  if (/^(?:true|True|TRUE)$/.test(text)) return true;
  if (/^(?:false|False|FALSE)$/.test(text)) return false;
  if (/^(?:null|Null|NULL|~)?$/.test(text)) return null;
  // No leading zeros: `007` or a postcode stays text.
  if (/^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function parseFlowItem(text: string): unknown {
  if (text.startsWith('"') || text.startsWith("'")) {
    const quoted = readQuoted(text);
    return quoted !== null && quoted.rest.trim() === '' ? quoted.value : text;
  }
  // `[[Note]]` unquoted inside a list is a wikilink, not a nested list.
  if (/^!?\[\[[^[\]]*\]\]$/.test(text)) return text;
  if (text.startsWith('[')) {
    const list = readFlowList(text);
    return list !== null && list.rest.trim() === '' ? list.value : text;
  }
  return parseScalar(text);
}

/** Reads `[a, "b, c", [d]]` from its opening bracket. */
function readFlowList(text: string): Read<unknown[]> | null {
  const items: unknown[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  const push = (last: boolean): void => {
    const item = current.trim();
    current = '';
    if (item === '' && last) return;
    items.push(parseFlowItem(item));
  };

  for (let i = 1; i < text.length; i++) {
    const char = text.charAt(i);
    if (quote !== null) {
      current += char;
      if (char === '\\' && quote === '"') {
        current += text.charAt(i + 1);
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === '[' || char === '{') {
      depth++;
      current += char;
    } else if ((char === ']' || char === '}') && depth > 0) {
      depth--;
      current += char;
    } else if (char === ']') {
      push(true);
      return { value: items, rest: text.slice(i + 1) };
    } else if (char === ',' && depth === 0) {
      push(false);
    } else {
      current += char;
    }
  }
  return null;
}

/** The value after `key:` on the same line. */
function parseInlineValue(raw: string): unknown {
  const text = raw.trim();
  if (text.startsWith('"') || text.startsWith("'")) {
    const quoted = readQuoted(text);
    return quoted !== null && isEndOfValue(quoted.rest) ? quoted.value : text;
  }
  if (text.startsWith('[')) {
    const list = readFlowList(text);
    return list !== null && isEndOfValue(list.rest) ? list.value : text;
  }
  // Flow mappings are not supported: keep the text.
  if (text.startsWith('{')) return stripComment(text);
  return parseScalar(stripComment(text));
}

/** Splits `key: value`; the key ends at the first `:` followed by a space. */
function splitKeyValue(line: string): [string, string] | null {
  const match = /^([^\s#-][^\n]*?)[ \t]*:(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
  if (match === null) return null;
  let key = (match[1] ?? '').trim();
  if (key.startsWith('"') || key.startsWith("'")) {
    const quoted = readQuoted(key);
    if (quoted !== null && quoted.rest.trim() === '') key = quoted.value;
  }
  return [key, match[2] ?? ''];
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter((line) => !isBlank(line)).map(indentOf);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(Math.min(min, indentOf(line))));
}

function parseBlockText(style: string, lines: string[]): string {
  const text = dedent(lines);
  while (text.length > 0 && isBlank(text[text.length - 1] ?? '')) text.pop();
  if (style.startsWith('|')) return text.join('\n');
  return text
    .join('\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.replace(/\n/g, ' '))
    .join('\n');
}

function parseBlockList(lines: string[]): unknown[] {
  const items: unknown[] = [];
  for (const line of dedent(lines)) {
    if (isBlank(line) || isComment(line)) continue;
    // A continuation line belongs to the previous item: keep it raw.
    if (!/^-(?:[ \t]|$)/.test(line)) {
      const last = items.pop();
      items.push(
        `${typeof last === 'string' ? last : String(last)} ${line.trim()}`,
      );
      continue;
    }
    const item = line.slice(1).trim();
    // `- key: value` (a list of mappings) keeps the raw text.
    const quotedOrList = /^["'[]/.test(item);
    items.push(
      quotedOrList || splitKeyValue(item) === null
        ? parseInlineValue(item)
        : item,
    );
  }
  return items;
}

function parseMapping(lines: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    i++;
    if (isBlank(line) || isComment(line) || indentOf(line) > 0) continue;
    const pair = splitKeyValue(line);
    // Malformed line: skip it and keep going.
    if (pair === null) continue;
    const [key, rest] = pair;

    const children: string[] = [];
    while (i < lines.length) {
      const next = lines[i] ?? '';
      const listItem = rest === '' && /^-(?:[ \t]|$)/.test(next);
      if (!isBlank(next) && indentOf(next) === 0 && !listItem) break;
      children.push(next);
      i++;
    }
    const content = children.filter(
      (child) => !isBlank(child) && !isComment(child),
    );

    if (/^[|>][-+0-9]*$/.test(rest.trim())) {
      setKey(data, key, parseBlockText(rest.trim(), children));
    } else if (rest !== '') {
      setKey(data, key, parseInlineValue(rest));
    } else if (content.length === 0) {
      setKey(data, key, null);
    } else if (/^-(?:[ \t]|$)/.test((content[0] ?? '').trimStart())) {
      setKey(data, key, parseBlockList(content));
    } else {
      setKey(data, key, parseMapping(dedent(content)));
    }
  }
  return data;
}

/** Tags from a list or a space/comma separated string, without `#`. */
export function normalizeTags(value: unknown): string[] {
  const parts: string[] = [];
  const add = (item: unknown): void => {
    if (typeof item === 'string') parts.push(...item.split(/[\s,]+/));
    else if (typeof item === 'number' || typeof item === 'boolean') {
      parts.push(String(item));
    }
  };
  if (Array.isArray(value)) value.forEach(add);
  else add(value);

  const tags: string[] = [];
  for (const part of parts) {
    const tag = part.trim().replace(/^#+/, '');
    if (tag !== '' && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/**
 * Splits a note into its frontmatter and body. `tags`, when present, is
 * normalised to `string[]`. No frontmatter, or no closing `---`, gives empty
 * data and the whole text as the body.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const lines = source.split(/\r?\n/);
  if ((lines[0] ?? '').trimEnd() !== '---') return { data: {}, body: text };

  const end = lines.findIndex(
    (line, i) =>
      i > 0 && (line.trimEnd() === '---' || line.trimEnd() === '...'),
  );
  if (end < 0) return { data: {}, body: text };

  const data = parseMapping(lines.slice(1, end));
  if (Object.prototype.hasOwnProperty.call(data, 'tags')) {
    setKey(data, 'tags', normalizeTags(data.tags));
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}
