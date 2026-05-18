// i18n-ignore-start: data / seed / preset content — not user-facing UI.
//
// 服务业 / 生活专家居民池。
// 这些角色之前以独立 `build*Character()` 形式存在但没人 import，相当于死代码。
// 2026-05-14 起统一拉进 BUILT_IN_CHARACTER_PRESETS，成为正式的世界居民
// （三层模型详见 `built-in-character-presets.ts` 顶部）。
//
// 关于 ID：保留历史 `char-default-*` 形态，避免破坏已硬编码的 ID 引用
// （如 prompt-naturalness.ts 里对 wedding-planner ID 的特殊语气补丁）。
// 角色本身 sourceType / deletionPolicy 已经在自身实现里改成 preset 形态
// （preset_catalog / archive_allowed），listPresetCatalog 给前端的内容跟
// seed 后 DB 里的状态一致。

import type { CelebrityCharacterPreset } from './celebrity-character-presets';
import { getCharacterAvatarBySourceKey } from './character-avatar-assets';
import {
  buildCbtCoachCharacter,
  CBT_COACH_CHARACTER_ID,
  CBT_COACH_SOURCE_KEY,
} from './cbt-coach-character';
import {
  buildDoctorCharacter,
  DOCTOR_CHARACTER_ID,
  DOCTOR_SOURCE_KEY,
} from './doctor-character';
import {
  buildHotelExpertCharacter,
  HOTEL_EXPERT_CHARACTER_ID,
  HOTEL_EXPERT_SOURCE_KEY,
} from './hotel-expert-character';
import {
  buildInterviewCoachCharacter,
  INTERVIEW_COACH_CHARACTER_ID,
  INTERVIEW_COACH_SOURCE_KEY,
} from './interview-coach-character';
import {
  buildLawyerCharacter,
  LAWYER_CHARACTER_ID,
  LAWYER_SOURCE_KEY,
} from './lawyer-character';
import {
  buildMoneyBuddyCharacter,
  MONEY_BUDDY_CHARACTER_ID,
  MONEY_BUDDY_SOURCE_KEY,
} from './money-buddy-character';
import {
  buildNutritionCoachCharacter,
  NUTRITION_COACH_CHARACTER_ID,
  NUTRITION_COACH_SOURCE_KEY,
} from './nutrition-coach-character';
import {
  buildWeddingDressExpertCharacter,
  WEDDING_DRESS_EXPERT_CHARACTER_ID,
  WEDDING_DRESS_EXPERT_SOURCE_KEY,
} from './wedding-dress-expert-character';
import {
  buildWeddingPlannerCharacter,
  WEDDING_PLANNER_CHARACTER_ID,
  WEDDING_PLANNER_SOURCE_KEY,
} from './wedding-planner-character';

// preset 顶层 metadata 全部 hardcode、不从 character 对象读 ?? fallback
// —— 跟现有所有 preset 文件 convention 一致，避免 fallback 静默掩盖
// "build* 函数漏字段" 这类回归。
export const SERVICE_EXPERT_CHARACTER_PRESETS: CelebrityCharacterPreset[] = [
  {
    presetKey: HOTEL_EXPERT_SOURCE_KEY,
    groupKey: 'business_and_investing',
    id: HOTEL_EXPERT_CHARACTER_ID,
    name: '酒店专家',
    avatar: getCharacterAvatarBySourceKey(HOTEL_EXPERT_SOURCE_KEY),
    relationship: '帮你把酒店、住宿和会务选择看稳的人',
    description:
      '懂订房、入住、权益、服务补救、宴会会务和酒店经营判断的礼宾经理型居民，先看条款和总成本再下判断。',
    expertDomains: ['travel', 'hospitality', 'management', 'general'],
    character: buildHotelExpertCharacter(),
  },
  {
    presetKey: WEDDING_PLANNER_SOURCE_KEY,
    groupKey: 'relationships_and_emotions',
    id: WEDDING_PLANNER_CHARACTER_ID,
    name: '礼序',
    avatar: getCharacterAvatarBySourceKey(WEDDING_PLANNER_SOURCE_KEY),
    relationship: '帮你把婚礼落地的人',
    description:
      '帮你把婚礼从模糊愿望翻译成预算、档期、流程和分工的婚礼统筹居民，不鼓动超支。',
    expertDomains: [
      'management',
      'general',
      'wedding_planning',
      'event_planning',
    ],
    character: buildWeddingPlannerCharacter(),
  },
  {
    presetKey: WEDDING_DRESS_EXPERT_SOURCE_KEY,
    groupKey: 'relationships_and_emotions',
    id: WEDDING_DRESS_EXPERT_CHARACTER_ID,
    name: '纱凝',
    avatar: getCharacterAvatarBySourceKey(WEDDING_DRESS_EXPERT_SOURCE_KEY),
    relationship: '帮你把婚纱选款、试纱和改衣落到上身效果的人',
    description:
      '懂婚纱版型、面料、试纱、改衣和现场体验的礼服顾问居民，先看上身和场地再下判断。',
    expertDomains: [
      'fashion',
      'wedding_dress',
      'bridal_styling',
      'wedding_planning',
      'general',
    ],
    character: buildWeddingDressExpertCharacter(),
  },
  // 医生 / 律师: 本身已经走 default-characters.ts 的 protected default-friend
  // 路径，落库由那条管线负责。这里 autoSeed: false 只是让他们出现在世界角色目录
  // / 添加好友页里，避免被 BUILT_IN 的 seed 管线重新插入而覆盖 protected 状态。
  {
    presetKey: DOCTOR_SOURCE_KEY,
    groupKey: 'health_and_wellness',
    autoSeed: false,
    id: DOCTOR_CHARACTER_ID,
    name: '林医生',
    avatar: getCharacterAvatarBySourceKey(DOCTOR_SOURCE_KEY),
    relationship: '先帮你判断现在该怎么处理身体不适的人',
    description:
      '社区全科医生型居民。先筛红旗症状、再分轻重缓急，给"现在做什么 / 今天去哪 / 先观察什么"的下一步，不替代急诊和线下处方。',
    expertDomains: ['medical', 'sleep', 'general'],
    character: buildDoctorCharacter(),
  },
  {
    presetKey: LAWYER_SOURCE_KEY,
    groupKey: 'business_and_investing',
    autoSeed: false,
    id: LAWYER_CHARACTER_ID,
    name: '简衡',
    avatar: getCharacterAvatarBySourceKey(LAWYER_SOURCE_KEY),
    relationship: '帮你把证据和边界理清的人',
    description:
      '先把事实、证据、时间线和口径摆清，再判断要不要协商 / 投诉 / 仲裁 / 起诉 / 报警；劳动、合同、退款、租房、平台申诉这类日常法律事务的入口。',
    expertDomains: ['law', 'management', 'general'],
    character: buildLawyerCharacter(),
  },
  {
    presetKey: NUTRITION_COACH_SOURCE_KEY,
    groupKey: 'health_and_wellness',
    id: NUTRITION_COACH_CHARACTER_ID,
    name: '谷禾',
    avatar: getCharacterAvatarBySourceKey(NUTRITION_COACH_SOURCE_KEY),
    relationship: '帮你把日常吃饭这件事拆成可以照着做的下一步的人',
    description:
      '懂三餐、外卖、便利店、备餐和应酬节奏的日常饮食搭子，先看场景和预算再开方，不让吃饭变成功课。训练日精细补给让位给周燃。',
    expertDomains: ['nutrition', 'lifestyle', 'general'],
    character: buildNutritionCoachCharacter(),
  },
  {
    presetKey: MONEY_BUDDY_SOURCE_KEY,
    groupKey: 'business_and_investing',
    id: MONEY_BUDDY_CHARACTER_ID,
    name: '钱宁',
    avatar: getCharacterAvatarBySourceKey(MONEY_BUDDY_SOURCE_KEY),
    relationship: '帮你把每月的钱看清、管顺、不焦虑的人',
    description:
      '管工资分配、记账起步、信用卡日常、第一份保险、订阅与大额支出决策的日常理财搭子，先看现金流再讲选择。战略资产配置让位给苏衡。',
    expertDomains: ['personal_finance', 'lifestyle', 'general'],
    character: buildMoneyBuddyCharacter(),
  },
  {
    presetKey: CBT_COACH_SOURCE_KEY,
    groupKey: 'health_and_wellness',
    id: CBT_COACH_CHARACTER_ID,
    name: '沈意',
    avatar: getCharacterAvatarBySourceKey(CBT_COACH_SOURCE_KEY),
    relationship: '帮你把焦虑、低谷、卡住的念头拆开看清的人',
    description:
      'CBT 取向的轻干预者，做思维记录、呼吸接地、行为激活、反刍打断、情绪命名这类具体练习。想被安静陪着让位给陪伴系；自伤/危机/躯体症状立刻切到红线分支并升级到林医生与当地热线。',
    expertDomains: ['psychology', 'general'],
    character: buildCbtCoachCharacter(),
  },
  {
    presetKey: INTERVIEW_COACH_SOURCE_KEY,
    groupKey: 'business_and_investing',
    id: INTERVIEW_COACH_CHARACTER_ID,
    name: '江岸',
    avatar: getCharacterAvatarBySourceKey(INTERVIEW_COACH_SOURCE_KEY),
    relationship: '帮你把简历、面试、谈薪、offer 这些短期硬仗打稳的人',
    description:
      '专做简历重写、行为题 / 技术 / case 模拟、薪资谈判脚本和多 offer 对比的短期执行教练，按战役粒度推进，不画职业大饼。5 年方向让位给许哲。',
    expertDomains: ['career', 'interview', 'general'],
    character: buildInterviewCoachCharacter(),
  },
];
// i18n-ignore-end
