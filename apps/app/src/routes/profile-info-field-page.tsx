import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  isApiRequestError,
  updateWorldOwner,
  type UpdateWorldOwnerRequest,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, TextAreaField, TextField, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

// 个人资料里「每字段一个子页」的通用编辑页：路由 /profile/info/field/$field 带
// field key 进来，按下面的注册表渲染对应输入形态（文本 / 多行 / 数字 / 性别选择）。
// 复用 profile-info-name-page 的整套交互骨架：draft state + userTouched/isMounted/
// saveInFlight 三保险 + updateWorldOwner→setQueryData→hydrateOwner + 字符计数。
// 之所以不为 7 个字段各造一份近重复文件：它们的交互完全同构，注册表 + 一份组件
// 远比 7 份拷贝好维护，i18n 提取面也更小。既有 name/signature/contact 子页保持不动。

// 剥控制字符 + 折叠空白 + trim（同 name/contact page）。这些资料会注入 AI prompt，
// 换行 / 制表既污染 prompt 结构也无意义。
const CONTROL_CHAR_PATTERN = new RegExp(
  // eslint-disable-next-line no-control-regex
  "[\\u0000-\\u001f\\u007f-\\u009f]+",
  "g",
);
function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}

const AGE_MIN = 1;
const AGE_MAX = 120;

type GenderValue = "male" | "female" | "other";
const GENDER_OPTIONS: { value: GenderValue; label: ReturnType<typeof msg> }[] = [
  { value: "male", label: msg`男` },
  { value: "female", label: msg`女` },
  { value: "other", label: msg`其他` },
];

// 注册表 key 同时是 store 字段名和 updateWorldOwner 的 payload key（后端列名一致），
// 所以 field 直接当三者用，不需要额外映射表。
type ProfileFieldKey =
  | "gender"
  | "age"
  | "occupation"
  | "region"
  | "interests"
  | "aiAddressTone"
  | "avoidTopics";

type FieldConfig = {
  kind: "text" | "textarea" | "number" | "gender";
  title: ReturnType<typeof msg>;
  placeholder?: ReturnType<typeof msg>;
  hint?: ReturnType<typeof msg>;
  maxLength?: number;
};

const FIELD_REGISTRY: Record<ProfileFieldKey, FieldConfig> = {
  gender: {
    kind: "gender",
    title: msg`性别`,
    hint: msg`再次点选当前选项可取消填写。`,
  },
  age: {
    kind: "number",
    title: msg`年龄`,
    placeholder: msg`你的年龄`,
    hint: msg`填 ${AGE_MIN}-${AGE_MAX} 之间的数字；留空表示不填写。`,
  },
  occupation: {
    kind: "text",
    title: msg`职业`,
    placeholder: msg`你的职业，例如 产品经理`,
    maxLength: 40,
  },
  region: {
    kind: "text",
    title: msg`所在地`,
    placeholder: msg`常驻城市，例如 上海`,
    maxLength: 40,
  },
  interests: {
    kind: "textarea",
    title: msg`兴趣爱好`,
    placeholder: msg`你的兴趣爱好，例如 爬山、摄影、独立游戏`,
    maxLength: 200,
  },
  aiAddressTone: {
    kind: "textarea",
    title: msg`互动偏好`,
    placeholder: msg`希望角色怎么称呼你、用什么语气，例如 叫我老王，轻松一点`,
    maxLength: 100,
  },
  avoidTopics: {
    kind: "textarea",
    title: msg`回避话题`,
    placeholder: msg`不希望被聊到的话题，例如 催婚、工作压力`,
    maxLength: 200,
  },
};

function isProfileFieldKey(value: string): value is ProfileFieldKey {
  return Object.prototype.hasOwnProperty.call(FIELD_REGISTRY, value);
}

// 把数字输入框里的字符串解析成入库年龄：留空 = null（清空），否则取整数。
// 返回 undefined 表示「非法、不可保存」（让 canSave 拦下）。
function parseAge(draft: string): number | null | undefined {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < AGE_MIN || n > AGE_MAX) return undefined;
  return n;
}

export function ProfileInfoFieldPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();
  const { field } = useParams({ from: "/profile/info/field/$field" });

  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  // 当前字段在 store 里的值，统一转成字符串（gender/text 原样，age 数字转串，null→""）。
  // field 不合法时回落到一个不存在的 key，storeValue 取到 undefined→""，页面随后重定向。
  const storeValue = useWorldOwnerStore((state) => {
    const raw = isProfileFieldKey(field)
      ? state[field]
      : undefined;
    return raw === null || raw === undefined ? "" : String(raw);
  });

  const [draft, setDraft] = useState(storeValue);
  const userTouchedRef = useRef(false);
  const isMountedRef = useRef(true);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // store 异步 hydrate 后同步 draft，但用户已动过输入框就别覆盖（同 name page）。
  useEffect(() => {
    if (!userTouchedRef.current) {
      setDraft(storeValue);
    }
  }, [storeValue]);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  const goBack = () =>
    navigateBackOrFallback(
      () => navigate({ to: "/profile/info", replace: true }),
      "/profile/info",
    );

  // 非法 field（手敲 URL / 老链接）：别渲染半截页面，直接回资料页。
  useEffect(() => {
    if (!isProfileFieldKey(field)) {
      void navigate({ to: "/profile/info", replace: true });
    }
  }, [field, navigate]);

  if (isDesktopLayout || !isProfileFieldKey(field)) {
    return null;
  }

  const config = FIELD_REGISTRY[field];
  const isGender = config.kind === "gender";
  const isNumber = config.kind === "number";
  const isTextarea = config.kind === "textarea";

  // 各形态的「会被保存的归一值」+ dirty + 可保存判定。
  const sanitized = isGender || isNumber ? draft : sanitizeText(draft);
  const parsedAge = isNumber ? parseAge(draft) : undefined;
  const ageInvalid = isNumber && parsedAge === undefined;
  const overLimit =
    config.maxLength !== undefined && sanitized.length > config.maxLength;
  const dirty = isNumber
    ? draft.trim() !== storeValue.trim()
    : sanitized !== (isGender ? storeValue : sanitizeText(storeValue));
  const canSave = dirty && !overLimit && !ageInvalid;

  const saveMutation = useMutation({
    mutationFn: async () => {
      let payload: UpdateWorldOwnerRequest;
      if (isGender) {
        payload = { gender: draft === "" ? null : (draft as GenderValue) };
      } else if (isNumber) {
        // parsedAge 已被 canSave 收窄成 number|null（undefined 时 canSave=false）。
        payload = { age: parsedAge ?? null };
      } else {
        // text/textarea：空串发给后端即清空（落 null）。payload key 同 field 名。
        payload = { [field]: sanitized } as UpdateWorldOwnerRequest;
      }
      const owner = await updateWorldOwner(payload, baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
    },
    onSuccess: () => {
      if (!isMountedRef.current) return;
      goBack();
    },
  });

  const handleSave = () => {
    if (saveInFlightRef.current) return;
    if (!canSave || saveMutation.isPending) return;
    saveInFlightRef.current = true;
    saveMutation.mutate(undefined, {
      onSettled: () => {
        saveInFlightRef.current = false;
      },
    });
  };

  const errorMessage = (() => {
    if (!saveMutation.isError) return null;
    const err = saveMutation.error;
    if (isApiRequestError(err)) {
      return translateAppErrorCode(err) ?? err.message;
    }
    return err instanceof Error ? describeRequestError(err) : null;
  })();

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(config.title)}
        titleAlign="center"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
        rightActions={
          <button
            type="button"
            disabled={!canSave || saveMutation.isPending}
            onClick={handleSave}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
              !canSave || saveMutation.isPending
                ? "text-[color:var(--text-dim)]"
                : "text-[color:var(--brand-primary)] active:bg-black/[0.05]",
            )}
          >
            {saveMutation.isPending ? t(msg`保存中`) : t(msg`完成`)}
          </button>
        }
      />

      <div className="mt-1 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
        {isGender ? (
          // 性别：三选一 toggle（同联系方式类型选择器）。点当前项可取消（清空）。
          <div className="flex gap-2">
            {GENDER_OPTIONS.map((option) => {
              const active = option.value === draft;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    userTouchedRef.current = true;
                    setDraft(active ? "" : option.value);
                    saveMutation.reset();
                  }}
                  className={cn(
                    "flex-1 rounded-[12px] border px-3 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-soft)] text-[color:var(--text-primary)]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)]",
                  )}
                >
                  {t(option.label)}
                </button>
              );
            })}
          </div>
        ) : isTextarea ? (
          <TextAreaField
            autoFocus
            rows={4}
            value={draft}
            disabled={saveMutation.isPending}
            spellCheck={false}
            maxLength={config.maxLength}
            placeholder={config.placeholder ? t(config.placeholder) : undefined}
            onChange={(event) => {
              userTouchedRef.current = true;
              setDraft(event.target.value);
              saveMutation.reset();
            }}
            className="min-h-[96px] rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[16px] leading-6 shadow-none disabled:bg-[color:var(--bg-canvas)] disabled:text-[color:var(--text-muted)]"
          />
        ) : (
          <TextField
            autoFocus
            value={draft}
            disabled={saveMutation.isPending}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            inputMode={isNumber ? "numeric" : undefined}
            maxLength={isNumber ? 3 : config.maxLength}
            enterKeyHint="done"
            placeholder={config.placeholder ? t(config.placeholder) : undefined}
            onChange={(event) => {
              userTouchedRef.current = true;
              const next = isNumber
                ? event.target.value.replace(/\D/g, "")
                : event.target.value.replace(/[\r\n\t]/g, " ");
              setDraft(next);
              saveMutation.reset();
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                if (canSave && !saveMutation.isPending) handleSave();
              }
            }}
            // text-[16px]: iOS Safari focus <16px 会强制 zoom-in，autoFocus 进页就抖。
            className="rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[16px] leading-6 shadow-none disabled:bg-[color:var(--bg-canvas)] disabled:text-[color:var(--text-muted)]"
          />
        )}

        {config.maxLength !== undefined && !isGender && !isNumber ? (
          <div
            className={cn(
              "mt-1.5 text-right text-[11px]",
              overLimit
                ? "text-[color:var(--state-danger-text)]"
                : "text-[color:var(--text-dim)]",
            )}
            data-i18n-skip="true"
          >
            {sanitized.length}/{config.maxLength}
          </div>
        ) : null}
      </div>

      {config.hint ? (
        <div className="px-4 pt-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
          {t(config.hint)}
        </div>
      ) : null}

      {/* 统一隐私说明：解释为什么收集、给谁看，打消顾虑。 */}
      <div className="px-4 pt-2 text-[12px] leading-5 text-[color:var(--text-muted)]">
        {t(
          msg`这些信息只用来让你的 AI 伙伴更懂你、回复更贴合，不会公开给其他用户。`,
        )}
      </div>

      {ageInvalid ? (
        <div className="mx-4 mt-3 rounded-[12px] border border-[color:var(--brand-primary)]/20 bg-[color:var(--surface-card)] px-3 py-2 text-[12px] leading-5 text-[color:var(--brand-primary)]">
          {t(msg`请填写 ${AGE_MIN}-${AGE_MAX} 之间的年龄。`)}
        </div>
      ) : overLimit && config.maxLength !== undefined ? (
        <div className="mx-4 mt-3 rounded-[12px] border border-[color:var(--brand-primary)]/20 bg-[color:var(--surface-card)] px-3 py-2 text-[12px] leading-5 text-[color:var(--brand-primary)]">
          {t(msg`内容太长啦，最多 ${config.maxLength} 个字符，请删掉一些。`)}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[12px] border border-[rgba(220,38,38,0.18)] bg-[rgba(254,242,242,0.96)] px-3 py-2 text-[12px] leading-5 text-[color:var(--state-danger-text)]"
        >
          {errorMessage}
        </div>
      ) : null}
    </AppPage>
  );
}
