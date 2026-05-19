import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  SELF_CHARACTER_ID,
  forwardFeedPostToChat,
  getFriends,
  type FriendListItem,
} from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { AvatarChip } from "./avatar-chip";

const t = translateRuntimeMessage;

type ChannelsForwardPickerProps = {
  open: boolean;
  postId: string | null;
  postExcerpt?: string;
  baseUrl?: string;
  onClose: () => void;
  /**
   * 通知 channels-page 刷 toast + bump shareCount。
   * mutationBaseUrl 是开始 forward 那一刻 picker 拿到的 baseUrl，channels-page
   * 用它做 mid-flight 切账户 guard：若用户在 200-500ms RTT 期间切到 B 账户，
   * 这条 forward 仍属于 A，"已转发给 X" toast 不应该冒到 B 用户眼前。
   */
  onForwarded?: (
    target: { characterId: string; name: string },
    context: { mutationBaseUrl: string | undefined },
  ) => void;
  /**
   * 转发失败兜底回调：用户点完好友马上点 取消/backdrop 关 picker，picker 内
   * 的 errorMessage 已经不渲染了；让 channels-page 知道这次失败，在 page 级
   * 显示一行 notice，避免静默吞错。同样带 mutationBaseUrl，让 channels-page
   * 做 mid-flight guard。
   */
  onForwardFailed?: (input: {
    targetCharacterId: string;
    targetName: string;
    message: string;
    mutationBaseUrl: string | undefined;
  }) => void;
};

/**
 * 视频号"转发到聊天"好友选择器 —— 移动端 & 桌面端复用同一组件。
 *
 * 行为：
 *  - 拉 owner 的好友列表（角色），按 lastInteractedAt 倒序展示
 *  - 选中一个角色 → POST /feed/:postId/forward-to-chat
 *  - 成功后 onForwarded 回调 → 父级 toast
 */
export function ChannelsForwardPicker({
  open,
  postId,
  postExcerpt,
  baseUrl,
  onClose,
  onForwarded,
  onForwardFailed,
}: ChannelsForwardPickerProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 走查 R3（本轮）：handlePick await mutateAsync 期间，用户可能已经手动关 picker、
  // 再为另一条 post 重开 picker（postId 切到 B）。此时 A 的 mutation 完成 →
  // 进入 try 分支的 onClose() → 把刚开的 B 的 picker 也一起关掉，用户莫名其妙
  // 「我刚开的 picker 自己关了」。用 ref 现读最新 postId，对照 handlePick 开始
  // 时 capture 的 initialPostId，只在还停在同一条 post 时才主动关闭。
  const latestPostIdRef = useRef(postId);
  latestPostIdRef.current = postId;

  // 走查 2026-05-18 新会话 R5（本轮）：handlePick 入口只靠 disabled={isBusy}
  // = forwardMutation.isPending 锁双击，但 isPending 是 react-query 改 internal
  // state 后下一次 render 才回 true 的异步 state。键鼠快速双击同一位好友（典
  // 型间隔 <16ms）时两个 click handler 同步进入 handlePick → 两次
  // mutateAsync({targetCharacterId: same}) 同步入栈 → 两条 forwardFeedPostToChat
  // POST 同时飞出去 → 被转发的好友 chat 里被插两条一模一样的"分享自视频号"
  // 卡片（接收方 server 端没去重）。同款 sync ref 锁挡同帧二次点击；
  // forwardMutation settled 时通过下方 useEffect [isPending] 复位（声明在
  // forwardMutation 之下，避免 TDZ）。
  // 注：每条 forward 都会触发 ChatGateway 推一条 message + character 自动回应，
  // 重复发会让 npc reaction queue 也跑两遍，公网下用户体感「我点了一次为什么
  // 他回了两次」。
  const pickSubmittingRef = useRef(false);

  // Reset error when opened/closed
  useEffect(() => {
    if (!open) setErrorMessage(null);
  }, [open]);

  // 弹窗打开时再拉好友列表，避免无关页面也跑这个 query
  const friendsQuery = useQuery({
    queryKey: ["channels-forward-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open,
    staleTime: 30_000,
  });

  const forwardMutation = useMutation({
    mutationFn: async (input: { targetCharacterId: string }) => {
      if (!postId) throw new Error("postId required"); // i18n-ignore-line
      return await forwardFeedPostToChat(
        postId,
        { targetCharacterId: input.targetCharacterId },
        baseUrl,
      );
    },
  });
  // R5 续：mutation settled 后释放同帧锁（声明顺序：forwardMutation 必须先于
  // useEffect 引用）。
  useEffect(() => {
    if (!forwardMutation.isPending) {
      pickSubmittingRef.current = false;
    }
  }, [forwardMutation.isPending]);

  // 走查 2026-05-18 新会话 R9（本轮）：原 deps `[open, onClose]` 看似无害，
  // 但父级 DesktopChannelsWorkspace 上 onClose 是内联箭头
  // `onClose={() => setForwardPickerPost(null)}`，每次 workspace re-render
  // 都换 identity——视频号工作区里 IntersectionObserver setSelectedPostId /
  // like / favorite / follow cache 乐观更新 / viewFeedPost mutation 完成 /
  // forwardNotice 3s 计时器到 等等都触发 re-render，picker 打开期间这条
  // effect 每秒 4-8 次 cleanup + add 同款 listener。装卸本身廉价但在 React 18
  // strict-mode dev 下能放大成抖动，且极端时与 native keydown 错峰丢键。
  // latest-ref 锁稳：deps 只挂 open，listener 内部读 ref.current。同款修法
  // 跟 workspace 那边 onCloseAuthorRef R3 一致。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // 走查 2026-05-18 新会话 R1（移动端视频号转发 picker）：picker 已挂
  // role="dialog" aria-modal="true"，但 aria-modal 在 ARIA 标记的 <div> 上
  // 浏览器并不会自动 trap focus（只对 <dialog>.showModal() 生效）—— 用户用
  // 键盘从视频号卡上「分享」按钮按 Tab → 焦点直接漏到下面的「减少推荐」/
  // 作者头像 / 已关注 等 background button 上（CDP 实测 3 次 Tab 全在 dialog
  // 外），既导致键盘用户无法用 Tab 选目标好友，又让 SR 用户的「modal 内部」
  // 语义破口。视觉上 backdrop 是 click-trap，键盘用户被 backdrop 视觉骗了
  // 但实际焦点在 backdrop 下面跑。
  // 标准 a11y modal 焦点管理：
  //   1) 打开瞬间把焦点移入 dialog（先取消按钮——比 X 角更显眼且语义清晰）
  //   2) Tab 抵达 dialog 内最后一个 focusable 时下一次 Tab cycle 回第一个
  //   3) Shift+Tab 抵达第一个时 cycle 到最后一个
  //   4) 关闭时把焦点还给「打开 picker 的」原 trigger button
  // 同款问题在 share-card-modal / mobile-channels-comments-sheet 都存在
  // （后者部分缓解——open 时 .focus() textarea 把焦点拉进去——但 Tab cycle
  // 仍能漏出），本次专攻视频号路径只修这一处，其它入口后续审计另起 commit。
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    // 记下打开前的焦点，关闭时归还。null check：picker 是 page-level 渲染，
    // 多数情况下都有 activeElement，但 SSR / iframe / fresh mount 时可能为
    // null/body —— 归还时跳过即可。
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    // 移动 focus 进 dialog：优先「取消」按钮（dialog 内的「取消」是最常用退出
    // 路径，键盘用户先看到它会更顺）。rAF 等到 Suspense / 入场动画稳定后再
    // .focus()，避开「focus 落到将被卸载元素」的 race。
    const focusTimer = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const cancelBtn = dialog.querySelector<HTMLButtonElement>(
        "button:not([disabled])",
      );
      if (cancelBtn) cancelBtn.focus();
      else dialog.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusTimer);
      const prev = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (!prev || !document.contains(prev)) return;
      // 等下一帧再把焦点还回去——picker 销毁触发的 React commit 跟焦点
      // 转移同帧时浏览器偶发把焦点丢到 body；rAF 让 commit 落定。
      //
      // 走查 2026-05-19 第七轮 R6（desktop channels）：preventScroll:true ——
      // picker 关闭路径有多种（手动 cancel / Esc / Android-back / mid-flight
      // 切账户 baseUrl reset / pickFinishUI auto-close），其中 baseUrl reset
      // / mid-flight 切账户的情况下 prev focus 可能是上一个账户里 home / chat
      // 的某颗按钮，DOM 仍在但视口可能因账户切换重渲已经不一样位置；裸
      // .focus() scrollIntoView 跳到看起来"凭空冒出来"的位置。preventScroll
      // 让 viewport 保持稳定。同款 R6 在 desktop ChannelCommentsDrawer /
      // ChannelAuthorOverlay 一起加。
      //
      // 走查 2026-05-19 第十五轮 R8：跟 desktop ChannelCommentsDrawer 第十三
      // 轮 R2 / ChannelAuthorOverlay 第十三轮 R3 (commit e0cc6424f) 同款 inert
      // 失焦边界 — picker 关闭路径里有"用户在 slide A 上点 share 按钮 → picker
      // 打开 → 鼠标 / scroll 滚到 slide B → A 因 isActive=false 拿到 inert=true
      // (desktop-channels-workspace.tsx L1941) → 整个 subtree 退出可聚焦序"。
      // 此时 prev 还指向 A 的 share 按钮（DOM 在但 inert 内），.focus() no-op，
      // activeElement 落 body，键盘用户失去 a11y 上下文。
      // 修法：cleanup 走 inert ancestor 检测，命中时 fall back 到当前 active
      // slide 的同款 share 按钮（DOM 顺序的第 [2] 个 [aria-haspopup="dialog"]
      // 按钮 — [0]=avatar, [1]=chat, [2]=share，模板对齐 drawer R2 用 [1] /
      // author R3 用 [0]）。命中失败兜回原行为（让浏览器自然落到 body）。
      let cursor: HTMLElement | null = prev;
      let prevIsInert = false;
      while (cursor) {
        if (cursor.hasAttribute("inert")) {
          prevIsInert = true;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (prevIsInert) {
        const activeSlide = document.querySelector<HTMLElement>(
          '[data-post-id]:not([inert])',
        );
        const dialogTriggers = activeSlide?.querySelectorAll<HTMLElement>(
          'button[aria-haspopup="dialog"]',
        );
        const newShareTrigger = dialogTriggers?.[2] ?? null;
        if (newShareTrigger) {
          window.requestAnimationFrame(() =>
            newShareTrigger.focus({ preventScroll: true }),
          );
        }
        return;
      }
      window.requestAnimationFrame(() =>
        prev.focus({ preventScroll: true }),
      );
    };
  }, [open]);
  // Tab cycling trap：监听 keydown，截断 Tab 在 dialog 外 / 边界处的跨界，
  // 强制循环到首尾。不依赖第三方 focus-trap 库，本组件自己挡。
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      // 焦点已经飘出 dialog（用户点了 backdrop button 或之前在外面）→
      // Tab 一次拉回 dialog 内首元素；Shift+Tab 拉到末元素。
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      // 在 dialog 内部，处理首尾循环。
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // 走查 2026-05-17 新会话 R4：Android 硬件 Back 键 — picker 打开时按 Back
  // 应该收 picker 而不是退掉整个视频号页。和 wechat-comment-bar /
  // share-card-modal / mobile-channels-comments-sheet 同款拦截：preventDefault
  // + 返回 true 消费按键。
  // R9 同款：onClose inline arrow，父 re-render 频繁触发 cleanup + reset
  // Android back interceptor。register/unregister 本身廉价但每秒多次没意义。
  useEffect(() => {
    if (!open) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
  }, [open]);

  // 锁背景滚动：picker 弹出时如果不锁，移动端两指滚 / 桌面滚轮会把底下的
  // 视频号 home 也滚走，picker 自身却 fixed 不动，看着像两层在打架。
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const friendList: FriendListItem[] = useMemo(() => {
    const rows = friendsQuery.data ?? [];
    return [...rows]
      // 「我自己」是用户的代理角色，转发视频号到「与自己的私聊」语义上没意义，
      // 而且会污染该 conversation。按 SELF_CHARACTER_ID 过掉。
      .filter((row) => row.character.id !== SELF_CHARACTER_ID)
      .sort((a, b) => {
        const aAt = a.friendship.lastInteractedAt ?? a.friendship.createdAt;
        const bAt = b.friendship.lastInteractedAt ?? b.friendship.createdAt;
        return new Date(bAt).getTime() - new Date(aAt).getTime();
      });
  }, [friendsQuery.data]);

  async function handlePick(target: FriendListItem) {
    // R5 sync ref 锁同帧双击 — 必须在 setErrorMessage 之前 early return，
    // 避免把已经在 fly 的 forward 的错误状态意外清掉。
    if (pickSubmittingRef.current) return;
    pickSubmittingRef.current = true;
    setErrorMessage(null);
    // 走查 R3（本轮）：抓住开始 forward 这一刻的 postId，await 期间用户可能
    // 关 picker / 重开为其他 post（latestPostIdRef 反映 props 实时值）。
    const initialPostId = postId;
    // 走查 2026-05-18 新一轮 R2：同步抓 baseUrl —— mutation 完成时把它传给
    // channels-page 的 onForwarded/onForwardFailed，让 page 端按"这次 forward
    // 是给哪个账户做的"决定要不要冒 toast。否则慢网（公网隧道 200-500ms RTT）
    // 下用户切账户后 B 视图会冒出"已转发给 X"/"转发给 X 失败"——B 用户莫名
    // 其妙以为自己做了什么。forwardMutation 没有 onMutate context 链可用（picker
    // 用的是 mutateAsync 不依赖 context），直接在 handlePick 闭包里抓。
    const initialBaseUrl = baseUrl;
    try {
      await forwardMutation.mutateAsync({
        targetCharacterId: target.character.id,
      });
      onForwarded?.(
        {
          characterId: target.character.id,
          name: target.character.name,
        },
        { mutationBaseUrl: initialBaseUrl },
      );
      // 只在 picker 仍然停在同一条 post 时主动关闭——用户已经切换到别的 post
      // 时 onClose 等于强关人家刚开的新 picker。
      if (latestPostIdRef.current === initialPostId) {
        onClose();
      }
    } catch (error) {
      const code =
        (error as { code?: string; message?: string })?.code ??
        (error as { message?: string })?.message ??
        "";
      let translatedMessage: string;
      if (code === "FEED_FORWARD_MEDIA_BROKEN") {
        translatedMessage = t(msg`这条视频号还没有可播放的视频/音频，无法转发。`);
      } else if (code === "FEED_FORWARD_NOT_CHANNELS") {
        translatedMessage = t(msg`只支持转发视频号帖子。`);
      } else if (code === "FEED_POST_NOT_PUBLISHED") {
        translatedMessage = t(msg`帖子尚未发布，稍后再试。`);
      } else if (code === "FEED_POST_NOT_FOUND") {
        // 走查 2026-05-17 R1：home 拉到本地后，server 端这条 post 被
        // not-interested / 删除 / cleanupBrokenChannelPosts 隐藏，用户再点
        // 转发就是 404。原来吃到通用 "转发失败，请稍后重试"——用户重试只会
        // 一直 404，体感「我按一万次都失败」。明确告知"已经不在了"，并促
        // 使用户关闭面板。
        translatedMessage = t(msg`这条视频号已经不在了。`);
      } else if (code === "FEED_FORWARD_TARGET_REQUIRED") {
        // 走查 2026-05-17 R1：用户挑了好友后，被挑那位 character 已被删除 /
        // hidden（getFriends 缓存 + 真实 character 表不同步的边界，30s
        // staleTime 内可见）→ 404 FEED_FORWARD_TARGET_REQUIRED。让用户知
        // 道是"挑的好友"出问题、换一个就行，不是后端集体挂了。
        translatedMessage = t(msg`这位好友已不在通讯录，请换一位再试。`);
        // 走查 2026-05-18 R4：原来只显示错误条但没刷新好友列表——cached
        // friends 仍含已删除的那位，用户「换一位」时挑到旁边的好友也可能
        // 是同批失效的（典型场景：character 大批量被删 / 切账号边界）。
        // 触发 refetch 把陈旧 cache 清掉，让列表反映 server 真值。
        void friendsQuery.refetch();
      } else {
        translatedMessage = t(msg`转发失败，请稍后重试。`);
      }
      setErrorMessage(translatedMessage);
      // 走查 R9：picker 可能已经被用户手动关了（onClose 不挡 mutation pending），
      // 这种情况下 errorMessage 不会被渲染。让 channels-page 兜底 page 级 notice。
      // mutationBaseUrl 带回去，让 channels-page 做 mid-flight 切账户 guard。
      onForwardFailed?.({
        targetCharacterId: target.character.id,
        targetName: target.character.name,
        message: translatedMessage,
        mutationBaseUrl: initialBaseUrl,
      });
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-[rgba(17,24,39,0.42)] backdrop-blur-[3px] sm:items-center">
      {/* 走查 2026-05-19 第八轮 R5：和姊妹 R101/R102 group-member-picker /
          R103 group-member-browser / R104 feature-unavailable / R107-R113 同
          款 — backdrop <button> (absolute inset-0) 视觉不可见、纯 mouse"点击
          背景关闭"affordance，但 DOM 顺序排在 dialog 子树第一位 + 没有
          tabIndex={-1}。用户在视频号 slide 点 "转发" 打开 picker 后，第一次
          Tab 焦点不是落到 dialog 内的「取消」/好友列表，而是先到这张不可见
          backdrop —— 内部 useEffect rAF 已经把焦点初始 .focus() 到「取消」按
          钮上，但任何后续 Tab cycle 会被 backdrop 抢一次 stop，键盘用户体感
          "我刚才 Tab 到哪里去了"。Esc 路径已挂；mouse click 路径也保留（点
          backdrop 关 picker）。tabIndex={-1} 让 backdrop 退出 sequential 序，
          但仍可点击 — focus trap 看到 backdrop 不在 dialog 内时仍能把焦点拉回
          dialog 首元素，本修复让 Tab 链路本身就不再触碰 backdrop。 */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={t(msg`关闭转发面板`)}
        onClick={onClose}
        className="absolute inset-0"
      />

      {/*
        走查 2026-05-18 R1：role/aria-modal 缺失——picker 视觉上是 modal，但
        没有 dialog 语义，VoiceOver / TalkBack 焦点能漏到底层的 ChannelsPage
        卡片 / action rail。aria-labelledby 指向"转发到聊天"标题。
      */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        // 走查 2026-05-19 第十五轮 R14：原 aria-labelledby 只指 "转发到聊天" 通
        // 用标题。SR 用户打开 picker 时只听到 "转发到聊天 dialog modal"，没
        // 包含 postExcerpt — 被转发内容的预览（"{authorName}：{title}"）作为
        // dialog accessible name 的一部分应该一起念出，让 SR 用户立刻知道是给
        // 哪条 post 选转发目标。同 desktop ChannelCommentsDrawer R12 / Channel
        // AuthorOverlay R13 的 IDREFS 模板对齐。
        // postExcerpt 在 caller 没传时不渲染 (line 415-420 ternary)，aria-
        // labelledby 引用不存在的 id 按 ARIA spec 自动 fallback 到只读 title
        // —— 行为正确。
        aria-labelledby="channels-forward-picker-title channels-forward-picker-excerpt"
        // tabIndex=-1 让 dialog 自身可程序聚焦但不在 sequential tab 序列里 ——
        // 焦点 trap 兜底用：无 focusable child（极端 loading 态）时也能把焦点
        // 拉进来不漏。
        tabIndex={-1}
        className="relative max-h-[80vh] w-full max-w-[420px] overflow-hidden rounded-t-[20px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-overlay)] sm:rounded-[20px]"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <div>
            <div id="channels-forward-picker-title" className="text-[16px] font-medium text-[color:var(--text-primary)]">
              {t(msg`转发到聊天`)}
            </div>
            {postExcerpt ? (
              <div
                id="channels-forward-picker-excerpt"
                className="mt-1 line-clamp-1 text-[12px] text-[color:var(--text-muted)]"
              >
                {postExcerpt}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="rounded-full text-[color:var(--text-muted)]"
          >
            {t(msg`取消`)}
          </Button>
        </div>

        {errorMessage ? (
          // 走查 2026-05-18 新会话 R10：原 errorMessage 银行裸 <div>，转发失败
          // （FEED_FORWARD_MEDIA_BROKEN / FEED_FORWARD_TARGET_REQUIRED /
          // FEED_POST_NOT_FOUND / 通用兜底）冒红条时 SR 用户没反馈。挂 role=
          // "alert"（aria-live=assertive）立即播报 — 失败信息比好友选择优先级
          // 高，必须打断当前播报告知用户。
          <div
            role="alert"
            className="mx-5 mb-2 rounded-[12px] border border-[color:var(--border-danger,#FCA5A5)] bg-[color:var(--surface-danger,#FEF2F2)] px-3 py-2 text-[12px] text-[color:var(--text-danger,#B91C1C)]"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="max-h-[60vh] overflow-y-auto px-2 pb-4">
          {friendsQuery.isLoading ? (
            // 走查 2026-05-18 第二轮 R6：picker 内"正在加载好友列表…" loading
            // 是裸 <div>，没 role/aria-live。SR 用户打开转发面板进入 dialog 后
            // 只听到顶部 "转发到聊天" 标题 + "取消" 按钮，list 区一片寂静（视
            // 觉上是文字，SR 不主动播报后续 mount 的内容）。loading 持续 100-
            // 500ms 公网隧道，盲用用户体感"面板里什么都没有，是不是坏了"。
            // 同 R5 LoadingBlock 修法：挂 role="status" 让 SR 进 dialog 时听到
            // "正在加载好友列表"。
            <div
              role="status"
              className="py-10 text-center text-[13px] text-[color:var(--text-muted)]"
            >
              {t(msg`正在加载好友列表…`)}
            </div>
          ) : friendsQuery.isError ? (
            // 走查 2026-05-17 R2：原来只显示一行错误文案、没有重试按钮。
            // staleTime 30s 内即使关 picker 再开同一条 post 的分享，friendsQuery
            // 不会自动重拉——用户得退回 channels home、等 30s 再点 share 才能
            // 再试。加一个内联重试按钮直接 refetch，落地体感跟其它读失败状态
            // 卡（视频号 home/作者主页）保持一致。
            //
            // 走查第二轮 R6：同 R10 errorMessage 同款 —— 这条 friendsQuery 错
            // 误也是裸 <div>，SR 用户在 picker 内点开就听到 "好友列表暂时拉不
            // 下来" 这条错。挂 role="alert" 立即播报。
            <div
              role="alert"
              className="py-10 text-center text-[13px] text-[color:var(--text-muted)]"
            >
              <div>{t(msg`好友列表暂时拉不下来，请稍后重试。`)}</div>
              <button
                type="button"
                onClick={() => {
                  void friendsQuery.refetch();
                }}
                disabled={friendsQuery.isFetching}
                className="mt-3 inline-flex items-center rounded-full border border-[color:var(--border-faint)] bg-white px-3.5 py-1 text-[12px] font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-subtle,#F4F4F5)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {friendsQuery.isFetching
                  ? t(msg`重试中...`)
                  : t(msg`重试加载`)}
              </button>
            </div>
          ) : friendList.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[color:var(--text-muted)]">
              {t(msg`还没有可转发的好友。`)}
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--border-faint)]">
              {friendList.map((friend) => {
                const character = friend.character;
                const isBusy = forwardMutation.isPending;
                return (
                  <li key={character.id}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        void handlePick(friend);
                      }}
                      className="flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition hover:bg-[color:var(--surface-subtle,#F4F4F5)] disabled:opacity-60"
                    >
                      <AvatarChip
                        name={character.name}
                        src={character.avatar ?? undefined}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                          {character.name}
                        </div>
                        <div className="truncate text-[12px] text-[color:var(--text-muted)]">
                          {character.relationship ?? ""}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
