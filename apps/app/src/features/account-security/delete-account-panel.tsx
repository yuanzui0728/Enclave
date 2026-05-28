import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  confirmCloudAccountDeletion,
  isApiRequestError,
  sendCloudAccountDeletionCode,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice, TextField } from "@yinjie/ui";
import { clearCloudRuntimeSession } from "../../lib/cloud-session";
import { describeRequestError } from "../../lib/request-error";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  isCloudSessionExpired,
  useCloudSessionStore,
} from "../../store/cloud-session-store";

// Apple App Store Guideline 5.1.1(v) 强制：注册类 App 必须支持在 App 内自助注销
// 账号（不能只给 web link / 邮件指引）。后端 AccountDeletionService 已实现"软删除
// + 30 天宽限"，本面板补齐前端入口：发码 → 输码 → 勾选确认 → 不可恢复地注销。
// 与 AccountSecurityPanel（改密码）同构：同样走绑定邮箱验证码，同样的 sessionExpired
// 兜底与 429 冷却处理。

const RESEND_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_FALLBACK_COOLDOWN_SECONDS = 5 * 60;

function resolveRateLimitCooldown(
  message: string | undefined,
  params?: Record<string, string | number | boolean | null> | null,
): number {
  const structuredSeconds = params?.seconds;
  if (
    typeof structuredSeconds === "number" &&
    Number.isFinite(structuredSeconds) &&
    structuredSeconds > 0
  ) {
    return Math.min(structuredSeconds, 600);
  }
  if (!message) return RATE_LIMIT_FALLBACK_COOLDOWN_SECONDS;
  // i18n-ignore-next-line: 跨 locale 解析 cloud-api 已 i18n 化的 retry-after 文本。
  const patterns = [/(\d+)\s*秒/, /(\d+)\s*초/, /\bin\s+(\d+)\s*seconds?\b/i];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    if (match) {
      const seconds = Number.parseInt(match[1], 10);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds, 600);
      }
    }
  }
  return RATE_LIMIT_FALLBACK_COOLDOWN_SECONDS;
}

function normalizeBaseUrl(value: string | undefined | null) {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function DeleteAccountPanel() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const cloudApiBaseUrl = normalizeBaseUrl(runtimeConfig.cloudApiBaseUrl);
  const accessToken = useCloudSessionStore((state) => state.accessToken);
  const expiresAt = useCloudSessionStore((state) => state.expiresAt);
  const sessionExpired = !accessToken || isCloudSessionExpired(expiresAt);

  // 折叠态：注销是破坏性操作，默认收起在一个"危险区"按钮后面，避免误触。
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");
  // 发码后服务端告知验证码走了哪条渠道（手机短信 / 绑定邮箱），用来切换提示文案。
  const [channel, setChannel] = useState<"email" | "phone" | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  // 注销成功后短暂展示成功态再跳转。没有它的话 clearCloudRuntimeSession() 会让
  // sessionExpired 立刻翻 true，把"已注销"成功提示瞬间换成"会话已失效"红条，体感困惑。
  const [deleted, setDeleted] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  const sendInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  // 倒计时存绝对时间戳，每秒从 Date.now() 重算，回前台立即对齐（与改密码面板同款）。
  const [resendEndsAt, setResendEndsAt] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendEndsAt <= 0) {
      setResendCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((resendEndsAt - Date.now()) / 1000));
      setResendCountdown(remaining);
      if (remaining <= 0) {
        setResendEndsAt(0);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendEndsAt]);

  const startResendCooldown = (seconds: number) => {
    setResendEndsAt(seconds <= 0 ? 0 : Date.now() + seconds * 1000);
  };

  const handleGoLogin = useCallback(() => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  }, [navigate]);

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error(t(msg`云账号会话已失效，请重新登录后再试。`));
      }
      return sendCloudAccountDeletionCode(accessToken, cloudApiBaseUrl || undefined);
    },
    onSuccess: (result) => {
      setChannel(result.channel);
      setFeedback({
        tone: "success",
        message: result.debugCode
          ? t(msg`开发模式：验证码已打印到服务端日志。`)
          : result.channel === "phone"
            ? t(msg`验证码已发送至你的手机，请查收短信。`)
            : t(msg`验证码已发送至绑定邮箱，请查收（含垃圾邮件箱）。`),
      });
      if (result.debugCode) {
        setCode(result.debugCode);
      }
      startResendCooldown(RESEND_COOLDOWN_SECONDS);
    },
    onError: (error) => {
      setFeedback({
        tone: "danger",
        message: describeRequestError(error, t(msg`发送验证码失败，请稍后重试。`)),
      });
      if (isApiRequestError(error) && error.statusCode === 429) {
        startResendCooldown(resolveRateLimitCooldown(error.message, error.params));
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error(t(msg`云账号会话已失效，请重新登录后再试。`));
      }
      return confirmCloudAccountDeletion(
        { code: code.trim() },
        accessToken,
        cloudApiBaseUrl || undefined,
      );
    },
    onSuccess: () => {
      setDeleted(true);
      setFeedback({
        tone: "success",
        message: t(msg`账号已注销，即将退出。`),
      });
      // 软删除后所有 token 立即失效，本地残留的 cloud session 必须清掉再退回入口，
      // 否则后续请求会拿着已作废 token 撞 403。
      clearCloudRuntimeSession();
      window.setTimeout(() => {
        void navigate({ to: "/welcome", replace: true });
      }, 1500);
    },
    onError: (error) => {
      setFeedback({
        tone: "danger",
        message: describeRequestError(error, t(msg`注销账号失败，请稍后重试。`)),
      });
    },
  });

  function handleConfirmDelete() {
    if (!code.trim()) {
      setFeedback({
        tone: "danger",
        message: t(msg`请输入收到的 6 位验证码。`),
      });
      return;
    }
    if (code.length < 6) {
      setFeedback({
        tone: "danger",
        message: t(msg`请输入完整的 6 位验证码。`),
      });
      return;
    }
    if (!acknowledged) {
      setFeedback({
        tone: "danger",
        message: t(msg`请先勾选确认你已了解注销的后果。`),
      });
      return;
    }
    if (deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    deleteMutation.mutate(undefined, {
      onSettled: () => {
        deleteInFlightRef.current = false;
      },
    });
  }

  // 注销成功后：只渲染成功提示，等 setTimeout 跳转 /welcome。必须排在 sessionExpired
  // 之前——此时 session 已被清空，否则会落进下面的"会话已失效"分支。
  if (deleted) {
    return (
      <InlineNotice tone="success" role="status">
        {t(msg`账号已注销，即将退出。`)}
      </InlineNotice>
    );
  }

  if (sessionExpired) {
    return (
      <div className="space-y-3">
        <InlineNotice tone="danger" role="alert">
          {t(msg`云账号会话已失效，请重新登录后再注销账号。`)}
        </InlineNotice>
        <Button onClick={handleGoLogin} size="lg" className="w-full rounded-2xl">
          {t(msg`去登录云账号`)}
        </Button>
      </div>
    );
  }

  const deleteDisabled =
    deleteMutation.isPending || !code.trim() || code.length < 6 || !acknowledged;

  return (
    <div className="space-y-3">
      <InlineNotice tone="muted">
        {t(
          msg`注销将停用你的云账号并取消生效中的订阅。注销后账号无法登录，数据将被永久归档且不可恢复；用同一手机号/邮箱重新注册将得到一个全新的空账号，不会找回任何原有数据。`,
        )}
      </InlineNotice>

      {!expanded ? (
        <Button
          variant="danger"
          size="lg"
          className="w-full rounded-2xl"
          onClick={() => {
            setFeedback(null);
            setExpanded(true);
          }}
        >
          {t(msg`注销账号`)}
        </Button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-[color:var(--border-danger)] bg-[rgba(255,241,241,0.5)] p-4">
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {t(
              msg`为确认是你本人操作，我们会向你的手机或绑定邮箱发送验证码。输入验证码并勾选确认后，账号将被注销。`,
            )}
          </p>

          <label className="block space-y-2">
            <span className="text-[12px] font-medium text-[color:var(--text-secondary)]">
              {channel === "phone" ? t(msg`手机验证码`) : t(msg`验证码`)}
            </span>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <TextField
                  value={code}
                  onChange={(event) => {
                    const next = event.target.value
                      .normalize("NFKC")
                      .replace(/\D+/g, "")
                      .slice(0, 6);
                    setCode(next);
                    setFeedback(null);
                  }}
                  placeholder={t(msg`6 位数字`)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </div>
              <Button
                onClick={() => {
                  if (sendInFlightRef.current) return;
                  sendInFlightRef.current = true;
                  sendCodeMutation.mutate(undefined, {
                    onSettled: () => {
                      sendInFlightRef.current = false;
                    },
                  });
                }}
                disabled={sendCodeMutation.isPending || resendCountdown > 0}
                variant="secondary"
                size="lg"
                className="shrink-0 rounded-2xl px-5"
              >
                {sendCodeMutation.isPending
                  ? t(msg`发送中...`)
                  : resendCountdown > 0
                    ? `${resendCountdown}s`
                    : t(msg`发送验证码`)}
              </Button>
            </div>
          </label>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => {
                setAcknowledged(event.target.checked);
                setFeedback(null);
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--state-danger-text)]"
            />
            <span className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
              {t(msg`我已了解：注销后账号无法登录，数据将被永久归档且不可恢复；重新注册不会找回原有数据。`)}
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1 rounded-2xl"
              disabled={deleteMutation.isPending}
              onClick={() => {
                setExpanded(false);
                setCode("");
                setChannel(null);
                setAcknowledged(false);
                setFeedback(null);
              }}
            >
              {t(msg`取消`)}
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1 rounded-2xl"
              disabled={deleteDisabled}
              onClick={handleConfirmDelete}
            >
              {deleteMutation.isPending
                ? t(msg`注销中...`)
                : t(msg`永久注销账号`)}
            </Button>
          </div>
        </div>
      )}

      {feedback ? (
        <InlineNotice
          tone={feedback.tone}
          role={feedback.tone === "danger" ? "alert" : "status"}
        >
          {feedback.message}
        </InlineNotice>
      ) : null}
    </div>
  );
}
