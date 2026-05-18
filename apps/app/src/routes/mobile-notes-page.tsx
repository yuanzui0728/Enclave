import { useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  FileText,
  Plus,
  StickyNote,
} from "lucide-react";
import {
  getFavoriteNotes,
  type FavoriteNoteSummary,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  LoadingBlock,
} from "@yinjie/ui";

import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";

function buildScratchDraftId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `note-draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

import {
  createDesktopNoteDraft,
  readDesktopNoteDrafts,
  type DesktopNoteDraftRecord,
} from "../features/favorites/note-drafts-storage";
import { resolveNoteTitle } from "../features/favorites/note-editor-helpers";
import { buildMobileNoteEditorRouteHash } from "../features/notes/mobile-note-editor-route-state";
import { formatMessageTimestamp } from "../lib/format";
import {
  isDesktopOnlyPath,
  navigateBackOrFallback,
} from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function MobileNotesPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const notesQuery = useQuery({
    queryKey: ["favorite-notes", baseUrl],
    queryFn: () => getFavoriteNotes(baseUrl),
    staleTime: 15_000,
  });

  const [drafts, setDrafts] = useState<DesktopNoteDraftRecord[]>(() =>
    readDesktopNoteDrafts(),
  );

  useEffect(() => {
    setDrafts(readDesktopNoteDrafts());
  }, [notesQuery.data]);

  const savedNoteIds = useMemo(
    () =>
      new Set(
        (notesQuery.data ?? []).map((note: FavoriteNoteSummary) => note.id),
      ),
    [notesQuery.data],
  );

  const standaloneDrafts = useMemo(
    () =>
      drafts.filter((draft) => {
        if (!draft.contentText.trim() && !draft.assets.length) {
          return false;
        }
        if (draft.noteId && savedNoteIds.has(draft.noteId)) {
          return false;
        }
        return true;
      }),
    [drafts, savedNoteIds],
  );

  function handleBack() {
    navigateBackOrFallback(
      () => {
        void navigate({ to: "/tabs/chat" });
      },
      "/tabs/chat",
    );
  }

  function handleCreate() {
    const draft = createDesktopNoteDraft();
    const safeReturnPath = isDesktopOnlyPath(pathname) ? undefined : pathname;
    const nextHash = buildMobileNoteEditorRouteHash({
      draftId: draft.draftId,
      returnPath: safeReturnPath,
    });
    void navigate({
      to: "/notes/new",
      ...(nextHash ? { hash: nextHash } : {}),
    });
  }

  function handleOpenNote(noteId: string) {
    // 不预创建草稿：createDesktopNoteDraft({ noteId }) 会落地一条空 draft，
    // 编辑器初始化拿到它后会锁 sessionKey，等服务端笔记到达时不再回填，
    // 导致第一次进入空白、第二次才显示内容（mobile-note-editor-page.tsx:430-514）。
    // 只生成 draftId 字符串塞进 hash，编辑器自己按 noteId 拉数据回填。
    const draftId = buildScratchDraftId();
    const safeReturnPath = isDesktopOnlyPath(pathname) ? undefined : pathname;
    const nextHash = buildMobileNoteEditorRouteHash({
      draftId,
      noteId,
      returnPath: safeReturnPath,
    });
    void navigate({
      to: "/notes/new",
      ...(nextHash ? { hash: nextHash } : {}),
    });
  }

  function handleOpenDraft(draft: DesktopNoteDraftRecord) {
    const safeReturnPath = isDesktopOnlyPath(pathname) ? undefined : pathname;
    const nextHash = buildMobileNoteEditorRouteHash({
      draftId: draft.draftId,
      noteId: draft.noteId,
      returnPath: safeReturnPath,
    });
    void navigate({
      to: "/notes/new",
      ...(nextHash ? { hash: nextHash } : {}),
    });
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`我的笔记`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCreate}
            className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
            aria-label={t(msg`新建笔记`)}
          >
            <Plus size={18} strokeWidth={2.4} />
          </Button>
        }
      />

      <div className="min-h-0 flex-1 space-y-3 px-4 py-4">
        {notesQuery.isLoading ? (
          <LoadingBlock label={t(msg`正在读取我的笔记...`)} />
        ) : null}

        {notesQuery.isError ? (
          <ErrorBlock
            message={
              notesQuery.error instanceof Error
                ? notesQuery.error.message
                : t(msg`读取笔记失败，请稍后再试。`)
            }
          />
        ) : null}

        {standaloneDrafts.length ? (
          <section className="space-y-2">
            <div className="px-1 text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
              {t(msg`未保存草稿`)}
            </div>
            <div className="space-y-2">
              {standaloneDrafts.map((draft) => (
                <DraftRow
                  key={draft.draftId}
                  draft={draft}
                  onClick={() => handleOpenDraft(draft)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {notesQuery.data && notesQuery.data.length ? (
          <section className="space-y-2">
            <div className="px-1 text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
              {t(msg`已收藏笔记`)}
            </div>
            <div className="space-y-2">
              {notesQuery.data.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  onClick={() => handleOpenNote(note.id)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!notesQuery.isLoading &&
        !notesQuery.isError &&
        !standaloneDrafts.length &&
        !(notesQuery.data && notesQuery.data.length) ? (
          <EmptyState
            title={t(msg`还没有笔记`)}
            description={t(msg`记下灵感、待办、链接和图片，发到聊天里也很方便。`)}
            action={
              <Button
                variant="primary"
                onClick={handleCreate}
                className="h-10 rounded-[12px] bg-[color:var(--brand-primary)] px-5 text-white hover:opacity-95"
              >
                <Plus size={16} />
                <span className="ml-1">{t(msg`新建笔记`)}</span>
              </Button>
            }
          />
        ) : null}
      </div>
    </AppPage>
  );
}

function NoteRow({
  note,
  onClick,
}: {
  note: FavoriteNoteSummary;
  onClick: () => void;
}) {
  const t = useRuntimeTranslator();
  const previewImage = note.assets.find((asset) => asset.kind === "image");

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-3 py-3 text-left shadow-[var(--shadow-soft)] active:bg-[color:var(--surface-console)]"
    >
      <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-[12px] bg-[rgba(7,193,96,0.08)]">
        {previewImage?.url ? (
          <img
            src={previewImage.url}
            alt={note.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[color:var(--brand-primary)]">
            <StickyNote size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
          {note.title || t(msg`无标题笔记`)}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[12px] text-[color:var(--text-muted)]">
          {note.excerpt || t(msg`这条笔记还没有正文摘要。`)}
        </div>
        <div className="mt-1 text-[10px] text-[color:var(--text-dim)]">
          {formatMessageTimestamp(note.updatedAt)}
        </div>
      </div>
    </button>
  );
}

function DraftRow({
  draft,
  onClick,
}: {
  draft: DesktopNoteDraftRecord;
  onClick: () => void;
}) {
  const t = useRuntimeTranslator();
  const title = resolveNoteTitle(draft.contentText);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[14px] border border-dashed border-[color:var(--border-strong)]/40 bg-white/72 px-3 py-3 text-left active:bg-[color:var(--surface-console)]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[rgba(15,23,42,0.05)] text-[color:var(--text-secondary)]">
        <FileText size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[12px] text-[color:var(--text-muted)]">
          {draft.contentText.trim() || t(msg`仅含附件的草稿`)}
        </div>
        <div className="mt-1 text-[10px] text-[color:var(--text-dim)]">
          {t(msg`草稿 · 更新于 ${formatMessageTimestamp(draft.updatedAt)}`)}
        </div>
      </div>
    </button>
  );
}
