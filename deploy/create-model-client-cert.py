"""使用既有私有 CA 签发云端 frpc 证书，不导出 CA 私钥。"""
from pathlib import Path
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

root = Path(__file__).resolve().parents[1] / '.local'
dest = root / 'model-gateway'
dest.mkdir(parents=True, exist_ok=True)
if (dest / 'cloud.key').exists():
    raise SystemExit('已有云端客户端证书，不重复签发')
ca = x509.load_pem_x509_certificate((root / 'frp/pki/ca.crt').read_bytes())
ca_key = serialization.load_pem_private_key((root / 'frp/pki/ca.key').read_bytes(), password=None)
key = ec.generate_private_key(ec.SECP256R1())
now = datetime.now(timezone.utc)
cert = (x509.CertificateBuilder()
    .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'velella-cloud-frpc')]))
    .issuer_name(ca.subject).public_key(key.public_key()).serial_number(x509.random_serial_number())
    .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=365))
    .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
    .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH]), critical=True)
    .sign(ca_key, hashes.SHA256()))
(dest / 'cloud.key').write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
(dest / 'cloud.crt').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
print('已签发云端 frpc 独立客户端证书')
