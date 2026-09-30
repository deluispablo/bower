/**
 * Details (issue #603, spec §6.9 R-INS-7): every other field of the note's
 * kind, by group, each with its label, value and origin square (the square
 * only when the field is not from the file). Always shown: it sits inside
 * Bower's note box, which is the one thing that folds. Fields a person's
 * rule added (not in the kind) sit under "More".
 */

import type { JSX } from 'preact';

import { formatFieldValue } from '../kinds.js';
import type { Kind, KindField } from '../kinds.js';
import type { NoteMeta } from '../note-meta.js';
import { applyLinkOf } from './made-from.js';
import { OriginSquare } from './folder-mark.js';
import type { OriginKind } from './folder-mark.js';

import '../styles/key-facts.css';

export interface DetailsProps {
  kind: Kind;
  meta: NoteMeta;
}

/** The heading over the fields a rule added. */
export const MORE_GROUP = 'More';

/** Frontmatter keys Bower or Obsidian keep for themselves: never a "More"
 * field. */
export const BOOKKEEPING_KEYS: ReadonlySet<string> = new Set([
  'kind',
  'status',
  'original',
  'bower_origins',
  'not_stated',
  'tags',
  'tag',
  'aliases',
  'cssclasses',
  'title',
  'created',
  'updated',
  'date',
  'type',
  'source',
  'pages',
  // Bower's note box keeps these (R-INS-8, R-VERDICT-1). `score` and `fit`
  // stay readable by Compare and the front page; they are only kept out of
  // "More".
  'bower_updated',
  'bower_change',
  'bower_before',
  'by',
  'pile_note',
  'facts',
  'score',
  'verdict',
  'made_for',
]);

const ORIGINS: ReadonlySet<string> = new Set(['file', 'notes', 'web', 'you']);

interface Row {
  key: string;
  label: string;
  value: string;
  origin: OriginKind;
}

/** "pet_policy" as "Pet policy". */
export function humaniseKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `bower_origins` is `{ <field>: file | notes | web | you }` (spec R-AG-2);
 * anything else is read as no answers. */
function originMap(raw: unknown): Record<string, OriginKind> {
  const out: Record<string, OriginKind> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && ORIGINS.has(value)) {
      out[key] = value as OriginKind;
    }
  }
  return out;
}

/** Where a field came from: what `bower_origins` says; else your own notes
 * for a "For you" field and the document itself for the rest. */
function originOf(
  field: KindField | undefined,
  key: string,
  origins: Record<string, OriginKind>,
): OriginKind {
  return origins[key] ?? (field?.forYou === true ? 'notes' : 'file');
}

/** The value with its companion `<key>_note` from frontmatter, when there is
 * one: "14 min, from your offer letter". Fit is a score out of 100 (board
 * `Phone-Note-Details-Open`: "72 of 100: cheap, close"). */
function withNote(key: string, value: string, meta: NoteMeta): string {
  const note = formatFieldValue(
    { key, label: key, type: 'text', group: MORE_GROUP },
    meta.fields[`${key}_note`],
  );
  if (note === '') return value;
  return key === 'fit' ? `${value} of 100: ${note}` : `${value}, ${note}`;
}

/** The rows Details shows, by group in the kind's order, then "More". */
export function detailsGroups(
  kind: Kind,
  meta: NoteMeta,
): { title: string; rows: Row[] }[] {
  const origins = originMap(meta.fields.bower_origins);
  const groups: { title: string; rows: Row[] }[] = kind.groups.map((title) => ({
    title,
    rows: [],
  }));
  const known = new Set(kind.fields.map((field) => field.key));

  for (const field of kind.fields) {
    // The Apply button under "Made from" already shows a usable apply link.
    if (
      field.key === 'apply_link' &&
      applyLinkOf(meta.fields.apply_link) !== null
    ) {
      continue;
    }
    const value = formatFieldValue(field, meta.fields[field.key]);
    if (value === '') continue;
    groups
      .find((group) => group.title === field.group)
      ?.rows.push({
        key: field.key,
        label: field.label,
        value: withNote(field.key, value, meta),
        origin: originOf(field, field.key, origins),
      });
  }

  const more: Row[] = [];
  for (const [key, raw] of Object.entries(meta.fields)) {
    if (known.has(key) || BOOKKEEPING_KEYS.has(key) || key.endsWith('_note')) {
      continue;
    }
    const value = formatFieldValue(
      { key, label: key, type: 'text', group: MORE_GROUP },
      raw,
    );
    if (value === '') continue;
    more.push({
      key,
      label: humaniseKey(key),
      value,
      origin: originOf(undefined, key, origins),
    });
  }
  if (more.length > 0) groups.push({ title: MORE_GROUP, rows: more });

  return groups.filter((group) => group.rows.length > 0);
}

/** The chip for a field the document did not state: the kind's label for
 * it, or the key made readable. */
export function chipLabel(kind: Kind, key: string): string {
  return (
    kind.fields.find((field) => field.key === key)?.label ?? humaniseKey(key)
  );
}

/** One question per field not stated. */
export function questionsFor(
  kind: Kind,
  notStated: readonly string[],
): string[] {
  return notStated.map(
    (key) =>
      `What is the ${chipLabel(kind, key).toLowerCase()} for this ${kind.name}?`,
  );
}

export function Details({ kind, meta }: DetailsProps): JSX.Element | null {
  const groups = detailsGroups(kind, meta);
  if (groups.length === 0) return null;
  return (
    <section class="details" aria-label="Details">
      <h3 class="bower-box-title">Details</h3>
      {groups.map((group) => (
        <div class="details-group" key={group.title}>
          <h4 class="details-group-title">{group.title}</h4>
          <dl class="details-fields">
            {group.rows.map((row) => (
              <div class="details-field" key={row.key}>
                <dt class="details-field-label">{row.label}</dt>
                <dd class="details-field-value">{row.value}</dd>
                {row.origin !== 'file' && <OriginSquare origin={row.origin} />}
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
