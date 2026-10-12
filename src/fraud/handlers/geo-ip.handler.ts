import { Inject, Injectable } from '@nestjs/common';

import { SignalCode } from '../../common/enums/signal-code.enum';
import { FRAUD_CONFIG, type FraudConfig } from '../../config/fraud-config';
import type { FraudContext } from '../model/fraud-context';
import type { NormalizedTransaction } from '../model/transaction';
import { GeoIpResolver } from '../services/geo-ip.resolver';
import { FraudHandler } from './fraud-handler';

/**
 * Link 4: geography.
 *
 * Two independent questions, which the Spring version collapsed into one:
 *
 *   1. Is the country the client declared on the allow-list?
 *   2. Does the IP agree with that declaration?
 *
 * (2) is the point of the rule. The declared country is client-controlled and
 * trivially spoofed; the source IP is not. A mismatch outweighs a merely
 * unlisted country, which is why it carries a heavier weight.
 */
@Injectable()
export class GeoIpHandler extends FraudHandler {
  readonly name = 'geoIp';

  private readonly allowed: ReadonlySet<string>;

  constructor(
    @Inject(FRAUD_CONFIG) private readonly config: FraudConfig,
    private readonly resolver: GeoIpResolver,
  ) {
    super();
    this.allowed = new Set(config.geoAllowed);
  }

  protected evaluate(transaction: NormalizedTransaction, context: FraudContext): void {
    const weights = this.config.scoring.weights;

    if (!this.allowed.has(transaction.country)) {
      context.addSignal(
        SignalCode.GEO_COUNTRY_NOT_ALLOWED,
        `Declared country ${transaction.country} is not in the allowed set ` +
          `[${this.config.geoAllowed.join(', ')}]`,
        weights[SignalCode.GEO_COUNTRY_NOT_ALLOWED],
      );
    }

    const lookup = this.resolver.resolve(transaction.ip);

    switch (lookup.outcome) {
      case 'resolved':
        if (lookup.country !== transaction.country) {
          context.addSignal(
            SignalCode.GEO_IP_COUNTRY_MISMATCH,
            `IP ${transaction.ip} resolves to ${lookup.country} but the transaction declares ` +
              `${transaction.country}`,
            weights[SignalCode.GEO_IP_COUNTRY_MISMATCH],
          );
        }
        return;

      case 'reserved':
        context.addSignal(
          SignalCode.GEO_IP_UNRESOLVED,
          `IP ${transaction.ip} is a ${lookup.label} address and cannot be geolocated`,
          weights[SignalCode.GEO_IP_UNRESOLVED],
        );
        return;

      case 'unknown':
        context.addSignal(
          SignalCode.GEO_IP_UNRESOLVED,
          `IP ${transaction.ip} could not be geolocated: ${lookup.reason}`,
          weights[SignalCode.GEO_IP_UNRESOLVED],
        );
        return;
    }
  }
}
