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
ready_node = next(item for item in ast.parse(source).body if isinstance(item, ast.FunctionDef) and item.name == 'terminal_ready')
activity_node = next(item for item in ast.parse(source).body if isinstance(item, ast.FunctionDef) and item.name == 'activity_lines')
failure_node = next(item for item in ast.parse(source).body if isinstance(item, ast.FunctionDef) and item.name == 'failure_lines')
namespace = {'re': re}
exec(compile(ast.Module(body=[node, ready_node, activity_node, failure_node], type_ignores=[]), '<quota-parser>', 'exec'), namespace)
quota_lines = namespace['quota_lines']
terminal_ready = namespace['terminal_ready']
activity_lines = namespace['activity_lines']

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


class ActivityTests(unittest.TestCase):
    def test_receiving_is_not_idle_or_inference(self):
        line = activity_lines({'activeRequests': 0, 'queuedRequests': 0, 'receivingRequests': 1}, [], 1000)[0]
        self.assertIn('正在接收', line)
        self.assertIn('尚未进入模型推理', line)

    def test_upload_and_inference_failures_are_distinguished(self):
        fn = namespace['failure_lines']
        before = fn({'stage': 'finished', 'outcome': 'timeout', 'stages': {'request_body_idle_timeout': 30000}, 'upload': {'receivedBytes': 123, 'expectedBytes': 500}})
        self.assertIn('未启动模型推理', '\n'.join(before))
        self.assertIn('123 字节', '\n'.join(before))
        after = fn({'stage': 'finished', 'outcome': 'cancelled', 'stages': {'cli_spawned': 1000, 'downstream_disconnected': 15000}})
        self.assertIn('可能已消耗额度', '\n'.join(after))
        self.assertIn('无法仅凭云端区分来源', '\n'.join(after))

    def test_idle_does_not_promote_old_unfinished_log(self):
        lines = activity_lines({'activeRequests': 0, 'queuedRequests': 0}, [{'stage': 'progress', 'loggedAt': 999}], 1000)
        self.assertIn('云端当前空闲', lines[0])
        self.assertIn('本地工具可能仍在执行', lines[0])

    def test_thinking_events_do_not_prove_task_progress(self):
        record = {'requestId': 'abcdef1234', 'stage': 'progress', 'loggedAt': 980, 'elapsedMs': 200000,
                  'progress': {'event': 'thinking', 'lastEventMs': 200000}}
        lines = activity_lines({'activeRequests': 1, 'queuedRequests': 0}, [record], 1000)
        self.assertIn('尚不能确认有新进展', lines[1])
        self.assertNotIn('仍在继续', lines[1])
        self.assertIn('阶段：思考', lines[1])
        self.assertIn('已运行 220 秒', lines[1])
        self.assertIn('距今 20 秒', lines[1])

    def test_native_session_stages_are_not_reported_as_no_inference(self):
        fn = namespace['failure_lines']
        for stage in ['cli_session_created', 'cli_session_reused', 'upstream_message_start']:
            lines = fn({'stage': 'finished', 'outcome': 'cancelled', 'stages': {stage: 1000}})
            self.assertIn('可能已消耗额度', '\n'.join(lines))
            self.assertNotIn('未启动模型推理', '\n'.join(lines))

    def test_stale_progress_is_not_healthy(self):
        record = {'stage': 'progress', 'loggedAt': 800, 'elapsedMs': 200000, 'progress': {'event': 'thinking', 'lastEventMs': 180000}}
        lines = activity_lines({'activeRequests': 1, 'queuedRequests': 0}, [record], 1000)
        self.assertIn('尚不能确认有新进展', lines[1])
        self.assertIn('距今 220 秒', lines[1])
        self.assertNotIn('仍在继续', lines[1])

    def test_retry_or_process_start_does_not_prove_model_progress(self):
        for event in ['api_retry', 'cli_spawned']:
            lines = activity_lines({'activeRequests': 1, 'queuedRequests': 0}, [{'stage': event, 'loggedAt': 999, 'elapsedMs': 1000}], 1000)
            self.assertNotIn('仍在继续', lines[1])

    def test_multiple_requests_exclude_finished_and_support_queued(self):
        records = [{'stage': 'finished', 'loggedAt': 999}, {'stage': 'first_tool', 'loggedAt': 998, 'elapsedMs': 2000}]
        lines = activity_lines({'activeRequests': 1, 'queuedRequests': 2}, records, 1000)
        self.assertIn('排队 2 个', lines[0])
        self.assertIn('仍在继续', lines[1])
        self.assertIn('等待调度', activity_lines({'activeRequests': 0, 'queuedRequests': 1}, [], 1000)[0])
        self.assertIn('未知', activity_lines({}, [], 1000)[0])


class QuotaParserTests(unittest.TestCase):
    def test_ready_accepts_manual_and_auto_modes(self):
        self.assertTrue(terminal_ready('Claude Code v2.1.280\nmanual mode on\n$'))
        self.assertTrue(terminal_ready('Claude Code v2.1.289\nauto mode on (shift+tab to cycle)\n$'))

    def test_ready_rejects_trust_and_onboarding_screens(self):
        self.assertFalse(terminal_ready('Permission Required: Accessing workspace:\nEnter y/n:'))
        self.assertFalse(terminal_ready("Let's get started\nSelect login method"))
        self.assertFalse(terminal_ready('auto mode on'))

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
