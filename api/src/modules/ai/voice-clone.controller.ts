import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppError } from '../../common/app-error.exception';
import { VoiceCloneService } from './voice-clone.service';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Controller('ai/voice-clones')
export class VoiceCloneController {
  constructor(private readonly voiceClones: VoiceCloneService) {}

  @Get()
  list() {
    return this.voiceClones.listForOwner();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // MiniMax 克隆样本上限 20MB。
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  create(
    @UploadedFile() file: UploadedAudioFile | undefined,
    @Body() body: { displayName?: string },
  ) {
    if (!file) {
      throw new AppError('VOICE_CLONE_SAMPLE_REQUIRED', {
        legacyMessage: '请上传一段声音样本（mp3 / m4a / wav，10 秒以上）。',
      });
    }
    return this.voiceClones.createClone({
      displayName: body?.displayName ?? '',
      buffer: file.buffer,
      mime: file.mimetype || 'audio/mpeg',
      fileName: file.originalname || 'voice-sample',
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.voiceClones.deleteClone(id).then(() => ({ success: true }));
  }
}
