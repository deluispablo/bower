// Adapted small ETag triplet / conditional-media pattern from Freed 7319c80.
// See LICENSE-Freed.txt and README.md; no Freed runtime or dependencies loaded.
import { readStable } from './binding.mjs';
import { V2_FIELDS } from './guard.mjs';
export function conditionalClient(guard, actor, DriveHttp) {
  const client = new DriveHttp({ token: guard.token, fetch: (url, init) => guard.fetch(actor, url, init) });
  const metadata = async () => {
    const authorization = `Bearer ${await guard.token(false)}`;
    const response = await guard.fetch(actor, `https://www.googleapis.com/drive/v2/files/${guard.context().fileId}?fields=${V2_FIELDS}`, { headers: { authorization } });
    if (!response.ok) throw new Error('Conditional validator acquisition refused.');
    return response.json();
  };
  return {
    async read(name, expected) {
      for (;;) {
      try { return await guard.operation(actor, name, async () => {
        if (name !== 'base_read') await client.get(guard.context().fileId);
        return readStable({ readMetadata: metadata, readBytes: async () => Buffer.from(await client.readText(guard.context().fileId)), expected, context: guard.context() });
      }); } catch (error) {
        if (name !== 'base_read') throw error;
        await guard.retryBaseAcquisition(actor);
      }
      }
    },
    put(name, payload, readToken) {
      return guard.operation(actor, name, async () => {
        const authorization = `Bearer ${await guard.token(false)}`;
        const response = await guard.fetch(actor, `https://www.googleapis.com/upload/drive/v2/files/${guard.context().fileId}?uploadType=media&fields=${V2_FIELDS}`, { method: 'PUT', headers: { authorization, 'content-type': 'text/markdown', 'if-match': readToken.etag }, body: payload });
        return { ok: response.ok, status: response.status };
      }, readToken);
    },
  };
}
