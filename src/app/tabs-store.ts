import { create } from 'zustand';

/** The desktop's open tabs, like Obsidian: each holds a route; one is active. */
export interface Tab {
  id: number;
  route: string;
}
interface Tabs {
  tabs: Tab[];
  active: number;
  /** The active tab now shows `route` (a normal navigation). */
  follow: (route: string) => void;
  open: (route: string) => Tab;
  close: (id: number) => Tab | null;
  activate: (id: number) => Tab | null;
  /** One tab on Home, as on a first visit (sign-out). */
  reset: () => void;
  /** Whose tabs these are: someone else signed in on this browser tab starts with one tab. */
  owner: string | null;
  forPerson: (who: string) => void;
  /** A note or folder moved: tabs showing it (or something inside it) follow. */
  relocate: (fromRoute: string, toRoute: string) => void;
}
/** Kept for the browser tab, so a reload keeps them (forgotten at sign-out with the rest of the person's things). */
const KEY = 'bower:tabs';
function kept(): { tabs: Tab[]; active: number; owner: string | null } {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object' && Array.isArray((v as { tabs?: unknown }).tabs)) {
      const tabs = (v as { tabs: unknown[] }).tabs.filter((t): t is Tab => !!t && typeof t === 'object' && typeof (t as Tab).id === 'number' && typeof (t as Tab).route === 'string');
      const active = (v as { active?: unknown }).active;
      const owner = (v as { owner?: unknown }).owner;
      if (tabs.length) return { tabs, active: typeof active === 'number' && tabs.some((t) => t.id === active) ? active : (tabs[0]?.id ?? 1), owner: typeof owner === 'string' ? owner : null };
    }
  } catch {
    // expected: no storage or an old shape; one tab, as on a first visit.
  }
  return { tabs: [{ id: 1, route: '/' }], active: 1, owner: null };
}
const start = kept();
let n = Math.max(1, ...start.tabs.map((t) => t.id));
export const useTabs = create<Tabs>((set, get) => ({
  tabs: start.tabs,
  active: start.active,
  owner: start.owner,
  forPerson: (who) => {
    const { owner } = get();
    if (owner === who) return;
    // Tabs opened before anyone signed in are adopted; tabs kept for an earlier person are not theirs to see.
    if (owner === null) return set({ owner: who });
    set({ owner: who, tabs: [{ id: 1, route: '/' }], active: 1 });
  },
  follow: (route) => {
    const { tabs, active } = get();
    if (tabs.find((t) => t.id === active)?.route === route) return;
    // Back and forward land on a page another tab already shows: make that tab the active one.
    const other = tabs.find((t) => t.route === route);
    if (other) set({ active: other.id });
    else set({ tabs: tabs.map((t) => (t.id === active ? { ...t, route } : t)) });
  },
  open: (route) => {
    // A page already open in a tab: go to that tab instead of opening it twice.
    const existing = get().tabs.find((x) => x.route === route);
    if (existing) {
      set({ active: existing.id });
      return existing;
    }
    const t = { id: ++n, route };
    set({ tabs: [...get().tabs, t], active: t.id });
    return t;
  },
  close: (id) => {
    const { tabs, active } = get();
    if (tabs.length === 1) {
      const t = { id: tabs[0]?.id ?? 1, route: '/' };
      set({ tabs: [t], active: t.id });
      return t;
    }
    const i = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    const newActive = active === id ? (next[Math.max(0, i - 1)] ?? next[0]) : next.find((t) => t.id === active);
    set({ tabs: next, active: newActive?.id ?? 1 });
    return active === id ? (newActive ?? null) : null;
  },
  reset: () => set({ tabs: [{ id: 1, route: '/' }], active: 1, owner: null }),
  relocate: (fromRoute, toRoute) =>
    set({
      tabs: get().tabs.map((t) => (t.route === fromRoute || t.route.startsWith(`${fromRoute}/`) ? { ...t, route: toRoute + t.route.slice(fromRoute.length) } : t)),
    }),
  activate: (id) => {
    const t = get().tabs.find((x) => x.id === id) ?? null;
    if (t) set({ active: id });
    return t;
  },
}));

useTabs.subscribe(({ tabs, active, owner }) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tabs, active, owner }));
  } catch (e) {
    console.error(e);
  }
});
