import{stableJson}from'./context.mjs';
// 仅在已提交原生摘要的空闲边界刷新同一组工具，不改变工具权限或命名映射。
export function compactedToolDefinitionsChanged(session,compiled){
 if(session.state!=='idle'||session.turn||session.pendingIds.size||session.pendingHttp.size||session.pendingControls.size
   ||session.compaction?.nativeCommitted!==true||session.compiled.metrics.toolsHash===compiled.metrics.toolsHash)return false;
 const names=value=>value.available.map(t=>[t.name,t.original]).sort((a,b)=>a[0].localeCompare(b[0]));
 return stableJson(names(session.compiled))===stableJson(names(compiled));
}
