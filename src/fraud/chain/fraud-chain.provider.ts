import type { Provider } from '@nestjs/common';

import { AmountThresholdHandler } from '../handlers/amount-threshold.handler';
import { CardBlacklistHandler } from '../handlers/card-blacklist.handler';
import { FinalDecisionHandler } from '../handlers/final-decision.handler';
import { FraudHandler } from '../handlers/fraud-handler';
import { GeoIpHandler } from '../handlers/geo-ip.handler';
import { VelocityHandler } from '../handlers/velocity.handler';

/** DI token for the head of the chain. */
export const FRAUD_CHAIN = Symbol('FRAUD_CHAIN');

/**
 * The pipeline order, cheapest and most decisive first:
 *
 *   cardBlacklist -> amountThreshold -> velocity -> geoIp -> finalDecision
 *
 * Adding a rule is one new handler class plus one entry in this array. Nothing
 * else in the codebase changes, and no handler knows who follows it.
 */
const CHAIN_ORDER = [
  CardBlacklistHandler,
  AmountThresholdHandler,
  VelocityHandler,
  GeoIpHandler,
  FinalDecisionHandler,
] as const;

export const fraudChainProvider: Provider = {
  provide: FRAUD_CHAIN,
  inject: [...CHAIN_ORDER],
  useFactory: (...handlers: FraudHandler[]): FraudHandler => {
    handlers.reduce((previous, current) => previous.setNext(current));
    return handlers[0];
  },
};
