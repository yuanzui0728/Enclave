import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { FARM_CROP_CATALOG, type FarmCropId } from "@yinjie/contracts";

const t = translateRuntimeMessage;
import { FarmClockProvider, useSetFarmServerNow } from "./farm-clock-context";
import { useFarmState } from "./use-farm-state";
import { CheckinSheet } from "./components/checkin-sheet";
import { CoinDisplay } from "./components/coin-display";
import { DecorationLayer } from "./components/decoration-layer";
import { DogHouse } from "./components/dog-house";
import { EventLogPanel } from "./components/event-log-panel";
import { FarmNotificationBanner } from "./components/farm-notification-banner";
import { LeaderboardSheet } from "./components/leaderboard-sheet";
import { QuestSheet } from "./components/quest-sheet";
import { isFarmSfxMuted, setFarmSfxMuted } from "./audio/farm-sfx";
import { FarmIsoGrid } from "./components/farm-iso-grid";
import { FarmMascot } from "./components/farm-mascot";
import { FarmSky } from "./components/farm-sky";
import { NeighborFarmModal } from "./components/neighbor-farm-modal";
import { NeighborListPanel } from "./components/neighbor-list-panel";
import { PlotActionBar, type PlotPulseKind } from "./components/plot-action-bar";
import { SeedShopSheet } from "./components/seed-shop-sheet";
import { WarehouseSheet } from "./components/warehouse-sheet";

export function FarmPage() {
  return (
    <FarmClockProvider>
      <FarmPageInner />
    </FarmClockProvider>
  );
}

interface HarvestToast {
  cropId: FarmCropId;
  amount: number;
  coinsGained: number;
  leveledUp: boolean;
  expiresAt: number;
}

function FarmPageInner() {
  const stateQuery = useFarmState();
  const setServerNowMs = useSetFarmServerNow();
  // farm 是独立路由，被 /discover/games 或 /tabs/games 拉起。
  // 若调用方传了 returnPath（如 /discover/games），点 返回 就回到那里；
  // 否则默认回 /tabs/games（游戏中心）——这样 /discover/games → farm → 返回
  // 不会再走 /tabs/games 中转，避免 history.back 死循环回到 farm。
  const navigate = useNavigate();
  const locationSearch = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const customReturnTarget = useMemo(() => {
    const search = locationSearch ?? "";
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    const ret = params.get("returnPath")?.trim();
    if (!ret || !ret.startsWith("/")) {
      return null;
    }
    const retHash = params.get("returnHash")?.trim();
    return { path: ret, hash: retHash || undefined };
  }, [locationSearch]);
  const [selectedPlotIndex, setSelectedPlotIndex] = useState<number | null>(null);
  const [seedShopOpen, setSeedShopOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [activeNeighborId, setActiveNeighborId] = useState<string | null>(null);
  const [sfxMuted, setSfxMuted] = useState(() => isFarmSfxMuted());
  const [toast, setToast] = useState<HarvestToast | null>(null);
  const [pulse, setPulse] = useState<{
    plotIndex: number;
    kind: PlotPulseKind;
    tick: number;
  } | null>(null);

  const triggerPulse = (plotIndex: number, kind: PlotPulseKind) => {
    setPulse({ plotIndex, kind, tick: Date.now() });
    window.setTimeout(() => {
      setPulse((curr) =>
        curr && curr.plotIndex === plotIndex && curr.kind === kind ? null : curr,
      );
    }, 1300);
  };

  useEffect(() => {
    if (stateQuery.data?.serverNowMs) {
      setServerNowMs(stateQuery.data.serverNowMs);
    }
  }, [stateQuery.data?.serverNowMs, setServerNowMs]);

  useEffect(() => {
    if (!toast) return;
    const remaining = toast.expiresAt - Date.now();
    if (remaining <= 0) {
      setToast(null);
      return;
    }
    const timer = window.setTimeout(() => setToast(null), remaining);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (stateQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-stone-500">
        {t(msg`正在准备隐界农场……`)}
      </div>
    );
  }

  if (stateQuery.error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-sm text-rose-600">
        <span>{t(msg`农场加载失败`)}</span>
        <span className="text-xs text-stone-500">
          {(stateQuery.error as Error).message}
        </span>
      </div>
    );
  }

  const state = stateQuery.data!;
  const warehouseTotal = Object.values(state.warehouse).reduce(
    (acc, n) => acc + n,
    0,
  );
  const seedBagTotal = Object.values(state.seedBag).reduce(
    (acc, n) => acc + n,
    0,
  );

  const harvestHandler = (info: {
    cropId: FarmCropId;
    amount: number;
    coinsGained: number;
    leveledUp: boolean;
  }) => {
    setToast({
      ...info,
      expiresAt: Date.now() + 3500,
    });
    setSelectedPlotIndex(null);
  };

  return (
    <FarmSky>
      <div
        className="mx-auto flex max-w-6xl flex-col gap-3 p-4 text-stone-800"
        style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))" }}
      >
        <header className="flex items-center justify-between">
          {customReturnTarget ? (
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: customReturnTarget.path,
                  hash: customReturnTarget.hash,
                })
              }
              className="rounded-full px-2 py-1 text-xs text-stone-500 hover:bg-white/60"
            >
              ← {t(msg`返回`)}
            </button>
          ) : (
            <Link
              to="/tabs/games"
              search={{ game: "yinjie-farm" }}
              className="rounded-full px-2 py-1 text-xs text-stone-500 hover:bg-white/60"
            >
              ← {t(msg`返回`)}
            </Link>
          )}
          <h1 className="flex-1 text-center text-lg font-semibold text-emerald-900">
            {t(msg`隐界农场`)}
          </h1>
          <button
            type="button"
            onClick={() => {
              const next = !sfxMuted;
              setSfxMuted(next);
              setFarmSfxMuted(next);
            }}
            title={sfxMuted ? t(msg`点开音效`) : t(msg`关掉音效`)}
            className="w-12 rounded-full px-2 py-1 text-base text-stone-500 hover:bg-white/60"
          >
            {sfxMuted ? "🔇" : "🔊"}
          </button>
        </header>

        <CoinDisplay state={state} />
        <FarmNotificationBanner state={state} />

        <div className="grid gap-3 lg:grid-cols-3">
          <aside className="flex flex-col gap-3 lg:order-1">
            <button
              type="button"
              onClick={() => setSeedShopOpen(true)}
              className="rounded-2xl border border-white/60 bg-white/75 px-3 py-2 text-left text-xs shadow-md backdrop-blur-md transition hover:bg-emerald-50/85"
            >
              <div className="font-medium text-emerald-700">🛒 {t(msg`种子店`)}</div>
              <div className="mt-0.5 text-stone-500">
                {t(msg`种子袋共`)} {seedBagTotal} {t(msg`包`)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setWarehouseOpen(true)}
              className="rounded-2xl border border-white/60 bg-white/75 px-3 py-2 text-left text-xs shadow-md backdrop-blur-md transition hover:bg-amber-50/85"
            >
              <div className="font-medium text-amber-700">🏠 {t(msg`仓库`)}</div>
              <div className="mt-0.5 text-stone-500">
                {t(msg`存货共`)} {warehouseTotal} {t(msg`个`)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardOpen(true)}
              className="rounded-2xl border border-white/60 bg-white/75 px-3 py-2 text-left text-xs shadow-md backdrop-blur-md transition hover:bg-rose-50/85"
            >
              <div className="font-medium text-rose-700">🏆 {t(msg`排行榜`)}</div>
              <div className="mt-0.5 text-stone-500">
                {t(msg`和邻居比一比`)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setCheckinOpen(true)}
              className="rounded-2xl border border-white/60 bg-white/75 px-3 py-2 text-left text-xs shadow-md backdrop-blur-md transition hover:bg-amber-50/85"
            >
              <div className="font-medium text-amber-800">📅 {t(msg`每日签到`)}</div>
              <div className="mt-0.5 text-stone-500">
                {t(msg`连签 7 天有大礼`)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setQuestsOpen(true)}
              className="rounded-2xl border border-white/60 bg-white/75 px-3 py-2 text-left text-xs shadow-md backdrop-blur-md transition hover:bg-sky-50/85"
            >
              <div className="font-medium text-sky-700">📋 {t(msg`任务`)}</div>
              <div className="mt-0.5 text-stone-500">
                {t(msg`日常 + 成就`)}
              </div>
            </button>
            <DogHouse state={state} />
            <p className="hidden rounded-2xl border border-white/60 bg-white/55 p-3 text-[11px] leading-relaxed text-stone-600 shadow-sm backdrop-blur-md lg:block">
              {t(msg`作物按真实小时数成熟。下线时世界角色仍在自己的田里忙活——回来时看到的状态是世界自治后的结果。`)}
            </p>
          </aside>

          <section className="flex flex-col gap-3 lg:order-2 lg:col-span-1">
            <div className="rounded-2xl bg-white/70 p-2 shadow-sm backdrop-blur-sm">
              <FarmIsoGrid
                plots={state.plots}
                selectedIndex={selectedPlotIndex}
                pulse={pulse}
                onSelect={(i) =>
                  setSelectedPlotIndex((curr) => (curr === i ? null : i))
                }
              />
            </div>
            <PlotActionBar
              state={state}
              plotIndex={selectedPlotIndex}
              onHarvested={harvestHandler}
              onPulse={triggerPulse}
            />
          </section>

          <aside className="flex flex-col gap-3 lg:order-3">
            <NeighborListPanel onSelectNeighbor={setActiveNeighborId} />
            <EventLogPanel />
          </aside>
        </div>

        <p className="text-center text-[10px] text-stone-400 lg:hidden">
          {t(msg`作物按真实小时数成熟。下线时世界角色仍在自己的田里忙活。`)}
        </p>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-700 px-4 py-2 text-sm text-white shadow-lg"
          style={{
            bottom:
              "max(5rem, calc(1.25rem + env(safe-area-inset-bottom, 0px)))",
          }}
        >
          {t(msg`收获`)} {FARM_CROP_CATALOG[toast.cropId].nameZh} ×{toast.amount} ·
          🪙+{toast.coinsGained}
          {toast.leveledUp && ` · ${t(msg`升级！`)}`}
        </div>
      )}

      <DecorationLayer placements={state.placedDecorations ?? []} />

      <SeedShopSheet
        state={state}
        open={seedShopOpen}
        onClose={() => setSeedShopOpen(false)}
      />
      <WarehouseSheet
        state={state}
        open={warehouseOpen}
        onClose={() => setWarehouseOpen(false)}
      />
      <LeaderboardSheet
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
      />
      <CheckinSheet open={checkinOpen} onClose={() => setCheckinOpen(false)} />
      <QuestSheet open={questsOpen} onClose={() => setQuestsOpen(false)} />
      <NeighborFarmModal
        characterId={activeNeighborId}
        onClose={() => setActiveNeighborId(null)}
      />
      <FarmMascot state={state} />
    </FarmSky>
  );
}
