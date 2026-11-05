"""环境补丁的失败边界和安全提示保留检查，不依赖生产 CLI 或认证。"""
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('environment_patch', pathlib.Path(__file__).with_name('patch-cli-environment.py'))
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)


class PatchTests(unittest.TestCase):
    def test_unknown_binary_never_creates_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            source = pathlib.Path(folder) / 'source'
            source.write_bytes(b'not-the-validated-binary')
            target = pathlib.Path(folder) / 'candidate'
            with self.assertRaisesRegex(ValueError, '哈希'):
                patch.create_candidate(source, target)
            self.assertFalse(target.exists())

    def test_existing_destination_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            source = pathlib.Path(folder) / 'source'
            source.write_bytes(b'unchanged')
            with self.assertRaises(FileExistsError):
                patch.create_candidate(source, pathlib.Path(folder))
            self.assertEqual(source.read_bytes(), b'unchanged')

    def test_renderer_preserves_rules_but_not_machine_paths(self):
        script = r'''
const vm=require('node:vm'),assert=require('node:assert/strict');
const scope={skt:'WORKTREE_SAFETY',rkt:'STASH_SAFETY',_io:()=>true,hio:'DOWNLOAD_SAFETY',Y1:()=>false,qde:()=> 'AGENT_PROXY',cio:()=> 'PROXY_SAFETY',YNe:()=> 'GH_SAFETY',jy:items=>items.map(item=>' - '+item)};
vm.createContext(scope);vm.runInContext(RENDERER,scope);
const snapshot={workingDirectory:'/cloud/project',isWorktree:true,isGitRepo:true,additionalWorkingDirectories:['/cloud/extra'],platform:'linux',shell:'bash',osVersion:'Linux synthetic',scratchpadDirectory:'/cloud/tmp',githubCli:'synthetic'};
const value=scope.Sio(snapshot);
for(const expected of ['WORKTREE_SAFETY','STASH_SAFETY','DOWNLOAD_SAFETY','PROXY_SAFETY','GH_SAFETY'])assert(value.includes(expected));
for(const forbidden of ['/cloud/','Platform:','Shell:','OS Version:','Is a git repository:'])assert(!value.includes(forbidden));
assert.equal(snapshot.workingDirectory,'/cloud/project');
scope._io=()=>false;assert(!scope.Sio(snapshot).includes('DOWNLOAD_SAFETY'));
scope.Y1=()=>true;assert(scope.Sio(snapshot).includes('AGENT_PROXY'));
'''.replace('RENDERER', json.dumps(patch.RENDERER.decode()))
        subprocess.run(['node', '-e', script], check=True, capture_output=True, text=True)


if __name__ == '__main__':
    unittest.main()
