/** Stub (METHOD step 6): the operator's allowlist in KV; answers nobody yet. */
export function allowKey(_email: string): string { return 'allow:stub'; }
export function isAllowed(_kv: KVNamespace, _email: string): Promise<boolean> { return Promise.resolve(false); }
