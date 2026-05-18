// 客户端类型沿用 @yinjie/contracts/parking-war —— Stage 7 把所有 reducer/engine 类型
// 迁到服务端，前端只保留 view DTOs。这里做一次集中 re-export，免得每个组件都跨包 import。
export type {
  ParkingWarActorKind,
  ParkingWarCarParkedRef,
  ParkingWarCarTier,
  ParkingWarCollectResult,
  ParkingWarDailyBonusResult,
  ParkingWarDailyTask,
  ParkingWarEventKind,
  ParkingWarEventView,
  ParkingWarHomeSlot,
  ParkingWarLeaderboardRow,
  ParkingWarLotSurface,
  ParkingWarNeighborDetail,
  ParkingWarNeighborSummary,
  ParkingWarOccupancyView,
  ParkingWarOwnedCar,
  ParkingWarPlayerStateView,
  ParkingWarRarity,
  ParkingWarRecallResult,
  ParkingWarTicketResult,
  ParkingWarTowResult,
} from "@yinjie/contracts";
