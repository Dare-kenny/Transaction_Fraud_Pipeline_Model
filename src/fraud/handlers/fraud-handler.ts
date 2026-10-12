import type { FraudContext } from '../model/fraud-context';
import type { NormalizedTransaction } from '../model/transaction';

/**
 * Base link of the chain of responsibility.
 *
 * `handle` is a template method: it records the visit, runs the subclass's
 * `evaluate`, then forwards to the next link. Subclasses implement one rule and
 * never touch the wiring -- there is no per-handler `setNext` boilerplate and no
 * no-op override on the last link.
 *
 * Short-circuiting: when a handler calls `context.stopChain()`, later detectors
 * are skipped but the chain is still walked to the end, so the decision handler
 * (which sets `runsAfterStop`) always runs. That keeps the outcome decided in
 * exactly one place.
 */
export abstract class FraudHandler {
  /** Stable name used in the audit trail. */
  abstract readonly name: string;

  /** Only the decision handler opts into running after a decisive signal. */
  protected readonly runsAfterStop: boolean = false;

  private nextHandler?: FraudHandler;

  /** Returns the handler just linked, so a chain can be built fluently. */
  setNext(next: FraudHandler): FraudHandler {
    this.nextHandler = next;
    return next;
  }

  async handle(
    transaction: NormalizedTransaction,
    context: FraudContext,
  ): Promise<FraudContext> {
    if (context.isStopped && !this.runsAfterStop) {
      context.recordSkipped(this.name);
    } else {
      context.recordApplied(this.name);
      await this.evaluate(transaction, context);
    }

    return this.nextHandler ? this.nextHandler.handle(transaction, context) : context;
  }

  /** One rule. Raise signals on the context; never set the status here. */
  protected abstract evaluate(
    transaction: NormalizedTransaction,
    context: FraudContext,
  ): void | Promise<void>;
}
