import { FakeClock } from '../../../test/support/fake-clock';
import { testConfig } from '../../../test/support/test-config';
import { VelocityStore } from './velocity.store';

describe('VelocityStore', () => {
  let clock: FakeClock;
  let store: VelocityStore;

  beforeEach(() => {
    clock = new FakeClock();
    // Window 60s, limit 3 attempts.
    store = new VelocityStore(testConfig(), clock);
  });

  afterEach(() => {
    store.onModuleDestroy();
  });

  it('counts attempts inside the window', () => {
    expect(store.record('user:a')).toMatchObject({ attempts: 1, exceeded: false });
    expect(store.record('user:a')).toMatchObject({ attempts: 2, exceeded: false });
    expect(store.record('user:a')).toMatchObject({ attempts: 3, exceeded: false });
    expect(store.record('user:a')).toMatchObject({ attempts: 4, exceeded: true });
  });

  it('counts each key independently', () => {
    store.record('user:a');
    store.record('user:a');
    expect(store.record('user:b')).toMatchObject({ attempts: 1 });
  });

  it('forgets attempts once they fall out of the window', () => {
    store.record('user:a');
    store.record('user:a');
    clock.advanceSeconds(61);
    expect(store.record('user:a')).toMatchObject({ attempts: 1, exceeded: false });
  });

  it('slides rather than resets: only the stale half expires', () => {
    store.record('user:a');
    store.record('user:a');
    clock.advanceSeconds(40);
    store.record('user:a');
    clock.advanceSeconds(25); // the first two are now older than 60s
    expect(store.record('user:a')).toMatchObject({ attempts: 2, exceeded: false });
  });

  it('peeks without recording', () => {
    store.record('user:a');
    expect(store.peek('user:a')).toBe(1);
    expect(store.peek('user:a')).toBe(1);
    expect(store.peek('user:unseen')).toBe(0);
  });

  it('evicts the least-recently-seen key once the cap is reached', () => {
    const capped = new VelocityStore(testConfig({ FRAUD_VELOCITY_MAX_TRACKED_KEYS: '2' }), clock);
    jest.spyOn(capped['logger'], 'warn').mockImplementation(() => undefined);

    capped.record('user:a');
    capped.record('user:b');
    capped.record('user:a'); // refreshes a, so b is now the oldest
    capped.record('user:c');

    expect(capped.trackedKeys).toBe(2);
    expect(capped.peek('user:b')).toBe(0);
    expect(capped.peek('user:a')).toBe(2);
    capped.onModuleDestroy();
  });

  it('drops idle keys on the background sweep', () => {
    jest.useFakeTimers();
    const swept = new VelocityStore(testConfig(), clock);
    swept.record('user:a');
    expect(swept.trackedKeys).toBe(1);

    clock.advanceSeconds(120);
    jest.advanceTimersByTime(60_000);

    expect(swept.trackedKeys).toBe(0);
    swept.onModuleDestroy();
    jest.useRealTimers();
  });

  it('releases its timer on shutdown', () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const closing = new VelocityStore(testConfig(), clock);
    closing.onModuleDestroy();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    jest.useRealTimers();
  });
});
