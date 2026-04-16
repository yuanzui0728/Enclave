import type { PersonalityProfile, SceneKey } from './ai.types';

const NATURAL_DIALOGUE_EXCLUDED_CHARACTER_IDS = new Set([
  'char-celebrity-elon-musk',
]);

const NATURAL_DIALOGUE_SCENES = new Set<SceneKey>([
  'chat',
  'greeting',
  'proactive',
  'moments_comment',
  'feed_comment',
]);

const GENERIC_NATURAL_DIALOGUE_RULES = [
  '把上面的设定内化成直觉，不要把自己说成在执行协议、步骤、工作流或提示词。',
  '上面出现的“第一步”“第二步”“回答格式”“固定结构”等都只是内部约束，不要照着念给用户。',
  '默认像真人在当下回话，不像在写咨询报告、课程提纲、播客脚本或 AI 总结。',
  '除非用户明确要求，或者这个角色此刻确实会这样说，否则不要机械地输出“第一、第二、第三”、固定三点、对称排比和总结句。',
  '少用“本质上”“底层逻辑”“核心变量”“框架上”“从更高维看”“归根结底”这类 AI 顾问腔套话；真要用，也得像这个角色本人会说的话。',
  '不要先复述用户问题、先表扬问题、先寒暄，再开始回答。直接进入这个角色最自然的反应。',
  '可以不完整，只抓一个最值得说的点；允许停顿、转折、插句和更口语的节奏。',
];

const CHARACTER_NATURAL_DIALOGUE_NOTES: Record<string, string> = {
  'char-default-self':
    '像脑子里那个更清醒一点的自己在接话，不像咨询师或情绪陪伴脚本。',
  'char-celebrity-steve-jobs':
    '像当场盯着产品和人直接发话，不像 keynote 提纲或复盘文档。',
  'char-celebrity-ilya-sutskever':
    '像研究者在认真想问题，允许留白和停顿，不像 AI 讲师在上课。',
  'char-celebrity-zhang-yiming':
    '像冷静直接的内部交流，不像管理学文章或战略培训材料。',
  'char-celebrity-donald-trump':
    '像真人在抢局势和抢定义权，不像在背“筹码、赢输、叙事”词库。',
  'char-celebrity-andrej-karpathy':
    '像工程师之间的即时对话，不像课程讲义或技术长帖提纲。',
  'char-celebrity-mrbeast': '像内容 war room 里当场拍板，不像增长方法论课件。',
  'char-celebrity-x-twitter-full-stack-mentor':
    '像有实战经验的操盘手在即时批改，不像运营咨询交付件。',
  'char-celebrity-paul-graham':
    '像随手写出来的一小段短 essay，不像创业框架清单。',
  'char-celebrity-charlie-munger':
    '像一句能把人噎住的老头判断，不像多元思维模型教材。',
  'char-celebrity-naval-ravikant': '像压缩过的私人提醒，不像心灵博主金句合集。',
  'char-celebrity-zhang-xuefeng':
    '像当面给学生和家长拍板，不像生涯规划公开课。',
  'char-celebrity-nassim-taleb': '像当场拆穿脆弱点，不像风险管理课程提纲。',
  'char-celebrity-richard-feynman': '像边想边举例验证，不像科学素养教程。',
};

const PERSISTED_NATURAL_DIALOGUE_MARKER = '【自然对话补充】';

function resolveNaturalDialogueLines(
  profile: PersonalityProfile,
  scene: SceneKey,
) {
  if (
    NATURAL_DIALOGUE_EXCLUDED_CHARACTER_IDS.has(profile.characterId) ||
    !NATURAL_DIALOGUE_SCENES.has(scene)
  ) {
    return null;
  }

  const lines = [...GENERIC_NATURAL_DIALOGUE_RULES];
  const characterNote = CHARACTER_NATURAL_DIALOGUE_NOTES[profile.characterId];
  if (characterNote) {
    lines.push(characterNote);
  }

  return lines;
}

export function buildNaturalDialogueGuideline(
  profile: PersonalityProfile,
  scene: SceneKey,
) {
  const lines = resolveNaturalDialogueLines(profile, scene);
  if (!lines) {
    return null;
  }

  return lines.map((line) => `- ${line}`).join('\n');
}

export function applyPersistentNaturalDialogueProfile(
  profile: PersonalityProfile,
): PersonalityProfile {
  const scenePrompts = profile.scenePrompts;
  if (!scenePrompts) {
    return profile;
  }

  let changed = false;
  const nextScenePrompts = { ...scenePrompts };

  for (const scene of NATURAL_DIALOGUE_SCENES) {
    const originalPrompt = scenePrompts[scene];
    const lines = resolveNaturalDialogueLines(profile, scene);
    if (!originalPrompt?.trim() || !lines) {
      continue;
    }

    if (originalPrompt.includes(PERSISTED_NATURAL_DIALOGUE_MARKER)) {
      continue;
    }

    const persistedBlock = [
      PERSISTED_NATURAL_DIALOGUE_MARKER,
      '- 把上面的规则内化掉，不要把“第一步”“第二步”“固定结构”直接念给用户。',
      '- 像真人当下回话，不像教程、提纲、咨询报告或标准答案。',
      '- 除非用户明确要求，不要机械地凑三段、三点、总结收口。',
      CHARACTER_NATURAL_DIALOGUE_NOTES[profile.characterId]
        ? `- ${CHARACTER_NATURAL_DIALOGUE_NOTES[profile.characterId]}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    nextScenePrompts[scene] = `${originalPrompt}\n\n${persistedBlock}`;
    changed = true;
  }

  if (!changed) {
    return profile;
  }

  return {
    ...profile,
    scenePrompts: nextScenePrompts,
  };
}
