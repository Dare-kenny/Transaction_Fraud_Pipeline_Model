/**
 * Masks a card number for logs and API responses: first 6 and last 4 digits
 * survive, everything between becomes '*'. Short values are fully masked.
 * The pipeline never echoes or logs a full card number.
 */
export function maskCard(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 11) {
    return '*'.repeat(digits.length);
  }
  return `${digits.slice(0, 6)}${'*'.repeat(digits.length - 10)}${digits.slice(-4)}`;
}
