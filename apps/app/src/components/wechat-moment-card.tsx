import {
  forwardRef,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
  synthesizeMomentNarration,
} from "@yinjie/contracts";
import { translateRuntimeMessage, useAppLocale } from "@yinjie/i18n";
import { Heart, MapPin, Volume2 } from "lucide-react";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { MomentMediaGallery } from "./moment-media-gallery";
import { stripToolCallSyntax } from "../features/moments/moment-content";
import { describeRequestError } from "../lib/request-error";

const t = translateRuntimeMessage;

type WeChatMomentCardProps = {
  moment: Moment;
  ownerId: string | null;
  liked: boolean;
  /** Hides the avatar+nickname header (used inside friend's own moments page). */
  hideAuthor?: boolean;
  /** Skip outer padding (px-4 pb-3.5 pt-3.5) — useful when wrapped in a row layout. */
  flush?: boolean;
  /** Highlight the card briefly after a like/comment to scroll-to-target use. */
  cardId?: string;
  /** When the user taps the ⋯ button. Parent should open the action bubble. */
  onOpenActionMenu: (anchorRect: DOMRect) => void;
  /** When the user taps the avatar/nickname. */
  onAuthorTap?: () => void;
  /** Double-tap anywhere on the card text/media area. Triggers like. */
  onDoubleTapLike?: () => void;
  /** When the user taps a comment row, start a reply targeting that comment. */
  onCommentTap?: (comment: MomentComment) => void;
  /** When the user taps a like row name (eg. to view profile). */
  onLikeAuthorTap?: (like: MomentLike) => void;
  /**
   * Tapping the inline 「删除」 link shown next to the timestamp on owner posts.
   * If omitted, the delete affordance is hidden entirely.
   */
  onDelete?: () => void;
  /** Optional override for API base URL — passed to synthesizeMomentNarration. */
  apiBaseUrl?: string;
  /**
   * 走查 R3：分享卡导出场景下不要渲染「朗读」按钮——点了会触发 TTS 请求 +
   * audio 控件渲到卡片底部，截图会把控件一起带进去。和 ⋯ / 删除 按钮在
   * MomentShareCardModal 隐藏的处理对齐。
   */
  hideListenButton?: boolean;
};

const WECHAT_LINK_COLOR = "#576B95";
const WECHAT_TIMESTAMP_COLOR = "#9A9A9A";
const WECHAT_TEXT_COLOR = "#1A1A1A";

// memo + 自定义 comparator：朋友圈列表里 like / comment optimistic update 时
// setQueryData 用 data.map(m => m.id===target ? new : m) 保留其他 moment 对象
// 引用不变 — 包 memo 后 sibling card 跳过重渲染。
//
// 现实情况：caller (moments-page.tsx 等 7 处) 的 onAuthorTap / onOpenActionMenu
// 等 handler 都是 inline 箭头函数 (() => onLikeMoment(moment.id))，每次 parent
// render 都新引用。默认 shallow memo 看到 handler 引用变 → 重新渲染，等于没包。
// 这里改用 custom comparator 只比较"数据属性"，handler 引用变化不触发 re-render。
// 副作用：handler 内的闭包引用旧 parent 状态——但所有 handler 都是 fire-and-forget
// (调 mutation.mutate 等)，闭包的 stale 不会引发实际 bug（mutation 自身是稳定
// 引用，moment.id 通过 props 重新读到最新值）。
function arePropsEqual(
  prev: Readonly<WeChatMomentCardProps>,
  next: Readonly<WeChatMomentCardProps>,
) {
  return (
    prev.moment === next.moment &&
    prev.liked === next.liked &&
    prev.ownerId === next.ownerId &&
    prev.cardId === next.cardId &&
    prev.hideAuthor === next.hideAuthor &&
    prev.flush === next.flush &&
    prev.apiBaseUrl === next.apiBaseUrl &&
    prev.hideListenButton === next.hideListenButton &&
    // handler 「是否存在」也得比较 — 比如 onDelete 在非 owner moment 上是 undefined
    // 有/无的切换会改变 UI（删除链接显隐），不能忽略
    Boolean(prev.onDelete) === Boolean(next.onDelete) &&
    Boolean(prev.onAuthorTap) === Boolean(next.onAuthorTap) &&
    Boolean(prev.onDoubleTapLike) === Boolean(next.onDoubleTapLike) &&
    Boolean(prev.onCommentTap) === Boolean(next.onCommentTap) &&
    Boolean(prev.onLikeAuthorTap) === Boolean(next.onLikeAuthorTap)
  );
}

export const WeChatMomentCard = memo(forwardRef<HTMLElement, WeChatMomentCardProps>(
  function WeChatMomentCard(
    {
      moment,
      ownerId,
      liked,
      hideAuthor = false,
      flush = false,
      cardId,
      onOpenActionMenu,
      onAuthorTap,
      onDoubleTapLike,
      onCommentTap,
      onLikeAuthorTap,
      onDelete,
      apiBaseUrl,
      hideListenButton = false,
    },
    ref,
  ) {
    // 走查新一轮 R1（i18n）：memo 包裹下 React 不会因父组件 re-render 让子重渲；
    // 又因为 t = translateRuntimeMessage 是模块级静态绑定（不是 hook），locale
    // 切换时本卡片完全感知不到，导致 formatWeChatTimestamp 输出的「刚刚 / X 分钟前
    // / 昨天 / X 天前 / 月份名」+ 删除/朗读/更多操作 等按钮文案 + 评论行「回复」
    // 全部锁死在首次渲染那一刻的语言版本。订阅 useAppLocale (内部 useContext)
    // 后 React 即使在 memo 下也会因 context 变化让本组件 re-render — 静态 t 在
    // 再次调用时读当前 locale，文案立即跟上。和 MomentMediaGallery 同模板。
    useAppLocale();
    // 听贴文（MiniMax TTS HD）：本地 audio element + 状态机；缓存命中即刻播。
    const [narrationLoading, setNarrationLoading] = useState(false);
    const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
    const [narrationError, setNarrationError] = useState<string | null>(null);
    const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
    // 走查本轮 R1：同帧双击守卫——之前 handleListenTap 只看 React state
    // `narrationLoading`，但 setNarrationLoading(true) 要等下一次 commit；同帧
    // 第二次 click 闭包读到的还是旧 false，会走到 setNarrationLoading(true) +
    // synthesizeMomentNarration 第二次。结果：同一条 moment 同时发出 2 个 TTS
    // 合成请求，MiniMax 配额白白扣两次（每条 ~450/5h 免费额度），race 中后
    // resolve 的 setNarrationUrl 把先 resolve 的 audio URL 盖掉。和 like /
    // comment / delete 同款同帧双击同步锁，ref 同步赋值跳过 React commit 时机
    // 风险。同时把已有缓存音频的 toggle 路径也守起来——慢点击在 audio.play()
    // 与 .pause() 间反复触发不算 bug 但加锁可避免 audio 状态机抖动。
    const narrationInflightRef = useRef(false);
    const hasNarratableText = (moment.text?.trim().length ?? 0) > 0;
    // 走查移动端朋友圈/最新一轮 R1：apiBaseUrl 切换（账户切换）时，narrationUrl
    // 是上一个账户的 audio URL（path 里带 account-scoped token），直接挂到 audio
    // src 会 401 / CORS / token expired。narrationError 也是旧账户的错误文案，
    // 用户切到 B 看到 A 当时的"朗读生成失败"红条非常误导。和 moments-page
    // mutationGuardRef 同思路：账户身份变化时清掉与旧账户绑定的派生状态。同时
    // 把可能还在播的 audio 显式 pause —— 不然切到 B 还能听到 A 的语音。
    useEffect(() => {
      const audio = narrationAudioRef.current;
      if (audio) {
        audio.pause();
        // 走查新一轮 R2 (perf/mem)：之前只 pause，依赖 setNarrationUrl(null)
        // 触发的 React 条件 unmount 让浏览器自然 GC decoded buffer——WKWebView
        // (iOS / 内嵌 webview) GC 时机不可预测，单次切账户后 cached PCM/decoded
        // 帧 ~100-500KB 会一直挂到下次主线程长任务才释放。频繁切账户 / dev hot
        // reload 时多卡片累积 → 几 MB-几十 MB 常驻。和 readVideoMetadata cleanup
        // (moment-compose-media.ts 681-682) / MomentVideoViewerOverlay R1
        // (moment-media-gallery.tsx 691-695) 同款 fix：显式 removeAttribute(src)
        // + load() 把 <audio> 切回 empty media，立刻释放 demux/decode 缓冲。
        // 必须在 setNarrationUrl(null) 之前做——React unmount 后 ref 被清成 null
        // 就拿不到了；同帧 pause + clear + load 三步一气呵成最稳。
        audio.removeAttribute("src");
        audio.load();
      }
      setNarrationUrl(null);
      setNarrationError(null);
      // narrationLoading 也清——in-flight TTS 请求是旧 apiBaseUrl 发出的，
      // 切账户后即便 resolve 也会被同卡片 conditional render（卡片大概率随
      // 列表 unmount）吞掉；但留着 true 会让按钮在新账户里一直 disabled，
      // 极端情况（同 moment.id 跨账户存在 / dev hot reload）下用户无法重试。
      setNarrationLoading(false);
      // 走查本轮 R1：narrationInflightRef 同步守卫也得清——旧账户的 fetch 还在
      // 路上，finally 会把它清掉，但中间窗口里用户在新账户同一张卡上点朗读会
      // 被 ref guard 早返"假死"。和 narrationLoading 一起在切账户瞬间释放。
      narrationInflightRef.current = false;
    }, [apiBaseUrl]);
    // 走查 R3：mid-flight 切账户 race —— 用户在 A 账户点「朗读」、TTS 还在合成
    // 时切到 B，apiBaseUrl effect 同步把 narrationUrl 清成 null；但 await 在路上
    // 的 synthesizeMomentNarration 拿着 A 的 token 回来，resolve 后 setNarrationUrl
    // 把 A 的 audio URL 写到 B 视图上 → 用户在 B 上看到一个挂载好的 <audio>，
    // 点 play 拿 401。卡片一般会随账户切换 unmount，但同 moment.id 跨账户存在
    // 时不会。和 moments-page likeMutation 的 mutationBaseUrlRef 同模板：fetch
    // 触发时刻钉 ref，resolve 时比对，不匹配静默吞错。
    const narrationRequestBaseUrlRef = useRef(apiBaseUrl);
    useEffect(() => {
      narrationRequestBaseUrlRef.current = apiBaseUrl;
    }, [apiBaseUrl]);
    // unmount cleanup：浏览器把 <audio> 从 DOM 移除后 Chromium / iOS Safari 仍可能
    // 让音轨在后台继续播 + 把整段 decoded buffer 挂到 GC 才释放（实测一段 60s
    // TTS 音频 ≈300KB decoded + audio context 锁住 10MB 上下文）。和 moment-media-
    // gallery viewer R1 同款修法（line 691-695）：pause + removeAttribute("src") +
    // load() 把 <audio> 切回空 media，立刻断音轨 + 释放 buffer。
    useEffect(() => {
      return () => {
        const audio = narrationAudioRef.current;
        if (!audio) return;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      };
    }, []);
    const handleListenTap = async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      // 同帧双击守卫——见 narrationInflightRef 注释。React state narrationLoading
      // 单独不够：它要下一次 commit 后才翻 true，同帧第二次 click 仍读 false。
      if (narrationInflightRef.current) return;
      if (narrationLoading) return;
      // 第二次点：已加载 → toggle 播放/暂停
      const existing = narrationAudioRef.current;
      if (narrationUrl && existing) {
        if (existing.paused) {
          // 走查 R4：play() 返回 promise，iOS / autoplay policy 受限时会 reject
          // —— 之前裸 `void existing.play()` 让拒绝走 unhandled rejection，dev
          // 控制台一条 warning，生产 Sentry 也会上报。和 line 216 的 catch 同模板。
          existing.play().catch(() => {
            // 静默；native controls 仍可见，用户可以从那里再点 play。
          });
        } else {
          existing.pause();
        }
        return;
      }
      narrationInflightRef.current = true;
      setNarrationLoading(true);
      setNarrationError(null);
      // 走查 R3：钉住请求时刻的 apiBaseUrl，resolve / reject / settle 之前先比对
      // narrationRequestBaseUrlRef.current。mid-flight 切账户后这次合成属于旧
      // 账户，结果写到新账户视图既是错误数据（audio URL 带旧 token）也会和
      // apiBaseUrl 重置 effect 抢着翻 narrationLoading。
      const requestedBaseUrl = apiBaseUrl;
      try {
        const result = await synthesizeMomentNarration(moment.id, apiBaseUrl);
        if (narrationRequestBaseUrlRef.current !== requestedBaseUrl) return;
        setNarrationUrl(result.audioUrl);
      } catch (err) {
        if (narrationRequestBaseUrlRef.current !== requestedBaseUrl) return;
        // 走查 R2：原版直接 err.message 把 server legacyMessage 透给 UI——
        // 朋友圈不存在 / 文本为空 / TTS 配额耗尽等 AppError 的 legacyMessage
        // 全是中文，非 zh-CN locale 用户拿到的就是裸中文。和 moments-page
        // resolveMomentsErrorMessage 同模板：走 describeRequestError 命中
        // i18n 字典 + cloud-auth / 网络错 / fallback 三段兜底。
        setNarrationError(
          describeRequestError(err, t(msg`朗读生成失败`)),
        );
      } finally {
        narrationInflightRef.current = false;
        if (narrationRequestBaseUrlRef.current === requestedBaseUrl) {
          setNarrationLoading(false);
        }
      }
    };
    useEffect(() => {
      if (!narrationUrl) return;
      const audio = narrationAudioRef.current;
      if (!audio) return;
      void audio.play().catch(() => {
        // 移动端 first-tap autoplay 偶尔 reject；保留 audio 控件让用户再点一次。
      });
    }, [narrationUrl]);
    // 走查移动端朋友圈/最新一轮 R1：列表里 N 张卡片每张都有自己的 <audio>，
    // 用户在多条朋友圈上都点过「朗读」后任意一条点 play（通过 audio 自带 controls
    // 或通过「朗读」按钮 toggle），其它已加载的 <audio> 不会自动 pause —— 同时
    // 多路语音叠在一起，体感「为什么我开始听第二条还能听到第一条」。用 window
    // 自定义事件做协调：本卡片 audio 触发 play 时全局广播，所有其它在听的卡片
    // 监听到非自己来源就把自己 pause；不引入 zustand / context，纯 DOM 事件。
    // 仅在 narrationUrl 真实存在（即 audio 节点 mount 时）挂监听，没合成过的卡
    // 片不参与协调。和 share-card-modal 内 canInteract=false 的 wechat-moment-card
    // 也兼容——它不会主动点 play，监听器不挂；即使被全局广播触发 pause 也无副作用。
    useEffect(() => {
      if (!narrationUrl) return;
      const audio = narrationAudioRef.current;
      if (!audio) return;
      const NARRATION_PLAY_EVENT = "yj-moment-narration-play";
      const handlePlay = () => {
        window.dispatchEvent(
          new CustomEvent(NARRATION_PLAY_EVENT, { detail: audio }),
        );
      };
      const handleExternalPlay = (event: Event) => {
        if ((event as CustomEvent).detail !== audio) {
          audio.pause();
        }
      };
      audio.addEventListener("play", handlePlay);
      window.addEventListener(NARRATION_PLAY_EVENT, handleExternalPlay);
      return () => {
        audio.removeEventListener("play", handlePlay);
        window.removeEventListener(NARRATION_PLAY_EVENT, handleExternalPlay);
      };
    }, [narrationUrl]);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const lastTapRef = useRef<number>(0);
    // 走查 R6：用计数器代替 boolean，每次双击 +1 — 这样：
    //   1) useEffect dep 真的变了，重置 700ms 定时器（之前 setFloatingHeart(true)
    //      在 floatingHeart 已经是 true 时是 no-op，原定时器照着第一次双击的时间
    //      点走完，第二次双击的心跑了不到 700ms 就消失，体感"被吃掉"）；
    //   2) 渲染时把计数器透到 <FloatingHeart key=> ——key 一变 React 卸载老节点
    //      重挂，CSS keyframe animation 才真的能从头放一次（同 DOM 节点上同一
    //      个 animation 名字不会自动重启）。
    const [floatingHeartTick, setFloatingHeartTick] = useState(0);

    useEffect(() => {
      if (!floatingHeartTick) return;
      const timer = window.setTimeout(() => setFloatingHeartTick(0), 700);
      return () => window.clearTimeout(timer);
    }, [floatingHeartTick]);

    const handleAreaPointerDown = (event: PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      // Skip when tapping interactive children (buttons / links / textarea)
      if (target.closest("button,a,input,textarea,[data-no-doubletap]")) {
        return;
      }

      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        if (onDoubleTapLike && moment.canInteract) {
          // Instagram-style「双击点赞」语义：只加赞不取消。之前 onDoubleTapLike
          // 直接走 toggleMomentLike（toggle 语义），用户在自己已经点过赞的帖子
          // 上随手双击想看一下心跳动画 → 静默把赞取消了，列表里 likes 行少了
          // 自己的名字，体感是"我啥都没做它怎么就把我赞没了"。已经点过的就只
          // 放一下浮心反馈，不再 toggle；要取消用户得走 ⋯ 菜单的「取消」入口。
          if (!liked) {
            onDoubleTapLike();
          }
          setFloatingHeartTick((tick) => tick + 1);
        }
        return;
      }
      lastTapRef.current = now;
    };

    const openMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect =
        moreButtonRef.current?.getBoundingClientRect() ??
        event.currentTarget.getBoundingClientRect();
      onOpenActionMenu(rect);
    };

    // 走查本轮 R2 (perf)：moment.text 仅在用户/角色编辑过 moment 才会变，
    // 但 like 路径（optimistic toggle）走 `{...moment, likes, likeCount}`
    // 同样换 moment 引用 → arePropsEqual 失配 → 卡片重渲。stripToolCallSyntax
    // 跑一遍多 regex 拆解；text 没变就不必再 strip。和 visibleComments
    // useMemo 同款优化。
    const displayText = useMemo(
      () => stripToolCallSyntax(moment.text),
      [moment.text],
    );
    const hasText = Boolean(displayText);
    const hasMedia = moment.media.length > 0;
    // 走查移动端朋友圈/新一轮 R1：之前 hasLikes 看 moment.likes.length，但 render
    // 时又把 authorName 为空的 liker 过滤掉。极端场景（数据脏 / 角色被删 / 跨账户
    // cache 残留只剩 likeCount 没 author 名字）下 likes.length>0 但 filter 后 0 个
    // → 仍渲染整块 footer：灰底+Heart icon+空白行，用户看着像"有人赞了但名字
    // 没出来"的 UI 坏点。先过滤再判定 hasLikes。memo 锁住"likes 引用没变就不
    // 重 filter"，optimistic comment 路径 spread moment 时 likes 引用不变 → 命中。
    const visibleLikes = useMemo(
      () =>
        moment.likes.filter((like) => (like.authorName ?? "").trim() !== ""),
      [moment.likes],
    );
    const hasLikes = visibleLikes.length > 0;
    // 一遍过预计算每条评论的 cleanText + 同时建 authorId 反查表。之前 filter
    // 阶段（line 154）跑一次 stripToolCallSyntax，render map 里（line 347）又
    // 跑一次同样的 regex，50 条评论 ＝ 100 次正则；而且 commentAuthorById 还要
    // 再循环一次 moment.comments。合三为一：
    //   - visibleComments：保留 cleanText 非空的（filter 掉 [TOOL_CALL] / CoT
    //     prose 残骸，否则 footer 会渲染空灰块）
    //   - cleanTextById：渲染时直接读已算好的 cleanText
    //   - commentAuthorById：reply-to 名字查表（O(1) 替代 O(N) find）
    //
    // 走查本轮 R2 (perf)：用 useMemo + [moment.comments] 把整套预计算锁住——
    // 用户点 like 时 use-optimistic-like 走 `{...moment, likes, likeCount}`，
    // moment 引用换了但 moment.comments 数组引用没变（spread 浅拷贝保留原引用）。
    // 之前每次 like 都重跑一遍 N 条评论的 stripToolCallSyntax + Map 建立，对
    // 评论密集的爆款帖（50+ 评论）每次 like 都付一次正则烧 CPU。memo 后仅在
    // 评论真变（新加/删除）时才重算。
    const { cleanTextById, commentAuthorById, visibleComments } = useMemo(() => {
      const cleanTextById = new Map<string, string>();
      const commentAuthorById = new Map<string, string>();
      const visibleComments: typeof moment.comments = [];
      for (const c of moment.comments) {
        commentAuthorById.set(c.id, c.authorName);
        const cleanText = stripToolCallSyntax(c.text);
        if (cleanText.trim().length === 0) continue;
        cleanTextById.set(c.id, cleanText);
        visibleComments.push(c);
      }
      return { cleanTextById, commentAuthorById, visibleComments };
    }, [moment.comments]);
    const hasComments = visibleComments.length > 0;
    const showFooterBlock = hasLikes || hasComments;

    return (
      <article
        id={cardId}
        ref={ref}
        // scroll-mt 给 hash 跳转用：moments-page useEffect 里走的是
        // scrollIntoView({block:"start"})，但移动端顶上有 sticky TabPageTopBar
        // (~56px)，对齐到 y=0 会把作者头连同前半段正文藏到顶栏底下。给文章
        // 加 scroll-margin-top 让浏览器在 scrollIntoView 时把这点高度还回来。
        className={cn(
          "flex w-full items-start gap-2.5 scroll-mt-[72px]",
          flush ? "" : "px-4 pb-3.5 pt-3.5",
        )}
      >
        {!hideAuthor ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAuthorTap?.();
            }}
            aria-label={moment.authorName}
            className="shrink-0 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
          >
            <AvatarChip
              name={moment.authorName}
              src={moment.authorAvatar}
              size="wechat"
            />
          </button>
        ) : null}

        <div
          className="relative min-w-0 flex-1"
          onPointerDown={handleAreaPointerDown}
        >
          {!hideAuthor ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAuthorTap?.();
              }}
              className="block max-w-full truncate text-left text-[length:var(--text-base)] font-medium leading-[20px]"
              style={{ color: WECHAT_LINK_COLOR }}
            >
              {moment.authorName}
            </button>
          ) : null}

          {hasText ? (
            <div
              className={cn(
                "whitespace-pre-wrap break-words text-[length:var(--text-title)] leading-[24px]",
                hideAuthor ? "" : "mt-1.5",
              )}
              style={{ color: WECHAT_TEXT_COLOR }}
            >
              {displayText}
            </div>
          ) : null}

          {hasMedia ? (
            <div
              className={cn(
                hasText ? "mt-2" : hideAuthor ? "" : "mt-1.5",
              )}
            >
              <MomentMediaGallery
                contentType={moment.contentType}
                media={moment.media}
                variant="mobile"
                stopPropagation
              />
            </div>
          ) : null}

          {moment.location ? (
            <div
              className="mt-2 inline-flex max-w-full items-center gap-0.5 truncate text-[length:var(--text-caption)]"
              style={{ color: WECHAT_LINK_COLOR }}
            >
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{moment.location}</span>
            </div>
          ) : null}

          <div
            className="mt-2 flex items-center justify-between gap-2 text-[length:var(--text-caption)]"
            style={{ color: WECHAT_TIMESTAMP_COLOR }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate">
                {formatWeChatTimestamp(moment.postedAt)}
              </span>
              {onDelete &&
              moment.authorType === "user" &&
              moment.authorId === ownerId ? (
                <>
                  <span style={{ color: WECHAT_TIMESTAMP_COLOR }}>·</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete();
                    }}
                    className="active:opacity-60"
                    style={{ color: WECHAT_LINK_COLOR }}
                    data-no-doubletap
                  >
                    {t(msg`删除`)}
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              {hasNarratableText && !hideListenButton ? (
                <button
                  type="button"
                  onClick={handleListenTap}
                  aria-label={t(msg`朗读这条朋友圈`)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] bg-[color:var(--surface-secondary)] text-[color:var(--text-secondary)] active:bg-[color:var(--surface-soft)] disabled:opacity-50"
                  data-no-doubletap
                  disabled={narrationLoading}
                  title={
                    narrationError
                      ? narrationError
                      : narrationLoading
                        ? t(msg`正在合成…`)
                        : t(msg`朗读这条朋友圈`)
                  }
                >
                  <Volume2 size={13} aria-hidden="true" />
                </button>
              ) : null}
              {moment.canInteract ? (
                <button
                  ref={moreButtonRef}
                  type="button"
                  onClick={openMoreMenu}
                  aria-label={t(msg`更多操作`)}
                  className="inline-flex h-6 w-7 items-center justify-center rounded-[3px] bg-[color:var(--surface-secondary)] text-[color:var(--text-secondary)] active:bg-[color:var(--surface-soft)]"
                  data-no-doubletap
                  // 走查移动端朋友圈/Round 3 R1：让 WeChatActionBubble 的 pointerdown
                  // capture handler 把这颗按钮排除掉，二次点 ⋯ 才能关菜单（否则
                  // pointerdown 关、click 又开，net effect 关不掉）。和 wechat-action-
                  // bubble.tsx 内 closest("[data-yj-bubble-anchor]") 联动；上层
                  // onOpenActionMenu 同时改成 toggle 才能完整闭合。
                  data-yj-bubble-anchor=""
                >
                  <MoreHorizontalDots />
                </button>
              ) : null}
            </div>
          </div>
          {narrationUrl ? (
            <audio
              ref={narrationAudioRef}
              src={narrationUrl}
              controls
              preload="auto"
              className="mt-2 w-full"
              data-no-doubletap
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
          {narrationError ? (
            // 走查移动端朋友圈/最新一轮 R1：之前 narrationError 只挂到「朗读」
            // 按钮的 title attr——移动端长按才显示，普通 tap 完全看不到反馈，
            // 用户点完听见啥都没动以为按钮坏了。inline 一条红字让失败原因
            // 可见，role="alert" 让 SR 立刻朗读。tone 跟全局 #FA5151（同
            // share-card-modal / wechat-comment-bar 错误条）一致。
            <div
              role="alert"
              className="mt-2 rounded-[4px] bg-[color:var(--state-danger-bg)] px-2.5 py-1.5 text-[length:var(--text-caption)] leading-[18px] text-[color:var(--state-danger-text)]"
            >
              {narrationError}
            </div>
          ) : null}

          {showFooterBlock ? (
            <div className="mt-2 overflow-hidden rounded-[3px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)]">
              {hasLikes ? (
                <div className="flex flex-wrap items-start gap-1 px-2.5 py-1.5 text-[length:var(--text-caption)] leading-[20px]">
                  <Heart
                    size={13}
                    className="mt-1 shrink-0 fill-[#576B95] text-[#576B95]"
                  />
                  <div className="flex min-w-0 flex-wrap gap-x-1">
                    {visibleLikes
                      // 走查 R1：filter 已经提到上方 useMemo（visibleLikes），
                      // 这里直接渲染——避免每次卡片重渲都跑一次 filter。空名字
                      // 兜底逻辑在 useMemo 里。
                      .map((like, index, arr) => (
                        <span
                          key={like.id ?? `${like.authorId}-${index}`}
                          className="inline-flex min-w-0 max-w-full items-baseline"
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onLikeAuthorTap?.(like);
                            }}
                            // 群标题之类很长的 liker（"走查测试群讨论时，你们对某个方法问题
                            // 有不同的理解" 那种）会按字宽 wrap，把后面挂的 "," 推到下一行
                            // 形成「孤儿逗号」。max-w + truncate 把单条 liker 收敛到一行。
                            className="max-w-[200px] truncate text-left align-baseline hover:opacity-80"
                            style={{ color: WECHAT_LINK_COLOR }}
                            data-no-doubletap
                            title={like.authorName}
                          >
                            {like.authorName}
                          </button>
                          {index < arr.length - 1 ? (
                            <span style={{ color: WECHAT_LINK_COLOR }}>,</span>
                          ) : null}
                        </span>
                      ))}
                  </div>
                </div>
              ) : null}

              {hasLikes && hasComments ? (
                <div className="h-px bg-[color:var(--surface-secondary)]" />
              ) : null}

              {hasComments ? (
                <div className="space-y-0.5 px-2.5 py-1.5 text-[length:var(--text-caption)] leading-[22px]">
                  {visibleComments.map((comment) => {
                    const replyToName = comment.replyToCommentId
                      ? commentAuthorById.get(comment.replyToCommentId) ?? null
                      : null;
                    // 上一遍循环已算过 stripToolCallSyntax，这里直接读
                    // ——visibleComments 是过完滤的，cleanTextById 必有该 key。
                    const cleanCommentText =
                      cleanTextById.get(comment.id) ?? comment.text;
                    return (
                      <button
                        key={comment.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCommentTap?.(comment);
                        }}
                        className="block w-full text-left active:bg-[color:var(--surface-secondary)]"
                        style={{ color: WECHAT_TEXT_COLOR }}
                        data-no-doubletap
                      >
                        {/* 长名字（群标题／角色被改成超长 displayName）会按字宽
                            wrap，把后面的「：评论正文」推到下一行甚至撞断句。
                            inline-block + truncate 让单名字最多占一行，超出 …。 */}
                        <span
                          className="inline-block max-w-[160px] truncate align-bottom"
                          style={{ color: WECHAT_LINK_COLOR }}
                          title={comment.authorName}
                        >
                          {comment.authorName}
                        </span>
                        {replyToName ? (
                          <>
                            <span> {t(msg`回复`)} </span>
                            <span
                              className="inline-block max-w-[160px] truncate align-bottom"
                              style={{ color: WECHAT_LINK_COLOR }}
                              title={replyToName}
                            >
                              {replyToName}
                            </span>
                          </>
                        ) : null}
                        <span>：{cleanCommentText}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {floatingHeartTick > 0 ? (
            // key=tick 把节点重挂，让 keyframe 重头跑一遍；定时器 useEffect
            // 同时被新 tick 重置。
            <FloatingHeart key={floatingHeartTick} liked={liked} />
          ) : null}
        </div>
      </article>
    );
  },
), arePropsEqual);

function MoreHorizontalDots() {
  return (
    <svg
      width="14"
      height="3"
      viewBox="0 0 14 3"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="2" cy="1.5" r="1.2" />
      <circle cx="7" cy="1.5" r="1.2" />
      <circle cx="12" cy="1.5" r="1.2" />
    </svg>
  );
}

function FloatingHeart({ liked }: { liked: boolean }) {
  const style: CSSProperties = {
    animation:
      "wechat-double-tap-heart 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <Heart
        size={68}
        className={cn(
          "drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]",
          liked
            ? "fill-[color:var(--state-danger-solid)] text-[color:var(--state-danger-text)]"
            : "fill-[color:var(--surface-card)]/0 text-[color:var(--text-on-brand)]/90",
        )}
        style={style}
      />
      <style>{`
        @keyframes wechat-double-tap-heart {
          0% { opacity: 0; transform: scale(0.5); }
          22% { opacity: 1; transform: scale(1.18); }
          50% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.92); }
        }
      `}</style>
    </div>
  );
}

function formatWeChatTimestamp(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return iso;
  }

  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return t(msg`刚刚`);
  if (diffMin < 60) return t(msg`${diffMin} 分钟前`);

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t(msg`${diffHour} 小时前`);

  const date = new Date(ts);
  const today = new Date();

  // 走查移动端朋友圈/Round 1 R1：之前「X 天前」分支走 wall-clock 差
  // `Math.floor((today.getTime() - ts) / 86400000)`，但「昨天」分支走的是
  // calendar-day sameDay 判定，二者口径不一致。前天 23:59 发的 moment 今天
  // 14:00 来看：wall-clock 差 38h → floor=1 → 落到「X 天前」分支被算成
  // 「1 天前」，但 calendar-wise 是 2 天前，用户读着前天的朋友圈写"1 天前"
  // 很违和。把「昨天」/「X 天前」统一到 calendar-day 差：date / today 都
  // 对齐到当日 00:00 再算天数差。Math.round 兜住 DST 切换日（中国无 DST，
  // 但 i18n 用户可能在有 DST 的时区，那天的 dateMidnight - todayMidnight
  // 会是 23h 或 25h）。
  const dateMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const calendarDayDiff = Math.round(
    (todayMidnight.getTime() - dateMidnight.getTime()) / 86400000,
  );

  if (calendarDayDiff === 1) return t(msg`昨天`);
  if (calendarDayDiff < 7) return t(msg`${calendarDayDiff} 天前`);

  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (date.getFullYear() === today.getFullYear()) {
    return t(msg`${month}月${day}日`);
  }
  return t(msg`${date.getFullYear()}年${month}月${day}日`);
}

