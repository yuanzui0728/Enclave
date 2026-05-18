// i18n-ignore-start: data / seed / preset content — not user-facing UI.

export type ParkingWarCarTier =
  | 'starter'
  | 'family'
  | 'business'
  | 'performance'
  | 'luxury'
  | 'super';

export type ParkingWarRarity = 'common' | 'rare' | 'epic' | 'legend';

export type ParkingWarLotSurface = 'concrete' | 'grass' | 'asphalt' | 'vip';

export type ParkingWarActorKind = 'player' | 'npc';

export type ParkingWarEventKind =
  | 'park'
  | 'recall'
  | 'collect'
  | 'warning'
  | 'ticket'
  | 'tow'
  | 'buy_car'
  | 'upgrade_car'
  | 'paint_car'
  | 'repair_car'
  | 'upgrade_lot'
  | 'daily_bonus'
  | 'task_claim'
  | 'npc_visit'
  | 'incident_broadcast';

export interface ParkingWarCarParkedRef {
  occupancyId: string;
  lotOwnerKind: ParkingWarActorKind;
  lotOwnerId: string;
  slotIndex: number;
  parkedAtMs: number;
}

export interface ParkingWarOwnedCar {
  carId: string;
  tier: ParkingWarCarTier;
  rarity: ParkingWarRarity;
  level: number;
  paintIndex: number;
  durability: number;
  plate?: string | null;
  parkedRef?: ParkingWarCarParkedRef | null;
  unavailableUntilMs?: number | null;
}

export interface ParkingWarHomeSlot {
  index: number;
  occupancyId: string | null;
}

export interface ParkingWarMood {
  aggressiveness: number;
  ticketStrictness: number;
  towPropensity: number;
  lastVisitAtMs: number | null;
}

export interface ParkingWarDailyTask {
  id: string;
  progress: number;
  goal: number;
  claimed: boolean;
  rewardCents: number;
}

export interface ParkingWarDailyTasksPayload {
  dateKey: string;
  tasks: ParkingWarDailyTask[];
}

export interface ParkingWarOccupancyView {
  occupancyId: string;
  lotOwnerKind: ParkingWarActorKind;
  lotOwnerId: string;
  lotOwnerName?: string | null;
  slotIndex: number;
  visitorKind: ParkingWarActorKind;
  visitorId: string;
  visitorName?: string | null;
  carId: string;
  carTier: ParkingWarCarTier;
  carRarity: ParkingWarRarity;
  carLevel: number;
  carPaintIndex?: number;
  carPlate?: string | null;
  parkedAtMs: number;
  pendingEarningsCents: number;
  warningLevel: number;
  warnedAtMs?: number | null;
  ticketedAtMs?: number | null;
  towableAtMs?: number | null;
}

export interface ParkingWarPlayerStateView {
  ownerId: string;
  balanceCents: number;
  totalEarnedCents: number;
  garageSlots: number;
  lotSize: number;
  lotSurface: ParkingWarLotSurface;
  lotMultiplierBp: number;
  ownedCars: ParkingWarOwnedCar[];
  homeSlots: ParkingWarHomeSlot[];
  homeOccupancies: ParkingWarOccupancyView[];
  awayOccupancies: ParkingWarOccupancyView[];
  streakDays: number;
  lastDailyBonusKey: string | null;
  dailyBonusAvailable: boolean;
  dailyShieldRemaining: number;
  dailyTasks: ParkingWarDailyTask[];
  serverNowMs: number;
  updatedAt: string;
}

export interface ParkingWarNeighborSummary {
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  intimacyLevel: number;
  isOnline: boolean;
  balanceCents: number;
  lotSize: number;
  lotSurface: ParkingWarLotSurface;
  emptySlotCount: number;
  topCarTier: ParkingWarCarTier | null;
  topCarRarity: ParkingWarRarity | null;
  lastActedAt: string | null;
  relationship?: string | null;
}

export interface ParkingWarNeighborDetail extends ParkingWarNeighborSummary {
  homeSlots: ParkingWarHomeSlot[];
  homeOccupancies: ParkingWarOccupancyView[];
  recentEvents: ParkingWarEventView[];
  serverNowMs: number;
}

export interface ParkingWarEventView {
  id: string;
  kind: ParkingWarEventKind;
  actorKind: ParkingWarActorKind;
  actorId: string;
  actorName: string;
  targetKind?: ParkingWarActorKind | null;
  targetId?: string | null;
  targetName?: string | null;
  amountCents?: number | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ParkingWarLeaderboardRow {
  rank: number;
  actorKind: ParkingWarActorKind;
  actorId: string;
  actorName: string;
  actorAvatar?: string | null;
  balanceCents: number;
  totalEarnedCents: number;
  topCarTier: ParkingWarCarTier | null;
  topCarRarity: ParkingWarRarity | null;
}

export interface ParkingWarRecallResult {
  view: ParkingWarPlayerStateView;
  gainedCents: number;
  splitToHostCents: number;
}

export interface ParkingWarCollectResult {
  view: ParkingWarPlayerStateView;
  gainedCents: number;
}

export interface ParkingWarTicketResult {
  view: ParkingWarPlayerStateView;
  finedCents: number;
}

export interface ParkingWarTowResult {
  view: ParkingWarPlayerStateView;
  finedCents: number;
}

export interface ParkingWarDailyBonusResult {
  view: ParkingWarPlayerStateView;
  amountCents: number;
  streakDays: number;
}

export interface ParkingWarTickSummary {
  scannedNpcCount: number;
  npcVisitCount: number;
  warningCount: number;
  ticketCount: number;
  towCount: number;
  incidentBroadcastCount: number;
  durationMs: number;
}

// i18n-ignore-end
