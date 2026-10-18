/**
 * The runner's own text extraction for what the model is shown (P4-3, `c04-incorporation`): the original prepared
 * inputs before its agent ran (`agent/run.sh`: `pdftotext -layout` for a PDF's text layer, pandoc for Office files,
 * text as it is). The P2 preparation contract (C15, `docs/P2_ACCEPTANCE.md` "Preparation contract"; ARCHITECTURE:
 * "The runner can reconstruct missing preparation for external inputs or a closed browser") lets the runner prepare
 * what the app did not; today the admitted set carries no prepared text, so the runner always prepares it here.
 *
 * - Plain text and Markdown as they are, decoded as UTF-8.
 * - A PDF's text layer with `unpdf` (https://github.com/unjs/unpdf): UnJS's maintained build of Mozilla's PDF.js for
 *   server runtimes, pure JavaScript with no worker or native binary (GitHub's runner has no `pdftotext`), bundled
 *   by esbuild into the one-file runner. Chosen over `pdfjs-dist` itself (needs its legacy build and worker set up
 *   in Node) and `pdf-parse` (pins an old PDF.js).
 * - Pictures are checked here for the separate vision pass; scanned PDFs and other kinds get no text.
 *
 * Reads are bounded like the original's (`MAX_READ_BYTES`, by the listed size before any download, and
 * `MAX_PDF_PAGES`), and a PDF's pages are read only as far as its share of the run's text budget.
 */
import { getDocumentProxy } from 'unpdf';

/** The original's MAX_PDF_PAGES. */
export const MAX_PDF_PAGES = 300;
/** Bytes read for one thing's text at most (the original read up to 50 MB; the model sees far less anyway). */
export const MAX_READ_BYTES = 20 * 1024 * 1024;

/** A thing's text, or why there is none; `pagesNotRead`, a PDF's pages past `limit` that were never read. */
export type Extracted = { text: string; pagesNotRead?: number } | { text: null; why: string };

const TEXT = new Set(['.md', '.markdown', '.txt', '.text', '.csv', '.url']);
const PICTURE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.webp', '.tif', '.tiff', '.bmp']);

/** A file name's extension, lower case, with its dot; '' when it has none. */
export const extensionOf = (name: string): string => /(\.[^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** shortcut: photos over 7 MB and unsupported formats wait for a Drive thumbnail path when needed. */
export const MAX_PICTURE_BYTES = 7_000_000;
export const LOOKABLE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

/** null means download; text-only callers still use readable. */
export function lookable(name: string, size?: number): { text: null; why: string } | null {
  if (!LOOKABLE.has(extensionOf(name))) return { text: null, why: 'a kind of photo Bower cannot look at yet' };
  if (size !== undefined && size > MAX_PICTURE_BYTES) return { text: null, why: 'a photo too big for Bower to look at' };
  return null;
}

/** Recheck the downloaded size before sniffing supported image signatures. */
export function pictureOf(name: string, bytes: Uint8Array): { mediaType: string } | { text: null; why: string } {
  const skip = lookable(name, bytes.byteLength);
  if (skip) return skip;
  const starts = (magic: readonly number[], at = 0) => magic.every((b, i) => bytes[at + i] === b);
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return { mediaType: 'image/png' };
  if (starts([255, 216, 255])) return { mediaType: 'image/jpeg' };
  if (starts([71, 73, 70, 56, 55, 97]) || starts([71, 73, 70, 56, 57, 97])) return { mediaType: 'image/gif' };
  if (starts([82, 73, 70, 70]) && starts([87, 69, 66, 80, 86, 80], 8)) return { mediaType: 'image/webp' };
  return { text: null, why: 'a picture Bower could not read' };
}

/**
 * Whether the runner reads this thing's text at all, by its name and its listed size (`size`, when Drive gives one),
 * so nothing is downloaded that will not be read.
 */
export function readable(name: string, size?: number): Extracted | null {
  const ext = extensionOf(name);
  if (PICTURE.has(ext)) return { text: null, why: 'a picture, not text' };
  if (!TEXT.has(ext) && ext !== '.pdf') return { text: null, why: 'a kind of file whose text is not read yet' };
  if (size !== undefined && size > MAX_READ_BYTES) return { text: null, why: 'too big to read' };
  return null;
}

/**
 * The text of a thing the runner reads (see `readable`), from its bytes. A PDF is read page by page and stops once
 * its text passes `limit` characters (its share of the run's budget), saying how many pages it did not read; its
 * text joins each page's items as unpdf's `extractText` does.
 */
export async function extract(name: string, bytes: Uint8Array, limit = Number.POSITIVE_INFINITY): Promise<Extracted> {
  const skip = readable(name, bytes.byteLength);
  if (skip) return skip;
  if (extensionOf(name) !== '.pdf') {
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    } catch (e) {
      console.error(`A thing's text could not be read: ${e instanceof Error ? e.message : String(e)}`);
      return { text: null, why: 'text that could not be read' };
    }
  }
  try {
    const pdf = await getDocumentProxy(bytes.slice(), { verbosity: 0 });
    try {
      if (pdf.numPages > MAX_PDF_PAGES) return { text: null, why: `a PDF of more than ${MAX_PDF_PAGES} pages: not read` };
      const pages: string[] = [];
      let length = 0;
      while (pages.length < pdf.numPages && length <= limit) {
        const content = await (await pdf.getPage(pages.length + 1)).getTextContent();
        const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join('');
        pages.push(text);
        length += text.length + 1;
      }
      const text = pages.join('\n');
      if (!text.trim() && pages.length === pdf.numPages) return { text: null, why: 'a scanned PDF with no text layer: not read yet (OCR comes later)' };
      return pages.length < pdf.numPages ? { text, pagesNotRead: pdf.numPages - pages.length } : { text };
    } finally {
      await pdf.loadingTask.destroy();
    }
  } catch (e) {
    // The library's message names no content: kept for the log, never shown to the model or the person.
    console.error(`A PDF's text could not be read: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return { text: null, why: 'a PDF whose text could not be read' };
  }
}
