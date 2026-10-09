import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Rig, type RigPart } from './Rig';

it('the carry group exists, is hidden and reaches onPart', () => {
  const heard = new Map<RigPart, SVGGElement>();
  const { container } = render(<Rig onPart={(part, el) => void (el && heard.set(part, el))} />);
  const carry = container.querySelector('.b-carry');
  expect(carry).not.toBeNull();
  expect(carry).toHaveAttribute('display', 'none');
  expect(heard.get('carry')).toBe(carry);
});
