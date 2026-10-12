import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { validateCliVersion, readCliRelease } from './cli-compat.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';

// 自动更新的版本凭据不能退化成接受任意未来版本。
test('CLI 只接受验收版本，缺失或可写验收记录不能放宽版本限制', async () => {
  assert.equal(validateCliVersion('2.1.289 (Claude Code)', ['2.1.289']), '2.1.289');
  assert.throws(() => validateCliVersion('2.1.290 (Claude Code)', ['2.1.289']));
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-receipt-'));
  try {
    assert.equal(await readCliRelease(path.join(folder, 'missing.json')), null);
    assert.throws(() => validateCliVersion('2.1.289 (Claude Code)'));
    const file = path.join(folder, 'record.json');
    await fs.writeFile(file, JSON.stringify({ version: '../bin', sha256: 'x', protocol: 1 }), { mode: 0o666 });
    await assert.rejects(readCliRelease(file));
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test('自动更新忙碌检查、版本校验和 Linux 切换回滚', () => {
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'unittest', 'test_update_cli.py'],
    { cwd: path.resolve(import.meta.dirname, '../deploy'), timeout: 15000 });
});
