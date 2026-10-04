import { useState } from 'react';
import { report } from '@/ui/report';
import { Link, useNavigate, useParams } from 'react-router';
import { usePiles, useRun, useSources } from '@/data/provider';
import type { Pile } from '@/data/types';
import { thingsIn } from '@/data/piles';
import { useUi } from '@/app/ui-store';
import { ago, plural } from '@/app/words';
import { Button, IconButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { inAppHistory } from '@/app/paths';
import { isRunning } from '@/features/tidy/run-words';
import { PileStack } from './PileStack';
import { itemLine } from './item-words';
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
        <h1 className={s.title}>This pile is not in the inbox</h1>
        <p className="muted">A tidy-up filed it, or it was removed.</p>
        <p style={{ marginTop: 12 }}>
          <Link to="/">Back to Home</Link>
        </p>
      </div>
    );
  if (!pile) return <div className={s.page} aria-busy="true" />;
  const running = isRunning(run);
  const onlyNote = !pile.items.length;
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <IconButton label="Back" onClick={() => (inAppHistory() ? nav(-1) : nav('/'))}>
          <Icon name="back" />
        </IconButton>
        <span className="muted">Inbox</span>
      </div>
      <div className={s.pileHead}>
        <PileStack items={pile.items} />
        <div>
          <h1 className={s.title}>{onlyNote ? 'Your note' : pile.text || pile.items[0]?.name}</h1>
          <p className="muted">
            {onlyNote ? 'A note' : plural(thingsIn(pile), 'thing')}, added {ago(pile.createdAt).toLowerCase()}. {onlyNote ? 'Bower files it as a note where it belongs.' : ''}
          </p>
        </div>
      </div>

      <PileNote key={`${pile.id}:${pile.text}`} pile={pile} locked={running} />

      {!onlyNote && (
        <ul className={s.items} aria-label="In this pile">
          {pile.items.map((it) => (
            <li key={it.id}>
              <span className={s.tile}>
                <Icon name={it.kind === 'image' ? 'image' : it.kind === 'link' ? 'link' : 'file'} />
              </span>
              <span className={s.itemMain}>
                <span className="mono">{it.name}</span>
                <span className={s.itemSub}>{itemLine(it)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {pile.items.some((it) => it.upload === -1) && (
        <p className={s.retry} role="alert">
          Some things did not reach your Bower folder.{' '}
          <Button size="sm" variant="ghost" onClick={() => void vault.retryPile(pile.id).catch((e: unknown) => report(e, 'That did not work. Try again.'))}>
            Try again
          </Button>
        </p>
      )}
      <div className={s.footer}>
        <Button block disabled={running} onClick={() => useUi.getState().setTidy(true)}>
          {running ? 'A tidy-up is running' : 'Tidy up the inbox'}
        </Button>
        {!confirm ? (
          <Button variant="ghost" block disabled={running} onClick={() => setConfirm(true)}>
            Remove this pile
          </Button>
        ) : (
          <div className={s.confirm} role="alert">
            <p>{onlyNote ? 'The note goes to the Bin of your Drive.' : 'Its files go to the Bin of your Drive, where you can get them back.'}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="danger"
                onClick={() =>
                  void vault.removePile(pile.id).then(
                    () => {
                      toast('Pile removed');
                      nav('/');
                    },
                    (e: unknown) => report(e, 'That did not work. Try again.'),
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

/**
 * The pile's note: what you wrote about it. Saved as `Pile note.md` in the
 * pile's folder; Bower reads it with every thing in the pile. Editable until
 * a tidy-up starts.
 */
function PileNote({ pile, locked }: { pile: Pile; locked: boolean }) {
  const { vault } = useSources();
  const [text, setText] = useState(pile.text);
  const [busy, setBusy] = useState(false);
  const changed = text.trim() !== pile.text;
  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await vault.updatePile(pile.id, text);
      toast('Note saved. Bower reads it in the next tidy-up.');
    } catch (e) {
      report(e, 'The note did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={s.noteBox} aria-labelledby="pile-note">
      <label htmlFor="pile-note-text" id="pile-note">
        {pile.items.length ? 'What is this?' : 'Your note'}
      </label>
      <textarea
        id="pile-note-text"
        rows={3}
        value={text}
        disabled={locked}
        placeholder="One line about these things helps Bower most"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (changed && !locked && (text.trim() || pile.items.length)) void save();
        }}
      />
      <div className={s.noteFoot}>
        <span className="muted">{locked ? 'Locked while a tidy-up runs.' : pile.text ? 'Saved with the pile.' : 'No note yet.'}</span>
        {changed && !locked && (
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save the note'}
          </Button>
        )}
      </div>
    </section>
  );
}
