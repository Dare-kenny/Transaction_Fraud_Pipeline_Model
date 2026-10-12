import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type Clock } from '../common/clock';
import { FRAUD_CONFIG, type FraudConfig } from '../config/fraud-config';
import { FRAUD_CHAIN } from './chain/fraud-chain.provider';
import type { FraudResponseDto } from './dto/fraud-response.dto';
import type { TransactionRequestDto } from './dto/transaction-request.dto';
import type { FraudHandler } from './handlers/fraud-handler';
import { FraudContext } from './model/fraud-context';
import { normalizeTransaction } from './model/transaction';

/**
 * Entry point for an evaluation: normalise, run the chain, project the result.
 *
 * It holds no rule logic and no knowledge of how many links exist -- it injects
 * one FRAUD_CHAIN handler and awaits the context that comes back.
 */
@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    @Inject(FRAUD_CHAIN) private readonly chain: FraudHandler,
    @Inject(FRAUD_CONFIG) private readonly config: FraudConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async check(request: TransactionRequestDto): Promise<FraudResponseDto> {
    const transaction = normalizeTransaction(request);
    const context = await this.chain.handle(transaction, new FraudContext());

    this.logger.log(
      `${context.status} score=${context.score} card=${transaction.maskedCard} ` +
        `user=${transaction.userId} signals=[${context.signals.map((s) => s.code).join(',')}]`,
    );

    return {
      status: context.status,
      score: context.score,
      thresholds: {
        review: this.config.scoring.reviewThreshold,
        reject: this.config.scoring.rejectThreshold,
      },
      audits: [...context.audits],
      signals: context.signals.map(({ code, message, weight }) => ({ code, message, weight })),
      checksApplied: [...context.checksApplied],
      checksSkipped: [...context.checksSkipped],
      card: transaction.maskedCard,
      evaluatedAt: new Date(this.clock.now()).toISOString(),
    };
  }
}
