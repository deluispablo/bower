/**
 * The runner's repair of the old template's `Rules.md` (TL-P3-28 point 1). A folder made before `rules-template-bower`
 * has a root `Rules.md` that is plain text without Bower's mark, so a rule typed in the app is refused as not Bower's
 * to word. The Worker repairs it only inside `POST /vault` (`api/src/vault.ts`, `repairRules`), which the app calls
 * only when the person has no folder; an existing folder, the one kind that needs it, is repaired here, before the
 * provider plans a new run (full or instructions alike).
 *
 * - Only a root `Rules.md` whose bytes equal `OLD_RULES_TEMPLATE` exactly is rewritten, to `RULES_TEMPLATE`'s bytes
 *   and its `by: bower` mark. An edited file, the original app's plain file, two files of the name, or a folder of
 *   the name is left alone.
 * - Fenced and still as seen, as every runner write (TL-P3-19, TL-P3-23): the listing gives the modifiedTime before
 *   the text is read, and the adapter's fenced write reads the file again and checks this runner's attempt right
 *   before it sends. A file changed between the read and the write is refused there (`conflict`) and left as the
 *   person made it; the run goes on. Drive v3 has no conditional write on files, so this is a precheck with a short
 *   window, as the Worker's repair is.
 * - The text is written first, then the mark: the text alone already makes the file Bower's to word (its front
 *   matter says `by: bower`), and a mark is never put on a text the person changed. A runner that stops between
 *   the two leaves the template's text without the mark; the next run sees those bytes and adds only the mark.
 * - Cost: no listing of its own (the run's record listing holds the folder's root; one listing without it), plus one read of `Rules.md` only when its size says the
 *   bytes might match. Once repaired, the old text is gone, so a later run finds nothing to do; no state is kept.
 * - With a rule waiting in the same run: the repair lands first, then the planner reads a Bower-owned file and words
 *   the rule into it in this run.
 */
import { BowerError } from '../../src/data/types';
import { OLD_RULES_TEMPLATE, RULES_TEMPLATE } from '../../src/data/contracts/rules-format';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { RunnerDrive } from './drive';

export const RULES_FILE_NAME = 'Rules.md';

const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength;
const OLD_SIZE = bytesOf(OLD_RULES_TEMPLATE);
const NEW_SIZE = bytesOf(RULES_TEMPLATE.text);

const marked = (f: DriveFile): boolean => Object.entries(RULES_TEMPLATE.appProperties).every(([k, v]) => f.appProperties?.[k] === v);

/** Repairs the old template's `Rules.md` in the folder `rootId`; leaves every other file, and a changed one, alone. */
export async function repairRules(drive: RunnerDrive, rootId: string, listed?: () => Promise<DriveFile[]>): Promise<void> {
  // The folder's root as the run has just listed it (`listed`), when it can say; otherwise listed here.
  const children = listed ? (await listed()).filter((f) => f.parents.includes(rootId)) : await drive.list(rootId);
  const named = children.filter((f) => f.name === RULES_FILE_NAME);
  const file = named.length === 1 ? named[0] : undefined;
  if (!file || file.folder) return;
  const mightBeOld = file.size === undefined || file.size === OLD_SIZE;
  const mightBeUnmarked = !marked(file) && (file.size === undefined || file.size === NEW_SIZE);
  if (!mightBeOld && !mightBeUnmarked) return;
  const text = await drive.readText(file.id);
  const old = text === OLD_RULES_TEMPLATE;
  if (!old && !(text === RULES_TEMPLATE.text && !marked(file))) return;
  try {
    const writes = await drive.batch();
    const written = old ? await writes.writeText(file.id, RULES_TEMPLATE.text, file.modifiedTime) : file;
    if (!marked(written)) await writes.update(file.id, { appProperties: { ...RULES_TEMPLATE.appProperties } });
  } catch (e) {
    if (!(e instanceof BowerError) || e.code !== 'conflict') throw e;
    console.error(`${RULES_FILE_NAME} changed while Bower was repairing it; it is left as it is`, e);
  }
}
