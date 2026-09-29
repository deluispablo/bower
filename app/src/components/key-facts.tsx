/**
 * Key facts (issue #603, spec §6.7 R-NOTE-4, board `System-KeyFacts`): the
 * note's kind's key fields, one to four cells side by side — a single line,
 * halves, thirds, quarters, and two rows of two under 340 px. A value stays
 * on one line and is cut with "…" (CSS); a label is at most 14 characters.
 * The `inline` variant is for rows: "£2,150 · 2 bed · 1 Nov · 14 min".
 */

import type { JSX } from 'preact';

import '../styles/key-facts.css';

export interface KeyFact {
  value: string;
  label: string;
  key?: string;
  /** The value is a score pill, tinted by how good it is (R-KF-2). */
  tone?: 'good' | 'fair' | 'low';
}

export interface KeyFactsProps {
  facts: readonly KeyFact[];
  /** The one-line variant for folder rows and Compare. */
  inline?: boolean;
}

export const MAX_FACTS = 4;
export const MAX_LABEL_LENGTH = 14;

/** A label cut to 14 characters, with "…" as the last one. */
export function clipLabel(label: string): string {
  return label.length <= MAX_LABEL_LENGTH
    ? label
    : `${label.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
}

/** The values of `facts` joined the way an inline row shows them. */
export function inlineFactsText(facts: readonly KeyFact[]): string {
  return facts
    .filter((fact) => fact.value !== '')
    .slice(0, MAX_FACTS)
    .map((fact) => fact.value)
    .join(' · ');
}

export function KeyFacts({
  facts,
  inline = false,
}: KeyFactsProps): JSX.Element | null {
  const shown = facts.filter((fact) => fact.value !== '').slice(0, MAX_FACTS);
  if (shown.length === 0) return null;

  if (inline) {
    return <span class="key-facts-inline">{inlineFactsText(shown)}</span>;
  }

  return (
    <div class="key-facts-box">
      <dl class={`key-facts key-facts-${shown.length}`}>
        {shown.map((fact, index) => (
          <div class="key-fact" key={fact.key ?? index}>
            <dd class="key-fact-value" title={fact.value}>
              {fact.tone === undefined ? (
                fact.value
              ) : (
                <span class={`key-fact-pill key-fact-pill-${fact.tone}`}>
                  {fact.value}
                </span>
              )}
            </dd>
            {fact.label !== '' && (
              <dt class="key-fact-label">{clipLabel(fact.label)}</dt>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
