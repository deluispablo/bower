import { useRef, useState, type DragEvent } from 'react';
import { report } from '@/ui/report';
import { focusMain } from '@/ui/focus';
import { useNavigate } from 'react-router';
import { useSources } from '@/data/provider';
import type { FileKind } from '@/data/types';
import { kindOf } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { plural } from '@/app/words';
import { BowerLayer, type BowerController } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { FieldError, fieldBox, Input, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import s from './piles.module.css';
import { normaliseLink } from './link';
import { forget, get, keep } from './draft-files';
import { draftLine } from './add-words';
import { useSessionDraft } from '@/ui/session-draft';

const ITEMS_KEY = 'bower:add-items';

interface Draft {
  key: string;
  name: string;
  kind: FileKind;
  origin: string;
  /** A pasted link; a file's bytes are kept in draft-files instead. */
  url?: string;
  /** Where you already have this file, until you choose to add it anyway. */
  dup?: string;
}

const folderWords = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/'))).replaceAll('/', ' / ') || 'your Bower folder';

/** A draft file whose bytes are gone (the page was reloaded) cannot be sent. */
const missing = (d: Draft): boolean => d.kind !== 'link' && !get(d.key);

/**
 * Add makes a pile: things that belong together and one line about them.
 * The line is what helps Bower most ("Receipts from the Saltmere weekend").
 */
export function Add() {
  const { vault } = useSources();
  const nav = useNavigate();
  const saving = useRef(false);
  const [text, setText] = useSessionDraft('bower:add-draft');
  // The things in the draft are kept for the visit too (in the real app, files are already
  // in the upload queue, so only their list needs keeping).
  const [items, setItemsState] = useState<Draft[]>(() => {
    try {
      const raw = sessionStorage.getItem(ITEMS_KEY);
      return raw ? (JSON.parse(raw) as Draft[]) : [];
    } catch {
      // expected: storage may be blocked (a private window); the default holds.
      return [];
    }
  });
  const setItems = (next: Draft[] | ((x: Draft[]) => Draft[])): void => {
    setItemsState((cur) => {
      const v = typeof next === 'function' ? next(cur) : next;
      try {
        if (v.length) sessionStorage.setItem(ITEMS_KEY, JSON.stringify(v));
        else sessionStorage.removeItem(ITEMS_KEY);
      } catch {
        // expected: Without storage the list lasts while the screen is open.
      }
      return v;
    });
  };
  const [link, setLink] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const bird = useRef<BowerController>(null);
  const list = useRef<HTMLUListElement>(null);

  const remove = (key: string): void => {
    if (saving.current) return;
    const index = items.findIndex((it) => it.key === key);
    forget(key);
    setItems((x) => x.filter((it) => it.key !== key));
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const rows = list.current?.querySelectorAll<HTMLButtonElement>(':scope > li > button');
      const next = rows?.[index] ?? rows?.[index - 1];
      if (next) next.focus();
      else focusMain();
    }, 0);
  };

  const add = (all: Array<Omit<Draft, 'key'> & { file?: Blob }>): void => {
    if (saving.current) return;
    // The same file (name and size) or the same link, added again, is already here.
    const same = (d: Draft, x: (typeof all)[number]): boolean => (x.url ? d.url === x.url : d.name === x.name && !d.url && get(d.key)?.size === x.file?.size);
    const list = all.filter((x, i) => !items.some((d) => same(d, x)) && all.findIndex((y) => y.name === x.name && y.url === x.url && y.file?.size === x.file?.size) === i);
    const twice = all.find((x) => !list.includes(x));
    if (twice) toast(`${twice.name} is already in this pile.`);
    if (!list.length) return;
    // A file whose draft lost its bytes in a reload ("Add this file again") fills that draft, not a new row.
    // Each thing gets its row key once, so the new rows and the duplicate check below name the same row.
    const keyed = list.map((x, i) => {
      const old = x.file ? items.find((d) => missing(d) && d.name === x.name) : undefined;
      return { x, key: old?.key ?? `${Date.now()}-${i}-${x.name}`, refill: Boolean(old) };
    });
    for (const { x, key } of keyed) if (x.file) keep(key, x.file);
    const drafts = keyed.flatMap(({ x: { file, ...d }, key, refill }) => (refill ? [] : [{ ...d, key }]));
    // A refill changes no row, only its bytes: a new list draws it again.
    setItems((x) => [...x, ...drafts]);
    // Before anything is sent: does the folder already have any of these?
    const sent = keyed.flatMap(({ x: { name, file }, key }) => (file ? [{ key, name, body: file }] : []));
    if (sent.length)
      void vault.duplicates(sent.map(({ name, body }) => ({ name, body }))).then(
        (found) => {
          const dup = new Map(sent.flatMap((d, i) => (found[i] ? [[d.key, found[i]] as const] : [])));
          if (dup.size) setItems((x) => x.map((d) => (dup.has(d.key) ? { ...d, dup: dup.get(d.key) ?? '' } : d)));
        },
        (e: unknown) => console.error(e),
      );
    // Bower goes to see what arrived, gives it a peck, and goes back to its edge.
    setTimeout(() => {
      const b = bird.current;
      const row = document.querySelector('[data-pile-item]:last-of-type');
      b?.flyTo(() => b.pointOn(row, 0.85)).peck().wait(0.3);
    }, 60);
  };
  const fromFiles = (fl: FileList | null, origin: string): void => add([...(fl ?? [])].map((f) => ({ name: f.name, kind: kindOf(f.name), origin, file: f })));
  const [badLink, setBadLink] = useState(false);
  const addLink = (): void => {
    if (saving.current) return;
    const v = normaliseLink(link);
    if (!v) {
      setBadLink(true);
      return;
    }
    add([{ name: v.replace(/^https?:\/\//, '').replace(/\/$/, ''), kind: 'link', origin: 'A link you pasted', url: v }]);
    setLink('');
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    if (saving.current) return;
    setOver(false);
    fromFiles(e.dataTransfer.files, 'Dropped here');
  };
  const ready = items.filter((d) => !missing(d));
  const save = async (): Promise<void> => {
    if (saving.current) return;
    // Bytes can disappear after rendering an enabled button. Refuse the whole draft.
    if (items.some(missing)) {
      setItemsState((cur) => [...cur]);
      toast('Add the missing files again, or take them out.');
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await vault.addPile({
        text,
        items: items.map(({ key, name, kind, origin, url }) => {
          const body = get(key);
          return { name, kind, origin, ...(body ? { body } : {}), ...(url ? { url } : {}) };
        }),
      });
      items.forEach((d) => forget(d.key));
      setText('');
      setItems([]);
      toast(ready.length ? `${plural(ready.length, 'thing')} in the inbox` : 'Your note is in the inbox', { label: 'Tidy up now', run: () => useUi.getState().setTidy(true) });
      nav('/');
    } catch (e) {
      report(e, 'That did not save. Try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={s.page}>
      <h1 className={s.title}>Add a pile</h1>
      <p className="muted">Things that belong together, and a line about them. They wait in the inbox until you tidy up.</p>

      <label className={s.what}>
        <span>What is this?</span>
        <Textarea rows={2} placeholder="Receipts from the Saltmere weekend" value={text} disabled={busy} onChange={(e) => { if (!saving.current) setText(e.target.value); }} />
      </label>

      <div
        ref={zone}
        className={`${s.zone} ${over ? s.over : ''}`}
        aria-disabled={busy || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!saving.current) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <BowerLayer
          ref={bird}
          size={70}
          home={() => {
            const z = zone.current;
            return z ? { x: z.clientWidth - 64, y: 2 } : { x: 200, y: 2 };
          }}
        />
        <p className={s.zoneTitle}>{busy ? 'Saving this pile…' : over ? 'Let go and Bower takes it' : 'Drop files here'}</p>
        <div className={s.zoneBtns}>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (!saving.current) files.current?.click(); }}>
            <Icon name="file" size={18} /> Choose files
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (!saving.current) camera.current?.click(); }}>
            <Icon name="camera" size={18} /> Take a photo
          </Button>
        </div>
        <input ref={files} type="file" multiple disabled={busy} hidden onChange={(e) => fromFiles(e.target.files, 'From this device')} />
        <input ref={camera} type="file" accept="image/*" capture="environment" disabled={busy} hidden onChange={(e) => fromFiles(e.target.files, 'From the camera')} />
        <form
          className={`${s.linkRow} ${fieldBox()}`}
          onSubmit={(e) => {
            e.preventDefault();
            addLink();
          }}
        >
          <Icon name="link" size={18} />
          <Input
            inBox
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste a link"
            aria-label="Paste a link"
            invalid={badLink}
            errorId="bad-link"
            value={link}
            disabled={busy}
            onChange={(e) => {
              if (saving.current) return;
              setLink(e.target.value);
              setBadLink(false);
            }}
          />
          <Button size="sm" variant="ghost" type="submit" disabled={busy || !link.trim()}>
            Add link
          </Button>
        </form>
        {badLink && (
          <FieldError id="bad-link">That is not a web address. Check it and try again.</FieldError>
        )}
      </div>

      {items.length > 0 && (
        <ul ref={list} className={s.items} aria-label="In this pile">
          {items.map((it) => (
            <li key={it.key} data-pile-item>
              <span className={s.tile}>
                <Icon name={it.kind === 'image' ? 'image' : it.kind === 'link' ? 'link' : 'file'} />
              </span>
              <span className={s.itemMain}>
                <span className="mono">{it.name}</span>
                <span className={s.itemSub}>{draftLine({ origin: it.origin, missing: missing(it), empty: !it.url && get(it.key)?.size === 0, dup: it.dup }, it.dup ? `You already have this in ${folderWords(it.dup)}.` : undefined)}</span>
                {it.dup && (
                  <span className={s.dupActions}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => remove(it.key)}
                    >
                      Leave it out
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (!saving.current) setItems((x) => x.map((y) => (y.key === it.key ? { key: y.key, name: y.name, kind: y.kind, origin: y.origin, ...(y.url ? { url: y.url } : {}) } : y))); }}>
                      Add it anyway
                    </Button>
                  </span>
                )}
              </span>
              <button
                type="button"
                className={s.remove}
                aria-label={`Take ${it.name} out`}
                disabled={busy}
                onClick={() => remove(it.key)}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={s.footer}>
        <Button block disabled={busy || ready.length !== items.length || (!ready.length && !text.trim())} onClick={() => void save()}>
          {busy ? 'Saving…' : ready.length ? `Add ${plural(ready.length, 'thing')} to the inbox` : 'Add to the inbox'}
        </Button>
      </div>
    </div>
  );
}
