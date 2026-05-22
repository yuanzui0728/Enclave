// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
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
      throw new AppError('AI_AUDIO_REQUIRED', {
        legacyMessage: '请先录一段语音再试。',
      });
    }

    if (body.mode && body.mode !== 'dictation' && body.mode !== 'voice_call') {
      throw new AppError('AI_AUDIO_MODE_UNSUPPORTED', {
        legacyMessage: '当前语音模式暂不支持。',
      });
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
      throw new AppError('AI_TTS_TEXT_REQUIRED', {
        legacyMessage: '请先提供要播报的文本。',
      });
    }
    // 走查 R1：moments/feed 朗读在调用方截 3000 字；本端点是给前端 "试听音色"
    // / 调试用，参数完全来自请求 body，curl/老客户端能塞几万字。orchestrator
    // 已在 8000 字处兜底，但那是"截断而不抛"——本端点是用户主动触发，宁可
    // 早期 400 让前端给出明确反馈，也不要静默截断让用户怀疑哪句没念上。
    const MAX_DIRECT_SPEECH_CHARS = 4000;
    if (text.length > MAX_DIRECT_SPEECH_CHARS) {
      throw new AppError('AI_TTS_TEXT_TOO_LONG', {
        legacyMessage: `播报文本超过 ${MAX_DIRECT_SPEECH_CHARS} 字符上限，请缩短后重试。`,
      });
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
    return response.sendFile(this.speechAssets.resolveReadablePath(fileName));
  }
}
// i18n-ignore-end
