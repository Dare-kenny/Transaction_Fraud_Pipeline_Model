import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { CLOCK, type Clock } from '../../common/clock';
import { FRAUD_CONFIG, type FraudConfig } from '../../config/fraud-config';

export interface VelocityReading {
  /** Attempts inside the window, including the one just recorded. */
  readonly attempts: number;
  readonly windowSeconds: number;
  readonly maxAttempts: number;
  readonly exceeded: boolean;
}

/**
 * In-memory sliding-window counter: the state the Spring version configured but
 * never implemented. No database and no cache server, just a Map of timestamps
 * per key, pruned on access.
 *
 * Bounded on purpose. Entries older than the window are dropped on access, a
 * background sweep clears idle keys, and a hard key cap evicts the
 * least-recently-seen key so a flood of unique ids cannot exhaust the heap.
 *
 * Single-process by design. Behind more than one replica each instance counts
 * only its own traffic; that is the trade for carrying no datastore, and this
 * class is the seam where a shared store would plug in.
 */
@Injectable()
export class VelocityStore implements OnModuleDestroy {
  private readonly logger = new Logger(VelocityStore.name);
  private readonly hits = new Map<string, number[]>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    @Inject(FRAUD_CONFIG) private readonly config: FraudConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    const sweepIntervalMs = Math.max(1_000, this.config.velocity.windowSeconds * 1_000);
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    // Never hold the event loop open: the process (and Jest) can exit freely.
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
    this.hits.clear();
  }

  /** Records an attempt for the key and reports the state of its window. */
  record(key: string): VelocityReading {
    const { windowSeconds, maxAttempts } = this.config.velocity;
    const now = this.clock.now();
    const cutoff = now - windowSeconds * 1_000;

    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    recent.push(now);

    // Re-insert last so Map iteration order doubles as a recency list.
    this.hits.delete(key);
    this.hits.set(key, recent);
    this.enforceKeyCap();

    return {
      attempts: recent.length,
      windowSeconds,
      maxAttempts,
      exceeded: recent.length > maxAttempts,
    };
  }

  /** Attempts currently inside the window, without recording a new one. */
  peek(key: string): number {
    const cutoff = this.clock.now() - this.config.velocity.windowSeconds * 1_000;
    return (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff).length;
  }

  /** Number of tracked keys. Exposed for the health endpoint and for tests. */
  get trackedKeys(): number {
    return this.hits.size;
  }

  private enforceKeyCap(): void {
    const { maxTrackedKeys } = this.config.velocity;
    if (this.hits.size <= maxTrackedKeys) {
      return;
    }

    let evicted = 0;
    for (const key of this.hits.keys()) {
      if (this.hits.size <= maxTrackedKeys) {
        break;
      }
      this.hits.delete(key);
      evicted += 1;
    }
    this.logger.warn(
      `Velocity store hit its ${maxTrackedKeys}-key cap; evicted ${evicted} least-recent key(s)`,
    );
  }

  private sweep(): void {
    const cutoff = this.clock.now() - this.config.velocity.windowSeconds * 1_000;
    for (const [key, timestamps] of this.hits) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length === 0) {
        this.hits.delete(key);
      } else if (recent.length !== timestamps.length) {
        this.hits.set(key, recent);
      }
    }
  }
}
