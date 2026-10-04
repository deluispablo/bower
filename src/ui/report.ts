import { BowerError } from '@/data/types';
import { toast } from './toast';

/** Something the person asked for went wrong: one sentence for them, the details for the console. */
export function report(e: unknown, sentence: string): void {
  console.error(e);
  toast(e instanceof BowerError ? e.message : sentence);
}
