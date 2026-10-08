import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

describe('BirdLab ships only in development', () => {
  it('_bird route is guarded by import.meta.env.DEV', () => {
    // BirdLab route should only exist in development builds
    // The App.tsx Signed() function should have a conditional check for import.meta.env.DEV
    // around the _bird route to prevent it from being bundled in production
    const filename = fileURLToPath(import.meta.url);
    const appPath = join(dirname(filename), 'App.tsx');
    const source = readFileSync(appPath, 'utf-8');

    // Check that the route definition is guarded by a dev-only check
    const birdRoutePattern = /import\.meta\.env\.DEV.*?_bird|_bird.*?import\.meta\.env\.DEV/s;
    expect(source).toMatch(birdRoutePattern);
  });
});
