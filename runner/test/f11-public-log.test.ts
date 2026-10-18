import { homedir, tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BowerError } from '../../src/data/types';
import { installPublicLog, publicLine, publicationFailedLine } from '../src/main';

const home = homedir().replace(/\/+$/, '');

afterEach(() => vi.restoreAllMocks());

describe('F11 public log', () => {
  it('an Error prints its message only: no stack line, no home directory', () => {
    const line = publicLine(new Error('x'));
    expect(line).toBe('x');
    expect(line).not.toMatch(/\bat /);
    expect(line).not.toContain(home);
  });

  it('an ENOENT under the home directory shows … instead of the path; a longer prefix wins', () => {
    const e = Object.assign(new Error(`ENOENT: no such file or directory, open '${home}/Made-up/notes.md'`), { code: 'ENOENT' });
    expect(publicLine(e)).toBe("ENOENT: no such file or directory, open '…/Made-up/notes.md'");
    const t = tmpdir().replace(/\/+$/, '');
    expect(publicLine(new Error(`open ${t}/x`))).toBe('open …/x');
  });

  it('rewrites only at a path boundary', () => {
    expect(publicLine(new Error(`${home}2/x and ${home}`))).toBe(`${home}2/x and …`);
  });

  it('BowerError: message (code); with a cause: message: cause message, paths hidden in both', () => {
    expect(publicLine(new BowerError('offline', 'Could not reach Drive.'))).toBe('Could not reach Drive. (offline)');
    const e = new BowerError('offline', `Failed at ${home}/a`, undefined, { cause: new Error(`bad ${home}/b`) });
    expect(publicLine(e)).toBe('Failed at …/a (offline): bad …/b');
    expect(publicLine(new Error('top', { cause: new Error('why') }))).toBe('top: why');
  });

  it('the installed wrapper prints an Error argument, later ones too, as its public line; others pass through', () => {
    const seen = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(seen);
    const restore = installPublicLog();
    const ticket = { ticket: 'MADE_UP_TICKET', toString: () => { throw new Error('stringified'); } };
    console.error('text', new Error(`boom ${home}/x`));
    console.error(ticket, 3);
    restore();
    expect(console.error).toBe(spy);
    expect(seen.mock.calls[0]).toEqual(['text', 'boom …/x']);
    expect(seen.mock.calls[1]?.[0]).toBe(ticket);
    expect(seen.mock.calls[1]?.[1]).toBe(3);
  });

  it('a run end why and error print with no stack', () => {
    const seen = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(seen);
    const restore = installPublicLog();
    console.error(new BowerError('offline', 'The tidy-up stopped.'));
    console.error('The tidy-up stopped before changing anything.');
    restore();
    expect(seen.mock.calls.map((c) => c.join(' ')).join('\n')).not.toMatch(/\bat |\n\s+at /);
  });

  it('the question-publication failure is one line with no stack and keeps its prefix', () => {
    const line = publicationFailedLine(new Error(`503 server-busy at ${home}/x`));
    expect(line.startsWith('Live question publication failed; the next status report will carry the snapshot again. ')).toBe(true);
    expect(line).toContain('503 server-busy at …/x');
    expect(line).not.toMatch(/\n|\sat \S+ \(/);
  });
});
