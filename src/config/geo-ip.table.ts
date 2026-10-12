import type { GeoIpRangeConfig } from './fraud-config';

/**
 * Bundled IPv4 -> country table.
 *
 * This is a deliberately small STUB, not a geolocation database. It exists so
 * the GeoIp rule can genuinely inspect the `ip` field offline, with no vendor
 * feed and no database. Override it in production with a real dataset via
 * FRAUD_GEO_IP_RANGES, or by swapping this module for a provider lookup.
 *
 * Overlapping ranges are fine: the resolver matches the longest prefix.
 */
export const DEFAULT_GEO_IP_RANGES: readonly GeoIpRangeConfig[] = [
  // --- allow-listed countries -------------------------------------------
  { cidr: '102.89.0.0/16', country: 'NG' },
  { cidr: '197.210.0.0/16', country: 'NG' },
  { cidr: '41.58.0.0/15', country: 'NG' },
  { cidr: '51.140.0.0/14', country: 'GB' },
  { cidr: '86.0.0.0/11', country: 'GB' },
  { cidr: '103.16.0.0/14', country: 'NZ' },
  { cidr: '94.208.0.0/12', country: 'NL' },
  { cidr: '145.100.0.0/14', country: 'NL' },
  { cidr: '1.128.0.0/11', country: 'AU' },
  { cidr: '90.0.0.0/10', country: 'FR' },
  { cidr: '46.80.0.0/12', country: 'DE' },
  { cidr: '91.0.0.0/10', country: 'DE' },
  { cidr: '24.48.0.0/13', country: 'CA' },
  { cidr: '99.224.0.0/11', country: 'CA' },

  // --- countries outside the default allow-list -------------------------
  { cidr: '3.0.0.0/8', country: 'US' },
  { cidr: '8.8.8.0/24', country: 'US' },
  { cidr: '23.192.0.0/11', country: 'US' },
  { cidr: '5.136.0.0/13', country: 'RU' },
  { cidr: '14.0.0.0/8', country: 'CN' },
  { cidr: '177.0.0.0/8', country: 'BR' },
  { cidr: '105.96.0.0/11', country: 'ZA' },
];
