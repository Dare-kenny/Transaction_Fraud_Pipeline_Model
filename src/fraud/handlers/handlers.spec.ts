import { SignalCode } from '../../common/enums/signal-code.enum';
import { Status } from '../../common/enums/status.enum';
import { FakeClock } from '../../../test/support/fake-clock';
import { testConfig, transaction } from '../../../test/support/test-config';
import { FraudContext } from '../model/fraud-context';
import { GeoIpResolver } from '../services/geo-ip.resolver';
import { VelocityStore } from '../services/velocity.store';
import { AmountThresholdHandler } from './amount-threshold.handler';
import { CardBlacklistHandler } from './card-blacklist.handler';
import { FinalDecisionHandler } from './final-decision.handler';
import { FraudHandler } from './fraud-handler';
import { GeoIpHandler } from './geo-ip.handler';
import { VelocityHandler } from './velocity.handler';

const config = testConfig();

/** Runs one handler in isolation, without the rest of the chain. */
async function evaluate(
  handler: FraudHandler,
  overrides: Parameters<typeof transaction>[0] = {},
): Promise<FraudContext> {
  const context = new FraudContext();
  await handler.handle(transaction(overrides), context);
  return context;
}

function codes(context: FraudContext): SignalCode[] {
  return context.signals.map((signal) => signal.code);
}

describe('CardBlacklistHandler', () => {
  const handler = new CardBlacklistHandler(config);

  it('passes a card that is not listed', async () => {
    const context = await evaluate(handler);
    expect(context.signals).toEqual([]);
    expect(context.isStopped).toBe(false);
  });

  it('flags a listed card and stops further detection', async () => {
    const context = await evaluate(handler, { cardNumber: '4111111111111111' });

    expect(codes(context)).toEqual([SignalCode.BLACKLISTED_CARD]);
    expect(context.score).toBe(100);
    expect(context.isStopped).toBe(true);
  });

  it('matches a listed card written with separators, and masks it in the reason', async () => {
    const context = await evaluate(handler, { cardNumber: '4000-0000-0000-0002' });

    expect(context.score).toBe(100);
    expect(context.audits[0]).toBe('Card 400000******0002 is blacklisted');
    expect(context.audits[0]).not.toContain('4000000000000002');
  });

  it('is inert when no blacklist is configured', async () => {
    const empty = new CardBlacklistHandler(testConfig({ FRAUD_BLACKLIST_CARDS: '' }));
    const context = await evaluate(empty, { cardNumber: '4111111111111111' });
    expect(context.signals).toEqual([]);
  });
});

describe('AmountThresholdHandler', () => {
  const handler = new AmountThresholdHandler(config);

  it('passes an amount at the threshold (the bound is exclusive)', async () => {
    const context = await evaluate(handler, { amount: 20_000 });
    expect(context.signals).toEqual([]);
  });

  it('flags an amount above the threshold without stopping the chain', async () => {
    const context = await evaluate(handler, { amount: 20_001 });

    expect(codes(context)).toEqual([SignalCode.AMOUNT_OVER_THRESHOLD]);
    expect(context.score).toBe(50);
    expect(context.isStopped).toBe(false);
    expect(context.audits[0]).toContain('exceeds the threshold of 20000');
  });
});

describe('VelocityHandler', () => {
  let clock: FakeClock;
  let store: VelocityStore;
  let handler: VelocityHandler;

  beforeEach(() => {
    clock = new FakeClock();
    store = new VelocityStore(config, clock);
    handler = new VelocityHandler(config, store);
  });

  afterEach(() => store.onModuleDestroy());

  it('stays quiet inside the limit', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const context = await evaluate(handler);
      expect(context.signals).toEqual([]);
    }
  });

  it('flags the attempt that breaks the limit', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await evaluate(handler);
    }
    const context = await evaluate(handler);

    expect(codes(context)).toEqual([SignalCode.VELOCITY_LIMIT_EXCEEDED]);
    expect(context.score).toBe(60);
    expect(context.audits[0]).toContain('4 attempts in 60s (limit 3)');
  });

  it('tracks each user separately', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await evaluate(handler, { userId: 'noisy' });
    }
    const context = await evaluate(handler, { userId: 'quiet' });
    expect(context.signals).toEqual([]);
  });

  it('forgives a user once the window passes', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await evaluate(handler);
    }
    clock.advanceSeconds(61);
    const context = await evaluate(handler);
    expect(context.signals).toEqual([]);
  });
});

describe('GeoIpHandler', () => {
  const handler = new GeoIpHandler(config, new GeoIpResolver(config));

  it('passes an allowed country whose IP agrees', async () => {
    const context = await evaluate(handler, { country: 'NG', ip: '102.89.1.1' });
    expect(context.signals).toEqual([]);
  });

  it('flags a country outside the allow-list', async () => {
    // 8.8.8.8 resolves to US, so the declaration and the IP agree.
    const context = await evaluate(handler, { country: 'US', ip: '8.8.8.8' });

    expect(codes(context)).toEqual([SignalCode.GEO_COUNTRY_NOT_ALLOWED]);
    expect(context.score).toBe(20);
  });

  it('flags an IP that disagrees with the declared country', async () => {
    // The gap in the Spring version: an allowed country is claimed, but the
    // request is coming from somewhere else entirely.
    const context = await evaluate(handler, { country: 'GB', ip: '102.89.1.1' });

    expect(codes(context)).toEqual([SignalCode.GEO_IP_COUNTRY_MISMATCH]);
    expect(context.score).toBe(35);
    expect(context.audits[0]).toBe(
      'IP 102.89.1.1 resolves to NG but the transaction declares GB',
    );
  });

  it('raises both signals when the country is unlisted and the IP disagrees', async () => {
    const context = await evaluate(handler, { country: 'US', ip: '102.89.1.1' });

    expect(codes(context)).toEqual([
      SignalCode.GEO_COUNTRY_NOT_ALLOWED,
      SignalCode.GEO_IP_COUNTRY_MISMATCH,
    ]);
    expect(context.score).toBe(55);
  });

  it('flags a non-routable IP as ungeolocatable', async () => {
    const context = await evaluate(handler, { country: 'NG', ip: '192.168.1.10' });

    expect(codes(context)).toEqual([SignalCode.GEO_IP_UNRESOLVED]);
    expect(context.score).toBe(10);
    expect(context.audits[0]).toContain('private address');
  });

  it('flags an IP absent from the table', async () => {
    const context = await evaluate(handler, { country: 'NG', ip: '200.1.2.3' });
    expect(codes(context)).toEqual([SignalCode.GEO_IP_UNRESOLVED]);
  });

  it('flags IPv6 as unresolved instead of silently trusting the country', async () => {
    const context = await evaluate(handler, { country: 'NG', ip: '2001:db8::1' });
    expect(codes(context)).toEqual([SignalCode.GEO_IP_UNRESOLVED]);
  });
});

describe('FinalDecisionHandler', () => {
  const handler = new FinalDecisionHandler(config);

  async function decideWithScore(points: number): Promise<Status> {
    const context = new FraudContext();
    if (points > 0) {
      context.addSignal(SignalCode.AMOUNT_OVER_THRESHOLD, 'synthetic', points);
    }
    await handler.handle(transaction(), context);
    return context.status;
  }

  it('approves a clean transaction', async () => {
    await expect(decideWithScore(0)).resolves.toBe(Status.APPROVED);
  });

  it('approves just below the review band', async () => {
    await expect(decideWithScore(39)).resolves.toBe(Status.APPROVED);
  });

  it('reviews from the review threshold up', async () => {
    await expect(decideWithScore(40)).resolves.toBe(Status.REVIEWING);
    await expect(decideWithScore(99)).resolves.toBe(Status.REVIEWING);
  });

  it('rejects from the reject threshold up', async () => {
    await expect(decideWithScore(100)).resolves.toBe(Status.REJECTED);
    await expect(decideWithScore(500)).resolves.toBe(Status.REJECTED);
  });

  it('runs even after the chain was stopped', async () => {
    const context = new FraudContext();
    context.addSignal(SignalCode.BLACKLISTED_CARD, 'synthetic', 100).stopChain();
    await handler.handle(transaction(), context);

    expect(context.status).toBe(Status.REJECTED);
    expect(context.checksApplied).toContain('finalDecision');
  });

  it('honours reconfigured bands without a code change', async () => {
    const strict = new FinalDecisionHandler(
      testConfig({ FRAUD_SCORE_REVIEW_THRESHOLD: '10', FRAUD_SCORE_REJECT_THRESHOLD: '30' }),
    );
    const context = new FraudContext();
    context.addSignal(SignalCode.GEO_IP_COUNTRY_MISMATCH, 'synthetic', 35);
    await strict.handle(transaction(), context);

    expect(context.status).toBe(Status.REJECTED);
  });
});
