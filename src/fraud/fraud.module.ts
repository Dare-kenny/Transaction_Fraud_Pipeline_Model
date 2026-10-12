import { Module } from '@nestjs/common';

import { FraudConfigModule } from '../config/fraud-config.module';
import { fraudChainProvider } from './chain/fraud-chain.provider';
import { FraudController } from './fraud.controller';
import { FraudService } from './fraud.service';
import { AmountThresholdHandler } from './handlers/amount-threshold.handler';
import { CardBlacklistHandler } from './handlers/card-blacklist.handler';
import { FinalDecisionHandler } from './handlers/final-decision.handler';
import { GeoIpHandler } from './handlers/geo-ip.handler';
import { VelocityHandler } from './handlers/velocity.handler';
import { GeoIpResolver } from './services/geo-ip.resolver';
import { VelocityStore } from './services/velocity.store';

@Module({
  imports: [FraudConfigModule],
  controllers: [FraudController],
  providers: [
    FraudService,
    GeoIpResolver,
    VelocityStore,
    CardBlacklistHandler,
    AmountThresholdHandler,
    VelocityHandler,
    GeoIpHandler,
    FinalDecisionHandler,
    fraudChainProvider,
  ],
  exports: [FraudService, VelocityStore, GeoIpResolver],
})
export class FraudModule {}
