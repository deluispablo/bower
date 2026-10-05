// Future authorized read-only smoke command. No fixture creation or mutation.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeAppAdapter } from './adapter.mjs';
try {
  const [configFile, resourceFile, approved] = process.argv.slice(2);
  if (!configFile || !resourceFile || approved !== '--authorized-execution') throw new Error();
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const resources = JSON.parse(await readFile(resourceFile, 'utf8'));
  const { api, hashes } = await makeAppAdapter(config, resources, (event) => console.log(JSON.stringify(event)));
  const files = await api.listAll(resources.rootAliases[`ROOT_${config.identityAlias}`]);
  const summaries = [];
  for (const [alias, id] of Object.entries(resources.allowedIds)) {
    if (alias.startsWith('TEXT_')) {
      const text = await api.readText(id);
      summaries.push({ alias, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') });
    }
  }
  console.log(JSON.stringify({ status: 'read-only-smoke', identityAlias: config.identityAlias, fileCount: files.length, sourceHashes: hashes, textHashes: summaries, limitations: 'This smoke is not an R1/R2/R4 case or production session proof.' }));
} catch {
  console.error('Bounded read refused. No credentials, provider body or resource identifiers printed.');
  process.exitCode = 1;
}
