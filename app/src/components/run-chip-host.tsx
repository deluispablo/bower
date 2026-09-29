/**
 * Mounts the tidy-up chip's slot filler (`run-chip.tsx`) once the app has
 * started. The chip is not needed to draw the first screen, so its code loads
 * on its own after start and stays out of the startup budget (#41).
 */

import type { ComponentType, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export function RunChipHost(): JSX.Element | null {
  const [Filler, setFiller] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    import('./run-chip.js').then(
      (module) => {
        if (live) setFiller(() => module.RunChipFiller);
      },
      (error: unknown) => {
        console.error('The tidy-up chip did not load', error);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return Filler === null ? null : <Filler />;
}
