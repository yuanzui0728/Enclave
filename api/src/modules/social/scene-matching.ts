// 场景相遇 — 基于角色实时属性的匹配引擎。
// 不依赖角色预设里静态写死的 triggerScenes 数组（很多角色都是空），
// 而是按角色 bio / personality / expertDomains / profile.traits / region / currentActivity
// 与场景关键词做关键词命中评分。
//
// i18n-ignore-start: 数据 / seed / 预设级别的关键词与场景元数据，不是用户可见 UI 字符串。
import type { CharacterEntity } from '../characters/character.entity';

// 主键：UI 暴露给前端的规范场景 ID
export type SceneId =
  | 'coffee_shop'
  | 'gym'
  | 'library'
  | 'park'
  | 'classroom'
  | 'lab'
  | 'office'
  | 'coworking'
  | 'study_room'
  | 'restaurant'
  | 'museum'
  | 'bookstore'
  | 'travel'
  | 'night_walk'
  | 'theater'
  | 'home';

export type SceneMatchSource = 'scene' | 'fallback' | 'none';

// 别名 → 主键。角色预设里的 triggerScenes 可能写各种近义词，统一归一化。
export const SCENE_SYNONYMS: Record<string, SceneId> = {
  // coffee_shop
  cafe: 'coffee_shop',
  coffee: 'coffee_shop',
  coffeeshop: 'coffee_shop',
  // gym
  gym: 'gym',
  fitness: 'gym',
  // library
  library: 'library',
  // park
  park: 'park',
  // classroom
  classroom: 'classroom',
  lecture_hall: 'classroom',
  // lab
  lab: 'lab',
  laboratory: 'lab',
  science_fair: 'lab',
  // office
  office: 'office',
  workplace: 'office',
  meeting_room: 'office',
  war_room: 'office',
  pitch_room: 'office',
  product_lab: 'office',
  boardroom: 'office',
  studio: 'office',
  // coworking
  coworking: 'coworking',
  hackathon: 'coworking',
  startup_event: 'coworking',
  tech_event: 'coworking',
  // study_room
  study_room: 'study_room',
  study: 'study_room',
  exam_week: 'study_room',
  campus: 'study_room',
  archive: 'study_room',
  // restaurant
  restaurant: 'restaurant',
  family_dinner: 'restaurant',
  business_dinner: 'restaurant',
  family_table: 'restaurant',
  // museum
  museum: 'museum',
  // bookstore
  bookstore: 'bookstore',
  publishing_room: 'bookstore',
  writing_room: 'bookstore',
  // travel
  travel: 'travel',
  airport: 'travel',
  train_station: 'travel',
  commuting: 'travel',
  city_center: 'travel',
  // night_walk
  night_walk: 'night_walk',
  date_spot: 'night_walk',
  // theater
  theater: 'theater',
  shoot: 'theater',
  live_room: 'theater',
  // home
  home: 'home',
  bedroom: 'home',
  home_office: 'home',
  desk: 'home',
};

export const SCENE_IDS: SceneId[] = [
  'coffee_shop',
  'gym',
  'library',
  'park',
  'classroom',
  'lab',
  'office',
  'coworking',
  'study_room',
  'restaurant',
  'museum',
  'bookstore',
  'travel',
  'night_walk',
  'theater',
  'home',
];

// 每个场景的中文 / 英文关键词。命中即可加分。
// 关键：尽量覆盖角色 bio / occupation / expertDomains / topicsOfInterest 里的常见表达。
export const SCENE_KEYWORDS: Record<SceneId, { zh: string[]; en: string[] }> = {
  coffee_shop: {
    zh: ['咖啡', '咖啡馆', '咖啡师', '写作', '自由职业', '远程办公', '慢生活', '独立工作', '设计', '创作'],
    en: ['coffee', 'cafe', 'barista', 'writer', 'freelance', 'remote', 'designer', 'creator'],
  },
  gym: {
    zh: ['健身', '训练', '运动', '教练', '跑步', '拳击', '瑜伽', '体能', '私教', '搏击', '球类'],
    en: ['gym', 'fitness', 'training', 'coach', 'workout', 'boxing', 'yoga', 'athlete', 'running'],
  },
  library: {
    zh: ['图书', '阅读', '学者', '研究', '论文', '学生', '教师', '老师', '考研', '写作', '历史', '学术', '导师', '编辑'],
    en: ['library', 'scholar', 'research', 'thesis', 'reading', 'teacher', 'tutor', 'editor', 'academic'],
  },
  park: {
    zh: ['户外', '自然', '散步', '骑行', '摄影', '遛狗', '溜娃', '徒步', '观鸟', '园艺', '宠物'],
    en: ['outdoor', 'nature', 'park', 'cycling', 'photography', 'walking', 'hiking', 'pet'],
  },
  classroom: {
    zh: ['教师', '老师', '教书', '讲课', '教学', '辅导', '导师', '助教', '语文', '数学', '物理', '化学', '生物', '历史', '英语', '美术', '音乐', '体育', '编程'],
    en: ['teacher', 'tutor', 'lecture', 'professor', 'instructor', 'classroom', 'pedagogy'],
  },
  lab: {
    zh: ['实验', '科研', '物理', '化学', '生物', '工程', '材料', '医学', '研究员', '工程师', '算法', '量子'],
    en: ['lab', 'science', 'physics', 'chemistry', 'biology', 'research', 'engineer', 'scientist', 'algorithm'],
  },
  office: {
    zh: ['公司', '职场', '上班', '管理', '创业', '投资', '咨询', '产品', '运营', '市场', '战略', '总监', '高管', '律师', '会计', '财务'],
    en: ['office', 'manager', 'startup', 'founder', 'invest', 'consulting', 'product', 'marketing', 'operations', 'executive', 'cto', 'ceo', 'lawyer'],
  },
  coworking: {
    zh: ['创业', '独立', '远程', '程序员', '开发', '工程师', '设计师', '黑客松', '创客', '独立开发', '自由职业'],
    en: ['coworking', 'startup', 'developer', 'engineer', 'designer', 'hacker', 'maker', 'indie', 'remote'],
  },
  study_room: {
    zh: ['学生', '学习', '备考', '高考', '考研', '复习', '自习', '笔记', '刷题', '校园', '中学', '大学'],
    en: ['student', 'study', 'exam', 'review', 'campus', 'college', 'university', 'highschool'],
  },
  restaurant: {
    zh: ['美食', '厨师', '餐厅', '美食家', '料理', '主厨', '吃货', '酒', '酒馆', '酒吧', '调酒', '餐饮'],
    en: ['chef', 'cuisine', 'restaurant', 'foodie', 'bar', 'bartender', 'sommelier', 'dining'],
  },
  museum: {
    zh: ['艺术', '艺术家', '画家', '雕塑', '历史', '文物', '策展', '博物', '美术', '设计史', '建筑'],
    en: ['art', 'artist', 'painter', 'sculptor', 'curator', 'museum', 'historian', 'archaeology', 'architecture'],
  },
  bookstore: {
    zh: ['书', '书店', '阅读', '文学', '诗', '诗人', '出版', '编辑', '作家', '写作', '翻译', '文字'],
    en: ['book', 'bookstore', 'literature', 'poet', 'editor', 'author', 'writer', 'translator', 'publishing'],
  },
  travel: {
    zh: ['旅行', '出差', '机场', '高铁', '商旅', '探索', '游记', '酒店', '航空', '飞行', '通勤'],
    en: ['travel', 'business trip', 'airport', 'flight', 'hotel', 'commute', 'explorer', 'pilot'],
  },
  night_walk: {
    zh: ['夜晚', '夜跑', '夜晚散步', '深夜', '酒馆', '失眠', '情感', '心理', '陪伴', '约会', '恋爱'],
    en: ['night', 'late night', 'walk', 'date', 'romance', 'emotion', 'companion', 'therapist'],
  },
  theater: {
    zh: ['演员', '导演', '舞台', '戏剧', '话剧', '电影', '电视', '影视', '主持', '直播', '节目', '播客', '音乐人', '歌手', '艺人'],
    en: ['actor', 'director', 'theater', 'film', 'cinema', 'tv', 'host', 'livestream', 'streamer', 'podcast', 'musician', 'singer'],
  },
  home: {
    zh: ['家', '家人', '父母', '父亲', '母亲', '夫妻', '伴侣', '孩子', '居家', '生活', '日常', '邻居', '室友', '宠物'],
    en: ['family', 'parent', 'mother', 'father', 'spouse', 'partner', 'child', 'home', 'roommate', 'neighbor'],
  },
};

// 简体中文场景标签（给 AI prompt 用，避免直接把 'coffee_shop' 字面塞进 prompt）。
export const SCENE_LABEL_ZH: Record<SceneId, string> = {
  coffee_shop: '咖啡馆',
  gym: '健身房',
  library: '图书馆',
  park: '公园',
  classroom: '教室',
  lab: '实验室',
  office: '办公室',
  coworking: '联合办公空间',
  study_room: '自习室',
  restaurant: '餐厅',
  museum: '博物馆',
  bookstore: '书店',
  travel: '旅途',
  night_walk: '夜晚的街道',
  theater: '剧场',
  home: '居家场景',
};

export const SCENE_LABEL_EN: Record<SceneId, string> = {
  coffee_shop: 'a coffee shop',
  gym: 'the gym',
  library: 'the library',
  park: 'the park',
  classroom: 'a classroom',
  lab: 'a lab',
  office: 'the office',
  coworking: 'a coworking space',
  study_room: 'a study room',
  restaurant: 'a restaurant',
  museum: 'a museum',
  bookstore: 'a bookstore',
  travel: 'a trip',
  night_walk: 'a late-night walk',
  theater: 'a theater',
  home: 'a home setting',
};

// currentActivity ↔ scene 气质对齐（弱信号，+1）
const ACTIVITY_AFFINITY: Record<SceneId, string[]> = {
  coffee_shop: ['working', 'free'],
  gym: ['free'],
  library: ['working', 'free'],
  park: ['free'],
  classroom: ['working'],
  lab: ['working'],
  office: ['working'],
  coworking: ['working'],
  study_room: ['working'],
  restaurant: ['eating', 'free'],
  museum: ['free'],
  bookstore: ['free', 'working'],
  travel: ['commuting'],
  night_walk: ['free', 'resting'],
  theater: ['working', 'free'],
  home: ['resting', 'eating', 'sleeping', 'free'],
};

export function normalizeScene(scene: string): SceneId | null {
  const trimmed = (scene ?? '').trim().toLowerCase();
  if (!trimmed) return null;
  const direct = SCENE_SYNONYMS[trimmed];
  if (direct) return direct;
  if ((SCENE_IDS as readonly string[]).includes(trimmed)) {
    return trimmed as SceneId;
  }
  return null;
}

export function scoreCharacterForScene(
  char: Partial<CharacterEntity>,
  scene: SceneId,
): number {
  const keywords = SCENE_KEYWORDS[scene];
  if (!keywords) return 0;
  let score = 0;

  // 1) 显式 triggerScenes：归一化后命中，强信号
  for (const raw of char.triggerScenes ?? []) {
    const normalized = normalizeScene(raw);
    if (normalized === scene) {
      score += 5;
      break;
    }
  }

  // 2) 关键词扫描
  const texts: string[] = [];
  if (char.bio) texts.push(char.bio);
  if (char.personality) texts.push(char.personality);
  if (Array.isArray(char.expertDomains)) texts.push(char.expertDomains.join(' '));
  if (char.region) texts.push(char.region);
  const profile = char.profile as unknown as {
    expertDomains?: string[];
    traits?: { topicsOfInterest?: string[]; catchphrases?: string[] };
    identity?: { occupation?: string; background?: string; motivation?: string };
  } | undefined;
  if (profile?.expertDomains) texts.push(profile.expertDomains.join(' '));
  if (profile?.traits?.topicsOfInterest) {
    texts.push(profile.traits.topicsOfInterest.join(' '));
  }
  if (profile?.traits?.catchphrases) {
    texts.push(profile.traits.catchphrases.join(' '));
  }
  if (profile?.identity?.occupation) texts.push(profile.identity.occupation);
  if (profile?.identity?.background) texts.push(profile.identity.background);
  if (profile?.identity?.motivation) texts.push(profile.identity.motivation);

  const haystack = texts.join(' \n ').toLowerCase();
  for (const kw of keywords.zh) {
    if (haystack.includes(kw.toLowerCase())) score += 2;
  }
  for (const kw of keywords.en) {
    if (haystack.includes(kw.toLowerCase())) score += 2;
  }

  // 3) currentActivity 气质对齐（弱）
  const activity = char.currentActivity ?? null;
  if (activity && ACTIVITY_AFFINITY[scene]?.includes(activity)) {
    score += 1;
  }

  return score;
}

export interface SceneCandidate<P> {
  preset: P;
  score: number;
}

export function matchCandidatesByScene<
  P extends { character: Partial<CharacterEntity> },
>(presets: readonly P[], scene: SceneId): SceneCandidate<P>[] {
  const scored = presets
    .map((preset) => ({ preset, score: scoreCharacterForScene(preset.character, scene) }))
    .filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// 加权随机：按分数偏向高分候选。weight = max(1, score)。
export function pickWeightedRandom<P>(
  candidates: SceneCandidate<P>[],
): P | null {
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((sum, c) => sum + Math.max(1, c.score), 0);
  let r = Math.random() * totalWeight;
  for (const c of candidates) {
    r -= Math.max(1, c.score);
    if (r <= 0) return c.preset;
  }
  return candidates[candidates.length - 1].preset;
}
// i18n-ignore-end
