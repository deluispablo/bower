import type { PileItem } from '@/data/types';
import { Icon } from '@/ui/Icon';
import s from './piles.module.css';

const COLOR: Record<string, string> = { pdf: 'var(--accent-line)', image: 'var(--brand-line)', link: 'var(--para-resources)', note: 'var(--para-archive)' };

/** A pile drawn as a pile: up to three cards, the count on top. */
export function PileStack({ items }: { items: PileItem[] }) {
  if (!items.length)
    return (
      <span className={s.stack} aria-hidden="true">
        <span className={s.card} style={{ transform: 'rotate(-4deg)', color: 'var(--para-archive)' }}>
          <Icon name="note" size={15} />
        </span>
      </span>
    );
  const top = items.slice(0, 3);
  return (
    <span className={s.stack} aria-hidden="true">
      {top.map((it, i) => (
        <span key={it.id} className={s.card} style={{ transform: `translate(${i * 4}px, ${-i * 4}px) rotate(${[-6, 4, -2][i]}deg)`, zIndex: 3 - i, color: COLOR[it.kind] ?? 'var(--text-muted)' }}>
          <Icon name={it.kind === 'image' ? 'image' : it.kind === 'link' ? 'link' : 'file'} size={15} />
        </span>
      ))}
      {items.length > 1 && <span className={s.n}>{items.length}</span>}
    </span>
  );
}
