// @vitest-environment jsdom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it } from 'vitest';

import { NotePropertiesList } from '../src/components/note-properties.js';

it('shows the created date as "Written" with the short date (#859)', () => {
  const root = document.createElement('div');
  void act(() => {
    render(
      h(NotePropertiesList, {
        folder: undefined,
        properties: { tags: [], created: '2026-09-28' },
      }),
      root,
    );
  });
  const text = root.textContent ?? '';
  expect(text).toContain('Written');
  expect(text).toContain('28 Sep');
  expect(text).not.toContain('2026-09-28');
  expect(text).not.toContain('Created');
});
