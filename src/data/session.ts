/**
 * One active place per person (TL-P2-13, TL-P2-14): inert stubs of the final
 * API, so the tests load and fail on their assertions. The behavior follows.
 */
import { BowerError } from './types';
import type { Sources, Unsubscribe } from './sources';
import type { WorkerApi } from './worker/worker-api';

/** Approved copy (TL-P2-13): the block screen's heading and the refusal of a fenced write. */
export const OPEN_ELSEWHERE_TEXT = 'Bower is open in another window.';
/** Approved copy (TL-P2-24): Use here got no answer from Bower's server (network, timeout). */
export const NO_ANSWER_TEXT = "Bower's server didn't answer. Try again.";
/** Approved copy (TL-P2-24): Bower's server answered and refused to move the session here. */
export const COULD_NOT_OPEN_TEXT = "Bower couldn't open here. Try again.";
/** Approved copy (TL-P2-24): the block screen's line while things added here exist only in this page. */
export const PAGE_ONLY_TEXT = 'Some things you added here are only on this page. Use Bower here to send them.';
/** A lease nobody renewed for this long is free: the next place takes it without asking. */
export const LEASE_TTL_MS = 3 * 60_000;
/** How often the active place renews its lease. */
export const HEARTBEAT_MS = 30_000;
/** How long a confirmed lease is trusted for ordinary writes. */
export const TRUST_MS = 5_000;

export type SessionAction = 'check' | 'take' | 'leave';
export interface LeaseReply {
  active: boolean;
  epoch: number;
}
export type LeaseCall = (place: string, action: SessionAction) => Promise<LeaseReply>;

export function isLeaseReply(_value: unknown): _value is LeaseReply {
  return false;
}

export class OpenElsewhereError extends BowerError {
  constructor() {
    super('conflict', OPEN_ELSEWHERE_TEXT);
  }
}

export function openElsewhere(): BowerError {
  return new BowerError('unknown', '');
}

export function isOpenElsewhere(_error: unknown): boolean {
  return false;
}

export function placeId(_storage?: Pick<Storage, 'getItem' | 'setItem'>): string {
  return '';
}

export type PlaceState = 'starting' | 'active' | 'elsewhere';

export interface PlaceSource {
  state(): PlaceState;
  start(): Promise<PlaceState>;
  useHere(): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
  pageOnly(): boolean;
}

export interface PlaceLocks {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean }, callback: (lock: unknown) => Promise<void>): Promise<void>;
}

export interface SessionMessage {
  scope: string;
  place: string;
  epoch: number;
}

export interface SessionBus {
  post(message: SessionMessage): void;
  listen(onMessage: (message: SessionMessage) => void): () => void;
}

export function sessionBus(): SessionBus | undefined {
  return undefined;
}

export interface PlaceClock {
  now(): number;
  every(ms: number, fn: () => void): () => void;
}

export interface PlaceOptions {
  place?: string;
  locks?: PlaceLocks;
  bus?: SessionBus;
  clock?: PlaceClock;
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

export type ActiveHow = 'start' | 'take' | 'return';

export interface PlaceDeps extends PlaceOptions {
  lease: LeaseCall;
  scope: () => Promise<string>;
  onActive?: (how: ActiveHow) => Promise<void> | void;
  onBlocked?: () => void;
  memory?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  pageOnly?: { now(): boolean; subscribe(cb: () => void): Unsubscribe };
}

export interface PlaceGuard extends PlaceSource {
  readonly place: string;
  epoch(): number | null;
  verify(fresh?: boolean): Promise<void>;
  leave(): Promise<void>;
  reset(): void;
  refused(): void;
  whenActive(): Promise<void>;
  dispose(): void;
}

export function createPlaceGuard(deps: PlaceDeps): PlaceGuard {
  return {
    place: deps.place ?? '',
    state: () => 'starting',
    start: async () => 'starting',
    useHere: async () => undefined,
    subscribe: () => () => undefined,
    pageOnly: () => false,
    epoch: () => null,
    verify: async () => undefined,
    leave: async () => undefined,
    reset: () => undefined,
    refused: () => undefined,
    whenActive: async () => undefined,
    dispose: () => undefined,
  };
}

export function needsFence(_key: PropertyKey): boolean {
  return false;
}

export interface DrivePolicy {
  before(key: PropertyKey, args: readonly unknown[]): Promise<void> | null;
  after(key: PropertyKey, result: unknown): void;
}

export function drivePolicy(_guard: PlaceGuard, _fresh: () => boolean = () => false): DrivePolicy {
  return { before: () => null, after: () => undefined };
}

export function fenceDrive<T extends object>(drive: T, _guard: PlaceGuard): T {
  return drive;
}

export function fenceWorker<T extends WorkerApi>(worker: T, _guard: PlaceGuard): T {
  return worker;
}

export function fenceDoors(sources: Sources, _guard: PlaceGuard): Sources {
  return sources;
}
