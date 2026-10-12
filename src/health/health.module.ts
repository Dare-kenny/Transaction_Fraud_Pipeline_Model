import { Module } from '@nestjs/common';

import { FraudConfigModule } from '../config/fraud-config.module';
import { FraudModule } from '../fraud/fraud.module';
import { HealthController } from './health.controller';

@Module({
  imports: [FraudConfigModule, FraudModule],
  controllers: [HealthController],
})
export class HealthModule {}
