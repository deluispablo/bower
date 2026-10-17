import { Command } from 'cmdk';
import { waitingIn } from '@/data/piles';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePiles, useRun, useSources, useTree } from '@/data/provider';
import { isRunning } from '@/features/tidy/run-words';
import { displayName, nameOf, parentOf, thingName } from '@/data/tree';
import type { SearchHit, TreeNode } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { usePrefs } from '@/app/prefs';
import { crumbs, routeFor } from '@/app/paths';
import { NOTHING_FOUND, plural } from '@/app/words';
import { Icon, type IconName } from '@/ui/Icon';
import s from './palette.module.css';
import { useBackCloses } from '@/ui/back';
import { focusMain, returnFocusTo } from '@/ui/focus';
import { useIsDesktop } from '@/ui/media';

// The palette's one matching rule: every word of the search, in any order, whatever the case.
const words = (search: string): string[] => search.toLowerCase().split(/\s+/).filter(Boolean);
const hasWords = (text: string, ws: string[]): boolean => ws.every((w) => text.toLowerCase().includes(w));
const label = (f: TreeNode): string => (f.type === 'folder' ? f.name : thingName(f.name));
const valueOf = (f: TreeNode): string => `${label(f)} :: ${f.path}`;

/** ⌘K: every action and every note, by typing. */
export function Palette() {
  const { paletteOpen, setPalette, setTidy, collapseAll, setRightTab } = useUi();
  const prefs = usePrefs();
  const desktop = useIsDesktop();
  const { data: tree } = useTree();
  const { data: piles } = usePiles();
  const { data: current } = useRun();
  const running = isRunning(current);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  useBackCloses(paletteOpen, () => {
    setPalette(false);
    setQ('');
  });
  const waiting = waitingIn(piles);
  // Words inside notes, from the same search as the Search panel, a moment after typing stops.
  const { vault } = useSources();
  const [inside, setInside] = useState<{ q: string; hits: SearchHit[]; failed?: boolean }>({ q: '', hits: [] });
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      vault.search(t).then(
        (hits) => live && setInside({ q: t, hits }),
        (e: unknown) => {
          console.error(e);
          if (live) setInside({ q: t, hits: [], failed: true });
        },
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, vault]);
  const files = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (ns: TreeNode[]): void => ns.forEach((n) => (out.push(n), n.children && walk(n.children)));
    walk((tree ?? []).filter((n) => n.path !== 'Inbox'));
    return out;
  }, [tree]);
  // Match first, then cap (cmdk FAQ: filter yourself past a few thousand items); Inside notes checks the same list.
  const listed = useMemo(() => {
    const ws = words(q);
    return ws.length ? files.filter((f) => hasWords(valueOf(f), ws)).slice(0, 400) : [];
  }, [files, q]);
  const named = new Set(listed.map((f) => f.path));
  const textHits = inside.q === q.trim() ? inside.hits.filter((h) => !named.has(h.path) || !hasWords(displayName(nameOf(h.path)), words(inside.q))) : [];

  // What had the keyboard when the palette opened (WAI-ARIA APG: on close, focus returns to the opener).
  const opener = useRef<HTMLElement | null>(null);
  // A choice that opens another page or sheet hands the keyboard to that; the others go back to the opener.
  const moved = useRef(false);
  // Read when the store says open: React has not rendered yet, so the field has not taken the keyboard.
  useEffect(
    () =>
      useUi.subscribe((now, before) => {
        if (!now.paletteOpen || before.paletteOpen) return;
        const at = document.activeElement;
        opener.current = at instanceof HTMLElement && at !== document.body ? at : null;
      }),
    [],
  );
  const run = (fn: () => void, goes = true) => () => {
    moved.current = goes;
    setPalette(false);
    setQ('');
    fn();
    // The page that opened gets the focus, so Tab carries on from it.
    if (goes) setTimeout(() => document.getElementById('main')?.focus(), 60);
  };
  const actions: Array<{ id: string; label: string; icon: IconName; hint?: string; fn: () => void; stays?: true }> = [
    { id: 'tidy', label: running ? 'See the tidy-up that is running' : waiting ? `Tidy up ${plural(waiting, 'thing')}` : 'Tidy up', icon: 'sweep', fn: () => setTidy(true) },
    { id: 'add', label: 'Add a pile', icon: 'add', hint: '⌥⌘N', fn: () => nav('/add') },
    { id: 'bower', label: 'Tell Bower something', icon: 'send', fn: () => nav('/bower') },
    { id: 'home', label: 'Go to Home', icon: 'home', fn: () => nav('/') },
    { id: 'files', label: 'Open your folders', icon: 'folder', fn: () => nav('/files') },
    ...(desktop ? [{ id: 'collapse', label: 'Collapse all folders', icon: 'collapse' as IconName, fn: () => collapseAll(), stays: true as const }] : []),
    ...(desktop ? [{ id: 'outline', label: 'Show the outline', icon: 'outline' as IconName, fn: () => (prefs.set({ rightOpen: true }), setRightTab('outline')), stays: true as const }] : []),
    ...(['dark', 'light', 'system'] as const)
      .filter((t) => t !== prefs.theme)
      .map((t) => ({ id: `theme-${t}`, label: t === 'system' ? 'Follow the system theme' : `Use the ${t} theme`, icon: 'sun' as IconName, fn: () => prefs.set({ theme: t }), stays: true as const })),
    { id: 'moves', label: prefs.birdMoves ? 'Keep Bower still' : 'Let Bower move', icon: 'sparkle', fn: () => prefs.set({ birdMoves: !prefs.birdMoves }), stays: true },
    { id: 'settings', label: 'Open settings', icon: 'gear', fn: () => nav('/settings') },
  ];

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={(o) => (setPalette(o), o || setQ(''))}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.scrim} />
        <Dialog.Content className={s.box} aria-describedby={undefined} onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (moved.current) {
              moved.current = false;
              focusMain();
            } else returnFocusTo(opener.current);
          }}
        >
          <Dialog.Title className="sr-only">{desktop ? 'Command palette' : 'Search'}</Dialog.Title>
          <Command
            label={desktop ? 'Search your notes, or type a command' : 'Search your notes'}
            loop
            filter={(value, search) => {
              // Every word must match; actions come before notes and folders.
              const ws = words(search);
              const v = value.toLowerCase();
              if (!hasWords(v, ws)) return 0;
              const action = v.startsWith('action ');
              if (v.startsWith('inside ')) return 0.3;
              const name = v.split(' :: ')[0] ?? v;
              return (action ? 2 : 1) * (hasWords(name, ws) ? 1 : 0.5);
            }}
          >
            <div className={s.inputRow}>
              <Icon name="search" size={18} />
              <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={desktop ? 'Type a command or a note' : 'Search notes, folders and actions'} className={s.input} />
              {desktop ? (
                <kbd className={s.kbd}>Esc</kbd>
              ) : (
                <button type="button" className={s.close} onClick={() => setPalette(false)}>
                  Cancel
                </button>
              )}
            </div>
            {/* A listbox owns only options (ARIA 1.2), so the message lives in an always-present live status (APG combobox, WCAG 4.1.3). */}
            <div role="status">
              <Command.Empty className={s.empty}>{q.trim().length > 1 && inside.q !== q.trim() ? 'Looking in your notes…' : inside.failed ? 'Search did not answer. Names still work; try the words again in a moment.' : NOTHING_FOUND}</Command.Empty>
            </div>
            <Command.List className={s.list}>
              <Command.Group heading="Actions" className={s.group}>
                {actions.map((a) => (
                  <Command.Item key={a.id} value={`action ${a.label}`} onSelect={run(a.fn, !a.stays)} className={s.item}>
                    <Icon name={a.icon} size={18} />
                    <span className={s.label}>{a.label}</span>
                    {a.hint && desktop && <kbd className={s.kbd}>{a.hint}</kbd>}
                  </Command.Item>
                ))}
              </Command.Group>
              {listed.length > 0 && (
                <Command.Group heading="Notes and folders" className={s.group}>
                  {listed.map((f) => (
                    <Command.Item key={f.path} value={valueOf(f)} onSelect={run(() => nav(routeFor(f)))} className={s.item}>
                      <Icon name={f.type === 'folder' ? 'folder' : f.kind === 'note' ? 'note' : 'file'} size={18} />
                      <span className={s.label}>{label(f)}</span>
                      <span className={s.path}>{crumbs(parentOf(f.path))}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {textHits.length > 0 && (
                <Command.Group heading="Inside notes" className={s.group}>
                  {textHits.slice(0, 20).map((h) => (
                    <Command.Item key={`in:${h.path}`} value={`inside ${q} :: ${h.path}`} onSelect={run(() => nav(routeFor({ path: h.path, type: 'file' })))} className={s.item}>
                      <Icon name="note" size={18} />
                      <span className={s.label}>{h.title}</span>
                      <span className={s.path}>{h.snippet}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
