import { describe, expect, it } from 'vitest';
import { isForbiddenAddress, parseIPv4, parseIPv6 } from './ip-ranges.js';

describe('parseIPv4 / parseIPv6', () => {
  it('lee IPv4 canónicas y rechaza lo demás', () => {
    expect(parseIPv4('1.2.3.4')).toEqual([1, 2, 3, 4]);
    for (const bad of ['1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.04x', '01.2.3.4a', 'a.b.c.d', '', '1.2.3.-4']) expect(parseIPv4(bad), bad).toBeNull();
  });

  it('lee IPv6 con :: en cualquier parte y con IPv4 incrustado', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('2001:db8::')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('2001:db8::1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('[2001:4860:4860::8888]')).toEqual([0x2001, 0x4860, 0x4860, 0, 0, 0, 0, 0x8888]);
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(parseIPv6('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('rechaza lo que no es IPv6 o lleva zona', () => {
    for (const bad of ['', 'localhost', '1.2.3.4', '::g', '1:2:3:4:5:6:7:8:9', ':::', 'fe80::1%eth0', '12345::1']) expect(parseIPv6(bad), bad).toBeNull();
  });
});

describe('isForbiddenAddress', () => {
  const FORBIDDEN = [
    // IPv4: cada bloque, en su primer y su último valor
    '0.0.0.0', '0.255.255.255', '10.0.0.0', '10.255.255.255', '100.64.0.0', '100.127.255.255', '127.0.0.1', '127.255.255.254',
    '169.254.0.0', '169.254.169.254', '169.254.255.255', '172.16.0.0', '172.31.255.255', '192.0.0.0', '192.0.0.255', '192.0.2.0',
    '192.88.99.1', '192.168.0.0', '192.168.255.255', '198.18.0.0', '198.19.255.255', '198.51.100.7', '203.0.113.9',
    '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.254', '255.255.255.255',
    // IPv6
    '::', '::1', '::2', '::127.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.1.2.3', '::ffff:a00:1', '::ffff:169.254.169.254', '::ffff:c0a8:1',
    '::ffff:0.0.0.0', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b::a00:1', '64:ff9b:1::1', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1',
    'fec0::1', 'ff02::1', 'ff00::', '2001::1', '2001:0:4136:e378::1', '2001:1::1', '2001:db8::1', '2001:db8:ffff::', '2002:7f00:1::', '2002::', '3fff::1',
    '100::1', '8000::1', 'e000::1', '1::1', '0:0:0:0:0:0:0:1',
    // lo que no es una IP
    'localhost', 'example.com', '', '1.2.3', 'fe80::1%eth0',
  ];
  const ALLOWED = [
    '1.1.1.1', '8.8.8.8', '9.255.255.255', '11.0.0.1', '100.63.255.255', '100.128.0.1', '126.255.255.255', '128.0.0.1', '169.253.255.255', '169.255.0.0',
    '172.15.255.255', '172.32.0.1', '192.0.1.1', '192.0.3.1', '192.169.0.1', '198.17.255.255', '198.20.0.1', '198.51.99.1', '198.51.101.1', '203.0.112.1', '203.0.114.1', '223.255.255.255',
    '2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001::', '2620:fe::fe', '2001:200::1', '3000::1', '3ffe::1', '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::808:808',
  ];

  it.each(FORBIDDEN)('%s está prohibida', (address) => {
    expect(isForbiddenAddress(address)).toBe(true);
  });

  it.each(ALLOWED)('%s es pública y se permite', (address) => {
    expect(isForbiddenAddress(address)).toBe(false);
  });

  it('una IPv4 mapeada o NAT64 vale lo que valga la IPv4 de adentro', () => {
    expect(isForbiddenAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isForbiddenAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isForbiddenAddress('64:ff9b::808:808')).toBe(false);
    expect(isForbiddenAddress('64:ff9b::a00:1')).toBe(true);
  });
});
