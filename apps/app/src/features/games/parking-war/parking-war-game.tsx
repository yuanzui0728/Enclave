import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import type {
  ParkingWarCarTier,
  ParkingWarLotSurface,
  ParkingWarNeighborSummary,
  ParkingWarOccupancyView,
  ParkingWarOwnedCar,
  ParkingWarPlayerStateView,
  ParkingWarRarity,
} from "@yinjie/contracts";
import {
  ArrowLeft,
  ChevronLeft,
  Coins,
  Gauge,
  Gift,
  History,
  LayoutGrid,
  ListChecks,
  Loader2,
  Palette,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  PAINT_COLORS,
  RARITY_DISPLAY,
  RARITY_ORDER,
  SURFACE_DISPLAY,
  TIER_DISPLAY,
  TIER_ORDER,
  formatRelative,
  formatYuan,
} from "./parking-war-data";
import {
  useBuyParkingWarCar,
  useClaimParkingWarDailyBonus,
  useClaimParkingWarDailyTask,
  useCollectParkingWarSlot,
  useParkParkingWarCar,
  useParkingWarEvents,
  useParkingWarLeaderboard,
  useParkingWarNeighborDetail,
  useParkingWarNeighbors,
  useParkingWarState,
  usePaintParkingWarCar,
  useRecallParkingWarCar,
  useRepairParkingWarCar,
  useTicketParkingWarOccupancy,
  useTowParkingWarOccupancy,
  useUpgradeParkingWarCar,
  useUpgradeParkingWarGarage,
  useUpgradeParkingWarLot,
} from "./use-parking-war-state";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type ParkingWarGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

type TabId = "home" | "neighbors" | "garage" | "rank";

const TABS: Array<{ id: TabId; label: string; Icon: typeof LayoutGrid }> = [
  { id: "home", label: t(msg`我的车场`), Icon: LayoutGrid },
  { id: "neighbors", label: t(msg`邻居`), Icon: Users },
  { id: "garage", label: t(msg`车库`), Icon: Wrench },
  { id: "rank", label: t(msg`榜单`), Icon: Trophy },
];

// ============================================================
// 主入口
// ============================================================

export function ParkingWarGame({
  variant = "fullscreen",
  onExit,
}: ParkingWarGameProps) {
  const { data: state, isLoading, isError } = useParkingWarState();
  const [tab, setTab] = useState<TabId>("home");
  const [toast, setToast] = useState<string | null>(null);
  // 上一条 toast 的定时器 id，新 toast 进来时先 clear，
  // 避免 A→B 连发时 A 的 timeout 把 B 提前清掉，
  // 也避免组件卸载后 setState on unmounted
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msgText: string, durationMs = 2400) => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(msgText);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  // 老 localStorage 一次性清理。旧版本（≤ Stage 6）数据完全是本机的，
  // 现在迁服务端后这些 key 没用了；保留下去只会让用户的浏览器存里多一坨
  // 永远不会被读的状态。
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const keys = ["yinjie.parking-war.v1", "yinjie.parking-war.v2"];
      const hadLegacy = keys.some((k) => window.localStorage.getItem(k));
      for (const k of keys) window.localStorage.removeItem(k);
      if (hadLegacy) {
        showToast(t(msg`原存档已废弃，已为你开通云端车场`), 3200);
      }
    } catch {
      /* private mode / quota — 静默忽略 */
    }
  }, [showToast]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-50">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-50 px-6 text-center">
        <p className="text-zinc-700">{t(msg`车场连不上服务端`)}</p>
        {onExit && (
          <button
            type="button"
            className="rounded-full bg-zinc-800 px-4 py-2 text-sm text-white"
            onClick={onExit}
          >
            {t(msg`返回`)}
          </button>
        )}
      </div>
    );
  }

  return (
    // relative 让内部 BottomTabs / Toast 的 absolute 能贴在游戏容器底部，
    // 而不是逃出去贴到 viewport。embedded 模式下游戏被装在 games-page
    // 的卡片里，fixed 定位会让 tab 栏漂到整页底部覆盖宿主导航
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-sky-50 to-amber-50",
        variant === "fullscreen" && "min-h-[100dvh]",
      )}
    >
      <TopBar state={state} onExit={onExit} onToast={showToast} />
      <div className="flex-1 overflow-y-auto pb-24">
        {tab === "home" && <HomeTab state={state} onToast={showToast} />}
        {tab === "neighbors" && (
          <NeighborsTab state={state} onToast={showToast} />
        )}
        {tab === "garage" && <GarageTab state={state} onToast={showToast} />}
        {tab === "rank" && <RankTab state={state} onToast={showToast} />}
      </div>
      <BottomTabs activeTab={tab} onChange={setTab} />
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center">
          <div className="rounded-full bg-zinc-900/90 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 顶栏
// ============================================================

function TopBar({
  state,
  onExit,
  onToast,
}: {
  state: ParkingWarPlayerStateView;
  onExit?: () => void;
  onToast: (m: string) => void;
}) {
  const claimDaily = useClaimParkingWarDailyBonus();
  const isVip = state.lotSurface === "vip";
  const surface = SURFACE_DISPLAY[state.lotSurface];
  const multiplierPct = Math.round((state.lotMultiplierBp / 10_000) * 100);

  const handleDailyBonus = async () => {
    try {
      const r = await claimDaily.mutateAsync();
      onToast(
        t(msg`日签 +${formatYuan(r.amountCents)}，连签 ${r.streakDays} 天`),
      );
    } catch (e) {
      onToast(parseError(e));
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-200/60 bg-white/70 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="-ml-2 rounded-full p-2 hover:bg-zinc-100"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft className="h-5 w-5 text-zinc-700" />
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-zinc-900">
              {t(msg`抢车位`)}
            </h1>
            <span className="text-xs text-zinc-500">
              {t(msg`完美复刻 · 服务端`)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 ring-1",
                surface.bgClass,
                surface.ringClass,
              )}
            >
              {surface.name} · {multiplierPct}%
            </span>
            {isVip && state.dailyShieldRemaining > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                <ShieldCheck className="h-3 w-3" />
                {t(msg`今日免罚 ×${state.dailyShieldRemaining}`)}
              </span>
            )}
            {state.streakDays > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
                <Sparkles className="h-3 w-3" />
                {t(msg`连签 ${state.streakDays} 天`)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-base font-semibold text-amber-700">
            <Coins className="mr-1 inline h-4 w-4" />
            {formatYuan(state.balanceCents)}
          </span>
          <button
            type="button"
            onClick={handleDailyBonus}
            disabled={!state.dailyBonusAvailable || claimDaily.isPending}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1 text-xs",
              state.dailyBonusAvailable
                ? "bg-rose-500 text-white"
                : "bg-zinc-200 text-zinc-400",
            )}
          >
            <Gift className="h-3.5 w-3.5" />
            {state.dailyBonusAvailable
              ? t(msg`领日签`)
              : t(msg`已签到`)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 底部 tab 切换器
// ============================================================

function BottomTabs({
  activeTab,
  onChange,
}: {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex justify-around border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs",
              active ? "text-amber-700" : "text-zinc-500",
            )}
          >
            <Icon className={cn("h-5 w-5", active && "fill-amber-100")} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// HOME TAB
// ============================================================

function HomeTab({
  state,
  onToast,
}: {
  state: ParkingWarPlayerStateView;
  onToast: (m: string) => void;
}) {
  // 存 occupancyId 而不是整个 ParkingWarOccupancyView。
  // 旧实现 sheet 打开后 state 刷新（60s refetchInterval / 操作 invalidate）
  // 不会同步进 activeOccupancy，pending / warningLevel 都停留在打开那一刻
  const [activeOccupancyId, setActiveOccupancyId] = useState<string | null>(
    null,
  );
  const [parkPickerSlot, setParkPickerSlot] = useState<number | null>(null);

  const slotByIndex = useMemo(() => {
    const m = new Map<number, ParkingWarOccupancyView | null>();
    for (const slot of state.homeSlots) {
      const occ =
        state.homeOccupancies.find((o) => o.slotIndex === slot.index) ?? null;
      m.set(slot.index, occ);
    }
    return m;
  }, [state.homeSlots, state.homeOccupancies]);

  // 每次 state 刷新都从最新 homeOccupancies 里找一次。occupancyId 已经不存在
  // （被 recall/tow 删了）就自动收起 sheet
  const activeOccupancy = useMemo(() => {
    if (activeOccupancyId == null) return null;
    return (
      state.homeOccupancies.find(
        (o) => o.occupancyId === activeOccupancyId,
      ) ?? null
    );
  }, [activeOccupancyId, state.homeOccupancies]);
  useEffect(() => {
    if (activeOccupancyId != null && activeOccupancy == null) {
      setActiveOccupancyId(null);
    }
  }, [activeOccupancyId, activeOccupancy]);

  // 4 -> 2x2，6 -> 2x3，8 -> 2x4，12 -> 3x4。
  // 旧版固定 3 col → 4 槽位排成 3+1，第二行只有 1 个很丑
  const cols =
    state.lotSize >= 12 ? 4 : state.lotSize >= 8 ? 4 : state.lotSize >= 6 ? 3 : 2;

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {t(msg`车位 ${state.homeOccupancies.length} / ${state.lotSize}`)}
        </span>
        <span>
          {t(msg`累计 ${formatYuan(state.totalEarnedCents)}`)}
        </span>
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
      >
        {state.homeSlots.map((slot) => {
          const occ = slotByIndex.get(slot.index) ?? null;
          return (
            <HomeSlotCard
              key={slot.index}
              slot={slot}
              occ={occ}
              ownerId={state.ownerId}
              onClickOccupied={() =>
                occ && setActiveOccupancyId(occ.occupancyId)
              }
              onClickEmpty={() => setParkPickerSlot(slot.index)}
            />
          );
        })}
      </div>
      {activeOccupancy && (
        <OccupancySheet
          occupancy={activeOccupancy}
          state={state}
          onClose={() => setActiveOccupancyId(null)}
          onToast={onToast}
        />
      )}
      {parkPickerSlot != null && (
        <CarPickerSheet
          state={state}
          slotIndex={parkPickerSlot}
          characterId={undefined}
          onClose={() => setParkPickerSlot(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function HomeSlotCard({
  slot,
  occ,
  ownerId,
  onClickOccupied,
  onClickEmpty,
}: {
  slot: { index: number; occupancyId: string | null };
  occ: ParkingWarOccupancyView | null;
  ownerId: string;
  onClickOccupied: () => void;
  onClickEmpty: () => void;
}) {
  if (!occ) {
    return (
      <button
        type="button"
        onClick={onClickEmpty}
        className="flex aspect-[4/5] flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-white/60 text-xs text-zinc-400 hover:border-amber-400 hover:text-amber-500"
      >
        <span className="text-2xl">+</span>
        <span>{t(msg`空位`)}</span>
        <span className="mt-1 text-[10px] text-zinc-300">
          #{slot.index + 1}
        </span>
      </button>
    );
  }
  const isSelf = occ.visitorKind === "player" && occ.visitorId === ownerId;
  return (
    <button
      type="button"
      onClick={onClickOccupied}
      className={cn(
        "relative flex aspect-[4/5] flex-col items-center justify-between gap-1 rounded-xl bg-white p-2 ring-1 ring-inset",
        RARITY_DISPLAY[occ.carRarity].ringClass,
      )}
    >
      <CarSprite tier={occ.carTier} rarity={occ.carRarity} size={48} />
      <div className="flex w-full flex-col gap-0.5 text-[10px]">
        <span className={cn("truncate", isSelf ? "text-zinc-600" : "text-orange-700 font-medium")}>
          {isSelf ? t(msg`我的车`) : t(msg`访客`)}
        </span>
        <span className="text-amber-700">
          ¥{(occ.pendingEarningsCents / 100).toFixed(2)}
        </span>
      </div>
      {occ.warningLevel >= 1 && (
        <WarningPill level={occ.warningLevel} />
      )}
    </button>
  );
}

function WarningPill({ level }: { level: number }) {
  const tone =
    level >= 3
      ? "bg-rose-600 text-white"
      : level >= 2
        ? "bg-orange-500 text-white"
        : "bg-amber-300 text-amber-900";
  const label =
    level >= 3 ? t(msg`可拖车`) : level >= 2 ? t(msg`罚单`) : t(msg`警告`);
  return (
    <span
      className={cn(
        "absolute -top-1 -right-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow",
        tone,
      )}
    >
      {label}
    </span>
  );
}

// 车辆 sprite —— 阶段 7 用 emoji + 稀有度光晕，阶段 9 升级成真 SVG
function CarSprite({
  tier,
  rarity,
  size = 36,
  paintIndex = 0,
}: {
  tier: ParkingWarCarTier;
  rarity: ParkingWarRarity;
  size?: number;
  paintIndex?: number;
}) {
  const display = TIER_DISPLAY[tier];
  const rarityRing = RARITY_DISPLAY[rarity].ringClass;
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full ring-2",
        rarityRing,
      )}
      style={{
        width: size,
        height: size,
        background: PAINT_COLORS[paintIndex]?.hex
          ? `radial-gradient(circle at 35% 30%, white 0%, ${PAINT_COLORS[paintIndex].hex}22 70%)`
          : undefined,
        fontSize: Math.floor(size * 0.55),
      }}
      role="img"
      aria-label={display.name}
    >
      {display.emoji}
    </div>
  );
}

// ============================================================
// 单个 occupancy 的操作面板
// ============================================================

function OccupancySheet({
  occupancy,
  state,
  onClose,
  onToast,
}: {
  occupancy: ParkingWarOccupancyView;
  state: ParkingWarPlayerStateView;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const recall = useRecallParkingWarCar();
  const ticket = useTicketParkingWarOccupancy();
  const tow = useTowParkingWarOccupancy();
  const collect = useCollectParkingWarSlot();

  const isSelf =
    occupancy.visitorKind === "player" &&
    occupancy.visitorId === state.ownerId;
  const tierName = TIER_DISPLAY[occupancy.carTier].name;
  const rarityName = RARITY_DISPLAY[occupancy.carRarity].name;

  const handleRecall = async () => {
    try {
      const r = await recall.mutateAsync({ occupancyId: occupancy.occupancyId });
      onToast(
        t(msg`车已收回，到账 ${formatYuan(r.gainedCents)}`),
      );
      onClose();
    } catch (e) {
      onToast(parseError(e));
    }
  };
  const handleCollect = async () => {
    try {
      const r = await collect.mutateAsync({ slotIndex: occupancy.slotIndex });
      onToast(t(msg`收入 ${formatYuan(r.gainedCents)}`));
      onClose();
    } catch (e) {
      onToast(parseError(e));
    }
  };
  const handleTicket = async () => {
    try {
      const r = await ticket.mutateAsync({
        occupancyId: occupancy.occupancyId,
      });
      onToast(t(msg`贴条收到 ${formatYuan(r.finedCents)}`));
      onClose();
    } catch (e) {
      onToast(parseError(e));
    }
  };
  const handleTow = async () => {
    try {
      const r = await tow.mutateAsync({ occupancyId: occupancy.occupancyId });
      onToast(t(msg`拖车费 ${formatYuan(r.finedCents)}`));
      onClose();
    } catch (e) {
      onToast(parseError(e));
    }
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center gap-3">
        <CarSprite tier={occupancy.carTier} rarity={occupancy.carRarity} size={64} />
        <div className="flex-1">
          <div className="text-base font-semibold text-zinc-900">
            {tierName} · {rarityName} · L{occupancy.carLevel}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {isSelf
              ? t(msg`你的车，停在自家车位 #${occupancy.slotIndex + 1}`)
              : t(msg`访客车，占用 #${occupancy.slotIndex + 1}`)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Stat label={t(msg`累积收益`)} value={formatYuan(occupancy.pendingEarningsCents)} />
        <Stat
          label={t(msg`占用时长`)}
          value={t(msg`${Math.max(0, Math.floor((state.serverNowMs - occupancy.parkedAtMs) / 60_000))} 分`)}
        />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {isSelf ? (
          <>
            <button
              type="button"
              onClick={handleCollect}
              disabled={
                collect.isPending || occupancy.pendingEarningsCents <= 0
              }
              className="rounded-xl bg-amber-500 px-4 py-3 text-white disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              {t(msg`收钱（不召回）`)}
            </button>
            <button
              type="button"
              onClick={handleRecall}
              disabled={recall.isPending}
              className="rounded-xl bg-zinc-800 px-4 py-3 text-white disabled:bg-zinc-300"
            >
              {t(msg`召回车辆`)}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleTicket}
              disabled={
                ticket.isPending ||
                occupancy.warningLevel < 1 ||
                occupancy.warningLevel >= 2 ||
                occupancy.pendingEarningsCents <= 0
              }
              className="rounded-xl bg-orange-500 px-4 py-3 text-white disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              {occupancy.warningLevel >= 2
                ? t(msg`已开过罚单`)
                : occupancy.pendingEarningsCents <= 0
                  ? t(msg`暂无收益可罚`)
                  : t(msg`贴罚单（需 ≥ 警告）`)}
            </button>
            <button
              type="button"
              onClick={handleTow}
              disabled={tow.isPending || occupancy.warningLevel < 3}
              className="rounded-xl bg-rose-600 px-4 py-3 text-white disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              {t(msg`拖车（需 ≥ 可拖车）`)}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-100 px-3 py-2">
      <div className="text-[length:var(--text-eyebrow)] text-zinc-500">{label}</div>
      <div className="text-sm font-medium text-zinc-800">{value}</div>
    </div>
  );
}

// ============================================================
// 选车面板（停哪辆？）
// ============================================================

function CarPickerSheet({
  state,
  slotIndex,
  characterId,
  onClose,
  onToast,
}: {
  state: ParkingWarPlayerStateView;
  slotIndex: number;
  characterId: string | undefined;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const park = useParkParkingWarCar();
  // 用 state.serverNowMs 而不是 Date.now()：客户端时钟漂移时
  // 本应可用的车会被错判成"还在冷却"，picker 直接显示空
  const idleCars = state.ownedCars.filter(
    (c) =>
      !c.parkedRef &&
      (c.unavailableUntilMs == null || c.unavailableUntilMs < state.serverNowMs),
  );
  const handlePick = async (car: ParkingWarOwnedCar) => {
    try {
      await park.mutateAsync({
        carId: car.carId,
        slotIndex,
        characterId,
      });
      onToast(
        characterId
          ? t(msg`已停进邻居家 #${slotIndex + 1}`)
          : t(msg`已停在 #${slotIndex + 1}`),
      );
      onClose();
    } catch (e) {
      onToast(parseError(e));
    }
  };
  return (
    <BottomSheet onClose={onClose}>
      <div className="mb-3 text-base font-semibold text-zinc-900">
        {characterId
          ? t(msg`挑一辆车停过去`)
          : t(msg`挑一辆车停 #${slotIndex + 1}`)}
      </div>
      {idleCars.length === 0 ? (
        <p className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-500">
          {t(msg`车库里没有闲置车（被外出 / 冷却中）。先收回一辆。`)}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {idleCars.map((car) => (
            <button
              key={car.carId}
              type="button"
              onClick={() => handlePick(car)}
              disabled={park.isPending}
              className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-zinc-200 hover:ring-amber-400 disabled:opacity-60"
            >
              <CarSprite
                tier={car.tier}
                rarity={car.rarity}
                size={36}
                paintIndex={car.paintIndex}
              />
              <div className="flex-1 text-left">
                <div className="text-xs text-zinc-700">
                  {TIER_DISPLAY[car.tier].name}
                </div>
                <div className="text-[10px] text-zinc-400">
                  {RARITY_DISPLAY[car.rarity].name} · L{car.level}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

// ============================================================
// NEIGHBORS TAB
// ============================================================

function NeighborsTab({
  state,
  onToast,
}: {
  state: ParkingWarPlayerStateView;
  onToast: (m: string) => void;
}) {
  const { data: neighbors, isLoading } = useParkingWarNeighbors({ limit: 50 });
  const [openCharId, setOpenCharId] = useState<string | null>(null);

  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-xs text-zinc-500">
        {t(msg`点谁的车场，把你的车停过去开始挂机`)}
      </p>
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {(neighbors ?? []).map((n) => (
          <NeighborRow
            key={n.characterId}
            n={n}
            onTap={() => setOpenCharId(n.characterId)}
          />
        ))}
        {!isLoading && (neighbors ?? []).length === 0 && (
          <p className="rounded-xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">
            {t(msg`你的 world 里还没有可访问的角色 —— 添加些 contacts 再回来。`)}
          </p>
        )}
      </div>
      {openCharId && (
        <NeighborDetailSheet
          characterId={openCharId}
          state={state}
          onClose={() => setOpenCharId(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function NeighborRow({
  n,
  onTap,
}: {
  n: ParkingWarNeighborSummary;
  onTap: () => void;
}) {
  const surface = SURFACE_DISPLAY[n.lotSurface];
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200 hover:ring-amber-400"
    >
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-zinc-200">
        {n.characterAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={n.characterAvatar}
            alt={n.characterName}
            className="h-full w-full object-cover"
          />
        ) : (
          <Users className="h-5 w-5 text-zinc-500" />
        )}
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          {n.characterName}
          {n.isOnline && (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[length:var(--text-eyebrow)] text-zinc-500">
          <span className={cn("rounded-full px-2", surface.bgClass)}>
            {surface.name}
          </span>
          <span>
            {t(msg`空 ${n.emptySlotCount}/${n.lotSize}`)}
          </span>
          <span>{t(msg`亲密度 ${n.intimacyLevel}`)}</span>
        </div>
      </div>
      <ChevronLeft className="h-4 w-4 rotate-180 text-zinc-400" />
    </button>
  );
}

function NeighborDetailSheet({
  characterId,
  state,
  onClose,
  onToast,
}: {
  characterId: string;
  state: ParkingWarPlayerStateView;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const { data: detail, isLoading } =
    useParkingWarNeighborDetail(characterId);
  const [parkSlot, setParkSlot] = useState<number | null>(null);

  return (
    <BottomSheet onClose={onClose}>
      {isLoading || !detail ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full bg-zinc-200">
              {detail.characterAvatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.characterAvatar}
                  alt={detail.characterName}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex-1">
              <div className="text-base font-semibold text-zinc-900">
                {detail.characterName}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {SURFACE_DISPLAY[detail.lotSurface].name} ·{" "}
                {t(msg`车位 ${detail.homeOccupancies.length} / ${detail.lotSize}`)}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {detail.homeSlots.map((slot) => {
              const occ =
                detail.homeOccupancies.find(
                  (o) => o.slotIndex === slot.index,
                ) ?? null;
              return (
                <button
                  key={slot.index}
                  type="button"
                  disabled={!!occ}
                  onClick={() => setParkSlot(slot.index)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-lg ring-1",
                    occ
                      ? "bg-zinc-100 ring-zinc-200"
                      : "bg-white ring-emerald-300 hover:bg-emerald-50",
                  )}
                >
                  {occ ? (
                    <CarSprite
                      tier={occ.carTier}
                      rarity={occ.carRarity}
                      size={32}
                    />
                  ) : (
                    <span className="text-2xl text-emerald-500">+</span>
                  )}
                  <span className="mt-1 text-[10px] text-zinc-400">
                    #{slot.index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {parkSlot != null && (
        <CarPickerSheet
          state={state}
          slotIndex={parkSlot}
          characterId={characterId}
          onClose={() => {
            setParkSlot(null);
            onClose();
          }}
          onToast={onToast}
        />
      )}
    </BottomSheet>
  );
}

// ============================================================
// GARAGE TAB
// ============================================================

function GarageTab({
  state,
  onToast,
}: {
  state: ParkingWarPlayerStateView;
  onToast: (m: string) => void;
}) {
  const upgradeCar = useUpgradeParkingWarCar();
  const paintCar = usePaintParkingWarCar();
  const repairCar = useRepairParkingWarCar();
  const buyCar = useBuyParkingWarCar();
  const upgradeLot = useUpgradeParkingWarLot();
  const upgradeGarage = useUpgradeParkingWarGarage();

  const handle = async (
    fn: () => Promise<unknown>,
    msgText: string,
  ) => {
    try {
      await fn();
      onToast(msgText);
    } catch (e) {
      onToast(parseError(e));
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <SectionTitle title={t(msg`我的车（${state.ownedCars.length}/${state.garageSlots}）`)} />
        <div className="grid grid-cols-2 gap-2">
          {state.ownedCars.map((car) => (
            <div
              key={car.carId}
              className={cn(
                "flex flex-col gap-2 rounded-xl bg-white p-2 ring-1",
                RARITY_DISPLAY[car.rarity].ringClass,
              )}
            >
              <div className="flex items-center gap-2">
                <CarSprite
                  tier={car.tier}
                  rarity={car.rarity}
                  size={40}
                  paintIndex={car.paintIndex}
                />
                <div className="flex-1">
                  <div className="text-xs font-medium text-zinc-800">
                    {TIER_DISPLAY[car.tier].name}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {RARITY_DISPLAY[car.rarity].name} · L{car.level}
                  </div>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className={cn(
                    "h-full",
                    car.durability >= 60
                      ? "bg-emerald-500"
                      : car.durability >= 30
                        ? "bg-amber-500"
                        : "bg-rose-500",
                  )}
                  style={{ width: `${car.durability}%` }}
                />
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    handle(
                      () =>
                        upgradeCar.mutateAsync({ carId: car.carId }),
                      t(msg`升级成功`),
                    )
                  }
                  className="flex-1 rounded-md bg-zinc-100 px-2 py-1 text-[10px] text-zinc-700"
                >
                  {t(msg`升级`)}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handle(
                      () =>
                        paintCar.mutateAsync({
                          carId: car.carId,
                          paintIndex: (car.paintIndex + 1) % PAINT_COLORS.length,
                        }),
                      t(msg`已换色`),
                    )
                  }
                  className="rounded-md bg-zinc-100 px-2 py-1 text-[10px]"
                  aria-label={t(msg`换色`)}
                >
                  <Palette className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handle(
                      () => repairCar.mutateAsync({ carId: car.carId }),
                      t(msg`已修复`),
                    )
                  }
                  className="rounded-md bg-zinc-100 px-2 py-1 text-[10px]"
                  aria-label={t(msg`维修`)}
                >
                  <Wrench className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title={t(msg`车场升级`)} />
        <div className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
          <div className="flex flex-wrap gap-2">
            {[4, 6, 8, 12].map((size) => (
              <button
                key={size}
                type="button"
                disabled={size <= state.lotSize}
                onClick={() =>
                  handle(
                    () =>
                      upgradeLot.mutateAsync({ target: "size", value: size }),
                    t(msg`车位扩到 ${size}`),
                  )
                }
                className={cn(
                  "rounded-full px-3 py-1 text-xs ring-1",
                  size === state.lotSize
                    ? "bg-amber-100 text-amber-700 ring-amber-300"
                    : size < state.lotSize
                      ? "bg-zinc-100 text-zinc-400 ring-zinc-200"
                      : "bg-white text-zinc-700 ring-zinc-300 hover:bg-amber-50",
                )}
              >
                {t(msg`${size} 车位`)}
              </button>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["concrete", "grass", "asphalt", "vip"] as ParkingWarLotSurface[]).map(
              (sf) => (
                <button
                  key={sf}
                  type="button"
                  disabled={sf === state.lotSurface}
                  onClick={() =>
                    handle(
                      () =>
                        upgradeLot.mutateAsync({
                          target: "surface",
                          value: sf,
                        }),
                      t(msg`已切到 ${SURFACE_DISPLAY[sf].name}`),
                    )
                  }
                  className={cn(
                    "rounded-full px-3 py-1 text-xs ring-1",
                    sf === state.lotSurface
                      ? "bg-amber-100 text-amber-700 ring-amber-300"
                      : "bg-white text-zinc-700 ring-zinc-300 hover:bg-amber-50",
                  )}
                >
                  {SURFACE_DISPLAY[sf].name}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() =>
              handle(
                () => upgradeGarage.mutateAsync(),
                t(msg`车库 +1`),
              )
            }
            className="mt-1 self-start rounded-full bg-zinc-800 px-4 py-1.5 text-xs text-white disabled:bg-zinc-300"
          >
            {t(msg`车库扩容（当前 ${state.garageSlots}）`)}
          </button>
        </div>
      </section>

      <section>
        <SectionTitle title={t(msg`买车`)} />
        <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
          {TIER_ORDER.filter((t) => t !== "starter").map((tier) => (
            <div key={tier} className="flex items-center gap-2">
              <CarSprite tier={tier} rarity="common" size={28} />
              <span className="flex-1 text-xs text-zinc-700">
                {TIER_DISPLAY[tier].name}
              </span>
              {RARITY_ORDER.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    handle(
                      () => buyCar.mutateAsync({ tier, rarity: r }),
                      t(msg`已购入 ${TIER_DISPLAY[tier].name}（${RARITY_DISPLAY[r].name}）`),
                    )
                  }
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] ring-1",
                    RARITY_DISPLAY[r].badgeClass,
                  )}
                >
                  {RARITY_DISPLAY[r].name}
                </button>
              ))}
            </div>
          ))}
          <p className="mt-1 text-[10px] text-zinc-400">
            {t(msg`价格 = 档位 × 稀有度倍率（服务端计算）`)}
          </p>
        </div>
      </section>
    </div>
  );
}

// ============================================================
// RANK TAB（榜单 + 日常任务 + 事件流）
// ============================================================

function RankTab({
  state,
  onToast,
}: {
  state: ParkingWarPlayerStateView;
  onToast: (m: string) => void;
}) {
  // global / friends 是同一份数据：每个 world 的 DB 只有 1 个玩家，
  // 切换 scope 行数一模一样。早期是给跨 world 榜单留位，cloud-api
  // 跨 world 榜单还没接，先去掉 toggle 避免误导。
  const { data: board } = useParkingWarLeaderboard({ scope: "friends" });
  const { data: events } = useParkingWarEvents({ limit: 30 });
  const claimTask = useClaimParkingWarDailyTask();
  const handleClaim = async (taskId: string) => {
    try {
      await claimTask.mutateAsync({ taskId });
      onToast(t(msg`领奖成功`));
    } catch (e) {
      onToast(parseError(e));
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <SectionTitle title={t(msg`财富榜`)} />
        <ol className="space-y-1 rounded-xl bg-white p-2 ring-1 ring-zinc-200">
          {(board ?? []).map((row) => {
            const isMe =
              row.actorKind === "player" && row.actorId === state.ownerId;
            return (
              <li
                key={`${row.actorKind}:${row.actorId}`}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5",
                  isMe && "bg-amber-50 ring-1 ring-amber-200",
                )}
              >
                <span
                  className={cn(
                    "w-6 text-center text-xs font-semibold",
                    row.rank === 1 && "text-amber-500",
                    row.rank === 2 && "text-zinc-400",
                    row.rank === 3 && "text-orange-500",
                  )}
                >
                  {row.rank}
                </span>
                <div className="flex-1 truncate text-sm text-zinc-800">
                  {isMe ? t(msg`我`) : row.actorName}
                </div>
                <span className="text-xs text-amber-700">
                  {formatYuan(row.balanceCents)}
                </span>
              </li>
            );
          })}
          {(board ?? []).length === 0 && (
            <p className="px-2 py-3 text-xs text-zinc-400">
              {t(msg`榜单加载中...`)}
            </p>
          )}
        </ol>
      </section>

      <section>
        <SectionTitle title={t(msg`每日任务`)} icon={ListChecks} />
        <div className="space-y-2 rounded-xl bg-white p-2 ring-1 ring-zinc-200">
          {state.dailyTasks.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-400">
              {t(msg`今日任务即将刷新`)}
            </p>
          ) : (
            state.dailyTasks.map((task) => {
              const done = task.progress >= task.goal;
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 px-2 py-1.5"
                >
                  <div className="flex-1">
                    <div className="text-xs text-zinc-700">
                      {dailyTaskLabel(task.id)}
                    </div>
                    <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${Math.min(100, (task.progress / Math.max(1, task.goal)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {task.progress}/{task.goal} · {formatYuan(task.rewardCents)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!done || task.claimed}
                    onClick={() => handleClaim(task.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[10px]",
                      task.claimed
                        ? "bg-zinc-100 text-zinc-400"
                        : done
                          ? "bg-emerald-500 text-white"
                          : "bg-zinc-100 text-zinc-400",
                    )}
                  >
                    {task.claimed
                      ? t(msg`已领`)
                      : done
                        ? t(msg`领奖`)
                        : t(msg`未达成`)}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section>
        <SectionTitle title={t(msg`事件`)} icon={History} />
        <ul className="space-y-1 rounded-xl bg-white p-2 ring-1 ring-zinc-200">
          {(events ?? []).slice(0, 20).map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-600"
            >
              <span className="w-14 text-[10px] text-zinc-400">
                {formatRelative(Date.parse(e.createdAt), state.serverNowMs)}
              </span>
              <span className="flex-1 truncate">{renderEventLabel(e)}</span>
              {typeof e.amountCents === "number" && e.amountCents !== 0 && (
                <span
                  className={cn(
                    "text-[length:var(--text-eyebrow)]",
                    e.amountCents > 0 ? "text-amber-700" : "text-rose-600",
                  )}
                >
                  {e.amountCents > 0 ? "+" : ""}
                  {formatYuan(e.amountCents)}
                </span>
              )}
            </li>
          ))}
          {(events ?? []).length === 0 && (
            <p className="px-2 py-3 text-xs text-zinc-400">
              {t(msg`暂时还没有事件`)}
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}

// ============================================================
// 通用组件
// ============================================================

function SectionTitle({
  title,
  icon: Icon = Gauge,
}: {
  title: string;
  icon?: typeof LayoutGrid;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
      <Icon className="h-3.5 w-3.5" />
      {title}
    </div>
  );
}

function BottomSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-zinc-200" />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 hover:bg-zinc-100"
          aria-label={t(msg`关闭`)}
        >
          <X className="h-4 w-4 text-zinc-500" />
        </button>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// helpers
// ============================================================

function parseError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return t(msg`操作失败`);
}

function dailyTaskLabel(id: string): string {
  switch (id) {
    case "park_neighbor_3":
      return t(msg`今日停 3 次邻居车场`);
    case "ticket_2":
      return t(msg`今日贴 2 张罚单`);
    case "collect_cents_2000":
      return t(msg`今日累计收益 ¥20`);
    default:
      return id;
  }
}

function renderEventLabel(e: {
  kind: string;
  actorName: string;
  targetName?: string | null;
  payload?: Record<string, unknown> | null;
}): string {
  const tgt = e.targetName ?? "";
  switch (e.kind) {
    case "park":
      return e.payload?.atHome
        ? t(msg`${e.actorName} 停了一辆自家车`)
        : t(msg`${e.actorName} 停进了 ${tgt} 的车场`);
    case "recall":
      return t(msg`${e.actorName} 召回了一辆车`);
    case "collect":
      return t(msg`${e.actorName} 收了一波钱`);
    case "ticket":
      return t(msg`${e.actorName} 给 ${tgt} 贴了张罚单`);
    case "tow":
      return t(msg`${e.actorName} 把 ${tgt} 的车拖走了`);
    case "buy_car":
      return t(msg`${e.actorName} 提了一辆新车`);
    case "upgrade_car":
      return t(msg`${e.actorName} 给爱车升级`);
    case "upgrade_lot":
      return t(msg`${e.actorName} 升级了车场`);
    case "daily_bonus":
      return t(msg`${e.actorName} 完成了今日签到`);
    case "task_claim":
      return t(msg`${e.actorName} 领取了任务奖励`);
    case "npc_visit":
      return t(msg`${e.actorName} 把车停进了你车场`);
    default:
      return `${e.actorName} · ${e.kind}`;
  }
}
