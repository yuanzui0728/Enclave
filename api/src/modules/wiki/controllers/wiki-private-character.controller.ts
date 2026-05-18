import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { PrivateCharacterRateLimitGuard } from '../../characters/guards/private-character-rate-limit.guard';
import { WikiAiGenerateRateLimitGuard } from '../guards/wiki-ai-generate-rate-limit.guard';
import { WikiPrivateCharacterService } from '../services/wiki-private-character.service';
import type { PrivateCharacterDto } from '../services/wiki-private-character.service';
import { WikiPrivateCharacterAiService } from '../services/wiki-private-character-ai.service';
import {
  SECTION_KEYS,
  type SectionKey,
} from '../services/wiki-private-character-ai.prompts';

@Controller('wiki/my-characters')
@UseGuards(JwtAuthGuard)
export class WikiPrivateCharacterController {
  constructor(
    private readonly service: WikiPrivateCharacterService,
    private readonly aiService: WikiPrivateCharacterAiService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForOwner(user.id);
  }

  @Post()
  @UseGuards(PrivateCharacterRateLimitGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PrivateCharacterDto,
  ) {
    // 走 createStrict（重名抛 Conflict）—— 旧的 create 走 upsertByName 会
    // 把同名旧记录无声覆盖；用户在 /my-characters/new 输入已存在 name 后
    // 期望"新建"，结果默默盖掉旧角色。createStrict 把 upsert 语义只留给
    // import 路径，create 路径必须显式新建。
    return this.service.createStrict(user.id, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.getById(user.id, id);
  }

  @Put(':id')
  @UseGuards(PrivateCharacterRateLimitGuard)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PrivateCharacterDto,
  ) {
    return this.service.update(user.id, id, body);
  }

  @Delete(':id')
  @UseGuards(PrivateCharacterRateLimitGuard)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.service.delete(user.id, id);
    return { success: true };
  }

  @Get(':id/export')
  async exportOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const record = await this.service.getById(user.id, id);
    const bundle = this.service.toExportBundle(record, user.id);
    const safeName = record.name.replace(/[\\/:*?"<>|\r\n\t]+/g, '_').slice(
      0,
      80,
    );
    const baseName = safeName || 'character';
    // ASCII fallback：非 ASCII 字符替换成 '_'，保证老浏览器也能拿到合法 filename。
    // 同时按 RFC 5987 给 filename*=UTF-8''…，modern 浏览器优先用它，正确显示中文。
    const asciiName = baseName.replace(/[^\x20-\x7E]/g, '_');
    const utf8Encoded = encodeURIComponent(baseName);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}.character.json"; filename*=UTF-8''${utf8Encoded}.character.json`,
    );
    res.send(JSON.stringify(bundle, null, 2));
  }

  @Post('import')
  @UseGuards(PrivateCharacterRateLimitGuard)
  async importOne(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = this.service.parseImportBundle(body);
    return this.service.upsertByName(user.id, dto);
  }

  // AI 自动生成：根据当前已填字段调一次 LLM，返回需要补全的字段。
  // 5 个 section（basics/core_logic/chat/scenes/memory）+ 1 个 'all' 整体生成；
  // 实际可用 key 见 SECTION_KEYS。life / reasoning 已于 2026-05-15 下线（详见 prompts.ts 顶部）。
  // 单独的 rate limit（15/h/user），与 CRUD 桶（60/h）分开。
  @Post('ai-generate')
  @UseGuards(WikiAiGenerateRateLimitGuard)
  async aiGenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      section?: string;
      currentDraft?: PrivateCharacterDto;
      optimize?: boolean;
      // 创建页传 true，编辑页不传。section='all' + persistAsDraft=true 时
      // 后端把 merge 后的 draft 写入 character_drafts。
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
    // typeof 守：客户端传 {"currentDraft":{"name":{"a":1}}} 时 ?.trim() 抛
    // TypeError → 500 把原始 stack 漏出去。非字符串当空字符串处理。
    const draftName =
      typeof draft.name === 'string' ? draft.name.trim() : '';
    if (!draftName) {
      throw new BadRequestException(
        '请先在表单顶部填写"名称"再使用 AI 生成。',
      );
    }
    if (section === 'all') {
      // sacred gate（2026-05-15 起对齐 wiki UI）：name 已由上一行检查；
      // 这里只需 bio + relationship。personality 字段已从 wiki 砍掉。
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
        body?.persistAsDraft === true ? { kind: 'private' } : undefined,
    });
  }
}
