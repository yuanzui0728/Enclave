import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  AppSection,
  Button,
  InlineNotice,
  TextField,
} from "@yinjie/ui";
import { setSession } from "../lib/auth-store";
import { wikiApi } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";

type Mode = "password" | "email";

export function LoginPage() {
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/login" }) as { redirect?: string };
  const [mode, setMode] = useState<Mode>("password");

  function gotoTarget() {
    // 防开放跳转：只接受站内绝对路径，且要排除 // 和 /\ 这类 protocol-relative
    // 形式（浏览器会把它当外站）。任何非 / 开头或带 \\ / // 前缀的值都丢弃。
    const safe =
      redirect &&
      redirect.startsWith("/") &&
      !redirect.startsWith("//") &&
      !redirect.startsWith("/\\");
    if (safe) {
      window.location.href = redirect;
    } else {
      void navigate({ to: "/" });
    }
  }

  return (
    <PageShell narrow eyebrow={t(msg`账号`)} title={t(msg`登录`)}>
      <AppSection>
        <div className="mb-4 flex gap-2">
          <Button
            type="button"
            variant={mode === "password" ? "primary" : "ghost"}
            onClick={() => setMode("password")}
            className="flex-1"
          >
            <Trans>用户名密码</Trans>
          </Button>
          <Button
            type="button"
            variant={mode === "email" ? "primary" : "ghost"}
            onClick={() => setMode("email")}
            className="flex-1"
          >
            <Trans>邮箱验证码</Trans>
          </Button>
        </div>

        {mode === "password" ? (
          <PasswordForm onSuccess={gotoTarget} />
        ) : (
          <EmailCodeForm onSuccess={gotoTarget} />
        )}

        <div className="mt-4 text-center text-sm text-[color:var(--text-muted)]">
          <Trans>还没有账号？</Trans>
          <Link
            to="/register"
            className="ml-1 font-medium text-[color:var(--brand-primary)] hover:underline"
          >
            <Trans>创建一个</Trans>
          </Link>
          {mode === "password" ? (
            <span className="ml-1">
              <Trans>或直接用邮箱登录。</Trans>
            </span>
          ) : null}
        </div>
      </AppSection>
    </PageShell>
  );
}

function PasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const t = translateRuntimeMessage;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await wikiApi.login(username, password);
      setSession(session.token, session.user);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormRow
        label={t(msg`用户名或邮箱`)}
        hint={t(msg`两者皆可登录；含 @ 视为邮箱`)}
      >
        <TextField
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          autoComplete="username"
        />
      </FormRow>
      <FormRow label={t(msg`密码`)}>
        <TextField
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </FormRow>
      {error && <InlineNotice tone="danger">{error}</InlineNotice>}
      <Button
        type="submit"
        variant="primary"
        disabled={loading}
        className="w-full"
      >
        {loading ? t(msg`登录中...`) : t(msg`登录`)}
      </Button>
    </form>
  );
}

function EmailCodeForm({ onSuccess }: { onSuccess: () => void }) {
  const t = translateRuntimeMessage;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    },
    [],
  );

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
      const result = await wikiApi.sendEmailCode(email.trim());
      startCooldown(60);
      setInfo(
        result.debugCode
          ? t(msg`开发模式：验证码已打印到服务端日志（debug=${result.debugCode}）`)
          : t(msg`验证码已发送，请查收邮箱（含垃圾邮件箱）。`),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    try {
      const session = await wikiApi.verifyEmailCode(email.trim(), code.trim());
      setSession(session.token, session.user);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormRow label={t(msg`邮箱`)}>
        <TextField
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          placeholder={t(msg`you@example.com`)}
        />
      </FormRow>
      <FormRow label={t(msg`验证码`)} hint={t(msg`6 位数字，10 分钟内有效`)}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextField
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <Button
            type="button"
            variant="ghost"
            className="whitespace-nowrap"
            disabled={!email.trim() || sending || cooldown > 0}
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
      {info && <InlineNotice tone="info">{info}</InlineNotice>}
      {error && <InlineNotice tone="danger">{error}</InlineNotice>}
      <Button
        type="submit"
        variant="primary"
        disabled={verifying || !email.trim() || code.trim().length < 6}
        className="w-full"
      >
        {verifying ? t(msg`登录中...`) : t(msg`登录 / 注册`)}
      </Button>
    </form>
  );
}
