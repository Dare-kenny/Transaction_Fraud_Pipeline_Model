import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { fraudConfiguration } from './config/configuration';
import { FraudModule } from './fraud/fraud.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // .env.local wins over .env, so a developer override never edits a shared file.
      envFilePath: ['.env.local', '.env'],
      // Parsing and validation happen here: a bad value aborts startup.
      load: [fraudConfiguration],
    }),
    FraudModule,
    HealthModule,
  ],
})
export class AppModule {}
