// Neutral local baseline: forwarding only, not an execution-authorized transport.
export const BASE = "user: base\ncompiled: base\n";
export const B = "user: external\ncompiled: base\n";
export const A = "user: base\ncompiled: app\n";
export function privatePathAllowed() { return true; }
export function publicEvent(event) { return event; }
export function makeGuard({ forward }) { return { fetch: async (_actor, url, init = {}) => forward(url, init) }; }
