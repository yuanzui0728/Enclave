import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { FriendshipEntity } from './friendship.entity';

export type FriendRemarkMap = Map<string, string>;

@Injectable()
export class FriendRemarkResolver {
  constructor(
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
  ) {}

  async getOwnerRemarkMap(ownerId: string): Promise<FriendRemarkMap> {
    const rows = await this.friendshipRepo.find({
      where: { ownerId, status: Not(In(['blocked', 'removed'])) },
      select: ['characterId', 'remarkName'],
    });
    const map: FriendRemarkMap = new Map();
    for (const row of rows) {
      const remark = row.remarkName?.trim();
      if (remark) {
        map.set(row.characterId, remark);
      }
    }
    return map;
  }

  // 走查新 R1：朋友圈"我不看 TA 的朋友圈"开关此前在前端能勾、后端能存到
  // friendship.momentsHiddenFromMe，但 moments.service 没有任何路径会读它——
  // canOwnerViewPost 只检查 blocked + isFriend，TA 过去/将来发的 moment 仍然
  // 原样返回给前端。复用 resolver 已经持有的 friendshipRepo，一次性把
  // owner 标了 hidden 的 characterId 集合返回，moments/feed 可以挂到
  // avatarContext 上做 Set.has() 过滤。
  async getMomentsHiddenFromMeCharacterIds(
    ownerId: string,
  ): Promise<Set<string>> {
    // 走查再再 R1：朋友权限页有三个开关——`momentsHiddenFromMe` /
    // `momentsHiddenFromThem` / `chatOnly`。第三个的 UI 描述是「仅保留聊天，
    // TA 不会出现在朋友圈、动态等场景」，但之前后端跟前两个一样从来没读它，
    // 又是 dead flag。把 chatOnly=true 当作 momentsHiddenFromMe + ...FromThem
    // 同时为 true 来对待：TA 的 moment 不进 owner 的 view，owner 的 moment
    // 也不进 TA 的 NPC 候选池，跟描述里"不出现在朋友圈/动态"语义一致。
    const rows = await this.friendshipRepo.find({
      where: [
        {
          ownerId,
          status: Not(In(['blocked', 'removed'])),
          momentsHiddenFromMe: true,
        },
        {
          ownerId,
          status: Not(In(['blocked', 'removed'])),
          chatOnly: true,
        },
      ],
      select: ['characterId'],
    });
    return new Set(rows.map((row) => row.characterId));
  }

  // 走查 R2 复检：跟 momentsHiddenFromMe 对称。
  // friendship.momentsHiddenFromThem=true 表示用户在朋友权限里勾了「TA 看不到
  // 我的朋友圈」。但 npc autonomy tick / feed engagement 一直没读这个 flag，
  // 这位角色照样把用户最新 moment 点赞+评论。把这部分 char 从能看到用户
  // moment 的候选池里拿掉，让 UI 开关真的起作用。
  // 再再 R1：chatOnly=true 同样把 owner 的 moment 从 TA 视野里摘出去，跟
  // getMomentsHiddenFromMeCharacterIds 那条 OR 写法对齐。
  async getMomentsHiddenFromThemCharacterIds(
    ownerId: string,
  ): Promise<Set<string>> {
    const rows = await this.friendshipRepo.find({
      where: [
        {
          ownerId,
          status: Not(In(['blocked', 'removed'])),
          momentsHiddenFromThem: true,
        },
        {
          ownerId,
          status: Not(In(['blocked', 'removed'])),
          chatOnly: true,
        },
      ],
      select: ['characterId'],
    });
    return new Set(rows.map((row) => row.characterId));
  }

  applyCharacterRemark(
    authorType: string | null | undefined,
    authorId: string | null | undefined,
    originalName: string,
    map: FriendRemarkMap | null | undefined,
  ): string {
    if (!map || !authorId) return originalName;
    if (authorType !== 'character') return originalName;
    return map.get(authorId) ?? originalName;
  }

  // 走查第六轮 R1：moments.service.buildMomentAvatarContext 每次需要同时拿
  // remarkMap + momentsHiddenFromMe 集合，分别调 getOwnerRemarkMap +
  // getMomentsHiddenFromMeCharacterIds —— 两条 SQL 都跑在同一张 friendships
  // 表、同一 ownerId 上，第二条只是多一个 momentsHiddenFromMe=true OR
  // chatOnly=true 的 where 子句。SQLite 上同 owner 50+ 好友时两次 indexed
  // scan 也 2-3ms × 2 起步，在 /moments getFeed 的热路径上每次都跑。把两条
  // 查询合并成一次 select，让一行同时贡献到 remarkMap 和 hidden set：
  // 单 select，~30% 的拉数据时间砍掉一半。
  async getOwnerRemarkAndMomentsContext(ownerId: string): Promise<{
    remarkMap: FriendRemarkMap;
    momentsHiddenFromMeCharacterIds: Set<string>;
  }> {
    const rows = await this.friendshipRepo.find({
      where: { ownerId, status: Not(In(['blocked', 'removed'])) },
      select: [
        'characterId',
        'remarkName',
        'momentsHiddenFromMe',
        'chatOnly',
      ],
    });
    const remarkMap: FriendRemarkMap = new Map();
    const momentsHiddenFromMeCharacterIds = new Set<string>();
    for (const row of rows) {
      const remark = row.remarkName?.trim();
      if (remark) {
        remarkMap.set(row.characterId, remark);
      }
      if (row.momentsHiddenFromMe || row.chatOnly) {
        momentsHiddenFromMeCharacterIds.add(row.characterId);
      }
    }
    return { remarkMap, momentsHiddenFromMeCharacterIds };
  }
}
