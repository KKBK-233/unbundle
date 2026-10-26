import test from 'node:test';
import assert from 'node:assert/strict';
import { cliFailure } from './cli-failure.mjs';
import { gatewayError } from './gateway-error.mjs';

test('CLI失败分类保留HTTP状态且不泄露原始请求或凭据', () => {
  for (const status of [400, 401, 403, 413, 429, 503, 529]) {
    const error = cliFailure({ result: `API Error: ${status} secret-token private-project-content` });
    assert.equal(gatewayError(error).status, status);
    assert.equal(error.code, `UPSTREAM_HTTP_${status}`);
    assert.equal(JSON.stringify(gatewayError(error)).includes('secret-token'), false);
    assert.equal(error.retryable, [400, 401, 403, 413].includes(status) ? false : undefined);
  }
});
test('CLI内部轮次、输入超限和被单独标记的API错误可区分', () => {
  assert.equal(cliFailure({ subtype: 'error_max_turns' }).code, 'CLI_MAX_TURNS');
  assert.equal(cliFailure({ errors: ['prompt is too long'] }).code, 'UPSTREAM_CONTEXT_LIMIT');
  assert.equal(cliFailure({}, 'API Error: 401').status, 401);
  assert.equal(cliFailure({ result: 'unknown secret' }).code, 'CLI_RUN_FAILED');
  assert.equal(cliFailure({ result: 'unknown secret' }).message.includes('secret'), false);
});

test('403仅按明确错误文字区分原因，不把正常账号或未知拒绝解释成封禁', () => {
  const cases = [
    ['This credential is only authorized for use with Claude Code', '当前请求形式'],
    ['OAuth token has been revoked', '过期或已撤销'],
    ['not available in your country', '地区不受支持'],
    ['Request not allowed', '未提供可确认的具体原因'],
  ];
  for (const [reason, expected] of cases) {
    const error = cliFailure({ result: `API Error: 403 ${reason} secret-credential` });
    assert.equal(error.status, 403);
    assert.ok(error.message.includes(expected));
    assert.equal(error.message.includes('secret-credential'), false);
  }
  assert.equal(cliFailure({ result: 'API Error: 403 unknown' }).message, 'Claude 上游返回 403 错误。');
});

test('结构化拒绝原因保留给所属客户端，整份错误对象和凭据不回显', () => {
  const error = cliFailure({ result: 'API Error: 403 ' + JSON.stringify({ error: {
    message: 'OAuth scope user:inference is required; access_token=private-secret; see https://private.example/token',
    privateField: 'do-not-copy-this-field',
  } }) });
  assert.ok(error.message.includes('OAuth scope user:inference is required'));
  for (const secret of ['private-secret', 'private.example', 'do-not-copy-this-field']) assert.equal(error.message.includes(secret), false);
  assert.equal(error.status, 403);
  assert.equal(error.retryable, false);
});

test('官方CLI认证失败纯文本格式保留实际原因并遮盖凭据', () => {
  const error = cliFailure({ result: 'Failed to authenticate. API Error: 403 SYNTHETIC_FORBIDDEN_REASON access_token=private-secret' });
  assert.equal(error.status, 403);
  assert.ok(error.message.includes('SYNTHETIC_FORBIDDEN_REASON'));
  assert.equal(error.message.includes('private-secret'), false);
});
