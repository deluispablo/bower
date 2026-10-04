import { describe, expect, it } from 'vitest';
import { normaliseLink } from './link';

describe('a pasted link', () => {
  it('gets https:// when it has no scheme', () => {
    expect(normaliseLink('example.com/x')).toBe('https://example.com/x');
    expect(normaliseLink('  http://a.example ')).toBe('http://a.example/');
  });
  it('refuses what is not a link', () => {
    expect(normaliseLink('hello')).toBeNull();
    expect(normaliseLink('two words.com')).toBeNull();
    expect(normaliseLink('')).toBeNull();
  });
});
