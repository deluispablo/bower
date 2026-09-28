/**
 * Two small tags (spec §5): `BowerTag` marks something Bower wrote, `NewTag`
 * marks something new ("New", or "5 new" on a folder). Both carry text, so
 * colour is never the only signal.
 */

import type { JSX } from 'preact';

import { Bird } from './bird.js';

import '../styles/marks.css';

export function BowerTag(): JSX.Element {
  return (
    <span class="bower-tag">
      <Bird state="idle" size={14} reducedMotion />
      Bower
    </span>
  );
}

export function NewTag({ count }: { count?: number }): JSX.Element {
  return (
    <span class="new-tag">{count === undefined ? 'New' : `${count} new`}</span>
  );
}
