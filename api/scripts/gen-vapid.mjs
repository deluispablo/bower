// Generates the operator's VAPID key pair for web push (RFC 8292) and
// prints it in the format the Worker expects (`api/src/push.ts`):
//
// - VAPID_PUBLIC_KEY: base64url of the raw uncompressed P-256 point (65 bytes)
// - VAPID_PRIVATE_KEY: base64url of the 32-byte private scalar (JWK `d`)
//
// Run it once per instance and keep the pair: changing it invalidates every
// browser subscription. The keys are printed to this terminal only; nothing
// is written to disk.
//
// Plain `.mjs` for the same reasons as `bundle-template.mjs`: no TypeScript
// loader, no `@types/node`, every Node API imported rather than global.
// Uses Node's Web Crypto (`globalThis.crypto.subtle`), the same API the
// Worker signs with.
//
// Usage: pnpm -C api gen-vapid

import { Buffer } from 'node:buffer';
import process from 'node:process';

const { subtle } = globalThis.crypto;

const pair = await subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
const publicKey = Buffer.from(
  await subtle.exportKey('raw', pair.publicKey),
).toString('base64url');
const { d: privateKey } = await subtle.exportKey('jwk', pair.privateKey);

process.stdout.write(
  [
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    '',
    'Set them as Worker secrets (paste each value when asked):',
    '  pnpm -C api exec wrangler secret put VAPID_PUBLIC_KEY',
    '  pnpm -C api exec wrangler secret put VAPID_PRIVATE_KEY',
    '',
    'For wrangler dev, put the two lines above in api/.dev.vars instead.',
    '',
  ].join('\n'),
);
