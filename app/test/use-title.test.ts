import { describe, expect, it } from 'vitest';

import { documentTitle, titleForPath } from '../src/use-title.js';
import { fileTitle } from '../src/vault-index.js';

describe('documentTitle', () => {
  it('adds the app name', () => {
    expect(documentTitle('Privacy')).toBe('Privacy · Bower');
  });

  it('keeps the bare app name and blank names', () => {
    expect(documentTitle('Bower')).toBe('Bower');
    expect(documentTitle('  ')).toBe('Bower');
  });
});

describe('titleForPath', () => {
  it('names the static screens', () => {
    expect(titleForPath('/login')).toBe('Sign in · Bower');
    expect(titleForPath('/privacy')).toBe('Privacy · Bower');
    expect(titleForPath('/settings')).toBe('Settings · Bower');
    expect(titleForPath('/')).toBe('Home · Bower');
  });

  it('ignores a query and a trailing slash', () => {
    expect(titleForPath('/welcome?from=login')).toBe('Welcome · Bower');
    expect(titleForPath('/terms/')).toBe('Terms · Bower');
  });

  it('names the demo sign-in page differently', () => {
    expect(titleForPath('/login', true)).toBe('Run your own · Bower');
  });

  it('leaves named routes to their own screen', () => {
    expect(titleForPath('/note/abc')).toBeNull();
    expect(titleForPath('/folder/Projects')).toBeNull();
    expect(titleForPath('/learn')).toBeNull();
    expect(titleForPath('/learn/flat-hunt')).toBeNull();
  });

  it('calls an unknown path a missing page', () => {
    expect(titleForPath('/nope')).toBe('Page not found · Bower');
  });
});

describe('a file page tab (#922)', () => {
  it('reads the display name without its extension', () => {
    expect(documentTitle(fileTitle('Passport copy.pdf'))).toBe(
      'Passport copy · Bower',
    );
  });
});
