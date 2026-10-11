import { expect, it } from 'vitest';
import { parseNote, readTypeTable, tableProperties } from './note-format';

it('b5b-r4 1 hidden keys spend no column place', () => {
  const note = parseNote('Resources/Offer.md', [
    '---', 'type: offer', 'status: active', 'name: Alex', 'modified: Person-entered fact',
    'company: Acorn Studio', 'salary: {"amount":48000,"currency":"EUR"}',
    'location: Remote', 'hours: 32', 'posted: 2026-10-10', 'skills: [Writing, Design]',
    '---', 'Alex keeps personal notes.',
  ].join('\n'));
  const project = (table: string[]) => {
    const stored = JSON.stringify({ v: 1, rows: [{
      id: 'offer', match: ['job offer'], template: 'source',
      properties: {
        name: { type: 'text' }, modified: { type: 'text' }, company: { type: 'text' },
        salary: { type: 'money' }, location: { type: 'text' }, hours: { type: 'number' },
        posted: { type: 'date' }, skills: { type: 'list' },
      }, table,
    }] });
    const read = readTypeTable(stored);
    expect(read.writeAllowed).toBe(true);
    const row = read.table.rows[0];
    expect(row?.id).toBe('offer');
    if (!row) throw new Error('Missing offer row');
    return tableProperties(note, row).map((property) => property.key);
  };
  const ordinary = ['company', 'salary', 'location', 'hours'];
  expect(project(ordinary), 'Four ordinary keys stay in order').toEqual(ordinary);
  expect(project([...ordinary, 'posted', 'skills']), 'More than four ordinary keys keep the first four').toEqual(ordinary);
  expect(project(['name', 'company', 'modified', 'salary', 'location', 'hours']),
    'Name and Changed already show the hidden keys; all four type columns remain').toEqual(ordinary);
});
