import type { INestApplication } from '@nestjs/common';
import { ConfigModule, registerAs } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { CLOCK } from '../src/common/clock';
import { Status } from '../src/common/enums/status.enum';
import { createValidationPipe } from '../src/common/validation';
import { FRAUD_CONFIG_NAMESPACE } from '../src/config/fraud-config';
import { FraudModule } from '../src/fraud/fraud.module';
import { HealthModule } from '../src/health/health.module';
import { FakeClock } from './support/fake-clock';
import { CLEAN_REQUEST, testConfig } from './support/test-config';

/**
 * End-to-end over real HTTP: the full app graph, the global validation pipe and
 * the config plumbing, with only the clock replaced. No database is involved,
 * which is why these tests need nothing running on the machine -- the gap the
 * Spring project left, where its single contextLoads test required a live MySQL.
 */
describe('POST /check (e2e)', () => {
  let app: INestApplication;
  let clock: FakeClock;

  const post = (body: object) =>
    request(app.getHttpServer() as App)
      .post('/check')
      .send(body);

  beforeEach(async () => {
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [registerAs(FRAUD_CONFIG_NAMESPACE, () => testConfig())],
        }),
        FraudModule,
        HealthModule,
      ],
    })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('decisions', () => {
    it('approves a clean transaction', async () => {
      const response = await post(CLEAN_REQUEST).expect(200);

      expect(response.body).toMatchObject({
        status: Status.APPROVED,
        score: 0,
        audits: [],
        signals: [],
        card: '550000******0004',
        thresholds: { review: 40, reject: 100 },
        evaluatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('rejects a blacklisted card and reports the skipped checks', async () => {
      const response = await post({
        ...CLEAN_REQUEST,
        cardNumber: '4111 1111 1111 1111',
      }).expect(200);

      expect(response.body.status).toBe(Status.REJECTED);
      expect(response.body.score).toBe(100);
      expect(response.body.checksSkipped).toEqual(['amountThreshold', 'velocity', 'geoIp']);
      expect(JSON.stringify(response.body)).not.toContain('4111111111111111');
    });

    it('reviews an amount over the threshold', async () => {
      const response = await post({ ...CLEAN_REQUEST, amount: 25_000 }).expect(200);

      expect(response.body.status).toBe(Status.REVIEWING);
      expect(response.body.signals).toEqual([
        {
          code: 'AMOUNT_OVER_THRESHOLD',
          message: 'Amount 25000 exceeds the threshold of 20000',
          weight: 50,
        },
      ]);
    });

    it('flags an IP that disagrees with the declared country', async () => {
      const response = await post({ ...CLEAN_REQUEST, country: 'GB' }).expect(200);

      expect(response.body.score).toBe(35);
      expect(response.body.signals[0].code).toBe('GEO_IP_COUNTRY_MISMATCH');
    });

    it('reviews a user once the velocity window is exceeded', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await post({ ...CLEAN_REQUEST, userId: 'rapid' }).expect(200);
      }

      const response = await post({ ...CLEAN_REQUEST, userId: 'rapid' }).expect(200);
      expect(response.body.status).toBe(Status.REVIEWING);
      expect(response.body.signals[0].code).toBe('VELOCITY_LIMIT_EXCEEDED');
    });

    it('forgives the same user after the window slides past', async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await post({ ...CLEAN_REQUEST, userId: 'rapid' });
      }
      clock.advanceSeconds(61);

      const response = await post({ ...CLEAN_REQUEST, userId: 'rapid' }).expect(200);
      expect(response.body.status).toBe(Status.APPROVED);
    });

    it('accepts a lower-case country and a separated card number', async () => {
      const response = await post({
        ...CLEAN_REQUEST,
        country: 'ng',
        cardNumber: '5500-0000-0000-0004',
      }).expect(200);

      expect(response.body.status).toBe(Status.APPROVED);
    });
  });

  describe('validation', () => {
    it('rejects a missing field', async () => {
      const { cardNumber: _omitted, ...incomplete } = CLEAN_REQUEST;
      const response = await post(incomplete).expect(400);
      expect(response.body.message.join(' ')).toContain('cardNumber');
    });

    it('rejects an unknown field instead of ignoring it', async () => {
      const response = await post({ ...CLEAN_REQUEST, score: 0 }).expect(400);
      expect(response.body.message.join(' ')).toContain('score');
    });

    it.each([
      ['a card that is too short', { cardNumber: '4111' }],
      ['a non-numeric card', { cardNumber: 'not-a-card-xx' }],
      ['a zero amount', { amount: 0 }],
      ['a negative amount', { amount: -5 }],
      ['a fractional amount', { amount: 10.5 }],
      ['a three-letter country', { country: 'NGA' }],
      ['a malformed IP', { ip: '999.1.1.1' }],
      ['an empty userId', { userId: '' }],
    ])('rejects %s', async (_label, override) => {
      await post({ ...CLEAN_REQUEST, ...override }).expect(400);
    });

    it('rejects an empty body', async () => {
      await post({}).expect(400);
    });
  });

  describe('GET /health', () => {
    it('reports the live rule set without leaking the blacklist', async () => {
      const response = await request(app.getHttpServer() as App).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        rules: {
          amountThreshold: 20_000,
          geoAllowed: ['NG', 'GB', 'CA'],
          blacklistedCardCount: 2,
          velocity: { windowSeconds: 60, maxAttempts: 3 },
          scoring: { reviewThreshold: 40, rejectThreshold: 100 },
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('4111111111111111');
    });
  });
});
