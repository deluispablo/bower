// @vitest-environment jsdom

import { h, render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatusSelect } from '../src/components/status-select.js';

const STATUSES = ['new', 'to view', 'viewed', 'not for me'];

let host: HTMLElement;

function mount(props: Parameters<typeof StatusSelect>[0]): HTMLSelectElement {
  host = document.createElement('div');
  document.body.append(host);
  render(h(StatusSelect, props), host);
  const select = host.querySelector('select');
  if (select === null) throw new Error('no select');
  return select;
}

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('StatusSelect', () => {
  it('is named after the item and shows the statuses capitalised', () => {
    const select = mount({
      name: '10-43 Buckley St',
      value: 'to view',
      statuses: STATUSES,
      onChange: () => undefined,
    });
    expect(select.getAttribute('aria-label')).toBe(
      'Status of 10-43 Buckley St',
    );
    expect(select.value).toBe('to view');
    expect(Array.from(select.options, (option) => option.text)).toEqual([
      'New',
      'To view',
      'Viewed',
      'Not for me',
    ]);
  });

  it('shows the date line outside the select', () => {
    const select = mount({
      name: 'A flat',
      value: 'to view',
      statuses: STATUSES,
      dateLine: 'Viewing Wed 1 Oct',
      onChange: () => undefined,
    });
    const line = host.querySelector('.status-select-date');
    expect(line?.textContent).toBe('Viewing Wed 1 Oct');
    expect(select.contains(line)).toBe(false);
  });

  it('has no date line without one', () => {
    mount({
      name: 'A flat',
      value: 'new',
      statuses: STATUSES,
      onChange: () => undefined,
    });
    expect(host.querySelector('.status-select-date')).toBeNull();
  });

  it('keeps an older value as an extra option and reports a change', () => {
    const onChange = vi.fn();
    const select = mount({
      name: 'An offer',
      value: 'declined',
      statuses: STATUSES,
      onChange,
    });
    expect(select.options[select.options.length - 1]?.text).toBe('Declined');
    select.value = 'viewed';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('viewed');
  });
});
