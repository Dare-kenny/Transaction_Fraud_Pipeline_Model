import { buildFraudConfig } from '../../src/config/configuration';
import type { FraudConfig } from '../../src/config/fraud-config';
import type { TransactionRequestDto } from '../../src/fraud/dto/transaction-request.dto';
import { normalizeTransaction, type NormalizedTransaction } from '../../src/fraud/model/transaction';

/**
 * Smaller, faster numbers than production, built through the real parser so the
 * tests exercise the same validation path the app boots with.
 */
export const TEST_ENV: Record<string, string> = {
  FRAUD_AMOUNT_THRESHOLD: '20000',
  FRAUD_GEO_ALLOWED: 'NG,GB,CA',
  FRAUD_BLACKLIST_CARDS: '4111111111111111,4000 0000 0000 0002',
  FRAUD_VELOCITY_WINDOW_SECONDS: '60',
  FRAUD_VELOCITY_MAX_ATTEMPTS: '3',
  FRAUD_SCORE_REVIEW_THRESHOLD: '40',
  FRAUD_SCORE_REJECT_THRESHOLD: '100',
};

export function testConfig(overrides: Record<string, string> = {}): FraudConfig {
  return buildFraudConfig({ ...TEST_ENV, ...overrides });
}

/** A clean transaction: allowed country, matching Nigerian IP, modest amount. */
export const CLEAN_REQUEST: TransactionRequestDto = {
  cardNumber: '5500000000000004',
  amount: 5_000,
  country: 'NG',
  ip: '102.89.1.1',
  userId: 'user-1',
};

export function request(overrides: Partial<TransactionRequestDto> = {}): TransactionRequestDto {
  return { ...CLEAN_REQUEST, ...overrides };
}

export function transaction(
  overrides: Partial<TransactionRequestDto> = {},
): NormalizedTransaction {
  return normalizeTransaction(request(overrides));
}
