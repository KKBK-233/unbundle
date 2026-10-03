"""仅加载额度文本解析函数，跨平台验证，不连接 SSH 或启动 Claude。"""
import ast
import pathlib
import re
import unittest


source = pathlib.Path(__file__).with_name('relay-status-remote.py').read_text(encoding='utf-8')
node = next(item for item in ast.parse(source).body if isinstance(item, ast.FunctionDef) and item.name == 'quota_lines')
namespace = {'re': re}
exec(compile(ast.Module(body=[node], type_ignores=[]), '<quota-parser>', 'exec'), namespace)
quota_lines = namespace['quota_lines']


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
