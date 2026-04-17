type GameCenterTone =
  | 'forest'
  | 'gold'
  | 'ocean'
  | 'violet'
  | 'sunset'
  | 'mint';

type GameCenterCategoryId =
  | 'featured'
  | 'party'
  | 'competitive'
  | 'relax'
  | 'strategy';

type GamePublisherKind =
  | 'platform_official'
  | 'third_party'
  | 'character_creator';

type GameProductionKind =
  | 'human_authored'
  | 'ai_assisted'
  | 'ai_generated'
  | 'character_generated';

type GameRuntimeMode =
  | 'workspace_mock'
  | 'chat_native'
  | 'embedded_web'
  | 'remote_session';

type GameReviewStatus =
  | 'internal_seed'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

type GameVisibilityScope =
  | 'featured'
  | 'published'
  | 'coming_soon'
  | 'internal';

type GameCenterGame = {
  id: string;
  name: string;
  slogan: string;
  description: string;
  studio: string;
  badge: string;
  heroLabel: string;
  category: GameCenterCategoryId;
  tone: GameCenterTone;
  playersLabel: string;
  friendsLabel: string;
  updateNote: string;
  deckLabel: string;
  estimatedDuration: string;
  rewardLabel: string;
  sessionObjective: string;
  tags: string[];
  publisherKind: GamePublisherKind;
  productionKind: GameProductionKind;
  runtimeMode: GameRuntimeMode;
  reviewStatus: GameReviewStatus;
  visibilityScope: GameVisibilityScope;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  aiHighlights: string[];
};

type GameCenterEvent = {
  id: string;
  title: string;
  description: string;
  meta: string;
  ctaLabel: string;
  relatedGameId: string;
  actionKind: 'mission' | 'reminder' | 'join';
  tone: GameCenterTone;
};

type GameCenterHomeSeed = {
  categoryTabs: Array<{
    id: GameCenterCategoryId;
    label: string;
    description: string;
  }>;
  featuredGameIds: string[];
  shelves: Array<{
    id: string;
    title: string;
    description: string;
    gameIds: string[];
  }>;
  hotRankings: Array<{
    gameId: string;
    rank: number;
    note: string;
  }>;
  newRankings: Array<{
    gameId: string;
    rank: number;
    note: string;
  }>;
  friendActivities: Array<{
    id: string;
    friendName: string;
    friendAvatar?: string;
    gameId: string;
    status: string;
    updatedAt: string;
  }>;
  events: GameCenterEvent[];
  games: GameCenterGame[];
};

export const GAME_CENTER_HOME_SEED: GameCenterHomeSeed = {
  categoryTabs: [
    {
      id: 'featured',
      label: '推荐',
      description: '先看编辑推荐、活动位和最近玩过。',
    },
    {
      id: 'party',
      label: '聚会',
      description: '适合拉朋友一起开的轻社交玩法。',
    },
    {
      id: 'competitive',
      label: '竞技',
      description: '更强调节奏、排名和对抗感。',
    },
    {
      id: 'relax',
      label: '休闲',
      description: '碎片时间也能打开继续玩的内容。',
    },
    {
      id: 'strategy',
      label: '经营',
      description: '更适合长期养成和资源经营。',
    },
  ],
  games: [
    {
      id: 'signal-squad',
      name: '信号小队',
      slogan: '三分钟一局，把反应和协作压到最紧。',
      description:
        '以小队突围为核心，强调短局、轻社交和复盘分享，适合作为桌面与移动端都能快速回流的核心推荐位。',
      studio: '隐界游戏实验室',
      badge: '本周主推',
      heroLabel: '快节奏组队',
      category: 'competitive',
      tone: 'forest',
      playersLabel: '18.4 万人在玩',
      friendsLabel: '12 位好友常玩',
      updateNote: '赛季任务刚更新',
      deckLabel: '竞技热玩',
      estimatedDuration: '3 分钟一局',
      rewardLabel: '赛季徽章 + 团队积分',
      sessionObjective: '本局目标是完成两次协同压制并稳住终点信号塔。',
      tags: ['组队', '3 分钟', '赛季'],
      publisherKind: 'platform_official',
      productionKind: 'ai_assisted',
      runtimeMode: 'chat_native',
      reviewStatus: 'internal_seed',
      visibilityScope: 'featured',
      aiHighlights: ['AI 陪玩队友', 'AI 赛后复盘', 'AI 匹配建议'],
    },
    {
      id: 'night-market',
      name: '夜市合伙人',
      slogan: '布置摊位、招呼顾客，把人情味经营起来。',
      description:
        '从摆摊到夜市街区联营，强调轻经营和好友互访，适合作为最近玩过与福利活动的稳定承接项。',
      studio: '月台事务所',
      badge: '慢热经营',
      heroLabel: '夜间市集',
      category: 'strategy',
      tone: 'sunset',
      playersLabel: '9.2 万人在玩',
      friendsLabel: '6 位好友开摊中',
      updateNote: '周末夜市双倍客流',
      deckLabel: '经营精选',
      estimatedDuration: '8 分钟一轮营业',
      rewardLabel: '夜市券 + 新摊位许可',
      sessionObjective: '这次营业优先把甜品摊升级到 5 级并拉满周末客流。',
      tags: ['摆摊', '经营', '互访'],
      publisherKind: 'platform_official',
      productionKind: 'ai_assisted',
      runtimeMode: 'embedded_web',
      reviewStatus: 'internal_seed',
      visibilityScope: 'featured',
      aiHighlights: ['AI 顾客对话', 'AI 摊位生成', 'AI 周末事件'],
    },
    {
      id: 'sky-rally',
      name: '天空竞速',
      slogan: '一条赛道一口气冲到底，适合上头和围观。',
      description:
        '空中滑轨和即时加速机制构成核心乐趣，直播观看和冲榜节奏很强，适合作为热门榜入口。',
      studio: '白昼引擎',
      badge: '热门榜第 1',
      heroLabel: '冲榜竞速',
      category: 'competitive',
      tone: 'ocean',
      playersLabel: '21.6 万人在玩',
      friendsLabel: '9 位好友冲榜',
      updateNote: '极光赛道限时开放',
      deckLabel: '冲榜推荐',
      estimatedDuration: '2 分钟冲线',
      rewardLabel: '冲榜星章 + 极光喷漆',
      sessionObjective: '利用极光赛道的两段加速门，争取把本周圈速压进前 10%。',
      tags: ['竞速', '榜单', '极光赛道'],
      publisherKind: 'third_party',
      productionKind: 'ai_generated',
      runtimeMode: 'embedded_web',
      reviewStatus: 'approved',
      visibilityScope: 'published',
      aiHighlights: ['AI 赛道变体', 'AI 对手幽灵', 'AI 回放点评'],
    },
    {
      id: 'cat-inn',
      name: '猫咖旅馆',
      slogan: '给客人留灯，也给猫留一个能窝着的角落。',
      description:
        '轻布置 + 轻剧情的休闲经营玩法，视觉柔和，适合放在移动端推荐流和近期回访位。',
      studio: '窗边工作室',
      badge: '治愈新游',
      heroLabel: '治愈经营',
      category: 'relax',
      tone: 'gold',
      playersLabel: '7.1 万人在玩',
      friendsLabel: '4 位好友入住中',
      updateNote: '春季家具套装上线',
      deckLabel: '轻松治愈',
      estimatedDuration: '6 分钟布置',
      rewardLabel: '春季家具票 + 顾客好感',
      sessionObjective: '把一楼休息区布置成春季主题，再接待今晚的第一批住客。',
      tags: ['猫咪', '布置', '剧情'],
      publisherKind: 'platform_official',
      productionKind: 'ai_generated',
      runtimeMode: 'embedded_web',
      reviewStatus: 'approved',
      visibilityScope: 'published',
      aiHighlights: ['AI 客人剧情', 'AI 布置建议', 'AI 家具组合'],
    },
    {
      id: 'forest-train',
      name: '星野列车',
      slogan: '一边跑图一边收集乘客故事，适合慢慢玩。',
      description:
        '把跑图、收集和碎片叙事拼到一条轻冒险旅线上，适合放进新游榜和编辑推荐。',
      studio: '北岛像素',
      badge: '编辑推荐',
      heroLabel: '旅途叙事',
      category: 'relax',
      tone: 'mint',
      playersLabel: '5.4 万人在玩',
      friendsLabel: '3 位好友刚上车',
      updateNote: '新增海边支线站点',
      deckLabel: '故事感推荐',
      estimatedDuration: '10 分钟一段旅程',
      rewardLabel: '乘客故事碎片 + 海边车票',
      sessionObjective: '本次旅程优先跑完海边支线，把新乘客的故事碎片补齐。',
      tags: ['冒险', '收集', '剧情'],
      publisherKind: 'character_creator',
      productionKind: 'character_generated',
      runtimeMode: 'chat_native',
      reviewStatus: 'approved',
      visibilityScope: 'published',
      sourceCharacterId: 'character-conductor-01',
      sourceCharacterName: '星野乘务长',
      aiHighlights: ['角色即席叙事', 'AI 支线生成', 'AI 旅途播报'],
    },
    {
      id: 'pixel-arena',
      name: '像素擂台',
      slogan: '像素格斗越简单，朋友对打时越上头。',
      description:
        '极简操作配合高反馈格斗节奏，很适合社交传播和短时间开黑，也是移动端社交排行的重要支点。',
      studio: '格点工坊',
      badge: '好友热玩',
      heroLabel: '像素对打',
      category: 'party',
      tone: 'violet',
      playersLabel: '13.8 万人在玩',
      friendsLabel: '15 位好友组局',
      updateNote: '双人同屏模式上线',
      deckLabel: '社交热玩',
      estimatedDuration: '4 分钟一场',
      rewardLabel: '擂台连胜章 + 双人皮肤券',
      sessionObjective: '先和好友打完一轮双人同屏，再冲一波 3 连胜奖励。',
      tags: ['对打', '同屏', '组局'],
      publisherKind: 'third_party',
      productionKind: 'ai_assisted',
      runtimeMode: 'embedded_web',
      reviewStatus: 'approved',
      visibilityScope: 'published',
      aiHighlights: ['AI 陪练', 'AI 连招提示', 'AI 观战点评'],
    },
    {
      id: 'cloud-farm',
      name: '云上农场',
      slogan: '种地、收菜、帮邻居浇水，节奏慢但黏性很强。',
      description:
        '传统轻农场玩法经过重新包装，更适合作为长期留存游戏卡，负责撑起最近玩过和回流提醒。',
      studio: '南风田野',
      badge: '常驻长线',
      heroLabel: '农场经营',
      category: 'strategy',
      tone: 'forest',
      playersLabel: '10.3 万人在玩',
      friendsLabel: '8 位好友互助',
      updateNote: '本周开放花圃联营',
      deckLabel: '稳定留存',
      estimatedDuration: '5 分钟收菜',
      rewardLabel: '花圃币 + 联营订单',
      sessionObjective: '先收完成熟作物，再去邻居花圃里把本周联营订单补齐。',
      tags: ['农场', '互助', '长线'],
      publisherKind: 'platform_official',
      productionKind: 'ai_assisted',
      runtimeMode: 'embedded_web',
      reviewStatus: 'approved',
      visibilityScope: 'published',
      aiHighlights: ['AI 订单生成', 'AI 邻居事件', 'AI 作物建议'],
    },
    {
      id: 'island-concert',
      name: '岛屿演唱会',
      slogan: '把舞台搭在海边，派对就会变得自然。',
      description:
        '面向朋友聚会和表演互动设计，强调一起装扮舞台、合奏和打卡分享，适合活动位和聚会专题。',
      studio: '浅海现场',
      badge: '周末派对',
      heroLabel: '海边派对',
      category: 'party',
      tone: 'sunset',
      playersLabel: '8.8 万人在玩',
      friendsLabel: '11 位好友准备开场',
      updateNote: '海风主题舞台返场',
      deckLabel: '派对推荐',
      estimatedDuration: '7 分钟一场演出',
      rewardLabel: '舞台海报 + 合奏积分',
      sessionObjective: '今晚先排一场海边合奏，把返场舞台的限定海报拿到手。',
      tags: ['派对', '装扮', '合奏'],
      publisherKind: 'character_creator',
      productionKind: 'character_generated',
      runtimeMode: 'chat_native',
      reviewStatus: 'pending_review',
      visibilityScope: 'coming_soon',
      sourceCharacterId: 'character-sea-host-01',
      sourceCharacterName: '浅海主持人',
      aiHighlights: ['角色主持', 'AI 合奏编排', 'AI 海报生成'],
    },
  ],
  featuredGameIds: ['signal-squad', 'night-market', 'sky-rally'],
  shelves: [
    {
      id: 'recommended',
      title: '为你推荐',
      description: '按微信游戏中心的节奏，优先摆主推、社交热玩和可回访内容。',
      gameIds: ['signal-squad', 'night-market', 'cat-inn', 'forest-train'],
    },
    {
      id: 'friends',
      title: '好友热玩',
      description: '更强调一起玩和容易转发的项目。',
      gameIds: ['pixel-arena', 'signal-squad', 'island-concert'],
    },
    {
      id: 'easy-return',
      title: '适合碎片时间继续',
      description: '放可以随时返回、继续经营或推进的项目。',
      gameIds: ['cloud-farm', 'night-market', 'cat-inn'],
    },
  ],
  hotRankings: [
    {
      rank: 1,
      gameId: 'sky-rally',
      note: '极光赛道带动本周冲榜热度。',
    },
    {
      rank: 2,
      gameId: 'signal-squad',
      note: '赛季任务更新后，小队匹配显著升温。',
    },
    {
      rank: 3,
      gameId: 'pixel-arena',
      note: '双人同屏模式让社交传播继续放大。',
    },
  ],
  newRankings: [
    {
      rank: 1,
      gameId: 'cat-inn',
      note: '治愈感和布置玩法带动收藏率。',
    },
    {
      rank: 2,
      gameId: 'forest-train',
      note: '支线站点更新后回访率提升。',
    },
    {
      rank: 3,
      gameId: 'island-concert',
      note: '周末派对活动带来新一轮曝光。',
    },
  ],
  friendActivities: [
    {
      id: 'activity-lin',
      friendName: '林树',
      gameId: 'signal-squad',
      status: '刚打完一局晋级赛，正在拉人补位。',
      updatedAt: '2026-04-10T14:18:00.000Z',
    },
    {
      id: 'activity-an',
      friendName: '安澜',
      gameId: 'night-market',
      status: '夜市摊位升到 5 级，刚开了新的甜品档。',
      updatedAt: '2026-04-10T12:36:00.000Z',
    },
    {
      id: 'activity-lu',
      friendName: '陆回',
      gameId: 'pixel-arena',
      status: '在约人打双人同屏，已经连胜 6 场。',
      updatedAt: '2026-04-10T11:22:00.000Z',
    },
    {
      id: 'activity-yan',
      friendName: '言初',
      gameId: 'cat-inn',
      status: '刚把春季家具摆完，准备截图发朋友圈。',
      updatedAt: '2026-04-10T09:58:00.000Z',
    },
  ],
  events: [
    {
      id: 'season-signal',
      title: '信号小队 S2 赛季开启',
      description: '完成周任务可解锁全队共享外观和回放徽章。',
      meta: '今天 20:00 开始',
      ctaLabel: '去做任务',
      relatedGameId: 'signal-squad',
      actionKind: 'mission',
      tone: 'forest',
    },
    {
      id: 'market-night',
      title: '夜市合伙人周末客流翻倍',
      description: '指定时段营业收益翻倍，适合回流和好友互访。',
      meta: '周五 - 周日',
      ctaLabel: '预约提醒',
      relatedGameId: 'night-market',
      actionKind: 'reminder',
      tone: 'sunset',
    },
    {
      id: 'concert-island',
      title: '岛屿演唱会海风舞台返场',
      description: '邀请两位好友合奏可解锁限定海报。',
      meta: '限时 3 天',
      ctaLabel: '立即参加',
      relatedGameId: 'island-concert',
      actionKind: 'join',
      tone: 'gold',
    },
  ],
};

export function cloneGameCenterHomeResponse() {
  return {
    categoryTabs: GAME_CENTER_HOME_SEED.categoryTabs.map((tab) => ({ ...tab })),
    featuredGameIds: [...GAME_CENTER_HOME_SEED.featuredGameIds],
    shelves: GAME_CENTER_HOME_SEED.shelves.map((shelf) => ({
      ...shelf,
      gameIds: [...shelf.gameIds],
    })),
    hotRankings: GAME_CENTER_HOME_SEED.hotRankings.map((entry) => ({ ...entry })),
    newRankings: GAME_CENTER_HOME_SEED.newRankings.map((entry) => ({ ...entry })),
    friendActivities: GAME_CENTER_HOME_SEED.friendActivities.map((activity) => ({
      ...activity,
    })),
    events: GAME_CENTER_HOME_SEED.events.map((event) => ({ ...event })),
    games: GAME_CENTER_HOME_SEED.games.map((game) => ({
      ...game,
      tags: [...game.tags],
      aiHighlights: [...game.aiHighlights],
    })),
    generatedAt: new Date().toISOString(),
  };
}
