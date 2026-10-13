import * as ContextMenu from '@radix-ui/react-context-menu';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { usePiles, useRun, useTree } from '@/data/provider';
import { isRunning } from '@/features/tidy/run-words';
import { displayName, findNode, isRoot, parentOf, thingName, visibleRows, type SortOrder } from '@/data/tree';
import type { TreeNode } from '@/data/types';
import { countThings, folderCount } from '@/data/piles';
import { ancestors, useUi } from '@/app/ui-store';
import { decodeSplat, paraColor } from '@/app/paths';
import { IconButton } from '@/ui/Button';
import { Icon, BowerHead } from '@/ui/Icon';
import { menuCls } from '@/ui/menu';
import { Sheet } from '@/ui/Sheet';
import { useFileActions } from './file-actions';
import { NameField } from './NameForm';
import { nameRules } from './name-rules';
import { openerNow, returnFocusTo } from '@/ui/focus';
import { toast } from '@/ui/toast';
import { useIsDesktop } from '@/ui/media';
import s from './explorer.module.css';

const SORTS: Array<[SortOrder, string] | null> = [
  ['name-az', 'File name (A to Z)'],
  ['name-za', 'File name (Z to A)'],
  null,
  ['modified-new', 'Modified time (new to old)'],
  ['modified-old', 'Modified time (old to new)'],
  null,
  ['created-new', 'Created time (new to old)'],
  ['created-old', 'Created time (old to new)'],
];

/** Things in a folder, not counting the notes that describe piles. */

/** A folder with things in it asks first (ConfirmBin); anything else goes to the Bin at once, with Undo. */
function useBinOrAsk(): (node: TreeNode) => void {
  const act = useFileActions();
  return (node) => {
    const count = node.type === 'folder' ? countThings(node) : 0;
    if (count > 0) useUi.getState().setConfirmBin({ path: node.path, count, nested: (node.children ?? []).some((c) => c.type === 'folder') });
    else void act.trash(node.path);
  };
}

/** A pile's folder in the inbox reads as its note does on Home, without the day it carries in Drive. */
const shownFolderName = (path: string, name: string): string => (path === `Inbox/${name}` ? name.replace(/^\d{4}-\d{2}-\d{2} /, '') : name);

const inInbox = (path: string): boolean => path === 'Inbox' || path.startsWith('Inbox/');

const KIND_BADGE: Record<string, string> = { pdf: 'pdf', image: 'jpg', link: 'link', doc: 'doc', sheet: 'sheet', audio: 'audio' };

function badgeFor(node: TreeNode): string | null {
  if (node.type !== 'file' || node.kind === 'note') return null;
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(node.name)?.[1]?.toLowerCase();
  if (node.kind === 'link') return 'link';
  return ext ?? (node.kind ? (KIND_BADGE[node.kind] ?? null) : null);
}

/** The path a route points at, so the open note is the selected row. */
function useRoutePath(): string | null {
  const loc = useLocation();
  if (loc.pathname.startsWith('/note/')) return decodeSplat(loc.pathname.slice(6));
  if (loc.pathname.startsWith('/files/')) return decodeSplat(loc.pathname.slice(7));
  return null;
}

interface Props {
  /** `panel`: desktop side panel. `drawer` and `page`: phone. */
  variant: 'panel' | 'drawer' | 'page';
}

/**
 * The file explorer, the Obsidian way: a tree with indent guides, folders
 * first, a sort order for every folder, menus on right-click (or a long press
 * on a phone), drag a row onto a folder to move it, F2 to rename, arrows and
 * Enter to get around.
 */
export function Explorer({ variant }: Props) {
  const desktop = variant === 'panel';
  const { data: tree, loading } = useTree();
  const ui = useUi();
  const act = useFileActions();
  const binOrAsk = useBinOrAsk();
  const routePath = useRoutePath();
  const [focus, setFocus] = useState<string | null>(null);
  const [kb, setKb] = useState(false);
  const [menuNode, setMenuNode] = useState<TreeNode | null>(null);
  const [sheetNode, setSheetNode] = useState<TreeNode | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const dragPath = useRef<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const treeRef = useRef<HTMLDivElement>(null);
  const nameOpener = useRef<HTMLElement | null>(null);
  const pending = desktop && ui.naming && 'folder' in ui.naming && ui.naming.inline ? ui.naming : null;
  const press = useRef<{ t: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  // Auto-reveal: the open note's folders open and its row is selected.
  useEffect(() => {
    if (!routePath) return;
    ui.openAll(ancestors(routePath));
    ui.select(routePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath]);

  const roots = useMemo(() => tree ?? [], [tree]);
  // A folder's own note (Flat hunt/Flat hunt.md) is the folder: it opens from the folder view.
  const rows = useMemo(() => visibleRows(roots, ui.open, ui.sort).filter((r) => !r.node.hub), [roots, ui.open, ui.sort]);
  const visible = (p: string | null): p is string => !!p && rows.some((r) => r.node.path === p);
  // Keyboard focus follows a row that moved or was renamed; a row that is gone gives way to the selection.
  // A row put in the Bin from the keyboard gives way to the row next to it, not the top of the tree.
  const [goneTo, setGoneTo] = useState<{ from: string; to: string | null } | null>(null);
  const current =
    (visible(focus) ? focus : null) ??
    (focus && visible(ui.whereNow(focus)) ? ui.whereNow(focus) : null) ??
    (focus && goneTo?.from === focus && visible(goneTo.to) ? goneTo.to : null) ??
    (visible(ui.selected) ? ui.selected : null) ??
    rows[0]?.node.path ??
    null;
  // Undo brought a row back: its row has the keyboard again (focus still names it).
  useEffect(() => {
    if (ui.restored && desktop && (!document.activeElement || document.activeElement === document.body)) treeRef.current?.focus();
  }, [ui.restored, desktop]);

  // A row moved into a closed folder: open the way to it, so focus can stay on it.
  useEffect(() => {
    if (!focus || visible(focus)) return;
    const now = ui.whereNow(focus);
    const closed = now ? [...ancestors(now)].filter((p) => !ui.open.has(p)) : [];
    if (closed.length) ui.openAll(closed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, rows]);

  useEffect(() => {
    if (!kb || !current) return;
    treeRef.current?.querySelector(`[data-path="${CSS.escape(current)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current, kb]);

  const nodeAt = (path: string | null): TreeNode | null => (path ? findNode(roots, path) : null);

  /** Where New folder puts things: the selected folder, else the open note's, else Resources. */
  const targetFolder = (): string => {
    const n = nodeAt(ui.selected) ?? nodeAt(routePath);
    const f = !n ? '' : n.type === 'folder' ? n.path : parentOf(n.path);
    return f && !f.startsWith('Inbox') ? f : 'Resources';
  };

  /**
   * Desktop: a folder opens in the main view (list or table) and expands; a
   * second click on the open folder folds it. Phone: a tap only folds or
   * unfolds, since the tree is the screen; "Open as a list" is in its menu.
   */
  const activate = (node: TreeNode, newTab = false): void => {
    if (node.type === 'folder') {
      const isOpen = ui.open.has(node.path);
      if (desktop) {
        if (isOpen && ui.selected === node.path && !newTab) ui.toggle(node.path, false);
        else {
          ui.toggle(node.path, true);
          act.open(node, newTab);
        }
      } else ui.toggle(node.path);
      ui.select(node.path);
    } else act.open(node, newTab);
    setFocus(node.path);
  };

  const typed = useRef({ text: '', at: 0 });
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const i = rows.findIndex((r) => r.node.path === current);
    const row = rows[i];
    const go = (p: string | undefined): void => {
      if (!p) return;
      e.preventDefault();
      setKb(true);
      setFocus(p);
    };
    // The menu key, or Shift+F10: the row's menu, as a right-click opens it.
    if (row && desktop && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
      e.preventDefault();
      const el = treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(row.node.path)}"]`);
      const r = el?.getBoundingClientRect();
      el?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: (r?.left ?? 0) + 24, clientY: (r?.bottom ?? 0) - 4 }));
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(rows[Math.min(rows.length - 1, i + 1)]?.node.path);
      case 'ArrowUp':
        return go(rows[Math.max(0, i - 1)]?.node.path);
      case 'Home':
        return go(rows[0]?.node.path);
      case 'End':
        return go(rows[rows.length - 1]?.node.path);
      case 'ArrowRight':
        if (row?.node.type === 'folder') {
          e.preventDefault();
          if (!ui.open.has(row.node.path)) ui.toggle(row.node.path, true);
          else go(rows[i + 1]?.node.path);
        }
        return;
      case 'ArrowLeft':
        if (!row) return;
        e.preventDefault();
        if (row.node.type === 'folder' && ui.open.has(row.node.path)) ui.toggle(row.node.path, false);
        else if (parentOf(row.node.path)) go(parentOf(row.node.path));
        return;
      case 'Enter':
        if (row) {
          e.preventDefault();
          activate(row.node, e.metaKey || e.ctrlKey);
        }
        return;
      default:
        // Type-ahead: the first letters of a name move to the next row that starts with them.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && /\S/.test(e.key)) {
          const now = Date.now();
          const more = now - typed.current.at < 800;
          typed.current = { text: (more ? typed.current.text : '') + e.key.toLowerCase(), at: now };
          const from = more ? i : i + 1;
          const order = [...rows.slice(Math.max(0, from)), ...rows.slice(0, Math.max(0, from))];
          const hit = order.find((r) => thingName(shownFolderName(r.node.path, r.node.name)).toLowerCase().startsWith(typed.current.text));
          if (hit) go(hit.node.path);
        }
        return;
      case 'F2':
        if (row && !isRoot(row.node.path) && !inInbox(row.node.path)) {
          e.preventDefault();
          ui.setRenaming(row.node.path);
        }
        return;
      case 'Delete':
      case 'Backspace':
        if (row && (e.metaKey || e.key === 'Delete') && (isRoot(row.node.path) || row.node.path === 'Inbox')) {
          e.preventDefault();
          toast('Main folders stay: Bower files everything into them.');
          return;
        }
        if (row && !isRoot(row.node.path) && !inInbox(row.node.path) && (e.metaKey || e.key === 'Delete')) {
          e.preventDefault();
          // The next thing in the same folder, else the one before it (its sibling or its folder).
          const after = rows.slice(i + 1).find((r) => parentOf(r.node.path) === parentOf(row.node.path)) ?? rows[i - 1];
          setFocus(row.node.path);
          setGoneTo({ from: row.node.path, to: after?.node.path ?? null });
          binOrAsk(row.node);
        }
        return;
    }
  };

  // ---------- drag and drop (desktop)
  const folderFor = (path: string): string | null => {
    const n = nodeAt(path);
    if (!n) return null;
    return n.type === 'folder' ? n.path : parentOf(n.path) || null;
  };
  const onDragStart = (node: TreeNode) => (e: DragEvent): void => {
    if (isRoot(node.path) || inInbox(node.path)) {
      e.preventDefault();
      return;
    }
    dragPath.current = node.path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', displayName(node.name));
  };
  const onDragOver = (node: TreeNode) => (e: DragEvent): void => {
    const from = dragPath.current;
    if (!from) return;
    const to = folderFor(node.path);
    if (!to || inInbox(to) || to === parentOf(from) || to === from || to.startsWith(`${from}/`)) {
      setDropOn(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropOn !== to) {
      setDropOn(to);
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => ui.toggle(to, true), 700);
    }
  };
  const endDrag = (): void => {
    dragPath.current = null;
    setDropOn(null);
    clearTimeout(hoverTimer.current);
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    const from = dragPath.current;
    const to = dropOn;
    endDrag();
    if (from && to) void act.move(from, to);
  };

  // ---------- long press (phone)
  const pressStart = (node: TreeNode) => (): void => {
    if (desktop) return;
    press.current = {
      fired: false,
      t: setTimeout(() => {
        if (press.current) press.current.fired = true;
        navigator.vibrate?.(10);
        setSheetNode(node);
      }, 480),
    };
  };
  const pressEnd = (): void => {
    if (press.current) clearTimeout(press.current.t);
  };

  const renderRow = (node: TreeNode, level: number): ReactNode => {
    const folder = node.type === 'folder';
    // An empty folder has nothing to show open: it reads closed, with its 0, like every empty folder.
    const isOpen = folder && ui.open.has(node.path) && (!!node.children?.length || pending?.folder === node.path);
    const root = isRoot(node.path) || (level === 0 && folder);
    const selected = ui.selected === node.path;
    const focused = kb && current === node.path;
    const badge = badgeFor(node);
    const renaming = ui.renaming === node.path;
    const guides = Array.from({ length: level }, (_, k) => <span key={k} className={s.guide} style={{ left: (desktop ? 15 : 19) + k * (desktop ? 16 : 20) }} />);
    return (
      <div
        key={node.path}
        id={`row-${encodeURIComponent(node.path)}`}
        role="treeitem"
        aria-level={level + 1}
        aria-expanded={folder ? isOpen : undefined}
        aria-selected={selected}
        data-path={node.path}
        className={[s.row, folder ? s.folder : '', root ? s.root : '', selected ? s.sel : '', focused ? s.focus : '', dropOn === node.path ? s.drop : ''].join(' ')}
        style={{ paddingLeft: (desktop ? 6 : 10) + level * (desktop ? 16 : 20) }}
        draggable={desktop && !renaming && !isRoot(node.path) && !inInbox(node.path)}
        onDragStart={onDragStart(node)}
        onDragOver={onDragOver(node)}
        onDragEnd={endDrag}
        onDrop={onDrop}
        onClick={(e) => {
          if (press.current?.fired) {
            press.current = null;
            return;
          }
          if (renaming) return;
          setKb(false);
          activate(node, e.metaKey || e.ctrlKey);
        }}
        onAuxClick={(e) => {
          if (e.button === 1 && node.type === 'file') activate(node, true);
        }}
        onContextMenu={(e) => {
          setFocus(node.path);
          if (desktop) setMenuNode(node);
          else {
            e.preventDefault();
            setSheetNode(node);
          }
        }}
        onPointerDown={pressStart(node)}
        onPointerUp={pressEnd}
        onPointerLeave={pressEnd}
        onPointerCancel={pressEnd}
      >
        {guides}
        <span
          className={s.lead}
          style={root ? { color: paraColor(node.path) } : undefined}
          onClick={
            folder
              ? (e) => {
                  e.stopPropagation();
                  ui.toggle(node.path);
                }
              : undefined
          }
        >
          {folder ? (
            <Icon name="chev" size={14} stroke={2.2} className={isOpen ? s.chevOpen : s.chev} />
          ) : node.hub ? (
            <BowerHead size={16} />
          ) : (
            <Icon name={node.kind === 'image' ? 'image' : node.kind === 'link' ? 'link' : 'file'} size={15} />
          )}
        </span>
        {renaming ? (
          <RenameInput
            node={node}
            draft={draft}
            onDone={async (name, how) => {
              ui.setRenaming(null);
              if (name === null || (how === 'blur' && name === draft)) {
                // Escape, or clicking away from a name already refused: cancel, quietly.
                setDraft(null);
              } else {
                const to = await act.rename(node.path, name);
                if (to) {
                  setFocus(to);
                  setDraft(null);
                } else if (how === 'enter') {
                  // Refused on Enter: back in the box with what you typed.
                  setDraft(name);
                  ui.setRenaming(node.path);
                }
              }
              treeRef.current?.focus();
              setKb(true); // after focus(): the box's blur clears kb, and the ring comes back with the tree's focus
            }}
          />
        ) : (
          <span className={s.name}>{folder ? shownFolderName(node.path, node.name) : badge ? node.name.replace(/\.[A-Za-z0-9]{1,5}$/, '') : displayName(node.name)}</span>
        )}
        {badge && !renaming && <span className={s.badge}>{badge}</span>}
        {node.isNew && <span className={s.newDot} title="New since you last looked" aria-label="New" />}
        {folder && !isOpen && <span className={s.count}>{folderCount(node)}</span>}
      </div>
    );
  };

  const header = (
    <div className={s.nav}>
      <IconButton small label="New folder" onClick={() => {
        nameOpener.current = openerNow();
        act.askFolderName(targetFolder(), desktop);
      }}>
        <Icon name="newFolder" size={18} />
      </IconButton>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <IconButton small label="Change sort order">
            <Icon name="sort" size={18} />
          </IconButton>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content className={menuCls.content} sideOffset={6} align="start">
            <Dropdown.RadioGroup value={ui.sort} onValueChange={(v) => ui.setSort(v as SortOrder)}>
              {SORTS.map((o, i) =>
                o ? (
                  <Dropdown.RadioItem key={o[0]} value={o[0]} className={menuCls.item}>
                    {o[1]}
                    <Dropdown.ItemIndicator className={menuCls.check}>
                      <Icon name="check" size={16} />
                    </Dropdown.ItemIndicator>
                  </Dropdown.RadioItem>
                ) : (
                  <Dropdown.Separator key={`s${i}`} className={menuCls.sep} />
                ),
              )}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      {desktop && (
      <IconButton
        small
        label="Reveal the open note"
        onClick={() => {
          if (!routePath) return;
          ui.openAll(ancestors(routePath));
          ui.select(routePath);
          setFocus(routePath);
          setKb(true);
        }}
      >
        <Icon name="reveal" size={18} />
      </IconButton>
      )}
      <IconButton
        small
        label={ui.open.size ? 'Collapse all' : 'Expand all'}
        onClick={() => {
          if (ui.open.size) ui.collapseAll();
          else {
            const all: string[] = [];
            const walk = (ns: TreeNode[]): void => ns.forEach((n) => n.children && (all.push(n.path), walk(n.children)));
            walk(roots);
            ui.openAll(all);
          }
        }}
      >
        <Icon name={ui.open.size ? 'collapse' : 'expand'} size={18} />
      </IconButton>
    </div>
  );

  const treeEl = (
    <div
      ref={treeRef}
      className={`${s.tree} ${desktop ? s.compact : s.touch}`}
      role="tree"
      aria-label="Your Bower folder"
      tabIndex={0}
      aria-activedescendant={current ? `row-${encodeURIComponent(current)}` : undefined}
      onKeyDown={onKey}
      onBlur={() => setKb(false)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(null);
      }}
    >
      {loading && !tree ? <TreeSkeleton /> : rows.map((r) => <Fragment key={r.node.path}>
        {renderRow(r.node, r.level)}
        {pending?.folder === r.node.path && <PendingFolder
          key={JSON.stringify(pending)}
          folder={r.node}
          level={r.level + 1}
          onCancel={() => {
            ui.setNaming(null);
            returnFocusTo(nameOpener.current);
            setKb(nameOpener.current === treeRef.current);
          }}
          onMade={(path) => {
            if (useUi.getState().naming !== pending) return;
            ui.setNaming(null);
            setFocus(path);
            returnFocusTo(treeRef.current);
            setKb(true);
          }}
        />}
      </Fragment>)}
    </div>
  );

  return (
    <div className={s.explorer}>
      {header}
      {desktop ? (
        <ContextMenu.Root
          modal={false}
          onOpenChange={(o) => {
            if (o) return;
            setMenuNode(null);
            // The keyboard goes back to the tree at once, so a key pressed right after Escape reaches it.
            // A name box the menu opened keeps it; a sheet takes it from the tree and gives it back (Sheet remembers its opener).
            const naming = useUi.getState().naming;
            if (!useUi.getState().renaming && !(naming && 'folder' in naming && naming.inline)) treeRef.current?.focus();
          }}
        >
          <ContextMenu.Trigger asChild>{treeEl}</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className={menuCls.content} hidden={!menuNode} onCloseAutoFocus={(e) => e.preventDefault()}>
              {menuNode && <NodeMenuItems node={menuNode} Item={ContextMenu.Item} Separator={ContextMenu.Separator} beforeRun={() => {
                treeRef.current?.focus();
                nameOpener.current = openerNow();
              }} />}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ) : (
        treeEl
      )}
      <Sheet open={!!sheetNode} onOpenChange={(o) => !o && setSheetNode(null)} title={sheetNode ? (sheetNode.type === 'folder' ? sheetNode.name : thingName(sheetNode.name)) : ''} description={sheetNode ? parentOf(sheetNode.path).split('/').join(' / ') || 'Your Bower folder' : ''}>
        {sheetNode && <NodeSheetActions node={sheetNode} done={() => setSheetNode(null)} />}
      </Sheet>
    </div>
  );
}

/** A local row until its one named create succeeds; no Drive write is needed to start typing. */
function PendingFolder({ folder, level, onCancel, onMade }: {
  folder: TreeNode;
  level: number;
  onCancel: () => void;
  onMade: (path: string) => void;
}) {
  const act = useFileActions();
  const [name, setName] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const writing = useRef(false);
  const finished = useRef(false);
  const finish = (how: 'enter' | 'blur' | 'escape'): void => {
    if (writing.current || finished.current) return;
    const safe = nameRules(name).name;
    if (how === 'escape' || (!safe && how === 'blur')) {
      finished.current = true;
      onCancel();
      return;
    }
    if (!safe) return;
    // A refused name stays until an explicit retry; moving focus must not repeat the write.
    if (how === 'blur' && failure) return;
    writing.current = true;
    setFailure(null);
    void act.createNamed(folder.path, safe, {
      made: (path) => {
        finished.current = true;
        onMade(path);
      },
      failed: (sentence) => {
        writing.current = false;
        setFailure(sentence);
      },
    });
  };
  return <div
    role="treeitem"
    aria-level={level + 1}
    aria-selected={false}
    className={`${s.row} ${s.folder} ${s.pending}`}
    style={{ paddingLeft: 6 + level * 16 }}
  >
    {Array.from({ length: level }, (_, k) => <span key={k} className={s.guide} style={{ left: 15 + k * 16 }} />)}
    <span className={s.lead}><Icon name="folder" size={15} /></span>
    <div className={s.pendingName}>
      <NameField
        className={s.rename}
        inBox
        aria-label={`New folder in ${shownFolderName(folder.path, folder.name)}`}
        placeholder="Name"
        autoFocus
        value={name}
        failure={failure}
        onChange={(e) => {
          setName(e.target.value);
          setFailure(null);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            finish(e.key === 'Enter' ? 'enter' : 'escape');
          }
        }}
        onBlur={() => finish('blur')}
      />
    </div>
  </div>;
}

function RenameInput({ node, draft, onDone }: { node: TreeNode; draft: string | null; onDone: (name: string | null, how: 'enter' | 'blur' | 'escape') => void }) {
  const initial = node.type === 'folder' ? node.name : thingName(node.name);
  const [v, setV] = useState(draft ?? initial);
  const done = useRef(false);
  const finish = (name: string | null, how: 'enter' | 'blur' | 'escape'): void => {
    if (done.current) return;
    done.current = true;
    onDone(name === initial ? null : name, how);
  };
  return (
    <input
      className={s.rename}
      aria-label={`New name for ${node.type === 'folder' ? node.name : thingName(node.name)}`}
      value={v}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(v.trim() || null, 'enter');
        if (e.key === 'Escape') finish(null, 'escape');
      }}
      onBlur={() => finish(v.trim() || null, 'blur')}
    />
  );
}

type ItemComp = typeof ContextMenu.Item;
type SepComp = typeof ContextMenu.Separator;

/** The menu of a row; the same items on right-click and in the phone sheet. */
export function useNodeMenu(node: TreeNode, inline?: boolean) {
  const wide = useIsDesktop();
  const act = useFileActions();
  const binOrAsk = useBinOrAsk();
  const ui = useUi();
  const folder = node.type === 'folder';
  const root = isRoot(node.path);
  const marked = ui.bookmarks.includes(node.path);
  const { data: piles } = usePiles();
  const nav = useNavigate();
  const { data: run } = useRun();
  const items: Array<{ key: string; label: string; icon: Parameters<typeof Icon>[0]['name']; run: () => void; danger?: boolean; disabled?: boolean } | 'sep'> = [];
  if (inInbox(node.path) && node.path !== 'Inbox') {
    const pile = piles?.find((p) => p.path && (node.path === p.path || node.path.startsWith(`${p.path}/`)));
    if (pile) {
      items.push({ key: 'pile', label: 'Open the pile', icon: 'pile', run: () => nav(`/pile/${pile.id}`) });
      if (!folder) items.push({ key: 'tab', label: 'Open this file', icon: 'file', run: () => act.open(node) });
      items.push('sep');
      // A tidy-up going now has taken the inbox: removing waits, as on the pile page.
      if (isRunning(run)) items.push({ key: 'bin', label: 'Remove the pile (after the tidy-up)', icon: 'trash', danger: true, disabled: true, run: () => undefined });
      else items.push({ key: 'bin', label: 'Remove the pile from the inbox', icon: 'trash', danger: true, run: () => void act.trash(pile.path ?? node.path) });
    }
    return items;
  }
  if (folder) {
    items.push({ key: 'view', label: 'Open as a list or table', icon: 'table', run: () => act.open(node) });
    items.push({ key: 'folder', label: 'New folder', icon: 'newFolder', run: () => act.askFolderName(node.path, inline ?? wide) });
    items.push('sep');
  } else {
    items.push({ key: 'tab', label: 'Open in a new tab', icon: 'add', run: () => act.open(node, true) });
    items.push('sep');
  }
  if (!root) {
    items.push({ key: 'rename', label: 'Rename', icon: 'rename', run: () => ui.setRenaming(node.path) });
    items.push({ key: 'move', label: 'Move to…', icon: 'move', run: () => ui.setMoveFor(node.path) });
  }
  items.push({
    key: 'bm',
    label: marked ? 'Remove bookmark' : 'Bookmark',
    icon: 'bookmark',
    run: () => {
      ui.toggleBookmark(node.path);
      toast(marked ? 'Bookmark removed' : wide ? 'Bookmarked. Find it in the Bookmarks tab.' : 'Bookmarked. Find it at the top of Files.');
    },
  });
  items.push({ key: 'link', label: 'Copy link', icon: 'link', run: () => act.copyLink(node) });
  items.push({ key: 'drive', label: 'Open in Drive', icon: 'drive', run: () => act.openInDrive(node.path) });
  if (!root) {
    items.push('sep');
    items.push({ key: 'bin', label: 'Move to Bin', icon: 'trash', danger: true, run: () => binOrAsk(node) });
  }
  return items;
}

function NodeMenuItems({ node, Item, Separator, beforeRun }: { node: TreeNode; Item: ItemComp; Separator: SepComp; beforeRun?: () => void }) {
  const items = useNodeMenu(node, true);
  return (
    <>
      {items.map((it, i) =>
        it === 'sep' ? (
          <Separator key={`s${i}`} className={menuCls.sep} />
        ) : (
          <Item key={it.key} className={it.danger ? menuCls.danger : menuCls.item} onSelect={() => {
              // The keyboard goes back to the tree before the action runs, so a sheet it opens remembers the tree, not this menu.
              beforeRun?.();
              it.run();
            }} disabled={!!it.disabled}>
            <Icon name={it.icon} size={16} />
            {it.label}
          </Item>
        ),
      )}
    </>
  );
}

/** A thing's menu as a sheet, for the phone's note and folder pages (the tree opens it on a long press). */
export function NodeMenuButton({ node }: { node: TreeNode }) {
  const [open, setOpen] = useState(false);
  const name = node.type === 'folder' ? node.name : thingName(node.name);
  return (
    <>
      <IconButton className={s.pageMore} label={`More for ${name}`} onClick={() => setOpen(true)}>
        <Icon name="more" stroke={3} />
      </IconButton>
      <Sheet open={open} onOpenChange={setOpen} title={name} description={parentOf(node.path).split('/').join(' / ') || 'Your Bower folder'}>
        {open && <NodeSheetActions node={node} done={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

/** A page has no tree row to type a name in: Rename and New folder ask in a sheet. */
const ASKS: Record<string, (node: TreeNode) => void> = {
  rename: (node) => useUi.getState().setNaming({ rename: node.path }),
  folder: (node) => useUi.getState().setNaming({ folder: node.path, type: 'folder' }),
};

function NodeSheetActions({ node, done }: { node: TreeNode; done: () => void }) {
  const items = useNodeMenu(node)
    .filter((x) => x === 'sep' || x.key !== 'tab')
    .map((x) => (x !== 'sep' && ASKS[x.key] ? { ...x, run: () => ASKS[x.key]?.(node) } : x));
  return (
    <div className={s.sheetList}>
      {items.map((it, i) =>
        it === 'sep' ? (
          <hr key={`s${i}`} />
        ) : (
          <button
            key={it.key}
            type="button"
            className={it.danger ? s.sheetDanger : ''}
            disabled={!!it.disabled}
            onClick={() => {
              done();
              it.run();
            }}
          >
            <Icon name={it.icon} size={20} />
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div aria-hidden="true" style={{ padding: '6px 8px', display: 'grid', gap: 10 }}>
      {[70, 55, 62, 40, 66, 50].map((w, i) => (
        <span key={i} style={{ display: 'block', height: 14, width: `${w}%`, borderRadius: 6, background: 'var(--surface)' }} />
      ))}
    </div>
  );
}
