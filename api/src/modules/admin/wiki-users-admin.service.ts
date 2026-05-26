import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { UserWikiProfileEntity } from '../wiki/entities/user-wiki-profile.entity';
import { UserPrivateCharacterEntity } from '../wiki/entities/user-private-character.entity';
import {
  WikiPrivateCharacterService,
  type CreatorRewardListResponse,
} from '../wiki/services/wiki-private-character.service';

export type WikiUserListQuery = {
  q?: string;
  page?: number | string;
  pageSize?: number | string;
};

export type WikiUserSummary = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  userType: string;
  createdAt: string;
  roleGrantedAt: string | null;
  privateCharacterCount: number;
  editCount: number;
  approvedEditCount: number;
  revertedCount: number;
  lastEditAt: string | null;
};

export type WikiUserListResponse = {
  items: WikiUserSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type WikiPrivateCharacterDetail = {
  id: string;
  ownerUserId: string;
  name: string;
  avatar: string;
  bio: string;
  personality: string | null;
  relationship: string;
  relationshipType: string;
  expertDomains: string[];
  triggerScenes: string[] | null;
  recipe: unknown | null;
  profile: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type WikiUserPrivateCharacterListResponse = {
  ownerUserId: string;
  username: string;
  items: WikiPrivateCharacterDetail[];
};

// 激励榜单类型 single source of truth 在 WikiPrivateCharacterService，这里只 re-export
// 给 cloud-console 端的 controller 用。
export type {
  CreatorRewardStat,
  CreatorRewardListResponse,
} from '../wiki/services/wiki-private-character.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class WikiUsersAdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserWikiProfileEntity)
    private readonly profileRepo: Repository<UserWikiProfileEntity>,
    private readonly privateCharacters: WikiPrivateCharacterService,
  ) {}

  async listUsers(query: WikiUserListQuery): Promise<WikiUserListResponse> {
    const page = Math.max(1, toInt(query.page, 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, toInt(query.pageSize, DEFAULT_PAGE_SIZE)),
    );
    const q = (query.q ?? '').trim();

    const qb = this.userRepo
      .createQueryBuilder('u')
      // Wiki 用户 tab 只看 wiki_member。system bot（admin_sync / antivandal_bot）
      // 和 world_owner（APP 用户本人占位）混在 users 表里但不是 wiki 注册用户，
      // 留在列表里会让运营误把它们当成"没绑邮箱的注册用户"。
      .where('u.userType = :userType', { userType: 'wiki_member' })
      .orderBy('u.createdAt', 'DESC');
    if (q) {
      // 用户输入里的 % / _ 是 LIKE 的元字符，不转义的话 q="_" 会匹配所有单字符
      // 邮箱、q="%" 直接全表 —— 走参数化绑定能挡 SQL 注入但挡不了这个。
      // 用 '!' 当 ESCAPE 字符：TypeORM 会把 SQL 片段里的反斜杠再 escape 一次，
      // ESCAPE '\\' 实际跑到 SQLite 会变 ESCAPE '\\\\'（两字符）→ "must be a
      // single character"；改成不需要 backslash quoting 的 '!' 就稳了。
      const escaped = q.toLowerCase().replace(/[%_!]/g, '!$&');
      qb.andWhere(
        "(LOWER(u.username) LIKE :pat ESCAPE '!' OR LOWER(u.email) LIKE :pat ESCAPE '!')",
        { pat: `%${escaped}%` },
      );
    }
    const total = await qb.getCount();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const users = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = users.map((u) => u.id);
    const [profiles, charCounts] = await Promise.all([
      ids.length
        ? this.profileRepo.find({ where: { userId: In(ids) } })
        : Promise.resolve([] as UserWikiProfileEntity[]),
      this.privateCharacters.countByOwners(ids),
    ]);
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    const items: WikiUserSummary[] = users.map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        username: u.username,
        email: u.email ?? null,
        role: u.role,
        userType: u.userType,
        createdAt: u.createdAt.toISOString(),
        roleGrantedAt: u.roleGrantedAt ? u.roleGrantedAt.toISOString() : null,
        privateCharacterCount: charCounts.get(u.id) ?? 0,
        editCount: profile?.editCount ?? 0,
        approvedEditCount: profile?.approvedEditCount ?? 0,
        revertedCount: profile?.revertedCount ?? 0,
        lastEditAt: profile?.lastEditAt
          ? profile.lastEditAt.toISOString()
          : null,
      };
    });

    return { items, page, pageSize, total, totalPages };
  }

  async listPrivateCharacters(
    userId: string,
  ): Promise<WikiUserPrivateCharacterListResponse> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const records = await this.privateCharacters.listForOwner(userId);
    return {
      ownerUserId: userId,
      username: user.username,
      items: records.map(toDetail),
    };
  }

  /**
   * 创作者激励榜单（cloud-console 入口；wiki 后台走 /wiki/admin/community/creator-rewards）。
   * 逻辑 single source of truth 在 WikiPrivateCharacterService。
   */
  listCreatorRewardStats(): Promise<CreatorRewardListResponse> {
    return this.privateCharacters.listCreatorRewardStats();
  }

  /** 管理员强制下架某个公开角色（isPublic=false）。返回是否实际改动。 */
  async forceUnpublish(characterId: string): Promise<{ changed: boolean }> {
    const changed = await this.privateCharacters.adminSetPublic(
      characterId,
      false,
    );
    return { changed };
  }
}

function toDetail(
  record: UserPrivateCharacterEntity,
): WikiPrivateCharacterDetail {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    name: record.name,
    avatar: record.avatar ?? '',
    bio: record.bio ?? '',
    personality: record.personality ?? null,
    relationship: record.relationship ?? '',
    relationshipType: record.relationshipType ?? '',
    expertDomains: record.expertDomains ?? [],
    triggerScenes: record.triggerScenes ?? null,
    recipe: record.recipe ?? null,
    profile: record.profile ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

