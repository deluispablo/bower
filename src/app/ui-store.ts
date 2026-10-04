import { create } from 'zustand';
import type { SortOrder } from '@/data/tree';

/** UI state shared across screens. Data lives in the sources, not here. */
interface UiState {
  // explorer
  open: ReadonlySet<string>;
  sort: SortOrder;
  selected: string | null;
  renaming: string | null;
  toggle: (path: string, open?: boolean) => void;
  openAll: (paths: string[]) => void;
  collapseAll: () => void;
  select: (path: string | null) => void;
  setRenaming: (path: string | null) => void;
  setSort: (s: SortOrder) => void;
  // overlays
  paletteOpen: boolean;
  drawerOpen: boolean;
  tidyOpen: boolean;
  replayRunId: string | null;
  moveFor: string | null;
  setPalette: (o: boolean) => void;
  setDrawer: (o: boolean) => void;
  setTidy: (o: boolean) => void;
  startReplay: (runId: string | null) => void;
  setMoveFor: (path: string | null) => void;
  // desktop side panels
  leftTab: 'files' | 'search' | 'bookmarks';
  rightTab: 'links' | 'outline' | 'bower';
  setLeftTab: (t: UiState['leftTab']) => void;
  setRightTab: (t: UiState['rightTab']) => void;
  // bookmarks (device-only in phase 1)
  bookmarks: string[];
  toggleBookmark: (path: string) => void;
  /** A folder with things in it, waiting for a yes before it goes to the Bin. */
  confirmBin: { path: string; count: number; nested?: boolean } | null;
  setConfirmBin: (v: UiState['confirmBin']) => void;
  /** A name asked for in a sheet (from a page, where there is no tree row to type in). */
  naming: { rename: string } | { folder: string; type: 'note' | 'folder' } | null;
  setNaming: (v: UiState['naming']) => void;
  /** Keeps only the bookmarks for which `exists` says yes (things gone from the folder are dropped). */
  pruneBookmarks: (exists: (path: string) => boolean) => void;
  /** Sign-out: what this screen holds about the person goes (the device's copy is cleared by data/device). */
  forgetPerson: () => void;
  /** A thing moved or was renamed: open folders, selection and bookmarks follow; gone: they drop it. */
  relocate: (from: string, to: string | null) => void;
  /** Where moved and renamed things went this visit (old path → new), for old addresses. */
  moved: Record<string, string>;
  /** The current path of something that was at `path`, if it moved this visit. */
  whereNow: (path: string) => string | null;
  /** The note just made with New note, so Escape on its name takes it back. */
  justMade: string | null;
  setJustMade: (path: string | null) => void;
}

const SORT_KEY = 'bower:sort';
const OPEN_KEY = 'bower:open';
const BM_KEY = 'bower:bookmarks';
function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    // expected: storage may be blocked (a private window); the default holds.
    return fallback;
  }
}
function write(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // expected: Storage blocked: the choice lasts for this visit.
  }
}

export const useUi = create<UiState>((set, get) => ({
  open: new Set(read<string[]>(OPEN_KEY, ['Projects', 'Areas', 'Projects/Flat hunt'])),
  sort: read<SortOrder>(SORT_KEY, 'name-az'),
  selected: null,
  renaming: null,
  toggle: (path, force) => {
    const open = new Set(get().open);
    const want = force ?? !open.has(path);
    if (want) open.add(path);
    else open.delete(path);
    write(OPEN_KEY, [...open]);
    set({ open });
  },
  openAll: (paths) => {
    const open = new Set([...get().open, ...paths]);
    write(OPEN_KEY, [...open]);
    set({ open });
  },
  collapseAll: () => {
    write(OPEN_KEY, []);
    set({ open: new Set() });
  },
  select: (selected) => set({ selected }),
  setRenaming: (renaming) => set({ renaming }),
  setSort: (sort) => {
    write(SORT_KEY, sort);
    set({ sort });
  },
  paletteOpen: false,
  drawerOpen: false,
  tidyOpen: false,
  replayRunId: null,
  moveFor: null,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setTidy: (tidyOpen) => set({ tidyOpen }),
  startReplay: (replayRunId) => set({ replayRunId }),
  setMoveFor: (moveFor) => set({ moveFor }),
  leftTab: 'files',
  rightTab: 'links',
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab }),
  bookmarks: read<string[]>(BM_KEY, ['Projects/Flat hunt/Flat hunt.md', 'Areas/Money/Budget 2026.md']),
  toggleBookmark: (path) => {
    const b = get().bookmarks;
    const next = b.includes(path) ? b.filter((x) => x !== path) : [...b, path];
    write(BM_KEY, next);
    set({ bookmarks: next });
  },
  confirmBin: null,
  setConfirmBin: (v) => set({ confirmBin: v }),
  naming: null,
  setNaming: (v) => set({ naming: v }),
  forgetPerson: () => {
    write(OPEN_KEY, []);
    write(BM_KEY, []);
    set({ open: new Set(), selected: null, bookmarks: [], moved: {}, justMade: null, renaming: null, confirmBin: null, naming: null });
  },
  pruneBookmarks: (exists) => {
    const b = get().bookmarks;
    const next = b.filter(exists);
    if (next.length === b.length) return;
    write(BM_KEY, next);
    set({ bookmarks: next });
  },
  relocate: (from, to) => {
    const under = (p: string): boolean => p === from || p.startsWith(`${from}/`);
    const map = (p: string): string | null => (under(p) ? (to === null ? null : to + p.slice(from.length)) : p);
    const open = new Set([...get().open].map(map).filter((p): p is string => !!p));
    const bookmarks = get().bookmarks.map(map).filter((p): p is string => !!p);
    const sel = get().selected;
    write(OPEN_KEY, [...open]);
    write(BM_KEY, bookmarks);
    const moved = { ...get().moved };
    if (to !== null) {
      for (const [k, v] of Object.entries(moved)) if (v === from || v.startsWith(`${from}/`)) moved[k] = to + v.slice(from.length);
      moved[from] = to;
    }
    set({ open, bookmarks, selected: sel ? map(sel) : sel, moved });
  },
  moved: {},
  whereNow: (path) => {
    const m = get().moved;
    let best = '';
    for (const k of Object.keys(m)) if ((path === k || path.startsWith(`${k}/`)) && k.length > best.length) best = k;
    return best ? (m[best] ?? '') + path.slice(best.length) : null;
  },
  justMade: null,
  setJustMade: (justMade) => set({ justMade }),
}));

/** Every ancestor folder of a path, nearest last. */
export function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
