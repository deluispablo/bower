import { useEffect, useState } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { parseCatalogueOrigins } from '../file-origin.js';
import type { Origin } from '../file-origin.js';

/**
 * The origins `index.md` states (`parseCatalogueOrigins`), read once per
 * version of the catalogue through the vault's note cache. Empty until the
 * text arrives, and when there is no catalogue or it cannot be read (the
 * rows then fall back to their app properties or "in this folder").
 */
export function useCatalogueOrigins(
  catalogue: DriveFile | undefined,
  getNoteText: (id: string) => Promise<string>,
): ReadonlyMap<string, Origin> {
  const [origins, setOrigins] = useState<ReadonlyMap<string, Origin>>(
    () => new Map(),
  );
  const id = catalogue?.id;
  const version = catalogue?.modifiedTime;

  useEffect(() => {
    if (id === undefined) {
      setOrigins(new Map());
      return;
    }
    let cancelled = false;
    getNoteText(id).then(
      (text) => {
        if (!cancelled) setOrigins(parseCatalogueOrigins(text));
      },
      (err: unknown) => {
        console.error(err);
        if (!cancelled) setOrigins(new Map());
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, version, getNoteText]);

  return origins;
}
