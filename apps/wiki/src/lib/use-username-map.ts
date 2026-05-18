/**
 * 批量解析 userId → username 给历史/审核/最近修改卡片用。
 * recent-changes、pending-reviews、character-page 上的修订卡之前直接渲染 editorUserId
 * 那串 UUID，2026-05-16 走查时把它替换成 username。
 *
 * 用 React Query 缓存：同一批次 ids 命中同一个 query key（排序后 join），
 * 命中率高于"逐个 user 单独 query"。返回 Map<id, username>，找不到的 id 自动回落到 UUID。
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { wikiApi } from "./wiki-api";
import { getToken } from "./auth-store";

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
      map.set(row.id, row.username);
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
