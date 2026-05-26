// 隐界 · Wiki 自然语言造游戏 / 一键复刻 / 上架游戏板块 的共享契约。
//
// 设计要点：
// - 玩家在 wiki 上用自然语言描述 → AI 直接产出一个「自包含单 HTML 文件」可玩游戏
//   （内联 CSS/JS，零外部网络依赖）。这个产物 + 设计 spec + 对话历史 + 复刻血缘
//   统一封装成 WikiGameArtifact，并像角色 revision 一样版本化存储。
// - wiki 是创作 source of truth；发布时把最新 revision 推到 cloud-api 全局板块，
//   隐界 App 从那里拉取在沙箱 iframe 里运行。
// - 游戏内通过 window.YinjieGame.askCharacter() 调玩家世界里的 AI 角色当陪玩。

import type {
  GameCenterCategoryId,
  GameCenterTone,
  GameProductionKind,
  GamePublisherKind,
  GameRuntimeMode,
} from "./games";

/** 单文件 HTML 游戏产物的 schema 版本。结构演进时 bump，便于老 revision 迁移。 */
export type WikiGameArtifactSchemaVersion = 1;

/** AI 产出 / 用户编辑的「游戏设计说明书」。纯自然语言，用于展示与再生成上下文。 */
export interface WikiGameSpec {
  /** 游戏名（也作为发布到板块时的展示名兜底）。 */
  title: string;
  /** 一句话卖点。 */
  pitch: string;
  /** 类型，如「躲避 / 益智 / 回合对战 / 文字冒险」。 */
  genre: string;
  /** 玩法规则（散文描述）。 */
  rules: string;
  /** 操作方式（键盘 / 点击 / 触屏）。 */
  controls: string;
  /** 胜负 / 结束条件。 */
  winLose: string;
}

/** 造游戏对话里的一轮（类似 Claude Code 的回合日志），用于展示 + 迭代上下文。 */
export interface WikiGameConversationTurn {
  role: "user" | "assistant";
  /** user：本轮自然语言指令；assistant：本轮改动的简述。 */
  text: string;
  /** 该轮关联的 revision 版本号（assistant 轮）。 */
  version?: number;
  at?: string;
}

/** 产物的体积 / 安全元数据。 */
export interface WikiGameArtifactMeta {
  /** html 字节数（UTF-8）。 */
  estimatedBytes: number;
  /**
   * validateGameHtml 标记：是否检测到外部引用（`<script src>` / `fetch` / CDN /
   * 外链）。硬违规（script src / fetch）在生成阶段已拒；软违规（字体 / 图片外链）
   * 置 true 并在 UI 警告。
   */
  hasExternalRefs: boolean;
  /** 生成该产物的模型标识（便于排查 / 统计）。 */
  generatedModel?: string | null;
  /** 是否疑似被 max_tokens 截断（无闭合 </html>）。 */
  truncated?: boolean;
}

/** 版本化的游戏产物：HTML 本体 + 设计 spec + 原始 prompt + 对话历史 + 元数据。 */
export interface WikiGameArtifact {
  schemaVersion: WikiGameArtifactSchemaVersion;
  spec: WikiGameSpec;
  /** 用户最初的自然语言种子 prompt。 */
  prompt: string;
  conversation: WikiGameConversationTurn[];
  /** 自包含单 HTML 文件（内联 CSS/JS）。 */
  html: string;
  meta: WikiGameArtifactMeta;
}

export type WikiGameVisibility = "private" | "public";

export type WikiGameRevisionChangeSource =
  | "ai_create"
  | "ai_refine"
  | "manual_edit"
  | "clone";

/** 列表卡用的轻量摘要（不含 html / 大字段）。 */
export interface WikiGameSummary {
  gameId: string;
  title: string;
  pitch: string;
  genre: string;
  visibility: WikiGameVisibility;
  ownerUserId: string;
  /** 公开画廊展示作者名。 */
  authorDisplayName?: string | null;
  forkedFromGameId?: string | null;
  /** 已发布到隐界板块的 catalog id（null = 未发布）。 */
  publishedCatalogGameId?: string | null;
  publishedVersion?: number | null;
  lastPublishedAt?: string | null;
  latestVersion: number;
  updatedAt: string;
  createdAt: string;
}

/** 详情 / 编辑视图：含当前 revision 的完整产物。 */
export interface WikiGameView extends WikiGameSummary {
  /** 当前展示 / 编辑的 revision 版本号。 */
  version: number;
  revisionId: string;
  artifact: WikiGameArtifact;
  /** 是否为当前登录用户所有（决定能否编辑 / 发布）。 */
  isOwner: boolean;
}

/** 历史 revision 摘要（不含 html）。 */
export interface WikiGameRevisionSummary {
  revisionId: string;
  version: number;
  instruction: string;
  changeSource: WikiGameRevisionChangeSource;
  createdAt: string;
}

/** AI 生成任务的轮询视图（专用于游戏，不复用角色 job）。 */
export type WikiGameJobStatus = "generating" | "ready" | "failed";

export interface WikiGameJobView {
  id: string;
  status: WikiGameJobStatus;
  /** ready 时指向产物所在的 game + revision，前端据此 navigate。 */
  gameId: string | null;
  revisionId: string | null;
  version: number | null;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
}

/** 入队 AI 任务后的即时返回。 */
export interface WikiGameJobEnqueueResult {
  jobId: string;
  status: "generating";
}

/** wiki 发布动作交给 cloud-api 全局板块的 payload。 */
export interface WikiGamePublishPayload {
  proposedGameId: string;
  name: string;
  slogan: string;
  description: string;
  category: GameCenterCategoryId;
  tone: GameCenterTone;
  tags: string[];
  publisherKind: GamePublisherKind; // "wiki_user"
  productionKind: GameProductionKind; // "ai_generated"
  runtimeMode: GameRuntimeMode; // "embedded_web"
  authorWikiUserId: string;
  authorDisplayName: string;
  sourceWikiGameId: string;
  sourceRevisionId: string;
  clonedFromGameId?: string | null;
  version: number;
  /** 自包含 HTML 本体 + 完整性校验。 */
  artifact: {
    artifactKind: "inline_html";
    html: string;
    htmlSha256: string;
    htmlByteSize: number;
    spec: WikiGameSpec;
    generatorModel?: string | null;
  };
}

/** wiki publish 端点的返回。 */
export interface WikiGamePublishResult {
  gameId: string;
  publishedCatalogGameId: string;
  publishedVersion: number;
  /** cloud-api 全局板块同步是否成功（失败则置 pending 后台重试）。 */
  boardSynced: boolean;
}

/** App / cloud-api 取产物的响应体（用于沙箱 iframe srcdoc）。 */
export interface CommunityGameArtifactContent {
  gameId: string;
  version: number;
  artifactKind: "inline_html";
  html: string;
  htmlSha256: string;
}
