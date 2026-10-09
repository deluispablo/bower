// Stub for the red commit (c3-timer-gate): a gate that lets every timer through.
export const TIMER_LIMIT_MS = 100;
type Schedule = (handler: unknown, ms?: number, ...rest: unknown[]) => unknown;
export interface TimerHost {
  setTimeout: Schedule;
  setInterval: Schedule;
}
export interface TimerGate {
  finish(testName: string): string | null;
}
export const createTimerGate = (_host: TimerHost, _isFake: () => boolean, _allow: readonly string[]): TimerGate => ({ finish: () => null });
export const fullName = (task: { name: string }): string => task.name;
