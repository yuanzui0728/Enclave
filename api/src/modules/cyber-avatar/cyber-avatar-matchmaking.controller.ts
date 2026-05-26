import { Body, Controller, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import {
  CounterpartSnapshot,
  CyberAvatarEncounterService,
} from './cyber-avatar-encounter.service';
import { MatchmakingServiceTokenGuard } from './matchmaking-service-token.guard';

// world 侧脚本生成入口（由 cloud-api DOWN 调用，全局前缀 /api → /api/internal/matchmaking/...）。
// cloud-api 注入的 x-cloud-user-phone 经 TenantContextMiddleware 已建好租户帧，
// getOwnerOrThrow() 即发起方本人；LPP 单 owner 时中间件 no-op 也正确。
@Controller('internal/matchmaking')
@UseGuards(MatchmakingServiceTokenGuard)
export class CyberAvatarMatchmakingController {
  constructor(private readonly service: CyberAvatarEncounterService) {}

  @Post('encounters/:id/transcript')
  async transcript(
    @Param('id') _id: string,
    @Body() body: { counterpartSnapshot?: CounterpartSnapshot },
  ) {
    const counterpart = body?.counterpartSnapshot;
    const transcript = await this.service.generateTranscript({
      counterpartSnapshot: {
        personaSummary: counterpart?.personaSummary ?? '',
        interestTags: Array.isArray(counterpart?.interestTags)
          ? counterpart!.interestTags
          : [],
        displayName: counterpart?.displayName ?? '',
      },
    });

    if (!transcript) {
      throw new AppError('AVATAR_ENCOUNTER_AI_GENERATION_FAILED', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '对话生成失败。',
      });
    }
    return { transcript };
  }
}
