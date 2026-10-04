"""仅加载额度文本解析函数，跨平台验证，不连接 SSH 或启动 Claude。"""
import ast
from contextlib import closing
import importlib.util
import pathlib
import re
import sqlite3
import tempfile
import time
import unittest


source = pathlib.Path(__file__).with_name('relay-status-remote.py').read_text(encoding='utf-8')
node = next(item for item in ast.parse(source).body if isinstance(item, ast.FunctionDef) and item.name == 'quota_lines')
namespace = {'re': re}
exec(compile(ast.Module(body=[node], type_ignores=[]), '<quota-parser>', 'exec'), namespace)
quota_lines = namespace['quota_lines']

spec = importlib.util.spec_from_file_location('relay_status', pathlib.Path(__file__).with_name('relay-status.py'))
relay_status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay_status)


class CacheReportTests(unittest.TestCase):
    def test_original_model_failures_are_included_without_other_providers(self):
        # 复现失败时模型名未映射的记录，并检查供应商、应用和时间边界。
        now = int(time.time())
        with tempfile.TemporaryDirectory() as folder:
            database = pathlib.Path(folder) / 'stats.db'
            with closing(sqlite3.connect(database)) as db:
                db.execute('''CREATE TABLE proxy_request_logs (
                    created_at INTEGER, model TEXT, status_code INTEGER, latency_ms INTEGER,
                    input_tokens INTEGER, cache_read_tokens INTEGER, cache_creation_tokens INTEGER,
                    input_token_semantics INTEGER, app_type TEXT, provider_id TEXT)''')
                rows = [
                    (now - 20, 'claude-code-opus', 200, 'desktop', 'relay'),
                    (now - 10, 'claude-opus-5', 502, 'desktop', 'relay'),
                    (now - 5, 'claude-opus-5', 200, 'desktop', 'other'),
                    (now - 4, 'claude-opus-5', 200, 'cli', 'relay'),
                    (now - 90000, 'claude-opus-5', 502, 'desktop', 'relay'),
                ]
                for stamp, model, status, app, provider in rows:
                    db.execute('INSERT INTO proxy_request_logs VALUES (?, ?, ?, 100, 2, 0, 116126, 2, ?, ?)',
                               (stamp, model, status, app, provider))
                db.commit()
            found = relay_status.cache_rows(database, 24, 10)
            self.assertEqual([(row['model'], row['status_code']) for row in found],
                             [('claude-opus-5', 502), ('claude-code-opus', 200)])
            self.assertEqual(relay_status.input_total(found[1]), 116128)
            self.assertEqual(len(relay_status.cache_rows(database, 24, 1)), 1)


class QuotaParserTests(unittest.TestCase):
    def test_refresh_without_titles_keeps_first_complete_snapshot(self):
        panel = '''Settings  Status
Current session
33% used
Resets 11:40am (America/Los_Angeles)
Current week (all models)
39% used
Resets Oct 3, 9pm (America/Los_Angeles)
33% used
Resets 11:39am (America/Los_Angeles)
Current week (all models)
40% used
Resets Oct 3, 8:59pm (America/Los_Angeles)'''
        lines = quota_lines(panel)
        self.assertIn('已用 33%', lines[0])
        self.assertIn('11:40am', lines[0])
        self.assertIn('已用 39%', lines[1])
        self.assertIn('Oct 3, 9pm', lines[1])

    def test_partial_refresh_cannot_overwrite_session_with_week(self):
        panel = '''Settings  Status
Current session
33% used
Resets 11:40am (America/Los_Angeles)
39% used
Resets Oct 3, 9pm (America/Los_Angeles)
Current week (all models)
39% used
Resets Oct 3, 9pm (America/Los_Angeles)'''
        lines = quota_lines(panel)
        self.assertIn('已用 33%', lines[0])
        self.assertIn('11:40am', lines[0])
        self.assertIn('已用 39%', lines[1])

    def test_unavailable_is_not_zero(self):
        self.assertIn('不能据此判断剩余为零', quota_lines('Settings  Status\nFailed to load usage data')[0])

    def test_single_window_is_not_duplicated(self):
        lines = quota_lines('Settings  Status\nCurrent week (all models)\n38% used\nResets Oct 3, 9pm')
        self.assertEqual(len(lines), 2)
        self.assertIn('每周额度', lines[0])
        self.assertNotIn('5 小时额度', '\n'.join(lines))


if __name__ == '__main__':
    unittest.main()
