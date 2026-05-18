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

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 走查 2026-05-17 新会话 R4：Android 硬件 Back 键 — picker 打开时按 Back
  // 应该收 picker 而不是退掉整个视频号页。和 wechat-comment-bar /
  // share-card-modal / mobile-channels-comments-sheet 同款拦截：preventDefault
  // + 返回 true 消费按键。
  useEffect(() => {
    if (!open) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
  }, [open, onClose]);

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
      <button
        type="button"
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="channels-forward-picker-title"
        className="relative max-h-[80vh] w-full max-w-[420px] overflow-hidden rounded-t-[20px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-overlay)] sm:rounded-[20px]"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <div>
            <div id="channels-forward-picker-title" className="text-[16px] font-medium text-[color:var(--text-primary)]">
              {t(msg`转发到聊天`)}
            </div>
            {postExcerpt ? (
              <div className="mt-1 line-clamp-1 text-[12px] text-[color:var(--text-muted)]">
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
          <div className="mx-5 mb-2 rounded-[12px] border border-[color:var(--border-danger,#FCA5A5)] bg-[color:var(--surface-danger,#FEF2F2)] px-3 py-2 text-[12px] text-[color:var(--text-danger,#B91C1C)]">
            {errorMessage}
          </div>
        ) : null}

        <div className="max-h-[60vh] overflow-y-auto px-2 pb-4">
          {friendsQuery.isLoading ? (
            <div className="py-10 text-center text-[13px] text-[color:var(--text-muted)]">
              {t(msg`正在加载好友列表…`)}
            </div>
          ) : friendsQuery.isError ? (
            // 走查 2026-05-17 R2：原来只显示一行错误文案、没有重试按钮。
            // staleTime 30s 内即使关 picker 再开同一条 post 的分享，friendsQuery
            // 不会自动重拉——用户得退回 channels home、等 30s 再点 share 才能
            // 再试。加一个内联重试按钮直接 refetch，落地体感跟其它读失败状态
            // 卡（视频号 home/作者主页）保持一致。
            <div className="py-10 text-center text-[13px] text-[color:var(--text-muted)]">
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
