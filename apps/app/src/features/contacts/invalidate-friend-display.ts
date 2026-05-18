import type { QueryClient } from "@tanstack/react-query";

// 备注/标签更新后，凡是后端会按 viewer 备注重新解析作者名/会话标题的查询，
// 都得 invalidate 一遍，否则界面还会用旧缓存里那份未带备注的字段。
export async function invalidateFriendDisplayQueries(
  queryClient: QueryClient,
  baseUrl?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] }),
    queryClient.invalidateQueries({
      queryKey: ["app-conversation-messages", baseUrl],
    }),
    queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-moments-paged", baseUrl] }),
    // 走查新 R1：移动端单角色朋友圈页 (mobile-friend-moments-page) 用的是
    // ["app-moments-character", baseUrl, characterId] 这个独立 queryKey，
    // 之前没在这里 invalidate。改完 remarkName/tags 再回到 /friend-moments/$id
    // 会用旧缓存里"未带备注"的 authorName 渲染——和 profile-moments-page、
    // moments-page 已经在用的 invalidate 范围对齐。
    queryClient.invalidateQueries({
      queryKey: ["app-moments-character", baseUrl],
    }),
    queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-feed-paged", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] }),
  ]);
}

// 走查第五轮 R2 复检：朋友权限三个开关（momentsHiddenFromMe /
// momentsHiddenFromThem / chatOnly）只影响"可见性"，不改任何消息文本 /
// 备注，所以不能跟 invalidateFriendDisplayQueries 共用——后者会一并清掉
// app-conversation-messages，权限改一下就把所有打开的 chat view 全量重拉
// 全部消息，体验很差。这里单独走 friends + 所有 moments / feed 变体，
// conversation 元数据由 app-friends 链路驱动，不必碰消息缓存。
export async function invalidateFriendVisibilityQueries(
  queryClient: QueryClient,
  baseUrl?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-moments-paged", baseUrl] }),
    queryClient.invalidateQueries({
      queryKey: ["app-moments-character", baseUrl],
    }),
    queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-feed-paged", baseUrl] }),
    queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] }),
  ]);
}
