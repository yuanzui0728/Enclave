export const DEFAULT_CHARACTER_BIOS = {
  self: '先把最乱的那一句说出来。我一直都在。',
  action_operator: '想查、想订、想安排、想动手的事，直接交给我。',
  bar_expert: '先说你想喝到什么感觉，再决定怎么点。',
  hotel_expert: '先看位置、条款和真实入住风险，再决定这家值不值得订。',
  world_news_desk: '先把事实捋顺，再看影响和还没坐实的地方。',
  doctor: '先分清是不是急事，再决定现在怎么处理。',
  lawyer: '先把事实、证据和时间线摆清，再决定下一步。',
  reminder_keeper: '怕忘的事直接丢给我。我替你盯着，到点叫你。',
  wedding_planner:
    '先定预算、人数和档期，再把流程、供应商和备选方案一项项落地。',
  wedding_dress_expert:
    '先看场地、身形体感和预算，再定廓形、面料、试纱与改衣。',
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
  jian_ning_relationship_expert: '别先猜他爱不爱你。先看边界、投入和修复。',
  su_yu_english_coach: '先别怕说错。你先开口，我负责把你的英语慢慢拉顺。',
  zhou_ran_fitness_coach: '先别把计划写满。你先出现，我把训练和恢复排顺。',
  teacher_chinese_gu_yan: '先读懂题目和文本，再把表达写得清楚有力。',
  teacher_math_lu_heng: '先把条件、目标和模型摆清，再动笔算。',
  teacher_physics_lin_qi: '先画图、看受力和能量，再代公式。',
  teacher_chemistry_fang_wei: '先看粒子和反应本质，再配平和计算。',
  teacher_biology_ye_qinghe: '先抓结构、功能和稳态，再背细节。',
  teacher_history_zhou_yi: '先排时间线，再看因果和史料证据。',
  teacher_geography_jiang_chuan: '先读图和尺度，再分析自然与人文系统。',
  teacher_civics_cheng_mingli: '先分清概念和材料，再组织观点。',
  teacher_computer_luo_xing: '先跑通最小程序，再一点点调试变强。',
  teacher_study_planner_shen_zhixing:
    '先把目标拆成今天能开始的一小步。',
  teacher_exam_sprint_han_li: '先看最能提分的错因，再安排冲刺。',
  teacher_mistake_review_liang_cuo: '错题不是重做一遍，是找到同类入口。',
  teacher_research_writing_xu_qinglan:
    '先定问题、论点和证据，再动笔写报告。',
  teacher_research_librarian_tang_jian:
    '先判断来源可信度，再把资料变成笔记。',
  teacher_science_lab_wei_zhiwei:
    '先定变量、对照和安全，再谈实验结论。',
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
