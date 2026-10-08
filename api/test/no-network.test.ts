import { describe, expect, it } from 'vitest';

import { forgetNetworkCalls } from './no-network.js';

describe('api test network guard (TL-P4-14)', () => {
  it('an api test that calls the network fails', async () => {
    // An unstubbed global fetch is refused with a sentence that names it; a test that needs fetch stubs it itself.
    await expect(fetch('https://api.github.com/repos/OWNER/REPO/actions/runs')).rejects.toThrow(/unstubbed fetch/);
    // This test made the call on purpose: forget it, so only the afterEach of other tests judges them.
    forgetNetworkCalls();
  });
});
