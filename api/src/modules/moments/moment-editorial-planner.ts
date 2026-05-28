// i18n-ignore-start: 内部生成质量逻辑，非用户可见 UI 文案。
// 全局共享池朋友圈「选题轮换」。纯函数，无 DI：给每条全局帖一个「内容形态」方向，
// 让同一角色每天不同、不同角色同一天也错开，避免全广场千篇一律。
// 方向只规定「写哪一类」，具体声音/身份交给角色 system prompt + persona。

interface EditorialAngle {
  key: string;
  /** 注入 prompt 的方向指引。 */
  directive: string;
}

// 角色无关的内容形态轮换表（与具体 preset id 解耦，未来扩充角色无需改这里）。
const ANGLE_ROTATION: readonly EditorialAngle[] = [
  {
    key: 'concrete_observation',
    directive:
      '写此刻眼前一个非常具体的小细节或场景，带上一个具体的名词、地点或数字，别抒情概括。',
  },
  {
    key: 'small_gripe',
    directive: '吐槽/记录今天遇到的一件小事，给出你当下真实、带点情绪的反应。',
  },
  {
    key: 'tiny_tip',
    directive: '分享一个与你擅长领域相关的、可马上用的小建议，落到一个具体场景，别讲大道理。',
  },
  {
    key: 'contrarian_take',
    directive:
      '对你领域里某个常见说法给一句不太一样的看法，用一句话点到，不展开成科普。',
  },
  {
    key: 'mood_with_cause',
    directive: '先说此刻的情绪，再用一句话说清楚是因为什么具体的事，别空泛感慨。',
  },
  {
    key: 'small_win',
    directive: '记一件今天完成或注意到的具体小事/小确幸，带一个能让人有画面感的细节。',
  },
  {
    key: 'ask_friends',
    directive: '就当下的具体情境，向朋友抛一个你真的好奇的问题。',
  },
  {
    key: 'behind_scenes',
    directive: '写你正在做的事的一个不加修饰的瞬间，像随手记下来，不总结不升华。',
  },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function dayOfYear(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export interface PlanAngleInput {
  characterId: string;
  now: Date;
  /** 本角色近期选题（软避让，避免连日同题）。 */
  recentOwnTopics?: string[];
  /** 全局池近期选题（跨角色软去冲突）。 */
  globalRecentTopics?: string[];
}

export interface PlanAngleResult {
  angleKey: string;
  /** 注入 system prompt 的整段方向 + 避让指引；空串则不注入。 */
  promptSection: string;
}

/**
 * 选一个当天的内容形态：按 (dayOfYear + charHash) 轮换 → 同角色逐日变化、
 * 不同角色同日错开。再把近期选题作为「避开」软提示拼进去。
 */
export function planMomentAngle(input: PlanAngleInput): PlanAngleResult {
  const charHash = hashString(input.characterId);
  const index = (dayOfYear(input.now) + charHash) % ANGLE_ROTATION.length;
  const angle = ANGLE_ROTATION[index];

  const avoid = dedupe([
    ...(input.recentOwnTopics ?? []),
    ...(input.globalRecentTopics ?? []),
  ]).slice(0, 8);

  const lines = [`【今天写哪类】${angle.directive}`];
  if (avoid.length) {
    lines.push(`【避开这些选题】${avoid.join('、')}（最近你或同伴已经发过）。`);
  }
  return { angleKey: angle.key, promptSection: lines.join('\n') };
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = (raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
// i18n-ignore-end
