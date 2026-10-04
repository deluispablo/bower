import { create } from 'zustand';
import s from './ui.module.css';

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
interface Toasts {
  list: Toast[];
  show: (text: string, action?: Toast['action']) => void;
  dismiss: (id: number) => void;
  /** Drops toasts whose action no longer makes sense (e.g. "Tidy up now" once a run started). */
  dismissAction: (label: string) => void;
  /** The pointer or the keyboard is on a toast: it waits; when they leave, its time starts again. */
  hold: (id: number, on: boolean) => void;
}

/** Long enough to read a sentence and reach its button (WCAG 2.2.1 asks for room to act). */
const ACTION_MS = 8000;
const PLAIN_MS = 4000;
let n = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
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
    },
    hold: (id, on) => {
      const t = get().list.find((x) => x.id === id);
      if (!t) return;
      if (on) clearTimeout(timers.get(id));
      else later(id, t.action ? ACTION_MS : PLAIN_MS);
    },
    dismiss: (id) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      set({ list: get().list.filter((t) => t.id !== id) });
    },
    dismissAction: (label) => set({ list: get().list.filter((t) => t.action?.label !== label) }),
  };
});

export const toast = (text: string, action?: Toast['action']): void =>
  useToasts.getState().show(text, action);

export function Toasts() {
  const { list, dismiss, hold } = useToasts();
  return (
    <div className={s.toasts} role="status" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={s.toast}
          onMouseEnter={() => hold(t.id, true)}
          onMouseLeave={() => hold(t.id, false)}
          onFocus={() => hold(t.id, true)}
          onBlur={() => hold(t.id, false)}
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
