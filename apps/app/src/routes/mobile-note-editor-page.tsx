import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { useRuntimeTranslator, translateRuntimeMessage } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";

import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
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
  removeFavoriteNoteRecord,
  removeFavoriteNoteSummary,
  resolveNoteTitle,
  upsertFavoriteNoteRecord,
  upsertFavoriteNoteSummary,
  type NoteEditorState,
  type NoteSendDialogNote,
} from "../features/favorites/note-editor-helpers";
import {
  clearDesktopNoteDraft,
  createDesktopNoteDraft,
  readDesktopNoteDraft,
  readDesktopNoteDraftByNoteId,
  saveDesktopNoteDraft,
} from "../features/favorites/note-drafts-storage";
import {
  buildMobileNoteEditorRouteHash,
  parseMobileNoteEditorRouteHash,
} from "../features/notes/mobile-note-editor-route-state";
import { MobileNoteSendSheet } from "../features/notes/mobile-note-send-sheet";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  isDesktopOnlyPath,
  navigateBackOrFallback,
} from "../lib/history-back";
import { emitChatMessage, joinConversationRoom } from "../lib/socket";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

const DesktopNotesWorkspace = lazy(async () => {
  const mod = await import(
    "../features/desktop/chat/desktop-notes-workspace"
  );
  return { default: mod.DesktopNotesWorkspace };
});

type NoteNotice = {
  tone: "success" | "danger";
  message: string;
};

export function MobileNoteEditorPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseMobileNoteEditorRouteHash(hash),
    [hash],
  );

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面笔记`)}
            description={t(msg`正在跳转到桌面笔记编辑器。`)}
            loadingLabel={t(msg`切换桌面笔记...`)}
          />
        }
      >
        <DesktopNotesWorkspace
          draftId={routeState?.draftId}
          selectedNoteId={routeState?.noteId}
          returnTo={
            routeState?.returnPath
              ? `${routeState.returnPath}${
                  routeState.returnHash ? `#${routeState.returnHash}` : ""
                }`
              : undefined
          }
        />
      </Suspense>
    );
  }

  return <MobileNoteEditor routeState={routeState} />;
}

function MobileNoteEditor({
  routeState,
}: {
  routeState: ReturnType<typeof parseMobileNoteEditorRouteHash>;
}) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedSessionKeyRef = useRef("");
  const autoFocusedSessionKeyRef = useRef("");

  const draftIdParam = routeState?.draftId;
  const selectedNoteId = routeState?.noteId;
  const returnPath = routeState?.returnPath;
  const returnHash = routeState?.returnHash;

  const safeReturnPath =
    returnPath && !isDesktopOnlyPath(returnPath) ? returnPath : undefined;
  const safeReturnHash = safeReturnPath ? returnHash : undefined;

  const [noteId, setNoteId] = useState(selectedNoteId);
  const [activeDraftId, setActiveDraftId] = useState(
    () => draftIdParam?.trim() || selectedNoteId?.trim() || "",
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [sendDialogNote, setSendDialogNote] =
    useState<NoteSendDialogNote | null>(null);
  // 走查 R1（新一轮）：跟踪"哪个 sessionKey 已经被 init effect 真正回填过"。
  // 之前用 initializedSessionKeyRef（ref）锁，但 ref 不参与渲染，保存按钮无法
  // 看到 init 是否完成。
  // 真实场景：用户从收藏列表点已有笔记 → /notes/new?noteId=X&draftId=…→
  // selectedNoteId=X、useState 把 noteId 初始化成 X，editorState 是 EMPTY，
  // noteQuery 还在拉。这个间隙保存按钮没 disabled（旧 disabled 只看
  // saveMutation.isPending），用户随手点保存 → handleSave → mutationFn 用 closure
  // 的空 editorState 拼 payload → updateFavoriteNote(X, {contentHtml: "", ...}) →
  // 服务端把原笔记**整段覆写成空内容**。一次点击就把用户原笔记吞掉。
  // 用状态版本"哪个 session 已就绪"+ 派生 isEditorReady，保存/发送按钮在
  // init effect 完成 applyNoteSource 之前都 disabled。新建笔记不走 noteQuery
  // 拉数据分支，进编辑器立刻进入 ready，所以正常 + 新建笔记 无感知。
  const [readyForSessionKey, setReadyForSessionKey] = useState<string | null>(
    null,
  );

  const noteQuery = useQuery({
    queryKey: ["favorite-note", baseUrl, selectedNoteId],
    queryFn: () => getFavoriteNote(selectedNoteId!, baseUrl),
    enabled: Boolean(selectedNoteId),
  });
  // 走查 R1：原 queryKey 是独立的 `mobile-note-send-conversations`，跟 chat-list-page
  // 的 `app-conversations` 完全不共享。结果是：用户从 + 菜单进编辑器、刚保存完笔记
  // 点「发送」打开 sheet 时，明明 chat-list 几秒前刚拉过会话列表，sheet 还是要
  // 从零起一次网络往返才能显示。公网隧道下 200~600ms 才出列表，期间 LoadingBlock
  // 把整个 sheet 占满。改成跟 chat-list 同 key + 同 staleTime，命中 cache 直接
  // 出列表，stale 时背景 refetch 不挡 UI。enabled 仍按 sendDialogNote 卡，关
  // sheet 时不会主动触发 refetch。
  const recentConversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(sendDialogNote),
    staleTime: 15_000,
  });

  const sessionKey = `${selectedNoteId ?? "new"}:${draftIdParam ?? ""}`;
  const missingSelectedNote =
    selectedNoteId && isFavoriteNoteMissingError(noteQuery.error);
  // 已有笔记 + noteQuery 还没把 contentHtml 写进 editorState 前，把保存/发送
  // 屏蔽住。新建笔记不会走 noteQuery，进编辑器 → init effect 立刻 setReady。
  const isEditorReady = readyForSessionKey === sessionKey;
  // 走查 R2（第三轮）：LoadingBlock + ErrorBlock 两条早期 return 各调用了一次
  // readDesktopNoteDraftByNoteId(selectedNoteId) —— 每次 render 两次 JSON.parse
  // 全表草稿。编辑过程中 onInput / setEditorState 一秒能 5~10 次 re-render，
  // 用户 LS 里堆着十几条草稿时这相当于一秒 100~200 次 parse 5KB 全表。
  // sessionKey 不变 → 用户没换笔记 → LS 那条草稿只可能由当前编辑器自己写，
  // 而我们关心的 truthy/falsy 在 init effect 之前不会变；init effect 之后
  // isEditorReady=true → 两条 gate 都跳过了，结果不再被读到。安全的 memo 时机。
  const cachedLocalDraftForSelected = useMemo(
    () => (selectedNoteId ? readDesktopNoteDraftByNoteId(selectedNoteId) : null),
    [selectedNoteId],
  );
  // 真正怕覆写的场景：已经认定有一条 noteId 的笔记在背后（server 上有这条
  // record，editorState 现在却是 EMPTY）。新建笔记 / 直接打开 /notes/new
  // 没 noteId，editorState 的"空"就是用户起步状态，allow save，让 createNote
  // 正常落库。
  const isExistingNoteNotReady = Boolean(selectedNoteId) && !isEditorReady;

  const currentSnapshot = useMemo(
    () => buildNoteSnapshot(editorState),
    [editorState],
  );
  const isDirty = currentSnapshot !== savedSnapshot;
  // derivedTitle: 用户没显式输入标题时的回退展示值（占位 placeholder + 派生）。
  // 显式输入的标题存在 editorState.title 里；保存时 buildNoteMutationPayload 会
  // 带过去，后端 trim 后为空才走"派生"分支。
  const derivedTitle = useMemo(
    () => resolveNoteTitle(editorState.contentText),
    [editorState.contentText],
  );
  const handleTitleChange = useCallback(
    (next: string) => {
      // input.maxLength={32} 已经卡了大部分输入；这里再 slice 一次防止 IME 长串
      // composition 落字时一口气冲过 32。
      const limited = next.slice(0, 32);
      setEditorState((current) =>
        current.title === limited ? current : { ...current, title: limited },
      );
    },
    [],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 走查 R5：把 mutate() 飞出去那一刻的 *整段* editorState snapshot 一起带给
      // onSuccess —— R2 只比对 contentHtml 不够：用户完全可能在 save round-trip 的
      // 200ms~2s 内打开 tag 输入框新加一个 tag，或者点附件按钮再传一张图，body
      // 一字未改 sentContentHtml === editorState.contentHtml = userKeptTyping=false
      // = onSuccess 用 nextState（server 视角，不含新 tag / 新图）setEditorState
      // 反向覆盖，用户刚加的 tag / asset 就被静默吃掉。改成比对 buildNoteSnapshot
      // 整体（contentHtml / contentText / tags / assets 都管）。
      const sentSnapshot = buildNoteSnapshot(editorState);
      const payload = buildNoteMutationPayload(editorState);
      const savedNote = await (noteId
        ? updateFavoriteNote(noteId, payload, baseUrl)
        : createFavoriteNote(payload, baseUrl));
      return { savedNote, sentSnapshot };
    },
    onSuccess: async ({ savedNote, sentSnapshot }) => {
      const nextDraftId = activeDraftId || draftIdParam?.trim() || savedNote.id;
      const nextState = buildEditorStateFromDocument(savedNote);
      const nextSnapshot = buildNoteSnapshot(nextState);
      // 保存中用户继续动 editor（敲字 / 加 tag / 传图）时不能拿 server 归一化版
      // 反向覆盖；保存按钮虽然 disabled，contentEditable / tag editor / 附件入口
      // 都没 disabled，是故意不让保存阻塞编辑节奏。判断逻辑：mutate 飞出去那一
      // 刻的 sentSnapshot 跟 onSuccess 跑到这里时 buildNoteSnapshot(editorState)
      // 还一致 → 用户期间没动 editor，可以用 server 归一化版回填；不一致 → 保留
      // editor 现状，dirty 指示器自动亮起告诉用户下一次 auto-save 会同步过去。
      const userKeptEditing = buildNoteSnapshot(editorState) !== sentSnapshot;

      setNoteId(savedNote.id);
      if (!userKeptEditing) {
        setEditorState(nextState);
        if (editorRef.current) {
          editorRef.current.innerHTML = nextState.contentHtml;
        }
      }
      setSavedSnapshot(nextSnapshot);
      setNotice({
        tone: "success",
        message: t(msg`笔记已保存到收藏。`),
      });

      saveDesktopNoteDraft({
        draftId: nextDraftId,
        noteId: savedNote.id,
        // 用户已经继续动 editor 了（不只是敲字，也可能加了 tag / asset），
        // localStorage 里也得记最新内容；不然窗口关掉再重进会回到 server 归一化
        // 版（用户刚加的 tag / 图就真没了）。
        ...(userKeptEditing ? editorState : nextState),
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

      if (typeof window !== "undefined") {
        const nextHash = buildMobileNoteEditorRouteHash({
          draftId: nextDraftId,
          noteId: savedNote.id,
          returnPath: safeReturnPath,
          returnHash: safeReturnHash,
        });
        if (nextHash && nextHash !== hashWithoutLeading(window.location.hash)) {
          void navigate({
            to: "/notes/new",
            hash: nextHash,
            replace: true,
          });
        }
      }
    },
    onError: (error) => {
      setNotice({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : t(msg`保存失败，请稍后再试。`),
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
      // 走查 R2：
      // (1) 用户改过笔记 → isDirty=true → 点删除 → 服务端删成功 → leaveEditor →
      //     useBlocker.shouldBlockFn 因 dirty 仍 true 拦下导航 → 弹"未保存"sheet。
      //     用户刚删完，原笔记已经没了，却被问"要不要保存"——令人困惑。
      //     skipBlockerRef.current=true 短路 blocker，跟 handleSaveAndClose /
      //     handleDiscardAndClose 同款逻辑。
      // (2) 删除后笔记草稿也应该不再写回 LS：本来 clearDesktopNoteDraft 一句就
      //     干掉了草稿，但如果用户在删除前 200ms 内最后敲过键，220ms debounce
      //     的 auto-save timer 排队中，先 fire 就把 draft 又写回去。跟
      //     handleDiscardAndClose 同款做法。
      autoSaveDisabledRef.current = true;
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      skipBlockerRef.current = true;

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

      void leaveEditor();
    },
    onError: (error) => {
      setNotice({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : t(msg`删除失败，请稍后再试。`),
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
    // 走查 R1：路由切走（用户点返回 / hash 被清）后 React 19 + TanStack Router
    // 的 reconnectPassiveEffects 会让这条 effect 在 routeState=null 时再跑一遍。
    // 此时 draftIdParam / selectedNoteId 都是 undefined，createDesktopNoteDraft()
    // 会生成完全无意义的随机 UUID 空草稿落地 LS；每次返回都攒 2 条（StrictMode
    // 双跑），用户多点几次「+ → 新建笔记 → 返回」就在 localStorage 攒一堆空草稿。
    // 没 draftId 也没 noteId 的情况下根本不该 init —— 直接 return。
    const normalizedDraftId = draftIdParam?.trim();
    const normalizedNoteId = selectedNoteId?.trim();
    if (!normalizedDraftId && !normalizedNoteId) {
      return;
    }
    const draft = createDesktopNoteDraft({
      draftId: normalizedDraftId,
      noteId: normalizedNoteId,
    });
    setActiveDraftId(draft.draftId);
  }, [activeDraftId, draftIdParam, selectedNoteId]);

  useEffect(() => {
    const nextDraftId =
      activeDraftId || draftIdParam?.trim() || selectedNoteId?.trim() || "";
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
      // 空 local draft 不能锁死初始化：旧版预创建 bug 会在 localStorage
      // 留下空草稿，且 shouldDiscardEmptyDraftForApi 在 noteQuery.data
      // 还没到的时候直接返回 false。如果这时用空 draft 走 if (localDraft)
      // 分支，会立刻 setInitializedSessionKeyRef 锁定，noteQuery.data 后续
      // 到达也不再回填——这就是"第一次点笔记不回填，第二次才回填"。
      // 规则：
      //   - 非空 local draft → 用户编辑成果优先
      //   - 空 local draft + API 有数据 → 丢弃空 draft 走 API 分支
      //   - 空 local draft + API 还在 loading → 等 API（return）
      //   - 空 local draft + API 已结束且无数据 → 用空 draft 兜底
      let localDraft: typeof localDraftRaw = null;
      if (localDraftRaw) {
        if (!isNoteContentEmpty(localDraftRaw)) {
          localDraft = localDraftRaw;
        } else if (!noteQuery.isLoading && !noteQuery.data) {
          // API 已结束且无数据 → 用空 draft 兜底，可能后续走 missing-note 流程
          localDraft = localDraftRaw;
        }
        // else: 空 draft + (API loading 中 / API 有数据)
        // → 让 localDraft 保持 null，下面流程会等 API 或用 API 数据回填
      }
      if (localDraft) {
        const treatLocalDraftAsNewNote = Boolean(missingSelectedNote);
        applyNoteSource({
          draftId: localDraft.draftId,
          noteId: treatLocalDraftAsNewNote ? undefined : selectedNoteId,
          state: buildEditorStateFromDraft(localDraft),
          savedSource: treatLocalDraftAsNewNote
            ? null
            : (noteQuery.data ?? null),
        });
        if (treatLocalDraftAsNewNote) {
          setNotice({
            tone: "danger",
            message: t(msg`原笔记已不存在，当前草稿会按新笔记保存。`),
          });
        }
        initializedSessionKeyRef.current = sessionKey;
        setReadyForSessionKey(sessionKey);
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
        setReadyForSessionKey(sessionKey);
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
    setReadyForSessionKey(sessionKey);
  }, [
    activeDraftId,
    draftIdParam,
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

  // 走查 R1：原写法只 useEffect 内 setTimeout + cleanup clearTimeout 来 debounce
  // auto-save。一个隐蔽 race：用户在确认 sheet 里点「不保存」后，handleDiscardAndClose
  // 同步 clearDesktopNoteDraft → leaveEditor → navigate。但如果用户在点「不保存」
  // *之前* 220ms 内最后敲过一次键（timer 仍排队中），navigate 在 TanStack Router
  // 下不是绝对同步——若 unmount 拖到 220ms 以上（保存确认 sheet 自身的 setState
  // commit 也得一个 frame），timer 会先 fire 把刚 clear 掉的 draft 重写回 LS；
  // 紧接着 unmount cleanup 因 editorState 非空（"Hello" 之类）跳过清理 → draft
  // 残留。改成把 timer 放到 ref 里，并加一个 autoSaveDisabledRef 旗，让
  // handleDiscardAndClose 能同步同时把 timer 撤掉 + 关掉后续 saveDesktopNoteDraft
  // 触发——下次 setEditorState 触发 effect 时也不会再写 LS。
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveDisabledRef = useRef(false);
  useEffect(() => {
    if (!activeDraftId) {
      return;
    }
    // 初始化未完成前禁止自动保存，否则空 editorState 会覆盖掉 API 真实内容
    if (initializedSessionKeyRef.current !== sessionKey) {
      return;
    }
    if (autoSaveDisabledRef.current) {
      return;
    }
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      if (autoSaveDisabledRef.current) return;
      saveDesktopNoteDraft({
        draftId: activeDraftId,
        noteId: noteId || undefined,
        ...editorState,
        updatedAt: new Date().toISOString(),
      });
    }, 220);
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [activeDraftId, editorState, noteId, sessionKey]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 新建笔记时自动聚焦正文，让用户落到 /notes/new 之后立刻能输入。每个
  // sessionKey 只 focus 一次，避免用户主动失焦/编辑过程中再次抢焦点。
  // 已有笔记 (selectedNoteId) 不强制聚焦，保留滚动查看的体验。
  useEffect(() => {
    if (selectedNoteId) return;
    if (!editorRef.current) return;
    if (initializedSessionKeyRef.current !== sessionKey) return;
    if (autoFocusedSessionKeyRef.current === sessionKey) return;
    if (editorState.contentText.trim()) return;
    autoFocusedSessionKeyRef.current = sessionKey;
    const handle = window.requestAnimationFrame(() => {
      focusEditorAtEnd();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [editorState.contentText, selectedNoteId, sessionKey]);

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
    // 走查 R1：原写法用 closure `editorState.assets` 给 filterAssetsByHtml 喂参，
    // 然后在 setEditorState 里盖回去。问题：handleAttachmentSelection 的 loop 里
    // 每次 `document.execCommand("insertHTML", ...)` 都同步触发 contentEditable
    // 的 input 事件 → syncEditorStateFromDom 同步跑一次，此时 React state 的
    // `editorState.assets` 还是上一次 render 的旧值（loop 内 createdAssets 没进
    // setState）。filterAssetsByHtml 用旧 assets 去筛 DOM 里新 asset-id → 直接
    // 把刚 insert 的 <img>/<a> 的 asset record 当 stale 干掉。结果中间几帧
    // setEditorState 把 assets 反复清成空数组，靠 loop 结束后的 cleanup
    // setEditorState 兜回，期间 React 多次 re-render 一次空 assets，浪费 reflow。
    // 改成纯 functional updater，filterAssetsByHtml 喂 current.assets，跟 React
    // 视角 commit 后的 state 对齐。
    setEditorState((current) => ({
      ...current,
      contentHtml: nextHtml,
      contentText: extractNoteTextFromHtml(nextHtml),
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

    try {
      const createdAssets: FavoriteNoteAsset[] = [];
      const failedFiles: string[] = [];

      // 走查 R1：原来 upload loop 是「整体 try - 任一 await 抛就 break loop +
      // 跳到 outer catch」—— 假设 3 个文件传第 2 个挂了：第 1 个的 <img> 已经
      // 用 document.execCommand 插进了 editor DOM，但 outer catch 直接跳过下面
      // 「mergeNoteAssets → setEditorState」一段，editorState.assets 里没有第 1
      // 个的 asset record。结果 editor DOM 有 <img data-note-asset-id="xxx">
      // 但 editorState.assets 没 xxx 这条 → filterAssetsByHtml 后续把这条孤儿
      // 图当 stale 清掉，下次 syncEditorStateFromDom 又把 DOM 里这张图保留但
      // assets 缺失 —— 保存到 server 时 attachment 数据缺一半。改成 per-file
      // try/catch，单个失败不影响其它已成功 upload 的 state 提交；外层只兜底
      // 兜不到的硬异常（DOM 操作之类）。
      // 同时把 fallback assetId 的 `${kind}-${Date.now()}` 改成带 index，免得
      // 同一毫秒上传两张图碰到 randomUUID 不可用的老浏览器走 fallback 时拿到
      // 同一个 id。
      for (const [index, file] of files.entries()) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const result = await uploadChatAttachment(formData, baseUrl);
          const attachment = result.attachment;
          const assetId =
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${attachment.kind}-${Date.now()}-${index}`;

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
            document.execCommand(
              "insertHTML",
              false,
              `<p><img data-note-image="true" data-note-asset-id="${assetId}" src="${escapeHtmlAttribute(
                attachment.url,
              )}" alt="${escapeHtmlAttribute(attachment.fileName)}" /></p><p><br></p>`,
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
        } catch {
          failedFiles.push(file.name || `#${index + 1}`);
        }
      }

      const nextAssets = mergeNoteAssets(editorState.assets, createdAssets);
      const editor = editorRef.current;
      const nextHtml = normalizeEditorHtml(
        editor?.innerHTML ?? editorState.contentHtml,
      );
      setEditorState((current) => ({
        ...current,
        contentHtml: nextHtml,
        contentText: extractNoteTextFromHtml(nextHtml),
        assets: filterAssetsByHtml(nextHtml, nextAssets),
      }));

      if (failedFiles.length === 0) {
        setNotice({
          tone: "success",
          message: t(msg`附件已插入到笔记。`),
        });
      } else if (createdAssets.length === 0) {
        setNotice({
          tone: "danger",
          message: t(msg`附件上传失败：${failedFiles.join("、")}`),
        });
      } else {
        setNotice({
          tone: "danger",
          message: t(
            msg`已插入 ${createdAssets.length} 个附件，${failedFiles.length} 个失败：${failedFiles.join("、")}`,
          ),
        });
      }
    } catch (error) {
      // outer catch 兜底「state 同步本身抛」的极少数硬异常（DOM 操作崩、
      // editorRef 突然不在等），网络/单文件失败上面 per-file try/catch 已经
      // 在 failedFiles 里记账并 notice 过了。
      setNotice({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : t(msg`附件上传失败，请稍后再试。`),
      });
    } finally {
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
    const normalizedTag = tagInput.trim().replace(/^#/, "");
    if (!normalizedTag) {
      setTagInput("");
      return;
    }
    if (editorState.tags.includes(normalizedTag)) {
      // 重复 tag 静默清空输入即可：用户已经看到该标签存在 → 没必要再 toast 弹一条
      // "标签已存在"。
      setTagInput("");
      return;
    }
    // 走查 R1：原写法 [...current.tags, normalizedTag].slice(0, 8) —— 已有 8 个时
    // 第 9 个 tag 被 slice 静默丢弃，输入框清空但 tag 没出现，用户以为「点没反
    // 应」。改成先卡 8 上限并以 danger notice 明示，保留用户输入让其知道为什么
    // 没加上。
    if (editorState.tags.length >= 8) {
      setNotice({
        tone: "danger",
        message: t(msg`最多只能添加 8 个标签，先移除一个再来。`),
      });
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
    try {
      // mutationFn 现在返回 { savedNote, sentContentHtml }（为了让 onSuccess
      // 判断「用户在保存途中是否继续打字」），handleSave 这一层把 savedNote
      // 直接拨出来，保持对外契约不变。
      const { savedNote } = await saveMutation.mutateAsync();
      return savedNote;
    } catch {
      return null;
    }
  }, [saveMutation]);

  const leaveEditor = useCallback(async () => {
    navigateBackOrFallback(
      () => {
        // 兜底必须用 replace：直接打开 /notes/new#...&returnPath=X 这种 URL 时
        // history.length=1，push 会把 /notes/new 留在 history 里，用户点浏览器
        // back 又回到编辑器再 push 再 back → 死循环出不去。
        if (safeReturnPath) {
          void navigate({
            to: safeReturnPath,
            ...(safeReturnHash ? { hash: safeReturnHash } : {}),
            replace: true,
          });
          return;
        }
        void navigate({ to: "/tabs/chat", replace: true });
      },
      safeReturnPath ?? "/tabs/chat",
    );
  }, [navigate, safeReturnHash, safeReturnPath]);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setCloseConfirmOpen(true);
      return;
    }
    // 用户从 + 菜单进编辑器但没编辑就退出：chat-list-page 在 navigate 前已经
    // createDesktopNoteDraft() 占了 draftId 入参，如果不清理这里，localStorage
    // 会一直攒空草稿——每次进入 readDesktopNoteDrafts() 都要解析全表，长期变慢。
    // 已保存（有 noteId）的草稿当缓存留下，下次进来还能恢复；只清没保存的空草稿。
    if (!noteId && activeDraftId && isNoteContentEmpty(editorState)) {
      clearDesktopNoteDraft(activeDraftId);
    }
    void leaveEditor();
  }, [activeDraftId, editorState, isDirty, leaveEditor, noteId]);

  // 走查 R3：requestClose 只在用户点应用左上 back / 硬件 Back 时被调用。
  // 浏览器 back 按钮 / iOS WebView 边缘滑动返回 / 桌面浏览器 popstate 走的是
  // 直接 history.back()，组件 unmount 前根本没调用 requestClose —— 空 draft
  // 仍残留 LS，跟 R1 真因不同（那个是 reconnect 多创建），这个是 unmount 漏清。
  // 用 ref 兜最新 (activeDraftId / editorState / noteId)，在真正 unmount 时
  // 兜底清一次没保存的空 draft。已 saveMutation 成功的情况 noteId 已 set，
  // 不会进 if；用户主动写了内容（非 empty）也不会进 if，安全。
  const unmountCleanupStateRef = useRef({ activeDraftId, editorState, noteId });
  unmountCleanupStateRef.current = { activeDraftId, editorState, noteId };
  useEffect(() => {
    return () => {
      const { activeDraftId: id, editorState: state, noteId: nid } =
        unmountCleanupStateRef.current;
      if (!nid && id && isNoteContentEmpty(state)) {
        clearDesktopNoteDraft(id);
      }
    };
  }, []);

  // 走查 R4：dirty 时点浏览器 back / iOS 边滑返回，编辑器直接 unmount，没机会
  // 弹「这条笔记还没有保存」确认。auto-save 220ms 兜底过 LS 草稿不会真丢失
  // （下次 /tabs/notes 还能恢复），但用户视觉上像是 dirty 内容被吃掉，
  // 跟应用左上 back 走的 requestClose 行为不一致。
  // useBlocker 拦截 SPA 内导航；shouldBlockFn 在 dirty 时返回 true，配合下面
  // 的 closeConfirmOpen 弹层让用户决定保存/不保存/取消；beforeunload 兜外层
  // tab close / 刷新（桌面 desktop-notes-workspace 已经用同样思路）。
  // skipBlockerRef = true 之后允许程序化跳转（用户在弹层里点了"不保存"或
  // "保存并关闭"后真正 leaveEditor 时不能再被拦下）。
  const skipBlockerRef = useRef(false);
  useBlocker({
    shouldBlockFn: () => {
      if (skipBlockerRef.current) return false;
      if (!isDirty) return false;
      // 已经在弹未保存确认了就不再重复拦，避免 close confirm 自身的"取消"
      // 二次触发 blocker 死锁。
      if (closeConfirmOpen) return false;
      setCloseConfirmOpen(true);
      return true;
    },
    enableBeforeUnload: () => isDirty,
  });

  // 走查 R1：Android 原生壳硬件 Back 之前完全不被这页拦截 —— 用户从 + 菜单进
  // 编辑器随便打了字按物理返回，history.back 直接走掉，dirty 内容静默丢失没
  // 任何提示；即使没编辑也漏掉 requestClose 里的空草稿清理（chat-list-page
  // 每次点「新建笔记」都 createDesktopNoteDraft，攒下来就拖慢 readDesktopNoteDrafts）。
  // 优先级（后注册先消费）：先吃掉子层弹层（确认 / 删除确认 / 标签输入），
  // sendDialog 由 MobileNoteSendSheet 自己注册的 interceptor 处理；最后兜底
  // 调 requestClose，dirty 自动弹未保存确认、空 draft 自动清理。
  useEffect(() => {
    const unregister = registerAndroidBackInterceptor((event) => {
      if (deleteConfirmOpen) {
        event.preventDefault();
        if (!deleteMutation.isPending) {
          setDeleteConfirmOpen(false);
        }
        return true;
      }
      if (closeConfirmOpen) {
        event.preventDefault();
        if (!saveMutation.isPending) {
          setCloseConfirmOpen(false);
        }
        return true;
      }
      if (sendDialogNote) {
        // MobileNoteSendSheet 自己注册过 interceptor 优先消费；它在 pending
        // 中不拦的兜底也得吃掉，不然 history.back 把用户从编辑器扔回 /tabs/chat
        // 而发送请求还在飞。
        event.preventDefault();
        return true;
      }
      if (tagEditorOpen) {
        event.preventDefault();
        setTagEditorOpen(false);
        return true;
      }
      event.preventDefault();
      requestClose();
      return true;
    });
    return unregister;
  }, [
    closeConfirmOpen,
    deleteConfirmOpen,
    deleteMutation.isPending,
    requestClose,
    saveMutation.isPending,
    sendDialogNote,
    tagEditorOpen,
  ]);

  async function handleSaveAndClose() {
    const savedNote = await handleSave();
    if (!savedNote) {
      return;
    }
    setCloseConfirmOpen(false);
    // 保存成功后 isDirty 已经回到 false（savedSnapshot 等于 currentSnapshot），
    // 理论上 useBlocker shouldBlockFn 会返回 false 让 leaveEditor 直接通过；
    // 但 React state 同步要等 commit，立刻 leaveEditor 时 isDirty 可能还是 true
    // → blocker 再次拦截 → 二次确认。skipBlockerRef 短路一次确保通过。
    skipBlockerRef.current = true;
    await leaveEditor();
  }

  async function handleDiscardAndClose() {
    // 走查 R1：在 clearDesktopNoteDraft 之前先把 auto-save 关掉 + 撤掉排队中的
    // timer。否则 220ms debounce 的 timer 若已经排队（用户敲完最后一字后还没到
    // 220ms 就点了"不保存"），navigate / unmount 一旦慢于 timer 触发，刚 clear
    // 掉的 draft 会被 re-saveDesktopNoteDraft 写回 LS，下次进编辑器又"复活"。
    autoSaveDisabledRef.current = true;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (activeDraftId) {
      clearDesktopNoteDraft(activeDraftId);
    }
    setCloseConfirmOpen(false);
    // 用户主动放弃，isDirty 仍是 true（editorState 没被清），需要短路 blocker
    // 才能真正 leaveEditor。
    skipBlockerRef.current = true;
    await leaveEditor();
  }

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

    // 走查 R1（第三轮）：原写法 attemptedSave 跟 sheet 打开解耦——已有笔记
    // dirty 改完点发送，handleSave 落库失败时 handleSave 返回 null；但代码继续
    // fallback 到 buildNoteSendDialogNote 用本地 editorState 构造 note card
    // 喂给 sheet，sheet 仍然弹出来。用户点会话发送出去 → 接收方收到一张
    // 标题 / excerpt 用 *客户端 dirty 内容* 的 note card，点开 (server fetch
    // by noteId) → 服务端那条还是上一次保存成功的旧内容，**两边对不上**。
    // 改成：用户期望走"保存后再发送"路径（isDirty 或新建笔记）但 handleSave
    // 没拿到 server 返回时直接 return；saveMutation.onError 已经设过红 notice，
    // 用户能看到失败原因，重试或检查网络后再来。
    const needsSaveBeforeSend = isDirty || !noteId;
    const savedNote = needsSaveBeforeSend
      ? await handleSave()
      : noteQuery.data && noteQuery.data.id === noteId
        ? noteQuery.data
        : null;
    if (needsSaveBeforeSend && !savedNote) {
      return;
    }

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

  // 走查 R3（新一轮）：原条件只看 noteQuery.isLoading + ref；data 到了那一帧
  // isLoading=false，但 init effect 还没在下一个 commit 里跑完 applyNoteSource
  // → editor 用 editorState=EMPTY 渲染一帧（用户能瞄到一个空编辑器），随后
  // 第二个 commit 才把内容塞进去。从 LoadingBlock 一直撑到 isEditorReady：
  // 不仅命中"网络还在拉"，还把"data 到了但 useEffect 没 commit"那一帧也兜住。
  // missingSelectedNote / 错误兜底由下面单独的 ErrorBlock 分支接管。
  if (
    selectedNoteId &&
    !isEditorReady &&
    !(noteQuery.isError && !cachedLocalDraftForSelected)
  ) {
    return (
      <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
        <LoadingBlock label={t(msg`正在读取笔记...`)} />
      </AppPage>
    );
  }

  if (
    selectedNoteId &&
    noteQuery.isError &&
    !cachedLocalDraftForSelected
  ) {
    return (
      <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
        <div className="w-full max-w-md rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-6 shadow-[var(--shadow-card)]">
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
              onClick={() => void leaveEditor()}
              className="rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none"
            >
              {t(msg`回到来源`)}
            </Button>
          </div>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--surface-secondary)] px-0 py-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) =>
          void handleAttachmentSelection(event.target.files)
        }
      />

      <TabPageTopBar
        title={
          // 顶栏标题改成受控 input：用户点击直接编辑；不填走 placeholder 展示派生
          // 标题，保存时 buildNoteMutationPayload 把 title 带过去（空串→后端派生）。
          // text-[16px]: iOS Safari focus 时 <16px 强制 viewport zoom-in；
          // enterKeyHint="done" + Enter preventDefault 避免 IME 候选回车顺带跑掉
          // 焦点（外层 contentEditable 没有 form，但部分 IME 仍会触发 default
          // submit-like 行为）。maxLength={32} 与后端截断长度一致。
          <input
            type="text"
            value={editorState.title}
            onChange={(event) => handleTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              }
            }}
            placeholder={derivedTitle}
            maxLength={32}
            enterKeyHint="done"
            aria-label={t(msg`笔记标题`)}
            disabled={noteQuery.isLoading}
            className="w-full bg-transparent text-[16px] font-medium tracking-normal text-[color:var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[color:var(--text-secondary)] disabled:cursor-default"
          />
        }
        titleAlign="left"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        titleClassName="text-[16px] font-medium tracking-normal"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={requestClose}
            className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <div className="flex items-center gap-1">
            {noteId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleteMutation.isPending}
                className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-secondary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
                aria-label={t(msg`删除笔记`)}
              >
                <Trash2 size={16} />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void requestSend()}
              disabled={
                saveMutation.isPending ||
                sendMutation.isPending ||
                isExistingNoteNotReady ||
                attachmentPending
              }
              className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-secondary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
              aria-label={t(msg`发送`)}
            >
              <Send size={16} />
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleSave()}
              // 走查 R2（新一轮）：附件上传期间保存会把 editorState 此刻的 *部分*
              // assets 一起 push 到 server——editor DOM 里已经 insertHTML 进所有
              // <img>/<a>，但 handleAttachmentSelection 收尾的 mergeNoteAssets +
              // setEditorState 还没跑完，editorState.assets 只有上传完成那几条。
              // payload 直接走，server 拿到的笔记缺一半 asset record，下次拉就少了。
              // attachmentPending 期间一并 disable Save/Send。
              disabled={
                saveMutation.isPending ||
                isExistingNoteNotReady ||
                attachmentPending
              }
              className="h-8 rounded-[12px] bg-[color:var(--brand-primary)] px-3 text-white hover:opacity-95"
            >
              <Save size={14} />
              <span className="ml-1 text-[12px]">
                {saveMutation.isPending ? t(msg`保存中`) : t(msg`保存`)}
              </span>
            </Button>
          </div>
        }
      >
        <div className="text-[11px] text-[color:var(--text-muted)]">
          {saveMutation.isPending
            ? t(msg`正在保存到收藏...`)
            : isDirty
              ? t(msg`存在未保存修改`)
              : noteId
                ? t(msg`已保存到收藏`)
                : t(msg`新建笔记`)}
        </div>
      </TabPageTopBar>

      {notice ? (
        <div className="px-4 pt-3">
          <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
        </div>
      ) : null}

      {tagEditorOpen || editorState.tags.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-faint)] bg-white/85 px-4 py-3">
          {editorState.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-primary)]/8 px-3 py-1 text-[12px] text-[color:var(--brand-primary)]"
            >
              <span>#{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[color:var(--brand-primary)] transition active:bg-[color:var(--brand-primary)]/16"
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
                // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
                className="h-9 w-[160px] rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 text-[16px] text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--brand-primary)]"
              />
              <Button
                variant="secondary"
                onClick={handleTagCommit}
                className="h-9 rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 shadow-none"
              >
                {t(msg`添加`)}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto bg-[color:var(--surface-card)] px-4 py-4">
        <div className="relative">
          {/* 走查 R4（第三轮）：原条件只看 contentText.trim() 空，没有 assets 兜底。
              新建笔记 → 直接传图（不打任何字）这条路径，contentText="" 但
              editorState.assets 有 entry / DOM 也有 <img>，placeholder "写点什么。
              支持富文本、待办、图片和文件。" 直接 absolute top-0 left-0 覆盖在
              图片左上角。pointer-events-none 不挡操作，但视觉上一片文字盖在
              图上，很丑。 noteQuery.isLoading 分支在 R3 加 LoadingBlock gate 之后
              已经走不到（loading 走 LoadingBlock 而不是这条 placeholder），
              一并清掉这条 dead path。*/}
          {!editorState.contentText.trim() && editorState.assets.length === 0 ? (
            <div className="pointer-events-none absolute left-0 top-0 text-[15px] leading-7 text-[color:var(--text-dim)]">
              {t(msg`写点什么。支持富文本、待办、图片和文件。`)}
            </div>
          ) : null}
          <div
            ref={editorRef}
            contentEditable={!noteQuery.isLoading}
            suppressContentEditableWarning
            onInput={syncEditorStateFromDom}
            onClick={handleEditorClick}
            className={cn(
              "min-h-[60vh] outline-none",
              // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
              // contentEditable 也算 focusable form control，同样受影响。
              "text-[16px] leading-7 text-[color:var(--text-primary)]",
              "[&_a[data-note-file='true']]:inline-flex [&_a[data-note-file='true']]:items-center [&_a[data-note-file='true']]:rounded-[12px] [&_a[data-note-file='true']]:border [&_a[data-note-file='true']]:border-[rgba(60, 40, 110, 0.08)] [&_a[data-note-file='true']]:bg-[color:var(--surface-secondary)] [&_a[data-note-file='true']]:px-3 [&_a[data-note-file='true']]:py-2 [&_a[data-note-file='true']]:text-[13px] [&_a[data-note-file='true']]:text-[color:var(--text-primary)] [&_a[data-note-file='true']]:no-underline",
              "[&_img[data-note-image='true']]:my-2 [&_img[data-note-image='true']]:max-h-[60vw] [&_img[data-note-image='true']]:max-w-full [&_img[data-note-image='true']]:rounded-[16px] [&_img[data-note-image='true']]:border [&_img[data-note-image='true']]:border-[rgba(60, 40, 110, 0.08)]",
              "[&_[data-note-checkbox='false']]:cursor-pointer [&_[data-note-checkbox='true']]:cursor-pointer [&_[data-note-checkbox='true']]:text-[color:var(--brand-primary)]",
            )}
          />
        </div>
      </div>

      <div
        className={cn(
          "sticky bottom-0 flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-2.5 py-2 backdrop-blur-xl",
          "pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]",
        )}
      >
        <ToolbarButton
          label={t(msg`附件`)}
          // 走查 R1：原写法没卡 attachmentPending —— 上传慢（公网隧道下 1~3s）
          // 时用户点不动会以为没生效，再连点几下 → 每次都 fileInputRef.click()
          // 弹原生 file picker 叠起来 → 选同一组文件 → 触发多次 onChange →
          // 同一份文件被并发上传 N 次，server 攒一堆重复 attachment，editor 也
          // 插入 N 套同 src 的 <img>。disabled 卡 click 后用户能从底部「附件
          // 上传中...」chip 读出在跑。
          disabled={attachmentPending}
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
          <span className="rounded-full bg-[color:var(--brand-primary)]/8 px-2.5 py-1 text-[11px] text-[color:var(--brand-primary)]">
            {t(msg`附件上传中...`)}
          </span>
        ) : null}
      </div>

      <ConfirmSheet
        open={deleteConfirmOpen}
        title={t(msg`删除这条笔记？`)}
        description={t(msg`删除后会从收藏的笔记列表中移除，无法恢复。`)}
        confirmLabel={t(msg`删除`)}
        pendingLabel={t(msg`删除中...`)}
        danger
        pending={deleteMutation.isPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void deleteMutation.mutateAsync()}
      />

      <UnsavedSheet
        open={closeConfirmOpen}
        // 走查 R4（新一轮）：原 pending 只看 saveMutation.isPending。如果 dirty
        // 时附件还在上传（attachmentPending=true）就点 Back → sheet 弹出 →
        // 点"保存并关闭"，handleSaveAndClose → handleSave → mutationFn 用此刻
        // 的 editorState 拼 payload，但 createdAssets 还没合进 editorState.assets
        // → server 拿到的笔记缺一半 asset。把"保存并关闭"也卡掉 attachmentPending；
        // saveDisabled 兜底，让 UnsavedSheet 上的 onSave 按钮在附件上传期变灰，
        // 用户必须等附件完成或选择"不保存 / 继续编辑"。
        pending={saveMutation.isPending}
        saveDisabled={attachmentPending}
        onClose={() => setCloseConfirmOpen(false)}
        onDiscard={() => void handleDiscardAndClose()}
        onSave={() => void handleSaveAndClose()}
      />

      <MobileNoteSendSheet
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
    </AppPage>
  );
}

function ToolbarButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[12px] border px-2.5 text-[12px] transition",
        active
          ? "border-[color:var(--brand-primary)]/16 bg-[color:var(--brand-primary)]/8 text-[color:var(--brand-primary)]"
          : "border-transparent bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] active:bg-black/5",
        disabled ? "cursor-not-allowed opacity-55" : undefined,
      )}
      aria-label={label}
      title={label}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  danger = false,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  danger?: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useRuntimeTranslator();
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(17,24,39,0.42)]">
      <button
        type="button"
        aria-label={t(msg`关闭确认弹层`)}
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative rounded-t-[22px] bg-[color:var(--surface-card)] pb-[calc(env(safe-area-inset-bottom,0px))] shadow-[0_-12px_32px_rgba(60, 40, 110, 0.16)]">
        <div className="px-5 pb-5 pt-6">
          <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
            {description}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-[color:var(--border-faint)] px-5 py-4">
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={pending}
            className="h-11 rounded-[12px] text-[15px]"
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="h-11 rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[15px] shadow-none"
          >
            {t(msg`取消`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UnsavedSheet({
  open,
  pending,
  saveDisabled = false,
  onClose,
  onDiscard,
  onSave,
}: {
  open: boolean;
  pending: boolean;
  saveDisabled?: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const t = useRuntimeTranslator();
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(17,24,39,0.42)]">
      <button
        type="button"
        aria-label={t(msg`关闭未保存提示`)}
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative rounded-t-[22px] bg-[color:var(--surface-card)] pb-[calc(env(safe-area-inset-bottom,0px))] shadow-[0_-12px_32px_rgba(60, 40, 110, 0.16)]">
        <div className="px-5 pb-5 pt-6">
          <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
            {t(msg`这条笔记还没有保存`)}
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
            {t(msg`保存后会进入收藏；如果直接关闭，当前草稿改动会被丢弃。`)}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-[color:var(--border-faint)] px-5 py-4">
          {saveDisabled ? (
            <div className="rounded-[12px] bg-[color:var(--brand-primary)]/8 px-3 py-2 text-[12px] leading-5 text-[color:var(--brand-primary)]">
              {t(msg`附件还在上传，完成后再保存或者直接放弃。`)}
            </div>
          ) : null}
          <Button
            variant="primary"
            onClick={onSave}
            disabled={pending || saveDisabled}
            className="h-11 rounded-[12px] bg-[color:var(--brand-primary)] text-[15px] text-white hover:opacity-95"
          >
            {pending ? t(msg`保存中...`) : t(msg`保存并关闭`)}
          </Button>
          <Button
            variant="danger"
            onClick={onDiscard}
            disabled={pending}
            className="h-11 rounded-[12px] text-[15px]"
          >
            {t(msg`不保存`)}
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="h-11 rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[15px] shadow-none"
          >
            {t(msg`继续编辑`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function hashWithoutLeading(value: string) {
  return value.startsWith("#") ? value.slice(1) : value;
}
