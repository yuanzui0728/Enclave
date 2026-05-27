import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorldOwner } from "@yinjie/contracts";
import defaultOwnerAvatar from "../assets/default-owner-avatar.svg";
import { createSessionStateStorage } from "../runtime/session-storage";

// 分身相遇的「联系方式」也走 world owner profile（不在 cloud-api 上），
// 跟 signature 同款用空串当 default：profile-info-page 的「contact?.trim() ||
// 未填写」靠空串区分「真没填」与「填了一段空白」。contactKind 默认 "wechat"
// （联系方式编辑页若不带 kind 选择器就落这个），保持 contracts 的 union 收窄。
type WorldOwnerContactKind = "wechat" | "phone" | "other";
// 个人资料里的性别：空串 = 未填（沿用 signature/contact 的空串约定）。
type WorldOwnerGender = "male" | "female" | "other" | "";

type WorldOwnerState = {
  id: string | null;
  username: string | null;
  onboardingCompleted: boolean;
  avatar: string;
  signature: string;
  contact: string;
  contactKind: WorldOwnerContactKind;
  // 分身相遇 opt-in：world owner 列是唯一真源（cloud-api 撮合池由 world 推快照同步）。
  encounterOptedIn: boolean;
  // 个人资料：注入 AI prompt 的结构化信息。空串/null = 未填。
  gender: WorldOwnerGender;
  age: number | null;
  occupation: string;
  region: string;
  interests: string;
  aiAddressTone: string;
  avoidTopics: string;
  hasCustomApiKey: boolean;
  customApiBase: string | null;
  createdAt: string | null;
  hydrateOwner: (owner: WorldOwner) => void;
  updateOwner: (input: {
    username?: string;
    avatar?: string;
    signature?: string;
    contact?: string;
    contactKind?: WorldOwnerContactKind;
    encounterOptedIn?: boolean;
    onboardingCompleted?: boolean;
    hasCustomApiKey?: boolean;
    customApiBase?: string | null;
  }) => void;
  updateProfile: (input: {
    username?: string;
    avatar?: string;
    signature?: string;
    contact?: string;
    contactKind?: WorldOwnerContactKind;
    encounterOptedIn?: boolean;
  }) => void;
  logout: () => void;
  clearOwner: () => void;
};

const defaultAvatar = defaultOwnerAvatar;
// signature 一开始是「在现实之外，进入另一片世界。」这种诗意 placeholder，
// 但它直接占用 state.signature 字段，下游 profile-page / profile-info-page
// 「signature?.trim() || 兜底」逻辑会把它当成「用户已经填了签名」展示出去 —
// 在新用户 cold start、welcome 还没 hydrate API 那一小段时间，「我」页面就
// 给人看到一行根本不是用户写的诗。把 state 用空字符串当 default，需要诗意
// 兜底的页面（如 desktop-message-avatar-popover）自己在 render 层提供 fallback。
const DEFAULT_SIGNATURE = "";
const DEFAULT_CONTACT = "";
const DEFAULT_CONTACT_KIND: WorldOwnerContactKind = "wechat";
// 默认进池（产品决策：默认开启可关）。
const DEFAULT_ENCOUNTER_OPTED_IN = true;
// 个人资料字段的空态：登出 / 清户时必须一并重置，否则共用设备上一个账号的资料
// 会残留进下一个账号（跨账号泄漏）。三处 reset（initial / logout / clearOwner）共用。
const DEFAULT_PROFILE_FIELDS = {
  gender: "" as WorldOwnerGender,
  age: null as number | null,
  occupation: "",
  region: "",
  interests: "",
  aiAddressTone: "",
  avoidTopics: "",
};

function resolveOwnerAvatar(avatar?: string | null) {
  return avatar && avatar.trim() ? avatar : defaultAvatar;
}

// contracts 的 contactKind 是 "wechat"|"phone"|"other"|null|undefined，store 想
// 收窄到不带 null 的 union 当 default。非法 / 缺省都回落到 wechat。
function resolveContactKind(
  kind?: WorldOwnerContactKind | null,
): WorldOwnerContactKind {
  return kind === "phone" || kind === "other" || kind === "wechat"
    ? kind
    : DEFAULT_CONTACT_KIND;
}

// contracts 的 gender 是 "male"|"female"|"other"|null|undefined，store 收窄到
// 带空串的 union（空串 = 未填）。非法 / 缺省都回落到 ""。
function resolveGender(gender?: WorldOwner["gender"]): WorldOwnerGender {
  return gender === "male" || gender === "female" || gender === "other"
    ? gender
    : "";
}

export const useWorldOwnerStore = create<WorldOwnerState>()(
  persist(
    (set) => ({
      id: null,
      username: null,
      onboardingCompleted: false,
      avatar: resolveOwnerAvatar(),
      signature: DEFAULT_SIGNATURE,
      contact: DEFAULT_CONTACT,
      contactKind: DEFAULT_CONTACT_KIND,
      encounterOptedIn: DEFAULT_ENCOUNTER_OPTED_IN,
      ...DEFAULT_PROFILE_FIELDS,
      hasCustomApiKey: false,
      customApiBase: null,
      createdAt: null,
      hydrateOwner: (owner) =>
        set({
          id: owner.id,
          username: owner.username,
          onboardingCompleted: owner.onboardingCompleted,
          avatar: resolveOwnerAvatar(owner.avatar),
          signature: owner.signature ?? DEFAULT_SIGNATURE,
          contact: owner.contact ?? DEFAULT_CONTACT,
          contactKind: resolveContactKind(owner.contactKind),
          encounterOptedIn: owner.encounterOptedIn !== false,
          gender: resolveGender(owner.gender),
          age: typeof owner.age === "number" ? owner.age : null,
          occupation: owner.occupation ?? "",
          region: owner.region ?? "",
          interests: owner.interests ?? "",
          aiAddressTone: owner.aiAddressTone ?? "",
          avoidTopics: owner.avoidTopics ?? "",
          hasCustomApiKey: owner.hasCustomApiKey,
          customApiBase: owner.customApiBase ?? null,
          createdAt: owner.createdAt,
        }),
      updateOwner: (input) =>
        set((state) => ({
          username: input.username ?? state.username,
          avatar:
            input.avatar === undefined
              ? state.avatar
              : resolveOwnerAvatar(input.avatar),
          signature: input.signature ?? state.signature,
          contact: input.contact ?? state.contact,
          contactKind: input.contactKind ?? state.contactKind,
          encounterOptedIn:
            input.encounterOptedIn ?? state.encounterOptedIn,
          onboardingCompleted: input.onboardingCompleted ?? state.onboardingCompleted,
          hasCustomApiKey: input.hasCustomApiKey ?? state.hasCustomApiKey,
          customApiBase:
            input.customApiBase === undefined ? state.customApiBase : input.customApiBase,
        })),
      updateProfile: (input) =>
        set((state) => ({
          username: input.username ?? state.username,
          avatar:
            input.avatar === undefined
              ? state.avatar
              : resolveOwnerAvatar(input.avatar),
          signature: input.signature ?? state.signature,
          contact: input.contact ?? state.contact,
          contactKind: input.contactKind ?? state.contactKind,
          encounterOptedIn:
            input.encounterOptedIn ?? state.encounterOptedIn,
        })),
      logout: () =>
        set({
          id: null,
          username: null,
          onboardingCompleted: false,
          avatar: resolveOwnerAvatar(),
          signature: DEFAULT_SIGNATURE,
          contact: DEFAULT_CONTACT,
          contactKind: DEFAULT_CONTACT_KIND,
          encounterOptedIn: DEFAULT_ENCOUNTER_OPTED_IN,
          ...DEFAULT_PROFILE_FIELDS,
          hasCustomApiKey: false,
          customApiBase: null,
          createdAt: null,
        }),
      clearOwner: () =>
        set({
          id: null,
          username: null,
          onboardingCompleted: false,
          avatar: resolveOwnerAvatar(),
          signature: DEFAULT_SIGNATURE,
          contact: DEFAULT_CONTACT,
          contactKind: DEFAULT_CONTACT_KIND,
          encounterOptedIn: DEFAULT_ENCOUNTER_OPTED_IN,
          ...DEFAULT_PROFILE_FIELDS,
          hasCustomApiKey: false,
          customApiBase: null,
          createdAt: null,
        }),
    }),
    {
      name: "yinjie-app-world-owner", // i18n-ignore-line
      storage: createSessionStateStorage(),
    },
  ),
);
