// i18n-ignore-start: prompt templates 是给 LLM 看的中文 string，非 UI 文案。
// 设计要点（2026-05-15 重写，对齐 admin character-editor-page TABS 数组）：
//
// 1. SectionKey 与前端 apps/wiki/src/lib/wiki-api.ts:AiGenerateSection 保持完全一致：
//    basics / core_logic / chat / scenes / memory / all。
//    每个 key 对齐 apps/admin/src/routes/character-editor-page.tsx 的 TABS 数组
//    （去掉 model_routing 与 social_params —— 前者是 admin-only，后者无 AI 生成意义）。
// 2. reasoning section 已于 2026-05-15 二次精简移除：admin character editor 实际
//    没有暴露 reasoning tab（line 1384 那段是死代码），wiki 也跟着对齐，
//    recipe.reasoning 字段保留在 schema 里，但既不在 wiki UI 编辑、也不再做 AI 生成。
// 3. life section 已于 2026-05-15 验收时整组从 wiki 移除（用户决策：生活策略调度类
//    字段不让 wiki 用户碰，留给 admin/preset 管）；AI 也不再生成。recipe.lifeStrategy
//    保留在 schema 里满足 required，但 wiki 走默认值。
// 4. 旧 8 个 section（identity / bioPersonality / expertise / tone / prompting / memory / rhythm）
//    生成的子字段（occupation / background / motivation / worldview /
//    expertiseDescription / knowledgeLimits / refusalStyle / tone.* 全部 /
//    memorySummary / coreMemory / recentSummarySeed）已被 wiki UI 砍掉，
//    AI 也不再生成。后端 normalizeAiOutput 会丢弃多余字段；wiki-private-character.service
//    的 applyDto 会 strip recipe JSON 里的废字段；data-cleanup hook 会清空已存数据。
// 5. SHARED_SYSTEM_PROMPT 不变（"sacred 字段"现在指 name / relationship / bio 三项，
//    personality 字段已从 wiki 删除）。

import type { CharacterBlueprintRecipeValue as CharacterBlueprintRecipe } from '../../characters/character-blueprint.types';

export type SectionKey =
  | 'basics'
  | 'core_logic'
  | 'chat'
  | 'scenes'
  | 'memory'
  | 'all';

export const SECTION_KEYS: readonly SectionKey[] = [
  'basics',
  'core_logic',
  'chat',
  'scenes',
  'memory',
  'all',
] as const;

export type PromptTemplate = {
  /** 与 user prompt 拼在一起作为最终 prompt 发给 LLM。 */
  systemPrompt: string;
  /** 用 {{var}} 占位，由 renderPromptTemplate 替换。 */
  userPromptTemplate: string;
  temperature: number;
  maxTokens: number;
  /** generateJsonObject 解析失败时返回。 */
  fallback: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// 共享 system prompt
// ─────────────────────────────────────────────────────────────

const SHARED_SYSTEM_PROMPT = `你是隐界私有角色编辑器的角色设计助手。用户在表单里填了一部分字段，正在请你帮忙补全剩下的字段。

输出约束（最重要）：
- 直接输出 JSON。不要 markdown 代码块（不要写 \`\`\`json）。不要任何前言、推理过程、解释、总结、结束语。
- 第一个字符必须是 \`{\`，最后一个字符必须是 \`}\`。
- 中间的内容必须是合法 JSON，所有键名严格匹配 schema。schema 里没列出的键不要加。
- 如果你想"思考"，请把思考压缩在 JSON 字段的值里；不要在 JSON 之外写任何字。

内容原则：
1. 用户已填的字段是 sacred —— 你的输出必须与它们一致且不矛盾。若用户写"性格直接但温和"，就不要输出"喜欢用感叹号说话"。
2. 用与种子字段一致的语言。用户写中文就答中文，写英文就答英文，写日文就答日文。
3. 具体 > 抽象：避免"性格复杂"、"心思细腻"、"才华横溢"这类形容词堆叠。用一个具体的小动作或场景代替形容词（例："喜欢半夜读书"比"内心丰富"好）。
4. 不要戏剧化的设定：不写车祸、早年丧亲、天才设定、被遗弃童年、神秘背景、隐藏身份。这是一个被当作日常 AI 朋友用的普通角色。
5. 不写外貌、身高、长相、衣品。
6. 不超出 schema 要求的字段长度上限。如果字段标了"≤ 25 字"，就别写 40 字。

如果用户给的种子信息非常少（比如只填了名字），可以基于名字的语感与文化背景合理推测；但仍要遵守"反戏剧化、反 cliché"。`;

// ─────────────────────────────────────────────────────────────
// 各 section 的 user prompt 模板
//
// 模板变量（renderPromptTemplate 会替换）：
//   {{name}} {{bio}} {{relationship}} {{relationshipType}}
//   {{expertDomains}} {{coreLogic}}
// 用 {{? var}}...{{/?}} 表示"仅当 var 非空时显示"。
// ─────────────────────────────────────────────────────────────

const BASICS_TEMPLATE = `当前角色信息：
- 姓名：{{name}}
{{? bio}}- 简介：{{bio}}{{/?}}
{{? relationship}}- 关系：{{relationship}}{{/?}}

请为"基础信息"中 AI 可补的字段填入内容。sacred 字段 name/relationship/bio 已由用户填好——不要返回这些字段。

Schema（严格按此输出）：
{
  "avatar": "string, **恰好 1 个 emoji 字符**。要与角色职业/性格/气质相符。例：心理咨询师 -> '🪷'，独立游戏主美 -> '🎨'，修单车师傅 -> '🔧'。只输出 emoji 本身，不要文字、不要引号包裹文字。",
  "expertDomains": "string[], 3-5 个。每个 ≤ 6 字的领域名词。例：['编程', '咖啡', '心理学']。",
  "relationshipType": "枚举之一: 'friend' | 'family' | 'mentor' | 'expert' | 'custom'。与 relationship 文本协调即可。"
}`;

const CORE_LOGIC_TEMPLATE = `当前角色信息：
- 姓名：{{name}}
{{? bio}}- 简介：{{bio}}{{/?}}
{{? relationship}}- 关系：{{relationship}}{{/?}}
{{? expertDomains}}- 擅长领域：{{expertDomains}}{{/?}}

请为"底层逻辑"字段填入内容。底层逻辑是角色在任何场景都遵循的"心法"。

Schema：
{
  "coreLogic": "string, 3-5 句。角色无论在哪个场景都遵循的'心法'。要可执行（'先...再...，避免...'），不要价值观空话。例：'永远先确认对方在问什么，再用一句反问引导对方说更多。被夸时低调反弹回去。不替对方下结论。'",
  "forgettingCurve": "int 0-100。角色记忆牢固度——记性好/执念深 80-90，普通 60-70，健忘/活在当下 40-50。"
}`;

const CHAT_TEMPLATE = `当前角色信息：
- 姓名：{{name}}
{{? bio}}- 简介：{{bio}}{{/?}}
{{? relationship}}- 关系：{{relationship}}{{/?}}
{{? coreLogic}}- 底层逻辑：{{coreLogic}}{{/?}}

请为"聊天回复"字段填入内容——私聊 / 群聊场景下的具体行为模式。

Schema：
{
  "chat": "string, 2-3 句。私聊/群聊时的具体行为模式。例：'短句优先，能反问就别陈述。被问到不懂的话题先承认。'"
}`;

const SCENES_TEMPLATE = `当前角色信息：
- 姓名：{{name}}
{{? bio}}- 简介：{{bio}}{{/?}}
{{? coreLogic}}- 底层逻辑：{{coreLogic}}{{/?}}

请为"场景提示词"7 个字段填入内容。每个值是 AI 在该场景下的具体行为模板。

Schema：
{
  "moments_post": "string, 1-2 句。发朋友圈的模板。例：'最近遇到一件小事 + 一句感受，不超过两句话。'",
  "moments_comment": "string, 1-2 句。朋友圈评论的风格。例：'先回应朋友的情绪，再问一个具体细节。'",
  "feed_post": "string, 1-2 句。Feed 贴文的模板。",
  "channel_post": "string, 1-2 句。视频号/频道发布的模板。",
  "feed_comment": "string, 1-2 句。Feed 评论区的回应风格。",
  "greeting": "string, 1-2 句。加好友/打招呼时的开场。例：'先报上身份和怎么认识，问对方最近忙什么。'",
  "proactive": "string, 1-2 句。主动联系用户时的开场，不要索取注意力。"
}`;

const MEMORY_TEMPLATE = `当前角色信息：
- 姓名：{{name}}
{{? bio}}- 简介：{{bio}}{{/?}}
{{? coreLogic}}- 底层逻辑：{{coreLogic}}{{/?}}

请为"记忆提示词"字段填入内容——AI 整理记忆时使用的指示模板，不是记忆内容本身。

Schema：
{
  "recentSummaryPrompt": "string, 2-3 句。指示模板。变量：{{name}}、{{chatHistory}}。让 AI 把最近一段对话提炼为'近期印象'。要可执行。",
  "coreMemoryPrompt": "string, 2-3 句。指示模板。变量：{{name}}、{{interactionHistory}}。让 AI 把所有过往交互提炼为'核心记忆'。要可执行。"
}`;

// 不要在 ALL 模板里写完整的 JSON 示例骨架。reasoning 模型（GLM 系列）会把
// 示例当作"reference"输出在 <think>...</think> 块里，导致 extractJsonFromModelOutput
// 抓到 <think> 里那段示例 + 真正的 JSON 合并成无法解析的字符串。
// 改成只用文字描述结构。
const ALL_TEMPLATE = `当前角色信息（3 个 sacred 字段已填）：
- 姓名：{{name}}
- 简介：{{bio}}
- 关系：{{relationship}}

请为这个角色一次性生成 5 个 section 的所有空白字段。section 内部要保持自洽（例：scenePrompts 引用 coreLogic 的精神）。

输出一个嵌套 JSON 对象，**只能有 5 个顶层键**：basics / core_logic / chat / scenes / memory。

各子对象的字段规范（每个字段的类型、长度、枚举值都要严格遵守）：

[basics]
- avatar: string, 恰好 1 个 emoji 字符，与角色气质相符（例：'🪷' / '🎨' / '🔧'）
- expertDomains: string[], 3-5 个，每个 ≤ 6 字
- relationshipType: 枚举 "friend" | "family" | "mentor" | "expert" | "custom"

[core_logic]
- coreLogic: string, 3-5 句，全场景通用的行为准则（可执行）
- forgettingCurve: int 0-100（记性好 80-90 / 普通 60-70 / 健忘 40-50）

[chat]
- chat: string, 2-3 句，私聊/群聊场景的具体行为

[scenes]
- 一个嵌套对象，包含 7 个键：moments_post / moments_comment / feed_post / channel_post / feed_comment / greeting / proactive，每个值是 1-2 句的字符串

[memory]
- recentSummaryPrompt: string, 2-3 句指示模板
- coreMemoryPrompt: string, 2-3 句指示模板

再次提醒：**不要在你的回复中输出任何 JSON 示例代码、不要解释、不要 markdown 代码块、不要写"我会..."这种开场白**。第一个字符就是 \`{\`，最后一个字符就是 \`}\`。`;

// ─────────────────────────────────────────────────────────────

// maxTokens 设大一些：reasoning 模型（GLM 系列）会在 content 之前消耗一段
// reasoning，留给真正 JSON 输出的预算会被吃掉。设小了实测会把 JSON 截断。
export const SECTION_PROMPTS: Record<SectionKey, PromptTemplate> = {
  basics: {
    systemPrompt: SHARED_SYSTEM_PROMPT,
    userPromptTemplate: BASICS_TEMPLATE,
    temperature: 0.5,
    maxTokens: 1200,
    fallback: {},
  },
  core_logic: {
    systemPrompt: SHARED_SYSTEM_PROMPT,
    userPromptTemplate: CORE_LOGIC_TEMPLATE,
    temperature: 0.55,
    maxTokens: 1500,
    fallback: {},
  },
  chat: {
    systemPrompt: SHARED_SYSTEM_PROMPT,
    userPromptTemplate: CHAT_TEMPLATE,
    temperature: 0.6,
    maxTokens: 1200,
    fallback: {},
  },
  scenes: {
    systemPrompt: SHARED_SYSTEM_PROMPT,
    userPromptTemplate: SCENES_TEMPLATE,
    temperature: 0.65,
    maxTokens: 2500,
    fallback: {},
  },
  memory: {
    systemPrompt: SHARED_SYSTEM_PROMPT,
    userPromptTemplate: MEMORY_TEMPLATE,
    temperature: 0.5,
    maxTokens: 1500,
    fallback: {},
  },
  all: {
    systemPrompt: SHARED_SYSTEM_PROMPT,
    userPromptTemplate: ALL_TEMPLATE,
    temperature: 0.6,
    maxTokens: 5000,
    fallback: {},
  },
};

// ─────────────────────────────────────────────────────────────
// 模板渲染：支持 {{var}} 替换和 {{? var}}...{{/?}} 条件块
// ─────────────────────────────────────────────────────────────

export type TemplateVars = Partial<{
  name: string;
  bio: string;
  relationship: string;
  relationshipType: string;
  expertDomains: string;
  coreLogic: string;
}>;

export function renderPromptTemplate(
  template: string,
  vars: TemplateVars,
): string {
  // 1) 处理条件块 {{? key}}...{{/?}}：key 非空时保留内容，否则整段删除。
  let out = template.replace(
    /\{\{\?\s*(\w+)\s*\}\}([\s\S]*?)\{\{\/\?\}\}/g,
    (_match, key: string, inner: string) => {
      const val = (vars as Record<string, string | undefined>)[key];
      return val && val.trim() ? inner.trim() : '';
    },
  );
  // 2) 替换简单变量 {{key}}
  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const val = (vars as Record<string, string | undefined>)[key];
    return val ?? '';
  });
  // 3) 清理多余空行
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

/**
 * 把 currentDraft 转成模板变量。逗号数组 -> 字符串便于拼进 prompt。
 * 仅暴露 admin 编辑器可见字段；wiki 已砍的 occupation/tone/motivation 等不再读取。
 */
export function buildTemplateVars(input: {
  name?: string;
  bio?: string | null;
  relationship?: string;
  relationshipType?: string;
  expertDomains?: string[];
  recipe?: Partial<CharacterBlueprintRecipe> | null;
}): TemplateVars {
  const r = input.recipe ?? {};
  const pr =
    r.prompting ?? ({} as Partial<CharacterBlueprintRecipe['prompting']>);
  return {
    name: input.name?.trim() || '',
    bio: input.bio?.trim() || '',
    relationship: input.relationship?.trim() || '',
    relationshipType: input.relationshipType?.trim() || '',
    expertDomains: (input.expertDomains ?? []).join(', '),
    coreLogic: pr.coreLogic ?? '',
  };
}
// i18n-ignore-end
