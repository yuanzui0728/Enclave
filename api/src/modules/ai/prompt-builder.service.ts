import { Injectable } from '@nestjs/common';
import { PersonalityProfile } from './ai.types';
import { ReplyLogicRulesService } from './reply-logic-rules.service';
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
    | 'identity'
    | 'personality_and_tone'
    | 'behavioral_patterns'
    | 'cognitive_boundaries'
    | 'internal_reasoning'
    | 'collaboration_routing'
    | 'memory'
    | 'current_context'
    | 'group_chat'
    | 'rules';
  label: string;
  content: string;
  active: boolean;
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

@Injectable()
export class PromptBuilderService {
  constructor(private readonly replyLogicRules: ReplyLogicRulesService) {}

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

  async buildChatSystemPrompt(
    profile: PersonalityProfile,
    isGroupChat = false,
    context?: ChatContext,
  ): Promise<string> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const sections = this.buildChatSystemPromptSectionsFromTemplates(
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

  async buildMomentPrompt(
    profile: PersonalityProfile,
    currentTime: Date,
    recentTopics: string[] = [],
  ): Promise<string> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const templates = runtimeRules.promptTemplates;
    const hour = currentTime.getHours();
    const timeOfDay = this.resolveTimeOfDayLabel(
      hour,
      runtimeRules.semanticLabels,
    );
    const dayOfWeek =
      runtimeRules.semanticLabels.weekdayLabels[currentTime.getDay()] ??
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
      clockTime: currentTime.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      topicsHint,
    });

    if (profile.coreDirective?.trim()) {
      return `[行动纲领]\n${profile.coreDirective.trim()}\n\n${momentBody}`;
    }
    return momentBody;
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
    return renderTemplate(templates.memoryCompressionPrompt, {
      name: profile.name,
      chatHistory,
    });
  }

  private buildChatSystemPromptSectionsFromTemplates(
    profile: PersonalityProfile,
    templates: ReplyLogicPromptTemplates,
    semanticLabels: ReplyLogicSemanticLabels,
    isGroupChat: boolean,
    context?: ChatContext,
  ): ChatSystemPromptSection[] {
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
      const { occupation, background, motivation, worldview } = profile.identity;
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
      { short: '简短', medium: '适中', long: '详细' }[traits.responseLength] ?? '适中'
    }`;
    personalitySection += `\nEmoji使用：${
      { none: '不用', occasional: '偶尔', frequent: '频繁' }[traits.emojiUsage] ??
      '偶尔'
    }`;
    personalitySection += `\n</personality_and_tone>`;

    let behaviorSection = '';
    if (profile.behavioralPatterns) {
      const { workStyle, socialStyle, taboos, quirks } = profile.behavioralPatterns;
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

    const coreMemory = profile.memory?.coreMemory || '';
    const recentSummary =
      profile.memory?.recentSummary || profile.memorySummary || '';
    let memorySection = `<memory>`;
    if (coreMemory) {
      memorySection += `\n【你对用户的长期了解（核心记忆，始终牢记）】\n${coreMemory}`;
    }
    if (recentSummary) {
      memorySection += `\n【你最近的印象（近期摘要）】\n${recentSummary}`;
    }
    if (!coreMemory && !recentSummary) {
      memorySection += `\n${templates.emptyMemory}`;
    }
    memorySection += `\n</memory>`;

    let currentContextSection = '';
    if (context) {
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      const activityDesc = context.currentActivity
        ? semanticLabels.activityLabels[
            context.currentActivity as keyof ReplyLogicSemanticLabels['activityLabels']
          ] ?? semanticLabels.activityLabels.free
        : semanticLabels.activityLabels.free;

      let timeSinceLastChat = '';
      if (context.lastChatAt) {
        const diffMs = now.getTime() - context.lastChatAt.getTime();
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
- 现实时间：${timeStr}
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
      currentTime: new Date().toLocaleString('zh-CN'),
    });
    const rulesSection = `<rules>\n${rulesBody}\n</rules>`;

    return [
      {
        key: 'core_directive',
        label: 'Core Directive',
        content: `<core_directive>\n${profile.coreDirective}\n</core_directive>`,
        active: Boolean(profile.coreDirective?.trim()),
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
}
