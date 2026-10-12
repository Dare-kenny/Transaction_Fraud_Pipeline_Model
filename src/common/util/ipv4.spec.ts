import { cidrContains, looksLikeIpv6, parseCidr, parseIpv4 } from './ipv4';

describe('parseIpv4', () => {
  it('parses a dotted quad into an unsigned 32-bit integer', () => {
    expect(parseIpv4('0.0.0.0')).toBe(0);
    expect(parseIpv4('1.2.3.4')).toBe(0x01020304);
    expect(parseIpv4('255.255.255.255')).toBe(0xffffffff);
  });

  it('keeps high addresses unsigned rather than negative', () => {
    expect(parseIpv4('192.168.1.1')).toBeGreaterThan(0);
  });

  it('rejects malformed input', () => {
    for (const value of ['', '1.2.3', '1.2.3.4.5', '1.2.3.256', 'a.b.c.d', '1.2.3.-4']) {
      expect(parseIpv4(value)).toBeNull();
    }
  });

  it('rejects zero-padded octets, which are ambiguously octal', () => {
    expect(parseIpv4('010.1.1.1')).toBeNull();
  });
});

describe('parseCidr', () => {
  it('masks host bits off the network address', () => {
    const cidr = parseCidr('102.89.1.55/16');
    expect(cidr).not.toBeNull();
    expect(cidr?.network).toBe(parseIpv4('102.89.0.0'));
    expect(cidr?.prefix).toBe(16);
  });

  it('handles the /0 and /32 edges', () => {
    expect(parseCidr('0.0.0.0/0')?.mask).toBe(0);
    expect(parseCidr('1.2.3.4/32')?.mask).toBe(0xffffffff);
  });

  it('rejects a missing or out-of-range prefix', () => {
    for (const value of ['1.2.3.4', '1.2.3.4/', '1.2.3.4/33', '1.2.3.4/x']) {
      expect(parseCidr(value)).toBeNull();
    }
  });
});

describe('cidrContains', () => {
  const block = parseCidr('10.0.0.0/8');

  it('matches addresses inside the block', () => {
    expect(cidrContains(block!, parseIpv4('10.255.3.1')!)).toBe(true);
  });

  it('rejects addresses outside the block', () => {
    expect(cidrContains(block!, parseIpv4('11.0.0.1')!)).toBe(false);
  });

  it('matches everything under /0', () => {
    expect(cidrContains(parseCidr('0.0.0.0/0')!, parseIpv4('203.0.113.9')!)).toBe(true);
  });
});

describe('looksLikeIpv6', () => {
  it('spots colon-bearing addresses', () => {
    expect(looksLikeIpv6('2001:db8::1')).toBe(true);
    expect(looksLikeIpv6('::1')).toBe(true);
    expect(looksLikeIpv6('192.168.0.1')).toBe(false);
  });
});
