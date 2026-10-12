import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// 接入现有 Node 测试入口：额度解析独立运行，不连接服务器或读取凭据。
test('额度查询在增量刷新后仍保持各窗口读数一致', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', path.resolve(import.meta.dirname, '../deploy'), '-p', 'test_*.py'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
});
