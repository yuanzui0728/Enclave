// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { randomUUID } from 'crypto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CharacterBlueprintService } from '../../characters/character-blueprint.service';
import type { CharacterBlueprintRecipeValue } from '../../characters/character-blueprint.types';
import { CharacterEntity } from '../../characters/character.entity';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import {
  CharacterRevisionEntity,
  type WikiContentSnapshot,
} from '../entities/character-revision.entity';
import { EditSubmissionEntity } from '../entities/edit-submission.entity';
import { UserWikiProfileEntity } from '../entities/user-wiki-profile.entity';
import { rankOf } from '../guards/wiki-role.guard';
import { AbuseFilterService } from './abuse-filter.service';
import { WikiBlockService } from './wiki-block.service';
import { WikiFieldProtectionService } from './wiki-field-protection.service';
import { WikiPageService } from './wiki-page.service';
import { WikiRoleService } from './wiki-role.service';
import {
  WIKI_CONTENT_FIELDS,
  assertWikiEditSummary,
  assertWikiNameNotVisuallyEmpty,
  createDefaultWikiRecipe,
  diffFields,
  diffPaths,
  filterPhantomBlankPaths,
  hasPathOverlap,
  isHighRiskRecipeChange,
  mergeContentSnapshot,
  mergeValueByPaths,
  normalizeWikiRecipe,
  pickWikiContent,
  resolveMinorEdit as resolveMinorEditPure,
  snapshotFromRecipe,
  snapshotFromCharacter,
} from '../wiki.types';
import { WIKI_ROLE_RANK } from '../guards/wiki-role.guard';

export type SubmitEditInput = {
  contentSnapshot: Record<string, unknown>;
  recipeSnapshot?: Record<string, unknown> | null;
  baseRevisionId?: string | null;
  editSummary?: string;
  isMinor?: boolean;
};

export type SubmitEditResult = {
  revisionId: string;
  status: string;
  isPatrolled: boolean;
  appliedToCharacter: boolean;
  warnings?: string[];
};

@Injectable()
export class WikiEditService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
    @InjectRepository(EditSubmissionEntity)
    private readonly submissionRepo: Repository<EditSubmissionEntity>,
    @InjectRepository(UserWikiProfileEntity)
    private readonly profileRepo: Repository<UserWikiProfileEntity>,
    private readonly pages: WikiPageService,
    private readonly blocks: WikiBlockService,
    private readonly roles: WikiRoleService,
    private readonly blueprints: CharacterBlueprintService,
    private readonly filters: AbuseFilterService,
    private readonly fieldProtection: WikiFieldProtectionService,
  ) {}

  async submit(
    characterId: string,
    user: AuthenticatedUser,
    input: SubmitEditInput,
  ): Promise<SubmitEditResult> {
    // submit / createPage / requestLifecycle / syncFromCharacter 都会改 listPages
    // 输出（新增 pending revision、改 page status、改 character 基本信息）。统一入口
    // invalidate，避免编辑者刷首页看到 60s 内的陈旧自有改动。
    this.pages.invalidateListPagesCache();
    if (input.recipeSnapshot) {
      return this.submitRecipeEdit(characterId, user, input);
    }

    await this.blocks.assertCanEdit(user, characterId);
    const page = await this.pages.getOrInitPage(characterId);
    if (page.isDeleted) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '该词条已被删除，无法编辑' },
        legacyMessage: '该词条已被删除，无法编辑',
      });
    }
    this.assertProtection(page.protectionLevel, user.role);

    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '角色不存在' },
        legacyMessage: '角色不存在',
      });

    // 历史上 page.currentRevisionId 指向被 soft-delete / 物理删除的 revision
    // 时，`(await findOne(...))!.contentSnapshot` 会在 null 上读属性 → 500
    // 把 stack 漏出去。findOne 返回 null 时回退到 character snapshot，与全新
    // page（无 currentRevisionId）走同一条路径。
    const currentRevision = page.currentRevisionId
      ? await this.revisionRepo.findOne({
          where: { id: page.currentRevisionId },
        })
      : null;
    const before: WikiContentSnapshot = currentRevision
      ? currentRevision.contentSnapshot
      : snapshotFromCharacter(character as unknown as Record<string, unknown>);

    // Reject malformed bodies that would silently blank fields. Missing keys
    // in the patch fall back to `before`; explicit empty values stay through
    // (so users can clear e.g. avatar), but `name` must remain non-empty.
    const rawPatch =
      input.contentSnapshot && typeof input.contentSnapshot === 'object'
        ? input.contentSnapshot
        : null;
    if (!rawPatch) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: 'contentSnapshot 必须为对象' },
        legacyMessage: 'contentSnapshot 必须为对象',
      });
    }
    const presentKeys = WIKI_CONTENT_FIELDS.filter((field) => field in rawPatch);
    if (presentKeys.length === 0) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: {
          detail:
            'contentSnapshot 至少需提交一个内容字段（name/avatar/bio/personality/expertDomains/triggerScenes/relationship/relationshipType）',
        },
        legacyMessage:
          'contentSnapshot 至少需提交一个内容字段（name/avatar/bio/personality/expertDomains/triggerScenes/relationship/relationshipType）',
      });
    }
    const submittedPick = pickWikiContent(rawPatch);
    const submitted: WikiContentSnapshot = {
      ...before,
      schemaVersion: submittedPick.schemaVersion,
    };
    for (const field of presentKeys) {
      (submitted as Record<string, unknown>)[field] = (
        submittedPick as Record<string, unknown>
      )[field];
    }
    // 不能用 trim() 单独判断空——纯零宽字符 (U+200B-U+200D / U+FEFF / U+2060)
    // 不会被 trim 干掉，会让 wiki 列表/卡片显示空白行且不可点（私有角色 2026-05-15
    // v2 走查时同一类型坑已经修过，这里复用统一 helper）。
    assertWikiNameNotVisuallyEmpty(submitted.name);
    let after = submitted;
    let changed = diffFields(before, after);
    let changeSource = 'edit';

    if (
      input.baseRevisionId &&
      page.currentRevisionId &&
      input.baseRevisionId !== page.currentRevisionId
    ) {
      const baseRev = await this.revisionRepo.findOne({
        where: { id: input.baseRevisionId },
      });
      if (!baseRev) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '基线版本无效' },
        legacyMessage: '基线版本无效',
      });
      }
      const userChanged = diffFields(baseRev.contentSnapshot, submitted);
      const concurrentChanged = diffFields(baseRev.contentSnapshot, before);
      const overlap = userChanged.filter((f) => concurrentChanged.includes(f));
      if (overlap.length > 0) {
        throw new AppError('WIKI_REVISION_CONFLICT', {
          status: HttpStatus.CONFLICT,
          params: {
            conflictingFields: overlap.join(','),
            currentRevisionId: page.currentRevisionId ?? '',
          },
          legacyMessage: '存在编辑冲突，请基于最新版本重新提交',
        });
      }
      after = mergeContentSnapshot(before, submitted, userChanged);
      changed = diffFields(before, after);
      changeSource = 'merge';
    }

    if (changed.length === 0) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '未检测到变更' },
        legacyMessage: '未检测到变更',
      });
    }

    this.assertEditSummary({
      operation: 'edit',
      riskLevel: 'low',
      revisionKind: 'content',
      summary: input.editSummary,
    });

    const abuse = await this.filters.check({
      user,
      characterId,
      contentSnapshot: after,
      beforeContent: before,
      operation: 'edit',
    });

    let autoApprove = rankOf(user.role) >= rankOf('autoconfirmed');
    if (abuse.action === 'tag_high_risk') {
      autoApprove = false;
    }
    const contentRiskLevel = abuse.action === 'tag_high_risk' ? 'high' : 'low';

    // 字段级保护：content 路径同样要查。否则 admin 在面板里设字段保护（fieldPath
    // 落在内容字段上）就完全无效。recipe 路径在下面 submitRecipeEdit 里已有。
    await this.fieldProtection.assertCanEditPaths(user, characterId, changed);

    const result = await this.dataSource.transaction(async (manager) => {
      const nextVersion =
        (await this.getLastVersion(characterId, manager)) + 1;
      const contentDiff: Record<string, unknown> = { changed };
      if (abuse.hits.length > 0) {
        contentDiff.abuseFilterHits = abuse.hits.map((h) => h.filterName);
      }
      const revision = manager.create(CharacterRevisionEntity, {
        characterId,
        version: nextVersion,
        parentRevisionId: page.currentRevisionId ?? null,
        baseRevisionId: input.baseRevisionId ?? page.currentRevisionId ?? null,
        contentSnapshot: after,
        diffFromParent: contentDiff,
        editorUserId: user.id,
        editorRoleAtTime: user.role,
        editSummary: (typeof input.editSummary === 'string' ? input.editSummary : '').slice(0, 500),
        status: autoApprove ? 'approved' : 'pending',
        revisionKind: 'content',
        operation: 'edit',
        riskLevel: contentRiskLevel,
        changeSource,
        isMinor: this.resolveMinorEdit(input.isMinor, user.role),
        isPatrolled: false,
      });
      const savedRev = await manager.save(revision);

      if (!autoApprove) {
        const submission = manager.create(EditSubmissionEntity, {
          revisionId: savedRev.id,
          characterId,
          submitterId: user.id,
          operation: 'edit',
          riskLevel: contentRiskLevel,
          decision: null,
          priority: contentRiskLevel === 'high' ? 5 : 0,
        });
        await manager.save(submission);
        await manager.update(
          CharacterPageEntity,
          { characterId },
          { latestRevisionId: savedRev.id },
        );
      } else {
        await manager.update(
          CharacterPageEntity,
          { characterId },
          {
            currentRevisionId: savedRev.id,
            latestRevisionId: savedRev.id,
            title: after.name,
            lifecycleStatus: 'active',
          },
        );
        await this.applySnapshotToCharacter(manager, characterId, after);
      }

      // editCount 用原子自增，避免并发提交把同一 page.editCount 读到再 +1 丢更新。
      await manager.increment(
        CharacterPageEntity,
        { characterId },
        'editCount',
        1,
      );

      await this.bumpProfile(manager, user.id, autoApprove);

      return savedRev;
    });

    if (autoApprove) {
      void this.roles.checkPromotion(user.id).catch(() => undefined);
    }

    return {
      revisionId: result.id,
      status: result.status,
      isPatrolled: result.isPatrolled,
      appliedToCharacter: autoApprove,
      warnings: abuse.warnings.length > 0 ? abuse.warnings : undefined,
    };
  }

  async createPage(
    user: AuthenticatedUser,
    input: {
      characterId?: string | null;
      recipeSnapshot?: Record<string, unknown> | null;
      contentSnapshot?: Record<string, unknown> | null;
      editSummary?: string | null;
    },
  ): Promise<SubmitEditResult & { characterId: string }> {
    this.pages.invalidateListPagesCache();
    const characterId = this.resolveNewCharacterId(input.characterId);
    await this.blocks.assertCanEdit(user, characterId);

    const seedInput =
      input.recipeSnapshot ??
      input.contentSnapshot ??
      ({} as Record<string, unknown>);
    // 在 normalize 把缺失字段补成 '未命名角色' 之前，先校验用户实际**提交了**一个
    // 视觉非空的 name。否则 curl 一打 `{}` 或 `{"contentSnapshot":{"name":""}}`
    // 就能起一条名为「未命名角色」的占位词条，patroller 队列 / 列表里全是垃圾。
    const seededName = extractSeedName(seedInput);
    assertWikiNameNotVisuallyEmpty(seededName);
    const recipe = normalizeWikiRecipe(
      seedInput,
      createDefaultWikiRecipe(seedInput),
    );
    const content = snapshotFromRecipe(recipe);
    // 二次兜底：normalize 完之后 content.name 仍可能因 trim 后是空（兜底进 fallback
    // 的极端 case，例如 seedInput.name=' '）—— assert 一次确保 DB 落下来一定非空。
    assertWikiNameNotVisuallyEmpty(content.name);
    this.assertEditSummary({
      operation: 'create',
      riskLevel: 'high',
      revisionKind: 'recipe',
      summary: input.editSummary,
    });
    const abuseCreate = await this.filters.check({
      user,
      characterId,
      contentSnapshot: content,
      recipeSnapshot: recipe,
      operation: 'create',
      isCreate: true,
    });
    // tag_high_risk on create is a no-op (create is already high-risk &
    // patroller-only); but persist hits for visibility.
    const autoApprove = rankOf(user.role) >= rankOf('patroller');
    const revision = await this.dataSource.transaction(async (manager) => {
      // 存在性检查放进 tx，避免两个并发 createPage 同时通过预检后写出两条 v=1。
      // CharacterPageEntity.characterId 是主键，第二个 INSERT 自然失败；revision 表
      // 也有 (characterId, version) unique，双重兜底。
      const existing = await manager.findOne(CharacterEntity, {
        where: { id: characterId },
      });
      if (existing) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          params: { detail: '角色 ID 已存在' },
          legacyMessage: '角色 ID 已存在',
        });
      }
      const existingPage = await manager.findOne(CharacterPageEntity, {
        where: { characterId },
      });
      if (existingPage) {
        const detail =
          existingPage.lifecycleStatus === 'pending_create'
            ? '该角色已有待审创建请求'
            : '词条已存在';
        throw new AppError('WIKI_VALIDATION_FAILED', {
          params: { detail },
          legacyMessage: detail,
        });
      }

      const page = manager.create(CharacterPageEntity, {
        characterId,
        title: content.name,
        currentRevisionId: null,
        latestRevisionId: null,
        lifecycleStatus: autoApprove ? 'active' : 'pending_create',
        reviewPolicy: 'open',
        protectionLevel: 'none',
        isPatrolled: false,
        watcherCount: 0,
        editCount: 0,
        isDeleted: false,
      });
      await manager.save(page);

      const created = manager.create(CharacterRevisionEntity, {
        characterId,
        version: 1,
        parentRevisionId: null,
        baseRevisionId: null,
        contentSnapshot: content,
        recipeSnapshot: recipe,
        diffFromParent: { changed: ['__create__'] },
        editorUserId: user.id,
        editorRoleAtTime: user.role,
        editSummary: (typeof input.editSummary === 'string' && input.editSummary ? input.editSummary : '创建角色词条').slice(0, 500),
        status: autoApprove ? 'approved' : 'pending',
        revisionKind: 'recipe',
        operation: 'create',
        riskLevel: 'high',
        changeSource: 'edit',
        isMinor: false,
        isPatrolled: false,
      });
      const saved = await manager.save(created);
      await manager.update(
        CharacterPageEntity,
        { characterId },
        {
          currentRevisionId: autoApprove ? saved.id : null,
          latestRevisionId: saved.id,
          title: content.name,
          lifecycleStatus: autoApprove ? 'active' : 'pending_create',
        },
      );
      if (!autoApprove) {
        await manager.save(
          manager.create(EditSubmissionEntity, {
            revisionId: saved.id,
            characterId,
            submitterId: user.id,
            operation: 'create',
            riskLevel: 'high',
            decision: null,
            priority: 10,
          }),
        );
      }
      await this.bumpProfile(manager, user.id, autoApprove);
      return saved;
    });

    if (autoApprove) {
      try {
        await this.applyApprovedRevision(revision, user.id);
        // createCharacterFromRecipe 会为空 expertDomains 注入 ['general']、把
        // 空字符串 personality 落库成 NULL 等 runtime 默认值，导致刚 create
        // 完 wiki-page.service 的 computeDrift 立刻把 v1 标成 admin_override
        // 弹"角色已被管理员后台直接修改"banner。重新基于落库后的 character +
        // published recipe snapshot 回写 v1，使 drift=0 直到用户/admin 真的
        // 在 wiki 之外改了 runtime。
        await this.resyncCreateRevisionToRuntime(revision.id, characterId);
        void this.roles.checkPromotion(user.id).catch(() => undefined);
      } catch (err) {
        // 把页降回 pending_create，让用户的创建请求进入审核队列而不是消失。
        await this.rollbackAutoApproval({
          revisionId: revision.id,
          characterId,
          submitterId: user.id,
          operation: 'create',
          riskLevel: 'high',
          priority: 10,
          previousPage: {
            currentRevisionId: null,
            latestRevisionId: revision.id,
            lifecycleStatus: 'pending_create',
            title: content.name,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
          },
        }).catch(() => undefined);
        throw err;
      }
    }

    return {
      characterId,
      revisionId: revision.id,
      status: revision.status,
      isPatrolled: revision.isPatrolled,
      appliedToCharacter: autoApprove,
      warnings: abuseCreate.warnings.length > 0 ? abuseCreate.warnings : undefined,
    };
  }

  private async resyncCreateRevisionToRuntime(
    revisionId: string,
    characterId: string,
  ): Promise<void> {
    const character = await this.characterRepo.findOne({ where: { id: characterId } });
    if (!character) return;
    const liveContent = snapshotFromCharacter(
      character as unknown as Record<string, unknown>,
    );
    let publishedRecipe: CharacterBlueprintRecipeValue | null = null;
    try {
      const factory = await this.blueprints.getFactorySnapshot(characterId);
      publishedRecipe = factory.blueprint.publishedRecipe ?? null;
    } catch {
      publishedRecipe = null;
    }
    await this.revisionRepo.update(
      { id: revisionId },
      {
        contentSnapshot: liveContent,
        ...(publishedRecipe ? { recipeSnapshot: publishedRecipe } : {}),
      },
    );
    this.pages.invalidateListPagesCache();
  }

  async requestLifecycle(
    characterId: string,
    user: AuthenticatedUser,
    operation: 'soft_delete' | 'restore',
    reason?: string | null,
  ): Promise<SubmitEditResult> {
    this.pages.invalidateListPagesCache();
    await this.blocks.assertCanEdit(user, characterId);
    const page = await this.pages.getOrInitPage(characterId);
    this.assertProtection(page.protectionLevel, user.role);
    // 防止"重复 lifecycle"——已经 deleted 还能再 delete、active 还能再 restore，
    // 会在 history 里堆出冗余 v9/v10 同操作 lifecycle 修订，2026-05-16 走查发现。
    if (operation === 'soft_delete' && page.lifecycleStatus === 'deleted') {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: { detail: '该角色已是删除状态，无需再次删除' },
        legacyMessage: '该角色已是删除状态，无需再次删除',
      });
    }
    if (operation === 'restore' && page.lifecycleStatus === 'active') {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: { detail: '该角色未处于删除状态，无需恢复' },
        legacyMessage: '该角色未处于删除状态，无需恢复',
      });
    }
    this.assertEditSummary({
      operation,
      riskLevel: 'high',
      revisionKind: 'lifecycle',
      summary: reason,
    });
    const abuseLifecycle = await this.filters.check({
      user,
      characterId,
      contentSnapshot: { name: '', avatar: '', bio: reason ?? '', expertDomains: [], relationship: '', relationshipType: '' } as WikiContentSnapshot,
      operation,
    });
    const character = await this.characterRepo.findOne({ where: { id: characterId } });
    if (!character) throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '角色不存在' },
        legacyMessage: '角色不存在',
      });
    const currentRevision = page.currentRevisionId
      ? await this.revisionRepo.findOne({ where: { id: page.currentRevisionId } })
      : null;
    const factorySnapshot = await this.blueprints.getFactorySnapshot(characterId);
    const recipe =
      currentRevision?.recipeSnapshot ??
      factorySnapshot.blueprint.publishedRecipe ??
      factorySnapshot.blueprint.draftRecipe;
    const content =
      currentRevision?.contentSnapshot ??
      snapshotFromCharacter(character as unknown as Record<string, unknown>);
    const autoApprove = rankOf(user.role) >= rankOf('patroller');
    const revision = await this.dataSource.transaction(async (manager) => {
      const nextVersion =
        (await this.getLastVersion(characterId, manager)) + 1;
      const created = manager.create(CharacterRevisionEntity, {
        characterId,
        version: nextVersion,
        parentRevisionId: page.currentRevisionId ?? null,
        baseRevisionId: page.currentRevisionId ?? null,
        contentSnapshot: content,
        recipeSnapshot: recipe,
        diffFromParent: { changed: [operation === 'soft_delete' ? '__delete__' : '__restore__'] },
        editorUserId: user.id,
        editorRoleAtTime: user.role,
        editSummary: (reason ?? (operation === 'soft_delete' ? '申请删除词条' : '申请恢复词条')).slice(0, 500),
        status: autoApprove ? 'approved' : 'pending',
        revisionKind: 'lifecycle',
        operation,
        riskLevel: 'high',
        changeSource: 'edit',
        isMinor: false,
        isPatrolled: false,
      });
      const saved = await manager.save(created);
      if (!autoApprove) {
        await manager.save(
          manager.create(EditSubmissionEntity, {
            revisionId: saved.id,
            characterId,
            submitterId: user.id,
            operation,
            riskLevel: 'high',
            decision: null,
            priority: 20,
          }),
        );
      }
      await manager.update(
        CharacterPageEntity,
        { characterId },
        { latestRevisionId: saved.id },
      );
      await manager.increment(
        CharacterPageEntity,
        { characterId },
        'editCount',
        1,
      );
      await this.bumpProfile(manager, user.id, autoApprove);
      return saved;
    });

    if (autoApprove) {
      try {
        await this.applyApprovedRevision(revision, user.id);
        void this.roles.checkPromotion(user.id).catch(() => undefined);
      } catch (err) {
        await this.rollbackAutoApproval({
          revisionId: revision.id,
          characterId,
          submitterId: user.id,
          operation,
          riskLevel: 'high',
          priority: 20,
          previousPage: {
            currentRevisionId: page.currentRevisionId ?? null,
            latestRevisionId: page.latestRevisionId ?? null,
            lifecycleStatus: page.lifecycleStatus,
            title: page.title ?? null,
            isDeleted: page.isDeleted,
            deletedAt: page.deletedAt ?? null,
            deletedBy: page.deletedBy ?? null,
          },
        }).catch(() => undefined);
        throw err;
      }
    }

    return {
      revisionId: revision.id,
      status: revision.status,
      isPatrolled: revision.isPatrolled,
      appliedToCharacter: autoApprove,
      warnings:
        abuseLifecycle.warnings.length > 0
          ? abuseLifecycle.warnings
          : undefined,
    };
  }

  /**
   * 把 character 当前态（含 admin 后台直改产生的漂移）作为新 revision 写入 wiki，
   * 自动 approved + patrolled，changeSource='admin_override'。仅 patroller+ 可调。
   * 用于消除"admin 直改 → wiki 显示与实际不一致"的漂移横幅。
   */
  async syncFromCharacter(
    characterId: string,
    actor: AuthenticatedUser,
  ): Promise<SubmitEditResult> {
    this.pages.invalidateListPagesCache();
    if (rankOf(actor.role) < rankOf('patroller')) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '仅巡查员及以上可触发漂移同步' },
        legacyMessage: '仅巡查员及以上可触发漂移同步',
      });
    }
    const page = await this.pages.getOrInitPage(characterId);
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '角色不存在' },
        legacyMessage: '角色不存在',
      });
    const liveContent = snapshotFromCharacter(
      character as unknown as Record<string, unknown>,
    );
    const factorySnapshot = await this.blueprints.getFactorySnapshot(characterId);
    const liveRecipe =
      factorySnapshot.blueprint.publishedRecipe ??
      factorySnapshot.blueprint.draftRecipe ??
      null;
    const saved = await this.dataSource.transaction(async (manager) => {
      const nextVersion =
        (await this.getLastVersion(characterId, manager)) + 1;
      const created = manager.create(CharacterRevisionEntity, {
        characterId,
        version: nextVersion,
        parentRevisionId: page.currentRevisionId ?? null,
        baseRevisionId: page.currentRevisionId ?? null,
        contentSnapshot: liveContent,
        recipeSnapshot: liveRecipe,
        diffFromParent: { changed: ['__sync_from_character__'] },
        editorUserId: actor.id,
        editorRoleAtTime: actor.role,
        editSummary: '同步管理员直改的角色字段到 wiki 历史',
        status: 'approved',
        revisionKind: liveRecipe ? 'recipe' : 'content',
        operation: 'edit',
        riskLevel: 'low',
        changeSource: 'admin_override',
        isMinor: false,
        isPatrolled: true,
        patrolledBy: actor.id,
        patrolledAt: new Date(),
      });
      const savedRev = await manager.save(created);
      await manager.update(
        CharacterPageEntity,
        { characterId },
        {
          title: liveContent.name,
          currentRevisionId: savedRev.id,
          latestRevisionId: savedRev.id,
        },
      );
      await manager.increment(
        CharacterPageEntity,
        { characterId },
        'editCount',
        1,
      );
      return savedRev;
    });
    return {
      revisionId: saved.id,
      status: saved.status,
      isPatrolled: saved.isPatrolled,
      appliedToCharacter: false, // already on character; this just records history
    };
  }

  async applyApprovedRevision(
    revision: CharacterRevisionEntity,
    actorId: string,
  ): Promise<void> {
    // 这个方法所有成功分支都会改 page/character/blueprint。统一在入口失效一次
    // listPages 缓存，比在 4 个 pageRepo.update 后各加一行更省事；提前失效只代价
    // 一次 cache miss，无功能副作用。
    this.pages.invalidateListPagesCache();
    const latestRevisionId = await this.resolveLatestRevisionId(revision);
    if (revision.operation === 'create') {
      if (!revision.recipeSnapshot) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '创建角色缺少 recipeSnapshot' },
        legacyMessage: '创建角色缺少 recipeSnapshot',
      });
      }
      const existing = await this.characterRepo.findOne({
        where: { id: revision.characterId },
      });
      if (!existing) {
        await this.blueprints.createCharacterFromRecipe({
          id: revision.characterId,
          sourceType: 'wiki_contributed',
          deletionPolicy: 'archive_allowed',
          recipe: revision.recipeSnapshot,
        });
      }
      await this.pageRepo.update(
        { characterId: revision.characterId },
        {
          title: revision.contentSnapshot.name,
          currentRevisionId: revision.id,
          latestRevisionId,
          lifecycleStatus: 'active',
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
        },
      );
      return;
    }

    if (revision.operation === 'soft_delete') {
      await this.pageRepo.update(
        { characterId: revision.characterId },
        {
          currentRevisionId: revision.id,
          latestRevisionId,
          lifecycleStatus: 'deleted',
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: actorId,
        },
      );
      return;
    }

    if (revision.operation === 'restore') {
      await this.pageRepo.update(
        { characterId: revision.characterId },
        {
          currentRevisionId: revision.id,
          latestRevisionId,
          lifecycleStatus: 'active',
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
        },
      );
      return;
    }

    if (revision.recipeSnapshot) {
      await this.blueprints.updateDraft(revision.characterId, revision.recipeSnapshot);
      await this.blueprints.publish(
        revision.characterId,
        `Wiki ${revision.operation}: ${revision.editSummary}`,
      );
      await this.pageRepo.update(
        { characterId: revision.characterId },
        {
          title: revision.contentSnapshot.name,
          currentRevisionId: revision.id,
          latestRevisionId,
          lifecycleStatus: 'active',
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
        },
      );
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.applySnapshotToCharacter(
        manager,
        revision.characterId,
        revision.contentSnapshot,
      );
      await manager.update(
        CharacterPageEntity,
        { characterId: revision.characterId },
        {
          title: revision.contentSnapshot.name,
          currentRevisionId: revision.id,
          latestRevisionId,
          lifecycleStatus: 'active',
        },
      );
    });
  }

  private async submitRecipeEdit(
    characterId: string,
    user: AuthenticatedUser,
    input: SubmitEditInput,
  ): Promise<SubmitEditResult> {
    await this.blocks.assertCanEdit(user, characterId);
    const page = await this.pages.getOrInitPage(characterId);
    if (page.isDeleted) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '该词条已被删除，无法编辑' },
        legacyMessage: '该词条已被删除，无法编辑',
      });
    }
    this.assertProtection(page.protectionLevel, user.role);
    const character = await this.characterRepo.findOne({ where: { id: characterId } });
    if (!character) throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '角色不存在' },
        legacyMessage: '角色不存在',
      });
    const currentRevision = page.currentRevisionId
      ? await this.revisionRepo.findOne({ where: { id: page.currentRevisionId } })
      : null;
    const factorySnapshot = await this.blueprints.getFactorySnapshot(characterId);
    const beforeRecipe =
      currentRevision?.recipeSnapshot ??
      factorySnapshot.blueprint.publishedRecipe ??
      factorySnapshot.blueprint.draftRecipe;
    let afterRecipe = normalizeWikiRecipe(input.recipeSnapshot ?? {}, beforeRecipe);
    const beforeContent =
      currentRevision?.contentSnapshot ??
      snapshotFromCharacter(character as unknown as Record<string, unknown>);
    let changed = filterPhantomBlankPaths(
      beforeRecipe,
      afterRecipe,
      diffPaths(beforeRecipe, afterRecipe),
    );
    let changeSource = 'edit';

    if (
      input.baseRevisionId &&
      page.currentRevisionId &&
      input.baseRevisionId !== page.currentRevisionId
    ) {
      const baseRev = await this.revisionRepo.findOne({
        where: { id: input.baseRevisionId },
      });
      if (!baseRev?.recipeSnapshot) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '基线版本无效' },
        legacyMessage: '基线版本无效',
      });
      }
      const submittedRecipe = normalizeWikiRecipe(
        input.recipeSnapshot ?? {},
        baseRev.recipeSnapshot,
      );
      const userChanged = filterPhantomBlankPaths(
        baseRev.recipeSnapshot,
        submittedRecipe,
        diffPaths(baseRev.recipeSnapshot, submittedRecipe),
      );
      const concurrentChanged = filterPhantomBlankPaths(
        baseRev.recipeSnapshot,
        beforeRecipe,
        diffPaths(baseRev.recipeSnapshot, beforeRecipe),
      );
      const overlap = userChanged.filter((path) =>
        hasPathOverlap([path], concurrentChanged),
      );
      if (overlap.length > 0) {
        throw new AppError('WIKI_REVISION_CONFLICT', {
          status: HttpStatus.CONFLICT,
          params: {
            conflictingFields: overlap.join(','),
            currentRevisionId: page.currentRevisionId ?? '',
          },
          legacyMessage: '存在编辑冲突，请基于最新版本重新提交',
        });
      }
      afterRecipe = mergeValueByPaths(beforeRecipe, submittedRecipe, userChanged);
      changed = filterPhantomBlankPaths(
        beforeRecipe,
        afterRecipe,
        diffPaths(beforeRecipe, afterRecipe),
      );
      changeSource = 'merge';
    }

    if (changed.length === 0) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: '未检测到变更' },
        legacyMessage: '未检测到变更',
      });
    }
    await this.fieldProtection.assertCanEditPaths(user, characterId, changed);
    const afterContent = snapshotFromRecipe(afterRecipe);
    // recipe 路径同样要拒"视觉为空"的 identity.name——前面 normalizeWikiRecipe
    // 在 source.identity.name='' 时**不会**回退到 base.identity.name（str()
    // 只有非字符串才走 fallback），所以恶意客户端能把已发布角色 name 清空。
    assertWikiNameNotVisuallyEmpty(afterContent.name);

    const riskReport = isHighRiskRecipeChange(changed);
    let riskLevel = riskReport.highRisk ? 'high' : 'low';
    this.assertEditSummary({
      operation: 'edit',
      riskLevel,
      revisionKind: 'recipe',
      summary: input.editSummary,
    });
    const abuseRecipe = await this.filters.check({
      user,
      characterId,
      contentSnapshot: afterContent,
      recipeSnapshot: afterRecipe,
      beforeContent,
      beforeRecipe,
      operation: 'edit',
    });
    if (abuseRecipe.action === 'tag_high_risk') {
      riskLevel = 'high';
    }
    const autoApprove =
      abuseRecipe.action === 'tag_high_risk'
        ? false
        : rankOf(user.role) >= rankOf('patroller') ||
          (riskLevel === 'low' && rankOf(user.role) >= rankOf('autoconfirmed'));
    const revision = await this.dataSource.transaction(async (manager) => {
      const nextVersion =
        (await this.getLastVersion(characterId, manager)) + 1;
      const recipeDiff: Record<string, unknown> = { changed };
      if (riskReport.highRisk) {
        recipeDiff.highRiskReasons = riskReport.reasons;
      }
      if (abuseRecipe.hits.length > 0) {
        recipeDiff.abuseFilterHits = abuseRecipe.hits.map((h) => h.filterName);
      }
      const created = manager.create(CharacterRevisionEntity, {
        characterId,
        version: nextVersion,
        parentRevisionId: page.currentRevisionId ?? null,
        baseRevisionId: input.baseRevisionId ?? page.currentRevisionId ?? null,
        contentSnapshot: afterContent,
        recipeSnapshot: afterRecipe,
        diffFromParent: recipeDiff,
        editorUserId: user.id,
        editorRoleAtTime: user.role,
        editSummary: (typeof input.editSummary === 'string' ? input.editSummary : '').slice(0, 500),
        status: autoApprove ? 'approved' : 'pending',
        revisionKind: 'recipe',
        operation: 'edit',
        riskLevel,
        changeSource,
        isMinor: this.resolveMinorEdit(input.isMinor, user.role),
        isPatrolled: false,
      });
      const saved = await manager.save(created);
      if (!autoApprove) {
        await manager.save(
          manager.create(EditSubmissionEntity, {
            revisionId: saved.id,
            characterId,
            submitterId: user.id,
            operation: 'edit',
            riskLevel,
            decision: null,
            priority: riskLevel === 'high' ? 5 : 0,
          }),
        );
      }
      await manager.update(
        CharacterPageEntity,
        { characterId },
        {
          title: afterContent.name,
          // autoApprove 时把 currentRevisionId 立刻在事务内切到新 revision，
          // 跟 applyApprovedRevision 里 pageRepo.update 形成幂等（重复写同一个 id）。
          // 这样事务一旦提交，view 端立刻看到正确 stable 版本。
          ...(autoApprove ? { currentRevisionId: saved.id } : {}),
          latestRevisionId: saved.id,
        },
      );
      await manager.increment(
        CharacterPageEntity,
        { characterId },
        'editCount',
        1,
      );
      await this.bumpProfile(manager, user.id, autoApprove);
      return saved;
    });

    if (autoApprove) {
      try {
        await this.applyApprovedRevision(revision, user.id);
        void this.roles.checkPromotion(user.id).catch(() => undefined);
      } catch (err) {
        await this.rollbackAutoApproval({
          revisionId: revision.id,
          characterId,
          submitterId: user.id,
          operation: 'edit',
          riskLevel,
          priority: riskLevel === 'high' ? 5 : 0,
          previousPage: {
            currentRevisionId: page.currentRevisionId ?? null,
            latestRevisionId: page.latestRevisionId ?? null,
            lifecycleStatus: page.lifecycleStatus,
            title: page.title ?? null,
            isDeleted: page.isDeleted,
            deletedAt: page.deletedAt ?? null,
            deletedBy: page.deletedBy ?? null,
          },
        }).catch(() => undefined);
        throw err;
      }
    }

    return {
      revisionId: revision.id,
      status: revision.status,
      isPatrolled: revision.isPatrolled,
      appliedToCharacter: autoApprove,
      warnings:
        abuseRecipe.warnings.length > 0 ? abuseRecipe.warnings : undefined,
    };
  }

  async applySnapshotToCharacter(
    manager: EntityManager,
    characterId: string,
    snapshot: WikiContentSnapshot,
  ): Promise<void> {
    const patch: Partial<CharacterEntity> = {};
    for (const key of WIKI_CONTENT_FIELDS) {
      const value = snapshot[key];
      if (value !== undefined) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }
    await manager.update(CharacterEntity, { id: characterId }, patch);
  }

  private async getLastVersion(
    characterId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(CharacterRevisionEntity)
      : this.revisionRepo;
    const lastVersion = await repo
      .createQueryBuilder('r')
      .where('r.characterId = :id', { id: characterId })
      .select('MAX(r.version)', 'max')
      .getRawOne<{ max: number | null }>();
    return lastVersion?.max ?? 0;
  }

  private async resolveLatestRevisionId(
    revision: CharacterRevisionEntity,
  ): Promise<string> {
    const page = await this.pageRepo.findOne({
      where: { characterId: revision.characterId },
    });
    if (!page?.latestRevisionId || page.latestRevisionId === revision.id) {
      return revision.id;
    }
    const latest = await this.revisionRepo.findOne({
      where: { id: page.latestRevisionId },
    });
    return latest && latest.version > revision.version
      ? page.latestRevisionId
      : revision.id;
  }

  /**
   * autoApprove 走 "事务内写 revision=approved + page.currentRevisionId 切到新 →
   * 事务外调 applyApprovedRevision（写 character / publish blueprint）" 两段式。
   * 第二段失败时调此函数补偿：
   *   1. revision 状态降回 pending；
   *   2. page 回到 autoApprove 前的快照（若是 createPage，则保持页存在但 lifecycle=pending_create）；
   *   3. 作者 profile.approvedEditCount -= 1（编辑总数 editCount 保留——动作发生过）；
   *   4. 若没 submission 行就补一条，让用户的修改进入审核队列而不是消失。
   *
   * 与 wiki-review.service.ts:rollbackRuntimeApproval 同思路，只是触发场景不同
   *（这里是首次提交者直接 autoApprove，那个是审核员二次审批）。
   */
  private async rollbackAutoApproval(input: {
    revisionId: string;
    characterId: string;
    submitterId: string;
    operation: string;
    riskLevel: string;
    priority: number;
    previousPage: {
      currentRevisionId: string | null;
      latestRevisionId: string | null;
      lifecycleStatus: string;
      title: string | null;
      isDeleted: boolean;
      deletedAt: Date | null;
      deletedBy: string | null;
    };
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CharacterRevisionEntity,
        { id: input.revisionId },
        {
          status: 'pending',
          isPatrolled: false,
          patrolledBy: null,
          patrolledAt: null,
        },
      );
      await manager.update(
        CharacterPageEntity,
        { characterId: input.characterId },
        {
          currentRevisionId: input.previousPage.currentRevisionId,
          latestRevisionId:
            input.previousPage.latestRevisionId ?? input.revisionId,
          lifecycleStatus: input.previousPage.lifecycleStatus,
          title: input.previousPage.title,
          isDeleted: input.previousPage.isDeleted,
          deletedAt: input.previousPage.deletedAt,
          deletedBy: input.previousPage.deletedBy,
        },
      );
      const existingSubmission = await manager.findOne(EditSubmissionEntity, {
        where: { revisionId: input.revisionId },
      });
      if (!existingSubmission) {
        await manager.save(
          manager.create(EditSubmissionEntity, {
            revisionId: input.revisionId,
            characterId: input.characterId,
            submitterId: input.submitterId,
            operation: input.operation,
            riskLevel: input.riskLevel,
            priority: input.priority,
            decision: null,
          }),
        );
      }
      const profile = await manager.findOne(UserWikiProfileEntity, {
        where: { userId: input.submitterId },
      });
      if (profile && profile.approvedEditCount > 0) {
        profile.approvedEditCount -= 1;
        await manager.save(profile);
      }
    });
  }

  private async bumpProfile(
    manager: EntityManager,
    userId: string,
    approved: boolean,
  ): Promise<void> {
    const profile =
      (await manager.findOne(UserWikiProfileEntity, {
        where: { userId },
      })) ??
      manager.create(UserWikiProfileEntity, {
        userId,
        editCount: 0,
        approvedEditCount: 0,
        revertedCount: 0,
        patrolledCount: 0,
      });
    profile.editCount += 1;
    profile.lastEditAt = new Date();
    if (approved) profile.approvedEditCount += 1;
    await manager.save(profile);
  }

  private resolveNewCharacterId(input?: string | null): string {
    const normalized = input
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    if (normalized) {
      return normalized.startsWith('char_') || normalized.startsWith('char-')
        ? normalized
        : `char_wiki_${normalized}`;
    }
    return `char_wiki_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }

  private assertEditSummary(input: {
    operation: string;
    riskLevel: string;
    revisionKind: string;
    summary: string | null | undefined;
  }): void {
    assertWikiEditSummary(input);
  }

  private resolveMinorEdit(input: boolean | undefined, role: string): boolean {
    return resolveMinorEditPure(
      input,
      rankOf(role),
      WIKI_ROLE_RANK.autoconfirmed,
    );
  }

  private assertProtection(level: string, role: string): void {
    if (level === 'full' && rankOf(role) < rankOf('admin')) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '此页面被完全保护，仅管理员可编辑' },
        legacyMessage: '此页面被完全保护，仅管理员可编辑',
      });
    }
    if (level === 'semi' && rankOf(role) < rankOf('autoconfirmed')) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '此页面被半保护，仅自动确认用户及以上可编辑' },
        legacyMessage: '此页面被半保护，仅自动确认用户及以上可编辑',
      });
    }
  }
}

/**
 * 从 createPage seed payload 里"挖"出用户实际提交的 name —— 不能交给
 * normalizeWikiRecipe / createDefaultWikiRecipe 之后再判，那一层会把缺失的 name
 * 兜底成 '未命名角色'，使空 body 创建一个占位词条。两个可能位置：
 *   1. seedInput.name（即 contentSnapshot 顶层）
 *   2. seedInput.identity.name（即 recipeSnapshot 嵌套）
 */
function extractSeedName(seedInput: Record<string, unknown>): string {
  if (typeof seedInput.name === 'string') return seedInput.name;
  const identity = (seedInput as { identity?: unknown }).identity;
  if (
    identity &&
    typeof identity === 'object' &&
    typeof (identity as { name?: unknown }).name === 'string'
  ) {
    return (identity as { name: string }).name;
  }
  return '';
}
// i18n-ignore-end
