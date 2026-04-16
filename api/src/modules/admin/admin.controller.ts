import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CharacterEntity } from '../characters/character.entity';
import { CharacterBlueprintService } from '../characters/character-blueprint.service';
import { ReplyLogicAdminService } from './reply-logic-admin.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly replyLogicAdminService: ReplyLogicAdminService,
    private readonly characterBlueprintService: CharacterBlueprintService,
    private readonly ai: AiOrchestratorService,
    private readonly usageLedger: AiUsageLedgerService,
  ) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('system')
  getSystem() {
    return this.adminService.getSystemInfo();
  }

  @Get('config')
  getConfig() {
    return this.adminService.getConfig();
  }

  @Patch('config')
  setConfig(@Body() body: { key: string; value: string }) {
    return this.adminService.setConfig(body.key, body.value);
  }

  @Get('characters')
  getCharacters() {
    return this.adminService.findAllCharacters();
  }

  @Get('token-usage/overview')
  getTokenUsageOverview(
    @Query()
    query: {
      from?: string;
      to?: string;
      characterId?: string;
      conversationId?: string;
      groupId?: string;
      scene?: string;
      model?: string;
      billingSource?: string;
      status?: string;
      errorCode?: string;
    },
  ) {
    return this.usageLedger.getOverview(query);
  }

  @Get('token-usage/trend')
  getTokenUsageTrend(
    @Query()
    query: {
      from?: string;
      to?: string;
      grain?: string;
      characterId?: string;
      conversationId?: string;
      groupId?: string;
      scene?: string;
      model?: string;
      billingSource?: string;
      status?: string;
      errorCode?: string;
    },
  ) {
    return this.usageLedger.getTrend(query);
  }

  @Get('token-usage/breakdown')
  getTokenUsageBreakdown(
    @Query()
    query: {
      from?: string;
      to?: string;
      characterId?: string;
      conversationId?: string;
      groupId?: string;
      scene?: string;
      model?: string;
      billingSource?: string;
      status?: string;
      errorCode?: string;
      limit?: number | string;
    },
  ) {
    return this.usageLedger.getBreakdown(query);
  }

  @Get('token-usage/records')
  getTokenUsageRecords(
    @Query()
    query: {
      from?: string;
      to?: string;
      characterId?: string;
      conversationId?: string;
      groupId?: string;
      scene?: string;
      model?: string;
      billingSource?: string;
      status?: string;
      errorCode?: string;
      page?: number | string;
      pageSize?: number | string;
    },
  ) {
    return this.usageLedger.getRecords(query);
  }

  @Get('token-usage/downgrade-insights')
  getTokenUsageDowngradeInsights(
    @Query()
    query: {
      from?: string;
      to?: string;
      grain?: string;
      characterId?: string;
      conversationId?: string;
      groupId?: string;
      scene?: string;
      model?: string;
      billingSource?: string;
      status?: string;
      errorCode?: string;
      limit?: number | string;
    },
  ) {
    return this.usageLedger.getDowngradeInsights(query);
  }

  @Get('token-usage/downgrade-quality')
  getTokenUsageDowngradeQuality(
    @Query()
    query: {
      from?: string;
      to?: string;
      grain?: string;
      characterId?: string;
      conversationId?: string;
      groupId?: string;
      scene?: string;
      model?: string;
      billingSource?: string;
      status?: string;
      errorCode?: string;
      limit?: number | string;
    },
  ) {
    return this.usageLedger.getDowngradeQuality(query);
  }

  @Get('token-usage/pricing')
  getTokenUsagePricing() {
    return this.usageLedger.getPricingCatalog();
  }

  @Patch('token-usage/pricing')
  setTokenUsagePricing(
    @Body()
    body: {
      currency?: 'CNY' | 'USD';
      items?: Array<{
        model?: string;
        inputPer1kTokens?: number;
        outputPer1kTokens?: number;
        enabled?: boolean;
        note?: string;
      }>;
    },
  ) {
    return this.usageLedger.setPricingCatalog({
      currency: body.currency === 'USD' ? 'USD' : 'CNY',
      items: (body.items ?? []).map((item) => ({
        model: item.model ?? '',
        inputPer1kTokens: item.inputPer1kTokens ?? 0,
        outputPer1kTokens: item.outputPer1kTokens ?? 0,
        enabled: item.enabled !== false,
        note: item.note,
      })),
    });
  }

  @Get('token-usage/budgets')
  getTokenUsageBudgets() {
    return this.usageLedger.getBudgetSnapshot();
  }

  @Patch('token-usage/budgets')
  setTokenUsageBudgets(
    @Body()
    body: {
      overall?: {
        enabled?: boolean;
        metric?: 'tokens' | 'cost';
        enforcement?: 'monitor' | 'downgrade' | 'block';
        downgradeModel?: string | null;
        dailyLimit?: number | null;
        monthlyLimit?: number | null;
        warningRatio?: number;
      };
      characters?: Array<{
        characterId?: string;
        enabled?: boolean;
        metric?: 'tokens' | 'cost';
        enforcement?: 'monitor' | 'downgrade' | 'block';
        downgradeModel?: string | null;
        dailyLimit?: number | null;
        monthlyLimit?: number | null;
        warningRatio?: number;
        note?: string;
      }>;
    },
  ) {
    return this.usageLedger.setBudgetConfig({
          overall: body.overall
        ? {
            enabled: body.overall.enabled === true,
            metric: body.overall.metric === 'cost' ? 'cost' : 'tokens',
            enforcement:
              body.overall.enforcement === 'block'
                ? 'block'
                : body.overall.enforcement === 'downgrade'
                  ? 'downgrade'
                  : 'monitor',
            downgradeModel: body.overall.downgradeModel?.trim() || null,
            dailyLimit: body.overall.dailyLimit ?? null,
            monthlyLimit: body.overall.monthlyLimit ?? null,
            warningRatio: body.overall.warningRatio ?? 0.8,
          }
        : undefined,
      characters: (body.characters ?? []).map((item) => ({
        characterId: item.characterId ?? '',
        enabled: item.enabled === true,
        metric: item.metric === 'cost' ? 'cost' : 'tokens',
        enforcement:
          item.enforcement === 'block'
            ? 'block'
            : item.enforcement === 'downgrade'
              ? 'downgrade'
              : 'monitor',
        downgradeModel: item.downgradeModel?.trim() || null,
        dailyLimit: item.dailyLimit ?? null,
        monthlyLimit: item.monthlyLimit ?? null,
        warningRatio: item.warningRatio ?? 0.8,
        note: item.note,
      })),
    });
  }

  @Get('characters/friend-ids')
  getCharacterFriendIds() {
    return this.adminService.getFriendCharacterIds();
  }

  @Get('characters/presets')
  listCharacterPresets() {
    return this.adminService.listCharacterPresets();
  }

  @Post('characters/presets/:presetKey/install')
  installCharacterPreset(@Param('presetKey') presetKey: string) {
    return this.adminService.installCharacterPreset(presetKey);
  }

  @Post('characters/presets/install-batch')
  installCharacterPresetBatch(@Body() body: { presetKeys?: string[] | null }) {
    return this.adminService.installCharacterPresetBatch(body.presetKeys ?? []);
  }

  @Post('characters/generate-quick')
  async generateQuickCharacter(@Body() body: { description: string }) {
    return this.ai.generateQuickCharacter(body.description?.trim() ?? '');
  }

  @Post('characters')
  createCharacter(@Body() body: Partial<CharacterEntity>) {
    return this.adminService.createCharacter(body);
  }

  @Patch('characters/:id')
  updateCharacter(@Param('id') id: string, @Body() body: Partial<CharacterEntity>) {
    return this.adminService.updateCharacter(id, body);
  }

  @Delete('characters/:id')
  deleteCharacter(@Param('id') id: string) {
    return this.adminService.deleteCharacter(id);
  }

  @Get('characters/:id/factory')
  getCharacterFactory(@Param('id') id: string) {
    return this.characterBlueprintService.getFactorySnapshot(id);
  }

  @Patch('characters/:id/factory')
  updateCharacterFactory(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characterBlueprintService.updateDraft(
      id,
      body as Parameters<CharacterBlueprintService['updateDraft']>[1],
    );
  }

  @Post('characters/:id/factory/generate')
  generateCharacterFactoryDraft(
    @Param('id') id: string,
    @Body() body: { chatSample?: string | null; personName?: string | null },
  ) {
    return this.characterBlueprintService.generateDraftFromSample(id, body);
  }

  @Post('characters/:id/factory/publish')
  publishCharacterFactory(
    @Param('id') id: string,
    @Body() body?: { summary?: string | null },
  ) {
    return this.characterBlueprintService.publish(id, body?.summary);
  }

  @Get('characters/:id/factory/revisions')
  listCharacterFactoryRevisions(@Param('id') id: string) {
    return this.characterBlueprintService.listRevisions(id);
  }

  @Post('characters/:id/factory/revisions/:revisionId/restore')
  restoreCharacterFactoryRevision(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.characterBlueprintService.restoreRevisionToDraft(
      id,
      revisionId,
    );
  }

  @Get('reply-logic/overview')
  getReplyLogicOverview() {
    return this.replyLogicAdminService.getOverview();
  }

  @Get('reply-logic/rules')
  getReplyLogicRules() {
    return this.replyLogicAdminService.getRuntimeRules();
  }

  @Patch('reply-logic/rules')
  setReplyLogicRules(@Body() body: Record<string, unknown>) {
    return this.replyLogicAdminService.setRuntimeRules(body);
  }

  @Get('reply-logic/characters/:id')
  getReplyLogicCharacter(@Param('id') id: string) {
    return this.replyLogicAdminService.getCharacterSnapshot(id);
  }

  @Post('reply-logic/characters/:id/preview')
  previewReplyLogicCharacter(
    @Param('id') id: string,
    @Body() body: { userMessage?: string | null; actorCharacterId?: string | null },
  ) {
    return this.replyLogicAdminService.previewCharacterReply(
      id,
      body.userMessage?.trim() ?? '',
    );
  }

  @Get('reply-logic/conversations/:id')
  getReplyLogicConversation(@Param('id') id: string) {
    return this.replyLogicAdminService.getConversationSnapshot(id);
  }

  @Post('reply-logic/group-reply-tasks/cleanup')
  cleanupReplyLogicGroupReplyTasks(
    @Body()
    body: {
      olderThanDays?: number | null;
      groupId?: string | null;
      statuses?: string[] | null;
    },
  ) {
    return this.replyLogicAdminService.cleanupGroupReplyTasks(body);
  }

  @Post('reply-logic/group-reply-tasks/:taskId/retry')
  retryReplyLogicGroupReplyTask(@Param('taskId') taskId: string) {
    return this.replyLogicAdminService.retryGroupReplyTask(taskId);
  }

  @Post('reply-logic/group-reply-turns/:turnId/retry')
  retryReplyLogicGroupReplyTurn(@Param('turnId') turnId: string) {
    return this.replyLogicAdminService.retryGroupReplyTurn(turnId);
  }

  @Post('reply-logic/conversations/:id/preview')
  previewReplyLogicConversation(
    @Param('id') id: string,
    @Body() body: { userMessage?: string | null; actorCharacterId?: string | null },
  ) {
    return this.replyLogicAdminService.previewConversationReply(
      id,
      body.userMessage?.trim() ?? '',
      body.actorCharacterId?.trim() || undefined,
    );
  }
}
