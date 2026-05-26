// i18n-ignore-start: backend controller, errors are domain codes (not user-facing zh strings).
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { GameGenerationJobService } from '../services/game-generation-job.service';

/**
 * 游戏 AI 生成任务的短轮询入口。故意不挂 rate-limit guard：只读单行、不烧 LLM。
 */
@Controller('wiki/game-jobs')
@UseGuards(JwtAuthGuard)
export class WikiGameJobController {
  constructor(private readonly jobService: GameGenerationJobService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobService.getViewForOwner(user.id, id);
  }
}
// i18n-ignore-end
