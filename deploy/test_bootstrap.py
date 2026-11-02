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

    def test_copy_program_without_legacy_src(self):
        source = self.folder / 'source'
        source.mkdir()
        for name in ['model-gateway', 'deploy']:
            (source / name).mkdir()
            (source / name / 'synthetic.txt').write_text('current')
        for name in ['package.json', 'package-lock.json']:
            (source / name).write_text('{}')
        bootstrap.copy_program(source, bootstrap.APP)
        self.assertEqual((bootstrap.APP / 'model-gateway/synthetic.txt').read_text(), 'current')
        self.assertTrue((bootstrap.APP / 'package-lock.json').exists())
        self.assertFalse((bootstrap.APP / 'src').exists())

    def program_source(self):
        source = self.folder / 'source'
        source.mkdir()
        for name in ['model-gateway', 'deploy']:
            (source / name).mkdir()
            (source / name / 'current.txt').write_text('CURRENT')
        for name in ['package.json', 'package-lock.json']:
            (source / name).write_text('{}')
        return source

    def test_upgrade_removes_retired_programs_and_preserves_private_state(self):
        source = self.program_source()
        for name in ['model-gateway/import-omp.mjs', 'deploy/install-frp.sh', 'src/frp.mjs',
                     'node/bin/node', '.local/profile.json', '.claude/settings.json', 'custom.txt']:
            file = bootstrap.APP / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('PREVIOUS')
        state = bootstrap.STATE / 'synthetic-state'
        state.write_text('STATE')
        # 连续重跑也不重新混入旧入口，受管理目录之外保持逐字节不变。
        bootstrap.copy_program(source, bootstrap.APP)
        bootstrap.copy_program(source, bootstrap.APP)
        for name in ['model-gateway/import-omp.mjs', 'deploy/install-frp.sh', 'src']:
            self.assertFalse((bootstrap.APP / name).exists())
        for name in ['node/bin/node', '.local/profile.json', '.claude/settings.json', 'custom.txt']:
            self.assertEqual((bootstrap.APP / name).read_text(), 'PREVIOUS')
        self.assertEqual(state.read_text(), 'STATE')
        self.assertEqual((bootstrap.APP / 'model-gateway/current.txt').read_text(), 'CURRENT')

    def test_incomplete_source_preserves_previous_program(self):
        source = self.program_source()
        (source / 'package-lock.json').unlink()
        previous = bootstrap.APP / 'package.json'
        previous.write_text('PREVIOUS')
        with self.assertRaisesRegex(RuntimeError, '清单不完整'):
            bootstrap.copy_program(source, bootstrap.APP)
        self.assertEqual(previous.read_text(), 'PREVIOUS')

    def test_install_failure_rolls_back_changed_program_directories(self):
        source = self.program_source()
        for name in ['model-gateway', 'deploy', 'src']:
            (bootstrap.APP / name).mkdir()
            (bootstrap.APP / name / 'old.txt').write_text('PREVIOUS')
        rename = pathlib.Path.rename

        def fail_once(file, target):
            if file.parent.name == 'incoming' and file.name == 'deploy':
                raise OSError('SYNTHETIC_INSTALL_FAILURE')
            return rename(file, target)

        with patch.object(pathlib.Path, 'rename', fail_once):
            with self.assertRaisesRegex(OSError, 'SYNTHETIC_INSTALL_FAILURE'):
                bootstrap.copy_program(source, bootstrap.APP)
        for name in ['model-gateway', 'deploy', 'src']:
            self.assertEqual((bootstrap.APP / name / 'old.txt').read_text(), 'PREVIOUS')
        self.assertFalse((bootstrap.APP / 'model-gateway/current.txt').exists())

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
