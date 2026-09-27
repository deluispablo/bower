import { describe, expect, it } from 'vitest';

import aboutMeTemplate from '../../vault-template/About-Me.md?raw';
import rulesTemplate from '../../vault-template/Rules.md?raw';
import { interviewToFiles, replaceSection } from '../src/interview.js';
import type { InterviewAnswers } from '../src/interview.js';

const ABOUT_ME = aboutMeTemplate.replace(/\r\n/g, '\n');
const RULES = rulesTemplate.replace(/\r\n/g, '\n');

const ANSWERS: InterviewAnswers = {
  keep: 'Everything I capture',
  languages: 'English and Spanish',
  areas: ['Health', 'Career', 'Home'],
  titleStyle: 'Short and plain',
  example: '2026-09-27 Dentist',
};

describe('replaceSection', () => {
  it('appends a new section at the end when there is none yet', () => {
    const text = '# Title\n\nSome intro.\n\n## Existing\n- one\n';
    expect(replaceSection(text, '## New', ['- two'])).toBe(
      '# Title\n\nSome intro.\n\n## Existing\n- one\n\n## New\n- two\n',
    );
  });

  it('replaces an existing section in place, leaving the rest untouched', () => {
    const text = '## Before\n- a\n\n## Target\n- old\n\n## After\n- b\n';
    expect(replaceSection(text, '## Target', ['- new'])).toBe(
      '## Before\n- a\n\n## Target\n- new\n\n## After\n- b\n',
    );
  });

  it('is idempotent: running it again with the same body changes nothing', () => {
    const once = replaceSection('# Title\n', '## Section', ['- a', '- b']);
    expect(replaceSection(once, '## Section', ['- a', '- b'])).toBe(once);
  });

  it('never touches a heading inside a fenced code block', () => {
    const text = '# Title\n\n```\n## Not a heading\n```\n\n## Real\n- x\n';
    const result = replaceSection(text, '## Real', ['- y']);
    expect(result).toContain('```\n## Not a heading\n```');
    expect(result).toContain('## Real\n- y');
  });

  it('keeps frontmatter and the intro when adding the first section', () => {
    const text = '---\ntags: [meta]\n---\n\n# Title\n\nIntro line.\n';
    expect(replaceSection(text, '## New', ['- one'])).toBe(
      '---\ntags: [meta]\n---\n\n# Title\n\nIntro line.\n\n## New\n- one\n',
    );
  });
});

describe('interviewToFiles', () => {
  it('adds a "From the interview" section to About-Me.md, template untouched otherwise', () => {
    const files = interviewToFiles(ANSWERS, { aboutMe: ABOUT_ME, rules: '' });

    expect(files.aboutMe).toContain('## Who I am');
    expect(files.aboutMe).toContain('## Preferences');
    expect(files.aboutMe).toContain(
      [
        '## From the interview',
        '- What to keep here: Everything I capture',
        '- Notes come in: English and Spanish',
        '- Areas to start with: Health, Career, Home',
      ].join('\n'),
    );
  });

  it('adds a title-and-tag rule to Rules.md', () => {
    const files = interviewToFiles(ANSWERS, { aboutMe: '', rules: RULES });

    expect(files.rules).toContain(
      '## From the interview\n- Titles and tags: Short and plain, e.g. `2026-09-27 Dentist`',
    );
  });

  it('says just the example when the style is blank, and vice versa', () => {
    const styleOnly = interviewToFiles(
      { ...ANSWERS, example: '' },
      { aboutMe: '', rules: '' },
    );
    expect(styleOnly.rules).toContain('- Titles and tags: Short and plain\n');

    const exampleOnly = interviewToFiles(
      { ...ANSWERS, titleStyle: '' },
      { aboutMe: '', rules: '' },
    );
    expect(exampleOnly.rules).toContain(
      '- Titles and tags: e.g. `2026-09-27 Dentist`\n',
    );
  });

  it('returns one folder note per area, tagged and named after it', () => {
    const files = interviewToFiles(ANSWERS, { aboutMe: '', rules: '' });

    expect(files.areas.map((a) => a.name)).toEqual([
      'Health',
      'Career',
      'Home',
    ]);
    expect(files.areas[0]?.note).toContain('tags: [meta, area]');
    expect(files.areas[0]?.note).toContain('# Health');
  });

  it('drops blank and duplicate area names, and sanitizes a slash', () => {
    const files = interviewToFiles(
      { ...ANSWERS, areas: ['Health', '  ', 'Health', 'Side/Projects'] },
      { aboutMe: '', rules: '' },
    );

    expect(files.areas.map((a) => a.name)).toEqual(['Health', 'Side-Projects']);
  });

  it('leaves every blank answer out, and both files unchanged when all are blank', () => {
    const blank: InterviewAnswers = {
      keep: '',
      languages: '  ',
      areas: [],
      titleStyle: '',
      example: '',
    };
    const files = interviewToFiles(blank, { aboutMe: ABOUT_ME, rules: RULES });

    expect(files.aboutMe).toBe(ABOUT_ME);
    expect(files.rules).toBe(RULES);
    expect(files.areas).toEqual([]);
  });

  it('replaying with new answers replaces the section, never duplicates it', () => {
    const first = interviewToFiles(ANSWERS, {
      aboutMe: ABOUT_ME,
      rules: RULES,
    });
    const second = interviewToFiles(
      { ...ANSWERS, keep: 'Work notes', areas: ['Finance'] },
      { aboutMe: first.aboutMe, rules: first.rules },
    );

    expect(second.aboutMe.match(/## From the interview/g)).toHaveLength(1);
    expect(second.aboutMe).toContain('- What to keep here: Work notes');
    expect(second.aboutMe).not.toContain('Everything I capture');
    expect(second.aboutMe).toContain('## Who I am');
  });
});
