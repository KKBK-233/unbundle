"""使用临时目录与模拟状态检查安装器，避免覆盖已有程序、令牌和请求。"""
import importlib.util
import pathlib
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bootstrap', pathlib.Path(__file__).with_name('bootstrap.py'))
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.folder = pathlib.Path(self.temporary.name)
        for name in ['APP', 'STATE']:
            self.folder.joinpath(name).mkdir()
        self.paths = patch.multiple(bootstrap, APP=self.folder / 'APP', STATE=self.folder / 'STATE', UNIT=self.folder / 'unit')
        self.paths.start()
        self.addCleanup(self.paths.stop)
        self.addCleanup(self.temporary.cleanup)

    def test_foreign_unit_is_preserved(self):
        bootstrap.UNIT.write_text('OTHER SERVICE')
        with self.assertRaisesRegex(RuntimeError, '非安装器'):
            bootstrap.inspect_existing('SYNTHETIC')
        self.assertEqual(bootstrap.UNIT.read_text(), 'OTHER SERVICE')

    def test_foreign_application_is_preserved(self):
        (bootstrap.APP / 'private.txt').write_text('OTHER APP')
        with self.assertRaisesRegex(RuntimeError, '其他内容'):
            bootstrap.inspect_existing('SYNTHETIC')
        self.assertEqual((bootstrap.APP / 'private.txt').read_text(), 'OTHER APP')

    def test_different_token_is_preserved_without_disclosing_value(self):
        token = bootstrap.STATE / 'token'
        token.write_text('SYNTHETIC_OLD_TOKEN')
        with self.assertRaisesRegex(RuntimeError, '令牌') as error:
            bootstrap.inspect_existing('SYNTHETIC_NEW_TOKEN')
        self.assertNotIn('SYNTHETIC_', str(error.exception))
        self.assertEqual(token.read_text(), 'SYNTHETIC_OLD_TOKEN')

    def test_busy_gateway_refuses_upgrade(self):
        with patch.object(bootstrap.subprocess, 'run', return_value=SimpleNamespace(returncode=0)):
            for field in ['activeRequests', 'queuedRequests', 'receivingRequests']:
                with self.subTest(field=field), patch.object(bootstrap, 'read_status', return_value={field: 1}):
                    with self.assertRaisesRegex(RuntimeError, '正在进行'):
                        bootstrap.inspect_existing('SYNTHETIC')

    def test_generated_service_uses_unprivileged_account_and_operator_overrides(self):
        text = bootstrap.service_text(628, 1)
        self.assertIn('User=harness\n', text)
        self.assertIn('MemoryMax=628M\n', text)
        self.assertIn('GATEWAY_MAX_CONCURRENT=1\n', text)
        self.assertGreater(text.index('EnvironmentFile='), text.index('GATEWAY_MAX_CONCURRENT='))
        self.assertNotIn('SYNTHETIC', text)


if __name__ == '__main__':
    unittest.main()
