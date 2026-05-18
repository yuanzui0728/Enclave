import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buyParkingWarCar,
  claimParkingWarDailyBonus,
  claimParkingWarDailyTask,
  collectParkingWarSlot,
  getParkingWarEvents,
  getParkingWarLeaderboard,
  getParkingWarNeighborDetail,
  getParkingWarNeighbors,
  getParkingWarState,
  paintParkingWarCar,
  parkParkingWarCar,
  recallParkingWarCar,
  repairParkingWarCar,
  ticketParkingWarOccupancy,
  towParkingWarOccupancy,
  upgradeParkingWarCar,
  upgradeParkingWarGarage,
  upgradeParkingWarLot,
  type ParkingWarCarTier,
  type ParkingWarDailyBonusResult,
  type ParkingWarEventView,
  type ParkingWarLeaderboardRow,
  type ParkingWarLotSurface,
  type ParkingWarNeighborDetail,
  type ParkingWarNeighborSummary,
  type ParkingWarPlayerStateView,
  type ParkingWarRarity,
} from "@yinjie/contracts";

const STATE_KEY = ["parking-war", "state"] as const;
const NEIGHBORS_KEY = ["parking-war", "neighbors"] as const;
const EVENTS_KEY = ["parking-war", "events"] as const;
const LEADERBOARD_KEY = ["parking-war", "leaderboard"] as const;

export function useParkingWarState() {
  return useQuery<ParkingWarPlayerStateView>({
    queryKey: STATE_KEY,
    queryFn: () => getParkingWarState(),
    // 服务端每次 GET /state 都跑一次 tick，所以前端不必频繁 poll；
    // 30s stale 是个折中，玩家来回切 tab 时只要 staleTime 过期就再拉一次看新 pending。
    // 玩家长开页面挂机时，每 60s 静默拉一次让累计收益数字保持鲜活
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useParkingWarNeighbors(options?: { limit?: number }) {
  return useQuery<ParkingWarNeighborSummary[]>({
    queryKey: [...NEIGHBORS_KEY, options?.limit ?? null] as const,
    queryFn: () => getParkingWarNeighbors(options),
    staleTime: 60_000,
  });
}

export function useParkingWarNeighborDetail(
  characterId: string | null | undefined,
) {
  return useQuery<ParkingWarNeighborDetail>({
    queryKey: ["parking-war", "neighbor", characterId ?? "_"] as const,
    queryFn: () => getParkingWarNeighborDetail(characterId!),
    enabled: !!characterId,
    staleTime: 15_000,
  });
}

export function useParkingWarEvents(options?: {
  since?: string;
  limit?: number;
}) {
  return useQuery<ParkingWarEventView[]>({
    queryKey: [
      ...EVENTS_KEY,
      options?.since ?? null,
      options?.limit ?? null,
    ] as const,
    queryFn: () => getParkingWarEvents(options),
    staleTime: 15_000,
  });
}

export function useParkingWarLeaderboard(options?: {
  scope?: "global" | "friends";
  limit?: number;
}) {
  return useQuery<ParkingWarLeaderboardRow[]>({
    queryKey: [
      ...LEADERBOARD_KEY,
      options?.scope ?? "friends",
      options?.limit ?? 50,
    ] as const,
    queryFn: () => getParkingWarLeaderboard(options),
    staleTime: 30_000,
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: STATE_KEY });
    qc.invalidateQueries({ queryKey: NEIGHBORS_KEY });
    qc.invalidateQueries({ queryKey: EVENTS_KEY });
    qc.invalidateQueries({ queryKey: LEADERBOARD_KEY });
    qc.invalidateQueries({ queryKey: ["parking-war", "neighbor"] });
  };
}

export function useParkParkingWarCar() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: {
      carId: string;
      slotIndex: number;
      characterId?: string;
    }) => parkParkingWarCar(input),
    onSuccess: invalidate,
  });
}

export function useRecallParkingWarCar() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { occupancyId: string }) => recallParkingWarCar(input),
    onSuccess: invalidate,
  });
}

export function useCollectParkingWarSlot() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { slotIndex?: number }) => collectParkingWarSlot(input),
    onSuccess: invalidate,
  });
}

export function useTicketParkingWarOccupancy() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { occupancyId: string }) =>
      ticketParkingWarOccupancy(input),
    onSuccess: invalidate,
  });
}

export function useTowParkingWarOccupancy() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { occupancyId: string }) =>
      towParkingWarOccupancy(input),
    onSuccess: invalidate,
  });
}

export function useBuyParkingWarCar() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: {
      tier: ParkingWarCarTier;
      rarity: ParkingWarRarity;
    }) => buyParkingWarCar(input),
    onSuccess: invalidate,
  });
}

export function useUpgradeParkingWarCar() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { carId: string }) => upgradeParkingWarCar(input),
    onSuccess: invalidate,
  });
}

export function usePaintParkingWarCar() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { carId: string; paintIndex: number }) =>
      paintParkingWarCar(input),
    onSuccess: invalidate,
  });
}

export function useRepairParkingWarCar() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { carId: string }) => repairParkingWarCar(input),
    onSuccess: invalidate,
  });
}

export function useUpgradeParkingWarLot() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: {
      target: "size" | "surface";
      value: number | ParkingWarLotSurface;
    }) => upgradeParkingWarLot(input),
    onSuccess: invalidate,
  });
}

export function useUpgradeParkingWarGarage() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: () => upgradeParkingWarGarage(),
    onSuccess: invalidate,
  });
}

export function useClaimParkingWarDailyBonus() {
  const invalidate = useInvalidateAll();
  return useMutation<ParkingWarDailyBonusResult, Error, void>({
    mutationFn: () => claimParkingWarDailyBonus(),
    onSuccess: invalidate,
  });
}

export function useClaimParkingWarDailyTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { taskId: string }) => claimParkingWarDailyTask(input),
    onSuccess: invalidate,
  });
}
