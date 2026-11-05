import fs from 'node:fs/promises';

export const NATIVE_ENV_PATCH_ID = 'unbundle-machine-environment-v1';
export const NATIVE_ENV_PATCH_SHA256 = '789024e17d7b10262628ae7bd92824fcb32bb2478d0d6558af5b45f6de2665aa';
const sourceSha256 = 'fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824';

// 本地修改版只允许已验收的逐轮 Claude 实验；不能误用到原生续接或 GLM 适配器。
export async function validateNativeClientEnvironment({enabled = false, release, cliVersion, externalUpstream, clientEnvironment = false, sessionRelay = false, home} = {}) {
  if (!enabled) {
    if (release?.modified === true) throw new Error('本地修改版 CLI 必须显式启用原生环境实验');
    return;
  }
  if (externalUpstream || clientEnvironment || sessionRelay) throw new Error('原生环境实验仅支持逐轮 Claude，不能叠加 GLM 适配器或原生会话');
  if (cliVersion !== '2.1.316' || release?.modified !== true || release.patchId !== NATIVE_ENV_PATCH_ID || release.sha256 !== NATIVE_ENV_PATCH_SHA256 || release.sourceSha256 !== sourceSha256 || release.scope !== 'fresh-cli-full-environment-renderer') {
    throw new Error('原生环境实验的 CLI 或补丁收据未验收');
  }
  // 当前补丁不改环境增量；限制云端工作区为非 Git 目录，工具仍全部交给客户端。
  if (home) {
    try { await fs.lstat(`${home}/workspace/.git`); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    throw new Error('原生环境实验的云端工作区不能是 Git 仓库');
  }
}
