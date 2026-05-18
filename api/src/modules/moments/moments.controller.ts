// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
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
  getFeed(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('mine') mine?: string,
    @Query('character') character?: string,
  ) {
    // 兼容旧调用：不传 page 时返回完整 Moment[]（搜索索引、分享卡等使用）；
    // 传了 page/limit 时走分页路径，返回 { items, total, hasMore }。
    // 传 mine=true：只返回当前世界主人发的 Moment[]，省掉前端把全表 N 条
    // 都拉回来再 filter 一遍 ownerId 的浪费（"我的朋友圈"页用）。
    // 传 character=ID：只返回该角色发的 Moment[]，移动端 friend-moments 页用，
    // 替代之前拉全表 ~724KB 再客户端 filter 的浪费路径。
    const ownerOnly = mine === 'true' || mine === '1';
    const characterAuthorId = character?.trim() || undefined;
    if (page === undefined && limit === undefined) {
      return this.momentsService.getFeed({ ownerOnly, characterAuthorId });
    }
    return this.momentsService.getFeed({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      ownerOnly,
      characterAuthorId,
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
    // 媒体文件名形如 `${timestamp}-${uuid}-${origName}.ext`，写盘后**永不复用同名**——
    // 等价于内容寻址，可以无脑 immutable。原来不带 Cache-Control，浏览器只能走 ETag
    // 条件请求，公网隧道下每张图都要一次 RTT 验证（304 也要 ~600ms）。朋友圈 / 广场
    // 一屏 30+ 图 → 30 次 RTT。改 immutable 后浏览器命中本地缓存就**不发请求**。
    //
    // 走 sendFile.options.headers 而不是 response.setHeader：sendFile 失败（文件
    // 不存在抛 ENOENT → NestJS 全局 500）时**不会**带上 immutable Cache-Control，
    // 避免浏览器把错误响应永久缓存。
    //
    // 走查 R3：sendFile 内部抛 ENOENT 会经 express 的 next(err) → NestJS 全局
    // 异常通道，500 响应体 legacyMessage 会带上完整磁盘路径，比如：
    //   "ENOENT: no such file or directory, stat
    //    '/home/ps/claude/yinjie-app/data/accounts/91173587559732/moments-media/x.png'"
    // 这条 legacyMessage 同时泄露 (a) 服务端绝对路径 (b) account/phone id
    // (91173587559732 是用户登录手机号 hash)，对外暴露面太大。改回调形式接管
    // err，匹配 ENOENT/EACCES 等"文件没找到/不可读"族直接抛 MOMENTS_MEDIA_NOT_FOUND
    // (404，跟 normalizeMomentMediaFileName 抛同一条)，其它真异常照常 next 让
    // 全局通道处理但 message 也要兜成不带路径的统一文案。
    response.sendFile(
      this.momentsService.resolveMomentMediaFilePath(
        this.momentsService.normalizeMomentMediaFileName(fileName),
      ),
      {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },
      (err) => {
        if (!err) return;
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR') {
          // 跟 normalizeMomentMediaFileName 抛同一个 code/legacyMessage，前端
          // 已有 i18n 映射，不需要新增字典项。
          throw new AppError('MOMENTS_MEDIA_NOT_FOUND', {
            status: HttpStatus.NOT_FOUND,
            legacyMessage: '朋友圈媒体不存在。',
          });
        }
        // 其它意外错误（权限、IO 异常）：吃掉原始 err.message（可能含路径），
        // 抛一条不暴露内部细节的统一 500。
        throw new AppError('MOMENTS_MEDIA_NOT_FOUND', {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          legacyMessage: '朋友圈媒体读取失败，请稍后重试。',
        });
      },
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
