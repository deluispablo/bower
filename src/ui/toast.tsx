import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { returnFocusTo } from './focus';
import s from './ui.module.css';

interface Toast {
  id: number;
  text: string;
  /** A run that returns a promise keeps its toast until it settles, so what it ends with can `replace` it. */
  action?: { label: string; run: () => unknown };
}
type Holder = 'pointer' | 'keyboard' | 'action';
interface Toasts {
  list: Toast[];
  /** Shows a toast; its id, to `replace` it later. */
  show: (text: string, action?: Toast['action']) => number;
  /**
   * The same toast with new words and action (an Undo refused, then Try again): one message, never a second. It keeps
   * its place and its button, so focus stays on the action, and its time starts again (paused while held).
   */
  replace: (id: number, text: string, action?: Toast['action']) => void;
  /** The action pressed: it runs, and the toast goes once it ends, unless it was replaced meanwhile. */
  press: (id: number) => void;
  dismiss: (id: number) => void;
  /** Drops toasts whose action no longer makes sense (e.g. "Tidy up now" once a run started). */
  dismissAction: (label: string) => void;
  /** The pointer or the keyboard is on a toast: it waits; when they leave, its time starts again. */
  hold: (id: number, on: boolean, by: Holder) => void;
}

/** Long enough to read a sentence and reach its button (WCAG 2.2.1 asks for room to act). */
const ACTION_MS = 8000;
const PLAIN_MS = 4000;
let n = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const held = new Map<number, Set<string>>();
export const useToasts = create<Toasts>((set, get) => {
  const later = (id: number, ms: number): void => {
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => get().dismiss(id), ms),
    );
  };
  return {
    list: [],
    show: (text, action) => {
      const id = ++n;
      set({ list: [...get().list.slice(-2), action ? { id, text, action } : { id, text }] });
      later(id, action ? ACTION_MS : PLAIN_MS);
      return id;
    },
    replace: (id, text, action) => {
      if (!get().list.some((t) => t.id === id)) {
        // Gone meanwhile (put away by something newer): said once, as a new message.
        get().show(text, action);
        return;
      }
      set({ list: get().list.map((t) => (t.id !== id ? t : action ? { id, text, action } : { id, text })) });
      const holders = held.get(id);
      holders?.delete('action');
      if (holders?.size) clearTimeout(timers.get(id));
      else later(id, action ? ACTION_MS : PLAIN_MS);
    },
    press: (id) => {
      const t = get().list.find((x) => x.id === id);
      if (!t?.action) return;
      const ran = t.action.run();
      if (!(ran instanceof Promise)) {
        get().dismiss(id);
        return;
      }
      // It waits while its action runs; what the action ends with may replace it, and then it stays.
      get().hold(id, true, 'action');
      const settled = (): void => {
        if (get().list.find((x) => x.id === id) === t) get().dismiss(id);
      };
      // expected: the action tells its own failure (it replaces the toast or reports it); this only puts the toast away.
      void ran.then(settled, settled);
    },
    hold: (id, on, by) => {
      const t = get().list.find((x) => x.id === id);
      if (!t) return;
      const holders = held.get(id) ?? new Set<string>();
      if (on) holders.add(by);
      else holders.delete(by);
      held.set(id, holders);
      // It waits while the pointer or the keyboard is on it; its time starts again when both have left.
      if (holders.size) clearTimeout(timers.get(id));
      else later(id, t.action ? ACTION_MS : PLAIN_MS);
    },
    dismiss: (id) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      held.delete(id);
      set({ list: get().list.filter((t) => t.id !== id) });
    },
    dismissAction: (label) => set({ list: get().list.filter((t) => t.action?.label !== label) }),
  };
});

export const toast = (text: string, action?: Toast['action']): number => useToasts.getState().show(text, action);

export function Toasts() {
  const { list, press, hold } = useToasts();
  // Where the keyboard was before a toast took it, so that closing the toast gives it back
  // (WAI-ARIA APG: on close, focus returns to what it came from). A toast that never had it changes nothing.
  const from = useRef(new Map<number, HTMLElement | null>());
  const had = useRef(new Set<number>());
  const shown = useRef<number[]>([]);
  useEffect(() => {
    const now = list.map((t) => t.id);
    for (const id of shown.current) {
      if (now.includes(id)) continue;
      const wasIn = had.current.has(id);
      const opener = from.current.get(id) ?? null;
      had.current.delete(id);
      from.current.delete(id);
      // Only when the keyboard fell to nothing: a press that moved it somewhere keeps that.
      if (wasIn && (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected)) returnFocusTo(opener);
    }
    shown.current = now;
  }, [list]);
  return (
    <div className={s.toasts} role="status" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={s.toast}
          onMouseEnter={() => hold(t.id, true, 'pointer')}
          onMouseLeave={() => hold(t.id, false, 'pointer')}
          onFocus={(e) => {
            if (!had.current.has(t.id)) {
              had.current.add(t.id);
              const was = e.relatedTarget;
              from.current.set(t.id, was instanceof HTMLElement && !e.currentTarget.contains(was) ? was : null);
            }
            hold(t.id, true, 'keyboard');
          }}
          onBlur={() => hold(t.id, false, 'keyboard')}
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => press(t.id)}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
