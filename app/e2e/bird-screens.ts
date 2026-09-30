/**
 * Every route of the router and the URLs the room-rule walk visits for it
 * (R-BIRD-6, spec §6.21 rule 3). `app/test/bird-screens.test.ts` keeps
 * `SCREEN_ROUTES` equal to the `<Route>` list in `src/app.tsx`, so a new
 * route cannot skip the walk. Plain data: no Playwright import, so the unit
 * test can load it.
 */

/** One route pattern of the router and the URLs that walk it. */
export interface ScreenRoute {
  /** The pattern as `app.tsx` writes it; `default` is the catch-all. */
  pattern: string;
  /**
   * URLs to visit. `:id` is replaced with the id of the first note (or file)
   * the demo lists; `:path*` is a folder path.
   */
  urls: readonly string[];
}

export const SCREEN_ROUTES: readonly ScreenRoute[] = [
  { pattern: '/', urls: ['/'] },
  { pattern: '/login', urls: ['/login'] },
  { pattern: '/not-invited', urls: ['/not-invited'] },
  { pattern: '/privacy', urls: ['/privacy'] },
  { pattern: '/terms', urls: ['/terms'] },
  { pattern: '/note/:id', urls: ['/note/:id', '/note/does-not-exist'] },
  { pattern: '/file/:id', urls: ['/file/:id', '/file/does-not-exist'] },
  {
    pattern: '/folder/:path*',
    urls: [
      '/folder/1-Projects',
      '/folder/1-Projects/Flat%20hunt',
      '/folder/2-Areas/Car',
      '/folder/does-not-exist',
    ],
  },
  { pattern: '/notes', urls: ['/notes'] },
  { pattern: '/add', urls: ['/add'] },
  { pattern: '/bower', urls: ['/bower', '/bower?show=activity'] },
  { pattern: '/ideas', urls: ['/ideas'] },
  { pattern: '/just-filed', urls: ['/just-filed'] },
  { pattern: '/tell', urls: ['/tell'] },
  { pattern: '/search', urls: ['/search?q=viewing'] },
  { pattern: '/settings', urls: ['/settings'] },
  { pattern: '/health', urls: ['/health'] },
  { pattern: '/lint', urls: ['/lint'] },
  { pattern: '/onboarding', urls: ['/onboarding'] },
  { pattern: '/welcome', urls: ['/welcome', '/welcome?page=5'] },
  { pattern: '/recover', urls: ['/recover'] },
  { pattern: 'default', urls: ['/no/such/page'] },
];

/** The states walked beside the routes (R-BIRD-6), by name. */
export const SCREEN_STATES = [
  'tidy-up sheet',
  'tour',
  'empty folder',
  'offline',
  '404',
  'signed-out sign-in',
  'dictation',
  'Reading',
] as const;
