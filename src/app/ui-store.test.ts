import { describe, expect, it } from 'vitest';
import { useUi } from './ui-store';

describe('the screen state of a person', () => {
  it('sign-out forgets open folders, the selection and bookmarks', () => {
    const ui = useUi.getState();
    ui.openAll(['Projects', 'Projects/Flat hunt']);
    ui.select('Projects/Flat hunt');
    ui.toggleBookmark('Resources/Cooking/Lemon tart.md');
    useUi.getState().forgetPerson();
    const after = useUi.getState();
    expect([...after.open]).toEqual([]);
    expect(after.selected).toBeNull();
    expect(after.bookmarks).toEqual([]);
  });
});
