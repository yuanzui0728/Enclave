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
import { MomentsService } from './moments.service';
import {
  type CreateMomentInput,
  type MomentContentType,
  type MomentMediaAsset,
} from './moment-media.types';

@Controller('moments')
export class MomentsController {
  constructor(private readonly momentsService: MomentsService) {}

  @Get()
  getFeed() {
    return this.momentsService.getFeed();
  }

  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 128 * 1024 * 1024,
      },
    }),
  )
  async uploadMomentMedia(
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname?: string;
          size: number;
        }
      | undefined,
    @Body() body: { width?: string; height?: string; durationMs?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请先选择一个朋友圈媒体文件。');
    }

    return {
      media: await this.momentsService.saveUploadedMedia(file, {
        width: body.width ? Number(body.width) : undefined,
        height: body.height ? Number(body.height) : undefined,
        durationMs: body.durationMs ? Number(body.durationMs) : undefined,
      }),
    };
  }

  @Get('media/:fileName')
  getMomentMedia(
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    return response.sendFile(
      this.momentsService.resolveMomentMediaFilePath(
        this.momentsService.normalizeMomentMediaFileName(fileName),
      ),
    );
  }

  @Post('user-post')
  createUserMoment(
    @Body()
    body: {
      text?: string;
      location?: string;
      contentType?: MomentContentType;
      media?: MomentMediaAsset[];
    },
  ) {
    const input: CreateMomentInput = {
      text: body.text,
      location: body.location,
      contentType: body.contentType,
      media: Array.isArray(body.media) ? body.media : undefined,
    };
    return this.momentsService.createUserMoment(input);
  }

  @Get(':id')
  getPost(@Param('id') id: string) {
    return this.momentsService.getPost(id);
  }

  @Post('generate/:characterId')
  generateForCharacter(@Param('characterId') characterId: string) {
    return this.momentsService.generateMomentForCharacter(characterId);
  }

  @Post('generate-all')
  generateAll() {
    return this.momentsService.generateAllMoments();
  }

  @Post(':id/comment')
  addComment(
    @Param('id') postId: string,
    @Body() body: { text: string },
  ) {
    return this.momentsService.addOwnerComment(postId, body.text);
  }

  @Post(':id/like')
  toggleLike(@Param('id') postId: string) {
    return this.momentsService.toggleOwnerLike(postId);
  }
}
