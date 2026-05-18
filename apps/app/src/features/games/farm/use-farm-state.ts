import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyFarmFertilizer,
  applyFarmPesticide,
  buyFarmConsumable,
  buyFarmDecoration,
  buyFarmDog,
  buyFarmSeed,
  claimFarmQuest,
  debugFarmPlot,
  doFarmCheckin,
  feedFarmDog,
  getFarmCheckin,
  getFarmEvents,
  getFarmLeaderboard,
  getFarmNeighborDetail,
  getFarmNeighbors,
  getFarmQuests,
  getFarmState,
  giftFarmCoins,
  giftFarmItem,
  harvestFarmPlot,
  placeFarmDecoration,
  plantFarmCrop,
  removeFarmDecoration,
  sellFarmCrop,
  stealFromNeighbor,
  uprootFarmPlot,
  waterFarmPlot,
  weedFarmPlot,
  type FarmCheckinResult,
  type FarmCheckinView,
  type FarmConsumableId,
  type FarmConsumablePurchaseResult,
  type FarmCropId,
  type FarmDecorationId,
  type FarmDecorationPlaceResult,
  type FarmDecorationPurchaseResult,
  type FarmDogPurchaseResult,
  type FarmEventView,
  type FarmGiftCoinsResult,
  type FarmGiftItemResult,
  type FarmHarvestResult,
  type FarmLeaderboardType,
  type FarmLeaderboardView,
  type FarmNeighborDetail,
  type FarmNeighborSummary,
  type FarmPlayerStateView,
  type FarmQuestClaimResult,
  type FarmQuestsView,
  type FarmStealResult,
} from "@yinjie/contracts";

const STATE_KEY = ["farm", "state"] as const;
const NEIGHBORS_KEY = ["farm", "neighbors"] as const;
const EVENTS_KEY = ["farm", "events"] as const;

export function useFarmState() {
  return useQuery<FarmPlayerStateView>({
    queryKey: STATE_KEY,
    queryFn: () => getFarmState(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useFarmNeighbors(options?: { limit?: number }) {
  return useQuery<FarmNeighborSummary[]>({
    queryKey: [...NEIGHBORS_KEY, options?.limit ?? null],
    queryFn: () => getFarmNeighbors(options),
    staleTime: 60_000,
  });
}

export function useFarmNeighborDetail(characterId: string | null | undefined) {
  return useQuery<FarmNeighborDetail>({
    queryKey: ["farm", "neighbor", characterId],
    queryFn: () => getFarmNeighborDetail(characterId as string),
    enabled: Boolean(characterId),
    staleTime: 30_000,
  });
}

export function useFarmEvents(options?: { since?: string; limit?: number }) {
  return useQuery<FarmEventView[]>({
    queryKey: [...EVENTS_KEY, options?.since ?? null, options?.limit ?? null],
    queryFn: () => getFarmEvents(options),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

// 之前每个 mutation 都 invalidateQueries(["farm"]) 把所有 farm query 全清空 →
// 单次浇水/种菜会触发 state + neighbors + events + checkin + quests + 3 tab
// leaderboard + neighbor-detail 全表 refetch。state 数据 mutation 已经返回了，
// 别的大多数 query 跟动作无关。
// 按动作类型分类：
//   • plotAction      只 setData state + 让 events stale，邻居/排行榜/签到/任务全不动
//   • withLeaderboard 同 plotAction，再把 leaderboard 拉一遍（harvest/buy-dog 可能升级）
//   • neighborTouch   同 plotAction，再把 neighbors / 当前 neighbor-detail 拉一遍
//                     （steal/gift 都会影响对方好感与排行）
//   • checkinClaim    state + checkin
//   • questClaim      state + quests
function useApplyFarmMutation() {
  const queryClient = useQueryClient();
  return (
    nextState: FarmPlayerStateView,
    mode:
      | "plotAction"
      | "withLeaderboard"
      | "neighborTouch"
      | "checkinClaim"
      | "questClaim",
    extra?: { touchCharacterId?: string },
  ) => {
    queryClient.setQueryData(STATE_KEY, nextState);
    // 新事件几乎所有动作都会写一条；只 invalidate events 而不立即 fetch — 等
    // EventLogPanel 下一次 refocus/重渲染时 React Query 看见 stale 再拉。
    queryClient.invalidateQueries({ queryKey: EVENTS_KEY, refetchType: "active" });
    if (mode === "withLeaderboard") {
      queryClient.invalidateQueries({ queryKey: ["farm", "leaderboard"], refetchType: "active" });
    }
    if (mode === "neighborTouch") {
      queryClient.invalidateQueries({ queryKey: NEIGHBORS_KEY, refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["farm", "leaderboard"], refetchType: "active" });
      if (extra?.touchCharacterId) {
        queryClient.invalidateQueries({
          queryKey: ["farm", "neighbor", extra.touchCharacterId],
          refetchType: "active",
        });
      }
    }
    if (mode === "checkinClaim") {
      queryClient.invalidateQueries({ queryKey: ["farm", "checkin"], refetchType: "active" });
    }
    if (mode === "questClaim") {
      queryClient.invalidateQueries({ queryKey: ["farm", "quests"], refetchType: "active" });
    }
  };
}

export function usePlantFarmCrop() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { plotIndex: number; cropId: FarmCropId }) =>
      plantFarmCrop(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useWaterFarmPlot() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { plotIndex: number; characterId?: string }) =>
      waterFarmPlot(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useWeedFarmPlot() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { plotIndex: number; characterId?: string }) =>
      weedFarmPlot(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useDebugFarmPlot() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { plotIndex: number; characterId?: string }) =>
      debugFarmPlot(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useHarvestFarmPlot() {
  const apply = useApplyFarmMutation();
  return useMutation<FarmHarvestResult, Error, { plotIndex: number }>({
    mutationFn: (input) => harvestFarmPlot(input),
    onSuccess: (res) => apply(res.player, "withLeaderboard"),
  });
}

export function useBuyFarmSeed() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { cropId: FarmCropId; quantity: number }) =>
      buyFarmSeed(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useSellFarmCrop() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { cropId: FarmCropId; quantity: number }) =>
      sellFarmCrop(input),
    onSuccess: (next) => apply(next, "withLeaderboard"),
  });
}

export function useStealFromNeighbor() {
  const apply = useApplyFarmMutation();
  return useMutation<FarmStealResult, Error, { characterId: string; plotIndex: number }>({
    mutationFn: (input) => stealFromNeighbor(input),
    onSuccess: (res, vars) =>
      apply(res.player, "neighborTouch", { touchCharacterId: vars.characterId }),
  });
}

export function useBuyFarmConsumable() {
  const apply = useApplyFarmMutation();
  return useMutation<
    FarmConsumablePurchaseResult,
    Error,
    { consumableId: FarmConsumableId; quantity: number }
  >({
    mutationFn: (input) => buyFarmConsumable(input),
    onSuccess: (res) => apply(res.player, "plotAction"),
  });
}

export function useApplyFarmFertilizer() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { plotIndex: number }) => applyFarmFertilizer(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useApplyFarmPesticide() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { plotIndex: number }) => applyFarmPesticide(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useBuyFarmDog() {
  const apply = useApplyFarmMutation();
  return useMutation<FarmDogPurchaseResult, Error, void>({
    mutationFn: () => buyFarmDog(),
    onSuccess: (res) => apply(res.player, "plotAction"),
  });
}

export function useFeedFarmDog() {
  const apply = useApplyFarmMutation();
  return useMutation<FarmPlayerStateView, Error, void>({
    mutationFn: () => feedFarmDog(),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useUprootFarmPlot() {
  const apply = useApplyFarmMutation();
  return useMutation({
    mutationFn: (input: { plotIndex: number }) => uprootFarmPlot(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useBuyFarmDecoration() {
  const apply = useApplyFarmMutation();
  return useMutation<
    FarmDecorationPurchaseResult,
    Error,
    { decorationId: FarmDecorationId; quantity: number }
  >({
    mutationFn: (input) => buyFarmDecoration(input),
    onSuccess: (res) => apply(res.player, "plotAction"),
  });
}

export function usePlaceFarmDecoration() {
  const apply = useApplyFarmMutation();
  return useMutation<
    FarmDecorationPlaceResult,
    Error,
    { decorationId: FarmDecorationId; x: number; y: number }
  >({
    mutationFn: (input) => placeFarmDecoration(input),
    onSuccess: (res) => apply(res.player, "plotAction"),
  });
}

export function useRemoveFarmDecoration() {
  const apply = useApplyFarmMutation();
  return useMutation<FarmPlayerStateView, Error, { placementId: string }>({
    mutationFn: (input) => removeFarmDecoration(input),
    onSuccess: (next) => apply(next, "plotAction"),
  });
}

export function useFarmLeaderboard(type: FarmLeaderboardType) {
  return useQuery<FarmLeaderboardView>({
    queryKey: ["farm", "leaderboard", type],
    queryFn: () => getFarmLeaderboard({ type }),
    staleTime: 30_000,
  });
}

export function useGiftFarmCoins() {
  const apply = useApplyFarmMutation();
  return useMutation<
    FarmGiftCoinsResult,
    Error,
    { characterId: string; amount: number }
  >({
    mutationFn: (input) => giftFarmCoins(input),
    onSuccess: (res, vars) =>
      apply(res.player, "neighborTouch", { touchCharacterId: vars.characterId }),
  });
}

export function useGiftFarmItem() {
  const apply = useApplyFarmMutation();
  return useMutation<
    FarmGiftItemResult,
    Error,
    {
      characterId: string;
      itemKind: "crop" | "seed" | "consumable";
      itemId: string;
      quantity: number;
    }
  >({
    mutationFn: (input) => giftFarmItem(input),
    onSuccess: (res, vars) =>
      apply(res.player, "neighborTouch", { touchCharacterId: vars.characterId }),
  });
}

export function useFarmCheckin() {
  return useQuery<FarmCheckinView>({
    queryKey: ["farm", "checkin"],
    queryFn: () => getFarmCheckin(),
    staleTime: 60_000,
  });
}

export function useDoFarmCheckin() {
  const apply = useApplyFarmMutation();
  return useMutation<FarmCheckinResult, Error, void>({
    mutationFn: () => doFarmCheckin(),
    onSuccess: (res) => apply(res.player, "checkinClaim"),
  });
}

export function useFarmQuests() {
  return useQuery<FarmQuestsView>({
    queryKey: ["farm", "quests"],
    queryFn: () => getFarmQuests(),
    staleTime: 30_000,
  });
}

export function useClaimFarmQuest() {
  const apply = useApplyFarmMutation();
  return useMutation<FarmQuestClaimResult, Error, { questId: string }>({
    mutationFn: (input) => claimFarmQuest(input),
    onSuccess: (res) => apply(res.player, "questClaim"),
  });
}
