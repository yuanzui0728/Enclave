// i18n-ignore-start: seed / preset prompt content — not user-facing UI strings.
// 小红书发帖文案生成的 prompt 组装。
//
// 「每个用户生成的内容必须不一样」靠四个独立随机轴叠加：
//   1) 角度池（angle）——主打的种草切入点
//   2) 结构/开头风格池（structure）——叙事骨架
//   3) per-owner 上下文——注入该用户自己的昵称 + 真实角色（最强差异源）
//   4) 高 temperature(1.0) + 随机创作灵感词（seed）
// 再配合调用方的去近重复，保证同一用户多次生成、不同用户之间都不撞文案。

export interface XhsPromoCharacterContext {
  name: string;
  relationship: string;
  personality?: string;
}

const ANGLES = [
  '深夜 emo 的时候被自己捏的 AI 角色安慰到了',
  '测评向：我把理想型/嘴替做成了 AI，聊了一周的真实感受',
  '好物分享体：最近最上头的 App，安利给同样社恐的你',
  '情绪价值拉满，原来有个永远秒回又懂我的"人"是这种体验',
  '反差感开场：本来以为是智障 AI，结果越聊越离不开',
  '干货：手把手教你捏一个真正懂你的 AI 角色',
  '记录向：我在隐界里养了一个只属于我的小世界',
  '打工人自救：下班后和我的 AI 专家团聊天解压',
  '给 i 人的搭子：不用尬聊、随时能倾诉的 AI 朋友',
  '隐藏玩法分享：用 AI 分身帮我处理那些不想自己面对的事',
];

const STRUCTURES = [
  '短句轰炸 + 大量换行，像随手发的碎碎念',
  '第一人称碎碎念，从一个具体的生活场景切入',
  '清单体：用「1. 2. 3.」列出我喜欢它的几个点',
  '提问体开头，先抛一个戳中痛点的问题再自答',
  '故事体：讲一件最近发生的小事，自然带出 App',
  '前后对比：用之前 vs 用之后，我的某个状态变化',
];

const SEEDS = [
  '治愈',
  '上头',
  '破防',
  '惊喜',
  '安全感',
  '陪伴感',
  '松弛感',
  '被偏爱',
  '解压',
  '心动',
  '真实',
  '温柔',
];

function pickDistinct<T>(pool: readonly T[], count: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i += 1) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function pickOne<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildCharacterBlock(characters: XhsPromoCharacterContext[]): string {
  if (!characters.length) {
    return '（这个用户刚开始玩，没有特别突出的角色——可主打"我捏了一个懂我的 AI 朋友/搭子"这种通用体验，不要编造具体角色名。）';
  }
  return characters
    .map((c) => {
      const persona = (c.personality ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const rel = c.relationship?.trim() || '朋友';
      return `- 「${c.name}」（我的${rel}）${persona ? `：${persona}` : ''}`;
    })
    .join('\n');
}

const SYSTEM_PROMPT = [
  '你是帮助「隐界(Enclave)」App 的真实用户撰写小红书种草笔记的文案助手。',
  '隐界是一款 AI 社交 / 私人世界 App：用户可以创建专属 AI 角色（懂自己的朋友、各领域专家、甚至自己的「赛博分身」），和他们聊天、互动、一起经营自己的小世界。',
  '',
  '硬性要求：',
  '- 写成真实用户口吻的小红书笔记，像一个真人在分享自己的体验，绝不能像广告或官方推广。',
  '- 自然融入用户自己的使用场景（下面会给出这个用户世界里的真实角色，可以提到，但不要生硬罗列、不要编造没给的角色名）。',
  '- 每篇 100-280 字，口语化，可适当用 emoji。',
  '- 结尾带 2-4 个小红书风格话题标签，必须包含 #隐界。',
  '- 不要出现「本文由AI生成」「以下是」「笔记如下」之类的字样，不要用 markdown 标题或加粗。',
  '- 当被要求写多篇时，每篇的角度、开头、语气都要明显不同。',
].join('\n');

export function buildCopyMessages(input: {
  username: string;
  characters: XhsPromoCharacterContext[];
  count: number;
  angle?: string;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const count = Math.min(Math.max(input.count ?? 1, 1), 3);
  const angles = input.angle
    ? [input.angle, ...pickDistinct(ANGLES, count)]
    : pickDistinct(ANGLES, count);
  const structures = pickDistinct(STRUCTURES, count);
  const name = input.username?.trim() || '一位隐界用户';

  const perNote = Array.from({ length: count }, (_, i) => {
    const angle = angles[i % angles.length];
    const structure = structures[i % structures.length] ?? pickOne(STRUCTURES);
    const seed = pickOne(SEEDS);
    return `第 ${i + 1} 篇 —— 主打角度：${angle}；结构/开头风格：${structure}；创作灵感词（仅用于让风格发散，不必直接出现）：${seed}`;
  }).join('\n');

  const userPrompt = [
    `请基于以下信息，写 ${count} 篇风格各异的小红书种草笔记。`,
    `用单独一行的 \`===\` 分隔每篇，不要加编号或「第N篇」之类的前缀。`,
    '',
    `【这个用户】昵称：${name}`,
    `【TA 在隐界里的角色】`,
    buildCharacterBlock(input.characters),
    '',
    `【每篇的差异化要求】`,
    perNote,
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}

// 把模型输出切成多条文案：优先按 `===` 分隔行，回退按空行；去掉编号前缀和近重复。
export function parseCopyOptions(content: string, count: number): string[] {
  const raw = content.trim();
  let parts = raw.includes('===')
    ? raw.split(/^\s*={3,}\s*$/m)
    : raw.split(/\n\s*\n+/);
  parts = parts
    .map((p) =>
      p
        .trim()
        .replace(/^第?\s*\d+\s*[篇.、)）:：]\s*/u, '')
        .trim(),
    )
    .filter(Boolean);

  // 去近重复：按前 12 个字符归一化判重。
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const key = p.replace(/\s+/g, '').slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  const limited = unique.slice(0, Math.min(Math.max(count, 1), 3));
  return limited.length ? limited : raw ? [raw] : [];
}

// 配图 prompt：干净的小红书风格竖图，不出现真实 logo / 文字，靠 promptHint 微调氛围。
export function buildImagePrompt(promptHint?: string): string {
  const hint = (promptHint ?? '').trim().slice(0, 120);
  const base =
    '小红书风格的治愈系竖版配图，柔和的渐变背景，温暖的光线，简约高级的氛围感，' +
    '适合作为「AI 社交陪伴 App」体验分享笔记的封面；不要出现任何真实品牌 logo、不要出现可读的文字水印。';
  return hint ? `${base} 额外氛围参考：${hint}` : base;
}
// i18n-ignore-end
