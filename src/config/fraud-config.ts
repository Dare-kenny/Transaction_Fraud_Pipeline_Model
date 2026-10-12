import { SignalCode } from '../common/enums/signal-code.enum';

/** DI token for the validated, frozen configuration object. */
export const FRAUD_CONFIG = Symbol('FRAUD_CONFIG');

/** Namespace used by @nestjs/config, i.e. ConfigService.get('fraud'). */
export const FRAUD_CONFIG_NAMESPACE = 'fraud';

export interface GeoIpRangeConfig {
  readonly cidr: string;
  readonly country: string;
}

export interface VelocityConfig {
  readonly windowSeconds: number;
  readonly maxAttempts: number;
  readonly maxTrackedKeys: number;
}

export interface ScoringConfig {
  readonly reviewThreshold: number;
  readonly rejectThreshold: number;
  readonly weights: Readonly<Record<SignalCode, number>>;
}

/**
 * Fully parsed, validated and frozen rule configuration.
 *
 * Every field is guaranteed present and in range by the time the object is
 * constructed, which is why no handler downstream performs a null check.
 */
export interface FraudConfig {
  readonly amountThreshold: number;
  readonly geoAllowed: readonly string[];
  readonly blacklistCards: readonly string[];
  readonly velocity: VelocityConfig;
  readonly scoring: ScoringConfig;
  readonly geoIpRanges: readonly GeoIpRangeConfig[];
}
