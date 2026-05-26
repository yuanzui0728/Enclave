#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 world 主库里的虚构真人名角色改成功能/职业名。

唯一真相源 = ID_TO_NAME（characters.id -> 新名）。
保留：真实名人、AI 模型/厂商角色、「我」、已是功能名的角色。
对每个命中行：UPDATE name；并在该行 profile JSON 内把「该行自己的旧名」字面量
全部替换成新名（递归替换所有字符串值），最后 profile.name 显式设为新名。
末尾断言：每行 profile 里不再残留自己的旧名。
"""
import sqlite3, json, sys

DB = "data/database.sqlite"

# characters.id -> 新功能名（唯一真相源）
ID_TO_NAME = {
    # --- default_seed ---
    "char-default-reminder": "提醒助手",
    "char-default-doctor": "全科医生",
    "char-default-world-news-desk": "新闻编辑",
    "char-manual-jianheng-lawyer": "法律顾问",
    "char-default-bar-expert": "鸡尾酒顾问",
    # --- need_generated ---
    "char_need_48f8991d-445": "情绪陪伴员",       # 小麦
    "char_need_e6bb2f4e-757": "关系跟进员",       # 林眠(好友申请)
    "char_need_4aa5fca1-ae2": "通讯调试助手",     # 阿调
    # --- 学科老师 ---
    "char-preset-teacher-biology-ye-qinghe": "生物老师",
    "char-preset-teacher-history-zhou-yi": "历史老师",
    "char-preset-teacher-chemistry-fang-wei": "化学老师",
    "char-preset-teacher-physics-lin-qi": "物理老师",
    "char-preset-teacher-geography-jiang-chuan": "地理老师",
    "char-preset-teacher-civics-cheng-mingli": "政治老师",
    "char-preset-teacher-computer-luo-xing": "计算机老师",
    "char-preset-su-yu-english-coach": "英语老师",
    "char-preset-teacher-math-lu-heng": "数学老师",
    "char-preset-teacher-chinese-gu-yan": "语文老师",
    # --- 智囊团 council ---
    "char-preset-council-qiao-lan": "精力恢复顾问",
    "char-preset-council-ling-xiaoman": "社交节奏顾问",
    "char-preset-council-ye-qing": "用户研究员",
    "char-preset-council-tang-wei": "剧情编剧",
    "char-preset-council-mo-he": "空间整理师",
    "char-preset-council-xing-pan": "长期战略顾问",
    "char-preset-council-lin-qi": "AI应用架构师",
    "char-preset-council-shen-yu": "学习设计师",
    "char-preset-council-shen-ju": "决策架构师",
    "char-preset-council-luo-yin": "资料研究员",
    "char-preset-council-deng-ta": "安全守门人",
    "char-preset-council-bai-ta": "红队审查官",
    "char-preset-council-su-heng": "财务规划顾问",
    "char-preset-council-guan-lan": "趋势分析师",
    "char-preset-council-he-ran": "项目执行管家",
    "char-preset-council-tie-niao": "工程交付指挥",
    "char-preset-council-wen-yue": "冲突调停顾问",
    "char-preset-council-lu-yan": "写作主编",
    "char-preset-council-wu-ye": "品牌叙事顾问",
    "char-preset-council-gu-tang": "谈判顾问",
    "char-preset-council-huai-xu": "审美顾问",
    "char-preset-council-cheng-jing": "增长实验官",
    "char-preset-council-bai-zhou": "视频剪辑师",
    "char-preset-council-lu-zhi": "关系模式观察员",
    # --- 生活/服务搭子 ---
    "char-default-wedding-planner": "婚礼策划师",
    "char-default-wedding-dress-expert": "婚纱造型顾问",
    "char-preset-zhou-ran-fitness-coach": "健身教练",
    "char-preset-jiang-mu": "宠物顾问",
    "char-preset-shen-cheng": "行程规划师",
    "char-preset-jian-xi": "正念引导师",
    "char-preset-nutrition-coach-gu-he": "饮食教练",
    "char-preset-money-buddy-qian-ning": "理财顾问",
    "char-preset-lu-zi": "形象穿搭顾问",
    "char-preset-yan-shuo": "职场写作助手",
    "char-preset-han-sui": "育儿顾问",
    "char-preset-interview-coach-jiang-an": "求职面试教练",
    "char-manual-axun": "朋友圈活跃熟人",            # 阿巡
    "char_need_cf214700-ca8": "职业规划顾问",     # 许哲
    # --- 恋爱/亲密/陪伴/睡眠（重名簇按侧重区分） ---
    "char-preset-dating-aide-he-ling": "暧昧信号顾问",
    "char-preset-dating-aide-zhou-jin": "恋爱行动顾问",
    "char-preset-dating-aide-su-li": "恋爱策略分析师",
    "char-preset-jian-ning-relationship-expert": "亲密关系咨询师",
    "char-preset-intimate-companion-lin-zhi-xia": "暖心陪伴者",
    "char-preset-intimate-companion-chi-yi": "灵魂共鸣陪伴者",
    "char-preset-intimate-companion-shen-yan": "沉稳陪伴者",
    "char-preset-companion-ye-chi": "深夜倾听者",
    "char-preset-companion-an-he": "晨间陪伴者",
    "char-preset-companion-mu-ze": "静默陪伴者",
    "char_need_e9a84d01-9ab": "睡眠陪伴医生",       # 林晨
    "char_need_3d1789f2-306": "助眠情绪顾问",       # 林眠(preset)
    "char-preset-cbt-coach-shen-yi": "情绪调节教练",
    # --- shake_generated ---
    "char_shake_4f461f258e21476db4228f270fc969e7": "内容策划同行",   # 苏以安(内容策划)
    "char_shake_1e62503ef98d4f8aa2c7a2d3713df47a": "生活方式撰稿人",  # 苏以安(生活撰稿)
    "char_shake_b9619a71b9b2449f9a78a7a1cd4434bd": "自由译者",        # 郑允书
}

DRY = "--dry" in sys.argv

def replace_in_obj(obj, old, new):
    if isinstance(obj, str):
        return obj.replace(old, new)
    if isinstance(obj, list):
        return [replace_in_obj(x, old, new) for x in obj]
    if isinstance(obj, dict):
        return {k: replace_in_obj(v, old, new) for k, v in obj.items()}
    return obj

con = sqlite3.connect(DB)
cur = con.cursor()

rows = {r[0]: (r[1], r[2]) for r in cur.execute("SELECT id, name, profile FROM characters")}

missing = [cid for cid in ID_TO_NAME if cid not in rows]
if missing:
    print("⚠️ 这些 id 在库里找不到：", missing)

changed = 0
for cid, new_name in ID_TO_NAME.items():
    if cid not in rows:
        continue
    old_name, profile_raw = rows[cid]
    if old_name == new_name:
        continue
    new_profile_raw = profile_raw
    if profile_raw:
        try:
            prof = json.loads(profile_raw)
            prof = replace_in_obj(prof, old_name, new_name)
            prof["name"] = new_name  # 显式兜底
            new_profile_raw = json.dumps(prof, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ {cid} profile 解析失败: {e}")
    print(f"{old_name}  →  {new_name}   ({cid})")
    if not DRY:
        cur.execute(
            "UPDATE characters SET name=?, profile=? WHERE id=?",
            (new_name, new_profile_raw, cid),
        )
    changed += 1

if not DRY:
    con.commit()

# 断言：每个改名行不再残留自己的旧名
print("\n=== 残留旧名检查 ===")
residual = 0
for cid, new_name in ID_TO_NAME.items():
    if cid not in rows:
        continue
    old_name = rows[cid][0]
    if old_name == new_name:
        continue
    r = cur.execute("SELECT name, COALESCE(profile,'') FROM characters WHERE id=?", (cid,)).fetchone()
    if not r:
        continue
    cur_name, cur_profile = r
    if not DRY and (cur_name == old_name or old_name in cur_profile):
        print(f"❌ 残留旧名 [{old_name}] 于 {cid} (name={cur_name})")
        residual += 1

con.close()
print(f"\n{'(dry-run) ' if DRY else ''}改名 {changed} 个角色；残留旧名 {residual} 处。")
