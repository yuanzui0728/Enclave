import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import {
  CheckCheck,
  Star,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../../../runtime/android-back-button";
import { useBulkFriendshipMutation } from "./use-bulk-friendship-mutation";

type Props = {
  selectedIds: string[];
  totalIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDone: () => void;
  // 部分操作失败时把 bulk 模式保留下来，并把选区收敛成"失败那几个"，方便用户
  // 一眼定位 + 直接重试。原写法 res.failed.length>0 也照样调 onDone() → bulk
  // 退出 + 全清，用户只看到"部分操作失败"红字但不知道是哪几个，得 dance 出 dance
  // 入再重新挑一遍。
  onPartialFailure?: (failedIds: string[]) => void;
  setNotice?: (message: string | null) => void;
  // setNoticeError 走 danger tone（同一个 notice slot 上层渲染时切红字 + 长一点
  // 的自动消失时间），方便用户区分"批量删除完成"和"批量删除挂了"。
  setNoticeError?: (message: string | null) => void;
  desktop?: boolean;
};

export function ContactsBulkActionBar({
  selectedIds,
  totalIds,
  onSelectAll,
  onClearSelection,
  onDone,
  onPartialFailure,
  setNotice,
  setNoticeError,
  desktop = false,
}: Props) {
  const t = useRuntimeTranslator();
  const [tagDraft, setTagDraft] = useState("");
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const allSelected = totalIds.length > 0 && selectedIds.length === totalIds.length;
  const hasSelection = selectedIds.length > 0;

  const bulk = useBulkFriendshipMutation();

  // 二次确认 dialog 打开时硬件 Back 应先关 dialog；pending 中（正在写）不拦
  // 避免打断本来就要完成的写入。注册晚于父页 bulkMode 那条 → 优先级更高。
  useEffect(() => {
    if (!showTagDialog && !showDeleteDialog) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      if (bulk.isPending) {
        return false;
      }
      if (showTagDialog) {
        event.preventDefault();
        setShowTagDialog(false);
        return true;
      }
      if (showDeleteDialog) {
        event.preventDefault();
        setShowDeleteDialog(false);
        return true;
      }
      return false;
    });
    return unregister;
  }, [showTagDialog, showDeleteDialog, bulk.isPending]);

  const flushNotice = (success: boolean, action: string, failedCount = 0) => {
    // 部分失败也是错——走 danger tone 才能跟"操作成功"区分。这条以前 setNotice
    // 走 info tone，结果"部分操作失败"画成蓝条，跟"打标签：操作成功"长得一样。
    if (success) {
      setNotice?.(`${action}${t(msg`：操作成功`)}`);
      return;
    }
    // 把失败数量带进 notice：以前光说"部分操作失败"，但用户不知道是 1 个失败还是
    // 半数失败；带计数 + 把选区收敛到失败那几条之后用户能直接看到红字 + 哪几个
    // 还高亮着。
    setNoticeError?.(
      failedCount > 0
        ? `${action}${t(msg`：${failedCount} 项操作失败`)}`
        : t(msg`部分操作失败`),
    );
  };

  // success 完成路径，partial 失败时把 bulk 模式留着、选区只剩失败那几个。
  const handleResult = (
    res: { failed: string[] },
    action: string,
  ) => {
    const partial = res.failed.length > 0;
    flushNotice(!partial, action, res.failed.length);
    if (partial && onPartialFailure) {
      onPartialFailure(res.failed);
      return;
    }
    onDone();
  };

  // 整条 mutation 直接 reject（网络抖断 / 401 / 500）时之前没有 UI 反馈：bar 不
  // 退出、按钮卡在 pending 看着像点击没生效。这里统一兜一条 danger notice，错误
  // 详情交给上层 setNoticeError 渲染；同时不调 onDone()，保留批量选择让用户重试。
  const flushError = (action: string, error: unknown) => {
    const reason = error instanceof Error && error.message.trim()
      ? `：${error.message.trim()}`
      : "";
    setNoticeError?.(`${action}${t(msg`：操作失败`)}${reason}`);
  };

  const runStar = (starred: boolean) => {
    if (!hasSelection) return;
    const actionLabel = starred ? t(msg`设星标`) : t(msg`取消星标`);
    bulk.mutate(
      {
        characterIds: selectedIds,
        action: starred ? "star" : "unstar",
      },
      {
        onSuccess: (res) => handleResult(res, actionLabel),
        onError: (error) => {
          flushError(actionLabel, error);
        },
      },
    );
  };

  const runTag = () => {
    const tag = tagDraft.trim();
    if (!tag || !hasSelection) {
      setShowTagDialog(false);
      return;
    }
    bulk.mutate(
      {
        characterIds: selectedIds,
        action: "add-tag",
        tag,
      },
      {
        onSuccess: (res) => {
          setShowTagDialog(false);
          // 仅在全部成功时清 tagDraft；部分失败时保留用户刚才打的 tag，
          // 配合 retainBulkFailures 把选区收敛到失败那几条之后，用户重开
          // dialog 看到原来的 tag 还在，直接点确定即可重试，不用重打
          // "初中同学"、"客户"这种长 tag 一遍。
          if (res.failed.length === 0) {
            setTagDraft("");
          }
          handleResult(res, t(msg`打标签`));
        },
        onError: (error) => {
          flushError(t(msg`打标签`), error);
          setShowTagDialog(false);
        },
      },
    );
  };

  const runDelete = () => {
    if (!hasSelection) return;
    bulk.mutate(
      {
        characterIds: selectedIds,
        action: "delete",
      },
      {
        onSuccess: (res) => {
          setShowDeleteDialog(false);
          handleResult(res, t(msg`删除`));
        },
        onError: (error) => {
          flushError(t(msg`删除`), error);
          setShowDeleteDialog(false);
        },
      },
    );
  };

  const buttons = [
    {
      key: "tag",
      label: t(msg`打标签`),
      icon: TagIcon,
      onClick: () => setShowTagDialog(true),
    },
    {
      key: "star",
      label: t(msg`设星标`),
      icon: Star,
      onClick: () => runStar(true),
    },
    {
      key: "delete",
      label: t(msg`删除`),
      icon: Trash2,
      onClick: () => setShowDeleteDialog(true),
      danger: true,
    },
  ];

  return (
    <>
      <div
        className={cn(
          "z-40 border-t border-[color:var(--border-faint)] bg-white/96 backdrop-blur-md",
          // 手机端用 sticky 而不是 fixed，否则会盖到 MobileShell 底部 4 tab 上半
          // （tab 栏比 bulk bar 高 ~10px，会露出半截 tab icon 在 bulk bar 下方）。
          // 改成 sticky bottom-0 后会粘在 MobileViewportPane 滚动容器底部，正好在 tab 栏之上。
          desktop ? "" : "sticky bottom-0 pb-[env(safe-area-inset-bottom,0px)]",
        )}
      >
        {/* desktop 时这条 bar 嵌在 320px 宽的左栏底部，4 个按钮（全选 / 打标签 /
            设星标 / 删除）+ 图标 + gap + 内边距加起来超过 320px，浏览器原本会把文字
            折行成「打标 / 签」「删 / 除」。强制 whitespace-nowrap + shrink-0 +
            desktop 收紧 padding/gap 后，4 颗按钮正好能塞进 320px。 */}
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <button
            type="button"
            onClick={allSelected ? onClearSelection : onSelectAll}
            // bulk.isPending 时也锁住"全选 / 取消全选"：动作按钮（打标签/星标/删除）
            // 已经按 isPending 锁了，但 全选 漏了。在删除请求 in-flight 时点全选会
            // 把 bulkSelectedIds 立刻盖成 totalIds，等 onSuccess→handleResult
            // 回来时 onPartialFailure(res.failed) 又把它覆盖成"上一轮的失败集合"，
            // 用户看着像"我点了全选但只剩几个高亮"，根本对不上。
            disabled={!totalIds.length || bulk.isPending}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[color:var(--border-subtle)] bg-white text-[12px] text-[color:var(--text-secondary)] disabled:opacity-50",
              desktop ? "px-2.5" : "px-3",
            )}
          >
            <CheckCheck size={13} />
            {allSelected ? t(msg`取消全选`) : t(msg`全选`)}
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {buttons.map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={btn.onClick}
                  disabled={!hasSelection || bulk.isPending}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full text-[12px] font-medium",
                    desktop ? "px-2.5" : "px-3",
                    btn.danger
                      ? "bg-[#fef2f2] text-[#d74b45] disabled:opacity-50"
                      : "bg-[#07c160] text-white disabled:opacity-50",
                  )}
                >
                  <Icon size={13} />
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showTagDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
          {/* 新一轮走查：bulk.isPending 时禁用 backdrop close + cancel + 确定。
              原写法只锁了 确定 按钮，cancel + 点空白处都没拦：mutation 在飞 8s
              的弱网场景下用户随手点取消，dialog 关掉，请求继续在后台写完，看着
              像"取消失败"。Android 硬件 Back 已经在 isPending 时返回 false 不拦，
              这三处对齐就行为一致。 */}
          <button
            type="button"
            aria-label={t(msg`关闭`)}
            onClick={() => {
              if (bulk.isPending) return;
              setShowTagDialog(false);
            }}
            disabled={bulk.isPending}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-[420px] overflow-hidden rounded-[16px] bg-white shadow-[var(--shadow-overlay)]">
            <div className="border-b border-[color:var(--border-faint)] px-5 py-3 text-[15px] font-medium text-[color:var(--text-primary)]">
              {t(msg`打标签`)}
            </div>
            <div className="px-5 py-4">
              <input
                type="text"
                autoFocus
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder={t(msg`标签名称`)}
                disabled={bulk.isPending}
                // maxLength=20: 后端 normalizeTags 没 length 限制，前端没卡的话
                // 用户复制粘贴一段 5000 字进来照样 commit 到 friendship.tags（JSON
                // 字段），后续好友卡片 / 编辑 / 桌面 tags pane 渲染都会被这条
                // 超长 tag 撑爆布局。20 字符跟微信"打标签"上限对齐，常用 tag
                // 名（朋友、家人、同事、客户、初中同学 …）都够。
                maxLength={20}
                // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
                // zoom-in，autoFocus 一打开就抖；text-[14px] 时还会把 dialog
                // 推出可视区一截。
                className="h-10 w-full rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 text-[16px] text-[color:var(--text-primary)] outline-none focus:border-[#07c160] disabled:opacity-60"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-[color:var(--text-muted)]">
                <span>{t(msg`已选 ${selectedIds.length} 项`)}</span>
                <span className="text-[color:var(--text-dim)]">
                  {tagDraft.length}/20
                </span>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTagDialog(false)}
                  disabled={bulk.isPending}
                  className="h-9 rounded-full border border-[color:var(--border-faint)] bg-white px-4 text-[13px] text-[color:var(--text-secondary)] disabled:opacity-50"
                >
                  {t(msg`取消`)}
                </button>
                <button
                  type="button"
                  onClick={runTag}
                  disabled={!tagDraft.trim() || bulk.isPending}
                  className="h-9 rounded-full bg-[#07c160] px-4 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {bulk.isPending ? t(msg`处理中...`) : t(msg`确定`)}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
          {/* 新一轮走查：删除是不可逆操作，pending 时锁 backdrop + 取消尤其重要。
              用户点了删除按钮发现选错人，第一反应可能去点空白处或取消想撤销，
              但批量删除已经在后端逐个 deleteFriend，关 dialog 也救不回。这里
              保留拦截让用户至少知道"正在执行中"。 */}
          <button
            type="button"
            aria-label={t(msg`关闭`)}
            onClick={() => {
              if (bulk.isPending) return;
              setShowDeleteDialog(false);
            }}
            disabled={bulk.isPending}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-[380px] overflow-hidden rounded-[16px] bg-white shadow-[var(--shadow-overlay)]">
            <div className="px-5 py-5 text-center">
              <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                {t(msg`确定删除选中的 ${selectedIds.length} 个朋友？`)}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-muted)]">
                {t(msg`删除后将不会通知对方，可重新添加。`)}
              </p>
            </div>
            <div className="grid grid-cols-2 border-t border-[color:var(--border-faint)]">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                disabled={bulk.isPending}
                className="h-11 text-[14px] text-[color:var(--text-secondary)] disabled:opacity-50"
              >
                {t(msg`取消`)}
              </button>
              <button
                type="button"
                onClick={runDelete}
                disabled={bulk.isPending}
                className="h-11 border-l border-[color:var(--border-faint)] text-[14px] font-medium text-[#d74b45] disabled:opacity-50"
              >
                {bulk.isPending ? t(msg`处理中...`) : t(msg`删除`)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
