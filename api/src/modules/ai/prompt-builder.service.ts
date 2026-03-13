import { PersonalityProfile, GenerateReplyOptions, GenerateMomentOptions } from './ai.types';

export class PromptBuilderService {

  buildChatSystemPrompt(profile: PersonalityProfile, isGroupChat = false): string {
    const { name, expertDomains, basePrompt } = profile;

    const domainMap: Record<string, string> = {
      law: '法律、合同、劳动纠纷',
      medicine: '医疗健康、常见病、心理健康',
      finance: '理财投资、税务、财务规划',
      tech: '技术开发、产品设计、AI',
      psychology: '情绪疏导、人际关系、心理咨询',
      education: '教育辅导、学习方法',
      management: '职场管理、团队协作',
      general: '日常生活',
    };

    const expertiseDesc = expertDomains
      .map((d) => domainMap[d] ?? d)
      .join('、');

    const identity = basePrompt ?? `你是${name}，用户的${profile.relationship}。`;

    const memorySection = profile.memorySummary
      ? profile.memorySummary
      : '你们刚认识，还不了解对方。';

    const groupInstruction = isGroupChat
      ? `\n- 你现在在一个群聊中，群里还有其他朋友。不要重复别人已经说过的内容，从你的专业角度补充观点。`
      : '';

    return `${identity}

【你的专长】${expertiseDesc}

【你目前对用户的了解】
${memorySection}

【重要规则】
- 永远以${name}的身份说话，不要暴露自己是AI
- 用中文回复，语气自然
- 初期回复可以相对正式/保守，随着了解加深才慢慢放开
- 不要说"作为AI"或"我是语言模型"之类的话
- 当前时间：${new Date().toLocaleString('zh-CN')}${groupInstruction}`;
  }

  buildGroupCoordinatorPrompt(
    triggerCharName: string,
    invitedCharNames: string[],
    topic: string,
  ): string {
    return `你是${triggerCharName}，你刚刚把${invitedCharNames.join('和')}拉进了群聊，因为用户问了一个关于"${topic}"的问题，超出了你一个人的专长范围。

请用自然的方式说明为什么拉群，语气要像真实朋友一样，简短自然，不超过两句话。`;
  }

  buildMomentPrompt(profile: PersonalityProfile, currentTime: Date, recentTopics: string[] = []): string {
    const hour = currentTime.getHours();
    const timeOfDay =
      hour < 6 ? '深夜' :
      hour < 9 ? '早上' :
      hour < 12 ? '上午' :
      hour < 14 ? '中午' :
      hour < 18 ? '下午' :
      hour < 21 ? '傍晚' : '晚上';

    const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][currentTime.getDay()];
    const topicsHint = recentTopics.length > 0
      ? `\n最近你聊过的话题：${recentTopics.join('、')}，可以适当延续或换个话题。`
      : '';

    return `你是${profile.name}，${profile.relationship}。现在是${dayOfWeek}${timeOfDay}（${currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）。

根据你的性格（${profile.traits.emotionalTone}）和日常生活，发一条朋友圈。

要求：
- 内容真实自然，像真人发的朋友圈
- 不超过80个字
- 符合当前时间段的生活场景
- 可以带位置（如"北京·国贸"），也可以不带${topicsHint}

只输出朋友圈正文内容，不要加任何解释。`;
  }

  buildPersonalityExtractionPrompt(chatSample: string, personName: string): string {
    return `以下是与"${personName}"的真实聊天记录片段：

${chatSample}

请分析这个人的说话风格，以JSON格式输出：
{
  "speechPatterns": ["说话习惯1", "说话习惯2"],
  "catchphrases": ["口头禅1", "口头禅2"],
  "topicsOfInterest": ["常聊话题1", "常聊话题2"],
  "emotionalTone": "一句话描述情感基调",
  "responseLength": "short/medium/long",
  "emojiUsage": "none/occasional/frequent",
  "memorySummary": "用100字以内总结这个人的性格和与用户的关系"
}

只输出JSON，不要其他内容。`;
  }

  buildIntentClassificationPrompt(
    userMessage: string,
    characterName: string,
    characterDomains: string[],
  ): string {
    return `用户发给${characterName}（专长：${characterDomains.join('、')}）的消息：
"${userMessage}"

判断这个问题是否超出${characterName}的专长范围，需要其他领域的朋友帮忙。

以JSON格式输出：
{
  "needsGroupChat": true/false,
  "reason": "简短说明原因",
  "requiredDomains": ["需要的领域1", "需要的领域2"]
}

只输出JSON。`;
  }
}
