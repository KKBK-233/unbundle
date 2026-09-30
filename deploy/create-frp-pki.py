"""生成本项目独立 CA 和双向 TLS 证书；私钥只写入被 Git 忽略的目录。"""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import secrets
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

root = Path(__file__).resolve().parents[1] / '.local' / 'frp' / 'pki'
root.mkdir(parents=True, exist_ok=True)
if (root / 'ca.key').exists():
    raise SystemExit('已有证书，停止以避免意外轮换。')
now = datetime.now(timezone.utc)
ca_key = ec.generate_private_key(ec.SECP256R1())
ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'harness-private-ca')])
ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
      .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
      .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=730))
      .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
      .add_extension(x509.KeyUsage(True, False, False, False, False, True, True, False, False), critical=True)
      .sign(ca_key, hashes.SHA256()))

def save(name, key, cert):
    (root / f'{name}.key').write_bytes(key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    (root / f'{name}.crt').write_bytes(cert.public_bytes(serialization.Encoding.PEM))

save('ca', ca_key, ca)
for name, identity, usage in [('server', 'harness-frps', ExtendedKeyUsageOID.SERVER_AUTH),
                              ('client', 'harness-windows', ExtendedKeyUsageOID.CLIENT_AUTH)]:
    key = ec.generate_private_key(ec.SECP256R1())
    cert = (x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, identity)]))
            .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName(identity)]), critical=False)
            .add_extension(x509.ExtendedKeyUsage([usage]), critical=True)
            .sign(ca_key, hashes.SHA256()))
    save(name, key, cert)
(root.parent / 'token').write_text(secrets.token_hex(32), encoding='utf-8')
print('已生成独立 CA、服务端证书、客户端证书和认证令牌；有效期 365 天。')
