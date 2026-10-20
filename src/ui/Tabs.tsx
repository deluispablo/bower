import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { hintCls } from './hint';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon: ReactNode;
}

interface Props<K extends string> {
  label: string;
  /** Ids of the tabs and their panel start with this. */
  id: string;
  items: ReadonlyArray<TabItem<K>>;
  value: K;
  /** `by`: a click or a key (arrows keep the keyboard on the tabs). */
  onChange: (key: K, by: 'click' | 'key') => void;
  className?: string;
  tabClassName?: string;
}

/**
 * Icon tabs as a screen reader and the keyboard expect them, each showing its name as a hint: one Tab stop
 * (the chosen tab), arrows and Home/End move between them, and each names the
 * panel it shows (`tabPanel` gives the panel its side of the link).
 */
export function Tabs<K extends string>({ label, id, items, value, onChange, className = '', tabClassName = '' }: Props<K>) {
  const list = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent, i: number): void => {
    const n = items.length;
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    const next = items[to];
    if (!next) return;
    e.preventDefault();
    onChange(next.key, 'key');
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  };
  return (
    <div ref={list} className={className} role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button
          key={t.key}
          id={`${id}-tab-${t.key}`}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          aria-controls={`${id}-panel`}
          tabIndex={value === t.key ? 0 : -1}
          aria-label={t.label}
          className={`${tabClassName} ${hintCls}`}
          onClick={() => onChange(t.key, 'click')}
          onKeyDown={(e) => move(e, i)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

/** The panel side of `Tabs`: spread on the element that shows the chosen tab. */
export function tabPanel(id: string, value: string): { id: string; role: 'tabpanel'; 'aria-labelledby': string } {
  return { id: `${id}-panel`, role: 'tabpanel', 'aria-labelledby': `${id}-tab-${value}` };
}
