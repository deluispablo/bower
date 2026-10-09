import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Segmented } from './Segmented';

afterEach(cleanup);

function Demo({ label, options }: { label: string; options: Array<[string, string]> }) {
  const [v, setV] = useState(options[0]?.[0] ?? '');
  return <Segmented label={label} value={v} onChange={setV} options={options.map(([value, text]) => ({ value, label: text }))} />;
}

describe('the segmented control', () => {
  it('one segmented control serves settings and tell bower', () => {
    render(
      <>
        <Demo label="What is it?" options={[['request', 'A request'], ['rule', 'A rule']]} />
        <Demo label="Appearance" options={[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]} />
      </>,
    );
    const kinds = screen.getByRole('radiogroup', { name: 'What is it?' });
    const theme = screen.getByRole('radiogroup', { name: 'Appearance' });
    expect(kinds.className).toBe(theme.className);
    expect(kinds.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(theme.querySelectorAll('[role="radio"]')).toHaveLength(3);
    // The radio group pattern (WAI-ARIA APG): one tab stop on the checked radio; arrows move and check.
    const [a, b] = screen.getAllByRole('radio', { name: /A request|A rule/ });
    expect(a).toHaveAttribute('aria-checked', 'true');
    expect(a).toHaveAttribute('tabindex', '0');
    expect(b).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(a as HTMLElement, { key: 'ArrowRight' });
    expect(b).toHaveAttribute('aria-checked', 'true');
    expect(b).toHaveFocus();
    fireEvent.keyDown(b as HTMLElement, { key: 'ArrowRight' });
    expect(a).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(b as HTMLElement);
    expect(b).toHaveAttribute('aria-checked', 'true');
  });
});
