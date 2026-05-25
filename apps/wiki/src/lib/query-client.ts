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
      // 默认 retry:1 会把 4xx 也重试一次：404（角色不存在）/403（无权限）/401/
      // 400（校验）/429（频率）重试只会原样再失败，但用户要多等一次 ~1s backoff
      // 才看到错误条（实测 char 详情打开不存在角色 → 错误文案延迟 1.5s 出现），
      // 还白打一次无效请求。4xx 客户端错误结果不会变，直接不重试；只对 5xx /
      // 网络错误（WikiApiError.status=0 或非 WikiApiError 的抛错）重试一次。
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});
