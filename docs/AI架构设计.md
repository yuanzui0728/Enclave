# AI 架构设计

> 最后更新：2026年3月11日

---

## 概述

隐界的 AI 核心由三层组成：
1. **Prompt Builder** — 把角色人格画像转换成 LLM 可理解的 System Prompt
2. **AI Orchestrator** — 调用 DeepSeek API，处理流式响应、人格提取、意图分类
3. **Chat Service** — 业务逻辑层，处理单聊/群聊升级、消息存储

---

## 文件路径

```
api/src/modules/ai/
├── ai.types.ts                  # 类型定义
├── ai.module.ts                 # NestJS 模块
├── ai-orchestrator.service.ts   # 核心：调用 DeepSeek API
└── prompt-builder.service.ts    # Prompt 模板构建
```

---

## 人格画像结构（PersonalityProfile）

```typescript
{
  characterId: string;
  name: string;
  relationship: string;
  expertDomains: string[];
  traits: {
    speechPatterns: string[];   // 说话习惯
    catchphrases: string[];     // 口头禅
    topicsOfInterest: string[]; // 常聊话题
    emotionalTone: string;      // 情感基调（一句话描述）
    responseLength: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'occasional' | 'frequent';
  };
  memorySummary: string;        // 压缩的长期记忆（100字以内）
  systemPrompt?: string;        // 可选：完全自定义 system prompt
}
```

---

## 聊天响应生成流程

```
用户消息
    │
    ▼
意图分类（轻量 DeepSeek 调用）
    ├── 不需要拉群 → 直接生成回复
    └── 需要拉群 → 群聊升级流程
                    │
                    ▼
              协调者发过渡消息
              系统消息：XX 加入了群聊
              各 AI 依次回复（isGroupChat=true）

Prompt 结构：
  SYSTEM: 你是[姓名]，[关系]。专长：[领域]。
          性格：[emotionalTone]。说话习惯：[patterns]。
          口头禅：[catchphrases]。记忆：[memorySummary]。
          永远不要暴露自己是AI。
  + 最近20条对话历史
  + 用户新消息
```

---

## 智能拉群逻辑

```
意图分类 Prompt 返回：
{
  "needsGroupChat": true,
  "reason": "问题涉及法律和财务两个领域",
  "requiredDomains": ["law", "finance"]
}

→ 查找用户通讯录中匹配这些领域的角色
→ 最多邀请 2 个角色
→ 会话类型从 direct 升级为 group
→ 协调者（原始角色）先说一句过渡语
→ 系统消息通知谁加入了群聊
→ 被邀请的角色依次回复（带 isGroupChat=true 标记）
```

---

## 朋友圈生成

```
MomentsService.generateMomentForCharacter(characterId)
    │
    ▼
buildMomentPrompt(profile, currentTime, recentTopics)
    │ 注入：当前时间段（早上/下午/晚上）、星期几、最近话题
    ▼
DeepSeek 生成 ≤80字 的朋友圈文案
    │
    ▼
scheduleInteractions()
    │ 其他角色 45% 概率互动
    │ 40% 概率评论（AI 生成评论文案）
    │ 60% 概率点赞
    │ 延迟 8-13 秒（模拟真实节奏）
    ▼
存入内存（Phase 2），后续迁移到 MongoDB
```

---

## 聊天记录导入流程

```
用户上传 .txt 文件
    │
    ▼
ImportService.processImport()
    │
    ├── 解析微信导出格式（去时间戳、提取目标人消息）
    ├── 取前 200 条消息作为样本
    ├── DeepSeek 提取人格特征（JSON 格式输出）
    └── 生成 Character + PersonalityProfile
        存入 CharactersService（内存）
```

---

## DeepSeek API 配置

| 场景 | 模型 | max_tokens | temperature |
|------|------|-----------|-------------|
| 聊天回复 | deepseek-chat | 500 | 0.85 |
| 朋友圈生成 | deepseek-chat | 150 | 0.95 |
| 人格提取 | deepseek-chat | 600 | 0.3 |
| 意图分类 | deepseek-chat | 200 | 0.1 |

---

## 环境变量

```bash
# api/.env
DEEPSEEK_API_KEY=your_key_here
PORT=3000
```

---

## 启动后端

```bash
cd api
cp .env.example .env
# 填入 DEEPSEEK_API_KEY
npm run start:dev
```

---

## 前端切换到真实 API

在 `mobile/app/chat/[id].tsx` 中：
```typescript
const USE_REAL_API = true; // 改为 true
```

在 `mobile/services/config.ts` 中：
```typescript
// 真机调试时改为本机 IP
export const API_BASE_URL = 'http://192.168.x.x:3000/api';
export const WS_URL = 'http://192.168.x.x:3000';
```
