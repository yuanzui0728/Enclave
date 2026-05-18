import { useEffect, useRef, useState } from "react";
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
  type PrivateCharacterRecord,
} from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { formatDateTime } from "../lib/format";

type Notice = { tone: "success" | "danger"; text: string } | null;

export function MyCharactersPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // 3 秒后自动清掉成功 toast；危险消息（删除失败等）保留以便用户看清。
  useEffect(() => {
    if (notice?.tone === "success") {
      const timer = window.setTimeout(() => setNotice(null), 3000);
      return () => window.clearTimeout(timer);
    }
  }, [notice]);

  const listQ = useQuery({
    queryKey: ["wiki", "my-characters"],
    queryFn: () => wikiApi.listMyCharacters(),
    enabled: !!user,
  });

  const importMut = useMutation({
    mutationFn: (file: File) => wikiApi.importMyCharacter(file),
    onSuccess: (res) => {
      setNotice({
        tone: "success",
        text: res.overwrote
          ? t(msg`已覆盖同名角色：${res.record.name}`)
          : t(msg`已导入新角色：${res.record.name}`),
      });
      void qc.invalidateQueries({ queryKey: ["wiki", "my-characters"] });
    },
    onError: (err) => surfaceError(err),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => wikiApi.deleteMyCharacter(id),
    onSuccess: () => {
      setNotice({ tone: "success", text: t(msg`已删除`) });
      void qc.invalidateQueries({ queryKey: ["wiki", "my-characters"] });
    },
    onError: (err) => surfaceError(err),
  });

  const exportMut = useMutation({
    mutationFn: (row: { id: string; name: string }) =>
      wikiApi.exportMyCharacter(row.id, row.name),
    onError: (err) => surfaceError(err),
  });

  function surfaceError(err: unknown) {
    const text =
      err instanceof WikiApiError ? err.message : (err as Error).message;
    setNotice({ tone: "danger", text });
  }

  function handleImportClick() {
    setNotice(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) importMut.mutate(file);
    event.target.value = "";
  }

  if (!user) {
    return (
      <PageShell
        eyebrow={t(msg`我的`)}
        title={t(msg`我的私有角色`)}
        description={t(msg`登录后即可创建和管理只属于你自己的角色。`)}
      >
        <Card className="p-6 text-sm">
          <Trans>
            请先{" "}
            <Link to="/login" className="font-medium underline">
              登录
            </Link>{" "}
            后再使用此功能。
          </Trans>
        </Card>
      </PageShell>
    );
  }

  const items = listQ.data ?? [];

  return (
    <PageShell
      eyebrow={t(msg`我的`)}
      title={t(msg`我的私有角色`)}
      description={t(
        msg`这里的角色不会出现在公开词条目录，也不走巡查审核流。你可以创建、编辑、导出 JSON，或上传一个 JSON 文件覆盖同名角色。导出的 JSON 文件可在 app 端直接导入到你的世界。`,
      )}
      actions={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImportClick}
            disabled={importMut.isPending}
          >
            {importMut.isPending ? (
              <Trans>导入中…</Trans>
            ) : (
              <Trans>📥 导入文件</Trans>
            )}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void navigate({ to: "/my-characters/new" })}
          >
            <Trans>✨ 新建角色</Trans>
          </Button>
        </>
      }
    >
      {notice && (
        <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>
      )}

      {listQ.isLoading && <LoadingBlock />}
      {listQ.isError && (
        <ErrorBlock message={(listQ.error as Error).message} />
      )}

      {!listQ.isLoading && !listQ.isError && items.length === 0 && (
        <Card className="space-y-4 px-6 py-10 text-center">
          <div className="text-4xl">🗂️</div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[color:var(--text-primary)]">
              <Trans>还没有任何私有角色</Trans>
            </h2>
            <p className="mx-auto max-w-md text-sm text-[color:var(--text-secondary)]">
              <Trans>
                从零创建一个完全属于你自己的角色，或者上传一份从其它世界导出的
                JSON 文件来快速开始。
              </Trans>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => void navigate({ to: "/my-characters/new" })}
            >
              <Trans>✨ 新建第一个角色</Trans>
            </Button>
            <Button
              variant="ghost"
              onClick={handleImportClick}
              disabled={importMut.isPending}
            >
              {importMut.isPending ? (
                <Trans>导入中…</Trans>
              ) : (
                <Trans>📥 导入 JSON 文件</Trans>
              )}
            </Button>
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
            <span>
              <Trans>共 {items.length} 个角色</Trans>
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((row) => (
              <CharacterCard
                key={row.id}
                row={row}
                onExport={() =>
                  exportMut.mutate({ id: row.id, name: row.name })
                }
                onDelete={() => {
                  if (
                    window.confirm(
                      t(msg`确认删除「${row.name}」？此操作无法撤销。`),
                    )
                  ) {
                    deleteMut.mutate(row.id);
                  }
                }}
                isExporting={exportMut.isPending}
                isDeleting={deleteMut.isPending}
              />
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}

function CharacterCard({
  row,
  onExport,
  onDelete,
  isExporting,
  isDeleting,
}: {
  row: PrivateCharacterRecord;
  onExport: () => void;
  onDelete: () => void;
  isExporting: boolean;
  isDeleting: boolean;
}) {
  const t = translateRuntimeMessage;
  return (
    <li className="group relative flex flex-col gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]">
      <Link
        to="/my-characters/$id"
        params={{ id: row.id }}
        className="flex items-start gap-3"
      >
        <CharacterAvatar avatar={row.avatar} name={row.name} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate text-base font-semibold text-[color:var(--text-primary)] group-hover:underline">
            {row.name}
          </div>
          <div className="truncate text-xs text-[color:var(--text-muted)]">
            {row.relationship || row.relationshipType}
            <span className="mx-1 opacity-50">·</span>
            <Trans>更新于</Trans> {formatDateTime(row.updatedAt)}
          </div>
        </div>
      </Link>
      {row.bio && (
        <p className="line-clamp-2 text-xs leading-relaxed text-[color:var(--text-secondary)]">
          {row.bio}
        </p>
      )}
      {row.expertDomains?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.expertDomains.slice(0, 5).map((d, idx) => (
            <TagBadge
              key={`${d}-${idx}`}
              tone="neutral"
              className="px-2 py-0.5 text-[10px]"
            >
              {d}
            </TagBadge>
          ))}
          {row.expertDomains.length > 5 && (
            <span className="text-[10px] text-[color:var(--text-muted)]">
              +{row.expertDomains.length - 5}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-end gap-1 border-t border-[color:var(--border-faint)] pt-2">
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          aria-label={t(msg`导出此角色 JSON`)}
          className="rounded-md px-2 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)] disabled:opacity-50"
        >
          {isExporting ? <Trans>导出中…</Trans> : <Trans>📤 导出</Trans>}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={t(msg`删除此角色`)}
          className="rounded-md px-2 py-1 text-xs text-[color:var(--state-danger-text)] transition-colors hover:bg-rose-500/10 disabled:opacity-50"
        >
          <Trans>🗑 删除</Trans>
        </button>
      </div>
    </li>
  );
}

function CharacterAvatar({
  avatar,
  name,
}: {
  avatar: string;
  name: string;
}) {
  const trimmed = (avatar ?? "").trim();
  // 协议相对 URL（"//evil.example/x.png"）以 `/` 开头会被判为 isUrl=true，浏览器
  // 实际发到 evil.example，等同泄露 IP/UA；反斜杠在 WHATWG URL parser 里被规
  // 范成正斜杠 ("/\evil" → "//evil") —— 这里都拒掉，回落到首字母方块。
  // 私有角色虽然只有 owner 看得到，但 owner 可能截图/分享 wiki，仍要堵。
  const looksLikeProtocolRelative =
    trimmed.startsWith("//") || trimmed.includes("\\");
  const isUrl =
    !looksLikeProtocolRelative &&
    (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/"));
  const [imgFailed, setImgFailed] = useState(false);
  // avatar 变化（用户编辑后回到列表，同一 row.id 但 avatar 不同）时重试加载，
  // 否则 imgFailed=true 会粘住，新 URL 永远不试。
  useEffect(() => {
    setImgFailed(false);
  }, [trimmed]);
  const display = trimmed.length > 0 ? trimmed.slice(0, 2) : name.slice(0, 1);
  if (isUrl && !imgFailed) {
    return (
      <img
        src={trimmed}
        alt=""
        className="h-12 w-12 shrink-0 rounded-2xl object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[image:var(--brand-gradient)] text-lg text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]">
      {display || "🪞"}
    </div>
  );
}
