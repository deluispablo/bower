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
}
let n = 1;
export const useTabs = create<Tabs>((set, get) => ({
  tabs: [{ id: 1, route: '/' }],
  active: 1,
  follow: (route) => {
    const { tabs, active } = get();
    if (tabs.find((t) => t.id === active)?.route === route) return;
    // Back and forward land on a page another tab already shows: make that tab the active one.
    const other = tabs.find((t) => t.route === route);
    if (other) set({ active: other.id });
    else set({ tabs: tabs.map((t) => (t.id === active ? { ...t, route } : t)) });
  },
  open: (route) => {
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
  activate: (id) => {
    const t = get().tabs.find((x) => x.id === id) ?? null;
    if (t) set({ active: id });
    return t;
  },
}));
