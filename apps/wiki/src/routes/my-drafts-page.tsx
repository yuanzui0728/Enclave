import { useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TagBadge,
} from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import {
  wikiApi,
  WikiApiError,
  type MyDraftSummary,
} from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { formatDateTime } from "../lib/format";

type Notice = { tone: "success" | "danger"; text: string } | null;
type KindFilter = "all" | "private" | "world";

export function MyDraftsPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  useEffect(() => {
    if (notice?.tone === "success") {
      const timer = window.setTimeout(() => setNotice(null), 3000);
      return () => window.clearTimeout(timer);
    }
  }, [notice]);

  const listQ = useQuery({
    queryKey: ["wiki", "my-drafts"],
    queryFn: () => wikiApi.listMyDrafts(),
    enabled: !!user,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => wikiApi.deleteDraft(id),
    onSuccess: () => {
      setNotice({ tone: "success", text: t(msg`已删除草稿`) });
      void qc.invalidateQueries({ queryKey: ["wiki", "my-drafts"] });
    },
    onError: (err) => {
      // 404 = 草稿已被别处删了（多 tab、或刚好别人也在跑流程），把它当成最终
      // 一致的 success：把它从本地列表里扫走，避免 chip 计数与卡片继续残留。
      if (err instanceof WikiApiError && err.status === 404) {
        setNotice({
          tone: "success",
          text: t(msg`草稿已被其它会话删除，已为你刷新列表。`),
        });
        void qc.invalidateQueries({ queryKey: ["wiki", "my-drafts"] });
        return;
      }
      const text =
        err instanceof WikiApiError ? err.message : (err as Error).message;
      setNotice({ tone: "danger", text });
    },
  });

  const items = listQ.data ?? [];
  const filteredItems = useMemo(
    () =>
      kindFilter === "all"
        ? items
        : items.filter((it) => it.kind === kindFilter),
    [items, kindFilter],
  );

  if (!user) {
    return (
      <PageShell
        eyebrow={t(msg`我的`)}
        title={t(msg`我的草稿`)}
        description={t(msg`登录后即可查看自己未提交的角色草稿。`)}
      >
        <Card className="p-6 text-sm">
          <Trans>
            请先{" "}
            <Link
              to="/login"
              search={{ redirect: "/my-drafts" }}
              className="font-medium underline"
            >
              登录
            </Link>{" "}
            后再使用此功能。
          </Trans>
        </Card>
      </PageShell>
    );
  }

  function handleRestore(row: MyDraftSummary) {
    if (row.kind === "private") {
      void navigate({
        to: "/my-characters/new",
        search: { draftId: row.id },
      });
    } else {
      void navigate({
        to: "/create",
        search: { draftId: row.id },
      });
    }
  }

  function handleDelete(row: MyDraftSummary) {
    const label = row.name || t(msg`未命名草稿`);
    if (
      window.confirm(t(msg`确认删除「${label}」？此操作无法撤销。`))
    ) {
      deleteMut.mutate(row.id);
    }
  }

  const filterChips: { key: KindFilter; label: string; count: number }[] = [
    { key: "all", label: t(msg`全部`), count: items.length },
    {
      key: "private",
      label: t(msg`私有角色`),
      count: items.filter((it) => it.kind === "private").length,
    },
    {
      key: "world",
      label: t(msg`Wiki 公开`),
      count: items.filter((it) => it.kind === "world").length,
    },
  ];

  return (
    <PageShell
      eyebrow={t(msg`我的`)}
      title={t(msg`我的草稿`)}
      description={t(
        msg`点「AI 一键生成全部」后，无论你是否离开页面，生成完的内容都会自动保存到这里。仅你自己可见。`,
      )}
    >
      {notice && (
        <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>
      )}

      {listQ.isLoading && <LoadingBlock />}
      {listQ.isError && <ErrorBlock message={(listQ.error as Error).message} />}

      {!listQ.isLoading && !listQ.isError && items.length === 0 && (
        <Card className="space-y-4 px-6 py-10 text-center">
          <div className="text-4xl">📝</div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[color:var(--text-primary)]">
              <Trans>还没有任何草稿</Trans>
            </h2>
            <p className="mx-auto max-w-md text-sm text-[color:var(--text-secondary)]">
              <Trans>
                在「新建私有角色」或「创建 wiki 角色」页填好基础字段后，点顶部的「✨ AI
                一键生成全部」，AI 跑完后会自动保存一份草稿到这里。
              </Trans>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => void navigate({ to: "/my-characters/new" })}
            >
              <Trans>✨ 新建私有角色</Trans>
            </Button>
            <Button
              variant="ghost"
              onClick={() => void navigate({ to: "/create" })}
            >
              <Trans>创建 wiki 角色</Trans>
            </Button>
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {filterChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setKindFilter(c.key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  kindFilter === c.key
                    ? "border-[color:var(--border-strong)] bg-[color:var(--surface-card-hover)] text-[color:var(--text-primary)]"
                    : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)]"
                }`}
              >
                {c.label}
                <span className="ml-1 text-[color:var(--text-muted)]">
                  ({c.count})
                </span>
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <Card className="px-6 py-8 text-center text-sm text-[color:var(--text-secondary)]">
              <Trans>当前筛选下没有草稿。</Trans>
            </Card>
          ) : (
            <ul className="grid gap-3">
              {filteredItems.map((row) => (
                <DraftCard
                  key={row.id}
                  row={row}
                  onRestore={() => handleRestore(row)}
                  onDelete={() => handleDelete(row)}
                  isDeleting={
                    deleteMut.isPending && deleteMut.variables === row.id
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </PageShell>
  );
}

function DraftCard({
  row,
  onRestore,
  onDelete,
  isDeleting,
}: {
  row: MyDraftSummary;
  onRestore: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const t = translateRuntimeMessage;
  const displayName = row.name || t(msg`未命名草稿`);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-[color:var(--text-primary)]">
            {displayName}
          </span>
          <TagBadge
            tone={row.kind === "private" ? "neutral" : "info"}
            className="px-2 py-0.5 text-[10px]"
          >
            {row.kind === "private" ? (
              <Trans>私有</Trans>
            ) : (
              <Trans>Wiki 公开</Trans>
            )}
          </TagBadge>
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          <Trans>更新于</Trans> {formatDateTime(row.updatedAt)}
          <span className="mx-1 opacity-50">·</span>
          <Trans>由 AI 一键生成自动保存</Trans>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <Button
          variant="primary"
          size="sm"
          className="flex-1 sm:flex-none"
          onClick={onRestore}
        >
          <Trans>恢复编辑</Trans>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 sm:flex-none"
          onClick={onDelete}
          disabled={isDeleting}
        >
          {isDeleting ? <Trans>删除中…</Trans> : <Trans>🗑 删除</Trans>}
        </Button>
      </div>
    </li>
  );
}
