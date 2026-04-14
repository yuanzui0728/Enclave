import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SystemConfigService } from '../config/config.service';
import { ChatService } from './chat.service';
import {
  FavoritesService,
  type CreateMessageFavoriteInput,
  type UpsertFavoriteNoteInput,
} from './favorites.service';
import { GroupService } from './group.service';
import { DigitalHumanCallsService } from './digital-human-calls.service';
import { CustomStickersService } from './custom-stickers.service';
import { VoiceCallsService } from './voice-calls.service';
import {
  MessageRemindersService,
  type CreateMessageReminderInput,
  type MarkMessageReminderNotifiedInput,
} from './message-reminders.service';
import type {
  ContactCardAttachment,
  FileAttachment,
  ImageAttachment,
  LocationCardAttachment,
  NoteCardAttachment,
  StickerAttachment,
} from './chat.types';

@Controller('conversations')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly groupService: GroupService,
  ) {}

  @Get()
  getConversations() {
    return this.chatService.getConversations();
  }

  @Post()
  getOrCreate(@Body() body: { characterId: string }) {
    return this.chatService.getOrCreateConversation(body.characterId);
  }

  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('aroundMessageId') aroundMessageId?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.chatService.getMessages(id, {
      limit: parsePositiveNumber(limit),
      aroundMessageId: aroundMessageId?.trim() || undefined,
      before: parseNonNegativeNumber(before),
      after: parseNonNegativeNumber(after),
    });
  }

  @Get(':id/message-search')
  searchMessages(
    @Param('id') id: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('messageType') messageType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.searchConversationMessages(id, {
      keyword,
      category,
      messageType,
      dateFrom,
      dateTo,
      cursor,
      limit: parsePositiveNumber(limit),
    });
  }

  @Post(':conversationId/messages/:messageId/recall')
  recallMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatService.recallConversationMessage(
      conversationId,
      messageId,
    );
  }

  @Delete(':conversationId/messages/:messageId')
  deleteMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatService.deleteConversationMessage(
      conversationId,
      messageId,
    );
  }

  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.chatService.markConversationRead(id);
  }

  @Post(':id/unread')
  markUnread(@Param('id') id: string) {
    return this.chatService.markConversationUnread(id);
  }

  @Post(':id/pin')
  setPinned(@Param('id') id: string, @Body() body: { pinned: boolean }) {
    return this.chatService.setConversationPinned(id, body.pinned);
  }

  @Post(':id/mute')
  setMuted(@Param('id') id: string, @Body() body: { muted: boolean }) {
    return this.chatService.setConversationMuted(id, body.muted);
  }

  @Post(':id/strong-reminder')
  setStrongReminder(
    @Param('id') id: string,
    @Body() body: { enabled: boolean; durationHours?: number },
  ) {
    return this.chatService.setConversationStrongReminder(
      id,
      body.enabled,
      body.durationHours,
    );
  }

  @Post(':id/hide')
  hideConversation(@Param('id') id: string) {
    return this.chatService.hideConversation(id);
  }

  @Post(':id/clear')
  clearConversation(@Param('id') id: string) {
    return this.chatService.clearConversationHistory(id);
  }
}

type UploadedAttachmentFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

const CHAT_ATTACHMENT_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;

@Controller('chat')
export class ChatAttachmentController {
  constructor(private readonly chatService: ChatService) {}

  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: CHAT_ATTACHMENT_UPLOAD_LIMIT_BYTES,
      },
    }),
  )
  async uploadAttachment(
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: { width?: string; height?: string; durationMs?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先选择一个附件。');
    }

    return {
      attachment: await this.chatService.saveUploadedAttachment(file, {
        width: body.width ? Number(body.width) : undefined,
        height: body.height ? Number(body.height) : undefined,
        durationMs: body.durationMs ? Number(body.durationMs) : undefined,
      }),
    };
  }

  @Get('attachments/:fileName')
  getAttachment(
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    return response.sendFile(
      this.chatService.resolveAttachmentFilePath(
        this.chatService.normalizeAttachmentFileName(fileName),
      ),
    );
  }
}

@Controller('chat/stickers')
export class ChatStickerController {
  constructor(
    private readonly customStickersService: CustomStickersService,
  ) {}

  @Get('catalog')
  getCatalog() {
    return this.customStickersService.getStickerCatalog();
  }

  @Post('custom')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 6 * 1024 * 1024,
      },
    }),
  )
  createCustomSticker(
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: { label?: string; keywords?: string; width?: string; height?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先选择一个表情文件。');
    }

    return this.customStickersService.createCustomSticker(file, {
      label: body.label,
      keywords: body.keywords,
      width: body.width ? Number(body.width) : undefined,
      height: body.height ? Number(body.height) : undefined,
    });
  }

  @Post('custom/from-message')
  createCustomStickerFromMessage(
    @Body()
    body: {
      threadType?: 'conversation' | 'group';
      threadId?: string;
      messageId?: string;
      label?: string;
      keywords?: string;
    },
  ) {
    const threadType = body.threadType;
    const threadId = body.threadId?.trim();
    const messageId = body.messageId?.trim();

    if (threadType !== 'conversation' && threadType !== 'group') {
      throw new BadRequestException('缺少合法的 threadType。');
    }

    if (!threadId || !messageId) {
      throw new BadRequestException('缺少 threadId 或 messageId。');
    }

    return this.customStickersService.createCustomStickerFromMessage({
      threadType,
      threadId,
      messageId,
      label: body.label,
      keywords: body.keywords,
    });
  }

  @Delete('custom/:id')
  deleteCustomSticker(@Param('id') id: string) {
    return this.customStickersService.deleteCustomSticker(id);
  }

  @Get('assets/:fileName')
  getCustomStickerAsset(
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    return response.sendFile(
      this.customStickersService.normalizeCustomStickerFileName(fileName),
      {
        root: this.customStickersService.getCustomStickerStorageDir(),
      },
    );
  }
}

@Controller('chat/voice-calls')
export class VoiceCallsController {
  constructor(private readonly voiceCallsService: VoiceCallsService) {}

  @Post('turns')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  createTurn(
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @Body() body: { conversationId?: string; characterId?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先录一段语音再试。');
    }

    const conversationId = body.conversationId?.trim();
    if (!conversationId) {
      throw new BadRequestException('缺少 conversationId。');
    }

    return this.voiceCallsService.createTurn(file, {
      conversationId,
      characterId: body.characterId?.trim() || undefined,
    });
  }
}

@Controller('chat/digital-human-calls')
export class DigitalHumanCallsController {
  constructor(
    private readonly digitalHumanCallsService: DigitalHumanCallsService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  @Post('sessions')
  createSession(
    @Body()
    body: {
      conversationId?: string;
      characterId?: string;
      mode?: 'desktop_video_call' | 'mobile_video_call';
    },
  ) {
    const conversationId = body.conversationId?.trim();
    if (!conversationId) {
      throw new BadRequestException('缺少 conversationId。');
    }

    return this.digitalHumanCallsService.createSession({
      conversationId,
      characterId: body.characterId?.trim() || undefined,
      mode: body.mode,
    });
  }

  @Get('sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.digitalHumanCallsService.getSession(sessionId);
  }

  @Get('sessions/:sessionId/player')
  renderPlayer(
    @Param('sessionId') sessionId: string,
    @Res() response: Response,
  ) {
    response.type('html');
    return response.send(
      this.digitalHumanCallsService.renderPlayerPage(sessionId),
    );
  }

  @Get('sessions/:sessionId/events')
  streamSessionEvents(
    @Param('sessionId') sessionId: string,
    @Res() response: Response,
  ) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    const writeEvent = (
      payload: ReturnType<DigitalHumanCallsService['getSession']>,
    ) => {
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    writeEvent(this.digitalHumanCallsService.getSession(sessionId));
    const unsubscribe = this.digitalHumanCallsService.subscribeSession(
      sessionId,
      writeEvent,
    );
    const heartbeat = setInterval(() => {
      response.write(': keepalive\n\n');
    }, 15000);

    response.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  }

  @Patch('sessions/:sessionId/provider-state')
  async updateProviderState(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      renderStatus?: 'queued' | 'rendering' | 'ready' | 'failed';
      status?: 'ready' | 'playing' | 'ended';
      playerUrl?: string;
      streamUrl?: string;
      posterUrl?: string;
    },
    @Headers('x-digital-human-token') digitalHumanToken?: string,
    @Headers('authorization') authorization?: string,
    @Query('token') token?: string,
  ) {
    const expectedToken = await this.resolveProviderCallbackToken();
    if (expectedToken) {
      const bearerToken = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;
      const providedToken =
        digitalHumanToken?.trim() || bearerToken || token?.trim() || undefined;
      if (providedToken !== expectedToken) {
        throw new ForbiddenException('数字人 provider 回调鉴权失败。');
      }
    }

    if (
      body.renderStatus !== 'queued' &&
      body.renderStatus !== 'rendering' &&
      body.renderStatus !== 'ready' &&
      body.renderStatus !== 'failed'
    ) {
      throw new BadRequestException('缺少合法的 renderStatus。');
    }

    if (
      body.status &&
      body.status !== 'ready' &&
      body.status !== 'playing' &&
      body.status !== 'ended'
    ) {
      throw new BadRequestException('status 非法。');
    }

    return this.digitalHumanCallsService.updateProviderState(sessionId, {
      renderStatus: body.renderStatus,
      status: body.status,
      playerUrl: body.playerUrl?.trim(),
      streamUrl: body.streamUrl?.trim(),
      posterUrl: body.posterUrl?.trim(),
    });
  }

  private async resolveProviderCallbackToken() {
    return (
      (
        (await this.systemConfigService.getConfig(
          'digital_human_provider_callback_token',
        )) ?? process.env.DIGITAL_HUMAN_PROVIDER_CALLBACK_TOKEN
      )?.trim() || null
    );
  }

  @Delete('sessions/:sessionId')
  closeSession(@Param('sessionId') sessionId: string) {
    return this.digitalHumanCallsService.closeSession(sessionId);
  }

  @Post('sessions/:sessionId/turns')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  createTurn(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('请先录一段语音再试。');
    }

    return this.digitalHumanCallsService.createTurn(sessionId, file);
  }
}

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  getFavorites() {
    return this.favoritesService.listFavorites();
  }

  @Post('messages')
  createMessageFavorite(@Body() body: CreateMessageFavoriteInput) {
    return this.favoritesService.createMessageFavorite(body);
  }

  @Get('notes')
  getFavoriteNotes() {
    return this.favoritesService.listFavoriteNotes();
  }

  @Get('notes/:id')
  getFavoriteNote(@Param('id') id: string) {
    return this.favoritesService.getFavoriteNote(id);
  }

  @Post('notes')
  createFavoriteNote(@Body() body: UpsertFavoriteNoteInput) {
    return this.favoritesService.createFavoriteNote(body);
  }

  @Patch('notes/:id')
  updateFavoriteNote(
    @Param('id') id: string,
    @Body() body: UpsertFavoriteNoteInput,
  ) {
    return this.favoritesService.updateFavoriteNote(id, body);
  }

  @Delete('notes/:id')
  removeFavoriteNote(@Param('id') id: string) {
    return this.favoritesService.removeFavoriteNote(id);
  }

  @Delete(':sourceId')
  removeFavorite(@Param('sourceId') sourceId: string) {
    return this.favoritesService.removeFavorite(sourceId);
  }
}

@Controller('reminders/messages')
export class MessageRemindersController {
  constructor(
    private readonly messageRemindersService: MessageRemindersService,
  ) {}

  @Get()
  getMessageReminders() {
    return this.messageRemindersService.listMessageReminders();
  }

  @Post()
  createMessageReminder(@Body() body: CreateMessageReminderInput) {
    return this.messageRemindersService.createMessageReminder(body);
  }

  @Post(':sourceId/notified')
  markMessageReminderNotified(
    @Param('sourceId') sourceId: string,
    @Body() body?: MarkMessageReminderNotifiedInput,
  ) {
    return this.messageRemindersService.markMessageReminderNotified(
      sourceId,
      body,
    );
  }

  @Delete(':sourceId')
  removeMessageReminder(@Param('sourceId') sourceId: string) {
    return this.messageRemindersService.removeMessageReminder(sourceId);
  }
}

@Controller('groups')
export class GroupController {
  private readonly logger = new Logger(GroupController.name);

  constructor(private readonly groupService: GroupService) {}

  @Post()
  createGroup(
    @Body()
    body: {
      name: string;
      memberIds: string[];
      sourceConversationId?: string;
      sharedMessageIds?: string[];
    },
  ) {
    return this.groupService.createGroup(body);
  }

  @Patch(':id')
  updateGroup(
    @Param('id') id: string,
    @Body() body: { name?: string; announcement?: string | null },
  ) {
    return this.groupService.updateGroup(id, body);
  }

  @Patch(':id/preferences')
  updateGroupPreferences(
    @Param('id') id: string,
    @Body()
    body: {
      isMuted?: boolean;
      savedToContacts?: boolean;
      showMemberNicknames?: boolean;
      notifyOnAtMe?: boolean;
      notifyOnAtAll?: boolean;
      notifyOnAnnouncement?: boolean;
    },
  ) {
    return this.groupService.updatePreferences(id, body);
  }

  @Get()
  getGroups() {
    return this.groupService.listGroups();
  }

  @Get('saved')
  getSavedGroups() {
    return this.groupService.listSavedGroups();
  }

  @Get(':id')
  getGroup(@Param('id') id: string) {
    return this.groupService.getGroup(id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.groupService.getMembers(id);
  }

  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('aroundMessageId') aroundMessageId?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.groupService.getMessages(id, {
      limit: parsePositiveNumber(limit),
      aroundMessageId: aroundMessageId?.trim() || undefined,
      before: parseNonNegativeNumber(before),
      after: parseNonNegativeNumber(after),
    });
  }

  @Get(':id/message-search')
  searchMessages(
    @Param('id') id: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('messageType') messageType?: string,
    @Query('senderId') senderId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.groupService.searchGroupMessages(id, {
      keyword,
      category,
      messageType,
      senderId,
      dateFrom,
      dateTo,
      cursor,
      limit: parsePositiveNumber(limit),
    });
  }

  @Post(':groupId/messages/:messageId/recall')
  recallGroupMessage(
    @Param('groupId') groupId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.groupService.recallOwnerMessage(groupId, messageId);
  }

  @Delete(':groupId/messages/:messageId')
  deleteGroupMessage(
    @Param('groupId') groupId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.groupService.deleteMessage(groupId, messageId);
  }

  @Post(':id/pin')
  pinGroup(@Param('id') id: string, @Body() body: { pinned: boolean }) {
    return this.groupService.setGroupPinned(id, body.pinned);
  }

  @Post(':id/clear')
  clearGroup(@Param('id') id: string) {
    return this.groupService.clearGroupMessages(id);
  }

  @Post(':id/read')
  markGroupRead(@Param('id') id: string) {
    return this.groupService.markGroupRead(id);
  }

  @Post(':id/unread')
  markGroupUnread(@Param('id') id: string) {
    return this.groupService.markGroupUnread(id);
  }

  @Post(':id/hide')
  hideGroup(@Param('id') id: string) {
    return this.groupService.hideGroup(id);
  }

  @Patch(':id/me')
  updateOwnerGroupProfile(
    @Param('id') id: string,
    @Body() body: { nickname: string },
  ) {
    return this.groupService.updateOwnerNickname(id, body.nickname);
  }

  @Post(':id/leave')
  leaveGroup(@Param('id') id: string) {
    return this.groupService.leaveGroup(id);
  }

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @Body()
    body: {
      memberId: string;
      memberType: 'user' | 'character';
      memberName?: string;
      memberAvatar?: string;
    },
  ) {
    return this.groupService.addMember(id, body);
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.groupService.removeMember(id, memberId);
  }

  @Post(':id/messages')
  async sendGroupMessage(
    @Param('id') id: string,
    @Body()
    body:
      | { type?: 'text'; text: string }
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
        },
  ) {
    const message = await this.groupService.sendOwnerMessage(id, body);
    void this.groupService
      .triggerAiReplies(id, message)
      .catch((error: unknown) => {
        const messageText =
          error instanceof Error
            ? error.message
            : 'Unknown group AI reply error';
        const trace = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed to trigger AI replies for group ${id}: ${messageText}`,
          trace,
        );
      });
    return message;
  }
}

function parsePositiveNumber(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeNumber(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
