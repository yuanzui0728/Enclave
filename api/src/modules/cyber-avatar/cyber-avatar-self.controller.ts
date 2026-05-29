import { Body, Controller, Get, Post } from '@nestjs/common';
import type {
  CyberAvatarSelfChatRequestDto,
  CyberAvatarSelfRebuildRequestDto,
} from './cyber-avatar-self.dto';
import { CyberAvatarSelfService } from './cyber-avatar-self.service';
import { CyberAvatarPortraitService } from './cyber-avatar-portrait.service';

// 用户态「赛博分身」入口。全局前缀 'api' → 实际路径 /api/cyber-avatar/*；前台经 cloud-api
// 反代为 /cloud/world-api/api/cyber-avatar/*。owner 由 cloud-api 注入的 x-cloud-user-phone
// 经 TenantContextMiddleware 建帧后，service 内 getOwnerOrThrow() 自动定位本人（按 ownerId 隔离）。
// 薄控制器：直接委托 service，不 try/catch 吞错——让 SubscriptionExpiredException(402) /
// AppError 冒泡给全局过滤器，前台按 code 本地化。
@Controller('cyber-avatar')
export class CyberAvatarSelfController {
  constructor(
    private readonly service: CyberAvatarSelfService,
    private readonly portrait: CyberAvatarPortraitService,
  ) {}

  @Get('me')
  getMe() {
    return this.service.getSelfProfile();
  }

  // 生成/重新生成分身专属 AI 立绘。出图+存盘后返回最新 self profile（含 portraitImageUrl），
  // 前台直接回填 query。错误（额度/计费/生成失败）冒泡给全局过滤器按 code 本地化。
  @Post('portrait/generate')
  async generatePortrait() {
    await this.portrait.generate();
    return this.service.getSelfProfile();
  }

  @Get('chat/history')
  getChatHistory() {
    return this.service.getChatHistory();
  }

  @Post('chat')
  chat(@Body() body: CyberAvatarSelfChatRequestDto) {
    return this.service.chat(body?.message ?? '');
  }

  @Post('analysis')
  analysis() {
    return this.service.analysis();
  }

  @Post('rebuild')
  rebuild(@Body() body: CyberAvatarSelfRebuildRequestDto) {
    return this.service.rebuild(body?.mode);
  }
}
