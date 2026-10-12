import { registerAs } from '@nestjs/config';

import { SIGNAL_CODES, SignalCode } from '../common/enums/signal-code.enum';
import { parseCidr } from '../common/util/ipv4';
import {
  FRAUD_CONFIG_NAMESPACE,
  type FraudConfig,
  type GeoIpRangeConfig,
} from './fraud-config';
import { DEFAULT_GEO_IP_RANGES } from './geo-ip.table';

/** Thrown at startup when the environment cannot produce a usable rule set. */
export class ConfigurationError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(
      `Invalid fraud pipeline configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'ConfigurationError';
  }
}

type RawEnv = Record<string, string | undefined>;

const DEFAULTS = {
  amountThreshold: 20_000_000,
  geoAllowed: 'NG,GB,NZ,NL,AU,FR,DE,CA',
  blacklistCards: '',
  velocityWindowSeconds: 60,
  velocityMaxAttempts: 5,
  velocityMaxTrackedKeys: 10_000,
  reviewThreshold: 40,
  rejectThreshold: 100,
  weights: {
    [SignalCode.BLACKLISTED_CARD]: 100,
    [SignalCode.AMOUNT_OVER_THRESHOLD]: 50,
    [SignalCode.VELOCITY_LIMIT_EXCEEDED]: 60,
    [SignalCode.GEO_COUNTRY_NOT_ALLOWED]: 20,
    [SignalCode.GEO_IP_COUNTRY_MISMATCH]: 35,
    [SignalCode.GEO_IP_UNRESOLVED]: 10,
  } satisfies Record<SignalCode, number>,
} as const;

/** Collects every problem so one startup failure reports all of them. */
class Problems {
  private readonly items: string[] = [];

  add(message: string): void {
    this.items.push(message);
  }

  throwIfAny(): void {
    if (this.items.length > 0) {
      throw new ConfigurationError(this.items);
    }
  }
}

function parseInteger(
  env: RawEnv,
  key: string,
  fallback: number,
  bounds: { min: number; max?: number },
  problems: Problems,
): number {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') {
    return fallback;
  }

  if (!/^-?\d+$/.test(raw)) {
    problems.add(`${key} must be an integer (received "${raw}")`);
    return fallback;
  }

  const value = Number(raw);
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER;
  if (value < bounds.min || value > max) {
    problems.add(`${key} must be between ${bounds.min} and ${max} (received ${value})`);
    return fallback;
  }
  return value;
}

function parseCountryList(
  env: RawEnv,
  key: string,
  fallback: string,
  problems: Problems,
): string[] {
  const raw = (env[key] ?? fallback).trim();
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);

  for (const entry of entries) {
    if (!/^[A-Z]{2}$/.test(entry)) {
      problems.add(`${key} entry "${entry}" is not an ISO 3166-1 alpha-2 country code`);
    }
  }
  if (entries.length === 0) {
    problems.add(`${key} must list at least one country code`);
  }
  return [...new Set(entries)];
}

function parseCardList(env: RawEnv, key: string, fallback: string, problems: Problems): string[] {
  const raw = (env[key] ?? fallback).trim();
  const entries = raw
    .split(',')
    .map((entry) => entry.replace(/[\s-]/g, ''))
    .filter((entry) => entry.length > 0);

  for (const entry of entries) {
    if (!/^\d{12,19}$/.test(entry)) {
      // The value itself is never echoed: a blacklist is sensitive data.
      problems.add(`${key} contains an entry that is not 12-19 digits`);
    }
  }
  return [...new Set(entries)];
}

function parseGeoIpRanges(env: RawEnv, key: string, problems: Problems): GeoIpRangeConfig[] {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') {
    return [...DEFAULT_GEO_IP_RANGES];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    problems.add(`${key} must be a valid JSON array of { "cidr", "country" } objects`);
    return [...DEFAULT_GEO_IP_RANGES];
  }

  if (!Array.isArray(parsed)) {
    problems.add(`${key} must be a JSON array`);
    return [...DEFAULT_GEO_IP_RANGES];
  }

  const ranges: GeoIpRangeConfig[] = [];
  parsed.forEach((entry, index) => {
    const candidate = entry as Partial<GeoIpRangeConfig> | null;
    const cidr = typeof candidate?.cidr === 'string' ? candidate.cidr.trim() : '';
    const country =
      typeof candidate?.country === 'string' ? candidate.country.trim().toUpperCase() : '';

    if (parseCidr(cidr) === null) {
      problems.add(`${key}[${index}].cidr "${cidr}" is not a valid IPv4 CIDR block`);
      return;
    }
    if (!/^[A-Z]{2}$/.test(country)) {
      problems.add(`${key}[${index}].country "${country}" is not an ISO 3166-1 alpha-2 code`);
      return;
    }
    ranges.push({ cidr, country });
  });

  return ranges;
}

function parseWeights(env: RawEnv, problems: Problems): Record<SignalCode, number> {
  const weights = {} as Record<SignalCode, number>;
  for (const code of SIGNAL_CODES) {
    weights[code] = parseInteger(
      env,
      `FRAUD_WEIGHT_${code}`,
      DEFAULTS.weights[code],
      { min: 0, max: 10_000 },
      problems,
    );
  }
  return weights;
}

/**
 * Builds the rule set from raw environment variables.
 *
 * Fails fast and loudly: a bad value aborts startup with every problem listed,
 * rather than surfacing later as a null dereference inside a handler.
 */
export function buildFraudConfig(env: RawEnv = process.env): FraudConfig {
  const problems = new Problems();

  const amountThreshold = parseInteger(
    env,
    'FRAUD_AMOUNT_THRESHOLD',
    DEFAULTS.amountThreshold,
    { min: 1 },
    problems,
  );
  const geoAllowed = parseCountryList(env, 'FRAUD_GEO_ALLOWED', DEFAULTS.geoAllowed, problems);
  const blacklistCards = parseCardList(
    env,
    'FRAUD_BLACKLIST_CARDS',
    DEFAULTS.blacklistCards,
    problems,
  );

  const velocity = {
    windowSeconds: parseInteger(
      env,
      'FRAUD_VELOCITY_WINDOW_SECONDS',
      DEFAULTS.velocityWindowSeconds,
      { min: 1, max: 86_400 },
      problems,
    ),
    maxAttempts: parseInteger(
      env,
      'FRAUD_VELOCITY_MAX_ATTEMPTS',
      DEFAULTS.velocityMaxAttempts,
      { min: 1, max: 10_000 },
      problems,
    ),
    maxTrackedKeys: parseInteger(
      env,
      'FRAUD_VELOCITY_MAX_TRACKED_KEYS',
      DEFAULTS.velocityMaxTrackedKeys,
      { min: 1, max: 5_000_000 },
      problems,
    ),
  };

  const reviewThreshold = parseInteger(
    env,
    'FRAUD_SCORE_REVIEW_THRESHOLD',
    DEFAULTS.reviewThreshold,
    { min: 1 },
    problems,
  );
  const rejectThreshold = parseInteger(
    env,
    'FRAUD_SCORE_REJECT_THRESHOLD',
    DEFAULTS.rejectThreshold,
    { min: 1 },
    problems,
  );
  if (reviewThreshold >= rejectThreshold) {
    problems.add(
      `FRAUD_SCORE_REVIEW_THRESHOLD (${reviewThreshold}) must be lower than ` +
        `FRAUD_SCORE_REJECT_THRESHOLD (${rejectThreshold})`,
    );
  }

  const weights = parseWeights(env, problems);
  const geoIpRanges = parseGeoIpRanges(env, 'FRAUD_GEO_IP_RANGES', problems);

  problems.throwIfAny();

  return Object.freeze({
    amountThreshold,
    geoAllowed: Object.freeze(geoAllowed),
    blacklistCards: Object.freeze(blacklistCards),
    velocity: Object.freeze(velocity),
    scoring: Object.freeze({
      reviewThreshold,
      rejectThreshold,
      weights: Object.freeze(weights),
    }),
    geoIpRanges: Object.freeze(geoIpRanges),
  });
}

/** Registered with ConfigModule so the rule set lives under the 'fraud' namespace. */
export const fraudConfiguration = registerAs(FRAUD_CONFIG_NAMESPACE, () =>
  buildFraudConfig(process.env),
);
