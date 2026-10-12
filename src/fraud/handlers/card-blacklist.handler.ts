import { Inject, Injectable } from '@nestjs/common';

import { SignalCode } from '../../common/enums/signal-code.enum';
import { FRAUD_CONFIG, type FraudConfig } from '../../config/fraud-config';
import type { FraudContext } from '../model/fraud-context';
import type { NormalizedTransaction } from '../model/transaction';
import { FraudHandler } from './fraud-handler';

/**
 * Link 1: known-bad card.
 *
 * A hit is decisive, so it stops further detection (nothing cheaper can change
 * the outcome). It still only raises a weighted signal: the decision handler
 * turns the score into REJECTED.
 */
@Injectable()
export class CardBlacklistHandler extends FraudHandler {
  readonly name = 'cardBlacklist';

  private readonly blacklist: ReadonlySet<string>;

  constructor(@Inject(FRAUD_CONFIG) private readonly config: FraudConfig) {
    super();
    // A Set turns the Spring version's O(n) list scan into O(1).
    this.blacklist = new Set(config.blacklistCards);
  }

  protected evaluate(transaction: NormalizedTransaction, context: FraudContext): void {
    if (!this.blacklist.has(transaction.cardNumber)) {
      return;
    }

    context
      .addSignal(
        SignalCode.BLACKLISTED_CARD,
        `Card ${transaction.maskedCard} is blacklisted`,
        this.config.scoring.weights[SignalCode.BLACKLISTED_CARD],
      )
      .stopChain();
  }
}
