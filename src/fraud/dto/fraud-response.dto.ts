import type { SignalCode } from '../../common/enums/signal-code.enum';
import type { Status } from '../../common/enums/status.enum';

export interface FraudSignalDto {
  readonly code: SignalCode;
  readonly message: string;
  readonly weight: number;
}

/**
 * Response for POST /check.
 *
 * Deliberately explainable: a reviewer can see the decision, the score that
 * produced it, the band it fell into, every signal with its contribution, and
 * which checks ran or were skipped.
 */
export interface FraudResponseDto {
  readonly status: Status;
  readonly score: number;
  readonly thresholds: {
    readonly review: number;
    readonly reject: number;
  };
  /** Human-readable reasons, same shape the Spring version returned. */
  readonly audits: readonly string[];
  /** The same reasons, machine-readable and weighted. */
  readonly signals: readonly FraudSignalDto[];
  readonly checksApplied: readonly string[];
  readonly checksSkipped: readonly string[];
  /** Masked card, so the response is safe to log or forward. */
  readonly card: string;
  readonly evaluatedAt: string;
}
