import { useDeferredValue, useMemo } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, X } from "lucide-react";
import { getFriends, SELF_CHARACTER_ID } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import {
  buildContactSections,
  createFriendDirectoryItems,
  matchesFriendSearch,
} from "../contact-utils";

type Props = {
  onPickFriend: (characterId: string) => void;
  // 搜索状态由 modal 那一层托管：本组件在用户进入 permissions-detail 时整体
  // 卸载，本地 useState 会跟着丢；用户从详情返回时输入框会被重置成空，已经
  // 筛掉的"Alice"得重新打一遍。把 search 提到模态体让两屏切换不失忆。
  search: string;
  onSearchChange: (next: string) => void;
};

export function ManagementPermissionsScreen({
  onPickFriend,
  search,
  onSearchChange,
}: Props) {
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  // 新一轮走查：同 contacts-page / mobile-add-friend-page 同 cache key，主页已经
  // 拉过；这里不设 staleTime 会让每次切入"朋友权限"屏都重新 background fetch。
  // 15s 跟主页一致。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });

  const trimmedSearch = search.trim();
  // matchesFriendSearch 默认 haystack 已 toLowerCase，needle 也得是 lowercase
  // 才能匹配上。直接传 trimmedSearch 会让用户输入 "Andrej" 找不到 "Andrej Karpathy"。
  const normalizedSearch = trimmedSearch.toLowerCase();
  // 新一轮走查：把 normalizedSearch 套一层 useDeferredValue，让 sections
  // 的重算切到低优先级。原本输入框每敲一个字 → 同步 filter + buildContactSections
  // （含 A-Z 分段 + Collator 比较）→ 阻塞下一帧 input 重渲染，在好友 200+ 的
  // 账号上能看到肉眼 100-200ms 的卡顿。useDeferredValue 让 input value 立刻
  // 反映出来，sections 在下次空闲帧重算，体感跟 contacts-page 主搜索一致。

  // 拆 2 个 useMemo —— 原写法把 createFriendDirectoryItems（包含拼音 Collator
  // 排序，O(n log n)）和 filter+buildContactSections 放在同一个 useMemo 里，依赖
  // normalizedSearch，每个键都会让目录从零重排一次。对齐 contacts-page 的拆分
  // 后，directoryItems 只随 friendsQuery.data 重算；输入框敲字时只跑 O(n) filter。
  // SELF 过滤：char-default-self（"我自己"）是用户的自我镜像，对自己设
  // "不让 TA 看我朋友圈" / "仅聊天的朋友" 这类权限毫无意义（TA 就是你）。
  // 已经在 add-friend search 按 relationshipType==='self' 过滤掉了，这里
  // 对齐处理，避免"朋友权限"列表里冒出"我自己"诱导用户做自反操作。
  const directoryItems = useMemo(
    () =>
      createFriendDirectoryItems(
        (friendsQuery.data ?? []).filter(
          (item) => item.character.id !== SELF_CHARACTER_ID,
        ),
      ),
    [friendsQuery.data],
  );
  const deferredSearch = useDeferredValue(normalizedSearch);
  const sections = useMemo(() => {
    const filtered = deferredSearch
      ? directoryItems.filter((item) =>
          matchesFriendSearch(item, deferredSearch),
        )
      : directoryItems;
    return buildContactSections(filtered);
  }, [directoryItems, deferredSearch]);

  const isLoading = friendsQuery.isLoading;

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-[1] border-b border-[color:var(--border-faint)] bg-[#f7f7f7] px-3 py-2">
        <label className="flex h-9 items-center gap-2 rounded-[10px] bg-white px-3 text-[13px] text-[color:var(--text-dim)]">
          <Search size={14} />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t(msg`搜索好友`)}
            // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
            // zoom-in；管理 modal 弹起来就抖。
            className="min-w-0 flex-1 bg-transparent text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
          />
          {search ? (
            // 对齐 mobile-add-friend 的搜索框：有输入时显示 X 一键清空，避免
            // 用户搜出"无匹配"后只能手动删除每个字符才能继续。
            // 新一轮走查 R4：onMouseDown.preventDefault 防止 X 按钮夺走 input 的 focus。
            // 原写法手机上点 X → button 抢焦点 → input 失焦 → 软键盘收回，用户清完
            // 还想继续敲就要再点一次 input 把键盘叫回来。pointer-press 不变更焦点
            // 是搜索框 clear 按钮的标准做法（iOS 原生 type=search clear 也是这行为）。
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSearchChange("")}
              className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--text-dim)] active:bg-black/5"
              aria-label={t(msg`清空输入`)}
            >
              <X size={13} />
            </button>
          ) : null}
        </label>
      </div>

      {isLoading ? (
        <div className="px-4 py-8 text-center text-[12px] text-[color:var(--text-muted)]">
          {t(msg`正在读取联系人...`)}
        </div>
      ) : friendsQuery.isError && friendsQuery.error instanceof Error ? (
        // friendsQuery 失败时 data=[] 会直接走"通讯录还是空的"误导分支，对齐
        // 黑名单屏的处理：单独识别 error 状态 + 重试按钮，别让用户以为自己
        // 没好友。
        <div className="px-3 py-4">
          <InlineNotice
            tone="danger"
            className="rounded-[11px] px-2.5 py-2 text-[12px] leading-5 shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">
                {friendsQuery.error.message || t(msg`联系人列表暂时读取失败。`)}
              </span>
              <button
                type="button"
                onClick={() => void friendsQuery.refetch()}
                className="shrink-0 rounded-full border border-[rgba(220,38,38,0.18)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
              >
                {t(msg`重试读取`)}
              </button>
            </div>
          </InlineNotice>
        </div>
      ) : !sections.length ? (
        <div className="px-6 py-10 text-center text-[12px] text-[color:var(--text-muted)]">
          {trimmedSearch
            ? t(msg`没有找到匹配的联系人`)
            : t(msg`通讯录还是空的`)}
        </div>
      ) : (
        <div className="px-3 pb-4 pt-2">
          {sections.map((section) => (
            <div key={section.key} className="mb-3 last:mb-0">
              <div className="px-1 pb-1 text-[10px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                {section.title}
              </div>
              <ul className="overflow-hidden rounded-[12px] bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                {section.items.map((item, index) => (
                  <li
                    key={item.character.id}
                    className={
                      index > 0
                        ? "border-t border-[color:var(--border-faint)]"
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onPickFriend(item.character.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]"
                    >
                      <AvatarChip
                        name={item.character.name}
                        src={item.character.avatar}
                        size="wechat"
                      />
                      <div className="min-w-0 flex-1 truncate text-[14px] text-[color:var(--text-primary)]">
                        {item.displayName}
                      </div>
                      <ChevronRight
                        size={15}
                        className="shrink-0 text-[color:var(--text-muted)]"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
