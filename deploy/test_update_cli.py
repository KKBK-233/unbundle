"""验收自动切换与失败恢复，使用合成文件，不访问网络或账号。"""
import json
import os
import pathlib
import tempfile
import subprocess
import unittest
import importlib.util

spec = importlib.util.spec_from_file_location('update_cli', pathlib.Path(__file__).with_name('update-cli.py'))
update_cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update_cli)


class UpdateTests(unittest.TestCase):
    def test_probe_models_accepts_actual_gateway_map_and_installer_aliases(self):
        # 直接读取网关导出的公开型号表，防止测试再次复制过时别名而漏掉协议差异。
        root = pathlib.Path(__file__).resolve().parent.parent
        script = "import {upstreamModels} from './model-gateway/cloud-models.mjs'; console.log(JSON.stringify(upstreamModels));"
        models = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=root, text=True))
        resolved = update_cli.probe_models(models)
        self.assertEqual(set(resolved), {'opus', 'sonnet', 'haiku'})
        self.assertEqual(set(resolved.values()), set(models.values()))
        aliases = {'claude-code-' + tier: value for tier, value in resolved.items()}
        self.assertEqual(update_cli.probe_models(aliases), resolved)
        self.assertEqual(update_cli.probe_models({**models, **aliases}), resolved)

    def test_probe_models_rejects_missing_invalid_or_ambiguous_tiers(self):
        models = {'claude-code-' + tier: 'claude-' + tier + '-5-5' for tier in ['opus', 'sonnet', 'haiku']}
        invalid = [None, {}, {**models, 'claude-code-opus': '../invalid'},
                   {**models, 'claude-code-haiku': 'claude-opus-5-5'},
                   {**models, 'claude-opus-5-5': 'claude-opus-other'}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                update_cli.probe_models(value)

    def test_authentication_regression_fails_health_check(self):
        before = {'checked': True, 'loggedIn': True}
        self.assertTrue(update_cli.health_matches(before, before, '2.1.289'))
        for change in [{'checked': False}, {'loggedIn': False}, {'cliVersion': '2.1.280'}]:
            self.assertFalse(update_cli.health_matches(before, {**before, **change}, '2.1.289'))

    def test_busy_gateway_defers(self):
        self.assertTrue(update_cli.idle({}))
        for field in ['activeRequests', 'queuedRequests', 'nativeSessions', 'nativeFrozenSessions', 'busy']:
            self.assertFalse(update_cli.idle({field: 1}))
        self.assertTrue(update_cli.idle({'inflightBytes': 1024}))

    def test_version_validation(self):
        self.assertGreater(update_cli.version_tuple('2.1.289'), update_cli.version_tuple('2.1.280'))
        for value in ['latest', '../bin/claude', '2.1.280;echo', '2.1']:
            with self.assertRaises(ValueError):
                update_cli.version_tuple(value)

    @unittest.skipUnless(os.name == 'posix', '服务端为 Linux，链接事务只在 POSIX 验收')
    def test_health_failure_restores_binary_and_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            previous, candidate, live, receipt = [root / name for name in ['old', 'new', 'claude', 'receipt.json']]
            previous.write_text('PREVIOUS')
            candidate.write_text('CANDIDATE')
            live.symlink_to(previous)
            receipt.write_text('{"version":"old"}')
            with self.assertRaises(RuntimeError):
                update_cli.switch(candidate, live, receipt, {'version': 'new'}, lambda: False)
            self.assertEqual(live.read_text(), 'PREVIOUS')
            self.assertEqual(receipt.read_text(), '{"version":"old"}')
            self.assertFalse(live.with_name('claude.next').exists())

    @unittest.skipUnless(os.name == 'posix', '服务端为 Linux，链接事务只在 POSIX 验收')
    def test_success_preserves_old_binary(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            previous, candidate, live, receipt = [root / name for name in ['old', 'new', 'claude', 'receipt.json']]
            previous.write_text('PREVIOUS')
            candidate.write_text('CANDIDATE')
            live.symlink_to(previous)
            update_cli.switch(candidate, live, receipt, {'version': 'new'}, lambda: True)
            self.assertEqual(live.read_text(), 'CANDIDATE')
            self.assertEqual(previous.read_text(), 'PREVIOUS')
            self.assertEqual(json.loads(receipt.read_text())['version'], 'new')


if __name__ == '__main__':
    unittest.main()
