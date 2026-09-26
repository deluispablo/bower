import { describe, expect, it } from 'vitest';

/**
 * Secret hygiene audit: no `console.*` call in the Worker's source may log
 * a variable whose name suggests a token, key, email or cookie. Quoted
 * words inside a message (`'revoke failed'`, `'no token'`) are fine; an
 * argument or `${interpolation}` naming such a variable is not.
 *
 * The sources are read through Vite's `import.meta.glob` with `?raw`,
 * because workerd has no `node:fs`.
 */

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string,
      options: { query: string; import: string; eager: true },
    ): Record<string, T>;
  }
}

const SOURCES = import.meta.glob<string>('../src/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Lower-case fragments that make an identifier unsafe to log. */
const BANNED = [
  'token',
  'secret',
  'key',
  'email',
  'refresh',
  'apikey',
  'accesstoken',
  'cookie',
];

type Frame = { kind: 'code'; depth: number } | { kind: 'template' };

/**
 * Reads a call's arguments from `start` (just after its opening
 * parenthesis) to the matching `)`. Returns the code only: the text of
 * quoted strings and template literals is dropped, while `${...}`
 * interpolations are kept.
 */
function readArguments(source: string, start: number): string {
  const stack: Frame[] = [{ kind: 'code', depth: 0 }];
  let code = '';
  let i = start;
  while (i < source.length) {
    const frame = stack[stack.length - 1];
    const ch = source[i];
    if (frame === undefined || ch === undefined) break;
    if (frame.kind === 'template') {
      if (ch === '\\') {
        i += 2;
      } else if (ch === '`') {
        stack.pop();
        code += ' ';
        i += 1;
      } else if (ch === '$' && source[i + 1] === '{') {
        stack.push({ kind: 'code', depth: 0 });
        code += ' ';
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      i += 1;
      while (i < source.length && source[i] !== ch) {
        i += source[i] === '\\' ? 2 : 1;
      }
      code += ' ';
      i += 1;
      continue;
    }
    if (ch === '`') {
      stack.push({ kind: 'template' });
      i += 1;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      frame.depth += 1;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (frame.depth === 0) {
        // The call's own `)`, or the `}` closing a `${` interpolation.
        if (stack.length === 1) return code;
        stack.pop();
        code += ' ';
        i += 1;
        continue;
      }
      frame.depth -= 1;
    }
    code += ch;
    i += 1;
  }
  return code;
}

/** Identifiers logged by `console.log/error/warn/info/debug` calls in `source` that match `BANNED`. */
function unsafeLogIdentifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(
    /console\.(?:log|error|warn|info|debug)\(/g,
  )) {
    const code = readArguments(source, match.index + match[0].length);
    for (const identifier of code.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      const lower = identifier.toLowerCase();
      if (BANNED.some((word) => lower.includes(word))) found.push(identifier);
    }
  }
  return found;
}

describe('log hygiene checker', () => {
  it('flags interpolated or passed variables with sensitive names', () => {
    expect(unsafeLogIdentifiers('console.log(`got ${accessToken}`);')).toEqual([
      'accessToken',
    ]);
    expect(
      unsafeLogIdentifiers("console.error('failed', user.email);"),
    ).toEqual(['email']);
    expect(
      unsafeLogIdentifiers('console.warn(`x ${fmt(refreshToken)} y`, 1);'),
    ).toEqual(['refreshToken']);
    expect(
      unsafeLogIdentifiers("console.log(c.req.header('cookie'), apiKey);"),
    ).toEqual(['apiKey']);
  });

  it('allows the words inside quoted messages', () => {
    expect(
      unsafeLogIdentifiers(
        "console.error('revoke failed: token rejected', err.code);",
      ),
    ).toEqual([]);
    expect(
      unsafeLogIdentifiers(
        'console.error(`[${requestId}] no refresh token: ${err.message}`);',
      ),
    ).toEqual([]);
    expect(unsafeLogIdentifiers('console.log("a \\" email", count);')).toEqual(
      [],
    );
  });
});

describe('Worker source', () => {
  it('is found by the glob', () => {
    expect(Object.keys(SOURCES)).toContain('../src/index.ts');
  });

  it('never logs a token, key, secret, email or cookie variable', () => {
    const violations = Object.entries(SOURCES).flatMap(([path, source]) =>
      unsafeLogIdentifiers(source).map(
        (identifier) => `${path}: ${identifier}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});
