/** A run as the Worker sends it (worker contract, `RunWire`), and its shape check: pure, shared by every runtime. */
import type { RunPhase } from './types';

export interface RunWire {
  id: string;
  scope: 'all' | 'instructions';
  phase: RunPhase;
  requestedAt: number;
  phaseAt: number;
  finishedAt?: number;
  total?: number;
  failure?: string;
}

export function isRunWire(value: unknown): value is RunWire {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const number = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const phases: readonly string[] = ['queued', 'reading', 'writing', 'saving', 'done', 'failed'];
  return typeof r.id === 'string' && r.id.trim().length > 0
    && (r.scope === 'all' || r.scope === 'instructions')
    && typeof r.phase === 'string' && phases.includes(r.phase)
    && number(r.requestedAt) && number(r.phaseAt)
    && (r.finishedAt === undefined || number(r.finishedAt))
    && (r.total === undefined || (number(r.total) && Number.isSafeInteger(r.total)))
    && (r.failure === undefined || (typeof r.failure === 'string' && r.failure.trim().length > 0));
}
