import type { Clock } from '../../src/common/clock';

/** A clock the tests move by hand, so time-based rules need no sleeping. */
export class FakeClock implements Clock {
  constructor(private current = Date.parse('2026-01-01T00:00:00.000Z')) {}

  now(): number {
    return this.current;
  }

  advanceSeconds(seconds: number): this {
    this.current += seconds * 1_000;
    return this;
  }
}
