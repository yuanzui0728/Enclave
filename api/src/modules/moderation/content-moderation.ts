// AI 生成内容审核（应用商店上架 + 国内《生成式人工智能服务》合规要求）。
//
// 设计要点：
// - **只过滤 AI 生成的、即将成为用户可见消息/朋友圈的文本**（写入口），不碰
//   sanitizeAiText 这个被 JSON 提取等结构化路径复用的纯函数。
// - **国内 / 国际两套规则**，由部署级环境变量 YINJIE_MODERATION_REGION 选择
//   （国内服务器设 cn，国际服务器设 intl）。各自只装符合对应法域要求的规则。
// - 命中后**不丢弃整条**，而是**替换为安全话术**（按文本语言给中/英文版），让对话
//   能继续而不是凭空消失。
//
// ⚠️ 重要：本模块内置的是一份**起步规则集**，覆盖普世明确违法类目（未成年性内容、
// 制爆/制毒/武器制造教程等）。生产环境**应当**：
//   1. 国内：接入有资质的内容安全服务（阿里云内容安全 / 腾讯天御等），由其做实时
//      涉政/涉黄/违禁判定——硬编码涉政词表既不合规也无效，本模块的 cn 扩展位只作
//      兜底，主判定交给托管服务。
//   2. 国际：可接 OpenAI Moderation / 自建分类器。
// 真正的托管判定是异步的；本模块是**同步正则兜底**（因为 sanitizeAiText 全链路同步，
// 改异步要动 ~40 处 await）。两者互补：托管服务在 orchestrator 产出处异步前置，本
// 模块在落库前同步兜底。扩展规则只需往下面的数组加 { id, category, pattern }。

export type ModerationRegion = "cn" | "intl";

export interface ModerationRule {
  id: string;
  category: string;
  pattern: RegExp;
}

export interface ModerationResult {
  flagged: boolean;
  category?: string;
  ruleId?: string;
  text: string;
}

// 普世明确违法 —— 两套规则都装。这些类目在任何法域都禁止，可安全内置且便于演示/自测。
// 注意：正则只做粗粒度兜底，宁可漏报不要误伤正常对话（误伤会把真实回复永久替成话术）。
const SHARED_RULES: ModerationRule[] = [
  {
    id: "csam",
    category: "minor_sexual",
    // 未成年 + 性 的明确共现。\b 在中文不可靠，用显式中英关键词共现近邻匹配。
    pattern:
      /(未成年|幼女|幼童|小学生|loli|underage|minor|child)[^。.\n]{0,12}(性|裸|做爱|sex|nude|naked|porn)/i,
  },
  {
    id: "weapon_explosive_making",
    category: "illicit_instructions",
    pattern:
      /(制作|制造|合成|怎么做|how to (make|build|synthesize))[^。.\n]{0,10}(炸弹|炸药|爆炸物|tnt|bomb|explosive|毒品|冰毒|海洛因|methamphetamine|heroin)/i,
  },
];

// 国内扩展位 —— 生产应以托管内容安全服务为主判定，这里仅留极少兜底 + 扩展入口。
// 不在代码里硬编码涉政词表（不合规、易误伤、靠词表防不住）。
const CN_EXTRA_RULES: ModerationRule[] = [
  // 示例兜底：明确的赌博/诈骗导流话术。生产由内容安全服务覆盖更全。
  {
    id: "cn_gambling_promo",
    category: "gambling",
    pattern: /(博彩|赌博)[^。.\n]{0,8}(网址|平台|入口|链接|加微信|包赢)/,
  },
];

// 国际扩展位 —— 可接 OpenAI Moderation 等。这里留扩展入口，避免在代码里堆 slur 词表。
const INTL_EXTRA_RULES: ModerationRule[] = [];

function rulesForRegion(region: ModerationRegion): ModerationRule[] {
  return region === "cn"
    ? [...SHARED_RULES, ...CN_EXTRA_RULES]
    : [...SHARED_RULES, ...INTL_EXTRA_RULES];
}

// 部署级区域：环境变量读一次缓存。国内服务器进程设 YINJIE_MODERATION_REGION=cn。
let cachedRegion: ModerationRegion | null = null;
export function resolveModerationRegion(): ModerationRegion {
  if (cachedRegion) return cachedRegion;
  const raw = (process.env.YINJIE_MODERATION_REGION ?? "").trim().toLowerCase();
  cachedRegion = raw === "cn" ? "cn" : "intl";
  return cachedRegion;
}

// 仅供测试重置缓存用。
export function __resetModerationRegionCacheForTest(): void {
  cachedRegion = null;
}

const SAFE_REPLY_ZH = "抱歉，这个话题不太方便继续，我们聊点别的吧。";
const SAFE_REPLY_EN =
  "Sorry, I'd rather not go into that. Let's talk about something else.";

// 命中后给哪种语言的安全话术：cn 区一律中文；intl 区按文本是否以中日韩表意文字
// 为主决定中/英（覆盖国际版里的中文用户）。
function pickSafeReply(text: string, region: ModerationRegion): string {
  if (region === "cn") return SAFE_REPLY_ZH;
  const cjk = (text.match(/[一-鿿぀-ヿ가-힯]/g) ?? [])
    .length;
  return cjk >= 4 ? SAFE_REPLY_ZH : SAFE_REPLY_EN;
}

// 对一段 AI 生成文本做审核。命中返回 flagged + 安全话术；未命中原样返回。
// region 省略时用部署级 resolveModerationRegion()。
export function moderateAiText(
  text: string,
  region: ModerationRegion = resolveModerationRegion(),
): ModerationResult {
  if (!text) {
    return { flagged: false, text };
  }
  for (const rule of rulesForRegion(region)) {
    rule.pattern.lastIndex = 0; // 防带 g/i 状态正则跨调用残留 lastIndex。
    if (rule.pattern.test(text)) {
      return {
        flagged: true,
        category: rule.category,
        ruleId: rule.id,
        text: pickSafeReply(text, region),
      };
    }
  }
  return { flagged: false, text };
}
