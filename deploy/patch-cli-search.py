"""在固定环境补丁上增加服务端搜索请求入口，认证与响应处理继续由 CLI 管理。"""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import struct
import time

_spec = importlib.util.spec_from_file_location('environment_patch', pathlib.Path(__file__).with_name('patch-cli-environment.py'))
environment = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(environment)
PATCH_ID = 'unbundle-environment-search-v1'
MODULE_START = 283175860
MODULE_SIZE = 5074182
# 只覆盖搜索专用进程的消息和服务端工具；不接受外部认证、地址或请求头。
ANCHOR = b'};m$=EI!==void 0&&Qc.context_management===mP'
ENTRY = b'async function*e_n(e,n,r,s,h,{modelFacts:y,...S}){'
ENTRY_HOOK = ENTRY + b'let unbundleSearch=process.env.UNBUNDLE_SERVER_SEARCH?await Bun.file(process.env.UNBUNDLE_SERVER_SEARCH).json():null;'
HOOK = b'};if(unbundleSearch){Qc.messages=unbundleSearch.messages;Qc.tools=unbundleSearch.tools;Qc.tool_choice={type:"auto"};}m$=EI!==void 0&&Qc.context_management===mP'
PATCHED_SHA256 = '75bb13d97c1c4a0b618f42aa5dc19da22eddf76237769f1cc2d59696106336b9'


def build_patch(source):
    """固定版本模块内修改，利用环境函数缩短后的空间保持模块总长度不变。"""
    patched = environment.build_patch(source)
    module = source[MODULE_START:MODULE_START + MODULE_SIZE]
    renderer = source[environment.RENDERER_OFFSET:environment.RENDERER_OFFSET + environment.RENDERER_SIZE]
    if module.count(renderer) != 1 or module.count(ANCHOR) != 1 or module.count(ENTRY) != 1:
        raise ValueError('搜索请求入口不匹配')
    module = module.replace(renderer, environment.RENDERER).replace(ANCHOR, HOOK).replace(ENTRY, ENTRY_HOOK)
    if len(module) > MODULE_SIZE:
        raise ValueError('模块补丁超出原始空间')
    patched[MODULE_START:MODULE_START + MODULE_SIZE] = module.ljust(MODULE_SIZE, b' ')
    if PATCHED_SHA256 and hashlib.sha256(patched).hexdigest() != PATCHED_SHA256:
        raise ValueError('搜索补丁结果与验收哈希不匹配')
    return patched


def create_candidate(source_path, output_dir):
    """生成独立副本与能力收据，不覆盖已运行的 CLI。"""
    output_dir = pathlib.Path(output_dir)
    if output_dir.exists():
        raise FileExistsError('输出目录必须不存在')
    source = pathlib.Path(source_path).read_bytes()
    patched = build_patch(source)
    output_dir.mkdir(mode=0o755)
    binary = output_dir / 'claude-client-search'
    binary.write_bytes(patched)
    binary.chmod(0o755)
    record = {'version':environment.VERSION,'sha256':hashlib.sha256(patched).hexdigest(),'protocol':1,
              'modified':True,'patchId':PATCH_ID,'sourceSha256':environment.SOURCE_SHA256,
              'officialSignatureAppliesTo':'source-only','createdAt':int(time.time()),
              'scope':'fresh-cli-environment-server-search','capabilities':['server_search_v1'],
              'changes':[{'offset':MODULE_START,'length':MODULE_SIZE,'purpose':'环境渲染与显式服务端搜索请求入口'},
                         {'offset':environment.MODULE_DESCRIPTOR+24,'length':8,'purpose':'模块字节码缓存'},
                         {'offset':environment.SOURCE_HASH_OFFSET,'length':4,'purpose':'模块源码缓存'}]}
    receipt=output_dir/'cli-release.json'
    receipt.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    receipt.chmod(0o644)
    return record


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True)
    parser.add_argument('--output-dir',required=True)
    args=parser.parse_args()
    print(json.dumps(create_candidate(args.source,args.output_dir)))
