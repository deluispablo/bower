/**
 * "Made from" on a note Bower wrote (issue #758, spec §5 `made-from.tsx`,
 * §6.9 element 5, R-NOTE-3 and R-NOTE-7): the original file and the web page
 * the note came from, as buttons. Open it shows a "Made from" caption button
 * with a chevron over the source buttons; folded it is one 44 px button
 * ("Made from your clip and a job advert") that opens it. The fold is one
 * device preference for every note (`bower:pref:sourcesFolded`), open by
 * default.
 */

import { useId, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { originalDisplayName, resolveOriginal } from '../companion.js';
import type { OriginalLookup } from '../companion.js';
import type { DriveFile } from '../drive.js';
import {
  IconChevronRight,
  IconExternalLink,
  IconFile,
  IconNote,
} from './icons.js';

import '../styles/made-from.css';

export const SOURCES_FOLDED_KEY = 'bower:pref:sourcesFolded';

export function readSourcesFolded(): boolean {
  try {
    return localStorage.getItem(SOURCES_FOLDED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSourcesFolded(folded: boolean): void {
  try {
    localStorage.setItem(SOURCES_FOLDED_KEY, String(folded));
  } catch {
    // Storage blocked or full: the choice just does not stick.
  }
}

export interface MadeFromSource {
  key: string;
  icon: 'file' | 'note' | 'globe';
  /** The file's name (a note without `.md`), or the web page's host. */
  name: string;
  /** The small word beside the name: "your clip", "the original", "job advert". */
  role: string;
  /** The word the folded label uses: "your clip", "a job advert". */
  noun: string;
  /** Where it opens; `undefined` when the original is not found. */
  href?: string;
  /** A web page: opens in a new tab. */
  external?: boolean;
  missing?: boolean;
}

export interface MadeFromInput {
  note: Pick<DriveFile, 'path'>;
  /** The frontmatter `original`, a name or a wikilink. */
  original: string | undefined;
  /** The frontmatter `source`: a URL, or a list whose first URL counts. */
  source: unknown;
  /** The frontmatter `kind` id. */
  kind: string | undefined;
  lookup: OriginalLookup;
}

function isClip(path: string, name: string): boolean {
  return /\(clip\)$/i.test(name) || /(^|\/)clippings\//i.test(path);
}

function originalSource(input: MadeFromInput): MadeFromSource | null {
  if (input.original === undefined) return null;
  const written = originalDisplayName(input.original);
  if (written === '') return null;
  const found = resolveOriginal(input.note, input.original, input.lookup);
  const fileName = found?.name ?? written;
  const isNote = /\.md$/i.test(fileName);
  const name = isNote ? fileName.replace(/\.md$/i, '') : fileName;
  let role = 'the original';
  let noun = 'the original';
  if (isNote && isClip(found?.path ?? '', name)) {
    role = 'your clip';
    noun = 'your clip';
  } else if (/\.docx?$/i.test(fileName)) {
    role = 'Word document';
    noun = 'your Word document';
  }
  const source: MadeFromSource = {
    key: `original:${found?.id ?? written}`,
    icon: isNote ? 'note' : 'file',
    name,
    role,
    noun,
  };
  if (found === undefined) {
    source.missing = true;
  } else {
    source.href = `/${isNote ? 'note' : 'file'}/${found.id}`;
  }
  return source;
}

function webSource(input: MadeFromInput): MadeFromSource | null {
  const values = Array.isArray(input.source) ? input.source : [input.source];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!/^https?:\/\//i.test(text)) continue;
    let host: string;
    try {
      host = new URL(text).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (host === '') continue;
    const kind = input.kind ?? '';
    const job = kind.includes('job');
    const advert = kind.includes('listing');
    return {
      key: `web:${text}`,
      icon: 'globe',
      name: host,
      role: job ? 'job advert' : advert ? 'advert' : 'web page',
      noun: job ? 'a job advert' : advert ? 'an advert' : 'a web page',
      href: text,
      external: true,
    };
  }
  return null;
}

/** The sources a note was made from, the original first, then the web page. */
export function madeFromSources(input: MadeFromInput): MadeFromSource[] {
  const sources: MadeFromSource[] = [];
  const original = originalSource(input);
  if (original !== null) sources.push(original);
  const web = webSource(input);
  if (web !== null) sources.push(web);
  return sources;
}

/** The folded button's text: "Made from your clip and a job advert". */
export function foldedLabel(sources: readonly MadeFromSource[]): string {
  const nouns = sources.map((source) => source.noun);
  if (nouns.length === 0) return 'Made from';
  return `Made from ${nouns.join(' and ')}`;
}

function GlobeIcon(): JSX.Element {
  return (
    <svg
      class="icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.500 5.600 12 3z" />
    </svg>
  );
}

function SourceIcon({ icon }: { icon: MadeFromSource['icon'] }): JSX.Element {
  if (icon === 'globe') return <GlobeIcon />;
  return icon === 'note' ? <IconNote /> : <IconFile />;
}

function SourceButton({ source }: { source: MadeFromSource }): JSX.Element {
  const content = (
    <>
      <span class="made-from-icon">
        <SourceIcon icon={source.icon} />
      </span>
      <span class="made-from-name">{source.name}</span>
      <span class="made-from-role">
        {source.missing === true ? 'not found' : source.role}
      </span>
    </>
  );
  if (source.href === undefined) {
    return <li class="made-from-source made-from-missing">{content}</li>;
  }
  return (
    <li>
      <a
        class="made-from-source"
        href={source.href}
        {...(source.external === true
          ? { target: '_blank', rel: 'noopener' }
          : {})}
      >
        {content}
      </a>
    </li>
  );
}

/**
 * The job offer's `apply_link` (R-VERDICT-2) as a web address, or `null` when
 * it is empty or not http(s).
 */
export function applyLinkOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text).href;
  } catch {
    return null;
  }
}

/** The Apply button under "Made from" (R-VERDICT-2). */
function ApplyButton({ href }: { href: string }): JSX.Element {
  return (
    <a class="made-from-apply" href={href} target="_blank" rel="noopener">
      <span>Apply</span>
      <IconExternalLink />
    </a>
  );
}

export interface MadeFromProps {
  sources: readonly MadeFromSource[];
  /** The note's `apply_link`, from `applyLinkOf`. */
  apply?: string | null;
}

export function MadeFrom({
  sources,
  apply = null,
}: MadeFromProps): JSX.Element | null {
  return (
    <>
      <MadeFromSources sources={sources} />
      {apply !== null && (
        <div class="made-from made-from-apply-row">
          <ApplyButton href={apply} />
        </div>
      )}
    </>
  );
}

function MadeFromSources({ sources }: MadeFromProps): JSX.Element | null {
  const listId = useId();
  const [folded, setFolded] = useState(readSourcesFolded);
  if (sources.length === 0) return null;
  const toggle = (next: boolean): void => {
    setFolded(next);
    writeSourcesFolded(next);
  };
  if (folded) {
    return (
      <div class="made-from made-from-folded">
        <button
          type="button"
          class="made-from-fold"
          aria-expanded="false"
          onClick={() => {
            toggle(false);
          }}
        >
          <span>{foldedLabel(sources)}</span>
          <IconChevronRight />
        </button>
      </div>
    );
  }
  return (
    <div class="made-from">
      <button
        type="button"
        class="made-from-caption"
        aria-expanded="true"
        aria-controls={listId}
        onClick={() => {
          toggle(true);
        }}
      >
        <span>Made from</span>
        <IconChevronRight />
      </button>
      <ul class="made-from-list" id={listId}>
        {sources.map((source) => (
          <SourceButton key={source.key} source={source} />
        ))}
      </ul>
    </div>
  );
}
