// Coordinator-only response observation; no OAuth source or transport change.
import { readFile } from 'node:fs/promises';
import { serve } from './bower-google-probe-setup-v3/oauth-local.mjs';

try {
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const server = await serve(config);
  server.prependListener('request', (request, response) => {
    const path = request.url?.split('?')[0];
    const route = ['/', '/start', '/auth/callback', '/complete'].includes(path) ? path : 'other';
    const method = ['GET', 'POST'].includes(request.method) ? request.method : 'other';
    console.log(JSON.stringify({
      event: 'local_request', method, route,
      hostMatches: request.headers.host === 'localhost:8788',
      originMatches: request.headers.origin === new URL(config.redirectUri).origin,
      bindingCookiePresent: /(?:^|; )bower_probe_browser=/.test(request.headers.cookie ?? ''),
    }));
    response.once('finish', () => {
      const location = response.getHeader('location');
      let redirectsToGoogle = false;
      if (typeof location === 'string') {
        try { redirectsToGoogle = new URL(location, config.redirectUri).origin === 'https://accounts.google.com'; }
        catch { /* Classification only; never emit the header. */ }
      }
      console.log(JSON.stringify({ event: 'local_response', method, route, status: response.statusCode, redirectsToGoogle }));
    });
  });
  const stop = () => server.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch {
  console.error('Local observed setup refused; no private details emitted.');
  process.exitCode = 1;
}
