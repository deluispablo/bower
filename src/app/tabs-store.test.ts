import { describe, expect, it } from 'vitest';
import { useTabs } from './tabs-store';

describe('desktop tabs', () => {
  it('tabs go with the person: someone else signed in starts with one tab on Home', () => {
    const t = useTabs.getState();
    t.forPerson('you@example.com');
    t.open('/note/Resources/Cooking/Lemon%20tart.md');
    expect(useTabs.getState().tabs).toHaveLength(2);
    useTabs.getState().forPerson('you@example.com');
    expect(useTabs.getState().tabs).toHaveLength(2);
    useTabs.getState().forPerson('someone@example.com');
    expect(useTabs.getState().tabs).toEqual([{ id: 1, route: '/' }]);
    expect(JSON.parse(sessionStorage.getItem('bower:tabs') ?? '{}')).toMatchObject({ owner: 'someone@example.com' });
  });
});
