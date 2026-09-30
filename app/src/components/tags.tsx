/**
 * Two small tags (spec §5): `BowerTag` marks something Bower wrote, `NewTag`
 * marks something new ("New", or "5 new" on a folder). Both carry text, so
 * colour is never the only signal.
 */

import type { JSX } from 'preact';

import { Badge } from './badge.js';
import { BowerMark } from './bird.js';

import '../styles/marks.css';

export function BowerTag(): JSX.Element {
  return (
    <span class="bower-tag">
      <BowerMark size={14} />
      Bower
    </span>
  );
}

/** The Badge in its `new` tone (spec §3.21); `new-tag` stays as a hook. */
export function NewTag({ count }: { count?: number }): JSX.Element {
  return (
    <Badge tone="new" class="new-tag">
      {count === undefined ? 'New' : `${String(count)} new`}
    </Badge>
  );
}
