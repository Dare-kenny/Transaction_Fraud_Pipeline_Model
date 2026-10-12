import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CLOCK, SystemClock } from '../common/clock';
import { FRAUD_CONFIG, FRAUD_CONFIG_NAMESPACE, type FraudConfig } from './fraud-config';

/**
 * Exposes the validated rule set and the system clock as injectable tokens.
 *
 * Handlers depend on FRAUD_CONFIG (a plain frozen object), not on ConfigService,
 * so they stay trivially unit-testable and free of string-keyed lookups.
 */
@Module({
  providers: [
    {
      provide: FRAUD_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): FraudConfig =>
        config.getOrThrow<FraudConfig>(FRAUD_CONFIG_NAMESPACE),
    },
    { provide: CLOCK, useValue: SystemClock },
  ],
  exports: [FRAUD_CONFIG, CLOCK],
})
export class FraudConfigModule {}
