// Hand-written type declaration for `generate-headers.mjs` (plain JS, no
// `@types/node`, see the comment at the top of that file): just the one
// export the test needs, typed for `app/test/generate-headers.test.ts`.
export declare function buildHeaders(env: {
  apiUrl: string | undefined;
  googleApiKey: string | undefined;
}): string;
