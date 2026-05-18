import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppError } from '../../../common/app-error.exception';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { CharacterRevisionEntity } from '../entities/character-revision.entity';
import { WikiTalkThreadEntity } from '../entities/wiki-talk-thread.entity';
import { WikiWatchlistEntity } from '../entities/wiki-watchlist.entity';

export type WatchlistEntryView = {
  characterId: string;
  // page.title 不为空就是 page.title；否则回落到 characterId。
  // UI 历来只渲染 characterId（一串 char_wiki_… UUID），用户根本认不出哪条；2026-05-15 走查时
  // 把 title 加回来，watchlist/feed 都按 title || characterId 显示。
  title: string;
  notifyOnEdit: boolean;
  notifyOnTalk: boolean;
  addedAt: Date;
  isDeleted: boolean;
  currentRevisionId: string | null;
  protectionLevel: string;
};

export type WatchlistFeedItem =
  | { kind: 'revision'; characterId: string; title: string; revision: CharacterRevisionEntity }
  | { kind: 'talk'; characterId: string; title: string; thread: WikiTalkThreadEntity };

@Injectable()
export class WikiWatchlistService {
  constructor(
    @InjectRepository(WikiWatchlistEntity)
    private readonly entryRepo: Repository<WikiWatchlistEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
    @InjectRepository(WikiTalkThreadEntity)
    private readonly threadRepo: Repository<WikiTalkThreadEntity>,
  ) {}

  async list(userId: string): Promise<WatchlistEntryView[]> {
    const entries = await this.entryRepo.find({
      where: { userId },
      order: { addedAt: 'DESC' },
    });
    if (entries.length === 0) return [];
    const pages = await this.pageRepo.find({
      where: { characterId: In(entries.map((e) => e.characterId)) },
    });
    const pageMap = new Map(pages.map((p) => [p.characterId, p]));
    return entries.map((e) => {
      const page = pageMap.get(e.characterId);
      return {
        characterId: e.characterId,
        title: page?.title || e.characterId,
        notifyOnEdit: e.notifyOnEdit,
        notifyOnTalk: e.notifyOnTalk,
        addedAt: e.addedAt,
        isDeleted: page?.isDeleted ?? false,
        currentRevisionId: page?.currentRevisionId ?? null,
        protectionLevel: page?.protectionLevel ?? 'none',
      };
    });
  }

  async add(
    userId: string,
    characterId: string,
    flags: { notifyOnEdit?: boolean; notifyOnTalk?: boolean } = {},
  ): Promise<WikiWatchlistEntity> {
    // 词条必须存在再允许加 watch；否则任何字符串都能被加进表里，
    // /watchlist 页面会渲染一堆点不开的脏行（2026-05-16 走查发现）。
    const page = await this.pageRepo.findOne({ where: { characterId } });
    if (!page) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `角色 ${characterId} 不存在`,
      });
    }
    const existing = await this.entryRepo.findOne({
      where: { userId, characterId },
    });
    if (existing) {
      if (
        typeof flags.notifyOnEdit === 'boolean' ||
        typeof flags.notifyOnTalk === 'boolean'
      ) {
        if (typeof flags.notifyOnEdit === 'boolean')
          existing.notifyOnEdit = flags.notifyOnEdit;
        if (typeof flags.notifyOnTalk === 'boolean')
          existing.notifyOnTalk = flags.notifyOnTalk;
        return this.entryRepo.save(existing);
      }
      return existing;
    }
    return this.entryRepo.save(
      this.entryRepo.create({
        userId,
        characterId,
        notifyOnEdit: flags.notifyOnEdit ?? true,
        notifyOnTalk: flags.notifyOnTalk ?? true,
      }),
    );
  }

  async remove(userId: string, characterId: string): Promise<void> {
    await this.entryRepo.delete({ userId, characterId });
  }

  async isWatching(userId: string, characterId: string): Promise<boolean> {
    const c = await this.entryRepo.count({
      where: { userId, characterId },
    });
    return c > 0;
  }

  async feed(
    userId: string,
    sinceISO?: string,
  ): Promise<WatchlistFeedItem[]> {
    const entries = await this.entryRepo.find({ where: { userId } });
    if (entries.length === 0) return [];
    const editIds = entries
      .filter((e) => e.notifyOnEdit)
      .map((e) => e.characterId);
    const talkIds = entries
      .filter((e) => e.notifyOnTalk)
      .map((e) => e.characterId);
    const since = sinceISO ? new Date(sinceISO) : null;

    // 一次性把所有相关 page 的 title 取出来，避免每个 feed item 再查一次。
    // UI 之前只有 characterId 可显示，feed 列表全是 char_wiki_… UUID。
    const allIds = Array.from(new Set([...editIds, ...talkIds]));
    const pages = allIds.length > 0
      ? await this.pageRepo.find({ where: { characterId: In(allIds) } })
      : [];
    const titleMap = new Map(pages.map((p) => [p.characterId, p.title || p.characterId]));
    const titleOf = (id: string) => titleMap.get(id) ?? id;

    const items: WatchlistFeedItem[] = [];
    if (editIds.length > 0) {
      const qb = this.revisionRepo
        .createQueryBuilder('r')
        .where('r.characterId IN (:...ids)', { ids: editIds })
        .andWhere('r.status IN (:...statuses)', {
          statuses: ['approved', 'pending', 'reverted'],
        })
        .orderBy('r.createdAt', 'DESC')
        .take(100);
      if (since) qb.andWhere('r.createdAt > :since', { since });
      const revisions = await qb.getMany();
      for (const rev of revisions) {
        items.push({
          kind: 'revision',
          characterId: rev.characterId,
          title: rev.contentSnapshot?.name || titleOf(rev.characterId),
          revision: rev,
        });
      }
    }
    if (talkIds.length > 0) {
      const qb = this.threadRepo
        .createQueryBuilder('t')
        .where('t.characterId IN (:...ids)', { ids: talkIds })
        .orderBy('t.lastReplyAt', 'DESC')
        .take(50);
      if (since) qb.andWhere('t.lastReplyAt > :since', { since });
      const threads = await qb.getMany();
      for (const thread of threads) {
        items.push({
          kind: 'talk',
          characterId: thread.characterId,
          title: titleOf(thread.characterId),
          thread,
        });
      }
    }
    items.sort((a, b) => {
      const aTime =
        a.kind === 'revision'
          ? a.revision.createdAt.getTime()
          : (a.thread.lastReplyAt ?? a.thread.createdAt).getTime();
      const bTime =
        b.kind === 'revision'
          ? b.revision.createdAt.getTime()
          : (b.thread.lastReplyAt ?? b.thread.createdAt).getTime();
      return bTime - aTime;
    });
    return items.slice(0, 100);
  }
}
