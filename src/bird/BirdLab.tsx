import { useRef } from 'react';
import { BowerLayer, PoseBower, type BowerController, type Pose } from './Bower';
import { react, REACTIONS, type Reaction, type ReactionKind } from './react';
import { Button } from '@/ui/Button';

const POSES: Pose[] = ['idle', 'wait', 'read', 'write', 'carry', 'proud', 'sleep', 'alarm', 'land'];

/** An internal page to watch every pose and flight: /_bird. */
export function BirdLab() {
  const reaction = useRef<Reaction | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bird = useRef<BowerController>(null);
  const spot = (id: string) => () => bird.current?.pointOn(stage.current?.querySelector(`[data-spot="${id}"]`) ?? null, 0.5) ?? { x: 0, y: 0 };
  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 30 }}>Bower, every pose</h1>
      <p className="muted">CSS poses loop in place. Only the newest bird on a screen moves; the rest hold still.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16, marginTop: 18 }}>
        {POSES.map((p) => (
          <figure key={p} style={{ margin: 0, padding: 12, borderRadius: 16, background: 'var(--bg-alt)', textAlign: 'center' }}>
            <PoseBower pose={p} size={110} style={{ margin: '0 auto' }} />
            <figcaption className="muted">{p}</figcaption>
          </figure>
        ))}
      </div>
      <h2 style={{ fontSize: 22, marginTop: 30 }}>Reactions</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(REACTIONS) as ReactionKind[]).map((kind) => (
          <Button key={kind} size="sm" title={REACTIONS[kind]}
            onClick={(event) => { reaction.current = react(kind, event.currentTarget); }}>{kind}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => reaction.current?.end()}>End reaction</Button>
      </div>
      <h2 style={{ fontSize: 22, marginTop: 30 }}>Flights</h2>
      <div ref={stage} style={{ position: 'relative', height: 300, marginTop: 10, borderRadius: 16, background: 'var(--bg-alt)' }}>
        {['a', 'b', 'c'].map((id, i) => (
          <span key={id} data-spot={id} style={{ position: 'absolute', left: `${15 + i * 32}%`, top: [200, 90, 230][i], width: 90, height: 8, borderRadius: 4, background: '#8a6038' }} />
        ))}
        <BowerLayer ref={bird} size={80} priority={3} carryLabel="Lease 2026.pdf" home={() => ({ x: 70, y: 120 })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => bird.current?.flyTo(spot('b'))}>Fly</Button>
        <Button size="sm" onClick={() => bird.current?.flyTo(spot('a')).peck().holding(true).flyTo(spot('c')).peck().holding(false)}>Carry</Button>
        <Button size="sm" onClick={() => bird.current?.showOff()}>Show off</Button>
        <Button size="sm" variant="ghost" onClick={() => bird.current?.flyTo(() => ({ x: 70, y: 120, perch: true }))}>Home</Button>
      </div>
    </div>
  );
}
