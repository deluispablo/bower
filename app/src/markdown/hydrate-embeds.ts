/**
 * Fills in the placeholders `renderNote` emits for embeds, once its HTML is
 * in the page: `<img data-bower-file>` gets an object URL of the image, and
 * `[data-bower-embed]` is replaced by the other note's body. Data comes from
 * injected loaders, so this has no Drive or cache dependency of its own.
 *
 * Caps (#188): transcluded notes nest at most `MAX_TRANSCLUSION_DEPTH`
 * deep, at most `MAX_TRANSCLUSIONS` per note in all, never a note inside
 * itself, and never one longer than `MAX_TRANSCLUDED_CHARS`; past a cap
 * the placeholder keeps its plain link. Images over `MAX_IMAGE_BYTES` are
 * not loaded (a link to Drive instead), and an object URL is only ever
 * created with an image MIME type.
 */

import type { DriveFile } from '../drive.js';
import type { VaultIndex } from '../vault-index.js';
import { driveViewUrl, embedKind, imageMimeType } from './embeds.js';

/** How deep transcluded notes nest: the host's embeds are depth 1. */
export const MAX_TRANSCLUSION_DEPTH = 3;
/** Transcluded notes per host note, all depths together. */
export const MAX_TRANSCLUSIONS = 20;
/** Longest note text, in characters, that is transcluded. */
export const MAX_TRANSCLUDED_CHARS = 200_000;
/** Largest image, in bytes, that is loaded inline. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface EmbedLoaders {
  index: VaultIndex;
  /** The bytes of an image file (from the cache or Drive). */
  loadImage: (file: DriveFile) => Promise<Blob>;
  /** The Markdown text of a note. */
  loadNoteText: (id: string) => Promise<string>;
  /**
   * Sanitized HTML of a transcluded note's body. `transclude` says whether
   * its own embedded notes may become placeholders again
   * (`renderNote(..., { transclude })`); it is `false` at the depth cap.
   */
  renderEmbeddedNote: (
    text: string,
    file: DriveFile,
    transclude: boolean,
  ) => string;
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
  let transclusions = 0;

  function imageUrl(file: DriveFile): Promise<string> {
    let url = urls.get(file.id);
    if (url === undefined) {
      url =
        file.size !== undefined && file.size > MAX_IMAGE_BYTES
          ? Promise.reject(new ImageTooLargeError())
          : loaders.loadImage(file).then((blob) => {
              if (cancelled) throw new CancelledError();
              if (blob.size > MAX_IMAGE_BYTES) throw new ImageTooLargeError();
              const type = imageMimeType(file, blob.type);
              if (type === undefined) {
                throw new Error('Embedded file is not an image type');
              }
              const typed =
                blob.type === type ? blob : new Blob([blob], { type });
              const objectUrl = createUrl(typed);
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
          // Too large is a limit, not a failure: nothing to report.
          if (!(err instanceof ImageTooLargeError)) console.error(err);
          img.replaceWith(failedImageLink(file, img.alt));
        });
    }
  }

  /**
   * Transcludes the placeholders under `scope`, which sit `depth` levels
   * down; `chain` holds the ids of the notes already open around them.
   */
  function hydrateTransclusions(
    scope: HTMLElement,
    depth: number,
    chain: ReadonlySet<string>,
  ): void {
    for (const placeholder of scope.querySelectorAll<HTMLElement>(
      '[data-bower-embed]',
    )) {
      const file = loaders.index.byId.get(placeholder.dataset.bowerEmbed ?? '');
      if (file === undefined || embedKind(file) !== 'note') continue;
      // A loop (a note inside itself) or one embed too many: keep the link.
      if (chain.has(file.id) || transclusions >= MAX_TRANSCLUSIONS) continue;
      transclusions += 1;
      loaders
        .loadNoteText(file.id)
        .then((text) => {
          if (cancelled || text.length > MAX_TRANSCLUDED_CHARS) return;
          const nested = depth < MAX_TRANSCLUSION_DEPTH;
          const section = transclusionSection(
            placeholder,
            loaders.renderEmbeddedNote(text, file, nested),
          );
          placeholder.replaceWith(section);
          hydrateImages(section);
          if (nested) {
            hydrateTransclusions(
              section,
              depth + 1,
              new Set([...chain, file.id]),
            );
          }
        })
        .catch((err: unknown) => {
          // The placeholder already shows a link to the note: keep it.
          if (!cancelled) console.error(err);
        });
    }
  }

  hydrateTransclusions(root, 1, new Set());
  hydrateImages(root);

  return () => {
    cancelled = true;
    for (const url of created) revokeUrl(url);
    created.length = 0;
  };
}

class CancelledError extends Error {}

/** An image over `MAX_IMAGE_BYTES`: shown as a link to Drive instead. */
class ImageTooLargeError extends Error {}

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
