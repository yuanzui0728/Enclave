import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CharacterEntity } from '../characters/character.entity';
import { CharacterBlueprintService } from '../characters/character-blueprint.service';
import { ReplyLogicAdminService } from './reply-logic-admin.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { WechatSyncAdminService } from './wechat-sync-admin.service';
import { ActionRuntimeService } from '../action-runtime/action-runtime.service';
import { CyberAvatarAdminService } from '../cyber-avatar/cyber-avatar-admin.service';
import { NeedDiscoveryService } from '../need-discovery/need-discovery.service';
import { RealWorldSyncService } from '../real-world-sync/real-world-sync.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { FollowupRuntimeService } from '../followup-runtime/followup-runtime.service';
import { ReminderRuntimeService } from '../reminder-runtime/reminder-runtime.service';
import { SelfAgentService } from '../self-agent/self-agent.service';
import type { RealWorldSyncRulesValue } from '../real-world-sync/real-world-sync.types';
import type { NeedDiscoveryConfig } from '../need-discovery/need-discovery.types';
import type { FollowupRuntimeRulesValue } from '../followup-runtime/followup-runtime.types';
import type { ReminderRuntimeRulesValue } from '../reminder-runtime/reminder-runtime.types';
import type {
  WechatSyncImportRequestValue,
  WechatSyncPreviewRequestValue,
} from './wechat-sync-admin.types';

const SELF_AGENT_WORKSPACE_DOCUMENT_NAMES = [
  'AGENTS.md',
  'SOUL.md',
  'USER.md',
  'IDENTITY.md',
  'TOOLS.md',
  'HEARTBEAT.md',
  'MEMORY.md',
] as const;

type SelfAgentWorkspaceDocumentName =
  (typeof SELF_AGENT_WORKSPACE_DOCUMENT_NAMES)[number];

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly replyLogicAdminService: ReplyLogicAdminService,
    private readonly characterBlueprintService: CharacterBlueprintService,
    private readonly ai: AiOrchestratorService,
    private readonly usageLedger: AiUsageLedgerService,
    private readonly wechatSyncAdminService: WechatSyncAdminService,
    private readonly actionRuntimeService: ActionRuntimeService,
    private readonly cyberAvatarAdminService: CyberAvatarAdminService,
    private readonly needDiscoveryService: NeedDiscoveryService,
    private readonly realWorldSyncService: RealWorldSyncService,
    private readonly schedulerService: SchedulerService,
    private readonly followupRuntimeService: FollowupRuntimeService,
    private readonly reminderRuntimeService: ReminderRuntimeService,
    private readonly selfAgentService: SelfAgentService,
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

  @Get('real-world-sync/overview')
  getRealWorldSyncOverview() {
    return this.realWorldSyncService.getOverview();
  }

  @Get('followup-runtime/overview')
  getFollowupRuntimeOverview() {
    return this.followupRuntimeService.getOverview();
  }

  @Get('reminder-runtime/overview')
  getReminderRuntimeOverview() {
    return this.reminderRuntimeService.getOverview();
  }

  @Get('self-agent/overview')
  getSelfAgentOverview() {
    return this.selfAgentService.getAdminOverview();
  }

  @Get('self-agent/rules')
  getSelfAgentRules() {
    return this.selfAgentService.getRules();
  }

  @Patch('self-agent/rules')
  setSelfAgentRules(@Body() body: Record<string, unknown>) {
    return this.selfAgentService.setRules(body);
  }

  @Get('self-agent/workspace/:name')
  getSelfAgentWorkspaceDocument(@Param('name') name: string) {
    return this.selfAgentService.getWorkspaceDocument(
      this.parseSelfAgentWorkspaceDocumentName(name),
    );
  }

  @Patch('self-agent/workspace/:name')
  updateSelfAgentWorkspaceDocument(
    @Param('name') name: string,
    @Body() body: { content?: string | null },
  ) {
    return this.selfAgentService.updateWorkspaceDocument(
      this.parseSelfAgentWorkspaceDocumentName(name),
      body.content ?? '',
    );
  }

  @Post('self-agent/heartbeat/run')
  runSelfAgentHeartbeat(
    @Body()
    body: {
      trigger?: 'manual' | 'scheduler' | null;
    },
  ) {
    return this.selfAgentService.runHeartbeat({
      trigger: body.trigger === 'scheduler' ? 'scheduler' : 'manual',
    });
  }

  @Get('reminder-runtime/rules')
  getReminderRuntimeRules() {
    return this.reminderRuntimeService.getRules();
  }

  @Patch('reminder-runtime/rules')
  setReminderRuntimeRules(@Body() body: Partial<ReminderRuntimeRulesValue>) {
    return this.reminderRuntimeService.setRules(body);
  }

  @Post('reminder-runtime/preview')
  previewReminderRuntime(
    @Body()
    body: {
      message?: string | null;
      rules?: Partial<ReminderRuntimeRulesValue> | null;
    },
  ) {
    return this.reminderRuntimeService.previewMessage({
      message: body.message?.trim() ?? '',
      rules: body.rules ?? undefined,
    });
  }

  @Post('reminder-runtime/tasks/:id/complete')
  completeReminderRuntimeTask(@Param('id') id: string) {
    return this.reminderRuntimeService.completeTask(id);
  }

  @Post('reminder-runtime/tasks/:id/snooze')
  snoozeReminderRuntimeTask(
    @Param('id') id: string,
    @Body() body: { minutes?: number; hours?: number; until?: string },
  ) {
    return this.reminderRuntimeService.snoozeTask(id, body);
  }

  @Delete('reminder-runtime/tasks/:id')
  cancelReminderRuntimeTask(@Param('id') id: string) {
    return this.reminderRuntimeService.cancelTask(id);
  }

  @Get('followup-runtime/rules')
  getFollowupRuntimeRules() {
    return this.followupRuntimeService.getRules();
  }

  @Patch('followup-runtime/rules')
  setFollowupRuntimeRules(@Body() body: Partial<FollowupRuntimeRulesValue>) {
    return this.followupRuntimeService.setRules(body);
  }

  @Get('real-world-sync/characters/:id')
  getRealWorldSyncCharacterDetail(@Param('id') id: string) {
    return this.realWorldSyncService.getCharacterDetail(id);
  }

  @Patch('real-world-sync/rules')
  setRealWorldSyncRules(
    @Body()
    body: {
      providerMode?: 'mock' | 'google_news_rss';
      defaultLocale?: string;
      defaultSourceAllowlist?: string[];
      defaultSourceBlocklist?: string[];
      defaultRecencyHours?: number;
      defaultMaxSignalsPerRun?: number;
      defaultMinimumConfidence?: number;
      googleNews?: {
        editionLanguage?: string;
        editionRegion?: string;
        editionCeid?: string;
        maxEntriesPerQuery?: number;
        fallbackToMockOnEmpty?: boolean;
      };
      promptTemplates?: {
        signalNormalizationPrompt?: string;
        dailyDigestPrompt?: string;
        scenePatchPrompt?: string;
        realityMomentPrompt?: string;
      };
    },
  ) {
    return this.realWorldSyncService.setRules(
      body as Partial<RealWorldSyncRulesValue>,
    );
  }

  @Post('real-world-sync/run')
  runRealWorldSync(
    @Body()
    body: {
      characterId?: string | null;
    },
  ) {
    return this.realWorldSyncService.runSync({
      characterId: body.characterId ?? null,
      force: true,
    });
  }

  @Post('real-world-sync/news-bulletins/publish')
  publishWorldNewsBulletin(
    @Body()
    body: {
      slot?: 'morning' | 'noon' | 'evening' | null;
    },
  ) {
    return this.schedulerService.publishWorldNewsDeskBulletin({
      slot: body.slot ?? undefined,
    });
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

  @Post('wechat-sync/preview')
  previewWechatSync(@Body() body: WechatSyncPreviewRequestValue) {
    return this.wechatSyncAdminService.preview(body);
  }

  @Post('wechat-sync/import')
  importWechatSync(@Body() body: WechatSyncImportRequestValue) {
    return this.wechatSyncAdminService.import(body);
  }

  @Get('wechat-sync/history')
  getWechatSyncHistory() {
    return this.wechatSyncAdminService.getHistory();
  }

  @Post('wechat-sync/history/:characterId/retry-friendship')
  retryWechatSyncFriendship(@Param('characterId') characterId: string) {
    return this.wechatSyncAdminService.retryFriendship(characterId);
  }

  @Delete('wechat-sync/history/:characterId')
  rollbackWechatSyncImport(@Param('characterId') characterId: string) {
    return this.wechatSyncAdminService.rollbackImport(characterId);
  }

  @Get('need-discovery/overview')
  getNeedDiscoveryOverview() {
    return this.needDiscoveryService.getOverview();
  }

  @Patch('need-discovery/config')
  setNeedDiscoveryConfig(@Body() body: Partial<NeedDiscoveryConfig>) {
    return this.needDiscoveryService.setConfig(body);
  }

  @Post('characters')
  createCharacter(@Body() body: Partial<CharacterEntity>) {
    return this.adminService.createCharacter(body);
  }

  @Patch('characters/:id')
  updateCharacter(
    @Param('id') id: string,
    @Body() body: Partial<CharacterEntity>,
  ) {
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

  @Get('action-runtime/overview')
  getActionRuntimeOverview() {
    return this.actionRuntimeService.getAdminOverview();
  }

  @Get('action-runtime/rules')
  getActionRuntimeRules() {
    return this.actionRuntimeService.getRules();
  }

  @Patch('action-runtime/rules')
  setActionRuntimeRules(@Body() body: Record<string, unknown>) {
    return this.actionRuntimeService.setRules(body);
  }

  @Get('action-runtime/connectors')
  listActionRuntimeConnectors() {
    return this.actionRuntimeService.listConnectors();
  }

  @Patch('action-runtime/connectors/:id')
  updateActionRuntimeConnector(
    @Param('id') id: string,
    @Body()
    body: {
      displayName?: string | null;
      status?: 'disabled' | 'ready' | 'error' | null;
      endpointConfig?: Record<string, unknown> | null;
      credential?: string | null;
      clearCredential?: boolean | null;
    },
  ) {
    return this.actionRuntimeService.updateConnector(id, {
      displayName: body.displayName?.trim() || undefined,
      status:
        body.status === 'disabled' ||
        body.status === 'ready' ||
        body.status === 'error'
          ? body.status
          : undefined,
      endpointConfig: body.endpointConfig,
      credential: body.credential,
      clearCredential: body.clearCredential === true,
    });
  }

  @Get('action-runtime/runs')
  listActionRuntimeRuns(@Query('limit') limit?: string | number) {
    const parsedLimit =
      typeof limit === 'number' ? limit : Number.parseInt(limit ?? '', 10);
    return this.actionRuntimeService.listRuns(
      Number.isFinite(parsedLimit) ? parsedLimit : 20,
    );
  }

  @Get('action-runtime/runs/:id')
  getActionRuntimeRun(@Param('id') id: string) {
    return this.actionRuntimeService.getRun(id);
  }

  @Post('action-runtime/preview')
  previewActionRuntime(@Body() body: { message?: string | null }) {
    return this.actionRuntimeService.previewMessage(body.message?.trim() ?? '');
  }

  @Get('cyber-avatar/overview')
  getCyberAvatarOverview() {
    return this.cyberAvatarAdminService.getOverview();
  }

  @Get('cyber-avatar/rules')
  getCyberAvatarRules() {
    return this.cyberAvatarAdminService.getRules();
  }

  @Patch('cyber-avatar/rules')
  setCyberAvatarRules(@Body() body: Record<string, unknown>) {
    return this.cyberAvatarAdminService.setRules(body);
  }

  @Get('cyber-avatar/profile')
  getCyberAvatarProfile() {
    return this.cyberAvatarAdminService.getProfile();
  }

  @Get('cyber-avatar/signals')
  listCyberAvatarSignals(@Query('limit') limit?: string) {
    return this.cyberAvatarAdminService.listSignals(
      limit ? Number.parseInt(limit, 10) : undefined,
    );
  }

  @Get('cyber-avatar/real-world/items')
  listCyberAvatarRealWorldItems(@Query('limit') limit?: string) {
    return this.cyberAvatarAdminService.listRealWorldItems(
      limit ? Number.parseInt(limit, 10) : undefined,
    );
  }

  @Get('cyber-avatar/real-world/briefs')
  listCyberAvatarRealWorldBriefs(@Query('limit') limit?: string) {
    return this.cyberAvatarAdminService.listRealWorldBriefs(
      limit ? Number.parseInt(limit, 10) : undefined,
    );
  }

  @Get('cyber-avatar/runs')
  listCyberAvatarRuns(@Query('limit') limit?: string) {
    return this.cyberAvatarAdminService.listRuns(
      limit ? Number.parseInt(limit, 10) : undefined,
    );
  }

  @Get('cyber-avatar/runs/:id')
  getCyberAvatarRunDetail(@Param('id') id: string) {
    return this.cyberAvatarAdminService.getRunDetail(id);
  }

  @Post('cyber-avatar/run/incremental')
  runCyberAvatarIncremental() {
    return this.cyberAvatarAdminService.runIncremental();
  }

  @Post('cyber-avatar/run/deep-refresh')
  runCyberAvatarDeepRefresh() {
    return this.cyberAvatarAdminService.runDeepRefresh();
  }

  @Post('cyber-avatar/run/full-rebuild')
  runCyberAvatarFullRebuild() {
    return this.cyberAvatarAdminService.runFullRebuild();
  }

  @Post('cyber-avatar/run/project')
  runCyberAvatarProjection() {
    return this.cyberAvatarAdminService.runProjection();
  }

  @Post('cyber-avatar/run/real-world')
  runCyberAvatarRealWorldSync() {
    return this.cyberAvatarAdminService.runRealWorldSync();
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
    @Body()
    body: { userMessage?: string | null; actorCharacterId?: string | null },
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
    @Body()
    body: { userMessage?: string | null; actorCharacterId?: string | null },
  ) {
    return this.replyLogicAdminService.previewConversationReply(
      id,
      body.userMessage?.trim() ?? '',
      body.actorCharacterId?.trim() || undefined,
    );
  }

  private parseSelfAgentWorkspaceDocumentName(
    value: string,
  ): SelfAgentWorkspaceDocumentName {
    if (
      SELF_AGENT_WORKSPACE_DOCUMENT_NAMES.includes(
        value as SelfAgentWorkspaceDocumentName,
      )
    ) {
      return value as SelfAgentWorkspaceDocumentName;
    }

    throw new BadRequestException('未知的 self-agent workspace 文档名。');
  }
}
