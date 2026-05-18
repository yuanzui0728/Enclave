import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
import { getFriends, listCharacters } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../../../runtime/android-back-button";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useDesktopLayout } from "../../shell/use-desktop-layout";
import { useManagementScreenStack } from "./contacts-management-state";
import { ManagementRootScreen } from "./management-root-screen";
import { ManagementBlacklistScreen } from "./management-blacklist-screen";
import { ManagementPermissionsScreen } from "./management-permissions-screen";
import { ManagementPermissionsDetailScreen } from "./management-permissions-detail-screen";

export type ContactsManagementModalProps = {
  open: boolean;
  onClose: () => void;
  onEnterBulkMode: () => void;
  onOpenTags: () => void;
};

export function ContactsManagementModal({
  open,
  onClose,
  onEnterBulkMode,
  onOpenTags,
}: ContactsManagementModalProps) {
  const t = useRuntimeTranslator();
  const isDesktop = useDesktopLayout();
  const { current, canGoBack, push, pop } = useManagementScreenStack(open);

  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  // 模态体里的滚动容器是 modal 共享一个 overflow-y-auto，list / detail 两屏内容
  // 切换时 detail（一般 1 屏内）比 list（A-Z 26 段）短得多。用户在 list 滚到
  // "M" 段 → 点某个好友 → push 'permissions-detail' → DOM 换成短内容 → 浏览器
  // 自动 clamp 滚动容器的 scrollTop 到新内容的 maxScrollTop（趋近 0）→ 点返回
  // 回到 list，滚动条已经被拍回顶部，用户得重新 A-Z 一路滚到 M。在 modal 这一层
  // 拦截屏切换记录 / 恢复 scrollTop（用 useLayoutEffect 保证 paint 前生效，
  // 避免肉眼看到一帧"先在顶部、再瞬移到 M"）。
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const savedScrollByScreenRef = useRef<Map<string, number>>(new Map());
  // permissions list 搜索框：state 提到 modal，list ↔ detail 切换不丢词。
  // 模态关闭时一并清，下次重开从空白起始（跟 stack reset 节奏一致）。
  const [permissionsSearch, setPermissionsSearch] = useState("");
  // 新一轮走查：permissions-detail 子屏写入权限期间 modal 不能被关 / pop /
  // 顶部返回，避免 mutation 回调挂在 dead hook、错误 notice / 缓存失效全部
  // 静默丢失。子屏通过 onBusyChange 回报 busy；切屏 / 子屏卸载会把 busy 重置。
  const [busy, setBusy] = useState(false);
  const handleBusyChange = useCallback((next: boolean) => setBusy(next), []);
  const tryClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);
  const tryPop = useCallback(() => {
    if (busy) return;
    pop();
  }, [busy, pop]);
  // R2 走查：原 dep 含 permissionsSearch → 用户每敲一字都触发 effect 跑一次
  //（即便 !open 分支永远走不到）。只看 open 就够，关闭瞬间 setState("") 安全。
  useEffect(() => {
    if (!open) {
      setPermissionsSearch("");
    }
  }, [open]);
  // 仅在打开 permissions-detail 时才查（弹窗未打开时 useQuery 不订阅）。
  const detailCharacterId =
    current.type === "permissions-detail" ? current.characterId : null;
  // 新一轮走查：共享 contacts-page / permissions-detail 的同 cache key，配 staleTime
  // 让 modal 反复打开 permissions-detail 时不重复 fetch。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: Boolean(open && detailCharacterId),
    staleTime: 15_000,
  });
  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
    enabled: Boolean(open && detailCharacterId),
    staleTime: 30_000,
  });
  const detailFriendName = useMemo(() => {
    if (!detailCharacterId) return null;
    const friend = (friendsQuery.data ?? []).find(
      (f) => f.character.id === detailCharacterId,
    );
    const remark = friend?.friendship?.remarkName?.trim();
    if (remark) return remark;
    if (friend?.character?.name) return friend.character.name;
    const char = (charactersQuery.data ?? []).find(
      (c) => c.id === detailCharacterId,
    );
    return char?.name ?? null;
  }, [detailCharacterId, friendsQuery.data, charactersQuery.data]);

  const screenKey =
    current.type === "permissions-detail"
      ? `permissions-detail:${current.characterId}`
      : current.type;

  // 屏切换前后：先把当前屏正在被滚动的 scrollTop 持续 sync 进 ref；屏一变
  // 就在 useLayoutEffect 里把新屏之前存的 scrollTop 写回容器。modal 关闭 →
  // 重开时 useManagementScreenStack(open) 会把 stack reset 回 root，screenKey
  // 也回到 "root"，记忆体里没有 root 的旧 scrollTop（root 几乎没滚动空间）
  // → 默认从顶部开始，符合预期。
  // R2 走查：handler 通过 ref 读 currentScreenKey，避免 screenKey 一变就把 listener
  // 拆掉重装；同一个 modal 生命周期里只 add 一次，scroll 60Hz 不会再来回挂钩子。
  // 关键点：ref 必须在 paint 前同步到新值，否则下一行 useLayoutEffect 里
  // container.scrollTop=saved 会触发一次 scroll 事件，handler 读到的还是旧
  // screenKey → 拿"新屏的 0"覆盖了"旧屏的真实 scrollTop"。用 useLayoutEffect
  // 在 paint 前更新 ref（执行顺序在下面 scrollTop 还原之前）。
  const currentScreenKeyRef = useRef(screenKey);
  useLayoutEffect(() => {
    currentScreenKeyRef.current = screenKey;
  }, [screenKey]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      savedScrollByScreenRef.current.set(
        currentScreenKeyRef.current,
        container.scrollTop,
      );
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const saved = savedScrollByScreenRef.current.get(screenKey) ?? 0;
    container.scrollTop = saved;
  }, [open, screenKey]);

  // R2 走查：modal 关闭后清空记忆 Map。原写法 Map 在 modal 关 / 重开之间一直
  // 留着，用户在一个会话里依次进 30 个不同好友的 permissions-detail，就在 Map 里
  // 堆 30 个 'permissions-detail:<uuid>' 条目（每条 scrollTop 几乎都是 0，因为
  // detail 屏内容很短），后续再也用不到。整轮会话结束前都不释放。关闭时
  // 顺手清掉，下次重开从干净状态起步。
  useEffect(() => {
    if (!open) {
      savedScrollByScreenRef.current.clear();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // busy 时（权限写入中）吞掉 Esc，等 mutation / refetch 落地再放行。
        if (busy) {
          return;
        }
        if (canGoBack) {
          pop();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, canGoBack, pop, onClose, busy]);

  // 原生壳硬件 Back：modal 打开时先消费 Back —— 能 pop 内屏就 pop，到根屏再
  // 把 Back 当成关 modal，避免被默认的 history.back 直接弹出 /tabs/contacts。
  // busy 时硬件 Back 同样吞掉，跟键盘 Esc 行为一致。
  useEffect(() => {
    if (!open) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      if (busy) {
        return true;
      }
      if (canGoBack) {
        pop();
      } else {
        onClose();
      }
      return true;
    });
    return unregister;
  }, [open, canGoBack, pop, onClose, busy]);

  if (!open) return null;

  const titleText = (() => {
    switch (current.type) {
      case "blacklist":
        return t(msg`黑名单`);
      case "permissions":
        return t(msg`朋友权限`);
      case "permissions-detail":
        // 列表与详情都叫 “朋友权限” 时用户来回切看不出在改谁；详情页头部回退到好友显示名。
        return detailFriendName ?? t(msg`朋友权限`);
      case "root":
      default:
        return t(msg`通讯录管理`);
    }
  })();

  const body = (() => {
    switch (current.type) {
      case "blacklist":
        return <ManagementBlacklistScreen />;
      case "permissions":
        return (
          <ManagementPermissionsScreen
            onPickFriend={(characterId) =>
              push({ type: "permissions-detail", characterId })
            }
            search={permissionsSearch}
            onSearchChange={setPermissionsSearch}
          />
        );
      case "permissions-detail":
        return (
          <ManagementPermissionsDetailScreen
            characterId={current.characterId}
            onBusyChange={handleBusyChange}
          />
        );
      case "root":
      default:
        return (
          <ManagementRootScreen
            onOpenBlacklist={() => push({ type: "blacklist" })}
            onOpenPermissions={() => push({ type: "permissions" })}
            onOpenTags={onOpenTags}
            onEnterBulkMode={onEnterBulkMode}
          />
        );
    }
  })();

  const header = (
    <ModalHeader
      title={titleText}
      canGoBack={canGoBack}
      onBack={tryPop}
      onClose={tryClose}
      backLabel={t(msg`返回`)}
      closeLabel={t(msg`关闭`)}
      disabled={busy}
    />
  );

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
        <button
          type="button"
          aria-label={t(msg`关闭`)}
          onClick={tryClose}
          disabled={busy}
          className="absolute inset-0"
        />
        <div className="relative flex max-h-[80vh] w-full max-w-[480px] flex-col overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-overlay)]">
          {header}
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f7]"
          >
            {body}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30">
      <button
        type="button"
        aria-label={t(msg`关闭`)}
        onClick={tryClose}
        disabled={busy}
        className="absolute inset-0"
      />
      <div className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[18px] bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_28px_rgba(15,23,42,0.18)]">
        <div className="flex justify-center pt-2">
          <div className="h-1 w-9 rounded-full bg-black/10" />
        </div>
        {header}
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f7]"
        >
          {body}
        </div>
      </div>
    </div>
  );
}

function ModalHeader({
  title,
  canGoBack,
  onBack,
  onClose,
  backLabel,
  closeLabel,
  disabled = false,
}: {
  title: ReactNode;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  backLabel: string;
  closeLabel: string;
  // 新一轮走查：busy 时把顶部返回 / 关闭按钮一起禁用，避免「按钮看着可点
  // 但点了没反应」的迷惑态——视觉上轻微降透明度提示用户当前在写入中。
  disabled?: boolean;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-[color:var(--border-faint)] bg-white px-3">
      <div className="flex w-9 justify-start">
        {canGoBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            disabled={disabled}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)]",
              "hover:bg-black/4 active:bg-black/8 disabled:opacity-50",
            )}
          >
            <ArrowLeft size={18} />
          </button>
        ) : null}
      </div>
      {/* flex-1 min-w-0 truncate：permissions-detail 时标题来自 detailFriendName
          （可能是较长的外语好友名），原来 text-[15px] 单元素没有 max-width 也
          没 overflow:hidden，名字稍长就把 h-12 行高撑出 / 换行；改成中间区域
          占满剩余空间并按需省略。 */}
      <div className="min-w-0 flex-1 truncate text-center text-[15px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="flex w-9 justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          disabled={disabled}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] hover:bg-black/4 active:bg-black/8 disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
