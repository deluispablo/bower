/**
 * Fills in the placeholders `renderNote` emits for embeds, once its HTML is
 * in the page: `<img data-bower-file>` gets an object URL of the image, and
 * `[data-bower-embed]` is replaced by the other note's body. Data comes from
 * injected loaders, so this has no Drive or cache dependency of its own.
 */

import type { DriveFile } from '../drive.js';
import type { VaultIndex } from '../vault-index.js';
import { driveViewUrl, embedKind } from './embeds.js';

export interface EmbedLoaders {
  index: VaultIndex;
  /** The bytes of an image file (from the cache or Drive). */
  loadImage: (file: DriveFile) => Promise<Blob>;
  /** The Markdown text of a note. */
  loadNoteText: (id: string) => Promise<string>;
  /**
   * Sanitized HTML of a transcluded note's body. Must not transclude again
   * (`renderNote(..., { transclude: false })`).
   */
  renderEmbeddedNote: (text: string, file: DriveFile) => string;
  /** Defaults to `URL.createObjectURL`; injectable for tests. */
  createObjectUrl?: (blob: Blob) => string;
  /** Defaults to `URL.revokeObjectURL`; injectable for tests. */
  revokeObjectUrl?: (url: string) => void;
}

/**
 * Starts loading every embed under `root`. Returns a cleanup that stops
 * pending work from touching the DOM and revokes every object URL created;
 * call it when the note changes or the view unmounts.
 */
export function hydrateEmbeds(
  root: HTMLElement,
  loaders: EmbedLoaders,
): () => void {
  const createUrl =
    loaders.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl =
    loaders.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const urls = new Map<string, Promise<string>>();
  const created: string[] = [];
  let cancelled = false;

  function imageUrl(file: DriveFile): Promise<string> {
    let url = urls.get(file.id);
    if (url === undefined) {
      url = loaders.loadImage(file).then((blob) => {
        if (cancelled) throw new CancelledError();
        const objectUrl = createUrl(blob);
        created.push(objectUrl);
        return objectUrl;
      });
      urls.set(file.id, url);
    }
    return url;
  }

  function hydrateImages(scope: HTMLElement): void {
    for (const img of scope.querySelectorAll<HTMLImageElement>(
      'img[data-bower-file]',
    )) {
      const file = loaders.index.byId.get(img.dataset.bowerFile ?? '');
      if (file === undefined || embedKind(file) !== 'image') continue;
      imageUrl(file)
        .then((url) => {
          if (!cancelled) img.src = url;
        })
        .catch((err: unknown) => {
          if (cancelled || err instanceof CancelledError) return;
          console.error(err);
          img.replaceWith(failedImageLink(file, img.alt));
        });
    }
  }

  function hydrateTransclusions(): void {
    for (const placeholder of root.querySelectorAll<HTMLElement>(
      '[data-bower-embed]',
    )) {
      const file = loaders.index.byId.get(placeholder.dataset.bowerEmbed ?? '');
      if (file === undefined || embedKind(file) !== 'note') continue;
      loaders
        .loadNoteText(file.id)
        .then((text) => {
          if (cancelled) return;
          const section = transclusionSection(
            placeholder,
            loaders.renderEmbeddedNote(text, file),
          );
          placeholder.replaceWith(section);
          hydrateImages(section);
        })
        .catch((err: unknown) => {
          // The placeholder already shows a link to the note: keep it.
          if (!cancelled) console.error(err);
        });
    }
  }

  hydrateTransclusions();
  hydrateImages(root);

  return () => {
    cancelled = true;
    for (const url of created) revokeUrl(url);
    created.length = 0;
  };
}

class CancelledError extends Error {}

/** A link to open an image in Drive, shown when it could not be loaded. */
function failedImageLink(file: DriveFile, alt: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'wikilink wikilink-file embed-failed';
  link.href = driveViewUrl(file);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = alt === '' ? file.name : alt;
  return link;
}

/**
 * `<section class="transclusion">`: the placeholder's link to the note as
 * a heading, then the note body. Heading ids are dropped so they do not
 * clash with the host note's anchors.
 */
function transclusionSection(
  placeholder: HTMLElement,
  bodyHtml: string,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'transclusion';
  const title = document.createElement('p');
  title.className = 'transclusion-title';
  const link = placeholder.querySelector('a');
  if (link !== null) title.append(link);
  const body = document.createElement('div');
  body.className = 'transclusion-body';
  body.innerHTML = bodyHtml;
  for (const element of body.querySelectorAll('[id]')) {
    element.removeAttribute('id');
  }
  section.append(title, body);
  return section;
}
