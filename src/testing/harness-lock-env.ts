/// <reference types="node" />
/** Lock fixtures must acquire their own lock, even inside a locked gate. */
export const lockTestEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const env = { ...process.env, ...overrides };
  delete env.HARNESS_LOCK_HELD;
  return env;
};
