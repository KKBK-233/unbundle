import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFrpConfig } from './frp-config.mjs';
import { serverToml } from '../src/frp.mjs';

// VLESS 外层通过 SOCKS 接入，不允许它覆盖已有双向 TLS 或 STCP 加密。
test('SOCKS 中继保留双向 TLS、STCP 和回环端口', () => {
  for (const visitor of [false, true]) {
    const config = modelFrpConfig({ visitor, secret: 'synthetic-secret', host: '127.0.0.1',
      serverPort: 18469, certDir: '/private/pki', tokenFile: '/private/token', proxyURL: 'socks5://127.0.0.1:18470' });
    for (const line of ['transport.proxyURL = "socks5://127.0.0.1:18470"', 'transport.tls.enable = true',
      'transport.tls.trustedCaFile = "/private/pki/ca.crt"', 'transport.tls.certFile = "/private/pki/client.crt"',
      'transport.tls.keyFile = "/private/pki/client.key"', 'transport.useEncryption = true', 'transport.tcpMux = false']) assert(config.includes(line));
    assert(config.includes(visitor ? 'bindAddr = "127.0.0.1"' : 'localIP = "127.0.0.1"'));
    assert(!config.includes('remotePort'));
  }
  const server = serverToml({ bindAddr: '127.0.0.1', serverPort: 18469, certDir: '/private/pki', tokenFile: '/private/token', tcpMux: false });
  assert(server.includes('transport.tcpMux = false'));
  assert(server.includes('transport.tls.force = true'));
  assert.throws(() => modelFrpConfig({ visitor: true, secret: 'test', host: '127.0.0.1',
    serverPort: 18469, certDir: '/pki', tokenFile: '/token', proxyURL: 'https://proxy.invalid' }), /仅支持/);
});
