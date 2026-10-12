import type { SignalCode } from '../../common/enums/signal-code.enum';
import { Status } from '../../common/enums/status.enum';

export interface FraudSignal {
  readonly code: SignalCode;
  readonly message: string;
  /** Points this signal contributed to the score. */
  readonly weight: number;
}

/**
 * The evaluation scratchpad passed down the chain.
 *
 * Mutation is funnelled through methods -- a handler can raise a signal or stop
 * the chain, but it cannot set the status. Only the decision handler may do
 * that, which is what keeps the score authoritative.
 */
export class FraudContext {
  private readonly raisedSignals: FraudSignal[] = [];
  private readonly applied: string[] = [];
  private readonly skipped: string[] = [];
  private currentScore = 0;
  private stopped = false;
  private currentStatus: Status | null = null;

  get signals(): readonly FraudSignal[] {
    return this.raisedSignals;
  }

  get score(): number {
    return this.currentScore;
  }

  /** True once a handler has raised a decisive signal; later checks are skipped. */
  get isStopped(): boolean {
    return this.stopped;
  }

  get checksApplied(): readonly string[] {
    return this.applied;
  }

  get checksSkipped(): readonly string[] {
    return this.skipped;
  }

  /** The decision. Throws if read before the decision handler has run. */
  get status(): Status {
    if (this.currentStatus === null) {
      throw new Error('Fraud decision was read before the decision handler ran');
    }
    return this.currentStatus;
  }

  /** Human-readable reasons, in the order they were raised. */
  get audits(): readonly string[] {
    return this.raisedSignals.map((signal) => signal.message);
  }

  addSignal(code: SignalCode, message: string, weight: number): this {
    const points = Math.max(0, Math.trunc(weight));
    this.raisedSignals.push(Object.freeze({ code, message, weight: points }));
    this.currentScore += points;
    return this;
  }

  /** Stops further detection. Does NOT decide the outcome -- the score still does. */
  stopChain(): this {
    this.stopped = true;
    return this;
  }

  recordApplied(handlerName: string): this {
    this.applied.push(handlerName);
    return this;
  }

  recordSkipped(handlerName: string): this {
    this.skipped.push(handlerName);
    return this;
  }

  decide(status: Status): this {
    this.currentStatus = status;
    return this;
  }
}
