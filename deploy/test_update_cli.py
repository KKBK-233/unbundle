"""验收自动切换与失败恢复，使用合成文件，不访问网络或账号。"""
import json
import os
import pathlib
import tempfile
import unittest
import importlib.util

spec = importlib.util.spec_from_file_location('update_cli', pathlib.Path(__file__).with_name('update-cli.py'))
update_cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update_cli)


class UpdateTests(unittest.TestCase):
    def test_busy_gateway_defers(self):
        self.assertTrue(update_cli.idle({}))
        for field in ['activeRequests', 'queuedRequests']:
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
