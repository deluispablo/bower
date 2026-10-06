/**
 * The pretend Worker's session lease (TL-P2-14, TL-P2-25): inert stubs of the
 * final API, so the tests load and fail on their assertions.
 */
import { createPlaceGuard, type LeaseReply, type PlaceDeps, type PlaceGuard, type PlaceOptions, type SessionAction } from '../session';

export interface LeaseRecord {
  holder: string | null;
  epoch: number;
  beatAt: number;
}

export interface FakeLeaseOptions {
  key: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
  ttlMs?: number;
}

export function leaseKey(world: string, person: string): string {
  return `${world}:${person}`;
}

export class FakeLease {
  constructor(readonly opts: FakeLeaseOptions) {}

  async session(_place: string, _action: SessionAction): Promise<LeaseReply> {
    return { active: false, epoch: 0 };
  }

  holds(_place: string | null, _epoch: number | null): boolean {
    return true;
  }

  read(): LeaseRecord {
    return { holder: null, epoch: 0, beatAt: 0 };
  }
}

export interface LocalPlaceOptions extends PlaceOptions, Pick<PlaceDeps, 'onActive' | 'onBlocked' | 'pageOnly'> {
  world: string;
  person: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
}

export function localPlace(opts: LocalPlaceOptions): PlaceGuard {
  return createPlaceGuard({ lease: async () => ({ active: false, epoch: 0 }), scope: async () => `${opts.world}:${opts.person}` });
}
