import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Link } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  AppSection,
  Button,
  InlineNotice,
  LoadingBlock,
  TextField,
} from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import { setSession } from "../lib/auth-store";
import { wikiApi, WikiApiError, type AuthProfile } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";
import { useTablistKeyboard } from "../lib/use-tablist-keyboard";

type TabKey = "password" | "profile" | "email";

export function AccountPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("password");
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // 切到未登录时清掉旧 profile，避免上一个用户的资料闪现
      setProfile(null);
      return;
    }
    // 用户身份变化时先把 profile 置空，让 LoadingBlock 显示而不是旧数据
    setProfile(null);
    setProfileError(null);
    wikiApi
      .me()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err: Error) => {
        if (!cancelled) setProfileError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) {
    return (
      <PageShell title={t(msg`账户设置`)}>
        <InlineNotice tone="info">
          <Trans>
            请先{" "}
            <Link to="/login" className="font-medium underline">
              登录
            </Link>{" "}
            后再访问账户设置。
          </Trans>
        </InlineNotice>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow={t(msg`账号`)} title={t(msg`账户设置`)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <aside className="shrink-0 lg:w-52">
          <TabList tab={tab} onChange={setTab} />
        </aside>
        <main className="min-w-0 flex-1">
          {profileError && (
            <InlineNotice tone="danger" className="mb-4">
              {profileError}
            </InlineNotice>
          )}
          {tab === "password" ? (
            profile ? (
              <ChangePasswordPanel profile={profile} onProfileChange={setProfile} />
            ) : (
              <AppSection>
                <LoadingBlock />
              </AppSection>
            )
          ) : tab === "profile" ? (
            profile ? (
              <ChangeUsernamePanel profile={profile} onProfileChange={setProfile} />
            ) : (
              <AppSection>
                <LoadingBlock />
              </AppSection>
            )
          ) : (
            <AppSection>
              <InlineNotice tone="info">
                <Trans>该模块尚未开放，后续版本上线。</Trans>
              </InlineNotice>
            </AppSection>
          )}
        </main>
      </div>
    </PageShell>
  );
}

function TabList({
  tab,
  onChange,
}: {
  tab: TabKey;
  onChange: (k: TabKey) => void;
}) {
  const t = translateRuntimeMessage;
  const items: Array<{ key: TabKey; label: string; disabled?: boolean }> = [
    { key: "password", label: t(msg`修改密码`) },
    { key: "profile", label: t(msg`个人资料`) },
    { key: "email", label: t(msg`邮箱`), disabled: true },
  ];
  // 这些 tabs 切的是同一个 /account 页内的 panel（修改密码 / 个人资料 / 邮箱），
  // 不是导航到不同 URL，所以用 <nav> 会让 SR 念出 "navigation landmark"，跟
  // 行为不一致——盲用用户会找不到这个 landmark 跳进去对应的什么 page。改成
  // role=tablist + role=tab + aria-selected，跟 character-page / admin-reports
  // 修法对齐。disabled 邮箱 tab 漏过 aria-selected（语义上始终不选中）。
  // roving tabindex + 方向键：见 use-tablist-keyboard.ts，让键盘用户用 ← / → 在
  // 三个 tab 之间切换，而不是每个 tab 都占一个 Tab stop。
  const onKeyDown = useTablistKeyboard({
    count: items.length,
    onActivate: (i) => {
      const it = items[i];
      if (it && !it.disabled) onChange(it.key);
    },
  });
  return (
    <div
      role="tablist"
      aria-label={t(msg`账户设置板块`)}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-shell)] p-1 lg:flex-col lg:gap-0.5 lg:overflow-visible"
    >
      {items.map((it) => {
        const active = !it.disabled && tab === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={it.disabled}
            onClick={() => !it.disabled && onChange(it.key)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors ${
              active
                ? "bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]"
                : it.disabled
                  ? "cursor-not-allowed text-[color:var(--text-muted)] opacity-60"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            {it.label}
            {it.disabled && (
              <span className="ml-1 text-[10px] uppercase tracking-wider">
                <Trans>即将推出</Trans>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ChangePasswordPanel({
  profile,
  onProfileChange,
}: {
  profile: AuthProfile;
  onProfileChange: (next: AuthProfile) => void;
}) {
  const t = translateRuntimeMessage;
  // 用 reactive 的 t() 来翻译 info —— 把 info 存成 MessageDescriptor，每次 render 重翻一次，
  // 这样切语言后 "验证码已发送到..." 也会跟着切。useLingui 让组件订阅 locale 变化。
  const { t: tReactive } = useLingui();
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [info, setInfo] = useState<MessageDescriptor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    },
    [],
  );

  const maskedEmail = useMemo(() => maskEmail(profile.email), [profile.email]);
  const passwordMismatch = confirm.length > 0 && newPassword !== confirm;
  // 后端故意不 trim 密码（"abc " 和 "abc" 不等同；trim 会让落库与登录态不一致）。
  // 但前端粘贴 / 自动填充经常带尾部空白，密码框只显示星号看不出来，事后登录就发现登不上。
  // 检测到首尾空白时给个 InlineNotice 提醒，不阻断提交，让用户自己确认。
  const passwordHasEdgeWhitespace =
    newPassword.length > 0 && newPassword !== newPassword.trim();
  // code 必须严格是 6 位数字，不只是 length===6。否则用户输入 "abcdef" 时按钮会亮起，
  // 点击后被 input pattern="[0-9]{6}" 在浏览器层拦下来弹原生 tooltip，体验断裂。
  const canSubmit =
    !submitting &&
    /^\d{6}$/.test(code.trim()) &&
    newPassword.length >= 6 &&
    newPassword === confirm;

  if (!profile.email) {
    return (
      <AppSection>
        <InlineNotice tone="danger">
          <Trans>
            当前账号尚未绑定邮箱，无法通过邮箱验证码修改密码。请联系管理员绑定邮箱后再试。
          </Trans>
        </InlineNotice>
      </AppSection>
    );
  }

  function startCooldown(seconds: number) {
    setCooldown(seconds);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function sendCode() {
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      const result = await wikiApi.sendChangePasswordCode();
      startCooldown(60);
      setInfo(
        result.debugCode
          ? msg`开发模式：验证码已打印到服务端日志（debug=${result.debugCode}）`
          : msg`验证码已发送到 ${maskedEmail}，请查收邮箱（含垃圾邮件箱）。`,
      );
    } catch (err) {
      // 后端 429 会把还需要等多久放在 payload.params.retryAfter；不读到本地
      // cooldown 里，用户可以反复点 "发送验证码" 触发更多 429，体验很差。
      if (err instanceof WikiApiError && err.status === 429) {
        const retry = readRetryAfterSeconds(err);
        if (retry > 0) startCooldown(retry);
      }
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await wikiApi.changePassword(code.trim(), newPassword);
      setCode("");
      setNewPassword("");
      setConfirm("");
      setInfo(msg`密码已修改成功，下次登录请使用新密码。`);
      onProfileChange({ ...profile, hasPassword: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppSection>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
          {profile.hasPassword ? (
            <Trans>账户邮箱：<span className="font-medium text-[color:var(--text-primary)]">{maskedEmail}</span>。验证码将发送到此邮箱。</Trans>
          ) : (
            <Trans>你尚未设置过登录密码——完成本次流程后，即可使用用户名 + 密码登录。账户邮箱：<span className="font-medium text-[color:var(--text-primary)]">{maskedEmail}</span>。</Trans>
          )}
        </div>

        <FormRow label={t(msg`邮箱验证码`)} hint={t(msg`6 位数字，10 分钟内有效`)}>
          <div className="flex gap-2">
            <TextField
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="123456"
            />
            <Button
              type="button"
              variant="ghost"
              disabled={sending || cooldown > 0}
              onClick={() => void sendCode()}
            >
              {cooldown > 0
                ? t(msg`${cooldown}s 后重发`)
                : sending
                  ? t(msg`发送中...`)
                  : t(msg`发送验证码`)}
            </Button>
          </div>
        </FormRow>

        <FormRow label={t(msg`新密码`)} hint={t(msg`至少 6 位`)}>
          <TextField
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </FormRow>

        <FormRow label={t(msg`确认新密码`)}>
          <TextField
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </FormRow>

        {/* 三处密码校验提示 - mismatch / edge-whitespace - 都是用户键入触发
            的实时反馈，需要 SR 念出来。role=alert 让"两次输入的新密码不一
            致"主动播报，否则视障用户必须等 submit 按钮置灰才知道哪里错。
            edge-whitespace 是 warning 而非 error，role=status 不打断阅读
            但仍能播报。 */}
        {passwordMismatch && (
          <InlineNotice tone="danger" role="alert">
            <Trans>两次输入的新密码不一致。</Trans>
          </InlineNotice>
        )}
        {passwordHasEdgeWhitespace && (
          <InlineNotice tone="warning" role="status">
            <Trans>
              新密码包含开头或结尾的空白字符（来自粘贴/自动填充？）。下次登录时也必须带上，否则会登录失败 —— 请确认这是你想要的。
            </Trans>
          </InlineNotice>
        )}
        {info && (
          <InlineNotice tone="info" role="status">
            {tReactive(info)}
          </InlineNotice>
        )}
        {error && (
          <InlineNotice tone="danger" role="alert">
            {error}
          </InlineNotice>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          {submitting
            ? t(msg`提交中...`)
            : profile.hasPassword
              ? t(msg`确认修改密码`)
              : t(msg`确认设置密码`)}
        </Button>
      </form>
    </AppSection>
  );
}

function ChangeUsernamePanel({
  profile,
  onProfileChange,
}: {
  profile: AuthProfile;
  onProfileChange: (next: AuthProfile) => void;
}) {
  const t = translateRuntimeMessage;
  // info 走 reactive，切语言后跟着翻译；同 ChangePasswordPanel 的处理。
  const { t: tReactive } = useLingui();
  const [username, setUsername] = useState(profile.username);
  const [info, setInfo] = useState<MessageDescriptor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = username.trim();
  const changed = trimmed !== profile.username;
  // @ 在 login 里是邮箱标识，username 含 @ 会让自己用 username 登不上。
  // 后端也会拒，但前端先拦一道。
  const invalidChar = trimmed.includes("@");
  const tooShort = trimmed.length > 0 && trimmed.length < 2;
  const tooLong = trimmed.length > 32;
  const canSubmit =
    !submitting && changed && !invalidChar && !tooShort && !tooLong && trimmed.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const session = await wikiApi.changeUsername(trimmed);
      // 改名后后端重签了 JWT（旧 token payload 里 username 还是旧的），
      // 顺便把 localStorage 里的 user 也覆盖，导航栏立刻显示新名。
      setSession(session.token, session.user);
      onProfileChange({ ...profile, username: session.user.username });
      setInfo(msg`用户名已更新为 ${session.user.username}。`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppSection>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
          <Trans>
            当前用户名：
            <span className="font-medium text-[color:var(--text-primary)]">
              {profile.username}
            </span>
            。修改后旧用户名立即释放，登录可用新用户名或绑定邮箱。
          </Trans>
        </div>

        <FormRow
          label={t(msg`新用户名`)}
          hint={t(msg`2-32 个字符，不能包含 @`)}
        >
          <TextField
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={2}
            maxLength={32}
            autoComplete="username"
          />
        </FormRow>

        {/* 用户名校验三档实时反馈，同款 role=alert 让 SR 即时通报。 */}
        {invalidChar && (
          <InlineNotice tone="danger" role="alert">
            <Trans>用户名不能包含 @ 字符（保留给邮箱登录）。</Trans>
          </InlineNotice>
        )}
        {tooShort && (
          <InlineNotice tone="danger" role="alert">
            <Trans>用户名至少 2 个字符。</Trans>
          </InlineNotice>
        )}
        {tooLong && (
          <InlineNotice tone="danger" role="alert">
            <Trans>用户名不能超过 32 个字符。</Trans>
          </InlineNotice>
        )}
        {info && (
          <InlineNotice tone="info" role="status">
            {tReactive(info)}
          </InlineNotice>
        )}
        {error && (
          <InlineNotice tone="danger" role="alert">
            {error}
          </InlineNotice>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          {submitting ? t(msg`提交中...`) : t(msg`保存新用户名`)}
        </Button>
      </form>
    </AppSection>
  );
}

function readRetryAfterSeconds(err: WikiApiError): number {
  const payload = err.payload;
  if (!payload || typeof payload !== "object") return 0;
  const params = (payload as { params?: unknown }).params;
  if (!params || typeof params !== "object") return 0;
  const raw = (params as { retryAfter?: unknown }).retryAfter;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
}

function maskEmail(email: string | null): string {
  if (!email) return "";
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  if (name.length <= 2) return `${name[0] ?? ""}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}
