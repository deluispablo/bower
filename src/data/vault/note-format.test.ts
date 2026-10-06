import { describe, expect, it } from 'vitest';
import { NOTES } from '../demo/notes';
import { BowerError } from '../types';
import { parseNote, serializeNote, toggleTaskInText } from './note-format';

describe('the note file format', () => {
  it('round-trips every demo note', () => {
    for (const [path, seed] of Object.entries(NOTES)) {
      const { links: _seedLinks, title: _seedTitle, ...want } = seed;
      const { links: _links, title: _title, path: back, ...got } = parseNote(path, serializeNote({ ...seed, byBower: true }));
      expect(back).toBe(path);
      expect(got).toEqual({ ...want, byBower: true });
    }
  });

  it('keeps who wrote it', () => {
    const seed = Object.values(NOTES)[0];
    if (!seed) throw new Error('no notes');
    expect(parseNote('a.md', serializeNote({ ...seed, byBower: false })).byBower).toBe(false);
  });

  it('a note with no frontmatter is all body', () => {
    const n = parseNote('Resources/Ideas/Loose.md', '# Loose\n\nSome thoughts about [[Lemon tart]].\n- [ ] try it');
    expect(n.title).toBe('Loose');
    expect(n.body).toBe('# Loose\n\nSome thoughts about [[Lemon tart]].\n- [ ] try it');
    expect(n.summary).toBe('');
    expect(n.properties).toEqual([]);
    expect(n.currentState).toEqual([]);
    expect(n.timeline).toEqual([]);
    expect(n.byBower).toBe(false);
    expect(n.links).toEqual(['Lemon tart']);
  });

  it('a property [[link]] sets link', () => {
    const n = parseNote('x.md', '---\nsummary: s\nagent: [[Kittiwake Lettings]]\n---\nbody');
    expect(n.properties).toEqual([{ key: 'agent', label: 'Agent', value: 'Kittiwake Lettings', link: 'Kittiwake Lettings' }]);
  });

  it('labels come from the key, with a few named ones', () => {
    const n = parseNote('x.md', '---\nnext: 1 Mar\nmove_in: 1 Dec\n---\n');
    expect(n.properties.map((p) => p.label)).toEqual(['Next due', 'Move in']);
  });
});

describe('ticking a task', () => {
  const tasks = [
    { line: '- [ ] First task 🧭  ', label: 'First task 🧭  ', done: true },
    { line: '\t* [x] Second task — café', label: 'Second task — café', done: false },
    { line: '  12. [ ] Third task: 日本語', label: 'Third task: 日本語', done: true },
  ] as const;
  const personal = ['Intro café 🪶 e\u0301.', tasks[0].line, 'Prose [ ] stays verbatim.', tasks[1].line, tasks[2].line, 'Trailing spaces   '];
  const prefix = ['---', 'summary: "A café 🪶 note: keep this"', 'by: bower', 'custom:   spacing stays  ', '---', '', '## Current state', '- [ ] Protected current state', '- Bower maintained summary.', ''];
  const suffix = ['', '## Timeline', '- Today · [ ] Protected history · [[Another note]]', '', "## Bower's note", '- [ ] Protected Bower note', ''];
  const fixtures = (['LF', 'CRLF', 'mixed'] as const).flatMap((ending) => (['protected', 'plain'] as const).map((kind) => {
    const lines = kind === 'protected' ? [...prefix, ...personal, ...suffix] : ['\uFEFFPlain note 🪶', '', ...personal, 'Last prose without a final newline.'];
    const raw = lines.map((line, i) => line + (i === lines.length - 1 ? '' : ending === 'LF' ? '\n' : ending === 'CRLF' || i % 3 !== 1 ? '\r\n' : '\n')).join('');
    return { ending, kind, raw };
  }));

  it.each(fixtures)('toggling a personal task preserves every other source byte ($ending, $kind)', ({ raw }) => {
    for (const [index, task] of tasks.entries()) {
      const changed = task.line.replace(task.done ? '[ ]' : '[x]', task.done ? '[x]' : '[ ]');
      const expected = raw.replace(task.line, changed);
      const out = toggleTaskInText(raw, index);
      expect(out).toEqual({ text: expected, label: task.label, done: task.done });
      expect(new TextEncoder().encode(out.text)).toEqual(new TextEncoder().encode(expected));
      expect(toggleTaskInText(out.text, index)).toEqual({ text: raw, label: task.label, done: !task.done });
    }
  });

  it('toggling a personal task preserves every other source byte (missing task is refused)', () => {
    for (const { raw } of fixtures) {
      expect(() => toggleTaskInText(raw, tasks.length)).toThrow('That line is no longer in the note.');
      expect(() => toggleTaskInText(raw, -1)).toThrow('That line is no longer in the note.');
    }
  });

  it('toggling a personal task preserves every other source byte (protected checkboxes are refused)', () => {
    const raw = [...prefix, ...suffix].join('\r\n');
    expect(() => toggleTaskInText(raw, 0)).toThrow('That line is no longer in the note.');
  });

  it('toggling a personal task preserves every other source byte (identical labels select the requested checkbox)', () => {
    const before = `${prefix.join('\r\n')}\r\n- [ ] Repeat 🪶\r\n`;
    const after = suffix.join('\r\n');
    const raw = `${before}- [ ] Repeat 🪶${after}`;
    const out = toggleTaskInText(raw, 1);
    expect(out).toEqual({ text: `${before}- [x] Repeat 🪶${after}`, label: 'Repeat 🪶', done: true });
    expect(toggleTaskInText(out.text, 1).text).toBe(raw);
  });

  const text = serializeNote({
    summary: 's',
    properties: [],
    tags: [],
    currentState: ['- [ ] not a task here'],
    body: 'Intro\n\n- [ ] first\n- [x] second\n  - [ ] third',
    timeline: [{ date: '1 Oct', text: '- [ ] not this either' }],
    byBower: true,
  });

  it('toggleTaskInText flips only the n-th body task and returns its label', () => {
    const out = toggleTaskInText(text, 1);
    expect(out).toMatchObject({ label: 'second', done: false });
    const n = parseNote('x.md', out.text);
    expect(n.body).toBe('Intro\n\n- [ ] first\n- [ ] second\n  - [ ] third');
    expect(toggleTaskInText(text, 2)).toMatchObject({ label: 'third', done: true });
  });

  it('toggleTaskInText ignores tasks in Current state and Timeline', () => {
    const out = toggleTaskInText(text, 0);
    const n = parseNote('x.md', out.text);
    expect(n.currentState).toEqual(['- [ ] not a task here']);
    expect(n.timeline[0]?.text).toBe('- [ ] not this either');
    expect(n.body.startsWith('Intro\n\n- [x] first')).toBe(true);
  });

  it('a task index past the end is refused', () => {
    expect(() => toggleTaskInText(text, 9)).toThrow(/no longer/);
  });
});

describe('notes written elsewhere (Obsidian)', () => {
  it('reads block-list tags and quoted values', () => {
    const n = parseNote('x.md', '---\nsummary: "A note: with a colon"\ntags:\n  - flat\n  - shortlist\nagent: \'Kittiwake Lettings\'\n---\nbody');
    expect(n.summary).toBe('A note: with a colon');
    expect(n.tags).toEqual(['flat', 'shortlist']);
    expect(n.properties).toEqual([{ key: 'agent', label: 'Agent', value: 'Kittiwake Lettings' }]);
  });

  it('ticks a task in a numbered list, as the screen counts it', () => {
    const out = toggleTaskInText('---\nsummary: s\n---\n\n1. [ ] first\n2. [ ] second', 1);
    expect(out).toMatchObject({ label: 'second', done: true });
    expect(out.text).toContain('2. [x] second');
  });
});

describe('more YAML from elsewhere', () => {
  it('reads a list that is not indented', () => {
    expect(parseNote('x.md', '---\ntags:\n- flat\n- shortlist\n---\nbody').tags).toEqual(['flat', 'shortlist']);
  });
});


describe('protected sections retain prose and tasks outside the personal body', () => {
  const paragraph = 'Alex keeps café 🪶 notes here.  ';
  const personal = '## My notes\n- [ ] Personal task 🪶  ';
  const raw = [
    '---', 'bower_format: ownership/2', 'summary: Synthetic note', 'by: bower', 'contact: you@example.com', '---', '',
    '<!-- bower:ownership/2 begin current -->', '## Current state', paragraph, '', '- [ ] Protected task',
    '<!-- bower:ownership/2 end current -->', '<!-- bower:ownership/2 begin personal -->', personal,
    '<!-- bower:ownership/2 end personal -->', '<!-- bower:ownership/2 begin timeline -->', '## Timeline',
    '- 5 Oct · Protected history · [[Another note]]', '<!-- bower:ownership/2 end timeline -->',
    '<!-- bower:ownership/2 begin bower-note -->', "## Bower's note", 'Protected explanation.',
    '<!-- bower:ownership/2 end bower-note -->', '',
  ].join('\n');
  const fixtures = [
    { name: 'LF', source: raw },
    { name: 'CRLF', source: raw.replace(/\n/g, '\r\n') },
    { name: 'mixed endings', source: raw.split('\n').map((line, i, lines) => line + (i === lines.length - 1 ? '' : i % 2 ? '\r\n' : '\n')).join('') },
    { name: 'BOM', source: `\ufeff${raw}` },
  ];

  it.each(fixtures)('reads only the personal payload and derives protected display ($name)', ({ source }) => {
    const note = parseNote('Synthetic.md', source);
    expect(note.body).toBe(personal);
    expect(note.currentState).toEqual([paragraph, '[ ] Protected task']);
    expect(note.timeline).toEqual([{ date: '5 Oct', text: 'Protected history', source: 'Another note' }]);
    expect(note.bowerNote).toEqual({ text: 'Protected explanation.', source: 'notes' });
    expect(note.properties).toEqual([{ key: 'contact', label: 'Contact', value: 'you@example.com' }]);
    expect(note.summary).toBe('Synthetic note');
    expect(note.byBower).toBe(true);
    expect(note.links).toEqual(['Another note']);
  });

  it.each(fixtures)('changes only the personal checkbox byte ($name)', ({ source }) => {
    const expected = source.replace('- [ ] Personal task', '- [x] Personal task');
    const changed = toggleTaskInText(source, 0);
    expect(changed).toEqual({ text: expected, label: 'Personal task 🪶  ', done: true });
    const before = new TextEncoder().encode(source);
    const after = new TextEncoder().encode(changed.text);
    expect(after).toHaveLength(before.length);
    expect([...after].filter((byte, i) => byte !== before[i])).toEqual([120]);
    expect(toggleTaskInText(changed.text, 0).text).toBe(source);
    for (const index of [-1, 1, 2, 0.5, NaN]) {
      expect(() => toggleTaskInText(source, index)).toThrow(BowerError);
    }
  });

  it('does not infer ownership from headings inside payloads', () => {
    const body = '## Current state\n- [ ] Personal task 🪶  \n## Timeline\nPersonal prose.';
    const source = raw.replace(personal, body).replace('## Current state\n' + paragraph, paragraph);
    const note = parseNote('Synthetic.md', source);
    expect(note.body).toBe(body);
    expect(note.currentState).toEqual([paragraph, '[ ] Protected task']);
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('- [ ] Personal task', '- [x] Personal task'));
  });

  it('uses parser task indices across fenced examples and empty labels', () => {
    const body = [
      '## My notes', '```markdown', '<!-- bower:ownership/2 end personal -->', '- [ ] Example only', '```',
      '\\<!-- bower:ownership/2 begin personal -->', '- [ ]   ', '- [ ] Personal task 🪶  ',
    ].join('\n');
    const source = raw.replace(personal, body);
    expect(parseNote('Synthetic.md', source).body).toBe(body);
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('- [ ] Personal task', '- [x] Personal task'));
    expect(() => toggleTaskInText(source, 1)).toThrow(BowerError);
  });

  it('has no personal task when its payload is empty', () => {
    const source = raw.replace(personal + '\n', '');
    expect(parseNote('Synthetic.md', source).body).toBe('');
    expect(() => toggleTaskInText(source, 0)).toThrow(BowerError);
  });

  const invalid = [
    { name: 'missing end marker', source: raw.replace('<!-- bower:ownership/2 end current -->\n', '') },
    { name: 'unsupported version', source: raw.replace('bower_format: ownership/2', 'bower_format: ownership/3') },
    { name: 'duplicate declaration', source: raw.replace('summary:', 'bower_format: ownership/2\nsummary:') },
    { name: 'unclaimed content', source: raw + 'Outside text\n- [ ] Unclaimed task' },
    { name: 'unclosed fence', source: raw.replace(personal, '```\n' + personal) },
    { name: 'lone CR', source: raw.replace(paragraph, paragraph + '\rX') },
  ];
  it.each(invalid)('refuses reading and task edits for $name', ({ source }) => {
    const before = new TextEncoder().encode(source);
    expect(() => parseNote('Synthetic.md', source)).toThrow(BowerError);
    expect(() => toggleTaskInText(source, 0)).toThrow(BowerError);
    expect(new TextEncoder().encode(source)).toEqual(before);
  });

  it('preserves the legacy ambiguity and ordinary My notes heading', () => {
    const body = 'Protected-looking prose.\n- [ ] Disputed task\n## My notes\n- [ ] Personal task';
    const source = '---\nsummary: Legacy\n---\n## Current state\n- Protected bullet\n' + body + '\n## Timeline\n- 5 Oct · History';
    expect(parseNote('Synthetic.md', source).body).toBe(body);
    expect(parseNote('Synthetic.md', source).currentState).toEqual(['Protected bullet']);
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('[ ] Disputed', '[x] Disputed'));
    expect(toggleTaskInText(source, 1).text).toBe(source.replace('[ ] Personal', '[x] Personal'));
  });

  it('keeps marker-looking text without frontmatter wholly personal', () => {
    const source = raw.slice(raw.indexOf('<!--'));
    expect(parseNote('Synthetic.md', source).body).toBe(source.replace(/\n+$/, ''));
    expect(toggleTaskInText(source, 0).text).toBe(source.replace('[ ] Protected', '[x] Protected'));
  });

  it('does not activate ownership/2 serialization', () => {
    const serialized = serializeNote(parseNote('Synthetic.md', raw));
    expect(serialized).not.toContain('bower_format:');
    expect(serialized).not.toContain('<!-- bower:ownership');
  });
});
