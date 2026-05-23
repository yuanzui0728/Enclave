import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { CharactersService } from '../characters/characters.service';
import { ChatService } from './chat.service';
import { GroupService } from './group.service';
import { GroupReplyPlannerService } from './group-reply-planner.service';
import { GroupReplyOrchestratorService } from './group-reply-orchestrator.service';
import { summarizeChatMentions } from './chat-text.utils';
import type { GroupReplyCandidate } from './group-reply.types';
import { SubscriptionExpiredException } from '../subscription/subscription-expired.exception';
import type {
  CallLogAttachment,
  CallLogEndedReason,
  VoiceAttachment,
} from './chat.types';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const VOICE_CALL_INPUT_ATTACHMENT_MISSING =
  'VOICE_CALL_INPUT_ATTACHMENT_MISSING';
const VOICE_CALL_TTS_INSTRUCTIONS_PREFIX =
  'Keep the delivery natural, conversational, and suitable for a mobile voice call. The speaker is ';
const VOICE_CALL_TTS_INSTRUCTIONS_SUFFIX = '.';

// 群语音通话单轮接话上限：默认 2 人；@all 时放宽到 3。文字群聊里
// planner 把 @all 的 maxSpeakers 拉到 5（groupReplyMaxSpeakersMentionAll），
// 但语音场景一轮 5 × LLM+TTS 会让用户等 ~5s（Promise.all 并发也吃 max(LLM+TTS)），
// 而且 MiniMax HD 11000/天的配额按角色 × 字符量算，5 人轮太烧。3 是体验
// 与成本的平衡：用户说"大家聊聊"能听到 2-3 个角色接话，不会感觉冷场。
const MAX_GROUP_VOICE_SPEAKERS_DEFAULT = 2;
const MAX_GROUP_VOICE_SPEAKERS_MENTION_ALL = 3;

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

export interface GroupVoiceCallTurnResult {
  groupId: string;
  userMessageId: string;
  userTranscript?: string;
  transcriptStatus: 'completed' | 'pending' | 'failed' | 'skipped';
  transcriptionDurationMs?: number;
  assistantTurns: Array<{
    messageId: string;
    characterId: string;
    characterName: string;
    characterAvatar?: string;
    assistantText: string;
    assistantAudioUrl: string | null;
    assistantAudioFileName: string;
    assistantAudioMimeType: string;
    synthesisDurationMs: number;
    durationMs?: number;
    provider?: string;
    speechFallbackReason?: 'tts_unavailable';
  }>;
  totalDurationMs: number;
}

@Injectable()
export class GroupVoiceCallsService {
  private readonly logger = new Logger(GroupVoiceCallsService.name);

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly speechAssets: AiSpeechAssetsService,
    private readonly chatService: ChatService,
    private readonly groupService: GroupService,
    private readonly planner: GroupReplyPlannerService,
    private readonly orchestrator: GroupReplyOrchestratorService,
    private readonly characters: CharactersService,
  ) {}

  async createTurn(
    file: UploadedAudioFile,
    input: {
      groupId: string;
      durationMs?: number;
      requestedSpeakerIds?: string[];
    },
  ): Promise<GroupVoiceCallTurnResult> {
    const startedAt = Date.now();
    const group = await this.groupService.getGroup(input.groupId);
    if (!group || group.id !== input.groupId) {
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { groupId: input.groupId },
        legacyMessage: `Group ${input.groupId} not found`,
      });
    }

    // saveUploadedAttachment 复用 chat.service 的存储路径（data/attachments/...），
    // 与单聊 voice-call 完全同款，可避免重新维护一份群聊专用目录。
    const attachment = await this.chatService.saveUploadedAttachment(
      file,
      input.durationMs !== undefined ? { durationMs: input.durationMs } : {},
    );
    if (attachment.kind !== 'voice') {
      throw new AppError('CHAT_VOICE_CALL_AUDIO_REQUIRED', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: VOICE_CALL_INPUT_ATTACHMENT_MISSING,
      });
    }

    // 同步走 whisper：群聊 voice-call 的选人逻辑 + @mention 解析必须**当下**拿到
    // 转写文本喂给 planner。chat-list 上挂的 mediaInsightJob 是异步落 transcript
    // 到 attachment.insight，对 createTurn 本次同步路径来说永远是 undefined。
    // 没有 transcript → currentUserContext.promptText 只剩"发了一段时长 X 秒的语音"
    // 模板字符串，planner 评分按 random gate 撞库 + 完全收不到 @mention 强制点名。
    // 转写失败 / 静音超时不应阻塞通话（用户希望即使 whisper 挂了也能"按住录音 →
    // 至少触发一轮 AI 回话"），catch 走兜底，让 planner 在空 prompt 下走 fallback
    // 选 candidates[0]。
    let transcript = '';
    let transcriptionDurationMs: number | undefined;
    let transcriptionFailed = false;
    try {
      const transcribed = await this.ai.transcribeAudio(file, {
        mode: 'voice_call',
      });
      transcript = transcribed.text?.trim() || '';
      transcriptionDurationMs = transcribed.durationMs;
      if (transcript) {
        attachment.transcriptText = transcript;
      }
    } catch (err) {
      // 订阅过期必须早冒：catch 吞掉的话，用户拿到 200 + 空 transcript，
      // 之后 LLM 调用又会因订阅过期挂，前端拿到的是第二次 5xx——用户根本搞不
      // 清第一次到底成不成。让 SubscriptionExpiredException 透传到全局
      // exception filter，前端拿到标准 expired payload 弹会员到期 dialog。
      if (err instanceof SubscriptionExpiredException) {
        throw err;
      }
      transcriptionFailed = true;
      this.logger.warn(
        `group voice-call transcribe failed for ${input.groupId}: ${
          (err as Error)?.message
        }`,
      );
    }
    // transcriptStatus 区分 failed vs skipped：mobile-ai-call-screen 给二者
    // 不同 UI 文案（"字幕失败" vs "未转写"）。当前路径：whisper 抛错 = failed；
    // whisper 跑完但返回空字符串（用户没说话 / 录到静音）= skipped。
    const transcriptStatus: 'completed' | 'failed' | 'skipped' = transcript
      ? 'completed'
      : transcriptionFailed
        ? 'failed'
        : 'skipped';

    // 用 owner（user 自己）身份在群里写一条 voice user message。
    // attachment.transcriptText 已 inline 填充，群聊历史里点开 voice 气泡能立刻
    // 看到字幕，不用等 media insight job。
    const userMessage = await this.groupService.sendOwnerMessage(input.groupId, {
      type: 'voice',
      attachment,
    });

    const context = await this.groupService.prepareReplyContext(
      input.groupId,
      userMessage,
    );
    if (!context) {
      // 群里没有可回话的 character → 仍然让用户音消息落库，不抛错。
      return {
        groupId: input.groupId,
        userMessageId: userMessage.id,
        userTranscript: transcript || undefined,
        transcriptStatus,
        ...(transcriptionDurationMs !== undefined
          ? { transcriptionDurationMs }
          : {}),
        assistantTurns: [],
        totalDurationMs: Date.now() - startedAt,
      };
    }
    const { members, recentMessages, history, currentUserContext, runtimeRules } =
      context;

    // 把 transcript 真实文本灌进 planner 的 currentUserContext —— mentions /
    // hasMentionAll 是 group.service 从 message.text（语音消息的 text 字段总是
    // 空字符串）解析的，必须基于 transcript 重算才能让"@小明 你怎么看"在语音
    // 通话里强制点名。promptText 不重算 —— buildVoiceAttachmentSummary 已经
    // 把"转写内容：xxx"拼进 promptText 了（attachment.transcriptText 已 inline 填好），
    // 这里再拼会让 LLM 看到 transcript 两遍。
    const enrichedUserContext = transcript
      ? (() => {
          const mentionSummary = summarizeChatMentions(transcript);
          return {
            ...currentUserContext,
            mentions: mentionSummary.mentions,
            hasMentionAll: mentionSummary.hasMentionAll,
          };
        })()
      : currentUserContext;

    const plannerDecision = await this.planner.selectReplyActorsForTurn({
      members,
      history: recentMessages,
      currentUserContext: enrichedUserContext,
      runtimeRules,
    });
    let selectedActors = plannerDecision.selectedActors;
    // R6 走查真实操作发现：原版「filter only」对 requestedSpeakerIds 是**降级
    // 过滤**——planner 没选指定角色时 filtered=空 → if (filtered.length) 跳过
    // → 仍由 planner 自由发挥。前端在语音中识别 @ 后明确传 requestedSpeakerIds，
    // 用户语义是「强制让 X 回话」，不是「只在 planner 选了 X 时让 X 回」。
    // 修正：requestedIds 是强制指令，planner 漏选的也得 build candidate 拉进来。
    // members 是 GroupMemberEntity[]，不是 GroupReplyCandidate[]；需要拿
    // characters.findManyByIds + getRuntimeProfileFromCharacter 构出最小 candidate
    // 喂给 orchestrator.generateTaskReply（只用 character.id/name/voicePreset 和 profile）。
    const requestedIds = (input.requestedSpeakerIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean);
    if (requestedIds.length) {
      const memberIdSet = new Set(
        members.map((member) => member.memberId),
      );
      const validRequestedIds = requestedIds.filter((id) => memberIdSet.has(id));
      if (validRequestedIds.length) {
        const selectedById = new Map(
          selectedActors.map((actor) => [actor.character.id, actor]),
        );
        const missingIds = validRequestedIds.filter(
          (id) => !selectedById.has(id),
        );
        let extraActors: GroupReplyCandidate[] = [];
        if (missingIds.length) {
          const missingCharacters = await this.characters.findManyByIds(missingIds);
          const profiles = await Promise.all(
            missingCharacters.map(async (character) => {
              const profile =
                await this.characters.getRuntimeProfileFromCharacter(character);
              return profile ? { character, profile } : null;
            }),
          );
          extraActors = profiles
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
            .map(
              (entry): GroupReplyCandidate => ({
                character: entry.character,
                profile: entry.profile,
                score: 100, // 明确点名最高
                randomPassed: true,
                isExplicitTarget: true,
                isReplyTarget: false,
                recentSpeakerIndex: -1,
              }),
            );
        }
        const forcedActors: GroupReplyCandidate[] = [];
        for (const id of validRequestedIds) {
          const fromPlanner = selectedById.get(id);
          if (fromPlanner) {
            forcedActors.push(fromPlanner);
            continue;
          }
          const built = extraActors.find((actor) => actor.character.id === id);
          if (built) {
            forcedActors.push(built);
          }
        }
        if (forcedActors.length) {
          selectedActors = forcedActors;
        }
      }
    }
    const maxSpeakers = enrichedUserContext.hasMentionAll
      ? MAX_GROUP_VOICE_SPEAKERS_MENTION_ALL
      : MAX_GROUP_VOICE_SPEAKERS_DEFAULT;
    selectedActors = selectedActors.slice(0, maxSpeakers);
    if (!selectedActors.length) {
      this.logger.warn(
        `group voice-call ${input.groupId} had no actors after planner; transcript="${transcript}"`,
      );
      return {
        groupId: input.groupId,
        userMessageId: userMessage.id,
        userTranscript: transcript || undefined,
        transcriptStatus,
        ...(transcriptionDurationMs !== undefined
          ? { transcriptionDurationMs }
          : {}),
        assistantTurns: [],
        totalDurationMs: Date.now() - startedAt,
      };
    }

    // 并发跑每个角色的 LLM + TTS。p95 ≈ max(LLM+TTS) 而非 sum，移动端用户等待比顺序低 ~40%。
    const assistantTurns = await Promise.all(
      selectedActors.map(async (actor) => {
        try {
          const reply = await this.orchestrator.generateTaskReply({
            actor,
            groupId: input.groupId,
            groupName: group.name,
            conversationHistory: history,
            baseUserPrompt: enrichedUserContext.promptText,
            userMessageParts: enrichedUserContext.parts,
            followupReplies: [],
            allowMultiModal: false,
          });
          const replyText = sanitizeAiText(reply.text) || '';
          if (!replyText.trim()) {
            return null;
          }

          let synthesized: Awaited<
            ReturnType<typeof this.ai.synthesizeSpeech>
          > | null = null;
          let speechFallbackReason: 'tts_unavailable' | undefined;
          try {
            synthesized = await this.ai.synthesizeSpeech({
              text: replyText,
              characterId: actor.character.id,
              voice: actor.character.voicePreset?.trim() || undefined,
              instructions: buildSpeechInstructions(actor.character.name),
            });
          } catch (err) {
            // 订阅过期透传：synthesizeSpeech 内部走 assertCanUseAi('audio')，
            // 同 transcribe 一样，让 expired exception 冒上去给前端弹 dialog；
            // 真正 TTS provider 失败才走三级文本兜底。
            if (err instanceof SubscriptionExpiredException) {
              throw err;
            }
            this.logger.warn(
              `group voice-call TTS unavailable for character ${actor.character.id}: ${
                (err as Error)?.message
              }`,
            );
            speechFallbackReason = 'tts_unavailable';
          }

          let voiceAttachment: VoiceAttachment | undefined;
          if (synthesized) {
            const asset = await this.speechAssets.saveGeneratedSpeech(
              synthesized.buffer,
              {
                mimeType: synthesized.mimeType,
                fileExtension: synthesized.fileExtension,
                baseName: `group-voice-call-${actor.character.id}`,
              },
            );
            voiceAttachment = {
              kind: 'voice',
              url: asset.audioUrl,
              mimeType: asset.mimeType,
              fileName: asset.fileName,
              size: synthesized.buffer.length,
              durationMs: synthesized.durationMs,
              transcriptText: replyText,
            };
          }

          let messageId: string;
          if (voiceAttachment) {
            const persisted = await this.groupService.saveCharacterVoiceMessage(
              input.groupId,
              {
                id: actor.character.id,
                name: actor.character.name,
                avatar: actor.character.avatar,
              },
              voiceAttachment,
              replyText,
            );
            messageId = persisted.id;
          } else {
            // TTS 失败：仅落 text 消息让群历史保留对话内容，前端语音 UI 看到 audioUrl=null
            // 提示"本轮以文字呈现"，通话不中断。
            const fallbackText = await this.groupService.sendMessage(
              input.groupId,
              actor.character.id,
              'character',
              actor.character.name,
              { type: 'text', text: replyText },
              actor.character.avatar,
            );
            messageId = fallbackText.id;
          }

          return {
            messageId,
            characterId: actor.character.id,
            characterName: actor.character.name,
            characterAvatar: actor.character.avatar,
            assistantText: replyText,
            assistantAudioUrl: voiceAttachment?.url ?? null,
            assistantAudioFileName: voiceAttachment?.fileName ?? '',
            assistantAudioMimeType: voiceAttachment?.mimeType ?? '',
            synthesisDurationMs: synthesized?.durationMs ?? 0,
            durationMs: voiceAttachment?.durationMs,
            provider: synthesized?.provider,
            ...(speechFallbackReason ? { speechFallbackReason } : {}),
          };
        } catch (err) {
          // 订阅过期透传：generateTaskReply 内部走 ai.generateReply →
          // assertCanUseAi('chat')。LLM 文本生成挂了也透传，让前端弹 dialog；
          // 其它错误（角色 LLM 配置异常 / 网络抖动）被 actor-local catch 吞，
          // 该角色不出回话但其它角色照常走。
          if (err instanceof SubscriptionExpiredException) {
            throw err;
          }
          this.logger.warn(
            `group voice-call actor ${actor.character.id} failed: ${
              (err as Error)?.message
            }`,
          );
          return null;
        }
      }),
    );

    const successfulTurns = assistantTurns.filter(
      (turn): turn is NonNullable<typeof turn> => turn !== null,
    );
    if (!successfulTurns.length) {
      this.logger.warn(
        `group voice-call ${input.groupId} got 0 successful turns out of ${selectedActors.length}`,
      );
    }

    return {
      groupId: input.groupId,
      userMessageId: userMessage.id,
      userTranscript: transcript || undefined,
      // R3 走查：原本在最终成功 return 里又重新算 `transcript ? 'completed' :
      // 'skipped'`，把上面 line 145 算好的 `transcriptStatus`（含 failed 分支）
      // 给覆盖掉。whisper 真抛错时 transcript="" + transcriptionFailed=true，
      // 旧路径返回 'skipped'，前端 mobile-group-call-screen 显示"未转写"而非
      // "字幕失败"，用户以为是没声音被 skip，其实是 whisper 挂了。直接复用
      // 已计算的 transcriptStatus 局部变量。
      transcriptStatus,
      ...(transcriptionDurationMs !== undefined
        ? { transcriptionDurationMs }
        : {}),
      assistantTurns: successfulTurns,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  async finalizeCall(input: {
    groupId: string;
    mode: 'voice' | 'video';
    startedAtIso: string;
    endedReason: CallLogEndedReason;
    participantCount?: number;
  }): Promise<{
    messageId: string | null;
    durationSec: number;
    endedReason: CallLogEndedReason;
  }> {
    const startedAt = parseStartedAt(input.startedAtIso);
    const endedAt = new Date();
    const durationSec = Math.max(
      0,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );

    // R7 走查（真实操作发现）：原版没做 group 存在校验，直接走
    // groupService.saveSystemAttachmentMessage —— 那条内部 requireAccessibleGroup
    // 会抛 AppError(CHAT_GROUP_NOT_FOUND)，但下方 try/catch 把所有异常一律
    // 吞成 messageId=null + 200。前端拿到 200 + null 误以为"call_log 写库静默
    // 失败"（持久化的最佳努力故障），但其实是用户/外部 caller 传了脏 groupId。
    // 单聊侧（voice-calls.service finalizeCall）一开始就 await getConversation
    // 显式抛 404，群聊侧没对齐。前置一次 getGroup 抛同款 CHAT_GROUP_NOT_FOUND，
    // 把"业务错"与"持久化错"分开。
    const group = await this.groupService.getGroup(input.groupId);
    if (!group || group.id !== input.groupId) {
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { groupId: input.groupId },
        legacyMessage: `Group ${input.groupId} not found`,
      });
    }

    const attachment: CallLogAttachment = {
      kind: 'call_log',
      mode: input.mode,
      thread: 'group',
      durationSec,
      endedReason: input.endedReason,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      ...(typeof input.participantCount === 'number'
        ? { participantCount: input.participantCount }
        : {}),
    };

    try {
      const message = await this.groupService.saveSystemAttachmentMessage(
        input.groupId,
        attachment,
        buildCallLogFallbackText(attachment),
      );
      return {
        messageId: message.id,
        durationSec,
        endedReason: input.endedReason,
      };
    } catch (err) {
      this.logger.warn(
        `group finalizeCall failed for ${input.groupId}: ${
          (err as Error)?.message
        }`,
      );
      return { messageId: null, durationSec, endedReason: input.endedReason };
    }
  }
}

function parseStartedAt(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function buildSpeechInstructions(characterName: string) {
  const normalizedName = characterName.trim() || '当前角色';
  return `${VOICE_CALL_TTS_INSTRUCTIONS_PREFIX}${normalizedName}${VOICE_CALL_TTS_INSTRUCTIONS_SUFFIX}`;
}

function buildCallLogFallbackText(attachment: CallLogAttachment): string {
  const duration = formatCallLogDurationLabel(attachment.durationSec);
  const modeLabel = attachment.mode === 'video' ? '视频通话' : '语音通话';
  if (attachment.endedReason === 'timeout') {
    return `${modeLabel} · 已超时 ${duration}`;
  }
  if (attachment.endedReason === 'error') {
    return `${modeLabel} · 连接异常`;
  }
  if (attachment.endedReason === 'no_answer') {
    return `${modeLabel} · 未接通`;
  }
  return `${modeLabel} · 通话时长 ${duration}`;
}

function formatCallLogDurationLabel(durationSec: number): string {
  const safe = Math.max(0, Math.round(durationSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

// i18n-ignore-end
