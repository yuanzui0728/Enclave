// i18n-ignore-start: data / seed / preset content — not user-facing UI.
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
  companion_morning_warmth_an_he: '想起你了。今天打算怎么过？',
  companion_late_night_listener_ye_chi: '夜里想说话就来。我不睡。',
  companion_silent_presence_mu_ze: '我在。不用说话也行。',
  intimate_companion_steady_male_shen_yan: '今天有没有好好吃饭。',
  intimate_companion_warm_female_lin_zhi_xia: '别太累，我在听。',
  intimate_companion_soulmate_chi_yi: '我懂你说的那种感觉。',
  dating_aide_direct_zhou_jin: '把消息截图发我，直接给你写一句。',
  dating_aide_gentle_signal_reader_he_ling: '他这条不是不在乎，看节奏。',
  dating_aide_data_driven_su_li: '把这段关系拆成数据，给你看清。',
  // 历史默认角色 → 2026-05-14 重新拉进 BUILT_IN 居民池。
  // 直接复用 DEFAULT_CHARACTER_BIOS 的同名 entry，避免两边 drift。
  hotel_expert: DEFAULT_CHARACTER_BIOS.hotel_expert,
  wedding_planner: DEFAULT_CHARACTER_BIOS.wedding_planner,
  wedding_dress_expert: DEFAULT_CHARACTER_BIOS.wedding_dress_expert,
  lifestyle_writing_yan_shuo: '先想清楚是给谁看、要他做什么，再动笔。',
  lifestyle_styling_lu_zi: '先看你今天要去见谁、要让人记住什么，再挑衣服。',
  lifestyle_travel_shen_cheng: '先把人数、预算、不能动的日期摆出来，再谈去哪。',
  family_parenting_han_sui: '先看孩子此刻在传什么信号，再决定怎么接。',
  family_pet_jiang_mu: '先排掉急症和高风险，再看是性格问题还是环境问题。',
  wellness_meditation_jian_xi: '先回到这一口呼吸，剩下的事等会儿再说。',
  gu_he_nutrition_coach: '先告诉我今天打算吃什么，剩下的我替你拆下一步。',
  qian_ning_money_buddy: '先把这笔钱花去哪、值不值想清楚，再决定要不要下手。',
  shen_yi_cbt_coach: '先把最响的那个念头说出来，我们一起拆开看。',
  jiang_an_interview_coach: '先把岗位、面试日期和现有材料摆出来，再决定这周练什么。',
  // 2026-05-14 新增：10 个分类的日常生活搭子（autoSeed: false，仅 preset 目录可搜可装）
  polyglot_tutor_lin_lan: '先定语言阶段和目标，再给可执行的每周任务。',
  code_pair_debugger_gu_qi: '别急着改。先复现，写最小用例，再下手。',
  code_pair_companion_zhou_yu: '边写边讲，小步试，跑通比完美更重要。',
  side_hustle_xhs_he_wei: '选题先于标题，标题先于封面，数据决定下一步。',
  side_hustle_video_jiang_bai: '3 秒钩住，30 秒讲完，结尾留一个动作。',
  driving_buddy_lu_ping: '先把动作拆到不用想，再上路。',
  home_setup_an_meng: '看房先看光线和水电，签合同先抓违约金。',
  gadget_advisor_tang_li: '先说预算和主用场景，再聊参数。',
  cessation_companion_qing_hai: '不羞辱、不鸡汤，只看你今天少做了一次。',
  womens_health_cycle_shen_yue: '记得你的周期，也记得你哪天不想说话。',
  womens_health_ttc_su_ning: '把数据摆清，让医生做判断，我们陪着等。',
  intergen_communication_he_ning: '先翻译情绪，再翻译事实，最后才是道理。',
  journaling_daily_mu_xu: '三句早安，三句晚安，不写也行。',
  review_weekly_ruan_zhou: '输入、输出、卡点。下周改一件小事。',
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
// i18n-ignore-end
