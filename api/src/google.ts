/** Stub (METHOD step 6): signatures only; the implementation follows. */
import type { JWTVerifyGetKey } from 'jose';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_SCOPE = 'openid email profile https://www.googleapis.com/auth/drive';

export interface GoogleTokens { idToken: string; refreshToken: string | null }
export interface GoogleIdentity { sub: string; email: string; emailVerified: boolean; name: string }

const todo = (): never => { throw new Error('not implemented'); };

export function createState(): string { return todo(); }
export function createNonce(): string { return todo(); }
export function createCodeVerifier(): string { return todo(); }
export function codeChallenge(_verifier: string): Promise<string> { return todo(); }
export function buildAuthUrl(_p: { clientId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string; consent: boolean }): string { return todo(); }
export function exchangeCode(_p: { code: string; codeVerifier: string; clientId: string; clientSecret: string; redirectUri: string }, _f?: FetchLike): Promise<GoogleTokens> { return todo(); }
export function googleKeys(_f?: FetchLike): JWTVerifyGetKey { return todo(); }
export function verifyIdToken(_idToken: string, _p: { clientId: string; nonce: string; keys: JWTVerifyGetKey; now?: number }): Promise<GoogleIdentity> { return todo(); }
