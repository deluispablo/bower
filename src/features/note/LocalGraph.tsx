import { useNavigate } from 'react-router';
import { displayName, nameOf } from '@/data/tree';
import type { Note } from '@/data/types';
import { noteRoute } from '@/app/paths';
import s from './panel.module.css';

const short = (t: string): string => (t.length > 15 ? `${t.slice(0, 14)}…` : t);

/** The note in the middle, its links around it (out in teal, in in blue). */
export function LocalGraph({ note }: { note: Note }) {
  const nav = useNavigate();
  const out = note.links.map((p) => ({ p, dir: 'out' as const }));
  const inn = note.backlinks.filter((p) => !note.links.includes(p)).map((p) => ({ p, dir: 'in' as const }));
  const all = [...out, ...inn].slice(0, 8);
  const W = 280,
    H = 200,
    cx = W / 2,
    cy = H / 2;
  const nodes = all.map((n, i) => {
    const a = (i / Math.max(1, all.length)) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + Math.cos(a) * 82, y: cy + Math.sin(a) * 58 };
  });
  return (
    <figure className={s.graph}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${note.title} and ${all.length} linked notes`}>
        {nodes.map((n) => (
          <line key={`l${n.p}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={n.dir === 'out' ? 'var(--brand)' : 'var(--para-resources)'} strokeOpacity=".45" strokeWidth="1.4" />
        ))}
        {nodes.map((n) => (
          <g key={n.p} className={s.gnode} onClick={() => nav(noteRoute(n.p))} tabIndex={0} role="link" aria-label={displayName(nameOf(n.p))} onKeyDown={(e) => e.key === 'Enter' && nav(noteRoute(n.p))}>
            <circle cx={n.x} cy={n.y} r="6" fill={n.dir === 'out' ? 'var(--brand)' : 'var(--para-resources)'} />
            <text x={Math.max(48, Math.min(W - 48, n.x))} y={n.y + (n.y < cy ? -11 : 19)} textAnchor="middle">
              {short(displayName(nameOf(n.p)))}
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r="9" fill="var(--accent)" />
        <text x={cx} y={cy + 24} textAnchor="middle" className={s.gself}>
          {short(note.title)}
        </text>
      </svg>
    </figure>
  );
}
