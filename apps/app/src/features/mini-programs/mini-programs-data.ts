export type MiniProgramTone = "jade" | "amber" | "ocean" | "rose" | "slate";

export type MiniProgramCategoryId =
  | "all"
  | "efficiency"
  | "social"
  | "content"
  | "lifestyle"
  | "tools";

export type MiniProgramEntry = {
  id: string;
  name: string;
  slogan: string;
  description: string;
  developer: string;
  badge: string;
  heroLabel: string;
  category: Exclude<MiniProgramCategoryId, "all">;
  tone: MiniProgramTone;
  usersLabel: string;
  serviceLabel: string;
  updateNote: string;
  deckLabel: string;
  openHint: string;
  tags: string[];
};

export type MiniProgramShelf = {
  id: string;
  title: string;
  description: string;
  miniProgramIds: string[];
};

export type MiniProgramCampaign = {
  id: string;
  title: string;
  description: string;
  meta: string;
  ctaLabel: string;
  tone: MiniProgramTone;
};

export type MiniProgramToneStyle = {
  badgeClassName: string;
  heroCardClassName: string;
  iconClassName: string;
  mutedPanelClassName: string;
  softTextClassName: string;
};

export const miniProgramCategoryTabs: Array<{
  id: MiniProgramCategoryId;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "全部",
    description: "按微信式小程序面板节奏，把最近使用、我的小程序和推荐内容放在一起浏览。",
  },
  {
    id: "efficiency",
    label: "效率",
    description: "偏任务、笔记、日程和稍后处理。",
  },
  {
    id: "social",
    label: "社交",
    description: "偏报名、接龙、群协作和关系流转。",
  },
  {
    id: "content",
    label: "内容",
    description: "偏创作、分发、沉淀和内容协同。",
  },
  {
    id: "lifestyle",
    label: "生活",
    description: "偏办事、地图、活动和居民服务。",
  },
  {
    id: "tools",
    label: "工具",
    description: "偏文件、整理、临时处理和效率外挂。",
  },
];

export const miniProgramEntries: MiniProgramEntry[] = [
  {
    id: "schedule-assistant",
    name: "日程管家",
    slogan: "把聊天里说过的安排，拎成今天真的要做的事。",
    description:
      "从聊天、群聊和提醒里抽出今天要执行的任务，适合放在最近使用和我的小程序里常驻。",
    developer: "隐界效率实验室",
    badge: "最近常用",
    heroLabel: "今日安排",
    category: "efficiency",
    tone: "jade",
    usersLabel: "今天 6 项待办",
    serviceLabel: "3 条提醒待确认",
    updateNote: "已同步今天下午的聊天安排",
    deckLabel: "安排与提醒",
    openHint: "打开后会先落在今日时间轴，方便继续处理刚才没做完的事。",
    tags: ["待办", "提醒", "时间轴"],
  },
  {
    id: "group-relay",
    name: "群接龙",
    slogan: "像微信接龙一样，把收集、报名和确认做轻。",
    description:
      "适合群聊里快速发起接龙、收集名单和做状态回填，桌面端更适合边聊天边看结果。",
    developer: "社交协同组",
    badge: "群聊高频",
    heroLabel: "快速收集",
    category: "social",
    tone: "amber",
    usersLabel: "4 个接龙进行中",
    serviceLabel: "18 人待确认",
    updateNote: "新增长按转群公告入口",
    deckLabel: "群协作",
    openHint: "继续使用会回到最近那个接龙，优先展示未确认成员。",
    tags: ["接龙", "报名", "群工具"],
  },
  {
    id: "file-drop",
    name: "文件快传",
    slogan: "把聊天附件先放进一个顺手的临时抽屉。",
    description:
      "适合把聊天里的文件、图片和草稿暂存到一个轻量中转面板，桌面端的价值尤其明显。",
    developer: "桌面体验组",
    badge: "桌面常驻",
    heroLabel: "附件中转",
    category: "tools",
    tone: "ocean",
    usersLabel: "最近暂存 12 项",
    serviceLabel: "4 个文件待整理",
    updateNote: "新增最近发送会话提示",
    deckLabel: "文件工具",
    openHint: "打开后会先定位最近暂存文件，便于继续发送或归档。",
    tags: ["文件", "图片", "中转"],
  },
  {
    id: "world-map",
    name: "世界地图",
    slogan: "把地点、居民和活动放回同一张图上看。",
    description:
      "适合在世界内查看地点分布、最近活动和角色出现区域，移动端更适合轻浏览，桌面端适合长期悬停。",
    developer: "世界编辑部",
    badge: "发现推荐",
    heroLabel: "空间浏览",
    category: "lifestyle",
    tone: "slate",
    usersLabel: "8 个地点更新",
    serviceLabel: "2 场活动待查看",
    updateNote: "新增咖啡馆与公园热点提示",
    deckLabel: "地图服务",
    openHint: "继续使用会优先展开上次浏览的区域和地点卡片。",
    tags: ["地图", "地点", "活动"],
  },
  {
    id: "idea-notes",
    name: "灵感速记",
    slogan: "一句话、一张图，也能先留住。",
    description:
      "面向聊天中临时冒出的灵感片段，适合和桌面笔记、内容工作流配合，先快速记，再慢慢整理。",
    developer: "内容引擎组",
    badge: "内容常用",
    heroLabel: "轻记录",
    category: "content",
    tone: "rose",
    usersLabel: "本周 21 条灵感",
    serviceLabel: "5 条待整理",
    updateNote: "新增图片备注与标签",
    deckLabel: "灵感收集",
    openHint: "打开后优先展示未整理草稿，方便继续补全。",
    tags: ["笔记", "草稿", "标签"],
  },
  {
    id: "live-clips",
    name: "直播剪贴板",
    slogan: "把直播里的重点片段，切得像工作流一样顺手。",
    description:
      "适合视频号和直播内容整理，先把直播片段、时间点和要点摘出来，后续再进入正式剪辑。",
    developer: "视频号工具组",
    badge: "内容运营",
    heroLabel: "直播整理",
    category: "content",
    tone: "amber",
    usersLabel: "7 段片段待处理",
    serviceLabel: "2 个直播待整理",
    updateNote: "新增直播重点时间轴",
    deckLabel: "直播协同",
    openHint: "继续使用会回到最近直播的片段时间轴。",
    tags: ["直播", "片段", "剪辑"],
  },
  {
    id: "resident-services",
    name: "居民办事",
    slogan: "把世界里的办事流程做成一个统一入口。",
    description:
      "集中承接报名、申请、生活服务和状态查询，移动端适合随手办，桌面端适合查全量记录。",
    developer: "居民服务台",
    badge: "生活服务",
    heroLabel: "统一入口",
    category: "lifestyle",
    tone: "jade",
    usersLabel: "3 项办理中",
    serviceLabel: "2 条结果待查看",
    updateNote: "新增申请结果回查",
    deckLabel: "服务入口",
    openHint: "打开后会先显示办理中的事项和最新回执。",
    tags: ["办事", "申请", "服务"],
  },
  {
    id: "event-board",
    name: "活动报名",
    slogan: "活动、打卡、报名和回执，放进同一块面板里。",
    description:
      "适合活动运营和社交报名，把发起、收集、提醒和回执压缩成一个微信式小程序入口。",
    developer: "活动运营台",
    badge: "热门工具",
    heroLabel: "报名与回执",
    category: "social",
    tone: "ocean",
    usersLabel: "本周 9 场活动",
    serviceLabel: "28 人已报名",
    updateNote: "新增报名后自动回执",
    deckLabel: "活动协作",
    openHint: "继续使用会优先打开最近的报名面板。",
    tags: ["报名", "活动", "回执"],
  },
  {
    id: "read-later",
    name: "稍后再看",
    slogan: "把文章、动态和聊天链接先收进一个队列里。",
    description:
      "适合把公众号文章、广场动态和聊天中的链接先收口，等到有时间再统一处理。",
    developer: "阅读工具组",
    badge: "回访入口",
    heroLabel: "内容队列",
    category: "efficiency",
    tone: "slate",
    usersLabel: "积压 14 条内容",
    serviceLabel: "4 条今日新增",
    updateNote: "新增按来源筛选",
    deckLabel: "阅读整理",
    openHint: "打开后默认回到未读队列，优先处理今天新增的内容。",
    tags: ["阅读", "收藏", "队列"],
  },
  {
    id: "photo-wall",
    name: "世界相册",
    slogan: "把聊天图片、朋友圈和活动图，一次看全。",
    description:
      "更适合作为桌面端的整理工作区，也能在手机上作为最近回看的轻入口。",
    developer: "影像工作室",
    badge: "整理推荐",
    heroLabel: "图片归档",
    category: "tools",
    tone: "rose",
    usersLabel: "最近归档 86 张",
    serviceLabel: "3 本相册待整理",
    updateNote: "新增聊天来源筛选",
    deckLabel: "相册工具",
    openHint: "继续使用会先展示最近回看过的相册分组。",
    tags: ["图片", "相册", "整理"],
  },
];

export const featuredMiniProgramIds = [
  "schedule-assistant",
  "group-relay",
  "resident-services",
];

export const miniProgramShelves: MiniProgramShelf[] = [
  {
    id: "recommended",
    title: "为你推荐",
    description: "优先放高频回访、当前场景顺手能接上的小程序。",
    miniProgramIds: [
      "schedule-assistant",
      "file-drop",
      "resident-services",
      "read-later",
    ],
  },
  {
    id: "collaboration",
    title: "群聊协作",
    description: "更适合从聊天和群聊里直接拉起的轻工具。",
    miniProgramIds: ["group-relay", "event-board", "file-drop"],
  },
  {
    id: "creator",
    title: "内容整理",
    description: "把灵感、直播片段、图片和后续处理放到一条工作链里。",
    miniProgramIds: ["idea-notes", "live-clips", "photo-wall", "read-later"],
  },
];

export const miniProgramCampaigns: MiniProgramCampaign[] = [
  {
    id: "spring-efficiency",
    title: "本周效率专题",
    description: "把聊天里的安排、链接和文件都收口到最近使用里，减少二次翻找。",
    meta: "适合桌面连续工作",
    ctaLabel: "查看专题",
    tone: "jade",
  },
  {
    id: "group-tools",
    title: "群聊轻工具上新",
    description: "接龙、报名、文件中转这三类工具最接近微信高频工作流，首版优先承接。",
    meta: "重点放进我的小程序",
    ctaLabel: "添加常用",
    tone: "amber",
  },
  {
    id: "discover-life",
    title: "发现页生活入口",
    description: "移动端从发现进入后，优先给办事、地图和活动这类轻办事型小程序。",
    meta: "更贴近微信发现节奏",
    ctaLabel: "查看入口",
    tone: "ocean",
  },
];

export function getMiniProgramEntry(id: string) {
  return miniProgramEntries.find((item) => item.id === id);
}

export function resolveMiniProgramEntries(ids: string[]) {
  return ids
    .map((id) => getMiniProgramEntry(id))
    .filter((item): item is MiniProgramEntry => Boolean(item));
}

export function getMiniProgramToneStyle(
  tone: MiniProgramTone,
): MiniProgramToneStyle {
  switch (tone) {
    case "jade":
      return {
        badgeClassName:
          "border-[rgba(47,122,63,0.18)] bg-[rgba(244,252,247,0.94)] text-[#2f7a3f]",
        heroCardClassName:
          "bg-[linear-gradient(135deg,#2f7a3f_0%,#4ea96f_45%,#d9f5df_120%)] text-white",
        iconClassName: "bg-[rgba(47,122,63,0.12)] text-[#2f7a3f]",
        mutedPanelClassName:
          "border-[rgba(47,122,63,0.16)] bg-[rgba(241,251,244,0.92)]",
        softTextClassName: "text-[#2f7a3f]",
      };
    case "amber":
      return {
        badgeClassName:
          "border-[rgba(255,138,61,0.18)] bg-[rgba(255,244,233,0.94)] text-[#e16d1f]",
        heroCardClassName:
          "bg-[linear-gradient(135deg,#d56c18_0%,#ff9c42_45%,#ffe0bf_120%)] text-white",
        iconClassName: "bg-[rgba(255,138,61,0.12)] text-[#e16d1f]",
        mutedPanelClassName:
          "border-[rgba(255,138,61,0.16)] bg-[rgba(255,247,238,0.92)]",
        softTextClassName: "text-[#d56c18]",
      };
    case "ocean":
      return {
        badgeClassName:
          "border-[rgba(57,108,196,0.18)] bg-[rgba(236,243,255,0.94)] text-[#396cc4]",
        heroCardClassName:
          "bg-[linear-gradient(135deg,#285aa8_0%,#4f8ff7_45%,#dceaff_120%)] text-white",
        iconClassName: "bg-[rgba(57,108,196,0.12)] text-[#396cc4]",
        mutedPanelClassName:
          "border-[rgba(57,108,196,0.16)] bg-[rgba(239,245,255,0.92)]",
        softTextClassName: "text-[#396cc4]",
      };
    case "rose":
      return {
        badgeClassName:
          "border-[rgba(206,79,112,0.18)] bg-[rgba(255,239,244,0.94)] text-[#c14368]",
        heroCardClassName:
          "bg-[linear-gradient(135deg,#b23b5e_0%,#d86d8c_45%,#ffe1eb_120%)] text-white",
        iconClassName: "bg-[rgba(206,79,112,0.12)] text-[#c14368]",
        mutedPanelClassName:
          "border-[rgba(206,79,112,0.16)] bg-[rgba(255,241,245,0.92)]",
        softTextClassName: "text-[#c14368]",
      };
    case "slate":
    default:
      return {
        badgeClassName:
          "border-[rgba(71,85,105,0.16)] bg-[rgba(241,245,249,0.94)] text-[#475569]",
        heroCardClassName:
          "bg-[linear-gradient(135deg,#344256_0%,#5f748f_45%,#e3ebf5_120%)] text-white",
        iconClassName: "bg-[rgba(71,85,105,0.12)] text-[#475569]",
        mutedPanelClassName:
          "border-[rgba(71,85,105,0.16)] bg-[rgba(243,247,251,0.94)]",
        softTextClassName: "text-[#475569]",
      };
  }
}
