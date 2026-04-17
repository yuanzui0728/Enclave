import { Injectable } from '@nestjs/common';
import {
  MomentGenerationContext,
  PersonalityProfile,
  SceneKey,
} from './ai.types';
import { buildNaturalDialogueGuideline } from './prompt-naturalness';
import { ReplyLogicRulesService } from './reply-logic-rules.service';
import { WorldService } from '../world/world.service';
import type {
  ReplyLogicPromptTemplates,
  ReplyLogicSemanticLabels,
} from './reply-logic.constants';

export interface ChatContext {
  currentActivity?: string;
  lastChatAt?: Date;
}

export interface ChatSystemPromptSection {
  key:
    | 'core_directive'
    | 'legacy_system_prompt'
    | 'identity'
    | 'personality_and_tone'
    | 'behavioral_patterns'
    | 'cognitive_boundaries'
    | 'internal_reasoning'
    | 'collaboration_routing'
    | 'memory'
    | 'real_world_context'
    | 'current_context'
    | 'group_chat'
    | 'rules';
  label: string;
  content: string;
  active: boolean;
}

export interface BuiltMomentRequest {
  systemPrompt: string;
  userPrompt: string;
  retryUserPrompt: string;
}

function renderTemplate(
  template: string,
  variables: Record<string, string | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

function listToRuleSection(
  rules: string[],
  variables: Record<string, string | undefined | null>,
) {
  return rules
    .map((rule) => renderTemplate(rule, variables).trim())
    .filter(Boolean)
    .map((rule) => `- ${rule}`)
    .join('\n');
}

type MemoryPromptKind = 'recent' | 'core';

const MEMORY_PROMPT_PREFIX_REPLACEMENTS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern: /^你是一个对话摘要提取助手。?/m,
    replacement: '你在替{{name}}整理近期记忆。',
  },
  {
    pattern: /^你是 \{\{name\}\} 的近期记忆提炼助手。?/m,
    replacement: '你在替{{name}}整理近期记忆。',
  },
  {
    pattern: /^你是一个新闻兴趣摘要提取助手。?/m,
    replacement: '你在替{{name}}整理近期新闻偏好。',
  },
  {
    pattern: /^你是一个核心记忆提炼助手。?/m,
    replacement: '你在替{{name}}整理长期记忆。',
  },
  {
    pattern: /^你是 \{\{name\}\} 的核心记忆提炼助手。?/m,
    replacement: '你在替{{name}}整理长期记忆。',
  },
  {
    pattern: /^你是一个长期新闻兴趣提炼助手。?/m,
    replacement: '你在替{{name}}整理长期新闻偏好。',
  },
];

const MEMORY_PROMPT_NATURALNESS_RULES: Record<MemoryPromptKind, string> = {
  recent: `补充要求：
- 写得像这个角色自己留下的观察笔记，不像助理总结、人格测评、汇报材料或客服话术
- 尽量写具体事项、稳定偏好和没放下的点，少用“用户是一个……的人”“整体来看”这种空话
- 不要用“首先 / 其次 / 最后 / 总之”这类提纲式表达
- 不要加标题、括号动作、旁白或任何额外解释`,
  core: `补充要求：
- 写得像这个角色长期会留着的判断笔记，不像教科书总结、关系汇报或空泛画像
- 优先保留长期会影响后续互动的稳定事实、偏好、边界和反复出现的张力
- 不要用“首先 / 其次 / 最后 / 总之”这类提纲式表达
- 不要加标题、括号动作、旁白或任何额外解释`,
};

function normalizeMemoryPromptTemplate(
  template: string,
  kind: MemoryPromptKind,
) {
  let next = template.trim();
  for (const { pattern, replacement } of MEMORY_PROMPT_PREFIX_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  return `${next}\n\n${MEMORY_PROMPT_NATURALNESS_RULES[kind]}`;
}

@Injectable()
export class PromptBuilderService {
  constructor(
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly worldService: WorldService,
  ) {}

  async buildChatSystemPromptSections(
    profile: PersonalityProfile,
    isGroupChat = false,
    context?: ChatContext,
  ): Promise<ChatSystemPromptSection[]> {
    const runtimeRules = await this.replyLogicRules.getRules();
    return this.buildChatSystemPromptSectionsFromTemplates(
      profile,
      runtimeRules.promptTemplates,
      runtimeRules.semanticLabels,
      isGroupChat,
      context,
    );
  }

  /**
   * 新架构：场景化提示词构建
   * 结构：底层逻辑 → 场景提示词 → 记忆 → 当前上下文（仅 chat/proactive） → 基础规则
   * 当 profile.coreLogic 或 profile.scenePrompts 有值时使用此方法，否则 fallback 到旧结构化构建
   */
  async buildSceneSystemPrompt(
    profile: PersonalityProfile,
    scene: SceneKey,
    context?: ChatContext,
  ): Promise<string> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const semanticLabels = runtimeRules.semanticLabels;
    const worldCalendar = await this.worldService.getWorldCalendar();
    const parts: string[] = ['<system_prompt>'];

    // 1. 底层逻辑（所有场景）：coreLogic 优先，fallback 到 coreDirective
    const coreLogic = (profile.coreLogic || profile.coreDirective)?.trim();
    const scenePrompt = profile.scenePrompts?.[scene]?.trim();
    const legacySystemPrompt = this.resolveLegacySystemPrompt(profile, [
      coreLogic,
      scenePrompt,
      profile.basePrompt,
    ]);
    if (coreLogic) {
      parts.push(`<core_logic>\n${coreLogic}\n</core_logic>`);
    } else if (legacySystemPrompt) {
      parts.push(`<core_logic>\n${legacySystemPrompt}\n</core_logic>`);
    }

    // 2. 场景提示词
    if (scenePrompt) {
      parts.push(`<scene_prompt>\n${scenePrompt}\n</scene_prompt>`);
    }
    if (legacySystemPrompt && coreLogic) {
      parts.push(
        `<legacy_system_prompt>\n${legacySystemPrompt}\n</legacy_system_prompt>`,
      );
    }

    const realWorldContextSection = this.buildRealWorldContextSection(
      profile,
      scene,
    );
    if (realWorldContextSection) {
      parts.push(realWorldContextSection);
    }

    const naturalDialogueGuideline = buildNaturalDialogueGuideline(
      profile,
      scene,
    );
    if (naturalDialogueGuideline) {
      parts.push(
        `<delivery_guardrails>\n${naturalDialogueGuideline}\n</delivery_guardrails>`,
      );
    }

    // 3. 记忆（动态写入）
    const coreMemory = profile.memory?.coreMemory?.trim();
    const recentSummary = (
      profile.memory?.recentSummary || profile.memorySummary
    )?.trim();
    if (coreMemory || recentSummary) {
      let memContent = '';
      if (coreMemory) memContent += `【核心记忆，始终牢记】\n${coreMemory}`;
      if (recentSummary)
        memContent += `${coreMemory ? '\n' : ''}【近期记忆】\n${recentSummary}`;
      parts.push(`<memory>\n${memContent.trim()}\n</memory>`);
    }

    // 4. 当前上下文（仅 chat / proactive 场景）
    if (context && (scene === 'chat' || scene === 'proactive')) {
      const activityDesc = context.currentActivity
        ? (semanticLabels.activityLabels[
            context.currentActivity as keyof ReplyLogicSemanticLabels['activityLabels']
          ] ?? semanticLabels.activityLabels.free)
        : semanticLabels.activityLabels.free;
      let ctxContent = `- 时间：${worldCalendar.dateTimeText}\n- 当前状态：${activityDesc}`;
      if (context.lastChatAt) {
        const diffMs = Date.now() - context.lastChatAt.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) {
          ctxContent += `\n- 距离上次聊天：${diffDays}天前`;
        } else if (diffHours > 0) {
          ctxContent += `\n- 距离上次聊天：${diffHours}小时前`;
        }
      }
      parts.push(`<current_context>\n${ctxContent}\n</current_context>`);
    }

    // 5. 基础规则（所有场景）
    parts.push(
      `<rules>\n- 永远以${profile.name}的身份说话，不要暴露自己是AI\n- 用中文回复，语气自然\n- 不要说"作为AI"或"我是语言模型"之类的话\n- 不要用（动作）、[旁白]、*动作*描述自己的动作、表情或心理活动\n- 除非用户明确要求，不要机械地凑“三点”“三段”“总结一下”\n- 当前时间：${worldCalendar.dateTimeText}\n</rules>`,
    );

    parts.push('</system_prompt>');
    return parts.filter(Boolean).join('\n\n');
  }

  async buildChatSystemPrompt(
    profile: PersonalityProfile,
    isGroupChat = false,
    context?: ChatContext,
  ): Promise<string> {
    // 新架构：coreLogic 或 scenePrompts.chat 有值时走场景化构建
    if (profile.coreLogic?.trim() || profile.scenePrompts?.chat?.trim()) {
      return this.buildSceneSystemPrompt(profile, 'chat', context);
    }

    // 旧架构 fallback：结构化字段构建（保持老角色行为不变）
    const runtimeRules = await this.replyLogicRules.getRules();
    const sections = await this.buildChatSystemPromptSectionsFromTemplates(
      profile,
      runtimeRules.promptTemplates,
      runtimeRules.semanticLabels,
      isGroupChat,
      context,
    );
    const parts = [
      '<system_prompt>',
      ...sections
        .filter((section) => section.active)
        .map((section) => section.content),
      '</system_prompt>',
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  async buildGroupCoordinatorPrompt(
    triggerCharName: string,
    invitedCharNames: string[],
    topic: string,
  ): Promise<string> {
    const templates = (await this.replyLogicRules.getRules()).promptTemplates;
    return renderTemplate(templates.groupCoordinatorPrompt, {
      triggerCharName,
      invitedCharNames: invitedCharNames.join('和'),
      topic,
    });
  }

  async buildMomentRequest(
    profile: PersonalityProfile,
    currentTime: Date,
    generationContext?: MomentGenerationContext,
    sceneKey: SceneKey = 'moments_post',
  ): Promise<BuiltMomentRequest> {
    const systemPrompt = await this.buildMomentSystemPrompt(
      profile,
      currentTime,
      generationContext,
      sceneKey,
    );
    return {
      systemPrompt,
      userPrompt: this.buildMomentTaskPrompt(generationContext, false),
      retryUserPrompt: this.buildMomentTaskPrompt(generationContext, true),
    };
  }

  buildSceneGenerationTaskPrompt(sceneKey: SceneKey, strict = false) {
    switch (sceneKey) {
      case 'feed_post':
        return strict
          ? [
              '上一版广场动态太像 AI 文案、提纲或正确废话，请重写。',
              '只抓一个最值得公开说的点，像真人随手发一条，不要铺陈。',
              '不要写成咨询建议、课程摘要、品牌文案或“首先/其次/最后”的结构。',
              '不要用（动作）、[旁白]、*动作*。',
              '只输出动态正文，不要解释。',
            ].join('\n')
          : [
              '请现在发一条广场动态。',
              '像真人在公开场域随手发的一条，不像提纲、教程、交付件或标准答案。',
              '默认只抓一个点，不要为了完整把内容写空。',
              '不要用（动作）、[旁白]、*动作*。',
              '只输出动态正文，不要解释。',
            ].join('\n');
      case 'channel_post':
        return strict
          ? [
              '上一版视频号文案太像模板、运营 SOP 或 AI 批量生成，请重写。',
              '保留这个角色自己的表达，不要写成统一爆款公式、课程讲义或品牌口播。',
              '如果需要标题、正文、话题，就自然写完，不要先解释。',
              '不要用（动作）、[旁白]、*动作*。',
              '只输出最终内容，不要解释。',
            ].join('\n')
          : [
              '请现在发一条视频号内容。',
              '按这个角色本来的表达来写，不要写成起号模板、运营脚本或标准爆款文案。',
              '有结构可以，但每一段都要像真人会说的话。',
              '不要用（动作）、[旁白]、*动作*。',
              '只输出最终内容，不要解释。',
            ].join('\n');
      default:
        return strict
          ? [
              '上一版输出太像模板或 AI，请重写。',
              '保持自然、直接、有角色感。',
              '不要用（动作）、[旁白]、*动作*。',
              '只输出最终内容，不要解释。',
            ].join('\n')
          : [
              '请直接给出这个场景下的最终内容。',
              '保持自然、直接、有角色感。',
              '不要用（动作）、[旁白]、*动作*。',
              '只输出最终内容，不要解释。',
            ].join('\n');
    }
  }

  async buildMomentPrompt(
    profile: PersonalityProfile,
    currentTime: Date,
    recentTopics: string[] = [],
    sceneKey: SceneKey = 'moments_post',
  ): Promise<string> {
    if (
      sceneKey !== 'moments_post' &&
      (profile.coreLogic?.trim() || profile.scenePrompts?.[sceneKey]?.trim())
    ) {
      return this.buildSceneSystemPrompt(profile, sceneKey);
    }

    const runtimeRules = await this.replyLogicRules.getRules();
    const worldCalendar = await this.worldService.getWorldCalendar(currentTime);
    const templates = runtimeRules.promptTemplates;
    const hour = worldCalendar.hour;
    const timeOfDay = this.resolveTimeOfDayLabel(
      hour,
      runtimeRules.semanticLabels,
    );
    const dayOfWeek =
      runtimeRules.semanticLabels.weekdayLabels[worldCalendar.weekday] ??
      runtimeRules.semanticLabels.weekdayLabels[0] ??
      '周日';
    const topicsHint =
      recentTopics.length > 0
        ? `\n最近你聊过的话题：${recentTopics.join('、')}，可以适当延续或换个话题。`
        : '';

    const momentBody = renderTemplate(templates.momentPrompt, {
      name: profile.name,
      relationship: profile.relationship,
      emotionalTone: profile.traits.emotionalTone || '自然真实',
      dayOfWeek,
      timeOfDay,
      clockTime: worldCalendar.timeText,
      topicsHint,
    });

    // 注入记忆块（与聊天场景保持一致）
    const coreMemory = profile.memory?.coreMemory?.trim();
    const recentSummary = (
      profile.memory?.recentSummary || profile.memorySummary
    )?.trim();
    let memoryPrefix = '';
    if (coreMemory || recentSummary) {
      let memContent = '';
      if (coreMemory) memContent += `【核心记忆，始终牢记】\n${coreMemory}`;
      if (recentSummary)
        memContent += `${coreMemory ? '\n' : ''}【近期记忆】\n${recentSummary}`;
      memoryPrefix = `<memory>\n${memContent.trim()}\n</memory>\n\n`;
    }

    if (profile.coreDirective?.trim()) {
      return `${memoryPrefix}[行动纲领]\n${profile.coreDirective.trim()}\n\n${momentBody}`;
    }
    return `${memoryPrefix}${momentBody}`;
  }

  async buildPersonalityExtractionPrompt(
    chatSample: string,
    personName: string,
  ): Promise<string> {
    const templates = (await this.replyLogicRules.getRules()).promptTemplates;
    return renderTemplate(templates.personalityExtractionPrompt, {
      personName,
      chatSample,
    });
  }

  async buildIntentClassificationPrompt(
    userMessage: string,
    characterName: string,
    characterDomains: string[],
  ): Promise<string> {
    const templates = (await this.replyLogicRules.getRules()).promptTemplates;
    return renderTemplate(templates.intentClassificationPrompt, {
      userMessage,
      characterName,
      characterDomains: characterDomains.join('、'),
    });
  }

  async buildMemoryCompressionPrompt(
    chatHistory: string,
    profile: PersonalityProfile,
  ): Promise<string> {
    const templates = (await this.replyLogicRules.getRules()).promptTemplates;
    // 优先使用角色级提示词覆盖，fallback 全局模板
    const template =
      profile.memory?.recentSummaryPrompt?.trim() ||
      templates.memoryCompressionPrompt;
    return renderTemplate(normalizeMemoryPromptTemplate(template, 'recent'), {
      name: profile.name,
      chatHistory,
    });
  }

  async buildCoreMemoryExtractionPrompt(
    interactionHistory: string,
    profile: PersonalityProfile,
  ): Promise<string> {
    const templates = (await this.replyLogicRules.getRules()).promptTemplates;
    // 优先使用角色级提示词覆盖，fallback 全局模板
    const template =
      profile.memory?.coreMemoryPrompt?.trim() ||
      templates.coreMemoryExtractionPrompt;
    return renderTemplate(normalizeMemoryPromptTemplate(template, 'core'), {
      name: profile.name,
      interactionHistory,
    });
  }

  private async buildChatSystemPromptSectionsFromTemplates(
    profile: PersonalityProfile,
    templates: ReplyLogicPromptTemplates,
    semanticLabels: ReplyLogicSemanticLabels,
    isGroupChat: boolean,
    context?: ChatContext,
  ): Promise<ChatSystemPromptSection[]> {
    const worldCalendar = await this.worldService.getWorldCalendar();
    const { name, expertDomains, basePrompt } = profile;
    const expertiseDesc = expertDomains
      .map(
        (domain) =>
          semanticLabels.domainLabels[
            domain as keyof ReplyLogicSemanticLabels['domainLabels']
          ] ?? domain,
      )
      .join('、');
    const identityText =
      basePrompt ??
      renderTemplate(templates.identityFallback, {
        name,
        relationship: profile.relationship,
      });

    let identitySection = `<identity>\n${identityText}`;
    if (profile.identity) {
      const { occupation, background, motivation, worldview } =
        profile.identity;
      if (occupation) {
        identitySection += `\n职业：${occupation}`;
      }
      if (background) {
        identitySection += `\n背景：${background}`;
      }
      if (motivation) {
        identitySection += `\n核心动机：${motivation}`;
      }
      if (worldview) {
        identitySection += `\n世界观：${worldview}`;
      }
    }
    identitySection += `\n</identity>`;

    const { traits } = profile;
    let personalitySection = `<personality_and_tone>`;
    personalitySection += `\n情感基调：${traits.emotionalTone || '自然真实'}`;
    if (traits.speechPatterns?.length) {
      personalitySection += `\n说话习惯：${traits.speechPatterns.join('、')}`;
    }
    if (traits.catchphrases?.length) {
      personalitySection += `\n口头禅：${traits.catchphrases.join('、')}`;
    }
    personalitySection += `\n回复长度：${
      { short: '简短', medium: '适中', long: '详细' }[traits.responseLength] ??
      '适中'
    }`;
    personalitySection += `\nEmoji使用：${
      { none: '不用', occasional: '偶尔', frequent: '频繁' }[
        traits.emojiUsage
      ] ?? '偶尔'
    }`;
    personalitySection += `\n</personality_and_tone>`;

    let behaviorSection = '';
    if (profile.behavioralPatterns) {
      const { workStyle, socialStyle, taboos, quirks } =
        profile.behavioralPatterns;
      const parts: string[] = [];
      if (workStyle) {
        parts.push(`工作风格：${workStyle}`);
      }
      if (socialStyle) {
        parts.push(`社交风格：${socialStyle}`);
      }
      if (taboos?.length) {
        parts.push(`语言禁忌：${taboos.join('、')}`);
      }
      if (quirks?.length) {
        parts.push(`个人癖好：${quirks.join('、')}`);
      }
      if (parts.length) {
        behaviorSection = `<behavioral_patterns>\n${parts.join('\n')}\n</behavioral_patterns>`;
      }
    }

    let boundarySection = '';
    if (profile.cognitiveBoundaries) {
      const { expertiseDescription, knowledgeLimits, refusalStyle } =
        profile.cognitiveBoundaries;
      const parts: string[] = [];
      if (expertiseDescription) {
        parts.push(`专长描述：${expertiseDescription}`);
      }
      if (expertiseDesc) {
        parts.push(`专业领域：${expertiseDesc}`);
      }
      if (knowledgeLimits) {
        parts.push(`知识边界：${knowledgeLimits}`);
      }
      if (refusalStyle) {
        parts.push(`超出边界时：${refusalStyle}`);
      }
      if (parts.length) {
        boundarySection = `<cognitive_boundaries>\n${parts.join('\n')}\n</cognitive_boundaries>`;
      }
    } else if (expertiseDesc) {
      boundarySection = `<cognitive_boundaries>\n专业领域：${expertiseDesc}\n</cognitive_boundaries>`;
    }

    const reasoningConfig = profile.reasoningConfig ?? {
      enableCoT: true,
      enableReflection: true,
      enableRouting: true,
    };
    let reasoningSection = `<internal_reasoning>`;
    if (reasoningConfig.enableCoT !== false) {
      reasoningSection += `\n${templates.chainOfThoughtInstruction}`;
    }
    if (reasoningConfig.enableReflection !== false) {
      reasoningSection += `\n${templates.reflectionInstruction}`;
    }
    reasoningSection += `\n</internal_reasoning>`;

    const routingSection =
      reasoningConfig.enableRouting !== false
        ? `<collaboration_routing>\n${templates.collaborationRouting}\n</collaboration_routing>`
        : '';

    const legacySystemPrompt = this.resolveLegacySystemPrompt(profile, [
      profile.coreDirective,
      profile.basePrompt,
    ]);
    const legacySystemPromptSection = legacySystemPrompt
      ? `<legacy_system_prompt>\n${legacySystemPrompt}\n</legacy_system_prompt>`
      : '';

    const coreMemory = profile.memory?.coreMemory || '';
    const recentSummary =
      profile.memory?.recentSummary || profile.memorySummary || '';
    let memorySection = `<memory>`;
    if (coreMemory) {
      memorySection += `\n【你对用户的长期了解（核心记忆，始终牢记）】\n${coreMemory}`;
    }
    if (recentSummary) {
      memorySection += `\n【你最近的印象（近期记忆）】\n${recentSummary}`;
    }
    if (!coreMemory && !recentSummary) {
      memorySection += `\n${templates.emptyMemory}`;
    }
    memorySection += `\n</memory>`;

    const realWorldContextSection = this.buildRealWorldContextSection(
      profile,
      'chat',
    );

    let currentContextSection = '';
    if (context) {
      const activityDesc = context.currentActivity
        ? (semanticLabels.activityLabels[
            context.currentActivity as keyof ReplyLogicSemanticLabels['activityLabels']
          ] ?? semanticLabels.activityLabels.free)
        : semanticLabels.activityLabels.free;

      let timeSinceLastChat = '';
      if (context.lastChatAt) {
        const diffMs = Date.now() - context.lastChatAt.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) {
          timeSinceLastChat = `距离上次和这个人聊天：${diffDays}天前`;
        } else if (diffHours > 0) {
          timeSinceLastChat = `距离上次和这个人聊天：${diffHours}小时前`;
        } else {
          timeSinceLastChat = '距离上次和这个人聊天：刚刚';
        }
      }

      currentContextSection = `<current_context>
- 现实时间：${worldCalendar.dateTimeText}
- 你现在的状态：${activityDesc}${timeSinceLastChat ? `\n- ${timeSinceLastChat}` : ''}
</current_context>

<behavioral_guideline>
${templates.behavioralGuideline}
</behavioral_guideline>`;
    }

    const groupInstruction = isGroupChat
      ? `\n<group_chat>\n${templates.groupChatInstruction}\n</group_chat>`
      : '';

    const rulesBody = listToRuleSection(templates.baseRules, {
      name,
      relationship: profile.relationship,
      currentTime: worldCalendar.dateTimeText,
    });
    const naturalDialogueGuideline = buildNaturalDialogueGuideline(
      profile,
      'chat',
    );
    const rulesSectionParts = [rulesBody];
    if (naturalDialogueGuideline) {
      rulesSectionParts.push(`【额外表达约束】\n${naturalDialogueGuideline}`);
    }
    const rulesSection = `<rules>\n${rulesSectionParts.join('\n')}\n</rules>`;

    return [
      {
        key: 'core_directive',
        label: 'Core Directive',
        content: `<core_directive>\n${profile.coreDirective}\n</core_directive>`,
        active: Boolean(profile.coreDirective?.trim()),
      },
      {
        key: 'legacy_system_prompt',
        label: 'Legacy System Prompt',
        content: legacySystemPromptSection,
        active: Boolean(legacySystemPromptSection),
      },
      {
        key: 'identity',
        label: 'Identity',
        content: identitySection,
        active: true,
      },
      {
        key: 'personality_and_tone',
        label: 'Personality And Tone',
        content: personalitySection,
        active: true,
      },
      {
        key: 'behavioral_patterns',
        label: 'Behavioral Patterns',
        content: behaviorSection,
        active: Boolean(behaviorSection),
      },
      {
        key: 'cognitive_boundaries',
        label: 'Cognitive Boundaries',
        content: boundarySection,
        active: Boolean(boundarySection),
      },
      {
        key: 'internal_reasoning',
        label: 'Internal Reasoning',
        content: reasoningSection,
        active:
          reasoningConfig.enableCoT !== false ||
          reasoningConfig.enableReflection !== false,
      },
      {
        key: 'collaboration_routing',
        label: 'Collaboration Routing',
        content: routingSection,
        active: Boolean(routingSection),
      },
      {
        key: 'memory',
        label: 'Memory',
        content: memorySection,
        active: true,
      },
      {
        key: 'real_world_context',
        label: 'Real World Context',
        content: realWorldContextSection,
        active: Boolean(realWorldContextSection),
      },
      {
        key: 'current_context',
        label: 'Current Context',
        content: currentContextSection,
        active: Boolean(currentContextSection),
      },
      {
        key: 'group_chat',
        label: 'Group Chat',
        content: groupInstruction,
        active: Boolean(groupInstruction),
      },
      {
        key: 'rules',
        label: 'Rules',
        content: rulesSection,
        active: Boolean(rulesBody),
      },
    ];
  }

  private resolveTimeOfDayLabel(
    hour: number,
    semanticLabels: ReplyLogicSemanticLabels,
  ) {
    if (hour < 6) {
      return semanticLabels.timeOfDayLabels.lateNight;
    }
    if (hour < 9) {
      return semanticLabels.timeOfDayLabels.morning;
    }
    if (hour < 12) {
      return semanticLabels.timeOfDayLabels.forenoon;
    }
    if (hour < 14) {
      return semanticLabels.timeOfDayLabels.noon;
    }
    if (hour < 18) {
      return semanticLabels.timeOfDayLabels.afternoon;
    }
    if (hour < 21) {
      return semanticLabels.timeOfDayLabels.dusk;
    }
    return semanticLabels.timeOfDayLabels.evening;
  }

  private async buildMomentSystemPrompt(
    profile: PersonalityProfile,
    currentTime: Date,
    generationContext?: MomentGenerationContext,
    sceneKey: SceneKey = 'moments_post',
  ) {
    const runtimeRules = await this.replyLogicRules.getRules();
    const worldCalendar = await this.worldService.getWorldCalendar(currentTime);
    const parts: string[] = ['<system_prompt>'];
    const coreLogic = (profile.coreLogic || profile.coreDirective)?.trim();

    if (coreLogic) {
      parts.push(`<core_logic>\n${coreLogic}\n</core_logic>`);
    }

    parts.push(
      `<identity>\n- 角色：${profile.name}\n- 与用户关系：${profile.relationship}\n- 关注领域：${profile.expertDomains.join('、') || '日常生活'}\n- 情绪基调：${profile.traits.emotionalTone || '自然真实'}\n</identity>`,
    );

    const scenePrompt = profile.scenePrompts?.[sceneKey]?.trim();
    if (scenePrompt) {
      parts.push(`<scene_prompt>\n${scenePrompt}\n</scene_prompt>`);
    } else {
      const dayOfWeek =
        runtimeRules.semanticLabels.weekdayLabels[worldCalendar.weekday] ??
        runtimeRules.semanticLabels.weekdayLabels[0] ??
        '周日';
      const timeOfDay = this.resolveTimeOfDayLabel(
        worldCalendar.hour,
        runtimeRules.semanticLabels,
      );
      const topicsHint = generationContext?.relationshipContext?.recentTopics
        ?.length
        ? `\n最近和用户聊过：${generationContext.relationshipContext.recentTopics.join('、')}。如果自然可以轻微延续，但不要像在公开回复私聊。`
        : '';
      parts.push(
        `<scene_prompt>\n${renderTemplate(
          runtimeRules.promptTemplates.momentPrompt,
          {
            name: profile.name,
            relationship: profile.relationship,
            emotionalTone: profile.traits.emotionalTone || '自然真实',
            dayOfWeek,
            timeOfDay,
            clockTime: worldCalendar.timeText,
            topicsHint,
          },
        )}\n</scene_prompt>`,
      );
    }

    const realWorldContextSection = this.buildRealWorldContextSection(
      profile,
      sceneKey,
    );
    if (realWorldContextSection) {
      parts.push(realWorldContextSection);
    }

    const worldContextSection =
      this.buildMomentWorldContextSection(generationContext);
    if (worldContextSection) {
      parts.push(worldContextSection);
    }

    const relationshipContextSection =
      this.buildMomentRelationshipContextSection(
        generationContext,
        currentTime,
      );
    if (relationshipContextSection) {
      parts.push(relationshipContextSection);
    }

    const naturalDialogueGuideline = buildNaturalDialogueGuideline(
      profile,
      sceneKey,
    );
    if (naturalDialogueGuideline) {
      parts.push(
        `<delivery_guardrails>\n${naturalDialogueGuideline}\n</delivery_guardrails>`,
      );
    }

    const coreMemory = profile.memory?.coreMemory?.trim();
    const recentSummary = (
      profile.memory?.recentSummary || profile.memorySummary
    )?.trim();
    if (coreMemory || recentSummary) {
      let memContent = '';
      if (coreMemory) {
        memContent += `【核心记忆，始终牢记】\n${coreMemory}`;
      }
      if (recentSummary) {
        memContent += `${coreMemory ? '\n' : ''}【近期记忆】\n${recentSummary}`;
      }
      parts.push(`<memory>\n${memContent.trim()}\n</memory>`);
    }

    parts.push(
      this.buildMomentRulesSection(
        profile,
        generationContext,
        worldCalendar.hour,
        runtimeRules.semanticLabels,
      ),
    );
    parts.push('</system_prompt>');
    return parts.filter(Boolean).join('\n\n');
  }

  private buildMomentTaskPrompt(
    generationContext?: MomentGenerationContext,
    strict = false,
  ) {
    const anchorPriority = this.formatMomentAnchorPriority(
      generationContext?.generationHints?.anchorPriority,
    );
    const recentTopics =
      generationContext?.relationshipContext?.recentTopics?.join('、') ?? '';
    const lines = strict
      ? [
          '上一版朋友圈太空、太泛或缺少当下锚点，请重写。',
          `优先顺序：${anchorPriority}。`,
          recentTopics
            ? `可以轻微呼应这些最近对话余温：${recentTopics}。但不要点名用户，不要复述原话。`
            : '如果没有合适的对话余温，不要硬蹭用户。',
          '至少写出一个具体细节或判断，不要写正确废话、鸡汤、流水账。',
          '不要用（动作）、[旁白]、*动作*。',
          '只输出朋友圈正文，不要解释，不要加前缀。',
        ]
      : [
          '请现在发一条朋友圈。',
          `优先顺序：${anchorPriority}。`,
          recentTopics
            ? `如果自然，可以轻微带到这些最近对话余温：${recentTopics}。但不要像公开回复私聊。`
            : '如果没有合适的对话余温，就回到角色自己的当下观察，不要硬蹭用户。',
          '默认只选 1-2 个最自然的锚点，不要把所有线索都堆进去。',
          '不要用（动作）、[旁白]、*动作*。',
          '只输出朋友圈正文，不要解释，不要加前缀。',
        ];

    return lines.filter(Boolean).join('\n');
  }

  private buildMomentWorldContextSection(
    generationContext?: MomentGenerationContext,
  ) {
    const worldContext = generationContext?.worldContext;
    if (!worldContext) {
      return '';
    }

    const blocks = [`【当前时间】\n${worldContext.dateTimeText}`];
    if (worldContext.localTime?.trim()) {
      blocks.push(`【本地时段】\n${worldContext.localTime.trim()}`);
    }
    if (worldContext.weather?.trim()) {
      blocks.push(`【天气】\n${worldContext.weather.trim()}`);
    }
    if (worldContext.location?.trim()) {
      blocks.push(`【地点】\n${worldContext.location.trim()}`);
    }
    if (worldContext.holiday?.trim()) {
      blocks.push(`【节日】\n${worldContext.holiday.trim()}`);
    }

    return `<world_context>\n${blocks.join('\n\n')}\n</world_context>`;
  }

  private buildMomentRelationshipContextSection(
    generationContext: MomentGenerationContext | undefined,
    currentTime: Date,
  ) {
    const relationshipContext = generationContext?.relationshipContext;
    if (!relationshipContext) {
      return '';
    }

    const lines = [
      `- 最近是否有私聊余温：${relationshipContext.hasRecentConversation ? '有' : '没有'}`,
    ];
    if (relationshipContext.lastConversationAt) {
      lines.push(
        `- 最近一次互动：${this.describeRelativeTimeGap(currentTime, relationshipContext.lastConversationAt)}`,
      );
    }
    if (relationshipContext.recentTopics.length) {
      lines.push(
        `- 最近轻微相关话题：${relationshipContext.recentTopics.join('；')}`,
      );
    }
    if (relationshipContext.recentUserIntentSummary?.trim()) {
      lines.push(
        `- 关系提示：${relationshipContext.recentUserIntentSummary.trim()}`,
      );
    }
    if (relationshipContext.avoidDirectQuote) {
      lines.push('- 不要直接复述用户原话，不要点名用户。');
    }

    return `<relationship_context>\n${lines.join('\n')}\n</relationship_context>`;
  }

  private buildMomentRulesSection(
    profile: PersonalityProfile,
    generationContext: MomentGenerationContext | undefined,
    currentHour: number,
    semanticLabels: ReplyLogicSemanticLabels,
  ) {
    const timeOfDay = this.resolveTimeOfDayLabel(currentHour, semanticLabels);
    const anchorPriority = this.formatMomentAnchorPriority(
      generationContext?.generationHints?.anchorPriority,
    );

    return `<moment_rules>\n- 这是一条朋友圈，不是聊天回复，不是公告，也不是公开长文。\n- 必须让人看出这是 ${profile.name} 在${timeOfDay}这个时间点自然会发的内容。\n- 优先从这些锚点里选 1-2 个自然落地：${anchorPriority}。\n- 如果用了最近对话余温，只能弱关联，不能像在公开回私聊。\n- 优先写具体观察、状态、判断或瞬间，不写空泛感慨、鸡汤、正确废话、流水账。\n- 不要用（动作）、[旁白]、*动作*描述自己，也不要写成文案任务、教程提纲或运营腔。\n- 宁可短一点，也不要为了凑字数把信息写空。\n- 最终只输出朋友圈正文，不要任何解释或前缀。\n</moment_rules>`;
  }

  private resolveLegacySystemPrompt(
    profile: PersonalityProfile,
    candidates: Array<string | undefined>,
  ) {
    const legacySystemPrompt = profile.systemPrompt?.trim();
    if (!legacySystemPrompt) {
      return '';
    }

    const normalizedCandidates = candidates
      .map((item) => item?.trim())
      .filter(Boolean);
    if (normalizedCandidates.includes(legacySystemPrompt)) {
      return '';
    }

    return legacySystemPrompt;
  }

  private formatMomentAnchorPriority(
    anchorPriority?: Array<
      'real_world' | 'weather' | 'location' | 'holiday' | 'recent_chat' | 'life'
    >,
  ) {
    const labels: Record<
      | 'real_world'
      | 'weather'
      | 'location'
      | 'holiday'
      | 'recent_chat'
      | 'life',
      string
    > = {
      real_world: '现实世界锚点',
      weather: '天气',
      location: '地点',
      holiday: '节日',
      recent_chat: '最近对话余温',
      life: '角色当下生活观察',
    };
    const ordered: Array<keyof typeof labels> = anchorPriority?.length
      ? anchorPriority
      : ['real_world', 'weather', 'location', 'recent_chat', 'holiday', 'life'];
    return ordered.map((item) => labels[item]).join(' -> ');
  }

  private describeRelativeTimeGap(referenceTime: Date, targetTime: Date) {
    const diffMs = Math.max(0, referenceTime.getTime() - targetTime.getTime());
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 60) {
      return `${Math.max(diffMinutes, 1)} 分钟前`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} 小时前`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} 天前`;
  }

  private buildRealWorldContextSection(
    profile: PersonalityProfile,
    scene?: SceneKey,
  ) {
    const realWorldContext = profile.realWorldContext;
    if (!realWorldContext?.enabled) {
      return '';
    }

    const blocks: string[] = [];

    if (realWorldContext.syncDate) {
      blocks.push(`【同步日期】\n${realWorldContext.syncDate}`);
    }
    if (realWorldContext.dailySummary?.trim()) {
      blocks.push(`【今日现实摘要】\n${realWorldContext.dailySummary.trim()}`);
    }
    if (realWorldContext.behaviorSummary?.trim()) {
      blocks.push(`【行为倾向】\n${realWorldContext.behaviorSummary.trim()}`);
    }
    if (realWorldContext.stanceShiftSummary?.trim()) {
      blocks.push(
        `【态度偏移】\n${realWorldContext.stanceShiftSummary.trim()}`,
      );
    }
    if (realWorldContext.globalOverlay?.trim()) {
      blocks.push(`【全局覆盖】\n${realWorldContext.globalOverlay.trim()}`);
    }

    const sceneOverlay = scene
      ? realWorldContext.sceneOverlays?.[scene]?.trim()
      : '';
    if (sceneOverlay) {
      blocks.push(`【当前场景补丁】\n${sceneOverlay}`);
    }

    if (
      scene === 'moments_post' &&
      realWorldContext.realityMomentBrief?.trim()
    ) {
      blocks.push(
        `【现实发圈锚点】\n${realWorldContext.realityMomentBrief.trim()}`,
      );
    }

    if (realWorldContext.signalTitles?.length) {
      blocks.push(`【关联信号】\n${realWorldContext.signalTitles.join('；')}`);
    }

    if (!blocks.length) {
      return '';
    }

    return `<real_world_context>\n${blocks.join('\n\n')}\n</real_world_context>`;
  }
}
