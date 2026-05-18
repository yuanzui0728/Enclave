import { QueryClient } from "@tanstack/react-query";

// 默认 staleTime=0 让每次组件挂载都重新发起 fetch —— wiki 用户在
// 首页(273 角色)→ 角色详情 → 历史 → 返回首页这种典型路径里，每来回
// 一趟首页就重发一次 /wiki/pages（约 200KB 列表）。30 秒内的快速来回
// 是绝对多数操作，给个温和的 30s 默认 staleTime + 5 分钟 gcTime，
// 个别需要"始终最新"的 query（举报队列、待审）显式覆盖 staleTime: 0。
// admin / mutation 路径都走 invalidateQueries() 主动刷，不会被影响。
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});
