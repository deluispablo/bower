/**
 * What a run means (spec §6.18, R-MEAN-2): "Things that disagree" (a warn box,
 * each line linking both notes) and "Next for you" (at most three lines), read
 * off a done run's outcome. Shared by the tidy-up sheet, Just filed and the
 * run's Activity card. Both parts are hidden when the run reported none.
 */

import type { JSX } from 'preact';

import type { RunOutcome } from '../run-outcome.js';
import type { VaultIndex } from '../vault-index.js';
import { useVault } from '../vault-store.js';
import '../styles/run-meaning.css';

/** A note the report names: its title, and where a tap goes when the folder
 * listing has it. */
export interface MeaningLink {
  title: string;
  href?: string;
}

/** `Projects/Flat hunt/Riverside.md` as `Riverside`. */
function titleOfPath(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
}

/** The link for a path the report names; no `href` when the index lacks it. */
export function meaningLink(
  index: VaultIndex | null,
  path: string,
): MeaningLink {
  const title = titleOfPath(path);
  const file = index?.byPath.get(path);
  if (file === undefined) return { title };
  const base = /\.md$/i.test(path) ? '/note/' : '/file/';
  return { title, href: `${base}${encodeURIComponent(file.id)}` };
}

function NoteLink({
  link,
  onNavigate,
}: {
  link: MeaningLink;
  onNavigate: (() => void) | undefined;
}): JSX.Element {
  if (link.href === undefined) return <span>{link.title}</span>;
  return (
    <a class="run-meaning-link" href={link.href} onClick={onNavigate}>
      {link.title}
    </a>
  );
}

export interface RunMeaningProps {
  outcome: RunOutcome;
  /** Called when a link is followed (the sheet closes itself). */
  onNavigate?: () => void;
}

export function RunMeaning({
  outcome,
  onNavigate,
}: RunMeaningProps): JSX.Element | null {
  const { index } = useVault();
  const disagree = outcome.disagree ?? [];
  const next = outcome.next ?? [];
  if (disagree.length === 0 && next.length === 0) return null;
  return (
    <div class="run-meaning">
      {disagree.length > 0 && (
        <section class="run-meaning-warn" aria-label="Things that disagree">
          <h3 class="run-meaning-heading">
            <svg
              viewBox="0 0 24 24"
              class="icon"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l10 18H2L12 3z" />
              <path d="M12 10v5M12 18v.5" />
            </svg>
            Things that disagree
          </h3>
          <ul class="run-meaning-list">
            {disagree.map((item) => (
              <li key={`${item.a}|${item.b}`}>
                <NoteLink
                  link={meaningLink(index, item.a)}
                  onNavigate={onNavigate}
                />
                {' and '}
                <NoteLink
                  link={meaningLink(index, item.b)}
                  onNavigate={onNavigate}
                />
                {`: ${item.reason}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {next.length > 0 && (
        <section class="run-meaning-next" aria-label="Next for you">
          <h3 class="run-meaning-heading">Next for you</h3>
          <ul class="run-meaning-list">
            {next.map((item) => (
              <li key={`${item.path ?? '-'}|${item.action}`}>
                {item.action}
                {item.path !== undefined && (
                  <>
                    {' '}
                    <NoteLink
                      link={meaningLink(index, item.path)}
                      onNavigate={onNavigate}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
