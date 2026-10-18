/**
 * What a new Bower folder holds (TL-P4-14 c1-shared-contracts): one list, used by the Worker's `POST /vault` and by
 * the pretend Worker's `createFolder`. Sorted by path, `Rules.md` last, as the Worker has always created it.
 * A `.gitkeep` entry only says "this folder exists, empty": the folder is made and the file is not uploaded.
 *
 * `About me.md` is the note the accepted app's fake made (a summary in its front matter, then one line of body),
 * so the app reads the same note on the fake and on Drive; the Worker's old plain-text copy is gone.
 */
import { RULES_TEMPLATE } from './rules-format';

export interface FolderTemplateFile {
  /** Relative to the Bower folder, `/`-separated. */
  path: string;
  /** UTF-8 text; empty for `.gitkeep`. */
  content: string;
  appProperties?: Record<string, string>;
}

/** The placeholder that keeps an empty folder in the list. */
export const PLACEHOLDER_FILE = '.gitkeep';

/** The person's About me note, at the folder root. */
export const ABOUT_ME = 'About me.md';

export const FOLDER_TEMPLATE: readonly FolderTemplateFile[] = [
  { path: '.bower/changes/.gitkeep', content: '' },
  { path: '.bower/hashes.json', content: '{ "v": 1, "hashes": {} }\n' },
  { path: '.bower/questions.json', content: '{ "v": 1, "questions": [] }\n' },
  { path: '.bower/requests.json', content: '{ "v": 1, "done": [] }\n' },
  { path: '.bower/suggestions.json', content: '{ "v": 1, "suggestions": [] }\n' },
  {
    path: ABOUT_ME,
    content: '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\nWrite a few lines about yourself: where you live, what you do, who is in your life.\n',
  },
  { path: 'Archive/.gitkeep', content: '' },
  { path: 'Areas/.gitkeep', content: '' },
  { path: 'Inbox/.gitkeep', content: '' },
  { path: 'Projects/.gitkeep', content: '' },
  { path: 'Resources/.gitkeep', content: '' },
  { path: 'Rules.md', content: RULES_TEMPLATE.text, appProperties: { ...RULES_TEMPLATE.appProperties } },
];
