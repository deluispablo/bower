import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSources } from '@/data/provider';
import { BowerError, type FileKind } from '@/data/types';
import { kindOf } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { plural } from '@/app/words';
import { BowerLayer, type BowerController } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import s from './piles.module.css';
import { normaliseLink } from './link';

const DRAFT_KEY = 'bower:add-draft';
const ITEMS_KEY = 'bower:add-items';

interface Draft {
  key: string;
  name: string;
  kind: FileKind;
  origin: string;
}

/**
 * Add makes a pile: things that belong together and one line about them.
 * The line is what helps Bower most ("Receipts from the Lisbon trip").
 */
export function Add() {
  const { vault } = useSources();
  const nav = useNavigate();
  const [text, setTextState] = useState(() => {
    try {
      return sessionStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const setText = (v: string): void => {
    setTextState(v);
    try {
      if (v) sessionStorage.setItem(DRAFT_KEY, v);
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Without storage the draft lasts while the screen is open.
    }
  };
  // The things in the draft are kept for the visit too (in the real app, files are already
  // in the upload queue, so only their list needs keeping).
  const [items, setItemsState] = useState<Draft[]>(() => {
    try {
      const raw = sessionStorage.getItem(ITEMS_KEY);
      return raw ? (JSON.parse(raw) as Draft[]) : [];
    } catch {
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
        // Without storage the list lasts while the screen is open.
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

  const add = (list: Array<Omit<Draft, 'key'>>): void => {
    if (!list.length) return;
    setItems((x) => [...x, ...list.map((d, i) => ({ ...d, key: `${Date.now()}-${i}-${d.name}` }))]);
    // Bower goes to see what arrived, gives it a peck, and goes back to its edge.
    setTimeout(() => {
      const b = bird.current;
      const row = document.querySelector('[data-pile-item]:last-of-type');
      b?.flyTo(() => b.pointOn(row, 0.85)).peck().wait(0.3);
    }, 60);
  };
  const fromFiles = (fl: FileList | null, origin: string): void => add([...(fl ?? [])].map((f) => ({ name: f.name, kind: kindOf(f.name), origin })));
  const addLink = (): void => {
    const v = normaliseLink(link);
    if (!v) {
      toast('That does not look like a link.');
      return;
    }
    add([{ name: v.replace(/^https?:\/\//, '').replace(/\/$/, ''), kind: 'link', origin: 'A link you pasted' }]);
    setLink('');
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setOver(false);
    fromFiles(e.dataTransfer.files, 'Dropped here');
  };
  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await vault.addPile({ text, items: items.map(({ name, kind, origin }) => ({ name, kind, origin })) });
      setText('');
      setItems([]);
      toast(items.length ? `${plural(items.length, 'thing')} in the inbox` : 'Your note is in the inbox', { label: 'Tidy up now', run: () => useUi.getState().setTidy(true) });
      nav('/');
    } catch (e) {
      toast(e instanceof BowerError ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.page}>
      <h1 className={s.title}>Add a pile</h1>
      <p className="muted">Things that belong together, and a line about them. They wait in the inbox until you tidy up.</p>

      <label className={s.what}>
        <span>What is this?</span>
        <textarea rows={2} placeholder="Receipts from the Lisbon trip" value={text} onChange={(e) => setText(e.target.value)} />
      </label>

      <div
        ref={zone}
        className={`${s.zone} ${over ? s.over : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
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
        <p className={s.zoneTitle}>{over ? 'Let go and Bower takes it' : 'Drop files here'}</p>
        <div className={s.zoneBtns}>
          <Button variant="ghost" size="sm" onClick={() => files.current?.click()}>
            <Icon name="file" size={18} /> Choose files
          </Button>
          <Button variant="ghost" size="sm" onClick={() => camera.current?.click()}>
            <Icon name="camera" size={18} /> Take a photo
          </Button>
        </div>
        <input ref={files} type="file" multiple hidden onChange={(e) => fromFiles(e.target.files, 'From this device')} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => fromFiles(e.target.files, 'From the camera')} />
        <form
          className={s.linkRow}
          onSubmit={(e) => {
            e.preventDefault();
            addLink();
          }}
        >
          <Icon name="link" size={18} />
          <input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="Paste a link" aria-label="Paste a link" value={link} onChange={(e) => setLink(e.target.value)} />
          <Button size="sm" variant="ghost" type="submit" disabled={!link.trim()}>
            Add link
          </Button>
        </form>
      </div>

      {items.length > 0 && (
        <ul className={s.items} aria-label="In this pile">
          {items.map((it) => (
            <li key={it.key} data-pile-item>
              <span className={s.tile}>
                <Icon name={it.kind === 'image' ? 'image' : it.kind === 'link' ? 'link' : 'file'} />
              </span>
              <span className={s.itemMain}>
                <span className="mono">{it.name}</span>
                <span className={s.itemSub}>{it.origin}</span>
              </span>
              <button type="button" className={s.remove} aria-label={`Take ${it.name} out`} onClick={() => setItems((x) => x.filter((y) => y.key !== it.key))}>
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={s.footer}>
        <Button block disabled={busy || (!items.length && !text.trim())} onClick={() => void save()}>
          {busy ? 'Saving…' : items.length ? `Put ${plural(items.length, 'thing')} in the inbox` : 'Put the note in the inbox'}
        </Button>
      </div>
    </div>
  );
}
