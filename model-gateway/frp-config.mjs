import { clientToml } from '../src/frp.mjs';

// STCP 不开放公网模型端口；两端均校验 TLS 证书并启用载荷加密。
export function modelFrpConfig({ visitor, secret, ...options }) {
  const common = clientToml(options).split('[[proxies]]')[0].replace('loginFailExit = true', 'loginFailExit = false');
  if (visitor) return common + `[[visitors]]
name = "velella-model-visitor"
type = "stcp"
serverName = "velella-model"
secretKey = ${JSON.stringify(secret)}
bindAddr = "127.0.0.1"
bindPort = 18796
transport.useEncryption = true
`;
  return common + `[[proxies]]
name = "velella-model"
type = "stcp"
secretKey = ${JSON.stringify(secret)}
localIP = "127.0.0.1"
localPort = 18796
transport.useEncryption = true
`;
}
