import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Download,
  FileText,
  ListTodo,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { InlineNoticeActionButton } from "../../../components/inline-notice-action-button";
import { EmptyState } from "../../../components/empty-state";
import { DesktopUtilityShell } from "../desktop-utility-shell";
import {
  createDesktopNote,
  deleteDesktopNote,
  hydrateDesktopNotesFromNative,
  readDesktopNotes,
  updateDesktopNote,
  type DesktopNoteRecord,
} from "./desktop-notes-storage";
import { revealSavedFile } from "../../../runtime/reveal-saved-file";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { saveGeneratedFile } from "../../../runtime/save-generated-file";

type DesktopNotesWorkspaceProps = {
  selectedNoteId?: string;
  onSelectNote?: (noteId?: string) => void;
};

type EditorAction = {
  key: string;
  label: string;
  icon: typeof ListTodo;
  snippet: () => string;
};

const editorActions: EditorAction[] = [
  {
    key: "todo",
    label: "待办",
    icon: ListTodo,
    snippet: () => "\n- [ ] ",
  },
  {
    key: "divider",
    label: "分隔线",
    icon: Rows3,
    snippet: () => "\n----------------\n",
  },
  {
    key: "timestamp",
    label: "时间",
    icon: Clock3,
    snippet: () => `\n${formatNoteTimestamp(new Date().toISOString(), true)}\n`,
  },
];

function areDesktopNotesEqual(
  left: DesktopNoteRecord[],
  right: DesktopNoteRecord[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function DesktopNotesWorkspace({
  selectedNoteId,
  onSelectNote,
}: DesktopNotesWorkspaceProps) {
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopNotes = runtimeConfig.appPlatform === "desktop";
  const [notes, setNotes] = useState<DesktopNoteRecord[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [actionNotice, setActionNotice] = useState<{
    message: string;
    tone: "success" | "danger";
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const notesStorageLabel = nativeDesktopNotes
    ? "桌面端保存在当前设备"
    : "桌面端临时保存在当前浏览器";

  const activeNote = useMemo(
    () => notes.find((item) => item.id === activeNoteId) ?? null,
    [activeNoteId, notes],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializeNotesWorkspace() {
      const existingNotes = nativeDesktopNotes
        ? await hydrateDesktopNotesFromNative()
        : readDesktopNotes();
      if (cancelled) {
        return;
      }

      if (!existingNotes.length) {
        const createdNote = createDesktopNote();
        if (cancelled) {
          return;
        }

        setNotes([createdNote]);
        setActiveNoteId(createdNote.id);
        setEditorValue(createdNote.content);
        onSelectNote?.(createdNote.id);
        return;
      }

      const resolvedNoteId = resolveSelectedNoteId(existingNotes, selectedNoteId);
      const resolvedNote =
        existingNotes.find((item) => item.id === resolvedNoteId) ??
        existingNotes[0];

      setNotes(existingNotes);
      setActiveNoteId(resolvedNote.id);
      setEditorValue(resolvedNote.content);
      if (resolvedNote.id !== selectedNoteId) {
        onSelectNote?.(resolvedNote.id);
      }
    }

    void initializeNotesWorkspace();

    return () => {
      cancelled = true;
    };
  }, [nativeDesktopNotes, onSelectNote, selectedNoteId]);

  useEffect(() => {
    if (!notes.length) {
      return;
    }

    const resolvedNoteId = resolveSelectedNoteId(notes, selectedNoteId);
    if (!resolvedNoteId || resolvedNoteId === activeNoteId) {
      return;
    }

    const nextNote = notes.find((item) => item.id === resolvedNoteId);
    if (!nextNote) {
      return;
    }

    setActiveNoteId(nextNote.id);
    setEditorValue(nextNote.content);
  }, [activeNoteId, notes, selectedNoteId]);

  useEffect(() => {
    if (!activeNote || activeNote.content === editorValue) {
      return;
    }

    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const nextNotes = updateDesktopNote(activeNote.id, editorValue);
      setNotes(nextNotes);
      setSaveState("saved");
    }, 260);

    return () => window.clearTimeout(timer);
  }, [activeNote, editorValue]);

  useEffect(() => {
    if (!actionNotice) {
      return;
    }

    const timer = window.setTimeout(
      () => setActionNotice(null),
      actionNotice.actionLabel ? 5000 : 2200,
    );
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    if (!nativeDesktopNotes) {
      return;
    }

    let cancelled = false;

    async function refreshNotesFromNative() {
      if (
        saveState === "saving" ||
        (activeNote && activeNote.content !== editorValue)
      ) {
        return;
      }

      const existingNotes = await hydrateDesktopNotesFromNative();
      if (cancelled) {
        return;
      }

      setNotes((current) =>
        areDesktopNotesEqual(current, existingNotes) ? current : existingNotes,
      );

      if (!existingNotes.length) {
        return;
      }

      const preferredNoteId = activeNoteId ?? selectedNoteId;
      const nextActiveNoteId = resolveSelectedNoteId(
        existingNotes,
        preferredNoteId,
      );
      const nextActiveNote =
        existingNotes.find((item) => item.id === nextActiveNoteId) ??
        existingNotes[0];

      if (!nextActiveNote) {
        return;
      }

      setActiveNoteId((current) =>
        current === nextActiveNote.id ? current : nextActiveNote.id,
      );
      setEditorValue((current) =>
        current === nextActiveNote.content ? current : nextActiveNote.content,
      );
      if (nextActiveNote.id !== preferredNoteId) {
        onSelectNote?.(nextActiveNote.id);
      }
    }

    const handleFocus = () => {
      void refreshNotesFromNative();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void refreshNotesFromNative();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeNote,
    activeNoteId,
    editorValue,
    nativeDesktopNotes,
    onSelectNote,
    saveState,
    selectedNoteId,
  ]);

  function handleCreateNote() {
    const createdNote = createDesktopNote();
    setNotes((current) => [createdNote, ...current]);
    setActiveNoteId(createdNote.id);
    setEditorValue(createdNote.content);
    setSaveState("saved");
    onSelectNote?.(createdNote.id);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }

  function handleSelectNote(note: DesktopNoteRecord) {
    setActiveNoteId(note.id);
    setEditorValue(note.content);
    setSaveState("saved");
    onSelectNote?.(note.id);
  }

  function handleDeleteNote() {
    if (!activeNote) {
      return;
    }

    const nextNotes = deleteDesktopNote(activeNote.id);
    setNotes(nextNotes);

    if (!nextNotes.length) {
      setActiveNoteId(null);
      setEditorValue("");
      onSelectNote?.();
      return;
    }

    const nextNote = nextNotes[0];
    setActiveNoteId(nextNote.id);
    setEditorValue(nextNote.content);
    onSelectNote?.(nextNote.id);
  }

  async function handleExportNote() {
    if (!activeNote) {
      return;
    }

    const result = await saveGeneratedFile({
      contents: editorValue,
      fileName: buildDesktopNoteExportFileName(activeNote.title, activeNote.updatedAt),
      mimeType: "text/plain;charset=utf-8",
      dialogTitle: "导出笔记",
      kindLabel: "笔记",
    });

    if (result.status === "cancelled") {
      return;
    }

    const canRevealSavedFile =
      result.status === "saved" && Boolean(result.savedPath?.trim());
    const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

    setActionNotice({
      message: result.message,
      tone: result.status === "failed" ? "danger" : "success",
      actionLabel: canRevealSavedFile ? "打开位置" : undefined,
      onAction:
        savedPath
          ? () => {
              void revealSavedFile(savedPath).then((revealed) => {
                setActionNotice({
                  message: revealed
                    ? "已打开笔记所在位置。"
                    : "打开所在位置失败，请稍后再试。",
                  tone: revealed ? "success" : "danger",
                });
              });
            }
          : undefined,
    });
  }

  function handleInsertSnippet(snippet: string) {
    const target = editorRef.current;

    if (!target) {
      setEditorValue((current) => `${current}${snippet}`);
      return;
    }

    const selectionStart = target.selectionStart ?? editorValue.length;
    const selectionEnd = target.selectionEnd ?? editorValue.length;
    const nextValue =
      editorValue.slice(0, selectionStart) +
      snippet +
      editorValue.slice(selectionEnd);

    setEditorValue(nextValue);
    requestAnimationFrame(() => {
      const cursorPosition = selectionStart + snippet.length;
      target.focus();
      target.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  return (
    <DesktopUtilityShell
      title={activeNote?.title ?? "笔记"}
      subtitle={
        activeNote
          ? `${saveState === "saving" ? "正在自动保存..." : "内容已自动保存"} · 最近编辑 ${formatNoteTimestamp(activeNote.updatedAt, true)}`
          : notesStorageLabel
      }
      toolbar={
        <div className="flex items-center gap-2">
          {activeNote ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExportNote()}
              className="h-9 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <Download size={15} />
              导出笔记
            </Button>
          ) : null}
          <div
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium",
              saveState === "saving"
                ? "border-[rgba(250,173,20,0.18)] bg-[rgba(250,173,20,0.10)] text-[#a16207]"
                : "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
            )}
          >
            {saveState === "saving" ? "保存中" : "已保存"}
          </div>
          {activeNote ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeleteNote}
              className="h-9 w-9 rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[rgba(239,68,68,0.08)] hover:text-[color:var(--state-danger-text)]"
              aria-label="删除当前笔记"
            >
              <Trash2 size={16} />
            </Button>
          ) : null}
        </div>
      }
      sidebarClassName="w-[290px]"
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                  笔记
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {notesStorageLabel}
                </div>
              </div>
              <Button
                variant="secondary"
                size="icon"
                onClick={handleCreateNote}
                className="h-9 w-9 rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                aria-label="新建笔记"
              >
                <Plus size={16} />
              </Button>
            </div>
            <div className="mt-4 rounded-[16px] border border-[color:var(--border-faint)] bg-white p-3 shadow-[var(--shadow-section)]">
              <div className="text-[11px] text-[color:var(--text-muted)]">
                当前笔记
              </div>
              <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                共 {notes.length} 条
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-3 py-3">
            {notes.length ? (
              <div className="space-y-2">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => handleSelectNote(note)}
                    className={cn(
                      "w-full rounded-[16px] border px-4 py-3 text-left transition shadow-[var(--shadow-section)]",
                      note.id === activeNoteId
                        ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)]"
                        : "border-[color:var(--border-faint)] bg-white hover:bg-[color:var(--surface-console)]",
                    )}
                  >
                    <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                      {note.title}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-muted)]">
                      {note.excerpt}
                    </div>
                    <div className="mt-2 text-[11px] text-[color:var(--text-dim)]">
                      {formatNoteTimestamp(note.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <EmptyState
                  title="还没有笔记"
                  description="从右上角新建第一条桌面笔记。"
                />
              </div>
            )}
          </div>
        </div>
      }
      contentClassName="bg-[rgba(255,255,255,0.62)]"
    >
      {activeNote ? (
        <div className="space-y-5 p-6">
          {actionNotice ? (
            <InlineNotice
              className="flex items-center justify-between gap-3 text-xs"
              tone={actionNotice.tone}
            >
              <span>{actionNotice.message}</span>
              {actionNotice.actionLabel && actionNotice.onAction ? (
                <InlineNoticeActionButton
                  label={actionNotice.actionLabel}
                  onClick={actionNotice.onAction}
                />
              ) : null}
            </InlineNotice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {editorActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => handleInsertSnippet(action.snippet())}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-white px-3.5 py-2 text-xs text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                >
                  <Icon size={14} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mx-auto flex min-h-[calc(100vh-14rem)] w-full max-w-4xl flex-col rounded-[20px] border border-[color:var(--border-faint)] bg-white p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-xs tracking-[0.12em] text-[color:var(--text-dim)]">
              <FileText size={14} />
              <span>桌面笔记</span>
            </div>
            <textarea
              ref={editorRef}
              value={editorValue}
              onChange={(event) => setEditorValue(event.target.value)}
              placeholder="在这里记录灵感、待办或要发给朋友的内容"
              className="mt-4 min-h-[560px] flex-1 resize-none border-none bg-transparent px-0 py-0 text-[15px] leading-8 shadow-none hover:bg-transparent focus:translate-y-0 focus:border-none focus:bg-transparent focus:shadow-none"
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center px-6 py-8">
          <div className="w-full max-w-md rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
            <EmptyState
              title="当前没有可编辑的笔记"
              description="先新建一条笔记，再继续整理你的想法。"
            />
            <Button
              variant="primary"
              size="lg"
              onClick={handleCreateNote}
              className="mt-6 h-10 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              新建笔记
            </Button>
          </div>
        </div>
      )}
    </DesktopUtilityShell>
  );
}

function resolveSelectedNoteId(
  notes: DesktopNoteRecord[],
  preferredNoteId?: string,
) {
  if (preferredNoteId && notes.some((item) => item.id === preferredNoteId)) {
    return preferredNoteId;
  }

  return notes[0]?.id;
}

function formatNoteTimestamp(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return withTime ? "刚刚" : "最近";
  }

  return withTime
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function buildDesktopNoteExportFileName(title: string, updatedAt: string) {
  const normalizedTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-");
  const date = Number.isNaN(Date.parse(updatedAt))
    ? new Date().toISOString().slice(0, 10)
    : updatedAt.slice(0, 10);
  return `${normalizedTitle || "desktop-note"}-${date}.txt`;
}
