import { maskCard } from '../../common/util/mask-card';
import type { TransactionRequestDto } from '../dto/transaction-request.dto';

/**
 * A request after normalisation: digits-only card, upper-case country, and a
 * pre-computed mask so nothing downstream has to touch the raw card number.
 */
export interface NormalizedTransaction {
  readonly cardNumber: string;
  readonly maskedCard: string;
  readonly amount: number;
  readonly country: string;
  readonly ip: string;
  readonly userId: string;
}

export function normalizeTransaction(request: TransactionRequestDto): NormalizedTransaction {
  const cardNumber = request.cardNumber.replace(/[\s-]/g, '');
  return Object.freeze({
    cardNumber,
    maskedCard: maskCard(cardNumber),
    amount: request.amount,
    country: request.country.trim().toUpperCase(),
    ip: request.ip.trim(),
    userId: request.userId.trim(),
  });
}
