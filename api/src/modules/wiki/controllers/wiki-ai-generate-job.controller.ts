// i18n-ignore-start: backend controller, errors are domain codes (not user-facing zh strings).
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { AiGenerationJobService } from '../services/ai-generation-job.service';

/**
 * 前端短轮询入口：GET /wiki/ai-generation-jobs/:id 返回 job 当前状态。
 *
 * 故意 **不** 挂 WikiAiGenerateRateLimitGuard：轮询本身只读单行，不消耗 LLM
 * 配额。给它挂会导致正常生成流程在 status=ready 之前就被打到 429。
 */
@Controller('wiki/ai-generation-jobs')
@UseGuards(JwtAuthGuard)
export class WikiAiGenerateJobController {
  constructor(private readonly jobService: AiGenerationJobService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobService.getViewForOwner(user.id, id);
  }
}
// i18n-ignore-end
