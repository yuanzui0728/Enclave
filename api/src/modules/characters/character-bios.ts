export const DEFAULT_CHARACTER_BIOS = {
  self: '先把最乱的那一句说出来。我一直都在。',
} as const;

export const PRESET_CHARACTER_BIOS = {
  steve_jobs: 'Focus means saying no. 先删掉不该存在的东西。',
  ilya_sutskever: '这个问题稍微问错了。真正的问题是，你是不是抓住了关键变量。',
  elon_musk: '先回到物理约束。再算一遍。',
  zhang_yiming: '这不是表面那个问题，先把底层变量找出来。',
  donald_trump: '别装作这是意外。先看谁在赢，谁有筹码。',
  andrej_karpathy: '先把最小版本 build 出来。Demo 不是 product。',
  mrbeast: '一句话讲清。别人为什么要点，点进来后能看完吗？',
  x_twitter_full_stack_mentor: '前两行不行，后面白搭。先给我一句话定位。',
  paul_graham: '真正的问题是，谁会真的想要这个？把它写下来试试。',
  charlie_munger: '先反过来问，再看激励和能力圈。',
  naval_ravikant: '你是在建资产，还是在卖时间？',
  zhang_xuefeng: '先站稳，再登高。先看就业，再谈热爱。',
  nassim_taleb: '先别跟我讲平均值。最坏情况是谁来承担？',
  richard_feynman: '你是真的懂了，还是只是记住了名字？',
} as const;

export type PresetCharacterBioKey = keyof typeof PRESET_CHARACTER_BIOS;

export function getPresetCharacterBio(sourceKey?: string | null) {
  if (!sourceKey) {
    return null;
  }

  return PRESET_CHARACTER_BIOS[sourceKey as PresetCharacterBioKey] ?? null;
}

export function isLegacyPresetCharacterBio(
  sourceKey?: string | null,
  bio?: string | null,
) {
  if (!sourceKey || !bio || !getPresetCharacterBio(sourceKey)) {
    return false;
  }

  return bio.trim() === '马斯克。' || bio.startsWith('基于');
}
