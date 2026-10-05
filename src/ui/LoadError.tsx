import { useEffect, useRef } from 'react';
import type { Loaded } from '@/data/provider';
import { Button } from './Button';
import { focusMain } from './focus';

/** A failed read stays visible and can be asked for again without a page reload. */
export function LoadError({ state }: { state: Pick<Loaded<unknown>, 'error' | 'reload'> }) {
  const retried = useRef(false);
  useEffect(() => () => {
    if (retried.current) focusMain();
  }, []);
  useEffect(() => {
    if (!state.error && retried.current) {
      retried.current = false;
      focusMain();
    }
  }, [state.error]);
  if (!state.error) return null;
  return (
    <div role="alert" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <p>{state.error.message}</p>
      <Button variant="ghost" onClick={() => { retried.current = true; state.reload(); }}>Try again</Button>
    </div>
  );
}
