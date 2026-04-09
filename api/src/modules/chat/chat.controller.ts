import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { GroupService } from './group.service';
import type {
  ContactCardAttachment,
  ImageAttachment,
  LocationCardAttachment,
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
  getMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.chatService.markConversationRead(id);
  }

  @Post(':id/pin')
  setPinned(@Param('id') id: string, @Body() body: { pinned: boolean }) {
    return this.chatService.setConversationPinned(id, body.pinned);
  }

  @Post(':id/mute')
  setMuted(@Param('id') id: string, @Body() body: { muted: boolean }) {
    return this.chatService.setConversationMuted(id, body.muted);
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
    @Body() body: { width?: string; height?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先选择一张图片。');
    }

    return {
      attachment: await this.chatService.saveUploadedImageAttachment(file, {
        width: body.width ? Number(body.width) : undefined,
        height: body.height ? Number(body.height) : undefined,
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

@Controller('groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  createGroup(@Body() body: { name: string; memberIds: string[] }) {
    return this.groupService.createGroup(body);
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

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @Body()
    body: {
      memberId: string;
      memberType: 'user' | 'character';
      memberName: string;
      memberAvatar?: string;
    },
  ) {
    return this.groupService.addMember(id, body);
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
          type: 'contact_card';
          text?: string;
          attachment: ContactCardAttachment;
        }
      | {
          type: 'location_card';
          text?: string;
          attachment: LocationCardAttachment;
        },
  ) {
    const message = await this.groupService.sendOwnerMessage(id, body);
    this.groupService.triggerAiReplies(id, message.text, message.senderName);
    return message;
  }
}
