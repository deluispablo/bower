/**
 * Proposals the owner approves (#199, spec D.3): the agent files what it
 * would like the owner to decide (a new rule, a workflow for a recurring
 * kind of document, a new domain tag) in `Answers/Bower - Proposals.md`,
 * one `## ` section per proposal with `key: value` lines (a leading `- `
 * is allowed, as the rulebook writes them):
 *
 * ```markdown
 * ## Invoices go to Money
 * - id: 2026-09-27-invoices
 * - kind: rule
 * - text: File invoices under 2-Areas/Money with the tag finance.
 * - evidence: Three invoices filed there by hand.
 * - status: open
 * - created: 2026-09-27
 * ```
 *
 * The app lists the open ones in Health; Accept appends the rule to
 * `Rules.md` (`rulesWithAccepted`) and marks the section, Dismiss only
 * marks it (`applyDecision`). The agent never writes `Rules.md` for a
 * proposal. Pure: no Drive, no clock unless a date is not given —
 * `vault-store.tsx`'s `runProposalDecision` does the writing.
 */

import type { DriveFile } from './drive.js';
import type { VaultIndex } from './vault-index.js';

/** Where the agent files proposals, from the top of the Bower folder. */
export const PROPOSALS_PATH = 'Answers/Bower - Proposals.md';

export type ProposalKind = 'rule' | 'workflow' | 'tag';
export type ProposalStatus = 'open' | 'accepted' | 'dismissed';
export type ProposalDecision = 'accepted' | 'dismissed';

export interface Proposal {
  id: string;
  kind: ProposalKind;
  /** The section's heading, without the `## `. */
  title: string;
  /** The rule as it would read in `Rules.md`, one line. */
  text: string;
  /** Why, in one line; `''` when the section has none. */
  evidence: string;
  status: ProposalStatus;
  /** `YYYY-MM-DD` the agent filed it, when given. */
  created?: string;
  /** `YYYY-MM-DD` the owner accepted or dismissed it, when decided. */
  decided?: string;
}

/** Thrown by `applyDecision` for a proposal it cannot decide. */
export class ProposalError extends Error {
  readonly code: 'missing' | 'decided';

  constructor(code: 'missing' | 'decided', message: string) {
    super(message);
    this.name = 'ProposalError';
    this.code = code;
  }
}

const KINDS: ReadonlySet<string> = new Set(['rule', 'workflow', 'tag']);
const STATUSES: ReadonlySet<string> = new Set([
  'open',
  'accepted',
  'dismissed',
]);

/** `- key: value` or `key: value`, the key lower-case letters only. */
const FIELD = /^(\s*(?:[-*]\s+)?)([a-z]+):[ \t]*(.*)$/;
const HEADING = /^## +(.+?)\s*$/;

/** The heading `rulesWithAccepted` files accepted proposals under. */
export const ACCEPTED_HEADING = "## From Bower's suggestions";

/** The proposals file in the listing, when the Bower folder has one. */
export function findProposals(index: VaultIndex): DriveFile | undefined {
  return index.byPath.get(PROPOSALS_PATH);
}

/** `YYYY-MM-DD` for `date` in the device's own time zone. */
export function dayOf(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

interface Section {
  title: string;
  /** Index of the heading line in the file's lines. */
  start: number;
  /** Index one past the section's last line. */
  end: number;
  /** First line index and value of each field, first occurrence wins. */
  fields: Map<string, { line: number; value: string }>;
}

function linesOf(md: string): string[] {
  return md.replace(/\r\n/g, '\n').split('\n');
}

/** Where the body starts: after a leading `---` frontmatter block, if any. */
function bodyStart(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') return i + 1;
  }
  return 0;
}

function sectionsOf(lines: readonly string[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let fenced = false;
  for (let i = bodyStart(lines); i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : HEADING.exec(line);
    if (heading !== null || /^# /.test(line)) {
      if (current !== null) {
        current.end = i;
        sections.push(current);
        current = null;
      }
      if (heading !== null) {
        current = {
          title: heading[1] ?? '',
          start: i,
          end: i + 1,
          fields: new Map(),
        };
      }
      continue;
    }
    if (current === null) continue;
    const field = FIELD.exec(line);
    if (field !== null) {
      const key = field[2] ?? '';
      if (!current.fields.has(key)) {
        current.fields.set(key, { line: i, value: (field[3] ?? '').trim() });
      }
    }
  }
  if (current !== null) {
    current.end = lines.length;
    sections.push(current);
  }
  return sections;
}

function proposalOf(section: Section): Proposal | null {
  const get = (key: string): string => section.fields.get(key)?.value ?? '';
  const id = get('id');
  const text = get('text');
  const kind = get('kind').toLowerCase();
  const status = (get('status') || 'open').toLowerCase();
  if (id === '' || text === '' || !KINDS.has(kind) || !STATUSES.has(status)) {
    return null;
  }
  const proposal: Proposal = {
    id,
    kind: kind as ProposalKind,
    title: section.title,
    text,
    evidence: get('evidence'),
    status: status as ProposalStatus,
  };
  const created = get('created');
  if (created !== '') proposal.created = created;
  const decided = get('decided');
  if (decided !== '') proposal.decided = decided;
  return proposal;
}

/**
 * Every well-formed proposal in the file, in file order: a section needs an
 * `id`, a `text` and a known `kind`; a missing `status` counts as `open`,
 * an unknown one leaves the section out. A second section with an `id`
 * already seen is left out too, so a decision always has one target.
 */
export function parseProposals(md: string): Proposal[] {
  const seen = new Set<string>();
  const proposals: Proposal[] = [];
  for (const section of sectionsOf(linesOf(md))) {
    const proposal = proposalOf(section);
    if (proposal === null || seen.has(proposal.id)) continue;
    seen.add(proposal.id);
    proposals.push(proposal);
  }
  return proposals;
}

/** The open proposals, in file order. */
export function openProposals(md: string): Proposal[] {
  return parseProposals(md).filter((p) => p.status === 'open');
}

/**
 * `md` with proposal `id` marked `decision` on `on` (`YYYY-MM-DD`, today
 * by default): its `status` line rewritten and a `decided` line set, every
 * other byte left as it was. Deciding a proposal again the same way returns
 * `md` unchanged (a retry after a failed write); `ProposalError('missing')`
 * when there is no such proposal and `ProposalError('decided')` when it was
 * already decided the other way.
 */
export function applyDecision(
  md: string,
  id: string,
  decision: ProposalDecision,
  on: string = dayOf(new Date()),
): string {
  const lines = linesOf(md);
  const section = sectionsOf(lines).find((s) => {
    const p = proposalOf(s);
    return p !== null && p.id === id;
  });
  const proposal = section === undefined ? null : proposalOf(section);
  if (section === undefined || proposal === null) {
    throw new ProposalError('missing', 'That suggestion is no longer there.');
  }
  if (proposal.status === decision) return md;
  if (proposal.status !== 'open') {
    throw new ProposalError('decided', 'That suggestion was already decided.');
  }

  const status = section.fields.get('status');
  const decided = section.fields.get('decided');
  const prefix = (line: number | undefined): string =>
    line === undefined ? '- ' : (FIELD.exec(lines[line] ?? '')?.[1] ?? '- ');

  const next = [...lines];
  if (decided !== undefined) {
    next[decided.line] = `${prefix(decided.line)}decided: ${on}`;
  }
  if (status !== undefined) {
    next[status.line] = `${prefix(status.line)}status: ${decision}`;
    if (decided === undefined) {
      next.splice(status.line + 1, 0, `${prefix(status.line)}decided: ${on}`);
    }
  } else {
    // No status line (it counted as open): add both after the last field.
    const last = Math.max(...[...section.fields.values()].map((f) => f.line));
    const lead = prefix(last);
    const added = [`${lead}status: ${decision}`];
    if (decided === undefined) added.push(`${lead}decided: ${on}`);
    next.splice(last + 1, 0, ...added);
  }
  return next.join('\n');
}

/** The line `rulesWithAccepted` adds for `proposal`, without the date. */
function ruleLine(proposal: Proposal): string {
  return `- ${proposal.text}`;
}

/**
 * `Rules.md`'s text with `proposal`'s rule appended under
 * `ACCEPTED_HEADING` (created at the end when missing), marked
 * `(accepted suggestion, <on>)`. Unchanged when the rule is already there,
 * so accepting again after a failed write never adds it twice.
 */
export function rulesWithAccepted(
  rules: string,
  proposal: Proposal,
  on: string = dayOf(new Date()),
): string {
  const lines = linesOf(rules);
  const bullet = ruleLine(proposal);
  if (lines.some((line) => line === bullet || line.startsWith(`${bullet} (`))) {
    return rules;
  }
  const entry = `${bullet} (accepted suggestion, ${on})`;

  const at = lines.findIndex((line) => line.trimEnd() === ACCEPTED_HEADING);
  if (at < 0) {
    const body = rules.replace(/\s+$/, '');
    return `${body === '' ? '' : `${body}\n\n`}${ACCEPTED_HEADING}\n\n${entry}\n`;
  }
  // The end of that section: the next heading, or the end of the file;
  // the entry goes after its last non-blank line.
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  let last = end - 1;
  while (last > at && (lines[last] ?? '').trim() === '') last--;
  const next = [...lines];
  next.splice(last + 1, 0, ...(last === at ? ['', entry] : [entry]));
  const text = next.join('\n');
  return text.endsWith('\n') ? text : `${text}\n`;
}

/** `[[Note]]` and `[[Note|shown]]` as their plain text, for showing a
 * proposal's text and evidence outside a rendered note. */
export function plainText(text: string): string {
  return text.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match: string, target: string, shown: string | undefined) =>
      shown ?? target,
  );
}
