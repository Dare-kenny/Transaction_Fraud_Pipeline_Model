/**
 * Minimal IPv4 / CIDR helpers. Hand-rolled on purpose: the pipeline carries no
 * runtime dependency beyond Nest itself, and the surface needed here is tiny.
 */

export interface Cidr {
  /** Network address as an unsigned 32-bit integer. */
  readonly network: number;
  /** Prefix length, 0-32. */
  readonly prefix: number;
  /** Netmask as an unsigned 32-bit integer. */
  readonly mask: number;
  /** Original textual form, kept for audit messages. */
  readonly text: string;
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Returns the address as an unsigned 32-bit integer, or null if not valid IPv4. */
export function parseIpv4(value: string): number | null {
  const match = IPV4_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  let address = 0;
  for (let i = 1; i <= 4; i += 1) {
    const octet = Number(match[i]);
    // Rejects 1.2.3.256 and zero-padded forms such as 010.1.1.1 (ambiguous octal).
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    if (match[i].length > 1 && match[i].startsWith('0')) {
      return null;
    }
    address = (address << 8) | octet;
  }
  return address >>> 0;
}

/** Parses "a.b.c.d/prefix". Returns null when malformed or when host bits are set. */
export function parseCidr(value: string): Cidr | null {
  const text = value.trim();
  const slash = text.indexOf('/');
  if (slash < 0) {
    return null;
  }

  const address = parseIpv4(text.slice(0, slash));
  const prefixText = text.slice(slash + 1);
  if (address === null || !/^\d{1,2}$/.test(prefixText)) {
    return null;
  }

  const prefix = Number(prefixText);
  if (prefix < 0 || prefix > 32) {
    return null;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (address & mask) >>> 0, prefix, mask, text };
}

export function cidrContains(cidr: Cidr, address: number): boolean {
  return ((address & cidr.mask) >>> 0) === cidr.network;
}

/** True when the value is syntactically an IPv6 address (we never geo-resolve these). */
export function looksLikeIpv6(value: string): boolean {
  return value.includes(':');
}
