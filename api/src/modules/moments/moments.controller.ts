// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MomentsService } from './moments.service';
import {
  type CreateMomentInput,
  type MomentContentType,
  type MomentMediaAsset,
  type MomentVisibility,
} from './moment-media.types';

@Controller('moments')
export class MomentsController {
  constructor(private readonly momentsService: MomentsService) {}

  @Get()
  getFeed(@Query('page') page?: string, @Query('limit') limit?: string) {
    // 兼容旧调用：不传 page 时返回完整 Moment[]（搜索索引、分享卡等使用）；
    // 传了 page/limit 时走分页路径，返回 { items, total, hasMore }。
    if (page === undefined && limit === undefined) {
      return this.momentsService.getFeed();
    }
    return this.momentsService.getFeed({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
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
      throw new AppError('MOMENTS_MEDIA_REQUIRED', {
        legacyMessage: '请先选择一个朋友圈媒体文件。',
      });
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
      visibility?: MomentVisibility;
    },
  ) {
    const input: CreateMomentInput = {
      text: body.text,
      location: body.location,
      contentType: body.contentType,
      media: Array.isArray(body.media) ? body.media : undefined,
      visibility: body.visibility,
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
    @Body()
    body: {
      text: string;
      replyToCommentId?: string | null;
      replyToAuthorId?: string | null;
    },
  ) {
    return this.momentsService.addOwnerComment(postId, body.text, {
      replyToCommentId: body.replyToCommentId ?? null,
      replyToAuthorId: body.replyToAuthorId ?? null,
    });
  }

  @Post(':id/like')
  toggleLike(@Param('id') postId: string) {
    return this.momentsService.toggleOwnerLike(postId);
  }

  @Delete(':id')
  deletePost(@Param('id') postId: string) {
    return this.momentsService.deleteOwnerPost(postId);
  }
}
// i18n-ignore-end
