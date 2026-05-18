// 朋友圈 likeMutation 共享 optimistic helper。
//
// 多个页面（moments-page / friend-moments-page / profile-moments-page /
// mobile-friend-moments-page）都有 likeMutation，但 onMutate 只在 moments-page
// 里实现过。公网隧道 ~600ms RTT 下没有 optimistic 的页面，用户点心 → UI
// 等 ~600ms 才反应；这个 helper 把"多 cache key 同步 toggle"的样板封装起来，
// 5 行 + onSuccess 就接上。
//
// 必须覆盖的四把 cache：
//   - app-moments (扁平)：search index / 旧 component / 分享卡走这条
//   - app-moments-paged (分页)：/tabs/moments 主数据源
//   - app-moments-mine：/profile/moments 主数据源
//   - app-moments-character[X]：/desktop/friend-moments/X 主数据源
//
// 走查 Round 1：之前只 sync 前两把 → /profile/moments 与
// /desktop/friend-moments/X 的 likeMutation onSuccess 又故意省掉 invalidate
// ("optimistic 已切对")，结果两个页面点心后 UI 完全不动，要刷新或离开重进
// 才能看到 like 状态。跟 moments-page.tsx commentMutation 的 4-cache 同步
// pattern 对齐。

import { useCallback } from "react";
import {
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import {
  type Moment,
  type MomentsPageResponse,
} from "@yinjie/contracts";

type Snapshot = [QueryKey, unknown];

export type OptimisticLikeContext = {
  snapshots: Snapshot[];
};

export function useOptimisticMomentLikeHandlers(input: {
  baseUrl: string | undefined;
  ownerId: string | undefined | null;
  ownerUsername: string | undefined | null;
  ownerAvatar: string | undefined | null;
}) {
  const { baseUrl, ownerId, ownerUsername, ownerAvatar } = input;
  const queryClient = useQueryClient();

  const onMutate = useCallback(
    async (momentId: string): Promise<OptimisticLikeContext> => {
      if (!ownerId) return { snapshots: [] };

      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-paged", baseUrl],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-mine", baseUrl],
        }),
        queryClient.cancelQueries({
          queryKey: ["app-moments-character", baseUrl],
        }),
      ]);

      const flatSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments", baseUrl],
      });
      const pagedSnapshots = queryClient.getQueriesData<
        InfiniteData<MomentsPageResponse>
      >({
        queryKey: ["app-moments-paged", baseUrl],
      });
      const mineSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments-mine", baseUrl],
      });
      const characterSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments-character", baseUrl],
      });

      const toggleMomentLike = (moment: Moment): Moment => {
        if (moment.id !== momentId) return moment;
        const alreadyLiked = moment.likes.some(
          (like) => like.authorId === ownerId,
        );
        const nextLikes = alreadyLiked
          ? moment.likes.filter((like) => like.authorId !== ownerId)
          : [
              ...moment.likes,
              {
                id: `optimistic-${ownerId}-${moment.id}`,
                postId: moment.id,
                authorId: ownerId,
                authorName: ownerUsername ?? "",
                authorAvatar: ownerAvatar ?? "",
                authorType: "user" as const,
                createdAt: new Date().toISOString(),
              },
            ];
        return {
          ...moment,
          likes: nextLikes,
          likeCount: Math.max(0, moment.likeCount + (alreadyLiked ? -1 : 1)),
        };
      };

      flatSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(toggleMomentLike));
      });
      pagedSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map(toggleMomentLike),
          })),
        });
      });
      mineSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(toggleMomentLike));
      });
      characterSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(toggleMomentLike));
      });

      return {
        snapshots: [
          ...(flatSnapshots as unknown as Snapshot[]),
          ...(pagedSnapshots as unknown as Snapshot[]),
          ...(mineSnapshots as unknown as Snapshot[]),
          ...(characterSnapshots as unknown as Snapshot[]),
        ],
      };
    },
    [baseUrl, ownerId, ownerUsername, ownerAvatar, queryClient],
  );

  const onError = useCallback(
    (
      _err: unknown,
      _momentId: string,
      context: OptimisticLikeContext | undefined,
    ) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    [queryClient],
  );

  const invalidate = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-moments-paged", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-moments-mine", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-moments-character", baseUrl],
        }),
      ]),
    [baseUrl, queryClient],
  );

  return { onMutate, onError, invalidate };
}
