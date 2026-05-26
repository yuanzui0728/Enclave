import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

const t = translateRuntimeMessage;

export type WeChatCommentBarReplyTarget = {
  authorId: string;
  authorName: string;
  commentId: string;
};

type WeChatCommentBarProps = {
  open: boolean;
  /** 当 `replyTo` 为空时为「发表评论」；否则为「回复 xxx」。 */
  replyTo?: WeChatCommentBarReplyTarget | null;
  /** 已经持久化的草稿（用于父组件控制；可为空字符串）。 */
  value: string;
  onChange: (value: string) => void;
  pending?: boolean;
  /**
   * 走查新一轮 Round 6：mutation 失败时父组件在 feed 列表里渲染一条
   * InlineNotice，但 commentBar 的全屏 overlay 走 z=1000，notice 在
   * z=auto 的列表内容里完全被盖住，用户视感是「点了发送，按钮蹦回
   * 『发送』，啥反应没有」继续重试触发同一个错。把错误信息透传进 bar
   * 内显示在 textarea 上方，z 走 1001 跟着 drawer 一起浮起来。
   */
  errorMessage?: string | null;
  onSubmit: () => void;
  onClose: () => void;
};

export function WeChatCommentBar({
  open,
  replyTo,
  value,
  onChange,
  pending = false,
  errorMessage,
  onSubmit,
  onClose,
}: WeChatCommentBarProps) {
  const [mounted, setMounted] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  // 同步防双击锁——下方 handleSubmit 原本只 guard `canSubmit`，但 canSubmit 是
  // 上一次 render 时定下的 const，同一帧里连点 5 次会拿到同一份 canSubmit=true
  // 同步通过 5 次（CDP 实测：5 click → 5 POST /api/moments/X/comment 在 1ms 内
  // 飞出，朋友圈出 5 条一模一样的评论）。ref 同步赋值，第一次 click 翻 true
  // 后同帧内的所有后续 click 都被早返兜住。bar 每次重新 open（包括切换 moment）
  // 时清回 false，让下一条评论能正常发。
  const submittingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto focus when opening; reset offset + submit lock when closing/reopening.
  useEffect(() => {
    if (!open) {
      setKeyboardOffset(0);
      return;
    }
    // 每次 bar 重新 open 都把同步锁清掉，让下一次评论能正常发——
    // 一次 send 锁住后 bar 关闭、mutation 完成、bar 再开（同 moment 或别的
    // moment）都会走这条 effect 把锁释放。
    submittingRef.current = false;
    requestAnimationFrame(() => {
      textAreaRef.current?.focus();
    });
  }, [open]);

  // mutation 失败时 bar 通常保持 open（父组件在 onSuccess 才关 bar；onError
  // 路径下 commentBarTarget 留着让用户能直接改文案重发）。pending 跟着翻回
  // false，看着可以重发，但 submittingRef 只在 open 转 true 时才清——bar 没
  // 关掉之前同步锁一直挂着，handleSubmit 早返。用户改完文案点"发送"完全
  // 没反应（点一次→等几秒→什么都没发生），只能先点空白关 bar 再重开才能
  // 发出去。盯 pending 的下沿，settle 后释放锁，bar 不需要 remount 也能继
  // 续发。
  useEffect(() => {
    if (!pending) {
      submittingRef.current = false;
    }
  }, [pending]);

  // Adjust for soft keyboard via VisualViewport.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const offset =
        window.innerHeight - (viewport.height + viewport.offsetTop);
      setKeyboardOffset(offset > 24 ? offset : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);

  // 走查 R1：父组件每次传新的 inline `onClose={() => setX(null)}` 进来 —
  // 用户每敲一下字（discover-feed-page 的 setCommentDrafts 触发整页重渲）
  // 都会换 onClose 身份，下面两条 useEffect 把 keydown listener + Android
  // back interceptor remove → re-add 一遍。bar 一打开后每键 +4 次副作用，
  // 跟 Round 2 use-keyboard-inset 是同一种 cleanup-storm 模式。
  // 用 ref 把最新 onClose 钉稳：每次 render 写一次 ref，effect 里读
  // ref.current，effect deps 只挂 [open]，bar 打开/关闭时各做一次
  // add/remove；中间敲字不再卷 listener。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Close on Escape.
  // 走查 R1：之前 ESC handler 不看 IME composing —— 中文 / 日文用户在 textarea
  // 打字开候选窗时按 ESC 想关候选窗（系统行为），keydown 一样冒出来命中这条
  // handler 把整个评论 bar 关掉，已经敲的草稿留在 commentDrafts 不丢但 bar 自
  // 己消失用户必须再点一次评论入口才能继续。跟桌面广场动态 R1 (902d9f0a) 同
  // 修法：event.isComposing / event.keyCode===229 时跳过。
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  // Android 硬件 Back：bar 打开时按 Back 应该收 bar 而不是退掉整页。
  // 跟 chat 系列 (38a65fa5) / mobile-feed-publish discardConfirm / MomentMediaGallery
  // viewer 一致的模式。preventDefault + 返回 true 消费按键。
  useEffect(() => {
    if (!open) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
  }, [open]);

  // Auto-grow textarea up to 5 lines.
  useLayoutEffect(() => {
    const ta = textAreaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, 5 * 22 + 18);
    ta.style.height = `${next}px`;
  }, [value, open]);

  const placeholder = useMemo(() => {
    if (replyTo) {
      return t(msg`回复 ${replyTo.authorName}：`);
    }
    return t(msg`评论`);
  }, [replyTo]);

  const canSubmit = value.trim().length > 0 && !pending;

  const handleSubmit = () => {
    if (submittingRef.current) return;
    if (!canSubmit) return;
    submittingRef.current = true;
    onSubmit();
  };

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        // 走查本轮 R1 (a11y)：之前是裸 <div onPointerDown={onClose}>，屏幕阅读器
        // 用户没法把"点空白关 bar"这个动作 enumerate 出来（div 没语义 + 不可聚焦）。
        // 改成 <button aria-label="关闭评论">，VoiceOver/TalkBack 在"评论 dialog"
        // 后面能扫到"关闭评论"按钮一并 enable 用户用 tap-to-activate 退出。
        // tabIndex={-1} 避免键盘 Tab 经过它把焦点偷出 dialog 之外（焦点应该
        // 在 textarea 上）。
        //
        // 走查本轮 R7：同时挂 onPointerDown（鼠标/触摸即时响应）和 onClick（SR
        // 双击 / 桌面 SR 模拟 click 也能 close）—— onPointerDown 不被 SR 的
        // synthetic click 触发，单挂会让 SR 用户看到按钮但无法激活；onClick 在
        // 触摸场景下有 ~250ms 双击检测延迟，单挂会让 tap 关 bar 体感变拖沓。
        // onClose 多次调用对父组件是幂等（setCommentBarTarget(null) 等于 null）。
        aria-label={t(msg`关闭评论`)}
        tabIndex={-1}
        className="fixed inset-0 z-[1000] bg-black/30 backdrop-blur-[1px]"
        onPointerDown={onClose}
        onClick={onClose}
      />
      <div
        // 走查本轮 R1 (a11y)：之前 bar 整个 portal 没有 role/aria-* 语义——VoiceOver
        // / TalkBack 用户进入 bar 时只能听到 textarea placeholder（"评论" 或 "回复
        // X："），不知道上下文是"评论 modal"。挂 role="dialog" + aria-modal="true"
        // + aria-label 让屏幕阅读器在 focus 落到 textarea 之前先读出 dialog 名。
        // 跟 share-card-modal / mobile-moments-publish 的 ActionSheet 同模板。
        role="dialog"
        aria-modal="true"
        aria-label={replyTo ? t(msg`回复评论`) : t(msg`发表评论`)}
        className="fixed inset-x-0 z-[1001] bg-[#f8f5ec] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
        style={{
          bottom: 0,
          paddingBottom: `max(env(safe-area-inset-bottom,0px), 6px)`,
          transform: keyboardOffset
            ? `translateY(-${keyboardOffset}px)`
            : "translateY(0)",
          transition: "transform 120ms ease-out",
        }}
      >
        {errorMessage ? (
          // Round 6：mutation 失败的错误信息原本在父组件 feed 列表里走
          // InlineNotice 显示，但 bar 的全屏 overlay 是 z=1000 把列表整张盖
          // 住，用户什么都看不到。直接在 bar 内 textarea 上方渲一行：颜色
          // 跟 wechat 错误条对齐 (#fa5151)，限制 2 行 + 截断防超长 server
          // 错把整条 bar 撑开（比如评论太长 server 把上限值都塞进 message）。
          <div className="mx-3 mt-2 rounded-[4px] bg-[rgba(250,81,81,0.08)] px-2.5 py-1.5 text-[12px] leading-[18px] text-[#fa5151]">
            <div className="line-clamp-2">{errorMessage}</div>
          </div>
        ) : null}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1 rounded-[6px] border border-[#E5E5E5] bg-white px-3 py-2 text-[15px] text-[#1A1A1A]">
            <textarea
              ref={textAreaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              rows={1}
              // 500 字软上限，跟后端 MOMENT_COMMENT_TOO_LONG 对齐——之前没有任何
              // 上限，长文评论会把整段 footer 撑开把卡片正文挤压到看不见。
              maxLength={500}
              // text-[16px]: iOS Safari/WKWebView 在 input/textarea focus 时只要
              // 字段字号 <16px 就强制 viewport zoom-in。朋友圈/广场每条 post 点
              // 评论都会让整页放大、回弹时还得双指捏才能回正，反复操作非常难受。
              // 父级 wrapper 保留 text-[15px] 不动（控制 placeholder / 容器视
              // 觉），只把字段本身放到 16px。
              className="block w-full resize-none border-0 bg-transparent text-[16px] leading-[22px] outline-none placeholder:text-[#B0B0B0]"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                // 走查新一轮 Round 3：Android Chrome 部分 IME（搜狗 / 百度键盘
                // 等）在 composing 期间按 Enter 确认候选时，原生 KeyboardEvent
                // 的 isComposing 没置 true，仅 keyCode 走 229 信号；上方 ESC
                // 监听已经按这套双判定兜过，这条 Enter 路径却只看 isComposing
                // 漏了 keyCode。中文用户敲拼音回车选词时 handleSubmit 直接把
                // 半个词当评论发出去，UI 视感是"刚要选词突然评论就发了"。
                // 跟 desktop-feed-compose-panel R1 (76行) 同模式补全。
                if (
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229
                ) {
                  return;
                }
                event.preventDefault();
                handleSubmit();
              }}
            />
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              "h-[36px] shrink-0 rounded-[4px] px-4 text-[14px] font-medium transition-colors",
              canSubmit
                ? "bg-[#f59e0b] text-[#3b2206] active:bg-[#d97706]"
                : "bg-[#E5E5E5] text-[#B0B0B0]",
            )}
          >
            {pending ? t(msg`发送中`) : t(msg`发送`)}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
