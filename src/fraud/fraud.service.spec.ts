import { Test, type TestingModule } from '@nestjs/testing';

import { CLOCK } from '../common/clock';
import { SignalCode } from '../common/enums/signal-code.enum';
import { Status } from '../common/enums/status.enum';
import { FRAUD_CONFIG } from '../config/fraud-config';
import { FakeClock } from '../../test/support/fake-clock';
import { request, testConfig } from '../../test/support/test-config';
import { fraudChainProvider } from './chain/fraud-chain.provider';
import { FraudService } from './fraud.service';
import { AmountThresholdHandler } from './handlers/amount-threshold.handler';
import { CardBlacklistHandler } from './handlers/card-blacklist.handler';
import { FinalDecisionHandler } from './handlers/final-decision.handler';
import { GeoIpHandler } from './handlers/geo-ip.handler';
import { VelocityHandler } from './handlers/velocity.handler';
import { GeoIpResolver } from './services/geo-ip.resolver';
import { VelocityStore } from './services/velocity.store';

/**
 * Chain integration: real DI, real wiring order, only time is faked.
 */
describe('FraudService (whole chain)', () => {
  let moduleRef: TestingModule;
  let service: FraudService;
  let clock: FakeClock;

  beforeEach(async () => {
    clock = new FakeClock();
    moduleRef = await Test.createTestingModule({
      providers: [
        { provide: FRAUD_CONFIG, useValue: testConfig() },
        { provide: CLOCK, useValue: clock },
        GeoIpResolver,
        VelocityStore,
        CardBlacklistHandler,
        AmountThresholdHandler,
        VelocityHandler,
        GeoIpHandler,
        FinalDecisionHandler,
        fraudChainProvider,
        FraudService,
      ],
    }).compile();

    service = moduleRef.get(FraudService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('approves a clean transaction and runs every link in order', async () => {
    const result = await service.check(request());

    expect(result.status).toBe(Status.APPROVED);
    expect(result.score).toBe(0);
    expect(result.audits).toEqual([]);
    expect(result.checksApplied).toEqual([
      'cardBlacklist',
      'amountThreshold',
      'velocity',
      'geoIp',
      'finalDecision',
    ]);
    expect(result.checksSkipped).toEqual([]);
  });

  it('reviews a single soft signal that clears the review band', async () => {
    const result = await service.check(request({ amount: 999_999 }));

    expect(result.status).toBe(Status.REVIEWING);
    expect(result.score).toBe(50);
    expect(result.signals.map((s) => s.code)).toEqual([SignalCode.AMOUNT_OVER_THRESHOLD]);
  });

  it('approves a lone low-weight signal that does not reach the band', async () => {
    // Unlisted country only: 20 points, under the review threshold of 40. The
    // Spring version flagged this for review purely because a reason existed.
    const result = await service.check(request({ country: 'US', ip: '8.8.8.8' }));

    expect(result.score).toBe(20);
    expect(result.status).toBe(Status.APPROVED);
    expect(result.audits).toHaveLength(1);
  });

  it('accumulates independent soft signals past the reject band', async () => {
    // Over-threshold amount (50) + unlisted country (20) + IP mismatch (35) = 105.
    const result = await service.check(
      request({ amount: 999_999, country: 'US', ip: '102.89.1.1' }),
    );

    expect(result.score).toBe(105);
    expect(result.status).toBe(Status.REJECTED);
    expect(result.signals).toHaveLength(3);
  });

  it('rejects a blacklisted card and skips the remaining detectors', async () => {
    const result = await service.check(request({ cardNumber: '4111111111111111' }));

    expect(result.status).toBe(Status.REJECTED);
    expect(result.score).toBe(100);
    expect(result.checksApplied).toEqual(['cardBlacklist', 'finalDecision']);
    expect(result.checksSkipped).toEqual(['amountThreshold', 'velocity', 'geoIp']);
  });

  it('does not count a short-circuited request against the user velocity window', async () => {
    const store = moduleRef.get(VelocityStore);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.check(request({ cardNumber: '4111111111111111' }));
    }
    expect(store.peek('user:user-1')).toBe(0);
  });

  it('reviews a user who exceeds the velocity window', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const quiet = await service.check(request());
      expect(quiet.status).toBe(Status.APPROVED);
    }

    const result = await service.check(request());
    expect(result.status).toBe(Status.REVIEWING);
    expect(result.score).toBe(60);
    expect(result.signals.map((s) => s.code)).toEqual([SignalCode.VELOCITY_LIMIT_EXCEEDED]);
  });

  it('rejects when velocity and amount signals combine', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await service.check(request());
    }
    const result = await service.check(request({ amount: 999_999 }));

    expect(result.score).toBe(110);
    expect(result.status).toBe(Status.REJECTED);
  });

  it('returns the thresholds, a masked card and a timestamp from the injected clock', async () => {
    const result = await service.check(request({ cardNumber: '5500 0000 0000 0004' }));

    expect(result.thresholds).toEqual({ review: 40, reject: 100 });
    expect(result.card).toBe('550000******0004');
    expect(result.evaluatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('never echoes a full card number anywhere in the response', async () => {
    const result = await service.check(request({ cardNumber: '4111111111111111' }));
    expect(JSON.stringify(result)).not.toContain('4111111111111111');
  });

  it('keeps each evaluation independent of the last', async () => {
    await service.check(request({ amount: 999_999, country: 'US', ip: '102.89.1.1' }));
    const second = await service.check(request({ userId: 'someone-else' }));

    expect(second.score).toBe(0);
    expect(second.status).toBe(Status.APPROVED);
  });
});
