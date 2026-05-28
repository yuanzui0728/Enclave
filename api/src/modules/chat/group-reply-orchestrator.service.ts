import { Injectable } from '@nestjs/common';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { type ChatMessage } from '../ai/ai.types';
import { WebSearchService } from '../ai/web-search.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { WorldContextHubService } from '../cyber-avatar/world-context-hub.service';
import { CharactersService } from '../characters/characters.service';
import { WorldLanguageService } from '../config/world-language.service';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  buildReplyModalityPromptSections,
  extractRequestedImagePrompt,
  resolveAssistantReplyText,
  shouldCreateVoiceReplyFromText,
  type AssistantReplyModalitiesPlan,
} from './assistant-reply-modalities';
import {
  type GroupReplyCandidate,
  type GroupReplyOrchestratorInput,
} from './group-reply.types';

@Injectable()
export class GroupReplyOrchestratorService {
  private readonly latestTriggerMessageByGroup = new Map<string, string>();

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly worldLanguage: WorldLanguageService,
    private readonly characters: CharactersService,
    private readonly webSearch: WebSearchService,
    private readonly worldOwner: WorldOwnerService,
    private readonly contextHub: WorldContextHubService,
  ) {}

  async generateTaskReply(input: {
    actor: GroupReplyCandidate;
    groupId: string;
    groupName?: string;
    conversationHistory: ChatMessage[];
    baseUserPrompt: string;
    userMessageParts: GroupReplyOrchestratorInput['currentUserContext']['parts'];
    followupReplies: Array<{ senderName: string; text: string }>;
    allowMultiModal?: boolean;
  }) {
    const {
      actor,
      groupId,
      groupName,
      conversationHistory,
      baseUserPrompt,
      userMessageParts,
      followupReplies,
      allowMultiModal,
    } = input;
    const rollingHistory = [...conversationHistory];
    const replyModalities = allowMultiModal
      ? await this.planAssistantReplyModalities({
          characterId: actor.character.id,
          promptText: baseUserPrompt,
        })
      : {
          includeVoice: false,
          promptSections: [],
        };
    const extraSystemPromptSections = [...replyModalities.promptSections];

    // 群聊里只要触发本轮回复的角色开了 webSearchEnabled，且用户消息含时效关键词，
    // 就追一次 web_search 注入；同 chat.service.ts 直聊路径一致。
    if (
      actor.character.webSearchEnabled === true &&
      this.webSearch.shouldTriggerForUserMessage(baseUserPrompt)
    ) {
      const injection = await this.webSearch.searchAndFormat(baseUserPrompt);
      if (injection) extraSystemPromptSections.push(injection.markdown);
    }

    for (const reply of followupReplies) {
      rollingHistory.push({
        role: 'assistant',
        content: sanitizeAiText(reply.text) || '（无回复）',
        characterId: reply.senderName,
      });
    }

    const result = await this.ai.generateReply({
      profile: actor.profile,
      conversationHistory: rollingHistory,
      userMessage: this.buildTurnUserPrompt(baseUserPrompt, followupReplies),
      userMessageParts,
      isGroupChat: true,
      // 群聊里角色也该「知道」群内真人用户是谁（个人资料注入，同直聊）+ 单人世界中枢
      // 渲染的用户画像（Stratum A，第三人称）让群里所有角色共享同一份「世界对 Ta 的认知」。
      chatContext: {
        userProfile: await this.worldOwner.getUserProfileContext(),
        ownerPortrait: await this.contextHub.buildOwnerPortrait(),
      },
      extraSystemPromptSections,
      emptyTextFallback: '',
      usageContext: {
        surface: 'app',
        scene: 'group_reply',
        scopeType: 'group',
        scopeId: groupId,
        scopeLabel: groupName || groupId,
        characterId: actor.character.id,
        characterName: actor.character.name,
        groupId,
      },
    });
    const language = await this.worldLanguage.getLanguage();

    return {
      text: resolveAssistantReplyText({
        text: result.text,
        promptText: baseUserPrompt,
        plan: replyModalities,
        language,
      }),
      modalities: replyModalities,
    };
  }

  async executeTurn(input: GroupReplyOrchestratorInput): Promise<void> {
    const {
      groupId,
      groupName,
      triggerMessageId,
      selectedActors,
      conversationHistory,
      currentUserContext,
      runtimeRules,
      sendReply,
      onError,
    } = input;

    this.latestTriggerMessageByGroup.set(groupId, triggerMessageId);
    if (!selectedActors.length) {
      return;
    }

    const language = await this.worldLanguage.getLanguage();
    const emittedReplies: Array<{ senderName: string; text: string }> = [];
    const rollingHistory: ChatMessage[] = [...conversationHistory];
    // 群内真人用户的个人资料：本轮取一次，发给所有 actor 共用（避免每个 actor 各查一遍 owner）。
    const userProfile = await this.worldOwner.getUserProfileContext();
    // 单人世界中枢的画像（Stratum A）同样本轮取一次共用——这一群所有角色看到的「世界对用户的认知」必须一致。
    const ownerPortrait = await this.contextHub.buildOwnerPortrait();
    // 走查 R2：executeTurn 这条 generateReply 路径之前完全没接 web_search 注入。
    // 只要 selectedActors 里有任一角色开了 webSearchEnabled、且用户消息命中时效
    // 关键词，就在循环外预先 fire 一次 search，把结果缓存给所有开了 flag 的 actor
    // 共用——避免 3 个 actor × 1 个相同 query 烧 3 份 token-plan 搜索配额。
    let sharedWebSearchMarkdown: string | null = null;
    const turnNeedsSearch =
      selectedActors.some((a) => a.character.webSearchEnabled === true) &&
      this.webSearch.shouldTriggerForUserMessage(
        currentUserContext.promptText,
      );
    // 走查 yuanzui0728 本次 R2：原版 webSearch.searchAndFormat 紧跟着 latestTrigger
    // set 之后 await。用户连发两条 message 时（第一条触发 search，5G/中转 800ms
    // 内第二条 message 已经入栈触发新的 executeTurn → 把 latestTrigger 改成 id2），
    // 第一轮 search 的 1 unit 就白白烧掉了——下面 for 循环第一帧就 isReplyTurnStale
    // bail。yuanzui 当前世界 web-search 配额只有 10/天，一次连发就是 10% quota。
    // 移到 search await 之前做一次 stale 检查；同一查询 60s 内还能命中 inFlight/
    // resultCache，比赛 0 cost。MiniMax 真扣 unit 的路径只在确实是 latest trigger
    // 且 search 命中触发时进入。
    if (turnNeedsSearch) {
      if (this.isReplyTurnStale(groupId, triggerMessageId)) return;
      const injection = await this.webSearch.searchAndFormat(
        currentUserContext.promptText,
      );
      if (injection) sharedWebSearchMarkdown = injection.markdown;
    }

    for (const [index, actor] of selectedActors.entries()) {
      if (this.isReplyTurnStale(groupId, triggerMessageId)) {
        return;
      }

      await this.sleep(this.pickReplyDelay(index, runtimeRules));
      if (this.isReplyTurnStale(groupId, triggerMessageId)) {
        return;
      }

      // 只把搜索结果发给真的开了 webSearchEnabled 的 actor（其它 actor 走原 prompt
      // 不被污染——它们没声明依赖实时知识的角色性格）。
      const turnExtraSections: string[] = [];
      if (
        sharedWebSearchMarkdown &&
        actor.character.webSearchEnabled === true
      ) {
        turnExtraSections.push(sharedWebSearchMarkdown);
      }
      try {
        const reply = await this.ai.generateReply({
          profile: actor.profile,
          conversationHistory: rollingHistory,
          userMessage: this.buildTurnUserPrompt(
            currentUserContext.promptText,
            emittedReplies,
          ),
          userMessageParts: currentUserContext.parts,
          isGroupChat: true,
          chatContext: { userProfile, ownerPortrait },
          extraSystemPromptSections: turnExtraSections,
          emptyTextFallback: '',
          usageContext: {
            surface: 'app',
            scene: 'group_reply',
            scopeType: 'group',
            scopeId: groupId,
            scopeLabel: groupName || groupId,
            characterId: actor.character.id,
            characterName: actor.character.name,
            groupId,
          },
        });
        if (this.isReplyTurnStale(groupId, triggerMessageId)) {
          return;
        }

        const normalizedReplyText = resolveAssistantReplyText({
          text: reply.text,
          promptText: currentUserContext.promptText,
          plan: { includeVoice: false, promptSections: [] },
          language,
        });

        await sendReply(actor, normalizedReplyText);
        emittedReplies.push({
          senderName: actor.character.name,
          text: normalizedReplyText,
        });
        rollingHistory.push(
          this.toEmittedHistoryMessage(actor, normalizedReplyText),
        );
      } catch (error) {
        onError?.(actor, error);
      }
    }
  }

  private toEmittedHistoryMessage(
    actor: GroupReplyCandidate,
    text: string,
  ): ChatMessage {
    return {
      role: 'assistant',
      content: sanitizeAiText(text) || '（无回复）',
      characterId: actor.character.name,
    };
  }

  private async planAssistantReplyModalities(input: {
    characterId: string;
    promptText: string;
  }): Promise<AssistantReplyModalitiesPlan> {
    // 先看 prompt 本身有没有触发 voice 关键词；没有再查角色卡的"默认用语音回复"
    let wantsVoice = shouldCreateVoiceReplyFromText(input.promptText);
    const requestedImagePrompt = extractRequestedImagePrompt({
      type: 'text',
      text: input.promptText,
    });
    if (!wantsVoice) {
      const character = await this.characters.findById(input.characterId);
      if (character?.defaultVoiceReply === true) {
        wantsVoice = true;
      }
    }
    if (!wantsVoice && !requestedImagePrompt) {
      return {
        includeVoice: false,
        promptSections: [],
      };
    }

    const capabilities = await this.ai.resolveRuntimeCapabilityProfile({
      characterId: input.characterId,
    });
    const plan: AssistantReplyModalitiesPlan = {
      includeVoice: wantsVoice && capabilities.supportsSpeechSynthesis,
      imagePrompt:
        requestedImagePrompt && capabilities.supportsImageGeneration
          ? requestedImagePrompt
          : undefined,
      promptSections: [],
    };
    plan.promptSections = buildReplyModalityPromptSections(plan);
    return plan;
  }

  private buildTurnUserPrompt(
    promptText: string,
    emittedReplies: Array<{ senderName: string; text: string }>,
  ) {
    if (!emittedReplies.length) {
      return promptText;
    }

    const replySummary = emittedReplies
      .map(
        (reply) =>
          `- ${reply.senderName}：${sanitizeAiText(reply.text) || '（无回复）'}`,
      )
      .join('\n');

    return `${promptText}\n\n【群里刚刚已经有人回应】\n${replySummary}\n请避免重复上面的内容，直接补充新的信息或自然接话。`;
  }

  pickReplyDelay(
    index: number,
    runtimeRules: GroupReplyOrchestratorInput['runtimeRules'],
  ) {
    const range =
      index === 0
        ? runtimeRules.groupReplyPrimaryDelayMs
        : runtimeRules.groupReplyFollowupDelayMs;
    return range.min + Math.random() * (range.max - range.min);
  }

  private isReplyTurnStale(groupId: string, triggerMessageId: string) {
    return this.latestTriggerMessageByGroup.get(groupId) !== triggerMessageId;
  }

  private sleep(durationMs: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, Math.round(durationMs)));
    });
  }
}
// i18n-ignore-end
