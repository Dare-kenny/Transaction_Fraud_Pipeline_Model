import { Controller, Get, Inject } from '@nestjs/common';

import { FRAUD_CONFIG, type FraudConfig } from '../config/fraud-config';
import { GeoIpResolver } from '../fraud/services/geo-ip.resolver';
import { VelocityStore } from '../fraud/services/velocity.store';

/**
 * Stands in for Spring Actuator's /health, minus the datasource check this
 * service has no need of. Reports the live rule set so a deploy can be verified
 * without shell access -- counts and thresholds only, never the blacklist
 * entries themselves.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(FRAUD_CONFIG) private readonly config: FraudConfig,
    private readonly velocityStore: VelocityStore,
    private readonly geoIpResolver: GeoIpResolver,
  ) {}

  @Get()
  health() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      rules: {
        amountThreshold: this.config.amountThreshold,
        geoAllowed: this.config.geoAllowed,
        blacklistedCardCount: this.config.blacklistCards.length,
        geoIpRangeCount: this.geoIpResolver.rangeCount,
        velocity: this.config.velocity,
        scoring: {
          reviewThreshold: this.config.scoring.reviewThreshold,
          rejectThreshold: this.config.scoring.rejectThreshold,
          weights: this.config.scoring.weights,
        },
      },
      state: {
        velocityTrackedKeys: this.velocityStore.trackedKeys,
      },
    };
  }
}
