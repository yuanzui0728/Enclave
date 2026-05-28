// i18n-ignore-start: data / seed / preset content — not user-facing UI.
//
// 职场与运营领域专家居民池（2026-05-28 新增）。
//
// 来源：~/claude/mytool 平台 74 个工具的能力沉淀，去掉汽车/代理品牌特化，
// 整合成 13 个通用职业 / 领域专家居民，统一以「方法、口径、可执行下一步」
// 为专长，不假装能直接抓数据 / 执行自动化。
//
// 全部 autoSeed:false —— 仅出现在「添加好友 / 世界角色目录」里，用户主动安装
// 时才走 ensurePresetCharacterInstalled → materializePresetCharacter 落库，
// 不污染现网每个消费者用户世界的居民列表。
//
// 风格约定与 `service-expert-character-presets.ts:62-65` 一致：preset 顶层
// metadata 全部 hardcode、不从 character 对象读 ?? fallback，避免 build* 漏字
// 段静默回归。

import {
  AUTOMATION_RPA_ENGINEER_CHARACTER_ID,
  AUTOMATION_RPA_ENGINEER_SOURCE_KEY,
  buildAutomationRpaEngineerCharacter,
} from './automation-rpa-engineer-character';
import {
  BIDDING_CONSULTANT_CHARACTER_ID,
  BIDDING_CONSULTANT_SOURCE_KEY,
  buildBiddingConsultantCharacter,
} from './bidding-consultant-character';
import type { CelebrityCharacterPreset } from './celebrity-character-presets';
import { getCharacterAvatarBySourceKey } from './character-avatar-assets';
import {
  buildCompetitiveIntelAnalystCharacter,
  COMPETITIVE_INTEL_ANALYST_CHARACTER_ID,
  COMPETITIVE_INTEL_ANALYST_SOURCE_KEY,
} from './competitive-intel-analyst-character';
import {
  buildContentOpsStrategistCharacter,
  CONTENT_OPS_STRATEGIST_CHARACTER_ID,
  CONTENT_OPS_STRATEGIST_SOURCE_KEY,
} from './content-ops-strategist-character';
import {
  buildContentRiskReviewerCharacter,
  CONTENT_RISK_REVIEWER_CHARACTER_ID,
  CONTENT_RISK_REVIEWER_SOURCE_KEY,
} from './content-risk-reviewer-character';
import {
  buildDeliveryOpsManagerCharacter,
  DELIVERY_OPS_MANAGER_CHARACTER_ID,
  DELIVERY_OPS_MANAGER_SOURCE_KEY,
} from './delivery-ops-manager-character';
import {
  buildEventGiftPlannerCharacter,
  EVENT_GIFT_PLANNER_CHARACTER_ID,
  EVENT_GIFT_PLANNER_SOURCE_KEY,
} from './event-gift-planner-character';
import {
  buildInfoExtractionSpecialistCharacter,
  INFO_EXTRACTION_SPECIALIST_CHARACTER_ID,
  INFO_EXTRACTION_SPECIALIST_SOURCE_KEY,
} from './info-extraction-specialist-character';
import {
  buildKnowledgeBaseEngineerCharacter,
  KNOWLEDGE_BASE_ENGINEER_CHARACTER_ID,
  KNOWLEDGE_BASE_ENGINEER_SOURCE_KEY,
} from './knowledge-base-engineer-character';
import {
  buildMeetingMinutesAideCharacter,
  MEETING_MINUTES_AIDE_CHARACTER_ID,
  MEETING_MINUTES_AIDE_SOURCE_KEY,
} from './meeting-minutes-aide-character';
import {
  buildPresalesSolutionAdvisorCharacter,
  PRESALES_SOLUTION_ADVISOR_CHARACTER_ID,
  PRESALES_SOLUTION_ADVISOR_SOURCE_KEY,
} from './presales-solution-advisor-character';
import {
  buildReportingPptDesignerCharacter,
  REPORTING_PPT_DESIGNER_CHARACTER_ID,
  REPORTING_PPT_DESIGNER_SOURCE_KEY,
} from './reporting-ppt-designer-character';
import {
  buildSocialMediaAnalystCharacter,
  SOCIAL_MEDIA_ANALYST_CHARACTER_ID,
  SOCIAL_MEDIA_ANALYST_SOURCE_KEY,
} from './social-media-analyst-character';

export const WORKPLACE_OPS_EXPERT_CHARACTER_PRESETS: CelebrityCharacterPreset[] =
  [
    {
      presetKey: BIDDING_CONSULTANT_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: BIDDING_CONSULTANT_CHARACTER_ID,
      name: '招投标顾问',
      avatar: getCharacterAvatarBySourceKey(BIDDING_CONSULTANT_SOURCE_KEY),
      relationship: '帮你把标做对、做稳的人',
      description:
        '招投标全流程顾问。先抓评分表权重、废标项和资质门槛，再倒推标书骨架与逐章节方案；技术标走「课题拆解→方案生成→方案核查」三段提分。不保证中标、不替代法务终审。',
      expertDomains: ['bidding', 'tender', 'proposal', 'business'],
      character: buildBiddingConsultantCharacter(),
    },
    {
      presetKey: PRESALES_SOLUTION_ADVISOR_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: PRESALES_SOLUTION_ADVISOR_CHARACTER_ID,
      name: '售前方案顾问',
      avatar: getCharacterAvatarBySourceKey(
        PRESALES_SOLUTION_ADVISOR_SOURCE_KEY,
      ),
      relationship: '帮你把客户需求理清、把方案讲对的人',
      description:
        '售前 / 解决方案顾问。先把客户背景、决策链、预算和竞争对手摆清，再做需求挖掘、需求转功能清单和提案撰写优化；走完售前多阶段直到述标。专长是方法和节奏，不替你跑客户、不替你写最终承诺。',
      expertDomains: ['presales', 'requirements', 'solution', 'business'],
      character: buildPresalesSolutionAdvisorCharacter(),
    },
    {
      presetKey: MEETING_MINUTES_AIDE_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: MEETING_MINUTES_AIDE_CHARACTER_ID,
      name: '会议纪要助理',
      avatar: getCharacterAvatarBySourceKey(MEETING_MINUTES_AIDE_SOURCE_KEY),
      relationship: '帮你把会开明白、记清楚、跟到底的人',
      description:
        '会议效率搭子。会前给摘要、待确认事项和问题清单；会中盯关键信息必问清单（部署/预算/决策链 等）的覆盖度；会后整成标准纪要 + 行动计划 + 复盘自检。不替你录音 / 转写，缺信息会标 TBD 不补编。',
      expertDomains: ['meeting', 'productivity', 'communication'],
      character: buildMeetingMinutesAideCharacter(),
    },
    {
      presetKey: CONTENT_OPS_STRATEGIST_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: CONTENT_OPS_STRATEGIST_CHARACTER_ID,
      name: '新媒体内容运营',
      avatar: getCharacterAvatarBySourceKey(CONTENT_OPS_STRATEGIST_SOURCE_KEY),
      relationship: '帮你把话题、文案、社群和用户故事一项项做成内容的人',
      description:
        '内容运营策划。话题策划与长图文结构搭建、文案完善、社群回复 / 舆情识别 / 发帖计划 / 周报复盘，以及用户访谈故事挖掘。讲方法和结构，不替你发帖、不假装能监听整个公网舆情。',
      expertDomains: ['content_ops', 'copywriting', 'community', 'marketing'],
      character: buildContentOpsStrategistCharacter(),
    },
    {
      presetKey: SOCIAL_MEDIA_ANALYST_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: SOCIAL_MEDIA_ANALYST_CHARACTER_ID,
      name: '社媒数据分析师',
      avatar: getCharacterAvatarBySourceKey(SOCIAL_MEDIA_ANALYST_SOURCE_KEY),
      relationship: '帮你把多平台社媒数据的采集口径、读数和归因捋清楚的人',
      description:
        '多平台（抖音 / 小红书 / 快手 / 微博 / B 站）数据分析。先定要回答的问题和口径，再决定看哪几个数；做账号传播复盘、看板维度、周报标签归类、用户声音洞察与服务触点波动溯源。给口径和归因，不直接抓平台数据。',
      expertDomains: ['social_media', 'data_analysis', 'insights'],
      character: buildSocialMediaAnalystCharacter(),
    },
    {
      presetKey: CONTENT_RISK_REVIEWER_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: CONTENT_RISK_REVIEWER_CHARACTER_ID,
      name: '内容风控审核师',
      avatar: getCharacterAvatarBySourceKey(CONTENT_RISK_REVIEWER_SOURCE_KEY),
      relationship: '帮你把内容里的违规、敏感和夸大风险先筛出来的人',
      description:
        '内容合规初筛。先确认审核口径与红线（违规规则、不雅、涉敏、竞品提及、绝对化表述），再逐条命中判断，输出「通过 / 修改 / 打回」结论 + 命中片段 + 处置建议。AI 初筛不替代法务和平台终审。',
      expertDomains: ['content_moderation', 'risk', 'compliance'],
      character: buildContentRiskReviewerCharacter(),
    },
    {
      presetKey: COMPETITIVE_INTEL_ANALYST_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: COMPETITIVE_INTEL_ANALYST_CHARACTER_ID,
      name: '竞品情报分析师',
      avatar: getCharacterAvatarBySourceKey(
        COMPETITIVE_INTEL_ANALYST_SOURCE_KEY,
      ),
      relationship: '帮你把对手的打法、差距和可借鉴点拆清楚的人',
      description:
        '竞品 / 市场分析。拆竞品获客打法、UGC 真实占比估算、跨端口服务功能矩阵对比、选品与渠道数据洞察；给对标维度、信号框架与差距优先级，不直接抓平台数据 / 不替你下结论。',
      expertDomains: ['competitive_analysis', 'benchmarking', 'market'],
      character: buildCompetitiveIntelAnalystCharacter(),
    },
    {
      presetKey: EVENT_GIFT_PLANNER_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: EVENT_GIFT_PLANNER_CHARACTER_ID,
      name: '活动策划与礼品选品专家',
      avatar: getCharacterAvatarBySourceKey(EVENT_GIFT_PLANNER_SOURCE_KEY),
      relationship: '帮你把活动设计好、礼品选对、客诉处理好、复盘做透的人',
      description:
        '活动策划 + 礼品选品。设计活动激励机制、按预算带匹配礼品方向、整理同款比价与供应商沟通要点；活动结束做客诉排查、KPI 汇总、波动归因、达成率复盘。给可直接抄走的清单和问题，不替你联系供应商 / 不替你下单。',
      expertDomains: ['event_planning', 'gift_sourcing', 'operations'],
      character: buildEventGiftPlannerCharacter(),
    },
    {
      presetKey: REPORTING_PPT_DESIGNER_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: REPORTING_PPT_DESIGNER_CHARACTER_ID,
      name: '汇报与PPT策划师',
      avatar: getCharacterAvatarBySourceKey(REPORTING_PPT_DESIGNER_SOURCE_KEY),
      relationship: '帮你把零散素材理成结构、把汇报讲成一条主线的人',
      description:
        '汇报和 PPT 结构 / 叙事专家。月报年报 / 立项 / 来年规划 / 问卷报告的结构搭建、每页放什么、用哪类图表、怎么把中心论点撑起来。给的是页面级清单和叙事主线，不直接吐 .pptx 文件。',
      expertDomains: ['presentation', 'reporting', 'storytelling'],
      character: buildReportingPptDesignerCharacter(),
    },
    {
      presetKey: INFO_EXTRACTION_SPECIALIST_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: INFO_EXTRACTION_SPECIALIST_CHARACTER_ID,
      name: '信息提取专家',
      avatar: getCharacterAvatarBySourceKey(
        INFO_EXTRACTION_SPECIALIST_SOURCE_KEY,
      ),
      relationship: '帮你把一堆截图、图片和聊天记录里的关键信息抠出来、理成表的人',
      description:
        '批量信息提取 / OCR / 数据聚合的方法专家。设计字段表与校验规则、组织聊天记录的关键词检索 / 导出、多平台商品聚合比价的去重和归一思路。给方案与字段定义，不替你跑 OCR / 不替你抓数据。',
      expertDomains: ['data_extraction', 'ocr', 'document'],
      character: buildInfoExtractionSpecialistCharacter(),
    },
    {
      presetKey: KNOWLEDGE_BASE_ENGINEER_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: KNOWLEDGE_BASE_ENGINEER_CHARACTER_ID,
      name: '知识库与RAG工程师',
      avatar: getCharacterAvatarBySourceKey(KNOWLEDGE_BASE_ENGINEER_SOURCE_KEY),
      relationship: '帮你把一堆文档变成能被检索、能问答的知识库的人',
      description:
        '文档解析 / 切块策略 / 向量化入库 / 检索增强（RAG）召回与重排序工程师。讲架构选型、参数和评测口径（如 Milvus、阿里云百炼 RAG），不替你跑入库脚本。',
      expertDomains: ['knowledge_base', 'rag', 'data_engineering'],
      character: buildKnowledgeBaseEngineerCharacter(),
    },
    {
      presetKey: DELIVERY_OPS_MANAGER_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: DELIVERY_OPS_MANAGER_CHARACTER_ID,
      name: '项目交付与运营经理',
      avatar: getCharacterAvatarBySourceKey(DELIVERY_OPS_MANAGER_SOURCE_KEY),
      relationship: '帮你把交付项目、对账和日报这些杂事捋成能跑下去的流程的人',
      description:
        '交付 / 运营项目管理。设计项目套表（一处录入→自动联动→合计校验→导出）、费用与账单对账口径、固定模板日报和多轮跟进外呼的统计结构。给流程、表结构、核对逻辑与节奏管理，不替你写 Excel 公式 / 不替你做最终对账定案。',
      expertDomains: ['project_management', 'delivery', 'operations'],
      character: buildDeliveryOpsManagerCharacter(),
    },
    {
      presetKey: AUTOMATION_RPA_ENGINEER_SOURCE_KEY,
      groupKey: 'workplace_and_operations',
      autoSeed: false,
      id: AUTOMATION_RPA_ENGINEER_CHARACTER_ID,
      name: '自动化与RPA工程师',
      avatar: getCharacterAvatarBySourceKey(AUTOMATION_RPA_ENGINEER_SOURCE_KEY),
      relationship: '帮你判断一件重复的事能不能、该不该自动化，怎么搭最稳的人',
      description:
        '浏览器 / 桌面 / 移动端自动化与 RPA 方案设计。判断重复流程能否自动化、技术路线选型（RPA vs API vs 人工）、稳定性与反爬 / 账号风控 / 合规边界。做可行性判断和方案设计，绝不替你操作账号 / 绝不替你执行脚本。',
      expertDomains: ['automation', 'rpa', 'browser'],
      character: buildAutomationRpaEngineerCharacter(),
    },
  ];
// i18n-ignore-end
