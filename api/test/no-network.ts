/**
 * Setup file for every api test (vitest `setupFiles`: https://vitest.dev/config/#setupfiles; its hooks apply to each
 * test file). An api test never reaches the network: a real alarm that escaped into recovery once called GitHub with a
 * fixture token (defect deadlines-test-flake, 2026-10-08). The global `fetch` here refuses, and the
 * `afterEach` fails the test that called it. A test that needs `fetch` stubs it explicitly (`vi.spyOn(globalThis,
 * 'fetch')`), which replaces this guard for that test.
 */
import { afterEach } from 'vitest';

const calls: string[] = [];

/** For the guard's own test, which calls the network on purpose. */
export const forgetNetworkCalls = (): void => {
  calls.length = 0;
};

globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  calls.push(url);
  return Promise.reject(new Error(`unstubbed fetch in an api test: ${url}`));
};

afterEach(() => {
  if (calls.length === 0) return;
  const seen = calls.splice(0);
  throw new Error(`the test called the network through an unstubbed fetch: ${seen.join(', ')}`);
});
