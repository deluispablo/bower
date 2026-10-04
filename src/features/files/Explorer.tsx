import * as ContextMenu from '@radix-ui/react-context-menu';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useTree } from '@/data/provider';
import { countFiles, displayName, findNode, isRoot, parentOf, visibleRows, type SortOrder } from '@/data/tree';
import type { TreeNode } from '@/data/types';
import { ancestors, useUi } from '@/app/ui-store';
import { decodeSplat, paraColor } from '@/app/paths';
import { IconButton } from '@/ui/Button';
import { Icon, BowerHead } from '@/ui/Icon';
import { menuCls } from '@/ui/menu';
import { Sheet } from '@/ui/Sheet';
import { useFileActions } from './file-actions';
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
  const routePath = useRoutePath();
  const [focus, setFocus] = useState<string | null>(null);
  const [kb, setKb] = useState(false);
  const [menuNode, setMenuNode] = useState<TreeNode | null>(null);
  const [sheetNode, setSheetNode] = useState<TreeNode | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const dragPath = useRef<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const treeRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ t: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  // Auto-reveal: the open note's folders open and its row is selected.
  useEffect(() => {
    if (!routePath) return;
    ui.openAll(ancestors(routePath));
    ui.select(routePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath]);

  const roots = useMemo(() => tree ?? [], [tree]);
  const rows = useMemo(() => visibleRows(roots, ui.open, ui.sort), [roots, ui.open, ui.sort]);
  const current = focus ?? ui.selected ?? rows[0]?.node.path ?? null;

  useEffect(() => {
    if (!kb || !current) return;
    treeRef.current?.querySelector(`[data-path="${CSS.escape(current)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current, kb]);

  const nodeAt = (path: string | null): TreeNode | null => (path ? findNode(roots, path) : null);

  const targetFolder = (): string => {
    const n = nodeAt(ui.selected);
    if (!n) return 'Inbox';
    return n.type === 'folder' ? n.path : parentOf(n.path) || 'Inbox';
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
      case 'F2':
        if (row && !isRoot(row.node.path)) {
          e.preventDefault();
          ui.setRenaming(row.node.path);
        }
        return;
      case 'Delete':
      case 'Backspace':
        if (row && !isRoot(row.node.path) && (e.metaKey || e.key === 'Delete')) {
          e.preventDefault();
          void act.trash(row.node.path);
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
    if (isRoot(node.path)) {
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
    if (!to || to === parentOf(from) || to === from || to.startsWith(`${from}/`)) {
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
    const isOpen = folder && ui.open.has(node.path);
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
        draggable={desktop && !renaming && !isRoot(node.path)}
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
            onDone={async (name) => {
              ui.setRenaming(null);
              if (name !== null) {
                const to = await act.rename(node.path, name);
                if (to) setFocus(to);
              }
              treeRef.current?.focus();
            }}
          />
        ) : (
          <span className={s.name}>{folder ? node.name : badge ? node.name.replace(/\.[A-Za-z0-9]{1,5}$/, '') : displayName(node.name)}</span>
        )}
        {badge && !renaming && <span className={s.badge}>{badge}</span>}
        {node.isNew && <span className={s.newDot} title="New since you last looked" aria-label="New" />}
        {folder && !isOpen && <span className={s.count}>{countFiles(node)}</span>}
      </div>
    );
  };

  const header = (
    <div className={s.nav}>
      <IconButton small label="New note" onClick={() => void act.create(targetFolder(), 'note')}>
        <Icon name="newNote" size={18} />
      </IconButton>
      <IconButton small label="New folder" onClick={() => void act.create(targetFolder(), 'folder')}>
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
      onFocus={() => setKb(true)}
      onBlur={() => setKb(false)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(null);
      }}
    >
      {loading && !tree ? <TreeSkeleton /> : rows.map((r) => renderRow(r.node, r.level))}
    </div>
  );

  return (
    <div className={s.explorer}>
      {header}
      {desktop ? (
        <ContextMenu.Root onOpenChange={(o) => !o && setMenuNode(null)}>
          <ContextMenu.Trigger asChild>{treeEl}</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className={menuCls.content} hidden={!menuNode}>
              {menuNode && <NodeMenuItems node={menuNode} Item={ContextMenu.Item} Separator={ContextMenu.Separator} />}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ) : (
        treeEl
      )}
      <Sheet open={!!sheetNode} onOpenChange={(o) => !o && setSheetNode(null)} title={sheetNode ? displayName(sheetNode.name) : ''} description={sheetNode ? parentOf(sheetNode.path).split('/').join(' / ') || 'Your Bower folder' : ''}>
        {sheetNode && <NodeSheetActions node={sheetNode} done={() => setSheetNode(null)} />}
      </Sheet>
    </div>
  );
}

function RenameInput({ node, onDone }: { node: TreeNode; onDone: (name: string | null) => void }) {
  const initial = node.type === 'folder' ? node.name : displayName(node.name).replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null): void => {
    if (done.current) return;
    done.current = true;
    onDone(name === initial ? null : name);
  };
  return (
    <input
      className={s.rename}
      aria-label={`New name for ${displayName(node.name)}`}
      value={v}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(v.trim() || null);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(v.trim() || null)}
    />
  );
}

type ItemComp = typeof ContextMenu.Item;
type SepComp = typeof ContextMenu.Separator;

/** The menu of a row; the same items on right-click and in the phone sheet. */
export function useNodeMenu(node: TreeNode) {
  const act = useFileActions();
  const ui = useUi();
  const folder = node.type === 'folder';
  const root = isRoot(node.path);
  const marked = ui.bookmarks.includes(node.path);
  const items: Array<{ key: string; label: string; icon: Parameters<typeof Icon>[0]['name']; run: () => void; danger?: boolean } | 'sep'> = [];
  if (folder) {
    items.push({ key: 'view', label: 'Open as a list or table', icon: 'table', run: () => act.open(node) });
    items.push({ key: 'note', label: 'New note', icon: 'newNote', run: () => void act.create(node.path, 'note') });
    items.push({ key: 'folder', label: 'New folder', icon: 'newFolder', run: () => void act.create(node.path, 'folder') });
    items.push('sep');
  } else {
    items.push({ key: 'tab', label: 'Open in a new tab', icon: 'add', run: () => act.open(node, true) });
    items.push('sep');
  }
  if (!root) {
    items.push({ key: 'rename', label: 'Rename', icon: 'rename', run: () => ui.setRenaming(node.path) });
    items.push({ key: 'move', label: 'Move to…', icon: 'move', run: () => ui.setMoveFor(node.path) });
  }
  items.push({ key: 'bm', label: marked ? 'Remove bookmark' : 'Bookmark', icon: 'bookmark', run: () => ui.toggleBookmark(node.path) });
  items.push({ key: 'link', label: 'Copy link', icon: 'link', run: () => act.copyLink(node) });
  items.push({ key: 'drive', label: 'Open in Drive', icon: 'drive', run: () => act.openInDrive(node.path) });
  if (!root) {
    items.push('sep');
    items.push({ key: 'bin', label: 'Move to Bin', icon: 'trash', danger: true, run: () => void act.trash(node.path) });
  }
  return items;
}

function NodeMenuItems({ node, Item, Separator }: { node: TreeNode; Item: ItemComp; Separator: SepComp }) {
  const items = useNodeMenu(node);
  return (
    <>
      {items.map((it, i) =>
        it === 'sep' ? (
          <Separator key={`s${i}`} className={menuCls.sep} />
        ) : (
          <Item key={it.key} className={it.danger ? menuCls.danger : menuCls.item} onSelect={it.run}>
            <Icon name={it.icon} size={16} />
            {it.label}
          </Item>
        ),
      )}
    </>
  );
}

function NodeSheetActions({ node, done }: { node: TreeNode; done: () => void }) {
  const items = useNodeMenu(node).filter((x) => x === 'sep' || x.key !== 'tab');
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
