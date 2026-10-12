import { Inject, Injectable } from '@nestjs/common';

import { SignalCode } from '../../common/enums/signal-code.enum';
import { FRAUD_CONFIG, type FraudConfig } from '../../config/fraud-config';
import type { FraudContext } from '../model/fraud-context';
import type { NormalizedTransaction } from '../model/transaction';
import { VelocityStore } from '../services/velocity.store';
import { FraudHandler } from './fraud-handler';

/**
 * Link 3: too many attempts from one user inside the rolling window.
 *
 * The rule the Spring version advertised in config (velocityWindowSeconds,
 * maxAttempts) but never wrote, and the reason the request carries a userId.
 *
 * Counted per user. Because the count is only recorded when this link actually
 * runs, a card that was already blacklisted does not pollute the window.
 */
@Injectable()
export class VelocityHandler extends FraudHandler {
  readonly name = 'velocity';

  constructor(
    @Inject(FRAUD_CONFIG) private readonly config: FraudConfig,
    private readonly store: VelocityStore,
  ) {
    super();
  }

  protected evaluate(transaction: NormalizedTransaction, context: FraudContext): void {
    const reading = this.store.record(`user:${transaction.userId}`);
    if (!reading.exceeded) {
      return;
    }

    context.addSignal(
      SignalCode.VELOCITY_LIMIT_EXCEEDED,
      `User ${transaction.userId} made ${reading.attempts} attempts in ${reading.windowSeconds}s ` +
        `(limit ${reading.maxAttempts})`,
      this.config.scoring.weights[SignalCode.VELOCITY_LIMIT_EXCEEDED],
    );
  }
}
