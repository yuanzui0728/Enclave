import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFriends,
  listCharacters,
  updateFriendPermissions,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { invalidateFriendVisibilityQueries } from "../invalidate-friend-display";

type Props = {
  characterId: string;
  // 新一轮走查：把当前屏 mutation 的 pending 状态向上回报给 modal，让 backdrop /
  // Esc / Android Back / 顶部返回按钮在权限写入过程中暂时锁定，避免用户
  // 误触关闭 → modal 卸载 → mutation 回调挂在 dead hook 上 → 缓存未 invalidate /
  // 错误 notice 静默丢失。
  onBusyChange?: (busy: boolean) => void;
};

export function ManagementPermissionsDetailScreen({
  characterId,
  onBusyChange,
}: Props) {
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();

  // 新一轮走查：同 contacts-page 共享 cache key，配 staleTime 让权限明细
  // 屏频繁返回时不重复 fetch；permissions mutation 已经显式 invalidate。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });
  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
    staleTime: 30_000,
  });

  const friend = (friendsQuery.data ?? []).find(
    (f) => f.character.id === characterId,
  );
  const character =
    friend?.character ??
    (charactersQuery.data ?? []).find((c) => c.id === characterId);
  const friendship = friend?.friendship;

  const [hideTheir, setHideTheir] = useState(
    Boolean(friendship?.momentsHiddenFromMe),
  );
  const [hideMine, setHideMine] = useState(
    Boolean(friendship?.momentsHiddenFromThem),
  );
  const [chatOnly, setChatOnly] = useState(Boolean(friendship?.chatOnly));

  const mutation = useMutation({
    mutationFn: (payload: {
      momentsHiddenFromMe?: boolean;
      momentsHiddenFromThem?: boolean;
      chatOnly?: boolean;
    }) => updateFriendPermissions(characterId, payload, baseUrl),
    // 走查第五轮 R1：三个开关之前只 invalidate app-friends，是因为以前
    // momentsHiddenFromMe / momentsHiddenFromThem / chatOnly 是 dead flag，
    // 改了等于没改，缓存不动也没人察觉。前几轮把三个 flag 全部激活后，
    // 用户从这里勾「我不看 TA 的朋友圈」立刻翻回 /tabs/moments 或
    // /friend-moments/$id，仍然能看到 TA 的旧帖子——直到 moments query 自然
    // staleTime 过期或下一次手动刷新。
    // R2 复检：用专门给可见性更新的 invalidateFriendVisibilityQueries，
    // 不要复用 invalidateFriendDisplayQueries——后者会清 app-conversation-messages，
    // 而权限改动不影响任何消息文本，全量重拉所有打开会话的消息既慢又没必要。
    // 新一轮走查 R2：await invalidate 而不是 void，让 mutation.isPending
    // 一直 true 直到 refetch 完成。原来的 fire-and-forget 写法在 mutation 完成
    // 到 friendsQuery.isFetching 翻 true 之间有几十毫秒的"两个 flag 都是 false"
    // 窗口，下面的 sync effect 会读到旧 friendship 把乐观状态盖回去 → 用户看到
    // switch 抖一帧。invalidate 默认 refetchType:'active' 只重拉当前订阅的
    // friends 查询，不会牵涉无关 query 慢链路。
    // 关键：把 invalidate 的 reject 吃掉。tanstack v5 里 onSuccess 抛错会把
    // mutation 整体翻成 error 态 → UI 弹"权限修改失败"红字，但其实服务端写入
    // 早就成功了，只是 refetch 时网络抖断。catch 后留下 stale=true 即可，
    // 下次访问 friendsQuery 会自然重拉。
    onSuccess: async () => {
      try {
        await invalidateFriendVisibilityQueries(queryClient, baseUrl);
      } catch {
        // intentional: write 已成功，refetch 失败不应回报为 mutation 错误
      }
    },
  });

  // mutation.isPending 守护：用户快速切换 2 个开关时，A 完成会触发 invalidate
  // → friendsQuery 重拉，此时服务端只反映 A 不反映 B，旧 friendship.chatOnly
  // 还是 false，sync 会把 B 的乐观状态（true）盖回 false。等 B 完成再 invalidate
  // 一次才回 true，肉眼上看到 B 开关闪了一下。在任何 mutation 在飞时跳过
  // server→local 同步，等用户最后一次操作真正落库后再同步。
  // 新一轮走查 R3：再加 friendsQuery.isFetching 守护。原写法只看 isPending，但
  // mutation onSuccess 同步把 isPending 翻 false 时 invalidate 触发的 refetch 还
  // 没回来，friendship 还是旧值；effect 立刻跑一次 → 把乐观的 true sync 回旧的
  // false → 用户看到 switch 先 ON 一瞬，flicker 到 OFF，refetch 回来再 ON。
  // 把 isFetching 一并 gate 住，等数据真到位再 sync 才不抖。
  useEffect(() => {
    if (mutation.isPending || friendsQuery.isFetching) {
      return;
    }
    setHideTheir(Boolean(friendship?.momentsHiddenFromMe));
    setHideMine(Boolean(friendship?.momentsHiddenFromThem));
    setChatOnly(Boolean(friendship?.chatOnly));
  }, [
    friendship?.momentsHiddenFromMe,
    friendship?.momentsHiddenFromThem,
    friendship?.chatOnly,
    mutation.isPending,
    friendsQuery.isFetching,
  ]);

  // 新一轮走查：向 modal 上报 busy 状态——mutation 在飞或 invalidate 触发的
  // refetch 还没回来时都算"权限写入中"，让 modal 暂时拦截关闭手势。卸载时
  // 显式回报 false 兜底（理论上 modal 卸载链路会自然清栈，但用 onBusyChange?.
  // 兜一手避免悬挂的 busy 状态把下次开 modal 卡死）。
  const busy = mutation.isPending || friendsQuery.isFetching;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => {
      onBusyChange?.(false);
    };
  }, [busy, onBusyChange]);

  const apply = (
    next: { hideTheir?: boolean; hideMine?: boolean; chatOnly?: boolean },
  ) => {
    const payload: {
      momentsHiddenFromMe?: boolean;
      momentsHiddenFromThem?: boolean;
      chatOnly?: boolean;
    } = {};
    if (typeof next.hideTheir === "boolean") {
      payload.momentsHiddenFromMe = next.hideTheir;
      setHideTheir(next.hideTheir);
    }
    if (typeof next.hideMine === "boolean") {
      payload.momentsHiddenFromThem = next.hideMine;
      setHideMine(next.hideMine);
    }
    if (typeof next.chatOnly === "boolean") {
      payload.chatOnly = next.chatOnly;
      setChatOnly(next.chatOnly);
    }
    mutation.mutate(payload, {
      onError: () => {
        if (typeof next.hideTheir === "boolean") {
          setHideTheir(!next.hideTheir);
        }
        if (typeof next.hideMine === "boolean") {
          setHideMine(!next.hideMine);
        }
        if (typeof next.chatOnly === "boolean") {
          setChatOnly(!next.chatOnly);
        }
      },
    });
  };

  // 新一轮走查：区分 "queries 还在 loading（首屏没数据）" vs "查完了但
  // characterId 在 friends/characters 里都不命中"。原写法两种都展示
  // "正在读取联系人..." → 用户在另一处把这个角色删了再返回详情时，看不到
  // "无此联系人" 的明确反馈，会反复返回—进入—返回怀疑卡死。两条 query 都
  // 不在 fetching 且 character 仍 null 时改成失踪态 + 后退提示。
  if (!character) {
    const stillLoading = friendsQuery.isLoading || charactersQuery.isLoading;
    if (stillLoading) {
      return (
        <div className="px-4 py-8 text-center text-[12px] text-[color:var(--text-muted)]">
          {t(msg`正在读取联系人...`)}
        </div>
      );
    }
    return (
      <div className="px-6 py-12 text-center">
        <div className="mx-auto inline-flex rounded-full bg-[#eef2f6] px-3 py-1 text-[10px] font-medium text-[color:var(--text-muted)]">
          {t(msg`朋友权限`)}
        </div>
        <div className="mt-3 text-[14px] font-medium text-[color:var(--text-primary)]">
          {t(msg`联系人不存在或已被移除`)}
        </div>
        <p className="mx-auto mt-2 max-w-[18rem] text-[11px] leading-5 text-[color:var(--text-muted)]">
          {t(msg`请返回上一页选择其他联系人。`)}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3 rounded-[12px] bg-white px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <AvatarChip name={character.name} src={character.avatar} size="wechat" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
            {friendship?.remarkName?.trim() || character.name}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
            {character.relationship || t(msg`保持联系`)}
          </div>
        </div>
      </div>

      {mutation.isError && mutation.error instanceof Error ? (
        // 之前失败时 switch 自己回滚但没任何提示，用户看着像 toggle 突然弹回，
        // 不知道是网络挂了还是后端拒了。补一条 danger notice，错误消息直接来自
        // mutation.error。
        <InlineNotice
          tone="danger"
          className="mt-3 rounded-[11px] px-2.5 py-1.5 text-[11px] leading-4 shadow-none"
        >
          {mutation.error.message || t(msg`权限修改失败，请稍后再试。`)}
        </InlineNotice>
      ) : null}

      <ul className="mt-3 overflow-hidden rounded-[12px] bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        {/* R2 走查：mutation.isPending 时锁住三个 switch。原写法没锁，
            用户连点 hideMine on / off / on 时多次 mutate 并发起飞，server
            可能乱序完成；如果其中一条失败，单条 onError 用 setX(!next.X) 朴素
            翻转，会把"另一条尚未落库的乐观值"也一并翻回去，看起来像 switch
            自己反弹。锁到上一条落库再让点下一条，最差只是慢一点，不再有
            状态错乱。 */}
        <SwitchRow
          label={t(msg`不让TA看我朋友圈`)}
          checked={hideMine}
          disabled={mutation.isPending}
          onChange={(checked) => apply({ hideMine: checked })}
          first
        />
        <SwitchRow
          label={t(msg`不看TA的朋友圈`)}
          checked={hideTheir}
          disabled={mutation.isPending}
          onChange={(checked) => apply({ hideTheir: checked })}
        />
        <SwitchRow
          label={t(msg`仅聊天的朋友`)}
          description={t(msg`仅保留聊天，TA 不会出现在朋友圈、动态等场景。`)}
          checked={chatOnly}
          disabled={mutation.isPending}
          onChange={(checked) => apply({ chatOnly: checked })}
        />
      </ul>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  first = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  first?: boolean;
}) {
  return (
    <li
      className={
        !first ? "border-t border-[color:var(--border-faint)]" : undefined
      }
    >
      <label
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-[color:var(--text-primary)]">
            {label}
          </div>
          {description ? (
            <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--text-muted)]">
              {description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full transition-colors",
            checked ? "bg-[#07c160]" : "bg-[#e0e0e0]",
            disabled ? "opacity-60" : undefined,
          )}
        >
          <span
            className={cn(
              "inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-[20px]" : "translate-x-[2px]",
            )}
          />
        </button>
      </label>
    </li>
  );
}
