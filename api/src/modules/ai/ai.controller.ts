import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiOrchestratorService } from './ai-orchestrator.service';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiOrchestratorService) {}

  @Post('transcriptions')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  createTranscription(
    @UploadedFile() file: UploadedAudioFile | undefined,
    @Body() body: { conversationId?: string; mode?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先录一段语音再试。');
    }

    if (body.mode && body.mode !== 'dictation') {
      throw new BadRequestException('当前只支持聊天输入语音转文字。');
    }

    return this.ai.transcribeAudio(file, {
      conversationId: body.conversationId,
      mode: body.mode ?? 'dictation',
    });
  }
}
