import { ValidationPipe } from '@nestjs/common';

/**
 * The single definition of request validation, shared by main.ts and the e2e
 * tests so they cannot drift apart.
 *
 * whitelist strips unknown properties, forbidNonWhitelisted turns them into a
 * 400 instead of silently dropping them, and transform runs the @Transform
 * normalisation declared on the DTO.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
}
