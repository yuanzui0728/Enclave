// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  MoreThan,
  Repository,
} from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { ConversationEntity } from './conversation.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import { MessageEntity } from './message.entity';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import {
  isSharedWorldMode,
  TenantContextStore,
} from '../tenancy/tenant-context';
import {
  searchMessages as searchVisibleMessages,
  sliceMessagesAround,
  type MessageSearchQuery,
  type MessageSearchResponse,
} from './message-search.utils';
import { buildVoiceAttachmentSummary } from './voice-attachment-summary';
import { AiMessagePart, ChatMessage } from '../ai/ai.types';
import {
  ContactCardAttachment,
  FileAttachment,
  Group,
  GroupMessage,
  ImageAttachment,
  LocationCardAttachment,
  MessageAttachment,
  NoteCardAttachment,
  StickerAttachment,
  VoiceAttachment,
} from './chat.types';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { CharactersService } from '../characters/characters.service';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { WorldOwnerService } from '../auth/world-owner.service';
import { WorldLanguageService } from '../config/world-language.service';
import { ChatGateway } from './chat.gateway';
import { CustomStickersService } from './custom-stickers.service';
import {
  extractChatReplyMetadata,
  summarizeChatMentions,
  type ChatReplyMetadata,
} from './chat-text.utils';
import { type GroupUserMessageContext } from './group-reply.types';
import { GroupReplyPlannerService } from './group-reply-planner.service';
import { GroupReplyTaskService } from './group-reply-task.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { ReplyArtifactJobService } from './reply-artifact-job.service';
import { MediaInsightJobService } from './media-insight-job.service';
import { buildDocumentPromptExcerpt } from './document-chunk-selection';
import { resolveGeneratedAttachmentHistoryText } from './assistant-attachment-history';
import { describeAttachmentForDisplay } from './attachment-semantic-text';

export interface CreateGroupDto {
  name: string;
  memberIds: string[];
  sourceConversationId?: string;
  sharedMessageIds?: string[];
}

export interface AddMemberDto {
  memberId: string;
  memberType: 'user' | 'character';
  memberName?: string;
  memberAvatar?: string;
}

export interface UpdateGroupDto {
  name?: string;
  announcement?: string | null;
}

export interface UpdateGroupPreferencesDto {
  isMuted?: boolean;
  savedToContacts?: boolean;
  showMemberNicknames?: boolean;
  notifyOnAtMe?: boolean;
  notifyOnAtAll?: boolean;
  notifyOnAnnouncement?: boolean;
}

type GroupMessageListQuery = {
  limit?: number;
  aroundMessageId?: string;
  before?: number;
  after?: number;
};

type SendGroupMessageInput =
  | {
      type?: 'text';
      text: string;
    }
  | {
      type: 'image';
      text?: string;
      attachment: ImageAttachment;
    }
  | {
      type: 'file';
      text?: string;
      attachment: FileAttachment;
    }
  | {
      type: 'voice';
      text?: string;
      attachment: VoiceAttachment;
    }
  | {
      type: 'contact_card';
      text?: string;
      attachment: ContactCardAttachment;
    }
  | {
      type: 'location_card';
      text?: string;
      attachment: LocationCardAttachment;
    }
  | {
      type: 'note_card';
      text?: string;
      attachment: NoteCardAttachment;
    }
  | {
      type: 'sticker';
      text?: string;
      attachment: StickerAttachment;
    };

const DEFAULT_GROUP_REPLY_HISTORY_LIMIT = 24;

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    private readonly ai: AiOrchestratorService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ConversationEntity)
    private conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private conversationMessageRepo: Repository<MessageEntity>,
    @InjectRepository(GroupEntity)
    private groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private memberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private messageRepo: Repository<GroupMessageEntity>,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly chatGateway: ChatGateway,
    private readonly customStickersService: CustomStickersService,
    private readonly cyberAvatar: CyberAvatarService,
    private readonly groupReplyPlanner: GroupReplyPlannerService,
    private readonly groupReplyTaskService: GroupReplyTaskService,
    private readonly replyArtifactJobs: ReplyArtifactJobService,
    private readonly mediaInsightJobs: MediaInsightJobService,
    private readonly worldLanguage: WorldLanguageService,
  ) {}

  async createGroup(dto: CreateGroupDto): Promise<Group> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    // 走查 Round 新 R1：原版 `name: dto.name` 直接写进 DB，没 trim 也没校验，
    // POST /groups {"name":""} / {"name":"   "} 都成功创建——会话列表 / 通讯录
    // 群聊 / 群聊室 header / 群信息页 8 处全是裸渲染 group.name (?? 落不进 ""
    // 这种 truthy-empty)，UI 上整条群行渲染成空白。mobile create-group-page
    // 客户端有 `name.trim() || defaultGroupName` 兜底所以不触发，但任何一个
    // 直连 API / 老版本客户端 / 未来的第三方客户端都会留下空名脏数据。
    // 现在统一 trim + 400 reject，跟下面 memberIds 必须非空一个口径。
    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new AppError('GROUP_REQUIRES_NAME', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Group requires a non-empty name',
      });
    }
    // 走查 Round 2：dedupe 之后再剔除 char-default-self —— 用户自身就是
    // owner role=owner 这一条 member 行；如果把"我自己"也作为 character member 加进群，
    // 你跟自己同时在群里、还能跟自己 @、自己回复自己。空 memberIds 同样不允许：
    // 创建只剩 owner 一个真人 + 0 个角色的孤儿群在 UI 里看着像 crash。
    const memberIds = dedupeIds(dto.memberIds).filter(
      (id) => id !== SELF_CHARACTER_ID,
    );
    if (!memberIds.length) {
      throw new AppError('GROUP_REQUIRES_AT_LEAST_ONE_MEMBER', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Group requires at least one character member',
      });
    }

    const characterProfiles = await Promise.all(
      memberIds.map(async (memberId) => {
        const character = await this.characters.findById(memberId);
        if (!character) {
          throw new AppError('CHARACTER_NOT_FOUND', {
            status: HttpStatus.NOT_FOUND,
            params: { id: memberId },
            legacyMessage: `Character ${memberId} not found`,
          });
        }
        return { memberId, character };
      }),
    );

    const { group, sharedMessageCount } = await this.dataSource.transaction(
      async (manager) => {
        const groupRepo = manager.getRepository(GroupEntity);
        const memberRepo = manager.getRepository(GroupMemberEntity);

        const groupEntity = groupRepo.create({
          name: trimmedName,
          creatorId: owner.id,
          creatorType: 'user',
          isHidden: false,
          lastReadAt: new Date(),
          lastActivityAt: new Date(),
        });
        await groupRepo.save(groupEntity);

        const memberEntities: GroupMemberEntity[] = [
          memberRepo.create({
            groupId: groupEntity.id,
            memberId: owner.id,
            memberType: 'user',
            memberName: owner.username?.trim() || 'You',
            memberAvatar: owner.avatar ?? undefined,
            role: 'owner',
          }),
          ...characterProfiles.map(({ memberId, character }) =>
            memberRepo.create({
              groupId: groupEntity.id,
              memberId,
              memberType: 'character',
              memberName: character.name,
              memberAvatar: character.avatar ?? undefined,
              role: 'member',
            }),
          ),
        ];
        await memberRepo.save(memberEntities);

        const copied = await this.copySharedConversationMessages(
          groupEntity,
          owner,
          dto,
          manager,
        );

        return { group: groupEntity, sharedMessageCount: copied };
      },
    );

    // 走查 Round 3：createGroup 整路都没 emitGroupConversationUpdated；
    // 多端在线（web + iOS shell / 双端同账号）时另一端 chat-list 不会立刻
    // 出现这条新群，要等 60s 兜底轮询才显示。同时 copySharedConversationMessages
    // 之前是在 transaction 内调 emit 的，但 emitGroupConversationUpdated 内部
    // 用的是 this.groupRepo（默认数据源，不是 manager），事务还没 commit 时
    // 另一端 socket handler 立刻 getGroup 会读到 404 跳回兜底页。统一在
    // transaction 之后 emit 一次，跟其它写操作（updateGroup/hideGroup 等）对齐。
    await this.emitGroupConversationUpdated(group.id);

    this.logger.log(
      `Created group ${group.id} with ${memberIds.length + 1} members and ${sharedMessageCount} shared messages`,
    );
    return this.toGroup(group);
  }

  async addMember(
    groupId: string,
    dto: AddMemberDto,
  ): Promise<GroupMemberEntity> {
    await this.requireOwnedGroup(groupId);
    // 走查 R2：原版没卡 memberId / memberType 必填——POST /groups/$id/members
    // body={} 或 body 缺字段时，下面 findOne({ where: { memberId: undefined }})
    // 会被 TypeORM 当成"只按 groupId 过滤"返回任意一条已存在成员（实测返回 owner
    // 那一条 memberType=user），handler 直接 200 + 别人的成员行——调用方误以为
    // 添加成功。前端 group-member-picker 不会发这种 body，但任何直连 API /
    // 老客户端 / 第三方客户端用错请求时无明显报错最坏。补 400 让 callsite
    // 主动暴露错误。
    const trimmedMemberId = dto.memberId?.trim();
    if (!trimmedMemberId) {
      throw new AppError('GROUP_MEMBER_REQUIRES_ID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Group member requires a non-empty memberId',
      });
    }
    if (dto.memberType !== 'character' && dto.memberType !== 'user') {
      throw new AppError('GROUP_MEMBER_REQUIRES_TYPE', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage:
          'Group member requires memberType of either "character" or "user"',
      });
    }
    // 走查 R1：char-default-self（"我自己"自我镜像）本质就是用户自身，owner
    // 已经以 memberType=user 在群里。前端 create-group-page / 群成员 picker /
    // mention picker / group-chat-thread-panel 都已经按 SELF_CHARACTER_ID 过滤
    // 渲染，但服务端这条路径漏掉——任何直连 API / 老版本客户端 / 第三方客户端
    // 都能 POST 一条 memberType=character 的 SELF 进群，落库后用户在 mention
    // picker / 通讯录里能看到"@我自己"，typing/AI reply 走 character 路径还会
    // 在群里冒"我自己 正在回复..."——本质是用户在自言自语。yuanzui0728 实测
    // 群 78a3d894-dd62-... 历史上就被加了这条 SELF 成员行，与前端各页注释一致。
    // 和 createGroup R2 同口径，服务端硬挡：character 类型 SELF_CHARACTER_ID 直接 400。
    if (
      dto.memberType === 'character' &&
      trimmedMemberId === SELF_CHARACTER_ID
    ) {
      throw new AppError('GROUP_CANNOT_ADD_SELF_AS_MEMBER', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Cannot add self mirror character as a group member',
      });
    }
    const existing = await new TenantRepository(this.memberRepo).findOne({
      where: { groupId, memberId: trimmedMemberId },
    });

    if (existing) {
      this.logger.warn(`Member ${dto.memberId} already in group ${groupId}`);
      return existing;
    }

    const resolvedMember = await this.resolveMemberProfile({
      ...dto,
      memberId: trimmedMemberId,
    });
    const member = this.memberRepo.create({
      groupId,
      memberId: trimmedMemberId,
      memberType: dto.memberType,
      memberName: resolvedMember.memberName,
      memberAvatar: resolvedMember.memberAvatar,
      role: 'member',
    });

    await this.memberRepo.save(member);
    this.logger.log(`Added member ${trimmedMemberId} to group ${groupId}`);
    await this.emitGroupConversationUpdated(groupId);
    return member;
  }

  async getGroup(groupId: string): Promise<Group> {
    // 必须 require：本服务其它 endpoint（getMembers / getMessages / getBackground
    // 等）都走 requireAccessibleGroup → 群不存在抛 404；唯独本接口用
    // findAccessibleGroup → null → NestJS 把 null 序列化成 200 + 空 body
    // → 前端 request() 把空 body 当 undefined 返回 → React Query 抛
    // "Query data cannot be undefined". 同时本接口不抛 404 也让前端的
    // isMissingGroupError(groupQuery.error, groupId) 永远 false，得靠
    // membersQuery 的 404 才能触发跳转兜底——多走一个 RTT。
    const group = await this.requireAccessibleGroup(groupId);
    return this.toGroup(group);
  }

  async listGroups(): Promise<Group[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const memberships = await new TenantRepository(this.memberRepo).find({
      where: {
        memberId: owner.id,
        memberType: 'user',
      },
    });
    const groupIds = dedupeIds(
      memberships.map((membership) => membership.groupId),
    );
    if (!groupIds.length) {
      return [];
    }

    const groups = await new TenantRepository(this.groupRepo).find({
      where: {
        id: In(groupIds),
      },
      order: {
        savedToContacts: 'DESC',
        savedToContactsAt: 'DESC',
        lastActivityAt: 'DESC',
        updatedAt: 'DESC',
      },
    });

    return groups.map((group) => this.toGroup(group));
  }

  async listSavedGroups(): Promise<Group[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const groups = await new TenantRepository(this.groupRepo).find({
      where: {
        creatorId: owner.id,
        creatorType: 'user',
        savedToContacts: true,
      },
      order: {
        savedToContactsAt: 'DESC',
        lastActivityAt: 'DESC',
        updatedAt: 'DESC',
      },
    });

    return groups.map((group) => this.toGroup(group));
  }

  async getMembers(groupId: string): Promise<GroupMemberEntity[]> {
    await this.requireAccessibleGroup(groupId);
    const members = await new TenantRepository(this.memberRepo).find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
    });

    // 原版对每个 character 成员各 await 一次 characters.findById：50 人群 ×
    // 每次 chat-list ↔ thread ↔ details ↔ picker ↔ call screen 切页都重打
    // 一遍 useQuery → 50 次串行 SQL。改成单次 findManyByIds，整页 1 次。
    const characterIds = members
      .filter((member) => member.memberType === 'character')
      .map((member) => member.memberId);
    if (!characterIds.length) {
      return members;
    }
    const characters = await this.characters.findManyByIds(characterIds);
    const characterMap = new Map(
      characters.map((character) => [character.id, character] as const),
    );

    return members.map((member) => {
      if (member.memberType !== 'character') {
        return member;
      }
      const character = characterMap.get(member.memberId);
      if (!character) {
        return member;
      }
      return {
        ...member,
        memberName: member.memberName ?? character.name,
        memberAvatar: member.memberAvatar ?? character.avatar ?? undefined,
      };
    });
  }

  async getMessages(
    groupId: string,
    query: number | GroupMessageListQuery = 100,
  ): Promise<GroupMessage[]> {
    const group = await this.requireAccessibleGroup(groupId);
    const options: GroupMessageListQuery =
      typeof query === 'number' ? { limit: query } : query;
    const aroundMessageId = options.aroundMessageId?.trim();

    if (aroundMessageId) {
      const entities = await this.listVisibleGroupMessageEntities(group);
      const window = sliceMessagesAround(
        entities,
        aroundMessageId,
        options.before,
        options.after,
      );
      if (!window) {
        throw new AppError('CHAT_MESSAGE_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          params: { messageId: aroundMessageId },
          legacyMessage: `Message ${aroundMessageId} not found`,
        });
      }

      return window.map((item) => this.toGroupMessage(item));
    }

    const limit = options.limit;
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      const messages = await new TenantRepository(this.messageRepo).find({
        where: this.buildGroupMessageWhere(
          groupId,
          group.lastClearedAt ? new Date(group.lastClearedAt) : undefined,
        ),
        order: { createdAt: 'DESC' },
        take: limit,
      });

      return messages.reverse().map((item) => this.toGroupMessage(item));
    }

    return (await this.listVisibleGroupMessageEntities(group)).map((item) =>
      this.toGroupMessage(item),
    );
  }

  async searchGroupMessages(
    groupId: string,
    query: MessageSearchQuery,
  ): Promise<MessageSearchResponse> {
    const group = await this.requireAccessibleGroup(groupId);
    const messages = (await this.listVisibleGroupMessageEntities(group)).map(
      (item) => this.toGroupMessage(item),
    );

    return searchVisibleMessages(messages, query);
  }

  async updateGroup(groupId: string, dto: UpdateGroupDto): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    // 走查 Round 新 R1：原版 `name: nextName || group.name` 在 dto.name 显式传
    // "" / 纯空白时沉默保留旧名——用户在群聊名称编辑页清空保存，原版返回 200
    // + 同一份旧名 group，client 跳回 details 但名称没变，看着像"保存按钮不
    // 响应"。和 createGroup 同口径：dto.name === undefined（partial update 没
    // 想动）就跳过；显式传过来但 trim 为空就 400 让 client 报错给用户。
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new AppError('GROUP_REQUIRES_NAME', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Group requires a non-empty name',
      });
    }
    const nextName = dto.name?.trim();
    const nextAnnouncement =
      dto.announcement === undefined
        ? undefined
        : dto.announcement?.trim() || null;
    const updated = await this.groupRepo.save({
      ...group,
      name: nextName || group.name,
      announcement:
        nextAnnouncement === undefined
          ? (group.announcement ?? null)
          : nextAnnouncement,
    });

    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async updatePreferences(
    groupId: string,
    dto: UpdateGroupPreferencesDto,
  ): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const isMuted =
      dto.isMuted === undefined ? (group.isMuted ?? false) : dto.isMuted;
    const savedToContacts =
      dto.savedToContacts === undefined
        ? (group.savedToContacts ?? false)
        : dto.savedToContacts;
    const updated = await this.groupRepo.save({
      ...group,
      isMuted,
      mutedAt: isMuted ? (group.mutedAt ?? new Date()) : null,
      savedToContacts,
      savedToContactsAt: savedToContacts
        ? (group.savedToContactsAt ?? new Date())
        : null,
      showMemberNicknames:
        dto.showMemberNicknames ?? group.showMemberNicknames ?? true,
      notifyOnAtMe: dto.notifyOnAtMe ?? group.notifyOnAtMe ?? true,
      notifyOnAtAll: dto.notifyOnAtAll ?? group.notifyOnAtAll ?? true,
      notifyOnAnnouncement:
        dto.notifyOnAnnouncement ?? group.notifyOnAnnouncement ?? true,
    });

    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async setGroupPinned(groupId: string, pinned: boolean): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const updated = await this.groupRepo.save({
      ...group,
      isPinned: pinned,
      pinnedAt: pinned ? new Date() : null,
    });

    // 和本服务里其它写操作（updateGroup / updatePreferences / clearGroupMessages
    // 等）对齐：isMuted / savedToContacts / showMemberNicknames 都走 updatePreferences
    // → emit；唯独 setGroupPinned 不 emit → 多端在线时另一端的 chat-list 不会立刻
    // 把这条群挪到置顶组，要等下次 invalidate refetch 才动，体感像没生效。
    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async clearGroupMessages(groupId: string): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const now = new Date();
    const updated = await this.groupRepo.save({
      ...group,
      lastClearedAt: now,
      lastReadAt: now,
    });

    await this.replyArtifactJobs.cancelGroupJobs(groupId, 'group_cleared');
    await this.mediaInsightJobs.cancelGroupJobs(groupId, 'group_cleared');
    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async markGroupRead(groupId: string): Promise<Group> {
    const group = await this.requireAccessibleGroup(groupId);
    const updated = await this.groupRepo.save({
      ...group,
      lastReadAt: new Date(),
    });

    return this.toGroup(updated);
  }

  async markGroupUnread(groupId: string): Promise<Group> {
    const group = await this.requireAccessibleGroup(groupId);
    const lastCharacterMessage = await new TenantRepository(this.messageRepo).findOne({
      where: group.lastClearedAt
        ? {
            groupId,
            senderType: 'character',
            createdAt: MoreThan(group.lastClearedAt),
          }
        : {
            groupId,
            senderType: 'character',
          },
      order: { createdAt: 'DESC' },
    });

    if (!lastCharacterMessage) {
      return this.toGroup(group);
    }

    const previousReadAt = new Date(
      lastCharacterMessage.createdAt.getTime() - 1,
    );
    const lastClearedAt = group.lastClearedAt
      ? new Date(group.lastClearedAt)
      : null;
    const nextReadAt =
      lastClearedAt && previousReadAt.getTime() < lastClearedAt.getTime()
        ? lastClearedAt
        : previousReadAt;
    const updated = await this.groupRepo.save({
      ...group,
      lastReadAt: nextReadAt,
    });

    return this.toGroup(updated);
  }

  async recallOwnerMessage(
    groupId: string,
    messageId: string,
  ): Promise<GroupMessage> {
    await this.requireAccessibleGroup(groupId);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const message = await new TenantRepository(this.messageRepo).findOneBy({
      id: messageId,
      groupId,
    });

    if (!message) {
      throw new AppError('CHAT_GROUP_MESSAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { messageId },
        legacyMessage: `Group message ${messageId} not found`,
      });
    }

    if (message.senderType !== 'user' || message.senderId !== owner.id) {
      throw new AppError('CHAT_REVOKE_OWN_ONLY', {
        legacyMessage: '只能撤回自己发送的消息。',
      });
    }

    const recalled = await this.messageRepo.save({
      ...message,
      senderId: 'system',
      senderType: 'system',
      senderName: 'system',
      senderAvatar: undefined,
      text: '你撤回了一条消息',
      type: 'system',
      attachmentKind: null,
      attachmentPayload: null,
    });

    await this.replyArtifactJobs.cancelGroupJobs(
      groupId,
      'source_message_recalled',
      {
        sourceMessageId: message.id,
      },
    );
    await this.mediaInsightJobs.cancelGroupJobs(
      groupId,
      'source_message_recalled',
      message.id,
    );
    const recalledMessage = this.toGroupMessage(recalled);
    this.chatGateway.emitThreadMessage(groupId, recalledMessage);
    return recalledMessage;
  }

  async deleteMessage(
    groupId: string,
    messageId: string,
  ): Promise<{ success: true }> {
    const group = await this.requireAccessibleGroup(groupId);
    const message = await new TenantRepository(this.messageRepo).findOneBy({
      id: messageId,
      groupId,
    });

    if (!message) {
      throw new AppError('CHAT_GROUP_MESSAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { messageId },
        legacyMessage: `Group message ${messageId} not found`,
      });
    }

    await new TenantRepository(this.messageRepo).delete({ id: message.id });
    await this.replyArtifactJobs.cancelGroupJobs(
      groupId,
      'source_message_deleted',
      {
        sourceMessageId: message.id,
      },
    );
    await this.mediaInsightJobs.cancelGroupJobs(
      groupId,
      'source_message_deleted',
      message.id,
    );
    await this.syncGroupLastActivity(group);
    await this.emitGroupConversationUpdated(groupId);

    return { success: true };
  }

  async hideGroup(groupId: string): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const updated = await this.groupRepo.save({
      ...group,
      isHidden: true,
      hiddenAt: new Date(),
    });

    // 同其它写操作（updateGroup / updatePreferences / clearGroupMessages /
    // setGroupPinned）对齐：不 emit 的话另一端 chat-list（web + iOS shell
    // / 双端同账号）还会一直显示这条群，要等下一次 60s 兜底轮询才消失。
    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async updateOwnerNickname(
    groupId: string,
    nickname: string,
  ): Promise<GroupMemberEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.requireOwnedGroup(groupId);
    // 走查 R1：原版 `nickname.trim() || member.memberName` 在 PATCH 传空/纯
    // 空白时沉默保留旧昵称——客户端 group-chat-edit-page 自己 disable 了空
    // 提交，但任何直连 API / 老客户端 / 第三方客户端发空昵称时返回 200 +
    // 同一份旧昵称，调用方看着像"保存按钮没响应"或"清空昵称被默默撤回"。
    // 和 createGroup / updateGroup 的 GROUP_REQUIRES_NAME 同口径直接 400。
    const trimmedNickname = nickname?.trim();
    if (!trimmedNickname) {
      throw new AppError('GROUP_REQUIRES_NICKNAME', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Group nickname cannot be empty',
      });
    }
    const member = await new TenantRepository(this.memberRepo).findOne({
      where: {
        groupId,
        memberId: owner.id,
        memberType: 'user',
      },
    });

    if (!member) {
      throw new AppError('CHAT_GROUP_OWNER_MEMBER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { groupId },
        legacyMessage: `Owner member for group ${groupId} not found`,
      });
    }

    const saved = await this.memberRepo.save({
      ...member,
      memberName: trimmedNickname,
    });
    // 走查 R1：和本服务其它写操作（updateGroup / updatePreferences / setGroupPinned
    // / hideGroup / clearGroupMessages / addMember / removeMember）一致 emit
    // conversation_updated。原本漏掉的话，多端在线（web + iOS shell / 双端同账号）
    // 改完群昵称另一端的群信息页 / chat-list 会议项的 memberName 还显示旧值，
    // 要等下次 60s 兜底轮询或用户手动 pull-to-refresh 才更新；socket 一推即同步。
    await this.emitGroupConversationUpdated(groupId);
    return saved;
  }

  async leaveGroup(groupId: string): Promise<{ success: true }> {
    const group = await this.requireOwnedGroup(groupId);

    // delete 后 emitGroupConversationUpdated 拿不到 group 行 → 内部 early
    // return，没事件发出。这里先在 delete 前抓住 members 直接调 gateway，
    // 让另一端 chat-list 收到 conversation_updated → invalidate
    // /conversations 列表 → 列表里没了这条群，自然从 UI 消失。不 emit 的话
    // 多端在线时另一端要等到 60s 兜底轮询；期间用户点进去会撞 404 死页。
    const membersBeforeDelete = await new TenantRepository(this.memberRepo).find({
      where: { groupId: group.id },
      order: { joinedAt: 'ASC' },
    });
    this.chatGateway.emitConversationUpdated({
      id: group.id,
      type: 'group',
      title: group.name,
      participants: membersBeforeDelete.map((member) => member.memberId),
    });

    // 走查第三批 R1：原版只删 members/messages/groups 三张表，遗漏
    // group_reply_tasks。dataset 验证：解散群后 reply_tasks 表里仍残留
    // 该群历史 70+ 条任务，groupId 已 dangling，worker 走 conversationHistory
    // 时拉不到 messages/members，行为不定（abort / 抛错日志 / 不释放
    // replyArtifactJobs slot）。先把 pending 任务 cancel（reason 走
    // group_disbanded 让 worker / artifact job 各自走清理路径），再 delete
    // 整张表的 dangling 行；TypeORM repo.delete 是单 statement，sqlite
    // 没分布式事务概念，前后顺序按 reply_tasks → members → messages →
    // group 依次清空保证就算中间步骤抛也只留下游脏数据可以被下一次走查
    // 再清。
    await this.groupReplyTaskService.deleteAllForGroup(
      group.id,
      'group_disbanded',
    );
    await new TenantRepository(this.memberRepo).delete({ groupId: group.id });
    await new TenantRepository(this.messageRepo).delete({ groupId: group.id });
    await new TenantRepository(this.groupRepo).delete({ id: group.id });

    return { success: true };
  }

  async removeMember(groupId: string, memberId: string) {
    await this.requireOwnedGroup(groupId);
    const member = await new TenantRepository(this.memberRepo).findOne({
      where: {
        groupId,
        memberId,
        memberType: 'character',
      },
    });

    if (!member) {
      throw new AppError('CHAT_GROUP_MEMBER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { memberId },
        legacyMessage: `Member ${memberId} not found in group`,
      });
    }

    await new TenantRepository(this.memberRepo).delete({ id: member.id });
    await this.emitGroupConversationUpdated(groupId);
    return { success: true as const };
  }

  async sendMessage(
    groupId: string,
    senderId: string,
    senderType: 'user' | 'character',
    senderName: string,
    input: SendGroupMessageInput,
    senderAvatar?: string,
  ): Promise<GroupMessage> {
    const group = await this.requireAccessibleGroup(groupId);
    const normalizedInput = await this.normalizeOutgoingMessageInput(input);
    const message = this.messageRepo.create({
      groupId,
      senderId,
      senderType,
      senderName,
      senderAvatar,
      text: normalizedInput.text,
      type: normalizedInput.type,
      attachmentKind: normalizedInput.attachment?.kind ?? null,
      attachmentPayload: normalizedInput.attachment
        ? JSON.stringify(normalizedInput.attachment)
        : null,
    });

    await this.messageRepo.save(message);
    const enrichedAttachment = normalizedInput.attachment
      ? await this.mediaInsightJobs.ensureGroupMessageInsight({
          groupId,
          sourceMessageId: message.id,
          sourceMessageCreatedAt: message.createdAt ?? new Date(),
          attachment: normalizedInput.attachment,
          characterId: senderType === 'character' ? senderId : undefined,
        })
      : undefined;
    const resolvedInput = {
      ...normalizedInput,
      attachment: enrichedAttachment,
      promptText: enrichedAttachment
        ? this.buildMessagePromptText(normalizedInput.text, enrichedAttachment)
        : normalizedInput.promptText,
      aiParts: enrichedAttachment
        ? this.buildAiParts(normalizedInput.text, enrichedAttachment)
        : normalizedInput.aiParts,
    };
    if (resolvedInput.attachment) {
      message.attachmentKind = resolvedInput.attachment.kind;
      message.attachmentPayload = JSON.stringify(resolvedInput.attachment);
    }
    await this.touchGroupActivity(
      group,
      message.createdAt ?? new Date(),
      senderType === 'user',
    );
    if (senderType === 'user') {
      void this.cyberAvatar.captureSignal({
        ownerId: senderId,
        signalType: 'group_message',
        sourceSurface: 'group',
        sourceEntityType: 'group_message',
        sourceEntityId: message.id,
        dedupeKey: `group_message:${message.id}`,
        summaryText: `群聊 ${group.name} 发言：${resolvedInput.promptText.slice(0, 120)}`,
        payload: {
          groupId,
          groupName: group.name,
          messageType: resolvedInput.type,
          text: resolvedInput.promptText,
        },
        occurredAt: message.createdAt ?? new Date(),
      });
    }
    const nextMessage = this.toGroupMessage(message);
    this.chatGateway.emitThreadMessage(groupId, nextMessage);
    return nextMessage;
  }

  async sendOwnerMessage(groupId: string, input: SendGroupMessageInput) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.sendMessage(
      groupId,
      owner.id,
      'user',
      owner.username?.trim() || 'You',
      input,
      owner.avatar ?? undefined,
    );
  }

  async sendSystemMessage(
    groupId: string,
    text: string,
  ): Promise<GroupMessage> {
    const group = await this.requireAccessibleGroup(groupId);
    const message = this.messageRepo.create({
      groupId,
      senderId: 'system',
      senderType: 'character',
      senderName: 'system',
      text,
      type: 'system',
    });

    await this.messageRepo.save(message);
    await this.touchGroupActivity(group, message.createdAt ?? new Date());
    return this.toGroupMessage(message);
  }

  async saveSystemAttachmentMessage(
    groupId: string,
    attachment: MessageAttachment,
    text: string,
  ): Promise<GroupMessage> {
    const group = await this.requireAccessibleGroup(groupId);

    // R6 走查（真实操作发现）：群语音 finalize 端没有幂等保护，重连/双端
    // 同点挂断会写 2 条相同 call_log。按 (groupId, kind='call_log', startedAt)
    // 去重，复用第一条 messageId。socket 也不重发，否则群成员客户端会插重复卡片。
    if (attachment.kind === 'call_log') {
      const startedAtIso = attachment.startedAt;
      if (startedAtIso) {
        const existing = await this.messageRepo
          .createQueryBuilder('m')
          .where('m.groupId = :groupId', { groupId })
          .andWhere('m.attachmentKind = :kind', { kind: 'call_log' })
          .andWhere("json_extract(m.attachmentPayload, '$.startedAt') = :startedAt", { startedAt: startedAtIso })
          .getOne();
        if (existing) {
          return this.toGroupMessage(existing);
        }
      }
    }

    const message = this.messageRepo.create({
      groupId,
      senderId: 'system',
      senderType: 'character',
      senderName: 'system',
      text,
      type: attachment.kind,
      attachmentKind: attachment.kind,
      attachmentPayload: JSON.stringify(attachment),
    });

    await this.messageRepo.save(message);
    await this.touchGroupActivity(group, message.createdAt ?? new Date());
    const nextMessage = this.toGroupMessage(message);
    this.chatGateway.emitThreadMessage(groupId, nextMessage);
    return nextMessage;
  }

  async saveCharacterVoiceMessage(
    groupId: string,
    character: {
      id: string;
      name: string;
      avatar?: string;
    },
    attachment: MessageAttachment,
    text: string,
  ): Promise<GroupMessage> {
    const group = await this.requireAccessibleGroup(groupId);
    const message = this.messageRepo.create({
      groupId,
      senderId: character.id,
      senderType: 'character',
      senderName: character.name,
      senderAvatar: character.avatar,
      text,
      type: attachment.kind,
      attachmentKind: attachment.kind,
      attachmentPayload: JSON.stringify(attachment),
    });

    await this.messageRepo.save(message);
    await this.touchGroupActivity(group, message.createdAt ?? new Date());
    const nextMessage = this.toGroupMessage(message);
    this.chatGateway.emitThreadMessage(groupId, nextMessage);
    return nextMessage;
  }

  async prepareReplyContext(
    groupId: string,
    userMessage: GroupMessage,
  ): Promise<{
    members: GroupMemberEntity[];
    recentMessages: GroupMessageEntity[];
    history: ChatMessage[];
    currentUserContext: GroupUserMessageContext;
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>;
  } | null> {
    const group = await this.requireAccessibleGroup(groupId);
    const members = (
      await new TenantRepository(this.memberRepo).find({
        where: { groupId, memberType: 'character' },
      })
    ).filter((member) => member.memberId !== SELF_CHARACTER_ID);
    if (!members.length) {
      return null;
    }

    const runtimeRules = await this.replyLogicRules.getRules();
    const recentMessages = await new TenantRepository(this.messageRepo).find({
      where: this.buildGroupMessageWhere(
        groupId,
        group.lastClearedAt ? new Date(group.lastClearedAt) : undefined,
      ),
      order: { createdAt: 'DESC' },
      take: Math.max(
        runtimeRules.historyWindow.max,
        DEFAULT_GROUP_REPLY_HISTORY_LIMIT,
      ),
    });
    const history = recentMessages
      .filter((message) => message.id !== userMessage.id)
      .reverse()
      .map((message) => this.buildAiHistoryMessage(message));
    const currentUserContext = await this.buildCurrentUserMessageContext(
      groupId,
      userMessage,
    );

    return { members, recentMessages, history, currentUserContext, runtimeRules };
  }

  async triggerAiReplies(
    groupId: string,
    userMessage: GroupMessage,
  ): Promise<void> {
    const context = await this.prepareReplyContext(groupId, userMessage);
    if (!context) {
      return;
    }
    const { members, recentMessages, history, currentUserContext, runtimeRules } =
      context;
    const plannerDecision =
      await this.groupReplyPlanner.selectReplyActorsForTurn({
        members,
        history: recentMessages,
        currentUserContext,
        runtimeRules,
      });
    if (!plannerDecision.selectedActors.length) {
      return;
    }

    await this.groupReplyTaskService.scheduleTurn({
      groupId,
      triggerMessageId: userMessage.id,
      triggerMessageCreatedAt: userMessage.createdAt,
      plannerDecision,
      conversationHistory: history,
      currentUserContext,
    });
  }

  private async normalizeOutgoingMessageInput(
    input: SendGroupMessageInput,
  ): Promise<{
    type:
      | 'text'
      | 'image'
      | 'file'
      | 'voice'
      | 'contact_card'
      | 'location_card'
      | 'note_card'
      | 'sticker';
    text: string;
    promptText: string;
    aiParts: AiMessagePart[];
    attachment?: MessageAttachment;
  }> {
    if (input.type === 'sticker') {
      const attachment =
        await this.customStickersService.resolveStickerAttachment({
          sourceType: input.attachment.sourceType,
          packId: input.attachment.packId,
          stickerId: input.attachment.stickerId,
        });
      if (!attachment) {
        throw new AppError('CHAT_STICKER_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          legacyMessage: 'Sticker not found',
        });
      }

      const fallbackText =
        input.text?.trim() || this.getAttachmentFallbackText(attachment);
      const promptText = this.buildMessagePromptText(fallbackText, attachment);

      return {
        type: 'sticker',
        text: fallbackText,
        promptText,
        aiParts: this.buildAiParts(fallbackText, attachment),
        attachment,
      };
    }

    if (
      input.type === 'image' ||
      input.type === 'file' ||
      input.type === 'voice' ||
      input.type === 'contact_card' ||
      input.type === 'location_card' ||
      input.type === 'note_card'
    ) {
      if (!input.attachment || input.attachment.kind !== input.type) {
        throw new AppError('CHAT_ATTACHMENT_PAYLOAD_INVALID', {
          legacyMessage: 'Attachment payload is invalid',
        });
      }
      const attachment = input.attachment;

      const fallbackText =
        input.text?.trim() || this.getAttachmentFallbackText(attachment);
      const promptText = this.buildMessagePromptText(fallbackText, attachment);

      return {
        type: input.type,
        text: fallbackText,
        promptText,
        aiParts: this.buildAiParts(fallbackText, attachment),
        attachment,
      };
    }

    const text = input.text.trim();
    if (!text) {
      throw new AppError('CHAT_MESSAGE_TEXT_REQUIRED', {
        legacyMessage: 'Message text is required',
      });
    }

    return {
      type: 'text',
      text,
      promptText: this.buildMessagePromptText(text),
      aiParts: this.buildAiParts(text),
    };
  }

  private buildAiHistoryMessage(message: GroupMessageEntity): ChatMessage {
    const attachment = this.parseAttachment(message);
    const baseText =
      message.senderType === 'user'
        ? message.text
        : sanitizeAiText(message.text);
    const promptText = this.buildMessagePromptText(baseText, attachment);

    return {
      role: 'user',
      content: `[${message.senderName}]: ${promptText}`,
      parts: this.buildAiParts(baseText, attachment),
    };
  }

  private async buildCurrentUserMessageContext(
    groupId: string,
    message: GroupMessage,
  ): Promise<GroupUserMessageContext> {
    const replyContent = extractChatReplyMetadata(message.text);
    const mentionSummary = summarizeChatMentions(replyContent.body);
    const replyTargetMessage = replyContent.reply
      ? await new TenantRepository(this.messageRepo).findOne({
          where: {
            id: replyContent.reply.messageId,
            groupId,
          },
        })
      : null;

    return {
      promptText: this.buildMessagePromptText(message.text, message.attachment),
      parts: this.buildAiParts(message.text, message.attachment),
      mentions: mentionSummary.mentions,
      hasMentionAll: mentionSummary.hasMentionAll,
      replyMetadata: replyContent.reply,
      replyTargetMessage,
    };
  }

  private buildAiParts(
    text: string,
    attachment?: MessageAttachment,
  ): AiMessagePart[] {
    const promptText = this.buildMessagePromptText(text, attachment);
    if (!attachment) {
      return this.buildTextAiParts(promptText);
    }

    if (attachment.kind === 'image') {
      return [
        {
          type: 'image',
          imageUrl: attachment.url,
          detail: 'auto',
          altText: promptText,
          mimeType: attachment.mimeType,
        },
      ];
    }

    if (attachment.kind === 'file') {
      if (this.isAudioMimeType(attachment.mimeType)) {
        return [
          {
            type: 'audio',
            audioUrl: attachment.url,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
            transcriptText: attachment.transcriptText,
            summaryText: promptText,
          },
        ];
      }

      if (this.isVideoMimeType(attachment.mimeType)) {
        return [
          {
            type: 'video',
            videoUrl: attachment.url,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
            transcriptText: attachment.transcriptText,
            summaryText: promptText,
          },
        ];
      }

      if (this.isDocumentMimeType(attachment.mimeType, attachment.fileName)) {
        return [
          {
            type: 'document',
            url: attachment.url,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
            extractedText: attachment.extractedText,
            summaryText: promptText,
          },
        ];
      }

      return [
        {
          type: 'file',
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          url: attachment.url,
          summaryText: promptText,
        },
      ];
    }

    if (attachment.kind === 'voice') {
      return [
        {
          type: 'audio',
          audioUrl: attachment.url,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
          durationMs: attachment.durationMs,
          transcriptText: attachment.transcriptText,
          summaryText: promptText,
        },
      ];
    }

    if (attachment.kind === 'contact_card') {
      return [
        {
          type: 'contact_card',
          name: attachment.name,
          relationship: attachment.relationship,
          bio: attachment.bio,
          summaryText: promptText,
        },
      ];
    }

    if (attachment.kind === 'location_card') {
      return [
        {
          type: 'location_card',
          title: attachment.title,
          subtitle: attachment.subtitle,
          summaryText: promptText,
        },
      ];
    }

    if (attachment.kind === 'note_card') {
      return this.buildTextAiParts(promptText);
    }

    return [
      {
        type: 'text',
        text: promptText,
      },
    ];
  }

  private buildTextAiParts(text: string): AiMessagePart[] {
    return [{ type: 'text', text }];
  }

  private isAudioMimeType(mimeType?: string) {
    return Boolean(mimeType && /^audio\//i.test(mimeType));
  }

  private isVideoMimeType(mimeType?: string) {
    return Boolean(mimeType && /^video\//i.test(mimeType));
  }

  private isDocumentMimeType(mimeType?: string, fileName?: string) {
    if (mimeType) {
      if (/^text\//i.test(mimeType)) {
        return true;
      }

      if (
        /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/json|application\/xml|text\/markdown|text\/csv)$/i.test(
          mimeType,
        )
      ) {
        return true;
      }
    }

    return /\.(pdf|txt|md|markdown|csv|json|doc|docx)$/i.test(fileName ?? '');
  }

  private buildMessagePromptText(
    text: string,
    attachment?: MessageAttachment,
  ): string {
    const replyContent = extractChatReplyMetadata(text);
    const mentionSummary = summarizeChatMentions(replyContent.body);
    const bodyText = replyContent.body.trim();

    const replyPrefix = replyContent.reply
      ? this.buildReplyContextPrefix(replyContent.reply)
      : '';
    const mentionPrefix = mentionSummary.mentions.length
      ? `提到了：${mentionSummary.mentions.join('、')}`
      : '';

    if (!attachment) {
      return [replyPrefix, mentionPrefix, bodyText].filter(Boolean).join('\n');
    }

    const fallbackText = this.getAttachmentFallbackText(attachment);
    const caption =
      bodyText && bodyText !== fallbackText ? bodyText : undefined;

    let attachmentSummary = '';

    if (attachment.kind === 'image') {
      const generatedImagePrompt =
        attachment.generatedContext?.imagePrompt?.trim() || '';
      const generatedImageHistoryText =
        resolveGeneratedAttachmentHistoryText(attachment);
      const dimensions =
        attachment.width && attachment.height
          ? `，尺寸 ${attachment.width}x${attachment.height}`
          : '';
      const captionText = caption ? `，补充说明：${caption}` : '';
      if (generatedImagePrompt) {
        attachmentSummary =
          `发来一张图片，内容大致是：${generatedImagePrompt}${dimensions}${captionText}`.trim();
      } else if (generatedImageHistoryText) {
        attachmentSummary = [
          generatedImageHistoryText,
          caption ? `补充说明：${caption}` : '',
        ]
          .filter(Boolean)
          .join('，')
          .trim();
      } else {
        attachmentSummary =
          `发来一张图片，文件名：${attachment.fileName}${dimensions}${captionText}`.trim();
      }
    } else if (attachment.kind === 'file') {
      const sizeText = formatGroupAttachmentSize(attachment.size);
      const captionText = caption ? `，补充说明：${caption}` : '';
      const documentExcerpt = buildDocumentPromptExcerpt({
        attachment,
        queryText: caption,
      });
      if (
        /^(audio|video)\//i.test(attachment.mimeType) &&
        attachment.transcriptText?.trim()
      ) {
        const mediaLabel = attachment.mimeType.startsWith('video/')
          ? '视频'
          : '音频';
        attachmentSummary =
          `发来一个${mediaLabel}文件《${attachment.fileName}》${sizeText ? `，大小：${sizeText}` : ''}${captionText}，转写内容：${attachment.transcriptText.trim()}`.trim();
      } else if (documentExcerpt) {
        attachmentSummary =
          `发来一个文档《${attachment.fileName}》${attachment.mimeType ? `，类型：${attachment.mimeType}` : ''}${sizeText ? `，大小：${sizeText}` : ''}${captionText}，提取内容：${documentExcerpt}`.trim();
      } else {
        attachmentSummary =
          `发来一个文件《${attachment.fileName}》${attachment.mimeType ? `，类型：${attachment.mimeType}` : ''}${sizeText ? `，大小：${sizeText}` : ''}${captionText}`.trim();
      }
    } else if (attachment.kind === 'voice') {
      const durationText =
        attachment.durationMs && attachment.durationMs > 0
          ? `，时长：${formatGroupAttachmentDuration(attachment.durationMs)}`
          : '';
      const captionText = caption ? `，补充说明：${caption}` : '';
      attachmentSummary = buildVoiceAttachmentSummary({
        durationText,
        captionText,
        transcriptText: attachment.transcriptText,
      });
    } else if (attachment.kind === 'contact_card') {
      attachmentSummary =
        `分享了一张名片：${attachment.name}${attachment.relationship ? `，关系：${attachment.relationship}` : ''}${attachment.bio ? `，简介：${attachment.bio}` : ''}`.trim();
    } else if (attachment.kind === 'location_card') {
      attachmentSummary =
        `分享了一个位置：${attachment.title}${attachment.subtitle ? `，${attachment.subtitle}` : ''}`.trim();
    } else if (attachment.kind === 'note_card') {
      const detailParts = [
        `分享了一条笔记：${attachment.title}`,
        attachment.excerpt ? `摘要：${attachment.excerpt}` : '',
        attachment.tags.length
          ? `标签：${attachment.tags.map((tag) => `#${tag}`).join(' ')}`
          : '',
      ].filter(Boolean);
      const captionText = caption ? `，补充说明：${caption}` : '';
      attachmentSummary = `${detailParts.join('，')}${captionText}`.trim();
    } else if (attachment.kind === 'feed_post_card') {
      const detailParts = [
        `转发了一条 ${attachment.authorName} 的视频号`,
        attachment.title ? `标题：${attachment.title}` : '',
        attachment.excerpt ? `摘要：${attachment.excerpt}` : '',
      ].filter(Boolean);
      const captionText = caption ? `，补充说明：${caption}` : '';
      attachmentSummary = `${detailParts.join('，')}${captionText}`.trim();
    } else if (attachment.kind === 'call_log') {
      // call_log 是系统记录，不进 user prompt 路径；返回空让 prompt-text 走兜底。
      attachmentSummary = '';
    } else {
      attachmentSummary = caption
        ? `发送了一个表情包：${attachment.label ?? attachment.stickerId}，补充说明：${caption}`
        : `发送了一个表情包：${attachment.label ?? attachment.stickerId}`;
    }

    return [replyPrefix, mentionPrefix, attachmentSummary]
      .filter(Boolean)
      .join('\n');
  }

  private buildReplyContextPrefix(reply: ChatReplyMetadata) {
    const quotedText = reply.quotedText?.trim() || reply.previewText.trim();
    return quotedText
      ? `正在回复 ${reply.senderName}：${quotedText}`
      : `正在回复 ${reply.senderName}`;
  }

  private getAttachmentFallbackText(attachment: MessageAttachment) {
    return (
      describeAttachmentForDisplay(attachment, {
        maxChars: 160,
      }) || '附件消息'
    );
  }

  private toGroupMessage(entity: GroupMessageEntity): GroupMessage {
    return {
      id: entity.id,
      groupId: entity.groupId,
      senderId: entity.senderId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderName: entity.senderName,
      senderAvatar: entity.senderAvatar ?? undefined,
      type: entity.type as
        | 'text'
        | 'system'
        | 'sticker'
        | 'image'
        | 'file'
        | 'voice'
        | 'contact_card'
        | 'location_card'
        | 'note_card',
      text:
        entity.senderType === 'user'
          ? entity.text
          : sanitizeAiText(entity.text),
      attachment: this.parseAttachment(entity),
      createdAt: entity.createdAt,
    };
  }

  private parseAttachment(
    entity: GroupMessageEntity,
  ): MessageAttachment | undefined {
    if (!entity.attachmentKind || !entity.attachmentPayload) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(entity.attachmentPayload) as MessageAttachment;
      if (parsed.kind !== entity.attachmentKind) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  private buildGroupMessageWhere(
    groupId: string,
    since?: Date,
    extra: Partial<
      Pick<GroupMessageEntity, 'senderType' | 'senderId' | 'type'>
    > = {},
  ): FindOptionsWhere<GroupMessageEntity> {
    // 共享 world：group_messages 行都带 ownerId，集中给所有走 buildGroupMessageWhere 的
    // 群消息读注入当前租户 ownerId，防跨租户串号（与 chat.service.buildMessageWhere 对称）。
    // LPP 不注入（透传，ownerId 列为 NULL）；调用都在请求/cron 租户帧内。
    return {
      groupId,
      ...(isSharedWorldMode()
        ? { ownerId: TenantContextStore.getOrThrow().ownerId }
        : {}),
      ...(since ? { createdAt: MoreThan(since) } : {}),
      ...extra,
    };
  }

  private listVisibleGroupMessageEntities(group: GroupEntity) {
    return new TenantRepository(this.messageRepo).find({
      where: this.buildGroupMessageWhere(
        group.id,
        group.lastClearedAt ? new Date(group.lastClearedAt) : undefined,
      ),
      order: { createdAt: 'ASC' },
    });
  }

  private async findAccessibleGroup(
    groupId: string,
  ): Promise<GroupEntity | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const membership = await new TenantRepository(this.memberRepo).findOne({
      where: {
        groupId,
        memberId: owner.id,
        memberType: 'user',
      },
    });

    if (!membership) {
      return null;
    }

    // 共享 world：group id 全局唯一但裸 findOne({id}) 仍可被枚举到别租户的群 → 触读守卫
    // 报警/泄漏。走 TenantRepository 按 ownerId 过滤（shared 注入 / LPP 透传）。
    return new TenantRepository(this.groupRepo).findOne({
      where: { id: groupId },
    });
  }

  private async requireAccessibleGroup(groupId: string): Promise<GroupEntity> {
    const group = await this.findAccessibleGroup(groupId);
    if (!group) {
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { groupId },
        legacyMessage: `Group ${groupId} not found`,
      });
    }

    return group;
  }

  private async requireOwnedGroup(groupId: string): Promise<GroupEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const group = await new TenantRepository(this.groupRepo).findOne({
      where: {
        id: groupId,
        creatorId: owner.id,
        creatorType: 'user',
      },
    });

    if (!group) {
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { groupId },
        legacyMessage: `Group ${groupId} not found`,
      });
    }

    return group;
  }

  private async resolveMemberProfile(dto: AddMemberDto) {
    if (dto.memberType === 'character') {
      const character = await this.characters.findById(dto.memberId);
      if (!character) {
        throw new AppError('CHARACTER_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          params: { id: dto.memberId },
          legacyMessage: `Character ${dto.memberId} not found`,
        });
      }

      return {
        memberName: dto.memberName?.trim() || character.name,
        memberAvatar: dto.memberAvatar ?? character.avatar ?? undefined,
      };
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    if (dto.memberId !== owner.id) {
      throw new AppError('CHAT_GROUP_ONLY_OWNER_AS_USER', {
        legacyMessage: 'Only the world owner can be added as user',
      });
    }

    return {
      memberName: dto.memberName?.trim() || owner.username?.trim() || 'You',
      memberAvatar: dto.memberAvatar ?? owner.avatar ?? undefined,
    };
  }

  private async copySharedConversationMessages(
    group: GroupEntity,
    owner: {
      id: string;
      username?: string | null;
      avatar?: string | null;
    },
    dto: CreateGroupDto,
    manager?: EntityManager,
  ) {
    const sourceConversationId = dto.sourceConversationId?.trim();
    const sharedMessageIds = dedupeIds(dto.sharedMessageIds ?? []);
    if (!sourceConversationId || !sharedMessageIds.length) {
      return 0;
    }

    const conversationRepo = manager
      ? manager.getRepository(ConversationEntity)
      : this.conversationRepo;
    const conversationMessageRepo = manager
      ? manager.getRepository(MessageEntity)
      : this.conversationMessageRepo;
    const messageRepo = manager
      ? manager.getRepository(GroupMessageEntity)
      : this.messageRepo;
    const groupRepo = manager
      ? manager.getRepository(GroupEntity)
      : this.groupRepo;

    const conversation = await conversationRepo.findOne({
      where: {
        id: sourceConversationId,
        ownerId: owner.id,
        type: 'direct',
      },
    });
    if (!conversation) {
      throw new AppError('CHAT_CONVERSATION_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { conversationId: sourceConversationId },
        legacyMessage: `Conversation ${sourceConversationId} not found`,
      });
    }

    const sourceMessages = await conversationMessageRepo.find({
      where: {
        conversationId: sourceConversationId,
        id: In(sharedMessageIds),
      },
      order: { createdAt: 'ASC' },
    });
    if (!sourceMessages.length) {
      return 0;
    }

    const selectedIdSet = new Set(sharedMessageIds);
    const selectedMessages = sourceMessages.filter((message) =>
      selectedIdSet.has(message.id),
    );
    if (!selectedMessages.length) {
      return 0;
    }

    const sourceParticipantName =
      (await this.characters.findById(conversation.participants[0] ?? ''))
        ?.name ?? conversation.title;

    const messagesToSave: GroupMessageEntity[] = [
      messageRepo.create({
        groupId: group.id,
        senderId: 'system',
        senderType: 'system',
        senderName: 'system',
        type: 'system',
        text: await this.buildSharedChatRecordsMessage(
          sourceParticipantName,
          selectedMessages.length,
        ),
      }),
      ...selectedMessages.map((sourceMessage) =>
        messageRepo.create({
          groupId: group.id,
          senderId: sourceMessage.senderId,
          senderType: sourceMessage.senderType,
          senderName: sourceMessage.senderName,
          type: sourceMessage.type,
          text: sourceMessage.text,
          attachmentKind: sourceMessage.attachmentKind ?? null,
          attachmentPayload: sourceMessage.attachmentPayload ?? null,
        }),
      ),
    ];

    await messageRepo.save(messagesToSave);

    group.lastActivityAt = new Date();
    await groupRepo.save(group);
    // emit 已上提到 createGroup 调用方 transaction 之后；这里不再 emit 避免：
    // (a) transaction 未 commit 时 emitGroupConversationUpdated 用默认数据源
    //     查不到行造成 socket 静默丢失；(b) 同一次创建 fires 两次 emit。
    return selectedMessages.length;
  }

  private async buildSharedChatRecordsMessage(
    sourceParticipantName: string,
    count: number,
  ) {
    const language = await this.worldLanguage.getLanguage();
    switch (language) {
      case 'en-US':
        return `Shared ${count} chat records between you and ${sourceParticipantName}.`;
      case 'ja-JP':
        return `あなたと${sourceParticipantName}のチャット履歴を${count}件共有しました。`;
      case 'ko-KR':
        return `당신과 ${sourceParticipantName}의 채팅 기록 ${count}개를 공유했어요.`;
      case 'zh-CN':
      default:
        return `已分享你和 ${sourceParticipantName} 的 ${count} 条聊天记录`;
    }
  }

  private toGroup(entity: GroupEntity): Group {
    return {
      id: entity.id,
      name: entity.name,
      avatar: entity.avatar ?? undefined,
      creatorId: entity.creatorId,
      creatorType: entity.creatorType as 'user' | 'character',
      announcement: entity.announcement ?? undefined,
      isMuted: entity.isMuted ?? false,
      mutedAt: entity.mutedAt ?? undefined,
      isPinned: entity.isPinned ?? false,
      pinnedAt: entity.pinnedAt ?? undefined,
      savedToContacts: entity.savedToContacts ?? false,
      savedToContactsAt: entity.savedToContactsAt ?? undefined,
      showMemberNicknames: entity.showMemberNicknames ?? true,
      notifyOnAtMe: entity.notifyOnAtMe ?? true,
      notifyOnAtAll: entity.notifyOnAtAll ?? true,
      notifyOnAnnouncement: entity.notifyOnAnnouncement ?? true,
      lastClearedAt: entity.lastClearedAt ?? undefined,
      lastReadAt: entity.lastReadAt ?? undefined,
      isHidden: entity.isHidden ?? false,
      hiddenAt: entity.hiddenAt ?? undefined,
      lastActivityAt:
        entity.lastActivityAt ?? entity.updatedAt ?? entity.createdAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private async emitGroupConversationUpdated(groupId: string) {
    const group = await new TenantRepository(this.groupRepo).findOneBy({
      id: groupId,
    });
    if (!group) {
      return;
    }

    const members = await new TenantRepository(this.memberRepo).find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
    });

    this.chatGateway.emitConversationUpdated({
      id: groupId,
      type: 'group',
      title: group.name,
      participants: members.map((member) => member.memberId),
    });
  }

  private async touchGroupActivity(
    group: GroupEntity,
    at: Date,
    markRead = false,
  ) {
    group.lastActivityAt = at;
    if (group.isHidden) {
      group.isHidden = false;
      group.hiddenAt = null;
    }
    if (markRead) {
      group.lastReadAt = at;
    }
    await this.groupRepo.save(group);
  }

  private async syncGroupLastActivity(group: GroupEntity): Promise<void> {
    const lastMessage = await new TenantRepository(this.messageRepo).findOne({
      where: group.lastClearedAt
        ? {
            groupId: group.id,
            createdAt: MoreThan(group.lastClearedAt),
          }
        : { groupId: group.id },
      order: { createdAt: 'DESC' },
    });
    const timestamps = [
      lastMessage?.createdAt,
      group.lastClearedAt ?? undefined,
      group.createdAt,
    ]
      .filter((value): value is Date => Boolean(value))
      .map((value) => new Date(value).getTime());

    if (!timestamps.length) {
      return;
    }

    const nextLastActivityAt = new Date(Math.max(...timestamps));
    if (
      group.lastActivityAt &&
      group.lastActivityAt.getTime() === nextLastActivityAt.getTime()
    ) {
      return;
    }

    group.lastActivityAt = nextLastActivityAt;
    await this.groupRepo.save(group);
  }
}

function dedupeIds(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function formatGroupAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return '';
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function formatGroupAttachmentDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '';
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}"`;
}
// i18n-ignore-end
