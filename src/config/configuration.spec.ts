import { buildFraudConfig, ConfigurationError } from './configuration';
import { SignalCode } from '../common/enums/signal-code.enum';
import { DEFAULT_GEO_IP_RANGES } from './geo-ip.table';

describe('buildFraudConfig', () => {
  it('falls back to safe defaults for an empty environment', () => {
    const config = buildFraudConfig({});

    expect(config.amountThreshold).toBe(20_000_000);
    expect(config.geoAllowed).toEqual(['NG', 'GB', 'NZ', 'NL', 'AU', 'FR', 'DE', 'CA']);
    expect(config.blacklistCards).toEqual([]);
    expect(config.velocity).toEqual({
      windowSeconds: 60,
      maxAttempts: 5,
      maxTrackedKeys: 10_000,
    });
    expect(config.scoring.reviewThreshold).toBe(40);
    expect(config.scoring.rejectThreshold).toBe(100);
    expect(config.geoIpRanges).toHaveLength(DEFAULT_GEO_IP_RANGES.length);
  });

  it('normalises country codes and card separators, and de-duplicates', () => {
    const config = buildFraudConfig({
      FRAUD_GEO_ALLOWED: ' ng , gb ,NG, ',
      FRAUD_BLACKLIST_CARDS: '4111-1111 1111-1111, 4111111111111111 ,',
    });

    expect(config.geoAllowed).toEqual(['NG', 'GB']);
    expect(config.blacklistCards).toEqual(['4111111111111111']);
  });

  it('freezes the result so no handler can mutate shared rules', () => {
    const config = buildFraudConfig({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.scoring.weights)).toBe(true);
  });

  it('reads per-signal weight overrides', () => {
    const config = buildFraudConfig({ FRAUD_WEIGHT_GEO_IP_COUNTRY_MISMATCH: '75' });
    expect(config.scoring.weights[SignalCode.GEO_IP_COUNTRY_MISMATCH]).toBe(75);
  });

  it('accepts a custom IP-to-country table', () => {
    const config = buildFraudConfig({
      FRAUD_GEO_IP_RANGES: '[{"cidr":"198.19.0.0/16","country":"ke"}]',
    });
    expect(config.geoIpRanges).toEqual([{ cidr: '198.19.0.0/16', country: 'KE' }]);
  });

  // These are the failures the Spring version deferred to runtime as an NPE or
  // a silently wrong rule. Here they stop the process at boot.
  it('rejects a non-numeric threshold', () => {
    expect(() => buildFraudConfig({ FRAUD_AMOUNT_THRESHOLD: 'lots' })).toThrow(ConfigurationError);
  });

  it('rejects a zero or negative threshold', () => {
    expect(() => buildFraudConfig({ FRAUD_AMOUNT_THRESHOLD: '0' })).toThrow(ConfigurationError);
  });

  it('rejects an empty country allow-list', () => {
    expect(() => buildFraudConfig({ FRAUD_GEO_ALLOWED: ' , ' })).toThrow(
      /must list at least one country/,
    );
  });

  it('rejects a country code that is not alpha-2', () => {
    expect(() => buildFraudConfig({ FRAUD_GEO_ALLOWED: 'NGA' })).toThrow(/alpha-2/);
  });

  it('rejects a malformed card in the blacklist without echoing it', () => {
    try {
      buildFraudConfig({ FRAUD_BLACKLIST_CARDS: '41111' });
      fail('expected a ConfigurationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).toContain('12-19 digits');
      expect((error as Error).message).not.toContain('41111');
    }
  });

  it('rejects review and reject thresholds that are the wrong way round', () => {
    expect(() =>
      buildFraudConfig({
        FRAUD_SCORE_REVIEW_THRESHOLD: '100',
        FRAUD_SCORE_REJECT_THRESHOLD: '40',
      }),
    ).toThrow(/must be lower than/);
  });

  it('rejects a malformed IP-to-country table', () => {
    expect(() => buildFraudConfig({ FRAUD_GEO_IP_RANGES: 'not json' })).toThrow(/valid JSON/);
    expect(() =>
      buildFraudConfig({ FRAUD_GEO_IP_RANGES: '[{"cidr":"10.0.0.0/99","country":"US"}]' }),
    ).toThrow(/valid IPv4 CIDR/);
  });

  it('reports every problem at once instead of only the first', () => {
    try {
      buildFraudConfig({ FRAUD_AMOUNT_THRESHOLD: 'nope', FRAUD_GEO_ALLOWED: 'NGA' });
      fail('expected a ConfigurationError');
    } catch (error) {
      expect((error as ConfigurationError).problems).toHaveLength(2);
    }
  });
});
