"""GLM 实验日志定期收敛：仅扫描指定日志目录，不访问认证目录。"""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import time

PROMPT_NAME = re.compile(r"prompt-\d+-[a-f0-9-]{36}\.json$")


def trim(root, *, max_bytes, max_files, max_age, prompt=False):
    # 拒绝符号链接，避免日志清理跨越实验目录；不读取文件内容。
    root = Path(root)
    if not root.exists():
        return {"removed": 0, "remainingBytes": 0, "remainingFiles": 0}
    if root.resolve() != root.absolute() or not root.is_dir():
        raise ValueError("日志目录必须是普通目录")
    files = []
    removed = 0
    now = time.time()
    for directory, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(directory) / d).is_symlink()]
        for name in names:
            p = Path(directory) / name
            if prompt and not PROMPT_NAME.fullmatch(name):
                continue
            if not prompt and p.suffix not in (".jsonl", ".log", ".txt"):
                continue
            try:
                info = p.lstat()
                if not stat.S_ISREG(info.st_mode):
                    continue
                if now - info.st_mtime > max_age:
                    p.unlink()
                    removed += 1
                else:
                    files.append((info.st_mtime, str(p), info.st_size))
            except FileNotFoundError:
                continue
    files.sort()
    total = sum(item[2] for item in files)
    while files and (total > max_bytes or len(files) > max_files):
        _, name, size = files.pop(0)
        try:
            Path(name).unlink()
            removed += 1
        except FileNotFoundError:
            pass
        total -= size
    return {"removed": removed, "remainingBytes": total, "remainingFiles": len(files)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True)
    args = parser.parse_args()
    base = Path(args.state)
    if not base.is_absolute() or base.is_symlink():
        raise ValueError("状态目录必须是绝对路径且不能是符号链接")
    # 详细日志在每次写入后已有容量限制；定时器补齐空闲期间的过期清理。
    results = {
        "prompt": trim(base / "prompt-experiment", max_bytes=64 * 1024**2,
                       max_files=128, max_age=72 * 3600, prompt=True),
        "cli": trim(base / "glm-runtime-home" / ".cache" / "claude-cli-nodejs",
                    max_bytes=16 * 1024**2, max_files=128, max_age=72 * 3600),
    }
    print(json.dumps(results))
