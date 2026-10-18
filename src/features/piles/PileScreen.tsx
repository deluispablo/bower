import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { report, undoToast } from '@/ui/report';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { usePiles, useRun, useSources } from '@/data/provider';
import { BowerError, type Pile, type SetAside } from '@/data/types';
import { SET_ASIDE_TEXT } from '@/data/pile-readiness';
import { isEmptyPile, thingsIn } from '@/data/piles';
import { useUi } from '@/app/ui-store';
import { Button, IconButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { inAppHistory } from '@/app/paths';
import { isRunning } from '@/features/tidy/run-words';
import { PileStack } from './PileStack';
import { normaliseLink } from './link';
import { itemLine, pileLine } from './item-words';
import { FieldError, fieldBox, Input, Textarea } from '@/ui/Field';
import { useSessionDraft } from '@/ui/session-draft';
import s from './piles.module.css';

export function PileScreen() {
  const { id } = useParams();
  const { data: piles } = usePiles();
  const { data: run } = useRun();
  const nav = useNavigate();
  const pile = piles?.find((p) => p.id === id);
  const tryAgain = useTryAgain(pile, true);
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
  const empty = isEmptyPile(pile);
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

      {pile.question === 'exhausted' && !pile.setAside && !pile.noteLocked &&
        !pile.items.some((it) => it.changed || it.upload !== undefined) && (
          <p className={s.questionExhausted}>
            Bower couldn't place this. Tell it more in the pile's words, or move it yourself.
          </p>
        )}

      <PileNote key={pile.id} pile={pile} locked={running} />

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
        <SetAsideNote pile={pile} choose />
      ) : (
        pile.items.some((it) => it.upload === -1) && (
          <>
            <p className={s.retry} role="alert">
              Some things did not reach your Bower folder.{' '}
              <Button id={tryAgain.buttonId} size="sm" variant="ghost" aria-disabled={tryAgain.busy || undefined} aria-describedby={tryAgain.describedBy} onClick={tryAgain.onClick}>
                Try again
              </Button>
              {tryAgain.picker}
            </p>
            {tryAgain.paste}
          </>
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
const REMOVE_IT: ReadonlySet<SetAside> = new Set(['changed', 'declaration', 'empty', 'note-format', 'note-damaged']);
/** Reasons whose action is Try again: send it again, or check (or read the pile's list) again now. */
const TRY_AGAIN: ReadonlySet<SetAside> = new Set(['not-arrived', 'not-checked', 'unreadable', 'not-tidied']);

/**
 * Why a tidy-up leaves this pile in the inbox, and what to do: Try again for
 * a thing that has not arrived or could not be checked, Remove this pile
 * when the sentence says Remove. On the pile's screen its own Remove button
 * is below, so `remove` is only for the Inbox, where `nameId` names the pile
 * each action is for. On the pile's screen (`choose`), a thing whose bytes
 * are not on this device is chosen again there; in the Inbox, its Try again
 * says so and opens the pile's screen, ready at it (TL-P2-27).
 */
export function SetAsideNote({ pile, remove, choose, disabled, nameId, onRemoved }: { pile: Pile; remove?: boolean; choose?: boolean; disabled?: boolean; nameId?: string; onRemoved?: () => void }) {
  const tryAgain = useTryAgain(pile, choose ?? false);
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
            <Button id={tryAgain.buttonId} size="sm" variant="ghost" aria-disabled={tryAgain.busy || undefined} aria-describedby={[describedBy, tryAgain.describedBy].filter(Boolean).join(' ') || undefined} onClick={tryAgain.onClick}>
              Try again
            </Button>
            {tryAgain.picker}
          </>
        )}
      </p>
      {TRY_AGAIN.has(why) && tryAgain.paste}
      {remove && REMOVE_IT.has(why) && <RemovePile pile={pile} disabled={disabled} describedBy={describedBy} onRemoved={onRemoved} />}
    </div>
  );
}

/** What the Inbox's Try again hands the pile's screen: the thing to choose again. */
interface ChooseState {
  choose: string;
}

const chooseOf = (state: unknown): string | undefined =>
  typeof state === 'object' && state !== null && 'choose' in state && typeof state.choose === 'string' ? state.choose : undefined;

/**
 * Try again for a pile. A declared thing whose bytes are not on this device
 * (`chooseAgain`) can only be sent by choosing it again. On the pile's screen
 * (`choose`), Try again opens the file picker for a file, or goes to the
 * field where a link is pasted again (as Add takes it, then Send); the folder
 * takes it only if it is the same. In the Inbox, Try again says what to do
 * and opens the pile's screen, ready at that thing. Anything else sends again
 * what did not arrive.
 */
function useTryAgain(pile: Pile | undefined, choose: boolean): { onClick: () => void; buttonId: string; busy: boolean; describedBy: string | undefined; picker: ReactNode; paste: ReactNode } {
  const { vault } = useSources();
  const nav = useNavigate();
  const focusKey = chooseOf(useLocation().state);
  const buttonId = useId();
  const badId = useId();
  const askId = useId();
  const linkAskId = useId();
  const input = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const [link, setLink] = useState('');
  const [badLink, setBadLink] = useState(false);
  /** A thing chosen again is being checked and sent: Try again and Send wait. */
  const [busy, setBusy] = useState(false);
  /** The same, at once: a second press in the same moment is ignored too. */
  const working = useRef(false);
  const work = (on: boolean): void => {
    working.current = on;
    setBusy(on);
  };
  const again = vault.chooseAgain ? (pile?.items.filter((it) => it.chooseAgain) ?? []) : [];
  const pick = (kind: 'file' | 'link') => {
    const fits = again.filter((it) => (it.kind === 'link') === (kind === 'link'));
    return fits.find((it) => it.id === focusKey) ?? fits[0];
  };
  const file = choose ? pick('file') : undefined;
  const pasted = choose ? pick('link') : undefined;
  // Opened from the Inbox for one thing: the screen is ready at it, once.
  useEffect(() => {
    if (!focusKey || focused.current) return;
    const target = focusKey === pasted?.id ? field.current : focusKey === file?.id ? document.getElementById(buttonId) : null;
    if (!target) return;
    target.focus();
    focused.current = true;
  });
  const retry = (): Promise<void> => (pile ? vault.retryPile(pile.id).catch((e: unknown) => report(e, 'That did not work. Try again.')) : Promise.resolve());
  // What failed from this page with its bytes here is sent again by the same Try again.
  const failedHere = Boolean(pile?.items.some((it) => it.upload === -1 && !it.chooseAgain));
  const onClick = (): void => {
    if (working.current) return;
    if (file || pasted) {
      if (file) input.current?.click();
      else field.current?.focus();
      if (failedHere) void retry();
    } else if (!choose && pile && again[0]) {
      // The sentence says what to do; the pile's screen is where it is done. Once, however often pressed.
      const state: ChooseState = { choose: again[0].id };
      work(true);
      void retry().then(() => {
        work(false);
        nav(`/pile/${pile.id}`, { state });
      });
    } else void retry();
  };
  // Try again says what it asks for, in the words the Inbox shows (one sentence per thing).
  const asking = choose ? again : [];
  const picker = file && pile ? (
    <input
      ref={input}
      type="file"
      hidden
      onChange={(e) => {
        const chosen = e.target.files?.[0];
        // The same file can be chosen again after a refusal.
        e.target.value = '';
        if (!chosen || !vault.chooseAgain || working.current) return;
        work(true);
        vault.chooseAgain(pile.id, file.id, { body: chosen })
          .catch((err: unknown) => report(err, 'That did not work. Try again.'))
          .finally(() => work(false));
      }}
    />
  ) : null;
  const send = (): void => {
    if (!pasted || !pile || !vault.chooseAgain || working.current) return;
    const url = normaliseLink(link);
    if (!url) {
      setBadLink(true);
      return;
    }
    work(true);
    vault.chooseAgain(pile.id, pasted.id, { url }).then(
      () => setLink(''),
      (err: unknown) => report(err, 'That did not work. Try again.'),
    ).finally(() => work(false));
  };
  const paste = pasted ? (
    <>
      <form
        className={`${s.linkRow} ${fieldBox()}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Icon name="link" size={18} />
        <Input
          inBox
          ref={field}
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Paste a link"
          aria-label="Paste a link"
          aria-describedby={linkAskId}
          invalid={badLink}
          errorId={badId}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setBadLink(false);
          }}
        />
        <Button size="sm" variant="ghost" type="submit" disabled={!link.trim()} aria-disabled={busy || undefined}>
          Send
        </Button>
        <span id={linkAskId} className="sr-only">
          Paste the link again on this device to send it.
        </span>
      </form>
      {badLink && (
        <FieldError id={badId}>That is not a web address. Check it and try again.</FieldError>
      )}
    </>
  ) : null;
  const ask = asking.length ? (
    <span id={askId} className="sr-only">
      {asking.map((it) => (it.kind === 'link' ? 'Paste the link again on this device to send it.' : `Choose ${it.name} again on this device to send it.`)).join(' ')}
    </span>
  ) : null;
  return {
    onClick,
    buttonId,
    busy,
    describedBy: ask ? askId : undefined,
    picker: (
      <>
        {ask}
        {picker}
      </>
    ),
    paste,
  };
}

/**
 * Remove this pile, asked first: its files go to the Bin of your Drive. The
 * question opens with the focus on Keep it, which gives it back to Remove this pile.
 */
export function RemovePile({ pile, disabled, block, describedBy, onRemoved }: { pile: Pile; disabled?: boolean; block?: boolean; describedBy?: string | undefined; onRemoved?: (() => void) | undefined }) {
  const { vault } = useSources();
  const [confirm, setConfirm] = useState(false);
  // Refused because Drive did not answer whether a thing of the pile landed (`unreached`): said in the box, not a toast.
  const [unreached, setUnreached] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    // The question opens on Keep it, its least destructive answer, so a repeated key cannot remove the pile.
    if (confirm) {
      asked.current = true;
      [...(box.current?.querySelectorAll('button') ?? [])].at(-1)?.focus();
    } else if (asked.current) box.current?.querySelector('button')?.focus();
    // Only after the question was open does the focus go back to Remove this pile.
  }, [confirm]);
  const empty = isEmptyPile(pile);
  const onlyNote = !pile.items.length && !empty;
  // Bytes still only on this device are discarded with the pile, so no Undo is promised for it (prod1-pile-undo).
  const unsent = pile.items.some((item) => item.upload !== undefined && !item.chooseAgain);
  const missing = pile.items.some((item) => item.chooseAgain);
  const binSentence = onlyNote
    ? 'The note goes to the Bin of your Drive.'
    : unsent
      ? 'Files already in Drive go to its Bin. Files still on this device will be discarded and cannot be restored.'
      : missing
        ? 'Files already in Drive go to its Bin. Missing files will still need to be chosen again.'
        : 'Its files go to the Bin of your Drive, where you can get them back.';
  const size = block ? 'md' : 'sm';
  return (
    <div ref={box} className={confirm ? s.confirm : undefined} role={confirm ? 'alert' : undefined}>
      {!confirm ? (
        <Button variant="ghost" size={size} block={block} disabled={disabled} aria-describedby={describedBy} onClick={() => setConfirm(true)}>
          Remove this pile
        </Button>
      ) : (
        <>
          {/* A pile with no things and no words has nothing to go to the Bin: only the buttons. */}
          {unreached ? <p className={s.unreached}>{unreached}</p> : !empty && <p>{binSentence}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              ref={removeButton}
              variant="danger"
              size={size}
              aria-describedby={describedBy}
              onClick={() =>
                void vault.removePile(pile.id).then(
                  () => {
                    // Undo is the restore entry the removal kept, by its place or, with none, its id.
                    if (unsent) toast('Pile removed');
                    else undoToast('Pile removed', () => vault.restore(pile.path ?? pile.id), () => 'The pile is back in the inbox');
                    onRemoved?.();
                  },
                  (e: unknown) => {
                    if (!(e instanceof BowerError && e.code === 'unreached')) return report(e, 'That did not work. Try again.');
                    console.error(e);
                    // The box's line says it, and Remove the pile stays the retry, with the focus on it.
                    setUnreached(`Not removed yet: ${e.message}`);
                    removeButton.current?.focus();
                  },
                )
              }
            >
              Remove the pile
            </Button>
            <Button
              variant="ghost"
              size={size}
              onClick={() => {
                setUnreached(null);
                setConfirm(false);
              }}
            >
              Keep it
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Words cut at a word boundary about `max` characters in, ending with "…" when cut (TL-P2-36). */
function cutAtWord(words: string, max: number): string {
  const flat = words.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max + 1);
  const at = head.lastIndexOf(' ');
  return `${(at > 0 ? head.slice(0, at) : flat.slice(0, max)).replace(/[\s,;:.]+$/, '')}…`;
}

/** A pile note's kept draft: its words and the note they started from; anything else reads as none. */
function readDraft(raw: string): { text: string; base: string } | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    const d = (typeof v === 'object' && v !== null ? v : {}) as { text?: unknown; base?: unknown };
    if (typeof d.text === 'string' && typeof d.base === 'string') return { text: d.text, base: d.base };
    throw new Error('Unreadable pile note draft');
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** A kept draft for these words over the note listed (`listed`), started from `from`: none when they are the note. */
const draftOf = (words: string, listed: string, from: string): string => (words.trim() === listed ? '' : JSON.stringify({ text: words, base: from }));

/** The kept draft's raw value when no editor shows the pile (storage blocked reads as none). */
function storedDraft(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    // expected: storage may be blocked (a private window); then the draft lived only on the screen that left.
    return '';
  }
}

/**
 * The pile note editor on screen now, per pile. A save that ends after its own editor left (the pile was opened
 * again) tells this one, so newer words typed there are kept over the saved note, not cleared (qa7-drafts-save-race).
 */
const onScreen = new Map<string, (saved: string) => void>();
/** The words a save is sending now, per pile: a listing bringing them is that save, whose end tells the screen. */
const sending = new Map<string, string>();

/**
 * The pile's note: what you wrote about it. Saved as `Pile note.md` in the
 * pile's folder; Bower reads it with every thing in the pile. Editable until
 * a tidy-up starts.
 */
function PileNote({ pile, locked }: { pile: Pile; locked: boolean }) {
  const { vault } = useSources();
  // Unsaved words are kept for the tab, one draft per pile, with the base they started from (qa7-drafts R3).
  const draftKey = `bower:pile-note:${pile.id}`;
  const [kept, keep] = useSessionDraft(draftKey);
  const [restored] = useState(() => readDraft(kept));
  const [text, setText] = useState(restored?.text ?? pile.text);
  // The words the draft started from (its base), and the words last listed. When a listing brings new words,
  // the editor shows them only while nothing is typed; a draft is kept with its base, and the vault saves it
  // only over that base (RFC 9110 §13.1.1), so words changed elsewhere are never replaced unseen.
  const [base, setBase] = useState(restored?.base ?? pile.text);
  const [seen, setSeen] = useState(pile.text);
  // What a kept draft carries: the base last read or saved, never a refused save's (that one is this page's alone),
  // and the words on screen now, for a save that ends after newer typing.
  const [keptBase, setKeptBase] = useState(restored?.base ?? pile.text);
  const typed = useRef(text);
  useEffect(() => { typed.current = text; }, [text]);
  // The person typed on this screen: words equal to the base are then theirs, not merely the note shown.
  const [typedHere, setTypedHere] = useState(false);
  const remember = (words: string, listed: string, from = keptBase): void => keep(draftOf(words, listed, from));
  // A save that ended (here or on a screen that left): the words on screen now stay kept, over the words just saved.
  useEffect(() => {
    const advance = (saved: string): void => {
      setBase(saved);
      setKeptBase(saved);
      keep(draftOf(typed.current, saved, saved));
    };
    onScreen.set(pile.id, advance);
    return () => { if (onScreen.get(pile.id) === advance) onScreen.delete(pile.id); };
  });
  // After a refused save the words now there are shown next to the draft and become its base: the next save is an
  // informed overwrite (the usual edit-conflict pattern: look again, then retry against what is there now).
  const [clash, setClash] = useState(false);
  if (pile.text !== seen) {
    setSeen(pile.text);
    if (text.trim() === base && !(typedHere &&sending.get(pile.id) === pile.text)) {
      setText(pile.text);
      setBase(pile.text);
      setKeptBase(pile.text);
      if (kept) keep('');
    } else if (clash) setBase(pile.text);
  } else if (clash && base !== pile.text) {
    // A refused save takes the words now listed as its base, even when they were listed before it was refused (its
    // own `pile` is the one it began with): the next save is the informed overwrite the sentence offers.
    setBase(pile.text);
  }
  const [busy, setBusy] = useState(false);
  // A note Bower could not read is shown, never typed over: Try again reads it (the reason above says so).
  const held = !!pile.noteLocked;
  const off = locked || held;
  const changed = text.trim() !== pile.text;
  const showSave = changed && !off;
  // The words a save is still sending: leaving the box again or pressing Save meanwhile does not send them twice.
  const pending = useRef<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  // Save went away holding the keyboard, or it fell to the page's body: back to the box (focus.ts: never to nothing).
  const hadSave = useRef(showSave);
  useLayoutEffect(() => {
    if (hadSave.current === showSave) return;
    hadSave.current = showSave;
    const at = document.activeElement;
    if (!showSave && (!at || at === document.body || !at.isConnected)) box.current?.focus();
  }, [showSave]);
  const save = async (): Promise<void> => {
    const words = text.trim();
    if (pending.current === words) return;
    pending.current = words;
    setBusy(true);
    sending.set(pile.id, words);
    try {
      await vault.updatePile(pile.id, text, base);
      const saved = text.trim();
      const here = onScreen.get(pile.id);
      if (here) here(saved);
      else {
        // No screen shows the pile: a draft still kept (none after sign-out) now starts from the words saved.
        const left = readDraft(storedDraft(draftKey));
        if (left) keep(draftOf(left.text, saved, saved));
      }
      setClash(false);
      toast('Note saved. Bower reads it in the next tidy-up.');
    } catch (e) {
      if (e instanceof BowerError && e.code === 'conflict') {
        setClash(true);
        setBase(pile.text);
      }
      report(e, 'The note did not save. Try again.');
    } finally {
      if (sending.get(pile.id) === words) sending.delete(pile.id);
      if (pending.current === words) pending.current = null;
      setBusy(false);
    }
  };
  return (
    <section className={s.noteBox} aria-labelledby="pile-note">
      <label htmlFor="pile-note-text" id="pile-note">
        {pile.items.length ? 'What is this?' : 'Your note'}
      </label>
      <Textarea
        id="pile-note-text"
        ref={box}
        rows={3}
        value={text}
        disabled={off}
        placeholder={held ? undefined : 'One line about these things helps Bower most'}
        onChange={(e) => {
          if (off) return;
          setTypedHere(true);
          setText(e.target.value);
          remember(e.target.value, pile.text);
        }}
        onBlur={(e) => {
          // Leaving the box for its own Save: Save does it, so Tab lands on it enabled and Enter saves once.
          if (e.relatedTarget && e.relatedTarget === saveButton.current) return;
          if (changed && !off && (text.trim() || pile.items.length)) void save();
        }}
      />
      {clash && changed && !off && pile.text && (
        <p className="muted" role="status">
          This note changed elsewhere. It now says “{cutAtWord(pile.text, 80)}”. Save again to replace it with yours.
        </p>
      )}
      <div className={s.noteFoot}>
        {!held && <span className="muted">{locked ? 'Locked while a tidy-up runs.' : changed ? 'Not saved yet.' : pile.text ? 'Saved with the pile.' : 'No note yet.'}</span>}
        {showSave && (
          // aria-disabled, not disabled, while busy: the keyboard on Save never drops to the page (WAI-ARIA APG).
          <Button ref={saveButton} size="sm" aria-disabled={busy} onClick={() => { if (!busy) void save(); }}>
            {busy ? 'Saving…' : 'Save the note'}
          </Button>
        )}
      </div>
    </section>
  );
}
