/**
 * Whether Add's "Take a photo" door shows at all (#339, issue 21.7): a
 * touch device that reports at least one camera; hidden everywhere else,
 * including a desktop with a touchscreen but no webcam. `hasVideoInput`
 * is the rule itself, plain and unit-tested; `useHasCamera` is the async
 * wiring around `navigator.mediaDevices.enumerateDevices()` that feeds
 * it, defaulting to hidden until that resolves (so the door never flashes
 * on then off).
 */

import { useEffect, useState } from 'preact/hooks';

/** A `MediaDeviceInfo`, loosened to what the rule actually reads (real
 * objects and test fixtures alike). */
export interface DeviceKind {
  kind: string;
}

/** The rule itself: at least one `videoinput` device in the list. */
export function hasVideoInput(devices: readonly DeviceKind[]): boolean {
  return devices.some((device) => device.kind === 'videoinput');
}

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && 'ontouchstart' in window;
}

/** `false` until proven otherwise: no touch, no `mediaDevices`, a
 * rejected `enumerateDevices()`, and simply no camera all read the same,
 * "hidden" (spec 21.7). */
export function useHasCamera(): boolean {
  const [hasCamera, setHasCamera] = useState(false);

  useEffect(() => {
    if (!isTouchDevice()) return;
    const mediaDevices =
      typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (mediaDevices?.enumerateDevices === undefined) return;
    let cancelled = false;
    mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (!cancelled) setHasCamera(hasVideoInput(devices));
      })
      .catch(() => {
        // Left as hidden — the same as no camera.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return hasCamera;
}
