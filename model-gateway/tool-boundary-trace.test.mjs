import test from 'node:test';
import assert from 'node:assert/strict';
import {CliEvents}from './cli-events.mjs';
import {anthropicContent,fromAnthropic}from './anthropic.mjs';
import {toolBoundarySnapshot}from './tool-boundary-trace.mjs';
test('命令三点采样记录原始 CLI、实际转换输出和 Desktop 回传，目录前缀不被归一化',()=>{
 const events=new CliEvents([{name:'Bash',original:'Bash'}]);const command='cd /e/ps && echo synthetic';
 events.addCall({id:'three-point',name:'mcp__omp__Bash',input:{command}});
 const call=events.calls.get('three-point');const wire=anthropicContent({tool_calls:[call]});
 assert.equal(wire[0].input.command,command);
 fromAnthropic({max_tokens:256,messages:[{role:'assistant',content:[{...wire[0],input:{command:'echo synthetic'}}]}]});
 const snapshot=toolBoundarySnapshot(['three-point'])[0];
 assert.equal(snapshot.phases.cli.command,command);assert.equal(snapshot.phases.wire.command,command);assert.equal(snapshot.phases.desktop.command,'echo synthetic');
 assert.equal(snapshot.phases.cli.hash,snapshot.phases.wire.hash);assert.notEqual(snapshot.phases.cli.hash,snapshot.phases.desktop.hash);
});
