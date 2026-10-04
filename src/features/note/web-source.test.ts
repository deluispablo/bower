import { describe, expect, it } from 'vitest';
import { webSource } from './web-source';

describe('a timeline source that is a web address', () => {
  it('a bare web address opens over https', () => {
    expect(webSource('flat-listing.example')).toEqual({ href: 'https://flat-listing.example', label: 'flat-listing.example' });
  });
  it('a full web address keeps its scheme and shows without it', () => {
    expect(webSource('https://flat-listing.example/listing/3?from=a')).toEqual({ href: 'https://flat-listing.example/listing/3?from=a', label: 'flat-listing.example/listing/3?from=a' });
    expect(webSource('http://flat-listing.example')).toEqual({ href: 'http://flat-listing.example', label: 'flat-listing.example' });
  });
  it('a saved link file (.url) or any other file is not a web address', () => {
    expect(webSource('flat-listing.example.url')).toBeNull();
    expect(webSource('Flat listing.url')).toBeNull();
    expect(webSource('Lease.pdf')).toBeNull();
    expect(webSource('Flat 3.md')).toBeNull();
  });
  it('nothing but http and https opens', () => {
    expect(webSource('javascript:alert(1)')).toBeNull();
    expect(webSource('ftp://files.example')).toBeNull();
  });
});
