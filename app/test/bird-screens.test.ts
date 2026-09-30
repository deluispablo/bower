import { describe, expect, it } from 'vitest';

import appSource from '../src/app.tsx?raw';
import { SCREEN_ROUTES } from '../e2e/bird-screens.js';
import { JUST_FILED_PATH } from '../src/just-filed.js';
import { BOWER_PATH, IDEAS_PATH } from '../src/shell-routes.js';

const CONSTANTS: Record<string, string> = {
  BOWER_PATH,
  IDEAS_PATH,
  JUST_FILED_PATH,
};

/** The patterns of the router's `<Route>` elements, `default` for the catch-all. */
function routerPatterns(): string[] {
  const patterns: string[] = [];
  for (const match of appSource.matchAll(
    /<Route\s+(?:path=(?:"([^"]+)"|\{(\w+)\})|(default))/g,
  )) {
    if (match[3] !== undefined) {
      patterns.push('default');
    } else if (match[1] !== undefined) {
      patterns.push(match[1]);
    } else {
      const name = match[2] ?? '';
      const value = CONSTANTS[name];
      if (value === undefined) throw new Error(`Unknown route constant ${name}`);
      patterns.push(value);
    }
  }
  return patterns;
}

describe('the bird room walk covers the router', () => {
  it('lists exactly the routes of app.tsx', () => {
    const router = routerPatterns();
    expect(router.length).toBeGreaterThan(15);
    expect([...SCREEN_ROUTES.map((r) => r.pattern)].sort()).toEqual(
      [...router].sort(),
    );
  });

  it('gives every route at least one URL', () => {
    for (const route of SCREEN_ROUTES) {
      expect(route.urls.length, route.pattern).toBeGreaterThan(0);
    }
  });
});
