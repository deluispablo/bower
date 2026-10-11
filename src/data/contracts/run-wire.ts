/** A run as the Worker sends it (worker contract, `RunWire`), and its shape check: pure, shared by every runtime. */
import { isRunPhase, type RunPhase } from './run-phases';
import { isQuestionSnapshot, type PublicQuestion } from './questions';

export type RunScope = 'all' | 'instructions';

export interface RunWire {
  id: string;
  scope: RunScope;
  phase: RunPhase;
  requestedAt: number;
  phaseAt: number;
  finishedAt?: number;
  total?: number;
  failure?: string;
  questions?: PublicQuestion[];
}

export function isRunWire(value: unknown): value is RunWire {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const number = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return typeof r.id === 'string' && r.id.trim().length > 0
    && (r.scope === 'all' || r.scope === 'instructions')
    && isRunPhase(r.phase)
    && number(r.requestedAt) && number(r.phaseAt)
    && (r.finishedAt === undefined || number(r.finishedAt))
    && (r.total === undefined || (number(r.total) && Number.isSafeInteger(r.total)))
    && (r.failure === undefined || (typeof r.failure === 'string' && r.failure.trim().length > 0))
    && (r.questions === undefined || isQuestionSnapshot(r.questions));
}
