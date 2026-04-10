import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { OfficialAccountEntity } from './official-account.entity';
import { OfficialAccountArticleEntity } from './official-account-article.entity';
import { OfficialAccountDeliveryEntity } from './official-account-delivery.entity';
import { OfficialAccountFollowEntity } from './official-account-follow.entity';
import { OfficialAccountServiceMessageEntity } from './official-account-service-message.entity';

type SeedArticle = {
  title: string;
  summary: string;
  authorName: string;
  publishedAt: string;
  isPinned?: boolean;
  contentHtml: string;
};

type SeedAccount = {
  handle: string;
  name: string;
  description: string;
  accountType: 'subscription' | 'service';
  isVerified: boolean;
  articles: SeedArticle[];
};

const OFFICIAL_ACCOUNT_SEEDS: SeedAccount[] = [
  {
    handle: 'yinjie-daily',
    name: '隐界日报',
    description: '每天整理这个世界里最值得你停下来读一会儿的公共叙事与生活片段。',
    accountType: 'subscription',
    isVerified: true,
    articles: [
      {
        title: '这个世界最近开始偏爱慢消息',
        summary: '角色的表达频率正在下降，但长内容和回访率明显变高，慢消息重新占据了关系中心。',
        authorName: '隐界编辑部',
        publishedAt: '2026-04-10T08:30:00.000Z',
        isPinned: true,
        contentHtml: `
          <p>过去一周，隐界里的居民没有变得更安静，他们只是开始更认真地说话。</p>
          <p>短句和即刻回应在减少，取而代之的是更完整的描述、更长的停顿，以及更明确的情绪指向。</p>
          <p>这意味着“慢消息”开始重新变得重要。它不一定高频，却更容易留下关系痕迹。</p>
          <h3>为什么会出现这个变化</h3>
          <p>第一，角色之间的互动开始从“被动回应”转向“主动回访”；第二，朋友圈和广场动态正在承担更多表达入口；第三，用户对世界的预期正在从“陪聊”转向“共处”。</p>
          <blockquote>一个世界是否成立，不只看它说得快不快，也看它会不会记住你。</blockquote>
          <p>接下来，隐界日报会持续跟踪这些变化，把值得留意的叙事趋势整理给你。</p>
        `,
      },
      {
        title: '桌面阅读工作区为什么值得单独做',
        summary: '当内容不再只是消息切片，桌面阅读需要拥有自己的节奏、留白和上下文。',
        authorName: '隐界编辑部',
        publishedAt: '2026-04-09T12:00:00.000Z',
        contentHtml: `
          <p>桌面端最大的优势不是“显示更多”，而是“允许用户连续停留”。</p>
          <p>当文章、评论、历史推送、账号资料同时出现在一个工作区里，用户不需要频繁跳页，理解会更连贯。</p>
          <p>这也是公众号桌面版不该只做成手机页放大版的原因。</p>
        `,
      },
    ],
  },
  {
    handle: 'archive-room',
    name: '世界档案室',
    description: '整理场景、角色与叙事设定的长期档案，适合用来补世界背景。',
    accountType: 'subscription',
    isVerified: true,
    articles: [
      {
        title: '三种适合长期保存的世界资料',
        summary: '如果一个世界会持续生长，哪些资料值得沉淀成“以后还会翻”的长期页面？',
        authorName: '档案室',
        publishedAt: '2026-04-08T09:20:00.000Z',
        contentHtml: `
          <p>第一类是角色长期档案：人物关系、口头习惯、重要经历。</p>
          <p>第二类是场景设定：固定地点、空间氛围、时间规律。</p>
          <p>第三类是叙事脉络：哪些事件已经发生，哪些悬念还留着。</p>
          <p>公众号适合承载这些“反复查看”的长资料，而不是让它们散落在一次性聊天里。</p>
        `,
      },
      {
        title: '为什么有些内容更适合用文章而不是聊天发出',
        summary: '聊天适合即时互动，文章适合把结构、上下文和完整观点一次给清楚。',
        authorName: '档案室',
        publishedAt: '2026-04-06T14:10:00.000Z',
        contentHtml: `
          <p>聊天的优势是即时，文章的优势是完整。</p>
          <p>当一段信息需要层次、标题、引用和复看价值时，文章会比聊天记录更稳定。</p>
        `,
      },
    ],
  },
  {
    handle: 'world-service',
    name: '世界服务台',
    description: '用于承载系统公告、世界入口提醒和服务型通知的服务号示例。',
    accountType: 'service',
    isVerified: true,
    articles: [
      {
        title: '如何更稳地管理你的世界入口',
        summary: '把常用世界地址、API 配置与阅读入口梳理清楚，切换设备时会更轻松。',
        authorName: '服务台',
        publishedAt: '2026-04-07T07:45:00.000Z',
        contentHtml: `
          <p>如果你会在桌面端和移动端之间来回切换，建议先稳定三件事：世界地址、个人资料、专属 API Key。</p>
          <p>这类内容兼具阅读和服务属性，因此更适合放在服务号里，而不是朋友圈或广场动态。</p>
        `,
      },
    ],
  },
];

@Injectable()
export class OfficialAccountsService {
  constructor(
    @InjectRepository(OfficialAccountEntity)
    private readonly accountRepo: Repository<OfficialAccountEntity>,
    @InjectRepository(OfficialAccountArticleEntity)
    private readonly articleRepo: Repository<OfficialAccountArticleEntity>,
    @InjectRepository(OfficialAccountDeliveryEntity)
    private readonly deliveryRepo: Repository<OfficialAccountDeliveryEntity>,
    @InjectRepository(OfficialAccountFollowEntity)
    private readonly followRepo: Repository<OfficialAccountFollowEntity>,
    @InjectRepository(OfficialAccountServiceMessageEntity)
    private readonly serviceMessageRepo: Repository<OfficialAccountServiceMessageEntity>,
    private readonly worldOwnerService: WorldOwnerService,
  ) {}

  async listAccounts() {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const accounts = await this.accountRepo.find({
      where: { isEnabled: true },
      order: { lastPublishedAt: 'DESC', createdAt: 'DESC' },
    });

    if (!accounts.length) {
      return [];
    }

    const follows = await this.followRepo.find({
      where: {
        ownerId: owner.id,
        accountId: In(accounts.map((account) => account.id)),
      },
    });
    const followSet = new Set(follows.map((follow) => follow.accountId));
    const recentArticles = await this.getRecentArticlesForAccounts(
      accounts.map((account) => account.id),
    );

    return accounts.map((account) =>
      this.serializeAccountSummary(
        account,
        followSet.has(account.id),
        recentArticles.get(account.id)?.[0],
      ),
    );
  }

  async getAccount(id: string) {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const account = await this.getAccountEntityOrThrow(id);
    const follow = await this.followRepo.findOneBy({
      ownerId: owner.id,
      accountId: account.id,
    });
    const articles = await this.articleRepo.find({
      where: { accountId: account.id },
      order: { isPinned: 'DESC', publishedAt: 'DESC' },
      take: 24,
    });

    return this.serializeAccountDetail(account, Boolean(follow), articles);
  }

  async listAccountArticles(id: string) {
    await this.ensureSeedData();
    await this.getAccountEntityOrThrow(id);
    const articles = await this.articleRepo.find({
      where: { accountId: id },
      order: { isPinned: 'DESC', publishedAt: 'DESC' },
    });
    return articles.map((article) => this.serializeArticleSummary(article));
  }

  async getArticle(articleId: string) {
    await this.ensureSeedData();
    return this.getArticleDetail(articleId);
  }

  async getMessageEntries() {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const [subscriptionInbox, serviceConversations] = await Promise.all([
      this.buildSubscriptionInbox(owner.id),
      this.getServiceConversations(),
    ]);

    return {
      subscriptionInbox: subscriptionInbox.summary,
      serviceConversations,
    };
  }

  async getSubscriptionInbox() {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.buildSubscriptionInbox(owner.id);
  }

  async getServiceConversations() {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const serviceAccountIds = await this.getFollowedServiceAccountIds(owner.id);

    if (!serviceAccountIds.length) {
      return [];
    }

    await this.ensureServiceMessages(owner.id, serviceAccountIds);

    const [accounts, recentArticles, messages] = await Promise.all([
      this.accountRepo.find({
        where: {
          id: In(serviceAccountIds),
          accountType: 'service',
          isEnabled: true,
        },
      }),
      this.getRecentArticlesForAccounts(serviceAccountIds),
      this.serviceMessageRepo.find({
        where: {
          ownerId: owner.id,
          accountId: In(serviceAccountIds),
        },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return accounts
      .flatMap((account) => {
        const summary = this.serializeServiceConversationSummary(
          account,
          messages.filter((message) => message.accountId === account.id),
          recentArticles.get(account.id)?.[0],
        );

        return summary ? [summary] : [];
      })
      .sort((left, right) => {
        const leftTime = left.lastDeliveredAt
          ? new Date(left.lastDeliveredAt).getTime()
          : 0;
        const rightTime = right.lastDeliveredAt
          ? new Date(right.lastDeliveredAt).getTime()
          : 0;
        return rightTime - leftTime;
      });
  }

  async getServiceMessages(accountId: string) {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const account = await this.getServiceAccountEntityOrThrow(accountId);
    await this.ensureServiceMessages(owner.id, [account.id]);

    const messages = await this.serviceMessageRepo.find({
      where: {
        ownerId: owner.id,
        accountId: account.id,
      },
      order: { createdAt: 'ASC' },
    });

    return messages.map((message) => this.serializeServiceMessage(message));
  }

  async markArticleRead(articleId: string) {
    await this.ensureSeedData();
    const article = await this.getArticleEntityOrThrow(articleId);
    article.readCount += 1;
    await this.articleRepo.save(article);
    return this.getArticleDetail(articleId);
  }

  async markServiceMessagesRead(accountId: string) {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.getServiceAccountEntityOrThrow(accountId);

    const unreadMessages = await this.serviceMessageRepo.find({
      where: {
        ownerId: owner.id,
        accountId,
        readAt: IsNull(),
      },
    });

    if (unreadMessages.length) {
      const now = new Date();
      await this.serviceMessageRepo.save(
        unreadMessages.map((message) => ({
          ...message,
          readAt: now,
        })),
      );
    }

    return this.getServiceMessages(accountId);
  }

  async markDeliveryRead(deliveryId: string) {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const delivery = await this.deliveryRepo.findOneBy({
      id: deliveryId,
      ownerId: owner.id,
    });

    if (!delivery) {
      throw new NotFoundException('推送记录不存在。');
    }

    if (!delivery.readAt) {
      delivery.readAt = new Date();
      await this.deliveryRepo.save(delivery);
    }

    return this.getSubscriptionInbox();
  }

  async markSubscriptionInboxRead() {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const subscriptionAccountIds = await this.getFollowedSubscriptionAccountIds(
      owner.id,
    );

    if (!subscriptionAccountIds.length) {
      return this.buildSubscriptionInbox(owner.id);
    }

    const unreadDeliveries = await this.deliveryRepo.find({
      where: {
        ownerId: owner.id,
        accountId: In(subscriptionAccountIds),
        deliveryKind: 'subscription_digest',
        readAt: IsNull(),
      },
    });

    if (unreadDeliveries.length) {
      const now = new Date();
      await this.deliveryRepo.save(
        unreadDeliveries.map((delivery) => ({
          ...delivery,
          readAt: now,
        })),
      );
    }

    return this.buildSubscriptionInbox(owner.id);
  }

  async followAccount(id: string) {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const account = await this.getAccountEntityOrThrow(id);

    const existing = await this.followRepo.findOneBy({
      ownerId: owner.id,
      accountId: id,
    });

    if (!existing) {
      const follow = this.followRepo.create({
        ownerId: owner.id,
        accountId: id,
      });
      await this.followRepo.save(follow);
    }

    if (account.accountType === 'service') {
      await this.ensureServiceMessages(owner.id, [account.id]);
    }

    return this.getAccount(id);
  }

  async unfollowAccount(id: string) {
    await this.ensureSeedData();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.getAccountEntityOrThrow(id);
    await this.followRepo.delete({
      ownerId: owner.id,
      accountId: id,
    });
    return this.getAccount(id);
  }

  private async buildSubscriptionInbox(ownerId: string) {
    const subscriptionAccountIds = await this.getFollowedSubscriptionAccountIds(
      ownerId,
    );

    if (!subscriptionAccountIds.length) {
      return {
        summary: null,
        groups: [],
      };
    }

    await this.ensureSubscriptionDeliveries(ownerId, subscriptionAccountIds);

    const [accounts, deliveries, recentArticles] = await Promise.all([
      this.accountRepo.find({
        where: {
          id: In(subscriptionAccountIds),
          isEnabled: true,
        },
        order: { lastPublishedAt: 'DESC', createdAt: 'DESC' },
      }),
      this.deliveryRepo.find({
        where: {
          ownerId,
          accountId: In(subscriptionAccountIds),
          deliveryKind: 'subscription_digest',
        },
        order: { deliveredAt: 'DESC', createdAt: 'DESC' },
      }),
      this.getRecentArticlesForAccounts(subscriptionAccountIds),
    ]);

    if (!deliveries.length) {
      return {
        summary: null,
        groups: [],
      };
    }

    const articleIds = [...new Set(deliveries.map((delivery) => delivery.articleId))];
    const articles = await this.articleRepo.find({
      where: { id: In(articleIds) },
    });
    const articleMap = new Map(articles.map((article) => [article.id, article]));

    const groups = accounts.flatMap((account) => {
        const serializedDeliveries = deliveries
          .filter((delivery) => delivery.accountId === account.id)
          .map((delivery) => {
            const article = articleMap.get(delivery.articleId);
            if (!article) {
              return null;
            }

            return this.serializeDeliveryItem(
              delivery,
              account,
              article,
              recentArticles.get(account.id)?.[0],
            );
          })
          .flatMap((delivery) => (delivery ? [delivery] : []));

        if (!serializedDeliveries.length) {
          return [];
        }

        return [{
          account: this.serializeAccountSummary(
            account,
            true,
            recentArticles.get(account.id)?.[0],
          ),
          deliveries: serializedDeliveries,
          unreadCount: serializedDeliveries.filter((delivery) => !delivery.readAt)
            .length,
          lastDeliveredAt: serializedDeliveries[0]?.deliveredAt,
        }];
      });

    const latestDelivery = groups[0]?.deliveries[0];

    return {
      summary: latestDelivery
        ? {
            unreadCount: groups.reduce(
              (count, group) => count + group.unreadCount,
              0,
            ),
            lastDeliveredAt: latestDelivery.deliveredAt,
            preview: `${latestDelivery.account.name}：${latestDelivery.article.title}`,
          }
        : null,
      groups,
    };
  }

  private async ensureServiceMessages(ownerId: string, accountIds: string[]) {
    const accounts = await this.accountRepo.find({
      where: {
        id: In(accountIds),
        accountType: 'service',
        isEnabled: true,
      },
    });

    if (!accounts.length) {
      return;
    }

    const existingMessages = await this.serviceMessageRepo.find({
      where: {
        ownerId,
        accountId: In(accounts.map((account) => account.id)),
      },
    });
    const initializedAccountIds = new Set(
      existingMessages.map((message) => message.accountId),
    );
    const recentArticles = await this.getRecentArticlesForAccounts(
      accounts.map((account) => account.id),
    );

    const missingMessages = accounts.flatMap((account) => {
      if (initializedAccountIds.has(account.id)) {
        return [];
      }

      const welcomeMessage = this.serviceMessageRepo.create({
        ownerId,
        accountId: account.id,
        type: 'text',
        text: `${account.name} 已接入。后续世界通知、文章卡片和服务提醒会在这里集中出现。`,
      });
      const latestArticle = recentArticles.get(account.id)?.[0];

      if (!latestArticle) {
        return [welcomeMessage];
      }

      const articleCardMessage = this.serviceMessageRepo.create({
        ownerId,
        accountId: account.id,
        type: 'article_card',
        text: '为你准备了一条服务说明',
        attachmentKind: 'article_card',
        attachmentPayload: JSON.stringify({
          kind: 'article_card',
          articleId: latestArticle.id,
          title: latestArticle.title,
          summary: latestArticle.summary,
          coverImage: latestArticle.coverImage ?? undefined,
          publishedAt: latestArticle.publishedAt.toISOString(),
        }),
      });

      return [welcomeMessage, articleCardMessage];
    });

    if (missingMessages.length) {
      await this.serviceMessageRepo.save(missingMessages);
    }
  }

  private async getArticleDetail(articleId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const article = await this.getArticleEntityOrThrow(articleId);
    const account = await this.getAccountEntityOrThrow(article.accountId);
    const follow = await this.followRepo.findOneBy({
      ownerId: owner.id,
      accountId: account.id,
    });
    const relatedArticles = await this.articleRepo.find({
      where: { accountId: account.id },
      order: { isPinned: 'DESC', publishedAt: 'DESC' },
      take: 4,
    });

    return {
      ...this.serializeArticleSummary(article),
      account: this.serializeAccountSummary(
        account,
        Boolean(follow),
        relatedArticles[0],
      ),
      contentHtml: article.contentHtml,
      relatedArticles: relatedArticles
        .filter((entry) => entry.id !== article.id)
        .map((entry) => this.serializeArticleSummary(entry)),
    };
  }

  private async ensureSeedData() {
    const count = await this.accountRepo.count();
    if (count > 0) {
      return;
    }

    for (const seedAccount of OFFICIAL_ACCOUNT_SEEDS) {
      const account = this.accountRepo.create({
        name: seedAccount.name,
        handle: seedAccount.handle,
        avatar: '',
        description: seedAccount.description,
        accountType: seedAccount.accountType,
        isVerified: seedAccount.isVerified,
        lastPublishedAt: new Date(seedAccount.articles[0]?.publishedAt ?? Date.now()),
      });
      const savedAccount = await this.accountRepo.save(account);

      for (const articleSeed of seedAccount.articles) {
        const article = this.articleRepo.create({
          accountId: savedAccount.id,
          title: articleSeed.title,
          summary: articleSeed.summary,
          authorName: articleSeed.authorName,
          contentHtml: articleSeed.contentHtml.trim(),
          publishedAt: new Date(articleSeed.publishedAt),
          isPinned: articleSeed.isPinned ?? false,
        });
        await this.articleRepo.save(article);
      }
    }
  }

  private async ensureSubscriptionDeliveries(
    ownerId: string,
    subscriptionAccountIds: string[],
  ) {
    const articles = await this.articleRepo.find({
      where: { accountId: In(subscriptionAccountIds) },
      order: { publishedAt: 'DESC' },
    });

    if (!articles.length) {
      return;
    }

    const existingDeliveries = await this.deliveryRepo.find({
      where: {
        ownerId,
        articleId: In(articles.map((article) => article.id)),
        deliveryKind: 'subscription_digest',
      },
    });
    const deliveredArticleIds = new Set(
      existingDeliveries.map((delivery) => delivery.articleId),
    );
    const missingDeliveries = articles
      .filter((article) => !deliveredArticleIds.has(article.id))
      .map((article) =>
        this.deliveryRepo.create({
          ownerId,
          accountId: article.accountId,
          articleId: article.id,
          deliveryKind: 'subscription_digest',
          deliveredAt: article.publishedAt,
        }),
      );

    if (missingDeliveries.length) {
      await this.deliveryRepo.save(missingDeliveries);
    }
  }

  private async getFollowedSubscriptionAccountIds(ownerId: string) {
    const follows = await this.followRepo.find({
      where: { ownerId },
    });

    if (!follows.length) {
      return [];
    }

    const subscriptionAccounts = await this.accountRepo.find({
      select: ['id'],
      where: {
        id: In(follows.map((follow) => follow.accountId)),
        accountType: 'subscription',
        isEnabled: true,
      },
    });

    return subscriptionAccounts.map((account) => account.id);
  }

  private async getFollowedServiceAccountIds(ownerId: string) {
    const follows = await this.followRepo.find({
      where: { ownerId },
    });

    if (!follows.length) {
      return [];
    }

    const serviceAccounts = await this.accountRepo.find({
      select: ['id'],
      where: {
        id: In(follows.map((follow) => follow.accountId)),
        accountType: 'service',
        isEnabled: true,
      },
    });

    return serviceAccounts.map((account) => account.id);
  }

  private async getRecentArticlesForAccounts(accountIds: string[]) {
    const articles = await this.articleRepo.find({
      where: { accountId: In(accountIds) },
      order: { isPinned: 'DESC', publishedAt: 'DESC' },
    });
    const articleMap = new Map<string, OfficialAccountArticleEntity[]>();

    for (const article of articles) {
      const currentArticles = articleMap.get(article.accountId) ?? [];
      currentArticles.push(article);
      articleMap.set(article.accountId, currentArticles.slice(0, 3));
    }

    return articleMap;
  }

  private async getAccountEntityOrThrow(id: string) {
    const account = await this.accountRepo.findOneBy({ id, isEnabled: true });
    if (!account) {
      throw new NotFoundException('公众号不存在。');
    }

    return account;
  }

  private async getServiceAccountEntityOrThrow(id: string) {
    const account = await this.getAccountEntityOrThrow(id);
    if (account.accountType !== 'service') {
      throw new NotFoundException('服务号不存在。');
    }

    return account;
  }

  private async getArticleEntityOrThrow(articleId: string) {
    const article = await this.articleRepo.findOneBy({ id: articleId });
    if (!article) {
      throw new NotFoundException('文章不存在。');
    }

    return article;
  }

  private serializeAccountSummary(
    account: OfficialAccountEntity,
    isFollowing: boolean,
    recentArticle?: OfficialAccountArticleEntity,
  ) {
    return {
      id: account.id,
      name: account.name,
      handle: account.handle,
      avatar: account.avatar ?? '',
      description: account.description,
      accountType: account.accountType,
      coverImage: account.coverImage ?? undefined,
      isVerified: account.isVerified,
      isFollowing,
      lastPublishedAt: account.lastPublishedAt?.toISOString(),
      recentArticle: recentArticle
        ? this.serializeArticleSummary(recentArticle)
        : undefined,
    };
  }

  private serializeAccountDetail(
    account: OfficialAccountEntity,
    isFollowing: boolean,
    articles: OfficialAccountArticleEntity[],
  ) {
    return {
      ...this.serializeAccountSummary(account, isFollowing, articles[0]),
      articles: articles.map((article) => this.serializeArticleSummary(article)),
    };
  }

  private serializeArticleSummary(article: OfficialAccountArticleEntity) {
    return {
      id: article.id,
      accountId: article.accountId,
      title: article.title,
      summary: article.summary,
      coverImage: article.coverImage ?? undefined,
      authorName: article.authorName,
      publishedAt: article.publishedAt.toISOString(),
      isPinned: article.isPinned,
      readCount: article.readCount,
    };
  }

  private serializeDeliveryItem(
    delivery: OfficialAccountDeliveryEntity,
    account: OfficialAccountEntity,
    article: OfficialAccountArticleEntity,
    recentArticle?: OfficialAccountArticleEntity,
  ) {
    return {
      id: delivery.id,
      accountId: delivery.accountId,
      articleId: delivery.articleId,
      deliveryKind: delivery.deliveryKind,
      deliveredAt: delivery.deliveredAt.toISOString(),
      readAt: delivery.readAt?.toISOString(),
      account: this.serializeAccountSummary(account, true, recentArticle),
      article: this.serializeArticleSummary(article),
    };
  }

  private serializeServiceConversationSummary(
    account: OfficialAccountEntity,
    messages: OfficialAccountServiceMessageEntity[],
    recentArticle?: OfficialAccountArticleEntity,
  ) {
    const latestMessage = messages[0];
    if (!latestMessage) {
      return null;
    }

    const latestAttachment = this.parseServiceAttachment(latestMessage);
    return {
      accountId: account.id,
      account: this.serializeAccountSummary(account, true, recentArticle),
      unreadCount: messages.filter((message) => !message.readAt).length,
      lastDeliveredAt: latestMessage.createdAt.toISOString(),
      preview:
        latestAttachment?.title ??
        latestMessage.text ??
        `${account.name} 给你发来一条服务消息`,
    };
  }

  private serializeServiceMessage(message: OfficialAccountServiceMessageEntity) {
    return {
      id: message.id,
      accountId: message.accountId,
      type: message.type,
      text: message.text,
      attachment: this.parseServiceAttachment(message) ?? undefined,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString(),
    };
  }

  private parseServiceAttachment(message: OfficialAccountServiceMessageEntity) {
    if (message.attachmentKind !== 'article_card' || !message.attachmentPayload) {
      return null;
    }

    try {
      return JSON.parse(message.attachmentPayload) as {
        kind: 'article_card';
        articleId: string;
        title: string;
        summary: string;
        coverImage?: string;
        publishedAt: string;
      };
    } catch {
      return null;
    }
  }
}
