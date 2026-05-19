import { useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
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

export function RegisterPage() {
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordMismatch =
    confirmPassword.length > 0 && confirmPassword !== password;
  // 后端 auth.service.register 也拦 username 含 @（line 119-124），但前端漏拦
  // 用户得提交一次看到 "用户名不能包含 @ 字符" 红条后再改。account-page 改名
  // 时已经前置拦了同款规则，注册流补上对齐。@ 视为邮箱用：含 @ 的 username
  // 即便后端允许，登录页 isEmail = trimmed.includes('@') 会走 email 分支查
  // 不到自己，登录死锁。
  const usernameHasAt = username.trim().includes("@");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t(msg`两次输入的密码不一致`));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const session = await wikiApi.register(username, password);
      setSession(session.token, session.user);
      void navigate({ to: "/" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      narrow
      eyebrow={t(msg`账号`)}
      title={t(msg`注册`)}
      description={t(
        msg`新账号默认为「新人」。提交的编辑需经巡查员审核后生效；累积达标后会自动晋升为「自动确认」。`,
      )}
    >
      <AppSection>
        <form onSubmit={submit} className="space-y-4">
          <FormRow
            label={t(msg`用户名`)}
            hint={
              usernameHasAt
                ? t(msg`用户名不能包含 @（保留给邮箱登录）`)
                : t(msg`≥ 2 字，不能包含 @`)
            }
          >
            <TextField
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
              aria-invalid={usernameHasAt || undefined}
              autoFocus
              autoComplete="username"
            />
          </FormRow>
          <FormRow label={t(msg`密码`)} hint={t(msg`≥ 6 位`)}>
            <TextField
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </FormRow>
          <FormRow
            label={t(msg`确认密码`)}
            hint={
              passwordMismatch
                ? t(msg`两次输入不一致`)
                : t(msg`再输一次以确认`)
            }
          >
            {/* aria-invalid 让 SR 在"两次输入不一致"hint 变红时同步念出
                "invalid entry"，否则只有视觉提示，盲用用户必须等到 submit
                按钮也变灰才能间接感知。 */}
            <TextField
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              aria-invalid={passwordMismatch || undefined}
              autoComplete="new-password"
            />
          </FormRow>
          {/* FormRow.hint 是包在"?"气泡里的，用户得点 ? 才能看到。当输入
              违规（@）/ 密码不一致 这两种"硬错"时，单靠 hint 太隐蔽：用户
              只看到提交按钮置灰，不知道哪里错了。补 InlineNotice 内联告警，
              和 account-page username 改名页同款。 */}
          {usernameHasAt && (
            <InlineNotice tone="danger" role="alert">
              <Trans>用户名不能包含 @ 字符（保留给邮箱登录）。</Trans>
            </InlineNotice>
          )}
          {passwordMismatch && (
            <InlineNotice tone="danger" role="alert">
              <Trans>两次输入的密码不一致。</Trans>
            </InlineNotice>
          )}
          {/* 服务端拒绝注册（用户名重复 / 密码太短等）只渲染普通 div tone=danger
              通知；原写法 SR 完全静默，用户体感是 submit 按钮亮了一下又灰回
              去，没有任何反馈解释为什么。补 role=alert 让屏读把后端错误念出
              来。和登录页同款修法。 */}
          {error && (
            <InlineNotice tone="danger" role="alert">
              {error}
            </InlineNotice>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={
              loading ||
              passwordMismatch ||
              usernameHasAt ||
              confirmPassword.length === 0
            }
            className="w-full"
          >
            {loading ? t(msg`注册中...`) : t(msg`注册`)}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm text-[color:var(--text-muted)]">
          <Trans>已有账号？</Trans>
          <Link
            to="/login"
            className="ml-1 font-medium text-[color:var(--brand-primary)] hover:underline"
          >
            <Trans>登录</Trans>
          </Link>
        </div>
      </AppSection>
    </PageShell>
  );
}
