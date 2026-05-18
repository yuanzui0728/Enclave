import { useCallback, useEffect, useState } from "react";
import { msg, Trans } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { InlineNotice } from "@yinjie/ui";

// i18n-ignore-line: 运营联系方式，不翻译
const SUPPORT_WECHAT = "yuanzui0120";
// i18n-ignore-line: 运营联系方式，不翻译
const SUPPORT_EMAIL = "yuanzui0728@gmail.com";

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path（HTTP / 不安全上下文 / 旧浏览器）
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function CopyableContact({
  labelText,
  value,
  successMessage,
  ariaCopyLabel,
}: {
  /** 渲染在左侧的标签文本，同时也用作 ARIA 提示一部分 */
  labelText: string;
  value: string;
  successMessage: string;
  /** 复制按钮的 aria-label，给 SR 区分两个相同文案的「复制」按钮 */
  ariaCopyLabel: string;
}) {
  const t = useRuntimeTranslator();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "danger">("success");

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(value);
    setTone(ok ? "success" : "danger");
    setFeedback(ok ? successMessage : t(msg`复制失败，请手动选中。`));
  }, [value, successMessage, t]);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-[color:var(--surface-card)] px-2.5 py-1.5">
      <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
        {labelText}
      </span>
      <code
        className="min-w-0 flex-1 truncate select-all font-mono text-[13px] text-[color:var(--text-primary)]"
        title={value}
      >
        {value}
      </code>
      {/* min-h 32px：移动端 tap-target 规范（见 cb30c90b 走查 R2）。
          py-0.5 + text-[11px] 渲染出来才 ≈ 30px，手指容易点偏。 */}
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={ariaCopyLabel}
        className="shrink-0 rounded-md border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)] min-h-[32px]"
      >
        {feedback ? (
          // 用户点完"复制"后按钮文案变成"已复制"或"复制失败"，但 SR 不会
          // 自动重读 button 内部文字变更。挂 aria-live=assertive 强制播报，
          // 否则盲用用户只能听到键盘"clicked"再听不到任何反馈，可能反复点
          // 制造重复 clipboard 写入。
          <span
            role="status"
            aria-live="assertive"
            className={
              tone === "success"
                ? "text-[color:var(--state-success-text)]"
                : "text-[color:var(--state-danger-text)]"
            }
          >
            {feedback}
          </span>
        ) : (
          <Trans>复制</Trans>
        )}
      </button>
    </div>
  );
}

/**
 * AI 生成达到 hourly 限额时显示的提示。
 *
 * 行为：
 * - 顶部一行红色文案说明"额度用完 + N 秒后重试"。
 * - 下方两行可复制的运营联系方式（微信 + 邮箱）；每行一个「复制」按钮，
 *   兼容 navigator.clipboard 不可用的环境（fallback 走 document.execCommand）。
 * - `<code>` + `select-all` 即便复制按钮坏了也能"点一下高亮整段再 Ctrl-C"。
 */
export function QuotaExhaustedNotice({
  quota,
  retryAfterSec,
  /**
   * 顶部 + 底部两处同时渲染时，只能有一处对屏幕阅读器算 role=alert，
   * 不然 SR 会重复播报两遍。传 true 的实例改成 role=presentation：视觉
   * 完全保留，但不再触发额外播报。
   */
  silentAria = false,
}: {
  quota: number;
  retryAfterSec: number | null;
  silentAria?: boolean;
}) {
  const t = useRuntimeTranslator();
  const retryHint =
    retryAfterSec !== null && retryAfterSec > 0
      ? formatRetry(retryAfterSec, t)
      : null;
  const wxLabel = t(msg`微信`);
  const emailLabel = t(msg`邮箱`);

  return (
    <InlineNotice
      tone="danger"
      // silentAria=false 是用户主动点 "AI 一键生成" 触发 quota exhausted 后
      // 渲染的反馈通知 —— SR 必须播报"额度用完，N 秒后再试"。原写法
      // role=undefined 让屏读完全静默，盲用用户只看到 spinner 消失但听不到
      // 为什么没生成出内容，可能 30 秒内连续点 5 次按钮触发更多 quota lookup
      // RTT。挂 role=alert。silentAria=true 是同页第二份只为视觉冗余存在，
      // 保留 role=presentation 避免 SR 双播报。
      role={silentAria ? "presentation" : "alert"}
    >
      <div className="space-y-2">
        <div>
          {retryHint ? (
            <Trans>
              AI 生成额度用完：每小时上限 {quota} 次，{retryHint}后再试。
            </Trans>
          ) : (
            <Trans>AI 生成额度用完：每小时上限 {quota} 次，请稍后再试。</Trans>
          )}
        </div>
        <div className="text-[12px] text-[color:var(--text-secondary)]">
          <Trans>需要更多额度 / 商务合作，可联系运营：</Trans>
        </div>
        <div className="space-y-1.5">
          <CopyableContact
            labelText={wxLabel}
            value={SUPPORT_WECHAT}
            successMessage={t(msg`已复制`)}
            ariaCopyLabel={t(msg`复制${wxLabel}号 ${SUPPORT_WECHAT}`)}
          />
          <CopyableContact
            labelText={emailLabel}
            value={SUPPORT_EMAIL}
            successMessage={t(msg`已复制`)}
            ariaCopyLabel={t(msg`复制${emailLabel} ${SUPPORT_EMAIL}`)}
          />
        </div>
      </div>
    </InlineNotice>
  );
}

function formatRetry(
  sec: number,
  t: ReturnType<typeof useRuntimeTranslator>,
): string {
  if (sec >= 60) {
    const min = Math.ceil(sec / 60);
    return t(msg`约 ${min} 分钟`);
  }
  return t(msg`${sec} 秒`);
}
