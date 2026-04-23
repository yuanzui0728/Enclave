import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiSpeechAssetsService } from './ai-speech-assets.service';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly speechAssets: AiSpeechAssetsService,
  ) {}

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
    @Body()
    body: { conversationId?: string; characterId?: string; mode?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先录一段语音再试。');
    }

    if (body.mode && body.mode !== 'dictation' && body.mode !== 'voice_call') {
      throw new BadRequestException('当前语音模式暂不支持。');
    }

    return this.ai.transcribeAudio(file, {
      conversationId: body.conversationId,
      characterId: body.characterId,
      mode: body.mode ?? 'dictation',
    });
  }

  @Post('speech')
  async createSpeech(
    @Body()
    body: {
      text?: string;
      voice?: string;
      conversationId?: string;
      characterId?: string;
    },
  ) {
    const text = body.text?.trim();
    if (!text) {
      throw new BadRequestException('请先提供要播报的文本。');
    }

    const synthesized = await this.ai.synthesizeSpeech({
      text,
      voice: body.voice,
      conversationId: body.conversationId,
      characterId: body.characterId,
    });
    const asset = await this.speechAssets.saveGeneratedSpeech(
      synthesized.buffer,
      {
        mimeType: synthesized.mimeType,
        fileExtension: synthesized.fileExtension,
        baseName: `speech-${body.characterId ?? 'assistant'}`,
      },
    );

    return {
      audioUrl: asset.audioUrl,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      provider: synthesized.provider,
      voice: synthesized.voice,
      durationMs: synthesized.durationMs,
    };
  }

  @Get('speech/:fileName')
  getSpeech(@Param('fileName') fileName: string, @Res() response: Response) {
    return response.sendFile(this.speechAssets.normalizeFileName(fileName), {
      root: this.speechAssets.getStorageDir(),
    });
  }
}
