// i18n-ignore-start: backend controller, errors are domain codes (not user-facing zh strings).
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { WikiAiGenerateRateLimitGuard } from '../guards/wiki-ai-generate-rate-limit.guard';
import { WikiPrivateCharacterAiService } from '../services/wiki-private-character-ai.service';
import type { PrivateCharacterDto } from '../services/wiki-private-character.service';
import {
  SECTION_KEYS,
  type SectionKey,
} from '../services/wiki-private-character-ai.prompts';

/**
 * AI 角色字段生成的通用 alias：和 /wiki/my-characters/ai-generate 走完全一致的
 * service（WikiPrivateCharacterAiService.generateForSection），但不与"私有角色
 * 存储"耦合 —— 世界角色编辑器（wiki page 评审流）也能调。
 *
 * 单一实现、双 URL：私有角色编辑保持调老路径（向后兼容），世界角色编辑调本路径，
 * 后端没有重复逻辑。WikiAiGenerateRateLimitGuard 按 user.id 计 bucket，所以两个
 * 入口共用同一个 15/h 配额（不会让一个用户因为切换页面绕过限流）。
 */
@Controller('wiki/ai-generate-character-fields')
@UseGuards(JwtAuthGuard)
export class WikiAiGenerateController {
  constructor(private readonly aiService: WikiPrivateCharacterAiService) {}

  @Post()
  @UseGuards(WikiAiGenerateRateLimitGuard)
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      section?: string;
      currentDraft?: PrivateCharacterDto;
      optimize?: boolean;
      // 创建页传 true，编辑页不传。section='all' + persistAsDraft=true 时
      // 后端把 merge 后的 draft 写入 character_drafts（kind='world'）。
      persistAsDraft?: boolean;
    },
  ) {
    const section = body?.section as SectionKey | undefined;
    if (!section || !SECTION_KEYS.includes(section)) {
      throw new BadRequestException(
        `section 必须是以下之一：${SECTION_KEYS.join(' / ')}`,
      );
    }
    const draft = body?.currentDraft;
    if (!draft || typeof draft !== 'object') {
      throw new BadRequestException('请提供当前草稿内容（currentDraft）');
    }
    // typeof 守，避免 ?.trim() 在非字符串上抛 TypeError → 500（同 R7 套路）。
    const draftName =
      typeof draft.name === 'string' ? draft.name.trim() : '';
    if (!draftName) {
      throw new BadRequestException(
        '请先在表单顶部填写"名称"再使用 AI 生成。',
      );
    }
    if (section === 'all') {
      const missing: string[] = [];
      const draftBio =
        typeof draft.bio === 'string' ? draft.bio.trim() : '';
      const draftRel =
        typeof draft.relationship === 'string' ? draft.relationship.trim() : '';
      if (!draftBio) missing.push('角色简介');
      if (!draftRel) missing.push('关系描述');
      if (missing.length > 0) {
        throw new BadRequestException(
          `顶部一键生成需要先填写：${missing.join('、')}。`,
        );
      }
    }
    return this.aiService.generateForSection({
      section,
      currentDraft: draft,
      ownerId: user.id,
      optimize: body?.optimize === true,
      persistAsDraft:
        body?.persistAsDraft === true ? { kind: 'world' } : undefined,
    });
  }
}
// i18n-ignore-end
