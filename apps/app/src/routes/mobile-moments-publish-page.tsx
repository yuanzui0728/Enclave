import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type Moment,
  type MomentsPageResponse,
} from "@yinjie/contracts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Play, Plus, X } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AppPage, InlineNotice, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { RouteRedirectState } from "../components/route-redirect-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { storeMomentPublishFlash } from "../features/moments/moment-publish-flash";
import {
  buildDesktopMomentsRouteHash,
} from "../features/moments/moments-route-state";
import { parseMobileMomentsPublishRouteState } from "../features/moments/mobile-moments-publish-route-state";
import {
  extractMomentDraftSnapshot,
  publishMomentComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import {
  clearMomentDraft,
  loadMomentDraft,
  saveMomentDraft,
  type StoredMomentDraft,
} from "../features/moments/moment-draft-store";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { pickImageFiles } from "../runtime/native-image-picker";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const t = translateRuntimeMessage;

// 用 text 长度 + 媒体 blob 大小 + duration 串成 fingerprint。比深比 blob 内容
// 便宜，又能足够稳定地判断"hydrate 完了之后用户有没有动过"——同样的 stored 写
// 回来时 text 不变、图片视频还是同一份 File 引用对应同一 blob.size。
function buildHydrationSignature(stored: StoredMomentDraft): string {
  const imageSig = stored.imageBlobs
    .map((b) => `${b.blob.size}x${b.width}x${b.height}`)
    .join(",");
  const videoSig = stored.videoBlob
    ? `${stored.videoBlob.blob.size}x${stored.videoBlob.durationMs}`
    : "";
  return `${stored.text.length}|${imageSig}|${videoSig}`;
}

function buildLiveComposeSignature(input: {
  text: string;
  imageDrafts: { file: File; width: number; height: number }[];
  videoDraft: { file: File; durationMs: number } | null;
}): string {
  const imageSig = input.imageDrafts
    .map((d) => `${d.file.size}x${d.width}x${d.height}`)
    .join(",");
  const videoSig = input.videoDraft
    ? `${input.videoDraft.file.size}x${input.videoDraft.durationMs}`
    : "";
  return `${input.text.length}|${imageSig}|${videoSig}`;
}

export function MobileMomentsPublishPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const composeDraft = useMomentComposeDraft();
  const routeState = useMemo(
    () => parseMobileMomentsPublishRouteState(hash),
    [hash],
  );
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const resetComposeDraft = composeDraft.reset;
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 同步防双击锁——下面 onClick 注释里那句「JS 层兜底防双击」原版用的是闭包
  // 抓的 canSubmit 当 guard，但 canSubmit 是上一次 render 时定下的常量，
  // React 没来得及 commit 「isPending=true」之前，连点 5 次会拿到同一个
  // canSubmit=true 同步通过 5 次，5 条 POST 全飞出去（实测连点 5 次发出 5 个
  // POST，2 个被服务端 429 砍掉，剩下 3 个真的入库 → 朋友圈出 3 条一模一样
  // 的帖子）。ref 同步赋值不走 React render，第一次 click 把它翻 true 之后
  // 同帧内的所有后续 click 都被卡住，等 onSettled 才解锁。
  const submittingRef = useRef(false);
  // 「这次离开页面之前，草稿已经被显式处理过」标记——onSuccess 清 IDB / 保留草稿 /
  // 不保留草稿 这三条路径都会翻 true。unmount cleanup 看到 true 就跳过 autosave，
  // 避免和 onSuccess 的 clearMomentDraft 抢着写同一把 IDB key（race 输了会让"已发布"
  // 的内容被 unmount autosave 复活成草稿——读 stale composeStateRef 时 hasContent
  // 还是 true，因为 reset 的 setState 还没 commit；ref 由 useEffect 在 commit 后才
  // 同步，cleanup 在 commit 中跑，读到的是 reset 之前的 ref）。
  const draftHandledRef = useRef(false);
  const [exitSheetOpen, setExitSheetOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  // toast 用 {message, key} 而不是 raw string —— 三行 SettingRow（所在位置/
  // 提醒谁看/谁可以看）点击都派发同一句「敬请期待」，如果只比较 message
  // 字符串，useEffect 的 toast dep 不变 → setTimeout 不重启 → 用户在 1.6s
  // 内连点不同行，第二次的 toast 提前消失。给每次 setToast 配一个递增 key，
  // useEffect 跟着 key 走就能稳定地每次重置 1.6s 倒计时。
  const [toast, setToast] = useState<{ message: string; key: number } | null>(
    null,
  );
  const toastKeyRef = useRef(0);
  function showToast(message: string) {
    toastKeyRef.current += 1;
    setToast({ message, key: toastKeyRef.current });
  }

  // textarea 高度跟内容长——原来 rows={4} 是死高，写长一点的朋友圈就只能在 4 行
  // 的小框里内部滚动（手指在 textarea 里另起一个滚动事件，体感跟微信完全不一样）。
  // 让它跟着 scrollHeight 长，最低 4 行（≈104px），最高 320px 后转内部滚动避免占满屏。
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, 320);
    ta.style.height = `${next}px`;
  }, [composeDraft.text]);

  // 钉住 createMutation 触发时刻的 baseUrl —— mid-flight 切账户后 onSuccess
  // 闭包里的 baseUrl 已经是新账户，但本次发表落到的是旧账户的 cloud-api。
  // 不加这把 guard 会出三件错事：
  //   1) storeMomentPublishFlash 走 sessionStorage（跨账户共享），用户切到 B
  //      会在 B 的朋友圈页看到「朋友圈已发布」绿条，但 B 里啥也没多
  //   2) queryClient.setQueryData / invalidate 全部走当前 baseUrl=B 的 key —
  //      把 A 账户的新 moment prepend 到 B 的 cache 头部，UI 瞬间出现一条
  //      不属于 B 的帖子；invalidate 立刻把 B refetch 回正常，但前 ~600ms 闪
  //      一下脏数据
  //   3) navigate replace 到 /discover/moments，把用户从 publish 页拽到 B 的
  //      朋友圈页 —— 但他切到 B 的本意可能就是去做别的事
  const createMutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    createMutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);
  const createMutation = useMutation({
    mutationFn: () =>
      publishMomentComposeDraft({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
        baseUrl,
      }),
    onMutate: () => {
      // onMutate 在 mutationFn 之前同步跑；这里钉住的 baseUrl 就是 publish 真正发
      // 到的目标账户。
      return { mutationBaseUrl: baseUrl };
    },
    onSuccess: (newMoment, _vars, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      // mid-flight 切账户：把 moment prepend 进**旧账户**的 cache（A 切到 B 后
      // 再切回 A 时第一帧就能看到刚发的），但不要触当前账户（B）的 UI 反馈。
      // invalidate 也针对旧账户：B 完全不该被这次 A 的发表牵动。
      queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
        ["app-moments-paged", mutationBaseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    items: [newMoment, ...current.pages[0]!.items],
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      queryClient.setQueryData<Moment[]>(
        ["app-moments", mutationBaseUrl],
        (current) => (current ? [newMoment, ...current] : current),
      );
      // "我的朋友圈"用 mine cache（profile-moments-page），这里也得 prepend +
      // invalidate，不然从发布页返回我的朋友圈第一次还看不见刚发的。
      queryClient.setQueryData<Moment[]>(
        ["app-moments-mine", mutationBaseUrl],
        (current) => (current ? [newMoment, ...current] : current),
      );
      // fire-and-forget：原来 await refetch 让"发表中"按钮多卡 600ms+。
      void queryClient.invalidateQueries({
        queryKey: ["app-moments", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", mutationBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-mine", mutationBaseUrl],
      });
      // 发表成功 → 清掉对应账户的草稿（按 mutationBaseUrl 走，而不是当前 baseUrl，
      // mid-flight 切账户场景下用户的本意是清 A 的草稿，不是清 B 的）。和 cache
      // invalidate / setQueryData 用同一把 baseUrl 锁。
      void clearMomentDraft(mutationBaseUrl);
      // 切走后剩下的 flash/draft-reset/navigate 都跟当前用户体验有关——
      // 切账户后用户已经不在 publish 上下文里，全部静默。和 R7/R8/R9
      // mid-flight 关 sheet 失败时静默吞错同思路。
      if (mutationBaseUrl !== createMutationBaseUrlRef.current) {
        return;
      }
      // 翻 draftHandledRef—— navigate 触发 unmount 时 cleanup 已不会再 autosave，
      // 避免和上面那条 clearMomentDraft 抢同一把 IDB key（race 输了 stale snapshot 又
      // 把刚发布的内容当草稿存回去）。
      // 走查 R1：原本这行同步落在 mid-flight 切账户 guard 之前，A 的 onSuccess 跑回
      // 来时把 draftHandledRef 当前 B 的会话也标记成「草稿已处理」——用户在 B 上重新
      // 输入后通过 tab 切换 / 深链接 / 系统手势这类不走 handleBack 的路径离开 publish
      // 时，unmount cleanup 看到 draftHandledRef=true 就跳过 autosave，B 的新内容凭空
      // 消失。挪到 same-account 分支只在本账户成功时翻 true。
      draftHandledRef.current = true;
      storeMomentPublishFlash(t(msg`朋友圈已发布。`));
      composeDraft.reset();
      // 只在用户还停在 publish 页时才 navigate。isPending 期间 我把 取消按钮
      // 禁了 + handleBack guard 了，但浏览器层的 swipe-back / Android 物理返回键
      // 这种系统手势绕过 React 拦不住——用户已经离开后 onSuccess 再 navigate 会
      // 把他从当前页拽回 /discover/moments，体验是「我都返回了它又把我抓回来」。
      // 已经离开就让 sessionStorage 里的 flash 在他下次自然进朋友圈时再弹。
      if (
        typeof window !== "undefined" &&
        window.location.pathname === "/discover/moments/publish"
      ) {
        void navigate({
          to: safeReturnPath ?? "/discover/moments",
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
          replace: true,
        });
      }
    },
  });

  useEffect(() => {
    resetComposeDraft();
  }, [baseUrl, resetComposeDraft]);

  // 进入发布页 → 从 IDB 取草稿 hydrate。reset effect 跑在前面（同步），
  // 然后这条 async load 落地把上一次保留的内容写回。account 切换时 reset
  // 会先把内存清掉，hasContent 守卫确保 hydrate 落点上没有新输入被覆盖。
  const hydrateFromStored = composeDraft.hydrateFromStored;
  const hasContentNow = composeDraft.hasContent;
  const hasContentNowRef = useRef(hasContentNow);
  useEffect(() => {
    hasContentNowRef.current = hasContentNow;
  }, [hasContentNow]);
  // hydrate 完成 → cleanup-untouched 信号：用户没动过恢复出来的草稿就 swipe-back
  // 时，cleanup autosave 不必再把同样一份 5min/100MB 视频 snapshot 写一遍 IDB。
  // 记录"hydrate 落地时的文本快照"——纯文本对比足够覆盖大多数场景（媒体改动
  // 走 add/remove/clear 等显式 setter，进一步检查 ref 长度也行；先保守只比文本）。
  const hydratedSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMomentDraft(baseUrl).then((stored) => {
      if (cancelled || !stored) return;
      // 慢盘场景：用户先打字、IDB read 才回来 —— 不要拿草稿覆盖新输入。
      if (hasContentNowRef.current) return;
      hydrateFromStored(stored);
      hydratedSignatureRef.current = buildHydrationSignature(stored);
      // hydrate 完了把 textarea cursor 移到末尾 —— React 的受控 textarea 在 value
      // 变化时不主动调整 selection，autoFocus 时初始 cursor 在 pos 0，hydrate
      // 落地后用户看到内容但 cursor 还在开头，要继续写得手动点末尾。微信恢复
      // 草稿是 cursor 直接落在末尾。setTimeout 0 等 React 把新 value 提交到 DOM
      // 再设 selection（同帧 setSelectionRange 会被 React 之后的 controlled
      // 提交 reset 掉）。
      window.setTimeout(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        const end = ta.value.length;
        ta.setSelectionRange(end, end);
      }, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, hydrateFromStored]);

  // unmount 兜底自动保留：用户用浏览器返回 / swipe-back / 系统手势直接关 tab，
  // 没机会走 ActionSheet 时，把当前 hasContent 的草稿自动落 IDB（微信也是这样的
  // 默认行为）。用 ref 拍 baseUrl + draft snapshot 快照，避免 cleanup 闭包读
  // stale state；同时跳过 createMutation.isPending 路径——发表成功的 onSuccess
  // 已经 reset() 了，正常 unmount 时 hasContent=false 不会走到这里。
  const composeStateRef = useRef({
    text: composeDraft.text,
    imageDrafts: composeDraft.imageDrafts,
    videoDraft: composeDraft.videoDraft,
    hasContent: composeDraft.hasContent,
    baseUrl,
    isPending: createMutation.isPending,
  });
  useEffect(() => {
    composeStateRef.current = {
      text: composeDraft.text,
      imageDrafts: composeDraft.imageDrafts,
      videoDraft: composeDraft.videoDraft,
      hasContent: composeDraft.hasContent,
      baseUrl,
      isPending: createMutation.isPending,
    };
  });
  useEffect(() => {
    return () => {
      const snap = composeStateRef.current;
      // 1) 显式处理过草稿（发表成功 / 保留 / 不保留）→ 跳过 autosave。否则会
      //    和 onSuccess 的 clearMomentDraft race，stale ref 的 hasContent=true
      //    会让"已发布"的内容被复活成草稿。
      // 2) mid-flight 发表中 unmount 几乎不发生（handleBack guard 拦死），但兜
      //    一下：发表中的内容不该重复 save 出来。
      // 3) 空内容直接返回，不留无意义空草稿。
      if (draftHandledRef.current || !snap.hasContent || snap.isPending) {
        return;
      }
      // 4) hydrate 出来用户一点都没动 → 没必要把同样一份 100MB 视频再 IDB write
      //    一遍。fingerprint 一致就跳过（text 长度 + 媒体 size/分辨率 /duration
      //    串起来比对，比 byte-by-byte 便宜，又能稳定区分用户是否动过）。
      if (hydratedSignatureRef.current) {
        const currentSig = buildLiveComposeSignature({
          text: snap.text,
          imageDrafts: snap.imageDrafts,
          videoDraft: snap.videoDraft,
        });
        if (currentSig === hydratedSignatureRef.current) {
          return;
        }
      }
      void saveMomentDraft(
        snap.baseUrl,
        extractMomentDraftSnapshot({
          text: snap.text,
          imageDrafts: snap.imageDrafts,
          videoDraft: snap.videoDraft,
        }),
      );
    };
  }, []);

  useEffect(() => {
    if (!isDesktopLayout) return;
    void navigate({
      to: "/tabs/moments",
      hash:
        buildDesktopMomentsRouteHash({
          returnPath: safeReturnPath,
          returnHash: safeReturnHash,
        }) ?? undefined,
      replace: true,
    });
  }, [isDesktopLayout, navigate, safeReturnHash, safeReturnPath]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
  }, [toast?.key]);

  // ESC 关闭「放弃发表」确认弹窗 / 媒体选择器（和 farm 的 sheet/modal 处理对齐）。
  useEffect(() => {
    if (!exitSheetOpen && !mediaPickerOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (exitSheetOpen) {
        dismissExitSheet();
        return;
      }
      if (mediaPickerOpen) {
        setMediaPickerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [exitSheetOpen, mediaPickerOpen]);

  // 原生壳硬件 Back 键统一走 publish 页自己的 handleBack：
  // - modal 打开 → 关 modal
  // - 有内容 → 弹 discard confirm
  // - 空内容 → performBack（navigate 回 Moments）
  // 不让默认 BACK chain 走 history.back，避免 publish 直接进 + history 不够
  // 时把 app minimize 到桌面。
  //
  // 走查再一轮 R1：原 useEffect 没 deps array → 每次父组件 re-render（输入 textarea
  // 每个字符都会 setText 触发）都把 Android back interceptor unregister + re-register
  // 一遍。Set.delete + Set.add 单次微秒级、看似无所谓，但写长草稿打 200 字就是 200
  // 次反复装卸，CPU/锁竞争白烧。改 ref 模式：interceptor 闭包稳定，最新 handler /
  // state 走 ref 读，effect 只在 mount/unmount 跑一次。
  const backInterceptorContextRef = useRef({
    exitSheetOpen,
    mediaPickerOpen,
    dismissExitSheet,
    setMediaPickerOpen,
    handleBack,
  });
  useEffect(() => {
    backInterceptorContextRef.current = {
      exitSheetOpen,
      mediaPickerOpen,
      dismissExitSheet,
      setMediaPickerOpen,
      handleBack,
    };
  });
  useEffect(() => {
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      const ctx = backInterceptorContextRef.current;
      if (ctx.exitSheetOpen) {
        ctx.dismissExitSheet();
        return true;
      }
      if (ctx.mediaPickerOpen) {
        ctx.setMediaPickerOpen(false);
        return true;
      }
      ctx.handleBack();
      return true;
    });
  }, []);

  function performBack() {
    navigateBackOrFallback(
      () => {
        if (safeReturnPath) {
          void navigate({
            to: safeReturnPath,
            ...(safeReturnHash ? { hash: safeReturnHash } : {}),
          });
          return;
        }
        void navigate({ to: "/discover/moments" });
      },
      safeReturnPath ?? "/discover/moments",
    );
  }

  function handleBack() {
    // 正在上传/发表中：禁止返回——TanStack mutation 没接 AbortSignal，悄悄走人也
    // 拦不下来这次发表（用户以为放弃了，但 onSuccess 仍会触发 flash + 跳回朋友圈
    // 看到自己刚才说"放弃"的那条已经在列表里）。强制等 isPending 翻到 false。
    if (createMutation.isPending) {
      return;
    }
    if (composeDraft.hasContent) {
      // 先把 textarea 失焦把软键盘收掉——sheet 是 fixed bottom，键盘也是 fixed
      // bottom，两者一起出现会盖在一起；WeChat 的发圈"保留/不保留"弹起前也先
      // 收键盘。dismissExitSheet 在 sheet 关时把焦点还回 textarea，键盘会自然
      // 弹回来，体感不丢上下文。
      textareaRef.current?.blur();
      setExitSheetOpen(true);
      return;
    }
    performBack();
  }

  // 关闭「保留 / 不保留」ActionSheet 的取消路径都一样：先收 sheet、再把焦点还回
  // textarea。用户语义就是要接着写，焦点丢失会让他得再 tap 一次 textarea 才能唤回键盘。
  function dismissExitSheet() {
    setExitSheetOpen(false);
    textareaRef.current?.focus();
  }

  function handleKeepDraft() {
    // 保留草稿 → 拍当前 compose snapshot 存进 IDB（按 baseUrl 隔离），再 reset
    // 内存 + 返回。saveMomentDraft 内部失败静默退化（隐私模式 / quota 满），
    // UI 不要因为保存失败卡住——返回这条路径必须保证一定走通。
    setExitSheetOpen(false);
    // 翻 draftHandledRef 阻止 unmount cleanup 再 autosave 一次——同样的快照
    // 写两次只是浪费 IDB 一次 readwrite，但和发表成功路径用同一把锁保持一致。
    draftHandledRef.current = true;
    void saveMomentDraft(
      baseUrl,
      extractMomentDraftSnapshot({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
      }),
    );
    composeDraft.reset();
    performBack();
  }

  function handleConfirmDiscard() {
    setExitSheetOpen(false);
    // 不保留 → 把 IDB 里之前可能残留的草稿一起清掉（用户上次保留过 + 这次没用 +
    // 这次决定丢弃；不清的话下次进发布页又恢复出来）。和 keep 一样静默处理失败。
    // draftHandledRef 翻 true 防 cleanup autosave 把 stale 内容又存回（同 onSuccess
    // 路径同款 stale snapshot 风险——cleanup 读 ref 是 reset 之前的 commit）。
    draftHandledRef.current = true;
    void clearMomentDraft(baseUrl);
    composeDraft.reset();
    performBack();
  }

  async function handlePickImages() {
    try {
      // 第二次走查 R4：原生壳 (PHPicker / PickVisualMedia) 拿到 limit 后会在系统
      // 选图 UI 上限制最多可勾数量。不传时 native-image-picker 默认 9 张，但跟
      // 当前已塞进 draft 的 imageDrafts 不联动 —— 已有 5 张时原生界面仍允许勾
      // 9 张，回到 composeDraft.addImageFiles 才被 "还可以继续添加 4 张" 拒掉，
      // 用户的选择白做。把剩余可用槽位算进去传给原生层，UI 层直接 cap。
      const remainingSlots = Math.max(
        0,
        9 - composeDraft.imageDrafts.length,
      );
      const files = await pickImageFiles({
        multiple: true,
        limit: remainingSlots > 0 ? remainingSlots : undefined,
      });
      if (files.length === 0) {
        return;
      }
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        describeRequestError(error, t(msg`图片选择失败，请稍后重试。`)),
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        describeRequestError(error, t(msg`视频选择失败，请稍后重试。`)),
      );
    }
  }

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在回到桌面朋友圈`)}
        description={t(msg`发朋友圈在桌面布局里已经并入朋友圈工作区，这里会自动带你返回桌面入口。`)}
        loadingLabel={t(msg`正在打开朋友圈...`)}
      />
    );
  }

  const canSubmit = composeDraft.hasContent && !createMutation.isPending;
  // 走查深度第二轮：原本 isApiRequestError 命中走 translateAppErrorCode，否则裸吐
  // err.message——但这条 fallback 在两条真实链路上都暴露原始英文给终端用户：
  //   (a) 上传/发布过程 fetch throw TypeError("Failed to fetch") / ("Load failed")
  //       —— 公网隧道断流、世界 child 重启、CORS preflight 失败时高频；用户看到
  //       的是裸 "Failed to fetch"。
  //   (b) ApiRequestError 但 errorCode 不在 KnownAppErrorCode 字典里（如服务端
  //       500 抛 INTERNAL_ERROR、cloud-auth 401 抛裸英文 message）；
  //       translateAppErrorCode 返回 null → 回退到 server legacyMessage 也是英文。
  // describeRequestError 已经把这两类都翻成 zh-CN/en-US/ja-JP/ko-KR locale 的
  // 友好文案（"当前无法连接到隐界世界..." / "当前隐界世界暂时不可用..." / "云账号会话
  // 已失效..."），mediaError 那条链路（pickImages / replaceVideoFile）就是这么用的。
  // 这里改成同一条出口，发布按钮的错误提示和媒体选择错误提示一致。
  const errorMessage =
    composeDraft.mediaError ??
    (createMutation.isError && createMutation.error instanceof Error
      ? describeRequestError(createMutation.error)
      : null);

  const imageCount = composeDraft.imageDrafts.length;
  const showAddTile =
    !composeDraft.videoDraft && imageCount < 9 && composeDraft.canAddImages;
  const showVideoSlot = Boolean(composeDraft.videoDraft);
  const showImageGrid = imageCount > 0;

  return (
    <AppPage className="space-y-0 bg-[#F7F7F7] px-0 py-0">
      <TabPageTopBar
        title="" // i18n-ignore-line: intentionally empty
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-[#F7F7F7] px-3 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          <button
            type="button"
            onClick={handleBack}
            disabled={createMutation.isPending}
            className={cn(
              "h-9 px-2 text-[15px] active:opacity-70",
              createMutation.isPending
                ? "text-[#B0B0B0]"
                : "text-[#1A1A1A]",
            )}
          >
            {t(msg`取消`)}
          </button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => {
              // JS 层兜底防双击：disabled 属性靠 React 下次 commit 才生效；同
              // 一帧里 closure 抓的 canSubmit 也是上一次 render 的常量，连点
              // 5 次会同步通过 5 次（实测 5 个 POST 全飞，2 个被服务端 429 砍
              // 掉，剩下 3 个真入库 → 朋友圈出 3 条重复帖）。submittingRef 是
              // 同步赋值的 ref，第一次 click 把它翻 true 之后同帧的所有后续
              // click 都被卡住。
              if (submittingRef.current) return;
              if (!canSubmit) return;
              submittingRef.current = true;
              createMutation.mutate(undefined, {
                onSettled: () => {
                  submittingRef.current = false;
                },
              });
            }}
            disabled={!canSubmit}
            className={cn(
              // min-w 让"发表"(2 字) → "发表中"(3 字) 的状态切换不再撑大按钮，
              // 避免顶栏右上角看起来抖一下；按住够装下 isPending 文案。
              "h-7 min-w-[3.75rem] rounded-[3px] px-3 text-[14px] font-medium transition",
              canSubmit
                ? "bg-[#07C160] text-white active:bg-[#06AD56]"
                : "bg-[#9DD9B0] text-white",
            )}
          >
            {createMutation.isPending ? t(msg`发表中`) : t(msg`发表`)}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {errorMessage ? (
          <div className="px-4 pt-3">
            <InlineNotice
              tone="danger"
              // 走查本轮 R3 (a11y)：发布失败 / 媒体选择失败的反馈条 SR 用户错过 ——
              // 用户按"发表"后 5s 无响应、textarea 又锁了 readOnly，错过红条等于
              // 完全不知道为啥。挂 role="alert" 让 assertive 立即朗读。
              role="alert"
              className="rounded-[8px] px-3 py-2 text-[12px] shadow-none"
            >
              {errorMessage}
            </InlineNotice>
          </div>
        ) : null}

        <section className="bg-white px-4 pt-4">
          <textarea
            ref={textareaRef}
            value={composeDraft.text}
            onChange={(event) => composeDraft.setText(event.target.value)}
            placeholder={t(msg`这一刻的想法...`)}
            // 走查本轮 R1 (a11y)：placeholder 只在 textarea 为空时 SR 才能读到，用户
            // 一开始打字 placeholder 消失 → 屏幕阅读器再 enumerate 这个字段时只播报
            // "edit textarea" 完全没语义。顶栏 title 又是空字符串（i18n-ignore-line），
            // SR 用户从「我」/「发现」进发布页一开始就缺少"我正在哪里"的上下文。
            // 挂 aria-label 后即使打字状态也能听到"朋友圈正文"。
            aria-label={t(msg`朋友圈正文`)}
            rows={4}
            // 2000 字软上限，配合后端 MOMENTS_TEXT_TOO_LONG（同上限）形成双保险——
            // 之前没有任何上限，粘贴一段 50K 字符的全文会让 createUserMoment 通过、
            // 然后列表渲染那条卡片把整段 whitespace-pre-wrap 一次性绘出来，
            // 移动 Safari 直接卡顿，且 DB 里 moment_posts.text 持续膨胀。
            maxLength={2000}
            // 发表 mutation pending 期间锁死 textarea：
            //   1) mutationFn 闭包读的是按下"发表"那一刻的 composeDraft.text 快照，
            //      用户 mid-flight 继续输入并不会被一起发出去；
            //   2) onSuccess 无条件 composeDraft.reset() + navigate replace 到
            //      /discover/moments，新输入的内容会被静默清掉再被卸载页带走。
            //   X 移除图/视频按钮和"取消"/"发表"按钮已经按 pending 禁用；textarea
            //   不锁就是这条路径里唯一能让用户白打字的地方。
            //   readOnly 而非 disabled —— disabled 会把已有内容置灰看起来像出错，
            //   readOnly 视觉上跟正常态一致，键盘也压下去。
            readOnly={createMutation.isPending}
            // outline-none 干掉浏览器原生轮廓；focus/focus-visible:shadow-none 干掉
            // tokens.css 里 :focus-visible 的全局 3px 绿光 box-shadow——autoFocus
            // 一进页面就吃这一圈、看起来像微信里冒出来一个绿色描边的输入框，
            // 实际 WeChat compose 没有这层 ring。
            className="block w-full resize-none border-0 bg-transparent text-[17px] leading-[26px] text-[#1A1A1A] outline-none placeholder:text-[#B0B0B0] focus:shadow-none focus-visible:shadow-none"
            style={{ minHeight: "104px" }}
            autoFocus
          />

          {showImageGrid || showVideoSlot ? (
            // 已经有图片/视频：进入 3 列 grid 布局，把媒体格子和"再加一张"小 +
            // 放一起，体感与微信发朋友圈一致。
            <div
              className="mt-3 grid"
              style={{
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "4px",
              }}
            >
              {composeDraft.imageDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="relative overflow-hidden bg-[#EAEAEA]"
                  style={{ aspectRatio: "1 / 1" }}
                >
                  <img
                    src={draft.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => composeDraft.removeImageDraft(draft.id)}
                    disabled={createMutation.isPending}
                    aria-label={t(msg`移除图片`)}
                    className={cn(
                      "absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-white",
                      createMutation.isPending
                        ? "bg-black/20"
                        : "bg-black/45",
                    )}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {showVideoSlot && composeDraft.videoDraft ? (
                <div
                  className="relative overflow-hidden bg-black"
                  style={{ aspectRatio: "1 / 1" }}
                >
                  {composeDraft.videoDraft.posterPreviewUrl ? (
                    <img
                      src={composeDraft.videoDraft.posterPreviewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    // 封面生成失败时退到 <video> 显示首帧。preload="metadata" 必须
                    // 显式给——移动端 Safari 默认 "none"，啥都不加载就是一片黑。
                    <video
                      src={composeDraft.videoDraft.previewUrl}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play size={16} className="translate-x-[1px] fill-current" />
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => composeDraft.clearVideoDraft()}
                    disabled={createMutation.isPending}
                    aria-label={t(msg`移除视频`)}
                    className={cn(
                      "absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-white",
                      createMutation.isPending
                        ? "bg-black/20"
                        : "bg-black/45",
                    )}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : null}

              {showAddTile && !showVideoSlot ? (
                <button
                  type="button"
                  // 走到这里 grid 已经在渲染（showImageGrid 或 showVideoSlot 触发），
                  // 又因为 !showVideoSlot 排除了纯视频情况，剩下只可能是 imageCount>0，
                  // 用户已经在"图片相册"模式里，再 + 就直接进系统相册，跳过中间 sheet。
                  onClick={() => {
                    void handlePickImages();
                  }}
                  disabled={createMutation.isPending}
                  className="flex items-center justify-center bg-[#F7F7F7] text-[#B0B0B0] disabled:opacity-50 active:bg-[#EFEFEF]"
                  style={{ aspectRatio: "1 / 1" }}
                  aria-label={t(msg`添加图片`)}
                >
                  <Plus size={28} strokeWidth={1.4} />
                </button>
              ) : null}
            </div>
          ) : showAddTile ? (
            // 还没选媒体：留一个大点的入口，按一下走 picker sheet 决定走图片还是
            // 视频；和微信发朋友圈的初始空态一致。
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setMediaPickerOpen(true)}
                disabled={createMutation.isPending}
                className="flex h-[110px] w-[110px] items-center justify-center bg-[#F2F2F2] text-[#B0B0B0] disabled:opacity-50 active:bg-[#EAEAEA]"
                // aria-label 要描述真实行为：这个入口走的是 picker sheet（图片
                // 和视频两路都开），不是 grid 内的纯图片 +。错描述会让无障碍
                // 用户以为没法发视频。
                aria-label={t(msg`添加图片或视频`)}
              >
                <Plus size={32} strokeWidth={1.4} />
              </button>
            </div>
          ) : null}

          <div className="h-3" />
        </section>

        <section className="mt-2 bg-white">
          <SettingRow
            label={t(msg`所在位置`)}
            value={t(msg`不显示位置`)}
            onTap={() => showToast(t(msg`敬请期待`))}
          />
          <SettingRow
            label={t(msg`提醒谁看`)}
            value=""
            onTap={() => showToast(t(msg`敬请期待`))}
          />
          <SettingRow
            label={t(msg`谁可以看`)}
            value={t(msg`公开`)}
            onTap={() => showToast(t(msg`敬请期待`))}
            isLast
          />
        </section>

        <div className="px-4 pt-3 text-[11px] leading-5 text-[#9A9A9A]">
          {t(msg`图片最多 9 张，视频当前支持 1 条且不超过 5 分钟，暂不支持图片和视频混发。`)}
        </div>

        <div className="h-[calc(env(safe-area-inset-bottom,0px)+24px)]" />
      </div>

      {mediaPickerOpen ? (
        <MediaPickerSheet
          onPickImages={() => {
            setMediaPickerOpen(false);
            void handlePickImages();
          }}
          onPickVideo={() => {
            setMediaPickerOpen(false);
            videoInputRef.current?.click();
          }}
          onClose={() => setMediaPickerOpen(false)}
          videoDisabled={!composeDraft.canAddVideo}
        />
      ) : null}

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[1100] flex justify-center"
        >
          {/* 走查本轮 R2 (a11y)：SettingRow（所在位置/提醒谁看/谁可以看）点击只
              派发 "敬请期待" toast 做唯一反馈——SR 用户 tap 完整张 sheet 没任何
              声音反馈，根本不知道按了之后发生啥（视觉上是一段几行的"敬请期待"
              小黑条）。挂 role="status" + aria-live="polite"，VoiceOver/TalkBack
              在 toast 一冒出来就播报内容；不要用 aria-live="assertive" 避免打断
              已经在播报的 textarea 输入反馈。 */}
          <div
            role="status"
            aria-live="polite"
            className="rounded-[6px] bg-black/72 px-3 py-1.5 text-[13px] text-white"
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      {exitSheetOpen ? (
        // WeChat 风格 ActionSheet：底部弹起，「保留」灰底主动作 + 「不保留」红字
        // 次动作 + 「取消」灰底返回。z-[1300] 必须盖在 toast (z-1100) /
        // mediaPickerSheet (z-1200) 之上——用户在 1.6s 内连点 SettingRow 后退出，
        // 刚冒的 toast 不应该把 sheet 底边吃掉。
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t(msg`退出编辑`)}
          className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40"
        >
          <button
            type="button"
            aria-label={t(msg`关闭提示`)}
            onClick={dismissExitSheet}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-[480px] rounded-t-[12px] bg-white pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
            <button
              type="button"
              onClick={handleKeepDraft}
              className="block w-full border-b border-[#ECECEC] py-3.5 text-center text-[16px] text-[#1A1A1A] active:bg-[#F2F2F2]"
            >
              {t(msg`保留`)}
            </button>
            <button
              type="button"
              onClick={handleConfirmDiscard}
              className="block w-full border-b border-[#ECECEC] py-3.5 text-center text-[16px] font-medium text-[#FA5151] active:bg-[#F2F2F2]"
            >
              {t(msg`不保留`)}
            </button>
            <button
              type="button"
              onClick={dismissExitSheet}
              className="mt-2 block w-full bg-[#F7F7F7] py-3.5 text-center text-[16px] text-[#1A1A1A] active:bg-[#EFEFEF]"
            >
              {t(msg`取消`)}
            </button>
          </div>
        </div>
      ) : null}

      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          void handleVideoFileSelected(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </AppPage>
  );
}

function SettingRow({
  label,
  value,
  onTap,
  isLast,
}: {
  label: string;
  value: string;
  onTap: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-[#F2F2F2]",
        isLast ? "" : "border-b border-[#ECECEC]",
      )}
    >
      <span className="text-[15px] text-[#1A1A1A]">{label}</span>
      <span className="flex items-center gap-1 text-[14px] text-[#9A9A9A]">
        {value ? <span>{value}</span> : null}
        <ChevronRight size={16} className="text-[#C5C5C5]" />
      </span>
    </button>
  );
}

function MediaPickerSheet({
  onPickImages,
  onPickVideo,
  onClose,
  videoDisabled,
}: {
  onPickImages: () => void;
  onPickVideo: () => void;
  onClose: () => void;
  videoDisabled?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(msg`选择媒体`)}
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label={t(msg`关闭`)}
      />
      <div className="relative w-full max-w-[480px] rounded-t-[12px] bg-white pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        <button
          type="button"
          onClick={onPickImages}
          className="block w-full border-b border-[#ECECEC] py-3.5 text-center text-[16px] text-[#1A1A1A] active:bg-[#F2F2F2]"
        >
          {t(msg`从相册选择图片`)}
        </button>
        <button
          type="button"
          onClick={onPickVideo}
          disabled={videoDisabled}
          className={cn(
            "block w-full border-b border-[#ECECEC] py-3.5 text-center text-[16px] active:bg-[#F2F2F2]",
            videoDisabled ? "text-[#B0B0B0]" : "text-[#1A1A1A]",
          )}
        >
          {t(msg`选择视频`)}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 block w-full bg-[#F7F7F7] py-3.5 text-center text-[16px] text-[#1A1A1A] active:bg-[#EFEFEF]"
        >
          {t(msg`取消`)}
        </button>
      </div>
    </div>
  );
}
