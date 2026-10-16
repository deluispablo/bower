/**
 * qa4-signout-tabs (qa-4 Claude F5, privacy): after sign-out, and after Delete my account, this browser tab keeps
 * nothing that says who was signed in. The desktop tabs went back to one tab on Home but kept their owner's email,
 * written again by the tabs store after `forgetThisPerson` had removed it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { forgetThisPerson } from '@/data/device';
import { useTabs } from './tabs-store';
import { useUi } from './ui-store';

const EMAIL = 'you@example.com';

/** Every value this device keeps for the page, both stores. */
const kept = (): string => [localStorage, sessionStorage].flatMap((s) => Object.keys(s).map((k) => `${k}=${s.getItem(k) ?? ''}`)).join('\n');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useTabs.getState().forPerson('someone-before@example.com');
  useTabs.getState().forPerson(EMAIL);
  useTabs.getState().open('/note/Resources/Cooking/Lemon%20tart.md');
});

describe('qa4-signout-tabs: sign-out forgets whose tabs these were', () => {
  it('AC1 signout-forgets-owner: forgotten as Settings does it after sign-out, no email is left on the device', () => {
    // Positive control: signed in, the tabs say whose they are.
    expect(kept()).toContain(EMAIL);
    // Settings: the session signs out (it forgets this person), then the screens forget theirs.
    forgetThisPerson();
    useUi.getState().forgetPerson();
    expect(kept()).not.toContain(EMAIL);
    expect(useTabs.getState()).toMatchObject({ tabs: [{ id: 1, route: '/' }], active: 1, owner: null });
  });

  it('AC2 later-change: in the other order, and after a later tab change, no email and no note of theirs is left', () => {
    useUi.getState().forgetPerson();
    forgetThisPerson();
    // The sign-in screen or a next visit changes the tabs: the store writes what it holds in memory.
    useTabs.getState().open('/settings');
    expect(kept()).not.toContain(EMAIL);
    expect(kept()).not.toContain('Lemon');
  });

  it('R3 next-person: the next person signed in gets one tab on Home and owns it', () => {
    forgetThisPerson();
    useUi.getState().forgetPerson();
    useTabs.getState().forPerson('someone@example.com');
    expect(useTabs.getState()).toMatchObject({ tabs: [{ id: 1, route: '/' }], owner: 'someone@example.com' });
  });

  it('R3 combined: after a later tab change, the next person still gets one tab on Home and owns it', () => {
    useUi.getState().forgetPerson();
    forgetThisPerson();
    useTabs.getState().open('/settings');
    useTabs.getState().forPerson('someone@example.com');
    expect(useTabs.getState()).toMatchObject({ tabs: [{ id: 1, route: '/' }], active: 1, owner: 'someone@example.com' });
    expect(useTabs.getState().tabs).toHaveLength(1);
  });
});
