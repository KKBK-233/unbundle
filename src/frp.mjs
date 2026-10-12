import path from 'node:path';

const quote = value => JSON.stringify(value.replaceAll('\\', '/'));

// 传输层强制双向 TLS，指定私有 CA 和服务器名称；令牌从文件读取。
export function clientToml({ host, serverPort, remotePort, localPort, certDir, tokenFile,
  serverName = 'harness-frps', certName = 'client', trustedCaFile = path.join(certDir, 'ca.crt'), proxyURL }) {
  // 可经本地 SOCKS 进入 VLESS；frp 自身的证书验证与载荷加密仍然保留。
  if (proxyURL && !['http:', 'socks5:'].includes(new URL(proxyURL).protocol)) throw new Error('frp 代理仅支持 HTTP 或 SOCKS5');
  return `serverAddr = ${quote(host)}
serverPort = ${serverPort}
loginFailExit = true
auth.method = "token"
auth.additionalScopes = ["HeartBeats", "NewWorkConns"]
auth.tokenSource.type = "file"
auth.tokenSource.file.path = ${quote(tokenFile)}
transport.tls.enable = true
transport.tls.disableCustomTLSFirstByte = true
transport.tls.serverName = ${quote(serverName)}
transport.tls.trustedCaFile = ${quote(trustedCaFile)}
transport.tls.certFile = ${quote(path.join(certDir, `${certName}.crt`))}
transport.tls.keyFile = ${quote(path.join(certDir, `${certName}.key`))}
transport.heartbeatInterval = 10
transport.heartbeatTimeout = ${proxyURL ? 90 : 30}
${proxyURL ? 'transport.tcpMux = false\n' : ''}${proxyURL ? `transport.proxyURL = ${quote(proxyURL)}\n` : ''}log.to = "console"
log.level = "info"
log.disablePrintColor = true
[[proxies]]
name = "harness-tools"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${localPort}
remotePort = ${remotePort}
`;
}

export function serverToml({ bindAddr, serverPort, remotePort, certDir, tokenFile, proxyBindAddr = '127.0.0.1', tcpMux }) {
  const allowedPorts = remotePort ? `allowPorts = [{ single = ${remotePort} }]\n` : '';
  return `bindAddr = ${quote(bindAddr)}
bindPort = ${serverPort}
proxyBindAddr = ${quote(proxyBindAddr)}
${allowedPorts}maxPortsPerClient = 1
auth.method = "token"
auth.additionalScopes = ["HeartBeats", "NewWorkConns"]
auth.tokenSource.type = "file"
auth.tokenSource.file.path = ${quote(tokenFile)}
transport.tls.force = true
${tcpMux === false ? 'transport.tcpMux = false\n' : ''}transport.tls.certFile = ${quote(path.join(certDir, 'server.crt'))}
transport.tls.keyFile = ${quote(path.join(certDir, 'server.key'))}
transport.tls.trustedCaFile = ${quote(path.join(certDir, 'ca.crt'))}
log.to = "console"
log.level = "info"
log.disablePrintColor = true
`;
}
