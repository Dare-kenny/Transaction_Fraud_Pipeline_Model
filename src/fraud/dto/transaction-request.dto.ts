import { Transform } from 'class-transformer';
import { IsInt, IsIP, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * Inbound payload for POST /check.
 *
 * Validated by the global ValidationPipe with whitelist + forbidNonWhitelisted,
 * so unknown fields are rejected rather than silently ignored. Normalisation
 * (stripping card separators, upper-casing the country) happens here, before
 * any rule sees the value.
 */
export class TransactionRequestDto {
  /** 12-19 digits. Spaces and dashes are accepted and stripped. */
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @Matches(/^\d{12,19}$/, {
    message: 'cardNumber must be 12-19 digits (spaces and dashes are allowed)',
  })
  cardNumber!: string;

  /** Positive integer in minor currency units (kobo, cents). */
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;

  /** ISO 3166-1 alpha-2, case-insensitive on the wire. */
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code, e.g. NG' })
  country!: string;

  /** Source address of the request. IPv4 is geolocated; IPv6 raises an unresolved signal. */
  @IsIP()
  ip!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;
}
