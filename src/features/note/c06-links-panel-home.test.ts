import { describe, expect, it } from 'vitest';
import * as scripted from '@/data/spine/scripted';
import * as panel from './RightPanel';

// Ledger item 10: the reason-line grammar lives in the one link-rule home; the panel only consumes it.
describe('AC21 c06-links-panel-home', () => {
  it('the link-rule home exports the reason extraction', () => {
    expect(typeof (scripted as Record<string, unknown>).linkReasons).toBe('function');
  });
  it('the panel keeps no reason parser of its own', () => {
    expect((panel as Record<string, unknown>).linkReasons).toBeUndefined();
  });
});
