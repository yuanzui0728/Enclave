// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { WikiTalkPostEntity } from '../entities/wiki-talk-post.entity';
import { WikiTalkThreadEntity } from '../entities/wiki-talk-thread.entity';
import { rankOf } from '../guards/wiki-role.guard';
import { WikiBlockService } from './wiki-block.service';

// Body 是 SQLite TEXT，没有 DB 层长度限制 —— 不挡的话用户能 POST 1MB+ 的
// post 撑爆讨论页/页面 hydration 体积。Wiki MediaWiki 同类阈值在 ~64K，这里取
// 10K（约 5000 中文字 / 10000 英文字），常规讨论 + 引用差不多够用。Title
// 已经在下面挡了 200，body 单独定。
const MAX_TALK_BODY_LENGTH = 10000;

@Injectable()
export class WikiTalkService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(WikiTalkThreadEntity)
    private readonly threadRepo: Repository<WikiTalkThreadEntity>,
    @InjectRepository(WikiTalkPostEntity)
    private readonly postRepo: Repository<WikiTalkPostEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    private readonly blocks: WikiBlockService,
  ) {}

  async listThreads(characterId: string): Promise<WikiTalkThreadEntity[]> {
    return this.threadRepo.find({
      where: { characterId },
      order: { lastReplyAt: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
  }

  async getThreadOrThrow(threadId: string): Promise<WikiTalkThreadEntity> {
    const t = await this.threadRepo.findOne({ where: { id: threadId } });
    if (!t) throw new AppError('WIKI_TALK_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '讨论串不存在',
      });
    return t;
  }

  async listPosts(threadId: string): Promise<WikiTalkPostEntity[]> {
    return this.postRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
      take: 1000,
    });
  }

  async createThread(
    characterId: string,
    user: AuthenticatedUser,
    input: { title: string; body: string },
  ): Promise<{ thread: WikiTalkThreadEntity; firstPost: WikiTalkPostEntity }> {
    // 词条必须存在再允许开讨论；否则任何字符串都能作为 characterId 开 thread，
    // 列表渲染出无法点击的孤儿 thread（2026-05-16 R2 走查发现，和 wiki_watchlist
    // 同类问题）。
    const page = await this.pageRepo.findOne({ where: { characterId } });
    if (!page) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `角色 ${characterId} 不存在`,
      });
    }
    // 已删除的 page 不允许开新讨论 —— 旧 thread 还能读以保留历史，但
    // 新 thread 让"已删除"卡片底下不停冒新讨论，UX 上很怪。R4 走查发现。
    if (page.isDeleted) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '该词条已被删除，无法开新讨论' },
        legacyMessage: '该词条已被删除，无法开新讨论',
      });
    }
    await this.assertCanTalk(user, characterId);
    // typeof 守：客户端传 {"title":{"a":1}} 时 (x ?? '').trim() 会抛 TypeError → 500。
    const title =
      typeof input.title === 'string' ? input.title.trim() : '';
    const body =
      typeof input.body === 'string' ? input.body.trim() : '';
    if (!title) throw new AppError('WIKI_TALK_INVALID_STATE', {
        params: { detail: '标题不能为空' },
        legacyMessage: '标题不能为空',
      });
    if (!body) throw new AppError('WIKI_TALK_INVALID_STATE', {
        params: { detail: '内容不能为空' },
        legacyMessage: '内容不能为空',
      });
    if (title.length > 200) {
      throw new AppError('WIKI_TALK_INVALID_STATE', {
        params: { detail: '标题最长 200 字' },
        legacyMessage: '标题最长 200 字',
      });
    }
    if (body.length > MAX_TALK_BODY_LENGTH) {
      throw new AppError('WIKI_TALK_INVALID_STATE', {
        params: { detail: `内容最长 ${MAX_TALK_BODY_LENGTH} 字` },
        legacyMessage: `内容最长 ${MAX_TALK_BODY_LENGTH} 字`,
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const thread = manager.create(WikiTalkThreadEntity, {
        characterId,
        title,
        authorId: user.id,
        isLocked: false,
        isResolved: false,
        postCount: 1,
        lastReplyAt: new Date(),
      });
      const savedThread = await manager.save(thread);
      const firstPost = manager.create(WikiTalkPostEntity, {
        threadId: savedThread.id,
        parentPostId: null,
        authorId: user.id,
        body,
      });
      const savedPost = await manager.save(firstPost);
      return { thread: savedThread, firstPost: savedPost };
    });
  }

  async createPost(
    threadId: string,
    user: AuthenticatedUser,
    input: { body: string; parentPostId?: string | null },
  ): Promise<WikiTalkPostEntity> {
    const thread = await this.getThreadOrThrow(threadId);
    if (thread.isLocked) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '讨论串已锁定' },
        legacyMessage: '讨论串已锁定',
      });
    }
    await this.assertCanTalk(user, thread.characterId);
    // typeof 守，避免非字符串 body 触发 (x ?? '').trim() → 500。
    const body =
      typeof input.body === 'string' ? input.body.trim() : '';
    if (!body) throw new AppError('WIKI_TALK_INVALID_STATE', {
        params: { detail: '回复内容不能为空' },
        legacyMessage: '回复内容不能为空',
      });
    if (body.length > MAX_TALK_BODY_LENGTH) {
      throw new AppError('WIKI_TALK_INVALID_STATE', {
        params: { detail: `回复内容最长 ${MAX_TALK_BODY_LENGTH} 字` },
        legacyMessage: `回复内容最长 ${MAX_TALK_BODY_LENGTH} 字`,
      });
    }
    if (input.parentPostId) {
      const parent = await this.postRepo.findOne({
        where: { id: input.parentPostId },
      });
      if (!parent || parent.threadId !== threadId) {
        throw new AppError('WIKI_TALK_INVALID_STATE', {
        params: { detail: 'parentPostId 无效' },
        legacyMessage: 'parentPostId 无效',
      });
      }
    }
    return this.dataSource.transaction(async (manager) => {
      const post = manager.create(WikiTalkPostEntity, {
        threadId,
        parentPostId: input.parentPostId ?? null,
        authorId: user.id,
        body,
      });
      const saved = await manager.save(post);
      await manager.update(
        WikiTalkThreadEntity,
        { id: threadId },
        {
          postCount: thread.postCount + 1,
          lastReplyAt: new Date(),
        },
      );
      return saved;
    });
  }

  async setThreadFlags(
    threadId: string,
    actor: AuthenticatedUser,
    input: { isLocked?: boolean; isResolved?: boolean },
  ): Promise<WikiTalkThreadEntity> {
    if (rankOf(actor.role) < rankOf('patroller')) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '需要巡查员及以上权限' },
        legacyMessage: '需要巡查员及以上权限',
      });
    }
    const thread = await this.getThreadOrThrow(threadId);
    const patch: Partial<WikiTalkThreadEntity> = {};
    if (typeof input.isLocked === 'boolean') patch.isLocked = input.isLocked;
    if (typeof input.isResolved === 'boolean')
      patch.isResolved = input.isResolved;
    if (Object.keys(patch).length === 0) return thread;
    await this.threadRepo.update({ id: threadId }, patch);
    return (await this.threadRepo.findOne({ where: { id: threadId } }))!;
  }

  async deletePost(
    postId: string,
    actor: AuthenticatedUser,
  ): Promise<WikiTalkPostEntity> {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new AppError('WIKI_TALK_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '回复不存在',
      });
    if (post.deletedAt) return post;
    const isOwner = post.authorId === actor.id;
    if (!isOwner && rankOf(actor.role) < rankOf('patroller')) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '只能删除自己的回复（巡查员及以上可删除任意）' },
        legacyMessage: '只能删除自己的回复（巡查员及以上可删除任意）',
      });
    }
    await this.postRepo.update(
      { id: postId },
      { deletedAt: new Date(), deletedBy: actor.id, body: '[已删除]' },
    );
    return (await this.postRepo.findOne({ where: { id: postId } }))!;
  }

  private async assertCanTalk(
    user: AuthenticatedUser,
    characterId: string,
  ): Promise<void> {
    const blocks = await this.blocks.list({ active: true, userId: user.id });
    for (const b of blocks) {
      if (b.scope === 'global') {
        throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: `你已被全站封禁：${b.reason}` },
        legacyMessage: `你已被全站封禁：${b.reason}`,
      });
      }
      if (b.scope === 'talk' && !b.targetCharacterId) {
        throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: `你已被禁言：${b.reason}` },
        legacyMessage: `你已被禁言：${b.reason}`,
      });
      }
      if (
        b.scope === 'page' &&
        b.targetCharacterId === characterId
      ) {
        throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: `你被禁止参与此词条：${b.reason}` },
        legacyMessage: `你被禁止参与此词条：${b.reason}`,
      });
      }
    }
  }
}
// i18n-ignore-end
