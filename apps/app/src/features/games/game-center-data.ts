import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

export type GameCenterTone =
  | "forest"
  | "gold"
  | "ocean"
  | "violet"
  | "sunset"
  | "mint";

export type GameCenterCategoryId =
  | "featured"
  | "party"
  | "competitive"
  | "relax"
  | "strategy";

export type GameCenterGame = {
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
};

export type GameCenterRankingEntry = {
  gameId: string;
  rank: number;
  note: string;
};

export type GameCenterFriendActivity = {
  id: string;
  friendName: string;
  friendAvatar?: string;
  gameId: string;
  status: string;
  updatedAt: string;
};

export type GameCenterEvent = {
  id: string;
  title: string;
  description: string;
  meta: string;
  ctaLabel: string;
  relatedGameId: string;
  actionKind: "mission" | "reminder" | "join";
  tone: GameCenterTone;
};

export type GameCenterShelf = {
  id: string;
  title: string;
  description: string;
  gameIds: string[];
};

export type GameCenterToneStyle = {
  badgeClassName: string;
  heroCardClassName: string;
  iconClassName: string;
  mutedPanelClassName: string;
  softTextClassName: string;
};

export const gameCenterCategoryTabs: Array<{
  id: GameCenterCategoryId;
  label: string;
  description: string;
}> = [
  {
    id: "featured",
    label: t(msg`推荐`),
    description: t(msg`先看编辑推荐、活动位和最近玩过。`),
  },
  {
    id: "party",
    label: t(msg`聚会`),
    description: t(msg`适合拉朋友一起开的轻社交玩法。`),
  },
  {
    id: "competitive",
    label: t(msg`竞技`),
    description: t(msg`更强调节奏、排名和对抗感。`),
  },
  {
    id: "relax",
    label: t(msg`休闲`),
    description: t(msg`碎片时间也能打开继续玩的内容。`),
  },
  {
    id: "strategy",
    label: t(msg`经营`),
    description: t(msg`更适合长期养成和资源经营。`),
  },
];

export const gameCenterGames: GameCenterGame[] = [
  {
    id: "parking-war",
    name: t(msg`抢车位`),
    slogan: t(msg`和世界里的熟人抢一个能停的位。`),
    description: t(msg`经典停车场玩法在隐界重做：自家车位每分钟自动收钱，停到 NPC 的车场可以蹭收益，被人占了车位就贴条把对方钱吃下来。对手不是真人，是世界里的熟面孔。`),
    studio: t(msg`隐界游戏实验室`),
    badge: t(msg`首发主推`),
    heroLabel: t(msg`停车经营`),
    category: "competitive",
    tone: "sunset",
    playersLabel: t(msg`刚开张，世界里的人都在试`),
    friendsLabel: t(msg`6 位 NPC 在抢你的车位`),
    updateNote: t(msg`可玩版上线`),
    deckLabel: t(msg`竞技推荐`),
    estimatedDuration: t(msg`随时玩，离线也在赚`),
    rewardLabel: t(msg`停车收益 + 车型解锁`),
    sessionObjective: t(msg`先把自家 6 个车位填满，再去蹭一蹭别人的车场。`),
    tags: [t(msg`停车`), t(msg`经营`), t(msg`蹭收益`)],
  },
  {
    id: "signal-squad",
    name: t(msg`信号小队`),
    slogan: t(msg`三分钟一局，把反应和协作压到最紧。`),
    description: t(msg`以小队突围为核心，强调短局、轻社交和复盘分享，适合作为桌面与移动端都能快速回流的核心推荐位。`),
    studio: t(msg`隐界游戏实验室`),
    badge: t(msg`本周主推`),
    heroLabel: t(msg`快节奏组队`),
    category: "competitive",
    tone: "forest",
    playersLabel: t(msg`18.4 万人在玩`),
    friendsLabel: t(msg`12 位好友常玩`),
    updateNote: t(msg`赛季任务刚更新`),
    deckLabel: t(msg`竞技热玩`),
    estimatedDuration: t(msg`3 分钟一局`),
    rewardLabel: t(msg`赛季徽章 + 团队积分`),
    sessionObjective: t(msg`本局目标是完成两次协同压制并稳住终点信号塔。`),
    tags: [t(msg`组队`), t(msg`3 分钟`), t(msg`赛季`)],
  },
  {
    id: "night-market",
    name: t(msg`夜市合伙人`),
    slogan: t(msg`布置摊位、招呼顾客，把人情味经营起来。`),
    description: t(msg`从摆摊到夜市街区联营，强调轻经营和好友互访，适合作为最近玩过与福利活动的稳定承接项。`),
    studio: t(msg`月台事务所`),
    badge: t(msg`慢热经营`),
    heroLabel: t(msg`夜间市集`),
    category: "strategy",
    tone: "sunset",
    playersLabel: t(msg`9.2 万人在玩`),
    friendsLabel: t(msg`6 位好友开摊中`),
    updateNote: t(msg`周末夜市双倍客流`),
    deckLabel: t(msg`经营精选`),
    estimatedDuration: t(msg`8 分钟一轮营业`),
    rewardLabel: t(msg`夜市券 + 新摊位许可`),
    sessionObjective: t(msg`这次营业优先把甜品摊升级到 5 级并拉满周末客流。`),
    tags: [t(msg`摆摊`), t(msg`经营`), t(msg`互访`)],
  },
  {
    id: "sky-rally",
    name: t(msg`天空竞速`),
    slogan: t(msg`一条赛道一口气冲到底，适合上头和围观。`),
    description: t(msg`空中滑轨和即时加速机制构成核心乐趣，直播观看和冲榜节奏很强，适合作为热门榜入口。`),
    studio: t(msg`白昼引擎`),
    badge: t(msg`热门榜第 1`),
    heroLabel: t(msg`冲榜竞速`),
    category: "competitive",
    tone: "ocean",
    playersLabel: t(msg`21.6 万人在玩`),
    friendsLabel: t(msg`9 位好友冲榜`),
    updateNote: t(msg`极光赛道限时开放`),
    deckLabel: t(msg`冲榜推荐`),
    estimatedDuration: t(msg`2 分钟冲线`),
    rewardLabel: t(msg`冲榜星章 + 极光喷漆`),
    sessionObjective: t(msg`利用极光赛道的两段加速门，争取把本周圈速压进前 10%。`),
    tags: [t(msg`竞速`), t(msg`榜单`), t(msg`极光赛道`)],
  },
  {
    id: "cat-inn",
    name: t(msg`猫咖旅馆`),
    slogan: t(msg`给客人留灯，也给猫留一个能窝着的角落。`),
    description: t(msg`轻布置 + 轻剧情的休闲经营玩法，视觉柔和，适合放在移动端推荐流和近期回访位。`),
    studio: t(msg`窗边工作室`),
    badge: t(msg`治愈新游`),
    heroLabel: t(msg`治愈经营`),
    category: "relax",
    tone: "gold",
    playersLabel: t(msg`7.1 万人在玩`),
    friendsLabel: t(msg`4 位好友入住中`),
    updateNote: t(msg`春季家具套装上线`),
    deckLabel: t(msg`轻松治愈`),
    estimatedDuration: t(msg`6 分钟布置`),
    rewardLabel: t(msg`春季家具票 + 顾客好感`),
    sessionObjective: t(msg`把一楼休息区布置成春季主题，再接待今晚的第一批住客。`),
    tags: [t(msg`猫咪`), t(msg`布置`), t(msg`剧情`)],
  },
  {
    id: "forest-train",
    name: t(msg`星野列车`),
    slogan: t(msg`一边跑图一边收集乘客故事，适合慢慢玩。`),
    description: t(msg`把跑图、收集和碎片叙事拼到一条轻冒险旅线上，适合放进新游榜和编辑推荐。`),
    studio: t(msg`北岛像素`),
    badge: t(msg`编辑推荐`),
    heroLabel: t(msg`旅途叙事`),
    category: "relax",
    tone: "mint",
    playersLabel: t(msg`5.4 万人在玩`),
    friendsLabel: t(msg`3 位好友刚上车`),
    updateNote: t(msg`新增海边支线站点`),
    deckLabel: t(msg`故事感推荐`),
    estimatedDuration: t(msg`10 分钟一段旅程`),
    rewardLabel: t(msg`乘客故事碎片 + 海边车票`),
    sessionObjective: t(msg`本次旅程优先跑完海边支线，把新乘客的故事碎片补齐。`),
    tags: [t(msg`冒险`), t(msg`收集`), t(msg`剧情`)],
  },
  {
    id: "pixel-arena",
    name: t(msg`像素擂台`),
    slogan: t(msg`像素格斗越简单，朋友对打时越上头。`),
    description: t(msg`极简操作配合高反馈格斗节奏，很适合社交传播和短时间开黑，也是移动端社交排行的重要支点。`),
    studio: t(msg`格点工坊`),
    badge: t(msg`好友热玩`),
    heroLabel: t(msg`像素对打`),
    category: "party",
    tone: "violet",
    playersLabel: t(msg`13.8 万人在玩`),
    friendsLabel: t(msg`15 位好友组局`),
    updateNote: t(msg`双人同屏模式上线`),
    deckLabel: t(msg`社交热玩`),
    estimatedDuration: t(msg`4 分钟一场`),
    rewardLabel: t(msg`擂台连胜章 + 双人皮肤券`),
    sessionObjective: t(msg`先和好友打完一轮双人同屏，再冲一波 3 连胜奖励。`),
    tags: [t(msg`对打`), t(msg`同屏`), t(msg`组局`)],
  },
  {
    id: "yinjie-farm",
    name: t(msg`隐界农场`),
    slogan: t(msg`世界角色和你一起种地，连偷菜的都是熟人。`),
    description: t(msg`把 QQ 农场的小时级节奏搬进隐界世界。NPC 自治种植、自治串门、自治偷菜；好感度真的会变。每个角色都按自己的性格、专长在玩——你下线时也一样。`),
    studio: t(msg`隐界游戏实验室`),
    badge: t(msg`世界自治`),
    heroLabel: t(msg`小时级农场`),
    category: "strategy",
    tone: "forest",
    // 注意：playersLabel 不要和 badge 同字 ("世界自治")——卡片上 badge
    // 已经在左上角显示，playersLabel 又在底部出现一次会重复。其它游戏
    // 这里都是 "X 万人在玩" 这类数字面板；隐界农场没有真实玩家数，用
    // "NPC 在场" 表意更准、跟 badge 区分开。
    playersLabel: t(msg`NPC 自治在场`),
    friendsLabel: t(msg`全员 NPC`),
    updateNote: t(msg`首发 14 种作物 + 偷菜小道消息`),
    deckLabel: t(msg`世界经营`),
    estimatedDuration: t(msg`随时回收`),
    rewardLabel: t(msg`金币 + 经验 + 好感度`),
    sessionObjective: t(msg`先种两块成熟作物，再去隔壁串个门——记得看看谁夜里来过你家。`),
    tags: [t(msg`农场`), t(msg`偷菜`), t(msg`NPC自治`), t(msg`长线`)],
  },
  {
    id: "cloud-farm",
    name: t(msg`云上农场`),
    slogan: t(msg`种地、收菜、帮邻居浇水，节奏慢但黏性很强。`),
    description: t(msg`传统轻农场玩法经过重新包装，更适合作为长期留存游戏卡，负责撑起最近玩过和回流提醒。`),
    studio: t(msg`南风田野`),
    badge: t(msg`常驻长线`),
    heroLabel: t(msg`农场经营`),
    category: "strategy",
    tone: "forest",
    playersLabel: t(msg`10.3 万人在玩`),
    friendsLabel: t(msg`8 位好友互助`),
    updateNote: t(msg`本周开放花圃联营`),
    deckLabel: t(msg`稳定留存`),
    estimatedDuration: t(msg`5 分钟收菜`),
    rewardLabel: t(msg`花圃币 + 联营订单`),
    sessionObjective: t(msg`先收完成熟作物，再去邻居花圃里把本周联营订单补齐。`),
    tags: [t(msg`农场`), t(msg`互助`), t(msg`长线`)],
  },
  {
    id: "tank-war",
    name: t(msg`坦克大战`),
    slogan: t(msg`一辆小坦克，守护一个老巢。`),
    description: t(msg`经典 FC 像素动作完整复刻：35 关原版地图、4 种敌方坦克、7 种道具、4 级武器升级、支持桌面键盘双人本地对战。`),
    studio: t(msg`隐界游戏厅`),
    badge: t(msg`怀旧像素`),
    heroLabel: t(msg`即时动作`),
    category: "competitive",
    tone: "sunset",
    playersLabel: t(msg`单人 / 桌面双人`),
    friendsLabel: t(msg`和朋友肩并肩守基地`),
    updateNote: t(msg`FC 原版 35 关完整还原`),
    deckLabel: t(msg`复古像素`),
    estimatedDuration: t(msg`8-30 分钟一局`),
    rewardLabel: t(msg`通关解锁下一关 + 最高分`),
    sessionObjective: t(msg`守住基地，消灭 20 辆敌方坦克。`),
    tags: [t(msg`像素`), t(msg`动作`), t(msg`双人`), t(msg`怀旧`)],
  },
  {
    id: "island-concert",
    name: t(msg`岛屿演唱会`),
    slogan: t(msg`把舞台搭在海边，派对就会变得自然。`),
    description: t(msg`面向朋友聚会和表演互动设计，强调一起装扮舞台、合奏和打卡分享，适合活动位和聚会专题。`),
    studio: t(msg`浅海现场`),
    badge: t(msg`周末派对`),
    heroLabel: t(msg`海边派对`),
    category: "party",
    tone: "sunset",
    playersLabel: t(msg`8.8 万人在玩`),
    friendsLabel: t(msg`11 位好友准备开场`),
    updateNote: t(msg`海风主题舞台返场`),
    deckLabel: t(msg`派对推荐`),
    estimatedDuration: t(msg`7 分钟一场演出`),
    rewardLabel: t(msg`舞台海报 + 合奏积分`),
    sessionObjective: t(msg`今晚先排一场海边合奏，把返场舞台的限定海报拿到手。`),
    tags: [t(msg`派对`), t(msg`装扮`), t(msg`合奏`)],
  },
];

export const gameCenterFeaturedGameIds = [
  "yinjie-farm",
  "parking-war",
  "signal-squad",
  "night-market",
  "sky-rally",
];

export const gameCenterShelves: GameCenterShelf[] = [
  {
    id: "recommended",
    title: t(msg`为你推荐`),
    description: t(msg`按微信游戏中心的节奏，优先摆主推、社交热玩和可回访内容。`),
    gameIds: ["signal-squad", "night-market", "cat-inn", "forest-train"],
  },
  {
    id: "friends",
    title: t(msg`好友热玩`),
    description: t(msg`更强调一起玩和容易转发的项目。`),
    gameIds: ["pixel-arena", "signal-squad", "island-concert"],
  },
  {
    id: "easy-return",
    title: t(msg`适合碎片时间继续`),
    description: t(msg`放可以随时返回、继续经营或推进的项目。`),
    gameIds: ["yinjie-farm", "cloud-farm", "night-market", "cat-inn"],
  },
];

export const gameCenterHotRankings: GameCenterRankingEntry[] = [
  {
    rank: 1,
    gameId: "sky-rally",
    note: t(msg`极光赛道带动本周冲榜热度。`),
  },
  {
    rank: 2,
    gameId: "signal-squad",
    note: t(msg`赛季任务更新后，小队匹配显著升温。`),
  },
  {
    rank: 3,
    gameId: "pixel-arena",
    note: t(msg`双人同屏模式让社交传播继续放大。`),
  },
  {
    rank: 4,
    gameId: "cloud-farm",
    note: t(msg`花圃联营开放后回访稳定增长。`),
  },
];

export const gameCenterNewRankings: GameCenterRankingEntry[] = [
  {
    rank: 1,
    gameId: "tank-war",
    note: t(msg`FC 经典 35 关像素级完整复刻，桌面双人键位首发。`),
  },
  {
    rank: 2,
    gameId: "cat-inn",
    note: t(msg`治愈感和布置玩法带动收藏率。`),
  },
  {
    rank: 3,
    gameId: "forest-train",
    note: t(msg`支线站点更新后回访率提升。`),
  },
  {
    rank: 4,
    gameId: "island-concert",
    note: t(msg`周末派对活动带来新一轮曝光。`),
  },
];

export const gameCenterFriendActivities: GameCenterFriendActivity[] = [
  {
    id: "activity-lin",
    friendName: t(msg`林树`),
    gameId: "signal-squad",
    status: t(msg`刚打完一局晋级赛，正在拉人补位。`),
    updatedAt: "2026-04-10T14:18:00.000Z",
  },
  {
    id: "activity-an",
    friendName: t(msg`安澜`),
    gameId: "night-market",
    status: t(msg`夜市摊位升到 5 级，刚开了新的甜品档。`),
    updatedAt: "2026-04-10T12:36:00.000Z",
  },
  {
    id: "activity-lu",
    friendName: t(msg`陆回`),
    gameId: "pixel-arena",
    status: t(msg`在约人打双人同屏，已经连胜 6 场。`),
    updatedAt: "2026-04-10T11:22:00.000Z",
  },
  {
    id: "activity-yan",
    friendName: t(msg`言初`),
    gameId: "cat-inn",
    status: t(msg`刚把春季家具摆完，准备截图发朋友圈。`),
    updatedAt: "2026-04-10T09:58:00.000Z",
  },
];

export const gameCenterEvents: GameCenterEvent[] = [
  {
    id: "season-signal",
    title: t(msg`信号小队 S2 赛季开启`),
    description: t(msg`完成周任务可解锁全队共享外观和回放徽章。`),
    meta: t(msg`今天 20:00 开始`),
    ctaLabel: t(msg`去做任务`),
    relatedGameId: "signal-squad",
    actionKind: "mission",
    tone: "forest",
  },
  {
    id: "market-night",
    title: t(msg`夜市合伙人周末客流翻倍`),
    description: t(msg`指定时段营业收益翻倍，适合回流和好友互访。`),
    meta: t(msg`周五 - 周日`),
    ctaLabel: t(msg`预约提醒`),
    relatedGameId: "night-market",
    actionKind: "reminder",
    tone: "sunset",
  },
  {
    id: "concert-island",
    title: t(msg`岛屿演唱会海风舞台返场`),
    description: t(msg`邀请两位好友合奏可解锁限定海报。`),
    meta: t(msg`限时 3 天`),
    ctaLabel: t(msg`立即参加`),
    relatedGameId: "island-concert",
    actionKind: "join",
    tone: "gold",
  },
];

export const gameCenterToneStyles: Record<GameCenterTone, GameCenterToneStyle> = {
  forest: {
    badgeClassName:
      "border-[rgba(47,122,63,0.14)] bg-[rgba(244,252,247,0.92)] text-[#2f7a3f]",
    heroCardClassName:
      "bg-[linear-gradient(135deg,#214c33_0%,#2f7a3f_40%,#77b667_100%)] text-white",
    iconClassName: "bg-[rgba(47,122,63,0.14)] text-[#2f7a3f]",
    mutedPanelClassName:
      "border-[rgba(47,122,63,0.12)] bg-[linear-gradient(180deg,rgba(245,252,247,0.98),rgba(255,255,255,0.94))]",
    softTextClassName: "text-[#2f7a3f]",
  },
  gold: {
    badgeClassName:
      "border-[rgba(180,123,23,0.14)] bg-[rgba(255,249,235,0.92)] text-[#b47b17]",
    heroCardClassName:
      "bg-[linear-gradient(135deg,#5c4015_0%,#c78b23_48%,#f2c15b_100%)] text-white",
    iconClassName: "bg-[rgba(180,123,23,0.14)] text-[#b47b17]",
    mutedPanelClassName:
      "border-[rgba(180,123,23,0.12)] bg-[linear-gradient(180deg,rgba(255,250,239,0.98),rgba(255,255,255,0.94))]",
    softTextClassName: "text-[#b47b17]",
  },
  ocean: {
    badgeClassName:
      "border-[rgba(39,111,197,0.14)] bg-[rgba(240,247,255,0.92)] text-[#276fc5]",
    heroCardClassName:
      "bg-[linear-gradient(135deg,#123764_0%,#276fc5_46%,#63b4f4_100%)] text-white",
    iconClassName: "bg-[rgba(39,111,197,0.14)] text-[#276fc5]",
    mutedPanelClassName:
      "border-[rgba(39,111,197,0.12)] bg-[linear-gradient(180deg,rgba(241,247,255,0.98),rgba(255,255,255,0.94))]",
    softTextClassName: "text-[#276fc5]",
  },
  violet: {
    badgeClassName:
      "border-[rgba(121,82,179,0.14)] bg-[rgba(246,241,255,0.92)] text-[#7952b3]",
    heroCardClassName:
      "bg-[linear-gradient(135deg,#352050_0%,#7952b3_46%,#b38cff_100%)] text-white",
    iconClassName: "bg-[rgba(121,82,179,0.14)] text-[#7952b3]",
    mutedPanelClassName:
      "border-[rgba(121,82,179,0.12)] bg-[linear-gradient(180deg,rgba(246,243,255,0.98),rgba(255,255,255,0.94))]",
    softTextClassName: "text-[#7952b3]",
  },
  sunset: {
    badgeClassName:
      "border-[rgba(214,94,47,0.14)] bg-[rgba(255,244,239,0.92)] text-[#d65e2f]",
    heroCardClassName:
      "bg-[linear-gradient(135deg,#6b2b18_0%,#d65e2f_48%,#f8a65c_100%)] text-white",
    iconClassName: "bg-[rgba(214,94,47,0.14)] text-[#d65e2f]",
    mutedPanelClassName:
      "border-[rgba(214,94,47,0.12)] bg-[linear-gradient(180deg,rgba(255,245,240,0.98),rgba(255,255,255,0.94))]",
    softTextClassName: "text-[#d65e2f]",
  },
  mint: {
    badgeClassName:
      "border-[rgba(15,123,117,0.14)] bg-[rgba(238,251,249,0.92)] text-[#0f7b75]",
    heroCardClassName:
      "bg-[linear-gradient(135deg,#0d3a39_0%,#0f7b75_44%,#6bd8c7_100%)] text-white",
    iconClassName: "bg-[rgba(15,123,117,0.14)] text-[#0f7b75]",
    mutedPanelClassName:
      "border-[rgba(15,123,117,0.12)] bg-[linear-gradient(180deg,rgba(239,251,249,0.98),rgba(255,255,255,0.94))]",
    softTextClassName: "text-[#0f7b75]",
  },
};

const gameCenterGameMap = new Map(
  gameCenterGames.map((game) => [game.id, game] as const),
);

export function getGameCenterGame(gameId: string) {
  return gameCenterGameMap.get(gameId) ?? null;
}

export function getGameCenterToneStyle(tone: GameCenterTone) {
  return gameCenterToneStyles[tone];
}

export function getGameCenterEventStatusLabel(event: GameCenterEvent) {
  switch (event.actionKind) {
    case "mission":
      return t(msg`任务中`);
    case "reminder":
      return t(msg`已预约`);
    case "join":
      return t(msg`已参加`);
  }
}

export function getGameCenterEventActionLabel(
  event: GameCenterEvent,
  engaged: boolean,
) {
  if (!engaged) {
    return event.ctaLabel;
  }

  return getGameCenterEventStatusLabel(event);
}
