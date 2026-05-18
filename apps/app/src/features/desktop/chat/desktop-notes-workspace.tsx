import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage, useRuntimeTranslator } from "@yinjie/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFavoriteNote,
  getConversations,
  getFavoriteNote,
  removeFavoriteNote,
  sendGroupMessage,
  updateFavoriteNote,
  uploadChatAttachment,
  type ConversationListItem,
  type FavoriteNoteAsset,
  type FavoriteNoteDocument,
  type FavoriteNoteSummary,
  type FavoriteRecord,
} from "@yinjie/contracts";
import {
  EMPTY_NOTE_EDITOR_STATE,
  buildEditorStateFromDocument,
  buildEditorStateFromDraft,
  buildNoteCardAttachment,
  buildNoteMutationPayload,
  buildNoteSendDialogNote,
  buildNoteSendDialogNoteFromDocument,
  buildNoteSnapshot,
  escapeHtml,
  escapeHtmlAttribute,
  extractNoteTextFromHtml,
  filterAssetsByHtml,
  isFavoriteNoteMissingError,
  isNoteContentEmpty,
  mergeNoteAssets,
  normalizeEditorHtml,
  shouldDiscardEmptyDraftForApi,
  removeFavoriteNoteRecord,
  removeFavoriteNoteSummary,
  resolveNoteTitle,
  upsertFavoriteNoteRecord,
  upsertFavoriteNoteSummary,
  type NoteEditorState,
} from "../../favorites/note-editor-helpers";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import {
  ArrowLeft,
  Bold,
  FolderUp,
  Italic,
  List,
  ListTodo,
  Save,
  Send,
  Tag,
  Trash2,
  Underline,
  X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { resolveDesktopWindowReturnTarget } from "../../../lib/desktop-window-return-target";
import { navigateBackOrFallback } from "../../../lib/history-back";
import { emitChatMessage, joinConversationRoom } from "../../../lib/socket";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import {
  closeCurrentDesktopWindow,
  focusMainDesktopWindow,
  focusStandaloneDesktopWindow,
} from "../../../runtime/desktop-windowing";
import {
  clearDesktopNoteDraft,
  createDesktopNoteDraft,
  readDesktopNoteDraft,
  readDesktopNoteDraftByNoteId,
  saveDesktopNoteDraft,
} from "./desktop-notes-storage";
import { DesktopChatConfirmDialog } from "./desktop-chat-confirm-dialog";
import {
  DesktopNoteSendDialog,
  type DesktopNoteSendDialogNote,
} from "./desktop-note-send-dialog";

type DesktopNotesWorkspaceProps = {
  selectedNoteId?: string;
  draftId?: string;
  standaloneWindow?: boolean;
  returnTo?: string;
  onSavedNote?: (noteId: string, draftId: string) => void;
};

type NoteNotice = {
  tone: "success" | "danger";
  message: string;
};

export function DesktopNotesWorkspace({
  selectedNoteId,
  draftId,
  standaloneWindow = false,
  returnTo,
  onSavedNote,
}: DesktopNotesWorkspaceProps) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedSessionKeyRef = useRef("");
  // 用户点"保存"后接着点"返回"：保存这边 mutateAsync 还在飞，DesktopNotesWorkspace
  // 已经被 unmount（noteEditorRouteState 变 null，FavoritesPage 切回列表视图）。
  // saveMutation.onSuccess 仍然会在 mutateFn 收到响应时 fire，里面的
  // onSavedNote?.(savedNote.id, nextDraftId) 会让父组件 navigate({...replace:true})
  // 把 URL 写回 #draftId=...&noteId=... → 用户被"弹"回编辑器，体验是
  // "我明明点了返回，编辑器自己跳回来了"。
  // 标记 unmount 后跳过 onSavedNote 即可——setQueryData / 草稿落盘等本地副作用
  // 仍然执行，列表能正确反映新存的笔记，但不再强行把用户拽回编辑器。
  const unmountedRef = useRef(false);
  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    [],
  );
  const [noteId, setNoteId] = useState(selectedNoteId);
  const [activeDraftId, setActiveDraftId] = useState(
    () => draftId?.trim() || selectedNoteId?.trim() || "",
  );
  const [editorState, setEditorState] = useState<NoteEditorState>(
    EMPTY_NOTE_EDITOR_STATE,
  );
  const [savedSnapshot, setSavedSnapshot] = useState(
    buildNoteSnapshot(EMPTY_NOTE_EDITOR_STATE),
  );
  const [notice, setNotice] = useState<NoteNotice | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [sendDialogNote, setSendDialogNote] =
    useState<DesktopNoteSendDialogNote | null>(null);

  const noteQuery = useQuery({
    queryKey: ["favorite-note", baseUrl, selectedNoteId],
    queryFn: () => getFavoriteNote(selectedNoteId!, baseUrl),
    enabled: Boolean(selectedNoteId),
  });
  const recentConversationsQuery = useQuery({
    // 跟 chat-list / desktop-chat-window-page / discover-page 等十几处共享同一份
    // 会话列表 cache，避免开"发送笔记"弹层重新打一次 getConversations
    // 网络（用户聊会话列表早就拉过了）。之前用 "desktop-note-send-conversations"
    // 单独一份 key，每次开弹层都要等冷启动 fetch；而且 sendMutation.onSuccess
    // 后只 invalidate ["app-conversations", baseUrl]，这份独立 cache 不
    // 失效，再开弹层看到的"最近活跃"还是发送前的时间戳。
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(sendDialogNote),
  });

  // sessionKey 用 draftId 单独标识初始化作用域：早先把 selectedNoteId 也拼进去
  // 之后，每次"创建笔记"保存成功 → 父级 navigate(replace) 把 noteId 写回 hash
  // → 这边 selectedNoteId 从 undefined 变成 savedNote.id → sessionKey 从
  // "new:<draft>" 变成 "<id>:<draft>" → 初始化 effect 再触发一次 applyNoteSource
  // → editorRef.current.innerHTML 被重写一遍，contentEditable 上的光标 / 选区被
  // 重置，用户点完保存想接着打字得再点一下编辑器。
  // 实际上 draftId 才是这一次"编辑会话"的唯一标识：同一份草稿无论 selectedNoteId
  // 在保存前/后是 undefined 还是 savedNote.id，它指的都是同一段内容，没必要再
  // 跑一次 init；保存的 onSuccess 已经同步把 editorState/savedSnapshot/innerHTML
  // 都设到位了。切到另一条笔记一定会换 draftId（openInlineNoteEditor 会
  // createDesktopNoteDraft 出新的 draftId），所以正常的"会话切换"仍然会让
  // sessionKey 变、init effect 仍然重新跑。
  const sessionKey = draftId?.trim() || activeDraftId || "";
  const missingSelectedNote =
    selectedNoteId && isFavoriteNoteMissingError(noteQuery.error);

  const currentSnapshot = useMemo(
    () => buildNoteSnapshot(editorState),
    [editorState],
  );
  const isDirty = currentSnapshot !== savedSnapshot;
  const noteTitle = useMemo(
    () => resolveNoteTitle(editorState.contentText),
    [editorState.contentText],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildNoteMutationPayload(editorState);
      return noteId
        ? updateFavoriteNote(noteId, payload, baseUrl)
        : createFavoriteNote(payload, baseUrl);
    },
    onSuccess: async (savedNote) => {
      const nextDraftId = activeDraftId || draftId?.trim() || savedNote.id;
      const nextState = buildEditorStateFromDocument(savedNote);
      const nextSnapshot = buildNoteSnapshot(nextState);

      setNoteId(savedNote.id);
      setEditorState(nextState);
      setSavedSnapshot(nextSnapshot);
      if (editorRef.current) {
        editorRef.current.innerHTML = nextState.contentHtml;
      }
      setNotice({
        tone: "success",
        message: t(msg`笔记已保存到收藏。`),
      });

      saveDesktopNoteDraft({
        draftId: nextDraftId,
        noteId: savedNote.id,
        ...nextState,
        updatedAt: new Date().toISOString(),
      });

      queryClient.setQueryData<FavoriteNoteDocument>(
        ["favorite-note", baseUrl, savedNote.id],
        savedNote,
      );
      queryClient.setQueryData<FavoriteNoteSummary[]>(
        ["favorite-notes", baseUrl],
        (current) => upsertFavoriteNoteSummary(current, savedNote),
      );
      queryClient.setQueryData<FavoriteRecord[]>(
        ["app-favorites", baseUrl],
        (current) => upsertFavoriteNoteRecord(current, savedNote),
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-favorites", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["favorite-notes", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["favorite-note", baseUrl, savedNote.id],
        }),
      ]);

      // 见 unmountedRef 注释：用户点保存后又点了返回时，别再 navigate 回编辑器。
      if (unmountedRef.current) {
        return;
      }
      onSavedNote?.(savedNote.id, nextDraftId);
    },
    onError: (error) => {
      setNotice({
        tone: "danger",
        message:
          error instanceof Error ? error.message : t(msg`保存失败，请稍后再试。`),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!noteId) {
        return { success: true as const };
      }

      return removeFavoriteNote(noteId, baseUrl);
    },
    onSuccess: async () => {
      if (activeDraftId) {
        clearDesktopNoteDraft(activeDraftId);
      }

      setSendDialogNote(null);

      if (noteId) {
        queryClient.setQueryData<FavoriteNoteSummary[]>(
          ["favorite-notes", baseUrl],
          (current) => removeFavoriteNoteSummary(current, noteId),
        );
        queryClient.setQueryData<FavoriteRecord[]>(
          ["app-favorites", baseUrl],
          (current) => removeFavoriteNoteRecord(current, noteId),
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-favorites", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["favorite-notes", baseUrl],
        }),
      ]);

      if (noteId) {
        await queryClient.removeQueries({
          queryKey: ["favorite-note", baseUrl, noteId],
        });
      }

      void handleClose();
    },
    onError: (error) => {
      setNotice({
        tone: "danger",
        message:
          error instanceof Error ? error.message : t(msg`删除失败，请稍后再试。`),
      });
    },
  });
  const sendMutation = useMutation({
    mutationFn: async (conversation: ConversationListItem) => {
      const note = sendDialogNote;
      if (!note) {
        throw new Error("NOTE_SEND_EMPTY");
      }

      const attachment = buildNoteCardAttachment(note);
      const noteCardText = translateRuntimeMessage(
        msg`[笔记] ${attachment.title}`,
      );
      if (isPersistedGroupConversation(conversation)) {
        await sendGroupMessage(
          conversation.id,
          {
            type: "note_card",
            text: noteCardText,
            attachment,
          },
          baseUrl,
        );
      } else {
        const characterId = conversation.participants[0]?.trim();
        if (!characterId) {
          throw new Error("NOTE_SEND_NO_TARGET");
        }

        joinConversationRoom({ conversationId: conversation.id });
        emitChatMessage({
          conversationId: conversation.id,
          characterId,
          type: "note_card",
          text: noteCardText,
          attachment,
        });
      }

      return conversation.title;
    },
    onSuccess: async (conversationTitle) => {
      setSendDialogNote(null);
      setNotice({
        tone: "success",
        message: t(msg`笔记已发送到 ${conversationTitle}。`),
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error) => {
      // 之前发送失败只 setNotice，但发送弹层是 z-50 modal，会把编辑器底下的
      // InlineNotice 整片盖住——用户点完"发送"看到对话列表又冒回来、按钮停转，
      // 却没看见任何错误文案，只能瞎猜是不是没生效。把弹层一起关掉，让 notice
      // 在编辑器主区显出来，至少能告诉用户为什么发送没成。
      setSendDialogNote(null);
      setNotice({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message === "NOTE_SEND_EMPTY"
              ? t(msg`当前没有可发送的笔记。`)
              : error.message === "NOTE_SEND_NO_TARGET"
                ? t(msg`当前会话没有可用的接收目标。`)
                : error.message
            : t(msg`发送失败，请稍后再试。`),
      });
    },
  });

  useEffect(() => {
    setNoteId(selectedNoteId);
  }, [selectedNoteId]);

  useEffect(() => {
    if (activeDraftId) {
      return;
    }

    const draft = createDesktopNoteDraft({
      draftId,
      noteId: selectedNoteId,
    });
    setActiveDraftId(draft.draftId);
  }, [activeDraftId, draftId, selectedNoteId]);

  useEffect(() => {
    const nextDraftId =
      activeDraftId || draftId?.trim() || selectedNoteId?.trim() || "";
    if (!nextDraftId) {
      return;
    }

    if (initializedSessionKeyRef.current === sessionKey) {
      return;
    }

    if (selectedNoteId) {
      const localDraftRaw =
        readDesktopNoteDraftByNoteId(selectedNoteId) ??
        readDesktopNoteDraft(nextDraftId);
      const localDraft = shouldDiscardEmptyDraftForApi(
        localDraftRaw,
        noteQuery.data,
      )
        ? null
        : localDraftRaw;
      // 草稿是空的且 API 还没回，等一下：API 一旦带回真实正文，
      // shouldDiscardEmptyDraftForApi 会把空草稿丢掉走 API 分支回填。
      // 否则现在用空 state 初始化 + initializedSessionKeyRef 锁住会让
      // 后续 noteQuery.data 落地时 effect 早退，原文永远不回填。
      if (
        localDraft &&
        isNoteContentEmpty(localDraft) &&
        !missingSelectedNote &&
        noteQuery.isLoading &&
        !noteQuery.data
      ) {
        return;
      }
      if (localDraft) {
        const treatLocalDraftAsNewNote = Boolean(missingSelectedNote);
        applyNoteSource({
          draftId: localDraft.draftId,
          noteId: treatLocalDraftAsNewNote ? undefined : selectedNoteId,
          state: buildEditorStateFromDraft(localDraft),
          savedSource: treatLocalDraftAsNewNote ? null : (noteQuery.data ?? null),
        });
        if (treatLocalDraftAsNewNote) {
          setNotice({
            tone: "danger",
            message: t(msg`原笔记已不存在，当前草稿会按新笔记保存。`),
          });
        }
        initializedSessionKeyRef.current = sessionKey;
        return;
      }

      if (noteQuery.isLoading && !noteQuery.data) {
        return;
      }

      if (noteQuery.data) {
        const ensuredDraft = createDesktopNoteDraft({
          draftId: nextDraftId,
          noteId: noteQuery.data.id,
          ...buildEditorStateFromDocument(noteQuery.data),
        });
        applyNoteSource({
          draftId: ensuredDraft.draftId,
          noteId: noteQuery.data.id,
          state: buildEditorStateFromDocument(noteQuery.data),
          savedSource: noteQuery.data,
        });
        initializedSessionKeyRef.current = sessionKey;
        return;
      }
    }

    const newDraft =
      readDesktopNoteDraft(nextDraftId) ??
      createDesktopNoteDraft({
        draftId: nextDraftId,
        noteId: selectedNoteId,
      });
    applyNoteSource({
      draftId: newDraft.draftId,
      noteId: selectedNoteId,
      state: buildEditorStateFromDraft(newDraft),
      savedSource: null,
    });
    initializedSessionKeyRef.current = sessionKey;
  }, [
    activeDraftId,
    draftId,
    missingSelectedNote,
    noteQuery.data,
    noteQuery.isLoading,
    selectedNoteId,
    sessionKey,
    t,
  ]);

  useEffect(() => {
    if (!selectedNoteId || !noteQuery.data) {
      return;
    }

    setSavedSnapshot(
      buildNoteSnapshot(buildEditorStateFromDocument(noteQuery.data)),
    );
  }, [noteQuery.data, selectedNoteId]);

  useEffect(() => {
    if (!activeDraftId) {
      return;
    }
    // 初始化未完成前禁止自动保存，否则空 editorState 会覆盖掉 API 真实内容
    if (initializedSessionKeyRef.current !== sessionKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      saveDesktopNoteDraft({
        draftId: activeDraftId,
        noteId: noteId || undefined,
        ...editorState,
        updatedAt: new Date().toISOString(),
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [activeDraftId, editorState, noteId, sessionKey]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    // 之前只 set document.title，没 cleanup：用户在 inline 模式（FavoritesPage
    // 内嵌编辑器）打开笔记 → 浏览器 tab 标题变成 "无标题笔记 · 未保存" 之
    // 类，关掉编辑器走人后，整个 app 没有其它地方再 set document.title
    // （全局 grep 只此一处），tab title 永远停在这条笔记名上，用户在
    // /tabs/chat / /tabs/moments 等其它 tab 看到的浏览器标题都是个笔记名。
    // standalone 窗口模式下也无副作用：窗口关闭时整个进程结束，title
    // 恢复无所谓。
    const previousTitle = document.title;
    const title = isDirty
      ? t(msg`${noteTitle} · 未保存`)
      : noteTitle;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [isDirty, noteTitle, t]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function applyNoteSource(input: {
    draftId: string;
    noteId?: string;
    state: NoteEditorState;
    savedSource: FavoriteNoteDocument | null;
  }) {
    setActiveDraftId(input.draftId);
    setNoteId(input.noteId);
    setEditorState(input.state);
    setSavedSnapshot(
      buildNoteSnapshot(
        input.savedSource
          ? buildEditorStateFromDocument(input.savedSource)
          : EMPTY_NOTE_EDITOR_STATE,
      ),
    );

    if (editorRef.current) {
      editorRef.current.innerHTML = input.state.contentHtml;
    }
  }

  function syncEditorStateFromDom() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextHtml = normalizeEditorHtml(editor.innerHTML);
    // 跟 handleAttachmentSelection 同样的隐患：之前 setEditorState({...tags:
    // editorState.tags, assets: filterAssetsByHtml(_, editorState.assets)}) 拿的是
    // 渲染期闭包的 tags / assets。onInput / execCommand 触发频率高，
    // handleTagCommit / handleRemoveTag 的 setEditorState((current) => ...)
    // 队列尚未 commit 时再来一发 onInput，stale tags 会把队列里那条
    // 新加标签 / 刚移除的标签整个吞回去。改成 functional updater 从最新
    // state 拼，从源头消除这个抖动。
    setEditorState((current) => ({
      contentHtml: nextHtml,
      contentText: extractNoteTextFromHtml(nextHtml),
      tags: current.tags,
      assets: filterAssetsByHtml(nextHtml, current.assets),
    }));
  }

  function focusEditorAtEnd() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function applyDocumentCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditorStateFromDom();
  }

  function insertTodoAtCursor() {
    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<span data-note-checkbox="false">☐</span>&nbsp;`,
    );
    syncEditorStateFromDom();
  }

  async function handleAttachmentSelection(fileList: FileList | null) {
    const files = fileList ? [...fileList] : [];
    if (!files.length) {
      return;
    }

    setAttachmentPending(true);

    // createdAssets / errorMessage 移到 try 外面：批量上传到第 K 张图突然
    // 失败时，前 K-1 张已经 await uploadChatAttachment 拿到 URL 并
    // execCommand insertHTML 进了 DOM。如果还是只在 try 末尾才
    // setEditorState({assets}), 一抛错就直接跳到 catch → 那 K-1 张
    // 图记录在 createdAssets 里、也写在 DOM 里，但 state.assets 完全没
    // 收到——下一次保存 buildNoteMutationPayload → filterAssetsByHtml(html,
    // state.assets)，因为 state.assets 里没有这几张图的 id，会被 filter
    // 全部丢弃，后端拿到的笔记 HTML 引用着图，但 asset 列表是空。
    // 图先能渲染，等附件 TTL 到了链接断掉就成"坏图"。
    // 改成在 finally 里统一同步 DOM → state（functional setter 兜 race），
    // 部分成功也会落到 state.assets，保存时就不会丢。
    const createdAssets: FavoriteNoteAsset[] = [];
    let errorMessage: string | null = null;

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadChatAttachment(formData, baseUrl);
        const attachment = result.attachment;
        const assetId =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${attachment.kind}-${Date.now()}`;

        if (attachment.kind === "image") {
          createdAssets.push({
            id: assetId,
            kind: "image",
            fileName: attachment.fileName,
            url: attachment.url,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.size,
            width: attachment.width,
            height: attachment.height,
          });
          focusEditorAtEnd();
          // 收藏笔记可能塞二三十张图，loading=lazy + decoding=async 避免重新打开
          // 这条笔记时一次性同步解码全部 img；编辑器内即时插入的图也走一遍
          // 异步解码，不阻塞 contentEditable 主循环。
          document.execCommand(
            "insertHTML",
            false,
            `<p><img data-note-image="true" data-note-asset-id="${assetId}" src="${escapeHtmlAttribute(
              attachment.url,
            )}" alt="${escapeHtmlAttribute(
              attachment.fileName,
            )}" loading="lazy" decoding="async" /></p><p><br></p>`,
          );
          continue;
        }

        if (attachment.kind === "file") {
          createdAssets.push({
            id: assetId,
            kind: "file",
            fileName: attachment.fileName,
            url: attachment.url,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.size,
          });
          focusEditorAtEnd();
          document.execCommand(
            "insertHTML",
            false,
            `<p><a data-note-file="true" data-note-asset-id="${assetId}" href="${escapeHtmlAttribute(
              attachment.url,
            )}" target="_blank" rel="noreferrer">📎 ${escapeHtml(
              attachment.fileName,
            )}</a></p><p><br></p>`,
          );
        }
      }
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : t(msg`附件上传失败，请稍后再试。`);
    } finally {
      // 之前是 setEditorState({...tags: editorState.tags...})，editorState
      // 是 handleAttachmentSelection 进入时的闭包快照——上传走 await（可能几
      // 百 ms 到几秒），这期间用户在标签栏添加 / 删除标签（handleTagCommit /
      // handleRemoveTag 都已经是 functional updater 正确更新 state），上传
      // 完成后这一行把 tags 强行写回闭包旧值，用户在等上传时新加的标签直接
      // 没了。改成 functional updater，从最新 state 拼出最终值。
      // 同时部分成功也走这条路径（无论 catch 是否触发），保证 state.assets
      // 收下所有 createdAssets，不会出现 DOM 有图但 state 没记的不一致。
      const editor = editorRef.current;
      if (createdAssets.length || editor) {
        setEditorState((current) => {
          const nextHtml = normalizeEditorHtml(
            editor?.innerHTML ?? current.contentHtml,
          );
          const nextAssets = mergeNoteAssets(current.assets, createdAssets);
          return {
            contentHtml: nextHtml,
            contentText: extractNoteTextFromHtml(nextHtml),
            tags: current.tags,
            assets: filterAssetsByHtml(nextHtml, nextAssets),
          };
        });
      }
      if (errorMessage) {
        setNotice({ tone: "danger", message: errorMessage });
      } else {
        setNotice({
          tone: "success",
          message: t(msg`附件已插入到笔记。`),
        });
      }
      setAttachmentPending(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const checkbox = target.closest("[data-note-checkbox]");
    if (!(checkbox instanceof HTMLElement)) {
      return;
    }

    const checked = checkbox.dataset.noteCheckbox === "true";
    checkbox.dataset.noteCheckbox = checked ? "false" : "true";
    checkbox.textContent = checked ? "☐" : "☑";
    syncEditorStateFromDom();
  }

  function handleTagCommit() {
    // 用户可能误打 ## 或 ###，把所有前导 # 都剥掉，否则只剥一个会留 "#"，
    // 显示成 "##xxx" 看着像 bug。
    const normalizedTag = tagInput.trim().replace(/^#+/, "");
    if (!normalizedTag) {
      setTagInput("");
      return;
    }

    if (editorState.tags.includes(normalizedTag)) {
      setTagInput("");
      return;
    }

    setEditorState((current) => ({
      ...current,
      tags: [...current.tags, normalizedTag].slice(0, 8),
    }));
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    setEditorState((current) => ({
      ...current,
      tags: current.tags.filter((item) => item !== tag),
    }));
  }

  const handleSave = useCallback(async () => {
    // 同一时间最多飞一次保存请求。"保存"按钮按 saveMutation.isPending 已禁用，
    // 但 Ctrl+S 这条键盘快捷路径没挡——用户连按两下 Ctrl+S（或按住不放），
    // useMutation.mutateAsync 会并发起两次请求；对新笔记（noteId 还没有）
    // 这意味着后端落两条 createFavoriteNote → 收藏列表里冒出两条一模一样
    // 的笔记。这里短路掉重复触发。
    if (saveMutation.isPending) {
      return null;
    }
    // 不挡空保存的话，用户点保存按钮 / Ctrl+S，后端就会落一条
    // title=无标题笔记 contentText="" 的废笔记。挡的标准跟下方 requestSend
    // 的 hasSendableContent 对齐——只看正文或附件，标签无法独立成笔记。
    const hasContent =
      Boolean(editorState.contentText.trim()) || editorState.assets.length > 0;
    if (!hasContent) {
      setNotice({
        tone: "danger",
        message: t(msg`先写点内容或加个附件再保存。`),
      });
      return null;
    }
    try {
      const savedNote = await saveMutation.mutateAsync();
      return savedNote;
    } catch {
      return null;
    }
  }, [editorState, saveMutation, t]);

  const handleClose = useCallback(async () => {
    const fallbackPath = returnTo || "/tabs/favorites";
    if (standaloneWindow) {
      const closed = await closeCurrentDesktopWindow();
      if (closed) {
        return;
      }

      closeCurrentWindow(() => {
        void focusReturnTargetWindow(fallbackPath);
      });
      return;
    }

    // 优先走浏览器 history.back，失败再 replace 到 fallbackPath。
    // 必须 replace，否则直接打开 /notes/new#... 的 URL（history.length=1）
    // 走 push 会把编辑器 URL 留在 history 里，浏览器 back → 又回到编辑器 → 再 push → 死循环。
    navigateBackOrFallback(
      () => {
        // returnTo 可能带 hash（openInlineNoteEditor 把当前 URL 整段塞过来：
        // "/tabs/favorites#category=notes&sourceId=X"）。TanStack navigate 的
        // `to` 只接受 pathname，把 # 后那一段一起塞进去会被 URL-encode 成
        // %23category%3Dnotes... 真去访问 /tabs/favorites%23... 是 404，
        // 用户从深链开的编辑器点返回就掉到错误页。拆 hash 单独喂。
        const hashIndex = fallbackPath.indexOf("#");
        if (hashIndex < 0) {
          void navigate({ to: fallbackPath, replace: true });
          return;
        }
        void navigate({
          to: fallbackPath.slice(0, hashIndex),
          hash: fallbackPath.slice(hashIndex + 1),
          replace: true,
        });
      },
      fallbackPath,
    );
  }, [navigate, returnTo, standaloneWindow]);

  async function handleSaveAndClose() {
    const savedNote = await handleSave();
    if (!savedNote) {
      // 跟 sendMutation 失败那条路一个套路：DesktopNoteUnsavedDialog 也是 z-50
      // modal，handleSave 走 hasContent / mutation error 这两条分支会把 notice
      // setNotice 到编辑器主区，但弹层把整片主区盖住了——用户连按"保存并关闭"
      // 看到的就是 dialog 没动、按钮停转，完全猜不到为啥没关。先 setCloseDialog
      // Open(false) 把弹层关掉，让 InlineNotice ("先写点内容或加个附件再保存。"
      // 之类) 显出来；用户看到错误后可以补内容再触发关闭，也可以直接点不保存。
      setCloseDialogOpen(false);
      return;
    }

    setCloseDialogOpen(false);
    await handleClose();
  }

  async function handleDiscardAndClose() {
    if (activeDraftId) {
      clearDesktopNoteDraft(activeDraftId);
    }

    setCloseDialogOpen(false);
    await handleClose();
  }

  const requestClose = useCallback(() => {
    if (isDirty) {
      setCloseDialogOpen(true);
      return;
    }

    // 跟 mobile-note-editor-page 73367df0 对齐：点"新建笔记"进编辑器
    // openInlineNoteEditor 已经 createDesktopNoteDraft() 占了一份 draftId；
    // 用户没编辑就 ← 返回时这里清掉空草稿，否则 localStorage 一直攒。
    // 已保存（有 noteId）的草稿当缓存留下，下次还能恢复。
    if (!noteId && activeDraftId && isNoteContentEmpty(editorState)) {
      clearDesktopNoteDraft(activeDraftId);
    }

    void handleClose();
  }, [activeDraftId, editorState, handleClose, isDirty, noteId]);

  // handleSave / requestClose 的 useCallback deps 里都吊着 editorState（前者读
  // contentText/assets 判空，后者通过 isDirty 间接读），editorState 每次按键都
  // 翻新一次 → 两个 callback 每按一下键都重新生成 → 之前 keydown effect 把它们
  // 写在 deps 里，等于每次按键 add/removeEventListener 一对——长笔记快速打字
  // 一秒 5-10 次白挂载。改成 useRef 抓最新的 handler，effect 只依赖几个真正会
  // 影响快捷键语义的开关（dialog/tag-editor/standalone），这些状态切换频率
  // 比击键低几个数量级。
  const handleSaveRef = useRef(handleSave);
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const withCommand = event.metaKey || event.ctrlKey;
      if (withCommand && event.key.toLowerCase() === "s") {
        event.preventDefault();
        // 弹层（"未保存关闭" / "删除"）是 z-50 modal，开着的时候 Ctrl+S 走到 handleSave，
        // 后端真的被打 → 成功/失败的 notice 都写到编辑器主区，被弹层完整盖住，用户
        // 看不到任何反馈。最坑的一条：用户在"未保存关闭"弹层里手抖按了 Ctrl+S，
        // backend 已经把新笔记建好（state/cache 都更新了），但他没看到"已保存"通知 →
        // 接着点"不保存"想丢草稿 → handleDiscardAndClose 只 clearDesktopNoteDraft 把
        // 本地草稿删了，已经落地的笔记还在收藏列表里，用户回到列表看到这条笔记
        // "我明明没保存怎么还在"。弹层开着时直接吃掉 Ctrl+S，让用户用弹层里的
        // "保存并关闭"按钮显式触发，反馈也走 handleSaveAndClose 那条路径。
        if (closeDialogOpen || deleteDialogOpen) {
          return;
        }
        void handleSaveRef.current();
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      if (tagEditorOpen) {
        event.preventDefault();
        setTagEditorOpen(false);
        setTagInput("");
        return;
      }

      if (standaloneWindow && !deleteDialogOpen && !closeDialogOpen) {
        event.preventDefault();
        requestCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialogOpen, deleteDialogOpen, standaloneWindow, tagEditorOpen]);

  async function requestSend() {
    const hasSendableContent =
      Boolean(editorState.contentText.trim()) || editorState.assets.length > 0;
    if (!hasSendableContent) {
      setNotice({
        tone: "danger",
        message: t(msg`先写一点内容，再把这条笔记发送出去。`),
      });
      return;
    }

    const savedNote =
      isDirty || !noteId
        ? await handleSave()
        : noteQuery.data && noteQuery.data.id === noteId
          ? noteQuery.data
          : null;

    const nextNote = savedNote
      ? buildNoteSendDialogNoteFromDocument(savedNote)
      : noteId
        ? buildNoteSendDialogNote({
            noteId,
            state: editorState,
            updatedAt: noteQuery.data?.updatedAt,
          })
        : null;

    if (!nextNote) {
      setNotice({
        tone: "danger",
        message: t(msg`笔记还没有保存成功，请稍后再试。`),
      });
      return;
    }

    setSendDialogNote(nextNote);
  }

  if (
    selectedNoteId &&
    noteQuery.isLoading &&
    !initializedSessionKeyRef.current
  ) {
    return (
      <div className="flex h-full items-center justify-center bg-[color:var(--bg-canvas)]">
        <LoadingBlock label={t(msg`正在读取笔记...`)} />
      </div>
    );
  }

  if (
    selectedNoteId &&
    noteQuery.isError &&
    !readDesktopNoteDraftByNoteId(selectedNoteId)
  ) {
    return (
      <div className="flex h-full items-center justify-center bg-[color:var(--bg-canvas)] p-6">
        <div className="w-full max-w-xl rounded-[20px] border border-[color:var(--border-faint)] bg-white p-6 shadow-[var(--shadow-card)]">
          <ErrorBlock
            message={
              noteQuery.error instanceof Error
                ? noteQuery.error.message
                : t(msg`读取笔记失败，请稍后再试。`)
            }
          />
          <div className="mt-5 flex justify-end">
            <Button
              variant="secondary"
              onClick={() => void handleClose()}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none"
            >
              {t(msg`回到来源`)}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f7f8f8_0%,#eef1f0_100%)]">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleAttachmentSelection(event.target.files)}
      />

      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.9)] px-5 py-4 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {!standaloneWindow ? (
              <button
                type="button"
                onClick={requestClose}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[color:var(--text-secondary)] transition hover:bg-white hover:text-[color:var(--text-primary)]"
                aria-label={t(msg`返回收藏`)}
              >
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
              {noteTitle}
            </div>
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {saveMutation.isPending
              ? t(msg`正在保存到收藏...`)
              : isDirty
                ? t(msg`存在未保存修改`)
                : noteId
                  ? t(msg`已保存到收藏`)
                  : t(msg`新建笔记`)}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {noteId ? (
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              // 保存 / 发送 button 都已经在对方 pending 时互相挡，删除 trigger 一直
              // 漏了 saveMutation.isPending 这条。漏的后果：用户点完"保存"看到按钮
              // 转 "保存中..."（saveMutation.onSuccess 里 await invalidateQueries
              // 让 isPending 撑到 ~500ms），这中间他点"删除"→ 弹层→ 确认 删除，
              // deleteMutation 跟 saveMutation 同时在飞向同一个 noteId：
              //   - save 还在 await invalidate 期间，onSuccess 早就跑了 setQueryData
              //     把 savedNote 写回 app-favorites / favorite-notes / favorite-note;
              //   - 这之后才到 delete.onSuccess 的 setQueryData filter 出去。
              //   - 如果 delete 先到、save 后到 → save 的 setQueryData 把被删的 note
              //     又写回 cache，favorites 列表里"幽灵复活"一帧，等下一轮 invalidate
              //     refetch 才彻底清掉。
              // 跟 sendMutation 同款逻辑：保存中 disable 删除 trigger，让用户等保存
              // 落地再决定要不要删。
              disabled={deleteMutation.isPending || saveMutation.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 text-[13px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--state-danger-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={15} />
              {t(msg`删除`)}
            </button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void requestSend()}
            disabled={saveMutation.isPending || sendMutation.isPending}
            className="h-9 rounded-[10px] border-[color:var(--border-faint)] bg-white px-4 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            <Send size={15} />
            {sendMutation.isPending ? t(msg`发送中...`) : t(msg`发送`)}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={saveMutation.isPending}
            className="h-9 rounded-[10px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
          >
            <Save size={15} />
            {saveMutation.isPending ? t(msg`保存中...`) : t(msg`保存`)}
          </Button>
          {standaloneWindow ? (
            <button
              type="button"
              onClick={requestClose}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              aria-label={t(msg`关闭笔记窗口`)}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-5 py-3 backdrop-blur-xl">
        <ToolbarButton
          label={t(msg`附件`)}
          onClick={() => fileInputRef.current?.click()}
        >
          <FolderUp size={15} />
        </ToolbarButton>
        <ToolbarButton
          label={t(msg`粗体`)}
          onClick={() => applyDocumentCommand("bold")}
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          label={t(msg`斜体`)}
          onClick={() => applyDocumentCommand("italic")}
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          label={t(msg`下划线`)}
          onClick={() => applyDocumentCommand("underline")}
        >
          <Underline size={15} />
        </ToolbarButton>
        <ToolbarButton
          label={t(msg`列表`)}
          onClick={() => applyDocumentCommand("insertUnorderedList")}
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton label={t(msg`待办`)} onClick={insertTodoAtCursor}>
          <ListTodo size={15} />
        </ToolbarButton>
        <ToolbarButton
          label={t(msg`标签`)}
          active={tagEditorOpen}
          onClick={() => setTagEditorOpen((current) => !current)}
        >
          <Tag size={15} />
        </ToolbarButton>
        {attachmentPending ? (
          <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2.5 py-1 text-[11px] text-[color:var(--brand-primary)]">
            {t(msg`正在上传附件...`)}
          </span>
        ) : null}
      </div>

      {tagEditorOpen || editorState.tags.length ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.72)] px-5 py-3">
          {editorState.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-[rgba(7,193,96,0.08)] px-3 py-1 text-[12px] text-[color:var(--brand-primary)]"
            >
              <span>#{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[color:var(--brand-primary)] transition hover:bg-[rgba(7,193,96,0.12)]"
                aria-label={t(msg`移除标签 ${tag}`)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {tagEditorOpen ? (
            <div className="flex items-center gap-2">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }

                  event.preventDefault();
                  handleTagCommit();
                }}
                placeholder={t(msg`输入标签后回车`)}
                className="h-9 w-[180px] rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 text-[13px] text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--brand-primary)]"
              />
              <Button
                variant="secondary"
                onClick={handleTagCommit}
                className="h-9 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 shadow-none"
              >
                {t(msg`添加`)}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        {notice ? (
          <div className="mx-auto mb-4 w-full max-w-[840px]">
            <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
          </div>
        ) : null}

        <div className="mx-auto flex w-full max-w-[840px] flex-col rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white px-10 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex items-center gap-2 text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
            <span className="rounded-full border border-[rgba(15,23,42,0.08)] px-2 py-1">
              {t(msg`收藏笔记`)}
            </span>
            <span>{noteId ? t(msg`已保存文稿`) : t(msg`未保存草稿`)}</span>
          </div>
          <div className="relative">
            {!editorState.contentText.trim() && !editorState.assets.length ? (
              // 之前只挡 contentText.trim() 为空，但 extractNoteTextFromHtml
              // 对"只有图片/附件"的 HTML 抽出来的文本就是 ""，结果用户插了图
              // 还没写字时，"写点什么。支持富文本…" 占位符仍旧浮在编辑器左上
              // 角，跟刚插的图叠在一起视觉很脏。补一刀 assets.length，凡是
              // 编辑器里已经有附件就别再显示空状态文案了。
              <div className="pointer-events-none absolute left-0 top-0 text-[15px] leading-8 text-[color:var(--text-dim)]">
                {noteQuery.isLoading
                  ? t(msg`加载笔记中…`)
                  : t(msg`写点什么。支持富文本、待办、图片和文件。`)}
              </div>
            ) : null}
            <div
              ref={editorRef}
              contentEditable={!noteQuery.isLoading}
              suppressContentEditableWarning
              onInput={syncEditorStateFromDom}
              onClick={handleEditorClick}
              className={cn(
                "min-h-[560px] outline-none",
                "text-[15px] leading-8 text-[color:var(--text-primary)]",
                "[&_a[data-note-file='true']]:inline-flex [&_a[data-note-file='true']]:items-center [&_a[data-note-file='true']]:rounded-[12px] [&_a[data-note-file='true']]:border [&_a[data-note-file='true']]:border-[rgba(15,23,42,0.08)] [&_a[data-note-file='true']]:bg-[rgba(243,244,246,0.82)] [&_a[data-note-file='true']]:px-3 [&_a[data-note-file='true']]:py-2 [&_a[data-note-file='true']]:text-[13px] [&_a[data-note-file='true']]:text-[color:var(--text-primary)] [&_a[data-note-file='true']]:no-underline",
                "[&_img[data-note-image='true']]:my-3 [&_img[data-note-image='true']]:max-h-[420px] [&_img[data-note-image='true']]:max-w-full [&_img[data-note-image='true']]:rounded-[18px] [&_img[data-note-image='true']]:border [&_img[data-note-image='true']]:border-[rgba(15,23,42,0.08)]",
                "[&_[data-note-checkbox='false']]:cursor-pointer [&_[data-note-checkbox='true']]:cursor-pointer [&_[data-note-checkbox='true']]:text-[color:var(--brand-primary)]",
              )}
            />
          </div>
        </div>
      </div>

      <DesktopChatConfirmDialog
        open={deleteDialogOpen}
        title={t(msg`删除笔记`)}
        description={t(msg`删除后，这条收藏笔记会从收藏列表中移除。`)}
        confirmLabel={t(msg`删除`)}
        pendingLabel={t(msg`正在删除...`)}
        danger
        pending={deleteMutation.isPending}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => void deleteMutation.mutateAsync()}
      />

      <DesktopNoteUnsavedDialog
        open={closeDialogOpen}
        pending={saveMutation.isPending}
        onClose={() => setCloseDialogOpen(false)}
        onDiscard={() => void handleDiscardAndClose()}
        onSave={() => void handleSaveAndClose()}
      />

      <DesktopNoteSendDialog
        open={Boolean(sendDialogNote)}
        note={sendDialogNote}
        conversations={recentConversationsQuery.data ?? []}
        loading={recentConversationsQuery.isLoading}
        pending={sendMutation.isPending}
        error={
          recentConversationsQuery.error instanceof Error
            ? recentConversationsQuery.error.message
            : null
        }
        onClose={() => {
          if (!sendMutation.isPending) {
            setSendDialogNote(null);
          }
        }}
        onSend={(conversation) => {
          void sendMutation.mutateAsync(conversation);
        }}
      />
    </div>
  );
}

function ToolbarButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] transition",
        active
          ? "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]"
          : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
      )}
      aria-label={label}
      title={label}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function DesktopNoteUnsavedDialog({
  open,
  pending,
  onClose,
  onDiscard,
  onSave,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const t = useRuntimeTranslator();
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={t(msg`关闭未保存提示`)}
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]">
        <div className="border-b border-[color:var(--border-faint)] px-6 py-5">
          <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
            {t(msg`这条笔记还没有保存`)}
          </div>
          <div className="mt-2 text-[13px] leading-7 text-[color:var(--text-muted)]">
            {t(msg`保存后会进入收藏；如果直接关闭，当前草稿改动会被丢弃。`)}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-5 shadow-none"
          >
            {t(msg`取消`)}
          </Button>
          <Button
            variant="danger"
            onClick={onDiscard}
            disabled={pending}
            className="rounded-[10px] px-5"
          >
            {t(msg`不保存`)}
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={pending}
            className="rounded-[10px] bg-[color:var(--brand-primary)] px-5 text-white hover:opacity-95"
          >
            {pending ? t(msg`保存中...`) : t(msg`保存并关闭`)}
          </Button>
        </div>
      </div>
    </div>
  );
}


async function focusReturnTargetWindow(targetPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  const resolvedTarget = resolveDesktopWindowReturnTarget(targetPath);
  if (resolvedTarget.standaloneWindowLabel) {
    const focusedStandalone = await focusStandaloneDesktopWindow(
      resolvedTarget.standaloneWindowLabel,
      targetPath,
    );
    if (focusedStandalone) {
      void closeCurrentDesktopWindow();
      return;
    }
  }

  const nextMainWindowPath = resolvedTarget.mainWindowPath || targetPath;

  void focusMainDesktopWindow(nextMainWindowPath).then((focused) => {
    if (focused) {
      void closeCurrentDesktopWindow();
      return;
    }

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.location.assign(nextMainWindowPath);
        window.opener.focus?.();
        closeCurrentWindow();
        return;
      }
    } catch {
      // Ignore opener access failures and fall back to local navigation.
    }

    window.location.assign(nextMainWindowPath);
  });
}

function closeCurrentWindow(onBlocked?: () => void) {
  window.close();

  if (!onBlocked) {
    return;
  }

  window.setTimeout(() => {
    if (!window.closed) {
      onBlocked();
    }
  }, 120);
}
