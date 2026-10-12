import { Inject, Injectable } from '@nestjs/common';

import { Status } from '../../common/enums/status.enum';
import { FRAUD_CONFIG, type FraudConfig } from '../../config/fraud-config';
import type { FraudContext } from '../model/fraud-context';
import { FraudHandler } from './fraud-handler';

/**
 * Last link: turns the accumulated score into the decision.
 *
 * The score is the decision, which is the gap this closes. In the Spring
 * version the score was computed and returned but ignored -- the outcome hinged
 * on whether the reasons list happened to be non-empty, so a 20-point soft
 * signal and a 100-point hard one landed in the same bucket. Here three
 * low-weight signals can add up past the review line, and the bands are
 * configurable without touching code.
 *
 * This is also the only handler that may set a status, and the only one that
 * runs even after a decisive signal stopped the chain.
 */
@Injectable()
export class FinalDecisionHandler extends FraudHandler {
  readonly name = 'finalDecision';

  protected readonly runsAfterStop = true;

  constructor(@Inject(FRAUD_CONFIG) private readonly config: FraudConfig) {
    super();
  }

  protected evaluate(_transaction: unknown, context: FraudContext): void {
    const { reviewThreshold, rejectThreshold } = this.config.scoring;

    if (context.score >= rejectThreshold) {
      context.decide(Status.REJECTED);
    } else if (context.score >= reviewThreshold) {
      context.decide(Status.REVIEWING);
    } else {
      context.decide(Status.APPROVED);
    }
  }
}
