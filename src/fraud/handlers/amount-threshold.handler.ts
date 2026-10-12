import { Inject, Injectable } from '@nestjs/common';

import { SignalCode } from '../../common/enums/signal-code.enum';
import { FRAUD_CONFIG, type FraudConfig } from '../../config/fraud-config';
import type { FraudContext } from '../model/fraud-context';
import type { NormalizedTransaction } from '../model/transaction';
import { FraudHandler } from './fraud-handler';

/** Link 2: transaction value above the configured ceiling. */
@Injectable()
export class AmountThresholdHandler extends FraudHandler {
  readonly name = 'amountThreshold';

  constructor(@Inject(FRAUD_CONFIG) private readonly config: FraudConfig) {
    super();
  }

  protected evaluate(transaction: NormalizedTransaction, context: FraudContext): void {
    const { amountThreshold } = this.config;
    if (transaction.amount <= amountThreshold) {
      return;
    }

    context.addSignal(
      SignalCode.AMOUNT_OVER_THRESHOLD,
      `Amount ${transaction.amount} exceeds the threshold of ${amountThreshold}`,
      this.config.scoring.weights[SignalCode.AMOUNT_OVER_THRESHOLD],
    );
  }
}
