/**
 * 批量解析 userId → username 给历史/审核/最近修改卡片用。
 * recent-changes、pending-reviews、character-page 上的修订卡之前直接渲染 editorUserId
 * 那串 UUID，2026-05-16 走查时把它替换成 username。
 *
 * 用 React Query 缓存：同一批次 ids 命中同一个 query key（排序后 join），
 * 命中率高于"逐个 user 单独 query"。返回 Map<id, username>，找不到的 id 自动回落到 UUID。
 */
import { useMemo } from "react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useQuery } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { wikiApi } from "./wiki-api";
import { getToken } from "./auth-store";

// 系统账号（userType=system）的 username 走 `__system_*__` 双下划线约定，
// 直接渲染会在 recent-changes / 审核卡上漏出 "__system_wiki_antivandal_bot__"
// 这种带下划线的内部句柄（2026-05-25 走查发现：反破坏机器人回滚破坏后即如此）。
// 映射成友好本地化名；未知系统账号回落到「系统账号」，绝不漏 __…__ 原样。
const SYSTEM_DISPLAY_NAMES: Record<string, MessageDescriptor> = {
  __system_wiki_antivandal_bot__: msg`反破坏机器人`,
  __system_wiki_admin_sync__: msg`管理同步`,
};

function friendlyName(username: string): string {
  const hit = SYSTEM_DISPLAY_NAMES[username];
  if (hit) return translateRuntimeMessage(hit);
  if (/^__.*__$/.test(username)) return translateRuntimeMessage(msg`系统账号`);
  return username;
}

export function useUsernameMap(rawIds: Array<string | null | undefined>) {
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const id of rawIds) {
      if (typeof id === "string" && id.length > 0) set.add(id);
    }
    return Array.from(set).sort();
  }, [rawIds]);

  const key = ids.join(",");
  const hasToken = Boolean(getToken());
  const q = useQuery({
    queryKey: ["wiki", "username-map", key],
    queryFn: () => wikiApi.lookupUsers(ids),
    // 后端 /wiki/users/lookup 走 JwtAuthGuard；匿名访问会 401。
    // 未登录时直接禁用查询，让所有 id 回落到原始 UUID 文本即可。
    enabled: ids.length > 0 && hasToken,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const row of q.data ?? []) {
      // 系统账号映射成友好名，避免 __system_*__ 句柄漏进 UI。
      map.set(row.id, friendlyName(row.username));
    }
    return {
      map,
      // 未命中（用户被删 / 外部账号 / 系统操作）时回落到短哈希形式 #abcd1234，
      // 让 UI 永远不会漏出 36 字符的整串 UUID。
      resolve(id: string | null | undefined): string {
        if (!id) return "";
        const hit = map.get(id);
        if (hit) return hit;
        return `#${id.slice(0, 8)}`;
      },
    };
  }, [q.data]);
}
