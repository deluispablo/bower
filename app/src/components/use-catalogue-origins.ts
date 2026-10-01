import { useEffect, useState } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { parseCatalogueOrigins } from '../file-origin.js';
import type { Origin } from '../file-origin.js';

/**
 * `index.md`'s text by `id:modifiedTime`, as read in this tab (#922,
 * T950-1): a folder opened again starts from the catalogue it already knows
 * instead of an empty one. A failed read is not kept, so it is tried again.
 */
const catalogueTexts = new Map<string, string>();

function catalogueKey(
  catalogue: Pick<DriveFile, 'id' | 'modifiedTime'>,
): string {
  return `${catalogue.id}:${catalogue.modifiedTime ?? ''}`;
}

/** The catalogue's text if this tab already read this version of it;
 * `''` when there is no catalogue at all. */
export function peekCatalogueText(
  catalogue: Pick<DriveFile, 'id' | 'modifiedTime'> | undefined,
): string | undefined {
  if (catalogue === undefined) return '';
  return catalogueTexts.get(catalogueKey(catalogue));
}

/** Reads the catalogue's text once per version; a failed read is logged
 * and answers `''`. */
export async function readCatalogueText(
  catalogue: Pick<DriveFile, 'id' | 'modifiedTime'> | undefined,
  getNoteText: (id: string) => Promise<string>,
): Promise<string> {
  if (catalogue === undefined) return '';
  const known = peekCatalogueText(catalogue);
  if (known !== undefined) return known;
  try {
    const text = await getNoteText(catalogue.id);
    catalogueTexts.set(catalogueKey(catalogue), text);
    return text;
  } catch (err: unknown) {
    console.error(err);
    return '';
  }
}

/**
 * The origins `index.md` states (`parseCatalogueOrigins`), read once per
 * version of the catalogue through the vault's note cache. Empty until the
 * text arrives (unless this tab already read it), and when there is no
 * catalogue or it cannot be read (the rows then fall back to their app
 * properties or "in this folder").
 */
export function useCatalogueOrigins(
  catalogue: DriveFile | undefined,
  getNoteText: (id: string) => Promise<string>,
): ReadonlyMap<string, Origin> {
  const [origins, setOrigins] = useState<ReadonlyMap<string, Origin>>(() =>
    parseCatalogueOrigins(peekCatalogueText(catalogue) ?? ''),
  );
  const id = catalogue?.id;
  const version = catalogue?.modifiedTime;

  useEffect(() => {
    if (catalogue === undefined) {
      setOrigins(new Map());
      return;
    }
    let cancelled = false;
    void readCatalogueText(catalogue, getNoteText).then((text) => {
      if (!cancelled) setOrigins(parseCatalogueOrigins(text));
    });
    return () => {
      cancelled = true;
    };
  }, [id, version, getNoteText]);

  return origins;
}
