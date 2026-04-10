import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { ChatBackgroundAsset } from './chat-background.types';
import { ChatBackgroundsService } from './chat-backgrounds.service';

type UploadedBackgroundFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Controller('conversations')
export class ConversationBackgroundController {
  constructor(private readonly chatBackgroundsService: ChatBackgroundsService) {}

  @Get(':id/background')
  getConversationBackground(@Param('id') id: string) {
    return this.chatBackgroundsService.getConversationBackgroundSettings(id);
  }

  @Patch(':id/background')
  setConversationBackground(
    @Param('id') id: string,
    @Body()
    body: {
      mode: 'inherit' | 'custom';
      background?: ChatBackgroundAsset | null;
    },
  ) {
    return this.chatBackgroundsService.updateConversationBackground(id, body);
  }

  @Delete(':id/background')
  clearConversationBackground(@Param('id') id: string) {
    return this.chatBackgroundsService.clearConversationBackground(id);
  }
}

@Controller('groups')
export class GroupBackgroundController {
  constructor(private readonly chatBackgroundsService: ChatBackgroundsService) {}

  @Get(':id/background')
  getGroupBackground(@Param('id') id: string) {
    return this.chatBackgroundsService.getGroupBackgroundSettings(id);
  }

  @Patch(':id/background')
  setGroupBackground(
    @Param('id') id: string,
    @Body()
    body: {
      mode: 'inherit' | 'custom';
      background?: ChatBackgroundAsset | null;
    },
  ) {
    return this.chatBackgroundsService.updateGroupBackground(id, body);
  }

  @Delete(':id/background')
  clearGroupBackground(@Param('id') id: string) {
    return this.chatBackgroundsService.clearGroupBackground(id);
  }
}

@Controller('chat')
export class ChatBackgroundAssetsController {
  constructor(private readonly chatBackgroundsService: ChatBackgroundsService) {}

  @Post('backgrounds')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadBackground(
    @UploadedFile() file: UploadedBackgroundFile | undefined,
    @Body() body: { width?: string; height?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先选择一张背景图。');
    }

    return {
      background: await this.chatBackgroundsService.saveUploadedChatBackground(
        file,
        {
          width: body.width ? Number(body.width) : undefined,
          height: body.height ? Number(body.height) : undefined,
        },
      ),
    };
  }

  @Get('backgrounds/:fileName')
  getBackground(
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    return response.sendFile(
      this.chatBackgroundsService.normalizeBackgroundFileName(fileName),
      {
        root: this.chatBackgroundsService.getBackgroundStorageDir(),
      },
    );
  }
}
