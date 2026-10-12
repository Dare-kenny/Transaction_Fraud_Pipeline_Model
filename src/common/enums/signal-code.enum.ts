/**
 * Every risk signal a handler can raise. Each code owns a configurable weight
 * (see FraudConfig.scoring.weights), so adding a rule means adding a code here
 * plus its weight -- never editing the decision logic.
 */
export enum SignalCode {
  BLACKLISTED_CARD = 'BLACKLISTED_CARD',
  AMOUNT_OVER_THRESHOLD = 'AMOUNT_OVER_THRESHOLD',
  VELOCITY_LIMIT_EXCEEDED = 'VELOCITY_LIMIT_EXCEEDED',
  GEO_COUNTRY_NOT_ALLOWED = 'GEO_COUNTRY_NOT_ALLOWED',
  GEO_IP_COUNTRY_MISMATCH = 'GEO_IP_COUNTRY_MISMATCH',
  GEO_IP_UNRESOLVED = 'GEO_IP_UNRESOLVED',
}

export const SIGNAL_CODES: readonly SignalCode[] = Object.values(SignalCode);
