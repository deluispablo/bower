/**
 * Details (issue #603, spec §6.7 R-NOTE-5, board `Phone-Note-Details-Open`):
 * the folded block under a kind note's key facts. Collapsed it reads
 * "Details · rental listing · 18 read by Bower"; open it lists the kind's
 * groups with each field's label, value and where it came from, then the
 * "Not in the listing" chips with a button that copies them as questions.
 * Fields a person's rule added (not in the kind) sit under "More".
 */

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { formatFieldValue, questionsLabelFor } from '../kinds.js';
import type { Kind, KindField } from '../kinds.js';
import type { NoteMeta } from '../note-meta.js';
import { showToast } from '../toast-store.js';
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
const BOOKKEEPING_KEYS: ReadonlySet<string> = new Set([
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
  'source',
  'pages',
]);

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

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
    const value = formatFieldValue(field, meta.fields[field.key]);
    if (value === '') continue;
    groups
      .find((group) => group.title === field.group)
      ?.rows.push({
        key: field.key,
        label: field.label,
        value,
        origin: originOf(field, field.key, origins),
      });
  }

  const more: Row[] = [];
  for (const [key, raw] of Object.entries(meta.fields)) {
    if (known.has(key) || BOOKKEEPING_KEYS.has(key)) continue;
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
function chipLabel(kind: Kind, key: string): string {
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

export function Details({ kind, meta }: DetailsProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const groups = detailsGroups(kind, meta);
  const count = groups.reduce((total, group) => total + group.rows.length, 0);
  const notStated = meta.not_stated;

  const copyQuestions = (): void => {
    const questions = questionsFor(kind, notStated);
    const count = questions.length;
    const noun = count === 1 ? 'question' : 'questions';
    const words = NUMBER_WORDS[count] ?? String(count);
    const clipboard =
      typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      showToast("Bower couldn't copy that. Try again.");
      return;
    }
    clipboard.writeText(questions.join('\n')).then(
      () => {
        showToast(`Copied ${words} ${noun}`);
      },
      (error: unknown) => {
        console.error('Copying the questions failed', error);
        showToast("Bower couldn't copy that. Try again.");
      },
    );
  };

  return (
    <section class="details" aria-label="Details">
      <button
        type="button"
        class="details-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span>Details</span>
        <span class="details-toggle-meta">
          {`· ${kind.name} · ${count} read by Bower`}
        </span>
      </button>
      {open && (
        <div class="details-body">
          {groups.map((group) => (
            <div class="details-group" key={group.title}>
              <h3 class="details-group-title">{group.title}</h3>
              <dl class="details-fields">
                {group.rows.map((row) => (
                  <div class="details-field" key={row.key}>
                    <dt class="details-field-label">{row.label}</dt>
                    <dd class="details-field-value">{row.value}</dd>
                    <OriginSquare origin={row.origin} />
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {notStated.length > 0 && (
            <div class="details-group">
              <h3 class="details-group-title">{kind.notStatedLabel}</h3>
              <ul class="details-chips">
                {notStated.map((key) => (
                  <li class="details-chip" key={key}>
                    {chipLabel(kind, key)}
                  </li>
                ))}
              </ul>
              <button type="button" class="details-ask" onClick={copyQuestions}>
                {questionsLabelFor(kind, notStated.length)}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
