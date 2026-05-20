import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';
import { CharacterBlueprintService } from '../../characters/character-blueprint.service';
import type { CharacterBlueprintRecipeValue } from '../../characters/character-blueprint.types';
import { PromptBuilderService } from '../../ai/prompt-builder.service';
import type { SceneKey } from '../../ai/ai.types';
import { WikiRateLimitGuard } from '../guards/wiki-rate-limit.guard';
import { normalizeWikiRecipe } from '../wiki.types';
import { WikiEditService } from '../services/wiki-edit.service';
import { WikiPageService } from '../services/wiki-page.service';

@Controller('wiki')
export class WikiPageController {
  constructor(
    private readonly pages: WikiPageService,
    private readonly edits: WikiEditService,
    private readonly blueprints: CharacterBlueprintService,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  @Get('recent-changes')
  recentChanges(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('onlyUnpatrolled') onlyUnpatrolled?: string,
  ) {
    return this.pages.listRecentChanges({
      limit,
      onlyUnpatrolled:
        onlyUnpatrolled === '1' || onlyUnpatrolled === 'true',
    });
  }

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.pages.search(q ?? '', limit);
  }

  @Get('pages')
  listPages() {
    return this.pages.listPages();
  }

  @Post('pages')
  @UseGuards(JwtAuthGuard, WikiRateLimitGuard)
  createPage(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      characterId?: string | null;
      recipeSnapshot?: Record<string, unknown> | null;
      contentSnapshot?: Record<string, unknown> | null;
      editSummary?: string | null;
    },
  ) {
    return this.edits.createPage(user, body);
  }

  @Get('pages/:id')
  @UseGuards(OptionalJwtAuthGuard)
  view(
    @Param('id') id: string,
    @Query('view') view: 'stable' | 'current' | undefined,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.pages.getPageView(id, { view, user });
  }

  @Get('pages/:id/history')
  history(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.pages.getHistory(id, limit);
  }

  @Get('pages/:id/pending')
  pending(@Param('id') id: string) {
    return this.pages.getPending(id);
  }

  @Get('pages/:id/diff')
  diff(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.pages.getDiff(id, from, to);
  }

  @Get('pages/:id/revisions/:revisionId')
  revision(@Param('revisionId') revisionId: string) {
    return this.pages.getRevisionOrThrow(revisionId);
  }

  @Post('pages/:id/preview-prompt')
  @UseGuards(OptionalJwtAuthGuard)
  async previewPrompt(
    @Param('id') id: string,
    @Body()
    body: {
      recipe: Record<string, unknown> | CharacterBlueprintRecipeValue;
      scene: SceneKey;
    },
  ) {
    // 防御性校验：body 缺 recipe / scene 时直接 400，不要让 buildProfileFromRecipe
    // 拿 undefined → 走到 promptBuilder 之后才崩出 "Cannot read properties of undefined
    // (reading 'identity')" 这种 500（前端看到泛错没法定位是哪条字段没传）。
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('preview-prompt 需要 JSON body');
    }
    if (!body.recipe || typeof body.recipe !== 'object') {
      throw new BadRequestException(
        'preview-prompt: body.recipe 不能为空，需要传 character recipe 对象',
      );
    }
    if (!body.scene || typeof body.scene !== 'string') {
      throw new BadRequestException('preview-prompt: body.scene 不能为空');
    }
    const recipe = normalizeWikiRecipe(
      body.recipe as Record<string, unknown>,
    );
    const profile = this.blueprints.buildProfileFromRecipe(recipe, id);
    const prompt = await this.promptBuilder.buildSceneSystemPrompt(
      profile,
      body.scene,
    );
    return { prompt };
  }

  @Post('pages/:id/sync-from-character')
  @UseGuards(JwtAuthGuard)
  syncFromCharacter(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.edits.syncFromCharacter(id, user);
  }

  @Post('pages/:id/edits')
  @UseGuards(JwtAuthGuard, WikiRateLimitGuard)
  submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      contentSnapshot: Record<string, unknown>;
      recipeSnapshot?: Record<string, unknown> | null;
      baseRevisionId?: string | null;
      editSummary?: string;
      isMinor?: boolean;
    },
  ) {
    return this.edits.submit(id, user, body);
  }
}
