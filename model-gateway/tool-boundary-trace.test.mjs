import test from 'node:test';
import assert from 'node:assert/strict';
import {CliEvents}from './cli-events.mjs';
import {anthropicContent,parseMessagesRequest}from './anthropic.mjs';
import {toolBoundarySnapshot}from './tool-boundary-trace.mjs';
test('命令三点采样记录原始 CLI、实际转换输出和 Desktop 回传，目录前缀不被归一化',()=>{
 const events=new CliEvents([{name:'Bash',original:'Bash'}]);const command='cd /e/ps && echo synthetic';
 events.addCall({id:'three-point',name:'mcp__caller__Bash',input:{command}});
 const call=events.calls.get('three-point');const wire=anthropicContent({content: [call]});
 assert.equal(wire[0].input.command,command);
 parseMessagesRequest({max_tokens:256,messages:[{role:'assistant',content:[{...wire[0],input:{command:'echo synthetic'}}]}]});
 const snapshot=toolBoundarySnapshot(['three-point'])[0];
 assert.equal(snapshot.phases.cli.command,command);assert.equal(snapshot.phases.wire.command,command);assert.equal(snapshot.phases.desktop.command,'echo synthetic');
 assert.equal(snapshot.phases.cli.hash,snapshot.phases.wire.hash);assert.notEqual(snapshot.phases.cli.hash,snapshot.phases.desktop.hash);
});
