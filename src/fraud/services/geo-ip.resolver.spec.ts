import { testConfig } from '../../../test/support/test-config';
import { GeoIpResolver } from './geo-ip.resolver';

describe('GeoIpResolver', () => {
  const resolver = new GeoIpResolver(testConfig());

  it('resolves an address in the bundled table', () => {
    expect(resolver.resolve('102.89.1.1')).toEqual({
      outcome: 'resolved',
      country: 'NG',
      matchedCidr: '102.89.0.0/16',
    });
  });

  it('prefers the longest matching prefix when ranges overlap', () => {
    const overlapping = new GeoIpResolver(
      testConfig({
        FRAUD_GEO_IP_RANGES: JSON.stringify([
          { cidr: '13.0.0.0/8', country: 'US' },
          { cidr: '13.64.0.0/11', country: 'GB' },
        ]),
      }),
    );

    expect(overlapping.resolve('13.70.0.1')).toMatchObject({ country: 'GB' });
    expect(overlapping.resolve('13.5.0.1')).toMatchObject({ country: 'US' });
  });

  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private'],
    ['192.168.0.5', 'private'],
    ['172.16.9.9', 'private'],
    ['169.254.1.1', 'link-local'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['203.0.113.7', 'documentation'],
    ['239.1.1.1', 'multicast'],
  ])('flags %s as non-routable (%s)', (ip, label) => {
    expect(resolver.resolve(ip)).toEqual({ outcome: 'reserved', label });
  });

  it('checks reserved space before the country table', () => {
    const shadowed = new GeoIpResolver(
      testConfig({
        FRAUD_GEO_IP_RANGES: JSON.stringify([{ cidr: '10.0.0.0/8', country: 'US' }]),
      }),
    );
    expect(shadowed.resolve('10.0.0.1').outcome).toBe('reserved');
  });

  it('reports a routable address that is absent from the table', () => {
    expect(resolver.resolve('200.1.2.3')).toEqual({
      outcome: 'unknown',
      reason: 'no matching range in the IP-to-country table',
    });
  });

  it('reports IPv6 as out of scope rather than guessing', () => {
    expect(resolver.resolve('2001:db8::1')).toEqual({
      outcome: 'unknown',
      reason: 'IPv6 is not covered by the IP-to-country table',
    });
  });

  it('reports a malformed address', () => {
    expect(resolver.resolve('999.1.1.1')).toEqual({
      outcome: 'unknown',
      reason: 'not a valid IPv4 address',
    });
  });
});
