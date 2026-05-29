import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check } from "lucide-react";
import {
  clearWorldOwnerApiKey,
  getWorldOwner,
  setWorldOwnerApiKey,
  updateWorldOwner,
  type UpdateWorldOwnerRequest,
} from "@yinjie/contracts";
import { LanguageSwitcher, useRuntimeTranslator } from "@yinjie/i18n";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
  cn,
} from "@yinjie/ui";
import { DesktopChatConfirmDialog } from "../features/desktop/chat/desktop-chat-confirm-dialog";
import { DesktopUtilityShell } from "../features/shell/desktop-utility-shell";
import { AccountSecurityPanel } from "../features/account-security/account-security-panel";
import { DeleteAccountPanel } from "../features/account-security/delete-account-panel";
import { SubscriptionPanel } from "../features/subscription/subscription-panel";
import {
  clearCloudRuntimeSession,
  shouldShowCloudAccountControls,
} from "../lib/cloud-session";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useCloudSessionStore } from "../store/cloud-session-store";
import {
  type ChatSendShortcut,
  useChatPreferencesStore,
} from "../store/chat-preferences-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

// 与 welcome-page / profile-info-name-page 对齐：避免单字"w"这种 placeholder 式
// 名字混过保存。
const MIN_OWNER_NAME_LENGTH = 2;
// 与移动端 profile-info-name-page / profile-info-signature-page 的 max 限制对齐——
// 之前桌面端没设上限，移动端 counter 显示 30/30 后桌面端还能继续敲，存到后端的
// 字符串比移动端列表/卡片渲染时预期的更长。
const MAX_OWNER_NAME_LENGTH = 20;
const MAX_OWNER_SIGNATURE_LENGTH = 60;

// 「补充资料，让 AI 更懂你」字段约束——与移动端 profile-info-field-page 及后端
// world-owner.service 完全对齐（桌面端之前完全缺这一组字段，desktop-only 用户无从
// 填写自我设定，AI 对话拿不到画像；这里补齐到与移动端等价）。
const AGE_MIN = 1;
const AGE_MAX = 120;
const MAX_OCCUPATION_LENGTH = 40;
const MAX_REGION_LENGTH = 40;
const MAX_INTERESTS_LENGTH = 200;
const MAX_ADDRESS_TONE_LENGTH = 100;
const MAX_AVOID_TOPICS_LENGTH = 200;

type ProfileGender = "male" | "female" | "other" | "";
const GENDER_OPTIONS: {
  value: Exclude<ProfileGender, "">;
  label: ReturnType<typeof msg>;
}[] = [
  { value: "male", label: msg`男` },
  { value: "female", label: msg`女` },
  { value: "other", label: msg`其他` },
];

// 剥控制字符 + 折叠空白 + trim（与移动端字段页 / 后端 sanitizeProfileField 同款）。
// 这些值注入 AI prompt，换行/制表既污染结构也无意义。new RegExp(string) 形式避免
// no-control-regex（该规则只针对正则字面量里的控制字符）。
const CONTROL_CHAR_PATTERN = new RegExp(
  // eslint-disable-next-line no-control-regex
  "[\\u0000-\\u001f\\u007f-\\u009f]+",
  "g",
);
function sanitizeProfileText(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}
// 年龄字符串 → 入库值：空=null（清空）、非法=undefined（禁止保存）、否则 1-120 整数。
function parseDesktopAge(draft: string): number | null | undefined {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < AGE_MIN || n > AGE_MAX) return undefined;
  return n;
}

type SettingsTab =
  | "profile"
  | "chat"
  | "ai"
  | "language"
  | "legal"
  | "subscription"
  | "account-security";
type LegalTab = "privacy" | "terms" | "community";
type ProfileSettingsMessage = ReturnType<typeof msg>;

const profileTab = {
  id: "profile",
  label: msg`个人资料`,
} satisfies { id: SettingsTab; label: ProfileSettingsMessage };

const subscriptionTab = {
  id: "subscription",
  label: msg`会员中心`,
} satisfies { id: SettingsTab; label: ProfileSettingsMessage };

const accountSecurityTab = {
  id: "account-security",
  label: msg`账号安全`,
} satisfies { id: SettingsTab; label: ProfileSettingsMessage };

const restSettingsTabs: Array<{
  id: SettingsTab;
  label: ProfileSettingsMessage;
}> = [
  { id: "chat", label: msg`快捷键设置` },
  { id: "ai", label: msg`AI 设置` },
  { id: "language", label: msg`语言` },
  { id: "legal", label: msg`协议与规范` },
];

const legalTabs: Array<{ id: LegalTab; label: ProfileSettingsMessage }> = [
  { id: "privacy", label: msg`隐私政策` },
  { id: "terms", label: msg`用户协议` },
  { id: "community", label: msg`社区规范` },
];

const chatSendShortcutOptions: Array<{
  id: ChatSendShortcut;
  label: ProfileSettingsMessage;
  description: ProfileSettingsMessage;
}> = [
  {
    id: "enter",
    label: msg`Enter 发送消息`,
    description: msg`按回车直接发送，保持当前更顺手的输入节奏。`,
  },
  {
    id: "mod_enter",
    label: msg`Ctrl/Cmd + Enter 发送消息`,
    description: msg`发送前多一道组合键确认，更接近微信桌面版可切换方式。`,
  },
];

// 桌面专用 settings 主体。从 ProfileSettingsPage 拆出来 lazy 加载，
// 让移动端 /profile/settings 不为桌面 tabs（个人资料 / AI 设置 /
// 快捷键 / 语言 / 协议 / 会员中心 / 账号安全）的 ~12KB 重组件付费。
// 移动端有独立 entry list（在 ProfileSettingsPage 内）+ 各 tab 自己的子页
// （/profile/settings/language, /profile/settings/account-security）。
export function ProfileSettingsDesktop() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerId = useWorldOwnerStore((state) => state.id);
  const username = useWorldOwnerStore((state) => state.username);
  const signature = useWorldOwnerStore((state) => state.signature);
  const genderStore = useWorldOwnerStore((state) => state.gender);
  const ageStore = useWorldOwnerStore((state) => state.age);
  const occupationStore = useWorldOwnerStore((state) => state.occupation);
  const regionStore = useWorldOwnerStore((state) => state.region);
  const interestsStore = useWorldOwnerStore((state) => state.interests);
  const aiAddressToneStore = useWorldOwnerStore((state) => state.aiAddressTone);
  const avoidTopicsStore = useWorldOwnerStore((state) => state.avoidTopics);
  const cloudAccessToken = useCloudSessionStore((state) => state.accessToken);
  const cloudPhone = useCloudSessionStore((state) => state.phone);
  const updateOwnerStore = useWorldOwnerStore((state) => state.updateOwner);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const sendMessageShortcut = useChatPreferencesStore(
    (state) => state.sendMessageShortcut,
  );
  const setSendMessageShortcut = useChatPreferencesStore(
    (state) => state.setSendMessageShortcut,
  );

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [activeLegalTab, setActiveLegalTab] = useState<LegalTab>("privacy");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [draftName, setDraftName] = useState(username ?? "");
  const [draftSignature, setDraftSignature] = useState(signature);
  const [draftGender, setDraftGender] = useState<ProfileGender>(genderStore);
  const [draftAge, setDraftAge] = useState(
    ageStore != null ? String(ageStore) : "",
  );
  const [draftOccupation, setDraftOccupation] = useState(occupationStore);
  const [draftRegion, setDraftRegion] = useState(regionStore);
  const [draftInterests, setDraftInterests] = useState(interestsStore);
  const [draftAddressTone, setDraftAddressTone] = useState(aiAddressToneStore);
  const [draftAvoidTopics, setDraftAvoidTopics] = useState(avoidTopicsStore);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiBaseDraft, setApiBaseDraft] = useState("");

  const showCloudAccountEntries = shouldShowCloudAccountControls({
    worldAccessMode: runtimeConfig.worldAccessMode,
    runtimeApiBaseUrl: runtimeConfig.apiBaseUrl,
    runtimeCloudPhone: runtimeConfig.cloudPhone,
    accessToken: cloudAccessToken,
    sessionPhone: cloudPhone,
    worldOwnerId: ownerId,
  });

  const settingsTabs = showCloudAccountEntries
    ? [profileTab, subscriptionTab, accountSecurityTab, ...restSettingsTabs]
    : [profileTab, ...restSettingsTabs];

  useEffect(() => {
    setDraftName(username ?? "");
  }, [username]);

  useEffect(() => {
    setDraftSignature(signature);
  }, [signature]);

  // 补充资料的 draft 跟随 store hydrate 同步（owner.id 只 hydrate 一次，
  // hydratedOwnerKeyRef 守卫，不会在用户编辑中途被 refetch 覆盖）。
  useEffect(() => {
    setDraftGender(genderStore);
  }, [genderStore]);
  useEffect(() => {
    setDraftAge(ageStore != null ? String(ageStore) : "");
  }, [ageStore]);
  useEffect(() => {
    setDraftOccupation(occupationStore);
  }, [occupationStore]);
  useEffect(() => {
    setDraftRegion(regionStore);
  }, [regionStore]);
  useEffect(() => {
    setDraftInterests(interestsStore);
  }, [interestsStore]);
  useEffect(() => {
    setDraftAddressTone(aiAddressToneStore);
  }, [aiAddressToneStore]);
  useEffect(() => {
    setDraftAvoidTopics(avoidTopicsStore);
  }, [avoidTopicsStore]);

  // 桌面端打开 /desktop/settings 时，hydrateOwner 会写 zustand 触发本组件
  // 重渲染；若 ownerQuery 还在 staleTime 窗口外，会被 react-query 视为需要
  // refetch，新拿到的 owner data 拿到新 reference 又再次触发 useEffect →
  // 死循环（实测每秒打 800-1000 次 /api/world/owner）。
  // 这里钉死 staleTime=Infinity：mutation 路径已经用 queryClient.setQueryData
  // 把新 owner 写回缓存，不依赖自动 refetch，加上 hydrateOwner 之后 owner 状态
  // 同时也在 zustand store，本组件不会"丢"任何东西。
  const ownerQuery = useQuery({
    queryKey: ["world-owner", baseUrl],
    queryFn: () => getWorldOwner(baseUrl),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const hydratedOwnerKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const owner = ownerQuery.data;
    if (!owner) {
      return;
    }
    if (hydratedOwnerKeyRef.current === owner.id) {
      return;
    }
    hydratedOwnerKeyRef.current = owner.id;
    hydrateOwner(owner);
    setApiBaseDraft(owner.customApiBase ?? "");
  }, [hydrateOwner, ownerQuery.data]);

  // 历史上 username + signature 永远一起提交，导致老的"w"用户哪怕只想改签名，
  // 后端校验 username 也会把请求一起拒了。这里只发实际改过的字段。
  const trimmedDraftName = draftName.trim();
  const trimmedDraftSignature = draftSignature.trim();
  const nameDirty = trimmedDraftName !== (username ?? "").trim();
  const signatureDirty = trimmedDraftSignature !== signature.trim();

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const payload: { username?: string; signature?: string } = {};
      if (nameDirty) payload.username = trimmedDraftName;
      if (signatureDirty) payload.signature = trimmedDraftSignature;
      const owner = await updateWorldOwner(payload, baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
      updateOwnerStore({
        username: owner.username,
        signature: owner.signature,
      });
    },
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async () => {
      const trimmedApiBase = apiBaseDraft.trim();
      // Base URL 后端不校验直接落库（world-owner.service.ts setOwnerApiKey），
      // 运行时 ai-orchestrator.normalizeProviderEndpoint 也只 trim 尾斜杠不校验合法性。
      // 用户敲错（"asdf" / "https//x"）会一路过到 fetch 才 "Failed to construct URL"，
      // 没办法把锅甩回这个设置项。这里先在客户端拦掉。
      if (trimmedApiBase) {
        let parsed: URL | null = null;
        try {
          parsed = new URL(trimmedApiBase);
        } catch {
          parsed = null;
        }
        if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
          throw new Error(
            t(msg`Base URL 必须是合法的 http/https 地址，例如 https://api.openai.com/v1。`),
          );
        }
      }
      const owner = await setWorldOwnerApiKey(
        {
          apiKey: apiKeyDraft.trim(),
          apiBase: trimmedApiBase || undefined,
        },
        baseUrl,
      );
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
      // 后端 trim 过的值同步回 draft，避免用户敲了 "  https://x/  " 看到的还是
      // 带空格的旧 draft、想再改 Base URL 时困惑「我刚不是已经存过了」。
      setApiBaseDraft(owner.customApiBase ?? "");
    },
    onSuccess: () => {
      setApiKeyDraft("");
    },
  });

  const clearApiKeyMutation = useMutation({
    mutationFn: async () => {
      const owner = await clearWorldOwnerApiKey(baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
      setApiKeyDraft("");
      setApiBaseDraft(owner.customApiBase ?? "");
    },
  });

  // ---- 补充资料（注入 AI 的自我设定）：归一 + dirty + 校验 ----
  const sanitizedOccupation = sanitizeProfileText(draftOccupation);
  const sanitizedRegion = sanitizeProfileText(draftRegion);
  const sanitizedInterests = sanitizeProfileText(draftInterests);
  const sanitizedAddressTone = sanitizeProfileText(draftAddressTone);
  const sanitizedAvoidTopics = sanitizeProfileText(draftAvoidTopics);
  const parsedAge = parseDesktopAge(draftAge);
  const ageInvalid = parsedAge === undefined;
  const occupationDirty =
    sanitizedOccupation !== sanitizeProfileText(occupationStore);
  const regionDirty = sanitizedRegion !== sanitizeProfileText(regionStore);
  const interestsDirty =
    sanitizedInterests !== sanitizeProfileText(interestsStore);
  const addressToneDirty =
    sanitizedAddressTone !== sanitizeProfileText(aiAddressToneStore);
  const avoidTopicsDirty =
    sanitizedAvoidTopics !== sanitizeProfileText(avoidTopicsStore);
  const genderDirty = draftGender !== genderStore;
  // 按原始字符串比对（同移动端字段页），而非 parsedAge——否则非法年龄（如 "500"）
  // parsedAge=undefined 经 `?? null` 会与空 store 的 null 相等，被误判为「没改」而
  // 静默丢弃、不报错。字符串比对让非法非空输入也算 dirty → 触发 ageInvalid 拦截。
  const ageStoreStr = ageStore != null ? String(ageStore) : "";
  const ageDirty = draftAge.trim() !== ageStoreStr;
  const supplementaryDirty =
    genderDirty ||
    ageDirty ||
    occupationDirty ||
    regionDirty ||
    interestsDirty ||
    addressToneDirty ||
    avoidTopicsDirty;
  const supplementaryOverLimit =
    sanitizedOccupation.length > MAX_OCCUPATION_LENGTH ||
    sanitizedRegion.length > MAX_REGION_LENGTH ||
    sanitizedInterests.length > MAX_INTERESTS_LENGTH ||
    sanitizedAddressTone.length > MAX_ADDRESS_TONE_LENGTH ||
    sanitizedAvoidTopics.length > MAX_AVOID_TOPICS_LENGTH;
  // ageInvalid 只在年龄字段本身被改脏时才挡保存——否则用户只想改职业、年龄维持
  // 旧值（永远合法）却被 ageInvalid 卡住。
  const canSaveSupplementary =
    supplementaryDirty && !supplementaryOverLimit && !(ageDirty && ageInvalid);

  const saveSupplementaryMutation = useMutation({
    mutationFn: async () => {
      // 只发改过的字段：避免重发未变值、也不无谓覆盖被动推断刚回填的空字段。
      const payload: UpdateWorldOwnerRequest = {};
      if (genderDirty) payload.gender = draftGender === "" ? null : draftGender;
      if (ageDirty) payload.age = parsedAge ?? null;
      if (occupationDirty) payload.occupation = sanitizedOccupation;
      if (regionDirty) payload.region = sanitizedRegion;
      if (interestsDirty) payload.interests = sanitizedInterests;
      if (addressToneDirty) payload.aiAddressTone = sanitizedAddressTone;
      if (avoidTopicsDirty) payload.avoidTopics = sanitizedAvoidTopics;
      const owner = await updateWorldOwner(payload, baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      // hydrateOwner 写回 store → 上面 7 个同步 effect 把 draft 拉回已保存值。
      hydrateOwner(owner);
    },
  });

  // 没改昵称就不挡 save——老"w"用户改签名/头像不应该被 username 校验波及。
  const nameValid = trimmedDraftName.length >= MIN_OWNER_NAME_LENGTH;
  const canSaveProfile =
    (nameDirty || signatureDirty) && (!nameDirty || nameValid);
  const aiSettingsBusy =
    saveApiKeyMutation.isPending || clearApiKeyMutation.isPending;
  const desktopSettingsPath = "/desktop/settings";
  const desktopSettingsRoute = pathname.startsWith("/desktop/settings");
  const desktopPathMismatch = pathname !== desktopSettingsPath;
  const desktopBackTo = desktopSettingsRoute ? "/tabs/chat" : "/tabs/profile";
  const desktopBackLabel = desktopSettingsRoute
    ? t(msg`返回消息`)
    : t(msg`返回资料`);

  // 一旦在桌面布局下落到 /desktop/settings 就锁定；之后用户从这里 navigate 回
  // /tabs/chat 或 /tabs/profile 时，TanStack 会先把 location.pathname 切走、
  // 再 unmount 旧 page，期间这里的 useEffect 不能再 replace 回 /desktop/settings
  // 把目标导航吞掉（与 chat-list/contacts/search 已踩过的同类坑）。
  const desktopSettingsPathStabilizedRef = useRef(false);

  useEffect(() => {
    if (!desktopPathMismatch) {
      desktopSettingsPathStabilizedRef.current = true;
      return;
    }
    if (desktopSettingsPathStabilizedRef.current) {
      return;
    }

    void navigate({
      to: desktopSettingsPath,
      replace: true,
    });
  }, [desktopPathMismatch, desktopSettingsPath, navigate]);

  function handleCloudLogout() {
    setLogoutConfirmOpen(false);
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  }

  const content = (
    <>
      {activeTab === "profile" ? (
        <div className="space-y-4">
        <SettingsSection
          title={t(msg`个人资料`)}
          description={t(
            msg`这里的名称和签名会用于移动端资料页和世界主人展示。`,
          )}
        >
          <div className="space-y-3">
            <SettingsFieldGroup label={t(msg`显示名称`)}>
              <TextField
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                maxLength={MAX_OWNER_NAME_LENGTH}
                placeholder={t(msg`输入显示名称`)}
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] shadow-none focus:translate-y-0"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-[color:var(--text-dim)]">
                <span>
                  {t(
                    msg`至少 ${MIN_OWNER_NAME_LENGTH} 个字、最多 ${MAX_OWNER_NAME_LENGTH} 个字符。`,
                  )}
                </span>
                <span data-i18n-skip="true">
                  {draftName.length}/{MAX_OWNER_NAME_LENGTH}
                </span>
              </div>
            </SettingsFieldGroup>
            <SettingsFieldGroup label={t(msg`签名`)}>
              <TextAreaField
                value={draftSignature}
                onChange={(event) => setDraftSignature(event.target.value)}
                maxLength={MAX_OWNER_SIGNATURE_LENGTH}
                className="min-h-[5.5rem] resize-none rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] leading-[1.35rem] shadow-none focus:translate-y-0"
                placeholder={t(msg`介绍一下你自己，或者写一句当前状态`)}
              />
              <div className="mt-1 text-right text-[10px] text-[color:var(--text-dim)]" data-i18n-skip="true">
                {draftSignature.length}/{MAX_OWNER_SIGNATURE_LENGTH}
              </div>
            </SettingsFieldGroup>
          </div>

          <div className="pt-1">
            <Button
              onClick={() => saveProfileMutation.mutate()}
              disabled={!canSaveProfile || saveProfileMutation.isPending}
              variant="primary"
              className="h-9 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-[length:var(--text-caption)] text-[color:var(--text-on-brand)] shadow-none hover:opacity-95"
            >
              {saveProfileMutation.isPending
                ? t(msg`保存中...`)
                : t(msg`保存资料`)}
            </Button>
          </div>
          {saveProfileMutation.isError &&
          saveProfileMutation.error instanceof Error ? (
            <ErrorBlock message={saveProfileMutation.error.message} />
          ) : null}
          {saveProfileMutation.isSuccess ? (
            <InlineNotice tone="success">{t(msg`资料已更新。`)}</InlineNotice>
          ) : null}
        </SettingsSection>

        <SettingsSection
          title={t(msg`补充资料，让 AI 更懂你`)}
          description={t(
            msg`这些信息只用来让你的 AI 伙伴更懂你、回复更贴合，不会公开给其他用户。`,
          )}
        >
          <div className="space-y-3">
            {/* 性别：三选一 toggle，再次点选当前项可清空（同移动端字段页） */}
            <div className="block">
              <div className="mb-1 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-secondary)]">
                {t(msg`性别`)}
              </div>
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((option) => {
                  const active = option.value === draftGender;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setDraftGender(active ? "" : option.value)
                      }
                      className={cn(
                        "flex-1 rounded-[10px] border px-3 py-2 text-[length:var(--text-caption)] font-medium transition-colors",
                        active
                          ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-soft)] text-[color:var(--text-primary)]"
                          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)]",
                      )}
                    >
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            </div>

            <SettingsFieldGroup label={t(msg`年龄`)}>
              <TextField
                value={draftAge}
                inputMode="numeric"
                maxLength={3}
                placeholder={t(msg`你的年龄`)}
                onChange={(event) =>
                  setDraftAge(event.target.value.replace(/\D/g, ""))
                }
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] shadow-none focus:translate-y-0"
              />
              {ageDirty && ageInvalid ? (
                <div className="mt-1 text-[10px] text-[color:var(--state-danger-text)]">
                  {t(msg`请填写 ${AGE_MIN}-${AGE_MAX} 之间的年龄。`)}
                </div>
              ) : null}
            </SettingsFieldGroup>

            <SettingsFieldGroup label={t(msg`职业`)}>
              <TextField
                value={draftOccupation}
                maxLength={MAX_OCCUPATION_LENGTH}
                placeholder={t(msg`你的职业，例如 产品经理`)}
                onChange={(event) =>
                  setDraftOccupation(
                    event.target.value.replace(/[\r\n\t]/g, " "),
                  )
                }
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] shadow-none focus:translate-y-0"
              />
            </SettingsFieldGroup>

            <SettingsFieldGroup label={t(msg`所在地`)}>
              <TextField
                value={draftRegion}
                maxLength={MAX_REGION_LENGTH}
                placeholder={t(msg`常驻城市，例如 上海`)}
                onChange={(event) =>
                  setDraftRegion(event.target.value.replace(/[\r\n\t]/g, " "))
                }
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] shadow-none focus:translate-y-0"
              />
            </SettingsFieldGroup>

            <SettingsFieldGroup label={t(msg`兴趣爱好`)}>
              <TextAreaField
                value={draftInterests}
                maxLength={MAX_INTERESTS_LENGTH}
                placeholder={t(msg`你的兴趣爱好，例如 爬山、摄影、独立游戏`)}
                onChange={(event) => setDraftInterests(event.target.value)}
                className="min-h-[4.5rem] resize-none rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] leading-[1.35rem] shadow-none focus:translate-y-0"
              />
              <div
                className="mt-1 text-right text-[10px] text-[color:var(--text-dim)]"
                data-i18n-skip="true"
              >
                {sanitizedInterests.length}/{MAX_INTERESTS_LENGTH}
              </div>
            </SettingsFieldGroup>

            <SettingsFieldGroup label={t(msg`互动偏好`)}>
              <TextAreaField
                value={draftAddressTone}
                maxLength={MAX_ADDRESS_TONE_LENGTH}
                placeholder={t(
                  msg`希望角色怎么称呼你、用什么语气，例如 叫我老王，轻松一点`,
                )}
                onChange={(event) => setDraftAddressTone(event.target.value)}
                className="min-h-[4.5rem] resize-none rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] leading-[1.35rem] shadow-none focus:translate-y-0"
              />
              <div
                className="mt-1 text-right text-[10px] text-[color:var(--text-dim)]"
                data-i18n-skip="true"
              >
                {sanitizedAddressTone.length}/{MAX_ADDRESS_TONE_LENGTH}
              </div>
            </SettingsFieldGroup>

            <SettingsFieldGroup label={t(msg`回避话题`)}>
              <TextAreaField
                value={draftAvoidTopics}
                maxLength={MAX_AVOID_TOPICS_LENGTH}
                placeholder={t(msg`不希望被聊到的话题，例如 催婚、工作压力`)}
                onChange={(event) => setDraftAvoidTopics(event.target.value)}
                className="min-h-[4.5rem] resize-none rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] leading-[1.35rem] shadow-none focus:translate-y-0"
              />
              <div
                className="mt-1 text-right text-[10px] text-[color:var(--text-dim)]"
                data-i18n-skip="true"
              >
                {sanitizedAvoidTopics.length}/{MAX_AVOID_TOPICS_LENGTH}
              </div>
            </SettingsFieldGroup>
          </div>

          <div className="pt-1">
            <Button
              onClick={() => saveSupplementaryMutation.mutate()}
              disabled={
                !canSaveSupplementary || saveSupplementaryMutation.isPending
              }
              variant="primary"
              className="h-9 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-[length:var(--text-caption)] text-[color:var(--text-on-brand)] shadow-none hover:opacity-95"
            >
              {saveSupplementaryMutation.isPending
                ? t(msg`保存中...`)
                : t(msg`保存资料`)}
            </Button>
          </div>
          {saveSupplementaryMutation.isError &&
          saveSupplementaryMutation.error instanceof Error ? (
            <ErrorBlock message={saveSupplementaryMutation.error.message} />
          ) : null}
          {saveSupplementaryMutation.isSuccess ? (
            <InlineNotice tone="success">{t(msg`资料已更新。`)}</InlineNotice>
          ) : null}
        </SettingsSection>
        </div>
      ) : null}

      {activeTab === "chat" ? (
        <SettingsSection
          title={t(msg`聊天快捷键`)}
          description={t(msg`调整桌面和 Web 键盘聊天输入时的发送快捷键。`)}
        >
          <div
            role="radiogroup"
            aria-label={t(msg`发送消息的快捷键`)}
            className="overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
          >
            {chatSendShortcutOptions.map((option, index) => {
              const selected = sendMessageShortcut === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSendMessageShortcut(option.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left transition",
                    index > 0 && "border-t border-[color:var(--border-faint)]",
                    selected
                      ? "bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)]"
                      : "hover:bg-[color:var(--surface-card-hover)]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
                      {t(option.label)}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-4 text-[color:var(--text-muted)]">
                      {t(option.description)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                      selected
                        ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-transparent",
                    )}
                    aria-hidden="true"
                  >
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
          </div>

          <InlineNotice tone="muted">
            {t(
              msg`当前仅影响桌面和 Web 的键盘聊天输入，移动端仍以发送按钮和语音入口为主。`,
            )}
          </InlineNotice>
        </SettingsSection>
      ) : null}

      {activeTab === "ai" ? (
        <SettingsSection
          title={t(msg`AI 设置`)}
          description={t(
            msg`你可以为当前世界主人单独配置专属 API Key 和兼容 Base URL。`,
          )}
        >
          {ownerQuery.isLoading ? (
            <LoadingBlock
              className="px-0 py-0 text-left"
              label={t(msg`读取配置...`)}
            />
          ) : null}
          {ownerQuery.isError && ownerQuery.error instanceof Error ? (
            <ErrorBlock message={ownerQuery.error.message} />
          ) : null}
          {ownerQuery.data?.hasCustomApiKey ? (
            <InlineNotice tone="success">
              {ownerQuery.data.customApiBase
                ? t(
                    msg`当前使用专属 API Key，Base URL：${ownerQuery.data.customApiBase}。`,
                  )
                : t(msg`当前使用专属 API Key。`)}
            </InlineNotice>
          ) : null}

          <div className="space-y-2.5 rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3.5 py-3">
            <SettingsFieldGroup label={t(msg`专属 API Key`)}>
              <TextField
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={
                  ownerQuery.data?.hasCustomApiKey
                    ? t(msg`已保存专属 API Key，输入新的值可替换`)
                    : t(msg`输入你的专属 API Key`)
                }
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] shadow-none focus:translate-y-0"
              />
            </SettingsFieldGroup>
            <SettingsFieldGroup label={t(msg`兼容 Base URL`)}>
              <TextField
                value={apiBaseDraft}
                onChange={(event) => setApiBaseDraft(event.target.value)}
                placeholder={t(msg`可选，例如 https://api.openai.com/v1`)}
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[length:var(--text-caption)] shadow-none focus:translate-y-0"
              />
            </SettingsFieldGroup>
          </div>

          <div className="space-y-1.5 pt-0.5">
            <Button
              onClick={() => saveApiKeyMutation.mutate()}
              disabled={aiSettingsBusy || !apiKeyDraft.trim()}
              variant="primary"
              className="h-9 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-[length:var(--text-caption)] text-[color:var(--text-on-brand)] shadow-none hover:opacity-95"
            >
              {saveApiKeyMutation.isPending
                ? t(msg`保存中...`)
                : t(msg`保存专属 API Key`)}
            </Button>
            <Button
              onClick={() => clearApiKeyMutation.mutate()}
              disabled={aiSettingsBusy || !ownerQuery.data?.hasCustomApiKey}
              variant="secondary"
              className="h-9 w-full rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[length:var(--text-caption)] shadow-none hover:bg-[color:var(--surface-card)]"
            >
              {clearApiKeyMutation.isPending
                ? t(msg`清除中...`)
                : t(msg`清除专属 API Key`)}
            </Button>
          </div>

          {saveApiKeyMutation.isError &&
          saveApiKeyMutation.error instanceof Error ? (
            <ErrorBlock message={saveApiKeyMutation.error.message} />
          ) : null}
          {clearApiKeyMutation.isError &&
          clearApiKeyMutation.error instanceof Error ? (
            <ErrorBlock message={clearApiKeyMutation.error.message} />
          ) : null}
          {saveApiKeyMutation.isSuccess ? (
            <InlineNotice tone="success">
              {t(msg`专属 API Key 已保存。`)}
            </InlineNotice>
          ) : null}
          {clearApiKeyMutation.isSuccess ? (
            <InlineNotice tone="success">
              {t(msg`专属 API Key 已清除。`)}
            </InlineNotice>
          ) : null}
        </SettingsSection>
      ) : null}

      {activeTab === "language" ? (
        // 这一段之前 SettingsSection 描述与 LanguageSwitcher 自带描述基本同义，
        // 加上 LanguageSwitcher panel 里又有个 "界面语言" 的 select label，渲染出来
        // 是「标题 界面语言 / 描述 切换界面语言... / 内卡片标签 界面语言 / 内卡片描述
        // 语言偏好...」四行重复。与 cloud-console / wiki / admin 用 compact + description={null}
        // 的口径对齐：把更有信息量的描述合并到 SettingsSection，里层 description 关掉。
        <SettingsSection
          title={t(msg`界面语言`)}
          description={t(
            msg`语言偏好保存在当前设备并立即生效，同时决定好友回复使用的语言。`,
          )}
        >
          <LanguageSwitcher description={null} />
        </SettingsSection>
      ) : null}

      {activeTab === "legal" ? (
        <SettingsSection
          title={t(msg`协议与规范`)}
          description={t(
            msg`查看本世界的隐私政策、用户协议与社区规范，选中后可打开完整文档。`,
          )}
        >
          <div
            role="radiogroup"
            aria-label={t(msg`协议与规范文档`)}
            className="flex gap-1 rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-1"
          >
            {legalTabs.map((tab) => {
              const selected = activeLegalTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setActiveLegalTab(tab.id)}
                  className={cn(
                    "flex-1 rounded-[10px] py-2 text-[length:var(--text-caption)] font-medium transition-all duration-[var(--motion-fast)]",
                    selected
                      ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-sm"
                      : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card)]/70",
                  )}
                >
                  {t(tab.label)}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <Button
              variant="secondary"
              onClick={() =>
                void navigate({
                  to:
                    activeLegalTab === "privacy"
                      ? "/legal/privacy"
                      : activeLegalTab === "terms"
                        ? "/legal/terms"
                        : "/legal/community",
                })
              }
            >
              {activeLegalTab === "privacy"
                ? t(msg`打开隐私政策`)
                : activeLegalTab === "terms"
                  ? t(msg`打开用户协议`)
                  : t(msg`打开社区规范`)}
            </Button>
            <InlineNotice tone="muted">
              {activeLegalTab === "privacy"
                ? t(msg`查看世界隐私政策和数据使用说明。`)
                : activeLegalTab === "terms"
                  ? t(msg`查看世界服务使用协议。`)
                  : t(msg`查看世界社区规范和反馈口径。`)}
            </InlineNotice>
          </div>
        </SettingsSection>
      ) : null}
      {showCloudAccountEntries && activeTab === "subscription" ? (
        <SettingsSection
          title={t(msg`会员中心`)}
          description={t(msg`查看当前云账号订阅状态、可购套餐与邀请奖励。`)}
        >
          <SubscriptionPanel embedded />
        </SettingsSection>
      ) : null}
      {showCloudAccountEntries && activeTab === "account-security" ? (
        <>
          <SettingsSection
            title={t(msg`账号安全`)}
            description={t(msg`修改云账号登录密码，需要邮箱验证码确认。`)}
          >
            <AccountSecurityPanel />
          </SettingsSection>
          <SettingsSection
            title={t(msg`注销账号`)}
            description={t(msg`注销云账号并删除数据，需要邮箱验证码确认；操作不可恢复。`)}
          >
            <DeleteAccountPanel />
          </SettingsSection>
        </>
      ) : null}
      <DesktopChatConfirmDialog
        open={logoutConfirmOpen}
        title={t(msg`确认退出登录？`)}
        description={t(
          msg`退出后会回到世界入口，下次需要重新登录云账号。`,
        )}
        confirmLabel={t(msg`退出登录`)}
        danger
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleCloudLogout}
      />
    </>
  );

  return (
    <DesktopUtilityShell
      title={desktopSettingsRoute ? t(msg`设置`) : t(msg`资料与设置`)}
      subtitle={
        activeTab === "profile"
          ? t(msg`在桌面工作区里管理世界主人的资料与签名。`)
          : activeTab === "chat"
            ? t(msg`调整桌面和 Web 键盘聊天输入的发送快捷键。`)
            : activeTab === "ai"
              ? t(msg`管理专属 API Key 和兼容 Base URL。`)
              : activeTab === "language"
                ? t(msg`切换当前端的界面语言和本地化格式。`)
                : activeTab === "subscription"
                  ? t(msg`查看当前云账号订阅状态、可购套餐与邀请奖励。`)
                  : activeTab === "account-security"
                    ? t(msg`修改云账号登录密码，需要邮箱验证码确认。`)
                    : t(msg`查看当前世界相关的协议和社区规范。`)
      }
      toolbar={
        <Button
          onClick={() => navigate({ to: desktopBackTo })}
          variant="secondary"
          className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none hover:bg-[color:var(--surface-card)]"
        >
          {desktopBackLabel}
        </Button>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`设置分类`)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="space-y-1">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm transition",
                    activeTab === tab.id
                      ? "bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)] text-[color:var(--text-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card)]/80 hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{t(tab.label)}</span>
                  {activeTab === tab.id ? (
                    <span className="h-2 w-2 rounded-full bg-[color:var(--brand-primary)]" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          {showCloudAccountEntries ? (
            <div className="border-t border-[color:var(--border-faint)] p-3">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(true)}
                className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm text-[color:var(--state-danger-text)] transition hover:bg-[color:var(--state-danger-bg)]"
              >
                <span>{t(msg`退出登录`)}</span>
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      <div className="p-5">{content}</div>
    </DesktopUtilityShell>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-5 py-5 shadow-[var(--shadow-section)]">
      {title || description ? (
        <div>
          {title ? (
            <div className="text-[length:var(--text-base)] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
          ) : null}
          {description ? (
            <div className="mt-0.5 text-[length:var(--text-eyebrow)] leading-[1.35rem] text-[color:var(--text-muted)]">
              {description}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function SettingsFieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-secondary)]">
        {label}
      </div>
      {children}
    </label>
  );
}

export default ProfileSettingsDesktop;
