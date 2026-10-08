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
 * - Pictures, scanned PDFs (no text layer) and other kinds get no text: OCR is a later slice. The reason is said.
 *
 * Reads are bounded like the original's (`MAX_READ_BYTES`, `MAX_PDF_PAGES`): a file past them is not read.
 */
import { extractText, getDocumentProxy } from 'unpdf';

/** The original's MAX_PDF_PAGES. */
export const MAX_PDF_PAGES = 300;
/** Bytes read for one thing's text at most (the original read up to 50 MB; the model sees far less anyway). */
export const MAX_READ_BYTES = 20 * 1024 * 1024;

export type Extracted = { text: string } | { text: null; why: string };

const TEXT = new Set(['.md', '.markdown', '.txt', '.text', '.csv', '.url']);
const PICTURE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.webp', '.tif', '.tiff', '.bmp']);

/** A file name's extension, lower case, with its dot; '' when it has none. */
const extensionOf = (name: string): string => /(\.[^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** Whether the runner reads this kind of thing's text at all, so a read is only made when it does. */
export function readable(name: string): Extracted | null {
  const ext = extensionOf(name);
  if (TEXT.has(ext) || ext === '.pdf') return null;
  if (PICTURE.has(ext)) return { text: null, why: 'a picture: its text is not read yet (OCR comes later)' };
  return { text: null, why: 'a kind of file whose text is not read yet' };
}

/** The text of a thing the runner reads (see `readable`), from its bytes. */
export async function extract(name: string, bytes: Uint8Array): Promise<Extracted> {
  const skip = readable(name);
  if (skip) return skip;
  if (bytes.byteLength > MAX_READ_BYTES) return { text: null, why: 'too big to read' };
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
      const { text } = await extractText(pdf, { mergePages: true });
      if (!text.trim()) return { text: null, why: 'a scanned PDF with no text layer: not read yet (OCR comes later)' };
      return { text };
    } finally {
      await pdf.loadingTask.destroy();
    }
  } catch (e) {
    // The library's message names no content: kept for the log, never shown to the model or the person.
    console.error(`A PDF's text could not be read: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return { text: null, why: 'a PDF whose text could not be read' };
  }
}
