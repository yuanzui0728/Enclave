import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  changeCloudPassword,
  isApiRequestError,
  sendCloudChangePasswordCode,
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

const RESEND_COOLDOWN_SECONDS = 60;
// bcrypt 只 hash 密码前 72 字节，cloud-api 的 password-policy.ts 已经按 byte 长度卡。
// 但客户端原来只看 newPassword.length（char count）：用户敲 25 个中文（75B）能通过
// 客户端校验，到 cloud-api 才被拒 "密码不能超过 72 字节（含 emoji / 中文时上限更小）"，
// 用户看到 "字节" 这种术语反而困惑。这里先在客户端用 TextEncoder 量字节长度同款拦截，
// 提示语和 placeholder「8-32 位」保持一致语义。
const MAX_PASSWORD_BYTES = 72;

// 走查 R4：cooldown 之前只活在组件 useState 里，用户点完「发送验证码」 → 触发
// cooldown → 切去任意子页（连切去 /profile/settings 都算）回来时组件 unmount /
// remount，state 清零，按钮恢复成「发送验证码」可点 → 又一发请求，server
// 60s 滑窗马上再返 429。
// 模块级 Map 按 accessToken 维度缓存 endsAt（绝对时间戳），mount 时复读 →
// 跨 nav 真实保留剩余时间。reload 整页时也会丢，但 reload 本身是用户显式
// 行为；接下来一次点击会被 server 429 兜住，再次落盘。
const RESEND_END_BY_TOKEN = new Map<string, number>();
function readResendEnd(token: string | null | undefined) {
  if (!token) return 0;
  return RESEND_END_BY_TOKEN.get(token) ?? 0;
}
function writeResendEnd(token: string | null | undefined, endsAt: number) {
  if (!token) return;
  if (endsAt <= Date.now()) {
    RESEND_END_BY_TOKEN.delete(token);
    return;
  }
  RESEND_END_BY_TOKEN.set(token, endsAt);
}

// 后端 429 走两条文案：
//   1) "验证码发送过于频繁，请在 {n} 秒后重试。"（60 秒滑窗）— cloud-api-i18n.ts
//      会按 Accept-Language 译成 en/ja/ko 版本（"in N seconds" / "N 秒後" /
//      "N초 후"），所以匹配 retryAfter 数字时四语都要覆盖，否则 en/ko 用户全
//      落到默认 60s。
//   2) "该邮箱验证码请求次数过多，请稍后再试。"（小时窗口超 5 条上限）— 后端
//      没在 i18n 表里映射，en/ja/ko 透传中文，但客户端逻辑只看 statusCode 429
//      + 无 N 秒数字就当作小时窗口。这种情况下 60s 太短，按钮回弹后再点又
//      触发同一条 429 → 用户陷在 60s 循环里浪费配额。给一个保守的 5 分钟
//      冷却，等真实窗口慢慢滑过去；用户实在急可以刷新页面或换设备。
// R1 走查（2026-05-17）：之前正则 /(\d+)\s*秒/ 只命中 zh/ja，en/ko 都 fallback 60s。
// R3 走查（2026-05-17）：cloud-api 把动态秒数透传在 error body 的 params.seconds
// 字段里（cloud-api-i18n.ts translateKnownDynamicMessage），结构化优先比 regex
// 匹配局部化后的文案更稳。preferStructuredParams 优先；message 解析仍保留作回退
// (旧版本服务端没 params 字段；本地直连未走 cloud-api 时也走 message 兜底)。
const RATE_LIMIT_FALLBACK_COOLDOWN_SECONDS = 5 * 60;
function resolveRateLimitCooldown(
  message: string | undefined,
  params?: Record<string, string | number | boolean | null> | null,
): number {
  const structuredSeconds = params?.seconds;
  if (typeof structuredSeconds === "number" && Number.isFinite(structuredSeconds) && structuredSeconds > 0) {
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
  // 没解析出 N 秒 → 当作小时窗口，给长冷却避免循环 429。
  return RATE_LIMIT_FALLBACK_COOLDOWN_SECONDS;
}

function normalizeBaseUrl(value: string | undefined | null) {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function AccountSecurityPanel() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const cloudApiBaseUrl = normalizeBaseUrl(runtimeConfig.cloudApiBaseUrl);
  const accessToken = useCloudSessionStore((state) => state.accessToken);
  const expiresAt = useCloudSessionStore((state) => state.expiresAt);
  // R2 走查（2026-05-17）：cloud-api password-policy.ts assertPasswordStrength
  // 会把 newPassword 跟 user.email / user.phone 比对（case-insensitive）并抛
  // "密码不能与手机号或邮箱相同。"。但这条文案没进 cloud-api-i18n.ts 表，en/ja/ko
  // 用户原样拿到裸中文 → describeRequestError fallthrough 也只能透传。客户端直接
  // 拿 cloudSession.email / phone 同款比对，提前在当前 locale 给出 t() 提示。
  const sessionEmail = useCloudSessionStore((state) => state.email);
  const sessionPhone = useCloudSessionStore((state) => state.phone);
  // 走查 R2：原本 panel 只看 !accessToken 决定 disabled，但 expiresAt < now 时
  // accessToken 字符串还在 store 里，按钮全亮，用户点了「发送验证码」再被 401
  // 退回——浪费一次填表 + 等响应。socket.ts / media-url.ts / runtime-config.ts
  // 早就按 isCloudSessionExpired 拦了，账号安全 panel 不该是唯一例外。
  const sessionExpired = !accessToken || isCloudSessionExpired(expiresAt);

  // R1（2026-05-17 移动端 我-设置走查）：sessionExpired 时之前只渲染一条 danger
  // banner + 整页 disabled 表单，用户没有任何前进路径——既不能改密码也不知道下
  // 一步该去哪。subscription-page 在同样的"没 cloud session"分支下早就走的是
  // "info banner + 去登录云账号 CTA"。这里同款收口：清掉残留 cloud session 并
  // 跳回 /welcome 让用户重新登录。
  const handleGoLogin = useCallback(() => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  }, [navigate]);

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // useMutation.isPending 翻 true 是异步的，连续两/三连击之间还没 propagate，
  // sendCodeMutation.mutate() 同步会再触发请求——手快的用户点 3 下就真打到
  // cloud-api 3 条 /password/send-change-code，再被服务端 429 退回，体验差且
  // 浪费配额。用 ref 做同步守卫，settled 时复位。
  // 更新密码 同款问题——三连击 type="submit" 也能同 tick 同步触发 3 个
  // /password/change 请求。两个 mutation 都加 ref-guard。
  const sendInFlightRef = useRef(false);
  const changeInFlightRef = useRef(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  // 之前用 setInterval 每秒 -1 一个 state；后台 tab 节流会把 1Hz 拉到 1/min，
  // 倒计时显示和后端实际 retry-after 拉开十几倍。改成存 endsAt 绝对时间戳，
  // 每秒从 Date.now() 重算剩余秒，回前台立刻对齐真实剩余。
  // R4：mount 时从模块级 RESEND_END_BY_TOKEN 读上次留下来的 endsAt，让 cooldown
  // 跨页面切换真实保留剩余时间。
  const [resendEndsAt, setResendEndsAt] = useState(() => readResendEnd(accessToken));
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendEndsAt <= 0) {
      setResendCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((resendEndsAt - Date.now()) / 1000),
      );
      setResendCountdown(remaining);
      if (remaining <= 0) {
        setResendEndsAt(0);
        writeResendEnd(accessToken, 0);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [accessToken, resendEndsAt]);

  // accessToken 切换（换号/登出）时拉一次最新 endsAt，避免上一个用户的冷却
  // 误伤新身份。
  useEffect(() => {
    setResendEndsAt(readResendEnd(accessToken));
  }, [accessToken]);

  const startResendCooldown = (seconds: number) => {
    if (seconds <= 0) {
      setResendEndsAt(0);
      writeResendEnd(accessToken, 0);
      return;
    }
    const endsAt = Date.now() + seconds * 1000;
    setResendEndsAt(endsAt);
    writeResendEnd(accessToken, endsAt);
  };

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        // 走到这里说明 disabled 兜底没拦住（理论不该发生），仍要把错误文案 t() 化，
        // 不要让 en/ja/ko 用户在弹回的 feedback 里看到裸的英文 stacktrace。
        throw new Error(t(msg`云账号会话已失效，请重新登录后再试。`));
      }
      return sendCloudChangePasswordCode(
        accessToken,
        cloudApiBaseUrl || undefined,
      );
    },
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: result.debugCode
          ? t(msg`开发模式：验证码已打印到服务端日志。`)
          : t(msg`验证码已发送至绑定邮箱，请查收（含垃圾邮件箱）。`),
      });
      if (result.debugCode) {
        setCode(result.debugCode);
      }
      startResendCooldown(RESEND_COOLDOWN_SECONDS);
    },
    onError: (error) => {
      const description = describeRequestError(
        error,
        t(msg`发送验证码失败，请稍后重试。`),
      );
      setFeedback({ tone: "danger", message: description });
      // 429 时把按钮 lock 住，否则用户读完报错连点 → 又一条 429，反复打到后端节流。
      if (isApiRequestError(error) && error.statusCode === 429) {
        startResendCooldown(resolveRateLimitCooldown(error.message, error.params));
      }
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error(t(msg`云账号会话已失效，请重新登录后再试。`));
      }
      return changeCloudPassword(
        { code: code.trim(), newPassword },
        accessToken,
        cloudApiBaseUrl || undefined,
      );
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: t(msg`密码已更新，下次登录可使用新密码。`),
      });
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      setFeedback({
        tone: "danger",
        message: describeRequestError(error, t(msg`修改密码失败，请稍后重试。`)),
      });
    },
  });

  function handleSubmit() {
    if (!code.trim()) {
      setFeedback({
        tone: "danger",
        message: t(msg`请输入邮箱收到的 6 位验证码。`),
      });
      return;
    }
    // code onChange 已经 strip 非数字 + slice 6，所以走到这里只可能是「输了 < 6
    // 位就提交」。不在客户端拦的话，cloud-api 会返回通用 "验证码错误。"，用户
    // 容易误以为是验证码本身写错（typo / 用了旧码），而不是少打了一位。
    if (code.length < 6) {
      setFeedback({
        tone: "danger",
        message: t(msg`请输入完整的 6 位验证码。`),
      });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 32) {
      setFeedback({
        tone: "danger",
        message: t(msg`新密码长度需在 8-32 位之间。`),
      });
      return;
    }
    // 中文 / emoji 在 char count 通过 32 后，byte 长度可能仍超 bcrypt 的 72B 上限——
    // 此时让后端报 "密码不能超过 72 字节" 用户看到 "字节" 反而懵。先在客户端按字节拦。
    if (new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES) {
      setFeedback({
        tone: "danger",
        message: t(
          msg`新密码超出长度上限（每个中文/表情占多个字节），请缩短后再试。`,
        ),
      });
      return;
    }
    // 后端 password-policy 也会拦空格，但跑到 cloud-api 才报让 UX 一坨。
    // 这里先在客户端拦掉，配合 placeholder 「8-32 位，任意字符（不含空格）」一致。
    if (/\s/.test(newPassword)) {
      setFeedback({
        tone: "danger",
        message: t(msg`新密码不能包含空格。`),
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({
        tone: "danger",
        message: t(msg`两次输入的密码不一致。`),
      });
      return;
    }
    // R2：cloud-api password-policy 会比对 newPassword vs email/phone 抛
    // "密码不能与手机号或邮箱相同。"，但该文案不在 i18n 表里（en/ja/ko 用户
    // 拿到裸中文）。同款比对放客户端，错误文案走 t()。
    const newPasswordLower = newPassword.toLowerCase();
    if (
      (sessionEmail && newPasswordLower === sessionEmail.toLowerCase()) ||
      (sessionPhone && newPasswordLower === sessionPhone.toLowerCase())
    ) {
      setFeedback({
        tone: "danger",
        message: t(msg`新密码不能与邮箱或手机号相同。`),
      });
      return;
    }
    // 同 tick 多次点 type="submit" / 按 Enter 时，isPending 还没 propagate，
    // disabled 兜不住 → mutate 多次。ref 同步守卫。
    if (changeInFlightRef.current) return;
    changeInFlightRef.current = true;
    changePasswordMutation.mutate(undefined, {
      onSettled: () => {
        changeInFlightRef.current = false;
      },
    });
  }

  // 把核心提交条件统一到一个 flag 上，避免 disabled / 视觉态各走各的。
  const submitDisabled =
    changePasswordMutation.isPending ||
    sessionExpired ||
    !code.trim() ||
    !newPassword ||
    !confirmPassword;

  // R1：session 失效（或本地世界从来没登过云账号）时整页全 disabled、用户却
  // 看不到下一步该往哪走——subscription-page 在同样分支已是 "info banner + 去
  // 登录云账号 CTA"，这里同款收口，让用户能离开死路自己回 /welcome。
  if (sessionExpired) {
    return (
      <div className="space-y-3">
        <InlineNotice tone="danger" role="alert">
          {t(msg`云账号会话已失效，请重新登录后再尝试修改密码。`)}
        </InlineNotice>
        <Button
          onClick={handleGoLogin}
          size="lg"
          className="w-full rounded-2xl"
        >
          {t(msg`去登录云账号`)}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <InlineNotice tone="muted">
        {t(
          msg`修改密码需要邮箱验证码确认；验证码会发送至当前账号绑定的邮箱。`,
        )}
      </InlineNotice>

      <form
        className="space-y-3 rounded-2xl border border-[color:var(--border-faint)] bg-white p-4"
        // noValidate：禁掉 HTML5 native 校验。<input pattern="\d{6}"> 留着是
        // 给 a11y 报字段格式期望，但 native popup（"Please match the requested
        // format."）的文案是浏览器系统语言决定的，zh-CN 用户在 headless chrome
        // / 海外原生浏览器下会看到英文，跟 app 当前 locale 不一致。我们自己的
        // handleSubmit 已经全量校验：code 非空 → newPassword 长度 / 空格 /
        // 一致性，错误文案走 t()，不需要 native 兜底。
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (submitDisabled) return;
          handleSubmit();
        }}
      >
        <label className="block space-y-2">
          <span className="text-[12px] font-medium text-[color:var(--text-secondary)]">
            {t(msg`邮箱验证码`)}
          </span>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <TextField
                value={code}
                onChange={(event) => {
                  // 后端验证码硬是 6 位数字（email-auth.service.ts generateCode），
                  // 移动端给一个 numeric 键盘 + 长度截断，少一次"输错位数才报错"的来回。
                  // 注意 maxLength 不能上：HTML 层 maxLength 在 input 事件之前先把
                  // 用户粘贴的内容截掉，"abc1234567" 这种带前缀字符 + 7 位数字的
                  // OTP（邮件复制带前后空格/标签是典型场景）会先被截成 "abc123"，
                  // onChange 再 strip 字母变成 "123"——用户复制了 7 位有效数字结果
                  // 只剩 3 位，根本不知道发生了什么。改成 onChange 内一次性 strip
                  // 非数字 + slice 6，由 React 控制最终 value，maxLength 不需要。
                  // 新一轮走查 R1：先走 NFKC 把全角数字（U+FF10-FF19）、全角空格、
                  // 罗马数字等折算成半角，否则 `/\D+/g` 会把全角 "１２３４５６" 当
                  // 非数字全 strip 成空。日韩用户邮件客户端在 IME 自动转换下复制
                  // OTP 进来就是全角，原本 6 位有效输入直接被吞光。
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
              disabled={
                sendCodeMutation.isPending ||
                resendCountdown > 0 ||
                sessionExpired
              }
              variant="secondary"
              size="lg"
              className="shrink-0 rounded-2xl border-black/5 bg-[#f5f5f5] px-5 shadow-none hover:border-[rgba(7,193,96,0.16)] hover:bg-white"
            >
              {sendCodeMutation.isPending
                ? t(msg`发送中...`)
                : resendCountdown > 0
                  ? `${resendCountdown}s`
                  : t(msg`发送验证码`)}
            </Button>
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-[12px] font-medium text-[color:var(--text-secondary)]">
            {t(msg`新密码`)}
          </span>
          <TextField
            type="password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setFeedback(null);
            }}
            placeholder={t(msg`8-32 位，不含空格`)}
            autoComplete="new-password"
            maxLength={32}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[12px] font-medium text-[color:var(--text-secondary)]">
            {t(msg`确认新密码`)}
          </span>
          <TextField
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setFeedback(null);
            }}
            placeholder={t(msg`再次输入新密码`)}
            autoComplete="new-password"
            maxLength={32}
          />
        </label>

        <Button
          type="submit"
          disabled={submitDisabled}
          size="lg"
          className="w-full rounded-2xl"
        >
          {changePasswordMutation.isPending
            ? t(msg`提交中...`)
            : t(msg`更新密码`)}
        </Button>
      </form>

      {feedback ? (
        // 让屏幕阅读器在 feedback 变化时朗读「验证码已发送...」「修改密码失败...」
        // 等状态。danger 用 role=alert（隐含 aria-live=assertive，立即打断当前朗读），
        // success/info 用 role=status（隐含 polite，待空隙）。之前 InlineNotice 是
        // 裸 div，盲用/键盘用户只能从 disabled 状态推断结果，没有上下文。
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
