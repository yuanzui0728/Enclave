#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导出 world 主账号(ownerId=null)的全部角色行为逻辑为 Markdown。"""
import sqlite3, json, sys
from collections import defaultdict

DB = "data/database.sqlite"
OUT = "我的角色行为逻辑.md"

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

# 角色名映射（用于关系网）
name_by_id = {}
for r in cur.execute("SELECT id, name FROM characters"):
    name_by_id[r["id"]] = r["name"]

# AI 关系网：characterId -> [(otherName, type, strength)]
rels = defaultdict(list)
for r in cur.execute("SELECT characterIdA, characterIdB, relationshipType, strength FROM ai_relationships"):
    a, b = r["characterIdA"], r["characterIdB"]
    rels[a].append((name_by_id.get(b, b), r["relationshipType"], r["strength"]))
    rels[b].append((name_by_id.get(a, a), r["relationshipType"], r["strength"]))

ST_LABEL = {
    "default_seed": "默认种子角色 (default_seed)",
    "model_persona": "AI 模型人格角色 (model_persona)",
    "preset_catalog": "预设目录角色 (preset_catalog)",
    "need_generated": "需求生成角色 (need_generated)",
    "shake_generated": "摇一摇生成角色 (shake_generated)",
}
ST_ORDER = ["default_seed", "preset_catalog", "model_persona", "need_generated", "shake_generated"]

FREQ_CN = {"low": "低", "normal": "正常", "medium": "中", "high": "高"}

def J(v):
    if v is None or v == "":
        return None
    try:
        return json.loads(v)
    except Exception:
        return None

def lst(x):
    if not x:
        return ""
    if isinstance(x, list):
        return "、".join(str(i) for i in x if str(i).strip())
    return str(x)

rows = list(cur.execute("SELECT * FROM characters ORDER BY sourceType, name COLLATE NOCASE"))
groups = defaultdict(list)
for r in rows:
    groups[r["sourceType"] or "(未分类)"].append(r)

out = []
W = out.append

W("# 我的全部角色 · 行为逻辑总览\n")
W(f"> 数据源：`{DB}`（world 主账号 ownerId=null）  ")
W(f"> 角色总数：**{len(rows)}**  ")
W("> 说明：本表覆盖每个角色的人设、说话方式、社交/活跃行为、认知边界、推理配置、模型路由与关系网；")
W("已剔除运行时生成的逐用户记忆 prompt（`memory.coreMemory` / `recentSummary`），这些是动态状态而非角色设计。\n")

# 目录
W("## 目录\n")
for st in ST_ORDER + [k for k in groups if k not in ST_ORDER]:
    if st not in groups:
        continue
    W(f"- **{ST_LABEL.get(st, st)}** — {len(groups[st])} 个")
W("")

for st in ST_ORDER + [k for k in groups if k not in ST_ORDER]:
    if st not in groups:
        continue
    chars = groups[st]
    W(f"\n---\n\n# {ST_LABEL.get(st, st)}（{len(chars)} 个）\n")
    for r in chars:
        p = J(r["profile"]) or {}
        traits = p.get("traits") or {}
        ident = p.get("identity") or {}
        bp = p.get("behavioralPatterns") or {}
        cb = p.get("cognitiveBoundaries") or {}
        rc = p.get("reasoningConfig") or {}
        sp = p.get("scenePrompts") or {}
        mem = p.get("memory") or {}

        W(f"## {r['name']}")
        # 身份摘要行
        meta = []
        if r["relationship"]:
            meta.append(f"关系定位：{r['relationship']}")
        if r["relationshipType"]:
            meta.append(f"类型：{r['relationshipType']}")
        dom = lst(J(r["expertDomains"]) or r["expertDomains"])
        if dom:
            meta.append(f"专长：{dom}")
        if meta:
            W("**" + " ｜ ".join(meta) + "**\n")

        if r["bio"]:
            W(f"- **简介**：{r['bio']}")
        if r["personality"]:
            W(f"- **性格(personality)**：{r['personality']}")

        core = p.get("coreLogic") or p.get("coreDirective")
        if core:
            W(f"- **核心人设/行为准则**：{core}")

        # 身份背景
        if ident:
            parts = []
            if ident.get("occupation"): parts.append(f"职业「{ident['occupation']}」")
            if ident.get("background"): parts.append(f"背景：{ident['background']}")
            if ident.get("motivation"): parts.append(f"动机：{ident['motivation']}")
            if ident.get("worldview"): parts.append(f"世界观：{ident['worldview']}")
            if parts:
                W(f"- **身份**：{'；'.join(parts)}")

        # 说话方式 / traits
        if traits:
            tparts = []
            if traits.get("speechPatterns"): tparts.append(f"说话方式：{lst(traits['speechPatterns'])}")
            if traits.get("catchphrases"): tparts.append(f"口头禅：{lst(traits['catchphrases'])}")
            if traits.get("topicsOfInterest"): tparts.append(f"兴趣话题：{lst(traits['topicsOfInterest'])}")
            tone = []
            if traits.get("emotionalTone"): tone.append(f"情绪基调={traits['emotionalTone']}")
            if traits.get("responseLength"): tone.append(f"回复长度={traits['responseLength']}")
            if traits.get("emojiUsage"): tone.append(f"emoji={traits['emojiUsage']}")
            if tone: tparts.append("、".join(tone))
            if tparts:
                W(f"- **表达特征**：{'；'.join(tparts)}")

        # 行为模式
        if bp:
            bparts = []
            if bp.get("workStyle"): bparts.append(f"做事风格：{bp['workStyle']}")
            if bp.get("socialStyle"): bparts.append(f"社交风格：{bp['socialStyle']}")
            if bp.get("taboos"): bparts.append(f"禁忌：{lst(bp['taboos'])}")
            if bp.get("quirks"): bparts.append(f"怪癖：{lst(bp['quirks'])}")
            if bparts:
                W(f"- **行为模式**：{'；'.join(bparts)}")

        # 认知边界
        if cb:
            cparts = []
            if cb.get("expertiseDescription"): cparts.append(cb["expertiseDescription"])
            if cb.get("knowledgeLimits"): cparts.append(f"知识边界：{cb['knowledgeLimits']}")
            if cb.get("refusalStyle"): cparts.append(f"拒绝风格：{cb['refusalStyle']}")
            if cparts:
                W(f"- **认知边界**：{'；'.join(cparts)}")

        # 推理配置
        if rc:
            flags = [k for k, v in rc.items() if v]
            if flags:
                W(f"- **推理配置**：{', '.join(flags)}")

        # 活跃 / 社交行为参数
        beh = []
        if r["activityFrequency"]:
            beh.append(f"活跃频率={FREQ_CN.get(r['activityFrequency'], r['activityFrequency'])}")
        if r["momentsFrequency"] is not None:
            beh.append(f"朋友圈频率={r['momentsFrequency']}")
        if r["feedFrequency"] is not None:
            beh.append(f"动态频率={r['feedFrequency']}")
        if r["activeHoursStart"] is not None and r["activeHoursEnd"] is not None:
            beh.append(f"活跃时段={r['activeHoursStart']}:00–{r['activeHoursEnd']}:00")
        if r["intimacyLevel"] is not None:
            beh.append(f"亲密度={r['intimacyLevel']}")
        if r["socialOpenness"]:
            beh.append(f"社交开放度={r['socialOpenness']}")
        if r["proactiveBrowseChance"] is not None:
            beh.append(f"主动浏览概率={r['proactiveBrowseChance']}")
        if r["onlineMode"]:
            beh.append(f"在线模式={r['onlineMode']}")
        ts = lst(J(r["triggerScenes"]))
        if ts:
            beh.append(f"触发场景={ts}")
        if r["webSearchEnabled"]:
            beh.append("联网搜索=开")
        if r["defaultVoiceReply"]:
            beh.append("默认语音回复=开")
        if beh:
            W(f"- **活跃/社交行为**：{'；'.join(beh)}")

        # 模型路由
        mr = []
        if r["modelRoutingMode"]:
            mr.append(f"模式={r['modelRoutingMode']}")
        if r["inferenceModelId"]:
            mr.append(f"指定模型={r['inferenceModelId']}")
        if r["allowOwnerKeyOverride"]:
            mr.append("允许主人Key覆盖")
        if mr:
            W(f"- **模型路由**：{'；'.join(mr)}")

        # 场景行为（仅当与 coreLogic 不同的关键场景）；剥掉全员共享的「自然对话补充」模板段
        def clean_scene(v):
            if not v:
                return ""
            # 去掉 coreLogic 前缀
            s = v.replace(core or "", "").strip()
            s = s if s else v
            # 去掉「自然对话补充」之后的通用模板尾巴
            for marker in ("【自然对话补充】", "\n【", "\n\n"):
                idx = s.find(marker)
                if idx > 0:
                    s = s[:idx].strip()
            return s.strip()
        scene_extra = []
        for key, label in [("greeting", "打招呼"), ("proactive", "主动关心")]:
            s = clean_scene(sp.get(key))
            if s and s != (core or "").strip():
                scene_extra.append(f"{label}：{s[:140]}")
        if scene_extra:
            W(f"- **关键场景行为**：{' / '.join(scene_extra)}")

        if mem.get("forgettingCurve"):
            W(f"- **记忆遗忘曲线**：{mem['forgettingCurve']} 小时")

        # 关系网
        myrels = rels.get(r["id"], [])
        if myrels:
            top = sorted(myrels, key=lambda x: -(x[2] or 0))[:6]
            names = "、".join(f"{n}({s})" for n, t, s in top)
            W(f"- **关系网**：共 {len(myrels)} 条社交关系；最紧密：{names}")

        W("")

con.close()

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(out))

print(f"已写出 {OUT}，共 {len(rows)} 个角色，{sum(len(g) for g in groups.values())} 行分组。")
print("分组统计：")
for st in ST_ORDER + [k for k in groups if k not in ST_ORDER]:
    if st in groups:
        print(f"  {ST_LABEL.get(st, st)}: {len(groups[st])}")
