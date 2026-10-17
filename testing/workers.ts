/// <reference types="node" />
export function workerBudget(env: Record<string, string | undefined> = process.env) {
  return env.HARNESS_LOCK_HELD
    ? { vitest: '75%' as const, playwright: '50%' as const }
    : { vitest: 2, playwright: 1 };
}
