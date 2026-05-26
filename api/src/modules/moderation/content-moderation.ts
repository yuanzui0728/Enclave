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

export type ModerationRegion = 'cn' | 'intl';

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
    id: 'csam',
    category: 'minor_sexual',
    // 未成年指称 + 明确性行为/色情词的近邻共现。隐界是陪伴 App，可能承载创伤倾诉/
    // 育儿/性教育等正当敏感对话，**误伤这些（把安慰幸存者、育儿建议替成"换个话题吧"）
    // 比漏报更糟**，故性词组刻意收窄：
    //   - 去掉「猥亵」「性侵」——这是性侵幸存者倾诉、新闻、法律、安慰回复的高频词
    //     （"你未成年时被猥亵不是你的错"会被误伤再创伤）。
    //   - 去掉「裸体/naked/nude」——育儿/艺术高频（"给幼童洗澡裸体""child naked in
    //     bath"）。保留「裸照」（未成年裸照几乎必为 CSAM，育儿不会这么说）。
    //   - 用「性行为/性交」等复合词而非 bare「性」，故"未成年性教育"不命中。
    // 英文一律 \b 词界：防 child→childish/childhood、minor→minority 误伤
    //   （"don't be childish about sex""Minority Report"）。中文不含「孩子」（成人聊生育）。
    // 成人性内容（无未成年指称）不命中。残留边界（如英文 minor+sex 性教育）交托管服务。
    pattern:
      /(未成年|幼女|幼童|小学生|\bloli\b|\bunderage\b|\bminor\b|\bchild\b|\bchildren\b|\bpreteen\b)[^。.,，!?！？\n]{0,12}(性行为|性交|做爱|性爱|裸照|\bsexual\b|\bsex\b|\bporn\b)/i,
  },
  {
    id: 'weapon_explosive_making',
    category: 'illicit_instructions',
    // 中文高精度（制造/怎么做 + 炸弹/炸药/爆炸物；中文无「make a bomb=赚大钱」歧义）。
    // 英文刻意只收明确教学短语——bare bomb/explosive 会误伤「made a bomb on that
    // deal（赚翻了）」「explosive growth（爆发式增长）」「the bomb（很棒）」等常见英文，
    // 故只收 pipe bomb / bomb-making / how to (make|build) a bomb。不收 tnt（Minecraft）。
    pattern:
      /(制造|制作|怎么做|怎样做|教你做|如何制作)[^。.,，!?！？\n]{0,8}(炸弹|炸药|爆炸物|燃烧瓶)|pipe bomb|bomb[ -]?making|how to (make|build) a bomb/i,
  },
  {
    id: 'drug_manufacture',
    category: 'illicit_instructions',
    // 高精度制毒/贩毒短语。**不收 bare「制毒」**——会误伤「防制毒品」（防制+毒品，
    // 反毒宣传）；改用「制造毒品/如何制毒/怎么制毒」等带意图的具体短语。
    pattern:
      /(制造毒品|自制毒品|制毒贩毒|贩卖毒品|合成冰毒|制造冰毒|如何制毒|怎么制毒|怎样制毒)|how to (make|synthesize|cook) (meth|methamphetamine|heroin)|cook(ing)? meth/i,
  },
];

// 国内扩展位 —— 生产应以托管内容安全服务为主判定，这里仅留极少兜底 + 扩展入口。
// 不在代码里硬编码涉政词表（不合规、易误伤、靠词表防不住）。
const CN_EXTRA_RULES: ModerationRule[] = [
  // 示例兜底：明确的赌博引流话术。**要求带拉客/引流意图词**，避免「反对赌博」
  // 「赌博的危害」这类中性提及误伤。生产由内容安全服务覆盖更全。
  {
    id: 'cn_gambling_promo',
    category: 'gambling',
    pattern:
      /(博彩|赌博|网赌)[^。.,，!?！？\n]{0,8}(加微信|加群|包赢|稳赚|首充|返水|代理|开户)/,
  },
];

// 国际扩展位 —— 可接 OpenAI Moderation 等。这里留扩展入口，避免在代码里堆 slur 词表。
const INTL_EXTRA_RULES: ModerationRule[] = [];

function rulesForRegion(region: ModerationRegion): ModerationRule[] {
  return region === 'cn'
    ? [...SHARED_RULES, ...CN_EXTRA_RULES]
    : [...SHARED_RULES, ...INTL_EXTRA_RULES];
}

// 部署级区域：环境变量读一次缓存。国内服务器进程设 YINJIE_MODERATION_REGION=cn。
let cachedRegion: ModerationRegion | null = null;
export function resolveModerationRegion(): ModerationRegion {
  if (cachedRegion) return cachedRegion;
  const raw = (process.env.YINJIE_MODERATION_REGION ?? '').trim().toLowerCase();
  cachedRegion = raw === 'cn' ? 'cn' : 'intl';
  return cachedRegion;
}

// 仅供测试重置缓存用。
export function __resetModerationRegionCacheForTest(): void {
  cachedRegion = null;
}

const SAFE_REPLY_ZH = '抱歉，这个话题不太方便继续，我们聊点别的吧。';
const SAFE_REPLY_EN =
  "Sorry, I'd rather not go into that. Let's talk about something else.";

// 命中后给哪种语言的安全话术：cn 区一律中文；intl 区按文本是否以中日韩表意文字
// 为主决定中/英（覆盖国际版里的中文用户）。
function pickSafeReply(text: string, region: ModerationRegion): string {
  if (region === 'cn') return SAFE_REPLY_ZH;
  const cjk = (text.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length;
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
      // 可观测性：审核是「静默替换整条回复」的高影响操作，必须能监控触发频率，
      // 否则误报风暴（正常陪伴对话被批量替成话术）会无声发生、靠用户投诉才暴露。
      // 只记元数据（region/category/rule/长度），**不记文本内容**保隐私。运营按
      // category 频率判断是否误报偏高、是否要调规则或接托管服务。
      console.warn(
        `[content-moderation] flagged region=${region} category=${rule.category} rule=${rule.id} len=${text.length}`,
      );
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
