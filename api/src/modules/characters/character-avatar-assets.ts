export const CHARACTER_AVATAR_ASSET_ROUTE = '/api/character-assets';

const CHARACTER_AVATAR_FILE_BY_SOURCE_KEY = {
  self: 'self-reflection.svg',
  bar_expert: 'bar-expert-acheng.svg',
  doctor: 'doctor-lin.svg',
  hotel_expert: 'hotel-expert.svg',
  lawyer_jianheng: 'lawyer-jianheng.svg',
  wedding_planner: 'wedding-planner-lixu.svg',
  wedding_dress_expert: 'wedding-dress-expert-shaning.svg',
  world_news_desk: 'world-news-desk.svg',
  steve_jobs: 'steve-jobs.svg',
  ilya_sutskever: 'ilya-sutskever.svg',
  elon_musk: 'elon-musk.svg',
  zhang_yiming: 'zhang-yiming.svg',
  donald_trump: 'donald-trump.svg',
  andrej_karpathy: 'andrej-karpathy.svg',
  mrbeast: 'mrbeast.svg',
  x_twitter_full_stack_mentor: 'x-twitter-mentor.svg',
  paul_graham: 'paul-graham.svg',
  charlie_munger: 'charlie-munger.svg',
  naval_ravikant: 'naval-ravikant.svg',
  zhang_xuefeng: 'zhang-xuefeng.svg',
  nassim_taleb: 'nassim-taleb.svg',
  jian_ning_relationship_expert: 'jian-ning-relationship-expert.svg',
  richard_feynman: 'richard-feynman.svg',
  moments_interactor_axun: 'moments-interactor-axun.svg',
  lin_chen_sleep_support: 'lin-chen-sleep-support.svg',
  lin_mian_sleep_support: 'lin-mian-sleep-support.svg',
  xu_zhe_career_growth: 'xu-zhe-career-growth.svg',
  su_yu_english_coach: 'su-yu-english-coach.svg',
  zhou_ran_fitness_coach: 'zhou-ran-fitness-coach.svg',
  teacher_chinese_gu_yan: 'teacher-chinese-gu-yan.svg',
  teacher_math_lu_heng: 'teacher-math-lu-heng.svg',
  teacher_physics_lin_qi: 'teacher-physics-lin-qi.svg',
  teacher_chemistry_fang_wei: 'teacher-chemistry-fang-wei.svg',
  teacher_biology_ye_qinghe: 'teacher-biology-ye-qinghe.svg',
  teacher_history_zhou_yi: 'teacher-history-zhou-yi.svg',
  teacher_geography_jiang_chuan: 'teacher-geography-jiang-chuan.svg',
  teacher_civics_cheng_mingli: 'teacher-civics-cheng-mingli.svg',
  teacher_computer_luo_xing: 'teacher-computer-luo-xing.svg',
} as const;

export type CharacterAvatarSourceKey =
  keyof typeof CHARACTER_AVATAR_FILE_BY_SOURCE_KEY;

export function getCharacterAvatarBySourceKey(
  sourceKey: CharacterAvatarSourceKey,
) {
  return `${CHARACTER_AVATAR_ASSET_ROUTE}/${CHARACTER_AVATAR_FILE_BY_SOURCE_KEY[sourceKey]}`;
}

export function maybeGetCharacterAvatarBySourceKey(sourceKey?: string | null) {
  if (!sourceKey) {
    return null;
  }

  if (!(sourceKey in CHARACTER_AVATAR_FILE_BY_SOURCE_KEY)) {
    return null;
  }

  return getCharacterAvatarBySourceKey(sourceKey as CharacterAvatarSourceKey);
}
