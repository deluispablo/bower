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
}

const SORT_KEY = 'bower:sort';
const OPEN_KEY = 'bower:open';
const BM_KEY = 'bower:bookmarks';
function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Storage blocked: the choice lasts for this visit.
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
}));

/** Every ancestor folder of a path, nearest last. */
export function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
