import { Inject, Injectable } from '@nestjs/common';

import {
  cidrContains,
  looksLikeIpv6,
  parseCidr,
  parseIpv4,
  type Cidr,
} from '../../common/util/ipv4';
import { FRAUD_CONFIG, type FraudConfig } from '../../config/fraud-config';

export type GeoLookup =
  /** The IP mapped to a country in the table. */
  | { readonly outcome: 'resolved'; readonly country: string; readonly matchedCidr: string }
  /** Private, loopback or otherwise non-routable: cannot carry a location. */
  | { readonly outcome: 'reserved'; readonly label: string }
  /** Routable, but absent from the table (or not IPv4). */
  | { readonly outcome: 'unknown'; readonly reason: string };

interface LabelledRange {
  readonly cidr: Cidr;
  readonly label: string;
}

/** Non-routable IPv4 space: an address here says nothing about location. */
const RESERVED_RANGES: readonly { cidr: string; label: string }[] = [
  { cidr: '0.0.0.0/8', label: 'this-network' },
  { cidr: '10.0.0.0/8', label: 'private' },
  { cidr: '100.64.0.0/10', label: 'carrier-grade NAT' },
  { cidr: '127.0.0.0/8', label: 'loopback' },
  { cidr: '169.254.0.0/16', label: 'link-local' },
  { cidr: '172.16.0.0/12', label: 'private' },
  { cidr: '192.0.2.0/24', label: 'documentation' },
  { cidr: '192.168.0.0/16', label: 'private' },
  { cidr: '198.18.0.0/15', label: 'benchmarking' },
  { cidr: '198.51.100.0/24', label: 'documentation' },
  { cidr: '203.0.113.0/24', label: 'documentation' },
  { cidr: '224.0.0.0/4', label: 'multicast' },
  { cidr: '240.0.0.0/4', label: 'reserved' },
];

function compile(ranges: readonly { cidr: string; label: string }[]): LabelledRange[] {
  return ranges.flatMap(({ cidr, label }) => {
    const parsed = parseCidr(cidr);
    return parsed ? [{ cidr: parsed, label }] : [];
  });
}

/**
 * Offline IPv4-to-country lookup over the configured table, longest prefix wins.
 *
 * This is what lets GeoIpHandler actually use the ip field instead of trusting
 * the client-declared country. The bundled table is a stub, not a geo feed:
 * override it with FRAUD_GEO_IP_RANGES, or replace this class with a provider
 * call. Either way the handler above it does not change.
 */
@Injectable()
export class GeoIpResolver {
  private readonly reserved: readonly LabelledRange[] = compile(RESERVED_RANGES);
  private readonly entries: readonly { cidr: Cidr; country: string }[];

  constructor(@Inject(FRAUD_CONFIG) config: FraudConfig) {
    this.entries = config.geoIpRanges
      .flatMap(({ cidr, country }) => {
        const parsed = parseCidr(cidr);
        // Unparsable blocks cannot reach here: config validation rejects them.
        return parsed ? [{ cidr: parsed, country }] : [];
      })
      .sort((a, b) => b.cidr.prefix - a.cidr.prefix);
  }

  get rangeCount(): number {
    return this.entries.length;
  }

  resolve(ip: string): GeoLookup {
    if (looksLikeIpv6(ip)) {
      return { outcome: 'unknown', reason: 'IPv6 is not covered by the IP-to-country table' };
    }

    const address = parseIpv4(ip);
    if (address === null) {
      return { outcome: 'unknown', reason: 'not a valid IPv4 address' };
    }

    for (const range of this.reserved) {
      if (cidrContains(range.cidr, address)) {
        return { outcome: 'reserved', label: range.label };
      }
    }

    for (const entry of this.entries) {
      if (cidrContains(entry.cidr, address)) {
        return { outcome: 'resolved', country: entry.country, matchedCidr: entry.cidr.text };
      }
    }

    return { outcome: 'unknown', reason: 'no matching range in the IP-to-country table' };
  }
}
