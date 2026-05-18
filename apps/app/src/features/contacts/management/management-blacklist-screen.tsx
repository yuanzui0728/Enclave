import { useMemo } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBlockedCharacters,
  listCharacters,
  unblockCharacter,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function ManagementBlacklistScreen() {
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();

  // 新一轮走查：modal 同时持有这两条 query 的副本（permissions-detail 屏的
  // friendsQuery + charactersQuery 也用同样 key）+ contacts-page 主入口也已经
  // 拉过一遍，每次切进黑名单屏都触发 background refetch 浪费流量。15-30s
  // staleTime 让短时复入命中缓存，unblock mutation 仍然显式 invalidate 这条 key。
  const blockedQuery = useQuery({
    queryKey: ["app-contacts-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    staleTime: 15_000,
  });
  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
    staleTime: 30_000,
  });

  const characterMap = useMemo(
    () => new Map((charactersQuery.data ?? []).map((c) => [c.id, c])),
    [charactersQuery.data],
  );

  const unblockMutation = useMutation({
    mutationFn: (characterId: string) =>
      unblockCharacter({ characterId }, baseUrl),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (q) => {
          const k = String(q.queryKey?.[0] ?? "");
          return (
            k === "app-contacts-blocked" ||
            k === "app-friends" ||
            k === "app-conversations" ||
            k === "app-chat-details-blocked" ||
            k === "app-chat-blocked-characters"
          );
        },
      });
    },
  });

  const isLoading = blockedQuery.isLoading;
  const blocked = blockedQuery.data ?? [];

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-[color:var(--text-muted)]">
        {t(msg`正在读取黑名单...`)}
      </div>
    );
  }

  // 之前没处理 isError：blockedQuery 网络失败时 data=[] 直接走"黑名单为空"
  // 分支，用户会误以为自己没有拉黑过任何人，错过实际存在的黑名单。补一个
  // 区分 error / 空态的分支，给重试按钮。
  if (blockedQuery.isError && blockedQuery.error instanceof Error) {
    return (
      <div className="px-3 py-4">
        <InlineNotice
          tone="danger"
          className="rounded-[11px] px-2.5 py-2 text-[12px] leading-5 shadow-none"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1">
              {blockedQuery.error.message || t(msg`黑名单暂时读取失败。`)}
            </span>
            <button
              type="button"
              onClick={() => void blockedQuery.refetch()}
              className="shrink-0 rounded-full border border-[rgba(220,38,38,0.18)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
            >
              {t(msg`重试读取`)}
            </button>
          </div>
        </InlineNotice>
      </div>
    );
  }

  if (!blocked.length) {
    return (
      <div className="px-6 py-12 text-center">
        <div className="mx-auto inline-flex rounded-full bg-[#eef2f6] px-3 py-1 text-[10px] font-medium text-[color:var(--text-muted)]">
          {t(msg`黑名单`)}
        </div>
        <div className="mt-3 text-[14px] font-medium text-[color:var(--text-primary)]">
          {t(msg`黑名单为空`)}
        </div>
        <p className="mx-auto mt-2 max-w-[18rem] text-[11px] leading-5 text-[color:var(--text-muted)]">
          {t(msg`被加入黑名单的联系人会出现在这里。`)}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      {unblockMutation.isError && unblockMutation.error instanceof Error ? (
        <InlineNotice
          tone="danger"
          className="mb-3 rounded-[11px] px-2.5 py-1.5 text-[11px] leading-4 shadow-none"
        >
          {unblockMutation.error.message}
        </InlineNotice>
      ) : null}
      <ul className="overflow-hidden rounded-[12px] bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        {blocked.map((entry, index) => {
          const character = characterMap.get(entry.characterId);
          // R2 走查：原 fallback 是 entry.characterId.slice(0,8)，charactersQuery 还在
          // 飞 / 角色已被删 时会把 "char-cel" "char-def" 这种 UUID 前缀当人名贴出来，
          // 头像 chip 还会用 "c" 当首字母占位。改成"未知联系人"+ avatar 走 fallback 渲染，
          // 比泄露内部 id 更友好。
          const name =
            character?.name ?? t(msg`未知联系人`);
          return (
            <li
              key={entry.id}
              className={
                index > 0
                  ? "border-t border-[color:var(--border-faint)]"
                  : undefined
              }
            >
              <div className="flex items-center gap-3 px-3 py-3">
                <AvatarChip
                  name={name}
                  src={character?.avatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                    {name}
                  </div>
                  {entry.reason ? (
                    <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
                      {entry.reason}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => unblockMutation.mutate(entry.characterId)}
                  disabled={unblockMutation.isPending}
                  className="h-8 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[12px]"
                >
                  {unblockMutation.isPending &&
                  unblockMutation.variables === entry.characterId
                    ? t(msg`处理中...`)
                    : t(msg`移出`)}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
