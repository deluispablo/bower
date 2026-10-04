import { Command } from 'cmdk';
import { waitingIn } from '@/data/piles';
import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePiles, useRun, useTree } from '@/data/provider';
import { isRunning } from '@/features/tidy/run-words';
import { displayName, parentOf } from '@/data/tree';
import type { TreeNode } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { usePrefs } from '@/app/prefs';
import { crumbs, routeFor } from '@/app/paths';
import { plural } from '@/app/words';
import { Icon, type IconName } from '@/ui/Icon';
import s from './palette.module.css';
import { useBackCloses } from '@/ui/back';
import { useIsDesktop } from '@/ui/media';

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
  const files = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (ns: TreeNode[]): void => ns.forEach((n) => (out.push(n), n.children && walk(n.children)));
    walk((tree ?? []).filter((n) => n.path !== 'Inbox'));
    return out;
  }, [tree]);

  const run = (fn: () => void) => () => {
    setPalette(false);
    setQ('');
    fn();
  };
  const actions: Array<{ id: string; label: string; icon: IconName; hint?: string; fn: () => void }> = [
    { id: 'tidy', label: running ? 'See the tidy-up that is running' : waiting ? `Tidy up ${plural(waiting, 'thing')}` : 'Tidy up', icon: 'sweep', fn: () => setTidy(true) },
    { id: 'add', label: 'Add a pile', icon: 'add', hint: '⌥⌘N', fn: () => nav('/add') },
    { id: 'bower', label: 'Tell Bower something', icon: 'send', fn: () => nav('/bower') },
    { id: 'home', label: 'Go to Home', icon: 'home', fn: () => nav('/') },
    { id: 'files', label: 'Open your folders', icon: 'folder', fn: () => nav('/files') },
    ...(desktop ? [{ id: 'collapse', label: 'Collapse all folders', icon: 'collapse' as IconName, fn: () => collapseAll() }] : []),
    ...(desktop ? [{ id: 'outline', label: 'Show the outline', icon: 'outline' as IconName, fn: () => (prefs.set({ rightOpen: true }), setRightTab('outline')) }] : []),
    { id: 'theme', label: prefs.theme === 'light' ? 'Use the dark theme' : 'Use the light theme', icon: 'sun', fn: () => prefs.set({ theme: prefs.theme === 'light' ? 'dark' : 'light' }) },
    { id: 'moves', label: prefs.birdMoves ? 'Keep Bower still' : 'Let Bower move', icon: 'sparkle', fn: () => prefs.set({ birdMoves: !prefs.birdMoves }) },
    { id: 'settings', label: 'Open settings', icon: 'gear', fn: () => nav('/settings') },
  ];

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={(o) => (setPalette(o), o || setQ(''))}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.scrim} />
        <Dialog.Content className={s.box} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{desktop ? 'Command palette' : 'Search'}</Dialog.Title>
          <Command
            label={desktop ? 'Command palette' : 'Search'}
            loop
            filter={(value, search) => {
              // Every word must match; actions come before notes and folders.
              const words = search.toLowerCase().split(/\s+/).filter(Boolean);
              const v = value.toLowerCase();
              if (!words.every((w) => v.includes(w))) return 0;
              const action = v.startsWith('action ');
              const name = v.split(' :: ')[0] ?? v;
              return (action ? 2 : 1) * (words.every((w) => name.includes(w)) ? 1 : 0.5);
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
            <Command.List className={s.list}>
              <Command.Empty className={s.empty}>Nothing by that name.</Command.Empty>
              <Command.Group heading="Actions" className={s.group}>
                {actions.map((a) => (
                  <Command.Item key={a.id} value={`action ${a.label}`} onSelect={run(a.fn)} className={s.item}>
                    <Icon name={a.icon} size={18} />
                    <span className={s.label}>{a.label}</span>
                    {a.hint && desktop && <kbd className={s.kbd}>{a.hint}</kbd>}
                  </Command.Item>
                ))}
              </Command.Group>
              {q.trim().length > 0 && (
                <Command.Group heading="Notes and folders" className={s.group}>
                  {files.slice(0, 400).map((f) => (
                    <Command.Item key={f.path} value={`${f.type === 'folder' ? f.name : displayName(f.name)} :: ${f.path}`} onSelect={run(() => nav(routeFor(f)))} className={s.item}>
                      <Icon name={f.type === 'folder' ? 'folder' : f.kind === 'note' ? 'note' : 'file'} size={18} />
                      <span className={s.label}>{f.type === 'folder' ? f.name : displayName(f.name)}</span>
                      <span className={s.path}>{crumbs(parentOf(f.path))}</span>
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
