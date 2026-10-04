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
}

let n = 0;
export const useToasts = create<Toasts>((set, get) => ({
  list: [],
  show: (text, action) => {
    const id = ++n;
    set({ list: [...get().list.slice(-2), action ? { id, text, action } : { id, text }] });
    setTimeout(() => get().dismiss(id), action ? 6000 : 3500);
  },
  dismiss: (id) => set({ list: get().list.filter((t) => t.id !== id) }),
  dismissAction: (label) => set({ list: get().list.filter((t) => t.action?.label !== label) }),
}));

export const toast = (text: string, action?: Toast['action']): void => useToasts.getState().show(text, action);

export function Toasts() {
  const { list, dismiss } = useToasts();
  return (
    <div className={s.toasts} role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={s.toast}>
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
