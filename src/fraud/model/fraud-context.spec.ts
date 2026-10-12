import { SignalCode } from '../../common/enums/signal-code.enum';
import { Status } from '../../common/enums/status.enum';
import { FraudContext } from './fraud-context';

describe('FraudContext', () => {
  it('starts empty', () => {
    const context = new FraudContext();
    expect(context.score).toBe(0);
    expect(context.signals).toEqual([]);
    expect(context.isStopped).toBe(false);
  });

  it('accumulates weights into the score', () => {
    const context = new FraudContext();
    context.addSignal(SignalCode.GEO_COUNTRY_NOT_ALLOWED, 'a', 20);
    context.addSignal(SignalCode.GEO_IP_UNRESOLVED, 'b', 10);

    expect(context.score).toBe(30);
    expect(context.audits).toEqual(['a', 'b']);
  });

  it('clamps a negative or fractional weight so a rule cannot lower the score', () => {
    const context = new FraudContext();
    context.addSignal(SignalCode.GEO_IP_UNRESOLVED, 'negative', -50);
    context.addSignal(SignalCode.GEO_IP_UNRESOLVED, 'fractional', 10.9);

    expect(context.score).toBe(10);
  });

  it('freezes each signal once raised', () => {
    const context = new FraudContext();
    context.addSignal(SignalCode.BLACKLISTED_CARD, 'frozen', 100);
    expect(Object.isFrozen(context.signals[0])).toBe(true);
  });

  it('refuses to report a status before the decision handler has run', () => {
    expect(() => new FraudContext().status).toThrow(/before the decision handler ran/);
  });

  it('reports the status once decided', () => {
    const context = new FraudContext().decide(Status.REVIEWING);
    expect(context.status).toBe(Status.REVIEWING);
  });

  it('keeps an audit trail of which checks ran and which were skipped', () => {
    const context = new FraudContext();
    context.recordApplied('cardBlacklist').recordSkipped('velocity');

    expect(context.checksApplied).toEqual(['cardBlacklist']);
    expect(context.checksSkipped).toEqual(['velocity']);
  });
});
