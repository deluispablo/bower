import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { PoseBower } from '@/bird/Bower';
import { COULD_NOT_OPEN_TEXT, OPEN_ELSEWHERE_TEXT, PAGE_ONLY_TEXT, type PlaceSource } from '@/data/session';
import { BowerError } from '@/data/types';
import { Button } from '@/ui/Button';
import s from './open-elsewhere.module.css';

/**
 * Bower is active in another tab, window or device (TL-P2-13): this page shows only this screen until
 * the person chooses Use here, which moves the session here without a reload. `onUse` replaces the
 * place's own Use here (the Gatekeeper's also reveals the app once it finished).
 */
export function OpenElsewhere({ place, onUse }: { place: PlaceSource; onUse?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageOnly = useSyncExternalStore(place.subscribe, place.pageOnly);
  const button = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const id = useId();
  const titleId = `${id}-title`;
  const onlyId = `${id}-only`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The one thing to do here: focus starts on it, and comes back to it after a failed try.
  useEffect(() => {
    if (!busy) button.current?.focus();
  }, [busy]);

  const use = (): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    (onUse ?? (() => place.useHere()))().then(
      () => {
        if (mounted.current) setBusy(false);
      },
      (e: unknown) => {
        console.error(e);
        if (!mounted.current) return;
        setError(e instanceof BowerError ? e.message : COULD_NOT_OPEN_TEXT);
        setBusy(false);
      },
    );
  };

  return (
    <main className={s.page}>
      <div className={s.body}>
        <PoseBower pose="wait" size={120} />
        <h1 id={titleId} className={s.title}>
          {OPEN_ELSEWHERE_TEXT}
        </h1>
        {pageOnly && (
          <p id={onlyId} className={s.text}>
            {PAGE_ONLY_TEXT}
          </p>
        )}
        <Button ref={button} className={s.use} disabled={busy} onClick={use} aria-describedby={pageOnly ? `${titleId} ${onlyId}` : titleId}>
          Use here
        </Button>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
