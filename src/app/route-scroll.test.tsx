/**
 * ux-first-home-polish R3-2: a new screen opens at the top (push or replace); back and forward leave scroll to the browser.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteFocus } from './App';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Go() {
  const navigate = useNavigate();
  return <><button type="button" onClick={() => void navigate('/b')}>Push</button><button type="button" onClick={() => void navigate(-1)}>Back</button></>;
}

function mount(entries: string[]) {
  const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  render(<MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}><RouteFocus /><Go /></MemoryRouter>);
  return spy;
}

const press = (name: string) => act(async () => { fireEvent.click(screen.getByRole('button', { name })); await Promise.resolve(); });

describe('route scroll', () => {
  it('AC4 route_push_scrolls_to_top', async () => {
    const spy = mount(['/a']);
    await press('Push');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(0, 0);
  });

  it('AC4 route_pop_keeps_scroll (guard)', async () => {
    const spy = mount(['/a', '/b']);
    spy.mockClear();
    await press('Back');
    expect(spy).not.toHaveBeenCalled();
  });
});
