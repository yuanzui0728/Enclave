import {
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ArgumentsHost,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AppError } from '../../../common/app-error.exception';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PrivateCharacterRateLimitGuard } from '../../characters/guards/private-character-rate-limit.guard';
import {
  WIKI_AVATAR_UPLOAD_LIMIT_BYTES,
  WikiAvatarService,
  type UploadedWikiAvatarFile,
} from '../services/wiki-avatar.service';

// multer 触发 fileSize 上限时丢出 PayloadTooLargeException，message 是英文
// 'File too large'。前端 wiki-api request() 把它当 LEGACY_ERROR 直接渲染给用户。
// 这里只把 avatar 上传那条路径的 PayloadTooLargeException 替成中文 + 实际上限。
@Catch(PayloadTooLargeException)
class WikiAvatarPayloadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const limitMb = Math.round(WIKI_AVATAR_UPLOAD_LIMIT_BYTES / (1024 * 1024));
    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      code: 'WIKI_AVATAR_TOO_LARGE',
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: `头像文件不能超过 ${limitMb} MB。`,
      legacyMessage: `头像文件不能超过 ${limitMb} MB。`,
      params: { maxMb: limitMb },
    });
  }
}

// 头像上传必须登录（防止匿名灌内容到磁盘），GET 不挂 guard：保存到角色后任意人
// 都要能在角色卡里看到这张图，再过一层 token 鉴权就读不动了。
//
// 用 PrivateCharacterRateLimitGuard（60/h/user，与私有角色 CRUD 共桶）挡脚本
// 滥用——一次正常创建角色顶多上传 3-5 次 + 1-2 次 save，离上限差得远；恶意
// 脚本最多 60 * 4MB = 240MB/h，磁盘可控。
@Controller('wiki/avatars')
export class WikiAvatarController {
  constructor(private readonly avatars: WikiAvatarService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PrivateCharacterRateLimitGuard)
  @UseFilters(WikiAvatarPayloadTooLargeFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: WIKI_AVATAR_UPLOAD_LIMIT_BYTES },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: UploadedWikiAvatarFile | undefined,
  ) {
    if (!file) {
      throw new AppError('WIKI_AVATAR_FILE_REQUIRED', {
        legacyMessage: '请先选择一张头像图片。',
      });
    }
    return this.avatars.saveUploadedAvatar(file);
  }

  @Get(':fileName')
  getAvatar(@Param('fileName') fileName: string, @Res() res: Response) {
    // sendFile 内部用 send-stream，会按自己 options 覆写 Cache-Control，所以
    // 长缓存必须通过 maxAge / immutable 传进去，不能 setHeader 后再 sendFile。
    // 文件名带 ts + 8 位 uuid，整张图永远不会被覆盖 → 一年 immutable，省掉
    // 每次重新渲染列表都过一道 304 revalidate。
    //
    // nosniff（through `headers` option）：挡 MIME 嗅探。即便我们已经按
    // mimetype 推 .ext，多一层兜底防止老浏览器把 polyglot 文件按 HTML 执行。
    return res.sendFile(this.avatars.resolveReadablePath(fileName), {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      immutable: true,
      headers: {
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}
