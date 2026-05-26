// i18n-ignore-start: backend controller, errors are domain codes (not user-facing zh strings).
import {
  BadRequestException,
  Body,
  Controller,
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
import { GameGenerationJobService } from '../services/game-generation-job.service';
import { WikiGameAiService } from '../services/wiki-game-ai.service';
import { WikiGameService } from '../services/wiki-game.service';

/**
 * 自然语言造游戏 / 迭代修改的入口：enqueue 同步返回 jobId，setImmediate 跑 LLM，
 * 前端走 GET /wiki/game-jobs/:id 轮询（与角色 AI 生成同款异步设计）。
 *
 * 复用 WikiAiGenerateRateLimitGuard（按 user.id 限流，与角色生成共享 50/h 桶），
 * subscription 早 fail 同步抛 402。
 */
@Controller('wiki/my-games')
@UseGuards(JwtAuthGuard)
export class WikiGameAiGenerateController {
  constructor(
    private readonly gameService: WikiGameService,
    private readonly aiService: WikiGameAiService,
    private readonly jobService: GameGenerationJobService,
    private readonly subscription: SubscriptionService,
  ) {}

  /** 从空白用一句自然语言造一个新游戏。 */
  @Post('ai-create')
  @UseGuards(WikiAiGenerateRateLimitGuard)
  async aiCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { prompt?: string; title?: string },
  ) {
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      throw new BadRequestException('请先描述你想要的游戏。');
    }
    if (prompt.length > 2000) {
      throw new BadRequestException('描述过长（上限 2000 字）。');
    }
    await this.subscription.assertCanUseAi('text');

    const { gameId } = await this.gameService.createShell(user.id, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      authorDisplayName: user.username,
    });
    const job = await this.jobService.enqueue({
      ownerUserId: user.id,
      scope: 'game_create',
      gameId,
      payload: { prompt, title: body?.title },
    });
    setImmediate(() => {
      this.aiService.runGameJobInBackground(job.id).catch(() => {});
    });
    return { jobId: job.id, status: 'generating' as const };
  }

  /** 对已有游戏发一条自然语言修改指令（Claude Code 式回合）。 */
  @Post(':id/ai-refine')
  @UseGuards(WikiAiGenerateRateLimitGuard)
  async aiRefine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { instruction?: string },
  ) {
    const instruction =
      typeof body?.instruction === 'string' ? body.instruction.trim() : '';
    if (!instruction) {
      throw new BadRequestException('请描述要修改的内容。');
    }
    if (instruction.length > 2000) {
      throw new BadRequestException('指令过长（上限 2000 字）。');
    }
    // 拥有权校验（不存在 / 非本人 → 抛），早 fail。
    await this.gameService.requireOwnedPage(user.id, id);
    await this.subscription.assertCanUseAi('text');

    const job = await this.jobService.enqueue({
      ownerUserId: user.id,
      scope: 'game_edit',
      gameId: id,
      payload: { instruction },
    });
    setImmediate(() => {
      this.aiService.runGameJobInBackground(job.id).catch(() => {});
    });
    return { jobId: job.id, status: 'generating' as const };
  }
}
// i18n-ignore-end
