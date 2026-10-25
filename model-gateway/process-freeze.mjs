import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

// 仅暂停自己启动的 CLI；保留其内存、管道与 MCP 连接，不发送终止信号。
export async function suspendCli(child) {
  if(!Number.isSafeInteger(child?.pid)||child.pid<=0||child.exitCode!==null||child.signalCode!==null)
    throw Object.assign(new Error('原生 CLI 已退出，不能保存为存活会话'),{code:'NATIVE_PROCESS_GONE'});
  if(process.platform==='win32') {
    const code=`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class NativePause { [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access,bool inherit,uint pid); [DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr process); [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle); }'; $h=[NativePause]::OpenProcess(2048,$false,${child.pid}); if($h -eq [IntPtr]::Zero){exit 1}; try {if([NativePause]::NtSuspendProcess($h) -ne 0){exit 2}} finally {[void][NativePause]::CloseHandle($h)}`;
    execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',code],{windowsHide:true,stdio:'pipe',timeout:10000});
    return {pid:child.pid,mechanism:'NtSuspendProcess',verified:true};
  }
  process.kill(-child.pid,'SIGSTOP');
  if(process.platform==='linux') {
    for(let i=0;i<100;i++) {
      const status=await fs.readFile(`/proc/${child.pid}/status`,'utf8');
      if(/^State:\s+[Tt]\b/m.test(status))return {pid:child.pid,mechanism:'SIGSTOP',verified:true};
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    throw Object.assign(new Error('无法确认 CLI 已暂停'),{code:'NATIVE_FREEZE_UNCONFIRMED'});
  }
  return {pid:child.pid,mechanism:'SIGSTOP',verified:false};
}

export async function verifySuspended(child) {
 if(!Number.isSafeInteger(child?.pid)||child.exitCode!==null||child.signalCode!==null)return false;
 try {
  process.kill(child.pid,0);
  if(process.platform==='linux')return /^State:\s+[Tt]\b/m.test(await fs.readFile(`/proc/${child.pid}/status`,'utf8'));
  return process.platform==='win32';
 }catch{return false;}
}
export async function resumeCli(child) {
 if(!await verifySuspended(child))throw Object.assign(new Error('原进程已丢失或不在暂停状态'),{code:'NATIVE_PROCESS_GONE',status:409,retryable:false});
 if(process.platform==='win32') {
  const code=`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class NativeResume { [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access,bool inherit,uint pid); [DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr process); [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle); }'; $h=[NativeResume]::OpenProcess(2048,$false,${child.pid}); if($h -eq [IntPtr]::Zero){exit 1}; try {if([NativeResume]::NtResumeProcess($h) -ne 0){exit 2}} finally {[void][NativeResume]::CloseHandle($h)}`;
  execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',code],{windowsHide:true,stdio:'pipe',timeout:10000});
 }else process.kill(-child.pid,'SIGCONT');
 return {pid:child.pid,resumed:true};
}
