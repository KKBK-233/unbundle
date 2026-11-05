"""为固定 Linux CLI 生成独立环境修正版；不覆盖官方文件，不处理认证。"""
import argparse
import hashlib
import json
import pathlib
import struct
import time

VERSION = '2.1.316'
PATCH_ID = 'unbundle-machine-environment-v1'
SOURCE_SHA256 = 'fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824'
PATCHED_SHA256 = '789024e17d7b10262628ae7bd92824fcb32bb2478d0d6558af5b45f6de2665aa'
RENDERER_OFFSET = 283280276
RENDERER_SIZE = 676
MODULE_DESCRIPTOR = 328057329
SOURCE_HASH_OFFSET = 328181409
# 只改完整环境块的机器描述；保留 worktree 安全提醒、下载规则、代理和 gh 提示。
RENDERER = b'function Sio(e){let s=[...e.workingDirectory===void 0?[]:[e.isWorktree?skt:null,e.isWorktree?rkt:null],_io()?hio:null,Y1(e)?qde(e):cio(),e.githubCli!==void 0?YNe(e.githubCli)??null:null].filter(h=>h!==null);return jy(s).join(`\n`)}'


def build_patch(source):
    """只接受已经验收的原版字节；三个修改区间之外逐字节保持不变。"""
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise ValueError('原版 CLI 哈希不匹配；禁止猜测补丁位置')
    if len(source) != 328262000 or source[:4] != b'\x7fELF':
        raise ValueError('不是已验收的 Linux ELF')
    original = source[RENDERER_OFFSET:RENDERER_OFFSET + RENDERER_SIZE]
    if not original.startswith(b'function Sio(e){') or not original.endswith(b'join(`\n`)}'):
        raise ValueError('环境渲染函数不匹配')
    if struct.unpack_from('<II', source, MODULE_DESCRIPTOR + 24) != (25361892, 100439500):
        raise ValueError('模块字节码描述不匹配')
    if struct.unpack_from('<I', source, SOURCE_HASH_OFFSET)[0] != 7132042:
        raise ValueError('模块源码缓存标识不匹配')
    patched = bytearray(source)
    patched[RENDERER_OFFSET:RENDERER_OFFSET + RENDERER_SIZE] = RENDERER.ljust(RENDERER_SIZE, b' ')
    # Bun 会优先执行预编译字节码；只失效本模块的缓存，重新解析修改后的源码。
    # 此处是模块源码缓存标识，不是请求 cch 或客户端身份字段。
    struct.pack_into('<II', patched, MODULE_DESCRIPTOR + 24, 0, 0)
    struct.pack_into('<I', patched, SOURCE_HASH_OFFSET, 0)
    if hashlib.sha256(patched).hexdigest() != PATCHED_SHA256:
        raise ValueError('补丁结果与验收哈希不匹配')
    return patched


def create_candidate(source_path, output_dir):
    """创建独立副本和本地补丁收据；不会修改官方签名验收记录。"""
    source_path = pathlib.Path(source_path).resolve(strict=True)
    output_dir = pathlib.Path(output_dir)
    if output_dir.exists():
        raise FileExistsError('输出目录必须不存在，避免覆盖候选或已部署版本')
    patched = build_patch(source_path.read_bytes())
    output_dir.mkdir(mode=0o755)
    binary = output_dir / 'claude-client-env'
    with binary.open('xb') as stream:
        stream.write(patched)
    binary.chmod(0o755)
    record = {
        'version': VERSION, 'sha256': PATCHED_SHA256, 'protocol': 1,
        'modified': True, 'patchId': PATCH_ID, 'sourceSha256': SOURCE_SHA256,
        'officialSignatureAppliesTo': 'source-only', 'createdAt': int(time.time()),
        'scope': 'fresh-cli-full-environment-renderer',
        'changes': [
            {'offset': RENDERER_OFFSET, 'length': RENDERER_SIZE, 'purpose': '机器环境文本'},
            {'offset': MODULE_DESCRIPTOR + 24, 'length': 8, 'purpose': '本模块字节码缓存'},
            {'offset': SOURCE_HASH_OFFSET, 'length': 4, 'purpose': '本模块源码缓存'},
        ],
    }
    receipt = output_dir / 'cli-release.json'
    with receipt.open('x', encoding='utf8') as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    receipt.chmod(0o644)
    return {'binary': str(binary), 'receipt': str(receipt), **record}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    print(json.dumps(create_candidate(args.source, args.output_dir), ensure_ascii=True))


if __name__ == '__main__':
    main()
