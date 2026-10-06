import { useEffect, useId, useRef, useState } from 'react';
import { report } from '@/ui/report';
import { Link, useNavigate, useParams } from 'react-router';
import { usePiles, useRun, useSources } from '@/data/provider';
import type { Pile, SetAside } from '@/data/types';
import { SET_ASIDE_TEXT } from '@/data/pile-readiness';
import { thingsIn } from '@/data/piles';
import { useUi } from '@/app/ui-store';
import { Button, IconButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { inAppHistory } from '@/app/paths';
import { isRunning } from '@/features/tidy/run-words';
import { PileStack } from './PileStack';
import { itemLine, pileLine } from './item-words';
import s from './piles.module.css';

export function PileScreen() {
  const { id } = useParams();
  const { data: piles } = usePiles();
  const { data: run } = useRun();
  const { vault } = useSources();
  const nav = useNavigate();
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
  // A pile with no things is a note only when it has words; with none it is an empty pile (TL-P2-22).
  const empty = !pile.items.length && !pile.text.trim();
  const onlyNote = !pile.items.length && !empty;
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
          <h1 className={s.title}>{empty ? 'An empty pile' : onlyNote ? 'Your note' : pile.text || pile.items[0]?.name}</h1>
          <p className="muted">
            {pileLine({ things: thingsIn(pile), onlyNote, createdAt: pile.createdAt })}
          </p>
        </div>
      </div>

      <PileNote key={`${pile.id}:${pile.text}`} pile={pile} locked={running} />

      {pile.items.length > 0 && (
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
      {pile.setAside ? (
        <SetAsideNote pile={pile} />
      ) : (
        pile.items.some((it) => it.upload === -1) && (
          <p className={s.retry} role="alert">
            Some things did not reach your Bower folder.{' '}
            <Button size="sm" variant="ghost" onClick={() => void vault.retryPile(pile.id).catch((e: unknown) => report(e, 'That did not work. Try again.'))}>
              Try again
            </Button>
          </p>
        )
      )}
      <div className={s.footer}>
        <Button block disabled={running} onClick={() => useUi.getState().setTidy(true)}>
          {running ? 'A tidy-up is running' : 'Tidy up the inbox'}
        </Button>
        <RemovePile pile={pile} disabled={running} block onRemoved={() => nav('/')} />
      </div>
    </div>
  );
}

/** Reasons whose action is the pile's own Remove. */
const REMOVE_IT: ReadonlySet<SetAside> = new Set(['changed', 'declaration', 'empty']);
/** Reasons whose action is Try again: send it again, or check again now. */
const TRY_AGAIN: ReadonlySet<SetAside> = new Set(['not-arrived', 'not-checked']);

/**
 * Why a tidy-up leaves this pile in the inbox, and what to do: Try again for
 * a thing that has not arrived or could not be checked, Remove this pile
 * when the sentence says Remove. On the pile's screen its own Remove button
 * is below, so `remove` is only for the Inbox, where `nameId` names the pile
 * each action is for.
 */
export function SetAsideNote({ pile, remove, disabled, nameId, onRemoved }: { pile: Pile; remove?: boolean; disabled?: boolean; nameId?: string; onRemoved?: () => void }) {
  const { vault } = useSources();
  const sentenceId = useId();
  const why = pile.setAside;
  if (!why) return null;
  const describedBy = nameId ? `${nameId} ${sentenceId}` : undefined;
  return (
    <div className={s.setAside}>
      <p className={s.retry}>
        <span id={sentenceId}>{SET_ASIDE_TEXT[why]}</span>
        {TRY_AGAIN.has(why) && (
          <>
            {' '}
            <Button size="sm" variant="ghost" aria-describedby={describedBy} onClick={() => void vault.retryPile(pile.id).catch((e: unknown) => report(e, 'That did not work. Try again.'))}>
              Try again
            </Button>
          </>
        )}
      </p>
      {remove && REMOVE_IT.has(why) && <RemovePile pile={pile} disabled={disabled} describedBy={describedBy} onRemoved={onRemoved} />}
    </div>
  );
}

/**
 * Remove this pile, asked first: its files go to the Bin of your Drive. The
 * question opens with the focus on Keep it, which gives it back to Remove this pile.
 */
export function RemovePile({ pile, disabled, block, describedBy, onRemoved }: { pile: Pile; disabled?: boolean; block?: boolean; describedBy?: string | undefined; onRemoved?: (() => void) | undefined }) {
  const { vault } = useSources();
  const [confirm, setConfirm] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    // The question opens on Keep it, its least destructive answer, so a repeated key cannot remove the pile.
    if (confirm) {
      asked.current = true;
      [...(box.current?.querySelectorAll('button') ?? [])].at(-1)?.focus();
    } else if (asked.current) box.current?.querySelector('button')?.focus();
    // Only after the question was open does the focus go back to Remove this pile.
  }, [confirm]);
  const onlyNote = !pile.items.length;
  const size = block ? 'md' : 'sm';
  return (
    <div ref={box} className={confirm ? s.confirm : undefined} role={confirm ? 'alert' : undefined}>
      {!confirm ? (
        <Button variant="ghost" size={size} block={block} disabled={disabled} aria-describedby={describedBy} onClick={() => setConfirm(true)}>
          Remove this pile
        </Button>
      ) : (
        <>
          {/* A pile with nothing left has no files nor words to keep: the reason above says enough. */}
          {pile.setAside !== 'empty' && <p>{onlyNote ? 'The note goes to the Bin of your Drive.' : 'Its files go to the Bin of your Drive, where you can get them back.'}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              variant="danger"
              size={size}
              aria-describedby={describedBy}
              onClick={() =>
                void vault.removePile(pile.id).then(
                  () => {
                    toast('Pile removed');
                    onRemoved?.();
                  },
                  (e: unknown) => report(e, 'That did not work. Try again.'),
                )
              }
            >
              Remove the pile
            </Button>
            <Button variant="ghost" size={size} onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </div>
        </>
      )}
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
