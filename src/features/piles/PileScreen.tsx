import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { usePiles, useRun, useSources } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { ago, plural } from '@/app/words';
import { Button, IconButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { isRunning } from '@/features/tidy/run-words';
import { PileStack } from './PileStack';
import s from './piles.module.css';

export function PileScreen() {
  const { id } = useParams();
  const { data: piles } = usePiles();
  const { data: run } = useRun();
  const { vault } = useSources();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const pile = piles?.find((p) => p.id === id);
  if (piles && !pile)
    return (
      <div className={s.page}>
        <h1 className={s.title}>This pile is filed</h1>
        <p className="muted">A tidy-up already put it away.</p>
        <p style={{ marginTop: 12 }}>
          <Link to="/">Back to Home</Link>
        </p>
      </div>
    );
  if (!pile) return <div className={s.page} aria-busy="true" />;
  const running = isRunning(run);
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <IconButton label="Back" onClick={() => nav(-1)}>
          <Icon name="back" />
        </IconButton>
        <span className="muted">Inbox</span>
      </div>
      <div className={s.pileHead}>
        <PileStack items={pile.items} />
        <div>
          <h1 className={s.title}>{pile.text || pile.items[0]?.name}</h1>
          <p className="muted">
            {plural(pile.items.length, 'thing')}, added {ago(pile.createdAt).toLowerCase()}
          </p>
        </div>
      </div>
      <ul className={s.items}>
        {pile.items.map((it) => (
          <li key={it.id}>
            <span className={s.tile}>
              <Icon name={it.kind === 'image' ? 'image' : it.kind === 'link' ? 'link' : 'file'} />
            </span>
            <span className={s.itemMain}>
              <span className="mono">{it.name}</span>
              <span className={s.itemSub}>{it.origin}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={s.footer}>
        <Button block disabled={running} onClick={() => useUi.getState().setTidy(true)}>
          {running ? 'A tidy-up is running' : 'Tidy up'}
        </Button>
        {!confirm ? (
          <Button variant="ghost" block disabled={running} onClick={() => setConfirm(true)}>
            Remove this pile
          </Button>
        ) : (
          <div className={s.confirm} role="alert">
            <p>Its files go to the Bin of your Drive, where you can get them back.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="danger"
                onClick={() =>
                  void vault.removePile(pile.id).then(
                    () => {
                      toast('Pile removed');
                      nav('/');
                    },
                    () => toast('Wait for the tidy-up to end.'),
                  )
                }
              >
                Remove the pile
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
