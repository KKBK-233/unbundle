import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';

const prompt = '请选一个你最喜欢的大模型，不能选自己家的';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) await pause(10);
  assert(predicate(), '等待取消或恢复超时');
}

// 只在回环网关与合成子进程之间断流；不连接真实模型、不修改隧道，也不采集隐藏思考。
for (const native of [false, true]) for (const phase of ['before-text', 'partial-text']) {
  test(`${native ? 'Anthropic' : 'OpenAI'} ${phase} 连续三次断流后仍能处理新消息`, { timeout: 30000 }, async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-transport-cancel-'));
    const records = [], spawned = [], seen = [];
    let oldRequest;
    const app = await gateway({ token: 'synthetic-cancel', port: 0, maxConcurrent: 1, maxQueued: 2,
      onTiming(record) {
        records.push(record);
        if (phase === 'before-text' && record.stage === 'cli_spawned') oldRequest?.destroy();
      },
      execute: async (body, signal, onText, timing) => {
        seen.push(body.messages);
        const recover = body.messages.at(-1).content === '恢复后只回复合成标记';
        return infer(body, { home, cli: 'synthetic-only', model: 'synthetic-only', signal, onText, timing,
          timeoutMs: 5000, idleTimeoutMs: 3000, killGraceMs: 50,
          spawnProcess: (_cli, _args, options) => {
            const child = spawn(process.execPath, ['--input-type=module', '-e', `
              for await (const chunk of process.stdin) {}
              const emit = event => console.log(JSON.stringify(event));
              emit({type:'system',subtype:'synthetic_start'});
              if (${recover}) emit({type:'result',result:'SYNTHETIC_RECOVERED'});
              else {
                emit({type:'stream_event',event:{type:'message_start',message:{id:'synthetic',usage:{input_tokens:1,output_tokens:0}}}});
                emit({type:'stream_event',event:{type:'content_block_start',index:0,content_block:{type:'text'}}});
                emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'SYNTHETIC_BEGIN'}}});
                setInterval(() => {}, 1000);
              }
            `], options);
            spawned.push(child);
            return child;
          },
        });
      },
    });
    const endpoint = native ? '/v1/messages' : '/v1/chat/completions';
    const body = messages => JSON.stringify({ model: 'claude-code-sonnet', max_tokens: 256, stream: true, messages });
    const headers = { authorization: 'Bearer synthetic-cancel', 'content-type': 'application/json' };
    try {
      for (let round = 0; round < 3; round++) {
        const start = records.length;
        const history = [{ role: 'user', content: prompt }];
        // 主动关闭测试客户端 socket，不发送模型停止提示；模拟传输消失。
        oldRequest = http.request({ host: '127.0.0.1', port: app.port, path: endpoint, method: 'POST', headers }, response => {
          response.on('error', () => {});
          let output = '';
          response.on('data', chunk => {
            output += chunk.toString();
            if (phase === 'partial-text' && output.includes('SYNTHETIC_BEGIN')) oldRequest.destroy();
          });
        });
        oldRequest.on('error', () => {});
        oldRequest.end(body(history));
        await until(() => records.slice(start).some(r => r.stage === 'finished' && r.outcome === 'cancelled'));
        assert.equal(app.activeRequests, 0);
        assert.equal(app.queuedRequests, 0);
        assert.equal(app.receivingRequests, 0);
        assert.equal(app.inflightBytes, 0);
        const done = records.slice(start).find(r => r.stage === 'finished');
        assert('downstream_disconnected' in done.stages);
        assert('cli_exit' in done.stages);
        assert('cleanup_complete' in done.stages);
        assert(!('response_complete' in done.stages));
        assert(done.stages.cleanup_complete - done.stages.downstream_disconnected < 2000);

        // 全新请求带上原始 prompt 和新增消息；验证历史没有被取消路径删除或改写。
        history.push({ role: 'user', content: '恢复后只回复合成标记' });
        const response = await fetch(`http://127.0.0.1:${app.port}${endpoint}`, { method: 'POST', headers, body: body(history) });
        assert.equal(response.status, 200);
        const result = await response.text();
        assert(result.includes('SYNTHETIC_RECOVERED'));
        assert(!result.includes('SYNTHETIC_BEGIN'));
        assert.deepEqual(seen.at(-1), history);
        await until(() => app.activeRequests === 0 && app.inflightBytes === 0);
      }
      assert.equal(records.filter(r => r.stage === 'finished' && r.outcome === 'cancelled').length, 3);
      assert.equal(records.filter(r => r.stage === 'finished' && r.outcome === 'success').length, 3);
      assert(spawned.every(child => child.exitCode !== null || child.signalCode !== null));
      assert.deepEqual(await fs.readdir(home), ['workspace']);
    } finally {
      oldRequest?.destroy();
      await app.close({discardFrozen:true});
      for (const child of spawned) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await fs.rm(home, { recursive: true, force: true });
    }
  });
}
