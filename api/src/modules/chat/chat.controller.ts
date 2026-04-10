import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { ChatService } from './chat.service';
import {
  FavoritesService,
  type CreateMessageFavoriteInput,
} from './favorites.service';
import { GroupService } from './group.service';
import { DigitalHumanCallsService } from './digital-human-calls.service';
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
  StickerAttachment,
  VoiceAttachment,
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
  getMessages(@Param('id') id: string, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit);
    return this.chatService.getMessages(
      id,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
    );
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

@Controller('chat')
export class ChatAttachmentController {
  constructor(private readonly chatService: ChatService) {}

  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 8 * 1024 * 1024,
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
      this.chatService.normalizeAttachmentFileName(fileName),
      {
        root: this.chatService.getAttachmentStorageDir(),
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
  getMessages(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.groupService.getMessages(id, Number(limit) || 100);
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
          type: 'sticker';
          text?: string;
          attachment: StickerAttachment;
        },
  ) {
    const message = await this.groupService.sendOwnerMessage(id, body);
    this.groupService.triggerAiReplies(id, message);
    return message;
  }
}
