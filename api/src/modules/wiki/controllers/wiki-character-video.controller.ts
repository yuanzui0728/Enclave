// i18n-ignore-start: backend controller, errors are thrown with user-facing zh copy inline.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { SubscriptionService } from '../../subscription/subscription.service';
import { WikiAiGenerateRateLimitGuard } from '../guards/wiki-ai-generate-rate-limit.guard';
import { WikiCharacterVideoService } from '../services/wiki-character-video.service';

/**
 * 私有角色「自然语言造视频」入口。create 同步返回 videoId，后台跑 MiniMax，
 * 前端走 GET /wiki/my-character-videos/:id 轮询（与造游戏 / 角色 AI 生成同款异步）。
 *
 * 拥有权：create 仅接受【本人私有角色】id（service.create 内 getById 校验），
 * 非本人 / 不存在 → 403/404，即满足「只有自己的私有角色可创造，其他都不允许」。
 * 限流复用 WikiAiGenerateRateLimitGuard（按 user.id，与角色/游戏生成共享 50/h 桶）。
 */
@Controller('wiki/my-character-videos')
@UseGuards(JwtAuthGuard)
export class WikiCharacterVideoController {
  constructor(
    private readonly service: WikiCharacterVideoService,
    private readonly subscription: SubscriptionService,
  ) {}

  @Post()
  @UseGuards(WikiAiGenerateRateLimitGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { privateCharacterId?: string; prompt?: string },
  ) {
    const privateCharacterId =
      typeof body?.privateCharacterId === 'string' ? body.privateCharacterId.trim() : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!privateCharacterId) {
      throw new BadRequestException('请选择一个你的私有角色。');
    }
    if (!prompt) {
      throw new BadRequestException('请先描述你想要的视频画面。');
    }
    if (prompt.length > 600) {
      throw new BadRequestException('描述过长（上限 600 字）。');
    }
    await this.subscription.assertCanUseAi('image');
    const view = await this.service.create(user.id, privateCharacterId, prompt);
    return { videoId: view.id, status: 'generating' as const };
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForOwner(user.id);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getViewForOwner(user.id, id);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.softDelete(user.id, id);
  }
}
// i18n-ignore-end
