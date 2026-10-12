/**
 * Injectable time source. The velocity rule is time-dependent, so time is a
 * dependency rather than a global: tests advance a FakeClock instead of sleeping.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

export const CLOCK = Symbol('CLOCK');

export const SystemClock: Clock = {
  now: () => Date.now(),
};
