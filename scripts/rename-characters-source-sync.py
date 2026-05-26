#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 DB 已落地的角色新名同步到 seed/preset 源码（api/src/modules/characters/*.ts）。

old->new 不手填：直接 diff 备份库(旧名) vs 当前库(新名)，只取 seeded 类型
(default_seed / preset_catalog)，自动排除 need_generated / shake_generated（运行时生成、
不在源码里）以及重名的运行时 林眠。按旧名长度降序替换，规避「叶青 ⊂ 叶青禾」子串污染。
"""
import sqlite3, sys, glob, os

CUR = "data/database.sqlite"
SRC_DIR = "api/src/modules/characters"
DRY = "--dry" in sys.argv

# 备份库路径
baks = sorted(glob.glob("data/database.sqlite.bak.preRename-*"))
if not baks:
    print("找不到 preRename 备份库"); sys.exit(1)
BAK = baks[-1]
print(f"备份库(旧名)：{BAK}\n")

old_by_id = {r[0]: r[1] for r in sqlite3.connect(BAK).execute("SELECT id,name FROM characters")}
cur = sqlite3.connect(CUR)
rename = {}
for cid, new_name, st in cur.execute(
    "SELECT id,name,sourceType FROM characters WHERE sourceType IN ('default_seed','preset_catalog')"
):
    old = old_by_id.get(cid)
    if old and old != new_name:
        rename[old] = new_name

print(f"待同步源码的 seeded 改名：{len(rename)} 个")
# 子串安全：长名先替换
pairs = sorted(rename.items(), key=lambda kv: -len(kv[0]))

files = glob.glob(os.path.join(SRC_DIR, "**", "*.ts"), recursive=True)
total_hits = 0
file_changes = {}
for fp in files:
    with open(fp, encoding="utf-8") as f:
        text = f.read()
    orig = text
    hits = 0
    for old, new in pairs:
        c = text.count(old)
        if c:
            text = text.replace(old, new)
            hits += c
    if text != orig:
        file_changes[fp] = hits
        total_hits += hits
        if not DRY:
            with open(fp, "w", encoding="utf-8") as f:
                f.write(text)

for fp, h in sorted(file_changes.items(), key=lambda kv: -kv[1]):
    print(f"  {h:4d}  {fp}")
print(f"\n{'(dry-run) ' if DRY else ''}改动文件 {len(file_changes)} 个，替换 {total_hits} 处。")

# 残留检查：源码里是否还有任一旧名
print("\n=== 源码残留旧名检查 ===")
residual = []
for old in rename:
    hit_files = [fp for fp in files if old in open(fp, encoding="utf-8").read()]
    if hit_files:
        residual.append((old, hit_files))
if residual:
    for old, fs in residual:
        print(f"  ❌ [{old}] 仍残留于 {fs}")
else:
    print("  ✅ 无残留旧名")
