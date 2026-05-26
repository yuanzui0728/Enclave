/**
 * 分身相遇（Cyber-Avatar Encounter）客户端契约。
 *
 * 这是 App 第一个真正的跨用户功能：用户点一次「相遇」，cloud-api 按分身兼容性
 * 从全体已开启社交的用户里挑一个真实用户，由发起方 world 用双方分身画像生成一段
 * 对话脚本。双方都选「想要」才互相披露资料里的真实联系方式。
 *
 * 这些类型由前端（apps/app）和 cloud-api 共享。world↔cloud 的内部快照/脚本
 * DTO 不在这里（world api 不依赖 @yinjie/contracts），各自在后端内部定义。
 */

export type AvatarEncounterDecision = "want" | "skip";

export type AvatarEncounterContactKind = "wechat" | "phone" | "other";

export type AvatarEncounterStatus =
  | "generating"
  | "awaiting_initiator"
  | "awaiting_recipient"
  | "matched"
  | "closed_initiator_skipped"
  | "closed_recipient_skipped"
  | "failed";

/**
 * 一轮对话。speaker 是**相对查看者**的视角：`mine` = 查看者自己的分身，
 * `theirs` = 对方分身。后端按请求者身份翻译 initiator/recipient → mine/theirs。
 */
export interface AvatarEncounterTurn {
  speaker: "mine" | "theirs";
  text: string;
}

export interface AvatarEncounterTranscript {
  summary: string;
  turns: AvatarEncounterTurn[];
}

/** matched 之前对方始终匿名：只给昵称 + 画像简介 + 匹配理由，绝不含真名/头像/联系方式。 */
export interface AvatarEncounterPartner {
  nickname: string;
  personaBlurb: string;
  matchReason: string;
}

/** 仅在 status==='matched' 时由 cloud-api 从冻结快照披露，全程不经 LLM。 */
export interface AvatarEncounterContact {
  kind: AvatarEncounterContactKind;
  value: string;
}

/** POST /cloud/social/avatar-encounters 的返回（发起方扣 1 次额度后立即围观脚本）。 */
export interface AvatarEncounterSession {
  id: string;
  status: AvatarEncounterStatus;
  partner: AvatarEncounterPartner;
  transcript: AvatarEncounterTranscript;
  remainingCredits: number;
  dailyLimit: number;
}

/** GET /cloud/social/avatar-encounters/:id 的返回（发起方或被匹配方视角）。 */
export interface AvatarEncounterView {
  id: string;
  status: AvatarEncounterStatus;
  role: "initiator" | "recipient";
  partner: AvatarEncounterPartner;
  transcript: AvatarEncounterTranscript;
  myDecision: AvatarEncounterDecision | null;
  partnerDecided: boolean;
  contact: AvatarEncounterContact | null;
  createdAt: string;
}

export interface DecideAvatarEncounterRequest {
  decision: AvatarEncounterDecision;
}

/** POST /cloud/social/avatar-encounters/:id/decision 的返回。 */
export interface AvatarEncounterDecisionResult {
  id: string;
  status: AvatarEncounterStatus;
  /** 双方都 want（matched）后才非空。 */
  contact: AvatarEncounterContact | null;
}

/** 「收到的相遇」收件箱条目（被别人发起、等我决策的相遇）。 */
export interface AvatarEncounterInboxItem {
  id: string;
  partnerNickname: string;
  matchReason: string;
  summary: string;
  status: AvatarEncounterStatus;
  createdAt: string;
}

export interface AvatarEncounterInboxResponse {
  items: AvatarEncounterInboxItem[];
  nextCursor: string | null;
}

/** GET /cloud/social/avatar-encounters/overview：日额度 + opt-in + 是否已填联系方式。 */
export interface AvatarEncounterOverview {
  remainingCredits: number;
  dailyLimit: number;
  optedIn: boolean;
  hasContactField: boolean;
  planCode: string | null;
}

export interface UpdateAvatarEncounterSettingsRequest {
  optedIn: boolean;
}

export interface AvatarEncounterSettings {
  optedIn: boolean;
}
