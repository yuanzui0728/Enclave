import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  bulkFriendshipAction,
  type BulkFriendshipRequest,
} from "@yinjie/contracts";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function useBulkFriendshipMutation(onDone?: () => void) {
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  return useMutation({
    mutationFn: (payload: BulkFriendshipRequest) =>
      bulkFriendshipAction(payload, baseUrl),
    onSuccess: (_data, variables) => {
      // 走查 R1：app-friends-quick-start / app-group-friends 全代码库无 useQuery 订阅。
      // 新一轮走查 R1：bulk delete / block 把好友 status 翻成 removed/blocked，
      // moments/feed 链路在 friend filter 里把这些条目过滤掉；之前只清了
      // app-friends 等关系态 query，没清 app-moments* / app-feed*——用户在
      // 批量管理里删了 5 个朋友 → 退出 bulkMode → 跳到 /tabs/moments，被删
      // 好友的旧帖子依旧露在自己时间线，直到 useQuery 默认 staleTime 过期或
      // 手动刷新。
      // R2 复检：只在 delete / block 时一并清 moments/feed。tag/star/unstar 改
      // 的是 friendship.tags / isStarred，moments 渲染不读这些字段，加进 predicate
      // 是无谓的全局 refetch（每个标 1 项也得把所有 moments / feed 缓存翻一遍）。
      const needsMomentsFeedFlush =
        variables.action === "delete" || variables.action === "block";
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const k = String(query.queryKey?.[0] ?? "");
          const baseHit =
            k === "app-friends" ||
            k === "app-friend-requests" ||
            k === "app-contacts-blocked" ||
            k === "app-conversations" ||
            k === "app-chat-details-blocked" ||
            k === "app-chat-blocked-characters";
          if (baseHit) return true;
          if (!needsMomentsFeedFlush) return false;
          return (
            k === "app-moments" ||
            k === "app-moments-paged" ||
            k === "app-moments-character" ||
            k === "app-feed" ||
            k === "app-feed-paged" ||
            k === "app-feed-post"
          );
        },
      });
      onDone?.();
    },
  });
}
