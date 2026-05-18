import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  PanelEmpty,
  StatusPill,
  TextField,
} from "@yinjie/ui";
import { wikiApi } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";
import { formatDateTime } from "../lib/format";
import { useUsernameMap } from "../lib/use-username-map";

export function AdminProtectionPage() {
  const t = translateRuntimeMessage;
  const qc = useQueryClient();
  const [characterId, setCharacterId] = useState("");
  const charactersQ = useQuery({
    queryKey: ["wiki", "characters"],
    queryFn: () => wikiApi.listCharacters(),
  });
  const pageQ = useQuery({
    queryKey: ["wiki", "page", characterId],
    queryFn: () => wikiApi.getPage(characterId),
    enabled: !!characterId,
  });
  const logQ = useQuery({
    queryKey: ["wiki", "protection-log", characterId],
    queryFn: () => wikiApi.protectionLog(characterId),
    enabled: !!characterId,
  });
  const { resolve: resolveUsername } = useUsernameMap(
    (logQ.data ?? []).map((row) => row.changedBy),
  );

  const [form, setForm] = useState<{
    level: "none" | "semi" | "full";
    reviewPolicy: "open" | "pending_changes";
    expiresAt: string;
    reason: string;
  }>({ level: "none", reviewPolicy: "open", expiresAt: "", reason: "" });

  // 选中条目后用其当前保护设置预填表单，避免用户从空白开始重输。
  // datetime-local 需要 "YYYY-MM-DDTHH:mm" 格式（无秒、无时区），且必须按用户
  // 本地时钟解释。原写法 toISOString().slice(0,16) 把 UTC 字符直接灌进 local
  // 输入框，UTC+8 用户看到的时间整体偏 8 小时；保存时 new Date(form.expiresAt)
  // 又按本地时钟读 → toISOString → 写库再偏 8 小时，等于一次往返抹掉两次时
  // 差，到期时间被改成 16 小时前。改用 local 字段构造字符串。
  useEffect(() => {
    if (!pageQ.data) return;
    const p = pageQ.data.page;
    let expiresLocal = "";
    if (p.protectionExpiresAt) {
      const d = new Date(p.protectionExpiresAt);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        expiresLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
          d.getDate(),
        )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    setForm({
      level:
        p.protectionLevel === "semi" || p.protectionLevel === "full"
          ? p.protectionLevel
          : "none",
      reviewPolicy:
        p.reviewPolicy === "pending_changes" ? "pending_changes" : "open",
      expiresAt: expiresLocal,
      reason: p.protectionReason ?? "",
    });
  }, [pageQ.data]);

  const setProtMut = useMutation({
    mutationFn: () =>
      wikiApi.setProtection(characterId, {
        level: form.level,
        reviewPolicy: form.reviewPolicy,
        expiresAt: form.expiresAt
          ? new Date(form.expiresAt).toISOString()
          : null,
        reason: form.reason.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki", "page", characterId] });
      void qc.invalidateQueries({
        queryKey: ["wiki", "protection-log", characterId],
      });
    },
  });

  return (
    <PageShell
      eyebrow={t(msg`管理`)}
      title={t(msg`页面保护`)}
      description={t(
        msg`对单个角色词条设置编辑保护级别和审核策略：无保护 / 半保护（自动确认及以上）/ 完全保护（仅管理员）。`,
      )}
    >
      <AppSection>
        <FormRow label={t(msg`选择条目`)}>
          <select
            className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
          >
            <option value="">{t(msg`— 选择 —`)}</option>
            {(charactersQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.id}）
              </option>
            ))}
          </select>
        </FormRow>
      </AppSection>

      {characterId && (
        <>
          {pageQ.isLoading && <LoadingBlock />}
          {pageQ.isError && (
            <ErrorBlock role="alert" message={(pageQ.error as Error).message} />
          )}
          {pageQ.data && (
            <AppSection className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[color:var(--text-muted)]">
                  <Trans>当前级别</Trans>
                </span>
                <StatusPill>
                  {pageQ.data.page.protectionLevel === "none"
                    ? t(msg`无保护`)
                    : pageQ.data.page.protectionLevel === "semi"
                      ? t(msg`半保护`)
                      : t(msg`完全保护`)}
                </StatusPill>
                <span className="ml-3 text-[color:var(--text-muted)]">
                  <Trans>审核策略</Trans>
                </span>
                <StatusPill>
                  {pageQ.data.page.reviewPolicy === "pending_changes"
                    ? t(msg`待审变更`)
                    : t(msg`开放编辑`)}
                </StatusPill>
                {pageQ.data.page.protectionLevel !== "none" &&
                  pageQ.data.page.protectionExpiresAt && (
                    <span className="ml-3 text-xs text-[color:var(--text-muted)]">
                      <Trans>
                        到期：
                        {formatDateTime(pageQ.data.page.protectionExpiresAt)}
                      </Trans>
                    </span>
                  )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FormRow label={t(msg`新级别`)}>
                  <select
                    className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    value={form.level}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        level: e.target.value as typeof form.level,
                      })
                    }
                  >
                    <option value="none">{t(msg`无保护`)}</option>
                    <option value="semi">{t(msg`半保护（自动确认+）`)}</option>
                    <option value="full">{t(msg`完全保护（仅管理员）`)}</option>
                  </select>
                </FormRow>
                <FormRow label={t(msg`审核策略`)}>
                  <select
                    className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    value={form.reviewPolicy}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        reviewPolicy: e.target
                          .value as typeof form.reviewPolicy,
                      })
                    }
                  >
                    <option value="open">{t(msg`开放编辑`)}</option>
                    <option value="pending_changes">{t(msg`待审变更`)}</option>
                  </select>
                </FormRow>
                <FormRow label={t(msg`到期时间`)} hint={t(msg`可选；留空 = 永久`)}>
                  <input
                    type="datetime-local"
                    className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    value={form.expiresAt}
                    onChange={(e) =>
                      setForm({ ...form, expiresAt: e.target.value })
                    }
                  />
                </FormRow>
                <FormRow label={t(msg`原因`)}>
                  <TextField
                    value={form.reason}
                    onChange={(e) =>
                      setForm({ ...form, reason: e.target.value })
                    }
                  />
                </FormRow>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  className="w-full sm:w-auto"
                  disabled={setProtMut.isPending}
                  onClick={() => setProtMut.mutate()}
                >
                  {setProtMut.isPending ? t(msg`保存中...`) : t(msg`应用保护级别`)}
                </Button>
                {/* 应用保护级别失败需 SR 即时播报；管理员看不到红字时
                    才有可能误以为已生效。 */}
                {setProtMut.isError && (
                  <InlineNotice
                    tone="danger"
                    role="alert"
                    className="flex-1"
                  >
                    {(setProtMut.error as Error).message}
                  </InlineNotice>
                )}
              </div>
            </AppSection>
          )}

          <AppSection>
            <h2 className="mb-3 text-base font-semibold">
              <Trans>变更历史</Trans>
            </h2>
            {logQ.isLoading && <LoadingBlock />}
            {logQ.data?.length === 0 && (
              <PanelEmpty message={t(msg`暂无记录。`)} />
            )}
            <ul className="space-y-2">
              {logQ.data?.map((row) => {
                // 原写法直接渲染 row.oldLevel / row.newLevel 后端英文枚举
                // （none / semi / full），但同页"新级别"下拉里管理员选的
                // 是"无保护 / 半保护（自动确认+）/ 完全保护（仅管理员）"。
                // 历史记录里跳英文 "semi → full"，跟上面 form 翻译不一致，
                // 像 i18n 漏译。统一走本地化映射。
                const lvl = (v: string): string =>
                  v === "none"
                    ? t(msg`无保护`)
                    : v === "semi"
                      ? t(msg`半保护`)
                      : v === "full"
                        ? t(msg`完全保护`)
                        : v;
                return (
                <li
                  key={row.id}
                  className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm"
                >
                  <div>
                    <code>{lvl(row.oldLevel)}</code> →{" "}
                    <code>{lvl(row.newLevel)}</code>
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    <Trans>
                      {formatDateTime(row.createdAt)} · 由{" "}
                      {resolveUsername(row.changedBy)}
                    </Trans>
                    {row.expiresAt &&
                      ` · ${t(msg`到期 ${formatDateTime(row.expiresAt)}`)}`}
                  </div>
                  {row.reason && (
                    <div className="mt-1 text-xs">{row.reason}</div>
                  )}
                </li>
                );
              })}
            </ul>
          </AppSection>
        </>
      )}
    </PageShell>
  );
}
