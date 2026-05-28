import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  isApiRequestError,
  updateWorldOwner,
  type AvatarEncounterContactKind,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, TextField, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const CONTACT_MAX_LENGTH = 64;

// 跟 profile-info-signature-page 的 sanitizeOwnerSignature 同源：剥控制字符 +
// 折叠空白 + trim。联系方式是单行（微信号 / 手机号），换行 / 制表都没意义。
const CONTROL_CHAR_PATTERN = new RegExp(
  // eslint-disable-next-line no-control-regex
  "[\\u0000-\\u001f\\u007f-\\u009f]+",
  "g",
);
function sanitizeContact(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}

const CONTACT_KINDS: { value: AvatarEncounterContactKind; label: ReturnType<typeof msg> }[] =
  [
    { value: "wechat", label: msg`微信` },
    { value: "phone", label: msg`手机号` },
    { value: "other", label: msg`其它` },
  ];

export function ProfileInfoContactPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();

  const contact = useWorldOwnerStore((state) => state.contact);
  const contactKind = useWorldOwnerStore((state) => state.contactKind);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);

  const [draft, setDraft] = useState(() => sanitizeContact(contact));
  const [kind, setKind] = useState<AvatarEncounterContactKind>(contactKind);
  // 用户动过输入框后别被后台 hydrate 覆盖回 store 值（同 signature page）。
  const userTouchedRef = useRef(false);
  const isMountedRef = useRef(true);
  // isPending 走 React commit 才 propagate，同帧 <16ms 第二次提交都过门发 2 个
  // PATCH——同 signature/name page 同款 sync ref 守卫。
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userTouchedRef.current) {
      setDraft(sanitizeContact(contact));
      setKind(contactKind);
    }
  }, [contact, contactKind]);

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

  const sanitized = sanitizeContact(draft);
  const dirty =
    sanitized !== sanitizeContact(contact) || kind !== contactKind;
  const overLimit = sanitized.length > CONTACT_MAX_LENGTH;
  const canSave = dirty && !overLimit;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const owner = await updateWorldOwner(
        { contact: sanitized, contactKind: kind },
        baseUrl,
      );
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

  if (isDesktopLayout) {
    return null;
  }

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
        title={t(msg`联系方式`)}
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

      {/* 联系方式类型选择：微信 / 手机号 / 其它。改 kind 也算 dirty。 */}
      <div className="mt-1 border-t border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
        <div className="flex gap-2">
          {CONTACT_KINDS.map((option) => {
            const active = option.value === kind;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  userTouchedRef.current = true;
                  setKind(option.value);
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
      </div>

      <div className="border-b border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
        <TextField
          autoFocus
          value={draft}
          disabled={saveMutation.isPending}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          maxLength={CONTACT_MAX_LENGTH}
          enterKeyHint="done"
          placeholder={t(msg`微信号 / 手机号，仅在双方都想要时对对方可见`)}
          onChange={(event) => {
            userTouchedRef.current = true;
            const normalized = event.target.value.replace(/[\r\n\t]/g, " ");
            setDraft(normalized);
            saveMutation.reset();
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (canSave && !saveMutation.isPending) {
                handleSave();
              }
            }
          }}
          // text-[16px]: iOS Safari focus <16px 会强制 zoom-in，autoFocus 进页就抖。
          className="rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[16px] leading-6 shadow-none disabled:bg-[color:var(--bg-canvas)] disabled:text-[color:var(--text-muted)]"
        />
        <div
          className={cn(
            "mt-1.5 text-right text-[11px]",
            overLimit
              ? "text-[color:var(--state-danger-text)]"
              : "text-[color:var(--text-dim)]",
          )}
          data-i18n-skip="true"
        >
          {sanitized.length}/{CONTACT_MAX_LENGTH}
        </div>
      </div>

      {/* 隐私提示：解释为什么填、什么时候才会被对方看到。 */}
      <div className="px-4 pt-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
        {t(
          msg`联系方式只用于「分身相遇」：只有你和对方都选择「想要」后，才会互相披露。在此之前任何人都看不到。`,
        )}
      </div>

      {overLimit ? (
        <div className="mx-4 mt-3 rounded-[12px] border border-[rgba(245,158,11,0.20)] bg-[rgba(255,251,235,0.96)] px-3 py-2 text-[12px] leading-5 text-[color:var(--brand-primary)]">
          {t(msg`联系方式太长啦，最多 ${CONTACT_MAX_LENGTH} 个字符，请删掉一些。`)}
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
