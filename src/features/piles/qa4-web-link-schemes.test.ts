/**
 * qa4-web-link-schemes (qa-4 Claude F8): a pasted link is a web address only over http or https, the two schemes a
 * saved link opens with (`savedLinkUrl`). Any other scheme is refused, so Add link and "Paste a link" in a pile show
 * "That is not a web address. Check it and try again." A mail address became https://mailto:…@host, a web address
 * with a user name; a pasted web address never carries one.
 */
import { describe, expect, it } from 'vitest';
import { normaliseLink } from './link';

describe('qa4-web-link-schemes: only http and https are web addresses', () => {
  it.each(['ftp://x.example/z', 'FTP://files.example/lease.pdf', 'file://alex.example/home/lease.pdf', 'ws://chat.example/room', 'gopher://old.example/1'])(
    'AC1 other-scheme-refused: %s is not a web address',
    (pasted) => {
      expect(normaliseLink(pasted)).toBeNull();
    },
  );

  it.each(['mailto:alex@example.com', 'https://alex:secret@flat-listing.example/7'])(
    'AC2 no-credentials: %s is not a web address (a name or password before the host)',
    (pasted) => {
      expect(normaliseLink(pasted)).toBeNull();
    },
  );

  it('R3 web-kept: http, https and a bare address are web addresses, as before', () => {
    expect(normaliseLink('http://flat-listing.example/7')).toBe('http://flat-listing.example/7');
    expect(normaliseLink('HTTPS://Flat-Listing.example/7')).toBe('https://flat-listing.example/7');
    expect(normaliseLink('flat-listing.example/7')).toBe('https://flat-listing.example/7');
    expect(normaliseLink('flat-listing.example:8080/7')).toBe('https://flat-listing.example:8080/7');
  });
});
