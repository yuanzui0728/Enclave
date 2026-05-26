// i18n-ignore-start: backend service, errors are domain codes (no user-facing zh strings).
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import type {
  WikiGameArtifact,
  WikiGameRevisionSummary,
  WikiGameSummary,
  WikiGameView,
} from '../wiki-game.types';
import { GamePageEntity } from '../entities/game-page.entity';
import { GameRevisionEntity } from '../entities/game-revision.entity';
import { WikiGamePublishSyncService } from './wiki-game-publish-sync.service';
import {
  findHardExternalRefs,
  MAX_PUBLISH_HTML_BYTES,
} from './wiki-game-html-safety';

@Injectable()
export class WikiGameService {
  constructor(
    @InjectRepository(GamePageEntity)
    private readonly pages: Repository<GamePageEntity>,
    @InjectRepository(GameRevisionEntity)
    private readonly revisions: Repository<GameRevisionEntity>,
    private readonly publishSync: WikiGamePublishSyncService,
  ) {}

  // ───────── internal: 给 AI 服务 / 复刻用 ─────────

  /** 建一个空游戏页壳，返回 gameId（AI 创建流程同步调，拿到 id 后入队生成 job）。 */
  async createShell(
    ownerUserId: string,
    opts: { title?: string; authorDisplayName?: string },
  ): Promise<{ gameId: string }> {
    const gameId = `game_${randomUUID()}`;
    const page = this.pages.create({
      gameId,
      ownerUserId,
      authorDisplayName: opts.authorDisplayName ?? null,
      title: opts.title?.trim() || null,
      visibility: 'private',
      isDeleted: false,
    });
    await this.pages.save(page);
    return { gameId };
  }

  /** 取某游戏当前（=最新）revision 的完整产物。 */
  async loadLatestArtifact(gameId: string): Promise<WikiGameArtifact | null> {
    const page = await this.pages.findOne({ where: { gameId } });
    const revId = page?.currentRevisionId ?? page?.latestRevisionId;
    if (!revId) return null;
    const rev = await this.revisions.findOne({ where: { id: revId } });
    return rev?.artifact ?? null;
  }

  /** 追加一条 revision（AI 生成 / 迭代 / 手动 / 复刻 都走这里），更新头指针。 */
  async appendRevision(input: {
    gameId: string;
    artifact: WikiGameArtifact;
    instruction: string;
    changeSource: WikiGameRevisionSummary['changeSource'];
    editorUserId: string;
  }): Promise<{ id: string; version: number }> {
    const max = await this.revisions
      .createQueryBuilder('r')
      .select('MAX(r.version)', 'max')
      .where('r.gameId = :gameId', { gameId: input.gameId })
      .getRawOne<{ max: number | null }>();
    const version = (max?.max ?? 0) + 1;

    const page = await this.pages.findOne({ where: { gameId: input.gameId } });
    const rev = this.revisions.create({
      gameId: input.gameId,
      version,
      parentRevisionId: page?.latestRevisionId ?? null,
      artifact: input.artifact,
      instruction: input.instruction ?? '',
      changeSource: input.changeSource,
      editorUserId: input.editorUserId,
    });
    const saved = await this.revisions.save(rev);

    // 冗余 spec 摘要到页，列表卡免加载 html。标题没填过才回填。
    const spec = input.artifact.spec;
    await this.pages.update(
      { gameId: input.gameId },
      {
        currentRevisionId: saved.id,
        latestRevisionId: saved.id,
        pitch: spec.pitch,
        genre: spec.genre,
        ...(page && !page.title ? { title: spec.title } : {}),
      },
    );
    return { id: saved.id, version };
  }

  // ───────── public: controller / 前端 ─────────

  async listMyGames(ownerUserId: string): Promise<WikiGameSummary[]> {
    const pages = await this.pages.find({
      where: { ownerUserId, isDeleted: false },
      order: { updatedAt: 'DESC' },
    });
    return this.toSummaries(pages);
  }

  async listPublicGames(): Promise<WikiGameSummary[]> {
    const pages = await this.pages.find({
      where: { visibility: 'public', isDeleted: false },
      order: { updatedAt: 'DESC' },
      take: 200,
    });
    return this.toSummaries(pages);
  }

  async getView(
    gameId: string,
    viewerUserId: string | null,
  ): Promise<WikiGameView> {
    const page = await this.requireVisiblePage(gameId, viewerUserId);
    const revId = page.currentRevisionId ?? page.latestRevisionId;
    if (!revId) throw new NotFoundException('游戏尚未生成内容');
    const rev = await this.revisions.findOne({ where: { id: revId } });
    if (!rev) throw new NotFoundException('游戏内容缺失');
    return {
      ...this.toSummary(page, rev.version),
      version: rev.version,
      revisionId: rev.id,
      artifact: rev.artifact,
      isOwner: page.ownerUserId === viewerUserId,
    };
  }

  async getHistory(
    ownerUserId: string,
    gameId: string,
  ): Promise<WikiGameRevisionSummary[]> {
    await this.requireOwnedPage(ownerUserId, gameId);
    // 显式排除 artifact 大字段，列历史只拉轻量列。
    const rows = await this.revisions
      .createQueryBuilder('r')
      .select([
        'r.id AS id',
        'r.version AS version',
        'r.instruction AS instruction',
        'r.changeSource AS changeSource',
        'r.createdAt AS createdAt',
      ])
      .where('r.gameId = :gameId', { gameId })
      .orderBy('r.version', 'DESC')
      .getRawMany<{
        id: string;
        version: number;
        instruction: string;
        changeSource: WikiGameRevisionSummary['changeSource'];
        createdAt: string | Date;
      }>();
    return rows.map((r) => ({
      revisionId: r.id,
      version: Number(r.version),
      instruction: r.instruction ?? '',
      changeSource: r.changeSource,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }

  async setVisibility(
    ownerUserId: string,
    gameId: string,
    visibility: 'private' | 'public',
  ): Promise<{ visibility: string; boardSynced: boolean }> {
    const page = await this.requireOwnedPage(ownerUserId, gameId);
    await this.pages.update({ gameId }, { visibility });
    if (visibility !== 'public') {
      return { visibility, boardSynced: false };
    }
    // 公开 = 同时上架隐界游戏板块：上推最新产物到 cloud-api 全局板块。
    const artifact = await this.loadLatestArtifact(gameId);
    if (!artifact) return { visibility, boardSynced: false };

    // 发布前安全闸：硬拒外部引用（破沙箱零网络保证 + 滥用载体）+ 体积上限。
    const violations = findHardExternalRefs(artifact.html);
    if (violations.length > 0) {
      // 拒绝发布：把可见性回滚为私有，抛 400 让用户先去掉外链。
      await this.pages.update({ gameId }, { visibility: 'private' });
      throw new BadRequestException(
        `游戏含外部引用（${violations.join('、')}），无法发布到游戏板块。请改为纯本地实现（资源内联、用 YinjieGame.askCharacter 调 AI）。`,
      );
    }
    if (Buffer.byteLength(artifact.html, 'utf8') > MAX_PUBLISH_HTML_BYTES) {
      await this.pages.update({ gameId }, { visibility: 'private' });
      throw new BadRequestException('游戏体积过大，无法发布，请精简后重试。');
    }

    const spec = artifact.spec;
    const synced = await this.publishSync.push(
      {
        gameId,
        name: spec.title,
        slogan: spec.pitch,
        description: spec.rules,
        category: 'featured',
        tone: 'sunset',
        tags: spec.genre ? [spec.genre] : [],
        authorWikiUserId: ownerUserId,
        authorDisplayName: page.authorDisplayName ?? ownerUserId,
        sourceWikiGameId: gameId,
        clonedFromGameId: page.forkedFromGameId ?? null,
      },
      artifact,
    );
    await this.pages.update(
      { gameId },
      {
        publishedCatalogGameId: gameId,
        publishedVersion: (page.publishedVersion ?? 0) + 1,
        lastPublishedAt: new Date(),
        syncState: synced ? 'synced' : 'pending',
      },
    );
    return { visibility, boardSynced: synced };
  }

  async saveManualRevision(
    ownerUserId: string,
    gameId: string,
    artifact: WikiGameArtifact,
  ): Promise<{ id: string; version: number }> {
    await this.requireOwnedPage(ownerUserId, gameId);
    return this.appendRevision({
      gameId,
      artifact,
      instruction: '',
      changeSource: 'manual_edit',
      editorUserId: ownerUserId,
    });
  }

  async deleteGame(ownerUserId: string, gameId: string): Promise<void> {
    await this.requireOwnedPage(ownerUserId, gameId);
    await this.pages.update(
      { gameId },
      { isDeleted: true, deletedAt: new Date() },
    );
  }

  /** 一键复刻：深拷贝源游戏当前 revision 的产物到当前用户的新私有游戏。 */
  async clone(
    ownerUserId: string,
    sourceGameId: string,
    authorDisplayName: string,
  ): Promise<{ gameId: string }> {
    const source = await this.requireVisiblePage(sourceGameId, ownerUserId);
    const revId = source.currentRevisionId ?? source.latestRevisionId;
    if (!revId) throw new NotFoundException('源游戏尚无可复刻内容');
    const srcRev = await this.revisions.findOne({ where: { id: revId } });
    if (!srcRev) throw new NotFoundException('源游戏内容缺失');

    // 深拷贝，避免共享引用（同 cloneRecipe 语义）。
    const artifact: WikiGameArtifact = JSON.parse(JSON.stringify(srcRev.artifact));
    artifact.spec.title = `${artifact.spec.title}（复刻）`;

    const gameId = `game_${randomUUID()}`;
    const page = this.pages.create({
      gameId,
      ownerUserId,
      authorDisplayName,
      title: artifact.spec.title,
      visibility: 'private',
      forkedFromGameId: sourceGameId,
      forkedFromRevisionId: srcRev.id,
      isDeleted: false,
    });
    await this.pages.save(page);
    await this.appendRevision({
      gameId,
      artifact,
      instruction: '',
      changeSource: 'clone',
      editorUserId: ownerUserId,
    });
    return { gameId };
  }

  // ───────── helpers ─────────

  /** 拿到「拥有权已校验」的页（不存在 / 已删 / 非本人 → 抛）。 */
  async requireOwnedPage(
    ownerUserId: string,
    gameId: string,
  ): Promise<GamePageEntity> {
    const page = await this.pages.findOne({ where: { gameId } });
    if (!page || page.isDeleted) throw new NotFoundException('游戏不存在');
    if (page.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('无权操作他人的游戏');
    }
    return page;
  }

  /** 拿到「可见性已校验」的页：私有游戏仅本人可见，否则 NotFound（不泄露存在性）。 */
  private async requireVisiblePage(
    gameId: string,
    viewerUserId: string | null,
  ): Promise<GamePageEntity> {
    const page = await this.pages.findOne({ where: { gameId } });
    if (!page || page.isDeleted) throw new NotFoundException('游戏不存在');
    if (page.visibility !== 'public' && page.ownerUserId !== viewerUserId) {
      throw new NotFoundException('游戏不存在');
    }
    return page;
  }

  private async toSummaries(
    pages: GamePageEntity[],
  ): Promise<WikiGameSummary[]> {
    if (pages.length === 0) return [];
    // 批量取各页当前 revision 的轻量信息（version + spec），不拉 html。
    const revIds = pages
      .map((p) => p.currentRevisionId ?? p.latestRevisionId)
      .filter((x): x is string => !!x);
    const versionByRev = new Map<string, number>();
    if (revIds.length > 0) {
      const rows = await this.revisions
        .createQueryBuilder('r')
        .select(['r.id AS id', 'r.version AS version'])
        .where('r.id IN (:...ids)', { ids: revIds })
        .getRawMany<{ id: string; version: number }>();
      for (const r of rows) versionByRev.set(r.id, Number(r.version));
    }
    return pages.map((p) => {
      const revId = p.currentRevisionId ?? p.latestRevisionId;
      const version = revId ? (versionByRev.get(revId) ?? 0) : 0;
      return this.toSummary(p, version);
    });
  }

  private toSummary(page: GamePageEntity, latestVersion: number): WikiGameSummary {
    return {
      gameId: page.gameId,
      title: page.title ?? '未命名游戏',
      pitch: page.pitch ?? '',
      genre: page.genre ?? '',
      visibility: page.visibility === 'public' ? 'public' : 'private',
      ownerUserId: page.ownerUserId,
      authorDisplayName: page.authorDisplayName ?? null,
      forkedFromGameId: page.forkedFromGameId ?? null,
      publishedCatalogGameId: page.publishedCatalogGameId ?? null,
      publishedVersion: page.publishedVersion ?? null,
      lastPublishedAt: page.lastPublishedAt
        ? page.lastPublishedAt.toISOString()
        : null,
      latestVersion,
      updatedAt: page.updatedAt.toISOString(),
      createdAt: page.createdAt.toISOString(),
    };
  }
}
// i18n-ignore-end
