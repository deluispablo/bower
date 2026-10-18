import { describe, expect, it } from 'vitest';
import { webSource } from '@/data/contracts/links';

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

  it.each([
    'http://example.com',
    'https://example.com/report.pdf',
    'https://example.com/report.url',
    'https://example.com/?download=report.url',
    'https://example.com?q=x',
    'https://example.com:8443/path',
    'https://example.com#Section',
    'HTTPS://Example.com/Path?Key=Value#Section',
    'http://localhost:8080/path',
    'http://[::1]/path',
  ])('supports a full HTTP(S) URL: %s', (source) => {
    expect(webSource(`  ${source}  `)).toEqual({ href: source, label: source.replace(/^https?:\/\//i, '') });
  });

  it.each([
    'flat-listing.example',
    'example.com/path',
    'example.com?q=x',
    'example.com#section',
    'example.com/path?q=x#section',
  ])('supports a bare host with a path, query or fragment: %s', (source) => {
    expect(webSource(`  ${source}  `)).toEqual({ href: `https://${source}`, label: source });
  });

  it.each([
    'example.com/report.pdf',
    'flat-listing.example.url?x=1#section',
    'example.com:8443/path',
    '/example.com',
    '//example.com',
    '/example.com#section',
    '//example.com#section',
    'https://',
    'https://?q=x',
    'https://example.com:bad/path',
    'https://exa mple.com',
    'https://example.com/a b',
    'https://example.com/a\nb',
    'example.com/a b',
    'example.com?q=a b',
  ])('does not classify a local target or unsupported address as web: %s', (source) => {
    expect(webSource(source)).toBeNull();
  });
});
