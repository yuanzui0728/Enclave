import { useState } from "react";
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
import { useAuth } from "../lib/use-auth";
import { wikiApi, type WikiBlockRow } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";
import { formatDateTime } from "../lib/format";

export function AdminBlocksPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showRevoked, setShowRevoked] = useState(false);
  const blocksQ = useQuery({
    queryKey: ["wiki", "blocks", showRevoked],
    queryFn: () => wikiApi.listBlocks({ active: !showRevoked }),
  });
  const usersQ = useQuery({
    queryKey: ["wiki", "users"],
    queryFn: () => wikiApi.listUsers(),
  });
  const blockMut = useMutation({
    mutationFn: wikiApi.blockUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wiki", "blocks"] }),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => wikiApi.revokeBlock(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wiki", "blocks"] }),
  });

  const [form, setForm] = useState<{
    userId: string;
    scope: "global" | "page" | "talk";
    targetCharacterId: string;
    reason: string;
    expiresAt: string;
  }>({
    userId: "",
    scope: "global",
    targetCharacterId: "",
    reason: "",
    expiresAt: "",
  });

  const usersById = new Map((usersQ.data ?? []).map((u) => [u.id, u.username]));
  const currentUserId = user?.id;

  return (
    <PageShell
      eyebrow={t(msg`管理`)}
      title={t(msg`封禁管理`)}
      description={t(
        msg`对违规用户进行全站、单条目或讨论范围的封禁，可设置到期时间或永久。已撤销/到期的记录可勾选展示。`,
      )}
    >
      <AppSection className="space-y-4">
        <h2 className="text-base font-semibold">
          <Trans>新增封禁</Trans>
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormRow label={t(msg`目标用户`)} required>
            <select
              className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">{t(msg`— 选择用户 —`)}</option>
              {(usersQ.data ?? [])
                .filter((u) => u.id !== currentUserId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}（{u.role}）
                  </option>
                ))}
            </select>
          </FormRow>
          <FormRow label={t(msg`范围`)} required>
            <select
              className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              value={form.scope}
              onChange={(e) =>
                setForm({
                  ...form,
                  scope: e.target.value as typeof form.scope,
                })
              }
            >
              <option value="global">{t(msg`全站`)}</option>
              <option value="page">{t(msg`单条目`)}</option>
              <option value="talk">{t(msg`讨论`)}</option>
            </select>
          </FormRow>
          {form.scope === "page" && (
            <FormRow label={t(msg`条目 ID`)} required className="md:col-span-2">
              <TextField
                value={form.targetCharacterId}
                onChange={(e) =>
                  setForm({ ...form, targetCharacterId: e.target.value })
                }
                placeholder={t(msg`例如：char-celebrity-andrej-karpathy`)}
              />
            </FormRow>
          )}
          <FormRow label={t(msg`原因`)} required className="md:col-span-2">
            <TextField
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={t(msg`说明为什么对此用户/范围执行封禁`)}
            />
          </FormRow>
          <FormRow
            label={t(msg`到期时间`)}
            hint={t(msg`可选；留空 = 永久`)}
            className="md:col-span-2"
          >
            <input
              type="datetime-local"
              className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              value={form.expiresAt}
              onChange={(e) =>
                setForm({ ...form, expiresAt: e.target.value })
              }
            />
          </FormRow>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="danger"
            className="w-full sm:w-auto"
            disabled={
              !form.userId ||
              !form.reason.trim() ||
              (form.scope === "page" && !form.targetCharacterId.trim()) ||
              blockMut.isPending
            }
            onClick={() =>
              blockMut.mutate({
                userId: form.userId,
                scope: form.scope,
                targetCharacterId:
                  form.scope === "page"
                    ? form.targetCharacterId.trim()
                    : undefined,
                reason: form.reason.trim(),
                expiresAt: form.expiresAt
                  ? new Date(form.expiresAt).toISOString()
                  : null,
              })
            }
          >
            {blockMut.isPending ? t(msg`提交中...`) : t(msg`提交封禁`)}
          </Button>
          {blockMut.isError && (
            <span className="text-sm text-[color:var(--state-danger-text)]">
              {(blockMut.error as Error).message}
            </span>
          )}
        </div>
      </AppSection>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">
          <Trans>封禁列表</Trans>
        </h2>
        <label className="ml-auto inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-1.5 text-sm shadow-[var(--shadow-soft)]">
          <input
            type="checkbox"
            checked={showRevoked}
            onChange={(e) => setShowRevoked(e.target.checked)}
          />
          <Trans>含已撤销 / 已到期</Trans>
        </label>
      </div>
      {blocksQ.isLoading && <LoadingBlock />}
      {blocksQ.isError && (
        <ErrorBlock message={(blocksQ.error as Error).message} />
      )}
      {revokeMut.isError && (
        <InlineNotice tone="danger">
          {(revokeMut.error as Error).message}
        </InlineNotice>
      )}
      {blocksQ.data?.length === 0 && (
        <PanelEmpty message={t(msg`没有相关封禁记录。`)} />
      )}
      <ul className="space-y-2">
        {blocksQ.data?.map((b) => (
          <BlockRow
            key={b.id}
            block={b}
            username={usersById.get(b.userId) ?? b.userId}
            onRevoke={() => revokeMut.mutate(b.id)}
            revoking={revokeMut.isPending}
          />
        ))}
      </ul>
    </PageShell>
  );
}

function BlockRow({
  block,
  username,
  onRevoke,
  revoking,
}: {
  block: WikiBlockRow;
  username: string;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const t = translateRuntimeMessage;
  const isActive =
    !block.revokedAt &&
    (!block.expiresAt || new Date(block.expiresAt) > new Date());
  return (
    <li className="flex flex-col items-start gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-[color:var(--surface-card-hover)] sm:flex-row">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-[color:var(--text-primary)]">
            {username}
          </strong>
          <StatusPill>{block.scope}</StatusPill>
          {isActive ? (
            <StatusPill>
              <Trans>生效中</Trans>
            </StatusPill>
          ) : block.revokedAt ? (
            <StatusPill>
              <Trans>已撤销</Trans>
            </StatusPill>
          ) : (
            <StatusPill>
              <Trans>已到期</Trans>
            </StatusPill>
          )}
          {block.targetCharacterId && (
            <span className="text-xs text-[color:var(--text-muted)]">
              {block.targetCharacterId}
            </span>
          )}
        </div>
        <div>{block.reason}</div>
        <div className="text-xs text-[color:var(--text-muted)]">
          <Trans>创建于 {formatDateTime(block.createdAt)}</Trans>
          {block.expiresAt &&
            ` · ${t(msg`到期 ${formatDateTime(block.expiresAt)}`)}`}
          {block.revokedAt &&
            ` · ${t(msg`撤销于 ${formatDateTime(block.revokedAt)}`)}`}
        </div>
      </div>
      {isActive && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full shrink-0 sm:w-auto"
          disabled={revoking}
          onClick={onRevoke}
        >
          <Trans>撤销</Trans>
        </Button>
      )}
    </li>
  );
}
