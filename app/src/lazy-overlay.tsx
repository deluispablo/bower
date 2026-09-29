/**
 * Loads an overlay's code on first use (#834), keeping it out of the startup
 * scripts. The overlay renders nothing until its chunk arrives; `preload`
 * fetches the chunk when the browser is idle, so by the time a person opens
 * the overlay it is already there and appears without a flash.
 */

import type { ComponentType, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export interface LazyOverlay<P> {
  Component: (props: P) => JSX.Element | null;
  /** Starts fetching the chunk; safe to call any number of times. */
  preload: () => void;
}

export function lazyOverlay<P extends object>(
  load: () => Promise<ComponentType<P>>,
): LazyOverlay<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;

  function preload(): void {
    pending ??= load().then(
      (component) => {
        loaded = component;
      },
      (error: unknown) => {
        pending = null;
        console.error('Could not load a screen part', error);
      },
    );
  }

  function Component(props: P): JSX.Element | null {
    const [ready, setReady] = useState<ComponentType<P> | null>(() => loaded);
    useEffect(() => {
      if (ready !== null) return;
      preload();
      let live = true;
      void pending?.then(() => {
        if (live && loaded !== null) setReady(() => loaded);
      });
      return () => {
        live = false;
      };
    }, [ready]);
    if (ready === null) return null;
    const Loaded = ready;
    return <Loaded {...props} />;
  }

  return { Component, preload };
}

/** Runs `task` once the browser is idle (or shortly after, where it cannot say). */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task);
    return () => {
      window.cancelIdleCallback(id);
    };
  }
  const timer = window.setTimeout(task, 1500);
  return () => {
    window.clearTimeout(timer);
  };
}
