import { describe, expect, it } from 'vitest';

import rulebookRaw from '../../vault-template/CLAUDE.md?raw';
import { KINDS } from '../src/kinds.js';

// The rulebook carries a copy of the kinds table in `app/src/kinds.ts`
// (#600): the agent writes what the rulebook says and the app shows what
// `kinds.ts` says, so the two must never drift apart.

interface RulebookField {
  key: string;
  label: string;
  type: string;
  group: string;
  forYou: boolean;
}

interface RulebookKind {
  id: string;
  name: string;
  keyFacts: string[];
  statuses: string[];
  compare: string;
  groups: string[];
  fields: RulebookField[];
}

const RULEBOOK = rulebookRaw.replace(/\r\n/g, '\n');

/**
 * The `## Kinds` section of the rulebook, up to the next `##` heading
 * outside a code fence (the section's examples hold `## Where to look`).
 */
function kindsSection(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## Kinds'));
  if (start === -1) throw new Error('the rulebook has no ## Kinds section');
  let fenced = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) fenced = !fenced;
    else if (!fenced && line.startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The backticked items of a comma-separated list; `none` is empty. */
function codeList(text: string): string[] {
  if (text.trim() === 'none') return [];
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
}

/** Every kind block (`**<id>** (<name>)` and its bullets) in the section. */
function parseKinds(section: string): RulebookKind[] {
  const kinds: RulebookKind[] = [];
  for (const block of section.split(/\n\n+/)) {
    const lines = block.trim().split('\n');
    const head = /^\*\*([a-z-]+)\*\* \((.+)\)$/.exec(lines[0] ?? '');
    if (head === null) continue;
    const kind: RulebookKind = {
      id: head[1] ?? '',
      name: head[2] ?? '',
      keyFacts: [],
      statuses: [],
      compare: '',
      groups: [],
      fields: [],
    };
    for (const line of lines.slice(1)) {
      const bullet = /^- ([^:]+): (.*)$/.exec(line);
      if (bullet === null) throw new Error(`unreadable line: ${line}`);
      const [, label = '', rest = ''] = bullet;
      if (label === 'Key facts') kind.keyFacts = codeList(rest);
      else if (label === 'Status') kind.statuses = codeList(rest);
      else if (label === 'Compare') kind.compare = rest.trim();
      else {
        kind.groups.push(label);
        for (const part of rest.split('; ')) {
          const field = /^`(\w+)` ([^(]+) \(([\w-]+)(, for you)?\)$/.exec(
            part.trim(),
          );
          if (field === null) throw new Error(`unreadable field: ${part}`);
          kind.fields.push({
            key: field[1] ?? '',
            label: field[2] ?? '',
            type: field[3] ?? '',
            group: label,
            forYou: field[4] !== undefined,
          });
        }
      }
    }
    kinds.push(kind);
  }
  return kinds;
}

const RULEBOOK_KINDS = parseKinds(kindsSection(RULEBOOK));

describe('the rulebook kinds table', () => {
  it('lists the same kinds as kinds.ts, in the same order', () => {
    expect(RULEBOOK_KINDS.map((kind) => kind.id)).toEqual(
      KINDS.map((kind) => kind.id),
    );
  });

  for (const kind of KINDS) {
    describe(kind.id, () => {
      const written = RULEBOOK_KINDS.find(
        (candidate) => candidate.id === kind.id,
      );

      it('has the same name, key facts, statuses and Compare use', () => {
        expect(written?.name).toBe(kind.name);
        expect(written?.keyFacts).toEqual(kind.keyFacts);
        expect(written?.statuses).toEqual(kind.statuses);
        expect(written?.compare).toBe(kind.compare);
      });

      it('has the same fields, labels, types and groups, in order', () => {
        expect(written?.groups).toEqual(kind.groups);
        expect(written?.fields).toEqual(
          kind.fields.map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            group: field.group,
            forYou: field.forYou === true,
          })),
        );
      });
    });
  }

  it('fails on a kind whose key facts differ', () => {
    const changed = RULEBOOK.replace(
      '- Key facts: `rent`, `rooms`, `available`, `bike_to_office`',
      '- Key facts: `rooms`, `rent`, `available`, `bike_to_office`',
    );
    const listing = parseKinds(kindsSection(changed)).find(
      (kind) => kind.id === 'rental-listing',
    );
    expect(listing?.keyFacts).not.toEqual(KINDS[0]?.keyFacts);
  });
});
